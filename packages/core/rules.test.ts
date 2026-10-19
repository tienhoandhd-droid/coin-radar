import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, ruleByCode } from './rules.ts';
import { CONFIG } from './config.ts';

test('mã nguyên tắc là duy nhất và đủ các nhóm của spec', () => {
  const codes = RULES.map((r) => r.code);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of ['G-01', 'G-02', 'G-03', 'G-04', 'G-05', 'G-06', 'G-07', 'G-08', 'G-09', 'G-10', 'G-11',
    'S-01', 'S-02', 'S-03', 'F-01', 'F-02', 'F-03', 'F-04', 'F-05', 'F-06',
    'P-01', 'P-02', 'P-03', 'P-04', 'P-05', 'P-06', 'P-07', 'R-01', 'R-02']) {
    assert.ok(codes.includes(code), `thiếu ${code}`);
  }
});

test('ruleByCode ném lỗi khi mã không tồn tại', () => {
  assert.equal(ruleByCode('G-01').code, 'G-01');
  assert.throws(() => ruleByCode('X-99'), /Không có nguyên tắc X-99/);
});

test('trọng số điểm mỗi chế độ cộng đúng 100', () => {
  for (const mode of ['fast', 'swing'] as const) {
    const w = CONFIG[mode].weights;
    assert.equal(w.trend + w.relativeStrength + w.momentum + w.flow + w.path, 100, mode);
  }
});
