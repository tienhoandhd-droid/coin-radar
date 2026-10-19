import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseLock, configHash, canonicalJson, runBlind, type BlindDeps, type Lock, type SimRequest,
} from './blind-run.ts';
import { BLIND_PERIOD, DEV_PERIOD, LOCK_FILE } from './replay.ts';
import { createBook, bookFlow, bookClose, type TradeRecord } from './simulate.ts';
import type { runSimulation } from './simulate-run.ts';

const SHA = 'a'.repeat(40);
const H = 3_600_000;
// Cửa sổ GIẢ cho kiểm thử: 2 ngày đầu kỳ D — KHÔNG phải kỳ mù B
const FAKE = { start: DEV_PERIOD.start, end: DEV_PERIOD.start + 48 * H };

function lockObj(over: Partial<Lock> = {}): Lock {
  return {
    lockedCommit: SHA, configHash: configHash(), capital: 10_000, pauseHours: 24, criteria: 'kỳ vọng R > 0 với cận dưới CI khối ngày > 0',
    candidates: [
      { id: 'swing-base', mode: 'swing', filter: 'all', policy: 'C2', variant: 'baseline' },
      { id: 'swing-tp1', mode: 'swing', filter: 'all', policy: 'C2', variant: 'tp1-any-strength' },
    ],
    ...over,
  };
}
const md = (o: unknown) => `# Khóa luật\n\nvăn bản\n\n\`\`\`json lock\n${JSON.stringify(o, null, 2)}\n\`\`\`\n`;

function trade(id: string, side: 'long' | 'short', pnl: number, day: number, funding = 0): TradeRecord {
  const entry = new Date(FAKE.start + day * 24 * H + H).toISOString();
  const exit = new Date(FAKE.start + day * 24 * H + 5 * H).toISOString();
  return {
    id, symbol: 'XUSDT', side, mode: 'swing', policy: 'C2', grade: 'A', label: 'Đạt', kind: 'zone', score: 1, signalId: id, key: id,
    pathInterval: '1h', entryType: 'limit', placedAt: entry, entryTime: entry, exitTime: exit, filled: true, legs: [], stop: 1, tp1: 2,
    callbackPct: 1, beFloor: null, leverage: 1, avgEntry: 1.5, qty: 1, exits: [], avgExit: 1.6, reason: pnl > 0 ? 'tp' : 'sl',
    gross: pnl - funding + 1, costs: 1, funding, pnl, equityAtEntry: 10_000, pctEquity: (pnl / 10_000) * 100, riskAtFill: 200, R: pnl / 200,
    maeR: null, mfeR: null, maePct: null,
    flags: { iocPartial: false, gap: false, resolvedBars: 0, unresolvedBars: 0, unresolvedTrailing: 0, liquidation: false, fundingGuardTightened: 0, fundingGuardClosed: 0 },
    sizing: { plannedRiskPct: 2, notes: [] },
  } as unknown as TradeRecord;
}

type SimRes = Awaited<ReturnType<typeof runSimulation>>;
function fakeResult(capital: number): SimRes {
  const done = [trade('t1', 'long', 300, 0), trade('t2', 'short', -210, 0, -15), trade('t3', 'long', -100, 1), trade('t4', 'long', 150, 1)];
  const book = createBook({ capital, lossesMax: 5, lossesWindowHours: 24, pauseHours: 24, dailyLossPct: 10, ddAlertPct: 30 });
  for (const r of done) { bookFlow(book, Date.parse(r.exitTime!), r.pnl); bookClose(book, Date.parse(r.exitTime!), r.pnl); }
  return { done, book, stats: { steps: 48 } as SimRes['stats'], skip: new Map(), rejects: new Map(), m1Errors: [], pathIntervalOf: new Map([['XUSDT', '1h']]), wallSeconds: 0 } as SimRes;
}

type World = { root: string; deps: BlindDeps; calls: SimRequest[]; gitCalls: string[][]; head: string; dirty: string };
function world(lockText: string | null = md(lockObj())): World {
  const root = mkdtempSync(join(tmpdir(), 'blind-run-'));
  mkdirSync(join(root, 'docs/verification'), { recursive: true });
  if (lockText !== null) writeFileSync(join(root, LOCK_FILE), lockText);
  const w: World = {
    root, calls: [], gitCalls: [], head: SHA, dirty: '',
    deps: undefined as unknown as BlindDeps,
  };
  w.deps = {
    repoRoot: root,
    period: FAKE,
    git: (args) => {
      w.gitCalls.push(args);
      if (args[0] === 'rev-parse') return w.head + '\n';
      if (args[0] === 'status') return w.dirty;
      throw new Error('git lạ: ' + args.join(' '));
    },
    now: () => new Date('2026-10-20T00:00:00Z'),
    log: () => {},
    simulate: async (req) => {
      w.calls.push(req);
      // marker phải có TRƯỚC khi mô phỏng chạy
      assert.ok(existsSync(join(root, 'output/blind', req.candidate.id, 'started.json')), 'marker phải ghi trước khi chạy');
      return fakeResult(req.capital);
    },
  };
  return w;
}
const args = { lock: LOCK_FILE };

// ---------------------------------------------------------------- tệp khóa ---------------------------------------------------------
test('parseLock: đọc đúng khối ```json lock``` trong Markdown', () => {
  const l = parseLock(md(lockObj()));
  assert.equal(l.lockedCommit, SHA);
  assert.equal(l.candidates.length, 2);
  assert.equal(l.candidates[1]!.variant, 'tp1-any-strength');
});

test('parseLock: tệp khóa sai/thiếu → từ chối', () => {
  const bad: Array<[string, RegExp]> = [
    ['# không có khối', /khối ```json lock/],
    [md(lockObj()) + md(lockObj()), /đúng MỘT khối/],
    ['```json lock\n{ không phải json\n```', /JSON/],
    [md({ ...lockObj(), lockedCommit: 'abc123' }), /lockedCommit/],
    [md({ ...lockObj(), configHash: undefined }), /configHash/],
    [md({ ...lockObj(), capital: 0 }), /capital/],
    [md({ ...lockObj(), pauseHours: undefined }), /pauseHours/],
    [md({ ...lockObj(), criteria: '' }), /criteria/],
    [md({ ...lockObj(), candidates: [] }), /candidates/],
    [md({ ...lockObj(), thua: 1 }), /khóa lạ/],
    [md(lockObj({ candidates: [{ id: 'x', mode: 'swing', filter: 'all', policy: 'C2' } as never] })), /variant/],
    [md(lockObj({ candidates: [{ id: 'x', mode: 'scalp', filter: 'all', policy: 'C2', variant: 'baseline' } as never] })), /mode/],
    [md(lockObj({ candidates: [{ id: '../x', mode: 'swing', filter: 'all', policy: 'C2', variant: 'baseline' }] })), /id/],
    [md(lockObj({ candidates: [{ id: 'x', mode: 'swing', filter: 'all', policy: 'C2', variant: 'baseline' }, { id: 'x', mode: 'fast', filter: 'all', policy: 'C2', variant: 'baseline' }] })), /trùng/],
  ];
  for (const [text, re] of bad) assert.throws(() => parseLock(text), re, text.slice(0, 80));
});

test('configHash: sha256 của JSON chuẩn tắc (khóa sắp xếp) — ổn định, đổi cấu hình thì đổi', async () => {
  assert.match(configHash(), /^[0-9a-f]{64}$/);
  assert.equal(configHash(), configHash());
  assert.equal(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] }), '{"a":[{"c":3,"d":2}],"b":1}');
  assert.throws(() => canonicalJson({ a: Infinity }), /không hữu hạn/);
  const { withConfigOverride } = await import('../packages/core/config-override.ts');
  const h0 = configHash();
  await withConfigOverride({ 'CONFIG.swing.timeStopHours': 999 }, async () => { assert.notEqual(configHash(), h0); });
  assert.equal(configHash(), h0);
});

// ---------------------------------------------------------------- từ chối ----------------------------------------------------------
test('từ chối: HEAD khác lockedCommit', async () => {
  const w = world();
  w.head = 'b'.repeat(40);
  await assert.rejects(runBlind(args, w.deps), /HEAD/);
  assert.equal(w.calls.length, 0);
  assert.equal(existsSync(join(w.root, 'output/blind')), false);
});

test('từ chối: cây làm việc có thay đổi trong packages/ scanner/ backtest/', async () => {
  const w = world();
  w.dirty = ' M backtest/simulate.ts\n';
  await assert.rejects(runBlind(args, w.deps), /thay đổi chưa commit/);
  assert.equal(w.calls.length, 0);
  const st = w.gitCalls.find((a) => a[0] === 'status')!;
  for (const d of ['packages', 'scanner', 'backtest']) assert.ok(st.includes(d), 'phải kiểm ' + d);
});

test('từ chối: configHash không khớp mặc định hiện tại', async () => {
  const w = world(md(lockObj({ configHash: 'c'.repeat(64) })));
  await assert.rejects(runBlind(args, w.deps), /configHash/);
  assert.equal(w.calls.length, 0);
});

test('từ chối: tệp khóa hỏng / không có', async () => {
  await assert.rejects(runBlind(args, world('# rỗng').deps), /khối ```json lock/);
  await assert.rejects(runBlind(args, world(null).deps), /không đọc được tệp khóa/);
});

test('từ chối: biến thể không có / chưa nối / lệch chế độ hoặc chính sách của biến thể', async () => {
  const cases: Array<[Lock['candidates'][number], RegExp]> = [
    [{ id: 'x', mode: 'swing', filter: 'all', policy: 'C2', variant: 'khong-co' }, /không có biến thể/],
    [{ id: 'x', mode: 'swing', filter: 'all', policy: 'C2', variant: 'p2-fast-off' }, /chưa nối/],
    [{ id: 'x', mode: 'fast', filter: 'all', policy: 'C2', variant: 'p4-trend-only' }, /chế độ/],
    [{ id: 'x', mode: 'swing', filter: 'all', policy: 'C2', variant: 'exit-A0' }, /policy/],
    [{ id: 'x', mode: 'swing', filter: 'all', policy: 'C2', variant: 'filter-A' }, /filter/],
  ];
  for (const [c, re] of cases) {
    const w = world(md(lockObj({ candidates: [c] })));
    await assert.rejects(runBlind(args, w.deps), re);
    assert.equal(w.calls.length, 0);
  }
});

test('từ chối: thiếu/sai thủ tục mở kỳ mù — cửa sổ B thật mà tệp khóa không đúng đường dẫn → chặn TRƯỚC khi ghi marker/chạy', async () => {
  const w = world();
  w.deps.period = { ...BLIND_PERIOD };
  writeFileSync(join(w.root, 'docs/khac.md'), md(lockObj()));
  await assert.rejects(runBlind({ lock: 'docs/khac.md' }, w.deps), /Từ chối chạy trên kỳ mù B/);
  assert.equal(w.calls.length, 0);
  assert.equal(existsSync(join(w.root, 'output/blind')), false);
});

test('runSimulation: cửa sổ chạm B mà không có auth → ném lỗi, kiểm TRƯỚC cả ghi đè cấu hình', async () => {
  const { runSimulation } = await import('./simulate-run.ts');
  const base = { dir: '/khong/co', mode: 'swing' as const, window: { start: BLIND_PERIOD.start, end: BLIND_PERIOD.start + H }, filter: 'all' as const,
    policy: 'C2' as const, capital: 1000, pauseHours: 24, contracts: [], events: [], fetcher: null, log: () => {} };
  await assert.rejects(runSimulation(base), /Từ chối chạy trên kỳ mù B/);
  await assert.rejects(runSimulation({ ...base, configOverride: { 'CONFIG.swing.khongCo': 1 } }), /Từ chối chạy trên kỳ mù B/);
  await assert.rejects(runSimulation({ ...base, auth: { blind: true, lockFile: 'docs/khac.md' } }), /tệp khóa luật phải là/);
});

// ---------------------------------------------------------------- một lần mỗi ứng viên ---------------------------------------------
test('mỗi ứng viên chạy đúng một lần: lần hai bị từ chối (kể cả khi lần đầu đã xong)', async () => {
  const w = world();
  await runBlind(args, w.deps);
  assert.equal(w.calls.length, 2);
  await assert.rejects(runBlind(args, w.deps), /đã chạy/);
  assert.equal(w.calls.length, 2);
});

test('marker ghi TRƯỚC khi chạy: tiến trình đổ giữa chừng → chạy lại bị từ chối nếu không có --rerun-after-crash', async () => {
  const w = world(md(lockObj({ candidates: [lockObj().candidates[0]!] })));
  const ok = w.deps.simulate;
  w.deps.simulate = async (req) => { await ok(req); throw new Error('đổ giữa chừng'); };
  await assert.rejects(runBlind(args, w.deps), /đổ giữa chừng/);
  const dir = join(w.root, 'output/blind/swing-base');
  assert.ok(existsSync(join(dir, 'started.json')));
  assert.equal(existsSync(join(dir, 'summary.json')), false);
  w.deps.simulate = ok;
  await assert.rejects(runBlind(args, w.deps), /--rerun-after-crash swing-base/);
  // chạy lại có cờ: được, và ghi lại trong marker + summary
  await runBlind({ ...args, rerunAfterCrash: 'swing-base' }, w.deps);
  const marker = JSON.parse(readFileSync(join(dir, 'started.json'), 'utf8'));
  assert.equal(marker.attempts.length, 2);
  assert.equal(marker.attempts[1].rerunAfterCrash, true);
  const sum = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
  assert.equal(sum.blind.rerunAfterCrash, true);
  assert.equal(sum.blind.attempts.length, 2);
  // đã xong → không còn chạy lại được, kể cả có cờ
  await assert.rejects(runBlind({ ...args, rerunAfterCrash: 'swing-base' }, w.deps), /đã chạy XONG/);
});

test('--rerun-after-crash chỉ cho ứng viên có marker mà chưa xong; ứng viên khác có marker → từ chối cả lượt', async () => {
  const w = world();
  await assert.rejects(runBlind({ ...args, rerunAfterCrash: 'swing-base' }, w.deps), /chưa có lần chạy nào/);
  await assert.rejects(runBlind({ ...args, rerunAfterCrash: 'khong-co' }, w.deps), /không có ứng viên/);
  assert.equal(w.calls.length, 0);
});

// ---------------------------------------------------------------- chạy đúng ---------------------------------------------------------
test('chạy đúng (dữ liệu giả, cửa sổ giả không phải B): truyền đúng cấu hình biến thể + auth, ghi trades/equity/summary/stats', async () => {
  const w = world();
  await runBlind(args, w.deps);
  assert.equal(w.calls.length, 2);
  const [a, b] = w.calls;
  assert.deepEqual(a!.window, FAKE);
  assert.deepEqual(a!.configOverride, {});
  assert.deepEqual(b!.configOverride, { 'COMMON.zones.tp1SkipWeak': false });
  assert.deepEqual(b!.auth, { blind: true, lockFile: LOCK_FILE });
  assert.equal(b!.capital, 10_000);
  assert.equal(b!.pauseHours, 24);
  const dir = join(w.root, 'output/blind/swing-tp1');
  const trades = readFileSync(join(dir, 'trades.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(trades.length, 4);
  const eq = JSON.parse(readFileSync(join(dir, 'equity.json'), 'utf8'));
  assert.ok(Array.isArray(eq) && eq.length > 0);
  const sum = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
  assert.equal(sum.period, 'blind');
  assert.equal(sum.blind.lockedCommit, SHA);
  assert.equal(sum.blind.configHash, configHash());
  assert.equal(sum.blind.candidate.variant, 'tp1-any-strength');
  assert.equal(sum.blind.rerunAfterCrash, false);
  const st = JSON.parse(readFileSync(join(dir, 'stats.json'), 'utf8'));
  assert.equal(st.overall.trades, 4);
  assert.ok(Math.abs(st.overall.expectancyR - (300 - 210 - 100 + 150) / 200 / 4) < 1e-9);
  for (const k of ['expectancyCI', 'expectancyCIBlock']) assert.ok(Number.isFinite(st.overall[k].lo) && Number.isFinite(st.overall[k].hi), k);
  assert.ok(Math.abs(st.overall.totalReturnPct - 1.4) < 1e-9);
  assert.ok(Math.abs(st.overall.profitFactor - 450 / 310) < 1e-9);
  assert.ok(st.overall.maxDrawdownPct > 0);
  assert.equal(st.overall.longestLosingStreak, 2);
  assert.equal(st.overall.winRate, 0.5);
  assert.equal(st.long.trades, 3);
  assert.equal(st.short.trades, 1);
  assert.equal(st.breaches2pct.count, 1, 'lệnh −210 = −2,1% vốn (gồm funding −15) vượt 2%');
  assert.ok(Math.abs(st.worstLossPct - -2.1) < 1e-9);
  assert.equal(st.worstLossId, 't2');
});
