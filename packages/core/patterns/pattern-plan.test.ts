import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPatternPlan, type PatternPlanArgs, type PatternPlan } from './pattern-plan.ts';
import { evaluateState, type StateResult } from './state.ts';
import { COMMON } from '../config.ts';
import type { Zone } from '../zones.ts';
import type { Candle } from '../types.ts';
import type { PatternGeometry } from './types.ts';

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
const H4 = 4 * 3600_000;
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1);

function k(i: number, high: number, low: number, close: number): Candle {
  return { openTime: T0 + i * H4, closeTime: T0 + (i + 1) * H4 - 1, open: close, high, low, close, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 };
}
// 30 nến nền đóng 105 (biên độ 1), rồi nến phá (chỉ số 30) đóng `close`; râu phía trong mô hình chạm 109,9 (Long) / 110,1 (Short).
function candles(close: number, side: 'long' | 'short' = 'long', extra: Candle[] = []): Candle[] {
  const c = Array.from({ length: 30 }, (_, i) => k(i, 105.5, 104.5, 105));
  c.push(side === 'long' ? k(30, close + 0.3, 109.9, close) : k(30, 110.1, close - 0.3, close));
  return [...c, ...extra.map((x, j) => ({ ...x, openTime: T0 + (31 + j) * H4, closeTime: T0 + (32 + j) * H4 - 1 }))];
}
const zone = (low: number, high: number): Zone => ({ low, high, strength: 2, touches: 2, sources: ['test'] });

function geom(over: Partial<PatternGeometry> = {}): PatternGeometry {
  return {
    kind: 'rectangle', timeframe: '4h', pivots: [], startIndex: 0, endIndex: 20,
    upper: () => 110, lower: () => 100, breakoutSide: 'both', height: 10,
    stopRef: { up: 108.5, down: 101 }, quality: 1, notes: [], ...over,
  };
}
function st(over: Partial<StateResult> = {}): StateResult {
  return { state: 'breakout', breakoutIndex: 30, side: 'up', breakoutLine: 110, distanceAtr: 0, retest: null, notes: [],
    signalStale: false, inBreakoutWindow: null, ...over };
}
const longZones = [zone(118, 118.5), zone(121, 122), zone(126, 127)];

function args(over: Partial<PatternPlanArgs> & { close?: number; side?: 'long' | 'short' } = {}): PatternPlanArgs {
  const { close = 110.5, side = 'long', ...rest } = over;
  const c = rest.candles ?? candles(close, side);
  return {
    mode: 'swing', patternId: 'BTCUSDT|4h|rectangle|1|2', geometry: geom(), state: st(), candles: c, atr: new Array<number>(c.length).fill(1), atr1h: 1,
    zones: longZones, multiMonth: null, btcSma200ReclaimedAt: null,
    capital: 10_000, riskPct: 0.5, costTier: 'high', tickSize: 0.01, stepSize: 0.001, fundingRate: 0.0001, fundingIntervalHours: 8,
    ...rest,
  };
}
function ready(a: PatternPlanArgs): PatternPlan {
  const r = buildPatternPlan(a);
  assert.equal(r.status, 'ready', `phải ready, lý do: ${r.reason}`);
  assert.ok(r.plan);
  assert.equal(r.plan.valid, true);
  return r.plan;
}
// Mọi giá in là bội tickSize, mọi khối lượng là bội stepSize, không phần nào có giá TP mà 0 coin.
function assertGrid(p: PatternPlan, tick = 0.01, step = 0.001) {
  const onGrid = (x: number, g: number) => Math.abs(Math.round(x / g) * g - x) < 1e-9;
  for (const x of [p.stop, p.afterTp1Stop, p.maxEntry, ...(p.limitPrice === null ? [] : [p.limitPrice]),
    ...p.targets.flatMap((t) => (t.price === null ? [] : [t.price]))]) assert.ok(onGrid(x, tick), `giá ${x} lệch tick`);
  for (const row of p.fillTable) {
    for (const leg of row.legs) {
      assert.ok(leg.qty > 0 && onGrid(leg.qty, step), `chân ${leg.kind} khối lượng ${leg.qty}`);
      assert.ok(onGrid(leg.price, tick));
      p.targets.forEach((t, i) => {
        assert.ok(onGrid(leg.q[i]!, step));
        if (t.price !== null && t.pct > 0) assert.ok(leg.q[i]! > 0, `${row.label} ${leg.kind} ${t.name} = 0 coin`);
      });
      assert.equal(r6(leg.q.reduce((s, x) => s + x, 0)), r6(leg.qty));
    }
  }
}

// ---------- Long chữ nhật, d ≤ 1×A: vào trực tiếp 100% ----------

test('Long chữ nhật d = 0,5×A: market 100%, SL = 108,5 − 0,5×A, TP theo T_ngắn / vùng gần T_đủ / vùng kế tiếp', () => {
  const p = ready(args());
  assert.equal(p.side, 'long');
  assert.equal(p.entryType, 'market');
  assert.equal(r6(p.distanceAtr), 0.5);
  assert.equal(p.entry, 110.5);
  assert.equal(p.stop, 108);
  assert.match(p.stopReason, /108,50 − 0,5×A\(nến phá\) = 108,00/);
  assert.equal(p.targetShort, 115);
  assert.equal(p.targetFull, 120);
  assert.deepEqual(p.targets.map((t) => t.price), [115, 120.8, 125.8]);
  assert.deepEqual(p.targets.map((t) => t.pct), [50, 30, 20]);
  assert.match(p.targets[0]!.reason, /T_ngắn/);
  assert.match(p.targets[1]!.reason, /121,00–122,00/);
  assert.equal(r6(p.targets[0]!.r!), r6(4.5 / 2.5));
  // R sau phí 0,25% + funding 21 kỳ × 0,01% (Long trả): (4,5 − 0,0046×110,5)/2,5
  assert.equal(r6(p.tp1NetR), r6((4.5 - 0.0046 * 110.5) / 2.5));
  // giá tối đa = min(110,5 + 0,3; 108 + 3; (115 + 108)/2,0046) = 110,8
  assert.equal(p.maxEntry, 110.8);
  // khối lượng = 50 / (2,5 + 110,5×0,25%) = 18,0099 → 18,009; chia 9,004 / 5,402 / 3,603
  assert.equal(p.qty, 18.009);
  assert.deepEqual(p.targets.map((t) => t.qty), [9.004, 5.402, 3.603]);
  assert.equal(p.fillTable.length, 3);
  assert.deepEqual(p.fillTable.map((r) => r.label), ['giá hiện tại', 'giữa', 'giá tối đa']);
  assert.equal(p.targetsIfMarketOnly, null);
  assert.equal(p.limitPrice, null);
  assertGrid(p);
});

test('sau TP1: giá vào cách đường phá ≥ 0,5×A → SL về giá khớp thật', () => {
  const p = ready(args());
  assert.equal(p.afterTp1Stop, 110.5);
  assert.match(p.afterTp1Reason, /giá khớp thật/);
  assert.match(p.afterTp1Reason, /110,50/);
});

test('sau TP1: giá vào cách đường phá < 0,5×A → SL về đường phá − 0,5×A', () => {
  const p = ready(args({ close: 110.3 }));
  assert.equal(p.entryType, 'market');
  assert.equal(p.afterTp1Stop, 109.5);
  assert.match(p.afterTp1Reason, /đường phá 110,00 − 0,5×A = 109,50/);
});

test('sau TP1: dải giá khớp 110,30–110,60 vắt qua ngưỡng 110,50 → in cả hai điều kiện, có dữ liệu cấu trúc', () => {
  const p = ready(args({ close: 110.3 }));
  assert.equal(p.maxEntry, 110.6);
  assert.deepEqual(p.afterTp1Rule, { threshold: 110.5, nearStop: 109.5, applies: 'both' });
  assert.match(p.afterTp1Reason, /Nếu giá khớp < 110,50: sau TP1 dời SL về đường phá 110,00 − 0,5×A = 109,50; nếu khớp ≥ 110,50: dời SL về đúng giá khớp thật/);
});

test('sau TP1: cả dải giá khớp dưới ngưỡng → một luật (đường phá − 0,5×A); cả dải trên ngưỡng → một luật (giá khớp thật)', () => {
  const near = ready(args({ close: 110.1 }));
  assert.equal(near.maxEntry, 110.4);
  assert.deepEqual(near.afterTp1Rule, { threshold: 110.5, nearStop: 109.5, applies: 'near' });
  assert.doesNotMatch(near.afterTp1Reason, /Nếu giá khớp/);
  const far = ready(args());
  assert.deepEqual(far.afterTp1Rule, { threshold: 110.5, nearStop: 109.5, applies: 'far' });
  assert.doesNotMatch(far.afterTp1Reason, /Nếu giá khớp/);
  // limit: giá đã biết → một luật
  const lim = ready(args({ close: 112.5, geometry: geom({ stopRef: { up: 109, down: 101 } }) }));
  assert.equal(lim.afterTp1Rule.applies, 'near');
});

test('Short: dải giá khớp 109,40–109,70 vắt qua ngưỡng 109,50 → in cả hai điều kiện (đối xứng)', () => {
  const g = geom({ upper: () => 120, lower: () => 110, stopRef: { up: 118, down: 111.5 } });
  const p = ready(args({ close: 109.7, side: 'short', geometry: g, state: st({ side: 'down' }), zones: [zone(101.5, 102), zone(98, 99), zone(93, 94)] }));
  assert.equal(p.maxEntry, 109.4);
  assert.deepEqual(p.afterTp1Rule, { threshold: 109.5, nearStop: 110.5, applies: 'both' });
  assert.match(p.afterTp1Reason, /Nếu giá khớp > 109,50: sau TP1 dời SL về đường phá 110,00 \+ 0,5×A = 110,50; nếu khớp ≤ 109,50: dời SL về đúng giá khớp thật/);
});

test('cờ có đường phá nghiêng: d và SL sau TP1 dùng giá trị đường tại nến cuối, in độ dốc', () => {
  // đường trên của cờ: 110 tại nến phá 30, giảm 0,1 mỗi nến → 109,7 tại nến cuối 33
  const g = geom({ kind: 'bull_flag', breakoutSide: 'up', height: 30, stopRef: { up: 108, down: 110 },
    upper: (i: number) => 110 - 0.1 * (i - 30), lower: (i: number) => 108 - 0.1 * (i - 30) });
  const c = [...candles(110.5), k(31, 110.1, 109.6, 109.85), k(32, 110.1, 109.6, 109.85), k(33, 110.1, 109.6, 109.85)];
  const p = ready(args({ candles: c, geometry: g, zones: [] }));
  assert.equal(p.breakoutLine, 110);
  assert.equal(r6(p.lineNow), 109.7);
  assert.equal(r6(p.lineSlope), -0.1);
  assert.equal(r6(p.distanceAtr), 0.15);
  assert.equal(p.afterTp1Stop, 109.2);
  assert.equal(p.afterTp1Rule.applies, 'near');
  assert.match(p.afterTp1Reason, /đường phá nghiêng: dịch −0,1000 mỗi nến/);
  assert.match(p.afterTp1Reason, /ước tính hiện tại: 109,20/);
  // đường ngang: không in câu nghiêng
  assert.doesNotMatch(ready(args({ close: 110.3 })).afterTp1Reason, /nghiêng/);
});

// ---------- d trong (1, 2]×A: 50% market + 50% limit ----------

test('Long d = 1,4×A: 50% market + 50% limit tại đường phá + 0,25×A; tổng rủi ro theo giá vào trung bình', () => {
  const p = ready(args({ close: 111.4, geometry: geom({ stopRef: { up: 109, down: 101 } }) }));
  assert.equal(p.entryType, 'split');
  assert.equal(p.stop, 108.5);
  assert.equal(p.limitPrice, 110.25);
  assert.equal(p.limitExpiryBars, 10);
  assert.equal(p.limitExpiryHours, 40);
  assert.equal(p.cancelIfTp1First, true); // TP1 115 ở phía trước giá hiện tại 111,4
  assert.match(p.entryReason, /hoặc khi giá chạm TP1 trước/);
  // giá TB 50/50 = 110,825; khối lượng = 50 / (2,325 + 110,825×0,25%) = 19,2156 → 19,215; chân market 9,607, chân limit 9,608
  const row = p.fillTable[0]!;
  assert.deepEqual(row.legs.map((l) => [l.kind, l.price, l.qty]), [['market', 111.4, 9.607], ['limit', 110.25, 9.608]]);
  assert.equal(p.qty, 19.215);
  // rủi ro khi khớp cả hai ≤ ngân sách 50
  assert.ok(row.estLoss <= 50 + 1e-9, `rủi ro ${row.estLoss}`);
  assert.ok(row.estLoss > 49.9);
  // TP cho trường hợp chỉ khớp chân market và cả hai
  assert.deepEqual(p.targetsIfMarketOnly, [4.803, 2.882, 1.922]);
  assert.deepEqual(p.targets.map((t) => t.qty), [r6(4.803 + 4.804), r6(2.882 + 2.882), r6(1.922 + 1.922)]);
  // R:R kiểm ở trường hợp xấu nhất (chỉ khớp market 111,4)
  assert.equal(r6(p.tp1NetR), r6((3.6 - 0.0046 * 111.4) / 2.9));
  // sau TP1: cả hai trường hợp đều cách đường phá ≥ 0,5×A → giá khớp thật; câu in nêu cả hai giá
  assert.match(p.afterTp1Reason, /cả hai/);
  assert.match(p.afterTp1Reason, /111,40/);
  assert.equal(p.afterTp1StopIfMarketOnly, 111.4);
  // giá tối đa = min(111,7; 108,5 + 3 = 111,5; (115 + 108,5)/2,0046 = 111,4936) → 111,49
  assert.equal(p.maxEntry, 111.49);
  assertGrid(p);
});

// ---------- d > 2×A: chỉ limit 50% ----------

test('Long d = 2,5×A: không vào trực tiếp, chỉ limit 50% khối lượng; sau TP1 SL về đường phá − 0,5×A', () => {
  const p = ready(args({ close: 112.5, geometry: geom({ stopRef: { up: 109, down: 101 } }) }));
  assert.equal(p.entryType, 'limit');
  assert.equal(p.entry, 110.25);
  assert.equal(p.limitPrice, 110.25);
  assert.equal(p.fillTable.length, 1);
  assert.equal(p.fillTable[0]!.label, 'limit');
  // khối lượng đủ = 50 / (1,75 + 110,25×0,25%) = 24,6838 → 24,683; một nửa = 12,341
  assert.equal(p.qty, 12.341);
  assert.equal(p.cancelIfTp1First, true);
  assert.equal(p.afterTp1Stop, 109.5);
  assert.match(p.afterTp1Reason, /đường phá 110,00 − 0,5×A = 109,50/);
  assert.match(p.entryReason, /không vào trực tiếp/);
  assertGrid(p);
});

test('sau TP1: đường phá − 0,5×A xa hơn SL gốc → giữ SL gốc, không nới', () => {
  const p = ready(args({ close: 112.5, geometry: geom({ stopRef: { up: 110.2, down: 101 } }) }));
  assert.equal(p.entryType, 'limit');
  assert.equal(p.stop, 109.7);
  assert.equal(p.afterTp1Stop, 109.7);
  assert.match(p.afterTp1Reason, /giữ SL 109,70/);
});

test('limit: TP1 đã nằm sau giá hiện tại → không in điều kiện "hủy khi chạm TP1 trước"', () => {
  const p = ready(args({ close: 116, geometry: geom({ stopRef: { up: 109, down: 101 } }), zones: [zone(126, 127)],
    candles: [...candles(105).slice(0, 30), k(30, 116.2, 113.8, 116)] }));
  assert.equal(p.entryType, 'limit');
  assert.equal(p.targets[0]!.price, 115);
  assert.equal(p.cancelIfTp1First, false);
  assert.doesNotMatch(p.entryReason, /chạm TP1/);
});

// ---------- chờ thêm 1 nến ----------

test('biên độ nến phá > 3×ATR(1H): chờ xác nhận; nến sau giữ được → lập lệnh; quay vào → bỏ', () => {
  const big = [...candles(105).slice(0, 30), k(30, 110.8, 107, 110.5)]; // biên độ 3,8 > 3
  const w = buildPatternPlan(args({ candles: big }));
  assert.equal(w.status, 'wait_confirm');
  assert.equal(w.plan, null);
  assert.match(w.reason!, /^Chờ xác nhận/);

  const held = [...big, k(31, 110.8, 110.2, 110.5)];
  const ok = buildPatternPlan(args({ candles: held }));
  assert.equal(ok.status, 'ready', ok.reason ?? '');

  const back = [...big, k(31, 110.5, 109.5, 109.8)];
  const no = buildPatternPlan(args({ candles: back }));
  assert.equal(no.status, 'rejected');
  assert.match(no.reason!, /không giữ được/);
});

// ---------- R > 3×A ----------

test('R > 3×A → bỏ lệnh', () => {
  const r = buildPatternPlan(args({ geometry: geom({ stopRef: { up: 107.5, down: 101 } }) }));
  assert.equal(r.status, 'rejected');
  assert.equal(r.plan!.valid, false);
  assert.equal(r.plan!.stop, 107);
  assert.match(r.reason!, /3,50×A > 3×A/);
});

// ---------- cờ: TP1 ≥ 1,5R ----------

function bullFlag(pole: number): PatternGeometry {
  return geom({ kind: 'bull_flag', breakoutSide: 'up', height: pole, stopRef: { up: 108, down: 110 }, upper: () => 110, lower: () => 108 });
}

test('cờ: T_đủ = đáy cờ + cán × 0,46; T_ngắn = nửa quãng từ đường phá; TP1 1,32R sau phí < 1,5R → bỏ', () => {
  const r = buildPatternPlan(args({ close: 110.4, geometry: bullFlag(25), zones: [] }));
  assert.equal(r.status, 'rejected');
  assert.equal(r.plan!.targetFull, 119.5);
  assert.equal(r.plan!.targetShort, 114.75);
  assert.match(r.reason!, /1,5R/);
  // cùng số liệu nhưng là chữ nhật (ngưỡng 1R) thì không bị bỏ vì R:R
  const rect = buildPatternPlan(args({ close: 110.4, geometry: geom({ stopRef: { up: 108, down: 101 }, height: 9.5 }), zones: [] }));
  assert.equal(rect.status, 'ready', rect.reason ?? '');
});

test('cờ đủ dài: TP1 ≥ 1,5R → lập lệnh', () => {
  const p = ready(args({ close: 110.4, geometry: bullFlag(30), zones: [] }));
  assert.equal(p.targetFull, 121.8);
  assert.equal(p.targetShort, 115.9);
  assert.equal(p.targets[0]!.price, 115.9);
  assert.equal(p.targets[1]!.price, 121.8); // không có vùng S/R → dùng chính T_đủ
  assert.equal(p.targets[2]!.price, null); // trailing
  assert.ok(p.tp1NetR >= 1.5);
});

// ---------- biên vùng nhiều tháng ----------

test('T_đủ nằm sau biên trên vùng nhiều tháng chưa phá → TP2 = biên đó, bỏ TP3', () => {
  const p = ready(args({ multiMonth: { upper: 119, lower: 90, state: 'inside' } }));
  assert.equal(p.targets[1]!.price, 118.8);
  assert.match(p.targets[1]!.reason, /nhiều tháng/);
  assert.equal(p.targets[2]!.price, null);
  assert.equal(p.targets[2]!.pct, 0);
  assert.equal(p.targets[2]!.qty, 0);
  assert.deepEqual(p.targets.map((t) => t.pct), [50, 50, 0]);
  assert.deepEqual(p.targets.map((t) => t.qty), [9.004, 9.005, 0]);
  assertGrid(p);
  // vùng đã phá lên thì không chặn
  const broken = ready(args({ multiMonth: { upper: 119, lower: 90, state: 'broken_up' } }));
  assert.deepEqual(broken.targets.map((t) => t.price), [115, 120.8, 125.8]);
});

// ---------- Short đối xứng ----------

test('Short chữ nhật phá xuống: đối xứng Long, funding dương không tính là chi phí cho Short', () => {
  const g = geom({ upper: () => 120, lower: () => 110, stopRef: { up: 118, down: 111.5 } });
  const p = ready(args({ close: 109.5, side: 'short', geometry: g, state: st({ side: 'down' }),
    zones: [zone(101.5, 102), zone(98, 99), zone(93, 94)] }));
  assert.equal(p.side, 'short');
  assert.equal(p.entryType, 'market');
  assert.equal(p.stop, 112);
  assert.match(p.stopReason, /111,50 \+ 0,5×A\(nến phá\) = 112,00/);
  assert.equal(p.targetShort, 105);
  assert.equal(p.targetFull, 100);
  assert.deepEqual(p.targets.map((t) => t.price), [105, 99.2, 94.2]);
  assert.equal(r6(p.tp1NetR), r6((4.5 - 0.0025 * 109.5) / 2.5));
  assert.equal(p.maxEntry, 109.2);
  assert.equal(p.qty, 18.026);
  assert.deepEqual(p.targets.map((t) => t.qty), [9.013, 5.407, 3.606]);
  assert.equal(p.afterTp1Stop, 109.5);
  assertGrid(p);
});

test('Short d = 0,3×A: sau TP1 SL về đường phá + 0,5×A; Short d = 1,5×A chia market + limit', () => {
  const g = geom({ upper: () => 120, lower: () => 110, stopRef: { up: 118, down: 111.5 } });
  const zs = [zone(101.5, 102), zone(98, 99), zone(93, 94)];
  const near = ready(args({ close: 109.7, side: 'short', geometry: g, state: st({ side: 'down' }), zones: zs }));
  assert.equal(near.afterTp1Stop, 110.5);
  assert.match(near.afterTp1Reason, /đường phá 110,00 \+ 0,5×A = 110,50/);
  const split = ready(args({ close: 108.5, side: 'short', geometry: geom({ upper: () => 120, lower: () => 110, stopRef: { up: 118, down: 110.5 } }),
    state: st({ side: 'down' }), zones: zs }));
  assert.equal(split.entryType, 'split');
  assert.equal(split.limitPrice, 109.75);
  assert.equal(split.stop, 111);
  assertGrid(split);
});

// ---------- từng loại mô hình: p của T_ngắn ----------

test('T_ngắn theo loại: tam giác tăng 0,70; vai-đầu-vai 0,51; còn lại 0,5', () => {
  const longKinds = [['asc_triangle', 0.7], ['inv_head_shoulders', 0.5], ['rectangle', 0.5], ['sym_triangle', 0.5]] as const;
  for (const [kind, p] of longKinds) {
    const plan = ready(args({ geometry: geom({ kind, breakoutSide: kind === 'rectangle' || kind === 'sym_triangle' ? 'both' : 'up' }),
      state: st({ inBreakoutWindow: kind.endsWith('triangle') ? true : null }), zones: [] }));
    assert.equal(plan.kind, kind);
    assert.equal(r6(plan.targetShort), r6(110 + 10 * p), kind);
    assert.equal(plan.targets[0]!.price, r6(110 + 10 * p), kind);
  }
  const shortKinds = [['head_shoulders', 0.51], ['desc_triangle', 0.5]] as const;
  for (const [kind, p] of shortKinds) {
    const plan = ready(args({ close: 109.5, side: 'short', zones: [],
      geometry: geom({ kind, breakoutSide: 'down', upper: () => 120, lower: () => 110, stopRef: { up: 118, down: 111.5 } }),
      state: st({ side: 'down', inBreakoutWindow: kind === 'desc_triangle' ? true : null }) }));
    assert.equal(plan.side, 'short');
    assert.equal(r6(plan.targetShort), r6(110 - 10 * p), kind);
  }
  const bear = ready(args({ close: 109.6, side: 'short', zones: [],
    geometry: geom({ kind: 'bear_flag', breakoutSide: 'down', height: 30, upper: () => 112, lower: () => 110, stopRef: { up: 110, down: 112 } }),
    state: st({ side: 'down' }) }));
  assert.equal(bear.targetFull, r6(112 - 0.46 * 30));
  assert.equal(bear.targetShort, r6(110 - 0.5 * (110 - (112 - 0.46 * 30))));
});

// ---------- chặn ----------

test('không lập lệnh: trạng thái khác breakout/retested, tín hiệu cũ, tam giác ngoài cửa sổ, vùng nhiều tháng', () => {
  for (const s of ['forming', 'armed', 'breakout_pending', 'failed', 'expired', 'invalidated'] as const) {
    const r = buildPatternPlan(args({ state: st({ state: s }) }));
    assert.equal(r.status, 'rejected', s);
    assert.equal(r.plan, null);
  }
  assert.equal(buildPatternPlan(args({ state: st({ state: 'retested', retest: 'yes' }) })).status, 'ready');
  const stale = buildPatternPlan(args({ state: st({ signalStale: true }) }));
  assert.equal(stale.status, 'rejected');
  assert.match(stale.reason!, /cũ/);
  const win = buildPatternPlan(args({ geometry: geom({ kind: 'sym_triangle' }), state: st({ inBreakoutWindow: false }) }));
  assert.equal(win.status, 'rejected');
  assert.match(win.reason!, /50–80%/);
  const mm = buildPatternPlan(args({ geometry: geom({ kind: 'multi_month_range' }) }));
  assert.equal(mm.status, 'rejected');
});

test('Short vai-đầu-vai (đảo chiều) trong 30 ngày sau khi BTC lấy lại SMA200: không vào trực tiếp → chỉ limit; giá quá sát → bỏ', () => {
  const g = geom({ kind: 'head_shoulders', breakoutSide: 'down', upper: () => 120, lower: () => 110, stopRef: { up: 110, down: 111.5 } });
  const c = candles(109.5, 'short');
  const now = c[c.length - 1]!.closeTime;
  const blocked = ready(args({ candles: c, geometry: g, state: st({ side: 'down' }), zones: [], btcSma200ReclaimedAt: now - 10 * DAY }));
  assert.equal(blocked.entryType, 'limit');
  assert.equal(blocked.limitPrice, 109.75);
  assert.match(blocked.entryReason, /SMA200/);
  const old = ready(args({ candles: c, geometry: g, state: st({ side: 'down' }), zones: [], btcSma200ReclaimedAt: now - 31 * DAY }));
  assert.equal(old.entryType, 'market');
  // Long hai đáy không bị luật này
  const tooClose = buildPatternPlan(args({ candles: candles(109.8, 'short'), geometry: g, state: st({ side: 'down' }), zones: [],
    btcSma200ReclaimedAt: now - DAY }));
  assert.equal(tooClose.status, 'rejected');
  assert.match(tooClose.reason!, /limit/);
});

test('giá vào / giá limit nằm trong vùng S/R → không hợp lệ', () => {
  const inMarket = buildPatternPlan(args({ zones: [zone(110.2, 110.8), ...longZones] }));
  assert.equal(inMarket.status, 'rejected');
  assert.match(inMarket.reason!, /nằm trong vùng/);
  const inLimit = buildPatternPlan(args({ close: 112.5, geometry: geom({ stopRef: { up: 109, down: 101 } }), zones: [zone(110, 110.4), ...longZones] }));
  assert.equal(inLimit.status, 'rejected');
  assert.match(inLimit.reason!, /limit 110,25 nằm trong vùng/);
});

test('khối lượng quá nhỏ so với bước khối lượng → không hợp lệ, không có phần 0 coin', () => {
  const r = buildPatternPlan(args({ capital: 100, stepSize: 1 }));
  assert.equal(r.status, 'rejected');
  assert.match(r.reason!, /Khối lượng/);
});

test('giá đã quay vào trong mô hình (d ≤ 0) → không lập lệnh', () => {
  const r = buildPatternPlan(args({ candles: [...candles(110.5), k(31, 110.2, 109.6, 109.8)], state: st({ state: 'retested', retest: 'yes' }) }));
  assert.equal(r.status, 'rejected');
  assert.match(r.reason!, /quay vào/);
});

test('tích hợp: trạng thái từ evaluateState trên chữ nhật thật → kế hoạch Long', () => {
  const g = geom();
  const c = candles(110.5);
  const atrArr = new Array<number>(c.length).fill(1);
  const s = evaluateState(g, c, atrArr, '4h');
  assert.equal(s.state, 'breakout');
  const p = ready(args({ candles: c, state: s, atr: atrArr }));
  assert.equal(p.entryType, 'market');
  assert.equal(p.breakoutLine, 110);
  assert.equal(COMMON.patterns.plan.limitExpiryBars, 10);
});

// ---------- Người dùng chọn 19/10/2026: hai đỉnh/hai đáy CHỈ LÀ BỐI CẢNH ----------
test('hai đỉnh/hai đáy: không lập kế hoạch lệnh (chỉ bối cảnh), kể cả khi đã phá', () => {
  for (const kind of ['double_bottom', 'double_top'] as const) {
    const down = kind === 'double_top';
    const r = buildPatternPlan(args({ close: down ? 109.5 : 110.5, side: down ? 'short' : 'long', zones: [],
      geometry: geom({ kind, breakoutSide: down ? 'down' : 'up' }), state: st({ side: down ? 'down' : 'up' }) }));
    assert.equal(r.status, 'rejected', kind);
    assert.equal(r.plan, null);
    assert.match(r.reason!, /chỉ là bối cảnh/);
  }
  assert.equal((COMMON.patterns.plan as Record<string, unknown>).maxRiskAtrByKind, undefined, 'trần 4×A cho hai đỉnh/đáy đã bỏ');
});

test('B2: kế hoạch mang id mô hình, thời điểm nến phá (openTime) và thời điểm phát (closeTime nến cuối)', () => {
  const extra = [k(0, 111, 110.2, 110.6)];
  const a = args({ candles: candles(110.5, 'long', extra) });
  const p = ready(a);
  assert.equal(p.patternId, 'BTCUSDT|4h|rectangle|1|2');
  assert.equal(p.breakoutTime, T0 + 30 * H4);
  assert.equal(p.signalTime, T0 + 32 * H4 - 1);
});
