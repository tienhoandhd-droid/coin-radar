import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient, type FetchLike } from '../packages/binance/client.ts';
import {
  DAY, HOUR, MINUTE, INTERVAL_MS, klineWeight, planRange, needFrom, createPacer, createFetcher, loadCandles, fetchAll,
  type Interval,
} from './data.ts';

const END = Date.UTC(2026, 9, 19); // 2026-10-19T00:00Z
const NOW = END + 9 * HOUR; // đang ở giữa ngày 19/10

type Server = { fetch: FetchLike; urls: string[]; missing: Set<number>; status: () => number };

// Máy chủ giả: nến lưới theo interval từ `listed` tới NOW (nến đang chạy có closeTime >= NOW), tôn trọng startTime/endTime/limit.
function server(opts: { listed?: number; missing?: number[]; funding?: number[]; oi?: number[]; failWith?: number } = {}): Server {
  const urls: string[] = [];
  const missing = new Set(opts.missing ?? []);
  const listed = opts.listed ?? END - 400 * DAY;
  const f: FetchLike = async (url) => {
    urls.push(url);
    const u = new URL(url);
    const q = u.searchParams;
    const headers = { get: (n: string) => (n.toLowerCase() === 'x-mbx-used-weight-1m' ? '1' : null) };
    const ok = (body: unknown) => ({ status: 200, headers, json: async () => body });
    if (opts.failWith) return { status: opts.failWith, headers: { get: () => null }, json: async () => ({}) };
    if (u.pathname === '/fapi/v1/klines') {
      const iv = INTERVAL_MS[q.get('interval') as Interval];
      const start = Number(q.get('startTime'));
      const end = Number(q.get('endTime'));
      const limit = Number(q.get('limit'));
      const first = Math.max(Math.ceil(start / iv) * iv, Math.ceil(listed / iv) * iv);
      const rows: unknown[] = [];
      for (let t = first; t <= end && t < NOW && rows.length < limit; t += iv) {
        if (missing.has(t)) continue;
        rows.push([t, '1', '2', '0.5', '1.5', '10', t + iv - 1, '15', 3, '0', '7', '0']);
      }
      return ok(rows);
    }
    if (u.pathname === '/fapi/v1/fundingRate') {
      const start = Number(q.get('startTime'));
      const limit = Number(q.get('limit'));
      const all = opts.funding ?? [];
      return ok(all.filter((t) => t >= start && t <= Number(q.get('endTime'))).slice(0, limit)
        .map((t) => ({ symbol: q.get('symbol'), fundingTime: t, fundingRate: '0.0001', markPrice: '100' })));
    }
    if (u.pathname === '/futures/data/openInterestHist') {
      const start = Number(q.get('startTime'));
      const limit = Number(q.get('limit'));
      // Giống Binance thật: khi vượt limit, trả `limit` hàng CUỐI của khoảng [startTime, endTime] (neo theo endTime)
      return ok((opts.oi ?? []).filter((t) => t >= start && t <= Number(q.get('endTime'))).slice(-limit)
        .map((t) => ({ symbol: q.get('symbol'), sumOpenInterest: '5', sumOpenInterestValue: '500', timestamp: t })));
    }
    throw new Error('url lạ ' + url);
  };
  return { fetch: f, urls, missing, status: () => 200 };
}

function setup(s: Server, pageLimit = 1500) {
  const dir = mkdtempSync(join(tmpdir(), 'cr-cache-'));
  const logs: string[] = [];
  const client = createClient({ fetch: s.fetch, base: 'https://x.test', sleep: async () => {}, now: () => NOW });
  const fetcher = createFetcher({ client, dir, now: () => NOW, sleep: async () => {}, log: (m) => logs.push(m), pageLimit });
  return { dir, logs, client, fetcher, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test('klineWeight theo tài liệu Binance: 1/2/5/10', () => {
  assert.equal(klineWeight(99), 1);
  assert.equal(klineWeight(100), 2);
  assert.equal(klineWeight(499), 2);
  assert.equal(klineWeight(500), 5);
  assert.equal(klineWeight(1000), 5);
  assert.equal(klineWeight(1001), 10);
  assert.equal(klineWeight(1500), 10);
});

test('planRange: 30 ngày cuối, 3 tháng ngoài mẫu, khởi động 300×1d / 500 nến', () => {
  const p = planRange(END);
  assert.equal(p.evalStart, END - 30 * DAY);
  assert.equal(p.oosStart, Date.UTC(2026, 5, 19)); // lùi 3 tháng lịch từ 2026-09-19
  assert.equal(needFrom('1d', p.oosStart), p.oosStart - 300 * DAY);
  assert.equal(needFrom('4h', p.oosStart), p.oosStart - 500 * 4 * HOUR);
  assert.equal(needFrom('15m', p.oosStart), p.oosStart - 500 * 15 * 60_000);
});

test('phân trang: không trùng, không thiếu nến ở biên trang; kiểm tra qua nhiều trang nhỏ', async () => {
  const s = server();
  const t = setup(s, 100);
  const from = END - 20 * DAY;
  await t.fetcher.fetchCandles('AAAUSDT', '1h', from, END);
  const { candles, gaps } = loadCandles(t.dir, 'AAAUSDT', '1h', from, END);
  assert.equal(candles.length, 20 * 24);
  assert.equal(candles[0]!.openTime, from);
  assert.equal(candles.at(-1)!.openTime, END - HOUR);
  assert.equal(gaps.length, 0);
  for (let i = 1; i < candles.length; i++) assert.equal(candles[i]!.openTime - candles[i - 1]!.openTime, HOUR);
  assert.ok(t.fetcher.stats.requests >= 5, 'phải qua nhiều trang');
  t.done();
});

test('không bao giờ lưu nến đang chạy; to bị cắt tại thời điểm hiện tại', async () => {
  const s = server();
  const t = setup(s);
  await t.fetcher.fetchCandles('AAAUSDT', '1h', END - 2 * DAY, END + DAY); // đòi cả tương lai
  const { candles } = loadCandles(t.dir, 'AAAUSDT', '1h', END - 2 * DAY, NOW);
  assert.equal(candles.at(-1)!.openTime, END + 8 * HOUR); // nến 08:00-09:00 đóng 08:59:59.999 < NOW=09:00
  assert.ok(candles.every((c) => c.closeTime < NOW));
  t.done();
});

test('chạy lại: 0 lệnh gọi; xóa một tệp → chỉ tải lại tệp đó (tải lại được giữa chừng)', async () => {
  const s = server();
  const t = setup(s);
  const from = Date.UTC(2026, 7, 10);
  await t.fetcher.fetchCandles('AAAUSDT', '4h', from, END);
  const before = t.fetcher.stats.requests;
  assert.ok(before >= 3); // ba tháng 8, 9, 10 → ba tệp
  await t.fetcher.fetchCandles('AAAUSDT', '4h', from, END);
  assert.equal(t.fetcher.stats.requests, before);
  const dir = join(t.dir, 'klines', 'AAAUSDT', '4h');
  const files = readdirSync(dir).sort();
  assert.deepEqual(files, ['2026-08.json', '2026-09.json', '2026-10.json']);
  rmSync(join(dir, '2026-09.json'));
  await t.fetcher.fetchCandles('AAAUSDT', '4h', from, END);
  assert.equal(t.fetcher.stats.requests, before + 1);
  const { candles, gaps } = loadCandles(t.dir, 'AAAUSDT', '4h', from, END);
  assert.equal(gaps.length, 0);
  assert.equal(candles.length, Math.round((END - from) / (4 * HOUR)));
  t.done();
});

test('tệp hỏng (JSON cụt) bị tải lại, có log; không nuốt lỗi', async () => {
  const s = server();
  const t = setup(s);
  const from = END - 3 * DAY;
  await t.fetcher.fetchCandles('AAAUSDT', '1h', from, END);
  const file = join(t.dir, 'klines', 'AAAUSDT', '1h', '2026-10.json'); // END-3d = 16/10 → tháng 10
  const good = readFileSync(file, 'utf8');
  writeFileSync(file, good.slice(0, 40));
  const r = t.fetcher.stats.requests;
  await t.fetcher.fetchCandles('AAAUSDT', '1h', from, END);
  assert.ok(t.fetcher.stats.requests > r);
  assert.ok(t.logs.some((l) => /hỏng|không đọc được/i.test(l)));
  assert.equal(readFileSync(file, 'utf8'), good);
  t.done();
});

test('phát hiện khoảng trống thật của sàn: ghi vào gaps và log', async () => {
  const hole = END - 5 * DAY + 3 * HOUR;
  const s = server({ missing: [hole, hole + HOUR] });
  const t = setup(s);
  const from = END - 10 * DAY;
  await t.fetcher.fetchCandles('AAAUSDT', '1h', from, END);
  assert.equal(t.fetcher.stats.gaps.length, 1);
  assert.deepEqual(t.fetcher.stats.gaps[0], { symbol: 'AAAUSDT', interval: '1h', afterOpenTime: hole - HOUR, missingBars: 2 });
  assert.ok(t.logs.some((l) => l.includes('khoảng trống') && l.includes('AAAUSDT')));
  const { candles, gaps } = loadCandles(t.dir, 'AAAUSDT', '1h', from, END);
  assert.equal(gaps.length, 1);
  assert.equal(candles.length, 10 * 24 - 2);
  t.done();
});

test('hợp đồng niêm yết muộn: không tính phần trước niêm yết là khoảng trống', async () => {
  const s = server({ listed: END - 3 * DAY });
  const t = setup(s);
  await t.fetcher.fetchCandles('NEWUSDT', '1d', END - 60 * DAY, END);
  const { candles, gaps } = loadCandles(t.dir, 'NEWUSDT', '1d', END - 60 * DAY, END);
  assert.equal(candles.length, 3);
  assert.equal(gaps.length, 0);
  t.done();
});

test('loadCandles: tệp sai thứ tự → ném lỗi', async () => {
  const s = server();
  const t = setup(s);
  const from = END - 3 * DAY;
  await t.fetcher.fetchCandles('AAAUSDT', '1d', from, END);
  const file = join(t.dir, 'klines', 'AAAUSDT', '1d', '2026-10.json');
  const j = JSON.parse(readFileSync(file, 'utf8'));
  j.candles.reverse();
  writeFileSync(file, JSON.stringify(j));
  assert.throws(() => loadCandles(t.dir, 'AAAUSDT', '1d', from, END), /thứ tự|trùng/);
  t.done();
});

test('funding: phân trang theo startTime, không trùng, chạy lại không gọi', async () => {
  const times = Array.from({ length: 250 }, (_, i) => END - 100 * DAY + i * 8 * HOUR);
  const s = server({ funding: times });
  const t = setup(s);
  const f2 = createFetcher({ client: t.client, dir: t.dir, now: () => NOW, sleep: async () => {}, log: () => {}, fundingLimit: 100 });
  await f2.fetchFunding('AAAUSDT', END - 100 * DAY, END);
  const j = JSON.parse(readFileSync(join(t.dir, 'funding', 'AAAUSDT.json'), 'utf8'));
  assert.deepEqual(j.rows.map((r: { fundingTime: number }) => r.fundingTime), times);
  assert.equal(f2.stats.requests, 3);
  await f2.fetchFunding('AAAUSDT', END - 100 * DAY, END);
  assert.equal(f2.stats.requests, 3);
  t.done();
});

test('OI: chỉ 30 ngày, ghi rõ availableDays', async () => {
  const times = Array.from({ length: 720 }, (_, i) => END - 30 * DAY + i * HOUR);
  const s = server({ oi: times });
  const t = setup(s);
  await t.fetcher.fetchOpenInterest('AAAUSDT', END - 30 * DAY, END);
  const j = JSON.parse(readFileSync(join(t.dir, 'oi', 'AAAUSDT.json'), 'utf8'));
  assert.equal(j.availableDays, 30);
  assert.equal(j.period, '1h');
  assert.equal(j.rows.length, 720);
  assert.equal(t.fetcher.stats.requests, 2); // 500 + 220
  t.done();
});

test('pacer: vượt hạn mức trong 5 phút thì ngủ tới khi cửa sổ trượt', async () => {
  let now = 0;
  const waits: number[] = [];
  const p = createPacer(3, 300_000, () => now, async (ms) => { waits.push(ms); now += ms; });
  for (let i = 0; i < 4; i++) { await p(); now += 1000; }
  assert.equal(waits.length, 1);
  assert.ok(waits[0]! > 290_000 && waits[0]! <= 300_000);
});

test('HTTP 418/429 → dừng ngay toàn bộ, không gọi tiếp', async () => {
  const s = server({ failWith: 429 });
  const t = setup(s);
  await assert.rejects(
    fetchAll({ fetcher: t.fetcher, plan: planRange(END), symbols: ['A', 'B', 'C'].map((x) => x + 'USDT'), fastSymbols: [], intervals: ['1d'], withFunding: false, withOi: false }),
    /429/,
  );
  assert.equal(s.urls.length, 1);
  t.done();
});

test('fetchAll: 15m/5m chỉ cho fastSymbols; lỗi khác 418/429 được gom lại, không nuốt', async () => {
  const s = server();
  const t = setup(s);
  const r = await fetchAll({
    fetcher: t.fetcher, plan: planRange(END), symbols: ['BTCUSDT', 'AAAUSDT'], fastSymbols: ['BTCUSDT'],
    intervals: ['1d', '15m'], withFunding: false, withOi: false,
  });
  assert.deepEqual(r.failures, []);
  const d = (sym: string, iv: string) => { try { return readdirSync(join(t.dir, 'klines', sym, iv)).length; } catch { return 0; } };
  assert.ok(d('BTCUSDT', '15m') > 0);
  assert.equal(d('AAAUSDT', '15m'), 0);
  assert.ok(d('AAAUSDT', '1d') > 0);
  t.done();
});

test('OI: startTime không cũ hơn 30 ngày tính từ bây giờ (Binance trả 400 nếu cũ hơn)', async () => {
  const s = server({ oi: [] });
  const t = setup(s);
  await fetchAll({ fetcher: t.fetcher, plan: planRange(END), symbols: ['AAAUSDT'], fastSymbols: [], intervals: [], withFunding: false, withOi: true });
  const u = new URL(s.urls[0]!);
  assert.equal(Number(u.searchParams.get('startTime')), NOW - 30 * DAY);
  t.done();
});

test('OI: mốc startTime tính lại theo giờ hiện tại ở từng mã (lần tải dài > 1 giờ không bị 400)', async () => {
  const s = server({ oi: [] });
  let clock = NOW;
  const dir = mkdtempSync(join(tmpdir(), 'cr-cache-'));
  const orig = s.fetch;
  // sau mã đầu tiên, đồng hồ nhảy thêm 2 giờ
  const wrapped = createClient({ fetch: async (u) => { const r = await orig(u); clock += 2 * HOUR; return r; }, base: 'https://x.test', sleep: async () => {}, now: () => clock });
  const f2 = createFetcher({ client: wrapped, dir, now: () => clock, sleep: async () => {}, log: () => {} });
  await fetchAll({ fetcher: f2, plan: planRange(END), symbols: ['AAAUSDT', 'BBBUSDT'], fastSymbols: [], intervals: [], withFunding: false, withOi: true });
  const starts = s.urls.map((u) => Number(new URL(u).searchParams.get('startTime')));
  assert.equal(starts[0], NOW - 30 * DAY);
  assert.equal(starts[1], NOW + 2 * HOUR - 30 * DAY);
  rmSync(dir, { recursive: true, force: true });
});

test('OI: 720 giờ > limit 500 → vẫn đủ từ đầu tới cuối (phân trang lùi), không trùng', async () => {
  const times = Array.from({ length: 720 }, (_, i) => END - 30 * DAY + i * HOUR);
  const s = server({ oi: times });
  const t = setup(s);
  await t.fetcher.fetchOpenInterest('AAAUSDT', END - 30 * DAY, END);
  const j = JSON.parse(readFileSync(join(t.dir, 'oi', 'AAAUSDT.json'), 'utf8'));
  const ts = j.rows.map((r: { timestamp: number }) => r.timestamp);
  assert.equal(ts[0], END - 30 * DAY);
  assert.equal(ts.at(-1), END - HOUR);
  assert.equal(new Set(ts).size, ts.length);
  assert.deepEqual(ts, times);
  t.done();
});

test('loadCandles: cửa sổ vượt phần đã tải (cuối hoặc đầu) → ném lỗi nêu rõ, không cắt cụt âm thầm', async () => {
  const s = server();
  const t = setup(s);
  await t.fetcher.fetchCandles('AAAUSDT', '1h', END - 5 * DAY, END);
  assert.throws(() => loadCandles(t.dir, 'AAAUSDT', '1h', END - 5 * DAY, END + 2 * HOUR), /chưa được tải|không phủ/);
  assert.throws(() => loadCandles(t.dir, 'AAAUSDT', '1h', END - 6 * DAY, END), /chưa được tải|không phủ/);
  t.done();
});

test('loadCandles: `to` lệch lưới → lọc theo isClosed(candle, to), nến chưa đóng không lọt', async () => {
  const s = server();
  const t = setup(s);
  await t.fetcher.fetchCandles('AAAUSDT', '1h', END - 5 * DAY, END);
  const { candles } = loadCandles(t.dir, 'AAAUSDT', '1h', END - 5 * DAY, END - 30 * MINUTE);
  assert.equal(candles.at(-1)!.openTime, END - 2 * HOUR); // nến END-1h đóng 23:59:59.999 > to=23:30 → loại
  assert.ok(candles.every((c) => c.closeTime < END - 30 * MINUTE));
  t.done();
});
