import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyLogReturns, correlation, betaTo, clusterCheck, clusterSymbols, type ClusterConfig } from './risk-cluster.ts';
import type { OpenTrade } from './portfolio.ts';
import type { Candle } from './types.ts';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 5, 1);
// Chuỗi 1D từ lợi suất log cho trước (nến đầu giá 100)
const fromRets = (rets: number[], start = T0): Candle[] => {
  let p = 100;
  const out: Candle[] = [{ openTime: start, closeTime: start + DAY - 1, open: p, high: p, low: p, close: p, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 }];
  rets.forEach((r, i) => {
    p *= Math.exp(r);
    const o = start + (i + 1) * DAY;
    out.push({ openTime: o, closeTime: o + DAY - 1, open: p, high: p, low: p, close: p, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 });
  });
  return out;
};
// lợi suất BTC giả: dao động tất định
const btcR = Array.from({ length: 70 }, (_, i) => 0.02 * Math.sin(i * 1.3) + 0.005 * Math.cos(i * 0.7));
const noise = Array.from({ length: 70 }, (_, i) => 0.02 * Math.sin(i * 2.9 + 1) * Math.cos(i * 0.31));
const cfg: ClusterConfig = { corrDays: 30, corrMax: 0.7, betaDays: 60, betaFloor: 0.5, maxBetaRiskPct: 10 };
const open = (symbol: string, side: 'long' | 'short', riskAmount: number, pastTp1 = false): OpenTrade => ({ symbol, side, notional: 1000, leverage: 2, riskAmount, pastTp1 });

test('lợi suất log theo ngày; tương quan/beta trên N ngày chung gần nhất; chưa đủ N ngày → null', () => {
  const btc = dailyLogReturns(fromRets(btcR));
  assert.equal(btc.size, 70);
  const twice = dailyLogReturns(fromRets(btcR.map((r) => 2 * r)));
  assert.ok(Math.abs(betaTo(twice, btc, 60)! - 2) < 1e-9, 'beta của 2×BTC = 2');
  assert.ok(Math.abs(correlation(twice, btc, 30)! - 1) < 1e-9);
  assert.ok(Math.abs(correlation(dailyLogReturns(fromRets(btcR.map((r) => -r))), btc, 30)! + 1) < 1e-9);
  const young = dailyLogReturns(fromRets(btcR.slice(0, 20), T0 + 50 * DAY)); // chỉ 20 ngày chung
  assert.equal(correlation(young, btc, 30), null);
  assert.equal(betaTo(young, btc, 60), null);
});

test('một lệnh mỗi cụm: tương quan 30 ngày ≥ 0,7 với lệnh đang mở CÙNG phía → từ chối; khác phía hoặc tương quan thấp → cho', () => {
  const daily = new Map<string, Candle[]>([
    ['BTCUSDT', fromRets(btcR)], ['AAA', fromRets(btcR.map((r) => 1.5 * r))], ['BBB', fromRets(btcR.map((r) => 1.2 * r + 0.1 * noise[0]!))],
    ['CCC', fromRets(noise)],
  ]);
  const same = clusterCheck({ symbol: 'BBB', side: 'long', open: [open('AAA', 'long', 100)], capital: 10_000, daily, cfg });
  assert.equal(same.allowed, false);
  assert.match(same.reasons[0]!, /tương quan 30 ngày với AAA .* ≥ 0,70 — một lệnh mỗi cụm/);
  assert.equal(clusterCheck({ symbol: 'BBB', side: 'long', open: [open('AAA', 'short', 100)], capital: 10_000, daily, cfg }).allowed, true);
  assert.equal(clusterCheck({ symbol: 'CCC', side: 'long', open: [open('AAA', 'long', 100)], capital: 10_000, daily, cfg }).allowed, true);
});

test('trần rủi ro có trọng số beta: Σ max(β, 0,5) × rủi ro ≤ 10% vốn → rủi ro tối đa của lệnh mới; lệnh qua TP1 tính 0', () => {
  const daily = new Map<string, Candle[]>([
    ['BTCUSDT', fromRets(btcR)], ['HI', fromRets(btcR.map((r) => 2 * r))], ['LO', fromRets(btcR.map((r) => 0.1 * r))], ['NEW', fromRets(noise)],
  ]);
  // HI β = 2: 400 USDT rủi ro → 800 có trọng số; NEW β ≈ 0 → sàn 0,5; trần 1000 → còn 200 → rủi ro tối đa 400
  const r = clusterCheck({ symbol: 'NEW', side: 'short', open: [open('HI', 'long', 400)], capital: 10_000, daily, cfg });
  assert.equal(r.allowed, true);
  if (r.allowed) {
    assert.ok(Math.abs(r.weight - 0.5) < 1e-12);
    assert.ok(Math.abs(r.maxRisk - 400) < 1e-6, String(r.maxRisk));
  }
  // LO β = 0,1 → sàn 0,5 (không nới dưới sàn); BTC tự nó β = 1
  const lo = clusterCheck({ symbol: 'BTCUSDT', side: 'short', open: [open('LO', 'long', 1000)], capital: 10_000, daily, cfg });
  assert.ok(lo.allowed && Math.abs(lo.maxRisk - 500) < 1e-6);
  // đã kín trần → từ chối; lệnh đã qua TP1 không tính
  const full = clusterCheck({ symbol: 'NEW', side: 'short', open: [open('HI', 'long', 500)], capital: 10_000, daily, cfg });
  assert.equal(full.allowed, false);
  assert.match(full.reasons[0]!, /≥ trần 10%/);
  assert.equal(clusterCheck({ symbol: 'NEW', side: 'short', open: [open('HI', 'long', 500, true)], capital: 10_000, daily, cfg }).allowed, true);
});

test('thiếu nến 1D (mã mới, mã đang mở, BTC) → từ chối có lý do (fail closed); clusterSymbols gồm mã mới, BTC, mã đang mở', () => {
  const daily = new Map<string, Candle[]>([['BTCUSDT', fromRets(btcR)], ['AAA', fromRets(btcR)], ['YOUNG', fromRets(btcR.slice(0, 40), T0 + 30 * DAY)]]);
  const young = clusterCheck({ symbol: 'YOUNG', side: 'long', open: [], capital: 10_000, daily, cfg });
  assert.equal(young.allowed, false);
  assert.match(young.reasons[0]!, /thiếu 60 ngày lợi suất để đo beta của YOUNG/);
  const noOpenData = clusterCheck({ symbol: 'AAA', side: 'long', open: [open('ZZZ', 'short', 10)], capital: 10_000, daily, cfg });
  assert.equal(noOpenData.allowed, false);
  assert.match(noOpenData.reasons[0]!, /lệnh đang mở ZZZ/);
  assert.deepEqual(clusterSymbols('AAA', [open('ZZZ', 'long', 1), open('AAA', 'long', 1)]), ['AAA', 'BTCUSDT', 'ZZZ']);
});

test('mặc định (người dùng chốt 20/10/2026, lần thử #21): risk-cluster BẬT với tham số đăng ký trước + minListingDays 30', async () => {
  const { COMMON } = await import('./config.ts');
  assert.deepEqual(COMMON.portfolio.cluster, { corrDays: 30, corrMax: 0.7, betaDays: 60, betaFloor: 0.5, maxBetaRiskPct: 10 });
  assert.equal(COMMON.entryRules.minListingDays, 30);
});
