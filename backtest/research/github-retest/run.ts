// Chạy toàn bộ kiểm lại theo kế hoạch 2026-10-20-kiem-lai-bot-github.md và ghi docs/verification/ket-qua-kiem-lai-bot-github.md.
//   node backtest/research/github-retest/run.ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Candle } from '../../../packages/core/types.ts';
import { INTERVAL_MS } from '../../data.ts';
import { B0, DAY, HOUR, ROOT, WIN, type Window, type Trade, type Summary, type Funding, loadCached, loadFunding, loadHistory1d, hasDailyGap, historySymbols, pitTop, summarize, inWindow, f1, iso, STABLE_BASES } from './common.ts';
import { VARIANTS, type Variant, simulate, shiftTest } from './engine.ts';
import { SIGNAL_STRATEGIES, type Strategy } from './strategies.ts';
import { alwaysIn, smaCrossWant, emaWalkForward, type Side } from './trend.ts';
import { gridSim, dcaSim, DCA, type GridResult } from './grid.ts';

const OUT_DOC = join(ROOT, 'docs/verification/ket-qua-kiem-lai-bot-github.md');
const OUT_JSON = process.env.GH_RETEST_JSON ?? '';
const SLOTS = 5; // tối đa 5 lệnh mở cùng lúc (2% × 5 = 10% rủi ro mở — luật bot hiện tại); không có trong kế hoạch, là giả định báo cáo
const log = (s: string) => process.stderr.write(s + '\n');
const t0 = Date.now();

// ---------------- vũ trụ top-200 theo thời điểm ----------------
log('xếp hạng top-200 theo thời điểm…');
const pit = pitTop(200, WIN.M59.from, WIN.M59.to);
const dayIdx = (t: number) => Math.floor(t / DAY);
const members = [...pit.members].sort();
log(`  ${members.length} mã từng lọt top-200 trong 5–9/2026 (${(Date.now() - t0) / 1000}s)`);

type SymData = { symbol: string; c15: Candle[] | null; c1h: Candle[] | null; funding: Funding; late15: boolean };
const WARM = { '15m': 900, '1h': 260 } as const;
const data = new Map<string, SymData>();
const missing: { '15m': string[]; '1h': string[] } = { '15m': [], '1h': [] };
for (const s of members) {
  const r15 = loadCached(s, '15m', WIN.M59.from - WARM['15m'] * INTERVAL_MS['15m'], B0);
  const r1h = loadCached(s, '1h', WIN.M59.from - WARM['1h'] * INTERVAL_MS['1h'], B0);
  if (!r15) missing['15m'].push(s);
  if (!r1h) missing['1h'].push(s);
  data.set(s, { symbol: s, c15: r15?.candles ?? null, c1h: r1h?.candles ?? null, funding: loadFunding(s), late15: !!r15 && r15.firstFileFrom > WIN.M59.from - WARM['15m'] * INTERVAL_MS['15m'] });
}
log(`  nạp nến xong: thiếu 15m ${missing['15m'].length}, thiếu 1h ${missing['1h'].length} (${(Date.now() - t0) / 1000}s)`);

// ---------------- danh mục giới hạn chỗ ----------------
function capPortfolio(trades: readonly Trade[], slots: number): { taken: Trade[]; skipped: number } {
  const sorted = [...trades].sort((a, b) => a.entryTime - b.entryTime || a.symbol.localeCompare(b.symbol));
  let active: number[] = []; const taken: Trade[] = []; let skipped = 0;
  for (const t of sorted) {
    active = active.filter((x) => x > t.entryTime);
    if (active.length < slots) { taken.push(t); active.push(t.exitTime); } else skipped++;
  }
  return { taken, skipped };
}

type Row = { label: string; window: string; s: Summary; rawN: number; rawExp: number; skipped: number; extra?: string };
const results: Record<string, { rows: Row[]; notes: string[] }> = {};

// ---------------- G1–G5, H1, H2 ----------------
for (const st of SIGNAL_STRATEGIES) {
  const rows: Row[] = []; const notes: string[] = [];
  let used = 0;
  // kiểm nhìn trước trên 3 mã
  for (const s of ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']) { const d = data.get(s); const b = st.interval === '15m' ? d?.c15 : d?.c1h; if (b) shiftTest(`${st.id} ${s}`, b, st.make); }
  const sigCache = new Map<string, ReturnType<Strategy['make']>>();
  for (const v of VARIANTS) {
    const all: Trade[] = [];
    for (const d of data.values()) {
      const bars = st.interval === '15m' ? d.c15 : d.c1h;
      if (!bars || bars.length < st.warmupBars + 10) continue;
      let sig = sigCache.get(d.symbol); if (!sig) sigCache.set(d.symbol, (sig = st.make(bars)));
      if (v === VARIANTS[0]) used++;
      const tr = simulate({ symbol: d.symbol, bars, sig, cfg: st.cfg, v, notionalMult: 0.02 / st.cfg.sl, riskPct: 2, allowEntry: (i) => pit.top.get(dayIdx(bars[i]!.openTime))?.has(d.symbol) ?? false, from: WIN.M59.from, to: B0, funding: d.funding });
      all.push(...tr);
    }
    const { taken, skipped } = capPortfolio(all, SLOTS);
    for (const w of [WIN.D, WIN.M59]) {
      const raw = all.filter((t) => inWindow(t, w)), tk = taken.filter((t) => inWindow(t, w));
      const rawS = summarize(raw);
      rows.push({ label: v.label, window: w.name, s: summarize(tk), rawN: raw.length, rawExp: rawS.expR, skipped: raw.length - tk.length });
    }
    log(`  ${st.id} ${v.name}: ${all.length} lệnh thô, ${taken.length} lệnh sau giới hạn ${SLOTS} chỗ (${(Date.now() - t0) / 1000}s)`);
  }
  notes.push(`Số mã có dữ liệu ${st.interval}: ${used}/${members.length}.`);
  results[st.id] = { rows, notes };
}

// ---------------- J1 ----------------
type AcctRun = { trades: Trade[]; perSymbolTotal: number[]; curve: { t: number; equity: number }[] };
function accountPortfolio(runs: { trades: Trade[]; daily: Map<number, number> }[]): AcctRun {
  // Danh mục cân bằng đều (equal-weight, cân lại mỗi ngày): lợi suất ngày = trung bình lợi suất ngày của các mã đang hoạt động.
  const trades = runs.flatMap((r) => r.trades);
  const perSymbolTotal: number[] = [];
  const byDay = new Map<number, { sum: number; n: number }>();
  for (const r of runs) {
    if (r.trades.length === 0) continue;
    let last = 1, prev = 1;
    const days = [...r.daily.keys()].sort((a, b) => a - b);
    for (const d of days) { last = r.daily.get(d)!; const a = byDay.get(d) ?? { sum: 0, n: 0 }; a.sum += last / prev - 1; a.n++; byDay.set(d, a); prev = last; }
    perSymbolTotal.push((last - 1) * 100);
  }
  let eq = 100;
  const curve = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([d, a]) => ({ t: d * DAY, equity: (eq *= 1 + a.sum / a.n) }));
  return { trades, perSymbolTotal, curve };
}
function acctSummary(a: AcctRun): Summary & { meanTotal: number; medianTotal: number; symbols: number } {
  const s = summarize(a.trades);
  let peak = 0, dd = 0; for (const p of a.curve) { peak = Math.max(peak, p.equity); if (peak > 0) dd = Math.max(dd, ((peak - p.equity) / peak) * 100); }
  const sorted = [...a.perSymbolTotal].sort((x, y) => x - y);
  const med = sorted.length ? sorted[sorted.length >> 1]! : NaN;
  const mean = sorted.length ? sorted.reduce((x, y) => x + y, 0) / sorted.length : NaN;
  return { ...s, totalPct: mean, ddPct: dd, meanTotal: mean, medianTotal: med, symbols: sorted.length };
}
{
  const rows: Row[] = []; const notes: string[] = [];
  const syms = historySymbols().filter((s) => !STABLE_BASES.has(s.replace(/USDT$/, '')));
  for (const w of [WIN.Y, WIN.M59]) {
    const bars = new Map<string, Candle[]>();
    let gapSkipped = 0;
    for (const s of syms) { const b = loadHistory1d(s, w.from - 210 * DAY, w.to); if (b.length <= 210) continue; if (hasDailyGap(b)) { gapSkipped++; continue; } bars.set(s, b); }
    for (const v of VARIANTS) {
      const runs = [...bars.entries()].map(([s, b]) => alwaysIn(s, b, smaCrossWant(b), v, loadFunding(s), w.from, w.to));
      const a = accountPortfolio(runs), su = acctSummary(a);
      rows.push({ label: v.label, window: w.name, s: su, rawN: su.n, rawExp: NaN, skipped: 0, extra: `trung vị mã ${f1(su.medianTotal)}%, ${su.symbols} mã` });
    }
    if (w === WIN.Y) shiftTest('J1 BTC', bars.get('BTCUSDT')!, (b) => { const w2 = smaCrossWant(b); const n = b.length; return { enterLong: Uint8Array.from(w2, (x) => (x === 'long' ? 1 : 0)), exitLong: new Uint8Array(n), enterShort: Uint8Array.from(w2, (x) => (x === 'short' ? 1 : 0)), exitShort: new Uint8Array(n) }; });
    notes.push(`${w.name}: ${bars.size} mã có ≥ 210 nến ngày liên tục (gồm mã đã hủy niêm yết); bỏ ${gapSkipped} mã có khoảng trống nến ngày (tệp lịch sử thiếu kỳ C và không có bản đệm); khởi động SMA200 = 200 nến trước cửa sổ.`);
    log(`  J1 ${w.name} xong (${(Date.now() - t0) / 1000}s)`);
  }
  results['J1'] = { rows, notes };
}

// ---------------- E1 ----------------
{
  const rows: Row[] = []; const notes: string[] = [];
  const WF = [{ train: 7, test: 28 }, { train: 14, test: 10 }];
  const bh = (b: Candle[], w: Window): string => { const a = b.find((c) => c.openTime >= w.from), z = [...b].reverse().find((c) => c.openTime < w.to); return a && z ? f1(((z.close - a.open) / a.open) * 100) : '—'; };
  const runE1 = (label: string, bars: Candle[], w: Window, wfFrom: number, funding: Funding) => {
    for (const wf of WF) {
      const { want, picks } = emaWalkForward(bars, wf, wfFrom, w.to);
      for (const v of VARIANTS) {
        const r = alwaysIn('BTCUSDT', bars, want, v, funding, wfFrom, w.to);
        const a = accountPortfolio([r]), su = acctSummary(a);
        rows.push({ label: `${v.label}, WF ${wf.train}/${wf.test}`, window: `${label} ${w.name}`, s: su, rawN: su.n, rawExp: NaN, skipped: 0, extra: `${picks.length} bước, mua-giữ ${bh(bars, { ...w, from: wfFrom })}%` });
      }
    }
  };
  const fBTC = loadFunding('BTCUSDT');
  const d1 = loadHistory1d('BTCUSDT', WIN.Y.from, WIN.Y.to);
  runE1('1D', d1, WIN.Y, Date.parse('2020-08-01T00:00:00Z'), fBTC); // EMA200 cần 200 nến khởi động → bước đầu 1/8/2020
  const d2 = loadHistory1d('BTCUSDT', WIN.M59.from - 210 * DAY, WIN.M59.to);
  runE1('1D', d2, WIN.M59, WIN.M59.from + 14 * DAY, fBTC); // cửa sổ huấn luyện đầu nằm trong 5–9/2026 (không dùng kỳ C)
  const h1 = loadCached('BTCUSDT', '1h', WIN.M59.from - 20 * DAY, B0)!.candles;
  runE1('1h', h1, WIN.M59, WIN.M59.from + 14 * DAY, fBTC);
  shiftTest('E1 1h', h1, (b) => { const { want } = emaWalkForward(b, { train: 7, test: 28 }, WIN.M59.from + 14 * DAY, B0); const n = b.length; return { enterLong: Uint8Array.from(want, (x) => (x === 'long' ? 1 : 0)), exitLong: new Uint8Array(n), enterShort: Uint8Array.from(want, (x) => (x === 'short' ? 1 : 0)), exitShort: new Uint8Array(n) }; }, 24 * 7);
  notes.push('Bài gốc chạy nến 1–60 phút; dữ liệu 1h BTC chỉ có từ 12/2025 nên 2020–2025 chạy 1D (cửa sổ 7/28 và 14/10 NGÀY = 7/28 và 14/10 nến — rất ít mẫu), 5–9/2026 chạy cả 1D và 1h. Cửa sổ huấn luyện đầu tiên bắt đầu trong kỳ kiểm (không dùng kỳ C).');
  results['E1'] = { rows, notes };
  log(`  E1 xong (${(Date.now() - t0) / 1000}s)`);
}

// ---------------- P1, P2 ----------------
type GridRow = { label: string; window: string; lev: number; n: number; winPct: number; expPct: number; ciLo: number; ciHi: number; pf: number; meanTotal: number; medianTotal: number; meanDD: number; maxDD: number; liqPct: number; worst: number; realized: number; unreal: number; funding: number; symbols: number };
function gridAgg(label: string, w: Window, lev: number, rs: GridResult[]): GridRow {
  const trades = rs.flatMap((r) => r.trades.concat(r.unrealizedPct !== 0 && !r.trades.some((t) => t.openAtEnd) ? [{ symbol: '', side: 'long' as const, entryTime: w.from, exitTime: w.to - 1, entry: 0, exit: 0, pnlPct: r.unrealizedPct, R: NaN, retPct: 0, feePct: 0, fundingPct: 0, reason: 'inventory-at-end', openAtEnd: true }] : []));
  const s = summarize(trades);
  const totals = rs.map((r) => r.finalEquity - 100).sort((a, b) => a - b);
  return { label, window: w.name, lev, n: trades.length, winPct: s.winPct, expPct: s.expPct, ciLo: s.ciLo, ciHi: s.ciHi, pf: s.pf,
    meanTotal: totals.reduce((a, b) => a + b, 0) / totals.length, medianTotal: totals[totals.length >> 1]!, meanDD: rs.reduce((a, r) => a + r.maxDD, 0) / rs.length, maxDD: Math.max(...rs.map((r) => r.maxDD)),
    liqPct: (100 * rs.filter((r) => r.liquidated).length) / rs.length, worst: Math.min(...totals), realized: rs.reduce((a, r) => a + r.realizedPct, 0) / rs.length, unreal: rs.reduce((a, r) => a + r.unrealizedPct, 0) / rs.length, funding: rs.reduce((a, r) => a + r.fundingPct, 0) / rs.length, symbols: rs.length };
}
const gridRows: Record<string, GridRow[]> = { 'P1-static': [], 'P1-dgt': [], P2: [] };
const gridSyms: Record<string, string[]> = {};
for (const w of [WIN.D, WIN.M59]) {
  const top = pit.top.get(dayIdx(w.from))!;
  // BTC, ETH + 20 mã thanh khoản nhất tại ngày đầu cửa sổ (xếp theo trung bình quoteVolume 30 ngày)
  const ranked = [...top].filter((s) => s !== 'BTCUSDT' && s !== 'ETHUSDT').sort();
  const rank30 = new Map<string, number>();
  for (const s of ranked) { const b = loadHistory1d(s, w.from - 31 * DAY, w.from); rank30.set(s, b.reduce((a, c) => a + c.quoteVolume, 0) / Math.max(b.length, 1)); }
  const syms = ['BTCUSDT', 'ETHUSDT', ...ranked.sort((a, b) => rank30.get(b)! - rank30.get(a)!).slice(0, 20)];
  gridSyms[w.name] = syms;
  for (const lev of [1, 3]) for (const v of VARIANTS) {
    const rs = { st: [] as GridResult[], dgt: [] as GridResult[], dca: [] as GridResult[] };
    for (const s of syms) {
      const d = data.get(s); if (!d?.c15) continue;
      const a = gridSim(s, d.c15, v, lev, false, d.funding, w.from, w.to), b = gridSim(s, d.c15, v, lev, true, d.funding, w.from, w.to), c = dcaSim(s, d.c15, v, lev, d.funding, w.from, w.to);
      if (a) rs.st.push(a); if (b) rs.dgt.push(b); if (c) rs.dca.push(c);
    }
    gridRows['P1-static']!.push(gridAgg(v.label, w, lev, rs.st)); gridRows['P1-dgt']!.push(gridAgg(v.label, w, lev, rs.dgt)); gridRows['P2']!.push(gridAgg(v.label, w, lev, rs.dca));
  }
  log(`  P1/P2 ${w.name} xong (${(Date.now() - t0) / 1000}s)`);
}

// ---------------- Tiêu chí đặt trước ----------------
const PASS_DD = 20;
function verdict(id: string, rows: Row[], firstWindow: string): { pass: boolean; why: string } {
  const bq = rows.filter((r) => r.label.startsWith('bi quan 0,136'));
  const a = bq.find((r) => r.window.startsWith(firstWindow)), b = bq.find((r) => r.window.startsWith('5–9/2026'));
  if (!a || !b) return { pass: false, why: 'thiếu dữ liệu' };
  const c1 = a.s.n > 0 && a.s.ciLo > 0, c2 = b.s.totalPct > 0, c3 = a.s.ddPct <= PASS_DD && b.s.ddPct <= PASS_DD;
  return { pass: c1 && c2 && c3, why: `CI dưới ${firstWindow.slice(0, 9)} ${f1(a.s.ciLo, 3)} ${c1 ? '>' : '≤'} 0; tổng 5–9/2026 ${f1(b.s.totalPct)}% ${c2 ? '>' : '≤'} 0; DD ${f1(a.s.ddPct)}%/${f1(b.s.ddPct)}% ${c3 ? '≤' : '>'} 20%` };
}
function gridVerdict(rows: GridRow[]): { pass: boolean; why: string } {
  const bq = rows.filter((r) => r.label.startsWith('bi quan 0,136') && r.lev === 1);
  const a = bq.find((r) => r.window.startsWith('D')), b = bq.find((r) => r.window.startsWith('5–9'));
  if (!a || !b) return { pass: false, why: 'thiếu dữ liệu' };
  const c1 = a.ciLo > 0, c2 = b.meanTotal > 0, c3 = a.maxDD <= PASS_DD && b.maxDD <= PASS_DD;
  return { pass: c1 && c2 && c3, why: `CI dưới D ${f1(a.ciLo, 3)} ${c1 ? '>' : '≤'} 0; tổng TB 5–9/2026 ${f1(b.meanTotal)}% ${c2 ? '>' : '≤'} 0; DD lớn nhất ${f1(a.maxDD)}%/${f1(b.maxDD)}% ${c3 ? '≤' : '>'} 20% (1×)` };
}

// ---------------- Ghi báo cáo ----------------
const NAMES: Record<string, string> = { G1: 'G1 BinHV45', G2: 'G2 ClucMay72018', G3: 'G3 SMAOffsetProtectOptV1', G4: 'G4 ReinforcedQuickie', G5: 'G5 BigZ04_TSL4', 'H1-15m': 'H1 Bollinger %B (15m)', 'H1-1h': 'H1 Bollinger %B (1h)', H2: 'H2 MACD+BB (1h)', J1: 'J1 SMA 50/200 (1D)', E1: 'E1 EMA walk-forward (BTC)' };
const CLAIMS: Record<string, string> = {
  G1: 'Tác giả không công bố số liệu (file không có claim). Danh tiếng "win rate cao" truyền miệng Discord 2021.',
  G2: 'Tác giả không công bố số liệu.',
  G3: 'Tác giả không công bố số liệu. Cùng họ với NotAnotherSMAOffsetStrategyHO: Freqle League 2022–2024 (aggregator, nhãn C) +117,0%, win rate 80,7%, DD −3,51%.',
  G4: 'Tác giả không công bố số liệu ("only buy on an upward tending market").',
  G5: 'Tác giả không công bố số liệu; README repo: "Don\'t use for live trading".',
  'H1-15m': 'Hummingbot không công bố kết quả cho tham số ví dụ.', 'H1-1h': 'Hummingbot không công bố kết quả cho tham số ví dụ.', H2: 'Hummingbot không công bố kết quả cho tham số ví dụ.',
  J1: 'Jesse: ví dụ "hello world", không có số liệu.',
  E1: 'Bài gốc (BTC 60 phút, OOS 11/2019–8/2021, phí 0,1%/giao dịch): WF 14/10 lợi suất năm 90,9%, Sharpe 1,11, MDD 52,4%, IR 2,63 — so với mua-giữ 92,7% / 1,13 / 62,3% / 2,05; WF 7/28: 68,3% / 0,83 / 58,5%. Hòa vốn ~0,4%/lệnh.',
};
const hdr = '| Bản | Cửa sổ | Lệnh (thô) | Bỏ vì hết chỗ | Thắng % | Kỳ vọng %/lệnh | Kỳ vọng R | CI95 khối ngày | PF | Tổng % | DD % | Lỗ nhất 1 lệnh % | Mở cuối kỳ | Mở đồng thời max |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|';
const rowMd = (r: Row): string => `| ${r.label} | ${r.window} | ${r.s.n} (${r.rawN}) | ${r.skipped} | ${f1(r.s.winPct)} | ${f1(r.s.expPct, 3)} | ${f1(r.s.expR, 3)} | [${f1(r.s.ciLo, 3)}, ${f1(r.s.ciHi, 3)}] ${r.s.ciKind} | ${f1(r.s.pf, 2)} | ${f1(r.s.totalPct)} | ${f1(r.s.ddPct)} | ${f1(r.s.worstPct, 2)} | ${r.s.openAtEnd} | ${r.s.maxConcurrent}${r.extra ? ' — ' + r.extra : ''} |`;
const gHdr = '| Bản | Cửa sổ | Đòn bẩy | Lệnh | Thắng % | Kỳ vọng %/lệnh | CI95 | PF | Tổng TB % | Tổng trung vị % | Lãi đã chốt TB % | Chưa chốt (bag) TB % | Funding TB % | DD TB % | DD lớn nhất % | Tệ nhất 1 mã % | Cháy % mã |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|';
const gRowMd = (r: GridRow): string => `| ${r.label} | ${r.window} | ${r.lev}× | ${r.n} | ${f1(r.winPct)} | ${f1(r.expPct, 3)} | [${f1(r.ciLo, 3)}, ${f1(r.ciHi, 3)}] | ${f1(r.pf, 2)} | ${f1(r.meanTotal)} | ${f1(r.medianTotal)} | ${f1(r.realized)} | ${f1(r.unreal)} | ${f1(r.funding, 2)} | ${f1(r.meanDD)} | ${f1(r.maxDD)} | ${f1(r.worst)} | ${f1(r.liqPct, 0)} |`;

const verdicts: { id: string; v: { pass: boolean; why: string } }[] = [];
for (const id of ['G1', 'G2', 'G3', 'G4', 'G5', 'H1-15m', 'H1-1h', 'H2']) verdicts.push({ id, v: verdict(id, results[id]!.rows, 'D [') });
verdicts.push({ id: 'J1', v: verdict('J1', results['J1']!.rows, '2020–2025') });
{ // E1: lấy WF 14/10 1D cho 2020–2025 và 5–9/2026 (cả 1D và 1h phải dương)
  const rows = results['E1']!.rows.filter((r) => r.label.endsWith('WF 14/10'));
  const v1 = verdict('E1', rows.filter((r) => r.window.startsWith('1D')).map((r) => ({ ...r, window: r.window.slice(3) })), '2020–2025');
  const h = rows.find((r) => r.window.startsWith('1h') && r.label.startsWith('bi quan 0,136'));
  verdicts.push({ id: 'E1', v: { pass: v1.pass && !!h && h.s.totalPct > 0 && h.s.ddPct <= PASS_DD, why: `1D: ${v1.why}; 1h 5–9/2026 tổng ${f1(h?.s.totalPct ?? NaN)}%, DD ${f1(h?.s.ddPct ?? NaN)}%` } });
}
verdicts.push({ id: 'P1-static', v: gridVerdict(gridRows['P1-static']!) }, { id: 'P1-dgt', v: gridVerdict(gridRows['P1-dgt']!) }, { id: 'P2', v: gridVerdict(gridRows['P2']!) });

const md: string[] = [];
md.push('# Kết quả kiểm lại bot mã nguồn mở "tỉ lệ thắng cao" trên dữ liệu Binance USDⓈ-M của mình');
md.push('');
md.push(`Ngày chạy: 2026-10-20. Kế hoạch đăng ký trước: \`docs/superpowers/plans/2026-10-20-kiem-lai-bot-github.md\` (không chỉnh tham số theo kết quả). Mã mô phỏng: \`backtest/research/github-retest/\` (chạy \`node backtest/research/github-retest/run.ts\`, ${((Date.now() - t0) / 60000).toFixed(1)} phút).`);
md.push('');
md.push('## Cách đọc (cho người không lập trình)');
md.push('');
md.push('Mỗi bot được "dịch" nguyên luật từ mã nguồn trên GitHub sang bộ mô phỏng của mình rồi chạy lại trên nến Binance Futures của mình, với hai cách tính: **lạc quan** (giả định như bộ backtest gốc: khớp đúng giá mở nến, chốt lời tính là đạt nếu giá cao nhất của nến chạm tới, phí 0,1% khứ hồi) và **bi quan** (khớp giá mở nến sau cộng trượt 0,02%, nếu trong cùng một nến giá chạm cả cắt lỗ lẫn chốt lời thì tính là cắt lỗ, phí khứ hồi 0,136% — mức đo thực tế của mình — và bản 0,4%, trả funding thật khi giữ qua kỳ funding, giữ tối đa 30 ngày). **Chênh lệch lạc quan − bi quan chính là phần "ảo" của con số quảng cáo.**');
md.push('');
md.push('- **Kỳ vọng R**: lãi trung bình mỗi lệnh tính theo đơn vị rủi ro (1R = 2% vốn đặt ở cắt lỗ). Dương là có lợi thế, âm là mất tiền dần. **CI95 khối ngày**: khoảng tin cậy 95% của kỳ vọng, lấy mẫu lại theo từng ngày (lệnh cùng ngày chịu chung cú sốc). Nếu **cận dưới > 0** thì lợi thế mới được coi là có thật về thống kê.');
md.push('- **PF** (profit factor): tổng lãi chia tổng lỗ; > 1 là lãi. **DD** (drawdown): mức sụt vốn lớn nhất từ đỉnh. **Tổng %**: lãi cộng dồn trên vốn ban đầu (không lãi kép, trừ J1/E1/P1/P2 ghi riêng). Vì không lãi kép nên tổng % có thể âm quá −100 và DD quá 100%: nghĩa là **vốn đã cháy trước khi hết kỳ** (với cách định cỡ 2%/lệnh, 5 lệnh cùng lúc); con số càng âm chỉ cho biết lỗ dồn càng nhanh.');
md.push('- Tiêu chí "đáng xem tiếp" đặt trước khi chạy: bản **bi quan 0,136%** phải có cận dưới CI95 > 0 trên kỳ D **và** tổng lãi > 0 ở 5–9/2026 **và** DD ≤ 20%. Không đạt → "không có lợi thế trên dữ liệu của mình", không chỉnh tham số để cho đạt.');
md.push('');
md.push('## Tóm tắt');
md.push('');
md.push('| Ứng viên | Bi quan 0,136% kỳ D: lệnh | Kỳ vọng (R hoặc %) | CI95 | PF | Tổng % D | DD % D | Tổng % 5–9/2026 | Lạc quan tổng % 5–9/2026 | Đạt tiêu chí? |');
md.push('|---|---|---|---|---|---|---|---|---|---|');
for (const { id, v } of verdicts) {
  if (id.startsWith('P')) {
    const rs = gridRows[id]!; const a = rs.find((r) => r.label.startsWith('bi quan 0,136') && r.lev === 1 && r.window.startsWith('D'))!, b = rs.find((r) => r.label.startsWith('bi quan 0,136') && r.lev === 1 && r.window.startsWith('5–9'))!, l = rs.find((r) => r.label.startsWith('lạc quan') && r.lev === 1 && r.window.startsWith('5–9'))!;
    md.push(`| ${id === 'P2' ? 'P2 Martingale 1-1-2-4' : id === 'P1-dgt' ? 'P1 Grid 6 lưới + DGT reset' : 'P1 Grid 6 lưới tĩnh'} (1×) | ${a.n} | ${f1(a.expPct, 3)}% | [${f1(a.ciLo, 3)}, ${f1(a.ciHi, 3)}] | ${f1(a.pf, 2)} | ${f1(a.meanTotal)} | ${f1(a.maxDD)} (max) | ${f1(b.meanTotal)} | ${f1(l.meanTotal)} | ${v.pass ? 'ĐẠT' : 'không'} |`);
    continue;
  }
  const rows = id === 'E1' ? results[id]!.rows.filter((r) => r.label.endsWith('WF 14/10') && r.window.startsWith('1D')) : results[id]!.rows;
  const first = id === 'J1' || id === 'E1' ? '2020–2025' : 'D [';
  const a = rows.find((r) => r.label.startsWith('bi quan 0,136') && r.window.includes(first))!, b = rows.find((r) => r.label.startsWith('bi quan 0,136') && r.window.includes('5–9/2026'))!, l = rows.find((r) => r.label.startsWith('lạc quan') && r.window.includes('5–9/2026'))!;
  md.push(`| ${NAMES[id]}${id === 'J1' || id === 'E1' ? ' (cột D = 2020–2025)' : ''} | ${a.s.n} | ${a.s.ciKind === 'R' ? f1(a.s.expR, 3) + ' R' : f1(a.s.expPct, 3) + ' %'} | [${f1(a.s.ciLo, 3)}, ${f1(a.s.ciHi, 3)}] | ${f1(a.s.pf, 2)} | ${f1(a.s.totalPct)} | ${f1(a.s.ddPct)} | ${f1(b.s.totalPct)} | ${f1(l.s.totalPct)} | ${v.pass ? 'ĐẠT' : 'không'} |`);
}
md.push('');
md.push('**Lý do từng ứng viên (tiêu chí đặt trước):**');
md.push('');
for (const { id, v } of verdicts) md.push(`- ${NAMES[id] ?? id}: ${v.pass ? 'ĐẠT' : 'không đạt'} — ${v.why}.`);
md.push('');
md.push(`**Đạt tiêu chí:** ${verdicts.filter((x) => x.v.pass).map((x) => NAMES[x.id] ?? x.id).join(', ') || 'không ứng viên nào'}.`);
md.push('');
md.push('## Cách chạy chung');
md.push('');
md.push(`- Cửa sổ: D = [19/6/2026, 19/9/2026); "5–9/2026" = [1/5/2026, 19/9/2026) (D nằm trong); 2020–2025 = [1/1/2020, 1/1/2026). **Kỳ mù B [19/9, 19/10/2026) không được đọc** (assert trong mã: mọi nến nạp vào đều kiểm closeTime; funding kỳ B bị cắt). Kỳ C [1/1, 1/5/2026) chỉ dùng làm nến khởi động chỉ báo cho cửa sổ 5–9/2026 (900 nến 15m / 260 nến 1h / 210 nến 1d trước 1/5/2026).`);
md.push(`- Vũ trụ G/H: top-200 thanh khoản **theo thời điểm** — mỗi ngày xếp hạng trung bình quoteVolume 30 nến ngày đã đóng (data/history/1d, 885 mã kể cả đã hủy niêm yết, bỏ stablecoin); chỉ vào lệnh nếu mã đang trong top-200 ngày đó. ${members.length} mã từng lọt top-200 trong 5–9/2026; thiếu nến 15m: ${missing['15m'].length} mã (${missing['15m'].slice(0, 12).join(', ')}${missing['15m'].length > 12 ? '…' : ''}); thiếu 1h: ${missing['1h'].length}.`);
md.push('- Khung: G1 gốc 1m, G2–G5 gốc 5m, H gốc 3m → **chạy 15m** (không có 1m/5m cho vũ trụ này); G4/G5 cần 1h → gộp từ 15m. H1 chạy cả 15m và 1h, H2 chạy 1h, J1 1D, E1 1D (và 1h cho 5–9/2026).');
md.push('- Định cỡ: rủi ro 2% vốn tại cắt lỗ (G1/G2/G4 SL 5% → notional 40% vốn; G3 SL 50% → 4%; G5 stop cứng 8% → 25%; H1/H2 SL 1% → 200% vốn = đòn bẩy 2×). J1/E1 không SL → 100% số dư mỗi mã theo tác giả, lãi kép, tài khoản riêng từng mã; "tổng %" = trung bình các mã. P1/P2 theo tác giả (vốn M chia lưới / 8 phần).');
md.push(`- **Giới hạn danh mục (giả định báo cáo, không có trong kế hoạch): tối đa ${SLOTS} lệnh mở cùng lúc** (2% × 5 = 10% rủi ro mở, trùng luật bot hiện tại), lệnh đến trước lấy chỗ trước; lệnh hết chỗ bị bỏ (cột "Bỏ vì hết chỗ"). Không giới hạn thì H1 có hàng trăm lệnh/mã × 200 mã và "tổng %" thành con số vô nghĩa. Số lệnh thô (không giới hạn) ghi trong ngoặc.`);
md.push('- Lạc quan = tái hiện giả định của bộ backtest gốc: Freqtrade (đọc mã lõi freqtrade/strategy/interface.py: thứ tự exit-signal → stoploss → ROI → trailing; ROI theo lãi RÒNG đã trừ phí; custom_stoploss tính ở HIGH của nến rồi mới so với LOW); Hummingbot (TP ưu tiên khi cùng nến). Phí 0,1% khứ hồi (0,05%/chiều — hiểu "phí 0,1%" trong kế hoạch là khứ hồi để bản lạc quan luôn lạc quan hơn bản bi quan; Freqtrade mặc định 0,1%/lệnh còn tốn hơn).');
md.push('- Bi quan: trượt 0,02% mọi lệnh thị trường (vào, SL, thoát tín hiệu/thời gian); SL xét trước TP cùng nến và stop chỉ cập nhật bằng giá ĐÓNG nến trước; phí 0,068%/chiều (0,136% khứ hồi) và 0,2%/chiều (0,4%); funding thật mỗi 8h từ data/cache/funding (từ 3/2025) + BTC/ETH từ 12/2019; thiếu dữ liệu → long trả 0,01%/kỳ, short không nhận; giữ tối đa 30 ngày rồi đóng ở giá mở (J1/E1 vào lại ngay nếu tín hiệu còn → tốn thêm phí).');
md.push('- Chống nhìn trước: mọi chỉ báo tính cuốn chiếu từ nến đã đóng; chỉ báo khung 1h lấy nến 1h ĐÃ ĐÓNG tại giờ mở nến 15m (như merge_informative_pair); **shift test** chạy trong mã (cắt 60 nến cuối, tín hiệu phần còn lại phải y hệt) trên BTC/ETH/SOL cho mọi chiến lược — đều qua (nếu không, mã ném lỗi và không có báo cáo này).');
md.push('- Bootstrap: 2000 lần lấy mẫu lại theo khối ngày vào lệnh, seed cố định.');
md.push('');
md.push('## Nguồn đã tải (data/external, chỉ đọc, không chạy)');
md.push('');
md.push('| Repo | Commit | Licence | Dùng cho |');
md.push('|---|---|---|---|');
md.push('| freqtrade/freqtrade-strategies | f3340ce11f5bdf62f598522e64d1f5638eaa13f5 | GPL-3.0 | G1 BinHV45.py, G2 ClucMay72018.py, G4 ReinforcedQuickie.py |');
md.push('| PeetCrypto/freqtrade-stuff | f6c38def0b2fe01d8d42e47740cdeab53511527b | không có file licence | G3 SMAOffsetProtectOptV1.py |');
md.push('| phuchust/freqtrade_strategy | 4a0176ed284379a060262d5943394f2ca056d3d7 | không có file licence (README: "Don\'t use for live trading") | G5 BigZ04_TSL4.py |');
md.push('| freqtrade/freqtrade (mã lõi) | 7ff17f5f5ac2f7bbc55a2937fd493a68c9951647 | GPL-3.0 | xác nhận thứ tự thoát lệnh/giá khớp của bộ backtest |');
md.push('| jesse-ai/example-strategies | 7c91e0a37bf62165790120d730442e4f6eb00364 | MIT | J1 SMACrossover |');
md.push('| hummingbot/hummingbot | 9af100d6822da7d2d0291a906c730ef172284ee2 | Apache-2.0 | H1 bollinger_v1.py, H2 macd_bb_v1.py (ngưỡng 0,3/0,7 + triple barrier lấy từ trang ví dụ docs; mã hiện tại mặc định 0,0/1,0) |');
md.push('| arXiv 2506.11921 (Chen, Chen & Jang), Pionex help, arXiv 2602.10785 | — | — | P1, P2, E1 (không có mã, port theo mô tả) |');
md.push('');

for (const id of ['G1', 'G2', 'G3', 'G4', 'G5', 'H1-15m', 'H1-1h', 'H2', 'J1', 'E1']) {
  const r = results[id]!;
  md.push(`## ${NAMES[id]}`); md.push('');
  md.push(`Tác giả công bố: ${CLAIMS[id]}`); md.push('');
  for (const n of r.notes) md.push(`- ${n}`);
  if (id === 'G4') md.push('- Khác mã gốc: gốc nội suy SMA25(1h) theo thời gian tới nến 1h CHƯA đóng (nhìn trước); bản port dùng SMA25 của nến 1h đã đóng gần nhất và "đang tăng" = SMA giờ này > SMA giờ trước. Gốc tính BB trên typical price rồi ghi đè bằng BB trên close — giữ nguyên (BB close).');
  if (id === 'G5') md.push('- Port đủ 13 nhóm điều kiện mua OR (cond 13 bị tắt trong mã gốc), custom_stoploss (cứng −8% lãi ròng, nội suy 1,1%→4% khi lãi 1,6%→8%, trên 8% trượt theo lãi), không sell signal, ROI tắt. Bản lạc quan không giới hạn thời gian giữ.');
  if (id.startsWith('H')) md.push('- Một vị thế mỗi mã (Hummingbot mặc định cho phép 2 executor mỗi phía — không mô phỏng); tín hiệu còn thì vào lại ngay sau khi thoát. Trailing: kích hoạt khi lãi ròng ≥ 0,8% (H1) / 1% (H2), dừng tại lãi tốt nhất − 0,4%.');
  if (id === 'J1') md.push('- Lệnh "flip" = đóng Long mở Short (hoặc ngược lại) cùng giá mở; bản bi quan đóng sau 30 ngày rồi vào lại ngay nếu SMA vẫn cùng phía.');
  md.push(''); md.push(hdr); for (const row of r.rows) md.push(rowMd(row)); md.push('');
}
for (const [id, title] of [['P1-static', 'P1 Grid hình học 6 lưới tĩnh (Chen et al.)'], ['P1-dgt', 'P1 Grid hình học 6 lưới + DGT reset'], ['P2', 'P2 Martingale DCA 1-1-2-4 (Pionex Standard Mode)']] as const) {
  md.push(`## ${title}`); md.push('');
  if (id.startsWith('P1')) md.push('Tác giả công bố: Chen et al. chỉ có hình, không có bảng số; kết luận lý thuyết "kỳ vọng grid = 0 khi không phí, ÂM khi có phí"; DGT giảm drawdown; "IRR 60–70%" là backtest một giai đoạn. Tham số: n = 6 (7 mức), tỉ lệ dải 8 (BTC 10 000–80 000) → k = 1,414 mỗi mức, lưới đặt quanh giá mở đầu cửa sổ (mức 3 = giá vào; 3 khoảng trên giữ coin, 3 khoảng dưới giữ tiền). Phí bài gốc 0,08%/lệnh; ở đây dùng phí của từng bản. Không có giới hạn 30 ngày (grid không có "lệnh" để đóng); funding tính trên coin đang giữ. Mỗi lần bán ở mức trên = 1 lệnh thắng cơ học; kho coin chưa bán (bag) ghi thành 1 "lệnh" cuối kỳ để CI và PF không bị đánh lừa.');
  else md.push(`Tác giả công bố: Pionex (vendor): "xác suất lãi 50% → 75% → 87,5%…" theo số vòng, tự thừa nhận "even a 99.99% win rate" vẫn có thể mất sạch; Webot (bản white-label) backtest 15 tháng bull MDD −52,84%. Tham số: 8 phần vốn, mua 1-1-2-4 tại giá vào, −${DCA.step * 100}%, −${DCA.step * 200}%, −${DCA.step * 300}% so với giá vào (ví dụ 1% trong bài Pionex); **TP ${DCA.tp * 100}% trên giá trung bình là giả định** (Pionex không công bố mặc định); không SL. Bản bi quan đóng vòng sau 30 ngày (ghi lỗ) rồi mở vòng mới.`);
  md.push(''); md.push(`Mã (BTC, ETH + 20 thanh khoản nhất ngày đầu cửa sổ): D → ${gridSyms[WIN.D.name]!.join(', ')} (có nến 15m: ${gridRows[id]![0]!.symbols}/22); 5–9/2026 → ${gridSyms[WIN.M59.name]!.join(', ')} (có nến 15m: ${gridRows[id]![gridRows[id]!.length - 1]!.symbols}/22). Mã không có 15m là hợp đồng vàng/bạc/dầu/cổ phiếu token hóa hoặc mã ngoài vũ trụ đã tải. LABUSDT về ≈ 0 trong kỳ D (sập/hủy niêm yết), BEAT và BSB mất 80–95% — đúng loại rủi ro "ôm bag" của grid/DCA.`); md.push('');
  md.push(gHdr); for (const row of gridRows[id]!) md.push(gRowMd(row)); md.push('');
}
md.push('## Lưu ý và hạn chế');
md.push('');
md.push('- Khung 15m thay cho 1m/5m gốc: chiến lược scalping (G1–G3) được thiết kế cho nến 1–5 phút; trên 15m số tín hiệu ít hơn nhiều và hành vi khác — đây là hạn chế dữ liệu, không phải lỗi port. Kết luận chỉ áp cho 15m.');
md.push('- Vũ trụ là hợp đồng vĩnh cửu USDⓈ-M 2026 (Long-only vẫn giữ Long-only); các tham số hyperopt (0,978/1,006/5,638/−19,993/7-17-25…) được fit cho spot 2021 — đây là out-of-sample thật, kỳ vọng xấu đi là bình thường.');
md.push('- Giới hạn 5 lệnh mở cùng lúc là giả định báo cáo; lệnh bị bỏ vì hết chỗ không làm mã đó vào lại ở tín hiệu kế tiếp (xấp xỉ). Kỳ vọng/CI của lệnh thô (không giới hạn) có thể xem thêm ở cột "Lệnh (thô)" và JSON kết quả.');
md.push('- Funding trước 3/2025 chỉ có BTC/ETH; mã khác dùng mặc định 0,01%/kỳ cho long (bi quan) — ảnh hưởng J1 2020–2025.');
md.push('- J1/E1: tài khoản mỗi mã cháy (= 0, dừng) khi vốn MTM ≤ 0 — xảy ra với lệnh Short trên mã tăng > 2× (không đòn bẩy nhưng Short có thể lỗ quá 100%); "tổng %" trung bình các mã gồm cả mã đã cháy.');
md.push('- E1: bài gốc dùng nến phút với cửa sổ 7–28 NGÀY; trên 1D thì cửa sổ huấn luyện chỉ 7–14 nến nên chọn tham số gần như ngẫu nhiên — bản 1h 5–9/2026 gần bài gốc hơn nhưng chỉ có 4,5 tháng.');
md.push('- P2: TP 1% và bước 1% là giả định ghi trước khi chạy; thay đổi hai số này sẽ đổi kết quả nhưng không đổi bản chất (lãi nhỏ đều, lỗ dồn vào vòng chưa đóng).');
md.push('- DD của G/H tính trên vốn thực hiện (lệnh đã đóng) — chưa gồm lỗ tạm thời của lệnh đang mở; P1/P2/J1/E1 tính theo giá thị trường từng nến/ngày.');
md.push('- Số liệu tác giả (nếu có) đến từ sàn/giai đoạn/phí khác; đặt cạnh để so, không phải cùng điều kiện.');
md.push('');
mkdirSync(join(ROOT, 'docs/verification'), { recursive: true });
writeFileSync(OUT_DOC, md.join('\n'));
if (OUT_JSON) writeFileSync(OUT_JSON, JSON.stringify({ results, gridRows, verdicts, missing, members, gridSyms }, null, 1));
log(`xong: ${OUT_DOC} (${((Date.now() - t0) / 60000).toFixed(1)} phút)`);
void iso; void HOUR;
export {};
