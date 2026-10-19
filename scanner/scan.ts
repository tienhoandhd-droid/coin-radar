import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createClient } from '../packages/binance/client.ts';
import { parseFundingInfo, parseBookTickers, parseContracts, parseKlines, parsePremium, parseTickers } from '../packages/binance/parse.ts';
import { analyze, contractRisk, type Analysis, type PatternData } from '../packages/core/analyze.ts';
import { marketRegime, circuitBreaker, btcSma200ReclaimedAt } from '../packages/core/regime.ts';
import { inPatternScope } from '../packages/core/gates.ts';
import { CONFIG, COMMON } from '../packages/core/config.ts';
import type { MacroEvent } from '../packages/core/events.ts';
import { parseScanArgs, type ScanArgs } from './args.ts';
import { planLines, patternPlanLines, trackedLines } from './plan-print.ts';
import { liquidityRanks, applyTopRank } from './rank.ts';

const { values } = parseArgs({ options: {
  mode: { type: 'string', default: 'swing' },
  limit: { type: 'string' },
  capital: { type: 'string', default: '1000' },
} });
let args: ScanArgs;
try {
  args = parseScanArgs(values);
} catch (error) {
  console.error(`Lỗi tham số: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
const { mode, capital } = args;
const cfg = CONFIG[mode];

const started = Date.now();
const client = createClient({ fetch: (url) => fetch(url, { signal: AbortSignal.timeout(20_000) }) });
const now = Date.now();
const kl = async (symbol: string, interval: string, limit: number) =>
  parseKlines(await client.get(`/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`), now);

const events = (JSON.parse(readFileSync(new URL('../data/events/events.json', import.meta.url), 'utf8')) as { events: MacroEvent[] }).events;
const contracts = parseContracts(await client.get('/fapi/v1/exchangeInfo'));
const tickers = parseTickers(await client.get('/fapi/v1/ticker/24hr'));
const books = new Map(parseBookTickers(await client.get('/fapi/v1/ticker/bookTicker')).map((b) => [b.symbol, b]));
const premiums = new Map(parsePremium(await client.get('/fapi/v1/premiumIndex')).map((p) => [p.symbol, p]));
// Chu kỳ funding từng hợp đồng (1 lần/lần quét). Mã không có trong danh sách → mặc định 8h (theo tài liệu Binance).
const fundingHours = parseFundingInfo(await client.get('/fapi/v1/fundingInfo'));
const tradable = new Set(contracts.map((c) => c.symbol));
const ranks = liquidityRanks(tickers.filter((t) => tradable.has(t.symbol)));

const btcDaily = await kl('BTCUSDT', '1d', 400);
// Cầu dao xét lại mọi nến 1H trong thời gian dừng (tối đa 12h) + 20 nến khởi động → 100 nến là đủ
const btcHourly = await kl('BTCUSDT', '1h', 100);
const btcTrend = mode === 'swing' ? btcDaily : await kl('BTCUSDT', cfg.trendInterval, cfg.trendLimit);
const regime = marketRegime(btcDaily);
// Mô hình đảo chiều Short: cấm 30 ngày sau khi BTC lấy lại SMA200 ngày (P-G2 và kế hoạch lệnh mô hình)
const btcReclaim = btcSma200ReclaimedAt(btcDaily);
const FB = COMMON.patterns.fetchBars;
const breaker = circuitBreaker(btcHourly, cfg.breakerPauseHours);

let universe = [...contracts].sort((a, b) => (ranks.get(a.symbol) ?? 1) - (ranks.get(b.symbol) ?? 1));
if (mode === 'fast') universe = universe.slice(0, COMMON.fastUniverseSize);
if (args.limit !== null) universe = universe.slice(0, args.limit);

const results: Analysis[] = [];
const errors: Array<{ symbol: string; error: string }> = [];
let banned = false;
let inScope = 0;
for (const c of universe) {
  try {
    const trend = await kl(c.symbol, cfg.trendInterval, cfg.trendLimit);
    const entry = await kl(c.symbol, cfg.entryInterval, cfg.entryLimit);
    // Lướt nhanh: 1D tải 300 nến (cùng trọng số API với 120) để dùng luôn cho bối cảnh mô hình 1D
    const daily = mode === 'swing' ? trend : await kl(c.symbol, '1d', FB.d1);
    const rank = ranks.get(c.symbol) ?? 1;
    const lastEntry = entry[entry.length - 1];
    if (!lastEntry) throw new Error('Không có nến khung vào lệnh');
    // P-G1: biết trước hợp đồng có thuộc phạm vi mô hình không, để chỉ tải thêm nến cho hợp đồng trong phạm vi
    const scope = inPatternScope(contractRisk({ daily, price: lastEntry.close, contract: c, liquidityRankPct: rank, now: new Date(now) }).tier, rank);
    let patternData: PatternData | null = null;
    let hourly: typeof trend;
    if (scope.ok) {
      inScope++;
      if (mode === 'swing') {
        const c1h = await kl(c.symbol, '1h', FB.h1);
        patternData = { c4h: entry, c1d: trend, c1h, btcSma200ReclaimedAt: btcReclaim };
        hourly = c1h.slice(-30);
      } else {
        const c4h = await kl(c.symbol, '4h', FB.h4);
        patternData = { c4h, c1d: daily, c1h: trend, btcSma200ReclaimedAt: btcReclaim };
        hourly = trend.slice(-100);
      }
    } else {
      hourly = mode === 'fast' ? trend.slice(-100) : await kl(c.symbol, '1h', 30);
    }
    const book = books.get(c.symbol);
    const premium = premiums.get(c.symbol);
    if (!book || !premium) throw new Error('Thiếu bookTicker hoặc premiumIndex');
    const mid = (book.bid + book.ask) / 2;
    results.push(analyze({
      mode, contract: c, trend, entry, daily, hourly, btcTrend,
      regime: regime.regime, breakerTripped: breaker.tripped, breakerNote: breaker.reason ?? undefined,
      liquidityRankPct: rank, spreadPct: ((book.ask - book.bid) / mid) * 100,
      premium, fundingIntervalHours: fundingHours.get(c.symbol) ?? COMMON.defaultFundingIntervalHours,
      fundingIntervalDefault: !fundingHours.has(c.symbol), now: new Date(now), events, capital, riskPct: cfg.defaultRiskPct,
      patternData,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push({ symbol: c.symbol, error: message });
    if (/HTTP (418|429)|đang chặn tạm thời/.test(message)) {
      banned = true;
      console.error(`\nBinance chặn tạm thời (HTTP 418/429) khi quét ${c.symbol}: ${message}\nDỪNG quét, không gọi tiếp. Ghi kết quả đã có.`);
      break;
    }
  }
}

const final = applyTopRank(results, ranks);
const count = (label: string) => final.filter((a) => a.label === label).length;
const top = (side: 'long' | 'short') => final
  .filter((a) => a.best.side === side)
  .sort((a, b) => b.best.score - a.best.score)
  .slice(0, 10);

mkdirSync(new URL('../output/', import.meta.url), { recursive: true });
const file = new URL(`../output/scan-${mode}-${new Date(now).toISOString().replace(/[:.]/g, '-')}.json`, import.meta.url);
writeFileSync(file, JSON.stringify({ mode, capital, at: new Date(now).toISOString(), regime, breaker, errors, results: final }, null, 2));
console.log(`Vốn: ${capital} USDT | Rủi ro mặc định: ${cfg.defaultRiskPct}%/lệnh (coin rủi ro Cao/Rất cao và Lướt nhanh: tối đa ${COMMON.highRiskTierPct}%)`);
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
console.log(`\nKế hoạch lệnh các hợp đồng Đạt tiêu chí (${qualified.length}, trong đó theo mô hình: ${qualified.filter((a) => a.patternSignal !== null).length}):`);
for (const a of qualified) {
  const head = { symbol: a.symbol, score: a.best.score, riskTier: a.risk.tier };
  const lines = a.patternSignal !== null ? patternPlanLines(head, a.patternSignal, tickOf(a.symbol)) : planLines(head, a.plan!, tickOf(a.symbol));
  console.log('\n' + lines.join('\n'));
  const notes = a.flags.filter((f) => /cùng chiều|xung đột/.test(f));
  if (notes.length > 0) console.log(`  Ghi chú: ${notes.join('; ')}`);
}
const conflicts = final.filter((a) => a.flags.some((f) => f.startsWith('xung đột')));
if (conflicts.length > 0) {
  console.log(`\nXung đột tín hiệu (không phát lệnh): ${conflicts.map((a) => `${a.symbol}: ${a.flags.filter((f) => f.startsWith('xung đột')).join('; ')}`).join(' | ')}`);
}

if (errors.length) console.log(`\nLỗi (tối đa 10):\n${errors.slice(0, 10).map((e) => `  ${e.symbol}: ${e.error}`).join('\n')}`);

console.log(`\nĐã ghi ${file.pathname}`);
if (banned) process.exitCode = 1;
