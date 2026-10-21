// Bộ mô phỏng nhiều mã, vốn chung cho kế hoạch ĐĂNG KÝ TRƯỚC docs/superpowers/plans/2026-10-21-tang-so-lenh.md.
// Luật gốc S-sma (đã khóa) chép NGUYÊN công thức của backtest/research/btc-regime-sim.ts chạy GUARD=1, kind 'sma', sized:
//   SMA50 giá đóng; ATR20 Wilder (khởi tạo = TB 20 TR đầu, TR từ nến thứ 2); SL = giá vào − 2,5 × ATR của nến ĐÃ ĐÓNG trước nến vào;
//   khối lượng = min(vốn, 2% vốn / d2) / giá vào, d2 = khoảng SL% + 2 × 0,0575% + 0,02%; vào/ra ở giá mở nến kế tiếp;
//   funding trả theo từng kỳ (giá nội suy trong nến); chốt chặn funding siết SL mỗi nến; SL khớp min(SL, giá mở) × (1 − 0,02%).
// Phần danh mục (N1, N3): vốn chung, tối đa 10 lệnh mở, tổng rủi ro mở ≤ 10% vốn (lệnh mới giảm khối lượng cho vừa, như canOpen),
//   lọc tương quan risk-cluster mặc định (lợi suất log ngày 30 ngày ≥ 0,7 với lệnh đang mở cùng phía → bỏ; thiếu số liệu → bỏ),
//   nhiều tín hiệu cùng lúc → ưu tiên lợi suất 50 ngày cao nhất. Hàm correlation dùng lại từ packages/core/risk-cluster.ts.
import { correlation } from '../../../packages/core/risk-cluster.ts';
import { type Bars, type Fund, DAY, H4, BAN, assertBefore, load1d, load4h, loadFunding } from './common.ts';

export const P = { sma: 50, atrN: 20, slAtr: 2.5, risk: 0.02, side: 0.000575, slip: 0.0002, maxOpen: 10, maxOpenRisk: 0.10, corrDays: 30, corrMax: 0.7, top: 20, qvDays: 30, minListDays: 60, retDays: 50, fallbackFund: 0.0001 };

export type Series = { sym: string; step: number; b: Bars; idx: Map<number, number>; sma: number[]; atr: number[]; fund: Fund[]; realFund: boolean };

export function indicators(b: Bars): { sma: number[]; atr: number[] } {
  const n = b.t.length;
  const sma = new Array<number>(n).fill(NaN), atr = new Array<number>(n).fill(NaN);
  for (let i = P.sma - 1; i < n; i++) { let s = 0; for (let k = i - P.sma + 1; k <= i; k++) s += b.c[k]!; sma[i] = s / P.sma; }
  const tr = (m: number) => Math.max(b.h[m]! - b.l[m]!, Math.abs(b.h[m]! - b.c[m - 1]!), Math.abs(b.l[m]! - b.c[m - 1]!));
  for (let i = P.atrN; i < n; i++) {
    if (i === P.atrN) { let a = 0; for (let m = 1; m <= i; m++) a += tr(m); atr[i] = a / P.atrN; }
    else atr[i] = (atr[i - 1]! * (P.atrN - 1) + tr(i)) / P.atrN;
  }
  return { sma, atr };
}

export const stats = { droppedBars: 0, droppedFund: 0, synthFundSyms: new Set<string>(), gaps: 0, delistCloses: 0 };

export function makeSeries(sym: string, tf: '1d' | '4h'): Series {
  const st = { dropped: 0 };
  const b = tf === '1d' ? load1d(sym, st) : load4h(sym, st);
  stats.droppedBars += st.dropped;
  const step = tf === '1d' ? DAY : H4;
  for (let i = 1; i < b.t.length; i++) if (b.t[i]! - b.t[i - 1]! !== step) stats.gaps++;
  const fs = { dropped: 0 };
  let fund = loadFunding(sym, fs); stats.droppedFund += fs.dropped;
  const realFund = fund !== null;
  if (fund === null) { // không có funding thật → 0,01% mỗi 8 giờ (00:00, 08:00, 16:00 UTC) trong khoảng có nến
    stats.synthFundSyms.add(sym);
    fund = [];
    if (b.t.length) for (let t = Math.ceil(b.t[0]! / (8 * 3_600_000)) * 8 * 3_600_000; t < b.t[b.t.length - 1]! + step && t < BAN; t += 8 * 3_600_000) fund.push({ t, r: P.fallbackFund });
  }
  for (const f of fund) assertBefore(f.t, `funding ${sym}`);
  const { sma, atr } = indicators(b);
  return { sym, step, b, idx: new Map(b.t.map((t, i) => [t, i])), sma, atr, fund, realFund };
}

// ---------- dữ liệu ngày cho rổ: xếp hạng thanh khoản, lợi suất 50 ngày, lợi suất log cho tương quan ----------
export type Daily = { sym: string; byDay: Map<number, number>; t: number[]; c: number[]; qv: number[]; listDay: number };
export function makeDaily(sym: string, onboard: number | undefined): Daily {
  const st = { dropped: 0 };
  const b = load1d(sym, st); stats.droppedBars += st.dropped;
  const days = b.t.map((t) => Math.floor(t / DAY));
  const first = days.length ? days[0]! : Infinity;
  const listDay = onboard !== undefined && Number.isFinite(onboard) ? Math.min(Math.floor(onboard / DAY), first) : first;
  return { sym, byDay: new Map(days.map((d, i) => [d, i])), t: b.t, c: b.c, qv: b.qv, listDay };
}

// top 20 theo TB quoteVolume 30 ngày (đủ 30 nến ngày liền nhau tới hết ngày d), niêm yết ≥ 60 ngày
export function topOnDay(dailies: Daily[], d: number): string[] {
  const cand: { s: string; v: number }[] = [];
  for (const x of dailies) {
    if (d - x.listDay < P.minListDays) continue;
    const i = x.byDay.get(d); if (i === undefined || i < P.qvDays - 1) continue;
    if (Math.floor(x.t[i - P.qvDays + 1]! / DAY) !== d - P.qvDays + 1) continue; // thiếu nến trong 30 ngày
    let s = 0; for (let k = i - P.qvDays + 1; k <= i; k++) s += x.qv[k]!;
    cand.push({ s: x.sym, v: s / P.qvDays });
  }
  cand.sort((a, b) => b.v - a.v || (a.s < b.s ? -1 : 1));
  return cand.slice(0, P.top).map((x) => x.s);
}
export function ret50(x: Daily, d: number): number {
  const i = x.byDay.get(d), j = x.byDay.get(d - P.retDays);
  return i === undefined || j === undefined ? NaN : x.c[i]! / x.c[j]! - 1;
}
// lợi suất log ngày (khóa = openTime của nến sau), chỉ các nến ngày ≤ d (đã đóng trước quyết định), lấy 2×corrDays gần nhất
function retsUpTo(x: Daily, d: number): Map<number, number> {
  const m = new Map<number, number>();
  const i = x.byDay.get(d) ?? (() => { let k = -1; for (let q = 0; q < x.t.length && Math.floor(x.t[q]! / DAY) <= d; q++) k = q; return k; })();
  for (let k = Math.max(1, i - 2 * P.corrDays); k <= i; k++) {
    if (x.t[k]! - x.t[k - 1]! !== DAY || !(x.c[k - 1]! > 0) || !(x.c[k]! > 0)) continue;
    m.set(x.t[k]!, Math.log(x.c[k]! / x.c[k - 1]!));
  }
  return m;
}

// ---------- mô phỏng ----------
export type Trade = { sym: string; e: number; x: number; pnl: number; fund: number; fees: number; eq0: number; reason: string };
type Pos = { s: Series; qty: number; entry: number; sl: number; eq0: number; e: number; fund: number; cost: number; fi: number; want: number };
export type Result = { name: string; days: number[]; eq: number[]; trades: Trade[]; corrBlocked: number; riskTrimmed: number; riskBlocked: number; maxOpenBlocked: number; maxConcurrent: number };

export function simulate(o: {
  name: string; series: Map<string, Series>; step: number; from: number; to: number; // [from, to] theo ms mốc mở nến; to = mở nến cuối cùng
  universe: ((dClosed: number) => string[]) | null; // null = chỉ BTC (một mã)
  dailies: Map<string, Daily> | null;
}): Result {
  const { series, step } = o;
  let cash = 10000;
  const open = new Map<string, Pos>();
  const trades: Trade[] = []; const days: number[] = []; const eq: number[] = [];
  let pending: { sym: string; r: number }[] = []; // ứng viên vào lệnh ở giá mở nến kế tiếp (đã xếp theo lợi suất 50 ngày giảm dần)
  let corrBlocked = 0, riskTrimmed = 0, riskBlocked = 0, maxOpenBlocked = 0, maxConcurrent = 0;
  const mark = (p: Pos, t: number, which: 'o' | 'c' | 'l') => {
    const i = p.s.idx.get(t);
    if (i === undefined) { let k = -1; for (const [tt, ii] of p.s.idx) if (tt < t && ii > k) k = ii; return p.s.b.c[k]!; }
    return p.s.b[which][i]!;
  };
  const closePos = (p: Pos, t: number, px: number, reason: string) => {
    const c = P.side * px * p.qty;
    cash += p.qty * px - c;
    const pnl = p.qty * (px - p.entry) - p.cost - c - p.fund;
    trades.push({ sym: p.s.sym, e: p.e, x: t, pnl, fund: p.fund, fees: p.cost + c, eq0: p.eq0, reason });
    open.delete(p.s.sym);
  };
  const payF = (p: Pos, upto: number) => {
    const f = p.s.fund;
    while (p.fi < f.length && f[p.fi]!.t <= upto) {
      const x = f[p.fi++]!;
      const bt = Math.floor(x.t / step) * step; const j = p.s.idx.get(bt);
      if (j === undefined) continue; // không có nến chứa kỳ funding (như mô phỏng gốc: bỏ)
      const frac = (x.t - bt) / step; const px = p.s.b.o[j]! + (p.s.b.c[j]! - p.s.b.o[j]!) * frac;
      const amt = p.qty * px * x.r; cash -= amt; p.fund += amt;
    }
  };
  const riskOf = (p: Pos) => p.sl >= p.entry ? 0 : Math.max(0, (p.entry - p.sl) * p.qty + p.cost + p.fund + (P.side + P.slip) * p.sl * p.qty);
  for (let t = o.from; t <= o.to; t += step) {
    assertBefore(t + step - 1, 'nến mô phỏng');
    // 0) mã hết dữ liệu (hủy niêm yết) khi đang giữ → đóng ở giá đóng nến cuối cùng có được
    for (const p of [...open.values()]) {
      const last = p.s.b.t[p.s.b.t.length - 1]!;
      if (last < t) { closePos(p, last, p.s.b.c[p.s.b.t.length - 1]!, 'hết-dữ-liệu'); stats.delistCloses++; }
    }
    // funding tại mốc mở nến (thuộc vị thế giữ qua mốc), rồi lệnh ra theo tín hiệu tắt
    for (const p of open.values()) payF(p, t);
    for (const p of [...open.values()]) { const i = p.s.idx.get(t); if (i !== undefined && p.want === 0) closePos(p, t, p.s.b.o[i]!, 'tín-hiệu-tắt'); }
    // 1) vào lệnh tại giá mở
    const dClosedPrev = Math.floor(t / DAY) - 1; // nến ngày đã đóng trước thời điểm vào lệnh
    for (const c of pending) {
      const s = series.get(c.sym)!; const i = s.idx.get(t);
      if (i === undefined || open.has(c.sym)) continue;
      if (open.size >= P.maxOpen) { maxOpenBlocked++; continue; }
      if (o.dailies && open.size) {
        const rNew = retsUpTo(o.dailies.get(c.sym)!, dClosedPrev);
        let bad = false;
        for (const q of open.values()) {
          const cr = correlation(rNew, retsUpTo(o.dailies.get(q.s.sym)!, dClosedPrev), P.corrDays);
          if (cr === null || cr >= P.corrMax) { bad = true; break; }
        }
        if (bad) { corrBlocked++; continue; }
      }
      let eqNow = cash; for (const q of open.values()) eqNow += q.qty * mark(q, t, 'o');
      const entry = s.b.o[i]!; const a = s.atr[i - 1];
      if (a === undefined || !Number.isFinite(a)) continue; // chưa có ATR → không vào
      const sl = entry - P.slAtr * a; const dist = (entry - sl) / entry;
      const d2 = dist + 2 * P.side + P.slip;
      let qty = Math.min(eqNow, (P.risk * eqNow) / d2) / entry;
      let openRisk = 0; for (const q of open.values()) openRisk += riskOf(q);
      const room = P.maxOpenRisk * eqNow - openRisk;
      if (qty * entry * d2 > room) {
        if (!(room > 0)) { riskBlocked++; continue; }
        qty = room / (entry * d2); riskTrimmed++;
      }
      if (!(qty > 0)) continue;
      const cost = P.side * entry * qty; cash -= entry * qty + cost;
      let fi = 0; while (fi < s.fund.length && s.fund[fi]!.t <= t) fi++;
      open.set(c.sym, { s, qty, entry, sl, eq0: eqNow, e: t, fund: 0, cost, fi, want: 1 });
    }
    maxConcurrent = Math.max(maxConcurrent, open.size);
    // 2) trong nến: funding còn lại, chốt chặn funding, chạm SL
    for (const p of [...open.values()]) {
      const i = p.s.idx.get(t); if (i === undefined) continue;
      payF(p, t + step - 1);
      const roomG = P.risk * p.eq0 - p.cost - p.fund - (P.side + P.slip) * p.sl * p.qty;
      const slMin = p.entry - roomG / p.qty;
      if (slMin > p.sl) p.sl = slMin;
      if (p.s.b.l[i]! <= p.sl) closePos(p, t, Math.min(p.sl, p.s.b.o[i]!) * (1 - P.slip), 'SL');
    }
    let eqClose = cash; for (const p of open.values()) eqClose += p.qty * mark(p, t, 'c');
    let eqLow = cash; for (const p of open.values()) eqLow += p.qty * mark(p, t, 'l');
    if (eqLow <= 0) throw new Error(`${o.name}: vốn ≤ 0 tại ${new Date(t).toISOString()} — cần xử lý thanh lý`);
    // 3) cuối kỳ: đóng ở giá đóng
    const last = t + step > o.to;
    if (last) for (const p of [...open.values()]) closePos(p, t, mark(p, t, 'c'), 'hết-kỳ');
    if ((t + step) % DAY === 0) { days.push(Math.floor(t / DAY)); eq.push(last ? cash : eqClose); }
    // 4) tín hiệu tại đóng nến
    const dClosed = Math.floor((t + step) / DAY) - 1;
    for (const p of open.values()) { const i = p.s.idx.get(t); if (i !== undefined) p.want = Number.isFinite(p.s.sma[i]!) && p.s.b.c[i]! > p.s.sma[i]! ? 1 : 0; }
    pending = [];
    if (!last) {
      const uni = o.universe ? o.universe(dClosed) : ['BTCUSDT'];
      for (const sym of uni) {
        if (open.has(sym)) continue;
        const s = series.get(sym); if (!s) throw new Error(`${o.name}: thiếu nến cho ${sym} (mã trong rổ)`);
        const i = s.idx.get(t); if (i === undefined) continue;
        if (!(Number.isFinite(s.sma[i]!) && s.b.c[i]! > s.sma[i]!)) continue;
        pending.push({ sym, r: o.dailies ? ret50(o.dailies.get(sym)!, dClosed) : 0 });
      }
      // ưu tiên lợi suất 50 ngày cao nhất (thiếu số liệu → xếp cuối)
      pending.sort((a, b) => (Number.isNaN(b.r) ? -Infinity : b.r) - (Number.isNaN(a.r) ? -Infinity : a.r) || (a.sym < b.sym ? -1 : 1));
    }
  }
  return { name: o.name, days, eq, trades, corrBlocked, riskTrimmed, riskBlocked, maxOpenBlocked, maxConcurrent };
}
