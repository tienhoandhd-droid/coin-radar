// Thống kê kết quả mô phỏng (kế hoạch 2, Task 5) — HÀM THUẦN, không đọc tệp. Đầu vào là bản ghi lệnh của backtest/simulate.ts
// (TradeRecord, chỉ các trường dưới đây) + đường vốn của sổ vốn. Đầu ra dùng cho backtest/experiment.ts và báo cáo.
//
// QUY ƯỚC:
//  - Chỉ lệnh ĐÃ KHỚP được tính (filled = true). Thắng = lãi lỗ thật > 0 (như groupStats của simulate.ts); "chạm TP1" đếm riêng.
//  - Khoảng tin cậy tỉ lệ thắng: Wilson. Kỳ vọng R: bootstrap phân vị (percentile), có hạt ngẫu nhiên → chạy lại ra đúng số cũ.
//  - Sụt giảm R: trên đường R cộng dồn theo thứ tự đóng lệnh (đỉnh gồm mốc 0). Sụt giảm % vốn: CHỈ từ đường vốn thật của mô phỏng
//    (lãi kép, có dòng tiền funding giữa chừng). Lãi kép theo nhóm con = tích (1 + % vốn từng lệnh) — XẤP XỈ (bỏ chồng lệnh).
//  - So sánh theo cặp: biến thể − gốc trên CÙNG signalId đã khớp ở cả hai; lệnh chỉ có một bên ghi riêng, không vào ΔR.
//  - Bonferroni: k = số biến thể đã thử (nhật ký) → mức ý nghĩa 0,05/k.
import type { Candle, Mode, Side } from '../packages/core/types.ts';
import type { Exit } from './simulate.ts';

export type StatTrade = {
  signalId: string; symbol: string; side: Side; mode: Mode; grade: string | null; kind: string; filled: boolean;
  R: number; pnl: number; costs: number; funding?: number; riskAtFill: number; pctEquity: number; exits: readonly Exit[];
  entryTime: string | null; exitTime: string | null; regime?: string; variant?: string;
};
export type CI = { lo: number; hi: number };
export type BootOpts = { resamples: number; seed: number; alpha: number };

// ---------------------------------------------------------------- công cụ xác suất ------------------------------------------------
// Phân vị chuẩn hai phía z(1 − alpha/2) — thuật toán Acklam (sai số tương đối < 1,2e−9).
export function zFor(alpha: number): number {
  if (!(alpha > 0 && alpha < 1)) throw new Error(`zFor: alpha phải trong (0,1), nhận ${alpha}`);
  const p = 1 - alpha / 2;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pHigh = 1 - 0.02425;
  if (p <= pHigh) {
    const q = p - 0.5, r = q * q;
    return ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
}

export function bonferroniAlpha(alpha: number, k: number): number {
  if (!(Number.isInteger(k) && k >= 1)) throw new Error(`bonferroniAlpha: số lần thử k phải là số nguyên ≥ 1, nhận ${k}`);
  return alpha / k;
}

export function wilson(k: number, n: number, z: number): CI {
  if (n === 0) return { lo: 0, hi: 1 };
  const p = k / n, z2 = z * z, den = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return { lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

// Bộ sinh số giả ngẫu nhiên có hạt (mulberry32) — để bootstrap/vào lệnh ngẫu nhiên lặp lại được.
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mean = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

// Phân vị (nội suy tuyến tính) của mảng ĐÃ sắp tăng dần
function quantile(sorted: readonly number[], q: number): number {
  const pos = (sorted.length - 1) * q, i = Math.floor(pos), f = pos - i;
  return i + 1 < sorted.length ? sorted[i]! * (1 - f) + sorted[i + 1]! * f : sorted[i]!;
}

export function bootstrapMeanCI(xs: readonly number[], o: BootOpts): { mean: number } & CI {
  if (xs.length === 0) return { mean: NaN, lo: NaN, hi: NaN };
  if (!(Number.isInteger(o.resamples) && o.resamples >= 1)) throw new Error(`bootstrap: số lần lấy mẫu lại phải ≥ 1, nhận ${o.resamples}`);
  const rnd = mulberry32(o.seed);
  const n = xs.length;
  const means = new Array<number>(o.resamples);
  for (let b = 0; b < o.resamples; b++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += xs[Math.floor(rnd() * n)]!;
    means[b] = s / n;
  }
  means.sort((x, y) => x - y);
  return { mean: mean(xs), lo: quantile(means, o.alpha / 2), hi: quantile(means, 1 - o.alpha / 2) };
}

// Bootstrap theo KHỐI (vd. ngày): lấy lại cả khối có hoàn lại, trung bình = tổng giá trị / tổng số phần tử của các khối đã lấy.
// Lệnh cùng ngày (chồng thời gian, cùng cú sốc) không độc lập → CI theo khối trung thực hơn iid. Mỗi khối một phần tử ≡ iid.
export function blockBootstrapMeanCI(xs: readonly number[], keys: readonly string[], o: BootOpts): { mean: number } & CI {
  if (xs.length !== keys.length) throw new Error(`blockBootstrap: ${xs.length} giá trị nhưng ${keys.length} khóa khối`);
  if (xs.length === 0) return { mean: NaN, lo: NaN, hi: NaN };
  const byKey = new Map<string, number[]>();
  xs.forEach((x, i) => { const k = keys[i]!; const b = byKey.get(k); if (b === undefined) byKey.set(k, [x]); else b.push(x); });
  const blocks = [...byKey.values()].map((b) => ({ sum: b.reduce((s, x) => s + x, 0), n: b.length }));
  const rnd = mulberry32(o.seed);
  const m = blocks.length;
  const means = new Array<number>(o.resamples);
  for (let r = 0; r < o.resamples; r++) {
    let s = 0, n = 0;
    for (let i = 0; i < m; i++) { const b = blocks[Math.floor(rnd() * m)]!; s += b.sum; n += b.n; }
    means[r] = s / n;
  }
  means.sort((x, y) => x - y);
  return { mean: mean(xs), lo: quantile(means, o.alpha / 2), hi: quantile(means, 1 - o.alpha / 2) };
}

const DAY_MS = 86_400_000;
const dayKey = (iso: string) => iso.slice(0, 10);

// ---------------------------------------------------------------- chỉ số chuỗi lệnh -----------------------------------------------
export function maxDrawdownR(rs: readonly number[]): number {
  let cum = 0, peak = 0, dd = 0;
  for (const r of rs) { cum += r; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum); }
  return dd;
}

export function maxDrawdownPct(curve: ReadonlyArray<{ t: number; equity: number }>, capital: number): number {
  let peak = capital, dd = 0;
  for (const p of curve) { peak = Math.max(peak, p.equity); dd = Math.max(dd, ((peak - p.equity) / peak) * 100); }
  return dd;
}

export function longestLosingStreak(pnls: readonly number[]): number {
  let cur = 0, best = 0;
  for (const p of pnls) { if (p > 0) cur = 0; else { cur++; best = Math.max(best, cur); } }
  return best;
}

export function compoundReturnPct(pctEquity: readonly number[]): number {
  return (pctEquity.reduce((g, p) => g * (1 + p / 100), 1) - 1) * 100;
}

// ---------------------------------------------------------------- thống kê một nhóm ------------------------------------------------
export type Stats = {
  trades: number; wins: number; winRate: number; winCI: CI; tp1Hits: number; tp1Rate: number; tp1CI: CI;
  expectancyR: number; expectancyCI: CI; expectancyCIBlock: CI; days: number; sumR: number; pnl: number; profitFactor: number; avgFeesR: number; avgFundingR: number;
  longestLosingStreak: number; maxDrawdownR: number; compoundReturnPct: number;
  totalReturnPct: number | null; maxDrawdownPct: number | null; smallSample: boolean;
};
export type StatsOpts = BootOpts & { equity?: { capital: number; curve: ReadonlyArray<{ t: number; equity: number }> } };

const byExit = (a: StatTrade, b: StatTrade) => (a.exitTime ?? '').localeCompare(b.exitTime ?? '');

export function computeStats(all: readonly StatTrade[], o: StatsOpts): Stats {
  const xs = all.filter((r) => r.filled).sort(byExit);
  const n = xs.length;
  const z = zFor(o.alpha);
  const rs = xs.map((r) => r.R);
  const wins = xs.filter((r) => r.pnl > 0).length;
  const tp1Hits = xs.filter((r) => r.exits.some((e) => e.role === 'TP1')).length;
  const gp = xs.reduce((s, r) => s + Math.max(0, r.pnl), 0), gl = xs.reduce((s, r) => s + Math.max(0, -r.pnl), 0);
  const boot = bootstrapMeanCI(rs, o);
  const dayOf = xs.map((r) => dayKey(r.entryTime ?? r.exitTime ?? ''));
  const blk = blockBootstrapMeanCI(rs, dayOf, o); // khối = ngày VÀO lệnh (UTC)
  const perR = (f: (r: StatTrade) => number) => (n > 0 ? mean(xs.map((r) => (r.riskAtFill > 0 ? f(r) / r.riskAtFill : 0))) : 0);
  const eq = o.equity;
  const lastEq = eq !== undefined && eq.curve.length > 0 ? eq.curve[eq.curve.length - 1]!.equity : eq?.capital;
  return {
    trades: n, wins, winRate: n > 0 ? wins / n : 0, winCI: wilson(wins, n, z), tp1Hits, tp1Rate: n > 0 ? tp1Hits / n : 0, tp1CI: wilson(tp1Hits, n, z),
    expectancyR: n > 0 ? boot.mean : 0, expectancyCI: { lo: boot.lo, hi: boot.hi },
    expectancyCIBlock: { lo: blk.lo, hi: blk.hi }, days: new Set(dayOf).size, sumR: rs.reduce((s, r) => s + r, 0),
    pnl: xs.reduce((s, r) => s + r.pnl, 0), profitFactor: gl > 0 ? gp / gl : gp > 0 ? Infinity : 0,
    avgFeesR: perR((r) => r.costs), avgFundingR: perR((r) => r.funding ?? 0),
    longestLosingStreak: longestLosingStreak(xs.map((r) => r.pnl)), maxDrawdownR: maxDrawdownR(rs),
    compoundReturnPct: compoundReturnPct(xs.map((r) => r.pctEquity)),
    totalReturnPct: eq === undefined ? null : ((lastEq! - eq.capital) / eq.capital) * 100,
    maxDrawdownPct: eq === undefined ? null : maxDrawdownPct(eq.curve, eq.capital),
    smallSample: n < 30,
  };
}

// ---------------------------------------------------------------- theo nhóm --------------------------------------------------------
export type Dim = 'mode' | 'side' | 'grade' | 'kind' | 'regime' | 'variant';
const dimValue = (r: StatTrade, d: Dim): string => String((d === 'grade' ? r.grade : r[d]) ?? '?');

// Nhóm "tất cả" + từng chiều riêng + từng CẶP chiều (chỉ ô có lệnh). Không ghép đủ mọi chiều một lúc: ô quá nhỏ.
export function groupStatsBy(xs: readonly StatTrade[], dims: readonly Dim[], o: BootOpts): Array<{ key: string; stats: Stats }> {
  const filled = xs.filter((r) => r.filled);
  const groups = new Map<string, StatTrade[]>([['tất cả', filled]]);
  const add = (k: string, r: StatTrade) => { const g = groups.get(k); if (g === undefined) groups.set(k, [r]); else g.push(r); };
  for (const r of filled) {
    for (const d of dims) add(`${d}=${dimValue(r, d)}`, r);
    for (let i = 0; i < dims.length; i++) for (let j = i + 1; j < dims.length; j++) add(`${dims[i]}=${dimValue(r, dims[i]!)}|${dims[j]}=${dimValue(r, dims[j]!)}`, r);
  }
  return [...groups].map(([key, g]) => ({ key, stats: computeStats(g, o) }));
}

// ---------------------------------------------------------------- so sánh theo cặp -------------------------------------------------
export type Paired = {
  matched: number; meanDeltaR: number; ci: CI; alpha: number; trials: number; alphaAdj: number; ciAdj: CI;
  baseOnly: string[]; variantOnly: string[]; baseOnlyR: number; variantOnlyR: number; note: string;
};

export function pairedComparison(base: readonly StatTrade[], variant: readonly StatTrade[], o: BootOpts & { trials: number }): Paired {
  const b = new Map(base.filter((r) => r.filled).map((r) => [r.signalId, r]));
  const v = new Map(variant.filter((r) => r.filled).map((r) => [r.signalId, r]));
  const deltas: number[] = [];
  for (const [id, rv] of v) { const rb = b.get(id); if (rb !== undefined) deltas.push(rv.R - rb.R); }
  const baseOnly = [...b.keys()].filter((id) => !v.has(id));
  const variantOnly = [...v.keys()].filter((id) => !b.has(id));
  const alphaAdj = bonferroniAlpha(o.alpha, o.trials);
  const ci = bootstrapMeanCI(deltas, o);
  const adj = bootstrapMeanCI(deltas, { ...o, alpha: alphaAdj });
  return {
    matched: deltas.length, meanDeltaR: ci.mean, ci: { lo: ci.lo, hi: ci.hi }, alpha: o.alpha, trials: o.trials, alphaAdj, ciAdj: { lo: adj.lo, hi: adj.hi },
    baseOnly, variantOnly, baseOnlyR: baseOnly.reduce((x, id) => x + b.get(id)!.R, 0), variantOnlyR: variantOnly.reduce((x, id) => x + v.get(id)!.R, 0),
    note: `${baseOnly.length} lệnh chỉ có ở gốc, ${variantOnly.length} lệnh chỉ có ở biến thể (khác do danh mục/định cỡ/luật) — không nằm trong ΔR theo cặp`,
  };
}

// ---------------------------------------------------------------- so cấp DANH MỤC theo ngày ---------------------------------------
// Tiêu chí nhận chính (rà soát C1): biến thể LỌC bỏ lệnh → ΔR theo cặp ≈ 0 theo cấu tạo; tác dụng nằm ở lệnh bị bỏ/thêm. Vì vậy so
// cả danh mục trên CÙNG lịch ngày D: R/ngày (tổng R lệnh ĐÓNG trong ngày UTC, ngày không lệnh = 0) và lợi suất vốn/ngày (đường vốn).
// Chuỗi Δ theo ngày (biến thể − gốc, ghép theo ngày) → bootstrap theo khối NGÀY (lấy lại ngày có hoàn lại).

export function dailyRSeries(trades: readonly StatTrade[], start: number, end: number): number[] {
  const n = Math.ceil((end - start) / DAY_MS);
  const out = new Array<number>(n).fill(0);
  for (const r of trades) {
    if (!r.filled || r.exitTime === null) continue;
    const t = Date.parse(r.exitTime);
    const i = t === end ? n - 1 : Math.floor((t - start) / DAY_MS); // đóng đúng mốc cuối kỳ → ngày cuối
    if (!(i >= 0 && i < n)) throw new Error(`dailyRSeries: lệnh đóng ${r.exitTime} ngoài lịch [${new Date(start).toISOString()}, ${new Date(end).toISOString()})`);
    out[i]! += r.R;
  }
  return out;
}

// Lợi suất % vốn từng ngày: vốn cuối ngày (điểm cuối cùng có t < hết ngày; không có điểm → giữ vốn ngày trước) so vốn cuối ngày trước.
export function dailyEquityReturns(curve: ReadonlyArray<{ t: number; equity: number }>, capital: number, start: number, end: number): number[] {
  const n = Math.ceil((end - start) / DAY_MS);
  const pts = [...curve].sort((a, b) => a.t - b.t);
  let k = 0, eq = capital;
  while (k < pts.length && pts[k]!.t < start) eq = pts[k++]!.equity;
  const out: number[] = [];
  for (let d = 0; d < n; d++) {
    const dayEnd = start + (d + 1) * DAY_MS;
    const prev = eq;
    while (k < pts.length && (pts[k]!.t < dayEnd || (d === n - 1 && pts[k]!.t <= end))) eq = pts[k++]!.equity;
    out.push((eq / prev - 1) * 100);
  }
  return out;
}

const finalEquity = (curve: ReadonlyArray<{ equity: number }>, capital: number) => (curve.length > 0 ? curve[curve.length - 1]!.equity : capital);

export type DeltaCI = { mean: number; ci: CI; ciAdj: CI };
export type PortfolioComparison = {
  days: number; alpha: number; trials: number; alphaAdj: number; rPerDay: DeltaCI; retPerDay: DeltaCI;
  deltaTotalReturnPct: number; deltaMaxDdPct: number; baseOnly: { count: number; sumR: number }; variantOnly: { count: number; sumR: number };
};
type Side2 = { trades: readonly StatTrade[]; curve: ReadonlyArray<{ t: number; equity: number }> };

export function portfolioComparison(base: Side2, variant: Side2, o: BootOpts & { trials: number; capital: number; start: number; end: number }): PortfolioComparison {
  const alphaAdj = bonferroniAlpha(o.alpha, o.trials);
  const delta = (b: number[], v: number[]): DeltaCI => {
    const d = v.map((x, i) => x - b[i]!);
    const a = bootstrapMeanCI(d, o), adj = bootstrapMeanCI(d, { ...o, alpha: alphaAdj }); // mỗi phần tử = một ngày → bootstrap khối ngày
    return { mean: a.mean, ci: { lo: a.lo, hi: a.hi }, ciAdj: { lo: adj.lo, hi: adj.hi } };
  };
  const rB = dailyRSeries(base.trades, o.start, o.end), rV = dailyRSeries(variant.trades, o.start, o.end);
  const eB = dailyEquityReturns(base.curve, o.capital, o.start, o.end), eV = dailyEquityReturns(variant.curve, o.capital, o.start, o.end);
  const ids = (xs: readonly StatTrade[]) => new Map(xs.filter((r) => r.filled).map((r) => [r.signalId, r.R]));
  const bIds = ids(base.trades), vIds = ids(variant.trades);
  const only = (a: Map<string, number>, b: Map<string, number>) => {
    const xs = [...a].filter(([id]) => !b.has(id));
    return { count: xs.length, sumR: xs.reduce((s, [, r]) => s + r, 0) };
  };
  return {
    days: rB.length, alpha: o.alpha, trials: o.trials, alphaAdj, rPerDay: delta(rB, rV), retPerDay: delta(eB, eV),
    deltaTotalReturnPct: ((finalEquity(variant.curve, o.capital) - finalEquity(base.curve, o.capital)) / o.capital) * 100,
    deltaMaxDdPct: maxDrawdownPct(variant.curve, o.capital) - maxDrawdownPct(base.curve, o.capital),
    baseOnly: only(bIds, vIds), variantOnly: only(vIds, bIds),
  };
}

// ---------------------------------------------------------------- vào lệnh ngẫu nhiên ----------------------------------------------
// Mẫu lấy từ lệnh thật: cùng mã, cùng chiều, cùng thời gian giữ, cùng khoảng cắt lỗ (% giá vào), cùng chi phí tính ra R.
export type RandomTemplate = { symbol: string; side: Side; holdMs: number; stopPct: number; feeR: number };

// Vào ở giá MỞ nến entryIdx, giữ đủ số nến của holdMs (≥ 1), thoát ở giá đóng nến cuối; SL kiểm trước (bất lợi trước), gap → giá mở.
export function simulateRandomTrade(t: RandomTemplate, bars: readonly Candle[], entryIdx: number): number | null {
  const first = bars[entryIdx];
  if (first === undefined) return null;
  const barMs = first.closeTime + 1 - first.openTime;
  const nBars = Math.max(1, Math.round(t.holdMs / barMs));
  if (entryIdx + nBars > bars.length) return null;
  const sgn = t.side === 'long' ? 1 : -1;
  const entry = first.open;
  const stop = entry * (1 - sgn * t.stopPct);
  let exit = bars[entryIdx + nBars - 1]!.close;
  for (let j = entryIdx; j < entryIdx + nBars; j++) {
    const c = bars[j]!;
    if (j > entryIdx && sgn * (c.open - stop) <= 0) { exit = c.open; break; }
    if (sgn * ((sgn === 1 ? c.low : c.high) - stop) <= 0) { exit = stop; break; }
  }
  return (sgn * (exit - entry)) / entry / t.stopPct - t.feeR;
}

export type RandomBaseline = { reps: number; tradesPerRep: number; skippedTemplates: number; meanExpectancyR: number } & CI;

export function randomEntryBaseline(templates: readonly RandomTemplate[], barsOf: (t: RandomTemplate) => readonly Candle[] | null, o: { reps: number; seed: number; alpha: number }): RandomBaseline {
  const usable: Array<{ t: RandomTemplate; bars: readonly Candle[]; maxIdx: number }> = [];
  for (const t of templates) {
    const bars = barsOf(t);
    if (bars === null || bars.length === 0) continue;
    const barMs = bars[0]!.closeTime + 1 - bars[0]!.openTime;
    const maxIdx = bars.length - Math.max(1, Math.round(t.holdMs / barMs));
    if (maxIdx < 0) continue;
    usable.push({ t, bars, maxIdx });
  }
  const rnd = mulberry32(o.seed);
  const repMeans: number[] = [];
  for (let k = 0; k < o.reps && usable.length > 0; k++) {
    let s = 0;
    for (const u of usable) s += simulateRandomTrade(u.t, u.bars, Math.floor(rnd() * (u.maxIdx + 1)))!;
    repMeans.push(s / usable.length);
  }
  repMeans.sort((x, y) => x - y);
  const ok = repMeans.length > 0;
  return {
    reps: repMeans.length, tradesPerRep: usable.length, skippedTemplates: templates.length - usable.length,
    meanExpectancyR: ok ? mean(repMeans) : NaN, lo: ok ? quantile(repMeans, o.alpha / 2) : NaN, hi: ok ? quantile(repMeans, 1 - o.alpha / 2) : NaN,
  };
}
