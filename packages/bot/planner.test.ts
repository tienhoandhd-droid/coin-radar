import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planOrders, exitSplit, type PlannerInput, type PlannerPlan, type DesiredOrder } from './planner.ts';
import { trailingFor } from '../core/exit.ts';
import { COMMON } from '../core/config.ts';
import { makeClientId, CLIENT_ID_RE } from '../binance/orders.ts';
import type { Contract, Side } from '../core/types.ts';
import type { OpenTrade } from '../core/portfolio.ts';

const C: Contract = {
  symbol: 'AAAUSDT', baseAsset: 'AAA', onboardDate: 0, tickSize: 0.01, stepSize: 0.001, minQty: 0.001, maxQty: 100_000,
  marketMinQty: 0.001, marketMaxQty: 100_000, marketStepSize: 0.001, minNotional: 5, maxNumOrders: 200, deliveryDate: 4133894400000,
};
const NOW = 1_760_000_000_000;
// đệm funding rất nhỏ nhưng > 0 (planner từ chối 0 = thiếu dữ liệu): 63 kỳ × 1e-15 × giá ≈ 6e-12 USDT/coin — không đổi số tính tay
const FB0 = { maxAbsRate: 1e-15, intervalHours: 8 };
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
    limitExpiryHours: entryType === 'market' ? null : 24, riskPct: 2, capital: 100_000,
    ...over,
  };
}

function input(plan: PlannerPlan, over: Partial<PlannerInput> = {}): PlannerInput {
  return {
    plan, grade: 'A', signal: { id: 'AAAUSDT|swing|long|zone|1|98', fresh: true }, mode: 'swing', contract: C, capital: plan.capital,
    openTrades: [], openOrderCount: 0, maxNotional: Infinity, markPrice: 100, runId: 'r1', now: NOW, costModel: { tierPct: plan.costPct, quoteVolPerMin: 1e15 }, fundingBuffer: FB0, ...over,
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
        // chân "market" gửi dưới dạng LIMIT IOC giá trần = giá tối đa → sàn không bao giờ khớp vượt giá cho phép
        assert.equal(e1.input.kind, 'limit');
        if (e1.input.kind === 'limit') assert.equal(e1.input.ioc === true, entryType !== 'limit');
        if (entryType !== 'limit' && e1.input.kind === 'limit') {
          assert.equal(e1.input.limitPrice, plan.maxEntry);
          assert.equal(e1.input.expireAt, undefined);
          assert.equal(e1.cancelIfMarkReaches, null);
        }
        if (entryType === 'split') assert.equal(entryOf(r.legs, 'E2').input.kind, 'limit');
        const lim = r.legs.find((l) => l.op === 'placeEntry' && l.input.kind === 'limit' && l.input.ioc !== true);
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
  assert.deepEqual(r.exitRule, { basis: 'filled_qty', tp1Pct: 50, qtyStep: 0.001 });
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
  // vốn 100.000; rủi ro 1 coin ở giá khớp XẤU NHẤT 100,5 = 3,5 + (100,5 + 97) × 0,05% = 3,59875; đang mở 9.950 USDT → còn 50 USDT → 13,893 coin
  const open: OpenTrade[] = [{ symbol: 'XUSDT', side: 'long', notional: 1000, leverage: 5, riskAmount: 9_950, pastTp1: false }];
  const r = planOrders(input(mkPlan('long', 'market', false), { openTrades: open }));
  assert.equal(r.allowed, true, r.reasons.join('; '));
  assert.equal(r.sizing!.adjusted, true);
  assert.equal(r.sizing!.requestedQty, 60);
  assert.equal(r.sizing!.qty, 13.893);
  assert.ok(r.sizing!.realRiskPct <= 0.05 + 1e-9 && r.sizing!.realRiskPct > 0.049, String(r.sizing!.realRiskPct));
  assert.match(r.reasons.join(), /tổng rủi ro mở/);
  assert.equal(qtyOf(role(r.legs, 'E1')), 13.893);
  assert.equal(sq(qtyOf(role(r.legs, 'TP1')) + qtyOf(role(r.legs, 'TR'))), 13.893);
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

// ---- Rà soát B3 #1/#2: khối lượng do planner TỰ tính theo 2% vốn bot, ở giá khớp XẤU NHẤT ---------------------------------
// perUnit = |giá khớp xấu nhất − SL| + giá khớp xấu nhất × phí%; qty = floor(vốn × 2% / perUnit) theo bước.
const worstOfPlan = (p: PlannerPlan) => {
  const fills = [...(p.entryType !== 'limit' ? [p.marketPrice, p.maxEntry] : []), ...(p.entryType !== 'market' ? [p.limitPrice!] : [])];
  return p.side === 'long' ? Math.max(...fills) : Math.min(...fills);
};
const qty2pct = (capital: number, p: PlannerPlan) => {
  const w = worstOfPlan(p);
  // ràng buộc lỗ thật ≤ 2%: nửa phí chiều vào ở giá xấu nhất + nửa phí chiều ra ở giá SL (rà soát Task 3 kế hoạch 2)
  return sq(Math.floor((capital * 0.02) / (Math.abs(w - p.stop) + ((w + p.stop) * COST) / 200) / step + 1e-9) * step);
};
for (const side of ['long', 'short'] as const) {
  for (const entryType of ['market', 'limit', 'split'] as const) {
    for (const [stopName, dist, lev] of [['SL chặt', 0.5, 5], ['SL rộng', 10, 2]] as const) {
      test(`B3 biên 2%: vốn 10.000, ${side} ${entryType} ${stopName} — kế hoạch lập cho vốn lớn hơn → planner cắt về đúng 2% ở giá khớp xấu nhất`, () => {
        const d = side === 'long' ? 1 : -1;
        const base = mkPlan(side, entryType, false);
        // SL cách giá khớp GẦN SL nhất (mark / limit) đúng `dist` → SL chặt: khoảng ở giá xấu nhất chỉ 0,5–2
        const fills = [...(entryType !== 'limit' ? [base.marketPrice] : []), ...(entryType !== 'market' ? [base.limitPrice!] : [])];
        const nearest = side === 'long' ? Math.min(...fills) : Math.max(...fills);
        const stop = Number((nearest - d * dist).toFixed(2));
        const plan = mkPlan(side, entryType, false, { stop, qty: 1_000_000, riskPct: 2, suggestedLeverage: lev, capital: 10_000 });
        const r = planOrders(input(plan));
        assert.equal(r.allowed, true, r.reasons.join('; '));
        const want = qty2pct(10_000, plan);
        assert.equal(r.sizing!.qty, want);
        assert.equal(r.sizing!.worstEntry, worstOfPlan(plan));
        assert.ok(r.sizing!.realRiskPct <= 2 + 1e-9, `rủi ro thực ${r.sizing!.realRiskPct}% > 2%`);
        assert.ok(r.sizing!.realRiskPct > 1.99, `rủi ro thực ${r.sizing!.realRiskPct}% quá xa biên 2%`);
        const pos = sq(r.legs.filter((l) => l.op === 'placeEntry').reduce((s, l) => s + qtyOf(l), 0));
        assert.equal(pos, want);
        // lỗ thật nếu MỌI chân khớp ở giá xấu nhất rồi chạm SL: ≤ 2% vốn
        const w = worstOfPlan(plan);
        assert.ok(pos * (Math.abs(w - stop) + ((w + stop) * COST) / 200) <= 200 + 1e-6);
      });
    }
  }
}

test('B3 rà soát repro: Long market vốn 1.000, kế hoạch qty 60 (lập cho vốn khác) → cắt về 2% ở giá tối đa, KHÔNG bao giờ 10%', () => {
  const r = planOrders(input(mkPlan('long', 'market', false, { capital: 1_000 })));
  assert.equal(r.allowed, true, r.reasons.join('; '));
  // perUnit ở 100,5 = 3,5 + (100,5 + 97) × 0,05% = 3,59875 → 20 / 3,59875 = 5,5574… → 5,557
  assert.equal(r.sizing!.qty, 5.557);
  assert.ok(r.sizing!.realRiskPct <= 2 + 1e-9 && r.sizing!.realRiskPct > 1.99);
  assert.equal(r.sizing!.requestedQty, 5.557);
  assert.equal(r.sizing!.adjusted, false);
  // vốn 9.300: 186 / 3,59875 = 51,684 coin (trước đây vào 60 coin = 2,32% ở giá tối đa)
  const r2 = planOrders(input(mkPlan('long', 'market', false, { capital: 9_300 })));
  assert.equal(r2.sizing!.qty, 51.684);
  assert.ok(r2.sizing!.realRiskPct <= 2 + 1e-9);
});

test('B3 kế hoạch nhỏ hơn 2% (vd chỉ đặt limit 50%) → giữ khối lượng kế hoạch, không phóng to', () => {
  const r = planOrders(input(mkPlan('long', 'limit', false, { qty: 10, capital: 10_000 })));
  assert.equal(r.allowed, true, r.reasons.join('; '));
  assert.equal(r.sizing!.qty, 10);
  assert.ok(r.sizing!.realRiskPct < 2);
});

test('B3 khớp IOC một phần: bộ lệnh thoát định cỡ theo khối lượng ĐÃ khớp (dữ liệu cho B4)', () => {
  const r = planOrders(input(mkPlan('short', 'market', false)));
  assert.equal(r.allowed, true, r.reasons.join('; '));
  assert.equal(r.exitRule.basis, 'filled_qty');
  assert.deepEqual(exitSplit(17.001, r.exitRule.qtyStep), { tp1Qty: 8.5, trailQty: 8.501 });
});

// ---- B3b: plan.capital phải khớp vốn của bot; mọi giới hạn làm giảm khối lượng đều ghi lý do + rủi ro thực ----
test('B3b kế hoạch lập cho vốn khác vốn của bot -> TỪ CHỐI, yêu cầu lập lại kế hoạch với vốn của bot', () => {
  const r = planOrders(input(mkPlan('long', 'market', false, { capital: 100_000 }), { capital: 50_000 }));
  assert.equal(r.allowed, false);
  assert.equal(r.legs.length, 0);
  assert.match(r.reasons.join('; '), /vốn 100000.*vốn bot là 50000.*lập lại/);
});

// Số tính tay: Long limit 99, SL 97, phí 0,1% khứ hồi; vốn 10.000 -> ngân sách 2% = 200 USDT.
//   perUnit = |99 − 97| + nửa phí ở giá vào 99 + nửa phí ở giá SL 97 = 2 + (99 + 97) × 0,1/200 = 2,098 USDT/coin
//   200 / 2,098 = 95,3289… -> làm tròn xuống bước 0,001 = 95,328 coin
//   tiền lỗ thật = 95,328 × 2,098 = 190,656 + 9,342144 = 199,998144 USDT = 1,99998144% vốn (≤ 2%, sát biên)
test('B3b biên 2% bằng số tính tay: kế hoạch qty lớn -> cắt về 95,328 coin, lý do nêu "trần 2% vốn" và rủi ro thực 2,00%', () => {
  const r = planOrders(input(mkPlan('long', 'limit', false, { qty: 1_000_000, capital: 10_000 })));
  assert.equal(r.allowed, true, r.reasons.join('; '));
  assert.equal(r.sizing!.qty, 95.328);
  assert.ok(Math.abs(r.sizing!.riskAmount - 199.998144) < 1e-6, String(r.sizing!.riskAmount));
  assert.ok(Math.abs(r.sizing!.realRiskPct - 1.99998144) < 1e-6);
  assert.match(r.reasons.join('; '), /trần 2% vốn: kế hoạch 1000000 → 95\.328.*rủi ro thực 2,00%/);
});
// kế hoạch qty 10: 10 × 2,098 = 20,98 USDT = 0,2098% vốn 10.000 -> "0,21%"
test('B3b khối lượng kế hoạch nhỏ hơn trần 2% -> lý do nêu "khối lượng kế hoạch" và rủi ro thực 0,21%', () => {
  const r = planOrders(input(mkPlan('long', 'limit', false, { qty: 10, capital: 10_000 })));
  assert.equal(r.sizing!.qty, 10);
  assert.match(r.reasons.join('; '), /Khối lượng kế hoạch 10 coin.*trần 2% vốn 95\.328.*rủi ro thực 0,21%/);
});
// maxNotional 5.000 USDT: floor(5000 / 99) bước 0,001 = 50,505 coin; rủi ro = 50,505 × 2,098 = 105,95949 USDT = 1,06% vốn
test('B3b trần notional theo thanh khoản làm giảm khối lượng -> lý do nêu giới hạn và rủi ro thực 1,06%', () => {
  const r = planOrders(input(mkPlan('long', 'limit', false, { qty: 1_000_000, capital: 10_000 }), { maxNotional: 5_000 }));
  assert.equal(r.allowed, true, r.reasons.join('; '));
  assert.equal(r.sizing!.qty, 50.505);
  assert.match(r.reasons.join('; '), /trần notional theo thanh khoản 5000/);
  assert.match(r.reasons.join('; '), /rủi ro thực 1,06%/);
});

// ---- Rà soát Task 3 kế hoạch 2, I1: phí theo cỡ lệnh tính lại cho KHỐI LƯỢNG CUỐI (costModel) ----
const BIG_VOL = 1e15; // KL 1 phút rất lớn → trượt theo cỡ ≈ 0

test('I1 costModel: phí kế hoạch phồng (1%) nhưng phí thật ở khối lượng cuối = 0,1% nhóm → planner định cỡ theo phí thật (khối lượng lớn hơn), rủi ro vẫn ≤ 2%', () => {
  const plan = mkPlan('long', 'market', false, { costPct: 1, qty: 100_000 }); // qty kế hoạch lớn: chỉ trần 2% giới hạn
  const old = planOrders(input(plan));
  const fixed = planOrders(input(plan, { costModel: { tierPct: 0.1, quoteVolPerMin: BIG_VOL } }));
  assert.equal(old.allowed, true, old.reasons.join('; '));
  assert.equal(fixed.allowed, true, fixed.reasons.join('; '));
  assert.ok(fixed.sizing!.qty > old.sizing!.qty, `${fixed.sizing!.qty} > ${old.sizing!.qty}`);
  assert.ok(Math.abs(fixed.sizing!.costPct - 0.1) < 1e-6, `phí hiệu dụng ${fixed.sizing!.costPct}`);
  assert.ok(fixed.sizing!.realRiskPct <= 2 + 1e-9);
});

test('I1 costModel: trượt theo cỡ tính trên khối lượng CUỐI — KL 1 phút mỏng thì phí hiệu dụng = nhóm + 0,5% × notional/KL', () => {
  const plan = mkPlan('long', 'market', false, { costPct: 1 });
  const r = planOrders(input(plan, { costModel: { tierPct: 0.1, quoteVolPerMin: 100_000 } }));
  assert.equal(r.allowed, true, r.reasons.join('; '));
  const s = r.sizing!;
  assert.ok(Math.abs(s.costPct - (0.1 + 0.5 * (s.qty * s.worstEntry) / 100_000)) < 1e-9, `${s.costPct}`);
});

test('I1 costModel: luật "TP1 phải bù phí" (dừng sàn hòa vốn) xét lại với phí của khối lượng cuối', () => {
  // TP1 cách giá xấu nhất 0,15%: phí kế hoạch 0,2% → hòa vốn sau phí vượt TP1 → từ chối; phí thật 0,1% → cho vào
  const plan = mkPlan('long', 'market', true, { costPct: 0.2 });
  assert.equal(planOrders(input(plan)).allowed, false);
  assert.match(planOrders(input(plan)).reasons.join(' '), /TP1 chưa bù phí/);
  const r = planOrders(input(plan, { costModel: { tierPct: 0.1, quoteVolPerMin: BIG_VOL } }));
  assert.equal(r.allowed, true, r.reasons.join('; '));
});

// ---- Rà soát lại Task 3 (vòng 2): bản in máy quét định cỡ ĐÚNG như planner (một công thức ở core/sizing.ts) ----
test('Bản in = planner: Short limit kiểu AKE (SL xa, funding chu kỳ 4 giờ, nhóm phí 0,25%) — khối lượng in = khối lượng planner, rủi ro in ≤ 2%', async () => {
  const { buildPlan } = await import('../core/plan.ts');
  const flatBars = Array.from({ length: 60 }, (_, j) => ({ openTime: j, closeTime: j, open: 100, high: 100.5, low: 99.5, close: 100, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 }));
  const zones = [
    { low: 103, high: 104, strength: 3, touches: 1, sources: ['t'] }, // kháng cự đặt SL → limit 102,9, SL 104,3
    { low: 95, high: 96, strength: 2, touches: 1, sources: ['t'] }, // hỗ trợ đặt TP1
  ];
  const costModel = { tierPct: COMMON.costRoundTripPct.high, quoteVolPerMin: 50_000 };
  const fundingBuffer = { maxAbsRate: 0.0015, intervalHours: 4 };
  const plan = buildPlan({
    mode: 'swing', side: 'short', entry: flatBars, markPrice: 100, dailyAtr: 1, capital: 10_000, riskPct: 2, costTier: 'high',
    quoteVolPerMin: costModel.quoteVolPerMin, fundingBuffer, tickSize: 0.001, stepSize: 0.001, fundingRate: 0.0001, fundingIntervalHours: 4, zones,
  });
  assert.equal(plan.valid, true, plan.invalidReason ?? '');
  assert.equal(plan.entryType, 'limit');
  const C3 = { ...C, tickSize: 0.001 };
  const r = planOrders({
    plan, grade: 'A', signal: { id: 'AKE|swing|short|zone|1|104.3', fresh: true }, mode: 'swing', contract: C3, capital: 10_000,
    openTrades: [], openOrderCount: 0, maxNotional: Infinity, markPrice: 100, runId: 'r1', now: NOW, costModel, fundingBuffer,
  });
  assert.equal(r.allowed, true, r.reasons.join('; '));
  assert.equal(plan.qty, r.sizing!.requestedQty, 'khối lượng in phải bằng khối lượng planner');
  assert.equal(plan.fillTable[0]!.qty, r.sizing!.requestedQty);
  assert.ok(plan.estLoss <= 200 + 1e-9, `rủi ro in ${plan.estLoss} USDT > 2% vốn`);
  assert.ok(Math.abs(plan.estLoss - r.sizing!.riskAmount) < 1e-9);
  // R của TP1 in ra có bản sau phí, nhỏ hơn R thô
  const t1 = plan.targets[0]!;
  assert.ok(t1.rNet != null && t1.r !== null && t1.rNet < t1.r, `${t1.rNet} < ${t1.r}`);
});

test('Fail closed (rà soát lại vòng 2): thiếu costModel hoặc đệm funding = 0 → planner từ chối, không định cỡ', () => {
  const plan = mkPlan('long', 'market', false);
  const noCost = planOrders({ ...input(plan), costModel: undefined } as unknown as PlannerInput);
  assert.equal(noCost.allowed, false);
  assert.match(noCost.reasons.join(' '), /costModel/);
  const zeroFunding = planOrders(input(plan, { fundingBuffer: { maxAbsRate: 0, intervalHours: 8 } }));
  assert.equal(zeroFunding.allowed, false);
  assert.match(zeroFunding.reasons.join(' '), /thiếu dữ liệu funding/);
});

test('costModel KL 1 phút = Infinity (trượt theo cỡ = 0) → từ chối, không định cỡ âm thầm thiếu trượt (rà soát lại Task 3 vòng 2)', () => {
  const r = planOrders(input(mkPlan('long', 'market', false), { costModel: { tierPct: 0.1, quoteVolPerMin: Infinity } }));
  assert.equal(r.allowed, false);
  assert.match(r.reasons.join(' | '), /KL 1 phút Infinity không hữu hạn/);
});

// ---- Task 8 #1: sàn chi phí (cost floor) — tùy chọn, mặc định tắt ----
test('#1 sàn chi phí: tắt mặc định; bật → bỏ kế hoạch khi (phí vào + phí ra ở SL + trượt + funding dự kiến) / khoảng SL > maxCostR', async () => {
  const { withConfigOverride } = await import('../core/config-override.ts');
  assert.equal(COMMON.risk.maxCostR, null);
  const plan = mkPlan('long', 'market', false); // giá xấu nhất 100,5, SL 97 → d = 3,5
  const cm = (tierPct: number) => ({ costModel: { tierPct, quoteVolPerMin: BIG_VOL } });
  assert.equal(planOrders(input(plan, cm(1))).allowed, true, 'mặc định không lọc');
  await withConfigOverride({ 'COMMON.risk.maxCostR': 0.1 }, async () => {
    // thiếu funding dự kiến → fail closed
    const miss = planOrders(input(plan, cm(0.25)));
    assert.equal(miss.allowed, false);
    assert.match(miss.reasons.join(' '), /fundingMeanRate/);
    // 0,25%: (100,5 + 97) × 0,125% = 0,247 → 0,0705R ≤ 0,10 → cho vào
    assert.equal(planOrders(input(plan, { ...cm(0.25), fundingMeanRate: 0 })).allowed, true);
    // 1%: 0,9875 / 3,5 = 0,282R > 0,10 → bỏ
    const r = planOrders(input(plan, { ...cm(1), fundingMeanRate: 0 }));
    assert.equal(r.allowed, false);
    assert.match(r.reasons.join(' '), /sàn chi phí.*0,28R/);
    // funding dự kiến Long trả 0,01%/kỳ × 21 kỳ (168 giờ / 8) × 100,5 = 0,211 → tổng 0,131R > 0,10; Short được nhận → không tính
    assert.equal(planOrders(input(plan, { ...cm(0.25), fundingMeanRate: 0.0001 })).allowed, false);
    assert.equal(planOrders(input(mkPlan('short', 'market', false), { ...cm(0.25), fundingMeanRate: 0.0001 })).allowed, true);
  });
});

test('#1 sàn chi phí: lệnh limit vào = maker khi bật tách phí maker/taker (COMMON.fees.makerTakerSplit)', async () => {
  const { withConfigOverride } = await import('../core/config-override.ts');
  const plan = mkPlan('long', 'limit', false); // limit 99, SL 97 → d = 2
  const over = { costModel: { tierPct: 0.25, quoteVolPerMin: BIG_VOL }, fundingMeanRate: 0 };
  await withConfigOverride({ 'COMMON.risk.maxCostR': 0.1 }, async () => {
    // không tách: (99 + 97) × 0,125% = 0,245 → 0,1225R > 0,10
    assert.equal(planOrders(input(plan, over)).allowed, false);
    // tách: 99 × 0,02% + 97 × 0,125% = 0,141 → 0,0705R
    await withConfigOverride({ 'COMMON.fees.makerTakerSplit': true }, async () => {
      assert.equal(planOrders(input(plan, over)).allowed, true);
    });
  });
});

// ---- Task 8 #3: phá vỡ Donchian khi không còn vùng cản phía trước → 100% trailing (tùy chọn, mặc định tắt) ----
const noTp1 = (side: Side) => mkPlan(side, 'market', false, {
  targets: [
    { name: 'TP1', price: null, pct: 50, qty: 0, r: null, reason: 'không có vùng cản mạnh' },
    { name: 'TP2', price: null, pct: 30, qty: 0, r: null, reason: 't' },
    { name: 'TP3', price: null, pct: 20, qty: 0, r: null, reason: 't' },
  ],
  exit: { policy: 'C2', tp1Qty: 0, trailQty: 60, trailing: null }, trailAtr: 3,
});

test('#3 không TP1: mặc định từ chối; bật + đóng 1D phá đỉnh Donchian → chỉ SL + trailing 100% (kích hoạt +1R, callback = trailAtr / giá kích hoạt)', async () => {
  const { withConfigOverride } = await import('../core/config-override.ts');
  assert.match(planOrders(input(noTp1('long'), { breakout: { closeAboveDonchian: true } })).reasons.join(' '), /không có TP1/);
  await withConfigOverride({ 'COMMON.breakout.enabled': true }, async () => {
    const r = planOrders(input(noTp1('long'), { breakout: { closeAboveDonchian: true } }));
    assert.equal(r.allowed, true, r.reasons.join('; '));
    assert.deepEqual(r.legs.map((l) => l.role), ['E1', 'SL', 'TR']);
    const tr = r.legs.find((l) => l.op === 'placeTrailing')!;
    if (tr.op !== 'placeTrailing') return;
    // giá xấu nhất 100,5, SL 97 → 1R = 3,5 → kích hoạt 104; callback 3 / 104 = 2,8846% → làm tròn xuống 2,88
    assert.equal(tr.input.activatePrice, 104);
    assert.equal(tr.input.callbackPct, 2.88);
    assert.equal(tr.input.qty, r.sizing!.qty);
    assert.equal(r.exitRule.tp1Pct, 0);
    const no = planOrders(input(noTp1('long'), { breakout: { closeAboveDonchian: false } }));
    assert.equal(no.allowed, false);
    assert.match(no.reasons.join(' '), /Donchian/);
    assert.equal(planOrders(input(noTp1('short'), { breakout: { closeAboveDonchian: true } })).allowed, false, 'chỉ Long');
  });
});
