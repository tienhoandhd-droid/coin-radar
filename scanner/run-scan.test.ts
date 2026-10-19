import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runScan, type ScanInput } from './run-scan.ts';
import type { Candle, Contract } from '../packages/core/types.ts';

// Dữ liệu tổng hợp (không gọi mạng): mọi khung là chuỗi tăng đều; thời gian theo giây giả lập.
const k = (i: number, close: number): Candle => ({ openTime: i * 1000, closeTime: i * 1000 + 999, open: close * 0.999, high: close * 1.004, low: close * 0.996,
  close, volume: 100, quoteVolume: 100 * close, takerBuyQuote: 50 * close });
const series = (n: number, step: number) => Array.from({ length: n }, (_, i) => k(i, 100 + i * step + 2 * Math.sin(i / 6)));
const contract = (symbol: string): Contract => ({ symbol, baseAsset: symbol.replace('USDT', ''), onboardDate: Date.parse('2024-01-01'), tickSize: 0.001, stepSize: 0.001, minQty: 0.001, maxQty: 1e9, marketMinQty: 0.001, marketMaxQty: 1e9, marketStepSize: 0.001, minNotional: 5, maxNumOrders: 200, deliveryDate: 4133404800000 });
const NOW = Date.parse('2026-10-19T12:00:00Z');

function input(over: Partial<ScanInput> = {}, fail: Record<string, string> = {}): ScanInput {
  const symbols = ['BTCUSDT', 'AAAUSDT', 'BBBUSDT', 'CCCUSDT'];
  return {
    mode: 'swing', contracts: symbols.map(contract),
    tickers: symbols.map((s, i) => ({ symbol: s, quoteVolume24h: 1e9 / (i + 1), priceChangePct24h: 1 })),
    books: new Map(symbols.map((s) => [s, { symbol: s, bid: 199.9, ask: 200 }])),
    premiums: new Map(symbols.map((s) => [s, { symbol: s, markPrice: 200, lastFundingRate: 0.0001, nextFundingTime: NOW + 3_600_000 }])),
    fundingIntervals: new Map(),
    klines: (symbol, interval, limit) => {
      if (fail[symbol]) throw new Error(fail[symbol]);
      const n = Math.min(limit, 500);
      return series(n, interval === '1d' ? 1 : 0.2);
    },
    now: NOW, events: [], capital: 1000, limit: null,
    ...over,
  };
}

test('B4 runScan: hàm gọi được (không I/O mạng), xác định; lỗi từng mã được ghi, quét tiếp', async () => {
  const r = await runScan(input({}, { BBBUSDT: 'nến hỏng' }));
  assert.equal(r.banned, false);
  assert.deepEqual(r.errors, [{ symbol: 'BBBUSDT', error: 'nến hỏng' }]);
  assert.deepEqual(r.results.map((a) => a.symbol).sort(), ['AAAUSDT', 'BTCUSDT', 'CCCUSDT']);
  assert.ok(['up', 'sideways', 'down'].includes(r.regime.regime));
  // xác định: chạy lại cho cùng kết quả
  const again = await runScan(input({}, { BBBUSDT: 'nến hỏng' }));
  assert.equal(JSON.stringify(again.results), JSON.stringify(r.results));
  assert.ok(r.results.every((a) => a.mode === 'swing'));
});

test('B4 runScan: Binance chặn (HTTP 418/429) → DỪNG ngay, không gọi tiếp mã sau, banned = true', async () => {
  const calls: string[] = [];
  const base = input({}, { AAAUSDT: 'HTTP 429 Too Many Requests' });
  const r = await runScan({ ...base, klines: (s, iv, l) => { calls.push(s); return base.klines(s, iv, l); } });
  assert.equal(r.banned, true);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0]!.error, /429/);
  assert.equal(calls.includes('BBBUSDT') || calls.includes('CCCUSDT'), false);
});

test('B4 runScan: --limit và Lướt nhanh giới hạn số hợp đồng quét (theo thứ hạng thanh khoản)', async () => {
  const r = await runScan(input({ limit: 2 }));
  assert.deepEqual(r.results.map((a) => a.symbol), ['BTCUSDT', 'AAAUSDT']);
  assert.equal(r.universeSize, 2);
});
