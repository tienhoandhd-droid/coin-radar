import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quarterlyExpiry, eventWindow } from './events.ts';
import { evaluateGates, type GateContext } from './gates.ts';
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
  btcHourly: null, rsZ: 0, riskTier: 'Vừa', liquidationOk: true, stopDistPct: 5, stopDistAtr: 1.2, fundingRate: 0.0001, fundingIntervalHours: 8, fundingIntervalDefault: false, minutesToFunding: 200,
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
  fail({ liquidationOk: false }, 'G-08');
  fail({ fundingRate: 0.002 }, 'G-09');
  fail({ mode: 'fast', fundingRate: 0.0002, minutesToFunding: 10 }, 'G-10');
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
