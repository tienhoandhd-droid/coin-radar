import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundStep, liquidationPrice, maxSafeLeverage, positionSize, buildPlan, nearestLevels, tp1R } from './plan.ts';
import type { Zone } from './zones.ts';
import type { Candle } from './types.ts';

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

test('roundStep theo độ lớn giá', () => {
  assert.equal(roundStep(82_000), 1000);
  assert.equal(r6(roundStep(0.5)), 0.01);
});

test('giá thanh lý isolated gần đúng — tính tay', () => {
  assert.equal(r6(liquidationPrice(100, 10, 'long', 0.01)), 91); // 100*(1-0.1+0.01)
  assert.equal(r6(liquidationPrice(100, 10, 'short', 0.01)), 109); // 100*(1+0.1-0.01)
});

test('đòn bẩy an toàn tối đa: cắt lỗ 2%, buffer 1 → 1/(0,04+0,01) = 20', () => {
  assert.equal(r6(maxSafeLeverage(0.02, 0.01, 1)), 20);
});

test('khối lượng: vốn 1000, rủi ro 0,5%, vào 100, cắt 98, chi phí 0,5% → 2', () => {
  const s = positionSize(1000, 0.5, 100, 98, 0.5, 0.001);
  assert.equal(s.qty, 2);
  assert.equal(s.notional, 200);
  assert.equal(s.riskAmount, 5);
});

function k(i: number, close: number, high = close * 1.01, low = close * 0.99): Candle {
  return { openTime: i, closeTime: i, open: close, high, low, close, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 };
}

test('nearestLevels: pivot đã xác nhận gần nhất trên/dưới giá', () => {
  // đỉnh ở chỉ số 3 và đáy ở chỉ số 7 để đủ 3 nến xác nhận mỗi bên
  const closes = [100, 101, 102, 110, 101, 100, 99, 90, 99, 100, 101, 102, 103, 104];
  const c = closes.map((x, i) => k(i, x));
  const lv = nearestLevels(c, 3);
  assert.ok(lv.above !== null && lv.above > 104);
  assert.ok(lv.below !== null && lv.below < 104);
});

const zone = (low: number, high: number, strength = 1): Zone => ({ low, high, strength, touches: 1, sources: ['test'] });
// nến đóng cố định, biên độ 1 → ATR(14) = 1
function flat(price: number, n = 60): Candle[] {
  return Array.from({ length: n }, (_, i) => k(i, price, price + 0.5, price - 0.5));
}
const baseArgs = { mode: 'swing' as const, dailyAtr: 1, capital: 1000, riskPct: 0.5, costTier: 'high' as const,
  stepSize: 0.001, fundingRate: 0.0001, fundingIntervalHours: 8 };
const supports = [zone(95, 96, 3)];
const resistances = [zone(99, 100), zone(102, 103), zone(106, 107)];

test('Long vào trực tiếp: SL sau vùng hỗ trợ, TP1/2/3 trước vùng cản, chốt 50/30/20', () => {
  const p = buildPlan({ ...baseArgs, side: 'long', entry: flat(96.3), zones: [...supports, ...resistances] });
  assert.equal(p.entryType, 'market');
  assert.equal(r6(p.entry), 96.3);
  assert.equal(r6(p.stop), 94.7);
  assert.equal(r6(p.riskPerUnit), 1.6);
  assert.deepEqual(p.targets.map((t) => r6(t.price!)), [98.8, 101.8, 105.8]);
  assert.deepEqual(p.targets.map((t) => t.pct), [50, 30, 20]);
  assert.equal(p.afterTp1Stop, p.entry);
  assert.equal(p.valid, true);
  assert.equal(p.invalidReason, null);
  assert.match(p.targets[0]!.reason, /99,000–100,00/);
  assert.match(p.targets[2]!.reason, /106,00–107,00/);
  assert.match(p.stopReason, /95,000–96,000/);
  assert.equal(r6(p.targets[0]!.r!), r6(2.5 / 1.6));
  assert.equal(r6(tp1R(p)!), r6(2.5 / 1.6));
});

test('TP1 chỉ 0,31R (< 1R) → bỏ lệnh, nhãn lý do "quá gần"', () => {
  const p = buildPlan({ ...baseArgs, side: 'long', entry: flat(96.3), zones: [...supports, zone(97, 97.5), zone(102, 103), zone(106, 107)] });
  assert.equal(r6(p.targets[0]!.price!), 96.8);
  assert.equal(p.valid, false);
  assert.match(p.invalidReason!, /quá gần/);
});

test('không có vùng hỗ trợ đủ mạnh → không hợp lệ, mọi số hữu hạn', () => {
  for (const side of ['long', 'short'] as const) {
    const p = buildPlan({ ...baseArgs, side, entry: flat(96.3), zones: [zone(95, 96, 1), zone(99, 100)] });
    assert.equal(p.valid, false);
    assert.match(p.invalidReason!, side === 'long' ? /hỗ trợ/ : /kháng cự/);
    for (const key of ['entry', 'maxEntry', 'stop', 'riskPerUnit', 'qty', 'notional', 'riskAmount', 'safeLeverage', 'suggestedLeverage',
      'liquidationEstimate', 'marginNeeded', 'fundingCostR', 'trailAtr', 'afterTp1Stop', 'marketPrice'] as const) {
      assert.ok(Number.isFinite(p[key]), `${key} phải hữu hạn`);
    }
    assert.ok(Number.isFinite(p.entryZone.low) && Number.isFinite(p.entryZone.high));
  }
});

test('chỉ 1 vùng cản → TP2, TP3 để trailing stop', () => {
  const p = buildPlan({ ...baseArgs, side: 'long', entry: flat(96.3), zones: [...supports, zone(99, 100)] });
  assert.equal(r6(p.targets[0]!.price!), 98.8);
  for (const t of [p.targets[1]!, p.targets[2]!]) {
    assert.equal(t.price, null);
    assert.equal(t.r, null);
    assert.match(t.reason, /trailing/);
  }
  assert.equal(p.valid, true);
});

test('không có vùng cản phía trên → cả 3 TP là null nhưng vẫn hợp lệ', () => {
  const p = buildPlan({ ...baseArgs, side: 'long', entry: flat(96.3), zones: supports });
  assert.equal(p.targets.length, 3);
  assert.ok(p.targets.every((t) => t.price === null && /trailing/.test(t.reason)));
  assert.deepEqual(p.targets.map((t) => t.pct), [50, 30, 20]);
  assert.equal(p.valid, true);
  assert.equal(tp1R(p), null);
});

test('Short đối xứng: SL trên vùng kháng cự, TP dưới các vùng hỗ trợ giảm dần', () => {
  const zones = [zone(104, 105, 3), zone(100, 101), zone(97, 98), zone(93, 94)];
  const p = buildPlan({ ...baseArgs, side: 'short', entry: flat(103.7), zones });
  assert.equal(p.entryType, 'market');
  assert.equal(r6(p.stop), 105.3);
  assert.equal(r6(p.riskPerUnit), 1.6);
  assert.deepEqual(p.targets.map((t) => r6(t.price!)), [101.2, 98.2, 94.2]);
  assert.equal(p.afterTp1Stop, p.entry);
  assert.equal(p.valid, true);
  assert.match(p.stopReason, /104,00–105,00/);
});

test('kiểu vào lệnh Long: sát vùng → market; xa vùng → limit tại mép vùng + 0,1×ATR', () => {
  const zones = [...supports, zone(103, 104), zone(108, 109)];
  const near = buildPlan({ ...baseArgs, side: 'long', entry: flat(96.2), zones });
  assert.equal(near.entryType, 'market');
  assert.equal(r6(near.entry), 96.2);
  assert.equal(near.limitExpiryHours, null);
  assert.match(near.entryReason, /vào trực tiếp/);

  const far = buildPlan({ ...baseArgs, side: 'long', entry: flat(100), zones });
  assert.equal(far.entryType, 'limit');
  assert.equal(r6(far.entry), 96.1);
  assert.equal(r6(far.marketPrice), 100);
  assert.equal(r6(far.entryZone.low), 96);
  assert.equal(r6(far.entryZone.high), 96.1);
  assert.equal(far.limitExpiryHours, 24);
  assert.equal(r6(far.stop), 94.7);
  assert.equal(r6(far.riskPerUnit), 1.4);
  assert.equal(r6(far.targets[0]!.price!), 102.8); // vùng cản tính từ giá limit
  assert.equal(r6(far.targets[0]!.r!), r6(6.7 / 1.4));
  assert.match(far.entryReason, /limit/);
  assert.match(far.entryReason, /24 giờ/);

  const fast = buildPlan({ ...baseArgs, mode: 'fast', side: 'long', entry: flat(100), zones });
  assert.equal(fast.limitExpiryHours, 2);
});

test('kiểu vào lệnh Short đối xứng', () => {
  const zones = [zone(104, 105, 3), zone(97, 98), zone(92, 93)];
  const near = buildPlan({ ...baseArgs, side: 'short', entry: flat(103.8), zones });
  assert.equal(near.entryType, 'market');
  const far = buildPlan({ ...baseArgs, side: 'short', entry: flat(100), zones });
  assert.equal(far.entryType, 'limit');
  assert.equal(r6(far.entry), 103.9);
  assert.equal(r6(far.entryZone.low), 103.9);
  assert.equal(r6(far.entryZone.high), 104);
  assert.equal(r6(far.stop), 105.3);
  assert.equal(r6(far.targets[0]!.price!), 98.2);
  assert.equal(far.limitExpiryHours, 24);
});

test('Swing: khoảng cắt lỗ không nhỏ hơn 1×ATR ngày; funding Long trả, Short nhận', () => {
  const zones = [...supports, ...resistances];
  const L = buildPlan({ ...baseArgs, dailyAtr: 3, side: 'long', entry: flat(96.3), zones });
  assert.ok(L.entry - L.stop >= 3 - 1e-9);
  const S = buildPlan({ ...baseArgs, side: 'short', entry: flat(103.7), zones: [zone(104, 105, 3), zone(97, 98)] });
  assert.ok(L.fundingCostR > 0 && S.fundingCostR < 0);
});

test('buildPlan báo lỗi khi nến phẳng (ATR = 0), không trả giá trị vô nghĩa', () => {
  const flat = Array.from({ length: 60 }, (_, i) => k(i, 100, 100, 100));
  const args = { mode: 'fast' as const, side: 'long' as const, entry: flat, dailyAtr: 3, capital: 1000, riskPct: 0.5,
    costTier: 'high' as const, stepSize: 0.001, fundingRate: 0.0001, fundingIntervalHours: 8, zones: [] };
  assert.throws(() => buildPlan(args), /ATR/);
});

test('buildPlan báo lỗi khi dữ liệu dưới 15 nến (ATR chưa tính được)', () => {
  const short = Array.from({ length: 10 }, (_, i) => k(i, 100 + i));
  const args = { mode: 'fast' as const, side: 'long' as const, entry: short, dailyAtr: 3, capital: 1000, riskPct: 0.5,
    costTier: 'high' as const, stepSize: 0.001, fundingRate: 0.0001, fundingIntervalHours: 8, zones: [] };
  assert.throws(() => buildPlan(args), /ATR/);
});

test('buildPlan Swing báo lỗi khi ATR ngày là NaN', () => {
  const c = Array.from({ length: 60 }, (_, i) => k(i, 100 + Math.sin(i / 3) * 2));
  const args = { mode: 'swing' as const, side: 'long' as const, entry: c, dailyAtr: NaN, capital: 1000, riskPct: 0.5,
    costTier: 'high' as const, stepSize: 0.001, fundingRate: 0.0001, fundingIntervalHours: 8, zones: [] };
  assert.throws(() => buildPlan(args), /ATR ngày/);
});

test('buildPlan: funding tính theo số kỳ thật — hợp đồng 4h trả gấp đôi hợp đồng 8h cùng mức/kỳ, 1h gấp 8 lần', () => {
  const c = Array.from({ length: 60 }, (_, i) => k(i, 100 + Math.sin(i / 3) * 2));
  const base = { mode: 'swing' as const, side: 'long' as const, entry: c, dailyAtr: 3, capital: 1000, riskPct: 0.5,
    costTier: 'high' as const, stepSize: 0.001, fundingRate: 0.0001, zones: [] };
  const p8 = buildPlan({ ...base, fundingIntervalHours: 8 });
  const p4 = buildPlan({ ...base, fundingIntervalHours: 4 });
  const p1 = buildPlan({ ...base, fundingIntervalHours: 1 });
  assert.equal(r6(p4.fundingCostR / p8.fundingCostR), 2);
  assert.equal(r6(p1.fundingCostR / p8.fundingCostR), 8);
});

test('buildPlan: ghi lại riskPct đã dùng và riskAmount theo đó', () => {
  const c = Array.from({ length: 60 }, (_, i) => k(i, 100 + Math.sin(i / 3) * 2));
  const p = buildPlan({ mode: 'swing', side: 'long', entry: c, dailyAtr: 3, capital: 1000, riskPct: 0.25, costTier: 'high',
    stepSize: 0.001, fundingRate: 0.0001, fundingIntervalHours: 8, zones: [] });
  assert.equal(p.riskPct, 0.25);
  assert.equal(p.riskAmount, 2.5);
});

test('kháng cự/hỗ trợ ngay sát giá vào (TP ≤ entry) → không hợp lệ, không nhảy sang vùng xa', () => {
  const L = buildPlan({ ...baseArgs, side: 'long', entry: flat(96.3), zones: [...supports, zone(96.4, 97), zone(102, 103)] });
  assert.equal(L.valid, false);
  assert.match(L.invalidReason!, /sát/);
  assert.ok(L.targets.every((t) => t.price === null));
  const S = buildPlan({ ...baseArgs, side: 'short', entry: flat(103.7), zones: [zone(104, 105, 3), zone(102.9, 103.6), zone(98, 99)] });
  assert.equal(S.valid, false);
  assert.match(S.invalidReason!, /Hỗ trợ ngay sát dưới/);
});

test('lệnh limit: vùng cản ngay trên giá limit → không hợp lệ', () => {
  const p = buildPlan({ ...baseArgs, side: 'long', entry: flat(100), zones: [...supports, zone(96.2, 97), zone(103, 104)] });
  assert.equal(p.entryType, 'limit');
  assert.equal(p.valid, false);
  assert.match(p.invalidReason!, /sát/);
});

test('giá rất nhỏ: lý do vào lệnh hiển thị đủ chữ số có nghĩa', () => {
  const zones = [zone(0.00095, 0.00096, 3), zone(0.00103, 0.00104)];
  const p = buildPlan({ ...baseArgs, mode: 'fast', side: 'long', entry: flat(0.00100).map((c) => ({ ...c, high: c.close * 1.005, low: c.close * 0.995 })), zones });
  assert.equal(p.entryType, 'limit');
  assert.match(p.entryReason, /0,00096100/);
  assert.doesNotMatch(p.entryReason, /0,0010\b/);
});
