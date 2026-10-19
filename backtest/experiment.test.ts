import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VARIANTS, stackRun, BASELINE_SPEC, assertDevPeriod, requireWired, logRows, countTrials, formatLogRow, upsertLogRow, LOG_HEADER, decide, parseFromOutput, validateSource, resamplesFor,
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
  assert.match(decide({ ...ok, notTrial: 'sửa đệm funding' }), /không tính là thử — gốc mới/);
});

test('validateSource: biến thể có ghi đè cấu hình không được nhận kết quả mô phỏng có sẵn', () => {
  const src = { period: 'dev', mode: 'swing', policy: 'C2', filter: 'all', window: { start: new Date(DEV_PERIOD.start).toISOString(), end: new Date(DEV_PERIOD.end).toISOString() } };
  assert.throws(() => validateSource(src, VARIANTS['tp1-any-strength']!, 'swing'), /ghi đè cấu hình/);
});
