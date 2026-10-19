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
  liquidationOk: true, fundingRate: 0.0001, minutesToFunding: 200,
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
