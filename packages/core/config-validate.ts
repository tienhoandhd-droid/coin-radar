import { COMMON } from './config.ts';

// Kiểm ràng buộc giữa các khóa cấu hình (rà soát Task 8, Quan trọng 3). Gọi lúc khởi động (máy quét, bot) và sau mỗi lần ghi đè
// (config-override.ts). Vi phạm → ném lỗi, không chạy.
//  - fundingBufferHorizon 'expected' (đệm funding ngắn hơn thời gian giữ tối đa) chỉ an toàn khi có chốt chặn funding khi chạy:
//    BẮT BUỘC fundingRuntimeGuard = true. (Bot còn phải tự nối chốt chặn B8b — kiểm riêng ở packages/bot/live.ts resolveRunMode.)
export function configProblems(): string[] {
  const r = COMMON.risk;
  const out: string[] = [];
  if (r.fundingBufferHorizon === 'expected' && !r.fundingRuntimeGuard) {
    out.push('COMMON.risk.fundingBufferHorizon = "expected" cần COMMON.risk.fundingRuntimeGuard = true (đệm funding ngắn chỉ an toàn khi có chốt chặn khi chạy)');
  }
  return out;
}

export function validateConfig(): void {
  const p = configProblems();
  if (p.length > 0) throw new Error(`Cấu hình không hợp lệ: ${p.join('; ')}`);
}
