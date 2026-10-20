import { COMMON } from '../packages/core/config.ts';
import { fgiDirectionAt, parseFgi, type FgiDecision } from '../packages/core/fgi.ts';

// Tải chỉ số Sợ hãi & Tham lam (Fear & Greed Index) khi chạy thật — máy quét (scan.ts) và bot (packages/bot/main.ts).
// Nguồn: Alternative.me (https://alternative.me/crypto/fear-and-greed-index/) — điều kiện dùng: GHI NGUỒN "Alternative.me".
// Lịch sử đầy đủ cho kiểm lịch sử: backtest/fetch-fgi.ts (limit=0). Khi chạy thật chỉ cần vài ngày gần nhất.
export const FGI_URL_ALL = 'https://api.alternative.me/fng/?limit=0&format=json';
export const FGI_URL_RECENT = 'https://api.alternative.me/fng/?limit=10&format=json';

// fetchJson được tiêm vào (test thay bằng hàm giả, không gọi mạng). FAIL CLOSED: lỗi tải/phân tích → ghi log + side = null (luật chặn mọi
// lệnh Swing mới) — không bao giờ âm thầm cho vào lệnh.
export async function fetchFgiDecision(o: { fetchJson: (url: string) => Promise<unknown>; now: number; log: (m: string) => void }): Promise<FgiDecision> {
  const cfg = COMMON.entryRules.fgiDirection;
  if (cfg === null) return { side: null, reason: 'luật FGI-hướng đang tắt' };
  try {
    const rows = parseFgi(await o.fetchJson(FGI_URL_RECENT));
    return fgiDirectionAt(rows, o.now, cfg);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    o.log(`FGI (Alternative.me): không tải được (${msg}) — không vào lệnh Swing mới`);
    return { side: null, reason: `không tải được FGI từ Alternative.me (${msg})` };
  }
}

// fetchJson thật (fetch toàn cục, hết giờ 20 giây, HTTP khác 2xx → lỗi)
export async function httpJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return await res.json();
}
