import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectTriangles } from './detect-triangle.ts';
import { swingPivots, type Pivot } from './pivots.ts';
import { atr } from '../indicators.ts';
import { COMMON } from '../config.ts';
import type { Candle } from '../types.ts';

function k(high: number, low: number, close = (high + low) / 2): Candle {
  return { openTime: 0, closeTime: 0, open: close, high, low, close, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 };
}
const A = (n: number, v: number) => new Array<number>(n).fill(v);
const hi = (index: number, price: number): Pivot => ({ index, price, kind: 'high' });
const lo = (index: number, price: number): Pivot => ({ index, price, kind: 'low' });
// Nến có close nằm giữa hai đường (không vi phạm biên).
const between = (n: number, up: (i: number) => number, low: (i: number) => number): Candle[] =>
  Array.from({ length: n }, (_, i) => k((up(i) + low(i)) / 2 + 0.5, (up(i) + low(i)) / 2 - 0.5));

// ATR = 2 → phẳng khi |dốc| ≤ 0,06/nến; sai số close 0,5.
const ASC = [hi(5, 120), lo(15, 100), hi(25, 120), lo(35, 105), hi(45, 120), lo(55, 110)];
const ascUp = () => 120;
const ascLow = (i: number) => 100 + 0.25 * (i - 15);

test('tam giác tăng: trên phẳng, dưới dốc lên, hội tụ', () => {
  const r = detectTriangles(between(80, ascUp, ascLow), ASC, A(80, 2));
  const g = r[r.length - 1]!;
  assert.equal(g.kind, 'asc_triangle');
  assert.equal(g.breakoutSide, 'up');
  assert.equal(g.startIndex, 5);
  assert.equal(g.endIndex, 55);
  assert.ok(Math.abs(g.upper(55) - 120) < 1e-9);
  assert.ok(Math.abs(g.lower(55) - 110) < 1e-9);
  assert.ok(Math.abs(g.height - 22.5) < 1e-9); // độ rộng tại pivot đầu tiên
  assert.equal(g.stopRef.up, 110); // pivot đáy gần nhất
  assert.equal(g.stopRef.down, 120); // pivot đỉnh gần nhất
});

test('tam giác giảm: dưới phẳng, trên dốc xuống', () => {
  const p = [lo(5, 100), hi(15, 120), lo(25, 100), hi(35, 115), lo(45, 100), hi(55, 110)];
  const r = detectTriangles(between(80, (i) => 120 - 0.25 * (i - 15), () => 100), p, A(80, 2));
  const g = r[r.length - 1]!;
  assert.equal(g.kind, 'desc_triangle');
  assert.equal(g.breakoutSide, 'down');
  assert.equal(g.stopRef.down, 110); // pivot đỉnh gần nhất (phía đối diện cạnh bị phá)
  assert.equal(g.stopRef.up, 100);
});

test('tam giác cân: trên dốc xuống, dưới dốc lên', () => {
  const p = [hi(5, 120), lo(15, 100), hi(25, 118), lo(35, 102), hi(45, 116), lo(55, 104)];
  const r = detectTriangles(between(80, (i) => 120 - 0.1 * (i - 5), (i) => 100 + 0.1 * (i - 15)), p, A(80, 2));
  const g = r[r.length - 1]!;
  assert.equal(g.kind, 'sym_triangle');
  assert.equal(g.breakoutSide, 'both');
});

test('thiếu pivot (cần ≥3 một cạnh và ≥2 cạnh kia) bị loại', () => {
  const r = detectTriangles(between(80, ascUp, ascLow), ASC.slice(0, 4), A(80, 2)); // 2 đỉnh + 2 đáy
  assert.equal(r.length, 0);
});

test('hai cạnh cùng phẳng (chữ nhật) không phải tam giác', () => {
  const p = [hi(5, 120), lo(15, 100), hi(25, 120), lo(35, 100), hi(45, 120), lo(55, 100)];
  assert.equal(detectTriangles(between(80, () => 120, () => 100), p, A(80, 2)).length, 0);
});

test('hội tụ < 30% và apex quá xa (> 3 lần chiều dài) bị loại', () => {
  const p = [hi(5, 120), lo(15, 100), hi(25, 120), lo(35, 101.3), hi(45, 120), lo(55, 102.6)]; // dốc 0,065 vừa trên ngưỡng phẳng
  assert.equal(detectTriangles(between(80, ascUp, (i) => 100 + 0.065 * (i - 15)), p, A(80, 2)).length, 0);
});

test('apex quá gần (< 0,5 lần chiều dài) bị loại', () => {
  const p = [hi(5, 120), lo(15, 100), hi(25, 120), lo(35, 110), hi(45, 120), lo(55, 118)];
  assert.equal(detectTriangles(between(80, ascUp, (i) => 100 + 0.45 * (i - 15)), p, A(80, 2)).length, 0);
});

test('một close vượt đường quá 0,25×A thì bị loại', () => {
  const c = between(80, ascUp, ascLow);
  c[30] = k(121.5, 119, 121); // vượt biên trên 1 > 0,5
  assert.equal(detectTriangles(c, ASC, A(80, 2)).length, 0);
});

test('close vượt đường nhưng ≤ 0,25×A vẫn được chấp nhận', () => {
  const c = between(80, ascUp, ascLow);
  c[30] = k(121, 119, 120.4); // vượt 0,4 ≤ 0,5
  assert.ok(detectTriangles(c, ASC, A(80, 2)).length > 0);
});

test('thời lượng < 15 nến bị loại', () => {
  const p = [hi(2, 120), lo(5, 100), hi(8, 120), lo(11, 105), hi(14, 120)];
  assert.equal(detectTriangles(between(40, ascUp, (i) => 100 + (5 / 6) * (i - 5)), p, A(40, 2)).length, 0);
});

test('atr lệch độ dài / pivot chưa xác nhận → ném lỗi', () => {
  assert.throws(() => detectTriangles(between(80, ascUp, ascLow), ASC, A(10, 2)), /độ dài/);
  assert.throws(() => detectTriangles(between(57, ascUp, ascLow), ASC, A(57, 2)), /chưa được xác nhận/);
  assert.throws(() => detectTriangles(between(80, ascUp, ascLow), ASC, A(80, NaN)), /ATR không hợp lệ/);
});

// ---- chống look-ahead ----
// Chuỗi dao động biên độ thu hẹp lặp lại → sinh nhiều tam giác cân.
export function squeezeSeries(count: number, seed0 = 11): Candle[] {
  let seed = seed0;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const phase = i % 120;
    const amp = 14 - (11 * phase) / 120;
    const p = 100 + amp * Math.sin((i / 10) * Math.PI) + (rnd() - 0.5) * 0.6;
    out.push(k(p + rnd() * 0.4, p - rnd() * 0.4));
  }
  return out;
}

const N = COMMON.pivotConfirmBars;
const P = COMMON.patterns.atrPeriod;
const MIN = COMMON.patterns.minSwingAtr['4h'];
export const sig = (g: ReturnType<typeof detectTriangles>[number]) =>
  JSON.stringify([g.kind, g.pivots, g.startIndex, g.endIndex, g.upper(g.startIndex), g.lower(g.endIndex), g.height, g.stopRef, g.quality, g.notes]);

test('chống look-ahead: chạy từng tiền tố khớp chạy cả chuỗi (tam giác)', () => {
  const candles = squeezeSeries(480);
  const fullPv = swingPivots(candles, atr(candles, P), MIN);
  const full = detectTriangles(candles, fullPv, atr(candles, P));
  assert.ok(full.length >= 3, `dữ liệu thử phải có tam giác, có ${full.length}`);
  let compared = 0;
  for (let len = P + N + 2; len <= candles.length; len++) {
    const s = candles.slice(0, len);
    const a = atr(s, P);
    const pv = swingPivots(s, a, MIN);
    if (pv.length === 0) continue;
    const limit = pv[pv.length - 1]!.index; // pivot cuối của tiền tố có thể còn bị thay
    const pre = detectTriangles(s, pv, a).filter((g) => g.endIndex < limit).map(sig);
    const exp = full.filter((g) => g.endIndex < limit).map(sig);
    assert.deepEqual(pre, exp, `lệch tại độ dài ${len}`);
    compared += pre.length;
  }
  assert.ok(compared > 0);
});
