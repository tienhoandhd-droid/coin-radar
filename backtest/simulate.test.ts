import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planOrders, type PlannerInput, type PlannerPlan, type PlannerResult } from '../packages/bot/planner.ts';
import { trailingFor } from '../packages/core/exit.ts';
import type { OpenTrade } from '../packages/core/portfolio.ts';
import type { Candle, Contract, Side } from '../packages/core/types.ts';
import {
  createTrade, advanceTrade, forceClose, tradeRecord, portfolioView, createBook, bookFlow, bookClose, isPaused, summarize,
  type SimTrade, type SimCost, type Resolver, type TradeRecord,
} from './simulate.ts';

// ---------- Dữ liệu tay: Long/Short quanh giá 100, vốn 102 000 USDT → 2% = 2 040 USDT; |vào − SL| = 5, phí kế hoạch 0,1% → 5,1/coin → 400 coin ----------
const C: Contract = {
  symbol: 'AAAUSDT', baseAsset: 'AAA', onboardDate: 0, tickSize: 0.01, stepSize: 0.001, minQty: 0.001, maxQty: 1e9,
  marketMinQty: 0.001, marketMaxQty: 1e9, marketStepSize: 0.001, minNotional: 5, maxNumOrders: 200, deliveryDate: 4133894400000,
};
const T0 = Date.UTC(2026, 6, 1); // 01/07/2026 00:00 UTC (trong kỳ D)
const M5 = 5 * 60_000;
const H = 3_600_000;
// Đệm funding cho phép tính tay: chu kỳ 504 giờ = đúng 1 kỳ trong maxHoldHours Swing, 0,01% × giá lớn hơn (Long 100 / Short SL 105)
const FB = { maxAbsRate: 0.0001, intervalHours: 504 };
// Vốn theo chiều để planner cho đúng 400 coin: rủi ro/coin = 5 + (giá vào + SL) × 0,05% (nửa phí ở giá vào, nửa ở giá SL) + đệm funding
//   Long: 5 + 195 × 0,0005 + 0,01 = 5,1075 → 400 × 5,1075 / 2% = 102 150; Short: 5 + 205 × 0,0005 + 0,0105 = 5,113 → 102 260
const CAP = { long: 102_150, short: 102_260 } as const;
const CAPITAL = CAP.long;
const NO_IMPACT: SimCost = { tierPct: 0.1, impactPct: 0.5, vol1m: Infinity }; // mỗi lần khớp trả 0,05% notional, không trượt theo cỡ lệnh

// TP1 = 125 (Long) / 75 (Short); trailAtr 50 → callback thô 40% → kẹp trần sàn 10% (dễ tính tay: dừng = đỉnh × 0,9 / đáy × 1,1)
function plan(side: Side, over: Partial<PlannerPlan> = {}): PlannerPlan {
  const d = side === 'long' ? 1 : -1;
  const stop = 100 - d * 5;
  const tp1 = 100 + d * 25;
  const entryType = over.entryType ?? 'market';
  const limitPrice = over.limitPrice ?? null;
  const maxEntry = over.maxEntry ?? (entryType === 'limit' ? limitPrice! : 100);
  const worst = entryType === 'limit' ? limitPrice! : maxEntry;
  return {
    side, entryType, marketPrice: 100, entry: entryType === 'limit' ? limitPrice! : 100, maxEntry, stop, limitPrice, cancelIfTp1First: true,
    targets: [
      { name: 'TP1', price: tp1, pct: 50, qty: 0, r: 5, reason: 't' },
      { name: 'TP2', price: null, pct: 30, qty: 0, r: null, reason: 't' },
      { name: 'TP3', price: null, pct: 20, qty: 0, r: null, reason: 't' },
    ],
    exit: { policy: 'C2', tp1Qty: 0, trailQty: 0, trailing: trailingFor(side, worst, tp1, 50, 0.1) },
    valid: true, invalidReason: null, qty: 10_000, costPct: 0.1, suggestedLeverage: 5,
    limitExpiryHours: entryType === 'market' ? null : 24, riskPct: 2, capital: CAP[side],
    ...over,
  };
}

function planned(p: PlannerPlan, over: Partial<PlannerInput> = {}): PlannerResult {
  const r = planOrders({
    plan: p, grade: 'A', signal: { id: `AAAUSDT|swing|${p.side}|zone|1|${p.stop}`, fresh: true }, mode: 'swing', contract: C, capital: p.capital,
    openTrades: [], openOrderCount: 0, maxNotional: Infinity, markPrice: 100, runId: 'sim', now: T0, costModel: { tierPct: p.costPct, quoteVolPerMin: 1e30 }, fundingBuffer: FB, ...over,
  });
  assert.ok(r.allowed, `planner từ chối: ${r.reasons.join('; ')}`);
  return r;
}

function trade(p: PlannerPlan, opts: { cost?: SimCost; policy?: 'C2' | 'A0'; over?: Partial<PlannerInput> } = {}): SimTrade {
  return createTrade({
    id: 't1', symbol: C.symbol, mode: 'swing', policy: opts.policy ?? 'C2', placedAt: T0, equityAtEntry: p.capital, contract: C,
    plan: p, planner: planned(p, opts.over), cost: opts.cost ?? NO_IMPACT, pathInterval: '5m',
    meta: { grade: 'A', label: 'Đạt', kind: 'zone', score: 85, signalId: 'sig', key: 'k', afterTp1: null },
  });
}

// Nến 5m liên tiếp từ T0: [open, high, low, close]
const bars = (rows: Array<[number, number, number, number]>, start = T0, iv = M5): Candle[] => rows.map(([o, h, l, c], i) => ({
  openTime: start + i * iv, closeTime: start + (i + 1) * iv - 1, open: o, high: h, low: l, close: c, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5,
}));

async function run(tr: SimTrade, series: Candle[], o: { resolve?: Resolver; funding?: Array<{ fundingTime: number; fundingRate: number; markPrice: number }> } = {}): Promise<TradeRecord> {
  await advanceTrade(tr, series, Infinity, { funding: o.funding ?? [], resolve: o.resolve ?? null });
  return tradeRecord(tr);
}

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

test('planner (dùng lại) cho đúng 400 coin cả Long lẫn Short — nền cho các phép tính tay', () => {
  for (const s of ['long', 'short'] as const) {
    const r = planned(plan(s));
    assert.equal(r.sizing!.qty, 400);
    const tr = r.legs.find((l) => l.op === 'placeTrailing')!;
    assert.equal(tr.op === 'placeTrailing' && tr.input.callbackPct, 10);
  }
});

test('Long chạm SL: lỗ = 400 × 5 + phí 0,05% hai chiều = −2 039 USDT = −1,999% vốn ≈ −1R', async () => {
  const r = await run(trade(plan('long')), bars([[100, 100.5, 99.5, 100], [99.8, 99.9, 94, 94.5]]));
  assert.equal(r.reason, 'stop_loss');
  close(r.avgEntry!, 100);
  close(r.gross, -2000);
  close(r.costs, 400 * 100 * 0.0005 + 400 * 95 * 0.0005); // 20 + 19
  close(r.pnl, -2039);
  close(r.pctEquity, (-2039 / CAPITAL) * 100);
  close(r.R, -1); // 1R = q × (|giá xấu nhất − SL| + nửa phí ở giá vào + nửa phí ở giá SL) = 400 × 5,0975 = 2 039 — chạm SL đủ = −1R
  assert.equal(r.flags.gap, false);
  close(r.maeR!, (94 - 100) / 5); // giá xấu nhất 94 trong nến chạm SL
});

test('Short chạm SL đối xứng: lỗ −2 041 USDT (phí chiều ra tính trên 105)', async () => {
  const r = await run(trade(plan('short')), bars([[100, 100.5, 99.5, 100], [100.2, 106, 100.1, 105.5]]));
  assert.equal(r.reason, 'stop_loss');
  close(r.gross, -2000);
  close(r.pnl, -2000 - 20 - 400 * 105 * 0.0005);
  close(r.R, -1); // 1R = 400 × 5,1025 = 2 041
});

test('Long: TP1 50% tại 125 rồi trailing 10% từ đỉnh 130 → thoát 117 (trên hòa vốn)', async () => {
  const r = await run(trade(plan('long')), bars([
    [100, 101, 99.5, 100.5], // khớp IOC 100
    [100.5, 118, 100.4, 117],
    [118, 126, 117, 125.5], // TP1 125; đỉnh 126 → mức trailing 113,4 < đáy 117: không mơ hồ
    [125, 130, 124, 128], // đỉnh 130 → mức 117
    [125, 126, 116, 116.5], // chạm 117 → thoát 200 coin
  ]));
  assert.equal(r.reason, 'trailing');
  assert.deepEqual(r.exits.map((x) => [x.role, x.qty, x.price]), [['TP1', 200, 125], ['TR', 200, 117]]);
  close(r.gross, 200 * 25 + 200 * 17);
  close(r.costs, 20 + 200 * 125 * 0.0005 + 200 * 117 * 0.0005);
  close(r.pnl, 8400 - 44.2);
  assert.ok(r.pnl > 0);
  assert.equal(r.flags.unresolvedBars, 0);
});

test('Short: TP1 tại 75 rồi trailing 10% từ đáy 70 → thoát 77', async () => {
  const r = await run(trade(plan('short')), bars([
    [100, 100.5, 99, 99.5],
    [99.5, 99.6, 82, 83],
    [80, 81, 74, 75], // TP1 75; đáy 74 → mức 81,4 > đỉnh 81
    [76, 76.5, 70, 71], // đáy 70 → mức 77 > đỉnh 76,5
    [72, 78, 71.5, 77.5], // chạm 77
  ]));
  assert.equal(r.reason, 'trailing');
  assert.deepEqual(r.exits.map((x) => [x.role, x.qty, x.price]), [['TP1', 200, 75], ['TR', 200, 77]]);
  close(r.gross, 200 * 25 + 200 * 23);
  close(r.pnl, 9600 - (20 + 200 * 75 * 0.0005 + 200 * 77 * 0.0005));
});

test('Gap xuyên SL: Long mở cửa 92 (trên giá thanh lý 90) → khớp 92, lỗ −3 238,4 USDT = −3,18% vốn (VƯỢT trần 2% — được đo và gắn cờ)', async () => {
  const r = await run(trade(plan('long')), bars([[100, 100.5, 99.5, 100], [92, 93, 91, 92.5]]));
  assert.equal(r.reason, 'stop_loss');
  assert.equal(r.flags.gap, true);
  close(r.exits[0]!.price, 92);
  close(r.pnl, -3200 - 20 - 400 * 92 * 0.0005);
  assert.ok(r.pctEquity < -2);
});

test('Nến 5m chạm cả SL lẫn TP1: phân xử bằng 1m — SL trước', async () => {
  const sub = bars([[100, 100.2, 99.5, 99.8], [99.8, 99.9, 94, 95], [95, 126, 95, 125]], T0 + M5, 60_000);
  const resolve: Resolver = async (_s, bar) => (bar.openTime === T0 + M5 ? sub : null);
  const r = await run(trade(plan('long')), bars([[100, 100.5, 99.5, 100], [100, 126, 94, 120]]), { resolve });
  assert.equal(r.reason, 'stop_loss');
  assert.equal(r.flags.resolvedBars, 1);
  assert.equal(r.flags.unresolvedBars, 0);
  close(r.gross, -2000);
});

test('Nến 5m chạm cả SL lẫn TP1: phân xử bằng 1m — TP1 trước rồi trailing', async () => {
  const sub = bars([[100, 100.5, 99.5, 100], [100, 126, 115, 125], [125, 125.5, 94, 95]], T0 + M5, 60_000);
  const resolve: Resolver = async () => sub;
  const r = await run(trade(plan('long')), bars([[100, 100.5, 99.5, 100], [100, 126, 94, 120]]), { resolve });
  assert.deepEqual(r.exits.map((x) => [x.role, x.qty, x.price]), [['TP1', 200, 125], ['TR', 200, 113.4]]); // 126 × 0,9
  assert.equal(r.flags.resolvedBars, 1);
});

test('Nến mơ hồ KHÔNG phân xử được (thiếu 1m) → tính SL trước và đếm', async () => {
  const r = await run(trade(plan('long')), bars([[100, 100.5, 99.5, 100], [100, 126, 94, 120]]), { resolve: async () => null });
  assert.equal(r.reason, 'stop_loss');
  assert.equal(r.flags.unresolvedBars, 1);
  close(r.gross, -2000);
});

test('Funding đúng dấu: tỉ lệ +0,01% → Long trả 400 × 100 × 0,0001 = 4, Short nhận 4; tỉ lệ âm đảo dấu', async () => {
  const flat = bars([[100, 100.5, 99.5, 100], [100, 100.5, 99.5, 100], [100, 100.5, 99.5, 100]]);
  const fundingTime = T0 + 2 * M5 + 3; // sàn ghi lệch vài ms → làm tròn phút
  for (const [side, rate, want] of [['long', 0.0001, -4], ['short', 0.0001, 4], ['long', -0.0001, 4], ['short', -0.0001, -4]] as const) {
    const tr = trade(plan(side));
    await advanceTrade(tr, flat, Infinity, { funding: [{ fundingTime, fundingRate: rate, markPrice: 100 }], resolve: null });
    forceClose(tr, T0 + 3 * M5, 100, 'period_end');
    const r = tradeRecord(tr);
    close(r.funding, want);
    assert.equal(r.reason, 'period_end');
  }
});

test('Funding trước lúc khớp lệnh không tính', async () => {
  const tr = trade(plan('long'));
  await advanceTrade(tr, bars([[100, 100.5, 99.5, 100], [100, 100.5, 99.5, 100]]), Infinity, { funding: [{ fundingTime: T0, fundingRate: 0.01, markPrice: 100 }], resolve: null });
  forceClose(tr, T0 + 2 * M5, 100, 'period_end');
  close(tradeRecord(tr).funding, 0);
});

test('IOC khớp một phần: trượt biên tuyến tính — giá trần 100,2, mở cửa 100, khối lượng 1 phút 50 000 USDT → khớp 200 coin giá TB 100,1', async () => {
  // biên trượt tại notional N = 0,5% × N / 50 000 → chạm trần 0,2% khi N = 20 000 USDT = 200 coin; trượt TB = nửa biên = 0,1%
  const p = plan('long', { maxEntry: 100.2, suggestedLeverage: 4 }); // 5× thì thanh lý quá gần SL ở giá 100,2
  const tr = trade(p, { cost: { tierPct: 0.1, impactPct: 0.5, vol1m: 50_000 } });
  await advanceTrade(tr, bars([[100, 100.5, 99.5, 100]]), Infinity, { funding: [], resolve: null });
  forceClose(tr, T0 + M5, 100, 'period_end');
  const r = tradeRecord(tr);
  assert.equal(r.flags.iocPartial, true);
  assert.equal(r.qty, 200);
  close(r.avgEntry!, 100.1);
  assert.ok(r.legs[0]!.qty > 200, 'khối lượng đặt lớn hơn phần khớp');
});

test('IOC không khớp khi giá mở cửa đã vượt giá trần → không có lệnh', async () => {
  const r = await run(trade(plan('long')), bars([[100.3, 100.5, 100.2, 100.4]]));
  assert.equal(r.reason, 'ioc_nofill');
  assert.equal(r.qty, 0);
  close(r.pnl, 0);
});

test('Limit không bao giờ khớp: hết hạn sau 24 giờ → không có lệnh', async () => {
  const p = plan('long', { entryType: 'limit', limitPrice: 98 });
  const series = bars(Array.from({ length: 30 }, () => [99, 99.5, 98.5, 99] as [number, number, number, number]), T0, H);
  const r = await run(trade(p), series);
  assert.equal(r.reason, 'limit_unfilled');
  assert.equal(r.legs[0]!.status, 'expired');
  assert.equal(r.qty, 0);
});

test('Limit khớp khi giá chạm (low ≤ limit) — rồi chạm SL cùng nến: khớp trước, SL sau', async () => {
  const p = plan('long', { entryType: 'limit', limitPrice: 98 });
  const r = await run(trade(p), bars([[99, 99.5, 98.5, 99], [99, 99.2, 94, 94.5]]));
  close(r.avgEntry!, 98);
  assert.equal(r.reason, 'stop_loss');
  assert.equal(r.flags.unresolvedBars, 0);
});

test('Limit bị hủy khi giá chạm TP1 trước', async () => {
  const p = plan('long', { entryType: 'limit', limitPrice: 98 });
  const r = await run(trade(p), bars([[99, 99.5, 98.5, 99], [99, 125.5, 98.6, 125]]));
  assert.equal(r.reason, 'limit_unfilled');
  assert.equal(r.legs[0]!.status, 'cancelled');
});

test('Dừng theo thời gian: Swing chưa đạt +1R sau 168 giờ → đóng ở giá mở nến kế tiếp', async () => {
  const rows = Array.from({ length: 172 }, (_, i) => [i === 169 ? 100.2 : 100, 101, 99, 100] as [number, number, number, number]);
  const r = await run(trade(plan('long')), bars(rows, T0, H));
  assert.equal(r.reason, 'time_stop');
  assert.equal(r.exitTime, new Date(T0 + 168 * H).toISOString());
  close(r.gross, 0); // nến 168 mở cửa 100
});

test('Dừng theo thời gian không áp dụng khi đã đạt +1R (đỉnh ≥ 105)', async () => {
  const rows = Array.from({ length: 172 }, (_, i) => [100, i === 3 ? 106 : 101, 99, 100] as [number, number, number, number]);
  const tr = trade(plan('long'));
  await advanceTrade(tr, bars(rows, T0, H), Infinity, { funding: [], resolve: null });
  assert.equal(tradeRecord(tr).reason, null); // vẫn mở
});

test('Trần danh mục: 10 lệnh còn rủi ro → planner (dùng lại) từ chối; lệnh đã qua TP1 không tính', () => {
  const open: OpenTrade[] = Array.from({ length: 10 }, (_, i) => ({ symbol: `X${i}USDT`, side: 'long', notional: 100, leverage: 5, riskAmount: 10, pastTp1: false }));
  const r = planOrders({ plan: plan('long'), grade: 'A', signal: { id: 's', fresh: true }, mode: 'swing', contract: C, capital: CAPITAL, openTrades: open, openOrderCount: 0, maxNotional: Infinity, markPrice: 100, runId: 'sim', now: T0, costModel: { tierPct: 0.1, quoteVolPerMin: 1e30 }, fundingBuffer: FB });
  assert.equal(r.allowed, false);
  assert.match(r.reasons.join(' '), /trần 10 lệnh/);
  const r2 = planOrders({ plan: plan('long'), grade: 'A', signal: { id: 's', fresh: true }, mode: 'swing', contract: C, capital: CAPITAL, openTrades: open.map((o, i) => ({ ...o, pastTp1: i < 3 })), openOrderCount: 0, maxNotional: Infinity, markPrice: 100, runId: 'sim', now: T0, costModel: { tierPct: 0.1, quoteVolPerMin: 1e30 }, fundingBuffer: FB });
  assert.equal(r2.allowed, true);
});

test('portfolioView: lệnh chờ khớp và lệnh đang mở đều chiếm rủi ro; qua TP1 → pastTp1', async () => {
  const a = trade(plan('long'));
  const b = trade(plan('long', { entryType: 'limit', limitPrice: 98 }));
  await advanceTrade(a, bars([[100, 100.5, 99.5, 100]]), Infinity, { funding: [], resolve: null });
  const v = portfolioView([a, b]);
  assert.equal(v.length, 2);
  close(v[0]!.riskAmount, 400 * 5.1075); // cùng công thức định cỡ của planner (gồm đệm funding)
  assert.equal(v[0]!.pastTp1, false);
  assert.ok(v[1]!.riskAmount > 0, 'lệnh limit chờ khớp vẫn giữ chỗ rủi ro');
  await advanceTrade(a, bars([[118, 126, 117, 125.5]], T0 + M5), Infinity, { funding: [], resolve: null });
  assert.equal(portfolioView([a])[0]!.pastTp1, true);
});

test('Cầu chì: 5 lệnh thua trong 24 giờ → dừng vào lệnh mới N giờ (mặc định 24), đếm số lần', () => {
  const b = createBook({ capital: 10_000, lossesMax: 5, lossesWindowHours: 24, pauseHours: 24, dailyLossPct: 10, ddAlertPct: 30 });
  for (let i = 0; i < 4; i++) { bookFlow(b, T0 + i * H, -10); bookClose(b, T0 + i * H, -10); }
  assert.equal(isPaused(b, T0 + 4 * H), false);
  bookFlow(b, T0 + 5 * H, -10);
  bookClose(b, T0 + 5 * H, -10);
  assert.equal(isPaused(b, T0 + 5 * H + 1), true);
  assert.equal(isPaused(b, T0 + 29 * H), false);
  assert.equal(b.trips.losses, 1);
});

test('Cầu chì: lỗ thua cách nhau > 24 giờ không tính dồn', () => {
  const b = createBook({ capital: 10_000, lossesMax: 5, lossesWindowHours: 24, pauseHours: 24, dailyLossPct: 10, ddAlertPct: 30 });
  for (let i = 0; i < 5; i++) bookClose(b, T0 + i * 7 * H, -10);
  assert.equal(b.trips.losses, 0);
});

test('Cầu chì: lỗ trong ngày > 10% → dừng; sụt 30% từ đỉnh → chỉ cảnh báo (đếm)', () => {
  const b = createBook({ capital: 10_000, lossesMax: 5, lossesWindowHours: 24, pauseHours: 24, dailyLossPct: 10, ddAlertPct: 30 });
  bookFlow(b, T0 + H, -999); // −9,99%
  assert.equal(b.trips.daily, 0);
  bookFlow(b, T0 + 2 * H, -2); // −10,01%
  assert.equal(b.trips.daily, 1);
  assert.equal(isPaused(b, T0 + 3 * H), true);
  bookFlow(b, T0 + 30 * H, -2100); // ngày mới; tổng sụt từ đỉnh 10 000 → 6 899 = 31%
  assert.equal(b.ddAlerts, 1);
  close(b.maxDdPct, 31.01);
});

test('summarize: kỳ vọng R, profit factor, chuỗi thua, vi phạm trần 2%, tách Long/Short', () => {
  const rec = (side: Side, R: number, pnl: number, pct: number): TradeRecord => ({ side, R, pnl, pctEquity: pct, filled: true } as unknown as TradeRecord);
  const s = summarize([rec('long', 2, 200, 2), rec('long', -1, -100, -1), rec('short', -1.2, -120, -2.3), rec('short', -1, -100, -1), rec('long', 3, 300, 3)], { capital: 1000, equity: 1180, maxDdPct: 5 });
  assert.equal(s.all.trades, 5);
  close(s.all.expectancyR, (2 - 1 - 1.2 - 1 + 3) / 5);
  close(s.all.profitFactor, 500 / 320);
  assert.equal(s.all.longestLosingStreak, 3);
  assert.equal(s.all.breaches2pct.count, 1);
  close(s.all.breaches2pct.worstPct!, -2.3);
  assert.equal(s.long.trades, 3);
  assert.equal(s.short.trades, 2);
  close(s.totalReturnPct, 18);
});

test('A0 (đối chứng): TP1 50% tại 125, sau TP1 SL về giá khớp thật 100 → 30% + 20% còn lại thoát ở 100', async () => {
  // TP2/TP3 không có giá → trailing 3×ATR (trailAtr 1000 = rất xa, để chỉ SL hòa vốn tác động)
  const p = { ...plan('long'), trailAtr: 1000 } as PlannerPlan;
  const r = await run(trade(p, { policy: 'A0' }), bars([[100, 101, 99.5, 100.5], [118, 126, 117, 125.5], [120, 121, 99, 99.5]]));
  assert.deepEqual(r.exits.map((x) => [x.role, x.qty, x.price]), [['TP1', 200, 125], ['A1', 200, 100]]); // SL sau TP1 là MỘT lệnh closePosition cho cả 30% + 20%
  assert.equal(r.reason, 'after_tp1_stop');
  close(r.gross, 200 * 25);
});

test('A0: phần không có giá TP theo trailing ATR từ đỉnh (126 − 10 = 116)', async () => {
  const p = { ...plan('long'), trailAtr: 10 } as PlannerPlan;
  const r = await run(trade(p, { policy: 'A0' }), bars([[100, 101, 99.5, 100.5], [118, 126, 117, 125.5], [120, 121, 110, 111]]));
  assert.deepEqual(r.exits.map((x) => [x.role, x.qty, x.price]), [['TP1', 200, 125], ['TRA', 120, 116], ['TRA', 80, 116]]);
  assert.equal(r.reason, 'trailing');
});

test('SL là MỘT lệnh closePosition: trượt theo cỡ tính trên cả 400 coin (không phải 2 × 200)', async () => {
  // KL 1 phút 400 000 USDT; đóng 400 coin ở 95 = 38 000 USDT → trượt TB = 0,5% × 38 000 / 400 000 / 2 = 0,02375% → giá 94,9774375
  const r = await run(trade(plan('long'), { cost: { tierPct: 0.1, impactPct: 0.5, vol1m: 400_000 } }), bars([[99.9, 100.5, 99.5, 100], [99.8, 99.9, 94, 94.5]]));
  assert.equal(r.exits.length, 1);
  assert.deepEqual([r.exits[0]!.role, r.exits[0]!.qty], ['SL', 400]);
  close(r.exits[0]!.price, 95 * (1 - 0.005 * 38_000 / 400_000 / 2));
});

// ---- Ràng buộc cứng người dùng: lỗ thật mỗi lệnh ≤ 2% vốn (rà soát Task 3, mục i) ----
test('≤ 2%: Short SL cao hơn giá vào 8,2% (ca AKEUSDT) — phí chiều ra tính ở giá SL → chạm SL đủ vẫn ≤ 2% vốn', async () => {
  const cost: SimCost = { tierPct: 1, impactPct: 0.5, vol1m: 2_000_000 }; // nhóm thanh khoản thấp 1% khứ hồi + trượt theo cỡ
  // vào bằng limit đúng giá xấu nhất 100 (không có phần giá tốt hơn che phí chiều ra)
  const p = { ...plan('short', { entryType: 'limit', limitPrice: 100 }), stop: 108.2, costPct: 1, capital: 100_000, suggestedLeverage: 3,
    targets: [{ name: 'TP1' as const, price: 75, pct: 50, qty: 0, r: 3, reason: 't' }, { name: 'TP2' as const, price: null, pct: 30, qty: 0, r: null, reason: 't' }, { name: 'TP3' as const, price: null, pct: 20, qty: 0, r: null, reason: 't' }] };
  const tr = createTrade({
    id: 'ake', symbol: C.symbol, mode: 'swing', policy: 'C2', placedAt: T0, equityAtEntry: 100_000, contract: C, plan: p, cost, pathInterval: '5m',
    planner: planned(p, { capital: 100_000, costModel: { tierPct: 1, quoteVolPerMin: 2_000_000 }, fundingBuffer: { maxAbsRate: 1e-9, intervalHours: 504 } }),
    meta: { grade: 'A', label: 'Đạt', kind: 'zone', score: 85, signalId: 'sig', key: 'k', afterTp1: null },
  });
  const r = await run(tr, bars([[99.9, 100.2, 99.5, 100], [100.2, 108.5, 100.1, 108.3]]));
  assert.equal(r.reason, 'stop_loss');
  assert.equal(r.avgEntry, 100);
  assert.ok(r.pctEquity >= -2 - 1e-9, `lỗ ${r.pctEquity}%`);
  assert.ok(r.pctEquity < -1.95, `định cỡ vẫn dùng gần hết 2%: ${r.pctEquity}%`);
});

test('≤ 2%: Long trả funding nhiều kỳ trước khi chạm SL (ca FFUSDT) — đệm funding trong định cỡ → ≤ 2% vốn', async () => {
  const p = { ...plan('long'), capital: 100_000 };
  const fb = { maxAbsRate: 0.0005, intervalHours: 8 }; // Swing giữ dự kiến 168 giờ → 21 kỳ × 0,05%
  const tr = createTrade({
    id: 'ff', symbol: C.symbol, mode: 'swing', policy: 'C2', placedAt: T0, equityAtEntry: 100_000, contract: C, plan: p, cost: NO_IMPACT, pathInterval: '1h',
    planner: planned(p, { capital: 100_000, fundingBuffer: fb }),
    meta: { grade: 'A', label: 'Đạt', kind: 'zone', score: 85, signalId: 'sig', key: 'k', afterTp1: null },
  });
  // 10 kỳ funding +0,05% (Long trả) rồi chạm SL
  const rows = Array.from({ length: 81 }, (_, i) => [100, 100.5, 99.5, 100] as [number, number, number, number]);
  rows.push([99.8, 99.9, 94, 94.5]);
  const funding = Array.from({ length: 10 }, (_, j) => ({ fundingTime: T0 + (j + 1) * 8 * H, fundingRate: 0.0005, markPrice: 100 }));
  const r = await run(tr, bars(rows, T0, H), { funding });
  assert.equal(r.reason, 'stop_loss');
  assert.ok(r.funding < 0);
  assert.ok(r.pctEquity >= -2 - 1e-9, `lỗ ${r.pctEquity}%`);
});

test('R: chạm SL đủ với trượt theo cỡ (KL mỏng) vẫn ≈ −1R — 1R gồm trượt hai chiều của khối lượng cuối', async () => {
  const cost: SimCost = { tierPct: 0.1, impactPct: 0.5, vol1m: 400_000 };
  const p = { ...plan('long', { entryType: 'limit', limitPrice: 100 }) };
  const tr = createTrade({
    id: 'r1', symbol: C.symbol, mode: 'swing', policy: 'C2', placedAt: T0, equityAtEntry: p.capital, contract: C, plan: p, cost, pathInterval: '5m',
    planner: planned(p, { costModel: { tierPct: 0.1, quoteVolPerMin: 400_000 } }),
    meta: { grade: 'A', label: 'Đạt', kind: 'zone', score: 85, signalId: 'sig', key: 'k', afterTp1: null },
  });
  const r = await run(tr, bars([[100.5, 101, 99.9, 100.2], [99.8, 99.9, 94, 94.5]]));
  assert.equal(r.reason, 'stop_loss');
  // limit khớp đúng giá xấu nhất 100 nhưng KHÔNG trượt chiều vào (lệnh chờ) trong khi 1R có dự trù trượt hai chiều → lỗ hơi dưới 1R
  assert.ok(r.R >= -1 - 1e-9 && r.R < -0.99, `R ${r.R}`);
  assert.ok(r.pctEquity >= -2 - 1e-9);
});

// ---- Rà soát Task 3, các mục nhỏ ----
test('M5: nến khớp limit giữa chừng — đỉnh của nến (có thể trước lúc khớp) KHÔNG tính vào đỉnh có lợi / MFE', async () => {
  const p = plan('long', { entryType: 'limit', limitPrice: 98 });
  const tr = trade(p);
  await advanceTrade(tr, bars([[99, 104, 97.9, 98.5]]), Infinity, { funding: [], resolve: null });
  forceClose(tr, T0 + M5, 98.5, 'period_end');
  const r = tradeRecord(tr);
  close(r.avgEntry!, 98);
  close(r.mfeR!, 0); // đỉnh có lợi = giá khớp 98 (không lấy đỉnh 104 của nến khớp)
});

test('M3: limit khớp khi low = đúng giá limit (ràng buộc toàn cục "low ≤ limit") — ghi nhận là giả định lạc quan về hàng chờ', async () => {
  const p = plan('long', { entryType: 'limit', limitPrice: 98 });
  const tr = trade(p);
  await advanceTrade(tr, bars([[99, 99.5, 98, 98.5]]), Infinity, { funding: [], resolve: null });
  assert.equal(tradeRecord(tr).legs[0]!.status, 'filled');
});

test('M7 trailing: một nến 5m vừa lập đỉnh mới vừa rút về dưới mức trailing mới → mơ hồ; 1m cho thấy đỉnh trước → thoát ở đỉnh × 0,9', async () => {
  // sau TP1 (đỉnh 126, mức 113,4), nến 5m: lên 140 rồi xuống 120 → mức mới 126 nằm trong nến
  const sub = bars([[128, 140, 128, 139], [139, 139.5, 120, 121]], T0 + 3 * M5, 60_000);
  const resolve: Resolver = async (_s, bar) => (bar.openTime === T0 + 3 * M5 ? sub : null);
  const r = await run(trade(plan('long')), bars([[100, 101, 99.5, 100.5], [100.5, 118, 100.4, 117], [118, 126, 117, 125.5], [128, 140, 120, 121]]), { resolve });
  assert.deepEqual(r.exits.map((x) => [x.role, x.qty, x.price]), [['TP1', 200, 125], ['TR', 200, 126]]);
  assert.equal(r.flags.resolvedBars, 1);
});

test('M7 trailing không phân xử được → đếm riêng loại "trailing"', async () => {
  const r = await run(trade(plan('long')), bars([[100, 101, 99.5, 100.5], [100.5, 118, 100.4, 117], [118, 126, 117, 125.5], [128, 140, 120, 121]]), { resolve: async () => null });
  assert.equal(r.flags.unresolvedBars, 1);
  assert.equal(r.flags.unresolvedTrailing, 1);
});

test('M7 split: chân IOC khớp ngay, chân limit khớp sau → vị thế = tổng, TP1/trailing chia lại theo khối lượng đã khớp', async () => {
  const p = plan('long', { entryType: 'split', limitPrice: 99, maxEntry: 100 });
  const tr = trade(p);
  const legs = tr.s.legs;
  assert.deepEqual(legs.map((l) => [l.role, l.ioc]), [['E1', true], ['E2', false]]);
  await advanceTrade(tr, bars([[100, 100.5, 99.5, 100], [99.8, 100, 98.8, 99.2]]), Infinity, { funding: [], resolve: null });
  const r = tradeRecord(tr);
  assert.deepEqual(r.legs.map((l) => [l.role, l.status, l.fillPrice]), [['E1', 'filled', 100], ['E2', 'filled', 99]]);
  close(r.qty, legs[0]!.qty + legs[1]!.qty);
  const parts = tr.s.parts.map((x) => [x.name, x.qty]);
  assert.equal(parts.length, 2);
  close((parts[0]![1] as number) + (parts[1]![1] as number), r.qty);
});

test('M7 thanh lý: gap qua cả SL lẫn giá thanh lý → thanh lý isolated (mất ký quỹ), gắn cờ', async () => {
  // Long 400 coin giá 100, đòn bẩy 5× → MMR bậc 25–100k = 10% → thanh lý ≈ 100 × (1 − 0,2 + 0,1) = 90; mở cửa 70
  const r = await run(trade(plan('long')), bars([[100, 100.5, 99.5, 100], [70, 71, 69, 70.5]]));
  assert.equal(r.reason, 'liquidation');
  assert.equal(r.flags.liquidation, true);
  close(r.gross, -400 * 20); // isolated: mất đúng ký quỹ 400 × 100 / 5 = 8 000 (giá phá sản 80), không phải 400 × 30
});

test('F1: chốt chặn funding khi chạy — đệm theo thời gian giữ dự kiến, funding thật vượt đệm → siết SL, lỗ thật ≤ 2% vốn lúc vào', async () => {
  const { withConfigOverride } = await import('../packages/core/config-override.ts');
  const p = { ...plan('long'), capital: 100_000 };
  const fb = { maxAbsRate: 0.0005, intervalHours: 8 };
  const mk = () => createTrade({
    id: 'g', symbol: C.symbol, mode: 'swing', policy: 'C2', placedAt: T0, equityAtEntry: 100_000, contract: C, plan: p, cost: NO_IMPACT, pathInterval: '1h',
    planner: planned(p, { capital: 100_000, fundingBuffer: fb }),
    meta: { grade: 'A', label: 'Đạt', kind: 'zone', score: 85, signalId: 'sig', key: 'k', afterTp1: null },
  });
  // Nến đầu chạm +1R (105,5 — dừng theo thời gian không áp dụng), rồi 30 kỳ +0,1% (gấp đôi mức đệm, nhiều hơn 21 kỳ dự kiến),
  // rồi gap xuống 94 (chạm SL 95)
  const rows = Array.from({ length: 241 }, (_, i) => [100, i === 0 ? 105.5 : 100.5, 99.5, 100] as [number, number, number, number]);
  rows.push([99.8, 99.9, 94, 94.5]);
  const funding = Array.from({ length: 30 }, (_, j) => ({ fundingTime: T0 + (j + 1) * 8 * H, fundingRate: 0.001, markPrice: 100 }));
  const off = await withConfigOverride({ 'COMMON.risk.fundingBufferHorizon': 'expected' }, () => run(mk(), bars(rows, T0, H), { funding }));
  assert.ok(off.pctEquity < -2, `không có chốt chặn: lỗ ${off.pctEquity}% vượt 2%`);
  const on = await withConfigOverride({ 'COMMON.risk.fundingBufferHorizon': 'expected', 'COMMON.risk.fundingRuntimeGuard': true },
    () => run(mk(), bars(rows, T0, H), { funding }));
  assert.ok(on.pctEquity >= -2 - 1e-9, `có chốt chặn: lỗ ${on.pctEquity}%`);
  assert.ok(on.flags.fundingGuardTightened > 0);
});

test('#1 tách phí maker/taker (tùy chọn): lệnh LIMIT vào trả phí maker 0,02% (không trượt); chiều ra giữ nửa phí nhóm', async () => {
  const { withConfigOverride } = await import('../packages/core/config-override.ts');
  const p = plan('long', { entryType: 'limit', limitPrice: 100 });
  const go = async () => {
    const tr = trade(p);
    await advanceTrade(tr, bars([[100.5, 101, 99.9, 100.2]]), Infinity, { funding: [], resolve: null });
    return tr.b.costs / (tr.b.maxPosQty * 100);
  };
  close(await go(), 0.0005); // mặc định: nửa phí nhóm 0,1%
  close(await withConfigOverride({ 'COMMON.fees.makerTakerSplit': true }, go), 0.0002);
});
