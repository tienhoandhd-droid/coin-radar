// Phân tích N3 theo kế hoạch docs/superpowers/plans/2026-10-21-phan-tich-n3.md.
//   node backtest/research/more-trades/n3.ts a   — CHỈ kỳ A (2020-03-01→2023-12-31): lệnh thắng/thua, DD 2022, 5 lệnh lãi nhất (in markdown)
//   node backtest/research/more-trades/n3.ts ab  — chạy MỘT lần: N3 gốc, từng luật, cả 3 luật trên kỳ A và kỳ B; ghi báo cáo
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { DAY, OUT } from './common.ts';
import { D, ds, runOne, metrics, pct, num, n3Features, type M } from './lab.ts';
import type { Result, Trade } from './sim.ts';

export const A = { from: D('2020-03-01'), toDay: D('2023-12-31') };
export const B = { from: D('2024-01-01'), toDay: D('2026-09-18') };
const mode = process.argv[2] ?? '';

const FEATS: { k: string; lab: string; fmt: (x: number) => string }[] = [
  { k: 'btcVsSma50d', lab: 'BTC so với SMA50 ngày', fmt: (x) => pct(x, 1) },
  { k: 'coinVsSma50d', lab: 'Coin so với SMA50 ngày', fmt: (x) => pct(x, 1) },
  { k: 'dist4hAtr', lab: 'Giá cách SMA50 4H (số ATR)', fmt: (x) => num(x, 2) },
  { k: 'atrPct', lab: 'ATR 4H / giá', fmt: (x) => pct(x, 2) },
  { k: 'rank', lab: 'Hạng thanh khoản (1 = lớn nhất)', fmt: (x) => num(x, 0) },
  { k: 'nOpen', lab: 'Số lệnh đang mở lúc vào', fmt: (x) => num(x, 0) },
  { k: 'corrBtc', lab: 'Tương quan 30 ngày với BTC', fmt: (x) => num(x, 2) },
  { k: 'fund3d', lab: 'Funding TB 3 ngày (quy 8 giờ)', fmt: (x) => pct(x, 3) },
  { k: 'ret7', lab: 'Lợi suất 7 ngày trước', fmt: (x) => pct(x, 1) },
  { k: 'ret30', lab: 'Lợi suất 30 ngày trước', fmt: (x) => pct(x, 1) },
  { k: 'hour', lab: 'Giờ UTC lúc vào', fmt: (x) => num(x, 0) },
];
const pe = (t: Trade) => t.pnl / t.eq0;
const R = (t: Trade) => t.pnl / t.riskAmt;
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const median = (a: number[]) => { if (!a.length) return NaN; const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m]! : (b[m - 1]! + b[m]!) / 2; };
const fv = (t: Trade, k: string) => t.f![k]!;

function groupRow(lab: string, g: Trade[], start: number) {
  const w = g.filter((t) => t.pnl > 0).length;
  return `| ${lab} | ${g.length} | ${pct(w / g.length, 0)} | ${num(mean(g.map(R)), 2)} | ${pct(mean(g.map(pe)), 2)} | ${pct(g.reduce((s, t) => s + t.pnl, 0) / start, 0)} |`;
}
const GH = '| Nhóm | Số lệnh | Thắng | R TB | %vốn TB/lệnh | Tổng lãi (% vốn đầu kỳ 10 000) |\n|---|---|---|---|---|---|';

// ngũ phân vị (quintile) theo giá trị bối cảnh; NaN để riêng
function quintiles(tr: Trade[], k: string, fmt: (x: number) => string, start: number): string {
  const ok = tr.filter((t) => Number.isFinite(fv(t, k))).sort((a, b) => fv(a, k) - fv(b, k));
  const nan = tr.filter((t) => !Number.isFinite(fv(t, k)));
  let s = GH + '\n';
  for (let q = 0; q < 5; q++) {
    const g = ok.slice(Math.floor((q * ok.length) / 5), Math.floor(((q + 1) * ok.length) / 5));
    if (g.length) s += groupRow(`Q${q + 1}: ${fmt(fv(g[0]!, k))} → ${fmt(fv(g[g.length - 1]!, k))}`, g, start) + '\n';
  }
  if (nan.length) s += groupRow('thiếu số liệu', nan, start) + '\n';
  return s;
}

function analyzeA() {
  const r = runOne('N3 kỳ A', '4h', true, A, { features: n3Features });
  const m = metrics(r, A.from, A.toDay);
  const tr = r.trades.filter((t) => t.e >= A.from && t.e < A.toDay + DAY);
  const start = 10000;
  const win = tr.filter((t) => t.pnl > 0), los = tr.filter((t) => t.pnl <= 0);
  let o = `## Kỳ A tổng quát\n\nN3 chạy riêng 2020-03-01→2023-12-31 (vốn 10 000): ${m.n} lệnh, thắng ${pct(m.win, 0)}, tổng ${pct(m.tot)}, CAGR ${pct(m.cagr)}, DD ${pct(m.dd)}, MAR ${num(m.mar)}, PF ${num(m.pf)}, TB/lệnh ${pct(m.mean, 2)} [${pct(m.lo, 2)}; ${pct(m.hi, 2)}].\n`;
  o += `\n### Thắng vs thua — trung vị bối cảnh lúc vào và diễn biến\n\n| Trường | Thắng (${win.length}) | Thua (${los.length}) |\n|---|---|---|\n`;
  for (const f of FEATS) o += `| ${f.lab} | ${f.fmt(median(win.map((t) => fv(t, f.k)).filter(Number.isFinite)))} | ${f.fmt(median(los.map((t) => fv(t, f.k)).filter(Number.isFinite)))} |\n`;
  const ex: [string, (t: Trade) => number, (x: number) => string][] = [
    ['%vốn mỗi lệnh', pe, (x) => pct(x, 2)], ['R', R, (x) => num(x, 2)], ['Giữ (giờ)', (t) => (t.x - t.e) / 3_600_000, (x) => num(x, 0)],
    ['MFE (lãi tạm lớn nhất, % giá)', (t) => t.hi / t.entryPx - 1, (x) => pct(x, 1)], ['MAE (lỗ tạm lớn nhất, % giá)', (t) => t.lo / t.entryPx - 1, (x) => pct(x, 1)],
    ['Funding (% vốn lúc vào, + = trả)', (t) => t.fund / t.eq0, (x) => pct(x, 3)],
  ];
  for (const [lab, fn, fmt] of ex) o += `| ${lab} | ${fmt(median(win.map(fn)))} | ${fmt(median(los.map(fn)))} |\n`;
  // lý do thoát
  o += `\n### Theo lý do thoát\n\n${GH}\n`;
  for (const rs of [...new Set(tr.map((t) => t.reason))]) o += groupRow(rs, tr.filter((t) => t.reason === rs), start) + '\n';
  // lệnh lỗ từng lãi tạm
  const losG = los.filter((t) => t.hi / t.entryPx - 1 >= 0.05);
  o += `\nLệnh thua từng lãi tạm ≥ 5% giá: ${losG.length}/${los.length} (${pct(losG.length / los.length, 0)}); MFE trung vị lệnh thua ${pct(median(los.map((t) => t.hi / t.entryPx - 1)), 1)}.\n`;
  // ngũ phân vị
  o += `\n### Ngũ phân vị (quintile) theo bối cảnh lúc vào\n`;
  for (const f of FEATS) o += `\n**${f.lab}**\n\n${quintiles(tr, f.k, f.fmt, start)}`;
  // chế độ BTC
  o += `\n### Chế độ BTC (giá đóng ngày so với SMA50 ngày) và năm\n\n${GH}\n`;
  o += groupRow('BTC trên SMA50 ngày', tr.filter((t) => fv(t, 'btcVsSma50d') > 0), start) + '\n';
  o += groupRow('BTC dưới/bằng SMA50 ngày', tr.filter((t) => !(fv(t, 'btcVsSma50d') > 0)), start) + '\n';
  o += groupRow('Coin trên SMA50 ngày', tr.filter((t) => fv(t, 'coinVsSma50d') > 0), start) + '\n';
  o += groupRow('Coin dưới/bằng SMA50 ngày', tr.filter((t) => !(fv(t, 'coinVsSma50d') > 0)), start) + '\n';
  for (let y = 2020; y <= 2023; y++) {
    const g = tr.filter((t) => new Date(t.e).getUTCFullYear() === y);
    o += groupRow(`${y}`, g, start) + '\n';
    o += groupRow(`${y}, BTC trên SMA50`, g.filter((t) => fv(t, 'btcVsSma50d') > 0), start) + '\n';
    o += groupRow(`${y}, BTC dưới SMA50`, g.filter((t) => !(fv(t, 'btcVsSma50d') > 0)), start) + '\n';
  }
  o += drawdown(r, tr);
  // 5 lệnh lãi nhất
  const top = [...tr].sort((a, b) => b.pnl - a.pnl).slice(0, 5);
  const net = tr.reduce((s, t) => s + t.pnl, 0);
  o += `\n### 5 lệnh lãi lớn nhất (tổng ${pct(top.reduce((s, t) => s + t.pnl, 0) / net, 0)} lãi ròng kỳ A)\n\n| Mã | Vào → ra | Lý do | %vốn | R | Giữ (ngày) | MFE | Funding (%vốn) | BTC vs SMA50 | Coin vs SMA50 | Cách SMA 4H (ATR) | ATR% | Lệnh mở | ret30 | fund3d |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const t of top) o += `| ${t.sym} | ${new Date(t.e).toISOString().slice(0, 13)} → ${new Date(t.x).toISOString().slice(0, 13)} | ${t.reason} | ${pct(pe(t), 1)} | ${num(R(t), 1)} | ${num((t.x - t.e) / DAY, 1)} | ${pct(t.hi / t.entryPx - 1, 0)} | ${pct(t.fund / t.eq0, 2)} | ${pct(fv(t, 'btcVsSma50d'), 1)} | ${pct(fv(t, 'coinVsSma50d'), 1)} | ${num(fv(t, 'dist4hAtr'), 2)} | ${pct(fv(t, 'atrPct'), 2)} | ${fv(t, 'nOpen')} | ${pct(fv(t, 'ret30'), 0)} | ${pct(fv(t, 'fund3d'), 3)} |\n`;
  const mfeQ = [...tr].sort((a, b) => b.hi / b.entryPx - a.hi / a.entryPx);
  o += `\nR lớn nhất ${num(Math.max(...tr.map(R)), 1)}; số lệnh R ≥ 5: ${tr.filter((t) => R(t) >= 5).length}; R ≥ 10: ${tr.filter((t) => R(t) >= 10).length}. MFE ≥ 100%: ${mfeQ.filter((t) => t.hi / t.entryPx - 1 >= 1).length} lệnh.\n`;
  console.log(o);
}

// DD lớn nhất của kỳ A: đỉnh → đáy trên vốn cuối ngày, lệnh nào, chế độ nào, có dồn cục không
function drawdown(r: Result, tr: Trade[]): string {
  const lo = r.days.indexOf(A.from / DAY), hi = r.days.indexOf(A.toDay / DAY);
  let pk = 10000, pkD = r.days[lo]!, best = 0, bPk = 0, bTr = 0;
  for (let i = lo; i <= hi; i++) {
    if (r.eq[i]! > pk) { pk = r.eq[i]!; pkD = r.days[i]!; }
    const dd = 1 - r.eq[i]! / pk; if (dd > best) { best = dd; bPk = pkD; bTr = r.days[i]!; }
  }
  const t0 = bPk * DAY, t1 = (bTr + 1) * DAY;
  const inDD = tr.filter((t) => t.x >= t0 && t.x < t1); // lệnh đóng trong đoạn sụt
  const eqPk = r.eq[r.days.indexOf(bPk)]!;
  let o = `\n### DD lớn nhất kỳ A: ${pct(best)} từ ${ds(t0)} tới ${ds(bTr * DAY)} (${bTr - bPk} ngày)\n\n`;
  o += `Lệnh ĐÓNG trong đoạn sụt: ${inDD.length}, thắng ${pct(inDD.filter((t) => t.pnl > 0).length / inDD.length, 0)}, tổng ${pct(inDD.reduce((s, t) => s + t.pnl, 0) / eqPk, 1)} vốn đỉnh; R TB ${num(mean(inDD.map(R)), 2)}; trong đó vào khi BTC dưới SMA50 ngày: ${inDD.filter((t) => !(fv(t, 'btcVsSma50d') > 0)).length}, funding ${pct(inDD.reduce((s, t) => s + t.fund, 0) / eqPk, 2)} vốn đỉnh (+ = trả).\n`;
  // theo tháng
  const byM = new Map<string, Trade[]>(); for (const t of inDD) { const k = new Date(t.x).toISOString().slice(0, 7); byM.set(k, [...(byM.get(k) ?? []), t]); }
  o += `\n| Tháng đóng lệnh | Số lệnh | Thắng | Tổng (% vốn đỉnh) | Lệnh SL | Vào khi BTC < SMA50 |\n|---|---|---|---|---|---|\n`;
  for (const [k, g] of [...byM].sort()) o += `| ${k} | ${g.length} | ${pct(g.filter((t) => t.pnl > 0).length / g.length, 0)} | ${pct(g.reduce((s, t) => s + t.pnl, 0) / eqPk, 1)} | ${g.filter((t) => t.reason === 'SL').length} | ${g.filter((t) => !(fv(t, 'btcVsSma50d') > 0)).length} |\n`;
  // dồn cục: nhiều lệnh cùng ra lỗ trong một nến 4H / một ngày
  const lossByBar = new Map<number, Trade[]>(); for (const t of inDD.filter((t) => t.pnl < 0)) lossByBar.set(t.x, [...(lossByBar.get(t.x) ?? []), t]);
  const bars = [...lossByBar].sort((a, b) => b[1].length - a[1].length);
  const lossByDay = new Map<number, Trade[]>(); for (const t of inDD.filter((t) => t.pnl < 0)) { const d = Math.floor(t.x / DAY); lossByDay.set(d, [...(lossByDay.get(d) ?? []), t]); }
  const days = [...lossByDay].sort((a, b) => a[1].reduce((s, t) => s + t.pnl, 0) - b[1].reduce((s, t) => s + t.pnl, 0));
  o += `\nDồn cục: số lệnh lỗ đóng CÙNG một nến 4H — nhiều nhất ${bars[0]?.[1].length ?? 0}; số nến có ≥ 3 lệnh lỗ cùng lúc: ${bars.filter((b) => b[1].length >= 3).length}; lệnh lỗ nằm trong các nến đó: ${bars.filter((b) => b[1].length >= 3).reduce((s, b) => s + b[1].length, 0)}/${inDD.filter((t) => t.pnl < 0).length}.\n`;
  o += `\n5 ngày lỗ nặng nhất trong đoạn sụt:\n\n| Ngày | Lệnh lỗ đóng | Tổng (% vốn đỉnh) | Mã |\n|---|---|---|---|\n`;
  for (const [d, g] of days.slice(0, 5)) o += `| ${ds(d * DAY)} | ${g.length} | ${pct(g.reduce((s, t) => s + t.pnl, 0) / eqPk, 2)} | ${g.map((t) => t.sym.replace('USDT', '')).join(' ')} |\n`;
  o += `\nTương quan với BTC của lệnh lỗ trong đoạn sụt: trung vị ${num(median(inDD.filter((t) => t.pnl < 0).map((t) => fv(t, 'corrBtc')).filter(Number.isFinite)), 2)}; số lệnh mở lúc vào trung vị ${num(median(inDD.map((t) => fv(t, 'nOpen'))), 0)}.\n`;
  return o;
}

// ---------- luật đã KHÓA trong kế hoạch (mục "Luật chọn từ kỳ A") — không chỉnh ----------
const L1 = (f: Record<string, number>) => f.btcVsSma50d! > 0; // BTC đóng ngày > SMA50 ngày
const L2 = (f: Record<string, number>) => f.dist4hAtr! >= 0.1; // giá đóng 4H cách SMA50 4H ≥ 0,1 ATR20
const VARIANTS: { key: string; allow?: (f: Record<string, number>) => boolean }[] = [
  { key: 'N3 gốc' }, { key: 'L1 (BTC > SMA50 ngày)', allow: L1 }, { key: 'L2 (cách SMA 4H ≥ 0,1 ATR)', allow: L2 }, { key: 'L1 + L2', allow: (f) => L1(f) && L2(f) },
];
const PUMP = 0.005; // bỏ funding NHẬN ở kỳ có |funding quy 8 giờ| > 0,5% (chỉ tham khảo)

function runAB() {
  const lock = `${OUT}/n3-B-ran.json`;
  if (existsSync(lock)) throw new Error(`Kỳ B đã chạy (${readFileSync(lock, 'utf8')}) — kế hoạch chỉ cho chạy MỘT lần. Muốn xem lại kết quả: đọc docs/verification/ket-qua-phan-tich-n3.md`);
  writeFileSync(lock, JSON.stringify({ ranAt: new Date().toISOString() }));
  const rows: { key: string; a: M; b: M; bx: M }[] = [];
  for (const v of VARIANTS) {
    const ex = v.allow ? { features: n3Features, allow: v.allow } : {};
    const ra = runOne(v.key, '4h', true, A, ex), rb = runOne(v.key, '4h', true, B, ex), rbx = runOne(v.key, '4h', true, B, { ...ex, dropFundAbove: PUMP });
    rows.push({ key: v.key, a: metrics(ra, A.from, A.toDay), b: metrics(rb, B.from, B.toDay), bx: metrics(rbx, B.from, B.toDay) });
  }
  const H = '| Phương án | Kỳ | Lệnh/ngày | Thắng | TB %/lệnh [CI95 khối ngày] | PF | Tổng lãi | CAGR | DD max | MAR | Lỗ thật lớn nhất/lệnh | Funding ròng (+ nhận, − trả; % vốn đầu kỳ) | Phần lãi từ 5 lệnh lớn nhất |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|';
  const row = (k: string, per: string, m: M) => `| ${k} | ${per} | ${num(m.perDay, 2)} | ${pct(m.win, 0)} | ${pct(m.mean, 2)} [${pct(m.lo, 2)}; ${pct(m.hi, 2)}] | ${num(m.pf)} | ${pct(m.tot)} | ${pct(m.cagr)} | ${pct(m.dd)} | ${num(m.mar)} | ${pct(m.worst, 2)} | ${pct(-m.fund, 1)} | ${Number.isFinite(m.top5) ? pct(m.top5, 0) : '— (tổng ≤ 0)'} |`;
  let o = `### Kỳ A (2020-03-01→2023-12-31) và kỳ B (2024-01-01→2026-09-18), mỗi kỳ một lần chạy riêng vốn 10 000\n\n${H}\n`;
  for (const r of rows) o += row(r.key, 'A', r.a) + '\n' + row(r.key, '**B**', r.b) + '\n';
  o += `\n### Kỳ B khi BỎ funding nhận ở kỳ |funding quy 8 giờ| > 0,5% (tham khảo, không thuộc tiêu chí)\n\n${H}\n`;
  for (const r of rows) o += row(r.key, 'B bỏ funding bơm', r.bx) + '\n';
  const base = rows[0]!.b;
  o += `\n### Tiêu chí (đặt trước, so với N3 gốc kỳ B: DD ${pct(base.dd)}, MAR ${num(base.mar)})\n\n| Phương án | DD giảm ≥ 25% tương đối (DD ≤ ${pct(base.dd * 0.75)}) | MAR ≥ ${num(base.mar)} | Lỗ thật mỗi lệnh ≤ 2,00% | KẾT LUẬN |\n|---|---|---|---|---|\n`;
  for (const r of rows.slice(1)) {
    const a = r.b.dd <= base.dd * 0.75, b = r.b.mar >= base.mar, c = Math.round(r.b.worst * 1e4) <= 200;
    o += `| ${r.key} | ${a ? 'đạt' : 'không'} (${pct(r.b.dd)}, giảm ${pct(1 - r.b.dd / base.dd, 0)}) | ${b ? 'đạt' : 'không'} (${num(r.b.mar)}) | ${c ? 'đạt' : 'không'} (${pct(r.b.worst, 2)}) | **${a && b && c ? 'NHẬN' : 'KHÔNG NHẬN'}** |\n`;
  }
  console.log(o);
}

if (mode === 'a') analyzeA();
else if (mode === 'ab') runAB();
else { console.error('dùng: n3.ts a | ab'); process.exit(1); }
