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

// Nến mà tại đó bản phát được biết (đã xác nhận): cờ = nến e (endIndex); loại khác = pivot cuối + pivotConfirmBars.
export function knownAt(g: PatternGeometry): number {
  return g.kind === 'bull_flag' || g.kind === 'bear_flag' ? g.endIndex : g.endIndex + COMMON.pivotConfirmBars;
}

// Chọn MỘT bản phát cho mỗi id (id giữ theo 2 pivot đầu). Đi theo thứ tự nến được biết:
//  - bản hiện tại còn forming/armed hoặc chỉ hết hạn theo thời gian (expired) tại lúc bản kế tiếp được biết → bản kế tiếp THAY
//    (hình học mở rộng: thêm chạm, dài hơn; hạn tính theo thời lượng mới);
//  - bản hiện tại đã breakout_pending / breakout / retested / failed / invalidated → ĐÓNG BĂNG, bỏ mọi bản sau (cờ không phát lại).
// Chỉ dùng bản phát đã được biết ≤ asOf và trạng thái tính ≤ asOf → không look-ahead.
function selectEmission(group: PatternGeometry[], c: Candle[], a: number[], tf: PatternTf, asOf: number): PatternGeometry {
  let cur = group[0]!;
  for (let k = 1; k < group.length; k++) {
    const next = group[k]!;
    const at = knownAt(next);
    if (at > asOf) break;
    const st = evaluateState(cur, c, a, tf, at).state;
    if (st !== 'forming' && st !== 'armed' && st !== 'expired') break;
    cur = next;
  }
  return cur;
}

// Chạy các bộ nhận diện trên nến ĐÃ ĐÓNG của một khung, rồi:
//  1) mỗi id (patternId) chọn một bản phát bằng selectEmission;
//  2) tính trạng thái tại asOf từ chính bản đó;
//  3) dedupePatterns: mỗi (họ mô hình, khung) chỉ một mô hình trong các cửa sổ chồng nhau.
// asOf (mặc định nến cuối): chỉ dùng thông tin ≤ asOf — để kiểm "tiền tố == cả chuỗi tại asOf".
// Trả về mọi mô hình sau khử trùng (kể cả đã kết thúc); người gọi lọc bằng isTracked.
export function trackPatterns(symbol: string, c: Candle[], tf: PatternTf, kinds: readonly DetectorName[], asOf: number = c.length - 1): TrackedPattern[] {
  const P = COMMON.patterns;
  if (c.length === 0) return [];
  if (!Number.isInteger(asOf) || asOf < 0 || asOf >= c.length) throw new Error(`trackPatterns: asOf ${asOf} ngoài phạm vi 0..${c.length - 1}`);
  const a = atr(c, P.atrPeriod);
  const pv = swingPivots(c, a, P.minSwingAtr[tf]);
  const geoms: PatternGeometry[] = [];
  if (kinds.includes('rectangle')) geoms.push(...detectRectangles(c, pv, a, tf));
  if (kinds.includes('double')) geoms.push(...detectDoubles(c, pv, a, tf));
  if (kinds.includes('triangle')) geoms.push(...detectTriangles(c, pv, a, tf));
  if (kinds.includes('flag')) geoms.push(...detectFlags(c, a, tf));
  const byId = new Map<string, PatternGeometry[]>();
  for (const g of geoms) {
    if (knownAt(g) > asOf) continue;
    const id = patternId(symbol, g);
    byId.set(id, [...(byId.get(id) ?? []), g]);
  }
  const items = [...byId.entries()].map(([id, group]) => {
    const sorted = [...group].sort((x, y) => knownAt(x) - knownAt(y) || x.endIndex - y.endIndex);
    const g = selectEmission(sorted, c, a, tf, asOf);
    return { id, geometry: g, result: evaluateState(g, c, a, tf, asOf), atr: a };
  });
  return dedupePatterns(items);
}
