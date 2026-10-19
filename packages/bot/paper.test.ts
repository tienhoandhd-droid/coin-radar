import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPaperExchange, type PaperOptions } from './paper.ts';
import { exitSplit, planOrders, type PlannerInput, type PlannerPlan, type PlannerResult } from './planner.ts';
import { executeActions, type ExecutorCtx } from './executor.ts';
import { applyEvent, emptyState, type JournalEvent, type JournalEventBody } from './journal.ts';
import { legClientId, type Action, type TradeState } from './reconcile.ts';
import { makeClientId, type ClientIdParts, type OrderResult } from '../binance/orders.ts';
import type { UserEvent } from '../binance/stream.ts';
import { trailingFor } from '../core/exit.ts';
import type { Candle, Contract, Side } from '../core/types.ts';
import { createTrade, advanceTrade, tradeRecord, type SimCost } from '../../backtest/simulate.ts';
import { exitFee, entryFee, exitExecX, fundingAmount, trailStopX, type FillCost } from './fill-model.ts';

// Sàn giả lập (B7): cùng giao diện orders.ts (createOrders trên api giả), khớp theo giá MARK / nến, công thức từ fill-model.ts.
// Không request nào rời máy; trạng thái lưu vào thư mục tạm.
const C: Contract = {
  symbol: 'AAAUSDT', baseAsset: 'AAA', onboardDate: 0, tickSize: 0.01, stepSize: 0.001, minQty: 0.001, maxQty: 1e6,
  marketMinQty: 0.001, marketMaxQty: 1e6, marketStepSize: 0.001, minNotional: 5, maxNumOrders: 200, deliveryDate: 4133894400000,
};
const T0 = Date.UTC(2026, 6, 1);
const S = 1_000;
const M5 = 5 * 60_000;
const NO_IMPACT: FillCost = { tierPct: 0.1, impactPct: 0.5, vol1m: Infinity };
const SIDES: Side[] = ['long', 'short'];
// Giá đối xứng quanh 100: Long dùng x, Short dùng 200 − x → cùng một kịch bản cho hai chiều
const px = (side: Side, x: number) => Number((side === 'long' ? x : 200 - x).toFixed(2));
const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

function setup(over: Partial<PaperOptions> = {}) {
  const clock = { t: T0 };
  const ex = createPaperExchange({
    contracts: { [C.symbol]: C }, cost: () => NO_IMPACT, startBalance: 10_000, statePath: null, now: () => clock.t, defaultLeverage: 5, ...over,
  });
  const events: UserEvent[] = [];
  ex.onUserEvent((e) => events.push(e));
  let tick = 0;
  // Một nhịp giá mark: giờ sự kiện tăng dần, sau giờ đặt lệnh
  const mark = (price: number) => { clock.t += S; tick++; ex.feedMark(C.symbol, { price, eventTime: clock.t }); };
  return { ex, o: ex.orders, clock, events, mark, ticks: () => tick };
}

const id = (leg: string, attempt = 0, signalId = 'sig-1'): ClientIdParts => ({ runId: 'r1', signalId, leg, attempt });
const pos = (ex: ReturnType<typeof createPaperExchange>) => ex.snapshot().positions.find((p) => p.symbol === C.symbol)?.positionAmt ?? 0;
const body = (r: OrderResult) => r.body as Record<string, unknown>;

async function api(ex: ReturnType<typeof createPaperExchange>, method: 'GET' | 'POST' | 'DELETE', path: string, params: Record<string, string>) {
  return ex.api.request({ method, path, params, createsOrder: method === 'POST' });
}

// ---------- Lệnh vào kiểu market (LIMIT IOC giá trần) ----------
for (const side of SIDES) {
  test(`${side}: chân "market" = LIMIT IOC khớp ở nhịp mark KẾ TIẾP, chỉ trong giá trần; phản hồi RESULT chờ tới nhịp đó`, async () => {
    const { ex, o, mark, events } = setup();
    mark(px(side, 100));
    const w0 = ex.snapshot().wallet;
    const p = o.placeEntry({ contract: C, side, kind: 'limit', ioc: true, limitPrice: px(side, 101), qty: 10, id: id('E1'), openCount: 0, reserveSlots: 4 });
    mark(px(side, 100.5)); // nhịp kế tiếp, trong giá trần
    const r = await p;
    assert.equal(r.kind, 'ok');
    assert.equal(body(r).status, 'FILLED');
    assert.equal(body(r).executedQty, '10.000');
    assert.equal(pos(ex), side === 'long' ? 10 : -10);
    // Phí vào = nửa phí nhóm × notional (fill-model.entryFee)
    close(ex.snapshot().wallet, w0 - entryFee(10, px(side, 100.5), NO_IMPACT, false));
    const tr = events.filter((e) => e.type === 'order_update' && e.order.executionType === 'TRADE');
    assert.equal(tr.length, 1);
    const ou = tr[0]!;
    assert.ok(ou.type === 'order_update');
    assert.equal(ou.order.clientOrderId, makeClientId(id('E1')));
    assert.equal(ou.order.lastFilledPrice, px(side, 100.5));
    assert.equal(ou.order.side, side === 'long' ? 'BUY' : 'SELL');
    assert.ok(events.some((e) => e.type === 'account_update' && e.reason === 'ORDER' && e.positions[0]!.positionAmt === (side === 'long' ? 10 : -10)));
  });

  test(`${side}: LIMIT IOC — nhịp kế tiếp đã vượt giá trần → không khớp (EXPIRED), không có vị thế`, async () => {
    const { ex, o, mark } = setup();
    mark(px(side, 100));
    const p = o.placeEntry({ contract: C, side, kind: 'limit', ioc: true, limitPrice: px(side, 101), qty: 10, id: id('E1'), openCount: 0, reserveSlots: 4 });
    mark(px(side, 101.5));
    const r = await p;
    assert.equal(body(r).status, 'EXPIRED');
    assert.equal(body(r).executedQty, '0.000');
    assert.equal(pos(ex), 0);
  });

  test(`${side}: LIMIT GTC chờ, chỉ khớp khi giá đi qua mức limit (khớp ĐÚNG giá limit khi quét nến)`, async () => {
    const { ex, o, mark, clock } = setup();
    mark(px(side, 100));
    const r = await o.placeEntry({ contract: C, side, kind: 'limit', limitPrice: px(side, 98), qty: 10, id: id('E2'), openCount: 0, reserveSlots: 4 });
    assert.equal(body(r).status, 'NEW');
    mark(px(side, 99));
    assert.equal(pos(ex), 0);
    // Mất mark (nến không có nhịp mark nào) → quét nến: Long low 97,5 ≤ 98 → khớp ở 98 (Short đối xứng: high 102,5 ≥ 102)
    const t = clock.t + M5;
    const bar: Candle = { openTime: t, closeTime: t + M5 - 1, open: px(side, 99), high: Math.max(px(side, 99.5), px(side, 97.5)), low: Math.min(px(side, 99.5), px(side, 97.5)), close: px(side, 98.5), volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 };
    ex.feedKline(C.symbol, bar);
    assert.equal(pos(ex), side === 'long' ? 10 : -10);
    const q = await o.queryOrder(C.symbol, { clientId: makeClientId(id('E2')) });
    assert.equal(body(q).status, 'FILLED');
    assert.equal(body(q).avgPrice, String(px(side, 98)));
  });

  test(`${side}: SL STOP_MARKET closePosition kích hoạt theo giá MARK (không theo nến đã có mark phủ), đóng TOÀN BỘ vị thế`, async () => {
    const { ex, o, mark, events, clock } = setup();
    mark(px(side, 100));
    const e = o.placeEntry({ contract: C, side, kind: 'market', refPrice: px(side, 100), qty: 10, id: id('E1'), openCount: 0, reserveSlots: 4 });
    mark(px(side, 100));
    await e;
    const sl = await o.placeStopLoss({ contract: C, side, markPrice: px(side, 100), triggerPrice: px(side, 95), purpose: 'initial', id: id('SL') });
    assert.equal(sl.kind, 'ok');
    assert.equal(body(sl).algoStatus, 'NEW');
    // Nến (giá giao dịch) có râu xuyên SL nhưng mark đã phủ nến này → KHÔNG kích hoạt
    const t = clock.t - 2 * S;
    ex.feedKline(C.symbol, { openTime: t, closeTime: t + M5 - 1, open: px(side, 100), high: Math.max(px(side, 100), px(side, 94)), low: Math.min(px(side, 100), px(side, 94)), close: px(side, 100), volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 });
    assert.equal(pos(ex), side === 'long' ? 10 : -10);
    mark(px(side, 96));
    assert.equal(pos(ex), side === 'long' ? 10 : -10);
    mark(px(side, 94.9)); // mark xuyên SL: khớp ở giá nhịp đó (lệnh market sau kích hoạt)
    assert.equal(pos(ex), 0);
    const q = await o.queryAlgo({ clientId: makeClientId(id('SL')) });
    assert.equal(body(q).algoStatus, 'FINISHED');
    const algo = events.filter((x) => x.type === 'algo_update').map((x) => x.type === 'algo_update' ? x.algo.status : '');
    assert.deepEqual(algo, ['NEW', 'TRIGGERED', 'FINISHED']);
    const fin = events.find((x) => x.type === 'algo_update' && x.algo.status === 'FINISHED');
    assert.ok(fin?.type === 'algo_update');
    assert.equal(fin.algo.workingType, 'MARK_PRICE');
    assert.equal(fin.algo.closePosition, true);
    assert.equal(fin.algo.avgPrice, px(side, 94.9));
    // Lệnh thật sinh ra nối bằng ai ↔ orderId (tài liệu không nói mã client của lệnh thật)
    const trade = events.filter((x) => x.type === 'order_update' && x.order.executionType === 'TRADE').at(-1);
    assert.ok(trade?.type === 'order_update');
    assert.equal(trade.order.orderId, fin.algo.actualOrderId);
    assert.equal(trade.order.origType, 'STOP_MARKET');
  });

  test(`${side}: TP1 TAKE_PROFIT_MARKET reduce-only chốt MỘT PHẦN; trailing kích hoạt tại activatePrice, theo đỉnh mark, đóng khi hồi callback`, async () => {
    const { ex, o, mark, events } = setup();
    mark(px(side, 100));
    const e = o.placeEntry({ contract: C, side, kind: 'limit', ioc: true, limitPrice: px(side, 100.5), qty: 10, id: id('E1'), openCount: 0, reserveSlots: 4 });
    mark(px(side, 100));
    await e;
    const w0 = ex.snapshot().wallet;
    const { tp1Qty, trailQty } = exitSplit(10, 0.001);
    assert.equal((await o.placeStopLoss({ contract: C, side, markPrice: px(side, 100), triggerPrice: px(side, 95), purpose: 'initial', id: id('SL') })).kind, 'ok');
    assert.equal((await o.placeTakeProfit({ contract: C, side, entryPrice: px(side, 100), triggerPrice: px(side, 110), qty: tp1Qty, id: id('TP1'), openCount: 1 })).kind, 'ok');
    assert.equal((await o.placeTrailing({ contract: C, side, entryPrice: px(side, 100), activatePrice: px(side, 110), callbackPct: 2, qty: trailQty, id: id('TR'), openCount: 2 })).kind, 'ok');
    mark(px(side, 109.99));
    assert.equal(pos(ex), side === 'long' ? 10 : -10);
    mark(px(side, 110)); // TP1 khớp 5, trailing kích hoạt cùng nhịp
    assert.equal(pos(ex), side === 'long' ? 5 : -5);
    const ia = events.filter((x) => x.type === 'algo_update' && x.algo.clientAlgoId === makeClientId(id('TR')));
    assert.deepEqual(ia.map((x) => x.type === 'algo_update' ? [x.algo.status, x.algo.activated] : []), [['NEW', false], ['NEW', true]]);
    mark(px(side, 115)); // đỉnh mới → dừng = 115 × 0,98 = 112,7 (Short: đáy 85 × 1,02 = 86,7)
    const stop = side === 'long' ? trailStopX(1, 115, 2) : -trailStopX(-1, -85, 2);
    assert.equal(stop, side === 'long' ? 112.7 : 86.7);
    mark(side === 'long' ? 112.71 : 86.69);
    assert.equal(pos(ex), side === 'long' ? 5 : -5);
    mark(stop); // chạm mức dừng trailing
    assert.equal(pos(ex), 0);
    // Sổ: lãi gộp TP1 + trailing − phí ra (fill-model)
    const d = side === 'long' ? 1 : -1;
    const g1 = (exitExecX(d, d * px(side, 110), 5, NO_IMPACT) - d * px(side, 100)) * 5;
    const g2 = (exitExecX(d, d * stop, 5, NO_IMPACT) - d * px(side, 100)) * 5;
    const fee = exitFee(5, px(side, 110), NO_IMPACT) + exitFee(5, stop, NO_IMPACT);
    close(ex.snapshot().wallet, w0 + g1 + g2 - fee);
    // SL closePosition vẫn còn trên sàn (bot tự hủy lệnh mồ côi) — sàn không tự hủy
    const open = await o.openAlgoOrders(C.symbol);
    assert.deepEqual((open.body as Array<Record<string, unknown>>).map((x) => x.clientAlgoId), [makeClientId(id('SL'))]);
  });

  test(`${side}: funding trừ/cộng ví theo dấu (Long trả khi rate > 0, Short nhận), chỉ khi vị thế mở TRƯỚC giờ chốt`, async () => {
    const { ex, o, mark, events, clock } = setup();
    mark(px(side, 100));
    const ft0 = clock.t; // chốt TRƯỚC khi có vị thế → không tính
    const e = o.placeEntry({ contract: C, side, kind: 'market', refPrice: px(side, 100), qty: 10, id: id('E1'), openCount: 0, reserveSlots: 4 });
    mark(px(side, 100));
    await e;
    ex.feedFunding({ symbol: C.symbol, fundingTime: ft0, fundingRate: 0.001, markPrice: 100 });
    const w0 = ex.snapshot().wallet;
    ex.feedFunding({ symbol: C.symbol, fundingTime: clock.t + 60_000, fundingRate: 0.001, markPrice: 100 });
    const amt = fundingAmount(side === 'long' ? 1 : -1, 10, 100, 0.001);
    assert.equal(amt, side === 'long' ? -1 : 1);
    close(ex.snapshot().wallet, w0 + amt);
    const fe = events.filter((x) => x.type === 'account_update' && x.reason === 'FUNDING_FEE');
    assert.equal(fe.length, 1);
    assert.ok(fe[0]!.type === 'account_update');
    close(fe[0]!.balances[0]!.balanceChange!, amt);
    // Cùng kỳ chốt gửi lại → không tính hai lần
    ex.feedFunding({ symbol: C.symbol, fundingTime: clock.t + 60_000, fundingRate: 0.001, markPrice: 100 });
    close(ex.snapshot().wallet, w0 + amt);
    const inc = await api(ex, 'GET', '/fapi/v1/income', { symbol: C.symbol, incomeType: 'FUNDING_FEE' });
    assert.equal((inc.body as unknown[]).length, 1);
  });

  test(`${side}: reduce-only không được tăng vị thế — đóng market khi chưa có vị thế / cùng chiều → -2022; TP kích hoạt khi vị thế đã đóng → REJECTED`, async () => {
    const { ex, o, mark, events } = setup();
    mark(px(side, 100));
    const r = await o.closeMarket({ contract: C, side, qty: 5, id: id('MC') });
    assert.equal(r.kind, 'rejected');
    assert.equal(r.code, -2022);
    const e = o.placeEntry({ contract: C, side, kind: 'market', refPrice: px(side, 100), qty: 10, id: id('E1'), openCount: 0, reserveSlots: 4 });
    mark(px(side, 100));
    await e;
    // Lệnh reduce-only cùng chiều vị thế (sẽ TĂNG vị thế) → -2022
    const other: Side = side === 'long' ? 'short' : 'long';
    const r2 = await o.closeMarket({ contract: C, side: other, qty: 5, id: id('MC', 1) });
    assert.equal(r2.code, -2022);
    // Đóng market lớn hơn vị thế → chỉ đóng phần đang có
    assert.equal((await o.placeTakeProfit({ contract: C, side, entryPrice: px(side, 100), triggerPrice: px(side, 110), qty: 5, id: id('TP1'), openCount: 0 })).kind, 'ok');
    const c = o.closeMarket({ contract: C, side, qty: 20, id: id('MC', 2) });
    mark(px(side, 101));
    const cr = await c;
    assert.equal(cr.kind, 'ok');
    assert.equal(body(cr).executedQty, '10.000');
    assert.equal(pos(ex), 0);
    mark(px(side, 110)); // TP reduce-only kích hoạt khi không còn vị thế → sàn từ chối lúc kích hoạt
    const tp = events.filter((x) => x.type === 'algo_update' && x.algo.clientAlgoId === makeClientId(id('TP1'))).at(-1);
    assert.ok(tp?.type === 'algo_update');
    assert.equal(tp.algo.status, 'REJECTED');
    assert.equal(tp.algo.rejectReason, 'Reduce Only reject');
    assert.equal(pos(ex), 0);
  });

  test(`${side}: tiêm unknown_status — lệnh dừng CÓ lên sàn (apply) thì tra lại thấy NEW; không lên sàn thì tra -2013`, async () => {
    const { ex, o, mark } = setup();
    mark(px(side, 100));
    const e = o.placeEntry({ contract: C, side, kind: 'market', refPrice: px(side, 100), qty: 10, id: id('E1'), openCount: 0, reserveSlots: 4 });
    mark(px(side, 100));
    await e;
    const timeout = { code: -1007, msg: 'Timeout waiting for response from backend server. Send status unknown; execution status unknown.' };
    ex.inject({ match: (q) => q.method === 'POST' && q.path === '/fapi/v1/algoOrder', status: 503, body: timeout, apply: true });
    const r = await o.placeStopLoss({ contract: C, side, markPrice: px(side, 100), triggerPrice: px(side, 95), purpose: 'initial', id: id('SL') });
    assert.equal(r.kind, 'unknown_status');
    assert.equal(body(await o.queryAlgo({ clientId: makeClientId(id('SL')) })).algoStatus, 'NEW');
    ex.inject({ match: (q) => q.method === 'POST' && q.path === '/fapi/v1/algoOrder', status: 503, body: timeout, apply: false });
    const r2 = await o.placeStopLoss({ contract: C, side, markPrice: px(side, 100), triggerPrice: px(side, 96), purpose: 'initial', id: id('SL', 1) });
    assert.equal(r2.kind, 'unknown_status');
    const q2 = await o.queryAlgo({ clientId: makeClientId(id('SL', 1)) });
    assert.equal(q2.kind, 'rejected');
    assert.equal(q2.code, -2013);
    // Tiêm một lần: lần sau bình thường
    assert.equal((await o.placeStopLoss({ contract: C, side, markPrice: px(side, 100), triggerPrice: px(side, 96), purpose: 'initial', id: id('SL', 2) })).kind, 'ok');
  });

  test(`${side}: executor gặp unknown_status thật sự trên sàn giả lập — tra lại, vắng → đặt lại lần thử mới, vị thế có dừng`, async () => {
    const { ex, o, mark } = setup();
    mark(px(side, 100));
    const e = o.placeEntry({ contract: C, side, kind: 'market', refPrice: px(side, 100), qty: 10, id: id('E1'), openCount: 0, reserveSlots: 4 });
    mark(px(side, 100));
    await e;
    ex.inject({ match: (q) => q.method === 'POST' && q.path === '/fapi/v1/algoOrder', status: 503, body: { code: -1007, msg: 'Timeout' }, apply: false });
    const t: TradeState = {
      signalId: 'sig-1', symbol: C.symbol, side, runId: 'r1', createdAt: T0 - 1, status: 'open', closedReason: null,
      plan: { stop: px(side, 95), tp1: px(side, 110), activatePrice: px(side, 110), callbackPct: 2, costPct: 0.1, needsBreakevenFloor: false, leverage: 5, qtyStep: 0.001, tp1Pct: 50, limitCancelAt: null },
      legs: {}, fills: [], tp1Filled: false, trailingActivated: false, stopReplaceFallback: false,
    };
    t.legs = { SL: { role: 'SL', clientId: legClientId(t, 'SL', 0), attempt: 0, status: 'planned', qty: null, triggerPrice: px(side, 95), orderIds: [] } };
    const state = emptyState();
    state.trades[t.signalId] = t;
    const journal = {
      state: () => state,
      append(b: JournalEventBody): JournalEvent {
        const ev = { seq: state.seq + 1, at: T0, ...b } as JournalEvent;
        applyEvent(state, structuredClone(ev), () => {});
        return ev;
      },
    };
    const sl = legClientId(t, 'SL', 0);
    const action: Action = {
      type: 'place_stop', symbol: C.symbol, signalId: t.signalId, role: 'SL', purpose: 'initial', clientId: sl,
      input: { contract: C, side, markPrice: px(side, 100), triggerPrice: px(side, 95), purpose: 'initial', id: { runId: 'r1', signalId: t.signalId, leg: 'SL', attempt: 0 } },
      qty: null, replaces: null, onReject: 'market_close', onRejectCancelEntries: [], reason: 'test',
    };
    const alerts: string[] = [];
    const ctx: ExecutorCtx = {
      orders: o, journal, runId: 'r1', pass: 1, positions: [{ symbol: C.symbol, positionAmt: pos(ex), entryPrice: 100, liquidationPrice: null }],
      filters: { [C.symbol]: C }, notify: (a) => alerts.push(a.text), sleep: async () => {},
    };
    const rep = await executeActions([action], ctx);
    assert.deepEqual(rep.unprotected, []);
    assert.deepEqual(rep.closedSymbols, []);
    const open = (await o.openAlgoOrders(C.symbol)).body as Array<Record<string, unknown>>;
    assert.deepEqual(open.map((x) => x.clientAlgoId), [makeClientId({ runId: 'r1', signalId: t.signalId, leg: 'SL', attempt: 1 })]);
    assert.equal(pos(ex), side === 'long' ? 10 : -10);
  });

  test(`${side}: khởi động lại giữa lệnh — trạng thái lưu nguyên tử, khôi phục y nguyên; lệnh lẽ ra kích hoạt lúc tắt được xét theo nến nhận SAU khi chạy lại`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'paper-'));
    const statePath = join(dir, 'bot', 'paper-state.json');
    const a = setup({ statePath });
    a.mark(px(side, 100));
    const e = a.o.placeEntry({ contract: C, side, kind: 'market', refPrice: px(side, 100), qty: 10, id: id('E1'), openCount: 0, reserveSlots: 4 });
    a.mark(px(side, 100));
    await e;
    await a.o.placeStopLoss({ contract: C, side, markPrice: px(side, 100), triggerPrice: px(side, 95), purpose: 'initial', id: id('SL') });
    await a.o.placeEntry({ contract: C, side, kind: 'limit', limitPrice: px(side, 97), qty: 2, id: id('E2'), openCount: 1, reserveSlots: 1 });
    assert.ok(existsSync(statePath));
    assert.deepEqual(readdirSync(join(dir, 'bot')), ['paper-state.json']); // không sót tệp tạm
    const saved = JSON.parse(readFileSync(statePath, 'utf8')) as { version: number };
    assert.equal(saved.version, 1);
    const snapA = a.ex.snapshot();
    const lastMarkT = a.clock.t;

    // "Tắt máy": tạo sàn mới từ cùng tệp
    const b = setup({ statePath });
    b.clock.t = lastMarkT + 30 * M5;
    assert.deepEqual(b.ex.snapshot(), snapA);
    assert.equal(body(await b.o.queryAlgo({ clientId: makeClientId(id('SL')) })).algoStatus, 'NEW');
    // Nến lúc tắt máy (không có mark): nến 1 đi qua limit E2 (97), nến 2 xuyên SL (95) → khớp đúng mức
    const t1 = lastMarkT + M5;
    const bar = (t: number, o: number, h: number, l: number, c: number): Candle => {
      const [hi, lo] = side === 'long' ? [h, l] : [200 - l, 200 - h];
      return { openTime: t, closeTime: t + M5 - 1, open: px(side, o), high: Number(hi.toFixed(2)), low: Number(lo.toFixed(2)), close: px(side, c), volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 };
    };
    b.ex.feedKline(C.symbol, bar(t1, 99, 99.5, 96.5, 97.5));
    assert.equal(pos(b.ex), side === 'long' ? 12 : -12);
    b.ex.feedKline(C.symbol, bar(t1 + M5, 97, 97.5, 94, 94.5));
    assert.equal(pos(b.ex), 0);
    const trades = (await api(b.ex, 'GET', '/fapi/v1/userTrades', { symbol: C.symbol })).body as Array<Record<string, unknown>>;
    assert.deepEqual(trades.map((x) => x.price), [String(px(side, 100)), String(px(side, 97)), String(px(side, 95))]);
    // Mark nhận sau đó không xét lại nến cũ; nến cũ gửi lại không quét lần nữa
    b.ex.feedKline(C.symbol, bar(t1 + M5, 97, 97.5, 94, 94.5));
    assert.equal(((await api(b.ex, 'GET', '/fapi/v1/userTrades', { symbol: C.symbol })).body as unknown[]).length, 3);
  });
}

// ---------- Luật sàn (bộ lọc, closePosition, giới hạn số lệnh) — gửi thẳng request, bỏ qua kiểm tại chỗ của orders.ts ----------
test('bộ lọc sàn: tick (-4014), bước khối lượng (-4023), minQty (-4004), MIN_NOTIONAL (-4164, reduce-only được miễn), lệnh điều kiện qua /order (-4120)', async () => {
  const { ex, mark } = setup();
  mark(100);
  const base = { symbol: C.symbol, side: 'BUY', type: 'LIMIT', timeInForce: 'GTC', newClientOrderId: 'x1' };
  assert.equal((await api(ex, 'POST', '/fapi/v1/order', { ...base, price: '99.995', quantity: '1' })).code, -4014);
  assert.equal((await api(ex, 'POST', '/fapi/v1/order', { ...base, price: '99.99', quantity: '1.0005' })).code, -4023);
  assert.equal((await api(ex, 'POST', '/fapi/v1/order', { ...base, price: '99.99', quantity: '0' })).code, -4003);
  assert.equal((await api(ex, 'POST', '/fapi/v1/order', { ...base, price: '99.99', quantity: '0.04' })).code, -4164);
  assert.equal((await api(ex, 'POST', '/fapi/v1/order', { ...base, type: 'STOP_MARKET', quantity: '1' })).code, -4120);
  assert.equal((await api(ex, 'POST', '/fapi/v1/order', { ...base, price: '99.99', quantity: '1', positionSide: 'LONG' })).code, -4061);
  const small = { ...C, minQty: 0.01 };
  const ex2 = setup({ contracts: { [C.symbol]: small } });
  ex2.mark(100);
  assert.equal((await api(ex2.ex, 'POST', '/fapi/v1/order', { ...base, price: '99.99', quantity: '0.005' })).code, -4004);
  assert.equal((await api(ex, 'POST', '/fapi/v1/order', { ...base, symbol: 'ZZZUSDT', price: '1', quantity: '10' })).code, -1121);
});

test('mã client: trùng trong số lệnh đang mở → -4116; sau khi lệnh cũ đóng thì dùng lại được', async () => {
  const { ex, mark } = setup();
  mark(100);
  const p = { symbol: C.symbol, side: 'BUY', type: 'LIMIT', timeInForce: 'GTC', price: '90', quantity: '1', newClientOrderId: 'dup-1' };
  assert.equal((await api(ex, 'POST', '/fapi/v1/order', p)).kind, 'ok');
  assert.equal((await api(ex, 'POST', '/fapi/v1/order', p)).code, -4116);
  assert.equal((await api(ex, 'DELETE', '/fapi/v1/order', { symbol: C.symbol, origClientOrderId: 'dup-1' })).kind, 'ok');
  assert.equal((await api(ex, 'DELETE', '/fapi/v1/order', { symbol: C.symbol, origClientOrderId: 'dup-1' })).code, -2011);
  assert.equal((await api(ex, 'POST', '/fapi/v1/order', p)).kind, 'ok');
});

test('closePosition: không đi cùng quantity (-4137) / reduceOnly (-4138); kích hoạt đóng toàn bộ vị thế HIỆN TẠI kể cả phần vào sau', async () => {
  const { ex, o, mark } = setup();
  mark(100);
  const a = { algoType: 'CONDITIONAL', symbol: C.symbol, side: 'SELL', type: 'STOP_MARKET', triggerPrice: '95.00', workingType: 'MARK_PRICE', closePosition: 'true', clientAlgoId: 'cp-1' };
  assert.equal((await api(ex, 'POST', '/fapi/v1/algoOrder', { ...a, quantity: '1' })).code, -4137);
  assert.equal((await api(ex, 'POST', '/fapi/v1/algoOrder', { ...a, reduceOnly: 'true' })).code, -4138);
  assert.equal((await api(ex, 'POST', '/fapi/v1/algoOrder', { ...a, triggerPrice: '100.50' })).code, -4142); // SELL stop trên giá mark → kích hoạt ngay
  assert.equal((await api(ex, 'POST', '/fapi/v1/algoOrder', { ...a, workingType: 'CONTRACT_PRICE' })).kind, 'rejected'); // sàn giả lập chỉ khớp theo MARK
  assert.equal((await api(ex, 'POST', '/fapi/v1/algoOrder', a)).kind, 'ok');
  for (const [i, q] of [[0, 3], [1, 4]] as const) {
    const e = o.placeEntry({ contract: C, side: 'long', kind: 'market', refPrice: 100, qty: q, id: id(`E${i + 1}`), openCount: 0, reserveSlots: 3 });
    mark(100);
    await e;
  }
  assert.equal(pos(ex), 7);
  mark(94);
  assert.equal(pos(ex), 0);
});

test('trailing: activatePrice đã ở phía sai giá mark → -2021; callbackRate ngoài [0,1; 10] → từ chối', async () => {
  const { ex, mark } = setup();
  mark(100);
  const a = { algoType: 'CONDITIONAL', symbol: C.symbol, side: 'SELL', type: 'TRAILING_STOP_MARKET', workingType: 'MARK_PRICE', quantity: '1', reduceOnly: 'true', clientAlgoId: 'tr-1', callbackRate: '1' };
  assert.equal((await api(ex, 'POST', '/fapi/v1/algoOrder', { ...a, activatePrice: '99.00' })).code, -2021);
  assert.equal((await api(ex, 'POST', '/fapi/v1/algoOrder', { ...a, activatePrice: '110.00', callbackRate: '11' })).kind, 'rejected');
  assert.equal((await api(ex, 'POST', '/fapi/v1/algoOrder', { ...a, activatePrice: '110.00' })).kind, 'ok');
});

test('giới hạn số lệnh: MAX_NUM_ORDERS của mã tính cả lệnh thường lẫn algo (-2025); trần lệnh điều kiện toàn tài khoản (-4045)', async () => {
  const c3 = { ...C, maxNumOrders: 3 };
  const B: Contract = { ...C, symbol: 'BBBUSDT', baseAsset: 'BBB' };
  const { ex, mark, clock } = setup({ contracts: { [C.symbol]: c3, [B.symbol]: B }, maxConditionalTotal: 3 });
  mark(100);
  ex.feedMark(B.symbol, { price: 100, eventTime: clock.t });
  const lim = (cid: string) => api(ex, 'POST', '/fapi/v1/order', { symbol: C.symbol, side: 'BUY', type: 'LIMIT', timeInForce: 'GTC', price: '90', quantity: '1', newClientOrderId: cid });
  const stop = (sym: string, cid: string) => api(ex, 'POST', '/fapi/v1/algoOrder', { algoType: 'CONDITIONAL', symbol: sym, side: 'SELL', type: 'STOP_MARKET', triggerPrice: '95', workingType: 'MARK_PRICE', closePosition: 'true', clientAlgoId: cid });
  assert.equal((await lim('l1')).kind, 'ok');
  assert.equal((await lim('l2')).kind, 'ok');
  assert.equal((await stop(C.symbol, 's1')).kind, 'ok');
  assert.equal((await lim('l3')).code, -2025);
  assert.equal((await stop(C.symbol, 's2')).code, -2025);
  assert.equal((await stop(B.symbol, 's3')).kind, 'ok');
  assert.equal((await stop(B.symbol, 's4')).kind, 'ok');
  assert.equal((await stop(B.symbol, 's5')).code, -4045);
});

test('không có nhịp giá nào sau lệnh IOC trong thời hạn → phản hồi unknown_status (như sàn thật); lệnh vẫn được xét ở nhịp sau', async () => {
  const timers: Array<() => void> = [];
  const { ex, o, mark } = setup({ timers: { set: (fn) => { timers.push(fn); return timers.length; }, clear: () => {} }, responseTimeoutMs: 5_000 });
  mark(100);
  const p = o.placeEntry({ contract: C, side: 'long', kind: 'limit', ioc: true, limitPrice: 101, qty: 1, id: id('E1'), openCount: 0, reserveSlots: 4 });
  assert.equal(timers.length, 1);
  timers[0]!();
  const r = await p;
  assert.equal(r.kind, 'unknown_status');
  mark(100);
  assert.equal(pos(ex), 1);
  assert.equal(body(await o.queryOrder(C.symbol, { clientId: makeClientId(id('E1')) })).status, 'FILLED');
});

test('thanh lý: mark gap qua giá thanh lý ước tính (đòn bẩy mặc định 20×) → đóng ở giá phá sản, mã client autoclose-', async () => {
  const { ex, o, mark, events } = setup({ defaultLeverage: 20 });
  mark(100);
  const e = o.placeEntry({ contract: C, side: 'long', kind: 'market', refPrice: 100, qty: 10, id: id('E1'), openCount: 0, reserveSlots: 4 });
  mark(100);
  await e;
  const liq = ex.snapshot().positions[0]!.liquidationPrice!;
  assert.ok(liq > 95 && liq < 100, String(liq));
  mark(liq + 0.01);
  assert.equal(pos(ex), 10);
  mark(95);
  assert.equal(pos(ex), 0);
  const last = events.filter((x) => x.type === 'order_update').at(-1);
  assert.ok(last?.type === 'order_update');
  assert.match(last.order.clientOrderId, /^autoclose-/);
  assert.equal(last.order.executionType, 'CALCULATED');
  assert.equal(last.order.lastFilledPrice, 95); // giá phá sản 100 × (1 − 1/20)
});

test('tệp trạng thái hỏng → báo lỗi rõ, không lặng lẽ chạy với ví mới', () => {
  const dir = mkdtempSync(join(tmpdir(), 'paper-bad-'));
  const statePath = join(dir, 'paper-state.json');
  writeFileSync(statePath, '{"version": 9}');
  assert.throws(() => createPaperExchange({ contracts: { [C.symbol]: C }, cost: () => NO_IMPACT, startBalance: 1, statePath }), /phiên bản|version/i);
});

// ---------- Tương đương với lõi mô phỏng backtest: cùng đường nến → cùng khớp / cùng PnL ----------
const FB = { maxAbsRate: 0.0001, intervalHours: 504 };
function plan(side: Side, over: Partial<PlannerPlan>): PlannerPlan {
  const d = side === 'long' ? 1 : -1;
  const stop = 100 - d * 5;
  const tp1 = 100 + d * 25;
  const entryType = over.entryType ?? 'market';
  const limitPrice = over.limitPrice ?? null;
  const maxEntry = over.maxEntry ?? (entryType === 'limit' ? limitPrice! : 100);
  const worst = entryType === 'limit' ? limitPrice! : maxEntry;
  return {
    side, entryType, marketPrice: 100, entry: entryType === 'limit' ? limitPrice! : 100, maxEntry, stop, limitPrice, cancelIfTp1First: true,
    targets: [
      { name: 'TP1', price: tp1, pct: 50, qty: 0, r: 5, reason: 't' },
      { name: 'TP2', price: null, pct: 30, qty: 0, r: null, reason: 't' },
      { name: 'TP3', price: null, pct: 20, qty: 0, r: null, reason: 't' },
    ],
    exit: { policy: 'C2', tp1Qty: 0, trailQty: 0, trailing: trailingFor(side, worst, tp1, 50, 0.1) },
    valid: true, invalidReason: null, qty: 10_000, costPct: 0.1, suggestedLeverage: 5,
    limitExpiryHours: entryType === 'market' ? null : 24, riskPct: 2, capital: 100_000,
    ...over,
  };
}
function planned(p: PlannerPlan, over: Partial<PlannerInput> = {}): PlannerResult {
  const r = planOrders({
    plan: p, grade: 'A', signal: { id: `AAAUSDT|swing|${p.side}|zone|1|${p.stop}`, fresh: true }, mode: 'swing', contract: C, capital: p.capital,
    openTrades: [], openOrderCount: 0, maxNotional: Infinity, markPrice: 100, runId: 'sim', now: T0, costModel: { tierPct: p.costPct, quoteVolPerMin: 1e30 }, fundingBuffer: FB, ...over,
  });
  assert.ok(r.allowed, `planner từ chối: ${r.reasons.join('; ')}`);
  return r;
}
const bars = (rows: Array<[number, number, number, number]>): Candle[] => rows.map(([o, h, l, c], i) => ({
  openTime: T0 + i * M5, closeTime: T0 + (i + 1) * M5 - 1, open: o, high: h, low: l, close: c, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5,
}));

async function equivalence(side: Side, p: PlannerPlan, rows: Array<[number, number, number, number]>, funding: Array<{ fundingTime: number; fundingRate: number; markPrice: number }>, exitsAfterBar: number) {
  const cost: SimCost = { tierPct: 0.1, impactPct: 0.5, vol1m: 1e6 }; // trượt theo cỡ BẬT
  const pr = planned(p);
  const series = bars(rows);
  // Lõi mô phỏng
  const tr = createTrade({ id: 't', symbol: C.symbol, mode: 'swing', policy: 'C2', placedAt: T0, equityAtEntry: p.capital, contract: C, plan: p, planner: pr, cost, pathInterval: '5m',
    meta: { grade: 'A', label: 'Đạt', kind: 'zone', score: 85, signalId: 'sig', key: 'k', afterTp1: null } });
  await advanceTrade(tr, series, Infinity, { funding, resolve: null });
  const rec = tradeRecord(tr);
  // Sàn giả lập: cùng các lệnh planner; SL/TP1/trailing đặt sau khi lệnh vào khớp (như bot), trước nến kế tiếp
  const clock = { t: T0 - 1 };
  const ex = createPaperExchange({ contracts: { [C.symbol]: C }, cost: () => cost, startBalance: p.capital, statePath: null, now: () => clock.t });
  ex.feedMark(C.symbol, { price: 100, eventTime: T0 - 1 });
  clock.t = T0;
  const o = ex.orders;
  assert.equal((await o.setLeverage(C.symbol, pr.sizing!.leverage)).kind, 'ok');
  for (const l of pr.legs) if (l.op === 'placeEntry') void o.placeEntry(l.input);
  for (const [i, bar] of series.entries()) {
    for (const f of funding) if (f.fundingTime === bar.openTime) ex.feedFunding({ symbol: C.symbol, ...f });
    clock.t = bar.openTime;
    if (i === exitsAfterBar) {
      const filled = Math.abs(pos(ex));
      const { tp1Qty, trailQty } = exitSplit(filled, pr.exitRule.qtyStep);
      const markNow = series[i - 1]!.close;
      for (const l of pr.legs) {
        // Như bot: SL đặt khi lệnh vào khớp (when 'on_entry_fill'), giá mark hiện tại = giá đóng nến trước
        if (l.op === 'placeStopLoss' && l.role === 'SL') { const r = await o.placeStopLoss({ ...l.input, markPrice: markNow }); assert.equal(r.kind, 'ok', r.msg); }
        if (l.op === 'placeTakeProfit') assert.equal((await o.placeTakeProfit({ ...l.input, qty: tp1Qty })).kind, 'ok');
        if (l.op === 'placeTrailing') assert.equal((await o.placeTrailing({ ...l.input, qty: trailQty })).kind, 'ok');
      }
    }
    ex.feedKline(C.symbol, bar);
  }
  const fills = (await api(ex, 'GET', '/fapi/v1/userTrades', { symbol: C.symbol })).body as Array<Record<string, string | number>>;
  const inc = (await api(ex, 'GET', '/fapi/v1/income', { symbol: C.symbol, incomeType: 'FUNDING_FEE' })).body as Array<Record<string, string>>;
  const simFills = [
    ...rec.legs.filter((l) => l.filledQty > 0).map((l) => ({ qty: l.filledQty, price: l.fillPrice! })),
    ...rec.exits.map((e) => ({ qty: e.qty, price: e.price })),
  ];
  assert.deepEqual(fills.map((f) => ({ qty: Number(f.qty), price: Number(f.price) })), simFills);
  const gross = fills.reduce((s, f) => s + Number(f.realizedPnl), 0);
  const costs = fills.reduce((s, f) => s + Number(f.commission), 0);
  const fund = inc.reduce((s, f) => s + Number(f.income), 0);
  assert.equal(gross, rec.gross);
  assert.equal(costs, rec.costs);
  assert.equal(fund, rec.funding);
  close(ex.snapshot().wallet - p.capital, rec.pnl, 1e-9);
  assert.equal(pos(ex), 0);
  return rec;
}

test('tương đương lõi mô phỏng — Long: IOC (trượt theo cỡ) → TP1 50% → trailing kích hoạt tại TP1 → đóng theo callback; funding Long trả', async () => {
  const rec = await equivalence('long', plan('long', { maxEntry: 100.5, suggestedLeverage: 3 }), [
    [100, 101, 99, 100], // khớp IOC ở giá mở
    [100, 125, 99.5, 124], // TP1 125 + kích hoạt
    [124, 130, 116, 118], // đỉnh 130 → dừng 117
    [118, 119, 117, 117.5], // chạm 117
  ], [{ fundingTime: T0 + 2 * M5, fundingRate: 0.0001, markPrice: 124 }], 1);
  assert.equal(rec.reason, 'trailing');
  assert.ok(rec.funding < 0);
  assert.equal(rec.exits.length, 2);
});

test('tương đương lõi mô phỏng — Short: LIMIT chờ khớp giữa nến → SL; funding Short nhận', async () => {
  const rec = await equivalence('short', plan('short', { entryType: 'limit', limitPrice: 101 }), [
    [100, 100.5, 99.5, 100], // chưa tới limit
    [100.2, 101.5, 100, 101], // khớp limit 101 (giữa nến)
    [102, 106, 101.8, 105.5], // chạm SL 105
  ], [{ fundingTime: T0 + 2 * M5, fundingRate: 0.0001, markPrice: 102 }], 2);
  assert.equal(rec.reason, 'stop_loss');
  assert.ok(rec.funding > 0);
});
