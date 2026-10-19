import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMON } from './config.ts';
import { trailingFor } from './exit.ts';
import { RULES } from './rules.ts';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('quyết định người dùng 19/10/2026 nằm trong config', () => {
  assert.equal(COMMON.risk.perTradePct, 2);
  assert.equal(COMMON.portfolio.maxOpenTrades, 10);
  assert.equal(COMMON.exit.defaultPolicy, 'C2');
  assert.equal(COMMON.exit.tp1Pct, 50);
  assert.equal(COMMON.binanceTrailCallbackMinPct, 0.1);
  assert.equal(COMMON.binanceTrailMaxCallbackPct, 10);
});

test('P-05/P-06 mô tả trần 10 lệnh, không còn 3 lệnh/6%/5 altcoin', () => {
  const p5 = RULES.find((r) => r.code === 'P-05')!;
  const p6 = RULES.find((r) => r.code === 'P-06')!;
  assert.match(p5.title, /10 lệnh/);
  assert.match(p6.title, /10 lệnh/);
  assert.doesNotMatch(p5.title + p6.title, /3%|5 lệnh|3 cùng chiều/);
});

// Long: vào 100, TP1 110, phí khứ hồi 0,25% = 0,25/đơn vị → hòa vốn 100,25. ATR-khoảng 2 → 2/110 = 1,81818...%
// callback bảo đảm không lỗ = (110 − 100,25)/110 = 8,8636...% → lấy min = 1,81818...%; mức dừng lúc kích hoạt = 110 × (1 − 0,0181818) = 108
test('C2 Long: callback theo ATR khi nhỏ hơn mức bảo đảm không lỗ', () => {
  const t = trailingFor('long', 100, 110, 2, 0.25);
  near(t.activationPrice, 110);
  near(t.atrCallbackPct, (2 / 110) * 100);
  near(t.noLossCallbackPct, (9.75 / 110) * 100);
  near(t.callbackPct, (2 / 110) * 100);
  near(t.stopAtActivation, 108);
  assert.equal(t.clampedTo, null);
  assert.equal(t.needsBreakevenFloor, false);
});

// Mức bảo đảm bó hơn ATR: vào 100, TP1 101, ATR-khoảng 3 → ATR% = 2,970%; bảo đảm = 0,75/101 = 0,7426% → callback = 0,7426%, dừng = 101×(1−0,007426) = 100,25 (đúng hòa vốn)
test('C2 Long: callback bị chặn bởi mức bảo đảm không lỗ, mức dừng = giá vào + phí', () => {
  const t = trailingFor('long', 100, 101, 3, 0.25);
  near(t.callbackPct, (0.75 / 101) * 100);
  near(t.stopAtActivation, 100.25);
});

// Vào 100, TP1 150: bảo đảm = 49,75/150 = 33,17%; ATR-khoảng 20 → 13,33% → vượt trần sàn → 10%; dừng = 150 × 0,9 = 135
test('C2 Long: callback > 10% bị kẹp về 10%', () => {
  const t = trailingFor('long', 100, 150, 20, 0.25);
  near(t.callbackPct, 10);
  assert.equal(t.clampedTo, 'max');
  near(t.stopAtActivation, 135);
  assert.equal(t.needsBreakevenFloor, false);
});

// Vào 100, TP1 100,3: bảo đảm = (100,3 − 100,25)/100,3 = 0,0499% < 0,1% → cờ lưới hòa vốn, callback đặt 0,1%
test('C2 Long: bảo đảm không lỗ < 0,1% → needsBreakevenFloor', () => {
  const t = trailingFor('long', 100, 100.3, 2, 0.25);
  assert.equal(t.needsBreakevenFloor, true);
  near(t.callbackPct, 0.1);
  assert.equal(t.clampedTo, 'min');
  near(t.noLossCallbackPct, (0.05 / 100.3) * 100);
});

// Short đối xứng: vào 100, TP1 90, hòa vốn = 100 − 0,25 = 99,75. ATR% = 2/90 = 2,2222%; bảo đảm = 9,75/90 = 10,8333% → callback 2,2222%; dừng = 90 × 1,022222 = 92
test('C2 Short: đối xứng với Long', () => {
  const t = trailingFor('short', 100, 90, 2, 0.25);
  near(t.callbackPct, (2 / 90) * 100);
  near(t.noLossCallbackPct, (9.75 / 90) * 100);
  near(t.stopAtActivation, 92);
  assert.equal(t.needsBreakevenFloor, false);
});

test('C2 Short: kẹp 10% và cờ lưới hòa vốn', () => {
  const c = trailingFor('short', 100, 60, 10, 0.25);
  near(c.callbackPct, 10);
  assert.equal(c.clampedTo, 'max');
  near(c.stopAtActivation, 66);
  // vào 100, TP1 99,7, hòa vốn 99,75 → (99,75 − 99,7)/99,7 = 0,0501% < 0,1%
  const f = trailingFor('short', 100, 99.7, 2, 0.25);
  assert.equal(f.needsBreakevenFloor, true);
  near(f.callbackPct, 0.1);
});

test('đầu vào không hợp lệ thì ném lỗi, không đoán', () => {
  assert.throws(() => trailingFor('long', 100, 110, 0, 0.25), /trailing/);
  assert.throws(() => trailingFor('long', 100, 99, 2, 0.25), /TP1/);
  assert.throws(() => trailingFor('short', 100, 101, 2, 0.25), /TP1/);
});
