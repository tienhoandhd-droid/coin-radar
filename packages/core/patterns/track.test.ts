import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackPatterns, isTracked, knownAt } from './track.ts';
import { detectFlags } from './detect-flag.ts';
import { patternId, evaluateState } from './state.ts';
import { atr } from '../indicators.ts';
import { COMMON } from '../config.ts';
import type { Candle } from '../types.ts';
import { readFileSync } from 'node:fs';
import { parseKlines } from '../../binance/parse.ts';

const H4 = 4 * 3600_000;
function k(i: number, close: number, half = 0.5): Candle {
  return { openTime: i * H4, closeTime: (i + 1) * H4 - 1, open: close, high: close + half, low: close - half, close, volume: 1, quoteVolume: close, takerBuyQuote: close / 2 };
}
function wave(pts: [number, number][]): Candle[] {
  const out: Candle[] = [];
  for (let s = 0; s < pts.length - 1; s++) {
    const [i0, p0] = pts[s]!;
    const [i1, p1] = pts[s + 1]!;
    for (let i = i0; i < i1; i++) out.push(k(i, p0 + ((p1 - p0) * (i - i0)) / (i1 - i0)));
  }
  const [il, pl] = pts[pts.length - 1]!;
  out.push(k(il, pl));
  return out;
}

// Chữ nhật 100..110 (đỉnh 30/50, đáy 40/60) rồi nến 67 phá lên đóng 112 — trong hạn armed (0,5 × 30 nến kể từ nến xác nhận 63).
const RECT: [number, number][] = [[0, 90], [30, 110], [40, 100], [50, 110], [60, 100], [66, 108]];
const withBreak = () => [...wave(RECT), k(67, 112)];

test('trackPatterns: chữ nhật đang phá lên ở nến cuối → trạng thái breakout, chiều up, đường phá = biên trên', () => {
  const c = withBreak();
  const t = trackPatterns('BTCUSDT', c, '4h', ['rectangle', 'double', 'triangle', 'flag']);
  const rect = t.filter((x) => x.geometry.kind === 'rectangle');
  assert.equal(rect.length, 1, JSON.stringify(t.map((x) => [x.geometry.kind, x.result.state])));
  assert.equal(rect[0]!.result.state, 'breakout');
  assert.equal(rect[0]!.result.side, 'up');
  assert.equal(rect[0]!.result.breakoutLine, 110.5);
  assert.equal(rect[0]!.result.breakoutIndex, c.length - 1);
  assert.ok(isTracked(rect[0]!.result));
});

test('trackPatterns: chỉ chạy loại được yêu cầu', () => {
  const t = trackPatterns('BTCUSDT', withBreak(), '4h', ['flag']);
  assert.ok(t.every((x) => x.geometry.kind === 'bull_flag' || x.geometry.kind === 'bear_flag'));
});

test('trackPatterns: mỗi id một bản — bản trước chỉ bị thay khi còn armed/expired lúc bản sau được biết (cờ phát lại ở nhiều nến)', () => {
  // cán tăng 30 đơn vị trong 14 nến rồi cờ dốc xuống nhẹ 12 nến
  const pts: [number, number][] = [[0, 100], [30, 100], [44, 130], [56, 126]];
  const c = wave(pts);
  const a = atr(c, COMMON.patterns.atrPeriod);
  const all = detectFlags(c, a, '4h');
  assert.ok(all.length > 1, 'cần nhiều bản phát cùng id để kiểm');
  const t = trackPatterns('X', c, '4h', ['flag']);
  assert.ok(t.length >= 1, 'phải giữ lại ít nhất một cờ');
  const ids = t.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const x of t) {
    const same = all.filter((g) => patternId('X', g) === x.id).sort((p, q) => p.endIndex - q.endIndex);
    const pos = same.findIndex((g) => g.endIndex === x.geometry.endIndex);
    assert.ok(pos >= 0);
    // mọi bản trước bản được chọn đều còn armed/expired/forming tại nến bản kế tiếp được biết
    for (let q = 0; q < pos; q++) {
      const st = evaluateState(same[q]!, c, a, '4h', knownAt(same[q + 1]!)).state;
      assert.ok(st === 'armed' || st === 'expired' || st === 'forming', `bản ${same[q]!.endIndex}: ${st}`);
    }
    // bản được chọn: hoặc là bản cuối, hoặc đã sang trạng thái đóng băng khi bản sau được biết
    if (pos < same.length - 1) {
      const st = evaluateState(same[pos]!, c, a, '4h', knownAt(same[pos + 1]!)).state;
      assert.ok(!['armed', 'expired', 'forming'].includes(st), st);
    }
  }
});

test('isTracked: chỉ armed/chờ xác nhận/breakout/retested còn mới; cũ hoặc đã kết thúc thì không', () => {
  const r = { state: 'breakout' as const, breakoutIndex: 1, side: 'up' as const, breakoutLine: 1, distanceAtr: 1, retest: null, notes: [], signalStale: false, inBreakoutWindow: null };
  assert.equal(isTracked(r), true);
  assert.equal(isTracked({ ...r, signalStale: true }), false);
  assert.equal(isTracked({ ...r, state: 'failed' }), false);
  assert.equal(isTracked({ ...r, state: 'expired' }), false);
  assert.equal(isTracked({ ...r, state: 'armed' }), true);
  assert.equal(isTracked({ ...r, state: 'breakout_pending' }), true);
});

// ---------- P2: bản phát cùng id còn armed thì bị bản xác nhận sau THAY; chỉ đóng băng khi đã pending/phá/failed/invalidated ----------
// Repro review: chạm 30/40/…/100 (biên 100..110), phá ở nến 107. Bản 60/70 sẽ expired nếu giữ bản sớm nhất; bản 80/90/100 breakout.
const LONG_RECT: [number, number][] = [[0, 90], [30, 110], [40, 100], [50, 110], [60, 100], [70, 110], [80, 100], [90, 110], [100, 100], [106, 108]];
const longRect = () => [...wave(LONG_RECT), k(107, 112)];
const sig = (t: ReturnType<typeof trackPatterns>) =>
  JSON.stringify(t.map((x) => [x.id, x.geometry.kind, x.geometry.startIndex, x.geometry.endIndex, x.result.state, x.result.breakoutIndex, x.result.side]));

test('P2: chữ nhật 4 chạm mỗi biên rồi phá → breakout (bản phát mới nhất còn armed thay bản cũ), không expired', () => {
  const t = trackPatterns('X', longRect(), '4h', ['rectangle']);
  const rect = t.filter((x) => x.geometry.kind === 'rectangle' && isTracked(x.result));
  assert.equal(rect.length, 1, sig(t));
  assert.equal(rect[0]!.result.state, 'breakout');
  assert.equal(rect[0]!.geometry.endIndex, 100);
  assert.equal(rect[0]!.geometry.pivots.length, 8);
  assert.equal(rect[0]!.result.breakoutIndex, 107);
});

test('P2 chống look-ahead: trackPatterns trên tiền tố == trackPatterns cả chuỗi tại asOf (mọi nến)', () => {
  const c = longRect();
  for (let n = 20; n <= c.length; n++) {
    assert.equal(sig(trackPatterns('X', c.slice(0, n), '4h', ['rectangle', 'double', 'triangle', 'flag'])),
      sig(trackPatterns('X', c, '4h', ['rectangle', 'double', 'triangle', 'flag'], n - 1)), `nến ${n - 1}`);
  }
});

test('P2: bản đã phá (breakout) bị đóng băng — bản phát lại sau không ghi đè (cờ)', () => {
  // cờ: cán 100→130 trong 14 nến, cờ dốc xuống; nến 51 phá lên mạnh rồi quay vào → các bản phát sau không làm sống lại
  const pts: [number, number][] = [[0, 100], [30, 100], [44, 130], [50, 127]];
  const c = [...wave(pts), k(51, 133), k(52, 126), k(53, 126)];
  const t = trackPatterns('X', c, '4h', ['flag']);
  for (const x of t) assert.notEqual(x.result.state, 'armed', sig(t));
});

test('P2 chống look-ahead: chuỗi ngẫu nhiên có seed (đủ 4 loại) — tiền tố == cả chuỗi tại asOf ở mọi nến', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const c: Candle[] = [];
  let p = 100;
  for (let i = 0; i < 300; i++) {
    p += (rnd() - 0.5) * 3 + Math.sin(i / 15) * 0.8;
    c.push(k(i, p, 0.5 + rnd()));
  }
  const all = ['rectangle', 'double', 'triangle', 'flag'] as const;
  for (let n = 30; n <= c.length; n++) {
    assert.equal(sig(trackPatterns('X', c.slice(0, n), '4h', all)), sig(trackPatterns('X', c, '4h', all, n - 1)), `nến ${n - 1}`);
  }
});

// ---- B1 (rà soát cuối 1c): dữ liệu THẬT. ETHUSDT 4H, 800 nến Binance (cắt từ lần tải 19/10/2026). Trước khi sửa, asOf trên mảng
// dài hơn lệch tiền tố ở T = 729–736 (swingPivots thay pivot cuối bằng pivot tương lai cực hơn). Sau khi sửa: 0 lệch.
const realEth = (): Candle[] =>
  parseKlines(JSON.parse(readFileSync(new URL('./fixtures/ethusdt-4h.json', import.meta.url), 'utf8')), Number.MAX_SAFE_INTEGER);

test('B1 dữ liệu thật ETHUSDT 4H: trackPatterns(asOf = T) trên mảng dài == trackPatterns trên tiền tố c[0..T] — 0 lệch', () => {
  const c = realEth();
  assert.equal(c.length, 800);
  const all = ['rectangle', 'double', 'triangle', 'flag'] as const;
  const ser = (xs: ReturnType<typeof trackPatterns>) => JSON.stringify(xs.map((t) => [t.id, t.geometry.kind, t.geometry.pivots.map((p) => c[p.index]!.openTime),
    t.result.state, t.result.breakoutIndex, t.result.side, t.result.retest, t.result.signalStale]).sort());
  const bad: number[] = [];
  for (let T = 400; T < c.length - 1; T++) {
    if (ser(trackPatterns('ETHUSDT', c, '4h', all, T)) !== ser(trackPatterns('ETHUSDT', c.slice(0, T + 1), '4h', all))) bad.push(T);
  }
  assert.deepEqual(bad, [], `lệch tại T = ${bad.join(', ')}`);
});

test('B1 dữ liệu thật: ATR tính trên tiền tố == ATR cả chuỗi cắt tới T; evaluateState(asOf) == evaluateState trên tiền tố (cùng hình học)', () => {
  const c = realEth();
  const a = atr(c, COMMON.patterns.atrPeriod);
  let compared = 0;
  for (let T = 400; T < c.length - 1; T += 3) {
    const pre = c.slice(0, T + 1);
    const preAtr = atr(pre, COMMON.patterns.atrPeriod);
    assert.deepEqual(preAtr, a.slice(0, T + 1), `ATR lệch tại T = ${T}`);
    for (const t of trackPatterns('ETHUSDT', pre, '4h', ['rectangle', 'double', 'triangle', 'flag'])) {
      assert.deepEqual(evaluateState(t.geometry, c, a, '4h', T), evaluateState(t.geometry, pre, preAtr, '4h'), `T = ${T} ${t.id}`);
      compared++;
    }
  }
  assert.ok(compared > 100, `quá ít phép so sánh: ${compared}`);
});
