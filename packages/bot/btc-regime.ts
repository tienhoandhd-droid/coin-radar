import { COMMON } from '../core/config.ts';
import { snapToTick, tickDecimals } from '../core/price.ts';
import { entryLegProblems, isStepMultiple } from '../core/filters.ts';
import { regimeCostPct, regimeNotional, regimeStop } from '../core/btc-regime.ts';
import type { Contract } from '../core/types.ts';
import { builders, bracketSlots, makeClientId, type ClientIdParts, type EntryInput } from '../binance/orders.ts';
import type { DesiredOrder, PlannerResult } from './planner.ts';

// Lệnh vào của hệ BTC theo chế độ (chế độ bot 'btc-regime', luật đã khóa — packages/core/btc-regime.ts). Hàm THUẦN như planner.ts:
// trả PlannerResult (cùng kiểu với Swing) để main.ts đi ĐÚNG đường gửi lệnh / nhật ký / đối chiếu của Swing (tradeFromPlan → order_intent →
// placeEntry → reconcile đặt SL ngay khi khớp). Bộ lệnh chỉ có HAI chân: E1 = LIMIT IOC (chân "market" của bot, giá trần = mark × (1 + entryCapPct%))
// và SL = STOP_MARKET closePosition theo MARK_PRICE. Không TP1, không trailing (luật: không trailing; thoát khi tín hiệu tắt hoặc chạm SL).
// Long, đòn bẩy 1× (notional ≤ 1 × vốn nên 1× là đủ).

export type RegimeSizing =
  | { ok: true; worstEntry: number; stop: number; qty: number; notional: number; riskAmount: number; costPct: number; qtyStep: number }
  | { ok: false; reason: string };

const floorQ = (x: number, step: number) => (x > 0 && Number.isFinite(x) ? Number((Math.floor(x / step + 1e-9) * step).toFixed(tickDecimals(step))) : 0);

// Khối lượng theo luật ở giá xấu nhất (giá trần IOC). SL tính từ giá mark (giá vào dự kiến) như luật "giá vào − 2,5 × ATR";
// khoảng SL để định cỡ đo từ giá trần → lỗ khi chạm SL (gồm phí 2 chiều + trượt) ≤ 2% vốn ở MỌI giá khớp được phép.
export function regimeEntrySizing(a: { contract: Contract; capital: number; markPrice: number; atr: number }): RegimeSizing {
  const c = a.contract;
  if (!(a.markPrice > 0) || !Number.isFinite(a.markPrice)) return { ok: false, reason: `giá mark ${a.markPrice} không hợp lệ` };
  if (!(a.atr > 0) || !Number.isFinite(a.atr)) return { ok: false, reason: `ATR ${a.atr} không hợp lệ` };
  if (!(a.capital > 0) || !Number.isFinite(a.capital)) return { ok: false, reason: `vốn ${a.capital} không hợp lệ` };
  const worstEntry = snapToTick(a.markPrice * (1 + COMMON.btcRegime.entryCapPct / 100), c.tickSize, 'down');
  const stop = snapToTick(regimeStop(a.markPrice, a.atr), c.tickSize, 'down');
  if (!(stop > 0) || !(stop < a.markPrice)) return { ok: false, reason: `SL ${stop} không hợp lệ (giá mark ${a.markPrice}, ATR ${a.atr})` };
  const notional = regimeNotional({ equity: a.capital, entry: worstEntry, stop });
  const qtyStep = Math.max(c.stepSize, c.marketStepSize);
  const qty = floorQ(notional / worstEntry, qtyStep);
  const costPct = regimeCostPct();
  if (!(qty > 0)) return { ok: false, reason: `khối lượng ${notional.toFixed(2)} USDT ÷ ${worstEntry} nhỏ hơn bước ${qtyStep}` };
  return { ok: true, worstEntry, stop, qty, notional: qty * worstEntry, riskAmount: riskOf(qty, worstEntry, stop, costPct), costPct, qtyStep };
}

const riskOf = (qty: number, entry: number, stop: number, costPct: number) => qty * (entry - stop + (entry * costPct) / 100);

// Bộ lệnh (E1 IOC + SL) với khối lượng cuối qty (≤ khối lượng luật — nơi gọi đã cắt theo danh mục canOpen). Vi phạm → allowed=false, legs=[].
export function planRegimeEntry(a: {
  contract: Contract; sizing: Extract<RegimeSizing, { ok: true }>; qty: number; capital: number; markPrice: number;
  signalId: string; runId: string; now: number; openOrderCount: number;
}): PlannerResult {
  const c = a.contract;
  const s = a.sizing;
  const exitRule: PlannerResult['exitRule'] = { basis: 'filled_qty', tp1Pct: 0, qtyStep: s.qtyStep };
  const problems: string[] = [];
  const reject = (...rs: string[]): PlannerResult => ({ allowed: false, reasons: [...problems, ...rs], legs: [], sizing: null, exitByFill: [], exitRule });
  if (!COMMON.bot.modes.includes('btc-regime')) return reject(`Bot: chế độ btc-regime đang tắt (COMMON.bot.modes = ${COMMON.bot.modes.join(', ')})`);
  if (c.symbol !== COMMON.btcRegime.symbol) return reject(`Hệ btc-regime chỉ giao dịch ${COMMON.btcRegime.symbol}, nhận ${c.symbol}`);
  const qty = floorQ(Math.min(a.qty, s.qty), s.qtyStep);
  if (!(qty > 0)) return reject(`Khối lượng ${a.qty} nhỏ hơn bước ${s.qtyStep}`);
  if (!isStepMultiple(qty, c.stepSize) || !isStepMultiple(qty, c.marketStepSize)) problems.push(`Khối lượng ${qty} không theo bước`);
  problems.push(...entryLegProblems({ kind: 'limit', price: Math.min(a.markPrice, s.worstEntry), qty }, c));
  if (s.worstEntry < a.markPrice) problems.push(`Giá trần ${s.worstEntry} dưới giá mark ${a.markPrice}`);
  const riskAmount = riskOf(qty, s.worstEntry, s.stop, s.costPct);
  const realRiskPct = (riskAmount / a.capital) * 100;
  if (realRiskPct > COMMON.risk.perTradePct + 1e-9) problems.push(`Rủi ro thực ${realRiskPct.toFixed(4)}% vượt ${COMMON.risk.perTradePct}%/lệnh`);
  const notional = qty * s.worstEntry;
  if (notional > COMMON.btcRegime.maxNotionalX * a.capital * (1 + 1e-9)) problems.push(`Giá trị vị thế ${notional.toFixed(2)} vượt ${COMMON.btcRegime.maxNotionalX} × vốn ${a.capital}`);
  const slots = bracketSlots({ entryLegs: 1, tp1: false, trailing: false, breakevenFloor: false });
  if (a.openOrderCount + slots > c.maxNumOrders) problems.push(`Đã có ${a.openOrderCount} lệnh mở trên ${c.symbol}; bộ lệnh cần ${slots} sẽ vượt MAX_NUM_ORDERS ${c.maxNumOrders}`);
  const idOf = (leg: string): ClientIdParts => ({ runId: a.runId, signalId: a.signalId, leg, attempt: 0 });
  let e1Id = '';
  let slId = '';
  try {
    e1Id = makeClientId(idOf('E1'));
    slId = makeClientId(idOf('SL'));
  } catch (e) {
    problems.push(`Mã client sai: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (problems.length > 0) return reject();
  const input: EntryInput = { contract: c, side: 'long', qty, id: idOf('E1'), openCount: a.openOrderCount, reserveSlots: slots, kind: 'limit', limitPrice: s.worstEntry, ioc: true };
  const legs: DesiredOrder[] = [
    { op: 'placeEntry', role: 'E1', when: 'now', clientId: e1Id, input, cancelIfMarkReaches: null },
    { op: 'placeStopLoss', role: 'SL', when: 'on_entry_fill', clientId: slId, input: { contract: c, side: 'long', triggerPrice: s.stop, purpose: 'initial', id: idOf('SL') } },
  ];
  // Chốt chặn cuối: đúng bộ dựng request của orders.ts (như planner.ts bước 10)
  const be = builders.entry(input, a.now);
  if (!be.ok) problems.push(...be.problems.map((x) => `E1: ${x}`));
  const bs = builders.stopLoss({ contract: c, side: 'long', triggerPrice: s.stop, purpose: 'initial', id: idOf('SL'), markPrice: a.markPrice });
  if (!bs.ok) problems.push(...bs.problems.map((x) => `SL: ${x}`));
  if (problems.length > 0) return reject();
  const reasons = qty < s.qty ? [`Khối lượng giảm ${s.qty} → ${qty} BTC do giới hạn danh mục/ký quỹ`] : [];
  return {
    allowed: true, reasons, legs, exitRule,
    exitByFill: [{ filled: ['E1'], positionQty: qty, tp1Qty: 0, trailQty: 0 }],
    sizing: {
      requestedQty: s.qty, qty, adjusted: qty < s.qty, riskAmount, realRiskPct, leverage: 1, notional, marginNeeded: notional, worstEntry: s.worstEntry, costPct: s.costPct,
      riskModel: { a: riskAmount / qty, b: 0, fundingPerUnit: 0, fundingSettlements: 0 },
    },
  };
}

// Mã tín hiệu của một lần vào lệnh: một mã cho mỗi nến quyết định (khử trùng: một ngày tối đa một lệnh vào)
export const regimeSignalId = (closeTime: number) => `${COMMON.btcRegime.symbol}|btc-regime|long|${new Date(closeTime + 1).toISOString().slice(0, 10)}`;
