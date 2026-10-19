import { COMMON } from './config.ts';

// Một bậc ký quỹ: các trường tương ứng GET /fapi/v1/leverageBracket (notionalCap, maintMarginRatio, initialLeverage).
export type MarginBracket = { notionalCap: number; maintMarginRatio: number; maxLeverage: number };
export type MarginTier = { mmr: number; maxLeverage: number; notionalCap: number; source: 'leverageBracket' | 'mặc định thận trọng' };

// Bậc ký quỹ cho một notional. brackets = bậc thật từ leverageBracket (cần API key) — HOOK cho bot; không truyền thì dùng
// bảng mặc định thận trọng trong config. null = notional vượt bậc cao nhất (sàn không cho mở vị thế cỡ này).
export function marginTier(notional: number, brackets?: readonly MarginBracket[]): MarginTier | null {
  const real = brackets !== undefined;
  const list = [...(brackets ?? COMMON.margin.defaultBrackets)].sort((a, b) => a.notionalCap - b.notionalCap);
  if (list.length === 0) throw new Error('marginTier: danh sách bậc ký quỹ rỗng');
  const b = list.find((x) => notional <= x.notionalCap);
  if (b === undefined) return null;
  return { mmr: b.maintMarginRatio, maxLeverage: b.maxLeverage, notionalCap: b.notionalCap, source: real ? 'leverageBracket' : 'mặc định thận trọng' };
}

// Trượt giá THÊM (% khứ hồi) theo cỡ lệnh: tỉ lệ thuận với notional ÷ khối lượng giao dịch 1 phút (USDT).
// Thiếu khối lượng → ném lỗi (không coi là 0).
export function sizeSlippagePct(notional: number, quoteVolPerMin: number): number {
  if (!Number.isFinite(quoteVolPerMin) || quoteVolPerMin <= 0) {
    throw new Error(`Không ước được trượt giá theo cỡ lệnh: khối lượng 1 phút không hợp lệ (${quoteVolPerMin})`);
  }
  return COMMON.slippage.pctPerParticipation * (notional / quoteVolPerMin);
}
