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

export function volumeZ(c: Candle[], lookback: number): number {
  if (c.length < lookback + 1) return 0;
  const prev = c.slice(-lookback - 1, -1).map((k) => k.quoteVolume);
  const mean = prev.reduce((a, b) => a + b, 0) / prev.length;
  const sd = stdev(prev);
  if (!Number.isFinite(sd) || sd === 0) return 0;
  return (c[c.length - 1]!.quoteVolume - mean) / sd;
}
