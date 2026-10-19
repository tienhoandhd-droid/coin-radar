import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKlines, parseContracts, parsePremium } from './parse.ts';

// Hàng kline Binance Futures: 12 cột (định dạng đã kiểm 19/10/2026: cột 10 = taker buy quote)
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
    { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', contractType: 'PERPETUAL', status: 'TRADING', onboardDate: 1569398400000,
      filters: [{ filterType: 'PRICE_FILTER', tickSize: '0.10' }, { filterType: 'LOT_SIZE', stepSize: '0.001' }] },
    { symbol: 'BTCUSDT_261225', baseAsset: 'BTC', quoteAsset: 'USDT', contractType: 'CURRENT_QUARTER', status: 'TRADING', onboardDate: 0, filters: [] },
    { symbol: 'ETHBTC', baseAsset: 'ETH', quoteAsset: 'BTC', contractType: 'PERPETUAL', status: 'TRADING', onboardDate: 0, filters: [] },
  ] };
  assert.deepEqual(parseContracts(raw), [{ symbol: 'BTCUSDT', baseAsset: 'BTC', onboardDate: 1569398400000, tickSize: 0.1, stepSize: 0.001 }]);
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
    { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', contractType: 'PERPETUAL', status: 'TRADING', onboardDate: 0,
      filters: [{ filterType: 'PRICE_FILTER', tickSize: '0.10' }] },
  ] };
  assert.throws(() => parseContracts(raw), /BTCUSDT/);
});

test('parseContracts: tickSize = 0 → ném lỗi nêu tên mã', () => {
  const raw = { symbols: [
    { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', contractType: 'PERPETUAL', status: 'TRADING', onboardDate: 0,
      filters: [{ filterType: 'PRICE_FILTER', tickSize: '0' }, { filterType: 'LOT_SIZE', stepSize: '0.001' }] },
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
