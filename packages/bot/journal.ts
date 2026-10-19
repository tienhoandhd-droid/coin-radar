import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, truncateSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { redact } from '../binance/redact.ts';
import { advanceSignalState, type SignalIdentity, type SignalState } from '../core/signal.ts';
import type { AttributedFill, ExPosition, Fill, LegRole, LegState, LegStatus, TradeState } from './reconcile.ts';
import type { TradeOutcome } from './protections.ts';

// Nhật ký bot (B4, thiết kế D5): JSONL CHỈ GHI THÊM `journal-YYYY-MM-DD.jsonl` (ngày UTC) + ảnh chụp định kỳ `snapshot.json`.
// Mọi lệnh gửi đi được ghi TRƯỚC khi gửi (order_intent) và SAU khi có phản hồi (order_result).
// Khôi phục = ảnh chụp mới nhất + phát lại các sự kiện có seq lớn hơn. Dòng cuối bị cắt dở (mất điện giữa lúc ghi) được bỏ qua
// KÈM cảnh báo; dòng hỏng ở giữa → dừng (không bao giờ im lặng bỏ qua sự kiện). Không bao giờ ghi secret (redact).

export const DEFAULT_JOURNAL_DIR = 'data/bot';
const SNAPSHOT = 'snapshot.json';
const FILE_RE = /^journal-\d{4}-\d{2}-\d{2}\.jsonl$/;

// resetAt: lúc người dùng mở lại (lệnh thua trước mốc này không tính nữa); baseline: % lỗ ngày lúc mở (daily_loss — chỉ nhảy lại
// khi lỗ thêm quá ngưỡng từ mốc này, trong cùng ngày UTC). Hai trường có thể vắng ở nhật ký cũ.
export type ProtectionState = {
  tripped: boolean; reason: string | null; since: number | null; resetBy: string | null;
  resetAt?: number | null; baseline?: number | null;
};

// Loại thao tác của order_intent/order_result (B5 executor). Vắng = 'place' (đặt lệnh của một chân — nhật ký B4).
// cancel = hủy lệnh/algo; close = đóng market khẩn; reduce = giảm vị thế market reduce-only. Chỉ 'place' đổi chân lệnh khi ghi ý
// định; 'cancel' thành công đánh dấu chân 'cancelled'. close/reduce không thuộc chân nào (role null) — khớp đến qua userTrades.
export type OrderOp = 'place' | 'cancel' | 'close' | 'reduce';

export type JournalState = {
  seq: number; // số thứ tự sự kiện cuối đã áp dụng
  trades: Record<string, TradeState>; // theo signalId
  prevSignals: Record<string, SignalState>; // theo mã — trạng thái tín hiệu cho hysteresis/luật đảo chiều (advanceSignalState)
  protections: Record<string, ProtectionState>; // theo tên cầu chì
  positions: Record<string, ExPosition>; // ảnh chụp vị thế gần nhất theo mã
  // Mã có vị thế mà lượt trước KHÔNG đặt được lệnh dừng (bị khóa giữa chừng, không xác nhận được) — lượt sau xử lý TRƯỚC.
  // Tự xóa khi lệnh dừng (SL/BE) của mã được sàn nhận hoặc lệnh đóng.
  unprotected: Record<string, { signalId: string | null; since: number; reason: string }>;
  // B8b: kết quả các lệnh đã đóng (PnL sau phí + funding từ userTrades/income) — cầu chì 5 lệnh thua/24h, cooldown, tóm tắt ngày.
  // Chỉ giữ OUTCOME_KEEP_MS gần nhất. Nhật ký cũ không có → [].
  outcomes: TradeOutcome[];
  // B8b: đỉnh vốn + vốn đầu ngày UTC (cầu chì lỗ ngày / cảnh báo sụt) — bền qua khởi động lại. null = chưa đo lần nào.
  equity: { peak: number; day: string; dayStartEquity: number } | null;
  // B8b vòng 3: bộ nhớ chốt chặn funding theo mã — |funding| xấu nhất đã biết + lần kiểm được gần nhất (lỗ đã chốt lúc đó)
  fundingGuard: Record<string, { worstRate: number; lastGood: { at: number; lockedLoss: number } | null }>;
};

export const OUTCOME_KEEP_MS = 7 * 86_400_000;

// algoStatus (tài liệu tra cứu mục 4): NEW, CANCELED, TRIGGERING, TRIGGERED, FINISHED, REJECTED, EXPIRED
export type JournalEventBody =
  | { type: 'signal_accepted'; trade: TradeState }
  | { type: 'order_intent'; op?: OrderOp; symbol?: string; signalId: string | null; role: LegRole | null; clientId: string; attempt: number; qty: number | null; triggerPrice: number | null }
  | { type: 'order_result'; op?: OrderOp; symbol?: string; signalId: string | null; role: LegRole | null; clientId: string; kind: string; sent: boolean; orderId: number | null; code: number | null; msg: string }
  | { type: 'fill'; signalId: string; role: LegRole; fill: Fill }
  | { type: 'algo_update'; signalId: string; role: LegRole; clientId: string; algoStatus: string; activated: boolean | null; orderId: number | null }
  | { type: 'leg_update'; signalId: string; role: LegRole; clientId: string; status: LegStatus; reason?: string }
  // Lệnh dừng mới bị sàn từ chối khi đang thay mà lệnh dừng cũ còn lành (place_stop.onReject = 'stop_replace_rejected'):
  // giữ lệnh cũ; từ đó lệnh này thay lệnh dừng theo cancel_then_place
  | { type: 'stop_replace_rejected'; signalId: string; role: LegRole; clientId: string; code: number | null; msg: string }
  | { type: 'trade_closed'; signalId: string; reason: string }
  // Nhận lại một lần thử cũ của chân lệnh (vd lệnh dừng gốc báo "không rõ" hóa ra đã nằm trên sàn) làm chân hiện tại
  | { type: 'leg_adopt'; signalId: string; role: LegRole; clientId: string; attempt: number; status: LegStatus; reason: string }
  | { type: 'unprotected'; symbol: string; signalId: string | null; reason: string }
  | { type: 'position_snapshot'; positions: ExPosition[] }
  | { type: 'protection_tripped'; name: string; reason: string }
  | { type: 'protection_reset'; name: string; by: string; baseline?: number }
  | { type: 'signal_state'; symbol: string; state: SignalState | null }
  // B8b chốt chặn funding (packages/core/funding-guard.ts): siết SL của lệnh (chỉ siết) — lần đối chiếu sau dùng mức này
  | { type: 'stop_tightened'; signalId: string; stop: number; reason: string }
  | { type: 'trade_outcome'; outcome: TradeOutcome }
  | { type: 'equity'; peak: number; day: string; dayStartEquity: number }
  | { type: 'funding_state'; symbol: string; worstRate: number; lastGood: { at: number; lockedLoss: number } | null }
  | { type: 'note'; text: string };
export type JournalEvent = { seq: number; at: number } & JournalEventBody;

export const emptyState = (): JournalState => ({ seq: 0, trades: {}, prevSignals: {}, protections: {}, positions: {}, unprotected: {}, outcomes: [], equity: null, fundingGuard: {} });

export function journalFileName(at: number): string {
  return `journal-${new Date(at).toISOString().slice(0, 10)}.jsonl`;
}

type Warn = (msg: string) => void;
const defaultWarn: Warn = (m) => console.warn(`[nhật ký] ${m}`);

const ALGO_STATUS: Record<string, LegStatus> = {
  NEW: 'open', CANCELED: 'cancelled', EXPIRED: 'cancelled', REJECTED: 'rejected',
  TRIGGERING: 'filled', TRIGGERED: 'filled', FINISHED: 'filled',
};

// Áp một sự kiện vào trạng thái (SỬA TẠI CHỖ s, trả về s). Sự kiện tham chiếu lệnh không có → cảnh báo, bỏ qua.
export function applyEvent(s: JournalState, e: JournalEvent, warn: Warn = defaultWarn): JournalState {
  s.seq = e.seq;
  s.unprotected ??= {}; // ảnh chụp cũ (trước B5 vòng 1) không có trường này
  s.outcomes ??= []; // ảnh chụp cũ (trước B8b)
  s.equity ??= null;
  s.fundingGuard ??= {};
  const tradeOf = (signalId: string): TradeState | null => {
    const t = s.trades[signalId];
    if (t === undefined) warn(`sự kiện #${e.seq} (${e.type}) tham chiếu lệnh ${signalId} không có trong nhật ký — bỏ qua`);
    return t ?? null;
  };
  const legOf = (t: TradeState, role: LegRole, clientId: string): LegState => {
    const cur = t.legs[role];
    if (cur !== undefined) return cur;
    const leg: LegState = { role, clientId, attempt: 0, status: 'planned', qty: null, triggerPrice: null, orderIds: [] };
    t.legs[role] = leg;
    return leg;
  };
  const markFilled = (t: TradeState, role: LegRole) => {
    if (role === 'TP1') t.tp1Filled = true;
  };
  switch (e.type) {
    case 'signal_accepted':
      if (s.trades[e.trade.signalId] !== undefined) warn(`sự kiện #${e.seq}: lệnh ${e.trade.signalId} đã có — bỏ qua bản trùng`);
      else s.trades[e.trade.signalId] = structuredClone(e.trade);
      break;
    case 'order_intent': {
      if ((e.op ?? 'place') !== 'place') break; // hủy/đóng/giảm: chỉ ghi lại, không đổi chân lệnh
      if (e.signalId === null || e.role === null) {
        warn(`sự kiện #${e.seq}: order_intent đặt lệnh thiếu signalId/role — bỏ qua`);
        break;
      }
      const t = tradeOf(e.signalId);
      if (t === null) break;
      const leg = legOf(t, e.role, e.clientId);
      Object.assign(leg, { clientId: e.clientId, attempt: e.attempt, status: 'intent', qty: e.qty, triggerPrice: e.triggerPrice });
      break;
    }
    case 'order_result': {
      const op = e.op ?? 'place';
      if (op === 'close' || op === 'reduce' || e.signalId === null || e.role === null) break;
      const t = tradeOf(e.signalId);
      if (t === null) break;
      if (op === 'cancel') {
        // Hủy thành công → chân của ĐÚNG lần thử này hết hiệu lực (không chạm lần thử mới hơn)
        const cur = t.legs[e.role];
        if (e.kind === 'ok' && cur !== undefined && cur.clientId === e.clientId) cur.status = 'cancelled';
        break;
      }
      const leg = legOf(t, e.role, e.clientId);
      if (e.orderId !== null && !leg.orderIds.includes(e.orderId)) leg.orderIds.push(e.orderId);
      if (leg.clientId === e.clientId) leg.status = e.kind === 'ok' ? 'open' : e.kind === 'unknown_status' ? 'unknown' : 'rejected';
      // Thay lệnh dừng đã thành công → bỏ chế độ dự phòng cancel_then_place; mã đã có lệnh dừng
      if (e.kind === 'ok' && (e.role === 'SL' || e.role === 'BE')) {
        t.stopReplaceFallback = false;
        delete s.unprotected[t.symbol];
      }
      break;
    }
    case 'fill': {
      const t = tradeOf(e.signalId);
      if (t === null || t.fills.some((f) => f.tradeId === e.fill.tradeId)) break;
      const f: AttributedFill = { ...e.fill, role: e.role };
      t.fills.push(f);
      if ((e.role === 'E1' || e.role === 'E2') && t.status === 'pending') t.status = 'open';
      markFilled(t, e.role);
      break;
    }
    case 'algo_update': {
      const t = tradeOf(e.signalId);
      if (t === null) break;
      const leg = legOf(t, e.role, e.clientId);
      // orderId của lệnh thật sinh ra khi algo kích hoạt (ALGO_UPDATE.ai) — để gán khớp, kể cả của lần thử cũ
      if (e.orderId !== null && !leg.orderIds.includes(e.orderId)) leg.orderIds.push(e.orderId);
      if (e.role === 'TR' && e.activated === true) t.trailingActivated = true;
      const st = ALGO_STATUS[e.algoStatus];
      if (st === undefined) warn(`sự kiện #${e.seq}: algoStatus "${e.algoStatus}" không có trong tài liệu — giữ trạng thái chân ${e.role}`);
      else if (leg.clientId === e.clientId) {
        leg.status = st;
        if (st === 'filled') markFilled(t, e.role);
      }
      break;
    }
    case 'leg_update': {
      const t = tradeOf(e.signalId);
      if (t === null) break;
      const leg = legOf(t, e.role, e.clientId);
      if (leg.clientId === e.clientId) leg.status = e.status;
      if (e.status === 'filled') markFilled(t, e.role);
      break;
    }
    case 'stop_replace_rejected': {
      const t = tradeOf(e.signalId);
      if (t === null) break;
      const leg = legOf(t, e.role, e.clientId);
      if (leg.clientId === e.clientId) leg.status = 'rejected';
      // Mọi từ chối khi đặt-trước (kể cả -2022 REDUCE_ONLY_REJECT: cũ + mới + trailing vượt vị thế) → lần sau hủy-trước-đặt-sau,
      // với lần thử mới; không bao giờ đặt lại y lệnh vừa bị từ chối.
      t.stopReplaceFallback = true;
      break;
    }
    case 'trade_closed': {
      const t = tradeOf(e.signalId);
      if (t === null) break;
      t.status = 'closed';
      t.closedReason = e.reason;
      delete s.unprotected[t.symbol];
      break;
    }
    case 'leg_adopt': {
      const t = tradeOf(e.signalId);
      if (t === null) break;
      Object.assign(legOf(t, e.role, e.clientId), { clientId: e.clientId, attempt: e.attempt, status: e.status });
      if (e.status === 'open' && (e.role === 'SL' || e.role === 'BE')) delete s.unprotected[t.symbol];
      break;
    }
    case 'unprotected':
      s.unprotected[e.symbol] = { signalId: e.signalId, since: e.at, reason: e.reason };
      break;
    case 'position_snapshot':
      s.positions = {};
      for (const p of e.positions) s.positions[p.symbol] = { ...p };
      break;
    case 'protection_tripped':
      s.protections[e.name] = { tripped: true, reason: e.reason, since: e.at, resetBy: null };
      break;
    case 'protection_reset':
      s.protections[e.name] = { tripped: false, reason: null, since: null, resetBy: e.by, resetAt: e.at, baseline: e.baseline ?? null };
      break;
    case 'signal_state':
      if (e.state === null) delete s.prevSignals[e.symbol];
      else s.prevSignals[e.symbol] = { ...e.state };
      break;
    case 'stop_tightened': {
      const t = tradeOf(e.signalId);
      if (t !== null) t.plan.stop = e.stop;
      break;
    }
    case 'trade_outcome': {
      const t = s.trades[e.outcome.signalId];
      if (t !== undefined) t.outcomeRecorded = true;
      s.outcomes = [...s.outcomes.filter((o) => o.signalId !== e.outcome.signalId), { ...e.outcome }].filter((o) => o.closedAt > e.at - OUTCOME_KEEP_MS);
      break;
    }
    case 'equity':
      s.equity = { peak: e.peak, day: e.day, dayStartEquity: e.dayStartEquity };
      break;
    case 'funding_state':
      s.fundingGuard[e.symbol] = { worstRate: e.worstRate, lastGood: e.lastGood === null ? null : { ...e.lastGood } };
      break;
    case 'note':
      break;
    default:
      throw new Error(`sự kiện #${(e as JournalEvent).seq}: loại "${(e as { type: string }).type}" không biết`);
  }
  return s;
}

function journalFiles(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((f) => FILE_RE.test(f)).sort() : [];
}

type Parsed = { events: JournalEvent[]; tornLine: { file: string; offset: number; text: string } | null };

// Đọc mọi file nhật ký. Dòng không đọc được: là dòng cuối của file cuối → coi là bị cắt dở (trả về để cảnh báo/sửa);
// ở chỗ khác → ném lỗi.
function readEvents(dir: string): Parsed {
  const files = journalFiles(dir);
  const events: JournalEvent[] = [];
  let tornLine: Parsed['tornLine'] = null;
  files.forEach((file, fi) => {
    const text = readFileSync(join(dir, file), 'utf8');
    const lines = text.split('\n');
    let offset = 0;
    const lastIdx = lines.map((l) => l.trim() !== '').lastIndexOf(true);
    lines.forEach((line, li) => {
      const start = offset;
      offset += Buffer.byteLength(line, 'utf8') + 1;
      if (line.trim() === '') return;
      let ev: JournalEvent | null = null;
      try {
        const v = JSON.parse(line) as JournalEvent;
        if (typeof v === 'object' && v !== null && Number.isInteger(v.seq) && typeof v.type === 'string') ev = v;
      } catch {
        ev = null; // xử lý ngay dưới: dòng cuối → cảnh báo, dòng giữa → ném lỗi
      }
      if (ev !== null) {
        events.push(ev);
        return;
      }
      if (fi === files.length - 1 && li === lastIdx) tornLine = { file, offset: start, text: line };
      else throw new Error(`Nhật ký hỏng: ${file} dòng ${li + 1} không phải JSON hợp lệ (không phải dòng cuối) — dừng khôi phục, cần kiểm tra tay`);
    });
  });
  return { events, tornLine };
}

// Khôi phục trạng thái từ thư mục nhật ký (chỉ đọc).
export function restore(opts: { dir?: string; warn?: Warn } = {}): JournalState {
  return restoreFull(opts.dir ?? DEFAULT_JOURNAL_DIR, opts.warn ?? defaultWarn).state;
}

function restoreFull(dir: string, warn: Warn): { state: JournalState; tornLine: Parsed['tornLine']; snapshotAt: number | null } {
  let state = emptyState();
  let snapshotAt: number | null = null;
  const snapPath = join(dir, SNAPSHOT);
  if (existsSync(snapPath)) {
    try {
      const snap = JSON.parse(readFileSync(snapPath, 'utf8')) as { version: number; at: number; state: JournalState };
      if (snap.version !== 1 || typeof snap.state?.seq !== 'number') throw new Error(`phiên bản/cấu trúc lạ`);
      state = snap.state;
      state.unprotected ??= {}; // ảnh chụp cũ
      state.outcomes ??= [];
      state.equity ??= null;
      state.fundingGuard ??= {};
      snapshotAt = snap.at;
    } catch (e) {
      warn(`ảnh chụp ${snapPath} không đọc được (${e instanceof Error ? e.message : String(e)}) — phát lại toàn bộ nhật ký`);
      state = emptyState();
    }
  }
  const { events, tornLine } = readEvents(dir);
  if (tornLine !== null) {
    warn(`dòng cuối của ${tornLine.file} bị cắt dở/hỏng (${JSON.stringify(tornLine.text.slice(0, 80))}) — bỏ qua dòng này`);
  }
  for (const e of events) {
    if (e.seq <= state.seq) continue;
    if (e.seq !== state.seq + 1) warn(`nhật ký nhảy số thứ tự ${state.seq} → ${e.seq}`);
    applyEvent(state, e, warn);
  }
  return { state, tornLine, snapshotAt };
}

export type Journal = {
  dir: string;
  state(): Readonly<JournalState>;
  hasSignal(signalId: string): boolean;
  append(body: JournalEventBody): JournalEvent;
  // Cập nhật prevSignals sau một lần quét bằng advanceSignalState. current: mã → tín hiệu lần quét này (null = đã quét, không có
  // tín hiệu). Mã KHÔNG có trong current được coi là không quét lần này → giữ nguyên.
  recordSignals(current: ReadonlyMap<string, SignalIdentity | null>): JournalEvent[];
  prevSignalsMap(): Map<string, SignalState>; // cho ScanInput.prevSignals
  snapshot(): string;
  maybeSnapshot(): boolean; // chụp nếu đã quá snapshotEveryMs kể từ lần chụp trước
};

export function openJournal(opts: { dir?: string; now?: () => number; secrets?: readonly string[]; warn?: Warn; snapshotEveryMs?: number } = {}): Journal {
  const dir = opts.dir ?? DEFAULT_JOURNAL_DIR;
  const now = opts.now ?? Date.now;
  const secrets = opts.secrets ?? [];
  const warn = opts.warn ?? defaultWarn;
  const every = opts.snapshotEveryMs ?? 15 * 60_000;
  const r = restoreFull(dir, warn);
  const state = r.state;
  let lastSnapshot = r.snapshotAt;

  // Sửa đuôi bị cắt dở: chuyển phần hỏng sang file .torn (giữ lại để kiểm tra) rồi cắt file về trước dòng đó,
  // để sự kiện ghi tiếp không dính vào dòng hỏng.
  if (r.tornLine !== null) {
    const file = join(dir, r.tornLine.file);
    const torn = `${file}.torn-${now()}`;
    writeFileSync(torn, r.tornLine.text, { mode: 0o600 });
    truncateSync(file, r.tornLine.offset);
    warn(`đã chuyển dòng hỏng cuối ${r.tornLine.file} sang ${torn} và cắt file về dòng hợp lệ cuối cùng`);
  }

  const ensureDir = () => {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  };
  const clean = (text: string) => redact(text, secrets);

  function append(body: JournalEventBody): JournalEvent {
    if (body.type === 'signal_accepted' && state.trades[body.trade.signalId] !== undefined) {
      throw new Error(`Tín hiệu ${body.trade.signalId} đã nhận trước đó — không nhận lại (khử trùng theo signal.id)`);
    }
    const at = now();
    const ev = { seq: state.seq + 1, at, ...body } as JournalEvent;
    const line = clean(JSON.stringify(ev));
    ensureDir();
    appendFileSync(join(dir, journalFileName(at)), `${line}\n`, { mode: 0o600 });
    applyEvent(state, JSON.parse(line) as JournalEvent, warn); // áp đúng nội dung đã ghi (sau redact) → khôi phục ra y hệt
    return ev;
  }

  function snapshot(): string {
    ensureDir();
    const at = now();
    const path = join(dir, SNAPSHOT);
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, clean(JSON.stringify({ version: 1, at, state })), { mode: 0o600 });
    renameSync(tmp, path); // thay nguyên khối: không bao giờ để lại ảnh chụp ghi dở
    lastSnapshot = at;
    return path;
  }

  return {
    dir,
    state: () => state,
    hasSignal: (id) => state.trades[id] !== undefined,
    append,
    recordSignals(current) {
      const out: JournalEvent[] = [];
      const at = now();
      for (const [symbol, cur] of current) {
        const prev = state.prevSignals[symbol] ?? null;
        const next = advanceSignalState(prev, cur, at);
        if (JSON.stringify(next) !== JSON.stringify(prev)) out.push(append({ type: 'signal_state', symbol, state: next }));
      }
      return out;
    },
    prevSignalsMap: () => new Map(Object.entries(state.prevSignals)),
    snapshot,
    maybeSnapshot() {
      if (lastSnapshot !== null && now() - lastSnapshot < every) return false;
      snapshot();
      return true;
    },
  };
}
