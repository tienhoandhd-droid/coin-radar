import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseLock, configHash, canonicalJson, runBlind, effectiveSpec, type BlindDeps, type Lock, type SimRequest,
} from './blind-run.ts';
import { stackRun, BASELINE_SPEC, VARIANTS } from './experiment.ts';
import { BLIND_C_PERIOD, BLIND_PERIOD, DEV_PERIOD, LOCK_FILE, LOCK_FILE_C } from './replay.ts';
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
      { id: 'swing-base', mode: 'swing', filter: 'all', policy: 'C2', variant: 'baseline', base: 'baseline' },
      { id: 'swing-tp1', mode: 'swing', filter: 'all', policy: 'C2', variant: 'tp1-any-strength', base: 'baseline' },
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
    [md(lockObj({ candidates: [{ id: 'x', mode: 'swing', filter: 'all', policy: 'C2', base: 'baseline' } as never] })), /variant/],
    [md(lockObj({ candidates: [{ id: 'x', mode: 'swing', filter: 'all', policy: 'C2', variant: 'baseline' } as never] })), /base/],
    [md(lockObj({ candidates: [{ id: 'x', mode: 'scalp', filter: 'all', policy: 'C2', variant: 'baseline', base: 'baseline' } as never] })), /mode/],
    [md(lockObj({ candidates: [{ id: '../x', mode: 'swing', filter: 'all', policy: 'C2', variant: 'baseline', base: 'baseline' }] })), /id/],
    [md(lockObj({ candidates: [{ id: 'x', mode: 'swing', filter: 'all', policy: 'C2', variant: 'baseline', base: 'baseline' }, { id: 'x', mode: 'fast', filter: 'all', policy: 'C2', variant: 'baseline', base: 'baseline' }] })), /trùng/],
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

test('từ chối: cây làm việc có thay đổi — mọi tệp đã theo dõi (trừ tệp khóa), tệp mới trong packages/ scanner/ backtest/ data/events/', async () => {
  const bad = [' M backtest/simulate.ts', ' M data/events/events.json', 'M  packages/core/config.ts', ' M reports/x.md', ' D README.md',
    '?? backtest/moi.ts', '?? packages/core/moi.ts', '?? scanner/moi.ts', '?? data/events/moi.json', 'R  a.ts -> b.ts'];
  for (const line of bad) {
    const w = world();
    w.dirty = line + '\n';
    await assert.rejects(runBlind(args, w.deps), /thay đổi chưa commit/, line);
    assert.equal(w.calls.length, 0);
    const st = w.gitCalls.find((a) => a[0] === 'status')!;
    assert.ok(!st.includes('--'), 'kiểm cả kho, không giới hạn thư mục');
  }
  // tệp khóa (mới hoặc đã sửa) và tệp mới ngoài vùng ảnh hưởng quyết định → được
  for (const ok of [`?? ${LOCK_FILE}`, ` M ${LOCK_FILE}`, '?? reports/nhap.md', `?? ${LOCK_FILE}\n?? docs/ghi-chu.md`]) {
    const w = world();
    w.dirty = ok + '\n';
    await runBlind(args, w.deps);
    assert.equal(w.calls.length, 2, ok);
  }
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
    [{ id: 'x', mode: 'swing', filter: 'all', policy: 'C2', variant: 'khong-co', base: 'baseline' }, /không có biến thể/],
    [{ id: 'x', mode: 'swing', filter: 'all', policy: 'C2', variant: 'p2-fast-off', base: 'baseline' }, /chưa nối/],
    [{ id: 'x', mode: 'fast', filter: 'all', policy: 'C2', variant: 'p4-trend-only', base: 'baseline' }, /chế độ/],
    [{ id: 'x', mode: 'swing', filter: 'all', policy: 'C2', variant: 'exit-A0', base: 'baseline' }, /policy/],
    [{ id: 'x', mode: 'swing', filter: 'all', policy: 'C2', variant: 'filter-A', base: 'baseline' }, /filter/],
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
  // hai ứng viên dở dang → chạy lại một cái bị từ chối cả lượt
  const crash = w.deps.simulate;
  w.deps.simulate = async () => { throw new Error('đổ'); };
  await assert.rejects(runBlind(args, w.deps), /đổ/);
  await assert.rejects(runBlind({ ...args, rerunAfterCrash: 'swing-base' }, w.deps), /đổ/); // swing-base đổ lần 2
  w.deps.simulate = crash;
  const m = JSON.parse(readFileSync(join(w.root, 'output/blind/swing-base/started.json'), 'utf8'));
  mkdirSync(join(w.root, 'output/blind/swing-tp1'), { recursive: true });
  writeFileSync(join(w.root, 'output/blind/swing-tp1/started.json'), JSON.stringify({ ...m, candidate: lockObj().candidates[1] }));
  await assert.rejects(runBlind({ ...args, rerunAfterCrash: 'swing-base' }, w.deps), /swing-tp1.*cũng có marker/);
  assert.equal(w.calls.length, 0);
});

test('--rerun-after-crash: started.json hỏng → lỗi nêu rõ tệp', async () => {
  const w = world(md(lockObj({ candidates: [lockObj().candidates[0]!] })));
  mkdirSync(join(w.root, 'output/blind/swing-base'), { recursive: true });
  writeFileSync(join(w.root, 'output/blind/swing-base/started.json'), '{ hỏng');
  await assert.rejects(runBlind({ ...args, rerunAfterCrash: 'swing-base' }, w.deps), /started\.json.*hỏng|không đọc được marker/);
});

// ---------------------------------------------------------------- B chỉ một lần cho MỌI tệp khóa -----------------------------------
test('một lần TOÀN CỤC: đã có lần chạy B dưới tệp khóa khác (thêm id, đổi lockedCommit, đổi nội dung) → không tệp khóa mới nào được chạy', async () => {
  const one = lockObj({ candidates: [lockObj().candidates[0]!] });
  const runFirst = async () => { const w = world(md(one)); await runBlind(args, w.deps); w.calls.length = 0; return w; };
  // thêm id mới
  let w = await runFirst();
  writeFileSync(join(w.root, LOCK_FILE), md(lockObj()));
  await assert.rejects(runBlind(args, w.deps), /tệp khóa khác/);
  // đổi lockedCommit (HEAD cũng đổi theo)
  w = await runFirst();
  const B = 'b'.repeat(40);
  w.head = B;
  writeFileSync(join(w.root, LOCK_FILE), md({ ...one, lockedCommit: B, candidates: [{ ...one.candidates[0]!, id: 'moi' }] }));
  await assert.rejects(runBlind(args, w.deps), /lockedCommit/);
  // chỉ đổi nội dung (văn bản ngoài khối json)
  w = await runFirst();
  writeFileSync(join(w.root, LOCK_FILE), md(one) + '\nsửa sau\n');
  await assert.rejects(runBlind(args, w.deps), /tệp khóa khác/);
  // thư mục lạ không có marker, hoặc marker của id không có trong tệp khóa
  w = world(md(one));
  mkdirSync(join(w.root, 'output/blind/la'), { recursive: true });
  await assert.rejects(runBlind(args, w.deps), /không có started\.json|không có trong tệp khóa/);
  assert.equal(w.calls.length, 0);
});

test('marker và summary ghi sha256 tệp khóa + ảnh chụp đầu vào (thư mục đệm, băm exchange-info/universe/events)', async () => {
  const w = world(md(lockObj({ candidates: [lockObj().candidates[0]!] })));
  mkdirSync(join(w.root, 'data/events'), { recursive: true });
  writeFileSync(join(w.root, 'data/events/events.json'), '[]');
  await runBlind(args, w.deps);
  const { createHash } = await import('node:crypto');
  const sha = (t: string) => createHash('sha256').update(t).digest('hex');
  const m = JSON.parse(readFileSync(join(w.root, 'output/blind/swing-base/started.json'), 'utf8'));
  assert.equal(m.lockSha256, sha(readFileSync(join(w.root, LOCK_FILE), 'utf8')));
  assert.equal(m.inputs.dir, 'data/cache');
  assert.equal(m.inputs.sha256['data/events/events.json'], sha('[]'));
  assert.equal(m.inputs.sha256['exchange-info.json'], null);
  const sum = JSON.parse(readFileSync(join(w.root, 'output/blind/swing-base/summary.json'), 'utf8'));
  assert.equal(sum.blind.lockSha256, m.lockSha256);
  assert.deepEqual(sum.blind.inputs, m.inputs);
});

// ---------------------------------------------------------------- kỳ mù C: marker riêng ----------------------------------------------
// Thế giới có CẢ hai tệp khóa; mô phỏng giả ghi lại thư mục marker của kỳ để kiểm marker có TRƯỚC khi chạy
function worldBC(): World {
  const w = world();
  writeFileSync(join(w.root, LOCK_FILE_C), md(lockObj()));
  w.deps.simulate = async (req) => {
    w.calls.push(req);
    const inB = existsSync(join(w.root, 'output/blind', req.candidate.id, 'started.json'));
    const inC = existsSync(join(w.root, 'output/blind-C', req.candidate.id, 'started.json'));
    assert.ok(inB || inC, 'marker phải ghi trước khi chạy');
    return fakeResult(req.capital);
  };
  return w;
}

test('kỳ C: marker riêng — B đã chạy không chặn C; C ghi vào output/blind-C và chỉ chạy một lần', async () => {
  const w = worldBC();
  await runBlind(args, w.deps); // B (cửa sổ giả)
  assert.equal(w.calls.length, 2);
  await runBlind({ lock: LOCK_FILE_C }, w.deps); // C không bị marker của B chặn
  assert.equal(w.calls.length, 4);
  for (const id of ['swing-base', 'swing-tp1']) {
    assert.ok(existsSync(join(w.root, 'output/blind-C', id, 'summary.json')));
    const sum = JSON.parse(readFileSync(join(w.root, 'output/blind-C', id, 'summary.json'), 'utf8'));
    assert.equal(sum.period, 'blind-c');
    assert.equal(sum.blind.blindPeriod, 'C');
    assert.equal(JSON.parse(readFileSync(join(w.root, 'output/blind', id, 'summary.json'), 'utf8')).period, 'blind');
  }
  await assert.rejects(runBlind({ lock: LOCK_FILE_C }, w.deps), /đã chạy/); // C lần hai
  await assert.rejects(runBlind(args, w.deps), /đã chạy/); // B lần hai
  assert.equal(w.calls.length, 4);
});

test('kỳ C: một lần TOÀN CỤC theo kỳ — đã có lần chạy C dưới tệp khóa khác → từ chối C, B vẫn chạy được', async () => {
  const w = worldBC();
  writeFileSync(join(w.root, LOCK_FILE_C), md(lockObj({ candidates: [lockObj().candidates[0]!] })));
  await runBlind({ lock: LOCK_FILE_C }, w.deps);
  writeFileSync(join(w.root, LOCK_FILE_C), md(lockObj()));
  await assert.rejects(runBlind({ lock: LOCK_FILE_C }, w.deps), /kỳ mù C đã chạy dưới tệp khóa khác/);
  assert.equal(w.calls.length, 1);
  await runBlind(args, w.deps); // marker của C không chặn B
  assert.equal(w.calls.length, 3);
});

test('kỳ C: cửa sổ C thật với tệp khóa của B, hoặc tệp khóa không thuộc kỳ nào → từ chối TRƯỚC khi ghi marker/chạy', async () => {
  const w = worldBC();
  w.deps.period = { ...BLIND_C_PERIOD };
  await assert.rejects(runBlind(args, w.deps), /Từ chối chạy trên kỳ mù C/);
  delete w.deps.period;
  writeFileSync(join(w.root, 'docs/khac.md'), md(lockObj()));
  await assert.rejects(runBlind({ lock: 'docs/khac.md' }, w.deps), /không phải tệp khóa của kỳ mù nào/);
  assert.equal(w.calls.length, 0);
  assert.equal(existsSync(join(w.root, 'output')), false);
});

test('runSimulation: cửa sổ chạm C mà không có auth (hoặc auth của B) → ném lỗi', async () => {
  const { runSimulation } = await import('./simulate-run.ts');
  const base = { dir: '/khong/co', mode: 'swing' as const, window: { start: BLIND_C_PERIOD.end - H, end: BLIND_C_PERIOD.end + H }, filter: 'all' as const,
    policy: 'C2' as const, capital: 1000, pauseHours: 24, contracts: [], events: [], fetcher: null, log: () => {} };
  await assert.rejects(runSimulation(base), /Từ chối chạy trên kỳ mù C/);
  await assert.rejects(runSimulation({ ...base, auth: { blind: true, lockFile: LOCK_FILE } }), /kỳ mù C.*tệp khóa luật phải là/);
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

test('--rerun-after-crash tiếp tục lượt đã đổ: chạy lại ứng viên đổ + ứng viên chưa bắt đầu, KHÔNG chạy lại ứng viên đã xong', async () => {
  const c3 = { id: 'swing-a0', mode: 'swing' as const, filter: 'all' as const, policy: 'A0' as const, variant: 'exit-A0', base: 'baseline' };
  const w = world(md(lockObj({ candidates: [...lockObj().candidates, c3] })));
  const ok = w.deps.simulate;
  w.deps.simulate = async (req) => { await ok(req); if (req.candidate.id === 'swing-tp1') throw new Error('đổ giữa chừng'); return fakeResult(req.capital); };
  await assert.rejects(runBlind(args, w.deps), /đổ giữa chừng/);
  assert.deepEqual(w.calls.map((c) => c.candidate.id), ['swing-base', 'swing-tp1']);
  w.deps.simulate = ok;
  await runBlind({ ...args, rerunAfterCrash: 'swing-tp1' }, w.deps);
  assert.deepEqual(w.calls.map((c) => c.candidate.id), ['swing-base', 'swing-tp1', 'swing-tp1', 'swing-a0']);
  const base = JSON.parse(readFileSync(join(w.root, 'output/blind/swing-base/started.json'), 'utf8'));
  assert.equal(base.attempts.length, 1);
  const a0 = JSON.parse(readFileSync(join(w.root, 'output/blind/swing-a0/summary.json'), 'utf8'));
  assert.equal(a0.blind.rerunAfterCrash, false);
});

// ---------------------------------------------------------------- gốc chồng (base) ---------------------------------------------------
test('effectiveSpec: combo-loc/p2-fast-4h trên gốc f1-funding-fix = đúng cấu hình hiệu lực đã chạy trên D (effective.json, hoặc stackRun)', () => {
  const cases = [
    { id: 'x', mode: 'swing' as const, filter: 'all' as const, policy: 'C2' as const, variant: 'combo-loc', base: 'f1-funding-fix' },
    { id: 'y', mode: 'fast' as const, filter: 'all' as const, policy: 'C2' as const, variant: 'p2-fast-4h', base: 'f1-funding-fix' },
  ];
  for (const c of cases) {
    const got = effectiveSpec(c);
    const f = join(import.meta.dirname, '..', 'output/experiments', c.variant, c.mode, 'effective.json');
    const want = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : { base: c.base, ...stackRun(stackRun(BASELINE_SPEC, VARIANTS[c.base]!), VARIANTS[c.variant]!) };
    assert.equal(want.base, c.base);
    assert.deepEqual({ policy: got.policy, filter: got.filter, configOverride: got.configOverride },
      { policy: want.policy, filter: want.filter, configOverride: want.configOverride }, c.variant);
    assert.equal(got.configOverride['COMMON.risk.fundingRuntimeGuard'], true, 'phải gồm cấu hình của gốc f1');
  }
  assert.deepEqual(effectiveSpec({ id: 'z', mode: 'swing', filter: 'all', policy: 'C2', variant: 'baseline', base: 'baseline' }), { base: 'baseline', ...BASELINE_SPEC });
});

test('từ chối: gốc không có / chưa nối / policy hoặc filter của ứng viên trái cấu hình chồng', async () => {
  const cases: Array<[Lock['candidates'][number], RegExp]> = [
    [{ id: 'x', mode: 'swing', filter: 'all', policy: 'C2', variant: 'combo-loc', base: 'khong-co' }, /không có biến thể/],
    [{ id: 'x', mode: 'swing', filter: 'all', policy: 'C2', variant: 'combo-loc', base: 'p2-fast-off' }, /chưa nối/],
    [{ id: 'x', mode: 'swing', filter: 'all', policy: 'C2', variant: 'combo-loc', base: 'p2-fast-4h' }, /chế độ/],
    [{ id: 'x', mode: 'swing', filter: 'all', policy: 'C2', variant: 'tp1-any-strength', base: 'exit-A0' }, /policy/],
    [{ id: 'x', mode: 'swing', filter: 'A', policy: 'C2', variant: 'tp1-any-strength', base: 'f1-funding-fix' }, /filter/],
  ];
  for (const [c, re] of cases) {
    const w = world(md(lockObj({ candidates: [c] })));
    await assert.rejects(runBlind(args, w.deps), re);
    assert.equal(w.calls.length, 0);
  }
});

test('chạy với gốc chồng: mô phỏng nhận cấu hình chồng; effective.json ghi TRƯỚC khi chạy', async () => {
  const c = { id: 'swing-combo', mode: 'swing' as const, filter: 'all' as const, policy: 'C2' as const, variant: 'combo-loc', base: 'f1-funding-fix' };
  const w = world(md(lockObj({ candidates: [c] })));
  const ok = w.deps.simulate;
  w.deps.simulate = async (req) => {
    assert.ok(existsSync(join(w.root, 'output/blind/swing-combo/effective.json')), 'effective.json phải có trước khi chạy');
    return ok(req);
  };
  await runBlind(args, w.deps);
  const eff = JSON.parse(readFileSync(join(w.root, 'output/blind/swing-combo/effective.json'), 'utf8'));
  assert.deepEqual(eff, effectiveSpec(c));
  assert.deepEqual(w.calls[0]!.configOverride, eff.configOverride);
  assert.equal(w.calls[0]!.policy, eff.policy);
  assert.equal(w.calls[0]!.filter, eff.filter);
});

// ---------------------------------------------------------------- rà soát C1 / M6 (20/10/2026) ---------------------------------------
test('C1 effectiveSpec dựng ĐỆ QUY theo pinnedBase: cost-cal-sr-long (4 tầng) và sr-long giữ đủ tầng f1-funding-fix như cấu hình đã chạy trên D', () => {
  const f1 = VARIANTS['f1-funding-fix']!.configOverride;
  const sr = VARIANTS['sr-confirm']!.configOverride;
  const want = { ...f1, ...sr, ...VARIANTS['sr-long']!.configOverride };
  const srLong = effectiveSpec({ id: 'a', mode: 'swing', filter: 'all', policy: 'C2', variant: 'sr-long', base: 'sr-confirm' });
  assert.deepEqual(srLong.configOverride, want);
  const cal = effectiveSpec({ id: 'b', mode: 'swing', filter: 'all', policy: 'C2', variant: 'cost-cal-sr-long', base: 'sr-long' });
  assert.deepEqual(cal.configOverride, { ...want, ...VARIANTS['cost-cal-sr-long']!.configOverride });
  assert.equal(cal.configOverride['COMMON.risk.fundingRuntimeGuard'], true, 'tầng f1 không được mất');
  // cost-cal-trend-d1: chốt chặn funding phải có (giữ lệnh tới 180 ngày)
  const td = effectiveSpec({ id: 'c', mode: 'swing', filter: 'all', policy: 'C2', variant: 'cost-cal-trend-d1', base: 'trend-d1' });
  assert.deepEqual(Object.keys(td.configOverride).sort(), ['COMMON.costRoundTripPct', 'COMMON.risk.fundingBufferHorizon', 'COMMON.risk.fundingRuntimeGuard', 'COMMON.trend.enabled']);
  // gốc ghim sai → từ chối
  assert.throws(() => effectiveSpec({ id: 'd', mode: 'swing', filter: 'all', policy: 'C2', variant: 'sr-long', base: 'f1-funding-fix' }), /chỉ chạy với --base sr-confirm/);
  // khớp effective.json của D khi có
  for (const [variant, base] of [['sr-long', 'sr-confirm'], ['cost-cal-trend-d1', 'trend-d1']] as const) {
    const f = join(import.meta.dirname, '..', 'output/experiments', variant, 'swing', 'effective.json');
    if (!existsSync(f)) continue;
    const d = JSON.parse(readFileSync(f, 'utf8'));
    assert.deepEqual(effectiveSpec({ id: 'e', mode: 'swing', filter: 'all', policy: 'C2', variant, base }).configOverride, d.configOverride, variant);
  }
});

test('M6 snapshotInputs: ứng viên bật FGI-hướng → băm thêm fgi.json của thư mục đệm; không bật → không có khóa fgi.json', async () => {
  const { snapshotInputs, usesFgi } = await import('./blind-run.ts');
  const { createHash } = await import('node:crypto');
  const sha = (t: string) => createHash('sha256').update(t).digest('hex');
  const root = mkdtempSync(join(tmpdir(), 'blind-fgi-'));
  mkdirSync(join(root, 'data/cache'), { recursive: true });
  writeFileSync(join(root, 'data/cache/fgi.json'), '{"raw":1}');
  assert.equal(snapshotInputs(root, 'data/cache').sha256['fgi.json'], undefined);
  assert.equal(snapshotInputs(root, 'data/cache', true).sha256['fgi.json'], sha('{"raw":1}'));
  assert.equal(usesFgi(VARIANTS['fgi-dir']!.configOverride), true);
  assert.equal(usesFgi(VARIANTS['trend-d1']!.configOverride), false);
  // chạy thật qua runBlind: ứng viên fgi-dir → marker có sha256 của fgi.json
  const c = { id: 'swing-fgi', mode: 'swing' as const, filter: 'all' as const, policy: 'C2' as const, variant: 'fgi-dir', base: 'f1-funding-fix' };
  const w = world(md(lockObj({ candidates: [c] })));
  mkdirSync(join(w.root, 'data/cache'), { recursive: true });
  writeFileSync(join(w.root, 'data/cache/fgi.json'), '{"raw":2}');
  await runBlind(args, w.deps);
  const m = JSON.parse(readFileSync(join(w.root, 'output/blind/swing-fgi/started.json'), 'utf8'));
  assert.equal(m.inputs.sha256['fgi.json'], sha('{"raw":2}'));
});
