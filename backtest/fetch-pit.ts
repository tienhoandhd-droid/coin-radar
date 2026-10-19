// Tải thêm 15m cho mọi mã từng lọt top-N thanh khoản THEO THỜI ĐIỂM (cùng cách xếp hạng với phát lại) trong kỳ D và kỳ mù B.
//   node backtest/fetch-pit.ts [--dir data/cache]
// Lý do: lần tải đầu (backtest/fetch.ts) chỉ lấy 15m cho top 150 HÔM NAY; phát lại Lướt nhanh xếp hạng tại từng thời điểm nên
// nhiều mã khác lọt top 150 trong kỳ mà thiếu 15m. 5m KHÔNG tải cho nhóm này (bộ mô phỏng sẽ tải 1m theo nhu cầu khi nến mơ hồ).
import { parseArgs } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '../packages/binance/client.ts';
import { COMMON } from '../packages/core/config.ts';
import { liquidityRanks } from '../scanner/rank.ts';
import type { Candle, Contract } from '../packages/core/types.ts';
import { createFetcher, fetchAll, loadCandles, needFrom, planRange, type Plan } from './data.ts';
import { BLIND_PERIOD, DATA_END, DEV_PERIOD, decisionTimes, loadContracts, tickersAt, type Window } from './replay.ts';

// Tập mã từng nằm trong top `size` thanh khoản tại một mốc nào đó của cửa sổ. Duyệt ĐÚNG các mốc quyết định Lướt nhanh (mỗi 15m,
// decisionTimes của replay): cửa sổ 24h của tickersAt gồm 24 nến 1H tại :00 nhưng 23 nến tại :15/:30/:45 → hạng khác nhau giữa các mốc.
// Dùng ĐÚNG tickersAt (replay) + liquidityRanks (máy quét); onboardDate ≤ t như replay (vũ trụ).
export function pitFastUniverse(
  contracts: readonly Pick<Contract, 'symbol' | 'onboardDate'>[],
  hourly: ReadonlyMap<string, readonly Candle[]>,
  w: Window,
  size: number,
): Set<string> {
  const out = new Set<string>();
  for (const t of decisionTimes('fast', w)) {
    const list = contracts.filter((c) => c.onboardDate <= t && hourly.has(c.symbol)).map((c) => ({ symbol: c.symbol, hourly: hourly.get(c.symbol)! }));
    const ranks = liquidityRanks(tickersAt(list, t));
    // liquidityRanks trả phân vị 0..1 (không phải thứ tự) → sắp tăng dần rồi lấy `size` mã đầu, y như runScan (universe.slice(0, fastUniverseSize))
    for (const [symbol] of [...ranks].sort((a, b) => a[1] - b[1]).slice(0, size)) out.add(symbol);
  }
  return out;
}

async function main() {
  const { values: v } = parseArgs({ options: { dir: { type: 'string', default: 'data/cache' } } });
  const dir = v.dir!;
  const contracts = await loadContracts(dir);
  const plan: Plan = planRange(DATA_END);
  const hourly = new Map<string, Candle[]>();
  for (const c of contracts) {
    try { hourly.set(c.symbol, loadCandles(dir, c.symbol, '1h', needFrom('1h', plan.oosStart), DATA_END).candles); }
    catch (e) { console.log(`  ! bỏ qua ${c.symbol}: không nạp được 1h (${(e as Error).message})`); }
  }
  const size = COMMON.fastUniverseSize;
  const inD = pitFastUniverse(contracts, hourly, DEV_PERIOD, size);
  const inB = pitFastUniverse(contracts, hourly, BLIND_PERIOD, size);
  const union = new Set([...inD, ...inB]);
  // Có 15m = nạp được cả khoảng cần (loadCandles kiểm tệp phủ đủ), không chỉ thư mục tồn tại; mã dở dang (chạy bị ngắt) sẽ được tải lại
  const from15 = needFrom('15m', plan.oosStart);
  const has15m = (s: string): boolean => {
    try { loadCandles(dir, s, '15m', from15, DATA_END); return true; } catch (e) { console.log(`  ! ${s} 15m chưa đủ, sẽ tải: ${(e as Error).message}`); return false; }
  };
  const extra = [...union].filter((s) => !has15m(s)).sort();
  const skipped1h = contracts.length - hourly.size;
  console.log(`Bỏ qua ${skipped1h}/${contracts.length} hợp đồng vì không nạp được 1h`);
  console.log(`Top-${size} theo thời điểm: D ${inD.size} mã, B ${inB.size} mã, hợp ${union.size}; đã có 15m ${union.size - extra.length}; cần tải thêm ${extra.length}`);

  const started = Date.now();
  const client = createClient({ fetch: (url) => fetch(url, { signal: AbortSignal.timeout(30_000) }), weightCeiling: 1800 });
  const fetcher = createFetcher({ client, dir, log: (m) => console.log('  ! ' + m) });
  let exitCode = 0;
  try {
    const r = await fetchAll({
      fetcher, plan, symbols: extra, fastSymbols: extra, intervals: ['15m'], withFunding: false, withOi: false,
      onProgress: (done, total, symbol) => {
        const s = fetcher.stats;
        if (done % 10 === 0 || done === total) console.log(`[${done}/${total}] ${symbol} | lệnh ${s.requests} | weight ${s.weight} | ${(s.bytesWritten / 1e6).toFixed(1)} MB | ${((Date.now() - started) / 60000).toFixed(1)} phút`);
      },
    });
    for (const f of r.failures) console.log(`LỖI ${f.symbol} ${f.what}: ${f.error}`);
    if (r.failures.length > 0) exitCode = 1;
  } catch (e) {
    console.log(`DỪNG: ${(e as Error).message}`);
    exitCode = 2;
  }
  const s = fetcher.stats;
  // Ghi chú vào manifest (ghi cả khi dừng giữa chừng để chạy lại biết đã làm tới đâu)
  const manifestPath = join(dir, 'manifest.json');
  const prev = existsSync(manifestPath) ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>) : {};
  fetcher.write(manifestPath, {
    ...prev,
    pointInTimeFast15m: {
      writtenAt: new Date().toISOString(),
      note: `15m cho mọi mã từng lọt top ${size} thanh khoản THEO THỜI ĐIỂM (xếp hạng từ nến 1H, cùng tickersAt/liquidityRanks với phát lại) trong kỳ D và B. KHÔNG có 5m cho nhóm này (bộ mô phỏng tải 1m theo nhu cầu). Khởi động 500 nến 15m trước ${new Date(plan.oosStart).toISOString()}.`,
      skippedMissing1h: skipped1h, symbolsInD: inD.size, symbolsInB: inB.size, union: union.size, fetchedExtra: extra, skipped5m: extra,
      from: new Date(needFrom('15m', plan.oosStart)).toISOString(), to: new Date(DATA_END).toISOString(),
    },
  });
  console.log('--- Tổng kết ---');
  console.log(`mã ${extra.length}; lệnh ${s.requests}; weight ${s.weight}; ${(s.bytesWritten / 1e6).toFixed(1)} MB; ${((Date.now() - started) / 60000).toFixed(1)} phút; khoảng trống sàn ${s.gaps.length}`);
  process.exit(exitCode);
}

if (import.meta.main) {
  main().catch((e: unknown) => { console.error(`LỖI: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
}
