import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, COMMON } from './config.ts';
import { fundingSettlements, fundingBufferProblems, fundingFallbackRate, riskModel } from './sizing.ts';

test('đệm funding phủ thời gian giữ TỐI ĐA chiến lược cho phép (maxHoldHours), không phải thời gian giữ dự kiến', () => {
  assert.equal(CONFIG.swing.maxHoldHours, 504);
  assert.equal(CONFIG.fast.maxHoldHours, 24);
  assert.equal(fundingSettlements('swing', 8), 63); // 504 / 8
  assert.equal(fundingSettlements('swing', 4), 126);
  assert.equal(fundingSettlements('fast', 8), 3); // 24 / 8
  assert.equal(fundingSettlements('fast', 1), 24);
  // Long 100, SL 95, 0,01%/kỳ × 63 kỳ × giá 100 = 0,63 USDT/coin
  const m = riskModel('swing', 100, 95, { tierPct: 0, quoteVolPerMin: Infinity }, { maxAbsRate: 0.0001, intervalHours: 8 });
  assert.ok(Math.abs(m.fundingPerUnit - 0.63) < 1e-12);
  assert.ok(Math.abs(m.a - 5.63) < 1e-12);
});

test('đệm funding = 0 (thiếu dữ liệu) bị từ chối — fail closed; mức thận trọng thay thế theo chu kỳ', () => {
  assert.match(fundingBufferProblems({ maxAbsRate: 0, intervalHours: 8 }).join(), /thiếu dữ liệu funding/);
  assert.deepEqual(fundingBufferProblems({ maxAbsRate: 0.0001, intervalHours: 8 }), []);
  assert.equal(fundingFallbackRate(8), COMMON.risk.fundingFallbackPer8h);
  assert.equal(fundingFallbackRate(4), COMMON.risk.fundingFallbackPer8h / 2);
});

test('maxAbsFundingRate: |funding| lớn nhất trong N ngày tới t, chỉ kỳ ĐÃ chốt (≤ t), không nhìn trước', async () => {
  const { maxAbsFundingRate } = await import('./sizing.ts');
  const D = 86_400_000, T = 100 * D;
  const rows = [
    { fundingTime: T - 31 * D, fundingRate: -0.01 }, // ngoài 30 ngày
    { fundingTime: T - 10 * D, fundingRate: -0.0007 },
    { fundingTime: T - 1, fundingRate: 0.0003 },
    { fundingTime: T + 1, fundingRate: 0.05 }, // tương lai
  ];
  assert.equal(maxAbsFundingRate(rows, T, 30), 0.0007);
  assert.equal(maxAbsFundingRate([], T, 30), 0);
});

test('F1: tùy chọn đệm funding theo thời gian giữ DỰ KIẾN (fundingHoldHours) — mặc định vẫn là thời gian giữ tối đa', async () => {
  const { withConfigOverride } = await import('./config-override.ts');
  assert.equal(COMMON.risk.fundingBufferHorizon, 'max');
  assert.equal(fundingSettlements('swing', 8), 63);
  await withConfigOverride({ 'COMMON.risk.fundingBufferHorizon': 'expected' }, async () => {
    assert.equal(fundingSettlements('swing', 8), 21); // 168 / 8
    assert.equal(fundingSettlements('fast', 8), 1); // 8 / 8
  });
  assert.equal(fundingSettlements('swing', 8), 63);
});
