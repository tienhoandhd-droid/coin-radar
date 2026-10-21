import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertBeforeCutoff, runBotReplay, windowMetrics, type FundingRow, type ReplayData } from './bot-replay.ts';
import type { Candle } from '../packages/core/types.ts';

// Chạy lại vòng đời bot THẬT (main.ts + paper.ts + journal.ts) trên dữ liệu tổng hợp — không mạng, không đọc tệp dữ liệu.
const H = 3_600_000;
const DAY = 24 * H;
const D0 = Date.UTC(2024, 0, 1);
const raw = {
  symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', contractType: 'PERPETUAL', status: 'TRADING', underlyingType: 'COIN', onboardDate: 0, deliveryDate: 4133894400000,
  filters: [
    { filterType: 'PRICE_FILTER', tickSize: '0.1' },
    { filterType: 'LOT_SIZE', stepSize: '0.001', minQty: '0.001', maxQty: '1000' },
    { filterType: 'MARKET_LOT_SIZE', stepSize: '0.001', minQty: '0.001', maxQty: '120' },
    { filterType: 'MIN_NOTIONAL', notional: '50' },
    { filterType: 'MAX_NUM_ORDERS', limit: '200' },
  ],
};
const bar = (i: number, o: number, c: number, lo = Math.min(o, c) * 0.99, hi = Math.max(o, c) * 1.01): Candle =>
  ({ openTime: D0 + i * DAY, closeTime: D0 + (i + 1) * DAY - 1, open: o, high: hi, low: lo, close: c, volume: 1, quoteVolume: 1, takerBuyQuote: 0 });
// Giá đóng theo ngày → nến 1D (giá mở = giá đóng hôm trước, biên ±1%); over: sửa từng nến
function series(closes: number[], over: Record<number, Partial<Candle>> = {}): Candle[] {
  return closes.map((c, i) => ({ ...bar(i, i === 0 ? c : closes[i - 1]!, c), ...(over[i] ?? {}) }));
}
const rising = (n: number) => Array.from({ length: n }, (_, i) => 40_000 * 1.005 ** i);
const funding = (from: number, to: number, r: number): FundingRow[] => {
  const out: FundingRow[] = [];
  for (let t = from; t < to; t += 8 * H) out.push({ t, r });
  return out;
};
const run = (data: ReplayData, startDay: number, endDay: number) => runBotReplay({
  data, contractRaw: raw, dataFrom: D0, start: D0 + startDay * DAY, endDay: D0 + endDay * DAY, startBalance: 10_000,
  journalDir: mkdtempSync(join(tmpdir(), 'bot-replay-test-')), cutoff: D0 + 400 * DAY,
});
const day = (t: number) => Math.floor((t - D0) / DAY);

test('bot thật trên lịch sử: đủ 50 nến → vào Long ở giá mở, SL luôn nằm trên sàn, nến thủng SL → khớp đúng SL, lỗ thật ≤ 2% vốn lúc vào; tín hiệu tắt → đứng ngoài', async () => {
  // tăng đều 70 ngày, ngày 70 sập: giá mở như cũ, đáy −20%, đóng −15% (≤ SMA50) → đứng ngoài
  const closes = [...rising(70), 40_000 * 1.005 ** 69 * 0.85, ...Array.from({ length: 9 }, () => 40_000 * 1.005 ** 69 * 0.85)];
  const last = 40_000 * 1.005 ** 69;
  const daily = series(closes, { 70: { open: last, high: last * 1.001, low: last * 0.8, close: last * 0.85 } });
  const r = await run({ daily, hourly: new Map(), funding: funding(D0, D0 + 80 * DAY, 0.0001) }, 40, 79);
  assert.deepEqual(r.violations, []);
  assert.deepEqual(r.urgent, []);
  assert.equal(r.trades.length, 1, JSON.stringify(r.trades));
  const t = r.trades[0]!;
  assert.equal(day(t.entryTime), 50, 'vào ở ngày đầu tiên có đủ SMA50 (quyết định lúc nến thứ 50 đóng)');
  assert.ok(Math.abs(t.entryPrice - daily[50]!.open) < 1e-4, `${t.entryPrice} vs ${daily[50]!.open}`);
  assert.equal(day(t.exitTime), 70);
  assert.match(t.reason, /^SL/);
  assert.ok(Math.abs(t.exitPrice - t.stopFinal) < 1e-4, `giá mở trên SL → khớp đúng mức SL: ${t.exitPrice} vs ${t.stopFinal}`);
  assert.ok(t.lossPct > 0 && t.lossPct <= 2 + 1e-9, `lỗ ${t.lossPct}%`);
  assert.ok(Math.abs(t.botPnl! - t.pnl) < 0.01, `bot ghi ${t.botPnl}, sổ sàn ${t.pnl}`);
  assert.ok(r.decisions.filter((d) => day(d.closeTime + 1) > 70).every((d) => d.action === 'stay_flat'));
  const m = windowMetrics(r, D0 + 40 * DAY, D0 + 79 * DAY, 10_000);
  assert.equal(m.n, 1);
  assert.ok(Math.abs(m.endEq - (10_000 + t.pnl)) < 1e-6, `${m.endEq} vs ${10_000 + t.pnl}`);
});

test('IOC: giá mở vượt giá trần (+0,1%) → bot tự thử lại 60 phút × 3; chỉ có nến 1D thì cả 3 lần thấy cùng giá → bỏ ngày, vào ở ngày kế tiếp', async () => {
  const closes = rising(60);
  const daily = series(closes, { 52: { open: closes[51]! * 1.01 } }); // ngày 52 mở cao hơn đóng ngày 51 1%
  const r = await run({ daily, hourly: new Map(), funding: [] }, 52, 55);
  assert.deepEqual(r.violations, []);
  const first = r.attempts.filter((a) => day(a.closeTime + 1) === 52);
  assert.deepEqual(first.map((a) => a.result), ['no_fill', 'no_fill', 'no_fill']);
  assert.ok(r.decisions.some((d) => day(d.closeTime + 1) === 52 && d.action === 'skip' && /IOC không khớp 3 lần/.test(d.note)));
  assert.equal(r.trades.length, 1);
  assert.equal(day(r.trades[0]!.entryTime), 53);
  const m = windowMetrics(r, D0 + 52 * DAY, D0 + 55 * DAY, 10_000);
  assert.equal(m.iocNoFill, 3);
  assert.equal(m.iocRetries, 2);
  assert.equal(m.skipsIoc, 1);
});

test('IOC với nến 1h: giờ 0 mở vượt giá trần → không khớp; lần thử lại lúc 01:0x gặp giá mở giờ 1 trong trần → khớp', async () => {
  const closes = rising(60);
  const daily = series(closes);
  const p = closes[51]!;
  const hours: Candle[] = Array.from({ length: 24 }, (_, h) => {
    const o = h === 0 ? p * 1.01 : p;
    return { openTime: D0 + 52 * DAY + h * H, closeTime: D0 + 52 * DAY + (h + 1) * H - 1, open: o, high: o * 1.001, low: p * 0.999, close: p, volume: 1, quoteVolume: 1, takerBuyQuote: 0 };
  });
  const r = await run({ daily, hourly: new Map([[D0 + 52 * DAY, hours]]), funding: [] }, 52, 53);
  assert.deepEqual(r.violations, []);
  assert.deepEqual(r.attempts.map((a) => a.result), ['no_fill', 'filled']);
  const t = r.trades[0]!;
  assert.ok(Math.abs(t.entryPrice - p) < 1e-6, `khớp ở giá mở giờ 1 ${p}, nhận ${t.entryPrice}`);
  assert.ok(t.entryTime >= D0 + 52 * DAY + H && t.entryTime < D0 + 52 * DAY + 2 * H, new Date(t.entryTime).toISOString());
  assert.equal(r.hourlyDays, 1);
});

test('chốt chặn funding chạy trong vòng đời thật: funding cao → siết SL nhiều lần; lỗ thật (gồm funding) vẫn ≤ 2% vốn lúc vào', async () => {
  const closes = [...rising(56), ...Array.from({ length: 14 }, () => 40_000 * 1.005 ** 55)];
  const flat = 40_000 * 1.005 ** 55;
  // ngày 66: đáy −30% → chạm SL đã siết
  const daily = series(closes, { 66: { open: flat, high: flat * 1.001, low: flat * 0.7, close: flat } });
  const r = await run({ daily, hourly: new Map(), funding: funding(D0, D0 + 70 * DAY, 0.003) }, 50, 69);
  assert.deepEqual(r.violations, []);
  const t = r.trades[0]!;
  assert.ok(t.tightenings > 0 && t.stopFinal > t.stopInitial, `siết ${t.tightenings}: ${t.stopInitial} → ${t.stopFinal}`);
  assert.ok(t.funding < 0);
  assert.ok(t.lossPct <= 2 + 1e-6, `lỗ ${t.lossPct}%`);
});

test('mốc cấm: dữ liệu chạm ngày cấm → dừng ngay (assert), không lọc âm thầm', () => {
  const daily = series(rising(5));
  assert.throws(() => assertBeforeCutoff({ daily, hourly: new Map(), funding: [] }, D0 + 4 * DAY), /mốc cấm/);
  assert.throws(() => assertBeforeCutoff({ daily: daily.slice(0, 3), hourly: new Map(), funding: [{ t: D0 + 3 * DAY, r: 0 }] }, D0 + 3 * DAY), /funding/);
  assert.doesNotThrow(() => assertBeforeCutoff({ daily, hourly: new Map(), funding: [] }, D0 + 5 * DAY));
});
