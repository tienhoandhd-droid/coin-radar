import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKlines, parseContracts, parsePremium, parseFundingInfo, parseLeverageBrackets } from './parse.ts';

// Hàng kline Binance Futures: 12 cột (định dạng đã kiểm 19/10/2026: cột 10 = taker buy quote)
// Bộ lọc thật của BTCUSDT (GET công khai /fapi/v1/exchangeInfo, 19/10/2026) — MIN_NOTIONAL dùng khóa "notional"
const FULL_FILTERS = [
  { maxPrice: '4529764', tickSize: '0.10', filterType: 'PRICE_FILTER', minPrice: '556.80' },
  { stepSize: '0.001', minQty: '0.001', maxQty: '1000', filterType: 'LOT_SIZE' },
  { minQty: '0.001', maxQty: '120', filterType: 'MARKET_LOT_SIZE', stepSize: '0.001' },
  { filterType: 'MAX_NUM_ORDERS', limit: 200 },
  { notional: '50', filterType: 'MIN_NOTIONAL' },
  { multiplierDown: '0.9500', multiplierUp: '1.0500', multiplierDecimal: '4', filterType: 'PERCENT_PRICE' },
];
const PERP_2100 = 4133404800000; // deliveryDate của hợp đồng vĩnh cửu bình thường (2100-12-25)
const BTC_FIELDS = { tickSize: 0.1, stepSize: 0.001, minQty: 0.001, maxQty: 1000, marketMinQty: 0.001, marketMaxQty: 120, marketStepSize: 0.001,
  minNotional: 50, maxNumOrders: 200, deliveryDate: PERP_2100 };

const row = (openTime: number, closeTime: number) => [openTime, '100', '110', '90', '105', '10', closeTime, '1000', 50, '6', '600', '0'];

test('parseKlines: đổi số, lấy taker buy quote ở cột 10, bỏ nến chưa đóng', () => {
  const out = parseKlines([row(0, 999), row(1000, 1999)], 1500);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { openTime: 0, closeTime: 999, open: 100, high: 110, low: 90, close: 105, volume: 10, quoteVolume: 1000, takerBuyQuote: 600 });
});

test('parseKlines: dữ liệu sai định dạng → ném lỗi rõ', () => {
  assert.throws(() => parseKlines({ code: -1121 }, 0), /klines/);
});

test('parseContracts: chỉ PERPETUAL/USDT/TRADING, lấy tick và step size', () => {
  const raw = { symbols: [
    { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', contractType: 'PERPETUAL', status: 'TRADING', underlyingType: 'COIN', onboardDate: 1569398400000,
      deliveryDate: PERP_2100, filters: FULL_FILTERS },
    { symbol: 'BTCUSDT_261225', baseAsset: 'BTC', quoteAsset: 'USDT', contractType: 'CURRENT_QUARTER', status: 'TRADING', onboardDate: 0, filters: [] },
    { symbol: 'ETHBTC', baseAsset: 'ETH', quoteAsset: 'BTC', contractType: 'PERPETUAL', status: 'TRADING', onboardDate: 0, filters: [] },
  ] };
  assert.deepEqual(parseContracts(raw), [{ symbol: 'BTCUSDT', baseAsset: 'BTC', onboardDate: 1569398400000, ...BTC_FIELDS }]);
});

// I2 (đánh giá độc lập): đọc đủ bộ lọc sàn, thiếu là ném lỗi (fail-closed)
for (const missing of ['MIN_NOTIONAL', 'MARKET_LOT_SIZE', 'MAX_NUM_ORDERS']) {
  test(`I2 parseContracts: thiếu ${missing} → ném lỗi nêu tên mã và bộ lọc`, () => {
    const raw = { symbols: [{ symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', contractType: 'PERPETUAL', status: 'TRADING', underlyingType: 'COIN',
      onboardDate: 0, deliveryDate: PERP_2100, filters: FULL_FILTERS.filter((f) => f.filterType !== missing) }] };
    assert.throws(() => parseContracts(raw), new RegExp(`BTCUSDT.*${missing}`));
  });
}

test('I2 parseContracts: LOT_SIZE thiếu minQty/maxQty, MIN_NOTIONAL rỗng, thiếu deliveryDate → ném lỗi', () => {
  const mk = (filters: unknown[], extra: object = { deliveryDate: PERP_2100 }) => ({ symbols: [{ symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT',
    contractType: 'PERPETUAL', status: 'TRADING', underlyingType: 'COIN', onboardDate: 0, ...extra, filters }] });
  const swap = (type: string, f: object) => FULL_FILTERS.map((x) => (x.filterType === type ? f : x));
  assert.throws(() => parseContracts(mk(swap('LOT_SIZE', { filterType: 'LOT_SIZE', stepSize: '0.001', maxQty: '1000' }))), /BTCUSDT.*LOT_SIZE\.minQty/);
  assert.throws(() => parseContracts(mk(swap('LOT_SIZE', { filterType: 'LOT_SIZE', stepSize: '0.001', minQty: '0.001' }))), /BTCUSDT.*LOT_SIZE\.maxQty/);
  assert.throws(() => parseContracts(mk(swap('MIN_NOTIONAL', { filterType: 'MIN_NOTIONAL', notional: '' }))), /BTCUSDT.*MIN_NOTIONAL\.notional/);
  assert.throws(() => parseContracts(mk(FULL_FILTERS, {})), /BTCUSDT.*deliveryDate/);
});

test('parsePremium: funding và mark price', () => {
  const out = parsePremium([{ symbol: 'BTCUSDT', markPrice: '82000.5', lastFundingRate: '0.00010000', nextFundingTime: 1760889600000 }]);
  assert.deepEqual(out, [{ symbol: 'BTCUSDT', markPrice: 82000.5, lastFundingRate: 0.0001, nextFundingTime: 1760889600000 }]);
});

test('parseKlines: hàng thiếu cột (6 cột) → ném lỗi nêu số cột', () => {
  assert.throws(() => parseKlines([[0, '1', '2', '3', '4', '5']], 0), /klines.*cột/);
});

test('parseKlines: trường số là null → ném lỗi, không thành NaN/0', () => {
  const bad = row(0, 999);
  bad[1] = null as unknown as string;
  assert.throws(() => parseKlines([bad], 1500), /giá trị số không hợp lệ/);
});

test('parseContracts: thiếu LOT_SIZE → ném lỗi nêu tên mã', () => {
  const raw = { symbols: [
    { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', contractType: 'PERPETUAL', status: 'TRADING', underlyingType: 'COIN', onboardDate: 0,
      filters: [{ filterType: 'PRICE_FILTER', tickSize: '0.10' }] },
  ] };
  assert.throws(() => parseContracts(raw), /BTCUSDT/);
});

test('parseContracts: tickSize = 0 → ném lỗi nêu tên mã', () => {
  const raw = { symbols: [
    { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', contractType: 'PERPETUAL', status: 'TRADING', underlyingType: 'COIN', onboardDate: 0,
      deliveryDate: PERP_2100, filters: FULL_FILTERS.map((f) => (f.filterType === 'PRICE_FILTER' ? { ...f, tickSize: '0' } : f)) },
  ] };
  assert.throws(() => parseContracts(raw), /ETHUSDT/);
});

test('parseContracts: payload null hoặc thiếu symbols → lỗi thân thiện', () => {
  assert.throws(() => parseContracts(null), /exchangeInfo.*kỳ vọng mảng/);
  assert.throws(() => parseContracts({}), /exchangeInfo.*kỳ vọng mảng/);
});

test('parsePremium: markPrice null → ném lỗi, không thành 0', () => {
  assert.throws(
    () => parsePremium([{ symbol: 'BTCUSDT', markPrice: null, lastFundingRate: '0', nextFundingTime: 1 }]),
    /giá trị số không hợp lệ/,
  );
});

test('parseFundingInfo: symbol → số giờ mỗi kỳ funding', () => {
  const m = parseFundingInfo([
    { symbol: 'BTCUSDT', adjustedFundingRateCap: '0.02', fundingIntervalHours: 8 },
    { symbol: 'ZKCUSDT', fundingIntervalHours: '4' },
  ]);
  assert.equal(m.get('BTCUSDT'), 8);
  assert.equal(m.get('ZKCUSDT'), 4);
  assert.equal(m.get('XYZUSDT'), undefined);
});

test('parseFundingInfo: thiếu/<=0/không phải số/không phải mảng → ném lỗi nêu tên mã', () => {
  assert.throws(() => parseFundingInfo([{ symbol: 'AAAUSDT' }]), /AAAUSDT/);
  assert.throws(() => parseFundingInfo([{ symbol: 'AAAUSDT', fundingIntervalHours: 0 }]), /AAAUSDT/);
  assert.throws(() => parseFundingInfo([{ symbol: 'AAAUSDT', fundingIntervalHours: 'x' }]), /AAAUSDT/);
  assert.throws(() => parseFundingInfo([{ fundingIntervalHours: 8 }]), /symbol/);
  assert.throws(() => parseFundingInfo({ code: -1 }), /fundingInfo/);
});

const perp = (symbol: string, underlyingType?: string) => ({
  symbol, baseAsset: symbol.replace('USDT', ''), quoteAsset: 'USDT', contractType: 'PERPETUAL', status: 'TRADING', onboardDate: 0, deliveryDate: PERP_2100,
  ...(underlyingType === undefined ? {} : { underlyingType }),
  filters: FULL_FILTERS,
});

test('parseContracts: loại hợp đồng chỉ số (INDEX), giữ COIN', () => {
  const out = parseContracts({ symbols: [perp('BTCUSDT', 'COIN'), perp('BTCDOMUSDT', 'INDEX')] });
  assert.deepEqual(out.map((c) => c.symbol), ['BTCUSDT']);
});

test('parseContracts: thiếu underlyingType → ném lỗi nêu tên mã', () => {
  assert.throws(() => parseContracts({ symbols: [perp('ETHUSDT')] }), /ETHUSDT.*underlyingType/);
});

test('I7 parseLeverageBrackets: đúng dạng tài liệu (symbol, brackets[]: bracket, initialLeverage, notionalCap, notionalFloor, maintMarginRatio, cum); thiếu trường → ném lỗi', () => {
  const raw = [{ symbol: 'BTCUSDT', notionalCoef: 1.5, brackets: [
    { bracket: 1, initialLeverage: 150, notionalCap: 300000, notionalFloor: 0, maintMarginRatio: 0.004, cum: 0 },
    { bracket: 2, initialLeverage: 100, notionalCap: 800000, notionalFloor: 300000, maintMarginRatio: 0.005, cum: 300 },
  ] }];
  const m = parseLeverageBrackets(raw);
  assert.deepEqual(m.get('BTCUSDT')![1], { bracket: 2, initialLeverage: 100, notionalCap: 800000, notionalFloor: 300000, maintMarginRatio: 0.005, cum: 300 });
  assert.throws(() => parseLeverageBrackets([{ symbol: 'BTCUSDT', brackets: [{ bracket: 1, initialLeverage: 150, notionalCap: 1, notionalFloor: 0, cum: 0 }] }]), /BTCUSDT.*maintMarginRatio/);
  assert.throws(() => parseLeverageBrackets([{ symbol: 'BTCUSDT', brackets: [] }]), /BTCUSDT.*rỗng/);
  assert.throws(() => parseLeverageBrackets({ code: -2015 }), /leverageBracket/);
});

test('parseFundingHistory: /fapi/v1/fundingRate → { fundingTime, fundingRate }; trường hỏng → ném lỗi nêu mã', async () => {
  const { parseFundingHistory } = await import('./parse.ts');
  assert.deepEqual(parseFundingHistory([{ symbol: 'AAAUSDT', fundingTime: 1000, fundingRate: '-0.00030000', markPrice: '1.2' }]),
    [{ fundingTime: 1000, fundingRate: -0.0003 }]);
  assert.throws(() => parseFundingHistory([{ symbol: 'AAAUSDT', fundingTime: 1000, fundingRate: '' }]), /fundingRate AAAUSDT/);
  assert.throws(() => parseFundingHistory({ code: -1121 }), /kỳ vọng mảng/);
});
