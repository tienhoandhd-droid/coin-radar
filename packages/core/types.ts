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
// Chế độ bot: hai chế độ quét (Mode) + hệ giữ BTC theo chế độ 'btc-regime' (packages/core/btc-regime.ts — không quét, không có CONFIG riêng)
export type BotMode = Mode | 'btc-regime';
export type Side = 'long' | 'short';

export type Contract = {
  symbol: string;
  baseAsset: string;
  onboardDate: number;
  tickSize: number; // PRICE_FILTER.tickSize
  stepSize: number; // LOT_SIZE.stepSize (lệnh limit; MARKET_LOT_SIZE.stepSize ở marketStepSize)
  // Bộ lọc sàn (I2, đánh giá độc lập) — đọc từ exchangeInfo, thiếu là ném lỗi
  minQty: number; // LOT_SIZE.minQty
  maxQty: number; // LOT_SIZE.maxQty (lệnh limit)
  marketMinQty: number; // MARKET_LOT_SIZE.minQty
  marketMaxQty: number; // MARKET_LOT_SIZE.maxQty (lệnh market — vượt là lỗi -4005)
  marketStepSize: number; // MARKET_LOT_SIZE.stepSize
  minNotional: number; // MIN_NOTIONAL.notional (USDT) — lệnh reduce-only được miễn
  maxNumOrders: number; // MAX_NUM_ORDERS.limit — số lệnh mở tối đa mỗi mã (gồm cả lệnh algo)
  deliveryDate: number; // ms; hợp đồng vĩnh cửu bình thường = 2100-12-25 (quan sát exchangeInfo 19/10/2026)
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
