import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeSignal, type GradeInput } from './grade.ts';
import { analyze, type Analysis, type PatternInfo } from './analyze.ts';
import { COMMON, CONFIG } from './config.ts';
import type { Side } from './types.ts';
import type { Zone } from './zones.ts';

// ---- Dựng sẵn một Analysis "hoàn hảo" (Hạng A) cho từng chiều; mỗi test chỉ làm hỏng ĐÚNG một tiêu chí ----
// Long: giá vào 96,5; vùng hỗ trợ [90, 95] độ mạnh 3 (mép trên 95, cách 1,5 = 0,375×ATR); ATR 4; TP1 128; vùng cản kế tiếp [130, 135].
// Short: gương qua trục 200 − giá (vùng cản phía trên, vùng đỡ phía dưới).
const mirror = (side: Side, x: number): number => (side === 'long' ? x : 200 - x);
const zone = (side: Side, low: number, high: number, strength: number): Zone => {
  const a = mirror(side, low);
  const b = mirror(side, high);
  return { low: Math.min(a, b), high: Math.max(a, b), strength, touches: 2, sources: ['đáy 4H ×2'] };
};
type Over = Partial<{
  mode: 'swing' | 'fast'; score: number; regime: GradeInput['regime']; trendSide: GradeInput['trendSide']; entrySide: GradeInput['entrySide'];
  btcSide: GradeInput['btcSide']; zones: Zone[]; tp1NetR: number | null; tier: string; flags: string[]; gates: Array<{ code: string; pass: boolean; note: string }>;
  breakerTripped: boolean; flowPoints: number | null; coilReleased: boolean; patterns: PatternInfo[]; doubles: Array<{ kind: 'double_top' | 'double_bottom' }>;
  entryType: 'market' | 'limit'; entry: number; label: string; f01: boolean; eventFlag: boolean; atr: number;
}>;
function make(side: Side, o: Over = {}): Analysis {
  const mode = o.mode ?? 'swing';
  const want = side === 'long' ? 'up' : 'down';
  const entry = o.entry ?? mirror(side, 96.5);
  const flowMax = CONFIG[mode].weights.flow;
  const reasons = [{ code: 'S-02', text: 'Taker', points: o.flowPoints === undefined ? 0 : (o.flowPoints ?? 0) }, ...(o.f01 ? [{ code: 'F-01', text: 'Funding quá nhiệt cùng chiều lệnh', points: -10 }] : [])];
  const grading: GradeInput = {
    regime: o.regime ?? (side === 'long' ? 'up' : 'down'),
    breakerTripped: o.breakerTripped ?? false,
    trendSide: o.trendSide ?? want, entrySide: o.entrySide ?? want, btcSide: mode === 'swing' ? (o.btcSide ?? want) : null,
    zones: o.zones ?? [zone(side, 90, 95, 3), zone(side, 130, 135, 2)],
    atr: o.atr ?? 4, eventFlagged: o.eventFlag ?? false,
    tp1NetR: o.tp1NetR === undefined ? 2 : o.tp1NetR,
    coilReleased: { long: side === 'long' && (o.coilReleased ?? false), short: side === 'short' && (o.coilReleased ?? false) },
  };
  void flowMax;
  return {
    symbol: 'TESTUSDT', mode, price: entry, label: (o.label ?? (side === 'long' ? 'Đạt tiêu chí Long' : 'Đạt tiêu chí Short')) as Analysis['label'],
    best: { side, score: o.score ?? 85, coverage: 1, reasons, rsZ: 1 },
    gates: o.gates ?? [{ code: 'G-07', pass: true, note: 'Ngoài cửa sổ sự kiện' }],
    plan: {
      side, entryType: o.entryType ?? 'market', marketPrice: mirror(side, 96.5), entry,
      stop: mirror(side, 88), riskPerUnit: 8.5, fundingCostR: 0,
      targets: [{ name: 'TP1', price: mirror(side, 128), pct: 50, qty: 1, r: 3.7, reason: 'x' }, { name: 'TP2', price: null, pct: 30, qty: 1, r: null, reason: 'x' }, { name: 'TP3', price: null, pct: 20, qty: 1, r: null, reason: 'x' }],
    },
    patternSignal: null, risk: { tier: (o.tier ?? 'Thấp') as Analysis['risk']['tier'], notes: [] }, flags: o.flags ?? [],
    patternScope: { ok: true, note: '' }, context: { hs: null, doubles: (o.doubles ?? []).map((d) => ({ ...d, timeframe: '4h', neckline: 100, breakoutIndex: 1 })), multiMonth: null, coil: false, block: { long: false, short: false }, notes: [] },
    patterns: o.patterns ?? [], grading, long: undefined, short: undefined, grade: null,
  } as unknown as Analysis;
}
const flowOk = (mode: 'swing' | 'fast' = 'swing') => CONFIG[mode].weights.flow * COMMON.gradeA.minFlowShare;
// Hạng A cơ bản cần ít nhất một hợp lưu: cho dòng tiền đủ mạnh
const perfect = (side: Side, o: Over = {}) => make(side, { flowPoints: flowOk(o.mode ?? 'swing'), ...o });

for (const side of ['long', 'short'] as const) {
  const S = side === 'long' ? 'Long' : 'Short';
  const failedOf = (a: Analysis) => gradeSignal(a).failed;
  const only = (a: Analysis, n: number) => {
    const r = gradeSignal(a);
    assert.equal(r.grade, 'B', `${S}: phải là Hạng B`);
    assert.equal(r.failed.length, 1, `${S}: chỉ trượt một tiêu chí, nhận ${JSON.stringify(r.failed)}`);
    assert.match(r.failed[0]!, new RegExp(`^Tiêu chí ${n}\\b`));
  };

  test(`${S}: đạt đủ 6 tiêu chí → Hạng A, không có lý do trượt`, () => {
    assert.deepEqual(gradeSignal(perfect(side)), { grade: 'A', failed: [] });
  });
  test(`${S}: Lướt nhanh không cần BTC 1D (btcSide null) vẫn Hạng A`, () => {
    assert.equal(gradeSignal(perfect(side, { mode: 'fast' })).grade, 'A');
  });

  test(`${S}: tiêu chí 1 — chế độ thị trường ngược chiều lệnh → trượt (cả hai chế độ)`, () => {
    only(perfect(side, { regime: side === 'long' ? 'down' : 'up' }), 1);
    only(perfect(side, { mode: 'fast', regime: side === 'long' ? 'down' : 'up' }), 1);
  });
  test(`${S}: tiêu chí 1 — Swing: đi ngang được chấp nhận (đã có BTC 1D cùng chiều); Lướt nhanh: đi ngang trượt`, () => {
    assert.equal(gradeSignal(perfect(side, { regime: 'sideways' })).grade, 'A');
    only(perfect(side, { mode: 'fast', regime: 'sideways' }), 1);
    assert.equal(gradeSignal(perfect(side, { mode: 'fast' })).grade, 'A');
  });
  test(`${S}: tiêu chí 1 — khung xu hướng hoặc khung vào lệnh không cùng chiều → trượt`, () => {
    only(perfect(side, { trendSide: 'sideways' }), 1);
    only(perfect(side, { entrySide: side === 'long' ? 'down' : 'up' }), 1);
  });
  test(`${S}: tiêu chí 1 — Swing: BTC 1D không cùng chiều → trượt`, () => {
    only(perfect(side, { btcSide: 'sideways' }), 1);
  });
  test(`${S}: tiêu chí 2 — điểm 79,9 trượt, đúng 80 đạt`, () => {
    only(perfect(side, { score: 79.9 }), 2);
    assert.equal(gradeSignal(perfect(side, { score: 80 })).grade, 'A');
  });
  test(`${S}: tiêu chí 3 — vùng SL độ mạnh 2 (< 3) → trượt`, () => {
    only(perfect(side, { zones: [zone(side, 90, 95, 2), zone(side, 130, 135, 2)] }), 3);
  });
  test(`${S}: tiêu chí 3 — vào trực tiếp cách mép vùng > 0,5×ATR → trượt; limit tại mép thì đạt`, () => {
    // mép 95 (Long) / 105 (Short); giá 97,5 → cách 2,5 = 0,625×ATR
    only(perfect(side, { entry: mirror(side, 97.5) }), 3);
    assert.equal(gradeSignal(perfect(side, { entry: mirror(side, 95.4), entryType: 'limit' })).grade, 'A');
  });
  test(`${S}: tiêu chí 3 — có vùng cản giữa giá vào và TP1 → trượt`, () => {
    only(perfect(side, { zones: [zone(side, 90, 95, 3), zone(side, 110, 112, 1), zone(side, 130, 135, 2)] }), 3);
  });
  test(`${S}: tiêu chí 4 — TP1 sau phí + funding 1,49R trượt, 1,5R đạt, không có TP1 trượt`, () => {
    only(perfect(side, { tp1NetR: 1.49 }), 4);
    assert.equal(gradeSignal(perfect(side, { tp1NetR: 1.5 })).grade, 'A');
    only(perfect(side, { tp1NetR: null }), 4);
  });
  test(`${S}: tiêu chí 5 — mức rủi ro Cao / Rất cao → trượt; Vừa đạt`, () => {
    only(perfect(side, { tier: 'Cao' }), 5);
    only(perfect(side, { tier: 'Rất cao' }), 5);
    assert.equal(gradeSignal(perfect(side, { tier: 'Vừa' })).grade, 'A');
  });
  test(`${S}: tiêu chí 5 — F-01 cùng chiều lệnh trượt; F-01 của chiều kia không ảnh hưởng`, () => {
    only(perfect(side, { f01: true }), 5);
    // cờ chữ của chiều kia (flags) không ảnh hưởng: chỉ lý do F-01 có cấu trúc của phía lệnh mới tính
    const other = side === 'long' ? 'Short' : 'Long';
    assert.equal(gradeSignal(perfect(side, { flags: [`F-01 Funding quá nhiệt cùng chiều ${other} (x)`] })).grade, 'A');
  });
  test(`${S}: tiêu chí 5 — cầu dao bật trượt`, () => {
    only(perfect(side, { breakerTripped: true }), 5);
  });
  test(`${S}: tiêu chí 5 — trong cửa sổ sự kiện (cổng G-07 trượt hoặc cờ G-07) trượt`, () => {
    only(perfect(side, { gates: [{ code: 'G-07', pass: false, note: 'Trong cửa sổ sự kiện' }] }), 5);
    only(perfect(side, { eventFlag: true }), 5);
  });
  test(`${S}: tiêu chí 6 — không có hợp lưu nào → trượt`, () => {
    only(make(side, { flowPoints: flowOk() - 0.01 }), 6);
  });
  test(`${S}: tiêu chí 6 — chỉ cần một: dòng tiền đúng 70% điểm tối đa S-02`, () => {
    assert.equal(gradeSignal(make(side, { flowPoints: flowOk() })).grade, 'A');
  });
  test(`${S}: tiêu chí 6 — chỉ cần một: coil vừa bung theo chiều lệnh`, () => {
    assert.equal(gradeSignal(make(side, { coilReleased: true })).grade, 'A');
  });
  test(`${S}: tiêu chí 6 — coil bung ngược chiều không tính`, () => {
    const a = make(side, {});
    a.grading.coilReleased = { long: side === 'short', short: side === 'long' };
    only(a, 6);
  });
  test(`${S}: tiêu chí 6 — hai đáy/hai đỉnh đã xác nhận KHÔNG phải nguồn hợp lưu (chỉ 3 nguồn theo brief)`, () => {
    const good = side === 'long' ? 'double_bottom' : 'double_top';
    only(make(side, { doubles: [{ kind: good }] }), 6);
  });
  test(`${S}: tiêu chí 3 — ATR không hợp lệ (0 / NaN) → trượt kèm lý do, không lọt im lặng`, () => {
    for (const atr of [0, NaN]) {
      const r = gradeSignal(perfect(side, { atr }));
      assert.equal(r.grade, 'B');
      assert.ok(r.failed.some((f) => /^Tiêu chí 3\b.*ATR/.test(f)), r.failed.join('|'));
    }
  });
  test(`${S}: trượt nhiều tiêu chí → liệt kê đủ, mỗi lý do nêu số tiêu chí`, () => {
    const a = make(side, { score: 60, tp1NetR: 1, tier: 'Cao' });
    const r = gradeSignal(a);
    assert.equal(r.grade, 'B');
    assert.deepEqual(r.failed.map((f) => f.match(/^Tiêu chí (\d)/)![1]), ['2', '4', '5', '6']);
    assert.ok(r.failed.every((f) => /[à-ỹ]/.test(f)), 'lý do bằng tiếng Việt');
    void failedOf;
  });

  // ---- Tín hiệu mô hình ----
  // Mặc định có hợp lưu dòng tiền đủ mạnh (B5: bản thân phá vỡ không còn là hợp lưu)
  const withPattern = (o: { stop?: number; entryType?: 'market' | 'split' | 'limit'; distanceAtr?: number; zones?: Zone[]; state?: PatternInfo['state']; kind?: PatternInfo['kind']; tp1NetR?: number; flow?: number; coil?: boolean } = {}): Analysis => {
    const a = make(side, { flowPoints: o.flow ?? flowOk(), coilReleased: o.coil ?? false, tp1NetR: o.tp1NetR ?? 2, zones: o.zones ?? [zone(side, 94, 99, 3), zone(side, 130, 135, 2)] });
    const up = side === 'long';
    a.plan = null;
    a.patternSignal = {
      kind: o.kind ?? 'rectangle', timeframe: '4h', side, entryType: o.entryType ?? 'market', marketPrice: mirror(side, 101), limitPrice: null, entry: mirror(side, 101),
      stop: mirror(side, o.stop ?? 91), atr: 4, distanceAtr: o.distanceAtr ?? 0.25, tp1NetR: o.tp1NetR ?? 2,
      targets: [{ name: 'TP1', price: mirror(side, 125), pct: 50, qty: 1, r: 2.4, reason: 'x' }, { name: 'TP2', price: null, pct: 30, qty: 1, r: null, reason: 'x' }, { name: 'TP3', price: null, pct: 20, qty: 1, r: null, reason: 'x' }],
    } as unknown as Analysis['patternSignal'];
    a.patterns = [{ id: 'p', kind: o.kind ?? 'rectangle', timeframe: '4h', state: o.state ?? 'breakout', side: up ? 'up' : 'down', upper: 100, lower: 90, breakoutLine: 100, height: 10, pivots: [], notes: [], hidden: false, contextOnly: false }];
    return a;
  };
  test(`${S}: mô hình + dòng tiền đủ mạnh, SL sau vùng độ mạnh ≥ 3 → Hạng A`, () => {
    assert.deepEqual(gradeSignal(withPattern()), { grade: 'A', failed: [] });
  });
  test(`${S}: B5 — bản thân phá vỡ/retest KHÔNG còn là hợp lưu: cần thêm dòng tiền ≥ 70% hoặc coil vừa bung`, () => {
    only(withPattern({ flow: 0 }), 6);
    only(withPattern({ flow: 0, state: 'retested' }), 6);
    assert.match(failedOf(withPattern({ flow: 0 })).join(' '), /Tiêu chí 6 \(hợp lưu\): chưa có yếu tố hợp lưu thêm ngoài mô hình/);
    assert.equal(gradeSignal(withPattern({ flow: 0, coil: true })).grade, 'A');
  });
  test(`${S}: mô hình — tiêu chí 3: không có vùng độ mạnh ≥ 3 ngay sau SL → trượt`, () => {
    only(withPattern({ zones: [zone(side, 94, 99, 2), zone(side, 130, 135, 2)] }), 3);
    only(withPattern({ stop: 60 }), 3); // SL quá xa vùng (> 1×A sau mép xa)
  });
  test(`${S}: mô hình — tiêu chí 3: vào trực tiếp cách đường phá > 0,5×A trượt; chỉ limit thì đạt`, () => {
    only(withPattern({ distanceAtr: 0.6 }), 3);
    only(withPattern({ distanceAtr: 0.6, entryType: 'split' }), 3);
    assert.equal(gradeSignal(withPattern({ distanceAtr: 1.8, entryType: 'limit' })).grade, 'A');
  });
  test(`${S}: mô hình — tiêu chí 3: vùng cản nằm trước TP1 (kể cả khi kế hoạch bỏ sót) → trượt`, () => {
    only(withPattern({ zones: [zone(side, 94, 99, 3), zone(side, 112, 113, 1)] }), 3);
  });
  test(`${S}: mô hình — tiêu chí 4 dùng TP1 sau phí của kế hoạch mô hình`, () => {
    only(withPattern({ tp1NetR: 1.4 }), 4);
  });
  test(`${S}: mô hình — trạng thái mô hình không ảnh hưởng tiêu chí 6 (chỉ dòng tiền / coil)`, () => {
    assert.equal(gradeSignal(withPattern({ state: 'armed' as PatternInfo['state'], flow: flowOk() })).grade, 'A');
  });
}

test('gradeSignal từ chối tín hiệu chưa Đạt tiêu chí (không đoán)', () => {
  assert.throws(() => gradeSignal(make('long', { label: 'Theo dõi' })), /Đạt tiêu chí/);
});

test('ngưỡng Hạng A nằm trong config, ghi rõ đề xuất chưa backtest', () => {
  assert.deepEqual(
    { s: COMMON.gradeA.minScore, z: COMMON.gradeA.minStopZoneStrength, e: COMMON.gradeA.maxEntryEdgeAtr, r: COMMON.gradeA.minTp1NetR, f: COMMON.gradeA.minFlowShare },
    { s: 80, z: 3, e: 0.5, r: 1.5, f: 0.7 },
  );
});

// ---- Tích hợp qua analyze thật ----
function k(i: number, close: number, takerShare = 0.5) {
  return { openTime: i * 1000, closeTime: i * 1000 + 999, open: close * 0.999, high: close * 1.004, low: close * 0.996, close, volume: 100, quoteVolume: 100 * close, takerBuyQuote: 100 * close * takerShare };
}
const up = (n: number, step: number, share = 0.5) => Array.from({ length: n }, (_, i) => k(i, 100 + i * step, share));
const upWaves = (n: number, step: number, share = 0.5, amp = 1, period = 40) => Array.from({ length: n }, (_, i) => k(i, 100 + i * step + amp * Math.sin((2 * Math.PI * i) / period), share));
const baseIn = {
  mode: 'swing' as const,
  contract: { symbol: 'TESTUSDT', baseAsset: 'TEST', onboardDate: Date.parse('2024-01-01'), tickSize: 0.001, stepSize: 0.001, minQty: 0.001, maxQty: 1e9, marketMinQty: 0.001, marketMaxQty: 1e9, marketStepSize: 0.001, minNotional: 5, maxNumOrders: 200, deliveryDate: 4133404800000 },
  trend: up(300, 1), entry: upWaves(500, 0.2, 0.6, 2, 40), daily: up(300, 1), hourly: up(100, 0.05), btcTrend: up(300, 0.3),
  regime: 'up' as const, breakerTripped: false, liquidityRankPct: 0.05, spreadPct: 0.02,
  premium: { symbol: 'TESTUSDT', markPrice: 199.8, lastFundingRate: 0.0001, nextFundingTime: Date.parse('2026-10-19T16:00:00Z') },
  fundingIntervalHours: 8, fundingIntervalDefault: false, now: new Date('2026-10-19T12:00:00Z'), events: [{ kind: 'FOMC' as const, time: '2027-01-27T19:00:00Z', source: 'test: lịch còn hạn, xa cửa sổ' }], capital: 1000, riskPct: 0.5,
  patternData: null as null | { c4h: ReturnType<typeof up>; c1d: ReturnType<typeof up>; c1h: ReturnType<typeof up>; btcSma200ReclaimedAt: null },
  openTrades: [],
};
baseIn.patternData = { c4h: baseIn.entry, c1d: baseIn.daily, c1h: baseIn.hourly, btcSma200ReclaimedAt: null };

test('analyze: tín hiệu Đạt tiêu chí có grade (khớp gradeSignal); không Đạt thì grade = null', () => {
  const a = analyze(baseIn);
  assert.equal(a.label, 'Đạt tiêu chí Long');
  assert.ok(a.grade !== null);
  assert.deepEqual(a.grade, gradeSignal(a));
  const n = analyze({ ...baseIn, breakerTripped: true });
  assert.notEqual(n.label, 'Đạt tiêu chí Long');
  assert.equal(n.grade, null);
});

test('analyze: Hạng A không bao giờ qua mặt tiêu chí 1 khi thị trường ngược chiều (ngoại lệ điểm ≥ 80 chỉ cho Hạng B)', () => {
  const a = analyze({ ...baseIn, regime: 'down' });
  assert.equal(a.label, 'Đạt tiêu chí Long');
  assert.equal(a.grade!.grade, 'B');
  assert.ok(a.grade!.failed.some((f) => f.startsWith('Tiêu chí 1')), a.grade!.failed.join('|'));
});
