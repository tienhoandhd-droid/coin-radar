import { COMMON } from '../packages/core/config.ts';
import { formatTick } from '../packages/core/price.ts';
import type { TradePlan } from '../packages/core/plan.ts';
import type { PatternPlan } from '../packages/core/patterns/pattern-plan.ts';
import type { PatternKind } from '../packages/core/patterns/types.ts';
import type { PatternInfo } from '../packages/core/analyze.ts';
import type { GradeResult } from '../packages/core/grade.ts';

const num = (x: number, digits: number): string => x.toFixed(digits).replace('.', ',');
const qty = (x: number): string => num(x, 8).replace(/0+$/, '').replace(/,$/, '');
const dec = (x: number): string => String(x).replace('.', ',');
// Thời điểm (ms) → "YYYY-MM-DD HH:MM UTC" (giờ UTC như biểu đồ Binance mặc định)
export const utc = (t: number): string => `${new Date(t).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

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
        ? (t.qty > 0
          ? `  ${t.name}: chốt ${t.pct}% = ${qty(t.qty)} coin — ${trail} — ${t.reason}`
          : `  ${t.name}: chốt ${t.pct}% — gộp vào ${p.targets[p.targets.length - 1]!.name} (khối lượng nhỏ hơn 1 bước, không tách được) — ${t.reason}`)
        : `  ${t.name}: ${px(t.price)} chốt ${t.pct}% = ${qty(t.qty)} coin | ${num(t.r!, 2)}R — ${t.reason}`);
    }
    lines.push('  Đạt TP1 → dời SL về đúng giá KHỚP THẬT của anh (giữ nguyên sau TP2)');
  }
  if (trailPct > COMMON.binanceTrailMaxCallbackPct) {
    lines.push(`  LƯU Ý: lệnh trailing stop của Binance chỉ nhận callbackRate tối đa ${COMMON.binanceTrailMaxCallbackPct}% (khoảng cách này là ${num(trailPct, 1)}%) → không đặt được nguyên văn, hãy tự dời SL thủ công theo ${px(p.trailAtr)} ${long ? 'dưới giá cao' : 'trên giá thấp'} nhất.`);
  }
  lines.push(`  Khối lượng: ${qty(p.qty)} (≈ ${num(p.notional, 2)} USDT) | Đòn bẩy gợi ý: ${p.suggestedLeverage}x | Giá thanh lý ước tính: ${px(p.liquidationEstimate)}`);
  lines.push(`  Bảng khối lượng theo giá khớp (ngân sách rủi ro giữ nguyên ${num(p.riskAmount, 2)} USDT, chia ${COMMON.zones.exitPcts.join('/')}):`);
  for (const f of p.fillTable) {
    // Phần bằng 0 (chỉ xảy ra với phần trailing) không in số 0 mà nói rõ đã gộp vào TP3
    const part = (i: number) => `TP${i + 1} ${f.q[i]! > 0 ? qty(f.q[i]!) : `gộp vào TP${f.q.length}`}`;
    lines.push(`    Khớp ${px(f.fill)} (${f.label}): ${qty(f.qty)} coin = ${f.q.map((_, i) => part(i)).join(' / ')} | mất ước tính ${num(f.estLoss, 2)} USDT`);
  }
  lines.push(`  Tiền mất ước tính nếu chạm SL: ${num(p.estLoss, 2)} USDT (đã gồm phí ước tính; ngân sách rủi ro ${dec(p.riskPct)}% vốn = ${num(p.riskAmount, 2)} USDT)`);
  return lines;
}

// ---------- Kế hoạch 1c: mô hình biểu đồ ----------

export const KIND_NAME: Record<PatternKind, string> = {
  rectangle: 'chữ nhật', double_top: 'hai đỉnh', double_bottom: 'hai đáy',
  asc_triangle: 'tam giác tăng', desc_triangle: 'tam giác giảm', sym_triangle: 'tam giác cân',
  bull_flag: 'cờ tăng', bear_flag: 'cờ giảm', head_shoulders: 'vai-đầu-vai', inv_head_shoulders: 'vai-đầu-vai ngược',
  multi_month_range: 'vùng nhiều tháng',
};

// Khối "Mô hình đang theo dõi" của một hợp đồng: loại, khung, trạng thái, đường phá (hoặc hai biên), chiều cao, ghi chú.
export function trackedLines(list: PatternInfo[], tickSize: number): string[] {
  const px = (x: number) => formatTick(x, tickSize);
  const lines: string[] = [];
  for (const p of list) {
    const dir = p.side === 'up' ? ' (phá lên)' : p.side === 'down' ? ' (phá xuống)' : '';
    const where = p.breakoutLine !== null ? `đường phá ${px(p.breakoutLine)}` : `biên trên ${px(p.upper)} / biên dưới ${px(p.lower)}`;
    const hidden = p.hidden ? ' | ẩn (Lướt nhanh: chỉ ghi nhận)' : '';
    lines.push(`    ${KIND_NAME[p.kind]} ${p.timeframe.toUpperCase()}${p.contextOnly ? ' (bối cảnh)' : ''} — ${p.state}${dir} | ${where} | chiều cao ${px(p.height)}${hidden}`);
    for (const n of p.notes) lines.push(`      · ${n}`);
  }
  return lines;
}

// Kế hoạch lệnh theo mô hình. Mọi giá in theo tickSize. Lệnh chia 2 chân in từng chân, khối lượng mỗi chân,
// khối lượng TP khi chỉ khớp chân market và khi khớp cả hai, và luật dời SL sau TP1 cho cả hai trường hợp.
export function patternPlanLines(head: { symbol: string; score: number; riskTier: string }, p: PatternPlan, tickSize: number): string[] {
  const px = (x: number) => formatTick(x, tickSize);
  const long = p.side === 'long';
  const tf = p.timeframe.toUpperCase();
  const chase = long ? 'mua cao' : 'bán thấp';
  const cancel = `hủy sau ${p.limitExpiryBars} nến (${p.limitExpiryHours} giờ) chưa khớp${p.cancelIfTp1First ? ' hoặc khi giá chạm TP1 trước' : ''}`;
  const P = COMMON.patterns.plan;
  const lines: string[] = [];
  const age = p.fresh ? 'TÍN HIỆU MỚI' : `đã phát lúc ${utc(p.firstSignalTime)}, còn hạn ${p.expiresInBars} nến (in lại theo --show-old)`;
  lines.push(`${head.symbol} — ${long ? 'LONG' : 'SHORT'} theo mô hình ${KIND_NAME[p.kind]} ${tf} | điểm ${dec(head.score)} | rủi ro ${head.riskTier} | ${age}`);
  lines.push(`  Mức phá (cố định tại nến phá ${utc(p.breakoutTime)}): ${px(p.breakoutLine)} | A = ATR(14) ${tf} = ${px(p.atr)} | d = ${num(p.distanceAtr, 2)}×A | T_ngắn ${px(p.targetShort)} / T_đủ ${px(p.targetFull)}`);

  const row0 = p.fillTable[0]!;
  const legQ = (q: [number, number, number]) => q.map((x, i) => `TP${i + 1} ${x > 0 ? qty(x) : (p.targets[i]!.pct > 0 ? `gộp vào TP${q.length}` : '—')}`).join(' / ');
  if (p.entryType === 'market') {
    lines.push(`  Kiểu vào lệnh: VÀO TRỰC TIẾP 100% — ${p.entryReason}`);
  } else if (p.entryType === 'split') {
    lines.push(`  Kiểu vào lệnh: CHIA 2 CHÂN — ${p.entryReason}`);
    const m = row0.legs.find((l) => l.kind === 'market')!;
    const l = row0.legs.find((x) => x.kind === 'limit')!;
    lines.push(`    Chân 1 — MARKET ${P.splitMarketPct}%: giá hiện tại ${px(p.marketPrice)} (không ${chase} hơn ${px(p.maxEntry)}): ${qty(m.qty)} coin = ${legQ(m.q)}`);
    lines.push(`    Chân 2 — LIMIT ${100 - P.splitMarketPct}%: ${px(l.price)}, ${cancel}: ${qty(l.qty)} coin = ${legQ(l.q)}`);
  } else {
    lines.push(`  Kiểu vào lệnh: CHỈ ĐẶT LIMIT ${P.limitOnlyPct}% khối lượng tại ${px(p.limitPrice!)}, ${cancel} — ${p.entryReason}`);
  }
  lines.push(`  Giá hiện tại: ${px(p.marketPrice)} | Giá vào dùng để tính: ${px(p.entry)}${p.entryType === 'split' ? ' (giá trung bình khi khớp cả hai chân)' : ''}`);
  lines.push(`  SL: ${px(p.stop)} — ${p.stopReason}`);

  const trailPct = (p.trailAtr / p.entry) * 100;
  const trail = `trailing stop: cách giá ${long ? 'cao' : 'thấp'} nhất 3×ATR = ${px(p.trailAtr)} (${num(trailPct, 1)}%)`;
  const mOnly = p.targetsIfMarketOnly;
  p.targets.forEach((t, i) => {
    if (t.pct === 0) { lines.push(`  ${t.name}: bỏ — ${t.reason}`); return; }
    const amount = mOnly
      ? ` — khớp cả hai chân ${qty(t.qty)} coin; chỉ khớp chân market ${qty(mOnly[i]!)} coin`
      : ` = ${qty(t.qty)} coin`;
    lines.push(t.price === null
      ? `  ${t.name}: chốt ${t.pct}%${amount} — ${trail} — ${t.reason}`
      : `  ${t.name}: ${px(t.price)} chốt ${t.pct}%${amount} | ${num(t.r!, 2)}R — ${t.reason}`);
  });
  if (p.entryType === 'split') {
    lines.push(`  Sau TP1 → SL về ${px(p.afterTp1Stop)} nếu khớp cả hai chân; về ${px(p.afterTp1StopIfMarketOnly!)} nếu chỉ khớp chân market (ước tính — theo luật dưới)`);
    lines.push(`    Luật: ${p.afterTp1Reason}`);
  } else {
    lines.push(`  Sau TP1 → SL về ${px(p.afterTp1Stop)} — ${p.afterTp1Reason}`);
  }
  if (trailPct > COMMON.binanceTrailMaxCallbackPct) {
    lines.push(`  LƯU Ý: lệnh trailing stop của Binance chỉ nhận callbackRate tối đa ${COMMON.binanceTrailMaxCallbackPct}% (khoảng cách này là ${num(trailPct, 1)}%) → không đặt được nguyên văn, hãy tự dời SL thủ công theo ${px(p.trailAtr)} ${long ? 'dưới giá cao' : 'trên giá thấp'} nhất.`);
  }
  lines.push(`  TP1 sau phí + funding: ${num(p.tp1NetR, 2)}R ở giá khớp xấu nhất | R = ${num(p.riskAtr, 2)}×A`);
  lines.push(`  Khối lượng khi khớp mọi chân: ${qty(p.qty)} (≈ ${num(p.notional, 2)} USDT) | Đòn bẩy gợi ý: ${p.suggestedLeverage}x (isolated) | Giá thanh lý ước tính: ${px(p.liquidationEstimate)} | Ký quỹ ≈ ${num(p.marginNeeded, 2)} USDT`);
  lines.push(`  Bảng khối lượng theo giá khớp${p.entryType === 'limit' ? ' (chỉ chân limit)' : ' của chân market'} (ngân sách rủi ro ${num(p.riskAmount, 2)} USDT):`);
  for (const f of p.fillTable) {
    const legs = f.legs.length > 1 ? `${f.legs.map((l) => `${l.kind} ${qty(l.qty)}`).join(' + ')} = ` : '';
    lines.push(`    Khớp ${px(f.fill)} (${f.label}): ${legs}${qty(f.qty)} coin = ${legQ(f.q)} | mất ước tính ${num(f.estLoss, 2)} USDT`);
  }
  lines.push(`  Tiền mất ước tính nếu chạm SL (khớp mọi chân): ${num(p.estLoss, 2)} USDT (đã gồm phí ước tính; ngân sách rủi ro ${dec(p.riskPct)}% vốn = ${num(p.riskAmount, 2)} USDT)`);
  lines.push(`  Dừng theo thời gian: chưa đạt +1R sau ${p.timeStopHours} giờ thì đóng; giữ tối đa ${p.maxHoldHours} giờ`);
  if (p.notes.length > 0) lines.push(`  Ghi chú: ${p.notes.join('; ')}`);
  return lines;
}

// Tín hiệu mô hình CŨ (đã phát ở lần quét trước, chưa hết hạn): một dòng, không in lại kế hoạch đầy đủ (B3).
export function oldPatternSignalLine(head: { symbol: string; score: number }, p: PatternPlan): string {
  return `${head.symbol} — ${p.side === 'long' ? 'LONG' : 'SHORT'} theo mô hình ${KIND_NAME[p.kind]} ${p.timeframe.toUpperCase()} | điểm ${dec(head.score)} | đã phát lúc ${utc(p.firstSignalTime)}, còn hạn ${p.expiresInBars} nến — không in lại kế hoạch (thêm --show-old để xem)`;
}

// ---------- Hạng A / Hạng B (Task 8) ----------

export const GRADE_A_DISCLAIMER = 'Hạng A là tiêu chí lọc chặt, KHÔNG phải xác suất thắng. Tỉ lệ thắng thực sẽ đo ở sổ tín hiệu/backtest.';

export type GradedItem = { symbol: string; side: 'long' | 'short'; score: number; grade: GradeResult; lines: string[] };

// Khối in cuối của máy quét: Hạng A (lời cảnh báo ở trên cùng, kế hoạch đầy đủ, điểm cao trước), rồi Hạng B.
// Mặc định Hạng B chỉ là danh sách ngắn kèm tiêu chí trượt; showB = true thì in đủ kế hoạch Hạng B (sau Hạng A).
export function gradedReportLines(items: GradedItem[], showB: boolean): string[] {
  const byScore = (x: GradedItem, y: GradedItem) => y.score - x.score;
  const A = items.filter((x) => x.grade.grade === 'A').sort(byScore);
  const B = items.filter((x) => x.grade.grade === 'B').sort(byScore);
  const out: string[] = [`Hạng A (${A.length}):`, GRADE_A_DISCLAIMER];
  if (A.length === 0) out.push('  Không có tín hiệu Hạng A trong lần quét này.');
  for (const x of A) out.push('', ...x.lines);
  if (B.length > 0) {
    out.push('', `Hạng B (${B.length}) — đạt tiêu chí nhưng chưa đủ Hạng A${showB ? ' (in đủ kế hoạch theo --show-b)' : ' (không in kế hoạch; thêm --show-b để xem)'}:`);
    for (const x of B) {
      if (showB) out.push('', ...x.lines, `  Không đủ Hạng A: ${x.grade.failed.join('; ')}`);
      else out.push(`  ${x.symbol} — ${x.side === 'long' ? 'LONG' : 'SHORT'} | điểm ${dec(x.score)} | không đủ: ${x.grade.failed.join('; ')}`);
    }
  }
  return out;
}
