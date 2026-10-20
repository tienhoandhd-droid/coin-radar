// P1 grid hình học n = 6 (Chen, Chen & Jang, arXiv 2506.11921: dải BTC 10 000–80 000 = tỉ lệ 8 ⇒ k = 8^(1/6) ≈ 1,414 mỗi mức), có/không DGT reset.
// P2 martingale DCA Pionex Standard Mode: vốn 8 phần, mua 1-1-2-4 tại giá vào, −1%, −2%, −3% (ví dụ 1% trong bài Pionex), TP 1% trên giá trung bình (GIẢ ĐỊNH, Pionex không công bố mặc định).
// Đường giá trong nến: nến xanh O→L→H→C, nến đỏ O→H→L→C. Đòn bẩy L: notional = L × M, cháy khi vốn MTM ≤ 0 (≈ giảm 100/L %).
import type { Candle } from '../../../packages/core/types.ts';
import { HOUR, type Funding, FUNDING_FALLBACK, type Trade } from './common.ts';
import type { Variant } from './engine.ts';

export type GridResult = { trades: Trade[]; finalEquity: number; maxDD: number; liquidated: boolean; unrealizedPct: number; realizedPct: number; fills: number; fundingPct: number };
const M = 100;

function pathOf(c: Candle): number[] { return c.close >= c.open ? [c.open, c.low, c.high, c.close] : [c.open, c.high, c.low, c.close]; }
function fundingAt(f: Funding, t: number): number {
  let lo = 0, hi = f.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (f[m]!.t < t - HOUR) lo = m + 1; else hi = m; }
  return lo < f.length && Math.abs(f[lo]!.t - t) <= HOUR ? f[lo]!.r : FUNDING_FALLBACK; // thiếu dữ liệu thật → 0,01% (long trả)
}
function endIndex(bars: readonly Candle[], to: number): number { let e = bars.length - 1; while (e >= 0 && bars[e]!.openTime >= to) e--; return e; }

export function gridSim(symbol: string, bars: readonly Candle[], v: Variant, lev: number, dgt: boolean, funding: Funding, from: number, to: number): GridResult | null {
  const fee = v.feeSide, slip = v.slip, nGrid = 6, k = Math.pow(8, 1 / 6);
  const start = bars.findIndex((c) => c.openTime >= from), end = endIndex(bars, to);
  if (start < 0 || end < start) return null;
  const U = (lev * M) / nGrid; // giá trị mỗi khoảng lưới
  let cash = lev * M, coin = 0, realized = 0, fundPaid = 0, fills = 0;
  let levels: number[] = [];
  const state: ('coin' | 'cash')[] = new Array(nGrid).fill('cash'), qty: number[] = new Array(nGrid).fill(0);
  const trades: Trade[] = [];
  let peak = M, maxDD = 0;
  // dựng lưới quanh p0 (mức 3 = p0): 3 khoảng trên giữ coin, 3 khoảng dưới giữ tiền; cân bằng lại kho coin bằng lệnh thị trường
  function build(p0: number): void {
    levels = []; for (let j = 0; j <= nGrid; j++) levels.push(p0 * Math.pow(k, j - 3));
    const target = 3 * U, cur = coin * p0;
    if (cur < target) { const px = p0 * (1 + slip), q = (target - cur) / px; coin += q; cash -= q * px * (1 + fee); fills++; }
    else if (cur > target) { const px = p0 * (1 - slip), q = (cur - target) / p0; coin -= q; cash += q * px * (1 - fee); fills++; }
    for (let j = 0; j < nGrid; j++) { state[j] = j >= 3 ? 'coin' : 'cash'; qty[j] = j >= 3 ? coin / 3 : 0; }
  }
  build(bars[start]!.open);
  let lastFundT = Math.floor(bars[start]!.openTime / (8 * HOUR)) * 8 * HOUR;
  for (let i = start; i <= end; i++) {
    const c = bars[i]!;
    const path = pathOf(c);
    let prev = path[0]!;
    for (let s = 1; s < path.length; s++) {
      const p = path[s]!;
      if (p > prev) {
        for (let j = 0; j < nGrid; j++) {
          const lv = levels[j + 1]!;
          if (state[j] === 'coin' && prev < lv && p >= lv) {
            const val = qty[j]! * lv, cost = U;
            coin -= qty[j]!; cash += val * (1 - fee); fills++;
            const pnl = val * (1 - fee) - cost * (1 + fee);
            realized += pnl;
            trades.push({ symbol, side: 'long', entryTime: c.openTime, exitTime: c.closeTime, entry: levels[j]!, exit: lv, pnlPct: (pnl / M) * 100, R: NaN, retPct: (lv / levels[j]! - 1) * 100, feePct: fee * 2 * 100, fundingPct: 0, reason: 'grid-sell', openAtEnd: false });
            state[j] = 'cash'; qty[j] = 0;
          }
        }
        if (dgt && p >= levels[nGrid]!) build(p);
      } else if (p < prev) {
        for (let j = nGrid - 1; j >= 0; j--) {
          const lv = levels[j]!;
          if (state[j] === 'cash' && prev > lv && p <= lv) { const q = U / lv; coin += q; cash -= U * (1 + fee); fills++; state[j] = 'coin'; qty[j] = q; }
        }
        if (dgt && p <= levels[0]!) build(p);
      }
      prev = p;
    }
    if (v.funding) for (let t = lastFundT + 8 * HOUR; t <= c.closeTime; t += 8 * HOUR) { const cost = coin * c.close * fundingAt(funding, t); fundPaid += cost; cash -= cost; lastFundT = t; }
    const equity = cash + coin * c.close - (lev - 1) * M;
    peak = Math.max(peak, equity); maxDD = Math.max(maxDD, ((peak - equity) / peak) * 100);
    if (equity <= 0) return { trades, finalEquity: 0, maxDD: 100, liquidated: true, unrealizedPct: -100, realizedPct: (realized / M) * 100, fills, fundingPct: (fundPaid / M) * 100 };
  }
  const equity = cash + coin * bars[end]!.close - (lev - 1) * M;
  return { trades, finalEquity: equity, maxDD, liquidated: false, unrealizedPct: ((equity - M - realized + fundPaid) / M) * 100, realizedPct: (realized / M) * 100, fills, fundingPct: (fundPaid / M) * 100 };
}

export const DCA = { parts: [1, 1, 2, 4], step: 0.01, tp: 0.01 };
type Cycle = { p0: number; t0: number; coin: number; cost: number; filled: number; feeIn: number };
export function dcaSim(symbol: string, bars: readonly Candle[], v: Variant, lev: number, funding: Funding, from: number, to: number): GridResult | null {
  const fee = v.feeSide, slip = v.slip;
  const start = bars.findIndex((c) => c.openTime >= from), end = endIndex(bars, to);
  if (start < 0 || end < start) return null;
  const part = (lev * M) / 8;
  let realized = 0, fundPaid = 0, fills = 0;
  const trades: Trade[] = [];
  let peak = M, maxDD = 0;
  let lastFundT = Math.floor(bars[start]!.openTime / (8 * HOUR)) * 8 * HOUR;
  const open = (px: number, t: number): Cycle => { const p = px * (1 + slip), q = (part * DCA.parts[0]!) / p; fills++; return { p0: px, t0: t, coin: q, cost: q * p, filled: 1, feeIn: q * p * fee }; };
  const closeCycle = (cy: Cycle, px: number, t: number, reason: string, market: boolean, openAtEnd = false): number => {
    const p = market ? px * (1 - slip) : px, val = cy.coin * p;
    const pnl = val * (1 - fee) - cy.cost - cy.feeIn;
    realized += pnl; fills++;
    trades.push({ symbol, side: 'long', entryTime: cy.t0, exitTime: t, entry: cy.cost / cy.coin, exit: p, pnlPct: (pnl / M) * 100, R: NaN, retPct: (p / (cy.cost / cy.coin) - 1) * 100, feePct: fee * 2 * 100, fundingPct: 0, reason, openAtEnd });
    return pnl;
  };
  let cyc: Cycle | null = open(bars[start]!.open, bars[start]!.openTime);
  for (let i = start; i <= end; i++) {
    const c = bars[i]!;
    if (cyc === null) cyc = open(c.open, c.openTime);
    if (v.maxHoldMs !== null && c.openTime >= cyc.t0 + v.maxHoldMs) { closeCycle(cyc, c.open, c.openTime, 'time', true); cyc = open(c.open, c.openTime); }
    const path = pathOf(c);
    let prev = path[0]!;
    for (let s = 1; s < path.length && cyc !== null; s++) {
      const p = path[s]!;
      if (p < prev) {
        while (cyc.filled < 4) {
          const lv = cyc.p0 * (1 - DCA.step * cyc.filled);
          if (p <= lv && prev > lv) { const q = (part * DCA.parts[cyc.filled]!) / lv; cyc.coin += q; cyc.cost += q * lv; cyc.feeIn += q * lv * fee; fills++; cyc.filled++; } else break;
        }
      } else if (p > prev) {
        const tp = (cyc.cost / cyc.coin) * (1 + DCA.tp);
        if (p >= tp && prev < tp) { closeCycle(cyc, tp, c.closeTime, 'tp', false); cyc = null; }
      }
      prev = p;
    }
    if (v.funding && cyc !== null) for (let t = lastFundT + 8 * HOUR; t <= c.closeTime; t += 8 * HOUR) { fundPaid += cyc.coin * c.close * fundingAt(funding, t); lastFundT = t; }
    else lastFundT = Math.floor(c.closeTime / (8 * HOUR)) * 8 * HOUR;
    const unreal = cyc === null ? 0 : cyc.coin * c.close * (1 - fee) - cyc.cost - cyc.feeIn;
    const equity = M + realized + unreal - fundPaid;
    peak = Math.max(peak, equity); maxDD = Math.max(maxDD, ((peak - equity) / peak) * 100);
    if (equity <= 0) return { trades, finalEquity: 0, maxDD: 100, liquidated: true, unrealizedPct: -100, realizedPct: (realized / M) * 100, fills, fundingPct: (fundPaid / M) * 100 };
  }
  let unrealizedPct = 0;
  if (cyc !== null) { const pnl = closeCycle(cyc, bars[end]!.close, bars[end]!.closeTime, 'open-at-end', true, true); unrealizedPct = (pnl / M) * 100; }
  const equity = M + realized - fundPaid;
  return { trades, finalEquity: equity, maxDD, liquidated: false, unrealizedPct, realizedPct: (realized / M) * 100 - unrealizedPct, fills, fundingPct: (fundPaid / M) * 100 };
}
