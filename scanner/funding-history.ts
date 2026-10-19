import { parseFundingHistory } from '../packages/binance/parse.ts';
import { COMMON } from '../packages/core/config.ts';
import { maxAbsFundingRate } from '../packages/core/sizing.ts';

// Đệm funding cho bản in máy quét = CÙNG mức planner của bot dùng: |funding| lớn nhất mỗi kỳ trong COMMON.risk.fundingBufferLookbackDays
// ngày (rà soát lại Task 3 vòng 2 — trước đây máy quét chỉ biết kỳ gần nhất nên in khối lượng lớn hơn bot mà không báo).
// GET /fapi/v1/fundingRate: limit tối đa 1000 (30 ngày × chu kỳ 1 giờ = 720 kỳ, đủ một trang); chung hạn mức 500 lệnh gọi / 5 phút / IP
// với fundingInfo (backtest/data.ts, tài liệu Binance đối chiếu 2026-10-19) → trần maxCalls mỗi lần quét, nhớ kết quả theo mã.
// Không tải được (lỗi mạng, lịch sử rỗng/toàn 0, vượt trần) → NÉM LỖI có lý do: run-scan dùng mức thận trọng và ghi chú lên kết quả.
// Giả định: tối đa 2 lần quét trong 5 phút → 2 × 200 + fundingInfo (1/lần quét) < 500 lệnh/5 phút. Quét dày hơn thì phải giảm trần này.
export const FUNDING_HISTORY_MAX_CALLS = 200; // đề xuất, chưa backtest

export function createFundingMaxAbsLoader(o: { get: (path: string) => Promise<unknown>; now: number; maxCalls?: number }) {
  const memo = new Map<string, Promise<number>>();
  const maxCalls = o.maxCalls ?? FUNDING_HISTORY_MAX_CALLS;
  const days = COMMON.risk.fundingBufferLookbackDays;
  return (symbol: string): Promise<number> => {
    const hit = memo.get(symbol);
    if (hit !== undefined) return hit;
    if (memo.size >= maxCalls) return Promise.reject(new Error(`vượt trần ${maxCalls} lệnh gọi lịch sử funding mỗi lần quét`));
    const p = (async () => {
      const from = o.now - days * 86_400_000;
      const rows = parseFundingHistory(await o.get(`/fapi/v1/fundingRate?symbol=${symbol}&startTime=${from}&endTime=${o.now}&limit=1000`));
      const m = maxAbsFundingRate(rows, o.now, days);
      if (!(m > 0)) throw new Error(`không có kỳ funding khác 0 trong ${days} ngày (${rows.length} kỳ)`);
      return m;
    })();
    memo.set(symbol, p);
    return p;
  };
}
