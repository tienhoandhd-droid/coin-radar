import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fundingGuardActions, lockedLossOf } from './funding-runtime.ts';
import { legClientId, type ExAlgoOrder, type TradeState } from './reconcile.ts';
import type { TradeRow } from './exchange-state.ts';
import type { Contract, Side } from '../core/types.ts';

// B8b chốt chặn funding khi chạy (nghĩa vụ B8b kế hoạch bot): mỗi kỳ funding chốt, lỗ nếu chạm SL bây giờ + funding đã trả
// > 2% vốn lúc vào → siết SL đúng mức để tổng ≤ 2%; SL mới phải vượt giá mark → đóng ngay (market reduce-only). Số tính tay.
const C: Contract = {
  symbol: 'AAAUSDT', baseAsset: 'AAA', onboardDate: 0, tickSize: 0.01, stepSize: 0.001, minQty: 0.001, maxQty: 1e6,
  marketMinQty: 0.001, marketMaxQty: 1e6, marketStepSize: 0.001, minNotional: 5, maxNumOrders: 200, deliveryDate: 4133894400000,
};
const T0 = Date.UTC(2026, 9, 1);

function trade(side: Side, stop: number): TradeState {
  return {
    signalId: `sig-${side}`, symbol: C.symbol, side, runId: 'r1', createdAt: T0, status: 'open', closedReason: null,
    plan: { stop, tp1: side === 'long' ? 110 : 90, activatePrice: side === 'long' ? 110 : 90, callbackPct: 2, costPct: 0.1, needsBreakevenFloor: false, leverage: 5, qtyStep: 0.001, tp1Pct: 50, limitCancelAt: null },
    legs: { SL: { role: 'SL', clientId: legClientId({ runId: 'r1', signalId: `sig-${side}` }, 'SL', 0), attempt: 0, status: 'open', qty: null, triggerPrice: stop, orderIds: [] } },
    fills: [], tp1Filled: false, trailingActivated: false, equityAtEntry: 1000,
  };
}
const slAlgo = (t: TradeState, trigger: number): ExAlgoOrder => ({
  symbol: C.symbol, algoId: 7, clientId: t.legs.SL!.clientId, orderType: 'STOP_MARKET', side: t.side === 'long' ? 'SELL' : 'BUY',
  quantity: 0, triggerPrice: trigger, closePosition: true, algoStatus: 'NEW', activated: null,
});
// Khớp vào: phí 0,5 USDT, PnL đã chốt 0
const rows: TradeRow[] = [{ fill: { tradeId: 1, orderId: 1, clientId: null, symbol: C.symbol, side: 'BUY', qty: 3.5, price: 100, time: T0 + 1 }, commission: 0.5, commissionAsset: 'USDT', realizedPnl: 0 }];

test('lockedLossOf: phí + funding đã trả − PnL đã chốt (từ userTrades + income FUNDING_FEE)', () => {
  // phí 0,5 + funding đã trả 2 (income −2) − lãi đã chốt 0 = 2,5
  assert.equal(lockedLossOf(rows, -2), 2.5);
  const withTp: TradeRow[] = [...rows, { fill: { ...rows[0]!.fill, tradeId: 2 }, commission: 0.2, commissionAsset: 'USDT', realizedPnl: 10 }];
  assert.ok(Math.abs(lockedLossOf(withTp, -2) - (0.7 + 2 - 10)) < 1e-12);
});

test('Long tính tay: vốn lúc vào 1000 → ngân sách 20; 3,5 coin vào 100, SL 95, đã mất 2,5 → lỗ tại SL 20,166 > 20 → siết SL lên 95,05', () => {
  const t = trade('long', 95);
  const r = fundingGuardActions({ trade: t, positionQty: 3.5, avgEntry: 100, mark: 99, contract: C, algos: [slAlgo(t, 95)], trades: rows, fundingIncome: -2, riskPct: 2, capitalFallback: 5000 });
  // 2,5 + 3,5×5 + 3,5×95×0,0005 = 20,16625
  assert.ok(Math.abs(r.lossBefore - 20.16625) < 1e-9, String(r.lossBefore));
  assert.equal(r.result.action, 'tighten');
  // s ≥ (3,5×100 − 17,5) / (3,5 × 0,9995) = 95,0482… → làm tròn tick LÊN 95,05
  assert.ok(r.result.action === 'tighten' && r.result.stop === 95.05);
  assert.deepEqual(r.journal, [{ type: 'stop_tightened', signalId: t.signalId, stop: 95.05, reason: r.journal[0]!.type === 'stop_tightened' ? r.journal[0]!.reason : '' }]);
  const place = r.actions.find((a) => a.type === 'place_stop');
  assert.ok(place !== undefined && place.type === 'place_stop');
  assert.equal(place.input.triggerPrice, 95.05);
  assert.equal(place.clientId, legClientId(t, 'SL', 1)); // lần thử mới, không gửi lại mã cũ
  assert.equal(place.onReject, 'stop_replace_rejected'); // SL cũ vẫn phủ → từ chối thì GIỮ cũ
  const cancel = r.actions.find((a) => a.type === 'cancel_algo');
  assert.ok(cancel !== undefined && cancel.type === 'cancel_algo' && cancel.onlyAfterPlaced === place.clientId, 'hủy SL cũ chỉ SAU khi SL mới lên sàn');
  assert.ok(r.actions.indexOf(place) < r.actions.indexOf(cancel));
  assert.ok(r.actions.some((a) => a.type === 'alert'));
});

test('Short tính tay: SL 105 → lỗ tại SL 20,184 > 20 → siết SL xuống 104,94', () => {
  const t = trade('short', 105);
  const r = fundingGuardActions({ trade: t, positionQty: 3.5, avgEntry: 100, mark: 101, contract: C, algos: [slAlgo(t, 105)], trades: rows, fundingIncome: -2, riskPct: 2, capitalFallback: 5000 });
  assert.ok(Math.abs(r.lossBefore - 20.18375) < 1e-9);
  // s ≤ (17,5 + 350) / (3,5 × 1,0005) = 104,9475… → làm tròn tick XUỐNG 104,94
  assert.ok(r.result.action === 'tighten' && r.result.stop === 104.94);
  const place = r.actions.find((a) => a.type === 'place_stop');
  assert.ok(place?.type === 'place_stop' && place.input.triggerPrice === 104.94 && place.input.side === 'short');
});

test('Long: SL mới phải vượt giá mark → ĐÓNG ngay (market reduce-only) + báo khẩn; không siết', () => {
  const t = trade('long', 95);
  // đã mất 19 → còn 1 USDT cho 3,5 coin → SL cần ≈ 99,76 > mark 99
  const r = fundingGuardActions({ trade: t, positionQty: 3.5, avgEntry: 100, mark: 99, contract: C, algos: [slAlgo(t, 95)], trades: rows, fundingIncome: -18.5, riskPct: 2, capitalFallback: 5000 });
  assert.equal(r.result.action, 'close');
  const mc = r.actions.find((a) => a.type === 'market_close');
  assert.ok(mc?.type === 'market_close' && mc.qty === 3.5 && mc.side === 'long' && mc.urgent === true);
  assert.ok(r.actions.some((a) => a.type === 'alert' && a.level === 'urgent'));
  assert.deepEqual(r.journal, []);
});

test('Trong ngân sách → giữ nguyên, không hành động; dùng mức SL ĐANG nằm trên sàn (không phải SL gốc trong nhật ký)', () => {
  const t = trade('long', 95);
  const r = fundingGuardActions({ trade: t, positionQty: 3.5, avgEntry: 100, mark: 99, contract: C, algos: [slAlgo(t, 96)], trades: rows, fundingIncome: -2, riskPct: 2, capitalFallback: 5000 });
  assert.equal(r.result.action, 'keep');
  assert.deepEqual(r.actions, []);
  assert.equal(r.stopUsed, 96);
});

test('Thiếu vốn lúc vào trong nhật ký (lệnh cũ) → dùng capitalFallback; cancel_then_place khi lệnh đang ở chế độ dự phòng', () => {
  const t = { ...trade('long', 95), equityAtEntry: undefined, stopReplaceFallback: true };
  const r = fundingGuardActions({ trade: t, positionQty: 3.5, avgEntry: 100, mark: 99, contract: C, algos: [slAlgo(t, 95)], trades: rows, fundingIncome: -2, riskPct: 2, capitalFallback: 1000 });
  assert.equal(r.result.action, 'tighten');
  const i = r.actions.findIndex((a) => a.type === 'cancel_algo');
  const j = r.actions.findIndex((a) => a.type === 'place_stop');
  assert.ok(i >= 0 && j === i + 1, 'hủy cũ rồi đặt mới NGAY sau');
  const p = r.actions[j]!;
  assert.ok(p.type === 'place_stop' && p.onReject === 'market_close');
});

test('Sau TP1 (phần còn lại chạy trailing ≥ hòa vốn, không sửa được) → vượt ngân sách thì ĐÓNG phần còn lại', () => {
  const t = { ...trade('long', 95), tp1Filled: true };
  const be: ExAlgoOrder = { ...slAlgo(t, 95), clientId: legClientId(t, 'BE', 0), triggerPrice: 100.1, closePosition: false, quantity: 1.75 };
  const ok = fundingGuardActions({ trade: t, positionQty: 1.75, avgEntry: 100, mark: 104, contract: C, algos: [be], trades: rows, fundingIncome: -2, riskPct: 2, capitalFallback: 5000 });
  assert.equal(ok.result.action, 'keep');
  const bad = fundingGuardActions({ trade: t, positionQty: 1.75, avgEntry: 100, mark: 104, contract: C, algos: [be], trades: rows, fundingIncome: -30, riskPct: 2, capitalFallback: 5000 });
  assert.ok(bad.actions.some((a) => a.type === 'market_close'));
  assert.ok(!bad.actions.some((a) => a.type === 'place_stop'));
});

test('Đã mất (phí + funding) vượt ngân sách nhưng lệnh đang lãi xa: SIẾT SL qua giá vào (không đóng); SL cũ đã ở phía lãi → không báo Telegram', () => {
  for (const side of ['long', 'short'] as const) {
    const d = side === 'long' ? 1 : -1;
    const t = trade(side, 100 + d * 1); // SL cũ 101 (Long) / 99 (Short) — đã ở phía có lãi của giá vào 100
    const r = fundingGuardActions({ trade: t, positionQty: 3.5, avgEntry: 100, mark: 100 + d * 30, contract: C, algos: [slAlgo(t, 100 + d * 1)], trades: rows, fundingIncome: -24.5, riskPct: 2, capitalFallback: 5000 });
    // đã mất 0,5 + 24,5 = 25 > 20 → SL mới phải khóa lãi ≥ 5 + phí ra trên 3,5 coin
    assert.equal(r.result.action, 'tighten', side);
    assert.ok(r.actions.some((a) => a.type === 'place_stop'), side);
    assert.ok(!r.actions.some((a) => a.type === 'market_close'), `${side}: không đóng lệnh đang lãi`);
    assert.ok(!r.actions.some((a) => a.type === 'alert'), `${side}: không gửi tin cho lần siết thường lệ`);
    assert.ok(r.result.action === 'tighten' && r.result.lossAtStop <= 20 + 1e-9, `${side}: lỗ tại SL mới ≤ 2% vốn lúc vào`);
  }
});
