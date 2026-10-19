import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isClosed, candleProblems, intervalMs } from './candles.ts';
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

// I3: dữ liệu cũ / thiếu nến / sai thứ tự
const H4 = 4 * 3_600_000;
const bars = (n: number, end: number, iv = H4) => Array.from({ length: n }, (_, i) => {
  const openTime = end - (n - i) * iv;
  return { openTime, closeTime: openTime + iv - 1, open: 1, high: 1, low: 1, close: 1, volume: 1, quoteVolume: 1, takerBuyQuote: 0 };
});
const NOW = Date.parse('2026-10-19T10:30:00Z'); // giữa nến 4H 08:00–12:00 → nến đã đóng cuối cùng là 04:00–08:00

test('I3 intervalMs: 15m/1h/4h/1d; khung lạ → ném lỗi', () => {
  assert.equal(intervalMs('15m'), 900_000);
  assert.equal(intervalMs('4h'), H4);
  assert.equal(intervalMs('1d'), 86_400_000);
  assert.throws(() => intervalMs('3m'), /khung/);
});

test('I3 candleProblems: chuỗi liền, nến cuối là nến vừa đóng → không có vấn đề', () => {
  assert.deepEqual(candleProblems(bars(50, Date.parse('2026-10-19T08:00:00Z')), '4h', NOW), []);
});

test('I3 candleProblems: nến cuối cũ hơn 1 khung (+ dung sai) → "dữ liệu cũ"', () => {
  const p = candleProblems(bars(50, Date.parse('2026-10-19T04:00:00Z')), '4h', NOW);
  assert.equal(p.length, 1);
  assert.match(p[0]!, /dữ liệu cũ/);
});

test('I3 candleProblems: thiếu nến giữa chuỗi → nêu số nến thiếu; trùng/sai thứ tự → lỗi', () => {
  const c = bars(50, Date.parse('2026-10-19T08:00:00Z'));
  const gap = [...c.slice(0, 20), ...c.slice(23)];
  assert.match(candleProblems(gap, '4h', NOW).join(), /thiếu 3 nến/);
  const dup = [...c.slice(0, 21), c[20]!, ...c.slice(21)];
  assert.match(candleProblems(dup, '4h', NOW).join(), /trùng hoặc sai thứ tự/);
  assert.match(candleProblems([], '4h', NOW).join(), /không có nến/);
});
