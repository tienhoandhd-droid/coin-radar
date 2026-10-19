import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liquidityRanks, applyTopRank } from './rank.ts';
import type { Analysis } from '../packages/core/analyze.ts';

test('liquidityRanks: khối lượng cao nhất = 0, thấp nhất = 1', () => {
  const r = liquidityRanks([
    { symbol: 'A', quoteVolume24h: 300, priceChangePct24h: 0 },
    { symbol: 'B', quoteVolume24h: 100, priceChangePct24h: 0 },
    { symbol: 'C', quoteVolume24h: 200, priceChangePct24h: 0 },
  ]);
  assert.equal(r.get('A'), 0);
  assert.equal(r.get('C'), 0.5);
  assert.equal(r.get('B'), 1);
});

test('applyTopRank: chỉ giữ “Đạt tiêu chí” cho top 10% điểm trong nhóm', () => {
  const mk = (symbol: string, score: number): Analysis => ({
    symbol, mode: 'swing', price: 1, label: 'Đạt tiêu chí Long',
    best: { side: 'long', score, coverage: 1, reasons: [], rsZ: null }, long: { side: 'long', score, coverage: 1, reasons: [], rsZ: null },
    short: { side: 'short', score: 0, coverage: 1, reasons: [], rsZ: null }, gates: [], plan: null, risk: { tier: 'Vừa', notes: [] }, flags: [],
  });
  const list = Array.from({ length: 20 }, (_, i) => mk(`S${i}`, 70 + i));
  const ranks = new Map(list.map((a, i) => [a.symbol, i / 100])); // cả 20 cùng nhóm thanh khoản cao
  const out = applyTopRank(list, ranks);
  const kept = out.filter((a) => a.label === 'Đạt tiêu chí Long').map((a) => a.symbol);
  assert.deepEqual(kept.sort(), ['S18', 'S19']);
});
