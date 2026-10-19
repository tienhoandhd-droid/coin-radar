import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundStep, liquidationPrice, maxSafeLeverage, positionSize, buildPlan, nearestLevels } from './plan.ts';
import type { Candle } from './types.ts';

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

test('roundStep theo độ lớn giá', () => {
  assert.equal(roundStep(82_000), 1000);
  assert.equal(r6(roundStep(0.5)), 0.01);
});

test('giá thanh lý isolated gần đúng — tính tay', () => {
  assert.equal(r6(liquidationPrice(100, 10, 'long', 0.01)), 91); // 100*(1-0.1+0.01)
  assert.equal(r6(liquidationPrice(100, 10, 'short', 0.01)), 109); // 100*(1+0.1-0.01)
});

test('đòn bẩy an toàn tối đa: cắt lỗ 2%, buffer 1 → 1/(0,04+0,01) = 20', () => {
  assert.equal(r6(maxSafeLeverage(0.02, 0.01, 1)), 20);
});

test('khối lượng: vốn 1000, rủi ro 0,5%, vào 100, cắt 98, chi phí 0,5% → 2', () => {
  const s = positionSize(1000, 0.5, 100, 98, 0.5, 0.001);
  assert.equal(s.qty, 2);
  assert.equal(s.notional, 200);
  assert.equal(s.riskAmount, 5);
});

function k(i: number, close: number, high = close * 1.01, low = close * 0.99): Candle {
  return { openTime: i, closeTime: i, open: close, high, low, close, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 };
}

test('nearestLevels: pivot đã xác nhận gần nhất trên/dưới giá', () => {
  // đỉnh ở chỉ số 3 và đáy ở chỉ số 7 để đủ 3 nến xác nhận mỗi bên
  const closes = [100, 101, 102, 110, 101, 100, 99, 90, 99, 100, 101, 102, 103, 104];
  const c = closes.map((x, i) => k(i, x));
  const lv = nearestLevels(c, 3);
  assert.ok(lv.above !== null && lv.above > 104);
  assert.ok(lv.below !== null && lv.below < 104);
});

test('buildPlan Long: cắt lỗ dưới giá, chốt lời 1 = 1,5R, Short đối xứng', () => {
  const c = Array.from({ length: 60 }, (_, i) => k(i, 100 + Math.sin(i / 3) * 2));
  const base = { mode: 'swing' as const, entry: c, dailyAtr: 3, capital: 1000, riskPct: 0.5, costTier: 'high' as const,
    stepSize: 0.001, fundingRate: 0.0001, levels: { above: null, below: null } };
  const L = buildPlan({ ...base, side: 'long' });
  assert.ok(L.stop < L.entry && L.tp1 > L.entry);
  assert.equal(r6((L.tp1 - L.entry) / (L.entry - L.stop)), 1.5);
  assert.ok(L.entry - L.stop >= 3 - 1e-9, 'Swing: cắt lỗ không chặt hơn 1×ATR ngày');
  const S = buildPlan({ ...base, side: 'short' });
  assert.ok(S.stop > S.entry && S.tp1 < S.entry);
  assert.ok(L.fundingCostR > 0, 'Long trả funding khi funding dương');
  assert.ok(S.fundingCostR < 0, 'Short nhận funding khi funding dương');
});
