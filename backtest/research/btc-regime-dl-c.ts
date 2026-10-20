// Tải dữ liệu kỳ C cho hệ BTC: nến 1D BTCUSDT [2025-09-01, 2026-05-01) và funding cùng khoảng. KHÔNG in giá trị.
import { writeFileSync } from 'node:fs';
const OUT = '/tmp/claude-1000/-home-admin1/9a91f9f2-51e2-4583-8952-2aee756c391e/scratchpad/btc-regime/c-data';
const S = Date.UTC(2025, 8, 1), E = Date.UTC(2026, 4, 1) - 1;
async function get(url: string) { const r = await fetch(url); if (!r.ok) throw new Error(`${url} → HTTP ${r.status} ${await r.text()}`); return r.json(); }
const k = await get(`https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1d&startTime=${S}&endTime=${E}&limit=1500`) as unknown[][];
writeFileSync(`${OUT}/BTCUSDT.json`, JSON.stringify({ symbol: 'BTCUSDT', cols: ['t', 'o', 'h', 'l', 'c', 'v', 'qv'], rows: k.map((r) => [+r[0]!, +r[1]!, +r[2]!, +r[3]!, +r[4]!, +r[5]!, +r[7]!]) }));
const f: { t: number; r: number }[] = [];
for (let t = S; t < E;) {
  const rows = await get(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&startTime=${t}&endTime=${E}&limit=1000`) as { fundingTime: number; fundingRate: string }[];
  if (rows.length === 0) break;
  for (const x of rows) f.push({ t: x.fundingTime, r: +x.fundingRate });
  t = rows[rows.length - 1]!.fundingTime + 1;
}
writeFileSync(`${OUT}/funding/BTCUSDT.json`, JSON.stringify(f));
console.log(`nến ${k.length}, funding ${f.length}`);
