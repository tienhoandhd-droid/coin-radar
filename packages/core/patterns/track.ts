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
// Mọi bản phát đều từ cùng mảng c (đã là tiền tố); trạng thái của bản hiện tại xét tại nến bản kế tiếp được biết (evaluateState cắt tới đó).
function selectEmission(group: PatternGeometry[], c: Candle[], a: number[], tf: PatternTf): PatternGeometry {
  let cur = group[0]!;
  for (let k = 1; k < group.length; k++) {
    const next = group[k]!;
    const at = knownAt(next);
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
// asOf (mặc định nến cuối): CẮT mảng về c[0..asOf] rồi mới tính (ATR, pivot, hình học tính lại trên tiền tố).
// Không đọc mảng dài hơn rồi lọc: swingPivots thay pivot cuối bằng pivot tương lai cực hơn, nên "lọc theo asOf" vẫn nhìn trước
// tương lai (rà soát cuối 1c, B1: ETHUSDT 4H lệch tiền tố ở 8/399 mốc). Kết quả == trackPatterns(c.slice(0, asOf + 1)).
// Trả về mọi mô hình sau khử trùng (kể cả đã kết thúc); người gọi lọc bằng isTracked.
export function trackPatterns(symbol: string, full: Candle[], tf: PatternTf, kinds: readonly DetectorName[], asOf: number = full.length - 1): TrackedPattern[] {
  const P = COMMON.patterns;
  if (full.length === 0) return [];
  if (!Number.isInteger(asOf) || asOf < 0 || asOf >= full.length) throw new Error(`trackPatterns: asOf ${asOf} ngoài phạm vi 0..${full.length - 1}`);
  const c = asOf === full.length - 1 ? full : full.slice(0, asOf + 1);
  const a = atr(c, P.atrPeriod);
  const pv = swingPivots(c, a, P.minSwingAtr[tf]);
  const geoms: PatternGeometry[] = [];
  if (kinds.includes('rectangle')) geoms.push(...detectRectangles(c, pv, a, tf));
  if (kinds.includes('double')) geoms.push(...detectDoubles(c, pv, a, tf));
  if (kinds.includes('triangle')) geoms.push(...detectTriangles(c, pv, a, tf));
  if (kinds.includes('flag')) geoms.push(...detectFlags(c, a, tf));
  const byId = new Map<string, PatternGeometry[]>();
  for (const g of geoms) {
    if (knownAt(g) > c.length - 1) continue; // chưa xác nhận trong dữ liệu hiện có
    const id = patternId(symbol, g, c);
    byId.set(id, [...(byId.get(id) ?? []), g]);
  }
  const items = [...byId.entries()].map(([id, group]) => {
    const sorted = [...group].sort((x, y) => knownAt(x) - knownAt(y) || x.endIndex - y.endIndex);
    const g = selectEmission(sorted, c, a, tf);
    return { id, geometry: g, result: evaluateState(g, c, a, tf), atr: a };
  });
  return dedupePatterns(items);
}
