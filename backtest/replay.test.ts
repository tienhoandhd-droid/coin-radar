import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runScan, type ScanInput } from '../scanner/run-scan.ts';
import { liquidityRanks } from '../scanner/rank.ts';
import type { Candle, Contract, Mode } from '../packages/core/types.ts';
import { HOUR, MINUTE, INTERVAL_MS, loadCandles, type Interval } from './data.ts';
import {
  previousBlindRuns, signalDedupeKey, DEV_PERIOD, BLIND_PERIOD, LOCK_FILE, resolvePeriod, createReplay, decisionTimes, fundingAt, tickersAt, spreadPctAt, booksAt, markAt,
  BLIND_C_PERIOD, LOCK_FILE_C, assertWindowAllowed, blindPeriodsOverlapping, blindPeriodOfLock,
  type FundingRow,
} from './replay.ts';

// ---------- Kho dữ liệu giả (đúng định dạng tệp đệm của data.ts), thời gian 2025 — xa cả D lẫn B ----------
const WIN = { start: Date.UTC(2025, 2, 1), end: Date.UTC(2025, 2, 3) }; // 2 ngày phát lại
const DATA_TO = Date.UTC(2025, 2, 6); // có dữ liệu "tương lai" sau cửa sổ để bài kiểm nhìn trước có cái mà cắn
const DATA_FROM: Record<Interval, number> = {
  '1d': Date.UTC(2024, 2, 1), '4h': Date.UTC(2024, 10, 1), '1h': Date.UTC(2025, 0, 10), '15m': Date.UTC(2025, 1, 18), '5m': Date.UTC(2025, 1, 25), '1m': Date.UTC(2025, 1, 28),
};
const SYMBOLS = ['BTCUSDT', 'AAAUSDT', 'BBBUSDT', 'CCCUSDT'];
const FIXTURE_INTERVALS: Interval[] = ['1d', '4h', '1h', '15m'];
const EVENTS = [{ kind: 'FOMC' as const, time: '2025-03-02T18:00:00Z', source: 'test' }, { kind: 'CPI' as const, time: '2027-01-01T13:30:00Z', source: 'test: lịch còn hạn' }];

const contract = (symbol: string, onboardDate = Date.UTC(2023, 0, 1)): Contract => ({
  symbol, baseAsset: symbol.replace('USDT', ''), onboardDate, tickSize: 0.0001, stepSize: 0.001, minQty: 0.001, maxQty: 1e9,
  marketMinQty: 0.001, marketMaxQty: 1e9, marketStepSize: 0.001, minNotional: 5, maxNumOrders: 200, deliveryDate: 4133404800000,
});
// CCCUSDT niêm yết giữa cửa sổ → trước mốc đó không được có trong vũ trụ
const CONTRACTS = [contract('BTCUSDT'), contract('AAAUSDT'), contract('BBBUSDT'), contract('CCCUSDT', WIN.start + 30 * HOUR)];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

function genSeries(symbol: string, interval: Interval, from: number, to: number): Candle[] {
  const iv = INTERVAL_MS[interval];
  const r = rng(symbol.length * 7919 + iv / 60_000);
  const base = 50 + SYMBOLS.indexOf(symbol) * 30;
  // Khối lượng AAA/BBB/CCC cùng mức nền (nhiễu ±50%) → thứ hạng thanh khoản giữa chúng đổi chỗ theo thời gian: dùng nhầm dữ liệu
  // 1H sau t (dù vài giờ) là hạng đổi. BTC cao hơn hẳn.
  const vol = symbol === 'BTCUSDT' ? 3e6 : 1e6;
  const out: Candle[] = [];
  let price = base;
  for (let t = from, i = 0; t < to; t += iv, i++) {
    const drift = 0.002 * Math.sin(i / 25) + (r() - 0.5) * 0.02;
    const open = price;
    const close = open * (1 + drift);
    const high = Math.max(open, close) * (1 + r() * 0.01);
    const low = Math.min(open, close) * (1 - r() * 0.01);
    const qv = vol * (0.5 + r()) * (iv / HOUR);
    out.push({ openTime: t, closeTime: t + iv - 1, open, high, low, close, volume: qv / close, quoteVolume: qv, takerBuyQuote: qv * (0.4 + r() * 0.2) });
    price = close;
  }
  return out;
}

const toRow = (c: Candle) => [c.openTime, c.closeTime, c.open, c.high, c.low, c.close, c.volume, c.quoteVolume, c.takerBuyQuote];

function writeSeries(dir: string, symbol: string, interval: Interval, candles: Candle[], from: number, to: number) {
  for (let m = Date.UTC(new Date(from).getUTCFullYear(), new Date(from).getUTCMonth(), 1); m < to;) {
    const d = new Date(m);
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const f = Math.max(m, from), e = Math.min(next, to);
    const rows = candles.filter((c) => c.openTime >= f && c.openTime < e).map(toRow);
    const p = join(dir, 'klines', symbol, interval, key + '.json');
    mkdirSync(join(dir, 'klines', symbol, interval), { recursive: true });
    writeFileSync(p, JSON.stringify({ symbol, interval, from: f, to: e, gaps: [], candles: rows }));
    m = next;
  }
}

function genFunding(symbol: string): FundingRow[] {
  const r = rng(symbol.length * 31);
  const rows: FundingRow[] = [];
  // BBBUSDT đổi chu kỳ 8h → 4h từ 2025-03-01 12:00 (để kiểm suy chu kỳ theo thời điểm)
  for (let t = Date.UTC(2025, 0, 1); t < DATA_TO;) {
    rows.push({ fundingTime: t + 5, fundingRate: (r() - 0.5) * 0.001, markPrice: 100 });
    t += symbol === 'BBBUSDT' && t >= WIN.start + 12 * HOUR ? 4 * HOUR : 8 * HOUR;
  }
  return rows;
}

type Mutate = ((c: Candle, symbol: string) => Candle) | null;
function buildCache(mutate: { candle: Mutate; funding: ((r: FundingRow) => FundingRow) | null } = { candle: null, funding: null }): string {
  const dir = mkdtempSync(join(tmpdir(), 'replay-test-'));
  for (const s of SYMBOLS) {
    for (const iv of FIXTURE_INTERVALS) {
      let series = genSeries(s, iv, DATA_FROM[iv], DATA_TO);
      if (mutate.candle) { const m = mutate.candle; series = series.map((c) => m(c, s)); }
      writeSeries(dir, s, iv, series, DATA_FROM[iv], DATA_TO);
    }
    let rows = genFunding(s);
    if (mutate.funding) rows = rows.map(mutate.funding);
    mkdirSync(join(dir, 'funding'), { recursive: true });
    writeFileSync(join(dir, 'funding', s + '.json'), JSON.stringify({ symbol: s, from: Date.UTC(2025, 0, 1), to: DATA_TO, rows }));
  }
  return dir;
}

const OPTS = (dir: string, mode: Mode) => ({
  dir, mode, window: WIN, contracts: CONTRACTS, events: EVENTS, capital: 1000, limit: null, dataFrom: DATA_FROM,
});
const EMPTY = { openTrades: [], prevSignals: new Map() };

// ---------- Kỳ phát triển / kỳ mù ----------
test('resolvePeriod: dev → D; blind bị TỪ CHỐI nếu thiếu --blind hoặc tệp khóa luật', () => {
  assert.deepEqual(resolvePeriod('dev', { blind: false, lockFile: null }), { name: 'dev', ...DEV_PERIOD });
  assert.equal(DEV_PERIOD.start, Date.parse('2026-06-21T00:00:00Z'));
  assert.equal(DEV_PERIOD.end, Date.parse('2026-09-19T00:00:00Z'));
  assert.equal(BLIND_PERIOD.start, DEV_PERIOD.end);
  assert.equal(BLIND_PERIOD.end, Date.parse('2026-10-19T00:00:00Z'));
  const yes = () => true, no = () => false;
  assert.throws(() => resolvePeriod('blind', { blind: false, lockFile: LOCK_FILE }, yes), /mù.*--blind/);
  assert.throws(() => resolvePeriod('blind', { blind: true, lockFile: null }, yes), /khóa luật/);
  assert.throws(() => resolvePeriod('blind', { blind: true, lockFile: 'docs/khac.md' }, yes), /khoa-luat-mo-phong-mu\.md/);
  assert.throws(() => resolvePeriod('blind', { blind: true, lockFile: LOCK_FILE }, no), /chưa tồn tại/);
  assert.deepEqual(resolvePeriod('blind', { blind: true, lockFile: LOCK_FILE }, yes), { name: 'blind', ...BLIND_PERIOD });
  assert.deepEqual(resolvePeriod('blind', { blind: true, lockFile: './' + LOCK_FILE }, yes), { name: 'blind', ...BLIND_PERIOD });
  assert.throws(() => resolvePeriod('all', { blind: false, lockFile: null }), /kỳ không hợp lệ/);
});

test('createReplay: cửa sổ chạm kỳ mù mà không được phép → từ chối; mốc ngoài cửa sổ → từ chối', async () => {
  const base = { dir: '/nonexistent', mode: 'swing' as const, contracts: CONTRACTS, events: EVENTS, capital: 1000, limit: null };
  assert.throws(() => createReplay({ ...base, window: { start: DEV_PERIOD.start, end: BLIND_PERIOD.start + HOUR } }), /kỳ mù/);
  assert.throws(() => createReplay({ ...base, window: BLIND_PERIOD }), /kỳ mù/);
  assert.throws(() => createReplay({ ...base, window: BLIND_PERIOD, auth: { blind: true, lockFile: LOCK_FILE }, exists: () => false }), /chưa tồn tại/);
  // được phép đúng thủ tục → tạo được (không chạy)
  createReplay({ ...base, window: BLIND_PERIOD, auth: { blind: true, lockFile: LOCK_FILE }, exists: () => true });
  const r = createReplay({ ...base, window: DEV_PERIOD });
  await assert.rejects(r.replayStep(BLIND_PERIOD.start, EMPTY), /ngoài cửa sổ/);
  await assert.rejects(r.replayStep(DEV_PERIOD.start - HOUR, EMPTY), /ngoài cửa sổ/);
});

// ---------- Kỳ mù C ----------
test('kỳ C: [2026-01-01, 2026-06-21), kết thúc đúng lúc D bắt đầu; tệp khóa riêng', () => {
  assert.equal(BLIND_C_PERIOD.start, Date.parse('2026-01-01T00:00:00Z'));
  assert.equal(BLIND_C_PERIOD.end, Date.parse('2026-06-21T00:00:00Z'));
  assert.equal(BLIND_C_PERIOD.end, DEV_PERIOD.start);
  assert.equal(LOCK_FILE_C, 'docs/verification/khoa-luat-mo-phong-mu-C.md');
  assert.equal(blindPeriodOfLock(LOCK_FILE_C)?.id, 'C');
  assert.equal(blindPeriodOfLock('./' + LOCK_FILE)?.id, 'B');
  assert.equal(blindPeriodOfLock('docs/khac.md'), null);
});

test('blindPeriodsOverlapping: chạm kỳ mù dù 1 ms; chạm mép (end = start) thì không', () => {
  const ids = (w: { start: number; end: number }) => blindPeriodsOverlapping(w).map((p) => p.id);
  const C = BLIND_C_PERIOD;
  assert.deepEqual(ids(DEV_PERIOD), []);
  assert.deepEqual(ids(C), ['C']);
  assert.deepEqual(ids({ start: C.start - 10 * HOUR, end: C.start }), []); // kết thúc đúng lúc C bắt đầu
  assert.deepEqual(ids({ start: C.start - 10 * HOUR, end: C.start + 1 }), ['C']);
  assert.deepEqual(ids({ start: C.end - 1, end: DEV_PERIOD.start + HOUR }), ['C']); // 1 ms cuối của C
  assert.deepEqual(ids({ start: C.start + HOUR, end: C.start + 2 * HOUR }), ['C']); // nằm trong
  assert.deepEqual(ids({ start: C.start - HOUR, end: BLIND_PERIOD.end + HOUR }), ['B', 'C']); // trùm cả hai
});

test('kỳ C bị TỪ CHỐI nếu thiếu --blind, thiếu/sai tệp khóa (kể cả tệp khóa của B), hoặc tệp chưa tồn tại', () => {
  const yes = () => true, no = () => false;
  assert.throws(() => resolvePeriod('blind-c', { blind: false, lockFile: LOCK_FILE_C }, yes), /kỳ mù C.*--blind/);
  assert.throws(() => resolvePeriod('blind-c', { blind: true, lockFile: null }, yes), /kỳ mù C.*khóa luật/);
  assert.throws(() => resolvePeriod('blind-c', { blind: true, lockFile: LOCK_FILE }, yes), /kỳ mù C.*khoa-luat-mo-phong-mu-C\.md/);
  assert.throws(() => resolvePeriod('blind-c', { blind: true, lockFile: LOCK_FILE_C }, no), /kỳ mù C.*chưa tồn tại/);
  assert.deepEqual(resolvePeriod('blind-c', { blind: true, lockFile: LOCK_FILE_C }, yes), { name: 'blind-c', ...BLIND_C_PERIOD });
  // tệp khóa của C không mở được B
  assert.throws(() => resolvePeriod('blind', { blind: true, lockFile: LOCK_FILE_C }, yes), /kỳ mù B/);
  // cửa sổ chỉ cần chạm C (không cần là cả kỳ) cũng phải qua thủ tục C
  const edge = { start: BLIND_C_PERIOD.end - HOUR, end: DEV_PERIOD.start + HOUR };
  assert.throws(() => assertWindowAllowed(edge, undefined, yes), /kỳ mù C/);
  assert.throws(() => assertWindowAllowed(edge, { blind: true, lockFile: LOCK_FILE }, yes), /kỳ mù C/);
  assertWindowAllowed(edge, { blind: true, lockFile: LOCK_FILE_C }, yes);
  assertWindowAllowed(DEV_PERIOD, undefined, no);
  // createReplay / runSimulation dùng cùng cổng
  const base = { dir: '/nonexistent', mode: 'swing' as const, contracts: CONTRACTS, events: EVENTS, capital: 1000, limit: null };
  assert.throws(() => createReplay({ ...base, window: BLIND_C_PERIOD }), /kỳ mù C/);
  assert.throws(() => createReplay({ ...base, window: BLIND_C_PERIOD, auth: { blind: true, lockFile: LOCK_FILE }, exists: yes }), /kỳ mù C/);
});

test('decisionTimes: Swing mỗi giờ, Lướt nhanh mỗi lần đóng nến 15m, trong [start, end)', () => {
  const w = { start: Date.UTC(2025, 0, 1), end: Date.UTC(2025, 0, 2) };
  const s = decisionTimes('swing', w);
  assert.equal(s.length, 24);
  assert.equal(s[0], w.start);
  assert.equal(s[23], w.end - HOUR);
  const f = decisionTimes('fast', w);
  assert.equal(f.length, 96);
  assert.equal(f[1]! - f[0]!, 15 * MINUTE);
  // mốc bắt đầu lệch lưới → làm tròn lên
  assert.equal(decisionTimes('swing', { start: w.start + 1, end: w.end })[0], w.start + HOUR);
});

// ---------- Dữ liệu theo thời điểm ----------
test('fundingAt: chỉ kỳ đã chốt (fundingTime ≤ t); chu kỳ suy từ 2 kỳ gần nhất; giờ funding kế tiếp', () => {
  const t0 = Date.UTC(2025, 0, 1);
  const rows: FundingRow[] = [
    { fundingTime: t0 + 3, fundingRate: 0.0001, markPrice: 1 },
    { fundingTime: t0 + 8 * HOUR + 2, fundingRate: 0.0002, markPrice: 1 },
    { fundingTime: t0 + 12 * HOUR + 4, fundingRate: -0.0003, markPrice: 1 },
  ];
  assert.equal(fundingAt(rows, t0), null); // kỳ t0+3ms chưa chốt tại t0
  assert.deepEqual(fundingAt(rows, t0 + HOUR), { lastFundingRate: 0.0001, nextFundingTime: t0 + 8 * HOUR, intervalHours: null });
  assert.deepEqual(fundingAt(rows, t0 + 9 * HOUR), { lastFundingRate: 0.0002, nextFundingTime: t0 + 16 * HOUR, intervalHours: 8 });
  assert.deepEqual(fundingAt(rows, t0 + 12 * HOUR), { lastFundingRate: 0.0002, nextFundingTime: t0 + 16 * HOUR, intervalHours: 8 }); // kỳ 12h chốt lúc +4ms
  assert.deepEqual(fundingAt(rows, t0 + 13 * HOUR), { lastFundingRate: -0.0003, nextFundingTime: t0 + 16 * HOUR, intervalHours: 4 });
});

test('tickersAt / markAt / spreadPctAt / booksAt: chỉ dùng nến 1h đã đóng trong 24h trước t', () => {
  const t = Date.UTC(2025, 0, 2);
  const mk = (openTime: number, close: number, qv: number): Candle => ({ openTime, closeTime: openTime + HOUR - 1, open: close - 1, high: close + 1, low: close - 2, close, volume: 1, quoteVolume: qv, takerBuyQuote: 0 });
  const series = Array.from({ length: 30 }, (_, i) => mk(t - 26 * HOUR + i * HOUR, 100 + i, 10)); // 4 nến cuối mở ≥ t → chưa đóng
  const [tk] = tickersAt([{ symbol: 'X', hourly: series }], t);
  assert.equal(tk!.quoteVolume24h, 24 * 10); // đúng 24 nến đóng trong [t−24h, t)
  const first = series.find((c) => c.openTime === t - 24 * HOUR)!;
  const last = series.find((c) => c.closeTime === t - 1)!;
  assert.equal(tk!.priceChangePct24h, ((last.close - first.open) / first.open) * 100);
  assert.equal(markAt([series], t), last.close);
  assert.equal(markAt([series, [mk(t - 2 * HOUR, 1, 1)]], t), last.close); // chọn nến đóng muộn nhất
  const sp = spreadPctAt(series.filter((c) => c.closeTime < t), 0.1);
  assert.ok(sp > 0);
  // sàn theo nhóm thanh khoản: nhóm thấp ≥ nhóm cao
  assert.ok(spreadPctAt([], 0.9) >= spreadPctAt([], 0.1));
  const b = booksAt('X', 200, 0.1);
  assert.ok(Math.abs(((b.ask - b.bid) / ((b.ask + b.bid) / 2)) * 100 - 0.1) < 1e-9);
});

// ---------- (a) Khớp với runScan gọi độc lập trên cùng lát dữ liệu ----------
// Đầu vào dựng ĐỘC LẬP với replay.ts: nến đọc lại từ tệp qua loadCandles(to = t) (isClosed), tickers cộng tay, vũ trụ lọc tay.
function independentInput(dir: string, mode: Mode, t: number): ScanInput {
  const load = (s: string, iv: Interval) => loadCandles(dir, s, iv, DATA_FROM[iv], t).candles;
  const contracts = CONTRACTS.filter((c) => c.onboardDate <= t);
  const tickers = contracts.flatMap((c) => {
    const day = load(c.symbol, '1h').filter((k) => k.openTime >= t - 24 * HOUR && k.closeTime < t);
    if (day.length === 0) return [];
    let qv = 0;
    for (const k of day) qv += k.quoteVolume;
    return [{ symbol: c.symbol, quoteVolume24h: qv, priceChangePct24h: ((day[day.length - 1]!.close - day[0]!.open) / day[0]!.open) * 100 }];
  });
  const ranks = liquidityRanks(tickers);
  const books = new Map(), premiums = new Map(), fundingIntervals = new Map<string, number>();
  for (const c of contracts) {
    const h = load(c.symbol, '1h');
    const finest = mode === 'fast' ? load(c.symbol, '15m') : h; // t trên lưới 15m: nến 15m cuối đóng muộn nhất
    const mark = finest[finest.length - 1]!.close;
    books.set(c.symbol, booksAt(c.symbol, mark, spreadPctAt(h.slice(-24), ranks.get(c.symbol) ?? 1)));
    const settled = genFunding(c.symbol).filter((r) => r.fundingTime <= t);
    const last = settled[settled.length - 1]!, prev = settled[settled.length - 2];
    const ih = prev === undefined ? null : Math.round((last.fundingTime - prev.fundingTime) / HOUR);
    let next = Math.floor(last.fundingTime / HOUR) * HOUR + (ih ?? 8) * HOUR;
    while (next <= t) next += (ih ?? 8) * HOUR;
    premiums.set(c.symbol, { symbol: c.symbol, markPrice: mark, lastFundingRate: last.fundingRate, nextFundingTime: next });
    if (ih !== null) fundingIntervals.set(c.symbol, ih);
  }
  return {
    mode, contracts, tickers, books, premiums, fundingIntervals, now: t, events: EVENTS, capital: 1000, limit: null, openTrades: [], prevSignals: new Map(),
    klines: (s, iv, limit) => load(s, iv as Interval).slice(-(limit - 1)), // máy quét: limit gồm 1 nến đang chạy bị bỏ
  };
}

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
function assertSameInput(got: ScanInput, want: ScanInput, at: string) {
  assert.deepStrictEqual(got.contracts.map((c) => c.symbol), want.contracts.map((c) => c.symbol), `vũ trụ lệch tại ${at}`);
  assert.deepStrictEqual(got.tickers.map((x) => x.symbol), want.tickers.map((x) => x.symbol), `tickers lệch tại ${at}`);
  got.tickers.forEach((x, j) => {
    const w = want.tickers[j]!;
    assert.ok(close(x.quoteVolume24h, w.quoteVolume24h) && close(x.priceChangePct24h, w.priceChangePct24h), `ticker ${x.symbol} lệch tại ${at}: ${JSON.stringify(x)} ≠ ${JSON.stringify(w)}`);
  });
  assert.deepStrictEqual(liquidityRanks(got.tickers), liquidityRanks(want.tickers), `hạng thanh khoản lệch tại ${at}`);
  assert.deepStrictEqual(got.books, want.books, `books lệch tại ${at}`);
  assert.deepStrictEqual(got.premiums, want.premiums, `premiums lệch tại ${at}`);
  assert.deepStrictEqual(got.fundingIntervals, want.fundingIntervals, `chu kỳ funding lệch tại ${at}`);
  const frames: Array<[Interval, number]> = [['1h', 300], ['4h', 500], ['1d', 300]];
  if (want.mode === 'fast') frames.push(['15m', 500]);
  for (const c of want.contracts) {
    for (const [iv, limit] of frames) {
      assert.deepStrictEqual(got.klines(c.symbol, iv, limit), want.klines(c.symbol, iv, limit), `nến ${c.symbol} ${iv} lệch tại ${at}`);
    }
  }
}

for (const mode of ['swing', 'fast'] as const) {
  test(`(a) ${mode}: tại 5 mốc ngẫu nhiên + 2 mốc sát niêm yết, đầu vào và replayStep = runScan độc lập trên cùng lát dữ liệu`, async () => {
    const dir = buildCache();
    try {
      const times = decisionTimes(mode, WIN);
      const r = rng(mode === 'swing' ? 11 : 13);
      const onboard = CONTRACTS.find((c) => c.symbol === 'CCCUSDT')!.onboardDate;
      // gồm mốc cuối (sau khi BBB đổi chu kỳ funding) và hai mốc sát lúc CCCUSDT niêm yết (−1 giờ: chưa có; +1 giờ: đã có)
      const picks = new Set<number>([times[times.length - 1]!, onboard - HOUR, onboard + HOUR]);
      while (picks.size < 7) picks.add(times[Math.floor(r() * times.length)]!);
      const rep = createReplay(OPTS(dir, mode));
      let analysed = 0;
      for (const t of picks) {
        const at = new Date(t).toISOString();
        const wantInput = independentInput(dir, mode, t);
        assertSameInput(rep.buildInput(t, EMPTY), wantInput, at);
        const got = await rep.replayStep(t, EMPTY);
        const want = await runScan(wantInput);
        assert.deepStrictEqual(got, want, `lệch tại ${new Date(t).toISOString()}`);
        analysed += got.results.length;
      }
      assert.ok(analysed > 0, 'phải có mã được chấm (bài kiểm không rỗng)');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('replayStep: vũ trụ = hợp đồng có onboardDate ≤ t (CCCUSDT chưa niêm yết thì không có)', async () => {
  const dir = buildCache();
  try {
    const rep = createReplay(OPTS(dir, 'swing'));
    const onboard = CONTRACTS.find((c) => c.symbol === 'CCCUSDT')!.onboardDate;
    assert.equal(rep.buildInput(onboard - HOUR, EMPTY).contracts.some((c) => c.symbol === 'CCCUSDT'), false, 'chưa niêm yết 1 giờ trước onboardDate');
    assert.equal(rep.buildInput(onboard + HOUR, EMPTY).contracts.some((c) => c.symbol === 'CCCUSDT'), true);
    assert.equal(rep.buildInput(onboard + HOUR, EMPTY).tickers.some((x) => x.symbol === 'CCCUSDT'), true);
    assert.equal(rep.buildInput(onboard - HOUR, EMPTY).tickers.some((x) => x.symbol === 'CCCUSDT'), false);
    const early = rep.buildInput(WIN.start + 2 * HOUR, EMPTY);
    assert.deepEqual(early.contracts.map((c) => c.symbol).sort(), ['AAAUSDT', 'BBBUSDT', 'BTCUSDT']);
    const late = rep.buildInput(WIN.start + 40 * HOUR, EMPTY);
    assert.ok(late.contracts.some((c) => c.symbol === 'CCCUSDT'));
    // trạng thái do nơi gọi cấp được chuyển nguyên vào runScan
    const prev = new Map([['AAAUSDT', { id: 'x', side: 'long' as const, kind: 'zone' as const, endedAt: null }]]);
    assert.equal(rep.buildInput(WIN.start + 2 * HOUR, { openTrades: [], prevSignals: prev }).prevSignals, prev);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- (b) Chống nhìn trước: đổi mọi dữ liệu từ t trở đi không làm đổi kết quả tại t ----------
for (const mode of ['swing', 'fast'] as const) {
  test(`(b) ${mode}: sửa mọi nến có closeTime ≥ t và funding sau t → kết quả tại t KHÔNG đổi`, async () => {
    const t = WIN.start + 29 * HOUR + (mode === 'fast' ? 45 * MINUTE : 0);
    const clean = buildCache();
    const dirty = buildCache({
      // khối lượng sau t đổi BẤT ĐỐI XỨNG (AAA/CCC ×50, BTC/BBB ÷50) → nếu hạng thanh khoản dùng dữ liệu sau t thì thứ hạng đảo
      candle: (c, s) => {
        if (c.closeTime < t) return c;
        const f = s === 'AAAUSDT' || s === 'CCCUSDT' ? 50 : 1 / 50;
        return { ...c, open: c.open * 3, high: c.high * 3.5, low: c.low * 2, close: c.close * 3.2, volume: c.volume * f, quoteVolume: c.quoteVolume * f, takerBuyQuote: c.takerBuyQuote * f };
      },
      funding: (r) => (r.fundingTime > t ? { ...r, fundingRate: 0.05 } : r),
    });
    try {
      const a = await createReplay(OPTS(clean, mode)).replayStep(t, EMPTY);
      const b = await createReplay(OPTS(dirty, mode)).replayStep(t, EMPTY);
      assert.ok(a.results.length > 0);
      assert.deepStrictEqual(b, a);
      // đối chứng: dữ liệu đã sửa thật sự khác → tại mốc SAU t kết quả phải khác
      const later = t + (mode === 'fast' ? 15 * MINUTE : HOUR) * 4;
      const a2 = await createReplay(OPTS(clean, mode)).replayStep(later, EMPTY);
      const b2 = await createReplay(OPTS(dirty, mode)).replayStep(later, EMPTY);
      assert.notDeepStrictEqual(b2, a2);
    } finally {
      rmSync(clean, { recursive: true, force: true });
      rmSync(dirty, { recursive: true, force: true });
    }
  });
}

test('replayStep: mã thiếu tệp đệm của một khung → ghi lỗi cho mã đó, các mã khác vẫn chấm', async () => {
  const dir = buildCache();
  try {
    rmSync(join(dir, 'klines', 'AAAUSDT', '4h'), { recursive: true });
    const r = await createReplay(OPTS(dir, 'swing')).replayStep(WIN.start + 5 * HOUR, EMPTY);
    assert.equal(r.errors.length, 1);
    assert.equal(r.errors[0]!.symbol, 'AAAUSDT');
    assert.match(r.errors[0]!.error, /thiếu tệp đệm AAAUSDT 4h/);
    assert.ok(r.results.length >= 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


test('signalDedupeKey: mô hình theo mã + patternId + breakoutTime (một lần phá = một lệnh); vùng theo signalId', () => {
  const p = (patternId: string, breakoutTime: number) => ({ symbol: 'AAAUSDT', signalId: 'AAAUSDT|swing|long|pattern|' + patternId, pattern: { patternId, breakoutTime } });
  assert.equal(signalDedupeKey(p('pid1', 1000)), signalDedupeKey({ ...p('pid1', 1000), signalId: 'khác' })); // in lại nhiều lần → cùng khóa
  assert.notEqual(signalDedupeKey(p('pid1', 1000)), signalDedupeKey(p('pid1', 2000))); // lần phá khác → lệnh khác
  assert.notEqual(signalDedupeKey(p('pid1', 1000)), signalDedupeKey(p('pid2', 1000)));
  assert.notEqual(signalDedupeKey(p('pid1', 1000)), signalDedupeKey({ ...p('pid1', 1000), symbol: 'BBBUSDT' }));
  const z = { symbol: 'AAAUSDT', signalId: 'AAAUSDT|swing|short|zone|1|2', pattern: null };
  assert.equal(signalDedupeKey(z), signalDedupeKey({ ...z }));
  assert.notEqual(signalDedupeKey(z), signalDedupeKey({ ...z, signalId: 'AAAUSDT|swing|short|zone|5|2' }));
  assert.throws(() => signalDedupeKey({ ...z, signalId: null }), /thiếu signalId/);
});

test('previousBlindRuns: kỳ mù chỉ chạy một lần mỗi chế độ', () => {
  const root = mkdtempSync(join(tmpdir(), 'replay-out-'));
  try {
    assert.deepEqual(previousBlindRuns(join(root, 'khong-co'), 'swing'), []);
    mkdirSync(join(root, 'replay-swing-dev-2026'));
    assert.deepEqual(previousBlindRuns(root, 'swing'), []);
    mkdirSync(join(root, 'replay-swing-blind-2026'));
    assert.deepEqual(previousBlindRuns(root, 'swing'), ['replay-swing-blind-2026']);
    assert.deepEqual(previousBlindRuns(root, 'fast'), []);
    // marker riêng từng kỳ: lần chạy C không bị tính là B và ngược lại
    assert.deepEqual(previousBlindRuns(root, 'swing', 'blind-c'), []);
    mkdirSync(join(root, 'replay-swing-blind-c-2026'));
    assert.deepEqual(previousBlindRuns(root, 'swing', 'blind-c'), ['replay-swing-blind-c-2026']);
    assert.deepEqual(previousBlindRuns(root, 'swing', 'blind'), ['replay-swing-blind-2026']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
