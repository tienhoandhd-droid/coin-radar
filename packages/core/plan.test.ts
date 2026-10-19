import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundStep, liquidationPrice, maxSafeLeverage, positionSize, splitQuantity, buildPlan as buildPlanRaw, tp1R, tp1NetRAt, worstTp1NetR, type PlanArgs } from './plan.ts';
import { COMMON } from './config.ts';
import type { Zone } from './zones.ts';
import type { Candle } from './types.ts';

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
// Phần lớn test dựng giá hiện tại = giá đóng nến cuối; I3 (giá mark khác giá đóng) truyền markPrice tường minh
const buildPlan = (a: Omit<PlanArgs, 'markPrice'> & { markPrice?: number }) => buildPlanRaw({ markPrice: a.entry[a.entry.length - 1]?.close ?? NaN, ...a });

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

const NO_FB = { maxAbsRate: 1e-15, intervalHours: 8 };
test('khối lượng (core/sizing.ts, như planner): vốn 1000, rủi ro 0,5%, vào 100, cắt 98, phí 0,5% (nửa ở 100, nửa ở SL 98) → 5 / 2,495 = 2,004', () => {
  const s = positionSize({ mode: 'swing', capital: 1000, riskPct: 0.5, entry: 100, stop: 98, stepSize: 0.001, cost: { tierPct: 0.5, quoteVolPerMin: Infinity }, fundingBuffer: NO_FB });
  assert.equal(s.qty, 2.004); // 2 + (100 + 98) × 0,25% = 2,495 USDT/coin
  assert.equal(s.notional, 200.4);
  assert.equal(s.riskAmount, 5);
  assert.ok(Math.abs(s.estLoss - 2.004 * 2.495) < 1e-9 && s.estLoss <= 5);
});

function k(i: number, close: number, high = close * 1.01, low = close * 0.99): Candle {
  return { openTime: i, closeTime: i, open: close, high, low, close, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 };
}

const zone = (low: number, high: number, strength = 2): Zone => ({ low, high, strength, touches: 1, sources: ['test'] });
// nến đóng cố định, biên độ 1 → ATR(14) = 1
function flat(price: number, n = 60): Candle[] {
  return Array.from({ length: n }, (_, i) => k(i, price, price + 0.5, price - 0.5));
}
const baseArgs = { mode: 'swing' as const, dailyAtr: 1, tickSize: 0.001, capital: 1000, riskPct: 0.5, costTier: 'high' as const,
  stepSize: 0.001, quoteVolPerMin: Infinity, fundingBuffer: { maxAbsRate: 1e-15, intervalHours: 8 }, fundingRate: 0.0001, fundingIntervalHours: 8 };
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
    const p = buildPlan({ ...baseArgs, side, entry: flat(96.3), zones: [zone(95, 96, 1), zone(99, 100, 1)] });
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
    costTier: 'high' as const, tickSize: 0.001, stepSize: 0.001, quoteVolPerMin: Infinity, fundingBuffer: { maxAbsRate: 1e-15, intervalHours: 8 }, fundingRate: 0.0001, fundingIntervalHours: 8, zones: [] };
  assert.throws(() => buildPlan(args), /ATR/);
});

test('buildPlan báo lỗi khi dữ liệu dưới 15 nến (ATR chưa tính được)', () => {
  const short = Array.from({ length: 10 }, (_, i) => k(i, 100 + i));
  const args = { mode: 'fast' as const, side: 'long' as const, entry: short, dailyAtr: 3, capital: 1000, riskPct: 0.5,
    costTier: 'high' as const, tickSize: 0.001, stepSize: 0.001, quoteVolPerMin: Infinity, fundingBuffer: { maxAbsRate: 1e-15, intervalHours: 8 }, fundingRate: 0.0001, fundingIntervalHours: 8, zones: [] };
  assert.throws(() => buildPlan(args), /ATR/);
});

test('buildPlan Swing báo lỗi khi ATR ngày là NaN', () => {
  const c = Array.from({ length: 60 }, (_, i) => k(i, 100 + Math.sin(i / 3) * 2));
  const args = { mode: 'swing' as const, side: 'long' as const, entry: c, dailyAtr: NaN, capital: 1000, riskPct: 0.5,
    costTier: 'high' as const, tickSize: 0.001, stepSize: 0.001, quoteVolPerMin: Infinity, fundingBuffer: { maxAbsRate: 1e-15, intervalHours: 8 }, fundingRate: 0.0001, fundingIntervalHours: 8, zones: [] };
  assert.throws(() => buildPlan(args), /ATR ngày/);
});

test('buildPlan: funding tính theo số kỳ thật — hợp đồng 4h trả gấp đôi hợp đồng 8h cùng mức/kỳ, 1h gấp 8 lần', () => {
  const c = Array.from({ length: 60 }, (_, i) => k(i, 100 + Math.sin(i / 3) * 2));
  const base = { mode: 'swing' as const, side: 'long' as const, entry: c, dailyAtr: 3, capital: 1000, riskPct: 0.5,
    costTier: 'high' as const, tickSize: 0.001, stepSize: 0.001, quoteVolPerMin: Infinity, fundingBuffer: { maxAbsRate: 1e-15, intervalHours: 8 }, fundingRate: 0.0001, zones: [] };
  const p8 = buildPlan({ ...base, fundingIntervalHours: 8 });
  const p4 = buildPlan({ ...base, fundingIntervalHours: 4 });
  const p1 = buildPlan({ ...base, fundingIntervalHours: 1 });
  assert.equal(r6(p4.fundingCostR / p8.fundingCostR), 2);
  assert.equal(r6(p1.fundingCostR / p8.fundingCostR), 8);
});

test('buildPlan: ghi lại riskPct đã dùng và riskAmount theo đó', () => {
  const c = Array.from({ length: 60 }, (_, i) => k(i, 100 + Math.sin(i / 3) * 2));
  const p = buildPlan({ mode: 'swing', side: 'long', entry: c, dailyAtr: 3, capital: 1000, riskPct: 0.25, costTier: 'high',
    tickSize: 0.001, stepSize: 0.001, quoteVolPerMin: Infinity, fundingBuffer: { maxAbsRate: 1e-15, intervalHours: 8 }, fundingRate: 0.0001, fundingIntervalHours: 8, zones: [] });
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

test('lệnh limit: vùng cản YẾU ngay trên giá limit bị bỏ qua (G-12 chỉ áp cho vùng mạnh); vùng mạnh ở đó sẽ thành vùng SL nên không còn là vật cản', () => {
  // limit = 96 + 0,1 = 96,1; vùng [96,2; 97] độ mạnh 1: TP trước nó = 96,0 ≤ limit (trước B3b là "sát giá vào" → bỏ lệnh)
  const p = buildPlan({ ...baseArgs, side: 'long', entry: flat(100), zones: [...supports, zone(96.2, 97, 1), zone(103, 104)] });
  assert.equal(p.entryType, 'limit');
  assert.equal(p.valid, true, p.invalidReason ?? '');
  assert.equal(p.skippedZones.length, 1);
  assert.equal(r6(p.targets[0]!.price!), 102.8);
  // vùng mạnh cùng chỗ -> trở thành vùng hỗ trợ gần nhất: limit dời lên 97,1
  const strong = buildPlan({ ...baseArgs, side: 'long', entry: flat(100), zones: [...supports, zone(96.2, 97, 2), zone(103, 104)] });
  assert.equal(r6(strong.entry), 97.1);
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

// ---- Sửa trước khi merge 1.1: TP1 đã nằm sai phía giá thị trường ----
test('1.1 Long limit: TP1 ≤ giá thị trường → không ghi "giá chạm TP1", chỉ hết hạn', () => {
  const p = buildPlan({ ...baseArgs, mode: 'fast', side: 'long', entry: flat(100), zones: [zone(95, 96, 3), zone(100.1, 101)] }); // B3b: vùng mạnh nằm giữa limit và giá thị trường sẽ thành vùng SL, nên TP1 ≤ giá thị trường dùng vùng ngay TRÊN giá (TP = mép − 0,2 = 99,9)
  assert.equal(p.entryType, 'limit');
  assert.ok(p.targets[0]!.price! <= 100);
  assert.match(p.entryReason, /hủy nếu sau 2 giờ chưa khớp/);
  assert.doesNotMatch(p.entryReason, /TP1/);
});

test('1.1 Short limit: TP1 ≥ giá thị trường → không ghi "giá chạm TP1", chỉ hết hạn', () => {
  const p = buildPlan({ ...baseArgs, mode: 'fast', side: 'short', entry: flat(100), zones: [zone(104, 105, 3), zone(99.5, 99.9)] }); // gương: TP = mép trên 99,9 + 0,2 = 100,1
  assert.equal(p.entryType, 'limit');
  assert.ok(p.targets[0]!.price! >= 100);
  assert.match(p.entryReason, /hủy nếu sau 2 giờ chưa khớp/);
  assert.doesNotMatch(p.entryReason, /TP1/);
});

test('1.1 Short limit: TP1 dưới giá thị trường → vẫn ghi "giá chạm TP1 trước"', () => {
  const p = buildPlan({ ...baseArgs, side: 'short', entry: flat(100), zones: [zone(104, 105, 3), zone(97, 98)] });
  assert.match(p.entryReason, /giá chạm TP1 trước/);
});

// ---- 1.3 / 1.4: khối lượng ----
test('1.4 splitQuantity: 29 (bước 1) → 14/8/7; 0,033 (bước 0,001) → 0,016/0,009/0,008; 2 → có phần 0', () => {
  assert.deepEqual(splitQuantity(29, 1, [50, 30, 20]), [14, 8, 7]);
  assert.deepEqual(splitQuantity(0.033, 0.001, [50, 30, 20]), [0.016, 0.009, 0.008]);
  assert.deepEqual(splitQuantity(2, 1, [50, 30, 20]), [1, 0, 1]);
});

test('1.3 qty = 0 → kế hoạch không hợp lệ, có lý do khối lượng', () => {
  const p = buildPlan({ ...baseArgs, exitPolicy: 'A0', stepSize: 1000, side: 'long', entry: flat(96.3), zones: [...supports, ...resistances] });
  assert.equal(p.qty, 0);
  assert.equal(p.valid, false);
  assert.equal(p.invalidReason, 'Khối lượng quá nhỏ so với bước khối lượng của sàn — tăng vốn hoặc bỏ lệnh');
});

test('1.4 qty không chia được 50/30/20 → không hợp lệ; chia được → qty từng TP cộng lại bằng qty', () => {
  // vốn 1000, rủi ro 0,5%, vào 96,3, SL 94,7, phí cao → qty khoảng 3 với bước 1
  const small = buildPlan({ ...baseArgs, exitPolicy: 'A0', stepSize: 1, side: 'long', entry: flat(96.3), zones: [...supports, ...resistances] });
  assert.equal(small.qty, 2);
  assert.equal(small.valid, false);
  assert.equal(small.invalidReason, 'Khối lượng không chia được 50/30/20 theo bước khối lượng của sàn');
  const ok = buildPlan({ ...baseArgs, exitPolicy: 'A0', side: 'long', entry: flat(96.3), zones: [...supports, ...resistances] });
  assert.equal(ok.valid, true);
  assert.equal(r6(ok.targets.reduce((s, t) => s + t.qty, 0)), r6(ok.qty));
});

test('1.3 estLoss = qty × |vào − SL| + phí ước tính', () => {
  const p = buildPlan({ ...baseArgs, side: 'long', entry: flat(96.3), zones: [...supports, ...resistances] });
  const cost = 0.5; // COMMON.costRoundTripPct.high — kiểm lại bên dưới
  assert.ok(p.estLoss > p.qty * p.riskPerUnit);
  assert.ok(p.estLoss <= p.riskAmount + 1e-9);
  void cost;
});

// ===== Đợt 2 — quyết định người dùng 19/10/2026 =====

test('2.1 giá nằm trong một vùng → không hợp lệ, lý do nêu vùng và "chờ giá thoát hẳn" (cả Long lẫn Short)', () => {
  for (const side of ['long', 'short'] as const) {
    const zs = side === 'long' ? [...supports, zone(96, 97, 3), ...resistances] : [zone(104, 105, 3), zone(103, 104.2, 3), zone(100, 101), zone(97, 98)];
    const p = buildPlan({ ...baseArgs, side, entry: flat(side === 'long' ? 96.3 : 103.7), zones: zs });
    assert.equal(p.valid, false);
    assert.match(p.invalidReason!, /^Giá đang nằm trong vùng \d+,\d+–\d+,\d+ .* — chờ giá thoát hẳn khỏi vùng$/);
    for (const key of ['entry', 'stop', 'qty', 'maxEntry'] as const) assert.ok(Number.isFinite(p[key]));
  }
});

test('2.1 vùng chứa giá không còn được dùng làm vùng đặt SL: SL lấy vùng nằm hẳn dưới giá', () => {
  const p = buildPlan({ ...baseArgs, side: 'long', entry: flat(96.3), zones: [zone(94, 95, 3), zone(96, 97, 3), ...resistances] });
  assert.match(p.stopReason, /94,000–95,000/);
  assert.doesNotMatch(p.stopReason, /96,000–97,000/);
  assert.equal(p.valid, false); // vẫn nằm trong vùng 96–97
});

test('2.1 giá đúng mép vùng cũng tính là nằm trong vùng', () => {
  const p = buildPlan({ ...baseArgs, side: 'long', entry: flat(96), zones: [...supports, ...resistances] });
  assert.equal(p.valid, false);
  assert.match(p.invalidReason!, /Giá đang nằm trong vùng/);
});

test('2.1 giá limit nằm trong một vùng khác → không hợp lệ, lý do nêu vùng', () => {
  // hỗ trợ 95–96 → limit 96,1; vùng yếu 96,05–97 chứa giá limit; giá hiện tại 98,5 không nằm trong vùng nào
  const p = buildPlan({ ...baseArgs, side: 'long', entry: flat(98.5), zones: [...supports, zone(96.05, 97, 1)] });
  assert.equal(p.entryType, 'limit');
  assert.equal(r6(p.entry), 96.1);
  assert.equal(p.valid, false);
  assert.match(p.invalidReason!, /^Giá limit 96,100 nằm trong vùng 96,050–97,000 .* — chờ giá thoát hẳn khỏi vùng$/);
});

test('2.2 lệnh market: bảng 3 dòng (giá hiện tại / giữa / tối đa), rủi ro giữ nguyên, chia 50/30/20 từng dòng', () => {
  const p = buildPlan({ ...baseArgs, side: 'long', entry: flat(96.3), zones: [...supports, ...resistances] });
  assert.equal(p.valid, true);
  assert.equal(p.fillTable.length, 3);
  assert.deepEqual(p.fillTable.map((f) => f.label), ['giá hiện tại', 'giữa', 'giá tối đa']);
  assert.equal(r6(p.fillTable[0]!.fill), 96.3);
  assert.equal(r6(p.fillTable[1]!.fill), 96.45);
  assert.equal(r6(p.fillTable[2]!.fill), r6(p.maxEntry));
  assert.equal(r6(p.maxEntry), 96.6);
  for (const f of p.fillTable) {
    const expected = positionSize({ mode: 'swing', capital: 1000, riskPct: 0.5, entry: f.fill, stop: p.stop, stepSize: 0.001, cost: { tierPct: COMMON.costRoundTripPct.high, quoteVolPerMin: Infinity }, fundingBuffer: NO_FB }).qty;
    assert.equal(r6(f.qty), r6(expected));
    assert.equal(r6(f.q[0] + f.q[1] + f.q[2]), r6(f.qty));
    assert.deepEqual(f.q.map((x) => r6(x)), splitQuantity(f.qty, 0.001, [50, 30, 20]).map((x) => r6(x)));
    assert.ok(f.estLoss <= p.riskAmount + 1e-9 && f.estLoss > p.riskAmount * 0.99, `estLoss ${f.estLoss}`);
  }
  assert.ok(p.fillTable[0]!.qty > p.fillTable[1]!.qty && p.fillTable[1]!.qty > p.fillTable[2]!.qty);
  assert.equal(p.fillTable[0]!.qty, p.qty);
  assert.equal(p.fillTable[0]!.estLoss, p.estLoss);
});

test('2.2 lệnh limit: bảng chỉ một dòng ở giá limit', () => {
  const p = buildPlan({ ...baseArgs, side: 'long', entry: flat(98.5), zones: [...supports, zone(99.5, 100.5)] });
  assert.equal(p.entryType, 'limit');
  assert.equal(p.fillTable.length, 1);
  assert.equal(p.fillTable[0]!.fill, p.entry);
  assert.equal(p.fillTable[0]!.label, 'limit');
  assert.equal(p.fillTable[0]!.qty, p.qty);
});

test('2.2 Long: TP1 chỉ 1,06R ở giá hiện tại → giá tối đa bị hạ để dòng xấu nhất vẫn ≥ 1R, entryReason nói rõ', () => {
  // TP1 = 98,0; SL = 94,7 → giá khớp tối đa để còn ≥ 1R: (98 + 94,7)/2 = 96,35
  const p = buildPlan({ ...baseArgs, side: 'long', entry: flat(96.3), zones: [...supports, zone(98.2, 99), zone(102, 103)] });
  assert.equal(p.valid, true);
  assert.equal(r6(p.maxEntry), 96.35);
  assert.equal(r6(p.fillTable[2]!.fill), 96.35);
  assert.match(p.entryReason, /hạ.*96,350.*TP1.*1R/);
  const worst = p.fillTable[2]!.fill;
  assert.ok((p.targets[0]!.price! - worst) / (worst - p.stop) >= 1 - 1e-9);
  assert.equal(r6(p.entryZone.high), 96.35);
});

test('2.2 Short: giá tối đa (thấp nhất) được nâng lên để TP1 vẫn ≥ 1R ở dòng xấu nhất', () => {
  // SL = 105,3; TP1 = 102,0 → giá khớp thấp nhất để còn ≥ 1R: (102 + 105,3)/2 = 103,65
  const zs = [zone(104, 105, 3), zone(101, 101.8), zone(97, 98), zone(93, 94)];
  const p = buildPlan({ ...baseArgs, side: 'short', entry: flat(103.7), zones: zs });
  assert.equal(p.valid, true);
  assert.equal(r6(p.maxEntry), 103.65);
  assert.equal(r6(p.fillTable[2]!.fill), 103.65);
  assert.match(p.entryReason, /nâng.*103,650.*TP1.*1R/);
  const worst = p.fillTable[2]!.fill;
  assert.ok((worst - p.targets[0]!.price!) / (p.stop - worst) >= 1 - 1e-9);
});

test('2.2 TP1 đủ xa: không hạ giá tối đa, entryReason không nhắc hạ', () => {
  const p = buildPlan({ ...baseArgs, side: 'long', entry: flat(96.3), zones: [...supports, ...resistances] });
  assert.equal(r6(p.maxEntry), 96.6);
  assert.doesNotMatch(p.entryReason, /hạ/);
});

// ---- Đợt 3: kiểm MỌI dòng bảng khối lượng, không chỉ dòng đầu ----
const rowOk = (p: ReturnType<typeof buildPlan>, f: { qty: number; q: number[] }) =>
  f.qty > 0 && p.targets.every((t, i) => t.price === null || f.q[i]! > 0);

test('3.1 Long, 3 TP, vốn 1480, bước 1: dòng giữa/tối đa chia ra TP2 = 0 → bỏ dòng, hạ giá tối đa về giá hiện tại', () => {
  const p = buildPlan({ ...baseArgs, exitPolicy: 'A0', stepSize: 1, capital: 1480, side: 'long', entry: flat(96.3), zones: [...supports, ...resistances] });
  assert.equal(p.valid, true);
  assert.ok(p.targets.every((t) => t.price !== null));
  assert.ok(p.fillTable.every((f) => rowOk(p, f)), JSON.stringify(p.fillTable));
  assert.deepEqual(p.fillTable.map((f) => f.label), ['giá hiện tại']);
  assert.equal(r6(p.maxEntry), 96.3);
  assert.equal(r6(p.entryZone.high), 96.3);
  assert.match(p.entryReason, /giá tối đa hạ xuống 96,300 vì khối lượng không chia được 50\/30\/20/);
});

test('3.1 Short (gương): cùng lỗi → nâng giá tối đa lên giá hiện tại', () => {
  const zs = [zone(104, 105, 3), zone(101, 101.8), zone(97, 98), zone(93, 94)];
  const p = buildPlan({ ...baseArgs, exitPolicy: 'A0', stepSize: 1, capital: 1490, side: 'short', entry: flat(103.7), zones: zs });
  assert.equal(p.valid, true);
  assert.ok(p.fillTable.every((f) => rowOk(p, f)), JSON.stringify(p.fillTable));
  assert.equal(p.fillTable.length, 1);
  assert.equal(r6(p.maxEntry), 103.7);
  assert.equal(r6(p.entryZone.low), 103.7);
  assert.match(p.entryReason, /giá tối đa nâng lên 103,700 vì khối lượng không chia được 50\/30\/20/);
});

test('3.1 Toàn trailing, vốn 370: dòng khối lượng 0 bị bỏ, giá tối đa hạ về dòng còn hợp lệ', () => {
  const p = buildPlan({ ...baseArgs, stepSize: 1, capital: 370, side: 'long', entry: flat(96.3), zones: supports });
  assert.equal(p.valid, true);
  assert.ok(p.targets.every((t) => t.price === null));
  assert.ok(p.fillTable.length >= 1 && p.fillTable.every((f) => f.qty > 0), JSON.stringify(p.fillTable));
  assert.equal(r6(p.maxEntry), r6(p.fillTable[p.fillTable.length - 1]!.fill));
  assert.ok(p.maxEntry < 96.6);
  assert.match(p.entryReason, /giá tối đa hạ xuống/);
});

test('3.1 Toàn trailing Short, vốn 380: mirror', () => {
  const p = buildPlan({ ...baseArgs, stepSize: 1, capital: 380, side: 'short', entry: flat(103.7), zones: [zone(104, 105, 3)] });
  assert.equal(p.valid, true);
  assert.ok(p.fillTable.every((f) => f.qty > 0), JSON.stringify(p.fillTable));
  assert.equal(r6(p.maxEntry), r6(p.fillTable[p.fillTable.length - 1]!.fill));
  assert.ok(p.maxEntry > 103.4);
  assert.match(p.entryReason, /giá tối đa nâng lên/);
});

test('3.1 dòng đầu hỏng → vẫn không hợp lệ như cũ', () => {
  const p = buildPlan({ ...baseArgs, exitPolicy: 'A0', stepSize: 1, capital: 1000, side: 'long', entry: flat(96.3), zones: [...supports, ...resistances] });
  assert.equal(p.valid, false);
  assert.equal(p.invalidReason, 'Khối lượng không chia được 50/30/20 theo bước khối lượng của sàn');
});

test('M2 tp1NetRAt: R sau phí + funding phải trả tại một giá khớp (Long / Short đối xứng)', () => {
  assert.equal(r6(tp1NetRAt('long', 115, 110.8, 108, 0.0046)), r6((115 - 110.8 - 0.0046 * 110.8) / 2.8));
  assert.equal(r6(tp1NetRAt('short', 85, 89.2, 92, 0.0046)), r6((89.2 - 85 - 0.0046 * 89.2) / 2.8));
});

test('M2 worstTp1NetR (lệnh vùng): market tính ở giá tối đa, limit ở giá limit; không có TP1 → null', () => {
  const p = buildPlan({ ...baseArgs, side: 'long', entry: flat(96.4), zones: [...supports, ...resistances] });
  assert.equal(p.entryType, 'market');
  const costFrac = COMMON.costRoundTripPct.high / 100 + Math.max(0, 0.0001 * (168 / 8));
  const w = worstTp1NetR(p, costFrac)!;
  assert.equal(r6(w), r6(tp1NetRAt('long', p.targets[0]!.price!, p.maxEntry, p.stop, costFrac)));
  assert.ok(w <= tp1NetRAt('long', p.targets[0]!.price!, p.entry, p.stop, costFrac));
  assert.equal(worstTp1NetR({ ...p, targets: p.targets.map((t) => ({ ...t, price: null, r: null })) }, costFrac), null);
});

// ---- B0: chính sách thoát mặc định C2 ----
const closeTo = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('B0: mặc định C2 — Long: bảo đảm không lỗ tính ở giá khớp XẤU NHẤT (maxEntry 96,6), callback làm tròn xuống', () => {
  const p = buildPlan({ ...baseArgs, side: 'long', entry: flat(96.3), zones: [...supports, ...resistances] });
  assert.equal(p.exit.policy, 'C2');
  assert.deepEqual(p.targets.map((t) => r6(t.price!)), [98.8, 101.8, 105.8]); // TP2/TP3 vẫn tính
  assert.equal(r6(p.maxEntry), 96.6);
  const t = p.exit.trailing!;
  // hòa vốn xấu nhất = 96,6 × 1,0025 = 96,8415; bảo đảm = (98,8 − 96,8415)/98,8 = 1,98213% -> 1,98; ATR% = 3,0364%
  closeTo(t.activationPrice, 98.8);
  closeTo(t.noLossCallbackPct, ((98.8 - 96.8415) / 98.8) * 100);
  closeTo(t.callbackPct, 1.98);
  closeTo(t.stopAtActivation, 98.8 * (1 - 0.0198)); // 96,84376 >= 96,8415
  assert.ok(t.stopAtActivation >= p.maxEntry * 1.0025);
  assert.equal(t.needsBreakevenFloor, false);
  assert.equal(p.exit.tp1Qty, p.targets[0]!.qty);
  closeTo(p.exit.trailQty, p.qty - p.targets[0]!.qty, 1e-9);
});

test('B0: C2 Short đối xứng — giá khớp xấu nhất 103,4 (thấp nhất cho Short), hòa vốn 103,1415', () => {
  const zones = [zone(104, 105, 3), zone(100, 101), zone(97, 98), zone(93, 94)];
  const p = buildPlan({ ...baseArgs, side: 'short', entry: flat(103.7), zones });
  assert.equal(r6(p.maxEntry), 103.4);
  const t = p.exit.trailing!;
  closeTo(t.noLossCallbackPct, ((103.1415 - 101.2) / 101.2) * 100); // 1,91852%
  closeTo(t.callbackPct, 1.91);
  closeTo(t.stopAtActivation, 101.2 * 1.0191); // 103,13292 <= 103,1415
  assert.ok(t.stopAtActivation <= p.maxEntry * 0.9975);
});

test('B0: C2 lệnh limit — bảo đảm tính tại giá limit', () => {
  const zones = [...supports, zone(103, 104), zone(108, 109)];
  const far = buildPlan({ ...baseArgs, side: 'long', entry: flat(100), zones });
  assert.equal(far.entryType, 'limit');
  const t = far.exit.trailing!;
  assert.ok(t.stopAtActivation >= far.entry * 1.0025 - 1e-9, `${t.stopAtActivation} < ${far.entry * 1.0025}`);
  closeTo(t.noLossCallbackPct, ((far.targets[0]!.price! - far.entry * 1.0025) / far.targets[0]!.price!) * 100);
});

test('B0: exitPolicy A0 giữ luật cũ (không trailing trên sàn), 50/30/20', () => {
  const p = buildPlan({ ...baseArgs, side: 'long', entry: flat(96.3), zones: [...supports, ...resistances], exitPolicy: 'A0' });
  assert.equal(p.exit.policy, 'A0');
  assert.equal(p.exit.trailing, null);
  assert.deepEqual(p.targets.map((t) => t.pct), [50, 30, 20]);
});

test('B0: rủi ro 2% vốn → ngân sách rủi ro 20 USDT trên 1000 USDT', () => {
  const p = buildPlan({ ...baseArgs, riskPct: COMMON.risk.perTradePct, side: 'long', entry: flat(96.3), zones: [...supports, ...resistances] });
  assert.equal(p.riskAmount, 20);
  assert.equal(p.riskPct, 2);
});

// ---- B0 vòng sửa 1: C2 chỉ cần TP1 và phần trailing chia được; A0 giữ kiểm tra cũ ----
// vốn 1,2 USDT × 0,5% = 0,006 rủi ro ÷ (1,6 + 96,3×0,25%) = 0,00326 -> 0,003. A0: TP1 0,001 / TP2 floor(0,0009)=0 -> không chia được. C2: TP1 0,001 + trailing 0,002.
test('B0: khối lượng 0,003 — A0 bị loại vì TP2 không chia được, C2 vẫn hợp lệ (TP1 0,001 + trailing 0,002)', () => {
  const a = { ...baseArgs, capital: 1.2, side: 'long' as const, entry: flat(96.3), zones: [...supports, ...resistances] };
  const old = buildPlan({ ...a, exitPolicy: 'A0' });
  assert.equal(old.qty, 0.003);
  assert.equal(old.valid, false);
  assert.match(old.invalidReason!, /50\/30\/20/);
  const c2 = buildPlan({ ...a });
  assert.equal(c2.valid, true, c2.invalidReason ?? '');
  assert.equal(c2.exit.tp1Qty, 0.001);
  assert.equal(c2.exit.trailQty, 0.002);
});

test('B0: C2 vẫn bị loại khi TP1 hoặc phần trailing < 1 bước', () => {
  // khối lượng 0,001: TP1 = floor(0,0005) = 0 -> không có TP1
  const p = buildPlan({ ...baseArgs, capital: 0.4, side: 'long', entry: flat(96.3), zones: [...supports, ...resistances] });
  assert.equal(p.qty, 0.001);
  assert.equal(p.valid, false);
  assert.match(p.invalidReason!, /TP1 50% \+ trailing 50%/);
});

test('I7: KL 1 phút mỏng → trượt theo cỡ của CHÍNH khối lượng in (core/sizing.ts) → khối lượng nhỏ hơn, lỗ thật vẫn ≤ ngân sách; KL 0/NaN → ném lỗi', () => {
  const a = { ...baseArgs, side: 'long' as const, entry: flat(96.3), zones: [...supports, ...resistances] };
  const p0 = buildPlan(a);
  const p1 = buildPlan({ ...a, quoteVolPerMin: 500 });
  assert.ok(p1.qty < p0.qty, `${p1.qty} < ${p0.qty}`);
  assert.ok(p1.estLoss <= p1.riskAmount + 1e-9 && p1.estLoss > p1.riskAmount * 0.99, `${p1.estLoss}`);
  assert.ok(p1.costPct > COMMON.costRoundTripPct.high);
  assert.throws(() => buildPlan({ ...a, quoteVolPerMin: 0 }), /costModel/);
  assert.throws(() => buildPlan({ ...a, quoteVolPerMin: NaN }), /costModel/);
});

test('I3: giá hiện tại = giá MARK truyền vào (không phải giá đóng nến cũ); dòng "giá hiện tại" của bảng khớp ở giá mark', () => {
  const a = { ...baseArgs, side: 'long' as const, entry: flat(96.3), zones: [...supports, ...resistances] };
  const p = buildPlanRaw({ ...a, markPrice: 96.4 });
  assert.equal(p.marketPrice, 96.4);
  assert.equal(p.entry, 96.4);
  assert.equal(p.fillTable[0]!.label, 'giá hiện tại');
  assert.equal(p.fillTable[0]!.fill, 96.4);
  // giá mark đã chạy vào vùng cản → không hợp lệ, dù giá đóng nến cũ thì không
  const inZone = buildPlanRaw({ ...a, markPrice: 99.5 });
  assert.equal(inZone.valid, false);
  assert.match(inZone.invalidReason!, /nằm trong vùng/);
  for (const bad of [0, -1, NaN]) assert.throws(() => buildPlanRaw({ ...a, markPrice: bad }), /giá mark/);
});

// ---- B3b: TP1 bỏ qua vùng cản yếu (độ mạnh < minSlStrength = 2), lấy vùng mạnh kế tiếp ----
// Long: vào 96,3 (ATR 1), SL 94,7 → R = 1,6. Vùng yếu [97; 97,5] độ mạnh 1 → TP trước nó sẽ là 96,8 (0,31R); vùng mạnh [99; 100] → TP1 98,8.
// Short (gương): vào 103,7, SL 105,3 (vùng 104–105 + 0,3). Vùng yếu [102,5; 103] → TP 103,2 (hạ 0,2 từ mép trên 103 → 103,2? Short: TP = high + 0,2); vùng mạnh [99; 100] → TP1 = 100 + 0,2 = 100,2.
const weakLong = zone(97, 97.5, 1);
const weakShort = zone(102.5, 103, 1);
test('B3b Long: vùng cản đầu yếu bị bỏ qua, TP1 lấy vùng mạnh kế tiếp, ghi vào skippedZones', () => {
  const p = buildPlan({ ...baseArgs, side: 'long', entry: flat(96.3), zones: [...supports, weakLong, zone(99, 100), zone(102, 103)] });
  assert.equal(r6(p.targets[0]!.price!), 98.8);
  assert.equal(r6(p.targets[1]!.price!), 101.8);
  assert.equal(p.valid, true);
  assert.deepEqual(p.skippedZones.map((z) => [z.low, z.high, z.strength]), [[97, 97.5, 1]]);
});
test('B3b Short: vùng đỡ đầu yếu bị bỏ qua, TP1 lấy vùng mạnh kế tiếp', () => {
  const p = buildPlan({ ...baseArgs, side: 'short', entry: flat(103.7), zones: [zone(104, 105, 3), weakShort, zone(99, 100), zone(96, 97)] });
  assert.equal(r6(p.targets[0]!.price!), 100.2);
  assert.equal(p.valid, true);
  assert.deepEqual(p.skippedZones.map((z) => [z.low, z.high, z.strength]), [[102.5, 103, 1]]);
});
for (const side of ['long', 'short'] as const) {
  const S = side === 'long' ? 'Long' : 'Short';
  const entry = side === 'long' ? 96.3 : 103.7;
  const sup = side === 'long' ? supports : [zone(104, 105, 3)];
  const near = side === 'long' ? [99, 100] as const : [99, 100] as const;
  test(`B3b ${S}: vùng cản đầu MẠNH (độ mạnh 2) giữ nguyên làm TP1, không bỏ qua gì`, () => {
    const p = buildPlan({ ...baseArgs, side, entry: flat(entry), zones: [...sup, zone(near[0], near[1], 2)] });
    assert.equal(p.targets[0]!.price !== null, true);
    assert.equal(p.skippedZones.length, 0);
    assert.match(p.targets[0]!.reason, /99,000–100,000/);
  });
  test(`B3b ${S}: mọi vùng cản đều yếu -> không có TP cố định (trailing), kế hoạch vẫn hợp lệ, ghi cả hai vùng bỏ qua`, () => {
    const zs = side === 'long' ? [weakLong, zone(99, 100, 1)] : [weakShort, zone(99, 100, 1)];
    const p = buildPlan({ ...baseArgs, side, entry: flat(entry), zones: [...sup, ...zs] });
    assert.ok(p.targets.every((t) => t.price === null && /trailing/.test(t.reason)));
    assert.equal(p.valid, true);
    assert.equal(p.skippedZones.length, 2);
  });
  test(`B3b ${S}: vùng yếu sát giá vào KHÔNG kích hoạt G-12 (không hợp lệ chỉ khi vùng mạnh)`, () => {
    const weakNear = side === 'long' ? zone(96.4, 97, 1) : zone(102.9, 103.6, 1);
    const far = side === 'long' ? zone(102, 103) : zone(98, 99);
    const ok = buildPlan({ ...baseArgs, side, entry: flat(entry), zones: [...sup, weakNear, far] });
    assert.equal(ok.valid, true, ok.invalidReason ?? '');
    assert.equal(ok.skippedZones.length, 1);
    const strongNear = side === 'long' ? zone(96.4, 97, 2) : zone(102.9, 103.6, 2);
    const bad = buildPlan({ ...baseArgs, side, entry: flat(entry), zones: [...sup, strongNear, far] });
    assert.equal(bad.valid, false);
    assert.match(bad.invalidReason!, /sát/);
  });
}
test('B3b tp1SkipWeak = false: TP1 ở vùng đầu tiên bất kể độ mạnh (biến thể so sánh Kế hoạch 2)', () => {
  const z = COMMON.zones as { tp1SkipWeak: boolean };
  assert.equal(z.tp1SkipWeak, true, 'mặc định phải bật');
  z.tp1SkipWeak = false;
  try {
    const p = buildPlan({ ...baseArgs, side: 'long', entry: flat(96.3), zones: [...supports, weakLong, zone(99, 100)] });
    assert.equal(r6(p.targets[0]!.price!), 96.8);
    assert.equal(p.skippedZones.length, 0);
  } finally { z.tp1SkipWeak = true; }
});
test('B3b TradePlan mang capital đã dùng để tính khối lượng', () => {
  const p = buildPlan({ ...baseArgs, side: 'long', entry: flat(96.3), zones: supports });
  assert.equal(p.capital, 1000);
});
