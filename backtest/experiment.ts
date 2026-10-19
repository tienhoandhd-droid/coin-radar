// Khung thử nghiệm có kỷ luật trên kỳ phát triển D (kế hoạch 2, Task 5 + 6, phục vụ Task 8 "Quy trình mô phỏng MÙ").
// Mỗi lần chạy = MỘT biến thể (đổi một thứ so với gốc): mô phỏng (hoặc nhận kết quả mô phỏng có sẵn của kỳ D) → thống kê (stats.ts)
// + quy nguyên nhân lệnh thua (attribution.ts) + vào lệnh ngẫu nhiên để đối chiếu + so với gốc → ghi
// output/experiments/<biến thể>/<chế độ>/ và ghi (hoặc thay) dòng (biến thể, chế độ) trong docs/verification/nhat-ky-thu.md.
//
//   node backtest/experiment.ts --variant <tên> [--modes swing,fast] [--from-output swing=DIR,fast=DIR] [--period dev]
//                               [--resamples 5000] [--seed 20261019] [--random-reps 200] [--dir data/cache] [--list]
//
// CHỈ kỳ D: --period khác "dev" bị từ chối (kỳ mù B chỉ chạy một lần sau khi khóa luật, bằng simulate-run/replay, không qua đây).
// Biến thể "chưa nối": cần hook trong bộ mô phỏng/lõi (ghi trong `hooks`) — CLI từ chối chạy thay vì âm thầm chạy ra kết quả gốc.
//
// TIÊU CHÍ NHẬN (rà soát C1, I1, I4): cấp DANH MỤC trên cùng lịch ngày D — cận dưới CI Bonferroni (bootstrap khối ngày) của
// Δ R/ngày VÀ Δ lợi suất vốn/ngày > 0, kỳ vọng R toàn bộ tăng, sụt giảm lớn nhất % và chuỗi thua dài nhất KHÔNG tệ hơn gốc, ≥ 30 lệnh.
// ΔR theo cặp (cùng signalId) chỉ là chẩn đoán phụ: biến thể lọc bỏ lệnh thì ΔR theo cặp ≈ 0 theo cấu tạo.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { CONFIG } from '../packages/core/config.ts';
import { marketRegime } from '../packages/core/regime.ts';
import { parseEvents } from '../packages/core/events.ts';
import type { ExitPolicy } from '../packages/core/exit.ts';
import type { Candle, Mode } from '../packages/core/types.ts';
import { DEV_PERIOD, type FundingRow } from './replay.ts';
import { loadCandles, DAY, INTERVAL_MS, type Interval } from './data.ts';
import type { TradeRecord } from './simulate.ts';
import {
  computeStats, groupStatsBy, pairedComparison, portfolioComparison, randomEntryBaseline, bonferroniAlpha,
  type StatTrade, type RandomTemplate, type CI,
} from './stats.ts';
import {
  attributeLoss, evaluateChecks, summarizeAttribution, liftFilter, DEFAULT_ATTR, CATEGORIES, CATEGORY_LABEL, CHECKS,
  type AttrContext, type Attribution, type Evaluated,
} from './attribution.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const LOG_PATH = 'docs/verification/nhat-ky-thu.md';
const CAPITAL = 10_000;
// Phép kiểm quy nguyên nhân có độ nâng (tỉ lệ bật ở lệnh thua ÷ ở lệnh không thua) < mức này bị loại khỏi xếp nhóm — đề xuất, chưa backtest
export const MIN_LIFT = 1.25;

// ---------------------------------------------------------------- danh mục biến thể ------------------------------------------------
export type Variant = {
  name: string; proposal: number | null; change: string; rationale: string; wired: boolean;
  run: { policy: ExitPolicy; filter: 'A' | 'all' } | null; // đã nối: tham số mô phỏng hiện có
  configOverride: Record<string, unknown>; // chưa nối: khóa cấu hình → giá trị (CẦN hook H0 + hook riêng)
  hooks: string[];
};

// H0 — hook chung bộ mô phỏng cần (KHÔNG tự thêm ở đây: simulate-run.ts do agent khác sửa): RunOptions nhận
// `configOverride?: Record<string, unknown>` và runSimulation áp nó vào CONFIG/COMMON trong lúc chạy (lõi đọc CONFIG/COMMON cấp
// module, chưa có tham số cấu hình) — vd. `const restore = applyConfigOverride(o.configOverride); try { … } finally { restore(); }`.
const H0 = 'H0: simulate-run.ts RunOptions.configOverride → runSimulation áp vào CONFIG/COMMON trong lúc chạy rồi trả lại (try/finally)';
const RESEARCH = 'reports/Nghiên cứu cải thiện lợi nhuận.md';
const PRIOR = 'đã xem trên D trước khi có nhật ký (Task 3)';

function wired(name: string, change: string, rationale: string, run: Variant['run']): Variant {
  return { name, proposal: null, change, rationale, wired: true, run, configOverride: {}, hooks: [] };
}
function unwired(name: string, proposal: number | null, change: string, rationale: string,
  configOverride: Record<string, unknown>, hooks: string[]): Variant {
  return { name, proposal, change: `${change} — chưa nối`, rationale, wired: false, run: null, configOverride, hooks: [H0, ...hooks] };
}

const list: Variant[] = [
  wired('baseline', 'gốc: mọi Đạt, thoát C2 (TP1 50% + trailing)', 'đối chứng cho mọi biến thể', { policy: 'C2', filter: 'all' }),
  wired('filter-A', 'chỉ tín hiệu Hạng A (bot thật), thoát C2', `lọc Hạng A so với mọi Đạt — ${PRIOR}`, { policy: 'C2', filter: 'A' }),
  wired('exit-A0', 'thoát A0 (TP1/TP2/TP3 50/30/20, dời SL sau TP1)', `Task 4: so cách thoát với C2 — ${PRIOR}`, { policy: 'A0', filter: 'all' }),
  unwired('tp1-any-strength', null, 'TP1 tại vùng đầu tiên bất kể độ mạnh (B3b)', 'Task 4: biến thể chọn TP1, tính vào k Bonferroni',
    { 'COMMON.zones.tp1SkipWeak': false }, ['khóa đã có (zones.ts đọc lúc gọi) — chỉ cần H0']),
  ...[0.1, 0.15].map((k) => unwired(`p1-cost-floor-k${k.toFixed(2).replace('.', '')}`, 1,
    `#1 sàn chi phí: bỏ kế hoạch nếu (phí vào + phí ra ở SL + funding dự kiến)/d > ${k}; phí maker/taker tách riêng`,
    `${RESEARCH} #1 — phí ăn 0,32R/lệnh ở Lướt nhanh`,
    { 'COMMON.risk.maxCostR': k, 'COMMON.fees': { maker: 0.02, taker: 0.05 } },
    ['khóa mới COMMON.risk.maxCostR + kiểm trong packages/bot/planner.ts (từ chối kế hoạch)',
      'simulate.ts SimCost tách makerPct/takerPct: limit vào + TP1 reduce-only = maker, SL/trailing/market = taker + trượt nền'])),
  unwired('p2-fast-4h', 2, '#2 Lướt nhanh lên khung xu hướng 4H / vào lệnh 1H, hạn +1R 48 giờ, giữ tối đa 7 ngày',
    `${RESEARCH} #2 — khung 15m lợi thế < phí`,
    { 'CONFIG.fast.trendInterval': '4h', 'CONFIG.fast.entryInterval': '1h', 'CONFIG.fast.timeStopHours': 48, 'CONFIG.fast.maxHoldHours': 168 },
    ['types ModeConfig: trendInterval thêm "4h", entryInterval thêm "1h" (hiện chỉ "1h"|"1d" / "15m"|"4h")',
      'replay.ts decisionTimes + simulate-run.ts ENTRY_BAR_MS theo CONFIG[mode].entryInterval thay vì cố định 15m']),
  unwired('p2-fast-off', 2, '#2(a) tắt hẳn Lướt nhanh (0 lệnh Lướt nhanh, chỉ Swing)', `${RESEARCH} #2(a)`, { 'modes.fast.enabled': false },
    ['cờ bật/tắt chế độ trong bot/scanner (mô phỏng: chỉ cần không chạy --mode fast — kết quả = 0 lệnh, so ở cấp danh mục)']),
  ...[20, 55].map((n) => unwired(`p3-breakout-n${n}`, 3,
    `#3 cho phép lệnh phá vỡ khi không có TP1: đóng 1D > đỉnh đóng ${n} ngày, 100% trailing (kích hoạt +1R, callback 3×ATR 4H), giữ ≤ 30 ngày, Long Swing`,
    `${RESEARCH} #3 — planner Swing từ chối 1 179 lần "không có TP1"`,
    { 'COMMON.breakout': { enabled: true, donchianDays: n, trailAtr4h: 3, maxHoldDays: 30, sides: ['long'] } },
    ['packages/core/plan.ts: kế hoạch không TP1 khi phá đỉnh Donchian N ngày',
      'packages/bot/planner.ts: nhận kế hoạch không TP1 (hiện từ chối "Không có TP1")',
      'exit.ts/simulate.ts: chính sách thoát mới TRAIL_ONLY (100% trailing, không TP cố định)'])),
  unwired('p4-trend-only', 4, '#4 Swing không mở lệnh mới khi chế độ Đi ngang', `${RESEARCH} #4 — lợi thế theo xu hướng tập trung khi có xu hướng`,
    { 'COMMON.regime.allowSidewaysSwing': false },
    ['khóa mới + kiểm trong packages/core/gates.ts G-01 (regimeCheck): sideways & mode swing → chặn']),
  unwired('p5-short-asym', 5, '#5 Short chỉ khi chế độ Xuống + RS 14 ngày thuộc 20% yếu nhất + funding TB 3 ngày ≥ 0',
    `${RESEARCH} #5 — Short PF 0,64 (Swing) trên D`,
    { 'COMMON.shortRules': { requireDownRegime: true, rsBottomPct: 20, rsDays: 14, minFunding3d: 0 } },
    ['gates.ts G-01: bỏ ngoại lệ "ngược chế độ" cho Short khi bật', 'xếp hạng RS theo mặt cắt ngang tại t (run-scan)',
      'replay.ts đưa lịch sử funding 3 ngày (chỉ kỳ đã chốt ≤ t) vào input máy quét']),
  ...([[30, 2], [30, 3], [50, 2], [50, 3]] as const).map(([pct, m]) => unwired(`p6-c3-tp${pct}-m${m}`, 6,
    `#6 thoát C3: TP1 chốt ${pct}%, phần còn lại trailing theo giá ĐÓNG 4H, dừng = max(hòa vốn+phí, đỉnh đóng − ${m}×ATR(14) 4H)`,
    `${RESEARCH} #6 — C2 ≈ A0 trên D, callback C2 hẹp`, { policy: 'C3', 'COMMON.exitC3': { tp1Pct: pct, trailAtr4h: m } },
    ['packages/core/exit.ts: ExitPolicy thêm "C3" (hiện "A0" | "C2")',
      'simulate.ts: trailing kiểm trên giá đóng nến 4H (đặt lại STOP_MARKET mỗi nến 4H)', 'packages/bot/planner.ts exitSplit: tỉ lệ TP1 theo chính sách'])),
  ...[100, 150].map((n) => unwired(`p7-swing-top${n}`, 7, `#7 Swing chỉ xét ${n} hợp đồng thanh khoản nhất + Long cần RS 14 ngày thuộc nửa trên`,
    `${RESEARCH} #7 — quán tính chỉ ở coin lớn`, { 'COMMON.swingUniverseSize': n, 'COMMON.swingLongRsTopHalf': true },
    ['scanner/run-scan.ts: cắt universe cho swing như fastUniverseSize (dòng `if (mode === \'fast\') universe = …`)',
      'backtest/fetch-pit.ts: thứ hạng point-in-time cho swing', 'gates: Long cần RS ≥ trung vị nhóm'])),
  unwired('p8-funding-xs70', 8, '#8 lọc funding mặt cắt ngang: Long khi phân vị funding TB 7 ngày ≤ 70%, Short khi ≥ 70%',
    `${RESEARCH} #8 — basis/carry là tín hiệu mặt cắt ngang`, { 'COMMON.fundingXsPct': 70 },
    ['replay.ts đưa funding 7 ngày (đã chốt ≤ t) của mọi hợp đồng vào input', 'gates: kiểm phân vị funding theo chiều lệnh']),
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
  if (s.period !== 'dev' || !(st >= DEV_PERIOD.start) || !(en <= DEV_PERIOD.end) || !(st < en)) {
    throw new Error(`kết quả nguồn không phải kỳ D [${new Date(DEV_PERIOD.start).toISOString()}, ${new Date(DEV_PERIOD.end).toISOString()})`);
  }
  if (s.mode !== mode) throw new Error(`kết quả nguồn là chế độ "${String(s.mode)}", cần "${mode}"`);
  if (v.run === null) throw new Error(`biến thể "${v.name}" chưa nối — không có kết quả nguồn hợp lệ`);
  if (s.policy !== v.run.policy || s.filter !== v.run.filter) {
    throw new Error(`kết quả nguồn ${String(s.policy)}/${String(s.filter)} không khớp biến thể "${v.name}" (${v.run.policy}/${v.run.filter})`);
  }
}

// Bonferroni với k lớn: đuôi α/(2k) cần đủ mẫu bootstrap → ít nhất 2000·k lần lấy mẫu lại
export const resamplesFor = (k: number, given: number) => Math.max(given, 2000 * k);

// ---------------------------------------------------------------- nhật ký thử --------------------------------------------------------
export const LOG_HEADER = `# Nhật ký thử trên kỳ D

Kế hoạch 2, "Quy trình mô phỏng MÙ": mọi lần thử thay đổi (luật vào lệnh, bộ lọc, cách thoát) trên kỳ phát triển D
[2026-06-21, 2026-09-19) đều ghi ở đây — kể cả lần không nhận. Ghi tự động bởi \`node backtest/experiment.ts\`.

**Cách đếm k (số lần thử, cho Bonferroni 95% → 1 − 0,05/k):**
- Mỗi cặp (biến thể × chế độ) khác gốc = MỘT lần thử (mỗi chế độ là một quyết định riêng). k = số cặp như vậy trong bảng, tính cả lần đang chạy.
- Các lần đã NHÌN kết quả D trước khi có nhật ký được ghi bù: lọc Hạng A (\`filter-A\`) và thoát A0 (\`exit-A0\`), cả hai chế độ (Task 3).
  Cấu hình Hạng A × A0 cũng đã xem — coi là một phần của hai lần thử này, không đếm thêm.
- Các lần chạy lại của Task 3 sau khi sửa lỗi bộ mô phỏng KHÔNG phải lần thử (cùng giả thuyết, sửa công cụ).
- Chạy lại cùng (biến thể, chế độ) — vd. quyết định lại theo tiêu chí mới — THAY dòng cũ, không tăng k.

**Tiêu chí nhận (cấp danh mục, cùng lịch ngày D):** cận dưới CI Bonferroni (bootstrap theo khối NGÀY) của Δ R/ngày **và** Δ lợi suất
vốn %/ngày > 0; kỳ vọng R toàn bộ tăng; sụt giảm lớn nhất % vốn **và** chuỗi thua dài nhất không tệ hơn gốc (không có dung sai); ≥ 30 lệnh.
ΔR theo cặp (cùng signalId) chỉ là chẩn đoán phụ. Thay đổi luật vào lệnh/bộ lọc vẫn phải trình người dùng duyệt trước khi sửa
\`config.ts\`. Rủi ro người dùng chốt giữ nguyên (2%/lệnh, ≤ 10 lệnh, ≤ 10% tổng rủi ro, cầu chì).
Kỳ vọng R: sau phí + trượt + funding, CI 95% bootstrap theo khối ngày vào lệnh (iid ở output/experiments/…/stats.json).

| Ngày | Biến thể | Chế độ | Thay đổi | Lý do | Lệnh | Kỳ vọng R [CI khối ngày] | Δ R/ngày [CI Bonf.] | Δ lợi suất %/ngày [CI Bonf.] | Δ tổng lãi % / Δ DD % / Δ chuỗi thua | ΔR theo cặp (phụ) | k | Tổng lãi % | PF | Sụt lớn nhất % | Chuỗi thua | Quyết định |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
`;

export function logRows(text: string): Array<{ variant: string; mode: string; line: string }> {
  const out: Array<{ variant: string; mode: string; line: string }> = [];
  for (const line of text.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 4 || !/^\d{4}-\d{2}-\d{2}$/.test(cells[1] ?? '')) continue;
    out.push({ variant: cells[2]!, mode: cells[3]!, line });
  }
  return out;
}

export function countTrials(text: string, variant: string, modes: readonly string[]): number {
  const s = new Set(logRows(text).filter((r) => r.variant !== 'baseline').map((r) => `${r.variant}|${r.mode}`));
  if (variant !== 'baseline') for (const m of modes) s.add(`${variant}|${m}`);
  return Math.max(1, s.size);
}

export type LogRow = {
  date: string; variant: string; mode: string; change: string; rationale: string; trades: number; expectancy: string;
  dRPerDay: string; dRetPerDay: string; deltas: string; paired: string; k: string; totalPct: string; pf: string; maxDd: string; streak: string; decision: string;
};
export function formatLogRow(r: LogRow): string {
  const cell = (x: string | number) => String(x).replace(/\|/g, '/').replace(/\n/g, ' ');
  const cells = [r.date, r.variant, r.mode, r.change, r.rationale, r.trades, r.expectancy, r.dRPerDay, r.dRetPerDay, r.deltas, r.paired, r.k,
    r.totalPct, r.pf, r.maxDd, r.streak, r.decision];
  return `| ${cells.map(cell).join(' | ')} |\n`;
}

// Thay dòng cùng (biến thể, chế độ) nếu đã có, không thì thêm cuối bảng.
export function upsertLogRow(text: string, row: string): string {
  const [r] = logRows(row);
  if (r === undefined) throw new Error(`upsertLogRow: dòng không hợp lệ: ${row}`);
  const old = logRows(text).find((x) => x.variant === r.variant && x.mode === r.mode);
  if (old !== undefined) return text.replace(old.line + '\n', row.endsWith('\n') ? row : row + '\n');
  return (text.endsWith('\n') ? text : text + '\n') + row;
}

export type DecideInput = {
  baseline: boolean; trades: number; rPerDayAdjLo: number; retPerDayAdjLo: number; expectancy: number; baseExpectancy: number;
  dd: number; baseDd: number; streak: number; baseStreak: number;
};
export function decide(a: DecideInput): string {
  if (a.baseline) return 'gốc (đối chứng)';
  if (a.trades < 30) return `không kết luận được (< 30 lệnh: ${a.trades})`;
  if (!(a.rPerDayAdjLo > 0)) return 'không nhận (cận dưới CI Bonferroni của Δ R/ngày ≤ 0)';
  if (!(a.retPerDayAdjLo > 0)) return 'không nhận (cận dưới CI Bonferroni của Δ lợi suất/ngày ≤ 0)';
  if (!(a.expectancy > a.baseExpectancy)) return 'không nhận (kỳ vọng R toàn bộ không tăng)';
  if (a.dd > a.baseDd) return 'không nhận (DD tệ hơn gốc)';
  if (a.streak > a.baseStreak) return 'không nhận (chuỗi thua dài hơn gốc)';
  return 'đạt tiêu chí D (luật vào lệnh/bộ lọc: chờ người dùng duyệt)';
}

// ---------------------------------------------------------------- định dạng --------------------------------------------------------
const vn = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace('-', '−') : x === Infinity ? '∞' : '—');
const ci = (c: CI, d = 3) => `[${vn(c.lo, d)}; ${vn(c.hi, d)}]`;
const pct = (x: number) => vn(x * 100, 1);

// ---------------------------------------------------------------- đọc dữ liệu (I/O) -----------------------------------------------
type Curve = Array<{ t: number; equity: number }>;
type RunFiles = { trades: TradeRecord[]; curve: Curve; summary: { capital: number; maxDdPct: number; totalReturnPct: number } };

function readRun(dir: string): RunFiles {
  const trades = readFileSync(join(dir, 'trades.jsonl'), 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as TradeRecord);
  const curve = JSON.parse(readFileSync(join(dir, 'equity.json'), 'utf8')) as Curve;
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

type Shared = {
  cacheDir: string; boot: { resamples: number; seed: number; alpha: number }; k: number; randomReps: number;
  data: ReturnType<typeof createData>; regimeAt: (t: number) => string; events: ReturnType<typeof parseEvents>; btc: readonly Candle[];
};

// Lấy kết quả mô phỏng vào outDir: chép từ --from-output (kiểm kỳ D + chính sách) hoặc chạy mô phỏng (biến thể đã nối)
async function materialize(v: Variant, mode: Mode, src: string | undefined, outDir: string, sh: Shared): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  if (src !== undefined) {
    const from = resolvePath(REPO_ROOT, src);
    validateSource(JSON.parse(readFileSync(join(from, 'summary.json'), 'utf8')) as SourceSummary, v, mode);
    for (const f of ['trades.jsonl', 'equity.json', 'summary.json']) copyFileSync(join(from, f), join(outDir, f));
    writeFileSync(join(outDir, 'source.json'), JSON.stringify({ from, copiedAt: new Date().toISOString() }, null, 2));
    return;
  }
  const w = requireWired(v.name);
  // nạp động: simulate-run.ts nặng (máy quét) và đang được sửa song song — chỉ cần khi thật sự mô phỏng
  const sim = await import('./simulate-run.ts');
  const { loadContracts } = await import('./replay.ts');
  const opts = { dir: sh.cacheDir, mode, window: { ...DEV_PERIOD }, filter: w.run!.filter, policy: w.run!.policy, capital: CAPITAL, pauseHours: 24 };
  const contracts = await loadContracts(sh.cacheDir);
  const res = await sim.runSimulation({ ...opts, contracts, events: sh.events, fetcher: null, log: (m) => console.log(`  [${mode}] ${m}`) });
  writeFileSync(join(outDir, 'trades.jsonl'), res.done.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const curve = res.book.curve.filter((_, i, arr) => i === arr.length - 1 || arr[i + 1]!.t !== arr[i]!.t);
  writeFileSync(join(outDir, 'equity.json'), JSON.stringify(curve));
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(sim.report(res, opts), null, 2));
}

// Quy nguyên nhân: lượt 1 mọi phép kiểm → tỉ lệ nền ở lệnh không thua → lượt 2 bỏ phép kiểm độ nâng < MIN_LIFT (không phân biệt)
function attribute(mode: Mode, filled: readonly TradeRecord[], sh: Shared) {
  const entryIv = CONFIG[mode].entryInterval as Interval, trendIv = CONFIG[mode].trendInterval as Interval;
  const ctxOf = (r: TradeRecord): AttrContext => ({
    events: sh.events, btc: sh.btc, oi: sh.data.oi(r.symbol), funding: sh.data.funding(r.symbol),
    entryBars: sh.data.bars(r.symbol, entryIv, 40), entryIntervalMs: INTERVAL_MS[entryIv], trendBars: sh.data.bars(r.symbol, trendIv, 60),
    periodEnd: DEV_PERIOD.end,
  });
  const losersRaw: Attribution[] = [], nonLosers: Evaluated[] = [];
  for (const r of filled) {
    const t = { ...r, mode };
    if (r.pnl < 0) { const a = attributeLoss(t, ctxOf(r), DEFAULT_ATTR); if (a !== null) losersRaw.push(a); }
    else { const e = evaluateChecks(t, ctxOf(r), DEFAULT_ATTR); if (e !== null) nonLosers.push(e); }
  }
  const raw = summarizeAttribution(losersRaw, nonLosers);
  const skip = liftFilter(raw.baseRates, MIN_LIFT);
  const losers = filled.filter((r) => r.pnl < 0).map((r) => attributeLoss({ ...r, mode }, ctxOf(r), DEFAULT_ATTR, skip)).filter((a) => a !== null);
  return { losers, summary: summarizeAttribution(losers, nonLosers), rawSummary: raw, skipped: [...skip] };
}

// ---------------------------------------------------------------- một chế độ ---------------------------------------------------------
async function runMode(v: Variant, mode: Mode, src: string | undefined, sh: Shared): Promise<LogRow> {
  const outDir = resolvePath(REPO_ROOT, 'output/experiments', v.name, mode);
  await materialize(v, mode, src, outDir, sh);
  const run = readRun(outDir);
  const at = (s: string | null, fallback: string) => Date.parse(s ?? fallback);
  const trades: StatTrade[] = run.trades.map((r) => ({ ...r, regime: sh.regimeAt(at(r.entryTime, r.placedAt)), variant: v.name }));
  const filled = run.trades.filter((r) => r.filled);
  const alphaAdj = bonferroniAlpha(sh.boot.alpha, sh.k);

  // Thống kê (CI iid + khối ngày; bản Bonferroni cho kỳ vọng)
  const overall = computeStats(trades, { ...sh.boot, equity: { capital: run.summary.capital, curve: run.curve } });
  const overallAdj = computeStats(trades, { ...sh.boot, alpha: alphaAdj });
  const groups = groupStatsBy(trades, ['mode', 'side', 'grade', 'kind', 'regime', 'variant'], sh.boot);

  // Vào lệnh ngẫu nhiên cùng mã/chiều/thời gian giữ/khoảng SL/phí R (thoát theo giờ ở giá đóng — không TP1/trailing/funding)
  const templates: RandomTemplate[] = filled
    .filter((r) => r.entryTime !== null && r.exitTime !== null && r.avgEntry !== null && r.riskAtFill > 0)
    .map((r) => ({ symbol: r.symbol, side: r.side, holdMs: Date.parse(r.exitTime!) - Date.parse(r.entryTime!),
      stopPct: Math.abs(r.avgEntry! - r.stop) / r.avgEntry!, feeR: r.costs / r.riskAtFill }));
  const barsOf = (t: RandomTemplate) => { const b = sh.data.bars(t.symbol, randomInterval[mode], 0); return b.length > 0 ? b : null; };
  const random = randomEntryBaseline(templates, barsOf, { reps: sh.randomReps, seed: sh.boot.seed, alpha: sh.boot.alpha });

  const attr = attribute(mode, filled, sh);

  // So với gốc: cấp danh mục (chính) + theo cặp (phụ)
  let portfolio: ReturnType<typeof portfolioComparison> | null = null;
  let paired: ReturnType<typeof pairedComparison> | null = null;
  let base: { expectancy: number; dd: number; streak: number } | null = null;
  if (v.name !== 'baseline') {
    const baseDir = resolvePath(REPO_ROOT, 'output/experiments/baseline', mode);
    if (!existsSync(join(baseDir, 'trades.jsonl'))) throw new Error(`chưa có kết quả gốc ${baseDir} — chạy --variant baseline trước`);
    const b = readRun(baseDir);
    const bs = computeStats(b.trades, { ...sh.boot, resamples: 1 });
    base = { expectancy: bs.expectancyR, dd: b.summary.maxDdPct, streak: bs.longestLosingStreak };
    portfolio = portfolioComparison({ trades: b.trades, curve: b.curve }, { trades: run.trades, curve: run.curve },
      { ...sh.boot, trials: sh.k, capital: run.summary.capital, start: DEV_PERIOD.start, end: DEV_PERIOD.end });
    paired = pairedComparison(b.trades, run.trades, { ...sh.boot, trials: sh.k });
  }

  writeFileSync(join(outDir, 'stats.json'), JSON.stringify({
    variant: v.name, mode, k: sh.k, boot: sh.boot, overall, overallBonferroni: { alpha: alphaAdj, expectancyCI: overallAdj.expectancyCI, expectancyCIBlock: overallAdj.expectancyCIBlock },
    simSummaryCheck: { totalReturnPct: run.summary.totalReturnPct, maxDdPct: run.summary.maxDdPct }, groups, random, portfolio, paired,
  }, null, 2));
  writeFileSync(join(outDir, 'attribution.json'), JSON.stringify({
    config: DEFAULT_ATTR, minLift: MIN_LIFT, skippedChecks: attr.skipped, summary: attr.summary, summaryAllChecks: attr.rawSummary,
    dataErrors: sh.data.dataErrors.slice(0, 200), trades: attr.losers,
  }, null, 2));

  printMode(v, mode, sh, { overall, overallAdj, groups, random, attr, portfolio, paired, run });

  const s = overall;
  return {
    date: new Date().toISOString().slice(0, 10), variant: v.name, mode, change: v.change, rationale: v.rationale, trades: s.trades,
    expectancy: `${vn(s.expectancyR, 3)} ${ci(s.expectancyCIBlock)}`,
    dRPerDay: portfolio === null ? '—' : `${vn(portfolio.rPerDay.mean, 3)} ${ci(portfolio.rPerDay.ciAdj)}`,
    dRetPerDay: portfolio === null ? '—' : `${vn(portfolio.retPerDay.mean, 3)} ${ci(portfolio.retPerDay.ciAdj)}`,
    deltas: portfolio === null || base === null ? '—'
      : `${vn(portfolio.deltaTotalReturnPct)} / ${vn(portfolio.deltaMaxDdPct)} / ${s.longestLosingStreak - base.streak >= 0 ? '+' : '−'}${Math.abs(s.longestLosingStreak - base.streak)}`,
    paired: paired === null ? '—'
      : `${vn(paired.meanDeltaR, 3)} ${ci(paired.ciAdj)} (${paired.matched} cặp; chỉ gốc ${paired.baseOnly.length} lệnh ${vn(paired.baseOnlyR, 1)}R, chỉ biến thể ${paired.variantOnly.length} lệnh ${vn(paired.variantOnlyR, 1)}R)`,
    k: v.name === 'baseline' ? '—' : String(sh.k), totalPct: vn(run.summary.totalReturnPct), pf: vn(s.profitFactor), maxDd: vn(run.summary.maxDdPct),
    streak: String(s.longestLosingStreak),
    decision: decide({
      baseline: v.name === 'baseline', trades: s.trades, rPerDayAdjLo: portfolio?.rPerDay.ciAdj.lo ?? NaN, retPerDayAdjLo: portfolio?.retPerDay.ciAdj.lo ?? NaN,
      expectancy: s.expectancyR, baseExpectancy: base?.expectancy ?? NaN, dd: run.summary.maxDdPct, baseDd: base?.dd ?? NaN,
      streak: s.longestLosingStreak, baseStreak: base?.streak ?? NaN,
    }),
  };
}

type Printed = {
  overall: ReturnType<typeof computeStats>; overallAdj: ReturnType<typeof computeStats>; groups: ReturnType<typeof groupStatsBy>;
  random: ReturnType<typeof randomEntryBaseline>; attr: ReturnType<typeof attribute>; portfolio: ReturnType<typeof portfolioComparison> | null;
  paired: ReturnType<typeof pairedComparison> | null; run: RunFiles;
};
function printMode(v: Variant, mode: Mode, sh: Shared, p: Printed): void {
  const s = p.overall;
  const log = (x: string) => console.log(x);
  log(`\n## ${v.name} — ${mode} (${s.trades} lệnh đã khớp, ${s.days} ngày có lệnh, k = ${sh.k}, bootstrap ${sh.boot.resamples})`);
  log(`Kỳ vọng ${vn(s.expectancyR, 3)}R | CI95 khối ngày ${ci(s.expectancyCIBlock)} | iid ${ci(s.expectancyCI)} | Bonferroni khối ${ci(p.overallAdj.expectancyCIBlock)}`);
  log(`Thắng ${pct(s.winRate)}% [${pct(s.winCI.lo)}; ${pct(s.winCI.hi)}] | chạm TP1 ${pct(s.tp1Rate)}% | PF ${vn(s.profitFactor)} | tổng lãi ${vn(s.totalReturnPct!)}% (sim ${vn(p.run.summary.totalReturnPct)}%)`);
  log(`Sụt lớn nhất ${vn(s.maxDrawdownPct!)}% vốn (sim ${vn(p.run.summary.maxDdPct)}%), ${vn(s.maxDrawdownR)}R | chuỗi thua ${s.longestLosingStreak} | phí ${vn(s.avgFeesR, 3)}R | funding ${vn(s.avgFundingR, 3)}R`);
  log(`Vào ngẫu nhiên (${p.random.reps} lần × ${p.random.tradesPerRep} lệnh, bỏ ${p.random.skippedTemplates}): ${vn(p.random.meanExpectancyR, 3)}R, 95% ${ci(p.random)}`);
  if (p.portfolio !== null) {
    const q = p.portfolio;
    log(`DANH MỤC (${q.days} ngày): Δ R/ngày ${vn(q.rPerDay.mean, 3)} CI95 ${ci(q.rPerDay.ci)} Bonf ${ci(q.rPerDay.ciAdj)} | Δ lợi suất %/ngày ${vn(q.retPerDay.mean, 3)} Bonf ${ci(q.retPerDay.ciAdj)} | Δ tổng lãi ${vn(q.deltaTotalReturnPct)}% | Δ DD ${vn(q.deltaMaxDdPct)}%`);
  }
  if (p.paired !== null) log(`(phụ) ΔR theo cặp ${vn(p.paired.meanDeltaR, 3)} (${p.paired.matched} cặp) Bonf ${ci(p.paired.ciAdj)} | chỉ gốc ${vn(p.paired.baseOnlyR, 2)}R, chỉ biến thể ${vn(p.paired.variantOnlyR, 2)}R`);
  log('\n| Nhóm | Lệnh | Thắng % [Wilson] | Kỳ vọng R [khối ngày] | PF | DD R | Chuỗi thua | Phí R |\n|---|---|---|---|---|---|---|---|');
  for (const g of p.groups.filter((x) => (!x.key.includes('|') || x.key.startsWith('side=')) && !/(^|\|)(mode|variant)=/.test(x.key))) {
    const t = g.stats;
    log(`| ${g.key} | ${t.trades}${t.smallSample ? '*' : ''} | ${pct(t.winRate)} [${pct(t.winCI.lo)}; ${pct(t.winCI.hi)}] | ${vn(t.expectancyR, 3)} ${ci(t.expectancyCIBlock)} | ${vn(t.profitFactor)} | ${vn(t.maxDrawdownR, 1)} | ${t.longestLosingStreak} | ${vn(t.avgFeesR, 3)} |`);
  }
  const a = p.attr.rawSummary;
  log('\n| Phép kiểm | Lệnh thua bật | Lệnh không thua bật | Độ nâng |\n|---|---|---|---|');
  for (const c of CHECKS) {
    const b = a.baseRates[c];
    log(`| ${CATEGORY_LABEL[c]} | ${b.losers.flagged}/${b.losers.n} (${pct(b.losers.share)}%) | ${b.nonLosers.flagged}/${b.nonLosers.n} (${pct(b.nonLosers.share)}%) | ${b.lift === null ? '—' : vn(b.lift)} |`);
  }
  const m = p.attr.summary;
  const keys = Object.keys(m.byModeSide).sort();
  log(`\nXếp nhóm (bỏ phép kiểm độ nâng < ${MIN_LIFT}: ${p.attr.skipped.join(', ') || 'không'})`);
  log(`| Nhóm | Lệnh | % lệnh thua | R mất | ${keys.map((k2) => `${k2} (lệnh / R)`).join(' | ')} |\n|---|---|---|---|${keys.map(() => '---|').join('')}`);
  for (const c of CATEGORIES) {
    const cell = m.byCategory[c];
    log(`| ${CATEGORY_LABEL[c]} | ${cell.count} | ${pct(m.shareOfLosers[c])} | ${vn(cell.rLost, 1)} | ${keys.map((k2) => { const x = m.byModeSide[k2]![c]; return `${x.count} / ${vn(x.rLost, 1)}`; }).join(' | ')} |`);
  }
  log(`Tổng ${m.total.count} lệnh thua, ${vn(m.total.rLost, 1)}R. Cần nguồn tin coin (5)/(6): ${m.pendingSources.coin_event} lệnh. Không đủ dữ liệu/chưa kiểm: ${JSON.stringify(m.insufficient)}. Lỗi dữ liệu: ${sh.data.dataErrors.length}`);
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
  const num = (x: string, name: string) => { const n = Number(x); if (!(n > 0 && Number.isInteger(n))) throw new Error(`--${name} không hợp lệ: "${x}"`); return n; };

  const logPath = join(REPO_ROOT, LOG_PATH);
  const logText = existsSync(logPath) ? readFileSync(logPath, 'utf8') : LOG_HEADER;
  const k = countTrials(logText, v.name, modes);
  const boot = { resamples: resamplesFor(k, num(o.resamples!, 'resamples')), seed: num(o.seed!, 'seed'), alpha: 0.05 };
  const cacheDir = o.dir!;
  const btcDaily = loadCandles(cacheDir, 'BTCUSDT', '1d', DEV_PERIOD.start - 300 * DAY, DEV_PERIOD.end).candles;
  const sh: Shared = {
    cacheDir, boot, k, randomReps: num(o['random-reps']!, 'random-reps'), data: createData(cacheDir), regimeAt: regimeTagger(btcDaily),
    events: parseEvents(JSON.parse(readFileSync(join(REPO_ROOT, 'data/events/events.json'), 'utf8'))),
    btc: loadCandles(cacheDir, 'BTCUSDT', '5m', DEV_PERIOD.start, DEV_PERIOD.end).candles, // cú sốc BTC đo trên nến 5m
  };

  let text = logText;
  for (const mode of modes as Mode[]) text = upsertLogRow(text, formatLogRow(await runMode(v, mode, fromOutput[mode], sh)));
  writeFileSync(logPath, text);
  console.log(`\nĐã ghi output/experiments/${v.name}/ và ghi ${modes.length} dòng vào ${LOG_PATH} (k = ${k})`);
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    console.error(`LỖI: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    process.exit(1);
  });
}
