import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Analysis } from './analyze.ts';
import { entryBlocks } from './entry-filters.ts';
import { withConfigOverride } from './config-override.ts';

// Analysis tối thiểu: nhãn, tín hiệu (chiều), rsZ
const an = (symbol: string, side: 'long' | 'short' | null, rsZ: number | null): Analysis => ({
  symbol, label: side === null ? 'Theo dõi' : side === 'long' ? 'Đạt tiêu chí Long' : 'Đạt tiêu chí Short',
  signal: side === null ? null : { id: symbol, fresh: true, held: false, kind: 'zone', side },
  long: { side: 'long', score: 0, coverage: 1, reasons: [], rsZ }, short: { side: 'short', score: 0, coverage: 1, reasons: [], rsZ },
} as unknown as Analysis);

// 10 mã rsZ −5…4: 20% yếu nhất = rsZ ≤ −4 (A0, A1); nửa trên = rsZ ≥ trung vị
const many = (side: 'long' | 'short') => Array.from({ length: 10 }, (_, i) => an(`A${i}`, side, i - 5));

test('mặc định mọi luật tắt → không chặn gì', () => {
  assert.equal(entryBlocks(many('short'), { mode: 'swing', regime: 'sideways' }).size, 0);
});

test('#4 Swing chỉ khi có xu hướng: Đi ngang → chặn mọi lệnh MỚI Swing; Lướt nhanh không áp dụng', async () => {
  await withConfigOverride({ 'COMMON.entryRules.swingTrendOnly': true }, async () => {
    const b = entryBlocks(many('long'), { mode: 'swing', regime: 'sideways' });
    assert.equal(b.size, 10);
    assert.match(b.get('A3')!, /#4.*Đi ngang/);
    assert.equal(entryBlocks(many('long'), { mode: 'swing', regime: 'up' }).size, 0);
    assert.equal(entryBlocks(many('long'), { mode: 'fast', regime: 'sideways' }).size, 0);
  });
});

test('#5 Short bất đối xứng: cần chế độ Xuống + RS thuộc 20% yếu nhất + funding TB 3 ngày ≥ 0 (thiếu funding → chặn); Long không đổi', async () => {
  const fm = (s: string, days: number) => { assert.equal(days, 3); return s === 'A1' ? -0.0001 : s === 'A9' ? null : 0.0001; };
  await withConfigOverride({ 'COMMON.entryRules.shortAsym': true }, async () => {
    const up = entryBlocks(many('short'), { mode: 'swing', regime: 'up', fundingMean: fm });
    assert.equal(up.size, 10);
    assert.match(up.get('A0')!, /Xuống/);
    const down = entryBlocks(many('short'), { mode: 'swing', regime: 'down', fundingMean: fm });
    assert.equal(down.size, 9, 'chỉ A0 qua');
    assert.equal(down.has('A0'), false);
    assert.match(down.get('A1')!, /funding/);
    assert.match(down.get('A5')!, /20% yếu nhất/);
    assert.equal(entryBlocks(many('long'), { mode: 'swing', regime: 'up', fundingMean: fm }).size, 0);
  });
});

test('#7 Long Swing cần RS ≥ trung vị nhóm; Short không đổi; rsZ thiếu → chặn', async () => {
  await withConfigOverride({ 'COMMON.entryRules.swingLongRsTopHalf': true }, async () => {
    const rs = [...many('long'), an('NULL', 'long', null)];
    const b = entryBlocks(rs, { mode: 'swing', regime: 'up' });
    // trung vị rsZ của 10 mã −5…4 = −0,5 → A0..A4 (−5…−1) bị chặn, A5..A9 qua
    assert.deepEqual([...b.keys()].sort(), ['A0', 'A1', 'A2', 'A3', 'A4', 'NULL']);
    assert.equal(entryBlocks(many('short'), { mode: 'swing', regime: 'up' }).size, 0);
  });
});

test('#8 funding mặt cắt ngang: Long khi phân vị funding TB 7 ngày ≤ 70%, Short khi ≥ 70%', async () => {
  const fm = (s: string, days: number) => { assert.equal(days, 7); return Number(s.slice(1)) * 0.0001; }; // A0 thấp nhất … A9 cao nhất
  await withConfigOverride({ 'COMMON.entryRules.fundingXsPct': 70 }, async () => {
    const L = entryBlocks(many('long'), { mode: 'swing', regime: 'up', fundingMean: fm });
    assert.deepEqual([...L.keys()].sort(), ['A7', 'A8', 'A9']); // phân vị 80/90/100%
    const S = entryBlocks(many('short'), { mode: 'swing', regime: 'up', fundingMean: fm });
    assert.deepEqual([...S.keys()].sort(), ['A0', 'A1', 'A2', 'A3', 'A4', 'A5']); // phân vị 10…60%
  });
});

test('luật đăng ký trước 20/10/2026: sides — chỉ Long chặn Short (mọi chế độ), thẻ #sides', async () => {
  await withConfigOverride({ 'COMMON.entryRules.sides': ['long'] }, async () => {
    const b = entryBlocks([an('L', 'long', 0), an('S', 'short', 0)], { mode: 'swing', regime: 'up' });
    assert.equal(b.size, 1);
    assert.match(b.get('S')!, /^#sides/);
    assert.equal(entryBlocks([an('S', 'short', 0)], { mode: 'fast', regime: 'up' }).size, 1);
  });
});

test('FGI-hướng (chỉ Swing): chặn phía ngược FGI; thiếu FGI hoặc FGI null → chặn mọi lệnh Swing mới (fail closed); Lướt nhanh không áp dụng', async () => {
  await withConfigOverride({ 'COMMON.entryRules.fgiDirection': { lagDays: 1, meanDays: 7, threshold: 50 } }, async () => {
    const list = [an('L', 'long', 0), an('S', 'short', 0)];
    const greed = entryBlocks(list, { mode: 'swing', regime: 'up', fgi: { side: 'long', reason: 'FGI TB 60' } });
    assert.deepEqual([...greed.keys()], ['S']);
    assert.match(greed.get('S')!, /#FGI FGI TB 60 — bỏ Short/);
    assert.equal(entryBlocks(list, { mode: 'swing', regime: 'up' }).size, 2, 'không có FGI → chặn hết');
    const missing = entryBlocks(list, { mode: 'swing', regime: 'up', fgi: { side: null, reason: 'FGI thiếu ngày 2026-07-01' } });
    assert.equal(missing.size, 2);
    assert.match(missing.get('L')!, /thiếu ngày/);
    assert.equal(entryBlocks(list, { mode: 'fast', regime: 'up' }).size, 0);
  });
});

test('minListingDays: niêm yết chưa đủ N ngày tại thời điểm quyết định → chặn; thiếu ngày niêm yết → chặn', async () => {
  const now = Date.UTC(2026, 7, 1);
  const onboardDate = new Map([['OLD', now - 31 * 86_400_000], ['NEW', now - 29 * 86_400_000]]);
  await withConfigOverride({ 'COMMON.entryRules.minListingDays': 30 }, async () => {
    const b = entryBlocks([an('OLD', 'long', 0), an('NEW', 'long', 0), an('X', 'long', 0)], { mode: 'swing', regime: 'up', now, onboardDate });
    assert.deepEqual([...b.keys()].sort(), ['NEW', 'X']);
    assert.match(b.get('NEW')!, /#listing niêm yết 29,0 ngày < 30/);
    assert.match(b.get('X')!, /thiếu ngày niêm yết/);
  });
  assert.equal(entryBlocks([an('NEW', 'long', 0)], { mode: 'swing', regime: 'up', now, onboardDate }).size, 0, 'mặc định tắt');
});
