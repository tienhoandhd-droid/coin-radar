import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, COMMON } from './config.ts';
import { applyConfigOverride, withConfigOverride } from './config-override.ts';

test('applyConfigOverride: đặt giá trị theo đường dẫn CONFIG.<mode>.<khóa> / COMMON.<…>, trả hàm khôi phục đúng giá trị cũ', () => {
  const before = { ts: CONFIG.swing.timeStopHours, skip: COMMON.zones.tp1SkipWeak, risk: COMMON.risk.perTradePct };
  const restore = applyConfigOverride({ 'CONFIG.swing.timeStopHours': 48, 'COMMON.zones.tp1SkipWeak': false });
  assert.equal(CONFIG.swing.timeStopHours, 48);
  assert.equal(COMMON.zones.tp1SkipWeak, false);
  restore();
  assert.equal(CONFIG.swing.timeStopHours, before.ts);
  assert.equal(COMMON.zones.tp1SkipWeak, before.skip);
  assert.equal(COMMON.risk.perTradePct, before.risk);
});

test('applyConfigOverride: khóa không tồn tại (gõ sai) → ném lỗi, không đổi gì; gốc lạ → ném lỗi', () => {
  const ts = CONFIG.swing.timeStopHours;
  assert.throws(() => applyConfigOverride({ 'CONFIG.swing.timeStopHours': 1, 'COMMON.zones.khongCo': 1 }), /COMMON.zones.khongCo/);
  assert.equal(CONFIG.swing.timeStopHours, ts);
  assert.throws(() => applyConfigOverride({ 'OTHER.x': 1 }), /CONFIG hoặc COMMON/);
});

test('applyConfigOverride: CẤM nâng rủi ro người dùng chốt (2%/lệnh, 10 lệnh, 10% tổng rủi ro)', () => {
  assert.throws(() => applyConfigOverride({ 'COMMON.risk.perTradePct': 3 }), /rủi ro người dùng chốt/);
  assert.throws(() => applyConfigOverride({ 'COMMON.portfolio.maxOpenTrades': 11 }), /rủi ro người dùng chốt/);
  assert.throws(() => applyConfigOverride({ 'COMMON.portfolio.maxOpenRiskPct': 12 }), /rủi ro người dùng chốt/);
});

test('withConfigOverride: khôi phục cả khi hàm ném lỗi (cách ly giữa các lần chạy)', async () => {
  const ts = CONFIG.swing.timeStopHours;
  await assert.rejects(withConfigOverride({ 'CONFIG.swing.timeStopHours': 5 }, async () => { assert.equal(CONFIG.swing.timeStopHours, 5); throw new Error('x'); }), /x/);
  assert.equal(CONFIG.swing.timeStopHours, ts);
  assert.equal(await withConfigOverride({}, async () => 7), 7);
});

test('F1 ràng buộc: fundingBufferHorizon "expected" BẮT BUỘC fundingRuntimeGuard bật — validateConfig ném lỗi; ghi đè sai bị từ chối, không đổi gì', async () => {
  const { validateConfig } = await import('./config-validate.ts');
  assert.doesNotThrow(() => validateConfig());
  assert.throws(() => applyConfigOverride({ 'COMMON.risk.fundingBufferHorizon': 'expected' }), /fundingRuntimeGuard/);
  assert.equal(COMMON.risk.fundingBufferHorizon, 'max');
  const restore = applyConfigOverride({ 'COMMON.risk.fundingBufferHorizon': 'expected', 'COMMON.risk.fundingRuntimeGuard': true });
  assert.doesNotThrow(() => validateConfig());
  restore();
});
