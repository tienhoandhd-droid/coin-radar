import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundStep, liquidationPrice, maxSafeLeverage, positionSize, buildPlan, tp1R } from './plan.ts';
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

const zone = (low: number, high: number, strength = 1): Zone => ({ low, high, strength, touches: 1, sources: ['test'] });
// nến đóng cố định, biên độ 1 → ATR(14) = 1
function flat(price: number, n = 60): Candle[] {
  return Array.from({ length: n }, (_, i) => k(i, price, price + 0.5, price - 0.5));
}
const baseArgs = { mode: 'swing' as const, dailyAtr: 1, tickSize: 0.001, capital: 1000, riskPct: 0.5, costTier: 'high' as const,
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
  assert.match(p.targets[0]!.reason, /99,000–100,000/);
  assert.match(p.targets[2]!.reason, /106,000–107,000/);
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
  assert.match(p.stopReason, /104,000–105,000/);
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
    costTier: 'high' as const, tickSize: 0.001, stepSize: 0.001, fundingRate: 0.0001, fundingIntervalHours: 8, zones: [] };
  assert.throws(() => buildPlan(args), /ATR/);
});

test('buildPlan báo lỗi khi dữ liệu dưới 15 nến (ATR chưa tính được)', () => {
  const short = Array.from({ length: 10 }, (_, i) => k(i, 100 + i));
  const args = { mode: 'fast' as const, side: 'long' as const, entry: short, dailyAtr: 3, capital: 1000, riskPct: 0.5,
    costTier: 'high' as const, tickSize: 0.001, stepSize: 0.001, fundingRate: 0.0001, fundingIntervalHours: 8, zones: [] };
  assert.throws(() => buildPlan(args), /ATR/);
});

test('buildPlan Swing báo lỗi khi ATR ngày là NaN', () => {
  const c = Array.from({ length: 60 }, (_, i) => k(i, 100 + Math.sin(i / 3) * 2));
  const args = { mode: 'swing' as const, side: 'long' as const, entry: c, dailyAtr: NaN, capital: 1000, riskPct: 0.5,
    costTier: 'high' as const, tickSize: 0.001, stepSize: 0.001, fundingRate: 0.0001, fundingIntervalHours: 8, zones: [] };
  assert.throws(() => buildPlan(args), /ATR ngày/);
});

test('buildPlan: funding tính theo số kỳ thật — hợp đồng 4h trả gấp đôi hợp đồng 8h cùng mức/kỳ, 1h gấp 8 lần', () => {
  const c = Array.from({ length: 60 }, (_, i) => k(i, 100 + Math.sin(i / 3) * 2));
  const base = { mode: 'swing' as const, side: 'long' as const, entry: c, dailyAtr: 3, capital: 1000, riskPct: 0.5,
    costTier: 'high' as const, tickSize: 0.001, stepSize: 0.001, fundingRate: 0.0001, zones: [] };
  const p8 = buildPlan({ ...base, fundingIntervalHours: 8 });
  const p4 = buildPlan({ ...base, fundingIntervalHours: 4 });
  const p1 = buildPlan({ ...base, fundingIntervalHours: 1 });
  assert.equal(r6(p4.fundingCostR / p8.fundingCostR), 2);
  assert.equal(r6(p1.fundingCostR / p8.fundingCostR), 8);
});

test('buildPlan: ghi lại riskPct đã dùng và riskAmount theo đó', () => {
  const c = Array.from({ length: 60 }, (_, i) => k(i, 100 + Math.sin(i / 3) * 2));
  const p = buildPlan({ mode: 'swing', side: 'long', entry: c, dailyAtr: 3, capital: 1000, riskPct: 0.25, costTier: 'high',
    tickSize: 0.001, stepSize: 0.001, fundingRate: 0.0001, fundingIntervalHours: 8, zones: [] });
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
  const p = buildPlan({ ...baseArgs, mode: 'fast', side: 'long', tickSize: 1e-8, entry: flat(0.00100).map((c) => ({ ...c, high: c.close * 1.005, low: c.close * 0.995 })), zones });
  assert.equal(p.entryType, 'limit');
  assert.match(p.entryReason, /0,00096100/);
  assert.doesNotMatch(p.entryReason, /0,0010\b/);
});

// ---- Lý do SL đúng từng bước thực sự đã áp dụng (I-1) ----
test('lý do SL Long: chỉ vùng − 0,3×ATR khi không bước nào khác đổi SL', () => {
  const p = buildPlan({ ...baseArgs, side: 'long', entry: flat(96.3), zones: supports });
  assert.equal(r6(p.stop), 94.7);
  assert.match(p.stopReason, /− 0,3×ATR = 94,700$/);
  assert.doesNotMatch(p.stopReason, /nới|số tròn/);
});

test('lý do SL Long: Swing nới tới tối thiểu 1×ATR ngày thì lý do ghi bước đó và SL cuối khớp', () => {
  const p = buildPlan({ ...baseArgs, dailyAtr: 3, side: 'long', entry: flat(96.3), zones: supports });
  assert.equal(r6(p.stop), 93.3);
  assert.match(p.stopReason, /− 0,3×ATR = 94,700; nới tới tối thiểu 1×ATR ngày = 93,300$/);
});

test('lý do SL Long: đẩy qua số tròn thì lý do ghi số tròn và SL cuối khớp', () => {
  const p = buildPlan({ ...baseArgs, side: 'long', entry: flat(96.3), zones: [zone(95.4, 96, 3)] });
  assert.equal(r6(p.stop), 94.8);
  assert.match(p.stopReason, /− 0,3×ATR = 95,100; đẩy qua số tròn 95,000 = 94,800$/);
});

test('lý do SL Short: ba đường (chỉ vùng / sàn ATR ngày / số tròn)', () => {
  const a = buildPlan({ ...baseArgs, side: 'short', entry: flat(103.7), zones: [zone(104, 105, 3)] });
  assert.equal(r6(a.stop), 105.3);
  assert.match(a.stopReason, /\+ 0,3×ATR = 105,300$/);
  assert.doesNotMatch(a.stopReason, /nới|số tròn/);
  const b = buildPlan({ ...baseArgs, dailyAtr: 3, side: 'short', entry: flat(103.7), zones: [zone(104, 105, 3)] });
  assert.equal(r6(b.stop), 106.7);
  assert.match(b.stopReason, /\+ 0,3×ATR = 105,300; nới tới tối thiểu 1×ATR ngày = 106,700$/);
  const c = buildPlan({ ...baseArgs, dailyAtr: 0.5, side: 'short', entry: flat(109), zones: [zone(109.2, 109.6, 3)] });
  assert.equal(r6(c.stop), 110.2); // bước số tròn của giá 109 là 10 → số tròn 110
  assert.match(c.stopReason, /\+ 0,3×ATR = 109,900; đẩy qua số tròn 110,000 = 110,200$/);
});

// ---- Giá theo tickSize, làm tròn về phía an toàn (I-2) ----
test('tickSize: SL làm tròn ra xa giá vào, TP vào gần giá vào, limit về phía an toàn (Long)', () => {
  const zones = [zone(95, 96, 3), zone(103.33, 104)];
  const p = buildPlan({ ...baseArgs, tickSize: 0.5, side: 'long', entry: flat(100), zones });
  assert.equal(p.entryType, 'limit');
  assert.equal(p.entry, 96); // 96,1 → xuống 96
  assert.equal(p.stop, 94.5); // 94,7 → xuống 94,5 (xa giá vào)
  assert.equal(p.targets[0]!.price, 103); // 103,33 − 0,2 = 103,13 → xuống 103 (gần giá vào)
  assert.ok(p.stop <= 94.7 && p.targets[0]!.price! <= 103.13);
});

test('tickSize: SL lên, TP lên (gần giá vào), limit lên (Short)', () => {
  const zones = [zone(104, 105, 3), zone(97, 98), zone(92, 93)];
  const p = buildPlan({ ...baseArgs, tickSize: 0.5, side: 'short', entry: flat(100), zones });
  assert.equal(p.entryType, 'limit');
  assert.equal(p.entry, 104); // 103,9 → lên 104
  assert.equal(p.stop, 105.5); // 105,3 → lên 105,5 (xa giá vào)
  assert.equal(p.targets[0]!.price, 98.5); // 98,2 → lên 98,5 (gần giá vào)
});

test('tickSize: mọi giá trong lý do dùng cùng số chữ số với tickSize (không 0,15378 cạnh 0,153782)', () => {
  const zones = [zone(0.0950, 0.0960, 3), zone(0.1030, 0.1040)];
  const args = { ...baseArgs, tickSize: 1e-6, dailyAtr: 0.01 };
  const p = buildPlan({ ...args, side: 'long', entry: flat(0.1).map((c) => ({ ...c, high: c.close + 0.005, low: c.close - 0.005 })), zones });
  const text = [p.entryReason, p.stopReason, ...p.targets.map((t) => t.reason)].join(' | ');
  const prices = text.match(/\d+,\d+/g)!.filter((x) => !/^\d,\d$/.test(x));
  assert.ok(prices.length > 0);
  assert.ok(prices.every((x) => x.split(',')[1]!.length === 6), `lẫn độ chính xác: ${text}`);
});

// ---- TP1 = null thì lý do limit không nhắc TP1 (I-4) ----
test('limit không có TP1: lý do chỉ "hủy nếu sau … giờ chưa khớp", không nhắc chạm TP1', () => {
  const p = buildPlan({ ...baseArgs, side: 'long', entry: flat(100), zones: [...supports] });
  assert.equal(p.entryType, 'limit');
  assert.equal(p.targets[0]!.price, null);
  assert.match(p.entryReason, /hủy nếu sau 24 giờ chưa khớp/);
  assert.doesNotMatch(p.entryReason, /TP1/);
});

test('limit có TP1: lý do vẫn ghi "hoặc giá chạm TP1 trước"', () => {
  const p = buildPlan({ ...baseArgs, side: 'long', entry: flat(100), zones: [...supports, zone(103, 104)] });
  assert.match(p.entryReason, /giá chạm TP1 trước/);
});
