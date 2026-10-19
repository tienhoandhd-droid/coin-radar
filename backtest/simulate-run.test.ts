import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Analysis } from '../packages/core/analyze.ts';
import { pickCandidates, settle, cooldownMs, maxAbsFunding, type PickState, type SettleMarks } from './simulate-run.ts';
import { createBook, type SimTrade } from './simulate.ts';

const T = Date.UTC(2026, 6, 1, 12);

// Analysis tối thiểu cho bộ chọn tín hiệu (chỉ các trường pickCandidates đọc)
function an(symbol: string, o: { side?: 'long' | 'short'; grade?: 'A' | 'B'; fresh?: boolean; label?: string; pattern?: { patternId: string; breakoutTime: number } } = {}): Analysis {
  const side = o.side ?? 'long';
  const plan = { side, entryType: 'market' };
  return {
    symbol, label: o.label ?? (side === 'long' ? 'Đạt tiêu chí Long' : 'Đạt tiêu chí Short'),
    plan: o.pattern ? null : plan, patternSignal: o.pattern ? { ...plan, ...o.pattern } : null,
    signal: { id: `${symbol}|swing|${side}|zone|1|1`, fresh: o.fresh ?? true, held: !(o.fresh ?? true), kind: o.pattern ? 'pattern' : 'zone', side },
    grade: { grade: o.grade ?? 'A' }, best: { score: 85 },
  } as unknown as Analysis;
}
const fresh = (): PickState => ({ used: new Set(), cooldownUntil: new Map(), active: new Set() });

test('Hạng A + MỚI: bỏ Hạng B, bỏ tín hiệu đang giữ, bỏ nhãn không Đạt; biến thể "mọi Đạt" giữ Hạng B', () => {
  const rs = [an('AUSDT'), an('BUSDT', { grade: 'B' }), an('CUSDT', { fresh: false }), an('DUSDT', { label: 'Theo dõi' })];
  const skip = new Map<string, number>();
  assert.deepEqual(pickCandidates(rs, 'A', fresh(), T, skip).map((p) => p.a.symbol), ['AUSDT']);
  assert.equal(skip.get('không phải Hạng A'), 1);
  assert.equal(skip.get('không MỚI (đang giữ)'), 1);
  assert.deepEqual(pickCandidates(rs, 'all', fresh(), T, new Map()).map((p) => p.a.symbol), ['AUSDT', 'BUSDT']);
});

test('Khử trùng mô hình theo mã + patternId + breakoutTime; một lệnh mỗi hợp đồng; cooldown cặp + chiều', () => {
  const st = fresh();
  const p = { patternId: 'p1', breakoutTime: 123 };
  const first = pickCandidates([an('AUSDT', { pattern: p })], 'A', st, T, new Map());
  assert.equal(first.length, 1);
  st.used.add(first[0]!.key);
  const skip = new Map<string, number>();
  assert.equal(pickCandidates([an('AUSDT', { pattern: p })], 'A', st, T + 1, skip).length, 0);
  assert.equal(skip.get('trùng khóa tín hiệu'), 1);
  st.active.add('BUSDT');
  assert.equal(pickCandidates([an('BUSDT')], 'A', st, T, new Map()).length, 0);
  st.cooldownUntil.set('CUSDT|long', T + cooldownMs('swing'));
  assert.equal(pickCandidates([an('CUSDT')], 'A', st, T + 1, new Map()).length, 0);
  assert.equal(pickCandidates([an('CUSDT', { side: 'short' })], 'A', st, T + 1, new Map()).length, 1, 'chiều ngược không bị cooldown');
  assert.equal(pickCandidates([an('CUSDT')], 'A', st, T + cooldownMs('swing'), new Map()).length, 1);
  assert.equal(cooldownMs('swing'), 8 * 3_600_000);
  assert.equal(cooldownMs('fast'), 30 * 60_000);
});

test('settle: dòng tiền của nhiều lệnh gộp theo thời gian thật trước khi vào sổ (lỗ ngày tính đúng thứ tự)', () => {
  const book = createBook({ capital: 1000, lossesMax: 5, lossesWindowHours: 24, pauseHours: 24, dailyLossPct: 10, ddAlertPct: 30 });
  const mk = (flows: Array<[number, number]>, closedAt: number | null): SimTrade => ({
    b: { flows: flows.map(([t, amount]) => ({ t, amount })), closedAt, gross: 0, costs: 0, funding: flows.reduce((s, f) => s + f[1], 0), firstFillAt: 0 },
  } as unknown as SimTrade);
  const a = mk([[T + 3, -60], [T + 5, 100]], T + 5);
  const b = mk([[T + 4, -50]], T + 4);
  const ptr: SettleMarks = new Map();
  const closed = settle(book, [a, b], ptr);
  // thứ tự thật: −60 (940), −50 (890 → lỗ ngày 11% → dừng), +100
  assert.equal(book.trips.daily, 1);
  assert.equal(book.equity, 990);
  assert.deepEqual(closed, [b, a]);
  assert.equal(book.trips.losses, 0);
  settle(book, [a, b], ptr); // gọi lại không cộng trùng
  assert.equal(book.equity, 990);
});

test('maxAbsFunding: |funding| lớn nhất trong 30 ngày tới t, chỉ kỳ đã chốt (không nhìn trước)', () => {
  const D = 86_400_000;
  const rows = [
    { fundingTime: T - 31 * D, fundingRate: -0.01, markPrice: 1 }, // quá 30 ngày
    { fundingTime: T - 5 * D, fundingRate: -0.0007, markPrice: 1 },
    { fundingTime: T, fundingRate: 0.0003, markPrice: 1 },
    { fundingTime: T + 1, fundingRate: 0.02, markPrice: 1 }, // tương lai
  ];
  assert.equal(maxAbsFunding(rows, T), 0.0007);
  assert.equal(maxAbsFunding([], T), 0);
});
