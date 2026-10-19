import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runScan, type ScanInput } from './run-scan.ts';
import type { Candle, Contract } from '../packages/core/types.ts';

const NOW = Date.parse('2026-10-19T12:30:00Z');

// Dữ liệu tổng hợp (không gọi mạng): mọi khung là chuỗi tăng đều, thời gian thật theo khung, nến cuối là nến vừa đóng trước NOW.
// Khối lượng ~1 triệu USDT mỗi nến (đủ thanh khoản để trượt giá theo cỡ lệnh không lấn át kế hoạch vốn 1000).
const IV: Record<string, number> = { '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000 };
const k = (openTime: number, iv: number, close: number): Candle => ({ openTime, closeTime: openTime + iv - 1, open: close * 0.999, high: close * 1.004, low: close * 0.996,
  close, volume: 1e6 / close, quoteVolume: 1e6, takerBuyQuote: 5e5 });
const series = (n: number, step: number, interval: string, end = NOW) => {
  const iv = IV[interval]!;
  const last = Math.floor(end / iv) * iv; // mở của nến đang chạy → nến cuối (đã đóng) mở lúc last − iv
  return Array.from({ length: n }, (_, i) => k(last - (n - i) * iv, iv, 100 + i * step + 2 * Math.sin(i / 6)));
};
const contract = (symbol: string): Contract => ({ symbol, baseAsset: symbol.replace('USDT', ''), onboardDate: Date.parse('2024-01-01'), tickSize: 0.001, stepSize: 0.001, minQty: 0.001, maxQty: 1e9, marketMinQty: 0.001, marketMaxQty: 1e9, marketStepSize: 0.001, minNotional: 5, maxNumOrders: 200, deliveryDate: 4133404800000 });

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
      return series(n, interval === '1d' ? 1 : 0.2, interval);
    },
    now: NOW, events: [{ kind: 'FOMC' as const, time: '2027-01-27T19:00:00Z', source: 'test: lịch còn hạn, xa cửa sổ' }], capital: 1000, limit: null, openTrades: [], prevSignals: new Map(),
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

test('I3 runScan: nến khung vào lệnh cũ (hợp đồng dừng giao dịch / nguồn trả dữ liệu cũ) → ghi lỗi "dữ liệu cũ", KHÔNG chấm mã đó', async () => {
  const base = input();
  const r = await runScan({ ...base, klines: (s, iv, l) => (s === 'AAAUSDT' && iv === '4h' ? series(Math.min(l, 500), 0.2, '4h', NOW - 12 * 3_600_000) : base.klines(s, iv, l)) });
  assert.ok(!r.results.some((a) => a.symbol === 'AAAUSDT'));
  const e = r.errors.find((x) => x.symbol === 'AAAUSDT');
  assert.ok(e, JSON.stringify(r.errors));
  assert.match(e.error, /dữ liệu cũ/);
  assert.ok(r.results.some((a) => a.symbol === 'BBBUSDT'), 'mã khác vẫn được chấm');
});

test('I3 runScan: thiếu nến giữa chuỗi khung xu hướng → ghi lỗi "thiếu", không chấm', async () => {
  const base = input();
  const r = await runScan({ ...base, klines: (s, iv, l) => {
    const c = base.klines(s, iv, l) as Candle[];
    return s === 'BBBUSDT' && iv === '1d' ? [...c.slice(0, 100), ...c.slice(102)] : c;
  } });
  assert.match(r.errors.find((x) => x.symbol === 'BBBUSDT')?.error ?? '', /thiếu 2 nến/);
});

test('I3 runScan: nến BTC cũ → ném lỗi, không quét (chế độ thị trường/cầu dao không được tính trên dữ liệu cũ)', async () => {
  const base = input();
  await assert.rejects(runScan({ ...base, klines: (s, iv, l) => (s === 'BTCUSDT' && iv === '1h' ? series(l, 0.05, '1h', NOW - 6 * 3_600_000) : base.klines(s, iv, l)) }), /BTC.*dữ liệu cũ/);
});
