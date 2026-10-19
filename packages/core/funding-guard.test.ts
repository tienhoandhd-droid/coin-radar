import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fundingGuard } from './funding-guard.ts';

// Long 400 coin vào 100, SL 95, vốn lúc vào 100 000 → ngân sách 2% = 2 000 USDT; phí chiều ra 0,05% notional
const L = { side: 'long' as const, qty: 400, avgEntry: 100, stop: 95, markPrice: 99, equityAtEntry: 100_000, riskPct: 2, exitCostFrac: 0.0005, tickSize: 0.01 };

test('giữ nguyên khi lỗ-tại-SL + lỗ đã chốt (phí, funding đã trả) ≤ 2% vốn lúc vào; vượt thì không giữ', () => {
  const r = fundingGuard({ ...L, lockedLoss: 20 }); // 400×5 + 400×95×0,05% = 2 019, + phí vào 20 = 2 039 > 2 000
  assert.equal(r.action, 'tighten');
  const keep = fundingGuard({ ...L, stop: 95.1, lockedLoss: 0 }); // 400×4,9 + 19,02 = 1 979,02
  assert.equal(keep.action, 'keep');
  assert.ok(Math.abs(keep.lossAtStop - 1979.02) < 1e-6);
});

test('Long: funding đã trả đẩy lỗ-tại-SL quá 2% → siết SL (chỉ siết, làm tròn về phía an toàn) để tổng ≤ 2%', () => {
  const r = fundingGuard({ ...L, lockedLoss: 320 }); // còn 1 680: s ≥ (40 000 − 1 680) / (400 × 0,9995) = 95,84792…
  assert.equal(r.action, 'tighten');
  if (r.action !== 'tighten') return;
  assert.equal(r.stop, 95.85);
  assert.ok(r.lossAtStop <= 2000 + 1e-9 && r.lossAtStop > 1999, `tổng ${r.lossAtStop}`);
});

test('Long: SL phải siết tới/qua giá mark → đóng lệnh (không đặt được STOP)', () => {
  const r = fundingGuard({ ...L, lockedLoss: 320, markPrice: 95.8 });
  assert.equal(r.action, 'close');
  const gone = fundingGuard({ ...L, lockedLoss: 2100 });
  assert.equal(gone.action, 'close', 'đã lỗ quá ngân sách');
});

test('Short đối xứng: SL 105 → siết xuống, làm tròn xuống', () => {
  const S = { ...L, side: 'short' as const, stop: 105, markPrice: 101 };
  const r = fundingGuard({ ...S, lockedLoss: 320 }); // s ≤ (1 680 + 40 000) / (400 × 1,0005) = 104,1479…
  assert.equal(r.action, 'tighten');
  if (r.action === 'tighten') assert.equal(r.stop, 104.14);
  assert.equal(fundingGuard({ ...S, lockedLoss: 320, markPrice: 104.2 }).action, 'close');
});

test('không bao giờ nới SL; vị thế 0 → giữ nguyên', () => {
  const r = fundingGuard({ ...L, stop: 99, lockedLoss: 0 });
  assert.equal(r.action, 'keep');
  assert.equal(fundingGuard({ ...L, qty: 0, lockedLoss: 5000 }).action, 'keep');
});
