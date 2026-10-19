import { COMMON } from './config.ts';

// Một bậc ký quỹ — ĐÚNG dạng phần tử brackets[] của GET /fapi/v1/leverageBracket (docs/reference/binance-usdm-api.md).
export type MarginBracket = { bracket: number; initialLeverage: number; notionalCap: number; notionalFloor: number; maintMarginRatio: number; cum: number };
export type MarginSource = 'leverageBracket' | 'giả định';
export type MarginTier = { mmr: number; maxLeverage: number; notionalCap: number; source: MarginSource };

// Bảng giả định thận trọng (config) dựng thành dạng leverageBracket: notionalFloor = trần bậc trước; cum theo công thức liên tục của
// Binance cum_i = cum_{i−1} + floor_i × (MMR_i − MMR_{i−1}).
export function defaultBrackets(): MarginBracket[] {
  const out: MarginBracket[] = [];
  COMMON.margin.defaultBrackets.forEach((b, j) => {
    const prev = out[j - 1];
    const floor = prev ? prev.notionalCap : 0;
    out.push({ bracket: j + 1, initialLeverage: b.initialLeverage, notionalCap: b.notionalCap, notionalFloor: floor, maintMarginRatio: b.maintMarginRatio,
      cum: prev ? prev.cum + floor * (b.maintMarginRatio - prev.maintMarginRatio) : 0 });
  });
  return out;
}

// Bậc ký quỹ cho một notional. brackets = bậc thật của mã (leverageBracket, cần key); undefined = bảng giả định thận trọng.
// null = notional vượt bậc cao nhất (hoặc sàn trả mảng bậc rỗng) → không mở được cỡ này.
export function marginTier(notional: number, brackets?: readonly MarginBracket[]): MarginTier | null {
  const source: MarginSource = brackets !== undefined ? 'leverageBracket' : 'giả định';
  const list = [...(brackets ?? defaultBrackets())].sort((a, b) => a.notionalCap - b.notionalCap);
  const b = list.find((x) => notional <= x.notionalCap);
  if (b === undefined) return null;
  return { mmr: b.maintMarginRatio, maxLeverage: b.initialLeverage, notionalCap: b.notionalCap, source };
}

// Trượt giá THÊM (% khứ hồi) theo cỡ lệnh: tỉ lệ thuận với notional ÷ khối lượng giao dịch 1 phút (USDT).
// Thiếu khối lượng → ném lỗi (không coi là 0).
export function sizeSlippagePct(notional: number, quoteVolPerMin: number): number {
  if (!Number.isFinite(quoteVolPerMin) || quoteVolPerMin <= 0) {
    throw new Error(`Không ước được trượt giá theo cỡ lệnh: khối lượng 1 phút không hợp lệ (${quoteVolPerMin})`);
  }
  return COMMON.slippage.pctPerParticipation * (notional / quoteVolPerMin);
}
