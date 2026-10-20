import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchFgiDecision, FGI_URL_RECENT } from './fgi.ts';
import { withConfigOverride } from '../packages/core/config-override.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 20, 4); // 20/10/2026 04:00 UTC → dùng tới ngày 19/10
const raw = (vals: number[]) => ({ metadata: { error: null }, data: vals.map((v, i) => ({ value: String(v), timestamp: String((Date.UTC(2026, 9, 19) - i * DAY) / 1000) })) });
const FGI = { 'COMMON.entryRules.fgiDirection': { lagDays: 1, meanDays: 7, threshold: 50 } };

test('fetchFgiDecision (fetch tiêm vào, không gọi mạng): tải đúng URL Alternative.me, TB 7 ngày → phía được phép', async () => {
  await withConfigOverride(FGI, async () => {
    const urls: string[] = [];
    const d = await fetchFgiDecision({ fetchJson: async (u) => { urls.push(u); return raw([70, 70, 70, 70, 70, 70, 70, 10]); }, now: NOW, log: () => {} });
    assert.deepEqual(urls, [FGI_URL_RECENT]);
    assert.match(FGI_URL_RECENT, /^https:\/\/api\.alternative\.me\/fng\//);
    assert.equal(d.side, 'long');
  });
});

test('fetchFgiDecision FAIL CLOSED: lỗi mạng / dữ liệu hỏng / thiếu ngày → ghi log + side null (không vào lệnh mới), không ném', async () => {
  await withConfigOverride(FGI, async () => {
    const logs: string[] = [];
    const down = await fetchFgiDecision({ fetchJson: async () => { throw new Error('HTTP 503'); }, now: NOW, log: (m) => logs.push(m) });
    assert.equal(down.side, null);
    assert.match(down.reason, /HTTP 503/);
    assert.match(logs.join(' '), /không tải được.*không vào lệnh Swing mới/);
    const bad = await fetchFgiDecision({ fetchJson: async () => ({ nope: 1 }), now: NOW, log: (m) => logs.push(m) });
    assert.equal(bad.side, null);
    const stale = await fetchFgiDecision({ fetchJson: async () => raw([70, 70, 70]), now: NOW, log: (m) => logs.push(m) });
    assert.equal(stale.side, null);
    assert.match(stale.reason, /thiếu ngày/);
  });
});
