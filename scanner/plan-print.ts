import { COMMON } from '../packages/core/config.ts';
import { formatTick } from '../packages/core/price.ts';
import type { TradePlan } from '../packages/core/plan.ts';

const num = (x: number, digits: number): string => x.toFixed(digits).replace('.', ',');
const qty = (x: number): string => num(x, 8).replace(/0+$/, '').replace(/,$/, '');
const dec = (x: number): string => String(x).replace('.', ',');

// Các dòng in ra cho một kế hoạch lệnh. Mọi giá in theo tickSize; khoảng cách trailing in kèm %.
export function planLines(head: { symbol: string; score: number; riskTier: string }, p: TradePlan, tickSize: number): string[] {
  const px = (x: number) => formatTick(x, tickSize);
  const long = p.side === 'long';
  const lines: string[] = [];
  lines.push(`${head.symbol} — ${long ? 'LONG' : 'SHORT'} | điểm ${dec(head.score)} | rủi ro ${head.riskTier}`);
  lines.push(p.entryType === 'market'
    ? `  Kiểu vào lệnh: VÀO TRỰC TIẾP — ${p.entryReason}`
    : `  Kiểu vào lệnh: ĐẶT LIMIT CHỜ HỒI về ${px(p.entry)}, hết hạn sau ${p.limitExpiryHours} giờ — ${p.entryReason}`);
  lines.push(`  Giá hiện tại: ${px(p.marketPrice)} | Vùng giá vào: ${px(p.entryZone.low)}–${px(p.entryZone.high)} | Giá vào dùng để tính: ${px(p.entry)}`);
  lines.push(`  SL: ${px(p.stop)} — ${p.stopReason}`);

  const trailPct = (p.trailAtr / p.entry) * 100;
  const trail = `trailing stop: cách giá ${long ? 'cao' : 'thấp'} nhất 3×ATR = ${px(p.trailAtr)} (${num(trailPct, 1)}%)`;
  const hasTp1 = p.targets[0]?.price !== null;
  if (!hasTp1) {
    lines.push(`  Không có vùng ${long ? 'cản phía trên' : 'đỡ phía dưới'} → không có TP cố định; toàn bộ vị thế theo ${trail}`);
  } else {
    for (const t of p.targets) {
      lines.push(t.price === null
        ? `  ${t.name}: chốt ${t.pct}% = ${qty(t.qty)} coin — ${trail} — ${t.reason}`
        : `  ${t.name}: ${px(t.price)} chốt ${t.pct}% = ${qty(t.qty)} coin | ${num(t.r!, 2)}R — ${t.reason}`);
    }
    lines.push(`  Đạt TP1 → dời SL về giá vào ${px(p.afterTp1Stop)} (giữ nguyên sau TP2)`);
  }
  if (trailPct > COMMON.binanceTrailMaxCallbackPct) {
    lines.push(`  LƯU Ý: lệnh trailing stop của Binance chỉ nhận callbackRate tối đa ${COMMON.binanceTrailMaxCallbackPct}% (khoảng cách này là ${num(trailPct, 1)}%) → không đặt được nguyên văn, hãy tự dời SL thủ công theo ${px(p.trailAtr)} ${long ? 'dưới giá cao' : 'trên giá thấp'} nhất.`);
  }
  lines.push(`  Khối lượng: ${qty(p.qty)} (≈ ${num(p.notional, 2)} USDT) | Đòn bẩy gợi ý: ${p.suggestedLeverage}x | Giá thanh lý ước tính: ${px(p.liquidationEstimate)}`);
  lines.push(`  Tiền mất ước tính nếu chạm SL: ${num(p.estLoss, 2)} USDT (đã gồm phí ước tính; ngân sách rủi ro ${dec(p.riskPct)}% vốn = ${num(p.riskAmount, 2)} USDT)`);
  return lines;
}
