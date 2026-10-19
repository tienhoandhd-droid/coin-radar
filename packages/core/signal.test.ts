import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zoneQualifies, zoneSignalId, signalIdentity, type SignalState } from './signal.ts';
import { COMMON } from './config.ts';

test('I5 config: vào ≥ 70, rời < 60 (spec 3.6)', () => {
  assert.equal(COMMON.qualifyScore, 70);
  assert.equal(COMMON.exitScore, 60);
});

test('I5 hysteresis: không có tín hiệu trước → cần ≥ 70 (như cũ); đang mở cùng chiều → giữ tới khi điểm < 60', () => {
  assert.equal(zoneQualifies({ score: 69, gatesPass: true, side: 'long', prev: null }).ok, false);
  assert.equal(zoneQualifies({ score: 70, gatesPass: true, side: 'long', prev: null }).ok, true);
  const prev: SignalState = { id: 'X', side: 'long', kind: 'zone' };
  const held = zoneQualifies({ score: 65, gatesPass: true, side: 'long', prev });
  assert.equal(held.ok, true);
  assert.match(held.note!, /giữ/);
  assert.equal(zoneQualifies({ score: 59, gatesPass: true, side: 'long', prev }).ok, false);
  assert.equal(zoneQualifies({ score: 60, gatesPass: true, side: 'long', prev }).ok, true);
  // ngược chiều tín hiệu đang mở → phải đạt ngưỡng vào 70
  assert.equal(zoneQualifies({ score: 65, gatesPass: true, side: 'short', prev }).ok, false);
  // trượt cổng thì không giữ
  assert.equal(zoneQualifies({ score: 90, gatesPass: false, side: 'long', prev }).ok, false);
});

test('I5 signalId tất định: mã|chế độ|chiều|loại|openTime nến vào lệnh|SL', () => {
  assert.equal(zoneSignalId({ symbol: 'BTCUSDT', mode: 'swing', side: 'long', entryOpenTime: 1760860800000, stop: 61234.5 }),
    'BTCUSDT|swing|long|zone|1760860800000|61234.5');
});

test('I5 độ mới: lần đầu → MỚI; cùng tín hiệu ở lần quét sau (đã có trong trạng thái) → giữ id cũ, KHÔNG mới', () => {
  const first = signalIdentity({ kind: 'zone', side: 'long', candidateId: 'A|1', prev: null, patternFresh: true });
  assert.deepEqual(first, { id: 'A|1', fresh: true, held: false, kind: 'zone' });
  const again = signalIdentity({ kind: 'zone', side: 'long', candidateId: 'A|2', prev: { id: 'A|1', side: 'long', kind: 'zone' }, patternFresh: true });
  assert.deepEqual(again, { id: 'A|1', fresh: false, held: true, kind: 'zone' });
  // tín hiệu mô hình: MỚI chỉ khi chính lần quét này phát (patternFresh) và chưa có trong trạng thái
  assert.equal(signalIdentity({ kind: 'pattern', side: 'long', candidateId: 'P', prev: null, patternFresh: false }).fresh, false);
  assert.equal(signalIdentity({ kind: 'pattern', side: 'long', candidateId: 'P', prev: { id: 'P', side: 'long', kind: 'pattern' }, patternFresh: true }).fresh, false);
  assert.equal(signalIdentity({ kind: 'pattern', side: 'long', candidateId: 'P', prev: null, patternFresh: true }).fresh, true);
});
