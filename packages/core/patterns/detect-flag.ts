import type { Candle } from '../types.ts';
import { COMMON } from '../config.ts';
import { fitLine } from './geometry.ts';
import { pivotHighs, pivotLows } from '../indicators.ts';
import type { Pivot } from './pivots.ts';
import type { PatternGeometry } from './types.ts';
import { atrAtConfirm } from './detect-range.ts';

// Cờ / cờ đuôi nheo. Chỉ dựa trên nến thô để kết quả không đổi khi có thêm nến (không vẽ lại):
// - tip = đỉnh (đáy) cục bộ đủ pivotConfirmBars nến mỗi bên; không phụ thuộc bộ lọc swing nên không bị "thay thế" về sau.
// - đầu cán = đáy thấp nhất (đỉnh cao nhất) trong maxPoleBars nến ngay trước tip.
// Với mỗi nến đóng e cách tip [minBarsFromTip, maxBars], dựng hai đường ôm (chạm-không-cắt)
// quanh các nến tip+1…e-1 (KHÔNG gồm nến e, nên nến e có thể là nến phá vỡ).
export function detectFlags(c: Candle[], atr: number[], timeframe = ''): PatternGeometry[] {
  const cfg = COMMON.patterns.flag;
  const n = COMMON.pivotConfirmBars;
  const out: PatternGeometry[] = [];
  const tips: Pivot[] = [
    ...pivotHighs(c.map((k) => k.high), n).map((index): Pivot => ({ index, price: c[index]!.high, kind: 'high' })),
    ...pivotLows(c.map((k) => k.low), n).map((index): Pivot => ({ index, price: c[index]!.low, kind: 'low' })),
  ].sort((x, y) => x.index - y.index);
  for (const tip of tips) {
    // Chưa đủ nến khởi động ATR → bỏ qua (giống swingPivots); ngoài ra ATR hỏng thì atrAtConfirm ném lỗi.
    if (tip.index + n < COMMON.patterns.atrPeriod - 1) continue;
    const a = atrAtConfirm(c, atr, tip);
    const bull = tip.kind === 'high';
    const from = Math.max(0, tip.index - cfg.maxPoleBars);
    if (from >= tip.index) continue;
    let startIdx = from;
    for (let i = from; i < tip.index; i++) {
      const better = bull ? c[i]!.low <= c[startIdx]!.low : c[i]!.high >= c[startIdx]!.high;
      if (better) startIdx = i; // hòa → lấy nến gần tip hơn (cán ngắn nhất)
    }
    const start: Pivot = bull
      ? { index: startIdx, price: c[startIdx]!.low, kind: 'low' }
      : { index: startIdx, price: c[startIdx]!.high, kind: 'high' };
    const pole = Math.abs(tip.price - start.price);
    const poleBars = tip.index - start.index;
    if (pole < cfg.minPoleAtr * a) continue;
    const lastEnd = Math.min(tip.index + cfg.maxBars, tip.index + Math.floor(cfg.maxWidthRatio * poleBars), c.length - 1);
    for (let e = tip.index + cfg.minBarsFromTip; e <= lastEnd; e++) {
      const g = flagAt(c, bull, start, tip, e, a, pole, timeframe);
      if (g) out.push(g);
    }
  }
  return out;
}

function flagAt(c: Candle[], bull: boolean, start: Pivot, tip: Pivot, e: number, a: number, pole: number, timeframe: string): PatternGeometry | null {
  const cfg = COMMON.patterns.flag;
  // Không nến nào TRONG cờ (tip+1 … e-1) vượt tip. Nến e có thể vượt tip: đó là nến phá vỡ, vẫn phải phát hình học.
  for (let i = tip.index + 1; i < e; i++) {
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
