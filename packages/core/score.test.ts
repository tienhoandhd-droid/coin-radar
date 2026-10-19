import { test } from 'node:test';
import assert from 'node:assert/strict';
import { takerImbalance, meanImbalance, volumeZ } from './flow.ts';
import { scoreSide, type ScoreInput } from './score.ts';
import { CONFIG } from './config.ts';
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
  return { mode: 'swing', trend, entry, btcTrend: btc, liquid: true };
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
  const free = scoreSide(base, 'long', null);
  const blocked = scoreSide(base, 'long', 1);
  assert.ok(blocked.score < free.score);
});

test('S-03: TP1 = 1R → 0 điểm, 1,5R → nửa điểm, ≥ 2R hoặc không có vùng cản → đủ điểm', () => {
  const base = input(rising(300, 1), rising(500, 0.2, 0.6), rising(300, 0.3));
  const full = CONFIG.swing.weights.path;
  const pts = (r: number | null) => scoreSide(base, 'long', r).reasons.find((x) => x.code === 'S-03')!.points;
  assert.equal(pts(1), 0);
  assert.equal(pts(0.5), 0);
  assert.equal(pts(1.5), full / 2);
  assert.equal(pts(2), full);
  assert.equal(pts(3), full);
  assert.equal(pts(null), full);
});

test('S-03: lý do ghi TP1 bao nhiêu R và vùng cản nào', () => {
  const base = input(rising(300, 1), rising(500, 0.2, 0.6), rising(300, 0.3));
  const r = scoreSide(base, 'long', 1.5, 'trước vùng cản 120–121').reasons.find((x) => x.code === 'S-03')!;
  assert.match(r.text, /1,5R/);
  assert.match(r.text, /vùng cản 120–121/);
  const none = scoreSide(base, 'long', null).reasons.find((x) => x.code === 'S-03')!;
  assert.match(none.text, /Không có vùng cản/);
});

test('thiếu toàn bộ dữ liệu (mảng rỗng) + có vùng cản → điểm 0, không NaN, độ phủ < 70%', () => {
  const inp = input([], [], []);
  const s = scoreSide(inp, 'long', 1.5);
  assert.equal(s.score, 0);
  assert.ok(Number.isFinite(s.score));
  assert.ok(s.coverage < 0.7);
});

test('chỉ còn S-03 khả dụng (dữ liệu quá ngắn) → điểm 0 và có lý do độ phủ', () => {
  const short = rising(10, 1);
  const inp = input(short, rising(10, 0.2, 0.6), short);
  const s = scoreSide(inp, 'long', 5);
  assert.equal(s.score, 0);
  assert.ok(s.coverage < 0.7);
  assert.ok(s.reasons.some((r) => r.code === 'S-01' && /Độ phủ dữ liệu \d+% < 70% — không chấm điểm/.test(r.text)));
});

test('rsZ: coin mạnh hơn BTC → z dương, coin yếu hơn → z âm, cùng một z cho cả hai chiều', () => {
  const strong = input(rising(300, 1), rising(500, 0.2), rising(300, 0.1));
  const l = scoreSide(strong, 'long', 5);
  const s = scoreSide(strong, 'short', 5);
  assert.ok(l.rsZ !== null && l.rsZ > 0, String(l.rsZ));
  assert.equal(l.rsZ, s.rsZ);
  const weak = input(falling(300, 1), rising(500, 0.2), rising(300, 0.1));
  assert.ok((scoreSide(weak, 'long', 5).rsZ ?? 0) < 0);
});

test('rsZ = null khi coin kém thanh khoản (không đo RS)', () => {
  const inp = { ...input(rising(300, 1), rising(500, 0.2), rising(300, 0.1)), liquid: false };
  assert.equal(scoreSide(inp, 'long', 5).rsZ, null);
});

test('S-03: TP1 bị chặn (kế hoạch không hợp lệ) → 0 điểm và ghi lý do của kế hoạch, không ghi "không có vùng cản"', () => {
  const base = input(rising(300, 1), rising(500, 0.2, 0.6), rising(300, 0.3));
  const why = 'Kháng cự ngay sát trên giá vào 120–121 — không có chỗ đặt TP1';
  const r = scoreSide(base, 'long', null, undefined, why).reasons.find((x) => x.code === 'S-03')!;
  assert.equal(r.points, 0);
  assert.match(r.text, /không có chỗ đặt TP1/);
  assert.doesNotMatch(r.text, /Không có vùng cản/);
});
