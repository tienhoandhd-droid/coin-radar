import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attributeLoss, evaluateChecks, summarizeAttribution, liftFilter, DEFAULT_ATTR, type AttrTrade, type AttrContext, type Attribution } from './attribution.ts';
import type { Candle } from '../packages/core/types.ts';

const H = 3_600_000;
const T0 = Date.UTC(2026, 6, 10); // giờ vào lệnh
const iso = (t: number) => new Date(t).toISOString();

// Nến đều: giá p, biên ±w, mỗi nến dài `ms`, bắt đầu từ `from`
function flat(from: number, n: number, ms: number, p: number, w: number): Candle[] {
  return Array.from({ length: n }, (_, i) => ({ openTime: from + i * ms, closeTime: from + (i + 1) * ms - 1, open: p, high: p + w, low: p - w, close: p,
    volume: 1, quoteVolume: 1, takerBuyQuote: 0 }) as Candle);
}

// Lệnh Long thua chạm SL: vào 100, SL 95 (5 = 5×ATR khi biên ±0,5 → TR 1), TP1 110, giữ 8 giờ (2 nến 4H)
function loser(o: Partial<AttrTrade> = {}): AttrTrade {
  return { id: 't1', symbol: 'AUSDT', mode: 'swing', side: 'long', entryTime: iso(T0), exitTime: iso(T0 + 8 * H), avgEntry: 100, stop: 95, tp1: 110,
    reason: 'stop_loss', costs: 5, riskAtFill: 100, pnl: -100, R: -1, filled: true, ...o };
}

// Ngữ cảnh "sạch": không sự kiện, BTC đứng yên, có OI phẳng, funding bình thường, giá coin trên SMA50 khung xu hướng
function ctx(o: Partial<AttrContext> = {}): AttrContext {
  return {
    events: [], btc: flat(T0 - 2 * H, 20, H, 60_000, 10), oi: [{ t: T0, oi: 1000 }, { t: T0 + H, oi: 1000 }, { t: T0 + 8 * H, oi: 1000 }],
    funding: [{ fundingTime: T0 + 4 * H, fundingRate: 0.0001, markPrice: 100 }],
    entryBars: flat(T0 - 40 * 4 * H, 60, 4 * H, 100, 0.5), entryIntervalMs: 4 * H,
    trendBars: [...flat(T0 - 60 * 24 * H, 59, 24 * H, 90, 1), ...flat(T0 - 24 * H, 1, 24 * H, 100, 1)], periodEnd: T0 + 30 * 24 * H, ...o,
  };
}

test('lệnh không thua → không quy nguyên nhân', () => {
  assert.equal(attributeLoss(loser({ pnl: 5, R: 0.05 }), ctx(), DEFAULT_ATTR), null);
  assert.equal(attributeLoss(loser({ filled: false }), ctx(), DEFAULT_ATTR), null);
});

test('không có nguyên nhân nào → (8) khác; mọi kiểm đều ghi kết quả', () => {
  const a = attributeLoss(loser(), ctx(), DEFAULT_ATTR)!;
  assert.equal(a.category, 'other');
  assert.equal(a.checks.liquidation, 'không');
  assert.equal(Object.keys(a.checks).length, 9);
  assert.equal(a.checks.coin_event, "chưa kiểm được");
  assert.equal(a.checks.coin_news, "chưa kiểm được");
});

test('(1) sự kiện vĩ mô trong cửa sổ lệnh thắng mọi nhóm sau', () => {
  const ev = { kind: 'CPI' as const, time: iso(T0 + 3 * H), source: 'x' };
  const a = attributeLoss(loser(), ctx({ events: [ev], btc: flat(T0, 20, H, 60_000, 6000) }), DEFAULT_ATTR)!;
  assert.equal(a.category, 'macro');
  assert.match(a.evidence, /CPI/);
  // sự kiện ngoài cửa sổ → không tính
  assert.notEqual(attributeLoss(loser(), ctx({ events: [{ ...ev, time: iso(T0 + 9 * H) }] }), DEFAULT_ATTR)!.category, 'macro');
});

test('(2) cú sốc BTC ≥ ngưỡng trong cửa sổ', () => {
  const btc = flat(T0, 10, H, 60_000, 10);
  btc[3] = { ...btc[3]!, low: 60_000 * (1 - DEFAULT_ATTR.btcShockPct.swing / 100) - 1 };
  const a = attributeLoss(loser(), ctx({ btc: btc }), DEFAULT_ATTR)!;
  assert.equal(a.category, 'btc_shock');
  assert.match(a.evidence, /BTC/);
});

test('(3) thanh lý dây chuyền: OI giảm mạnh + râu dài ngược chiều; thiếu OI → "không đủ dữ liệu" rồi xét tiếp', () => {
  const bars = flat(T0 - 40 * 4 * H, 60, 4 * H, 100, 0.5);
  const i = bars.findIndex((c) => c.openTime === T0);
  bars[i] = { ...bars[i]!, low: 96 }; // râu dưới 3,5 ≫ 1,5×ATR
  const oi = [{ t: T0, oi: 1000 }, { t: T0 + H, oi: 900 }, { t: T0 + 8 * H, oi: 900 }];
  const a = attributeLoss(loser(), ctx({ entryBars: bars, oi }), DEFAULT_ATTR)!;
  assert.equal(a.category, 'liquidation');
  const b = attributeLoss(loser(), ctx({ oi: null }), DEFAULT_ATTR)!;
  assert.equal(b.checks.liquidation, 'không đủ dữ liệu');
  assert.equal(b.category, 'other');
});

test('(4) funding cực đoan trong cửa sổ', () => {
  const a = attributeLoss(loser(), ctx({ funding: [{ fundingTime: T0 + 4 * H, fundingRate: 0.0015, markPrice: 100 }] }), DEFAULT_ATTR)!;
  assert.equal(a.category, 'funding');
  assert.match(a.evidence, /0,15|0\.15/);
});

test('(5a) SL quá sát so với ATR khung vào lệnh', () => {
  const a = attributeLoss(loser({ stop: 99.5 }), ctx(), DEFAULT_ATTR)!; // d = 0,5 < 1×ATR (1)
  assert.equal(a.category, 'stop_tight');
  assert.match(a.evidence, /ATR/);
});

test('(5b) bị quét SL: giá chạm TP1 trong N nến sau khi dừng lỗ; không nhìn quá cuối kỳ', () => {
  const bars = flat(T0 - 40 * 4 * H, 60, 4 * H, 100, 0.5);
  const j = bars.findIndex((c) => c.openTime === T0 + 12 * H);
  bars[j] = { ...bars[j]!, high: 111 };
  const a = attributeLoss(loser(), ctx({ entryBars: bars }), DEFAULT_ATTR)!;
  assert.equal(a.category, 'stop_tight');
  assert.match(a.evidence, /quét SL/);
  // nến đó nằm sau mốc cuối kỳ → không được dùng
  assert.equal(attributeLoss(loser(), ctx({ entryBars: bars, periodEnd: T0 + 10 * H }), DEFAULT_ATTR)!.category, 'other');
  // thoát không phải do SL → không phải "bị quét"
  assert.equal(attributeLoss(loser({ reason: 'time_stop' }), ctx({ entryBars: bars }), DEFAULT_ATTR)!.category, 'other');
});

test('(6) ngược xu hướng khung lớn: Long khi giá < SMA50 khung xu hướng', () => {
  const trend = [...flat(T0 - 60 * 24 * H, 59, 24 * H, 110, 1), ...flat(T0 - 24 * H, 1, 24 * H, 100, 1)];
  const a = attributeLoss(loser(), ctx({ trendBars: trend }), DEFAULT_ATTR)!;
  assert.equal(a.category, 'against_trend');
  // Short cùng dữ liệu → thuận xu hướng
  assert.equal(attributeLoss(loser({ side: 'short', stop: 105, tp1: 90 }), ctx({ trendBars: trend }), DEFAULT_ATTR)!.category, 'other');
});

test('(7) phí áp đảo: |phí| ≥ 0,3R', () => {
  const a = attributeLoss(loser({ costs: 30 }), ctx(), DEFAULT_ATTR)!;
  assert.equal(a.category, 'fees');
});

test('thứ tự ưu tiên: funding (4) trước SL sát (5) trước phí (7)', () => {
  const a = attributeLoss(loser({ stop: 99.5, costs: 40 }), ctx({ funding: [{ fundingTime: T0 + H, fundingRate: -0.002, markPrice: 100 }] }), DEFAULT_ATTR)!;
  assert.equal(a.category, 'funding');
  assert.equal(a.checks.stop_tight, 'có');
  assert.equal(a.checks.fees, 'có');
});

test('summarizeAttribution: đếm và R mất theo nhóm, chế độ, chiều', () => {
  const mk = (category: Attribution['category'], R: number, side: 'long' | 'short', mode: 'swing' | 'fast'): Attribution =>
    ({ id: 'x', symbol: 'A', mode, side, R, category, evidence: '', checks: {} as Attribution['checks'] });
  const s = summarizeAttribution([mk('fees', -1, 'long', 'fast'), mk('fees', -0.5, 'short', 'fast'), mk('other', -1, 'long', 'swing')]);
  assert.deepEqual(s.byCategory.fees, { count: 2, rLost: -1.5 });
  assert.deepEqual(s.byCategory.other, { count: 1, rLost: -1 });
  assert.deepEqual(s.byModeSide['fast|long']!.fees, { count: 1, rLost: -1 });
  assert.equal(s.total.count, 3);
  assert.equal(s.insufficient.liquidation, 0);
});

test('lệnh vào và ra cùng mốc (dừng ngay trong nến vào) vẫn có nến BTC/nến râu của mốc đó', () => {
  const btc = flat(T0, 10, H, 60_000, 10);
  btc[0] = { ...btc[0]!, low: 60_000 * (1 - DEFAULT_ATTR.btcShockPct.swing / 100) - 1 };
  const a = attributeLoss(loser({ exitTime: iso(T0) }), ctx({ btc: btc }), DEFAULT_ATTR)!;
  assert.equal(a.checks.btc_shock, 'có');
});

test('summarizeAttribution: đếm mọi phép kiểm "có" (chồng lấn), không chỉ nhóm ưu tiên', () => {
  const a = attributeLoss(loser({ stop: 99.5, costs: 40 }), ctx(), DEFAULT_ATTR)!;
  const s = summarizeAttribution([a]);
  assert.equal(s.flagged.stop_tight, 1);
  assert.equal(s.flagged.fees, 1);
  assert.equal(s.flagged.macro, 0);
});

test('funding quy đổi về 8 giờ theo chu kỳ thật của hợp đồng (suy từ khoảng cách các kỳ)', () => {
  const rows = [0, 4, 8].map((h) => ({ fundingTime: T0 + h * H, fundingRate: 0.0006, markPrice: 100 })); // kỳ 4 giờ: 0,06%/4h = 0,12%/8h
  assert.equal(attributeLoss(loser(), ctx({ funding: rows }), DEFAULT_ATTR)!.category, 'funding');
  const rows8 = [0, 8, 16].map((h) => ({ fundingTime: T0 - 8 * H + h * H, fundingRate: 0.0006, markPrice: 100 })); // kỳ 8 giờ: 0,06% < 0,1%
  assert.equal(attributeLoss(loser(), ctx({ funding: rows8 }), DEFAULT_ATTR)!.category, 'other');
});

test('cú sốc BTC đo từ giá ĐẦU TIÊN tại/sau giờ vào (nến chứa giờ vào chỉ dùng khi không có nến bắt đầu sau)', () => {
  const btc = flat(T0 - H / 2, 10, H, 60_000, 10);
  btc[0] = { ...btc[0]!, open: 50_000, low: 50_000 }; // nến CHỨA giờ vào nhưng mở trước 30 phút, lệch xa — không dùng khi có nến sau
  assert.equal(attributeLoss(loser(), ctx({ btc }), DEFAULT_ATTR)!.checks.btc_shock, 'không');
});

test('evaluateChecks chạy cho cả lệnh thắng (để tính tỉ lệ nền); attributeLoss bỏ qua phép kiểm trong skip', () => {
  const w = evaluateChecks(loser({ pnl: 50, R: 0.5, stop: 99.5 }), ctx(), DEFAULT_ATTR)!;
  assert.equal(w.checks.stop_tight, 'có');
  const a = attributeLoss(loser({ stop: 99.5, costs: 40 }), ctx(), DEFAULT_ATTR, new Set(['stop_tight']))!;
  assert.equal(a.category, 'fees');
  assert.equal(a.checks.stop_tight, 'có', 'kết quả kiểm vẫn ghi, chỉ không dùng xếp nhóm');
});

test('summarizeAttribution: tỉ lệ nền thua vs không thua, độ nâng, % lệnh thua theo nhóm, số lệnh cần nguồn tin coin', () => {
  const lose = [attributeLoss(loser({ stop: 99.5 }), ctx(), DEFAULT_ATTR)!, attributeLoss(loser({ stop: 99.5 }), ctx(), DEFAULT_ATTR)!, attributeLoss(loser(), ctx(), DEFAULT_ATTR)!];
  const win = [evaluateChecks(loser({ pnl: 1, R: 0.1, stop: 99.5 }), ctx(), DEFAULT_ATTR)!, evaluateChecks(loser({ pnl: 1, R: 0.1 }), ctx(), DEFAULT_ATTR)!];
  const s = summarizeAttribution(lose, win);
  assert.deepEqual(s.baseRates.stop_tight, { losers: { n: 3, flagged: 2, share: 2 / 3 }, nonLosers: { n: 2, flagged: 1, share: 0.5 }, lift: (2 / 3) / 0.5 });
  assert.equal(s.baseRates.macro.lift, null, 'không lệnh nào bị cờ → không tính độ nâng');
  assert.ok(Math.abs(s.shareOfLosers.stop_tight - 2 / 3) < 1e-9);
  assert.deepEqual(s.pendingSources, { coin_event: 3, coin_news: 3 });
  // độ nâng < 1,25 → phép kiểm không phân biệt thắng/thua → loại khỏi xếp nhóm
  assert.deepEqual([...liftFilter(s.baseRates, 1.5)], ['stop_tight']); // độ nâng 1,33 < 1,5 → loại
  assert.deepEqual([...liftFilter(s.baseRates, 1.25)], []);
});
