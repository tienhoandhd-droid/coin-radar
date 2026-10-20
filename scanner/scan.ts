import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createClient } from '../packages/binance/client.ts';
import { parseFundingInfo, parseBookTickers, parseContracts, parseKlines, parsePremium, parseTickers } from '../packages/binance/parse.ts';
import { CONFIG, COMMON } from '../packages/core/config.ts';
import { validateConfig } from '../packages/core/config-validate.ts';
import { parseEvents, eventCalendarStatus } from '../packages/core/events.ts';
import { parseScanArgs, type ScanArgs } from './args.ts';
import { planLines, patternPlanLines, oldPatternSignalLine, trackedLines, gradedReportLines, portfolioLines, headerWarningLines, type GradedItem } from './plan-print.ts';
import { runScan } from './run-scan.ts';
import { createFundingMaxAbsLoader } from './funding-history.ts';

const { values } = parseArgs({ options: {
  mode: { type: 'string', default: 'swing' },
  limit: { type: 'string' },
  capital: { type: 'string', default: '1000' },
  'show-b': { type: 'boolean' },
  'show-old': { type: 'boolean' },
} });
let args: ScanArgs;
try {
  args = parseScanArgs({ mode: values.mode, capital: values.capital, limit: values.limit, showB: values['show-b'], showOld: values['show-old'] });
} catch (error) {
  console.error(`Lỗi tham số: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
const { mode, capital } = args;
const cfg = CONFIG[mode];
validateConfig(); // ràng buộc giữa các khóa cấu hình (vd. F1) — sai thì dừng trước khi gọi mạng

const started = Date.now();
const client = createClient({ fetch: (url) => fetch(url, { signal: AbortSignal.timeout(20_000) }) });
const now = Date.now();

// I/O ở đây; toàn bộ bước quét nằm trong runScan (dùng chung với phát lại/backtest)
const events = parseEvents(JSON.parse(readFileSync(new URL('../data/events/events.json', import.meta.url), 'utf8')));
const calendar = eventCalendarStatus(events, new Date(now));
const contracts = parseContracts(await client.get('/fapi/v1/exchangeInfo'));
const tickers = parseTickers(await client.get('/fapi/v1/ticker/24hr'));
const books = new Map(parseBookTickers(await client.get('/fapi/v1/ticker/bookTicker')).map((b) => [b.symbol, b]));
const premiums = new Map(parsePremium(await client.get('/fapi/v1/premiumIndex')).map((p) => [p.symbol, p]));
// Chu kỳ funding từng hợp đồng (1 lần/lần quét). Mã không có trong danh sách → mặc định 8h (theo tài liệu Binance).
const fundingIntervals = parseFundingInfo(await client.get('/fapi/v1/fundingInfo'));
const scan = await runScan({
  mode, contracts, tickers, books, premiums, fundingIntervals, now, events, capital, limit: args.limit, openTrades: [], prevSignals: new Map(),
  // Đệm funding đúng như planner: |funding| lớn nhất 30 ngày, tải cho mã Đạt tiêu chí (không tải được → mức thận trọng + ghi chú trên kế hoạch)
  fundingMaxAbsLoader: createFundingMaxAbsLoader({ get: client.get, now }),
  klines: async (symbol, interval, limit) => parseKlines(await client.get(`/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`), now),
});
const { regime, breaker, btcReclaim, errors, banned, inScope } = scan;
if (banned) {
  const last = errors[errors.length - 1]!;
  console.error(`\nBinance chặn tạm thời (HTTP 418/429) khi quét ${last.symbol}: ${last.error}\nDỪNG quét, không gọi tiếp. Ghi kết quả đã có.`);
}

const final = scan.results;
const count = (label: string) => final.filter((a) => a.label === label).length;
const top = (side: 'long' | 'short') => final
  .filter((a) => a.best.side === side)
  .sort((a, b) => b.best.score - a.best.score)
  .slice(0, 10);

mkdirSync(new URL('../output/', import.meta.url), { recursive: true });
const file = new URL(`../output/scan-${mode}-${new Date(now).toISOString().replace(/[:.]/g, '-')}.json`, import.meta.url);
writeFileSync(file, JSON.stringify({ mode, capital, at: new Date(now).toISOString(), regime, breaker, errors, results: final }, null, 2));
console.log(headerWarningLines(calendar).join('\n'));
for (const w of scan.warnings) console.log(`CẢNH BÁO: ${w}`);
console.log(`Vốn: ${capital} USDT | Rủi ro: ${COMMON.risk.perTradePct}% vốn/lệnh (người dùng chốt 19/10/2026; mức rủi ro coin chỉ để hiển thị) = ${(capital * COMMON.risk.perTradePct / 100).toFixed(2).replace('.', ',')} USDT | Trần ${COMMON.portfolio.maxOpenTrades} lệnh còn rủi ro (lệnh đã qua TP1 không tính), tổng rủi ro mở ≤ ${COMMON.portfolio.maxOpenRiskPct}%, ký quỹ ≤ ${COMMON.portfolio.marginSafetyFactor * 100}% vốn (máy quét không biết lệnh đang mở của anh: kiểm với danh mục trống) | Thoát lệnh: ${COMMON.exit.defaultPolicy}`);
console.log(`Chế độ: ${mode} | Thị trường: ${regime.regime} (${regime.reasons.join('; ')})`);
console.log(`Cầu dao: ${breaker.tripped ? 'BẬT — ' + breaker.reason : 'tắt'}`);
console.log(`Hợp đồng: ${contracts.length} | Đã chấm: ${final.length} | Lỗi: ${errors.length} | Thời gian: ${((Date.now() - started) / 1000).toFixed(0)}s`);
console.log(`Đạt tiêu chí Long: ${count('Đạt tiêu chí Long')} | Đạt tiêu chí Short: ${count('Đạt tiêu chí Short')} | Theo dõi: ${count('Theo dõi')} | Không đạt: ${count('Không đạt')}`);
console.log(`Mô hình biểu đồ: ${inScope} hợp đồng trong phạm vi P-G1 | mô hình đang theo dõi: ${final.reduce((n, a) => n + a.patterns.length, 0)} | tín hiệu mô hình: ${final.filter((a) => a.patternSignal !== null).length}${mode === 'fast' ? ' (Lướt nhanh: chỉ ghi nhận, không phát lệnh)' : ''} | BTC lấy lại SMA200 ngày: ${btcReclaim === null ? 'không thấy trong dữ liệu' : new Date(btcReclaim).toISOString().slice(0, 10)}`);
for (const side of ['long', 'short'] as const) {
  console.log(`\nTop 10 điểm ${side === 'long' ? 'Long' : 'Short'}:`);
  for (const a of top(side)) {
    const failed = a.gates.filter((g) => !g.pass).map((g) => g.code).join(',') || '—';
    console.log(`  ${a.symbol.padEnd(16)} ${String(a.best.score).padStart(5)}  ${a.label.padEnd(18)} rủi ro ${a.risk.tier.padEnd(7)} cổng trượt: ${failed}`);
    // Luật S/R xác nhận: in lý do của kế hoạch vùng (G-12) — vd. "Không có hỗ trợ rõ ràng (vùng mạnh ≥ 2) / chưa có nến xác nhận: …"
    const g12 = a.gates.find((g) => g.code === 'G-12');
    if (COMMON.entryRules.srConfirm && mode === 'swing' && g12 !== undefined && !g12.pass) console.log(`      S/R: ${g12.note}`);
  }
}

const tickByCode = new Map(contracts.map((c) => [c.symbol, c.tickSize]));
const tickOf = (symbol: string) => {
  const tick = tickByCode.get(symbol);
  if (tick === undefined) throw new Error(`Không có tickSize của ${symbol}`);
  return tick;
};
const scoped = final.filter((a) => a.patternScope.ok);
console.log(`\nMô hình đang theo dõi (${scoped.length} hợp đồng trong phạm vi P-G1: rủi ro Thấp/Vừa và thanh khoản nhóm cao):`);
for (const a of scoped) {
  const ctx = a.context?.notes.length ? a.context.notes.join('; ') : 'không có';
  console.log(`  ${a.symbol} — ${a.label} | rủi ro ${a.risk.tier} | bối cảnh: ${ctx}`);
  const lines = trackedLines(a.patterns, tickOf(a.symbol));
  console.log(lines.length > 0 ? lines.join('\n') : '    (không có mô hình đang theo dõi)');
}

const qualified = final.filter((a) => a.label.startsWith('Đạt') && (a.plan !== null || a.patternSignal !== null));
const gradeA = qualified.filter((a) => a.grade?.grade === 'A').length;
const oldSignals = qualified.filter((a) => a.patternSignal !== null && !a.patternSignal.fresh).length;
console.log(`\nKế hoạch lệnh các hợp đồng Đạt tiêu chí (${qualified.length}, trong đó theo mô hình: ${qualified.filter((a) => a.patternSignal !== null).length}, tín hiệu mô hình đã phát ở lần quét trước: ${oldSignals}) | Hạng A: ${gradeA} | Hạng B: ${qualified.length - gradeA}${args.showB ? ' | --show-b: in đủ Hạng B' : ''}${args.showOld ? ' | --show-old: in lại kế hoạch tín hiệu cũ' : ''}`);
const graded: GradedItem[] = qualified.map((a) => {
  if (a.grade === null) throw new Error(`${a.symbol}: tín hiệu Đạt tiêu chí nhưng chưa được chấm hạng`);
  const head = { symbol: a.symbol, score: a.best.score, riskTier: a.risk.tier };
  // Tín hiệu mô hình CŨ (không phát ở lần quét này): chỉ một dòng "đã phát lúc …", trừ khi --show-old
  const ps = a.patternSignal;
  const lines = ps !== null
    ? (ps.fresh || args.showOld ? patternPlanLines(head, ps, tickOf(a.symbol)) : [oldPatternSignalLine(head, ps)])
    : planLines({ ...head, signal: a.signal }, a.plan!, tickOf(a.symbol));
  if (a.portfolio !== null) lines.push(...portfolioLines(a.portfolio));
  const blocked = scan.entryBlocks.get(a.symbol);
  if (blocked !== undefined) lines.push(`  KHÔNG vào lệnh mới (luật vào lệnh Task 8): ${blocked}`);
  const notes = a.flags.filter((f) => /cùng chiều|xung đột|đệm funding/.test(f));
  if (notes.length > 0) lines.push(`  Ghi chú: ${notes.join('; ')}`);
  return { symbol: a.symbol, side: a.best.side, score: a.best.score, grade: a.grade, lines };
});
console.log('\n' + gradedReportLines(graded, args.showB).join('\n'));
const conflicts = final.filter((a) => a.flags.some((f) => f.startsWith('xung đột')));
if (conflicts.length > 0) {
  console.log(`\nXung đột tín hiệu (không phát lệnh): ${conflicts.map((a) => `${a.symbol}: ${a.flags.filter((f) => f.startsWith('xung đột')).join('; ')}`).join(' | ')}`);
}

if (errors.length) console.log(`\nLỗi (tối đa 10):\n${errors.slice(0, 10).map((e) => `  ${e.symbol}: ${e.error}`).join('\n')}`);

console.log(`\nĐã ghi ${file.pathname}`);
if (banned) process.exitCode = 1;
