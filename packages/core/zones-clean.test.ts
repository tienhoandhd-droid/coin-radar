import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCleanZones, breakStatus, hvnZones, countBounces, keepNearest } from './zones-clean.ts';
import { strengthLabel, zoneRole, describeZoneSr, type Zone } from './zones.ts';
import { pivotHighs, pivotLows, atr, last } from './indicators.ts';
import { COMMON } from './config.ts';
import type { Candle } from './types.ts';

const H4 = 4 * 3_600_000;
const T0 = Date.UTC(2026, 6, 1);

// Nến 4H thứ i từ dãy giá đóng: open = giá đóng trước, high/low = close ± 1
function bars(closes: number[], vol = 0, t0 = T0): Candle[] {
  return closes.map((close, i) => {
    const open = i === 0 ? close : closes[i - 1]!;
    return { openTime: t0 + i * H4, closeTime: t0 + (i + 1) * H4 - 1, open, high: Math.max(open, close) + 1, low: Math.min(open, close) - 1, close,
      volume: vol, quoteVolume: vol, takerBuyQuote: vol / 2 };
  });
}
// Nến tự do (giá tùy ý) để kiểm từng bước
function bar(i: number, o: { open?: number; high: number; low: number; close: number; vol?: number }): Candle {
  const v = o.vol ?? 0;
  return { openTime: T0 + i * H4, closeTime: T0 + (i + 1) * H4 - 1, open: o.open ?? o.close, high: o.high, low: o.low, close: o.close,
    volume: v, quoteVolume: v, takerBuyQuote: v / 2 };
}
const nowAfter = (c: Candle[]) => c[c.length - 1]!.closeTime + 1;
const vShape = (m: number, step: number) => Array.from({ length: 2 * m + 1 }, (_, i) => 100 + Math.abs(i - m) * step);
const clean = (entry: Candle[], extra: Partial<Parameters<typeof findCleanZones>[0]> = {}) => findCleanZones({
  entry, trend: [], entryInterval: '4h', trendInterval: '1d', price: entry[entry.length - 1]!.close, now: nowAfter(entry), ...extra,
});

test('pivot: mặc định (cách cũ) hai đỉnh bằng nhau không được nhận; allowEqual = true thì cả hai đều là pivot', () => {
  const highs = [1, 2, 3, 5, 5, 3, 2, 1];
  assert.deepEqual(pivotHighs(highs, 3), []);
  assert.deepEqual(pivotHighs(highs, 3, true), [3, 4]);
  const lows = highs.map((x) => -x);
  assert.deepEqual(pivotLows(lows, 3), []);
  assert.deepEqual(pivotLows(lows, 3, true), [3, 4]);
});

test('vùng 1 pivot không còn rộng 0: nới đều quanh pivot tới 0,25×ATR khung của nó', () => {
  const entry = bars(vShape(20, 2));
  const zs = clean(entry);
  assert.equal(zs.length, 1, JSON.stringify(zs));
  const z = zs[0]!;
  const a = last(atr(entry, 14));
  assert.ok(Math.abs(z.high - z.low - 0.25 * a) < 1e-9, `rộng ${z.high - z.low}, ATR ${a}`);
  assert.ok(Math.abs((z.low + z.high) / 2 - 99) < 1e-9, 'tâm vùng = đáy pivot 99');
  // nến đáy và nến ngay sau có cùng low 99 → hai đáy bằng nhau, cả hai là pivot (allowEqual)
  assert.deepEqual(z.sources, ['đáy 4H ×2']);
  assert.equal(z.touches, 2);
});

test('vùng 1D gom và nới bằng ATR của khung 1D (không dùng ATR 4H)', () => {
  const D = 86_400_000;
  const closes = vShape(20, 10); // biên độ ngày lớn hơn 4H
  const trend = closes.map((close, i) => ({ ...bars(closes)[i]!, openTime: T0 - 60 * D + i * D, closeTime: T0 - 60 * D + (i + 1) * D - 1 }));
  const entry = bars(Array.from({ length: 30 }, (_, i) => 400 + (i % 2))); // 4H đi ngang xa vùng 1D
  const zs = findCleanZones({ entry, trend, entryInterval: '4h', trendInterval: '1d', price: 400.5, now: nowAfter(entry) });
  const z = zs.find((x) => x.sources.some((s) => s.includes('1D')))!;
  assert.ok(z, JSON.stringify(zs));
  const a1d = last(atr(trend, 14));
  assert.ok(Math.abs(z.high - z.low - 0.25 * a1d) < 1e-9, `rộng ${z.high - z.low}, ATR 1D ${a1d}`);
});

test('bỏ vùng cũ: pivot 4H mới nhất cũ hơn 60 ngày → bỏ', () => {
  const entry = bars(vShape(20, 2));
  const late = nowAfter(entry) + 61 * 86_400_000;
  assert.equal(clean(entry, { now: late }).length, 0);
  assert.equal(clean(entry, { now: nowAfter(entry) + 30 * 86_400_000 }).length, 1);
});

test('breakStatus: còn nguyên / bị phá (đóng dưới mép dưới − 0,5×ATR) / lật vai trò khi kiểm lại từ phía mới', () => {
  const atrs = new Array<number>(10).fill(1);
  const mk = (xs: Array<[number, number, number]>) => xs.map(([high, low, close], i) => bar(i, { high, low, close }));
  // vùng [100, 101]; nến 0 là pivot (bỏ qua)
  const intact = mk([[101, 100, 100.5], [103, 101.5, 102], [102, 100.2, 101.5], [104, 102, 103]]);
  assert.equal(breakStatus(intact, atrs, 100, 101, 0), 'intact');
  // đóng 99,6 chưa đủ sâu (ngưỡng 99,5) → chưa phá
  const shallow = mk([[101, 100, 100.5], [103, 101.5, 102], [100.5, 99.4, 99.6], [103, 101.5, 102]]);
  assert.equal(breakStatus(shallow, atrs, 100, 101, 0), 'intact');
  const broken = mk([[101, 100, 100.5], [103, 101.5, 102], [100, 98.5, 99], [99, 97, 98], [98, 96, 97]]);
  assert.equal(breakStatus(broken, atrs, 100, 101, 0), 'broken');
  // sau khi phá: nến chạm lại mép dưới (high 100,2 ≥ 100) nhưng đóng 99,8 < 100 → hỗ trợ cũ thành kháng cự
  const flipped = mk([[101, 100, 100.5], [103, 101.5, 102], [100, 98.5, 99], [99, 97, 98], [100.2, 98, 99.8], [99, 96, 97]]);
  assert.equal(breakStatus(flipped, atrs, 100, 101, 0), 'flipped');
  // quay lại nhưng đóng TRONG vùng → không phải kiểm lại, vẫn bị phá
  const noRetest = mk([[101, 100, 100.5], [103, 101.5, 102], [100, 98.5, 99], [100.8, 99, 100.4]]);
  assert.equal(breakStatus(noRetest, atrs, 100, 101, 0), 'broken');
  // kháng cự bị phá lên rồi kiểm lại từ trên (đối xứng)
  const up = mk([[101, 100, 100.5], [99.5, 98, 99], [102.5, 100.5, 102], [102.5, 100.8, 101.4], [103, 101.5, 102.5]]);
  assert.equal(breakStatus(up, atrs, 100, 101, 0), 'flipped');
});

test('findCleanZones: hỗ trợ bị phá không kiểm lại → bỏ; bị phá rồi kiểm lại → giữ, ghi "đã lật vai trò", thành kháng cự', () => {
  const down = [130, 126, 122, 118, 114, 110, 106, 102, 106, 110, 114, 118];
  const brokenOnly = bars([...down, 114, 110, 106, 102, 98, 94, 90, 86, 82, 78, 74, 70]);
  const zs = clean(brokenOnly);
  assert.ok(!zs.some((z) => z.low <= 101 && 101 <= z.high), `vùng 101 phải bị bỏ: ${JSON.stringify(zs)}`);
  assert.ok(zs.some((z) => z.low <= 119 && 119 <= z.high), 'đỉnh 119 vẫn còn (chưa bị phá)');

  // phá ở nến đóng 94, nến kế tiếp chạm lại mép dưới (high 101) và đóng 100 < mép dưới → lật vai trò (nến này không phải pivot)
  const retest = bars([...down, 110, 102, 94, 100, 95, 92, 88, 84, 80, 76, 72]);
  const zr = clean(retest);
  const z = zr.find((x) => x.low <= 101 && 101 <= x.high)!;
  assert.ok(z, JSON.stringify(zr));
  assert.ok(z.sources.includes('đã lật vai trò'), z.sources.join(', '));
  assert.equal(zoneRole(z, 72), 'Kháng cự');
});

test('HVN: khối lượng rải đều trên [low, high]; ô cực đại cục bộ ≥ 1,5 × trung vị thành vùng; nến cũ hơn 60 ngày bị bỏ', () => {
  const c: Candle[] = [
    ...Array.from({ length: 30 }, (_, i) => bar(100 + i, { high: 110, low: 100, close: 105, vol: 1 })),
    ...Array.from({ length: 10 }, (_, i) => bar(130 + i, { high: 121, low: 120, close: 120.5, vol: 10 })),
  ];
  const old = bar(-400, { high: 201, low: 200, close: 200.5, vol: 1e6 }); // 400 nến 4H ≈ 67 ngày trước → ngoài cửa sổ 60 ngày
  const now = nowAfter(c);
  const zs = hvnZones([old, ...c], 4, now); // ô rộng 0,25 × 4 = 1
  assert.ok(zs.some((z) => Math.abs(z.low - 120) < 1e-9 && Math.abs(z.high - 121) < 1e-9), JSON.stringify(zs));
  assert.ok(!zs.some((z) => z.high > 121), 'nến cũ 200 không vào hồ sơ');
  assert.ok(!zs.some((z) => z.low >= 110 && z.high <= 120), 'không có HVN trong khoảng trống 110–120');
  assert.deepEqual(hvnZones(c.map((k) => ({ ...k, quoteVolume: 0 })), 4, now), [], 'không có khối lượng → không có HVN');
});

test('đếm lần bật: chạm rồi đi ≥ 1×ATR trước khi đóng xuyên vùng; đóng xuyên trước → không tính; cả hai phía', () => {
  const atrs = new Array<number>(20).fill(1);
  const c = [
    bar(0, { high: 106, low: 104, close: 105 }),
    bar(1, { high: 103, low: 100.5, close: 102 }), // chạm từ trên
    bar(2, { high: 102.5, low: 101.5, close: 102.2 }), // lên tới 101 + 1 → BẬT #1
    bar(3, { high: 104, low: 102, close: 103 }),
    bar(4, { high: 103, low: 100.8, close: 101.5 }), // chạm từ trên
    bar(5, { high: 101.6, low: 98.5, close: 99 }), // đóng dưới 100 trước → không bật
    bar(6, { high: 99, low: 97, close: 98 }),
    bar(7, { high: 100.2, low: 98.5, close: 99.5 }), // chạm từ dưới
    bar(8, { high: 99.6, low: 98.9, close: 99.2 }), // xuống tới 100 − 1 → BẬT #2 (kháng cự)
    bar(9, { high: 99.5, low: 98.5, close: 99 }),
  ];
  assert.equal(countBounces(c, atrs, 100, 101), 2);
  // lần chạm chưa ngã ngũ tới nến cuối → không tính
  assert.equal(countBounces(c.slice(0, 2), atrs, 100, 101), 0);
});

test('độ mạnh = số lần bật + 1 khi có HVN (hợp lưu), không phụ thuộc độ rộng', () => {
  // chữ V có khối lượng dồn ở đáy → vùng pivot đáy chồng HVN
  const closes = vShape(20, 2);
  const entry = bars(closes).map((k) => ({ ...k, quoteVolume: Math.abs(k.close - 100) < 5 ? 100 : 1, takerBuyQuote: 0 }));
  const zs = clean(entry);
  const z = zs.find((x) => x.low <= 99 && 99 <= x.high)!;
  assert.ok(z.sources.includes('hvn'), z.sources.join(', '));
  const bounces = countBounces(entry, atr(entry, 14), z.low, z.high);
  assert.equal(z.strength, bounces + 1);
});

test('nhãn: Hỗ trợ / Kháng cự theo giá; Yếu ≤ 1, Trung bình = 2, Mạnh ≥ 3', () => {
  const z: Zone = { low: 10, high: 11, strength: 2, touches: 1, sources: ['đáy 4H ×1'] };
  assert.equal(zoneRole(z, 12), 'Hỗ trợ');
  assert.equal(zoneRole(z, 9), 'Kháng cự');
  assert.equal(zoneRole(z, 10.5), 'Vùng chứa giá');
  assert.deepEqual([0, 1, 2, 3, 5].map(strengthLabel), ['Yếu', 'Yếu', 'Trung bình', 'Mạnh', 'Mạnh']);
  assert.equal(describeZoneSr(z, 12, 0.01), 'Hỗ trợ 10,00–11,00 (Trung bình, độ mạnh 2; đáy 4H ×1)');
});

test('giữ tối đa 3 vùng gần giá nhất mỗi phía + vùng chứa giá', () => {
  const zs = [1, 3, 5, 7, 9, 20, 30, 40, 50, 60].map((p) => ({ low: p, high: p + 0.5 }));
  const contain = { low: 14.5, high: 15.5 };
  const kept = keepNearest([...zs, contain], 15, COMMON.zones.clean.maxPerSide);
  assert.deepEqual(kept.map((z) => z.low), [5, 7, 9, 14.5, 20, 30, 40]);
});

test('không nhìn trước: nến chưa đóng / nến tương lai (closeTime ≥ now) không làm đổi vùng', () => {
  const entry = bars(vShape(20, 2), 1);
  const now = nowAfter(entry);
  const base = clean(entry, { now });
  // thêm một cú sập tương lai xuyên mọi vùng + nến đang chạy
  const future = bars([60, 40, 20, 10], 1e6, now);
  const running = { ...bars([50], 1e6, now - H4 + 1)[0]!, closeTime: now + 1000 };
  const withFuture = clean([...entry, running, ...future], { now, price: entry[entry.length - 1]!.close });
  assert.deepEqual(withFuture, base);
  assert.ok(base.length > 0);
});

test('mặc định giữ cách cũ: method = legacy, srConfirm = false', () => {
  assert.equal(COMMON.zones.method, 'legacy');
  assert.equal(COMMON.entryRules.srConfirm, false);
});

test('hợp đồng mới: chưa đủ 14 nến 4H đã đóng để có ATR → không có vùng (không ném lỗi); đủ nến nhưng ATR = 0 vẫn báo lỗi', () => {
  const few = bars(vShape(4, 2)); // 9 nến
  assert.deepEqual(clean(few), []);
  // 13 nến đã đóng + 1 nến chưa đóng → vẫn thiếu
  const closed13 = bars(vShape(6, 2));
  const running = { ...bars([150], 0, nowAfter(closed13) - H4 + 1)[0]!, closeTime: nowAfter(closed13) + 1000 };
  assert.deepEqual(clean([...closed13, running], { now: nowAfter(closed13) }), []);
  const dead = Array.from({ length: 20 }, (_, i) => bar(i, { high: 100, low: 100, close: 100 }));
  assert.throws(() => clean(dead), /ATR khung vào lệnh không hợp lệ/);
});
