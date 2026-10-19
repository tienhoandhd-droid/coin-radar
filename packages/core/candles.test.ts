import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isClosed } from './candles.ts';
import { parseKlines } from '../binance/parse.ts';

const k = (closeTime: number) => ({ openTime: closeTime - 999, closeTime, open: 1, high: 1, low: 1, close: 1, volume: 1, quoteVolume: 1, takerBuyQuote: 0 });

test('isClosed: nến đã đóng tại t khi và chỉ khi closeTime < t (closeTime Binance = mở nến sau − 1 ms)', () => {
  assert.equal(isClosed(k(999), 1000), true); // t = mở nến sau: đã đóng
  assert.equal(isClosed(k(999), 999), false); // t = đúng closeTime: chưa coi là đóng
  assert.equal(isClosed(k(999), 500), false);
});

test('parseKlines dùng cùng ranh giới isClosed', () => {
  const row = (o: number, c: number) => [o, '1', '1', '1', '1', '1', c, '1', 1, '1', '1', '0'];
  const raw = [row(0, 999), row(1000, 1999)];
  for (const now of [999, 1000, 1999, 2000]) {
    const got = parseKlines(raw, now).map((x) => x.closeTime);
    const want = [k(999), k(1999)].filter((x) => isClosed(x, now)).map((x) => x.closeTime);
    assert.deepEqual(got, want, `now=${now}`);
  }
});
