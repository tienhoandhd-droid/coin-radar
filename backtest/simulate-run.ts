// Mô phỏng theo sự kiện trên kỳ phát triển D (kế hoạch 2, Task 3): tại mỗi mốc quyết định t gọi ĐÚNG runScan qua máy phát lại
// (backtest/replay.ts: buildInput — vốn = vốn ví hiện tại của mô phỏng), cho planner của bot (packages/bot/planner.ts) định cỡ/đặt
// lệnh, rồi chạy lệnh qua nến bằng lõi backtest/simulate.ts. CHỈ kỳ D — máy phát lại tự chặn mọi cửa sổ chạm kỳ mù B.
//
//   node backtest/simulate-run.ts --mode swing|fast [--filter A|all] [--policy C2|A0] [--capital 10000] [--pause-hours 24]
//                                 [--from ISO] [--to ISO] [--fetch-1m] [--dir data/cache]
//
// QUY ƯỚC (ghi rõ để đọc kết quả đúng):
//  - Tín hiệu bot sẽ giao dịch: Đạt tiêu chí + Hạng A + MỚI (--filter A). --filter all: cùng mô phỏng cho MỌI tín hiệu Đạt tiêu chí
//    MỚI — planner chỉ được nới đúng một điều kiện (Hạng A, bằng cách truyền grade 'A'); mọi kiểm khác giữ nguyên.
//  - Một tín hiệu mở mỗi hợp đồng × chế độ; khử trùng bằng signalDedupeKey (replay.ts: mô hình theo mã + patternId + breakoutTime,
//    vùng theo signalId); cooldown cặp + chiều 2 nến khung vào lệnh sau khi lệnh ĐÃ KHỚP đóng (brief Task 3; spec bot ghi "sau SL").
//  - Thứ tự xét tín hiệu trong một mốc = thứ tự kết quả runScan (theo hạng thanh khoản). Lệnh limit chờ khớp vẫn giữ chỗ trong danh mục.
//  - Vốn: ví = vốn đầu + mọi dòng tiền đã chốt (khớp, phí, funding) — KHÔNG gồm lãi/lỗ chưa chốt. 2% tính trên vốn ví lúc vào lệnh.
//  - Cầu chì: 5 lệnh thua / 24 giờ hoặc lỗ trong ngày (so vốn đầu ngày UTC) > 10% → không vào lệnh mới trong --pause-hours giờ
//    (thật: tới khi người dùng cho phép). Sụt 30% từ đỉnh → chỉ đếm cảnh báo.
//  - Hết kỳ D: lệnh còn mở đóng ở giá đóng nến cuối trước mốc kết thúc (không dùng giá của kỳ mù B).
//  - Đường giá của lệnh: 5m nếu bộ đệm có, không thì 15m, không thì 1H (Swing: phần lớn mã ngoài top 150 chỉ có 1H — ghi độ phủ).
//    Nến mơ hồ → 1m trong bộ đệm; --fetch-1m: tải 1m cả ngày UTC theo nhu cầu (fetchWindow1m, trần weight thấp).
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { runScan } from '../scanner/run-scan.ts';
import { COMMON, CONFIG } from '../packages/core/config.ts';
import { withConfigOverride, type ConfigOverride } from '../packages/core/config-override.ts';
import { parseEvents } from '../packages/core/events.ts';
import { advanceSignalState, type SignalState } from '../packages/core/signal.ts';
import { planOrders, type PlannerPlan } from '../packages/bot/planner.ts';
import type { Analysis } from '../packages/core/analyze.ts';
import type { ExitPolicy } from '../packages/core/exit.ts';
import type { Candle, Contract, Mode } from '../packages/core/types.ts';
import { createReplay, decisionTimes, signalDedupeKey, loadContracts, assertWindowAllowed, DEV_PERIOD, type BlindAuth, type FundingRow, type Window } from './replay.ts';
import { fundingFallbackRate, maxAbsFundingRate, meanFundingRate } from '../packages/core/sizing.ts';
import { donchianBreakout } from '../packages/core/breakout.ts';
import { trendSignal, buildTrendPlan } from '../packages/core/trend.ts';
import { mtfSide, h1Trigger, h4TrendOk, buildMtfPlan, frameTrend, alignSetup, m15Trigger, buildAlignPlan, type FrameTrend, type TrendFrame } from '../packages/core/mtf-pullback.ts';
import { marketRegime } from '../packages/core/regime.ts';
import { sideRuleBlocks } from '../packages/core/entry-filters.ts';
import { clusterSymbols } from '../packages/core/risk-cluster.ts';
import { liquidityRanks } from '../scanner/rank.ts';
import type { ScanInput } from '../scanner/run-scan.ts';
import { loadCandles, createFetcher, fetchWindow1m, HOUR, MINUTE, DAY, type Interval, type Fetcher } from './data.ts';
import {
  createTrade, advanceTrade, forceClose, tradeRecord, portfolioView, createBook, bookFlow, bookClose, isPaused, summarize, groupStats, isDone,
  DEFAULT_BOOK, type SimTrade, type TradeRecord, type Book, type Resolver,
} from './simulate.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export type Filter = 'A' | 'all';

// Mốc mỗi 15 phút trong cửa sổ (t = openTime nến 15m kế tiếp — như decisionTimes)
export function quarterHours(w: Window): number[] {
  const out: number[] = [];
  for (let t = Math.ceil(w.start / (15 * MINUTE)) * 15 * MINUTE; t < w.end; t += 15 * MINUTE) out.push(t);
  return out;
}
export type PickState = { used: Set<string>; cooldownUntil: Map<string, number>; active: Set<string> };
export type Pick = { a: Analysis; plan: PlannerPlan; key: string; kind: 'zone' | 'pattern' };

// Cooldown = 2 nến khung vào lệnh (đọc CONFIG lúc gọi — biến thể #2 Task 8 đổi khung Lướt nhanh)
const ENTRY_BAR_MS: Record<string, number> = { '15m': 15 * MINUTE, '1h': HOUR, '4h': 4 * HOUR };
export const cooldownMs = (mode: Mode) => 2 * ENTRY_BAR_MS[CONFIG[mode].entryInterval]!;

const inc = (m: Map<string, number>, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n);

// Tín hiệu được thử vào lệnh tại t (theo thứ tự kết quả). skip đếm lý do bỏ.
// blocks: luật vào lệnh mới của Task 8 (ScanResult.entryBlocks) — bị chặn thì bỏ, đếm theo từng luật (#4, #5, …).
export function pickCandidates(results: readonly Analysis[], filter: Filter, st: PickState, t: number, skip: Map<string, number>,
  blocks: ReadonlyMap<string, string> = new Map()): Pick[] {
  const out: Pick[] = [];
  for (const a of results) {
    if (!a.label.startsWith('Đạt')) continue;
    const ps = a.patternSignal;
    const p = (ps ?? a.plan) as PlannerPlan | null;
    if (p === null || a.signal === null) continue;
    if (!a.signal.fresh) { inc(skip, 'không MỚI (đang giữ)'); continue; }
    if (filter === 'A' && a.grade?.grade !== 'A') { inc(skip, 'không phải Hạng A'); continue; }
    const blocked = blocks.get(a.symbol);
    if (blocked !== undefined) {
      for (const rule of new Set(blocked.match(/#[A-Za-z0-9]+/g) ?? ['?'])) inc(skip, `luật vào lệnh ${rule}`);
      continue;
    }
    const key = signalDedupeKey({ symbol: a.symbol, signalId: a.signal.id, pattern: ps === null ? null : { patternId: ps.patternId, breakoutTime: ps.breakoutTime } });
    if (st.used.has(key)) { inc(skip, 'trùng khóa tín hiệu'); continue; }
    if (st.active.has(a.symbol)) { inc(skip, 'hợp đồng đang có lệnh'); continue; }
    if ((st.cooldownUntil.get(`${a.symbol}|${p.side}`) ?? -Infinity) > t) { inc(skip, 'cooldown cặp + chiều'); continue; }
    out.push({ a, plan: p, key, kind: ps === null ? 'zone' : 'pattern' });
  }
  return out;
}

// |funding| lớn nhất mỗi kỳ trong COMMON.risk.fundingBufferLookbackDays ngày tới t — chỉ các kỳ ĐÃ chốt (fundingTime ≤ t, không nhìn trước)
export function maxAbsFunding(rows: readonly FundingRow[], t: number): number {
  return maxAbsFundingRate(rows, t, COMMON.risk.fundingBufferLookbackDays); // một công thức với máy quét (packages/core/sizing.ts)
}

// Đệm funding cho planner tại t: |funding| lớn nhất 30 ngày; không có kỳ nào (hoặc toàn 0) → mức thận trọng theo chu kỳ (KHÔNG dùng 0,
// planner từ chối 0) và gắn cờ fallback để đếm.
export function fundingBufferAt(rows: readonly FundingRow[], t: number, intervalHours: number): { maxAbsRate: number; intervalHours: number; fallback: boolean } {
  const m = maxAbsFunding(rows, t);
  return m > 0 ? { maxAbsRate: m, intervalHours, fallback: false } : { maxAbsRate: fundingFallbackRate(intervalHours), intervalHours, fallback: true };
}

export type SettleMarks = Map<SimTrade, { flows: number; closed: boolean }>;

// Dòng tiền mới của các lệnh (đã chạy tới cùng một mốc) → sổ vốn theo ĐÚNG thứ tự thời gian; lệnh đóng → đếm thua (cầu chì).
// Trả các lệnh vừa đóng (theo thời điểm đóng).
export function settle(book: Book, trades: readonly SimTrade[], marks: SettleMarks): SimTrade[] {
  type Item = { t: number; order: number; amount?: number; close?: SimTrade };
  const items: Item[] = [];
  for (const tr of trades) {
    const m = marks.get(tr) ?? { flows: 0, closed: false };
    for (let i = m.flows; i < tr.b.flows.length; i++) items.push({ t: tr.b.flows[i]!.t, order: 0, amount: tr.b.flows[i]!.amount });
    m.flows = tr.b.flows.length;
    if (!m.closed && tr.b.closedAt !== null) { items.push({ t: tr.b.closedAt, order: 1, close: tr }); m.closed = true; }
    marks.set(tr, m);
  }
  items.sort((x, y) => x.t - y.t || x.order - y.order);
  const closed: SimTrade[] = [];
  for (const it of items) {
    if (it.close !== undefined) {
      const b = it.close.b;
      if (b.firstFillAt !== null) bookClose(book, it.t, b.gross - b.costs + b.funding);
      closed.push(it.close);
    } else {
      bookFlow(book, it.t, it.amount!);
    }
  }
  return closed;
}

const tierOf = (rank: number): keyof typeof COMMON.costRoundTripPct => (rank <= COMMON.costTierRank.high ? 'high' : rank <= COMMON.costTierRank.mid ? 'mid' : 'low');

// Lý do planner từ chối → nhóm (bỏ số để gom)
const bucket = (reason: string) => reason.replace(/[-\d.,]+/g, '#').slice(0, 70);

export type RunOptions = {
  dir: string; mode: Mode; window: Window; filter: Filter; policy: ExitPolicy; capital: number; pauseHours: number;
  contracts: Contract[]; events: ReturnType<typeof parseEvents>; fetcher: Fetcher | null; log: (m: string) => void;
  // H0 (Task 8): tùy chọn cấu hình đang thử, áp vào CONFIG/COMMON trong lúc chạy rồi trả lại (packages/core/config-override.ts).
  // Mỗi tiến trình chỉ chạy một mô phỏng tại một thời điểm (CONFIG/COMMON là trạng thái chung của module).
  configOverride?: ConfigOverride;
  // Kỳ mù B: chỉ backtest/blind-run.ts truyền (cùng cổng replay.ts checkBlindAuth). Không có → cửa sổ chạm B bị từ chối.
  auth?: BlindAuth;
};

export async function runSimulation(o: RunOptions) {
  assertWindowAllowed(o.window, o.auth); // cổng kỳ mù — TRƯỚC cả ghi đè cấu hình
  return withConfigOverride(o.configOverride, () => simulate(o));
}

async function simulate(o: RunOptions) {
  const rep = createReplay({ dir: o.dir, mode: o.mode, window: o.window, contracts: o.contracts, events: o.events, capital: o.capital, limit: null, ...(o.auth !== undefined ? { auth: o.auth } : {}) });
  // #25–#29 mtf-align: điểm vào theo nến 15m → mốc quyết định mỗi 15 phút (Swing mặc định mỗi giờ)
  const alignOn = COMMON.entryRules.mtfAlign !== null && o.mode === 'swing';
  const times = alignOn ? quarterHours(o.window) : decisionTimes(o.mode, o.window);
  const book = createBook({ capital: o.capital, ...DEFAULT_BOOK, pauseHours: o.pauseHours });
  const active: SimTrade[] = [];
  const done: TradeRecord[] = [];
  const marks: SettleMarks = new Map();
  const st: PickState = { used: new Set(), cooldownUntil: new Map(), active: new Set() };
  let prevSignals = new Map<string, SignalState>();
  const skip = new Map<string, number>();
  const rejects = new Map<string, number>();
  // Chuỗi giá chỉ giữ trong bộ nhớ khi mã đang có lệnh (giải phóng khi lệnh cuối của mã đóng — tránh tràn bộ nhớ ở Lướt nhanh)
  const pathOf = new Map<string, { interval: Interval; candles: Candle[] }>();
  const pathIntervalOf = new Map<string, Interval>(); // độ phủ: khung đã dùng cho từng mã
  const fundingOf = new Map<string, FundingRow[]>();
  const h4Of = new Map<string, Candle[]>(); // C3: nến 4H (khởi động ATR + trong kỳ, cắt tại cuối cửa sổ)
  const d1Of = new Map<string, Candle[]>(); // trend-d1: nến 1D (khởi động 300 ngày cho ATR + trong kỳ, cắt tại cuối cửa sổ)
  const stats = { steps: 0, scanErrors: 0, signalsDat: 0, signalsA: 0, pausedSignals: 0, plannerRejected: 0, opened: 0,
    fundingFallback: 0, trendSignals: 0, trendOpened: 0, mtfTriggers: 0, mtfNoPlan: 0, mtfOpened: 0, alignSetups: 0, alignNoPlan: 0, alignOpenedTrend: 0, alignOpenedRecovery: 0, m1Asked: 0, m1FromCache: 0, m1Fetched: 0, m1Missing: 0, m1FetchErrors: 0, m1FetchDisabled: false as boolean, forcedPeriodEnd: 0 };
  const m1Errors: string[] = [];

  function path(symbol: string): { interval: Interval; candles: Candle[] } {
    let p = pathOf.get(symbol);
    if (p !== undefined) return p;
    const tried: string[] = [];
    for (const iv of ['5m', '15m', '1h'] as const) {
      try {
        p = { interval: iv, candles: loadCandles(o.dir, symbol, iv, o.window.start, o.window.end).candles };
        break;
      } catch (e) {
        tried.push(`${iv}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (p === undefined) throw new Error(`${symbol}: không có chuỗi giá cho mô phỏng (${tried.join(' | ')})`);
    pathOf.set(symbol, p);
    pathIntervalOf.set(symbol, p.interval);
    return p;
  }
  function h4(symbol: string): Candle[] {
    let c = h4Of.get(symbol);
    if (c === undefined) {
      c = loadCandles(o.dir, symbol, '4h', o.window.start - 60 * 4 * HOUR, o.window.end).candles;
      h4Of.set(symbol, c);
    }
    return c;
  }
  function d1(symbol: string): Candle[] {
    let c = d1Of.get(symbol);
    if (c === undefined) {
      c = loadCandles(o.dir, symbol, '1d', o.window.start - 300 * DAY, o.window.end).candles;
      d1Of.set(symbol, c);
    }
    return c;
  }
  function funding(symbol: string): FundingRow[] {
    let f = fundingOf.get(symbol);
    if (f === undefined) {
      const raw = JSON.parse(readFileSync(join(o.dir, 'funding', symbol + '.json'), 'utf8')) as { rows?: FundingRow[] };
      if (!Array.isArray(raw.rows)) throw new Error(`${symbol}: tệp funding thiếu mảng rows`);
      f = raw.rows.filter((r) => r.fundingTime < o.window.end);
      fundingOf.set(symbol, f);
    }
    return f;
  }
  const resolve: Resolver = async (symbol, bar) => {
    if (bar.closeTime + 1 - bar.openTime <= MINUTE) return null; // đã là 1m
    stats.m1Asked++;
    const from = bar.openTime, to = bar.closeTime + 1;
    try {
      const c = loadCandles(o.dir, symbol, '1m', from, to).candles;
      stats.m1FromCache++;
      return c;
    } catch (e) {
      // chỉ "chưa có/chưa phủ trong bộ đệm" mới được tải; lỗi khác (tệp hỏng…) nổi lên
      if (!/thiếu tệp đệm|không phủ cửa sổ/.test(e instanceof Error ? e.message : String(e))) throw e;
    }
    if (o.fetcher === null || stats.m1FetchDisabled) { stats.m1Missing++; return null; }
    try {
      const day = Math.floor(from / DAY) * DAY;
      await fetchWindow1m(o.fetcher, symbol, day, day + DAY);
      const c = loadCandles(o.dir, symbol, '1m', from, to).candles;
      stats.m1Fetched++;
      return c;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      stats.m1FetchErrors++;
      if (m1Errors.length < 10) m1Errors.push(`${symbol} ${new Date(from).toISOString()}: ${msg}`);
      if (/418|429|chặn/.test(msg)) { stats.m1FetchDisabled = true; o.log(`DỪNG tải 1m (sàn chặn): ${msg}`); }
      return null;
    }
  };

  function closeOut(closed: SimTrade[]) {
    for (const tr of closed) {
      const i = active.indexOf(tr);
      if (i >= 0) active.splice(i, 1);
      st.active.delete(tr.k.symbol);
      if (!active.some((x) => x.k.symbol === tr.k.symbol)) { pathOf.delete(tr.k.symbol); fundingOf.delete(tr.k.symbol); h4Of.delete(tr.k.symbol); d1Of.delete(tr.k.symbol); }
      if (tr.b.firstFillAt !== null) st.cooldownUntil.set(`${tr.k.symbol}|${tr.k.side}`, tr.b.closedAt! + cooldownMs(o.mode));
      done.push(tradeRecord(tr));
    }
  }

  async function advanceAll(until: number) {
    for (const tr of active) {
      await advanceTrade(tr, path(tr.k.symbol).candles, until, { funding: funding(tr.k.symbol), resolve, ...(o.policy === 'C3' ? { h4: h4(tr.k.symbol) } : {}),
        ...(tr.k.trend ? { d1: d1(tr.k.symbol) } : {}) });
    }
    closeOut(settle(book, active, marks));
  }

  // risk-cluster (COMMON.portfolio.cluster): nến 1D đã đóng tại t (qua máy phát lại — closeTime < t) của mã mới, mã đang mở và BTC
  async function clusterDaily(input: ScanInput, symbol: string): Promise<{ clusterDaily: Map<string, Candle[]> } | Record<string, never>> {
    const cl = COMMON.portfolio.cluster;
    if (cl === null) return {};
    const n = Math.max(cl.corrDays, cl.betaDays) + 2; // máy phát lại trả limit − 1 nến đã đóng → đủ max(corrDays, betaDays) lợi suất
    const m = new Map<string, Candle[]>();
    for (const s of clusterSymbols(symbol, portfolioView(active))) m.set(s, await input.klines(s, '1d', n));
    return { clusterDaily: m };
  }

  // trend-d1 (COMMON.trend, chỉ Swing): đúng lúc nến 1D đóng (t = 00:00 UTC) xét vũ trụ top swingUniverseSize thanh khoản tại t (như runScan),
  // tín hiệu Donchian giá đóng → kế hoạch (core/trend.ts) → CÙNG planner (định cỡ 2%, danh mục, risk-cluster) → lệnh market ở nến kế tiếp.
  // Không qua cổng/điểm của máy quét (hệ riêng, theo đăng ký trước); luật sides/FGI-hướng/minListingDays áp như lệnh vùng (sideRuleBlocks).
  async function trendStep(t: number, input: ScanInput, capital: number): Promise<void> {
    const ranks = liquidityRanks(input.tickers);
    let universe = [...input.contracts].sort((a, b) => (ranks.get(a.symbol) ?? 1) - (ranks.get(b.symbol) ?? 1));
    if (COMMON.entryRules.swingUniverseSize !== null) universe = universe.slice(0, COMMON.entryRules.swingUniverseSize);
    const onboardDate = new Map(input.contracts.map((c) => [c.symbol, c.onboardDate]));
    for (const contract of universe) {
      const sym = contract.symbol;
      const daily = await input.klines(sym, '1d', CONFIG.swing.trendLimit);
      const sig = trendSignal(daily, t);
      if (sig === null) continue;
      stats.trendSignals++;
      const key = `${sym}|trend|${sig.side}|${sig.barOpenTime}`;
      if (st.used.has(key)) { inc(skip, 'trend: trùng khóa tín hiệu'); continue; }
      if (st.active.has(sym)) { inc(skip, 'trend: hợp đồng đang có lệnh'); continue; }
      if ((st.cooldownUntil.get(`${sym}|${sig.side}`) ?? -Infinity) > t) { inc(skip, 'trend: cooldown cặp + chiều'); continue; }
      const blocks = sideRuleBlocks(sym, sig.side, { mode: 'swing', ...(input.fgi !== undefined ? { fgi: input.fgi } : {}), now: t, onboardDate });
      if (blocks.length > 0) {
        for (const rule of new Set(blocks.join(' ').match(/#[A-Za-z0-9]+/g) ?? ['?'])) inc(skip, `trend: luật vào lệnh ${rule}`);
        continue;
      }
      const premium = input.premiums.get(sym);
      if (premium === undefined) { inc(skip, 'trend: thiếu giá mark/funding'); continue; }
      const h1 = (await input.klines(sym, '1h', COMMON.slippage.volumeBars1h + 1)).slice(-COMMON.slippage.volumeBars1h);
      const vol1m = h1.reduce((x, c) => x + c.quoteVolume, 0) / h1.length / 60;
      if (!(vol1m > 0)) throw new Error(`${sym}: không ước được khối lượng 1 phút tại ${new Date(t).toISOString()}`);
      const fb = fundingBufferAt(funding(sym), t, input.fundingIntervals.get(sym) ?? COMMON.defaultFundingIntervalHours);
      if (fb.fallback) stats.fundingFallback++;
      const tierPct = COMMON.costRoundTripPct[tierOf(ranks.get(sym) ?? 1)];
      const costModel = { tierPct, quoteVolPerMin: vol1m };
      const fundingBuffer = { maxAbsRate: fb.maxAbsRate, intervalHours: fb.intervalHours };
      const plan = buildTrendPlan({ signal: sig, markPrice: premium.markPrice, h4: await input.klines(sym, '4h', 31), tickSize: contract.tickSize,
        stepSize: contract.stepSize, capital, riskPct: COMMON.risk.perTradePct, cost: costModel, fundingBuffer });
      const pr = planOrders({
        simulation: true, // không theo cờ triển khai COMMON.bot.modes
        plan, grade: 'A', // hệ trend-d1 không chấm hạng (không qua máy quét) — mọi tín hiệu đi tiếp như --filter all
        signal: { id: key, fresh: true }, mode: o.mode, contract, capital, openTrades: portfolioView(active), openOrderCount: 0,
        maxNotional: COMMON.slippage.maxParticipation * vol1m, markPrice: premium.markPrice, runId: 'sim', now: t, costModel, fundingBuffer,
        fundingMeanRate: meanFundingRate(funding(sym), t), trendSim: true, ...(await clusterDaily(input, sym)),
      });
      if (!pr.allowed) {
        stats.plannerRejected++;
        for (const why of pr.reasons.length > 0 ? pr.reasons : ['(không lý do)']) inc(rejects, bucket(why));
        continue;
      }
      const tr = createTrade({
        id: `${o.mode}-${stats.opened + 1}`, symbol: sym, mode: o.mode, policy: o.policy, placedAt: t, equityAtEntry: capital, contract,
        plan, planner: pr, pathInterval: path(sym).interval,
        cost: { tierPct, impactPct: COMMON.slippage.pctPerParticipation, vol1m },
        meta: { grade: null, label: `trend-d1 ${sig.side === 'long' ? 'Long' : 'Short'}`, kind: 'trend', score: 0, signalId: key, key, afterTp1: null },
      });
      stats.opened++;
      stats.trendOpened++;
      active.push(tr);
      st.used.add(key);
      st.active.add(sym);
    }
  }

  // #24 mtf-pullback (COMMON.entryRules.mtfPullback, chỉ Swing): MỖI GIỜ xét vũ trụ top swingUniverseSize tại t; điều kiện rẻ trước
  // (chế độ BTC → phía, nến 1H vừa đóng cắt EMA20, đóng 4H so EMA50) rồi mới dựng vùng "clean" 1D/4H (core/mtf-pullback.ts) → CÙNG planner.
  async function mtfStep(t: number, input: ScanInput, capital: number): Promise<void> {
    const cfg = COMMON.entryRules.mtfPullback!;
    const regime = marketRegime(await input.klines('BTCUSDT', '1d', 400)).regime;
    const side = mtfSide(regime);
    if (side === null) { inc(skip, 'mtf: chế độ BTC Đi ngang — không vào'); return; }
    const ranks = liquidityRanks(input.tickers);
    let universe = [...input.contracts].sort((a, b) => (ranks.get(a.symbol) ?? 1) - (ranks.get(b.symbol) ?? 1));
    if (COMMON.entryRules.swingUniverseSize !== null) universe = universe.slice(0, COMMON.entryRules.swingUniverseSize);
    const onboardDate = new Map(input.contracts.map((c) => [c.symbol, c.onboardDate]));
    for (const contract of universe) {
      const sym = contract.symbol;
      const h1 = await input.klines(sym, '1h', 101);
      const lastH1 = h1[h1.length - 1];
      if (lastH1 === undefined || lastH1.closeTime + 1 !== t) continue; // nến 1H chưa đóng đúng lúc t (thiếu dữ liệu/ngừng giao dịch)
      if (!h1Trigger(h1, side, cfg.emaH1)) continue;
      const h4 = await input.klines(sym, '4h', CONFIG.swing.entryLimit);
      if (!h4TrendOk(h4, side, cfg.emaH4)) continue;
      stats.mtfTriggers++;
      const key = `${sym}|mtf|${side}|${lastH1.openTime}`;
      if (st.used.has(key)) { inc(skip, 'mtf: trùng khóa tín hiệu'); continue; }
      if (st.active.has(sym)) { inc(skip, 'mtf: hợp đồng đang có lệnh'); continue; }
      if ((st.cooldownUntil.get(`${sym}|${side}`) ?? -Infinity) > t) { inc(skip, 'mtf: cooldown cặp + chiều'); continue; }
      const blocks = sideRuleBlocks(sym, side, { mode: 'swing', ...(input.fgi !== undefined ? { fgi: input.fgi } : {}), now: t, onboardDate });
      if (blocks.length > 0) {
        for (const rule of new Set(blocks.join(' ').match(/#[A-Za-z0-9]+/g) ?? ['?'])) inc(skip, `mtf: luật vào lệnh ${rule}`);
        continue;
      }
      const premium = input.premiums.get(sym);
      if (premium === undefined) { inc(skip, 'mtf: thiếu giá mark/funding'); continue; }
      const vb = h1.slice(-COMMON.slippage.volumeBars1h);
      const vol1m = vb.reduce((x, c) => x + c.quoteVolume, 0) / vb.length / 60;
      if (!(vol1m > 0)) throw new Error(`${sym}: không ước được khối lượng 1 phút tại ${new Date(t).toISOString()}`);
      const fb = fundingBufferAt(funding(sym), t, input.fundingIntervals.get(sym) ?? COMMON.defaultFundingIntervalHours);
      const tierPct = COMMON.costRoundTripPct[tierOf(ranks.get(sym) ?? 1)];
      const costModel = { tierPct, quoteVolPerMin: vol1m };
      const fundingBuffer = { maxAbsRate: fb.maxAbsRate, intervalHours: fb.intervalHours };
      const m = buildMtfPlan({ side, h1, h4, d1: await input.klines(sym, '1d', CONFIG.swing.trendLimit), now: t, markPrice: premium.markPrice,
        tickSize: contract.tickSize, stepSize: contract.stepSize, capital, riskPct: COMMON.risk.perTradePct, cost: costModel, fundingBuffer, cfg });
      if (m.plan === null) { stats.mtfNoPlan++; inc(skip, bucket(m.reason)); continue; }
      if (fb.fallback) stats.fundingFallback++;
      const pr = planOrders({
        simulation: true, // không theo cờ triển khai COMMON.bot.modes
        plan: m.plan, grade: 'A', // hệ mtf-pullback không chấm hạng (không qua máy quét) — mọi tín hiệu đi tiếp như --filter all
        signal: { id: key, fresh: true }, mode: o.mode, contract, capital, openTrades: portfolioView(active), openOrderCount: 0,
        maxNotional: COMMON.slippage.maxParticipation * vol1m, markPrice: premium.markPrice, runId: 'sim', now: t, costModel, fundingBuffer,
        fundingMeanRate: meanFundingRate(funding(sym), t), ...(await clusterDaily(input, sym)),
      });
      if (!pr.allowed) {
        stats.plannerRejected++;
        for (const why of pr.reasons.length > 0 ? pr.reasons : ['(không lý do)']) inc(rejects, bucket(why));
        continue;
      }
      const tr = createTrade({
        id: `${o.mode}-${stats.opened + 1}`, symbol: sym, mode: o.mode, policy: o.policy, placedAt: t, equityAtEntry: capital, contract,
        plan: m.plan, planner: pr, pathInterval: path(sym).interval,
        cost: { tierPct, impactPct: COMMON.slippage.pctPerParticipation, vol1m },
        meta: { grade: null, label: `mtf-pullback ${side === 'long' ? 'Long' : 'Short'}`, kind: 'mtf', score: 0, signalId: key, key, afterTp1: null },
      });
      stats.opened++;
      stats.mtfOpened++;
      active.push(tr);
      st.used.add(key);
      st.active.add(sym);
    }
  }

  // #25–#29 mtf-align (COMMON.entryRules.mtfAlign, chỉ Swing): MỖI 15 PHÚT xét vũ trụ top swingUniverseSize tại t; nến 15m kích hoạt (rẻ) trước,
  // rồi xu hướng các khung cấu hình (core/mtf-pullback.ts frameTrend/alignSetup), rồi vùng "clean" cho TP1 → CÙNG planner (sàn chi phí bật
  // bằng COMMON.risk.maxCostR trong biến thể). Lệnh hồi phục (#26): chốt 100% tại TP1, giữ ≤ recoveryMaxHoldHours (exitOverride).
  const FRAME_BARS: Record<TrendFrame, number> = { '15m': 200, '1h': 200, '4h': CONFIG.swing.entryLimit, '1d': CONFIG.swing.trendLimit };
  async function alignStep(t: number, input: ScanInput, capital: number): Promise<void> {
    const cfg = COMMON.entryRules.mtfAlign!;
    const ranks = liquidityRanks(input.tickers);
    let universe = [...input.contracts].sort((a, b) => (ranks.get(a.symbol) ?? 1) - (ranks.get(b.symbol) ?? 1));
    if (COMMON.entryRules.swingUniverseSize !== null) universe = universe.slice(0, COMMON.entryRules.swingUniverseSize);
    const onboardDate = new Map(input.contracts.map((c) => [c.symbol, c.onboardDate]));
    const need: TrendFrame[] = [...new Set<TrendFrame>([...cfg.frames, ...(cfg.recovery ? ['1d', '4h', '1h'] as TrendFrame[] : [])])];
    for (const contract of universe) {
      const sym = contract.symbol;
      const m15 = await input.klines(sym, '15m', FRAME_BARS['15m']);
      const lastM = m15[m15.length - 1];
      if (lastM === undefined || lastM.closeTime + 1 !== t) continue; // nến 15m chưa đóng đúng lúc t
      const trig = { long: m15Trigger(m15, 'long', cfg), short: m15Trigger(m15, 'short', cfg) };
      if (!trig.long && !trig.short) continue;
      const bars = new Map<TrendFrame, Awaited<ReturnType<ScanInput['klines']>>>([['15m', m15]]);
      const barsOf = async (f: TrendFrame) => { let b = bars.get(f); if (b === undefined) { b = await input.klines(sym, f, FRAME_BARS[f]); bars.set(f, b); } return b; };
      const trends: Partial<Record<TrendFrame, FrameTrend>> = {};
      for (const f of need) trends[f] = frameTrend(await barsOf(f), cfg.emaFast, cfg.emaSlow);
      const setup = alignSetup(trends, cfg.frames, cfg.recovery);
      if (setup === null || !trig[setup.side]) continue;
      const side = setup.side;
      stats.alignSetups++;
      const key = `${sym}|align|${side}|${lastM.openTime}`;
      if (st.used.has(key)) { inc(skip, 'align: trùng khóa tín hiệu'); continue; }
      if (st.active.has(sym)) { inc(skip, 'align: hợp đồng đang có lệnh'); continue; }
      if ((st.cooldownUntil.get(`${sym}|${side}`) ?? -Infinity) > t) { inc(skip, 'align: cooldown cặp + chiều'); continue; }
      const blocks = sideRuleBlocks(sym, side, { mode: 'swing', ...(input.fgi !== undefined ? { fgi: input.fgi } : {}), now: t, onboardDate });
      if (blocks.length > 0) {
        for (const rule of new Set(blocks.join(' ').match(/#[A-Za-z0-9]+/g) ?? ['?'])) inc(skip, `align: luật vào lệnh ${rule}`);
        continue;
      }
      if (!input.premiums.has(sym)) { inc(skip, 'align: thiếu giá mark/funding'); continue; }
      // Giá mark tại mốc 15m = giá đóng nến 15m vừa đóng (quy ước 4 của replay.ts cho khung 15m). premiums của máy phát lại Swing lấy
      // giá đóng nến 1H đã đóng cuối → cũ tới 45 phút ở mốc :15/:30/:45 → giá tối đa/IOC sai.
      const mark = lastM.close;
      const h1 = await barsOf('1h');
      const vb = h1.slice(-COMMON.slippage.volumeBars1h);
      const vol1m = vb.reduce((x, c) => x + c.quoteVolume, 0) / vb.length / 60;
      if (!(vol1m > 0)) throw new Error(`${sym}: không ước được khối lượng 1 phút tại ${new Date(t).toISOString()}`);
      const fb = fundingBufferAt(funding(sym), t, input.fundingIntervals.get(sym) ?? COMMON.defaultFundingIntervalHours);
      const tierPct = COMMON.costRoundTripPct[tierOf(ranks.get(sym) ?? 1)];
      const costModel = { tierPct, quoteVolPerMin: vol1m };
      const fundingBuffer = { maxAbsRate: fb.maxAbsRate, intervalHours: fb.intervalHours };
      const kindVn = setup.kind === 'trend' ? 'xu hướng' : 'hồi phục';
      const label = `mtf-align ${kindVn} ${side === 'long' ? 'Long' : 'Short'}`;
      const m = buildAlignPlan({ side, m15, h1, h4: await barsOf('4h'), d1: await barsOf('1d'), now: t, markPrice: mark,
        tickSize: contract.tickSize, stepSize: contract.stepSize, capital, riskPct: COMMON.risk.perTradePct, cost: costModel, fundingBuffer, cfg, label });
      if (m.plan === null) { stats.alignNoPlan++; inc(skip, bucket(m.reason)); continue; }
      if (fb.fallback) stats.fundingFallback++;
      const pr = planOrders({
        simulation: true, // không theo cờ triển khai COMMON.bot.modes
        plan: m.plan, grade: 'A', // hệ mtf-align không chấm hạng (không qua máy quét)
        signal: { id: key, fresh: true }, mode: o.mode, contract, capital, openTrades: portfolioView(active), openOrderCount: 0,
        maxNotional: COMMON.slippage.maxParticipation * vol1m, markPrice: mark, runId: 'sim', now: t, costModel, fundingBuffer,
        fundingMeanRate: meanFundingRate(funding(sym), t), ...(await clusterDaily(input, sym)),
      });
      if (!pr.allowed) {
        stats.plannerRejected++;
        for (const why of pr.reasons.length > 0 ? pr.reasons : ['(không lý do)']) inc(rejects, bucket(why));
        continue;
      }
      const tr = createTrade({
        id: `${o.mode}-${stats.opened + 1}`, symbol: sym, mode: o.mode, policy: o.policy, placedAt: t, equityAtEntry: capital, contract,
        plan: m.plan, planner: pr, pathInterval: path(sym).interval,
        cost: { tierPct, impactPct: COMMON.slippage.pctPerParticipation, vol1m },
        meta: { grade: null, label, kind: 'mtf', score: 0, signalId: key, key, afterTp1: null },
        ...(setup.kind === 'recovery' ? { exitOverride: { tp1Pct: 100 as const, maxHoldHours: cfg.recoveryMaxHoldHours } } : {}),
      });
      stats.opened++;
      if (setup.kind === 'trend') stats.alignOpenedTrend++; else stats.alignOpenedRecovery++;
      active.push(tr);
      st.used.add(key);
      st.active.add(sym);
    }
  }

  const trendOn = COMMON.trend.enabled && o.mode === 'swing';
  const mtfOn = COMMON.entryRules.mtfPullback !== null && o.mode === 'swing';
  const zonesOn = !(trendOn && COMMON.trend.replaceZones) && !mtfOn && !alignOn; // mtf-pullback / mtf-align thay hoàn toàn lệnh vùng Swing
  const started = performance.now();
  const progress = (k: number, t: number) => {
    if (k % 100 === 0 || k === times.length - 1) {
      const el = (performance.now() - started) / 1000;
      o.log(`[${k + 1}/${times.length}] ${new Date(t).toISOString()} | vốn ${book.equity.toFixed(0)} | mở ${active.length} | xong ${done.length} | 1m hỏi ${stats.m1Asked} tải ${stats.m1Fetched} | ${el.toFixed(0)} s`);
    }
  };
  for (let k = 0; k < times.length; k++) {
    const t = times[k]!;
    await advanceAll(t);
    if (!zonesOn) {
      // trend-d1 / mtf-pullback thay hoàn toàn lệnh vùng: không chạy máy quét; trend-d1 chỉ dựng dữ liệu theo thời điểm lúc nến 1D đóng
      const daily = trendOn && t % DAY === 0;
      const hourly = mtfOn && t % HOUR === 0;
      if ((daily || hourly || alignOn) && !isPaused(book, t)) {
        stats.steps++;
        const input = rep.buildInput(t, { openTrades: portfolioView(active), prevSignals });
        if (daily) await trendStep(t, input, book.equity);
        if (hourly) await mtfStep(t, input, book.equity);
        if (alignOn) await alignStep(t, input, book.equity);
      }
      progress(k, t);
      continue;
    }
    const input = rep.buildInput(t, { openTrades: portfolioView(active), prevSignals });
    const capital = book.equity;
    const r = await runScan({ ...input, capital });
    stats.steps++;
    stats.scanErrors += r.errors.length;
    const next = new Map(prevSignals);
    for (const a of r.results) {
      const s = advanceSignalState(prevSignals.get(a.symbol) ?? null, a.signal, t);
      if (s === null) next.delete(a.symbol); else next.set(a.symbol, s);
    }
    prevSignals = next;
    const dat = r.results.filter((a) => a.label.startsWith('Đạt') && a.signal?.fresh);
    stats.signalsDat += dat.length;
    stats.signalsA += dat.filter((a) => a.grade?.grade === 'A').length;
    if (isPaused(book, t)) { stats.pausedSignals += dat.length; continue; }
    for (const pick of pickCandidates(r.results, o.filter, st, t, skip, r.entryBlocks)) {
      const a = pick.a;
      const contract = input.contracts.find((c) => c.symbol === a.symbol);
      const premium = input.premiums.get(a.symbol);
      if (contract === undefined || premium === undefined) throw new Error(`${a.symbol}: tín hiệu có nhưng thiếu hợp đồng/giá mark tại ${new Date(t).toISOString()}`);
      const h1 = (await input.klines(a.symbol, '1h', COMMON.slippage.volumeBars1h + 1)).slice(-COMMON.slippage.volumeBars1h);
      const vol1m = h1.reduce((s, c) => s + c.quoteVolume, 0) / h1.length / 60;
      if (!(vol1m > 0)) throw new Error(`${a.symbol}: không ước được khối lượng 1 phút tại ${new Date(t).toISOString()}`);
      const fb = fundingBufferAt(funding(a.symbol), t, input.fundingIntervals.get(a.symbol) ?? COMMON.defaultFundingIntervalHours);
      // #3 (tùy chọn): kế hoạch không TP1 → planner cần biết giá đóng 1D đã phá đỉnh Donchian chưa (nến 1D đã đóng tại t)
      let breakout: { closeAboveDonchian: boolean } | undefined;
      if (COMMON.breakout.enabled && (pick.plan.targets[0]?.price ?? null) === null) {
        const n = COMMON.breakout.donchianDays;
        const ok = donchianBreakout(await input.klines(a.symbol, '1d', n + 2), n);
        if (ok !== null) breakout = { closeAboveDonchian: ok };
      }
      if (fb.fallback) stats.fundingFallback++;
      const pr = planOrders({
        simulation: true, // không theo cờ triển khai COMMON.bot.modes
        plan: pick.plan, grade: o.filter === 'all' ? 'A' : (a.grade?.grade ?? null), signal: { id: a.signal!.id, fresh: a.signal!.fresh },
        mode: o.mode, contract, capital, openTrades: portfolioView(active), openOrderCount: 0,
        maxNotional: COMMON.slippage.maxParticipation * vol1m, markPrice: premium.markPrice, runId: 'sim', now: t,
        costModel: { tierPct: COMMON.costRoundTripPct[tierOf(r.ranks.get(a.symbol) ?? 1)], quoteVolPerMin: vol1m },
        fundingBuffer: { maxAbsRate: fb.maxAbsRate, intervalHours: fb.intervalHours },
        fundingMeanRate: meanFundingRate(funding(a.symbol), t), // #1 sàn chi phí (chỉ dùng khi bật)
        ...(breakout !== undefined ? { breakout } : {}),
        ...(await clusterDaily(input, a.symbol)),
      });
      if (!pr.allowed) {
        stats.plannerRejected++;
        for (const why of pr.reasons.length > 0 ? pr.reasons : ['(không lý do)']) inc(rejects, bucket(why));
        continue;
      }
      const ps = a.patternSignal;
      const tr = createTrade({
        id: `${o.mode}-${stats.opened + 1}`, symbol: a.symbol, mode: o.mode, policy: o.policy, placedAt: t, equityAtEntry: capital, contract,
        plan: pick.plan, planner: pr, pathInterval: path(a.symbol).interval,
        cost: { tierPct: COMMON.costRoundTripPct[tierOf(r.ranks.get(a.symbol) ?? 1)], impactPct: COMMON.slippage.pctPerParticipation, vol1m },
        meta: { grade: a.grade?.grade ?? null, label: a.label, kind: pick.kind, score: a.best.score, signalId: a.signal!.id, key: pick.key,
          afterTp1: ps === null ? null : { rule: ps.afterTp1Rule, ruleIfMarketOnly: ps.afterTp1RuleIfMarketOnly } },
      });
      stats.opened++;
      active.push(tr);
      st.used.add(pick.key);
      st.active.add(a.symbol);
    }
    if (trendOn && t % DAY === 0) await trendStep(t, input, book.equity); // replaceZones = false: trend-d1 chạy song song lệnh vùng
    progress(k, t);
  }
  // Hết kỳ: chạy tới mốc cuối rồi đóng phần còn lại ở giá đóng nến cuối TRƯỚC mốc cuối
  await advanceAll(o.window.end);
  for (const tr of [...active]) {
    if (isDone(tr)) continue;
    const c = path(tr.k.symbol).candles;
    const last = c[c.length - 1];
    if (last === undefined) throw new Error(`${tr.k.symbol}: không có nến để đóng cuối kỳ`);
    if (tr.b.firstFillAt !== null) stats.forcedPeriodEnd++;
    forceClose(tr, Math.min(last.closeTime + 1, o.window.end), last.close, 'period_end');
  }
  closeOut(settle(book, active, marks));
  done.sort((x, y) => (x.exitTime ?? x.placedAt).localeCompare(y.exitTime ?? y.placedAt));
  return { done, book, stats, skip, rejects, m1Errors, pathIntervalOf, wallSeconds: (performance.now() - started) / 1000 };
}

// Thống kê theo nhóm cho báo cáo
export function report(res: Awaited<ReturnType<typeof runSimulation>>, o: Omit<RunOptions, 'contracts' | 'events' | 'fetcher' | 'log'>) {
  const recs = res.done;
  const filled = recs.filter((r) => r.filled);
  const base = summarize(recs, { capital: o.capital, equity: res.book.equity, maxDdPct: res.book.maxDdPct });
  const by = (f: (r: TradeRecord) => string) => {
    const m = new Map<string, TradeRecord[]>();
    for (const r of filled) m.set(f(r), [...(m.get(f(r)) ?? []), r]);
    return Object.fromEntries([...m].sort().map(([k, v]) => [k, groupStats(v)]));
  };
  const count = (f: (r: TradeRecord) => string | null) => {
    const m = new Map<string, number>();
    for (const r of recs) { const k = f(r); if (k !== null) inc(m, k); }
    return Object.fromEntries([...m].sort());
  };
  const sumFlag = (f: (r: TradeRecord) => number) => filled.reduce((s, r) => s + f(r), 0);
  const pcts = filled.map((r) => r.pctEquity).sort((a, b) => a - b);
  const q = (p: number) => (pcts.length === 0 ? null : pcts[Math.min(pcts.length - 1, Math.floor(p * pcts.length))]!);
  return {
    mode: o.mode, period: 'dev', window: { start: new Date(o.window.start).toISOString(), end: new Date(o.window.end).toISOString() },
    filter: o.filter, policy: o.policy, capital: o.capital, pauseHours: o.pauseHours,
    finalEquity: res.book.equity, ...base,
    bySide: by((r) => r.side), byGrade: by((r) => r.grade ?? '?'), byKind: by((r) => r.kind), byPath: by((r) => r.pathInterval), byReason: count((r) => r.reason),
    lossPctDistribution: { worst: pcts[0] ?? null, p01: q(0.01), p05: q(0.05), p10: q(0.1), median: q(0.5), lossesOver2pct: base.all.breaches2pct.count,
      lossesOver1_9pct: pcts.filter((x) => x < -1.9).length },
    orders: {
      placed: recs.length, filled: filled.length, iocNoFill: recs.filter((r) => r.reason === 'ioc_nofill').length,
      limitUnfilled: recs.filter((r) => r.reason === 'limit_unfilled').length, iocPartial: filled.filter((r) => r.flags.iocPartial).length,
      entryTypes: count((r) => r.entryType),
    },
    intrabar: {
      gapStops: filled.filter((r) => r.flags.gap).length, resolvedBars: sumFlag((r) => r.flags.resolvedBars), unresolvedBars: sumFlag((r) => r.flags.unresolvedBars), unresolvedTrailingBars: sumFlag((r) => r.flags.unresolvedTrailing),
      tradesWithUnresolved: filled.filter((r) => r.flags.unresolvedBars > 0).length, liquidations: filled.filter((r) => r.flags.liquidation).length,
    },
    costs: { gross: sumFlag((r) => r.gross), costs: sumFlag((r) => r.costs), funding: sumFlag((r) => r.funding) },
    sizing: (() => {
      const rp = filled.map((r) => r.sizing.plannedRiskPct).sort((x, y) => x - y);
      const notes = new Map<string, number>();
      for (const r of filled) for (const n of r.sizing.notes) inc(notes, bucket(n));
      const oneR = filled.map((r) => (r.riskAtFill / r.equityAtEntry) * 100).sort((x, y) => x - y); // 1R của khối lượng đã khớp, % vốn lúc vào
      return { plannedRiskPctMedian: rp.length > 0 ? rp[rp.length >> 1]! : null, plannedUnder1_9pct: rp.filter((x) => x < 1.9).length,
        oneRPctMedian: oneR.length > 0 ? oneR[oneR.length >> 1]! : null,
        fundingGuard: { tightenedTrades: filled.filter((r) => r.flags.fundingGuardTightened > 0).length, closedTrades: filled.filter((r) => r.flags.fundingGuardClosed > 0).length },
        reductionReasons: Object.fromEntries([...notes].sort((x, y) => y[1] - x[1]).slice(0, 12)) };
    })(),
    protections: { lossTrips: res.book.trips.losses, dailyTrips: res.book.trips.daily, ddAlerts30: res.book.ddAlerts, pauses: res.book.pauses.map((p) => ({ from: new Date(p.from).toISOString(), until: new Date(p.until).toISOString(), why: p.why })) },
    stats: res.stats, m1Errors: res.m1Errors, skipped: Object.fromEntries([...res.skip].sort()),
    plannerRejectReasons: Object.fromEntries([...res.rejects].sort((a, b) => b[1] - a[1]).slice(0, 25)),
    pathCoverage: count((r) => r.pathInterval), symbolsWithPath: Object.fromEntries((['5m', '15m', '1h'] as const).map((iv) => [iv, [...res.pathIntervalOf.values()].filter((x) => x === iv).length])),
    wallSeconds: Math.round(res.wallSeconds),
  };
}

async function main() {
  const { values: v } = parseArgs({ options: {
    mode: { type: 'string', default: 'swing' }, filter: { type: 'string', default: 'A' }, policy: { type: 'string', default: 'C2' },
    capital: { type: 'string', default: '10000' }, 'pause-hours': { type: 'string', default: '24' }, from: { type: 'string' }, to: { type: 'string' },
    'fetch-1m': { type: 'boolean', default: false }, dir: { type: 'string', default: 'data/cache' },
  } });
  if (v.mode !== 'swing' && v.mode !== 'fast') throw new Error(`--mode phải là swing hoặc fast, nhận "${v.mode}"`);
  if (v.filter !== 'A' && v.filter !== 'all') throw new Error(`--filter phải là A hoặc all, nhận "${v.filter}"`);
  if (v.policy !== 'C2' && v.policy !== 'A0' && v.policy !== 'C3') throw new Error(`--policy phải là C2, A0 hoặc C3, nhận "${v.policy}"`);
  const capital = Number(v.capital);
  if (!(capital > 0)) throw new Error(`--capital không hợp lệ: "${v.capital}"`);
  const pauseHours = Number(v['pause-hours']);
  if (!(pauseHours >= 0)) throw new Error(`--pause-hours không hợp lệ: "${v['pause-hours']}"`);
  const parseIso = (raw: string) => { const t = Date.parse(raw); if (!Number.isFinite(t)) throw new Error(`thời điểm không hợp lệ: "${raw}"`); return t; };
  const window = { start: v.from ? parseIso(v.from) : DEV_PERIOD.start, end: v.to ? parseIso(v.to) : DEV_PERIOD.end };
  if (window.start < DEV_PERIOD.start || window.end > DEV_PERIOD.end) throw new Error('Task 3 chỉ chạy trên kỳ phát triển D — --from/--to phải nằm trong D');
  const dir = v.dir!;
  const events = parseEvents(JSON.parse(readFileSync(join(REPO_ROOT, 'data/events/events.json'), 'utf8')));
  const contracts = await loadContracts(dir);
  let fetcher: Fetcher | null = null;
  if (v['fetch-1m']) {
    const { createClient } = await import('../packages/binance/client.ts');
    const client = createClient({ fetch: (url) => fetch(url, { signal: AbortSignal.timeout(20_000) }), weightCeiling: 600 });
    fetcher = createFetcher({ client, dir, log: (m) => console.log('  ! ' + m) });
  }
  const opts = { dir, mode: v.mode as Mode, window, filter: v.filter as Filter, policy: v.policy as ExitPolicy, capital, pauseHours };
  const res = await runSimulation({ ...opts, contracts, events, fetcher, log: (m) => console.log(m) });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = resolvePath(REPO_ROOT, 'output/backtest', `sim-${opts.mode}-${opts.filter}-${opts.policy}-dev-${stamp}`);
  mkdirSync(outDir, { recursive: true });
  const tf = join(outDir, 'trades.jsonl');
  writeFileSync(tf, '');
  for (const r of res.done) appendFileSync(tf, JSON.stringify(r) + '\n');
  writeFileSync(join(outDir, 'equity.json'), JSON.stringify(res.book.curve.filter((_, i, a) => i === a.length - 1 || a[i + 1]!.t !== a[i]!.t)));
  const summary = { ...report(res, opts), fetch1m: v['fetch-1m'], timeStopHours: CONFIG[opts.mode].timeStopHours, maxHoldHours: CONFIG[opts.mode].maxHoldHours };
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ...summary, plannerRejectReasons: undefined, m1Errors: undefined }, null, 2));
  console.log(`Đã ghi ${outDir}`);
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    console.error(`LỖI: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    process.exit(1);
  });
}
