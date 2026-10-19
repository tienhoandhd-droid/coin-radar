import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planLines } from './plan-print.ts';
import type { TradePlan } from '../packages/core/plan.ts';

const base: TradePlan = {
  side: 'long', entryType: 'market', marketPrice: 0.6143, entry: 0.6143, entryZone: { low: 0.6143, high: 0.6263 },
  limitExpiryHours: null, entryReason: 'ly do vao', maxEntry: 0.6263, stop: 0.532, stopReason: 'ly do sl',
  targets: [
    { name: 'TP1', price: 0.761, pct: 50, qty: 14, r: 1.78, reason: 'ly do tp1' },
    { name: 'TP2', price: null, pct: 30, qty: 8, r: null, reason: 'het vung' },
    { name: 'TP3', price: null, pct: 20, qty: 7, r: null, reason: 'het vung' },
  ],
  afterTp1Stop: 0.6143, valid: true, invalidReason: null, trailAtr: 0.1196, riskPerUnit: 0.0823, qty: 29, notional: 17.81,
  riskAmount: 2.5, estLoss: 2.39, riskPct: 0.25, safeLeverage: 4, suggestedLeverage: 3, liquidationEstimate: 0.4157, marginNeeded: 6,
  fundingCostR: 0, timeStopHours: 1, maxHoldHours: 2,
  fillTable: [
    { label: 'giá hiện tại', fill: 0.6143, qty: 29, q: [14, 8, 7], estLoss: 2.43 },
    { label: 'giữa', fill: 0.6203, qty: 27, q: [13, 8, 6], estLoss: 2.45 },
    { label: 'giá tối đa', fill: 0.6262, qty: 26, q: [13, 7, 6], estLoss: 2.47 },
  ],
};
const head = { symbol: 'TIAUSDT', score: 75.9, riskTier: 'Rất cao' };

test('in kế hoạch: dấu phẩy cho điểm và % rủi ro, trailing là khoảng cách kèm %', () => {
  const t = planLines(head, base, 0.0001).join('\n');
  assert.match(t, /điểm 75,9/);
  assert.match(t, /ngân sách rủi ro 0,25% vốn/);
  assert.match(t, /trailing stop: cách giá cao nhất 3×ATR = 0,1196 \(19,5%\)/);
  assert.match(t, /Đạt TP1 → dời SL về đúng giá KHỚP THẬT của anh/);
  assert.doesNotMatch(t, /dời SL về giá vào/);
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
  assert.match(t, /TP2: chốt 30% = 8 coin — trailing stop/);
});

test('1.2 Short: LƯU Ý trailing nói "trên giá thấp nhất"; Long nói "dưới giá cao nhất"', () => {
  const sh = planLines(head, { ...base, side: 'short' }, 0.0001).join('\n');
  assert.match(sh, /theo 0,1196 trên giá thấp nhất/);
  assert.doesNotMatch(sh, /dưới giá thấp nhất/);
  const lg = planLines(head, base, 0.0001).join('\n');
  assert.match(lg, /theo 0,1196 dưới giá cao nhất/);
});

test('1.4 in khối lượng từng TP; phần trailing ghi rõ', () => {
  const t = planLines(head, base, 0.0001).join('\n');
  assert.match(t, /TP1: 0,7610 chốt 50% = 14 coin/);
  assert.match(t, /TP2: chốt 30% = 8 coin — trailing stop/);
  assert.match(t, /TP3: chốt 20% = 7 coin — trailing stop/);
});

test('1.3 in thua lỗ ước tính thật, không in ngân sách rủi ro', () => {
  const t = planLines(head, base, 0.0001).join('\n');
  assert.match(t, /Tiền mất ước tính nếu chạm SL: 2,39 USDT/);
  assert.doesNotMatch(t, /Tiền mất nếu chạm SL: 2,50/);
});

test('2.2 lệnh market: in bảng khối lượng theo 3 giá khớp, mỗi dòng có chia 50/30/20 và tiền mất ước tính', () => {
  const t = planLines(head, base, 0.0001).join('\n');
  assert.match(t, /Bảng khối lượng theo giá khớp/);
  assert.match(t, /Khớp 0,6143 \(giá hiện tại\): 29 coin = TP1 14 \/ TP2 8 \/ TP3 7 \| mất ước tính 2,43 USDT/);
  assert.match(t, /Khớp 0,6203 \(giữa\): 27 coin = TP1 13 \/ TP2 8 \/ TP3 6 \| mất ước tính 2,45 USDT/);
  assert.match(t, /Khớp 0,6262 \(giá tối đa\): 26 coin = TP1 13 \/ TP2 7 \/ TP3 6 \| mất ước tính 2,47 USDT/);
});

test('2.2 lệnh limit: bảng chỉ một dòng', () => {
  const lim = { ...base, entryType: 'limit' as const, limitExpiryHours: 24, entry: 0.6, entryZone: { low: 0.59, high: 0.6 },
    fillTable: [{ label: 'limit' as const, fill: 0.6, qty: 30, q: [15, 9, 6] as [number, number, number], estLoss: 2.4 }] };
  const t = planLines(head, lim, 0.0001).join('\n');
  assert.match(t, /Khớp 0,6000 \(limit\): 30 coin = TP1 15 \/ TP2 9 \/ TP3 6/);
  assert.equal((t.match(/Khớp /g) ?? []).length, 1);
});

test('3.2 phần trailing bằng 0 do gộp: không in "= 0 coin", nói rõ gộp vào đâu (dòng TP và bảng)', () => {
  const p = { ...base,
    targets: [
      { name: 'TP1' as const, price: 0.761, pct: 50, qty: 2, r: 1.78, reason: 'ly do tp1' },
      { name: 'TP2' as const, price: null, pct: 30, qty: 0, r: null, reason: 'het vung' },
      { name: 'TP3' as const, price: null, pct: 20, qty: 1, r: null, reason: 'het vung' },
    ],
    fillTable: [{ label: 'giá hiện tại' as const, fill: 0.6143, qty: 3, q: [2, 0, 1] as [number, number, number], estLoss: 2.43 }] };
  const t = planLines(head, p, 0.0001).join('\n');
  assert.doesNotMatch(t, /= 0 coin/);
  assert.doesNotMatch(t, /TP2 0\b/);
  assert.match(t, /TP2: chốt 30% — gộp vào TP3/);
  assert.match(t, /3 coin = TP1 2 \/ TP2 gộp vào TP3 \/ TP3 1/);
});
