import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createClient } from '../packages/binance/client.ts';
import { parseFundingInfo, parseBookTickers, parseContracts, parseKlines, parsePremium, parseTickers } from '../packages/binance/parse.ts';
import { analyze, type Analysis } from '../packages/core/analyze.ts';
import { marketRegime, circuitBreaker } from '../packages/core/regime.ts';
import { CONFIG, COMMON } from '../packages/core/config.ts';
import type { MacroEvent } from '../packages/core/events.ts';
import { parseScanArgs, type ScanArgs } from './args.ts';
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
const breaker = circuitBreaker(btcHourly, cfg.breakerPauseHours);

let universe = [...contracts].sort((a, b) => (ranks.get(a.symbol) ?? 1) - (ranks.get(b.symbol) ?? 1));
if (mode === 'fast') universe = universe.slice(0, COMMON.fastUniverseSize);
if (args.limit !== null) universe = universe.slice(0, args.limit);

const results: Analysis[] = [];
const errors: Array<{ symbol: string; error: string }> = [];
let banned = false;
for (const c of universe) {
  try {
    const trend = await kl(c.symbol, cfg.trendInterval, cfg.trendLimit);
    const entry = await kl(c.symbol, cfg.entryInterval, cfg.entryLimit);
    const daily = mode === 'swing' ? trend : await kl(c.symbol, '1d', 120);
    const hourly = mode === 'fast' ? trend.slice(-100) : await kl(c.symbol, '1h', 30);
    const book = books.get(c.symbol);
    const premium = premiums.get(c.symbol);
    if (!book || !premium) throw new Error('Thiếu bookTicker hoặc premiumIndex');
    const mid = (book.bid + book.ask) / 2;
    results.push(analyze({
      mode, contract: c, trend, entry, daily, hourly, btcTrend,
      regime: regime.regime, breakerTripped: breaker.tripped, breakerNote: breaker.reason ?? undefined,
      liquidityRankPct: ranks.get(c.symbol) ?? 1, spreadPct: ((book.ask - book.bid) / mid) * 100,
      premium, fundingIntervalHours: fundingHours.get(c.symbol) ?? COMMON.defaultFundingIntervalHours,
      fundingIntervalDefault: !fundingHours.has(c.symbol), now: new Date(now), events, capital, riskPct: cfg.defaultRiskPct,
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

console.log(`Vốn: ${capital} USDT | Rủi ro mặc định: ${cfg.defaultRiskPct}%/lệnh (coin rủi ro Cao/Rất cao và Lướt nhanh: tối đa ${COMMON.highRiskTierPct}%)`);
console.log(`Chế độ: ${mode} | Thị trường: ${regime.regime} (${regime.reasons.join('; ')})`);
console.log(`Cầu dao: ${breaker.tripped ? 'BẬT — ' + breaker.reason : 'tắt'}`);
console.log(`Hợp đồng: ${contracts.length} | Đã chấm: ${final.length} | Lỗi: ${errors.length} | Thời gian: ${((Date.now() - started) / 1000).toFixed(0)}s`);
console.log(`Đạt tiêu chí Long: ${count('Đạt tiêu chí Long')} | Đạt tiêu chí Short: ${count('Đạt tiêu chí Short')} | Theo dõi: ${count('Theo dõi')} | Không đạt: ${count('Không đạt')}`);
for (const side of ['long', 'short'] as const) {
  console.log(`\nTop 10 điểm ${side === 'long' ? 'Long' : 'Short'}:`);
  for (const a of top(side)) {
    const failed = a.gates.filter((g) => !g.pass).map((g) => g.code).join(',') || '—';
    console.log(`  ${a.symbol.padEnd(16)} ${String(a.best.score).padStart(5)}  ${a.label.padEnd(18)} rủi ro ${a.risk.tier.padEnd(7)} cổng trượt: ${failed}`);
  }
}

// In giá theo tickSize của hợp đồng: làm tròn đúng số chữ số thập phân của tickSize (không dính nhiễu số thực), dấu phẩy thập phân
const tickByCode = new Map(contracts.map((c) => [c.symbol, c.tickSize]));
function tickDecimals(tick: number): number {
  let d = 0;
  while (d < 12 && Math.abs(Math.round(tick * 10 ** d) / 10 ** d - tick) > 1e-12) d++;
  return d;
}
const priceText = (symbol: string, x: number): string => {
  const tick = tickByCode.get(symbol);
  if (tick === undefined) throw new Error(`Không có tickSize của ${symbol}`);
  return (Math.round(x / tick) * tick).toFixed(tickDecimals(tick)).replace('.', ',');
};
const num = (x: number, digits: number): string => x.toFixed(digits).replace('.', ',');

const qualified = final.filter((a) => a.label.startsWith('Đạt') && a.plan !== null);
console.log(`\nKế hoạch lệnh các hợp đồng Đạt tiêu chí (${qualified.length}):`);
for (const a of qualified) {
  const p = a.plan!;
  const px = (x: number) => priceText(a.symbol, x);
  console.log(`\n${a.symbol} — ${p.side === 'long' ? 'LONG' : 'SHORT'} | điểm ${a.best.score} | rủi ro ${a.risk.tier}`);
  console.log(p.entryType === 'market'
    ? `  Kiểu vào lệnh: VÀO TRỰC TIẾP — ${p.entryReason}`
    : `  Kiểu vào lệnh: ĐẶT LIMIT CHỜ HỒI về ${px(p.entry)}, hết hạn sau ${p.limitExpiryHours} giờ — ${p.entryReason}`);
  console.log(`  Giá hiện tại: ${px(p.marketPrice)} | Vùng giá vào: ${px(p.entryZone.low)}–${px(p.entryZone.high)} | Giá vào dùng để tính: ${px(p.entry)}`);
  console.log(`  SL: ${px(p.stop)} — ${p.stopReason}`);
  for (const t of p.targets) {
    console.log(t.price === null
      ? `  ${t.name}: chốt ${t.pct}% — trailing stop 3×ATR = ${px(p.trailAtr)} — ${t.reason}`
      : `  ${t.name}: ${px(t.price)} chốt ${t.pct}% | ${num(t.r!, 2)}R — ${t.reason}`);
  }
  console.log(`  Đạt TP1 → dời SL về giá vào ${px(p.afterTp1Stop)} (giữ nguyên sau TP2)`);
  console.log(`  Khối lượng: ${num(p.qty, 8).replace(/0+$/, '').replace(/,$/, '')} (≈ ${num(p.notional, 2)} USDT) | Đòn bẩy gợi ý: ${p.suggestedLeverage}x | Giá thanh lý ước tính: ${px(p.liquidationEstimate)}`);
  console.log(`  Tiền mất nếu chạm SL: ${num(p.riskAmount, 2)} USDT (${p.riskPct}% vốn)`);
}

if (errors.length) console.log(`\nLỗi (tối đa 10):\n${errors.slice(0, 10).map((e) => `  ${e.symbol}: ${e.error}`).join('\n')}`);

mkdirSync(new URL('../output/', import.meta.url), { recursive: true });
const file = new URL(`../output/scan-${mode}-${new Date(now).toISOString().replace(/[:.]/g, '-')}.json`, import.meta.url);
writeFileSync(file, JSON.stringify({ mode, capital, at: new Date(now).toISOString(), regime, breaker, errors, results: final }, null, 2));
console.log(`\nĐã ghi ${file.pathname}`);
if (banned) process.exitCode = 1;
