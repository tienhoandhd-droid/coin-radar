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

// Rà soát B0b #2: MỌI chuỗi nến dùng cho cổng/kế hoạch phải được kiểm độ mới/thiếu nến
const staleFor = (base: ScanInput, iv: string) => (s: string, interval: string, l: number) =>
  s !== 'BTCUSDT' && interval === iv ? series(Math.min(l, 500), 0.05, interval, NOW - 3 * 86_400_000) : base.klines(s, interval, l);

test('I3 runScan Swing: nến 1H cũ (cả mã trong và ngoài phạm vi mô hình) → không chấm, lỗi nêu khung 1H', async () => {
  const base = input();
  const r = await runScan({ ...base, klines: staleFor(base, '1h') });
  const others = ['AAAUSDT', 'BBBUSDT', 'CCCUSDT'];
  for (const s of others) assert.match(r.errors.find((e) => e.symbol === s)?.error ?? 'không lỗi', /1H.*dữ liệu cũ|dữ liệu cũ.*1H/, s);
  assert.ok(!r.results.some((a) => others.includes(a.symbol)));
});

test('I3 runScan Lướt nhanh: nến 1D cũ → không chấm; nến 4H (phần mô hình) cũ → mã trong phạm vi không chấm', async () => {
  const base = input({ mode: 'fast' });
  const d = await runScan({ ...base, klines: staleFor(base, '1d') });
  for (const s of ['AAAUSDT', 'BBBUSDT', 'CCCUSDT']) assert.match(d.errors.find((e) => e.symbol === s)?.error ?? 'không lỗi', /1D/, s);
  // Mã nào tải nến 4H (mã trong phạm vi mô hình) mà 4H cũ → phải bị ghi lỗi nêu 4H; ép mã vào phạm vi bằng nến 1D biến động thấp
  const calm = (s: string, interval: string, l: number) => (interval === '1d' ? series(Math.min(l, 500), 0.01, '1d').map((x) => ({ ...x, high: x.close * 1.001, low: x.close * 0.999 })) : base.klines(s, interval, l));
  const asked = new Set<string>();
  const h4 = await runScan({ ...base, klines: (s, iv, l) => {
    if (iv === '4h') asked.add(s);
    return iv === '4h' ? series(Math.min(l, 500), 0.05, '4h', NOW - 3 * 86_400_000) : calm(s, iv, l);
  } });
  const scoped = [...asked]; // Lướt nhanh: BTC chung không tải 4H, nên 4H chỉ là nến mô hình của từng mã
  assert.ok(scoped.length > 0, 'fixture cần ít nhất một mã trong phạm vi mô hình');
  for (const s of scoped) assert.match(h4.errors.find((e) => e.symbol === s)?.error ?? 'không lỗi', /4H/, s);
});

test('I7 runScan: leverageBrackets theo mã → dùng bậc thật; có bảng bậc nhưng thiếu mã → G-08 trượt (không âm thầm dùng giả định)', async () => {
  const real = [{ bracket: 1, initialLeverage: 20, notionalCap: 1e9, notionalFloor: 0, maintMarginRatio: 0.004, cum: 0 }];
  const r = await runScan(input({ leverageBrackets: new Map([['AAAUSDT', real]]) }));
  const a = r.results.find((x) => x.symbol === 'AAAUSDT')!;
  assert.match(a.gates.find((g) => g.code === 'G-08')!.note, /leverageBracket/);
  const b = r.results.find((x) => x.symbol === 'BBBUSDT')!;
  assert.equal(b.gates.find((g) => g.code === 'G-08')!.pass, false);
  const none = await runScan(input());
  assert.match(none.results.find((x) => x.symbol === 'AAAUSDT')!.gates.find((g) => g.code === 'G-08')!.note, /giả định/);
});

test('đệm funding máy quét: tải |funding| lớn nhất 30 ngày CHỈ cho mã Đạt tiêu chí, kế hoạch = như khi truyền sẵn fundingMaxAbs', async () => {
  const asked: string[] = [];
  const r = await runScan(input({ fundingMaxAbsLoader: async (s) => { asked.push(s); return 0.002; } }));
  const dat = r.results.filter((a) => a.label.startsWith('Đạt')).map((a) => a.symbol).sort();
  assert.ok(dat.length > 0);
  assert.deepEqual(asked.sort(), dat);
  const ref = await runScan(input({ fundingMaxAbs: new Map(dat.map((s) => [s, 0.002])) }));
  assert.equal(JSON.stringify(r.results), JSON.stringify(ref.results));
  const plain = await runScan(input());
  const qa = (x: typeof r) => x.results.find((a) => a.symbol === 'AAAUSDT')!.plan!.qty;
  assert.ok(qa(r) < qa(plain), 'đệm 0,2%/kỳ lớn hơn kỳ gần nhất 0,01% → khối lượng nhỏ hơn');
});

test('đệm funding máy quét: không tải được → mức thận trọng fundingFallbackRate + ghi chú hiện trên kết quả; HTTP 429 → dừng quét', async () => {
  const { fundingFallbackRate } = await import('../packages/core/sizing.ts');
  const r = await runScan(input({ fundingMaxAbsLoader: async () => { throw new Error('mạng lỗi'); } }));
  const a = r.results.find((x) => x.symbol === 'AAAUSDT')!;
  assert.ok(a.flags.some((f) => /đệm funding/.test(f) && /mạng lỗi/.test(f)), a.flags.join(' | '));
  const ref = await runScan(input({ fundingMaxAbs: new Map([['AAAUSDT', fundingFallbackRate(8)]]) }));
  assert.equal(a.plan!.qty, ref.results.find((x) => x.symbol === 'AAAUSDT')!.plan!.qty);
  const b = await runScan(input({ fundingMaxAbsLoader: async () => { throw new Error('HTTP 429 quá tải'); } }));
  assert.equal(b.banned, true);
});

test('Task 8: luật vào lệnh mới áp sau khi chấm (ScanResult.entryBlocks); #7 Swing chỉ quét N mã thanh khoản cao nhất', async () => {
  const { withConfigOverride } = await import('../packages/core/config-override.ts');
  const plain = await runScan(input());
  assert.equal(plain.entryBlocks.size, 0, 'mặc định không chặn');
  await withConfigOverride({ 'COMMON.entryRules.swingTrendOnly': true, 'COMMON.entryRules.swingUniverseSize': 2 }, async () => {
    const r = await runScan(input());
    assert.equal(r.universeSize, 2);
    const dat = r.results.filter((a) => a.label.startsWith('Đạt'));
    assert.equal(r.entryBlocks.size, r.regime.regime === 'sideways' ? dat.length : 0);
  });
});
