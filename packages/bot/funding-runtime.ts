import { fundingGuard, lossAtStop, type FundingGuardResult } from '../core/funding-guard.ts';
import type { StopLossInput } from '../binance/orders.ts';
import type { Contract } from '../core/types.ts';
import type { TradeRow } from './exchange-state.ts';
import type { JournalEventBody } from './journal.ts';
import { legClientId, roleOfClientId, type Action, type ExAlgoOrder, type TradeState } from './reconcile.ts';

// Chốt chặn funding khi chạy của bot (nghĩa vụ B8b, F1 kế hoạch 2 Task 8) — ràng buộc cứng người dùng: lỗ thật mỗi lệnh ≤ 2% vốn LÚC VÀO.
// Gọi sau MỖI kỳ funding chốt của mã có lệnh mở (main.ts). Hàm THUẦN: dùng chung công thức packages/core/funding-guard.ts với bộ mô phỏng,
// trả hành động cho executor (cùng kiểu Action của reconcile) + sự kiện nhật ký.
//   lockedLoss = Σ phí (userTrades.commission) + funding đã trả (−Σ income FUNDING_FEE) − Σ PnL đã chốt (userTrades.realizedPnl)
//   exitCostFrac = costPct của lệnh / 200 (nửa phí + trượt khứ hồi của kế hoạch = chiều ra)
// Trước TP1: mức dừng = lệnh dừng (SL/BE) của lệnh ĐANG nằm trên sàn (lần thử mới nhất), không có thì SL trong nhật ký.
//   tighten → ghi stop_tightened (SL mới trong nhật ký) + thay lệnh dừng như reconcile: đặt mới TRƯỚC, hủy cũ SAU (place_then_cancel,
//   từ chối thì giữ cũ) hoặc hủy-rồi-đặt khi lệnh đang ở chế độ dự phòng (stopReplaceFallback; đặt hỏng → đóng khẩn).
//   close → đóng market reduce-only cả vị thế + báo khẩn.
// Sau TP1: phần còn lại do trailing quản (≥ hòa vốn + phí, D10) — không sửa được lệnh trailing → chỉ kiểm theo dừng hòa vốn BE nếu có;
//   vượt ngân sách (siết hoặc đóng) → ĐÓNG phần còn lại (hiếm: funding đã trả lớn hơn lãi TP1).
// Giới hạn: lockedLoss tính trên MỌI khớp của mã từ lúc tạo lệnh (bot không giữ hai lệnh cùng mã — reconcile khóa mã khi mơ hồ).

export function lockedLossOf(rows: readonly TradeRow[], fundingIncome: number): number {
  return rows.reduce((s, r) => s + r.commission - r.realizedPnl, 0) - fundingIncome;
}

export type FundingGuardRun = {
  result: FundingGuardResult;
  lockedLoss: number;
  lossBefore: number; // lỗ nếu chạm mức dừng hiện tại bây giờ (gồm lockedLoss)
  stopUsed: number;
  budget: number;
  actions: Action[];
  journal: JournalEventBody[];
};

const fmt = (x: number) => x.toFixed(2).replace('.', ',');

export function fundingGuardActions(a: {
  trade: TradeState; positionQty: number; avgEntry: number; mark: number; contract: Contract;
  algos: readonly ExAlgoOrder[]; // lệnh algo đang mở của mã (REST openAlgoOrders)
  trades: readonly TradeRow[]; fundingIncome: number; riskPct: number;
  capitalFallback: number; // vốn hiện tại — chỉ dùng khi nhật ký cũ không có vốn lúc vào lệnh
}): FundingGuardRun {
  const t = a.trade;
  const sym = t.symbol;
  const sid = t.signalId;
  const lockedLoss = lockedLossOf(a.trades, a.fundingIncome);
  const equityAtEntry = t.equityAtEntry ?? a.capitalFallback;
  const budget = (equityAtEntry * a.riskPct) / 100;
  const exitCostFrac = t.plan.costPct / 200;
  const mine = a.algos.filter((o) => o.symbol === sym && roleOfClientId(t, o.clientId) !== null);
  const stopsOf = (role: 'SL' | 'BE') => mine.filter((o) => roleOfClientId(t, o.clientId)!.role === role)
    .sort((x, y) => roleOfClientId(t, x.clientId)!.attempt - roleOfClientId(t, y.clientId)!.attempt);
  const be = stopsOf('BE');
  const sl = stopsOf('SL');
  const current = t.tp1Filled ? be[be.length - 1] : (be[be.length - 1] ?? sl[sl.length - 1]);
  const stopUsed = current !== undefined && current.triggerPrice > 0 ? current.triggerPrice : t.plan.stop;
  const actions: Action[] = [];
  const journal: JournalEventBody[] = [];
  const base = { side: t.side, qty: a.positionQty, avgEntry: a.avgEntry, lockedLoss, exitCostFrac };
  const lossBefore = lossAtStop(base, stopUsed);

  if (t.tp1Filled && current === undefined) {
    // Chỉ còn trailing (mức dừng lúc kích hoạt ≥ giá vào + phí): lỗ tại dừng ≈ lockedLoss — vượt ngân sách thì đóng phần còn lại
    const result: FundingGuardResult = lockedLoss <= budget + 1e-9
      ? { action: 'keep', lossAtStop: lockedLoss }
      : { action: 'close', reason: `sau TP1: lỗ đã chốt ${fmt(lockedLoss)} USDT (gồm funding) vượt ${a.riskPct}% vốn lúc vào (${fmt(budget)} USDT)` };
    if (result.action === 'close') pushClose(result.reason);
    return { result, lockedLoss, lossBefore: lockedLoss, stopUsed: NaN, budget, actions, journal };
  }

  const result = fundingGuard({ ...base, stop: stopUsed, markPrice: a.mark, equityAtEntry, riskPct: a.riskPct, tickSize: a.contract.tickSize });
  if (result.action === 'keep') return { result, lockedLoss, lossBefore, stopUsed, budget, actions, journal };
  if (result.action === 'close' || t.tp1Filled) {
    pushClose(result.action === 'close' ? result.reason : `sau TP1 cần siết dừng về ${result.stop} — không sửa được trailing, đóng phần còn lại`);
    return { result, lockedLoss, lossBefore, stopUsed, budget, actions, journal };
  }

  // Siết SL (trước TP1): lần thử mới của chân SL
  const leg = t.legs.SL;
  const attempt = leg === undefined ? 0 : leg.status === 'planned' ? leg.attempt : leg.attempt + 1;
  const clientId = legClientId(t, 'SL', attempt);
  const input: StopLossInput = { contract: a.contract, side: t.side, markPrice: a.mark, triggerPrice: result.stop, purpose: 'initial', id: { runId: t.runId, signalId: sid, leg: 'SL', attempt } };
  const why = `Chốt chặn funding: lỗ nếu chạm SL ${stopUsed} = ${fmt(lossBefore)} USDT (đã mất ${fmt(lockedLoss)} gồm phí + funding) > ${a.riskPct}% vốn lúc vào (${fmt(budget)} USDT) — siết SL về ${result.stop}`;
  journal.push({ type: 'stop_tightened', signalId: sid, stop: result.stop, reason: why });
  const old = [...sl, ...be];
  const head = old[old.length - 1];
  const fallback = t.stopReplaceFallback === true && head !== undefined;
  if (fallback) actions.push({ type: 'cancel_algo', symbol: sym, signalId: sid, clientId: head.clientId, algoId: head.algoId, onlyAfterPlaced: null, replacedBy: clientId, reason: `Thay lệnh dừng (cancel_then_place) bằng ${clientId}` });
  actions.push({
    type: 'place_stop', symbol: sym, signalId: sid, role: 'SL', purpose: 'initial', clientId, input, qty: null, replaces: head?.clientId ?? null,
    onReject: head !== undefined && !fallback ? 'stop_replace_rejected' : 'market_close', onRejectCancelEntries: [], reason: why,
  });
  for (const o of old) {
    if (fallback && o === head) continue;
    actions.push({ type: 'cancel_algo', symbol: sym, signalId: sid, clientId: o.clientId, algoId: o.algoId, onlyAfterPlaced: clientId, replacedBy: null, reason: `Thay lệnh dừng bằng ${clientId} (chốt chặn funding)` });
  }
  actions.push({ type: 'alert', level: 'warn', symbol: sym, signalId: sid, text: `${sym}: ${why}` });
  return { result, lockedLoss, lossBefore, stopUsed, budget, actions, journal };

  function pushClose(reason: string): void {
    actions.push({ type: 'market_close', symbol: sym, signalId: sid, side: t.side, qty: a.positionQty, reason: `Chốt chặn funding: ${reason}`, urgent: true });
    actions.push({ type: 'alert', level: 'urgent', symbol: sym, signalId: sid, text: `KHẨN ${sym}: đóng market ${a.positionQty} — chốt chặn funding: ${reason}` });
  }
}
