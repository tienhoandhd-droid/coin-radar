import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectHeadShoulders, hsStatus } from './detect-hs.ts';
import { swingPivots } from './pivots.ts';
import { atr, ema } from '../indicators.ts';
import { COMMON } from '../config.ts';
import type { Candle } from '../types.ts';

function k(high: number, low: number, close = (high + low) / 2): Candle {
  return { openTime: 0, closeTime: 0, open: close, high, low, close, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 };
}
const A = (n: number, v: number) => new Array<number>(n).fill(v);
const mirror = (c: Candle[]): Candle[] => c.map((x) => k(200 - x.low, 200 - x.high));

// Dựng nến từ các điểm gấp khúc [chỉ số, giá đóng]; mỗi nến ±0,5 quanh giá đóng.
function wave(pts: [number, number][]): Candle[] {
  const out: Candle[] = [];
  for (let s = 0; s < pts.length - 1; s++) {
    const [i0, p0] = pts[s]!;
    const [i1, p1] = pts[s + 1]!;
    for (let i = i0; i < i1; i++) {
      const cl = p0 + ((p1 - p0) * (i - i0)) / (i1 - i0);
      out.push(k(cl + 0.5, cl - 0.5, cl));
    }
  }
  const [il, pl] = pts[pts.length - 1]!;
  out.push(k(pl + 0.5, pl - 0.5, pl));
  assert.equal(out.length, il + 1);
  return out;
}

// Vai-đầu-vai đỉnh: P1=20 (110), P2=30 (102), P3=45 (đầu 120), P4=60 (102), P5=70 (110), P6=85 (đáy 95).
const BASE: [number, number][] = [[0, 100], [20, 110], [30, 102], [45, 120], [60, 102], [70, 110], [85, 95], [100, 100]];
const hsOf = (pts = BASE) => {
  const c = wave(pts);
  const a = A(c.length, 2);
  const pv = swingPivots(c, a, 0.75);
  return { c, a, pv };
};
const run = (pts = BASE, emaV = 100) => {
  const { c, a, pv } = hsOf(pts);
  return detectHeadShoulders(c, pv, a, A(c.length, emaV), '4h');
};
const with5 = (i5: number, p5: number): [number, number][] => [[0, 100], [20, 110], [30, 102], [45, 120], [60, 102], [i5, p5], [i5 + 15, 95], [i5 + 30, 100]];

test('vai-đầu-vai đỉnh hợp lệ: 5 pivot, neckline P2–P4, sinh hình học đúng', () => {
  const r = run();
  assert.equal(r.length, 1);
  const g = r[0]!;
  assert.equal(g.kind, 'head_shoulders');
  assert.deepEqual(g.pivots.map((p) => p.index), [20, 30, 45, 60, 70]);
  assert.equal(g.startIndex, 20);
  assert.equal(g.endIndex, 70);
  assert.equal(g.breakoutSide, 'down');
  assert.equal(g.lower(70), 101.5); // neckline
  assert.equal(g.height, 120.5 - 101.5);
  assert.equal(g.stopRef.down, 110.5); // trên vai phải
  assert.ok(Number.isFinite(g.stopRef.up));
});

test('vai-đầu-vai ngược: lật dấu', () => {
  const c = mirror(wave(BASE));
  const a = A(c.length, 2);
  const g = detectHeadShoulders(c, swingPivots(c, a, 0.75), a, A(c.length, 100), '4h');
  assert.equal(g.length, 1);
  assert.equal(g[0]!.kind, 'inv_head_shoulders');
  assert.equal(g[0]!.breakoutSide, 'up');
  assert.equal(g[0]!.upper(70), 200 - 101.5);
});

test('loại: hai vai lệch > 0,75×A', () => {
  assert.equal(run(with5(70, 113.5)).length, 0); // vai phải 113,5 vs 110 → lệch 3,5 > 1,5
});

test('loại: vai quá cao so với đầu (>0,7) hoặc quá thấp (<0,25)', () => {
  const high: [number, number][] = [[0, 100], [20, 117], [30, 102], [45, 120], [60, 102], [70, 117], [85, 95], [100, 100]];
  const low: [number, number][] = [[0, 100], [20, 104], [30, 102], [45, 120], [60, 102], [70, 104], [85, 95], [100, 100]];
  assert.equal(run(high).length, 0);
  assert.equal(run(low).length, 0);
});

test('loại: đầu − neckline < 1,5×A', () => {
  const flat: [number, number][] = [[0, 100], [20, 101.9], [30, 101], [45, 102.8], [60, 101], [70, 101.9], [85, 99], [100, 100]];
  assert.equal(run(flat).length, 0);
});

test('loại: mất đối xứng thời gian (>2,5 lần)', () => {
  assert.equal(run(with5(115, 110)).length, 0); // trái 25 nến, phải 70 nến → 2,8
  assert.equal(run(with5(100, 110)).length, 1); // phải 55/25 = 2,2 → còn hợp lệ
});

test('loại: thời lượng ngoài 15–120 nến', () => {
  assert.equal(run(with5(150, 110)).length, 0);
});

test('nách lệch > 0,75×A vẫn hợp lệ nếu neckline dốc ≤ 0,1×A mỗi nến; dốc hơn thì loại', () => {
  const gentle: [number, number][] = [[0, 100], [20, 110], [30, 102], [45, 120], [60, 104], [70, 110], [85, 95], [100, 100]];
  const steep: [number, number][] = [[0, 100], [20, 110], [30, 102], [45, 120], [60, 109], [70, 110], [85, 95], [100, 100]];
  assert.equal(run(gentle).length, 1); // nách lệch 2 > 1,5 nhưng dốc 2/30 = 0,067 ≤ 0,2
  assert.equal(run(steep).length, 0); // lệch 7 > 1,5 và dốc 6,5/30 ≈ 0,217 > 0,2
});

test('bộ lọc EMA200: cần ≥3/5 pivot ở phía đúng', () => {
  assert.equal(run(BASE, 100).length, 1); // 5/5 trên EMA
  assert.equal(run(BASE, 105).length, 1); // P1,P3,P5 trên EMA = 3/5
  assert.equal(run(BASE, 115).length, 0); // chỉ P3 trên EMA
  const { c, pv, a } = hsOf();
  assert.equal(detectHeadShoulders(c, pv, a, A(c.length, NaN), '4h').length, 0); // EMA chưa đủ dữ liệu → không đoán
});

test('chỉ phát khi pivot vai phải đã chắc chắn (có pivot ngược chiều sau nó)', () => {
  // cắt tại nến 74: P5 (70) đã xác nhận nhưng chưa có đáy P6 → chưa phát
  const c = wave(BASE).slice(0, 75);
  const a = A(c.length, 2);
  assert.equal(detectHeadShoulders(c, swingPivots(c, a, 0.75), a, A(c.length, 100), '4h').length, 0);
});

test('pivot cuối bị thay thế: vai phải hạ rồi nâng đỉnh cao hơn → không phát bằng vai phải cũ', () => {
  // vai phải thứ nhất 110 ở nến 70, hồi nhẹ (không đủ biên độ làm pivot), đỉnh mới 113,5 ở nến 80 thay thế.
  const pts: [number, number][] = [[0, 100], [20, 110], [30, 102], [45, 120], [60, 102], [70, 110], [75, 109.8], [80, 113.5], [95, 95], [110, 100]];
  const c = wave(pts);
  const a = A(c.length, 2);
  const early = c.slice(0, 80); // thấy đỉnh 70 + đáy nhẹ nhưng chưa thấy đỉnh 80 xác nhận
  const pvEarly = swingPivots(early, a.slice(0, 80), 0.75);
  assert.equal(pvEarly[pvEarly.length - 1]!.index, 70, 'đỉnh 70 đang là pivot cuối và còn có thể bị thay');
  assert.equal(detectHeadShoulders(early, pvEarly, a.slice(0, 80), A(80, 100), '4h').length, 0);
  const full = detectHeadShoulders(c, swingPivots(c, a, 0.75), a, A(c.length, 100), '4h');
  assert.equal(full.length, 0, 'vai phải mới 113,5 lệch 3 > 1,5 so với vai trái → không còn là vai-đầu-vai');
});

test('trạng thái: forming → confirmed khi đóng dưới neckline, invalidated khi vượt đầu, expired khi quá hạn', () => {
  const { c, a, pv } = hsOf();
  const g = detectHeadShoulders(c, pv, a, A(c.length, 100), '4h')[0]!;
  assert.deepEqual(hsStatus(c, g, 75), { state: 'forming', confirmedAt: null });
  assert.deepEqual(hsStatus(c, g, 78), { state: 'forming', confirmedAt: null }); // đóng đúng 102 chưa thủng 101,5
  assert.deepEqual(hsStatus(c, g, 79), { state: 'confirmed', confirmedAt: 79 }); // 101 < 101,5
  assert.deepEqual(hsStatus(c, g, 100), { state: 'confirmed', confirmedAt: 79 });
  // vượt đầu sau xác nhận → mất hiệu lực
  const up = c.slice(0, 90).concat([k(125, 120)]);
  assert.equal(hsStatus(up, g, 90).state, 'invalidated');
  // sau 60 nến kể từ xác nhận → hết hạn
  const far = c.slice(0, 101).concat(Array.from({ length: 60 }, () => k(101, 99)));
  assert.equal(hsStatus(far, g, 139).state, 'confirmed');
  assert.equal(hsStatus(far, g, 141).state, 'expired');
  // không xác nhận trong waitBars → hết hạn
  const noBreak = c.slice(0, 71).concat(Array.from({ length: 40 }, () => k(111, 109)));
  assert.equal(hsStatus(noBreak, g, 80).state, 'forming');
  assert.equal(hsStatus(noBreak, g, 100).state, 'expired');
});

test('nến đang xét là nến phá: đóng thủng neckline ở đúng nến atIndex thì đã xác nhận', () => {
  const { c, a, pv } = hsOf();
  const g = detectHeadShoulders(c, pv, a, A(c.length, 100), '4h')[0]!;
  assert.equal(hsStatus(c.slice(0, 80), g, 79).state, 'confirmed');
  assert.equal(hsStatus(c.slice(0, 79), g, 78).state, 'forming');
});

test('hsStatus ném lỗi khi atIndex ngoài dữ liệu hoặc trước P5', () => {
  const { c, a, pv } = hsOf();
  const g = detectHeadShoulders(c, pv, a, A(c.length, 100), '4h')[0]!;
  assert.throws(() => hsStatus(c, g, 500), /ngoài/);
  assert.throws(() => hsStatus(c, g, 60), /trước/);
});

// ---- chống look-ahead ----
// Chuỗi gồm nhiều đoạn vai-đầu-vai (đỉnh và ngược xen kẽ) có nhiễu, mỗi đoạn dài 110 nến, độ lệch ngẫu nhiên cố định.
export function hsSeries(reps: number, seed0 = 5): Candle[] {
  let seed = seed0;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const out: Candle[] = [];
  for (let r = 0; r < reps; r++) {
    const sh = 108 + rnd() * 4;
    const head = 117 + rnd() * 7;
    const sh2 = sh + (rnd() - 0.5) * 0.6;
    const neck2 = 102 + (rnd() - 0.5) * 0.4;
    const seg = wave([[0, 100], [20, sh], [30, 102], [45, head], [60, neck2], [70, sh2], [85, 95 + rnd() * 3], [110, 100]]).slice(0, 110);
    const flip = r % 2 === 1;
    for (const x of seg) {
      const n = (rnd() - 0.5) * 0.4;
      out.push(flip ? k(200 - x.low + n, 200 - x.high + n) : k(x.high + n, x.low + n));
    }
  }
  return out;
}
const N = COMMON.pivotConfirmBars;
const P = COMMON.patterns.atrPeriod;
const MIN = COMMON.patterns.minSwingAtr['4h'];
const E = COMMON.patterns.hs.emaPeriod;
const sig = (g: ReturnType<typeof detectHeadShoulders>[number]) =>
  JSON.stringify([g.kind, g.pivots, g.startIndex, g.endIndex, g.upper(g.endIndex), g.lower(g.endIndex), g.height, g.stopRef, g.quality, g.notes]);
const detectAll = (c: Candle[]) => {
  const a = atr(c, P);
  return detectHeadShoulders(c, swingPivots(c, a, MIN), a, ema(c.map((x) => x.close), E), '4h');
};

test('chống look-ahead: chạy từng tiền tố khớp chạy cả chuỗi (vai-đầu-vai + trạng thái)', () => {
  const candles = hsSeries(14);
  const full = detectAll(candles);
  assert.ok(full.length >= 2, `dữ liệu thử phải có vai-đầu-vai, có ${full.length}`);
  let compared = 0;
  let statusCompared = 0;
  for (let len = E + N + 2; len <= candles.length; len++) {
    const s = candles.slice(0, len);
    const pv = swingPivots(s, atr(s, P), MIN);
    if (pv.length === 0) continue;
    const limit = pv[pv.length - 1]!.index; // pivot cuối của tiền tố có thể còn bị thay
    const pre = detectAll(s).filter((g) => g.endIndex < limit);
    const exp = full.filter((g) => g.endIndex < limit);
    assert.deepEqual(pre.map(sig), exp.map(sig), `lệch tại độ dài ${len}`);
    // trạng thái tại nến cuối của tiền tố: tính trên cả chuỗi (atIndex) == tính trên tiền tố
    for (let q = 0; q < pre.length; q++) {
      assert.deepEqual(hsStatus(candles, exp[q]!, len - 1), hsStatus(s, pre[q]!, len - 1), `trạng thái lệch tại ${len}`);
      statusCompared++;
    }
    compared += pre.length;
  }
  assert.ok(compared > 0 && statusCompared > 0);
});
