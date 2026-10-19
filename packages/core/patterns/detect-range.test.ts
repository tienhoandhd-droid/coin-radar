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
  // mức cắt lỗ dự phòng của bộ nhận diện = giữa vùng; pivot nhỏ phía trong được chọn lúc phá (rectangleStopRef)
  assert.ok(Math.abs(last.stopRef.up - 110.225) < 1e-9);
  assert.ok(Math.abs(last.stopRef.down - 110.225) < 1e-9);
});

test('P1: bộ nhận diện không lấy lần chạm biên đối diện làm "pivot phía trong" — dự phòng luôn là giữa vùng', () => {
  // A=6: dung sai 3; đáy 100 và 102 cùng vùng. Trước đây stopRef.up = 102 (chính lần chạm biên dưới).
  const p = [hi(5, 120), lo(15, 100), hi(25, 120), lo(35, 102)];
  const g = detectRectangles(flat(60), p, A(60, 6)).pop()!;
  assert.equal(g.stopRef.up, 110.5);
  assert.equal(g.stopRef.down, 110.5);
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

// ---------- P1: pivot nhỏ phía trong lúc phá ----------
import { rectangleStopRef } from './detect-range.ts';
import { evaluateState } from './state.ts';
import { buildPatternPlan } from './pattern-plan.ts';
import type { PatternGeometry } from './types.ts';

// Chữ nhật 105..110 (h = 5A, A = 1). Chạm trên 10/30/50, chạm dưới 20/40. Sau lần chạm trên cuối (50), giá đi ngang sát biên trên
// với một đáy nhỏ 109,5 ở nến 55 (đủ 3 nến mỗi bên). Nến 60 phá lên đóng 110,3.
const H4 = 4 * 3600_000;
const kc = (i: number, high: number, low: number, close: number): Candle =>
  ({ openTime: i * H4, closeTime: (i + 1) * H4 - 1, open: close, high, low, close, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 });
function innerSeries(withInner = true): Candle[] {
  const c: Candle[] = [];
  for (let i = 0; i <= 50; i++) {
    const high = i === 10 || i === 30 || i === 50 ? 110 : 108;
    const low = i === 20 || i === 40 ? 105 : 107.5;
    c.push(kc(i, high, low, 107.75));
  }
  for (let i = 51; i <= 59; i++) {
    const low = withInner ? (i === 55 ? 109.5 : 109.6) : 107.5;
    c.push(kc(i, withInner ? 109.9 : 108, low, withInner ? 109.75 : 107.75));
  }
  c.push(kc(60, 110.4, 109.8, 110.3));
  return c;
}
const ones = (n: number) => new Array<number>(n).fill(1);
const rectG: PatternGeometry = {
  kind: 'rectangle', timeframe: '4h', pivots: [hi(10, 110), lo(20, 105), hi(30, 110), lo(40, 105), hi(50, 110)],
  startIndex: 10, endIndex: 50, upper: () => 110, lower: () => 105, breakoutSide: 'both', height: 5,
  stopRef: { up: 107.5, down: 107.5 }, quality: 1, notes: [],
};

test('P1: rectangleStopRef lấy đáy nhỏ gần nhất sau lần chạm biên trên cuối, trước nến phá, nằm hẳn trong vùng', () => {
  const r = rectangleStopRef(innerSeries(), rectG, 'up', 60, ones(61));
  assert.equal(r.price, 109.5);
  assert.match(r.note, /pivot nhỏ phía trong/);
  const none = rectangleStopRef(innerSeries(false), rectG, 'up', 60, ones(61));
  assert.equal(none.price, 107.5); // không có → giữa vùng
  assert.match(none.note, /giữa vùng/);
  // pivot chỉ tính khi đã xác nhận trước/đúng nến phá: phá ở nến 57 thì đáy 55 chưa xác nhận (cần nến 58)
  assert.equal(rectangleStopRef(innerSeries(), rectG, 'up', 57, ones(61)).price, 107.5);
});

test('P1: chữ nhật h = 5A với pivot phía trong sát biên → kế hoạch hợp lệ, TP1 ≥ 1R (tính tay); giữa vùng → R > 3A bị bỏ', () => {
  const c = innerSeries();
  const st = { state: 'breakout' as const, breakoutIndex: 60, side: 'up' as const, breakoutLine: 110, distanceAtr: 0.3, retest: null, notes: [], signalStale: false, inBreakoutWindow: null };
  const args = (g: PatternGeometry) => ({
    mode: 'swing' as const, patternId: 'X|4h|rectangle|1|2', geometry: g, state: st, candles: c, atr: new Array<number>(c.length).fill(1), atr1h: 1, zones: [], multiMonth: null,
    btcSma200ReclaimedAt: null, capital: 10_000, riskPct: 0.5, costTier: 'high' as const, tickSize: 0.01, stepSize: 0.001, fundingRate: 0.0001, fundingIntervalHours: 8,
  });
  const inner = rectangleStopRef(c, rectG, 'up', 60, ones(61)).price;
  const r = buildPatternPlan(args({ ...rectG, stopRef: { ...rectG.stopRef, up: inner } }));
  assert.equal(r.status, 'ready', r.reason ?? '');
  const p = r.plan!;
  // SL = 109,5 − 0,5×A = 109,00; d = 0,3A → market; R = 110,3 − 109 = 1,3 = 1,3A
  assert.equal(p.stop, 109);
  assert.equal(p.entryType, 'market');
  assert.ok(Math.abs(p.riskAtr - 1.3) < 1e-9);
  // TP1 = T_ngắn = 110 + 5×0,5 = 112,5; chi phí = 0,25% + funding 0,01%×21 kỳ = 0,46% giá
  assert.equal(p.targets[0]!.price, 112.5);
  const hand = (112.5 - 110.3 - 0.0046 * 110.3) / 1.3; // = 1,302
  assert.ok(Math.abs(p.tp1NetR - hand) < 1e-9, `${p.tp1NetR} vs ${hand}`);
  assert.ok(p.tp1NetR >= 1);
  // Cùng mô hình, dùng giữa vùng 107,5 → SL 107, R = 3,3A > 3A → bỏ (lỗi cũ)
  const mid = buildPatternPlan(args(rectG));
  assert.equal(mid.status, 'rejected');
  assert.match(mid.reason!, /R = 3,30×A > 3×A/);
});

test('vòng sửa 2: chữ nhật đã phá — râu 108,9 chạm SL kế hoạch 109 → failed (máy trạng thái dùng cùng mức dừng); 109,1 → vẫn breakout', () => {
  const g = detectRectangles(innerSeries(), [hi(10, 110), lo(20, 105), hi(30, 110), lo(40, 105), hi(50, 110)], ones(61), '4h').pop()!;
  assert.ok(g.stopAt, 'chữ nhật phải mang hàm stopAt');
  const st = (low: number) => {
    const c = [...innerSeries(), kc(61, 110.6, low, 110.2)];
    return evaluateState(g, c, ones(c.length), '4h').state;
  };
  assert.notEqual(st(109.1), 'failed'); // râu chạm lại đường phá → retested, vẫn còn sống
  assert.equal(st(108.9), 'failed');
});

test('vòng sửa 2: Short gương — râu 106,1 chạm SL kế hoạch 106 (105,5 + 0,5×A) → failed; 105,9 → vẫn breakout', () => {
  const M = 215; // gương: biên 105..110 → 105..110 (M − giá)
  const mir = (x: Candle): Candle => ({ ...x, open: M - x.open, close: M - x.close, high: M - x.low, low: M - x.high });
  const base = innerSeries().map(mir);
  const g = detectRectangles(base, [lo(10, 105), hi(20, 110), lo(30, 105), hi(40, 110), lo(50, 105)], ones(61), '4h').pop()!;
  assert.equal(rectangleStopRef(base, g, 'down', 60, ones(61)).price, 105.5);
  const st = (high: number) => {
    const c = [...base, kc(61, high, 104.4, 104.8)];
    return evaluateState(g, c, ones(c.length), '4h').state;
  };
  assert.notEqual(st(105.9), 'failed'); // 105,9 < 106 = 105,5 + 0,5×A
  assert.equal(st(106.1), 'failed');
});

test('vòng sửa 2: gợn nhỏ sát biên (< 0,5×A) không dùng làm pivot phía trong', () => {
  const c = innerSeries().map((x, i) => (i >= 51 && i <= 59 ? { ...x, high: 109.95, low: i === 55 ? 109.8 : 109.85 } : x));
  const r = rectangleStopRef(c, rectG, 'up', 60, ones(61));
  assert.equal(r.price, 107.5); // 110 − 109,8 = 0,2 < 0,5×A → bỏ, dùng giữa vùng
  assert.ok(COMMON.patterns.rect.innerMinAtr > 0);
});
