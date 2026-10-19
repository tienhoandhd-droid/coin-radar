import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcile, legClientId, type TradeState, type ExchangeState, type ExAlgoOrder, type ExOrder, type Fill, type Action,
  type LegRole, type LegStatus, type ReconcileCtx,
} from './reconcile.ts';
import { exitSplit } from './planner.ts';
import type { Contract, Side } from '../core/types.ts';

// Bảng ca cho bộ đối chiếu (B4). Long quanh giá 100; Short đối xứng (giá = 200 − giá Long).
const C: Contract = {
  symbol: 'AAAUSDT', baseAsset: 'AAA', onboardDate: 0, tickSize: 0.01, stepSize: 0.001, minQty: 0.001, maxQty: 100_000,
  marketMinQty: 0.001, marketMaxQty: 100_000, marketStepSize: 0.001, minNotional: 5, maxNumOrders: 200, deliveryDate: 4133894400000,
};
const NOW = 1_760_000_000_000;
const T0 = NOW - 3_600_000; // lúc tạo lệnh
const SIDES: Side[] = ['long', 'short'];
const px = (side: Side, x: number) => Number((side === 'long' ? x : 200 - x).toFixed(2)); // giá Long → giá cùng vị trí bên Short

let tradeSeq = 1;
function mkTrade(side: Side, over: Partial<TradeState> = {}, signalId = `sig-${side}-${tradeSeq++}`): TradeState {
  const t: TradeState = {
    signalId, symbol: C.symbol, side, runId: 'r1', createdAt: T0, status: 'open', closedReason: null,
    plan: {
      stop: px(side, 97), tp1: px(side, 106), activatePrice: px(side, 106), callbackPct: 1, costPct: 0.1,
      needsBreakevenFloor: false, leverage: 3, qtyStep: 0.001, tp1Pct: 50, limitCancelAt: null,
    },
    legs: {}, fills: [], tp1Filled: false, trailingActivated: false, stopReplaceFallback: false,
  };
  const mk = (role: LegRole, status: LegStatus, qty: number | null, trig: number | null) =>
    ({ role, clientId: legClientId(t, role, 0), attempt: 0, status, qty, triggerPrice: trig, orderIds: [] as number[] });
  t.legs = {
    E1: mk('E1', 'filled', 60, null),
    SL: mk('SL', 'open', null, t.plan.stop),
    TP1: mk('TP1', 'open', 30, t.plan.tp1),
    TR: mk('TR', 'open', 30, null),
  };
  t.legs.E1!.orderIds = [1001];
  t.fills = [{ tradeId: 5001, orderId: 1001, clientId: t.legs.E1!.clientId, symbol: C.symbol, side: side === 'long' ? 'BUY' : 'SELL', qty: 60, price: 100, time: T0 + 1000, role: 'E1' }];
  return { ...t, ...over, plan: { ...t.plan, ...(over.plan ?? {}) } };
}

let idSeq = 900;
function algo(t: TradeState, role: 'SL' | 'BE' | 'TP1' | 'TR', over: Partial<ExAlgoOrder> = {}): ExAlgoOrder {
  const close = t.side === 'long' ? 'SELL' : 'BUY';
  const type = role === 'TP1' ? 'TAKE_PROFIT_MARKET' : role === 'TR' ? 'TRAILING_STOP_MARKET' : 'STOP_MARKET';
  const trig = role === 'SL' ? t.plan.stop : role === 'TP1' ? t.plan.tp1 : role === 'TR' ? 0 : px(t.side, 100.1);
  return {
    symbol: t.symbol, algoId: idSeq++, clientId: legClientId(t, role, t.legs[role]?.attempt ?? 0), orderType: type, side: close,
    quantity: role === 'TP1' || role === 'TR' ? 30 : 0, triggerPrice: trig, closePosition: role === 'SL' || role === 'BE',
    algoStatus: 'NEW', activated: null, ...over,
  };
}
function entryOrder(t: TradeState, role: 'E1' | 'E2', over: Partial<ExOrder> = {}): ExOrder {
  return {
    symbol: t.symbol, orderId: idSeq++, clientId: legClientId(t, role, t.legs[role]?.attempt ?? 0), type: 'LIMIT',
    side: t.side === 'long' ? 'BUY' : 'SELL', origQty: 30, executedQty: 0, price: px(t.side, 99), status: 'NEW', ...over,
  };
}
const pos = (side: Side, qty: number, entryPrice = 100) => ({ symbol: C.symbol, positionAmt: side === 'long' ? qty : -qty, entryPrice, liquidationPrice: null });
const healthy = (t: TradeState, qty = 60): ExchangeState => ({
  positions: [pos(t.side, qty)], openOrders: [], openAlgoOrders: [algo(t, 'SL'), algo(t, 'TP1'), algo(t, 'TR')], recentFills: [],
});
const ctx = (side: Side, mark = 100, over: Partial<ReconcileCtx> = {}): ReconcileCtx => ({
  now: NOW, markPrices: { [C.symbol]: px(side, mark) }, filters: { [C.symbol]: C }, capital: 10_000, ...over,
});
const fillOf = (t: TradeState, role: LegRole, qty: number, price: number, tradeId: number, time = T0 + 2000, clientId: string | null = legClientId(t, role, 0), orderId = 2000 + tradeId): Fill =>
  ({ tradeId, orderId, clientId, symbol: t.symbol, side: (role === 'E1' || role === 'E2') === (t.side === 'long') ? 'BUY' : 'SELL', qty, price, time });

const types = (a: Action[]) => a.map((x) => x.type);
const ofType = <K extends Action['type']>(a: Action[], k: K) => a.filter((x): x is Extract<Action, { type: K }> => x.type === k);
const isStopId = (id: string) => /-(SL|BE)-\d+$/.test(id);

// Bất biến chung: không bao giờ hủy một lệnh dừng khi vị thế còn mà không có lệnh dừng khác (đã có trên sàn hoặc đặt TRƯỚC đó
// trong danh sách và bị chờ xác nhận) hoặc trailing đã kích hoạt, hoặc (chế độ cancel_then_place) lệnh dừng mới đứng NGAY SAU.
// place_stop khi đã có lệnh dừng lành trên sàn → onReject = stop_replace_rejected (giữ dừng cũ); ngược lại → market_close.
function assertNoGap(acts: Action[], ex: ExchangeState) {
  for (const p of ofType(acts, 'place_stop')) {
    const healthy = ex.openAlgoOrders.some((o) => o.symbol === p.symbol && isStopId(o.clientId) && !acts.some((x) => x.type === 'cancel_algo' && x.clientId === o.clientId && x.onlyAfterPlaced === null));
    assert.equal(p.onReject, healthy ? 'stop_replace_rejected' : 'market_close', `onReject của ${p.clientId}`);
  }
  const posSyms = new Set(ex.positions.filter((p) => p.positionAmt !== 0).map((p) => p.symbol));
  const closed = new Set(ofType(acts, 'market_close').map((m) => m.symbol));
  acts.forEach((a, i) => {
    if (a.type !== 'cancel_algo' || !isStopId(a.clientId) || !posSyms.has(a.symbol) || closed.has(a.symbol)) return;
    if (a.replacedBy !== null) {
      const next = acts[i + 1];
      assert.ok(next !== undefined && next.type === 'place_stop' && next.clientId === a.replacedBy, 'cancel_then_place: lệnh dừng mới phải đứng ngay sau lệnh hủy');
      return;
    }
    const cancelled = new Set(acts.slice(0, i + 1).filter((x) => x.type === 'cancel_algo').map((x) => (x as { clientId: string }).clientId));
    const remaining = ex.openAlgoOrders.filter((o) => o.symbol === a.symbol && isStopId(o.clientId) && !cancelled.has(o.clientId));
    const placedBefore = acts.slice(0, i).some((x) => x.type === 'place_stop' && x.symbol === a.symbol);
    const trailingActive = ex.openAlgoOrders.some((o) => o.symbol === a.symbol && o.orderType === 'TRAILING_STOP_MARKET' && o.activated === true);
    assert.ok(remaining.length > 0 || placedBefore || trailingActive, `hủy dừng ${a.clientId} để hở vị thế: ${JSON.stringify(types(acts))}`);
    if (placedBefore && remaining.length === 0 && !trailingActive) {
      const placed = acts.slice(0, i).filter((x) => x.type === 'place_stop' && x.symbol === a.symbol).map((x) => (x as { clientId: string }).clientId);
      assert.ok(a.onlyAfterPlaced !== null && placed.includes(a.onlyAfterPlaced), 'hủy dừng cũ phải chờ dừng mới xác nhận');
    }
  });
}
function run(desired: TradeState[], ex: ExchangeState, c: ReconcileCtx): Action[] {
  const acts = reconcile(desired, ex, c);
  assertNoGap(acts, ex);
  return acts;
}

for (const side of SIDES) {
  const d = side === 'long' ? 1 : -1;

  test(`[${side}] 1. vị thế khỏe (SL + TP1 + TR đủ) → không hành động`, () => {
    const t = mkTrade(side);
    assert.deepEqual(run([t], healthy(t), ctx(side)), []);
  });

  test(`[${side}] 2. thiếu SL → place_stop initial ở SL kế hoạch, đứng ĐẦU danh sách`, () => {
    const t = mkTrade(side);
    const ex = healthy(t);
    ex.openAlgoOrders = ex.openAlgoOrders.filter((o) => !o.clientId.includes('-SL-'));
    const acts = run([t], ex, ctx(side));
    const ps = ofType(acts, 'place_stop');
    assert.equal(ps.length, 1);
    assert.equal(acts[0]!.type, 'place_stop');
    assert.equal(ps[0]!.purpose, 'initial');
    assert.equal(ps[0]!.input.triggerPrice, t.plan.stop);
    assert.equal(ps[0]!.input.markPrice, px(side, 100));
    assert.equal(ps[0]!.clientId, legClientId(t, 'SL', 1), 'SL đã từng gửi → lần thử mới, không dùng lại mã cũ');
    assert.ok(ofType(acts, 'alert').some((a) => a.level === 'urgent'));
  });

  test(`[${side}] 3. thiếu SL và giá mark đã qua SL → market_close khẩn, không đặt dừng`, () => {
    const t = mkTrade(side);
    const ex = healthy(t);
    ex.openAlgoOrders = ex.openAlgoOrders.filter((o) => !o.clientId.includes('-SL-'));
    const acts = run([t], ex, ctx(side, 96.5));
    assert.equal(ofType(acts, 'place_stop').length, 0);
    const mc = ofType(acts, 'market_close');
    assert.equal(mc.length, 1);
    assert.equal(mc[0]!.qty, 60);
    assert.equal(mc[0]!.urgent, true);
    assert.equal(mc[0]!.side, side);
    assert.ok(ofType(acts, 'alert').some((a) => a.level === 'urgent'));
  });

  test(`[${side}] 4. thiếu SL và không có giá mark → market_close khẩn (không đặt dừng mù)`, () => {
    const t = mkTrade(side);
    const ex = healthy(t);
    ex.openAlgoOrders = ex.openAlgoOrders.filter((o) => !o.clientId.includes('-SL-'));
    const acts = run([t], ex, ctx(side, 100, { markPrices: {} }));
    assert.deepEqual(types(acts).filter((x) => x === 'market_close' || x === 'place_stop'), ['market_close']);
  });

  test(`[${side}] 5. lệnh đã đóng trên sàn (không còn vị thế) → hủy SL/TP1/TR mồ côi + đánh dấu đóng`, () => {
    const t = mkTrade(side);
    const ex = healthy(t);
    ex.positions = [];
    const acts = run([t], ex, ctx(side));
    assert.deepEqual(ofType(acts, 'cancel_algo').map((a) => a.clientId).sort(), [algo(t, 'SL').clientId, algo(t, 'TP1').clientId, algo(t, 'TR').clientId].sort());
    assert.equal(ofType(acts, 'mark_trade_closed').length, 1);
    assert.equal(ofType(acts, 'place_stop').length + ofType(acts, 'market_close').length, 0);
  });

  test(`[${side}] 6. lệnh dừng mồ côi của bot không thuộc lệnh nào, không vị thế → hủy; lệnh không phải của bot → không đụng`, () => {
    const t = mkTrade(side, { status: 'closed', closedReason: 'x' });
    const stray = { ...algo(t, 'SL'), clientId: 'cr-r0-0123456789-SL-0' };
    const manual = { ...algo(t, 'SL'), clientId: 'web_abc123', algoId: 77 };
    const acts = run([t], { positions: [], openOrders: [], openAlgoOrders: [stray, manual], recentFills: [] }, ctx(side));
    assert.deepEqual(ofType(acts, 'cancel_algo').map((a) => a.clientId), [stray.clientId]);
  });

  test(`[${side}] 7. lệnh chờ khớp (E2 limit đang mở, chưa vị thế) có SL trên sàn → hủy SL mồ côi, giữ E2`, () => {
    const t = mkTrade(side, { status: 'pending', fills: [] });
    t.legs = { E2: { ...t.legs.E1!, role: 'E2', clientId: legClientId(t, 'E2', 0), status: 'open', orderIds: [] }, SL: t.legs.SL };
    const acts = run([t], { positions: [], openOrders: [entryOrder(t, 'E2')], openAlgoOrders: [algo(t, 'SL')], recentFills: [] }, ctx(side));
    assert.deepEqual(types(acts), ['cancel_algo']);
    assert.equal(ofType(acts, 'cancel_order').length, 0);
  });

  test(`[${side}] 8. TP1 khớp lúc vắng mặt, trailing ĐÃ kích hoạt (xác nhận), không cần sàn hòa vốn → hủy SL gốc, không đặt BE`, () => {
    const t = mkTrade(side);
    t.legs.TP1!.orderIds = [3001];
    const ex: ExchangeState = {
      positions: [pos(side, 30)], openOrders: [],
      openAlgoOrders: [algo(t, 'SL'), algo(t, 'TR', { activated: true })],
      recentFills: [fillOf(t, 'TP1', 30, px(side, 106), 7001, T0 + 5000, null, 3001)],
    };
    const acts = run([t], ex, ctx(side, 107));
    assert.equal(ofType(acts, 'place_stop').length, 0);
    assert.deepEqual(ofType(acts, 'cancel_algo').map((a) => a.clientId), [algo(t, 'SL').clientId]);
    assert.ok(ofType(acts, 'record_fill').some((r) => r.role === 'TP1' && r.fill.tradeId === 7001), 'khớp TP1 được gán theo orderId');
    assert.ok(ofType(acts, 'update_leg').some((u) => u.role === 'TP1' && u.status === 'filled'));
  });

  test(`[${side}] 9. TP1 khớp lúc vắng mặt (suy từ vị thế giảm), trailing CHƯA xác nhận → đặt BE trước, rồi mới hủy SL gốc (chờ BE)`, () => {
    const t = mkTrade(side);
    const ex: ExchangeState = { positions: [pos(side, 30)], openOrders: [], openAlgoOrders: [algo(t, 'SL'), algo(t, 'TR')], recentFills: [] };
    const acts = run([t], ex, ctx(side, 105));
    const iPlace = acts.findIndex((a) => a.type === 'place_stop');
    const iCancel = acts.findIndex((a) => a.type === 'cancel_algo');
    assert.ok(iPlace >= 0 && iCancel > iPlace, `thứ tự: ${types(acts)}`);
    const be = ofType(acts, 'place_stop')[0]!;
    assert.equal(be.purpose, 'breakeven');
    assert.equal(be.clientId, legClientId(t, 'BE', 0));
    assert.equal(be.input.triggerPrice, px(side, 100.1)); // giá khớp thật 100 + phí 0,1%
    // BE = STOP_MARKET reduce-only THEO KHỐI LƯỢNG (không closePosition) → cùng tồn tại được với SL gốc closePosition
    assert.equal(be.qty, 30);
    assert.equal(be.onReject, 'stop_replace_rejected', 'SL gốc còn lành → BE bị từ chối thì giữ SL, không đóng');
    const cancel = ofType(acts, 'cancel_algo')[0]!;
    assert.equal(cancel.clientId, algo(t, 'SL').clientId);
    assert.equal(cancel.onlyAfterPlaced, be.clientId);
    assert.ok(ofType(acts, 'update_leg').some((u) => u.role === 'TP1' && u.status === 'filled'));
  });

  test(`[${side}] 10. TP1 đã khớp, cần sàn hòa vốn (callback quá nhỏ) dù trailing đã kích hoạt → vẫn đặt BE rồi hủy SL`, () => {
    const t = mkTrade(side, { tp1Filled: true, trailingActivated: true, plan: { needsBreakevenFloor: true } as TradeState['plan'] });
    t.legs.TP1!.status = 'filled';
    const ex: ExchangeState = { positions: [pos(side, 30)], openOrders: [], openAlgoOrders: [algo(t, 'SL'), algo(t, 'TR', { activated: true })], recentFills: [] };
    const acts = run([t], ex, ctx(side, 105));
    assert.deepEqual(types(acts).filter((x) => x !== 'alert'), ['place_stop', 'cancel_algo']);
  });

  test(`[${side}] 11. TP1 đã khớp, giá mark đã lùi qua sàn hòa vốn → market_close khẩn phần còn lại, KHÔNG hủy SL`, () => {
    const t = mkTrade(side, { tp1Filled: true });
    t.legs.TP1!.status = 'filled';
    const ex: ExchangeState = { positions: [pos(side, 30)], openOrders: [], openAlgoOrders: [algo(t, 'SL'), algo(t, 'TR')], recentFills: [] };
    const acts = run([t], ex, ctx(side, 100.05));
    assert.equal(ofType(acts, 'place_stop').length, 0);
    assert.equal(ofType(acts, 'cancel_algo').length, 0);
    const mc = ofType(acts, 'market_close');
    assert.equal(mc.length, 1);
    assert.equal(mc[0]!.qty, 30);
    assert.ok(ofType(acts, 'alert').some((a) => a.level === 'urgent'));
  });

  test(`[${side}] 12. sàn hòa vốn tính lại theo giá khớp TB THẬT (hai lần khớp), làm tròn về phía an toàn`, () => {
    const t = mkTrade(side, { tp1Filled: true });
    t.legs.TP1!.status = 'filled';
    t.fills = [
      { ...t.fills[0]!, qty: 20, price: px(side, 99.4) },
      { ...t.fills[0]!, tradeId: 5002, qty: 40, price: px(side, 99.55) },
    ];
    const ex: ExchangeState = { positions: [pos(side, 30, px(side, 99.5))], openOrders: [], openAlgoOrders: [algo(t, 'SL'), algo(t, 'TR')], recentFills: [] };
    const acts = run([t], ex, ctx(side, 105));
    const be = ofType(acts, 'place_stop')[0]!;
    // TB = 99,5 (Short: 100,5); × (1 ± 0,1%) = 99,5995 → Long LÊN 99,60; Short 100,3995 → XUỐNG 100,39
    assert.equal(be.input.triggerPrice, side === 'long' ? 99.6 : 100.39);
    assert.ok(d * (be.input.triggerPrice - (side === 'long' ? 99.5 : 100.5) * (1 + d * 0.001)) >= -1e-9, 'không bao giờ dưới giá khớp + phí');
  });

  test(`[${side}] 13. split: chỉ E1 khớp 30/60, E2 còn mở, TP1/TR chưa đặt → TP1/TR theo khối lượng ĐÃ khớp`, () => {
    const t = mkTrade(side);
    t.legs.E1!.qty = 30;
    t.fills = [{ ...t.fills[0]!, qty: 30 }];
    t.legs.E2 = { role: 'E2', clientId: legClientId(t, 'E2', 0), attempt: 0, status: 'open', qty: 30, triggerPrice: null, orderIds: [] };
    t.legs.TP1!.status = 'planned';
    t.legs.TR!.status = 'planned';
    const ex: ExchangeState = { positions: [pos(side, 30)], openOrders: [entryOrder(t, 'E2')], openAlgoOrders: [algo(t, 'SL')], recentFills: [] };
    const acts = run([t], ex, ctx(side));
    const tp = ofType(acts, 'place_tp1');
    const tr = ofType(acts, 'place_trailing');
    assert.equal(tp.length, 1);
    assert.equal(tr.length, 1);
    assert.equal(tp[0]!.input.qty, 15);
    assert.equal(tr[0]!.input.qty, 15);
    assert.equal(tp[0]!.clientId, legClientId(t, 'TP1', 0), 'chưa từng gửi → lần thử 0');
    assert.equal(tp[0]!.input.openCount, 2, 'openCount = số lệnh thật trên sàn (E2 + SL)');
    assert.equal(tr[0]!.input.openCount, 3);
    assert.equal(ofType(acts, 'cancel_order').length, 0);
  });

  test(`[${side}] 14. E2 khớp sau khi TP1/TR đã đặt cho E1 → đặt TP1/TR mới (lần thử 1) rồi hủy cái cũ`, () => {
    const t = mkTrade(side);
    t.legs.E1!.qty = 30;
    t.fills = [{ ...t.fills[0]!, qty: 30 }];
    t.legs.E2 = { role: 'E2', clientId: legClientId(t, 'E2', 0), attempt: 0, status: 'open', qty: 30, triggerPrice: null, orderIds: [] };
    t.legs.TP1!.qty = 15;
    t.legs.TR!.qty = 15;
    const ex: ExchangeState = {
      positions: [pos(side, 60)], openOrders: [],
      openAlgoOrders: [algo(t, 'SL'), algo(t, 'TP1', { quantity: 15 }), algo(t, 'TR', { quantity: 15 })],
      recentFills: [fillOf(t, 'E2', 30, px(side, 99), 5003)],
    };
    const acts = run([t], ex, ctx(side));
    assert.ok(ofType(acts, 'record_fill').some((r) => r.role === 'E2' && r.fill.qty === 30));
    assert.ok(ofType(acts, 'update_leg').some((u) => u.role === 'E2' && u.status === 'filled'));
    const tp = ofType(acts, 'place_tp1')[0]!;
    assert.equal(tp.input.qty, 30);
    assert.equal(tp.clientId, legClientId(t, 'TP1', 1));
    assert.equal(tp.replaces, algo(t, 'TP1').clientId);
    const iTp = acts.indexOf(tp);
    const cancelTp = acts.findIndex((a) => a.type === 'cancel_algo' && a.clientId === algo(t, 'TP1').clientId);
    assert.ok(cancelTp > iTp);
    assert.equal(ofType(acts, 'place_trailing')[0]!.input.qty, 30);
    // giá vào cho TP1/TR = giá khớp TB thật (30 @ 100 + 30 @ 99)
    assert.equal(tp.input.entryPrice, px(side, 99.5));
  });

  test(`[${side}] 15. IOC khớp một phần 7,777/60 → TP1/TR định cỡ theo khối lượng đã khớp`, () => {
    const t = mkTrade(side);
    t.fills = [];
    t.legs.E1!.status = 'open';
    t.legs.SL!.status = 'planned';
    t.legs.TP1!.status = 'planned';
    t.legs.TR!.status = 'planned';
    const ex: ExchangeState = { positions: [pos(side, 7.777)], openOrders: [], openAlgoOrders: [], recentFills: [fillOf(t, 'E1', 7.777, 100, 5100)] };
    const acts = run([t], ex, ctx(side));
    const want = exitSplit(7.777, 0.001);
    assert.equal(acts[0]!.type, 'place_stop');
    assert.equal(ofType(acts, 'place_stop')[0]!.clientId, legClientId(t, 'SL', 0));
    assert.equal(ofType(acts, 'place_tp1')[0]!.input.qty, want.tp1Qty);
    assert.equal(ofType(acts, 'place_trailing')[0]!.input.qty, want.trailQty);
    assert.equal(Number((want.tp1Qty + want.trailQty).toFixed(3)), 7.777);
    assert.ok(ofType(acts, 'update_leg').some((u) => u.role === 'E1' && u.status === 'filled'));
  });

  test(`[${side}] 16. vị thế lạ trên sàn (bot không biết) → báo + không giao dịch mã đó (kể cả lệnh của bot trên mã đó)`, () => {
    const old = mkTrade(side, { status: 'closed', closedReason: 'cũ' });
    const ex: ExchangeState = { positions: [pos(side, 5)], openOrders: [], openAlgoOrders: [algo(old, 'SL')], recentFills: [] };
    const acts = run([old], ex, ctx(side));
    assert.deepEqual(types(acts).sort(), ['adopt_unknown_position_noop', 'alert']);
    assert.equal(ofType(acts, 'alert')[0]!.level, 'urgent');
    assert.equal(ofType(acts, 'adopt_unknown_position_noop')[0]!.positionAmt, side === 'long' ? 5 : -5);
  });

  test(`[${side}] 17. vị thế NGƯỢC chiều lệnh của bot → vị thế lạ, không đụng`, () => {
    const t = mkTrade(side);
    const ex = healthy(t);
    ex.positions = [pos(side === 'long' ? 'short' : 'long', 60)];
    const acts = run([t], ex, ctx(side));
    assert.deepEqual(types(acts).filter((x) => x !== 'alert'), ['adopt_unknown_position_noop']);
  });

  test(`[${side}] 18. lệnh cục bộ cũ: E2 "open" nhưng trên sàn đã khớp / đã hủy → cập nhật trạng thái`, () => {
    const t = mkTrade(side);
    t.legs.E1!.qty = 30;
    t.fills = [{ ...t.fills[0]!, qty: 30 }];
    t.legs.E2 = { role: 'E2', clientId: legClientId(t, 'E2', 0), attempt: 0, status: 'open', qty: 30, triggerPrice: null, orderIds: [] };
    t.legs.TP1!.qty = 15;
    t.legs.TR!.qty = 15;
    const exBase = { openOrders: [], openAlgoOrders: [algo(t, 'SL'), algo(t, 'TP1', { quantity: 15 }), algo(t, 'TR', { quantity: 15 })] };
    // (a) không có khớp → đã hủy/hết hạn
    const a = run([t], { ...exBase, positions: [pos(side, 30)], recentFills: [] }, ctx(side));
    assert.deepEqual(ofType(a, 'update_leg').map((u) => [u.role, u.status]), [['E2', 'cancelled']]);
    assert.deepEqual(types(a), ['update_leg']);
    // (b) có khớp → đã khớp, ghi khớp
    const b = run([t], { ...exBase, positions: [pos(side, 60)], recentFills: [fillOf(t, 'E2', 30, 99, 5200)] }, ctx(side));
    assert.ok(ofType(b, 'update_leg').some((u) => u.role === 'E2' && u.status === 'filled'));
    assert.equal(ofType(b, 'record_fill').length, 1);
  });

  test(`[${side}] 19. lệnh vào trạng thái không rõ (unknown_status), không thấy trên sàn → tra lại, không gửi lại`, () => {
    const t = mkTrade(side, { status: 'pending', fills: [] });
    t.legs = { E1: { ...t.legs.E1!, status: 'unknown' } };
    const acts = run([t], { positions: [], openOrders: [], openAlgoOrders: [], recentFills: [] }, ctx(side));
    assert.deepEqual(types(acts), ['query_order']);
    assert.equal(ofType(acts, 'query_order')[0]!.clientId, t.legs.E1!.clientId);
  });

  test(`[${side}] 20. khớp của lệnh CŨ cùng mã không bị gán cho lệnh MỚI (Freqtrade #13399)`, () => {
    const old = mkTrade(side, { status: 'closed', closedReason: 'chạm SL' });
    const nu = mkTrade(side, { status: 'pending', fills: [], createdAt: NOW - 60_000 });
    nu.legs.E1!.status = 'open';
    nu.legs.E1!.orderIds = [4242];
    nu.legs.SL!.status = 'planned';
    nu.legs.TP1!.status = 'planned';
    nu.legs.TR!.status = 'planned';
    const ex: ExchangeState = {
      positions: [pos(side, 10)], openOrders: [], openAlgoOrders: [],
      recentFills: [
        fillOf(old, 'E1', 60, 100, 6001, T0 + 1000), // lệnh cũ (mã client cũ)
        fillOf(old, 'TP1', 30, px(side, 106), 6002, T0 + 2000, null, 1001), // orderId 1001 thuộc E1 lệnh cũ, không thuộc lệnh mới
        fillOf(nu, 'E1', 10, 100, 6003, NOW - 30_000), // lệnh mới
        fillOf(nu, 'E1', 99, 100, 6004, T0, null, 4242), // orderId của lệnh mới nhưng TRƯỚC lúc tạo lệnh → không gán
      ],
    };
    const acts = run([old, nu], ex, ctx(side));
    const rec = ofType(acts, 'record_fill');
    assert.deepEqual(rec.map((r) => [r.signalId, r.fill.tradeId]), [[nu.signalId, 6003]]);
    assert.equal(ofType(acts, 'place_tp1')[0]!.input.qty, 5);
    assert.equal(ofType(acts, 'place_trailing')[0]!.input.qty, 5);
    assert.equal(ofType(acts, 'adopt_unknown_position_noop').length, 0);
    assert.ok(acts.every((a) => !('signalId' in a) || a.signalId !== old.signalId), 'không hành động nào cho lệnh cũ');
  });

  test(`[${side}] 21. trượt giá: rủi ro thực > 2% → reduce_only về 2%, SAU khi SL đã nằm trên sàn`, () => {
    const t = mkTrade(side);
    t.fills = [{ ...t.fills[0]!, price: px(side, 100.5) }]; // 60 × (3,5 + 0,1005) = 216,03 = 2,16%
    const ex = healthy(t);
    ex.openAlgoOrders = ex.openAlgoOrders.filter((o) => !o.clientId.includes('-SL-'));
    const acts = run([t], ex, ctx(side));
    const ro = ofType(acts, 'reduce_only');
    assert.equal(ro.length, 1);
    // Long: TB 100,5, khoảng/coin = 3,5 + 0,1005 → cho phép floor(200 / 3,6005) = 55,547 → giảm 4,453
    // Short: TB 99,5, khoảng/coin = 3,5 + 0,0995 → cho phép 55,563 → giảm 4,437
    const allowed = side === 'long' ? 55.547 : 55.563;
    assert.equal(ro[0]!.qty, Number((60 - allowed).toFixed(3)));
    assert.ok(acts.findIndex((a) => a.type === 'place_stop') < acts.indexOf(ro[0]!), 'giảm vị thế chỉ sau khi đặt SL');
    // TP1/TR định cỡ lại theo khối lượng còn lại 55,548
    const want = exitSplit(allowed, 0.001);
    assert.equal(ofType(acts, 'place_tp1')[0]!.input.qty, want.tp1Qty);
    assert.equal(ofType(acts, 'place_trailing')[0]!.input.qty, want.trailQty);
  });

  test(`[${side}] 22. rủi ro thực ≤ 2% → không giảm`, () => {
    const t = mkTrade(side);
    assert.equal(ofType(run([t], healthy(t), ctx(side)), 'reduce_only').length, 0);
  });

  test(`[${side}] 23. mã client trùng đã nằm trên sàn (gửi xong nhưng chưa ghi kết quả) → không đặt lại, chỉ cập nhật`, () => {
    const t = mkTrade(side);
    t.legs.SL!.status = 'intent';
    const acts = run([t], healthy(t), ctx(side));
    assert.equal(ofType(acts, 'place_stop').length, 0);
    assert.deepEqual(ofType(acts, 'update_leg').map((u) => [u.role, u.status]), [['SL', 'open']]);
  });

  test(`[${side}] 24. SL trạng thái không rõ, không có trên sàn → TRA LẠI trước (pha đầu), không đặt lại mù trong cùng lượt`, () => {
    const t = mkTrade(side);
    t.legs.SL!.status = 'unknown';
    const ex = healthy(t);
    ex.openAlgoOrders = ex.openAlgoOrders.filter((o) => !o.clientId.includes('-SL-'));
    const acts = run([t], ex, ctx(side));
    assert.equal(acts[0]!.type, 'query_algo');
    assert.deepEqual(ofType(acts, 'query_algo').map((q) => q.clientId), [legClientId(t, 'SL', 0)]);
    assert.equal(ofType(acts, 'place_stop').length, 0);
    assert.equal(ofType(acts, 'reduce_only').length + ofType(acts, 'place_tp1').length + ofType(acts, 'place_trailing').length, 0);
    assert.ok(ofType(acts, 'alert').some((a) => a.level === 'urgent'));
  });

  test(`[${side}] 24b. tra lại xác nhận SL KHÔNG có trên sàn (gone) → lượt sau đặt SL lần thử 1, từ chối thì đóng`, () => {
    const t = mkTrade(side);
    t.legs.SL!.status = 'gone';
    const ex = healthy(t);
    ex.openAlgoOrders = ex.openAlgoOrders.filter((o) => !o.clientId.includes('-SL-'));
    const ps = ofType(run([t], ex, ctx(side)), 'place_stop');
    assert.equal(ps.length, 1);
    assert.equal(ps[0]!.clientId, legClientId(t, 'SL', 1));
    assert.equal(ps[0]!.onReject, 'market_close');
    assert.equal(ps[0]!.qty, null, 'SL gốc = closePosition');
  });

  test(`[${side}] 25. hai lần thử SL cùng nằm trên sàn → hủy lần thử cũ, giữ lần mới`, () => {
    const t = mkTrade(side);
    t.legs.SL = { ...t.legs.SL!, attempt: 1, clientId: legClientId(t, 'SL', 1) };
    const ex = healthy(t);
    ex.openAlgoOrders.push({ ...algo(t, 'SL'), clientId: legClientId(t, 'SL', 0), algoId: 555 });
    const acts = run([t], ex, ctx(side));
    assert.deepEqual(ofType(acts, 'cancel_algo').map((a) => a.clientId), [legClientId(t, 'SL', 0)]);
  });

  test(`[${side}] 26. TP1 biến mất khỏi sàn khi vị thế còn đủ → đặt lại TP1 (lần thử 1)`, () => {
    const t = mkTrade(side);
    const ex = healthy(t);
    ex.openAlgoOrders = ex.openAlgoOrders.filter((o) => !o.clientId.includes('-TP1-'));
    const acts = run([t], ex, ctx(side));
    const tp = ofType(acts, 'place_tp1');
    assert.equal(tp.length, 1);
    assert.equal(tp[0]!.clientId, legClientId(t, 'TP1', 1));
    assert.equal(tp[0]!.input.qty, 30);
    assert.ok(ofType(acts, 'update_leg').some((u) => u.role === 'TP1' && u.status === 'gone'));
  });

  test(`[${side}] 27. TP1 đã khớp mà E2 limit còn treo → hủy E2`, () => {
    const t = mkTrade(side, { tp1Filled: true, trailingActivated: true });
    t.legs.TP1!.status = 'filled';
    t.legs.E2 = { role: 'E2', clientId: legClientId(t, 'E2', 0), attempt: 0, status: 'open', qty: 30, triggerPrice: null, orderIds: [] };
    const ex: ExchangeState = { positions: [pos(side, 30)], openOrders: [entryOrder(t, 'E2')], openAlgoOrders: [algo(t, 'TR', { activated: true })], recentFills: [] };
    const acts = run([t], ex, ctx(side, 107));
    assert.deepEqual(ofType(acts, 'cancel_order').map((a) => a.clientId), [legClientId(t, 'E2', 0)]);
    assert.equal(ofType(acts, 'place_stop').length, 0, 'trailing đã kích hoạt, không cần sàn → không đặt BE');
  });

  test(`[${side}] 28. thứ tự R8: dừng (c) → vị thế lạ (d) → mồ côi (e) → cập nhật (f) → việc khác`, () => {
    const a = mkTrade(side); // thiếu SL
    const b = mkTrade(side, { status: 'closed', closedReason: 'x' });
    const other: Contract = { ...C, symbol: 'BBBUSDT' };
    const third: Contract = { ...C, symbol: 'CCCUSDT' };
    const ex: ExchangeState = {
      positions: [pos(side, 60), { ...pos(side, 1), symbol: other.symbol }],
      openOrders: [],
      openAlgoOrders: [algo(a, 'TP1'), algo(a, 'TR'), { ...algo(b, 'SL'), symbol: third.symbol }],
      recentFills: [fillOf(a, 'E1', 0.5, 100, 9999, T0 + 9000)],
    };
    const acts = run([a, b], ex, ctx(side, 100, { filters: { [C.symbol]: C, [other.symbol]: other, [third.symbol]: third } }));
    const first = (k: Action['type']) => acts.findIndex((x) => x.type === k);
    assert.ok(first('place_stop') < first('adopt_unknown_position_noop'));
    assert.ok(first('adopt_unknown_position_noop') < first('cancel_algo'));
    assert.ok(first('cancel_algo') < first('record_fill'));
  });
}

for (const side of SIDES) {
  const tp1Done = (over: Partial<TradeState> = {}) => {
    const t = mkTrade(side, { tp1Filled: true, ...over });
    t.legs.TP1!.status = 'filled';
    return t;
  };
  const exAfterTp1 = (t: TradeState): ExchangeState => ({ positions: [pos(side, 30)], openOrders: [], openAlgoOrders: [algo(t, 'SL'), algo(t, 'TR')], recentFills: [] });

  test(`[${side}] 31. stopReplace = cancel_then_place (cấu hình) → hủy SL trước, đặt BE NGAY SAU, từ chối thì đóng`, () => {
    const t = tp1Done();
    const acts = run([t], exAfterTp1(t), ctx(side, 105, { stopReplace: 'cancel_then_place' }));
    const nonAlert = acts.filter((a) => a.type !== 'alert');
    assert.deepEqual(types(nonAlert), ['cancel_algo', 'place_stop']);
    const c = nonAlert[0] as Extract<Action, { type: 'cancel_algo' }>;
    const p = nonAlert[1] as Extract<Action, { type: 'place_stop' }>;
    assert.equal(c.clientId, algo(t, 'SL').clientId);
    assert.equal(c.replacedBy, p.clientId);
    assert.equal(c.onlyAfterPlaced, null);
    assert.equal(p.onReject, 'market_close');
    assert.equal(p.role, 'BE');
  });

  test(`[${side}] 32. BE từng bị từ chối khi thay (stop_replace_rejected) → lượt sau tự chuyển sang cancel_then_place`, () => {
    const t = tp1Done({ stopReplaceFallback: true });
    t.legs.BE = { role: 'BE', clientId: legClientId(t, 'BE', 0), attempt: 0, status: 'rejected', qty: 30, triggerPrice: px(side, 100.1), orderIds: [] };
    const acts = run([t], exAfterTp1(t), ctx(side, 105));
    const nonAlert = acts.filter((a) => a.type !== 'alert');
    assert.deepEqual(types(nonAlert), ['cancel_algo', 'place_stop']);
    assert.equal((nonAlert[1] as { clientId: string }).clientId, legClientId(t, 'BE', 1));
  });

  test(`[${side}] 33. mọi nhánh đóng khẩn HỦY lệnh vào còn treo (E1/E2) TRƯỚC market_close`, () => {
    const withE2 = (t: TradeState) => {
      t.legs.E2 = { role: 'E2', clientId: legClientId(t, 'E2', 0), attempt: 0, status: 'open', qty: 30, triggerPrice: null, orderIds: [] };
      return t;
    };
    const check = (name: string, t: TradeState, ex: ExchangeState, c: ReconcileCtx) => {
      ex.openOrders = [entryOrder(t, 'E2'), { ...entryOrder(t, 'E1'), type: 'LIMIT' }];
      const acts = run([t], ex, c);
      const iClose = acts.findIndex((a) => a.type === 'market_close');
      assert.ok(iClose >= 0, `${name}: phải đóng — ${types(acts)}`);
      const cancelled = acts.slice(0, iClose).filter((a) => a.type === 'cancel_order').map((a) => (a as { clientId: string }).clientId).sort();
      assert.deepEqual(cancelled, [legClientId(t, 'E1', 0), legClientId(t, 'E2', 0)].sort(), name);
      assert.equal(ofType(acts, 'cancel_order').length, 2, `${name}: không hủy hai lần`);
    };
    const noSl = (t: TradeState) => ({ ...healthy(t), openAlgoOrders: [algo(t, 'TP1'), algo(t, 'TR')] });
    let t = withE2(mkTrade(side));
    check('thiếu bộ lọc', t, noSl(t), ctx(side, 100, { filters: {} }));
    t = withE2(mkTrade(side));
    check('thiếu giá mark', t, noSl(t), ctx(side, 100, { markPrices: {} }));
    t = withE2(mkTrade(side));
    check('mark đã qua SL', t, noSl(t), ctx(side, 96.5));
    t = withE2(tp1Done());
    check('mark đã qua sàn hòa vốn', t, exAfterTp1(t), ctx(side, 100.05));
    t = withE2(mkTrade(side));
    t.fills = [{ ...t.fills[0]!, price: px(side, 100.5) }];
    check('rủi ro không giảm được', t, healthy(t), ctx(side, 100, { capital: 0.01 }));
  });

  test(`[${side}] 34. stop_rejected: place_stop mang danh sách lệnh vào phải hủy TRƯỚC khi đóng market`, () => {
    const t = mkTrade(side);
    t.legs.E2 = { role: 'E2', clientId: legClientId(t, 'E2', 0), attempt: 0, status: 'open', qty: 30, triggerPrice: null, orderIds: [] };
    const ex = { ...healthy(t), openOrders: [entryOrder(t, 'E2')], openAlgoOrders: [algo(t, 'TP1'), algo(t, 'TR')] };
    const ps = ofType(run([t], ex, ctx(side)), 'place_stop')[0]!;
    assert.equal(ps.onReject, 'market_close');
    assert.deepEqual(ps.onRejectCancelEntries.map((e) => e.clientId), [legClientId(t, 'E2', 0)]);
  });

  test(`[${side}] 35. (rà soát #2) lệnh A đang mở (khớp chỉ có trong nhật ký) + lệnh B mới hơn đang chờ → vị thế vẫn của A, không đóng A`, () => {
    const a = mkTrade(side);
    const b = mkTrade(side, { status: 'pending', fills: [], createdAt: NOW - 60_000 });
    b.legs = { E1: { ...b.legs.E1!, status: 'open', orderIds: [] }, SL: { ...b.legs.SL!, status: 'planned' } };
    const ex = { ...healthy(a), openOrders: [entryOrder(b, 'E1')] };
    const acts = run([a, b], ex, ctx(side));
    assert.equal(ofType(acts, 'mark_trade_closed').length, 0);
    assert.equal(acts.some((x) => x.type === 'cancel_algo' || x.type === 'place_stop' || x.type === 'place_tp1'), false, JSON.stringify(types(acts)));
  });

  test(`[${side}] 36. hai lệnh cùng mã đều có khớp → mơ hồ: báo khẩn + khóa mã, không đụng lệnh nào`, () => {
    const a = mkTrade(side);
    const b = mkTrade(side, { status: 'pending', fills: [], createdAt: NOW - 60_000 });
    b.legs = { E1: { ...b.legs.E1!, status: 'open', orderIds: [] } };
    const ex = { ...healthy(a), recentFills: [fillOf(b, 'E1', 5, 100, 8001, NOW - 30_000)] };
    const acts = run([a, b], ex, ctx(side));
    assert.deepEqual(types(acts).sort(), ['alert', 'block_symbol']);
    assert.equal(ofType(acts, 'alert')[0]!.level, 'urgent');
  });
}

test('30. TP1 trạng thái không rõ, không thấy trên sàn → tra lại, KHÔNG đặt lại TP1 mù', () => {
  const t = mkTrade('short');
  t.legs.TP1!.status = 'unknown';
  const ex = healthy(t);
  ex.openAlgoOrders = ex.openAlgoOrders.filter((o) => !o.clientId.includes('-TP1-'));
  const acts = run([t], ex, ctx('short'));
  assert.equal(ofType(acts, 'place_tp1').length, 0);
  assert.deepEqual(ofType(acts, 'query_algo').map((q) => q.clientId), [legClientId(t, 'TP1', 0)]);
});

test('29. thiếu bộ lọc sàn của mã → không dựng được lệnh dừng → market_close khẩn', () => {
  const t = mkTrade('long');
  const ex = healthy(t);
  ex.openAlgoOrders = [];
  const acts = run([t], ex, ctx('long', 100, { filters: {} }));
  assert.equal(ofType(acts, 'market_close').length, 1);
  assert.equal(ofType(acts, 'place_stop').length, 0);
});
