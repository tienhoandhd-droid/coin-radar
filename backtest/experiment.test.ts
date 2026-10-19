import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VARIANTS, assertDevPeriod, requireWired, logVariants, countTrials, formatLogRow, LOG_HEADER, decide, parseFromOutput, validateSource,
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
    if (v.wired) { assert.ok(v.run !== null, `${v.name}: đã nối phải có run`); assert.deepEqual(v.configOverride, {}, `${v.name}: đã nối thì không được dựa vào configOverride`); }
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

test('nhật ký: đọc tên biến thể từ bảng, đếm số lần thử (không tính gốc), dòng mới đúng số cột', () => {
  const log = `${LOG_HEADER}| 2026-10-19 | baseline | swing | x | y | 96 | a | — | b | c | d | gốc |\n| 2026-10-19 | exit-A0 | swing | x | y | 105 | a | b | c | d | e | f |\n| 2026-10-19 | exit-A0 | fast | x | y | 1 | a | b | c | d | e | f |\n`;
  assert.deepEqual(logVariants(log), ['baseline', 'exit-A0', 'exit-A0']);
  assert.equal(countTrials(log, 'baseline'), 1);
  assert.equal(countTrials(log, 'exit-A0'), 1);
  assert.equal(countTrials(log, 'p1-cost-floor-k010'), 2);
  assert.equal(countTrials(LOG_HEADER, 'baseline'), 1, 'Bonferroni cần k ≥ 1');
  const cols = (s: string) => s.trim().split('|').length;
  const headerRow = LOG_HEADER.trim().split('\n').find((l) => l.startsWith('| Ngày'))!;
  const row = formatLogRow({ date: '2026-10-19', variant: 'v', mode: 'swing', change: 'a|b', rationale: 'r', trades: 3, expectancy: 'e', delta: 'd', totalPct: 't', pf: 'p', maxDd: 'm', decision: 'q' });
  assert.equal(cols(row), cols(headerRow));
  assert.match(row, /a\/b/, 'ký tự | trong ô bị thay để không vỡ bảng');
});

test('decide: gốc; < 30 lệnh/cặp; cận dưới Bonferroni > 0 và DD không tệ hơn → đạt', () => {
  assert.match(decide({ baseline: true, trades: 96, matched: 0, adjLo: NaN, dd: 20, baseDd: 20 }), /gốc/);
  assert.match(decide({ baseline: false, trades: 20, matched: 20, adjLo: 0.1, dd: 10, baseDd: 20 }), /không kết luận được/);
  assert.match(decide({ baseline: false, trades: 90, matched: 12, adjLo: 0.1, dd: 10, baseDd: 20 }), /không kết luận được/);
  assert.match(decide({ baseline: false, trades: 90, matched: 60, adjLo: 0.01, dd: 19, baseDd: 20 }), /^đạt/);
  assert.match(decide({ baseline: false, trades: 90, matched: 60, adjLo: 0.01, dd: 25, baseDd: 20 }), /không nhận.*DD/);
  assert.match(decide({ baseline: false, trades: 90, matched: 60, adjLo: -0.01, dd: 10, baseDd: 20 }), /không nhận/);
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
