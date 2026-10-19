import type { Candle } from '../types.ts';
import { COMMON } from '../config.ts';
import { fitLine } from './geometry.ts';
import type { Pivot } from './pivots.ts';
import type { PatternGeometry } from './types.ts';
import { atrAtConfirm } from './detect-range.ts';

// Cờ / cờ đuôi nheo. Cán = pivot đối chiều ngay trước tip → tip. Với mỗi nến đóng e cách tip
// [minBarsFromTip, maxBars], dựng hai đường ôm (chạm-không-cắt) quanh các nến tip+1…e-1 (KHÔNG gồm nến e).
// Cần ít nhất một pivot đối chiều đã xác nhận sau tip (đảm bảo tip không bị thay khi có thêm nến).
export function detectFlags(c: Candle[], pivots: Pivot[], atr: number[], timeframe = ''): PatternGeometry[] {
  const cfg = COMMON.patterns.flag;
  const out: PatternGeometry[] = [];
  for (let t = 1; t < pivots.length - 1; t++) {
    const tip = pivots[t]!;
    const start = pivots[t - 1]!;
    if (start.kind === tip.kind) continue;
    const bull = tip.kind === 'high';
    const a = atrAtConfirm(c, atr, tip);
    const pole = Math.abs(tip.price - start.price);
    const poleBars = tip.index - start.index;
    if (pole < cfg.minPoleAtr * a || poleBars > cfg.maxPoleBars) continue;
    const after = pivots.slice(t + 1).find((p) => p.kind !== tip.kind);
    if (!after) continue;
    const firstEnd = Math.max(tip.index + cfg.minBarsFromTip, after.index + COMMON.pivotConfirmBars);
    const lastEnd = Math.min(tip.index + cfg.maxBars, tip.index + Math.floor(cfg.maxWidthRatio * poleBars), c.length - 1);
    for (let e = firstEnd; e <= lastEnd; e++) {
      const g = flagAt(c, bull, start, tip, e, a, pole, timeframe);
      if (g) out.push(g);
    }
  }
  return out;
}

function flagAt(c: Candle[], bull: boolean, start: Pivot, tip: Pivot, e: number, a: number, pole: number, timeframe: string): PatternGeometry | null {
  const cfg = COMMON.patterns.flag;
  // Không nến nào (kể cả nến hiện tại e) vượt tip.
  for (let i = tip.index + 1; i <= e; i++) {
    if (bull ? c[i]!.high > tip.price : c[i]!.low < tip.price) return null;
  }
  const body = c.slice(tip.index + 1, e); // tip+1 … e-1
  const flagHigh = Math.max(...body.map((k) => k.high));
  const flagLow = Math.min(...body.map((k) => k.low));
  if (flagHigh - flagLow > cfg.maxHeightRatio * pole) return null;

  // Đường ôm: hồi quy qua đỉnh/đáy từng nến rồi dịch để chạm mà không cắt nến nào.
  const upFit = fitLine(body.map((k, n) => ({ x: tip.index + 1 + n, y: k.high })));
  const lowFit = fitLine(body.map((k, n) => ({ x: tip.index + 1 + n, y: k.low })));
  const upShift = Math.max(...body.map((k, n) => k.high - upFit.at(tip.index + 1 + n)));
  const lowShift = Math.min(...body.map((k, n) => k.low - lowFit.at(tip.index + 1 + n)));
  const upper = (i: number) => upFit.at(i) + upShift;
  const lower = (i: number) => lowFit.at(i) + lowShift;

  const x0 = tip.index + 1;
  const x1 = e - 1;
  const w0 = upper(x0) - lower(x0);
  const w1 = upper(x1) - lower(x1);
  const converging = w0 > 0 && (w0 - w1) / w0 >= cfg.minConvergence;
  if (!converging) {
    // Cờ thường: không được trôi thuận chiều cán (cờ tăng không dốc lên, cờ giảm không dốc xuống).
    const drift = bull ? Math.max(upFit.slope, lowFit.slope) : -Math.min(upFit.slope, lowFit.slope);
    if (drift > cfg.flatSlopeAtr * a) return null;
  }
  return {
    kind: bull ? 'bull_flag' : 'bear_flag',
    timeframe,
    pivots: [start, tip],
    startIndex: start.index,
    endIndex: e,
    upper,
    lower,
    breakoutSide: bull ? 'up' : 'down',
    height: pole,
    stopRef: { up: flagLow, down: flagHigh },
    quality: Math.min(1, pole / (2 * cfg.minPoleAtr * a)),
    notes: converging ? ['cờ đuôi nheo (hai đường hội tụ)'] : [],
  };
}
