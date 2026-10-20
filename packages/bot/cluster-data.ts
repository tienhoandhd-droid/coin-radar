import { COMMON } from '../core/config.ts';
import { clusterSymbols } from '../core/risk-cluster.ts';
import type { OpenTrade } from '../core/portfolio.ts';
import type { Candle } from '../core/types.ts';

// risk-cluster cho bot (COMMON.portfolio.cluster): tải nến 1D ĐÃ ĐÓNG của mã định vào, mọi mã đang mở và BTCUSDT qua REST công khai
// (klines — parseKlines bỏ nến đang chạy → limit − 1 nến đã đóng) để planner đo tương quan/beta (core/risk-cluster.ts).
// FAIL CLOSED: tải lỗi mã nào → ghi log, trả null → nơi gọi KHÔNG vào lệnh mới (không bao giờ âm thầm bỏ qua kiểm tra).
// Luật tắt → trả undefined (planner không cần nến 1D).
export type DailyFetch = (symbol: string, limit: number) => Promise<Candle[]>;

// isFatal: lỗi phải nổi lên cho nơi gọi xử lý riêng (vd. sàn chặn 418/429 → bot dừng gọi REST), không chỉ bỏ lệnh.
export async function fetchClusterDaily(symbol: string, open: readonly OpenTrade[], fetchDaily: DailyFetch, log: (m: string) => void,
  isFatal: (e: unknown) => boolean = () => false):
  Promise<Map<string, Candle[]> | null | undefined> {
  const cl = COMMON.portfolio.cluster;
  if (cl === null) return undefined;
  const limit = Math.max(cl.corrDays, cl.betaDays) + 2; // max + 1 nến đã đóng = max lợi suất ngày
  const out = new Map<string, Candle[]>();
  for (const s of clusterSymbols(symbol, open)) {
    try {
      out.set(s, await fetchDaily(s, limit));
    } catch (e) {
      if (isFatal(e)) throw e;
      log(`${symbol}: risk-cluster — không tải được nến 1D ${s} (${e instanceof Error ? e.message : String(e)}) — không vào lệnh mới`);
      return null;
    }
  }
  return out;
}
