import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marketRegime, circuitBreaker, allowedSide } from './regime.ts';
import type { Candle } from './types.ts';

function series(closes: number[], rangePct = 0.01): Candle[] {
  return closes.map((close, i) => ({
    openTime: i, closeTime: i, open: close, high: close * (1 + rangePct), low: close * (1 - rangePct),
    close, volume: 1, quoteVolume: close, takerBuyQuote: close / 2,
  }));
}
const up = Array.from({ length: 260 }, (_, i) => 100 + i);
const down = Array.from({ length: 260 }, (_, i) => 359 - i);
const flat = Array.from({ length: 260 }, (_, i) => 100 + (i % 2));

test('xu hướng tăng đều → up', () => {
  assert.equal(marketRegime(series(up)).regime, 'up');
});
test('giảm sâu dưới SMA200 → down', () => {
  assert.equal(marketRegime(series(down)).regime, 'down');
});
test('đi ngang quanh SMA200 → sideways', () => {
  assert.equal(marketRegime(series(flat)).regime, 'sideways');
});
test('thiếu dữ liệu (<200 nến) → sideways kèm lý do', () => {
  const r = marketRegime(series(up.slice(0, 150)));
  assert.equal(r.regime, 'sideways');
  assert.match(r.reasons.join(' '), /Thiếu dữ liệu/);
});

test('đúng 200 nến tăng đều → sideways kèm "Thiếu dữ liệu" (cần 201 nến)', () => {
  const r = marketRegime(series(Array.from({ length: 200 }, (_, i) => 100 + i)));
  assert.equal(r.regime, 'sideways');
  assert.match(r.reasons.join(' '), /Thiếu dữ liệu/);
});
test('201 nến tăng đều (100..300) → up', () => {
  assert.equal(marketRegime(series(Array.from({ length: 201 }, (_, i) => 100 + i))).regime, 'up');
});

test('cầu dao: BTC giảm 5% trong 4 nến 1H → bật', () => {
  const closes = [...Array.from({ length: 30 }, () => 100), 99, 97, 96, 95];
  assert.equal(circuitBreaker(series(closes, 0.002), 12).tripped, true);
});
test('cầu dao: biến động bình thường → không bật', () => {
  const closes = Array.from({ length: 34 }, (_, i) => 100 + (i % 2) * 0.3);
  assert.equal(circuitBreaker(series(closes, 0.002), 12).tripped, false);
});

test('allowedSide: up chỉ Long, Short cần điểm ≥ 80', () => {
  assert.equal(allowedSide('up', 'long', 70), true);
  assert.equal(allowedSide('up', 'short', 75), false);
  assert.equal(allowedSide('up', 'short', 80), true);
  assert.equal(allowedSide('down', 'long', 79), false);
  assert.equal(allowedSide('sideways', 'short', 70), true);
});

test('cầu dao: nhánh biên độ nến cuối > 3×ATR → bật', () => {
  const c = series(Array.from({ length: 40 }, () => 100), 0.002);
  c[39] = { ...c[39]!, high: 110, low: 90 };
  const r = circuitBreaker(c, 12);
  assert.equal(r.tripped, true);
  assert.match(r.reason ?? '', /ATR/);
});

test('cầu dao: sập cách đây 5 giờ vẫn giữ bật khi dừng 12h (swing)', () => {
  // 30 nến phẳng, sập 5% trong 4 nến (chỉ số 30..33), rồi 5 nến phẳng ở đáy
  const closes = [...Array.from({ length: 30 }, () => 100), 99, 97, 96, 95, ...Array.from({ length: 5 }, () => 95)];
  const r = circuitBreaker(series(closes, 0.002), 12);
  assert.equal(r.tripped, true);
  assert.match(r.reason ?? '', /bật lúc/);
  assert.match(r.reason ?? '', /dừng tới/);
});

test('cầu dao: cùng tình huống nhưng dừng chỉ 3h (fast) → đã hết hạn dừng', () => {
  const closes = [...Array.from({ length: 30 }, () => 100), 99, 97, 96, 95, ...Array.from({ length: 5 }, () => 95)];
  assert.equal(circuitBreaker(series(closes, 0.002), 3).tripped, false);
});

test('cầu dao: sập cách đây 13 giờ, dừng 12h → đã tắt', () => {
  const closes = [...Array.from({ length: 30 }, () => 100), 99, 97, 96, 95, ...Array.from({ length: 13 }, () => 95)];
  assert.equal(circuitBreaker(series(closes, 0.002), 12).tripped, false);
});
