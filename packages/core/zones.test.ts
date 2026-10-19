import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findZones, stopSideZones, targetSideZones, zoneContaining, describeZone, type Zone } from './zones.ts';
import type { Candle } from './types.ts';

const candle = (i: number, high: number, low: number): Candle => ({
  openTime: i * 1000, closeTime: i * 1000 + 999, open: (high + low) / 2, high, low, close: (high + low) / 2,
  volume: 1, quoteVolume: 1, takerBuyQuote: 0.5,
});

// Chuỗi nến phẳng (high 210, low 200 → không có pivot) với các đáy tại vị trí 5, 12, 19, ... (cách nhau 7 nến)
function withDips(dips: number[], len = 5 + dips.length * 7 + 5): Candle[] {
  const out = Array.from({ length: len }, (_, i) => candle(i, 210, 200));
  dips.forEach((p, k) => { out[5 + k * 7] = candle(5 + k * 7, 210, p); });
  return out;
}
const flat = (len = 20): Candle[] => Array.from({ length: len }, (_, i) => candle(i, 210, 200));
const args = (entry: Candle[], trend: Candle[] = flat(), atr = 1) => ({ entry, trend, entryLabel: '4H', trendLabel: '1D', atr });
const inRange = (zs: Zone[], p: number) => zs.find((z) => z.low <= p && p <= z.high);

test('hai đáy cách 0,3 ATR gộp thành một vùng', () => {
  const zs = findZones(args(withDips([100, 100.3])));
  const z = inRange(zs, 100.1)!;
  assert.equal(z.low, 100);
  assert.equal(z.high, 100.3);
  assert.equal(z.touches, 2);
  assert.ok(z.strength >= 2);
});

test('hai đáy cách 3 ATR là hai vùng riêng', () => {
  const zs = findZones(args(withDips([100, 103])));
  const a = inRange(zs, 100)!;
  const b = inRange(zs, 103)!;
  assert.ok(a && b && a !== b);
});

test('chuỗi đáy sát nhau bị cắt khi rộng quá maxWidthAtr', () => {
  const zs = findZones(args(withDips([100, 100.4, 100.8, 101.2, 101.6])));
  assert.ok(zs.length >= 2);
  for (const z of zs) assert.ok(z.high - z.low <= 1.5 + 1e-9, `vùng rộng ${z.high - z.low}`);
});

test('đáy khung xu hướng: strength = trendWeight, nguồn có nhãn khung xu hướng', () => {
  const zs = findZones(args(flat(), withDips([123])));
  const z = inRange(zs, 123)!;
  assert.equal(z.strength, 2);
  assert.ok(z.sources.some((s) => s.includes('1D')));
});

test('vùng chứa số tròn: cộng roundBonus và có nguồn "số tròn"', () => {
  const z = inRange(findZones(args(withDips([99.8, 100.1]))), 100)!;
  assert.equal(z.strength, 2.5);
  assert.ok(z.sources.some((s) => s.startsWith('số tròn')));
});

test('ATR bằng 0 hoặc NaN → ném lỗi chứa ATR', () => {
  assert.throws(() => findZones(args(withDips([100]), flat(), 0)), /ATR/);
  assert.throws(() => findZones(args(withDips([100]), flat(), NaN)), /ATR/);
});

test('khối lượng: vùng thuộc tứ phân vị trên được cộng volumeBonus', () => {
  const entry = withDips([100, 110, 120, 130]); // 4 vùng; nến đáy 130 có khối lượng lớn nhất
  entry[5 + 3 * 7] = { ...entry[5 + 3 * 7]!, quoteVolume: 1000 };
  const zs = findZones(args(entry));
  assert.equal(zs.length, 4);
  const hot = inRange(zs, 130)!;
  assert.ok(hot.sources.includes('khối lượng giao dịch cao'));
  assert.equal(zs.filter((z) => z.sources.includes('khối lượng giao dịch cao')).length, 1);
});

const Z = (low: number, high: number): Zone => ({ low, high, strength: 2, touches: 1, sources: [] });
const zones = [Z(90, 92), Z(98, 102), Z(108, 110), Z(120, 122)];

test('stopSideZones / targetSideZones: chỉ vùng nằm hẳn một phía; vùng chứa giá không thuộc phía nào', () => {
  const lowsOf = (zs: Zone[]) => zs.map((z) => z.low);
  // giá 100 nằm trong vùng 98–102 → vùng đó bị loại khỏi cả hai phía
  assert.deepEqual(lowsOf(stopSideZones(zones, 100, 'long')), [90]);
  assert.deepEqual(lowsOf(targetSideZones(zones, 100, 'long')), [108, 120]);
  assert.deepEqual(lowsOf(stopSideZones(zones, 100, 'short')), [108, 120]);
  assert.deepEqual(lowsOf(targetSideZones(zones, 100, 'short')), [90]);
  // giá 105 nằm giữa các vùng → như cũ
  assert.deepEqual(lowsOf(stopSideZones(zones, 105, 'long')), [98, 90]);
  assert.deepEqual(lowsOf(stopSideZones(zones, 105, 'short')), [108, 120]);
  // giá chạm đúng mép vùng cũng không tính là nằm hẳn một phía
  assert.deepEqual(lowsOf(stopSideZones(zones, 102, 'long')), [90]);
  assert.deepEqual(lowsOf(stopSideZones(zones, 98, 'short')), [108, 120]);
});

test('zoneContaining: tìm vùng chứa giá (kể cả đúng mép), không có thì null', () => {
  assert.equal(zoneContaining(zones, 100)?.low, 98);
  assert.equal(zoneContaining(zones, 98)?.low, 98);
  assert.equal(zoneContaining(zones, 102)?.low, 98);
  assert.equal(zoneContaining(zones, 105), null);
});

test('describeZone: định dạng số kiểu Việt Nam', () => {
  const s = describeZone({ low: 0.056, high: 0.0572, strength: 4, touches: 4, sources: ['đáy 4H ×3', 'số tròn 0,057'] });
  assert.equal(s, '0,056000–0,057200 (đáy 4H ×3, số tròn 0,057)');
});
