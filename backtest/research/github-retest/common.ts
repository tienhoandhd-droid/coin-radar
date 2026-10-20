// Kiểm lại bot mã nguồn mở (kế hoạch docs/superpowers/plans/2026-10-20-kiem-lai-bot-github.md).
// Phần dùng chung: cửa sổ thời gian, chặn dữ liệu kỳ mù B, nạp nến/funding, xếp hạng top-200 theo thời điểm, thống kê.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Candle } from '../../../packages/core/types.ts';
import { loadCandles, type Interval, DAY, HOUR, INTERVAL_MS } from '../../data.ts';
import { blockBootstrapMeanCI, maxDrawdownPct } from '../../stats.ts';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const CACHE = join(ROOT, 'data/cache');
export const HIST1D = join(ROOT, 'data/history/1d');
export { DAY, HOUR };

export const T = (s: string): number => Date.parse(s + 'T00:00:00Z');
export const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
export const dayKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

// Kỳ mù B — CẤM đọc. Kỳ C [2026-01-01, 2026-05-01) chỉ được đọc làm nến khởi động chỉ báo.
export const B0 = T('2026-09-19'), B1 = T('2026-10-19');
export type Window = { name: string; from: number; to: number };
export const WIN = {
  D: { name: 'D [19/6–19/9/2026)', from: T('2026-06-19'), to: B0 } as Window,
  M59: { name: '5–9/2026 [1/5–19/9/2026)', from: T('2026-05-01'), to: B0 } as Window,
  Y: { name: '2020–2025', from: T('2020-01-01'), to: T('2026-01-01') } as Window,
};

export function assertNoBlind(cs: readonly Candle[], what: string): void {
  for (const c of cs) if (c.closeTime >= B0 && c.closeTime < B1) throw new Error(`ASSERT dữ liệu cấm: ${what} có nến đóng ${iso(c.closeTime)} thuộc kỳ mù B`);
}

// ---- nến từ bộ nhớ đệm (data/cache). Trả null khi mã không có tệp nào trong khoảng (không nuốt lỗi khác). ----
export type LoadResult = { candles: Candle[]; firstFileFrom: number } | null;
export function loadCached(symbol: string, interval: Interval, from: number, to: number): LoadResult {
  if (to > B0) throw new Error(`ASSERT: yêu cầu nến tới ${iso(to)} vượt mốc cấm 2026-09-19`);
  const dir = join(CACHE, 'klines', symbol, interval);
  if (!existsSync(dir)) return null;
  // tìm tệp tháng đầu tiên tồn tại kể từ `from` (mã niêm yết muộn / chỉ có từ kỳ D)
  let start = from;
  let firstFileFrom = -1;
  for (let t = from; t < to; ) {
    const d = new Date(t);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const path = join(dir, key + '.json');
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    if (existsSync(path)) {
      const f = JSON.parse(readFileSync(path, 'utf8')) as { from: number };
      firstFileFrom = f.from;
      start = Math.max(from, f.from);
      break;
    }
    t = next;
  }
  if (firstFileFrom < 0) return null;
  const { candles } = loadCandles(CACHE, symbol, interval, start, to);
  assertNoBlind(candles, `${symbol} ${interval}`);
  return { candles, firstFileFrom };
}

// ---- nến ngày nhiều năm (data/history/1d, 885 mã kể cả đã hủy niêm yết). Tệp lịch sử KHÔNG có kỳ C [1/1, 1/5/2026);
// ngày thiếu được bù bằng data/cache/klines/<mã>/1d (chỉ dùng làm nến khởi động / xếp hạng — được phép đọc C). ----
export function loadHistory1d(symbol: string, from: number, to: number): Candle[] {
  const j = JSON.parse(readFileSync(join(HIST1D, symbol + '.json'), 'utf8')) as { cols: string[]; rows: number[][] };
  if (j.cols.join() !== 't,o,h,l,c,v,qv') throw new Error(`${symbol}: cột lạ ${j.cols.join()}`);
  const byDay = new Map<number, Candle>();
  for (const r of j.rows) {
    const t = r[0]!;
    if (t < from || t + DAY > to) continue;
    byDay.set(Math.floor(t / DAY), { openTime: t, closeTime: t + DAY - 1, open: r[1]!, high: r[2]!, low: r[3]!, close: r[4]!, volume: r[5]!, quoteVolume: r[6]!, takerBuyQuote: NaN });
  }
  const gapFrom = Math.max(from, T('2026-01-01')), gapTo = Math.min(to, T('2026-05-01'));
  if (gapFrom < gapTo) {
    const cached = loadCached(symbol, '1d', gapFrom, gapTo);
    if (cached) for (const c of cached.candles) if (!byDay.has(Math.floor(c.openTime / DAY))) byDay.set(Math.floor(c.openTime / DAY), c);
  }
  const out = [...byDay.values()].sort((a, b) => a.openTime - b.openTime);
  assertNoBlind(out, `${symbol} 1d lịch sử`);
  return out;
}
export const hasDailyGap = (c: readonly Candle[]): boolean => c.some((x, i) => i > 0 && x.openTime - c[i - 1]!.openTime > DAY);
export const historySymbols = (): string[] => readdirSync(HIST1D).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();

// ---- funding thật. data/cache/funding (từ 3/2025, 523 mã) + data/cache/funding-history (BTC/ETH từ 12/2019). ----
export type Funding = { t: number; r: number }[];
export function loadFunding(symbol: string): Funding {
  const out: Funding = [];
  const p1 = join(CACHE, 'funding-history', symbol + '.json');
  if (existsSync(p1)) for (const x of JSON.parse(readFileSync(p1, 'utf8')) as { t: number; r: number }[]) out.push({ t: x.t, r: x.r });
  const p2 = join(CACHE, 'funding', symbol + '.json');
  if (existsSync(p2)) {
    const seen = new Set(out.map((x) => Math.round(x.t / HOUR)));
    for (const x of (JSON.parse(readFileSync(p2, 'utf8')) as { rows: { fundingTime: number; fundingRate: number }[] }).rows) {
      if (!seen.has(Math.round(x.fundingTime / HOUR))) out.push({ t: x.fundingTime, r: x.fundingRate });
    }
  }
  out.sort((a, b) => a.t - b.t);
  const kept = out.filter((x) => x.t < B0); // không dùng funding kỳ mù
  return kept;
}
// Tổng funding (tỉ lệ trên notional) long phải trả khi giữ qua [from, to). Thiếu dữ liệu thật → mặc định 0,01%/kỳ (long trả, short không nhận).
export const FUNDING_FALLBACK = 0.0001;
export function fundingPaid(f: Funding, from: number, to: number, side: 'long' | 'short'): { paid: number; periods: number; missing: number } {
  let paid = 0, periods = 0, missing = 0;
  // kỳ funding 8h: 00:00, 08:00, 16:00 UTC
  const first = Math.ceil(from / (8 * HOUR)) * 8 * HOUR;
  let i = 0;
  while (i < f.length && f[i]!.t < first - HOUR) i++;
  for (let t = first; t < to; t += 8 * HOUR) {
    periods++;
    while (i < f.length && f[i]!.t < t - HOUR) i++;
    const real = i < f.length && Math.abs(f[i]!.t - t) <= HOUR ? f[i]!.r : null;
    if (real === null) { missing++; if (side === 'long') paid += FUNDING_FALLBACK; }
    else paid += side === 'long' ? real : -real;
  }
  return { paid, periods, missing };
}

// ---- Xếp hạng thanh khoản theo thời điểm: trung bình quoteVolume 30 nến ngày ĐÃ ĐÓNG trước ngày d (từ data/history/1d). ----
export const STABLE_BASES = new Set(['USDC', 'FDUSD', 'TUSD', 'USDP', 'DAI', 'BUSD', 'USDE', 'PYUSD', 'RLUSD', 'USD1']);
export type PitRank = { top: Map<number, Set<string>>; members: Set<string> }; // khóa = chỉ số ngày UTC
export function pitTop(n: number, from: number, to: number): PitRank {
  const d0 = Math.floor(from / DAY), d1 = Math.ceil(to / DAY);
  const perDay = new Map<number, { s: string; v: number }[]>();
  for (const s of historySymbols()) {
    if (STABLE_BASES.has(s.replace(/USDT$/, ''))) continue;
    const rows = loadHistory1d(s, from - 40 * DAY, Math.min(to, B0));
    const byDay = new Map<number, number>();
    for (const c of rows) byDay.set(Math.floor(c.openTime / DAY), c.quoteVolume);
    for (let d = d0; d < d1; d++) {
      let sum = 0, k = 0;
      for (let j = d - 30; j < d; j++) { const v = byDay.get(j); if (v !== undefined) { sum += v; k++; } }
      if (k < 30) continue; // mã niêm yết < 30 ngày: chưa xếp hạng
      let arr = perDay.get(d); if (!arr) perDay.set(d, (arr = []));
      arr.push({ s, v: sum / 30 });
    }
  }
  const top = new Map<number, Set<string>>(); const members = new Set<string>();
  for (const [d, arr] of perDay) {
    arr.sort((a, b) => b.v - a.v);
    const set = new Set(arr.slice(0, n).map((x) => x.s));
    top.set(d, set); for (const s of set) members.add(s);
  }
  return { top, members };
}

// ---- Lệnh và thống kê ----
export type Trade = {
  symbol: string; side: 'long' | 'short'; entryTime: number; exitTime: number; entry: number; exit: number;
  pnlPct: number; // % vốn (vốn = 100) theo cách định cỡ đã nêu
  R: number; // pnlPct / 2 khi định cỡ theo SL; NaN khi không có SL
  retPct: number; // % trên notional trước phí
  feePct: number; fundingPct: number; reason: string; openAtEnd: boolean;
};
export type Summary = {
  n: number; winPct: number; expPct: number; expR: number; ciLo: number; ciHi: number; ciKind: 'R' | '%';
  pf: number; totalPct: number; ddPct: number; worstPct: number; openAtEnd: number; maxConcurrent: number;
};
export function summarize(trades: readonly Trade[], seed = 7): Summary {
  const n = trades.length;
  if (n === 0) return { n: 0, winPct: NaN, expPct: NaN, expR: NaN, ciLo: NaN, ciHi: NaN, ciKind: '%', pf: NaN, totalPct: 0, ddPct: 0, worstPct: NaN, openAtEnd: 0, maxConcurrent: 0 };
  const hasR = trades.every((t) => Number.isFinite(t.R));
  const xs = trades.map((t) => (hasR ? t.R : t.pnlPct));
  const ci = blockBootstrapMeanCI(xs, trades.map((t) => dayKey(t.entryTime)), { resamples: 2000, seed, alpha: 0.05 });
  const gp = trades.filter((t) => t.pnlPct > 0).reduce((s, t) => s + t.pnlPct, 0);
  const gl = -trades.filter((t) => t.pnlPct <= 0).reduce((s, t) => s + t.pnlPct, 0);
  const sorted = [...trades].sort((a, b) => a.exitTime - b.exitTime);
  let eq = 100; const curve = sorted.map((t) => ({ t: t.exitTime, equity: (eq += t.pnlPct) }));
  // số lệnh mở đồng thời tối đa
  const ev: { t: number; d: number }[] = [];
  for (const t of trades) { ev.push({ t: t.entryTime, d: 1 }); ev.push({ t: t.exitTime, d: -1 }); }
  ev.sort((a, b) => a.t - b.t || a.d - b.d);
  let cur = 0, maxC = 0; for (const e of ev) { cur += e.d; maxC = Math.max(maxC, cur); }
  return {
    n, winPct: (100 * trades.filter((t) => t.pnlPct > 0).length) / n,
    expPct: trades.reduce((s, t) => s + t.pnlPct, 0) / n, expR: hasR ? xs.reduce((s, x) => s + x, 0) / n : NaN,
    ciLo: ci.lo, ciHi: ci.hi, ciKind: hasR ? 'R' : '%',
    pf: gl === 0 ? Infinity : gp / gl, totalPct: eq - 100, ddPct: maxDrawdownPct(curve, 100),
    worstPct: trades.reduce((m, t) => Math.min(m, t.pnlPct), Infinity), openAtEnd: trades.filter((t) => t.openAtEnd).length, maxConcurrent: maxC,
  };
}
export const inWindow = (t: Trade, w: Window): boolean => t.entryTime >= w.from && t.entryTime < w.to;

export const f1 = (x: number, d = 1): string => (Number.isFinite(x) ? x.toFixed(d) : x === Infinity ? '∞' : '—');
export const barsOf = (interval: Interval): number => INTERVAL_MS[interval];
