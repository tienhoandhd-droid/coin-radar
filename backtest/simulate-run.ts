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
import { parseEvents } from '../packages/core/events.ts';
import { advanceSignalState, type SignalState } from '../packages/core/signal.ts';
import { planOrders, type PlannerPlan } from '../packages/bot/planner.ts';
import type { Analysis } from '../packages/core/analyze.ts';
import type { ExitPolicy } from '../packages/core/exit.ts';
import type { Candle, Contract, Mode } from '../packages/core/types.ts';
import { createReplay, decisionTimes, signalDedupeKey, loadContracts, DEV_PERIOD, type FundingRow, type Window } from './replay.ts';
import { loadCandles, createFetcher, fetchWindow1m, HOUR, MINUTE, DAY, type Interval, type Fetcher } from './data.ts';
import {
  createTrade, advanceTrade, forceClose, tradeRecord, portfolioView, createBook, bookFlow, bookClose, isPaused, summarize, groupStats, isDone,
  DEFAULT_BOOK, type SimTrade, type TradeRecord, type Book, type Resolver,
} from './simulate.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export type Filter = 'A' | 'all';
export type PickState = { used: Set<string>; cooldownUntil: Map<string, number>; active: Set<string> };
export type Pick = { a: Analysis; plan: PlannerPlan; key: string; kind: 'zone' | 'pattern' };

const ENTRY_BAR_MS: Record<Mode, number> = { swing: 4 * HOUR, fast: 15 * MINUTE };
export const cooldownMs = (mode: Mode) => 2 * ENTRY_BAR_MS[mode];

const inc = (m: Map<string, number>, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n);

// Tín hiệu được thử vào lệnh tại t (theo thứ tự kết quả). skip đếm lý do bỏ.
export function pickCandidates(results: readonly Analysis[], filter: Filter, st: PickState, t: number, skip: Map<string, number>): Pick[] {
  const out: Pick[] = [];
  for (const a of results) {
    if (!a.label.startsWith('Đạt')) continue;
    const ps = a.patternSignal;
    const p = (ps ?? a.plan) as PlannerPlan | null;
    if (p === null || a.signal === null) continue;
    if (!a.signal.fresh) { inc(skip, 'không MỚI (đang giữ)'); continue; }
    if (filter === 'A' && a.grade?.grade !== 'A') { inc(skip, 'không phải Hạng A'); continue; }
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
  const from = t - COMMON.risk.fundingBufferLookbackDays * DAY;
  let m = 0;
  for (const r of rows) if (r.fundingTime > from && r.fundingTime <= t) m = Math.max(m, Math.abs(r.fundingRate));
  return m;
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
};

export async function runSimulation(o: RunOptions) {
  const rep = createReplay({ dir: o.dir, mode: o.mode, window: o.window, contracts: o.contracts, events: o.events, capital: o.capital, limit: null });
  const times = decisionTimes(o.mode, o.window);
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
  const stats = { steps: 0, scanErrors: 0, signalsDat: 0, signalsA: 0, pausedSignals: 0, plannerRejected: 0, opened: 0,
    m1Asked: 0, m1FromCache: 0, m1Fetched: 0, m1Missing: 0, m1FetchErrors: 0, m1FetchDisabled: false as boolean, forcedPeriodEnd: 0 };
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
      if (!active.some((x) => x.k.symbol === tr.k.symbol)) { pathOf.delete(tr.k.symbol); fundingOf.delete(tr.k.symbol); }
      if (tr.b.firstFillAt !== null) st.cooldownUntil.set(`${tr.k.symbol}|${tr.k.side}`, tr.b.closedAt! + cooldownMs(o.mode));
      done.push(tradeRecord(tr));
    }
  }

  async function advanceAll(until: number) {
    for (const tr of active) await advanceTrade(tr, path(tr.k.symbol).candles, until, { funding: funding(tr.k.symbol), resolve });
    closeOut(settle(book, active, marks));
  }

  const started = performance.now();
  for (let k = 0; k < times.length; k++) {
    const t = times[k]!;
    await advanceAll(t);
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
    for (const pick of pickCandidates(r.results, o.filter, st, t, skip)) {
      const a = pick.a;
      const contract = input.contracts.find((c) => c.symbol === a.symbol);
      const premium = input.premiums.get(a.symbol);
      if (contract === undefined || premium === undefined) throw new Error(`${a.symbol}: tín hiệu có nhưng thiếu hợp đồng/giá mark tại ${new Date(t).toISOString()}`);
      const h1 = (await input.klines(a.symbol, '1h', COMMON.slippage.volumeBars1h + 1)).slice(-COMMON.slippage.volumeBars1h);
      const vol1m = h1.reduce((s, c) => s + c.quoteVolume, 0) / h1.length / 60;
      if (!(vol1m > 0)) throw new Error(`${a.symbol}: không ước được khối lượng 1 phút tại ${new Date(t).toISOString()}`);
      const pr = planOrders({
        plan: pick.plan, grade: o.filter === 'all' ? 'A' : (a.grade?.grade ?? null), signal: { id: a.signal!.id, fresh: a.signal!.fresh },
        mode: o.mode, contract, capital, openTrades: portfolioView(active), openOrderCount: 0,
        maxNotional: COMMON.slippage.maxParticipation * vol1m, markPrice: premium.markPrice, runId: 'sim', now: t,
        costModel: { tierPct: COMMON.costRoundTripPct[tierOf(r.ranks.get(a.symbol) ?? 1)], quoteVolPerMin: vol1m },
        fundingBuffer: { maxAbsRate: maxAbsFunding(funding(a.symbol), t), intervalHours: input.fundingIntervals.get(a.symbol) ?? COMMON.defaultFundingIntervalHours },
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
    if (k % 100 === 0 || k === times.length - 1) {
      const el = (performance.now() - started) / 1000;
      o.log(`[${k + 1}/${times.length}] ${new Date(t).toISOString()} | vốn ${book.equity.toFixed(0)} | mở ${active.length} | xong ${done.length} | 1m hỏi ${stats.m1Asked} tải ${stats.m1Fetched} | ${el.toFixed(0)} s`);
    }
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
      return { plannedRiskPctMedian: rp.length > 0 ? rp[rp.length >> 1]! : null, plannedUnder1_9pct: rp.filter((x) => x < 1.9).length,
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
  if (v.policy !== 'C2' && v.policy !== 'A0') throw new Error(`--policy phải là C2 hoặc A0, nhận "${v.policy}"`);
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
