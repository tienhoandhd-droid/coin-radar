// Gọi thử từng nguồn dữ liệu và in mã HTTP. Không dùng key, không in nội dung phản hồi.
const SOURCES: ReadonlyArray<{ name: string; url: string }> = [
  { name: 'Binance Futures exchangeInfo', url: 'https://fapi.binance.com/fapi/v1/exchangeInfo' },
  { name: 'Binance Futures klines', url: 'https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=4h&limit=2' },
  { name: 'Binance Futures premiumIndex', url: 'https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT' },
  { name: 'Binance Futures data (OI hist)', url: 'https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=4h&limit=2' },
  { name: 'Binance spot', url: 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=4h&limit=2' },
  { name: 'Binance spot mirror', url: 'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=4h&limit=2' },
  { name: 'OKX swap candles', url: 'https://www.okx.com/api/v5/market/candles?instId=BTC-USDT-SWAP&bar=4H&limit=2' },
  { name: 'Bybit linear kline', url: 'https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=240&limit=2' },
  { name: 'Coinbase ticker', url: 'https://api.exchange.coinbase.com/products/BTC-USD/ticker' },
  { name: 'Kraken ticker', url: 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD' },
  { name: 'CoinGecko global', url: 'https://api.coingecko.com/api/v3/global' },
  { name: 'Fear & Greed', url: 'https://api.alternative.me/fng/?limit=1' },
  { name: 'DefiLlama stablecoins', url: 'https://stablecoins.llama.fi/stablecoins?includePrices=true' },
];

type ProbeResult = { name: string; status: number | string; ms: number };

async function probe(name: string, url: string): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    await res.arrayBuffer();
    return { name, status: res.status, ms: Date.now() - started };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { name, status: `LỖI: ${reason}`, ms: Date.now() - started };
  }
}

const results: ProbeResult[] = [];
for (const s of SOURCES) results.push(await probe(s.name, s.url));

console.log(`Thời điểm: ${new Date().toISOString()}`);
console.log('| Nguồn | Mã HTTP | ms |');
console.log('|---|---|---|');
for (const r of results) console.log(`| ${r.name} | ${r.status} | ${r.ms} |`);
