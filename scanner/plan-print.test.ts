import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planLines, gradedReportLines, GRADE_A_DISCLAIMER, type GradedItem } from './plan-print.ts';
import type { TradePlan } from '../packages/core/plan.ts';
import { buildExit, trailingFor } from '../packages/core/exit.ts';

const base: TradePlan = {
  side: 'long', entryType: 'market', marketPrice: 0.6143, entry: 0.6143, entryZone: { low: 0.6143, high: 0.6263 },
  limitExpiryHours: null, entryReason: 'ly do vao', maxEntry: 0.6263, stop: 0.532, stopReason: 'ly do sl',
  targets: [
    { name: 'TP1', price: 0.761, pct: 50, qty: 14, r: 1.78, reason: 'ly do tp1' },
    { name: 'TP2', price: null, pct: 30, qty: 8, r: null, reason: 'het vung' },
    { name: 'TP3', price: null, pct: 20, qty: 7, r: null, reason: 'het vung' },
  ],
  afterTp1Stop: 0.6143, exit: { policy: 'A0', tp1Qty: 14, trailQty: 0, trailing: null }, valid: true, invalidReason: null, trailAtr: 0.1196, riskPerUnit: 0.0823, qty: 29, notional: 17.81,
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
import { patternPlanLines, trackedLines, oldPatternSignalLine } from './plan-print.ts';
import { buildPatternPlan, type PatternPlan, type PatternPlanArgs } from '../packages/core/patterns/pattern-plan.ts';
import type { PatternGeometry } from '../packages/core/patterns/types.ts';
import type { Candle } from '../packages/core/types.ts';

const H4 = 4 * 3600_000;
const pk = (i: number, high: number, low: number, close: number): Candle =>
  ({ openTime: i * H4, closeTime: (i + 1) * H4 - 1, open: close, high, low, close, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 });
function patternPlan(close: number, over: Partial<PatternGeometry> = {}, extra: Candle[] = [], exitPolicy: 'A0' | 'C2' = 'A0'): PatternPlan {
  const c = Array.from({ length: 30 }, (_, i) => pk(i, 105.5, 104.5, 105));
  c.push(pk(30, close + 0.3, 109.9, close), ...extra);
  const g: PatternGeometry = { kind: 'rectangle', timeframe: '4h', pivots: [], startIndex: 0, endIndex: 20, upper: () => 110, lower: () => 100,
    breakoutSide: 'both', height: 10, stopRef: { up: 109, down: 101 }, quality: 1, notes: [], ...over };
  const z = (low: number, high: number) => ({ low, high, strength: 2, touches: 2, sources: ['t'] });
  const a: PatternPlanArgs = { mode: 'swing', patternId: 'BTCUSDT|4h|rectangle|1|2', price: { close: c[c.length - 1]!.close, time: c[c.length - 1]!.closeTime, tf: '4h' }, geometry: g, candles: c, atr: new Array<number>(c.length).fill(1), atr1h: 1,
    state: { state: 'breakout', breakoutIndex: 30, side: 'up', breakoutLine: 110, distanceAtr: 0, retest: null, notes: [], signalStale: false, inBreakoutWindow: null },
    zones: [z(118, 118.5), z(121, 122), z(126, 127)], multiMonth: null, btcSma200ReclaimedAt: null,
    capital: 10_000, riskPct: 0.5, costTier: 'high', tickSize: 0.01, stepSize: 0.001, fundingRate: 0.0001, fundingIntervalHours: 8, exitPolicy };
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

test('M1 đường phá nghiêng: in mức phá CỐ ĐỊNH tại nến phá (kèm thời điểm), không in độ dốc / "hiện tại"', () => {
  const p = patternPlan(110.5, { kind: 'bull_flag', breakoutSide: 'up', height: 30, stopRef: { up: 108, down: 110 },
    upper: (i: number) => 110 - 0.1 * (i - 30), lower: (i: number) => 108 - 0.1 * (i - 30) },
  [pk(31, 110.6, 110.1, 110.3), pk(32, 110.6, 110.1, 110.3), pk(33, 110.6, 110.1, 110.3)]);
  const t = patternPlanLines(ph, p, 0.01).join('\n');
  assert.doesNotMatch(t, /nghiêng/);
  assert.match(t, /Mức phá \(cố định tại nến phá 1970-01-06 00:00 UTC\): 110,00/);
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

// ---------- Hạng A / Hạng B: thứ tự in và cờ --show-b ----------
const item = (symbol: string, side: 'long' | 'short', score: number, failed: string[]): GradedItem => ({
  symbol, side, score, grade: { grade: failed.length === 0 ? 'A' : 'B', failed }, lines: [`${symbol} — KẾ HOẠCH ĐẦY ĐỦ`, '  SL: 1'],
});
const items = [
  item('BBBUSDT', 'long', 76.5, ['Tiêu chí 2 (điểm cao): điểm 76,5 < 80']),
  item('AAAUSDT', 'short', 82, []),
  item('CCCUSDT', 'long', 91, []),
  item('DDDUSDT', 'short', 72, ['Tiêu chí 4 (tỉ lệ lời/lỗ): TP1 chỉ 1,20R sau phí + funding < 1,5R', 'Tiêu chí 6 (hợp lưu): chưa có yếu tố nào']),
];

test('mặc định: lời cảnh báo Hạng A đứng trên cùng khối Hạng A, kế hoạch đầy đủ chỉ của Hạng A (điểm cao trước)', () => {
  const out = gradedReportLines(items, false);
  const text = out.join('\n');
  assert.equal(GRADE_A_DISCLAIMER, 'Hạng A là tiêu chí lọc chặt, KHÔNG phải xác suất thắng. Tỉ lệ thắng thực sẽ đo ở sổ tín hiệu/backtest.');
  assert.equal(out[0]!.startsWith('Hạng A'), true);
  assert.equal(out[1], GRADE_A_DISCLAIMER);
  assert.ok(text.indexOf(GRADE_A_DISCLAIMER) < text.indexOf('CCCUSDT — KẾ HOẠCH'));
  assert.ok(text.indexOf('CCCUSDT — KẾ HOẠCH') < text.indexOf('AAAUSDT — KẾ HOẠCH'), 'điểm 91 trước điểm 82');
  assert.ok(text.indexOf('AAAUSDT — KẾ HOẠCH') < text.indexOf('Hạng B'), 'Hạng A in trước Hạng B');
  assert.doesNotMatch(text, /BBBUSDT — KẾ HOẠCH|DDDUSDT — KẾ HOẠCH/);
});

test('mặc định: Hạng B là danh sách ngắn kèm tiêu chí trượt, một dòng mỗi mã', () => {
  const text = gradedReportLines(items, false).join('\n');
  assert.match(text, /BBBUSDT — LONG \| điểm 76,5 \| không đủ: Tiêu chí 2 \(điểm cao\): điểm 76,5 < 80/);
  assert.match(text, /DDDUSDT — SHORT \| điểm 72 \| không đủ: Tiêu chí 4 .*; Tiêu chí 6 /);
  assert.match(text, /Hạng B \(2\)/);
});

test('--show-b: in đủ kế hoạch cả Hạng B (sau Hạng A), kèm tiêu chí trượt', () => {
  const text = gradedReportLines(items, true).join('\n');
  assert.match(text, /BBBUSDT — KẾ HOẠCH ĐẦY ĐỦ/);
  assert.match(text, /DDDUSDT — KẾ HOẠCH ĐẦY ĐỦ/);
  assert.ok(text.indexOf('AAAUSDT — KẾ HOẠCH') < text.indexOf('BBBUSDT — KẾ HOẠCH'));
  assert.match(text, /Không đủ Hạng A: Tiêu chí 2/);
  assert.equal(text.split(GRADE_A_DISCLAIMER).length - 1, 1, 'lời cảnh báo chỉ in một lần');
});

test('không có Hạng A: nói thẳng là 0, vẫn in lời cảnh báo; không có Hạng B thì bỏ khối B', () => {
  const none = gradedReportLines([item('BBBUSDT', 'long', 76.5, ['Tiêu chí 2 (điểm cao): x'])], false).join('\n');
  assert.match(none, /Hạng A \(0\)/);
  assert.match(none, /Không có tín hiệu Hạng A/);
  assert.match(none, new RegExp(GRADE_A_DISCLAIMER.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&')));
  const onlyA = gradedReportLines([item('AAAUSDT', 'short', 82, [])], false).join('\n');
  assert.doesNotMatch(onlyA, /Hạng B/);
});

test('B3 tín hiệu mô hình cũ: một dòng "đã phát lúc …, còn hạn n nến", không in lại kế hoạch', () => {
  const p = patternPlan(110.5, {}, [pk(31, 111, 110.2, 110.6), pk(32, 111, 110.2, 110.6)]);
  assert.equal(p.fresh, false);
  const line = oldPatternSignalLine(ph, p);
  assert.equal(line, 'BTCUSDT — LONG theo mô hình chữ nhật 4H | điểm 74 | đã phát lúc 1970-01-06 03:59 UTC, còn hạn 8 nến — không in lại kế hoạch (thêm --show-old để xem)');
  assert.match(patternPlanLines(ph, p, 0.01)[0]!, /\| đã phát lúc 1970-01-06 03:59 UTC, còn hạn 8 nến \(in lại theo --show-old\)$/);
  assert.match(patternPlanLines(ph, patternPlan(110.5), 0.01)[0]!, /\| TÍN HIỆU MỚI$/);
});

test('M3: dòng giá hiện tại ghi khung và thời điểm của giá dùng', () => {
  const t = patternPlanLines(ph, patternPlan(110.5), 0.01).join('\n');
  assert.match(t, /Giá hiện tại: 110,50 \(đóng nến 4H lúc 1970-01-06 03:59 UTC\)/);
});

// ---- B0: chính sách thoát C2 (mặc định) và rủi ro 2% ----
const c2Long: TradePlan = {
  ...base, riskPct: 2, riskAmount: 20,
  exit: buildExit({ policy: 'C2', side: 'long', worstEntry: 0.6263, valid: true, tp1: 0.761, trailAtr: 0.05, costPct: 0.25, qty: 29, tp1Qty: 14 }),
};

test('C2 Long: TP1 chốt 50% + 50% còn lại trailing trên sàn, kích hoạt tại TP1, khoảng lùi và mức dừng', () => {
  // ATR-khoảng 0,05 → 0,05/0,761 = 6,571%; bảo đảm không lỗ = (0,761 − 0,615836)/0,761 = 19,07% → callback 6,57%; dừng = 0,761 − 0,05 = 0,711
  const t = planLines(head, c2Long, 0.0001).join('\n');
  assert.match(t, /TP1: 0,7610 chốt 50% = 14 coin \| 1,78R — ly do tp1; 50% còn lại \(15 coin\): trailing stop trên sàn, kích hoạt tại TP1, khoảng lùi 6,57% \(mức dừng lúc kích hoạt ≈ 0,7110 ≥ giá vào \+ phí\)/);
  assert.match(t, /ngân sách rủi ro 2% vốn = 20,00 USDT/);
  assert.doesNotMatch(t, /dời SL về/);
  assert.doesNotMatch(t, /TP2: chốt/);
  assert.match(t, /chia TP1 50% \/ trailing 50%/);
  assert.match(t, /Khớp 0,6143 \(giá hiện tại\): 29 coin = TP1 14 \/ trailing 15/);
});

test('C2 Short: cùng định dạng', () => {
  const c2Short: TradePlan = { ...base, side: 'short', riskPct: 2, riskAmount: 20,
    exit: buildExit({ policy: 'C2', side: 'short', worstEntry: 0.6143, valid: true, tp1: 0.5, trailAtr: 0.05, costPct: 0.25, qty: 29, tp1Qty: 14 }) };
  const t = planLines(head, { ...c2Short, targets: [{ ...base.targets[0]!, price: 0.5 }, base.targets[1]!, base.targets[2]!] }, 0.0001).join('\n');
  assert.match(t, /TP1: 0,5000 chốt 50% = 14 coin .*khoảng lùi 10,00% \(mức dừng lúc kích hoạt ≈ 0,5500 ≥ giá vào \+ phí\)/);
});

test('C2: ATR vượt trần 10% thì ghi rõ kẹp 10%; bảo đảm < 0,1% thì ghi rõ cần lệnh dừng hòa vốn', () => {
  const clamp = { ...base, exit: { policy: 'C2' as const, tp1Qty: 14, trailQty: 15, trailing: trailingFor('long', 100, 150, 20, 0.25) } };
  const t1 = planLines(head, clamp, 0.01).join('\n');
  assert.match(t1, /khoảng lùi 10,00% \(mức dừng lúc kích hoạt ≈ 135,00 ≥ giá vào \+ phí; khoảng lùi theo ATR 13,3% vượt trần 10% của sàn nên dùng 10%\)/);
  const floor = { ...base, exit: { policy: 'C2' as const, tp1Qty: 14, trailQty: 15, trailing: trailingFor('long', 100, 100.3, 2, 0.25) } };
  const t2 = planLines(head, floor, 0.01).join('\n');
  assert.match(t2, /khoảng lùi 0,10% .*< giá vào \+ phí .*0,050% < 0,1% tối thiểu của sàn → bot phải giữ thêm lệnh dừng hòa vốn/);
});

test('B0 mô hình C2: chân chia TP1/trailing, TP1 kèm trailing, TP2/TP3 chỉ tham khảo, bỏ luật dời SL', () => {
  const p = patternPlan(111.4, {}, [], 'C2');
  const t = patternPlanLines(ph, p, 0.01).join('\n');
  assert.equal(p.exit.policy, 'C2');
  assert.ok(p.exit.trailing);
  assert.match(t, /TP1: 115,00 chốt 50% — khớp cả hai chân 9,607 coin; chỉ khớp chân market 4,803 coin \| .*50% còn lại \(9,608 coin\): trailing stop trên sàn, kích hoạt tại TP1, khoảng lùi [\d,]+% \(mức dừng lúc kích hoạt ≈ [\d,]+ ≥ giá vào \+ phí\)/);
  assert.match(t, /Chân 1 — MARKET 50%.*= TP1 4,803 \/ trailing 4,804/);
  assert.match(t, /TP2 \(tham khảo, không đặt lệnh với C2\)/);
  assert.doesNotMatch(t, /Sau TP1 → SL về/);
});

test('B0 mô hình chia 2 chân: bảo đảm không lỗ tính ở chân xấu hơn (market tại giá tối đa 111,49 so với limit 110,25)', () => {
  const p = patternPlan(111.4, {}, [], 'C2');
  assert.equal(p.entryType, 'split');
  const worst = Math.max(p.maxEntry, p.limitPrice!);
  assert.equal(worst, p.maxEntry);
  assert.ok(p.exit.trailing!.stopAtActivation >= worst * 1.0025 - 1e-9, `${p.exit.trailing!.stopAtActivation}`);
});
