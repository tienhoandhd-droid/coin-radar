import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScanArgs } from './args.ts';

test('mặc định: swing, vốn 1000, không giới hạn', () => {
  assert.deepEqual(parseScanArgs({}), { mode: 'swing', capital: 1000, limit: null, showB: false, showOld: false });
});
test('giá trị hợp lệ', () => {
  assert.deepEqual(parseScanArgs({ mode: 'fast', capital: '2500.5', limit: '20' }), { mode: 'fast', capital: 2500.5, limit: 20, showB: false, showOld: false });
});
test('--capital sai → lỗi tiếng Việt kèm ví dụ', () => {
  for (const bad of ['abc', '', '0', '-5', '1e3', '1,000', ' 100', 'Infinity', '0.0']) {
    assert.throws(() => parseScanArgs({ capital: bad }), /--capital.*1000/, `"${bad}"`);
  }
});
test('--capital kiểu "1.000" (dấu chấm hàng nghìn) bị từ chối, không đọc thành 1', () => {
  assert.throws(() => parseScanArgs({ capital: '1.000' }), /--capital.*không dùng dấu/);
  assert.throws(() => parseScanArgs({ capital: '12.500.000' }), /--capital/);
});
test('--limit phải là số nguyên dương', () => {
  for (const bad of ['x', '0', '-1', '2.5', '', '1e2']) {
    assert.throws(() => parseScanArgs({ limit: bad }), /--limit/, `"${bad}"`);
  }
});
test('--mode sai → lỗi', () => {
  assert.throws(() => parseScanArgs({ mode: 'abc' }), /--mode/);
});

test('--show-b: bật in đủ kế hoạch Hạng B', () => {
  assert.equal(parseScanArgs({ showB: true }).showB, true);
  assert.equal(parseScanArgs({}).showB, false);
});

test('--show-old: in lại kế hoạch của tín hiệu mô hình đã phát ở lần quét trước', () => {
  assert.equal(parseScanArgs({ showOld: true }).showOld, true);
  assert.equal(parseScanArgs({}).showOld, false);
});
