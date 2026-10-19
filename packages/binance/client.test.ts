import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, type FetchLike } from './client.ts';

function fake(status: number, weight: string | null, body: unknown): FetchLike {
  return async () => ({ status, headers: { get: (n: string) => (n.toLowerCase() === 'x-mbx-used-weight-1m' ? weight : null) }, json: async () => body });
}

// Fake có header tùy ý và đếm số lần gọi fetch thật
function counting(status: number, headers: Record<string, string>, body: unknown = {}) {
  let calls = 0;
  const fetch: FetchLike = async () => {
    calls++;
    return { status, headers: { get: (n: string) => headers[n.toLowerCase()] ?? null }, json: async () => body };
  };
  return { fetch, calls: () => calls };
}

test('ghi nhận weight đã dùng từ header', async () => {
  const c = createClient({ fetch: fake(200, '37', [1]), sleep: async () => {} });
  assert.deepEqual(await c.get('/fapi/v1/ping'), [1]);
  assert.equal(c.usedWeight(), 37);
});

test('gần trần weight → chờ trước lần gọi kế', async () => {
  const waits: number[] = [];
  const c = createClient({ fetch: fake(200, '2300', []), weightCeiling: 2000, sleep: async (ms) => { waits.push(ms); } });
  await c.get('/a');
  await c.get('/b');
  assert.equal(waits.length, 1);
  assert.ok(waits[0]! > 0 && waits[0]! <= 61_000);
});

test('HTTP 451 → lỗi có mã và đường dẫn', async () => {
  const c = createClient({ fetch: fake(451, '0', {}), sleep: async () => {} });
  await assert.rejects(c.get('/fapi/v1/klines'), /451.*\/fapi\/v1\/klines/);
});

test('thiếu header weight → giữ nguyên usedWeight cũ', async () => {
  const c = createClient({ fetch: fake(200, '37', []), sleep: async () => {} });
  await c.get('/a');
  const c2 = createClient({ fetch: fake(200, null, []), sleep: async () => {} });
  await c2.get('/b');
  assert.equal(c2.usedWeight(), 0);
  // Cùng client: lần 2 không có header thì weight vẫn là 37, không bị reset về 0
  let withHeader = true;
  const c3 = createClient({
    fetch: async () => ({ status: 200, headers: { get: (n: string) => (withHeader && n.toLowerCase() === 'x-mbx-used-weight-1m' ? '37' : null) }, json: async () => [] }),
    sleep: async () => {},
  });
  await c3.get('/a');
  withHeader = false;
  await c3.get('/b');
  assert.equal(c3.usedWeight(), 37);
});

test('429 với Retry-After: 30 → lần gọi kế bị chặn không gọi fetch; sau 31 s thì gọi lại', async () => {
  let t = 1_000_000;
  const f = counting(429, { 'retry-after': '30' });
  const c = createClient({ fetch: f.fetch, sleep: async () => {}, now: () => t });
  await assert.rejects(c.get('/fapi/v1/klines'), /429.*\/fapi\/v1\/klines/);
  assert.equal(f.calls(), 1);
  await assert.rejects(c.get('/fapi/v1/klines'), /Binance đang chặn tạm thời tới .* \(HTTP 429\)/);
  assert.equal(f.calls(), 1);
  t += 31_000;
  await assert.rejects(c.get('/fapi/v1/klines'), /429/); // fetch lại, server vẫn trả 429 trong test
  assert.equal(f.calls(), 2);
});

test('418 không có Retry-After → chặn 60 s', async () => {
  let t = 0;
  const f = counting(418, {});
  const c = createClient({ fetch: f.fetch, sleep: async () => {}, now: () => t });
  await assert.rejects(c.get('/a'), /418.*\/a/);
  t += 59_000;
  await assert.rejects(c.get('/a'), /đang chặn/);
  assert.equal(f.calls(), 1);
  t += 2_000;
  await assert.rejects(c.get('/a'), /418/);
  assert.equal(f.calls(), 2);
});
