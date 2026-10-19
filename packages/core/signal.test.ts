import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zoneQualifies, zoneSignalId, signalIdentity, chooseZoneSide, flipAllowed, advanceSignalState, type SignalState } from './signal.ts';
import { COMMON } from './config.ts';

test('I5 config: vào ≥ 70, rời < 60 (spec 3.6)', () => {
  assert.equal(COMMON.qualifyScore, 70);
  assert.equal(COMMON.exitScore, 60);
});

test('I5 hysteresis: không có tín hiệu trước → cần ≥ 70 (như cũ); đang mở cùng chiều → giữ tới khi điểm < 60', () => {
  assert.equal(zoneQualifies({ score: 69, gatesPass: true, side: 'long', prev: null }).ok, false);
  assert.equal(zoneQualifies({ score: 70, gatesPass: true, side: 'long', prev: null }).ok, true);
  const prev: SignalState = { id: 'X', side: 'long', kind: 'zone', endedAt: null };
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
  assert.deepEqual(first, { id: 'A|1', fresh: true, held: false, kind: 'zone', side: 'long' });
  const again = signalIdentity({ kind: 'zone', side: 'long', candidateId: 'A|2', prev: { id: 'A|1', side: 'long', kind: 'zone', endedAt: null }, patternFresh: true });
  assert.deepEqual(again, { id: 'A|1', fresh: false, held: true, kind: 'zone', side: 'long' });
  // tín hiệu mô hình: MỚI chỉ khi chính lần quét này phát (patternFresh) và chưa có trong trạng thái
  assert.equal(signalIdentity({ kind: 'pattern', side: 'long', candidateId: 'P', prev: null, patternFresh: false }).fresh, false);
  assert.equal(signalIdentity({ kind: 'pattern', side: 'long', candidateId: 'P', prev: { id: 'P', side: 'long', kind: 'pattern', endedAt: null }, patternFresh: true }).fresh, false);
  assert.equal(signalIdentity({ kind: 'pattern', side: 'long', candidateId: 'P', prev: null, patternFresh: true }).fresh, true);
});

// ---- Rà soát B0b #1: hysteresis tính trên chiều ĐANG GIỮ, không phải chiều điểm cao nhất ----
test('I5 repro rà soát: đang giữ Long; Long 65 / Short 66 (cả hai qua cổng) → GIỮ Long, không có Short mới', () => {
  const held: SignalState = { id: 'L1', side: 'long', kind: 'zone', endedAt: null };
  const r = chooseZoneSide({ long: { score: 65, gatesPass: true }, short: { score: 66, gatesPass: true }, held });
  assert.equal(r.side, 'long');
  assert.equal(r.ok, true);
  // lần quét sau Long 71: vẫn là tín hiệu cũ (giữ id, KHÔNG "MỚI") → bot không vào thêm
  const next = chooseZoneSide({ long: { score: 71, gatesPass: true }, short: { score: 50, gatesPass: true }, held });
  assert.equal(next.side, 'long');
  const id = signalIdentity({ kind: 'zone', side: 'long', candidateId: 'L2', prev: held, patternFresh: true });
  assert.deepEqual([id.id, id.fresh], ['L1', false]);
});

test('I5 chooseZoneSide: chiều giữ rơi < 60 hoặc trượt cổng → kết thúc, xét chiều điểm cao nhất với ngưỡng 70; không giữ → như cũ', () => {
  const held: SignalState = { id: 'L1', side: 'long', kind: 'zone', endedAt: null };
  const ended = chooseZoneSide({ long: { score: 59, gatesPass: true }, short: { score: 75, gatesPass: true }, held });
  assert.deepEqual([ended.side, ended.ok], ['short', true]);
  assert.match(ended.note!, /kết thúc/);
  assert.equal(chooseZoneSide({ long: { score: 80, gatesPass: false }, short: { score: 65, gatesPass: true }, held }).ok, false);
  assert.deepEqual(chooseZoneSide({ long: { score: 65, gatesPass: true }, short: { score: 66, gatesPass: true }, held: null }), { side: 'short', ok: false, note: null });
});

// ---- Rà soát B0b: luật đảo chiều (spec 3.6) — chờ trọn 1 nến khung xu hướng sau khi tín hiệu cũ kết thúc ----
const D = 86_400_000;
const T = Date.parse('2026-10-19T00:00:00Z');
test('I5 flipAllowed Long→Short (khung 1D): tín hiệu Long còn mở → chặn; kết thúc giữa ngày → chặn tới khi nến ngày KẾ TIẾP đóng', () => {
  const open: SignalState = { id: 'L', side: 'long', kind: 'zone', endedAt: null };
  assert.equal(flipAllowed(open, 'short', T + 5 * D, '1d'), false);
  assert.equal(flipAllowed(open, 'long', T + 5 * D, '1d'), true); // cùng chiều không phải đảo
  const ended: SignalState = { ...open, endedAt: T + 4 * 3_600_000 }; // kết thúc 04:00 ngày 19
  assert.equal(flipAllowed(ended, 'short', T + D, '1d'), false); // nến 19 chưa trọn (bắt đầu trước lúc kết thúc)
  assert.equal(flipAllowed(ended, 'short', T + 2 * D - 1, '1d'), false); // nến 20 chưa đóng
  assert.equal(flipAllowed(ended, 'short', T + 2 * D, '1d'), true); // nến 20 (trọn sau lúc kết thúc) đã đóng
  assert.equal(flipAllowed(null, 'short', T, '1d'), true);
});

test('I5 flipAllowed Short→Long (khung 1H, Lướt nhanh): kết thúc đúng mốc giờ → chỉ cần nến giờ đó đóng', () => {
  const ended: SignalState = { id: 'S', side: 'short', kind: 'pattern', endedAt: T + 3_600_000 };
  assert.equal(flipAllowed(ended, 'long', T + 2 * 3_600_000 - 1, '1h'), false);
  assert.equal(flipAllowed(ended, 'long', T + 2 * 3_600_000, '1h'), true);
});

test('I5 advanceSignalState: có tín hiệu → mở (endedAt null); mất tín hiệu → ghi thời điểm kết thúc; đã kết thúc thì giữ nguyên', () => {
  const sig = { id: 'A', fresh: true, held: false, kind: 'zone' as const, side: 'long' as const };
  const s1 = advanceSignalState(null, sig, T);
  assert.deepEqual(s1, { id: 'A', side: 'long', kind: 'zone', endedAt: null });
  const s2 = advanceSignalState(s1, null, T + D);
  assert.deepEqual(s2, { ...s1, endedAt: T + D });
  assert.deepEqual(advanceSignalState(s2, null, T + 3 * D), s2);
  assert.equal(advanceSignalState(null, null, T), null);
  // tín hiệu đã kết thúc rồi cùng chiều quay lại ≥ 70 → tín hiệu MỚI (không dính id cũ)
  const back = signalIdentity({ kind: 'zone', side: 'long', candidateId: 'B', prev: s2!, patternFresh: true });
  assert.deepEqual([back.id, back.fresh], ['B', true]);
});
