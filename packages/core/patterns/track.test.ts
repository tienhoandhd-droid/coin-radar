import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackPatterns, isTracked } from './track.ts';
import { detectFlags } from './detect-flag.ts';
import { patternId } from './state.ts';
import { atr } from '../indicators.ts';
import { COMMON } from '../config.ts';
import type { Candle } from '../types.ts';

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

test('trackPatterns: mỗi id một bản — bản phát SỚM NHẤT (cờ phát lại ở nhiều nến)', () => {
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
    const minEnd = Math.min(...all.filter((g) => patternId('X', g) === x.id).map((g) => g.endIndex));
    assert.equal(x.geometry.endIndex, minEnd);
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
