import { makeClientId, type ClientIdParts, type createOrders, type OrderResult, type StopLossInput } from '../binance/orders.ts';
import type { Contract, Side } from '../core/types.ts';
import type { Journal, OrderOp } from './journal.ts';
import { roleOfClientId, type Action, type AlertLevel, type ExPosition, type LegRole, type LegStatus } from './reconcile.ts';

// Executor (B5, thiết kế D6/R2/R7/R8): thực hiện danh sách Action của reconcile THEO ĐÚNG THỨ TỰ qua client lệnh (orders.ts).
// - Mỗi request làm thay đổi sàn (đặt/hủy/đóng/giảm) được ghi order_intent TRƯỚC khi gửi và order_result SAU khi có phản hồi.
// - Không bao giờ gửi lại mù lệnh tạo lệnh: kết quả không rõ → TRA LẠI (queryAlgo/queryOrder); chỉ gửi lần thử MỚI (mã client
//   mới) khi sàn xác nhận lệnh KHÔNG có.
// - Nghĩa vụ B4 #1: lệnh dừng không rõ → tra NGAY trong cùng lượt; vắng → đặt lại ngay; đặt lại hỏng → theo onReject
//   (không còn dừng nào: hủy lệnh vào treo rồi đóng market + Telegram khẩn).
// - Bị khóa rate limit / IP ban (banned) hoặc lệch giờ (clock) → DỪNG LƯỢT ngay (mọi request ký sau đó đều sẽ hỏng).
// - Không đọc cầu chì: protections chỉ chặn lệnh MỚI ở bước vào lệnh, không bao giờ chặn lệnh bảo vệ/đóng khẩn ở đây.

type Orders = ReturnType<typeof createOrders>;
export type OrdersClient = Pick<Orders,
  'placeStopLoss' | 'placeReduceStop' | 'placeTakeProfit' | 'placeTrailing' | 'cancelOrder' | 'cancelAlgo' | 'queryOrder' | 'queryAlgo'
  | 'openAlgoOrders' | 'closeMarket'>;

export type ExecutorCtx = {
  orders: OrdersClient;
  journal: Pick<Journal, 'append' | 'state'>;
  runId: string; // mã lần chạy (mã client lệnh đóng/giảm)
  pass: number; // số lượt đối chiếu 0–999 — lần thử trong mã client lệnh đóng/giảm (không trùng giữa các lượt)
  positions: readonly ExPosition[]; // vị thế thật dùng cho lần đối chiếu sinh ra danh sách hành động
  filters: Readonly<Record<string, Contract>>;
  notify: (a: { level: AlertLevel; symbol: string | null; text: string }) => void; // Telegram/log
};

export type ExecReport = {
  halted: { kind: 'banned' | 'clock'; reason: string } | null;
  done: number; // số hành động đã thực hiện
  skipped: Array<{ action: Action['type']; clientId: string | null; reason: string }>;
  blockedSymbols: string[]; // mã reconcile yêu cầu khóa (vị thế lạ / mơ hồ)
  closedSymbols: string[]; // mã đã gửi đóng khẩn trong lượt
  frozenSymbols: string[]; // mã không làm thêm lệnh mới trong lượt (đã đóng khẩn / dừng chưa xác nhận / dừng đã kích hoạt)
  reconcileAgain: boolean; // nơi gọi nên đối chiếu lại ngay (kết quả tra/không rõ đã đổi trạng thái)
};

class Halt extends Error {
  readonly kind: 'banned' | 'clock';
  constructor(kind: 'banned' | 'clock', msg: string) {
    super(msg);
    this.kind = kind;
  }
}

type AlgoPresence = 'present' | 'absent' | 'triggered' | 'unresolved';
const NO_SUCH_ORDER = -2013; // tài liệu tra cứu mục 3.3/10: "Order does not exist."

const num = (body: unknown, key: string): number | null => {
  const v = body !== null && typeof body === 'object' ? (body as Record<string, unknown>)[key] : undefined;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};
const str = (body: unknown, key: string): string | null => {
  const v = body !== null && typeof body === 'object' ? (body as Record<string, unknown>)[key] : undefined;
  return typeof v === 'string' ? v : null;
};
const sideOfAmt = (amt: number): Side => (amt > 0 ? 'long' : 'short');

export async function executeActions(actions: readonly Action[], ctx: ExecutorCtx): Promise<ExecReport> {
  const rep: ExecReport = { halted: null, done: 0, skipped: [], blockedSymbols: [], closedSymbols: [], frozenSymbols: [], reconcileAgain: false };
  const placed = new Set<string>(); // mã client lệnh mới đã được sàn nhận (gồm bí danh: mã gốc → lần thử đặt lại)
  const frozen = new Set<string>();
  const closed = new Set<string>();
  const say = (level: AlertLevel, symbol: string | null, text: string) => ctx.notify({ level, symbol, text });
  const freeze = (sym: string) => {
    if (!frozen.has(sym)) { frozen.add(sym); rep.frozenSymbols.push(sym); }
  };
  const skip = (a: Action, clientId: string | null, reason: string) => rep.skipped.push({ action: a.type, clientId, reason });
  const roleOf = (signalId: string | null, clientId: string): LegRole | null => {
    const t = signalId === null ? undefined : ctx.journal.state().trades[signalId];
    return t === undefined ? null : roleOfClientId(t, clientId)?.role ?? null;
  };
  const checkLock = (r: OrderResult) => {
    if (r.kind === 'banned' || r.kind === 'clock') throw new Halt(r.kind, `${r.kind}${r.code !== null ? ` (${r.code})` : ''} ${r.msg}`.trim());
  };

  // Gửi một request làm thay đổi sàn: order_intent → gửi → order_result
  type Meta = { op: OrderOp; symbol: string; signalId: string | null; role: LegRole | null; clientId: string; attempt: number; qty: number | null; triggerPrice: number | null };
  async function send(m: Meta, call: () => Promise<OrderResult>): Promise<OrderResult> {
    ctx.journal.append({ type: 'order_intent', ...m });
    const r = await call();
    ctx.journal.append({
      type: 'order_result', op: m.op, symbol: m.symbol, signalId: m.signalId, role: m.role, clientId: m.clientId,
      kind: r.kind, sent: r.sent, orderId: num(r.body, 'algoId') ?? num(r.body, 'orderId'), code: r.code, msg: r.msg,
    });
    checkLock(r);
    return r;
  }
  async function query(call: () => Promise<OrderResult>): Promise<OrderResult> {
    const r = await call();
    checkLock(r);
    return r;
  }
  const legUpdate = (signalId: string | null, role: LegRole | null, clientId: string, status: LegStatus, reason: string) => {
    if (signalId !== null && role !== null) ctx.journal.append({ type: 'leg_update', signalId, role, clientId, status, reason });
  };

  // Lệnh algo có đang nằm trên sàn? queryAlgo trước; không kết luận được → liệt kê openAlgoOrders của mã.
  // Mã lỗi "không tồn tại" riêng của algo KHÔNG có trong tài liệu → chỉ tin -2013 (NO_SUCH_ORDER chung) — PHẢI KIỂM TRÊN DEMO.
  async function algoPresence(symbol: string, clientId: string): Promise<AlgoPresence> {
    const q = await query(() => ctx.orders.queryAlgo({ clientId }));
    if (q.kind === 'ok') {
      const st = str(q.body, 'algoStatus');
      if (st === 'NEW') return 'present';
      if (st === 'TRIGGERING' || st === 'TRIGGERED' || st === 'FINISHED') return 'triggered';
      if (st === 'CANCELED' || st === 'EXPIRED' || st === 'REJECTED') return 'absent';
    } else if (q.kind === 'rejected' && q.sent && q.code === NO_SUCH_ORDER) {
      return 'absent';
    }
    const l = await query(() => ctx.orders.openAlgoOrders(symbol));
    if (l.kind === 'ok' && Array.isArray(l.body) && l.body.every((o) => str(o, 'clientAlgoId') !== null)) {
      return l.body.some((o) => str(o, 'clientAlgoId') === clientId) ? 'present' : 'absent';
    }
    return 'unresolved';
  }

  const placeStopCall = (input: StopLossInput, qty: number | null) =>
    qty === null ? () => ctx.orders.placeStopLoss(input) : () => ctx.orders.placeReduceStop({ ...input, qty });

  // Đóng market reduce-only cả vị thế/phần khối lượng. Không rõ → tra queryOrder; chỉ đóng khẩn được gửi lại (đúng 1 lần, mã mới)
  // khi sàn xác nhận lệnh không có (-2013).
  async function marketOrder(kind: 'close' | 'reduce', symbol: string, signalId: string | null, side: Side, qty: number, reason: string): Promise<void> {
    const c = ctx.filters[symbol];
    if (c === undefined) {
      say('urgent', symbol, `KHẨN ${symbol}: thiếu bộ lọc sàn — KHÔNG gửi được lệnh ${kind === 'close' ? 'đóng' : 'giảm'} market ${qty} (${reason}). Xử lý tay ngay.`);
      freeze(symbol);
      return;
    }
    const sid = signalId ?? `${symbol}|dong-khan`;
    const leg = kind === 'close' ? 'MC' : 'RD';
    const attempt = ((ctx.pass % 1000) + 1000) % 1000;
    const attemptOnce = async (legName: string): Promise<{ r: OrderResult; clientId: string }> => {
      const id: ClientIdParts = { runId: ctx.runId, signalId: sid, leg: legName, attempt };
      const clientId = makeClientId(id);
      const r = await send({ op: kind, symbol, signalId, role: null, clientId, attempt, qty, triggerPrice: null }, () => ctx.orders.closeMarket({ contract: c, side, qty, id }));
      return { r, clientId };
    };
    const what = kind === 'close' ? 'đóng market' : 'giảm vị thế market';
    let { r, clientId } = await attemptOnce(leg);
    if (r.kind === 'unknown_status') {
      const q = await query(() => ctx.orders.queryOrder(symbol, { clientId }));
      if (q.kind === 'ok') {
        say(kind === 'close' ? 'urgent' : 'warn', symbol, `${symbol}: lệnh ${what} ${qty} đã có trên sàn (trạng thái ${str(q.body, 'status') ?? 'không rõ'})`);
        rep.reconcileAgain = true;
        return;
      }
      if (q.kind === 'rejected' && q.sent && q.code === NO_SUCH_ORDER && kind === 'close') {
        ({ r, clientId } = await attemptOnce(`${leg}R`));
      } else {
        say('urgent', symbol, `KHẨN ${symbol}: lệnh ${what} ${qty} không rõ trạng thái và tra lại không kết luận được — KHÔNG gửi lại; đối chiếu lại/xử lý tay`);
        rep.reconcileAgain = true;
        return;
      }
    }
    rep.reconcileAgain = true;
    if (r.kind === 'ok') say(kind === 'close' ? 'urgent' : 'warn', symbol, `${kind === 'close' ? 'KHẨN ' : ''}${symbol}: đã ${what} ${qty} (${reason})`);
    else say('urgent', symbol, `KHẨN ${symbol}: ${what} ${qty} THẤT BẠI (${r.kind}${r.code !== null ? ` ${r.code}` : ''} ${r.msg}) — XỬ LÝ TAY NGAY`);
  }

  // Đóng khẩn: hủy lệnh vào còn treo TRƯỚC (để không mở lại vị thế), rồi đóng market cả vị thế thật
  // given: khối lượng/chiều reconcile đã tính (market_close) — dùng khi ảnh chụp vị thế không có mã này
  async function closeNow(symbol: string, signalId: string | null, entries: ReadonlyArray<{ clientId: string; orderId: number }>, reason: string, given?: { side: Side; qty: number }): Promise<void> {
    if (closed.has(symbol)) return;
    closed.add(symbol);
    rep.closedSymbols.push(symbol);
    freeze(symbol);
    for (const e of entries) {
      await send({ op: 'cancel', symbol, signalId, role: roleOf(signalId, e.clientId), clientId: e.clientId, attempt: 0, qty: null, triggerPrice: null },
        () => ctx.orders.cancelOrder(symbol, { orderId: e.orderId }));
    }
    const p = ctx.positions.find((x) => x.symbol === symbol && x.positionAmt !== 0);
    if (p === undefined && given !== undefined) {
      await marketOrder('close', symbol, signalId, given.side, given.qty, reason);
      return;
    }
    if (p === undefined) {
      say('urgent', symbol, `KHẨN ${symbol}: cần đóng khẩn (${reason}) nhưng không thấy vị thế trong ảnh chụp — đối chiếu lại ngay`);
      rep.reconcileAgain = true;
      return;
    }
    await marketOrder('close', symbol, signalId, sideOfAmt(p.positionAmt), Math.abs(p.positionAmt), reason);
  }

  async function placeStop(a: Extract<Action, { type: 'place_stop' }>): Promise<void> {
    const sym = a.symbol;
    const meta = (clientId: string, attempt: number): Meta => ({ op: 'place', symbol: sym, signalId: a.signalId, role: a.role, clientId, attempt, qty: a.qty, triggerPrice: a.input.triggerPrice });
    let r = await send(meta(a.clientId, a.input.id.attempt), placeStopCall(a.input, a.qty));
    if (r.kind === 'ok') { placed.add(a.clientId); return; }
    let lastId = a.clientId;
    let unresolved = false;
    if (r.kind === 'unknown_status') {
      const pr = await algoPresence(sym, a.clientId);
      if (pr === 'present') {
        legUpdate(a.signalId, a.role, a.clientId, 'open', 'Tra lại: lệnh dừng đã nằm trên sàn');
        placed.add(a.clientId);
        return;
      }
      if (pr === 'triggered') {
        legUpdate(a.signalId, a.role, a.clientId, 'filled', 'Tra lại: lệnh dừng đã kích hoạt');
        say('urgent', sym, `KHẨN ${sym}: lệnh dừng ${a.role} ${a.clientId} đã kích hoạt — đối chiếu lại`);
        freeze(sym);
        rep.reconcileAgain = true;
        return;
      }
      if (pr === 'absent') {
        legUpdate(a.signalId, a.role, a.clientId, 'gone', 'Tra lại: lệnh dừng KHÔNG có trên sàn — đặt lại ngay');
        const input2: StopLossInput = { ...a.input, id: { ...a.input.id, attempt: a.input.id.attempt + 1 } };
        lastId = makeClientId(input2.id);
        r = await send(meta(lastId, input2.id.attempt), placeStopCall(input2, a.qty));
        if (r.kind === 'ok') {
          placed.add(a.clientId); // bí danh: lệnh hủy dừng cũ chờ mã gốc
          placed.add(lastId);
          say('warn', sym, `${sym}: lệnh dừng ${a.role} không rõ, tra lại không thấy — đã đặt lại ${lastId}`);
          return;
        }
        if (r.kind === 'unknown_status') {
          const pr2 = await algoPresence(sym, lastId);
          if (pr2 === 'present') {
            legUpdate(a.signalId, a.role, lastId, 'open', 'Tra lại: lệnh dừng đặt lại đã nằm trên sàn');
            placed.add(a.clientId);
            placed.add(lastId);
            return;
          }
          unresolved = pr2 !== 'absent';
        }
      } else {
        unresolved = true;
      }
    }
    // Hỏng: chưa có lệnh dừng mới trên sàn (hoặc không xác nhận được)
    const detail = `${r.kind}${r.code !== null ? ` ${r.code}` : ''}${r.msg ? ` ${r.msg}` : ''}`;
    if (a.onReject === 'stop_replace_rejected') {
      freeze(sym);
      rep.reconcileAgain = true;
      if (unresolved) {
        say('urgent', sym, `KHẨN ${sym}: không xác nhận được lệnh dừng mới ${lastId} (${detail}) — GIỮ lệnh dừng cũ, không hủy; đối chiếu lại`);
        return;
      }
      if (a.signalId !== null) ctx.journal.append({ type: 'stop_replace_rejected', signalId: a.signalId, role: a.role, clientId: lastId, code: r.code, msg: r.msg });
      say('warn', sym, `${sym}: sàn từ chối lệnh dừng mới ${a.role} (${detail}) — giữ lệnh dừng cũ; lần sau thay theo hủy-trước-đặt-sau`);
      return;
    }
    await closeNow(sym, a.signalId, a.onRejectCancelEntries,
      unresolved ? `không xác nhận được lệnh dừng ${a.role} trên sàn (${detail})` : `đặt lệnh dừng ${a.role} hỏng (${detail})`);
  }

  async function placeExit(a: Extract<Action, { type: 'place_tp1' | 'place_trailing' }>): Promise<void> {
    const role: LegRole = a.type === 'place_tp1' ? 'TP1' : 'TR';
    const trig = a.type === 'place_tp1' ? a.input.triggerPrice : a.input.activatePrice;
    const r = await send({ op: 'place', symbol: a.symbol, signalId: a.signalId, role, clientId: a.clientId, attempt: a.input.id.attempt, qty: a.input.qty, triggerPrice: trig },
      a.type === 'place_tp1' ? () => ctx.orders.placeTakeProfit(a.input) : () => ctx.orders.placeTrailing(a.input));
    if (r.kind === 'ok') { placed.add(a.clientId); return; }
    rep.reconcileAgain = true;
    if (r.kind === 'unknown_status') return; // reconcile phát query_algo ở lượt sau — không gửi lại mù
    say('warn', a.symbol, `${a.symbol}: không đặt được ${role} (${r.kind}${r.code !== null ? ` ${r.code}` : ''} ${r.msg}) — vị thế vẫn có lệnh dừng`);
  }

  async function cancel(a: Extract<Action, { type: 'cancel_algo' | 'cancel_order' }>): Promise<void> {
    const role = roleOf(a.signalId, a.clientId);
    const m: Meta = { op: 'cancel', symbol: a.symbol, signalId: a.signalId, role, clientId: a.clientId, attempt: 0, qty: null, triggerPrice: null };
    const r = a.type === 'cancel_algo'
      ? await send(m, () => ctx.orders.cancelAlgo({ algoId: a.algoId }))
      : await send(m, () => ctx.orders.cancelOrder(a.symbol, { orderId: a.orderId }));
    if (r.kind !== 'ok') rep.reconcileAgain = true; // đã khớp/hủy từ trước hoặc không rõ → lượt sau đối chiếu
  }

  async function queryOrderAction(a: Extract<Action, { type: 'query_order' }>): Promise<void> {
    const role = roleOf(a.signalId, a.clientId);
    const q = await query(() => ctx.orders.queryOrder(a.symbol, { clientId: a.clientId }));
    rep.reconcileAgain = true;
    if (q.kind === 'rejected' && q.sent && q.code === NO_SUCH_ORDER) {
      legUpdate(a.signalId, role, a.clientId, 'cancelled', 'Tra lại: lệnh không có trên sàn (-2013)');
      return;
    }
    const st = q.kind === 'ok' ? str(q.body, 'status') : null;
    const executed = q.kind === 'ok' ? Number(str(q.body, 'executedQty') ?? num(q.body, 'executedQty') ?? 0) : 0;
    const map: Record<string, LegStatus> = { NEW: 'open', PARTIALLY_FILLED: 'open', FILLED: 'filled', REJECTED: 'rejected' };
    let status: LegStatus | undefined = st === null ? undefined : map[st];
    if (st === 'CANCELED' || st === 'EXPIRED' || st === 'EXPIRED_IN_MATCH') status = executed > 0 ? 'filled' : 'cancelled';
    if (status === undefined) {
      say('warn', a.symbol, `${a.symbol}: tra lại lệnh ${a.clientId} chưa kết luận được (${q.kind}${st !== null ? ` ${st}` : ''}) — tra lại lượt sau`);
      return;
    }
    legUpdate(a.signalId, role, a.clientId, status, `Tra lại: ${st}`);
  }

  async function queryAlgoAction(a: Extract<Action, { type: 'query_algo' }>): Promise<void> {
    const role = roleOf(a.signalId, a.clientId);
    const pr = await algoPresence(a.symbol, a.clientId);
    rep.reconcileAgain = true;
    if (pr === 'present') legUpdate(a.signalId, role, a.clientId, 'open', 'Tra lại: đang nằm trên sàn');
    else if (pr === 'triggered') legUpdate(a.signalId, role, a.clientId, 'filled', 'Tra lại: đã kích hoạt');
    else if (pr === 'absent') legUpdate(a.signalId, role, a.clientId, 'gone', 'Tra lại: không có trên sàn');
    else say(role === 'SL' || role === 'BE' ? 'urgent' : 'warn', a.symbol, `${a.symbol}: tra lại lệnh ${a.clientId} không kết luận được — tra lại lượt sau`);
  }

  const creates = (a: Action) => a.type === 'place_stop' || a.type === 'place_tp1' || a.type === 'place_trailing' || a.type === 'reduce_only' || a.type === 'market_close';

  try {
    for (const a of actions) {
      if (creates(a) && 'symbol' in a && frozen.has(a.symbol) && !(a.type === 'market_close' && !closed.has(a.symbol))) {
        skip(a, 'clientId' in a ? a.clientId : null, `${a.symbol} đã đóng khẩn / chưa xác nhận lệnh dừng trong lượt này`);
        continue;
      }
      switch (a.type) {
        case 'place_stop': await placeStop(a); break;
        case 'place_tp1':
        case 'place_trailing': await placeExit(a); break;
        case 'cancel_algo':
          if (a.onlyAfterPlaced !== null && !placed.has(a.onlyAfterPlaced)) {
            skip(a, a.clientId, `Lệnh mới ${a.onlyAfterPlaced} chưa được sàn nhận — giữ lệnh cũ`);
            continue;
          }
          await cancel(a);
          break;
        case 'cancel_order': await cancel(a); break;
        case 'market_close': await closeNow(a.symbol, a.signalId, [], a.reason, { side: a.side, qty: a.qty }); break;
        case 'reduce_only': await marketOrder('reduce', a.symbol, a.signalId, a.side, a.qty, a.reason); break;
        case 'alert': say(a.level, a.symbol, a.text); break;
        case 'block_symbol':
        case 'adopt_unknown_position_noop':
          // Chỉ báo cho nơi gọi (không mở lệnh mới trên mã). KHÔNG chặn lệnh bảo vệ reconcile đã phát cho mã này.
          if (!rep.blockedSymbols.includes(a.symbol)) rep.blockedSymbols.push(a.symbol);
          break;
        case 'record_fill': ctx.journal.append({ type: 'fill', signalId: a.signalId, role: a.role, fill: a.fill }); break;
        case 'update_leg': ctx.journal.append({ type: 'leg_update', signalId: a.signalId, role: a.role, clientId: a.clientId, status: a.status, reason: a.reason }); break;
        case 'mark_trade_closed': ctx.journal.append({ type: 'trade_closed', signalId: a.signalId, reason: a.reason }); break;
        case 'query_order': await queryOrderAction(a); break;
        case 'query_algo': await queryAlgoAction(a); break;
        default: {
          const never: never = a;
          throw new Error(`executor: hành động lạ ${JSON.stringify(never)}`);
        }
      }
      rep.done++;
    }
  } catch (e) {
    if (!(e instanceof Halt)) throw e;
    rep.halted = { kind: e.kind, reason: e.message };
    say('urgent', null, `KHẨN bot dừng lượt gửi lệnh: ${e.kind === 'banned' ? 'bị khóa rate limit / IP ban' : 'đồng hồ lệch giờ sàn'} (${e.message}) — chờ hết khóa rồi đối chiếu lại`);
  }
  return rep;
}
