import type { Candle } from '../types.ts';
import { COMMON } from '../config.ts';
import { atr, ema } from '../indicators.ts';
import { swingPivots } from './pivots.ts';
import type { Pivot } from './pivots.ts';
import type { PatternGeometry } from './types.ts';
import { detectRectangles } from './detect-range.ts';
import { detectHeadShoulders, hsStatus } from './detect-hs.ts';

// ---------- Vùng nhiều tháng (1D) ----------

// Giống chữ nhật nhưng ≥3 chạm mỗi biên và ≥60 nến. Chỉ nhận vùng có pivot cuối đã CHẮC CHẮN
// (sau nó còn pivot khác): pivot cuối của swingPivots có thể bị thay bằng pivot cực hơn, không vẽ lại.
export function detectMultiMonth(c: Candle[], pivots: Pivot[], atrArr: number[], timeframe = '1d'): PatternGeometry[] {
  if (pivots.length === 0) return [];
  const lastIndex = pivots[pivots.length - 1]!.index;
  return detectRectangles(c, pivots, atrArr, timeframe, COMMON.patterns.multiMonth)
    .filter((g) => g.endIndex < lastIndex)
    .map((g): PatternGeometry => ({ ...g, kind: 'multi_month_range', breakoutSide: 'both' }));
}

export type MultiMonthState = 'inside' | 'broken_up' | 'broken_down';
export type MultiMonthStatus = { state: MultiMonthState; brokenAt: number | null };

// Trạng thái vùng tại nến atIndex (1D). Duyệt tuần tự nến sau pivot cuối đến atIndex (gồm atIndex), không đọc xa hơn:
// phá khi đóng ngoài biên ≥ confirmAtr×A(1D tại nến đó), hoặc confirmCloses nến liên tiếp đóng ngoài cùng một phía.
export function multiMonthStatus(c: Candle[], atrArr: number[], g: PatternGeometry, atIndex: number): MultiMonthStatus {
  const cfg = COMMON.patterns.multiMonth;
  if (atrArr.length !== c.length) throw new Error(`độ dài atr (${atrArr.length}) khác độ dài nến (${c.length})`);
  if (!Number.isInteger(atIndex) || atIndex >= c.length) throw new Error(`multiMonthStatus: atIndex ${atIndex} ngoài dữ liệu (${c.length} nến)`);
  const upper = g.upper(g.endIndex);
  const lower = g.lower(g.endIndex);
  let up = 0;
  let down = 0;
  for (let i = g.endIndex + 1; i <= atIndex; i++) {
    const a = atrArr[i]!;
    if (!Number.isFinite(a) || a <= 0) throw new Error(`ATR không hợp lệ tại nến ${i}: ${a}`);
    const cl = c[i]!.close;
    up = cl > upper ? up + 1 : 0;
    down = cl < lower ? down + 1 : 0;
    if (cl >= upper + cfg.confirmAtr * a || up >= cfg.confirmCloses) return { state: 'broken_up', brokenAt: i };
    if (cl <= lower - cfg.confirmAtr * a || down >= cfg.confirmCloses) return { state: 'broken_down', brokenAt: i };
  }
  return { state: 'inside', brokenAt: null };
}

// ---------- Coil (nén biến động) ----------

export type CoilResult = { on: boolean; hits: string[] };

// Ba chỉ báo tại nến i, chỉ dùng nến đã đóng ≤ i; thiếu dữ liệu thì chỉ báo đó coi là không bật (không đoán).
//  1) BBW(20,2) ≤ phân vị 10% của 125 BBW gần nhất (gồm nến i);  2) NR7 hoặc NR4;  3) ATR14/ATR100 ≤ 0,7.
export function coilAt(c: Candle[], i: number): CoilResult {
  const cfg = COMMON.patterns.coil;
  if (!Number.isInteger(i) || i < 0 || i >= c.length) throw new Error(`coilAt: nến ${i} ngoài dữ liệu (${c.length} nến)`);
  const hits: string[] = [];

  const bbw = (end: number): number => {
    let sum = 0;
    for (let q = end - cfg.bbPeriod + 1; q <= end; q++) sum += c[q]!.close;
    const mean = sum / cfg.bbPeriod;
    let v = 0;
    for (let q = end - cfg.bbPeriod + 1; q <= end; q++) v += (c[q]!.close - mean) ** 2;
    return mean > 0 ? (2 * cfg.bbK * Math.sqrt(v / cfg.bbPeriod)) / mean : NaN; // độ lệch chuẩn tổng thể, như Bollinger chuẩn
  };
  if (i - cfg.bbWindow + 1 - (cfg.bbPeriod - 1) >= 0) {
    const win: number[] = [];
    for (let q = i - cfg.bbWindow + 1; q <= i; q++) win.push(bbw(q));
    if (win.every((x) => Number.isFinite(x))) {
      const sorted = [...win].sort((x, y) => x - y);
      const cut = sorted[Math.floor(((cfg.bbPercentile / 100) * (sorted.length - 1)))]!;
      if (win[win.length - 1]! <= cut) hits.push(`BBW(${cfg.bbPeriod},${cfg.bbK}) ≤ phân vị ${cfg.bbPercentile}% của ${cfg.bbWindow} nến`);
    }
  }

  const range = (q: number) => c[q]!.high - c[q]!.low;
  const narrowest = (n: number) => {
    if (i - n + 1 < 0) return false;
    for (let q = i - n + 1; q < i; q++) if (range(i) >= range(q)) return false;
    return true;
  };
  if (narrowest(cfg.nrWide)) hits.push(`NR${cfg.nrWide}`);
  else if (narrowest(cfg.nrNarrow)) hits.push(`NR${cfg.nrNarrow}`);

  if (i + 1 >= cfg.atrSlow) {
    const s = c.slice(0, i + 1);
    const fast = atr(s, cfg.atrFast)[i]!;
    const slow = atr(s, cfg.atrSlow)[i]!;
    if (Number.isFinite(fast) && Number.isFinite(slow) && slow > 0 && fast / slow <= cfg.atrRatioMax) {
      hits.push(`ATR${cfg.atrFast}/ATR${cfg.atrSlow} ≤ ${cfg.atrRatioMax}`);
    }
  }
  return { on: hits.length >= cfg.minHits, hits };
}

// ---------- Gộp bối cảnh ----------

export type HsContext = {
  kind: 'head_shoulders' | 'inv_head_shoulders';
  timeframe: string;
  state: 'forming' | 'confirmed';
  neckline: number; // giá neckline tại nến cuối
  head: number;
  endIndex: number;
};
export type MultiMonthContext = { upper: number; lower: number; state: MultiMonthState };
export type ContextFlags = {
  hs: HsContext | null;
  multiMonth: MultiMonthContext | null;
  coil: boolean;
  // Chặn lệnh MỚI theo bối cảnh: long = cấm Long, short = cấm Short.
  block: { long: boolean; short: boolean };
  notes: string[];
};

// Bối cảnh tại nến cuối đã đóng của mỗi khung. c4h: khung vào lệnh (vai-đầu-vai 4H, giá hiện tại, coil); c1d: khung ngày
// (vai-đầu-vai 1D, vùng nhiều tháng). Quy tắc dùng:
//  - cấm Long khi giá ngay dưới biên trên vùng nhiều tháng chưa phá (trong nearAtr×A(1D)); cấm Short ngay trên biên dưới;
//  - vai-đầu-vai đỉnh đã xác nhận → cấm Long mới; ngược lại cấm Short mới. Coil chỉ là cờ báo, không chặn.
export function contextFlags(c4h: Candle[], c1d: Candle[]): ContextFlags {
  if (c4h.length === 0) throw new Error('contextFlags: chuỗi nến 4H rỗng');
  const notes: string[] = [];
  const block = { long: false, short: false };
  const price = c4h[c4h.length - 1]!.close;
  const P = COMMON.patterns;

  // Vai-đầu-vai: ưu tiên đã xác nhận, rồi khung lớn, rồi mới nhất. Giữ thêm bản tốt nhất của TỪNG khung
  // để phát hiện 4H và 1D đã xác nhận NGƯỢC nhau (khi đó chặn cả hai chiều, ghi "xung đột bối cảnh").
  let hs: HsContext | null = null;
  let hsRank = -1;
  const confirmedByTf = new Map<string, HsContext>();
  for (const [tf, c, key] of [['1d', c1d, '1d'], ['4h', c4h, '4h']] as const) {
    if (c.length === 0) continue;
    const a = atr(c, P.atrPeriod);
    const pv = swingPivots(c, a, P.minSwingAtr[key]);
    const e = ema(c.map((x) => x.close), P.hs.emaPeriod);
    for (const g of detectHeadShoulders(c, pv, a, e, tf)) {
      const st = hsStatus(c, g, c.length - 1);
      if (st.state !== 'forming' && st.state !== 'confirmed') continue;
      const top = g.kind === 'head_shoulders';
      const item: HsContext = {
        kind: g.kind as HsContext['kind'],
        timeframe: tf,
        state: st.state,
        neckline: (top ? g.lower : g.upper)(c.length - 1),
        head: g.pivots[2]!.price,
        endIndex: g.endIndex,
      };
      if (st.state === 'confirmed') {
        const prev = confirmedByTf.get(tf);
        if (!prev || g.endIndex > prev.endIndex) confirmedByTf.set(tf, item);
      }
      const rank = (st.state === 'confirmed' ? 4_000_000 : 0) + (tf === '1d' ? 2_000_000 : 0) + g.endIndex;
      if (rank <= hsRank) continue;
      hsRank = rank;
      hs = item;
    }
  }
  const hs1d = confirmedByTf.get('1d');
  const hs4h = confirmedByTf.get('4h');
  const nameOf = (x: HsContext) => (x.kind === 'head_shoulders' ? 'vai-đầu-vai đỉnh' : 'vai-đầu-vai ngược');
  if (hs1d && hs4h && hs1d.kind !== hs4h.kind) {
    block.long = true;
    block.short = true;
    notes.push(`xung đột bối cảnh: ${nameOf(hs4h)} 4H và ${nameOf(hs1d)} 1D cùng đã xác nhận → chặn cả Long và Short mới`);
  } else if (hs) {
    const top = hs.kind === 'head_shoulders';
    const name = nameOf(hs);
    if (hs.state === 'confirmed') {
      if (top) block.long = true;
      else block.short = true;
      notes.push(`${name} ${hs.timeframe} đã xác nhận (đóng thủng neckline) → chặn ${top ? 'Long' : 'Short'} mới`);
    } else {
      notes.push(`${name} ${hs.timeframe} đang hình thành (chưa thủng neckline) — chỉ cảnh báo`);
    }
  }

  // Vùng nhiều tháng trên 1D.
  let multiMonth: MultiMonthContext | null = null;
  if (c1d.length > 0) {
    const a1 = atr(c1d, P.atrPeriod);
    const ranges = detectMultiMonth(c1d, swingPivots(c1d, a1, P.minSwingAtr['1d']), a1, '1d');
    const g = ranges[ranges.length - 1];
    if (g) {
      const st = multiMonthStatus(c1d, a1, g, c1d.length - 1);
      const upper = g.upper(g.endIndex);
      const lower = g.lower(g.endIndex);
      multiMonth = { upper, lower, state: st.state };
      const a = a1[c1d.length - 1]!;
      if (st.state === 'inside' && Number.isFinite(a)) {
        const near = P.multiMonth.nearAtr * a;
        if (price <= upper && upper - price <= near) {
          block.long = true;
          notes.push(`giá ngay dưới biên trên vùng nhiều tháng chưa phá (${upper}) → cấm Long`);
        }
        if (price >= lower && price - lower <= near) {
          block.short = true;
          notes.push(`giá ngay trên biên dưới vùng nhiều tháng chưa phá (${lower}) → cấm Short`);
        }
      }
    }
  }

  const coil = coilAt(c4h, c4h.length - 1);
  if (coil.on) notes.push(`coil (nén biến động): ${coil.hits.join('; ')}`);
  return { hs, multiMonth, coil: coil.on, block, notes };
}
