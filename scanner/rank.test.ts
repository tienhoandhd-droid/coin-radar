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

const mk = (symbol: string, score: number, side: 'long' | 'short' = 'long', gatesPass = true): Analysis => {
  const mkSide = (sd: 'long' | 'short', sc: number) => ({ side: sd, score: sc, coverage: 1, reasons: [], rsZ: null });
  return {
    symbol, mode: 'swing', price: 1,
    label: gatesPass && score >= 70 ? (side === 'long' ? 'Đạt tiêu chí Long' : 'Đạt tiêu chí Short') : 'Theo dõi',
    best: mkSide(side, score), long: mkSide('long', side === 'long' ? score : 0), short: mkSide('short', side === 'short' ? score : 0),
    gates: [{ code: 'G-02', pass: gatesPass, note: '' }], plan: null, risk: { tier: 'Vừa', notes: [] }, flags: [],
    patternScope: { ok: false, note: '' }, context: null, patterns: [], patternSignal: null, grading: undefined as never, grade: null, portfolio: null,
  };
};
const sameGroup = (list: Analysis[]) => new Map(list.map((a, i) => [a.symbol, i / 1000])); // mọi mã cùng nhóm thanh khoản cao

test('applyTopRank: chỉ giữ “Đạt tiêu chí” cho top 10% điểm trong nhóm', () => {
  const list = Array.from({ length: 20 }, (_, i) => mk(`S${i}`, 70 + i));
  const out = applyTopRank(list, sameGroup(list));
  const kept = out.filter((a) => a.label === 'Đạt tiêu chí Long').map((a) => a.symbol);
  assert.deepEqual(kept.sort(), ['S18', 'S19']);
});

test('D4: coin trượt cổng điểm cao không chiếm suất xếp hạng', () => {
  const pass = Array.from({ length: 20 }, (_, i) => mk(`P${i}`, 70 + i));
  const failing = Array.from({ length: 10 }, (_, i) => mk(`F${i}`, 99, 'long', false));
  const list = [...pass, ...failing];
  const out = applyTopRank(list, sameGroup(list));
  const kept = out.filter((a) => a.label === 'Đạt tiêu chí Long').map((a) => a.symbol);
  assert.deepEqual(kept.sort(), ['P18', 'P19']); // 10% của 20 mã đủ điều kiện, không phải của 30
  assert.ok(out.filter((a) => a.symbol.startsWith('F')).every((a) => a.label === 'Theo dõi'));
});

test('D4: coin điểm < 70 không được tính vào mẫu xếp hạng', () => {
  const pass = Array.from({ length: 10 }, (_, i) => mk(`P${i}`, 70 + i)); // 10 mã đủ điều kiện → giữ 1
  const low = Array.from({ length: 30 }, (_, i) => mk(`L${i}`, 40 + i % 20)); // điểm < 70
  const list = [...pass, ...low];
  const out = applyTopRank(list, sameGroup(list));
  assert.deepEqual(out.filter((a) => a.label === 'Đạt tiêu chí Long').map((a) => a.symbol), ['P9']);
});

test('D4: xếp hạng Long và Short riêng biệt trong cùng nhóm', () => {
  const longs = Array.from({ length: 10 }, (_, i) => mk(`L${i}`, 70 + i, 'long'));
  const shorts = Array.from({ length: 10 }, (_, i) => mk(`S${i}`, 75 + i, 'short'));
  const list = [...longs, ...shorts];
  const out = applyTopRank(list, sameGroup(list));
  const kept = out.filter((a) => a.label.startsWith('Đạt')).map((a) => a.symbol).sort();
  assert.deepEqual(kept, ['L9', 'S9']); // mỗi chiều giữ 1 mã, Long không bị Short (điểm cao hơn) lấn suất
});

test('D4: các nhóm thanh khoản xếp hạng độc lập', () => {
  const a = Array.from({ length: 10 }, (_, i) => mk(`H${i}`, 70 + i));
  const b = Array.from({ length: 10 }, (_, i) => mk(`W${i}`, 70 + i));
  const ranks = new Map([...a.map((x) => [x.symbol, 0.05] as const), ...b.map((x) => [x.symbol, 0.9] as const)]);
  const out = applyTopRank([...a, ...b], ranks);
  assert.deepEqual(out.filter((x) => x.label.startsWith('Đạt')).map((x) => x.symbol).sort(), ['H9', 'W9']);
});

test('applyTopRank: hạ nhãn thì bỏ cả kế hoạch mô hình', () => {
  const list = Array.from({ length: 20 }, (_, i) => ({ ...mk(`S${i}`, 70 + i), patternSignal: { side: 'long' } as unknown as Analysis['patternSignal'] }));
  const out = applyTopRank(list, sameGroup(list));
  const demoted = out.filter((a) => a.label === 'Theo dõi');
  assert.ok(demoted.length > 0);
  assert.ok(demoted.every((a) => a.patternSignal === null && a.plan === null && a.grade === null));
});
