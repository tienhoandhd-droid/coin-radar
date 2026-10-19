import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateState, patternId, dedupePatterns, type StateResult } from './state.ts';
import { detectRectangles } from './detect-range.ts';
import { detectDoubles } from './detect-double.ts';
import { detectTriangles } from './detect-triangle.ts';
import { detectFlags } from './detect-flag.ts';
import { swingPivots } from './pivots.ts';
import { atr } from '../indicators.ts';
import { COMMON } from '../config.ts';
import type { Candle } from '../types.ts';
import type { PatternGeometry, PatternKind } from './types.ts';

function k(high: number, low: number, close: number, volume = 1): Candle {
  return { openTime: 0, closeTime: 0, open: close, high, low, close, volume, quoteVolume: volume, takerBuyQuote: volume / 2 };
}
// Nến "đóng ở giá x", râu ±1 (tuỳ chỉnh được)
const bar = (close: number, hi = close + 1, lo = close - 1, vol = 1) => k(hi, lo, close, vol);
const A = (n: number, v: number) => new Array<number>(n).fill(v);

// Chữ nhật tay: biên 100–110, nến 0..20, pivot cuối 20 → xác nhận ở nến 23; A = 2.
function rect(over: Partial<PatternGeometry> = {}): PatternGeometry {
  return {
    kind: 'rectangle', timeframe: '1d', pivots: [], startIndex: 0, endIndex: 20,
    upper: () => 110, lower: () => 100, breakoutSide: 'both', height: 10,
    stopRef: { up: 104, down: 106 }, quality: 1, notes: [], ...over,
  };
}
// 24 nến nền (0..23) trong vùng, rồi các nến thêm.
const base = (): Candle[] => Array.from({ length: 24 }, () => bar(105));
const run = (g: PatternGeometry, extra: Candle[], tf = '1d') => {
  const c = [...base(), ...extra];
  return evaluateState(g, c, A(c.length, 2), tf);
};

test('forming: pivot cuối chưa đủ 3 nến bên phải', () => {
  const c = Array.from({ length: 23 }, () => bar(105)); // nến cuối = 22 < 20+3
  const r = evaluateState(rect(), c, A(23, 2), '1d');
  assert.equal(r.state, 'forming');
  assert.equal(r.breakoutIndex, null);
});

test('armed: đã xác nhận, chưa phá', () => {
  const r = run(rect(), [bar(106), bar(107)]);
  assert.equal(r.state, 'armed');
  assert.equal(r.side, null);
  assert.equal(r.retest, null);
});

test('phá lên 1D: đóng vượt ≥ 0,25×A = 0,5 → breakout', () => {
  const r = run(rect(), [bar(110.6)]);
  assert.equal(r.state, 'breakout');
  assert.equal(r.side, 'up');
  assert.equal(r.breakoutIndex, 24);
  assert.equal(r.breakoutLine, 110);
  assert.ok(Math.abs(r.distanceAtr! - 0.3) < 1e-9);
});

test('phá xuống: đóng dưới biên dưới ≥ ngưỡng', () => {
  const r = run(rect(), [bar(99.4)]);
  assert.equal(r.state, 'breakout');
  assert.equal(r.side, 'down');
  assert.equal(r.breakoutLine, 100);
});

test('1H cần ≥ 0,5×A = 1: vượt 0,6 chỉ là breakout_pending', () => {
  const r = run(rect({ timeframe: '1h' }), [bar(110.6)], '1h');
  assert.equal(r.state, 'breakout_pending');
  assert.equal(r.side, 'up');
  assert.equal(r.breakoutIndex, null);
});

test('pending + 1 nến đóng nữa vẫn ngoài biên → breakout tại nến đó', () => {
  const r = run(rect({ timeframe: '1h' }), [bar(110.6), bar(110.2)], '1h');
  assert.equal(r.state, 'breakout');
  assert.equal(r.breakoutIndex, 25);
});

test('pending + nến sau quay lại trong mô hình → trở về armed', () => {
  const r = run(rect({ timeframe: '1h' }), [bar(110.6), bar(109.5)], '1h');
  assert.equal(r.state, 'armed');
  assert.equal(r.side, null);
});

test('retested: râu chạm lại đường phá ±0,5×A nhưng đóng ở phía phá', () => {
  const r = run(rect(), [bar(111), bar(112, 113, 110.8), bar(113)]);
  assert.equal(r.state, 'retested');
  assert.equal(r.retest, 'yes');
  assert.equal(r.breakoutIndex, 24);
});

test('retested khi phá xuống', () => {
  const r = run(rect(), [bar(99), bar(98, 99.2, 97)]);
  assert.equal(r.state, 'retested');
  assert.equal(r.side, 'down');
});

test('qua 10 nến không retest → giữ breakout, retest = none; trong 10 nến là null', () => {
  const far = (n: number) => Array.from({ length: n }, () => bar(115, 116, 114));
  const early = run(rect(), [bar(111), ...far(5)]);
  assert.equal(early.state, 'breakout');
  assert.equal(early.retest, null);
  const late = run(rect(), [bar(111), ...far(10)]);
  assert.equal(late.state, 'breakout');
  assert.equal(late.retest, 'none');
});

test('failed: đóng quay vào trong mô hình > 0,5×A (=1) dưới đường phá', () => {
  const r = run(rect(), [bar(111), bar(108.9)]);
  assert.equal(r.state, 'failed');
  assert.equal(r.breakoutIndex, 24);
});

test('không failed khi quay vào đúng 0,5×A hoặc ít hơn', () => {
  const r = run(rect(), [bar(111), bar(109, 111, 109)]);
  assert.notEqual(r.state, 'failed');
});

test('failed: chạm mức cắt lỗ (stopRef)', () => {
  const r = run(rect({ stopRef: { up: 107, down: 106 } }), [bar(111), bar(110.5, 112, 105.9)]); // mức dừng = 107 − 0,5×A(2) = 106
  assert.equal(r.state, 'failed');
});

test('invalidated: mô hình một chiều (hai đáy → phá lên) đóng dưới biên đối diện', () => {
  const g = rect({ kind: 'double_bottom', breakoutSide: 'up' });
  const r = run(g, [bar(106), bar(99.5)]);
  assert.equal(r.state, 'invalidated');
});

test('invalidated: hai đỉnh (phá xuống) đóng trên đỉnh', () => {
  const g = rect({ kind: 'double_top', breakoutSide: 'down' });
  const r = run(g, [bar(110.2)]);
  assert.equal(r.state, 'invalidated');
});

test('expired: chữ nhật armed > 0,5 × thời lượng (20 nến → 10 nến kể từ nến 23)', () => {
  const inside = (n: number) => Array.from({ length: n }, () => bar(105));
  assert.equal(run(rect(), inside(10)).state, 'armed'); // nến 33 = 23 + 10
  assert.equal(run(rect(), inside(11)).state, 'expired'); // nến 34
});

test('expired: nến phá vỡ ngay tại hạn vẫn tính là phá', () => {
  const inside = (n: number) => Array.from({ length: n }, () => bar(105));
  assert.equal(run(rect(), [...inside(10), bar(111)]).state, 'breakout');
});

test('expired: cờ > 20 nến kể từ tip', () => {
  const g = rect({ kind: 'bull_flag', breakoutSide: 'up', pivots: [{ index: 0, price: 90, kind: 'low' }, { index: 5, price: 110, kind: 'high' }], startIndex: 0, endIndex: 20 });
  const mk = (n: number) => evaluateState(g, Array.from({ length: n }, () => bar(105)), A(n, 2), '1d').state;
  assert.equal(mk(26), 'armed'); // nến cuối 25 = tip + 20
  assert.equal(mk(27), 'expired'); // nến 26
});

test('cờ: nến phá vỡ chính là endIndex vẫn được đánh giá', () => {
  const g = rect({ kind: 'bull_flag', breakoutSide: 'up', pivots: [{ index: 0, price: 90, kind: 'low' }, { index: 5, price: 110, kind: 'high' }], startIndex: 0, endIndex: 10 });
  const c = [...Array.from({ length: 10 }, () => bar(105)), bar(111)];
  const r = evaluateState(g, c, A(11, 2), '1d');
  assert.equal(r.state, 'breakout');
  assert.equal(r.breakoutIndex, 10);
});

test('expired: tam giác khi giá đã qua apex mà chưa phá', () => {
  // upper(i)=110-i/6, lower(i)=100+i/6 → cắt nhau tại nến 30
  const g = rect({ kind: 'sym_triangle', upper: (i) => 110 - i / 6, lower: (i) => 100 + i / 6, startIndex: 0, endIndex: 20 });
  const mk = (n: number) => evaluateState(g, Array.from({ length: n }, () => bar(105)), A(n, 2), '1d').state;
  assert.equal(mk(31), 'armed'); // nến 30 = apex
  assert.equal(mk(32), 'expired');
});

test('tam giác: phá ngoài cửa sổ 50–80% quãng tới apex chỉ ghi chú, trong cửa sổ thì không', () => {
  const g = rect({ kind: 'sym_triangle', upper: (i) => 110 - i / 6, lower: (i) => 100 + i / 6, startIndex: 0, endIndex: 20 });
  // nến 24 = 80% của quãng 0→30; upper(24) = 106
  const inWin = run(g, [bar(106.6)]);
  assert.equal(inWin.state, 'breakout');
  assert.ok(!inWin.notes.some((s) => s.includes('ngoài cửa sổ')));
  // nến 26 = 86,7% → ngoài cửa sổ; upper(26) ≈ 105,67
  const outWin = run(g, [bar(105), bar(105), bar(106.5)]);
  assert.equal(outWin.state, 'breakout');
  assert.equal(outWin.breakoutIndex, 26);
  assert.ok(outWin.notes.some((s) => s.includes('ngoài cửa sổ')));
});

test('volume nến phá ≥ 1,5×SMA20 → ghi chú dự kiến retest cao; không đổi trạng thái', () => {
  const hi = run(rect(), [bar(111, 112, 110, 2)]);
  assert.equal(hi.state, 'breakout');
  assert.ok(hi.notes.includes('volume nến phá cao: dự kiến retest cao'));
  const lo = run(rect(), [bar(111, 112, 110, 1.4)]);
  assert.equal(lo.state, 'breakout');
  assert.ok(!lo.notes.some((s) => s.includes('retest cao')));
});

test('ATR không hợp lệ ở nến đang xét → ném lỗi', () => {
  const c = [...base(), bar(111)];
  const a = A(c.length, 2);
  a[24] = NaN;
  assert.throws(() => evaluateState(rect(), c, a, '1d'), /ATR/);
});

test('khung không hỗ trợ → ném lỗi', () => {
  assert.throws(() => evaluateState(rect(), base(), A(24, 2), '5m'), /khung/);
});

test('patternId xác định và gồm mã, khung, loại, chỉ số 2 pivot đầu', () => {
  const g = rect({ pivots: [{ index: 5, price: 1, kind: 'high' }, { index: 9, price: 1, kind: 'low' }, { index: 14, price: 1, kind: 'high' }] });
  assert.equal(patternId('BTCUSDT', g), 'BTCUSDT|1d|rectangle|5|9');
});

test('dedupePatterns: trong cùng (loại, khung) cửa sổ chồng nhau chỉ giữ cái mới nhất đang armed/breakout', () => {
  const mkRec = (kind: PatternKind, tf: string, s: number, e: number, state: 'armed' | 'expired' | 'breakout') => ({
    geometry: rect({ kind, timeframe: tf, startIndex: s, endIndex: e }),
    id: `${kind}|${tf}|${s}|${e}`,
    result: { state, breakoutIndex: null, side: null, breakoutLine: null, distanceAtr: null, retest: null, notes: [], signalStale: false, inBreakoutWindow: null },
    tag: `${kind}${tf}${s}-${e}${state}`,
  });
  const recs = [
    mkRec('rectangle', '1d', 0, 30, 'armed'),
    mkRec('rectangle', '1d', 10, 40, 'armed'), // chồng, mới hơn → thắng
    mkRec('rectangle', '1d', 5, 45, 'expired'), // chồng nhưng hết hạn → thua dù mới nhất
    mkRec('rectangle', '1d', 60, 90, 'breakout'), // không chồng → giữ
    mkRec('rectangle', '4h', 0, 30, 'armed'), // khác khung → giữ
    mkRec('double_top', '1d', 0, 30, 'armed'), // khác loại → giữ
  ];
  const kept = dedupePatterns(recs).map((r) => r.tag);
  assert.deepEqual(kept.sort(), ['double_top1d0-30armed', 'rectangle1d10-40armed', 'rectangle1d60-90breakout', 'rectangle4h0-30armed'].sort());
});

test('C1: failed vẫn được phát hiện SAU 10 nến (chạm cắt lỗ)', () => {
  const far = (n: number) => Array.from({ length: n }, () => bar(115, 116, 114));
  const r = run(rect({ stopRef: { up: 107, down: 106 } }), [bar(111), ...far(15), bar(112, 113, 105.9)]);
  assert.equal(r.state, 'failed');
});

test('C1: failed sau 10 nến khi đóng quay vào trong > 0,5×A', () => {
  const far = (n: number) => Array.from({ length: n }, () => bar(115, 116, 114));
  const r = run(rect(), [bar(111), ...far(15), bar(108.9, 112, 108.5)]);
  assert.equal(r.state, 'failed');
});

test('C1: retest chỉ ghi nhận trong 10 nến; sau đó chạm lại đường phá không thành retested', () => {
  const far = (n: number) => Array.from({ length: n }, () => bar(115, 116, 114));
  const r = run(rect(), [bar(111), ...far(11), bar(112, 113, 110.2)]);
  assert.notEqual(r.state, 'retested');
  assert.equal(r.retest, 'none');
});

test('C1: signalStale khi breakout/retested quá maxSignalAgeBars nến', () => {
  const far = (n: number) => Array.from({ length: n }, () => bar(115, 116, 114));
  const max = COMMON.patterns.maxSignalAgeBars;
  const fresh = run(rect(), [bar(111), ...far(max)]);
  assert.equal(fresh.state, 'breakout');
  assert.equal(fresh.signalStale, false);
  const old = run(rect(), [bar(111), ...far(max + 1)]);
  assert.equal(old.state, 'breakout');
  assert.equal(old.signalStale, true);
});

test('I2: inBreakoutWindow máy đọc được: null nếu không phải tam giác; boolean cho tam giác', () => {
  assert.equal(run(rect(), [bar(111)]).inBreakoutWindow, null);
  const g = rect({ kind: 'sym_triangle', upper: (i) => 110 - i / 6, lower: (i) => 100 + i / 6, startIndex: 0, endIndex: 20 });
  assert.equal(run(g, [bar(106.6)]).inBreakoutWindow, true);
  assert.equal(run(g, [bar(105), bar(105), bar(106.5)]).inBreakoutWindow, false);
  assert.equal(run(g, [bar(105)]).inBreakoutWindow, null); // chưa phá
});

const ASOF = 189; // tại nến này bản phát đầu đã failed nhưng bản phát lại vẫn cho breakout (repro của review; mức dừng có đệm từ vòng sửa 2 nên lùi từ 160)
test('C2: cùng patternId nhiều hình học cờ → giữ trạng thái của hình học phát ĐẦU TIÊN (failed không bị ghi đè)', () => {
  const c = series();
  const a = atr(c, COMMON.patterns.atrPeriod);
  const id = 'X|1h|bear_flag|129|144';
  const same = geometriesOf(c).map(({ g }) => g).filter((g) => patternId('X', g) === id).sort((x, y) => x.endIndex - y.endIndex);
  assert.ok(same.length >= 3, `cần ≥3 bản phát lại cùng id, có ${same.length}`);
  const recs = same.map((g) => ({ id, geometry: g, result: evaluateState(g, c, a, TF, ASOF) }));
  const firstState = recs[0]!.result.state;
  assert.equal(firstState, 'failed');
  assert.ok(recs.some((r) => r.result.state === 'breakout'), 'repro: bản phát lại cho thấy breakout mâu thuẫn');
  const kept = dedupePatterns(recs);
  assert.equal(kept.length, 1);
  assert.equal(kept[0]!.geometry.endIndex, same[0]!.endIndex);
  assert.equal(kept[0]!.result.state, 'failed');
});

test('dedupe không để active chồng cửa sổ thay thế... xếp hạng breakout > pending > armed', () => {
  const mk = (id: string, s: number, e: number, state: 'armed' | 'breakout_pending' | 'breakout'): { id: string; geometry: PatternGeometry; result: StateResult } => ({
    id, geometry: rect({ startIndex: s, endIndex: e }),
    result: { state, breakoutIndex: null, side: null, breakoutLine: null, distanceAtr: null, retest: null, notes: [], signalStale: false, inBreakoutWindow: null },
  });
  const kept = dedupePatterns([mk('a', 0, 30, 'breakout'), mk('b', 5, 40, 'armed'), mk('c', 6, 41, 'breakout_pending')]);
  assert.deepEqual(kept.map((r) => r.id), ['a']);
});

// ---------- Bài kiểm bắt buộc chống look-ahead: chạy toàn bộ == chạy tăng dần ----------
// Chuỗi tổng hợp có chữ nhật (dao động 100–120), phá lên, hai đỉnh, tam giác, cờ.
function series(): Candle[] {
  const c: Candle[] = [];
  const push = (close: number, w = 1.5) => c.push(k(close + w, close - w, close, 1 + (c.length % 5) * 0.4));
  const leg = (from: number, to: number, n: number) => { for (let i = 1; i <= n; i++) push(from + ((to - from) * i) / n); };
  for (let i = 0; i < 20; i++) push(100); // nền
  for (let r = 0; r < 4; r++) { leg(100, 120, 8); leg(120, 100, 8); } // chữ nhật / ba đỉnh
  leg(100, 123, 6); leg(123, 119, 3); push(121); leg(121, 126, 3); // phá lên
  for (let t = 0; t < 3; t++) { leg(126, 150, 6); leg(150, 138, 6); } // đỉnh đôi/ba trên 150
  leg(138, 100, 12); // rơi mạnh
  for (let t = 0; t < 4; t++) { leg(100, 112 - t * 2, 5); leg(112 - t * 2, 100 + t * 2, 5); } // tam giác cân
  leg(100, 108, 3); leg(108, 130, 10); // cán cờ
  for (let i = 0; i < 12; i++) push(129 - i * 0.2, 0.8); // cờ
  leg(129, 140, 4); leg(140, 128, 12); leg(128, 141, 4);
  return c;
}
const TF = '1h';
function geometriesOf(c: Candle[]): { g: PatternGeometry; a: number[] }[] {
  const a = atr(c, COMMON.patterns.atrPeriod);
  const piv = swingPivots(c, a, COMMON.patterns.minSwingAtr[TF]);
  const gs = [
    ...detectRectangles(c, piv, a, TF),
    ...detectDoubles(c, piv, a, TF),
    ...detectTriangles(c, piv, a, TF),
    ...detectFlags(c, a, TF),
  ];
  return gs.map((g) => ({ g, a }));
}

// Chuỗi 2: chữ nhật, phá lên có retest nông, đi tiếp, rồi (sau > 10 nến) quay đầu thủng vùng → failed muộn.
function series2(): Candle[] {
  const c: Candle[] = [];
  const push = (close: number, w = 1.5, lo = close - w) => c.push(k(close + w, lo, close, 1 + (c.length % 5) * 0.4));
  const leg = (from: number, to: number, n: number) => { for (let i = 1; i <= n; i++) push(from + ((to - from) * i) / n); };
  for (let i = 0; i < 20; i++) push(100);
  for (let r = 0; r < 4; r++) { leg(100, 120, 8); leg(120, 100, 8); }
  leg(100, 120, 8);
  leg(120, 124, 2); // phá lên
  push(127, 1.5, 125.5); // nến đệm: râu KHÔNG chạm đường phá (để nến liền trước retest không tự chạm)
  push(125, 1.5, 120.2); // retest ở bi+2: râu chạm lại đường phá (~120) nhưng đóng ngoài
  leg(125, 135, 6);
  for (let i = 0; i < 14; i++) push(135 + (i % 2), 1);
  leg(135, 112, 6); // quay đầu thủng sâu vào trong sau > 10 nến
  for (let i = 0; i < 6; i++) push(112 + (i % 2), 1);
  return c;
}

// Gương giá (240 - giá): phá xuống + retest bằng râu trên, để phủ nhánh phá xuống.
const mirrorSeries = (c: Candle[]): Candle[] => c.map((x) => k(240 - x.low, 240 - x.high, 240 - x.close, x.volume));

function checkReplay(full: Candle[], minCompared: number): Set<string> {
  const fullAtr = atr(full, COMMON.patterns.atrPeriod);
  const fullGeoms = geometriesOf(full);
  assert.ok(fullGeoms.length >= 3, `cần đủ mô hình để kiểm, chỉ có ${fullGeoms.length}`);
  const states = new Set<string>();
  let compared = 0;
  for (let last = 30; last < full.length; last++) {
    const prefix = full.slice(0, last + 1);
    const prefixAtr = fullAtr.slice(0, last + 1);
    const incr = new Map<string, string>();
    for (const { g } of geometriesOf(prefix)) {
      incr.set(`${patternId('X', g)}|${g.endIndex}`, JSON.stringify(evaluateState(g, prefix, prefixAtr, TF)));
    }
    for (const { g } of fullGeoms) {
      // Hình học chỉ tồn tại khi đã đủ dữ liệu: pivot cuối xác nhận (hoặc nến e của cờ) nằm trong tiền tố.
      const known = g.kind.endsWith('flag') ? g.endIndex <= last : g.endIndex + COMMON.pivotConfirmBars <= last;
      if (!known) continue;
      const id = `${patternId('X', g)}|${g.endIndex}`;
      const viaFull = evaluateState(g, full, fullAtr, TF, last); // chạy trên toàn bộ chuỗi, xét tới nến `last`
      assert.ok(incr.has(id), `tiền tố ${last} thiếu mô hình ${id} mà toàn bộ có`);
      assert.equal(JSON.stringify(viaFull), incr.get(id), `lệch trạng thái ${id} tại nến ${last}`);
      states.add(viaFull.state);
      compared++;
    }
  }
  assert.ok(compared > minCompared, `quá ít phép so sánh: ${compared}`);
  return states;
}

test('chạy toàn bộ == chạy tăng dần từng nến (không look-ahead), phủ mọi trạng thái', () => {
  const s1 = checkReplay(series(), 100);
  const s2 = checkReplay(series2(), 50);
  const s3 = checkReplay(mirrorSeries(series2()), 50);
  const all = new Set([...s1, ...s2, ...s3]);
  for (const st of ['armed', 'breakout_pending', 'breakout', 'retested', 'failed', 'expired', 'invalidated']) {
    assert.ok(all.has(st), `bài replay chưa phủ trạng thái ${st}; có: ${[...all].join(',')}`);
  }
});

test('series2 có failed muộn (> 10 nến sau phá) và retested', () => {
  const full = series2();
  const a = atr(full, COMMON.patterns.atrPeriod);
  const rs = geometriesOf(full).map(({ g }) => ({ g, r: evaluateState(g, full, a, TF) }));
  assert.ok(rs.some(({ r }) => r.state === 'failed' && r.breakoutIndex !== null && full.length - 1 - r.breakoutIndex > COMMON.patterns.state.retestBars));
  assert.ok(rs.some(({ g }) => { for (let t = 30; t < full.length; t++) if (evaluateState(g, full, a, TF, t).state === 'retested') return true; return false; }));
});

// ---------- P3: khử trùng theo HỌ mô hình (tam giác tăng/giảm/cân; cờ tăng/giảm; hai đỉnh/hai đáy) ----------
test('P3: tam giác tăng và tam giác giảm chồng cửa sổ cùng khung → chỉ giữ một (nhiều chạm hơn khi cùng armed)', () => {
  const pv = (n: number) => Array.from({ length: n }, (_, i) => ({ index: i * 5, price: 1, kind: (i % 2 ? 'low' : 'high') as 'high' | 'low' }));
  const mk = (id: string, kind: PatternKind, s: number, e: number, n: number, state: 'armed' | 'breakout') => ({
    id, geometry: rect({ kind, startIndex: s, endIndex: e, pivots: pv(n) }),
    result: { state, breakoutIndex: null, side: null, breakoutLine: null, distanceAtr: null, retest: null, notes: [], signalStale: false, inBreakoutWindow: null },
  });
  assert.deepEqual(dedupePatterns([mk('asc', 'asc_triangle', 0, 50, 10, 'armed'), mk('desc', 'desc_triangle', 15, 45, 5, 'armed')]).map((r) => r.id), ['asc']);
  // breakout thắng armed dù ít chạm hơn
  assert.deepEqual(dedupePatterns([mk('asc', 'asc_triangle', 0, 50, 10, 'armed'), mk('desc', 'desc_triangle', 15, 45, 5, 'breakout')]).map((r) => r.id), ['desc']);
  // cùng họ cờ, cùng họ hai đỉnh/đáy
  assert.equal(dedupePatterns([mk('a', 'bull_flag', 0, 20, 2, 'armed'), mk('b', 'bear_flag', 10, 25, 2, 'armed')]).length, 1);
  assert.equal(dedupePatterns([mk('a', 'double_top', 0, 20, 3, 'armed'), mk('b', 'double_bottom', 10, 25, 3, 'armed')]).length, 1);
  // khác họ (chữ nhật vs tam giác) → giữ cả hai
  assert.equal(dedupePatterns([mk('a', 'rectangle', 0, 20, 4, 'armed'), mk('b', 'sym_triangle', 10, 25, 5, 'armed')]).length, 2);
});

// ---------- Vòng sửa 2: mức dừng của máy trạng thái = mức dừng của kế hoạch (một hàm dùng chung) ----------
import { patternStopLevel } from './state.ts';

test('patternStopLevel: mức mô hình ∓ đệm×A tại NẾN PHÁ (không dùng ATR nến sau)', () => {
  const c = [...base(), bar(111)];
  const a = A(c.length, 2);
  const lv = patternStopLevel(rect({ stopRef: { up: 107, down: 106 } }), c, a, 'up', 24);
  assert.equal(lv.ref, 107);
  assert.equal(lv.level, 107 - COMMON.patterns.plan.stopBufferAtr * 2);
  const a2 = [...a];
  a2[a2.length - 1] = 50; // ATR sau nến phá không được ảnh hưởng — ở đây nến phá là nến cuối nên đổi nến TRƯỚC thì cũng không
  a2[10] = 99;
  assert.equal(patternStopLevel(rect({ stopRef: { up: 107, down: 106 } }), c, a2, 'up', 23).level, 107 - COMMON.patterns.plan.stopBufferAtr * 2);
  const short = patternStopLevel(rect({ stopRef: { up: 107, down: 106 } }), c, a, 'down', 24);
  assert.equal(short.level, 106 + COMMON.patterns.plan.stopBufferAtr * 2);
});

test('failed: râu chạm mức dừng có đệm (chưa chạm thì vẫn breakout)', () => {
  const g = rect({ stopRef: { up: 107, down: 106 } });
  assert.notEqual(run(g, [bar(111), bar(110.5, 112, 106.1)]).state, 'failed'); // 106,1 > 106
  assert.equal(run(g, [bar(111), bar(110.5, 112, 106)]).state, 'failed');
});
