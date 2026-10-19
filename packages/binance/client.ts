export type FetchLike = (url: string) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

export function createClient(opts: {
  fetch: FetchLike;
  base?: string;
  weightCeiling?: number;
  sleep?: (ms: number) => Promise<void>;
}) {
  const base = opts.base ?? 'https://fapi.binance.com';
  const ceiling = opts.weightCeiling ?? 1800; // trần futures là 2400/phút; chừa khoảng an toàn
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let used = 0;

  async function get(path: string): Promise<unknown> {
    if (used >= ceiling) {
      const msToNextMinute = 60_000 - (Date.now() % 60_000) + 1_000;
      await sleep(msToNextMinute);
      used = 0;
    }
    const res = await opts.fetch(base + path);
    const w = Number(res.headers.get('x-mbx-used-weight-1m'));
    if (Number.isFinite(w)) used = w;
    if (res.status !== 200) {
      throw new Error(`Binance HTTP ${res.status} tại ${path}`);
    }
    return res.json();
  }

  return { get, usedWeight: () => used };
}
