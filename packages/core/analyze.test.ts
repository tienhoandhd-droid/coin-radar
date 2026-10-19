import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, type AnalyzeInput } from './analyze.ts';
import type { Candle } from './types.ts';

function k(i: number, close: number, takerShare = 0.5): Candle {
  return { openTime: i * 1000, closeTime: i * 1000 + 999, open: close * 0.999, high: close * 1.004, low: close * 0.996,
    close, volume: 100, quoteVolume: 100 * close, takerBuyQuote: 100 * close * takerShare };
}
const up = (n: number, step: number, share = 0.5) => Array.from({ length: n }, (_, i) => k(i, 100 + i * step, share));

const base: AnalyzeInput = {
  mode: 'swing',
  contract: { symbol: 'TESTUSDT', baseAsset: 'TEST', onboardDate: Date.parse('2024-01-01'), tickSize: 0.001, stepSize: 0.001 },
  trend: up(300, 1), entry: up(500, 0.2, 0.6), daily: up(300, 1), hourly: up(100, 0.05), btcTrend: up(300, 0.3),
  regime: 'up', breakerTripped: false, liquidityRankPct: 0.05, spreadPct: 0.02,
  premium: { symbol: 'TESTUSDT', markPrice: 199.8, lastFundingRate: 0.0001, nextFundingTime: Date.parse('2026-10-19T16:00:00Z') },
  fundingIntervalHours: 8, fundingIntervalDefault: false,
  now: new Date('2026-10-19T12:00:00Z'), events: [], capital: 1000, riskPct: 0.5,
};

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

test('M2: coin rủi ro Cao/Rất cao → rủi ro 0,25% (2,5 USDT/1000), plan ghi riskPct', () => {
  const a = analyze({ ...base, daily: volatileDaily, trend: volatileDaily });
  assert.ok(a.risk.tier === 'Cao' || a.risk.tier === 'Rất cao', a.risk.tier);
  assert.ok(a.plan, a.label);
  assert.equal(a.plan.riskAmount, 2.5);
  assert.equal(a.plan.riskPct, 0.25);
  assert.ok(a.risk.notes.some((n) => /P-01/.test(n)));
});

test('M2: coin rủi ro thấp/vừa, swing → vẫn 0,5%', () => {
  const a = analyze(base);
  assert.ok(a.risk.tier === 'Thấp' || a.risk.tier === 'Vừa', a.risk.tier);
  assert.equal(a.plan?.riskAmount, 5);
  assert.equal(a.plan?.riskPct, 0.5);
});

test('M2: chế độ fast luôn không quá 0,25% dù truyền 0,5', () => {
  const a = analyze({ ...base, mode: 'fast', trend: up(500, 0.2, 0.6), btcTrend: up(500, 0.1), riskPct: 0.5 });
  const p = a.plan ?? (() => { throw new Error('không có plan: ' + a.label + JSON.stringify(a.gates.filter((g) => !g.pass))); })();
  assert.equal(p.riskPct, 0.25);
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
