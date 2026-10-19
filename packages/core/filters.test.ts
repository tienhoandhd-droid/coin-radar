import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entryLegProblems, exitPartProblems, zonePlanFilterProblems, invalidateZonePlan, type OrderFilters } from './filters.ts';
import { buildPlan } from './plan.ts';
import type { Zone } from './zones.ts';
import type { Candle } from './types.ts';

// Bộ lọc kiểu BTCUSDT thật (exchangeInfo 19/10/2026): LOT_SIZE 0,001–1000, MARKET_LOT_SIZE 0,001–120, MIN_NOTIONAL 50
const F: OrderFilters = { stepSize: 0.001, minQty: 0.001, maxQty: 1000, marketMinQty: 0.001, marketMaxQty: 120, marketStepSize: 0.001, minNotional: 50, maxNumOrders: 200 };

test('I2 lệnh vào market vượt MARKET_LOT_SIZE.maxQty → lỗi (-4005); cùng khối lượng lệnh limit thì qua LOT_SIZE', () => {
  assert.match(entryLegProblems({ kind: 'market', price: 100, qty: 130 }, F).join(), /MARKET_LOT_SIZE.*120/);
  assert.deepEqual(entryLegProblems({ kind: 'limit', price: 100, qty: 130 }, F), []);
  assert.match(entryLegProblems({ kind: 'limit', price: 100, qty: 1001 }, F).join(), /LOT_SIZE.*1000/);
});

test('I2 lệnh vào dưới MIN_NOTIONAL hoặc dưới minQty hoặc lệch bước → lỗi', () => {
  assert.match(entryLegProblems({ kind: 'market', price: 100, qty: 0.4 }, F).join(), /MIN_NOTIONAL.*50/);
  assert.deepEqual(entryLegProblems({ kind: 'market', price: 100, qty: 0.5 }, F), []); // đúng 50 USDT là đủ
  assert.match(entryLegProblems({ kind: 'limit', price: 1e6, qty: 0.0005 }, F).join(), /minQty/);
  assert.match(entryLegProblems({ kind: 'market', price: 1e5, qty: 0.0015 }, F).join(), /bước/);
});

test('I2 phần chốt lời/trailing (reduce-only): miễn MIN_NOTIONAL nhưng vẫn phải ≥ minQty và ≤ MARKET_LOT_SIZE.maxQty', () => {
  assert.deepEqual(exitPartProblems([0.01, 0.01], F), []); // 0,01 × 100 = 1 USDT < 50 nhưng reduce-only được miễn
  const g = { ...F, minQty: 0.01, marketMinQty: 0.01 };
  assert.match(exitPartProblems([0.01, 0.005], g).join(), /minQty/);
  assert.match(exitPartProblems([10, 121], F).join(), /MARKET_LOT_SIZE/);
});

const k = (i: number, c: number): Candle => ({ openTime: i, closeTime: i, open: c, high: c + 0.5, low: c - 0.5, close: c, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 });
const flat = (p: number) => Array.from({ length: 60 }, (_, i) => k(i, p));
const zone = (low: number, high: number, strength = 2): Zone => ({ low, high, strength, touches: 1, sources: ['test'] });
const plan = () => buildPlan({ mode: 'swing', side: 'long', entry: flat(96.3), markPrice: 96.3, dailyAtr: 1, capital: 1000, riskPct: 0.5, costTier: 'high',
  tickSize: 0.001, stepSize: 0.001, quoteVolPerMin: Infinity, fundingBuffer: { maxAbsRate: 0, intervalHours: 8 }, fundingRate: 0.0001, fundingIntervalHours: 8,
  zones: [zone(95, 96, 3), zone(99, 100), zone(102, 103), zone(106, 107)] });

test('I2 kế hoạch vùng hợp lệ với bộ lọc thật → không có vấn đề; vi phạm → nêu lý do, đánh dấu không hợp lệ, bỏ trailing', () => {
  const p = plan();
  assert.equal(p.valid, true);
  assert.deepEqual(zonePlanFilterProblems(p, F), []);
  // ngân sách 5 USDT → khoảng 262 USDT notional; MIN_NOTIONAL 300 → không vào được
  const probs = zonePlanFilterProblems(p, { ...F, minNotional: 300 });
  assert.ok(probs.length > 0);
  assert.match(probs[0]!, /MIN_NOTIONAL/);
  const bad = invalidateZonePlan(p, probs[0]!);
  assert.equal(bad.valid, false);
  assert.match(bad.invalidReason!, /MIN_NOTIONAL/);
  assert.equal(bad.exit.trailing, null);
  assert.equal(p.valid, true, 'không sửa kế hoạch gốc');
  // khối lượng ~2,7 coin > trần market 2 → không hợp lệ
  assert.match(zonePlanFilterProblems(p, { ...F, marketMaxQty: 2 }).join(), /MARKET_LOT_SIZE/);
  // TP1 ~1,36 coin < minQty 1,5 → không hợp lệ
  assert.match(zonePlanFilterProblems(p, { ...F, minQty: 1.5, marketMinQty: 1.5 }).join(), /minQty/);
  // số lệnh cần (vào + SL + TP1 + trailing = 4) vượt MAX_NUM_ORDERS 3
  assert.match(zonePlanFilterProblems(p, { ...F, maxNumOrders: 3 }).join(), /MAX_NUM_ORDERS/);
});
