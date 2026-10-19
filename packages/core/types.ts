export type Candle = {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
  takerBuyQuote: number;
};

export type Mode = 'fast' | 'swing';
export type Side = 'long' | 'short';

export type Contract = {
  symbol: string;
  baseAsset: string;
  onboardDate: number;
  tickSize: number;
  stepSize: number;
};

export type MarketTicker = {
  symbol: string;
  quoteVolume24h: number;
  priceChangePct24h: number;
};

export type BookTicker = { symbol: string; bid: number; ask: number };

export type PremiumIndex = {
  symbol: string;
  markPrice: number;
  lastFundingRate: number;
  nextFundingTime: number;
};
