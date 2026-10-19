import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canOpen, openRiskAmount, type OpenTrade, type NewTrade } from './portfolio.ts';
import { COMMON } from './config.ts';
import type { OrderFilters } from './filters.ts';

const F: OrderFilters = { stepSize: 0.001, minQty: 0.001, maxQty: 10_000, marketMinQty: 0.001, marketMaxQty: 10_000, marketStepSize: 0.001, minNotional: 50, maxNumOrders: 200 };
const CFG = { maxOpenTrades: 10, maxOpenRiskPct: 10, marginSafetyFactor: 0.8 };
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

// Vốn 10.000, rủi ro 2% = 200 USDT. Vào 100, SL 98, phí 0 → khối lượng 100 coin = 10.000 USDT notional, ký quỹ ở 5× = 2.000
const trade = (over: Partial<NewTrade> = {}): NewTrade => ({ symbol: 'AAAUSDT', side: 'long', entry: 100, stop: 98, qty: 100, leverage: 5, costPct: 0,
  entryType: 'market', filters: F, maxNotional: Infinity, ...over });
const open = (n: number, over: Partial<OpenTrade> = {}): OpenTrade[] => Array.from({ length: n }, (_, i) => ({
  symbol: `X${i}USDT`, side: 'long', notional: 1000, leverage: 5, riskAmount: 200, pastTp1: false, ...over }));

test('C1 config: trần 10 lệnh, tổng rủi ro mở ≤ 10%, hệ số an toàn ký quỹ trong (0; 1]', () => {
  assert.equal(COMMON.portfolio.maxOpenTrades, 10);
  assert.equal(COMMON.portfolio.maxOpenRiskPct, 10);
  assert.ok(COMMON.portfolio.marginSafetyFactor > 0 && COMMON.portfolio.marginSafetyFactor <= 1);
});

test('C3 danh mục trống, đủ ký quỹ → cho vào nguyên khối lượng, rủi ro thực 2%', () => {
  const r = canOpen(trade(), [], 10_000, CFG);
  assert.equal(r.allowed, true);
  assert.equal(r.adjustedQty, 100);
  assert.equal(r6(r.riskPctActual), 2);
  assert.equal(r6(r.marginNeeded), 2000);
  assert.deepEqual(r.reasons, []);
});

test('C1 đủ 10 lệnh CÒN RỦI RO → không cho vào', () => {
  const r = canOpen(trade(), open(10, { riskAmount: 50 }), 1_000_000, CFG);
  assert.equal(r.allowed, false);
  assert.match(r.reasons.join(), /10 lệnh còn rủi ro/);
});

test('C1 người dùng 19/10/2026: lệnh đã qua TP1 (kèo không rủi ro) KHÔNG tính vào trần 10 lệnh', () => {
  const past = (n: number) => open(n, { pastTp1: true, riskAmount: 0 }).map((t, j) => ({ ...t, symbol: `P${j}USDT` }));
  // 10 còn rủi ro + 3 đã qua TP1 → vẫn từ chối (trần tính trên 10 lệnh còn rủi ro)
  const r1 = canOpen(trade(), [...open(10, { riskAmount: 50 }), ...past(3)], 1_000_000, CFG);
  assert.equal(r1.allowed, false);
  assert.equal(r1.atRiskCount, 10);
  assert.equal(r1.pastTp1Count, 3);
  assert.equal(r1.openCount, 13);
  // 9 còn rủi ro + 5 đã qua TP1 → cho vào (ký quỹ và tổng rủi ro 10% còn chỗ)
  const r2 = canOpen(trade(), [...open(9, { riskAmount: 50 }), ...past(5)], 1_000_000, CFG);
  assert.equal(r2.allowed, true);
  assert.equal(r2.adjustedQty, 100);
  assert.equal(r2.atRiskCount, 9);
  assert.equal(r2.pastTp1Count, 5);
  // 0 còn rủi ro + 12 đã qua TP1 → cho vào
  assert.equal(canOpen(trade(), past(12), 1_000_000, CFG).allowed, true);
  // lệnh đã qua TP1 VẪN tính ký quỹ: 12 lệnh × 40.000/5 = 96.000 ký quỹ > 100.000 × 0,8 → bỏ vì ký quỹ
  const m = canOpen(trade(), past(12).map((t) => ({ ...t, notional: 40_000 })), 100_000, CFG);
  assert.equal(m.allowed, false);
  assert.match(m.reasons.join(), /ký quỹ/);
});

test('C1 lệnh đã qua TP1 tính rủi ro 0; tổng rủi ro mở chạm 10% → giảm khối lượng phần còn lại, hết chỗ → bỏ', () => {
  assert.equal(openRiskAmount(open(3, { pastTp1: true })), 0);
  assert.equal(openRiskAmount(open(3)), 600);
  // đang mở 4 lệnh × 2% = 8% → còn 2% → vào đủ
  assert.equal(canOpen(trade(), open(4), 10_000, CFG).adjustedQty, 100);
  // đang mở 9% → còn 1% = 100 USDT → 50 coin, rủi ro thực 1% (< 2%) và nói rõ
  const half = canOpen(trade(), open(1, { riskAmount: 900 }), 10_000, CFG);
  assert.equal(half.allowed, true);
  assert.equal(half.adjustedQty, 50);
  assert.equal(r6(half.riskPctActual), 1);
  assert.match(half.reasons.join(), /tổng rủi ro mở/);
  // đang mở 10% → không còn chỗ
  const none = canOpen(trade(), open(5), 10_000, CFG);
  assert.equal(none.allowed, false);
  assert.match(none.reasons.join(), /tổng rủi ro mở/);
  // 5 lệnh đã qua TP1 → không tính rủi ro → vào đủ
  assert.equal(canOpen(trade(), open(5, { pastTp1: true }), 10_000, CFG).adjustedQty, 100);
});

test('C3 SL chặt 0,5%: 2% rủi ro cần notional 4 × vốn, ký quỹ ở 5× = 80% vốn → vượt phần ký quỹ còn trống thì giảm khối lượng', () => {
  // vào 100, SL 99,5 → 400 coin = 40.000 USDT, ký quỹ 8.000; trần ký quỹ 10.000 × 0,8 = 8.000, đã dùng 1.000 → còn 7.000 → 350 coin
  const r = canOpen(trade({ stop: 99.5, qty: 400 }), open(1, { notional: 5000, leverage: 5, riskAmount: 0, pastTp1: true }), 10_000, CFG);
  assert.equal(r.allowed, true);
  assert.equal(r.adjustedQty, 350);
  assert.equal(r6(r.riskPctActual), 1.75);
  assert.match(r.reasons.join(), /ký quỹ/);
  // ký quỹ đã dùng hết → bỏ
  const full = canOpen(trade(), open(1, { notional: 40_000, leverage: 5, riskAmount: 0, pastTp1: true }), 10_000, CFG);
  assert.equal(full.allowed, false);
  assert.match(full.reasons.join(), /ký quỹ/);
});

test('I7 trần thanh khoản: notional bị giới hạn theo maxNotional (tỉ lệ khối lượng 1 phút)', () => {
  const r = canOpen(trade({ maxNotional: 2_500 }), [], 10_000, CFG);
  assert.equal(r.adjustedQty, 25);
  assert.match(r.reasons.join(), /thanh khoản/);
});

test('C3 + I2 khối lượng sau khi giảm phải còn qua bộ lọc sàn (MIN_NOTIONAL) — không thì bỏ lệnh', () => {
  const r = canOpen(trade({ maxNotional: 45 }), [], 10_000, CFG);
  assert.equal(r.allowed, false);
  assert.match(r.reasons.join(), /MIN_NOTIONAL/);
});

test('C3 cùng hợp đồng đang có vị thế mở → không mở thêm (one-way, một tín hiệu mỗi hợp đồng)', () => {
  const r = canOpen(trade(), open(1, { symbol: 'AAAUSDT' }), 10_000, CFG);
  assert.equal(r.allowed, false);
  assert.match(r.reasons.join(), /AAAUSDT/);
});

test('C3 tham số sai → ném lỗi (vốn ≤ 0, đòn bẩy < 1, SL = giá vào)', () => {
  assert.throws(() => canOpen(trade(), [], 0, CFG), /vốn/);
  assert.throws(() => canOpen(trade({ leverage: 0 }), [], 10_000, CFG), /đòn bẩy/);
  assert.throws(() => canOpen(trade({ stop: 100 }), [], 10_000, CFG), /cắt lỗ/);
});

test('C1 (theo dõi sau rà soát): đếm số lệnh đang mở CÙNG CHIỀU với lệnh mới', () => {
  const mixed = [...open(3), ...open(2, { side: 'short' }).map((t, j) => ({ ...t, symbol: `S${j}USDT` }))];
  assert.equal(canOpen(trade(), mixed, 100_000, CFG).sameSideOpen, 3);
  assert.equal(canOpen(trade({ side: 'short' }), mixed, 100_000, CFG).sameSideOpen, 2);
  assert.equal(canOpen(trade(), open(10, { riskAmount: 50 }), 1_000_000, CFG).sameSideOpen, 10); // kể cả khi bị từ chối
});
