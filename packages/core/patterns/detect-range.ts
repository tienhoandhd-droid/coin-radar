import type { Candle } from '../types.ts';
import { COMMON } from '../config.ts';
import { pivotHighs, pivotLows } from '../indicators.ts';
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
export type RectCfg = { minTouches: number; tripleTouches: number; minHeightAtr: number; minBars: number };

export function detectRectangles(c: Candle[], pivots: Pivot[], atr: number[], timeframe = '', cfg: RectCfg = COMMON.patterns.rect): PatternGeometry[] {
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

    // Cắt lỗ trước đệm DỰ PHÒNG = giữa vùng. Cửa sổ chỉ chứa lần chạm biên, nên "pivot nhỏ phía trong" chỉ tìm được lúc phá
    // (rectangleStopRef, cần biết chiều phá và nến phá). Trần R (3×A) được kiểm trên R thật ở kế hoạch lệnh, không ở đây.
    const mid = (upperLevel + lowerLevel) / 2;

    const notes: string[] = [];
    if (highs.length >= cfg.tripleTouches) notes.push(`ba đỉnh (${highs.length} chạm biên trên)`);
    if (lows.length >= cfg.tripleTouches) notes.push(`ba đáy (${lows.length} chạm biên dưới)`);
    const touches = Math.min(highs.length, lows.length);
    const geom: PatternGeometry = {
      kind: 'rectangle',
      timeframe,
      pivots: win,
      startIndex: first.index,
      endIndex: last.index,
      upper: () => upperLevel,
      lower: () => lowerLevel,
      breakoutSide: 'both',
      height,
      stopRef: { up: mid, down: mid },
      quality: Math.min(1, touches / (2 * cfg.minTouches)),
      notes,
    };
    geom.stopAt = (cc, side, bi) => rectangleStopRef(cc, geom, side, bi, atr);
    out.push(geom);
  }
  return out;
}

// Mức cắt lỗ chữ nhật lúc phá (báo cáo mục (2): "pivot nhỏ gần nhất phía trong mô hình"):
// pivot NGƯỢC loại với biên bị phá (phá lên → đáy; phá xuống → đỉnh), gần nhất, nằm SAU lần chạm cuối của biên bị phá,
// đã xác nhận (đủ pivotConfirmBars nến bên phải) chậm nhất tại nến phá, KHÔNG phải một lần chạm biên của mô hình,
// nằm hẳn giữa hai biên và cách biên bị phá ≥ innerMinAtr×A(nến phá). Không có → giữa vùng. Chỉ đọc nến ≤ breakoutIndex.
export function rectangleStopRef(c: Candle[], g: PatternGeometry, side: 'up' | 'down', breakoutIndex: number, atr: number[]): { price: number; note: string } {
  if (g.kind !== 'rectangle') throw new Error(`rectangleStopRef: chỉ cho chữ nhật, nhận ${g.kind}`);
  if (!Number.isInteger(breakoutIndex) || breakoutIndex < 0 || breakoutIndex >= c.length) {
    throw new Error(`rectangleStopRef: nến phá ${breakoutIndex} ngoài dữ liệu (${c.length} nến)`);
  }
  const A = atr[breakoutIndex];
  if (A === undefined || !Number.isFinite(A) || A <= 0) throw new Error(`rectangleStopRef: ATR không hợp lệ tại nến phá ${breakoutIndex}: ${A}`);
  const minGap = COMMON.patterns.rect.innerMinAtr * A;
  const upper = g.upper(g.endIndex);
  const lower = g.lower(g.endIndex);
  const mid = (upper + lower) / 2;
  const edge = side === 'up' ? 'high' : 'low';
  const touches = g.pivots.filter((p) => p.kind === edge);
  const lastTouch = touches[touches.length - 1];
  if (!lastTouch) throw new Error('rectangleStopRef: mô hình không có lần chạm biên bị phá');
  const touchIdx = new Set(g.pivots.map((p) => p.index));
  const seen = c.slice(0, breakoutIndex + 1);
  const n = COMMON.pivotConfirmBars;
  const idx = side === 'up' ? pivotLows(seen.map((k) => k.low), n) : pivotHighs(seen.map((k) => k.high), n);
  const priceAt = (i: number) => (side === 'up' ? c[i]!.low : c[i]!.high);
  const gapOk = (i: number) => (side === 'up' ? upper - priceAt(i) : priceAt(i) - lower) >= minGap - 1e-9; // không dùng gợn sát biên
  const inner = idx.filter((i) => i > lastTouch.index && !touchIdx.has(i) && priceAt(i) > lower && priceAt(i) < upper && gapOk(i));
  const pick = inner[inner.length - 1];
  if (pick === undefined) return { price: mid, note: 'SL chữ nhật: không có pivot nhỏ phía trong sau lần chạm cuối → giữa vùng' };
  return { price: priceAt(pick), note: `SL chữ nhật: pivot nhỏ phía trong ${priceAt(pick)} (nến ${pick}) sau lần chạm biên cuối` };
}
