// Tải TOÀN BỘ lịch sử chỉ số Sợ hãi & Tham lam (Fear & Greed Index) của Alternative.me cho luật FGI-hướng khi kiểm lịch sử.
// Nguồn: Alternative.me (https://alternative.me/crypto/fear-and-greed-index/) — điều kiện dùng: GHI NGUỒN "Alternative.me".
//   node backtest/fetch-fgi.ts [--dir data/cache]
// Lưu NGUYÊN VĂN bản thô API vào <dir>/fgi.json ({ fetchedAt, url, raw }) — data/ không commit. Kiểm phân tích được trước khi ghi.
// Chỉ tải dữ liệu; luật dùng theo thời điểm (giá trị ngày d chỉ dùng từ 00:00 UTC ngày d + 1 — packages/core/fgi.ts).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { parseFgi } from '../packages/core/fgi.ts';
import { FGI_URL_ALL, httpJson } from '../scanner/fgi.ts';
import { FGI_FILE } from './data.ts';

async function main() {
  const { values: v } = parseArgs({ options: { dir: { type: 'string', default: 'data/cache' } } });
  const raw = await httpJson(FGI_URL_ALL);
  const rows = parseFgi(raw);
  if (rows.length === 0) throw new Error('FGI: nguồn trả 0 dòng');
  mkdirSync(v.dir!, { recursive: true });
  const path = join(v.dir!, FGI_FILE);
  writeFileSync(path, JSON.stringify({ fetchedAt: new Date().toISOString(), url: FGI_URL_ALL, source: 'Alternative.me', raw }));
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  let gaps = 0;
  for (let i = 1; i < rows.length; i++) if (rows[i]!.day - rows[i - 1]!.day !== 86_400_000) gaps++;
  console.log(`Đã lưu ${path}: ${rows.length} ngày ${day(rows[0]!.day)} → ${day(rows[rows.length - 1]!.day)}, ${gaps} khoảng trống (nguồn: Alternative.me)`);
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    console.error(`LỖI: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
