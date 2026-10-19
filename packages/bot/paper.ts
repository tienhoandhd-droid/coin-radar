import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ALGO_PATH, CLIENT_ID_RE, ORDER_PATH, createOrders } from '../binance/orders.ts';
import { classify, type RequestOpts, type SignedResult } from '../binance/signed.ts';
import { parseUserEvent, type MarketEvent, type UserEvent } from '../binance/stream.ts';
import { COMMON } from '../core/config.ts';
import { isStepMultiple } from '../core/filters.ts';
import { tickDecimals } from '../core/price.ts';
import type { Candle, Contract, Side } from '../core/types.ts';
import {
  addToPosition, bankruptX, entryFee, exitExecX, exitFee, exitPnl, fundingAmount, fundingMark, fundingTimeFloor, liquidationX, qRound,
  reduceQty, roundPx, takerEntryFill, toX, trailActivatedPeakX, trailStopX, type FillCost,
} from './fill-model.ts';

// Sàn giả lập cho chế độ `paper` (B7, thiết kế D4): giá thật (mark 1 s + nến đã đóng từ WebSocket), khớp giả lập.
//
// CÙNG ĐƯỜNG CODE với demo/live: sàn giả lập là một `api` có cùng hình dạng với REST có ký (signed.ts: request(RequestOpts) →
// SignedResult), nên bot dùng NGUYÊN createOrders (orders.ts) — mọi bộ dựng, kiểm tại chỗ và chốt chặn R1 chạy y hệt. Phía "sàn"
// đọc đúng tham số Binance nhận (chuỗi), kiểm luật sàn, trả thân phản hồi cùng tên trường, và phát sự kiện user data dạng THÔ
// (ORDER_TRADE_UPDATE / ACCOUNT_UPDATE / ALGO_UPDATE) đọc qua đúng parseUserEvent của stream.ts.
//
// MÔ HÌNH KHỚP = bộ mô phỏng backtest (backtest/simulate.ts); mọi công thức (phí, trượt theo cỡ, giá khớp, PnL, funding, trailing,
// thanh lý) lấy từ fill-model.ts. Thứ tự sự kiện:
//  - Nhịp MARK (điểm giá p, giờ t): lệnh GTD hết hạn → lệnh taker chờ (MARKET, LIMIT IOC) khớp ở p + trượt theo cỡ, IOC chỉ phần
//    trong giá trần (takerEntryFill) → gap qua giá thanh lý → mọi sự kiện bị vượt khớp Ở GIÁ p: phía BẤT LỢI trước (gần nhất trước),
//    rồi phía có lợi → nâng đỉnh trailing. Như giá mở nến của simulate.ts (mục 5): mỗi nhịp mark là một điểm giá.
//  - Lệnh điều kiện (SL/TP/trailing) CHỈ kích hoạt theo MARK (workingType MARK_PRICE; lệnh khác bị từ chối). Trailing kích hoạt khi
//    mark chạm activatePrice, theo đỉnh mark, đóng khi mark hồi callback (trailStopX).
//  - Nến đã đóng: nếu trong nến KHÔNG có nhịp mark nào được xét (openTime > mốc giá cuối đã xét — mất luồng mark / máy tắt) → quét
//    nến như simulate.ts: giá mở là một điểm, rồi đi tới cực BẤT LỢI (sự kiện khớp ĐÚNG mức), rồi tới cực có lợi (bỏ phía có lợi
//    khi vị thế vừa mở giữa nến); giá nến (giao dịch) thay cho mark. Ngược lại (mark đã phủ) → nến chỉ dùng cho lệnh LIMIT chờ:
//    giá giao dịch đi qua mức limit thì khớp đúng giá limit (chỉ lệnh đặt trước giờ mở nến). Không kích hoạt lệnh điều kiện theo nến.
//  - Lệnh chỉ được xét với giá có mốc ≥ giờ đặt lệnh (không nhìn trước). MARKET/IOC: phản hồi RESULT chờ tới nhịp giá kế tiếp;
//    quá responseTimeoutMs không có nhịp nào → phản hồi 503 -1007 (unknown_status như sàn thật), lệnh vẫn được xét ở nhịp sau.
//  - Phí: mỗi lần khớp nửa phí nhóm (COMMON.costRoundTripPct, gồm trượt nền) báo trong trường commission (USDT); trượt theo cỡ làm
//    giá khớp xấu đi. Ký quỹ: đòn bẩy theo /fapi/v1/leverage (mặc định defaultLeverage), giá thanh lý = công thức isolated ước tính.
//
// LUẬT SÀN (docs/reference/binance-usdm-api.md): bộ lọc tick/step/minQty/maxQty/MIN_NOTIONAL (reduce-only được miễn); reduce-only
// không được tăng vị thế (-2022; lệnh algo reduce-only kiểm lúc KÍCH HOẠT → REJECTED "Reduce Only reject", mục 4.6/6.3);
// closePosition chỉ với STOP_MARKET/TAKE_PROFIT_MARKET, không đi cùng quantity (-4137) / reduceOnly (-4138), kích hoạt đóng TOÀN BỘ
// vị thế lúc đó; MAX_NUM_ORDERS mỗi mã tính cả lệnh thường lẫn algo (-2025); trần lệnh điều kiện toàn tài khoản 200 (-4045, change
// log 2025-12-29); lệnh điều kiện qua /fapi/v1/order → -4120; sẽ kích hoạt ngay → -4142 (SL/TP) / -2021 (trailing); mã client trùng
// trong số lệnh đang mở → -4116; One-way (positionSide khác BOTH → -4061). Tham số sai mà tài liệu tra cứu không nêu mã riêng →
// PARAM_REJECT [Đề xuất]. Sàn KHÔNG tự hủy lệnh khi vị thế đóng (bot tự hủy lệnh mồ côi). Lệnh thật sinh ra khi algo kích hoạt có
// mã client riêng (paper-algo-<algoId>) — nối bằng ALGO_UPDATE.ai ↔ orderId (tài liệu không nói mã client, mục 6.3).
//
// LƯU TRẠNG THÁI: ví, vị thế, lệnh, lịch sử khớp → statePath (mặc định data/bot/paper-state.json, thư mục đã git-ignore), ghi NGUYÊN
// TỬ (tệp tạm + rename) sau mỗi thao tác làm đổi trạng thái; khởi động lại thì khôi phục, như sàn thật vẫn chạy khi bot tắt.
// GIỚI HẠN KHOẢNG TẮT MÁY: lúc tắt không có giá nào → lệnh lẽ ra kích hoạt chỉ được xét khi bot NHẬN LẠI giá sau khi chạy lại.
//  (1) Nơi gọi (B8) phải nạp các nến đã đóng trong khoảng tắt (REST/backfill) TRƯỚC khi nạp mark trực tiếp; chúng được quét như trên
//      (giá giao dịch thay mark, khớp đúng mức). (2) Nến chứa mốc tắt máy đã được xét một phần → không quét lại (có thể chứa giá trước
//      lúc tắt); sự kiện trong phần còn lại của nến đó chỉ được xét ở điểm giá kế tiếp (gap: khớp ở giá đó). (3) Thiếu nến → sự kiện
//      được xét ở nhịp mark đầu tiên sau khi chạy lại, khớp ở giá nhịp đó (như gap). Funding đã chốt lúc tắt: nơi gọi nạp lại qua
//      feedFunding (mỗi kỳ chỉ tính một lần).
// KHÔNG MÔ PHỎNG: countdownCancelAll (nhận, không hủy gì), priceProtect, lệnh STOP/TAKE_PROFIT có giá, FOK/GTX, Hedge, ký quỹ cross,
// MAX_NUM_ALGO_ORDERS theo mã (đã bị xóa khỏi exchangeInfo), hàng chờ sổ lệnh (limit khớp khi chạm — như simulate.ts mục 10).

export const DEFAULT_PAPER_STATE_PATH = 'data/bot/paper-state.json';
export const PAPER_PARAM_REJECT = -1102; // [Đề xuất] mã chung cho tham số sai mà tài liệu tra cứu không nêu mã riêng
const MAX_CONDITIONAL_TOTAL = 200; // change log 2025-12-29: "The conditional order limits is 200 across all symbols" (mục 4.4)
const DEFAULT_LEVERAGE = 20; // [Đề xuất] tài liệu tra cứu không nêu đòn bẩy mặc định; bot luôn gọi setLeverage trước khi vào lệnh
const GTD_MAX = 253402300799000;
const STATE_VERSION = 1;

type BS = 'BUY' | 'SELL';
type OrderStatus = 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'EXPIRED';
type AlgoStatus = 'NEW' | 'CANCELED' | 'TRIGGERED' | 'FINISHED' | 'REJECTED' | 'EXPIRED';
type AlgoType = 'STOP_MARKET' | 'TAKE_PROFIT_MARKET' | 'TRAILING_STOP_MARKET';

type POrder = {
  orderId: number; clientOrderId: string; symbol: string; side: BS; type: 'LIMIT' | 'MARKET'; origType: string;
  tif: 'GTC' | 'IOC' | 'GTD' | null; price: number; origQty: number; executedQty: number; cumQuote: number;
  reduceOnly: boolean; closePosition: boolean; status: OrderStatus; goodTillDate: number; time: number; updateTime: number;
};
type PAlgo = {
  algoId: number; clientAlgoId: string; symbol: string; side: BS; orderType: AlgoType;
  quantity: number | null; closePosition: boolean; reduceOnly: boolean; priceProtect: boolean;
  triggerPrice: number | null; activatePrice: number | null; callbackRate: number | null;
  peakX: number | null; // trailing đã kích hoạt: đỉnh (không gian x của chiều vị thế lệnh bảo vệ)
  status: AlgoStatus; createTime: number; updateTime: number; triggerTime: number | null;
  actualOrderId: number | null; actualPrice: number | null; actualQty: number | null; rejectReason: string | null;
};
type PPos = { qty: number; d: 1 | -1; avgX: number; openedAt: number | null; liqX: number | null; cumRealized: number };
type SymState = { leverage: number; marginType: 'ISOLATED' | 'CROSSED'; pos: PPos; lastPrice: number | null; lastPriceTime: number; lastFundingT: number };
type TradeRow = {
  id: number; orderId: number; symbol: string; side: BS; price: number; qty: number; quoteQty: number; commission: number;
  realizedPnl: number; buyer: boolean; maker: boolean; time: number;
};
type IncomeRow = { symbol: string; incomeType: 'FUNDING_FEE'; income: number; time: number; tranId: number };
type PaperState = {
  version: number; wallet: number; seq: { order: number; algo: number; trade: number; tran: number };
  symbols: Record<string, SymState>; orders: POrder[]; algos: PAlgo[]; trades: TradeRow[]; income: IncomeRow[];
};

export type PaperInjection = {
  match: (req: RequestOpts) => boolean;
  status: number; body: unknown; // phản hồi giả (vd 503 {code:-1007}) — phân loại bằng đúng classify của signed.ts
  apply: boolean; // true: sàn VẪN thực hiện request (lệnh có lên sàn) rồi trả phản hồi giả; false: không thực hiện gì
  times?: number; // số lần áp (mặc định 1)
};
export type PaperTimers = { set(fn: () => void, ms: number): unknown; clear(h: unknown): void };
export type PaperOptions = {
  contracts: Readonly<Record<string, Contract>>;
  cost: (symbol: string) => FillCost; // mô hình phí/trượt theo mã (như simulate: nhóm thanh khoản + KL 1 phút)
  startBalance: number; // ví USDT khi chưa có tệp trạng thái
  statePath?: string | null; // null = không lưu (test)
  now?: () => number;
  defaultLeverage?: number;
  maxConditionalTotal?: number;
  responseTimeoutMs?: number; // chờ nhịp giá cho phản hồi MARKET/IOC (mặc định 5000)
  timers?: PaperTimers;
  historyLimit?: number; // số lệnh/khớp đã đóng giữ lại để tra (mặc định 1000)
};

type Reply = { status: number; body: unknown };
const ok = (body: unknown): Reply => ({ status: 200, body });
const err = (code: number, msg: string, status = 400): Reply => ({ status, body: { code, msg } });
const NO_COUNT = { tenSec: null, oneMin: null };
const toResult = (r: Reply): SignedResult => ({ ...classify(r.status, r.body), status: r.status, body: r.body, orderCount: NO_COUNT });
const UNKNOWN: Reply = { status: 503, body: { code: -1007, msg: 'Timeout waiting for response from backend server. Send status unknown; execution status unknown.' } };

const dirOf = (side: BS): 1 | -1 => (side === 'BUY' ? 1 : -1);
const sideOfD = (d: 1 | -1): Side => (d > 0 ? 'long' : 'short');
const isOpenOrder = (o: POrder) => o.status === 'NEW' || o.status === 'PARTIALLY_FILLED';
const isTaker = (o: POrder) => o.type === 'MARKET' || o.tif === 'IOC';

type Ev = { level: number; dir: 'down' | 'up'; prio: number; seq: number } & (
  { kind: 'limit'; order: POrder } | { kind: 'stop' | 'tp' | 'trail' | 'activate'; algo: PAlgo } | { kind: 'liq' });

export function createPaperExchange(opts: PaperOptions) {
  const now = opts.now ?? Date.now;
  const statePath = opts.statePath === undefined ? DEFAULT_PAPER_STATE_PATH : opts.statePath;
  const defaultLeverage = opts.defaultLeverage ?? DEFAULT_LEVERAGE;
  const maxCondTotal = opts.maxConditionalTotal ?? MAX_CONDITIONAL_TOTAL;
  const timeoutMs = opts.responseTimeoutMs ?? 5_000;
  const timers: PaperTimers = opts.timers ?? { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };
  const historyLimit = opts.historyLimit ?? 1000;

  const st: PaperState = statePath !== null && existsSync(statePath) ? load(statePath) : {
    version: STATE_VERSION, wallet: opts.startBalance, seq: { order: 0, algo: 0, trade: 0, tran: 0 }, symbols: {}, orders: [], algos: [], trades: [], income: [],
  };
  for (const [sym, s] of Object.entries(st.symbols)) {
    if (opts.contracts[sym] === undefined && (s.pos.qty > 0 || st.orders.some((o) => o.symbol === sym && isOpenOrder(o)) || st.algos.some((a) => a.symbol === sym && a.status === 'NEW'))) {
      throw new Error(`paper: tệp trạng thái có vị thế/lệnh mở trên ${sym} nhưng không có bộ lọc sàn của mã này`);
    }
  }

  let dirty = false;
  const rawEvents: Array<Record<string, unknown>> = [];
  const listeners: Array<(e: UserEvent) => void> = [];
  const injections: Array<PaperInjection & { left: number }> = [];
  const waiting = new Map<number, { resolve: (r: SignedResult) => void; timer: unknown }>();
  const settled: POrder[] = []; // lệnh taker đã xong trong thao tác hiện tại → trả phản hồi đang chờ

  // ---------------------------------------------------------------- trạng thái theo mã ---------------------------------------------
  function contract(sym: string): Contract {
    const c = opts.contracts[sym];
    if (c === undefined) throw new Error(`paper: thiếu bộ lọc sàn của ${sym}`);
    return c;
  }
  const qStepOf = (sym: string) => { const c = contract(sym); return Math.max(c.stepSize, c.marketStepSize); };
  function sym(s: string): SymState {
    let x = st.symbols[s];
    if (x === undefined) {
      x = { leverage: defaultLeverage, marginType: 'CROSSED', pos: { qty: 0, d: 1, avgX: 0, openedAt: null, liqX: null, cumRealized: 0 }, lastPrice: null, lastPriceTime: 0, lastFundingT: 0 };
      st.symbols[s] = x;
    }
    return x;
  }
  const fmtP = (s: string, x: number) => x.toFixed(tickDecimals(contract(s).tickSize));
  const fmtQ = (s: string, q: number) => q.toFixed(tickDecimals(Math.min(contract(s).stepSize, contract(s).marketStepSize)));
  const num = (x: number) => String(roundPx(x));

  // ---------------------------------------------------------------- sự kiện user data (thô → parseUserEvent) ------------------------
  function positionRaw(s: string) {
    const S = sym(s);
    const p = S.pos;
    const amt = p.qty > 0 ? p.d * p.qty : 0;
    const ep = p.qty > 0 ? roundPx(toX(p.d, p.avgX)) : 0;
    return { s, pa: fmtQ(s, amt), ep: num(ep), bep: num(ep), cr: num(p.cumRealized), up: num(unrealized(s)), mt: S.marginType === 'ISOLATED' ? 'isolated' : 'cross', iw: num(isolatedMargin(s)), ps: 'BOTH' };
  }
  function emitAccount(s: string, reason: 'ORDER' | 'FUNDING_FEE', t: number, bc: number) {
    rawEvents.push({ e: 'ACCOUNT_UPDATE', E: t, T: t, a: { m: reason, B: [{ a: 'USDT', wb: num(st.wallet), cw: num(st.wallet), bc: num(bc) }], P: [positionRaw(s)] } });
  }
  function emitOrder(o: POrder, x: 'NEW' | 'CANCELED' | 'EXPIRED' | 'TRADE' | 'CALCULATED', t: number, fill: TradeRow | null) {
    const raw: Record<string, unknown> = {
      s: o.symbol, c: o.clientOrderId, S: o.side, o: o.type, f: o.tif ?? 'GTC', q: fmtQ(o.symbol, o.origQty), p: o.type === 'LIMIT' ? fmtP(o.symbol, o.price) : '0',
      ap: o.executedQty > 0 ? num(o.cumQuote / o.executedQty) : '0', sp: '0', x, X: o.status, i: o.orderId,
      l: fill === null ? '0' : fmtQ(o.symbol, fill.qty), z: fmtQ(o.symbol, o.executedQty), L: fill === null ? '0' : num(fill.price),
      T: t, t: fill === null ? 0 : fill.id, m: fill?.maker ?? false, R: o.reduceOnly, wt: 'CONTRACT_PRICE', ot: o.origType, ps: 'BOTH', cp: o.closePosition,
      rp: fill === null ? '0' : num(fill.realizedPnl), pP: false, V: 'EXPIRE_MAKER', pm: 'NONE', gtd: o.goodTillDate,
    };
    if (fill !== null) { raw.N = 'USDT'; raw.n = num(fill.commission); }
    rawEvents.push({ e: 'ORDER_TRADE_UPDATE', E: t, T: t, o: raw });
  }
  function emitAlgo(a: PAlgo, t: number) {
    const raw: Record<string, unknown> = {
      caid: a.clientAlgoId, aid: a.algoId, at: 'CONDITIONAL', o: a.orderType, s: a.symbol, S: a.side, ps: 'BOTH', f: 'GTC',
      q: a.quantity === null ? '0' : fmtQ(a.symbol, a.quantity), X: a.status, ai: a.actualOrderId ?? '', ap: a.actualPrice === null ? '0' : num(a.actualPrice),
      aq: a.actualQty === null ? '0' : fmtQ(a.symbol, a.actualQty), act: 'MARKET', tp: a.triggerPrice === null ? '0' : fmtP(a.symbol, a.triggerPrice), p: '0',
      V: 'NONE', wt: 'MARK_PRICE', pm: 'NONE', cp: a.closePosition, pP: a.priceProtect, R: a.reduceOnly, tt: a.triggerTime ?? 0, gtd: 0, rm: a.rejectReason ?? '',
    };
    if (a.orderType === 'TRAILING_STOP_MARKET') raw.ia = a.peakX !== null;
    rawEvents.push({ e: 'ALGO_UPDATE', E: t, T: t, o: raw });
  }

  // ---------------------------------------------------------------- ký quỹ / PnL ----------------------------------------------------
  function unrealized(s: string): number {
    const S = sym(s);
    const p = S.pos;
    return p.qty > 0 && S.lastPrice !== null ? (toX(p.d, S.lastPrice) - p.avgX) * p.qty : 0;
  }
  function isolatedMargin(s: string): number {
    const S = sym(s);
    return S.pos.qty > 0 ? (S.pos.qty * Math.abs(S.pos.avgX)) / S.leverage : 0;
  }
  function available(): number {
    let used = 0;
    for (const s of Object.keys(st.symbols)) used += isolatedMargin(s);
    for (const o of st.orders) if (isOpenOrder(o) && !o.reduceOnly && o.type === 'LIMIT') used += ((o.origQty - o.executedQty) * o.price) / sym(o.symbol).leverage;
    return st.wallet - used;
  }

  // ---------------------------------------------------------------- khớp (công thức: fill-model.ts) ----------------------------------
  function record(o: POrder, qty: number, price: number, commission: number, realizedPnl: number, maker: boolean, t: number): TradeRow {
    const row: TradeRow = { id: ++st.seq.trade, orderId: o.orderId, symbol: o.symbol, side: o.side, price: roundPx(price), qty, quoteQty: qty * price, commission, realizedPnl, buyer: o.side === 'BUY', maker, time: t };
    st.trades.push(row);
    o.executedQty = qRound(qStepOf(o.symbol), o.executedQty + qty);
    o.cumQuote += qty * price;
    o.updateTime = t;
    return row;
  }

  // Mở/tăng vị thế: priceX ở không gian x của chiều lệnh
  function openFill(o: POrder, qty: number, priceX: number, t: number, resting: boolean): void {
    const s = o.symbol;
    const S = sym(s);
    const d = dirOf(o.side);
    const p = S.pos;
    if (p.qty <= 0) { p.d = d; p.avgX = 0; p.qty = 0; p.openedAt = t; }
    ({ posQty: p.qty, avgX: p.avgX } = addToPosition(p.qty, p.avgX, qty, priceX, qStepOf(s)));
    const px = toX(d, priceX);
    const fee = entryFee(qty, px, opts.cost(s), resting);
    st.wallet -= fee;
    p.liqX = liquidationX(d, sideOfD(d), p.avgX, p.qty, S.leverage);
    const row = record(o, qty, px, fee, 0, resting, t);
    o.status = o.executedQty >= o.origQty ? 'FILLED' : 'PARTIALLY_FILLED';
    emitAccount(s, 'ORDER', t, 0);
    emitOrder(o, 'TRADE', t, row);
    dirty = true;
  }

  // Đóng/giảm vị thế kiểu market ở mức levelX (không gian x của vị thế); impact=false: giá phá sản
  function closeFill(o: POrder, qty: number, levelX: number, t: number, impact = true, x: 'TRADE' | 'CALCULATED' = 'TRADE'): void {
    const s = o.symbol;
    const S = sym(s);
    const p = S.pos;
    const c = opts.cost(s);
    const xExec = exitExecX(p.d, levelX, qty, c, impact);
    p.qty = reduceQty(p.qty, qty, qStepOf(s));
    const px = toX(p.d, xExec);
    const pnl = exitPnl(xExec, p.avgX, qty);
    const fee = exitFee(qty, px, c);
    st.wallet += pnl - fee;
    p.cumRealized += pnl;
    const row = record(o, qty, px, fee, pnl, false, t);
    if (p.qty <= 0) { p.qty = 0; p.avgX = 0; p.openedAt = null; p.liqX = null; }
    if (o.executedQty >= o.origQty) o.status = 'FILLED';
    emitAccount(s, 'ORDER', t, 0);
    emitOrder(o, x, t, row);
    dirty = true;
  }

  function newOrder(f: Omit<POrder, 'orderId' | 'executedQty' | 'cumQuote' | 'status' | 'updateTime'>): POrder {
    const o: POrder = { ...f, orderId: ++st.seq.order, executedQty: 0, cumQuote: 0, status: 'NEW', updateTime: f.time };
    st.orders.push(o);
    dirty = true;
    return o;
  }
  function finish(o: POrder, status: OrderStatus, t: number) {
    o.status = status;
    o.updateTime = t;
    if (isTaker(o)) settled.push(o);
    dirty = true;
  }

  // Lệnh MARKET / IOC chờ nhịp giá: khớp ở giá điểm p
  function takerFill(o: POrder, p: number, t: number): void {
    const S = sym(o.symbol);
    const pos = S.pos;
    const d = dirOf(o.side);
    let rest = qRound(qStepOf(o.symbol), o.origQty - o.executedQty);
    const opposite = pos.qty > 0 && pos.d === -d;
    if (o.reduceOnly && !opposite) { finish(o, 'EXPIRED', t); emitOrder(o, 'EXPIRED', t, null); return; }
    if (opposite) {
      const q = Math.min(rest, pos.qty);
      if (o.type === 'LIMIT' && toX(d, p) > toX(d, o.price)) { finish(o, 'EXPIRED', t); emitOrder(o, 'EXPIRED', t, null); return; }
      closeFill(o, q, toX(pos.d, p), t);
      rest = qRound(qStepOf(o.symbol), rest - q);
      if (o.reduceOnly || rest <= 0) { finish(o, o.executedQty >= o.origQty ? 'FILLED' : 'EXPIRED', t); if (o.status === 'EXPIRED') emitOrder(o, 'EXPIRED', t, null); return; }
    }
    const limitX = o.type === 'MARKET' ? Infinity : toX(d, o.price);
    const f = takerEntryFill(toX(d, p), limitX, rest, opts.cost(o.symbol), qStepOf(o.symbol));
    if (f.qty > 0) openFill(o, f.qty, f.x, t, false);
    finish(o, o.executedQty >= o.origQty ? 'FILLED' : 'EXPIRED', t);
    if (o.status === 'EXPIRED') emitOrder(o, 'EXPIRED', t, null);
  }

  // Lệnh LIMIT chờ bị giá đi qua: khớp ở price (điểm: giá điểm; quét: đúng mức limit)
  function restingFill(o: POrder, price: number, t: number): void {
    const S = sym(o.symbol);
    const pos = S.pos;
    const d = dirOf(o.side);
    const rest = qRound(qStepOf(o.symbol), o.origQty - o.executedQty);
    const opposite = pos.qty > 0 && pos.d === -d;
    if (o.reduceOnly && !opposite) { finish(o, 'EXPIRED', t); emitOrder(o, 'EXPIRED', t, null); return; }
    if (opposite) {
      const q = Math.min(rest, pos.qty);
      closeFill(o, q, toX(pos.d, price), t, false);
      const left = qRound(qStepOf(o.symbol), rest - q);
      if (o.reduceOnly || left <= 0) { if (left > 0) { finish(o, 'EXPIRED', t); emitOrder(o, 'EXPIRED', t, null); } else finish(o, 'FILLED', t); return; }
      openFill(o, left, toX(d, price), t, true);
      return;
    }
    openFill(o, rest, toX(d, price), t, true);
  }

  // Lệnh điều kiện kích hoạt ở giá price: sinh lệnh MARKET thật (reduce-only / closePosition kiểm lúc này)
  function trigger(a: PAlgo, price: number, t: number): void {
    const S = sym(a.symbol);
    const pos = S.pos;
    const d = dirOf(a.side);
    a.updateTime = t;
    a.triggerTime = t;
    dirty = true;
    const protects = pos.qty > 0 && pos.d === -d; // lệnh SELL giảm vị thế Long, BUY giảm Short
    if ((a.closePosition || a.reduceOnly) && !protects) {
      a.status = 'REJECTED';
      a.rejectReason = 'Reduce Only reject';
      emitAlgo(a, t);
      return;
    }
    const qty = a.closePosition ? pos.qty : Math.min(a.quantity!, a.reduceOnly ? pos.qty : a.quantity!);
    const o = newOrder({
      clientOrderId: `paper-algo-${a.algoId}`, symbol: a.symbol, side: a.side, type: 'MARKET', origType: a.orderType, tif: 'GTC', price: 0,
      origQty: qty, reduceOnly: a.reduceOnly || a.closePosition, closePosition: a.closePosition, goodTillDate: 0, time: t,
    });
    a.status = 'TRIGGERED';
    a.actualOrderId = o.orderId;
    emitAlgo(a, t);
    emitOrder(o, 'NEW', t, null);
    if (protects) {
      const q = Math.min(qty, pos.qty);
      closeFill(o, q, toX(pos.d, price), t);
      const rest = qRound(qStepOf(a.symbol), qty - q);
      if (rest > 0 && !o.reduceOnly) openFill(o, rest, toX(d, price), t, false);
    } else {
      const f = takerEntryFill(toX(d, price), Infinity, qty, opts.cost(a.symbol), qStepOf(a.symbol));
      openFill(o, f.qty, f.x, t, false);
    }
    o.status = 'FILLED';
    a.status = 'FINISHED';
    a.actualQty = o.executedQty;
    a.actualPrice = o.executedQty > 0 ? roundPx(o.cumQuote / o.executedQty) : null;
    emitAlgo(a, t);
  }

  function liquidate(s: string, levelX: number, t: number, impact: boolean): void {
    const pos = sym(s).pos;
    const o = newOrder({
      clientOrderId: `autoclose-${st.seq.order + 1}`, symbol: s, side: pos.d > 0 ? 'SELL' : 'BUY', type: 'MARKET', origType: 'MARKET', tif: 'IOC', price: 0,
      origQty: pos.qty, reduceOnly: true, closePosition: false, goodTillDate: 0, time: t,
    });
    closeFill(o, pos.qty, levelX, t, impact, 'CALCULATED');
    o.status = 'FILLED';
  }

  // ---------------------------------------------------------------- vòng sự kiện ---------------------------------------------------
  function events(s: string, t: number): Ev[] {
    const out: Ev[] = [];
    const pos = sym(s).pos;
    for (const a of st.algos) {
      if (a.symbol !== s || a.status !== 'NEW' || a.createTime > t) continue;
      const sell = a.side === 'SELL';
      if (a.orderType === 'STOP_MARKET') out.push({ kind: 'stop', algo: a, level: a.triggerPrice!, dir: sell ? 'down' : 'up', prio: a.closePosition ? 0 : 1, seq: a.algoId });
      else if (a.orderType === 'TAKE_PROFIT_MARKET') out.push({ kind: 'tp', algo: a, level: a.triggerPrice!, dir: sell ? 'up' : 'down', prio: 1, seq: a.algoId });
      else if (a.peakX === null) out.push({ kind: 'activate', algo: a, level: a.activatePrice!, dir: sell ? 'up' : 'down', prio: 1, seq: a.algoId });
      else {
        const d = sell ? 1 : -1;
        out.push({ kind: 'trail', algo: a, level: toX(d, trailStopX(d, a.peakX, a.callbackRate!)), dir: sell ? 'down' : 'up', prio: 1, seq: a.algoId });
      }
    }
    if (pos.qty > 0 && pos.liqX !== null) out.push({ kind: 'liq', level: toX(pos.d, pos.liqX), dir: pos.d > 0 ? 'down' : 'up', prio: 2, seq: 0 });
    for (const o of st.orders) {
      if (o.symbol !== s || !isOpenOrder(o) || o.type !== 'LIMIT' || o.tif === 'IOC' || o.time > t) continue;
      out.push({ kind: 'limit', order: o, level: o.price, dir: o.side === 'BUY' ? 'down' : 'up', prio: 3, seq: o.orderId });
    }
    return out;
  }

  function applyEv(s: string, e: Ev, price: number, t: number): void {
    if (e.kind === 'limit') restingFill(e.order, price, t);
    else if (e.kind === 'liq') liquidate(s, toX(sym(s).pos.d, price), t, true);
    else if (e.kind === 'activate') {
      const d = e.algo.side === 'SELL' ? 1 : -1;
      e.algo.peakX = trailActivatedPeakX(toX(d, price), toX(d, e.algo.activatePrice!));
      e.algo.updateTime = t;
      emitAlgo(e.algo, t);
      dirty = true;
    } else trigger(e.algo, price, t);
  }

  // Mọi sự kiện chiều dir bị giá q vượt qua, gần nhất trước; atPrice: khớp ở giá điểm (null = đúng mức của sự kiện)
  function runCross(s: string, dir: 'down' | 'up', q: number, t: number, atPrice: number | null): void {
    for (let guard = 0; guard < 100; guard++) {
      const evs = events(s, t).filter((e) => e.dir === dir && (dir === 'down' ? e.level >= q : e.level <= q));
      if (evs.length === 0) return;
      const e = evs.reduce((a, b) => {
        if (a.level !== b.level) return (dir === 'down' ? b.level > a.level : b.level < a.level) ? b : a;
        if (a.prio !== b.prio) return b.prio < a.prio ? b : a;
        return b.seq < a.seq ? b : a;
      });
      applyEv(s, e, atPrice ?? e.level, t);
    }
    throw new Error(`paper ${s}: vòng sự kiện không dừng`);
  }

  function raisePeaks(s: string, p: number): void {
    for (const a of st.algos) {
      if (a.symbol !== s || a.status !== 'NEW' || a.orderType !== 'TRAILING_STOP_MARKET' || a.peakX === null) continue;
      const x = toX(a.side === 'SELL' ? 1 : -1, p);
      if (x > a.peakX) { a.peakX = x; dirty = true; }
    }
  }

  // Chiều BẤT LỢI: theo vị thế; chưa có vị thế → theo lệnh vào đang chờ sớm nhất
  function adverse(s: string): 'down' | 'up' {
    const pos = sym(s).pos;
    if (pos.qty > 0) return pos.d > 0 ? 'down' : 'up';
    const o = st.orders.find((x) => x.symbol === s && isOpenOrder(x) && !x.reduceOnly);
    return o === undefined || o.side === 'BUY' ? 'down' : 'up';
  }
  const flip = (d: 'down' | 'up') => (d === 'down' ? 'up' : 'down');

  function expire(s: string, t: number): void {
    for (const o of st.orders) {
      if (o.symbol === s && isOpenOrder(o) && o.tif === 'GTD' && o.goodTillDate <= t) { finish(o, 'EXPIRED', t); emitOrder(o, 'EXPIRED', t, null); }
    }
  }

  function point(s: string, p: number, t: number): void {
    const S = sym(s);
    expire(s, t);
    for (const o of st.orders) if (o.symbol === s && isOpenOrder(o) && isTaker(o) && o.time <= t) takerFill(o, p, t);
    const pos = S.pos;
    if (pos.qty > 0 && pos.liqX !== null && toX(pos.d, p) <= pos.liqX) liquidate(s, bankruptX(pos.d, pos.avgX, S.leverage), t, false);
    const adv = adverse(s);
    runCross(s, adv, p, t, p);
    runCross(s, flip(adv), p, t, p);
    raisePeaks(s, p);
    S.lastPrice = p;
    S.lastPriceTime = Math.max(S.lastPriceTime, t);
    dirty = true;
  }

  // Nến không có mark phủ: điểm giá mở → tới cực bất lợi (đúng mức) → tới cực có lợi (bỏ khi vị thế vừa mở giữa nến)
  function sweepBar(s: string, c: Candle): void {
    const t = c.openTime;
    point(s, c.open, t);
    const S = sym(s);
    const adv = adverse(s);
    const before = S.pos.qty;
    runCross(s, adv, adv === 'down' ? c.low : c.high, t, null);
    const filledMid = before <= 0 && S.pos.qty > 0;
    if (!filledMid) {
      const fav = flip(adv);
      const ext = fav === 'down' ? c.low : c.high;
      runCross(s, fav, ext, t, null);
      raisePeaks(s, ext);
    }
    S.lastPrice = c.close;
    S.lastPriceTime = Math.max(S.lastPriceTime, c.closeTime);
  }

  // Nến đã có mark phủ: chỉ lệnh LIMIT chờ (đặt trước giờ mở nến) mà giá giao dịch đi qua → khớp đúng giá limit
  function limitsThroughBar(s: string, c: Candle): void {
    for (const o of st.orders) {
      if (o.symbol !== s || !isOpenOrder(o) || o.type !== 'LIMIT' || o.tif === 'IOC' || o.time > c.openTime) continue;
      if (o.side === 'BUY' ? c.low <= o.price : c.high >= o.price) restingFill(o, o.price, c.closeTime);
    }
  }

  // ---------------------------------------------------------------- lưu / cam kết ---------------------------------------------------
  function prune(): void {
    const closedOrders = st.orders.filter((o) => !isOpenOrder(o));
    if (closedOrders.length > historyLimit) {
      const drop = new Set(closedOrders.sort((a, b) => a.updateTime - b.updateTime).slice(0, closedOrders.length - historyLimit).map((o) => o.orderId));
      st.orders = st.orders.filter((o) => !drop.has(o.orderId));
    }
    const closedAlgos = st.algos.filter((a) => a.status !== 'NEW');
    if (closedAlgos.length > historyLimit) {
      const drop = new Set(closedAlgos.sort((a, b) => a.updateTime - b.updateTime).slice(0, closedAlgos.length - historyLimit).map((a) => a.algoId));
      st.algos = st.algos.filter((a) => !drop.has(a.algoId));
    }
    if (st.trades.length > historyLimit) st.trades = st.trades.slice(-historyLimit);
    if (st.income.length > historyLimit) st.income = st.income.slice(-historyLimit);
  }
  function save(): void {
    if (statePath === null || !dirty) return;
    mkdirSync(dirname(statePath), { recursive: true });
    const tmp = `${statePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(st));
    renameSync(tmp, statePath); // nguyên tử trên cùng hệ tệp: tệp cũ hoặc tệp mới, không bao giờ nửa vời
  }
  // Cuối mỗi thao tác: dọn lịch sử → ghi đĩa → phát sự kiện → trả phản hồi MARKET/IOC đang chờ
  function commit(): void {
    prune();
    save();
    dirty = false;
    const evs = rawEvents.splice(0);
    const done = settled.splice(0);
    for (const raw of evs) {
      const e = parseUserEvent(raw);
      for (const l of listeners) l(e);
    }
    for (const o of done) {
      const w = waiting.get(o.orderId);
      if (w === undefined) continue;
      waiting.delete(o.orderId);
      timers.clear(w.timer);
      w.resolve(toResult(ok(orderBody(o))));
    }
  }

  // ---------------------------------------------------------------- thân phản hồi REST ----------------------------------------------
  function orderBody(o: POrder) {
    return {
      orderId: o.orderId, symbol: o.symbol, status: o.status, clientOrderId: o.clientOrderId, price: o.type === 'LIMIT' ? fmtP(o.symbol, o.price) : '0',
      avgPrice: o.executedQty > 0 ? num(o.cumQuote / o.executedQty) : '0', origQty: fmtQ(o.symbol, o.origQty), executedQty: fmtQ(o.symbol, o.executedQty),
      cumQty: fmtQ(o.symbol, o.executedQty), cumQuote: num(o.cumQuote), timeInForce: o.tif ?? 'GTC', type: o.type, reduceOnly: o.reduceOnly,
      closePosition: o.closePosition, side: o.side, positionSide: 'BOTH', stopPrice: '0', workingType: 'CONTRACT_PRICE', priceProtect: false,
      origType: o.origType, priceMatch: 'NONE', selfTradePreventionMode: 'EXPIRE_MAKER', goodTillDate: o.goodTillDate, time: o.time, updateTime: o.updateTime,
    };
  }
  function algoBody(a: PAlgo) {
    return {
      algoId: a.algoId, clientAlgoId: a.clientAlgoId, algoType: 'CONDITIONAL', orderType: a.orderType, symbol: a.symbol, side: a.side, positionSide: 'BOTH',
      timeInForce: 'GTC', quantity: a.quantity === null ? '0' : fmtQ(a.symbol, a.quantity), algoStatus: a.status,
      triggerPrice: a.triggerPrice === null ? '0' : fmtP(a.symbol, a.triggerPrice), price: '0', workingType: 'MARK_PRICE', priceMatch: 'NONE',
      closePosition: a.closePosition, priceProtect: a.priceProtect, reduceOnly: a.reduceOnly,
      activatePrice: a.activatePrice === null ? '' : fmtP(a.symbol, a.activatePrice), callbackRate: a.callbackRate === null ? '' : String(a.callbackRate),
      createTime: a.createTime, updateTime: a.updateTime, triggerTime: a.triggerTime ?? 0, goodTillDate: 0,
      actualOrderId: a.actualOrderId === null ? '' : String(a.actualOrderId), actualPrice: a.actualPrice === null ? '' : num(a.actualPrice),
      actualQty: a.actualQty === null ? '' : fmtQ(a.symbol, a.actualQty),
    };
  }

  // ---------------------------------------------------------------- xử lý request ---------------------------------------------------
  const str = (req: RequestOpts, k: string): string | undefined => {
    const v = req.params?.[k];
    return v === undefined ? undefined : String(v);
  };
  const bool = (req: RequestOpts, k: string) => str(req, k) === 'true';
  const pnum = (v: string | undefined) => (v === undefined || v.trim() === '' ? NaN : Number(v));
  const openCountOf = (s: string) => st.orders.filter((o) => o.symbol === s && isOpenOrder(o)).length + st.algos.filter((a) => a.symbol === s && a.status === 'NEW').length;

  function clientIdProblem(cid: string | undefined): Reply | null {
    if (cid === undefined) return err(PAPER_PARAM_REJECT, 'paper: bot luôn gửi mã client — thiếu newClientOrderId/clientAlgoId');
    if (cid.length > 36) return err(-4015, 'Client order id length should not be more than 36 chars');
    if (!CLIENT_ID_RE.test(cid)) return err(PAPER_PARAM_REJECT, `Mã client "${cid}" sai quy tắc ^[\\.A-Z\\:/a-z0-9_-]{1,36}$`);
    return null;
  }
  function qtyProblem(c: Contract, q: number, market: boolean): Reply | null {
    if (!(q > 0)) return err(-4003, 'Quantity less than or equal to zero.');
    const [step, min, max] = market ? [c.marketStepSize, c.marketMinQty, c.marketMaxQty] : [c.stepSize, c.minQty, c.maxQty];
    if (!isStepMultiple(q, step)) return err(-4023, `Quantity not increased by step size ${step}.`);
    if (q < min - 1e-12) return err(-4004, `Quantity less than minimum quantity ${min}.`);
    if (q > max + 1e-12) return err(-4005, `Quantity greater than maximum quantity ${max}.`);
    return null;
  }
  const tickProblem = (c: Contract, p: number, what: string): Reply | null =>
    (!(p > 0) ? err(PAPER_PARAM_REJECT, `${what} ${p} không hợp lệ`) : !isStepMultiple(p, c.tickSize) ? err(-4014, `Price not increased by tick size ${c.tickSize}.`) : null);

  function placeOrder(req: RequestOpts): Reply | { deferred: number } {
    const s = str(req, 'symbol') ?? '';
    const c = opts.contracts[s];
    if (c === undefined) return err(-1121, 'Invalid symbol.');
    const type = str(req, 'type') ?? '';
    if (/^(STOP|TAKE_PROFIT|TRAILING)/.test(type)) return err(-4120, 'Order type not supported for this endpoint. Please use the Algo Order API endpoints instead.');
    if (type !== 'LIMIT' && type !== 'MARKET') return err(PAPER_PARAM_REJECT, `paper: loại lệnh ${type} không hỗ trợ`);
    const ps = str(req, 'positionSide');
    if (ps !== undefined && ps !== 'BOTH') return err(-4061, "Order's position side does not match user's setting.");
    const side = str(req, 'side');
    if (side !== 'BUY' && side !== 'SELL') return err(PAPER_PARAM_REJECT, `side ${side} không hợp lệ`);
    const cid = str(req, 'newClientOrderId');
    const cp = clientIdProblem(cid);
    if (cp !== null) return cp;
    if (st.orders.some((o) => isOpenOrder(o) && o.clientOrderId === cid)) return err(-4116, 'ClientOrderId is duplicated.');
    const qty = pnum(str(req, 'quantity'));
    const qp = qtyProblem(c, qty, type === 'MARKET');
    if (qp !== null) return qp;
    let price = 0;
    let tif: POrder['tif'] = null;
    let gtd = 0;
    const t = now();
    if (type === 'LIMIT') {
      price = pnum(str(req, 'price'));
      const tp = tickProblem(c, price, 'Giá');
      if (tp !== null) return tp;
      const f = str(req, 'timeInForce');
      if (f !== 'GTC' && f !== 'IOC' && f !== 'GTD') return err(PAPER_PARAM_REJECT, `paper: timeInForce ${f} không hỗ trợ`);
      tif = f;
      if (f === 'GTD') {
        gtd = Math.floor(pnum(str(req, 'goodTillDate')) / 1000) * 1000;
        if (!(gtd > t + 600_000) || gtd >= GTD_MAX) return err(PAPER_PARAM_REJECT, 'goodTillDate phải > hiện tại + 600 giây và < 253402300799000');
      }
    }
    const S = sym(s);
    const reduceOnly = bool(req, 'reduceOnly');
    if (reduceOnly) {
      if (!(S.pos.qty > 0 && S.pos.d === -dirOf(side))) return err(-2022, 'ReduceOnly Order is rejected.');
    } else {
      const ref = type === 'LIMIT' ? price : S.lastPrice;
      if (ref === null) return err(PAPER_PARAM_REJECT, `paper: chưa có giá cho ${s} — cần ít nhất một nhịp mark/nến trước lệnh MARKET`);
      if (qty * ref < c.minNotional) return err(-4164, `Order's notional must be no smaller than ${c.minNotional} (unless you choose reduce only).`);
      const opening = !(S.pos.qty > 0 && S.pos.d === -dirOf(side));
      if (opening && (qty * ref) / S.leverage > available()) return err(-2019, 'Margin is insufficient.');
    }
    if (openCountOf(s) >= c.maxNumOrders) return err(-2025, 'Reach max open order limit.');
    const o = newOrder({ clientOrderId: cid!, symbol: s, side, type, origType: type, tif, price, origQty: qty, reduceOnly, closePosition: false, goodTillDate: gtd, time: t });
    emitOrder(o, 'NEW', t, null);
    return isTaker(o) ? { deferred: o.orderId } : ok(orderBody(o));
  }

  function findOrder(req: RequestOpts): POrder | undefined {
    const s = str(req, 'symbol');
    const id = str(req, 'orderId');
    const cid = str(req, 'origClientOrderId');
    const list = st.orders.filter((o) => o.symbol === s && (id !== undefined ? o.orderId === Number(id) : o.clientOrderId === cid));
    return list.find(isOpenOrder) ?? list.at(-1);
  }

  function cancelOrder(req: RequestOpts): Reply {
    const o = findOrder(req);
    if (o === undefined || !isOpenOrder(o)) return err(-2011, 'Unknown order sent.');
    const t = now();
    finish(o, 'CANCELED', t);
    emitOrder(o, 'CANCELED', t, null);
    return ok(orderBody(o));
  }

  function placeAlgo(req: RequestOpts): Reply {
    if (str(req, 'algoType') !== 'CONDITIONAL') return err(PAPER_PARAM_REJECT, 'algoType chỉ nhận CONDITIONAL');
    const s = str(req, 'symbol') ?? '';
    const c = opts.contracts[s];
    if (c === undefined) return err(-1121, 'Invalid symbol.');
    const type = str(req, 'type') ?? '';
    if (type !== 'STOP_MARKET' && type !== 'TAKE_PROFIT_MARKET' && type !== 'TRAILING_STOP_MARKET') return err(PAPER_PARAM_REJECT, `paper: lệnh điều kiện ${type} không hỗ trợ`);
    if (str(req, 'workingType') !== 'MARK_PRICE') return err(PAPER_PARAM_REJECT, 'paper: chỉ mô phỏng workingType=MARK_PRICE (mặc định CONTRACT_PRICE của sàn không được hỗ trợ)');
    const ps = str(req, 'positionSide');
    if (ps !== undefined && ps !== 'BOTH') return err(-4061, "Order's position side does not match user's setting.");
    const side = str(req, 'side');
    if (side !== 'BUY' && side !== 'SELL') return err(PAPER_PARAM_REJECT, `side ${side} không hợp lệ`);
    const cid = str(req, 'clientAlgoId');
    const cp = clientIdProblem(cid);
    if (cp !== null) return cp;
    if (st.algos.some((a) => a.status === 'NEW' && a.clientAlgoId === cid)) return err(-4116, 'ClientOrderId is duplicated.');
    const closePosition = bool(req, 'closePosition');
    const reduceOnly = bool(req, 'reduceOnly');
    const qStr = str(req, 'quantity');
    let quantity: number | null = null;
    if (closePosition) {
      if (type === 'TRAILING_STOP_MARKET') return err(PAPER_PARAM_REJECT, 'closePosition chỉ dùng với STOP_MARKET / TAKE_PROFIT_MARKET');
      if (qStr !== undefined) return err(-4137, 'Quantity must be zero with closePosition equals true.');
      if (reduceOnly) return err(-4138, 'paper: closePosition không đi cùng reduceOnly (tài liệu tra cứu mục 4.2 / 4.8 mâu thuẫn — theo trang algo)');
    } else {
      quantity = pnum(qStr);
      const qp = qtyProblem(c, quantity, true);
      if (qp !== null) return qp;
    }
    const S = sym(s);
    if (S.lastPrice === null) return err(PAPER_PARAM_REJECT, `paper: chưa có giá mark cho ${s}`);
    const last = S.lastPrice;
    let triggerPrice: number | null = null;
    let activatePrice: number | null = null;
    let callbackRate: number | null = null;
    let peakX: number | null = null;
    const sell = side === 'SELL';
    if (type === 'TRAILING_STOP_MARKET') {
      callbackRate = pnum(str(req, 'callbackRate'));
      if (!(callbackRate >= COMMON.binanceTrailCallbackMinPct && callbackRate <= COMMON.binanceTrailMaxCallbackPct)) {
        return err(PAPER_PARAM_REJECT, `callbackRate ${str(req, 'callbackRate')} ngoài khoảng [${COMMON.binanceTrailCallbackMinPct}; ${COMMON.binanceTrailMaxCallbackPct}]`);
      }
      const ap = str(req, 'activatePrice');
      if (ap === undefined) {
        activatePrice = last; // tài liệu: mặc định = giá mới nhất → kích hoạt ngay
        peakX = toX(sell ? 1 : -1, last);
      } else {
        activatePrice = pnum(ap);
        const tp = tickProblem(c, activatePrice, 'activatePrice');
        if (tp !== null) return tp;
        if (sell ? activatePrice <= last : activatePrice >= last) return err(-2021, 'Order would immediately trigger.');
      }
    } else {
      triggerPrice = pnum(str(req, 'triggerPrice'));
      const tp = tickProblem(c, triggerPrice, 'triggerPrice');
      if (tp !== null) return tp;
      const stop = type === 'STOP_MARKET';
      // SELL stop: kích hoạt khi giá ≤ trigger; SELL TP: khi giá ≥ trigger (BUY ngược lại) — đã thỏa lúc đặt → kích hoạt ngay
      const immediate = stop === sell ? triggerPrice >= last : triggerPrice <= last;
      if (immediate) return err(-4142, 'REJECT: take profit or stop order will be triggered immediately');
    }
    if (!closePosition && !reduceOnly) {
      const ref = triggerPrice ?? activatePrice ?? last;
      if (quantity! * ref < c.minNotional) return err(-4164, `Order's notional must be no smaller than ${c.minNotional} (unless you choose reduce only).`);
    }
    if (openCountOf(s) >= c.maxNumOrders) return err(-2025, 'Reach max open order limit.');
    if (st.algos.filter((a) => a.status === 'NEW').length >= maxCondTotal) return err(-4045, 'Reach max stop order limit.');
    const t = now();
    const a: PAlgo = {
      algoId: ++st.seq.algo, clientAlgoId: cid!, symbol: s, side, orderType: type, quantity, closePosition, reduceOnly, priceProtect: bool(req, 'priceProtect'),
      triggerPrice, activatePrice, callbackRate, peakX, status: 'NEW', createTime: t, updateTime: t, triggerTime: null,
      actualOrderId: null, actualPrice: null, actualQty: null, rejectReason: null,
    };
    st.algos.push(a);
    dirty = true;
    emitAlgo(a, t);
    return ok(algoBody(a));
  }

  function findAlgo(req: RequestOpts): PAlgo | undefined {
    const id = str(req, 'algoId');
    const cid = str(req, 'clientAlgoId');
    const list = st.algos.filter((a) => (id !== undefined ? a.algoId === Number(id) : a.clientAlgoId === cid));
    return list.find((a) => a.status === 'NEW') ?? list.at(-1);
  }

  function cancelAlgo(req: RequestOpts): Reply {
    const a = findAlgo(req);
    if (a === undefined || a.status !== 'NEW') return err(-2011, 'Unknown order sent.');
    const t = now();
    a.status = 'CANCELED';
    a.updateTime = t;
    dirty = true;
    emitAlgo(a, t);
    return ok({ algoId: a.algoId, clientAlgoId: a.clientAlgoId, code: 200, msg: 'success' });
  }

  function positionRisk(req: RequestOpts): Reply {
    const want = str(req, 'symbol');
    const out = [];
    for (const [s, S] of Object.entries(st.symbols)) {
      if (want !== undefined && s !== want) continue;
      if (!(S.pos.qty > 0) && openCountOf(s) === 0) continue; // v3: chỉ mã có vị thế hoặc lệnh mở
      const p = S.pos;
      const amt = p.qty > 0 ? p.d * p.qty : 0;
      const ep = p.qty > 0 ? roundPx(toX(p.d, p.avgX)) : 0;
      out.push({
        symbol: s, positionSide: 'BOTH', positionAmt: fmtQ(s, amt), entryPrice: num(ep), breakEvenPrice: num(ep), markPrice: S.lastPrice === null ? '0' : num(S.lastPrice),
        unRealizedProfit: num(unrealized(s)), liquidationPrice: p.liqX === null ? '0' : num(toX(p.d, p.liqX)), isolatedMargin: num(isolatedMargin(s)),
        notional: S.lastPrice === null ? '0' : num(amt * S.lastPrice), marginAsset: 'USDT', isolatedWallet: num(isolatedMargin(s)), adl: 0, updateTime: now(),
      });
    }
    return ok(out);
  }

  function handle(req: RequestOpts): Reply | { deferred: number } {
    const m = req.method;
    const path = req.path;
    if (path === ORDER_PATH) {
      if (m === 'POST') return placeOrder(req);
      if (m === 'DELETE') return cancelOrder(req);
      if (m === 'GET') { const o = findOrder(req); return o === undefined ? err(-2013, 'Order does not exist.') : ok(orderBody(o)); }
    }
    if (path === ALGO_PATH) {
      if (m === 'POST') return placeAlgo(req);
      if (m === 'DELETE') return cancelAlgo(req);
      if (m === 'GET') { const a = findAlgo(req); return a === undefined ? err(-2013, 'Order does not exist.') : ok(algoBody(a)); }
    }
    const s = str(req, 'symbol');
    if (m === 'GET' && path === '/fapi/v1/openOrders') return ok(st.orders.filter((o) => isOpenOrder(o) && (s === undefined || o.symbol === s)).map(orderBody));
    if (m === 'GET' && path === '/fapi/v1/openAlgoOrders') return ok(st.algos.filter((a) => a.status === 'NEW' && (s === undefined || a.symbol === s)).map(algoBody));
    if (m === 'GET' && path === '/fapi/v3/positionRisk') return positionRisk(req);
    if (m === 'GET' && path === '/fapi/v3/balance') {
      const w = num(st.wallet);
      return ok([{ accountAlias: 'paper', asset: 'USDT', balance: w, crossWalletBalance: w, crossUnPnl: '0', availableBalance: num(available()), maxWithdrawAmount: num(available()), marginAvailable: true, updateTime: now() }]);
    }
    if (m === 'GET' && path === '/fapi/v1/userTrades') {
      if (s === undefined) return err(PAPER_PARAM_REJECT, "Mandatory parameter 'symbol' was not sent");
      const from = pnum(str(req, 'startTime'));
      const to = pnum(str(req, 'endTime'));
      const limit = Number.isFinite(pnum(str(req, 'limit'))) ? pnum(str(req, 'limit')) : 500;
      const rows = st.trades.filter((r) => r.symbol === s && (!Number.isFinite(from) || r.time >= from) && (!Number.isFinite(to) || r.time <= to)).slice(-limit);
      return ok(rows.map((r) => ({
        id: r.id, orderId: r.orderId, symbol: r.symbol, side: r.side, price: num(r.price), qty: fmtQ(r.symbol, r.qty), quoteQty: num(r.quoteQty),
        commission: String(r.commission), commissionAsset: 'USDT', realizedPnl: String(r.realizedPnl), buyer: r.buyer, maker: r.maker,
        positionSide: 'BOTH', marginAsset: 'USDT', time: r.time,
      })));
    }
    if (m === 'GET' && path === '/fapi/v1/income') {
      const type = str(req, 'incomeType');
      return ok(st.income.filter((r) => (s === undefined || r.symbol === s) && (type === undefined || r.incomeType === type))
        .map((r) => ({ symbol: r.symbol, incomeType: r.incomeType, income: String(r.income), asset: 'USDT', info: '', time: r.time, tranId: r.tranId, tradeId: '' })));
    }
    if (m === 'GET' && path === '/fapi/v1/positionSide/dual') return ok({ dualSidePosition: false });
    if (m === 'GET' && path === '/fapi/v1/multiAssetsMargin') return ok({ multiAssetsMargin: false });
    if (m === 'POST' && path === '/fapi/v1/marginType') {
      if (s === undefined || opts.contracts[s] === undefined) return err(-1121, 'Invalid symbol.');
      const want = str(req, 'marginType') === 'ISOLATED' ? 'ISOLATED' : 'CROSSED';
      const S = sym(s);
      if (S.marginType === want) return err(-4046, 'No need to change margin type.');
      S.marginType = want;
      dirty = true;
      return ok({ code: 200, msg: 'success' });
    }
    if (m === 'POST' && path === '/fapi/v1/leverage') {
      if (s === undefined || opts.contracts[s] === undefined) return err(-1121, 'Invalid symbol.');
      const lev = pnum(str(req, 'leverage'));
      if (!Number.isInteger(lev) || lev < 1) return err(PAPER_PARAM_REJECT, `leverage ${str(req, 'leverage')} không hợp lệ`);
      sym(s).leverage = lev;
      dirty = true;
      return ok({ leverage: lev, maxNotionalValue: 'INF', symbol: s });
    }
    if (m === 'POST' && path === '/fapi/v1/countdownCancelAll') return ok({ symbol: s, countdownTime: str(req, 'countdownTime') });
    return err(PAPER_PARAM_REJECT, `paper: ${m} ${path} chưa hỗ trợ`, 404);
  }

  function takeInjection(req: RequestOpts): PaperInjection | null {
    const i = injections.findIndex((x) => x.match(req));
    if (i < 0) return null;
    const rule = injections[i]!;
    rule.left--;
    if (rule.left <= 0) injections.splice(i, 1);
    return rule;
  }

  async function request(req: RequestOpts): Promise<SignedResult> {
    const inj = takeInjection(req);
    if (inj !== null && !inj.apply) return toResult({ status: inj.status, body: inj.body });
    const out = handle(req);
    commit();
    if (inj !== null) return toResult({ status: inj.status, body: inj.body });
    if (!('deferred' in out)) return toResult(out);
    const orderId = out.deferred;
    return new Promise<SignedResult>((resolve) => {
      const timer = timers.set(() => {
        waiting.delete(orderId);
        resolve(toResult(UNKNOWN));
      }, timeoutMs);
      waiting.set(orderId, { resolve, timer });
    });
  }

  const api = { request };

  // Nến ĐÃ ĐÓNG: chưa có mark nào được xét trong nến → quét nến; đã có → chỉ lệnh LIMIT chờ theo giá giao dịch
  function feedKline(symbol: string, candle: Candle): void {
    contract(symbol);
    const S = sym(symbol);
    if (candle.openTime > S.lastPriceTime) sweepBar(symbol, candle);
    else limitsThroughBar(symbol, candle);
    dirty = true;
    commit();
  }

  return {
    api,
    orders: createOrders({ api, now }),

    // Nhịp giá MARK (markPrice@1s): nhịp cũ hơn mốc giá đã xét bị bỏ qua
    feedMark(symbol: string, mark: { price: number; eventTime: number }): void {
      contract(symbol);
      if (!(mark.price > 0) || !Number.isFinite(mark.eventTime)) throw new Error(`paper ${symbol}: nhịp mark không hợp lệ ${JSON.stringify(mark)}`);
      if (mark.eventTime <= sym(symbol).lastPriceTime) return;
      point(symbol, mark.price, mark.eventTime);
      commit();
    },
    feedKline,
    // Sự kiện luồng thị trường của stream.ts (nến đã đóng); backfill_required là việc của nơi gọi
    feedMarket(e: MarketEvent): void {
      if (e.type === 'kline') feedKline(e.symbol, e.candle);
    },
    // Funding đã chốt (REST /fapi/v1/fundingRate): mỗi kỳ chỉ tính một lần, chỉ khi vị thế mở TRƯỚC giờ chốt
    feedFunding(row: { symbol: string; fundingTime: number; fundingRate: number; markPrice: number }): void {
      contract(row.symbol);
      const S = sym(row.symbol);
      const ft = fundingTimeFloor(row.fundingTime);
      if (ft <= S.lastFundingT) return;
      S.lastFundingT = ft;
      dirty = true;
      const p = S.pos;
      if (p.qty > 0 && p.openedAt !== null && p.openedAt < ft) {
        const amt = fundingAmount(p.d, p.qty, fundingMark(row.markPrice, toX(p.d, p.avgX)), row.fundingRate);
        st.wallet += amt;
        st.income.push({ symbol: row.symbol, incomeType: 'FUNDING_FEE', income: amt, time: ft, tranId: ++st.seq.tran });
        emitAccount(row.symbol, 'FUNDING_FEE', ft, amt);
      }
      commit();
    },
    inject(rule: PaperInjection): void {
      injections.push({ ...rule, left: rule.times ?? 1 });
    },
    onUserEvent(cb: (e: UserEvent) => void): () => void {
      listeners.push(cb);
      return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); };
    },
    // Ảnh chụp gọn cho log/test (bot đọc trạng thái qua REST như sàn thật)
    snapshot(): { wallet: number; positions: Array<{ symbol: string; positionAmt: number; entryPrice: number; liquidationPrice: number | null }> } {
      return {
        wallet: st.wallet,
        positions: Object.entries(st.symbols).filter(([, S]) => S.pos.qty > 0).map(([s, S]) => ({
          symbol: s, positionAmt: S.pos.d * S.pos.qty, entryPrice: roundPx(toX(S.pos.d, S.pos.avgX)), liquidationPrice: S.pos.liqX === null ? null : toX(S.pos.d, S.pos.liqX),
        })),
      };
    },
  };
}

function load(path: string): PaperState {
  const raw = readFileSync(path, 'utf8');
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch (e) {
    throw new Error(`paper: tệp trạng thái ${path} không phải JSON hợp lệ (${e instanceof Error ? e.message : String(e)}) — sửa hoặc xóa tay; bot không tự tạo ví mới`);
  }
  const o = v as Partial<PaperState> | null;
  if (o === null || typeof o !== 'object' || o.version !== STATE_VERSION) {
    throw new Error(`paper: tệp trạng thái ${path} sai phiên bản (cần version ${STATE_VERSION}, nhận ${JSON.stringify(o?.version)})`);
  }
  if (typeof o.wallet !== 'number' || o.seq === undefined || o.symbols === undefined || !Array.isArray(o.orders) || !Array.isArray(o.algos) || !Array.isArray(o.trades) || !Array.isArray(o.income)) {
    throw new Error(`paper: tệp trạng thái ${path} thiếu trường bắt buộc`);
  }
  return o as PaperState;
}
