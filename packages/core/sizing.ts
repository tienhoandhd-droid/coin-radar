import { COMMON, CONFIG } from './config.ts';
import { tickDecimals } from './price.ts';
import { sizeSlippagePct } from './margin.ts';
import type { Mode } from './types.ts';

// Định cỡ 2% — MỘT công thức duy nhất cho planner của bot (packages/bot/planner.ts), kế hoạch máy quét (plan.ts, pattern-plan.ts)
// và bản in (rà soát Task 3 kế hoạch 2). Ràng buộc cứng người dùng: lỗ thật mỗi lệnh ≤ 2% vốn kể cả phí, trượt giá và funding.
//
// Lỗ khi chạm SL với khối lượng q, vào ở giá e (giá xấu nhất), SL s:
//   rủi ro(q) = q·a + q²·b
//   a = |e − s| + nửa phí nhóm ở giá vào + nửa phí nhóm ở giá SL + đệm funding/coin
//   b = trượt theo cỡ (I7) hai chiều: mỗi chiều trượt TB = ½·k·notional/KL 1 phút, k = pctPerParticipation% → ½·k·(e² + s²)/KL
// Khối lượng = nghiệm dương của rủi ro(q) = ngân sách, làm tròn XUỐNG theo bước (rủi ro đồng biến nên vẫn ≤ ngân sách).

// Phí nhóm thanh khoản (% khứ hồi, COMMON.costRoundTripPct) + KL giao dịch 1 phút (USDT). quoteVolPerMin = Infinity: bỏ trượt theo cỡ.
export type CostModel = { tierPct: number; quoteVolPerMin: number };
// |funding| lớn nhất mỗi kỳ gần đây (> 0 — thiếu lịch sử → fundingFallbackRate) + chu kỳ funding (giờ).
export type FundingBuffer = { maxAbsRate: number; intervalHours: number };
export type RiskModel = { a: number; b: number; fundingPerUnit: number; fundingSettlements: number; cost: CostModel };

export function costModelProblems(cm: CostModel | undefined): string[] {
  if (cm === undefined) return ['thiếu costModel (phí nhóm + KL 1 phút) — không định cỡ được đúng phí thật'];
  if (!(cm.tierPct >= 0 && Number.isFinite(cm.tierPct)) || !(cm.quoteVolPerMin > 0) || Number.isNaN(cm.quoteVolPerMin)) {
    return [`costModel không hợp lệ (phí nhóm ${cm.tierPct}%, KL 1 phút ${cm.quoteVolPerMin})`];
  }
  return [];
}

export function fundingBufferProblems(fb: FundingBuffer | undefined): string[] {
  if (fb === undefined || !(fb.intervalHours > 0 && Number.isFinite(fb.intervalHours)) || !Number.isFinite(fb.maxAbsRate)) {
    return [`fundingBuffer không hợp lệ (${JSON.stringify(fb)})`];
  }
  if (!(fb.maxAbsRate > 0)) return [`đệm funding = ${fb.maxAbsRate}: thiếu dữ liệu funding — dùng mức thận trọng fundingFallbackRate, không dùng 0`];
  return [];
}

// Số kỳ funding đệm = thời gian giữ TỐI ĐA chiến lược cho phép (CONFIG.maxHoldHours: Swing 504 giờ, Lướt nhanh 24 giờ) ÷ chu kỳ,
// làm tròn lên (rà soát lại Task 3 vòng 2: thời gian giữ dự kiến 168/8 giờ không bảo vệ lệnh giữ lâu hơn).
export function fundingSettlements(mode: Mode, intervalHours: number): number {
  return Math.ceil(CONFIG[mode].maxHoldHours / intervalHours - 1e-9);
}

// |funding| lớn nhất mỗi kỳ trong lookbackDays ngày tới t — chỉ các kỳ ĐÃ chốt (fundingTime ≤ t, không nhìn trước). Không có kỳ nào → 0
// (nơi gọi thay bằng fundingFallbackRate, không dùng 0). Dùng chung: máy quét (scanner/funding-history.ts), mô phỏng (simulate-run.ts).
export function maxAbsFundingRate(rows: ReadonlyArray<{ fundingTime: number; fundingRate: number }>, t: number,
  lookbackDays: number = COMMON.risk.fundingBufferLookbackDays): number {
  const from = t - lookbackDays * 86_400_000;
  let m = 0;
  for (const r of rows) if (r.fundingTime > from && r.fundingTime <= t) m = Math.max(m, Math.abs(r.fundingRate));
  return m;
}

// Mức funding thận trọng mỗi kỳ khi không có lịch sử (hoặc lịch sử toàn 0): COMMON.risk.fundingFallbackPer8h quy theo chu kỳ.
export function fundingFallbackRate(intervalHours: number): number {
  return (COMMON.risk.fundingFallbackPer8h * intervalHours) / 8;
}

export function riskModel(mode: Mode, entry: number, stop: number, cost: CostModel, fb: FundingBuffer): RiskModel {
  const fundingSettlementsN = fundingSettlements(mode, fb.intervalHours);
  const fundingPerUnit = fundingSettlementsN * fb.maxAbsRate * Math.max(entry, stop);
  const k = COMMON.slippage.pctPerParticipation / 100;
  const a = Math.abs(entry - stop) + ((entry + stop) * cost.tierPct) / 200 + fundingPerUnit;
  const b = Number.isFinite(cost.quoteVolPerMin) ? (k * (entry * entry + stop * stop)) / 2 / cost.quoteVolPerMin : 0;
  return { a, b, fundingPerUnit, fundingSettlements: fundingSettlementsN, cost };
}

export const riskAt = (m: RiskModel, q: number) => q * m.a + q * q * m.b;
// 1R (không gồm đệm funding — funding thật tính riêng vào lãi lỗ) cho khối lượng q
export const oneR = (m: RiskModel, q: number) => q * (m.a - m.fundingPerUnit) + q * q * m.b;
// nghiệm dương của q·a + q²·b = r, dạng ổn định số (không trừ hai số gần bằng nhau khi b rất nhỏ)
export const qtyForRisk = (m: RiskModel, r: number) => (2 * r) / (m.a + Math.sqrt(m.a * m.a + 4 * m.b * r));

export function floorToStep(x: number, step: number): number {
  return x > 0 && Number.isFinite(x) ? Number((Math.floor(x / step + 1e-9) * step).toFixed(tickDecimals(step))) : 0;
}

// Phí + trượt khứ hồi (%) của một lệnh có notional này
export function costPctAt(cost: CostModel, notional: number): number {
  return cost.tierPct + (Number.isFinite(cost.quoteVolPerMin) ? sizeSlippagePct(notional, cost.quoteVolPerMin) : 0);
}

// Khối lượng 2% (làm tròn xuống theo bước) và rủi ro thật của nó
export function sizeForRisk(m: RiskModel, capital: number, riskPct: number, step: number): { qty: number; riskAmount: number; budget: number } {
  const budget = (capital * riskPct) / 100;
  const qty = floorToStep(qtyForRisk(m, budget), step);
  return { qty, riskAmount: riskAt(m, qty), budget };
}

// R sau phí của một mức chốt lời tp (cho bản in): lãi/coin sau phí nhóm + trượt hai chiều, chia cho 1R/coin của khối lượng q.
export function netRAt(m: RiskModel, q: number, side: 'long' | 'short', entry: number, tp: number): number | null {
  if (!(q > 0)) return null;
  const d = side === 'long' ? 1 : -1;
  const half = (px: number) => px * (m.cost.tierPct / 200 + (Number.isFinite(m.cost.quoteVolPerMin) ? (COMMON.slippage.pctPerParticipation / 100) * (q * px) / m.cost.quoteVolPerMin / 2 : 0));
  return (d * (tp - entry) - half(entry) - half(tp)) / (oneR(m, q) / q);
}
