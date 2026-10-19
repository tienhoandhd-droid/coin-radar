import type { Candle } from '../types.ts';
import { COMMON } from '../config.ts';
import type { Pivot } from './pivots.ts';
import type { PatternGeometry } from './types.ts';

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);

// ATR tại nến xác nhận pivot cuối (index + pivotConfirmBars) — đúng thời điểm mô hình bắt đầu được biết.
// Không bao giờ đọc ATR của nến sau đó → không look-ahead.
export function atrAtConfirm(c: Candle[], atr: number[], last: Pivot): number {
  if (atr.length !== c.length) throw new Error(`độ dài atr (${atr.length}) khác độ dài nến (${c.length})`);
  const bar = last.index + COMMON.pivotConfirmBars;
  if (bar >= c.length) throw new Error(`pivot ${last.index} chưa được xác nhận trong ${c.length} nến`);
  const a = atr[bar]!;
  if (!Number.isFinite(a) || a <= 0) throw new Error(`ATR không hợp lệ tại nến ${bar}: ${a}`);
  return a;
}

// Chữ nhật / vùng đi ngang (gồm ba đỉnh, ba đáy). Với mỗi pivot cuối, lấy cửa sổ pivot dài nhất lùi về trước
// mà các đỉnh nằm cùng một vùng và các đáy nằm cùng một vùng (chênh ≤ zoneTolAtr×A, A tại nến xác nhận pivot cuối).
export function detectRectangles(c: Candle[], pivots: Pivot[], atr: number[], timeframe = ''): PatternGeometry[] {
  const cfg = COMMON.patterns.rect;
  const tol = COMMON.patterns.zoneTolAtr;
  const out: PatternGeometry[] = [];
  for (let j = 1; j < pivots.length; j++) {
    const last = pivots[j]!;
    const a = atrAtConfirm(c, atr, last);
    const highs: number[] = [];
    const lows: number[] = [];
    let start = j + 1;
    for (let i = j; i >= 0; i--) {
      const p = pivots[i]!;
      const side = p.kind === 'high' ? highs : lows;
      if (spread([...side, p.price]) > tol * a) break;
      side.push(p.price);
      start = i;
    }
    if (start > j) continue;
    if (highs.length < cfg.minTouches || lows.length < cfg.minTouches) continue;
    const win = pivots.slice(start, j + 1);
    const upperLevel = mean(highs);
    const lowerLevel = mean(lows);
    const height = upperLevel - lowerLevel;
    if (height < cfg.minHeightAtr * a) continue;
    if (Math.min(...highs) <= Math.max(...lows)) continue; // Lo: đỉnh thấp nhất phải > đáy cao nhất
    const first = win[0]!;
    if (last.index - first.index < cfg.minBars) continue;

    // Cắt lỗ trước đệm: pivot nhỏ gần nhất phía trong; xa hơn stopMaxAtr×A thì dùng giữa vùng.
    const mid = (upperLevel + lowerLevel) / 2;
    const lastLow = [...win].reverse().find((p) => p.kind === 'low')!.price;
    const lastHigh = [...win].reverse().find((p) => p.kind === 'high')!.price;
    const stopUp = upperLevel - lastLow > cfg.stopMaxAtr * a ? mid : lastLow;
    const stopDown = lastHigh - lowerLevel > cfg.stopMaxAtr * a ? mid : lastHigh;

    const notes: string[] = [];
    if (highs.length >= cfg.tripleTouches) notes.push(`ba đỉnh (${highs.length} chạm biên trên)`);
    if (lows.length >= cfg.tripleTouches) notes.push(`ba đáy (${lows.length} chạm biên dưới)`);
    const touches = Math.min(highs.length, lows.length);
    out.push({
      kind: 'rectangle',
      timeframe,
      pivots: win,
      startIndex: first.index,
      endIndex: last.index,
      upper: () => upperLevel,
      lower: () => lowerLevel,
      breakoutSide: 'both',
      height,
      stopRef: { up: stopUp, down: stopDown },
      quality: Math.min(1, touches / (2 * cfg.minTouches)),
      notes,
    });
  }
  return out;
}
