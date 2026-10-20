import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchClusterDaily } from './cluster-data.ts';
import { withConfigOverride } from '../core/config-override.ts';
import type { OpenTrade } from '../core/portfolio.ts';
import type { Candle } from '../core/types.ts';

const CL = { 'COMMON.portfolio.cluster': { corrDays: 30, corrMax: 0.7, betaDays: 60, betaFloor: 0.5, maxBetaRiskPct: 10 } };
const open: OpenTrade[] = [{ symbol: 'ETHUSDT', side: 'long', notional: 100, leverage: 2, riskAmount: 10, pastTp1: false }];
const candle = (i: number): Candle => ({ openTime: i, closeTime: i + 1, open: 1, high: 1, low: 1, close: 1, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 });

test('bot risk-cluster: tắt → không tải gì (undefined); bật → tải 1D mã mới + mã đang mở + BTC, limit = 62 (đủ 61 nến đã đóng)', async () => {
  const calls: Array<[string, number]> = [];
  const fetchDaily = async (s: string, limit: number) => { calls.push([s, limit]); return [candle(1)]; };
  await withConfigOverride({ 'COMMON.portfolio.cluster': null }, async () => {
    assert.equal(await fetchClusterDaily('SOLUSDT', open, fetchDaily, () => {}), undefined);
  });
  assert.deepEqual(calls, []);
  await withConfigOverride(CL, async () => {
    const m = await fetchClusterDaily('SOLUSDT', open, fetchDaily, () => {});
    assert.deepEqual([...m!.keys()], ['SOLUSDT', 'BTCUSDT', 'ETHUSDT']);
  });
  assert.deepEqual(calls, [['SOLUSDT', 62], ['BTCUSDT', 62], ['ETHUSDT', 62]]);
});

test('bot risk-cluster FAIL CLOSED: tải lỗi → ghi log + null (không vào lệnh); lỗi sàn chặn (isFatal) → ném cho bot xử lý', async () => {
  await withConfigOverride(CL, async () => {
    const logs: string[] = [];
    const r = await fetchClusterDaily('SOLUSDT', open, async (s) => { if (s === 'ETHUSDT') throw new Error('HTTP 500'); return []; }, (m) => logs.push(m));
    assert.equal(r, null);
    assert.match(logs.join(' '), /không tải được nến 1D ETHUSDT \(HTTP 500\) — không vào lệnh mới/);
    await assert.rejects(fetchClusterDaily('SOLUSDT', [], async () => { throw new Error('HTTP 429'); }, () => {}, (e) => /429/.test(String(e))), /429/);
  });
});
