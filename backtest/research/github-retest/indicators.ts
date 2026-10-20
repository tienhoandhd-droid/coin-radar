// Chỉ báo cuốn chiếu (rolling) — mọi giá trị tại i chỉ dùng nến ≤ i (không nhìn trước). Khớp ngữ nghĩa TA-Lib/qtpylib của mã gốc.
import type { Candle } from '../../../packages/core/types.ts';
import { HOUR } from '../../data.ts';
export { sma, ema, rsi, macd } from '../../../packages/core/indicators.ts';

export const closes = (c: readonly Candle[]): number[] => c.map((x) => x.close);
export const typical = (c: readonly Candle[]): number[] => c.map((x) => (x.high + x.low + x.close) / 3);

export function rollingMean(x: readonly number[], n: number): number[] {
  const out = new Array<number>(x.length).fill(NaN);
  let s = 0;
  for (let i = 0; i < x.length; i++) { s += x[i]!; if (i >= n) s -= x[i - n]!; if (i >= n - 1) out[i] = s / n; }
  return out;
}
// độ lệch chuẩn cuốn chiếu; ddof=1 = pandas .std() (qtpylib, Freqtrade), ddof=0 = TA-Lib/pandas_ta (Hummingbot)
export function rollingStd(x: readonly number[], n: number, ddof: 0 | 1): number[] {
  const out = new Array<number>(x.length).fill(NaN);
  for (let i = n - 1; i < x.length; i++) {
    let m = 0; for (let j = i - n + 1; j <= i; j++) m += x[j]!; m /= n;
    let v = 0; for (let j = i - n + 1; j <= i; j++) v += (x[j]! - m) ** 2;
    out[i] = Math.sqrt(v / (n - ddof));
  }
  return out;
}
export function bbands(src: readonly number[], n: number, k: number, ddof: 0 | 1) {
  const mid = rollingMean(src, n), sd = rollingStd(src, n, ddof);
  return { mid, upper: mid.map((m, i) => m + k * sd[i]!), lower: mid.map((m, i) => m - k * sd[i]!) };
}
export function rollingMin(x: readonly number[], n: number): number[] {
  const out = new Array<number>(x.length).fill(NaN);
  for (let i = n - 1; i < x.length; i++) { let m = Infinity; for (let j = i - n + 1; j <= i; j++) m = Math.min(m, x[j]!); out[i] = m; }
  return out;
}
export function rollingMax(x: readonly number[], n: number): number[] {
  const out = new Array<number>(x.length).fill(NaN);
  for (let i = n - 1; i < x.length; i++) { let m = -Infinity; for (let j = i - n + 1; j <= i; j++) m = Math.max(m, x[j]!); out[i] = m; }
  return out;
}
// CCI (TA-Lib, 14): (TP − SMA(TP)) / (0,015 × độ lệch tuyệt đối trung bình)
export function cci(c: readonly Candle[], n = 14): number[] {
  const tp = typical(c), m = rollingMean(tp, n), out = new Array<number>(c.length).fill(NaN);
  for (let i = n - 1; i < c.length; i++) {
    let md = 0; for (let j = i - n + 1; j <= i; j++) md += Math.abs(tp[j]! - m[i]!); md /= n;
    out[i] = md === 0 ? 0 : (tp[i]! - m[i]!) / (0.015 * md);
  }
  return out;
}
// MFI (TA-Lib, 14) trên typical price × volume
export function mfi(c: readonly Candle[], n = 14): number[] {
  const tp = typical(c), out = new Array<number>(c.length).fill(NaN);
  const pos = new Array<number>(c.length).fill(0), neg = new Array<number>(c.length).fill(0);
  for (let i = 1; i < c.length; i++) {
    const mf = tp[i]! * c[i]!.volume;
    if (tp[i]! > tp[i - 1]!) pos[i] = mf; else if (tp[i]! < tp[i - 1]!) neg[i] = mf;
  }
  let p = 0, q = 0;
  for (let i = 1; i < c.length; i++) {
    p += pos[i]!; q += neg[i]!;
    if (i > n) { p -= pos[i - n]!; q -= neg[i - n]!; }
    if (i >= n) out[i] = p + q === 0 ? 50 : (100 * p) / (p + q);
  }
  return out;
}

// Gộp nến 15m thành 1h theo giờ UTC (OHLC + volume). Nến 1h "đóng" khi nến 15m cuối (phút 45) đã đóng.
export function aggregateHourly(c15: readonly Candle[]): Candle[] {
  const out: Candle[] = [];
  for (const c of c15) {
    const h0 = Math.floor(c.openTime / HOUR) * HOUR;
    const last = out[out.length - 1];
    if (last && last.openTime === h0) {
      last.high = Math.max(last.high, c.high); last.low = Math.min(last.low, c.low); last.close = c.close;
      last.volume += c.volume; last.quoteVolume += c.quoteVolume; last.closeTime = c.closeTime;
    } else out.push({ ...c, openTime: h0, closeTime: c.closeTime });
  }
  // chỉ giữ nến 1h đã đóng trọn (closeTime = h0 + 1h − 1ms); nến cuối chưa trọn thì bỏ
  return out.filter((h) => h.closeTime === h.openTime + HOUR - 1);
}
// Giá trị chỉ báo khung lớn tại mỗi nến nhỏ: lấy nến lớn ĐÃ ĐÓNG mới nhất tại thời điểm mở nến nhỏ (như merge_informative_pair của Freqtrade).
// Trả chỉ số (index) vào mảng khung lớn, −1 nếu chưa có.
export function informativeIndex(small: readonly Candle[], big: readonly Candle[]): Int32Array {
  const out = new Int32Array(small.length).fill(-1);
  let j = 0;
  for (let i = 0; i < small.length; i++) {
    while (j < big.length && big[j]!.closeTime < small[i]!.openTime) j++;
    out[i] = j - 1;
  }
  return out;
}
export const shift = (x: readonly number[], k: number, i: number): number => (i - k >= 0 ? x[i - k]! : NaN);
