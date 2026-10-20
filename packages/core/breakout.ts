import type { Candle } from './types.ts';

// #3 (kế hoạch 2, Task 8): giá ĐÓNG của nến 1D đã đóng cuối cùng > đỉnh giá đóng của n nến 1D trước đó (kênh Donchian theo giá đóng,
// Zarattini và cộng sự 2025). daily = nến ĐÃ ĐÓNG tại thời điểm xét, tăng dần. Thiếu nến (< n + 1) → null (không biết).
export function donchianBreakout(daily: readonly Candle[], n: number): boolean | null {
  if (daily.length < n + 1) return null;
  const last = daily[daily.length - 1]!.close;
  let hi = -Infinity;
  for (let i = daily.length - 1 - n; i < daily.length - 1; i++) hi = Math.max(hi, daily[i]!.close);
  return last > hi;
}

// Đối xứng cho Short (hệ trend-d1): giá ĐÓNG nến 1D đã đóng cuối cùng < đáy giá đóng của n nến 1D trước đó. Thiếu nến → null.
export function donchianBreakdown(daily: readonly Candle[], n: number): boolean | null {
  if (daily.length < n + 1) return null;
  const last = daily[daily.length - 1]!.close;
  let lo = Infinity;
  for (let i = daily.length - 1 - n; i < daily.length - 1; i++) lo = Math.min(lo, daily[i]!.close);
  return last < lo;
}
