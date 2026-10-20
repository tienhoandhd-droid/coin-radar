import { test, before, after } from 'node:test';
import { applyConfigOverride } from '../core/config-override.ts';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBot, disabledTelegram, type BotDeps, type MarketStreamLike, type BotTelegram } from './main.ts';
import { createPaperExchange } from './paper.ts';
import { openJournal, type Journal, type JournalEvent } from './journal.ts';
import { USER_PAUSE } from './telegram.ts';
import type { PlannerPlan } from './planner.ts';
import { trailingFor } from '../core/exit.ts';
import { withConfigOverride } from '../core/config-override.ts';
import { COMMON } from '../core/config.ts';
import type { MarketEvent, UserEvent } from '../binance/stream.ts';
import type { ScanInput, ScanResult } from '../../scanner/run-scan.ts';
import type { Analysis } from '../core/analyze.ts';
import type { Candle, Contract } from '../core/types.ts';

// Người dùng chốt 20/10/2026: risk-cluster + minListingDays 30 BẬT mặc định. Các test trong tệp này kiểm logic khác (định cỡ, bộ lệnh, mô phỏng…)
// nên chạy với hành vi CŨ (tắt hai luật); test của chính hai luật tự bật bằng withConfigOverride.
let restoreDefaults: () => void = () => {};
// Mặc định COMMON.bot.modes = ['btc-regime'] (20/10/2026); tệp này kiểm planner/vòng đời của Swing → chạy với ['swing'] như trước.
before(() => { restoreDefaults = applyConfigOverride({ 'COMMON.portfolio.cluster': null, 'COMMON.entryRules.minListingDays': null, 'COMMON.bot.modes': ['swing'] }); });
after(() => restoreDefaults());

// B8b vòng đời bot (main.ts) với đồng hồ giả, luồng giả, sàn giả lập THẬT (paper.ts) và nhật ký THẬT (thư mục tạm). Không gọi mạng.
const H = 3_600_000;
const T0 = Date.UTC(2026, 9, 20, 3, 59, 0); // 03:59 UTC — nến 4H tiếp theo đóng lúc 04:00
const C: Contract = {
  symbol: 'AAAUSDT', baseAsset: 'AAA', onboardDate: 0, tickSize: 0.01, stepSize: 0.001, minQty: 0.001, maxQty: 1e6,
  marketMinQty: 0.001, marketMaxQty: 1e6, marketStepSize: 0.001, minNotional: 5, maxNumOrders: 200, deliveryDate: 4133894400000,
};
const BTC: Contract = { ...C, symbol: 'BTCUSDT', baseAsset: 'BTC', tickSize: 0.1 };
const rawSymbol = (c: Contract) => ({
  symbol: c.symbol, baseAsset: c.baseAsset, quoteAsset: 'USDT', contractType: 'PERPETUAL', status: 'TRADING', underlyingType: 'COIN', onboardDate: 0, deliveryDate: c.deliveryDate,
  filters: [
    { filterType: 'PRICE_FILTER', tickSize: String(c.tickSize) },
    { filterType: 'LOT_SIZE', stepSize: String(c.stepSize), minQty: String(c.minQty), maxQty: String(c.maxQty) },
    { filterType: 'MARKET_LOT_SIZE', stepSize: String(c.marketStepSize), minQty: String(c.marketMinQty), maxQty: String(c.marketMaxQty) },
    { filterType: 'MIN_NOTIONAL', notional: String(c.minNotional) },
    { filterType: 'MAX_NUM_ORDERS', limit: String(c.maxNumOrders) },
  ],
});
const kRow = (openTime: number, ms: number, price: number) => [openTime, String(price), String(price + 0.5), String(price - 0.5), String(price), '1000', openTime + ms - 1, '1000000000', 1, '500', '500000000', '0'];

// ---- Luồng thị trường giả ----
type FakeStream = MarketStreamLike & {
  symbols: readonly string[]; intervals: readonly string[]; seeds: string[]; started: boolean; stopped: boolean; calls: string[];
  emit(e: MarketEvent): void; marks: Map<string, number>; stale: boolean;
};

// btcDaily: giá đóng nến 1D BTCUSDT theo giờ mở (vắng = 60 000 cố định); trả null = REST không có nến đó (thiếu dữ liệu)
function harness(o: { dir?: string; balance?: number; scan?: (i: ScanInput) => Promise<ScanResult>; funding?: Array<{ fundingTime: number; fundingRate: number; markPrice: string }>; mark?: number;
  btcDaily?: (openTime: number) => number | null } = {}) {
  const dir = o.dir ?? mkdtempSync(join(tmpdir(), 'cr-bot-'));
  const clock = { t: T0 };
  const now = () => clock.t;
  const streams: FakeStream[] = [];
  const order: string[] = []; // thứ tự sự kiện quan trọng xuyên các thành phần
  let mark = o.mark ?? 100;
  let btcMark = 60_000;
  let premiumRate = '0.0001'; // funding kỳ gần nhất trong premiumIndex
  const paperRaw = createPaperExchange({ contracts: { AAAUSDT: C, BTCUSDT: BTC }, cost: () => ({ tierPct: 0.1, impactPct: 0.5, vol1m: Infinity }), startBalance: o.balance ?? 10_000, statePath: join(dir, 'paper-state.json'), now, defaultLeverage: 5 });
  const paper = {
    ...paperRaw,
    feedMark: (s: string, m: { price: number; eventTime: number }) => { order.push(`feedMark ${s}`); paperRaw.feedMark(s, m); },
    feedKline: (s: string, c: Candle) => { order.push(`feedKline ${s}`); paperRaw.feedKline(s, c); },
    feedFunding: (r: { symbol: string; fundingTime: number; fundingRate: number; markPrice: number }) => { order.push(`feedFunding ${r.symbol}`); paperRaw.feedFunding(r); },
  };
  const gets: string[] = [];
  const botGets: string[] = []; // REST công khai đi bằng ngân sách ưu tiên của bot (đối chiếu)
  const publicGet = async (path: string): Promise<unknown> => {
    gets.push(path);
    if (path === '/fapi/v1/time') return { serverTime: clock.t };
    if (path === '/fapi/v1/exchangeInfo') return { symbols: [rawSymbol(C), rawSymbol(BTC)] };
    if (path === '/fapi/v1/fundingInfo') return [];
    if (path === '/fapi/v1/ticker/24hr') return [{ symbol: 'AAAUSDT', quoteVolume: '1e9', priceChangePercent: '1' }, { symbol: 'BTCUSDT', quoteVolume: '1e10', priceChangePercent: '1' }];
    if (path === '/fapi/v1/ticker/bookTicker') return [{ symbol: 'AAAUSDT', bidPrice: String(mark - 0.01), askPrice: String(mark + 0.01) }];
    if (path.startsWith('/fapi/v1/premiumIndex')) {
      const row = (s: string) => ({ symbol: s, markPrice: String(s === 'BTCUSDT' ? btcMark : mark), lastFundingRate: premiumRate, nextFundingTime: Math.ceil((clock.t + 1) / (8 * H)) * 8 * H });
      const m = /symbol=([A-Z]+)/.exec(path);
      return m ? row(m[1]!) : [row('AAAUSDT'), row('BTCUSDT')];
    }
    if (path.startsWith('/fapi/v1/fundingRate')) return o.funding ?? [{ symbol: 'AAAUSDT', fundingTime: T0 - 8 * H, fundingRate: '0.0001', markPrice: '100' }];
    if (path.startsWith('/fapi/v1/klines')) {
      const sym = /symbol=([A-Z]+)/.exec(path)![1]!;
      const interval = /interval=([0-9a-z]+)/.exec(path)![1]!;
      const ms = interval === '1m' ? 60_000 : interval === '15m' ? 900_000 : interval === '1h' ? H : interval === '4h' ? 4 * H : 24 * H;
      const limit = Number(/limit=(\d+)/.exec(path)?.[1] ?? 500);
      const startM = /startTime=(\d+)/.exec(path);
      const lastOpen = Math.floor(clock.t / ms) * ms - ms; // nến đã đóng cuối
      const first = startM ? Math.max(Number(startM[1]), lastOpen - (limit - 1) * ms) : lastOpen - (limit - 1) * ms;
      const rows: unknown[] = [];
      const daily = o.btcDaily;
      if (sym === 'BTCUSDT' && interval === '1d' && daily !== undefined) {
        // nến 1D BTC có biên độ ±300 quanh giá mở/đóng (ATR ≈ 600) — dữ liệu cho hệ btc-regime
        for (let t = Math.ceil(first / ms) * ms; t <= lastOpen && rows.length < limit; t += ms) {
          const c = daily(t);
          if (c === null) continue;
          const op = daily(t - ms) ?? c;
          rows.push([t, String(op), String(Math.max(op, c) + 300), String(Math.min(op, c) - 300), String(c), '1000', t + ms - 1, '1000000000', 1, '500', '500000000', '0']);
        }
        return rows;
      }
      for (let t = Math.ceil(first / ms) * ms; t <= lastOpen && rows.length < limit; t += ms) rows.push(kRow(t, ms, sym === 'BTCUSDT' ? 60_000 : mark));
      return rows;
    }
    throw new Error(`publicGet giả: chưa hỗ trợ ${path}`);
  };
  const journal: Journal = openJournal({ dir, now, warn: () => {} });
  const logs: string[] = [];
  const notes: Array<{ level: string; text: string }> = [];
  let tg: BotTelegram | null = null;
  const deps: BotDeps = {
    mode: 'paper', liveCaps: null, runId: 'run1', now,
    sleep: async (ms: number) => { clock.t += ms; await new Promise((r) => setImmediate(r)); },
    log: (m) => logs.push(m),
    publicGet,
    publicGetBot: (path: string) => { botGets.push(path); return deps.publicGet(path); },
    api: paper.api,
    syncClock: async () => 0,
    paper,
    createUserStream: null,
    createMarketStream: (so) => {
      const s: FakeStream = {
        symbols: so.symbols, intervals: so.intervals, seeds: [], started: false, stopped: false, calls: [], marks: new Map(), stale: false,
        start() { this.started = true; this.calls.push('start'); order.push(`stream.start ${so.symbols.join(',')}`); },
        stop() { this.stopped = true; },
        seedLastClosed(sym, i, t) { this.seeds.push(`${sym}|${i}|${t}`); this.calls.push('seed'); },
        latestMark(sym) { const p = this.marks.get(sym) ?? (sym === 'BTCUSDT' ? btcMark : mark); return { price: p, eventTime: clock.t, receivedAt: clock.t }; },
        isMarkStale() { return this.stale; },
        isKlineStale() { return this.stale; },
        emit(e) { so.onEvent(e); },
      };
      streams.push(s);
      return s;
    },
    journal,
    telegram: (hooks) => {
      tg = disabledTelegram({ journal, log: (m) => logs.push(m), onNotify: (a) => notes.push(a) });
      void hooks;
      return tg;
    },
    scan: o.scan ?? (async (i) => emptyScan(i)),
    events: [],
    scanLimit: null,
    freshWaitMs: 5_000,
  };
  const bot = createBot(deps);
  // Chạy một việc bất đồng bộ trong khi "thời gian trôi": mỗi vòng thêm 1 s, nạp nhịp mark cho sàn giả lập (bot.tick)
  async function drive<T>(p: Promise<T>, maxSteps = 200): Promise<T> {
    let done = false;
    let out: T | undefined;
    let err: unknown;
    p.then((v) => { done = true; out = v; }, (e) => { done = true; err = e; });
    for (let i = 0; i < maxSteps && !done; i++) {
      await new Promise((r) => setImmediate(r));
      clock.t += 1000;
      bot.tick();
    }
    if (!done) throw new Error('drive: việc chưa xong sau số bước tối đa');
    if (err !== undefined) throw err;
    return out as T;
  }
  return { bot, deps, dir, clock, streams, order, paper: paperRaw, journal, logs, notes, gets, botGets, drive, setMark: (p: number) => { mark = p; }, setBtcMark: (p: number) => { btcMark = p; }, setPremiumRate: (r: string) => { premiumRate = r; } };
}

function emptyScan(i: ScanInput): ScanResult {
  return { regime: { regime: 'neutral' as never, reasons: [] }, breaker: { tripped: false, reason: null }, btcReclaim: null, ranks: new Map([['AAAUSDT', 0], ['BTCUSDT', 0]]), universeSize: i.contracts.length, inScope: 0, results: [], entryBlocks: new Map(), warnings: [], errors: [], banned: false };
}

// Tín hiệu Hạng A MỚI Long AAAUSDT market tại 100, SL 97, TP1 106 — kế hoạch lập với ĐÚNG vốn bot truyền vào runScan
function plan(capital: number): PlannerPlan {
  return {
    side: 'long', entryType: 'market', marketPrice: 100, entry: 100, maxEntry: 100.5, stop: 97, limitPrice: null, cancelIfTp1First: false,
    targets: [
      { name: 'TP1', price: 106, pct: 50, qty: 30, r: 2, reason: 't' },
      { name: 'TP2', price: null, pct: 30, qty: 0, r: null, reason: 't' },
      { name: 'TP3', price: null, pct: 20, qty: 0, r: null, reason: 't' },
    ],
    exit: { policy: 'C2', tp1Qty: 30, trailQty: 30, trailing: trailingFor('long', 100.5, 106, 3, 0.1) },
    valid: true, invalidReason: null, qty: 60, costPct: 0.1, suggestedLeverage: 5, limitExpiryHours: null, riskPct: 2, capital,
  };
}
const SIGNAL_ID = 'AAAUSDT|swing|long|zone|1|97';
function signalScan(calls: ScanInput[] = []) {
  return async (i: ScanInput): Promise<ScanResult> => {
    calls.push(i);
    const a = {
      symbol: 'AAAUSDT', mode: i.mode, label: 'Đạt tiêu chí Long', best: { side: 'long', score: 80 }, plan: plan(i.capital), patternSignal: null,
      grade: { grade: 'A' }, signal: { id: SIGNAL_ID, fresh: true, held: false, kind: 'zone', side: 'long' }, flags: [],
    } as unknown as Analysis;
    return { ...emptyScan(i), results: i.mode === 'swing' ? [a] : [] };
  };
}
const closeOf = (interval: string, closeTime: number, symbol = 'BTCUSDT'): MarketEvent => {
  const ms = interval === '4h' ? 4 * H : 900_000;
  return { type: 'kline', symbol, interval, candle: { openTime: closeTime + 1 - ms, closeTime, open: 60_000, high: 60_100, low: 59_900, close: 60_000, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 } };
};
// Đọc lại toàn bộ dòng nhật ký (mọi tệp journal-*.jsonl)
const events = (j: Journal): JournalEvent[] =>
  readdirSync(j.dir).filter((f) => /^journal-.*\.jsonl$/.test(f)).sort()
    .flatMap((f) => readFileSync(join(j.dir, f), 'utf8').trim().split('\n').filter((l) => l !== '').map((l) => JSON.parse(l) as JournalEvent));
const placeIntents = (evs: JournalEvent[]) => evs.filter((e) => e.type === 'order_intent' && (e.op ?? 'place') === 'place');

// Mở một lệnh qua đúng vòng đời: khởi động → nến 4H đóng → quét → vào lệnh → đối chiếu đặt SL/TP1/trailing
async function openTrade(h: ReturnType<typeof harness>) {
  await h.drive(h.bot.start());
  h.clock.t = Date.UTC(2026, 9, 20, 4, 0, 1);
  await h.drive(h.bot.onMarketEvent('trigger', closeOf('4h', Date.UTC(2026, 9, 20, 4, 0, 0) - 1)));
  await h.drive(h.bot.idle());
}

test('B8b khởi động ĐÚNG THỨ TỰ: giờ → exchangeInfo → tài khoản → nhật ký → nến khoảng tắt máy (paper) → mốc nến REST (seed) → đối chiếu → luồng', async () => {
  const h = harness();
  await h.drive(h.bot.start());
  const steps = h.bot.trace().filter((s) => s.startsWith('step:')).map((s) => s.slice(5));
  assert.deepEqual(steps, ['clock', 'exchangeInfo', 'account', 'journal', 'paper_backfill', 'seed', 'reconcile', 'streams']);
  const trigger = h.streams[0]!;
  assert.deepEqual([...trigger.symbols], ['BTCUSDT']);
  assert.deepEqual([...trigger.intervals].sort(), ['4h']); // tệp này chạy COMMON.bot.modes = ['swing'] (mặc định thật: ['btc-regime'] — test btc-regime ở cuối tệp)
  assert.ok(trigger.seeds.length === 1 && trigger.calls.indexOf('seed') < trigger.calls.indexOf('start'), 'seedLastClosed TRƯỚC start()');
  assert.ok(h.bot.trace().includes('reconcile:khởi động'));
  assert.ok(h.logs.some((l) => /Bot bật/.test(l)));
});

test('B8b nến 4H đóng → runScan (Swing) → Hạng A MỚI → planner (costModel + đệm funding 30 ngày) → vào lệnh → đối chiếu đặt SL/TP1/trailing', async () => {
  const calls: ScanInput[] = [];
  const h = harness({ scan: signalScan(calls) });
  await openTrade(h);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.mode, 'swing');
  assert.equal(calls[0]!.capital, 10_000);
  const t = h.journal.state().trades[SIGNAL_ID];
  assert.ok(t !== undefined, 'đã nhận tín hiệu');
  assert.equal(t.status, 'open');
  assert.equal(t.equityAtEntry, 10_000);
  assert.ok(h.gets.some((g) => g.startsWith('/fapi/v1/fundingRate?symbol=AAAUSDT')), 'tải lịch sử funding 30 ngày cho đệm funding');
  assert.ok(h.gets.some((g) => g.startsWith('/fapi/v1/klines?symbol=AAAUSDT&interval=1h')), 'khối lượng 1 phút cho costModel');
  const algos = (await h.paper.api.request({ method: 'GET', path: '/fapi/v1/openAlgoOrders', params: { symbol: 'AAAUSDT' }, createsOrder: false })).body as Array<{ orderType: string }>;
  assert.deepEqual(algos.map((a) => a.orderType).sort(), ['STOP_MARKET', 'TAKE_PROFIT_MARKET', 'TRAILING_STOP_MARKET']);
  assert.ok(h.bot.trace().includes('reconcile:nến đóng'), 'đối chiếu sau mỗi nến đóng');
});

test('B8b khởi động lại GIỮA lệnh (nhật ký + trạng thái paper) → không đặt lệnh trùng, vẫn đủ SL/TP1/trailing', async () => {
  const h = harness({ scan: signalScan() });
  await openTrade(h);
  const before = placeIntents(events(h.journal)).length;
  await h.drive(h.bot.stop());
  // tiến trình mới: cùng thư mục dữ liệu, sàn giả lập nạp lại từ tệp trạng thái
  const h2 = harness({ dir: h.dir, scan: signalScan() });
  h2.clock.t = h.clock.t + 10 * 60_000;
  await h2.drive(h2.bot.start());
  await h2.drive(h2.bot.onMarketEvent('trigger', closeOf('4h', Date.UTC(2026, 9, 20, 8, 0, 0) - 1)).then(() => h2.bot.idle()));
  assert.equal(placeIntents(events(h2.journal)).length, before, 'không có lệnh đặt mới nào sau khởi động lại');
  const algos = (await h2.paper.api.request({ method: 'GET', path: '/fapi/v1/openAlgoOrders', params: { symbol: 'AAAUSDT' }, createsOrder: false })).body as unknown[];
  assert.equal(algos.length, 3);
  assert.equal(Object.keys(h2.journal.state().trades).length, 1, 'tín hiệu cũ không được nhận lại (khử trùng theo signal.id)');
  // khởi động lại: nến khoảng tắt máy được nạp TRƯỚC mọi nhịp mark trực tiếp
  const fk = h2.order.findIndex((x) => x === 'feedKline AAAUSDT');
  const fm = h2.order.findIndex((x) => x.startsWith('feedMark'));
  assert.ok(fk >= 0 && (fm < 0 || fk < fm), `nến tắt máy trước mark: ${h2.order.slice(0, 6).join(' | ')}`);
});

test('B8b dữ liệu cũ (mark hoặc nến stale) → KHÔNG vào lệnh', async () => {
  const h = harness({ scan: signalScan() });
  await h.drive(h.bot.start());
  for (const s of h.streams) s.stale = true;
  const orig = h.deps.createMarketStream;
  h.deps.createMarketStream = (o) => { const s = orig(o) as FakeStream; s.stale = true; return s; };
  h.clock.t = Date.UTC(2026, 9, 20, 4, 0, 1);
  await h.drive(h.bot.onMarketEvent('trigger', closeOf('4h', Date.UTC(2026, 9, 20, 4, 0, 0) - 1)).then(() => h.bot.idle()));
  assert.equal(h.journal.state().trades[SIGNAL_ID], undefined);
  assert.ok(h.logs.some((l) => /dữ liệu cũ/.test(l)), h.logs.slice(-5).join('\n'));
});

test('B8b /dung (tạm dừng người dùng) → không vào lệnh, kiểm TRƯỚC checkEntry', async () => {
  const h = harness({ scan: signalScan() });
  h.journal.append({ type: 'protection_tripped', name: USER_PAUSE, reason: 'người dùng gõ /dung' });
  await h.drive(h.bot.start());
  h.clock.t = Date.UTC(2026, 9, 20, 4, 0, 1);
  await h.drive(h.bot.onMarketEvent('trigger', closeOf('4h', Date.UTC(2026, 9, 20, 4, 0, 0) - 1)).then(() => h.bot.idle()));
  assert.equal(h.journal.state().trades[SIGNAL_ID], undefined);
  assert.ok(h.bot.trace().includes('entry:paused AAAUSDT'));
  assert.ok(!h.bot.trace().some((x) => x.startsWith('entry:checkEntry')), 'checkEntry không được gọi khi đang tạm dừng');
});

test('B8b chỉ chế độ trong COMMON.bot.modes: modes = [swing] → không nghe nến 15m, nến 15m không quét', async () => {
  await withConfigOverride({ 'COMMON.bot.modes': ['swing'] }, async () => {
    const calls: ScanInput[] = [];
    const h = harness({ scan: signalScan(calls) });
    await h.drive(h.bot.start());
    assert.deepEqual([...h.streams[0]!.intervals], ['4h']);
    h.clock.t = Date.UTC(2026, 9, 20, 4, 15, 1);
    await h.drive(h.bot.onMarketEvent('trigger', closeOf('15m', Date.UTC(2026, 9, 20, 4, 15, 0) - 1)).then(() => h.bot.idle()));
    assert.equal(calls.length, 0);
  });
});

test('B8b chốt chặn funding: kỳ funding chốt, funding trả lớn → siết SL (stop_tightened + lệnh dừng mới trên sàn, cũ bị hủy)', async () => {
  const h = harness({ scan: signalScan() });
  await openTrade(h);
  const t = h.journal.state().trades[SIGNAL_ID]!;
  const oldStop = t.plan.stop;
  // kỳ funding 08:00 UTC: Long trả 2% notional — vượt ngân sách 2% (lệnh đã định cỡ sát 2%)
  const ft = Date.UTC(2026, 9, 20, 8, 0, 0);
  h.deps.publicGet = ((orig) => async (p: string) => (p.startsWith('/fapi/v1/fundingRate') ? [{ symbol: 'AAAUSDT', fundingTime: ft, fundingRate: '0.02', markPrice: '100' }] : orig(p)))(h.deps.publicGet);
  h.clock.t = ft + 2 * 60_000;
  await h.drive(h.bot.periodic());
  await h.drive(h.bot.idle());
  const t2 = h.journal.state().trades[SIGNAL_ID]!;
  assert.ok(t2.plan.stop > oldStop, `SL phải được siết lên: ${oldStop} → ${t2.plan.stop}`);
  assert.ok(events(h.journal).some((e) => e.type === 'stop_tightened'));
  const algos = (await h.paper.api.request({ method: 'GET', path: '/fapi/v1/openAlgoOrders', params: { symbol: 'AAAUSDT' }, createsOrder: false })).body as Array<{ orderType: string; triggerPrice: string }>;
  const stops = algos.filter((a) => a.orderType === 'STOP_MARKET');
  assert.equal(stops.length, 1, 'đúng một lệnh dừng (mới) trên sàn');
  assert.equal(Number(stops[0]!.triggerPrice), t2.plan.stop);
  assert.ok(h.bot.trace().includes('funding:AAAUSDT tighten'));
});

test('B8b đối chiếu được kích hoạt bởi: resync_required, cảnh báo khẩn, nến đóng, định kỳ REST', async () => {
  const h = harness();
  await h.drive(h.bot.start());
  const count = (r: string) => h.bot.trace().filter((x) => x === `reconcile:${r}`).length;
  await h.drive(h.bot.onUserEvent({ type: 'resync_required', reason: 'reconnect' } as UserEvent).then(() => h.bot.idle()));
  assert.equal(count('resync reconnect'), 1);
  await h.drive(h.bot.onMarketEvent('watch', closeOf('15m', T0 - 60_000 + 1 - 1, 'AAAUSDT')).then(() => h.bot.idle()));
  assert.ok(count('nến đóng') >= 1);
  await h.drive(h.bot.periodic().then(() => h.bot.idle()));
  assert.equal(count('định kỳ REST'), 1);
  h.bot.notify({ level: 'urgent', symbol: 'AAAUSDT', text: 'KHẨN thử' });
  await h.drive(h.bot.idle());
  assert.equal(count('sau cảnh báo khẩn'), 1);
});

// ======================= B8b vòng 1 (rà soát) =======================
const FT = Date.UTC(2026, 9, 20, 8, 0, 0); // kỳ funding 08:00 UTC
function breakFunding(h: ReturnType<typeof harness>) {
  const orig = h.deps.publicGet;
  let broken = true;
  h.deps.publicGet = async (p: string) => {
    if (broken && p.startsWith('/fapi/v1/fundingRate')) throw new Error('mạng lỗi giả');
    return p.startsWith('/fapi/v1/fundingRate') ? [{ symbol: 'AAAUSDT', fundingTime: FT, fundingRate: '0.02', markPrice: '100' }] : orig(p);
  };
  return { heal: () => { broken = false; } };
}

test('R1 #1 chốt chặn funding lỗi → KHÔNG bỏ kỳ chốt: thử lại ở lượt định kỳ sau; lỗi kéo dài → KHẨN + chặn vào lệnh mã đó; thành công → hết chặn', async () => {
  const h = harness({ scan: signalScan() });
  await openTrade(h);
  const f = breakFunding(h);
  h.clock.t = FT + 2 * 60_000;
  await h.drive(h.bot.periodic().then(() => h.bot.idle()));
  const checks = () => h.bot.trace().filter((x) => x === 'funding:AAAUSDT check').length;
  assert.equal(checks(), 1);
  assert.ok(h.bot.trace().includes('funding:AAAUSDT failed'));
  assert.equal(h.bot.fundingGuardHealthy(), true, 'một lần lỗi chưa quá ngưỡng');
  await h.drive(h.bot.periodic().then(() => h.bot.idle()));
  assert.equal(checks(), 2, 'thử lại ở lượt định kỳ kế tiếp (kỳ chốt chưa bị bỏ)');
  assert.ok(!h.notes.some((n) => n.level === 'urgent' && /chốt chặn funding/.test(n.text)));
  await h.drive(h.bot.periodic().then(() => h.bot.idle()));
  assert.equal(checks(), 3);
  assert.ok(h.notes.some((n) => n.level === 'urgent' && /chốt chặn funding AAAUSDT không chạy được/.test(n.text)), 'quá 2 lần → KHẨN');
  assert.equal(h.bot.fundingGuardHealthy(), false);
  assert.deepEqual(h.bot.entryBlockedSymbols(), ['AAAUSDT']);
  f.heal();
  await h.drive(h.bot.periodic().then(() => h.bot.idle()));
  assert.ok(h.bot.trace().includes('funding:AAAUSDT tighten'));
  assert.equal(h.bot.fundingGuardHealthy(), true);
  assert.deepEqual(h.bot.entryBlockedSymbols(), []);
  // đã kiểm xong kỳ này → lượt sau không kiểm lại
  await h.drive(h.bot.periodic().then(() => h.bot.idle()));
  assert.equal(checks(), 4);
});

test('R1 #1 chốt chặn funding hỏng + cấu hình "expected" → lần quét/vào lệnh mới dùng đệm "max" (fundingGuardActive phản ánh sức khỏe thật)', async () => {
  await withConfigOverride({ 'COMMON.risk.fundingBufferHorizon': 'expected', 'COMMON.risk.fundingRuntimeGuard': true }, async () => {
    const seen: string[] = [];
    const base = signalScan();
    const h = harness({ scan: async (i) => { seen.push(String(COMMON.risk.fundingBufferHorizon)); return base(i); } });
    await openTrade(h);
    assert.deepEqual(seen, ['expected']);
    breakFunding(h);
    h.clock.t = FT + 2 * 60_000;
    for (let i = 0; i < 3; i++) await h.drive(h.bot.periodic().then(() => h.bot.idle()));
    assert.equal(h.bot.fundingGuardHealthy(), false);
    h.clock.t = Date.UTC(2026, 9, 20, 12, 0, 1);
    await h.drive(h.bot.onMarketEvent('trigger', closeOf('4h', Date.UTC(2026, 9, 20, 12, 0, 0) - 1)).then(() => h.bot.idle()));
    assert.equal(seen[seen.length - 1], 'max');
    assert.equal(COMMON.risk.fundingBufferHorizon, 'expected', 'trả lại cấu hình sau lần quét');
  });
});

test('R1 #2 tắt bot: báo ĐÚNG từng vị thế có/không có SL trên sàn; thiếu SL → KHẨN', async () => {
  const h = harness({ scan: signalScan() });
  await openTrade(h);
  // Sàn (nhìn qua REST lúc tắt) không còn lệnh dừng của mã — giả lập SL đã mất mà bot chưa kịp đối chiếu lại
  const orig = h.deps.api;
  h.deps.api = { request: async (o) => {
    const r = await orig.request(o);
    return o.path === '/fapi/v1/openAlgoOrders' ? { ...r, body: (r.body as Array<{ orderType: string }>).filter((x) => x.orderType !== 'STOP_MARKET') } : r;
  } };
  await h.drive(h.bot.stop());
  const last = h.notes[h.notes.length - 1]!;
  assert.equal(last.level, 'urgent');
  assert.match(last.text, /AAAUSDT .*KHÔNG có SL/);
});

test('R1 #2 tắt bot: vị thế có SL → báo "có SL" theo mã, mức info', async () => {
  const h = harness({ scan: signalScan() });
  await openTrade(h);
  await h.drive(h.bot.stop());
  const last = h.notes[h.notes.length - 1]!;
  assert.equal(last.level, 'info');
  assert.match(last.text, /AAAUSDT .*có SL/);
  assert.doesNotMatch(last.text, /KHÔNG có SL/);
});

test('R1 #3 vào lệnh bình thường: KHÔNG có cảnh báo KHẨN; ghi độ trễ khớp→SL', async () => {
  const h = harness({ scan: signalScan() });
  await openTrade(h);
  assert.deepEqual(h.notes.filter((n) => n.level === 'urgent').map((n) => n.text), []);
  assert.ok(h.logs.some((l) => /khớp→SL AAAUSDT: \d+ ms/.test(l)), h.logs.join('\n'));
});

test('R1 #4a /dung tới TRONG lúc chờ dữ liệu mới → kiểm lại isPaused ngay trước khi gửi lệnh vào', async () => {
  const h = harness({ scan: signalScan() });
  await h.drive(h.bot.start());
  const orig = h.deps.createMarketStream;
  const made: FakeStream[] = [];
  h.deps.createMarketStream = (o) => { const s = orig(o) as FakeStream; s.stale = true; made.push(s); return s; };
  const sleep = h.deps.sleep;
  let paused = false;
  h.deps.sleep = async (ms) => {
    if (!paused && made.length > 0) {
      paused = true;
      h.journal.append({ type: 'protection_tripped', name: USER_PAUSE, reason: 'người dùng gõ /dung' });
      for (const s of made) s.stale = false;
    }
    await sleep(ms);
  };
  h.clock.t = Date.UTC(2026, 9, 20, 4, 0, 1);
  await h.drive(h.bot.onMarketEvent('trigger', closeOf('4h', Date.UTC(2026, 9, 20, 4, 0, 0) - 1)).then(() => h.bot.idle()));
  assert.ok(paused);
  assert.equal(h.journal.state().trades[SIGNAL_ID], undefined);
  assert.ok(h.bot.trace().includes('entry:paused-late AAAUSDT'));
});

test('R1 #4b đối chiếu KHÔNG xếp hàng sau việc vào lệnh (lúc lệnh đang chờ dữ liệu mới, đối chiếu vẫn chạy xong)', async () => {
  const h = harness({ scan: signalScan() });
  await h.drive(h.bot.start());
  const orig = h.deps.createMarketStream;
  h.deps.createMarketStream = (o) => { const s = orig(o) as FakeStream; s.stale = true; return s; };
  h.clock.t = Date.UTC(2026, 9, 20, 4, 0, 1);
  let entryDone = false;
  const p = h.bot.onMarketEvent('trigger', closeOf('4h', Date.UTC(2026, 9, 20, 4, 0, 0) - 1)).then(() => { entryDone = true; });
  for (let i = 0; i < 50 && !h.bot.trace().includes('entry:checkEntry AAAUSDT'); i++) await new Promise((r) => setImmediate(r));
  assert.ok(h.bot.trace().includes('entry:checkEntry AAAUSDT'));
  let recDoneBeforeEntry = false;
  const r = h.bot.onUserEvent({ type: 'resync_required', reason: 'reconnect' } as UserEvent).then(() => { recDoneBeforeEntry = !entryDone && !h.bot.trace().includes('entry:stale AAAUSDT'); });
  await h.drive(Promise.all([p, r]));
  assert.ok(recDoneBeforeEntry, 'đối chiếu phải xong khi lệnh vào còn đang chờ');
});

test('R1 #4c mốc 4H: quét Swing và Lướt nhanh chạy LẦN LƯỢT (không đồng thời trên cùng ngân sách IP); đối chiếu dùng ngân sách ưu tiên bot', async () => {
  await withConfigOverride({ 'COMMON.bot.modes': ['swing', 'fast'] }, async () => {
    const log: string[] = [];
    let h: ReturnType<typeof harness>;
    h = harness({ scan: async (i) => { log.push(`start ${i.mode}`); await h.deps.sleep(5_000); log.push(`end ${i.mode}`); return emptyScan(i); } });
    await h.drive(h.bot.start());
    h.clock.t = Date.UTC(2026, 9, 20, 4, 0, 1);
    const a = h.bot.onMarketEvent('trigger', closeOf('15m', Date.UTC(2026, 9, 20, 4, 0, 0) - 1));
    const b = h.bot.onMarketEvent('trigger', closeOf('4h', Date.UTC(2026, 9, 20, 4, 0, 0) - 1));
    await h.drive(Promise.all([a, b]).then(() => h.bot.idle()));
    assert.equal(log.length, 4);
    assert.ok(log[0]!.startsWith('start') && log[1]!.startsWith('end') && log[2]!.startsWith('start'), log.join(' | '));
    assert.ok(h.botGets.some((g) => g.startsWith('/fapi/v1/klines?symbol=BTCUSDT')), 'mốc nến REST của đối chiếu/khởi động đi bằng ngân sách bot');
  });
});

// ======================= B8b vòng 2 (rà soát lại 1) =======================
test('R2 #1 cầu chì nhảy (do lượt đối chiếu chạy song song) TRONG lúc chuẩn bị vào lệnh → kiểm lại TOÀN BỘ cổng ngay trước khi gửi, không vào lệnh', async () => {
  const h = harness({ scan: signalScan() });
  await h.drive(h.bot.start());
  const orig = h.deps.createMarketStream;
  const made: FakeStream[] = [];
  h.deps.createMarketStream = (o) => { const s = orig(o) as FakeStream; s.stale = true; made.push(s); return s; };
  const sleep = h.deps.sleep;
  let tripped = false;
  h.deps.sleep = async (ms) => {
    if (!tripped && made.length > 0) {
      tripped = true;
      h.journal.append({ type: 'protection_tripped', name: 'loss_streak', reason: '5 lệnh thua trong 24 giờ (trần 5)' });
      for (const s of made) s.stale = false;
    }
    await sleep(ms);
  };
  h.clock.t = Date.UTC(2026, 9, 20, 4, 0, 1);
  await h.drive(h.bot.onMarketEvent('trigger', closeOf('4h', Date.UTC(2026, 9, 20, 4, 0, 0) - 1)).then(() => h.bot.idle()));
  assert.ok(tripped);
  assert.equal(h.journal.state().trades[SIGNAL_ID], undefined);
  assert.ok(h.bot.trace().includes('entry:gate-late AAAUSDT'));
  assert.ok(h.logs.some((l) => /loss_streak/.test(l)));
});

test('R2 #1 dữ liệu thành cũ trong lúc chuẩn bị → kiểm lại cổng stale ngay trước khi gửi', async () => {
  const h = harness({ scan: signalScan() });
  await h.drive(h.bot.start());
  const orig = h.deps.createMarketStream;
  const made: FakeStream[] = [];
  h.deps.createMarketStream = (o) => { const s = orig(o) as FakeStream; made.push(s); return s; };
  // planner gọi lịch sử funding SAU khi dữ liệu đã mới → lúc đó làm luồng cũ đi
  const get = h.deps.publicGet;
  h.deps.publicGet = async (p: string) => { if (p.startsWith('/fapi/v1/fundingRate')) for (const s of made) s.stale = true; return get(p); };
  h.clock.t = Date.UTC(2026, 9, 20, 4, 0, 1);
  await h.drive(h.bot.onMarketEvent('trigger', closeOf('4h', Date.UTC(2026, 9, 20, 4, 0, 0) - 1)).then(() => h.bot.idle()));
  assert.equal(h.journal.state().trades[SIGNAL_ID], undefined);
  assert.ok(h.bot.trace().includes('entry:gate-late AAAUSDT'));
});

test('R2 #2 kiểm funding LÚC KHỞI ĐỘNG lỗi (funding trả lúc tắt máy) → thử lại ở lượt định kỳ kế tiếp (không chờ kỳ chốt sau); lỗi kéo dài → KHẨN', async () => {
  const h = harness({ scan: signalScan() });
  await openTrade(h);
  await h.drive(h.bot.stop());
  const h2 = harness({ dir: h.dir, scan: signalScan() });
  h2.clock.t = FT + 30 * 60_000; // máy tắt qua kỳ chốt 08:00
  breakFunding(h2);
  await h2.drive(h2.bot.start());
  const checks = () => h2.bot.trace().filter((x) => x === 'funding:AAAUSDT check').length;
  assert.equal(checks(), 1);
  assert.ok(h2.bot.trace().includes('funding:AAAUSDT failed'));
  await h2.drive(h2.bot.periodic().then(() => h2.bot.idle()));
  assert.equal(checks(), 2, 'thử lại ngay lượt định kỳ sau, dù giờ chốt kế tiếp còn ở tương lai');
  await h2.drive(h2.bot.periodic().then(() => h2.bot.idle()));
  assert.equal(checks(), 3);
  assert.ok(h2.notes.some((n) => n.level === 'urgent' && /chốt chặn funding AAAUSDT không chạy được/.test(n.text)));
  assert.equal(h2.bot.fundingGuardHealthy(), false);
});

test('R2 #3 chốt chặn hỏng: siết SL phòng trước theo |funding| xấu nhất đã biết cho phần thời gian giữ còn lại (hàm chốt chặn dùng chung); báo KHẨN lại mỗi kỳ chốt bị lỡ', async () => {
  const h = harness({ scan: signalScan() });
  await openTrade(h);
  const oldStop = h.journal.state().trades[SIGNAL_ID]!.plan.stop;
  h.setPremiumRate('0.0003'); // kỳ gần nhất 0,03% — tệ hơn lịch sử 30 ngày lúc vào lệnh
  breakFunding(h);
  h.clock.t = FT + 2 * 60_000;
  for (let i = 0; i < 3; i++) await h.drive(h.bot.periodic().then(() => h.bot.idle()));
  const urgent = () => h.notes.filter((n) => n.level === 'urgent' && /chốt chặn funding AAAUSDT/.test(n.text)).length;
  assert.equal(urgent(), 1);
  assert.ok(h.bot.trace().includes('funding:AAAUSDT preempt-tighten'), h.bot.trace().filter((x) => x.startsWith('funding')).join(' | '));
  const st = h.journal.state().trades[SIGNAL_ID]!.plan.stop;
  assert.ok(st > oldStop, `SL phải được siết phòng trước: ${oldStop} → ${st}`);
  const algos = (await h.paper.api.request({ method: 'GET', path: '/fapi/v1/openAlgoOrders', params: { symbol: 'AAAUSDT' }, createsOrder: false })).body as Array<{ orderType: string; triggerPrice: string }>;
  assert.deepEqual(algos.filter((a) => a.orderType === 'STOP_MARKET').map((a) => Number(a.triggerPrice)), [st]);
  // kỳ chốt 16:00 cũng bị lỡ → KHẨN lại
  h.clock.t = FT + 8 * H + 2 * 60_000;
  await h.drive(h.bot.periodic().then(() => h.bot.idle()));
  assert.equal(urgent(), 2);
});

test('R2 #3 tắt bot mà KHÔNG đọc được trạng thái sàn → vẫn báo KHẨN "kiểm tay ngay"', async () => {
  const h = harness({ scan: signalScan() });
  await openTrade(h);
  h.deps.api = { request: async () => ({ kind: 'retryable', code: -1001, msg: 'mạng lỗi giả', status: 503, body: null, orderCount: { tenSec: null, oneMin: null } }) };
  await h.drive(h.bot.stop());
  const last = h.notes[h.notes.length - 1]!;
  assert.equal(last.level, 'urgent');
  assert.match(last.text, /Bot tắt — KHÔNG đọc được trạng thái sàn, kiểm tay ngay/);
});

// ======================= B8b vòng 3 (rà soát lại 2) =======================
test('R3 siết SL bị sàn TỪ CHỐI → nhật ký giữ SL cũ (không stop_tightened), KHẨN; SL cũ vẫn trên sàn', async () => {
  const h = harness({ scan: signalScan() });
  await openTrade(h);
  const oldStop = h.journal.state().trades[SIGNAL_ID]!.plan.stop;
  h.deps.publicGet = ((orig) => async (p: string) => (p.startsWith('/fapi/v1/fundingRate') ? [{ symbol: 'AAAUSDT', fundingTime: FT, fundingRate: '0.02', markPrice: '100' }] : orig(p)))(h.deps.publicGet);
  h.paper.inject({ match: (r) => r.method === 'POST' && r.path === '/fapi/v1/algoOrder' && r.params?.type === 'STOP_MARKET', status: 400, body: { code: -2021, msg: 'Order would immediately trigger.' }, apply: false, times: 5 });
  h.clock.t = FT + 2 * 60_000;
  await h.drive(h.bot.periodic().then(() => h.bot.idle()));
  assert.ok(h.bot.trace().includes('funding:AAAUSDT tighten'));
  assert.equal(h.journal.state().trades[SIGNAL_ID]!.plan.stop, oldStop, 'nhật ký giữ SL cũ');
  assert.ok(!events(h.journal).some((e) => e.type === 'stop_tightened'));
  assert.ok(h.notes.some((n) => n.level === 'urgent' && /siết SL .*KHÔNG được sàn nhận/.test(n.text)), h.notes.map((n) => n.text).join('\n'));
  const algos = (await h.paper.api.request({ method: 'GET', path: '/fapi/v1/openAlgoOrders', params: { symbol: 'AAAUSDT' }, createsOrder: false })).body as Array<{ orderType: string; triggerPrice: string }>;
  assert.deepEqual(algos.filter((a) => a.orderType === 'STOP_MARKET').map((a) => Number(a.triggerPrice)), [oldStop]);
});

test('R3 nhật ký lệch SL với sàn (vd ghi sai) → lượt đối chiếu lấy SL trên sàn làm sự thật', async () => {
  const h = harness({ scan: signalScan() });
  await openTrade(h);
  const real = h.journal.state().trades[SIGNAL_ID]!.plan.stop;
  h.journal.append({ type: 'stop_tightened', signalId: SIGNAL_ID, stop: real + 1.5, reason: 'ghi sai giả lập' });
  await h.drive(h.bot.onUserEvent({ type: 'resync_required', reason: 'reconnect' } as UserEvent).then(() => h.bot.idle()));
  assert.equal(h.journal.state().trades[SIGNAL_ID]!.plan.stop, real);
});

test('R3 bộ nhớ chốt chặn funding (|funding| xấu nhất, lần kiểm được gần nhất) bền qua khởi động lại', async () => {
  const h = harness({ scan: signalScan() });
  await openTrade(h);
  h.setPremiumRate('0.0007');
  h.clock.t = FT + 2 * 60_000;
  await h.drive(h.bot.periodic().then(() => h.bot.idle()));
  const m = h.journal.state().fundingGuard['AAAUSDT'];
  assert.ok(m !== undefined && m.worstRate >= 0.0007 && m.lastGood !== null);
  await h.drive(h.bot.stop());
  const h2 = harness({ dir: h.dir, scan: signalScan() });
  h2.clock.t = h.clock.t + 60_000;
  // nạp lại từ nhật ký ngay khi dựng bot (trước lần kiểm funding lúc khởi động)
  assert.deepEqual(h2.bot.fundingMemory('AAAUSDT'), { worstRate: m.worstRate, lastGood: m.lastGood });
});

// ---- risk-cluster trong bot (người dùng chốt 20/10/2026: bật mặc định) ----
const CLUSTER_ON = { 'COMMON.portfolio.cluster': { corrDays: 30, corrMax: 0.7, betaDays: 60, betaFloor: 0.5, maxBetaRiskPct: 10 } };
// nến 1D giả có biến động (beta cần phương sai): giá = gốc × (1 + 3% × sin(k·i))
function dailyStub(h: ReturnType<typeof harness>, fail: string | null) {
  const orig = h.deps.publicGet;
  h.deps.publicGet = async (p: string) => {
    if (!p.startsWith('/fapi/v1/klines') || !p.includes('interval=1d')) return orig(p);
    h.gets.push(p);
    const sym = /symbol=([A-Z]+)/.exec(p)![1]!;
    if (sym === fail) throw new Error('Binance HTTP 503 tại /fapi/v1/klines');
    const limit = Number(/limit=(\d+)/.exec(p)![1]);
    const D = 24 * H;
    const lastOpen = Math.floor(h.clock.t / D) * D - D;
    const base = sym === 'BTCUSDT' ? 60_000 : 100;
    const k = sym === 'BTCUSDT' ? 1.3 : 0.7;
    return Array.from({ length: limit }, (_, j) => { const i = limit - 1 - j; return kRow(lastOpen - i * D, D, base * (1 + 0.03 * Math.sin(k * (lastOpen - i * D) / D))); });
  };
}

test('risk-cluster (bot): bật → tải nến 1D mã định vào + BTC (limit 62 = 61 nến đã đóng) qua REST công khai rồi mới lập lệnh → vào lệnh', async () => {
  await withConfigOverride(CLUSTER_ON, async () => {
    const h = harness({ scan: signalScan([]) });
    dailyStub(h, null);
    await openTrade(h);
    assert.ok(h.gets.includes('/fapi/v1/klines?symbol=AAAUSDT&interval=1d&limit=62'), h.gets.filter((g) => g.includes('1d')).join(' | '));
    assert.ok(h.gets.includes('/fapi/v1/klines?symbol=BTCUSDT&interval=1d&limit=62'));
    assert.equal(h.journal.state().trades[SIGNAL_ID]?.status, 'open');
  });
});

test('risk-cluster (bot) FAIL CLOSED: tải nến 1D lỗi → ghi log, KHÔNG vào lệnh (không âm thầm bỏ qua kiểm tra)', async () => {
  await withConfigOverride(CLUSTER_ON, async () => {
    const h = harness({ scan: signalScan([]) });
    dailyStub(h, 'BTCUSDT');
    await openTrade(h);
    assert.equal(h.journal.state().trades[SIGNAL_ID], undefined, 'không nhận tín hiệu');
    assert.ok(h.logs.some((l) => /risk-cluster — không tải được nến 1D BTCUSDT.*không vào lệnh mới/.test(l)), h.logs.slice(-5).join(' | '));
    assert.ok(h.bot.trace().includes('entry:cluster-data AAAUSDT'));
  });
});

// ======================= Hệ BTC theo chế độ (btc-regime, mặc định COMMON.bot.modes) =======================
const DAY_MS = 24 * H;
const D0 = Date.UTC(2026, 9, 20); // nến 1D 20/10 mở lúc này; nến đóng cuối lúc khởi động (03:59 20/10) là nến 19/10
const REGIME = { 'COMMON.bot.modes': ['btc-regime'] };
// Giá đóng 1D tăng đều 100/ngày, nến 19/10 đóng 59 900 → SMA50 = 57 450 → muốn Long; ATR(20) = 700 (biên ±300 + bước 100)
const rising = (t: number) => 60_000 + 100 * Math.round((t - D0) / DAY_MS);
const dailyClose = (closeTime: number): MarketEvent => ({
  type: 'kline', symbol: 'BTCUSDT', interval: '1d',
  candle: { openTime: closeTime + 1 - DAY_MS, closeTime, open: 60_000, high: 60_300, low: 59_700, close: 60_000, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 },
});
const regimeKlineCalls = (h: ReturnType<typeof harness>) => h.gets.filter((g) => g === '/fapi/v1/klines?symbol=BTCUSDT&interval=1d&limit=499').length;
const btcAlgos = async (h: ReturnType<typeof harness>) =>
  (await h.paper.api.request({ method: 'GET', path: '/fapi/v1/openAlgoOrders', params: { symbol: 'BTCUSDT' }, createsOrder: false })).body as Array<{ orderType: string; triggerPrice: string; closePosition: boolean | string }>;
const btcPos = (h: ReturnType<typeof harness>) => h.paper.snapshot().positions.find((p) => p.symbol === 'BTCUSDT')?.positionAmt ?? 0;
const regimeTrades = (h: ReturnType<typeof harness>) => Object.values(h.journal.state().trades).filter((t) => t.mode === 'btc-regime');

test('btc-regime: mặc định nghe nến 1D BTC; khởi động lỡ quyết định → quyết định ngay (nến đóng cuối): > SMA50 → Long IOC + SL STOP_MARKET closePosition trên sàn, đòn bẩy 1×, rủi ro ≤ 2%', async () => {
  await withConfigOverride(REGIME, async () => {
    const h = harness({ btcDaily: rising });
    await h.drive(h.bot.start());
    await h.drive(h.bot.idle());
    assert.deepEqual([...h.streams[0]!.intervals], ['1d']);
    const [t] = regimeTrades(h);
    assert.ok(t !== undefined, h.logs.slice(-8).join('\n'));
    assert.equal(t.symbol, 'BTCUSDT');
    assert.equal(t.side, 'long');
    assert.equal(t.plan.leverage, 1);
    assert.equal(t.plan.stop, 58_250); // 60 000 − 2,5 × 700
    assert.equal(t.plan.exitCostPct, 0.0775);
    assert.equal(t.legs.TP1, undefined);
    assert.equal(t.legs.TR, undefined);
    assert.equal(t.status, 'open');
    assert.equal(t.signalId, 'BTCUSDT|btc-regime|long|2026-10-20');
    // giá trần 60 060, khoảng SL 1 810 → notional = 200 / (1810/60060 + 0,135%) = 6 351,8 → 0,105 BTC; rủi ro = 0,105 × (1 810 + 81,08) ≤ 200
    assert.equal(btcPos(h), 0.105);
    assert.ok(t.riskAmount! <= 200 && t.riskAmount! > 198, String(t.riskAmount));
    assert.ok(t.notional! <= 10_000);
    const algos = await btcAlgos(h);
    assert.equal(algos.length, 1);
    assert.equal(algos[0]!.orderType, 'STOP_MARKET');
    assert.equal(Number(algos[0]!.triggerPrice), 58_250);
    const d = h.journal.state().btcRegime!;
    assert.equal(d.closeTime, D0 - 1);
    assert.equal(d.action, 'enter');
    assert.equal(d.want, 'long');
    assert.equal(regimeKlineCalls(h), 1, 'một lần gọi klines cho quyết định ngày');
    assert.ok(h.notes.some((n) => /BTC theo chế độ — nến 1D 2026-10-19/.test(n.text)), h.notes.map((n) => n.text).join('\n'));
    assert.ok(!h.notes.some((n) => n.level === 'urgent'), h.notes.filter((n) => n.level === 'urgent').map((n) => n.text).join('\n'));
    // lượt định kỳ cùng ngày: đã quyết định → KHÔNG gọi REST lại, không lệnh mới
    await h.drive(h.bot.periodic().then(() => h.bot.idle()));
    assert.equal(regimeKlineCalls(h), 1);
    assert.equal(regimeTrades(h).length, 1);
  });
});

test('btc-regime: nến 1D đóng ≤ SMA50 khi đang giữ Long → đóng market reduce-only, SL bị hủy, lệnh đóng, quyết định "exit" ghi nhật ký', async () => {
  await withConfigOverride(REGIME, async () => {
    let crash = false;
    const h = harness({ btcDaily: (t) => (crash && t >= D0 ? 50_000 : rising(t)) });
    await h.drive(h.bot.start());
    await h.drive(h.bot.idle());
    assert.equal(btcPos(h), 0.105);
    crash = true;
    h.clock.t = D0 + DAY_MS + 1_000;
    await h.drive(h.bot.onMarketEvent('trigger', dailyClose(D0 + DAY_MS - 1)).then(() => h.bot.idle()));
    assert.equal(btcPos(h), 0, h.logs.slice(-10).join('\n'));
    assert.equal((await btcAlgos(h)).length, 0, 'SL mồ côi đã hủy');
    assert.equal(regimeTrades(h)[0]!.status, 'closed');
    const d = h.journal.state().btcRegime!;
    assert.equal(d.closeTime, D0 + DAY_MS - 1);
    assert.equal(d.action, 'exit');
    assert.equal(d.want, 'flat');
    assert.ok(events(h.journal).some((e) => e.type === 'order_intent' && e.op === 'reduce'), 'đóng bằng lệnh reduce-only');
    assert.ok(h.notes.some((n) => /tín hiệu tắt/.test(n.text)), h.notes.map((n) => n.text).join('\n'));
    // ngày kế tiếp vẫn ≤ SMA → đứng ngoài, không vào
    h.clock.t = D0 + 2 * DAY_MS + 1_000;
    await h.drive(h.bot.onMarketEvent('trigger', dailyClose(D0 + 2 * DAY_MS - 1)).then(() => h.bot.idle()));
    assert.equal(h.journal.state().btcRegime!.action, 'stay_flat');
    assert.equal(regimeTrades(h).length, 1);
  });
});

test('btc-regime: chạm SL trong ngày mà tín hiệu còn bật → KHÔNG vào lại cùng ngày (kể cả lượt định kỳ), vào lại ở lần quyết định ngày KẾ TIẾP', async () => {
  await withConfigOverride(REGIME, async () => {
    const h = harness({ btcDaily: rising });
    await h.drive(h.bot.start());
    await h.drive(h.bot.idle());
    assert.equal(btcPos(h), 0.105);
    h.setBtcMark(58_000); // thủng SL 58 250 trên sàn giả lập
    await h.drive(h.bot.periodic().then(() => h.bot.idle())); // nhịp mark → sàn giả lập khớp SL
    await h.drive(h.bot.periodic().then(() => h.bot.idle())); // lượt đối chiếu sau: không còn vị thế → đóng lệnh
    assert.equal(btcPos(h), 0);
    assert.equal(regimeTrades(h)[0]!.status, 'closed');
    assert.ok(h.notes.some((n) => /chạm dừng lỗ/.test(n.text)), h.notes.map((n) => n.text).join('\n'));
    h.setBtcMark(60_100);
    h.clock.t += 3 * H;
    await h.drive(h.bot.periodic().then(() => h.bot.idle()));
    assert.equal(regimeTrades(h).length, 1, 'không vào lại trong ngày');
    h.clock.t = D0 + DAY_MS + 2_000;
    await h.drive(h.bot.onMarketEvent('trigger', dailyClose(D0 + DAY_MS - 1)).then(() => h.bot.idle()));
    const ts = regimeTrades(h);
    assert.equal(ts.length, 2, h.logs.slice(-10).join('\n'));
    assert.equal(ts[1]!.signalId, 'BTCUSDT|btc-regime|long|2026-10-21');
    assert.equal(h.journal.state().btcRegime!.action, 'enter');
    assert.ok(btcPos(h) > 0);
  });
});

test('btc-regime: khởi động lại (máy tắt qua 00:00) → đồng bộ vị thế + SL từ nhật ký/sàn, không đặt lệnh trùng, quyết định nến đã lỡ ngay lúc khởi động', async () => {
  await withConfigOverride(REGIME, async () => {
    const h = harness({ btcDaily: rising });
    await h.drive(h.bot.start());
    await h.drive(h.bot.idle());
    const before = placeIntents(events(h.journal));
    await h.drive(h.bot.stop());
    const h2 = harness({ dir: h.dir, btcDaily: rising });
    h2.clock.t = D0 + DAY_MS + 3 * H; // lỡ quyết định 00:00 21/10
    await h2.drive(h2.bot.start());
    await h2.drive(h2.bot.idle());
    assert.equal(placeIntents(events(h2.journal)).length, before.length, 'không đặt lệnh mới (vào/SL)');
    assert.equal((await btcAlgos(h2)).length, 1, 'SL vẫn nằm trên sàn');
    assert.equal(btcPos(h2), 0.105);
    const d = h2.journal.state().btcRegime!;
    assert.equal(d.closeTime, D0 + DAY_MS - 1);
    assert.equal(d.action, 'hold');
    assert.equal(regimeKlineCalls(h2), 1);
    // khởi động lại lần nữa cùng ngày: đã quyết định → không gọi klines 1D 499
    await h2.drive(h2.bot.stop());
    const h3 = harness({ dir: h.dir, btcDaily: rising });
    h3.clock.t = D0 + DAY_MS + 4 * H;
    await h3.drive(h3.bot.start());
    await h3.drive(h3.bot.idle());
    assert.equal(regimeKlineCalls(h3), 0);
    assert.equal(regimeTrades(h3).length, 1);
  });
});

test('btc-regime FAIL CLOSED: nến 1D đứt quãng → không hành động, không ghi quyết định, cảnh báo; lượt định kỳ thử lại khi dữ liệu đủ', async () => {
  await withConfigOverride(REGIME, async () => {
    let gap = true;
    const h = harness({ btcDaily: (t) => (gap && t === D0 - 10 * DAY_MS ? null : rising(t)) });
    await h.drive(h.bot.start());
    await h.drive(h.bot.idle());
    assert.equal(regimeTrades(h).length, 0);
    assert.equal(h.journal.state().btcRegime, null);
    assert.ok(h.notes.some((n) => n.level === 'warn' && /thiếu dữ liệu — nến 1D đứt quãng/.test(n.text)), h.notes.map((n) => n.text).join('\n'));
    gap = false;
    await h.drive(h.bot.periodic().then(() => h.bot.idle()));
    assert.equal(regimeTrades(h).length, 1);
    assert.equal(h.journal.state().btcRegime!.action, 'enter');
  });
});

test('btc-regime: /dung → không vào (quyết định ghi "skip"); cầu chì/trần danh mục chặn như mọi lệnh', async () => {
  await withConfigOverride(REGIME, async () => {
    const h = harness({ btcDaily: rising });
    h.journal.append({ type: 'protection_tripped', name: USER_PAUSE, reason: 'người dùng gõ /dung' });
    await h.drive(h.bot.start());
    await h.drive(h.bot.idle());
    assert.equal(regimeTrades(h).length, 0);
    assert.equal(h.journal.state().btcRegime!.action, 'skip');
    assert.match(h.journal.state().btcRegime!.note, /tạm dừng/);
    const h2 = harness({ btcDaily: rising });
    h2.journal.append({ type: 'protection_tripped', name: 'loss_streak', reason: '5 lệnh thua' });
    await h2.drive(h2.bot.start());
    await h2.drive(h2.bot.idle());
    assert.equal(regimeTrades(h2).length, 0);
    assert.match(h2.journal.state().btcRegime!.note, /protections.*loss_streak/);
  });
});
