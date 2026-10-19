import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swingPivots } from './pivots.ts';
import { atr } from '../indicators.ts';
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

test('swingPivots: hai pivot cùng loại liền nhau giữ cái cực hơn (đỉnh thấp hơn đến sau)', () => {
  // đỉnh 3 (110.5), đáy 7, đỉnh 11 thấp hơn (108) nhưng đáy 7 bị lọc → giữ đỉnh 3
  const c = wave([100, 102, 106, 110, 106, 102, 100, 99.5, 100, 102, 105, 108, 105, 102, 100, 99, 100, 101]);
  const out = swingPivots(c, flatAtr(c.length, 20), 0.5);
  const highs = out.filter((p) => p.kind === 'high');
  assert.equal(highs.length, 1);
  assert.equal(highs[0]!.index, 3);
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

test('swingPivots: chạy cả chuỗi == chạy tăng dần từng nến (chống look-ahead)', () => {
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  let p = 100;
  const prices: number[] = [];
  for (let i = 0; i < 160; i++) { p += (rnd() - 0.5) * 8; prices.push(p); }
  const candles = prices.map((x) => k(x + rnd() * 2, x - rnd() * 2));
  const fullAtr = atr(candles, 14);
  const full = swingPivots(candles, fullAtr, 0.75);
  const n = candles.length;
  // Tăng dần: tại mỗi nến i, chỉ dùng nến 0..i (ATR tính lại trên lát cắt).
  for (let i = 20; i < n; i++) {
    const slice = candles.slice(0, i + 1);
    const inc = swingPivots(slice, atr(slice, 14), 0.75);
    assert.ok(inc.every((q) => q.index + 3 <= i), `look-ahead tại nến ${i}`);
    // Cùng ATR (nhân quả) → cùng kết quả khi đưa đủ cả chuỗi nhưng chỉ tới nến i
    assert.deepEqual(inc, swingPivots(slice, fullAtr.slice(0, i + 1), 0.75));
  }
  const lastRun = swingPivots(candles.slice(0, n), atr(candles.slice(0, n), 14), 0.75);
  assert.deepEqual(lastRun, full);
  assert.ok(full.length >= 4, 'dữ liệu thử phải có pivot');
});

test('swingPivots: ném lỗi khi atr lệch độ dài', () => {
  assert.throws(() => swingPivots(ZIG, [1, 2], 1), /độ dài/);
});

test('swingPivots: ATR không hữu hạn tại nến pivot → bỏ pivot đó, không sinh NaN', () => {
  const a = flatAtr(ZIG.length, 1);
  a[7] = NaN;
  const out = swingPivots(ZIG, a, 1);
  assert.ok(!out.some((p) => p.index === 7));
  assert.ok(out.every((p) => Number.isFinite(p.price)));
});
