export type FetchResponse = {
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
};

export type FetchInit = { method?: string; headers?: Record<string, string> };

export type FetchLike = (url: string, init?: FetchInit) => Promise<FetchResponse>;

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
  botCeiling?: number; // trần cho bot (priority 'bot'); mặc định = toàn bộ 2400/phút
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}) {
  const base = opts.base ?? 'https://fapi.binance.com';
  const ceiling = opts.weightCeiling ?? 1800; // trần futures là 2400/phút; chừa khoảng an toàn
  const botCeiling = opts.botCeiling ?? 2400;
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
    return res;
  }

  async function get(path: string): Promise<unknown> {
    const res = await send(path);
    if (res.status !== 200) throw new Error(`Binance HTTP ${res.status} tại ${path}`);
    return res.json();
  }

  return { get, send, base, usedWeight: () => used };
}
