import type { Candle } from '../types.ts';
import { COMMON } from '../config.ts';
import type { Pivot } from './pivots.ts';
import type { PatternGeometry } from './types.ts';
import { atrAtConfirm } from './detect-range.ts';

// Vai-đầu-vai đỉnh (và ngược: lật dấu). Năm pivot liền nhau P1..P5, A lấy tại nến xác nhận P5.
// - Chỉ phát khi P5 đã CHẮC CHẮN: phải có pivot ngược chiều đứng sau P5. Pivot cuối của swingPivots
//   còn có thể bị thay bằng pivot cực hơn cùng loại, nên P5 là pivot cuối thì chưa phát (không vẽ lại).
// - ema200[i] là EMA tại đúng nến i (chỉ dùng nến ≤ i); chưa đủ dữ liệu (không hữu hạn) → không phát, không đoán.
export function detectHeadShoulders(c: Candle[], pivots: Pivot[], atr: number[], ema200: number[], timeframe = ''): PatternGeometry[] {
  if (ema200.length !== c.length) throw new Error(`độ dài EMA (${ema200.length}) khác độ dài nến (${c.length})`);
  const cfg = COMMON.patterns.hs;
  const out: PatternGeometry[] = [];
  for (let j = 4; j + 1 < pivots.length; j++) {
    const [p1, p2, p3, p4, p5] = pivots.slice(j - 4, j + 1) as [Pivot, Pivot, Pivot, Pivot, Pivot];
    if (p1.kind !== p3.kind || p3.kind !== p5.kind || p2.kind === p1.kind || p4.kind === p1.kind) continue;
    const top = p1.kind === 'high';
    const s = top ? 1 : -1; // s×giá: đỉnh thành "cao hơn là cực hơn"
    const a = atrAtConfirm(c, atr, p5);
    if (p5.index - p1.index < cfg.minBars || p5.index - p1.index > cfg.maxBars) continue;
    if (!(s * p3.price > s * p1.price && s * p3.price > s * p5.price)) continue;

    const slope = (p4.price - p2.price) / (p4.index - p2.index);
    const neck = (i: number) => p2.price + slope * (i - p2.index);
    if (Math.abs(p1.price - p5.price) > cfg.shoulderTolAtr * a) continue;
    if (Math.abs(p2.price - p4.price) > cfg.neckTolAtr * a && Math.abs(slope) > cfg.neckSlopeAtr * a) continue;

    const headH = s * (p3.price - neck(p3.index));
    if (headH < cfg.headMinAtr * a) continue;
    const shoulderH = (s * (p1.price - neck(p1.index)) + s * (p5.price - neck(p5.index))) / 2;
    const ratio = shoulderH / headH;
    if (ratio < cfg.shoulderMinRatio || ratio > cfg.shoulderMaxRatio) continue;

    const left = p3.index - p1.index;
    const right = p5.index - p3.index;
    if (Math.max(left / right, right / left) > cfg.symmetryMax) continue;

    let onSide = 0;
    let missing = false;
    for (const p of [p1, p2, p3, p4, p5]) {
      const e = ema200[p.index]!;
      if (!Number.isFinite(e)) {
        missing = true;
        break;
      }
      if (s * p.price > s * e) onSide++;
    }
    if (missing || onSide < cfg.minOnTrendSide) continue;

    const head = p3.price;
    const neckAtP5 = neck(p5.index);
    out.push({
      kind: top ? 'head_shoulders' : 'inv_head_shoulders',
      timeframe,
      pivots: [p1, p2, p3, p4, p5],
      startIndex: p1.index,
      endIndex: p5.index,
      upper: top ? () => head : neck,
      lower: top ? neck : () => head,
      breakoutSide: top ? 'down' : 'up',
      height: headH,
      stopRef: top ? { up: neckAtP5, down: p5.price } : { up: p5.price, down: neckAtP5 },
      quality: Math.max(0, Math.min(1, 1 - Math.abs(p1.price - p5.price) / (cfg.shoulderTolAtr * a))) * 0.5 + Math.min(1, headH / (2 * cfg.headMinAtr * a)) * 0.5,
      notes: [],
    });
  }
  return out;
}

export type HsState = 'forming' | 'confirmed' | 'invalidated' | 'expired';
export type HsStatus = { state: HsState; confirmedAt: number | null };

// Trạng thái của một vai-đầu-vai tại nến atIndex. Duyệt tuần tự các nến SAU P5 đến atIndex (gồm cả atIndex)
// và KHÔNG đọc nến nào sau atIndex:
//  - nến vượt đầu → hết hiệu lực; đóng ngoài neckline (đỉnh: dưới; ngược: trên) → xác nhận;
//  - quá waitBars kể từ P5 mà chưa xác nhận, hoặc quá activeBars kể từ xác nhận → hết hạn.
export function hsStatus(c: Candle[], g: PatternGeometry, atIndex: number): HsStatus {
  const cfg = COMMON.patterns.hs;
  if (g.kind !== 'head_shoulders' && g.kind !== 'inv_head_shoulders') throw new Error(`hsStatus: không phải vai-đầu-vai (${g.kind})`);
  if (!Number.isInteger(atIndex) || atIndex >= c.length) throw new Error(`hsStatus: atIndex ${atIndex} ngoài dữ liệu (${c.length} nến)`);
  const p5 = g.pivots[4]!;
  if (atIndex < p5.index) throw new Error(`hsStatus: atIndex ${atIndex} trước vai phải ${p5.index}`);
  const top = g.kind === 'head_shoulders';
  const head = g.pivots[2]!.price;
  const neck = top ? g.lower : g.upper;
  let confirmedAt: number | null = null;
  for (let i = p5.index + 1; i <= atIndex; i++) {
    const b = c[i]!;
    if (top ? b.high > head : b.low < head) return { state: 'invalidated', confirmedAt };
    if (confirmedAt === null) {
      if (top ? b.close < neck(i) : b.close > neck(i)) confirmedAt = i;
      else if (i - p5.index > cfg.waitBars) return { state: 'expired', confirmedAt: null };
    } else if (i - confirmedAt > cfg.activeBars) {
      return { state: 'expired', confirmedAt };
    }
  }
  return { state: confirmedAt === null ? 'forming' : 'confirmed', confirmedAt };
}
