import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trendSignal, buildTrendPlan, trendStopX } from './trend.ts';
import { COMMON } from './config.ts';
import type { Candle } from './types.ts';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 3, 1);
// nến 1D: giá đóng cho trước, biên độ ±1 quanh giá đóng → ATR ≈ 2
const daily = (closes: number[]): Candle[] => closes.map((c, i) => ({
  openTime: T0 + i * DAY, closeTime: T0 + (i + 1) * DAY - 1, open: c, high: c + 1, low: c - 1, close: c, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5,
}));
const flat = (n: number, v = 100) => Array.from({ length: n }, () => v);
const cfg = { ...COMMON.trend, enabled: true };

test('trendSignal: đóng 1D > đỉnh đóng 50 nến trước → Long, CHỈ đúng lúc nến vừa đóng (t = closeTime + 1); bằng đỉnh / quá giờ → null', () => {
  const c = daily([...flat(60), 101]);
  const t = c[c.length - 1]!.closeTime + 1;
  const s = trendSignal(c, t, cfg)!;
  assert.equal(s.side, 'long');
  assert.equal(s.barOpenTime, c[c.length - 1]!.openTime);
  assert.ok(s.atrD > 1.9 && s.atrD < 2.2, String(s.atrD));
  assert.equal(trendSignal(c, t + 3_600_000, cfg), null, 'một giờ sau: không vào nữa (vào ở nến kế tiếp)');
  assert.equal(trendSignal(daily([...flat(60), 100]), t, cfg), null);
  assert.equal(trendSignal(daily([...flat(30), 101]), T0 + 31 * DAY, cfg), null, 'thiếu nến (< 51) → không tín hiệu');
});

test('trendSignal: Short chỉ khi sides có short (đóng < đáy đóng 50 nến trước)', () => {
  const c = daily([...flat(60), 99]);
  const t = c[c.length - 1]!.closeTime + 1;
  assert.equal(trendSignal(c, t, cfg), null, 'mặc định chỉ Long');
  assert.equal(trendSignal(c, t, { ...cfg, sides: ['long', 'short'] })!.side, 'short');
});

test('buildTrendPlan: SL = giá mark ∓ 2×ATR(20) 1D, không TP, khối lượng 2% (lỗ ước tính ≤ ngân sách), cờ trendD1', () => {
  const c = daily([...flat(60), 101]);
  const sig = trendSignal(c, c[c.length - 1]!.closeTime + 1, cfg)!;
  const h4 = Array.from({ length: 30 }, (_, i) => ({ openTime: i, closeTime: i + 1, open: 101, high: 101.5, low: 100.5, close: 101, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 }));
  const p = buildTrendPlan({ signal: sig, markPrice: 101, h4, tickSize: 0.01, stepSize: 0.001, capital: 10_000, riskPct: 2,
    cost: { tierPct: 0.25, quoteVolPerMin: Infinity }, fundingBuffer: { maxAbsRate: 0.0001, intervalHours: 8 }, cfg });
  assert.equal(p.valid, true);
  assert.equal(p.trendD1, true);
  assert.equal(p.entryType, 'market');
  assert.deepEqual(p.targets, []);
  assert.equal(p.exit.trailing, null);
  assert.ok(Math.abs(p.stop - (101 - 2 * sig.atrD)) <= 0.01, `${p.stop}`);
  assert.ok(p.maxEntry > 101 && p.maxEntry <= 101 + 0.3 * 1 + 1e-9, `giá tối đa ${p.maxEntry} = mark + 0,3×ATR(14) 4H`);
  assert.ok(p.qty > 0 && p.qty * (101 - p.stop) <= 200, `khối lượng ${p.qty}`);
  assert.ok(Math.abs(p.trailAtr - 3 * sig.atrD) < 1e-12);
});

test('trendStopX: đỉnh giá đóng − 3×ATR, không bao giờ dưới SL ban đầu, không bao giờ nới so mức cũ', () => {
  assert.equal(trendStopX({ prevLevelX: null, initialStopX: 90, bestCloseX: 100, atrD: 2, trailAtr: 3 }), 94);
  assert.equal(trendStopX({ prevLevelX: null, initialStopX: 96, bestCloseX: 100, atrD: 2, trailAtr: 3 }), 96, 'không nới quá SL ban đầu');
  assert.equal(trendStopX({ prevLevelX: 95, initialStopX: 90, bestCloseX: 100, atrD: 3, trailAtr: 3 }), 95, 'ATR tăng không kéo mức dừng xuống');
});
