import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quarterlyExpiry, eventWindow } from './events.ts';
import { evaluateGates, liquidationCheck, type GateContext } from './gates.ts';
import { riskTier } from './risk.ts';

test('đáo hạn quý kế tiếp sau 19/10/2026 là 25/12/2026 08:00 UTC', () => {
  assert.equal(quarterlyExpiry(new Date('2026-10-19T00:00:00Z')).toISOString(), '2026-12-25T08:00:00.000Z');
  assert.equal(quarterlyExpiry(new Date('2026-09-01T00:00:00Z')).toISOString(), '2026-09-25T08:00:00.000Z');
});

test('cửa sổ FOMC chặn Lướt nhanh, không chặn Swing', () => {
  const ev = [{ kind: 'FOMC' as const, time: '2026-10-28T18:00:00Z', source: 'test' }];
  const now = new Date('2026-10-28T16:00:00Z');
  assert.equal(eventWindow(now, ev, 'fast').blocked, true);
  assert.equal(eventWindow(now, ev, 'swing').blocked, false);
});

const ok: GateContext = {
  mode: 'swing', side: 'long', score: 75, regime: 'up', breakerTripped: false,
  warmupBars: 300, coverage: 1, liquidityRankPct: 0.1, spreadPct: 0.02,
  move1hPct: 1, volumeZ1h: 1, ageDays: 400, eventBlocked: false,
  btcHourly: null, rsZ: 0, riskTier: 'Vừa', liquidation: { ok: true, note: 'Thanh lý ước tính xa hơn cắt lỗ' }, stopDistPct: 5, stopDistAtr: 1.2, fundingRate: 0.0001, fundingIntervalHours: 8, fundingIntervalDefault: false, minutesToFunding: 200, planValid: true, planNote: 'SL sau vùng hỗ trợ',
};

test('đủ điều kiện → mọi cổng qua (trừ G-06 chưa đánh giá vẫn tính qua)', () => {
  const g = evaluateGates(ok);
  assert.ok(g.every((x) => x.pass), JSON.stringify(g.filter((x) => !x.pass)));
  assert.match(g.find((x) => x.code === 'G-06')!.note, /chưa đánh giá/);
});

test('từng cổng chặn đúng', () => {
  const fail = (patch: Partial<GateContext>, code: string) => {
    const g = evaluateGates({ ...ok, ...patch });
    assert.equal(g.find((x) => x.code === code)!.pass, false, code);
  };
  fail({ regime: 'down' }, 'G-01');
  fail({ breakerTripped: true }, 'G-01');
  fail({ warmupBars: 100 }, 'G-02');
  fail({ liquidityRankPct: 0.8 }, 'G-03');
  fail({ spreadPct: 0.5 }, 'G-03');
  fail({ move1hPct: 20, volumeZ1h: 6 }, 'G-04');
  fail({ mode: 'fast', ageDays: 10 }, 'G-05');
  fail({ eventBlocked: true }, 'G-07');
  fail({ liquidation: { ok: false, note: 'vượt bậc' } }, 'G-08');
  fail({ fundingRate: 0.002 }, 'G-09');
  fail({ mode: 'fast', fundingRate: 0.0002, minutesToFunding: 10 }, 'G-10');
  fail({ planValid: false, planNote: 'Không có vùng hỗ trợ đủ mạnh' }, 'G-12');
});

test('Short bị chặn bởi funding âm cực đoan, không bởi funding dương', () => {
  const g = evaluateGates({ ...ok, side: 'short', regime: 'down', fundingRate: 0.002 });
  assert.equal(g.find((x) => x.code === 'G-09')!.pass, true);
  const g2 = evaluateGates({ ...ok, side: 'short', regime: 'down', fundingRate: -0.002 });
  assert.equal(g2.find((x) => x.code === 'G-09')!.pass, false);
});

test('mức rủi ro: ATR% cao → Rất cao; coin mới tối thiểu Cao', () => {
  assert.equal(riskTier({ dailyAtrPct: 12, ageDays: 400, liquidityRank: 0.1, maxDrawdown90Pct: 20 }).tier, 'Rất cao');
  assert.equal(riskTier({ dailyAtrPct: 3, ageDays: 400, liquidityRank: 0.1, maxDrawdown90Pct: 20 }).tier, 'Thấp');
  assert.equal(riskTier({ dailyAtrPct: 3, ageDays: 30, liquidityRank: 0.1, maxDrawdown90Pct: 20 }).tier, 'Cao');
});

test('cờ đáo hạn quyền chọn bật cả 24 giờ sau đáo hạn, tắt khi đã xa', () => {
  assert.match(eventWindow(new Date('2026-12-25T20:00:00Z'), [], 'swing').flag ?? '', /đáo hạn/);
  assert.equal(eventWindow(new Date('2026-12-27T12:00:00Z'), [], 'swing').flag, null);
});

test('G-09 quy về %/8h: 0,06%/4h chặn Long, 0,06%/8h thì không; note nêu cả hai chu kỳ', () => {
  const g4 = evaluateGates({ ...ok, fundingRate: 0.0006, fundingIntervalHours: 4 }).find((x) => x.code === 'G-09')!;
  assert.equal(g4.pass, false);
  assert.equal(g4.note, 'Funding 0,0600%/4h ≈ 0,1200%/8h');
  const g8 = evaluateGates({ ...ok, fundingRate: 0.0006, fundingIntervalHours: 8 }).find((x) => x.code === 'G-09')!;
  assert.equal(g8.pass, true);
  assert.equal(g8.note, 'Funding 0,0600%/8h');
});

test('G-01: cầu dao bật thì note nêu thời điểm bật', () => {
  const g = evaluateGates({ ...ok, breakerTripped: true, breakerNote: 'bật lúc X' }).find((x) => x.code === 'G-01')!;
  assert.equal(g.pass, false);
  assert.match(g.note, /bật lúc X/);
});

test('G-11: cắt lỗ > 2×ATR ngày hoặc > 20% giá thì trượt; note nêu % và bội ATR', () => {
  const pass = evaluateGates({ ...ok, stopDistPct: 8, stopDistAtr: 2 }).find((x) => x.code === 'G-11')!;
  assert.equal(pass.pass, true);
  const wideAtr = evaluateGates({ ...ok, stopDistPct: 8, stopDistAtr: 2.5 }).find((x) => x.code === 'G-11')!;
  assert.equal(wideAtr.pass, false);
  assert.match(wideAtr.note, /8,0%/);
  assert.match(wideAtr.note, /2,5×ATR/);
  const widePct = evaluateGates({ ...ok, stopDistPct: 25, stopDistAtr: 1.5 }).find((x) => x.code === 'G-11')!;
  assert.equal(widePct.pass, false);
  assert.match(widePct.note, /25,0%/);
});

test('G-11: ATR ngày không hợp lệ (NaN) → trượt (fail closed)', () => {
  const g = evaluateGates({ ...ok, stopDistAtr: NaN }).find((x) => x.code === 'G-11')!;
  assert.equal(g.pass, false);
  assert.match(g.note, /ATR/);
});

test('G-01: Short ngược xu hướng (up) điểm 85 nhưng RS z = −0,5 → trượt, note nêu RS z', () => {
  const g = evaluateGates({ ...ok, side: 'short', regime: 'up', score: 85, rsZ: -0.5 }).find((x) => x.code === 'G-01')!;
  assert.equal(g.pass, false);
  assert.match(g.note, /RS z = −0,50/);
});

test('G-01: Short ngược xu hướng đủ điểm, z = −2, rủi ro Cao → qua', () => {
  const g = evaluateGates({ ...ok, side: 'short', regime: 'up', score: 85, rsZ: -2, riskTier: 'Cao' }).find((x) => x.code === 'G-01')!;
  assert.equal(g.pass, true, g.note);
});

test('G-01: ngược xu hướng nhưng rủi ro Rất cao → trượt', () => {
  const g = evaluateGates({ ...ok, side: 'short', regime: 'up', score: 85, rsZ: -2, riskTier: 'Rất cao' }).find((x) => x.code === 'G-01')!;
  assert.equal(g.pass, false);
  assert.match(g.note, /Rất cao/);
});

test('G-01: ngược xu hướng, rsZ = null → trượt', () => {
  const g = evaluateGates({ ...ok, side: 'short', regime: 'up', score: 95, rsZ: null }).find((x) => x.code === 'G-01')!;
  assert.equal(g.pass, false);
  assert.match(g.note, /thiếu RS/);
});

const fastOk = { ...ok, mode: 'fast' as const, ageDays: 400, fundingRate: 0 };

test('G-01 fast: BTC 1H cùng chiều lệnh → qua', () => {
  const g = evaluateGates({ ...fastOk, btcHourly: { side: 'long', note: 'BTC 1H trên SMA200' } }).find((x) => x.code === 'G-01')!;
  assert.equal(g.pass, true, g.note);
});

test('G-01 fast: BTC 1H ngược chiều lệnh → trượt dù điểm 95 (không ngoại lệ)', () => {
  const g = evaluateGates({ ...fastOk, score: 95, btcHourly: { side: 'short', note: 'BTC 1H dưới SMA200' } }).find((x) => x.code === 'G-01')!;
  assert.equal(g.pass, false);
  assert.match(g.note, /BTC 1H dưới SMA200/);
});

test('G-01 fast: thiếu nến BTC 1H (side null) hoặc không có dữ liệu → trượt, note nói rõ', () => {
  const g = evaluateGates({ ...fastOk, btcHourly: { side: null, note: 'Thiếu dữ liệu BTC 1H (150/200 nến)' } }).find((x) => x.code === 'G-01')!;
  assert.equal(g.pass, false);
  assert.match(g.note, /Thiếu dữ liệu BTC 1H/);
  assert.equal(evaluateGates({ ...fastOk, btcHourly: null }).find((x) => x.code === 'G-01')!.pass, false);
});

test('G-01 swing: không xét BTC 1H', () => {
  const g = evaluateGates({ ...ok, btcHourly: { side: 'short', note: 'x' } }).find((x) => x.code === 'G-01')!;
  assert.equal(g.pass, true);
});

test('G-12: note lấy từ lý do của kế hoạch', () => {
  const g = evaluateGates({ ...ok, planValid: false, planNote: 'TP1 chỉ 0,6R' }).find((x) => x.code === 'G-12')!;
  assert.equal(g.pass, false);
  assert.equal(g.note, 'TP1 chỉ 0,6R');
  assert.equal(evaluateGates(ok).find((x) => x.code === 'G-12')!.pass, true);
});

// ---------- Kế hoạch 1c: cổng mô hình P-G1 / P-G2 / P-C1 ----------
import { inPatternScope, dailyTrend, patternTrendGate, contextGate } from './gates.ts';
import type { Candle } from './types.ts';

const dk = (i: number, close: number): Candle => ({ openTime: i * 86_400_000, closeTime: (i + 1) * 86_400_000 - 1, open: close, high: close + 0.5, low: close - 0.5, close, volume: 1, quoteVolume: close, takerBuyQuote: close / 2 });
const daysUp = Array.from({ length: 80 }, (_, i) => dk(i, 100 + i));
const daysDown = Array.from({ length: 80 }, (_, i) => dk(i, 300 - i));
const daysFlat = Array.from({ length: 80 }, (_, i) => dk(i, 100 + (i % 2)));

test('P-G1: chỉ rủi ro Thấp/Vừa VÀ thanh khoản nhóm cao (≤ costTierRank.high)', () => {
  assert.equal(inPatternScope('Thấp', 0.05).ok, true);
  assert.equal(inPatternScope('Vừa', 0.2).ok, true);
  assert.equal(inPatternScope('Cao', 0.05).ok, false);
  assert.equal(inPatternScope('Rất cao', 0.0).ok, false);
  assert.equal(inPatternScope('Thấp', 0.21).ok, false);
  assert.match(inPatternScope('Cao', 0.05).note, /rủi ro Cao/);
  assert.match(inPatternScope('Thấp', 0.3).note, /thanh khoản/);
});

test('xu hướng 1D theo S-01: giá/SMA20/SMA50 cùng chiều; thiếu dữ liệu → đi ngang kèm lý do', () => {
  assert.equal(dailyTrend(daysUp).trend, 'up');
  assert.equal(dailyTrend(daysDown).trend, 'down');
  assert.equal(dailyTrend(daysFlat).trend, 'sideways');
  assert.equal(dailyTrend(daysDown).closeBelowSma20, true);
  assert.equal(dailyTrend(daysUp).closeBelowSma20, false);
  const short = dailyTrend(daysUp.slice(0, 30));
  assert.equal(short.trend, 'sideways');
  assert.match(short.note, /Thiếu dữ liệu 1D/);
});

const tg = (over: Partial<Parameters<typeof patternTrendGate>[0]>) => patternTrendGate({
  kind: 'rectangle', side: 'long', daily: dailyTrend(daysUp), regime: 'up', ...over,
});

test('P-G2: chữ nhật/cờ/tam giác chỉ phá cùng chiều xu hướng 1D', () => {
  assert.equal(tg({}).code, 'P-G2');
  assert.equal(tg({}).pass, true);
  assert.equal(tg({ side: 'short' }).pass, false);
  assert.equal(tg({ daily: dailyTrend(daysFlat) }).pass, false);
  assert.equal(tg({ kind: 'bear_flag', side: 'short', daily: dailyTrend(daysDown), regime: 'down' }).pass, true);
  assert.equal(tg({ kind: 'asc_triangle', daily: dailyTrend(daysDown) }).pass, false);
});

test('P-G2: tam giác cân phá xuống trong thị trường Lên → không Short, dù 1D đang giảm', () => {
  const g = tg({ kind: 'sym_triangle', side: 'short', daily: dailyTrend(daysDown), regime: 'up' });
  assert.equal(g.pass, false);
  assert.match(g.note, /tam giác cân phá xuống trong thị trường Lên/);
  assert.equal(tg({ kind: 'sym_triangle', side: 'short', daily: dailyTrend(daysDown), regime: 'sideways' }).pass, true);
});

test('P-G2: hai đỉnh/hai đáy không còn luật riêng (chỉ là bối cảnh) — xét như mọi mô hình: cùng chiều 1D', () => {
  assert.equal(tg({ kind: 'double_bottom', daily: dailyTrend(daysFlat) }).pass, false);
  assert.doesNotMatch(tg({ kind: 'double_top', side: 'short', daily: dailyTrend(daysDown) }).note, /SMA200/);
});

test('P-C1: bối cảnh chặn đúng chiều; ngoài phạm vi thì qua kèm ghi chú', () => {
  const block = { long: true, short: false };
  assert.equal(contextGate({ block, notes: ['vai-đầu-vai đỉnh 1d'] }, 'long').pass, false);
  assert.match(contextGate({ block, notes: ['vai-đầu-vai đỉnh 1d'] }, 'long').note, /vai-đầu-vai đỉnh 1d/);
  assert.equal(contextGate({ block, notes: [] }, 'short').pass, true);
  const out = contextGate(null, 'long');
  assert.equal(out.pass, true);
  assert.match(out.note, /ngoài phạm vi/);
});

test('I4/I7 G-08 theo bậc ký quỹ: notional nhỏ qua; vượt bậc cao nhất → trượt; bậc thật (leverageBracket) được dùng khi truyền vào', () => {
  const okSmall = liquidationCheck({ stopDistFrac: 0.02, notional: 5_000, leverageCap: 5 });
  assert.equal(okSmall.ok, true);
  assert.match(okSmall.note, /mặc định thận trọng/);
  const huge = liquidationCheck({ stopDistFrac: 0.02, notional: 1e9, leverageCap: 5 });
  assert.equal(huge.ok, false);
  assert.match(huge.note, /vượt bậc ký quỹ cao nhất/);
  // bậc thật: MMR 40% → thanh lý quá gần SL 35% ngay cả ở 1× → trượt
  const real = liquidationCheck({ stopDistFrac: 0.35, notional: 1_000, leverageCap: 5, brackets: [{ notionalCap: 1e6, maintMarginRatio: 0.4, maxLeverage: 2 }] });
  assert.equal(real.ok, false);
  assert.match(real.note, /leverageBracket/);
});
