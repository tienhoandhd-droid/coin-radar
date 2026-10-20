import { COMMON } from './config.ts';

// Kiểm ràng buộc giữa các khóa cấu hình (rà soát Task 8, Quan trọng 3). Gọi lúc khởi động (máy quét, bot) và sau mỗi lần ghi đè
// (config-override.ts). Vi phạm → ném lỗi, không chạy.
//  - fundingBufferHorizon 'expected' (đệm funding ngắn hơn thời gian giữ tối đa) chỉ an toàn khi có chốt chặn funding khi chạy:
//    BẮT BUỘC fundingRuntimeGuard = true. (Bot còn phải tự nối chốt chặn B8b — kiểm riêng ở packages/bot/live.ts resolveRunMode.)
//  - target 'bot' (bot chạy thật/paper — packages/bot/live.ts resolveRunMode, gọi lúc khởi động; lỗi → từ chối chạy): thêm các hệ vào/thoát
//    lệnh CHỈ có trong bộ mô phỏng, bot chưa thực thi được (rà soát I3 20/10/2026) — bật thì bot sẽ giao dịch một hệ KHÁC hệ đã kiểm:
//    trend-d1 (dừng theo giá đóng 1D), mtf-pullback (#24), mtf-align / mtf-recovery / tf-* (#25–#29, kể cả lệnh hồi phục 100% TP1 ≤ 48 giờ).
export function configProblems(target: 'sim' | 'bot' = 'sim'): string[] {
  const r = COMMON.risk;
  const out: string[] = [];
  if (r.fundingBufferHorizon === 'expected' && !r.fundingRuntimeGuard) {
    out.push('COMMON.risk.fundingBufferHorizon = "expected" cần COMMON.risk.fundingRuntimeGuard = true (đệm funding ngắn chỉ an toàn khi có chốt chặn khi chạy)');
  }
  // trend-d1 giữ lệnh tới 180 ngày, đệm funding chỉ phủ thời gian giữ DỰ KIẾN → lỗ thật ≤ 2% chỉ giữ được nhờ chốt chặn funding khi chạy
  if (COMMON.trend.enabled && !r.fundingRuntimeGuard) {
    out.push('COMMON.trend.enabled = true cần COMMON.risk.fundingRuntimeGuard = true (giữ lệnh lâu, lỗ thật ≤ 2% nhờ chốt chặn funding)');
  }
  if (target === 'bot') {
    const sim = 'chỉ có trong bộ mô phỏng, bot chưa thực thi được — tắt trước khi chạy bot';
    if (COMMON.trend.enabled) out.push(`COMMON.trend.enabled (trend-d1: dừng theo giá đóng 1D, thay lệnh vùng) ${sim}`);
    if (COMMON.entryRules.mtfPullback !== null) out.push(`COMMON.entryRules.mtfPullback (#24 mtf-pullback, thay lệnh vùng) ${sim}`);
    const a = COMMON.entryRules.mtfAlign;
    if (a !== null) {
      out.push(`COMMON.entryRules.mtfAlign (#25–#29 mtf-align / tf-*: điểm vào nến 15m, thay lệnh vùng${a.recovery ? '; lệnh hồi phục chốt 100% TP1, giữ ≤ ' + a.recoveryMaxHoldHours + ' giờ' : ''}) ${sim}`);
    }
  }
  return out;
}

export function validateConfig(): void {
  const p = configProblems();
  if (p.length > 0) throw new Error(`Cấu hình không hợp lệ: ${p.join('; ')}`);
}
