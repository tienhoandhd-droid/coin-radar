import { COMMON } from '../core/config.ts';
import { snapToTick, tickDecimals } from '../core/price.ts';
import type { Contract, Side } from '../core/types.ts';
import {
  builders, makeClientId,
  type StopLossInput, type StopPurpose, type TakeProfitInput, type TrailingInput,
} from '../binance/orders.ts';
import { exitSplit, type PlannerResult } from './planner.ts';

// Bộ đối chiếu (B4, thiết kế D6, yêu cầu R8): trạng thái MONG MUỐN (lệnh của bot, từ nhật ký) × trạng thái THẬT trên sàn
// → danh sách hành động. Hàm THUẦN: không gửi gì, không đọc giờ máy, không đọc file. Nơi gọi (executor, B5) thực hiện các
// hành động THEO ĐÚNG THỨ TỰ trả về.
//
// Thứ tự theo R8: (c) vị thế thiếu dừng → đặt dừng hoặc đóng; (d) vị thế lạ → báo, không giao dịch mã đó; (e) lệnh mồ côi
// (không còn vị thế) → hủy; (f) cập nhật lệnh cục bộ đã khớp/hủy; sau đó mới tới việc khác (giảm vị thế khi trượt giá,
// đặt/đổi cỡ TP1 và trailing, hủy lệnh dừng cũ sau khi lệnh mới đã lên sàn). (a), (b), (g) là việc của nơi gọi.
//
// Bất biến: không bao giờ phát hành động để một vị thế không có lệnh dừng. Thay lệnh dừng = đặt mới TRƯỚC, hủy cũ SAU
// (sàn không cho sửa lệnh algo); lệnh hủy mang `onlyAfterPlaced` = mã lệnh mới, nơi gọi chỉ hủy khi lệnh mới đã được sàn nhận.
// Không dựng được lệnh dừng (giá mark đã qua mức dừng, thiếu giá mark, thiếu bộ lọc) → market_close khẩn.

export type LegRole = 'E1' | 'E2' | 'SL' | 'TP1' | 'TR' | 'BE';
// planned = chưa gửi; intent = đã ghi ý định, chưa có kết quả; unknown = gửi rồi nhưng sàn trả trạng thái không rõ (phải tra lại);
// gone = không còn trên sàn mà không rõ đã khớp hay đã hủy (lệnh algo vắng khi bot vắng mặt)
export type LegStatus = 'planned' | 'intent' | 'open' | 'filled' | 'cancelled' | 'rejected' | 'unknown' | 'gone';
export type LegState = {
  role: LegRole;
  clientId: string; // mã client của LẦN THỬ hiện tại (makeClientId với attempt)
  attempt: number;
  status: LegStatus;
  qty: number | null; // khối lượng đã gửi (lệnh vào, TP1, trailing); null với lệnh dừng closePosition
  triggerPrice: number | null;
  orderIds: number[]; // orderId thật trên sàn (lệnh vào; lệnh thật sinh ra khi algo kích hoạt — ALGO_UPDATE.ai) để gán khớp
};

// Một lần khớp (userTrades / ORDER_TRADE_UPDATE). clientId: mã client của lệnh khớp nếu nơi gọi biết (userTrades không có),
// null nếu không — khi đó gán theo orderId.
export type Fill = { tradeId: number; orderId: number; clientId: string | null; symbol: string; side: 'BUY' | 'SELL'; qty: number; price: number; time: number };
export type AttributedFill = Fill & { role: LegRole };

export type TradePlanState = {
  stop: number; // SL gốc (đã làm tròn tick như gửi sàn)
  tp1: number;
  activatePrice: number; // = TP1
  callbackPct: number;
  costPct: number; // phí + trượt khứ hồi (% giá vào) — dùng tính sàn hòa vốn và rủi ro thực
  needsBreakevenFloor: boolean; // planner: callback không bảo đảm "mức dừng lúc kích hoạt ≥ giá vào + phí"
  leverage: number;
  qtyStep: number; // exitRule.qtyStep
  tp1Pct: number; // exitRule.tp1Pct
  limitCancelAt: number | null; // hủy chân limit (E2) khi giá mark chạm mức này (TP1 tới trước)
};

export type TradeState = {
  signalId: string;
  symbol: string;
  side: Side;
  runId: string; // mã lần chạy khi tạo lệnh — giữ nguyên suốt đời lệnh để mã client của mọi lần thử luôn gán về đúng lệnh
  createdAt: number; // ms — khớp xảy ra TRƯỚC thời điểm này không bao giờ được gán cho lệnh (Freqtrade #13399)
  status: 'pending' | 'open' | 'closed';
  closedReason: string | null;
  plan: TradePlanState;
  legs: Partial<Record<LegRole, LegState>>;
  fills: AttributedFill[]; // các lần khớp ĐÃ gán cho lệnh này
  tp1Filled: boolean;
  trailingActivated: boolean; // ALGO_UPDATE.ia = true của lệnh trailing
};

// Trạng thái thật trên sàn (REST: positionRisk v3, openOrders, openAlgoOrders, userTrades)
export type ExPosition = { symbol: string; positionAmt: number; entryPrice: number; liquidationPrice: number | null };
export type ExOrder = { symbol: string; orderId: number; clientId: string; type: string; side: 'BUY' | 'SELL'; origQty: number; executedQty: number; price: number; status: string };
export type ExAlgoOrder = {
  symbol: string; algoId: number; clientId: string; orderType: string; side: 'BUY' | 'SELL';
  quantity: number; triggerPrice: number; closePosition: boolean; algoStatus: string;
  activated: boolean | null; // trailing đã kích hoạt chưa (ALGO_UPDATE.ia); null = sàn/REST không cho biết
};
export type ExchangeState = { positions: ExPosition[]; openOrders: ExOrder[]; openAlgoOrders: ExAlgoOrder[]; recentFills: Fill[] };

export type ReconcileCtx = {
  now: number;
  markPrices: Readonly<Record<string, number>>;
  filters: Readonly<Record<string, Contract>>;
  capital: number; // vốn bot (USDT) — trần rủi ro 2%/lệnh tính trên vốn này
};

export type AlertLevel = 'info' | 'warn' | 'urgent';
export type Action =
  // Đặt lệnh dừng (STOP_MARKET closePosition). Sàn từ chối (stop_rejected / mọi kết quả không phải 'ok') → nơi gọi đóng market + Telegram khẩn
  | { type: 'place_stop'; symbol: string; signalId: string; role: 'SL' | 'BE'; purpose: StopPurpose; clientId: string; input: StopLossInput; replaces: string | null; onReject: 'market_close'; reason: string }
  | { type: 'place_tp1'; symbol: string; signalId: string; clientId: string; input: TakeProfitInput; replaces: string | null; reason: string }
  | { type: 'place_trailing'; symbol: string; signalId: string; clientId: string; input: TrailingInput; replaces: string | null; reason: string }
  // onlyAfterPlaced: chỉ hủy khi lệnh có mã này đã được sàn nhận (thay lệnh không để hở)
  | { type: 'cancel_algo'; symbol: string; signalId: string | null; clientId: string; algoId: number; onlyAfterPlaced: string | null; reason: string }
  | { type: 'cancel_order'; symbol: string; signalId: string | null; clientId: string; orderId: number; reason: string }
  // Đóng market reduce-only toàn bộ khối lượng qty (chiều VỊ THẾ side) + Telegram khẩn
  | { type: 'market_close'; symbol: string; signalId: string | null; side: Side; qty: number; reason: string; urgent: true }
  // Giảm vị thế bằng market reduce-only (chỉ sau khi lệnh dừng đã nằm trên sàn — đứng sau place_stop trong danh sách)
  | { type: 'reduce_only'; symbol: string; signalId: string; side: Side; qty: number; reason: string }
  | { type: 'alert'; level: AlertLevel; symbol: string | null; signalId: string | null; text: string }
  // Vị thế lạ: nơi gọi khóa mã này (không mở lệnh mới, không đặt/hủy gì) tới khi người dùng xử lý
  | { type: 'adopt_unknown_position_noop'; symbol: string; positionAmt: number; text: string }
  // Sổ sách (R8 f) — nơi gọi ghi vào nhật ký
  | { type: 'record_fill'; signalId: string; role: LegRole; fill: Fill }
  | { type: 'update_leg'; signalId: string; role: LegRole; clientId: string; status: LegStatus; reason: string }
  | { type: 'mark_trade_closed'; signalId: string; reason: string }
  // Trạng thái không rõ → tra lại (queryOrder / queryAlgo), không gửi lại mù
  | { type: 'query_order'; symbol: string; signalId: string; clientId: string; reason: string }
  | { type: 'query_algo'; symbol: string; signalId: string; clientId: string; reason: string };

const ROLES: readonly LegRole[] = ['E1', 'E2', 'SL', 'TP1', 'TR', 'BE'];
const ENTRY_ROLES: readonly LegRole[] = ['E1', 'E2'];
const BOT_PREFIX = 'cr-';
const SENT: readonly LegStatus[] = ['intent', 'open', 'unknown'];

// Mã client của một chân ở lần thử `attempt` (cùng công thức với planner)
export function legClientId(t: Pick<TradeState, 'runId' | 'signalId'>, role: LegRole, attempt: number): string {
  return makeClientId({ runId: t.runId, signalId: t.signalId, leg: role, attempt });
}

// "cr-<run>-<hash>-<leg>-" — mọi lần thử của một chân có chung tiền tố này
function legPrefix(t: Pick<TradeState, 'runId' | 'signalId'>, role: LegRole): string {
  return legClientId(t, role, 0).slice(0, -1);
}

export function roleOfClientId(t: Pick<TradeState, 'runId' | 'signalId'>, clientId: string): { role: LegRole; attempt: number } | null {
  for (const role of ROLES) {
    const p = legPrefix(t, role);
    if (clientId.startsWith(p) && /^\d{1,3}$/.test(clientId.slice(p.length))) return { role, attempt: Number(clientId.slice(p.length)) };
  }
  return null;
}

// Lệnh mới từ kết quả planner (đã cho vào). costPct = phí + trượt khứ hồi của kế hoạch (PlannerPlan.costPct).
export function tradeFromPlan(a: { signalId: string; runId: string; now: number; result: PlannerResult; costPct: number }): TradeState {
  const r = a.result;
  if (!r.allowed || r.sizing === null || r.legs.length === 0) throw new Error('tradeFromPlan: kết quả planner không cho vào lệnh');
  const first = r.legs[0]!;
  const t: TradeState = {
    signalId: a.signalId, symbol: first.input.contract.symbol, side: first.input.side, runId: a.runId, createdAt: a.now,
    status: 'pending', closedReason: null,
    plan: {
      stop: NaN, tp1: NaN, activatePrice: NaN, callbackPct: NaN, costPct: a.costPct, needsBreakevenFloor: false,
      leverage: r.sizing.leverage, qtyStep: r.exitRule.qtyStep, tp1Pct: r.exitRule.tp1Pct, limitCancelAt: null,
    },
    legs: {}, fills: [], tp1Filled: false, trailingActivated: false,
  };
  for (const l of r.legs) {
    const leg = (qty: number | null, trig: number | null): LegState => ({ role: l.role, clientId: l.clientId, attempt: 0, status: 'planned', qty, triggerPrice: trig, orderIds: [] });
    if (l.op === 'placeEntry') {
      t.legs[l.role] = leg(l.input.qty, null);
      if (l.cancelIfMarkReaches !== null) t.plan.limitCancelAt = l.cancelIfMarkReaches;
    } else if (l.op === 'placeStopLoss') {
      t.legs[l.role] = leg(null, l.input.triggerPrice);
      if (l.role === 'SL') t.plan.stop = l.input.triggerPrice;
      else t.plan.needsBreakevenFloor = true;
    } else if (l.op === 'placeTakeProfit') {
      t.legs.TP1 = leg(l.input.qty, l.input.triggerPrice);
      t.plan.tp1 = l.input.triggerPrice;
    } else {
      t.legs.TR = leg(l.input.qty, l.input.activatePrice);
      t.plan.activatePrice = l.input.activatePrice;
      t.plan.callbackPct = l.input.callbackPct;
    }
  }
  return t;
}

// ---- Đối chiếu ----------------------------------------------------------------------------------------------------------
type Phase = 1 | 2 | 3 | 4 | 5; // 1 = (c) dừng, 2 = (d) vị thế lạ, 3 = (e) mồ côi, 4 = (f) sổ sách, 5 = việc khác
type Out = { phase: Phase; seq: number; action: Action };

const isBot = (clientId: string) => clientId.startsWith(BOT_PREFIX);
const sideOfAmt = (amt: number): Side => (amt > 0 ? 'long' : 'short');
const fmtQ = (x: number, step: number) => Number(x.toFixed(tickDecimals(step)));
const floorStep = (x: number, step: number) => (x > 0 && Number.isFinite(x) ? fmtQ(Math.floor(x / step + 1e-9) * step, step) : 0);
const vn = (x: number) => String(x).replace('.', ',');

export function reconcile(desired: readonly TradeState[], ex: ExchangeState, ctx: ReconcileCtx): Action[] {
  const out: Out[] = [];
  let seq = 0;
  const emit = (phase: Phase, action: Action) => out.push({ phase, seq: seq++, action });
  const alert = (phase: Phase, level: AlertLevel, symbol: string | null, signalId: string | null, text: string) =>
    emit(phase, { type: 'alert', level, symbol, signalId, text });

  const positions = new Map<string, ExPosition>();
  for (const p of ex.positions) if (p.positionAmt !== 0) positions.set(p.symbol, p);

  // Lệnh còn hiệu lực theo mã. Mỗi mã: vị thế thuộc lệnh MỚI NHẤT cùng chiều (ưu tiên lệnh đã có khớp)
  const active = desired.filter((t) => t.status !== 'closed');
  const handsOff = new Set<string>();
  const owner = new Map<string, TradeState>(); // mã → lệnh sở hữu vị thế
  for (const [symbol, p] of positions) {
    const cands = active.filter((t) => t.symbol === symbol && t.side === sideOfAmt(p.positionAmt))
      .sort((a, b) => b.createdAt - a.createdAt);
    const withFills = cands.find((t) => attribute(t, ex.recentFills).some((f) => ENTRY_ROLES.includes(f.role)));
    const o = withFills ?? cands[0];
    if (o === undefined) {
      handsOff.add(symbol);
      const text = `Vị thế LẠ trên ${symbol}: ${p.positionAmt} (giá vào ${p.entryPrice}) — bot không biết lệnh này, KHÔNG tự giao dịch mã này cho tới khi bạn xử lý`;
      emit(2, { type: 'adopt_unknown_position_noop', symbol, positionAmt: p.positionAmt, text });
      alert(2, 'urgent', symbol, null, text);
      continue;
    }
    owner.set(symbol, o);
  }

  // Lệnh của bot đã được một lệnh còn hiệu lực xử lý (không quét lại ở bước mồ côi)
  const handled = new Set<string>();

  for (const t of active) {
    if (handsOff.has(t.symbol)) continue;
    const own = owner.get(t.symbol);
    const others = active.filter((x) => x !== t && x.symbol === t.symbol);
    if (others.length > 0 && own === t) {
      alert(5, 'warn', t.symbol, t.signalId, `${t.symbol} có ${others.length + 1} lệnh còn hiệu lực cùng lúc — vị thế gán cho lệnh ${t.signalId}`);
    }
    processTrade(t, own === t ? positions.get(t.symbol)! : null);
  }

  // (e) Lệnh của bot không thuộc lệnh còn hiệu lực nào
  for (const o of ex.openAlgoOrders) {
    if (!isBot(o.clientId) || handled.has(o.clientId) || handsOff.has(o.symbol)) continue;
    const t = desired.find((x) => roleOfClientId(x, o.clientId) !== null) ?? null;
    const why = positions.has(o.symbol) ? 'lệnh của lệnh cũ, vị thế hiện tại thuộc lệnh khác' : 'không còn vị thế';
    emit(3, { type: 'cancel_algo', symbol: o.symbol, signalId: t?.signalId ?? null, clientId: o.clientId, algoId: o.algoId, onlyAfterPlaced: null, reason: `Lệnh algo mồ côi (${why})` });
  }
  for (const o of ex.openOrders) {
    if (!isBot(o.clientId) || handled.has(o.clientId) || handsOff.has(o.symbol)) continue;
    const t = desired.find((x) => roleOfClientId(x, o.clientId) !== null) ?? null;
    emit(3, { type: 'cancel_order', symbol: o.symbol, signalId: t?.signalId ?? null, clientId: o.clientId, orderId: o.orderId, reason: 'Lệnh mồ côi của bot (không thuộc lệnh còn hiệu lực)' });
  }

  return out.sort((a, b) => a.phase - b.phase || a.seq - b.seq).map((o) => o.action);

  // ---- Một lệnh -------------------------------------------------------------------------------------------------------
  function processTrade(t: TradeState, pos: ExPosition | null): void {
    const sid = t.signalId;
    const sym = t.symbol;
    const step = t.plan.qtyStep;
    const eps = step / 2;
    const myAlgos = ex.openAlgoOrders.filter((o) => o.symbol === sym && roleOfClientId(t, o.clientId) !== null);
    const myOrders = ex.openOrders.filter((o) => o.symbol === sym && roleOfClientId(t, o.clientId) !== null);
    for (const o of [...myAlgos, ...myOrders]) handled.add(o.clientId);
    const algosOf = (role: LegRole) => myAlgos.filter((o) => roleOfClientId(t, o.clientId)!.role === role)
      .sort((a, b) => roleOfClientId(t, a.clientId)!.attempt - roleOfClientId(t, b.clientId)!.attempt);
    const ordersOf = (role: LegRole) => myOrders.filter((o) => roleOfClientId(t, o.clientId)!.role === role);
    const onExchange = (clientId: string) => myAlgos.some((o) => o.clientId === clientId) || myOrders.some((o) => o.clientId === clientId);

    // ---- Khớp: đã biết + mới gán (theo mã client / orderId của CHÍNH lệnh này, sau lúc tạo lệnh) ----
    const known = new Set(t.fills.map((f) => f.tradeId));
    const fresh = attribute(t, ex.recentFills).filter((f) => !known.has(f.tradeId));
    for (const f of fresh) {
      const { role, ...fill } = f;
      emit(4, { type: 'record_fill', signalId: sid, role, fill });
    }
    const fills = [...t.fills, ...fresh];
    const entryFills = fills.filter((f) => ENTRY_ROLES.includes(f.role));
    const F = fmtQ(entryFills.reduce((s, f) => s + f.qty, 0), step);
    const vwap = F > 0 ? entryFills.reduce((s, f) => s + f.qty * f.price, 0) / entryFills.reduce((s, f) => s + f.qty, 0) : NaN;
    const filledOf = (role: LegRole) => fills.filter((f) => f.role === role).reduce((s, f) => s + f.qty, 0);
    const posQty = pos === null ? 0 : Math.abs(pos.positionAmt);

    // ---- TP1 đã khớp? (nhật ký, khớp gán được, hoặc suy ra: TP1 đã gửi, biến mất khỏi sàn và vị thế đã giảm đúng phần TP1) ----
    const tpLeg = t.legs.TP1;
    const tp1Planned = tpLeg?.qty ?? exitSplit(F, step).tp1Qty;
    const tp1Inferred = pos !== null && tpLeg !== undefined && SENT.includes(tpLeg.status) && algosOf('TP1').length === 0
      && F > 0 && posQty <= F - tp1Planned + eps;
    const tp1Filled = t.tp1Filled || tpLeg?.status === 'filled' || filledOf('TP1') > 0 || tp1Inferred;

    // ---- (f) Sổ sách: chân cục bộ đang chờ/mở mà sàn đã khác ----
    for (const role of ROLES) {
      const leg = t.legs[role];
      if (leg === undefined || !SENT.includes(leg.status)) continue;
      const isEntry = ENTRY_ROLES.includes(role);
      if (onExchange(leg.clientId)) {
        if (leg.status !== 'open') emit(4, { type: 'update_leg', signalId: sid, role, clientId: leg.clientId, status: 'open', reason: 'Đã thấy trên sàn' });
        continue;
      }
      if (isEntry) {
        if (filledOf(role) > 0) emit(4, { type: 'update_leg', signalId: sid, role, clientId: leg.clientId, status: 'filled', reason: `Đã khớp ${vn(fmtQ(filledOf(role), step))}` });
        else if (leg.status === 'unknown') emit(4, { type: 'query_order', symbol: sym, signalId: sid, clientId: leg.clientId, reason: 'Lệnh vào trạng thái không rõ, không thấy trên sàn — tra lại, không gửi lại' });
        else emit(4, { type: 'update_leg', signalId: sid, role, clientId: leg.clientId, status: 'cancelled', reason: 'Không còn trên sàn và không có khớp (đã hủy/hết hạn)' });
        continue;
      }
      if (role === 'TP1' && tp1Filled) {
        emit(4, { type: 'update_leg', signalId: sid, role, clientId: leg.clientId, status: 'filled', reason: 'TP1 đã khớp' });
        continue;
      }
      if (leg.status === 'unknown') emit(4, { type: 'query_algo', symbol: sym, signalId: sid, clientId: leg.clientId, reason: 'Lệnh algo trạng thái không rõ, không thấy trên sàn — tra lại' });
      else emit(4, { type: 'update_leg', signalId: sid, role, clientId: leg.clientId, status: 'gone', reason: 'Không còn trên sàn' });
    }
    if (tp1Filled && !t.tp1Filled && (tpLeg === undefined || !SENT.includes(tpLeg.status)) && tpLeg?.status !== 'filled') {
      emit(4, { type: 'update_leg', signalId: sid, role: 'TP1', clientId: tpLeg?.clientId ?? legClientId(t, 'TP1', 0), status: 'filled', reason: 'TP1 đã khớp' });
    }

    const cancelAllOf = (phase: Phase, reason: string) => {
      for (const o of myAlgos) emit(phase, { type: 'cancel_algo', symbol: sym, signalId: sid, clientId: o.clientId, algoId: o.algoId, onlyAfterPlaced: null, reason });
      for (const o of myOrders) emit(phase, { type: 'cancel_order', symbol: sym, signalId: sid, clientId: o.clientId, orderId: o.orderId, reason });
    };

    // ---- Không có vị thế ----
    if (pos === null) {
      if (F > 0 || t.status === 'open') {
        cancelAllOf(3, 'Lệnh đã đóng trên sàn (không còn vị thế) — hủy lệnh còn lại');
        emit(4, { type: 'mark_trade_closed', signalId: sid, reason: 'Không còn vị thế trên sàn' });
        alert(4, 'info', sym, sid, `${sym}: lệnh ${sid} đã đóng trên sàn khi đối chiếu`);
        return;
      }
      // Đang chờ khớp: lệnh thoát/dừng không có vị thế là mồ côi; giữ lệnh vào
      for (const o of myAlgos) emit(3, { type: 'cancel_algo', symbol: sym, signalId: sid, clientId: o.clientId, algoId: o.algoId, onlyAfterPlaced: null, reason: 'Lệnh dừng/thoát mồ côi (chưa có vị thế)' });
      // Lệnh vào còn sống: đang nằm trên sàn, chưa gửi, hoặc đang tra lại (không rõ trạng thái)
      const entryAlive = ENTRY_ROLES.some((r) => ordersOf(r).length > 0 || t.legs[r]?.status === 'planned' || t.legs[r]?.status === 'unknown');
      if (!entryAlive) emit(4, { type: 'mark_trade_closed', signalId: sid, reason: 'Lệnh vào không khớp (đã hủy/hết hạn)' });
      return;
    }

    // ---- Có vị thế ----
    const c = ctx.filters[sym];
    const mark = ctx.markPrices[sym];
    const side = t.side;
    const d = side === 'long' ? 1 : -1;
    if (F === 0) alert(5, 'warn', sym, sid, `${sym}: có vị thế ${posQty} nhưng chưa thấy lần khớp nào của lệnh ${sid} — dùng giá vào của sàn ${pos.entryPrice}`);
    else if (posQty > F + eps) alert(5, 'warn', sym, sid, `${sym}: vị thế ${posQty} lớn hơn tổng khớp của bot ${F} — lệnh thoát định cỡ theo phần của bot`);
    const avg = F > 0 ? vwap : pos.entryPrice;
    const closeNow = (reason: string) => {
      emit(1, { type: 'market_close', symbol: sym, signalId: sid, side, qty: posQty, reason, urgent: true });
      alert(1, 'urgent', sym, sid, `KHẨN ${sym}: đóng market ${posQty} — ${reason}`);
    };
    if (c === undefined) return closeNow('thiếu bộ lọc sàn của mã — không dựng được lệnh dừng');

    let placedCount = 0; // lệnh mới đặt trong lần đối chiếu này (đếm MAX_NUM_ORDERS)
    const openCount = () => ex.openOrders.filter((o) => o.symbol === sym).length + ex.openAlgoOrders.filter((o) => o.symbol === sym).length + placedCount;
    const nextAttempt = (role: LegRole) => {
      const leg = t.legs[role];
      return leg === undefined || leg.status === 'planned' ? (leg?.attempt ?? 0) : leg.attempt + 1;
    };
    // Đặt lệnh dừng; không dựng được (giá mark đã qua mức dừng, thiếu giá mark) → đóng market khẩn. Trả mã lệnh mới hoặc null (đã đóng).
    const placeStop = (role: 'SL' | 'BE', purpose: StopPurpose, trigger: number, reason: string, replaces: string | null): string | null => {
      if (!(typeof mark === 'number' && mark > 0 && Number.isFinite(mark))) {
        closeNow(`thiếu giá mark — không kiểm được lệnh dừng ${role} ${trigger}`);
        return null;
      }
      const attempt = nextAttempt(role);
      const id = { runId: t.runId, signalId: sid, leg: role, attempt };
      const input: StopLossInput = { contract: c, side, markPrice: mark, triggerPrice: trigger, purpose, id };
      const b = builders.stopLoss(input);
      if (!b.ok) {
        closeNow(`không đặt được lệnh dừng ${role} ${trigger} (giá mark ${mark}): ${b.problems.join('; ')}`);
        return null;
      }
      const clientId = b.clientId!;
      emit(1, { type: 'place_stop', symbol: sym, signalId: sid, role, purpose, clientId, input, replaces, onReject: 'market_close', reason });
      placedCount++;
      return clientId;
    };
    const cancelAlgo = (o: ExAlgoOrder, after: string | null, reason: string) =>
      emit(5, { type: 'cancel_algo', symbol: sym, signalId: sid, clientId: o.clientId, algoId: o.algoId, onlyAfterPlaced: after, reason });

    // Sàn hòa vốn theo giá khớp TB THẬT (D10, nghĩa vụ B3 #1): không bao giờ dưới giá khớp + phí → làm tròn về phía được bảo vệ
    const beRaw = avg * (1 + (d * t.plan.costPct) / 100);
    const beReal = snapToTick(beRaw, c.tickSize, d > 0 ? 'up' : 'down');
    const stopAtActivation = t.plan.activatePrice * (1 - (d * t.plan.callbackPct) / 100);
    const realFloorBroken = d * (stopAtActivation - beRaw) < 0; // callback không còn bảo đảm "mức dừng ≥ giá khớp thật + phí"
    const needsFloor = t.plan.needsBreakevenFloor || realFloorBroken;

    const sls = algosOf('SL');
    const bes = algosOf('BE');
    const latest = <T>(xs: T[]) => xs[xs.length - 1];

    if (!tp1Filled) {
      // ---- (c) SL gốc ----
      let stopPx = t.plan.stop;
      if (sls.length === 0 && bes.length === 0) {
        const id = placeStop('SL', 'initial', t.plan.stop, 'Vị thế thiếu lệnh dừng', null);
        if (id === null) return;
        alert(1, 'urgent', sym, sid, `${sym}: vị thế ${posQty} THIẾU lệnh dừng trên sàn — đặt lại SL ${t.plan.stop}`);
      } else {
        const keep = latest(bes) ?? latest(sls)!;
        stopPx = keep.triggerPrice > 0 ? keep.triggerPrice : t.plan.stop;
        for (const o of [...sls, ...bes]) if (o !== keep) cancelAlgo(o, null, 'Lần thử cũ của lệnh dừng (lần mới đã nằm trên sàn)');
      }
      if (realFloorBroken && !t.plan.needsBreakevenFloor) {
        alert(5, 'warn', sym, sid, `${sym}: giá khớp thật ${vn(Number(avg.toFixed(8)))} làm callback ${t.plan.callbackPct}% không còn bảo đảm hòa vốn — sẽ đặt dừng sàn hòa vốn sau TP1`);
      }
      if (pos.liquidationPrice !== null && pos.liquidationPrice > 0 && d * (stopPx - pos.liquidationPrice) <= 0) {
        alert(5, 'urgent', sym, sid, `KHẨN ${sym}: giá thanh lý ${pos.liquidationPrice} nằm trước SL ${stopPx} — SL không kịp chạy`);
      }

      // ---- Rủi ro thực ở giá khớp thật (nghĩa vụ B3 #3): > 2% → giảm bằng reduce-only, SAU khi SL đã nằm trên sàn ----
      let base = floorStep(F > 0 ? Math.min(F, posQty) : posQty, step);
      const perUnit = Math.abs(avg - stopPx) + (avg * t.plan.costPct) / 100;
      const budget = (ctx.capital * COMMON.risk.perTradePct) / 100;
      const risk = posQty * perUnit;
      if (risk > budget * (1 + 1e-9)) {
        const allowed = floorStep(budget / perUnit, step);
        const pct = ((risk / ctx.capital) * 100).toFixed(2).replace('.', ',');
        if (allowed < Math.max(c.minQty, c.marketMinQty)) {
          emit(5, { type: 'market_close', symbol: sym, signalId: sid, side, qty: posQty, reason: `rủi ro thực ${pct}% > ${COMMON.risk.perTradePct}% và khối lượng cho phép ${allowed} dưới mức tối thiểu`, urgent: true });
          alert(5, 'urgent', sym, sid, `KHẨN ${sym}: rủi ro thực ${pct}% sau trượt giá, không giảm được về ${COMMON.risk.perTradePct}% — đóng market`);
          return;
        }
        const cut = fmtQ(posQty - allowed, step);
        emit(5, { type: 'reduce_only', symbol: sym, signalId: sid, side, qty: cut, reason: `Rủi ro thực ${pct}% ở giá khớp TB ${vn(Number(avg.toFixed(8)))} > ${COMMON.risk.perTradePct}% — giảm ${cut} về ${allowed}` });
        alert(5, 'warn', sym, sid, `${sym}: trượt giá làm rủi ro thực ${pct}% — giảm vị thế ${cut} (reduce-only) về ${COMMON.risk.perTradePct}%`);
        base = Math.min(base, allowed);
      }

      // ---- Chân limit E2: hủy khi giá chạm mức hủy (TP1 tới trước) ----
      if (t.plan.limitCancelAt !== null && typeof mark === 'number' && d * (mark - t.plan.limitCancelAt) >= 0) {
        for (const o of ordersOf('E2')) emit(5, { type: 'cancel_order', symbol: sym, signalId: sid, clientId: o.clientId, orderId: o.orderId, reason: `Giá mark ${mark} đã chạm ${t.plan.limitCancelAt} trước khi limit khớp` });
      }

      // ---- TP1 + trailing theo khối lượng ĐÃ khớp (nghĩa vụ B3 #4) ----
      const want = exitSplit(base, step);
      ensureExit('TP1', want.tp1Qty);
      ensureExit('TR', want.trailQty);
      return;

      function ensureExit(role: 'TP1' | 'TR', qty: number): void {
        const live = algosOf(role);
        const cur = latest(live);
        if (cur !== undefined && Math.abs(cur.quantity - qty) < eps) {
          for (const o of live) if (o !== cur) cancelAlgo(o, null, `Lần thử cũ của ${role}`);
          return;
        }
        const leg = t.legs[role];
        if (cur === undefined && leg?.status === 'unknown') return; // đang tra lại (query_algo ở bước sổ sách), không gửi lại mù
        if (!(qty > 0)) return;
        const attempt = nextAttempt(role);
        const id = { runId: t.runId, signalId: sid, leg: role, attempt };
        const reason = cur === undefined ? `Thiếu ${role} trên sàn` : `Đổi cỡ ${role} ${cur.quantity} → ${qty} theo khối lượng đã khớp`;
        let placed: string | null = null;
        if (role === 'TP1') {
          const input: TakeProfitInput = { contract: c!, side, entryPrice: avg, triggerPrice: t.plan.tp1, qty, id, openCount: openCount() };
          const b = builders.takeProfit(input);
          if (b.ok) {
            placed = b.clientId!;
            emit(5, { type: 'place_tp1', symbol: sym, signalId: sid, clientId: placed, input, replaces: cur?.clientId ?? null, reason });
          } else alert(5, 'warn', sym, sid, `${sym}: không đặt được TP1 ${qty}: ${b.problems.join('; ')} — vị thế vẫn có lệnh dừng`);
        } else {
          const input: TrailingInput = { contract: c!, side, entryPrice: avg, activatePrice: t.plan.activatePrice, callbackPct: t.plan.callbackPct, qty, id, openCount: openCount() };
          const b = builders.trailing(input);
          if (b.ok) {
            placed = b.clientId!;
            emit(5, { type: 'place_trailing', symbol: sym, signalId: sid, clientId: placed, input, replaces: cur?.clientId ?? null, reason });
          } else alert(5, 'warn', sym, sid, `${sym}: không đặt được trailing ${qty}: ${b.problems.join('; ')} — vị thế vẫn có lệnh dừng`);
        }
        if (placed === null) return;
        placedCount++;
        for (const o of live) cancelAlgo(o, placed, `Thay ${role} bằng ${placed}`);
      }
    }

    // ---- TP1 đã khớp ----
    const trs = algosOf('TR');
    const tr = latest(trs);
    const trailingOk = tr !== undefined && (t.trailingActivated || tr.activated === true) && tr.quantity >= posQty - eps;
    if (tr === undefined) alert(5, 'warn', sym, sid, `${sym}: TP1 đã khớp nhưng không thấy trailing trên sàn — giữ lệnh dừng hòa vốn cho phần còn lại`);
    const needBE = needsFloor || !trailingOk;
    if (needBE) {
      if (bes.length === 0) {
        // Dừng sàn hòa vốn trước, rồi mới hủy SL gốc (thay không hở). Giá mark đã lùi qua sàn → đóng market khẩn.
        const id = placeStop('BE', 'breakeven', beReal, needsFloor ? 'Dừng sàn hòa vốn sau TP1 (callback không bảo đảm hòa vốn)' : 'TP1 đã khớp, trailing chưa xác nhận kích hoạt — dời dừng về hòa vốn', latest(sls)?.clientId ?? null);
        if (id === null) return;
        for (const o of sls) cancelAlgo(o, id, `Thay SL gốc bằng dừng hòa vốn ${id}`);
      } else {
        const keep = latest(bes)!;
        for (const o of [...sls, ...bes]) if (o !== keep) cancelAlgo(o, null, 'Đã có dừng hòa vốn trên sàn');
      }
    } else {
      for (const o of sls) cancelAlgo(o, null, 'TP1 đã khớp và trailing đã kích hoạt — trailing là lệnh dừng của phần còn lại (D9)');
      for (const o of bes.slice(0, -1)) cancelAlgo(o, null, 'Lần thử cũ của dừng hòa vốn');
    }
    for (const o of trs.slice(0, -1)) cancelAlgo(o, null, 'Lần thử cũ của trailing');
    for (const o of ordersOf('E2')) emit(5, { type: 'cancel_order', symbol: sym, signalId: sid, clientId: o.clientId, orderId: o.orderId, reason: 'TP1 đã khớp — hủy chân limit chưa khớp' });
  }
}

// Khớp thuộc về lệnh t: cùng mã, KHÔNG trước lúc tạo lệnh, và mã client là của một chân của CHÍNH lệnh này (mọi lần thử)
// hoặc orderId đã ghi cho một chân của lệnh này. Không bao giờ gán theo mã giao dịch (symbol) — chặn lỗi Freqtrade #13399.
function attribute(t: TradeState, fills: readonly Fill[]): AttributedFill[] {
  const out: AttributedFill[] = [];
  for (const f of fills) {
    if (f.symbol !== t.symbol || f.time < t.createdAt) continue;
    let role: LegRole | null = f.clientId !== null ? roleOfClientId(t, f.clientId)?.role ?? null : null;
    if (role === null) role = ROLES.find((r) => t.legs[r]?.orderIds.includes(f.orderId)) ?? null;
    if (role !== null) out.push({ ...f, role });
  }
  return out;
}
