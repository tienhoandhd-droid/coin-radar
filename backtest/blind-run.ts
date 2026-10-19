// Chạy kỳ mù B ĐÚNG MỘT LẦN mỗi ứng viên đã khóa (kế hoạch 2, "Quy trình mô phỏng MÙ"). Chỉ ghi kết quả thô — báo cáo do điều phối viết.
//
//   node backtest/blind-run.ts --lock docs/verification/khoa-luat-mo-phong-mu.md [--rerun-after-crash <id>] [--dir data/cache]
//   node backtest/blind-run.ts --print-config-hash      (in configHash của mặc định CONFIG + COMMON hiện tại, để ghi vào tệp khóa)
//
// TỆP KHÓA (Markdown) chứa đúng MỘT khối ```json lock … ``` với ĐỦ các khóa (thiếu/lạ → từ chối):
//   { "lockedCommit": "<SHA 40 ký tự>", "configHash": "<sha256 hex>", "capital": 10000, "pauseHours": 24, "criteria": "<tiêu chí, văn bản>",
//     "candidates": [{ "id": "swing-tp1", "mode": "swing|fast", "filter": "A|all", "policy": "C2|A0|C3", "variant": "<tên trong experiment.ts>",
//                      "base": "baseline|<biến thể gốc, vd. f1-funding-fix>" }] }
//   Cấu hình chạy = stackRun(gốc, biến thể) như experiment.ts (ghi output/blind/<id>/effective.json trước khi chạy); policy/filter phải trùng.
//
// TỪ CHỐI nếu: HEAD ≠ lockedCommit; có thay đổi chưa commit ở BẤT KỲ tệp đã theo dõi nào trừ tệp khóa, hoặc tệp mới trong packages/
// scanner/ backtest/ data/events/; output/blind/ đã có lần chạy dưới tệp khóa khác (id lạ, lockedCommit/configHash/sha256 tệp khóa khác); configHash ≠
// mặc định hiện tại; thủ tục mở kỳ mù sai (replay.ts checkBlindAuth — tệp khóa phải đúng LOCK_FILE và tồn tại); biến thể không có/chưa nối/
// lệch chế độ, policy hoặc filter của chính biến thể; output/blind/<id>/ đã có lần chạy.
// MỘT LẦN MỖI ỨNG VIÊN: output/blind/<id>/started.json được ghi TRƯỚC khi mô phỏng bắt đầu → tiến trình đổ giữa chừng không cho chạy lại âm
// thầm; muốn chạy lại phải có --rerun-after-crash <id> (chỉ khi chưa có summary.json; cờ được ghi vào started.json và summary.json, và
// lượt đó chạy lại ứng viên ấy rồi các ứng viên CHƯA bắt đầu; ứng viên đã xong không chạy lại). summary.json ghi SAU CÙNG = đã xong.
//
// configHash = sha256(canonicalJson({ CONFIG, COMMON })) — canonicalJson: JSON với khóa đối tượng sắp xếp bằng Array.sort() mặc định (thứ tự
// mã UTF-16), không khoảng trắng; số không hữu hạn → lỗi. Tính lúc chưa áp ghi đè nào (mặc định trong packages/core/config.ts).
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve as resolvePath, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { COMMON, CONFIG } from '../packages/core/config.ts';
import { parseEvents } from '../packages/core/events.ts';
import type { ExitPolicy } from '../packages/core/exit.ts';
import type { Mode } from '../packages/core/types.ts';
import { assertWindowAllowed, BLIND_PERIOD, loadContracts, type BlindAuth, type Window } from './replay.ts';
import { report, runSimulation, type Filter } from './simulate-run.ts';
import { requireWired, stackRun, BASELINE_SPEC, type RunSpec } from './experiment.ts';
import { computeStats, type StatTrade } from './stats.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
// Bootstrap cố định (như mặc định experiment.ts): 5000 lần, hạt 20261019, alpha 0,05 — không chỉnh sau khi xem B
export const BOOT = { resamples: 5000, seed: 20261019, alpha: 0.05 };
// Tệp MỚI (chưa theo dõi) chỉ bị tính là "bẩn" trong các thư mục ảnh hưởng quyết định; tệp ĐÃ theo dõi thì mọi thay đổi đều bẩn (trừ tệp khóa).
const GUARDED_DIRS = ['packages/', 'scanner/', 'backtest/', 'data/events/'];
const sha256 = (t: string | Buffer) => createHash('sha256').update(t).digest('hex');

// Dòng `git status --porcelain` không được phép: thay đổi tệp đã theo dõi (trừ tệp khóa), hoặc tệp mới trong GUARDED_DIRS.
export function dirtyLines(porcelain: string, lockRel: string): string[] {
  return porcelain.split('\n').filter((l) => l.trim() !== '').filter((l) => {
    const raw = l.slice(3);
    const path = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
    if (path === lockRel) return false;
    if (l.startsWith('??')) return GUARDED_DIRS.some((d) => path.startsWith(d));
    return true;
  });
}

// ---------------------------------------------------------------- configHash -------------------------------------------------------
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`canonicalJson: số không hữu hạn (${v})`);
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(o[k])).join(',') + '}';
  }
  throw new Error(`canonicalJson: kiểu không hỗ trợ (${typeof v})`);
}

export function configHash(): string {
  return createHash('sha256').update(canonicalJson({ CONFIG, COMMON })).digest('hex');
}

// ---------------------------------------------------------------- tệp khóa ---------------------------------------------------------
export type Candidate = { id: string; mode: Mode; filter: Filter; policy: ExitPolicy; variant: string; base: string };
export type Lock = { lockedCommit: string; configHash: string; capital: number; pauseHours: number; criteria: string; candidates: Candidate[] };

const LOCK_KEYS = ['lockedCommit', 'configHash', 'capital', 'pauseHours', 'criteria', 'candidates'];
const CAND_KEYS = ['id', 'mode', 'filter', 'policy', 'variant', 'base'];

function exactKeys(o: Record<string, unknown>, keys: readonly string[], where: string): void {
  for (const k of keys) if (!(k in o) || o[k] === undefined) throw new Error(`tệp khóa: ${where} thiếu "${k}"`);
  for (const k of Object.keys(o)) if (!keys.includes(k)) throw new Error(`tệp khóa: ${where} có khóa lạ "${k}"`);
}
const isObj = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

export function parseLock(text: string): Lock {
  const blocks = [...text.matchAll(/^```json lock[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm)];
  if (blocks.length === 0) throw new Error('tệp khóa: không có khối ```json lock … ```');
  if (blocks.length > 1) throw new Error(`tệp khóa: phải có đúng MỘT khối \`\`\`json lock, có ${blocks.length}`);
  let raw: unknown;
  try {
    raw = JSON.parse(blocks[0]![1]!);
  } catch (e) {
    throw new Error(`tệp khóa: khối json lock không phải JSON hợp lệ — ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!isObj(raw)) throw new Error('tệp khóa: khối json lock phải là một đối tượng');
  exactKeys(raw, LOCK_KEYS, 'khối');
  if (typeof raw.lockedCommit !== 'string' || !/^[0-9a-f]{40}$/.test(raw.lockedCommit)) throw new Error('tệp khóa: lockedCommit phải là SHA đủ 40 ký tự hex thường');
  if (typeof raw.configHash !== 'string' || !/^[0-9a-f]{64}$/.test(raw.configHash)) throw new Error('tệp khóa: configHash phải là sha256 64 ký tự hex thường');
  if (typeof raw.capital !== 'number' || !(raw.capital > 0) || !Number.isFinite(raw.capital)) throw new Error('tệp khóa: capital phải là số > 0');
  if (typeof raw.pauseHours !== 'number' || !(raw.pauseHours >= 0) || !Number.isFinite(raw.pauseHours)) throw new Error('tệp khóa: pauseHours phải là số ≥ 0');
  if (typeof raw.criteria !== 'string' || raw.criteria.trim() === '') throw new Error('tệp khóa: criteria phải là văn bản không rỗng');
  if (!Array.isArray(raw.candidates) || raw.candidates.length === 0) throw new Error('tệp khóa: candidates phải là mảng không rỗng');
  const seen = new Set<string>();
  const candidates = raw.candidates.map((c: unknown, i: number): Candidate => {
    const where = `candidates[${i}]`;
    if (!isObj(c)) throw new Error(`tệp khóa: ${where} phải là đối tượng`);
    exactKeys(c, CAND_KEYS, where);
    if (typeof c.id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(c.id)) throw new Error(`tệp khóa: ${where}.id không hợp lệ (chữ/số . _ -, ≤ 64 ký tự): ${String(c.id)}`);
    if (seen.has(c.id)) throw new Error(`tệp khóa: id ứng viên trùng "${c.id}"`);
    seen.add(c.id);
    if (c.mode !== 'swing' && c.mode !== 'fast') throw new Error(`tệp khóa: ${where}.mode phải là swing|fast`);
    if (c.filter !== 'A' && c.filter !== 'all') throw new Error(`tệp khóa: ${where}.filter phải là A|all`);
    if (c.policy !== 'C2' && c.policy !== 'A0' && c.policy !== 'C3') throw new Error(`tệp khóa: ${where}.policy phải là C2|A0|C3`);
    if (typeof c.variant !== 'string' || c.variant === '') throw new Error(`tệp khóa: ${where}.variant phải là tên biến thể`);
    if (typeof c.base !== 'string' || c.base === '') throw new Error(`tệp khóa: ${where}.base phải là tên biến thể gốc hoặc "baseline"`);
    return { id: c.id, mode: c.mode, filter: c.filter, policy: c.policy, variant: c.variant, base: c.base };
  });
  return { lockedCommit: raw.lockedCommit, configHash: raw.configHash, capital: raw.capital, pauseHours: raw.pauseHours, criteria: raw.criteria, candidates };
}

// Cấu hình hiệu lực của ứng viên = ĐÚNG cách experiment.ts dựng trên D: stackRun(cấu hình của gốc, biến thể), với cấu hình của gốc
// = BASELINE_SPEC ('baseline') hoặc stackRun(BASELINE_SPEC, gốc) — gốc là biến thể đã chạy trên 'baseline' (như f1-funding-fix; gốc
// chồng nhiều tầng không hỗ trợ). policy/filter trong tệp khóa phải TRÙNG cấu hình chồng, khác → từ chối.
export type Effective = { base: string } & RunSpec;
export function effectiveSpec(c: Candidate): Effective {
  const modeOk = (name: string, modes: readonly Mode[] | undefined) => {
    if (modes !== undefined && !modes.includes(c.mode)) throw new Error(`ứng viên "${c.id}": biến thể "${name}" không áp dụng cho chế độ ${c.mode} (chỉ ${modes.join(', ')})`);
  };
  let baseSpec: RunSpec = BASELINE_SPEC;
  if (c.base !== 'baseline') {
    const b = requireWired(c.base);
    modeOk(b.name, b.modes);
    baseSpec = stackRun(BASELINE_SPEC, b);
  }
  const v = requireWired(c.variant);
  modeOk(v.name, v.modes);
  const spec = stackRun(baseSpec, v);
  if (spec.policy !== c.policy) throw new Error(`ứng viên "${c.id}": policy ${c.policy} trái cấu hình chồng (gốc ${c.base} + ${v.name} → ${spec.policy})`);
  if (spec.filter !== c.filter) throw new Error(`ứng viên "${c.id}": filter ${c.filter} trái cấu hình chồng (gốc ${c.base} + ${v.name} → ${spec.filter})`);
  return { base: c.base, ...spec };
}

// ---------------------------------------------------------------- chạy -------------------------------------------------------------
export type SimRequest = {
  candidate: Candidate; mode: Mode; window: Window; filter: Filter; policy: ExitPolicy; capital: number; pauseHours: number;
  configOverride: Record<string, unknown>; auth: BlindAuth;
};
export type SimResult = Awaited<ReturnType<typeof runSimulation>>;
export type BlindDeps = {
  repoRoot: string;
  period: Window; // kỳ mù B thật mặc định; kiểm thử truyền cửa sổ giả
  git: (args: string[]) => string;
  now: () => Date;
  log: (m: string) => void;
  simulate: (req: SimRequest) => Promise<SimResult>;
};
export type BlindArgs = { lock: string; rerunAfterCrash?: string; dir?: string };

type Attempt = { startedAt: string; rerunAfterCrash: boolean };
type Inputs = { dir: string; sha256: Record<string, string | null> };
type Marker = { candidate: Candidate; lockedCommit: string; configHash: string; lockSha256: string; inputs: Inputs; window: { start: string; end: string };
  attempts: Attempt[] };

function readMarker(path: string): Marker {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Marker;
  } catch (e) {
    throw new Error(`không đọc được marker ${path} (started.json hỏng?): ${e instanceof Error ? e.message : String(e)}`);
  }
}

// Ảnh chụp đầu vào để kiểm lại sau: thư mục đệm + sha256 các tệp quyết định vũ trụ/sự kiện (null = không có tệp)
function snapshotInputs(root: string, dir: string): Inputs {
  const h = (p: string) => (existsSync(p) ? sha256(readFileSync(p)) : null);
  const abs = resolvePath(root, dir);
  return { dir, sha256: { 'exchange-info.json': h(join(abs, 'exchange-info.json')), 'universe.json': h(join(abs, 'universe.json')),
    'data/events/events.json': h(join(root, 'data/events/events.json')) } };
}

const iso = (t: number) => new Date(t).toISOString();

export async function runBlind(a: BlindArgs, d: BlindDeps): Promise<void> {
  // 1. Tệp khóa
  const lockPath = resolvePath(d.repoRoot, a.lock);
  let text: string;
  try {
    text = readFileSync(lockPath, 'utf8');
  } catch (e) {
    throw new Error(`không đọc được tệp khóa ${lockPath}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const lock = parseLock(text);
  const lockSha = sha256(text);
  const lockRel = relative(d.repoRoot, lockPath).split(sep).join('/');
  // 2. Thủ tục mở kỳ mù (cùng cổng với replay.ts / runSimulation) — trước mọi ghi tệp
  const auth: BlindAuth = { blind: true, lockFile: a.lock };
  assertWindowAllowed(d.period, auth);
  // 3. Mã đã khóa
  const head = d.git(['rev-parse', 'HEAD']).trim();
  if (head !== lock.lockedCommit) throw new Error(`Từ chối: HEAD ${head} khác lockedCommit ${lock.lockedCommit}`);
  const dirty = dirtyLines(d.git(['status', '--porcelain', '--untracked-files=all']), lockRel);
  if (dirty.length > 0) throw new Error(`Từ chối: có thay đổi chưa commit (tệp đã theo dõi ngoài tệp khóa, hoặc tệp mới trong ${GUARDED_DIRS.join(' ')}):\n${dirty.join('\n')}`);
  const hash = configHash();
  if (hash !== lock.configHash) throw new Error(`Từ chối: configHash của mặc định hiện tại ${hash} khác tệp khóa ${lock.configHash}`);
  // 4. Ứng viên: biến thể hợp lệ (kiểm hết trước khi chạy)
  const effective = new Map(lock.candidates.map((c) => [c.id, effectiveSpec(c)]));
  // 5. Một lần mỗi ứng viên
  const outRoot = join(d.repoRoot, 'output/blind');
  const dirOf = (id: string) => join(outRoot, id);
  // 5a. B chỉ một lần cho MỌI tệp khóa: mọi thư mục đã có trong output/blind/ phải là của ĐÚNG tệp khóa này (cùng nội dung, SHA, configHash, id)
  const ids = new Set(lock.candidates.map((c) => c.id));
  for (const name of existsSync(outRoot) ? readdirSync(outRoot).sort() : []) {
    const mp = join(outRoot, name, 'started.json');
    if (!existsSync(mp)) throw new Error(`Từ chối: ${join(outRoot, name)} không có started.json — kỳ mù đã bị chạm, không chạy tiếp`);
    const m = readMarker(mp);
    const why: string[] = [];
    if (!ids.has(name)) why.push(`id "${name}" không có trong tệp khóa hiện tại`);
    if (m.lockedCommit !== lock.lockedCommit) why.push(`lockedCommit ${m.lockedCommit} ≠ ${lock.lockedCommit}`);
    if (m.configHash !== lock.configHash) why.push(`configHash ${m.configHash} ≠ ${lock.configHash}`);
    if (m.lockSha256 !== lockSha) why.push(`tệp khóa khác (sha256 ${m.lockSha256} ≠ ${lockSha})`);
    if (why.length > 0) throw new Error(`Từ chối: kỳ mù B đã chạy dưới tệp khóa khác (${mp}): ${why.join('; ')} — B chỉ chạy một lần, không tệp khóa mới nào được chạy`);
  }
  const rerun = a.rerunAfterCrash;
  let todo = lock.candidates;
  if (rerun !== undefined) {
    const c = lock.candidates.find((x) => x.id === rerun);
    if (c === undefined) throw new Error(`--rerun-after-crash: không có ứng viên "${rerun}" trong tệp khóa`);
    if (!existsSync(join(dirOf(rerun), 'started.json'))) throw new Error(`--rerun-after-crash ${rerun}: chưa có lần chạy nào để chạy lại`);
    if (existsSync(join(dirOf(rerun), 'summary.json'))) throw new Error(`Từ chối: ứng viên "${rerun}" đã chạy XONG trên kỳ mù — không chạy lại`);
    // tiếp tục lượt đã đổ: chạy lại <id>, rồi các ứng viên CHƯA bắt đầu; ứng viên đã xong giữ nguyên (không chạy lại)
    for (const x of lock.candidates) {
      if (x.id !== rerun && existsSync(dirOf(x.id)) && !existsSync(join(dirOf(x.id), 'summary.json'))) {
        throw new Error(`Từ chối: ứng viên "${x.id}" cũng có marker mà chưa xong — chỉ chạy lại một ứng viên mỗi lượt`);
      }
    }
    todo = [c, ...lock.candidates.filter((x) => x.id !== rerun && !existsSync(dirOf(x.id)))];
  } else {
    for (const c of todo) {
      const dir = dirOf(c.id);
      if (existsSync(join(dir, 'summary.json'))) throw new Error(`Từ chối: ứng viên "${c.id}" đã chạy XONG trên kỳ mù (${dir}) — mỗi ứng viên chỉ một lần`);
      if (existsSync(dir)) throw new Error(`Từ chối: ứng viên "${c.id}" đã chạy (${dir} có marker, chưa xong — có thể đổ giữa chừng). Chạy lại chỉ với --rerun-after-crash ${c.id} (được ghi vào kết quả)`);
    }
  }
  const inputs = snapshotInputs(d.repoRoot, a.dir ?? 'data/cache');
  for (const c of todo) {
    const dir = dirOf(c.id);
    mkdirSync(dir, { recursive: true });
    const mp = join(dir, 'started.json');
    const prev: Attempt[] = existsSync(mp) ? readMarker(mp).attempts : [];
    const isRerun = rerun === c.id;
    const marker: Marker = { candidate: c, lockedCommit: lock.lockedCommit, configHash: hash, lockSha256: lockSha, inputs, window: { start: iso(d.period.start), end: iso(d.period.end) },
      attempts: [...prev, { startedAt: d.now().toISOString(), rerunAfterCrash: isRerun }] };
    writeFileSync(mp, JSON.stringify(marker, null, 2)); // TRƯỚC khi mô phỏng
    const eff = effective.get(c.id)!;
    writeFileSync(join(dir, 'effective.json'), JSON.stringify(eff, null, 2));
    d.log(`[${c.id}] bắt đầu: ${c.mode} ${c.filter} ${c.policy} biến thể ${c.variant}${isRerun ? ' (CHẠY LẠI SAU KHI ĐỔ)' : ''}`);
    const req: SimRequest = { candidate: c, mode: c.mode, window: { ...d.period }, filter: eff.filter, policy: eff.policy, capital: lock.capital,
      pauseHours: lock.pauseHours, configOverride: eff.configOverride, auth };
    const res = await d.simulate(req);
    writeOutputs(dir, req, res, { lockedCommit: lock.lockedCommit, configHash: hash, criteria: lock.criteria, rerunAfterCrash: isRerun, attempts: marker.attempts,
      lockFile: a.lock, lockSha256: lockSha, inputs, finishedAt: d.now().toISOString() });
    d.log(`[${c.id}] xong → ${dir}`);
  }
}

function writeOutputs(dir: string, req: SimRequest, res: SimResult, meta: Record<string, unknown>): void {
  writeFileSync(join(dir, 'trades.jsonl'), res.done.map((r) => JSON.stringify(r)).join('\n') + (res.done.length > 0 ? '\n' : ''));
  const curve = res.book.curve.filter((_, i, arr) => i === arr.length - 1 || arr[i + 1]!.t !== arr[i]!.t);
  writeFileSync(join(dir, 'equity.json'), JSON.stringify(curve));
  const trades: StatTrade[] = res.done;
  const filled = res.done.filter((r) => r.filled);
  const worst = filled.reduce<(typeof filled)[number] | null>((w, r) => (w === null || r.pctEquity < w.pctEquity ? r : w), null);
  const opts = { mode: req.mode, window: req.window, filter: req.filter, policy: req.policy, capital: req.capital, pauseHours: req.pauseHours, dir: '' };
  const summary = { ...report(res, opts), period: 'blind', blind: { candidate: req.candidate, configOverride: req.configOverride, ...meta } };
  const stats = {
    boot: BOOT,
    overall: computeStats(trades, { ...BOOT, equity: { capital: req.capital, curve: res.book.curve } }),
    long: computeStats(trades.filter((r) => r.side === 'long'), BOOT),
    short: computeStats(trades.filter((r) => r.side === 'short'), BOOT),
    breaches2pct: summary.all.breaches2pct, // lỗ thật (gồm phí, trượt, funding) > 2% vốn lúc vào
    worstLossPct: worst !== null && worst.pctEquity < 0 ? worst.pctEquity : null, worstLossId: worst !== null && worst.pctEquity < 0 ? worst.id : null,
  };
  writeFileSync(join(dir, 'stats.json'), JSON.stringify(stats, null, 2));
  writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 2)); // SAU CÙNG = đã xong
}

// ---------------------------------------------------------------- CLI --------------------------------------------------------------
async function main() {
  const { values: v } = parseArgs({ options: {
    lock: { type: 'string' }, 'rerun-after-crash': { type: 'string' }, 'print-config-hash': { type: 'boolean', default: false },
    dir: { type: 'string', default: 'data/cache' },
  } });
  if (v['print-config-hash']) { console.log(configHash()); return; }
  if (v.lock === undefined) throw new Error('thiếu --lock docs/verification/khoa-luat-mo-phong-mu.md');
  const dir = v.dir!;
  const deps: BlindDeps = {
    repoRoot: REPO_ROOT, period: { ...BLIND_PERIOD },
    git: (args) => execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }),
    now: () => new Date(),
    log: (m) => console.log(m),
    simulate: async (req) => {
      const events = parseEvents(JSON.parse(readFileSync(join(REPO_ROOT, 'data/events/events.json'), 'utf8')));
      const contracts = await loadContracts(dir);
      return runSimulation({ dir, mode: req.mode, window: req.window, filter: req.filter, policy: req.policy, capital: req.capital, pauseHours: req.pauseHours,
        configOverride: req.configOverride, auth: req.auth, contracts, events, fetcher: null, log: (m) => console.log(`  [${req.candidate.id}] ${m}`) });
    },
  };
  await runBlind({ lock: v.lock, dir, ...(v['rerun-after-crash'] !== undefined ? { rerunAfterCrash: v['rerun-after-crash'] } : {}) }, deps);
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    console.error(`LỖI: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    process.exit(1);
  });
}
