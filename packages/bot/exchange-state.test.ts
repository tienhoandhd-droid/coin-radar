import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPaperExchange } from './paper.ts';
import { fetchExchangeState, fetchTradeHistory, parseUserTrades, parsePositions, parseOpenAlgos, StateFetchError } from './exchange-state.ts';
import { makeClientId, type ClientIdParts } from '../binance/orders.ts';
import type { Contract } from '../core/types.ts';
import type { RequestOpts, SignedResult } from '../binance/signed.ts';

// B8b: trạng thái THẬT trên sàn qua REST (positionRisk v3, openOrders, openAlgoOrders, userTrades, income, balance) → ExchangeState
// cho reconcile. Kiểm bằng thân phản hồi của sàn giả lập (cùng tên trường như Binance).
const C: Contract = {
  symbol: 'AAAUSDT', baseAsset: 'AAA', onboardDate: 0, tickSize: 0.01, stepSize: 0.001, minQty: 0.001, maxQty: 1e6,
  marketMinQty: 0.001, marketMaxQty: 1e6, marketStepSize: 0.001, minNotional: 5, maxNumOrders: 200, deliveryDate: 4133894400000,
};
const T0 = Date.UTC(2026, 6, 1);
const id = (leg: string): ClientIdParts => ({ runId: 'r1', signalId: 'sig-1', leg, attempt: 0 });

function setup() {
  const clock = { t: T0 };
  const ex = createPaperExchange({ contracts: { [C.symbol]: C }, cost: () => ({ tierPct: 0.1, impactPct: 0.5, vol1m: Infinity }), startBalance: 1000, statePath: null, now: () => clock.t, defaultLeverage: 5 });
  const mark = (price: number) => { clock.t += 1000; ex.feedMark(C.symbol, { price, eventTime: clock.t }); };
  return { ex, clock, mark };
}

test('fetchExchangeState: vị thế, lệnh thường, lệnh algo, khớp (kèm phí + realizedPnl), ví + PnL chưa chốt — từ REST', async () => {
  const { ex, mark } = setup();
  mark(100);
  const e = ex.orders.placeEntry({ contract: C, side: 'long', kind: 'market', refPrice: 100, qty: 2, id: id('E1'), openCount: 0, reserveSlots: 4 });
  mark(100);
  assert.equal((await e).kind, 'ok');
  assert.equal((await ex.orders.placeStopLoss({ contract: C, side: 'long', markPrice: 100, triggerPrice: 95, purpose: 'initial', id: id('SL') })).kind, 'ok');
  assert.equal((await ex.orders.placeEntry({ contract: C, side: 'long', kind: 'limit', limitPrice: 97, qty: 1, id: id('E2'), openCount: 1, reserveSlots: 3 })).kind, 'ok');
  mark(101);
  const s = await fetchExchangeState(ex.api, { symbols: ['AAAUSDT'], fillsSince: new Map([['AAAUSDT', T0]]), now: T0 + 3_600_000 });
  assert.deepEqual(s.ex.positions.map((p) => [p.symbol, p.positionAmt]), [['AAAUSDT', 2]]);
  assert.equal(s.ex.openOrders.length, 1);
  assert.equal(s.ex.openOrders[0]!.clientId, makeClientId(id('E2')));
  assert.equal(s.ex.openOrders[0]!.type, 'LIMIT');
  assert.equal(s.ex.openAlgoOrders.length, 1);
  const sl = s.ex.openAlgoOrders[0]!;
  assert.equal(sl.clientId, makeClientId(id('SL')));
  assert.equal(sl.orderType, 'STOP_MARKET');
  assert.equal(sl.triggerPrice, 95);
  assert.equal(sl.closePosition, true);
  assert.equal(sl.activated, null); // REST không cho biết trailing đã kích hoạt
  assert.equal(s.ex.recentFills.length, 1);
  assert.equal(s.ex.recentFills[0]!.clientId, null); // userTrades không có mã client → reconcile gán theo orderId
  assert.ok(s.trades.get('AAAUSDT')![0]!.commission > 0);
  assert.ok(s.wallet < 1000 && s.wallet > 999);
  assert.ok(Math.abs(s.unrealized - 2) < 0.01, `PnL chưa chốt ${s.unrealized}`);
  assert.equal(s.equity, s.wallet + s.unrealized);
  assert.ok(s.symbols.includes('AAAUSDT'));
});

test('fetchExchangeState: mã có lệnh mở nhưng không nằm trong danh sách hỏi (vị thế/lệnh lạ) vẫn được đọc nhờ positionRisk v3', async () => {
  const { ex, mark } = setup();
  mark(100);
  assert.equal((await ex.orders.placeEntry({ contract: C, side: 'long', kind: 'limit', limitPrice: 97, qty: 1, id: id('E2'), openCount: 0, reserveSlots: 3 })).kind, 'ok');
  const s = await fetchExchangeState(ex.api, { symbols: [], fillsSince: new Map() });
  assert.equal(s.ex.openOrders.length, 1);
  assert.deepEqual(s.symbols, ['AAAUSDT']);
});

test('fetchExchangeState: REST lỗi (bị chặn 418/429) → ném StateFetchError kind banned, không trả trạng thái nửa vời', async () => {
  const api = { request: async (o: RequestOpts): Promise<SignedResult> => ({ kind: 'banned', code: 418, msg: 'IP banned', status: 418, body: null, orderCount: { tenSec: null, oneMin: null }, ...(o ? {} : {}) }) };
  await assert.rejects(fetchExchangeState(api, { symbols: ['AAAUSDT'], fillsSince: new Map() }), (e: unknown) => e instanceof StateFetchError && e.kind === 'banned');
});

test('parse*: trường hỏng → ném lỗi nêu tên trường (không để NaN lọt vào reconcile)', () => {
  assert.throws(() => parsePositions([{ symbol: 'X', positionAmt: 'abc', entryPrice: '1', liquidationPrice: '0' }]), /positionAmt/);
  assert.throws(() => parseOpenAlgos([{ symbol: 'X', algoId: 1, clientAlgoId: 'c', orderType: 'STOP_MARKET', side: 'SELL', quantity: '0', triggerPrice: 'x', closePosition: true, algoStatus: 'NEW' }]), /triggerPrice/);
  assert.throws(() => parseUserTrades([{ id: 1, orderId: 2, symbol: 'X', side: 'BUY', qty: '1', price: '1', commission: 'n', realizedPnl: '0', time: 1 }]), /commission/);
  assert.deepEqual(parsePositions([{ symbol: 'X', positionAmt: '-1.5', entryPrice: '10', liquidationPrice: '0', unRealizedProfit: '0.2' }]),
    [{ symbol: 'X', positionAmt: -1.5, entryPrice: 10, liquidationPrice: null }]);
});

test('fetchTradeHistory: chia trang cửa sổ ≤ 7 ngày (giới hạn userTrades), bỏ trùng theo tradeId', async () => {
  const calls: Array<Record<string, unknown>> = [];
  const row = (id: number, time: number) => ({ id, orderId: 1, symbol: 'X', side: 'BUY', qty: '1', price: '1', commission: '0.01', realizedPnl: '0', time });
  const api = { request: async (o: RequestOpts): Promise<SignedResult> => {
    calls.push(o.params ?? {});
    return { kind: 'ok', code: null, msg: '', status: 200, body: [row(1, 5), row(2, Number(o.params!.startTime))], orderCount: { tenSec: null, oneMin: null } };
  } };
  const D = 86_400_000;
  const rows = await fetchTradeHistory(api, 'X', 0, 20 * D);
  assert.equal(calls.length, 3);
  for (const c of calls) assert.ok(Number(c.endTime) - Number(c.startTime) <= 7 * D);
  assert.equal(Number(calls[2]!.endTime), 20 * D);
  assert.deepEqual(rows.map((r) => r.fill.tradeId), [1, 2]);
});
