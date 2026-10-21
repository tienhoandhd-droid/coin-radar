// Phần dùng chung giữa run.ts (N1–N3) và n3.ts (phân tích N3): nạp rổ/nến, chạy một phương án, tính chỉ số, bối cảnh lúc vào lệnh.
// Tách nguyên văn từ run.ts (21/10/2026) — không đổi công thức.
import { blockBootstrapMeanCI } from '../../stats.ts';
import { correlation } from '../../../packages/core/risk-cluster.ts';
import { DAY, H4, BAN, exchangeMeta, exclusionReason, allHistSymbols } from './common.ts';
import { makeSeries, makeDaily, topOnDay, simulate, retsUpTo, ret50, P, type Series, type Daily, type Result } from './sim.ts';

export const D = (s: string) => Date.parse(s + 'T00:00:00Z');
export const ds = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const PER = { p1: { from: D('2020-01-01'), toDay: D('2025-12-31') }, p2: { from: D('2026-01-01'), toDay: D('2026-09-18') } };
if (PER.p2.toDay + DAY > BAN) throw new Error('ASSERT: kỳ 2 chạm vùng cấm');

// ---------- rổ ----------
const meta = exchangeMeta();
export const excluded: { sym: string; why: string }[] = [];
let dailies: Map<string, Daily> | null = null;
export function loadDailies(): Map<string, Daily> {
  if (dailies) return dailies;
  dailies = new Map();
  for (const s of allHistSymbols()) {
    const why = exclusionReason(s, meta);
    if (why) { excluded.push({ sym: s, why }); continue; }
    dailies.set(s, makeDaily(s, meta.get(s)?.onboard));
  }
  return dailies;
}
const topCache = new Map<number, string[]>();
export const universe = (dClosed: number) => {
  let u = topCache.get(dClosed);
  if (!u) { u = topOnDay([...loadDailies().values()], dClosed); topCache.set(dClosed, u); }
  return u;
};

const series1d = new Map<string, Series>(), series4h = new Map<string, Series>();
export const get1d = (s: string) => { let x = series1d.get(s); if (!x) { x = makeSeries(s, '1d'); series1d.set(s, x); } return x; };
export const get4h = (s: string) => { let x = series4h.get(s); if (!x) { x = makeSeries(s, '4h'); series4h.set(s, x); } return x; };

export function unionTop(): string[] {
  const u = new Set<string>();
  for (const p of [PER.p1, PER.p2]) for (let d = p.from / DAY - 1; d <= p.toDay / DAY; d++) for (const s of universe(d)) u.add(s);
  return [...u].sort();
}

export function runOne(name: string, tf: '1d' | '4h', basket: boolean, per: { from: number; toDay: number }, extra: Omit<Parameters<typeof simulate>[0], 'name' | 'series' | 'step' | 'from' | 'to' | 'universe' | 'dailies'> = {}): Result {
  const step = tf === '1d' ? DAY : H4;
  const to = per.toDay + DAY - step;
  const map = new Map<string, Series>();
  const syms = basket ? unionTop() : ['BTCUSDT'];
  for (const s of syms) map.set(s, tf === '1d' ? get1d(s) : get4h(s));
  return simulate({ name, series: map, step, from: per.from, to, universe: basket ? universe : null, dailies: basket ? loadDailies() : null, ...extra });
}

// ---------- chỉ số ----------
export type M = { tot: number; cagr: number; dd: number; mar: number; n: number; perYear: number; perDay: number; win: number; mean: number; lo: number; hi: number; pf: number; worst: number; fees: number; fund: number; top5: number; days: number };
export function metrics(r: Result, d0: number, d1: number): M { // d0, d1: ms đầu ngày, bao gồm
  const lo = r.days.indexOf(d0 / DAY), hi = r.days.indexOf(d1 / DAY);
  if (lo < 0 || hi < 0) throw new Error(`${r.name}: thiếu ngày ${ds(d0)}..${ds(d1)} trên đường vốn`);
  const start = lo === 0 ? 10000 : r.eq[lo - 1]!, end = r.eq[hi]!;
  let pk = start, dd = 0; for (let i = lo; i <= hi; i++) { pk = Math.max(pk, r.eq[i]!); dd = Math.max(dd, 1 - r.eq[i]! / pk); }
  const days = hi - lo + 1, tot = end / start - 1, cagr = Math.pow(end / start, 365 / days) - 1;
  const tr = r.trades.filter((t) => t.e >= d0 && t.e < d1 + DAY);
  const pc = tr.map((t) => t.pnl / t.eq0);
  const ci = blockBootstrapMeanCI(pc, tr.map((t) => ds(t.e)), { resamples: 5000, seed: 20261019, alpha: 0.05 });
  const gp = tr.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0), gl = -tr.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0);
  const net = gp - gl;
  const top5 = [...tr].sort((a, b) => b.pnl - a.pnl).slice(0, 5).reduce((s, t) => s + t.pnl, 0);
  return {
    tot, cagr, dd, mar: dd > 0 ? cagr / dd : NaN, n: tr.length, perYear: tr.length / (days / 365), perDay: tr.length / days,
    win: tr.length ? tr.filter((t) => t.pnl > 0).length / tr.length : NaN, mean: ci.mean, lo: ci.lo, hi: ci.hi,
    pf: gl > 0 ? gp / gl : Infinity, worst: tr.length ? Math.max(...pc.map((x) => -x)) : NaN,
    fees: tr.reduce((s, t) => s + t.fees, 0) / start, fund: tr.reduce((s, t) => s + t.fund, 0) / start, top5: net > 0 ? top5 / net : NaN, days,
  };
}
export const pct = (x: number, d = 1) => Number.isFinite(x) ? (x * 100).toFixed(d).replace('.', ',') + '%' : '—';
export const num = (x: number, d = 2) => Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : (x === Infinity ? '∞' : '—');


// ---------- bối cảnh lúc vào lệnh (phân tích N3) — chỉ dùng nến ngày ĐÃ ĐÓNG trước ngày vào và nến 4H đã đóng trước nến vào ----------
// SMA n nến ngày đóng tới hết ngày d (lấy n giá đóng gần nhất có trong tệp); NaN nếu chưa đủ
function smaDaily(x: Daily, d: number, n: number): number {
  let i = x.byDay.get(d);
  if (i === undefined) { i = -1; for (let q = 0; q < x.t.length && Math.floor(x.t[q]! / DAY) <= d; q++) i = q; }
  if (i < n - 1) return NaN;
  let s = 0; for (let k = i - n + 1; k <= i; k++) s += x.c[k]!;
  return s / n;
}
function closeOn(x: Daily, d: number): number { const i = x.byDay.get(d); return i === undefined ? NaN : x.c[i]!; }
// Các trường (đơn vị):
//   btcVsSma50d  giá đóng ngày BTC ÷ SMA50 ngày BTC − 1        coinVsSma50d  như trên cho chính coin
//   dist4hAtr    (giá đóng nến tín hiệu − SMA50 4H) ÷ ATR20 4H  atrPct  ATR20 4H ÷ giá đóng nến tín hiệu
//   rank         hạng thanh khoản trong rổ top 20 (1 = lớn nhất) nOpen  số lệnh đang mở lúc vào (chưa tính lệnh này)
//   corrBtc      tương quan lợi suất log ngày 30 ngày với BTC   fund3d  TB funding quy kỳ 8 giờ trong 3 ngày trước khi vào (tỉ lệ, 0,0001 = 0,01%)
//   ret7, ret30, ret50  lợi suất 7/30/50 ngày của coin tới ngày đã đóng   hour  giờ UTC lúc vào
export function n3Features(sym: string, t: number, i: number, nOpen: number): Record<string, number> {
  const dl = loadDailies(); const d = Math.floor(t / DAY) - 1;
  const x = dl.get(sym)!, btc = dl.get('BTCUSDT')!;
  const s = get4h(sym);
  const cSig = s.b.c[i - 1]!;
  const from = t - 3 * DAY; const fr = s.fund.filter((q) => q.t >= from && q.t < t).map((q) => q.r);
  const cr = sym === 'BTCUSDT' ? 1 : correlation(retsUpTo(x, d), retsUpTo(btc, d), P.corrDays);
  return {
    btcVsSma50d: closeOn(btc, d) / smaDaily(btc, d, 50) - 1,
    coinVsSma50d: closeOn(x, d) / smaDaily(x, d, 50) - 1,
    dist4hAtr: (cSig - s.sma[i - 1]!) / s.atr[i - 1]!,
    atrPct: s.atr[i - 1]! / cSig,
    rank: universe(d).indexOf(sym) + 1,
    nOpen,
    corrBtc: cr ?? NaN,
    fund3d: fr.length ? fr.reduce((a, b) => a + b, 0) / 9 : NaN, // tổng 3 ngày ÷ 9 = TB quy về kỳ 8 giờ (mã kỳ 1/4 giờ cũng so được)
    ret7: closeOn(x, d) / closeOn(x, d - 7) - 1,
    ret30: closeOn(x, d) / closeOn(x, d - 30) - 1,
    ret50: ret50(x, d),
    hour: new Date(t).getUTCHours(),
  };
}
