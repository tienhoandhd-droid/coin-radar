import { redact } from '../binance/redact.ts';
import type { Side } from '../core/types.ts';
import { FUSE, resetProtection } from './protections.ts';
import type { Journal, JournalEventBody } from './journal.ts';
import type { AlertLevel } from './reconcile.ts';

// Telegram (B6): gửi cảnh báo + nhận lệnh điều khiển qua Bot API bằng fetch có sẵn của Node (không thêm thư viện).
// Tài liệu: https://core.telegram.org/bots/api (sendMessage, getUpdates, ResponseParameters.retry_after)
//           https://core.telegram.org/bots/faq (giới hạn tốc độ gửi)
//
// Nguyên tắc:
//  - Tin gửi đi là văn bản THUẦN (không parse_mode) nên không cần escape; mọi tin đi qua scrubText (che secret) trước khi gửi.
//  - Token nằm trong URL → mọi thông báo lỗi/log đều đi qua scrubText, không bao giờ chứa token.
//  - Gửi bất đồng bộ qua hàng đợi có trần; send() trả về ngay, không bao giờ làm đứng vòng giao dịch.
//  - Lệnh điều khiển CHỈ nhận từ đúng chat ID cấu hình; chat khác bị bỏ + ghi log (không kèm nội dung).

const API = 'https://api.telegram.org';
const MASK = '[ĐÃ ẨN]';
export const MAX_TEXT = 4096; // sendMessage: text 1-4096 ký tự
// FAQ: "tránh gửi quá 1 tin/giây trong một chat" (nhóm: 20 tin/phút; quảng bá: ~30 tin/giây). Ta chỉ nhắn 1 chat riêng.
export const MIN_SEND_INTERVAL_MS = 1100;
export const CONFIRM_WINDOW_MS = 120_000; // /tieptuc XACNHAN phải đến trong 2 phút sau /tieptuc
const POLL_TIMEOUT_S = 25;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 6; // tin thường
const MAX_ATTEMPTS_URGENT = 10; // tin khẩn kiên trì hơn
const BACKOFF_BASE_MS = 2000;
const BACKOFF_MAX_MS = 60_000;
export const USER_PAUSE = 'user_pause'; // tên 'cầu chì' người dùng trong nhật ký (/dung) — bền qua khởi động lại

// Che bí mật: redact của lớp Binance (secret truyền vào, signature=, X-MBX-APIKEY) + listenKey + dạng token bot.
export function scrubText(text: string, secrets: readonly string[] = []): string {
  let out = redact(text, secrets);
  out = out.replace(/(listenKey["']?\s*[:=]\s*["']?)[^\s"',&]+/gi, `$1${MASK}`);
  out = out.replace(/(?:bot)?\d{6,}:[A-Za-z0-9_-]{30,}/g, MASK);
  return out;
}

export type StatusSnapshot = {
  mode: string; // paper | demo | live
  equity: number | null;
  openTrades: Array<{ symbol: string; side: Side; entry: number; stop: number | null; pnl: number | null }>;
  lastError: string | null;
};

export type TelegramDeps = {
  token: string;
  chatId: string;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
  secrets?: readonly string[]; // secret khác cần che (API key/secret sàn, listenKey)
  maxQueue?: number;
  getStatus: () => StatusSnapshot;
  journal: Pick<Journal, 'state' | 'append'>;
  getDayLossPct: () => number; // % lỗ ngày hiện tại — làm mốc khi mở lại daily_loss
};

export type SendOpts = { urgent?: boolean };
export type Telegram = {
  send(text: string, opts?: SendOpts): void;
  notify(a: { level: AlertLevel; symbol?: string | null; text: string }): void; // khớp ExecutorCtx.notify
  sendAlert(a: { text: string; urgent: boolean }): void;
  pollOnce(): Promise<void>; // một lượt getUpdates (long-poll) + xử lý lệnh; ném lỗi (đã che token) nếu mạng/Telegram lỗi
  start(): void; // vòng long-poll nền, tự lùi khi lỗi
  stop(): void;
  drain(): Promise<void>; // chờ hàng đợi gửi xong (cho test / lúc tắt)
  isPaused(): boolean; // người dùng /dung — chặn lệnh MỚI
  stats(): { sent: number; failed: number; dropped: number; queued: number };
};

type Item = { text: string; urgent: boolean; retry: boolean; attempts: number; notBefore: number };

const num = (x: number | null | undefined, d = 4): string => (x === null || x === undefined || !Number.isFinite(x) ? '?' : String(Number(x.toFixed(d))));
const signed = (x: number | null): string => (x === null || !Number.isFinite(x) ? '?' : `${x >= 0 ? '+' : ''}${x.toFixed(2)}`);
const sideVn = (s: Side) => (s === 'long' ? 'MUA (long)' : 'BÁN (short)');
const FUSE_LABEL: Record<string, string> = { [FUSE.lossStreak]: 'chuỗi lệnh thua', [FUSE.dailyLoss]: 'lỗ trong ngày', [FUSE.drawdown]: 'sụt vốn từ đỉnh' };
const fuseVn = (n: string) => FUSE_LABEL[n] ?? n;

// ---------- Mẫu tin cảnh báo (văn bản thuần, tiếng Việt, ngắn) ----------
type A = { text: string; urgent: boolean; level: AlertLevel };
const mk = (level: AlertLevel, text: string): A => ({ level, urgent: level === 'urgent', text });
export const alerts = {
  entryPlaced: (a: { symbol: string; side: Side; entry: number; stop: number; tp1: number; qty: number; riskUsdt: number }) =>
    mk('info', `Đặt lệnh vào ${a.symbol} ${sideVn(a.side)}: giá ${num(a.entry)}, dừng lỗ ${num(a.stop)}, TP1 ${num(a.tp1)}, khối lượng ${num(a.qty)}, rủi ro ${num(a.riskUsdt, 2)} USDT.`),
  entryFilled: (a: { symbol: string; side: Side; price: number; qty: number }) =>
    mk('info', `Đã khớp vào ${a.symbol} ${sideVn(a.side)}: giá ${num(a.price)}, khối lượng ${num(a.qty)}.`),
  tp1Hit: (a: { symbol: string; side: Side; price: number; qty: number; newStop: number }) =>
    mk('info', `TP1 khớp ${a.symbol} ${sideVn(a.side)}: chốt ${num(a.qty)} tại ${num(a.price)}; dừng lỗ dời về ${num(a.newStop)}, phần còn lại chạy trailing.`),
  trailingClosed: (a: { symbol: string; side: Side; price: number; pnlUsdt: number }) =>
    mk('info', `Trailing đóng ${a.symbol} ${sideVn(a.side)} tại ${num(a.price)}: lãi/lỗ ${signed(a.pnlUsdt)} USDT.`),
  stopLossHit: (a: { symbol: string; side: Side; price: number; pnlUsdt: number }) =>
    mk('warn', `Chạm dừng lỗ ${a.symbol} ${sideVn(a.side)} tại ${num(a.price)}: lãi/lỗ ${signed(a.pnlUsdt)} USDT.`),
  emergencyClose: (a: { symbol: string; reason: string }) =>
    mk('urgent', `KHẨN: đã đóng khẩn ${a.symbol} bằng lệnh thị trường. Lý do: ${a.reason}.`),
  unprotected: (a: { symbol: string; reason: string }) =>
    mk('urgent', `KHẨN: ${a.symbol} đang có vị thế KHÔNG có lệnh dừng trên sàn. ${a.reason}. Kiểm tra ngay.`),
  fuseTripped: (a: { name: string; reason: string }) =>
    mk('urgent', `KHẨN cầu chì ${fuseVn(a.name)} nhảy: ${a.reason}. Ngừng mở lệnh mới tới khi bạn gõ /tieptuc. Lệnh đang mở vẫn giữ dừng trên sàn.`),
  fuseReset: (a: { name: string; by: string }) =>
    mk('info', `Đã mở lại cầu chì ${fuseVn(a.name)} (bởi ${a.by}). Bot được mở lệnh mới trở lại.`),
  drawdownWarning: (a: { drawdownPct: number; equity: number; peak: number }) =>
    mk('warn', `Cảnh báo: vốn sụt ${num(a.drawdownPct, 1)}% từ đỉnh (ngưỡng cảnh báo 30%): hiện ${num(a.equity, 2)} USDT, đỉnh ${num(a.peak, 2)} USDT. Bot VẪN chạy, chỉ cảnh báo.`),
  // Hệ BTC theo chế độ (btc-regime): quyết định ngày, vào lệnh (không TP1), đóng lệnh
  regimeDecision: (a: { day: string; close: number; sma: number; want: 'long' | 'flat'; action: string }) =>
    mk('info', `BTC theo chế độ — nến 1D ${a.day}: giá đóng ${num(a.close, 2)} ${a.want === 'long' ? '>' : '≤'} SMA50 ${num(a.sma, 2)} → ${a.want === 'long' ? 'giữ Long' : 'đứng ngoài'}; ${a.action}.`),
  regimeEntry: (a: { symbol: string; entry: number; stop: number; qty: number; notional: number; riskUsdt: number }) =>
    mk('info', `Đặt lệnh vào ${a.symbol} MUA (long) theo chế độ BTC: giá trần ${num(a.entry, 2)}, dừng lỗ ${num(a.stop, 2)}, khối lượng ${num(a.qty)} (${num(a.notional, 2)} USDT, đòn bẩy 1×), rủi ro ${num(a.riskUsdt, 2)} USDT. Không TP — thoát khi tín hiệu tắt hoặc chạm dừng lỗ.`),
  regimeClosed: (a: { symbol: string; price: number; pnlUsdt: number; why: string }) =>
    mk(a.pnlUsdt >= 0 ? 'info' : 'warn', `Đóng ${a.symbol} (chế độ BTC — ${a.why}) tại ${num(a.price, 2)}: lãi/lỗ ${signed(a.pnlUsdt)} USDT.`),
  dailySummary: (a: { day: string; trades: number; wins: number; pnlUsdt: number; equity: number; openCount: number }) =>
    mk('info', `Tóm tắt ngày ${a.day} (UTC): ${a.trades} lệnh đóng, ${a.wins} lãi; lãi/lỗ ${signed(a.pnlUsdt)} USDT; vốn ${num(a.equity, 2)} USDT; đang mở ${a.openCount} lệnh.`),
};

const HELP = [
  'Lệnh điều khiển (chỉ nhận từ chat của bạn):',
  '/trangthai : chế độ, vốn, lệnh đang mở, cầu chì, lỗi gần nhất',
  '/dung : ngừng mở lệnh MỚI (lệnh đang mở vẫn giữ dừng trên sàn)',
  '/tieptuc : bỏ tạm dừng và mở lại cầu chì; phải gõ tiếp /tieptuc XACNHAN trong 2 phút',
  '/trogiup : xem lại danh sách này',
].join('\n');

export function createTelegram(deps: TelegramDeps): Telegram {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxQueue = deps.maxQueue ?? 50;
  const secrets = [deps.token, ...(deps.secrets ?? [])];
  const scrub = (t: string) => scrubText(t, secrets);
  const logRaw = deps.log ?? ((m: string) => console.error(m));
  const log = (m: string) => logRaw(scrub(`[telegram] ${m}`));
  const chatId = String(deps.chatId);
  const startedAt = now();

  const queue: Item[] = [];
  let pumping = false;
  let lastSentAt = -Infinity;
  let offset: number | undefined;
  let blockedUntil = -Infinity; // 429: Telegram bắt chờ retry_after cho MỌI tin
  let wake: (() => void) | null = null; // đánh thức pump đang ngủ khi có tin khẩn
  const isPaused = () => deps.journal.state().protections[USER_PAUSE]?.tripped === true;
  let confirmAt: number | null = null;
  let stopped = false;
  let abort: AbortController | null = null;
  let drainWaiters: Array<() => void> = [];
  const st = { sent: 0, failed: 0, dropped: 0 };

  async function call(method: string, body: Record<string, unknown>, timeoutMs: number): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
    const signals = [AbortSignal.timeout(timeoutMs)];
    if (abort !== null && method === 'getUpdates') signals.push(abort.signal);
    try {
      const res = await doFetch(`${API}/bot${deps.token}/${method}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.any(signals),
      });
      let json: Record<string, unknown> = {};
      try { json = (await res.json()) as Record<string, unknown>; } catch (e) { log(`phản hồi ${method} (HTTP ${res.status}) không phải JSON: ${(e as Error).message}`); }
      return { ok: res.ok && json.ok === true, status: res.status, json };
    } catch (e) {
      throw new Error(scrub(e instanceof Error ? e.message : String(e)));
    }
  }

  function enqueue(text: string, o: { urgent: boolean; retry: boolean }): void {
    let t = scrub(text);
    if (t.length > MAX_TEXT) t = `${t.slice(0, MAX_TEXT - 1)}…`;
    if (queue.length >= maxQueue) {
      let i = queue.findIndex((x) => !x.urgent); // bỏ tin THƯỜNG cũ nhất; toàn tin khẩn thì bỏ tin khẩn cũ nhất
      if (i < 0) i = 0;
      queue.splice(i, 1);
      st.dropped++;
    }
    queue.push({ text: t, urgent: o.urgent, retry: o.retry, attempts: 0, notBefore: 0 });
    if (o.urgent) wake?.();
    void pump();
  }

  async function sendOne(it: Item): Promise<void> {
    const wait = Math.max(lastSentAt + MIN_SEND_INTERVAL_MS, blockedUntil) - now();
    if (wait > 0) await sleep(wait);
    lastSentAt = now();
    it.attempts++;
    let failure: string;
    let retryAfterMs = 0;
    let permanent = false;
    try {
      const r = await call('sendMessage', { chat_id: chatId, text: it.text }, FETCH_TIMEOUT_MS);
      if (r.ok) { st.sent++; return; }
      const desc = typeof r.json.description === 'string' ? r.json.description : `HTTP ${r.status}`;
      const code = typeof r.json.error_code === 'number' ? r.json.error_code : r.status;
      failure = `Telegram trả lỗi ${code}: ${desc}`;
      const p = r.json.parameters as { retry_after?: unknown } | undefined;
      if (typeof p?.retry_after === 'number') {
        retryAfterMs = p.retry_after * 1000;
        blockedUntil = Math.max(blockedUntil, now() + retryAfterMs);
      }
      permanent = code >= 400 && code < 500 && code !== 429;
    } catch (e) {
      failure = `lỗi mạng khi gửi: ${(e as Error).message}`;
    }
    const max = it.urgent ? MAX_ATTEMPTS_URGENT : MAX_ATTEMPTS;
    if (permanent || !it.retry || it.attempts >= max) {
      st.failed++;
      log(`bỏ tin sau ${it.attempts} lần thử — ${failure}`);
      return;
    }
    log(`gửi lỗi (lần ${it.attempts}), sẽ thử lại — ${failure}`);
    it.notBefore = now() + Math.max(retryAfterMs, Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (it.attempts - 1)));
    queue.push(it);
  }

  async function pump(): Promise<void> {
    if (pumping) return;
    pumping = true;
    try {
      while (queue.length > 0) {
        const t = now();
        const ready = queue.filter((x) => x.notBefore <= t);
        if (ready.length === 0) {
          await Promise.race([sleep(Math.max(1, Math.min(...queue.map((x) => x.notBefore)) - t)), new Promise<void>((r) => { wake = r; })]);
          wake = null;
          continue;
        }
        const it = ready.find((x) => x.urgent) ?? ready[0]!;
        queue.splice(queue.indexOf(it), 1);
        await sendOne(it);
      }
    } catch (e) {
      log(`hàng đợi gửi gặp lỗi bất ngờ: ${(e as Error).message}`);
    } finally {
      pumping = false;
      const w = drainWaiters;
      drainWaiters = [];
      for (const f of w) f();
      if (queue.length > 0) void pump();
    }
  }

  // ---------- Lệnh ----------
  const reply = (text: string) => enqueue(text, { urgent: true, retry: false });

  function statusText(): string {
    const s = deps.getStatus();
    const lines = [`Trạng thái bot — chế độ ${s.mode}${isPaused() ? ' — ĐANG TẠM DỪNG mở lệnh mới (/dung)' : ''}`];
    lines.push(`Vốn: ${s.equity === null ? '?' : `${num(s.equity, 2)} USDT`}`);
    if (s.openTrades.length === 0) lines.push('Không có lệnh mở.');
    else {
      lines.push(`Lệnh đang mở (${s.openTrades.length}):`);
      for (const t of s.openTrades) lines.push(`- ${t.symbol} ${t.side} vào ${num(t.entry)} dừng ${num(t.stop)} lãi/lỗ ${signed(t.pnl)} USDT`);
    }
    const trip = Object.entries(deps.journal.state().protections).filter(([, p]) => p.tripped);
    if (trip.length === 0) lines.push('Cầu chì: không có cầu chì nào đang nhảy.');
    else for (const [n, p] of trip) lines.push(`Cầu chì ĐANG NHẢY: ${n} (${fuseVn(n)}) — ${p.reason ?? 'không rõ lý do'}`);
    lines.push(`Lỗi gần nhất: ${s.lastError ?? 'không có'}`);
    return lines.join('\n');
  }

  function resume(): void {
    const prot = deps.journal.state().protections;
    // Tất cả hoặc không gì: tính trước mọi sự kiện mở cầu chì; có cái nào lỗi thì KHÔNG ghi gì và KHÔNG bỏ tạm dừng
    const events: JournalEventBody[] = [];
    const names: string[] = [];
    const failed: string[] = [];
    for (const name of [FUSE.lossStreak, FUSE.dailyLoss]) {
      if (prot[name]?.tripped !== true) continue;
      const r = resetProtection({ name, by: 'telegram:/tieptuc', state: prot, dayLossPct: deps.getDayLossPct() });
      if (r.ok) { events.push(r.event); names.push(name); } else failed.push(`${name}: ${r.reason}`);
    }
    if (failed.length > 0) {
      log(`/tieptuc thất bại, giữ nguyên trạng thái: ${failed.join('; ')}`);
      reply(`KHÔNG tiếp tục được, giữ nguyên tạm dừng và cầu chì: ${failed.join('; ')}`);
      return;
    }
    const wasPaused = isPaused();
    if (wasPaused) events.push({ type: 'protection_reset', name: USER_PAUSE, by: 'telegram:/tieptuc' });
    for (const e of events) deps.journal.append(e);
    const parts: string[] = [];
    if (wasPaused) parts.push('đã bỏ tạm dừng');
    for (const n of names) parts.push(`đã mở cầu chì ${fuseVn(n)}`);
    if (parts.length === 0) parts.push('không có gì cần mở (không tạm dừng, không cầu chì nào nhảy)');
    reply(`Tiếp tục: ${parts.join('; ')}.`);
    for (const n of names) enqueue(alerts.fuseReset({ name: n, by: 'Telegram /tieptuc' }).text, { urgent: false, retry: true });
  }

  function handleCommand(text: string): void {
    const [head = '', ...args] = text.trim().split(/\s+/);
    const cmd = head.split('@')[0]!.toLowerCase();
    if (!cmd.startsWith('/')) return; // chữ thường: không phải lệnh, im lặng
    switch (cmd) {
      case '/trangthai': reply(statusText()); return;
      case '/dung':
        if (!isPaused()) deps.journal.append({ type: 'protection_tripped', name: USER_PAUSE, reason: 'người dùng gõ /dung qua Telegram' });
        reply('Đã ngừng mở lệnh MỚI. Lệnh đang mở vẫn giữ dừng trên sàn. Gõ /tieptuc để mở lại.');
        return;
      case '/tieptuc':
        if ((args[0] ?? '').toUpperCase() === 'XACNHAN') {
          const ok = confirmAt !== null && now() - confirmAt <= CONFIRM_WINDOW_MS;
          confirmAt = null; // dùng một lần
          if (!ok) { reply('Chưa có yêu cầu /tieptuc còn hiệu lực (hoặc đã quá 2 phút). Gõ /tieptuc trước, rồi /tieptuc XACNHAN trong 2 phút.'); return; }
          resume();
        } else {
          confirmAt = now();
          reply('Để tiếp tục mở lệnh mới (bỏ tạm dừng và mở lại cầu chì đã nhảy), gõ trong 2 phút: /tieptuc XACNHAN');
        }
        return;
      case '/trogiup': case '/start': case '/help': reply(HELP); return;
      default: reply(`Không hiểu lệnh này. Gõ /trogiup để xem danh sách.`);
    }
  }

  async function pollOnce(): Promise<void> {
    const body: Record<string, unknown> = { timeout: POLL_TIMEOUT_S, allowed_updates: ['message'] };
    if (offset !== undefined) body.offset = offset;
    const r = await call('getUpdates', body, (POLL_TIMEOUT_S + 10) * 1000);
    if (!r.ok || !Array.isArray(r.json.result)) {
      const d = typeof r.json.description === 'string' ? r.json.description : `HTTP ${r.status}`;
      throw new Error(scrub(`getUpdates lỗi: ${d}`));
    }
    for (const u of r.json.result as Array<Record<string, unknown>>) {
      const id = u.update_id;
      if (typeof id !== 'number') continue;
      offset = Math.max(offset ?? 0, id + 1);
      const m = u.message as { chat?: { id?: unknown; type?: unknown }; from?: { id?: unknown }; text?: unknown; date?: unknown } | undefined;
      if (m === undefined) continue;
      // Chỉ chat RIÊNG, và người gửi phải đúng chat ID cấu hình (nếu ID cấu hình là nhóm, thành viên khác không điều khiển được)
      if (String(m.chat?.id) !== chatId || m.chat?.type !== 'private' || String(m.from?.id) !== chatId) {
        log(`bỏ qua tin từ chat/người gửi lạ (chat ${String(m.chat?.id)}, loại ${String(m.chat?.type)}, người gửi ${String(m.from?.id)}; không ghi nội dung)`);
        continue;
      }
      if (typeof m.text !== 'string') continue;
      const stale = typeof m.date !== 'number' || m.date * 1000 < startedAt;
      // Lệnh DỪNG (/dung) gửi lúc bot tắt vẫn phải thi hành (chiều an toàn); lệnh khác bị bỏ và báo người dùng gõ lại
      if (stale && m.text.trim().split(/\s+/)[0]!.split('@')[0]!.toLowerCase() !== '/dung') {
        log('bỏ lệnh gửi từ trước lúc khởi động (không chạy lại lệnh cũ)');
        if (m.text.trim().startsWith('/')) reply('Bỏ qua một lệnh cũ gửi từ trước lúc bot khởi động (không thi hành). Nếu vẫn cần, hãy gõ lại.');
        continue;
      }
      try {
        handleCommand(m.text);
      } catch (e) {
        log(`lỗi khi xử lý lệnh: ${(e as Error).message}`);
        reply('Lỗi khi xử lý lệnh, xem log bot.');
      }
    }
  }

  async function loop(): Promise<void> {
    let fails = 0;
    while (!stopped) {
      try {
        await pollOnce();
        fails = 0;
      } catch (e) {
        if (stopped) return;
        fails++;
        log(`long-poll lỗi (lần ${fails}): ${(e as Error).message}`);
        await sleep(Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.min(fails - 1, 6)));
      }
    }
  }

  return {
    send: (text, o) => enqueue(text, { urgent: o?.urgent === true, retry: true }),
    notify: (a) => enqueue(a.text, { urgent: a.level === 'urgent', retry: true }),
    sendAlert: (a) => enqueue(a.text, { urgent: a.urgent, retry: true }),
    pollOnce,
    start() {
      if (!stopped && abort === null) {
        abort = new AbortController();
        void loop();
      }
    },
    stop() { stopped = true; abort?.abort(); },
    drain: () => (queue.length === 0 && !pumping ? Promise.resolve() : new Promise<void>((r) => { drainWaiters.push(r); })),
    isPaused,
    stats: () => ({ ...st, queued: queue.length }),
  };
}
