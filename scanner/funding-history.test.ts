import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFundingMaxAbsLoader } from './funding-history.ts';

const D = 86_400_000;
const NOW = 200 * D;

test('nạp |funding| lớn nhất 30 ngày: một lệnh gọi mỗi mã mỗi lần quét (nhớ trong lần quét), đúng tham số, chỉ kỳ ≤ now', async () => {
  const calls: string[] = [];
  const get = async (path: string) => {
    calls.push(path);
    return [{ symbol: 'AAAUSDT', fundingTime: NOW - 5 * D, fundingRate: '-0.0009' }, { symbol: 'AAAUSDT', fundingTime: NOW - D, fundingRate: '0.0001' }];
  };
  const load = createFundingMaxAbsLoader({ get, now: NOW, maxCalls: 10 });
  assert.equal(await load('AAAUSDT'), 0.0009);
  assert.equal(await load('AAAUSDT'), 0.0009);
  assert.deepEqual(calls, [`/fapi/v1/fundingRate?symbol=AAAUSDT&startTime=${NOW - 30 * D}&endTime=${NOW}&limit=1000`]);
});

test('nạp funding: lịch sử rỗng / toàn 0 → ném lỗi nêu lý do (nơi gọi dùng mức thận trọng + ghi chú), vượt trần lệnh gọi → ném lỗi', async () => {
  const load = createFundingMaxAbsLoader({ get: async () => [], now: NOW, maxCalls: 1 });
  await assert.rejects(load('AAAUSDT'), /không có kỳ funding/);
  await assert.rejects(load('BBBUSDT'), /trần 1 lệnh gọi/);
});
