import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitLine } from './geometry.ts';

test('fitLine: điểm thẳng hàng cho đúng độ dốc và hệ số chặn', () => {
  const line = fitLine([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }, { x: 3, y: 7 }]);
  assert.ok(Math.abs(line.slope - 2) < 1e-12);
  assert.ok(Math.abs(line.intercept - 1) < 1e-12);
  assert.ok(Math.abs(line.at(10) - 21) < 1e-12);
});

test('fitLine: 2 điểm đi qua đúng cả hai điểm', () => {
  const line = fitLine([{ x: 5, y: 100 }, { x: 15, y: 90 }]);
  assert.ok(Math.abs(line.at(5) - 100) < 1e-9);
  assert.ok(Math.abs(line.at(15) - 90) < 1e-9);
});

test('fitLine: bình phương tối thiểu với điểm lệch', () => {
  // (0,0) (1,1) (2,1): slope 0.5, intercept 1/6
  const line = fitLine([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }]);
  assert.ok(Math.abs(line.slope - 0.5) < 1e-12);
  assert.ok(Math.abs(line.intercept - 1 / 6) < 1e-12);
});

test('fitLine: đường ngang có độ dốc 0', () => {
  assert.equal(fitLine([{ x: 0, y: 4 }, { x: 9, y: 4 }]).slope, 0);
});

test('fitLine: ném lỗi khi < 2 điểm', () => {
  assert.throws(() => fitLine([]), /ít nhất 2 điểm/);
  assert.throws(() => fitLine([{ x: 1, y: 1 }]), /ít nhất 2 điểm/);
});

test('fitLine: ném lỗi khi mọi x trùng nhau', () => {
  assert.throws(() => fitLine([{ x: 3, y: 1 }, { x: 3, y: 2 }]), /x trùng/);
});

test('fitLine: ném lỗi khi toạ độ không hữu hạn', () => {
  assert.throws(() => fitLine([{ x: 0, y: NaN }, { x: 1, y: 2 }]), /không hữu hạn/);
});
