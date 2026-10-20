// Máy khớp lệnh cho chiến lược tín hiệu (G1–G5, H1, H2). Một vị thế mỗi mã. Tín hiệu tại nến i−1 → khớp giá mở nến i.
// Bản "lạc quan": mô phỏng giả định của bộ backtest gốc (Freqtrade: thứ tự exit-signal → stoploss → ROI → trailing,
//   custom_stoploss cập nhật theo HIGH của nến rồi mới so với LOW; Hummingbot: TP ưu tiên khi cùng nến), phí 0,1%/chiều.
// Bản "bi quan": khớp giá mở nến sau + trượt 0,02%, SL xét trước TP trong cùng nến, stop chỉ cập nhật bằng giá ĐÓNG nến trước,
//   phí khứ hồi 0,136% / 0,4%, funding thật khi giữ qua kỳ funding, giữ tối đa 30 ngày.
import type { Candle } from '../../../packages/core/types.ts';
import { DAY, type Funding, fundingPaid, type Trade } from './common.ts';

export type Variant = { name: 'lac' | 'bq136' | 'bq400'; label: string; feeSide: number; slip: number; conservative: boolean; maxHoldMs: number | null; funding: boolean };
export const VARIANTS: Variant[] = [
  { name: 'lac', label: 'lạc quan (phí 0,1% khứ hồi)', feeSide: 0.0005, slip: 0, conservative: false, maxHoldMs: null, funding: false },
  { name: 'bq136', label: 'bi quan 0,136%', feeSide: 0.00068, slip: 0.0002, conservative: true, maxHoldMs: 30 * DAY, funding: true },
  { name: 'bq400', label: 'bi quan 0,4%', feeSide: 0.002, slip: 0.0002, conservative: true, maxHoldMs: 30 * DAY, funding: true },
];

export type ExitCfg = {
  family: 'freqtrade' | 'hummingbot';
  roi: number | null; // Freqtrade minimal_roi "0": lãi RÒNG (đã trừ phí) — quy ra giá
  tp: number | null; // Hummingbot take_profit theo giá
  sl: number; // khoảng cách stop cứng theo giá (dương, vd 0,05); dùng để định cỡ 2% rủi ro
  customStop: ((profit: number) => number) | null; // BigZ04: trả sl_profit (so với giá vào, âm = dưới) theo lãi ròng hiện tại; stop chỉ siết lên
  trailing: { act: number; delta: number } | null; // Hummingbot: kích hoạt khi lãi ròng ≥ act, dừng tại lãi tốt nhất − delta
  timeLimitMs: number | null;
  ignoreRoiIfEntry: boolean;
  useExitSignal: boolean;
};
export type Signals = { enterLong: Uint8Array; exitLong: Uint8Array; enterShort: Uint8Array; exitShort: Uint8Array };
export const emptySignals = (n: number): Signals => ({ enterLong: new Uint8Array(n), exitLong: new Uint8Array(n), enterShort: new Uint8Array(n), exitShort: new Uint8Array(n) });

export type SimOpts = {
  symbol: string; bars: readonly Candle[]; sig: Signals; cfg: ExitCfg; v: Variant;
  notionalMult: number; // notional / vốn (vd 0,4 khi SL 5% và rủi ro 2%)
  riskPct: number | null; // 2 khi định cỡ theo SL → R = pnl% / riskPct; null → R = NaN
  allowEntry: (i: number) => boolean; // nến tín hiệu i có được vào không (top-200 theo thời điểm)
  from: number; to: number; funding: Funding;
};

type Pos = { side: 'long' | 'short'; entryIdx: number; entryTime: number; entry: number; stop: number; stop0: number; trailOn: boolean; best: number };

export function simulate(o: SimOpts): Trade[] {
  const { bars, sig, cfg, v } = o;
  const f = v.feeSide, slip = v.slip;
  const trades: Trade[] = [];
  let pos: Pos | null = null;
  const n = bars.length;
  // lãi ròng kiểu Freqtrade (đã trừ phí 2 chiều) tại giá p
  const netProfit = (p: Pos, price: number): number => (p.side === 'long' ? (price * (1 - f)) / (p.entry * (1 + f)) - 1 : 1 - (price * (1 + f)) / (p.entry * (1 - f)));
  // giá tương ứng một mức lãi ròng r (nghịch đảo của netProfit)
  const priceForNet = (p: Pos, r: number): number => (p.side === 'long' ? (p.entry * (1 + r) * (1 + f)) / (1 - f) : (p.entry * (1 - r) * (1 - f)) / (1 + f));
  const dir = (p: Pos): number => (p.side === 'long' ? 1 : -1);
  const fill = (price: number, adverse: boolean, p: Pos): number => price * (1 + (adverse ? 1 : -1) * dir(p) * slip);

  function close(p: Pos, i: number, exitPx: number, reason: string, atOpen: boolean, openAtEnd = false): void {
    const exitTime = atOpen ? bars[i]!.openTime : bars[i]!.closeTime;
    const retPct = dir(p) * (exitPx / p.entry - 1) * 100;
    const feePct = f * (1 + exitPx / p.entry) * 100;
    let fundingPct = 0;
    if (v.funding) fundingPct = fundingPaid(o.funding, p.entryTime, exitTime, p.side).paid * 100;
    const pnlNotional = retPct - feePct - fundingPct; // % trên notional
    const pnlPct = pnlNotional * o.notionalMult;
    trades.push({ symbol: o.symbol, side: p.side, entryTime: p.entryTime, exitTime, entry: p.entry, exit: exitPx, pnlPct, R: o.riskPct === null ? NaN : pnlPct / o.riskPct, retPct, feePct, fundingPct, reason, openAtEnd });
    pos = null;
  }

  for (let i = 1; i < n; i++) {
    const c = bars[i]!;
    if (c.openTime >= o.to) break;
    // ---- vào lệnh: tín hiệu nến i−1, khớp giá mở nến i ----
    if (pos === null && c.openTime >= o.from && o.allowEntry(i - 1)) {
      const side: 'long' | 'short' | null = sig.enterLong[i - 1] ? 'long' : sig.enterShort[i - 1] ? 'short' : null;
      if (side !== null) {
        const p: Pos = { side, entryIdx: i, entryTime: c.openTime, entry: 0, stop: 0, stop0: 0, trailOn: false, best: 0 };
        p.entry = fill(c.open, true, p);
        p.stop = cfg.customStop ? priceForNet(p, cfg.customStop(-1)) : p.entry * (1 - dir(p) * cfg.sl);
        p.stop0 = p.stop; p.best = p.entry;
        pos = p;
      }
    }
    if (pos === null) continue;
    const p: Pos = pos;
    const d = dir(p);
    const adverse = p.side === 'long' ? c.low : c.high; // giá bất lợi nhất trong nến
    const favorable = p.side === 'long' ? c.high : c.low;
    const hitStop = (stop: number): boolean => (p.side === 'long' ? adverse <= stop : adverse >= stop);
    const gapThrough = (stop: number): boolean => (p.side === 'long' ? c.open <= stop : c.open >= stop);
    // Freqtrade backtesting._get_close_rate_for_stoploss: khớp tại giá stop; chỉ khớp giá MỞ khi stop nằm ngoài cả nến (stop > high với long)
    const stopFillOptimistic = (stop: number): number => (p.side === 'long' ? (stop > c.high ? c.open : stop) : stop < c.low ? c.open : stop);
    const reached = (px: number): boolean => (p.side === 'long' ? favorable >= px : favorable <= px);
    const exitSig = i > p.entryIdx && cfg.useExitSignal && (p.side === 'long' ? sig.exitLong[i - 1] : sig.exitShort[i - 1]) === 1;
    const enterSig = (p.side === 'long' ? sig.enterLong[i - 1] : sig.enterShort[i - 1]) === 1;
    const expired = (cfg.timeLimitMs !== null && c.openTime >= p.entryTime + cfg.timeLimitMs) || (v.maxHoldMs !== null && c.openTime >= p.entryTime + v.maxHoldMs);

    if (!v.conservative) {
      // ===== LẠC QUAN =====
      if (expired) { close(p, i, c.open, 'time', true); continue; }
      if (cfg.family === 'freqtrade') {
        if (exitSig) { close(p, i, c.open, 'signal', true); continue; }
        // custom_stoploss (Freqtrade backtest): tính theo HIGH (bound) rồi mới so với LOW
        if (cfg.customStop) {
          const cand = priceForNet(p, cfg.customStop(netProfit(p, favorable)));
          if (d * (cand - p.stop) > 0) p.stop = cand;
        }
        if (hitStop(p.stop)) { close(p, i, stopFillOptimistic(p.stop), p.stop === p.stop0 ? 'sl' : 'trail', false); continue; }
        if (cfg.roi !== null && !(cfg.ignoreRoiIfEntry && enterSig)) {
          const roiPx = priceForNet(p, cfg.roi);
          if (reached(roiPx)) { close(p, i, p.side === 'long' ? Math.max(roiPx, c.open) : Math.min(roiPx, c.open), 'roi', false); continue; }
        }
      } else {
        // Hummingbot: TP (theo high) ưu tiên, rồi trailing (theo lãi ròng tốt nhất), rồi SL theo low
        if (cfg.tp !== null) {
          const tpPx = p.entry * (1 + d * cfg.tp);
          if (reached(tpPx)) { close(p, i, p.side === 'long' ? Math.max(tpPx, c.open) : Math.min(tpPx, c.open), 'tp', false); continue; }
        }
        if (cfg.trailing) {
          if (d * (favorable - p.best) > 0) p.best = favorable;
          if (!p.trailOn && netProfit(p, p.best) >= cfg.trailing.act) p.trailOn = true;
          if (p.trailOn) {
            const ts = priceForNet(p, netProfit(p, p.best) - cfg.trailing.delta);
            if (d * (ts - p.stop) > 0) p.stop = ts;
          }
        }
        if (hitStop(p.stop)) { close(p, i, stopFillOptimistic(p.stop), p.stop === p.stop0 ? 'sl' : 'trail', false); continue; }
      }
    } else {
      // ===== BI QUAN =====
      if (expired) { close(p, i, fill(c.open, true, p), 'time', true); continue; }
      if (exitSig) { close(p, i, fill(c.open, true, p), 'signal', true); continue; }
      // stop như đã biết ở cuối nến trước (không cập nhật bằng high nến này); khớp có trượt giá
      if (hitStop(p.stop)) { close(p, i, fill(gapThrough(p.stop) ? c.open : p.stop, true, p), p.stop === p.stop0 ? 'sl' : 'trail', false); continue; }
      const tpPx = cfg.roi !== null && !(cfg.ignoreRoiIfEntry && enterSig) ? priceForNet(p, cfg.roi) : cfg.tp !== null ? p.entry * (1 + d * cfg.tp) : null;
      if (tpPx !== null && reached(tpPx)) { close(p, i, p.side === 'long' ? Math.max(tpPx, c.open) : Math.min(tpPx, c.open), cfg.roi !== null ? 'roi' : 'tp', false); continue; }
      // cập nhật stop bằng giá đóng nến này (dùng cho nến sau)
      if (cfg.customStop) {
        const cand = priceForNet(p, cfg.customStop(netProfit(p, c.close)));
        if (d * (cand - p.stop) > 0) p.stop = cand;
      }
      if (cfg.trailing) {
        if (d * (c.close - p.best) > 0) p.best = c.close;
        if (!p.trailOn && netProfit(p, p.best) >= cfg.trailing.act) p.trailOn = true;
        if (p.trailOn) { const ts = priceForNet(p, netProfit(p, p.best) - cfg.trailing.delta); if (d * (ts - p.stop) > 0) p.stop = ts; }
      }
    }
  }
  if (pos !== null) {
    const p: Pos = pos; const i = n - 1;
    close(p, i, fill(bars[i]!.close, true, p), 'open-at-end', false, true);
  }
  return trades;
}

// Kiểm nhìn trước (shift test): tín hiệu tại các nến < n−k phải y hệt khi cắt bỏ k nến cuối.
export function shiftTest(name: string, bars: readonly Candle[], make: (b: readonly Candle[]) => Signals, k = 60): void {
  if (bars.length < k + 50) return;
  const full = make(bars), cut = make(bars.slice(0, bars.length - k));
  const m = bars.length - k;
  for (const key of ['enterLong', 'exitLong', 'enterShort', 'exitShort'] as const) {
    for (let i = 0; i < m; i++) if (full[key][i] !== cut[key][i]) throw new Error(`NHÌN TRƯỚC: ${name} ${key} khác tại nến ${i}/${m} khi cắt ${k} nến cuối`);
  }
}
