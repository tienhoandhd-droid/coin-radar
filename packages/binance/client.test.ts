import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, type FetchLike } from './client.ts';

function fake(status: number, weight: string, body: unknown): FetchLike {
  return async () => ({ status, headers: { get: (n: string) => (n.toLowerCase() === 'x-mbx-used-weight-1m' ? weight : null) }, json: async () => body });
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
