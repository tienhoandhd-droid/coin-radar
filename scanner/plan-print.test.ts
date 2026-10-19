import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planLines } from './plan-print.ts';
import type { TradePlan } from '../packages/core/plan.ts';

const base: TradePlan = {
  side: 'long', entryType: 'market', marketPrice: 0.6143, entry: 0.6143, entryZone: { low: 0.6143, high: 0.6263 },
  limitExpiryHours: null, entryReason: 'ly do vao', maxEntry: 0.6263, stop: 0.532, stopReason: 'ly do sl',
  targets: [
    { name: 'TP1', price: 0.761, pct: 50, r: 1.78, reason: 'ly do tp1' },
    { name: 'TP2', price: null, pct: 30, r: null, reason: 'het vung' },
    { name: 'TP3', price: null, pct: 20, r: null, reason: 'het vung' },
  ],
  afterTp1Stop: 0.6143, valid: true, invalidReason: null, trailAtr: 0.1196, riskPerUnit: 0.0823, qty: 29, notional: 17.81,
  riskAmount: 2.5, riskPct: 0.25, safeLeverage: 4, suggestedLeverage: 3, liquidationEstimate: 0.4157, marginNeeded: 6,
  fundingCostR: 0, timeStopHours: 1, maxHoldHours: 2,
};
const head = { symbol: 'TIAUSDT', score: 75.9, riskTier: 'Rất cao' };

test('in kế hoạch: dấu phẩy cho điểm và % rủi ro, trailing là khoảng cách kèm %', () => {
  const t = planLines(head, base, 0.0001).join('\n');
  assert.match(t, /điểm 75,9/);
  assert.match(t, /\(0,25% vốn\)/);
  assert.match(t, /trailing stop: cách giá cao nhất 3×ATR = 0,1196 \(19,5%\)/);
  assert.match(t, /Đạt TP1 → dời SL về giá vào 0,6143/);
  assert.doesNotMatch(t, /3×ATR = 0,1196 — /);
});

test('Short: trailing bám giá thấp nhất', () => {
  const t = planLines(head, { ...base, side: 'short' }, 0.0001).join('\n');
  assert.match(t, /cách giá thấp nhất 3×ATR/);
});

test('TP1 = null: một dòng "không có TP cố định", bỏ dòng dời SL, bỏ TP1/TP2/TP3 riêng lẻ', () => {
  const noTp = { ...base, targets: base.targets.map((t) => ({ ...t, price: null, r: null })) };
  const t = planLines(head, noTp, 0.0001).join('\n');
  assert.match(t, /Không có vùng cản phía trên → không có TP cố định; toàn bộ vị thế theo trailing stop/);
  assert.doesNotMatch(t, /Đạt TP1/);
  assert.doesNotMatch(t, /TP1:|TP2:|TP3:/);
  assert.match(t, /trailing stop: cách giá cao nhất 3×ATR/);
});

test('Short TP1 = null: nói "vùng đỡ phía dưới"', () => {
  const noTp = { ...base, side: 'short' as const, targets: base.targets.map((t) => ({ ...t, price: null, r: null })) };
  assert.match(planLines(head, noTp, 0.0001).join('\n'), /Không có vùng đỡ phía dưới → không có TP cố định/);
});

test('limit: ghi giá limit và giờ hết hạn', () => {
  const t = planLines(head, { ...base, entryType: 'limit', limitExpiryHours: 24, entry: 0.6, entryZone: { low: 0.59, high: 0.6 } }, 0.0001).join('\n');
  assert.match(t, /ĐẶT LIMIT CHỜ HỒI về 0,6000, hết hạn sau 24 giờ/);
});

test('TP2/TP3 null khi TP1 có: dùng cùng câu trailing', () => {
  const t = planLines(head, base, 0.0001).join('\n');
  assert.match(t, /TP2: chốt 30% — trailing stop/);
});
