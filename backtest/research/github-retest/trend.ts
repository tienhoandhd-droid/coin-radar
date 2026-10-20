// J1 (SMA 50/200 cross, Jesse ví dụ) và E1 (EMA walk-forward, arXiv 2602.10785): luôn trong thị trường, lật Long↔Short.
// Định cỡ theo tác giả: 100% số dư mỗi mã (tài khoản riêng từng mã, lãi kép). Không SL → R = NaN, báo lỗ lớn nhất một lệnh.
import type { Candle } from '../../../packages/core/types.ts';
import { DAY, type Funding, fundingPaid, type Trade } from './common.ts';
import type { Variant } from './engine.ts';
import { closes, ema, sma } from './indicators.ts';

export type Side = 'long' | 'short';
// want[i] = phía muốn giữ sau khi nến i đóng (null = giữ nguyên). Khớp giá mở nến i+1.
export function alwaysIn(symbol: string, bars: readonly Candle[], want: readonly (Side | null)[], v: Variant, funding: Funding, from: number, to: number): { trades: Trade[]; daily: Map<number, number> } {
  const f = v.feeSide, slip = v.slip;
  const trades: Trade[] = [];
  const daily = new Map<number, number>(); // chỉ số ngày → giá trị tài khoản (MTM) cuối ngày, bắt đầu 1
  let eq = 1; // vốn thực hiện (lãi kép)
  type Pos = { side: Side; entry: number; entryTime: number };
  let pos: Pos | null = null;
  const dir = (s: Side) => (s === 'long' ? 1 : -1);
  const closeAt = (p: Pos, px: number, t: number, reason: string, openAtEnd = false): null => {
    const exitPx = px * (1 - dir(p.side) * slip);
    const retPct = dir(p.side) * (exitPx / p.entry - 1) * 100;
    const feePct = f * (1 + exitPx / p.entry) * 100;
    const fundingPct = v.funding ? fundingPaid(funding, p.entryTime, t, p.side).paid * 100 : 0;
    const pnlPct = retPct - feePct - fundingPct;
    eq *= 1 + pnlPct / 100;
    trades.push({ symbol, side: p.side, entryTime: p.entryTime, exitTime: t, entry: p.entry, exit: exitPx, pnlPct, R: NaN, retPct, feePct, fundingPct, reason, openAtEnd });
    return null;
  };
  const openAt = (side: Side, px: number, t: number): Pos => ({ side, entry: px * (1 + dir(side) * slip), entryTime: t });
  for (let i = 1; i < bars.length; i++) {
    const c = bars[i]!;
    if (c.openTime >= to) break;
    if (c.openTime < from) continue;
    const w = want[i - 1] ?? null;
    if (pos !== null && v.maxHoldMs !== null && c.openTime >= pos.entryTime + v.maxHoldMs) pos = closeAt(pos, c.open, c.openTime, 'time');
    if (w !== null) {
      if (pos !== null && pos.side !== w) pos = closeAt(pos, c.open, c.openTime, 'flip');
      if (pos === null) pos = openAt(w, c.open, c.openTime);
    }
    let mtm = pos !== null ? eq * (1 + dir(pos.side) * (c.close / pos.entry - 1)) : eq;
    // cháy tài khoản: vốn MTM ≤ 0 (notional 100% số dư, không đòn bẩy nhưng Short có thể lỗ quá 100%) → đóng ở giá cháy, dừng mã này
    if (pos !== null && mtm <= 0) {
      const liqPx = pos.entry * (1 + dir(pos.side)); // giá tại đó vốn = 0 (long: 0, short: 2× giá vào)
      pos = closeAt(pos, liqPx, c.closeTime, 'liquidated');
      eq = 0; mtm = 0; daily.set(Math.floor(c.openTime / DAY), 0);
      break;
    }
    daily.set(Math.floor(c.openTime / DAY), mtm);
  }
  if (pos !== null) { const last = bars[bars.length - 1]!; pos = closeAt(pos, last.close, last.closeTime, 'open-at-end', true); }
  return { trades, daily };
}

// ---- J1: SMA50 > SMA200 → Long, < → Short (Jesse SMACrossover) ----
export function smaCrossWant(bars: readonly Candle[]): (Side | null)[] {
  const c = closes(bars), s50 = sma(c, 50), s200 = sma(c, 200);
  return bars.map((_, i) => (Number.isFinite(s50[i]!) && Number.isFinite(s200[i]!) ? (s50[i]! > s200[i]! ? 'long' : s50[i]! < s200[i]! ? 'short' : null) : null));
}

// ---- E1: cặp EMA (nhanh ∈ {5,7,10,15,20,30}, chậm ∈ {40,50,100,150,200}); Long khi nhanh ≥ chậm, ngược lại Short.
// Walk-forward: cửa sổ huấn luyện Ltr ngày → chọn cặp có Sharpe cao nhất (lợi suất nến-đến-nến, phí 0,1% mỗi lần đổi vị thế) → áp cho Lte ngày kế; bước = Ltr + Lte.
export const EMA_FAST = [5, 7, 10, 15, 20, 30], EMA_SLOW = [40, 50, 100, 150, 200];
export type WfCfg = { train: number; test: number }; // ngày
export function emaWalkForward(bars: readonly Candle[], wf: WfCfg, from: number, to: number, feePerSwitch = 0.001): { want: (Side | null)[]; picks: { from: number; fast: number; slow: number; sharpe: number }[] } {
  const c = closes(bars), n = bars.length;
  const pairs: { fast: number; slow: number; pos: Int8Array }[] = [];
  for (const fa of EMA_FAST) for (const sl of EMA_SLOW) {
    const ef = ema(c, fa), es = ema(c, sl), pos = new Int8Array(n);
    for (let i = 0; i < n; i++) pos[i] = Number.isFinite(ef[i]!) && Number.isFinite(es[i]!) ? (ef[i]! >= es[i]! ? 1 : -1) : 0;
    pairs.push({ fast: fa, slow: sl, pos });
  }
  // lợi suất chiến lược tại nến i: vị thế quyết định ở nến i−1 × (close_i/close_{i−1} − 1) − phí khi đổi vị thế
  const ret = (p: Int8Array, i: number): number => {
    const r = p[i - 1]! * (c[i]! / c[i - 1]! - 1);
    const sw = p[i - 1] !== p[i - 2] && p[i - 2] !== 0 ? (p[i - 1] === 0 ? 0 : 2 * feePerSwitch) : 0;
    return r - sw;
  };
  const want: (Side | null)[] = new Array(n).fill(null);
  const picks: { from: number; fast: number; slow: number; sharpe: number }[] = [];
  const idxAt = (t: number): number => { let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (bars[m]!.openTime < t) lo = m + 1; else hi = m; } return lo; };
  for (let t0 = from; t0 < to; t0 += (wf.train + wf.test) * DAY) {
    const a = idxAt(t0 - wf.train * DAY), b = idxAt(t0), e = Math.min(idxAt(t0 + wf.test * DAY), n);
    if (a < 2 || b - a < 5) continue;
    let best: { fast: number; slow: number; sharpe: number } | null = null;
    for (const p of pairs) {
      let s = 0, s2 = 0, k = 0;
      for (let i = a; i < b; i++) { if (p.pos[i - 1] === 0) continue; const r = ret(p.pos, i); s += r; s2 += r * r; k++; }
      if (k < 5) continue;
      const m = s / k, sd = Math.sqrt(Math.max(s2 / k - m * m, 0));
      const sharpe = sd === 0 ? (m > 0 ? Infinity : -Infinity) : m / sd;
      if (!best || sharpe > best.sharpe) best = { fast: p.fast, slow: p.slow, sharpe };
    }
    if (!best) continue;
    picks.push({ from: t0, ...best });
    const p = pairs.find((x) => x.fast === best!.fast && x.slow === best!.slow)!;
    for (let i = Math.max(b - 1, 0); i < e; i++) want[i] = p.pos[i] === 1 ? 'long' : p.pos[i] === -1 ? 'short' : null;
  }
  return { want, picks };
}
