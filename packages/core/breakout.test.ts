import { test } from 'node:test';
import assert from 'node:assert/strict';
import { donchianBreakout } from './breakout.ts';
import type { Candle } from './types.ts';

const d = (closes: number[]): Candle[] => closes.map((close, i) => ({ openTime: i, closeTime: i + 1, open: close, high: close, low: close, close, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 }));

test('donchianBreakout: đóng cuối > đỉnh ĐÓNG của N nến trước đó (không gồm nến cuối); thiếu nến → null', () => {
  assert.equal(donchianBreakout(d([1, 5, 3, 4, 6]), 4), true);
  assert.equal(donchianBreakout(d([1, 5, 3, 4, 5]), 4), false, 'bằng đỉnh chưa phải phá');
  assert.equal(donchianBreakout(d([9, 5, 3, 4, 6]), 3), true, 'chỉ xét N nến gần nhất');
  assert.equal(donchianBreakout(d([5, 6]), 4), null);
});
