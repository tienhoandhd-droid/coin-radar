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
    // Chế độ bot: 'swing' | 'fast' (quét) | 'btc-regime' (hệ giữ BTC theo chế độ, luật đã khóa — packages/core/btc-regime.ts)
    const known: readonly string[] = ['swing', 'fast', 'btc-regime'];
    const modes: readonly string[] = COMMON.bot.modes;
    if (modes.length === 0) out.push('COMMON.bot.modes rỗng — bot không có chế độ nào để chạy');
    for (const m of modes) if (!known.includes(m)) out.push(`COMMON.bot.modes có chế độ "${m}" không biết (${known.join(' | ')})`);
    if (new Set(modes).size !== modes.length) out.push(`COMMON.bot.modes lặp chế độ: ${modes.join(', ')}`);
    if (modes.includes('btc-regime')) {
      const b = COMMON.btcRegime;
      if (b.symbol !== 'BTCUSDT') out.push(`COMMON.btcRegime.symbol = ${b.symbol} — luật đã khóa chỉ cho BTCUSDT`);
      for (const [k, v] of Object.entries({ smaDays: b.smaDays, atrDays: b.atrDays, klinesLimit: b.klinesLimit })) {
        if (!Number.isInteger(v) || v < 1) out.push(`COMMON.btcRegime.${k} = ${v} phải là số nguyên ≥ 1`);
      }
      if (b.klinesLimit < Math.max(b.smaDays, b.atrDays + 1) + 1 || b.klinesLimit > 1500) out.push(`COMMON.btcRegime.klinesLimit = ${b.klinesLimit} phải đủ cho SMA${b.smaDays}/ATR${b.atrDays} và ≤ 1500`);
      if (!(b.slAtr > 0)) out.push(`COMMON.btcRegime.slAtr = ${b.slAtr} phải > 0`);
      if (!(b.maxNotionalX > 0 && b.maxNotionalX <= 1)) out.push(`COMMON.btcRegime.maxNotionalX = ${b.maxNotionalX} phải trong (0; 1] (luật: không đòn bẩy > 1×)`);
      for (const [k, v] of Object.entries({ sideCostPct: b.sideCostPct, slippagePct: b.slippagePct, entryCapPct: b.entryCapPct })) {
        if (!(v >= 0) || !Number.isFinite(v)) out.push(`COMMON.btcRegime.${k} = ${v} phải ≥ 0`);
      }
    }
    const sim ='chỉ có trong bộ mô phỏng, bot chưa thực thi được — tắt trước khi chạy bot';
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
