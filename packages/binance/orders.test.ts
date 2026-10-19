import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, type FetchLike } from './client.ts';
import { createSigned, hmacSigner, markForwardsInit } from './signed.ts';
import {
  ALGO_PATH, CLIENT_ID_RE, ORDER_PATH, assertR1, bracketSlots, builders, createOrders, makeClientId, type ClientIdParts,
} from './orders.ts';
import type { Contract } from '../core/types.ts';
import { snapToTick } from '../core/price.ts';

// ---- Hợp đồng mẫu (giá trị giống exchangeInfo thật: tick 0,1; step 0,001; MIN_NOTIONAL 50) ----
const C: Contract = {
  symbol: 'BTCUSDT', baseAsset: 'BTC', onboardDate: 0, tickSize: 0.1, stepSize: 0.001,
  minQty: 0.001, maxQty: 1000, marketMinQty: 0.001, marketMaxQty: 120, marketStepSize: 0.001,
  minNotional: 50, maxNumOrders: 200, deliveryDate: 4133404800000,
};
const NOW = 1_800_000_000_000;
const id = (leg: string, attempt = 0): ClientIdParts => ({ runId: 'r1a', signalId: 'BTCUSDT|long|2026-10-19T08:00', leg, attempt });

// ---- Fetch ký giả: ghi method/path/params; /fapi/v1/time trả đúng giờ máy ----
type Reply = { status?: number; body?: unknown; throws?: boolean };
type Captured = { method: string; path: string; params: Record<string, string> };

function harness(replies: Reply[] = []) {
  const calls: Captured[] = [];
  const q = [...replies];
  const fetch: FetchLike = markForwardsInit(async (url, init) => {
    if (url.includes('/fapi/v1/time')) return { status: 200, headers: { get: () => null }, json: async () => ({ serverTime: NOW }) };
    const u = new URL(url);
    const params: Record<string, string> = {};
    for (const [k, v] of u.searchParams) if (k !== 'timestamp' && k !== 'recvWindow' && k !== 'signature') params[k] = v;
    calls.push({ method: init.method, path: u.pathname, params });
    const r = q.shift() ?? { status: 200, body: {} };
    if (r.throws) throw new Error('ECONNRESET');
    return { status: r.status ?? 200, headers: { get: () => null }, json: async () => r.body ?? {} };
  });
  const now = () => NOW;
  const client = createClient({ fetch, now, sleep: async () => {} });
  const api = createSigned({ client, apiKey: 'k-AAAAAAAA', signer: hmacSigner('s-BBBBBBBB'), now, sleep: async () => {} });
  return { calls, orders: createOrders({ api, now }) };
}

// ================= Mã client tất định =================
test('makeClientId: tất định, ≤ 36 ký tự, đúng regex tài liệu', () => {
  const a = makeClientId(id('E1'));
  assert.equal(a, makeClientId(id('E1')));
  assert.ok(a.length <= 36, a);
  assert.match(a, CLIENT_ID_RE);
  // Trường hợp dài nhất cho phép
  const longest = makeClientId({ runId: 'ABCDEFGH', signalId: 'x'.repeat(500), leg: 'TP1X', attempt: 999 });
  assert.ok(longest.length <= 36, `${longest} dài ${longest.length}`);
  assert.match(longest, CLIENT_ID_RE);
});

test('makeClientId: khác nhau giữa chân lệnh, lần thử, mã chạy và tín hiệu', () => {
  const legs = ['E1', 'E2', 'E3', 'SL', 'BE', 'TP1', 'TR'];
  const all = new Set<string>();
  for (const leg of legs) for (const attempt of [0, 1, 2]) all.add(makeClientId(id(leg, attempt)));
  assert.equal(all.size, legs.length * 3);
  assert.notEqual(makeClientId(id('SL')), makeClientId({ ...id('SL'), runId: 'r1b' }));
  assert.notEqual(makeClientId(id('SL')), makeClientId({ ...id('SL'), signalId: 'ETHUSDT|long|2026-10-19T08:00' }));
});

test('makeClientId: tham số sai bị từ chối', () => {
  assert.throws(() => makeClientId({ ...id('E1'), runId: '' }), /runId/);
  assert.throws(() => makeClientId({ ...id('E1'), runId: 'ABCDEFGHI' }), /runId/);
  assert.throws(() => makeClientId({ ...id('E1'), runId: 'a b' }), /runId/);
  assert.throws(() => makeClientId({ ...id('E1'), signalId: '' }), /signalId/);
  assert.throws(() => makeClientId(id('tp1')), /leg/);
  assert.throws(() => makeClientId(id('ABCDE')), /leg/);
  assert.throws(() => makeClientId(id('E1', -1)), /attempt/);
  assert.throws(() => makeClientId(id('E1', 1000)), /attempt/);
  assert.throws(() => makeClientId(id('E1', 1.5)), /attempt/);
});

// ================= Lệnh vào =================
test('MARKET Long: đúng tham số, khối lượng làm tròn XUỐNG theo MARKET_LOT_SIZE', async () => {
  const h = harness([{ body: { orderId: 1, status: 'FILLED' } }]);
  const r = await h.orders.placeEntry({ contract: C, side: 'long', kind: 'market', qty: 0.0129, refPrice: 60000, id: id('E1'), openCount: 0, reserveSlots: 4 });
  assert.equal(r.kind, 'ok');
  assert.equal(r.sent, true);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0], {
    method: 'POST', path: ORDER_PATH,
    params: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.012', newClientOrderId: makeClientId(id('E1')), newOrderRespType: 'RESULT' },
  });
  assert.equal(r.clientId, makeClientId(id('E1')));
});

test('MARKET Short: side SELL, không có positionSide/reduceOnly', async () => {
  const h = harness();
  await h.orders.placeEntry({ contract: C, side: 'short', kind: 'market', qty: 0.002, refPrice: 60000, id: id('E1'), openCount: 0, reserveSlots: 4 });
  const p = h.calls[0]!.params;
  assert.equal(p.side, 'SELL');
  assert.equal(p.quantity, '0.002');
  assert.equal('positionSide' in p, false);
  assert.equal('reduceOnly' in p, false);
});

test('LIMIT Long: giá làm tròn XUỐNG (không mua đắt hơn), GTC mặc định', async () => {
  const h = harness();
  await h.orders.placeEntry({ contract: C, side: 'long', kind: 'limit', qty: 0.0015, limitPrice: 60000.09, id: id('E2'), openCount: 3, reserveSlots: 4 });
  assert.deepEqual(h.calls[0], {
    method: 'POST', path: ORDER_PATH,
    params: { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.001', price: '60000.0', timeInForce: 'GTC', newClientOrderId: makeClientId(id('E2')), newOrderRespType: 'RESULT' },
  });
});

test('LIMIT Short: giá làm tròn LÊN (không bán rẻ hơn)', async () => {
  const h = harness();
  await h.orders.placeEntry({ contract: C, side: 'short', kind: 'limit', qty: 0.002, limitPrice: 60000.01, id: id('E2'), openCount: 0, reserveSlots: 4 });
  assert.equal(h.calls[0]!.params.price, '60000.1');
  assert.equal(h.calls[0]!.params.side, 'SELL');
});

test('LIMIT có hạn tự hủy: GTD + goodTillDate (giây tròn); hạn < 600 s bị từ chối tại chỗ', async () => {
  const h = harness();
  const expireAt = NOW + 3_600_000 + 123; // phần ms bị sàn bỏ qua → gửi giây tròn
  await h.orders.placeEntry({ contract: C, side: 'long', kind: 'limit', qty: 0.002, limitPrice: 60000, id: id('E2'), openCount: 0, reserveSlots: 4, expireAt });
  assert.equal(h.calls[0]!.params.timeInForce, 'GTD');
  assert.equal(h.calls[0]!.params.goodTillDate, String(NOW + 3_600_000));

  const tooSoon = await h.orders.placeEntry({ contract: C, side: 'long', kind: 'limit', qty: 0.002, limitPrice: 60000, id: id('E3'), openCount: 0, reserveSlots: 4, expireAt: NOW + 600_000 });
  assert.equal(tooSoon.kind, 'rejected');
  assert.equal(tooSoon.sent, false);
  assert.match(tooSoon.msg, /600/);
  // Đệm 10 s cho lệch giờ/độ trễ mạng: 605 s vẫn bị từ chối, 611 s được gửi
  const edge = await h.orders.placeEntry({ contract: C, side: 'long', kind: 'limit', qty: 0.002, limitPrice: 60000, id: id('E3'), openCount: 0, reserveSlots: 4, expireAt: NOW + 605_000 });
  assert.equal(edge.kind, 'rejected');
  await h.orders.placeEntry({ contract: C, side: 'long', kind: 'limit', qty: 0.002, limitPrice: 60000, id: id('E3'), openCount: 0, reserveSlots: 4, expireAt: NOW + 611_000 });
  assert.equal(h.calls.length, 2);
});

test('LIMIT IOC (chân "market" có giá trần, B3 rà soát): timeInForce=IOC, không goodTillDate; IOC kèm expireAt → từ chối', async () => {
  const h = harness();
  await h.orders.placeEntry({ contract: C, side: 'long', kind: 'limit', qty: 0.002, limitPrice: 60000.09, ioc: true, id: id('E1'), openCount: 0, reserveSlots: 4 });
  assert.deepEqual(h.calls[0], {
    method: 'POST', path: ORDER_PATH,
    params: { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.002', price: '60000.0', timeInForce: 'IOC', newClientOrderId: makeClientId(id('E1')), newOrderRespType: 'RESULT' },
  });
  const both = await h.orders.placeEntry({ contract: C, side: 'short', kind: 'limit', qty: 0.002, limitPrice: 60000, ioc: true, expireAt: NOW + 3_600_000, id: id('E1'), openCount: 0, reserveSlots: 4 });
  assert.equal(both.kind, 'rejected');
  assert.equal(both.sent, false);
  assert.match(both.msg, /IOC/);
  assert.equal(h.calls.length, 1);
});

test('Lệnh vào vi phạm bộ lọc → từ chối tại chỗ, KHÔNG gửi', async () => {
  const h = harness();
  const small = await h.orders.placeEntry({ contract: C, side: 'long', kind: 'market', qty: 0.0005, refPrice: 60000, id: id('E1'), openCount: 0, reserveSlots: 4 });
  assert.equal(small.kind, 'rejected');
  assert.equal(small.sent, false);
  assert.match(small.msg, /minQty/);
  const notional = await h.orders.placeEntry({ contract: C, side: 'long', kind: 'limit', qty: 0.0008 + 0.0002, limitPrice: 40000, id: id('E1'), openCount: 0, reserveSlots: 4 });
  assert.match(notional.msg, /MIN_NOTIONAL/);
  const big = await h.orders.placeEntry({ contract: C, side: 'long', kind: 'market', qty: 121, refPrice: 60000, id: id('E1'), openCount: 0, reserveSlots: 4 });
  assert.match(big.msg, /maxQty/);
  const full = await h.orders.placeEntry({ contract: C, side: 'long', kind: 'market', qty: 0.002, refPrice: 60000, id: id('E1'), openCount: 200, reserveSlots: 4 });
  assert.match(full.msg, /MAX_NUM_ORDERS/);
  const nan = await h.orders.placeEntry({ contract: C, side: 'long', kind: 'limit', qty: 0.002, limitPrice: Number.NaN, id: id('E1'), openCount: 0, reserveSlots: 4 });
  assert.equal(nan.kind, 'rejected');
  assert.equal(h.calls.length, 0);
});

test('unknown_status trả về kèm clientId, KHÔNG tự gửi lại', async () => {
  const h = harness([{ status: 503, body: { code: -1007, msg: 'Timeout waiting for response from backend server.' } }]);
  const r = await h.orders.placeEntry({ contract: C, side: 'long', kind: 'market', qty: 0.002, refPrice: 60000, id: id('E1'), openCount: 0, reserveSlots: 4 });
  assert.equal(r.kind, 'unknown_status');
  assert.equal(r.clientId, makeClientId(id('E1')));
  assert.equal(h.calls.length, 1);
  const r2 = await harness([{ throws: true }]).orders.placeStopLoss({ contract: C, side: 'long', markPrice: 60000, triggerPrice: 59000, purpose: 'initial', id: id('SL') });
  assert.equal(r2.kind, 'unknown_status');
  assert.equal(r2.clientId, makeClientId(id('SL')));
});

// ================= Algo: SL / TP / trailing =================
test('SL ban đầu Long: STOP_MARKET SELL qua algoOrder, closePosition, MARK_PRICE, KHÔNG có quantity/reduceOnly; trigger làm tròn XUỐNG (xa giá vào, như core)', async () => {
  const h = harness([{ body: { algoId: 7, algoStatus: 'NEW' } }]);
  const r = await h.orders.placeStopLoss({ contract: C, side: 'long', markPrice: 60000, triggerPrice: 58999.91, purpose: 'initial', id: id('SL') });
  assert.equal(r.kind, 'ok');
  assert.deepEqual(h.calls[0], {
    method: 'POST', path: ALGO_PATH,
    params: {
      algoType: 'CONDITIONAL', symbol: 'BTCUSDT', side: 'SELL', type: 'STOP_MARKET', triggerPrice: '58999.9',
      closePosition: 'true', workingType: 'MARK_PRICE', priceProtect: 'false', clientAlgoId: makeClientId(id('SL')),
    },
  });
});

test('SL ban đầu Short: BUY, trigger làm tròn LÊN (xa giá vào, như core); priceProtect luôn false', async () => {
  const h = harness();
  await h.orders.placeStopLoss({ contract: C, side: 'short', markPrice: 60000, triggerPrice: 61000.09, purpose: 'initial', id: id('SL') });
  const p = h.calls[0]!.params;
  assert.equal(p.side, 'BUY');
  assert.equal(p.triggerPrice, '61000.1');
  assert.equal(p.priceProtect, 'false');
  assert.equal(p.workingType, 'MARK_PRICE');
  assert.equal('quantity' in p, false);
  assert.equal('reduceOnly' in p, false);
});

test('SL sai phía giá MARK hiện tại → stop_rejected tại chỗ (vùng -2021/-4142)', async () => {
  const h = harness();
  const r = await h.orders.placeStopLoss({ contract: C, side: 'long', markPrice: 60000, triggerPrice: 60000.05, purpose: 'initial', id: id('SL') });
  assert.equal(r.kind, 'stop_rejected');
  assert.equal(r.sent, false);
  assert.equal(r.clientId, makeClientId(id('SL'))); // vẫn có id để log/Telegram truy được chân lệnh
  const s = await h.orders.placeStopLoss({ contract: C, side: 'short', markPrice: 60000, triggerPrice: 59000, purpose: 'initial', id: id('SL') });
  assert.equal(s.kind, 'stop_rejected');
  const bad = await h.orders.placeStopLoss({ contract: C, side: 'short', markPrice: Number.NaN, triggerPrice: 61000, purpose: 'initial', id: id('SL') });
  assert.equal(bad.kind, 'stop_rejected');
  assert.equal(h.calls.length, 0);
});

test('SL ban đầu do core làm tròn (price.ts, hướng xa giá vào) đi qua NGUYÊN VẸN — Long và Short', async () => {
  const h = harness();
  const longStop = snapToTick(58999.97, C.tickSize, 'down');
  const shortStop = snapToTick(61000.03, C.tickSize, 'up');
  await h.orders.placeStopLoss({ contract: C, side: 'long', markPrice: 60000, triggerPrice: longStop, purpose: 'initial', id: id('SL') });
  await h.orders.placeStopLoss({ contract: C, side: 'short', markPrice: 60000, triggerPrice: shortStop, purpose: 'initial', id: id('SL') });
  assert.equal(h.calls[0]!.params.triggerPrice, '58999.9');
  assert.equal(Number(h.calls[0]!.params.triggerPrice), longStop);
  assert.equal(h.calls[1]!.params.triggerPrice, '61000.1');
  assert.equal(Number(h.calls[1]!.params.triggerPrice), shortStop);
});

test('purpose sai → stop_rejected tại chỗ', async () => {
  const h = harness();
  const r = await h.orders.placeStopLoss({ contract: C, side: 'long', markPrice: 60000, triggerPrice: 59000, purpose: 'x' as 'initial', id: id('SL') });
  assert.equal(r.kind, 'stop_rejected');
  assert.match(r.msg, /purpose/);
  assert.equal(h.calls.length, 0);
});

test('Dừng hòa vốn (sàn BE, D10) phía LỜI của giá vào được đặt — Long và Short', async () => {
  const h = harness();
  // Long vào 60000, giá hòa vốn sau phí 60060.04, mark đang 61500 → dừng ở 60060.1 (làm tròn LÊN: không thấp hơn hòa vốn)
  const l = await h.orders.placeStopLoss({ contract: C, side: 'long', markPrice: 61500, triggerPrice: 60060.04, purpose: 'breakeven', id: id('BE') });
  assert.equal(l.kind, 'ok');
  assert.deepEqual(h.calls[0], {
    method: 'POST', path: ALGO_PATH,
    params: {
      algoType: 'CONDITIONAL', symbol: 'BTCUSDT', side: 'SELL', type: 'STOP_MARKET', triggerPrice: '60060.1',
      closePosition: 'true', workingType: 'MARK_PRICE', priceProtect: 'false', clientAlgoId: makeClientId(id('BE')),
    },
  });
  // Short vào 60000, hòa vốn 59939.96, mark 58500 → dừng 59939.9 (làm tròn XUỐNG)
  const s = await h.orders.placeStopLoss({ contract: C, side: 'short', markPrice: 58500, triggerPrice: 59939.96, purpose: 'breakeven', id: id('BE') });
  assert.equal(s.kind, 'ok');
  assert.equal(h.calls[1]!.params.side, 'BUY');
  assert.equal(h.calls[1]!.params.triggerPrice, '59939.9');
  assert.equal(h.calls[1]!.params.priceProtect, 'false');
});

test('SL KHÔNG kiểm số lệnh tại chỗ; sàn từ chối SL (-2025/-4045/-4142) → stop_rejected để nơi gọi đóng market', async () => {
  const full: Contract = { ...C, maxNumOrders: 1 };
  for (const code of [-2025, -4045, -4142]) {
    const h = harness([{ status: 400, body: { code, msg: 'x' } }]);
    const r = await h.orders.placeStopLoss({ contract: full, side: 'long', markPrice: 60000, triggerPrice: 59000, purpose: 'initial', id: id('SL') });
    assert.equal(h.calls.length, 1, 'SL phải được gửi');
    assert.equal(r.kind, 'stop_rejected', String(code));
    assert.equal(r.code, code);
    assert.equal(r.sent, true);
  }
  // unknown_status giữ nguyên (phải tra lại, không phải bị từ chối)
  const u = harness([{ status: 503, body: { code: -1007, msg: 'Timeout' } }]);
  assert.equal((await u.orders.placeStopLoss({ contract: C, side: 'long', markPrice: 60000, triggerPrice: 59000, purpose: 'initial', id: id('SL') })).kind, 'unknown_status');
});

test('Lệnh vào giữ chỗ cho CẢ bộ lệnh (vào + SL + TP1 + trailing + BE) theo MAX_NUM_ORDERS', async () => {
  assert.equal(bracketSlots({ entryLegs: 1, tp1: true, trailing: true, breakevenFloor: false }), 4);
  assert.equal(bracketSlots({ entryLegs: 3, tp1: true, trailing: true, breakevenFloor: true }), 7);
  assert.equal(bracketSlots({ entryLegs: 1, tp1: false, trailing: true, breakevenFloor: false }), 3);
  assert.throws(() => bracketSlots({ entryLegs: 0, tp1: true, trailing: true, breakevenFloor: false }), /entryLegs/);
  const h = harness();
  const reserve = bracketSlots({ entryLegs: 1, tp1: true, trailing: true, breakevenFloor: false });
  const no = await h.orders.placeEntry({ contract: C, side: 'long', kind: 'market', qty: 0.002, refPrice: 60000, id: id('E1'), openCount: 197, reserveSlots: reserve });
  assert.equal(no.kind, 'rejected');
  assert.match(no.msg, /MAX_NUM_ORDERS/);
  assert.equal(no.clientId, makeClientId(id('E1')));
  const yes = await h.orders.placeEntry({ contract: C, side: 'long', kind: 'market', qty: 0.002, refPrice: 60000, id: id('E1'), openCount: 196, reserveSlots: reserve });
  assert.equal(yes.kind, 'ok');
  for (const bad of [0, 1.5, Number.NaN]) {
    const r = await h.orders.placeEntry({ contract: C, side: 'long', kind: 'market', qty: 0.002, refPrice: 60000, id: id('E1'), openCount: 0, reserveSlots: bad });
    assert.equal(r.kind, 'rejected', String(bad));
  }
  assert.equal(h.calls.length, 1);
});

test('TP Long: TAKE_PROFIT_MARKET SELL reduceOnly + quantity (làm tròn XUỐNG), MARK_PRICE, priceProtect=true cố định, trigger làm tròn XUỐNG (về phía giá vào, như core)', async () => {
  const h = harness();
  await h.orders.placeTakeProfit({ contract: C, side: 'long', entryPrice: 60000, triggerPrice: 62000.01, qty: 0.0019, id: id('TP1'), openCount: 1 });
  assert.deepEqual(h.calls[0], {
    method: 'POST', path: ALGO_PATH,
    params: {
      algoType: 'CONDITIONAL', symbol: 'BTCUSDT', side: 'SELL', type: 'TAKE_PROFIT_MARKET', triggerPrice: '62000.0',
      quantity: '0.001', reduceOnly: 'true', workingType: 'MARK_PRICE', priceProtect: 'true', clientAlgoId: makeClientId(id('TP1')),
    },
  });
});

test('TP Short: BUY, trigger làm tròn LÊN (về phía giá vào); reduce-only miễn MIN_NOTIONAL nhưng vẫn kiểm minQty', async () => {
  const h = harness();
  // 0,001 × 40000 = 40 USDT < MIN_NOTIONAL 50 nhưng vẫn gửi: reduce-only được miễn
  await h.orders.placeTakeProfit({ contract: C, side: 'short', entryPrice: 60000, triggerPrice: 40000.09, qty: 0.001, id: id('TP1'), openCount: 0 });
  assert.equal(h.calls[0]!.params.side, 'BUY');
  assert.equal(h.calls[0]!.params.triggerPrice, '40000.1');
  assert.equal(h.calls[0]!.params.quantity, '0.001');
  const tiny = await h.orders.placeTakeProfit({ contract: C, side: 'short', entryPrice: 60000, triggerPrice: 58000, qty: 0.0009, id: id('TP1'), openCount: 0 });
  assert.equal(tiny.kind, 'rejected');
  assert.match(tiny.msg, /minQty/);
  const wrong = await h.orders.placeTakeProfit({ contract: C, side: 'short', entryPrice: 60000, triggerPrice: 61000, qty: 0.001, id: id('TP1'), openCount: 0 });
  assert.equal(wrong.kind, 'rejected');
  assert.equal(h.calls.length, 1);
});

test('Trailing Long: TRAILING_STOP_MARKET SELL reduceOnly, activatePrice làm tròn XUỐNG (về phía giá vào), callbackRate làm tròn XUỐNG 0,01', async () => {
  const h = harness();
  await h.orders.placeTrailing({ contract: C, side: 'long', entryPrice: 60000, activatePrice: 62000.01, callbackPct: 1.239, qty: 0.0059, id: id('TR'), openCount: 2 });
  assert.deepEqual(h.calls[0], {
    method: 'POST', path: ALGO_PATH,
    params: {
      algoType: 'CONDITIONAL', symbol: 'BTCUSDT', side: 'SELL', type: 'TRAILING_STOP_MARKET', quantity: '0.005', reduceOnly: 'true',
      activatePrice: '62000.0', callbackRate: '1.23', workingType: 'MARK_PRICE', clientAlgoId: makeClientId(id('TR')),
    },
  });
});

test('Trailing Short: BUY, activatePrice làm tròn LÊN; callbackRate ngoài [0,1; 10] bị từ chối', async () => {
  const h = harness();
  await h.orders.placeTrailing({ contract: C, side: 'short', entryPrice: 60000, activatePrice: 58000.09, callbackPct: 0.1, qty: 0.002, id: id('TR'), openCount: 0 });
  assert.equal(h.calls[0]!.params.side, 'BUY');
  assert.equal(h.calls[0]!.params.activatePrice, '58000.1');
  assert.equal(h.calls[0]!.params.callbackRate, '0.1');
  for (const cb of [0.09, 10.01, Number.NaN]) {
    const r = await h.orders.placeTrailing({ contract: C, side: 'short', entryPrice: 60000, activatePrice: 58000, callbackPct: cb, qty: 0.002, id: id('TR'), openCount: 0 });
    assert.equal(r.kind, 'rejected', `callback ${cb}`);
    assert.match(r.msg, /callbackRate/);
  }
  const ten = await h.orders.placeTrailing({ contract: C, side: 'short', entryPrice: 60000, activatePrice: 58000, callbackPct: 10, qty: 0.002, id: id('TR'), openCount: 0 });
  assert.equal(ten.kind, 'ok');
  assert.equal(h.calls.length, 2);
});

test('Giá rất nhỏ không bị viết dạng số mũ (1e-7)', async () => {
  const tinyC: Contract = { ...C, symbol: 'PEPEUSDT', tickSize: 0.0000001, stepSize: 1, marketStepSize: 1, minQty: 1, marketMinQty: 1, maxQty: 1e9, marketMaxQty: 1e9, minNotional: 5 };
  const h = harness();
  await h.orders.placeStopLoss({ contract: tinyC, side: 'long', markPrice: 0.0000123, triggerPrice: 0.00000111, purpose: 'initial', id: id('SL') });
  assert.equal(h.calls[0]!.params.triggerPrice, '0.0000011');
});

// ================= Hủy / tra / liệt kê =================
test('Hủy / tra lệnh thường theo orderId hoặc origClientOrderId; liệt kê lệnh mở', async () => {
  const h = harness();
  await h.orders.cancelOrder('BTCUSDT', { orderId: 42 });
  await h.orders.queryOrder('BTCUSDT', { clientId: makeClientId(id('E1')) });
  await h.orders.openOrders('BTCUSDT');
  assert.deepEqual(h.calls, [
    { method: 'DELETE', path: ORDER_PATH, params: { symbol: 'BTCUSDT', orderId: '42' } },
    { method: 'GET', path: ORDER_PATH, params: { symbol: 'BTCUSDT', origClientOrderId: makeClientId(id('E1')) } },
    { method: 'GET', path: '/fapi/v1/openOrders', params: { symbol: 'BTCUSDT' } },
  ]);
});

test('Hủy / tra algo theo algoId hoặc clientAlgoId; liệt kê algo mở', async () => {
  const h = harness();
  await h.orders.cancelAlgo({ algoId: 9 });
  await h.orders.queryAlgo({ clientId: makeClientId(id('SL')) });
  await h.orders.openAlgoOrders('BTCUSDT');
  assert.deepEqual(h.calls, [
    { method: 'DELETE', path: ALGO_PATH, params: { algoId: '9' } },
    { method: 'GET', path: ALGO_PATH, params: { clientAlgoId: makeClientId(id('SL')) } },
    { method: 'GET', path: '/fapi/v1/openAlgoOrders', params: { symbol: 'BTCUSDT' } },
  ]);
});

test('Tham chiếu lệnh không hợp lệ → từ chối tại chỗ', async () => {
  const h = harness();
  const r = await h.orders.cancelOrder('BTCUSDT', { clientId: 'có dấu cách' });
  assert.equal(r.kind, 'rejected');
  const r2 = await h.orders.queryAlgo({ algoId: -1 });
  assert.equal(r2.kind, 'rejected');
  assert.equal(h.calls.length, 0);
});

test('countdownCancelAll: heartbeat theo symbol; 0 = tắt; số âm/lẻ bị từ chối', async () => {
  const h = harness([{ body: { symbol: 'BTCUSDT', countdownTime: '120000' } }]);
  const r = await h.orders.countdownCancelAll('BTCUSDT', 120_000);
  assert.equal(r.kind, 'ok');
  await h.orders.countdownCancelAll('BTCUSDT', 0);
  assert.deepEqual(h.calls, [
    { method: 'POST', path: '/fapi/v1/countdownCancelAll', params: { symbol: 'BTCUSDT', countdownTime: '120000' } },
    { method: 'POST', path: '/fapi/v1/countdownCancelAll', params: { symbol: 'BTCUSDT', countdownTime: '0' } },
  ]);
  assert.equal((await h.orders.countdownCancelAll('BTCUSDT', -1)).kind, 'rejected');
  assert.equal((await h.orders.countdownCancelAll('BTCUSDT', 1.5)).kind, 'rejected');
  assert.equal(h.calls.length, 2);
});

// ================= Thiết lập tài khoản =================
test('Position mode: One-way qua; Hedge → ném lỗi tiếng Việt, KHÔNG tự đổi', async () => {
  const ok = harness([{ body: { dualSidePosition: false } }]);
  await ok.orders.assertOneWay();
  assert.deepEqual(ok.calls, [{ method: 'GET', path: '/fapi/v1/positionSide/dual', params: {} }]);

  const hedge = harness([{ body: { dualSidePosition: true } }]);
  await assert.rejects(hedge.orders.assertOneWay(), /Hedge.*One-way/);
  assert.equal(hedge.calls.length, 1); // chỉ đọc, không POST đổi chế độ

  await assert.rejects(harness([{ body: {} }]).orders.assertOneWay(), /dualSidePosition/);
  await assert.rejects(harness([{ status: 400, body: { code: -2015, msg: 'Invalid API-key' } }]).orders.assertOneWay(), /-2015/);
});

test('Multi-Assets mode: tắt thì qua; bật → ném lỗi', async () => {
  const ok = harness([{ body: { multiAssetsMargin: false } }]);
  await ok.orders.assertSingleAssetMode();
  assert.deepEqual(ok.calls, [{ method: 'GET', path: '/fapi/v1/multiAssetsMargin', params: {} }]);
  await assert.rejects(harness([{ body: { multiAssetsMargin: true } }]).orders.assertSingleAssetMode(), /Multi-Assets/);
  await assert.rejects(harness([{ body: { multiAssetsMargin: 'false' } }]).orders.assertSingleAssetMode(), /multiAssetsMargin/);
});

test('setMarginType ISOLATED: thành công; -4046 (không cần đổi) coi là thành công; lỗi khác giữ nguyên', async () => {
  const h = harness([
    { body: { code: 200, msg: 'success' } },
    { status: 400, body: { code: -4046, msg: 'No need to change margin type.' } },
    { status: 400, body: { code: -4047, msg: 'Margin type cannot be changed if there exists open orders.' } },
  ]);
  assert.equal((await h.orders.setMarginTypeIsolated('BTCUSDT')).kind, 'ok');
  const same = await h.orders.setMarginTypeIsolated('BTCUSDT');
  assert.equal(same.kind, 'ok');
  assert.equal(same.code, -4046);
  const bad = await h.orders.setMarginTypeIsolated('BTCUSDT');
  assert.equal(bad.kind, 'rejected');
  assert.equal(bad.code, -4047);
  assert.deepEqual(h.calls[0], { method: 'POST', path: '/fapi/v1/marginType', params: { symbol: 'BTCUSDT', marginType: 'ISOLATED' } });
});

test('setLeverage: số nguyên ≥ 1; sai thì từ chối tại chỗ', async () => {
  const h = harness([{ body: { leverage: 5, maxNotionalValue: '1000000', symbol: 'BTCUSDT' } }]);
  assert.equal((await h.orders.setLeverage('BTCUSDT', 5)).kind, 'ok');
  assert.deepEqual(h.calls[0], { method: 'POST', path: '/fapi/v1/leverage', params: { symbol: 'BTCUSDT', leverage: '5' } });
  for (const bad of [0, 2.5, Number.NaN]) assert.equal((await h.orders.setLeverage('BTCUSDT', bad)).kind, 'rejected');
  assert.equal(h.calls.length, 1);
});

// ================= Bất biến R1 =================
// Mẫu đầu vào cho TỪNG bộ dựng request (cả Long và Short). Thêm bộ dựng mới mà quên mẫu → test đầu tiên dưới đây trượt.
const samples: Record<keyof typeof builders, unknown[][]> = {
  entry: (['long', 'short'] as const).flatMap((side) => [
    [{ contract: C, side, kind: 'market', qty: 0.002, refPrice: 60000, id: id('E1'), openCount: 0, reserveSlots: 4 }, NOW],
    [{ contract: C, side, kind: 'limit', qty: 0.002, limitPrice: 60000, id: id('E2'), openCount: 0, reserveSlots: 4 }, NOW],
    [{ contract: C, side, kind: 'limit', qty: 0.002, limitPrice: 60000, id: id('E3'), openCount: 0, reserveSlots: 4, expireAt: NOW + 3_600_000 }, NOW],
  ]),
  stopLoss: [
    [{ contract: C, side: 'long', markPrice: 60000, triggerPrice: 59000, purpose: 'initial', id: id('SL') }],
    [{ contract: C, side: 'short', markPrice: 60000, triggerPrice: 61000, purpose: 'initial', id: id('SL') }],
  ],
  reduceStop: [
    [{ contract: C, side: 'long', markPrice: 61000, triggerPrice: 60100, purpose: 'breakeven', qty: 0.001, id: id('BE') }],
    [{ contract: C, side: 'short', markPrice: 59000, triggerPrice: 59900, purpose: 'breakeven', qty: 0.001, id: id('BE') }],
  ],
  marketReduce: [
    [{ contract: C, side: 'long', qty: 0.002, id: id('MC') }],
    [{ contract: C, side: 'short', qty: 0.002, id: id('MC') }],
  ],
  takeProfit: [
    [{ contract: C, side: 'long', entryPrice: 60000, triggerPrice: 62000, qty: 0.001, id: id('TP1'), openCount: 0 }],
    [{ contract: C, side: 'short', entryPrice: 60000, triggerPrice: 58000, qty: 0.001, id: id('TP1'), openCount: 0 }],
  ],
  trailing: [
    [{ contract: C, side: 'long', entryPrice: 60000, activatePrice: 62000, callbackPct: 1, qty: 0.001, id: id('TR'), openCount: 0 }],
    [{ contract: C, side: 'short', entryPrice: 60000, activatePrice: 58000, callbackPct: 1, qty: 0.001, id: id('TR'), openCount: 0 }],
  ],
  cancelOrder: [['BTCUSDT', { orderId: 1 }], ['BTCUSDT', { clientId: 'abc' }]],
  queryOrder: [['BTCUSDT', { orderId: 1 }], ['BTCUSDT', { clientId: 'abc' }]],
  openOrders: [['BTCUSDT']],
  cancelAlgo: [[{ algoId: 1 }], [{ clientId: 'abc' }]],
  queryAlgo: [[{ algoId: 1 }], [{ clientId: 'abc' }]],
  openAlgoOrders: [['BTCUSDT']],
  countdownCancelAll: [['BTCUSDT', 120_000]],
  positionMode: [[]],
  multiAssetsMode: [[]],
  marginTypeIsolated: [['BTCUSDT']],
  leverage: [['BTCUSDT', 5]],
};

const CONDITIONAL = /^(STOP|TAKE_PROFIT|TRAILING)/;

test('R1: mọi bộ dựng request đều có mẫu', () => {
  assert.deepEqual(Object.keys(samples).sort(), Object.keys(builders).sort());
});

test('R1: KHÔNG bộ dựng nào gửi STOP*/TAKE_PROFIT*/TRAILING* tới /fapi/v1/order; lệnh điều kiện chỉ tới algoOrder', () => {
  let conditional = 0;
  for (const [name, fn] of Object.entries(builders)) {
    for (const args of samples[name as keyof typeof builders]) {
      const b = (fn as (...a: unknown[]) => ReturnType<typeof builders.entry>)(...args);
      assert.equal(b.ok, true, `${name} ${JSON.stringify(args).slice(0, 80)}: ${b.ok ? '' : b.problems.join('; ')}`);
      if (!b.ok) continue;
      const type = String(b.req.params?.type ?? '');
      if (b.req.path === ORDER_PATH) assert.doesNotMatch(type, CONDITIONAL, `${name} gửi ${type} tới ${ORDER_PATH}`);
      if (CONDITIONAL.test(type)) {
        conditional++;
        assert.equal(b.req.path, ALGO_PATH, name);
        assert.equal(b.req.params?.algoType, 'CONDITIONAL', name);
        assert.equal(b.req.params?.workingType, 'MARK_PRICE', name);
      }
      // Request tạo lệnh phải khai báo createsOrder=true (không bao giờ tự thử lại)
      const creates = b.req.method === 'POST' && (b.req.path === ORDER_PATH || b.req.path === ALGO_PATH);
      assert.equal(b.req.createsOrder, creates, name);
    }
  }
  assert.equal(conditional, 8); // SL, dừng theo khối lượng, TP, trailing × Long/Short
});

test('R1: chốt chặn trước khi gửi từ chối request điều kiện tới /fapi/v1/order dù có ai dựng tay', () => {
  for (const type of ['STOP', 'STOP_MARKET', 'TAKE_PROFIT', 'TAKE_PROFIT_MARKET', 'TRAILING_STOP_MARKET', 'trailing_stop_market']) {
    assert.throws(() => assertR1({ method: 'POST', path: ORDER_PATH, params: { symbol: 'BTCUSDT', type }, createsOrder: true }), /R1/, type);
  }
  assert.throws(() => assertR1({ method: 'POST', path: ALGO_PATH, params: { symbol: 'BTCUSDT', type: 'STOP_MARKET', algoType: 'CONDITIONAL' }, createsOrder: true }), /MARK_PRICE/);
  assert.throws(() => assertR1({ method: 'POST', path: ALGO_PATH, params: { symbol: 'BTCUSDT', type: 'MARKET', algoType: 'CONDITIONAL', workingType: 'MARK_PRICE' }, createsOrder: true }), /R1/);
  assertR1({ method: 'POST', path: ORDER_PATH, params: { symbol: 'BTCUSDT', type: 'MARKET' }, createsOrder: true });
});

test('TP/trailing: khối lượng phải khớp CẢ hai bước LOT_SIZE và MARKET_LOT_SIZE', async () => {
  const odd: Contract = { ...C, stepSize: 0.002, marketStepSize: 0.003, minQty: 0.002, marketMinQty: 0.003 };
  const h = harness();
  const bad = await h.orders.placeTakeProfit({ contract: odd, side: 'long', entryPrice: 60000, triggerPrice: 62000, qty: 0.004, id: id('TP1'), openCount: 0 });
  assert.equal(bad.kind, 'rejected');
  assert.match(bad.msg, /bước/);
  const ok = await h.orders.placeTrailing({ contract: odd, side: 'long', entryPrice: 60000, activatePrice: 62000, callbackPct: 1, qty: 0.0065, id: id('TR'), openCount: 0 });
  assert.equal(ok.kind, 'ok');
  assert.equal(h.calls[0]!.params.quantity, '0.006');
});

test('TP và activatePrice do core làm tròn (về phía giá vào) đi qua NGUYÊN VẸN; activatePrice === trigger TP1 — Long và Short', async () => {
  for (const [side, raw, dir, entry] of [['long', 62000.07, 'down', 60000], ['short', 58000.03, 'up', 60000]] as const) {
    const tp1 = snapToTick(raw, C.tickSize, dir); // như core (towardDir)
    const h = harness();
    await h.orders.placeTakeProfit({ contract: C, side, entryPrice: entry, triggerPrice: tp1, qty: 0.002, id: id('TP1'), openCount: 0 });
    await h.orders.placeTrailing({ contract: C, side, entryPrice: entry, activatePrice: tp1, callbackPct: 1, qty: 0.002, id: id('TR'), openCount: 1 });
    assert.equal(Number(h.calls[0]!.params.triggerPrice), tp1, side);
    assert.equal(Number(h.calls[1]!.params.activatePrice), tp1, side);
    // Giá CHƯA khớp tick: cả hai làm tròn cùng hướng → vẫn trùng nhau đúng từng ký tự
    const h2 = harness();
    await h2.orders.placeTakeProfit({ contract: C, side, entryPrice: entry, triggerPrice: raw, qty: 0.002, id: id('TP1'), openCount: 0 });
    await h2.orders.placeTrailing({ contract: C, side, entryPrice: entry, activatePrice: raw, callbackPct: 1, qty: 0.002, id: id('TR'), openCount: 1 });
    assert.equal(h2.calls[1]!.params.activatePrice, h2.calls[0]!.params.triggerPrice, side);
    assert.equal(h2.calls[0]!.params.triggerPrice, side === 'long' ? '62000.0' : '58000.1');
  }
});

// ================= B5: dừng reduce-only theo khối lượng + đóng market reduce-only =================
test('Dừng theo khối lượng (BE): STOP_MARKET reduceOnly + quantity, KHÔNG closePosition, MARK_PRICE, priceProtect=false — Long và Short', async () => {
  const h = harness();
  // Long hòa vốn 60060.05 → làm tròn LÊN (về phía được bảo vệ) 60060.1; khối lượng 0.0019 → XUỐNG 0.001
  const l = await h.orders.placeReduceStop({ contract: C, side: 'long', markPrice: 61000, triggerPrice: 60060.05, purpose: 'breakeven', qty: 0.0019, id: id('BE') });
  assert.equal(l.kind, 'ok');
  assert.deepEqual(h.calls[0], {
    method: 'POST', path: ALGO_PATH,
    params: {
      algoType: 'CONDITIONAL', symbol: 'BTCUSDT', side: 'SELL', type: 'STOP_MARKET', triggerPrice: '60060.1', quantity: '0.001',
      reduceOnly: 'true', workingType: 'MARK_PRICE', priceProtect: 'false', clientAlgoId: makeClientId(id('BE')),
    },
  });
  assert.equal('closePosition' in h.calls[0]!.params, false);
  const s = await h.orders.placeReduceStop({ contract: C, side: 'short', markPrice: 58500, triggerPrice: 59939.96, purpose: 'breakeven', qty: 0.003, id: id('BE', 1) });
  assert.equal(s.kind, 'ok');
  assert.equal(h.calls[1]!.params.side, 'BUY');
  assert.equal(h.calls[1]!.params.triggerPrice, '59939.9');
  assert.equal(h.calls[1]!.params.quantity, '0.003');
});

test('Dừng theo khối lượng: sai phía giá mark / khối lượng 0 → stop_rejected tại chỗ (chưa gửi); sàn từ chối → stop_rejected', async () => {
  const h = harness([{ status: 400, body: { code: -2022, msg: 'ReduceOnly Order is rejected.' } }]);
  const wrong = await h.orders.placeReduceStop({ contract: C, side: 'long', markPrice: 60000, triggerPrice: 60100, purpose: 'breakeven', qty: 0.002, id: id('BE') });
  assert.equal(wrong.kind, 'stop_rejected');
  assert.equal(wrong.sent, false);
  const wrongS = await h.orders.placeReduceStop({ contract: C, side: 'short', markPrice: 60000, triggerPrice: 59900, purpose: 'breakeven', qty: 0.002, id: id('BE') });
  assert.equal(wrongS.kind, 'stop_rejected');
  const zero = await h.orders.placeReduceStop({ contract: C, side: 'long', markPrice: 60000, triggerPrice: 59000, purpose: 'breakeven', qty: 0.0004, id: id('BE') });
  assert.equal(zero.kind, 'stop_rejected');
  assert.equal(h.calls.length, 0);
  const ex = await h.orders.placeReduceStop({ contract: C, side: 'long', markPrice: 60000, triggerPrice: 59000, purpose: 'breakeven', qty: 0.002, id: id('BE') });
  assert.equal(ex.kind, 'stop_rejected');
  assert.equal(ex.code, -2022);
  assert.equal(ex.sent, true);
});

test('Đóng market reduce-only: /fapi/v1/order MARKET reduceOnly=true, chiều ngược vị thế, không kiểm MIN_NOTIONAL — Long và Short', async () => {
  const h = harness();
  const l = await h.orders.closeMarket({ contract: C, side: 'long', qty: 0.0025, id: id('MC') });
  assert.equal(l.kind, 'ok');
  assert.equal(l.clientId, makeClientId(id('MC')));
  assert.deepEqual(h.calls[0], {
    method: 'POST', path: ORDER_PATH,
    params: { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.002', reduceOnly: 'true', newClientOrderId: makeClientId(id('MC')), newOrderRespType: 'RESULT' },
  });
  // 0.001 BTC ≈ 60 USDT, cả khi MIN_NOTIONAL rất lớn vẫn gửi (lệnh reduce-only được miễn)
  const s = await h.orders.closeMarket({ contract: { ...C, minNotional: 1e9 }, side: 'short', qty: 0.001, id: id('MC', 1) });
  assert.equal(s.kind, 'ok');
  assert.equal(h.calls[1]!.params.side, 'BUY');
  assert.equal(h.calls[1]!.params.reduceOnly, 'true');
});

test('Đóng market reduce-only: khối lượng 0 hoặc vượt MARKET_LOT_SIZE.maxQty → từ chối tại chỗ', async () => {
  const h = harness();
  for (const qty of [0, Number.NaN, 0.0004, 121]) {
    const r = await h.orders.closeMarket({ contract: C, side: 'long', qty, id: id('MC') });
    assert.equal(r.kind, 'rejected', String(qty));
    assert.equal(r.sent, false);
  }
  assert.equal(h.calls.length, 0);
});
