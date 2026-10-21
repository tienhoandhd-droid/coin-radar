import { snapToTick } from './price.ts';
import type { Side } from './types.ts';

// Chốt chặn funding khi chạy (F1 kế hoạch 2 Task 8 = nghĩa vụ B8b của bot, docs/superpowers/plans/2026-10-19-ke-hoach-bot.md).
// Ràng buộc cứng người dùng: lỗ thật mỗi lệnh ≤ riskPct% vốn LÚC VÀO, kể cả funding. Định cỡ chỉ đệm funding cho một số kỳ; lệnh giữ lâu
// hơn / funding cao hơn mức đệm → mỗi kỳ funding gọi hàm này:
//   tổng lỗ nếu chạm SL bây giờ = lockedLoss + qty × |giá vào TB − SL| (phía bất lợi) + qty × SL × exitCostFrac
//   lockedLoss = phí đã trả + funding đã trả − lãi gộp đã chốt (TP1…) — số tiền đã mất chắc chắn của lệnh tới lúc này
// Tổng > ngân sách → SL mới (chỉ SIẾT, làm tròn theo tick về phía an toàn) để tổng ≤ ngân sách; SL mới phải còn ở phía bất lợi của giá
// mark (sàn từ chối STOP đã chạm) — không được thì ĐÓNG lệnh (reduce-only).
// HÀM THUẦN: không gửi lệnh. Bot: lockedLoss từ nhật ký (commission + FUNDING_FEE − realizedPnl), exitCostFrac = phí taker + trượt ước tính.
export type FundingGuardInput = {
  side: Side;
  qty: number; // khối lượng còn mở
  avgEntry: number; // giá vào trung bình
  stop: number; // SL hiện tại (mức dừng chung đang bảo vệ phần còn mở)
  markPrice: number;
  equityAtEntry: number; // vốn lúc vào lệnh (USDT)
  riskPct: number; // COMMON.risk.perTradePct
  lockedLoss: number; // USDT, dương = đã mất
  exitCostFrac: number; // phí + trượt chiều ra, tỉ lệ trên notional (vd 0,0005)
  tickSize: number;
};
export type FundingGuardResult =
  | { action: 'keep'; lossAtStop: number }
  | { action: 'tighten'; stop: number; lossAtStop: number }
  | { action: 'close'; reason: string };

export function lossAtStop(i: Pick<FundingGuardInput, 'side' | 'qty' | 'avgEntry' | 'lockedLoss' | 'exitCostFrac'>, stop: number): number {
  const d = i.side === 'long' ? 1 : -1;
  return i.lockedLoss + i.qty * d * (i.avgEntry - stop) + i.qty * stop * i.exitCostFrac;
}

export function fundingGuard(i: FundingGuardInput): FundingGuardResult {
  if (!(i.qty > 0)) return { action: 'keep', lossAtStop: i.lockedLoss };
  const budget = (i.equityAtEntry * i.riskPct) / 100;
  const now = lossAtStop(i, i.stop);
  if (now <= budget + 1e-9) return { action: 'keep', lossAtStop: now };
  const room = budget - i.lockedLoss; // phần còn được mất trên vị thế đang mở
  const long = i.side === 'long';
  // Long: q(e − s) + q·s·c ≤ room → s ≥ (q·e − room) / (q(1 − c)); Short: q(s − e) + q·s·c ≤ room → s ≤ (room + q·e) / (q(1 + c))
  const raw = long ? (i.qty * i.avgEntry - room) / (i.qty * (1 - i.exitCostFrac)) : (room + i.qty * i.avgEntry) / (i.qty * (1 + i.exitCostFrac));
  const stop = snapToTick(raw, i.tickSize, long ? 'up' : 'down');
  // room ≤ 0 (funding + phí đã trả ≥ ngân sách) KHÔNG tự nó buộc đóng: lệnh đang lãi thì SL qua phía có lợi của giá vào (vẫn dưới mark
  // với Long) giữ tổng lỗ ≤ ngân sách — như mô phỏng đã khóa (btc-regime-sim.ts GUARD=1). Trước đây đóng ngay → cắt lệnh thắng lớn
  // (phát hiện khi chạy bot trên dữ liệu cũ, backtest/bot-replay.ts). Chỉ đóng khi SL cần đã chạm/qua giá mark.
  if (!Number.isFinite(stop) || (long ? stop >= i.markPrice : stop <= i.markPrice)) {
    return { action: 'close', reason: `lỗ đã chốt ${i.lockedLoss.toFixed(2)} + lỗ tại SL vượt ${i.riskPct}% vốn lúc vào; SL cần ${raw} đã qua giá mark ${i.markPrice}` };
  }
  return { action: 'tighten', stop, lossAtStop: lossAtStop(i, stop) };
}
