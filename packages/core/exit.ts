import { COMMON } from './config.ts';
import type { Side } from './types.ts';

// Chính sách thoát lệnh — id khớp các biến thể của ma trận đối chứng (kế hoạch 2, Task 4):
//   A0 = TP1/TP2/TP3 cố định 50/30/20, sau TP1 dời SL về giá vào (luật cũ)
//   C2 = TP1 chốt 50%, 50% còn lại là trailing stop trên sàn kích hoạt tại TP1 (người dùng chốt 19/10/2026)
//   C3 = (Task 8 #6, chỉ mô phỏng) TP1 chốt COMMON.exitC3.tp1Pct%, phần còn lại dừng theo giá ĐÓNG nến 4H:
//        max(hòa vốn + phí, đỉnh đóng 4H từ TP1 − m×ATR(14) 4H). Bot chưa làm được: cần đặt lại STOP_MARKET reduce-only mỗi nến 4H.
export type ExitPolicy = 'A0' | 'C2' | 'C3';

// Thông số lệnh TRAILING_STOP_MARKET (qua /fapi/v1/algoOrder) mà bot sẽ đặt cho phần còn lại sau TP1.
export type TrailingPlan = {
  activationPrice: number; // = TP1
  callbackPct: number; // callbackRate gửi sàn, đã kẹp trong [min, max] và làm tròn XUỐNG 0,01 (floorPct)
  atrCallbackPct: number; // khoảng lùi theo ATR (config trailAtrMult × ATR) tính bằng % của TP1
  noLossCallbackPct: number; // khoảng lùi lớn nhất để mức dừng lúc kích hoạt vẫn ≥ giá vào + phí (có thể ≤ 0 nếu TP1 chưa bù phí)
  stopAtActivation: number; // mức dừng ngay lúc kích hoạt = TP1 × (1 ∓ callbackPct/100)
  clampedTo: 'min' | 'max' | null;
  needsBreakevenFloor: boolean; // true: mức bảo đảm không lỗ < mức tối thiểu của sàn → phải giữ thêm lệnh dừng hòa vốn
};

// Làm tròn XUỐNG 0,01% — dùng chung cho in kế hoạch và bot. Làm tròn gần nhất có thể đi lên và làm mức dừng thấp hơn giá vào + phí.
export function floorPct(x: number): number {
  return Math.floor(x * 100) / 100;
}

// entry = giá khớp XẤU NHẤT cho phép (Long: cao nhất; Short: thấp nhất; limit: giá limit) để bảo đảm không lỗ đúng ở mọi giá khớp được in.
// trailAtr = khoảng cách ATR theo giá (trailAtrMult × ATR khung vào lệnh); costPct = phí + trượt giá khứ hồi (% giá vào)
export function trailingFor(side: Side, entry: number, tp1: number, trailAtr: number, costPct: number): TrailingPlan {
  const dir = side === 'long' ? 1 : -1;
  if (!(trailAtr > 0) || !Number.isFinite(trailAtr)) throw new Error(`trailing: khoảng cách ATR không hợp lệ (${trailAtr})`);
  if (!(dir * (tp1 - entry) > 0)) throw new Error(`trailing: TP1 ${tp1} phải nằm phía lời của giá vào ${entry}`);
  const breakeven = entry + dir * ((entry * costPct) / 100); // giá hòa vốn sau phí khứ hồi
  const atrCallbackPct = (trailAtr / tp1) * 100;
  const noLossCallbackPct = ((dir * (tp1 - breakeven)) / tp1) * 100;
  const { binanceTrailCallbackMinPct: min, binanceTrailMaxCallbackPct: max } = COMMON;
  const needsBreakevenFloor = noLossCallbackPct < min;
  const raw = Math.min(atrCallbackPct, noLossCallbackPct);
  const callbackPct = floorPct(Math.min(max, Math.max(min, raw)));
  const clampedTo = callbackPct === min && raw < min ? 'min' : callbackPct === max && raw > max ? 'max' : null;
  return {
    activationPrice: tp1, callbackPct, atrCallbackPct, noLossCallbackPct,
    stopAtActivation: tp1 * (1 - (dir * callbackPct) / 100),
    clampedTo, needsBreakevenFloor,
  };
}

// Phần thoát lệnh đi kèm kế hoạch. A0: chỉ TP cố định (trailing = null, trailQty = 0 — phần chưa có giá TP vẫn theo trailStop cũ của kế hoạch).
// C2: TP1 chốt tp1Qty, phần còn lại (trailQty) là trailing trên sàn; trailing = null khi không có TP1 (cả vị thế theo trailing ATR, như cũ).
export type ExitPlan = { policy: ExitPolicy; tp1Qty: number; trailQty: number; trailing: TrailingPlan | null };

export function buildExit(a: { policy: ExitPolicy; side: Side; worstEntry: number; valid: boolean; tp1: number | null; trailAtr: number; costPct: number; qty: number; tp1Qty: number }): ExitPlan {
  if (a.policy === 'A0') return { policy: 'A0', tp1Qty: a.tp1Qty, trailQty: 0, trailing: null };
  if (a.tp1 === null) return { policy: 'C2', tp1Qty: 0, trailQty: a.qty, trailing: null };
  // kế hoạch không hợp lệ thì không có lệnh nào được đặt: không tính trailing (TP1 có thể nằm sai phía giá khớp xấu nhất)
  if (!a.valid) return { policy: 'C2', tp1Qty: a.tp1Qty, trailQty: Math.round((a.qty - a.tp1Qty) * 1e8) / 1e8, trailing: null };
  const trailQty = Math.round((a.qty - a.tp1Qty) * 1e8) / 1e8;
  return { policy: 'C2', tp1Qty: a.tp1Qty, trailQty, trailing: trailingFor(a.side, a.worstEntry, a.tp1, a.trailAtr, a.costPct) };
}
