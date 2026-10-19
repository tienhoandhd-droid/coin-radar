import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync, verify } from 'node:crypto';
import { createClient, type FetchInit, type FetchLike } from './client.ts';
import { classify, createSigned, hmacSigner, loadCredentials, markForwardsInit, nodeFetch, rsaSigner } from './signed.ts';
import { redact } from './redact.ts';

const KEY = 'test-api-key-AAAA';
const SECRET = 'test-secret-BBBB';

type Call = { url: string; init?: FetchInit };
type Reply = { status?: number; headers?: Record<string, string>; body?: unknown; raw?: string; throws?: boolean };

// Fetch giả: trả lần lượt các reply; /fapi/v1/time trả theo serverTime của tests
function harness(replies: Reply[], opts: { serverTime?: number; localNow?: number; maxSkewMs?: number; clientOpts?: Record<string, unknown> } = {}) {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  let q = [...replies];
  const clock = { t: opts.localNow ?? 1_000_000 };
  const fetch: FetchLike = markForwardsInit(async (url, init) => {
    calls.push({ url, init });
    if (url.includes('/fapi/v1/time')) {
      return { status: 200, headers: { get: () => null }, json: async () => ({ serverTime: opts.serverTime ?? clock.t }) };
    }
    const r = q.shift() ?? { status: 200, body: {} };
    if (r.throws) throw new Error('ECONNRESET');
    return {
      status: r.status ?? 200,
      headers: { get: (n: string) => r.headers?.[n.toLowerCase()] ?? null },
      json: async () => { if (r.raw !== undefined) return JSON.parse(r.raw); return r.body ?? {}; },
    };
  });
  const now = () => clock.t;
  const sleep = async (ms: number) => { sleeps.push(ms); };
  const client = createClient({ fetch, now, sleep, ...opts.clientOpts });
  const api = createSigned({ client, apiKey: KEY, signer: hmacSigner(SECRET), now, sleep, maxSkewMs: opts.maxSkewMs ?? 500 });
  return { api, calls, sleeps, clock, client };
}

test('vector ký: HMAC-SHA256 trên đúng chuỗi query, signature đứng cuối', async () => {
  const h = harness([{ body: { ok: 1 } }]);
  await h.api.syncClock();
  await h.api.request({ method: 'GET', path: '/fapi/v2/account', params: { symbol: 'BTCUSDT' }, createsOrder: false });
  const url = h.calls.at(-1)!.url;
  const qs = url.split('?')[1]!;
  const idx = qs.lastIndexOf('&signature=');
  const payload = qs.slice(0, idx);
  assert.equal(payload, 'symbol=BTCUSDT&recvWindow=5000&timestamp=1000000');
  assert.equal(qs.slice(idx + '&signature='.length), createHmac('sha256', SECRET).update(payload).digest('hex'));
  assert.equal(h.calls.at(-1)!.init?.headers?.['X-MBX-APIKEY'], KEY);
  assert.equal(h.calls.at(-1)!.init?.method, 'GET');
});

test('vector cố định (tính tay bằng node:crypto): chuỗi mẫu', () => {
  const payload = 'symbol=BTCUSDT&side=BUY&type=MARKET&quantity=1&recvWindow=5000&timestamp=1499827319559';
  const expected = createHmac('sha256', 'NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j').update(payload).digest('hex');
  assert.equal(hmacSigner('NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j').sign(payload), expected);
});

test('RSA: base64, kiểm lại được bằng public key', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const sig = rsaSigner(pem).sign('a=1&timestamp=2');
  assert.ok(verify('sha256', Buffer.from('a=1&timestamp=2'), publicKey, Buffer.from(sig, 'base64')));
  assert.ok(!/\n/.test(sig));
});

test('timestamp áp dụng độ lệch giờ server (offset)', async () => {
  const h = harness([{}], { serverTime: 1_000_300, localNow: 1_000_000 });
  await h.api.syncClock();
  assert.equal(h.api.offsetMs(), 300);
  await h.api.request({ method: 'GET', path: '/fapi/v2/account', createsOrder: false });
  assert.match(h.calls.at(-1)!.url, /timestamp=1000300/);
});

test('lệch giờ > 500 ms → từ chối gửi, không có request ký nào ra mạng', async () => {
  const h = harness([{}], { serverTime: 1_000_600, localNow: 1_000_000 });
  const r = await h.api.request({ method: 'POST', path: '/fapi/v1/order', params: { symbol: 'X' }, createsOrder: true });
  assert.equal(r.kind, 'clock');
  assert.match(r.msg, /lệch giờ/);
  assert.equal(h.calls.filter((c) => !c.url.includes('/time')).length, 0);
});

test('lệch -500 ms vẫn được gửi (ngưỡng là > 500)', async () => {
  const h = harness([{}], { serverTime: 999_500, localNow: 1_000_000 });
  const r = await h.api.request({ method: 'GET', path: '/fapi/v2/account', createsOrder: false });
  assert.equal(r.kind, 'ok');
});

test('đồng bộ lại định kỳ khi quá hạn', async () => {
  const h = harness([{}, {}]);
  await h.api.request({ method: 'GET', path: '/a', createsOrder: false });
  const n1 = h.calls.filter((c) => c.url.includes('/time')).length;
  await h.api.request({ method: 'GET', path: '/a', createsOrder: false });
  assert.equal(h.calls.filter((c) => c.url.includes('/time')).length, n1);
  h.clock.t += 6 * 60_000;
  await h.api.request({ method: 'GET', path: '/a', createsOrder: false });
  assert.equal(h.calls.filter((c) => c.url.includes('/time')).length, n1 + 1);
});

test('bảng phân loại lỗi', () => {
  const c = (status: number, body: unknown) => classify(status, body);
  assert.equal(c(200, { orderId: 1 }).kind, 'ok');
  assert.equal(c(200, { code: 200, msg: 'success' }).kind, 'ok');
  assert.equal(c(503, { code: -1007, msg: 'Unknown error, please check your request or try again later.' }).kind, 'unknown_status');
  assert.equal(c(503, { code: 0, msg: 'Unknown error, please check your request or try again later.' }).kind, 'unknown_status');
  assert.equal(c(503, { code: -1006, msg: 'x' }).kind, 'unknown_status');
  assert.equal(c(200, { code: -1006, msg: 'x' }).kind, 'unknown_status');
  assert.equal(c(408, {}).kind, 'unknown_status');
  assert.equal(c(500, {}).kind, 'unknown_status');
  assert.equal(c(503, null).kind, 'unknown_status');
  assert.equal(c(503, { msg: 'Service Unavailable.' }).kind, 'retryable');
  assert.equal(c(503, { code: -1001, msg: 'Internal error; unable to process your request. Please try again.' }).kind, 'retryable');
  assert.equal(c(400, { code: -1008, msg: 'Request throttled' }).kind, 'retryable');
  assert.equal(c(429, {}).kind, 'banned');
  assert.equal(c(418, {}).kind, 'banned');
  assert.equal(c(400, { code: -1003, msg: 'x' }).kind, 'banned');
  assert.equal(c(400, { code: -1021, msg: 'x' }).kind, 'clock');
  assert.equal(c(400, { code: -1022, msg: 'x' }).kind, 'rejected');
  assert.equal(c(400, { code: -1015, msg: 'x' }).kind, 'rejected');
  assert.equal(c(401, { code: -2015, msg: 'x' }).kind, 'rejected');
  assert.equal(c(400, { code: -2019, msg: 'Margin is insufficient.' }).kind, 'rejected');
  assert.equal(c(400, { code: -4164, msg: 'x' }).kind, 'rejected');
  assert.equal(c(400, { code: -4120, msg: 'x' }).kind, 'rejected');
  assert.equal(c(403, {}).kind, 'rejected');
  assert.deepEqual(c(400, { code: -2019, msg: 'm' }), { kind: 'rejected', code: -2019, msg: 'm' });
});

test('retryable: backoff 200/400/800 rồi dừng, tối đa 3 lần thử lại (lệnh không tạo lệnh)', async () => {
  const bad = { status: 503, body: { msg: 'Service Unavailable.' } };
  const h = harness([bad, bad, bad, bad, bad]);
  const r = await h.api.request({ method: 'GET', path: '/fapi/v2/account', createsOrder: false });
  assert.equal(r.kind, 'retryable');
  assert.deepEqual(h.sleeps, [200, 400, 800]);
  assert.equal(h.calls.filter((c) => !c.url.includes('/time')).length, 4);
});

test('retryable thành công ở lần thử lại', async () => {
  const h = harness([{ status: 503, body: { msg: 'Service Unavailable.' } }, { body: { a: 1 } }]);
  const r = await h.api.request({ method: 'GET', path: '/a', createsOrder: false });
  assert.equal(r.kind, 'ok');
  assert.deepEqual(h.sleeps, [200]);
});

test('lệnh tạo lệnh: KHÔNG tự thử lại dù lỗi retryable', async () => {
  const h = harness([{ status: 503, body: { msg: 'Service Unavailable.' } }, { body: {} }]);
  const r = await h.api.request({ method: 'POST', path: '/fapi/v1/order', params: { symbol: 'X' }, createsOrder: true });
  assert.equal(r.kind, 'retryable');
  assert.equal(h.sleeps.length, 0);
  assert.equal(h.calls.filter((c) => !c.url.includes('/time')).length, 1);
});

test('unknown_status không bao giờ tự gửi lại (cả loại không tạo lệnh)', async () => {
  const h = harness([{ status: 503, body: { code: -1007, msg: 'Unknown error' } }, { body: {} }]);
  const r = await h.api.request({ method: 'DELETE', path: '/fapi/v1/order', createsOrder: false });
  assert.equal(r.kind, 'unknown_status');
  assert.equal(h.calls.filter((c) => !c.url.includes('/time')).length, 1);
});

test('lỗi mạng khi gửi → unknown_status; JSON hỏng → unknown_status', async () => {
  const h1 = harness([{ throws: true }]);
  assert.equal((await h1.api.request({ method: 'POST', path: '/fapi/v1/order', createsOrder: true })).kind, 'unknown_status');
  const h2 = harness([{ raw: '{oops' }]);
  assert.equal((await h2.api.request({ method: 'POST', path: '/fapi/v1/order', createsOrder: true })).kind, 'unknown_status');
});

test('-1021: đồng bộ lại giờ; không tạo lệnh thì thử lại đúng 1 lần, tạo lệnh thì không', async () => {
  const e = { status: 400, body: { code: -1021, msg: 'Timestamp for this request is outside of the recvWindow.' } };
  const h = harness([e, { body: { ok: 1 } }]);
  const r = await h.api.request({ method: 'GET', path: '/a', createsOrder: false });
  assert.equal(r.kind, 'ok');
  const h2 = harness([e, { body: {} }]);
  const r2 = await h2.api.request({ method: 'POST', path: '/fapi/v1/order', createsOrder: true });
  assert.equal(r2.kind, 'clock');
  assert.equal(h2.calls.filter((c) => !c.url.includes('/time') ).length, 1);
});

test('429 → banned và khóa chung: request sau không ra mạng; đọc header order-count', async () => {
  const h = harness([{ status: 429, headers: { 'retry-after': '30' }, body: {} }, { body: {} }]);
  const r = await h.api.request({ method: 'GET', path: '/a', createsOrder: false });
  assert.equal(r.kind, 'banned');
  const n = h.calls.length;
  const r2 = await h.api.request({ method: 'GET', path: '/a', createsOrder: false });
  assert.equal(r2.kind, 'banned');
  assert.equal(h.calls.length, n);
  const h3 = harness([{ headers: { 'x-mbx-order-count-10s': '3', 'x-mbx-order-count-1m': '7', 'x-mbx-used-weight-1m': '12' }, body: {} }]);
  const r3 = await h3.api.request({ method: 'POST', path: '/fapi/v1/order', createsOrder: true });
  assert.deepEqual(r3.orderCount, { tenSec: 3, oneMin: 7 });
  assert.equal(h3.client.usedWeight(), 12);
});

test('ưu tiên weight: máy quét dừng ở trần thấp, bot dùng tiếp tới trần cao', async () => {
  const waits: number[] = [];
  const fetch: FetchLike = async () => ({ status: 200, headers: { get: (n) => (n === 'x-mbx-used-weight-1m' ? '2000' : null) }, json: async () => ({}) });
  const client = createClient({ fetch, weightCeiling: 1800, botCeiling: 2400, sleep: async (ms) => { waits.push(ms); }, now: () => 5_000 });
  await client.send('/a', undefined, 'scanner');
  await client.send('/a', undefined, 'scanner'); // used=2000 >= 1800 → chờ
  assert.equal(waits.length, 1);
  await client.send('/a', undefined, 'bot'); // used=2000 < 2400 → không chờ
  assert.equal(waits.length, 1);
});

test('loadCredentials: demo/live chọn base URL; thiếu hoặc sai thì báo lỗi, không lộ giá trị', () => {
  const live = loadCredentials({ BINANCE_API_KEY: 'k', BINANCE_API_SECRET: 's', BINANCE_ENV: 'live' });
  assert.equal(live.base, 'https://fapi.binance.com');
  const demo = loadCredentials({ BINANCE_API_KEY: 'k', BINANCE_API_SECRET: 's', BINANCE_ENV: 'demo' });
  assert.equal(demo.base, 'https://demo-fapi.binance.com');
  assert.throws(() => loadCredentials({ BINANCE_API_KEY: 'k', BINANCE_API_SECRET: 's' }), /BINANCE_ENV/);
  assert.throws(() => loadCredentials({ BINANCE_API_KEY: 'k', BINANCE_API_SECRET: 's', BINANCE_ENV: 'prod' }), /BINANCE_ENV/);
  assert.throws(() => loadCredentials({ BINANCE_ENV: 'demo' }), /BINANCE_API_KEY/);
  assert.throws(() => loadCredentials({ BINANCE_API_KEY: 'k', BINANCE_ENV: 'demo' }), /BINANCE_API_SECRET/);
});

test('redact: che secret, key, signature, header', () => {
  const s = redact(`GET /x?a=1&signature=abcdef0123 key=${KEY} secret=${SECRET} X-MBX-APIKEY: ${KEY}`, [KEY, SECRET]);
  assert.ok(!s.includes(KEY) && !s.includes(SECRET) && !s.includes('abcdef0123'));
  assert.match(s, /signature=\[ĐÃ ẨN\]/);
  assert.ok(!redact('X-MBX-APIKEY: zzzz9999', []).includes('zzzz9999'));
});

test('log và thông điệp lỗi của lớp ký không chứa secret/signature', async () => {
  const logs: string[] = [];
  const h = harness([{ status: 400, body: { code: -2019, msg: 'Margin is insufficient.' } }]);
  const api = createSigned({ client: h.client, apiKey: KEY, signer: hmacSigner(SECRET), now: () => h.clock.t, sleep: async () => {}, log: (m) => logs.push(m), secrets: [KEY, SECRET] });
  await api.request({ method: 'POST', path: '/fapi/v1/order', params: { symbol: 'BTCUSDT' }, createsOrder: true });
  assert.ok(logs.length > 0);
  for (const l of logs) assert.ok(!l.includes(KEY) && !l.includes(SECRET) && !/signature=[0-9a-f]{16}/.test(l), l);
});

test('adapter làm rơi init (kiểu (url) => fetch(url)) bị từ chối TRƯỚC khi gửi', async () => {
  let sent = 0;
  const dropping: FetchLike = async (url) => { sent++; return { status: 200, headers: { get: () => null }, json: async () => ({ serverTime: 1 }) }; };
  const client = createClient({ fetch: dropping, now: () => 1, sleep: async () => {} });
  const api = createSigned({ client, apiKey: KEY, signer: hmacSigner(SECRET), now: () => 1, sleep: async () => {} });
  const r = await api.request({ method: 'POST', path: '/fapi/v1/order', createsOrder: true });
  assert.notEqual(r.kind, 'ok');
  assert.equal(sent, 0);
});

test('nodeFetch thật chuyển đủ method, X-MBX-APIKEY và body', async () => {
  const seen: { url?: string; init?: RequestInit }[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => { seen.push({ url, init }); return new Response('{}', { status: 200 }); }) as typeof fetch;
  try {
    await nodeFetch('https://x/y?a=1', { method: 'POST', headers: { 'X-MBX-APIKEY': KEY }, body: 'b=2' });
  } finally {
    globalThis.fetch = orig;
  }
  assert.equal(seen[0]!.init?.method, 'POST');
  assert.deepEqual(seen[0]!.init?.headers, { 'X-MBX-APIKEY': KEY });
  assert.equal(seen[0]!.init?.body, 'b=2');
  assert.equal(nodeFetch.forwardsInit, true);
});

test('tham số dành riêng → rejected cục bộ, không gửi, không phải unknown_status', async () => {
  const h = harness([{}]);
  const r = await h.api.request({ method: 'POST', path: '/fapi/v1/order', params: { timestamp: 5 }, createsOrder: true });
  assert.equal(r.kind, 'rejected');
  assert.equal(h.calls.filter((c) => !c.url.includes('/time')).length, 0);
});

test('secret từ signer luôn được che dù caller không truyền secrets', async () => {
  const logs: string[] = [];
  const base = harness([]);
  const fetch: FetchLike = markForwardsInit(async (url) => {
    if (url.includes('/time')) return { status: 200, headers: { get: () => null }, json: async () => ({ serverTime: 1_000_000 }) };
    throw new Error(`boom ${SECRET} ${KEY}`);
  });
  const client = createClient({ fetch, now: () => 1_000_000, sleep: async () => {} });
  const api = createSigned({ client, apiKey: KEY, signer: hmacSigner(SECRET), now: () => 1_000_000, sleep: async () => {}, log: (m) => logs.push(m) });
  const r = await api.request({ method: 'GET', path: '/a', createsOrder: false });
  assert.ok(!r.msg.includes(SECRET) && !r.msg.includes(KEY));
  assert.ok(logs.some((l) => l.includes('boom')));
  for (const l of logs) assert.ok(!l.includes(SECRET) && !l.includes(KEY), l);
  void base;
});

test('403 bật khóa chung ngắn; -1003 ở status 400 cũng bật khóa', async () => {
  const h = harness([{ status: 403, body: {} }, { body: {} }], { clientOpts: { forbiddenCooldownMs: 5000 } });
  assert.equal((await h.api.request({ method: 'GET', path: '/a', createsOrder: false })).kind, 'rejected');
  const n = h.calls.length;
  assert.equal((await h.api.request({ method: 'GET', path: '/a', createsOrder: false })).kind, 'banned');
  assert.equal(h.calls.length, n);
  h.clock.t += 6000;
  assert.equal((await h.api.request({ method: 'GET', path: '/a', createsOrder: false })).kind, 'ok');
  const h2 = harness([{ status: 400, body: { code: -1003, msg: 'x' } }, { body: {} }]);
  assert.equal((await h2.api.request({ method: 'GET', path: '/a', createsOrder: false })).kind, 'banned');
  const n2 = h2.calls.length;
  await h2.api.request({ method: 'GET', path: '/a', createsOrder: false });
  assert.equal(h2.calls.length, n2);
});

test('trần weight mặc định của bot < 2400', async () => {
  const waits: number[] = [];
  const fetch: FetchLike = async () => ({ status: 200, headers: { get: (n) => (n === 'x-mbx-used-weight-1m' ? '2300' : null) }, json: async () => ({}) });
  const client = createClient({ fetch, sleep: async (ms) => { waits.push(ms); }, now: () => 5_000 });
  await client.send('/a', undefined, 'bot');
  await client.send('/a', undefined, 'bot');
  assert.equal(waits.length, 1);
});
