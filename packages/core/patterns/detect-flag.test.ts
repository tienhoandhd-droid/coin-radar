import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFlags } from './detect-flag.ts';
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
const mirror = (c: Candle[]): Candle[] => c.map((x) => k(200 - x.low, 200 - x.high));
const mirrorPv = (p: Pivot[]): Pivot[] => p.map((x) => ({ index: x.index, price: 200 - x.price, kind: x.kind === 'high' ? 'low' : 'high' }));

// Cờ tăng: nền phẳng 0..5, cán 6..18 (đáy pivot 5, tip 19 giá 134), cờ từ 20 (hai đường song song dốc xuống).
// flagHi/flagLo cho phép dựng cờ đuôi nheo.
function bull(flagHi = (t: number) => 133 - 0.5 * t, flagLo = (t: number) => 130 - 0.5 * t, n = 30): Candle[] {
  const c: Candle[] = [];
  for (let i = 0; i < n; i++) {
    if (i < 6) c.push(k(101, 99));
    else if (i < 19) {
      const cl = 100 + (i - 5) * 2.5;
      c.push(k(cl + 1, cl - 1));
    } else if (i === 19) c.push(k(134, 130));
    else c.push(k(flagHi(i - 20), flagLo(i - 20)));
  }
  return c;
}
const PV: Pivot[] = [lo(5, 99), hi(19, 134), lo(22, 129)]; // pivot đáy sau tip, xác nhận ở nến 25
const at = (r: ReturnType<typeof detectFlags>, e: number) => r.find((g) => g.endIndex === e);

test('cờ tăng hợp lệ: cán ≥3A trong ≤15 nến, cờ song song dốc xuống', () => {
  const r = detectFlags(bull(), PV, A(30, 2));
  const g = at(r, 25)!;
  assert.equal(g.kind, 'bull_flag');
  assert.equal(g.breakoutSide, 'up');
  assert.equal(g.startIndex, 5);
  assert.equal(g.height, 35); // chiều cao cán
  assert.ok(Math.abs(g.upper(25) - 130.5) < 1e-9); // đường kháng cự kéo dài, không gồm nến 25
  assert.ok(Math.abs(g.lower(25) - 127.5) < 1e-9);
  assert.equal(g.stopRef.up, 128); // đáy cờ
  assert.equal(g.stopRef.down, 133); // đỉnh cờ
  assert.deepEqual(g.notes, []);
});

test('cần pivot đối chiều đã xác nhận sau tip: nến 24 chưa có', () => {
  const r = detectFlags(bull(), PV, A(30, 2));
  assert.equal(at(r, 24), undefined);
  assert.ok(at(r, 26));
  assert.equal(at(r, 29), undefined); // quá 0,5 lần cán (14 nến → ≤ 7 nến từ tip)
});

test('cờ đuôi nheo: hai đường hội tụ được ghi chú', () => {
  const r = detectFlags(bull((t) => 133 - 0.4 * t, (t) => 129 + 0.2 * t), PV, A(30, 2));
  const g = at(r, 26)!;
  assert.equal(g.kind, 'bull_flag');
  assert.ok(g.notes.some((s) => s.includes('đuôi nheo')));
});

test('cờ tăng nghiêng thuận chiều cán (không hội tụ) bị loại', () => {
  const r = detectFlags(bull((t) => 131 + 0.5 * t, (t) => 128 + 0.5 * t), PV, A(30, 2));
  assert.equal(r.length, 0);
});

test('cờ giảm là ảnh gương của cờ tăng', () => {
  const g = at(detectFlags(mirror(bull()), mirrorPv(PV), A(30, 2)), 25)!;
  assert.equal(g.kind, 'bear_flag');
  assert.equal(g.breakoutSide, 'down');
  assert.equal(g.height, 35);
  assert.deepEqual(g.stopRef, { up: 67, down: 72 }); // gương của {đáy cờ 128, đỉnh cờ 133}
});

test('cán < 3×A bị loại', () => {
  assert.equal(detectFlags(bull(), PV, A(30, 15)).length, 0);
});

test('cán dài hơn 15 nến bị loại', () => {
  assert.equal(detectFlags(bull(), [lo(3, 99), hi(19, 134), lo(22, 129)], A(30, 2)).length, 0);
});

test('cờ rộng hơn 0,5 lần cán bị loại', () => {
  // cán 10 nến (9→19): cờ tối đa 5 nến, nhưng pivot đáy chỉ xác nhận ở nến 25 (6 nến từ tip)
  assert.equal(detectFlags(bull(), [lo(9, 99), hi(19, 134), lo(22, 129)], A(30, 2)).length, 0);
});

test('có nến vượt tip thì bị loại', () => {
  const c = bull();
  c[22] = k(135, 129);
  assert.equal(detectFlags(c, PV, A(30, 2)).length, 0);
});

test('cờ cao hơn 0,5 lần cán bị loại', () => {
  const c = bull();
  c[23] = k(131, 105);
  assert.equal(detectFlags(c, PV, A(30, 2)).length, 0);
});

test('đường cờ không gồm nến hiện tại', () => {
  const base = at(detectFlags(bull(), PV, A(30, 2)), 26)!;
  const c = bull();
  c[26] = k(131, 118); // nến hiện tại tụt sâu: không được làm đổi đường, đáy cờ
  const g = at(detectFlags(c, PV, A(30, 2)), 26)!;
  assert.equal(g.upper(26), base.upper(26));
  assert.equal(g.lower(26), base.lower(26));
  assert.deepEqual(g.stopRef, base.stopRef);
});

test('atr lệch độ dài / ATR không hợp lệ → ném lỗi', () => {
  assert.throws(() => detectFlags(bull(), PV, A(10, 2)), /độ dài/);
  assert.throws(() => detectFlags(bull(), PV, A(30, NaN)), /ATR không hợp lệ/);
});

// ---- chống look-ahead ----
// Chuỗi lặp 40 nến: cán tăng 12 nến, cờ 8 nến trôi xuống (zích-zắc), cán giảm 12 nến, cờ 8 nến hồi lên.
const WAVE = [0, -3, -5, -3.5, -4, -3, -4, -3.5];
export function flagSeries(count: number, seed0 = 5): Candle[] {
  let seed = seed0;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const out: Candle[] = [];
  let lvl = 150;
  for (let i = 0; i < count; i++) {
    const ph = i % 40;
    let p: number;
    if (ph < 12) p = lvl += 3; // cán tăng
    else if (ph < 20) p = lvl + WAVE[ph - 12]!; // cờ tăng
    else if (ph < 32) {
      if (ph === 20) lvl += WAVE[7]!;
      p = lvl -= 3; // cán giảm
    } else p = lvl - WAVE[ph - 32]!; // cờ giảm
    out.push(k(p + 1 + rnd() * 0.4, p - 1 - rnd() * 0.4));
  }
  return out;
}

const N = COMMON.pivotConfirmBars;
const P = COMMON.patterns.atrPeriod;
const MIN = COMMON.patterns.minSwingAtr['4h'];
export const sig = (g: ReturnType<typeof detectFlags>[number]) =>
  JSON.stringify([g.kind, g.pivots, g.startIndex, g.endIndex, g.upper(g.endIndex), g.lower(g.endIndex), g.height, g.stopRef, g.quality, g.notes]);

test('chống look-ahead: chạy từng tiền tố khớp chạy cả chuỗi (cờ)', () => {
  const candles = flagSeries(400);
  const fullPv = swingPivots(candles, atr(candles, P), MIN);
  const full = detectFlags(candles, fullPv, atr(candles, P));
  assert.ok(full.length >= 3, `dữ liệu thử phải có cờ, có ${full.length}`);
  assert.ok(full.some((g) => g.kind === 'bull_flag') && full.some((g) => g.kind === 'bear_flag'));
  let compared = 0;
  for (let len = P + N + 2; len <= candles.length; len++) {
    const s = candles.slice(0, len);
    const a = atr(s, P);
    const pv = swingPivots(s, a, MIN);
    // Mỗi cờ chỉ phụ thuộc cán + tip (đã có pivot đối chiều xác nhận sau nó) và nến ≤ endIndex → so mọi cờ kết thúc trong tiền tố.
    const pre = detectFlags(s, pv, a).map(sig);
    const exp = full.filter((g) => g.endIndex < len).map(sig);
    assert.deepEqual(pre, exp, `lệch tại độ dài ${len}`);
    compared += pre.length;
  }
  assert.ok(compared > 0);
});
