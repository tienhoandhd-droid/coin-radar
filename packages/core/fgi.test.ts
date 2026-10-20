import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFgi, fgiDirectionAt } from './fgi.ts';

const DAY = 86_400_000;
const D0 = Date.UTC(2026, 6, 1); // 01/07/2026 00:00 UTC
const cfg = { lagDays: 1, meanDays: 7, threshold: 50 };
// Bản thô như API Alternative.me (mới nhất trước, timestamp giây, value chuỗi)
const raw = (vals: number[], start = D0) => ({
  name: 'Fear and Greed Index', metadata: { error: null },
  data: vals.map((v, i) => ({ value: String(v), value_classification: 'x', timestamp: String((start + i * DAY) / 1000) })).reverse(),
});

test('parseFgi: đổi chuỗi → số, ngày UTC, tăng dần; lỗi nguồn / giá trị hỏng / trùng ngày → ném lỗi', () => {
  const rows = parseFgi(raw([10, 20, 30]));
  assert.deepEqual(rows, [{ day: D0, value: 10 }, { day: D0 + DAY, value: 20 }, { day: D0 + 2 * DAY, value: 30 }]);
  assert.throws(() => parseFgi({ data: [], metadata: { error: 'down' } }), /nguồn báo lỗi/);
  assert.throws(() => parseFgi({ data: [{ value: 'x', timestamp: '1' }] }), /giá trị không hợp lệ/);
  assert.throws(() => parseFgi({ data: [{ value: '1', timestamp: String(D0 / 1000) }, { value: '2', timestamp: String(D0 / 1000 + 3600) }] }), /trùng ngày/);
  assert.throws(() => parseFgi({}), /thiếu mảng data/);
});

test('fgiDirectionAt: giá trị ngày d chỉ dùng từ 00:00 UTC ngày d+1 (trễ 1 ngày); TB 7 ngày ≥ 50 → Long, < 50 → Short', () => {
  // ngày 0..6 = 40 (Sợ hãi), ngày 7 = 100
  const rows = parseFgi(raw([40, 40, 40, 40, 40, 40, 40, 100]));
  // t = 00:00 ngày 7: mới biết tới ngày 6 → TB(0..6) = 40 → Short; giá trị ngày 7 (100) CHƯA được dùng dù đã có trong dữ liệu
  const a = fgiDirectionAt(rows, D0 + 7 * DAY, cfg);
  assert.equal(a.side, 'short');
  assert.match(a.reason, /40,0 < 50/);
  assert.match(a.reason, /Alternative\.me/);
  // giữa ngày 7 vẫn chưa biết ngày 7
  assert.equal(fgiDirectionAt(rows, D0 + 7 * DAY + 23 * 3_600_000, cfg).side, 'short');
  // 00:00 ngày 8: TB(1..7) = (6×40 + 100)/7 = 48,6 → Short; ngưỡng biên: TB đúng 50 → Long
  assert.equal(fgiDirectionAt(rows, D0 + 8 * DAY, cfg).side, 'short');
  const even = parseFgi(raw([50, 50, 50, 50, 50, 50, 50]));
  assert.equal(fgiDirectionAt(even, D0 + 7 * DAY, cfg).side, 'long');
});

test('fgiDirectionAt: thiếu bất kỳ ngày nào trong 7 ngày cần (nguồn chậm, khoảng trống) → side null (không vào lệnh mới)', () => {
  const rows = parseFgi(raw([60, 60, 60, 60, 60, 60, 60]));
  assert.equal(fgiDirectionAt(rows, D0 + 7 * DAY, cfg).side, 'long');
  const late = fgiDirectionAt(rows, D0 + 9 * DAY, cfg); // cần tới ngày 8 — chưa có
  assert.equal(late.side, null);
  assert.match(late.reason, /thiếu ngày/);
  const gap = rows.filter((r) => r.day !== D0 + 3 * DAY); // bỏ ngày 3
  assert.equal(fgiDirectionAt(gap, D0 + 7 * DAY, cfg).side, null);
  assert.equal(fgiDirectionAt([], D0, cfg).side, null);
});
