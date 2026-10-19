import { createHash } from 'node:crypto';
import { entryLegProblems, exitPartProblems, isStepMultiple } from '../core/filters.ts';
import { snapToTick, tickDecimals } from '../core/price.ts';
import { COMMON } from '../core/config.ts';
import type { Contract, Side } from '../core/types.ts';
import type { Kind, RequestOpts, SignedResult } from './signed.ts';

// Lệnh thường + lệnh điều kiện (Algo Order) + thiết lập tài khoản cho bot.
// Nguồn DUY NHẤT cho tên endpoint/tham số/enum/giới hạn: docs/reference/binance-usdm-api.md (mục 2, 3, 4).
// Quy ước: `side` ở đầu vào luôn là CHIỀU VỊ THẾ ('long' | 'short'); module tự đổi sang BUY/SELL cho từng loại lệnh.
// Tài khoản chạy One-way (mục 2): KHÔNG gửi positionSide (mặc định BOTH).

export const ORDER_PATH = '/fapi/v1/order';
export const ALGO_PATH = '/fapi/v1/algoOrder';

// ---- Mã client tất định (newClientOrderId / clientAlgoId) ---------------------------------------
// Regex nguyên văn tài liệu (mục 3.2 và 4.2): ^[\.A-Z\:/a-z0-9_-]{1,36}$
export const CLIENT_ID_RE = /^[.A-Z:/a-z0-9_-]{1,36}$/;

export type ClientIdParts = {
  runId: string; // mã lần chạy: 1–8 ký tự chữ/số — tài liệu chỉ bảo đảm id duy nhất trong số lệnh ĐANG MỞ, nên cần mã chạy để không tái dùng
  signalId: string; // id tín hiệu bất kỳ, được băm
  leg: string; // chân lệnh: 1–4 ký tự, chữ HOA đầu, ví dụ E1, E2, SL, BE, TP1, TR
  attempt: number; // lần thử 0–999
};

// Dạng: cr-<runId ≤8>-<10 hex sha256(signalId)>-<leg ≤4>-<attempt ≤3> → tối đa 31 ký tự
export function makeClientId(p: ClientIdParts): string {
  if (!/^[A-Za-z0-9]{1,8}$/.test(p.runId)) throw new Error(`runId "${p.runId}" phải gồm 1–8 chữ/số`);
  if (typeof p.signalId !== 'string' || p.signalId === '') throw new Error('signalId không được rỗng');
  if (!/^[A-Z][A-Z0-9]{0,3}$/.test(p.leg)) throw new Error(`leg "${p.leg}" phải 1–4 ký tự, chữ HOA đầu (vd E1, SL, TP1, TR)`);
  if (!Number.isInteger(p.attempt) || p.attempt < 0 || p.attempt > 999) throw new Error(`attempt ${p.attempt} phải là số nguyên 0–999`);
  const hash = createHash('sha256').update(p.signalId).digest('hex').slice(0, 10);
  const out = `cr-${p.runId}-${hash}-${p.leg}-${p.attempt}`;
  if (!CLIENT_ID_RE.test(out)) throw new Error(`mã client "${out}" sai quy tắc tài liệu`); // không thể xảy ra nếu các kiểm trên đúng
  return out;
}

// ---- Bất biến R1 --------------------------------------------------------------------------------
// Lệnh điều kiện bị /fapi/v1/order chặn bằng -4120 từ 2025-12-09 (mục 0): chỉ được đi /fapi/v1/algoOrder, algoType=CONDITIONAL.
const CONDITIONAL_RE = /^(STOP|TAKE_PROFIT|TRAILING)/i;

// Chốt chặn cuối: MỌI request đi qua đây ngay trước khi gửi. Vi phạm là lỗi lập trình → ném lỗi, không gửi.
export function assertR1(req: RequestOpts): void {
  const type = String(req.params?.type ?? '');
  if (req.path.startsWith('/fapi/v1/batchOrders')) throw new Error('R1: module lệnh không dùng batchOrders');
  if (req.path === ORDER_PATH && CONDITIONAL_RE.test(type)) {
    throw new Error(`R1: lệnh điều kiện ${type} KHÔNG được gửi tới ${ORDER_PATH} — chỉ ${ALGO_PATH}`);
  }
  if (req.path === ALGO_PATH && req.method === 'POST') {
    if (req.params?.algoType !== 'CONDITIONAL') throw new Error('R1: lệnh algo phải có algoType=CONDITIONAL');
    if (!CONDITIONAL_RE.test(type)) throw new Error(`R1: ${ALGO_PATH} chỉ nhận lệnh điều kiện, nhận ${type}`);
    if (req.params?.workingType !== 'MARK_PRICE') throw new Error('R1: lệnh algo phải gửi workingType=MARK_PRICE tường minh (mặc định của sàn là CONTRACT_PRICE)');
  }
}

// ---- Kết quả ------------------------------------------------------------------------------------
// Luôn là kết quả của bộ phân loại (signed.ts). sent=false: bị từ chối TẠI CHỖ, request chưa hề rời máy.
// kind 'unknown_status' trả kèm clientId để nơi gọi TRA LẠI (queryOrder/queryAlgo) — module không tự gửi lại.
// kind 'stop_rejected' (CHỈ placeStopLoss): lệnh dừng KHÔNG nằm trên sàn vì bị từ chối (tại chỗ hoặc bởi sàn, vd -2025
// MAX_OPEN_ORDER_EXCEEDED, -4045 MAX_STOP_ORDER_EXCEEDED, -4142 STRATEGY_INVALID_TRIGGER_PRICE) → nơi gọi PHẢI đóng market + Telegram khẩn.
// Các kind khác của SL (banned/clock/retryable) cũng nghĩa là chưa có dừng trên sàn: nơi gọi xử lý như chưa đặt được.
export type OrderResult = Omit<SignedResult, 'kind'> & { kind: Kind | 'stop_rejected'; clientId: string | null; sent: boolean };

type Built = { ok: true; req: RequestOpts; clientId: string | null } | { ok: false; problems: string[]; clientId: string | null };

const fail = (...problems: string[]): Built => ({ ok: false, problems, clientId: null });
// Từ chối tại chỗ nhưng vẫn trả mã client đã tính → log/Telegram truy được chân lệnh
const failId = (clientId: string, problems: string[]): Built => ({ ok: false, problems, clientId });
const okReq = (req: RequestOpts, clientId: string | null = null): Built => ({ ok: true, req, clientId });

const isPos = (x: number) => typeof x === 'number' && Number.isFinite(x) && x > 0;
// In số theo đúng số chữ số thập phân của bước → không bao giờ ra dạng 1e-7
const fmt = (x: number, step: number) => x.toFixed(tickDecimals(step));
// Làm tròn XUỐNG 0,01 (như floorPct ở core/exit.ts) nhưng chịu nhiễu số thực: 0,29 × 100 = 28,999999999999996
const floorPct2 = (x: number) => Math.floor(x * 100 + 1e-9) / 100;

function tryId(parts: ClientIdParts): { id: string } | { problem: string } {
  try {
    return { id: makeClientId(parts) };
  } catch (e) {
    return { problem: `Mã client sai: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// MAX_NUM_ORDERS "counts both algo orders and normal orders" (mục 3.3). `need` = số lệnh sắp đặt cần chỗ.
// Lệnh vào giữ chỗ cho CẢ bộ lệnh (bracketSlots); TP/trailing kiểm 1 chỗ; SL KHÔNG kiểm (luôn gửi, sàn là trọng tài).
function countProblems(openCount: number, need: number, c: Contract): string[] {
  if (!Number.isInteger(openCount) || openCount < 0) return [`openCount ${openCount} phải là số nguyên ≥ 0`];
  if (!Number.isInteger(need) || need < 1) return [`Số chỗ cần giữ ${need} phải là số nguyên ≥ 1`];
  return openCount + need > c.maxNumOrders
    ? [`Đã có ${openCount} lệnh mở trên ${c.symbol}; cần thêm ${need} lệnh sẽ vượt MAX_NUM_ORDERS ${c.maxNumOrders}`] : [];
}

// Số lệnh của cả bộ: các chân vào + SL + TP1 (nếu có) + trailing (nếu có) + dừng sàn hòa vốn (khi needsBreakevenFloor)
export function bracketSlots(b: { entryLegs: number; tp1: boolean; trailing: boolean; breakevenFloor: boolean }): number {
  if (!Number.isInteger(b.entryLegs) || b.entryLegs < 1) throw new Error(`entryLegs ${b.entryLegs} phải là số nguyên ≥ 1`);
  return b.entryLegs + 1 + (b.tp1 ? 1 : 0) + (b.trailing ? 1 : 0) + (b.breakevenFloor ? 1 : 0);
}

// Khối lượng thoát (khớp bằng market) phải là bội của CẢ LOT_SIZE.stepSize và MARKET_LOT_SIZE.stepSize
function exitQty(qty: number, c: Contract): { qty: number; step: number; problems: string[] } {
  const step = Math.max(c.stepSize, c.marketStepSize);
  const q = snapToTick(qty, step, 'down');
  const off = [c.stepSize, c.marketStepSize].filter((s) => !isStepMultiple(q, s));
  return { qty: q, step, problems: off.length > 0 ? [`Khối lượng thoát ${q} không theo bước ${off.join(' / ')}`] : [] };
}

// Giá phía LỜI (trigger TP, activatePrice trailing): làm tròn VỀ PHÍA giá vào (Long XUỐNG, Short LÊN), giống towardDir
// của core (packages/core/plan.ts). Một hàm duy nhất cho cả hai → TP1 và activatePrice luôn trùng nhau.
const profitSideSnap = (price: number, side: Side, tick: number) => snapToTick(price, tick, side === 'long' ? 'down' : 'up');

const closeSide = (side: Side) => (side === 'long' ? 'SELL' : 'BUY'); // lệnh thoát ngược chiều vị thế
const openSide = (side: Side) => (side === 'long' ? 'BUY' : 'SELL');

// ---- Lệnh vào (/fapi/v1/order) -----------------------------------------------------------------
// reserveSlots: số lệnh của cả bộ còn phải đặt, GỒM lệnh vào này — dùng bracketSlots(...). Không đủ chỗ → từ chối lệnh vào,
// để không bao giờ có vị thế mở mà SL bị MAX_NUM_ORDERS chặn.
type EntryBase = { contract: Contract; side: Side; qty: number; id: ClientIdParts; openCount: number; reserveSlots: number };
export type EntryInput =
  | (EntryBase & { kind: 'market'; refPrice: number }) // refPrice: giá tham chiếu để kiểm MIN_NOTIONAL (nên dùng giá xấu nhất dự kiến)
  | (EntryBase & { kind: 'limit'; limitPrice: number; expireAt?: number; ioc?: boolean }); // expireAt (ms): có → GTD; không → GTC (hiệu lực 1 năm)
// ioc = true: LIMIT timeInForce=IOC (mục 3.2) — khớp ngay phần có thể ở giá ≤ limit (Long) / ≥ limit (Short), phần còn lại tự hủy.
// Bot dùng cho chân "market" với giá trần = giá tối đa → sàn không bao giờ khớp vượt giá cho phép. Không đi cùng expireAt.

const GTD_MIN_AHEAD_MS = 600_000; // tài liệu: goodTillDate phải > hiện tại + 600 giây
const GTD_SAFETY_MS = 10_000; // [Đề xuất] đệm cho lệch giờ máy/sàn và độ trễ mạng (giờ ở đây là giờ máy, chưa trừ offset)
const GTD_MAX = 253402300799000; // tài liệu: goodTillDate < 253402300799000

function buildEntry(a: EntryInput, nowMs: number): Built {
  const c = a.contract;
  const idr = tryId(a.id);
  if ('problem' in idr) return fail(idr.problem);
  if (!isPos(a.qty)) return fail(`Khối lượng ${a.qty} không hợp lệ`);
  const market = a.kind === 'market';
  const rawPrice = market ? a.refPrice : a.limitPrice;
  if (!isPos(rawPrice)) return fail(`Giá ${market ? 'tham chiếu' : 'limit'} ${rawPrice} không hợp lệ`);
  // Hướng an toàn: khối lượng XUỐNG (không vượt rủi ro); giá limit Long XUỐNG (không mua đắt hơn), Short LÊN (không bán rẻ hơn)
  const step = market ? c.marketStepSize : c.stepSize;
  const qty = snapToTick(a.qty, step, 'down');
  const price = market ? rawPrice : snapToTick(rawPrice, c.tickSize, a.side === 'long' ? 'down' : 'up');
  const problems = [...entryLegProblems({ kind: a.kind, price, qty }, c), ...countProblems(a.openCount, a.reserveSlots, c)];
  if (price <= 0) problems.push(`Giá limit sau làm tròn tick = ${price}`);

  const params: Record<string, string> = {
    symbol: c.symbol, side: openSide(a.side), type: market ? 'MARKET' : 'LIMIT', quantity: fmt(qty, step),
    newClientOrderId: idr.id,
    newOrderRespType: 'RESULT', // tài liệu: MARKET trả luôn trạng thái FILLED cuối cùng
  };
  if (a.kind === 'limit') {
    params.price = fmt(price, c.tickSize);
    if (a.ioc === true) {
      if (a.expireAt !== undefined) problems.push('Lệnh IOC không đi cùng hạn tự hủy (expireAt/GTD)');
      params.timeInForce = 'IOC';
    } else if (a.expireAt === undefined) {
      params.timeInForce = 'GTC';
    } else {
      // Tài liệu: phần ms của goodTillDate bị bỏ qua → gửi giây tròn (làm tròn xuống) rồi mới kiểm mốc 600 s
      const gtd = Math.floor(a.expireAt / 1000) * 1000;
      if (!Number.isFinite(gtd) || gtd <= nowMs + GTD_MIN_AHEAD_MS + GTD_SAFETY_MS) {
        problems.push('Hạn tự hủy (GTD) phải cách hiện tại hơn 600 giây (tài liệu) + 10 giây đệm; hạn ngắn hơn bot phải tự hủy');
      } else if (gtd >= GTD_MAX) {
        problems.push(`goodTillDate phải < ${GTD_MAX}`);
      }
      params.timeInForce = 'GTD';
      params.goodTillDate = String(gtd);
    }
  }
  if (problems.length > 0) return failId(idr.id, problems);
  return okReq({ method: 'POST', path: ORDER_PATH, params, createsOrder: true }, idr.id);
}

// ---- Lệnh điều kiện (/fapi/v1/algoOrder) -------------------------------------------------------
// Bộ dựng DUY NHẤT cho lệnh tạo algo: luôn algoType=CONDITIONAL, workingType=MARK_PRICE (mặc định của sàn là CONTRACT_PRICE).
function algoRequest(params: Record<string, string>): RequestOpts {
  return { method: 'POST', path: ALGO_PATH, params: { algoType: 'CONDITIONAL', ...params, workingType: 'MARK_PRICE' }, createsOrder: true };
}

// Giá kích hoạt phải nằm đúng phía giá vào: SL bên lỗ, TP/kích hoạt trailing bên lời
function sideProblem(what: string, side: Side, entry: number, price: number, profitSide: boolean): string[] {
  const above = price > entry;
  const wantAbove = (side === 'long') === profitSide;
  return above === wantAbove && price !== entry ? [] : [`${what} ${price} sai phía giá vào ${entry} (vị thế ${side})`];
}

// Dùng cho SL ban đầu, dừng sàn hòa vốn (D10, leg BE) và dời SL (hủy + đặt lại, mục 4.5).
// markPrice = giá MARK hiện tại: điều kiện thật của sàn (SL đã ở phía sai so với mark → kích hoạt ngay, -2021/-4142).
// Không kiểm theo giá vào: dừng hòa vốn nằm phía LỜI của giá vào là hợp lệ.
// purpose quyết định hướng làm tròn tick:
//   'initial'   = SL ban đầu: XA giá vào (Long XUỐNG, Short LÊN) — giống hệt core (packages/core/plan.ts, awayDir); kế hoạch đã làm
//                 tròn sẵn nên với giá do core tạo đây là phép đồng nhất (giá in cho người dùng = giá gửi sàn).
//   'breakeven' = dừng sàn hòa vốn / dời SL về hòa vốn: về phía được bảo vệ (Long LÊN, Short XUỐNG) — không bao giờ tệ hơn hòa vốn.
export type StopPurpose = 'initial' | 'breakeven';
export type StopLossInput = { contract: Contract; side: Side; markPrice: number; triggerPrice: number; purpose: StopPurpose; id: ClientIdParts };

// SL: STOP_MARKET closePosition=true (đóng toàn bộ vị thế). Tài liệu: closePosition không dùng cùng quantity và reduceOnly.
// priceProtect CỐ ĐỊNH false: với true, sàn KHÔNG kích hoạt khi |MARK − CONTRACT| > triggerProtect (mục 4.2) — đúng lúc sập
// giá, khi vị thế isolated cần đóng nhất; MARK_PRICE đã chống râu nến. Khớp xấu hơn còn hơn không đóng.
// KHÔNG kiểm MAX_NUM_ORDERS tại chỗ: số đếm cũ/sai không bao giờ được là lý do dừng không lên sàn; lệnh vào đã giữ chỗ.
function buildStopLoss(a: StopLossInput): Built {
  const c = a.contract;
  const idr = tryId(a.id);
  if ('problem' in idr) return fail(idr.problem);
  if (!isPos(a.markPrice) || !isPos(a.triggerPrice)) return failId(idr.id, [`Giá mark ${a.markPrice} / giá dừng ${a.triggerPrice} không hợp lệ`]);
  if (a.purpose !== 'initial' && a.purpose !== 'breakeven') return failId(idr.id, [`purpose "${String(a.purpose)}" phải là 'initial' hoặc 'breakeven'`]);
  const up = a.purpose === 'initial' ? a.side === 'short' : a.side === 'long';
  const trigger = snapToTick(a.triggerPrice, c.tickSize, up ? 'up' : 'down');
  // Kiểm SAU khi làm tròn. Long (SELL stop) cần trigger < mark; Short (BUY stop) cần trigger > mark
  const wrong = a.side === 'long' ? trigger >= a.markPrice : trigger <= a.markPrice;
  if (wrong) return failId(idr.id, [`Giá dừng ${trigger} đã ở phía sai giá mark ${a.markPrice} (vị thế ${a.side}) — sẽ kích hoạt ngay`]);
  return okReq(algoRequest({
    symbol: c.symbol, side: closeSide(a.side), type: 'STOP_MARKET', triggerPrice: fmt(trigger, c.tickSize),
    closePosition: 'true', priceProtect: 'false', clientAlgoId: idr.id,
  }), idr.id);
}

export type TakeProfitInput = {
  contract: Contract; side: Side; entryPrice: number; triggerPrice: number; qty: number;
  id: ClientIdParts; openCount: number;
};

// TP: TAKE_PROFIT_MARKET reduceOnly + quantity (chốt một phần).
// priceProtect CỐ ĐỊNH true (khác mặc định false của sàn): TP không kích hoạt lúc giá lệch thì không nguy hiểm (SL/trailing vẫn còn),
// và tránh bán vào sổ lệnh đang méo.
function buildTakeProfit(a: TakeProfitInput): Built {
  const c = a.contract;
  const idr = tryId(a.id);
  if ('problem' in idr) return fail(idr.problem);
  if (!isPos(a.entryPrice) || !isPos(a.triggerPrice)) return fail(`Giá vào ${a.entryPrice} / giá chốt lời ${a.triggerPrice} không hợp lệ`);
  if (!isPos(a.qty)) return fail(`Khối lượng ${a.qty} không hợp lệ`);
  // Giá: VỀ PHÍA giá vào (Long XUỐNG, Short LÊN), giống core — dùng chung profitSideSnap với activatePrice.
  // Khối lượng: XUỐNG theo bước lớn hơn của LOT_SIZE/MARKET_LOT_SIZE (khớp bằng market); phần lẻ còn lại vẫn có SL closePosition.
  const trigger = profitSideSnap(a.triggerPrice, a.side, c.tickSize);
  const { qty, step, problems: stepProblems } = exitQty(a.qty, c);
  const problems = [...sideProblem('Giá chốt lời', a.side, a.entryPrice, trigger, true), ...exitPartProblems([qty], c), ...stepProblems, ...countProblems(a.openCount, 1, c)];
  if (problems.length > 0) return failId(idr.id, problems);
  return okReq(algoRequest({
    symbol: c.symbol, side: closeSide(a.side), type: 'TAKE_PROFIT_MARKET', triggerPrice: fmt(trigger, c.tickSize),
    quantity: fmt(qty, step), reduceOnly: 'true', priceProtect: 'true', clientAlgoId: idr.id,
  }), idr.id);
}

export type TrailingInput = {
  contract: Contract; side: Side; entryPrice: number; activatePrice: number;
  callbackPct: number; // = TrailingPlan.callbackPct (core/exit.ts); làm tròn XUỐNG 0,01 lần nữa ở đây
  qty: number; id: ClientIdParts; openCount: number;
};

// Trailing: TRAILING_STOP_MARKET reduceOnly + quantity, activatePrice (KHÔNG phải activationPrice), callbackRate [0,1; 10]
function buildTrailing(a: TrailingInput): Built {
  const c = a.contract;
  const idr = tryId(a.id);
  if ('problem' in idr) return fail(idr.problem);
  if (!isPos(a.entryPrice) || !isPos(a.activatePrice)) return fail(`Giá vào ${a.entryPrice} / giá kích hoạt ${a.activatePrice} không hợp lệ`);
  if (!isPos(a.qty)) return fail(`Khối lượng ${a.qty} không hợp lệ`);
  const { binanceTrailCallbackMinPct: min, binanceTrailMaxCallbackPct: max } = COMMON;
  if (!Number.isFinite(a.callbackPct)) return fail(`callbackRate ${a.callbackPct} không hợp lệ`);
  const cb = floorPct2(a.callbackPct); // XUỐNG: mức dừng lúc kích hoạt không thấp hơn kế hoạch (≥ giá vào + phí)
  // Ngoài khoảng thì TỪ CHỐI, không tự kẹp: kẹp lên min có thể phá bảo đảm không lỗ (exit.ts đã kẹp và báo needsBreakevenFloor)
  if (cb < min || cb > max) return fail(`callbackRate ${a.callbackPct} (làm tròn ${cb}) ngoài khoảng tài liệu [${min}; ${max}]`);
  // activatePrice làm tròn ĐÚNG như trigger TP1 (profitSideSnap) → activatePrice = TP1 thì gửi ra cùng một số: TP1 khớp
  // nghĩa là trailing đã tới mức kích hoạt. Giá chưa khớp tick có thể lùi tối đa 1 tick về phía giá vào (mức dừng lúc
  // kích hoạt thấp hơn kế hoạch ≤ 1 tick); giá do core tạo đã khớp tick nên không đổi.
  const activate = profitSideSnap(a.activatePrice, a.side, c.tickSize);
  const { qty, step, problems: stepProblems } = exitQty(a.qty, c);
  const problems = [...sideProblem('Giá kích hoạt trailing', a.side, a.entryPrice, activate, true), ...exitPartProblems([qty], c), ...stepProblems, ...countProblems(a.openCount, 1, c)];
  if (problems.length > 0) return failId(idr.id, problems);
  // priceProtect: tài liệu chỉ nêu cho STOP_MARKET/TAKE_PROFIT_MARKET → không gửi cho trailing (theo mặc định của sàn)
  return okReq(algoRequest({
    symbol: c.symbol, side: closeSide(a.side), type: 'TRAILING_STOP_MARKET', quantity: fmt(qty, step), reduceOnly: 'true',
    activatePrice: fmt(activate, c.tickSize), callbackRate: String(cb), clientAlgoId: idr.id,
  }), idr.id);
}

// ---- Hủy / tra / liệt kê ------------------------------------------------------------------------
export type OrderRef = { orderId: number } | { clientId: string };
export type AlgoRef = { algoId: number } | { clientId: string };

function refParams(ref: OrderRef | AlgoRef, idKey: 'orderId' | 'algoId', clientKey: 'origClientOrderId' | 'clientAlgoId'): Record<string, string> | string {
  if ('clientId' in ref) return CLIENT_ID_RE.test(ref.clientId) ? { [clientKey]: ref.clientId } : `Mã client "${ref.clientId}" sai quy tắc tài liệu`;
  const n = (ref as Record<string, number>)[idKey];
  return Number.isInteger(n) && n! > 0 ? { [idKey]: String(n) } : `${idKey} ${n} phải là số nguyên > 0`;
}

const symOk = (s: string) => typeof s === 'string' && s !== '';

function orderRefRequest(method: 'GET' | 'DELETE', symbol: string, ref: OrderRef): Built {
  if (!symOk(symbol)) return fail('Thiếu symbol');
  const p = refParams(ref, 'orderId', 'origClientOrderId');
  if (typeof p === 'string') return fail(p);
  return okReq({ method, path: ORDER_PATH, params: { symbol, ...p }, createsOrder: false });
}

// Hủy/tra algo: tài liệu chỉ nêu algoId hoặc clientAlgoId, KHÔNG nêu symbol → không gửi symbol (phải kiểm trên Demo)
function algoRefRequest(method: 'GET' | 'DELETE', ref: AlgoRef): Built {
  const p = refParams(ref, 'algoId', 'clientAlgoId');
  if (typeof p === 'string') return fail(p);
  return okReq({ method, path: ALGO_PATH, params: p, createsOrder: false });
}

// Liệt kê: bắt buộc symbol ở module này (bỏ symbol tốn weight 40 thay vì 1)
function listRequest(path: string, symbol: string): Built {
  if (!symOk(symbol)) return fail('Thiếu symbol');
  return okReq({ method: 'GET', path, params: { symbol }, createsOrder: false });
}

// Công tắc người chết theo TỪNG symbol: gọi lặp (vd mỗi 30 s với 120000); 0 = tắt.
// Có hủy cả lệnh algo (SL) hay không: KHÔNG THẤY TRONG TÀI LIỆU (mục 3.4) — phải kiểm trên Demo.
function buildCountdown(symbol: string, countdownMs: number): Built {
  if (!symOk(symbol)) return fail('Thiếu symbol');
  if (!Number.isInteger(countdownMs) || countdownMs < 0) return fail(`countdownTime ${countdownMs} phải là số nguyên ms ≥ 0`);
  return okReq({ method: 'POST', path: '/fapi/v1/countdownCancelAll', params: { symbol, countdownTime: String(countdownMs) }, createsOrder: false });
}

// ---- Thiết lập tài khoản (mục 2) ----------------------------------------------------------------
function buildMarginIsolated(symbol: string): Built {
  if (!symOk(symbol)) return fail('Thiếu symbol');
  return okReq({ method: 'POST', path: '/fapi/v1/marginType', params: { symbol, marginType: 'ISOLATED' }, createsOrder: false });
}

function buildLeverage(symbol: string, leverage: number): Built {
  if (!symOk(symbol)) return fail('Thiếu symbol');
  if (!Number.isInteger(leverage) || leverage < 1) return fail(`leverage ${leverage} phải là số nguyên ≥ 1`);
  return okReq({ method: 'POST', path: '/fapi/v1/leverage', params: { symbol, leverage: String(leverage) }, createsOrder: false });
}

// TẤT CẢ bộ dựng request của module (thuần, không gửi gì). Test R1 duyệt hết danh sách này.
export const builders = {
  entry: buildEntry,
  stopLoss: buildStopLoss,
  takeProfit: buildTakeProfit,
  trailing: buildTrailing,
  cancelOrder: (symbol: string, ref: OrderRef) => orderRefRequest('DELETE', symbol, ref),
  queryOrder: (symbol: string, ref: OrderRef) => orderRefRequest('GET', symbol, ref),
  openOrders: (symbol: string) => listRequest('/fapi/v1/openOrders', symbol),
  cancelAlgo: (ref: AlgoRef) => algoRefRequest('DELETE', ref),
  queryAlgo: (ref: AlgoRef) => algoRefRequest('GET', ref),
  openAlgoOrders: (symbol: string) => listRequest('/fapi/v1/openAlgoOrders', symbol),
  countdownCancelAll: buildCountdown,
  positionMode: (): Built => okReq({ method: 'GET', path: '/fapi/v1/positionSide/dual', params: {}, createsOrder: false }),
  multiAssetsMode: (): Built => okReq({ method: 'GET', path: '/fapi/v1/multiAssetsMargin', params: {}, createsOrder: false }),
  marginTypeIsolated: buildMarginIsolated,
  leverage: buildLeverage,
};

// ---- Gửi ----------------------------------------------------------------------------------------
type SignedApi = { request(o: RequestOpts): Promise<SignedResult> };

const NO_COUNT = { tenSec: null, oneMin: null };

export function createOrders(deps: { api: SignedApi; now?: () => number }) {
  const now = deps.now ?? Date.now;

  async function send(b: Built): Promise<OrderResult> {
    if (!b.ok) {
      return { kind: 'rejected', code: null, msg: `Từ chối tại chỗ (chưa gửi): ${b.problems.join('; ')}`, status: 0, body: null, orderCount: NO_COUNT, clientId: b.clientId, sent: false };
    }
    assertR1(b.req);
    const r = await deps.api.request(b.req);
    return { ...r, clientId: b.clientId, sent: true };
  }

  // Đọc một trường boolean của phản hồi; không ok hoặc sai kiểu → ném lỗi (thiết lập tài khoản phải fail-closed)
  function readBool(r: OrderResult, field: string, what: string): boolean {
    if (r.kind !== 'ok') throw new Error(`Không đọc được ${what}: ${r.kind}${r.code !== null ? ` (${r.code})` : ''} ${r.msg}`.trim());
    const v = (r.body as Record<string, unknown> | null)?.[field];
    if (typeof v !== 'boolean') throw new Error(`Phản hồi ${what} thiếu trường boolean "${field}" (nhận ${JSON.stringify(v)})`);
    return v;
  }

  async function getPositionMode() {
    const r = await send(builders.positionMode());
    return { result: r, dualSidePosition: readBool(r, 'dualSidePosition', 'position mode') };
  }

  async function getMultiAssetsMode() {
    const r = await send(builders.multiAssetsMode());
    return { result: r, multiAssetsMargin: readBool(r, 'multiAssetsMargin', 'Multi-Assets mode') };
  }

  return {
    placeEntry: (a: EntryInput) => send(buildEntry(a, now())),
    // Mọi từ chối (tại chỗ hoặc từ sàn) của lệnh dừng → 'stop_rejected': nơi gọi đóng market + Telegram khẩn
    placeStopLoss: async (a: StopLossInput): Promise<OrderResult> => {
      const r = await send(buildStopLoss(a));
      return r.kind === 'rejected' ? { ...r, kind: 'stop_rejected' } : r;
    },
    placeTakeProfit: (a: TakeProfitInput) => send(buildTakeProfit(a)),
    placeTrailing: (a: TrailingInput) => send(buildTrailing(a)),
    cancelOrder: (symbol: string, ref: OrderRef) => send(builders.cancelOrder(symbol, ref)),
    queryOrder: (symbol: string, ref: OrderRef) => send(builders.queryOrder(symbol, ref)),
    openOrders: (symbol: string) => send(builders.openOrders(symbol)),
    cancelAlgo: (ref: AlgoRef) => send(builders.cancelAlgo(ref)),
    queryAlgo: (ref: AlgoRef) => send(builders.queryAlgo(ref)),
    openAlgoOrders: (symbol: string) => send(builders.openAlgoOrders(symbol)),
    countdownCancelAll: (symbol: string, countdownMs: number) => send(buildCountdown(symbol, countdownMs)),

    getPositionMode,
    // KHÔNG tự đổi chế độ: đổi position mode ảnh hưởng MỌI symbol và bị chặn khi có lệnh/vị thế (mục 2)
    async assertOneWay(): Promise<void> {
      const { dualSidePosition } = await getPositionMode();
      if (dualSidePosition) {
        throw new Error('Tài khoản Futures đang ở chế độ Hedge (dualSidePosition=true). Bot chỉ chạy One-way: hãy tự chuyển sang One-way trên Binance rồi chạy lại — bot KHÔNG tự đổi.');
      }
    },
    getMultiAssetsMode,
    // Multi-Assets và isolated loại trừ nhau (-4167/-4168, mục 2) → bật thì dừng, không tự đổi
    async assertSingleAssetMode(): Promise<void> {
      const { multiAssetsMargin } = await getMultiAssetsMode();
      if (multiAssetsMargin) {
        throw new Error('Tài khoản đang bật Multi-Assets mode (multiAssetsMargin=true) — không dùng được ký quỹ ISOLATED. Hãy tự tắt (về Single-Asset) trên Binance rồi chạy lại — bot KHÔNG tự đổi.');
      }
    },
    // -4046 NO_NEED_TO_CHANGE_MARGIN_TYPE = đã là ISOLATED → coi là thành công (đề xuất của tài liệu tra cứu, mục 2)
    async setMarginTypeIsolated(symbol: string): Promise<OrderResult> {
      const r = await send(buildMarginIsolated(symbol));
      if (r.kind === 'rejected' && r.code === -4046) return { ...r, kind: 'ok', msg: `${symbol} đã là ISOLATED (-4046: không cần đổi)` };
      return r;
    },
    setLeverage: (symbol: string, leverage: number) => send(buildLeverage(symbol, leverage)),
  };
}
