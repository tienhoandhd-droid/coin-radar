import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectMultiMonth, multiMonthStatus, coilAt, contextFlags } from './context.ts';
import { swingPivots } from './pivots.ts';
import { atr } from '../indicators.ts';
import { COMMON } from '../config.ts';
import type { Candle } from '../types.ts';

function k(high: number, low: number, close = (high + low) / 2): Candle {
  return { openTime: 0, closeTime: 0, open: close, high, low, close, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 };
}
const A = (n: number, v: number) => new Array<number>(n).fill(v);
function wave(pts: [number, number][]): Candle[] {
  const out: Candle[] = [];
  for (let s = 0; s < pts.length - 1; s++) {
    const [i0, p0] = pts[s]!;
    const [i1, p1] = pts[s + 1]!;
    for (let i = i0; i < i1; i++) {
      const cl = p0 + ((p1 - p0) * (i - i0)) / (i1 - i0);
      out.push(k(cl + 0.5, cl - 0.5, cl));
    }
  }
  const [, pl] = pts[pts.length - 1]!;
  out.push(k(pl + 0.5, pl - 0.5, pl));
  return out;
}

// Vùng 100..120 (đóng) → biên 99,5..120,5; đáy 10/50/90, đỉnh 30/70/110, đáy cuối 130 làm đỉnh 110 chắc chắn.
const RANGE: [number, number][] = [[0, 110], [10, 100], [30, 120], [50, 100], [70, 120], [90, 100], [110, 120], [130, 100], [140, 105]];
const mm = (pts: [number, number][], a = 2) => {
  const c = wave(pts);
  const av = A(c.length, a);
  return { c, av, r: detectMultiMonth(c, swingPivots(c, av, 0.75), av, '1d') };
};

test('vùng nhiều tháng: ≥3 chạm mỗi biên, ≥60 nến, pivot cuối đã chắc chắn', () => {
  const { r } = mm(RANGE);
  assert.equal(r.length >= 1, true);
  const g = r[r.length - 1]!;
  assert.equal(g.kind, 'multi_month_range');
  assert.equal(g.endIndex, 110); // đỉnh 110 (đáy 130 đứng sau nên đỉnh chắc chắn); đáy 130 là pivot cuối nên chưa phát
  assert.equal(g.upper(110), 120.5);
  assert.equal(g.lower(110), 99.5);
  assert.ok(r.every((x) => x.pivots.filter((p) => p.kind === 'high').length >= 3 && x.pivots.filter((p) => p.kind === 'low').length >= 3));
  assert.ok(r.every((x) => x.endIndex - x.startIndex >= COMMON.patterns.multiMonth.minBars));
});

test('vùng nhiều tháng: ngắn hơn 60 nến hoặc chỉ 2 chạm thì không phát', () => {
  const short: [number, number][] = [[0, 110], [5, 100], [15, 120], [25, 100], [35, 120], [45, 100], [55, 120], [65, 100]];
  assert.equal(mm(short).r.length, 0); // 3 chạm nhưng chỉ ~50 nến
  const twoTouch: [number, number][] = [[0, 110], [10, 100], [40, 120], [80, 100], [120, 120], [160, 100]];
  assert.equal(mm(twoTouch).r.length, 0);
});

test('pivot cuối bị thay thế: không phát vùng kết thúc ở đỉnh còn có thể bị thay', () => {
  // đỉnh 110 (120,5) chưa có đáy sau nó → chưa chắc; sau đó đỉnh cao hơn 126 thay nó
  const pts: [number, number][] = [[0, 110], [10, 100], [30, 120], [50, 100], [70, 120], [90, 100], [110, 120], [114, 119.8], [120, 126], [140, 100]];
  const c = wave(pts);
  const av = A(c.length, 2);
  const early = c.slice(0, 118); // thấy đỉnh 110, chưa thấy đỉnh 120 xác nhận
  const pvE = swingPivots(early, av.slice(0, 118), 0.75);
  assert.equal(pvE[pvE.length - 1]!.index, 110);
  assert.equal(detectMultiMonth(early, pvE, av.slice(0, 118), '1d').filter((g) => g.endIndex === 110).length, 0);
  const fullR = detectMultiMonth(c, swingPivots(c, av, 0.75), av, '1d');
  assert.equal(fullR.filter((g) => g.endIndex === 110).length, 0, 'đỉnh 110 đã bị thay bằng 126');
});

test('trạng thái phá: đóng ≥ biên + 0,5×A, hoặc 2 nến đóng liên tiếp ngoài biên; nến xét chính là nến phá', () => {
  const { c, r } = mm(RANGE);
  const g = r[r.length - 1]!;
  const tail = (closes: number[]) => c.slice(0, 141).concat(closes.map((x) => k(x + 0.5, x - 0.5, x)));
  const st = (closes: number[], at: number) => {
    const s = tail(closes);
    return multiMonthStatus(s, A(s.length, 2), g, at);
  };
  assert.equal(st([110], 141).state, 'inside');
  assert.equal(st([121.0], 141).state, 'inside'); // 121 < 120,5 + 1 và mới 1 nến ngoài biên
  assert.equal(st([121.5], 141).state, 'broken_up'); // đúng nến đang xét là nến phá (≥ 121,5)
  assert.deepEqual(st([121.5], 141), { state: 'broken_up', brokenAt: 141 });
  assert.equal(st([121.0, 120.9], 142).state, 'broken_up'); // 2 nến liên tiếp ngoài biên
  assert.equal(st([121.0, 110, 120.9], 143).state, 'inside'); // bị ngắt giữa chừng
  assert.equal(st([98.0], 141).state, 'broken_down'); // ≤ 99,5 − 1 = 98,5
  assert.equal(st([98.9, 98.9], 142).state, 'broken_down');
  assert.equal(st([121.5, 110], 142).state, 'broken_up'); // đã phá thì giữ trạng thái
});

// ---- coil ----
function quietAfterNoise(n = 260, quiet = 25): Candle[] {
  let seed = 3;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const out: Candle[] = [];
  for (let i = 0; i < n - quiet; i++) {
    const p = 100 + (rnd() - 0.5) * 12;
    out.push(k(p + 1.5 + rnd() * 2, p - 1.5 - rnd() * 2));
  }
  for (let i = 0; i < quiet; i++) out.push(k(100 + (0.5 - 0.01 * i) / 2, 100 - (0.5 - 0.01 * i) / 2)); // biên độ co dần → nến cuối hẹp nhất
  return out;
}

test('coil: nén biến động bật đủ ≥2/3 chỉ báo; nhiễu bình thường thì tắt', () => {
  const c = quietAfterNoise();
  const on = coilAt(c, c.length - 1);
  assert.equal(on.on, true, JSON.stringify(on));
  assert.ok(on.hits.length >= 2);
  assert.ok(on.hits.some((h) => h.includes('NR')));
  const noisy = quietAfterNoise(260, 0);
  assert.equal(coilAt(noisy, noisy.length - 1).on, false);
});

test('coil: thiếu dữ liệu (<125 nến BBW hoặc <100 nến ATR) thì không bật, không đoán', () => {
  const c = quietAfterNoise(90, 25);
  const r = coilAt(c, c.length - 1);
  assert.equal(r.on, false);
  assert.ok(r.hits.every((h) => h.startsWith('NR')), JSON.stringify(r.hits)); // BBW cần 144 nến, ATR100 cần 100 nến → không bật
  assert.ok(r.hits.length < COMMON.patterns.coil.minHits);
});

test('coil: chỉ dùng nến đã đóng đến atIndex (nến sau đó không ảnh hưởng)', () => {
  const c = quietAfterNoise();
  const i = c.length - 1;
  const bigFuture = c.concat([k(300, 10), k(400, 5)]);
  assert.deepEqual(coilAt(bigFuture, i), coilAt(c, i));
  assert.throws(() => coilAt(c, c.length), /ngoài/);
});

// ---- contextFlags ----
test('contextFlags: cấm Long ngay dưới biên trên vùng nhiều tháng chưa phá, cấm Short ngay trên biên dưới', () => {
  const lead = Array.from({ length: 20 }, () => k(110.5, 109.5)); // đệm khởi động ATR(14) để đáy đầu không bị bỏ
  const d1 = lead.concat(wave([...RANGE.slice(0, -1), [140, 105], [150, 105]])); // 1D: vùng 99,5..120,5 và đang đi ngang giữa vùng
  const h4Near = wave([[0, 119.5], [300, 119.5]]);
  const r = contextFlags(h4Near, d1);
  assert.ok(r.multiMonth);
  assert.equal(r.multiMonth!.state, 'inside');
  assert.equal(r.block.long, true);
  assert.equal(r.block.short, false);
  assert.ok(r.notes.some((s) => s.includes('biên trên')));
  const h4Low = wave([[0, 100.5], [300, 100.5]]);
  const r2 = contextFlags(h4Low, d1);
  assert.equal(r2.block.short, true);
  assert.equal(r2.block.long, false);
  const h4Mid = wave([[0, 110], [300, 110]]);
  const r3 = contextFlags(h4Mid, d1);
  assert.equal(r3.block.long, false);
  assert.equal(r3.block.short, false);
});

test('contextFlags: dữ liệu rỗng hoặc ngắn trả về trạng thái trống, không ném lỗi', () => {
  const c = wave([[0, 100], [10, 101]]);
  const r = contextFlags(c, c);
  assert.equal(r.hs, null);
  assert.equal(r.multiMonth, null);
  assert.equal(r.coil, false);
  assert.deepEqual(r.block, { long: false, short: false });
  assert.throws(() => contextFlags([], c), /rỗng/);
});

test('contextFlags: vai-đầu-vai đỉnh đã xác nhận chặn Long, ngược chặn Short', () => {
  const pts: [number, number][] = [[0, 100], [20, 110], [30, 102], [45, 120], [60, 102], [70, 110], [85, 95], [100, 100]];
  // nền dài 220 nến đi lên thoải để EMA200 nằm thấp hơn các đỉnh, rồi nối vai-đầu-vai
  const pre = Array.from({ length: 220 }, (_, i) => k(60 + i * 0.18 + 0.5, 60 + i * 0.18 - 0.5, 60 + i * 0.18));
  const shift = 99.6 - 100; // nối liền mạch giá
  const hsBars = wave(pts).map((x) => k(x.high + shift + 0, x.low + shift, x.close + shift));
  const c = pre.concat(hsBars);
  const r = contextFlags(c, c);
  assert.ok(r.hs, JSON.stringify(r));
  assert.equal(r.hs!.kind, 'head_shoulders');
  assert.equal(r.hs!.state, 'confirmed');
  assert.equal(r.block.long, true);
  assert.equal(r.block.short, false);
  const m = c.map((x) => k(300 - x.low, 300 - x.high));
  const rm = contextFlags(m, m);
  assert.equal(rm.hs?.kind, 'inv_head_shoulders');
  assert.equal(rm.block.short, true);
  assert.equal(rm.block.long, false);
});

// ---- chống look-ahead ----
// Nhiều vùng đi ngang (biên độ ±10, chu kỳ 40 nến, nhiễu nhỏ) nối nhau bằng đoạn dốc 20 nến → có vùng nhiều tháng, có cú phá.
function longSeries(count: number, seed0 = 21): Candle[] {
  let seed = seed0;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const tri = (x: number) => 1 - 4 * Math.abs(((x % 1) + 1) % 1 - 0.5); // -1..1
  const out: Candle[] = [];
  let center = 100;
  let i = 0;
  while (out.length < count) {
    for (let q = 0; q < 220 && out.length < count; q++, i++) {
      const p = center + 10 * tri(q / 40) + (rnd() - 0.5) * 0.4;
      out.push(k(p + 0.3, p - 0.3));
    }
    const next = center + (rnd() - 0.5) * 50;
    for (let q = 1; q <= 20 && out.length < count; q++, i++) {
      const p = center + ((next - center) * q) / 20;
      out.push(k(p + 0.3, p - 0.3));
    }
    center = next;
  }
  return out;
}
const N = COMMON.pivotConfirmBars;
const P = COMMON.patterns.atrPeriod;
const MIN = COMMON.patterns.minSwingAtr['1d'];
const sig = (g: ReturnType<typeof detectMultiMonth>[number]) =>
  JSON.stringify([g.kind, g.pivots, g.startIndex, g.endIndex, g.upper(g.endIndex), g.lower(g.endIndex), g.height, g.stopRef, g.quality, g.notes]);
const all = (c: Candle[]) => {
  const a = atr(c, P);
  return detectMultiMonth(c, swingPivots(c, a, MIN), a, '1d');
};

test('chống look-ahead: vùng nhiều tháng chạy từng tiền tố == chạy cả chuỗi (cả trạng thái)', () => {
  const candles = longSeries(900);
  const full = all(candles);
  assert.ok(full.length >= 3, `dữ liệu thử phải có vùng nhiều tháng, có ${full.length}`);
  const fullAtr = atr(candles, P);
  let compared = 0;
  for (let len = P + N + 2; len <= candles.length; len++) {
    const s = candles.slice(0, len);
    const a = atr(s, P);
    const pv = swingPivots(s, a, MIN);
    if (pv.length === 0) continue;
    const limit = pv[pv.length - 1]!.index;
    const pre = all(s).filter((g) => g.endIndex < limit);
    const exp = full.filter((g) => g.endIndex < limit);
    assert.deepEqual(pre.map(sig), exp.map(sig), `lệch tại độ dài ${len}`);
    for (let q = 0; q < pre.length; q++) {
      assert.deepEqual(multiMonthStatus(candles, fullAtr, exp[q]!, len - 1), multiMonthStatus(s, a, pre[q]!, len - 1), `trạng thái lệch tại ${len}`);
    }
    compared += pre.length;
  }
  assert.ok(compared > 0);
});

test('chống look-ahead: coil chạy trên tiền tố == chạy cả chuỗi tại cùng nến', () => {
  const candles = quietAfterNoise(400, 0).concat(quietAfterNoise(400, 30), longSeries(300));
  let ons = 0;
  for (let i = 0; i < candles.length; i++) {
    const a = coilAt(candles, i);
    const b = coilAt(candles.slice(0, i + 1), i);
    assert.deepEqual(a, b, `lệch tại nến ${i}`);
    if (a.on) ons++;
  }
  assert.ok(ons > 0, 'dữ liệu thử phải có lúc coil bật');
});

test('contextFlags: vai-đầu-vai 4H và 1D đã xác nhận NGƯỢC nhau → chặn cả hai chiều, ghi "xung đột bối cảnh"', () => {
  const pts: [number, number][] = [[0, 100], [20, 110], [30, 102], [45, 120], [60, 102], [70, 110], [85, 95], [100, 100]];
  const pre = Array.from({ length: 220 }, (_, i) => k(60 + i * 0.18 + 0.5, 60 + i * 0.18 - 0.5, 60 + i * 0.18));
  const shift = 99.6 - 100;
  const c = pre.concat(wave(pts).map((x) => k(x.high + shift, x.low + shift, x.close + shift)));
  const m = c.map((x) => k(300 - x.low, 300 - x.high));
  const r = contextFlags(c, m); // 4H: vai-đầu-vai đỉnh; 1D: vai-đầu-vai ngược
  assert.equal(r.block.long, true);
  assert.equal(r.block.short, true);
  assert.ok(r.notes.some((n) => /xung đột bối cảnh/.test(n)), r.notes.join(' | '));
  // cùng chiều (hai khung cùng là đỉnh) → không xung đột, chỉ chặn Long
  const same = contextFlags(c, c);
  assert.equal(same.block.short, false);
  assert.ok(!same.notes.some((n) => /xung đột/.test(n)));
});

test('bối cảnh hai đỉnh/hai đáy (người dùng chọn 19/10/2026): hai đỉnh đã phá cổ → chặn Long; hai đáy gương → chặn Short; hết hiệu lực sau hs.activeBars nến', () => {
  const top = wave([[0, 80], [30, 100], [40, 90], [50, 100], [56, 88]]); // hai đỉnh 100,5; cổ 89,5; nến 56 đóng 88 thủng cổ
  const r = contextFlags(top, []);
  assert.equal(r.block.long, true, r.notes.join(' | '));
  assert.equal(r.block.short, false);
  assert.ok(r.notes.some((n) => /hai đỉnh 4H đã phá cổ .* chặn Long/.test(n)), r.notes.join(' | '));
  assert.ok(r.doubles.some((d) => d.kind === 'double_top' && d.timeframe === '4h'));
  const bottom = top.map((x) => k(300 - x.low, 300 - x.high));
  const rb = contextFlags(bottom, []);
  assert.equal(rb.block.short, true, rb.notes.join(' | '));
  assert.equal(rb.block.long, false);
  // sau phá, đi ngang dưới cổ quá activeBars nến → hết hiệu lực bối cảnh
  const later = top.concat(Array.from({ length: COMMON.patterns.hs.activeBars + 1 }, () => k(86.5, 85.5, 86)));
  assert.equal(contextFlags(later, []).block.long, false);
});
