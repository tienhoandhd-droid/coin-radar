export type FetchLike = (url: string) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

const DEFAULT_BAN_MS = 60_000; // không có Retry-After thì chặn 60 s

export function createClient(opts: {
  fetch: FetchLike;
  base?: string;
  weightCeiling?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}) {
  const base = opts.base ?? 'https://fapi.binance.com';
  const ceiling = opts.weightCeiling ?? 1800; // trần futures là 2400/phút; chừa khoảng an toàn
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  let used = 0;
  let bannedUntil = 0; // mốc thời gian (ms) hết bị chặn
  let bannedCode = 0;

  async function get(path: string): Promise<unknown> {
    if (now() < bannedUntil) {
      throw new Error(`Binance đang chặn tạm thời tới ${new Date(bannedUntil).toISOString()} (HTTP ${bannedCode}) — không gọi tiếp`);
    }
    if (used >= ceiling) {
      const msToNextMinute = 60_000 - (now() % 60_000) + 1_000;
      await sleep(msToNextMinute);
      used = 0;
    }
    const res = await opts.fetch(base + path);

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
      throw new Error(`Binance HTTP ${res.status} tại ${path}`);
    }
    if (res.status !== 200) {
      throw new Error(`Binance HTTP ${res.status} tại ${path}`);
    }
    return res.json();
  }

  return { get, usedWeight: () => used };
}
