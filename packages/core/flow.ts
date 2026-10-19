import { stdev } from './indicators.ts';
import type { Candle } from './types.ts';

export function takerImbalance(c: Candle): number {
  if (c.quoteVolume <= 0) return 0;
  return (2 * c.takerBuyQuote - c.quoteVolume) / c.quoteVolume;
}

export function meanImbalance(c: Candle[], bars: number, skip: number): number {
  const end = c.length - skip;
  const slice = c.slice(Math.max(0, end - bars), end);
  if (slice.length === 0) return 0;
  return slice.reduce((a, k) => a + takerImbalance(k), 0) / slice.length;
}

// z-score khối lượng nến cuối so với `lookback` nến trước. Thiếu nến hoặc số không hợp lệ → NaN (I4: không trả 0 làm cổng G-04 qua).
// Khối lượng các nến trước bằng nhau (độ lệch chuẩn 0): nến cuối bằng trung bình → 0, khác → ±Infinity.
export function volumeZ(c: Candle[], lookback: number): number {
  if (c.length < lookback + 1) return NaN;
  const prev = c.slice(-lookback - 1, -1).map((k) => k.quoteVolume);
  const mean = prev.reduce((a, b) => a + b, 0) / prev.length;
  const sd = stdev(prev);
  const lastV = c[c.length - 1]!.quoteVolume;
  if (!Number.isFinite(sd) || !Number.isFinite(lastV)) return NaN;
  if (sd === 0) return lastV === mean ? 0 : Math.sign(lastV - mean) * Infinity;
  return (lastV - mean) / sd;
}
