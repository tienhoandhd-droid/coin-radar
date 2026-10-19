import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planLines } from './plan-print.ts';
import type { TradePlan } from '../packages/core/plan.ts';

const base: TradePlan = {
  side: 'long', entryType: 'market', marketPrice: 0.6143, entry: 0.6143, entryZone: { low: 0.6143, high: 0.6263 },
  limitExpiryHours: null, entryReason: 'ly do vao', maxEntry: 0.6263, stop: 0.532, stopReason: 'ly do sl',
  targets: [
    { name: 'TP1', price: 0.761, pct: 50, qty: 14, r: 1.78, reason: 'ly do tp1' },
    { name: 'TP2', price: null, pct: 30, qty: 8, r: null, reason: 'het vung' },
    { name: 'TP3', price: null, pct: 20, qty: 7, r: null, reason: 'het vung' },
  ],
  afterTp1Stop: 0.6143, valid: true, invalidReason: null, trailAtr: 0.1196, riskPerUnit: 0.0823, qty: 29, notional: 17.81,
  riskAmount: 2.5, estLoss: 2.39, riskPct: 0.25, safeLeverage: 4, suggestedLeverage: 3, liquidationEstimate: 0.4157, marginNeeded: 6,
  fundingCostR: 0, timeStopHours: 1, maxHoldHours: 2,
  fillTable: [
    { label: 'giá hiện tại', fill: 0.6143, qty: 29, q: [14, 8, 7], estLoss: 2.43 },
    { label: 'giữa', fill: 0.6203, qty: 27, q: [13, 8, 6], estLoss: 2.45 },
    { label: 'giá tối đa', fill: 0.6262, qty: 26, q: [13, 7, 6], estLoss: 2.47 },
  ],
};
const head = { symbol: 'TIAUSDT', score: 75.9, riskTier: 'Rất cao' };

test('in kế hoạch: dấu phẩy cho điểm và % rủi ro, trailing là khoảng cách kèm %', () => {
  const t = planLines(head, base, 0.0001).join('\n');
  assert.match(t, /điểm 75,9/);
  assert.match(t, /ngân sách rủi ro 0,25% vốn/);
  assert.match(t, /trailing stop: cách giá cao nhất 3×ATR = 0,1196 \(19,5%\)/);
  assert.match(t, /Đạt TP1 → dời SL về đúng giá KHỚP THẬT của anh/);
  assert.doesNotMatch(t, /dời SL về giá vào/);
  assert.doesNotMatch(t, /3×ATR = 0,1196 — /);
});

test('Short: trailing bám giá thấp nhất', () => {
  const t = planLines(head, { ...base, side: 'short' }, 0.0001).join('\n');
  assert.match(t, /cách giá thấp nhất 3×ATR/);
});

test('TP1 = null: một dòng "không có TP cố định", bỏ dòng dời SL, bỏ TP1/TP2/TP3 riêng lẻ', () => {
  const noTp = { ...base, targets: base.targets.map((t) => ({ ...t, price: null, r: null })) };
  const t = planLines(head, noTp, 0.0001).join('\n');
  assert.match(t, /Không có vùng cản phía trên → không có TP cố định; toàn bộ vị thế theo trailing stop/);
  assert.doesNotMatch(t, /Đạt TP1/);
  assert.doesNotMatch(t, /TP1:|TP2:|TP3:/);
  assert.match(t, /trailing stop: cách giá cao nhất 3×ATR/);
});

test('Short TP1 = null: nói "vùng đỡ phía dưới"', () => {
  const noTp = { ...base, side: 'short' as const, targets: base.targets.map((t) => ({ ...t, price: null, r: null })) };
  assert.match(planLines(head, noTp, 0.0001).join('\n'), /Không có vùng đỡ phía dưới → không có TP cố định/);
});

test('limit: ghi giá limit và giờ hết hạn', () => {
  const t = planLines(head, { ...base, entryType: 'limit', limitExpiryHours: 24, entry: 0.6, entryZone: { low: 0.59, high: 0.6 } }, 0.0001).join('\n');
  assert.match(t, /ĐẶT LIMIT CHỜ HỒI về 0,6000, hết hạn sau 24 giờ/);
});

test('TP2/TP3 null khi TP1 có: dùng cùng câu trailing', () => {
  const t = planLines(head, base, 0.0001).join('\n');
  assert.match(t, /TP2: chốt 30% = 8 coin — trailing stop/);
});

test('1.2 Short: LƯU Ý trailing nói "trên giá thấp nhất"; Long nói "dưới giá cao nhất"', () => {
  const sh = planLines(head, { ...base, side: 'short' }, 0.0001).join('\n');
  assert.match(sh, /theo 0,1196 trên giá thấp nhất/);
  assert.doesNotMatch(sh, /dưới giá thấp nhất/);
  const lg = planLines(head, base, 0.0001).join('\n');
  assert.match(lg, /theo 0,1196 dưới giá cao nhất/);
});

test('1.4 in khối lượng từng TP; phần trailing ghi rõ', () => {
  const t = planLines(head, base, 0.0001).join('\n');
  assert.match(t, /TP1: 0,7610 chốt 50% = 14 coin/);
  assert.match(t, /TP2: chốt 30% = 8 coin — trailing stop/);
  assert.match(t, /TP3: chốt 20% = 7 coin — trailing stop/);
});

test('1.3 in thua lỗ ước tính thật, không in ngân sách rủi ro', () => {
  const t = planLines(head, base, 0.0001).join('\n');
  assert.match(t, /Tiền mất ước tính nếu chạm SL: 2,39 USDT/);
  assert.doesNotMatch(t, /Tiền mất nếu chạm SL: 2,50/);
});

test('2.2 lệnh market: in bảng khối lượng theo 3 giá khớp, mỗi dòng có chia 50/30/20 và tiền mất ước tính', () => {
  const t = planLines(head, base, 0.0001).join('\n');
  assert.match(t, /Bảng khối lượng theo giá khớp/);
  assert.match(t, /Khớp 0,6143 \(giá hiện tại\): 29 coin = TP1 14 \/ TP2 8 \/ TP3 7 \| mất ước tính 2,43 USDT/);
  assert.match(t, /Khớp 0,6203 \(giữa\): 27 coin = TP1 13 \/ TP2 8 \/ TP3 6 \| mất ước tính 2,45 USDT/);
  assert.match(t, /Khớp 0,6262 \(giá tối đa\): 26 coin = TP1 13 \/ TP2 7 \/ TP3 6 \| mất ước tính 2,47 USDT/);
});

test('2.2 lệnh limit: bảng chỉ một dòng', () => {
  const lim = { ...base, entryType: 'limit' as const, limitExpiryHours: 24, entry: 0.6, entryZone: { low: 0.59, high: 0.6 },
    fillTable: [{ label: 'limit' as const, fill: 0.6, qty: 30, q: [15, 9, 6] as [number, number, number], estLoss: 2.4 }] };
  const t = planLines(head, lim, 0.0001).join('\n');
  assert.match(t, /Khớp 0,6000 \(limit\): 30 coin = TP1 15 \/ TP2 9 \/ TP3 6/);
  assert.equal((t.match(/Khớp /g) ?? []).length, 1);
});

test('3.2 phần trailing bằng 0 do gộp: không in "= 0 coin", nói rõ gộp vào đâu (dòng TP và bảng)', () => {
  const p = { ...base,
    targets: [
      { name: 'TP1' as const, price: 0.761, pct: 50, qty: 2, r: 1.78, reason: 'ly do tp1' },
      { name: 'TP2' as const, price: null, pct: 30, qty: 0, r: null, reason: 'het vung' },
      { name: 'TP3' as const, price: null, pct: 20, qty: 1, r: null, reason: 'het vung' },
    ],
    fillTable: [{ label: 'giá hiện tại' as const, fill: 0.6143, qty: 3, q: [2, 0, 1] as [number, number, number], estLoss: 2.43 }] };
  const t = planLines(head, p, 0.0001).join('\n');
  assert.doesNotMatch(t, /= 0 coin/);
  assert.doesNotMatch(t, /TP2 0\b/);
  assert.match(t, /TP2: chốt 30% — gộp vào TP3/);
  assert.match(t, /3 coin = TP1 2 \/ TP2 gộp vào TP3 \/ TP3 1/);
});

// ---------- Kế hoạch 1c: in kế hoạch mô hình và khối "Mô hình đang theo dõi" ----------
import { patternPlanLines, trackedLines } from './plan-print.ts';
import { buildPatternPlan, type PatternPlan, type PatternPlanArgs } from '../packages/core/patterns/pattern-plan.ts';
import type { PatternGeometry } from '../packages/core/patterns/types.ts';
import type { Candle } from '../packages/core/types.ts';

const H4 = 4 * 3600_000;
const pk = (i: number, high: number, low: number, close: number): Candle =>
  ({ openTime: i * H4, closeTime: (i + 1) * H4 - 1, open: close, high, low, close, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 });
function patternPlan(close: number, over: Partial<PatternGeometry> = {}, extra: Candle[] = []): PatternPlan {
  const c = Array.from({ length: 30 }, (_, i) => pk(i, 105.5, 104.5, 105));
  c.push(pk(30, close + 0.3, 109.9, close), ...extra);
  const g: PatternGeometry = { kind: 'rectangle', timeframe: '4h', pivots: [], startIndex: 0, endIndex: 20, upper: () => 110, lower: () => 100,
    breakoutSide: 'both', height: 10, stopRef: { up: 109, down: 101 }, quality: 1, notes: [], ...over };
  const z = (low: number, high: number) => ({ low, high, strength: 2, touches: 2, sources: ['t'] });
  const a: PatternPlanArgs = { mode: 'swing', geometry: g, candles: c, atr: new Array<number>(c.length).fill(1), atr1h: 1,
    state: { state: 'breakout', breakoutIndex: 30, side: 'up', breakoutLine: 110, distanceAtr: 0, retest: null, notes: [], signalStale: false, inBreakoutWindow: null },
    zones: [z(118, 118.5), z(121, 122), z(126, 127)], multiMonth: null, btcSma200ReclaimedAt: null,
    capital: 10_000, riskPct: 0.5, costTier: 'high', tickSize: 0.01, stepSize: 0.001, fundingRate: 0.0001, fundingIntervalHours: 8 };
  const r = buildPatternPlan(a);
  if (r.status !== 'ready' || !r.plan) throw new Error(`fixture không ready: ${r.reason}`);
  return r.plan;
}
const ph = { symbol: 'BTCUSDT', score: 74, riskTier: 'Thấp' };

test('kế hoạch mô hình chia 2 chân: in từng chân + khối lượng mỗi chân, TP cho "chỉ market" và "khớp cả hai", luật sau TP1', () => {
  const p = patternPlan(111.4);
  assert.equal(p.entryType, 'split');
  const t = patternPlanLines(ph, p, 0.01).join('\n');
  assert.match(t, /BTCUSDT — LONG theo mô hình chữ nhật 4H \| điểm 74 \| rủi ro Thấp/);
  assert.match(t, /Kiểu vào lệnh: CHIA 2 CHÂN/);
  assert.match(t, /Chân 1 — MARKET 50%: giá hiện tại 111,40 \(không mua cao hơn 111,49\): 9,607 coin/);
  assert.match(t, /Chân 2 — LIMIT 50%: 110,25, hủy sau 10 nến \(40 giờ\) chưa khớp hoặc khi giá chạm TP1 trước: 9,608 coin/);
  assert.match(t, /TP1: 115,00 chốt 50% — khớp cả hai chân 9,607 coin; chỉ khớp chân market 4,803 coin/);
  assert.match(t, /Sau TP1 → SL về/);
  assert.match(t, /nếu chỉ khớp chân market/);
  assert.ok(t.includes(p.afterTp1Reason), 'phải in nguyên văn luật sau TP1');
  assert.match(t, /Khớp 111,40 \(giá hiện tại\): market 9,607 \+ limit 9,608 = 19,215 coin/);
  assert.doesNotMatch(t, /NaN|undefined|Infinity/);
});

test('kế hoạch mô hình market 100%: một chân, dòng "Sau TP1 → SL về" một luật', () => {
  const p = patternPlan(110.5, { stopRef: { up: 108.5, down: 101 } });
  assert.equal(p.entryType, 'market');
  const t = patternPlanLines(ph, p, 0.01).join('\n');
  assert.match(t, /Kiểu vào lệnh: VÀO TRỰC TIẾP 100%/);
  assert.doesNotMatch(t, /Chân 2/);
  assert.match(t, /TP1: [\d,]+ chốt 50% = [\d,]+ coin/);
  assert.match(t, new RegExp(`Sau TP1 → SL về ${p.afterTp1Stop.toFixed(2).replace('.', ',')}`));
  assert.doesNotMatch(t, /NaN|undefined|Infinity/);
});

test('kế hoạch mô hình chỉ limit: nói rõ chỉ 50% khối lượng, không vào trực tiếp', () => {
  const p = patternPlan(112.5);
  assert.equal(p.entryType, 'limit');
  const t = patternPlanLines(ph, p, 0.01).join('\n');
  assert.match(t, /Kiểu vào lệnh: CHỈ ĐẶT LIMIT 50% khối lượng tại 110,25/);
  assert.doesNotMatch(t, /MARKET/);
});

test('đường phá nghiêng: in độ dốc trong luật sau TP1', () => {
  const p = patternPlan(110.5, { kind: 'bull_flag', breakoutSide: 'up', height: 30, stopRef: { up: 108, down: 110 },
    upper: (i: number) => 110 - 0.1 * (i - 30), lower: (i: number) => 108 - 0.1 * (i - 30) },
  [pk(31, 110.1, 109.6, 109.85), pk(32, 110.1, 109.6, 109.85), pk(33, 110.1, 109.6, 109.85)]);
  const t = patternPlanLines(ph, p, 0.01).join('\n');
  assert.match(t, /đường phá nghiêng/);
  assert.match(t, /Đường phá: 110,00 tại nến phá; hiện tại 109,70/);
});

test('khối "Mô hình đang theo dõi": loại, khung, trạng thái, đường phá, chiều cao; ẩn ghi rõ', () => {
  const lines = trackedLines([
    { id: 'x', kind: 'rectangle', timeframe: '4h', state: 'breakout', side: 'up', upper: 110.5, lower: 99.5, breakoutLine: 110.5, height: 11, pivots: [], notes: ['P-G2 qua'], hidden: false, contextOnly: false },
    { id: 'z', kind: 'double_top', timeframe: '4h', state: 'breakout', side: 'down', upper: 120, lower: 110, breakoutLine: 110, height: 10, pivots: [], notes: [], hidden: false, contextOnly: true },
    { id: 'y', kind: 'bull_flag', timeframe: '1h', state: 'armed', side: null, upper: 120.123, lower: 118.2, breakoutLine: null, height: 9, pivots: [], notes: [], hidden: true, contextOnly: false },
  ], 0.1);
  const t = lines.join('\n');
  assert.match(t, /chữ nhật 4H — breakout \(phá lên\) \| đường phá 110,5 \| chiều cao 11,0/);
  assert.match(t, /P-G2 qua/);
  assert.match(t, /hai đỉnh 4H \(bối cảnh\) — breakout \(phá xuống\)/);
  assert.match(t, /cờ tăng 1H — armed \| biên trên 120,1 \/ biên dưới 118,2 \| chiều cao 9,0 \| ẩn \(Lướt nhanh: chỉ ghi nhận\)/);
});
