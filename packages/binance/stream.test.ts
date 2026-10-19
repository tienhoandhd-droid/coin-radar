import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMarketStream, createUserStream, createListenKeyApi, marketStreamNames,
  type Clock, type MarketEvent, type UserEvent, type WsLike, type ListenKeyApi,
} from './stream.ts';

// ---- Đồ giả: đồng hồ + WebSocket (không mạng) -----------------------------------------------------
const flush = () => new Promise<void>((r) => setImmediate(r));

function fakeClock(start = 1_000_000) {
  let t = start;
  let seq = 0;
  const timers: Array<{ id: number; at: number; fn: () => void }> = [];
  const clock: Clock & { advance(ms: number): Promise<void>; pending(): number } = {
    now: () => t,
    setTimeout(fn, ms) { const id = ++seq; timers.push({ id, at: t + Math.max(0, ms), fn }); return id; },
    clearTimeout(h) { const i = timers.findIndex((x) => x.id === h); if (i >= 0) timers.splice(i, 1); },
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        await flush();
        let best = -1;
        for (let i = 0; i < timers.length; i++) {
          if (timers[i]!.at <= end && (best < 0 || timers[i]!.at < timers[best]!.at)) best = i;
        }
        if (best < 0) break;
        const tm = timers.splice(best, 1)[0]!;
        t = tm.at;
        tm.fn();
      }
      t = end;
      await flush();
    },
    pending: () => timers.length,
  };
  return clock;
}

type Sent = { at: number; data: string };

function fakeWsFactory(clock: Clock) {
  const all: FakeWs[] = [];
  class FakeWs implements WsLike {
    url: string;
    sent: Sent[] = [];
    closed = false;
    onopen: ((ev: unknown) => void) | null = null;
    onmessage: ((ev: { data: unknown }) => void) | null = null;
    onclose: ((ev: unknown) => void) | null = null;
    onerror: ((ev: unknown) => void) | null = null;
    constructor(url: string) { this.url = url; all.push(this); }
    send(data: string) { if (this.closed) throw new Error('gửi trên kết nối đã đóng'); this.sent.push({ at: clock.now(), data }); }
    close() { if (this.closed) return; this.closed = true; queueMicrotask(() => this.onclose?.({ code: 1000 })); }
    // phía "server"
    open() { this.onopen?.({}); }
    push(obj: unknown) { if (!this.closed) this.onmessage?.({ data: JSON.stringify(obj) }); }
    drop() { if (this.closed) return; this.closed = true; this.onerror?.({}); this.onclose?.({ code: 1006 }); }
    subs(): Array<{ method: string; params: string[]; id: number }> { return this.sent.map((s) => JSON.parse(s.data)); }
    ackAll() { for (const m of this.subs()) this.push({ result: null, id: m.id }); }
  }
  return { Ctor: FakeWs as unknown as new (url: string) => WsLike, all, last: () => all[all.length - 1]! };
}

const kline = (sym: string, interval: string, t: number, closed: boolean, intervalMs = 60_000) => ({
  stream: `${sym.toLowerCase()}@kline_${interval}`,
  data: { e: 'kline', E: t + 1, s: sym, k: { t, T: t + intervalMs - 1, s: sym, i: interval, f: 1, L: 2, o: '1', c: '2', h: '3', l: '0.5', v: '10', n: 5, x: closed, q: '20', V: '4', Q: '8', B: '0' } },
});
const mark = (sym: string, E: number, p: string) => ({ stream: `${sym.toLowerCase()}@markPrice@1s`, data: { e: 'markPriceUpdate', E, s: sym, p, i: p, P: p, r: '0.0001', ap: p, T: E + 1000, st: 1 } });

function marketSetup(over: Partial<Parameters<typeof createMarketStream>[0]> = {}) {
  const clock = fakeClock();
  const ws = fakeWsFactory(clock);
  const events: MarketEvent[] = [];
  const logs: string[] = [];
  const m = createMarketStream({
    WebSocket: ws.Ctor, clock, random: () => 0.5, base: 'wss://fstream.binance.com',
    symbols: ['BTCUSDT'], intervals: ['1m'], onEvent: (e) => events.push(e), log: (s) => logs.push(s), ...over,
  });
  return { clock, ws, events, logs, m };
}

// ---- Market stream -------------------------------------------------------------------------------
test('URL /market/stream (không dùng /ws, /stream cũ) và tên stream viết thường', () => {
  assert.deepEqual(marketStreamNames(['BTCUSDT'], ['1m', '1h']), ['btcusdt@kline_1m', 'btcusdt@kline_1h', 'btcusdt@markPrice@1s']);
  const { ws, m } = marketSetup();
  m.start();
  assert.equal(ws.last().url, 'wss://fstream.binance.com/market/stream');
});

test('SUBSCRIBE: id là số nguyên không âm, gửi dàn đều ≤ 10 tin/giây (cửa sổ trượt 1 s)', async () => {
  const symbols = Array.from({ length: 300 }, (_, i) => `S${i}USDT`); // 300 × (1 kline + mark) = 600 stream
  const { ws, m, clock } = marketSetup({ symbols, paramsPerMessage: 10, msgsPerSec: 10 });
  m.start();
  ws.last().open();
  await clock.advance(20_000);
  const sent = ws.last().sent;
  assert.equal(sent.length, 60);
  for (const s of sent) {
    const msg = JSON.parse(s.data);
    assert.equal(msg.method, 'SUBSCRIBE');
    assert.ok(Number.isInteger(msg.id) && msg.id >= 0);
    assert.ok(msg.params.length <= 10);
  }
  for (const s of sent) {
    const inWindow = sent.filter((x) => x.at >= s.at && x.at < s.at + 1000).length;
    assert.ok(inWindow <= 10, `cửa sổ từ ${s.at} có ${inWindow} tin`);
  }
  assert.ok(sent[sent.length - 1]!.at - sent[0]!.at >= 5000, 'phải trải ra ít nhất 5 giây');
  const params = ws.last().subs().flatMap((x) => x.params);
  assert.equal(new Set(params).size, 600);
});

test('mặc định gửi ≤ 5 tin/giây (chừa chỗ cho pong tự động)', async () => {
  const symbols = Array.from({ length: 100 }, (_, i) => `S${i}USDT`);
  const { ws, m, clock } = marketSetup({ symbols, paramsPerMessage: 5 });
  m.start();
  ws.last().open();
  await clock.advance(60_000);
  const sent = ws.last().sent;
  for (const s of sent) assert.ok(sent.filter((x) => x.at >= s.at && x.at < s.at + 1000).length <= 5);
});

test('chia nhiều kết nối khi > 1024 stream; mỗi kết nối ≤ 1024', async () => {
  const symbols = Array.from({ length: 700 }, (_, i) => `S${i}USDT`); // 700 × 2 = 1400 stream
  const { ws, m, clock } = marketSetup({ symbols });
  m.start();
  assert.equal(ws.all.length, 2);
  for (const c of ws.all) c.open();
  await clock.advance(120_000);
  const counts = ws.all.map((c) => c.subs().flatMap((x) => x.params).length);
  assert.ok(counts.every((n) => n <= 1024));
  assert.equal(counts[0]! + counts[1]!, 1400);
  assert.equal(new Set(ws.all.flatMap((c) => c.subs().flatMap((x) => x.params))).size, 1400);
});

test('chỉ phát nến ĐÃ ĐÓNG (x=true), đúng kiểu Candle', async () => {
  const { ws, m, events, clock } = marketSetup();
  m.start();
  ws.last().open();
  await clock.advance(1000);
  ws.last().push(kline('BTCUSDT', '1m', 60_000, false));
  ws.last().push(kline('BTCUSDT', '1m', 60_000, false));
  assert.equal(events.filter((e) => e.type === 'kline').length, 0);
  ws.last().push(kline('BTCUSDT', '1m', 60_000, true));
  const k = events.filter((e) => e.type === 'kline');
  assert.equal(k.length, 1);
  assert.deepEqual(k[0], {
    type: 'kline', symbol: 'BTCUSDT', interval: '1m',
    candle: { openTime: 60_000, closeTime: 119_999, open: 1, high: 3, low: 0.5, close: 2, volume: 10, quoteVolume: 20, takerBuyQuote: 8 },
  });
});

test('mark price: giữ giá mới nhất theo E, bỏ sự kiện cũ hơn', async () => {
  const { ws, m, clock } = marketSetup();
  m.start();
  ws.last().open();
  ws.last().push(mark('BTCUSDT', 5000, '100.5'));
  ws.last().push(mark('BTCUSDT', 4000, '99'));
  assert.deepEqual(m.latestMark('BTCUSDT'), { price: 100.5, eventTime: 5000, receivedAt: clock.now() });
  assert.equal(m.latestMark('ETHUSDT'), null);
});

test('nến không liền mạch → backfill_required(symbol, interval, fromOpenTime) trước nến mới', async () => {
  const { ws, m, events } = marketSetup();
  m.start();
  ws.last().open();
  ws.last().push(kline('BTCUSDT', '1m', 60_000, true));
  ws.last().push(kline('BTCUSDT', '1m', 120_000, true)); // liền mạch
  ws.last().push(kline('BTCUSDT', '1m', 300_000, true)); // thiếu 180_000, 240_000
  const types = events.map((e) => e.type);
  assert.deepEqual(types, ['kline', 'kline', 'backfill_required', 'kline']);
  assert.deepEqual(events[2], { type: 'backfill_required', symbol: 'BTCUSDT', interval: '1m', fromOpenTime: 180_000 });
});

test('mốc đã nạp từ REST (seedLastClosed) cũng được dùng để phát hiện lỗ', async () => {
  const { ws, m, events } = marketSetup();
  m.seedLastClosed('BTCUSDT', '1m', 119_999);
  m.start();
  ws.last().open();
  ws.last().push(kline('BTCUSDT', '1m', 240_000, true));
  assert.deepEqual(events[0], { type: 'backfill_required', symbol: 'BTCUSDT', interval: '1m', fromOpenTime: 120_000 });
});

test('mất kết nối → nối lại có lùi dần + jitter, đăng ký lại, lỗ nến sau khi nối lại → backfill', async () => {
  const { ws, m, events, clock, logs } = marketSetup({ backoffBaseMs: 1000, backoffCapMs: 8000 });
  m.start();
  ws.last().open();
  ws.last().ackAll();
  ws.last().push(kline('BTCUSDT', '1m', 60_000, true));
  ws.last().drop();
  await clock.advance(10);
  assert.equal(ws.all.length, 1, 'chưa nối lại ngay (đang lùi)');
  await clock.advance(1000); // random 0.5 → 1000 * (0.5 + 0.5*0.5) = 750 ms
  assert.equal(ws.all.length, 2);
  // lần 2 hỏng tiếp: chờ dài hơn
  ws.last().drop();
  await clock.advance(1000);
  assert.equal(ws.all.length, 2);
  await clock.advance(1000);
  assert.equal(ws.all.length, 3);
  ws.last().open();
  await clock.advance(2000);
  assert.ok(ws.last().subs().length > 0, 'đăng ký lại sau khi nối lại');
  ws.last().push(kline('BTCUSDT', '1m', 240_000, true));
  assert.ok(events.some((e) => e.type === 'backfill_required' && e.fromOpenTime === 120_000));
  assert.ok(logs.some((l) => /nối lại/i.test(l)));
});

test('độ trễ lùi bị chặn trần', async () => {
  const { ws, m, clock } = marketSetup({ backoffBaseMs: 1000, backoffCapMs: 4000, random: () => 0.999 });
  m.start();
  for (let i = 0; i < 10; i++) { ws.last().drop(); await clock.advance(4000); }
  assert.equal(ws.all.length, 11, 'mỗi lần ≤ trần 4 s nên luôn nối lại được trong 4 s');
});

test('xoay vòng trước 24h: mở kết nối mới, đăng ký xong mới đóng cũ — không hụt dữ liệu', async () => {
  const H = 3_600_000;
  const { ws, m, events, clock } = marketSetup({ rotateAfterMs: 23 * H });
  m.start();
  const old = ws.last();
  old.open();
  old.ackAll();
  for (let i = 0; i < 23 * 60; i++) { await clock.advance(60_000); old.push(mark('BTCUSDT', clock.now(), '1')); }
  assert.equal(ws.all.length, 2, 'đã mở kết nối thay thế');
  const fresh = ws.last();
  assert.equal(old.closed, false, 'kết nối cũ vẫn mở trong lúc chồng lấn');
  fresh.open();
  await clock.advance(1000);
  // trong lúc chồng lấn: nến đóng tới trên cả hai, chỉ phát 1 lần
  const t = 30 * 60_000;
  old.push(kline('BTCUSDT', '1m', t, true));
  fresh.push(kline('BTCUSDT', '1m', t, true));
  assert.equal(events.filter((e) => e.type === 'kline').length, 1);
  fresh.ackAll();
  await clock.advance(10);
  assert.equal(old.closed, true, 'đóng cũ sau khi mới đăng ký xong');
  fresh.push(kline('BTCUSDT', '1m', t + 60_000, true));
  assert.equal(events.filter((e) => e.type === 'backfill_required').length, 0);
  assert.equal(events.filter((e) => e.type === 'kline').length, 2);
  for (let i = 0; i < 5; i++) { await clock.advance(30_000); fresh.push(mark('BTCUSDT', clock.now(), '1')); }
  assert.equal(ws.all.length, 2, 'đóng chủ động không kích hoạt nối lại');
});

test('dữ liệu cũ: không cập nhật quá N giây → isStale; có cập nhật → hết stale', async () => {
  const { ws, m, clock } = marketSetup({ staleAfterMs: 10_000 });
  m.start();
  assert.equal(m.isStale('BTCUSDT'), true, 'chưa có dữ liệu = stale');
  ws.last().open();
  ws.last().push(mark('BTCUSDT', clock.now(), '1'));
  assert.equal(m.isStale('BTCUSDT'), false);
  await clock.advance(10_001);
  assert.equal(m.isStale('BTCUSDT'), true);
  ws.last().push(kline('BTCUSDT', '1m', 60_000, false)); // nến chưa đóng vẫn là dữ liệu sống
  assert.equal(m.isStale('BTCUSDT'), false);
});

test('kết nối im lặng quá lâu → tự đóng và nối lại', async () => {
  const { ws, m, clock } = marketSetup({ idleTimeoutMs: 60_000 });
  m.start();
  ws.last().open();
  await clock.advance(61_000 + 60_000);
  assert.equal(ws.all[0]!.closed, true);
  assert.ok(ws.all.length >= 2);
});

test('tin hỏng/không rõ không làm sập, có ghi log', async () => {
  const { ws, m, logs } = marketSetup();
  m.start();
  ws.last().open();
  ws.last().onmessage?.({ data: 'không phải json' });
  ws.last().push({ stream: 'btcusdt@kline_1m', data: { e: 'kline', s: 'BTCUSDT', k: { t: 'x', x: true } } });
  ws.last().push({ code: 2, msg: 'Invalid request' });
  assert.ok(logs.filter((l) => /lỗi|hỏng|không đọc/i.test(l)).length >= 3);
});

test('stop() đóng mọi kết nối, không nối lại', async () => {
  const { ws, m, clock } = marketSetup();
  m.start();
  ws.last().open();
  m.stop();
  await clock.advance(120_000);
  assert.equal(ws.all.length, 1);
  assert.equal(ws.all[0]!.closed, true);
});

// ---- listenKey REST ------------------------------------------------------------------------------
test('listenKey REST: POST/PUT/DELETE chỉ gửi X-MBX-APIKEY, không ký; -1125 → invalid', async () => {
  const calls: Array<{ path: string; method?: string; headers?: Record<string, string> }> = [];
  let putBody: unknown = { listenKey: 'K1' };
  let putStatus = 200;
  const client = {
    async send(path: string, init?: { method?: string; headers?: Record<string, string> }) {
      calls.push({ path, method: init?.method, headers: init?.headers });
      const body = init?.method === 'POST' ? { listenKey: 'K1abcdef' } : init?.method === 'PUT' ? putBody : {};
      const status = init?.method === 'PUT' ? putStatus : 200;
      return { status, headers: { get: () => null }, json: async () => body };
    },
  };
  const api = createListenKeyApi({ client, apiKey: 'APIKEY123' });
  assert.equal(await api.create(), 'K1abcdef');
  assert.deepEqual(await api.keepalive(), { status: 'ok' });
  putBody = { code: -1125, msg: 'This listenKey does not exist.' };
  putStatus = 400;
  assert.deepEqual(await api.keepalive(), { status: 'invalid' });
  putBody = { code: -1001, msg: 'x' };
  assert.equal((await api.keepalive()).status, 'error');
  await api.close();
  assert.deepEqual(calls.map((c) => c.method), ['POST', 'PUT', 'PUT', 'PUT', 'DELETE']);
  for (const c of calls) {
    assert.equal(c.path, '/fapi/v1/listenKey');
    assert.deepEqual(c.headers, { 'X-MBX-APIKEY': 'APIKEY123' });
  }
});

// ---- User data stream ----------------------------------------------------------------------------
function userSetup(over: Partial<Parameters<typeof createUserStream>[0]> = {}) {
  const clock = fakeClock();
  const ws = fakeWsFactory(clock);
  const events: UserEvent[] = [];
  const logs: string[] = [];
  let n = 0;
  const keepaliveResults: Array<'ok' | 'invalid' | 'error'> = [];
  const lk = { creates: 0, keepalives: 0 };
  const listenKeys: ListenKeyApi = {
    async create() { lk.creates++; n++; return `LISTENKEY-SECRET-${n}-xyzxyzxyz`; },
    async keepalive() {
      lk.keepalives++;
      const s = keepaliveResults.shift() ?? 'ok';
      return s === 'error' ? { status: 'error', msg: 'HTTP 500' } : { status: s };
    },
    async close() {},
  };
  const u = createUserStream({
    WebSocket: ws.Ctor, clock, random: () => 0.5, base: 'wss://fstream.binance.com', listenKeys,
    onEvent: (e) => events.push(e), log: (s) => logs.push(s), secrets: ['APIKEY-SECRET-VALUE'], ...over,
  });
  return { clock, ws, events, logs, u, lk, keepaliveResults };
}

test('user stream: tạo listenKey, nối /private/ws/<listenKey>, mở xong phát resync_required', async () => {
  const { ws, u, events, clock } = userSetup();
  await u.start();
  assert.equal(ws.last().url, 'wss://fstream.binance.com/private/ws/LISTENKEY-SECRET-1-xyzxyzxyz');
  ws.last().open();
  await clock.advance(1);
  assert.deepEqual(events, [{ type: 'resync_required', reason: 'start' }]);
});

test('ORDER_TRADE_UPDATE / ACCOUNT_UPDATE / ALGO_UPDATE (có rm) được đọc đúng trường', async () => {
  const { ws, u, events, clock } = userSetup();
  await u.start();
  ws.last().open();
  await clock.advance(1);
  ws.last().push({ e: 'ORDER_TRADE_UPDATE', E: 10, T: 9, o: {
    s: 'BTCUSDT', c: 'cr-abc', S: 'BUY', o: 'MARKET', f: 'GTC', q: '0.010', p: '0', ap: '100.5', sp: '0', x: 'TRADE', X: 'FILLED',
    i: 123, l: '0.010', z: '0.010', L: '100.5', N: 'USDT', n: '0.02', T: 9, t: 77, m: false, R: false, wt: 'CONTRACT_PRICE',
    ot: 'MARKET', ps: 'BOTH', cp: false, rp: '0', V: 'NONE', pm: 'NONE', gtd: 0, er: '0',
  } });
  ws.last().push({ e: 'ACCOUNT_UPDATE', E: 11, T: 10, a: { m: 'ORDER',
    B: [{ a: 'USDT', wb: '1000', cw: '990', bc: '0' }],
    P: [{ s: 'BTCUSDT', pa: '0.010', ep: '100.5', bep: '100.6', cr: '0', up: '0.1', mt: 'isolated', iw: '10', ps: 'BOTH' }] } });
  ws.last().push({ e: 'ALGO_UPDATE', T: 12, E: 13, o: {
    caid: 'sl-1', aid: 555, at: 'CONDITIONAL', o: 'STOP_MARKET', s: 'BTCUSDT', S: 'SELL', ps: 'BOTH', f: 'GTC', q: '0.010', X: 'REJECTED',
    ai: '', ap: '0', aq: '0', act: '0', tp: '95', p: '0', V: 'NONE', wt: 'MARK_PRICE', pm: 'NONE', cp: false, pP: false, R: true,
    tt: 0, gtd: 0, rm: 'Reduce Only reject' } });
  const [o, a, g] = events.slice(1);
  assert.deepEqual(o, { type: 'order_update', eventTime: 10, transactionTime: 9, order: {
    symbol: 'BTCUSDT', clientOrderId: 'cr-abc', side: 'BUY', orderType: 'MARKET', origType: 'MARKET', executionType: 'TRADE', status: 'FILLED',
    orderId: 123, origQty: 0.01, price: 0, avgPrice: 100.5, stopPrice: 0, lastFilledQty: 0.01, cumFilledQty: 0.01, lastFilledPrice: 100.5,
    commissionAsset: 'USDT', commission: 0.02, tradeId: 77, realizedProfit: 0, reduceOnly: false, closePosition: false,
    positionSide: 'BOTH', workingType: 'CONTRACT_PRICE', tradeTime: 9 } });
  assert.deepEqual(a, { type: 'account_update', eventTime: 11, transactionTime: 10, reason: 'ORDER',
    balances: [{ asset: 'USDT', walletBalance: 1000, crossWalletBalance: 990, balanceChange: 0 }],
    positions: [{ symbol: 'BTCUSDT', positionAmt: 0.01, entryPrice: 100.5, breakevenPrice: 100.6, accumulatedRealized: 0, unrealizedPnl: 0.1, marginType: 'isolated', isolatedWallet: 10, positionSide: 'BOTH' }] });
  assert.deepEqual(g, { type: 'algo_update', eventTime: 13, transactionTime: 12, algo: {
    clientAlgoId: 'sl-1', algoId: 555, algoType: 'CONDITIONAL', orderType: 'STOP_MARKET', symbol: 'BTCUSDT', side: 'SELL', positionSide: 'BOTH',
    qty: 0.01, status: 'REJECTED', actualOrderId: null, avgPrice: 0, filledQty: 0, triggerPrice: 95, price: 0, workingType: 'MARK_PRICE',
    closePosition: false, reduceOnly: true, triggerTime: 0, rejectReason: 'Reduce Only reject', activated: null } });
});

test('listenKeyExpired → tạo key mới, nối lại, phát resync_required; không lộ listenKey trong log', async () => {
  const { ws, u, events, clock, logs, lk } = userSetup();
  await u.start();
  const first = ws.last();
  first.open();
  await clock.advance(1);
  first.push({ e: 'listenKeyExpired', E: 1, listenKey: 'LISTENKEY-SECRET-1-xyzxyzxyz' });
  await clock.advance(1);
  assert.equal(lk.creates, 2);
  assert.equal(ws.all.length, 2);
  assert.equal(ws.last().url, 'wss://fstream.binance.com/private/ws/LISTENKEY-SECRET-2-xyzxyzxyz');
  ws.last().open();
  await clock.advance(1);
  assert.equal(first.closed, true);
  assert.deepEqual(events.map((e) => e.type === 'resync_required' ? e.reason : e.type), ['start', 'listenkey_expired']);
  const joined = logs.join('\n');
  assert.ok(logs.length > 0);
  assert.ok(!joined.includes('LISTENKEY-SECRET'), joined);
  assert.ok(joined.includes('[ĐÃ ẨN]') || !/listenKey=/.test(joined));
});

test('gia hạn mỗi 30 phút (PUT); -1125 → tạo key mới + nối lại + resync', async () => {
  const { ws, u, events, clock, lk, keepaliveResults } = userSetup();
  await u.start();
  ws.last().open();
  await clock.advance(30 * 60_000);
  assert.equal(lk.keepalives, 1);
  assert.equal(lk.creates, 1);
  keepaliveResults.push('invalid');
  await clock.advance(30 * 60_000);
  assert.equal(lk.keepalives, 2);
  assert.equal(lk.creates, 2);
  assert.equal(ws.all.length, 2);
  ws.last().open();
  await clock.advance(1);
  assert.equal(ws.all[0]!.closed, true);
  assert.equal(events[events.length - 1]!.type, 'resync_required');
  assert.deepEqual(events[events.length - 1], { type: 'resync_required', reason: 'listenkey_invalid' });
  // chu kỳ gia hạn chạy tiếp với key mới
  await clock.advance(30 * 60_000);
  assert.equal(lk.keepalives, 3);
});

test('gia hạn lỗi tạm → thử lại sớm (1 phút), không tạo key mới', async () => {
  const { ws, u, clock, lk, keepaliveResults, logs } = userSetup();
  await u.start();
  ws.last().open();
  keepaliveResults.push('error');
  await clock.advance(30 * 60_000);
  assert.equal(lk.keepalives, 1);
  await clock.advance(60_000);
  assert.equal(lk.keepalives, 2);
  assert.equal(lk.creates, 1);
  assert.ok(logs.some((l) => /gia hạn/i.test(l)));
});

test('user stream rớt → nối lại (lùi dần) + resync_required', async () => {
  const { ws, u, events, clock } = userSetup();
  await u.start();
  ws.last().open();
  await clock.advance(1);
  ws.last().drop();
  await clock.advance(5000);
  assert.equal(ws.all.length, 2);
  ws.last().open();
  await clock.advance(1);
  assert.deepEqual(events.map((e) => (e as { reason?: string }).reason), ['start', 'reconnect']);
});

test('user stream xoay vòng trước 24h: mở mới rồi mới đóng cũ, phát resync_required', async () => {
  const H = 3_600_000;
  const { ws, u, events, clock } = userSetup({ rotateAfterMs: 23 * H });
  await u.start();
  const old = ws.last();
  old.open();
  await clock.advance(23 * H);
  assert.equal(ws.all.length, 2);
  assert.equal(old.closed, false);
  ws.last().open();
  await clock.advance(1);
  assert.equal(old.closed, true);
  assert.deepEqual(events[events.length - 1], { type: 'resync_required', reason: 'rotate' });
});

test('sự kiện user hỏng → log + resync_required (không bỏ qua im lặng)', async () => {
  const { ws, u, events, clock, logs } = userSetup();
  await u.start();
  ws.last().open();
  await clock.advance(1);
  ws.last().push({ e: 'ORDER_TRADE_UPDATE', E: 1, T: 1, o: { s: 'BTCUSDT' } });
  assert.deepEqual(events[events.length - 1], { type: 'resync_required', reason: 'parse_error' });
  assert.ok(logs.some((l) => /không đọc/i.test(l)));
});

test('lỗi WebSocket có chứa URL vẫn được che listenKey', async () => {
  const clock = fakeClock();
  const logs: string[] = [];
  class Boom { constructor(url: string) { throw new Error(`không mở được ${url}`); } }
  const u = createUserStream({
    WebSocket: Boom as unknown as new (url: string) => WsLike, clock, random: () => 0.5, base: 'wss://x',
    listenKeys: { async create() { return 'LKSECRET-0001'; }, async keepalive() { return { status: 'ok' }; }, async close() {} },
    onEvent: () => {}, log: (s) => logs.push(s),
  });
  await u.start();
  assert.ok(logs.length > 0);
  assert.ok(!logs.join('\n').includes('LKSECRET-0001'));
  u.stop();
});
