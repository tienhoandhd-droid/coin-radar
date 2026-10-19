import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marginTier, sizeSlippagePct, defaultBrackets, type MarginBracket } from './margin.ts';
import { COMMON } from './config.ts';

// Đúng dạng GET /fapi/v1/leverageBracket (docs/reference/binance-usdm-api.md): bracket, initialLeverage, notionalCap, notionalFloor, maintMarginRatio, cum
const B: MarginBracket[] = [
  { bracket: 1, initialLeverage: 150, notionalCap: 50_000, notionalFloor: 0, maintMarginRatio: 0.004, cum: 0 },
  { bracket: 2, initialLeverage: 100, notionalCap: 600_000, notionalFloor: 50_000, maintMarginRatio: 0.005, cum: 50 },
];

test('I7 bậc ký quỹ: chọn bậc đầu tiên có notional ≤ trần; vượt bậc cao nhất → null', () => {
  assert.deepEqual(marginTier(10_000, B), { mmr: 0.004, maxLeverage: 150, notionalCap: 50_000, source: 'leverageBracket' });
  assert.equal(marginTier(1e9, []), null, 'mảng bậc rỗng từ sàn = không có bậc → không mở');
  assert.equal(marginTier(50_000, B)!.mmr, 0.004);
  assert.equal(marginTier(50_001, B)!.mmr, 0.005);
  assert.equal(marginTier(700_000, B), null);
});

test('I7 bậc ký quỹ mặc định (chưa có key) = GIẢ ĐỊNH THẬN TRỌNG: MMR mỗi notional ≥ bậc cao của altcoin nhỏ, trần đòn bẩy thấp; dạng như leverageBracket', () => {
  const d = defaultBrackets();
  assert.ok(d.length >= 2);
  for (let j = 0; j < d.length; j++) {
    assert.equal(d[j]!.bracket, j + 1);
    assert.equal(d[j]!.notionalFloor, j === 0 ? 0 : d[j - 1]!.notionalCap);
    if (j > 0) {
      assert.ok(d[j]!.maintMarginRatio > d[j - 1]!.maintMarginRatio);
      assert.ok(d[j]!.initialLeverage <= d[j - 1]!.initialLeverage);
      // cum (số tiền ký quỹ duy trì bù) liên tục giữa hai bậc như công thức Binance
      assert.ok(Math.abs(d[j]!.cum - (d[j - 1]!.cum + d[j]!.notionalFloor * (d[j]!.maintMarginRatio - d[j - 1]!.maintMarginRatio))) < 1e-6);
    }
  }
  // các mốc thận trọng (rà soát B0b #3): ≤ 5k: 2,5%; ≤ 25k: 5%; ≤ 100k: 10%; ≤ 250k: 12,5%; ≤ 1M: 25%; ≤ 3M: 50% ở 1×; hơn → không mở
  const at = (n: number) => marginTier(n);
  assert.deepEqual([at(5_000)!.mmr, at(20_000)!.mmr, at(100_000)!.mmr, at(200_000)!.mmr, at(900_000)!.mmr, at(3_000_000)!.mmr], [0.025, 0.05, 0.1, 0.125, 0.25, 0.5]);
  assert.equal(at(3_000_000)!.maxLeverage, 1);
  assert.equal(at(1_000)!.source, 'giả định');
  assert.equal(at(3_000_001), null);
});

test('I7 trượt giá theo cỡ lệnh: tỉ lệ thuận notional / khối lượng 1 phút; thiếu khối lượng → ném lỗi (fail-closed)', () => {
  const k = COMMON.slippage.pctPerParticipation;
  assert.equal(sizeSlippagePct(0, 10_000), 0);
  assert.equal(sizeSlippagePct(5_000, 10_000), k * 0.5);
  assert.equal(sizeSlippagePct(20_000, 10_000), k * 2);
  assert.throws(() => sizeSlippagePct(1_000, 0), /khối lượng/);
  assert.throws(() => sizeSlippagePct(1_000, NaN), /khối lượng/);
});
