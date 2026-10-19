import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  roundPx, toX, qRound, floorQ, avgImpact, entryFee, exitFee, exitExecX, exitPnl, takerEntryFill, addToPosition, reduceQty,
  liquidationX, bankruptX, trailStopX, trailActivatedPeakX, fundingTimeFloor, fundingAmount, fundingMark, type FillCost,
} from './fill-model.ts';

// Mô hình khớp DÙNG CHUNG cho backtest/simulate.ts và packages/bot/paper.ts. Số tính tay; không gian x = dấu × giá (Long +p, Short −p).
const NO_IMPACT: FillCost = { tierPct: 0.1, impactPct: 0.5, vol1m: Infinity };
const IMPACT: FillCost = { tierPct: 0.1, impactPct: 0.5, vol1m: 10_000 }; // 10 000 USDT/phút

test('làm tròn: giá 12 chữ số có nghĩa, khối lượng theo bước, sàn khối lượng chịu nhiễu số thực', () => {
  assert.equal(roundPx(0.1 + 0.2), 0.3);
  assert.equal(toX(-1, 100), -100);
  assert.equal(qRound(0.001, 0.1 + 0.2), 0.3);
  assert.equal(floorQ(0.001, 0.3), 0.3); // 0,3 / 0,001 = 299,99999999999994 → +1e-9 chống nhiễu
  assert.equal(floorQ(0.001, 0.2994), 0.299);
  assert.equal(floorQ(0.001, -1), 0);
  assert.equal(floorQ(0.001, Infinity), 0);
});

test('trượt theo cỡ: nửa biên tuyến tính; vol1m vô hạn = 0', () => {
  assert.equal(avgImpact(NO_IMPACT, 1e9), 0);
  // N = 1 000 USDT, biên = 0,5% × 1 000 / 10 000 = 0,05% → TB 0,025% = 0,00025
  assert.ok(Math.abs(avgImpact(IMPACT, 1_000) - 0.00025) < 1e-15);
});

test('phí: mỗi lần khớp nửa phí nhóm; limit chờ chỉ khác khi bật tách maker/taker (mặc định tắt)', () => {
  assert.equal(entryFee(400, 100, NO_IMPACT, false), 20); // 40 000 × 0,05%
  assert.equal(entryFee(400, 100, NO_IMPACT, true), 20); // makerTakerSplit = false trong config
  assert.equal(exitFee(400, 125, NO_IMPACT), 25);
});

test('thoát kiểu market: giá khớp xấu đi theo trượt cỡ, cả Long lẫn Short; PnL trong không gian x', () => {
  // Long thoát 10 coin ở 100: notional 1 000 → trượt 0,025% → 99,975
  const xl = exitExecX(1, 100, 10, IMPACT);
  assert.equal(xl, 99.975);
  // Short thoát (mua lại) 10 coin ở 100: x = −100 → −100,025 → giá thật 100,025 (xấu hơn cho Short)
  const xs = exitExecX(-1, -100, 10, IMPACT);
  assert.equal(xs, -100.025);
  assert.equal(exitExecX(1, 100, 10, IMPACT, false), 100); // thanh lý ở giá phá sản: không trượt
  assert.equal(exitPnl(-90, -100, 2), 20); // Short vào 100, ra 90: +20
});

test('vào kiểu taker (IOC/market): khớp ở giá điểm + trượt, chỉ phần có biên trượt ≤ giá trần', () => {
  assert.deepEqual(takerEntryFill(100, 101, 5, NO_IMPACT, 0.001), { qty: 5, x: 100 });
  // Giá điểm đã vượt trần → không khớp
  assert.equal(takerEntryFill(102, 101, 5, NO_IMPACT, 0.001).qty, 0);
  // Có trượt: slack 0,2% → notional tối đa = 0,2/0,5 × 10 000 = 4 000 USDT → 40 coin; muốn 50 → khớp 40
  const f = takerEntryFill(100, 100.2, 50, IMPACT, 0.001);
  assert.equal(f.qty, 40);
  assert.equal(f.x, roundPx(100 + 100 * avgImpact(IMPACT, 4_000)));
  // Lệnh MARKET (không trần): limitX = +∞ → khớp đủ
  assert.equal(takerEntryFill(100, Infinity, 50, IMPACT, 0.001).qty, 50);
});

test('giá vào TB, giảm khối lượng theo bước', () => {
  assert.deepEqual(addToPosition(0, 0, 3, 100, 0.001), { posQty: 3, avgX: 100 });
  assert.deepEqual(addToPosition(3, 100, 1, 104, 0.001), { posQty: 4, avgX: 101 });
  assert.equal(reduceQty(0.3, 0.1, 0.001), 0.2);
});

test('thanh lý isolated ước tính (cùng hàm plan.ts) và giá phá sản, Long/Short', () => {
  const l = liquidationX(1, 'long', 100, 10, 10);
  assert.ok(l > 90 && l < 100, String(l));
  const s = liquidationX(-1, 'short', -100, 10, 10);
  assert.ok(-s > 100 && -s < 110, String(s));
  assert.equal(bankruptX(1, 100, 10), 90);
  assert.ok(Math.abs(bankruptX(-1, -100, 10) + 110) < 1e-9);
});

test('trailing: mức dừng = đỉnh × (1 − cb) Long / đáy × (1 + cb) Short; kích hoạt lấy max(giá, mức kích hoạt)', () => {
  assert.equal(trailStopX(1, 130, 10), 117);
  assert.equal(trailStopX(-1, -70, 10), -77); // đáy 70 → dừng 77
  assert.equal(trailActivatedPeakX(125, 125), 125);
  assert.equal(trailActivatedPeakX(126, 125), 126);
});

test('funding: −dấu × KL × mark × rate (Long trả khi rate > 0); giờ chốt làm tròn xuống phút; mark thiếu → giá vào TB', () => {
  assert.equal(fundingAmount(1, 400, 100, 0.0001), -4);
  assert.equal(fundingAmount(-1, 400, 100, 0.0001), 4);
  assert.equal(fundingAmount(-1, 400, 100, -0.0001), -4);
  assert.equal(fundingTimeFloor(1_000_000_123), 999_960_000);
  assert.equal(fundingMark(0, 101), 101);
  assert.equal(fundingMark(99, 101), 99);
});
