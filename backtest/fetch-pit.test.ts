import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Candle } from '../packages/core/types.ts';
import { HOUR } from './data.ts';
import { pitFastUniverse } from './fetch-pit.ts';

const T0 = Date.UTC(2026, 5, 1);
// chuỗi 1H với quoteVolume cố định cho mỗi giờ; volumeAt(h) cho phép đổi theo thời gian
function series(from: number, hours: number, qv: (i: number) => number): Candle[] {
  return Array.from({ length: hours }, (_, i) => ({
    openTime: from + i * HOUR, closeTime: from + (i + 1) * HOUR - 1, open: 1, high: 1, low: 1, close: 1, volume: 1, quoteVolume: qv(i), takerBuyQuote: 0,
  }));
}

test('pitFastUniverse: mã đổi hạng theo thời gian đều được tính; top-N theo thời điểm, không theo hôm nay', () => {
  const contracts = ['A', 'B', 'C'].map((symbol) => ({ symbol, onboardDate: 0 }));
  const hourly = new Map<string, Candle[]>([
    ['A', series(T0, 200, () => 100)],               // luôn hạng 1
    ['B', series(T0, 200, (i) => (i < 100 ? 50 : 1))],  // hạng 2 rồi tụt
    ['C', series(T0, 200, (i) => (i < 100 ? 1 : 50))],  // hạng 3 rồi lên hạng 2
  ]);
  const w = { start: T0 + 30 * HOUR, end: T0 + 190 * HOUR };
  const top2 = pitFastUniverse(contracts, hourly, w, 2);
  assert.deepEqual([...top2].sort(), ['A', 'B', 'C']);
  const first = pitFastUniverse(contracts, hourly, { start: T0 + 30 * HOUR, end: T0 + 60 * HOUR }, 2);
  assert.deepEqual([...first].sort(), ['A', 'B']);
});

test('pitFastUniverse: mã chưa niêm yết (onboardDate > t) hoặc không có nến 1H thì không vào', () => {
  const contracts = [{ symbol: 'A', onboardDate: 0 }, { symbol: 'NEW', onboardDate: T0 + 500 * HOUR }, { symbol: 'NOH', onboardDate: 0 }];
  const hourly = new Map<string, Candle[]>([['A', series(T0, 100, () => 1)], ['NEW', series(T0, 100, () => 9)]]);
  const got = pitFastUniverse(contracts, hourly, { start: T0 + 30 * HOUR, end: T0 + 90 * HOUR }, 150);
  assert.deepEqual([...got], ['A']);
});
