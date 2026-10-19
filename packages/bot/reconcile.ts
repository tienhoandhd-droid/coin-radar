import { COMMON } from '../core/config.ts';
import { snapToTick, tickDecimals } from '../core/price.ts';
import type { Contract, Mode, Side } from '../core/types.ts';
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
  // true: lần thay lệnh dừng trước bị sàn từ chối khi lệnh dừng cũ còn sống (stop_replace_rejected) → từ đó thay theo cancel_then_place
  stopReplaceFallback?: boolean;
  // B8b (main.ts ghi lúc nhận tín hiệu; nhật ký cũ có thể thiếu): vốn lúc vào lệnh (chốt chặn funding: lỗ ≤ 2% vốn LÚC VÀO),
  // rủi ro + notional theo planner (danh mục canOpen), chế độ (khung nến cooldown)
  equityAtEntry?: number;
  riskAmount?: number;
  notional?: number;
  mode?: Mode;
  outcomeRecorded?: boolean; // đã ghi trade_outcome (PnL sau phí + funding) — không tính lại
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

// Cách thay lệnh dừng (sàn không cho sửa lệnh algo — tài liệu tra cứu mục 4.5):
//   place_then_cancel = đặt lệnh mới TRƯỚC, sàn nhận rồi mới hủy cũ (không hở). Tài liệu KHÔNG nói hai lệnh dừng cùng chiều có cùng tồn tại
//                       được không (mục 4.4) → PHẢI KIỂM TRÊN DEMO, gồm cả việc lỗi kiểu -4130 ("đã có lệnh dừng closePosition cùng
//                       chiều", không có trong tài liệu tra cứu) có áp cho lệnh algo không.
//   cancel_then_place = hủy cũ rồi đặt mới NGAY (R5 cho phép khi sàn không cho hai lệnh dừng); đặt hỏng → đóng market khẩn (R2).
export type StopReplaceMode = 'place_then_cancel' | 'cancel_then_place';
export const DEFAULT_STOP_REPLACE: StopReplaceMode = 'place_then_cancel'; // phải kiểm trên Demo

export type ReconcileCtx = {
  now: number;
  markPrices: Readonly<Record<string, number>>;
  filters: Readonly<Record<string, Contract>>;
  capital: number; // vốn bot (USDT) — trần rủi ro 2%/lệnh tính trên vốn này
  stopReplace?: StopReplaceMode; // mặc định DEFAULT_STOP_REPLACE
};

export type AlertLevel = 'info' | 'warn' | 'urgent';
export type Action =
  // Đặt lệnh dừng STOP_MARKET. qty = null: closePosition (SL gốc); qty = số: reduce-only theo khối lượng (dừng sàn hòa vốn — tài liệu
  // mục 4.2 có `quantity` + `reduceOnly` cho algo, chỉ cấm đi cùng closePosition → cùng tồn tại được với SL gốc closePosition;
  // orders.ts CHƯA có bộ dựng cho dạng này — B5 phải thêm). Sàn từ chối (mọi kết quả không phải 'ok'):
  //   onReject 'market_close'          → không có lệnh dừng lành nào khác: hủy onRejectCancelEntries TRƯỚC, rồi đóng market + Telegram khẩn;
  //   onReject 'stop_replace_rejected' → đang thay, lệnh dừng cũ vẫn lành: GIỮ lệnh cũ, báo, ghi nhật ký stop_replace_rejected
  //                                       (lần đối chiếu sau dùng cancel_then_place). Mã/lời lỗi "trùng lệnh dừng" cụ thể chưa biết → mọi từ chối.
  | { type: 'place_stop'; symbol: string; signalId: string; role: 'SL' | 'BE'; purpose: StopPurpose; clientId: string; input: StopLossInput; qty: number | null; replaces: string | null;
      onReject: 'market_close' | 'stop_replace_rejected'; onRejectCancelEntries: Array<{ clientId: string; orderId: number }>; reason: string }
  | { type: 'place_tp1'; symbol: string; signalId: string; clientId: string; input: TakeProfitInput; replaces: string | null; reason: string }
  | { type: 'place_trailing'; symbol: string; signalId: string; clientId: string; input: TrailingInput; replaces: string | null; reason: string }
  // onlyAfterPlaced: chỉ hủy khi lệnh có mã này đã được sàn nhận (place_then_cancel).
  // replacedBy: cancel_then_place — lệnh dừng mới (mã này) đứng NGAY SAU trong danh sách, nơi gọi đặt ngay sau khi hủy.
  | { type: 'cancel_algo'; symbol: string; signalId: string | null; clientId: string; algoId: number; onlyAfterPlaced: string | null; replacedBy: string | null; reason: string }
  | { type: 'cancel_order'; symbol: string; signalId: string | null; clientId: string; orderId: number; reason: string }
  // Đóng market reduce-only toàn bộ khối lượng qty (chiều VỊ THẾ side) + Telegram khẩn
  | { type: 'market_close'; symbol: string; signalId: string | null; side: Side; qty: number; reason: string; urgent: true }
  // Giảm vị thế bằng market reduce-only (chỉ sau khi lệnh dừng đã nằm trên sàn — đứng sau place_stop trong danh sách)
  | { type: 'reduce_only'; symbol: string; signalId: string; side: Side; qty: number; reason: string }
  | { type: 'alert'; level: AlertLevel; symbol: string | null; signalId: string | null; text: string }
  // Vị thế lạ: nơi gọi khóa mã này (không mở lệnh mới, không đặt/hủy gì) tới khi người dùng xử lý
  | { type: 'adopt_unknown_position_noop'; symbol: string; positionAmt: number; text: string }
  // Không xác định được lệnh nào sở hữu vị thế: nơi gọi khóa mã (không mở/đặt/hủy gì) tới khi người dùng xử lý
  | { type: 'block_symbol'; symbol: string; reason: string }
  // Sổ sách (R8 f) — nơi gọi ghi vào nhật ký
  | { type: 'record_fill'; signalId: string; role: LegRole; fill: Fill }
  | { type: 'update_leg'; signalId: string; role: LegRole; clientId: string; status: LegStatus; reason: string }
  | { type: 'mark_trade_closed'; signalId: string; reason: string }
  // Mức dừng ĐANG nằm trên sàn khác plan.stop của nhật ký (> nửa tick) → sàn là sự thật: ghi mức này vào nhật ký
  | { type: 'sync_stop'; symbol: string; signalId: string; stop: number; reason: string }
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
    legs: {}, fills: [], tp1Filled: false, trailingActivated: false, stopReplaceFallback: false,
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

  // Chủ vị thế: lệnh còn hiệu lực cùng chiều có khớp vào (nhật ký t.fills HOẶC khớp mới gán được). Đúng một → chủ; nhiều lệnh có khớp,
  // hoặc không lệnh nào có khớp mà nhiều lệnh đang chờ → MƠ HỒ: báo khẩn + khóa mã, không đụng lệnh nào (không bao giờ đóng lệnh cũ).
  // Lệnh mới đang chờ không bao giờ chiếm vị thế của lệnh cũ đã có khớp.
  // Lệnh của bot đã được xử lý (không quét lại ở bước mồ côi) / lệnh thường đã phát cancel_order (không hủy hai lần)
  const handled = new Set<string>();
  const cancelledOrders = new Set<string>();
  const active = desired.filter((t) => t.status !== 'closed');
  const handsOff = new Set<string>();
  const owner = new Map<string, TradeState>(); // mã → lệnh sở hữu vị thế
  const hasEntryFill = (t: TradeState) => [...t.fills, ...attribute(t, ex.recentFills)].some((f) => ENTRY_ROLES.includes(f.role));
  for (const [symbol, p] of positions) {
    const cands = active.filter((t) => t.symbol === symbol && t.side === sideOfAmt(p.positionAmt));
    const filled = cands.filter(hasEntryFill);
    const o = filled.length === 1 ? filled[0] : filled.length === 0 && cands.length === 1 ? cands[0] : undefined;
    if (o === undefined && cands.length > 0) {
      handsOff.add(symbol);
      const reason = `Không xác định được lệnh sở hữu vị thế ${symbol} (${p.positionAmt}): ${cands.map((t) => t.signalId).join(', ')} — khóa mã, chờ bạn xử lý`;
      emit(2, { type: 'block_symbol', symbol, reason });
      alert(2, 'urgent', symbol, null, `KHẨN ${reason}`);
      protectBlocked(symbol, p, cands);
      continue;
    }
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

  for (const t of active) {
    if (handsOff.has(t.symbol)) continue;
    const own = owner.get(t.symbol);
    const others = active.filter((x) => x !== t && x.symbol === t.symbol);
    if (others.length > 0 && own === t) {
      alert(5, 'warn', t.symbol, t.signalId, `${t.symbol} có ${others.length + 1} lệnh còn hiệu lực cùng lúc — vị thế gán cho lệnh ${t.signalId}`);
    }
    processTrade(t, own === t ? positions.get(t.symbol)! : null);
  }

  // Mã bị khóa = không giao dịch MỚI; KHÔNG BAO GIỜ là để vị thế không có dừng. Hủy mọi lệnh vào còn treo của bot trên mã;
  // không có lệnh dừng nào của bot phủ cả vị thế → đặt SL closePosition ở mức CHẶT nhất (gần giá mark nhất, đúng phía) trong các
  // lệnh liên quan; không đặt được (thiếu mark/bộ lọc, mọi mức đã sai phía) → đóng khẩn.
  function protectBlocked(symbol: string, p: ExPosition, cands: TradeState[]): void {
    const qty = Math.abs(p.positionAmt);
    const side = sideOfAmt(p.positionAmt);
    const entries = ex.openOrders.filter((o) => o.symbol === symbol && isBot(o.clientId));
    for (const o of entries) {
      if (cancelledOrders.has(o.clientId)) continue;
      cancelledOrders.add(o.clientId);
      handled.add(o.clientId);
      emit(1, { type: 'cancel_order', symbol, signalId: null, clientId: o.clientId, orderId: o.orderId, reason: 'Mã bị khóa — hủy MỌI lệnh thường của bot trên mã (lệnh vào còn treo) để không nhập thêm vào vị thế' });
    }
    // Chỉ tính lệnh dừng ĐÚNG CHIỀU đóng vị thế (Long → SELL, Short → BUY); lệnh mồ côi ngược chiều không bảo vệ gì
    const closeSide = side === 'long' ? 'SELL' : 'BUY';
    const covered = ex.openAlgoOrders.some((o) => o.symbol === symbol && isBot(o.clientId) && o.orderType === 'STOP_MARKET' && o.side === closeSide && (o.closePosition || o.quantity >= qty));
    if (covered) return;
    // SL của lệnh liên quan đang không rõ trạng thái → tra lại trước, không đặt lần thử mới (có thể đã nằm trên sàn)
    const unknownSl = cands.filter((t) => t.legs.SL?.status === 'unknown');
    if (unknownSl.length > 0) {
      for (const t of unknownSl) emit(1, { type: 'query_algo', symbol, signalId: t.signalId, clientId: t.legs.SL!.clientId, reason: 'Mã bị khóa, SL trạng thái không rõ — tra lại trước khi đặt lại' });
      alert(1, 'urgent', symbol, null, `KHẨN ${symbol}: mã bị khóa, vị thế ${qty} chưa xác nhận được lệnh dừng — đang tra lại; tra xong sẽ đặt hoặc đóng`);
      return;
    }
    const close = (why: string) => {
      emit(1, { type: 'market_close', symbol, signalId: null, side, qty, reason: why, urgent: true });
      alert(1, 'urgent', symbol, null, `KHẨN ${symbol}: mã bị khóa, vị thế ${qty} không có lệnh dừng — đóng market: ${why}`);
    };
    const c = ctx.filters[symbol];
    const mark = ctx.markPrices[symbol];
    if (c === undefined) return close('thiếu bộ lọc sàn');
    if (!(typeof mark === 'number' && mark > 0 && Number.isFinite(mark))) return close('thiếu giá mark');
    const d = side === 'long' ? 1 : -1;
    const best = cands.filter((t) => d * (mark - t.plan.stop) > 0).sort((a, b) => d * (b.plan.stop - a.plan.stop))[0];
    if (best === undefined) return close(`giá mark ${mark} đã qua mọi mức dừng (${cands.map((t) => t.plan.stop).join(', ')})`);
    const input: StopLossInput = { contract: c, side, markPrice: mark, triggerPrice: best.plan.stop, purpose: 'initial', id: { runId: best.runId, signalId: best.signalId, leg: 'SL', attempt: nextAttemptOf(best, 'SL') } };
    const b = builders.stopLoss(input);
    if (!b.ok) return close(b.problems.join('; '));
    emit(1, { type: 'place_stop', symbol, signalId: best.signalId, role: 'SL', purpose: 'initial', clientId: b.clientId!, input, qty: null, replaces: null,
      onReject: 'market_close', onRejectCancelEntries: entries.map((o) => ({ clientId: o.clientId, orderId: o.orderId })), reason: 'Mã bị khóa nhưng vị thế không có lệnh dừng — SL ở mức chặt nhất' });
    alert(1, 'urgent', symbol, best.signalId, `KHẨN ${symbol}: mã bị khóa, vị thế ${qty} không có lệnh dừng — đặt SL ${best.plan.stop} (mức chặt nhất)`);
  }

  // (e) Lệnh của bot không thuộc lệnh còn hiệu lực nào
  for (const o of ex.openAlgoOrders) {
    if (!isBot(o.clientId) || handled.has(o.clientId) || handsOff.has(o.symbol)) continue;
    const t = desired.find((x) => roleOfClientId(x, o.clientId) !== null) ?? null;
    const why = positions.has(o.symbol) ? 'lệnh của lệnh cũ, vị thế hiện tại thuộc lệnh khác' : 'không còn vị thế';
    emit(3, { type: 'cancel_algo', symbol: o.symbol, signalId: t?.signalId ?? null, clientId: o.clientId, algoId: o.algoId, onlyAfterPlaced: null, replacedBy: null, reason: `Lệnh algo mồ côi (${why})` });
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
      if (leg.status === 'unknown' && (role === 'SL' || role === 'BE')) continue; // tra lại ở bước bảo vệ (pha 1)
      if (leg.status === 'unknown') emit(4, { type: 'query_algo', symbol: sym, signalId: sid, clientId: leg.clientId, reason: 'Lệnh algo trạng thái không rõ, không thấy trên sàn — tra lại' });
      else emit(4, { type: 'update_leg', signalId: sid, role, clientId: leg.clientId, status: 'gone', reason: 'Không còn trên sàn' });
    }
    if (tp1Filled && !t.tp1Filled && (tpLeg === undefined || !SENT.includes(tpLeg.status)) && tpLeg?.status !== 'filled') {
      emit(4, { type: 'update_leg', signalId: sid, role: 'TP1', clientId: tpLeg?.clientId ?? legClientId(t, 'TP1', 0), status: 'filled', reason: 'TP1 đã khớp' });
    }

    const cancelAllOf = (phase: Phase, reason: string) => {
      for (const o of myAlgos) emit(phase, { type: 'cancel_algo', symbol: sym, signalId: sid, clientId: o.clientId, algoId: o.algoId, onlyAfterPlaced: null, replacedBy: null, reason });
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
      for (const o of myAlgos) emit(3, { type: 'cancel_algo', symbol: sym, signalId: sid, clientId: o.clientId, algoId: o.algoId, onlyAfterPlaced: null, replacedBy: null, reason: 'Lệnh dừng/thoát mồ côi (chưa có vị thế)' });
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
    const latest = <T>(xs: T[]) => xs[xs.length - 1];
    // Mọi lệnh vào của bot còn treo trên mã (E1/E2 của mọi lệnh, kể cả phần IOC còn sót) — phải hủy TRƯỚC khi đóng khẩn
    const pendingEntries = () => ex.openOrders.filter((o) => o.symbol === sym && isBot(o.clientId));
    const cancelEntries = (phase: Phase, reason: string) => {
      for (const o of pendingEntries()) {
        if (cancelledOrders.has(o.clientId)) continue;
        cancelledOrders.add(o.clientId);
        handled.add(o.clientId);
        emit(phase, { type: 'cancel_order', symbol: sym, signalId: roleOfClientId(t, o.clientId) !== null ? sid : null, clientId: o.clientId, orderId: o.orderId, reason });
      }
    };
    const closeNow = (reason: string, phase: Phase = 1) => {
      cancelEntries(phase, 'Đóng khẩn — hủy lệnh vào còn treo trước để không mở lại vị thế');
      emit(phase, { type: 'market_close', symbol: sym, signalId: sid, side, qty: posQty, reason, urgent: true });
      alert(phase, 'urgent', sym, sid, `KHẨN ${sym}: đóng market ${posQty} — ${reason}`);
    };
    if (c === undefined) return closeNow('thiếu bộ lọc sàn của mã — không dựng được lệnh dừng');

    let placedCount = 0; // lệnh mới đặt trong lần đối chiếu này (đếm MAX_NUM_ORDERS)
    const openCount = () => ex.openOrders.filter((o) => o.symbol === sym).length + ex.openAlgoOrders.filter((o) => o.symbol === sym).length + placedCount;
    const nextAttempt = (role: LegRole) => nextAttemptOf(t, role);
    const mode: StopReplaceMode = t.stopReplaceFallback === true ? 'cancel_then_place' : ctx.stopReplace ?? DEFAULT_STOP_REPLACE;
    // Đặt lệnh dừng; không dựng được (giá mark đã qua mức dừng, thiếu giá mark) → đóng market khẩn. Trả mã lệnh mới hoặc null (đã đóng).
    // old = các lệnh dừng đang lành trên sàn sẽ bị thay: place_then_cancel → đặt mới (từ chối thì giữ cũ), hủy cũ sau khi mới lên sàn;
    // cancel_then_place → hủy lệnh cũ mới nhất ngay trước khi đặt (từ chối thì đóng khẩn), lần thử cũ hơn hủy sau.
    // trCover = khối lượng trailing đang phủ (sau TP1) — lệnh cũ chỉ được coi là "còn phủ đủ" khi closePosition hoặc tổng khối lượng
    // lệnh cũ + trailing ≥ vị thế; không phủ đủ thì từ chối lệnh mới → đóng khẩn (không giữ phần hở chờ lượt sau).
    const placeStop = (role: 'SL' | 'BE', purpose: StopPurpose, trigger: number, reason: string, qty: number | null, old: ExAlgoOrder[], trCover = 0): string | null => {
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
      const head = latest(old);
      const replacing = head !== undefined;
      const oldCovers = old.some((o) => o.closePosition) || old.reduce((sum, o) => sum + o.quantity, 0) + trCover >= posQty - eps;
      // Lệnh cũ toàn reduce-only theo khối lượng mà KHÔNG còn phủ đủ (vị thế lớn lên): đặt-trước thì cũ + mới + trailing > vị thế →
      // -2022 chắc chắn (tài liệu: lệnh reduce-only xung đột lệnh đang mở) → hủy cũ rồi đặt mới ngay (cancel_then_place).
      const how: StopReplaceMode = replacing && !oldCovers && old.every((o) => !o.closePosition) ? 'cancel_then_place' : mode;
      if (replacing && how === 'cancel_then_place') {
        emit(1, { type: 'cancel_algo', symbol: sym, signalId: sid, clientId: head.clientId, algoId: head.algoId, onlyAfterPlaced: null, replacedBy: clientId, reason: `Thay lệnh dừng (cancel_then_place) bằng ${clientId}` });
      }
      const onReject = replacing && how === 'place_then_cancel' && oldCovers ? 'stop_replace_rejected' : 'market_close';
      const onRejectCancelEntries = pendingEntries().map((o) => ({ clientId: o.clientId, orderId: o.orderId }));
      emit(1, { type: 'place_stop', symbol: sym, signalId: sid, role, purpose, clientId, input, qty, replaces: head?.clientId ?? null, onReject, onRejectCancelEntries, reason });
      placedCount++;
      for (const o of old) {
        if (how === 'cancel_then_place' && o === head) continue;
        cancelAlgo(o, clientId, `Thay lệnh dừng bằng ${clientId}`);
      }
      return clientId;
    };
    const cancelAlgo = (o: ExAlgoOrder, after: string | null, reason: string) =>
      emit(5, { type: 'cancel_algo', symbol: sym, signalId: sid, clientId: o.clientId, algoId: o.algoId, onlyAfterPlaced: after, replacedBy: null, reason });

    // Sàn hòa vốn theo giá khớp TB THẬT (D10, nghĩa vụ B3 #1): không bao giờ dưới giá khớp + phí → làm tròn về phía được bảo vệ
    const beRaw = avg * (1 + (d * t.plan.costPct) / 100);
    const beReal = snapToTick(beRaw, c.tickSize, d > 0 ? 'up' : 'down');
    const stopAtActivation = t.plan.activatePrice * (1 - (d * t.plan.callbackPct) / 100);
    const realFloorBroken = d * (stopAtActivation - beRaw) < 0; // callback không còn bảo đảm "mức dừng ≥ giá khớp thật + phí"
    const needsFloor = t.plan.needsBreakevenFloor || realFloorBroken;

    const sls = algosOf('SL');
    const bes = algosOf('BE');
    // Lệnh dừng (SL/BE) trạng thái không rõ mà không thấy trên sàn → TRA LẠI trước, không đặt lại mù trong cùng lượt.
    // Nơi gọi đối chiếu lại ngay khi có kết quả tra: không có trên sàn → leg_update 'gone' → lượt sau đặt lần thử mới.
    const queryUnknownStop = (role: 'SL' | 'BE'): boolean => {
      const leg = t.legs[role];
      if (leg?.status !== 'unknown') return false;
      emit(1, { type: 'query_algo', symbol: sym, signalId: sid, clientId: leg.clientId, reason: `Lệnh dừng ${role} trạng thái không rõ, không thấy trên sàn — tra lại trước khi đặt lại` });
      alert(1, 'urgent', sym, sid, `KHẨN ${sym}: chưa xác nhận được lệnh dừng ${role} ${leg.clientId} trên sàn — đang tra lại; tra xong sẽ đặt lại hoặc đóng`);
      return true;
    };

    if (!tp1Filled) {
      // ---- (c) SL gốc ----
      let stopPx = t.plan.stop;
      // Lệnh dừng phủ cả vị thế: closePosition, hoặc reduce-only có khối lượng ≥ vị thế (BE theo khối lượng khi vị thế đã lớn lên thì KHÔNG phủ)
      const covering = [...sls, ...bes].filter((o) => o.closePosition || o.quantity >= posQty - eps);
      if (covering.length === 0) {
        if (queryUnknownStop('SL')) return;
        const id = placeStop('SL', 'initial', t.plan.stop, 'Vị thế thiếu lệnh dừng phủ cả vị thế', null, []);
        if (id === null) return;
        // Lần đặt SL ĐẦU TIÊN ngay sau khi khớp vào (chân SL chưa từng gửi, khớp sớm nhất trong COMMON.bot.postFillStopBudgetMs) là bình thường
        // → info. SL đã từng gửi rồi mất / khớp đã lâu mà chưa có SL → KHẨN. Từ chối/không rõ khi đặt: executor báo KHẨN.
        const slLeg = t.legs.SL;
        const firstFill = entryFills.reduce((m, f) => Math.min(m, f.time), Infinity);
        const neverSent = slLeg === undefined || (slLeg.status === 'planned' && slLeg.orderIds.length === 0);
        const age = ctx.now - firstFill;
        if (neverSent && Number.isFinite(firstFill) && age <= COMMON.bot.postFillStopBudgetMs) {
          alert(1, 'info', sym, sid, `${sym}: đặt SL sau khi khớp vào — SL ${t.plan.stop} cho vị thế ${posQty} (khớp cách đây ${Math.max(0, age)} ms)`);
        } else {
          alert(1, 'urgent', sym, sid, `${sym}: vị thế ${posQty} THIẾU lệnh dừng phủ cả vị thế trên sàn — đặt lại SL ${t.plan.stop}${neverSent && Number.isFinite(firstFill) ? ` (khớp vào đã ${Math.round(age / 1000)} s)` : ''}`);
        }
      } else {
        const keep = latest(covering.filter((o) => bes.includes(o))) ?? latest(covering)!;
        stopPx = keep.triggerPrice > 0 ? keep.triggerPrice : t.plan.stop;
        // Sàn là sự thật (rà soát lại B8b vòng 2): nhật ký ghi mức dừng khác mức trên sàn → đồng bộ nhật ký theo sàn; sàn LỎNG hơn → KHẨN
        // (rủi ro thực theo mức trên sàn được kiểm ngay dưới: > 2% → giảm vị thế)
        if (keep.triggerPrice > 0 && Math.abs(keep.triggerPrice - t.plan.stop) > c.tickSize / 2) {
          const looser = d * (keep.triggerPrice - t.plan.stop) < 0;
          emit(4, { type: 'sync_stop', symbol: sym, signalId: sid, stop: keep.triggerPrice, reason: `Đồng bộ theo sàn: lệnh dừng trên sàn ${keep.triggerPrice}, nhật ký ${t.plan.stop}` });
          alert(4, looser ? 'urgent' : 'info', sym, sid, `${looser ? 'KHẨN ' : ''}${sym}: lệnh dừng trên sàn ${keep.triggerPrice} ${looser ? 'LỎNG hơn' : 'chặt hơn'} nhật ký ${t.plan.stop} — lấy mức trên sàn làm chuẩn`);
        }
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
          closeNow(`rủi ro thực ${pct}% sau trượt giá > ${COMMON.risk.perTradePct}%, khối lượng cho phép ${allowed} dưới mức tối thiểu — không giảm được`, 5);
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
      // BE + trailing = vị thế (không bao giờ vượt → không -2022 do tổng reduce-only): BE = vị thế − khối lượng trailing.
      // Trailing đã phủ cả vị thế mà vẫn cần sàn → BE closePosition (qty null; không phải reduce-only).
      const trQty = tr?.quantity ?? 0;
      const uncovered = fmtQ(posQty - trQty, step);
      const beQty = uncovered > eps ? uncovered : null;
      const beOk = (o: ExAlgoOrder) => o.closePosition || (beQty !== null && Math.abs(o.quantity - beQty) < eps);
      const keep = latest(bes);
      const why = needsFloor ? 'Dừng sàn hòa vốn sau TP1 (callback không bảo đảm hòa vốn)' : 'TP1 đã khớp, trailing chưa xác nhận kích hoạt — dời dừng về hòa vốn';
      if (keep === undefined) {
        if (queryUnknownStop('BE')) return;
        // Thay SL gốc theo chế độ thay lệnh. Giá mark đã lùi qua sàn → đóng market khẩn.
        if (placeStop('BE', 'breakeven', beReal, why, beQty, sls, trQty) === null) return;
      } else if (!beOk(keep)) {
        const r = `${why} — đổi cỡ BE ${keep.quantity} → ${beQty ?? 'closePosition'} theo vị thế ${posQty} − trailing ${trQty}`;
        if (placeStop('BE', 'breakeven', beReal, r, beQty, [...sls, ...bes], trQty) === null) return;
      } else {
        for (const o of [...sls, ...bes]) if (o !== keep) cancelAlgo(o, null, 'Đã có dừng hòa vốn trên sàn');
      }
    } else {
      for (const o of sls) cancelAlgo(o, null, 'TP1 đã khớp và trailing đã kích hoạt — trailing là lệnh dừng của phần còn lại (D9)');
      for (const o of bes.slice(0, -1)) cancelAlgo(o, null, 'Lần thử cũ của dừng hòa vốn');
    }
    for (const o of trs.slice(0, -1)) cancelAlgo(o, null, 'Lần thử cũ của trailing');
    for (const o of ordersOf('E2')) {
      if (!cancelledOrders.has(o.clientId)) emit(5, { type: 'cancel_order', symbol: sym, signalId: sid, clientId: o.clientId, orderId: o.orderId, reason: 'TP1 đã khớp — hủy chân limit chưa khớp' });
    }
  }
}

// Lần thử kế tiếp của một chân: chưa gửi → giữ lần thử hiện tại; đã gửi (dù kết quả gì) → lần thử mới (mã client mới)
function nextAttemptOf(t: TradeState, role: LegRole): number {
  const leg = t.legs[role];
  return leg === undefined || leg.status === 'planned' ? (leg?.attempt ?? 0) : leg.attempt + 1;
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
