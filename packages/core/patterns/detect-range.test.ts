import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectRectangles } from './detect-range.ts';
import { swingPivots, type Pivot } from './pivots.ts';
import { atr } from '../indicators.ts';
import { COMMON } from '../config.ts';
import type { Candle } from '../types.ts';

function k(high: number, low: number): Candle {
  const m = (high + low) / 2;
  return { openTime: 0, closeTime: 0, open: m, high, low, close: m, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 };
}
const flat = (n: number): Candle[] => Array.from({ length: n }, () => k(101, 99));
const A = (n: number, v: number) => new Array<number>(n).fill(v);
const hi = (index: number, price: number): Pivot => ({ index, price, kind: 'high' });
const lo = (index: number, price: number): Pivot => ({ index, price, kind: 'low' });

// ATR = 2 → dung sai vùng 1,0; chiều cao tối thiểu 6.
const BASE: Pivot[] = [hi(5, 120), lo(15, 100), hi(25, 120.5), lo(35, 100.4)];

test('chữ nhật hợp lệ: 2 chạm mỗi biên, h ≥ 3A, ≥ 20 nến', () => {
  const r = detectRectangles(flat(60), BASE, A(60, 2));
  const last = r[r.length - 1]!;
  assert.equal(last.kind, 'rectangle');
  assert.equal(last.breakoutSide, 'both');
  assert.equal(last.startIndex, 5);
  assert.equal(last.endIndex, 35);
  assert.ok(Math.abs(last.upper(0) - 120.25) < 1e-9);
  assert.ok(Math.abs(last.lower(0) - 100.2) < 1e-9);
  assert.ok(Math.abs(last.height - 20.05) < 1e-9);
  assert.deepEqual(last.notes, []);
  // cắt lỗ: R = 20 > 3A = 6 → dùng giữa vùng
  assert.ok(Math.abs(last.stopRef.up - 110.225) < 1e-9);
  assert.ok(Math.abs(last.stopRef.down - 110.225) < 1e-9);
});

test('cắt lỗ dùng pivot trong gần nhất khi R ≤ 3A, ngược lại dùng giữa vùng', () => {
  // A=6: dung sai 3; đáy 100 và 102 cùng vùng. h = 120 - 101 = 19 ≥ 18.
  const p = [hi(5, 120), lo(15, 100), hi(25, 120), lo(35, 102)];
  const g = detectRectangles(flat(60), p, A(60, 6)).pop()!;
  assert.equal(g.stopRef.up, 102); // R = 120 - 102 = 18 ≤ 18 → đáy gần nhất
  assert.equal(g.stopRef.down, 110.5); // R = 120 - 101 = 19 > 18 → giữa vùng
});

test('biên lệch quá dung sai 0,5×A thì không gom vào cùng vùng', () => {
  const p = [hi(5, 120), lo(15, 100), hi(25, 121.5), lo(35, 100.4)]; // hai đỉnh lệch 1,5 > 1,0
  assert.equal(detectRectangles(flat(60), p, A(60, 2)).length, 0);
});

test('chiều cao < 3×A bị loại', () => {
  const p = [hi(5, 105), lo(15, 100), hi(25, 105), lo(35, 100)]; // h=5 < 6
  assert.equal(detectRectangles(flat(60), p, A(60, 2)).length, 0);
});

test('thời lượng < 20 nến bị loại', () => {
  const p = [hi(2, 120), lo(7, 100), hi(12, 120), lo(17, 100)]; // 15 nến
  assert.equal(detectRectangles(flat(40), p, A(40, 2)).length, 0);
});

test('chỉ 1 chạm một biên thì không phải chữ nhật', () => {
  const p = [lo(5, 100), hi(15, 120), lo(25, 100)]; // 1 đỉnh
  assert.equal(detectRectangles(flat(60), p, A(60, 2)).length, 0);
});

test('ba đỉnh được gộp vào chữ nhật và ghi chú', () => {
  const p = [hi(5, 120), lo(15, 100), hi(25, 120.2), lo(35, 100.2), hi(45, 119.9), lo(55, 100)];
  const r = detectRectangles(flat(80), p, A(80, 2));
  const last = r[r.length - 1]!;
  assert.equal(last.pivots.length, 6);
  assert.ok(last.notes.some((s) => s.includes('ba đỉnh')));
  assert.ok(last.notes.some((s) => s.includes('ba đáy')));
});

test('atr lệch độ dài / pivot chưa xác nhận → ném lỗi', () => {
  assert.throws(() => detectRectangles(flat(60), BASE, A(10, 2)), /độ dài/);
  assert.throws(() => detectRectangles(flat(37), BASE, A(37, 2)), /chưa được xác nhận/);
  assert.throws(() => detectRectangles(flat(60), BASE, A(60, NaN)), /ATR không hợp lệ/);
});

// ---- chống look-ahead ----
export function noisyRange(count: number, seed0 = 7): Candle[] {
  let seed = seed0;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const p = 100 + 12 * Math.sin((i / 14) * Math.PI) + (rnd() - 0.5) * 1.2;
    out.push(k(p + rnd() * 0.8, p - rnd() * 0.8));
  }
  return out;
}

const N = COMMON.pivotConfirmBars;
const P = COMMON.patterns.atrPeriod;
const MIN = COMMON.patterns.minSwingAtr['4h'];

// Tóm tắt có thể so sánh (hàm upper/lower được lấy mẫu tại hai đầu).
export const sig = (g: ReturnType<typeof detectRectangles>[number]) =>
  JSON.stringify([g.kind, g.pivots, g.startIndex, g.endIndex, g.upper(g.startIndex), g.lower(g.endIndex), g.height, g.stopRef, g.quality, g.notes]);

test('chống look-ahead: chạy từng tiền tố khớp chạy cả chuỗi (chữ nhật)', () => {
  const candles = noisyRange(300);
  const fullPv = swingPivots(candles, atr(candles, P), MIN);
  const full = detectRectangles(candles, fullPv, atr(candles, P));
  assert.ok(full.length >= 3, `dữ liệu thử phải có chữ nhật, có ${full.length}`);
  let compared = 0;
  for (let len = P + N + 2; len <= candles.length; len++) {
    const s = candles.slice(0, len);
    const a = atr(s, P);
    const pv = swingPivots(s, a, MIN);
    if (pv.length === 0) continue;
    const limit = pv[pv.length - 1]!.index; // pivot cuối của tiền tố có thể còn bị thay → chỉ so mô hình kết thúc trước nó
    const pre = detectRectangles(s, pv, a).filter((g) => g.endIndex < limit).map(sig);
    const exp = full.filter((g) => g.endIndex < limit).map(sig);
    assert.deepEqual(pre, exp, `lệch tại độ dài ${len}`);
    compared += pre.length;
  }
  assert.ok(compared > 0);
});
