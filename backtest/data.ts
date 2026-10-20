// Tải và lưu đệm dữ liệu lịch sử Binance Futures cho phát lại (kế hoạch 2, Task 1).
//
// Bố cục bộ nhớ đệm (mặc định data/cache/, đã ghi trong .gitignore):
//   klines/<SYMBOL>/<interval>/<YYYY-MM>.json   — nến đã đóng, một tệp mỗi (mã, khung, THÁNG UTC); riêng 1m: <YYYY-MM-DD>.json
//   funding/<SYMBOL>.json                        — lịch sử funding thật từng kỳ
//   oi/<SYMBOL>.json                             — lịch sử Open Interest (Binance chỉ giữ 30 ngày gần nhất, period 1h)
//   universe.json                                — exchangeInfo hiện tại (đã lọc) + xếp hạng thanh khoản 24h
// Mỗi tệp nến ghi `from`/`to` (khoảng [from,to) đã tải xong). Tệp chỉ được coi là đủ khi bao phủ khoảng cần;
// tải lại được giữa chừng vì mỗi tệp được ghi nguyên tử (ghi tệp tạm rồi đổi tên) và chạy lại bỏ qua tệp đủ.
// Nến chưa đóng không bao giờ được lưu: `to` bị cắt tại min(to, now) làm tròn xuống lưới khung, và parseKlines
// lọc bằng isClosed(candle, now) — cùng ranh giới với máy quét.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Candle } from '../packages/core/types.ts';
import { parseKlines } from '../packages/binance/parse.ts';
import { isClosed } from '../packages/core/candles.ts';
import { parseFgi, type FgiRow } from '../packages/core/fgi.ts';

export type Interval = '1d' | '4h' | '1h' | '15m' | '5m' | '1m';
export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;
export const INTERVAL_MS: Record<Interval, number> = { '1d': DAY, '4h': 4 * HOUR, '1h': HOUR, '15m': 15 * MINUTE, '5m': 5 * MINUTE, '1m': MINUTE };

// Giới hạn theo tài liệu Binance (developers.binance.com, USDⓈ-M Futures, đối chiếu 2026-10-19):
//  - klines: limit tối đa 1500; weight 1 (<100), 2 (100–499), 5 (500–1000), 10 (>1000)
//  - fundingRate: limit tối đa 1000; chung hạn mức 500 lệnh/5 phút/IP với fundingInfo
//  - openInterestHist: limit tối đa 500; hạn mức 1000 lệnh/5 phút/IP; chỉ có 30 ngày gần nhất
export const KLINE_MAX_LIMIT = 1500;
export const FUNDING_MAX_LIMIT = 1000;
export const OI_MAX_LIMIT = 500;
export const OI_AVAILABLE_DAYS = 30;

export function klineWeight(limit: number): number {
  if (limit < 100) return 1;
  if (limit < 500) return 2;
  if (limit <= 1000) return 5;
  return 10;
}

export type Plan = { end: number; evalStart: number; oosStart: number };

// end = nửa đêm UTC cố định. 30 ngày đánh giá, cộng thêm 3 THÁNG LỊCH trước đó cho ngoài mẫu.
export function planRange(end: number): Plan {
  const evalStart = end - 30 * DAY;
  const d = new Date(evalStart);
  d.setUTCMonth(d.getUTCMonth() - 3);
  return { end, evalStart, oosStart: d.getTime() };
}

// Điểm bắt đầu tải cho một khung: thêm nến khởi động trước mốc sớm nhất sẽ phát lại (oosStart).
export function needFrom(interval: Interval, oosStart: number): number {
  const bars = interval === '1d' ? 300 : 500;
  return oosStart - bars * INTERVAL_MS[interval];
}

// ---- Giới hạn tốc độ riêng cho endpoint weight 0 nhưng có hạn mức lệnh/5 phút ----
export function createPacer(maxPerWindow: number, windowMs: number, now: () => number, sleep: (ms: number) => Promise<void>): () => Promise<void> {
  const stamps: number[] = [];
  return async () => {
    if (stamps.length >= maxPerWindow) {
      const wait = stamps[0]! + windowMs - now() + 1000;
      if (wait > 0) await sleep(wait);
    }
    const t = now();
    while (stamps.length > 0 && stamps[0]! <= t - windowMs) stamps.shift();
    stamps.push(t);
    if (stamps.length > maxPerWindow) stamps.shift();
  };
}

// ---- Kiểu & tiện ích ----
export type Gap = { symbol: string; interval: Interval; afterOpenTime: number; missingBars: number };
export type Stats = { requests: number; weight: number; bytesWritten: number; filesWritten: number; filesSkipped: number; gaps: Gap[] };
type ClientLike = { get(path: string): Promise<unknown>; usedWeight(): number };

type ChunkFile = { symbol: string; interval: Interval; from: number; to: number; gaps: Gap[]; candles: number[][] };

const toRow = (c: Candle): number[] => [c.openTime, c.closeTime, c.open, c.high, c.low, c.close, c.volume, c.quoteVolume, c.takerBuyQuote];
const fromRow = (r: number[]): Candle => ({
  openTime: r[0]!, closeTime: r[1]!, open: r[2]!, high: r[3]!, low: r[4]!, close: r[5]!, volume: r[6]!, quoteVolume: r[7]!, takerBuyQuote: r[8]!,
});

function writeAtomic(path: string, text: string): number {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + '.tmp';
  writeFileSync(tmp, text);
  renameSync(tmp, path);
  return Buffer.byteLength(text);
}

function readJson(path: string): unknown | null {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
  return JSON.parse(text); // JSON hỏng → ném SyntaxError cho nơi gọi quyết định
}

const pad = (n: number) => String(n).padStart(2, '0');
function chunkKey(interval: Interval, t: number): { key: string; start: number; end: number } {
  const d = new Date(t);
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  if (interval === '1m') {
    const start = Date.UTC(y, m, d.getUTCDate());
    return { key: `${y}-${pad(m + 1)}-${pad(d.getUTCDate())}`, start, end: start + DAY };
  }
  return { key: `${y}-${pad(m + 1)}`, start: Date.UTC(y, m, 1), end: Date.UTC(y, m + 1, 1) };
}

const chunkPath = (dir: string, symbol: string, interval: Interval, key: string) => join(dir, 'klines', symbol, interval, key + '.json');

// Duyệt chuỗi nến đã sắp xếp: ném lỗi nếu không tăng nghiêm ngặt / lệch lưới; trả về các khoảng trống bên trong.
export function findGaps(symbol: string, interval: Interval, candles: Candle[]): Gap[] {
  const iv = INTERVAL_MS[interval];
  const gaps: Gap[] = [];
  for (let i = 1; i < candles.length; i++) {
    const diff = candles[i]!.openTime - candles[i - 1]!.openTime;
    if (diff <= 0) throw new Error(`${symbol} ${interval}: nến sai thứ tự hoặc trùng tại ${new Date(candles[i]!.openTime).toISOString()}`);
    if (diff % iv !== 0) throw new Error(`${symbol} ${interval}: nến lệch lưới tại ${new Date(candles[i]!.openTime).toISOString()}`);
    if (diff > iv) gaps.push({ symbol, interval, afterOpenTime: candles[i - 1]!.openTime, missingBars: diff / iv - 1 });
  }
  return gaps;
}

function parseChunk(raw: unknown, symbol: string, interval: Interval): ChunkFile {
  const c = raw as Partial<ChunkFile> | null;
  if (!c || typeof c.from !== 'number' || typeof c.to !== 'number' || !Array.isArray(c.candles) || !Array.isArray(c.gaps)) {
    throw new Error('cấu trúc tệp không đúng');
  }
  if (c.symbol !== symbol || c.interval !== interval) throw new Error('tệp không thuộc mã/khung này');
  return c as ChunkFile;
}

// Đọc cửa sổ [from,to) nến đã đóng từ bộ nhớ đệm (đồng bộ, dùng cho phát lại). Ném lỗi nếu tệp thiếu/hỏng/sai thứ tự.
export function loadCandles(dir: string, symbol: string, interval: Interval, from: number, to: number): { candles: Candle[]; gaps: Gap[] } {
  const out: Candle[] = [];
  for (let t = chunkKey(interval, from).start; t < to; t = chunkKey(interval, t).end) {
    const { key, start, end } = chunkKey(interval, t);
    const raw = readJson(chunkPath(dir, symbol, interval, key));
    if (raw === null) throw new Error(`thiếu tệp đệm ${symbol} ${interval} ${key}`);
    const chunk = parseChunk(raw, symbol, interval);
    // Tệp phải phủ phần cửa sổ nằm trong tháng/ngày này; thiếu → ném lỗi (không trả ít nến âm thầm).
    // Dùng from/to của tệp (không dùng nến đầu/cuối) để niêm yết muộn/ngừng giao dịch không bị báo nhầm.
    const iv = INTERVAL_MS[interval];
    const need0 = Math.ceil(Math.max(from, start) / iv) * iv;
    const need1 = Math.floor(Math.min(to, end) / iv) * iv;
    if (need0 < need1 && (chunk.from > need0 || chunk.to < need1)) {
      throw new Error(`${symbol} ${interval} ${key}: tệp đệm không phủ cửa sổ cần [${new Date(need0).toISOString()}, ${new Date(need1).toISOString()}) — đã tải [${new Date(chunk.from).toISOString()}, ${new Date(chunk.to).toISOString()}), phần còn lại chưa được tải`);
    }
    for (const r of chunk.candles) {
      const c = fromRow(r);
      if (c.openTime >= from && isClosed(c, to)) out.push(c); // cùng ranh giới nến đóng với máy quét
    }
  }
  return { candles: out, gaps: findGaps(symbol, interval, out) };
}

// FGI (Alternative.me — ghi nguồn) cho luật FGI-hướng: data/cache/fgi.json = bản thô API lưu bởi backtest/fetch-fgi.ts
// ({ fetchedAt, url, raw }). Chỉ giữ ngày < `to` (không nạp dữ liệu sau cửa sổ); fgiDirectionAt tự áp độ trễ theo thời điểm.
export const FGI_FILE = 'fgi.json';
export function loadFgi(dir: string, to: number): FgiRow[] {
  const path = join(dir, FGI_FILE);
  const saved = readJson(path) as { raw?: unknown } | null;
  if (saved === null) throw new Error(`thiếu ${path} — chạy node backtest/fetch-fgi.ts trước (luật FGI-hướng đang bật)`);
  if (saved.raw === undefined) throw new Error(`${path}: thiếu trường raw`);
  return parseFgi(saved.raw).filter((r) => r.day < to);
}

// ---- Bộ tải ----
export function createFetcher(deps: {
  client: ClientLike;
  dir: string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
  pageLimit?: number;
  fundingLimit?: number;
  oiLimit?: number;
}) {
  const { client, dir } = deps;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = deps.log ?? (() => {});
  const pageLimit = deps.pageLimit ?? KLINE_MAX_LIMIT;
  const fundingLimit = deps.fundingLimit ?? FUNDING_MAX_LIMIT;
  const oiLimit = deps.oiLimit ?? OI_MAX_LIMIT;
  // Chừa biên: 500 → 450, 1000 → 900 lệnh mỗi 5 phút
  const fundingPace = createPacer(450, 300_000, now, sleep);
  const oiPace = createPacer(900, 300_000, now, sleep);
  const stats: Stats = { requests: 0, weight: 0, bytesWritten: 0, filesWritten: 0, filesSkipped: 0, gaps: [] };

  async function call(path: string, weight: number): Promise<unknown> {
    stats.requests++;
    stats.weight += weight;
    return client.get(path);
  }

  function write(path: string, obj: unknown) {
    stats.bytesWritten += writeAtomic(path, JSON.stringify(obj));
    stats.filesWritten++;
  }

  async function downloadKlines(symbol: string, interval: Interval, from: number, to: number): Promise<Candle[]> {
    const iv = INTERVAL_MS[interval];
    const out: Candle[] = [];
    let cursor = from;
    while (cursor < to) {
      const q = `symbol=${symbol}&interval=${interval}&startTime=${cursor}&endTime=${to - 1}&limit=${pageLimit}`;
      const raw = await call(`/fapi/v1/klines?${q}`, klineWeight(pageLimit));
      if (!Array.isArray(raw)) throw new Error(`klines ${symbol} ${interval}: kỳ vọng mảng`);
      if (raw.length === 0) break;
      for (const k of parseKlines(raw, now())) {
        const lastOut = out[out.length - 1];
        if (k.openTime < cursor || k.openTime >= to) continue;
        if (lastOut && k.openTime <= lastOut.openTime) continue; // chống trùng ở biên trang
        out.push(k);
      }
      if (raw.length < pageLimit) break;
      const lastOpen = Number((raw[raw.length - 1] as unknown[])[0]);
      if (!Number.isFinite(lastOpen)) throw new Error(`klines ${symbol} ${interval}: openTime cuối không hợp lệ`);
      cursor = lastOpen + iv;
    }
    return out;
  }

  async function fetchCandles(symbol: string, interval: Interval, from: number, to: number): Promise<void> {
    const iv = INTERVAL_MS[interval];
    const toEff = Math.floor(Math.min(to, now()) / iv) * iv; // không bao giờ chạm nến đang chạy
    const fromA = Math.ceil(from / iv) * iv;
    for (let t = chunkKey(interval, fromA).start; t < toEff; t = chunkKey(interval, t).end) {
      const { key, start, end } = chunkKey(interval, t);
      const ws = Math.max(start, fromA);
      const we = Math.min(end, toEff);
      if (ws >= we) continue;
      const path = chunkPath(dir, symbol, interval, key);
      try {
        const raw = readJson(path);
        if (raw !== null) {
          const c = parseChunk(raw, symbol, interval);
          if (c.from <= ws && c.to >= we) { stats.filesSkipped++; continue; }
        }
      } catch (e) {
        log(`tệp đệm hỏng, sẽ tải lại: ${path} (${(e as Error).message})`);
      }
      const candles = await downloadKlines(symbol, interval, ws, we);
      const gaps = findGaps(symbol, interval, candles);
      for (const g of gaps) {
        log(`khoảng trống sàn: ${symbol} ${interval} sau ${new Date(g.afterOpenTime).toISOString()} thiếu ${g.missingBars} nến`);
        stats.gaps.push(g);
      }
      write(path, { symbol, interval, from: ws, to: we, gaps, candles: candles.map(toRow) } satisfies ChunkFile);
    }
  }

  async function fetchFunding(symbol: string, from: number, to: number): Promise<void> {
    const path = join(dir, 'funding', symbol + '.json');
    try {
      const c = readJson(path) as { from: number; to: number; rows: unknown[] } | null;
      if (c && c.from <= from && c.to >= to && Array.isArray(c.rows)) { stats.filesSkipped++; return; }
    } catch (e) {
      log(`tệp funding hỏng, sẽ tải lại: ${path} (${(e as Error).message})`);
    }
    const rows: { fundingTime: number; fundingRate: number; markPrice: number }[] = [];
    let cursor = from;
    while (cursor < to) {
      await fundingPace();
      const raw = await call(`/fapi/v1/fundingRate?symbol=${symbol}&startTime=${cursor}&endTime=${to - 1}&limit=${fundingLimit}`, 0);
      if (!Array.isArray(raw)) throw new Error(`fundingRate ${symbol}: kỳ vọng mảng`);
      if (raw.length === 0) break;
      for (const r of raw as Record<string, unknown>[]) {
        const fundingTime = Number(r.fundingTime), fundingRate = Number(r.fundingRate), markPrice = Number(r.markPrice);
        if (!Number.isFinite(fundingTime) || !Number.isFinite(fundingRate)) throw new Error(`fundingRate ${symbol}: hàng không hợp lệ ${JSON.stringify(r).slice(0, 120)}`);
        const last = rows[rows.length - 1];
        if (last && fundingTime <= last.fundingTime) continue;
        rows.push({ fundingTime, fundingRate, markPrice: Number.isFinite(markPrice) ? markPrice : 0 });
      }
      if (raw.length < fundingLimit) break;
      cursor = rows[rows.length - 1]!.fundingTime + 1;
    }
    write(path, { symbol, from, to, rows });
  }

  // OI: Binance chỉ giữ 30 ngày gần nhất → ghi availableDays=30; ngoài khoảng đó không có dữ liệu.
  async function fetchOpenInterest(symbol: string, from: number, to: number): Promise<void> {
    const path = join(dir, 'oi', symbol + '.json');
    try {
      const c = readJson(path) as { from: number; to: number } | null;
      if (c && c.from <= from && c.to >= to) { stats.filesSkipped++; return; }
    } catch (e) {
      log(`tệp OI hỏng, sẽ tải lại: ${path} (${(e as Error).message})`);
    }
    // Binance trả `limit` hàng CUỐI của [startTime, endTime] (neo theo endTime) → phân trang LÙI từ `to`:
    // mỗi trang đặt endTime = timestamp đầu của trang trước − 1, dừng khi trang ngắn (hết dữ liệu) hoặc chạm `from`.
    const byTs = new Map<number, { timestamp: number; sumOpenInterest: number; sumOpenInterestValue: number }>();
    let endTime = to - 1;
    while (endTime >= from) {
      await oiPace();
      const raw = await call(`/futures/data/openInterestHist?symbol=${symbol}&period=1h&startTime=${from}&endTime=${endTime}&limit=${oiLimit}`, 0);
      if (!Array.isArray(raw)) throw new Error(`openInterestHist ${symbol}: kỳ vọng mảng`);
      if (raw.length === 0) break;
      let minTs = Infinity;
      for (const r of raw as Record<string, unknown>[]) {
        const timestamp = Number(r.timestamp), sumOpenInterest = Number(r.sumOpenInterest), sumOpenInterestValue = Number(r.sumOpenInterestValue);
        if (!Number.isFinite(timestamp) || !Number.isFinite(sumOpenInterest) || !Number.isFinite(sumOpenInterestValue)) {
          throw new Error(`openInterestHist ${symbol}: hàng không hợp lệ ${JSON.stringify(r).slice(0, 120)}`);
        }
        byTs.set(timestamp, { timestamp, sumOpenInterest, sumOpenInterestValue });
        if (timestamp < minTs) minTs = timestamp;
      }
      if (raw.length < oiLimit) break; // trang ngắn: đã tới hàng đầu tiên có thật
      if (minTs - 1 >= endTime) throw new Error(`openInterestHist ${symbol}: phân trang lùi không tiến được`);
      endTime = minTs - 1;
    }
    const rows = [...byTs.values()].sort((x, y) => x.timestamp - y.timestamp);
    {
      for (let i = 1; i < rows.length; i++) {
        if (rows[i]!.timestamp - rows[i - 1]!.timestamp > HOUR) log(`OI ${symbol}: thiếu dữ liệu sau ${new Date(rows[i - 1]!.timestamp).toISOString()} (sàn bỏ kỳ không có giao dịch)`);
      }
    }
    write(path, { symbol, period: '1h', availableDays: OI_AVAILABLE_DAYS, from, to, firstTimestamp: rows[0]?.timestamp ?? null, rows });
  }

  return { fetchCandles, fetchFunding, fetchOpenInterest, stats, write, call, now };
}

export type Fetcher = ReturnType<typeof createFetcher>;

// 1m chỉ tải theo nhu cầu (phân xử SL/TP trong một cửa sổ hẹp): mỗi ngày UTC một tệp.
export const fetchWindow1m = (f: Fetcher, symbol: string, from: number, to: number) => f.fetchCandles(symbol, '1m', from, to);

// ---- Điều phối: nhiều mã × nhiều khung. 418/429 → dừng ngay; lỗi khác gom lại và đi tiếp. ----
export async function fetchAll(opts: {
  fetcher: Fetcher;
  plan: Plan;
  symbols: string[];
  fastSymbols: string[]; // chỉ các mã này mới tải 15m/5m
  intervals: Interval[];
  withFunding: boolean;
  withOi: boolean;
  onProgress?: (done: number, total: number, symbol: string) => void;
}): Promise<{ failures: { symbol: string; what: string; error: string }[] }> {
  const failures: { symbol: string; what: string; error: string }[] = [];
  const fast = new Set(opts.fastSymbols);
  const total = opts.symbols.length;
  let done = 0;
  // Binance từ chối (HTTP 400) startTime cũ hơn 30 ngày TÍNH TỪ BÂY GIỜ → mốc muộn hơn của (end−30d, now−30d), làm tròn lên giờ.
  // Tính lại ở MỖI lần gọi (không tính một lần đầu chạy): lần tải dài hơn 1 giờ sẽ làm mốc cũ trôi ra ngoài cửa sổ 30 ngày.
  const oiFromNow = () => Math.ceil(Math.max(opts.plan.end, opts.fetcher.now()) / HOUR) * HOUR - OI_AVAILABLE_DAYS * DAY;
  for (const symbol of opts.symbols) {
    const jobs: { what: string; run: () => Promise<void> }[] = [];
    for (const iv of opts.intervals) {
      if ((iv === '15m' || iv === '5m') && !fast.has(symbol)) continue;
      jobs.push({ what: iv, run: () => opts.fetcher.fetchCandles(symbol, iv, needFrom(iv, opts.plan.oosStart), opts.plan.end) });
    }
    if (opts.withFunding) jobs.push({ what: 'funding', run: () => opts.fetcher.fetchFunding(symbol, needFrom('1d', opts.plan.oosStart), opts.plan.end) });
    if (opts.withOi) jobs.push({ what: 'oi', run: () => opts.fetcher.fetchOpenInterest(symbol, oiFromNow(), opts.plan.end) });
    for (const job of jobs) {
      try {
        await job.run();
      } catch (e) {
        const msg = (e as Error).message;
        if (/HTTP (418|429)|đang chặn tạm thời/.test(msg)) throw e; // bị giới hạn/ban: dừng hẳn
        failures.push({ symbol, what: job.what, error: msg });
      }
    }
    done++;
    opts.onProgress?.(done, total, symbol);
  }
  return { failures };
}
