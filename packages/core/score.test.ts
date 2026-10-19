import { test } from 'node:test';
import assert from 'node:assert/strict';
import { takerImbalance, meanImbalance, volumeZ } from './flow.ts';
import { scoreSide, type ScoreInput } from './score.ts';
import type { Candle } from './types.ts';

function k(close: number, takerShare = 0.5, volume = 100): Candle {
  return { openTime: 0, closeTime: 0, open: close, high: close * 1.005, low: close * 0.995, close,
    volume, quoteVolume: volume, takerBuyQuote: volume * takerShare };
}
const rising = (n: number, step: number, takerShare = 0.5) => Array.from({ length: n }, (_, i) => k(100 + i * step, takerShare));
const falling = (n: number, step: number, takerShare = 0.5) => Array.from({ length: n }, (_, i) => k(100 + n * step - i * step, takerShare));

test('takerImbalance tính tay: q=100, tq=60 → 0,2', () => {
  assert.equal(Math.round(takerImbalance(k(1, 0.6)) * 1e9) / 1e9, 0.2);
});
test('meanImbalance bỏ nến gần nhất khi skip > 0', () => {
  const c = [k(1, 0.6), k(1, 0.6), k(1, 0.0)];
  assert.equal(Math.round(meanImbalance(c, 2, 1) * 1e9) / 1e9, 0.2);
});
test('volumeZ: nến cuối khối lượng vọt lên → z lớn', () => {
  const c = [...Array.from({ length: 20 }, (_, i) => k(1, 0.5, 100 + (i % 3))), k(1, 0.5, 400)];
  assert.ok(volumeZ(c, 20) > 5);
});

function input(trend: Candle[], entry: Candle[], btc: Candle[]): ScoreInput {
  return { mode: 'swing', trend, entry, btcTrend: btc, liquid: true, nearestLevels: { above: null, below: null } };
}

test('coin tăng mạnh hơn BTC, taker mua áp đảo → Long ≥ 70 và cao hơn Short', () => {
  const inp = input(rising(300, 1), rising(500, 0.2, 0.6), rising(300, 0.3));
  const longS = scoreSide(inp, 'long', 5);
  const shortS = scoreSide(inp, 'short', 5);
  assert.ok(longS.score >= 70, `long=${longS.score}`);
  assert.ok(longS.score > shortS.score);
  assert.ok(longS.reasons.every((r) => /^S-0[123]$/.test(r.code)));
});

test('đối xứng: coin giảm mạnh hơn BTC, taker bán áp đảo → Short ≥ 70', () => {
  const inp = input(falling(300, 1), falling(500, 0.2, 0.4), falling(300, 0.3));
  assert.ok(scoreSide(inp, 'short', 5).score >= 70);
});

test('coin thanh khoản thấp: không tính sức mạnh tương đối, độ phủ < 1', () => {
  const inp = { ...input(rising(300, 1), rising(500, 0.2, 0.6), rising(300, 0.3)), liquid: false };
  const s = scoreSide(inp, 'long', 5);
  assert.ok(s.coverage < 1);
});

test('kháng cự nằm trước chốt lời 1 → điểm Đường đi thấp hơn', () => {
  const base = input(rising(300, 1), rising(500, 0.2, 0.6), rising(300, 0.3));
  const price = base.entry[base.entry.length - 1]!.close;
  const free = scoreSide(base, 'long', 5);
  const blocked = scoreSide({ ...base, nearestLevels: { above: price + 1, below: null } }, 'long', 5);
  assert.ok(blocked.score < free.score);
});

test('thiếu toàn bộ dữ liệu (mảng rỗng) + có vùng cản → điểm 0, không NaN, độ phủ < 70%', () => {
  const inp = { ...input([], [], []), nearestLevels: { above: 150, below: null } };
  const s = scoreSide(inp, 'long', 5);
  assert.equal(s.score, 0);
  assert.ok(Number.isFinite(s.score));
  assert.ok(s.coverage < 0.7);
});

test('chỉ còn S-03 khả dụng (dữ liệu quá ngắn) → điểm 0 và có lý do độ phủ', () => {
  const short = rising(10, 1);
  const inp = { ...input(short, rising(10, 0.2, 0.6), short), nearestLevels: { above: 1000, below: null } };
  const s = scoreSide(inp, 'long', 5);
  assert.equal(s.score, 0);
  assert.ok(s.coverage < 0.7);
  assert.ok(s.reasons.some((r) => r.code === 'S-01' && /Độ phủ dữ liệu \d+% < 70% — không chấm điểm/.test(r.text)));
});
