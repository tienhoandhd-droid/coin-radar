import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mtfSide, h1Trigger, h4TrendOk, frameTrend, alignSetup, m15Trigger, zoneTargetPlan } from './mtf-pullback.ts';
import type { Zone } from './zones.ts';
import type { Candle } from './types.ts';

const H = 3_600_000;
// [open, high, low, close]
const bars = (rows: Array<[number, number, number, number]>, iv = H): Candle[] => rows.map(([o, h, l, c], i) => ({
  openTime: i * iv, closeTime: (i + 1) * iv - 1, open: o, high: h, low: l, close: c, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5,
}));
const flat = (n: number, v: number): Array<[number, number, number, number]> => Array.from({ length: n }, () => [v, v + 0.5, v - 0.5, v]);

test('#24 mtfSide: chế độ BTC Lên → Long, Xuống → Short, Đi ngang → không vào', () => {
  assert.equal(mtfSide('up'), 'long');
  assert.equal(mtfSide('down'), 'short');
  assert.equal(mtfSide('sideways'), null);
});

test('#24 h1Trigger: nến 1H vừa đóng tăng, đóng > đỉnh nến trước và > EMA20, nến trước đóng ≤ EMA20 (Short đối xứng)', () => {
  const up = bars([...flat(25, 100), [99, 99.5, 98.5, 99], [99, 101, 98.8, 100.8]]);
  assert.equal(h1Trigger(up, 'long', 20), true);
  assert.equal(h1Trigger(up, 'short', 20), false);
  assert.equal(h1Trigger(bars([...flat(25, 100), [99, 99.5, 98.5, 99], [99, 100.2, 98.8, 99.4]]), 'long', 20), false, 'chưa vượt đỉnh nến trước');
  const dn = bars([...flat(25, 100), [101, 101.5, 100.5, 101], [101, 101.2, 99, 99.2]]);
  assert.equal(h1Trigger(dn, 'short', 20), true);
  assert.equal(h1Trigger(bars(flat(10, 100)), 'long', 20), false, 'thiếu nến');
});

test('#24 h4TrendOk / frameTrend: đóng so EMA50; Lên = đóng > EMA50 và EMA20 > EMA50; Xuống đối xứng; còn lại Trung tính', () => {
  const rising = bars(Array.from({ length: 80 }, (_, i) => [100 + i, 100.5 + i, 99.5 + i, 100 + i] as [number, number, number, number]));
  const falling = bars(Array.from({ length: 80 }, (_, i) => [200 - i, 200.5 - i, 199.5 - i, 200 - i] as [number, number, number, number]));
  assert.equal(h4TrendOk(rising, 'long', 50), true);
  assert.equal(h4TrendOk(rising, 'short', 50), false);
  assert.equal(frameTrend(rising, 20, 50), 'up');
  assert.equal(frameTrend(falling, 20, 50), 'down');
  // vừa tăng dài rồi rơi mạnh nến cuối dưới EMA50 nhưng EMA20 vẫn trên EMA50 → Trung tính
  assert.equal(frameTrend(bars([...rising.map((c) => [c.open, c.high, c.low, c.close] as [number, number, number, number]), [179, 179, 120, 120]]), 20, 50), 'neutral');
  assert.equal(frameTrend(bars(flat(30, 100)), 20, 50), 'neutral', 'thiếu nến cho EMA50');
});

test('#25–#29 alignSetup: mọi khung cấu hình cùng Lên/Xuống → lệnh xu hướng; #26 thêm lệnh hồi phục (1D ngược 4H + 1H)', () => {
  const F = ['1d', '4h', '1h'] as const;
  assert.deepEqual(alignSetup({ '1d': 'up', '4h': 'up', '1h': 'up' }, F, false), { side: 'long', kind: 'trend' });
  assert.deepEqual(alignSetup({ '1d': 'down', '4h': 'down', '1h': 'down' }, F, false), { side: 'short', kind: 'trend' });
  assert.equal(alignSetup({ '1d': 'down', '4h': 'up', '1h': 'up' }, F, false), null);
  assert.deepEqual(alignSetup({ '1d': 'down', '4h': 'up', '1h': 'up' }, F, true), { side: 'long', kind: 'recovery' });
  assert.deepEqual(alignSetup({ '1d': 'up', '4h': 'down', '1h': 'down' }, F, true), { side: 'short', kind: 'recovery' });
  assert.equal(alignSetup({ '1d': 'up', '4h': 'up', '1h': 'neutral' }, F, true), null);
  // một khung (#27/#28/#29): chỉ khung đó quyết định
  assert.deepEqual(alignSetup({ '15m': 'down', '1d': 'up' }, ['15m'], false), { side: 'short', kind: 'trend' });
  assert.equal(alignSetup({ '4h': 'neutral' }, ['4h'], false), null);
});

test('#25 m15Trigger: trong 8 nến 15m có nến chạm EMA20, nến vừa đóng tăng, đóng > EMA20 và > đỉnh nến trước (Short đối xứng)', () => {
  const cfg = { emaFast: 20, touchBars: 8 };
  const base = Array.from({ length: 40 }, (_, i) => [100 + i * 0.1, 100.3 + i * 0.1, 99.9 + i * 0.1, 100.1 + i * 0.1] as [number, number, number, number]);
  const ok = bars([...base, [103.5, 103.6, 102.0, 102.5], [102.5, 104.5, 102.4, 104.4]], 15 * 60_000);
  assert.equal(m15Trigger(ok, 'long', cfg), true);
  assert.equal(m15Trigger(ok, 'short', cfg), false);
  // không có nến nào chạm EMA20 trong 8 nến (giá luôn cao hơn hẳn) → không
  const far = bars([...Array.from({ length: 40 }, (_, i) => [100 + i, 100.5 + i, 99.8 + i, 100.4 + i] as [number, number, number, number])], 15 * 60_000);
  assert.equal(m15Trigger(far, 'long', cfg), false);
});

test('zoneTargetPlan: TP1 = vùng cản mạnh ≥ 2 gần nhất; R:R ở giá xấu nhất < 1,5 → bỏ; đủ → kế hoạch C2 hợp lệ, khối lượng 2%', () => {
  const z = (low: number, high: number, strength: number): Zone => ({ low, high, strength } as unknown as Zone);
  const common = { side: 'long' as const, markPrice: 100, stop: 98, maxEntry: 100.2, atr4: 1, minStrength: 2, minRR: 1.5, tickSize: 0.01, stepSize: 0.001,
    capital: 10_000, riskPct: 2, cost: { tierPct: 0.25, quoteVolPerMin: Infinity }, fundingBuffer: { maxAbsRate: 0.0001, intervalHours: 8 }, label: 'x', zone: null };
  const near = zoneTargetPlan({ ...common, zones: [z(101, 102, 1), z(103, 104, 2), z(110, 111, 3)] });
  assert.equal(near.plan, null, 'vùng mạnh gần nhất 103 → TP1 ≈ 102,9: (102,9 − 100,2)/2,2 ≈ 1,2R < 1,5');
  assert.match(near.reason, /< 1.5R/);
  const ok = zoneTargetPlan({ ...common, zones: [z(101, 102, 1), z(105, 106, 2)] });
  assert.ok(ok.plan !== null, ok.reason);
  assert.equal(ok.plan!.exit.policy, 'C2');
  assert.ok(ok.plan!.exit.trailing !== null);
  assert.ok(ok.plan!.targets[0]!.price! < 105 && ok.plan!.targets[0]!.price! > 104);
  assert.ok(ok.plan!.qty * 2 <= 200 + 1e-9);
  assert.equal(zoneTargetPlan({ ...common, zones: [] }).plan, null);
});
