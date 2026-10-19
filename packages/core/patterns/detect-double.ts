import type { Candle } from '../types.ts';
import { COMMON } from '../config.ts';
import type { Pivot } from './pivots.ts';
import type { PatternGeometry } from './types.ts';
import { atrAtConfirm } from './detect-range.ts';

// Hai đỉnh (đỉnh–đáy–đỉnh) và hai đáy (đáy–đỉnh–đáy). Mỗi bộ ba pivot liền nhau xét một lần;
// A lấy tại nến xác nhận pivot thứ ba.
export function detectDoubles(c: Candle[], pivots: Pivot[], atr: number[], timeframe = ''): PatternGeometry[] {
  const cfg = COMMON.patterns.double;
  const out: PatternGeometry[] = [];
  for (let j = 2; j < pivots.length; j++) {
    const p1 = pivots[j - 2]!;
    const p2 = pivots[j - 1]!;
    const p3 = pivots[j]!;
    if (p1.kind !== p3.kind || p2.kind === p1.kind) continue;
    const a = atrAtConfirm(c, atr, p3);
    const top = p1.kind === 'high';
    const diff = Math.abs(p1.price - p3.price);
    const tol = Math.min(cfg.tolAtr * a, ((cfg.tolPct / 100) * (p1.price + p3.price)) / 2);
    if (diff > tol) continue;
    if (p3.index - p1.index < cfg.minGapBars) continue;
    // Độ sâu tính từ đỉnh thấp hơn (đáy cao hơn) — cách tính chặt hơn.
    const depth = top ? Math.min(p1.price, p3.price) - p2.price : p2.price - Math.max(p1.price, p3.price);
    if (depth < cfg.minDepthAtr * a) continue;

    const extreme = top ? Math.max(p1.price, p3.price) : Math.min(p1.price, p3.price);
    const height = Math.abs(extreme - p2.price);
    // Chiều lệnh theo hướng phá: hai đỉnh phá xuống, cắt lỗ trên đỉnh cao hơn; hai đáy ngược lại.
    // Chiều ngược (không phải tín hiệu của mô hình) lấy đường cổ P2 để vẫn là số hữu hạn.
    const stopRef = top ? { up: p2.price, down: extreme } : { up: extreme, down: p2.price };
    out.push({
      kind: top ? 'double_top' : 'double_bottom',
      timeframe,
      pivots: [p1, p2, p3],
      startIndex: p1.index,
      endIndex: p3.index,
      upper: () => (top ? extreme : p2.price),
      lower: () => (top ? p2.price : extreme),
      breakoutSide: top ? 'down' : 'up',
      height,
      stopRef,
      quality: Math.max(0, Math.min(1, 1 - diff / tol)) * 0.5 + Math.min(1, depth / (2 * cfg.minDepthAtr * a)) * 0.5,
      notes: [],
    });
  }
  return out;
}
