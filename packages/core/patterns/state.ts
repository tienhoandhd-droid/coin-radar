import type { Candle } from '../types.ts';
import { COMMON } from '../config.ts';
import type { PatternGeometry } from './types.ts';

// target_hit: sau phá, giá đã chạm T_ngắn (patternTargets từ mức phá cố định) — lần phá này đã "chạy xong", không lập lệnh mới.
export type PatternState = 'forming' | 'armed' | 'breakout_pending' | 'breakout' | 'retested' | 'failed' | 'target_hit' | 'expired' | 'invalidated';

export type StateResult = {
  state: PatternState;
  breakoutIndex: number | null;
  side: 'up' | 'down' | null;
  breakoutLine: number | null;
  distanceAtr: number | null; // khoảng cách đóng cửa nến cuối so với đường phá (×A), dương = ngoài mô hình
  retest: 'none' | 'yes' | null;
  notes: string[];
  signalStale: boolean; // breakout/retested đã cũ hơn COMMON.patterns.maxSignalAgeBars nến → không lập kế hoạch lệnh
  inBreakoutWindow: boolean | null; // tam giác: phá trong 50–80% quãng tới apex (điều kiện dùng); null nếu không phải tam giác hoặc chưa phá
};

// Định danh ổn định giữa các lần quét (không cần thư viện hash): mã | khung | loại | openTime (ms) nến của 2 pivot đầu.
// Dùng THỜI GIAN, không dùng chỉ số mảng: cửa sổ nến trượt mỗi lần quét nên chỉ số đổi, thời gian thì không (rà soát cuối 1c, B2).
export function patternId(symbol: string, g: PatternGeometry, c: Candle[]): string {
  const p1 = g.pivots[0];
  const p2 = g.pivots[1];
  if (!p1 || !p2) throw new Error(`mô hình ${g.kind} thiếu pivot để tạo id`);
  const t1 = c[p1.index]?.openTime;
  const t2 = c[p2.index]?.openTime;
  if (t1 === undefined || t2 === undefined) throw new Error(`mô hình ${g.kind}: pivot ${p1.index}/${p2.index} ngoài dữ liệu (${c.length} nến)`);
  return `${symbol}|${g.timeframe}|${g.kind}|${t1}|${t2}`;
}

// MỘT hàm mức dừng cho cả máy trạng thái (failed do chạm cắt lỗ) và kế hoạch lệnh (SL trước làm tròn tick / đẩy qua số tròn):
// mức tham chiếu (geometry.stopAt nếu có — chữ nhật: pivot nhỏ phía trong —, không thì stopRef) ∓ stopBufferAtr × ATR tại NẾN PHÁ.
// Chỉ đọc nến/ATR ≤ breakoutIndex. Kế hoạch chỉ đẩy SL RA XA hơn mức này (tick, số tròn), nên lệnh chạm SL ⇒ trạng thái đã failed.
export function patternStopLevel(g: PatternGeometry, c: Candle[], atr: number[], side: 'up' | 'down', breakoutIndex: number): { ref: number; level: number; atr: number; note: string | null } {
  const a = atr[breakoutIndex];
  if (a === undefined || !Number.isFinite(a) || a <= 0) throw new Error(`patternStopLevel: ATR không hợp lệ tại nến phá ${breakoutIndex}: ${a}`);
  const r = g.stopAt ? g.stopAt(c, side, breakoutIndex) : { price: side === 'up' ? g.stopRef.up : g.stopRef.down, note: null };
  const dir = side === 'up' ? 1 : -1;
  return { ref: r.price, level: r.price - dir * COMMON.patterns.plan.stopBufferAtr * a, atr: a, note: r.note };
}

// MỘT hàm "mức phá" sau phá vỡ cho cả máy trạng thái (failed / retest / d) và kế hoạch lệnh (d, giá limit, SL sau TP1):
// giá trị đường phá TẠI NẾN PHÁ, cố định từ đó về sau. Đường nghiêng (cờ, tam giác) KHÔNG kéo dài sau nến phá — kéo dài làm
// "đường" trôi ngược chiều lệnh (cờ giảm: đường dưới dốc lên) và đẩy giá limit vào phía vô hiệu của mô hình (rà soát cuối 1c, M1).
export function breakoutLevel(g: PatternGeometry, side: 'up' | 'down', breakoutIndex: number): number {
  const v = side === 'up' ? g.upper(breakoutIndex) : g.lower(breakoutIndex);
  if (!Number.isFinite(v)) throw new Error(`breakoutLevel: mức phá không hợp lệ tại nến ${breakoutIndex}: ${v}`);
  return v;
}

// MỘT hàm mục tiêu cho kế hoạch lệnh (T_ngắn/T_đủ, trước làm tròn tick) và máy trạng thái (target_hit), tính từ MỨC PHÁ CỐ ĐỊNH.
// Cờ: T_đủ = đáy cờ (Long) / đỉnh cờ (Short) ± cán × flagPoleRatio; T_ngắn = mức phá + flagShortFraction × (T_đủ − mức phá).
// Loại khác: T_ngắn = mức phá ± h × p (p theo loại, Bulkowski), T_đủ = mức phá ± h. Đề xuất, chưa backtest.
export function patternTargets(g: PatternGeometry, side: 'up' | 'down', level: number): { short: number; full: number } {
  const P = COMMON.patterns.plan;
  const dir = side === 'up' ? 1 : -1;
  if (g.kind === 'bull_flag' || g.kind === 'bear_flag') {
    const full = (side === 'up' ? g.stopRef.up : g.stopRef.down) + dir * P.flagPoleRatio * g.height;
    return { short: level + P.flagShortFraction * (full - level), full };
  }
  const ratio = (P.targetRatio as Partial<Record<PatternGeometry['kind'], number>>)[g.kind] ?? P.defaultTargetRatio;
  return { short: level + dir * g.height * ratio, full: level + dir * g.height };
}

const EPS = 1e-9; // sai số làm tròn khi so với apex tính bằng số thực
const isFlag = (g: PatternGeometry) => g.kind === 'bull_flag' || g.kind === 'bear_flag';
const isTriangle = (g: PatternGeometry) => g.kind === 'asc_triangle' || g.kind === 'desc_triangle' || g.kind === 'sym_triangle';

// Vị trí (theo chỉ số nến) hai đường cắt nhau; null nếu không hội tụ.
function apexIndex(g: PatternGeometry): number | null {
  const x = g.startIndex;
  const d0 = g.upper(x) - g.lower(x);
  const d1 = g.upper(x + 1) - g.lower(x + 1);
  if (!(d1 < d0)) return null;
  return x + d0 / (d0 - d1);
}

// Chạy lại từ các nến ĐÃ ĐÓNG: quyết định tại nến i chỉ dùng nến ≤ i (c[c.length-1] là nến mới nhất).
// Mô hình thường: biết khi pivot cuối được xác nhận (endIndex + pivotConfirmBars), nến phá vỡ xét từ nến kế tiếp.
// Cờ: endIndex là nến e, có thể chính là nến phá vỡ nên xét từ endIndex.
// asOf (mặc định = nến cuối): CẮT nến và ATR về [0..asOf] rồi mới chạy, nên kết quả == chạy trên tiền tố với CÙNG hình học
// (ATR Wilder chỉ phụ thuộc nến ≤ i, nên cắt ATR == tính lại ATR trên tiền tố — có bài kiểm dữ liệu thật trong track.test.ts).
// Lưu ý: hình học phải lấy từ chính tiền tố (trackPatterns cắt mảng); hình học từ mảng dài hơn có thể chứa pivot tương lai.
export function evaluateState(g: PatternGeometry, full: Candle[], fullAtr: number[], tf: string, asOf: number = full.length - 1): StateResult {
  const cfg = COMMON.patterns.state;
  const confirmAtr = (cfg.confirmAtr as Record<string, number>)[tf];
  if (confirmAtr === undefined) throw new Error(`khung không hỗ trợ: ${tf}`);
  if (fullAtr.length !== full.length) throw new Error(`độ dài atr (${fullAtr.length}) khác độ dài nến (${full.length})`);
  if (!Number.isInteger(asOf) || asOf < 0 || asOf >= full.length) throw new Error(`asOf ${asOf} ngoài phạm vi 0..${full.length - 1}`);
  const c = asOf === full.length - 1 ? full : full.slice(0, asOf + 1);
  const atr = asOf === fullAtr.length - 1 ? fullAtr : fullAtr.slice(0, asOf + 1);
  const last = asOf;
  const flag = isFlag(g);
  const armedFrom = flag ? g.endIndex : g.endIndex + COMMON.pivotConfirmBars;
  const out = (state: PatternState, extra: Partial<StateResult> = {}): StateResult => ({
    state, breakoutIndex: null, side: null, breakoutLine: null, distanceAtr: null, retest: null, notes: [], signalStale: false, inBreakoutWindow: null, ...extra,
  });
  if (last < armedFrom) return out('forming');

  const apex = isTriangle(g) ? apexIndex(g) : null;
  const duration = g.endIndex - g.startIndex;
  const tipIndex = flag ? g.pivots[1]!.index : -1;
  const canUp = g.breakoutSide !== 'down';
  const canDown = g.breakoutSide !== 'up';
  // Trước phá: khoảng cách đóng cửa ngoài đường phá tại CHÍNH nến đang xét (đường nghiêng thì theo nến đó), dương = ngoài mô hình.
  const outside = (side: 'up' | 'down', i: number) => (side === 'up' ? c[i]!.close - g.upper(i) : g.lower(i) - c[i]!.close);
  const atrAt = (i: number) => {
    const a = atr[i]!;
    if (!Number.isFinite(a) || a <= 0) throw new Error(`ATR không hợp lệ tại nến ${i}: ${a}`);
    return a;
  };
  const startIdx = flag ? armedFrom : armedFrom + 1; // nến đầu tiên có thể là nến phá vỡ

  let pending: 'up' | 'down' | null = null;
  let side: 'up' | 'down' | null = null;
  let bi = -1;
  let stopLevel = NaN; // mức dừng (cùng hàm với kế hoạch lệnh), tính một lần tại nến phá
  let level = NaN; // mức phá cố định (breakoutLevel), tính một lần tại nến phá
  let target = NaN; // T_ngắn (patternTargets) từ mức phá cố định; NaN khi mục tiêu không vượt mức phá (kế hoạch sẽ bỏ)
  // Sau phá: khoảng cách đóng cửa ngoài MỨC PHÁ CỐ ĐỊNH (×đơn vị giá), dương = ngoài mô hình.
  const outsideLevel = (sd: 'up' | 'down', i: number) => (sd === 'up' ? c[i]!.close - level : level - c[i]!.close);
  let retested = false;
  const notes: string[] = [];

  for (let i = startIdx; i <= last; i++) {
    const a = atrAt(i);
    if (side === null) {
      // --- giai đoạn armed / pending ---
      if (apex !== null && i > apex + EPS) return out('expired');
      const upOut = canUp ? outside('up', i) : -Infinity;
      const downOut = canDown ? outside('down', i) : -Infinity;
      // Đóng ngoài biên đối diện (mô hình một chiều) → hết hiệu lực.
      if (g.breakoutSide === 'up' && c[i]!.close < g.lower(i)) return out('invalidated');
      if (g.breakoutSide === 'down' && c[i]!.close > g.upper(i)) return out('invalidated');
      const hit: 'up' | 'down' | null = upOut > 0 ? 'up' : downOut > 0 ? 'down' : null;
      if (hit !== null) {
        const dist = hit === 'up' ? upOut : downOut;
        if (dist >= confirmAtr * a || pending === hit) {
          side = hit;
          bi = i;
          stopLevel = patternStopLevel(g, c, atr, hit, i).level;
          level = breakoutLevel(g, hit, i);
          const t = patternTargets(g, hit, level).short;
          target = (hit === 'up' ? t > level : t < level) ? t : NaN;
          pending = null;
          continue;
        }
        pending = hit; // vượt nhưng chưa đủ ngưỡng: chờ nến sau
        continue;
      }
      pending = null; // quay lại trong mô hình
      if (isFlag(g) ? i - tipIndex > COMMON.patterns.flag.maxBars : apex === null && i - armedFrom > cfg.armedExpiryRatio * duration) {
        return out('expired');
      }
      continue;
    }
    // --- giai đoạn sau phá vỡ ---
    // Thất bại (đóng quay vào > failAtr×A hoặc chạm cắt lỗ) được kiểm ở MỌI nến sau phá; chỉ retest bị giới hạn retestBars nến.
    const inside = -outsideLevel(side, i); // dương = đóng quay vào trong (so với mức phá cố định)
    const hitStop = side === 'up' ? c[i]!.low <= stopLevel : c[i]!.high >= stopLevel;
    if (inside > cfg.failAtr * a || hitStop) {
      return out('failed', { breakoutIndex: bi, side, breakoutLine: level, notes: breakoutNotes(), inBreakoutWindow: windowOk() });
    }
    // Chạm T_ngắn ở nến SAU nến phá (râu) → target_hit. Xét sau failed: nến chạm cả SL lẫn mục tiêu tính là failed (thận trọng).
    if (Number.isFinite(target) && (side === 'up' ? c[i]!.high >= target : c[i]!.low <= target)) {
      return out('target_hit', { breakoutIndex: bi, side, breakoutLine: level, notes: breakoutNotes(), inBreakoutWindow: windowOk() });
    }
    if (!retested && i - bi <= cfg.retestBars) {
      const wickDist = side === 'up' ? c[i]!.low - level : level - c[i]!.high; // râu chạm lại mức phá: <= retestAtr×A
      if (wickDist <= cfg.retestAtr * a && outsideLevel(side, i) > 0) retested = true;
    }
  }

  if (pending !== null) return out('breakout_pending', { side: pending, distanceAtr: outside(pending, last) / atrAt(last) });
  if (side === null) return out('armed');
  const done = last - bi >= cfg.retestBars;
  return out(retested ? 'retested' : 'breakout', {
    signalStale: last - bi > COMMON.patterns.maxSignalAgeBars,
    inBreakoutWindow: windowOk(),
    breakoutIndex: bi,
    side,
    breakoutLine: level,
    distanceAtr: outsideLevel(side, last) / atrAt(last),
    retest: retested ? 'yes' : done ? 'none' : null,
    notes: breakoutNotes(),
  });

  function windowOk(): boolean | null {
    if (apex === null || bi < 0) return null;
    const frac = (bi - g.startIndex) / (apex - g.startIndex);
    return frac >= cfg.triangleWindow.min - EPS && frac <= cfg.triangleWindow.max + EPS;
  }

  function breakoutNotes(): string[] {
    const n = [...notes];
    const p = cfg.volumeSmaPeriod;
    if (bi >= p) {
      // SMA volume của p nến TRƯỚC nến phá vỡ (không gồm nến phá).
      let sum = 0;
      for (let j = bi - p; j < bi; j++) sum += c[j]!.volume;
      if (c[bi]!.volume >= cfg.volumeMult * (sum / p)) n.push('volume nến phá cao: dự kiến retest cao');
    }
    if (windowOk() === false) n.push(`phá ngoài cửa sổ ${cfg.triangleWindow.min * 100}–${cfg.triangleWindow.max * 100}% quãng tới apex`);
    return n;
  }
}

// Thứ hạng ưu tiên: đang có lệnh (breakout/retested) > chờ xác nhận > armed > còn lại (kết thúc/forming).
const RANK: Record<PatternState, number> = {
  retested: 3, breakout: 3, breakout_pending: 2, armed: 1, forming: 0, failed: 0, target_hit: 0, expired: 0, invalidated: 0,
};

// Bước 1: cùng id (patternId) → chỉ giữ bản hình học phát ĐẦU TIÊN (endIndex nhỏ nhất); các bản phát lại sau (vd. cờ vẽ lại
// ở nến sau) không được ghi đè hay làm sống lại trạng thái đã kết thúc. Người gọi phải tính `result` từ chính hình học đó.
// Bước 2: mỗi (HỌ mô hình, khung) chỉ giữ một mô hình trong các cửa sổ chồng nhau — họ: tam giác {tăng, giảm, cân},
// cờ {tăng, giảm}, hai đỉnh/hai đáy, vai-đầu-vai {đỉnh, ngược}; còn lại mỗi loại một họ.
// Ưu tiên: hạng trạng thái cao, rồi nhiều chạm (pivot) hơn, rồi kết thúc muộn nhất, rồi bắt đầu muộn nhất.
// (trackPatterns đã chọn sẵn một bản phát cho mỗi id; bước 1 ở đây chỉ còn là chốt an toàn khi gọi trực tiếp.)
export function patternFamily(kind: PatternGeometry['kind']): string {
  if (kind === 'asc_triangle' || kind === 'desc_triangle' || kind === 'sym_triangle') return 'triangle';
  if (kind === 'bull_flag' || kind === 'bear_flag') return 'flag';
  if (kind === 'double_top' || kind === 'double_bottom') return 'double';
  if (kind === 'head_shoulders' || kind === 'inv_head_shoulders') return 'hs';
  return kind;
}
export function dedupePatterns<T extends { id: string; geometry: PatternGeometry; result: StateResult }>(items: T[]): T[] {
  const firstById = new Map<string, T>();
  for (const t of items) {
    const prev = firstById.get(t.id);
    if (!prev || t.geometry.endIndex < prev.geometry.endIndex) firstById.set(t.id, t);
  }
  const rank = (t: T) => RANK[t.result.state] - (t.result.signalStale ? 3 : 0);
  const sorted = [...firstById.values()].sort(
    (x, y) => rank(y) - rank(x) || y.geometry.pivots.length - x.geometry.pivots.length || y.geometry.endIndex - x.geometry.endIndex || y.geometry.startIndex - x.geometry.startIndex,
  );
  const kept: T[] = [];
  for (const t of sorted) {
    const g = t.geometry;
    const clash = kept.some(
      (u) => patternFamily(u.geometry.kind) === patternFamily(g.kind) && u.geometry.timeframe === g.timeframe && u.geometry.startIndex <= g.endIndex && g.startIndex <= u.geometry.endIndex,
    );
    if (!clash) kept.push(t);
  }
  return kept.sort((x, y) => x.geometry.endIndex - y.geometry.endIndex);
}
