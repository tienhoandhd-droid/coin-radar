import type { BookTicker, Candle, Contract, MarketTicker, PremiumIndex } from '../core/types.ts';

// JSON.stringify(undefined) trả về undefined, nên phải có nhánh dự phòng
const show = (v: unknown): string => JSON.stringify(v) ?? String(v);

function arr(raw: unknown, what: string): unknown[] {
  if (!Array.isArray(raw)) throw new Error(`Binance ${what}: kỳ vọng mảng, nhận ${show(raw).slice(0, 120)}`);
  return raw;
}

// Số bắt buộc: null/undefined/"" hoặc không phải số hữu hạn → ném lỗi, không để NaN hay 0 lọt vào
function num(v: unknown, what: string): number {
  const isText = typeof v === 'string' && v.trim() !== '';
  if (typeof v !== 'number' && !isText) throw new Error(`Binance ${what}: giá trị số không hợp lệ (${show(v)})`);
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Binance ${what}: giá trị số không hợp lệ (${show(v)})`);
  return n;
}

export function parseKlines(raw: unknown, now: number): Candle[] {
  return arr(raw, 'klines')
    .map((r, i) => {
      if (!Array.isArray(r) || r.length < 11) {
        throw new Error(`Binance klines: hàng ${i} có ${Array.isArray(r) ? r.length : 'không phải mảng'} cột, cần ≥ 11`);
      }
      const x = r as unknown[];
      const w = `klines hàng ${i}`;
      return {
        openTime: num(x[0], `${w} openTime`), closeTime: num(x[6], `${w} closeTime`),
        open: num(x[1], `${w} open`), high: num(x[2], `${w} high`), low: num(x[3], `${w} low`), close: num(x[4], `${w} close`),
        volume: num(x[5], `${w} volume`), quoteVolume: num(x[7], `${w} quoteVolume`), takerBuyQuote: num(x[10], `${w} takerBuyQuote`),
      };
    })
    .filter((k) => k.closeTime < now);
}

type RawSymbol = {
  symbol: string; baseAsset: string; quoteAsset: string; contractType: string; status: string; onboardDate: number;
  filters: Array<{ filterType: string; tickSize?: string; stepSize?: string }>;
};

// Đọc tickSize/stepSize của một bộ lọc; thiếu, không phải số, hoặc ≤ 0 đều ném lỗi nêu tên mã
function filterNumber(s: RawSymbol, filterType: string, key: 'tickSize' | 'stepSize'): number {
  const filters = Array.isArray(s.filters) ? s.filters : [];
  const v = filters.find((f) => f.filterType === filterType)?.[key];
  const n = num(v, `exchangeInfo ${s.symbol} ${filterType}.${key}`);
  if (n <= 0) throw new Error(`Binance exchangeInfo ${s.symbol}: ${filterType}.${key} phải > 0, nhận ${show(v)}`);
  return n;
}

export function parseContracts(raw: unknown): Contract[] {
  const symbols = (raw as { symbols?: unknown } | null | undefined)?.symbols;
  return (arr(symbols, 'exchangeInfo.symbols') as RawSymbol[])
    .filter((s) => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING')
    .map((s) => ({
      symbol: s.symbol,
      baseAsset: s.baseAsset,
      onboardDate: num(s.onboardDate, `exchangeInfo ${s.symbol} onboardDate`),
      tickSize: filterNumber(s, 'PRICE_FILTER', 'tickSize'),
      stepSize: filterNumber(s, 'LOT_SIZE', 'stepSize'),
    }));
}

export function parseTickers(raw: unknown): MarketTicker[] {
  return arr(raw, 'ticker/24hr').map((t) => {
    const x = t as Record<string, unknown>;
    const w = `ticker/24hr ${String(x.symbol)}`;
    return { symbol: String(x.symbol), quoteVolume24h: num(x.quoteVolume, `${w} quoteVolume`), priceChangePct24h: num(x.priceChangePercent, `${w} priceChangePercent`) };
  });
}

export function parseBookTickers(raw: unknown): BookTicker[] {
  return arr(raw, 'ticker/bookTicker').map((t) => {
    const x = t as Record<string, unknown>;
    const w = `ticker/bookTicker ${String(x.symbol)}`;
    return { symbol: String(x.symbol), bid: num(x.bidPrice, `${w} bidPrice`), ask: num(x.askPrice, `${w} askPrice`) };
  });
}

export function parsePremium(raw: unknown): PremiumIndex[] {
  return arr(raw, 'premiumIndex').map((t) => {
    const x = t as Record<string, unknown>;
    const w = `premiumIndex ${String(x.symbol)}`;
    return {
      symbol: String(x.symbol),
      markPrice: num(x.markPrice, `${w} markPrice`),
      lastFundingRate: num(x.lastFundingRate, `${w} lastFundingRate`),
      nextFundingTime: num(x.nextFundingTime, `${w} nextFundingTime`),
    };
  });
}

// /fapi/v1/fundingInfo: chu kỳ funding (giờ) của từng hợp đồng. Hợp đồng KHÔNG có trong danh sách
// dùng chu kỳ mặc định 8h (theo tài liệu Binance) — việc đó do nơi gọi xử lý, hàm này chỉ đọc đúng dữ liệu.
export function parseFundingInfo(raw: unknown): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of arr(raw, 'fundingInfo')) {
    const x = t as Record<string, unknown>;
    if (typeof x?.symbol !== 'string' || x.symbol === '') throw new Error(`Binance fundingInfo: thiếu symbol (${show(t).slice(0, 120)})`);
    const w = `fundingInfo ${x.symbol}`;
    const hours = num(x.fundingIntervalHours, `${w} fundingIntervalHours`);
    if (hours <= 0) throw new Error(`Binance ${w}: fundingIntervalHours phải > 0, nhận ${show(x.fundingIntervalHours)}`);
    out.set(x.symbol, hours);
  }
  return out;
}
