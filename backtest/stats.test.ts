import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  wilson, zFor, mulberry32, bootstrapMeanCI, maxDrawdownR, maxDrawdownPct, longestLosingStreak, compoundReturnPct, computeStats,
  groupStatsBy, pairedComparison, bonferroniAlpha, simulateRandomTrade, randomEntryBaseline, type StatTrade, type RandomTemplate,
} from './stats.ts';
import type { Candle } from '../packages/core/types.ts';

const close = (a: number, b: number, eps = 1e-4) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

// Lệnh tối thiểu cho bộ thống kê (chỉ các trường stats.ts đọc)
function tr(o: Partial<StatTrade> & { R: number }): StatTrade {
  return {
    signalId: o.signalId ?? `sig-${Math.random()}`, symbol: o.symbol ?? 'AUSDT', side: o.side ?? 'long', mode: o.mode ?? 'swing', grade: o.grade ?? 'B',
    kind: o.kind ?? 'zone', filled: o.filled ?? true, R: o.R, pnl: o.pnl ?? o.R * 100, costs: o.costs ?? 0, riskAtFill: o.riskAtFill ?? 100,
    pctEquity: o.pctEquity ?? o.R * 2, exits: o.exits ?? [], entryTime: o.entryTime ?? '2026-07-01T00:00:00.000Z',
    exitTime: o.exitTime ?? '2026-07-01T04:00:00.000Z', regime: o.regime ?? 'up', variant: o.variant ?? 'baseline',
  };
}

test('wilson: 5/10 và 0/10 khớp số tính tay (z = 1,96)', () => {
  const a = wilson(5, 10, 1.96);
  close(a.lo, 0.236593); close(a.hi, 0.763407);
  const b = wilson(0, 10, 1.96);
  close(b.lo, 0); close(b.hi, 0.277530);
  assert.deepEqual(wilson(0, 0, 1.96), { lo: 0, hi: 1 });
});

test('zFor: phân vị chuẩn hai phía', () => {
  close(zFor(0.05), 1.959964, 1e-5);
  close(zFor(0.01), 2.575829, 1e-5);
  close(zFor(0.05 / 4), 2.497705, 1e-5);
});

test('bonferroniAlpha: 0,05/k; k < 1 → lỗi', () => {
  close(bonferroniAlpha(0.05, 5), 0.01);
  assert.throws(() => bonferroniAlpha(0.05, 0));
});

test('mulberry32: cùng hạt → cùng dãy, trong [0,1)', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 100; i++) { const x = a(); assert.equal(x, b()); assert.ok(x >= 0 && x < 1); }
});

test('bootstrapMeanCI: hằng số → CI suy biến; có hạt → tất định; độ rộng ≈ 1,96·sd/√n', () => {
  assert.deepEqual(bootstrapMeanCI([2, 2, 2], { resamples: 500, seed: 1, alpha: 0.05 }), { mean: 2, lo: 2, hi: 2 });
  const xs = Array.from({ length: 400 }, (_, i) => (i % 2 === 0 ? -1 : 1)); // TB 0, sd 1 → SE 0,05
  const a = bootstrapMeanCI(xs, { resamples: 4000, seed: 7, alpha: 0.05 });
  const b = bootstrapMeanCI(xs, { resamples: 4000, seed: 7, alpha: 0.05 });
  assert.deepEqual(a, b);
  close(a.mean, 0);
  close(a.hi, 0.098, 0.015); close(a.lo, -0.098, 0.015);
  const wide = bootstrapMeanCI(xs, { resamples: 4000, seed: 7, alpha: 0.01 });
  assert.ok(wide.lo < a.lo && wide.hi > a.hi, 'alpha nhỏ hơn → CI rộng hơn');
  assert.deepEqual(bootstrapMeanCI([], { resamples: 10, seed: 1, alpha: 0.05 }), { mean: NaN, lo: NaN, hi: NaN });
});

test('maxDrawdownR: tính từ đỉnh (gồm mốc 0) của đường R cộng dồn', () => {
  assert.equal(maxDrawdownR([1, -1, -1, 2, -3, 1]), 3); // cộng dồn 1,0,−1,1,−2,−1; đỉnh 1 → đáy −2
  assert.equal(maxDrawdownR([-0.5, -0.5]), 1); // đỉnh là mốc 0
  assert.equal(maxDrawdownR([]), 0);
});

test('maxDrawdownPct: theo đường vốn, đỉnh gồm vốn đầu', () => {
  close(maxDrawdownPct([{ t: 1, equity: 110 }, { t: 2, equity: 90 }, { t: 3, equity: 120 }, { t: 4, equity: 96 }], 100), 20);
  close(maxDrawdownPct([{ t: 1, equity: 95 }], 100), 5);
});

test('longestLosingStreak: pnl ≤ 0 là thua (như groupStats của simulate.ts)', () => {
  assert.equal(longestLosingStreak([1, -1, -2, 0, 3, -1]), 3);
  assert.equal(longestLosingStreak([]), 0);
});

test('compoundReturnPct: lãi kép theo % vốn từng lệnh', () => {
  close(compoundReturnPct([10, -10]), -1);
  close(compoundReturnPct([]), 0);
});

test('computeStats: số đếm, kỳ vọng, PF, phí R, TP1, lệnh chưa khớp bị bỏ', () => {
  const xs = [
    tr({ R: 2, pnl: 300, costs: 10, riskAtFill: 100, pctEquity: 3, exits: [{ role: 'TP1', qty: 1, price: 1, time: 1 }] }),
    tr({ R: -1, pnl: -100, costs: 30, riskAtFill: 100, pctEquity: -1 }),
    tr({ R: -0.5, pnl: -200, costs: 20, riskAtFill: 100, pctEquity: -2 }),
    tr({ R: 0, pnl: 0, filled: false }),
  ];
  const s = computeStats(xs, { resamples: 200, seed: 1, alpha: 0.05 });
  assert.equal(s.trades, 3);
  assert.equal(s.wins, 1);
  close(s.winRate, 1 / 3);
  const w = wilson(1, 3, zFor(0.05));
  close(s.winCI.lo, w.lo); close(s.winCI.hi, w.hi);
  assert.equal(s.tp1Hits, 1);
  close(s.expectancyR, 0.5 / 3);
  close(s.profitFactor, 1); // 300 / 300
  close(s.avgFeesR, 0.2);
  assert.equal(s.longestLosingStreak, 2);
  close(s.maxDrawdownR, 1.5);
  close(s.compoundReturnPct, (1.03 * 0.99 * 0.98 - 1) * 100);
  assert.equal(s.maxDrawdownPct, null, 'không có đường vốn → không có DD % vốn');
  assert.equal(s.smallSample, true, '< 30 lệnh');
  const withCurve = computeStats(xs, { resamples: 200, seed: 1, alpha: 0.05, equity: { capital: 100, curve: [{ t: 1, equity: 103 }, { t: 2, equity: 101 }] } });
  close(withCurve.maxDrawdownPct!, (2 / 103) * 100);
  close(withCurve.totalReturnPct!, 1);
});

test('groupStatsBy: tách theo chiều, có nhóm "tất cả" và khóa ghép', () => {
  const xs = [tr({ R: 1, side: 'long' }), tr({ R: -1, side: 'short' }), tr({ R: -1, side: 'short', regime: 'down' })];
  const g = groupStatsBy(xs, ['side', 'regime'], { resamples: 50, seed: 1, alpha: 0.05 });
  const by = Object.fromEntries(g.map((x) => [x.key, x.stats.trades]));
  assert.deepEqual(by, { 'tất cả': 3, 'side=long': 1, 'side=short': 2, 'regime=down': 1, 'regime=up': 2,
    'side=long|regime=up': 1, 'side=short|regime=down': 1, 'side=short|regime=up': 1 });
});

test('pairedComparison: khớp theo signalId, ΔR = biến thể − gốc, ghi lệnh không khớp, Bonferroni rộng hơn', () => {
  const base = [tr({ signalId: 'a', R: -1 }), tr({ signalId: 'b', R: 0.5 }), tr({ signalId: 'c', R: 1 }), tr({ signalId: 'z', R: 0, filled: false })];
  const vari = [tr({ signalId: 'a', R: 0 }), tr({ signalId: 'b', R: 0.5 }), tr({ signalId: 'd', R: 2 })];
  const p = pairedComparison(base, vari, { resamples: 2000, seed: 3, alpha: 0.05, trials: 5 });
  assert.equal(p.matched, 2);
  close(p.meanDeltaR, 0.5);
  assert.deepEqual(p.baseOnly, ['c']);
  assert.deepEqual(p.variantOnly, ['d']);
  close(p.alphaAdj, 0.01);
  assert.ok(p.ciAdj.lo <= p.ci.lo && p.ciAdj.hi >= p.ci.hi);
  assert.match(p.note, /1 lệnh chỉ có ở gốc, 1 lệnh chỉ có ở biến thể/);
});

// Nến 1H tối thiểu
function bars(rows: Array<[number, number, number, number]>): Candle[] {
  return rows.map(([o, h, l, c], i) => ({ openTime: i * 3_600_000, closeTime: (i + 1) * 3_600_000 - 1, open: o, high: h, low: l, close: c, volume: 1, quoteVolume: 1, takerBuyQuote: 0 }) as Candle);
}

test('simulateRandomTrade: vào ở giá mở, giữ đúng thời gian, SL bất lợi trước, gap SL khớp ở giá mở, trừ phí R', () => {
  const tpl: RandomTemplate = { symbol: 'AUSDT', side: 'long', holdMs: 2 * 3_600_000, stopPct: 0.1, feeR: 0.1 };
  // không chạm SL: thoát ở giá đóng nến cuối của 2 giờ giữ
  close(simulateRandomTrade(tpl, bars([[100, 104, 95, 103], [103, 106, 96, 105], [105, 105, 50, 60]]), 0)!, 0.05 / 0.1 - 0.1);
  // chạm SL 90 trong nến thứ 2
  close(simulateRandomTrade(tpl, bars([[100, 104, 95, 103], [103, 106, 89, 105]]), 0)!, -1 - 0.1);
  // gap qua SL: mở 85 → khớp 85
  close(simulateRandomTrade(tpl, bars([[100, 104, 95, 96], [85, 88, 80, 86]]), 0)!, -1.5 - 0.1);
  // Short đối xứng: SL 110, giá giảm còn 95
  close(simulateRandomTrade({ ...tpl, side: 'short' }, bars([[100, 104, 95, 97], [97, 99, 94, 95]]), 0)!, 0.5 - 0.1);
  // không đủ nến cho thời gian giữ → null
  assert.equal(simulateRandomTrade(tpl, bars([[100, 104, 95, 103]]), 0), null);
});

test('randomEntryBaseline: tất định theo hạt, đúng số lệnh mỗi lần lặp', () => {
  const series = bars(Array.from({ length: 200 }, (_, i) => { const p = 100 + Math.sin(i / 5) * 5; return [p, p + 1, p - 1, p + 0.5] as [number, number, number, number]; }));
  const tpls: RandomTemplate[] = [{ symbol: 'AUSDT', side: 'long', holdMs: 3 * 3_600_000, stopPct: 0.03, feeR: 0.05 }, { symbol: 'AUSDT', side: 'short', holdMs: 5 * 3_600_000, stopPct: 0.03, feeR: 0.05 }];
  const a = randomEntryBaseline(tpls, () => series, { reps: 50, seed: 9, alpha: 0.05 });
  const b = randomEntryBaseline(tpls, () => series, { reps: 50, seed: 9, alpha: 0.05 });
  assert.deepEqual(a, b);
  assert.equal(a.reps, 50);
  assert.equal(a.tradesPerRep, 2);
  assert.ok(a.lo <= a.meanExpectancyR && a.meanExpectancyR <= a.hi);
  assert.equal(a.skippedTemplates, 0);
});
