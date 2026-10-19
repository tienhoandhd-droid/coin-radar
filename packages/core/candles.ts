import type { Candle } from './types.ts';

// MỘT ranh giới "nến đã đóng" cho máy quét và phát lại (kế hoạch 2): tại thời điểm t (ms) nến đã đóng ⇔ closeTime < t.
// Binance đặt closeTime = openTime của nến kế tiếp − 1 ms, nên t = openTime nến kế tiếp là thời điểm sớm nhất nến được coi là đóng.
export function isClosed(candle: Candle, t: number): boolean {
  return candle.closeTime < t;
}
