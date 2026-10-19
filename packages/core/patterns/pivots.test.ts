import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swingPivots, type Pivot } from './pivots.ts';
import { atr } from '../indicators.ts';
import { COMMON } from '../config.ts';
import type { Candle } from '../types.ts';

function k(high: number, low: number): Candle {
  const m = (high + low) / 2;
  return { openTime: 0, closeTime: 0, open: m, high, low, close: m, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 };
}

// Đồ thị zigzag: mỗi điểm (cao, thấp) là một nến; dựng bằng đường giá dạng sóng.
function wave(prices: number[]): Candle[] {
  return prices.map((p) => k(p + 0.5, p - 0.5));
}

const flatAtr = (n: number, v: number) => new Array<number>(n).fill(v);

// đỉnh ở 3 (110), đáy ở 7 (90), đỉnh ở 11 (120), đáy ở 15 (95)
const ZIG = wave([100, 102, 106, 110, 106, 102, 96, 90, 96, 102, 110, 120, 110, 104, 100, 95, 100, 104, 108, 112]);

test('swingPivots: chuỗi luân phiên đỉnh/đáy', () => {
  const out = swingPivots(ZIG, flatAtr(ZIG.length, 1), 1);
  assert.deepEqual(out.map((p) => [p.index, p.kind]), [[3, 'high'], [7, 'low'], [11, 'high'], [15, 'low']]);
  assert.equal(out[0]!.price, 110.5);
  assert.equal(out[1]!.price, 89.5);
});

test('swingPivots: pivot nhỏ hơn ngưỡng bị lọc', () => {
  // ATR = 20 → ngưỡng 20; swing 110.5 → 89.5 = 21 giữ; 89.5 → 120.5 = 31 giữ; 120.5 → 94.5 = 26 giữ
  assert.equal(swingPivots(ZIG, flatAtr(ZIG.length, 20), 1).length, 4);
  // ATR = 25 → đáy đầu (21) bị loại, đỉnh 11 cùng loại với đỉnh 3 → giữ đỉnh cực hơn (11)
  const out = swingPivots(ZIG, flatAtr(ZIG.length, 25), 1);
  assert.deepEqual(out.map((p) => [p.index, p.kind]), [[11, 'high'], [15, 'low']]);
});

// Dựng đường giá tuyến tính từng đoạn qua các đỉnh gấp khúc [chỉ số, giá]; mỗi đỉnh gấp khúc là một pivot rõ ràng.
function path(vertices: Array<[number, number]>): Candle[] {
  const prices: number[] = [];
  for (let v = 0; v < vertices.length - 1; v++) {
    const [i0, p0] = vertices[v]!;
    const [i1, p1] = vertices[v + 1]!;
    for (let i = i0; i < i1; i++) prices.push(p0 + ((p1 - p0) * (i - i0)) / (i1 - i0));
  }
  prices.push(vertices[vertices.length - 1]![1]);
  return wave(prices);
}

// Đáy 100 (idx 4) -> đỉnh A (idx 10) -> đáy nông 117 (idx 16) -> đỉnh B (idx 22) -> xuống 100 (idx 28).
// Với ATR=1: đỉnh A cao hơn đáy đầu 20,0 (qua ngưỡng 5); đáy nông chỉ sâu 3 so với đỉnh A (bị loại ở ngưỡng 5);
// nên A và B đều là pivot hợp lệ nhưng đứng liền nhau (không có đáy chen giữa) -> phải hợp nhất.
function twoHighs(bHigh: number): Candle[] {
  return path([[0, 108], [4, 100], [10, 120], [16, 117], [22, bHigh], [28, 100], [32, 104]]);
}

test('swingPivots: hai đỉnh liền nhau sau lọc - đỉnh sau CỰC HƠN thay đỉnh trước', () => {
  const c = twoHighs(125);
  const out = swingPivots(c, flatAtr(c.length, 1), 5);
  assert.deepEqual(out.map((q) => [q.index, q.kind]), [[4, 'low'], [22, 'high'], [28, 'low']]);
});

test('swingPivots: hai đỉnh liền nhau sau lọc - đỉnh sau THẤP HƠN thì giữ đỉnh trước', () => {
  const c = twoHighs(119);
  const out = swingPivots(c, flatAtr(c.length, 1), 5);
  assert.deepEqual(out.map((q) => [q.index, q.kind]), [[4, 'low'], [10, 'high'], [28, 'low']]);
});

test('swingPivots: ngưỡng thấp thì đáy nông được giữ, không còn hai đỉnh liền nhau', () => {
  const c = twoHighs(125);
  const out = swingPivots(c, flatAtr(c.length, 1), 1);
  assert.deepEqual(out.map((q) => [q.index, q.kind]), [[4, 'low'], [10, 'high'], [16, 'low'], [22, 'high'], [28, 'low']]);
});

test('swingPivots: ATR lấy tại nến pivot, đổi ATR ở nến SAU không đổi kết quả', () => {
  const a = flatAtr(ZIG.length, 20);
  const base = swingPivots(ZIG, a, 1);
  const b = a.slice();
  for (let i = 8; i < b.length; i++) b[i] = 1000; // sau đáy 7 → không được ảnh hưởng đỉnh 3, đáy 7
  const changed = swingPivots(ZIG, b, 1).filter((p) => p.index <= 7);
  assert.deepEqual(changed, base.filter((p) => p.index <= 7));
  // và ATR tại chính nến pivot thì có ảnh hưởng
  const c2 = a.slice();
  c2[7] = 1000;
  assert.notDeepEqual(swingPivots(ZIG, c2, 1), base);
});

test('swingPivots: chỉ pivot đã đủ 3 nến bên phải', () => {
  const out = swingPivots(ZIG.slice(0, 15), flatAtr(15, 1), 1); // nến 15 chưa tồn tại
  assert.ok(out.every((p) => p.index + 3 < 15));
  assert.ok(!out.some((p) => p.index === 11 && p.kind === 'low'));
});

function randomCandles(count: number): Candle[] {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let p = 100;
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    p += (rnd() - 0.5) * 8;
    out.push(k(p + rnd() * 2, p - rnd() * 2));
  }
  return out;
}

const N = COMMON.pivotConfirmBars;
const MIN = COMMON.patterns.minSwingAtr['4h'];
const P = COMMON.patterns.atrPeriod;

test('chống look-ahead: chạy trên từng tiền tố (ATR chỉ tính từ tiền tố) khớp với chạy cả chuỗi', () => {
  const candles = randomCandles(200);
  const full = swingPivots(candles, atr(candles, P), MIN);
  assert.ok(full.length >= 8, 'dữ liệu thử phải có đủ pivot');
  for (let len = P + N + 2; len <= candles.length; len++) {
    const slice = candles.slice(0, len);
    const pre = swingPivots(slice, atr(slice, P), MIN);
    assert.ok(pre.every((q) => q.index + N < len), `pivot chưa xác nhận tại độ dài ${len}`);
    // Pivot CUỐI của tiền tố có thể bị pivot cùng loại cực hơn đến sau thay thế (hợp nhất luân phiên)
    // nên chỉ so các pivot trước nó: chúng đã có pivot ngược chiều theo sau, không thể bị thay nữa.
    const stable = pre.slice(0, -1);
    assert.deepEqual(stable, full.slice(0, stable.length), `lệch tại độ dài ${len}`);
  }
});

test('chống look-ahead: làm hỏng ATR sau nến pivot không đổi việc giữ/bỏ pivot đó', () => {
  // Đột biến "đọc atr[index + 3]" (ATR của nến xác nhận) sẽ làm test này đỏ.
  const candles = randomCandles(200);
  const baseAtr = atr(candles, P);
  const full = swingPivots(candles, baseAtr, MIN);
  for (const q of full) {
    const slice = candles.slice(0, q.index + N + 1); // chỉ vừa đủ xác nhận q
    const clean = swingPivots(slice, baseAtr.slice(0, slice.length), MIN);
    const poisoned = baseAtr.slice(0, slice.length);
    for (let i = q.index + 1; i < poisoned.length; i++) poisoned[i] = 1e9;
    assert.deepEqual(swingPivots(slice, poisoned, MIN), clean, `ATR sau nến ${q.index} ảnh hưởng kết quả`);
  }
});

test('swingPivots: ném lỗi khi atr lệch độ dài', () => {
  assert.throws(() => swingPivots(ZIG, [1, 2], 1), /độ dài/);
});

test('swingPivots: ATR không hữu hạn tại nến pivot -> bỏ pivot và GHI LẠI vào dropped, không sinh NaN', () => {
  const a = flatAtr(ZIG.length, 1);
  a[7] = NaN;
  const dropped: Pivot[] = [];
  const out = swingPivots(ZIG, a, 1, dropped);
  assert.ok(!out.some((p) => p.index === 7));
  assert.deepEqual(dropped.map((p) => [p.index, p.kind]), [[7, 'low']]);
  assert.ok(out.every((p) => Number.isFinite(p.price)));
});
