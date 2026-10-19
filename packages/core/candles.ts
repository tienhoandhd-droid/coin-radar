import type { Candle } from './types.ts';
import { COMMON } from './config.ts';

// MỘT ranh giới "nến đã đóng" cho máy quét và phát lại (kế hoạch 2): tại thời điểm t (ms) nến đã đóng ⇔ closeTime < t.
// Binance đặt closeTime = openTime của nến kế tiếp − 1 ms, nên t = openTime nến kế tiếp là thời điểm sớm nhất nến được coi là đóng.
export function isClosed(candle: Candle, t: number): boolean {
  return candle.closeTime < t;
}

const INTERVAL_MS: Record<string, number> = { '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000 };

export function intervalMs(interval: string): number {
  const ms = INTERVAL_MS[interval];
  if (ms === undefined) throw new Error(`Không biết độ dài khung nến '${interval}'`);
  return ms;
}

const at = (t: number) => `${new Date(t).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

// I3 (đánh giá độc lập): kiểm chuỗi nến ĐÃ ĐÓNG trước khi chấm. Trả danh sách vấn đề (rỗng = dùng được):
// - dữ liệu cũ: nến cuối đóng trước thời điểm quét quá 1 khung + dung sai (COMMON.data.staleToleranceMinutes) — hợp đồng bị dừng
//   giao dịch hoặc nguồn trả dữ liệu cũ;
// - thiếu nến: hai nến liền nhau cách nhau hơn 1 khung;
// - trùng hoặc sai thứ tự: openTime không tăng đúng 1 khung.
export function candleProblems(c: readonly Candle[], interval: string, now: number, toleranceMinutes: number = COMMON.data.staleToleranceMinutes): string[] {
  const iv = intervalMs(interval);
  const tf = interval.toUpperCase();
  if (c.length === 0) return [`khung ${tf}: không có nến`];
  const out: string[] = [];
  let missing = 0;
  for (let j = 1; j < c.length; j++) {
    const d = c[j]!.openTime - c[j - 1]!.openTime;
    if (d <= 0 || d % iv !== 0) { out.push(`khung ${tf}: nến trùng hoặc sai thứ tự tại ${at(c[j]!.openTime)}`); break; }
    missing += d / iv - 1;
  }
  if (missing > 0) out.push(`khung ${tf}: thiếu ${missing} nến trong chuỗi`);
  const lastClose = c[c.length - 1]!.closeTime;
  const age = now - lastClose;
  if (age > iv + toleranceMinutes * 60_000) {
    out.push(`dữ liệu cũ: nến ${tf} cuối đóng lúc ${at(lastClose + 1)}, cách thời điểm quét ${Math.round(age / 60_000)} phút (> 1 khung + ${toleranceMinutes} phút)`);
  }
  return out;
}
