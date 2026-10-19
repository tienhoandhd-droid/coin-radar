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
// - Bị khóa rate limit / IP ban (banned) hoặc lệch giờ (clock) → DỪNG LƯỢT ngay. Lệch giờ: đồng bộ giờ rồi cứu lệnh dừng còn
//   thiếu một lần (mã mới sau khi xác nhận vắng). Vị thế còn trần cuối lượt → báo KHẨN từng mã + dấu "unprotected" trong nhật ký;
//   lượt sau các mã đó được xử lý TRƯỚC.
// - cancel_then_place: hủy dừng cũ không xác nhận → tra dừng cũ; còn sống → giữ, KHÔNG đặt mới (không bao giờ đóng oan vì -4130).
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
  sleep?: (ms: number) => Promise<void>; // tiêm được trong test; mặc định setTimeout
  confirmDelayMs?: number; // chờ trước khi tra lại lệnh "không rõ" (mặc định DEFAULT_CONFIRM_DELAY_MS)
  resyncClock?: () => Promise<unknown>; // đồng bộ giờ sàn (signed.ts syncClock) — dùng khi bị lệch giờ giữa lượt
};

// [Đề xuất, chưa kiểm] 503/-1007 nghĩa là sàn CÓ THỂ vẫn tạo lệnh sau phản hồi → chờ một nhịp trước khi kết luận "vắng"
export const DEFAULT_CONFIRM_DELAY_MS = 1500;

export type ExecReport = {
  halted: { kind: 'banned' | 'clock'; reason: string } | null;
  done: number; // số hành động đã thực hiện
  skipped: Array<{ action: Action['type']; clientId: string | null; reason: string }>;
  blockedSymbols: string[]; // mã reconcile yêu cầu khóa (vị thế lạ / mơ hồ)
  closedSymbols: string[]; // mã đã gửi đóng khẩn trong lượt
  frozenSymbols: string[]; // mã không làm thêm lệnh mới trong lượt (đã đóng khẩn / dừng chưa xác nhận / dừng đã kích hoạt)
  unprotected: string[]; // mã có vị thế mà cuối lượt vẫn KHÔNG có lệnh dừng (đã báo khẩn + ghi dấu vào nhật ký)
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

export async function executeActions(actionsIn: readonly Action[], ctx: ExecutorCtx): Promise<ExecReport> {
  const rep: ExecReport = { halted: null, done: 0, skipped: [], blockedSymbols: [], closedSymbols: [], frozenSymbols: [], unprotected: [], reconcileAgain: false };
  const placed = new Set<string>(); // mã client lệnh mới đã được sàn nhận (gồm bí danh: mã gốc → lần thử đặt lại)
  const frozen = new Set<string>();
  const closed = new Set<string>(); // đã bắt đầu đóng khẩn trong lượt
  const closeOk = new Set<string>(); // đóng khẩn đã được sàn nhận/xác nhận
  const safe = new Set<string>(); // place_stop KHÔNG cần nữa: dừng cũ còn sống / dừng đã kích hoạt
  const skipPlace = new Set<string>(); // place_stop bị bỏ vì hủy dừng cũ chưa xác nhận (tránh -4130 → đóng oan)
  const sentAttempt = new Map<string, number>(); // place_stop (mã của hành động) → lần thử cuối đã GỬI
  const sleep = ctx.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const wait = () => sleep(ctx.confirmDelayMs ?? DEFAULT_CONFIRM_DELAY_MS);
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

  // Mã bị đánh dấu "chưa bảo vệ" ở lượt trước → mọi hành động của mã đó lên TRƯỚC (giữ nguyên thứ tự bên trong)
  const symOf = (a: Action): string | null => ('symbol' in a ? a.symbol : ctx.journal.state().trades[a.signalId]?.symbol ?? null);
  const first = new Set(Object.keys(ctx.journal.state().unprotected ?? {}));
  const actions = first.size === 0 ? actionsIn : [...actionsIn.filter((a) => first.has(symOf(a) ?? '')), ...actionsIn.filter((a) => !first.has(symOf(a) ?? ''))];
  for (const sym of first) say('urgent', sym, `KHẨN ${sym}: lượt trước vị thế chưa có lệnh dừng — xử lý mã này trước`);

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

  // Đóng market reduce-only cả vị thế/phần khối lượng. Không rõ → tra queryOrder; chỉ đóng khẩn được gửi lại (đúng 1 lần, mã mới)
  // khi sàn xác nhận lệnh không có (-2013). Trả true khi sàn đã nhận/xác nhận lệnh.
  async function marketOrder(kind: 'close' | 'reduce', symbol: string, signalId: string | null, side: Side, qty: number, reason: string): Promise<boolean> {
    const c = ctx.filters[symbol];
    if (c === undefined) {
      say('urgent', symbol, `KHẨN ${symbol}: thiếu bộ lọc sàn — KHÔNG gửi được lệnh ${kind === 'close' ? 'đóng' : 'giảm'} market ${qty} (${reason}). Xử lý tay ngay.`);
      freeze(symbol);
      return false;
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
    rep.reconcileAgain = true;
    let { r, clientId } = await attemptOnce(leg);
    if (r.kind === 'unknown_status') {
      const q = await query(() => ctx.orders.queryOrder(symbol, { clientId }));
      if (q.kind === 'ok') {
        say(kind === 'close' ? 'urgent' : 'warn', symbol, `${symbol}: lệnh ${what} ${qty} đã có trên sàn (trạng thái ${str(q.body, 'status') ?? 'không rõ'})`);
        return true;
      }
      if (q.kind === 'rejected' && q.sent && q.code === NO_SUCH_ORDER && kind === 'close') {
        ({ r, clientId } = await attemptOnce(`${leg}R`));
      } else {
        say('urgent', symbol, `KHẨN ${symbol}: lệnh ${what} ${qty} không rõ trạng thái và tra lại không kết luận được — KHÔNG gửi lại; đối chiếu lại/xử lý tay`);
        return false;
      }
    }
    if (r.kind === 'ok') {
      say(kind === 'close' ? 'urgent' : 'warn', symbol, `${kind === 'close' ? 'KHẨN ' : ''}${symbol}: đã ${what} ${qty} (${reason})`);
      return true;
    }
    say('urgent', symbol, `KHẨN ${symbol}: ${what} ${qty} THẤT BẠI (${r.kind}${r.code !== null ? ` ${r.code}` : ''} ${r.msg}) — XỬ LÝ TAY NGAY`);
    return false;
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
    const target = p !== undefined ? { side: sideOfAmt(p.positionAmt), qty: Math.abs(p.positionAmt) } : given;
    if (target === undefined) {
      say('urgent', symbol, `KHẨN ${symbol}: cần đóng khẩn (${reason}) nhưng không thấy vị thế trong ảnh chụp — đối chiếu lại ngay`);
      rep.reconcileAgain = true;
      return;
    }
    if (await marketOrder('close', symbol, signalId, target.side, target.qty, reason)) closeOk.add(symbol);
  }

  // ---- Lệnh dừng ----
  type StopAction = Extract<Action, { type: 'place_stop' }>;
  async function sendStop(a: StopAction, attempt: number): Promise<{ r: OrderResult; clientId: string }> {
    const input: StopLossInput = attempt === a.input.id.attempt ? a.input : { ...a.input, id: { ...a.input.id, attempt } };
    const clientId = makeClientId(input.id);
    sentAttempt.set(a.clientId, attempt);
    const r = await send(
      { op: 'place', symbol: a.symbol, signalId: a.signalId, role: a.role, clientId, attempt, qty: a.qty, triggerPrice: a.input.triggerPrice },
      a.qty === null ? () => ctx.orders.placeStopLoss(input) : () => ctx.orders.placeReduceStop({ ...input, qty: a.qty! }),
    );
    return { r, clientId };
  }
  // Nhận một lần thử đã nằm trên sàn làm lệnh dừng hiện tại của chân
  const adopt = (a: StopAction, clientId: string, attempt: number, reason: string) => {
    if (a.signalId !== null) ctx.journal.append({ type: 'leg_adopt', signalId: a.signalId, role: a.role, clientId, attempt, status: 'open', reason });
    placed.add(a.clientId);
    placed.add(clientId);
  };

  async function placeStop(a: StopAction): Promise<void> {
    const sym = a.symbol;
    let { r, clientId: lastId } = await sendStop(a, a.input.id.attempt);
    if (r.kind === 'ok') { placed.add(a.clientId); return; }
    let unresolved = false;
    if (r.kind === 'unknown_status') {
      // 503/-1007: sàn có thể VẪN tạo lệnh sau phản hồi → chờ một nhịp rồi mới tra mã gốc
      await wait();
      const pr = await algoPresence(sym, a.clientId);
      if (pr === 'present') {
        legUpdate(a.signalId, a.role, a.clientId, 'open', 'Tra lại: lệnh dừng đã nằm trên sàn');
        placed.add(a.clientId);
        return;
      }
      if (pr === 'triggered') {
        legUpdate(a.signalId, a.role, a.clientId, 'filled', 'Tra lại: lệnh dừng đã kích hoạt');
        say('urgent', sym, `KHẨN ${sym}: lệnh dừng ${a.role} ${a.clientId} đã kích hoạt — đối chiếu lại`);
        safe.add(a.clientId);
        freeze(sym);
        rep.reconcileAgain = true;
        return;
      }
      if (pr === 'absent') {
        legUpdate(a.signalId, a.role, a.clientId, 'gone', 'Tra lại: lệnh dừng KHÔNG có trên sàn — đặt lại ngay');
        ({ r, clientId: lastId } = await sendStop(a, a.input.id.attempt + 1));
        if (r.kind === 'ok') {
          placed.add(a.clientId); // bí danh: lệnh hủy dừng cũ chờ mã gốc
          placed.add(lastId);
          say('warn', sym, `${sym}: lệnh dừng ${a.role} không rõ, tra lại không thấy — đã đặt lại ${lastId}`);
          return;
        }
        if (r.kind === 'unknown_status') {
          await wait();
          const pr2 = await algoPresence(sym, lastId);
          if (pr2 === 'present') {
            legUpdate(a.signalId, a.role, lastId, 'open', 'Tra lại: lệnh dừng đặt lại đã nằm trên sàn');
            placed.add(a.clientId);
            placed.add(lastId);
            return;
          }
          unresolved = pr2 !== 'absent';
        }
        // Đặt lại hỏng: lệnh GỐC có thể vừa lên sàn (sàn từ chối lần thử mới vì đã có dừng) → tra mã gốc lần nữa trước khi đóng
        const pr3 = await algoPresence(sym, a.clientId);
        if (pr3 === 'present') {
          adopt(a, a.clientId, a.input.id.attempt, 'Lệnh dừng gốc (báo không rõ) đã nằm trên sàn — nhận làm lệnh dừng');
          say('warn', sym, `${sym}: lệnh dừng gốc ${a.clientId} hóa ra đã lên sàn — giữ làm lệnh dừng, không đóng`);
          return;
        }
        if (pr3 === 'triggered') {
          safe.add(a.clientId);
          freeze(sym);
          rep.reconcileAgain = true;
          say('urgent', sym, `KHẨN ${sym}: lệnh dừng gốc ${a.clientId} đã kích hoạt — đối chiếu lại`);
          return;
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
    if (r.kind === 'ok') return;
    rep.reconcileAgain = true; // đã khớp/hủy từ trước hoặc không rõ → lượt sau đối chiếu
    if (a.type !== 'cancel_algo' || a.replacedBy === null) return;
    // cancel_then_place: hủy dừng cũ CHƯA xác nhận → tra dừng cũ trước khi đặt mới (dừng cũ còn sống thì lệnh mới sẽ bị từ chối
    // kiểu -4130 → đóng oan một vị thế vẫn có dừng)
    const paired = actions.find((x): x is StopAction => x.type === 'place_stop' && x.clientId === a.replacedBy);
    if (r.kind === 'unknown_status') await wait();
    const pr = await algoPresence(a.symbol, a.clientId);
    if (pr === 'absent') return; // dừng cũ đã vắng → đặt mới bình thường
    skipPlace.add(a.replacedBy);
    if (pr === 'present') {
      safe.add(a.replacedBy);
      if (paired?.signalId != null) ctx.journal.append({ type: 'stop_replace_rejected', signalId: paired.signalId, role: paired.role, clientId: a.replacedBy, code: r.code, msg: `Hủy dừng cũ ${a.clientId} không thành (${r.kind}) — dừng cũ vẫn trên sàn, giữ nguyên` });
      say('warn', a.symbol, `${a.symbol}: hủy lệnh dừng cũ ${a.clientId} không thành (${r.kind}) và nó vẫn còn trên sàn — GIỮ dừng cũ, không đặt dừng mới lượt này`);
      return;
    }
    if (pr === 'triggered') {
      safe.add(a.replacedBy);
      freeze(a.symbol);
      say('urgent', a.symbol, `KHẨN ${a.symbol}: lệnh dừng cũ ${a.clientId} đã kích hoạt — đối chiếu lại`);
      return;
    }
    say('urgent', a.symbol, `KHẨN ${a.symbol}: hủy lệnh dừng cũ ${a.clientId} không rõ kết quả và tra lại không kết luận được — chưa đặt dừng mới (tránh đóng oan); đối chiếu lại ngay`);
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

  // Lệnh dừng mà vị thế KHÔNG có dừng nào khác (onReject market_close) nhưng chưa lên sàn, mã chưa được đóng → vị thế trần
  const nakedStops = (): StopAction[] => {
    const seen = new Set<string>();
    const out: StopAction[] = [];
    for (const a of actions) {
      if (a.type !== 'place_stop' || a.onReject !== 'market_close' || placed.has(a.clientId) || safe.has(a.clientId) || closeOk.has(a.symbol) || seen.has(a.symbol)) continue;
      seen.add(a.symbol);
      out.push(a);
    }
    return out;
  };

  // Lệch giờ (clock) → đồng bộ giờ rồi cứu lệnh dừng còn thiếu ĐÚNG MỘT lần: lần thử đã gửi → tra (có → nhận; vắng → mã MỚI)
  async function recoverAfterClock(): Promise<void> {
    const naked = nakedStops();
    if (naked.length === 0) return;
    if (ctx.resyncClock === undefined) {
      say('urgent', null, 'KHẨN: lệch giờ nhưng executor không có hàm đồng bộ giờ — không cứu được lệnh dừng trong lượt này');
      return;
    }
    try {
      await ctx.resyncClock();
    } catch (e) {
      say('urgent', null, `KHẨN: đồng bộ giờ lỗi (${e instanceof Error ? e.message : String(e)}) — không cứu được lệnh dừng trong lượt này`);
      return;
    }
    for (const a of naked) {
      try {
        const sentAt = sentAttempt.get(a.clientId);
        let attempt = a.input.id.attempt;
        if (sentAt !== undefined) {
          const lastId = makeClientId({ ...a.input.id, attempt: sentAt });
          const pr = await algoPresence(a.symbol, lastId);
          if (pr === 'present') { adopt(a, lastId, sentAt, 'Sau đồng bộ giờ: lệnh dừng đã nằm trên sàn'); continue; }
          if (pr === 'triggered') { safe.add(a.clientId); continue; }
          if (pr === 'unresolved') continue;
          attempt = sentAt + 1;
        }
        const { r, clientId } = await sendStop(a, attempt);
        if (r.kind === 'ok') {
          placed.add(a.clientId);
          say('warn', a.symbol, `${a.symbol}: đã đặt lại lệnh dừng ${clientId} sau khi đồng bộ giờ`);
        } else if (r.kind !== 'unknown_status') {
          await closeNow(a.symbol, a.signalId, a.onRejectCancelEntries, `đặt lệnh dừng sau đồng bộ giờ hỏng (${r.kind}${r.code !== null ? ` ${r.code}` : ''})`);
        }
      } catch (e) {
        if (!(e instanceof Halt)) throw e;
        say('urgent', a.symbol, `KHẨN ${a.symbol}: cứu lệnh dừng sau đồng bộ giờ lại bị ${e.kind} (${e.message})`);
        return;
      }
    }
  }

  // Mọi vị thế còn trần cuối lượt → báo KHẨN từng mã + ghi dấu "chưa bảo vệ" vào nhật ký (lượt sau xử lý trước)
  function markUnprotected(): void {
    for (const a of nakedStops()) {
      rep.unprotected.push(a.symbol);
      const why = rep.halted !== null ? `lượt bị dừng (${rep.halted.kind})` : 'chưa xác nhận/đặt được lệnh dừng';
      if (ctx.journal.state().unprotected?.[a.symbol] === undefined) ctx.journal.append({ type: 'unprotected', symbol: a.symbol, signalId: a.signalId, reason: why });
      say('urgent', a.symbol, `KHẨN ${a.symbol}: VỊ THẾ KHÔNG CÓ LỆNH DỪNG trên sàn (${why}) — lượt sau xử lý mã này trước; ${rep.halted?.kind === 'banned' ? 'đang bị khóa, kiểm tra tay ngay' : 'theo dõi sát'}`);
    }
  }

  const creates = (a: Action) => a.type === 'place_stop' || a.type === 'place_tp1' || a.type === 'place_trailing' || a.type === 'reduce_only' || a.type === 'market_close';

  try {
    for (const a of actions) {
      if (a.type === 'place_stop' && skipPlace.has(a.clientId)) {
        skip(a, a.clientId, 'Hủy dừng cũ chưa xác nhận — không đặt dừng mới lượt này');
        continue;
      }
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
    // Bị cấm (ban/429) thì không gửi được gì. Lệch giờ: đồng bộ rồi cứu lệnh dừng còn thiếu một lần.
    if (e.kind === 'clock') await recoverAfterClock();
  }
  markUnprotected();
  return rep;
}
