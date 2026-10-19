// Lớp WebSocket Binance USDⓈ-M: market stream (kline đóng nến + mark price) và user data stream (listenKey).
// Nguồn trường/giới hạn: docs/reference/binance-usdm-api.md mục 6 (user data) và mục 7 (market streams).
// Không thư viện ngoài: dùng WebSocket có sẵn của Node 24 (tiêm được để test).
//
// Ping/pong [WSC]: server gửi ping frame mỗi 3 phút, phải trả pong trong 10 phút. API WebSocket chuẩn (WHATWG)
// không cho mã ứng dụng thấy/gửi ping-pong frame; WebSocket của Node tự trả pong kèm đúng payload (đã kiểm bằng
// server cục bộ, xem báo cáo B8a). Thêm một lớp bảo vệ: kết nối market im lặng quá idleTimeoutMs thì tự đóng và nối lại.
import type { Candle } from '../core/types.ts';
import type { FetchInit, FetchResponse, Priority } from './client.ts';
import { redact } from './redact.ts';

// ---- Kiểu tiêm được ----------------------------------------------------------------------------
export type WsLike = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
};
export type WsCtor = new (url: string) => WsLike;
export type Clock = { now(): number; setTimeout(fn: () => void, ms: number): unknown; clearTimeout(h: unknown): void };

const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};
const defaultWs = (): WsCtor => (globalThis as unknown as { WebSocket: WsCtor }).WebSocket;

const H = 3_600_000;
export const MAX_STREAMS_PER_CONN = 1024; // [WSC]
export const MAX_INCOMING_MSGS_PER_SEC = 10; // [WSC] tin client gửi lên mỗi kết nối
// [WSM]/[CD] khoảng nến hợp lệ
const INTERVALS = new Set(['1s', '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M']);

// Lùi dần có jitter: trần × (0,5..1)
function backoffDelay(attempt: number, baseMs: number, capMs: number, random: () => number): number {
  const d = Math.min(capMs, baseMs * 2 ** Math.min(attempt, 30));
  return Math.round(d * (0.5 + 0.5 * random()));
}

// Che listenKey trong URL dù chưa biết giá trị (phòng xa), cộng với các bí mật đã biết
function scrub(text: string, secrets: readonly string[]): string {
  return redact(text, secrets)
    .replace(/(\/private\/ws\/)[^\s"'?&/]+/g, '$1[ĐÃ ẨN]')
    .replace(/(listenKey["']?\s*[:=]\s*["']?)[^\s"',&}]+/gi, '$1[ĐÃ ẨN]');
}
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---- Đọc trường an toàn (không đoán: thiếu/sai kiểu → ném lỗi nêu tên trường) ------------------
type Obj = Record<string, unknown>;
function obj(v: unknown, what: string): Obj {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${what}: không phải object`);
  return v as Obj;
}
function num(o: Obj, k: string, what: string): number {
  const v = o[k];
  const ok = typeof v === 'number' || (typeof v === 'string' && v.trim() !== '');
  const n = ok ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw new Error(`${what}.${k}: số không hợp lệ (${JSON.stringify(v) ?? 'undefined'})`);
  return n;
}
function numOpt(o: Obj, k: string, what: string): number | null {
  return o[k] === undefined || o[k] === null || o[k] === '' ? null : num(o, k, what);
}
function str(o: Obj, k: string, what: string): string {
  const v = o[k];
  if (typeof v !== 'string' || v === '') throw new Error(`${what}.${k}: thiếu chuỗi`);
  return v;
}
function strOpt(o: Obj, k: string, what: string): string | null {
  return o[k] === undefined || o[k] === null ? null : str(o, k, what);
}
function boolOpt(o: Obj, k: string, what: string): boolean | null {
  const v = o[k];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'boolean') throw new Error(`${what}.${k}: không phải boolean`);
  return v;
}

// =================================================================================================
// Market stream
// =================================================================================================
export type MarketEvent =
  | { type: 'kline'; symbol: string; interval: string; candle: Candle }
  | { type: 'backfill_required'; symbol: string; interval: string; fromOpenTime: number };

export type MarkPrice = { price: number; eventTime: number; receivedAt: number };

// Tên stream [WSM]: symbol viết thường; kline `<symbol>@kline_<interval>`; mark `<symbol>@markPrice@1s`
export function marketStreamNames(symbols: readonly string[], intervals: readonly string[]): string[] {
  const out: string[] = [];
  for (const s of symbols) {
    const low = s.toLowerCase();
    for (const i of intervals) out.push(`${low}@kline_${i}`);
    out.push(`${low}@markPrice@1s`);
  }
  return out;
}

type MConn = {
  ws: WsLike | null;
  queue: string[];
  sentAt: number[];
  pendingAcks: Set<number>;
  subscribed: boolean;
  intentional: boolean;
  lastMsgAt: number;
  timers: Set<unknown>;
};
type Shard = { idx: number; streams: string[]; current: MConn | null; next: MConn | null; attempt: number; reconnectTimer: unknown | null };

export function createMarketStream(opts: {
  symbols: readonly string[];
  intervals: readonly string[];
  onEvent: (e: MarketEvent) => void;
  log?: (msg: string) => void;
  WebSocket?: WsCtor;
  clock?: Clock;
  random?: () => number;
  base?: string; // mặc định wss://fstream.binance.com (production) [WSC]
  staleAfterMs?: number; // không có cập nhật quá ngưỡng → stale (mặc định 10 s)
  msgsPerSec?: number; // tin gửi lên mỗi kết nối mỗi giây (mặc định 5, tối đa 10)
  paramsPerMessage?: number; // số stream mỗi tin SUBSCRIBE [Đề xuất]: tài liệu không nêu trần, mặc định 50
  maxStreamsPerConn?: number;
  rotateAfterMs?: number; // xoay vòng trước mốc 24 h (mặc định 23 h)
  idleTimeoutMs?: number; // im lặng quá lâu → nối lại (mặc định 60 s)
  backoffBaseMs?: number;
  backoffCapMs?: number;
}) {
  const WS = opts.WebSocket ?? defaultWs();
  const clock = opts.clock ?? realClock;
  const random = opts.random ?? Math.random;
  const url = `${opts.base ?? 'wss://fstream.binance.com'}/market/stream`;
  const staleAfter = opts.staleAfterMs ?? 10_000;
  const perSec = opts.msgsPerSec ?? 5;
  const perMsg = opts.paramsPerMessage ?? 50;
  const perConn = opts.maxStreamsPerConn ?? MAX_STREAMS_PER_CONN;
  const rotateAfter = opts.rotateAfterMs ?? 23 * H;
  const idleTimeout = opts.idleTimeoutMs ?? 60_000;
  const bBase = opts.backoffBaseMs ?? 1000;
  const bCap = opts.backoffCapMs ?? 60_000;
  if (perSec < 1 || perSec > MAX_INCOMING_MSGS_PER_SEC) throw new Error(`msgsPerSec phải trong 1..${MAX_INCOMING_MSGS_PER_SEC}`);
  if (perConn < 1 || perConn > MAX_STREAMS_PER_CONN) throw new Error(`maxStreamsPerConn phải trong 1..${MAX_STREAMS_PER_CONN}`);
  if (rotateAfter >= 24 * H) throw new Error('rotateAfterMs phải < 24 giờ (sàn ngắt kết nối ở mốc 24 giờ)');
  for (const i of opts.intervals) if (!INTERVALS.has(i)) throw new Error(`Khoảng nến không hợp lệ: ${i}`);
  const log = (m: string) => opts.log?.(scrub(m, []));

  const streams = marketStreamNames(opts.symbols, opts.intervals);
  const shards: Shard[] = [];
  for (let i = 0; i < streams.length; i += perConn) {
    shards.push({ idx: shards.length, streams: streams.slice(i, i + perConn), current: null, next: null, attempt: 0, reconnectTimer: null });
  }

  const lastSeen = new Map<string, number>(); // symbol → giờ máy nhận tin gần nhất
  const marks = new Map<string, MarkPrice>();
  const lastClosed = new Map<string, number>(); // `${symbol}|${interval}` → closeTime (T) nến đóng gần nhất
  let stopped = true;
  let nextId = 1;

  function later(c: MConn | null, fn: () => void, ms: number): unknown {
    const h = clock.setTimeout(() => { c?.timers.delete(h); fn(); }, ms);
    c?.timers.add(h);
    return h;
  }
  function clearConn(c: MConn) { for (const h of c.timers) clock.clearTimeout(h); c.timers.clear(); }
  function closeIntentional(c: MConn) {
    c.intentional = true;
    clearConn(c);
    c.ws?.close();
  }

  function drain(shard: Shard, c: MConn) {
    if (c.intentional || !c.ws) return;
    const now = clock.now();
    c.sentAt = c.sentAt.filter((t) => t > now - 1000);
    while (c.queue.length > 0 && c.sentAt.length < perSec) {
      const m = c.queue.shift()!;
      try {
        c.ws.send(m);
      } catch (e) {
        log(`Market #${shard.idx}: lỗi gửi SUBSCRIBE (${errText(e)}) — đóng để nối lại`);
        c.ws.close();
        return;
      }
      c.sentAt.push(now);
    }
    if (c.queue.length > 0) later(c, () => drain(shard, c), c.sentAt[0]! + 1000 - now);
  }

  function connect(shard: Shard, role: 'main' | 'rotating') {
    const c: MConn = { ws: null, queue: [], sentAt: [], pendingAcks: new Set(), subscribed: false, intentional: false, lastMsgAt: clock.now(), timers: new Set() };
    if (role === 'rotating') shard.next = c; else shard.current = c;
    try {
      c.ws = new WS(url);
    } catch (e) {
      log(`Market #${shard.idx}: không mở được kết nối (${errText(e)})`);
      lost(shard, c);
      return;
    }
    const ws = c.ws;
    ws.onopen = () => {
      log(`Market #${shard.idx}: đã mở kết nối${role === 'rotating' ? ' (xoay vòng)' : ''}, đăng ký ${shard.streams.length} stream`);
      for (let i = 0; i < shard.streams.length; i += perMsg) {
        const id = nextId++;
        c.pendingAcks.add(id);
        c.queue.push(JSON.stringify({ method: 'SUBSCRIBE', params: shard.streams.slice(i, i + perMsg), id }));
      }
      drain(shard, c);
      later(c, () => rotate(shard, c), rotateAfter);
    };
    ws.onmessage = (ev) => {
      c.lastMsgAt = clock.now();
      onMessage(shard, c, ev.data);
    };
    ws.onerror = () => {
      log(`Market #${shard.idx}: lỗi WebSocket — đóng để nối lại`);
      ws.close();
    };
    ws.onclose = () => {
      clearConn(c);
      if (c.intentional || stopped) return;
      lost(shard, c);
    };
    const idleCheck = () => {
      if (clock.now() - c.lastMsgAt > idleTimeout) {
        log(`Market #${shard.idx}: không nhận tin quá ${idleTimeout} ms — đóng để nối lại`);
        ws.close();
        return;
      }
      later(c, idleCheck, Math.max(1, Math.floor(idleTimeout / 2)));
    };
    later(c, idleCheck, Math.max(1, Math.floor(idleTimeout / 2)));
  }

  function rotate(shard: Shard, c: MConn) {
    if (stopped || c !== shard.current || shard.next) return;
    log(`Market #${shard.idx}: xoay vòng kết nối trước mốc 24 giờ (mở mới, đăng ký xong mới đóng cũ)`);
    connect(shard, 'rotating');
  }

  function lost(shard: Shard, c: MConn) {
    c.intentional = true; // đã xử lý, không xử lý lần hai
    clearConn(c);
    if (stopped) return;
    if (shard.current === c) {
      shard.current = null;
      log(`Market #${shard.idx}: mất kết nối`);
      if (shard.next) { shard.current = shard.next; shard.next = null; return; } // kết nối xoay vòng thế chỗ
      scheduleReconnect(shard, 'main');
    } else if (shard.next === c) {
      shard.next = null;
      log(`Market #${shard.idx}: kết nối xoay vòng hỏng — thử lại`);
      scheduleReconnect(shard, shard.current ? 'rotating' : 'main');
    }
  }

  function scheduleReconnect(shard: Shard, role: 'main' | 'rotating') {
    if (shard.reconnectTimer !== null) return;
    const d = backoffDelay(shard.attempt++, bBase, bCap, random);
    log(`Market #${shard.idx}: nối lại sau ${d} ms (lần ${shard.attempt})`);
    shard.reconnectTimer = later(null, () => {
      shard.reconnectTimer = null;
      if (stopped) return;
      if (role === 'rotating' && !shard.current) role = 'main';
      if (role === 'main' && shard.current) return;
      connect(shard, role);
    }, d);
  }

  function subscribedDone(shard: Shard, c: MConn) {
    c.subscribed = true;
    shard.attempt = 0;
    if (shard.next === c) {
      const old = shard.current;
      shard.current = c;
      shard.next = null;
      if (old) closeIntentional(old);
      log(`Market #${shard.idx}: xoay vòng xong, đã đóng kết nối cũ`);
    }
  }

  function onMessage(shard: Shard, c: MConn, data: unknown) {
    let msg: Obj;
    try {
      if (typeof data !== 'string') throw new Error('khung không phải văn bản');
      msg = obj(JSON.parse(data), 'tin');
    } catch (e) {
      log(`Market #${shard.idx}: không đọc được tin (${errText(e)})`);
      return;
    }
    // Phản hồi SUBSCRIBE {"result":null,"id":n}; lỗi {"code":..,"msg":..} [WSL]
    if ('id' in msg && 'result' in msg) {
      c.pendingAcks.delete(msg.id as number);
      if (msg.result !== null) log(`Market #${shard.idx}: phản hồi SUBSCRIBE lạ: ${JSON.stringify(msg.result)}`);
      if (!c.subscribed && c.pendingAcks.size === 0 && c.queue.length === 0) subscribedDone(shard, c);
      return;
    }
    if ('code' in msg && !('stream' in msg)) {
      log(`Market #${shard.idx}: lỗi SUBSCRIBE từ sàn: code ${String(msg.code)} ${String(msg.msg)}`);
      return;
    }
    try {
      const d = obj(msg.data, 'data');
      if (d.e === 'kline') onKline(d);
      else if (d.e === 'markPriceUpdate') onMark(d);
      else log(`Market #${shard.idx}: bỏ qua sự kiện không dùng: ${String(d.e)}`);
    } catch (e) {
      log(`Market #${shard.idx}: tin hỏng, không đọc được (${errText(e)})`);
    }
  }

  // Payload kline [WSM]: k.t giờ mở, k.T giờ đóng, o/h/l/c, v base volume, q quote volume, Q taker buy quote volume, x đã đóng
  function onKline(d: Obj) {
    const k = obj(d.k, 'kline.k');
    const symbol = str(d, 's', 'kline');
    const interval = str(k, 'i', 'kline.k');
    const closed = k.x;
    if (typeof closed !== 'boolean') throw new Error('kline.k.x: không phải boolean');
    lastSeen.set(symbol, clock.now());
    if (!closed) return;
    const candle: Candle = {
      openTime: num(k, 't', 'kline.k'), closeTime: num(k, 'T', 'kline.k'),
      open: num(k, 'o', 'kline.k'), high: num(k, 'h', 'kline.k'), low: num(k, 'l', 'kline.k'), close: num(k, 'c', 'kline.k'),
      volume: num(k, 'v', 'kline.k'), quoteVolume: num(k, 'q', 'kline.k'), takerBuyQuote: num(k, 'Q', 'kline.k'),
    };
    const key = `${symbol}|${interval}`;
    const prevT = lastClosed.get(key);
    if (prevT !== undefined) {
      if (candle.openTime <= prevT) return; // trùng (chồng lấn lúc xoay vòng / nối lại)
      // Liền mạch khi giờ mở = giờ đóng trước + 1 ms (ví dụ [WSM]: t 1638747660000, T 1638747719999)
      if (candle.openTime !== prevT + 1) opts.onEvent({ type: 'backfill_required', symbol, interval, fromOpenTime: prevT + 1 });
    }
    lastClosed.set(key, candle.closeTime);
    opts.onEvent({ type: 'kline', symbol, interval, candle });
  }

  // Payload mark price [WSM]: e markPriceUpdate, E giờ sự kiện, s, p giá mark
  function onMark(d: Obj) {
    const symbol = str(d, 's', 'markPrice');
    const eventTime = num(d, 'E', 'markPrice');
    const price = num(d, 'p', 'markPrice');
    const now = clock.now();
    lastSeen.set(symbol, now);
    const cur = marks.get(symbol);
    if (cur && cur.eventTime > eventTime) return;
    marks.set(symbol, { price, eventTime, receivedAt: now });
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      for (const s of shards) connect(s, 'main');
    },
    stop() {
      stopped = true;
      for (const s of shards) {
        if (s.reconnectTimer !== null) { clock.clearTimeout(s.reconnectTimer); s.reconnectTimer = null; }
        for (const c of [s.current, s.next]) if (c) closeIntentional(c);
        s.current = null;
        s.next = null;
      }
    },
    latestMark: (symbol: string): MarkPrice | null => marks.get(symbol) ?? null,
    // Bot KHÔNG được mở lệnh khi isStale(symbol) = true
    isStale(symbol: string): boolean {
      const t = lastSeen.get(symbol);
      return t === undefined || clock.now() - t > staleAfter;
    },
    // Ghi mốc nến đóng cuối đã nạp qua REST để phát hiện lỗ ngay ở nến WS đầu tiên
    seedLastClosed(symbol: string, interval: string, closeTime: number) { lastClosed.set(`${symbol}|${interval}`, closeTime); },
    connectionCount: () => shards.length,
  };
}

// =================================================================================================
// listenKey REST (USER_STREAM: chỉ header X-MBX-APIKEY, không ký) [R-UDS]
// =================================================================================================
export type KeepaliveResult = { status: 'ok' } | { status: 'invalid' } | { status: 'error'; msg: string };
export type ListenKeyApi = { create(): Promise<string>; keepalive(): Promise<KeepaliveResult>; close(): Promise<void> };
type SendLike = { send(path: string, init?: FetchInit, priority?: Priority): Promise<FetchResponse> };

const LK_PATH = '/fapi/v1/listenKey';
const INVALID_LISTEN_KEY = -1125; // [ERR]

export function createListenKeyApi(deps: { client: SendLike; apiKey: string }): ListenKeyApi {
  const init = (method: string): FetchInit => ({ method, headers: { 'X-MBX-APIKEY': deps.apiKey } });
  const clean = (m: string) => scrub(m, [deps.apiKey]);
  async function call(method: string): Promise<{ status: number; body: Obj | null }> {
    const res = await deps.client.send(LK_PATH, init(method), 'bot');
    let body: Obj | null = null;
    try {
      const j: unknown = await res.json();
      body = j !== null && typeof j === 'object' && !Array.isArray(j) ? (j as Obj) : null;
    } catch (e) {
      // DELETE có thể không trả dữ liệu [R-UDS]; các lệnh khác kiểm tra body bên dưới
      if (method !== 'DELETE') throw new Error(clean(`listenKey ${method}: phản hồi không phải JSON (HTTP ${res.status}): ${errText(e)}`));
    }
    return { status: res.status, body };
  }
  return {
    // Phản hồi: {"listenKey": "..."} [R-UDS]
    async create() {
      const r = await call('POST');
      const key = r.body?.listenKey;
      if (r.status !== 200 || typeof key !== 'string' || key === '') {
        throw new Error(clean(`Tạo listenKey thất bại: HTTP ${r.status} code ${String(r.body?.code ?? '-')} ${String(r.body?.msg ?? '')}`));
      }
      return key;
    },
    async keepalive() {
      try {
        const r = await call('PUT');
        if (r.status === 200) return { status: 'ok' };
        if (r.body?.code === INVALID_LISTEN_KEY) return { status: 'invalid' };
        return { status: 'error', msg: clean(`HTTP ${r.status} code ${String(r.body?.code ?? '-')} ${String(r.body?.msg ?? '')}`) };
      } catch (e) {
        return { status: 'error', msg: clean(errText(e)) };
      }
    },
    async close() {
      const r = await call('DELETE');
      if (r.status !== 200) throw new Error(clean(`Đóng listenKey thất bại: HTTP ${r.status}`));
    },
  };
}

// =================================================================================================
// User data stream
// =================================================================================================
export type OrderUpdate = {
  symbol: string; clientOrderId: string; side: string; orderType: string; origType: string | null; executionType: string; status: string;
  orderId: number; origQty: number | null; price: number | null; avgPrice: number | null; stopPrice: number | null;
  lastFilledQty: number | null; cumFilledQty: number | null; lastFilledPrice: number | null;
  commissionAsset: string | null; commission: number | null; tradeId: number | null; realizedProfit: number | null;
  reduceOnly: boolean | null; closePosition: boolean | null; positionSide: string | null; workingType: string | null; tradeTime: number | null;
};
export type AccountUpdate = {
  reason: string;
  balances: Array<{ asset: string; walletBalance: number; crossWalletBalance: number | null; balanceChange: number | null }>;
  positions: Array<{
    symbol: string; positionAmt: number; entryPrice: number | null; breakevenPrice: number | null; accumulatedRealized: number | null;
    unrealizedPnl: number | null; marginType: string | null; isolatedWallet: number | null; positionSide: string | null;
  }>;
};
export type AlgoUpdate = {
  clientAlgoId: string; algoId: number; algoType: string | null; orderType: string | null; symbol: string; side: string | null;
  positionSide: string | null; qty: number | null; status: string; actualOrderId: number | null; avgPrice: number | null; filledQty: number | null;
  triggerPrice: number | null; price: number | null; workingType: string | null; closePosition: boolean | null; reduceOnly: boolean | null;
  triggerTime: number | null; rejectReason: string | null; activated: boolean | null;
};
export type ResyncReason = 'start' | 'reconnect' | 'rotate' | 'listenkey_expired' | 'listenkey_invalid' | 'parse_error';
export type UserEvent =
  | { type: 'order_update'; eventTime: number; transactionTime: number; order: OrderUpdate }
  | ({ type: 'account_update'; eventTime: number; transactionTime: number } & AccountUpdate)
  | { type: 'algo_update'; eventTime: number; transactionTime: number; algo: AlgoUpdate }
  | { type: 'resync_required'; reason: ResyncReason }
  | { type: 'other'; eventType: string };

// ORDER_TRADE_UPDATE [UDS] (mục 6.3)
function parseOrder(o: Obj): OrderUpdate {
  const w = 'ORDER_TRADE_UPDATE.o';
  return {
    symbol: str(o, 's', w), clientOrderId: str(o, 'c', w), side: str(o, 'S', w), orderType: str(o, 'o', w), origType: strOpt(o, 'ot', w),
    executionType: str(o, 'x', w), status: str(o, 'X', w), orderId: num(o, 'i', w),
    origQty: numOpt(o, 'q', w), price: numOpt(o, 'p', w), avgPrice: numOpt(o, 'ap', w), stopPrice: numOpt(o, 'sp', w),
    lastFilledQty: numOpt(o, 'l', w), cumFilledQty: numOpt(o, 'z', w), lastFilledPrice: numOpt(o, 'L', w),
    commissionAsset: strOpt(o, 'N', w), commission: numOpt(o, 'n', w), tradeId: numOpt(o, 't', w), realizedProfit: numOpt(o, 'rp', w),
    reduceOnly: boolOpt(o, 'R', w), closePosition: boolOpt(o, 'cp', w), positionSide: strOpt(o, 'ps', w), workingType: strOpt(o, 'wt', w),
    tradeTime: numOpt(o, 'T', w),
  };
}
// ACCOUNT_UPDATE [UDS]: a.m lý do; a.B[] (a, wb, cw, bc); a.P[] (s, pa, ep, bep, cr, up, mt, iw, ps)
function parseAccount(a: Obj): AccountUpdate {
  const w = 'ACCOUNT_UPDATE.a';
  const B = Array.isArray(a.B) ? a.B : [];
  const P = Array.isArray(a.P) ? a.P : [];
  return {
    reason: str(a, 'm', w),
    balances: B.map((x) => {
      const b = obj(x, `${w}.B[]`);
      return { asset: str(b, 'a', `${w}.B[]`), walletBalance: num(b, 'wb', `${w}.B[]`), crossWalletBalance: numOpt(b, 'cw', `${w}.B[]`), balanceChange: numOpt(b, 'bc', `${w}.B[]`) };
    }),
    positions: P.map((x) => {
      const p = obj(x, `${w}.P[]`);
      const q = `${w}.P[]`;
      return {
        symbol: str(p, 's', q), positionAmt: num(p, 'pa', q), entryPrice: numOpt(p, 'ep', q), breakevenPrice: numOpt(p, 'bep', q),
        accumulatedRealized: numOpt(p, 'cr', q), unrealizedPnl: numOpt(p, 'up', q), marginType: strOpt(p, 'mt', q),
        isolatedWallet: numOpt(p, 'iw', q), positionSide: strOpt(p, 'ps', q),
      };
    }),
  };
}
// ALGO_UPDATE [UDS]: rm = lý do thất bại (thay CONDITIONAL_ORDER_TRIGGER_REJECT từ 2025-12-15 [CL])
function parseAlgo(o: Obj): AlgoUpdate {
  const w = 'ALGO_UPDATE.o';
  return {
    clientAlgoId: str(o, 'caid', w), algoId: num(o, 'aid', w), algoType: strOpt(o, 'at', w), orderType: strOpt(o, 'o', w), symbol: str(o, 's', w),
    side: strOpt(o, 'S', w), positionSide: strOpt(o, 'ps', w), qty: numOpt(o, 'q', w), status: str(o, 'X', w), actualOrderId: numOpt(o, 'ai', w),
    avgPrice: numOpt(o, 'ap', w), filledQty: numOpt(o, 'aq', w), triggerPrice: numOpt(o, 'tp', w), price: numOpt(o, 'p', w),
    workingType: strOpt(o, 'wt', w), closePosition: boolOpt(o, 'cp', w), reduceOnly: boolOpt(o, 'R', w), triggerTime: numOpt(o, 'tt', w),
    rejectReason: typeof o.rm === 'string' && o.rm !== '' ? o.rm : null, activated: boolOpt(o, 'ia', w),
  };
}

type UConn = { ws: WsLike | null; intentional: boolean; reason: ResyncReason };

export function createUserStream(opts: {
  listenKeys: ListenKeyApi;
  onEvent: (e: UserEvent) => void;
  log?: (msg: string) => void;
  secrets?: readonly string[]; // API key/secret… luôn được che trong log
  WebSocket?: WsCtor;
  clock?: Clock;
  random?: () => number;
  base?: string;
  keepaliveMs?: number; // mặc định 30 phút [Đề xuất trong tài liệu tra cứu 6.1]
  keepaliveRetryMs?: number; // gia hạn lỗi tạm → thử lại sau (mặc định 60 s)
  rotateAfterMs?: number;
  backoffBaseMs?: number;
  backoffCapMs?: number;
}) {
  const WS = opts.WebSocket ?? defaultWs();
  const clock = opts.clock ?? realClock;
  const random = opts.random ?? Math.random;
  const base = opts.base ?? 'wss://fstream.binance.com';
  const keepaliveMs = opts.keepaliveMs ?? 30 * 60_000;
  const keepaliveRetryMs = opts.keepaliveRetryMs ?? 60_000;
  const rotateAfter = opts.rotateAfterMs ?? 23 * H;
  const bBase = opts.backoffBaseMs ?? 1000;
  const bCap = opts.backoffCapMs ?? 60_000;
  if (rotateAfter >= 24 * H) throw new Error('rotateAfterMs phải < 24 giờ (sàn ngắt kết nối ở mốc 24 giờ)');

  const keys: string[] = []; // mọi listenKey đã thấy → luôn che trong log
  const log = (m: string) => opts.log?.(scrub(m, [...(opts.secrets ?? []), ...keys]));
  let current: UConn | null = null;
  let pending: UConn | null = null;
  let stopped = true;
  let attempt = 0;
  let establishing = false;
  let reconnectTimer: unknown | null = null;
  let keepaliveTimer: unknown | null = null;
  let rotateTimer: unknown | null = null;

  const clear = (h: unknown | null) => { if (h !== null) clock.clearTimeout(h); };

  async function establish(reason: ResyncReason): Promise<void> {
    if (stopped || establishing) return;
    establishing = true;
    try {
      let key: string;
      try {
        key = await opts.listenKeys.create();
      } catch (e) {
        log(`User stream: tạo listenKey lỗi (${errText(e)})`);
        scheduleReconnect(reason);
        return;
      }
      if (stopped) return;
      if (!keys.includes(key)) keys.push(key);
      connect(key, reason);
    } finally {
      establishing = false;
    }
  }

  function connect(key: string, reason: ResyncReason) {
    const c: UConn = { ws: null, intentional: false, reason };
    if (pending) { pending.intentional = true; pending.ws?.close(); }
    pending = c;
    // Đường dẫn theo trang UDS: wss://fstream.binance.com/private/ws/<listenKey> [UDS]
    try {
      c.ws = new WS(`${base}/private/ws/${key}`);
    } catch (e) {
      log(`User stream: không mở được kết nối (${errText(e)})`);
      pending = null;
      scheduleReconnect(reason);
      return;
    }
    const ws = c.ws;
    ws.onopen = () => {
      if (c !== pending || stopped) return;
      const old = current;
      current = c;
      pending = null;
      if (old) { old.intentional = true; old.ws?.close(); }
      attempt = 0;
      clear(reconnectTimer); reconnectTimer = null;
      clear(rotateTimer);
      rotateTimer = clock.setTimeout(() => { rotateTimer = null; log('User stream: xoay vòng kết nối trước mốc 24 giờ'); void establish('rotate'); }, rotateAfter);
      scheduleKeepalive(keepaliveMs);
      log(`User stream: đã kết nối (${reason}) — yêu cầu đối chiếu lại qua REST`);
      opts.onEvent({ type: 'resync_required', reason });
    };
    ws.onmessage = (ev) => { if (c === current) onMessage(ev.data); };
    ws.onerror = () => { log('User stream: lỗi WebSocket — đóng để nối lại'); ws.close(); };
    ws.onclose = () => {
      if (c.intentional || stopped) return;
      c.intentional = true;
      if (c === current) {
        current = null;
        log('User stream: mất kết nối');
        if (!pending) scheduleReconnect('reconnect');
      } else if (c === pending) {
        pending = null;
        log('User stream: kết nối mới hỏng trước khi mở');
        scheduleReconnect(reason);
      }
    };
  }

  function scheduleReconnect(reason: ResyncReason) {
    if (stopped || reconnectTimer !== null) return;
    const d = backoffDelay(attempt++, bBase, bCap, random);
    log(`User stream: nối lại sau ${d} ms (lần ${attempt})`);
    reconnectTimer = clock.setTimeout(() => { reconnectTimer = null; void establish(reason === 'start' ? 'reconnect' : reason); }, d);
  }

  function scheduleKeepalive(ms: number) {
    clear(keepaliveTimer);
    keepaliveTimer = clock.setTimeout(() => { keepaliveTimer = null; void keepalive(); }, ms);
  }

  async function keepalive() {
    if (stopped) return;
    const r = await opts.listenKeys.keepalive();
    if (stopped) return;
    if (r.status === 'ok') { scheduleKeepalive(keepaliveMs); return; }
    if (r.status === 'invalid') {
      log('User stream: gia hạn listenKey trả -1125 (key không tồn tại) — tạo key mới và nối lại');
      await establish('listenkey_invalid');
      return;
    }
    log(`User stream: gia hạn listenKey lỗi (${r.msg}) — thử lại sau ${keepaliveRetryMs} ms`);
    scheduleKeepalive(keepaliveRetryMs);
  }

  function onMessage(data: unknown) {
    let ev: Obj;
    try {
      if (typeof data !== 'string') throw new Error('khung không phải văn bản');
      ev = obj(JSON.parse(data), 'sự kiện');
    } catch (e) {
      log(`User stream: không đọc được sự kiện (${errText(e)}) — yêu cầu đối chiếu lại`);
      opts.onEvent({ type: 'resync_required', reason: 'parse_error' });
      return;
    }
    const e = ev.e;
    try {
      if (e === 'listenKeyExpired') {
        // [UDS] sau sự kiện này không còn sự kiện nào cho tới khi dùng listenKey mới
        log(`User stream: listenKeyExpired (key ${String(ev.listenKey)}) — tạo key mới và nối lại`);
        void establish('listenkey_expired');
        return;
      }
      if (e === 'ORDER_TRADE_UPDATE') {
        opts.onEvent({ type: 'order_update', eventTime: num(ev, 'E', String(e)), transactionTime: num(ev, 'T', String(e)), order: parseOrder(obj(ev.o, 'ORDER_TRADE_UPDATE.o')) });
      } else if (e === 'ACCOUNT_UPDATE') {
        opts.onEvent({ type: 'account_update', eventTime: num(ev, 'E', String(e)), transactionTime: num(ev, 'T', String(e)), ...parseAccount(obj(ev.a, 'ACCOUNT_UPDATE.a')) });
      } else if (e === 'ALGO_UPDATE') {
        opts.onEvent({ type: 'algo_update', eventTime: num(ev, 'E', String(e)), transactionTime: num(ev, 'T', String(e)), algo: parseAlgo(obj(ev.o, 'ALGO_UPDATE.o')) });
      } else {
        opts.onEvent({ type: 'other', eventType: String(e) });
      }
    } catch (err) {
      log(`User stream: không đọc được sự kiện ${String(e)} (${errText(err)}) — yêu cầu đối chiếu lại`);
      opts.onEvent({ type: 'resync_required', reason: 'parse_error' });
    }
  }

  return {
    async start() {
      if (!stopped) return;
      stopped = false;
      await establish('start');
    },
    stop() {
      stopped = true;
      clear(reconnectTimer); clear(keepaliveTimer); clear(rotateTimer);
      reconnectTimer = keepaliveTimer = rotateTimer = null;
      for (const c of [current, pending]) if (c) { c.intentional = true; c.ws?.close(); }
      current = pending = null;
    },
  };
}
