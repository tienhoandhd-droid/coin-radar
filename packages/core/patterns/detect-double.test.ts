import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectDoubles } from './detect-double.ts';
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

// ATR = 2: dung sai min(1,0; 3% giá), đáy giữa sâu ≥ 5, cách ≥ 10 nến.
test('hai đỉnh hợp lệ', () => {
  const r = detectDoubles(flat(40), [lo(2, 90), hi(10, 120), lo(20, 110), hi(30, 120.6)], A(40, 2));
  assert.equal(r.length, 1);
  const g = r[0]!;
  assert.equal(g.kind, 'double_top');
  assert.equal(g.breakoutSide, 'down');
  assert.equal(g.startIndex, 10);
  assert.equal(g.endIndex, 30);
  assert.equal(g.lower(25), 110); // đường phá = đáy giữa P2
  assert.equal(g.upper(25), 120.6);
  assert.ok(Math.abs(g.height - 10.6) < 1e-9);
  assert.equal(g.stopRef.down, 120.6); // trên đỉnh cao hơn
  assert.ok(g.quality > 0 && g.quality <= 1);
});

test('hai đáy hợp lệ (lật dấu)', () => {
  const r = detectDoubles(flat(40), [hi(2, 130), lo(10, 100), hi(20, 110), lo(30, 99.5)], A(40, 2));
  assert.equal(r.length, 1);
  const g = r[0]!;
  assert.equal(g.kind, 'double_bottom');
  assert.equal(g.breakoutSide, 'up');
  assert.equal(g.upper(25), 110);
  assert.equal(g.stopRef.up, 99.5); // dưới đáy thấp hơn
  assert.ok(Math.abs(g.height - 10.5) < 1e-9);
});

test('hai đỉnh lệch quá min(0,5×A; 3% giá) bị loại', () => {
  assert.equal(detectDoubles(flat(40), [hi(10, 120), lo(20, 110), hi(30, 121.2)], A(40, 2)).length, 0); // 1,2 > 1,0
  // trần 3% giá: A lớn nhưng giá nhỏ
  assert.equal(detectDoubles(flat(40), [hi(10, 10), lo(20, 1), hi(30, 10.4)], A(40, 1)).length, 0); // 0,4 > 3%×10=0,3
});

test('đáy giữa nông hơn 2,5×A bị loại', () => {
  assert.equal(detectDoubles(flat(40), [hi(10, 120), lo(20, 116), hi(30, 120)], A(40, 2)).length, 0); // sâu 4 < 5
});

test('hai đỉnh quá gần nhau (< 10 nến) bị loại', () => {
  assert.equal(detectDoubles(flat(40), [hi(10, 120), lo(14, 105), hi(19, 120)], A(40, 2)).length, 0);
});

test('chuỗi không luân phiên đúng thì bỏ qua', () => {
  assert.equal(detectDoubles(flat(40), [hi(10, 120), hi(20, 110), hi(30, 120)], A(40, 2)).length, 0);
});

test('atr lệch độ dài / ATR không hợp lệ → ném lỗi', () => {
  const p = [hi(10, 120), lo(20, 110), hi(30, 120)];
  assert.throws(() => detectDoubles(flat(40), p, A(5, 2)), /độ dài/);
  assert.throws(() => detectDoubles(flat(40), p, A(40, NaN)), /ATR không hợp lệ/);
});

// ---- chống look-ahead ----
function wavy(count: number, seed0 = 11): Candle[] {
  let seed = seed0;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const p = 100 + 10 * Math.sin((i / 9) * Math.PI) + (rnd() - 0.5) * 1.5;
    out.push(k(p + rnd() * 0.8, p - rnd() * 0.8));
  }
  return out;
}
const N = COMMON.pivotConfirmBars;
const P = COMMON.patterns.atrPeriod;
const MIN = COMMON.patterns.minSwingAtr['4h'];
const sig = (g: ReturnType<typeof detectDoubles>[number]) =>
  JSON.stringify([g.kind, g.pivots, g.startIndex, g.endIndex, g.upper(g.startIndex), g.lower(g.endIndex), g.height, g.stopRef, g.quality]);

test('chống look-ahead: chạy từng tiền tố khớp chạy cả chuỗi (hai đỉnh/đáy)', () => {
  const candles = wavy(300);
  const fa = atr(candles, P);
  const full = detectDoubles(candles, swingPivots(candles, fa, MIN), fa);
  assert.ok(full.length >= 3, `dữ liệu thử phải có mô hình, có ${full.length}`);
  assert.ok(full.some((g) => g.kind === 'double_top') && full.some((g) => g.kind === 'double_bottom'));
  for (let len = P + N + 2; len <= candles.length; len++) {
    const s = candles.slice(0, len);
    const a = atr(s, P);
    const pv = swingPivots(s, a, MIN);
    if (pv.length === 0) continue;
    const limit = pv[pv.length - 1]!.index;
    const pre = detectDoubles(s, pv, a).filter((g) => g.endIndex < limit).map(sig);
    const exp = full.filter((g) => g.endIndex < limit).map(sig);
    assert.deepEqual(pre, exp, `lệch tại độ dài ${len}`);
  }
});
