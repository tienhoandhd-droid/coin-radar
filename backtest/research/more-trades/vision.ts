// Tải kho lưu trữ THÁNG của data.binance.vision (không tính trọng số API — thay cho tải hàng loạt từ fapi, tránh bị chặn IP 418).
//   node vision.ts gap1d                — nến 1D 2026-01..04 cho mã lịch sử còn sống quanh kỳ đó (chưa có tệp lấp) → 1d-gap/<SYM>.json
//   node vision.ts 4h SYM1 SYM2 …        — nến 4H 2019-10 → 2026-09 → 4h/<SYM>.json
//   node vision.ts funding SYM1 …        — fundingRate 2019-10 → 2026-09 → funding/<SYM>.json
// Mỗi tệp zip giải nén bằng `unzip` vào thư mục rỗng riêng data/history/more-trades/raw/<loại>/<SYM>/<tháng>/; zip bị xóa sau khi giải nén.
// Tháng 2026-09 chứa dữ liệu ≥ 2026-09-19 (CẤM): các dòng đó bị bỏ khi chuyển đổi và tệp CSV tháng 2026-09 bị xóa ngay sau đó.
// Chạy tối đa 4 tải song song. Tháng không có trên kho (404: chưa niêm yết / đã hủy) → bỏ qua.
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { OUT, BAN, GAP0, GAP1, HIST1D, DAY, assertBefore, allHistSymbols } from './common.ts';

const VB = 'https://data.binance.vision/data/futures/um/monthly';
const RAW = `${OUT}/raw`;
const CONC = 4;
const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
function months(from: number, to: number): string[] { // [from, to] theo ms, trả 'YYYY-MM'
  const out: string[] = [];
  const a = new Date(from), b = new Date(to);
  for (let y = a.getUTCFullYear(), m = a.getUTCMonth() + 1; y < b.getUTCFullYear() || (y === b.getUTCFullYear() && m <= b.getUTCMonth() + 1);) {
    out.push(ym(y, m)); m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

// Tải một zip tháng, giải nén vào thư mục rỗng; trả đường dẫn các CSV, hoặc null nếu 404
async function fetchMonth(kind: 'klines-4h' | 'klines-1d' | 'fundingRate', sym: string, month: string): Promise<string[] | null> {
  const dir = `${RAW}/${kind}/${sym}/${month}`;
  if (existsSync(dir)) { const f = readdirSync(dir).filter((x) => x.endsWith('.csv')); if (f.length) return f.map((x) => `${dir}/${x}`); }
  const url = kind === 'fundingRate' ? `${VB}/fundingRate/${sym}/${sym}-fundingRate-${month}.zip`
    : `${VB}/klines/${sym}/${kind.slice(7)}/${sym}-${kind.slice(7)}-${month}.zip`;
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(url);
    if (r.status === 404) { await r.arrayBuffer(); return null; }
    if (!r.ok) {
      if (attempt < 4) { console.error(`HTTP ${r.status} (lần ${attempt}) ${url} — chờ 20 s`); await new Promise((s) => setTimeout(s, 20_000)); continue; }
      throw new Error(`${url} → HTTP ${r.status}`);
    }
    mkdirSync(dir, { recursive: true });
    const zip = `${dir}/${month}.zip`;
    writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
    execFileSync('unzip', ['-o', '-q', zip, '-d', dir]);
    rmSync(zip);
    return readdirSync(dir).filter((x) => x.endsWith('.csv')).map((x) => `${dir}/${x}`);
  }
}
// CSV → dòng số; bỏ dòng tiêu đề (có thể có hoặc không)
const csvRows = (path: string) => readFileSync(path, 'utf8').split('\n').filter((l) => l && /^\d/.test(l)).map((l) => l.split(','));

async function pool<T>(items: T[], fn: (x: T) => Promise<void>) {
  let k = 0;
  await Promise.all(Array.from({ length: CONC }, async () => { while (k < items.length) { const x = items[k++]!; await fn(x); } }));
}

// khoảng tháng hợp lý của một mã, theo nến 1D lịch sử (mã còn sống cuối 2025 → tới 2026-09)
function symRange(sym: string, start: number): [number, number] {
  const p = `${HIST1D}/${sym}.json`;
  if (!existsSync(p)) return [start, BAN - 1];
  const rows = JSON.parse(readFileSync(p, 'utf8')).rows as number[][];
  const first = rows[0]![0]!, last = rows[rows.length - 1]![0]!;
  const a = first <= Date.UTC(2020, 0, 1) ? start : Math.max(start, first - 31 * DAY);
  const b = last >= GAP0 - DAY ? BAN - 1 : Math.min(BAN - 1, last + 31 * DAY);
  return [a, b];
}

async function klinesFor(sym: string, interval: '4h' | '1d', from: number, to: number): Promise<number[][]> {
  const rows: number[][] = [];
  for (const m of months(from, to)) {
    const files = await fetchMonth(interval === '4h' ? 'klines-4h' : 'klines-1d', sym, m);
    if (!files) continue;
    for (const f of files) {
      for (const c of csvRows(f)) { const t = +c[0]!; if (t >= BAN || t < from || t > to) continue; rows.push([t, +c[1]!, +c[2]!, +c[3]!, +c[4]!, +c[5]!, +c[7]!]); }
      if (m === '2026-09') rmSync(f); // tháng có phần cấm → xóa CSV thô sau khi lọc
    }
  }
  rows.sort((a, b) => a[0]! - b[0]!);
  for (const r of rows) assertBefore(r[0]!, `${interval} ${sym}`);
  return rows;
}

const mode = process.argv[2];
const syms = process.argv.slice(3);
if (mode === 'gap1d') {
  mkdirSync(`${OUT}/1d-gap`, { recursive: true });
  const todo = allHistSymbols().filter((s) => {
    if (existsSync(`${OUT}/1d-gap/${s}.json`)) return false;
    const rows = JSON.parse(readFileSync(`${HIST1D}/${s}.json`, 'utf8')).rows as number[][];
    const first = rows[0]?.[0] ?? Infinity, last = rows[rows.length - 1]?.[0] ?? -Infinity;
    return last >= GAP0 - DAY || first >= GAP1;
  });
  let ok = 0, empty = 0;
  await pool(todo, async (s) => {
    const k = await klinesFor(s, '1d', GAP0, GAP1 - 1);
    for (const r of k) if (r[0]! < GAP0 || r[0]! >= GAP1) throw new Error(`ASSERT: ${s} nến ngoài kỳ lấp`);
    if (!k.length) { empty++; return; }
    writeFileSync(`${OUT}/1d-gap/${s}.json`, JSON.stringify({ symbol: s, cols: ['t', 'o', 'h', 'l', 'c', 'v', 'qv'], rows: k })); ok++;
  });
  console.log(`1D lấp kỳ thiếu (vision): ${ok} mã mới có dữ liệu, ${empty} mã không có tháng nào trên kho (trong ${todo.length} mã cần)`);
} else if (mode === '4h') {
  mkdirSync(`${OUT}/4h`, { recursive: true });
  await pool(syms.filter((s) => !existsSync(`${OUT}/4h/${s}.json`)), async (s) => {
    const [a, b] = symRange(s, Date.UTC(2019, 9, 1));
    const k = await klinesFor(s, '4h', a, b);
    writeFileSync(`${OUT}/4h/${s}.json`, JSON.stringify({ symbol: s, cols: ['t', 'o', 'h', 'l', 'c', 'v', 'qv'], rows: k }));
    console.log(`4H ${s}: ${k.length} nến`);
  });
} else if (mode === 'funding') {
  mkdirSync(`${OUT}/funding`, { recursive: true });
  await pool(syms.filter((s) => !existsSync(`${OUT}/funding/${s}.json`)), async (s) => {
    const [a, b] = symRange(s, Date.UTC(2019, 9, 1));
    const f: { t: number; r: number }[] = [];
    for (const m of months(a, b)) {
      const files = await fetchMonth('fundingRate', s, m);
      if (!files) continue;
      for (const p of files) {
        for (const c of csvRows(p)) { const t = +c[0]!; if (t >= BAN) continue; f.push({ t, r: +c[2]! }); }
        if (m === '2026-09') rmSync(p);
      }
    }
    f.sort((x, y) => x.t - y.t);
    for (const x of f) assertBefore(x.t, `funding ${s}`);
    writeFileSync(`${OUT}/funding/${s}.json`, JSON.stringify(f));
    console.log(`funding ${s}: ${f.length} kỳ`);
  });
} else throw new Error('dùng: node vision.ts gap1d | 4h SYM… | funding SYM…');
