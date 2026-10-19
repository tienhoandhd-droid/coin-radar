import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tickDecimals, snapToTick, formatTick } from './price.ts';

test('tickDecimals: số chữ số thập phân của tickSize', () => {
  assert.equal(tickDecimals(1), 0);
  assert.equal(tickDecimals(0.1), 1);
  assert.equal(tickDecimals(0.0001), 4);
  assert.equal(tickDecimals(1e-7), 7);
  assert.equal(tickDecimals(0.5), 1);
});

test('tickDecimals: tickSize không hợp lệ → ném lỗi', () => {
  assert.throws(() => tickDecimals(0), /tickSize/);
  assert.throws(() => tickDecimals(NaN), /tickSize/);
  assert.throws(() => tickDecimals(-1), /tickSize/);
});

test('snapToTick: xuống / lên / gần nhất, không dính nhiễu số thực', () => {
  assert.equal(snapToTick(0.15378239, 1e-6, 'down'), 0.153782);
  assert.equal(snapToTick(0.15378239, 1e-6, 'up'), 0.153783);
  assert.equal(snapToTick(0.15378239, 1e-6, 'nearest'), 0.153782);
  assert.equal(snapToTick(0.3, 0.1, 'down'), 0.3); // 0.3/0.1 = 2.9999999999999996
  assert.equal(snapToTick(0.3, 0.1, 'up'), 0.3);
  assert.equal(snapToTick(82_000.07, 0.1, 'down'), 82_000);
  assert.equal(snapToTick(82_000.07, 0.1, 'up'), 82_000.1);
  assert.equal(snapToTick(1.23, 1, 'up'), 2);
});

test('formatTick: đúng số chữ số theo tickSize, dấu phẩy', () => {
  assert.equal(formatTick(0.153782, 1e-6), '0,153782');
  assert.equal(formatTick(0.15289, 1e-6), '0,152890');
  assert.equal(formatTick(82_000, 0.1), '82000,0');
  assert.equal(formatTick(5, 1), '5');
  assert.equal(formatTick(0.6143, 0.0001), '0,6143');
});
