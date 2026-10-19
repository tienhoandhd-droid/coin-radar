import type { Candle } from '../types.ts';
import { COMMON } from '../config.ts';
import { atr } from '../indicators.ts';
import { swingPivots } from './pivots.ts';
import { detectRectangles } from './detect-range.ts';
import { detectDoubles } from './detect-double.ts';
import { detectTriangles } from './detect-triangle.ts';
import { detectFlags } from './detect-flag.ts';
import { evaluateState, dedupePatterns, patternId, type StateResult } from './state.ts';
import type { PatternGeometry } from './types.ts';

export type DetectorName = 'rectangle' | 'double' | 'triangle' | 'flag';
export type PatternTf = '15m' | '1h' | '4h' | '1d';
export type TrackedPattern = { id: string; geometry: PatternGeometry; result: StateResult; atr: number[] };

// Còn đáng theo dõi: chưa kết thúc (armed / chờ xác nhận / đã phá / đã retest) và tín hiệu chưa cũ.
export function isTracked(r: StateResult): boolean {
  const live = r.state === 'forming' || r.state === 'armed' || r.state === 'breakout_pending' || r.state === 'breakout' || r.state === 'retested';
  return live && !r.signalStale;
}

// Chạy các bộ nhận diện trên nến ĐÃ ĐÓNG của một khung, rồi:
//  1) mỗi id (patternId) chỉ giữ bản hình học phát SỚM NHẤT (endIndex nhỏ nhất) — bản phát lại sau không được ghi đè;
//  2) tính trạng thái tại nến cuối từ chính bản đó;
//  3) dedupePatterns: mỗi (loại, khung) chỉ một mô hình trong các cửa sổ chồng nhau.
// Trả về mọi mô hình sau khử trùng (kể cả đã kết thúc); người gọi lọc bằng isTracked.
export function trackPatterns(symbol: string, c: Candle[], tf: PatternTf, kinds: readonly DetectorName[]): TrackedPattern[] {
  const P = COMMON.patterns;
  if (c.length === 0) return [];
  const a = atr(c, P.atrPeriod);
  const pv = swingPivots(c, a, P.minSwingAtr[tf]);
  const geoms: PatternGeometry[] = [];
  if (kinds.includes('rectangle')) geoms.push(...detectRectangles(c, pv, a, tf));
  if (kinds.includes('double')) geoms.push(...detectDoubles(c, pv, a, tf));
  if (kinds.includes('triangle')) geoms.push(...detectTriangles(c, pv, a, tf));
  if (kinds.includes('flag')) geoms.push(...detectFlags(c, a, tf));
  const first = new Map<string, PatternGeometry>();
  for (const g of geoms) {
    const id = patternId(symbol, g);
    const prev = first.get(id);
    if (!prev || g.endIndex < prev.endIndex) first.set(id, g);
  }
  const items = [...first.entries()].map(([id, g]) => ({ id, geometry: g, result: evaluateState(g, c, a, tf), atr: a }));
  return dedupePatterns(items);
}
