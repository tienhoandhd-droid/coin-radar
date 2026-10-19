import type { Candle } from '../types.ts';
import { COMMON } from '../config.ts';
import type { PatternGeometry } from './types.ts';

export type PatternState = 'forming' | 'armed' | 'breakout_pending' | 'breakout' | 'retested' | 'failed' | 'expired' | 'invalidated';

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

// Định danh ổn định, xác định (không cần thư viện hash): mã | khung | loại | chỉ số nến của 2 pivot đầu.
export function patternId(symbol: string, g: PatternGeometry): string {
  const p1 = g.pivots[0];
  const p2 = g.pivots[1];
  if (!p1 || !p2) throw new Error(`mô hình ${g.kind} thiếu pivot để tạo id`);
  return `${symbol}|${g.timeframe}|${g.kind}|${p1.index}|${p2.index}`;
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
// asOf (mặc định = nến cuối): chỉ dùng nến ≤ asOf, dù mảng dài hơn — để so "chạy toàn bộ" với "chạy tăng dần".
export function evaluateState(g: PatternGeometry, c: Candle[], atr: number[], tf: string, asOf: number = c.length - 1): StateResult {
  const cfg = COMMON.patterns.state;
  const confirmAtr = (cfg.confirmAtr as Record<string, number>)[tf];
  if (confirmAtr === undefined) throw new Error(`khung không hỗ trợ: ${tf}`);
  if (atr.length !== c.length) throw new Error(`độ dài atr (${atr.length}) khác độ dài nến (${c.length})`);
  if (!Number.isInteger(asOf) || asOf < 0 || asOf >= c.length) throw new Error(`asOf ${asOf} ngoài phạm vi 0..${c.length - 1}`);
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
  const lineOf = (side: 'up' | 'down', i: number) => (side === 'up' ? g.upper(i) : g.lower(i));
  // Khoảng cách đóng cửa ngoài đường phá (×đơn vị giá), dương = ngoài mô hình.
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
    const line = lineOf(side, i);
    const inside = -outside(side, i); // dương = đóng quay vào trong
    const stop = side === 'up' ? g.stopRef.up : g.stopRef.down;
    const hitStop = side === 'up' ? c[i]!.low <= stop : c[i]!.high >= stop;
    if (inside > cfg.failAtr * a || hitStop) {
      return out('failed', { breakoutIndex: bi, side, breakoutLine: lineOf(side, bi), notes: breakoutNotes(), inBreakoutWindow: windowOk() });
    }
    if (!retested && i - bi <= cfg.retestBars) {
      const wickDist = side === 'up' ? c[i]!.low - line : line - c[i]!.high; // râu chạm lại: <= retestAtr×A
      if (wickDist <= cfg.retestAtr * a && outside(side, i) > 0) retested = true;
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
    breakoutLine: lineOf(side, bi),
    distanceAtr: outside(side, last) / atrAt(last),
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
  retested: 3, breakout: 3, breakout_pending: 2, armed: 1, forming: 0, failed: 0, expired: 0, invalidated: 0,
};

// Bước 1: cùng id (patternId) → chỉ giữ bản hình học phát ĐẦU TIÊN (endIndex nhỏ nhất); các bản phát lại sau (vd. cờ vẽ lại
// ở nến sau) không được ghi đè hay làm sống lại trạng thái đã kết thúc. Người gọi phải tính `result` từ chính hình học đó.
// Bước 2: mỗi (loại, khung) chỉ giữ một mô hình trong các cửa sổ chồng nhau: ưu tiên hạng cao, rồi kết thúc muộn nhất, rồi bắt đầu muộn nhất.
export function dedupePatterns<T extends { id: string; geometry: PatternGeometry; result: StateResult }>(items: T[]): T[] {
  const firstById = new Map<string, T>();
  for (const t of items) {
    const prev = firstById.get(t.id);
    if (!prev || t.geometry.endIndex < prev.geometry.endIndex) firstById.set(t.id, t);
  }
  const rank = (t: T) => RANK[t.result.state] - (t.result.signalStale ? 3 : 0);
  const sorted = [...firstById.values()].sort(
    (x, y) => rank(y) - rank(x) || y.geometry.endIndex - x.geometry.endIndex || y.geometry.startIndex - x.geometry.startIndex,
  );
  const kept: T[] = [];
  for (const t of sorted) {
    const g = t.geometry;
    const clash = kept.some(
      (u) => u.geometry.kind === g.kind && u.geometry.timeframe === g.timeframe && u.geometry.startIndex <= g.endIndex && g.startIndex <= u.geometry.endIndex,
    );
    if (!clash) kept.push(t);
  }
  return kept.sort((x, y) => x.geometry.endIndex - y.geometry.endIndex);
}
