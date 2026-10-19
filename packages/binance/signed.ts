import { createHmac, createSign } from 'node:crypto';
import { BanActiveError, type FetchInit, type FetchLike, type FetchResponse, type Priority } from './client.ts';
import { redact } from './redact.ts';

// ---- Khóa & môi trường -------------------------------------------------------------------------
const BASES = {
  live: 'https://fapi.binance.com',
  // Tài liệu có 2 bộ URL "testnet" mâu thuẫn; chọn demo-fapi theo đề xuất trong docs/reference (mục 9)
  demo: 'https://demo-fapi.binance.com',
} as const;

export type Credentials = { apiKey: string; apiSecret: string; env: 'demo' | 'live'; base: string };

// Chỉ đọc từ biến môi trường; thông báo lỗi chỉ nêu TÊN biến, không nêu giá trị
export function loadCredentials(env: Record<string, string | undefined>): Credentials {
  const apiKey = env.BINANCE_API_KEY;
  const apiSecret = env.BINANCE_API_SECRET;
  const mode = env.BINANCE_ENV;
  if (!apiKey) throw new Error('Thiếu biến môi trường BINANCE_API_KEY');
  if (!apiSecret) throw new Error('Thiếu biến môi trường BINANCE_API_SECRET');
  if (mode !== 'demo' && mode !== 'live') throw new Error('BINANCE_ENV phải là "demo" hoặc "live"');
  return { apiKey, apiSecret, env: mode, base: BASES[mode] };
}

// ---- Bộ ký (cắm được) --------------------------------------------------------------------------
export type Signer = { sign(payload: string): string; secrets: readonly string[] }; // secrets: luôn được che trong log

// Fetch cho request ký: init BẮT BUỘC (khác FetchLike công khai, nơi init tùy chọn)
export type SignedFetch = (url: string, init: Required<Pick<FetchInit, 'method' | 'headers'>> & Pick<FetchInit, 'body'>) => Promise<FetchResponse>;

// Đánh dấu adapter đã chuyển đủ init; createClient/send từ chối request ký nếu thiếu dấu này
export function markForwardsInit(f: SignedFetch): FetchLike {
  const wrapped: FetchLike = (url, init) => {
    if (!init || !init.method || !init.headers) throw new Error('Thiếu init (method/headers) cho request ký');
    return f(url, { method: init.method, headers: init.headers, body: init.body });
  };
  wrapped.forwardsInit = true;
  return wrapped;
}

// Adapter thật dùng fetch của Node, chuyển nguyên method, headers (X-MBX-APIKEY) và body
export const nodeFetch: FetchLike = markForwardsInit((url, init) =>
  globalThis.fetch(url, { method: init.method, headers: init.headers, body: init.body }));

// HMAC SHA256, trả hex (tài liệu: khóa là secretKey, giá trị là totalParams)
export function hmacSigner(secret: string): Signer {
  return { secrets: [secret], sign: (payload) => createHmac('sha256', secret).update(payload).digest('hex') };
}

// RSA (tài liệu futures: PKCS#8, RSASSA-PKCS1-v1_5 SHA-256, base64, bỏ xuống dòng; URL-encode khi gắn vào query)
export function rsaSigner(privateKeyPem: string): Signer {
  return { secrets: [privateKeyPem], sign: (payload) => createSign('RSA-SHA256').update(payload).sign(privateKeyPem, 'base64').replace(/[\r\n]/g, '') };
}
// Ed25519: tài liệu KHÔNG xác nhận cho REST futures → chưa cài đặt.

// ---- Phân loại lỗi -----------------------------------------------------------------------------
export type Kind = 'ok' | 'unknown_status' | 'retryable' | 'rejected' | 'banned' | 'clock';
export type Classified = { kind: Kind; code: number | null; msg: string };

export function classify(status: number, body: unknown): Classified {
  const obj = body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  const code = obj && typeof obj.code === 'number' ? obj.code : null;
  const msg = obj && typeof obj.msg === 'string' ? obj.msg : '';
  const out = (kind: Kind): Classified => ({ kind, code, msg });

  if (status === 418 || status === 429 || code === -1003) return out('banned');
  if (code === -1006 || code === -1007) return out('unknown_status');
  if (code === -1021) return out('clock');
  if (status === 503) {
    // Chỉ coi là thất bại chắc chắn khi đúng 2 thông điệp tài liệu nêu; còn lại coi là CHƯA RÕ
    if (code === -1001 || /service unavailable/i.test(msg)) return out('retryable');
    return out('unknown_status');
  }
  if (code === -1008) return out('retryable');
  // 408 / 5xx khác: tài liệu không nói trạng thái lệnh → bảo thủ, coi là chưa rõ
  if (status === 408 || status >= 500) return out('unknown_status');
  if (status === 200 && (code === null || code === 200 || code >= 0)) return out('ok');
  if (status >= 200 && status < 300 && code === null) return out('ok');
  return out('rejected'); // gồm 403 (WAF), -1022, -1015, -2xxx, -4xxx ...
}

// ---- REST có ký ---------------------------------------------------------------------------------
type ClientLike = {
  send(path: string, init?: FetchInit, priority?: Priority): Promise<FetchResponse>;
  armBan(ms: number, code: number): void;
};

export type SignedResult = Classified & {
  status: number;
  body: unknown;
  orderCount: { tenSec: number | null; oneMin: number | null };
};

export type RequestOpts = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  params?: Record<string, string | number | boolean | undefined>;
  // BẮT BUỘC khai báo: true = request tạo lệnh → không bao giờ tự thử lại
  createsOrder: boolean;
  recvWindow?: number;
};

const BACKOFF_MS = [200, 400, 800];
const DEFAULT_RECV_WINDOW = 5000; // mặc định của tài liệu
const DEFAULT_SYNC_INTERVAL_MS = 5 * 60_000; // [Đề xuất] tài liệu không nêu chu kỳ

function headerNum(h: { get(n: string): string | null }, name: string): number | null {
  const v = h.get(name);
  if (v === null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function createSigned(opts: {
  client: ClientLike;
  apiKey: string;
  signer: Signer;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  maxSkewMs?: number; // lệch giờ tối đa cho phép gửi lệnh (mặc định 500)
  syncIntervalMs?: number;
  recvWindow?: number;
  log?: (msg: string) => void;
  secrets?: readonly string[]; // giá trị cần che thêm trong log
}) {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxSkew = opts.maxSkewMs ?? 500;
  const syncEvery = opts.syncIntervalMs ?? DEFAULT_SYNC_INTERVAL_MS;
  const secrets = [opts.apiKey, ...opts.signer.secrets, ...(opts.secrets ?? [])]; // key + secret luôn được che
  let offset = 0;
  let lastSync: number | null = null;

  const log = (m: string) => opts.log?.(redact(m, secrets));

  // Đo lệch giờ: offset = giờ server - giờ máy (lấy điểm giữa lúc gửi và nhận để bù độ trễ mạng)
  async function syncClock(): Promise<number> {
    const t0 = now();
    const res = await opts.client.send('/fapi/v1/time', { method: 'GET', headers: {} }, 'bot');
    const t1 = now();
    const body = (await res.json()) as { serverTime?: unknown };
    if (res.status !== 200 || typeof body?.serverTime !== 'number') {
      throw new Error(redact(`Không đọc được giờ server (HTTP ${res.status})`, secrets));
    }
    offset = body.serverTime - (t0 + t1) / 2;
    lastSync = t1;
    log(`Đồng bộ giờ: lệch ${offset} ms`);
    return offset;
  }

  function build(o: RequestOpts): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(o.params ?? {})) {
      if (k === 'timestamp' || k === 'signature' || k === 'recvWindow') throw new Error(`Không được tự đặt tham số "${k}"`);
      if (v === undefined) continue;
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
    parts.push(`recvWindow=${o.recvWindow ?? opts.recvWindow ?? DEFAULT_RECV_WINDOW}`);
    parts.push(`timestamp=${Math.round(now() + offset)}`);
    const payload = parts.join('&');
    return `${o.path}?${payload}&signature=${encodeURIComponent(opts.signer.sign(payload))}`; // signature luôn ở cuối
  }

  const empty = { tenSec: null, oneMin: null };

  async function once(o: RequestOpts): Promise<SignedResult> {
    let url: string;
    try {
      url = build(o);
    } catch (e) {
      // Lỗi cục bộ (tham số sai): request CHƯA hề được gửi
      return { kind: 'rejected', code: null, msg: redact(e instanceof Error ? e.message : String(e), secrets), status: 0, body: null, orderCount: empty };
    }
    let res;
    try {
      res = await opts.client.send(url, { method: o.method, headers: { 'X-MBX-APIKEY': opts.apiKey } }, 'bot');
    } catch (e) {
      if (e instanceof BanActiveError) {
        return { kind: 'banned', code: e.httpCode, msg: redact(e.message, secrets), status: e.httpCode, body: null, orderCount: empty };
      }
      // Lỗi mạng sau khi có thể đã gửi: không biết lệnh có tới sàn chưa
      const m = redact(e instanceof Error ? e.message : String(e), secrets);
      return { kind: 'unknown_status', code: null, msg: `Lỗi mạng khi gửi: ${m}`, status: 0, body: null, orderCount: empty };
    }
    const orderCount = { tenSec: headerNum(res.headers, 'x-mbx-order-count-10s'), oneMin: headerNum(res.headers, 'x-mbx-order-count-1m') };
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      // Phản hồi không đọc được: với 418/429 vẫn là khóa; còn lại coi là chưa rõ
      const c = classify(res.status, null);
      const kind: Kind = c.kind === 'banned' ? 'banned' : 'unknown_status';
      return { kind, code: null, msg: `Phản hồi không phải JSON hợp lệ (HTTP ${res.status})`, status: res.status, body: null, orderCount };
    }
    const c = classify(res.status, body);
    if (c.code === -1003 && res.status !== 418 && res.status !== 429) opts.client.armBan(60_000, 429); // -1003 ở status khác vẫn khóa chung
    return { ...c, msg: redact(c.msg, secrets), status: res.status, body, orderCount };
  }

  async function ensureClock(): Promise<SignedResult | null> {
    if (lastSync === null || now() - lastSync > syncEvery) {
      try {
        await syncClock();
      } catch (e) {
        if (e instanceof BanActiveError) {
          return { kind: 'banned', code: e.httpCode, msg: redact(e.message, secrets), status: e.httpCode, body: null, orderCount: empty };
        }
        return { kind: 'clock', code: null, msg: redact(e instanceof Error ? e.message : String(e), secrets), status: 0, body: null, orderCount: empty };
      }
    }
    if (Math.abs(offset) > maxSkew) {
      return { kind: 'clock', code: null, msg: `Đồng hồ máy lệch giờ server ${offset} ms (> ${maxSkew} ms) — từ chối gửi request ký`, status: 0, body: null, orderCount: empty };
    }
    return null;
  }

  async function request(o: RequestOpts): Promise<SignedResult> {
    const bad = await ensureClock();
    if (bad) { log(bad.msg); return bad; }

    let r = await once(o);
    log(`${o.method} ${o.path} -> HTTP ${r.status} ${r.kind}${r.code !== null ? ` (${r.code})` : ''}${r.kind === 'unknown_status' ? ` ${r.msg}` : ''}`);

    if (r.kind === 'clock' && r.code === -1021) {
      // Giờ lệch: đo lại. Chỉ thử lại (đúng 1 lần) khi KHÔNG tạo lệnh.
      const bad2 = await ensureClockForce();
      if (bad2) return bad2;
      if (!o.createsOrder) {
        r = await once(o);
        log(`${o.method} ${o.path} (thử lại sau đồng bộ giờ) -> HTTP ${r.status} ${r.kind}`);
      }
      return r;
    }

    if (!o.createsOrder) {
      for (const wait of BACKOFF_MS) {
        if (r.kind !== 'retryable') break;
        await sleep(wait);
        r = await once(o);
        log(`${o.method} ${o.path} (thử lại sau ${wait} ms) -> HTTP ${r.status} ${r.kind}`);
      }
    }
    return r;
  }

  async function ensureClockForce(): Promise<SignedResult | null> {
    lastSync = null;
    return ensureClock();
  }

  return { request, syncClock, offsetMs: () => offset };
}
