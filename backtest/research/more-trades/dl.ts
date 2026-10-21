// Tải dữ liệu công khai (không ký) từ fapi.binance.com cho nghiên cứu "tăng số lệnh". Không in giá.
//   node dl.ts gap1d            — nến 1D [2026-01-01, 2026-05-01) cho mọi mã lịch sử còn sống quanh kỳ đó → data/history/more-trades/1d-gap
//   node dl.ts 4h SYM1 SYM2 …    — nến 4H 2019-10-01 → 2026-09-18 → data/history/more-trades/4h
//   node dl.ts funding SYM1 …    — fundingRate 2019-10-01 → 2026-09-18 → data/history/more-trades/funding
// endTime luôn = 2026-09-19 − 1 ms; sau khi tải assert không bản ghi nào ≥ 2026-09-19.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { OUT, BAN, GAP0, GAP1, HIST1D, DAY, assertBefore, allHistSymbols } from './common.ts';

const BASE = 'https://fapi.binance.com';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function get(url: string): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(url);
    const used = Number(r.headers.get('x-mbx-used-weight-1m') ?? 0);
    if (r.ok) {
      if (used > 1500) { console.error(`trọng số đã dùng ${used}/2400 mỗi phút — nghỉ 60 s`); await sleep(60_000); }
      return r.json();
    }
    const body = await r.text();
    // 429 = quá hạn mức, 418 = bị chặn IP tạm thời: chờ đúng retry-after rồi thử lại
    if ((r.status === 429 || r.status === 418 || r.status >= 500) && attempt < 6) {
      const wait = Math.max(30, Number(r.headers.get('retry-after') ?? 30)) * 1000;
      console.error(`HTTP ${r.status} (lần ${attempt}) — chờ ${wait / 1000} s: ${url}`); await sleep(wait); continue;
    }
    throw new Error(`${url} → HTTP ${r.status} ${body}`);
  }
}
const toRow = (k: unknown[]) => [+k[0]!, +k[1]!, +k[2]!, +k[3]!, +k[4]!, +k[5]!, +k[7]!];

async function klines(sym: string, interval: string, from: number, to: number, pauseMs: number, limit = 1500): Promise<number[][]> {
  const out: number[][] = [];
  for (let t = from; t <= to;) {
    const rows = await get(`${BASE}/fapi/v1/klines?symbol=${encodeURIComponent(sym)}&interval=${interval}&startTime=${t}&endTime=${to}&limit=${limit}`) as unknown[][];
    await sleep(pauseMs);
    for (const k of rows) out.push(toRow(k));
    if (rows.length < limit) break; // trang cuối — không gọi thêm trang rỗng
    t = +rows[rows.length - 1]![0]! + 1;
  }
  for (const r of out) assertBefore(r[0]!, `${interval} ${sym}`);
  return out;
}

const mode = process.argv[2];
const END = BAN - 1;
if (mode === 'gap1d') {
  mkdirSync(`${OUT}/1d-gap`, { recursive: true });
  let ok = 0, skipped = 0, empty = 0;
  for (const s of allHistSymbols()) {
    const rows = JSON.parse(readFileSync(`${HIST1D}/${s}.json`, 'utf8')).rows as number[][];
    const first = rows[0]?.[0] ?? Infinity, last = rows[rows.length - 1]?.[0] ?? -Infinity;
    // còn sống tới cuối 2025, hoặc lịch sử bắt đầu từ 2026-05-01 (có thể đã niêm yết trong kỳ thiếu)
    if (!(last >= GAP0 - DAY || first >= GAP1)) { skipped++; continue; }
    if (existsSync(`${OUT}/1d-gap/${s}.json`)) { ok++; continue; }
    let k: number[][];
    try { k = await klines(s, '1d', GAP0, GAP1 - 1, 150, 500); }
    catch (e) { console.error(`${s}: không tải được (${(e as Error).message.slice(0, 160)}) — bỏ`); continue; }
    if (k.length === 0) { empty++; continue; }
    for (const r of k) if (r[0]! < GAP0 || r[0]! >= GAP1) throw new Error(`ASSERT: ${s} nến ngoài kỳ lấp`);
    writeFileSync(`${OUT}/1d-gap/${s}.json`, JSON.stringify({ symbol: s, cols: ['t', 'o', 'h', 'l', 'c', 'v', 'qv'], rows: k }));
    ok++;
  }
  console.log(`1D lấp kỳ thiếu: ${ok} mã có dữ liệu, ${empty} mã rỗng, ${skipped} mã bỏ qua (đã hủy trước 2026)`);
} else if (mode === '4h') {
  mkdirSync(`${OUT}/4h`, { recursive: true });
  for (const s of process.argv.slice(3)) {
    if (existsSync(`${OUT}/4h/${s}.json`)) continue;
    const k = await klines(s, '4h', Date.UTC(2019, 9, 1), END, 350);
    writeFileSync(`${OUT}/4h/${s}.json`, JSON.stringify({ symbol: s, cols: ['t', 'o', 'h', 'l', 'c', 'v', 'qv'], rows: k }));
    console.log(`4H ${s}: ${k.length} nến`);
  }
} else if (mode === 'funding') {
  mkdirSync(`${OUT}/funding`, { recursive: true });
  for (const s of process.argv.slice(3)) {
    if (existsSync(`${OUT}/funding/${s}.json`)) continue;
    const f: { t: number; r: number }[] = [];
    for (let t = Date.UTC(2019, 9, 1); t < END;) {
      // fundingRate: hạn mức riêng 500 yêu cầu / 5 phút / IP → nghỉ 700 ms
      const rows = await get(`${BASE}/fapi/v1/fundingRate?symbol=${s}&startTime=${t}&endTime=${END}&limit=1000`) as { fundingTime: number; fundingRate: string }[];
      await sleep(700);
      if (rows.length === 0) break;
      for (const x of rows) f.push({ t: x.fundingTime, r: +x.fundingRate });
      t = rows[rows.length - 1]!.fundingTime + 1;
    }
    for (const x of f) assertBefore(x.t, `funding ${s}`);
    writeFileSync(`${OUT}/funding/${s}.json`, JSON.stringify(f));
    console.log(`funding ${s}: ${f.length} kỳ`);
  }
} else throw new Error('dùng: node dl.ts gap1d | 4h SYM… | funding SYM…');
