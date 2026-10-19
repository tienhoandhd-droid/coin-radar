// Khung thử nghiệm có kỷ luật trên kỳ phát triển D (kế hoạch 2, Task 5 + 6, phục vụ Task 8 "Quy trình mô phỏng MÙ").
// Mỗi lần chạy = MỘT biến thể (đổi một thứ so với gốc): mô phỏng (hoặc nhận kết quả mô phỏng có sẵn của kỳ D) → thống kê (stats.ts)
// + quy nguyên nhân lệnh thua (attribution.ts) + vào lệnh ngẫu nhiên để đối chiếu + so theo cặp với gốc → ghi
// output/experiments/<biến thể>/<chế độ>/ và thêm một dòng vào docs/verification/nhat-ky-thu.md (số lần thử k → Bonferroni 0,05/k).
//
//   node backtest/experiment.ts --variant <tên> [--modes swing,fast] [--from-output swing=DIR,fast=DIR] [--period dev]
//                               [--resamples 5000] [--seed 20261019] [--random-reps 200] [--dir data/cache] [--list]
//
// CHỈ kỳ D: --period khác "dev" bị từ chối (kỳ mù B chỉ chạy một lần sau khi khóa luật, bằng simulate-run/replay, không qua đây).
// Biến thể "chưa nối": cần hook trong bộ mô phỏng/lõi (ghi trong `hooks`) — CLI từ chối chạy thay vì âm thầm chạy ra kết quả gốc.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { CONFIG } from '../packages/core/config.ts';
import { marketRegime } from '../packages/core/regime.ts';
import { parseEvents } from '../packages/core/events.ts';
import type { ExitPolicy } from '../packages/core/exit.ts';
import type { Candle, Mode } from '../packages/core/types.ts';
import { DEV_PERIOD, type FundingRow } from './replay.ts';
import { loadCandles, DAY, HOUR, INTERVAL_MS, type Interval } from './data.ts';
import type { TradeRecord } from './simulate.ts';
import { computeStats, groupStatsBy, pairedComparison, randomEntryBaseline, bonferroniAlpha, type StatTrade, type RandomTemplate, type Stats, type CI } from './stats.ts';
import { attributeLoss, summarizeAttribution, DEFAULT_ATTR, CATEGORIES, CATEGORY_LABEL, type AttrContext, type Attribution } from './attribution.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const LOG_PATH = 'docs/verification/nhat-ky-thu.md';
const MODES: readonly Mode[] = ['swing', 'fast'];

// ---------------------------------------------------------------- danh mục biến thể ------------------------------------------------
export type Variant = {
  name: string; proposal: number | null; change: string; rationale: string; wired: boolean;
  run: { policy: ExitPolicy; filter: 'A' | 'all' } | null; // đã nối: tham số mô phỏng hiện có
  configOverride: Record<string, unknown>; // chưa nối: khóa cấu hình → giá trị (CẦN hook H0 + hook riêng)
  hooks: string[];
};

// H0 — hook chung bộ mô phỏng cần (KHÔNG tự thêm ở đây: simulate-run.ts đang do agent khác sửa): RunOptions nhận
// `configOverride?: Record<string, unknown>` và runSimulation áp nó vào CONFIG/COMMON trong lúc chạy (lõi đọc CONFIG/COMMON cấp module,
// chưa có tham số cấu hình) — vd. `const restore = applyConfigOverride(o.configOverride); try { … } finally { restore(); }`.
const H0 = 'H0: simulate-run.ts RunOptions.configOverride → runSimulation áp vào CONFIG/COMMON trong lúc chạy rồi trả lại (try/finally)';

const unwired = (name: string, proposal: number | null, change: string, rationale: string, configOverride: Record<string, unknown>, hooks: string[]): Variant =>
  ({ name, proposal, change: `${change} — chưa nối`, rationale, wired: false, run: null, configOverride, hooks: [H0, ...hooks] });

const RESEARCH = 'reports/Nghiên cứu cải thiện lợi nhuận.md';
const list: Variant[] = [
  { name: 'baseline', proposal: null, change: 'gốc: mọi Đạt, thoát C2 (TP1 50% + trailing)', rationale: 'đối chứng cho mọi biến thể', wired: true,
    run: { policy: 'C2', filter: 'all' }, configOverride: {}, hooks: [] },
  { name: 'exit-A0', proposal: null, change: 'thoát A0 (TP1/TP2/TP3 50/30/20, dời SL sau TP1)', rationale: 'Task 4: so cách thoát với C2 (đã có trong bộ mô phỏng)',
    wired: true, run: { policy: 'A0', filter: 'all' }, configOverride: {}, hooks: [] },
  unwired('tp1-any-strength', null, 'TP1 tại vùng đầu tiên bất kể độ mạnh (B3b)', 'Task 4: biến thể chọn TP1, tính vào k Bonferroni',
    { 'COMMON.zones.tp1SkipWeak': false }, ['khóa đã có (zones.ts đọc lúc gọi) — chỉ cần H0']),
  ...[0.1, 0.15].map((k) => unwired(`p1-cost-floor-k${k.toFixed(2).replace('.', '')}`, 1, `#1 sàn chi phí: bỏ kế hoạch nếu (phí vào + phí ra ở SL + funding dự kiến)/d > ${k}; phí maker/taker tách riêng`,
    `${RESEARCH} #1 — phí ăn 0,32R/lệnh ở Lướt nhanh`, { 'COMMON.risk.maxCostR': k, 'COMMON.fees': { maker: 0.02, taker: 0.05 } },
    ['khóa mới COMMON.risk.maxCostR + kiểm trong packages/bot/planner.ts (từ chối kế hoạch)', 'simulate.ts SimCost tách makerPct/takerPct: limit vào + TP1 reduce-only = maker, SL/trailing/market = taker + trượt nền'])),
  unwired('p2-fast-4h', 2, '#2 Lướt nhanh lên khung xu hướng 4H / vào lệnh 1H, hạn +1R 48 giờ, giữ tối đa 7 ngày', `${RESEARCH} #2 — khung 15m lợi thế < phí`,
    { 'CONFIG.fast.trendInterval': '4h', 'CONFIG.fast.entryInterval': '1h', 'CONFIG.fast.timeStopHours': 48, 'CONFIG.fast.maxHoldHours': 168 },
    ['types ModeConfig: trendInterval thêm "4h", entryInterval thêm "1h" (hiện chỉ "1h"|"1d" / "15m"|"4h")', 'replay.ts decisionTimes + simulate-run.ts ENTRY_BAR_MS theo CONFIG[mode].entryInterval thay vì cố định 15m']),
  unwired('p2-fast-off', 2, '#2(a) tắt hẳn Lướt nhanh (0 lệnh Lướt nhanh, chỉ Swing)', `${RESEARCH} #2(a)`, { 'modes.fast.enabled': false },
    ['cờ bật/tắt chế độ trong bot/scanner (mô phỏng: chỉ cần không chạy --mode fast — kết quả = 0 lệnh, so ở cấp danh mục)']),
  ...[20, 55].map((n) => unwired(`p3-breakout-n${n}`, 3, `#3 cho phép lệnh phá vỡ khi không có TP1: đóng 1D > đỉnh đóng ${n} ngày, 100% trailing (kích hoạt +1R, callback 3×ATR 4H), giữ ≤ 30 ngày, Long Swing`,
    `${RESEARCH} #3 — planner Swing từ chối 1 179 lần "không có TP1"`, { 'COMMON.breakout': { enabled: true, donchianDays: n, trailAtr4h: 3, maxHoldDays: 30, sides: ['long'] } },
    ['packages/core/plan.ts: kế hoạch không TP1 khi phá đỉnh Donchian N ngày', 'packages/bot/planner.ts: nhận kế hoạch không TP1 (hiện từ chối "Không có TP1")', 'exit.ts/simulate.ts: chính sách thoát mới TRAIL_ONLY (100% trailing, không TP cố định)'])),
  unwired('p4-trend-only', 4, '#4 Swing không mở lệnh mới khi chế độ Đi ngang', `${RESEARCH} #4 — lợi thế theo xu hướng tập trung khi có xu hướng`,
    { 'COMMON.regime.allowSidewaysSwing': false }, ['khóa mới + kiểm trong packages/core/gates.ts G-01 (regimeCheck): sideways & mode swing → chặn']),
  unwired('p5-short-asym', 5, '#5 Short chỉ khi chế độ Xuống + RS 14 ngày thuộc 20% yếu nhất + funding TB 3 ngày ≥ 0', `${RESEARCH} #5 — Short PF 0,64 (Swing) trên D`,
    { 'COMMON.shortRules': { requireDownRegime: true, rsBottomPct: 20, rsDays: 14, minFunding3d: 0 } },
    ['gates.ts G-01: bỏ ngoại lệ "ngược chế độ" cho Short khi bật', 'xếp hạng RS theo mặt cắt ngang tại t (run-scan)', 'replay.ts đưa lịch sử funding 3 ngày (chỉ kỳ đã chốt ≤ t) vào input máy quét']),
  ...([[30, 2], [30, 3], [50, 2], [50, 3]] as const).map(([pct, m]) => unwired(`p6-c3-tp${pct}-m${m}`, 6, `#6 thoát C3: TP1 chốt ${pct}%, phần còn lại trailing theo giá ĐÓNG 4H, dừng = max(hòa vốn+phí, đỉnh đóng − ${m}×ATR(14) 4H)`,
    `${RESEARCH} #6 — C2 ≈ A0 trên D, callback C2 hẹp`, { policy: 'C3', 'COMMON.exitC3': { tp1Pct: pct, trailAtr4h: m } },
    ['packages/core/exit.ts: ExitPolicy thêm "C3" (hiện "A0" | "C2")', 'simulate.ts: trailing kiểm trên giá đóng nến 4H (đặt lại STOP_MARKET mỗi nến 4H)', 'packages/bot/planner.ts exitSplit: tỉ lệ TP1 theo chính sách'])),
  ...[100, 150].map((n) => unwired(`p7-swing-top${n}`, 7, `#7 Swing chỉ xét ${n} hợp đồng thanh khoản nhất + Long cần RS 14 ngày thuộc nửa trên`, `${RESEARCH} #7 — quán tính chỉ ở coin lớn`,
    { 'COMMON.swingUniverseSize': n, 'COMMON.swingLongRsTopHalf': true },
    ['scanner/run-scan.ts: cắt universe cho swing như fastUniverseSize (dòng `if (mode === \'fast\') universe = …`)', 'backtest/fetch-pit.ts: thứ hạng point-in-time cho swing', 'gates: Long cần RS ≥ trung vị nhóm'])),
  unwired('p8-funding-xs70', 8, '#8 lọc funding mặt cắt ngang: Long khi phân vị funding TB 7 ngày ≤ 70%, Short khi ≥ 70%', `${RESEARCH} #8 — basis/carry là tín hiệu mặt cắt ngang`,
    { 'COMMON.fundingXsPct': 70 }, ['replay.ts đưa funding 7 ngày (đã chốt ≤ t) của mọi hợp đồng vào input', 'gates: kiểm phân vị funding theo chiều lệnh']),
];
export const VARIANTS: Record<string, Variant> = Object.fromEntries(list.map((v) => [v.name, v]));

export function requireWired(name: string): Variant {
  const v = VARIANTS[name];
  if (v === undefined) throw new Error(`không có biến thể "${name}" — xem --list`);
  if (!v.wired) throw new Error(`biến thể "${name}" chưa nối — bộ mô phỏng/lõi cần:\n  - ${v.hooks.join('\n  - ')}`);
  return v;
}

export function assertDevPeriod(period: string): void {
  if (period === 'blind') throw new Error('Từ chối: experiment.ts không chạy kỳ mù B (chỉ chạy một lần sau khi khóa luật, theo "Quy trình mô phỏng MÙ")');
  if (period !== 'dev') throw new Error(`experiment.ts chỉ chạy kỳ D (--period dev), nhận "${period}"`);
}

export function parseFromOutput(raw: string): Partial<Record<Mode, string>> {
  const out: Partial<Record<Mode, string>> = {};
  for (const part of raw.split(',')) {
    const [k, v] = part.split('=');
    if ((k !== 'swing' && k !== 'fast') || v === undefined || v === '') throw new Error(`--from-output dạng swing=DIR,fast=DIR, nhận "${part}"`);
    out[k] = v;
  }
  return out;
}

type SourceSummary = { period?: unknown; mode?: unknown; policy?: unknown; filter?: unknown; window?: { start?: unknown; end?: unknown } };
export function validateSource(s: SourceSummary, v: Variant, mode: Mode): void {
  const st = Date.parse(String(s.window?.start)), en = Date.parse(String(s.window?.end));
  if (s.period !== 'dev' || !(st >= DEV_PERIOD.start) || !(en <= DEV_PERIOD.end) || !(st < en)) throw new Error(`kết quả nguồn không phải kỳ D [${new Date(DEV_PERIOD.start).toISOString()}, ${new Date(DEV_PERIOD.end).toISOString()})`);
  if (s.mode !== mode) throw new Error(`kết quả nguồn là chế độ "${String(s.mode)}", cần "${mode}"`);
  if (v.run === null) throw new Error(`biến thể "${v.name}" chưa nối — không có kết quả nguồn hợp lệ`);
  if (s.policy !== v.run.policy || s.filter !== v.run.filter) throw new Error(`kết quả nguồn ${String(s.policy)}/${String(s.filter)} không khớp biến thể "${v.name}" (${v.run.policy}/${v.run.filter})`);
}

// ---------------------------------------------------------------- nhật ký thử --------------------------------------------------------
export const LOG_HEADER = `# Nhật ký thử trên kỳ D

Kế hoạch 2, "Quy trình mô phỏng MÙ": mọi lần thử thay đổi (luật vào lệnh, bộ lọc, cách thoát) trên kỳ phát triển D
[2026-06-21, 2026-09-19) đều ghi ở đây — kể cả lần không nhận. Ghi tự động bởi \`node backtest/experiment.ts\`.

- **k (số lần thử)** = số biến thể KHÁC gốc đã có trong bảng (tính cả lần đang ghi). Khoảng tin cậy ΔR dùng Bonferroni 95% → 1 − 0,05/k.
- **Kỳ vọng R** sau phí + trượt + funding, khoảng tin cậy bootstrap 95% (hạt cố định). **ΔR** = biến thể − gốc trên cùng signalId đã khớp ở cả hai.
- **Tiêu chí nhận:** cận dưới CI Bonferroni của ΔR > 0, sụt giảm lớn nhất không tệ hơn gốc, ≥ 30 lệnh và ≥ 30 cặp. Thay đổi luật vào lệnh/bộ lọc
  vẫn phải trình người dùng duyệt trước khi sửa \`config.ts\`. Rủi ro người dùng chốt giữ nguyên (2%/lệnh, ≤ 10 lệnh, ≤ 10% tổng rủi ro, cầu chì).

| Ngày | Biến thể | Chế độ | Thay đổi | Lý do | Lệnh | Kỳ vọng R [CI 95%] | ΔR so gốc [CI Bonferroni] (k) | Tổng lãi % | PF | Sụt lớn nhất % | Quyết định |
|---|---|---|---|---|---|---|---|---|---|---|---|
`;

export function logVariants(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 4 || !/^\d{4}-\d{2}-\d{2}$/.test(cells[1] ?? '')) continue;
    out.push(cells[2]!);
  }
  return out;
}

export function countTrials(text: string, variant: string): number {
  const s = new Set(logVariants(text).filter((v) => v !== 'baseline'));
  if (variant !== 'baseline') s.add(variant);
  return Math.max(1, s.size);
}

export type LogRow = { date: string; variant: string; mode: string; change: string; rationale: string; trades: number; expectancy: string; delta: string; totalPct: string; pf: string; maxDd: string; decision: string };
export function formatLogRow(r: LogRow): string {
  const cell = (x: string | number) => String(x).replace(/\|/g, '/').replace(/\n/g, ' ');
  return `| ${[r.date, r.variant, r.mode, r.change, r.rationale, r.trades, r.expectancy, r.delta, r.totalPct, r.pf, r.maxDd, r.decision].map(cell).join(' | ')} |\n`;
}

export function decide(a: { baseline: boolean; trades: number; matched: number; adjLo: number; dd: number; baseDd: number }): string {
  if (a.baseline) return 'gốc (đối chứng)';
  if (a.trades < 30 || a.matched < 30) return `không kết luận được (< 30 lệnh hoặc < 30 cặp: ${a.trades} lệnh, ${a.matched} cặp)`;
  if (!(a.adjLo > 0)) return 'không nhận (cận dưới CI Bonferroni của ΔR ≤ 0)';
  if (a.dd > a.baseDd) return 'không nhận (DD tệ hơn gốc)';
  return 'đạt tiêu chí D (luật vào lệnh/bộ lọc: chờ người dùng duyệt)';
}

// ---------------------------------------------------------------- định dạng --------------------------------------------------------
const vn = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace('-', '−') : x === Infinity ? '∞' : '—');
const ci = (c: CI, d = 3) => `[${vn(c.lo, d)}; ${vn(c.hi, d)}]`;

// ---------------------------------------------------------------- đọc dữ liệu (I/O) -----------------------------------------------
type RunFiles = { trades: TradeRecord[]; curve: Array<{ t: number; equity: number }>; summary: Record<string, unknown> & { capital: number; maxDdPct: number; totalReturnPct: number; finalEquity: number } };

function readRun(dir: string): RunFiles {
  const trades = readFileSync(join(dir, 'trades.jsonl'), 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as TradeRecord);
  const curve = JSON.parse(readFileSync(join(dir, 'equity.json'), 'utf8')) as RunFiles['curve'];
  const summary = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')) as RunFiles['summary'];
  if (!Array.isArray(curve)) throw new Error(`${dir}/equity.json không phải mảng`);
  return { trades, curve, summary };
}

// Bộ đọc nến/funding/OI cho kỳ D — mọi cửa sổ cắt tại DEV_PERIOD.end (không đọc nến/funding/OI của kỳ mù B). Lỗi thiếu dữ liệu được
// GHI vào dataErrors (và phép kiểm tương ứng thành "không đủ dữ liệu"), không bỏ qua im lặng.
function createData(dir: string) {
  const dataErrors: string[] = [];
  const cache = new Map<string, readonly Candle[]>();
  function bars(symbol: string, iv: Interval, warmBars: number): readonly Candle[] {
    const key = `${symbol}|${iv}|${warmBars}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    let c: readonly Candle[] = [];
    try {
      c = loadCandles(dir, symbol, iv, DEV_PERIOD.start - warmBars * INTERVAL_MS[iv], DEV_PERIOD.end).candles;
    } catch (e) {
      dataErrors.push(`${symbol} ${iv}: ${e instanceof Error ? e.message : String(e)}`);
    }
    cache.set(key, c);
    return c;
  }
  function funding(symbol: string): FundingRow[] {
    const p = join(dir, 'funding', symbol + '.json');
    if (!existsSync(p)) { dataErrors.push(`${symbol}: thiếu tệp funding`); return []; }
    const raw = JSON.parse(readFileSync(p, 'utf8')) as { rows?: FundingRow[] };
    if (!Array.isArray(raw.rows)) throw new Error(`${p}: thiếu mảng rows`);
    return raw.rows.filter((r) => r.fundingTime < DEV_PERIOD.end);
  }
  function oi(symbol: string): Array<{ t: number; oi: number }> | null {
    const p = join(dir, 'oi', symbol + '.json');
    if (!existsSync(p)) return null;
    const raw = JSON.parse(readFileSync(p, 'utf8')) as { rows?: Array<{ timestamp: number; sumOpenInterest: number }> };
    if (!Array.isArray(raw.rows)) throw new Error(`${p}: thiếu mảng rows`);
    const rows = raw.rows.filter((r) => r.timestamp < DEV_PERIOD.end).map((r) => ({ t: r.timestamp, oi: r.sumOpenInterest }));
    return rows.length > 0 ? rows : null; // Binance chỉ giữ 30 ngày → kỳ D không có OI
  }
  return { bars, funding, oi, dataErrors };
}

// Chế độ thị trường (packages/core/regime.ts) tại giờ vào lệnh từ nến BTC 1D đã đóng
function regimeTagger(btcDaily: readonly Candle[]) {
  const memo = new Map<number, string>();
  return (t: number): string => {
    const day = Math.floor(t / DAY);
    let r = memo.get(day);
    if (r === undefined) { r = marketRegime(btcDaily.filter((c) => c.closeTime < t)).regime; memo.set(day, r); }
    return r;
  };
}

const randomInterval: Record<Mode, Interval> = { swing: '1h', fast: '15m' };

// ---------------------------------------------------------------- một chế độ ---------------------------------------------------------
async function runMode(a: { v: Variant; mode: Mode; src: string | undefined; outDir: string; cacheDir: string; boot: { resamples: number; seed: number; alpha: number };
  k: number; randomReps: number; data: ReturnType<typeof createData>; regimeAt: (t: number) => string; events: ReturnType<typeof parseEvents>; btc1h: readonly Candle[] }) {
  const { v, mode, outDir } = a;
  mkdirSync(outDir, { recursive: true });
  if (a.src !== undefined) {
    const src = resolvePath(REPO_ROOT, a.src);
    validateSource(JSON.parse(readFileSync(join(src, 'summary.json'), 'utf8')) as SourceSummary, v, mode);
    for (const f of ['trades.jsonl', 'equity.json', 'summary.json']) copyFileSync(join(src, f), join(outDir, f));
    writeFileSync(join(outDir, 'source.json'), JSON.stringify({ from: src, copiedAt: new Date().toISOString() }, null, 2));
  } else {
    const w = requireWired(v.name);
    // nạp động: simulate-run.ts nặng (máy quét) và đang được sửa song song — chỉ cần khi thật sự mô phỏng
    const sim = await import('./simulate-run.ts');
    const { loadContracts } = await import('./replay.ts');
    const opts = { dir: a.cacheDir, mode, window: { ...DEV_PERIOD }, filter: w.run!.filter, policy: w.run!.policy, capital: 10_000, pauseHours: 24 };
    const res = await sim.runSimulation({ ...opts, contracts: await loadContracts(a.cacheDir), events: a.events, fetcher: null, log: (m) => console.log(`  [${mode}] ${m}`) });
    writeFileSync(join(outDir, 'trades.jsonl'), res.done.map((r) => JSON.stringify(r)).join('\n') + '\n');
    writeFileSync(join(outDir, 'equity.json'), JSON.stringify(res.book.curve.filter((_, i, arr) => i === arr.length - 1 || arr[i + 1]!.t !== arr[i]!.t)));
    writeFileSync(join(outDir, 'summary.json'), JSON.stringify(sim.report(res, opts), null, 2));
  }
  const run = readRun(outDir);
  const at = (s: string | null, fallback: string) => Date.parse(s ?? fallback);
  const trades: StatTrade[] = run.trades.map((r) => ({ ...r, regime: a.regimeAt(at(r.entryTime, r.placedAt)), variant: v.name }));
  const filled = run.trades.filter((r) => r.filled);

  // Thống kê
  const overall = computeStats(trades, { ...a.boot, equity: { capital: run.summary.capital, curve: run.curve } });
  const overallAdj = computeStats(trades, { ...a.boot, alpha: bonferroniAlpha(a.boot.alpha, a.k) });
  const groups = groupStatsBy(trades, ['mode', 'side', 'grade', 'kind', 'regime', 'variant'], a.boot);

  // Vào lệnh ngẫu nhiên cùng mã/chiều/thời gian giữ/khoảng SL/phí R
  const templates: RandomTemplate[] = filled.filter((r) => r.entryTime !== null && r.exitTime !== null && r.avgEntry !== null && r.riskAtFill > 0).map((r) => ({
    symbol: r.symbol, side: r.side, holdMs: Date.parse(r.exitTime!) - Date.parse(r.entryTime!), stopPct: Math.abs(r.avgEntry! - r.stop) / r.avgEntry!, feeR: r.costs / r.riskAtFill,
  }));
  const random = randomEntryBaseline(templates, (t) => { const b = a.data.bars(t.symbol, randomInterval[mode], 0); return b.length > 0 ? b : null; },
    { reps: a.randomReps, seed: a.boot.seed, alpha: a.boot.alpha });

  // Quy nguyên nhân lệnh thua
  const entryIv = CONFIG[mode].entryInterval as Interval, trendIv = CONFIG[mode].trendInterval as Interval;
  const attributions: Attribution[] = [];
  for (const r of filled) {
    if (!(r.pnl < 0)) continue;
    const cx: AttrContext = {
      events: a.events, btc1h: a.btc1h, oi: a.data.oi(r.symbol), funding: a.data.funding(r.symbol),
      entryBars: a.data.bars(r.symbol, entryIv, 40), entryIntervalMs: INTERVAL_MS[entryIv], trendBars: a.data.bars(r.symbol, trendIv, 60), periodEnd: DEV_PERIOD.end,
    };
    const at1 = attributeLoss({ ...r, mode }, cx, DEFAULT_ATTR);
    if (at1 !== null) attributions.push(at1);
  }
  const attrSummary = summarizeAttribution(attributions);

  // So theo cặp với gốc
  let paired: ReturnType<typeof pairedComparison> | null = null;
  let baseDd = NaN;
  if (v.name !== 'baseline') {
    const baseDir = resolvePath(REPO_ROOT, 'output/experiments/baseline', mode);
    if (!existsSync(join(baseDir, 'trades.jsonl'))) throw new Error(`chưa có kết quả gốc ${baseDir} — chạy --variant baseline trước`);
    const base = readRun(baseDir);
    paired = pairedComparison(base.trades, run.trades, { ...a.boot, trials: a.k });
    baseDd = base.summary.maxDdPct;
  }

  writeFileSync(join(outDir, 'stats.json'), JSON.stringify({ variant: v.name, mode, k: a.k, boot: a.boot, overall, overallBonferroni: { alpha: bonferroniAlpha(a.boot.alpha, a.k), expectancyCI: overallAdj.expectancyCI },
    simSummaryCheck: { totalReturnPct: run.summary.totalReturnPct, maxDdPct: run.summary.maxDdPct }, groups, random, paired }, null, 2));
  writeFileSync(join(outDir, 'attribution.json'), JSON.stringify({ config: DEFAULT_ATTR, summary: attrSummary, dataErrors: a.data.dataErrors.slice(0, 200), trades: attributions }, null, 2));

  // In ra
  const s = overall;
  console.log(`\n## ${v.name} — ${mode} (${s.trades} lệnh đã khớp, k = ${a.k})`);
  console.log(`Kỳ vọng ${vn(s.expectancyR, 3)}R CI95 ${ci(s.expectancyCI)} | CI Bonferroni (α=${vn(bonferroniAlpha(a.boot.alpha, a.k), 4)}) ${ci(overallAdj.expectancyCI)}`);
  console.log(`Thắng ${vn(s.winRate * 100, 1)}% [${vn(s.winCI.lo * 100, 1)}; ${vn(s.winCI.hi * 100, 1)}] | chạm TP1 ${vn(s.tp1Rate * 100, 1)}% | PF ${vn(s.profitFactor)} | tổng lãi ${vn(s.totalReturnPct!)}% (sim ${vn(run.summary.totalReturnPct)}%)`);
  console.log(`Sụt lớn nhất ${vn(s.maxDrawdownPct!)}% vốn (sim ${vn(run.summary.maxDdPct)}%), ${vn(s.maxDrawdownR)}R | chuỗi thua ${s.longestLosingStreak} | phí ${vn(s.avgFeesR, 3)}R/lệnh | funding ${vn(s.avgFundingR, 3)}R/lệnh`);
  console.log(`Vào ngẫu nhiên (${random.reps} lần × ${random.tradesPerRep} lệnh, bỏ ${random.skippedTemplates}): ${vn(random.meanExpectancyR, 3)}R, 95% ${ci(random)}`);
  if (paired !== null) console.log(`ΔR theo cặp ${vn(paired.meanDeltaR, 3)} (${paired.matched} cặp) CI95 ${ci(paired.ci)} | Bonferroni k=${a.k} ${ci(paired.ciAdj)} | ${paired.note}`);
  console.log('\n| Nhóm | Lệnh | Thắng % [Wilson] | Kỳ vọng R [bootstrap] | PF | DD R | Chuỗi thua | Phí R |\n|---|---|---|---|---|---|---|---|');
  for (const g of groups.filter((x) => !x.key.includes('|') && !/^(mode|variant)=/.test(x.key))) {
    const t: Stats = g.stats;
    console.log(`| ${g.key} | ${t.trades}${t.smallSample ? '*' : ''} | ${vn(t.winRate * 100, 1)} [${vn(t.winCI.lo * 100, 1)}; ${vn(t.winCI.hi * 100, 1)}] | ${vn(t.expectancyR, 3)} ${ci(t.expectancyCI)} | ${vn(t.profitFactor)} | ${vn(t.maxDrawdownR, 1)} | ${t.longestLosingStreak} | ${vn(t.avgFeesR, 3)} |`);
  }
  console.log('\n| Nguyên nhân thua | Lệnh | R mất | ' + Object.keys(attrSummary.byModeSide).sort().map((k2) => `${k2} (lệnh / R)`).join(' | ') + ' |');
  console.log('|---|---|---|' + Object.keys(attrSummary.byModeSide).map(() => '---|').join(''));
  for (const c of CATEGORIES) {
    const cell = attrSummary.byCategory[c];
    console.log(`| ${CATEGORY_LABEL[c]} | ${cell.count} | ${vn(cell.rLost, 1)} | ` + Object.keys(attrSummary.byModeSide).sort().map((k2) => { const x = attrSummary.byModeSide[k2]![c]; return `${x.count} / ${vn(x.rLost, 1)}`; }).join(' | ') + ' |');
  }
  const swept = attributions.filter((x) => x.category === 'stop_tight' && /quét SL/.test(x.evidence)).length;
  console.log(`Tổng ${attrSummary.total.count} lệnh thua, ${vn(attrSummary.total.rLost, 1)}R. Nhóm (5): ${swept} bị quét SL, còn lại SL < 1×ATR. Mọi kiểm "có" (chồng lấn): ${JSON.stringify(attrSummary.flagged)}. Không đủ dữ liệu: ${JSON.stringify(attrSummary.insufficient)}. Lỗi dữ liệu: ${a.data.dataErrors.length}`);

  return {
    row: {
      date: new Date().toISOString().slice(0, 10), variant: v.name, mode, change: v.change, rationale: v.rationale, trades: s.trades,
      expectancy: `${vn(s.expectancyR, 3)} ${ci(s.expectancyCI)}`,
      delta: paired === null ? '—' : `${vn(paired.meanDeltaR, 3)} ${ci(paired.ciAdj)} (k=${a.k}, ${paired.matched} cặp)`,
      totalPct: vn(run.summary.totalReturnPct), pf: vn(s.profitFactor), maxDd: vn(run.summary.maxDdPct),
      decision: decide({ baseline: v.name === 'baseline', trades: s.trades, matched: paired?.matched ?? 0, adjLo: paired?.ciAdj.lo ?? NaN, dd: run.summary.maxDdPct, baseDd }),
    } satisfies LogRow,
  };
}

async function main() {
  const { values: o } = parseArgs({ options: {
    variant: { type: 'string' }, modes: { type: 'string', default: 'swing,fast' }, 'from-output': { type: 'string' }, period: { type: 'string', default: 'dev' },
    resamples: { type: 'string', default: '5000' }, seed: { type: 'string', default: '20261019' }, 'random-reps': { type: 'string', default: '200' },
    dir: { type: 'string', default: 'data/cache' }, list: { type: 'boolean', default: false },
  } });
  if (o.list) {
    for (const v of list) console.log(`${v.wired ? 'ĐÃ NỐI ' : 'CHƯA NỐI'} ${v.name.padEnd(20)} ${v.change}${v.hooks.length > 0 ? '\n           cần: ' + v.hooks.join('\n                ') : ''}`);
    return;
  }
  assertDevPeriod(o.period!);
  if (o.variant === undefined) throw new Error('thiếu --variant (xem --list)');
  const v = VARIANTS[o.variant];
  if (v === undefined) throw new Error(`không có biến thể "${o.variant}" — xem --list`);
  const fromOutput = o['from-output'] === undefined ? {} : parseFromOutput(o['from-output']);
  if (Object.keys(fromOutput).length === 0) requireWired(v.name);
  const modes = o.modes!.split(',').map((m) => m.trim());
  for (const m of modes) if (m !== 'swing' && m !== 'fast') throw new Error(`--modes chỉ nhận swing,fast — nhận "${m}"`);
  const num = (x: string, name: string, int = true) => { const n = Number(x); if (!(n > 0) || (int && !Number.isInteger(n))) throw new Error(`--${name} không hợp lệ: "${x}"`); return n; };
  const boot = { resamples: num(o.resamples!, 'resamples'), seed: num(o.seed!, 'seed'), alpha: 0.05 };
  const randomReps = num(o['random-reps']!, 'random-reps');

  const logPath = join(REPO_ROOT, LOG_PATH);
  const logText = existsSync(logPath) ? readFileSync(logPath, 'utf8') : LOG_HEADER;
  const k = countTrials(logText, v.name);
  const cacheDir = o.dir!;
  const data = createData(cacheDir);
  const btcDaily = loadCandles(cacheDir, 'BTCUSDT', '1d', DEV_PERIOD.start - 300 * DAY, DEV_PERIOD.end).candles;
  const btc1h = loadCandles(cacheDir, 'BTCUSDT', '1h', DEV_PERIOD.start - 24 * HOUR, DEV_PERIOD.end).candles;
  const events = parseEvents(JSON.parse(readFileSync(join(REPO_ROOT, 'data/events/events.json'), 'utf8')));
  const regimeAt = regimeTagger(btcDaily);

  const rows: LogRow[] = [];
  for (const mode of modes as Mode[]) {
    const out = await runMode({ v, mode, src: fromOutput[mode], outDir: resolvePath(REPO_ROOT, 'output/experiments', v.name, mode), cacheDir, boot, k, randomReps, data, regimeAt, events, btc1h });
    rows.push(out.row);
  }
  if (!existsSync(logPath)) writeFileSync(logPath, LOG_HEADER);
  for (const r of rows) appendFileSync(logPath, formatLogRow(r));
  console.log(`\nĐã ghi output/experiments/${v.name}/ và thêm ${rows.length} dòng vào ${LOG_PATH} (k = ${k})`);
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    console.error(`LỖI: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    process.exit(1);
  });
}
