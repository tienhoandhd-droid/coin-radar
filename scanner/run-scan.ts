import { analyze, contractRisk, type Analysis, type PatternData } from '../packages/core/analyze.ts';
import { marketRegime, circuitBreaker, btcSma200ReclaimedAt, type Regime } from '../packages/core/regime.ts';
import { inPatternScope } from '../packages/core/gates.ts';
import { candleProblems } from '../packages/core/candles.ts';
import { CONFIG, COMMON } from '../packages/core/config.ts';
import type { MacroEvent } from '../packages/core/events.ts';
import type { BookTicker, Candle, Contract, MarketTicker, Mode, PremiumIndex } from '../packages/core/types.ts';
import { liquidityRanks, applyTopRank } from './rank.ts';
import type { OpenTrade } from '../packages/core/portfolio.ts';
import type { SignalState } from '../packages/core/signal.ts';

// Một lần quét, tách khỏi I/O (rà soát cuối 1c, B4): máy quét (scan.ts) và phát lại/backtest (kế hoạch 2) gọi CÙNG hàm này.
// Mọi dữ liệu thị trường đến từ tham số; nến lấy qua `klines(symbol, interval, limit)` — chỉ được trả nến ĐÃ ĐÓNG tại `now`
// (isClosed), tối đa `limit` nến gần nhất. Máy quét: tải từ Binance; phát lại: cắt từ kho dữ liệu lịch sử tại mốc t.
// Nến BTC (1D 400, 1H 100, khung xu hướng Lướt nhanh) cũng lấy qua `klines`.
// Thay thế theo thời điểm mà phát lại phải tự cung cấp: tickers (quoteVolume 24h → hạng thanh khoản), books (spread — không có
// lịch sử, cần quy ước thay thế cho G-02/G-03), premiums (giá mark tại t — "giá hiện tại" của kế hoạch, I3 — + funding gần nhất + giờ funding kế tiếp),
// fundingIntervals. Chuỗi nến cũ hơn 1 khung so với `now`, thiếu nến hoặc sai thứ tự → mã bị ghi lỗi, không chấm (BTC hỏng → ném lỗi).
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
  prevSignals: ReadonlyMap<string, SignalState>; // I5: tín hiệu đang mở theo mã ở lần quét trước (hysteresis, độ mới) — máy quét: Map rỗng
};

export type ScanResult = {
  regime: { regime: Regime; reasons: string[] };
  breaker: { tripped: boolean; reason: string | null };
  btcReclaim: number | null;
  ranks: Map<string, number>;
  universeSize: number;
  inScope: number; // số hợp đồng thuộc phạm vi mô hình P-G1
  results: Analysis[]; // đã áp applyTopRank
  errors: Array<{ symbol: string; error: string }>;
  banned: boolean; // Binance chặn (418/429) → đã dừng giữa chừng
};

const BAN = /HTTP (418|429)|đang chặn tạm thời/;

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
  if (input.limit !== null) universe = universe.slice(0, input.limit);

  const results: Analysis[] = [];
  const errors: Array<{ symbol: string; error: string }> = [];
  let banned = false;
  let inScope = 0;
  for (const c of universe) {
    try {
      const trend = fresh(await kl(c.symbol, cfg.trendInterval, cfg.trendLimit), cfg.trendInterval, 'Không chấm');
      const entry = fresh(await kl(c.symbol, cfg.entryInterval, cfg.entryLimit), cfg.entryInterval, 'Không chấm');
      // Lướt nhanh: 1D tải 300 nến (cùng trọng số API với 120) để dùng luôn cho bối cảnh mô hình 1D
      const daily = mode === 'swing' ? trend : await kl(c.symbol, '1d', FB.d1);
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
          const c1h = await kl(c.symbol, '1h', FB.h1);
          patternData = { c4h: entry, c1d: trend, c1h, btcSma200ReclaimedAt: btcReclaim };
          hourly = c1h.slice(-30);
        } else {
          const c4h = await kl(c.symbol, '4h', FB.h4);
          patternData = { c4h, c1d: daily, c1h: trend, btcSma200ReclaimedAt: btcReclaim };
          hourly = trend.slice(-100);
        }
      } else {
        hourly = mode === 'fast' ? trend.slice(-100) : await kl(c.symbol, '1h', 30);
      }
      const book = input.books.get(c.symbol);
      const premium = input.premiums.get(c.symbol);
      if (!book || !premium) throw new Error('Thiếu bookTicker hoặc premiumIndex');
      const mid = (book.bid + book.ask) / 2;
      results.push(analyze({
        mode, contract: c, trend, entry, daily, hourly, btcTrend,
        regime: regime.regime, breakerTripped: breaker.tripped, breakerNote: breaker.reason ?? undefined,
        liquidityRankPct: rank, spreadPct: ((book.ask - book.bid) / mid) * 100,
        premium, fundingIntervalHours: input.fundingIntervals.get(c.symbol) ?? COMMON.defaultFundingIntervalHours,
        fundingIntervalDefault: !input.fundingIntervals.has(c.symbol), now: new Date(now), events: input.events, capital: input.capital, riskPct: COMMON.risk.perTradePct,
        patternData, openTrades: input.openTrades, prevSignal: input.prevSignals.get(c.symbol) ?? null,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ symbol: c.symbol, error: message });
      if (BAN.test(message)) {
        banned = true; // DỪNG quét, không gọi tiếp; người gọi in thông báo và ghi kết quả đã có
        break;
      }
    }
  }

  return { regime, breaker, btcReclaim, ranks, universeSize: universe.length, inScope, results: applyTopRank(results, ranks), errors, banned };
}
