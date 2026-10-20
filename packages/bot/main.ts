import { readFileSync, existsSync } from 'node:fs';
import { resolve as resolvePath, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '../binance/client.ts';
import { createSigned, hmacSigner, loadCredentials, nodeFetch, type RequestOpts, type SignedResult } from '../binance/signed.ts';
import { createOrders } from '../binance/orders.ts';
import { withConfigOverride } from '../core/config-override.ts';
import { createMarketStream, createUserStream, createListenKeyApi, type MarketEvent, type MarkPrice, type UserEvent } from '../binance/stream.ts';
import { parseBookTickers, parseContracts, parseFundingInfo, parseKlines, parseLeverageBrackets, parsePremium, parseTickers } from '../binance/parse.ts';
import { CONFIG, COMMON } from '../core/config.ts';
import { fundingFallbackRate, maxAbsFundingRate, meanFundingRate } from '../core/sizing.ts';
import { donchianBreakout } from '../core/breakout.ts';
import { tickDecimals } from '../core/price.ts';
import { parseEvents, type MacroEvent } from '../core/events.ts';
import type { OpenTrade } from '../core/portfolio.ts';
import type { MarginBracket } from '../core/margin.ts';
import type { SignalIdentity } from '../core/signal.ts';
import type { Analysis } from '../core/analyze.ts';
import type { BotMode, Candle, Contract, Mode } from '../core/types.ts';
import { regimeAction, regimeCostPct, regimeExitCostPct, regimeSignal, type RegimeSignal } from '../core/btc-regime.ts';
import { runScan, type ScanInput, type ScanResult } from '../../scanner/run-scan.ts';
import { createFundingMaxAbsLoader } from '../../scanner/funding-history.ts';
import { fetchFgiDecision, httpJson } from '../../scanner/fgi.ts';
import { liveUniverse } from '../core/gates.ts';
import { fetchClusterDaily } from './cluster-data.ts';
import { openJournal, type Journal } from './journal.ts';
import { planOrders, type PlannerPlan } from './planner.ts';
import { reconcile, roleOfClientId, tradeFromPlan, type Action, type AlertLevel, type ExPosition, type TradeState } from './reconcile.ts';
import { executeActions, type ExecReport } from './executor.ts';
import { checkEntry, evaluateProtections } from './protections.ts';
import { planRegimeEntry, regimeEntrySizing, regimeSignalId } from './btc-regime.ts';
import { alerts as tgAlerts, createTelegram, USER_PAUSE, scrubText, type StatusSnapshot, type Telegram } from './telegram.ts';
import { DEFAULT_LIVE_ARM_PATH, DEFAULT_LIVE_CAPS_PATH, resolveRunMode, type LiveCaps } from './live.ts';
import { createPaperExchange } from './paper.ts';
import type { FillCost } from './fill-model.ts';
import { fetchExchangeState, fetchTradeHistory, getOk, parseIncome, StateFetchError, type FetchedState } from './exchange-state.ts';
import { fundingGuardActions } from './funding-runtime.ts';
import { botSettings, describeSettings, readEnvFile } from './env.ts';

// Vòng đời bot (B8b, thiết kế docs/specs/2026-10-19-bot-design.md mục "Vòng đời"; D1–D11). Một code cho paper | demo | live:
// chỉ khác `api` (sàn giả lập paper.ts hoặc REST có ký signed.ts) và luồng user (sự kiện của sàn giả lập hoặc WebSocket listenKey).
//
// KHỞI ĐỘNG (đúng thứ tự, có test): (1) đồng bộ giờ (lệch > 500 ms: demo/live từ chối chạy, paper cảnh báo) → (2) exchangeInfo + bộ lọc,
// chu kỳ funding → (3) tài khoản: One-way, Multi-Assets tắt (+ bậc ký quỹ thật leverageBracket: demo/live BẮT BUỘC) → (4) nhật ký đã khôi
// phục (in lệnh đang theo dõi + dấu "chưa bảo vệ") → (5) paper: nạp nến 1m + funding khoảng tắt máy TRƯỚC mọi nhịp mark → (6) mốc nến đóng
// cuối từ REST (seedLastClosed) TRƯỚC khi mở luồng → (7) đối chiếu ngay (mã "chưa bảo vệ" xử lý trước — executor) → (8) mở luồng.
// VÒNG LẶP: mỗi nến khung vào lệnh (Swing 4H / Lướt nhanh 15m — chỉ chế độ trong COMMON.bot.modes) đóng → đối chiếu → runScan (bộ não
// dùng chung) → tín hiệu Hạng A MỚI → tạm dừng người dùng (/dung) → protections.checkEntry → dữ liệu mới (!isMarkStale && !isKlineStale)
// → planner (costModel + đệm funding 30 ngày) → ISOLATED + đòn bẩy → lệnh vào → đối chiếu ngay (SL lên sàn ngay khi khớp).
// ĐỐI CHIẾU sau: mọi lượt executor (lặp khi executor/khẩn yêu cầu), mọi nến đóng, resync_required, cảnh báo khẩn, mỗi BOT_RECONCILE_EVERY_S
// (luồng user có thể chết im lặng), sự kiện lệnh/tài khoản/algo. FUNDING: mỗi kỳ chốt của mã có vị thế → chốt chặn funding (funding-runtime.ts).
// BTC-REGIME (COMMON.bot.modes có 'btc-regime', mặc định; luật đã khóa — packages/core/btc-regime.ts): nghe nến 1D của BTCUSDT; mỗi nến 1D
// đóng (00:00 UTC) → tải nến 1D đã đóng (một lần gọi klines) → giá đóng > SMA50: chưa có lệnh thì vào Long (LIMIT IOC + SL STOP_MARKET
// closePosition trên sàn, đòn bẩy 1×), ≤ SMA50: có lệnh thì đóng market reduce-only (đối chiếu hủy SL). Quyết định ghi vào nhật ký
// (btc_regime_decision) → khởi động lại không quyết định lại cùng nến; lỡ nến (máy tắt) → quyết định ngay lúc khởi động với nến đóng cuối.
// Thiếu dữ liệu → không hành động, thử lại ở lượt định kỳ. Chốt chặn funding/cầu chì/trần danh mục áp như mọi lệnh.
// TẮT (SIGTERM): hủy lệnh vào còn treo (R13/D7 — máy nhà không để limit nằm trên sàn khi bot không chạy), ảnh chụp nhật ký, báo Telegram.

const TRIGGER = 'BTCUSDT'; // nến khung vào lệnh của BTC đóng = mốc quyết định (mọi hợp đồng cùng mốc giờ)
const MIN = 60_000;
const H = 3_600_000;
const INTERVAL_MS: Record<string, number> = { '1m': MIN, '15m': 15 * MIN, '1h': H, '4h': 4 * H, '1d': 24 * H };
const intervalMs = (i: string): number => {
  const ms = INTERVAL_MS[i];
  if (ms === undefined) throw new Error(`khoảng nến ${i} chưa hỗ trợ`);
  return ms;
};
const MAX_SKEW_MS = 500; // R10
const FUNDING_SETTLE_DELAY_MS = 60_000; // [Đề xuất] chờ sau giờ chốt funding để income/lịch sử có dòng mới
const MISSED_CLOSE_GRACE_MS = 90_000; // [Đề xuất] nến quyết định chưa thấy qua luồng sau mức này → lấy bằng REST
const BAN_PAUSE_MS = 120_000; // [Đề xuất] bị chặn (418/429) mà sàn không nói tới khi nào → ngừng gọi 2 phút
const ALERT_DEDUPE_MS = 15 * MIN; // cùng một cảnh báo lặp lại trong khoảng này → chỉ ghi log (không spam Telegram)
const MAX_REPASS = 3; // số lượt đối chiếu tối đa liên tiếp trong một lần gọi (executor/khẩn yêu cầu đối chiếu lại)
const DAY = 24 * H;
// Khung nến quyết định của chế độ bot: btc-regime = nến 1D của BTCUSDT; Swing/Lướt nhanh = khung vào lệnh của chế độ
const decisionInterval = (m: BotMode): string => (m === 'btc-regime' ? '1d' : CONFIG[m].entryInterval);

// ---- Kiểu tiêm được (test dùng bản giả) ----------------------------------------------------------------------------
export type MarketStreamLike = {
  start(): void; stop(): void;
  latestMark(symbol: string): MarkPrice | null;
  isMarkStale(symbol: string): boolean;
  isKlineStale(symbol: string, interval: string): boolean;
  seedLastClosed(symbol: string, interval: string, closeTime: number): void;
};
export type UserStreamLike = { start(): unknown; stop(): void };
type PaperExchange = ReturnType<typeof createPaperExchange>;
export type PaperLike = Pick<PaperExchange, 'feedMark' | 'feedKline' | 'feedFunding' | 'onUserEvent' | 'lastPriceTime' | 'snapshot'>;
export type BotTelegram = Pick<Telegram, 'notify' | 'send' | 'start' | 'stop' | 'drain' | 'isPaused'>;
export type TelegramHooks = { getStatus(): StatusSnapshot; getDayLossPct(): number };
type Api = { request(o: RequestOpts): Promise<SignedResult> };

export type BotDeps = {
  mode: 'paper' | 'demo' | 'live';
  liveCaps: LiveCaps | null; // live: trần cứng (live.ts)
  runId: string; // 1–8 chữ/số — mã lần chạy trong mã client lệnh
  now(): number;
  sleep(ms: number): Promise<void>;
  log(msg: string): void;
  publicGet(path: string): Promise<unknown>; // REST công khai (client.get) — quét
  publicGetBot?: (path: string) => Promise<unknown>; // REST công khai bằng ngân sách ưu tiên của bot (đối chiếu, mốc nến, giá mark); vắng = publicGet
  api: Api; // paper: sàn giả lập; demo/live: REST có ký
  syncClock(): Promise<number>; // lệch giờ server − máy (ms)
  paper: PaperLike | null;
  setPaperCost?: (symbol: string, cost: FillCost) => void; // paper: mô hình phí/trượt của mã khi vào lệnh
  createUserStream: ((onEvent: (e: UserEvent) => void) => UserStreamLike) | null; // demo/live
  createMarketStream(o: { symbols: readonly string[]; intervals: readonly string[]; onEvent: (e: MarketEvent) => void }): MarketStreamLike;
  journal: Journal;
  telegram(hooks: TelegramHooks): BotTelegram;
  scan?: (input: ScanInput) => Promise<ScanResult>; // mặc định runScan
  events: MacroEvent[];
  scanLimit: number | null;
  freshWaitMs?: number; // chờ dữ liệu mới của mã ứng viên (mặc định 20 s)
  // FGI-hướng (COMMON.entryRules.fgiDirection, nguồn Alternative.me): tải JSON theo URL. Vắng khi luật bật → không vào lệnh Swing mới (fail closed)
  fetchJson?: (url: string) => Promise<unknown>;
};

// Telegram tắt (không có token/chat ID): mọi tin ghi log; /dung không dùng được nhưng dấu tạm dừng trong nhật ký vẫn có hiệu lực
export function disabledTelegram(o: { journal: Pick<Journal, 'state'>; log: (m: string) => void; onNotify?: (a: { level: AlertLevel; text: string }) => void }): BotTelegram {
  return {
    send: (text) => o.log(`[telegram tắt] ${text}`),
    notify: (a) => { o.onNotify?.({ level: a.level, text: a.text }); o.log(`[telegram tắt] ${a.level === 'urgent' ? 'KHẨN ' : ''}${a.symbol ? `${a.symbol}: ` : ''}${a.text}`); },
    start: () => {},
    stop: () => {},
    drain: async () => {},
    isPaused: () => o.journal.state().protections[USER_PAUSE]?.tripped === true,
  };
}

const tierOf = (rank: number): keyof typeof COMMON.costRoundTripPct => (rank <= COMMON.costTierRank.high ? 'high' : rank <= COMMON.costTierRank.mid ? 'mid' : 'low');
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const BAN_RE = /HTTP (418|429)|đang chặn tạm thời/;

export function createBot(deps: BotDeps) {
  const { journal, mode: runMode } = deps;
  const orders = createOrders({ api: deps.api, now: deps.now });
  const scanFn = deps.scan ?? runScan;
  const freshWaitMs = deps.freshWaitMs ?? 20_000;
  const modes = [...COMMON.bot.modes];
  const intervals = new Map<string, BotMode[]>(); // khoảng nến quyết định → chế độ
  for (const m of modes) intervals.set(decisionInterval(m), [...(intervals.get(decisionInterval(m)) ?? []), m]);
  const traceLog: string[] = [];
  const trace = (s: string) => { traceLog.push(s); if (traceLog.length > 5000) traceLog.splice(0, 1000); };
  const log = (m: string) => deps.log(m);
  const botGet = (path: string) => (deps.publicGetBot ?? deps.publicGet)(path);

  let contracts = new Map<string, Contract>();
  let filters: Record<string, Contract> = {};
  let fundingIntervals = new Map<string, number>();
  let brackets: Map<string, MarginBracket[]> | undefined;
  let trigger: MarketStreamLike | null = null;
  let watch: MarketStreamLike | null = null;
  let watchSet = new Set<string>();
  const pinned = new Set<string>(); // mã ứng viên đang chờ vào lệnh — giữ trong luồng theo dõi
  const lastProcessed = new Map<string, number>(); // khoảng nến → closeTime nến quyết định đã xử lý
  const nextFunding = new Map<string, number>();
  // Chốt chặn funding: kỳ chốt chưa kiểm xong (lỗi) → giữ, thử lại lượt sau; lỗi kéo dài → KHẨN + chặn vào lệnh mới mã đó
  const fundingFail = new Map<string, { settlement: number; attempts: number; alerted: boolean; alertedMissed: number }>();
  const worstRate = new Map<string, number>(); // |funding| xấu nhất đã biết theo mã (lịch sử 30 ngày, premiumIndex)
  const lastGood = new Map<string, { at: number; lockedLoss: number }>(); // lần chốt chặn funding chạy được gần nhất
  const noteRate = (sym: string, r: number) => {
    if (!Number.isFinite(r) || Math.abs(r) <= (worstRate.get(sym) ?? 0)) return;
    worstRate.set(sym, Math.abs(r));
    saveFundingMemory(sym);
  };
  // Bền qua khởi động lại (nhật ký funding_state) — chỉ ghi khi đổi
  function saveFundingMemory(sym: string): void {
    const cur = journal.state().fundingGuard[sym];
    const next = { worstRate: worstRate.get(sym) ?? 0, lastGood: lastGood.get(sym) ?? null };
    if (JSON.stringify(cur ?? null) !== JSON.stringify(next)) journal.append({ type: 'funding_state', symbol: sym, ...next });
  }
  for (const [sym, m] of Object.entries(journal.state().fundingGuard)) {
    if (m.worstRate > 0) worstRate.set(sym, m.worstRate);
    if (m.lastGood !== null) lastGood.set(sym, { ...m.lastGood });
  }
  const fundingBlocked = new Set<string>();
  const slLatencyLogged = new Set<string>();
  let startedAt = 0;
  const blocked = new Set<string>(); // mã reconcile yêu cầu khóa (vị thế lạ/mơ hồ)
  const recentAlerts = new Map<string, number>();
  let lastFetched: FetchedState | null = null;
  let lastDayLossPct = 0;
  let lastError: string | null = null;
  let bannedUntil = 0;
  let started = false;
  let stopping = false;
  let pass = 0;
  let inPass = false;
  let urgentDuringPass = false;
  let userStream: UserStreamLike | null = null;
  let unsubPaper: (() => void) | null = null;

  const tg = deps.telegram({
    getStatus: () => status(),
    getDayLossPct: () => lastDayLossPct,
  });

  // ---- Hàng đợi tuần tự: đối chiếu / vào lệnh / funding không bao giờ chạy chồng nhau ----
  let chain: Promise<void> = Promise.resolve();
  function serial(name: string, fn: () => Promise<void>): Promise<void> {
    const p = chain.then(fn).catch((e: unknown) => {
      lastError = `${name}: ${errText(e)}`;
      log(`LỖI ${lastError}`);
      if (BAN_RE.test(errText(e))) setBanned(`${name}: ${errText(e)}`);
    });
    chain = p;
    return p;
  }
  async function idle(): Promise<void> {
    let c: Promise<void>;
    do { c = chain; await c; } while (c !== chain);
  }

  function setBanned(why: string): void {
    const until = deps.now() + BAN_PAUSE_MS;
    if (until > bannedUntil) {
      bannedUntil = until;
      notify({ level: 'urgent', symbol: null, text: `KHẨN Binance chặn tạm thời (418/429): ${why} — bot ngừng gọi REST tới ${new Date(until).toISOString()}; lệnh dừng trên sàn vẫn bảo vệ vị thế` });
    }
  }
  const isBanned = () => deps.now() < bannedUntil;

  // ---- Cảnh báo: Telegram (khử lặp) + đối chiếu lại ngay sau cảnh báo khẩn (nghĩa vụ B6) ----
  function notify(a: { level: AlertLevel; symbol: string | null; text: string }): void {
    const key = `${a.level}|${a.text}`;
    const last = recentAlerts.get(key);
    if (last !== undefined && deps.now() - last < ALERT_DEDUPE_MS) log(`(cảnh báo lặp, không gửi lại) ${a.text}`);
    else {
      recentAlerts.set(key, deps.now());
      tg.notify({ level: a.level, symbol: a.symbol, text: a.text });
    }
    if (a.level === 'urgent') {
      if (inPass) urgentDuringPass = true;
      else if (started && !stopping) void requestReconcile('sau cảnh báo khẩn');
    }
  }

  // ---- Đối chiếu ----
  const pending = new Set<string>();
  let pendingPromise: Promise<void> | null = null;
  function requestReconcile(reason: string): Promise<void> {
    pending.add(reason);
    if (pendingPromise !== null) return pendingPromise;
    pendingPromise = serial('đối chiếu', async () => {
      const reasons = [...pending];
      pending.clear();
      pendingPromise = null;
      await reconcileLoop(reasons);
    });
    return pendingPromise;
  }

  async function reconcileLoop(reasons: string[]): Promise<void> {
    for (const r of reasons) trace(`reconcile:${r}`);
    for (let i = 0; i < MAX_REPASS; i++) {
      inPass = true;
      urgentDuringPass = false;
      let rep: ExecReport | null;
      try {
        rep = await reconcileOnce(i === 0 ? reasons.join(', ') : 'lặp lại (executor/khẩn yêu cầu)');
      } finally {
        inPass = false;
      }
      if (rep === null || !(rep.reconcileAgain || urgentDuringPass)) return;
      trace('reconcile:lặp lại');
    }
  }

  const activeTrades = (): TradeState[] => Object.values(journal.state().trades).filter((t) => t.status !== 'closed');
  const capitalOf = (equity: number) => (deps.liveCaps !== null ? Math.min(equity, deps.liveCaps.maxCapitalUsdt) : equity);
  const streamFor = (symbol: string): MarketStreamLike | null => (watchSet.has(symbol) ? watch : symbol === TRIGGER ? trigger : null);

  async function markOf(symbol: string): Promise<number> {
    const s = streamFor(symbol);
    const m = s?.latestMark(symbol) ?? null;
    if (s !== null && m !== null && !s.isMarkStale(symbol)) return m.price;
    const raw = await botGet(`/fapi/v1/premiumIndex?symbol=${symbol}`);
    const p = parsePremium(Array.isArray(raw) ? raw : [raw])[0];
    if (p === undefined || !(p.markPrice > 0)) throw new Error(`không lấy được giá mark ${symbol}`);
    if (p.nextFundingTime > 0 && !nextFunding.has(symbol)) nextFunding.set(symbol, p.nextFundingTime);
    noteRate(symbol, p.lastFundingRate);
    return p.markPrice;
  }

  // Giờ chốt funding kế tiếp của mã (premiumIndex) — mốc cho chốt chặn funding
  async function loadNextFunding(symbol: string): Promise<void> {
    try {
      const raw = await botGet(`/fapi/v1/premiumIndex?symbol=${symbol}`);
      const p = parsePremium(Array.isArray(raw) ? raw : [raw])[0];
      if (p !== undefined && p.nextFundingTime > 0) nextFunding.set(symbol, p.nextFundingTime);
      if (p !== undefined) noteRate(symbol, p.lastFundingRate);
    } catch (e) {
      log(`premiumIndex ${symbol}: ${errText(e)}`);
    }
  }

  function execCtx(positions: readonly ExPosition[]) {
    return {
      orders, journal, runId: deps.runId, pass: pass++ % 1000, positions, filters,
      notify: (a: { level: AlertLevel; symbol: string | null; text: string }) => notify(a),
      sleep: deps.sleep,
      resyncClock: () => deps.syncClock(), // nghĩa vụ B6: lệch giờ giữa lượt → đồng bộ lại rồi cứu lệnh dừng
    };
  }

  async function fetchState(extra: readonly string[] = []): Promise<FetchedState | null> {
    const active = activeTrades();
    const fillsSince = new Map<string, number>();
    for (const t of active) fillsSince.set(t.symbol, Math.min(fillsSince.get(t.symbol) ?? Infinity, t.createdAt));
    try {
      return await fetchExchangeState(deps.api, { symbols: [...new Set([...active.map((t) => t.symbol), ...extra])], fillsSince, now: deps.now() });
    } catch (e) {
      lastError = errText(e);
      log(`Không đọc được trạng thái sàn: ${lastError}`);
      if (e instanceof StateFetchError && e.kind === 'banned') setBanned(lastError);
      return null;
    }
  }

  async function reconcileOnce(label: string): Promise<ExecReport | null> {
    if (isBanned()) { log(`Bỏ qua đối chiếu (${label}): đang bị chặn tới ${new Date(bannedUntil).toISOString()}`); return null; }
    const f = await fetchState();
    if (f === null) return null;
    lastFetched = f;
    const active = activeTrades();
    const need = [...new Set([...f.ex.positions.map((p) => p.symbol), ...active.map((t) => t.symbol)])];
    const markPrices: Record<string, number> = {};
    for (const s of need) {
      try {
        markPrices[s] = await markOf(s);
      } catch (e) {
        // Thiếu giá mark mà vẫn đối chiếu thì reconcile sẽ đóng khẩn vị thế → dừng lượt, báo, chờ lượt sau
        notify({ level: 'urgent', symbol: s, text: `KHẨN ${s}: không lấy được giá mark (${errText(e)}) — hoãn đối chiếu` });
        return null;
      }
    }
    const prev = journal.state().positions;
    const snap = f.ex.positions.map((p) => `${p.symbol}:${p.positionAmt}`).sort().join(',');
    if (snap !== Object.values(prev).map((p) => `${p.symbol}:${p.positionAmt}`).sort().join(',')) journal.append({ type: 'position_snapshot', positions: f.ex.positions });
    const actions = reconcile(active, f.ex, { now: deps.now(), markPrices, filters, capital: capitalOf(f.equity) });
    const work = actions.filter((a) => a.type !== 'alert').length;
    const rep = await executeActions(actions, execCtx(f.ex.positions));
    for (const s of rep.blockedSymbols) blocked.add(s);
    if (rep.halted !== null) {
      if (rep.halted.kind === 'banned') setBanned(rep.halted.reason);
      else notify({ level: 'urgent', symbol: null, text: `KHẨN lệch giờ với sàn giữa lượt đối chiếu: ${rep.halted.reason}` });
    }
    log(`Đối chiếu #${pass} (${label}): vị thế ${f.ex.positions.length}, lệnh theo dõi ${active.length}, hành động ${work}, đã làm ${rep.done}${rep.unprotected.length > 0 ? `, CHƯA BẢO VỆ: ${rep.unprotected.join(', ')}` : ''} | vốn ${f.equity.toFixed(2)} USDT`);
    for (const t of active) if (!nextFunding.has(t.symbol) && f.ex.positions.some((p) => p.symbol === t.symbol)) await loadNextFunding(t.symbol);
    logStopLatency();
    await afterPass(f);
    await updateWatch();
    journal.maybeSnapshot();
    return rep;
  }

  // Độ trễ khớp vào → SL được sàn nhận (đo ở cuối lượt đối chiếu đã đặt SL; cận trên) — đo được ngân sách postFillStopBudgetMs
  function logStopLatency(): void {
    for (const t of activeTrades()) {
      if (slLatencyLogged.has(t.signalId) || t.createdAt < startedAt || t.legs.SL?.status !== 'open') continue;
      const first = t.fills.filter((x) => x.role === 'E1' || x.role === 'E2').reduce((m, x) => Math.min(m, x.time), Infinity);
      if (!Number.isFinite(first)) continue;
      slLatencyLogged.add(t.signalId);
      const ms = Math.max(0, deps.now() - first);
      log(`khớp→SL ${t.symbol}: ${ms} ms (ngân sách ${COMMON.bot.postFillStopBudgetMs} ms)`);
      journal.append({ type: 'note', text: `khớp→SL ${t.symbol} ${t.signalId}: ${ms} ms` });
    }
  }

  // Sau mỗi lượt: kết quả lệnh vừa đóng (userTrades/income), đỉnh vốn + vốn đầu ngày UTC, cầu chì, tóm tắt ngày
  async function afterPass(f: FetchedState): Promise<void> {
    const now = deps.now();
    for (const t of Object.values(journal.state().trades)) {
      if (t.status !== 'closed' || t.outcomeRecorded === true || !t.fills.some((x) => x.role === 'E1' || x.role === 'E2')) continue;
      try {
        const rows = await fetchTradeHistory(deps.api, t.symbol, t.createdAt, now);
        const income = parseIncome(await getOk(deps.api, '/fapi/v1/income', { symbol: t.symbol, incomeType: 'FUNDING_FEE', startTime: t.createdAt, endTime: now, limit: 1000 }))
          .reduce((s, r) => s + r.income, 0);
        const pnl = rows.reduce((s, r) => s + r.realizedPnl - r.commission, 0) + income;
        const closedAt = rows.reduce((m, r) => Math.max(m, r.fill.time), t.createdAt);
        journal.append({ type: 'trade_outcome', outcome: { signalId: t.signalId, symbol: t.symbol, side: t.side, closedAt, realizedPnl: pnl, pastTp1: t.tp1Filled } });
        const lastPx = rows[rows.length - 1]?.fill.price ?? NaN;
        if (t.mode === 'btc-regime') {
          const d = journal.state().btcRegime;
          const why = regimeExiting.has(t.signalId) || (d?.action === 'exit' && d.signalId === t.signalId) ? 'tín hiệu tắt: giá đóng 1D ≤ SMA50' : 'chạm dừng lỗ trên sàn hoặc đóng khẩn';
          const a = tgAlerts.regimeClosed({ symbol: t.symbol, price: lastPx, pnlUsdt: pnl, why });
          notify({ level: a.level, symbol: t.symbol, text: a.text });
          regimeExiting.delete(t.signalId);
          continue;
        }
        const a = t.tp1Filled ? tgAlerts.trailingClosed({ symbol: t.symbol, side: t.side, price: lastPx, pnlUsdt: pnl }) : tgAlerts.stopLossHit({ symbol: t.symbol, side: t.side, price: lastPx, pnlUsdt: pnl });
        notify({ level: a.level, symbol: t.symbol, text: `${a.text} (lệnh ${t.closedReason ?? 'đã đóng'})` });
      } catch (e) {
        log(`Không tính được kết quả lệnh ${t.signalId}: ${errText(e)}`);
      }
    }
    // Đỉnh vốn / vốn đầu ngày UTC (nghĩa vụ B6): bền qua khởi động lại trong nhật ký
    const eq = f.equity;
    const today = isoDay(now);
    const e = journal.state().equity;
    if (e === null) journal.append({ type: 'equity', peak: eq, day: today, dayStartEquity: eq });
    else if (e.day !== today) {
      dailySummary(e.day, eq);
      journal.append({ type: 'equity', peak: Math.max(e.peak, eq), day: today, dayStartEquity: eq });
    } else if (eq > e.peak * 1.001) journal.append({ type: 'equity', peak: eq, day: e.day, dayStartEquity: e.dayStartEquity });
    const cur = journal.state().equity!;
    const ev = evaluateProtections({
      now, state: journal.state().protections, outcomes: journal.state().outcomes, dayStartEquity: cur.dayStartEquity, equity: eq, equityPeak: Math.max(cur.peak, eq),
      ...(deps.liveCaps !== null ? { maxDailyLossPct: deps.liveCaps.maxDailyLossPct } : {}),
    });
    lastDayLossPct = ev.dayLossPct;
    for (const x of ev.events) journal.append(x);
    for (const a of ev.alerts) notify({ level: a.level, symbol: null, text: a.text });
  }

  function dailySummary(day: string, equity: number): void {
    const start = Date.parse(`${day}T00:00:00Z`);
    const closed = journal.state().outcomes.filter((o) => o.closedAt >= start && o.closedAt < start + 86_400_000);
    const a = tgAlerts.dailySummary({ day, trades: closed.length, wins: closed.filter((o) => o.realizedPnl > 0).length, pnlUsdt: closed.reduce((s, o) => s + o.realizedPnl, 0), equity, openCount: activeTrades().length });
    notify({ level: 'info', symbol: null, text: a.text });
  }

  // ---- Luồng theo dõi: mã có lệnh/vị thế/lệnh mở + ứng viên đang chờ vào ----
  let watchChain: Promise<void> = Promise.resolve();
  function updateWatch(): Promise<void> {
    const p = watchChain.then(updateWatchNow, updateWatchNow);
    watchChain = p.catch((e: unknown) => log(`Luồng theo dõi lỗi: ${errText(e)}`));
    return watchChain;
  }
  async function updateWatchNow(): Promise<void> {
    if (!started || stopping) return;
    const want = new Set<string>([...activeTrades().map((t) => t.symbol), ...pinned]);
    for (const p of lastFetched?.ex.positions ?? []) want.add(p.symbol);
    for (const o of lastFetched?.ex.openOrders ?? []) want.add(o.symbol);
    for (const s of [...want]) if (!contracts.has(s)) want.delete(s);
    if (want.size === watchSet.size && [...want].every((s) => watchSet.has(s))) return;
    watch?.stop();
    watch = null;
    watchSet = want;
    if (want.size === 0) { trace('watch:'); return; }
    const symbols = [...want].sort();
    const ivs = [...intervals.keys()];
    const s = deps.createMarketStream({ symbols, intervals: ivs, onEvent: (e) => { void onMarketEvent('watch', e); } });
    for (const sym of symbols) for (const iv of ivs) await seedFromRest(s, sym, iv);
    s.start();
    watch = s;
    trace(`watch:${symbols.join(',')}`);
    log(`Luồng theo dõi: ${symbols.join(', ')}`);
  }

  async function lastClosedRest(symbol: string, interval: string): Promise<Candle | null> {
    const rows = parseKlines(await botGet(`/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=3`), deps.now());
    return rows[rows.length - 1] ?? null;
  }
  async function seedFromRest(s: MarketStreamLike, symbol: string, interval: string): Promise<number | null> {
    try {
      const c = await lastClosedRest(symbol, interval);
      if (c !== null) s.seedLastClosed(symbol, interval, c.closeTime);
      return c?.closeTime ?? null;
    } catch (e) {
      log(`Không lấy được mốc nến ${symbol} ${interval} qua REST: ${errText(e)}`);
      return null;
    }
  }

  // ---- Sự kiện luồng thị trường ----
  async function onMarketEvent(source: 'trigger' | 'watch', e: MarketEvent): Promise<void> {
    if (stopping) return;
    if (e.type === 'backfill_required') {
      await backfill(source, e.symbol, e.interval, e.fromOpenTime);
      return;
    }
    if (deps.paper !== null && source === 'watch' && watchSet.has(e.symbol)) feedPaperKline(e.symbol, e.candle);
    await requestReconcile('nến đóng'); // nghĩa vụ B7: LIMIT khớp theo nến có thể sinh vị thế chưa có dừng → đối chiếu ngay sau mỗi nến
    if (source === 'trigger' && e.symbol === TRIGGER && intervals.has(e.interval) && e.candle.closeTime > (lastProcessed.get(e.interval) ?? -Infinity)) {
      await decide(e.interval, e.candle.closeTime);
    }
  }

  function feedPaperKline(symbol: string, c: Candle): void {
    const last = deps.paper!.lastPriceTime(symbol);
    if (last !== null && c.openTime <= last) return; // đã xét bằng mark/nến trước đó
    try { deps.paper!.feedKline(symbol, c); } catch (e) { log(`paper nến ${symbol}: ${errText(e)}`); }
  }

  async function backfill(source: 'trigger' | 'watch', symbol: string, interval: string, from: number): Promise<void> {
    log(`Luồng ${source} báo hụt nến ${symbol} ${interval} từ ${new Date(from).toISOString()} — nạp bù qua REST`);
    try {
      const rows = parseKlines(await botGet(`/fapi/v1/klines?symbol=${symbol}&interval=${interval}&startTime=${from}&limit=1000`), deps.now());
      if (deps.paper !== null && source === 'watch') for (const c of rows) feedPaperKline(symbol, c);
    } catch (e) {
      log(`Nạp bù nến ${symbol} ${interval} lỗi: ${errText(e)}`);
    }
    await requestReconcile('nến bù');
  }

  // ---- Quyết định mỗi nến khung vào lệnh ----
  // Quyết định chạy LẦN LƯỢT (mốc 4H: Lướt nhanh rồi Swing hoặc ngược lại, không quét đồng thời trên cùng ngân sách IP)
  let decisionChain: Promise<void> = Promise.resolve();
  function decide(interval: string, closeTime: number): Promise<void> {
    lastProcessed.set(interval, closeTime);
    decisionChain = decisionChain.then(() => decideNow(interval, closeTime));
    return decisionChain;
  }
  const fundingGuardHealthy = () => fundingBlocked.size === 0;
  async function decideNow(interval: string, closeTime: number): Promise<void> {
    for (const m of intervals.get(interval) ?? []) {
      if (m === 'btc-regime') {
        await regimeDecide(`nến 1D đóng ${new Date(closeTime + 1).toISOString()}`).catch((e: unknown) => {
          lastError = `btc-regime: ${errText(e)}`;
          log(`LỖI ${lastError}`);
          if (BAN_RE.test(errText(e))) setBanned(lastError);
        });
        continue;
      }
      try {
        // F1: đệm 'expected' chỉ an toàn khi chốt chặn funding đang chạy ĐƯỢC → chốt chặn hỏng thì lần quét/vào lệnh này dùng 'max'
        if (COMMON.risk.fundingBufferHorizon === 'expected' && !fundingGuardHealthy()) {
          log(`Chốt chặn funding đang lỗi (${[...fundingBlocked].join(', ')}) — quét ${m} dùng đệm funding "max" thay cho "expected"`);
          await withConfigOverride({ 'COMMON.risk.fundingBufferHorizon': 'max' }, () => runDecision(m, closeTime));
        } else await runDecision(m, closeTime);
      } catch (e) {
        lastError = `quét ${m}: ${errText(e)}`;
        log(`LỖI ${lastError}`);
        if (BAN_RE.test(errText(e))) setBanned(lastError);
      }
    }
  }

  function portfolio(): OpenTrade[] {
    return activeTrades().map((t) => ({ symbol: t.symbol, side: t.side, notional: t.notional ?? 0, leverage: t.plan.leverage, riskAmount: t.riskAmount ?? 0, pastTp1: t.tp1Filled }));
  }

  async function klinesRest(symbol: string, interval: string, limit: number): Promise<Candle[]> {
    return parseKlines(await deps.publicGet(`/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`), deps.now());
  }

  async function runDecision(mode: Mode, closeTime: number): Promise<void> {
    trace(`decision:${mode}`);
    if (isBanned()) { log(`Bỏ qua quét ${mode}: đang bị chặn`); return; }
    if (lastFetched === null) { log(`Bỏ qua quét ${mode}: chưa đọc được vốn từ sàn`); return; }
    const now = deps.now();
    const capital = capitalOf(lastFetched.equity);
    const t0 = now;
    const tickers = parseTickers(await deps.publicGet('/fapi/v1/ticker/24hr'));
    const books = new Map(parseBookTickers(await deps.publicGet('/fapi/v1/ticker/bookTicker')).map((b) => [b.symbol, b]));
    const premiums = new Map(parsePremium(await deps.publicGet('/fapi/v1/premiumIndex')).map((p) => [p.symbol, p]));
    const prefix = `${mode}|`;
    const prevSignals = new Map([...journal.prevSignalsMap()].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));
    const loader = createFundingMaxAbsLoader({ get: deps.publicGet, now });
    // Luật mới (mặc định tắt): FGI-hướng — lỗi tải → không vào lệnh Swing mới; bỏ hợp đồng đã có lịch tất toán khỏi vũ trụ quét
    const fgi = COMMON.entryRules.fgiDirection === null ? undefined
      : deps.fetchJson === undefined ? { side: null, reason: 'bot chưa có nguồn tải FGI (deps.fetchJson)' }
        : await fetchFgiDecision({ fetchJson: deps.fetchJson, now, log });
    const uni = liveUniverse([...contracts.values()]);
    if (uni.skipped.length > 0) log(`Bỏ khỏi vũ trụ quét (đã có lịch tất toán/hủy niêm yết): ${uni.skipped.join(', ')}`);
    const scan = await scanFn({
      mode, contracts: uni.kept, tickers, ...(fgi !== undefined ? { fgi } : {}), books, premiums, fundingIntervals, now, events: deps.events, capital, limit: deps.scanLimit,
      openTrades: portfolio(), prevSignals, ...(brackets !== undefined ? { leverageBrackets: brackets } : {}), fundingMaxAbsLoader: loader,
      klines: (s, i, l) => klinesRest(s, i, l),
    });
    if (scan.banned) setBanned(`quét ${mode}: ${scan.errors[scan.errors.length - 1]?.error ?? ''}`);
    const current = new Map<string, SignalIdentity | null>();
    for (const a of scan.results) current.set(`${prefix}${a.symbol}`, a.signal);
    journal.recordSignals(current); // hysteresis/luật đảo chiều (advanceSignalState) theo từng chế độ
    const dat = scan.results.filter((a) => a.label.startsWith('Đạt'));
    log(`Quét ${mode} (nến ${new Date(closeTime + 1).toISOString()}): ${scan.results.length} mã chấm, Đạt ${dat.length}, Hạng A MỚI ${dat.filter((a) => a.grade?.grade === 'A' && a.signal?.fresh).length}, lỗi ${scan.errors.length}, ${((deps.now() - t0) / 1000).toFixed(0)} s`);
    for (const w of scan.warnings) log(`CẢNH BÁO quét: ${w}`);
    const picks: Array<{ a: Analysis; plan: PlannerPlan }> = [];
    for (const a of scan.results) {
      if (!a.label.startsWith('Đạt')) continue;
      const p = (a.patternSignal ?? a.plan) as PlannerPlan | null;
      if (p === null || a.signal === null) continue;
      const why = !a.signal.fresh ? 'không MỚI' : a.grade?.grade !== 'A' ? 'không phải Hạng A' : scan.entryBlocks.has(a.symbol) ? `luật vào lệnh: ${scan.entryBlocks.get(a.symbol)}`
        : journal.hasSignal(a.signal.id) ? 'tín hiệu đã nhận trước đó' : activeTrades().some((t) => t.symbol === a.symbol) || lastFetched?.ex.positions.some((x) => x.symbol === a.symbol) ? 'mã đang có lệnh/vị thế'
          : blocked.has(a.symbol) ? 'mã đang bị khóa (vị thế lạ)' : fundingBlocked.has(a.symbol) ? 'chốt chặn funding của mã đang lỗi' : null;
      if (why !== null) { log(`${a.symbol} ${mode}: bỏ qua — ${why}`); continue; }
      picks.push({ a, plan: p });
    }
    if (picks.length === 0 || stopping) return;
    // Chuẩn bị (chờ dữ liệu mới, REST, planner) NGOÀI hàng đợi đối chiếu; chỉ đoạn gửi lệnh nằm trong hàng đợi (tryEntry)
    for (const pk of picks) {
      try {
        await tryEntry(mode, pk.a, pk.plan, scan, capital);
      } catch (e) {
        lastError = `vào lệnh ${pk.a.symbol}: ${errText(e)}`;
        log(`LỖI ${lastError}`);
        if (BAN_RE.test(errText(e))) setBanned(lastError);
      }
    }
  }

  async function fundingHistory(symbol: string, now: number): Promise<Array<{ fundingTime: number; fundingRate: number; markPrice: number }>> {
    const from = now - COMMON.risk.fundingBufferLookbackDays * 86_400_000;
    const raw = await deps.publicGet(`/fapi/v1/fundingRate?symbol=${symbol}&startTime=${from}&endTime=${now}&limit=1000`);
    if (!Array.isArray(raw)) throw new Error('fundingRate: không phải mảng');
    return raw.map((x) => {
      const o = x as Record<string, unknown>;
      const ft = Number(o.fundingTime);
      const fr = Number(o.fundingRate);
      if (!Number.isFinite(ft) || !Number.isFinite(fr)) throw new Error(`fundingRate ${symbol}: dòng hỏng`);
      const mp = Number(o.markPrice);
      return { fundingTime: ft, fundingRate: fr, markPrice: Number.isFinite(mp) ? mp : 0 };
    });
  }

  async function ensureFresh(symbol: string, interval: string): Promise<boolean> {
    pinned.add(symbol);
    await updateWatch();
    const deadline = deps.now() + freshWaitMs;
    for (;;) {
      const s = streamFor(symbol);
      if (s !== null && !s.isMarkStale(symbol) && !s.isKlineStale(symbol, interval) && s.latestMark(symbol) !== null) return true;
      if (deps.now() >= deadline) return false;
      await deps.sleep(500);
    }
  }

  // protections.checkEntry với trạng thái HIỆN TẠI (cầu chì, lệnh vừa đóng, danh mục) — gọi lúc chuẩn bị VÀ ngay trước khi gửi lệnh
  function protectionGate(mode: Mode, a: Analysis, p: PlannerPlan, contract: Contract, maxNotional: number, capital: number) {
    const sym = a.symbol;
    return checkEntry({
      now: deps.now(), barMs: intervalMs(CONFIG[mode].entryInterval), signal: { symbol: sym, side: p.side, grade: a.grade?.grade ?? null, fresh: a.signal!.fresh },
      protections: journal.state().protections, recentCloses: journal.state().outcomes,
      newTrade: { symbol: sym, side: p.side, entry: p.entry, stop: p.stop, qty: p.qty, leverage: p.suggestedLeverage, costPct: p.costPct, entryType: p.entryType === 'limit' ? 'limit' : 'market', filters: contract, maxNotional },
      openTrades: portfolio(), capital, ...(deps.liveCaps !== null ? { liveCaps: deps.liveCaps } : {}),
    });
  }

  async function tryEntry(mode: Mode, a: Analysis, p: PlannerPlan, scan: ScanResult, capital: number): Promise<void> {
    const sym = a.symbol;
    const sid = a.signal!.id;
    if (stopping) { log(`${sym} ${mode}: bot đang tắt — không vào lệnh`); return; }
    const contract = contracts.get(sym);
    if (contract === undefined) { log(`${sym}: không có bộ lọc sàn — bỏ`); return; }
    // Nghĩa vụ B6: tạm dừng người dùng (/dung) KHÔNG nằm trong BLOCKING của checkEntry → kiểm TRƯỚC
    if (tg.isPaused()) { trace(`entry:paused ${sym}`); log(`${sym} ${mode}: KHÔNG vào lệnh — người dùng đang tạm dừng (/dung)`); return; }
    const h1 = (await klinesRest(sym, '1h', COMMON.slippage.volumeBars1h + 1)).slice(-COMMON.slippage.volumeBars1h);
    const vol1m = h1.length === 0 ? NaN : h1.reduce((s, c) => s + c.quoteVolume, 0) / h1.length / 60;
    if (!(vol1m > 0)) { log(`${sym}: không ước được khối lượng 1 phút — bỏ`); return; }
    const maxNotional = COMMON.slippage.maxParticipation * vol1m;
    trace(`entry:checkEntry ${sym}`);
    const ce = protectionGate(mode, a, p, contract, maxNotional, capital);
    if (!ce.allowed) { trace(`entry:protections ${sym}`); log(`${sym} ${mode}: KHÔNG vào lệnh (protections) — ${ce.reasons.join('; ')}`); return; }
    // Nghĩa vụ B8a: cổng vào lệnh cần CẢ !isMarkStale và !isKlineStale (khung vào lệnh)
    const iv = CONFIG[mode].entryInterval;
    if (!(await ensureFresh(sym, iv))) {
      pinned.delete(sym);
      trace(`entry:stale ${sym}`);
      log(`${sym} ${mode}: KHÔNG vào lệnh — dữ liệu cũ (giá mark hoặc nến ${iv} không cập nhật trong ${freshWaitMs / 1000} s)`);
      return;
    }
    try {
      const mark = await markOf(sym); // I3: giá mark MỚI ngay trước khi lập lệnh
      const now = deps.now();
      const intervalHours = fundingIntervals.get(sym) ?? COMMON.defaultFundingIntervalHours;
      let rows: Array<{ fundingTime: number; fundingRate: number }> = [];
      let maxAbsRate: number;
      try {
        rows = await fundingHistory(sym, now);
        const m = maxAbsFundingRate(rows, now);
        noteRate(sym, m);
        maxAbsRate = m > 0 ? m : fundingFallbackRate(intervalHours);
        if (!(m > 0)) log(`${sym}: lịch sử funding ${COMMON.risk.fundingBufferLookbackDays} ngày rỗng/toàn 0 → đệm thận trọng ${maxAbsRate}`);
      } catch (e) {
        if (BAN_RE.test(errText(e))) throw e;
        maxAbsRate = fundingFallbackRate(intervalHours); // không bao giờ dùng 0
        log(`${sym}: không tải được lịch sử funding (${errText(e)}) → đệm thận trọng ${maxAbsRate}`);
      }
      const tier = tierOf(scan.ranks.get(sym) ?? 1);
      let breakout: { closeAboveDonchian: boolean } | undefined;
      if (COMMON.breakout.enabled && (p.targets[0]?.price ?? null) === null) {
        const ok = donchianBreakout(await klinesRest(sym, '1d', COMMON.breakout.donchianDays + 2), COMMON.breakout.donchianDays);
        if (ok !== null) breakout = { closeAboveDonchian: ok };
      }
      // risk-cluster (COMMON.portfolio.cluster): nến 1D đã đóng của mã này + mã đang mở + BTC; tải lỗi → không vào lệnh (fail closed)
      const clusterDaily = await fetchClusterDaily(sym, portfolio(), (s, limit) => klinesRest(s, '1d', limit), log, (e) => BAN_RE.test(errText(e)));
      if (clusterDaily === null) { trace(`entry:cluster-data ${sym}`); return; }
      const openOrderCount = (lastFetched?.ex.openOrders.filter((o) => o.symbol === sym).length ?? 0) + (lastFetched?.ex.openAlgoOrders.filter((o) => o.symbol === sym).length ?? 0);
      const pr = planOrders({
        plan: p, grade: a.grade?.grade ?? null, signal: { id: sid, fresh: a.signal!.fresh }, mode, contract, capital, openTrades: portfolio(), openOrderCount,
        maxNotional, markPrice: mark, runId: deps.runId, now, ...(brackets !== undefined ? { leverageBrackets: brackets.get(sym) ?? [] } : {}),
        costModel: { tierPct: COMMON.costRoundTripPct[tier], quoteVolPerMin: vol1m },
        fundingBuffer: { maxAbsRate, intervalHours }, fundingMeanRate: meanFundingRate(rows, now),
        ...(breakout !== undefined ? { breakout } : {}),
        ...(clusterDaily !== undefined ? { clusterDaily } : {}),
      });
      if (!pr.allowed || pr.sizing === null) { trace(`entry:planner ${sym}`); log(`${sym} ${mode}: planner từ chối — ${pr.reasons.join('; ')}`); return; }
      await serial(`vào lệnh ${sym}`, () => placeEntry(mode, a, p, pr, capital, tier, vol1m, contract, maxNotional));
    } finally {
      pinned.delete(sym);
    }
  }

  // Đoạn gửi lệnh (trong hàng đợi tuần tự): kiểm lại → ISOLATED + đòn bẩy → nhận tín hiệu → lệnh vào → đối chiếu ngay
  async function placeEntry(mode: Mode, a: Analysis, p: PlannerPlan, pr: ReturnType<typeof planOrders>, capital: number, tier: keyof typeof COMMON.costRoundTripPct, vol1m: number,
    contract: Contract, maxNotional: number): Promise<void> {
    const sym = a.symbol;
    const sid = a.signal!.id;
    const now = deps.now();
    if (pr.sizing === null) return;
    // /dung có thể tới trong lúc chờ dữ liệu mới / REST → kiểm lại NGAY trước khi gửi
    if (stopping) { log(`${sym} ${mode}: bot đang tắt — không vào lệnh`); return; }
    if (tg.isPaused()) { trace(`entry:paused-late ${sym}`); log(`${sym} ${mode}: KHÔNG vào lệnh — người dùng vừa tạm dừng (/dung)`); return; }
    // TOÀN BỘ cổng lại một lần nữa (rà soát lại vòng 1): lượt đối chiếu chạy song song lúc chuẩn bị có thể đã nhảy cầu chì / đổi danh mục
    const late: string[] = [];
    if (journal.hasSignal(sid) || activeTrades().some((t) => t.symbol === sym)) late.push('mã vừa có lệnh');
    if (fundingBlocked.has(sym)) late.push('chốt chặn funding của mã đang lỗi');
    const s = streamFor(sym);
    const iv = CONFIG[mode].entryInterval;
    if (s === null || s.isMarkStale(sym) || s.isKlineStale(sym, iv)) late.push(`dữ liệu cũ (giá mark hoặc nến ${iv})`);
    const ce = protectionGate(mode, a, p, contract, maxNotional, capital);
    if (!ce.allowed) late.push(...ce.reasons);
    if (late.length > 0) { trace(`entry:gate-late ${sym}`); log(`${sym} ${mode}: KHÔNG vào lệnh (kiểm lại ngay trước khi gửi) — ${late.join('; ')}`); return; }
    {
      // R12: ISOLATED + đòn bẩy cho cặp trước khi vào lệnh
      const mt = await orders.setMarginTypeIsolated(sym);
      if (mt.kind !== 'ok') { notify({ level: 'warn', symbol: sym, text: `${sym}: không đặt được ISOLATED (${mt.kind} ${mt.msg}) — bỏ lệnh` }); return; }
      const lv = await orders.setLeverage(sym, pr.sizing.leverage);
      if (lv.kind !== 'ok') { notify({ level: 'warn', symbol: sym, text: `${sym}: không đặt được đòn bẩy ${pr.sizing.leverage}x (${lv.kind} ${lv.msg}) — bỏ lệnh` }); return; }
      deps.setPaperCost?.(sym, { tierPct: COMMON.costRoundTripPct[tier], impactPct: COMMON.slippage.pctPerParticipation, vol1m });
      const trade: TradeState = {
        ...tradeFromPlan({ signalId: sid, runId: deps.runId, now, result: pr, costPct: pr.sizing.costPct }),
        equityAtEntry: capital, riskAmount: pr.sizing.riskAmount, notional: pr.sizing.notional, mode,
      };
      journal.append({ type: 'signal_accepted', trade });
      trace(`entry:accepted ${sym}`);
      await sendEntryLegs(sym, sid, pr.legs);
      const s = pr.sizing;
      const msg = tgAlerts.entryPlaced({ symbol: sym, side: p.side, entry: s.worstEntry, stop: trade.plan.stop, tp1: trade.plan.tp1, qty: s.qty, riskUsdt: s.riskAmount });
      notify({ level: msg.level, symbol: sym, text: msg.text });
      await reconcileLoop(['sau vào lệnh']); // R2: khớp → SL lên sàn NGAY
    }
  }

  // Gửi các chân vào lệnh (ghi ý định TRƯỚC, kết quả SAU) — dùng chung Swing và btc-regime
  async function sendEntryLegs(sym: string, sid: string, legs: ReturnType<typeof planOrders>['legs']): Promise<void> {
    for (const leg of legs) {
      if (leg.op !== 'placeEntry') continue;
      journal.append({ type: 'order_intent', op: 'place', symbol: sym, signalId: sid, role: leg.role, clientId: leg.clientId, attempt: 0, qty: leg.input.qty, triggerPrice: null });
      const r = await orders.placeEntry(leg.input);
      const body = r.body as Record<string, unknown> | null;
      journal.append({
        type: 'order_result', op: 'place', symbol: sym, signalId: sid, role: leg.role, clientId: leg.clientId, kind: r.kind, sent: r.sent,
        orderId: typeof body?.orderId === 'number' ? body.orderId : null, code: r.code, msg: r.msg,
      });
      log(`${sym}: lệnh vào ${leg.role} ${leg.input.kind}${'ioc' in leg.input && leg.input.ioc ? ' IOC' : ''} ${leg.input.qty} → ${r.kind}${r.code !== null ? ` (${r.code})` : ''}`);
      if (r.kind === 'banned') { setBanned(`lệnh vào ${sym}: ${r.msg}`); break; }
    }
  }

  // ---- Hệ BTC theo chế độ (btc-regime) — quyết định ngày ----
  const REGIME_SYM = COMMON.btcRegime.symbol;
  const regimeExiting = new Set<string>(); // lệnh btc-regime đang được đóng theo tín hiệu (tin Telegram lúc đóng ghi đúng lý do)
  const regimeTrade = (): TradeState | undefined => activeTrades().find((t) => t.mode === 'btc-regime' && t.symbol === REGIME_SYM);

  // Lỡ quyết định (máy tắt qua 00:00 UTC, REST lỗi lúc đóng nến): nến 1D đóng cuối chưa có quyết định trong nhật ký → quyết định ngay.
  // Không gọi REST khi nhật ký đã có quyết định cho nến đóng cuối (một lần gọi klines mỗi ngày), hoặc đang chờ lần thử IOC kế tiếp.
  function regimeCatchUp(label: string): Promise<void> {
    if (!modes.includes('btc-regime') || stopping) return Promise.resolve();
    const now = deps.now();
    const expected = Math.floor(now / DAY) * DAY - 1;
    const last = journal.state().btcRegime?.closeTime ?? -Infinity;
    if (last >= expected) return Promise.resolve();
    const at = journal.state().btcRegimeAttempts;
    if (at !== null && at.closeTime === expected && now < at.lastAt + COMMON.btcRegime.entryRetryMinutes * MIN) return Promise.resolve();
    decisionChain = decisionChain.then(() => regimeDecide(label)).catch((e: unknown) => {
      lastError = `btc-regime: ${errText(e)}`;
      log(`LỖI ${lastError}`);
      if (BAN_RE.test(errText(e))) setBanned(lastError);
    });
    return decisionChain;
  }

  function recordRegime(sig: Extract<RegimeSignal, { ok: true }>, action: string, note: string, signalId: string | null): void {
    journal.append({ type: 'btc_regime_decision', decision: { closeTime: sig.closeTime, want: sig.want, action, note, close: sig.close, sma: sig.sma, atr: sig.atr, signalId } });
    const day = isoDay(sig.closeTime - DAY + 1);
    log(`btc-regime nến ${day}: đóng ${sig.close} ${sig.want === 'long' ? '>' : '≤'} SMA${COMMON.btcRegime.smaDays} ${sig.sma.toFixed(2)}, ATR${COMMON.btcRegime.atrDays} ${sig.atr.toFixed(2)} → ${action}: ${note}`);
    const a = tgAlerts.regimeDecision({ day, close: sig.close, sma: sig.sma, want: sig.want, action: note });
    notify({ level: a.level, symbol: REGIME_SYM, text: a.text });
  }

  // Một quyết định ngày: dùng nến 1D ĐÃ ĐÓNG mới nhất (REST, một lần gọi). Lỗi tạm (REST, chưa có vốn, bị chặn) → KHÔNG ghi quyết định
  // (lượt định kỳ thử lại); đã ghi quyết định cho nến này → bỏ qua.
  async function regimeDecide(label: string): Promise<void> {
    trace('decision:btc-regime');
    if (stopping) return;
    if (isBanned()) { log(`Bỏ qua quyết định btc-regime (${label}): đang bị chặn`); return; }
    if (lastFetched === null) { log(`Bỏ qua quyết định btc-regime (${label}): chưa đọc được vốn từ sàn — thử lại ở lượt định kỳ`); return; }
    const now = deps.now();
    const R = COMMON.btcRegime;
    const candles = await klinesRest(REGIME_SYM, '1d', R.klinesLimit);
    const sig = regimeSignal(candles, now);
    if (!sig.ok) {
      trace('btc-regime:no-data');
      notify({ level: 'warn', symbol: REGIME_SYM, text: `BTC theo chế độ (${label}): thiếu dữ liệu — ${sig.reason}; KHÔNG hành động (SL trên sàn vẫn bảo vệ), thử lại ở lượt định kỳ` });
      return;
    }
    const prev = journal.state().btcRegime;
    if (prev !== null && sig.closeTime <= prev.closeTime) { log(`btc-regime (${label}): nến đóng ${new Date(sig.closeTime + 1).toISOString()} đã quyết định — bỏ qua`); return; }
    // Vị thế thật NGAY trước khi quyết định (SL có thể vừa chạm)
    await requestReconcile('trước quyết định btc-regime');
    const trade = regimeTrade();
    const pos = lastFetched?.ex.positions.find((p) => p.symbol === REGIME_SYM && p.positionAmt !== 0);
    if (trade !== undefined && pos === undefined) {
      log(`btc-regime: lệnh ${trade.signalId} còn trong nhật ký nhưng sàn không có vị thế — chờ đối chiếu đóng lệnh rồi quyết định ở lượt sau`);
      return;
    }
    const act = regimeAction(sig, trade !== undefined);
    trace(`btc-regime:${act}`);
    if (act === 'hold') return recordRegime(sig, act, 'đang giữ Long — giữ nguyên, SL trên sàn', trade!.signalId);
    if (act === 'stay_flat') return recordRegime(sig, act, 'không có vị thế — đứng ngoài', null);
    if (act === 'exit') {
      const ok = await regimeExit(trade!, sig);
      if (ok) {
        recordRegime(sig, act, `đã đóng Long ${trade!.signalId}`, trade!.signalId);
      } else {
        regimeExiting.delete(trade!.signalId);
        notify({ level: 'urgent', symbol: REGIME_SYM, text: `KHẨN BTC theo chế độ: tín hiệu tắt nhưng CHƯA đóng được vị thế ${REGIME_SYM} — thử lại ở lượt định kỳ; SL trên sàn vẫn bảo vệ` });
      }
      return;
    }
    if (act !== 'enter') return;
    if (pos !== undefined || activeTrades().some((t) => t.symbol === REGIME_SYM)) {
      return recordRegime(sig, 'skip', `KHÔNG vào — ${REGIME_SYM} đang có lệnh/vị thế khác của bot (${pos?.positionAmt ?? 'lệnh chờ'})`, null);
    }
    // Sai khác đã duyệt: IOC không khớp → thử lại sau entryRetryMinutes, tối đa entryMaxAttempts lần, chỉ trong entryWindowHours giờ đầu ngày
    const at = journal.state().btcRegimeAttempts;
    const done = at !== null && at.closeTime === sig.closeTime ? at.count : 0;
    if (done > 0 && now < at!.lastAt + R.entryRetryMinutes * MIN) { log(`btc-regime: chờ lần thử IOC kế tiếp (sau ${new Date(at!.lastAt + R.entryRetryMinutes * MIN).toISOString()})`); return; }
    if (now - (sig.closeTime + 1) > R.entryWindowHours * H) {
      trace('btc-regime:window');
      return recordRegime(sig, 'skip', `KHÔNG vào — ngoài cửa sổ vào lệnh (quá ${R.entryWindowHours} giờ sau 00:00 UTC)${done > 0 ? `; IOC đã không khớp ${done} lần` : ''}`, null);
    }
    const attempt = done + 1;
    const sid = regimeSignalId(sig.closeTime, attempt);
    const r = await regimeEnter(sig, sid);
    if (!r.sent) return recordRegime(sig, 'skip', r.note, sid);
    const result = r.filledQty <= 0 ? 'no_fill' : r.filledQty < r.placedQty ? 'partial' : 'filled';
    journal.append({ type: 'btc_regime_attempt', attempt: { closeTime: sig.closeTime, attempt, at: deps.now(), signalId: sid, placedQty: r.placedQty, filledQty: r.filledQty, result, note: r.note } });
    trace(`btc-regime:attempt${attempt}:${result}`);
    if (result !== 'no_fill') {
      const part = result === 'partial' ? ` (khớp MỘT PHẦN ${r.filledQty}/${r.placedQty})` : '';
      return recordRegime(sig, 'enter', `vào Long ${r.filledQty} BTC${part} — ${r.note}`, sid);
    }
    log(`CẢNH BÁO btc-regime: IOC lần ${attempt}/${R.entryMaxAttempts} KHÔNG khớp (${r.note})`);
    if (attempt >= R.entryMaxAttempts) {
      notify({ level: 'warn', symbol: REGIME_SYM, text: `BTC theo chế độ: IOC không khớp ${R.entryMaxAttempts} lần — bỏ vào lệnh hôm nay, chờ quyết định ngày mai` });
      return recordRegime(sig, 'skip', `KHÔNG vào — IOC không khớp ${R.entryMaxAttempts} lần`, sid);
    }
    notify({ level: 'warn', symbol: REGIME_SYM, text: `BTC theo chế độ: IOC lần ${attempt}/${R.entryMaxAttempts} không khớp (${r.note}) — thử lại sau ${R.entryRetryMinutes} phút` });
  }

  // Khối lượng ĐÃ KHỚP thật của lệnh vào (khớp E1/E2 trong nhật ký sau đối chiếu). Không thấy khớp mà lệnh còn mở và sàn có vị thế → lấy
  // khối lượng vị thế (khớp chưa tới qua userTrades) kèm cảnh báo.
  function regimeFilledQty(sid: string): number {
    const t = journal.state().trades[sid];
    if (t === undefined) return 0;
    const step = t.plan.qtyStep;
    const f = t.fills.filter((x) => x.role === 'E1' || x.role === 'E2').reduce((s, x) => s + x.qty, 0);
    if (f > 0) return Number((Math.round(f / step) * step).toFixed(tickDecimals(step)));
    const p = lastFetched?.ex.positions.find((x) => x.symbol === t.symbol && x.positionAmt !== 0);
    if (t.status !== 'closed' && p !== undefined) {
      log(`CẢNH BÁO btc-regime ${sid}: chưa thấy khớp trong nhật ký nhưng sàn có vị thế ${p.positionAmt} — dùng khối lượng vị thế`);
      return Math.abs(p.positionAmt);
    }
    return 0;
  }

  // Đóng theo tín hiệu: market reduce-only ĐÚNG khối lượng bot đã mở (khớp vào trong nhật ký) — KHÔNG đụng phần thủ công nếu vị thế lớn hơn.
  // true = phần của bot đã đóng (sàn chỉ còn phần thủ công, hoặc không còn vị thế).
  async function regimeExit(t: TradeState, sig: Extract<RegimeSignal, { ok: true }>): Promise<boolean> {
    regimeExiting.add(t.signalId);
    let manual = 0;
    await serial(`đóng ${REGIME_SYM} btc-regime`, async () => {
      const f = await fetchState([REGIME_SYM]);
      if (f === null) return;
      lastFetched = f;
      const p = f.ex.positions.find((x) => x.symbol === REGIME_SYM && x.positionAmt !== 0);
      if (p === undefined) return;
      const step = t.plan.qtyStep;
      const posQty = Math.abs(p.positionAmt);
      let botQty = regimeFilledQty(t.signalId);
      if (!(botQty > 0)) {
        botQty = posQty;
        log(`CẢNH BÁO btc-regime ${t.signalId}: nhật ký không có khớp vào — đóng theo khối lượng vị thế ${posQty}`);
      }
      const qty = Math.min(botQty, posQty);
      if (posQty - botQty > step / 2) {
        manual = Number((posQty - botQty).toFixed(tickDecimals(step)));
        notify({ level: 'urgent', symbol: REGIME_SYM, text: `KHẨN ${REGIME_SYM}: vị thế ${posQty} lớn hơn phần bot mở ${botQty} — có lệnh THỦ CÔNG ${manual}; bot chỉ đóng ${qty}, KHÔNG đụng phần thủ công (xử lý tay; SL closePosition của bot còn trên sàn sẽ đóng cả vị thế nếu chạm)` });
      }
      const rep = await executeActions([{
        type: 'reduce_only', symbol: REGIME_SYM, signalId: t.signalId, side: t.side, qty,
        reason: `btc-regime: giá đóng 1D ${sig.close} ≤ SMA${COMMON.btcRegime.smaDays} ${sig.sma.toFixed(2)} — đóng theo luật`,
      }], execCtx(f.ex.positions));
      if (rep.halted?.kind === 'banned') setBanned(rep.halted.reason);
      if (manual > 0) {
        const f2 = await fetchState([REGIME_SYM]);
        if (f2 !== null) lastFetched = f2;
        const left = Math.abs(f2?.ex.positions.find((x) => x.symbol === REGIME_SYM)?.positionAmt ?? NaN);
        // Phần bot đã đóng → lệnh của bot kết thúc; phần còn lại là vị thế lạ (đối chiếu khóa mã, báo khẩn)
        if (Math.abs(left - manual) <= step / 2) journal.append({ type: 'trade_closed', signalId: t.signalId, reason: `btc-regime: đã đóng phần bot ${qty}, còn vị thế thủ công ${manual}` });
      }
      await reconcileLoop(['sau đóng btc-regime']);
    });
    const left = Math.abs(lastFetched?.ex.positions.find((x) => x.symbol === REGIME_SYM)?.positionAmt ?? 0);
    return left <= manual + t.plan.qtyStep / 2 && journal.state().trades[t.signalId]?.status === 'closed';
  }

  // Một lần thử vào Long theo luật. sent=false: không gửi lệnh (bị chặn — lý do trong note). sent=true: đã gửi IOC, filledQty = khớp thật
  // sau đối chiếu. Lỗi REST/sàn/dữ liệu cũ ném ra → không ghi quyết định/lần thử, lượt định kỳ thử lại (mã tín hiệu chống vào trùng).
  type RegimeEnterResult = { sent: false; note: string } | { sent: true; placedQty: number; filledQty: number; note: string };
  async function regimeEnter(sig: Extract<RegimeSignal, { ok: true }>, sid: string): Promise<RegimeEnterResult> {
    const sym = REGIME_SYM;
    if (journal.hasSignal(sid)) {
      // Lần thử này đã gửi trước đó (tiến trình dừng giữa chừng) → không gửi lại, chỉ đọc kết quả
      const t = journal.state().trades[sid]!;
      return { sent: true, placedQty: t.legs.E1?.qty ?? 0, filledQty: regimeFilledQty(sid), note: 'lần thử đã gửi trước khi khởi động lại' };
    }
    if (tg.isPaused()) { trace('btc-regime:paused'); return { sent: false, note: 'KHÔNG vào — người dùng đang tạm dừng (/dung)' }; }
    if (blocked.has(sym)) return { sent: false, note: 'KHÔNG vào — mã đang bị khóa (vị thế lạ)' };
    if (fundingBlocked.has(sym)) return { sent: false, note: 'KHÔNG vào — chốt chặn funding của mã đang lỗi' };
    const contract = contracts.get(sym);
    if (contract === undefined) return { sent: false, note: `KHÔNG vào — không có bộ lọc sàn ${sym}` };
    // Trần rủi ro: 2% (COMMON) hoặc thấp hơn nếu trần live chặt hơn
    const riskPct = Math.min(COMMON.risk.perTradePct, deps.liveCaps?.riskPerTradePct ?? Infinity);
    try {
      // Dữ liệu cũ thường là tạm thời (luồng đang nối lại) → ném lỗi: KHÔNG ghi quyết định, lượt định kỳ thử lại (mã tín hiệu theo ngày chống vào trùng)
      if (!(await ensureFresh(sym, '1d'))) { trace('btc-regime:stale'); throw new Error(`KHÔNG vào ${sym} — dữ liệu cũ (giá mark hoặc nến 1d không cập nhật trong ${freshWaitMs / 1000} s), thử lại ở lượt định kỳ`); }
      const mark = await markOf(sym);
      const capital = capitalOf(lastFetched!.equity);
      const sz = regimeEntrySizing({ contract, capital, markPrice: mark, atr: sig.atr, riskPct });
      if (!sz.ok) return { sent: false, note: `KHÔNG vào — ${sz.reason}` };
      const gate = () => checkEntry({
        now: deps.now(), barMs: DAY, cooldownBars: 0, signal: { symbol: sym, side: 'long', grade: 'A', fresh: true },
        protections: journal.state().protections, recentCloses: journal.state().outcomes,
        newTrade: { symbol: sym, side: 'long', entry: sz.worstEntry, stop: sz.stop, qty: sz.qty, leverage: 1, costPct: sz.costPct, entryType: 'limit', filters: contract, maxNotional: Infinity },
        openTrades: portfolio(), capital, ...(deps.liveCaps !== null ? { liveCaps: deps.liveCaps } : {}),
      });
      const ce = gate();
      if (!ce.allowed || ce.canOpen === null) { trace('btc-regime:protections'); return { sent: false, note: `KHÔNG vào (protections) — ${ce.reasons.join('; ')}` }; }
      let out: RegimeEnterResult | null = null;
      await serial(`vào lệnh ${sym} btc-regime`, async () => {
        // Kiểm lại NGAY trước khi gửi (lượt đối chiếu/cầu chì/dừng có thể vừa đổi)
        if (stopping) { out = { sent: false, note: 'KHÔNG vào — bot đang tắt' }; return; }
        if (tg.isPaused()) { out = { sent: false, note: 'KHÔNG vào — người dùng vừa tạm dừng (/dung)' }; return; }
        if (journal.hasSignal(sid) || activeTrades().some((t) => t.symbol === sym)) { out = { sent: false, note: 'KHÔNG vào — mã vừa có lệnh' }; return; }
        const late = gate();
        if (!late.allowed || late.canOpen === null) { out = { sent: false, note: `KHÔNG vào (kiểm lại ngay trước khi gửi) — ${late.reasons.join('; ')}` }; return; }
        const now = deps.now();
        const f = lastFetched!;
        const openOrderCount = f.ex.openOrders.filter((o) => o.symbol === sym).length + f.ex.openAlgoOrders.filter((o) => o.symbol === sym).length;
        const pr = planRegimeEntry({ contract, sizing: sz, qty: late.canOpen.adjustedQty, capital, markPrice: mark, signalId: sid, runId: deps.runId, now, openOrderCount, riskPct });
        if (!pr.allowed || pr.sizing === null) { trace('btc-regime:planner'); out = { sent: false, note: `KHÔNG vào — ${pr.reasons.join('; ')}` }; return; }
        const mt = await orders.setMarginTypeIsolated(sym);
        if (mt.kind !== 'ok') { out = { sent: false, note: `KHÔNG vào — không đặt được ISOLATED (${mt.kind} ${mt.msg})` }; return; }
        const lv = await orders.setLeverage(sym, pr.sizing.leverage);
        if (lv.kind !== 'ok') { out = { sent: false, note: `KHÔNG vào — không đặt được đòn bẩy ${pr.sizing.leverage}x (${lv.kind} ${lv.msg})` }; return; }
        deps.setPaperCost?.(sym, { tierPct: pr.sizing.costPct, impactPct: COMMON.slippage.pctPerParticipation, vol1m: Infinity });
        const base = tradeFromPlan({ signalId: sid, runId: deps.runId, now, result: pr, costPct: pr.sizing.costPct });
        const trade: TradeState = {
          ...base, plan: { ...base.plan, exitCostPct: regimeExitCostPct() },
          equityAtEntry: capital, riskAmount: pr.sizing.riskAmount, notional: pr.sizing.notional, mode: 'btc-regime',
        };
        journal.append({ type: 'signal_accepted', trade });
        trace(`entry:accepted ${sym}`);
        await sendEntryLegs(sym, sid, pr.legs);
        const s = pr.sizing;
        const msg = tgAlerts.regimeEntry({ symbol: sym, entry: s.worstEntry, stop: trade.plan.stop, qty: s.qty, notional: s.notional, riskUsdt: s.riskAmount });
        notify({ level: msg.level, symbol: sym, text: msg.text });
        await reconcileLoop(['sau vào lệnh']); // R2: khớp → SL lên sàn NGAY
        const res = entryLegNote(sid);
        out = { sent: true, placedQty: s.qty, filledQty: regimeFilledQty(sid), note: `giá trần ${s.worstEntry}, SL ${trade.plan.stop}, rủi ro tối đa ${s.riskAmount.toFixed(2)} USDT${res}${pr.reasons.length > 0 ? `; ${pr.reasons.join('; ')}` : ''}` };
      });
      if (out === null) throw new Error(`gửi lệnh vào ${sym} lỗi: ${lastError ?? 'không rõ'}`); // serial đã ghi lỗi → không ghi quyết định, lượt sau thử lại
      return out;
    } finally {
      pinned.delete(sym);
    }
  }
  // Kết quả sàn trả cho chân E1 của lần thử (vd "từ chối -2019") — để ghi lý do IOC không khớp
  function entryLegNote(sid: string): string {
    const leg = journal.state().trades[sid]?.legs.E1;
    return leg === undefined || leg.status === 'filled' || leg.status === 'open' ? '' : `; chân vào: ${leg.status}`;
  }

  // ---- Funding: chốt chặn khi chạy sau mỗi kỳ chốt (nghĩa vụ B8b) ----
  async function fundingChecks(force: boolean): Promise<void> {
    const now = deps.now();
    const live = new Set(activeTrades().map((t) => t.symbol));
    for (const sym of [...fundingBlocked]) if (!live.has(sym)) { fundingBlocked.delete(sym); fundingFail.delete(sym); } // lệnh đã đóng
    for (const t of activeTrades()) {
      const nft = nextFunding.get(t.symbol);
      if (!force && (nft === undefined || now < nft + FUNDING_SETTLE_DELAY_MS)) continue;
      if (!(lastFetched?.ex.positions.some((p) => p.symbol === t.symbol) ?? false)) continue;
      let ok = false;
      const errBefore = lastError;
      await serial(`funding ${t.symbol}`, async () => { ok = await fundingCheck(t.signalId); }); // ném lỗi → serial ghi lastError, ok = false
      if (ok) {
        // Chỉ khi kiểm XONG mới bỏ mốc kỳ chốt này và nạp kỳ kế tiếp
        fundingFail.delete(t.symbol);
        if (fundingBlocked.delete(t.symbol)) notify({ level: 'info', symbol: t.symbol, text: `${t.symbol}: chốt chặn funding chạy lại được — bỏ chặn vào lệnh mới` });
        nextFunding.delete(t.symbol);
        await loadNextFunding(t.symbol);
        continue;
      }
      const why = lastError !== errBefore && lastError !== null ? lastError : 'không đọc được trạng thái sàn';
      // Kiểm lúc khởi động (funding trả khi máy tắt) hoặc kỳ chốt chưa biết: mốc = bây giờ. Mọi lần lỗi: đặt mốc về quá khứ để lượt
      // định kỳ KẾ TIẾP thử lại (không chờ kỳ chốt sau — nextFunding có thể đã là giờ chốt tương lai)
      const settlement = force || nft === undefined || nft > now ? now : nft;
      const rec = fundingFail.get(t.symbol) ?? { settlement, attempts: 0, alerted: false, alertedMissed: 0 };
      rec.attempts++;
      fundingFail.set(t.symbol, rec);
      nextFunding.set(t.symbol, Math.min(nft ?? Infinity, now - FUNDING_SETTLE_DELAY_MS));
      trace(`funding:${t.symbol} failed`);
      log(`Chốt chặn funding ${t.symbol} lỗi lần ${rec.attempts} (kỳ chốt ${new Date(rec.settlement).toISOString()}): ${why} — giữ kỳ chốt, thử lại ở lượt định kỳ sau`);
      const late = now - rec.settlement > COMMON.bot.fundingGuardMaxDelayMs;
      const iMs = (fundingIntervals.get(t.symbol) ?? COMMON.defaultFundingIntervalHours) * H;
      const missed = Math.floor(now / iMs) - Math.floor(rec.settlement / iMs); // số kỳ chốt MỚI đã qua kể từ kỳ đang lỗi
      let alert = false;
      if (!rec.alerted && (rec.attempts > COMMON.bot.fundingGuardMaxAttempts || late)) {
        rec.alerted = true;
        rec.alertedMissed = missed;
        fundingBlocked.add(t.symbol);
        alert = true;
        notify({ level: 'urgent', symbol: t.symbol, text: `KHẨN chốt chặn funding ${t.symbol} không chạy được: ${why} (${rec.attempts} lần, ${Math.round((now - rec.settlement) / 60_000)} phút sau giờ chốt) — chặn vào lệnh mới mã này; đệm "expected" tạm thay bằng "max"; siết SL phòng trước theo funding xấu nhất đã biết` });
      } else if (rec.alerted && missed > rec.alertedMissed) {
        rec.alertedMissed = missed;
        alert = true;
        notify({ level: 'urgent', symbol: t.symbol, text: `KHẨN chốt chặn funding ${t.symbol} vẫn không chạy được — lỡ thêm kỳ chốt (${missed} kỳ kể từ ${new Date(rec.settlement).toISOString()}): ${why}` });
      }
      if (alert) await serial(`funding phòng trước ${t.symbol}`, () => preemptiveTighten(t.signalId));
    }
  }

  // true = đã kiểm xong (kể cả không còn vị thế); false = không kiểm được (giữ kỳ chốt, thử lại)
  async function fundingCheck(signalId: string): Promise<boolean> {
    const t = journal.state().trades[signalId];
    if (t === undefined || t.status === 'closed') return true;
    const sym = t.symbol;
    const now = deps.now();
    trace(`funding:${sym} check`);
    if (deps.paper !== null) {
      // Sàn giả lập: funding đã chốt từ REST công khai (mỗi kỳ chỉ tính một lần)
      for (const r of await fundingHistory(sym, now)) if (r.fundingTime >= t.createdAt && r.fundingTime <= now) deps.paper.feedFunding({ symbol: sym, ...r });
    }
    const f = await fetchState([sym]);
    if (f === null) return false;
    lastFetched = f;
    const pos = f.ex.positions.find((p) => p.symbol === sym);
    const contract = contracts.get(sym);
    if (pos === undefined || contract === undefined) return true;
    const rows = await fetchTradeHistory(deps.api, sym, t.createdAt, now);
    const income = parseIncome(await getOk(deps.api, '/fapi/v1/income', { symbol: sym, incomeType: 'FUNDING_FEE', startTime: t.createdAt, endTime: now, limit: 1000 }))
      .filter((r) => r.symbol === sym && r.time >= t.createdAt).reduce((s, r) => s + r.income, 0);
    const mark = await markOf(sym);
    const run = fundingGuardActions({
      trade: t, positionQty: Math.abs(pos.positionAmt), avgEntry: pos.entryPrice, mark, contract, algos: f.ex.openAlgoOrders, trades: rows, fundingIncome: income,
      riskPct: deps.liveCaps?.riskPerTradePct ?? COMMON.risk.perTradePct, capitalFallback: capitalOf(f.equity),
    });
    trace(`funding:${sym} ${run.result.action}`);
    lastGood.set(sym, { at: now, lockedLoss: run.lockedLoss });
    saveFundingMemory(sym);
    log(`Chốt chặn funding ${sym}: đã mất ${run.lockedLoss.toFixed(2)} USDT (phí + funding ${income.toFixed(2)}), lỗ nếu chạm dừng ${Number.isFinite(run.stopUsed) ? run.stopUsed : '(trailing)'} = ${run.lossBefore.toFixed(2)} / ngân sách ${run.budget.toFixed(2)} → ${run.result.action}${run.result.action === 'tighten' ? ` SL ${run.result.stop}` : ''}`);
    await applyGuardRun(t, run, f.ex.positions, 'chốt chặn funding');
    return true;
  }

  // Thực hiện hành động của chốt chặn; SL mới CHỈ ghi vào nhật ký (stop_tightened) khi sàn ĐÃ nhận lệnh dừng mới (chân SL của lần thử đó
  // 'open' sau executor — kết quả không rõ được executor tra lại). Bị từ chối / không rõ → nhật ký giữ SL cũ (sàn là sự thật) + KHẨN;
  // executor đã xử lý theo chính sách sẵn có (giữ SL cũ khi còn phủ / đóng khẩn khi không còn dừng nào).
  async function applyGuardRun(t: TradeState, run: ReturnType<typeof fundingGuardActions>, positions: readonly ExPosition[], what: string): Promise<void> {
    if (run.actions.length === 0) return;
    const rep = await executeActions(run.actions, execCtx(positions));
    if (rep.halted?.kind === 'banned') setBanned(rep.halted.reason);
    const tight = run.journal.find((e) => e.type === 'stop_tightened');
    const place = run.actions.find((a) => a.type === 'place_stop');
    if (tight !== undefined && tight.type === 'stop_tightened' && place !== undefined && place.type === 'place_stop') {
      const leg = journal.state().trades[t.signalId]?.legs.SL;
      if (leg !== undefined && leg.clientId === place.clientId && leg.status === 'open') journal.append(tight);
      else notify({ level: 'urgent', symbol: t.symbol, text: `KHẨN ${t.symbol}: siết SL về ${tight.stop} (${what}) KHÔNG được sàn nhận (chân SL: ${leg?.status ?? 'không có'}) — giữ SL cũ ${t.plan.stop} làm chuẩn; sẽ thử lại ở kỳ kiểm sau` });
    }
    await reconcileLoop([`sau ${what}`]);
  }

  // Chốt chặn hỏng (không đọc được funding/income) mà sàn vẫn nhận lệnh: siết SL PHÒNG TRƯỚC bằng CÙNG hàm chốt chặn, giả định funding xấu
  // nhất đã biết (|rate| lớn nhất: lịch sử 30 ngày lúc vào lệnh, premiumIndex) cho các kỳ đã lỡ VÀ mọi kỳ còn lại tới maxHoldHours:
  //   lỗ nếu chạm SL + funding ước đã trả + funding dự kiến còn lại ≤ 2% vốn lúc vào.
  async function preemptiveTighten(signalId: string): Promise<void> {
    const t = journal.state().trades[signalId];
    if (t === undefined || t.status === 'closed') return;
    const sym = t.symbol;
    const now = deps.now();
    const f = await fetchState([sym]);
    const pos = f?.ex.positions.find((p) => p.symbol === sym);
    const contract = contracts.get(sym);
    if (f === null || pos === undefined || contract === undefined) { log(`Siết SL phòng trước ${sym}: không đọc được vị thế/lệnh — bỏ qua (kiểm tay)`); return; }
    await refreshPremium(sym);
    const mark = await markOf(sym);
    const qty = Math.abs(pos.positionAmt);
    const intervalHours = fundingIntervals.get(sym) ?? COMMON.defaultFundingIntervalHours;
    const iMs = intervalHours * H;
    const known = worstRate.get(sym) ?? 0;
    const rate = known > 0 ? known : fundingFallbackRate(intervalHours); // không biết gì → mức thận trọng, không bao giờ 0
    const notional = qty * mark;
    const good = lastGood.get(sym);
    const from = good?.at ?? t.createdAt;
    const accrued = (Math.floor(now / iMs) - Math.floor(from / iMs)) * rate * notional;
    const firstFill = t.fills.filter((x) => x.role === 'E1' || x.role === 'E2').reduce((m, x) => Math.min(m, x.time), t.createdAt);
    const mode = t.mode ?? 'swing';
    // btc-regime không có thời gian giữ tối đa (giữ tới khi tín hiệu tắt): dự phòng funding tới lần quyết định ngày kế tiếp (24 giờ) —
    // chốt chặn chạy lại mỗi kỳ chốt nên phần sau đó được kiểm ở các kỳ sau
    const remainingMs = mode === 'btc-regime' ? DAY : Math.max(0, CONFIG[mode].maxHoldHours * H - (now - firstFill));
    const projected = Math.ceil(remainingMs / iMs) * rate * notional;
    let rows: Awaited<ReturnType<typeof fetchTradeHistory>> = [];
    let base = good?.lockedLoss ?? 0;
    if (good === undefined) {
      try { rows = await fetchTradeHistory(deps.api, sym, t.createdAt, now); } catch (e) { base = (notional * t.plan.costPct) / 200; log(`userTrades ${sym}: ${errText(e)} — ước phí vào ${base.toFixed(2)}`); }
    }
    const run = fundingGuardActions({
      trade: t, positionQty: qty, avgEntry: pos.entryPrice, mark, contract, algos: f.ex.openAlgoOrders, trades: rows, fundingIncome: -(base + accrued + projected),
      riskPct: deps.liveCaps?.riskPerTradePct ?? COMMON.risk.perTradePct, capitalFallback: capitalOf(f.equity),
    });
    trace(`funding:${sym} preempt-${run.result.action}`);
    log(`Siết SL phòng trước ${sym}: |funding| xấu nhất ${rate}, ước đã trả ${accrued.toFixed(2)} + còn lại ${projected.toFixed(2)} USDT → ${run.result.action}${run.result.action === 'tighten' ? ` SL ${run.result.stop}` : ''}`);
    await applyGuardRun(t, run, f.ex.positions, 'siết SL phòng trước');
  }
  async function refreshPremium(symbol: string): Promise<void> {
    try {
      const raw = await botGet(`/fapi/v1/premiumIndex?symbol=${symbol}`);
      const p = parsePremium(Array.isArray(raw) ? raw : [raw])[0];
      if (p !== undefined) noteRate(symbol, p.lastFundingRate);
    } catch (e) {
      log(`premiumIndex ${symbol}: ${errText(e)}`);
    }
  }

  // Nến quyết định chưa tới qua luồng (luồng chết im lặng) → lấy bằng REST
  async function checkMissedCloses(): Promise<void> {
    const now = deps.now();
    for (const iv of intervals.keys()) {
      const ms = intervalMs(iv);
      const expected = Math.floor(now / ms) * ms - 1;
      if (expected <= (lastProcessed.get(iv) ?? -Infinity) || now - expected < MISSED_CLOSE_GRACE_MS) continue;
      const c = await lastClosedRest(TRIGGER, iv).catch((e: unknown) => { log(`REST nến ${TRIGGER} ${iv}: ${errText(e)}`); return null; });
      if (c === null || c.closeTime <= (lastProcessed.get(iv) ?? -Infinity)) continue;
      log(`Luồng nến ${TRIGGER} ${iv} im lặng: nến đóng ${new Date(c.closeTime + 1).toISOString()} lấy qua REST`);
      trace(`missed:${iv}`);
      await decide(iv, c.closeTime);
    }
  }

  // ---- Sự kiện luồng user (paper: sàn giả lập; demo/live: WebSocket) ----
  async function onUserEvent(e: UserEvent): Promise<void> {
    if (stopping) return;
    if (e.type === 'resync_required') { await requestReconcile(`resync ${e.reason}`); return; }
    if (e.type === 'algo_update') {
      // Nghĩa vụ B7: nối lệnh algo đã kích hoạt với lệnh thật (ALGO_UPDATE.ai ↔ orderId) để gán khớp userTrades về đúng chân
      const g = e.algo;
      for (const t of activeTrades()) {
        if (t.symbol !== g.symbol) continue;
        const r = roleOfClientId(t, g.clientAlgoId);
        if (r === null) continue;
        journal.append({ type: 'algo_update', signalId: t.signalId, role: r.role, clientId: g.clientAlgoId, algoStatus: g.status, activated: g.activated, orderId: g.actualOrderId });
      }
    }
    if (e.type === 'order_update' || e.type === 'algo_update' || e.type === 'account_update') await requestReconcile('sự kiện sàn');
  }

  // ---- Trạng thái cho /trangthai ----
  function status(): StatusSnapshot {
    return {
      mode: runMode,
      equity: lastFetched?.equity ?? null,
      openTrades: activeTrades().map((t) => {
        const fills = t.fills.filter((f) => f.role === 'E1' || f.role === 'E2');
        const q = fills.reduce((s, f) => s + f.qty, 0);
        return { symbol: t.symbol, side: t.side, entry: q > 0 ? fills.reduce((s, f) => s + f.qty * f.price, 0) / q : NaN, stop: t.plan.stop, pnl: null };
      }),
      lastError,
    };
  }

  // ---- Khởi động ----
  async function start(): Promise<void> {
    const step = (s: string) => trace(`step:${s}`);
    startedAt = deps.now();
    step('clock');
    const off = await deps.syncClock();
    if (Math.abs(off) > MAX_SKEW_MS) {
      if (runMode !== 'paper') throw new Error(`Đồng hồ máy lệch giờ sàn ${off} ms (> ${MAX_SKEW_MS} ms) — từ chối chạy ${runMode}; đồng bộ giờ hệ thống (timedatectl) rồi chạy lại`);
      log(`CẢNH BÁO: đồng hồ máy lệch giờ sàn ${off} ms (> ${MAX_SKEW_MS} ms) — paper vẫn chạy, nhưng nên đồng bộ giờ`);
    } else log(`Đồng hồ: lệch ${off} ms so với sàn`);

    step('exchangeInfo');
    const list = parseContracts(await deps.publicGet('/fapi/v1/exchangeInfo'));
    contracts = new Map(list.map((c) => [c.symbol, c]));
    filters = Object.fromEntries(contracts);
    fundingIntervals = parseFundingInfo(await deps.publicGet('/fapi/v1/fundingInfo'));
    log(`exchangeInfo: ${contracts.size} hợp đồng | chế độ chiến lược: ${modes.join(', ')} (khung quyết định ${[...intervals.keys()].join(', ')})`);

    step('account');
    await orders.assertOneWay(); // R11: Hedge → dừng, không tự đổi
    await orders.assertSingleAssetMode(); // Multi-Assets bật → dừng (không dùng được ISOLATED)
    if (runMode !== 'paper') {
      // Bậc ký quỹ thật bắt buộc cho demo/live (thiết kế mục Vòng đời 3, I7)
      brackets = parseLeverageBrackets(await getOk(deps.api, '/fapi/v1/leverageBracket'));
      log(`Bậc ký quỹ thật: ${brackets.size} mã`);
    }

    step('journal');
    const st = journal.state();
    const act = activeTrades();
    log(`Nhật ký khôi phục: sự kiện #${st.seq}, lệnh đang theo dõi ${act.length}${act.length > 0 ? ` (${act.map((t) => `${t.symbol} ${t.side} ${t.status}`).join(', ')})` : ''}, cầu chì nhảy: ${Object.entries(st.protections).filter(([, p]) => p.tripped).map(([n]) => n).join(', ') || 'không'}`);
    for (const [sym, u] of Object.entries(st.unprotected)) notify({ level: 'urgent', symbol: sym, text: `KHẨN ${sym}: lần chạy trước vị thế CHƯA có lệnh dừng (${u.reason}) — xử lý trước tiên` });

    step('paper_backfill');
    if (deps.paper !== null) await paperBackfill();

    step('seed');
    const ivs = [...intervals.keys()];
    trigger = deps.createMarketStream({ symbols: [TRIGGER], intervals: ivs, onEvent: (e) => { void onMarketEvent('trigger', e); } });
    for (const iv of ivs) {
      const t = await seedFromRest(trigger, TRIGGER, iv); // nghĩa vụ B8a: mốc nến cuối TRƯỚC start()
      if (t !== null) lastProcessed.set(iv, t); // nến đã đóng trước lúc khởi động không quét lại (không vào lệnh theo tín hiệu cũ)
    }

    step('reconcile');
    started = true;
    await requestReconcile('khởi động');
    await fundingChecks(true).catch((e: unknown) => log(`Chốt chặn funding lúc khởi động lỗi: ${errText(e)}`)); // kỳ funding chốt lúc tắt máy

    step('streams');
    trigger.start();
    await updateWatch();
    if (deps.paper !== null) unsubPaper = deps.paper.onUserEvent((e) => { void onUserEvent(e); });
    if (deps.createUserStream !== null) {
      userStream = deps.createUserStream((e) => { void onUserEvent(e); });
      await userStream.start();
    }
    tg.start();
    notify({ level: 'info', symbol: null, text: `Bot bật — chế độ ${runMode}, chiến lược ${modes.join(' + ')}, ${act.length} lệnh đang theo dõi, vốn ${lastFetched?.equity.toFixed(2) ?? '?'} USDT` });
    // btc-regime: lỡ quyết định ngày khi máy tắt → quyết định ngay với nến 1D đóng cuối (đối chiếu ở trên đã đồng bộ vị thế + SL; luồng đã mở)
    await regimeCatchUp('khởi động');
  }

  // Khởi động lại paper: nến 1m + funding đã chốt trong khoảng tắt máy, nạp TRƯỚC mọi nhịp mark (nghĩa vụ B7)
  async function paperBackfill(): Promise<void> {
    const p = deps.paper!;
    const now = deps.now();
    const syms = new Set([...p.snapshot().positions.map((x) => x.symbol), ...activeTrades().map((t) => t.symbol)]);
    for (const sym of syms) {
      const last = p.lastPriceTime(sym);
      if (last === null || !contracts.has(sym)) continue;
      let from = last + 1;
      let n = 0;
      for (let page = 0; page < 10 && from < now - MIN; page++) {
        const rows = parseKlines(await deps.publicGet(`/fapi/v1/klines?symbol=${sym}&interval=1m&startTime=${from}&limit=1000`), now);
        const fresh = rows.filter((c) => c.openTime > (p.lastPriceTime(sym) ?? -Infinity));
        for (const c of fresh) { p.feedKline(sym, c); n++; }
        if (rows.length < 1000) break;
        from = rows[rows.length - 1]!.closeTime + 1;
      }
      try {
        for (const r of await fundingHistory(sym, now)) if (r.fundingTime > last && r.fundingTime <= now) p.feedFunding({ symbol: sym, ...r });
      } catch (e) {
        // Không dừng khởi động: chốt chặn funding (fundingCheck) nạp lại funding từ lúc vào lệnh và thử lại tới khi được
        log(`paper ${sym}: không tải được funding khoảng tắt máy (${errText(e)}) — chốt chặn funding sẽ nạp lại khi đọc được`);
      }
      log(`paper ${sym}: nạp ${n} nến 1m khoảng tắt máy (từ ${new Date(last).toISOString()}) trước khi nạp mark`);
    }
  }

  // Mỗi giây (paper): nhịp mark mới của mã đang theo dõi → sàn giả lập
  function tick(): void {
    if (deps.paper === null || !started || stopping) return;
    for (const sym of watchSet) {
      const s = streamFor(sym);
      const m = s?.latestMark(sym) ?? null;
      if (s === null || m === null || s.isMarkStale(sym)) continue;
      try { deps.paper.feedMark(sym, { price: m.price, eventTime: m.eventTime }); } catch (e) { log(`paper mark ${sym}: ${errText(e)}`); }
    }
  }

  async function periodic(): Promise<void> {
    if (!started || stopping) return;
    await requestReconcile('định kỳ REST'); // nghĩa vụ B8a: luồng user im lặng hợp lệ không phân biệt được với kết nối chết
    await checkMissedCloses();
    await regimeCatchUp('định kỳ'); // quyết định ngày chưa làm được (REST lỗi/thiếu dữ liệu) → thử lại; đã làm thì không gọi REST
    await fundingChecks(false);
  }

  // ---- Tắt có kế hoạch ----
  async function stop(): Promise<void> {
    await idle();
    stopping = true;
    try {
      const f = await fetchState();
      if (f === null) notify({ level: 'urgent', symbol: null, text: `KHẨN Bot tắt — KHÔNG đọc được trạng thái sàn, kiểm tay ngay (lệnh vào còn treo / lệnh dừng của vị thế chưa được kiểm): ${lastError ?? ''}` });
      if (f !== null) {
        const st = journal.state();
        const actions: Action[] = [];
        for (const o of f.ex.openOrders) {
          for (const t of Object.values(st.trades)) {
            const r = t.symbol === o.symbol ? roleOfClientId(t, o.clientId) : null;
            if (r !== null && (r.role === 'E1' || r.role === 'E2')) actions.push({ type: 'cancel_order', symbol: o.symbol, signalId: t.signalId, clientId: o.clientId, orderId: o.orderId, reason: 'Bot tắt — không để lệnh vào nằm trên sàn khi bot không chạy (R13)' });
          }
        }
        if (actions.length > 0) await executeActions(actions, execCtx(f.ex.positions));
        // Kiểm THẬT từng vị thế: lệnh dừng trên sàn (STOP_MARKET closePosition, hoặc tổng dừng reduce-only + trailing ĐÃ kích hoạt ≥ vị thế)
        // và dấu "chưa bảo vệ" trong nhật ký — không bao giờ báo "đều có SL" khi chưa kiểm
        const lines: string[] = [];
        let bad = 0;
        for (const p of f.ex.positions) {
          const qty = Math.abs(p.positionAmt);
          const algos = f.ex.openAlgoOrders.filter((o) => o.symbol === p.symbol);
          const trActive = Object.values(st.trades).some((t) => t.symbol === p.symbol && t.status !== 'closed' && t.trailingActivated);
          const cover = algos.reduce((sum, o) => sum + (o.orderType === 'STOP_MARKET' || (o.orderType === 'TRAILING_STOP_MARKET' && trActive) ? o.quantity : 0), 0);
          const ok = st.unprotected[p.symbol] === undefined && (algos.some((o) => o.orderType === 'STOP_MARKET' && o.closePosition) || cover >= qty * (1 - 1e-9));
          if (!ok) bad++;
          lines.push(`${p.symbol} ${p.positionAmt}: ${ok ? 'có SL' : 'KHÔNG có SL'}`);
        }
        notify({
          level: bad > 0 ? 'urgent' : 'info', symbol: null,
          text: `${bad > 0 ? 'KHẨN ' : ''}Bot tắt — đã hủy ${actions.length} lệnh vào còn treo; vị thế còn mở: ${lines.length > 0 ? lines.join('; ') : 'không'}${bad > 0 ? ` — ${bad} vị thế KHÔNG có lệnh dừng trên sàn, xử lý tay NGAY` : ''}`,
        });
      }
    } finally {
      trigger?.stop();
      watch?.stop();
      userStream?.stop();
      unsubPaper?.();
      journal.snapshot();
      tg.stop();
      await tg.drain();
    }
  }

  return {
    start, stop, tick, periodic, idle,
    onMarketEvent, onUserEvent,
    notify: (a: { level: AlertLevel; symbol: string | null; text: string }) => notify(a),
    trace: () => [...traceLog],
    status,
    fundingGuardHealthy,
    entryBlockedSymbols: () => [...fundingBlocked].sort(),
    fundingMemory: (sym: string) => ({ worstRate: worstRate.get(sym) ?? 0, lastGood: lastGood.get(sym) ?? null }),
  };
}

// =================================================================================================================
// CLI: `node packages/bot/main.ts` (systemd: deploy/coin-radar-bot.service). Cấu hình trong .env (quyền 600) — docs/runbook-bot.md.
// =================================================================================================================
let cliSecrets: string[] = []; // secret đọc từ .env (không nằm trong process.env khi chạy tay) — che cả trong thông báo lỗi dừng bot
async function cli(): Promise<void> {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const envPath = process.env.BOT_ENV_FILE ?? join(root, '.env');
  const file = readEnvFile(envPath);
  const env: Record<string, string | undefined> = { ...file.vars, ...process.env };
  const secrets = [env.BINANCE_API_KEY, env.BINANCE_API_SECRET, env.TELEGRAM_BOT_TOKEN].filter((x): x is string => typeof x === 'string' && x !== '');
  cliSecrets = secrets;
  const log = (m: string) => console.log(`${new Date().toISOString()} ${scrubText(m, secrets)}`);
  const settings = botSettings(env);
  log(`Coin Radar bot — ${describeSettings(settings, env)}${file.exists ? '' : ' | không có tệp .env (dùng biến môi trường)'}`);
  const dataDir = resolvePath(root, settings.dataDir);
  const readJson = (p: string): unknown => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
  const capsPath = resolvePath(root, env.BOT_LIVE_CAPS_PATH ?? DEFAULT_LIVE_CAPS_PATH);
  const armPath = resolvePath(root, env.BOT_LIVE_ARM_PATH ?? DEFAULT_LIVE_ARM_PATH);
  // fundingGuardActive: main.ts LUÔN chạy chốt chặn funding (fundingChecks) cho mọi chế độ → 'expected' được phép (F1)
  const rm = resolveRunMode({ configMode: settings.configMode, env, capsRaw: readJson(capsPath), armRaw: existsSync(armPath) ? readFileSync(armPath, 'utf8') : null, fundingGuardActive: true });
  if (!rm.ok) throw new Error(`Từ chối chạy:\n- ${rm.problems.join('\n- ')}`);
  if (rm.mode !== 'paper' && file.exists && file.loosePerms) throw new Error(`${envPath} có quyền rộng hơn 600 — chạy: chmod 600 ${envPath}`);
  if (file.exists && file.loosePerms) log(`CẢNH BÁO: ${envPath} có quyền rộng hơn 600 — chạy: chmod 600 ${envPath}`);

  const demo = rm.mode === 'demo';
  const restBase = demo ? 'https://demo-fapi.binance.com' : 'https://fapi.binance.com';
  const wsBase = demo ? 'wss://demo-fstream.binance.com' : 'wss://fstream.binance.com';
  const timed: typeof nodeFetch = Object.assign((url: string, init?: Parameters<typeof nodeFetch>[1]) =>
    globalThis.fetch(url, { ...(init ?? {}), signal: AbortSignal.timeout(20_000) }), { forwardsInit: true as const });
  const client = createClient({ fetch: timed, base: restBase });
  const journal = openJournal({ dir: dataDir, secrets, warn: (m) => log(`[nhật ký] ${m}`) });
  const events = parseEvents(JSON.parse(readFileSync(join(root, 'data/events/events.json'), 'utf8')));
  const runId = Date.now().toString(36).slice(-8);

  let api: Api;
  let syncClock: () => Promise<number>;
  let paper: ReturnType<typeof createPaperExchange> | null = null;
  const paperCosts = new Map<string, FillCost>();
  let createUser: BotDeps['createUserStream'] = null;
  if (rm.mode === 'paper') {
    const contracts = parseContracts(await client.get('/fapi/v1/exchangeInfo'));
    paper = createPaperExchange({
      contracts: Object.fromEntries(contracts.map((c) => [c.symbol, c])),
      // Mã chưa có mô hình phí (lệnh mở trước lần khởi động này): nhóm thanh khoản THẤP — thận trọng
      // btc-regime: BTCUSDT dùng phí + trượt của luật đã khóa (2 × phí taker + trượt) cả sau khi khởi động lại
      cost: (s) => paperCosts.get(s) ?? (COMMON.bot.modes.includes('btc-regime') && s === COMMON.btcRegime.symbol
        ? { tierPct: regimeCostPct(), impactPct: COMMON.slippage.pctPerParticipation, vol1m: Infinity }
        : { tierPct: COMMON.costRoundTripPct.low, impactPct: COMMON.slippage.pctPerParticipation, vol1m: Infinity }),
      startBalance: settings.paperBalance, statePath: join(dataDir, 'paper-state.json'),
    });
    api = paper.api;
    syncClock = async () => {
      const t0 = Date.now();
      const body = (await client.get('/fapi/v1/time')) as { serverTime?: unknown };
      const t1 = Date.now();
      if (typeof body?.serverTime !== 'number') throw new Error('Không đọc được giờ server');
      return body.serverTime - (t0 + t1) / 2;
    };
  } else {
    const creds = loadCredentials(env);
    const signed = createSigned({ client: { send: (p, i, pr) => client.send(p, i, pr), armBan: client.armBan }, apiKey: creds.apiKey, signer: hmacSigner(creds.apiSecret), log, secrets });
    api = signed;
    syncClock = () => signed.syncClock();
    createUser = (onEvent) => createUserStream({ listenKeys: createListenKeyApi({ client, apiKey: creds.apiKey }), onEvent, log, secrets, base: wsBase });
  }

  const bot = createBot({
    mode: rm.mode, liveCaps: rm.mode === 'live' ? rm.caps : null, runId, now: Date.now,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)), log,
    publicGet: (p) => client.get(p), api, syncClock, paper,
    // Đối chiếu/mốc nến/giá mark: ngân sách ưu tiên 'bot' của client (trần 2200 thay vì 1800 của máy quét)
    publicGetBot: async (p) => {
      const res = await client.send(p, undefined, 'bot');
      if (res.status !== 200) throw new Error(`Binance HTTP ${res.status} tại ${p}`);
      return res.json();
    },
    setPaperCost: (s, c) => paperCosts.set(s, c),
    createUserStream: createUser,
    createMarketStream: (o) => createMarketStream({ ...o, log, base: wsBase }),
    journal,
    telegram: (hooks) => settings.telegram === null
      ? disabledTelegram({ journal, log })
      : createTelegram({ token: settings.telegram.token, chatId: settings.telegram.chatId, getStatus: hooks.getStatus, getDayLossPct: hooks.getDayLossPct, journal, log, secrets }),
    events, scanLimit: settings.scanLimit,
    fetchJson: httpJson, // FGI (Alternative.me) — chỉ gọi khi luật FGI-hướng bật
  });

  let shuttingDown = false;
  const shutdown = async (sig: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`Nhận ${sig} — tắt có kế hoạch`);
    clearInterval(tickTimer);
    clearInterval(periodicTimer);
    try { await bot.stop(); } catch (e) { log(`Lỗi khi tắt: ${errText(e)}`); process.exitCode = 1; }
    log('Đã tắt');
    process.exit();
  };
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  const tickTimer = setInterval(() => bot.tick(), 1000);
  const periodicTimer = setInterval(() => { void bot.periodic().catch((e: unknown) => log(`LỖI định kỳ: ${errText(e)}`)); }, settings.reconcileEveryMs);
  await bot.start();
  log(`Khởi động xong — runId ${runId}`);
}

if (process.argv[1] !== undefined && resolvePath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli().catch((e: unknown) => {
    console.error(`${new Date().toISOString()} Bot dừng vì lỗi: ${scrubText(errText(e), [...cliSecrets, process.env.BINANCE_API_KEY ?? '', process.env.BINANCE_API_SECRET ?? '', process.env.TELEGRAM_BOT_TOKEN ?? ''].filter((x) => x !== ''))}`);
    process.exit(1);
  });
}
