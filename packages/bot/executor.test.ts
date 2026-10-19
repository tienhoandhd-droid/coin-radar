import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeActions, type ExecutorCtx, type OrdersClient } from './executor.ts';
import { applyEvent, emptyState, type JournalEvent, type JournalEventBody, type JournalState } from './journal.ts';
import { legClientId, reconcile, type Action, type ExPosition, type LegRole, type LegStatus, type TradeState } from './reconcile.ts';
import { makeClientId, type OrderResult, type StopLossInput } from '../binance/orders.ts';
import type { Contract, Side } from '../core/types.ts';

// Executor (B5): thực hiện Action[] của reconcile THEO ĐÚNG THỨ TỰ qua client lệnh GIẢ (không có request ký nào rời máy).
const C: Contract = {
  symbol: 'AAAUSDT', baseAsset: 'AAA', onboardDate: 0, tickSize: 0.01, stepSize: 0.001, minQty: 0.001, maxQty: 100_000,
  marketMinQty: 0.001, marketMaxQty: 100_000, marketStepSize: 0.001, minNotional: 5, maxNumOrders: 200, deliveryDate: 4133894400000,
};
const NOW = 1_760_000_000_000;
const px = (side: Side, x: number) => Number((side === 'long' ? x : 200 - x).toFixed(2));

let seq = 1;
const C2: Contract = { ...C, symbol: 'BBBUSDT', baseAsset: 'BBB' };
function mkTrade(side: Side, symbol = C.symbol): TradeState {
  const t: TradeState = {
    signalId: `sig-${side}-${seq++}`, symbol, side, runId: 'r1', createdAt: NOW - 3_600_000, status: 'open', closedReason: null,
    plan: { stop: px(side, 97), tp1: px(side, 106), activatePrice: px(side, 106), callbackPct: 1, costPct: 0.1, needsBreakevenFloor: false, leverage: 3, qtyStep: 0.001, tp1Pct: 50, limitCancelAt: null },
    legs: {}, fills: [], tp1Filled: false, trailingActivated: false, stopReplaceFallback: false,
  };
  const mk = (role: LegRole, status: LegStatus, qty: number | null, trig: number | null) => ({ role, clientId: legClientId(t, role, 0), attempt: 0, status, qty, triggerPrice: trig, orderIds: [] as number[] });
  t.legs = { E1: mk('E1', 'filled', 60, null), SL: mk('SL', 'open', null, t.plan.stop), TP1: mk('TP1', 'open', 30, t.plan.tp1), TR: mk('TR', 'open', 30, null) };
  return t;
}

const res = (kind: OrderResult['kind'], over: Partial<OrderResult> = {}): OrderResult =>
  ({ kind, code: null, msg: '', status: kind === 'ok' ? 200 : 400, body: {}, orderCount: { tenSec: null, oneMin: null }, clientId: null, sent: true, ...over });
const OK = () => res('ok', { body: { algoId: 77 } });
const UNKNOWN = () => res('unknown_status', { status: 503, code: -1007, msg: 'Timeout waiting for response' });

type Method = keyof OrdersClient;
const METHODS: Method[] = ['placeStopLoss', 'placeReduceStop', 'placeTakeProfit', 'placeTrailing', 'cancelOrder', 'cancelAlgo', 'queryOrder', 'queryAlgo', 'openAlgoOrders', 'closeMarket'];

function harness(trades: TradeState[], script: Partial<Record<Method, OrderResult[]>> = {}, positions?: ExPosition[]) {
  const log: string[] = [];
  const calls: Array<{ m: Method; args: unknown[] }> = [];
  const events: JournalEvent[] = [];
  const state: JournalState = emptyState();
  for (const t of trades) state.trades[t.signalId] = structuredClone(t);
  const client = Object.fromEntries(METHODS.map((m) => [m, async (...args: unknown[]) => {
    calls.push({ m, args });
    log.push(`C:${m}`);
    return script[m]?.shift() ?? OK();
  }])) as unknown as OrdersClient;
  const alerts: Array<{ level: string; symbol: string | null; text: string }> = [];
  let resyncs = 0;
  const journal = {
    state: () => state,
    append(b: JournalEventBody): JournalEvent {
      const e = { seq: state.seq + 1, at: NOW, ...b } as JournalEvent;
      applyEvent(state, structuredClone(e), () => {});
      events.push(e);
      log.push(`J:${b.type}`);
      return e;
    },
  };
  const t0 = trades[0]!;
  const ctx: ExecutorCtx = {
    orders: client, journal, runId: 'r1', pass: 7, filters: { [C.symbol]: C, [C2.symbol]: C2 },
    positions: positions ?? trades.map((t) => ({ symbol: t.symbol, positionAmt: t.side === 'long' ? 60 : -60, entryPrice: 100, liquidationPrice: null })),
    notify: (a) => alerts.push(a),
    sleep: async (ms) => { log.push(`S:${ms}`); },
    confirmDelayMs: 1500,
    resyncClock: async () => { resyncs++; log.push('R'); },
  };
  return { ctx, log, calls, events, state, alerts, of: (m: Method) => calls.filter((c) => c.m === m), resyncs: () => resyncs };
}

function stopAction(t: TradeState, o: { attempt?: number; role?: 'SL' | 'BE'; qty?: number | null; onReject?: 'market_close' | 'stop_replace_rejected'; entries?: Array<{ clientId: string; orderId: number }>; replaces?: string | null } = {}): Extract<Action, { type: 'place_stop' }> {
  const role = o.role ?? 'SL';
  const attempt = o.attempt ?? 1;
  const purpose = role === 'SL' ? 'initial' : 'breakeven';
  const input: StopLossInput = { contract: C, side: t.side, markPrice: px(t.side, 102), triggerPrice: role === 'SL' ? t.plan.stop : px(t.side, 100.1), purpose, id: { runId: 'r1', signalId: t.signalId, leg: role, attempt } };
  return {
    type: 'place_stop', symbol: C.symbol, signalId: t.signalId, role, purpose, clientId: legClientId(t, role, attempt), input, qty: o.qty ?? null,
    replaces: o.replaces ?? null, onReject: o.onReject ?? 'market_close', onRejectCancelEntries: o.entries ?? [], reason: 'test',
  };
}
const cancelOld = (t: TradeState, after: string | null, replacedBy: string | null = null): Action =>
  ({ type: 'cancel_algo', symbol: C.symbol, signalId: t.signalId, clientId: legClientId(t, 'SL', 0), algoId: 900, onlyAfterPlaced: after, replacedBy, reason: 'thay dừng' });
const tp1Action = (t: TradeState): Action => ({
  type: 'place_tp1', symbol: C.symbol, signalId: t.signalId, clientId: legClientId(t, 'TP1', 1),
  input: { contract: C, side: t.side, entryPrice: 100, triggerPrice: t.plan.tp1, qty: 30, id: { runId: 'r1', signalId: t.signalId, leg: 'TP1', attempt: 1 }, openCount: 3 }, replaces: null, reason: 'test',
});
const trAction = (t: TradeState): Action => ({
  type: 'place_trailing', symbol: C.symbol, signalId: t.signalId, clientId: legClientId(t, 'TR', 1),
  input: { contract: C, side: t.side, entryPrice: 100, activatePrice: t.plan.activatePrice, callbackPct: 1, qty: 30, id: { runId: 'r1', signalId: t.signalId, leg: 'TR', attempt: 1 }, openCount: 3 }, replaces: null, reason: 'test',
});

// ================= Thứ tự + nhật ký =================
test('Thực hiện ĐÚNG thứ tự; mỗi lệnh gửi đi có order_intent TRƯỚC và order_result SAU (Long)', async () => {
  const t = mkTrade('long');
  const h = harness([t]);
  const sl = stopAction(t, { onReject: 'stop_replace_rejected' });
  const acts: Action[] = [sl, tp1Action(t), trAction(t), cancelOld(t, sl.clientId), { type: 'alert', level: 'info', symbol: C.symbol, signalId: t.signalId, text: 'xin chào' }];
  const r = await executeActions(acts, h.ctx);
  assert.equal(r.halted, null);
  assert.deepEqual(h.calls.map((c) => c.m), ['placeStopLoss', 'placeTakeProfit', 'placeTrailing', 'cancelAlgo']);
  assert.deepEqual(h.log, [
    'J:order_intent', 'C:placeStopLoss', 'J:order_result',
    'J:order_intent', 'C:placeTakeProfit', 'J:order_result',
    'J:order_intent', 'C:placeTrailing', 'J:order_result',
    'J:order_intent', 'C:cancelAlgo', 'J:order_result',
  ]);
  const sLeg = h.state.trades[t.signalId]!.legs.SL!;
  assert.equal(sLeg.clientId, sl.clientId);
  assert.equal(sLeg.status, 'open');
  const cancelIntent = h.events.find((e) => e.type === 'order_intent' && e.op === 'cancel');
  assert.ok(cancelIntent);
  assert.deepEqual(h.alerts.map((a) => a.text), ['xin chào']);
});

test('Lệnh dừng có khối lượng (BE) → placeReduceStop; closePosition (qty null) → placeStopLoss (Short)', async () => {
  const t = mkTrade('short');
  const h = harness([t]);
  await executeActions([stopAction(t, { role: 'BE', qty: 30, attempt: 0 }), stopAction(t)], h.ctx);
  assert.deepEqual(h.calls.map((c) => c.m), ['placeReduceStop', 'placeStopLoss']);
  assert.equal((h.calls[0]!.args[0] as { qty: number }).qty, 30);
});

// ================= Nghĩa vụ B4 #1: place_stop không rõ → tra NGAY trong cùng lượt =================
test('place_stop không rõ → queryAlgo NGAY; đã nằm trên sàn (NEW) → không đặt lại, hủy dừng cũ tiếp tục (Short)', async () => {
  const t = mkTrade('short');
  const h = harness([t], { placeStopLoss: [UNKNOWN()], queryAlgo: [res('ok', { body: { algoStatus: 'NEW', algoId: 5 } })] });
  const sl = stopAction(t, { onReject: 'stop_replace_rejected' });
  const r = await executeActions([sl, cancelOld(t, sl.clientId)], h.ctx);
  assert.deepEqual(h.calls.map((c) => c.m), ['placeStopLoss', 'queryAlgo', 'cancelAlgo']);
  assert.deepEqual(h.calls[1]!.args[0], { clientId: sl.clientId });
  assert.equal(h.state.trades[t.signalId]!.legs.SL!.status, 'open');
  assert.equal(r.halted, null);
});

test('cancel_then_place: hủy cũ → đặt mới không rõ → tra -2013 (vắng) → đặt lại lần thử MỚI ngay trong lượt (Long)', async () => {
  const t = mkTrade('long');
  const sl = stopAction(t);
  const h = harness([t], { placeStopLoss: [UNKNOWN(), OK()], queryAlgo: [res('rejected', { code: -2013, msg: 'Order does not exist.' })] });
  const r = await executeActions([cancelOld(t, null, sl.clientId), sl, tp1Action(t)], h.ctx);
  assert.deepEqual(h.calls.map((c) => c.m), ['cancelAlgo', 'placeStopLoss', 'queryAlgo', 'placeStopLoss', 'placeTakeProfit']);
  const second = h.calls[3]!.args[0] as StopLossInput;
  assert.equal(second.id.attempt, 2);
  assert.equal(second.triggerPrice, sl.input.triggerPrice);
  const leg = h.state.trades[t.signalId]!.legs.SL!;
  assert.equal(leg.clientId, legClientId(t, 'SL', 2));
  assert.equal(leg.status, 'open');
  assert.equal(h.of('closeMarket').length, 0);
  assert.equal(r.closedSymbols.length, 0);
});

test('Vắng được xác nhận qua openAlgoOrders khi queryAlgo không kết luận được → đặt lại (Short)', async () => {
  const t = mkTrade('short');
  const sl = stopAction(t);
  const h = harness([t], {
    placeStopLoss: [UNKNOWN(), OK()],
    queryAlgo: [res('rejected', { code: -1102, msg: 'x' })],
    openAlgoOrders: [res('ok', { body: [{ clientAlgoId: 'cr-khac', algoId: 1 }] })],
  });
  await executeActions([cancelOld(t, null, sl.clientId), sl], h.ctx);
  assert.deepEqual(h.calls.map((c) => c.m), ['cancelAlgo', 'placeStopLoss', 'queryAlgo', 'openAlgoOrders', 'placeStopLoss']);
  assert.deepEqual(h.calls[3]!.args, [C.symbol]);
});

test('Vắng xác nhận + đặt lại bị từ chối → hủy lệnh vào treo TRƯỚC rồi đóng market cả vị thế + Telegram khẩn; lệnh sau trên mã bị bỏ (Short)', async () => {
  const t = mkTrade('short');
  const entries = [{ clientId: legClientId(t, 'E2', 0), orderId: 4242 }];
  const sl = stopAction(t, { entries });
  const h = harness([t], {
    placeStopLoss: [UNKNOWN(), res('stop_rejected', { code: -4142, msg: 'would trigger immediately' })],
    queryAlgo: [res('rejected', { code: -2013 }), res('rejected', { code: -2013 })],
    closeMarket: [res('ok', { body: { orderId: 9, status: 'FILLED' } })],
  });
  const r = await executeActions([cancelOld(t, null, sl.clientId), sl, tp1Action(t), trAction(t)], h.ctx);
  // Trước khi đóng: tra lại mã GỐC một lần nữa (lệnh gốc có thể vừa lên sàn sau 503)
  assert.deepEqual(h.calls.map((c) => c.m), ['cancelAlgo', 'placeStopLoss', 'queryAlgo', 'placeStopLoss', 'queryAlgo', 'cancelOrder', 'closeMarket']);
  assert.deepEqual(h.calls[4]!.args[0], { clientId: sl.clientId });
  assert.deepEqual(h.calls[5]!.args, [C.symbol, { orderId: 4242 }]);
  const close = h.calls[6]!.args[0] as { side: Side; qty: number; contract: Contract; id: { leg: string } };
  assert.equal(close.side, 'short');
  assert.equal(close.qty, 60);
  assert.ok(h.alerts.some((a) => a.level === 'urgent' && /đóng/i.test(a.text)));
  assert.deepEqual(r.closedSymbols, [C.symbol]);
  assert.equal(r.skipped.filter((s) => s.action === 'place_tp1' || s.action === 'place_trailing').length, 2);
  assert.equal(r.reconcileAgain, true);
  const intent = h.events.find((e) => e.type === 'order_intent' && e.op === 'close');
  assert.ok(intent);
});

test('Không xác nhận được (tra không rõ, liệt kê không rõ) + không còn dừng nào (market_close) → đóng khẩn (Long)', async () => {
  const t = mkTrade('long');
  const sl = stopAction(t);
  const h = harness([t], { placeStopLoss: [UNKNOWN()], queryAlgo: [UNKNOWN()], openAlgoOrders: [UNKNOWN()] });
  const r = await executeActions([cancelOld(t, null, sl.clientId), sl], h.ctx);
  assert.deepEqual(h.calls.map((c) => c.m), ['cancelAlgo', 'placeStopLoss', 'queryAlgo', 'openAlgoOrders', 'closeMarket']);
  assert.equal((h.calls[4]!.args[0] as { side: Side }).side, 'long');
  assert.deepEqual(r.closedSymbols, [C.symbol]);
});

test('Không xác nhận được nhưng dừng cũ còn lành (stop_replace_rejected) → KHÔNG đóng, KHÔNG hủy dừng cũ, khóa mã trong lượt, báo khẩn (Short)', async () => {
  const t = mkTrade('short');
  const sl = stopAction(t, { onReject: 'stop_replace_rejected' });
  const h = harness([t], { placeStopLoss: [UNKNOWN()], queryAlgo: [UNKNOWN()], openAlgoOrders: [UNKNOWN()] });
  const r = await executeActions([sl, tp1Action(t), cancelOld(t, sl.clientId)], h.ctx);
  assert.deepEqual(h.calls.map((c) => c.m), ['placeStopLoss', 'queryAlgo', 'openAlgoOrders']);
  assert.equal(h.of('closeMarket').length, 0);
  assert.ok(h.alerts.some((a) => a.level === 'urgent'));
  assert.ok(r.frozenSymbols.includes(C.symbol));
  assert.equal(r.reconcileAgain, true);
});

test('Tra lại thấy lệnh dừng đã kích hoạt (TRIGGERED) → không đặt lại, khóa mã, đối chiếu lại (Long)', async () => {
  const t = mkTrade('long');
  const sl = stopAction(t);
  const h = harness([t], { placeStopLoss: [UNKNOWN()], queryAlgo: [res('ok', { body: { algoStatus: 'TRIGGERED' } })] });
  const r = await executeActions([sl, tp1Action(t)], h.ctx);
  assert.deepEqual(h.calls.map((c) => c.m), ['placeStopLoss', 'queryAlgo']);
  assert.equal(r.reconcileAgain, true);
});

// ================= Từ chối =================
test('Dừng mới bị từ chối khi dừng cũ còn lành → ghi stop_replace_rejected, giữ dừng cũ (không hủy), không đóng (Long + Short)', async () => {
  for (const side of ['long', 'short'] as const) {
    const t = mkTrade(side);
    const sl = stopAction(t, { onReject: 'stop_replace_rejected' });
    const h = harness([t], { placeStopLoss: [res('stop_rejected', { code: -4130, msg: 'x' })] });
    await executeActions([sl, cancelOld(t, sl.clientId)], h.ctx);
    assert.deepEqual(h.calls.map((c) => c.m), ['placeStopLoss'], side);
    assert.ok(h.events.some((e) => e.type === 'stop_replace_rejected' && e.clientId === sl.clientId), side);
    assert.equal(h.state.trades[t.signalId]!.stopReplaceFallback, true, side);
    assert.ok(h.alerts.some((a) => a.level === 'warn' || a.level === 'urgent'), side);
  }
});

test('Dừng bị từ chối khi không còn dừng nào (market_close) → hủy lệnh vào rồi đóng market, không tra lại, không đặt lại (Long)', async () => {
  const t = mkTrade('long');
  const sl = stopAction(t, { entries: [{ clientId: legClientId(t, 'E2', 0), orderId: 11 }] });
  const h = harness([t], { placeStopLoss: [res('stop_rejected', { code: -2025 })] });
  const r = await executeActions([sl, tp1Action(t)], h.ctx);
  assert.deepEqual(h.calls.map((c) => c.m), ['placeStopLoss', 'cancelOrder', 'closeMarket']);
  assert.equal((h.calls[2]!.args[0] as { qty: number }).qty, 60);
  assert.deepEqual(r.closedSymbols, [C.symbol]);
});

test('TP1 không rõ → KHÔNG gửi lại (tra ở lượt đối chiếu sau), lệnh kế tiếp vẫn chạy; TP1 bị từ chối → chỉ cảnh báo', async () => {
  const t = mkTrade('short');
  const h = harness([t], { placeTakeProfit: [UNKNOWN()], placeTrailing: [res('rejected', { code: -2021 })] });
  const r = await executeActions([tp1Action(t), trAction(t)], h.ctx);
  assert.deepEqual(h.calls.map((c) => c.m), ['placeTakeProfit', 'placeTrailing']);
  assert.equal(r.reconcileAgain, true);
  assert.equal(h.state.trades[t.signalId]!.legs.TP1!.status, 'unknown');
  assert.equal(h.state.trades[t.signalId]!.legs.TR!.status, 'rejected');
  assert.ok(h.alerts.some((a) => a.level === 'warn'));
  assert.equal(h.of('closeMarket').length, 0);
});

// ================= Khóa rate limit / ban =================
test('Bị khóa (banned/429/418) → dừng lượt NGAY, không gửi thêm gì; lệch giờ (clock) cũng dừng', async () => {
  for (const kind of ['banned', 'clock'] as const) {
    const t = mkTrade('long');
    const h = harness([t], { placeTakeProfit: [res(kind, { status: 429, sent: kind === 'banned' })] });
    const r = await executeActions([tp1Action(t), trAction(t), stopAction(t)], h.ctx);
    // banned: không gửi thêm gì. clock: đồng bộ giờ rồi CHỈ cứu lệnh dừng còn thiếu (TP/trailing không gửi)
    assert.deepEqual(h.calls.map((c) => c.m), kind === 'banned' ? ['placeTakeProfit'] : ['placeTakeProfit', 'placeStopLoss'], kind);
    assert.equal(h.resyncs(), kind === 'clock' ? 1 : 0, kind);
    assert.equal(r.halted?.kind, kind);
    assert.ok(h.alerts.some((a) => a.level === 'urgent'), kind);
    assert.ok(h.events.some((e) => e.type === 'order_result' && e.kind === kind), 'kết quả vẫn được ghi');
  }
  // Khóa ngay lúc tra lại → cũng dừng, không đặt lại
  const t = mkTrade('short');
  const h = harness([t], { placeStopLoss: [UNKNOWN()], queryAlgo: [res('banned', { status: 418 })] });
  const r = await executeActions([stopAction(t), tp1Action(t)], h.ctx);
  assert.deepEqual(h.calls.map((c) => c.m), ['placeStopLoss', 'queryAlgo']);
  assert.equal(r.halted?.kind, 'banned');
});

// ================= Đóng khẩn / giảm vị thế =================
test('market_close không rõ → tra queryOrder: FILLED → không gửi lại (Long)', async () => {
  const t = mkTrade('long');
  const h = harness([t], { closeMarket: [UNKNOWN()], queryOrder: [res('ok', { body: { status: 'FILLED', orderId: 3 } })] });
  await executeActions([{ type: 'market_close', symbol: C.symbol, signalId: t.signalId, side: 'long', qty: 60, reason: 'x', urgent: true }], h.ctx);
  assert.deepEqual(h.calls.map((c) => c.m), ['closeMarket', 'queryOrder']);
  const id = makeClientId({ runId: 'r1', signalId: t.signalId, leg: 'MC', attempt: 7 });
  assert.deepEqual(h.calls[1]!.args, [C.symbol, { clientId: id }]);
  assert.equal((h.calls[0]!.args[0] as { id: { leg: string } }).id.leg, 'MC');
});

test('market_close không rõ → tra -2013 (không có trên sàn) → gửi lại ĐÚNG MỘT lần với mã MỚI (Short, mã bị khóa không có signalId)', async () => {
  const t = mkTrade('short');
  const h = harness([t], { closeMarket: [UNKNOWN(), res('ok')], queryOrder: [res('rejected', { code: -2013 })] });
  await executeActions([{ type: 'market_close', symbol: C.symbol, signalId: null, side: 'short', qty: 60, reason: 'x', urgent: true }], h.ctx);
  assert.deepEqual(h.calls.map((c) => c.m), ['closeMarket', 'queryOrder', 'closeMarket']);
  const a = h.calls[0]!.args[0] as { id: { leg: string; signalId: string }; side: Side; qty: number };
  const b = h.calls[2]!.args[0] as { id: { leg: string; signalId: string } };
  assert.notEqual(makeClientId(a.id as never), makeClientId(b.id as never));
  assert.equal(a.side, 'short');
  assert.equal(a.qty, 60);
});

test('reduce_only → closeMarket reduce-only với khối lượng cắt; không rõ → chỉ tra, không gửi lại', async () => {
  const t = mkTrade('long');
  const h = harness([t], { closeMarket: [UNKNOWN()], queryOrder: [res('rejected', { code: -2013 })] });
  await executeActions([{ type: 'reduce_only', symbol: C.symbol, signalId: t.signalId, side: 'long', qty: 12, reason: 'rủi ro > 2%' }], h.ctx);
  assert.deepEqual(h.calls.map((c) => c.m), ['closeMarket', 'queryOrder']);
  assert.equal((h.calls[0]!.args[0] as { qty: number; id: { leg: string } }).qty, 12);
  assert.equal((h.calls[0]!.args[0] as { id: { leg: string } }).id.leg, 'RD');
});

// ================= Sổ sách + tra lại do reconcile yêu cầu =================
test('Sổ sách: record_fill / update_leg / mark_trade_closed ghi vào nhật ký; query_algo vắng → leg gone + đối chiếu lại', async () => {
  const t = mkTrade('long');
  t.legs.BE = { role: 'BE', clientId: legClientId(t, 'BE', 0), attempt: 0, status: 'unknown', qty: null, triggerPrice: 100.1, orderIds: [] };
  const h = harness([t], { queryAlgo: [res('ok', { body: { algoStatus: 'CANCELED' } })] });
  const fill = { tradeId: 1, orderId: 2, clientId: null, symbol: C.symbol, side: 'SELL' as const, qty: 30, price: 106, time: NOW };
  const r = await executeActions([
    { type: 'record_fill', signalId: t.signalId, role: 'TP1', fill },
    { type: 'update_leg', signalId: t.signalId, role: 'TP1', clientId: t.legs.TP1!.clientId, status: 'filled', reason: 'TP1 đã khớp' },
    { type: 'query_algo', symbol: C.symbol, signalId: t.signalId, clientId: t.legs.BE.clientId, reason: 'tra lại' },
    { type: 'mark_trade_closed', signalId: t.signalId, reason: 'xong' },
  ], h.ctx);
  assert.deepEqual(h.events.map((e) => e.type), ['fill', 'leg_update', 'leg_update', 'trade_closed']);
  const s = h.state.trades[t.signalId]!;
  assert.equal(s.tp1Filled, true);
  assert.equal(s.legs.BE!.status, 'gone');
  assert.equal(s.status, 'closed');
  assert.equal(r.reconcileAgain, true);
});

test('block_symbol / adopt_unknown_position_noop → báo mã bị khóa, không gửi gì', async () => {
  const t = mkTrade('long');
  const h = harness([t]);
  const r = await executeActions([
    { type: 'block_symbol', symbol: C.symbol, reason: 'mơ hồ' },
    { type: 'adopt_unknown_position_noop', symbol: 'BBBUSDT', positionAmt: 5, text: 'lạ' },
  ], h.ctx);
  assert.deepEqual(h.calls, []);
  assert.deepEqual(r.blockedSymbols.sort(), ['AAAUSDT', 'BBBUSDT']);
});

// ================= Protections không đụng lệnh bảo vệ =================
test('Cầu chì đang nhảy KHÔNG ảnh hưởng executor: vẫn đặt dừng và vẫn đóng khẩn', async () => {
  const t = mkTrade('short');
  const h = harness([t], { placeStopLoss: [res('stop_rejected', { code: -2025 })] });
  h.state.protections = {
    loss_streak: { tripped: true, reason: '5 thua', since: NOW, resetBy: null },
    daily_loss: { tripped: true, reason: '11%', since: NOW, resetBy: null },
  };
  await executeActions([stopAction(t)], h.ctx);
  assert.deepEqual(h.calls.map((c) => c.m), ['placeStopLoss', 'closeMarket']);
});

// ================= Ghép với reconcile =================
test('Ghép reconcile → executor: vị thế THIẾU dừng → SL được đặt TRƯỚC mọi thứ khác (Long + Short)', async () => {
  for (const side of ['long', 'short'] as const) {
    const t = mkTrade(side);
    t.fills = [{ tradeId: 1, orderId: 1001, clientId: t.legs.E1!.clientId, symbol: C.symbol, side: side === 'long' ? 'BUY' : 'SELL', qty: 60, price: 100, time: t.createdAt + 1, role: 'E1' }];
    t.legs.SL!.status = 'gone';
    const positions = [{ symbol: C.symbol, positionAmt: side === 'long' ? 60 : -60, entryPrice: 100, liquidationPrice: null }];
    const acts = reconcile([t], { positions, openOrders: [], openAlgoOrders: [], recentFills: [] }, { now: NOW, markPrices: { [C.symbol]: px(side, 101) }, filters: { [C.symbol]: C }, capital: 1_000_000 });
    const h = harness([t], {}, positions);
    const r = await executeActions(acts, h.ctx);
    assert.equal(r.halted, null);
    assert.equal(h.calls[0]!.m, 'placeStopLoss', side);
    assert.equal(h.state.trades[t.signalId]!.legs.SL!.status, 'open', side);
    assert.ok(h.calls.some((c) => c.m === 'placeTakeProfit'), side);
  }
});

// ================= B5 vòng 1 =================
test('Không rõ → CHỜ (đồng hồ tiêm) rồi mới tra lại mã gốc', async () => {
  const t = mkTrade('long');
  const h = harness([t], { placeStopLoss: [UNKNOWN()], queryAlgo: [res('ok', { body: { algoStatus: 'NEW' } })] });
  await executeActions([stopAction(t)], h.ctx);
  assert.deepEqual(h.log.filter((x) => x.startsWith('C:') || x.startsWith('S:')), ['C:placeStopLoss', 'S:1500', 'C:queryAlgo']);
});

test('cancel_then_place: hủy dừng cũ KHÔNG xác nhận, tra thấy dừng cũ còn sống → giữ dừng cũ, KHÔNG đặt mới, KHÔNG đóng, bật dự phòng (Long + Short)', async () => {
  for (const side of ['long', 'short'] as const) {
    for (const cancelRes of [UNKNOWN(), res('rejected', { code: -1102 })]) {
      const t = mkTrade(side);
      const sl = stopAction(t);
      const h = harness([t], { cancelAlgo: [cancelRes], queryAlgo: [res('ok', { body: { algoStatus: 'NEW' } })] });
      const r = await executeActions([cancelOld(t, null, sl.clientId), sl, tp1Action(t)], h.ctx);
      assert.deepEqual(h.calls.map((c) => c.m), ['cancelAlgo', 'queryAlgo', 'placeTakeProfit'], side);
      assert.deepEqual(h.calls[1]!.args[0], { clientId: legClientId(t, 'SL', 0) });
      assert.equal(h.of('closeMarket').length, 0);
      assert.equal(h.state.trades[t.signalId]!.stopReplaceFallback, true);
      assert.ok(h.alerts.some((a) => a.level === 'warn'));
      assert.deepEqual(r.unprotected, []);
    }
  }
});

test('cancel_then_place: hủy bị từ chối nhưng tra xác nhận dừng cũ đã VẮNG → đặt dừng mới bình thường (Short)', async () => {
  const t = mkTrade('short');
  const sl = stopAction(t);
  const h = harness([t], { cancelAlgo: [res('rejected', { code: -2011, msg: 'Unknown order sent.' })], queryAlgo: [res('rejected', { code: -2013 })] });
  await executeActions([cancelOld(t, null, sl.clientId), sl], h.ctx);
  assert.deepEqual(h.calls.map((c) => c.m), ['cancelAlgo', 'queryAlgo', 'placeStopLoss']);
  assert.equal(h.state.trades[t.signalId]!.legs.SL!.status, 'open');
});

test('cancel_then_place: hủy không rõ và tra cũng không kết luận → không đặt (tránh -4130 → đóng oan), báo khẩn + đánh dấu chưa bảo vệ (Long)', async () => {
  const t = mkTrade('long');
  const sl = stopAction(t);
  const h = harness([t], { cancelAlgo: [UNKNOWN()], queryAlgo: [UNKNOWN()], openAlgoOrders: [UNKNOWN()] });
  const r = await executeActions([cancelOld(t, null, sl.clientId), sl], h.ctx);
  assert.deepEqual(h.calls.map((c) => c.m), ['cancelAlgo', 'queryAlgo', 'openAlgoOrders']);
  assert.equal(h.of('closeMarket').length, 0);
  // Hủy chưa xác nhận → dừng cũ coi như CÒN SỐNG → không phải vị thế trần (không dấu, không báo "không có lệnh dừng")
  assert.deepEqual(r.unprotected, []);
  assert.equal(h.state.unprotected[C.symbol], undefined);
  assert.ok(h.alerts.some((a) => a.level === 'urgent' && a.text.includes(C.symbol) && /không rõ/.test(a.text)));
  assert.ok(!h.alerts.some((a) => /KHÔNG CÓ LỆNH DỪNG/.test(a.text)));
});

test('Đặt lại bị từ chối nhưng mã GỐC hóa ra đã lên sàn → nhận lệnh gốc làm dừng, KHÔNG đóng (Long + Short)', async () => {
  for (const side of ['long', 'short'] as const) {
    const t = mkTrade(side);
    const sl = stopAction(t, { onReject: 'market_close' });
    const h = harness([t], {
      placeStopLoss: [UNKNOWN(), res('stop_rejected', { code: -4130, msg: 'closePosition stop exists' })],
      queryAlgo: [res('rejected', { code: -2013 }), res('ok', { body: { algoStatus: 'NEW' } })],
    });
    const r = await executeActions([sl, cancelOld(t, sl.clientId)], h.ctx);
    assert.deepEqual(h.calls.map((c) => c.m), ['placeStopLoss', 'queryAlgo', 'placeStopLoss', 'queryAlgo', 'cancelAlgo'], side);
    assert.equal(h.of('closeMarket').length, 0, side);
    const leg = h.state.trades[t.signalId]!.legs.SL!;
    assert.equal(leg.clientId, sl.clientId, side);
    assert.equal(leg.status, 'open', side);
    assert.deepEqual(r.closedSymbols, []);
  }
});

test('Bị khóa (banned) ngay sau khi đã hủy dừng cũ, trước khi đặt dừng mới → báo KHẨN từng mã không có dừng + ghi dấu chưa bảo vệ vào nhật ký (Short)', async () => {
  const t = mkTrade('short');
  const sl = stopAction(t);
  const h = harness([t], { placeStopLoss: [res('banned', { status: 418 })] });
  const r = await executeActions([cancelOld(t, null, sl.clientId), sl, tp1Action(t)], h.ctx);
  assert.deepEqual(h.calls.map((c) => c.m), ['cancelAlgo', 'placeStopLoss']);
  assert.equal(r.halted?.kind, 'banned');
  assert.deepEqual(r.unprotected, [C.symbol]);
  assert.ok(h.events.some((e) => e.type === 'unprotected' && e.symbol === C.symbol));
  assert.ok(h.state.unprotected[C.symbol]);
  assert.ok(h.alerts.some((a) => a.level === 'urgent' && a.symbol === C.symbol && /KHÔNG CÓ LỆNH DỪNG/.test(a.text)));
  assert.equal(h.resyncs(), 0, 'bị cấm thì không gửi gì thêm');
});

test('Lệch giờ (clock) sau khi đã hủy dừng cũ → đồng bộ giờ, xác nhận vắng, đặt lại MỘT lần với mã MỚI (Long)', async () => {
  const t = mkTrade('long');
  const sl = stopAction(t);
  const h = harness([t], { placeStopLoss: [res('clock', { code: -1021, sent: true }), OK()], queryAlgo: [res('rejected', { code: -2013 })] });
  const r = await executeActions([cancelOld(t, null, sl.clientId), sl, tp1Action(t)], h.ctx);
  assert.deepEqual(h.log.filter((x) => x.startsWith('C:') || x === 'R'), ['C:cancelAlgo', 'C:placeStopLoss', 'R', 'C:queryAlgo', 'C:placeStopLoss']);
  assert.equal((h.calls[3]!.args[0] as StopLossInput).id.attempt, 2);
  assert.equal(r.halted?.kind, 'clock');
  assert.deepEqual(r.unprotected, []);
  assert.equal(h.state.trades[t.signalId]!.legs.SL!.status, 'open');
  assert.equal(h.of('placeTakeProfit').length, 0, 'lượt vẫn dừng sau khi cứu lệnh dừng');
});

test('Lệch giờ mà không đồng bộ được (không có resyncClock) → đánh dấu chưa bảo vệ + khẩn', async () => {
  const t = mkTrade('short');
  const h = harness([t], { placeStopLoss: [res('clock', { sent: false })] });
  const r = await executeActions([stopAction(t)], { ...h.ctx, resyncClock: undefined });
  assert.deepEqual(r.unprotected, [C.symbol]);
});

test('Lượt sau: mã bị đánh dấu chưa bảo vệ được xử lý TRƯỚC mọi mã khác; đặt dừng xong thì dấu tự xóa', async () => {
  const a = mkTrade('long', C.symbol);
  const b = mkTrade('short', C2.symbol);
  const h = harness([b, a]);
  h.state.unprotected[C.symbol] = { signalId: a.signalId, since: NOW, reason: 'bị khóa' };
  const tpB: Action = { ...tp1Action(b), symbol: C2.symbol } as Action;
  await executeActions([tpB, stopAction(a)], h.ctx);
  assert.deepEqual(h.calls.map((c) => c.m), ['placeStopLoss', 'placeTakeProfit']);
  assert.equal(h.state.unprotected[C.symbol], undefined);
});

// ================= B5 vòng 2 =================
test('Lệch giờ TRƯỚC khi kịp hủy dừng cũ (cancel_then_place) → KHÔNG đặt dừng mới đè dừng cũ, KHÔNG đóng, không báo trần (Long + Short)', async () => {
  for (const side of ['long', 'short'] as const) {
    const t = mkTrade(side);
    const sl = stopAction(t);
    const h = harness([t], { placeTakeProfit: [res('clock', { code: -1021 })], placeStopLoss: [res('stop_rejected', { code: -4130 })] });
    const r = await executeActions([tp1Action(t), cancelOld(t, null, sl.clientId), sl], h.ctx);
    assert.deepEqual(h.calls.map((c) => c.m), ['placeTakeProfit'], side);
    assert.equal(h.of('closeMarket').length, 0, side);
    assert.deepEqual(r.closedSymbols, [], side);
    assert.deepEqual(r.unprotected, [], side);
  }
});

test('Bị cấm TRƯỚC khi kịp hủy dừng cũ → không báo "KHÔNG CÓ LỆNH DỪNG", không ghi dấu chưa bảo vệ (Long + Short)', async () => {
  for (const side of ['long', 'short'] as const) {
    const t = mkTrade(side);
    const sl = stopAction(t);
    const h = harness([t], { placeTakeProfit: [res('banned', { status: 429 })] });
    const r = await executeActions([tp1Action(t), cancelOld(t, null, sl.clientId), sl], h.ctx);
    assert.deepEqual(h.calls.map((c) => c.m), ['placeTakeProfit'], side);
    assert.deepEqual(r.unprotected, [], side);
    assert.equal(h.events.filter((e) => e.type === 'unprotected').length, 0, side);
    assert.ok(!h.alerts.some((a) => /KHÔNG CÓ LỆNH DỪNG/.test(a.text)), side);
  }
});

test('Chính lệnh hủy dừng cũ bị lệch giờ (chưa hủy được) → dừng cũ coi như còn sống: không đặt mới, không đóng (Short)', async () => {
  const t = mkTrade('short');
  const sl = stopAction(t);
  const h = harness([t], { cancelAlgo: [res('clock', { code: -1021 })] });
  const r = await executeActions([cancelOld(t, null, sl.clientId), sl], h.ctx);
  assert.deepEqual(h.calls.map((c) => c.m), ['cancelAlgo']);
  assert.deepEqual(r.unprotected, []);
  assert.equal(h.of('closeMarket').length, 0);
});

test('Lần đặt lại báo không rõ, tra thấy ĐÃ KÍCH HOẠT → vị thế đang được dừng đóng: không tra tiếp, không đóng khẩn (Long)', async () => {
  const t = mkTrade('long');
  const h = harness([t], {
    placeStopLoss: [UNKNOWN(), UNKNOWN()],
    queryAlgo: [res('rejected', { code: -2013 }), res('ok', { body: { algoStatus: 'TRIGGERED' } })],
  });
  const r = await executeActions([stopAction(t), tp1Action(t)], h.ctx);
  assert.deepEqual(h.calls.map((c) => c.m), ['placeStopLoss', 'queryAlgo', 'placeStopLoss', 'queryAlgo']);
  assert.equal(h.of('closeMarket').length, 0);
  assert.deepEqual(r.unprotected, []);
  assert.equal(r.reconcileAgain, true);
});
