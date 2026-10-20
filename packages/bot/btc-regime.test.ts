import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withConfigOverride } from '../core/config-override.ts';
import { lossAtStop } from '../core/funding-guard.ts';
import { regimeExitCostPct } from '../core/btc-regime.ts';
import type { Contract } from '../core/types.ts';
import { builders } from '../binance/orders.ts';
import { planRegimeEntry, regimeEntrySizing, regimeSignalId } from './btc-regime.ts';
import { reconcile, tradeFromPlan, type ExAlgoOrder, type ExchangeState, type TradeState } from './reconcile.ts';
import { fundingGuardActions } from './funding-runtime.ts';

// Lệnh vào + đối chiếu + chốt chặn funding của hệ btc-regime. Hàm thuần, không mạng, không gửi lệnh.
const BTC: Contract = {
  symbol: 'BTCUSDT', baseAsset: 'BTC', onboardDate: 0, tickSize: 0.1, stepSize: 0.001, minQty: 0.001, maxQty: 1000,
  marketMinQty: 0.001, marketMaxQty: 120, marketStepSize: 0.001, minNotional: 100, maxNumOrders: 200, deliveryDate: 4133894400000,
};
const NOW = Date.UTC(2026, 9, 21, 0, 0, 5);
const SID = regimeSignalId(Date.UTC(2026, 9, 21) - 1);

function opened(capital = 10_000, mark = 60_000, atr = 700) {
  const sz = regimeEntrySizing({ contract: BTC, capital, markPrice: mark, atr });
  assert.ok(sz.ok);
  const pr = planRegimeEntry({ contract: BTC, sizing: sz, qty: sz.qty, capital, markPrice: mark, signalId: SID, runId: 'run1', now: NOW, openOrderCount: 0 });
  assert.ok(pr.allowed && pr.sizing !== null, pr.reasons.join('; '));
  const base = tradeFromPlan({ signalId: SID, runId: 'run1', now: NOW, result: pr, costPct: pr.sizing.costPct });
  const t: TradeState = { ...base, plan: { ...base.plan, exitCostPct: regimeExitCostPct() }, equityAtEntry: capital, riskAmount: pr.sizing.riskAmount, notional: pr.sizing.notional, mode: 'btc-regime' };
  return { sz, pr, t };
}

test('định cỡ lệnh vào: SL = mark − 2,5 × ATR; khoảng SL đo từ giá trần IOC; lỗ tại SL gồm phí 2 chiều + trượt ≤ 2% vốn; ≤ 1 × vốn; đòn bẩy 1×', () => {
  const { sz, pr } = opened();
  assert.ok(sz.ok);
  assert.equal(sz.stop, 58_250);
  assert.equal(sz.worstEntry, 60_060); // 60 000 × (1 + 0,1%)
  assert.equal(sz.qty, 0.105);
  assert.equal(sz.costPct, 0.135);
  assert.ok(sz.riskAmount <= 200 + 1e-9);
  assert.ok(pr.sizing!.realRiskPct <= 2 + 1e-9);
  assert.equal(pr.sizing!.leverage, 1);
  assert.ok(pr.sizing!.notional <= 10_000);
  // ATR rất nhỏ → bị chặn ở 1 × vốn
  const tight = regimeEntrySizing({ contract: BTC, capital: 10_000, markPrice: 60_000, atr: 40 });
  assert.ok(tight.ok && tight.notional <= 10_000 && tight.riskAmount < 200);
  // đầu vào hỏng → không định cỡ (fail closed)
  for (const bad of [{ markPrice: NaN, atr: 700 }, { markPrice: 60_000, atr: 0 }, { markPrice: 60_000, atr: 30_000 }]) {
    assert.equal(regimeEntrySizing({ contract: BTC, capital: 10_000, ...bad }).ok, false, JSON.stringify(bad));
  }
});

test('bộ lệnh: CHỈ E1 (LIMIT IOC giá trần) + SL (STOP_MARKET closePosition, MARK_PRICE) — không TP1, không trailing; giảm theo danh mục chỉ làm nhỏ hơn', () => {
  const { pr, t } = opened();
  assert.deepEqual(pr.legs.map((l) => `${l.op}:${l.role}`), ['placeEntry:E1', 'placeStopLoss:SL']);
  const e1 = pr.legs[0]!;
  assert.ok(e1.op === 'placeEntry' && e1.input.kind === 'limit' && e1.input.ioc === true && e1.input.limitPrice === 60_060 && e1.input.side === 'long');
  const sl = pr.legs[1]!;
  assert.ok(sl.op === 'placeStopLoss');
  const req = builders.stopLoss({ ...sl.input, markPrice: 60_000 });
  assert.ok(req.ok);
  assert.equal(req.req.params!.type, 'STOP_MARKET');
  assert.equal(req.req.params!.closePosition, 'true');
  assert.equal(req.req.params!.workingType, 'MARK_PRICE');
  assert.equal(t.legs.TP1, undefined);
  assert.equal(t.legs.TR, undefined);
  assert.equal(t.plan.stop, 58_250);
  const { sz } = opened();
  assert.ok(sz.ok);
  const cut = planRegimeEntry({ contract: BTC, sizing: sz, qty: 0.05, capital: 10_000, markPrice: 60_000, signalId: SID, runId: 'run1', now: NOW, openOrderCount: 0 });
  assert.equal(cut.sizing!.qty, 0.05);
  const big = planRegimeEntry({ contract: BTC, sizing: sz, qty: 5, capital: 10_000, markPrice: 60_000, signalId: SID, runId: 'run1', now: NOW, openOrderCount: 0 });
  assert.equal(big.sizing!.qty, 0.105, 'không bao giờ phóng to quá khối lượng luật');
});

test('bộ lệnh từ chối: chế độ btc-regime tắt, mã khác BTCUSDT, MAX_NUM_ORDERS đầy', async () => {
  const { sz } = opened();
  assert.ok(sz.ok);
  const base = { contract: BTC, sizing: sz, qty: sz.qty, capital: 10_000, markPrice: 60_000, signalId: SID, runId: 'run1', now: NOW, openOrderCount: 0 };
  await withConfigOverride({ 'COMMON.bot.modes': ['swing'] }, async () => {
    const r = planRegimeEntry(base);
    assert.equal(r.allowed, false);
    assert.match(r.reasons.join(' '), /btc-regime đang tắt/);
  });
  assert.match(planRegimeEntry({ ...base, contract: { ...BTC, symbol: 'ETHUSDT' } }).reasons.join(' '), /chỉ giao dịch BTCUSDT/);
  assert.match(planRegimeEntry({ ...base, openOrderCount: 199 }).reasons.join(' '), /MAX_NUM_ORDERS/);
});

// Trạng thái sàn: vị thế đã khớp + SL đang nằm trên sàn
function filledState(t: TradeState, qty: number, entry: number, stop = t.plan.stop): { t: TradeState; ex: ExchangeState; sl: ExAlgoOrder } {
  const tt: TradeState = structuredClone(t);
  tt.status = 'open';
  tt.legs.E1!.status = 'filled';
  tt.legs.SL!.status = 'open';
  tt.fills = [{ tradeId: 1, orderId: 11, clientId: tt.legs.E1!.clientId, symbol: 'BTCUSDT', side: 'BUY', qty, price: entry, time: NOW + 1000, role: 'E1' }];
  const sl: ExAlgoOrder = { symbol: 'BTCUSDT', algoId: 7, clientId: tt.legs.SL!.clientId, orderType: 'STOP_MARKET', side: 'SELL', quantity: 0, triggerPrice: stop, closePosition: true, algoStatus: 'NEW', activated: null };
  const ex: ExchangeState = { positions: [{ symbol: 'BTCUSDT', positionAmt: qty, entryPrice: entry, liquidationPrice: null }], openOrders: [], openAlgoOrders: [sl], recentFills: [] };
  return { t: tt, ex, sl };
}

test('đối chiếu lệnh CHỈ có SL: SL đủ → không hành động (không TP1/trailing, không cảnh báo hòa vốn); thiếu SL → đặt SL closePosition', () => {
  const { t } = opened();
  const s = filledState(t, 0.105, 60_010);
  const acts = reconcile([s.t], s.ex, { now: NOW + 5000, markPrices: { BTCUSDT: 60_000 }, filters: { BTCUSDT: BTC }, capital: 10_000 });
  assert.deepEqual(acts.filter((a) => a.type !== 'alert'), [], JSON.stringify(acts));
  assert.equal(acts.filter((a) => a.type === 'alert').length, 0, JSON.stringify(acts));
  const lost = reconcile([s.t], { ...s.ex, openAlgoOrders: [] }, { now: NOW + 5000, markPrices: { BTCUSDT: 60_000 }, filters: { BTCUSDT: BTC }, capital: 10_000 });
  const place = lost.filter((a) => a.type === 'place_stop');
  assert.equal(place.length, 1);
  assert.ok(place[0]!.type === 'place_stop' && place[0]!.qty === null && place[0]!.input.triggerPrice === 58_250);
  assert.ok(!lost.some((a) => a.type === 'place_tp1' || a.type === 'place_trailing'));
});

test('đối chiếu: giá giảm làm vốn hiện tại sụt — btc-regime tính ngân sách 2% theo vốn LÚC VÀO → KHÔNG cắt vị thế (luật không có giảm vị thế)', () => {
  const { t } = opened();
  const s = filledState(t, 0.105, 60_010);
  const ctx = { now: NOW + 5000, markPrices: { BTCUSDT: 59_000 }, filters: { BTCUSDT: BTC }, capital: 9_000 };
  assert.ok(!reconcile([s.t], s.ex, ctx).some((a) => a.type === 'reduce_only'));
  // đối chứng: cùng lệnh nhưng KHÔNG đánh dấu btc-regime → ngân sách theo vốn hiện tại → bị cắt (cơ chế cũ của Swing)
  const swingLike: TradeState = { ...s.t, mode: undefined };
  assert.ok(reconcile([swingLike], s.ex, ctx).some((a) => a.type === 'reduce_only'));
});

test('chốt chặn funding (siết SL): (giá vào − SL)·qty + phí + trượt + funding đã trả ≤ 2% vốn lúc vào — chiều ra = phí taker + trượt như mô phỏng; khớp công thức GUARD của btc-regime-sim.ts', () => {
  const { t } = opened();
  const qty = 0.105, entry = 60_000;
  const s = filledState(t, qty, entry);
  const entryFee = 0.000575 * entry * qty; // 3,62 USDT
  const rows = [{ fill: s.t.fills[0]!, commission: entryFee, commissionAsset: 'USDT', realizedPnl: 0 }];
  // funding chưa vượt: lỗ tại SL = 3,62 + 0,105 × 1 750 + 0,105 × 58 250 × 0,000775 = 191,98 ≤ 200 → giữ
  const keep = fundingGuardActions({ trade: s.t, positionQty: qty, avgEntry: entry, mark: 60_500, contract: BTC, algos: s.ex.openAlgoOrders, trades: rows, fundingIncome: 0, riskPct: 2, capitalFallback: 10_000 });
  assert.equal(keep.result.action, 'keep');
  assert.ok(Math.abs(keep.lossBefore - (entryFee + qty * 1_750 + qty * 58_250 * 0.000775)) < 1e-9);
  // funding đã trả 40 USDT → vượt → siết
  const fund = 40;
  const run = fundingGuardActions({ trade: s.t, positionQty: qty, avgEntry: entry, mark: 60_500, contract: BTC, algos: s.ex.openAlgoOrders, trades: rows, fundingIncome: -fund, riskPct: 2, capitalFallback: 10_000 });
  assert.equal(run.result.action, 'tighten');
  const newStop = run.result.action === 'tighten' ? run.result.stop : NaN;
  const lossNew = lossAtStop({ side: 'long', qty, avgEntry: entry, lockedLoss: entryFee + fund, exitCostFrac: 0.000775 }, newStop);
  assert.ok(lossNew <= 200 + 1e-9, String(lossNew));
  // Công thức GUARD của mô phỏng (dùng SL CŨ trong phần phí chiều ra): slMin = vào − (2% vốn − phí vào − funding − (phí + trượt)·SL·qty) / qty
  const slMin = entry - (0.02 * 10_000 - entryFee - fund - 0.000775 * 58_250 * qty) / qty;
  assert.ok(newStop >= slMin - 1e-9, `${newStop} ≥ ${slMin}`);
  assert.ok(newStop - slMin <= 0.000775 * (newStop - 58_250) + BTC.tickSize + 1e-9, `${newStop} ≈ ${slMin} (bot giải đúng phí ở SL mới — chặt hơn ≤ 1 tick + 0,0775% × đoạn siết)`);
  assert.ok(run.actions.some((a) => a.type === 'place_stop' && a.qty === null), 'SL mới closePosition');
  assert.ok(run.journal.some((e) => e.type === 'stop_tightened'));
});

test('trần live chặt hơn: riskPct = min(2%, trần live) → định cỡ theo mức thấp hơn; bộ lệnh từ chối khối lượng vượt trần đó', () => {
  const one = regimeEntrySizing({ contract: BTC, capital: 10_000, markPrice: 60_000, atr: 700, riskPct: 1 });
  assert.ok(one.ok);
  assert.ok(one.riskAmount <= 100 + 1e-9 && one.riskAmount > 95, String(one.riskAmount));
  const two = regimeEntrySizing({ contract: BTC, capital: 10_000, markPrice: 60_000, atr: 700 });
  assert.ok(two.ok);
  const r = planRegimeEntry({ contract: BTC, sizing: two, qty: two.qty, capital: 10_000, markPrice: 60_000, signalId: SID, runId: 'run1', now: NOW, openOrderCount: 0, riskPct: 1 });
  assert.equal(r.allowed, false);
  assert.match(r.reasons.join(' '), /vượt 1%\/lệnh/);
  assert.equal(regimeSignalId(Date.UTC(2026, 9, 21) - 1, 2), 'BTCUSDT|btc-regime|long|2026-10-21|lan2');
});
