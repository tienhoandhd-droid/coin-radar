// Chạy THẬT vòng đời bot chế độ btc-regime (packages/bot/main.ts createBot — KHÔNG có nhánh "backtest" nào trong main.ts) trên dữ liệu
// lịch sử, rồi so với bộ mô phỏng tham chiếu đã khóa (backtest/research/btc-regime-sim.ts, GUARD=1).
//
//   node backtest/bot-replay.ts [--out output/bot-replay] [--only W1-A,C-B,…]
//
// CÁCH CHẠY LẠI (đúng các chỗ tiêm của main.test.ts: đồng hồ, REST công khai, luồng thị trường, sàn):
//  - Đồng hồ giả tiến theo lịch sử. Sàn = sàn giả lập THẬT packages/bot/paper.ts (mô hình khớp fill-model.ts), nhật ký THẬT journal.ts,
//    Telegram tắt (disabledTelegram). REST công khai giả trả từ dữ liệu lịch sử: klines 1D, premiumIndex, fundingRate, exchangeInfo.
//  - Mỗi ngày D (UTC): 00:00 sàn thu funding kỳ chốt → 00:00:01 luồng báo nến 1D (D−1) đóng → bot quyết định (onMarketEvent) →
//    mỗi giờ h (h:01) bot chạy lượt định kỳ (đối chiếu, thử lại IOC, chốt chặn funding sau mỗi kỳ chốt 8 giờ) → giá chạy hết giờ h.
//  - Giá: nến 1h BTCUSDT của data/cache/klines (chỉ có từ 2025-12-11 — đủ 24 nến mới dùng), ngày khác dùng nến 1D.
//    * Giá mark = giá giao dịch (giả định: dữ liệu không có mark lịch sử) = giá đóng của nến nhỏ nhất ĐÃ đóng (bot định cỡ, giá trần IOC).
//    * Nhịp giá cho lệnh IOC/market = giá MỞ của nến đang chạy (nến 1h giờ đó, không có 1h thì giá mở ngày): IOC khớp nếu giá trần ≥ giá đó,
//      không thì hết hạn → bot tự thử lại theo luật của nó (60 phút × 3, cửa sổ 4 giờ). Ngày chỉ có 1D: mọi lần thử thấy cùng giá mở ngày.
//    * Sau lượt của bot, phần còn lại của nến được QUÉT bằng feedKline của sàn giả lập: giá mở → cực bất lợi (SL khớp ĐÚNG mức, giá mở đã
//      thủng SL thì khớp ở giá mở = min(SL, giá mở)) → cực có lợi. Ngày chỉ có 1D: quét cả ngày sau lượt 23:01 (funding 08:00/16:00 và
//      chốt chặn đã chạy trước — thận trọng như mô phỏng).
//    * Funding: lịch sử thật (tệp tải sẵn); giá tính funding = giá mở nến 1h chứa giờ chốt, không có 1h thì nội suy mở→đóng ngày (như
//      mô phỏng). premiumIndex.lastFundingRate = kỳ ĐÃ chốt gần nhất (không nhìn trước dự báo).
//  - Kiểm cứng chạy suốt: trước MỖI nhịp giá / lần quét, có vị thế thì phải có STOP_MARKET closePosition SELL trên sàn; vị thế = đúng
//    khối lượng khớp của MỘT lệnh bot; mỗi nến quyết định tối đa một lệnh vào khớp; lỗ thật mỗi lệnh (sổ của sàn: phí + PnL + funding)
//    ≤ 2% vốn lúc vào. Không bao giờ đọc dữ liệu từ CUTOFF (2026-09-19) trở đi — assert khi nạp.
//  - Hết kỳ còn vị thế: định giá ở giá đóng ngày cuối trừ phí ra (như "hết-kỳ" của mô phỏng).
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createBot, disabledTelegram, type BotDeps, type MarketStreamLike } from '../packages/bot/main.ts';
import { createPaperExchange } from '../packages/bot/paper.ts';
import { openJournal, type Journal, type JournalEvent } from '../packages/bot/journal.ts';
import type { FillCost } from '../packages/bot/fill-model.ts';
import { parseContracts } from '../packages/binance/parse.ts';
import { COMMON } from '../packages/core/config.ts';
import { regimeCostPct } from '../packages/core/btc-regime.ts';
import type { Candle } from '../packages/core/types.ts';

const SYM = 'BTCUSDT';
const MIN = 60_000;
const H = 3_600_000;
const DAY = 24 * H;
export const CUTOFF = Date.UTC(2026, 8, 19); // 2026-09-19 00:00 UTC — dữ liệu từ đây trở đi KHÔNG được đọc
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const iso = (t: number) => new Date(t).toISOString();
const isoDay = (t: number) => iso(t).slice(0, 10);
const dayUtc = (s: string) => Date.parse(`${s}T00:00:00Z`);

export type FundingRow = { t: number; r: number };
export type ReplayData = {
  daily: Candle[]; // nến 1D liên tục, tăng dần, mọi nến < cutoff (gồm phần khởi động)
  hourly: ReadonlyMap<number, Candle[]>; // 00:00 UTC của ngày → đúng 24 nến 1h của ngày đó
  funding: FundingRow[]; // tăng dần theo t
};

// Mọi bản ghi phải trước cutoff (nến: giờ ĐÓNG < cutoff) — vi phạm là lỗi, không lọc âm thầm
export function assertBeforeCutoff(d: ReplayData, cutoff: number): void {
  for (const c of d.daily) if (c.openTime >= cutoff || c.closeTime >= cutoff) throw new Error(`ASSERT: nến 1D ${iso(c.openTime)} ≥ mốc cấm ${iso(cutoff)}`);
  for (const [day, hs] of d.hourly) for (const c of hs) if (c.closeTime >= cutoff) throw new Error(`ASSERT: nến 1h ${iso(c.openTime)} (ngày ${isoDay(day)}) ≥ mốc cấm ${iso(cutoff)}`);
  for (const f of d.funding) if (f.t >= cutoff) throw new Error(`ASSERT: funding ${iso(f.t)} ≥ mốc cấm ${iso(cutoff)}`);
  for (let i = 1; i < d.daily.length; i++) {
    if (d.daily[i]!.openTime - d.daily[i - 1]!.openTime !== DAY) throw new Error(`nến 1D đứt quãng sau ${isoDay(d.daily[i - 1]!.openTime)}`);
  }
}

export type ReplayOptions = {
  data: ReplayData;
  contractRaw: unknown; // một phần tử exchangeInfo.symbols của BTCUSDT
  dataFrom: number; // nến 1D sớm nhất bot được thấy qua REST (khởi động chỉ báo)
  start: number; // 00:00 UTC ngày giao dịch đầu tiên
  endDay: number; // 00:00 UTC ngày giao dịch cuối (tính cả ngày đó)
  startBalance: number;
  journalDir: string;
  cutoff?: number;
  log?: (m: string) => void;
};

export type ReplayTrade = {
  signalId: string; entryTime: number; entryPrice: number; qty: number;
  exitTime: number; exitPrice: number; reason: 'SL' | 'SL (đã siết)' | 'tín hiệu tắt' | 'hết kỳ' | 'khác';
  fees: number; funding: number; pnl: number; // pnl = PnL đã chốt − phí + funding (USDT, theo sổ của sàn giả lập)
  equityAtEntry: number; lossPct: number; // lossPct = −pnl / vốn lúc vào × 100 (âm = lãi)
  botPnl: number | null; // trade_outcome bot tự ghi (đối chiếu sổ)
  stopInitial: number; stopFinal: number; tightenings: number; notional: number;
};
export type ReplayAttempt = { closeTime: number; attempt: number; at: number; result: string; placedQty: number; filledQty: number };
export type ReplayDecision = { closeTime: number; action: string; note: string; at: number };
export type ReplayResult = {
  trades: ReplayTrade[];
  days: Array<{ day: number; equity: number }>; // vốn (ví + lãi/lỗ chưa chốt ở giá đóng) cuối mỗi ngày
  attempts: ReplayAttempt[];
  decisions: ReplayDecision[];
  tightenings: Array<{ at: number; signalId: string; stop: number }>;
  fundingRows: Array<{ time: number; income: number }>;
  violations: string[]; // vi phạm kiểm cứng
  urgent: string[]; // cảnh báo KHẨN của bot
  warnCount: number;
  priceSteps: number; // số nhịp giá đã nạp
  hourlyDays: number; // số ngày chạy bằng nến 1h
  endEquity: number;
};

type AlgoRow = { orderType: string; closePosition: boolean | string; side: string };
type TradeRow = { id: number; orderId: number; side: string; price: string; qty: string; commission: string; realizedPnl: string; time: number };

export async function runBotReplay(o: ReplayOptions): Promise<ReplayResult> {
  const cutoff = o.cutoff ?? CUTOFF;
  assertBeforeCutoff(o.data, cutoff);
  if (o.endDay + DAY > cutoff) throw new Error(`ASSERT: ngày cuối ${isoDay(o.endDay)} chạm mốc cấm ${isoDay(cutoff)}`);
  const daily = o.data.daily;
  const byOpen = new Map(daily.map((c) => [c.openTime, c]));
  for (let d = o.start - DAY; d <= o.endDay; d += DAY) if (!byOpen.has(d)) throw new Error(`thiếu nến 1D ${isoDay(d)}`);
  const funding = o.data.funding;
  const log = o.log ?? (() => {});

  // ---- Trạng thái giá do "thị trường" của bản chạy lại điều khiển ----
  const clock = { t: o.start };
  const now = () => clock.t;
  let mark = byOpen.get(o.start - DAY)!.close; // giá biết gần nhất (giá đóng nến đã đóng) — bot dùng làm mark
  let point = byOpen.get(o.start)!.open; // nhịp giá kế tiếp cho lệnh IOC/market (giá mở nến đang chạy)
  let priceSteps = 0;

  const priceAt = (t: number): number => {
    const d = Math.floor(t / DAY) * DAY;
    const hs = o.data.hourly.get(d);
    if (hs !== undefined) return hs[Math.floor((t - d) / H)]!.open;
    const c = byOpen.get(d);
    if (c === undefined) throw new Error(`không có giá cho ${iso(t)}`);
    return c.open + ((c.close - c.open) * (t - d)) / DAY;
  };

  // ---- REST công khai giả (chỉ dữ liệu ĐÃ xảy ra trước đồng hồ) ----
  const kRow = (c: Candle) => [c.openTime, String(c.open), String(c.high), String(c.low), String(c.close), String(c.volume), c.closeTime, String(c.quoteVolume), 1, '0', String(c.takerBuyQuote), '0'];
  const lastSettled = (t: number) => { let r: FundingRow | undefined; for (const f of funding) { if (f.t > t) break; r = f; } return r; };
  async function publicGet(path: string): Promise<unknown> {
    const u = new URL(path, 'http://rest.gia');
    const q = u.searchParams;
    const sym = q.get('symbol');
    if (u.pathname === '/fapi/v1/exchangeInfo') return { symbols: [o.contractRaw] };
    if (u.pathname === '/fapi/v1/fundingInfo') return [{ symbol: SYM, fundingIntervalHours: 8 }];
    if (u.pathname === '/fapi/v1/klines') {
      if (sym !== SYM || q.get('interval') !== '1d') throw new Error(`REST giả: chỉ có klines 1d ${SYM}, nhận ${path}`);
      const limit = Number(q.get('limit') ?? 500);
      const st = q.get('startTime');
      const rows = daily.filter((c) => c.openTime >= o.dataFrom && c.closeTime < clock.t && (st === null || c.openTime >= Number(st)));
      return (st === null ? rows.slice(-limit) : rows.slice(0, limit)).map(kRow);
    }
    if (u.pathname === '/fapi/v1/premiumIndex') {
      const next = funding.find((f) => f.t > clock.t)?.t ?? (Math.floor(clock.t / (8 * H)) + 1) * 8 * H;
      const row = { symbol: SYM, markPrice: String(mark), lastFundingRate: String(lastSettled(clock.t)?.r ?? 0), nextFundingTime: next };
      return sym === null ? [row] : row;
    }
    if (u.pathname === '/fapi/v1/fundingRate') {
      const from = Number(q.get('startTime') ?? 0);
      const to = Math.min(Number(q.get('endTime') ?? clock.t), clock.t);
      const limit = Number(q.get('limit') ?? 100);
      return funding.filter((f) => f.t >= from && f.t <= to).slice(0, limit)
        .map((f) => ({ symbol: SYM, fundingTime: f.t, fundingRate: String(f.r), markPrice: String(priceAt(f.t)) }));
    }
    throw new Error(`REST giả của bản chạy lại: chưa hỗ trợ ${path}`);
  }

  // ---- Sàn giả lập THẬT (như CLI main.ts chế độ paper: BTCUSDT dùng phí + trượt của luật) ----
  const contracts = parseContracts({ symbols: [o.contractRaw] });
  const contract = contracts.find((c) => c.symbol === SYM);
  if (contract === undefined) throw new Error('exchangeInfo không có BTCUSDT');
  const paperCosts = new Map<string, FillCost>();
  const paper = createPaperExchange({
    contracts: { [SYM]: contract },
    cost: (s) => paperCosts.get(s) ?? { tierPct: regimeCostPct(), impactPct: COMMON.slippage.pctPerParticipation, vol1m: Infinity },
    startBalance: o.startBalance, statePath: null, now,
    timers: { set: () => null, clear: () => {} }, // phản hồi IOC chỉ đến khi có nhịp giá (bản chạy lại luôn nạp)
    historyLimit: Number.MAX_SAFE_INTEGER, // giữ đủ sổ khớp + funding để tính từng lệnh
  });

  // ---- Nhật ký THẬT (thư mục riêng); giữ lại các sự kiện cần cho báo cáo ----
  const base = openJournal({ dir: o.journalDir, now, warn: (m) => log(`[nhật ký] ${m}`), snapshotEveryMs: 365 * DAY });
  const kept: JournalEvent[] = [];
  const KEEP = new Set(['signal_accepted', 'btc_regime_decision', 'btc_regime_attempt', 'stop_tightened', 'trade_outcome', 'protection_tripped']);
  const journal: Journal = { ...base, append: (b) => { const e = base.append(b); if (KEEP.has(e.type)) kept.push(e); return e; } };

  const urgent: string[] = [];
  let warnCount = 0;
  const stream = (): MarketStreamLike => ({
    start() {}, stop() {}, seedLastClosed() {},
    latestMark: () => ({ price: mark, eventTime: clock.t, receivedAt: clock.t }),
    isMarkStale: () => false, isKlineStale: () => false,
  });
  const deps: BotDeps = {
    mode: 'paper', liveCaps: null, runId: 'replay', now,
    sleep: async (ms) => { clock.t += ms; await new Promise((r) => setImmediate(r)); },
    log, publicGet, api: paper.api, syncClock: async () => 0, paper,
    setPaperCost: (s, c) => paperCosts.set(s, c),
    createUserStream: null,
    createMarketStream: () => stream(),
    journal,
    telegram: () => disabledTelegram({ journal, log, onNotify: (a) => { if (a.level === 'urgent') urgent.push(`${iso(clock.t)} ${a.text}`); if (a.level === 'warn') warnCount++; } }),
    events: [], scanLimit: null, freshWaitMs: 5_000,
  };
  const bot = createBot(deps);

  const get = async (path: string, params: Record<string, string | number>) => (await paper.api.request({ method: 'GET', path, params, createsOrder: false })).body;

  // ---- Kiểm cứng ----
  const violations: string[] = [];
  const filledByDecision = new Map<number, number>();
  const botTrades = () => Object.values(journal.state().trades).filter((t) => t.mode === 'btc-regime');
  const filledQty = (t: ReturnType<typeof botTrades>[number]) => t.fills.filter((f) => f.role === 'E1' || f.role === 'E2').reduce((s, f) => s + f.qty, 0);
  async function check(where: string): Promise<void> {
    const pos = paper.snapshot().positions.find((p) => p.symbol === SYM);
    const amt = pos?.positionAmt ?? 0;
    if (amt === 0) return;
    const r = await paper.api.request({ method: 'GET', path: '/fapi/v1/openAlgoOrders', params: { symbol: SYM }, createsOrder: false });
    const algos = r.body as AlgoRow[];
    if (!algos.some((a) => a.orderType === 'STOP_MARKET' && String(a.closePosition) === 'true' && a.side === 'SELL')) {
      violations.push(`${iso(clock.t)} ${where}: vị thế ${amt} BTC KHÔNG có SL STOP_MARKET closePosition trên sàn`);
    }
    const open = botTrades().filter((t) => t.status !== 'closed' && filledQty(t) > 0);
    if (amt < 0) violations.push(`${iso(clock.t)} ${where}: vị thế Short ${amt}`);
    if (open.length !== 1) violations.push(`${iso(clock.t)} ${where}: vị thế ${amt} nhưng có ${open.length} lệnh bot đang mở có khớp`);
    else if (Math.abs(filledQty(open[0]!) - amt) > contract!.stepSize / 2) violations.push(`${iso(clock.t)} ${where}: vị thế ${amt} ≠ khối lượng khớp của lệnh bot ${filledQty(open[0]!)} (vào trùng?)`);
  }

  // Chạy việc bất đồng bộ của bot. Khi bot chờ phản hồi lệnh IOC/market (lệnh taker còn mở trên sàn), "thời gian trôi" 1 s và sàn nhận
  // MỘT nhịp giá (giá điểm hiện tại). Bot đang ngủ (executor chờ xác nhận — deps.sleep tự tiến đồng hồ) thì chỉ nhường lượt.
  const takerPending = async () => ((await get('/fapi/v1/openOrders', { symbol: SYM })) as Array<{ type: string; timeInForce: string }>)
    .some((x) => x.type === 'MARKET' || x.timeInForce === 'IOC');
  async function drive<T>(p: Promise<T>, what: string): Promise<T> {
    let done = false;
    let out: T | undefined;
    let err: unknown;
    p.then((v) => { done = true; out = v; }, (e: unknown) => { done = true; err = e; });
    for (let i = 0; ; i++) {
      await new Promise((r) => setImmediate(r));
      if (done) break;
      if (i >= 2000) throw new Error(`bản chạy lại (${what}, ${iso(clock.t)}): bot chưa xong sau 2000 lượt`);
      if (!(await takerPending())) continue;
      await check(`trước nhịp giá (${what})`);
      clock.t += 1000;
      paper.feedMark(SYM, { price: point, eventTime: clock.t });
      priceSteps++;
    }
    if (err !== undefined) throw err;
    return out as T;
  }

  // Sàn thu funding ở giờ chốt (kể cả khi bot không kiểm) — mỗi kỳ một lần (feedFunding của sàn giả lập khử trùng)
  let fi = 0;
  function settleFunding(upTo: number): void {
    while (fi < funding.length && Math.floor(funding[fi]!.t / MIN) * MIN <= upTo) {
      const f = funding[fi++]!;
      if (f.t < o.start - 8 * H) continue;
      paper.feedFunding({ symbol: SYM, fundingTime: f.t, fundingRate: f.r, markPrice: priceAt(f.t) });
    }
  }

  // Phần còn lại của nến (sau lượt của bot) quét trên sàn giả lập: giá mở → cực bất lợi → cực có lợi
  async function sweep(c: Candle, what: string): Promise<void> {
    await check(`trước khi giá chạy (${what})`);
    paper.feedKline(SYM, { ...c, openTime: clock.t + 1 });
    priceSteps++;
    mark = c.close;
    point = c.close;
    clock.t = c.closeTime + 1;
    await drive(bot.idle(), `sau ${what}`);
  }

  const days: ReplayResult['days'] = [];
  let hourlyDays = 0;
  for (let D = o.start; D <= o.endDay; D += DAY) {
    const bar = byOpen.get(D)!;
    const hours = o.data.hourly.get(D);
    if (hours !== undefined) hourlyDays++;
    for (let h = 0; h < 24; h++) {
      const hs = D + h * H;
      const hb = hours?.[h];
      point = hb !== undefined ? hb.open : bar.open;
      settleFunding(hs);
      if (h === 0) {
        clock.t = hs + 1000;
        if (D === o.start) {
          await drive(bot.start(), 'khởi động');
          await drive(bot.idle(), 'khởi động');
        } else {
          const prev = byOpen.get(D - DAY)!;
          await drive(bot.onMarketEvent('trigger', { type: 'kline', symbol: SYM, interval: '1d', candle: prev }).then(() => bot.idle()), `nến 1D ${isoDay(prev.openTime)} đóng`);
        }
      }
      clock.t = Math.max(clock.t, hs + MIN);
      await drive(bot.periodic().then(() => bot.idle()), `định kỳ ${iso(hs).slice(0, 13)}h`);
      if (hb !== undefined) await sweep(hb, `nến 1h ${iso(hs).slice(0, 13)}h`);
      else if (h === 23) await sweep(bar, `nến 1D ${isoDay(D)}`);
    }
    const s = paper.snapshot();
    const p = s.positions.find((x) => x.symbol === SYM);
    days.push({ day: D, equity: s.wallet + (p === undefined ? 0 : p.positionAmt * (bar.close - p.entryPrice)) });
  }

  // ---- Sổ của sàn → từng lệnh ----
  const rows = (await get('/fapi/v1/userTrades', { symbol: SYM, limit: Number.MAX_SAFE_INTEGER })) as TradeRow[];
  const income = ((await get('/fapi/v1/income', { symbol: SYM, incomeType: 'FUNDING_FEE' })) as Array<{ income: string; time: number }>).map((r) => ({ time: r.time, income: Number(r.income) }));
  const tightAll = kept.flatMap((e) => (e.type === 'stop_tightened' ? [{ at: e.at, signalId: e.signalId, stop: e.stop }] : []));
  const outcomes = new Map(kept.flatMap((e) => (e.type === 'trade_outcome' ? [[e.outcome.signalId, e.outcome.realizedPnl] as const] : [])));
  const initialStop = new Map(kept.flatMap((e) => (e.type === 'signal_accepted' ? [[e.trade.signalId, e.trade.plan.stop] as const] : [])));
  const exitDecisions = new Set(kept.flatMap((e) => (e.type === 'btc_regime_decision' && e.decision.action === 'exit' && e.decision.signalId !== null ? [e.decision.signalId] : [])));
  const tradeOfOrder = new Map<number, ReturnType<typeof botTrades>[number]>();
  for (const t of botTrades()) for (const f of t.fills) if (f.role === 'E1' || f.role === 'E2') tradeOfOrder.set(f.orderId, t);
  const trades: ReplayTrade[] = [];
  let ep: { rows: TradeRow[]; qty: number } | null = null;
  const lastBar = byOpen.get(o.endDay)!;
  const costFrac = regimeCostPct() / 200;
  const finish = async (e: { rows: TradeRow[] }, open: boolean): Promise<void> => {
    const buys = e.rows.filter((r) => r.side === 'BUY');
    const sells = e.rows.filter((r) => r.side === 'SELL');
    const qty = buys.reduce((s, r) => s + Number(r.qty), 0);
    const entryTime = buys[0]!.time;
    const entryPrice = buys.reduce((s, r) => s + Number(r.price) * Number(r.qty), 0) / qty;
    const t = tradeOfOrder.get(buys[0]!.orderId);
    if (t === undefined) throw new Error(`khớp vào ${iso(entryTime)} không thuộc lệnh bot nào trong nhật ký`);
    let fees = e.rows.reduce((s, r) => s + Number(r.commission), 0);
    let realized = e.rows.reduce((s, r) => s + Number(r.realizedPnl), 0);
    let exitTime: number;
    let exitPrice: number;
    let reason: ReplayTrade['reason'];
    const tight = tightAll.filter((x) => x.signalId === t.signalId);
    if (open) {
      exitTime = lastBar.closeTime;
      exitPrice = lastBar.close;
      realized += qty * (exitPrice - entryPrice);
      fees += qty * exitPrice * costFrac;
      reason = 'hết kỳ';
    } else {
      exitTime = sells[sells.length - 1]!.time;
      const sq = sells.reduce((s, r) => s + Number(r.qty), 0);
      exitPrice = sells.reduce((s, r) => s + Number(r.price) * Number(r.qty), 0) / sq;
      const ord = (await get('/fapi/v1/order', { symbol: SYM, orderId: sells[sells.length - 1]!.orderId })) as { origType?: string };
      reason = ord.origType === 'STOP_MARKET' ? (tight.length > 0 ? 'SL (đã siết)' : 'SL') : exitDecisions.has(t.signalId) ? 'tín hiệu tắt' : 'khác';
    }
    const fund = income.filter((r) => r.time > entryTime && r.time <= exitTime).reduce((s, r) => s + r.income, 0);
    const pnl = realized - fees + fund;
    const eq = t.equityAtEntry ?? NaN;
    trades.push({
      signalId: t.signalId, entryTime, entryPrice, qty, exitTime, exitPrice, reason, fees, funding: fund, pnl, equityAtEntry: eq, lossPct: (-pnl / eq) * 100,
      botPnl: outcomes.get(t.signalId) ?? null, stopInitial: initialStop.get(t.signalId) ?? NaN, stopFinal: t.plan.stop, tightenings: tight.length, // nhật ký cập nhật plan.stop theo mỗi lần siết
      notional: qty * entryPrice,
    });
  };
  for (const r of [...rows].sort((a, b) => a.time - b.time || a.id - b.id)) {
    ep ??= { rows: [], qty: 0 };
    ep.rows.push(r);
    ep.qty = Number((ep.qty + (r.side === 'BUY' ? 1 : -1) * Number(r.qty)).toFixed(6));
    if (ep.qty === 0) { await finish(ep, false); ep = null; }
  }
  if (ep !== null) await finish(ep, true);
  // Vốn cuối: còn vị thế → trừ phí ra ở giá đóng ngày cuối (như mô phỏng đóng "hết-kỳ")
  const lastDay = days[days.length - 1]!;
  const openPos = paper.snapshot().positions.find((x) => x.symbol === SYM);
  if (openPos !== undefined) lastDay.equity -= Math.abs(openPos.positionAmt) * lastBar.close * costFrac;

  // Kiểm cứng: lỗ thật ≤ 2% vốn lúc vào; mỗi nến quyết định tối đa một lần vào khớp
  for (const t of trades) {
    if (!(t.lossPct <= COMMON.risk.perTradePct + 1e-6)) violations.push(`lệnh ${t.signalId}: lỗ thật ${t.lossPct.toFixed(4)}% vốn lúc vào > ${COMMON.risk.perTradePct}%`);
  }
  const attempts = kept.flatMap((e) => (e.type === 'btc_regime_attempt' ? [{ closeTime: e.attempt.closeTime, attempt: e.attempt.attempt, at: e.attempt.at, result: e.attempt.result, placedQty: e.attempt.placedQty, filledQty: e.attempt.filledQty }] : []));
  for (const a of attempts) if (a.filledQty > 0) filledByDecision.set(a.closeTime, (filledByDecision.get(a.closeTime) ?? 0) + 1);
  for (const [ct, n] of filledByDecision) if (n > 1) violations.push(`nến quyết định ${isoDay(ct)}: ${n} lần vào khớp (vào trùng)`);
  const decisions = kept.flatMap((e) => (e.type === 'btc_regime_decision' ? [{ closeTime: e.decision.closeTime, action: e.decision.action, note: e.decision.note, at: e.at }] : []));
  const tripped = kept.filter((e) => e.type === 'protection_tripped');
  if (tripped.length > 0) log(`Cầu chì đã nhảy ${tripped.length} lần`);
  return {
    trades, days, attempts, decisions, tightenings: tightAll, fundingRows: income, violations, urgent, warnCount, priceSteps, hourlyDays,
    endEquity: lastDay.equity,
  };
}

// ---------------------------------------------------------------- chỉ số theo kỳ ---------------------------------------------------
export type WindowMetrics = {
  from: string; to: string; startEq: number; endEq: number; tot: number; cagr: number; dd: number; mar: number; n: number; winPct: number;
  timeInMarket: number; fundingPaidPct: number; worstLossPct: number; iocNoFill: number; iocRetries: number; skipsIoc: number; skipsOther: number; tightenings: number;
};
// Chỉ số trên [from, to] (00:00 UTC hai ngày, tính cả hai) — cùng định nghĩa với btc-regime-sim.ts: vốn đầu = vốn cuối ngày trước (ngày đầu
// kỳ: vốn khởi đầu), CAGR theo 365 ngày, DD trên vốn cuối ngày, lệnh tính theo ngày VÀO, funding theo % vốn khởi đầu, thời gian có vị thế =
// ngày giữ qua giờ đóng hoặc bị SL trong ngày.
export function windowMetrics(r: ReplayResult, from: number, to: number, startBalance: number): WindowMetrics {
  const lo = r.days.findIndex((d) => d.day >= from);
  let hi = -1;
  for (let i = 0; i < r.days.length; i++) if (r.days[i]!.day <= to) hi = i;
  if (lo < 0 || hi < lo) throw new Error(`kỳ ${isoDay(from)}→${isoDay(to)} ngoài dữ liệu chạy`);
  const startEq = lo === 0 ? startBalance : r.days[lo - 1]!.equity;
  const endEq = r.days[hi]!.equity;
  let pk = startEq;
  let dd = 0;
  for (let i = lo; i <= hi; i++) { pk = Math.max(pk, r.days[i]!.equity); dd = Math.max(dd, 1 - r.days[i]!.equity / pk); }
  const n = hi - lo + 1;
  const tot = endEq / startEq - 1;
  const cagr = Math.pow(endEq / startEq, 365 / n) - 1;
  const d0 = r.days[lo]!.day;
  const d1 = r.days[hi]!.day + DAY;
  const tr = r.trades.filter((t) => t.entryTime >= d0 && t.entryTime < d1);
  let inMkt = 0;
  for (let i = lo; i <= hi; i++) {
    const s = r.days[i]!.day;
    const e = s + DAY;
    if (r.trades.some((t) => t.entryTime < e && (t.exitTime >= e - 1 || (t.exitTime >= s && t.reason.startsWith('SL'))))) inMkt++;
  }
  const fund = -r.fundingRows.filter((x) => x.time >= d0 && x.time < d1).reduce((s, x) => s + x.income, 0);
  const inWin = (ct: number) => ct + 1 >= d0 && ct + 1 < d1;
  const att = r.attempts.filter((a) => inWin(a.closeTime));
  const dec = r.decisions.filter((d) => inWin(d.closeTime) && d.action === 'skip');
  return {
    from: isoDay(d0), to: isoDay(d1 - DAY), startEq, endEq, tot, cagr, dd, mar: dd > 0 ? cagr / dd : NaN, n: tr.length,
    winPct: tr.length > 0 ? tr.filter((t) => t.pnl > 0).length / tr.length : NaN, timeInMarket: inMkt / n, fundingPaidPct: fund / startBalance,
    worstLossPct: tr.length > 0 ? Math.max(...tr.map((t) => t.lossPct)) : NaN,
    iocNoFill: att.filter((a) => a.result === 'no_fill').length, iocRetries: att.filter((a) => a.attempt > 1).length,
    skipsIoc: dec.filter((d) => /IOC không khớp/.test(d.note)).length, skipsOther: dec.filter((d) => !/IOC không khớp/.test(d.note)).length,
    tightenings: r.tightenings.filter((x) => x.at >= d0 && x.at < d1).length,
  };
}

// ---------------------------------------------------------------- nạp dữ liệu -------------------------------------------------------
const toCandle = (t: number, o: number, h: number, l: number, c: number, v: number, qv: number): Candle =>
  ({ openTime: t, closeTime: t + DAY - 1, open: o, high: h, low: l, close: c, volume: v, quoteVolume: qv, takerBuyQuote: 0 });

// Nến 1D: data/history/1d/BTCUSDT.json (2020-01-01 →, thiếu kỳ C) + tệp kỳ C + nến 2019 (khởi động, tải từ REST công khai); 1h:
// data/cache/klines/BTCUSDT/1h/YYYY-MM.json (chỉ tháng < mốc cấm; ngày đủ 24 nến); funding: hai tệp tải sẵn (gộp, khử trùng theo giờ).
// Mọi bản ghi ≥ cutoff bị loại TRƯỚC khi dùng và đếm; assertBeforeCutoff kiểm lại sau cùng.
export function loadReplayData(a: { root: string; extraDir: string; cutoff?: number }): ReplayData & { dropped: number } {
  const cutoff = a.cutoff ?? CUTOFF;
  let dropped = 0;
  const daily = new Map<number, Candle>();
  const addDaily = (c: Candle) => { if (c.closeTime >= cutoff) { dropped++; return; } daily.set(c.openTime, c); };
  const hist = JSON.parse(readFileSync(join(a.root, 'data/history/1d/BTCUSDT.json'), 'utf8')) as { rows: number[][] };
  for (const r of hist.rows) addDaily(toCandle(r[0]!, r[1]!, r[2]!, r[3]!, r[4]!, r[5]!, r[6]!));
  const cData = JSON.parse(readFileSync(join(a.extraDir, 'BTCUSDT-1d-C.json'), 'utf8')) as { rows: number[][] };
  for (const r of cData.rows) if (!daily.has(r[0]!)) addDaily(toCandle(r[0]!, r[1]!, r[2]!, r[3]!, r[4]!, r[5]!, r[6]!));
  const warm = JSON.parse(readFileSync(join(a.extraDir, 'BTCUSDT-1d-2019.json'), 'utf8')) as unknown[][];
  for (const r of warm) if (!daily.has(Number(r[0]))) addDaily(toCandle(Number(r[0]), Number(r[1]), Number(r[2]), Number(r[3]), Number(r[4]), Number(r[5]), Number(r[7])));
  const hourly = new Map<number, Candle[]>();
  const dir = join(a.root, 'data/cache/klines/BTCUSDT/1h');
  const cutMonth = iso(cutoff).slice(0, 7);
  const byDay = new Map<number, Candle[]>();
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((x) => /^\d{4}-\d{2}\.json$/.test(x) && x.slice(0, 7) <= cutMonth).sort()) {
      const k = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { candles: number[][] };
      for (const r of k.candles) {
        if (r[1]! >= cutoff) { dropped++; continue; }
        const c: Candle = { openTime: r[0]!, closeTime: r[1]!, open: r[2]!, high: r[3]!, low: r[4]!, close: r[5]!, volume: r[6]!, quoteVolume: r[7]!, takerBuyQuote: r[8]! };
        const d = Math.floor(c.openTime / DAY) * DAY;
        byDay.set(d, [...(byDay.get(d) ?? []), c]);
      }
    }
  }
  for (const [d, cs] of byDay) {
    const s = [...cs].sort((x, y) => x.openTime - y.openTime);
    if (s.length === 24 && s.every((c, i) => c.openTime === d + i * H && c.closeTime === d + (i + 1) * H - 1) && daily.has(d)) hourly.set(d, s);
  }
  const fund = new Map<number, FundingRow>();
  for (const f of ['funding-BTCUSDT.json', 'funding-BTCUSDT-C.json']) {
    for (const x of JSON.parse(readFileSync(join(a.extraDir, f), 'utf8')) as FundingRow[]) {
      if (x.t >= cutoff) { dropped++; continue; }
      fund.set(Math.floor(x.t / MIN), x);
    }
  }
  const out = {
    daily: [...daily.values()].sort((x, y) => x.openTime - y.openTime),
    hourly,
    funding: [...fund.values()].sort((x, y) => x.t - y.t),
    dropped,
  };
  assertBeforeCutoff(out, cutoff);
  return out;
}

// ---------------------------------------------------------------- CLI ---------------------------------------------------------------
const pct = (x: number, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : '—');
const num2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—');

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { out: { type: 'string', default: 'output/bot-replay' }, extra: { type: 'string', default: 'data/history/bot-replay' }, only: { type: 'string' } } });
  const out = resolvePath(REPO_ROOT, values.out);
  mkdirSync(out, { recursive: true });
  const data = loadReplayData({ root: REPO_ROOT, extraDir: resolvePath(REPO_ROOT, values.extra) });
  console.log(`Dữ liệu: ${data.daily.length} nến 1D (${isoDay(data.daily[0]!.openTime)} → ${isoDay(data.daily[data.daily.length - 1]!.openTime)}), ${data.hourly.size} ngày có đủ nến 1h, ${data.funding.length} kỳ funding; loại ${data.dropped} bản ghi ≥ ${isoDay(CUTOFF)} trước khi dùng`);
  const ex = JSON.parse(readFileSync(join(REPO_ROOT, 'data/cache/exchange-info.json'), 'utf8')) as { raw: { symbols: Array<{ symbol: string }> } };
  const contractRaw = ex.raw.symbols.find((s) => s.symbol === SYM);
  const earliest = data.daily[0]!.openTime;
  const windows = [
    { key: 'W1', label: '2020-01-01 → 2025-12-31', start: dayUtc('2020-01-01'), endDay: dayUtc('2025-12-31'), simFrom: dayUtc('2020-01-01') },
    { key: 'C', label: '2026-01-01 → 2026-04-30 (kỳ C)', start: dayUtc('2026-01-01'), endDay: dayUtc('2026-04-30'), simFrom: dayUtc('2025-09-01') },
    { key: 'W3', label: '2026-05-01 → 2026-09-18', start: dayUtc('2026-05-01'), endDay: dayUtc('2026-09-18'), simFrom: dayUtc('2026-05-01') },
  ];
  const variants = [
    { key: 'A', label: 'chỉ báo khởi động cùng ngày với mô phỏng', from: (w: (typeof windows)[number]) => w.simFrom },
    { key: 'B', label: 'chỉ báo khởi động bằng dữ liệu trước kỳ', from: () => earliest },
  ];
  const summary: Record<string, unknown> = {};
  let md = '';
  for (const w of windows) {
    for (const v of variants) {
      const id = `${w.key}-${v.key}`;
      if (values.only !== undefined && !values.only.split(',').includes(id)) continue;
      const dir = join(out, id);
      mkdirSync(dir, { recursive: true });
      const logs: string[] = [];
      const t0 = Date.now();
      const r = await runBotReplay({
        data, contractRaw, dataFrom: v.from(w), start: w.start, endDay: w.endDay, startBalance: 10_000,
        journalDir: mkdtempSync(join(tmpdir(), `bot-replay-${id}-`)), log: (m) => logs.push(m),
      });
      writeFileSync(join(dir, 'bot.log'), logs.join('\n'));
      writeFileSync(join(dir, 'trades.csv'), ['vao,ra,ly_do,gia_vao,gia_ra,kl_btc,notional,von_luc_vao,pnl_usdt,funding_usdt,phi_usdt,lo_that_pct_von,bot_pnl,sl_dau,sl_cuoi,so_lan_siet',
        ...r.trades.map((t) => [iso(t.entryTime), iso(t.exitTime), t.reason, t.entryPrice, t.exitPrice, t.qty, t.notional.toFixed(2), t.equityAtEntry.toFixed(2), t.pnl.toFixed(2), t.funding.toFixed(2), t.fees.toFixed(2), t.lossPct.toFixed(4), t.botPnl?.toFixed(2) ?? '', t.stopInitial, t.stopFinal, t.tightenings].join(','))].join('\n'));
      writeFileSync(join(dir, 'equity.csv'), ['ngay,von', ...r.days.map((d) => `${isoDay(d.day)},${d.equity.toFixed(2)}`)].join('\n'));
      const total = windowMetrics(r, w.start, w.endDay, 10_000);
      const years = w.key === 'W1' ? [2020, 2021, 2022, 2023, 2024, 2025].map((y) => ({ y, m: windowMetrics(r, Date.UTC(y, 0, 1), Date.UTC(y, 11, 31), 10_000) })) : [];
      summary[id] = { total, years, violations: r.violations, urgent: r.urgent, warnCount: r.warnCount, priceSteps: r.priceSteps, hourlyDays: r.hourlyDays, trades: r.trades, attempts: r.attempts, decisions: r.decisions.filter((d) => d.action === 'skip'), tightenings: r.tightenings };
      md += `\n### ${w.label} — biến thể ${v.key} (${v.label}) — ${((Date.now() - t0) / 1000).toFixed(0)} s\n\n`;
      md += `Tổng ${pct(total.tot)} | CAGR ${pct(total.cagr)} | DD ${pct(total.dd)} | MAR ${num2(total.mar)} | lệnh ${total.n} | thắng ${pct(total.winPct, 0)} | có VT ${pct(total.timeInMarket, 0)} | funding ${pct(total.fundingPaidPct, 2)} | lỗ thật lớn nhất ${num2(total.worstLossPct)}% | IOC không khớp ${total.iocNoFill} (thử lại ${total.iocRetries}, bỏ ngày ${total.skipsIoc}) | skip khác ${total.skipsOther} | siết SL ${total.tightenings} | ngày 1h ${r.hourlyDays}\n`;
      for (const { y, m } of years) md += `- ${y}: ${pct(m.tot, 0)} / DD ${pct(m.dd, 0)} / ${m.n} lệnh / funding ${pct(m.fundingPaidPct, 1)}\n`;
      md += `Kiểm cứng: ${r.violations.length === 0 ? 'ĐẠT (0 vi phạm)' : `${r.violations.length} VI PHẠM: ${r.violations.slice(0, 5).join(' | ')}`}; KHẨN ${r.urgent.length}; cảnh báo ${r.warnCount}\n`;
      console.log(md.split('\n### ').pop());
    }
  }
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 1));
  writeFileSync(join(out, 'summary.md'), md);
}

if (process.argv[1] !== undefined && resolvePath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
    process.exit(1);
  });
}
