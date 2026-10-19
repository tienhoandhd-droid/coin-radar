import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sma, ema, rsi, atr, macd, pivotHighs, pivotLows, stdev, last } from './indicators.ts';
import type { Candle } from './types.ts';

const close = (xs: number[], i: number) => (Number.isNaN(xs[i]!) ? NaN : Math.round(xs[i]! * 1e9) / 1e9);
function c(high: number, low: number, closeP: number): Candle {
  return { openTime: 0, closeTime: 0, open: closeP, high, low, close: closeP, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 };
}

test('sma: NaN khi chưa đủ, sau đó trung bình trượt', () => {
  assert.deepEqual(sma([1, 2, 3, 4, 5], 3).map((_, i, a) => close(a, i)), [NaN, NaN, 2, 3, 4]);
});

test('ema: khởi tạo bằng SMA rồi k = 2/(n+1)', () => {
  // seed (2+4+6)/3 = 4; 4 + 0.5*(8-4) = 6; 6 + 0.5*(12-6) = 9
  assert.deepEqual(ema([2, 4, 6, 8, 12], 3).map((_, i, a) => close(a, i)), [NaN, NaN, 4, 6, 9]);
});

test('rsi Wilder chu kỳ 2 — tính tay', () => {
  // thay đổi: +1 +1 -1 +1. TB đầu: gain 1, loss 0 → 100.
  // -1: gain (1*1+0)/2=0.5, loss (0+1)/2=0.5 → 50. +1: gain 0.75, loss 0.25 → RS 3 → 75.
  assert.deepEqual(rsi([1, 2, 3, 2, 3], 2).map((_, i, a) => close(a, i)), [NaN, NaN, 100, 50, 75]);
});

test('atr Wilder chu kỳ 2 — tính tay', () => {
  // TR: 2, 2, 3, 4. ATR đầu = (2+2)/2 = 2; (2*1+3)/2 = 2.5; (2.5*1+4)/2 = 3.25
  const candles = [c(10, 8, 9), c(11, 9, 10), c(12, 9, 11), c(11, 7, 8)];
  assert.deepEqual(atr(candles, 2).map((_, i, a) => close(a, i)), [NaN, 2, 2.5, 3.25]);
});

test('macd: chuỗi tăng đều → macd hằng, histogram 0', () => {
  const r = macd([1, 2, 3, 4, 5, 6], 2, 3, 2);
  assert.deepEqual(r.macd.map((_, i, a) => close(a, i)), [NaN, NaN, 0.5, 0.5, 0.5, 0.5]);
  assert.deepEqual(r.hist.map((_, i, a) => close(a, i)), [NaN, NaN, NaN, 0, 0, 0]);
});

test('pivot chỉ tính khi đủ n nến hai bên', () => {
  assert.deepEqual(pivotHighs([1, 3, 2, 5, 4, 3, 6], 1), [1, 3]);
  assert.deepEqual(pivotLows([5, 3, 4, 2, 3, 4, 1], 1), [1, 3]);
});

test('stdev mẫu và last', () => {
  assert.equal(Math.round(stdev([2, 4, 4, 4, 5, 5, 7, 9]) * 1e6) / 1e6, 2.13809);
  assert.equal(last([1, 2, 3]), 3);
  assert.ok(Number.isNaN(last([])));
});
