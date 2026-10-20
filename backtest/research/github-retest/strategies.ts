// Luật vào/ra port NGUYÊN từ mã nguồn (data/external/…, chỉ đọc). Không chỉnh tham số.
// Tất cả chạy trên 15m (gốc 1m/5m không có dữ liệu) — G4/G5 thêm 1h gộp từ 15m. H1 chạy 15m và 1h, H2 chạy 1h.
import type { Candle } from '../../../packages/core/types.ts';
import { HOUR } from '../../data.ts';
import { aggregateHourly, bbands, cci, closes, ema, informativeIndex, macd, mfi, rollingMax, rollingMean, rollingMin, rsi, sma, typical } from './indicators.ts';
import { emptySignals, type ExitCfg, type Signals } from './engine.ts';

export type Strategy = { id: string; name: string; source: string; interval: '15m' | '1h'; cfg: ExitCfg; make: (bars: readonly Candle[]) => Signals; warmupBars: number };
const fin = (...xs: number[]): boolean => xs.every((x) => Number.isFinite(x));

// ---------- G1 BinHV45 (freqtrade-strategies/berlinguyinca/BinHV45.py) ----------
function binHV45(bars: readonly Candle[]): Signals {
  const s = emptySignals(bars.length);
  const c = closes(bars), bb = bbands(c, 40, 2, 1);
  for (let i = 1; i < bars.length; i++) {
    const close = c[i]!, lowerPrev = bb.lower[i - 1]!;
    const bbdelta = Math.abs(bb.mid[i]! - bb.lower[i]!), closedelta = Math.abs(close - c[i - 1]!), tail = Math.abs(close - bars[i]!.low);
    if (!fin(lowerPrev, bbdelta)) continue;
    if (lowerPrev > 0 && bbdelta > (close * 7) / 1000 && closedelta > (close * 17) / 1000 && tail < (bbdelta * 25) / 1000 && close < lowerPrev && close <= c[i - 1]!) s.enterLong[i] = 1;
  }
  return s;
}
export const G1: Strategy = { id: 'G1', name: 'BinHV45', source: 'freqtrade/freqtrade-strategies', interval: '15m', warmupBars: 60,
  cfg: { family: 'freqtrade', roi: 0.0125, tp: null, sl: 0.05, customStop: null, trailing: null, timeLimitMs: null, ignoreRoiIfEntry: false, useExitSignal: false }, make: binHV45 };

// ---------- G2 ClucMay72018 ----------
function cluc(bars: readonly Candle[]): Signals {
  const s = emptySignals(bars.length);
  const c = closes(bars), e50 = ema(c, 50), bb = bbands(typical(bars), 20, 2, 1), vm = rollingMean(bars.map((b) => b.volume), 30);
  for (let i = 1; i < bars.length; i++) {
    const close = c[i]!;
    if (!fin(e50[i]!, bb.lower[i]!, vm[i - 1]!)) continue;
    if (close < e50[i]! && close < 0.985 * bb.lower[i]! && bars[i]!.volume < vm[i - 1]! * 20) s.enterLong[i] = 1;
    if (close > bb.mid[i]!) s.exitLong[i] = 1;
  }
  return s;
}
export const G2: Strategy = { id: 'G2', name: 'ClucMay72018', source: 'freqtrade/freqtrade-strategies', interval: '15m', warmupBars: 80,
  cfg: { family: 'freqtrade', roi: 0.01, tp: null, sl: 0.05, customStop: null, trailing: null, timeLimitMs: null, ignoreRoiIfEntry: false, useExitSignal: true }, make: cluc };

// ---------- G3 SMAOffsetProtectOptV1 (PeetCrypto/freqtrade-stuff) ----------
function smaOffset(bars: readonly Candle[]): Signals {
  const s = emptySignals(bars.length);
  const c = closes(bars), e16 = ema(c, 16), e49 = ema(c, 49), e50 = ema(c, 50), e200 = ema(c, 200), r = rsi(c, 14);
  for (let i = 0; i < bars.length; i++) {
    const close = c[i]!, vol = bars[i]!.volume;
    if (!fin(e16[i]!, e49[i]!, e50[i]!, e200[i]!, r[i]!)) continue;
    const ewo = ((e50[i]! - e200[i]!) / close) * 100;
    if (close < e16[i]! * 0.978 && vol > 0 && ((ewo > 5.638 && r[i]! < 61) || ewo < -19.993)) s.enterLong[i] = 1;
    if (close > e49[i]! * 1.006 && vol > 0) s.exitLong[i] = 1;
  }
  return s;
}
export const G3: Strategy = { id: 'G3', name: 'SMAOffsetProtectOptV1', source: 'PeetCrypto/freqtrade-stuff', interval: '15m', warmupBars: 250,
  cfg: { family: 'freqtrade', roi: 0.01, tp: null, sl: 0.5, customStop: null, trailing: null, timeLimitMs: null, ignoreRoiIfEntry: true, useExitSignal: true }, make: smaOffset };

// ---------- G4 ReinforcedQuickie (5m + resample 1h → 15m + 1h gộp) ----------
// Gốc nội suy SMA25(1h) theo thời gian về từng nến nhỏ, kéo tới nến 1h CHƯA đóng (nhìn trước). Bản port dùng nến 1h đã đóng gần nhất.
function quickie(bars: readonly Candle[]): Signals {
  const s = emptySignals(bars.length);
  const c = closes(bars), e5 = ema(c, 5), e12 = ema(c, 12);
  // mã gốc tính BB trên typical rồi GHI ĐÈ bằng BB trên close ("required for graphing") → dải hiệu lực là BB(close,20,2)
  const bb = bbands(c, 20, 2, 1), mn = rollingMin(c, 12), mx = rollingMax(c, 12), cc = cci(bars, 14), mf = mfi(bars, 14), r = rsi(c, 7);
  const avg = bars.map((b) => (b.open + b.high + b.low + b.close) / 4), vm = rollingMean(bars.map((b) => b.volume), 30);
  const hourly = aggregateHourly(bars), hs = sma(closes(hourly), 25), hidx = informativeIndex(bars, hourly);
  for (let i = 8; i < bars.length; i++) {
    const b = bars[i]!, close = c[i]!, j = hidx[i]!;
    if (j < 1 || !fin(e5[i]!, e12[i]!, bb.lower[i]!, mn[i]!, mx[i]!, cc[i - 1]!, mf[i - 1]!, r[i - 1]!, vm[i - 1]!, hs[j]!, hs[j - 1]!)) continue;
    const condA = close < e5[i]! && close < e12[i]! && close === mn[i]! && close <= bb.lower[i]!;
    const condB = avg[i - 5]! > avg[i - 4]! && avg[i - 4]! > avg[i - 3]! && avg[i - 3]! > avg[i - 2]! && avg[i - 2]! > avg[i - 1]! && avg[i - 1]! < avg[i]!
      && bars[i - 1]!.low < bb.mid[i]! && cc[i - 1]! < -100 && r[i - 1]! < 30 && mf[i - 1]! < 30;
    const safe = b.volume < vm[i - 1]! * 20 && hs[j]! < close && hs[j - 1]! < hs[j]!;
    if ((condA || condB) && safe) s.enterLong[i] = 1;
    const exitA = close > e5[i]! && close > e12[i]! && close >= mx[i]! && close >= bb.upper[i]! && mf[i]! > 80;
    let green = true; for (let k = 0; k < 8; k++) if (!(bars[i - k]!.open < bars[i - k]!.close)) { green = false; break; }
    if (exitA || (green && r[i]! > 70)) s.exitLong[i] = 1;
  }
  return s;
}
export const G4: Strategy = { id: 'G4', name: 'ReinforcedQuickie', source: 'freqtrade/freqtrade-strategies', interval: '15m', warmupBars: 4 * 30,
  cfg: { family: 'freqtrade', roi: 0.01, tp: null, sl: 0.05, customStop: null, trailing: null, timeLimitMs: null, ignoreRoiIfEntry: false, useExitSignal: true }, make: quickie };

// ---------- G5 BigZ04_TSL4 (phuchust/freqtrade_strategy) — 13 nhóm mua OR, custom_stoploss, không sell signal ----------
const BZ = { safe1: 0.989, safe2: 0.982, pump1: 0.4, drop1: 3.8, drop3: 2.7, rsi1h0: 71, rsi1h1a: 69, rsi1h1: 16.5, rsi1h2: 15, rsi1h3: 20, rsi1h4: 35, rsi1h5: 39, rsi0: 30, rsi1: 28, rsi2: 10, rsi3: 14.2, macd1: 0.02, macd2: 0.03, dip0: 1.024 };
export function bigZCustomStop(profit: number): number {
  const HSL = -0.08, PF1 = 0.016, SL1 = 0.011, PF2 = 0.08, SL2 = 0.04;
  if (profit > PF2) return SL2 + (profit - PF2);
  if (profit > PF1) return SL1 + ((profit - PF1) * (SL2 - SL1)) / (PF2 - PF1);
  return HSL;
}
function bigZ(bars: readonly Candle[]): Signals {
  const s = emptySignals(bars.length);
  const c = closes(bars), bb = bbands(typical(bars), 20, 2, 1), vms = rollingMean(bars.map((b) => b.volume), 48);
  const s200 = sma(c, 200), e26 = ema(c, 26), e12 = ema(c, 12), hist = macd(c, 12, 26, 9).hist, r = rsi(c, 14);
  const hourly = aggregateHourly(bars), hc = closes(hourly), h50 = sma(hc, 50), h200 = sma(hc, 200), hr = rsi(hc, 14), hbb = bbands(typical(hourly), 20, 2, 1), hidx = informativeIndex(bars, hourly);
  for (let i = 96; i < bars.length; i++) {
    const b = bars[i]!, close = b.close, open = b.open, vol = b.volume, j = hidx[i]!;
    if (j < 0 || !fin(bb.lower[i]!, bb.lower[i - 2]!, vms[i]!, vms[i - 48]!, s200[i]!, e26[i]!, e12[i]!, hist[i]!, hist[i - 5]!, r[i]!, h50[j]!, h200[j]!, hr[j]!, hbb.lower[j]!)) continue;
    const lower = bb.lower[i]!, mid = bb.mid[i]!, upper = bb.upper[i]!, ema200 = s200[i]!, ema200_1h = h200[j]!, rsi1h = hr[j]!, rsiV = r[i]!;
    const vmsOk = vms[i]! > vms[i - 48]! * BZ.pump1 && vms[i]! * BZ.pump1 < vms[i - 48]!;
    const volDrop1 = vol < bars[i - 1]!.volume * BZ.drop1;
    const bodyOk = open - close < bb.upper[i - 2]! - bb.lower[i - 2]!;
    const macdish = e26[i]! > e12[i]! && e26[i - 1]! > e12[i - 1]! && e26[i - 1]! - e12[i - 1]! > open / 100;
    const conds = [
      // 12
      close > ema200 && close > ema200_1h && close < lower * 0.993 && b.low < lower * 0.985 && c[i - 1]! > bb.lower[i - 1]! && rsi1h < 72.8 && open > close && vmsOk && volDrop1 && bodyOk && vol > 0,
      // 11
      close > ema200 && hist[i]! > 0 && hist[i - 1]! > 0 && hist[i - 2]! > 0 && hist[i - 3]! > 0 && hist[i - 5]! > 0
        && mid - bb.mid[i - 5]! > close / 200 && mid - bb.mid[i - 10]! > close / 100 && upper - lower < close * 0.1
        && bars[i - 1]!.open - bars[i - 1]!.close < close * 0.018 && rsiV > 51 && open < close && bars[i - 1]!.open > bars[i - 1]!.close
        && close > mid && c[i - 1]! < bb.mid[i - 1]! && bars[i - 2]!.low > bb.mid[i - 2]! && vol > 0,
      // 0
      close > ema200 && rsiV < BZ.rsi0 && (close * BZ.dip0 < bars[i - 3]!.open || close * BZ.dip0 < bars[i - 2]!.open || close * BZ.dip0 < bars[i - 1]!.open) && rsi1h < BZ.rsi1h0 && vmsOk && vol > 0,
      // 1
      close > ema200 && close > ema200_1h && close < lower * BZ.safe1 && rsi1h < BZ.rsi1h1a && open > close && vmsOk && volDrop1 && bodyOk && vol > 0,
      // 2
      close > ema200 && close < lower * BZ.safe2 && vmsOk && volDrop1 && bodyOk && vol > 0,
      // 3
      close > ema200_1h && close < lower && rsiV < BZ.rsi3 && vmsOk && vol < bars[i - 1]!.volume * BZ.drop3 && vol > 0,
      // 4
      rsi1h < BZ.rsi1h1 && close < lower && vmsOk && volDrop1 && vol > 0,
      // 5
      close > ema200 && close > ema200_1h && e26[i]! > e12[i]! && e26[i]! - e12[i]! > open * BZ.macd1 && macdish && close < lower && volDrop1 && vmsOk && vol > 0,
      // 6
      rsi1h < BZ.rsi1h5 && e26[i]! > e12[i]! && e26[i]! - e12[i]! > open * BZ.macd2 && macdish && close < lower && vmsOk && volDrop1 && vol > 0,
      // 7
      rsi1h < BZ.rsi1h2 && e26[i]! > e12[i]! && e26[i]! - e12[i]! > open * BZ.macd1 && macdish && volDrop1 && vmsOk && vol > 0,
      // 8
      rsi1h < BZ.rsi1h3 && rsiV < BZ.rsi1 && volDrop1 && vol > 0,
      // 9
      rsi1h < BZ.rsi1h4 && rsiV < BZ.rsi2 && volDrop1 && vmsOk && vol > 0,
      // 10
      rsi1h < BZ.rsi1h4 && hc[j]! < hbb.lower[j]! && hist[i]! > 0 && hist[i - 2]! < 0 && rsiV < 40.5 && hist[i]! > close * 0.0012 && open < close && vol > 0,
    ];
    if (conds.some(Boolean)) s.enterLong[i] = 1;
  }
  return s;
}
export const G5: Strategy = { id: 'G5', name: 'BigZ04_TSL4', source: 'phuchust/freqtrade_strategy', interval: '15m', warmupBars: 4 * 200 + 100,
  cfg: { family: 'freqtrade', roi: null, tp: null, sl: 0.08, customStop: bigZCustomStop, trailing: null, timeLimitMs: null, ignoreRoiIfEntry: false, useExitSignal: false }, make: bigZ };

// ---------- H1 Bollinger %B (Hummingbot bollinger_v1, ví dụ docs: 0,3/0,7; SL 1% TP 3% 6h trailing 0,8/0,4) ----------
function bollingerPctB(bars: readonly Candle[], lo: number, hi: number): Signals {
  const s = emptySignals(bars.length);
  const c = closes(bars), bb = bbands(c, 100, 2, 0);
  for (let i = 0; i < bars.length; i++) {
    const w = bb.upper[i]! - bb.lower[i]!;
    if (!fin(w) || w === 0) continue;
    const pb = (c[i]! - bb.lower[i]!) / w;
    if (pb < lo) s.enterLong[i] = 1; else if (pb > hi) s.enterShort[i] = 1;
  }
  return s;
}
const H1cfg: ExitCfg = { family: 'hummingbot', roi: null, tp: 0.03, sl: 0.01, customStop: null, trailing: { act: 0.008, delta: 0.004 }, timeLimitMs: 6 * HOUR, ignoreRoiIfEntry: false, useExitSignal: false };
export const H1_15m: Strategy = { id: 'H1-15m', name: 'Bollinger %B 0,3/0,7 (15m)', source: 'hummingbot bollinger_v1', interval: '15m', warmupBars: 110, cfg: H1cfg, make: (b) => bollingerPctB(b, 0.3, 0.7) };
export const H1_1h: Strategy = { id: 'H1-1h', name: 'Bollinger %B 0,3/0,7 (1h)', source: 'hummingbot bollinger_v1', interval: '1h', warmupBars: 110, cfg: H1cfg, make: (b) => bollingerPctB(b, 0.3, 0.7) };

// ---------- H2 MACD 21/42/9 + BB (Hummingbot macd_bb_v1; SL 1% TP 6% 24h trailing 1/0,4) ----------
function macdBB(bars: readonly Candle[]): Signals {
  const s = emptySignals(bars.length);
  const c = closes(bars), bb = bbands(c, 100, 2, 0), m = macd(c, 21, 42, 9);
  for (let i = 0; i < bars.length; i++) {
    const w = bb.upper[i]! - bb.lower[i]!;
    if (!fin(w, m.hist[i]!, m.macd[i]!) || w === 0) continue;
    const pb = (c[i]! - bb.lower[i]!) / w;
    if (pb < 0.3 && m.hist[i]! > 0 && m.macd[i]! < 0) s.enterLong[i] = 1;
    else if (pb > 0.7 && m.hist[i]! < 0 && m.macd[i]! > 0) s.enterShort[i] = 1;
  }
  return s;
}
export const H2: Strategy = { id: 'H2', name: 'MACD 21/42/9 + BB (1h)', source: 'hummingbot macd_bb_v1', interval: '1h', warmupBars: 120,
  cfg: { family: 'hummingbot', roi: null, tp: 0.06, sl: 0.01, customStop: null, trailing: { act: 0.01, delta: 0.004 }, timeLimitMs: 24 * HOUR, ignoreRoiIfEntry: false, useExitSignal: false }, make: macdBB };

export const SIGNAL_STRATEGIES: Strategy[] = [G1, G2, G3, G4, G5, H1_15m, H1_1h, H2];
