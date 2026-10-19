import type { BookTicker, Candle, Contract, MarketTicker, PremiumIndex } from '../core/types.ts';

function arr(raw: unknown, what: string): unknown[] {
  if (!Array.isArray(raw)) throw new Error(`Binance ${what}: kỳ vọng mảng, nhận ${JSON.stringify(raw).slice(0, 120)}`);
  return raw;
}
const num = (v: unknown) => Number(v);

export function parseKlines(raw: unknown, now: number): Candle[] {
  return arr(raw, 'klines')
    .map((r) => {
      const x = r as unknown[];
      return {
        openTime: num(x[0]), closeTime: num(x[6]), open: num(x[1]), high: num(x[2]), low: num(x[3]), close: num(x[4]),
        volume: num(x[5]), quoteVolume: num(x[7]), takerBuyQuote: num(x[10]),
      };
    })
    .filter((k) => k.closeTime < now);
}

type RawSymbol = {
  symbol: string; baseAsset: string; quoteAsset: string; contractType: string; status: string; onboardDate: number;
  filters: Array<{ filterType: string; tickSize?: string; stepSize?: string }>;
};

export function parseContracts(raw: unknown): Contract[] {
  const symbols = (raw as { symbols?: RawSymbol[] }).symbols;
  return arr(symbols, 'exchangeInfo.symbols')
    .map((s) => s as RawSymbol)
    .filter((s) => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING')
    .map((s) => ({
      symbol: s.symbol,
      baseAsset: s.baseAsset,
      onboardDate: num(s.onboardDate),
      tickSize: num(s.filters.find((f) => f.filterType === 'PRICE_FILTER')?.tickSize),
      stepSize: num(s.filters.find((f) => f.filterType === 'LOT_SIZE')?.stepSize),
    }));
}

export function parseTickers(raw: unknown): MarketTicker[] {
  return arr(raw, 'ticker/24hr').map((t) => {
    const x = t as Record<string, unknown>;
    return { symbol: String(x.symbol), quoteVolume24h: num(x.quoteVolume), priceChangePct24h: num(x.priceChangePercent) };
  });
}

export function parseBookTickers(raw: unknown): BookTicker[] {
  return arr(raw, 'ticker/bookTicker').map((t) => {
    const x = t as Record<string, unknown>;
    return { symbol: String(x.symbol), bid: num(x.bidPrice), ask: num(x.askPrice) };
  });
}

export function parsePremium(raw: unknown): PremiumIndex[] {
  return arr(raw, 'premiumIndex').map((t) => {
    const x = t as Record<string, unknown>;
    return { symbol: String(x.symbol), markPrice: num(x.markPrice), lastFundingRate: num(x.lastFundingRate), nextFundingTime: num(x.nextFundingTime) };
  });
}
