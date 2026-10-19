import type { Candle } from '../types.ts';
import { COMMON } from '../config.ts';
import { fitLine } from './geometry.ts';
import type { Pivot } from './pivots.ts';
import type { PatternGeometry, PatternKind } from './types.ts';
import { atrAtConfirm } from './detect-range.ts';

// Tam giác tăng / giảm / cân. Với mỗi pivot cuối, thử các cửa sổ pivot lùi về trước (dài nhất trước)
// và lấy cửa sổ đầu tiên thoả mọi điều kiện. A lấy tại nến xác nhận pivot cuối; chỉ dùng nến ≤ pivot cuối.
export function detectTriangles(c: Candle[], pivots: Pivot[], atr: number[], timeframe = ''): PatternGeometry[] {
  const cfg = COMMON.patterns.triangle;
  const out: PatternGeometry[] = [];
  for (let j = 0; j < pivots.length; j++) {
    const last = pivots[j]!;
    const a = atrAtConfirm(c, atr, last);
    const minPivots = cfg.minLongSide + cfg.minShortSide;
    for (let s = Math.max(0, j - cfg.maxPivots + 1); s <= j - minPivots + 1; s++) {
      const g = tryWindow(c, pivots.slice(s, j + 1), a, timeframe);
      if (g) {
        out.push(g);
        break;
      }
    }
  }
  return out;
}

function tryWindow(c: Candle[], win: Pivot[], a: number, timeframe: string): PatternGeometry | null {
  const cfg = COMMON.patterns.triangle;
  const first = win[0]!;
  const last = win[win.length - 1]!;
  if (last.index - first.index < cfg.minBars) return null;
  const highs = win.filter((p) => p.kind === 'high');
  const lows = win.filter((p) => p.kind === 'low');
  const longSide = Math.max(highs.length, lows.length);
  const shortSide = Math.min(highs.length, lows.length);
  if (longSide < cfg.minLongSide || shortSide < cfg.minShortSide) return null;

  const up = fitLine(highs.map((p) => ({ x: p.index, y: p.price })));
  const low = fitLine(lows.map((p) => ({ x: p.index, y: p.price })));
  // Phân loại có dải đệm quanh ngưỡng phẳng (tránh lật tăng/giảm khi độ dốc sát ngưỡng):
  //  rõ phẳng: |dốc| ≤ (phẳng − đệm); rõ dốc: |dốc| ≥ (phẳng + đệm); ở giữa: không rõ.
  //  tăng = trên rõ phẳng + dưới rõ dốc lên; giảm = dưới rõ phẳng + trên rõ dốc xuống;
  //  cân = cả hai cạnh hướng vào trong vượt khỏi vùng rõ phẳng (gồm trường hợp không rõ); còn lại bỏ.
  const flat = cfg.flatSlopeAtr * a;
  const band = cfg.classifyBandAtr * a;
  const clearFlat = (s: number) => Math.abs(s) <= flat - band;
  let kind: PatternKind;
  if (clearFlat(up.slope) && low.slope >= flat + band) kind = 'asc_triangle';
  else if (clearFlat(low.slope) && up.slope <= -(flat + band)) kind = 'desc_triangle';
  else if (up.slope < -(flat - band) && low.slope > flat - band) kind = 'sym_triangle';
  else return null;

  const widthStart = up.at(first.index) - low.at(first.index);
  const widthEnd = up.at(last.index) - low.at(last.index);
  if (!(widthStart > 0) || !(widthEnd > 0)) return null;
  if ((widthStart - widthEnd) / widthStart < cfg.minConvergence) return null;

  // Apex: nơi hai đường cắt nhau. Hội tụ nên hai độ dốc khác nhau (up.slope < low.slope).
  const apexX = (low.intercept - up.intercept) / (up.slope - low.slope);
  const length = last.index - first.index;
  const ratio = (apexX - last.index) / length;
  if (!(ratio >= cfg.apexMinRatio && ratio <= cfg.apexMaxRatio)) return null;

  const breach = cfg.maxCloseBreachAtr * a;
  for (let i = first.index; i <= last.index; i++) {
    const cl = c[i]!.close;
    if (cl > up.at(i) + breach || cl < low.at(i) - breach) return null;
  }

  const lastLow = [...win].reverse().find((p) => p.kind === 'low')!.price;
  const lastHigh = [...win].reverse().find((p) => p.kind === 'high')!.price;
  return {
    kind,
    timeframe,
    pivots: win,
    startIndex: first.index,
    endIndex: last.index,
    upper: up.at,
    lower: low.at,
    breakoutSide: kind === 'asc_triangle' ? 'up' : kind === 'desc_triangle' ? 'down' : 'both',
    height: widthStart,
    stopRef: { up: lastLow, down: lastHigh },
    quality: Math.min(1, (highs.length + lows.length) / (2 * minTouchesTotal())),
    notes: [`${highs.length} đỉnh, ${lows.length} đáy`],
  };
}

const minTouchesTotal = () => COMMON.patterns.triangle.minLongSide + COMMON.patterns.triangle.minShortSide;
