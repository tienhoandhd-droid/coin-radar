import { COMMON } from '../core/config.ts';
import { tickDecimals } from '../core/price.ts';
import { liquidationPrice, mmrFor } from '../core/plan.ts';
import type { Side } from '../core/types.ts';

// Mô hình khớp / phí / trượt giá / funding / trailing DÙNG CHUNG cho bộ mô phỏng backtest (backtest/simulate.ts, kế hoạch 2 Task 3 —
// sổ sách đã kiểm tay tới 9 chữ số) và sàn giả lập của bot (packages/bot/paper.ts, B7). Mọi CÔNG THỨC chỉ nằm ở đây; hai nơi kia chỉ
// quyết định THỨ TỰ sự kiện. Ý nghĩa mô hình: xem đầu backtest/simulate.ts (mục 2, 3, 6, 7).
//
// Không gian x = dấu × giá (Long +p, Short −p) → luôn "lên là có lợi", một bộ công thức cho cả hai chiều; toX(d, ·) đổi cả hai chiều
// (giá thật → x và x → giá thật).

export type FillCost = {
  tierPct: number; // COMMON.costRoundTripPct[nhóm] — khứ hồi; mỗi lần khớp trả một nửa
  impactPct: number; // COMMON.slippage.pctPerParticipation — biên trượt (%) khi notional = KL 1 phút
  vol1m: number; // KL giao dịch 1 phút (USDT); Infinity = bỏ trượt theo cỡ
};

export const roundPx = (x: number) => Number(x.toPrecision(12));
export const toX = (d: number, p: number) => d * p;

// ---- Khối lượng ----
export const qRound = (qStep: number, q: number) => Number(q.toFixed(tickDecimals(qStep)));
export const floorQ = (qStep: number, q: number) => (q > 0 && Number.isFinite(q) ? qRound(qStep, Math.floor(q / qStep + 1e-9) * qStep) : 0);
export const reduceQty = (posQty: number, qty: number, qStep: number) => qRound(qStep, posQty - qty);

// Gộp một lần khớp vào vị thế: giá vào TB theo khối lượng (không gian x)
export function addToPosition(posQty: number, avgX: number, qty: number, priceX: number, qStep: number): { posQty: number; avgX: number } {
  const n = qRound(qStep, posQty + qty);
  return { avgX: (avgX * posQty + priceX * qty) / n, posQty: n };
}

// ---- Trượt giá & phí ----
// Trượt TB một chiều (phần giá) cho notional N khớp kiểu market: nửa biên tuyến tính
export const avgImpact = (c: FillCost, notional: number) => (Number.isFinite(c.vol1m) ? ((c.impactPct / 100) * notional) / c.vol1m / 2 : 0);

// Phí lần khớp VÀO. restingLimit = lệnh LIMIT chờ khớp (không phải IOC/market): chỉ khác khi bật COMMON.fees.makerTakerSplit (phí maker)
export const entryFee = (qty: number, px: number, c: FillCost, restingLimit: boolean) =>
  (restingLimit && COMMON.fees.makerTakerSplit ? (qty * px * COMMON.fees.makerPct) / 100 : (qty * px * c.tierPct) / 200);

// Phí lần khớp RA (mọi lệnh thoát khớp kiểu market)
export const exitFee = (qty: number, px: number, c: FillCost) => (qty * px * c.tierPct) / 200;

// Giá khớp (x) khi đóng qty ở mức levelX bằng lệnh kiểu market: trừ trượt theo cỡ (impact=false: giá phá sản khi thanh lý gap)
export function exitExecX(d: number, levelX: number, qty: number, c: FillCost, impact = true): number {
  const px0 = toX(d, levelX);
  return roundPx(levelX - (impact ? Math.abs(px0) * avgImpact(c, qty * px0) : 0));
}
export const exitPnl = (xExec: number, avgX: number, qty: number) => (xExec - avgX) * qty;

// Lệnh vào kiểu taker (LIMIT IOC giá trần, hoặc MARKET với limitX = +∞) tại giá điểm oX: chỉ khớp phần có biên trượt ≤ giá trần
// (phần còn lại hủy); giá điểm đã vượt trần → 0. x = giá khớp TB (giá điểm + trượt theo cỡ của phần khớp).
export function takerEntryFill(oX: number, limitX: number, wantQty: number, c: FillCost, qStep: number): { qty: number; x: number } {
  const px0 = Math.abs(oX);
  const slack = (limitX - oX) / px0; // khoảng còn lại tới giá trần (phần giá)
  let q = 0;
  if (slack >= 0) {
    const maxN = Number.isFinite(c.vol1m) ? (slack / (c.impactPct / 100)) * c.vol1m : Infinity;
    q = maxN === Infinity ? wantQty : Math.min(wantQty, floorQ(qStep, maxN / px0));
  }
  return { qty: q, x: q > 0 ? roundPx(oX + px0 * avgImpact(c, q * px0)) : NaN };
}

// ---- Thanh lý (isolated, ước tính — packages/core/plan.ts) ----
export function liquidationX(d: number, side: Side, avgX: number, posQty: number, leverage: number): number {
  const avg = toX(d, avgX);
  return toX(d, liquidationPrice(avg, leverage, side, mmrFor(posQty * avg).mmr));
}
// Giá phá sản = giá vào TB × (1 ∓ 1/đòn bẩy): gap qua giá thanh lý → mất đúng ký quỹ
export const bankruptX = (d: number, avgX: number, leverage: number) => toX(d, toX(d, avgX) * (1 - d / leverage));

// ---- Trailing (TRAILING_STOP_MARKET) ----
// Mức dừng = đỉnh sau kích hoạt × (1 − callback) Long; đáy × (1 + callback) Short (peakX ở không gian x)
export const trailStopX = (d: number, peakX: number, cbPct: number) => roundPx(d > 0 ? peakX * (1 - cbPct / 100) : peakX * (1 + cbPct / 100));
// Lúc kích hoạt: đỉnh = max(giá kích hoạt sự kiện, activatePrice)
export const trailActivatedPeakX = (priceX: number, actX: number) => Math.max(priceX, actX);

// ---- Funding ----
// Giờ chốt làm tròn xuống phút (sàn ghi lệch vài ms); mỗi kỳ: −dấu × KL × markPrice × rate (Long trả khi rate > 0)
export const fundingTimeFloor = (t: number) => Math.floor(t / 60_000) * 60_000;
export const fundingMark = (markPrice: number, avgReal: number) => (markPrice > 0 ? markPrice : avgReal);
export const fundingAmount = (d: number, qty: number, mark: number, rate: number) => -d * qty * mark * rate;
