import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, type AnalyzeInput } from './analyze.ts';
import type { Candle } from './types.ts';

function k(i: number, close: number, takerShare = 0.5): Candle {
  return { openTime: i * 1000, closeTime: i * 1000 + 999, open: close * 0.999, high: close * 1.004, low: close * 0.996,
    close, volume: 100, quoteVolume: 100 * close, takerBuyQuote: 100 * close * takerShare };
}
const up = (n: number, step: number, share = 0.5) => Array.from({ length: n }, (_, i) => k(i, 100 + i * step, share));

const base: AnalyzeInput = {
  mode: 'swing',
  contract: { symbol: 'TESTUSDT', baseAsset: 'TEST', onboardDate: Date.parse('2024-01-01'), tickSize: 0.001, stepSize: 0.001 },
  trend: up(300, 1), entry: up(500, 0.2, 0.6), daily: up(300, 1), hourly: up(100, 0.05), btcTrend: up(300, 0.3),
  regime: 'up', breakerTripped: false, liquidityRankPct: 0.05, spreadPct: 0.02,
  premium: { symbol: 'TESTUSDT', markPrice: 199.8, lastFundingRate: 0.0001, nextFundingTime: Date.parse('2026-10-19T16:00:00Z') },
  now: new Date('2026-10-19T12:00:00Z'), events: [], capital: 1000, riskPct: 0.5,
};

test('xu hướng tăng rõ, thị trường lên → Đạt tiêu chí Long, có kế hoạch', () => {
  const a = analyze(base);
  assert.equal(a.label, 'Đạt tiêu chí Long', JSON.stringify(a.gates.filter((g) => !g.pass)));
  assert.ok(a.plan !== null && a.plan.side === 'long');
});

test('cầu dao bật → không Đạt tiêu chí Long', () => {
  const a = analyze({ ...base, breakerTripped: true });
  assert.notEqual(a.label, 'Đạt tiêu chí Long');
  assert.equal(a.gates.find((g) => g.code === 'G-01')?.pass, false);
});

test('thị trường xuống nhưng điểm ≥ 80 → vẫn Đạt tiêu chí Long (ngoại lệ ngược xu hướng, spec 3.2)', () => {
  const a = analyze({ ...base, regime: 'down' });
  assert.ok(a.best.score >= 80, `điểm ${a.best.score}`);
  assert.equal(a.label, 'Đạt tiêu chí Long');
});

test('mọi lý do và cổng đều mang mã có trong danh mục', async () => {
  const { ruleByCode } = await import('./rules.ts');
  const a = analyze(base);
  for (const r of [...a.long.reasons, ...a.short.reasons]) ruleByCode(r.code);
  for (const g of a.gates) ruleByCode(g.code);
});
