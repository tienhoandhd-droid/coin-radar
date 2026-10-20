import type { Candle } from './types.ts';

export function last(values: number[]): number {
  return values.length === 0 ? NaN : values[values.length - 1]!;
}

export function sma(values: number[], n: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= n) sum -= values[i - n]!;
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

export function ema(values: number[], n: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  const start = values.findIndex((v) => Number.isFinite(v));
  if (start < 0 || values.length - start < n) return out;
  const k = 2 / (n + 1);
  let seed = 0;
  for (let i = start; i < start + n; i++) seed += values[i]!;
  let prev = seed / n;
  out[start + n - 1] = prev;
  for (let i = start + n; i < values.length; i++) {
    prev = prev + k * (values[i]! - prev);
    out[i] = prev;
  }
  return out;
}

export function rsi(closes: number[], n: number): number[] {
  const out = new Array<number>(closes.length).fill(NaN);
  if (closes.length <= n) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d > 0) gain += d;
    else loss -= d;
  }
  gain /= n;
  loss /= n;
  out[n] = toRsi(gain, loss);
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = toRsi(gain, loss);
  }
  return out;
}

function toRsi(gain: number, loss: number): number {
  if (loss === 0) return gain === 0 ? 50 : 100;
  return 100 - 100 / (1 + gain / loss);
}

export function trueRange(c: Candle[]): number[] {
  return c.map((k, i) => {
    if (i === 0) return k.high - k.low;
    const prevClose = c[i - 1]!.close;
    return Math.max(k.high - k.low, Math.abs(k.high - prevClose), Math.abs(k.low - prevClose));
  });
}

export function atr(c: Candle[], n: number): number[] {
  const tr = trueRange(c);
  const out = new Array<number>(c.length).fill(NaN);
  if (c.length < n) return out;
  let prev = 0;
  for (let i = 0; i < n; i++) prev += tr[i]!;
  prev /= n;
  out[n - 1] = prev;
  for (let i = n; i < c.length; i++) {
    prev = (prev * (n - 1) + tr[i]!) / n;
    out[i] = prev;
  }
  return out;
}

export function macd(closes: number[], fast: number, slow: number, signal: number) {
  const f = ema(closes, fast);
  const s = ema(closes, slow);
  const line = closes.map((_, i) => f[i]! - s[i]!);
  const sig = ema(line, signal);
  const hist = line.map((v, i) => v - sig[i]!);
  return { macd: line, signal: sig, hist };
}

// allowEqual = false (mặc định, cách cũ): đỉnh phải CAO HƠN HẲN n nến hai bên → hai đỉnh bằng nhau không đỉnh nào được nhận.
// allowEqual = true (vùng 'clean'): đỉnh bằng đỉnh lân cận vẫn tính (đỉnh đôi bằng nhau) — cả hai nến bằng nhau đều là pivot.
export function pivotHighs(highs: number[], n: number, allowEqual = false): number[] {
  return pivots(highs, n, allowEqual ? (a, b) => a >= b : (a, b) => a > b);
}

export function pivotLows(lows: number[], n: number, allowEqual = false): number[] {
  return pivots(lows, n, allowEqual ? (a, b) => a <= b : (a, b) => a < b);
}

function pivots(xs: number[], n: number, better: (a: number, b: number) => boolean): number[] {
  const out: number[] = [];
  for (let i = n; i + n < xs.length; i++) {
    let ok = true;
    for (let j = i - n; j <= i + n && ok; j++) {
      if (j !== i && !better(xs[i]!, xs[j]!)) ok = false;
    }
    if (ok) out.push(i);
  }
  return out;
}

export function stdev(values: number[]): number {
  if (values.length < 2) return NaN;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(v);
}

// Bước số tròn theo độ lớn giá (giá 82.000 → 1000; giá 0,5 → 0,01)
export function roundStep(price: number): number {
  return 10 ** (Math.floor(Math.log10(price)) - 1);
}
