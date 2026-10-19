import { sma, atr, last } from './indicators.ts';
import { COMMON } from './config.ts';
import type { Candle, Side } from './types.ts';

export type Regime = 'up' | 'sideways' | 'down';

export function marketRegime(btcDaily: Candle[]): { regime: Regime; reasons: string[] } {
  if (btcDaily.length < 200) {
    return { regime: 'sideways', reasons: [`Thiếu dữ liệu BTC 1D (${btcDaily.length}/200 nến) — coi là đi ngang`] };
  }
  const closes = btcDaily.map((k) => k.close);
  const s200 = sma(closes, 200);
  const s50 = sma(closes, 50);
  const band = COMMON.regimeBandPct / 100;
  const lastTwo = [closes.length - 2, closes.length - 1];
  const above = lastTwo.every((i) => closes[i]! > s200[i]! * (1 + band));
  const below = lastTwo.every((i) => closes[i]! < s200[i]! * (1 - band));
  const peak = Math.max(...closes.slice(-365));
  const drawdownPct = (1 - last(closes) / peak) * 100;
  const reasons = [
    `BTC ${last(closes).toFixed(0)} so SMA200 ${last(s200).toFixed(0)}`,
    `SMA50 ${last(s50) > last(s200) ? '>' : '≤'} SMA200`,
    `Giảm từ đỉnh 365 ngày: ${drawdownPct.toFixed(1)}%`,
  ];
  if (above && last(s50) > last(s200)) return { regime: 'up', reasons };
  if (below && drawdownPct > COMMON.regimeDrawdownPct) return { regime: 'down', reasons };
  return { regime: 'sideways', reasons };
}

export function circuitBreaker(btcHourly: Candle[]): { tripped: boolean; reason: string | null } {
  if (btcHourly.length < 20) return { tripped: false, reason: null };
  const closes = btcHourly.map((k) => k.close);
  const now = last(closes);
  const fourAgo = closes[closes.length - 5]!;
  const movePct = ((now - fourAgo) / fourAgo) * 100;
  if (Math.abs(movePct) >= COMMON.breakerBtcMovePct) {
    return { tripped: true, reason: `BTC biến động ${movePct.toFixed(1)}% trong 4 giờ` };
  }
  const a = atr(btcHourly.slice(0, -1), 14);
  const lastCandle = btcHourly[btcHourly.length - 1]!;
  const range = lastCandle.high - lastCandle.low;
  if (range > COMMON.breakerRangeAtr * last(a)) {
    return { tripped: true, reason: `Nến 1H BTC biên độ ${(range / last(a)).toFixed(1)}×ATR` };
  }
  return { tripped: false, reason: null };
}

export function allowedSide(regime: Regime, side: Side, score: number): boolean {
  if (regime === 'sideways') return true;
  const withTrend = (regime === 'up' && side === 'long') || (regime === 'down' && side === 'short');
  return withTrend || score >= COMMON.counterTrendScore;
}
