// Máy phát lại (kế hoạch 2, Task 2): tại mỗi mốc quyết định t dựng ScanInput THEO THỜI ĐIỂM từ bộ nhớ đệm (data/cache/)
// rồi gọi ĐÚNG runScan (scanner/run-scan.ts) như máy quét. Trạng thái (openTrades, prevSignals) do nơi gọi giữ — bộ mô phỏng (Task 3).
//
//   node backtest/replay.ts --period dev --mode swing|fast [--limit N] [--from ISO] [--to ISO] [--capital 1000] [--dir data/cache]
//   Kỳ mù B chỉ chạy được với: --period blind --blind --lock docs/verification/khoa-luat-mo-phong-mu.md (tệp phải tồn tại).
//
// QUY ƯỚC THAY THẾ (không có lịch sử thật — ghi rõ để đọc kết quả đúng):
//  1. Nến: chỉ nến có closeTime < t (isClosed — cùng ranh giới với máy quét), tối đa `limit − 1` nến gần nhất: máy quét gọi
//     /fapi/v1/klines?limit=N, sàn trả cả nến ĐANG CHẠY, parseKlines bỏ nến đó → còn N − 1 nến đã đóng. Phát lại trả đúng số đó.
//  2. tickers (khối lượng quote 24h, % đổi giá 24h): tính từ nến 1H lịch sử đã đóng trong [t − 24h, t) — KHÔNG dùng thứ hạng hôm nay
//     (đánh giá độc lập I6). Hạng thanh khoản = liquidityRanks của chính các tickers này (như máy quét).
//  3. Spread (bookTicker): KHÔNG có lịch sử sổ lệnh → mô hình xấp xỉ REPLAY_ASSUMPTIONS.spread: max(sàn theo nhóm thanh khoản,
//     hệ số × trung vị biên độ (high − low)/close của 24 nến 1H gần nhất). Đề xuất, chưa kiểm chứng; chỉ ảnh hưởng cổng G-03.
//     KHÔNG chứng minh được là thận trọng: sàn nhóm thấp 0,10% < maxSpreadPct 0,15% → mã chỉ bị chặn khi trung vị biên độ 1H > 3%,
//     nên phần spread của G-03 gần như VÔ HIỆU trong phát lại (phần hạng thanh khoản của G-03 vẫn hoạt động).
//  4. Giá mark: ≈ giá đóng của nến đã đóng gần nhất (Swing: 1H; Lướt nhanh: 15m, thiếu thì 1H). t nằm trên lưới khung nên giá này
//     trùng giá đóng nến 1m/5m cuối trước t; bỏ qua chênh lệch mark − last (thường < 0,1%).
//  5. Funding: lastFundingRate = kỳ ĐÃ CHỐT gần nhất (fundingTime ≤ t) từ /fapi/v1/fundingRate; premiumIndex thật trả tỉ lệ ƯỚC TÍNH
//     của kỳ đang chạy → phát lại trễ 1 kỳ. Chu kỳ = khoảng cách 2 kỳ chốt gần nhất (làm tròn giờ); chưa đủ 2 kỳ → mặc định của máy quét.
//     nextFundingTime = kỳ chốt gần nhất + chu kỳ. Khi sàn đổi chu kỳ, phát lại biết muộn 1 kỳ (máy quét đọc ngay từ fundingInfo).
//  6. Sự kiện vĩ mô: lịch FOMC/CPI là lịch công bố TRƯỚC → đưa cả lịch (data/events/events.json, đã bổ sung kỳ D/B có nguồn).
//  7. Vũ trụ: hợp đồng HIỆN TẠI (exchangeInfo hôm nay) có onboardDate ≤ t và có trong bộ nhớ đệm → THIÊN LỆCH SỐNG SÓT: mã đã bị
//     gỡ niêm yết trong kỳ không có mặt. Bộ lọc sàn (tickSize, minQty…) là của hôm nay.
//  8. Lướt nhanh: 15m chỉ tải cho 150 mã thanh khoản nhất HÔM NAY; mã lọt top 150 tại t mà không có 15m → lỗi "thiếu tệp đệm" (đếm riêng).
//  9. Nến 1D: bộ đệm có 302 nến BTC tại 21/6 (391 tại 18/9) thay vì 400 của máy quét. Rà soát Task 2 đã đo: chế độ thị trường (SMA200,
//     sụt từ đỉnh 365 ngày — đỉnh 06/10/2025 nằm trong đệm) trùng 120/120 ngày; luật cấm Short 30 ngày sau khi BTC lấy lại SMA200
//     không đổi (nhìn được ≥ 102 ngày). Chỉ trường hiển thị ScanResult.btcReclaim có thể là null thay vì một mốc cũ hơn.
// 10. OI: runScan không dùng OI → phát lại không đưa vào. Bậc ký quỹ thật (leverageBrackets): không có, như máy quét (bảng giả định).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, normalize, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { runScan, type ScanInput, type ScanResult } from '../scanner/run-scan.ts';
import { liquidityRanks } from '../scanner/rank.ts';
import { COMMON } from '../packages/core/config.ts';
import { parseEvents, type MacroEvent } from '../packages/core/events.ts';
import { advanceSignalState, type SignalState } from '../packages/core/signal.ts';
import type { OpenTrade } from '../packages/core/portfolio.ts';
import type { BookTicker, Candle, Contract, MarketTicker, Mode, PremiumIndex } from '../packages/core/types.ts';
import { HOUR, MINUTE, INTERVAL_MS, loadCandles, needFrom, planRange, type Interval } from './data.ts';

// ---- Kỳ phát triển D / kỳ mù B (docs/superpowers/plans/2026-10-19-ke-hoach-2-doi-chung-du-lieu-that.md, "Quy trình mô phỏng MÙ") ----
export const DATA_END = Date.UTC(2026, 9, 19); // mốc cuối của bộ đệm (backtest/fetch.ts --end mặc định)
export const DEV_PERIOD = { start: Date.UTC(2026, 5, 21), end: Date.UTC(2026, 8, 19) };
export const BLIND_PERIOD = { start: Date.UTC(2026, 8, 19), end: DATA_END };
export const LOCK_FILE = 'docs/verification/khoa-luat-mo-phong-mu.md';
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export type Window = { start: number; end: number };
export type BlindAuth = { blind: boolean; lockFile: string | null };
type Exists = (path: string) => boolean;

// Kỳ mù chỉ mở khi có ĐỦ: cờ --blind + đường dẫn đúng tệp khóa luật + tệp đó tồn tại (luật đã khóa: commit SHA + bản sao config).
function checkBlindAuth(auth: BlindAuth | undefined, exists: Exists): void {
  const why = `kỳ mù B [${new Date(BLIND_PERIOD.start).toISOString()}, ${new Date(BLIND_PERIOD.end).toISOString()})`;
  if (!auth?.blind) throw new Error(`Từ chối chạy trên ${why}: cần cờ --blind và --lock ${LOCK_FILE} (chỉ chạy B đúng một lần sau khi khóa luật)`);
  if (auth.lockFile === null || auth.lockFile === '') throw new Error(`Từ chối chạy trên ${why}: thiếu tệp khóa luật (--lock ${LOCK_FILE})`);
  const given = isAbsolute(auth.lockFile) ? normalize(auth.lockFile) : normalize(join(REPO_ROOT, auth.lockFile));
  const want = normalize(join(REPO_ROOT, LOCK_FILE));
  if (given !== want) throw new Error(`Từ chối chạy trên ${why}: tệp khóa luật phải là ${LOCK_FILE}, nhận "${auth.lockFile}"`);
  if (!exists(want)) throw new Error(`Từ chối chạy trên ${why}: tệp khóa luật ${LOCK_FILE} chưa tồn tại — khóa luật trước (commit SHA + bản sao config.ts)`);
}

export function resolvePeriod(name: string, auth: BlindAuth, exists: Exists = existsSync): { name: 'dev' | 'blind' } & Window {
  if (name === 'dev') return { name: 'dev', ...DEV_PERIOD };
  if (name === 'blind') {
    checkBlindAuth(auth, exists);
    return { name: 'blind', ...BLIND_PERIOD };
  }
  throw new Error(`kỳ không hợp lệ: "${name}" (dev | blind)`);
}

// Cửa sổ chạm kỳ mù (dù 1 ms) → phải qua đúng thủ tục mở kỳ mù.
export function assertWindowAllowed(w: Window, auth: BlindAuth | undefined, exists: Exists = existsSync): void {
  if (!(w.start < w.end)) throw new Error(`cửa sổ phát lại rỗng [${w.start}, ${w.end})`);
  if (w.start < BLIND_PERIOD.end && w.end > BLIND_PERIOD.start) checkBlindAuth(auth, exists);
}

// Mốc quyết định: Swing mỗi giờ; Lướt nhanh mỗi lần đóng nến 15m. t = openTime nến kế tiếp (thời điểm sớm nhất nến trước được coi là đóng).
export function decisionTimes(mode: Mode, w: Window): number[] {
  const step = mode === 'swing' ? HOUR : 15 * MINUTE;
  const out: number[] = [];
  for (let t = Math.ceil(w.start / step) * step; t < w.end; t += step) out.push(t);
  return out;
}

// ---- Quy ước thay thế (đề xuất, chưa kiểm chứng) ----
export const REPLAY_ASSUMPTIONS = {
  spread: {
    rangeFraction: 0.05, // spread ≈ 5% trung vị biên độ nến 1H (xấp xỉ, chưa kiểm chứng; xem quy ước 3 — G-03 gần như vô hiệu)
    floorPct: { high: 0.02, mid: 0.05, low: 0.1 }, // sàn spread (%) theo nhóm thanh khoản COMMON.costTierRank
    bars: 24,
  },
};

// Chỉ số nến đã đóng cuối cùng tại t (closeTime < t), −1 nếu chưa có. Chuỗi phải tăng dần theo openTime.
export function lastClosedIndex(series: readonly Candle[], t: number): number {
  let lo = 0, hi = series.length; // tìm phần tử đầu tiên có closeTime ≥ t
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (series[mid]!.closeTime < t) lo = mid + 1; else hi = mid;
  }
  return lo - 1;
}

export function tickersAt(list: ReadonlyArray<{ symbol: string; hourly: readonly Candle[] }>, t: number): MarketTicker[] {
  const out: MarketTicker[] = [];
  for (const { symbol, hourly } of list) {
    let i = lastClosedIndex(hourly, t);
    if (i < 0) continue;
    let qv = 0, first: Candle | null = null;
    const last = hourly[i]!;
    for (; i >= 0 && hourly[i]!.openTime >= t - 24 * HOUR; i--) {
      qv += hourly[i]!.quoteVolume;
      first = hourly[i]!;
    }
    if (first === null) continue; // không có nến đóng nào trong 24h → không có ticker (máy quét: không giao dịch)
    out.push({ symbol, quoteVolume24h: qv, priceChangePct24h: ((last.close - first.open) / first.open) * 100 });
  }
  return out;
}

export function spreadPctAt(lastHourly: readonly Candle[], rank: number): number {
  const a = REPLAY_ASSUMPTIONS.spread;
  const floor = rank <= COMMON.costTierRank.high ? a.floorPct.high : rank <= COMMON.costTierRank.mid ? a.floorPct.mid : a.floorPct.low;
  const ranges = lastHourly.map((c) => ((c.high - c.low) / c.close) * 100).sort((x, y) => x - y);
  if (ranges.length === 0) return floor;
  const m = ranges.length >> 1;
  const median = ranges.length % 2 === 1 ? ranges[m]! : (ranges[m - 1]! + ranges[m]!) / 2;
  return Math.max(floor, a.rangeFraction * median);
}

export function booksAt(symbol: string, mid: number, spreadPct: number): BookTicker {
  const h = (mid * spreadPct) / 200;
  return { symbol, bid: mid - h, ask: mid + h };
}

// Giá mark ≈ giá đóng của nến đã đóng muộn nhất trong các chuỗi (ưu tiên chuỗi đứng trước khi bằng nhau). null nếu không có.
export function markAt(seriesList: ReadonlyArray<readonly Candle[]>, t: number): number | null {
  let best: Candle | null = null;
  for (const s of seriesList) {
    const i = lastClosedIndex(s, t);
    if (i >= 0 && (best === null || s[i]!.closeTime > best.closeTime)) best = s[i]!;
  }
  return best === null ? null : best.close;
}

export type FundingRow = { fundingTime: number; fundingRate: number; markPrice: number };

export function fundingAt(rows: readonly FundingRow[], t: number): { lastFundingRate: number; nextFundingTime: number; intervalHours: number | null } | null {
  let lo = 0, hi = rows.length; // phần tử đầu tiên có fundingTime > t
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (rows[mid]!.fundingTime <= t) lo = mid + 1; else hi = mid;
  }
  const i = lo - 1;
  if (i < 0) return null;
  const last = rows[i]!;
  const prev = i > 0 ? rows[i - 1]! : null;
  const intervalHours = prev === null ? null : Math.round((last.fundingTime - prev.fundingTime) / HOUR);
  const step = (intervalHours ?? COMMON.defaultFundingIntervalHours) * HOUR;
  let next = Math.floor(last.fundingTime / HOUR) * HOUR + step;
  while (next <= t) next += step;
  return { lastFundingRate: last.fundingRate, nextFundingTime: next, intervalHours };
}

// ---- Máy phát lại ----
export type ReplayState = { openTrades: readonly OpenTrade[]; prevSignals: ReadonlyMap<string, SignalState> };

export type ReplayOptions = {
  dir: string;
  mode: Mode;
  window: Window;
  contracts: Contract[]; // hợp đồng hiện tại có trong bộ đệm; lọc onboardDate ≤ t ở từng mốc
  events: MacroEvent[];
  capital: number;
  limit: number | null;
  auth?: BlindAuth;
  exists?: Exists;
  dataFrom?: Partial<Record<Interval, number>>; // mốc đầu tải chuỗi từ đệm; mặc định = điểm đầu đã tải ở Task 1
};

export function createReplay(o: ReplayOptions) {
  assertWindowAllowed(o.window, o.auth, o.exists ?? existsSync);
  const oos = planRange(DATA_END).oosStart;
  const fromOf = (iv: Interval) => o.dataFrom?.[iv] ?? needFrom(iv, oos);
  const store = new Map<string, Candle[] | Error>();
  const funding = new Map<string, FundingRow[] | Error>();
  const stats = { seriesLoaded: 0, seriesMissing: 0, loadMs: 0 };

  // Nạp cả chuỗi một lần (tới hết cửa sổ — không nạp dữ liệu sau cửa sổ), cắt theo t bằng tìm kiếm nhị phân.
  // Lỗi nạp (thiếu tệp đệm…) được GIỮ trong store: klines ném lại cho runScan ghi lỗi của mã; giá mark bỏ qua chuỗi đó.
  function load(symbol: string, interval: Interval): Candle[] | Error {
    const key = symbol + '|' + interval;
    let v = store.get(key);
    if (v === undefined) {
      const t0 = performance.now();
      try {
        v = loadCandles(o.dir, symbol, interval, fromOf(interval), o.window.end).candles;
        stats.seriesLoaded++;
      } catch (e) {
        v = e instanceof Error ? e : new Error(String(e));
        stats.seriesMissing++;
      }
      stats.loadMs += performance.now() - t0;
      store.set(key, v);
    }
    return v;
  }
  function series(symbol: string, interval: Interval): Candle[] {
    const v = load(symbol, interval);
    if (v instanceof Error) throw v;
    return v;
  }
  const trySeries = (symbol: string, interval: Interval): Candle[] | null => {
    const v = load(symbol, interval);
    return v instanceof Error ? null : v;
  };

  function fundingRows(symbol: string): FundingRow[] | null {
    let v = funding.get(symbol);
    if (v === undefined) {
      const path = join(o.dir, 'funding', symbol + '.json');
      try {
        const raw = JSON.parse(readFileSync(path, 'utf8')) as { rows?: unknown };
        if (!Array.isArray(raw.rows)) throw new Error(`${path}: thiếu mảng rows`);
        v = (raw.rows as FundingRow[]).filter((r) => r.fundingTime < o.window.end);
      } catch (e) {
        v = e instanceof Error ? e : new Error(String(e));
      }
      funding.set(symbol, v);
    }
    return v instanceof Error ? null : v;
  }

  function buildInput(t: number, state: ReplayState): ScanInput {
    if (!(t >= o.window.start && t < o.window.end)) {
      throw new Error(`mốc ${new Date(t).toISOString()} ngoài cửa sổ phát lại [${new Date(o.window.start).toISOString()}, ${new Date(o.window.end).toISOString()})`);
    }
    const contracts = o.contracts.filter((c) => c.onboardDate <= t);
    const hourly = new Map<string, Candle[]>();
    for (const c of contracts) {
      const h = trySeries(c.symbol, '1h');
      if (h !== null) hourly.set(c.symbol, h);
    }
    const tickers = tickersAt([...hourly].map(([symbol, h]) => ({ symbol, hourly: h })), t);
    const ranks = liquidityRanks(tickers);
    const books = new Map<string, BookTicker>();
    const premiums = new Map<string, PremiumIndex>();
    const fundingIntervals = new Map<string, number>();
    for (const c of contracts) {
      const h = hourly.get(c.symbol);
      if (h === undefined) continue;
      const fine = o.mode === 'fast' ? [trySeries(c.symbol, '15m'), h].filter((s): s is Candle[] => s !== null) : [h];
      const mark = markAt(fine, t);
      const f = fundingRows(c.symbol);
      const fa = f === null ? null : fundingAt(f, t);
      if (mark === null || fa === null) continue; // thiếu → runScan ghi lỗi "Thiếu bookTicker hoặc premiumIndex" cho mã
      const i = lastClosedIndex(h, t);
      books.set(c.symbol, booksAt(c.symbol, mark, spreadPctAt(h.slice(Math.max(0, i + 1 - REPLAY_ASSUMPTIONS.spread.bars), i + 1), ranks.get(c.symbol) ?? 1)));
      premiums.set(c.symbol, { symbol: c.symbol, markPrice: mark, lastFundingRate: fa.lastFundingRate, nextFundingTime: fa.nextFundingTime });
      if (fa.intervalHours !== null) fundingIntervals.set(c.symbol, fa.intervalHours);
    }
    return {
      mode: o.mode, contracts, tickers, books, premiums, fundingIntervals, now: t, events: o.events, capital: o.capital, limit: o.limit,
      openTrades: state.openTrades, prevSignals: state.prevSignals,
      klines: (symbol, interval, limit) => {
        if (!(interval in INTERVAL_MS)) throw new Error(`khung không hỗ trợ: ${interval}`);
        const s = series(symbol, interval as Interval);
        const i = lastClosedIndex(s, t);
        const n = Math.max(0, limit - 1); // như máy quét: limit nến gồm 1 nến đang chạy bị bỏ (quy ước 1)
        return s.slice(Math.max(0, i + 1 - n), i + 1);
      },
    };
  }

  // Một bước phát lại: CÙNG hàm runScan với máy quét.
  async function replayStep(t: number, state: ReplayState): Promise<ScanResult> {
    return runScan(buildInput(t, state));
  }

  return { buildInput, replayStep, stats };
}

// Khóa khử trùng tín hiệu (brief Task 2; bộ mô phỏng Task 3 dùng lại): mô hình theo mã + patternId + breakoutTime — một lần phá
// chỉ một lệnh dù máy quét in lại kế hoạch nhiều lần trong một nến khung nhận diện; vùng theo mã + signalId (hysteresis I5 giữ id).
export function signalDedupeKey(s: { symbol: string; signalId: string | null; pattern: { patternId: string; breakoutTime: number } | null }): string {
  if (s.pattern !== null) return `${s.symbol}|pattern|${s.pattern.patternId}|${s.pattern.breakoutTime}`;
  if (s.signalId === null) throw new Error(`${s.symbol}: tín hiệu vùng thiếu signalId — không khử trùng được`);
  return `${s.symbol}|zone|${s.signalId}`;
}

// Kỳ mù chỉ chạy ĐÚNG MỘT LẦN mỗi chế độ: đã có thư mục đầu ra replay-<mode>-blind-* → từ chối lần chạy sau.
export function previousBlindRuns(outRoot: string, mode: Mode): string[] {
  if (!existsSync(outRoot)) return [];
  return readdirSync(outRoot).filter((n) => n.startsWith(`replay-${mode}-blind-`)).sort();
}

// ---- CLI ----
type StepSignal = {
  symbol: string; side: string; label: string; grade: string | null; kind: 'zone' | 'pattern'; score: number;
  signalId: string | null; fresh: boolean; held: boolean; entryType: string; entry: number; stop: number;
  pattern: { patternId: string; breakoutTime: number; kind: string; timeframe: string } | null;
};

function stepSignals(r: ScanResult): StepSignal[] {
  return r.results
    .filter((a) => a.label.startsWith('Đạt') && (a.plan !== null || a.patternSignal !== null))
    .map((a) => {
      const ps = a.patternSignal;
      const p = ps ?? a.plan!;
      return {
        symbol: a.symbol, side: p.side, label: a.label, grade: a.grade?.grade ?? null, kind: ps !== null ? 'pattern' : 'zone', score: a.best.score,
        signalId: a.signal?.id ?? null, fresh: a.signal?.fresh ?? false, held: a.signal?.held ?? false,
        entryType: p.entryType, entry: p.entry, stop: p.stop,
        pattern: ps === null ? null : { patternId: ps.patternId, breakoutTime: ps.breakoutTime, kind: ps.kind, timeframe: ps.timeframe },
      };
    });
}

export async function loadContracts(dir: string): Promise<Contract[]> {
  const { parseContracts } = await import('../packages/binance/parse.ts');
  const path = join(dir, 'exchange-info.json');
  if (!existsSync(path)) {
    // universe.json (Task 1) lưu hợp đồng thiếu bộ lọc sàn (I2) → lấy exchangeInfo hiện tại một lần (weight 1) và lưu nguyên văn
    const { createClient } = await import('../packages/binance/client.ts');
    const client = createClient({ fetch: (url) => fetch(url, { signal: AbortSignal.timeout(20_000) }) });
    const raw = await client.get('/fapi/v1/exchangeInfo');
    writeFileSync(path, JSON.stringify({ fetchedAt: new Date().toISOString(), raw }));
    console.log(`Đã lưu exchangeInfo hiện tại vào ${path}`);
  }
  const saved = JSON.parse(readFileSync(path, 'utf8')) as { fetchedAt: string; raw: unknown };
  const universe = JSON.parse(readFileSync(join(dir, 'universe.json'), 'utf8')) as { ranking: string[] };
  const cached = new Set(universe.ranking);
  const all = parseContracts(saved.raw);
  const kept = all.filter((c) => cached.has(c.symbol));
  console.log(`Hợp đồng: exchangeInfo ${saved.fetchedAt} có ${all.length}; có trong bộ đệm ${kept.length}/${cached.size} (thiên lệch sống sót: chỉ mã còn giao dịch hôm nay)`);
  return kept;
}

async function main() {
  const { values: v } = parseArgs({ options: {
    period: { type: 'string', default: 'dev' }, mode: { type: 'string', default: 'swing' }, limit: { type: 'string' },
    from: { type: 'string' }, to: { type: 'string' }, capital: { type: 'string', default: '1000' }, dir: { type: 'string', default: 'data/cache' },
    blind: { type: 'boolean', default: false }, lock: { type: 'string' },
  } });
  if (v.mode !== 'swing' && v.mode !== 'fast') throw new Error(`--mode phải là swing hoặc fast, nhận "${v.mode}"`);
  const mode: Mode = v.mode;
  const posInt = (raw: string, name: string) => {
    if (!/^\d+$/.test(raw) || Number(raw) < 1) throw new Error(`--${name} phải là số nguyên dương, nhận "${raw}"`);
    return Number(raw);
  };
  const limit = v.limit === undefined ? null : posInt(v.limit, 'limit');
  const capital = Number(v.capital);
  if (!Number.isFinite(capital) || capital <= 0) throw new Error(`--capital không hợp lệ: "${v.capital}"`);
  const period = resolvePeriod(v.period!, { blind: v.blind!, lockFile: v.lock ?? null });
  if (period.name === 'blind') {
    const prior = previousBlindRuns(resolve(REPO_ROOT, 'output/backtest'), mode);
    if (prior.length > 0) throw new Error(`Từ chối: kỳ mù chỉ chạy đúng một lần, đã có ${prior.join(', ')}`);
  }
  const parseIso = (raw: string, name: string) => {
    const t = Date.parse(raw);
    if (!Number.isFinite(t)) throw new Error(`--${name} không hợp lệ: "${raw}"`);
    return t;
  };
  const window = { start: v.from ? parseIso(v.from, 'from') : period.start, end: v.to ? parseIso(v.to, 'to') : period.end };
  if (window.start < period.start || window.end > period.end) throw new Error(`--from/--to phải nằm trong kỳ ${period.name}`);
  const dir = v.dir!;
  const events = parseEvents(JSON.parse(readFileSync(join(REPO_ROOT, 'data/events/events.json'), 'utf8')));
  const contracts = await loadContracts(dir);
  const rep = createReplay({ dir, mode, window, contracts, events, capital, limit, auth: { blind: v.blind!, lockFile: v.lock ?? null } });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = resolve(REPO_ROOT, 'output/backtest', `replay-${mode}-${period.name}-${stamp}`);
  mkdirSync(outDir, { recursive: true });
  const stepsFile = join(outDir, 'steps.jsonl');
  writeFileSync(stepsFile, '');

  const times = decisionTimes(mode, window);
  let prevSignals = new Map<string, SignalState>();
  const count = new Map<string, number>();
  const inc = (k: string) => count.set(k, (count.get(k) ?? 0) + 1);
  const distinct = new Map<string, StepSignal & { t: number }>(); // tín hiệu khác nhau: vùng theo signalId, mô hình theo patternId + breakoutTime
  const errorKinds = new Map<string, number>();
  const errorExamples = new Map<string, string>(); // loại lỗi → ví dụ đầu tiên (mã: thông điệp)
  const missing15m = new Set<string>(); // Lướt nhanh: mã lọt top 150 tại t nhưng không có 15m trong bộ đệm
  let errorSteps = 0, stepMsTotal = 0, stepMsMax = 0, analysedTotal = 0;
  const started = performance.now();
  for (let k = 0; k < times.length; k++) {
    const t = times[k]!;
    const s0 = performance.now();
    const r = await rep.replayStep(t, { openTrades: [], prevSignals });
    const ms = performance.now() - s0;
    stepMsTotal += ms;
    stepMsMax = Math.max(stepMsMax, ms);
    analysedTotal += r.results.length;
    // Trạng thái I5 (hysteresis, chặn đảo chiều): cập nhật cho mã được chấm; mã lỗi giữ nguyên trạng thái cũ
    const next = new Map(prevSignals);
    for (const a of r.results) {
      const st = advanceSignalState(prevSignals.get(a.symbol) ?? null, a.signal, t);
      if (st === null) next.delete(a.symbol); else next.set(a.symbol, st);
    }
    prevSignals = next;
    if (r.errors.length > 0) errorSteps++;
    for (const e of r.errors) {
      const kind = /thiếu tệp đệm \S+ 15m/.test(e.error) ? 'thiếu 15m (ngoài 150 mã đã tải)' : /dữ liệu cũ/.test(e.error) ? 'dữ liệu cũ' : /thiếu \d+ nến/.test(e.error) ? 'thiếu nến' : /thiếu tệp đệm/.test(e.error) ? 'thiếu tệp đệm khác' : /premiumIndex/.test(e.error) ? 'thiếu mark/funding' : 'khác';
      errorKinds.set(kind, (errorKinds.get(kind) ?? 0) + 1);
      if (!errorExamples.has(kind)) errorExamples.set(kind, `${e.symbol}: ${e.error}`);
      if (kind.startsWith('thiếu 15m')) missing15m.add(e.symbol);
    }
    const sigs = stepSignals(r);
    for (const s of sigs) {
      inc(`occ|${s.side}|${s.label}|${s.grade}|${s.kind}`);
      const key = signalDedupeKey(s);
      if (!distinct.has(key)) distinct.set(key, { ...s, t });
    }
    appendFileSync(stepsFile, JSON.stringify({
      t: new Date(t).toISOString(), regime: r.regime.regime, breaker: r.breaker.tripped, universe: r.universeSize, inScope: r.inScope,
      analysed: r.results.length, errors: r.errors.length, ms: Math.round(ms), signals: sigs,
    }) + '\n');
    if (k % 50 === 0 || k === times.length - 1) {
      const el = (performance.now() - started) / 1000;
      console.log(`[${k + 1}/${times.length}] ${new Date(t).toISOString()} | ${Math.round(ms)} ms | tín hiệu ${sigs.length} | lỗi ${r.errors.length} | ${el.toFixed(0)} s, ước còn ${((el / (k + 1)) * (times.length - k - 1) / 60).toFixed(1)} phút`);
    }
  }
  const wall = (performance.now() - started) / 1000;
  const by = (f: (s: StepSignal) => string) => {
    const m = new Map<string, number>();
    for (const s of distinct.values()) m.set(f(s), (m.get(f(s)) ?? 0) + 1);
    return Object.fromEntries([...m].sort());
  };
  const occBy = Object.fromEntries([...count].sort());
  const summary = {
    mode, period: period.name, window: { start: new Date(window.start).toISOString(), end: new Date(window.end).toISOString() }, limit, capital,
    steps: times.length, wallSeconds: Math.round(wall), msPerStepAvg: Math.round(stepMsTotal / Math.max(1, times.length)), msPerStepMax: Math.round(stepMsMax),
    loadSeconds: Math.round(rep.stats.loadMs / 1000), seriesLoaded: rep.stats.seriesLoaded, seriesMissing: rep.stats.seriesMissing,
    analysedPerStepAvg: Math.round(analysedTotal / Math.max(1, times.length)), errorSteps, errorKinds: Object.fromEntries(errorKinds),
    errorExamples: Object.fromEntries(errorExamples), missing15mSymbols: [...missing15m].sort(),
    distinctSignals: distinct.size,
    distinctBySide: by((s) => s.side), distinctByGrade: by((s) => `${s.side}|${s.grade}`), distinctByKind: by((s) => `${s.side}|${s.kind}`),
    distinctByLabel: by((s) => s.label),
    occurrences: occBy,
    assumptions: REPLAY_ASSUMPTIONS,
  };
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Đã ghi ${outDir}`);
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    console.error(`LỖI: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
