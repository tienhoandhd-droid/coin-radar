export type FetchResponse = {
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
};

export type FetchInit = { method?: string; headers?: Record<string, string>; body?: string };

// `forwardsInit` = adapter đã được khai báo là chuyển nguyên method/headers/body (xem nodeFetch trong signed.ts).
// Request ký bắt buộc đi qua adapter có dấu này, tránh adapter kiểu `(url) => fetch(url)` làm rơi method/header.
export type FetchLike = ((url: string, init?: FetchInit) => Promise<FetchResponse>) & { forwardsInit?: true };

// Ai gọi: máy quét công khai (trần thấp) hay bot giao dịch (được dùng toàn bộ ngân sách IP)
export type Priority = 'scanner' | 'bot';

export class BanActiveError extends Error {
  readonly until: number;
  readonly httpCode: number;
  constructor(until: number, httpCode: number) {
    super(`Binance đang chặn tạm thời tới ${new Date(until).toISOString()} (HTTP ${httpCode}) — không gọi tiếp`);
    this.until = until;
    this.httpCode = httpCode;
  }
}

const DEFAULT_BAN_MS = 60_000; // không có Retry-After thì chặn 60 s

export function createClient(opts: {
  fetch: FetchLike;
  base?: string;
  weightCeiling?: number; // trần cho máy quét (priority 'scanner')
  // Trần cho bot (priority 'bot'). Mặc định 2200 < giới hạn sàn 2400: cổng chỉ kiểm weight ĐÃ dùng,
  // chưa tính request sắp gửi (có thể nặng tới ~30+) nên cần chừa đệm để không chạm 429.
  botCeiling?: number;
  forbiddenCooldownMs?: number; // sau HTTP 403 (WAF) tạm dừng gọi trong khoảng này (mặc định 10 s)
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}) {
  const base = opts.base ?? 'https://fapi.binance.com';
  const ceiling = opts.weightCeiling ?? 1800; // trần futures là 2400/phút; chừa khoảng an toàn
  const botCeiling = opts.botCeiling ?? 2200;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  let used = 0;
  let bannedUntil = 0; // mốc thời gian (ms) hết bị chặn
  let bannedCode = 0;

  // Gửi 1 request: kiểm tra khóa 418/429, ngân sách weight, cập nhật weight + khóa. Trả response thô.
  async function send(path: string, init?: FetchInit, priority: Priority = 'scanner'): Promise<FetchResponse> {
    if (now() < bannedUntil) throw new BanActiveError(bannedUntil, bannedCode);
    if (used >= (priority === 'bot' ? botCeiling : ceiling)) {
      const msToNextMinute = 60_000 - (now() % 60_000) + 1_000;
      await sleep(msToNextMinute);
      used = 0;
    }
    if (init && !opts.fetch.forwardsInit) {
      throw new Error('Adapter fetch không khai báo chuyển init (method/headers) — từ chối gửi request ký');
    }
    const res = await opts.fetch(base + path, init);

    // Chỉ cập nhật weight khi header có mặt và là số; thiếu header thì giữ giá trị cũ
    const weightHeader = res.headers.get('x-mbx-used-weight-1m');
    if (weightHeader !== null && weightHeader.trim() !== '') {
      const w = Number(weightHeader);
      if (Number.isFinite(w)) used = w;
    }

    if (res.status === 418 || res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      const secs = retryAfter !== null && retryAfter.trim() !== '' ? Number(retryAfter) : NaN;
      const banMs = Number.isFinite(secs) && secs >= 0 ? secs * 1000 : DEFAULT_BAN_MS;
      bannedUntil = now() + banMs;
      bannedCode = res.status;
    }
    if (res.status === 403) {
      // WAF chặn: dừng gọi một lúc thay vì tiếp tục dội vào
      armBan(opts.forbiddenCooldownMs ?? 10_000, 403);
    }
    return res;
  }

  // Bật khóa chung (dùng khi mã -1003 đến với HTTP status khác 418/429)
  function armBan(ms: number, code: number): void {
    const until = now() + ms;
    if (until > bannedUntil) { bannedUntil = until; bannedCode = code; }
  }

  async function get(path: string): Promise<unknown> {
    const res = await send(path);
    if (res.status !== 200) throw new Error(`Binance HTTP ${res.status} tại ${path}`);
    return res.json();
  }

  return { get, send, armBan, base, usedWeight: () => used };
}
