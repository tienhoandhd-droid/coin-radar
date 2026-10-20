// Mô phỏng hệ giữ BTC theo chế độ — luật ĐĂNG KÝ TRƯỚC trong docs/superpowers/plans/2026-10-20-he-btc-theo-che-do.md (không chỉnh).
import { readFileSync, writeFileSync } from 'node:fs';
const H = '/home/admin1/coin-radar/data/history';
const HERE = '/tmp/claude-1000/-home-admin1/9a91f9f2-51e2-4583-8952-2aee756c391e/scratchpad/btc-regime';
const DAY = 86400000;
const dayOf = (ms: number) => Math.floor(ms / DAY);
const D = (s: string) => dayOf(Date.parse(s + 'T00:00:00Z'));
const ds = (d: number) => new Date(d * DAY).toISOString().slice(0, 10);
const C0 = D('2026-01-01'), C1 = D('2026-05-01'), B0 = D('2026-09-19');
// PERIOD=C: chạy MỘT lần kỳ mù C theo tệp khóa (docs/verification/khoa-luat-mo-phong-mu-C.md) — chỉ cấm dữ liệu từ 2026-05-01 trở đi
const PC = process.env.PERIOD === 'C';
const banned = (d: number) => PC ? d >= C1 : (d >= C0 && d < C1) || d >= B0;
const SRC = PC ? `${HERE}/c-data` : `${H}/1d`; const FSRC = PC ? `${HERE}/c-data/funding` : `${HERE}/funding`;

// tham số đăng ký trước
const GUARD = process.env.GUARD === '1';
const P = { sma: 50, atrN: 20, slAtr: 2.5, risk: 0.02, side: 0.000575, slip: 0.0002, fgiN: 7, fgiTh: 50 };

// ---------- FGI (lọc kỳ cấm TRƯỚC mọi tính toán) ----------
const fgi = new Map<number, number>();
let dropped = { fgi: 0, bars: 0, fund: 0 };
for (const r of JSON.parse(readFileSync(`${H}/fgi.json`, 'utf8')).data as { value: string; timestamp: string }[]) {
  const d = dayOf(Number(r.timestamp) * 1000);
  if (banned(d)) { dropped.fgi++; continue; }
  fgi.set(d, Number(r.value));
}
for (const d of fgi.keys()) if (banned(d)) throw new Error('ASSERT: FGI cấm lọt');

type Bars = { day: number[]; o: number[]; h: number[]; l: number[]; c: number[] };
function loadBars(sym: string, from: number, to: number): Bars {
  const j = JSON.parse(readFileSync(`${SRC}/${sym}.json`, 'utf8'));
  const b: Bars = { day: [], o: [], h: [], l: [], c: [] };
  for (const r of j.rows as number[][]) {
    const d = dayOf(r[0]);
    if (banned(d)) { dropped.bars++; continue; }
    if (d < from || d > to) continue;
    b.day.push(d); b.o.push(r[1]); b.h.push(r[2]); b.l.push(r[3]); b.c.push(r[4]);
  }
  for (let i = 0; i < b.day.length; i++) {
    if (banned(b.day[i])) throw new Error('ASSERT: nến cấm lọt');
    if (i && b.day[i] - b.day[i - 1] !== 1) throw new Error(`${sym} thiếu nến sau ${ds(b.day[i - 1])}`);
  }
  return b;
}
function loadFunding(sym: string, from: number, to: number) {
  const all = JSON.parse(readFileSync(`${FSRC}/${sym}.json`, 'utf8')) as { t: number; r: number }[];
  const out = all.filter(x => { if (banned(dayOf(x.t))) { dropped.fund++; return false; } return true; })
    .filter(x => dayOf(x.t) >= from && dayOf(x.t) <= to);
  for (const x of out) if (banned(dayOf(x.t))) throw new Error('ASSERT: funding cấm lọt');
  return out;
}

type Kind = 'fgi' | 'sma' | 'both' | 'bh';
type Trade = { e: number; x: number; pnl: number; fund: number; eq0: number; reason: string };

function run(sym: string, kind: Kind, sized: boolean, from: number, to: number, rebal = false, tradeFrom = from) {
  let liq = -1, rebCost = 0;
  const b = loadBars(sym, from, to); const n = b.day.length;
  const fund = loadFunding(sym, from, to + 1);
  // chỉ báo chỉ dùng nến trong [from, to] (kỳ 2026: chỉ từ 2026-05-01)
  const sma = new Array(n).fill(NaN), atr = new Array(n).fill(NaN);
  for (let i = P.sma - 1; i < n; i++) { let s = 0; for (let k = i - P.sma + 1; k <= i; k++) s += b.c[k]; sma[i] = s / P.sma; }
  const tr = (m: number) => Math.max(b.h[m] - b.l[m], Math.abs(b.h[m] - b.c[m - 1]), Math.abs(b.l[m] - b.c[m - 1]));
  for (let i = P.atrN; i < n; i++) {
    if (i === P.atrN) { let a = 0; for (let m = 1; m <= i; m++) a += tr(m); atr[i] = a / P.atrN; }
    else atr[i] = (atr[i - 1] * (P.atrN - 1) + tr(i)) / P.atrN;
  }
  const fgiMean = (t: number): number => { // TB FGI ngày t-6..t, chỉ trong [from, ...]
    let s = 0; for (let k = 0; k < P.fgiN; k++) { const d = t - k; const v = fgi.get(d); if (v === undefined || d < from) return NaN; s += v; } return s / P.fgiN;
  };
  // tín hiệu tại đóng nến i: 1 bật, 0 tắt, NaN chưa đủ dữ liệu (=> đứng ngoài)
  const sig = (i: number): number => {
    if (kind === 'bh') return 1;
    const f = fgiMean(b.day[i]); const sm = sma[i];
    const okF = f >= P.fgiTh, okS = b.c[i] > sm;
    if (kind === 'fgi') return Number.isNaN(f) ? NaN : +okF;
    if (kind === 'sma') return Number.isNaN(sm) ? NaN : +okS;
    return Number.isNaN(f) || Number.isNaN(sm) ? NaN : +(okF && okS);
  };
  let cash = 10000; let pos: null | { qty: number; entry: number; sl: number; eq0: number; e: number; fund: number; cost: number } = null;
  const trades: Trade[] = []; const curve: number[] = []; const inMkt: boolean[] = [];
  let fundTotal = 0; let fi = 0; let firstEntry = -1;
  const fundByYear = new Map<number, number>();
  const closePos = (i: number, px: number, reason: string) => {
    const p = pos!; const c = P.side * px * p.qty;
    cash += p.qty * px - c; // đã trừ tiền mua lúc vào
    const pnl = rebal ? (cash - p.eq0) : p.qty * (px - p.entry) - p.cost - c - p.fund;
    trades.push({ e: p.e, x: b.day[i], pnl, fund: p.fund, eq0: p.eq0, reason }); pos = null;
  };
  let want = kind === 'bh' ? 1 : 0; // bh: vào ở giá mở ngày đầu
  for (let i = 0; i < n; i++) {
    const t = b.day[i];
    // funding lúc 00:00 ngày t thuộc vị thế giữ qua đêm (vị thế mở trước đó)
    const payF = (upto: number) => {
      while (fi < fund.length && fund[fi].t <= upto) {
        const f = fund[fi++]; if (!pos) continue;
        const fd = dayOf(f.t); const j = fd - b.day[0]; if (j < 0 || j >= n) continue;
        const frac = (f.t - fd * DAY) / DAY; const px = b.o[j] + (b.c[j] - b.o[j]) * frac;
        const amt = pos.qty * px * f.r; cash -= amt; pos.fund += amt; fundTotal += amt;
        const y = new Date(f.t).getUTCFullYear(); fundByYear.set(y, (fundByYear.get(y) ?? 0) + amt);
      }
    };
    payF(t * DAY); // funding 00:00 ngày t (trước khi lệnh tại giá mở thực thi)
    // 1) thực thi tại giá mở ngày t theo tín hiệu đóng nến t-1
    if (pos && want === 0) closePos(i, b.o[i], 'tín-hiệu-tắt');
    if (!pos && want === 1) {
      const eq = cash; const entry = b.o[i];
      let qty = eq / entry, sl = 0;
      if (sized) {
        const a = atr[i - 1]; // ATR tới nến đã đóng
        if (Number.isFinite(a)) {
          sl = entry - P.slAtr * a; const dist = (entry - sl) / entry;
          // GUARD=1: định cỡ gồm phí 2 chiều + trượt (như riskModel của engine), chốt chặn funding chạy theo ngày bên dưới
          const d2 = GUARD ? dist + 2 * P.side + P.slip : dist;
          qty = Math.min(eq, (P.risk * eq) / d2) / entry;
        } else qty = 0; // chưa có ATR => không vào
      }
      if (qty > 0) {
        const cost = P.side * entry * qty; cash -= entry * qty + cost;
        pos = { qty, entry, sl, eq0: eq, e: t, fund: 0, cost };
        if (firstEntry < 0) firstEntry = t;
      }
    }
    // 2) trong ngày: funding 08:00, 16:00 và chạm SL. Không biết giờ chạm SL => tính funding trong ngày trước khi xét SL (thận trọng).
    payF(t * DAY + DAY - 1);
    if (GUARD && pos && sized) { // chốt chặn funding: siết SL để (giá vào − SL)·qty + phí + trượt + funding đã trả ≤ 2% vốn lúc vào
      const room = P.risk * pos.eq0 - pos.cost - pos.fund - (P.side + P.slip) * pos.sl * pos.qty;
      const slMin = pos.entry - room / pos.qty;
      if (slMin > pos.sl) pos.sl = slMin;
    }
    if (pos && sized && b.l[i] <= pos.sl) closePos(i, Math.min(pos.sl, b.o[i]) * (1 - P.slip), 'SL');
    if (pos && cash + pos.qty * b.l[i] <= 0) { // ký quỹ cạn (funding tích lũy + giá giảm) => thanh lý, vốn về 0
      const p = pos; trades.push({ e: p.e, x: t, pnl: -p.eq0, fund: p.fund, eq0: p.eq0, reason: 'THANH-LÝ' });
      pos = null; cash = 0; liq = t;
    }
    if (rebal && pos && i < n - 1) { // mua giữ cân bằng ngày: đưa giá trị vị thế về đúng 1× vốn ở giá đóng (phí trên phần chênh)
      const eq = cash + pos.qty * b.c[i]; const q2 = eq / b.c[i]; const dq = q2 - pos.qty;
      const c = P.side * Math.abs(dq) * b.c[i]; cash -= dq * b.c[i] + c; pos.cost += c; pos.qty = q2; rebCost += c;
    }
    // 3) đóng nến: cuối kỳ thì đóng ở giá đóng
    if (liq >= 0 && !pos) want = 0;
    if (i === n - 1 && pos) closePos(i, b.c[i], 'hết-kỳ');
    inMkt.push(!!pos || trades.length > 0 && trades[trades.length - 1].x === t && trades[trades.length - 1].reason === 'SL');
    curve.push(cash + (pos ? pos.qty * b.c[i] : 0));
    // 4) tín hiệu tại đóng nến t
    const s = sig(i); want = liq >= 0 || b.day[i] + 1 < tradeFrom ? 0 : s === 1 ? 1 : 0;
  }
  return { sym, kind, sized, rebal, liq, rebCost, b, curve, trades, inMkt, fundTotal, fundByYear, firstEntry };
}

function metrics(r: ReturnType<typeof run>, lo: number, hi: number) {
  // chỉ số trên đoạn chỉ số [lo, hi] của đường vốn
  const c = r.curve; const start = lo === 0 ? 10000 : c[lo - 1]; const end = c[hi];
  let pk = start, dd = 0; for (let i = lo; i <= hi; i++) { pk = Math.max(pk, c[i]); dd = Math.max(dd, 1 - c[i] / pk); }
  const days = hi - lo + 1; const tot = end / start - 1; const cagr = Math.pow(end / start, 365 / days) - 1;
  const d0 = r.b.day[lo], d1 = r.b.day[hi];
  const tr = r.trades.filter(t => t.e >= d0 && t.e <= d1);
  let im = 0; for (let i = lo; i <= hi; i++) if (r.inMkt[i]) im++;
  const worst = tr.length ? Math.max(...tr.map(t => -t.pnl / t.eq0)) : 0;
  let f = 0; for (const [y, v] of r.fundByYear) if (y >= new Date(d0 * DAY).getUTCFullYear() && y <= new Date(d1 * DAY).getUTCFullYear()) f += v;
  return { tot, cagr, dd, mar: dd > 0 ? cagr / dd : NaN, n: tr.length, tim: im / days, fund: f / 10000, worst };
}
const pct = (x: number, d = 1) => (x * 100).toFixed(d) + '%';
const name = (k: Kind, s: boolean, rb = false) => k === 'bh' ? (rb ? 'Mua giữ 1× cân bằng ngày' : 'Mua giữ 1× (giữ nguyên số coin)') : `S-${k}${s ? ' 2%+SL' : ' 1× không SL'}`;
const VARS: [Kind, boolean][] = [['fgi', true], ['sma', true], ['both', true], ['fgi', false], ['sma', false], ['both', false], ['bh', false]];
const HDR = '| Chiến lược | Tổng lãi | CAGR | DD max | MAR | Số lệnh | % thời gian có VT | Funding (% vốn đầu) | Lỗ thật lớn nhất/lệnh (% vốn) |\n|---|---|---|---|---|---|---|---|---|';
const row = (nm: string, m: ReturnType<typeof metrics>, ann = true) =>
  `| ${nm} | ${pct(m.tot)} | ${ann ? pct(m.cagr) : '(' + pct(m.cagr) + ')'} | ${pct(m.dd)} | ${m.mar.toFixed(2)} | ${m.n} | ${pct(m.tim, 0)} | ${pct(m.fund, 2)} | ${m.worst <= 0 ? 'không lệnh lỗ' : pct(m.worst, 2)} |`;

let md = ''; const out = (s = '') => { md += s + '\n'; };
const sel: Record<string, { mar: number; tot26: number }> = {}; let bhMar = NaN, bhMarR = NaN;
const P1 = [D('2020-01-01'), D('2025-12-31')], P2 = [D('2026-05-01'), D('2026-09-18')];
if (PC) { // kỳ mù C: chỉ ứng viên đã khóa S-sma 2%+SL (GUARD=1) trên BTC + đối chứng mua giữ cân bằng ngày; chỉ báo khởi động từ 2025-09-01
  if (!GUARD) throw new Error('kỳ C phải chạy với GUARD=1 (luật đã khóa)');
  const W0 = D('2025-09-01'), CE = C1 - 1;
  const rs = [run('BTCUSDT', 'sma', true, W0, CE, false, C0), run('BTCUSDT', 'bh', false, C0, CE, true)];
  let o = `# Kỳ mù C [2026-01-01, 2026-05-01) — hệ BTC S-sma 2%+SL (một lần chạy)\n\n${HDR}\n`;
  for (const r of rs) {
    const lo = r.b.day.indexOf(C0); const m = metrics(r, lo, r.curve.length - 1);
    o += row(name(r.kind, r.sized, r.rebal), m, false) + '\n';
    if (r.liq >= 0) o += `THANH LÝ ${ds(r.liq)}\n`;
  }
  o += '\nLệnh S-sma: ' + (rs[0].trades.map(t => `${ds(t.e)}→${ds(t.x)} ${t.reason} ${pct(t.pnl / t.eq0, 2)}`).join('; ') || 'không lệnh') + '\n';
  writeFileSync(`${HERE}/report-C.md`, o); console.log(o); process.exit(0);
}
for (const sym of ['BTCUSDT', 'ETHUSDT']) {
  out(`\n## ${sym}\n\n### 2020-01-01 → 2025-12-31 (toàn kỳ)\n\n${HDR}`);
  const runs1 = [...VARS.map(([k, s]) => run(sym, k, s, P1[0], P1[1])), run(sym, 'bh', false, P1[0], P1[1], true)];
  for (const r of runs1) {
    const m = metrics(r, 0, r.curve.length - 1); out(row(name(r.kind, r.sized, r.rebal), m));
    if (r.liq >= 0) out(`| ↳ bị THANH LÝ ngày ${ds(r.liq)} (vốn về 0) | | | | | | | | |`);
    if (sym === 'BTCUSDT') { if (r.kind === 'bh' && !r.rebal) bhMar = m.mar; else if (r.kind === 'bh') bhMarR = m.mar; else if (r.sized) sel[r.kind] = { mar: m.mar, tot26: NaN }; }
  }
  for (const r of runs1.filter(r => r.sized)) {
    const big = r.trades.filter(t => -t.pnl / t.eq0 > P.risk);
    if (big.length) out(`\n${name(r.kind, r.sized)}: ${big.length} lệnh lỗ > 2% vốn: ` + big.map(t => `${ds(t.e)}→${ds(t.x)} ${t.reason} lỗ ${pct(-t.pnl / t.eq0, 2)} (funding ${pct(t.fund / t.eq0, 2)})`).join('; '));
  }
  out(`\nLệnh đầu tiên: ${runs1.map(r => name(r.kind, r.sized, r.rebal) + ' ' + ds(r.firstEntry)).join('; ')}`);
  out(`\n### Từng năm (${sym}) — tổng lãi / DD trong năm / số lệnh / funding % vốn đầu kỳ\n`);
  out('| Năm | ' + runs1.map(r => name(r.kind, r.sized, r.rebal)).join(' | ') + ' |\n|---|' + runs1.map(() => '---').join('|') + '|');
  for (let y = 2020; y <= 2025; y++) {
    const r0 = runs1[0]; const lo = r0.b.day.findIndex(d => new Date(d * DAY).getUTCFullYear() === y);
    const hi = r0.b.day.findLastIndex(d => new Date(d * DAY).getUTCFullYear() === y);
    out(`| ${y} | ` + runs1.map(r => { const m = metrics(r, lo, hi); return `${pct(m.tot, 0)} / ${pct(m.dd, 0)} / ${m.n} / ${pct(m.fund, 1)}`; }).join(' | ') + ' |');
  }
  out(`\n### [2026-05-01, 2026-09-19) — khởi đầu mới, chỉ báo chỉ dùng dữ liệu ≥ 2026-05-01 (CAGR trong ngoặc: quy năm từ 141 ngày, không có ý nghĩa)\n\n${HDR}`);
  const runs2 = [...VARS.map(([k, s]) => run(sym, k, s, P2[0], P2[1])), run(sym, 'bh', false, P2[0], P2[1], true)];
  for (const r of runs2) {
    const m = metrics(r, 0, r.curve.length - 1); out(row(name(r.kind, r.sized, r.rebal), m, false));
    if (r.liq >= 0) out(`\n**${name(r.kind, r.sized, r.rebal)} bị THANH LÝ ngày ${ds(r.liq)}** (funding tích lũy trừ vào ký quỹ + giá giảm làm vốn ≤ 0).`);
    if (sym === 'BTCUSDT' && r.kind !== 'bh' && r.sized) sel[r.kind].tot26 = m.tot;
  }
  out(`\nNgày vào lệnh đầu tiên kỳ 2026: ${runs2.map(r => name(r.kind, r.sized, r.rebal) + ' ' + (r.firstEntry < 0 ? 'không có' : ds(r.firstEntry))).join('; ')}`);
  if (sym === 'BTCUSDT') {
    out('\nDanh sách lệnh BTC kỳ 2026 (bản 2%+SL):');
    for (const r of runs2.filter(r => r.sized)) out(`- ${name(r.kind, r.sized, r.rebal)}: ` + (r.trades.map(t => `${ds(t.e)}→${ds(t.x)} ${t.reason} ${pct(t.pnl / t.eq0, 2)}`).join('; ') || 'không lệnh'));
  }
}
// ---------- luật chọn ----------
const ranked = Object.entries(sel).sort((a, b) => b[1].mar - a[1].mar);
const [topK, top] = ranked[0];
const pass = (v: { mar: number; tot26: number }) => v.mar > Math.max(bhMar, bhMarR) && v.tot26 > 0;
let s = `\n## Luật chọn (áp nguyên văn)\n\nMAR mua giữ BTC 2020–2025 = ${bhMar.toFixed(3)} (giữ nguyên số coin; ${'bị thanh lý'}); bản cân bằng ngày = ${bhMarR.toFixed(3)}. Ngưỡng dùng: giá trị lớn hơn = ${Math.max(bhMar, bhMarR).toFixed(3)}\n\n| Ứng viên (2%+SL) | MAR 2020–2025 | MAR > mua giữ? | Tổng lãi 2026-05→09 | > 0? |\n|---|---|---|---|---|\n`;
for (const [k, v] of ranked) s += `| S-${k} | ${v.mar.toFixed(3)} | ${v.mar > Math.max(bhMar, bhMarR) ? 'ĐẠT' : 'KHÔNG'} | ${pct(v.tot26, 2)} | ${v.tot26 > 0 ? 'ĐẠT' : 'KHÔNG'} |\n`;
s += `\nMAR cao nhất: S-${topK}. Kết luận: ${pass(top) ? `S-${topK} ĐỦ điều kiện dùng kỳ mù C.` : `S-${topK} KHÔNG đạt điều kiện → không ứng viên nào cho kỳ C.`}\n`;
const alt = ranked.find(([, v]) => pass(v));
s += `(Cách đọc phụ "MAR cao nhất trong số ứng viên đạt điều kiện": ${alt ? 'S-' + alt[0] : 'không có'}.)\n`;
out(s);
const head = `# Hệ BTC theo chế độ — kết quả kỳ phát triển\n\nKiểm dữ liệu cấm (assert chạy trong mã): đã loại trước tính toán ${dropped.bars} nến, ${dropped.fgi} điểm FGI, ${dropped.fund} kỳ funding thuộc [2026-01-01, 2026-05-01) hoặc ≥ 2026-09-19; assert sau lọc: 0 bản ghi cấm. Funding tải bằng endTime chặn trước kỳ cấm.\n`;
writeFileSync(`${HERE}/${GUARD ? "report-guard.md" : "report.md"}`, head + md);
console.log(head + md);
