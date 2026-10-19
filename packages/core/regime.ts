import { sma, atr, last } from './indicators.ts';
import { COMMON } from './config.ts';
import type { RiskTier } from './risk.ts';
import type { Candle, Side } from './types.ts';

export type Regime = 'up' | 'sideways' | 'down';

export function marketRegime(btcDaily: Candle[]): { regime: Regime; reasons: string[] } {
  // SMA200 chỉ có giá trị từ nến thứ 200; cần 201 nến để đọc được SMA200 của hai nến cuối.
  if (btcDaily.length < 201) {
    return { regime: 'sideways', reasons: [`Thiếu dữ liệu BTC 1D (${btcDaily.length}/201 nến) — coi là đi ngang`] };
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

// Kiểm điều kiện cầu dao tại MỘT thời điểm (kết thúc ở nến cuối của mảng).
function breakerAt(btcHourly: Candle[]): string | null {
  if (btcHourly.length < 20) return null;
  const closes = btcHourly.map((k) => k.close);
  const now = last(closes);
  const fourAgo = closes[closes.length - 5]!;
  const movePct = ((now - fourAgo) / fourAgo) * 100;
  if (Math.abs(movePct) >= COMMON.breakerBtcMovePct) return `BTC biến động ${movePct.toFixed(1)}% trong 4 giờ`;
  const a = atr(btcHourly.slice(0, -1), 14);
  const lastCandle = btcHourly[btcHourly.length - 1]!;
  const range = lastCandle.high - lastCandle.low;
  if (range > COMMON.breakerRangeAtr * last(a)) return `Nến 1H BTC biên độ ${(range / last(a)).toFixed(1)}×ATR`;
  return null;
}

// Không lưu trạng thái: cầu dao coi là đang bật nếu điều kiện đã xảy ra ở BẤT KỲ nến 1H nào trong
// `pauseHours` giờ gần nhất (12h Swing / 3h Lướt nhanh) — đúng "dừng tín hiệu mới" của spec 3.2.
export function circuitBreaker(btcHourly: Candle[], pauseHours: number): { tripped: boolean; reason: string | null } {
  if (!Number.isInteger(pauseHours) || pauseHours < 1) throw new Error(`circuitBreaker: pauseHours phải là số nguyên ≥ 1, nhận ${pauseHours}`);
  for (let back = 0; back < pauseHours; back++) {
    const window = back === 0 ? btcHourly : btcHourly.slice(0, -back);
    const why = breakerAt(window);
    if (why !== null) {
      const at = window[window.length - 1]!.closeTime;
      const iso = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
      return { tripped: true, reason: `${why} — bật lúc ${iso(at)}, dừng tới ${iso(at + pauseHours * 3_600_000)}` };
    }
  }
  return { tripped: false, reason: null };
}

const z2 = (z: number) => (z < 0 ? '−' : z > 0 ? '+' : '') + Math.abs(z).toFixed(2).replace('.', ',');

// G-01 (D2/M3): Short trong 'up' hoặc Long trong 'down' là lệnh NGƯỢC xu hướng. Chỉ được phép khi đủ CẢ BA:
// điểm ≥ counterTrendScore, RS so BTC rõ ràng ủng hộ lệnh (Short: z ≤ −ngưỡng; Long: z ≥ +ngưỡng; không đo được z → không cho),
// và mức rủi ro không phải "Rất cao". 'sideways' không hạn chế.
export function regimeCheck(regime: Regime, side: Side, score: number, rsZ: number | null, tier: RiskTier): { ok: boolean; note: string } {
  const withTrend = (regime === 'up' && side === 'long') || (regime === 'down' && side === 'short');
  if (regime === 'sideways' || withTrend) return { ok: true, note: `Chế độ ${regime}` };
  const dir = side === 'long' ? 1 : -1;
  const need = COMMON.counterTrendRsZ;
  const failed: string[] = [];
  if (score < COMMON.counterTrendScore) failed.push(`điểm ${score} < ${COMMON.counterTrendScore}`);
  if (rsZ === null) failed.push('thiếu RS so BTC (coin kém thanh khoản, không đo được)');
  else if (dir * rsZ < need) failed.push(`RS z = ${z2(rsZ)} chưa đạt ${side === 'long' ? '≥ +' : '≤ −'}${String(need).replace('.', ',')}`);
  if (tier === 'Rất cao') failed.push('mức rủi ro Rất cao');
  if (failed.length > 0) return { ok: false, note: `Chế độ ${regime}, lệnh ngược xu hướng bị chặn: ${failed.join('; ')}` };
  return { ok: true, note: `Chế độ ${regime}, ngược xu hướng nhưng đủ điều kiện (điểm ${score}, RS z = ${z2(rsZ!)}, rủi ro ${tier})` };
}
