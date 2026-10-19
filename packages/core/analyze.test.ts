import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, type AnalyzeInput } from './analyze.ts';
import type { Candle } from './types.ts';
import { COMMON, CONFIG } from './config.ts';
import { worstTp1NetR } from './plan.ts';

function k(i: number, close: number, takerShare = 0.5): Candle {
  return { openTime: i * 1000, closeTime: i * 1000 + 999, open: close * 0.999, high: close * 1.004, low: close * 0.996,
    close, volume: 100, quoteVolume: 100 * close, takerBuyQuote: 100 * close * takerShare };
}
const up = (n: number, step: number, share = 0.5) => Array.from({ length: n }, (_, i) => k(i, 100 + i * step, share));

// Xu hướng tăng có nhịp hồi (sóng): có đỉnh/đáy thật để dựng vùng hỗ trợ/kháng cự.
// amp: biên độ nhịp (cùng đơn vị giá), period: số nến mỗi nhịp
const upWaves = (n: number, step: number, share = 0.5, amp = 1, period = 40) =>
  Array.from({ length: n }, (_, i) => k(i, 100 + i * step + amp * Math.sin((2 * Math.PI * i) / period), share));

const base: AnalyzeInput = {
  mode: 'swing',
  contract: { symbol: 'TESTUSDT', baseAsset: 'TEST', onboardDate: Date.parse('2024-01-01'), tickSize: 0.001, stepSize: 0.001, minQty: 0.001, maxQty: 1e9, marketMinQty: 0.001, marketMaxQty: 1e9, marketStepSize: 0.001, minNotional: 5, maxNumOrders: 200, deliveryDate: 4133404800000 },
  trend: up(300, 1), entry: upWaves(500, 0.2, 0.6, 2, 40), daily: up(300, 1), hourly: up(100, 0.05), btcTrend: up(300, 0.3),
  regime: 'up', breakerTripped: false, liquidityRankPct: 0.05, spreadPct: 0.02,
  premium: { symbol: 'TESTUSDT', markPrice: 199.8, lastFundingRate: 0.0001, nextFundingTime: Date.parse('2026-10-19T16:00:00Z') },
  fundingIntervalHours: 8, fundingIntervalDefault: false,
  now: new Date('2026-10-19T12:00:00Z'), events: [], capital: 1000, riskPct: 2,
  patternData: null,
};
// TESTUSDT ở base thuộc phạm vi mô hình (rủi ro Thấp/Vừa, hạng thanh khoản 5%) → phải có dữ liệu mô hình.
base.patternData = { c4h: base.entry, c1d: base.daily, c1h: base.hourly, btcSma200ReclaimedAt: null };

test('xu hướng tăng rõ, thị trường lên → Đạt tiêu chí Long, có kế hoạch', () => {
  const a = analyze(base);
  assert.equal(a.label, 'Đạt tiêu chí Long', JSON.stringify(a.gates.filter((g) => !g.pass)));
  assert.ok(a.plan !== null && a.plan.side === 'long');
});

test('cầu dao bật → không Đạt tiêu chí Long', () => {
  const a = analyze({ ...base, breakerTripped: true });
  assert.notEqual(a.label, 'Đạt tiêu chí Long');
  assert.equal(a.gates.find((g) => g.code === 'G-01')?.pass, false);
});

test('thị trường xuống nhưng điểm ≥ 80 → vẫn Đạt tiêu chí Long (ngoại lệ ngược xu hướng, spec 3.2)', () => {
  const a = analyze({ ...base, regime: 'down' });
  assert.ok(a.best.score >= 80, `điểm ${a.best.score}`);
  assert.ok((a.best.rsZ ?? 0) >= 1.5, `z ${a.best.rsZ}`);
  assert.equal(a.label, 'Đạt tiêu chí Long');
});

test('mọi lý do và cổng đều mang mã có trong danh mục', async () => {
  const { ruleByCode } = await import('./rules.ts');
  const a = analyze(base);
  for (const r of [...a.long.reasons, ...a.short.reasons]) ruleByCode(r.code);
  for (const g of a.gates) ruleByCode(g.code);
});

test('M1: hợp đồng 4h, funding 0,03%/kỳ = 0,06%/8h → cờ F-01 bật, note nêu cả hai chu kỳ', () => {
  const a = analyze({ ...base, fundingIntervalHours: 4, premium: { ...base.premium, lastFundingRate: 0.0003 } });
  assert.ok(a.flags.some((f) => f.startsWith('F-01')), a.flags.join('|'));
  assert.match(a.gates.find((g) => g.code === 'G-09')!.note, /0,0300%\/4h ≈ 0,0600%\/8h/);
});

test('M1: cùng 0,03%/kỳ nhưng chu kỳ 8h → không có F-01', () => {
  const a = analyze({ ...base, fundingIntervalHours: 8, premium: { ...base.premium, lastFundingRate: 0.0003 } });
  assert.ok(!a.flags.some((f) => f.startsWith('F-01')));
});

test('M1: hợp đồng 4h, funding 0,06%/kỳ = 0,12%/8h → G-09 chặn Long', () => {
  const a = analyze({ ...base, fundingIntervalHours: 4, premium: { ...base.premium, lastFundingRate: 0.0006 } });
  assert.equal(a.best.side, 'long');
  assert.equal(a.gates.find((g) => g.code === 'G-09')?.pass, false);
});

test('M1: mã không có trong fundingInfo → note nói rõ dùng mặc định 8h', () => {
  const a = analyze({ ...base, fundingIntervalDefault: true });
  assert.match(a.gates.find((g) => g.code === 'G-09')!.note, /mặc định 8h/);
});

test('M1: fundingCostR của hợp đồng 4h gấp đôi hợp đồng 8h cùng mức/kỳ', () => {
  const a8 = analyze(base);
  const a4 = analyze({ ...base, fundingIntervalHours: 4 });
  assert.ok(a8.plan && a4.plan);
  assert.ok(Math.abs(a4.plan.fundingCostR / a8.plan.fundingCostR - 2) < 1e-9);
});

// ATR ngày ~ 12% giá → mức rủi ro Rất cao
const volatileDaily = Array.from({ length: 300 }, (_, i) => {
  const c = k(i, 100 + i * 0.33); // giá cuối ~199, khớp giá khung vào lệnh
  return { ...c, high: c.close * 1.06, low: c.close * 0.94 };
});

test('B0: coin rủi ro Cao/Rất cao KHÔNG bị hạ xuống 0,25% nữa — vẫn dùng riskPct truyền vào (2% = 20 USDT/1000)', () => {
  const a = analyze({ ...base, daily: volatileDaily, trend: volatileDaily, entry: upWaves(500, 0.2, 0.6, 1, 20) });
  assert.ok(a.risk.tier === 'Cao' || a.risk.tier === 'Rất cao', a.risk.tier);
  assert.ok(a.plan, a.label);
  assert.equal(a.plan.riskAmount, 20);
  assert.equal(a.plan.riskPct, 2);
  assert.ok(!a.risk.notes.some((n) => /P-01/.test(n)));
});

test('B0: coin rủi ro thấp/vừa, swing → 2%', () => {
  const a = analyze(base);
  assert.ok(a.risk.tier === 'Thấp' || a.risk.tier === 'Vừa', a.risk.tier);
  assert.equal(a.plan?.riskAmount, 20);
  assert.equal(a.plan?.riskPct, 2);
});

test('B0: chế độ fast cũng 2% (bỏ trần 0,25% của Lướt nhanh)', () => {
  const a = analyze({ ...base, mode: 'fast', trend: up(500, 0.2, 0.6), btcTrend: up(500, 0.1), riskPct: COMMON.risk.perTradePct });
  const p = a.plan ?? (() => { throw new Error('không có plan: ' + a.label + JSON.stringify(a.gates.filter((g) => !g.pass))); })();
  assert.equal(p.riskPct, 2);
});

test('D1: cắt lỗ rộng hơn 2×ATR ngày → G-11 trượt, không còn nhãn Đạt', () => {
  // nến ngày biên độ rất nhỏ (ATR ngày nhỏ) nhưng khung 4h dao động lớn → cắt lỗ (2×ATR 4h) vượt 2×ATR ngày
  const calmDaily = up(300, 1).map((c) => ({ ...c, high: c.close * 1.0005, low: c.close * 0.9995 }));
  const wildEntry = up(500, 0.2, 0.6).map((c) => ({ ...c, high: c.close * 1.03, low: c.close * 0.97 }));
  const a = analyze({ ...base, daily: calmDaily, trend: calmDaily, entry: wildEntry });
  const g = a.gates.find((x) => x.code === 'G-11')!;
  assert.equal(g.pass, false, g.note);
  assert.match(g.note, /×ATR/);
  assert.ok(!a.label.startsWith('Đạt'));
  assert.equal(a.plan, null);
});

test('D1: kế hoạch thường → G-11 qua', () => {
  const a = analyze(base);
  assert.equal(a.gates.find((x) => x.code === 'G-11')?.pass, true, a.gates.find((x) => x.code === 'G-11')?.note);
});

test('D2: thị trường xuống, Long điểm cao nhưng RS z chưa đủ mạnh → G-01 trượt, note nêu RS z', () => {
  const a = analyze({ ...base, regime: 'down', btcTrend: up(300, 0.99) });
  assert.equal(a.best.side, 'long');
  assert.ok(a.best.score >= 80, `điểm ${a.best.score}`);
  assert.ok(a.best.rsZ !== null && a.best.rsZ < 1.5, `z ${a.best.rsZ}`);
  const g = a.gates.find((x) => x.code === 'G-01')!;
  assert.equal(g.pass, false);
  assert.match(g.note, /RS z/);
  assert.ok(!a.label.startsWith('Đạt'));
});

test('D2: coin kém thanh khoản (không có RS) ngược xu hướng → G-01 trượt', () => {
  const a = analyze({ ...base, regime: 'down', liquidityRankPct: 0.9 });
  const g = a.gates.find((x) => x.code === 'G-01')!;
  assert.equal(g.pass, false);
  assert.match(g.note, /thiếu RS/);
});

test('D3: fast, BTC 1H dưới SMA200 → Long bị G-01 chặn, nêu BTC 1H', () => {
  const fast = { ...base, mode: 'fast' as const, trend: up(500, 0.2, 0.6), btcTrend: up(500, -0.1) };
  const a = analyze({ ...fast, btcTrend: Array.from({ length: 500 }, (_, i) => k(i, 300 - i * 0.2)) });
  assert.equal(a.best.side, 'long');
  const g = a.gates.find((x) => x.code === 'G-01')!;
  assert.equal(g.pass, false);
  assert.match(g.note, /BTC 1H/);
  assert.ok(!a.label.startsWith('Đạt'));
});

test('D3: fast, thiếu nến BTC 1H (< 200) → G-01 trượt (fail closed)', () => {
  const a = analyze({ ...base, mode: 'fast', trend: up(500, 0.2, 0.6), btcTrend: up(150, 0.1) });
  const g = a.gates.find((x) => x.code === 'G-01')!;
  assert.equal(g.pass, false);
  assert.match(g.note, /Thiếu dữ liệu BTC 1H/);
});

test('Task 3: plan có 3 mục tiêu chốt 50/30/20 và cổng G-12 qua', () => {
  const a = analyze(base);
  assert.ok(a.plan, a.label);
  assert.equal(a.plan.targets.length, 3);
  assert.deepEqual(a.plan.targets.map((t) => t.pct), [50, 30, 20]);
  const g = a.gates.find((x) => x.code === 'G-12')!;
  assert.equal(g.pass, true, g.note);
});

test('Task 3: đà tăng một mạch, không có đáy/đỉnh nào → không có vùng hỗ trợ → G-12 trượt, không Đạt, không plan', () => {
  const mono = (n: number, step: number) => Array.from({ length: n }, (_, i) => { const c = 100 + i * step; return { ...k(i, c, 0.6), high: c, low: c * 0.9999 }; });
  const a = analyze({ ...base, entry: mono(500, 0.2), trend: mono(300, 1) });
  const g = a.gates.find((x) => x.code === 'G-12')!;
  assert.equal(g.pass, false, g.note);
  assert.ok(!a.label.startsWith('Đạt'));
  assert.equal(a.plan, null);
});

// ---------- Kế hoạch 1c: mô hình biểu đồ trong analyze ----------
import { arbitrate } from './analyze.ts';

const H4 = 4 * 3600_000;
const H1 = 3600_000;
function k4(i: number, close: number): Candle {
  return { openTime: i * H4, closeTime: (i + 1) * H4 - 1, open: close, high: close + 0.5, low: close - 0.5, close, volume: 1, quoteVolume: close, takerBuyQuote: close / 2 };
}
function wave4(pts: [number, number][]): Candle[] {
  const out: Candle[] = [];
  for (let s = 0; s < pts.length - 1; s++) {
    const [i0, p0] = pts[s]!;
    const [i1, p1] = pts[s + 1]!;
    for (let i = i0; i < i1; i++) out.push(k4(i, p0 + ((p1 - p0) * (i - i0)) / (i1 - i0)));
  }
  const [il, pl] = pts[pts.length - 1]!;
  out.push(k4(il, pl));
  return out;
}
// Chữ nhật 100..110 trên 4H (đỉnh 30/50, đáy 40/60), nến cuối (chỉ số 67) phá lên đóng 112
const rect4h = [...wave4([[0, 90], [30, 110], [40, 100], [50, 110], [60, 100], [66, 108]]), k4(67, 112)];
const h1For = (c4: Candle[]) => Array.from({ length: c4.length * 4 }, (_, j) => {
  const c = c4[Math.floor(j / 4)]!.close;
  return { openTime: j * H1, closeTime: (j + 1) * H1 - 1, open: c, high: c + 0.3, low: c - 0.3, close: c, volume: 1, quoteVolume: c, takerBuyQuote: c / 2 };
});

test('P-G1: hợp đồng trong phạm vi mà thiếu dữ liệu mô hình → ném lỗi, không im lặng bỏ qua', () => {
  assert.throws(() => analyze({ ...base, patternData: null }), /dữ liệu mô hình/);
});

test('P-G1: ngoài phạm vi (thanh khoản không thuộc nhóm cao) → không chạy mô hình, P-C1 qua kèm ghi chú', () => {
  const a = analyze({ ...base, liquidityRankPct: 0.3, patternData: null });
  assert.equal(a.patternScope.ok, false);
  assert.deepEqual(a.patterns, []);
  assert.equal(a.patternSignal, null);
  const g = a.gates.find((x) => x.code === 'P-C1')!;
  assert.equal(g.pass, true);
  assert.match(g.note, /ngoài phạm vi/);
});

test('Swing trong phạm vi: chữ nhật 4H phá lên được theo dõi, ghi P-G2 và kết quả lập kế hoạch', () => {
  const a = analyze({ ...base, patternData: { c4h: rect4h, c1d: base.daily, c1h: h1For(rect4h), btcSma200ReclaimedAt: null } });
  assert.equal(a.patternScope.ok, true);
  const r = a.patterns.find((p) => p.kind === 'rectangle' && p.timeframe === '4h');
  assert.ok(r, JSON.stringify(a.patterns));
  assert.equal(r.state, 'breakout');
  assert.equal(r.breakoutLine, 110.5);
  assert.equal(r.hidden, false);
  assert.ok(r.pivots.length >= 4 && r.pivots.every((p) => Number.isFinite(p.time) && Number.isFinite(p.price)));
  assert.ok(r.notes.some((n) => /^P-G2/.test(n)), r.notes.join(' | '));
  assert.ok(r.notes.some((n) => /^Kế hoạch mô hình/.test(n)), r.notes.join(' | '));
});

test('Lướt nhanh: mô hình 1H/15m chỉ ghi nhận (ẩn), không bao giờ có tín hiệu mô hình', () => {
  const fast = { ...base, mode: 'fast' as const, trend: rect4h.map((c, i) => ({ ...c, openTime: i * H1, closeTime: (i + 1) * H1 - 1 })), btcTrend: up(500, 0.1) };
  const a = analyze(fast);
  assert.ok(a.patterns.length > 0, 'phải có mô hình 1H được ghi nhận');
  assert.ok(a.patterns.every((p) => p.hidden && (p.timeframe === '1h' || p.timeframe === '15m')));
  assert.equal(a.patternSignal, null);
});

test('Bối cảnh: vai-đầu-vai đỉnh 1D đã xác nhận → P-C1 chặn Long, không Đạt tiêu chí Long', () => {
  const kk = (high: number, low: number, close = (high + low) / 2): Candle => ({ openTime: 0, closeTime: 0, open: close, high, low, close, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 });
  const pts: [number, number][] = [[0, 100], [20, 110], [30, 102], [45, 120], [60, 102], [70, 110], [85, 95], [100, 100]];
  const pre = Array.from({ length: 220 }, (_, i) => kk(60 + i * 0.18 + 0.5, 60 + i * 0.18 - 0.5, 60 + i * 0.18));
  const hs: Candle[] = [];
  for (let s = 0; s < pts.length - 1; s++) {
    const [i0, p0] = pts[s]!;
    const [i1, p1] = pts[s + 1]!;
    for (let i = i0; i < i1; i++) { const cl = p0 + ((p1 - p0) * (i - i0)) / (i1 - i0) - 0.4; hs.push(kk(cl + 0.5, cl - 0.5, cl)); }
  }
  hs.push(kk(100.1, 99.1, 99.6));
  const a = analyze({ ...base, patternData: { ...base.patternData!, c1d: pre.concat(hs) } });
  const g = a.gates.find((x) => x.code === 'P-C1')!;
  assert.equal(a.best.side, 'long');
  assert.equal(g.pass, false, g.note);
  assert.match(g.note, /vai-đầu-vai đỉnh/);
  assert.ok(!a.label.startsWith('Đạt'));
  assert.equal(a.plan, null);
});

test('Một tín hiệu mỗi hợp đồng × chế độ: cùng chiều → dùng mô hình; ngược chiều → không phát cả hai, ghi "xung đột"', () => {
  assert.deepEqual(arbitrate('long', null), { use: 'zone', note: null });
  assert.deepEqual(arbitrate(null, 'short'), { use: 'pattern', note: null });
  assert.deepEqual(arbitrate(null, null), { use: null, note: null });
  const same = arbitrate('long', 'long');
  assert.equal(same.use, 'pattern');
  assert.match(same.note!, /cùng chiều/);
  const opp = arbitrate('long', 'short');
  assert.equal(opp.use, null);
  assert.match(opp.note!, /xung đột/);
});

test('mã cổng mới P-G1/P-G2/P-C1 có trong danh mục; mọi cổng của analyze có mã hợp lệ', async () => {
  const { ruleByCode } = await import('./rules.ts');
  for (const code of ['P-G1', 'P-G2', 'P-C1', 'P-C2', 'P-S1']) ruleByCode(code);
  const a = analyze({ ...base, patternData: { c4h: rect4h, c1d: base.daily, c1h: h1For(rect4h), btcSma200ReclaimedAt: null } });
  for (const g of a.gates) ruleByCode(g.code);
});

// ---------- I1: đường "tín hiệu mô hình thắng" chạy thật qua analyze ----------
import { finalizeSignal, type PatternCandidate } from './analyze.ts';
import { patternPlanLines } from '../../scanner/plan-print.ts';

// Chữ nhật 4H 500..530 (h = 30, cao hơn mọi vùng S/R của base) — 20 nến nền khởi động ATR, chạm trên 30/50/70, chạm dưới 40/60,
// đáy nhỏ phía trong 528,2 ở nến 75 (cách biên 1,8 ≥ 0,5×A) (sau lần chạm trên cuối), nến 80 phá lên đóng 532.
function rectInner(): Candle[] {
  const out: Candle[] = [];
  const put = (i: number, high: number, low: number, close: number) =>
    out.push({ openTime: i * H4, closeTime: (i + 1) * H4 - 1, open: close, high, low, close, volume: 1, quoteVolume: close, takerBuyQuote: close / 2 });
  for (let i = 0; i <= 70; i++) {
    const high = i === 30 || i === 50 || i === 70 ? 530 : 518;
    const low = i === 40 || i === 60 ? 500 : 515;
    put(i, high, low, 516.5);
  }
  for (let i = 71; i <= 79; i++) put(i, 529.8, i === 75 ? 528.2 : 528.5, 529.2);
  put(80, 532.6, 529, 532);
  return out;
}
// 1H biên độ ±1,5 để nến phá 4H (biên độ 3,6) không bị "chờ xác nhận" (> 3×ATR 1H)
const h1Wide = (c4: Candle[]) => h1For(c4).map((x) => ({ ...x, high: x.close + 1.5, low: x.close - 1.5 }));
// Gương giá quanh M: Long ↔ Short (đỉnh ↔ đáy, taker mua ↔ bán)
const M = 2000;
const mirror = (c: Candle[]): Candle[] => c.map((x) => ({ ...x, open: M - x.open, close: M - x.close, high: M - x.low, low: M - x.high, quoteVolume: x.quoteVolume, takerBuyQuote: x.quoteVolume - x.takerBuyQuote }));
const pdLong = () => { const c4 = rectInner(); return { c4h: c4, c1d: base.daily, c1h: h1Wide(c4), btcSma200ReclaimedAt: null }; };

test('I1: Long — vùng và mô hình cùng chiều → phát tín hiệu MÔ HÌNH (label Đạt, plan null, gates của mô hình, ghi chú cùng chiều)', () => {
  const a = analyze({ ...base, patternData: pdLong() });
  const r = a.patterns.find((p) => p.kind === 'rectangle');
  assert.ok(a.patternSignal, `không có tín hiệu mô hình: ${JSON.stringify(r?.notes)} | ${a.label}`);
  assert.equal(a.label, 'Đạt tiêu chí Long');
  assert.equal(a.plan, null);
  assert.equal(a.patternSignal.side, 'long');
  assert.equal(a.patternSignal.kind, 'rectangle');
  assert.equal(a.best.side, 'long');
  assert.ok(a.gates.some((g) => g.code === 'P-G2' && g.pass) && a.gates.some((g) => g.code === 'P-G1'));
  assert.ok(a.flags.some((f) => /cùng chiều Long → dùng kế hoạch theo mô hình/.test(f)), a.flags.join(' | '));
  assert.match(a.patternSignal.stopReason, /pivot nhỏ phía trong 528.2/);
  if (process.env.PRINT_PLAN) console.log(patternPlanLines({ symbol: 'TESTUSDT', score: a.best.score, riskTier: a.risk.tier }, a.patternSignal, 0.01).join('\n'));
});

test('I1: Short (gương) — tín hiệu mô hình Short được phát', () => {
  const pd = pdLong();
  const a = analyze({
    ...base, regime: 'down', trend: mirror(base.trend), entry: mirror(base.entry), daily: mirror(base.daily), hourly: mirror(base.hourly), btcTrend: mirror(base.btcTrend),
    premium: { ...base.premium, markPrice: M - base.premium.markPrice },
    patternData: { c4h: mirror(pd.c4h), c1d: mirror(base.daily), c1h: mirror(pd.c1h), btcSma200ReclaimedAt: null },
  });
  const r = a.patterns.find((p) => p.kind === 'rectangle');
  assert.ok(a.patternSignal, `không có tín hiệu mô hình: ${JSON.stringify(r?.notes)} | ${a.label} | ${JSON.stringify(a.gates.filter((g) => !g.pass))}`);
  assert.equal(a.label, 'Đạt tiêu chí Short');
  assert.equal(a.patternSignal.side, 'short');
  assert.equal(a.plan, null);
  assert.ok(a.flags.some((f) => /cùng chiều Short/.test(f)), a.flags.join(' | '));
});

test('I1: điểm phía mô hình < minSideScore → không phát tín hiệu mô hình, ghi lý do', () => {
  // btcTrend tăng mạnh hơn coin → điểm Long thấp; vùng cũng không Đạt
  const a = analyze({ ...base, btcTrend: up(300, 3), patternData: pdLong() });
  if (a.long.score >= COMMON.patterns.minSideScore) return assert.fail(`fixture cần điểm Long < ${COMMON.patterns.minSideScore}, có ${a.long.score}`);
  assert.equal(a.patternSignal, null);
  const r = a.patterns.find((p) => p.kind === 'rectangle')!;
  // lý do chặn phải là ĐIỂM (đã qua mọi cổng), không phải cổng khác
  assert.ok(!r.notes.some((n) => /cổng trượt|^Kế hoạch mô hình: bỏ/.test(n)), r.notes.join(' | '));
  assert.ok(r.notes.includes(`Kế hoạch mô hình: lập được, qua cổng nhưng điểm Long ${a.long.score} < ${COMMON.patterns.minSideScore}`), r.notes.join(' | '));
});

const fakeScore = (side: 'long' | 'short', score: number) => ({ side, score, coverage: 1, reasons: [], rsZ: null });
const cand = (side: 'long' | 'short'): PatternCandidate => ({ plan: { side } as unknown as PatternCandidate['plan'], gates: [{ code: 'P-G2', pass: true, note: 'x' }], score: fakeScore(side, 75) });

test('I1 finalizeSignal: chỉ mô hình / cùng chiều / ngược chiều / chỉ vùng', () => {
  const zplan = analyze(base).plan!;
  const zg = [{ code: 'G-01', pass: true, note: '' }];
  let flags: string[] = [];
  const onlyP = finalizeSignal({ best: fakeScore('short', 40), zoneGates: zg, zoneOk: false, plan: zplan, pattern: cand('short'), flags });
  assert.equal(onlyP.label, 'Đạt tiêu chí Short');
  assert.equal(onlyP.plan, null);
  assert.equal(onlyP.best.score, 75);
  assert.deepEqual(onlyP.gates.map((g) => g.code), ['P-G2']);
  flags = [];
  const same = finalizeSignal({ best: fakeScore('long', 80), zoneGates: zg, zoneOk: true, plan: zplan, pattern: cand('long'), flags });
  assert.equal(same.label, 'Đạt tiêu chí Long');
  assert.equal(same.plan, null);
  assert.ok(same.patternSignal);
  assert.match(flags.join(), /cùng chiều/);
  flags = [];
  const opp = finalizeSignal({ best: fakeScore('long', 80), zoneGates: zg, zoneOk: true, plan: zplan, pattern: cand('short'), flags });
  assert.equal(opp.label, 'Theo dõi');
  assert.equal(opp.plan, null);
  assert.equal(opp.patternSignal, null);
  assert.match(flags.join(), /xung đột/);
  flags = [];
  const zone = finalizeSignal({ best: fakeScore('long', 80), zoneGates: zg, zoneOk: true, plan: zplan, pattern: null, flags });
  assert.equal(zone.label, 'Đạt tiêu chí Long');
  assert.equal(zone.plan, zplan);
  assert.deepEqual(flags, []);
});

test('M2 chấm hạng lệnh vùng: grading.tp1NetR = TP1 sau phí ở giá khớp XẤU NHẤT (giá tối đa nếu vào trực tiếp)', () => {
  const a = analyze(base);
  assert.ok(a.plan !== null);
  const costFrac = COMMON.costRoundTripPct.high / 100 + Math.max(0, base.premium.lastFundingRate * (CONFIG.swing.fundingHoldHours / base.fundingIntervalHours));
  // (dữ liệu này cho lệnh limit nên giá xấu nhất = giá limit; nhánh market kiểm ở plan.test.ts — worstTp1NetR)
  assert.ok(Math.abs(a.grading.tp1NetR! - worstTp1NetR(a.plan, costFrac)!) < 1e-12);
});

test('I2: kế hoạch vi phạm bộ lọc sàn (MIN_NOTIONAL) → không hợp lệ, G-12 trượt nêu MIN_NOTIONAL, không Đạt', () => {
  const a = analyze({ ...base, contract: { ...base.contract, minNotional: 1e6 } });
  const g12 = a.gates.find((g) => g.code === 'G-12')!;
  assert.equal(g12.pass, false);
  assert.match(g12.note, /MIN_NOTIONAL/);
  assert.ok(!a.label.startsWith('Đạt'), a.label);
});

test('I2: lệnh market vượt MARKET_LOT_SIZE.maxQty → không hợp lệ, G-12 nêu MARKET_LOT_SIZE', () => {
  const a = analyze({ ...base, contract: { ...base.contract, marketMaxQty: 0.001, maxQty: 0.001 } });
  const g12 = a.gates.find((g) => g.code === 'G-12')!;
  assert.equal(g12.pass, false);
  assert.match(g12.note, /LOT_SIZE/);
});
