import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VARIANTS, stackRun, BASELINE_SPEC, assertDevPeriod, requireWired, logRows, countTrials, formatLogRow, upsertLogRow, LOG_HEADER, decide, parseFromOutput, validateSource, resamplesFor,
  checkBase, notTrialNames, COST_CALIBRATED,
} from './experiment.ts';
import { DEV_PERIOD } from './replay.ts';

test('chỉ chạy kỳ D: từ chối kỳ mù B và tên lạ', () => {
  assert.doesNotThrow(() => assertDevPeriod('dev'));
  assert.throws(() => assertDevPeriod('blind'), /kỳ mù B/);
  assert.throws(() => assertDevPeriod('all'), /chỉ chạy kỳ D/);
});

test('danh mục biến thể: gốc đã nối; đủ 8 đề xuất; biến thể chưa nối phải ghi hook cần có', () => {
  assert.equal(VARIANTS.baseline!.wired, true);
  assert.deepEqual(VARIANTS.baseline!.run, { policy: 'C2', filter: 'all' });
  const proposals = new Set(Object.values(VARIANTS).map((v) => v.proposal).filter((p) => p !== null));
  assert.deepEqual([...proposals].sort(), [1, 2, 3, 4, 5, 6, 7, 8]);
  for (const v of Object.values(VARIANTS)) {
    if (v.wired) assert.ok(v.run !== null, `${v.name}: đã nối phải có run`);
    else { assert.ok(v.hooks.length > 0, `${v.name}: chưa nối phải ghi hook`); assert.match(v.change, /chưa nối/); }
    assert.ok(v.change.length > 0 && v.rationale.length > 0);
  }
});

test('requireWired: biến thể chưa nối → lỗi nêu hook; tên lạ → lỗi', () => {
  assert.equal(requireWired('baseline').name, 'baseline');
  const unwired = Object.values(VARIANTS).find((v) => !v.wired)!;
  assert.throws(() => requireWired(unwired.name), new RegExp(`chưa nối[\\s\\S]*${unwired.hooks[0]!.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.throws(() => requireWired('khong-co'), /không có biến thể/);
});

const row = (variant: string, mode: string, decision = 'q') => formatLogRow({ date: '2026-10-19', variant, mode, change: 'a|b', rationale: 'r', trades: 3,
  expectancy: 'e', dRPerDay: 'x', dRetPerDay: 'y', deltas: 'z', paired: 'p', k: '1', totalPct: 't', pf: 'p', maxDd: 'm', streak: 's', decision });

test('nhật ký: đọc (biến thể, chế độ); k = số cặp (biến thể × chế độ) khác gốc, tính cả lần đang chạy; chạy lại cùng cặp không tăng k', () => {
  const log = LOG_HEADER + row('baseline', 'swing') + row('filter-A', 'swing') + row('filter-A', 'fast') + row('exit-A0', 'swing');
  assert.deepEqual(logRows(log).map((r) => `${r.variant}/${r.mode}`), ['baseline/swing', 'filter-A/swing', 'filter-A/fast', 'exit-A0/swing']);
  assert.equal(countTrials(log, 'baseline', ['swing', 'fast']), 3);
  assert.equal(countTrials(log, 'exit-A0', ['swing']), 3, 'quyết định lại cùng cặp');
  assert.equal(countTrials(log, 'exit-A0', ['swing', 'fast']), 4, 'mỗi chế độ là một quyết định');
  assert.equal(countTrials(LOG_HEADER, 'baseline', ['swing']), 1, 'Bonferroni cần k ≥ 1');
  assert.match(LOG_HEADER, /Cách đếm k/);
});

test('upsertLogRow: thay dòng cùng (biến thể, chế độ), không thì thêm cuối; ô có | không vỡ bảng', () => {
  const log = LOG_HEADER + row('baseline', 'swing') + row('exit-A0', 'swing', 'cũ') + row('exit-A0', 'fast', 'cũ');
  const next = upsertLogRow(log, row('exit-A0', 'swing', 'mới'));
  assert.equal(logRows(next).length, 3);
  assert.match(next, /mới/);
  assert.equal((next.match(/\| cũ \|/g) ?? []).length, 1);
  assert.equal(logRows(upsertLogRow(log, row('filter-A', 'swing'))).length, 4);
  const cols = (x: string) => x.trim().split('|').length;
  const headerRow = LOG_HEADER.trim().split('\n').find((l) => l.startsWith('| Ngày'))!;
  assert.equal(cols(row('v', 'swing')), cols(headerRow));
  assert.match(row('v', 'swing'), /a\/b/);
});

test('resamplesFor: ≥ 2000·k để đuôi phân vị Bonferroni đủ mẫu', () => {
  assert.equal(resamplesFor(1, 5000), 5000);
  assert.equal(resamplesFor(4, 5000), 8000);
});

const ok = { baseline: false, trades: 90, rPerDayAdjLo: 0.01, retPerDayAdjLo: 0.001, expectancy: -0.1, baseExpectancy: -0.14, dd: 19, baseDd: 20, streak: 10, baseStreak: 12 };
test('decide: tiêu chí cấp DANH MỤC — cận dưới Bonferroni (khối ngày) của Δ R/ngày VÀ Δ lợi suất/ngày > 0, kỳ vọng tăng, DD và chuỗi thua không tệ hơn, ≥ 30 lệnh', () => {
  assert.match(decide({ ...ok, baseline: true }), /gốc/);
  assert.match(decide(ok), /^đạt/);
  assert.match(decide({ ...ok, trades: 20 }), /không kết luận được/);
  assert.match(decide({ ...ok, rPerDayAdjLo: -0.01 }), /không nhận.*R\/ngày/);
  assert.match(decide({ ...ok, retPerDayAdjLo: 0 }), /không nhận.*lợi suất/);
  assert.match(decide({ ...ok, expectancy: -0.2 }), /không nhận.*kỳ vọng/);
  assert.match(decide({ ...ok, dd: 21 }), /không nhận.*DD/);
  assert.match(decide({ ...ok, streak: 13 }), /không nhận.*chuỗi thua/);
});

test('biến thể đã xem trước khi có nhật ký: filter-A (Hạng A) và exit-A0 đã nối', () => {
  assert.deepEqual(VARIANTS['filter-A']!.run, { policy: 'C2', filter: 'A' });
  assert.match(VARIANTS['filter-A']!.rationale, /trước khi có nhật ký/);
  assert.match(VARIANTS['exit-A0']!.rationale, /trước khi có nhật ký/);
});

test('parseFromOutput: swing=…,fast=…', () => {
  assert.deepEqual(parseFromOutput('swing=a/b,fast=c'), { swing: 'a/b', fast: 'c' });
  assert.throws(() => parseFromOutput('x=a'), /swing|fast/);
});

test('validateSource: chỉ nhận kết quả kỳ D đúng chính sách/lọc của biến thể', () => {
  const ok = { period: 'dev', mode: 'swing', policy: 'C2', filter: 'all', window: { start: new Date(DEV_PERIOD.start).toISOString(), end: new Date(DEV_PERIOD.end).toISOString() } };
  assert.doesNotThrow(() => validateSource(ok, VARIANTS.baseline!, 'swing'));
  assert.throws(() => validateSource({ ...ok, period: 'blind' }, VARIANTS.baseline!, 'swing'), /kỳ D/);
  assert.throws(() => validateSource({ ...ok, window: { ...ok.window, end: '2026-10-01T00:00:00.000Z' } }, VARIANTS.baseline!, 'swing'), /kỳ D/);
  assert.throws(() => validateSource({ ...ok, policy: 'A0' }, VARIANTS.baseline!, 'swing'), /C2/);
  assert.throws(() => validateSource(ok, VARIANTS.baseline!, 'fast'), /chế độ/);
});

test('stackRun: thay đổi được nhận CHỒNG lên nhau — cấu hình hiệu lực = gốc + thay đổi của biến thể (khóa trùng: biến thể thắng)', () => {
  const v = { name: 'x', proposal: 1, change: 'c', rationale: 'r', wired: true, run: {}, configOverride: { 'COMMON.a': 2 }, hooks: [] };
  const base = { policy: 'A0' as const, filter: 'all' as const, configOverride: { 'COMMON.a': 1, 'COMMON.b': 1 } };
  assert.deepEqual(stackRun(base, v), { policy: 'A0', filter: 'all', configOverride: { 'COMMON.a': 2, 'COMMON.b': 1 } });
  assert.deepEqual(stackRun(BASELINE_SPEC, { ...v, run: { policy: 'C2' } }).policy, 'C2');
  assert.throws(() => stackRun(BASELINE_SPEC, { ...v, run: null }), /chưa nối/);
});

test('không phải lần thử (sửa định cỡ): không tính vào k; quyết định ghi "gốc mới"', () => {
  const log = LOG_HEADER + row('baseline', 'swing') + row('fix-x', 'swing') + row('exit-A0', 'swing');
  assert.equal(countTrials(log, 'fix-x', ['swing'], new Set(['fix-x'])), 1);
  assert.equal(countTrials(log, 'p', ['swing'], new Set(['fix-x'])), 2);
  assert.match(decide({ ...ok, notTrial: 'sửa đệm funding' }), /không tính là thử, gốc của các lần thử sau — sửa đệm funding/);
});

test('validateSource: biến thể có ghi đè cấu hình không được nhận kết quả mô phỏng có sẵn', () => {
  const src = { period: 'dev', mode: 'swing', policy: 'C2', filter: 'all', window: { start: new Date(DEV_PERIOD.start).toISOString(), end: new Date(DEV_PERIOD.end).toISOString() } };
  assert.throws(() => validateSource(src, VARIANTS['tp1-any-strength']!, 'swing'), /ghi đè cấu hình/);
});

test('withLogLock: tuần tự hóa các tiến trình (chờ khóa đang giữ), xóa khóa cả khi lỗi, hết giờ chờ → lỗi nêu đường dẫn', async () => {
  const { withLogLock } = await import('./experiment.ts');
  const { existsSync, writeFileSync, rmSync, mkdtempSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const lock = join(mkdtempSync(join(tmpdir(), 'lock-')), 'x.lock');
  await assert.rejects(withLogLock(lock, async () => { throw new Error('hỏng'); }), /hỏng/);
  assert.equal(existsSync(lock), false);
  writeFileSync(lock, '');
  setTimeout(() => rmSync(lock), 300);
  const order: string[] = [];
  await withLogLock(lock, async () => { order.push('vào sau khi khóa được nhả'); });
  assert.deepEqual(order, ['vào sau khi khóa được nhả']);
  writeFileSync(lock, '');
  await assert.rejects(withLogLock(lock, async () => 1, 300), /bị giữ quá 300 ms/);
  rmSync(lock);
});

test('readEffective: biến thể chưa chạy → lỗi (không âm thầm dùng cấu hình gốc); gốc "baseline" luôn đọc được C2/mọi Đạt', async () => {
  const { readEffective } = await import('./experiment.ts');
  assert.throws(() => readEffective('khong-co-bien-the', 'swing'), /chưa có cấu hình hiệu lực/);
  const b = readEffective('baseline', 'swing');
  assert.equal(b.policy, 'C2');
  assert.equal(b.filter, 'all');
});

test('decide: "đạt" so với gốc nhưng bản thân kỳ vọng âm → ghi rõ, không đề xuất bật; dương thì ghi CI', () => {
  assert.match(decide({ ...ok, expectancy: -0.227, baseExpectancy: -0.381, expectancyCiHi: -0.029 }), /đạt tiêu chí D so với gốc nhưng bản thân vẫn âm \(−0,227R, CI trên < 0\) — không đề xuất bật/);
  assert.match(decide({ ...ok, expectancy: -0.05, expectancyCiHi: 0.2 }), /bản thân vẫn âm \(−0,050R, CI chứa 0\)/);
  assert.match(decide({ ...ok, expectancy: 0.1, expectancyCiLo: -0.1, expectancyCiHi: 0.3 }), /bản thân dương nhưng CI chứa 0/);
});

test('độ nhạy chi phí: 4 biến thể chỉ ghi đè costRoundTripPct, ghim gốc như lần chạy gốc, không tính vào k, quyết định KHÔNG ghi "gốc mới"', () => {
  const want: Record<string, { base: string; mode: string }> = {
    'cost-cal-f1': { base: 'f1-funding-fix', mode: 'swing' }, 'cost-cal-combo': { base: 'combo-loc', mode: 'swing' },
    'cost-cal-p2fast': { base: 'p2-fast-4h', mode: 'fast' }, 'cost-cal-base': { base: 'baseline', mode: 'fast' },
  };
  for (const [name, w] of Object.entries(want)) {
    const v = VARIANTS[name]!;
    assert.ok(v.wired && v.sensitivity === true && v.notTrial !== undefined, name);
    assert.deepEqual(v.configOverride, { 'COMMON.costRoundTripPct': COST_CALIBRATED }, name);
    assert.deepEqual(v.modes, [w.mode], name);
    assert.equal(v.pinnedBase, w.base, name);
    assert.ok(notTrialNames().has(name), name);
    assert.doesNotThrow(() => checkBase(v, w.base));
    assert.throws(() => checkBase(v, w.base === 'baseline' ? 'f1-funding-fix' : 'baseline'), /chỉ chạy với --base/);
  }
  assert.doesNotThrow(() => checkBase(VARIANTS['combo-loc']!, 'f1-funding-fix')); // biến thể không ghim gốc: --base tùy ý
  const d = decide({ ...ok, notTrial: 'độ nhạy chi phí', sensitivity: true });
  assert.match(d, /độ nhạy/);
  assert.doesNotMatch(d, /gốc của các lần thử sau/);
});
