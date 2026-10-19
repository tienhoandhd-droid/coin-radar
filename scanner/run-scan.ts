import { analyze, contractRisk, type Analysis, type PatternData } from '../packages/core/analyze.ts';
import { marketRegime, circuitBreaker, btcSma200ReclaimedAt, type Regime } from '../packages/core/regime.ts';
import { inPatternScope } from '../packages/core/gates.ts';
import { candleProblems } from '../packages/core/candles.ts';
import { CONFIG, COMMON, type ModeConfig } from '../packages/core/config.ts';
import { fundingFallbackRate } from '../packages/core/sizing.ts';
import { entryBlocks } from '../packages/core/entry-filters.ts';
import type { MacroEvent } from '../packages/core/events.ts';
import type { BookTicker, Candle, Contract, MarketTicker, Mode, PremiumIndex } from '../packages/core/types.ts';
import { liquidityRanks, applyTopRank } from './rank.ts';
import type { OpenTrade } from '../packages/core/portfolio.ts';
import type { SignalState } from '../packages/core/signal.ts';
import type { MarginBracket } from '../packages/core/margin.ts';

// Một lần quét, tách khỏi I/O (rà soát cuối 1c, B4): máy quét (scan.ts) và phát lại/backtest (kế hoạch 2) gọi CÙNG hàm này.
// Mọi dữ liệu thị trường đến từ tham số; nến lấy qua `klines(symbol, interval, limit)` — chỉ được trả nến ĐÃ ĐÓNG tại `now`
// (isClosed), tối đa `limit` nến gần nhất. Máy quét: tải từ Binance; phát lại: cắt từ kho dữ liệu lịch sử tại mốc t.
// Nến BTC (1D 400, 1H 100, khung xu hướng Lướt nhanh) cũng lấy qua `klines`.
// Thay thế theo thời điểm mà phát lại phải tự cung cấp: tickers (quoteVolume 24h → hạng thanh khoản), books (spread — không có
// lịch sử, cần quy ước thay thế cho G-02/G-03), premiums (giá mark tại t — "giá hiện tại" của kế hoạch, I3 — + funding gần nhất + giờ funding kế tiếp),
// fundingIntervals. MỌI chuỗi nến của một mã (xu hướng, vào lệnh, 1D, 1H, 4H mô hình) cũ hơn 1 khung so với `now`, thiếu nến hoặc
// sai thứ tự → mã bị ghi lỗi (nêu khung), không chấm (BTC hỏng → ném lỗi).
export type ScanInput = {
  mode: Mode;
  contracts: Contract[];
  tickers: MarketTicker[];
  books: Map<string, BookTicker>;
  premiums: Map<string, PremiumIndex>;
  fundingIntervals: Map<string, number>; // chu kỳ funding (giờ); mã không có → COMMON.defaultFundingIntervalHours
  klines: (symbol: string, interval: string, limit: number) => Candle[] | Promise<Candle[]>;
  now: number; // ms
  events: MacroEvent[];
  capital: number;
  limit: number | null; // --limit: chỉ quét N hợp đồng thanh khoản cao nhất
  openTrades: readonly OpenTrade[]; // lệnh đang mở (C1/C3) — máy quét: [] (chỉ thông tin); bot/mô phỏng: danh mục thật tại `now`
  leverageBrackets?: ReadonlyMap<string, MarginBracket[]>; // bậc ký quỹ thật theo mã (leverageBracket, cần key — bot); máy quét: không có → bảng giả định
  // |funding| lớn nhất gần đây theo mã (đệm funding trong định cỡ, core/sizing.ts); không có → analyze dùng |funding kỳ gần nhất|
  fundingMaxAbs?: ReadonlyMap<string, number>;
  // Máy quét chạy thật (scanner/funding-history.ts): tải |funding| lớn nhất 30 ngày CHỈ cho mã Đạt tiêu chí (hạn mức 500 lệnh/5 phút),
  // rồi chấm lại mã đó với đệm đúng như planner. Lỗi (trừ 418/429) → mức thận trọng fundingFallbackRate + ghi chú trên kết quả.
  fundingMaxAbsLoader?: (symbol: string) => Promise<number>;
  // Funding TB có dấu mỗi kỳ trong N ngày tới `now` (kỳ đã chốt) theo mã — cho luật vào lệnh #5/#8 (COMMON.entryRules). Không có → các luật
  // đó chặn vì thiếu funding (fail closed). Phát lại: từ bộ đệm; máy quét: chưa tải (luật mặc định tắt).
  fundingMean?: (symbol: string, days: number) => number | null;
  prevSignals: ReadonlyMap<string, SignalState>; // I5: tín hiệu gần nhất theo mã (đang mở hoặc đã kết thúc lúc nào) — cập nhật bằng advanceSignalState sau mỗi lần quét; máy quét: Map rỗng
};

export type ScanResult = {
  regime: { regime: Regime; reasons: string[] };
  breaker: { tripped: boolean; reason: string | null };
  btcReclaim: number | null;
  ranks: Map<string, number>;
  universeSize: number;
  inScope: number; // số hợp đồng thuộc phạm vi mô hình P-G1
  results: Analysis[]; // đã áp applyTopRank
  entryBlocks: Map<string, string>; // Task 8: mã → lý do KHÔNG vào lệnh mới theo COMMON.entryRules (core/entry-filters.ts); bot/mô phỏng bỏ qua tín hiệu này
  errors: Array<{ symbol: string; error: string }>;
  banned: boolean; // Binance chặn (418/429) → đã dừng giữa chừng
};

const BAN = /HTTP (418|429)|đang chặn tạm thời/;

// Nến 1H của một mã (khối lượng 1 phút ước, G-04 bơm/xả 1H, ATR 1H của mô hình) lấy từ đâu: khung xu hướng nếu là 1H (Lướt nhanh mặc định),
// khung vào lệnh nếu là 1H (Lướt nhanh 4H/1H — #2 Task 8), không thì tải riêng (Swing).
export function hourlySource(cfg: Pick<ModeConfig, 'trendInterval' | 'entryInterval'>): 'trend' | 'entry' | 'fetch' {
  return cfg.trendInterval === '1h' ? 'trend' : cfg.entryInterval === '1h' ? 'entry' : 'fetch';
}

export async function runScan(input: ScanInput): Promise<ScanResult> {
  const { mode, contracts, now } = input;
  const cfg = CONFIG[mode];
  const kl = async (symbol: string, interval: string, limit: number) => await input.klines(symbol, interval, limit);
  const tradable = new Set(contracts.map((c) => c.symbol));
  const ranks = liquidityRanks(input.tickers.filter((t) => tradable.has(t.symbol)));

  // I3: chuỗi nến cũ / thiếu nến / sai thứ tự → không dùng. BTC hỏng thì cả lần quét dừng (chế độ thị trường, cầu dao, RS dựa vào BTC).
  const fresh = (c: Candle[], interval: string, who: string): Candle[] => {
    const problems = candleProblems(c, interval, now);
    if (problems.length > 0) throw new Error(`${who}: ${problems.join('; ')}`);
    return c;
  };
  const btcDaily = fresh(await kl('BTCUSDT', '1d', 400), '1d', 'BTC');
  // Cầu dao xét lại mọi nến 1H trong thời gian dừng (tối đa 12h) + 20 nến khởi động → 100 nến là đủ
  const btcHourly = fresh(await kl('BTCUSDT', '1h', 100), '1h', 'BTC');
  const btcTrend = mode === 'swing' ? btcDaily : fresh(await kl('BTCUSDT', cfg.trendInterval, cfg.trendLimit), cfg.trendInterval, 'BTC');
  const regime = marketRegime(btcDaily);
  // Mô hình đảo chiều Short: cấm 30 ngày sau khi BTC lấy lại SMA200 ngày (P-G2 và kế hoạch lệnh mô hình)
  const btcReclaim = btcSma200ReclaimedAt(btcDaily);
  const FB = COMMON.patterns.fetchBars;
  const breaker = circuitBreaker(btcHourly, cfg.breakerPauseHours);

  let universe = [...contracts].sort((a, b) => (ranks.get(a.symbol) ?? 1) - (ranks.get(b.symbol) ?? 1));
  if (mode === 'fast') universe = universe.slice(0, COMMON.fastUniverseSize);
  if (mode === 'swing' && COMMON.entryRules.swingUniverseSize !== null) universe = universe.slice(0, COMMON.entryRules.swingUniverseSize); // #7 (hạng tại now)
  if (input.limit !== null) universe = universe.slice(0, input.limit);

  const src1h = hourlySource(cfg);
  const results: Analysis[] = [];
  const errors: Array<{ symbol: string; error: string }> = [];
  let banned = false;
  let inScope = 0;
  for (const c of universe) {
    try {
      const trend = fresh(await kl(c.symbol, cfg.trendInterval, cfg.trendLimit), cfg.trendInterval, 'Không chấm');
      const entry = fresh(await kl(c.symbol, cfg.entryInterval, cfg.entryLimit), cfg.entryInterval, 'Không chấm');
      // Lướt nhanh: 1D tải 300 nến (cùng trọng số API với 120) để dùng luôn cho bối cảnh mô hình 1D
      const daily = mode === 'swing' ? trend : fresh(await kl(c.symbol, '1d', FB.d1), '1d', 'Không chấm');
      const rank = ranks.get(c.symbol) ?? 1;
      const lastEntry = entry[entry.length - 1];
      if (!lastEntry) throw new Error('Không có nến khung vào lệnh');
      // P-G1: biết trước hợp đồng có thuộc phạm vi mô hình không, để chỉ tải thêm nến cho hợp đồng trong phạm vi
      const scope = inPatternScope(contractRisk({ daily, price: lastEntry.close, contract: c, liquidityRankPct: rank, now: new Date(now) }).tier, rank);
      let patternData: PatternData | null = null;
      let hourly: Candle[];
      if (scope.ok) {
        inScope++;
        if (mode === 'swing') {
          const c1h = fresh(await kl(c.symbol, '1h', FB.h1), '1h', 'Không chấm');
          patternData = { c4h: entry, c1d: trend, c1h, btcSma200ReclaimedAt: btcReclaim };
          hourly = c1h.slice(-30);
        } else {
          // Lướt nhanh mặc định (1H/15m): 1H = khung xu hướng; #2 (4H/1H): 4H = khung xu hướng, 1H = khung vào lệnh
          const c4h = cfg.trendInterval === '4h' ? trend : fresh(await kl(c.symbol, '4h', FB.h4), '4h', 'Không chấm');
          const c1h = src1h === 'trend' ? trend : src1h === 'entry' ? entry : fresh(await kl(c.symbol, '1h', FB.h1), '1h', 'Không chấm');
          patternData = { c4h, c1d: daily, c1h, btcSma200ReclaimedAt: btcReclaim };
          hourly = c1h.slice(-100);
        }
      } else {
        hourly = src1h === 'trend' ? trend.slice(-100) : src1h === 'entry' ? entry.slice(-100) : fresh(await kl(c.symbol, '1h', 30), '1h', 'Không chấm');
      }
      const book = input.books.get(c.symbol);
      const premium = input.premiums.get(c.symbol);
      if (!book || !premium) throw new Error('Thiếu bookTicker hoặc premiumIndex');
      const mid = (book.bid + book.ask) / 2;
      const intervalHours = input.fundingIntervals.get(c.symbol) ?? COMMON.defaultFundingIntervalHours;
      const run = (fundingMaxAbsRate: number | undefined) => analyze({
        mode, contract: c, trend, entry, daily, hourly, btcTrend,
        regime: regime.regime, breakerTripped: breaker.tripped, breakerNote: breaker.reason ?? undefined,
        liquidityRankPct: rank, spreadPct: ((book.ask - book.bid) / mid) * 100,
        premium, fundingIntervalHours: intervalHours,
        fundingIntervalDefault: !input.fundingIntervals.has(c.symbol), now: new Date(now), events: input.events, capital: input.capital, riskPct: COMMON.risk.perTradePct,
        patternData, openTrades: input.openTrades, prevSignal: input.prevSignals.get(c.symbol) ?? null,
        ...(fundingMaxAbsRate !== undefined ? { fundingMaxAbsRate } : {}),
        ...(input.leverageBrackets ? { leverageBrackets: input.leverageBrackets.get(c.symbol) ?? [] } : {}),
      });
      let a = run(input.fundingMaxAbs?.get(c.symbol));
      if (input.fundingMaxAbsLoader !== undefined && !input.fundingMaxAbs?.has(c.symbol) && a.label.startsWith('Đạt')) {
        let rate: number;
        let note: string | null = null;
        try {
          rate = await input.fundingMaxAbsLoader(c.symbol);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (BAN.test(msg)) throw e; // sàn chặn → dừng quét như mọi lệnh gọi khác
          rate = fundingFallbackRate(intervalHours);
          note = `đệm funding: không tải được lịch sử ${COMMON.risk.fundingBufferLookbackDays} ngày (${msg}) → dùng mức thận trọng ${(rate * 100).toFixed(3).replace('.', ',')}%/kỳ`;
        }
        a = run(rate);
        if (note !== null) a.flags.push(note);
      }
      results.push(a);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ symbol: c.symbol, error: message });
      if (BAN.test(message)) {
        banned = true; // DỪNG quét, không gọi tiếp; người gọi in thông báo và ghi kết quả đã có
        break;
      }
    }
  }

  const ranked = applyTopRank(results, ranks);
  const entryBlocksMap = entryBlocks(ranked, { mode, regime: regime.regime, ...(input.fundingMean ? { fundingMean: input.fundingMean } : {}) });
  return { regime, breaker, btcReclaim, ranks, universeSize: universe.length, inScope, results: ranked, entryBlocks: entryBlocksMap, errors, banned };
}
