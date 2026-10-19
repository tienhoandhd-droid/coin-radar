import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planOrders, exitSplit, type PlannerInput, type PlannerPlan, type DesiredOrder } from './planner.ts';
import { trailingFor } from '../core/exit.ts';
import { makeClientId, CLIENT_ID_RE } from '../binance/orders.ts';
import type { Contract, Side } from '../core/types.ts';
import type { OpenTrade } from '../core/portfolio.ts';

const C: Contract = {
  symbol: 'AAAUSDT', baseAsset: 'AAA', onboardDate: 0, tickSize: 0.01, stepSize: 0.001, minQty: 0.001, maxQty: 100_000,
  marketMinQty: 0.001, marketMaxQty: 100_000, marketStepSize: 0.001, minNotional: 5, maxNumOrders: 200, deliveryDate: 4133894400000,
};
const NOW = 1_760_000_000_000;
const COST = 0.1; // % khứ hồi
const step = 0.001;
const sq = (x: number) => Number(x.toFixed(3));

// Kế hoạch tay (không qua buildPlan): Long giá mark 100. Short đối xứng quanh 100.
// floor = true: TP1 sát giá vào → khoảng bảo đảm không lỗ < 0,1% → trailingFor báo needsBreakevenFloor.
function mkPlan(side: Side, entryType: 'market' | 'limit' | 'split', floor: boolean, over: Partial<PlannerPlan> = {}): PlannerPlan {
  const d = side === 'long' ? 1 : -1;
  const at = (x: number) => Number((100 + d * x).toFixed(2)); // x = khoảng cách có dấu theo chiều lời
  const marketPrice = 100;
  const limitPrice = entryType === 'market' ? null : at(-1); // Long 99 / Short 101
  const maxEntry = entryType === 'limit' ? limitPrice! : at(floor ? 0 : 0.5);
  const stop = at(-3);
  const worst = entryType === 'limit' ? limitPrice! : side === 'long' ? Math.max(maxEntry, limitPrice ?? -Infinity) : Math.min(maxEntry, limitPrice ?? Infinity);
  const tp1 = floor ? Number((worst + d * 0.15).toFixed(2)) : at(6); // floor: TP1 − (giá vào + 0,1% phí) ≈ 0,05% < 0,1%
  const entry = entryType === 'limit' ? limitPrice! : entryType === 'split' ? (marketPrice + limitPrice!) / 2 : marketPrice;
  const qty = 60;
  const tp1Qty = 30;
  return {
    side, entryType, marketPrice, entry, maxEntry, stop, limitPrice,
    cancelIfTp1First: entryType !== 'market',
    targets: [
      { name: 'TP1', price: tp1, pct: 50, qty: tp1Qty, r: 2, reason: 't' },
      { name: 'TP2', price: null, pct: 30, qty: 0, r: null, reason: 't' },
      { name: 'TP3', price: null, pct: 20, qty: 0, r: null, reason: 't' },
    ],
    exit: { policy: 'C2', tp1Qty, trailQty: qty - tp1Qty, trailing: trailingFor(side, worst, tp1, 3, COST) },
    valid: true, invalidReason: null, qty, costPct: COST, suggestedLeverage: 5,
    limitExpiryHours: entryType === 'market' ? null : 24, riskPct: 2,
    ...over,
  };
}

function input(plan: PlannerPlan, over: Partial<PlannerInput> = {}): PlannerInput {
  return {
    plan, grade: 'A', signal: { id: 'AAAUSDT|swing|long|zone|1|98', fresh: true }, mode: 'swing', contract: C, capital: 100_000,
    openTrades: [], openOrderCount: 0, maxNotional: Infinity, markPrice: 100, runId: 'r1', now: NOW, ...over,
  };
}

const role = (legs: DesiredOrder[], r: string) => legs.find((l) => l.role === r);
const entryOf = (legs: DesiredOrder[], r: 'E1' | 'E2') => {
  const l = legs.find((x) => x.role === r);
  if (l === undefined || l.op !== 'placeEntry') throw new Error(`không có chân vào ${r}`);
  return l;
};
const qtyOf = (l: DesiredOrder | undefined) => (l !== undefined && 'qty' in l.input ? l.input.qty : NaN);

// ---- Bảng ca Long/Short × market/limit/split × có/không dừng sàn ------------------------------
for (const side of ['long', 'short'] as const) {
  for (const entryType of ['market', 'limit', 'split'] as const) {
    for (const floor of [false, true]) {
      test(`B3 bảng ca: ${side} ${entryType} ${floor ? 'CÓ' : 'không'} dừng sàn → đủ bộ lệnh, đúng phía, đúng khối lượng`, () => {
        const plan = mkPlan(side, entryType, floor);
        assert.equal(plan.exit.trailing!.needsBreakevenFloor, floor, 'fixture sai');
        const r = planOrders(input(plan));
        assert.equal(r.allowed, true, r.reasons.join('; '));
        const d = side === 'long' ? 1 : -1;
        const roles = r.legs.map((l) => l.role);
        const entries = entryType === 'split' ? ['E1', 'E2'] : ['E1'];
        assert.deepEqual(roles, [...entries, 'SL', 'TP1', 'TR', ...(floor ? ['BE'] : [])]);
        // chân vào
        const e1 = entryOf(r.legs, 'E1');
        assert.equal(e1.when, 'now');
        assert.equal(e1.input.kind, entryType === 'limit' ? 'limit' : 'market');
        if (entryType === 'split') assert.equal(entryOf(r.legs, 'E2').input.kind, 'limit');
        const lim = r.legs.find((l) => l.op === 'placeEntry' && l.input.kind === 'limit');
        if (lim !== undefined && lim.op === 'placeEntry' && lim.input.kind === 'limit') {
          assert.equal(lim.input.limitPrice, plan.limitPrice);
          assert.equal(lim.input.expireAt, NOW + 24 * 3_600_000);
          const tp1 = plan.targets[0]!.price!;
          assert.equal(lim.cancelIfMarkReaches, d * (tp1 - 100) > 0 ? tp1 : null); // chỉ khi TP1 còn ở phía trước giá mark
        }
        // SL gốc: closePosition (purpose initial), bên lỗ của mọi giá vào
        const sl = role(r.legs, 'SL')!;
        assert.equal(sl.op, 'placeStopLoss');
        assert.equal(sl.when, 'on_entry_fill');
        if (sl.op === 'placeStopLoss') {
          assert.equal(sl.input.purpose, 'initial');
          assert.equal(sl.input.triggerPrice, plan.stop);
        }
        // TP1 + trailing: kích hoạt = TP1, callback lấy từ exit.ts
        const tp = role(r.legs, 'TP1')!;
        const tr = role(r.legs, 'TR')!;
        assert.ok(tp.op === 'placeTakeProfit' && tr.op === 'placeTrailing');
        if (tp.op === 'placeTakeProfit' && tr.op === 'placeTrailing') {
          assert.equal(tp.input.triggerPrice, plan.targets[0]!.price);
          assert.equal(tr.input.activatePrice, tp.input.triggerPrice);
          assert.equal(tr.input.callbackPct, plan.exit.trailing!.callbackPct);
          assert.ok(d * (tp.input.triggerPrice - tp.input.entryPrice) > 0);
        }
        // khối lượng: TP1 + trailing = cả vị thế (khi mọi chân khớp) = tổng các chân vào
        const pos = sq(r.legs.filter((l) => l.op === 'placeEntry').reduce((s, l) => s + qtyOf(l), 0));
        assert.equal(pos, r.sizing!.qty);
        assert.equal(sq(qtyOf(tp) + qtyOf(tr)), pos);
        assert.equal(qtyOf(tp), sq(Math.floor(pos / 2 / step + 1e-9) * step));
        // dừng sàn hòa vốn: chỉ khi needsBreakevenFloor, đặt sau khi TP1 khớp, giữa giá vào xấu nhất và TP1
        const be = role(r.legs, 'BE');
        if (floor) {
          assert.ok(be !== undefined && be.op === 'placeStopLoss');
          if (be.op === 'placeStopLoss') {
            assert.equal(be.when, 'on_tp1_fill');
            assert.equal(be.input.purpose, 'breakeven');
            assert.ok(d * (be.input.triggerPrice - plan.maxEntry) > 0);
            assert.ok(d * (plan.targets[0]!.price! - be.input.triggerPrice) > 0);
          }
        }
        // mã client tất định, hợp lệ, không trùng
        const ids = r.legs.map((l) => l.clientId);
        assert.equal(new Set(ids).size, ids.length);
        for (const id of ids) assert.match(id, CLIENT_ID_RE);
        assert.equal(e1.clientId, makeClientId({ runId: 'r1', signalId: 'AAAUSDT|swing|long|zone|1|98', leg: 'E1', attempt: 0 }));
        // kịch bản khớp: split có "chỉ chân market khớp"
        assert.equal(r.exitByFill.length, entryType === 'split' ? 2 : 1);
        for (const s of r.exitByFill) assert.equal(sq(s.tp1Qty + s.trailQty), s.positionQty);
      });
    }
  }
}

test('B3 split: kịch bản "chỉ chân market khớp" có TP1/trailing riêng (dữ liệu cho bộ đối chiếu B4)', () => {
  const r = planOrders(input(mkPlan('long', 'split', false)));
  assert.equal(r.allowed, true, r.reasons.join('; '));
  const e1 = qtyOf(role(r.legs, 'E1'));
  const e2 = qtyOf(role(r.legs, 'E2'));
  assert.equal(e1, 30);
  assert.equal(e2, 30);
  const only = r.exitByFill.find((s) => s.filled.join() === 'E1')!;
  assert.deepEqual(only, { filled: ['E1'], positionQty: 30, tp1Qty: 15, trailQty: 15 });
  const both = r.exitByFill.find((s) => s.filled.join() === 'E1,E2')!;
  assert.deepEqual(both, { filled: ['E1', 'E2'], positionQty: 60, tp1Qty: 30, trailQty: 30 });
  assert.deepEqual(r.exitRule, { tp1Pct: 50, qtyStep: 0.001 });
});

test('B3 exitSplit: 50/50 làm tròn theo bước, phần dư cho trailing, tổng luôn bằng vị thế', () => {
  assert.deepEqual(exitSplit(0.003, 0.001), { tp1Qty: 0.001, trailQty: 0.002 });
  assert.deepEqual(exitSplit(60, 0.001), { tp1Qty: 30, trailQty: 30 });
  assert.deepEqual(exitSplit(7, 1), { tp1Qty: 3, trailQty: 4 });
  const e = exitSplit(12.345, 0.001);
  assert.equal(sq(e.tp1Qty + e.trailQty), 12.345);
});

test('B3 khối lượng lẻ: tổng TP1 + trailing đúng bằng vị thế (dư 1 bước về trailing)', () => {
  const plan = mkPlan('long', 'market', false, { qty: 0.123 });
  const r = planOrders(input(plan, { contract: { ...C, minNotional: 5 } }));
  assert.equal(r.allowed, true, r.reasons.join('; '));
  assert.equal(qtyOf(role(r.legs, 'TP1')), 0.061);
  assert.equal(qtyOf(role(r.legs, 'TR')), 0.062);
  assert.equal(qtyOf(role(r.legs, 'E1')), 0.123);
});

test('B3 mã client ổn định giữa các lần gọi; đổi runId/signalId thì đổi mã', () => {
  const a = planOrders(input(mkPlan('short', 'split', true)));
  const b = planOrders(input(mkPlan('short', 'split', true)));
  assert.deepEqual(a, b);
  const c = planOrders(input(mkPlan('short', 'split', true), { runId: 'r2' }));
  assert.notEqual(c.legs[0]!.clientId, a.legs[0]!.clientId);
  const s = planOrders(input(mkPlan('short', 'split', true), { signal: { id: 'khác', fresh: true } }));
  assert.notEqual(s.legs[0]!.clientId, a.legs[0]!.clientId);
});

test('B3 danh mục: tổng rủi ro mở 9% → canOpen giảm khối lượng, mang khối lượng mới + rủi ro thực vào mọi chân', () => {
  // vốn 100.000, rủi ro 1 coin = |100 − 97| + 0,1 = 3,1 → 60 coin = 186 USDT; đang mở 9.950 USDT → còn 50 USDT → 16,129 coin
  const open: OpenTrade[] = [{ symbol: 'XUSDT', side: 'long', notional: 1000, leverage: 5, riskAmount: 9_950, pastTp1: false }];
  const r = planOrders(input(mkPlan('long', 'market', false), { openTrades: open }));
  assert.equal(r.allowed, true, r.reasons.join('; '));
  assert.equal(r.sizing!.adjusted, true);
  assert.equal(r.sizing!.requestedQty, 60);
  assert.equal(r.sizing!.qty, 16.129);
  assert.ok(r.sizing!.riskPct < 2 && r.sizing!.riskPct > 0.04);
  assert.match(r.reasons.join(), /tổng rủi ro mở/);
  assert.equal(qtyOf(role(r.legs, 'E1')), 16.129);
  assert.equal(sq(qtyOf(role(r.legs, 'TP1')) + qtyOf(role(r.legs, 'TR'))), 16.129);
});

test('B3 danh mục: split bị giảm khối lượng → chia lại hai chân 50/50 theo bước', () => {
  const open: OpenTrade[] = [{ symbol: 'XUSDT', side: 'long', notional: 1000, leverage: 5, riskAmount: 9_950, pastTp1: false }];
  const r = planOrders(input(mkPlan('long', 'split', false), { openTrades: open }));
  assert.equal(r.allowed, true, r.reasons.join('; '));
  const e1 = qtyOf(role(r.legs, 'E1'));
  const e2 = qtyOf(role(r.legs, 'E2'));
  assert.equal(sq(e1 + e2), r.sizing!.qty);
  assert.ok(r.sizing!.qty < 60);
  assert.equal(r.exitByFill[0]!.positionQty, e1);
});

test('B3 danh mục: đủ 10 lệnh còn rủi ro → không vào, không có lệnh nào', () => {
  const open: OpenTrade[] = Array.from({ length: 10 }, (_, j) => ({ symbol: `X${j}USDT`, side: 'long', notional: 100, leverage: 5, riskAmount: 1, pastTp1: false }));
  const r = planOrders(input(mkPlan('long', 'market', false), { openTrades: open }));
  assert.equal(r.allowed, false);
  assert.deepEqual(r.legs, []);
  assert.match(r.reasons.join(), /10 lệnh/);
});

// ---- Mỗi bất biến bị vi phạm → allowed=false, lý do tiếng Việt, KHÔNG có lệnh nào ---------------
const L = (over: Partial<PlannerPlan> = {}) => mkPlan('long', 'market', false, over);
const violations: Array<[string, PlannerInput, RegExp]> = [
  ['tín hiệu Hạng B', input(L(), { grade: 'B' }), /Hạng A/],
  ['không có hạng', input(L(), { grade: null }), /Hạng A/],
  ['tín hiệu không MỚI', input(L(), { signal: { id: 'x', fresh: false } }), /MỚI/],
  ['không có tín hiệu', input(L(), { signal: null }), /tín hiệu/],
  ['kế hoạch không hợp lệ', input(L({ valid: false, invalidReason: 'vùng sát' })), /không hợp lệ.*vùng sát/],
  ['SL sai phía (Long SL trên giá vào)', input(L({ stop: 101 })), /SL/],
  ['TP1 sai phía (Long TP1 dưới giá tối đa)', input(L({ targets: [{ ...L().targets[0]!, price: 100.3 }, ...L().targets.slice(1)] })), /TP1/],
  ['kích hoạt trailing ≠ TP1', input(L({ exit: { ...L().exit, trailing: { ...L().exit.trailing!, activationPrice: 105 } } })), /kích hoạt/],
  ['không có TP1', input(L({ targets: [{ ...L().targets[0]!, price: null }, ...L().targets.slice(1)], exit: { policy: 'C2', tp1Qty: 0, trailQty: 60, trailing: null } })), /TP1/],
  ['chính sách thoát A0', input(L(), { exitPolicy: 'A0' }), /C2/],
  ['kế hoạch lập theo A0', input(L({ exit: { ...L().exit, policy: 'A0' } })), /C2/],
  ['khối lượng < bước', input(L({ qty: 0.0004 })), /Khối lượng|minQty|bước/],
  ['MIN_NOTIONAL', input(L({ qty: 0.04 }), { contract: { ...C, minNotional: 5 } }), /MIN_NOTIONAL/],
  ['phần thoát < minQty', input(L({ qty: 0.001 }), { contract: { ...C, minNotional: 0.01 } }), /minQty|thoát/],
  ['hết chỗ MAX_NUM_ORDERS', input(L(), { openOrderCount: 197 }), /MAX_NUM_ORDERS/],
  ['đòn bẩy vượt trần Swing 5×', input(L({ suggestedLeverage: 6 })), /đòn bẩy/i],
  ['đòn bẩy không nguyên', input(L({ suggestedLeverage: 2.5 })), /đòn bẩy/i],
  ['thanh lý trước SL', input(L({ stop: 85, exit: { ...L().exit, trailing: trailingFor('long', 100.5, 106, 3, COST) } })), /thanh lý/],
  ['giá mark đã vượt giá tối đa', input(L(), { markPrice: 100.6 }), /giá tối đa/],
  ['giá mark đã chạm SL', input(L(), { markPrice: 96 }), /SL|mark/],
  ['rủi ro kế hoạch > 2%', input(L({ riskPct: 3 })), /2%/],
  ['limit hết hạn quá ngắn (GTD)', input(mkPlan('long', 'limit', false, { limitExpiryHours: 0.1 })), /GTD|hạn/],
  ['runId sai', input(L(), { runId: 'quá-dài-123' }), /runId|Mã client/],
  ['dừng sàn nằm trên TP1 (TP1 chưa bù phí)', input(mkPlan('long', 'market', true, { targets: [{ ...L().targets[0]!, price: 100.05 }, ...L().targets.slice(1)], exit: { ...mkPlan('long', 'market', true).exit, trailing: { ...mkPlan('long', 'market', true).exit.trailing!, activationPrice: 100.05 } } })), /hòa vốn|TP1/],
];
for (const [name, inp, re] of violations) {
  test(`B3 bất biến: ${name} → không cho vào, không phát nửa bộ lệnh`, () => {
    const r = planOrders(inp);
    assert.equal(r.allowed, false, `phải từ chối: ${name}`);
    assert.deepEqual(r.legs, []);
    assert.ok(r.reasons.length > 0);
    assert.match(r.reasons.join(' | '), re);
  });
}

test('B3 Short: SL trên giá vào bị từ chối nếu nằm dưới (sai phía)', () => {
  const r = planOrders(input(mkPlan('short', 'market', false, { stop: 99 })));
  assert.equal(r.allowed, false);
  assert.match(r.reasons.join(), /SL/);
});

test('B3 thứ tự giữ chỗ: lệnh vào giữ chỗ cho cả bộ (bracketSlots), các chân sau đếm lệnh trước nó', () => {
  const r = planOrders(input(mkPlan('long', 'split', true), { openOrderCount: 3 }));
  assert.equal(r.allowed, true, r.reasons.join('; '));
  const e1 = role(r.legs, 'E1')!;
  const e2 = role(r.legs, 'E2')!;
  assert.ok(e1.op === 'placeEntry' && e2.op === 'placeEntry');
  if (e1.op === 'placeEntry' && e2.op === 'placeEntry') {
    assert.equal(e1.input.openCount, 3);
    assert.equal(e1.input.reserveSlots, 6); // E1, E2, SL, TP1, TR, BE
    assert.equal(e2.input.openCount, 4);
    assert.equal(e2.input.reserveSlots, 5);
  }
  const tp = role(r.legs, 'TP1')!;
  if (tp.op === 'placeTakeProfit') assert.equal(tp.input.openCount, 6);
});
