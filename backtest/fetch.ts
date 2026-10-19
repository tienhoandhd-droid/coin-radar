// CLI tải dữ liệu lịch sử cho phát lại.  node backtest/fetch.ts [--symbols N] [--intervals 1d,4h,1h,15m,5m] [--fast N]
//   --symbols N     chỉ N mã thanh khoản nhất (kèm BTCUSDT); bỏ trống = toàn bộ hợp đồng COIN
//   --intervals     danh sách khung (mặc định 1d,4h,1h,15m,5m); 15m/5m chỉ cho --fast mã đầu
//   --fast N        phạm vi Lướt nhanh (mặc định 150)
//   --end ISO       mốc kết thúc (mặc định 2026-10-19T00:00:00Z — cố định, để kết quả tái lập)
//   --no-funding / --no-oi / --refresh-universe / --dir PATH
import { parseArgs } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '../packages/binance/client.ts';
import { parseContracts, parseTickers } from '../packages/binance/parse.ts';
import { createFetcher, fetchAll, planRange, INTERVAL_MS, type Interval } from './data.ts';

const { values: v } = parseArgs({
  options: {
    symbols: { type: 'string' }, intervals: { type: 'string', default: '1d,4h,1h,15m,5m' }, fast: { type: 'string', default: '150' },
    end: { type: 'string', default: '2026-10-19T00:00:00Z' }, dir: { type: 'string', default: 'data/cache' },
    'no-funding': { type: 'boolean' }, 'no-oi': { type: 'boolean' }, 'refresh-universe': { type: 'boolean' },
  },
});

function posInt(raw: string, name: string): number {
  if (!/^\d+$/.test(raw) || Number(raw) < 1) throw new Error(`--${name} phải là số nguyên dương, nhận "${raw}"`);
  return Number(raw);
}
const intervals = v.intervals!.split(',').map((x) => x.trim()) as Interval[];
for (const iv of intervals) if (!(iv in INTERVAL_MS)) throw new Error(`khung không hợp lệ: "${iv}"`);
const end = Date.parse(v.end!);
if (!Number.isFinite(end)) throw new Error(`--end không hợp lệ: "${v.end}"`);
const limitSymbols = v.symbols === undefined ? null : posInt(v.symbols, 'symbols');
const fastN = posInt(v.fast!, 'fast');
const dir = v.dir!;

const started = Date.now();
const client = createClient({ fetch: (url) => fetch(url), weightCeiling: 1800 });
const fetcher = createFetcher({ client, dir, log: (m) => console.log('  ! ' + m) });

// Danh sách hợp đồng + xếp hạng thanh khoản: giữ trong universe.json để chạy lại giữa chừng không đổi phạm vi.
type Universe = { fetchedAt: string; ranking: string[]; contracts: unknown[] };
const uPath = join(dir, 'universe.json');
let universe: Universe;
if (existsSync(uPath) && !v['refresh-universe']) {
  universe = JSON.parse(readFileSync(uPath, 'utf8')) as Universe;
  console.log(`Dùng universe.json (${universe.fetchedAt}, ${universe.ranking.length} mã)`);
} else {
  const contracts = parseContracts(await fetcher.call('/fapi/v1/exchangeInfo', 1));
  const tickers = new Map(parseTickers(await fetcher.call('/fapi/v1/ticker/24hr', 40)).map((t) => [t.symbol, t.quoteVolume24h]));
  const ranking = contracts.map((c) => c.symbol).sort((a, b) => (tickers.get(b) ?? 0) - (tickers.get(a) ?? 0));
  universe = { fetchedAt: new Date().toISOString(), ranking, contracts };
  fetcher.write(uPath, universe);
  console.log(`exchangeInfo: ${contracts.length} hợp đồng USDT perpetual COIN đang giao dịch (thiên lệch sống sót: chỉ mã còn hôm nay)`);
}

let symbols = limitSymbols === null ? [...universe.ranking] : universe.ranking.slice(0, limitSymbols);
if (!symbols.includes('BTCUSDT') && universe.ranking.includes('BTCUSDT')) symbols = ['BTCUSDT', ...symbols];
const fastSymbols = universe.ranking.slice(0, Math.min(fastN, symbols.length));
if (!fastSymbols.includes('BTCUSDT') && symbols.includes('BTCUSDT')) fastSymbols.push('BTCUSDT');

const plan = planRange(end);
console.log(`Phạm vi: ${symbols.length} mã (15m/5m cho ${fastSymbols.length}), khung ${intervals.join(',')}`);
console.log(`end=${new Date(plan.end).toISOString()} eval từ ${new Date(plan.evalStart).toISOString()} ngoài mẫu từ ${new Date(plan.oosStart).toISOString()}`);

let exitCode = 0;
try {
  const r = await fetchAll({
    fetcher, plan, symbols, fastSymbols, intervals, withFunding: !v['no-funding'], withOi: !v['no-oi'],
    onProgress: (done, total, symbol) => {
      const s = fetcher.stats;
      const min = ((Date.now() - started) / 60000).toFixed(1);
      console.log(`[${done}/${total}] ${symbol} | lệnh ${s.requests} | weight ${s.weight} (header ${client.usedWeight()}/phút) | ${(s.bytesWritten / 1e6).toFixed(1)} MB | ${min} phút`);
    },
  });
  for (const f of r.failures) console.log(`LỖI ${f.symbol} ${f.what}: ${f.error}`);
  if (r.failures.length > 0) exitCode = 1;
} catch (e) {
  console.log(`DỪNG: ${(e as Error).message}`);
  exitCode = 2;
}
const s = fetcher.stats;
console.log('--- Tổng kết ---');
console.log(`lệnh gọi ${s.requests}; weight khai báo ${s.weight}; ghi ${s.filesWritten} tệp / ${(s.bytesWritten / 1e6).toFixed(2)} MB; bỏ qua ${s.filesSkipped} tệp đã đủ`);
console.log(`khoảng trống sàn: ${s.gaps.length}; thời gian ${((Date.now() - started) / 60000).toFixed(2)} phút`);
process.exit(exitCode);
