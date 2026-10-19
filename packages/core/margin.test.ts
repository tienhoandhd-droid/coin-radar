import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marginTier, sizeSlippagePct, type MarginBracket } from './margin.ts';
import { COMMON } from './config.ts';

const B: MarginBracket[] = [
  { notionalCap: 50_000, maintMarginRatio: 0.004, maxLeverage: 150 },
  { notionalCap: 600_000, maintMarginRatio: 0.005, maxLeverage: 100 },
];

test('I7 bậc ký quỹ: chọn bậc đầu tiên có notional ≤ trần; vượt bậc cao nhất → null', () => {
  assert.deepEqual(marginTier(10_000, B), { mmr: 0.004, maxLeverage: 150, notionalCap: 50_000, source: 'leverageBracket' });
  assert.equal(marginTier(50_000, B)!.mmr, 0.004);
  assert.equal(marginTier(50_001, B)!.mmr, 0.005);
  assert.equal(marginTier(700_000, B), null);
});

test('I7 bậc ký quỹ mặc định (chưa có key): thận trọng — MMR ≥ 1% cũ ở mọi bậc, tăng dần theo notional, đòn bẩy tối đa giảm dần', () => {
  const d = COMMON.margin.defaultBrackets;
  assert.ok(d.length >= 2);
  for (let j = 0; j < d.length; j++) {
    assert.ok(d[j]!.maintMarginRatio >= 0.01);
    if (j > 0) {
      assert.ok(d[j]!.notionalCap > d[j - 1]!.notionalCap);
      assert.ok(d[j]!.maintMarginRatio >= d[j - 1]!.maintMarginRatio);
      assert.ok(d[j]!.maxLeverage <= d[j - 1]!.maxLeverage);
    }
  }
  assert.equal(marginTier(1_000)!.source, 'mặc định thận trọng');
  assert.equal(marginTier(d[d.length - 1]!.notionalCap * 2), null);
});

test('I7 trượt giá theo cỡ lệnh: tỉ lệ thuận notional / khối lượng 1 phút; thiếu khối lượng → ném lỗi (fail-closed)', () => {
  const k = COMMON.slippage.pctPerParticipation;
  assert.equal(sizeSlippagePct(0, 10_000), 0);
  assert.equal(sizeSlippagePct(5_000, 10_000), k * 0.5);
  assert.equal(sizeSlippagePct(20_000, 10_000), k * 2);
  assert.throws(() => sizeSlippagePct(1_000, 0), /khối lượng/);
  assert.throws(() => sizeSlippagePct(1_000, NaN), /khối lượng/);
});
