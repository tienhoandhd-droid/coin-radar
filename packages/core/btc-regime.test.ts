import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMON } from './config.ts';
import { configProblems } from './config-validate.ts';
import { withConfigOverride } from './config-override.ts';
import { regimeAction, regimeAtr, regimeCostPct, regimeExitCostPct, regimeNotional, regimeSignal, regimeSma, regimeStop, type RegimeAction } from './btc-regime.ts';
import type { Candle } from './types.ts';

// Hệ BTC theo chế độ — luật đã khóa (docs/verification/khoa-luat-mo-phong-mu-C.md). Không gọi mạng.
const DAY = 86_400_000;
const D0 = Date.UTC(2024, 0, 1);
const bar = (i: number, o: number, h: number, l: number, c: number): Candle =>
  ({ openTime: D0 + i * DAY, closeTime: D0 + (i + 1) * DAY - 1, open: o, high: h, low: l, close: c, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 });

// Chuỗi nến ngày tổng hợp tất định: bước ngẫu nhiên (LCG) có các pha tăng/giảm dài để có đủ vào/ra/chạm SL
function synthetic(n: number): Candle[] {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const out: Candle[] = [];
  let c = 30_000;
  for (let i = 0; i < n; i++) {
    const drift = Math.floor(i / 90) % 2 === 0 ? 0.004 : -0.004;
    const o = c;
    c = o * Math.exp(drift + 0.03 * (rnd() - 0.5) * 2);
    const h = Math.max(o, c) * (1 + 0.015 * rnd());
    const l = Math.min(o, c) * (1 - (rnd() < 0.04 ? 0.25 : 0.02 * rnd())); // thỉnh thoảng râu dài 25% → chạm SL
    out.push(bar(i, o, h, l, c));
  }
  return out;
}

test('mặc định COMMON.bot.modes = ["btc-regime"] (người dùng chốt 20/10/2026); configProblems("bot") chấp nhận btc-regime, chặn chế độ lạ / tham số sai luật', async () => {
  assert.deepEqual(COMMON.bot.modes, ['btc-regime']);
  assert.deepEqual(configProblems('bot'), []);
  await withConfigOverride({ 'COMMON.bot.modes': ['swing', 'btc-regime'] }, async () => assert.deepEqual(configProblems('bot'), []));
  await withConfigOverride({ 'COMMON.bot.modes': ['btc-regim'] }, async () => assert.match(configProblems('bot').join(' '), /không biết/));
  await withConfigOverride({ 'COMMON.bot.modes': [] }, async () => assert.match(configProblems('bot').join(' '), /rỗng/));
  await withConfigOverride({ 'COMMON.btcRegime.maxNotionalX': 2 }, async () => assert.match(configProblems('bot').join(' '), /maxNotionalX/));
  await withConfigOverride({ 'COMMON.btcRegime.symbol': 'ETHUSDT' }, async () => assert.match(configProblems('bot').join(' '), /chỉ cho BTCUSDT/));
});

test('SMA/ATR tính tay (n = 3): SMA cộng trực tiếp; ATR Wilder khởi tạo bằng TB TR(1..n), TR dùng giá đóng nến trước', () => {
  const b = [bar(0, 10, 11, 9, 10), bar(1, 10, 12, 10, 11), bar(2, 11, 13, 10, 12), bar(3, 12, 12, 8, 9), bar(4, 9, 10, 9, 10)];
  const s = regimeSma(b.map((x) => x.close), 3);
  assert.ok(Number.isNaN(s[1]!));
  assert.equal(s[2], 11);
  assert.equal(s[3], (11 + 12 + 9) / 3);
  const a = regimeAtr(b, 3);
  // TR(1) = max(2, |12−10|, |10−10|) = 2; TR(2) = max(3, 2, 1) = 3; TR(3) = max(4, 0, 4) = 4; TR(4) = max(1, 1, 0) = 1
  assert.ok(Number.isNaN(a[2]!));
  assert.equal(a[3], (2 + 3 + 4) / 3);
  assert.equal(a[4], (3 * 2 + 1) / 3);
});

test('tín hiệu chỉ dùng nến 1D ĐÃ ĐÓNG: nến đang chạy (closeTime ≥ now) bị bỏ dù có giá cực đoan', () => {
  const b = Array.from({ length: 60 }, (_, i) => bar(i, 100 + i, 101 + i, 99 + i, 100 + i));
  const now = b[59]!.closeTime + 1;
  const live = bar(60, 159, 10_000, 1, 1); // nến 61 chưa đóng lúc now, giá đóng tạm = 1 (nếu dùng sẽ thành 'flat')
  const s = regimeSignal([...b, live], now);
  assert.ok(s.ok);
  assert.equal(s.want, 'long');
  assert.equal(s.closeTime, b[59]!.closeTime);
  assert.equal(s.close, 159);
  assert.equal(s.sma, (110 + 159) / 2); // TB giá đóng nến 10..59
  // giá đóng = SMA → không > → đứng ngoài
  const flat = Array.from({ length: 50 }, (_, i) => bar(i, 100, 101, 99, 100));
  const f = regimeSignal(flat, flat[49]!.closeTime + 1);
  assert.ok(f.ok && f.want === 'flat');
});

test('thiếu dữ liệu → không hành động (fail closed): ít nến, nến đứt quãng, giá hỏng, không phải nến 1D', () => {
  const b = Array.from({ length: 60 }, (_, i) => bar(i, 100, 101, 99, 100));
  const now = b[59]!.closeTime + 1;
  const few = regimeSignal(b.slice(0, 49), now);
  assert.ok(!few.ok && /cần ≥ 50/.test(few.reason));
  const gap = regimeSignal([...b.slice(0, 30), ...b.slice(31)], now);
  assert.ok(!gap.ok && /đứt quãng/.test(gap.reason));
  const bad = regimeSignal(b.map((x, i) => (i === 40 ? { ...x, close: NaN } : x)), now);
  assert.ok(!bad.ok && /không hợp lệ/.test(bad.reason));
  const h4 = regimeSignal(b.map((x) => ({ ...x, closeTime: x.openTime + 4 * 3_600_000 - 1 })), now);
  assert.ok(!h4.ok);
  assert.equal(regimeAction(few, true), 'none', 'thiếu dữ liệu: không ra kể cả đang giữ');
  assert.equal(regimeAction(few, false), 'none');
});

test('máy trạng thái: muốn Long & không vị thế → vào; muốn Long & có → giữ; muốn đứng ngoài & có → ra; không có → đứng ngoài', () => {
  const on = { ok: true as const, want: 'long' as const, closeTime: 0, close: 1, sma: 1, atr: 1 };
  const off = { ...on, want: 'flat' as const };
  const table: Array<[typeof on | typeof off, boolean, RegimeAction]> = [[on, false, 'enter'], [on, true, 'hold'], [off, true, 'exit'], [off, false, 'stay_flat']];
  for (const [s, p, want] of table) assert.equal(regimeAction(s, p), want, `${s.want}/${p}`);
});

test('định cỡ: lỗ tại SL gồm 2 × phí 0,0575% + trượt 0,02% = đúng 2% vốn; giá trị ≤ 1 × vốn khi SL rất sát', () => {
  assert.equal(regimeCostPct(), 0.135);
  assert.equal(regimeExitCostPct(), 0.0775);
  const eq = 10_000;
  const entry = 60_000;
  const stop = regimeStop(entry, 1_200); // 57 000, khoảng 5%
  assert.equal(stop, 57_000);
  const n = regimeNotional({ equity: eq, entry, stop });
  const loss = n * ((entry - stop) / entry + 0.00135);
  assert.ok(Math.abs(loss - 200) < 1e-9, String(loss));
  // ATR rất nhỏ → khoảng SL 0,25% → 2% / 0,385% > 1× → bị chặn ở 1 × vốn, lỗ < 2%
  const tight = regimeNotional({ equity: eq, entry, stop: regimeStop(entry, 60) });
  assert.equal(tight, eq);
  assert.ok(tight * (150 / 60_000 + 0.00135) < 200);
  assert.equal(regimeNotional({ equity: eq, entry, stop: entry + 1 }), 0, 'SL sai phía → 0');
  assert.equal(regimeNotional({ equity: NaN, entry, stop }), 0);
});

// ---- So khớp với bộ mô phỏng tham chiếu backtest/research/btc-regime-sim.ts (GUARD=1, kind 'sma', sized=true) ----
// Bản chép NGUYÊN VĂN các dòng công thức của run() cho nhánh 'sma' + sized + GUARD (không funding: chốt chặn không siết — xem test riêng
// trong packages/bot/btc-regime.test.ts). Tệp mô phỏng đọc dữ liệu thật và tự chạy khi import nên không import được.
type T = { e: number; x: number; reason: string; qty: number; sl: number };
function simReference(b: Candle[]): T[] {
  const P = { sma: 50, atrN: 20, slAtr: 2.5, risk: 0.02, side: 0.000575, slip: 0.0002 };
  const n = b.length;
  const C = b.map((x) => x.close);
  const sma = new Array(n).fill(NaN), atr = new Array(n).fill(NaN);
  for (let i = P.sma - 1; i < n; i++) { let s = 0; for (let k = i - P.sma + 1; k <= i; k++) s += C[k]!; sma[i] = s / P.sma; }
  const tr = (m: number) => Math.max(b[m]!.high - b[m]!.low, Math.abs(b[m]!.high - b[m - 1]!.close), Math.abs(b[m]!.low - b[m - 1]!.close));
  for (let i = P.atrN; i < n; i++) {
    if (i === P.atrN) { let a = 0; for (let m = 1; m <= i; m++) a += tr(m); atr[i] = a / P.atrN; }
    else atr[i] = (atr[i - 1] * (P.atrN - 1) + tr(i)) / P.atrN;
  }
  const sig = (i: number): number => { const sm = sma[i]; return Number.isNaN(sm) ? NaN : +(b[i]!.close > sm); };
  let cash = 10000; let pos: null | { qty: number; entry: number; sl: number; eq0: number; e: number; fund: number; cost: number } = null;
  const trades: T[] = [];
  const closePos = (i: number, px: number, reason: string) => {
    const p = pos!; const c = P.side * px * p.qty; cash += p.qty * px - c;
    trades.push({ e: p.e, x: i, reason, qty: p.qty, sl: p.sl }); pos = null;
  };
  let want = 0;
  for (let i = 0; i < n; i++) {
    const o = b[i]!.open;
    if (pos && want === 0) closePos(i, o, 'tín-hiệu-tắt');
    if (!pos && want === 1) {
      const eq = cash; const entry = o;
      let qty = eq / entry, sl = 0;
      const a = atr[i - 1];
      if (Number.isFinite(a)) {
        sl = entry - P.slAtr * a; const dist = (entry - sl) / entry;
        const d2 = dist + 2 * P.side + P.slip;
        qty = Math.min(eq, (P.risk * eq) / d2) / entry;
      } else qty = 0;
      if (qty > 0) { const cost = P.side * entry * qty; cash -= entry * qty + cost; pos = { qty, entry, sl, eq0: eq, e: i, fund: 0, cost }; }
    }
    if (pos) { // GUARD
      const p = pos as { qty: number; entry: number; sl: number; eq0: number; fund: number; cost: number };
      const room = P.risk * p.eq0 - p.cost - p.fund - (P.side + P.slip) * p.sl * p.qty;
      const slMin = p.entry - room / p.qty;
      if (slMin > p.sl) p.sl = slMin;
    }
    if (pos && b[i]!.low <= (pos as { sl: number }).sl) closePos(i, Math.min((pos as { sl: number }).sl, o) * (1 - P.slip), 'SL');
    if (i === n - 1 && pos) closePos(i, b[i]!.close, 'hết-kỳ');
    const s = sig(i); want = s === 1 ? 1 : 0;
  }
  return trades;
}

// Cùng chuỗi, nhưng mọi quyết định do mã của bot: regimeSignal (chỉ nến đã đóng tới lúc quyết định) → regimeAction → regimeStop/regimeNotional.
// Khớp: vào/ra ở giá mở nến kế tiếp, SL chạm khi giá thấp ≤ SL (sàn giữ SL) — như mô phỏng.
function botDriven(b: Candle[]): T[] {
  const side = COMMON.btcRegime.sideCostPct / 100, slip = COMMON.btcRegime.slippagePct / 100;
  let cash = 10000; let pos: null | { qty: number; entry: number; sl: number; e: number } = null;
  const trades: T[] = [];
  const closePos = (i: number, px: number, reason: string) => { const p = pos!; cash += p.qty * px - side * px * p.qty; trades.push({ e: p.e, x: i, reason, qty: p.qty, sl: p.sl }); pos = null; };
  let act: RegimeAction = 'none';
  let atr = NaN;
  for (let i = 0; i < b.length; i++) {
    const o = b[i]!.open;
    if (act === 'exit' && pos) closePos(i, o, 'tín-hiệu-tắt');
    if (act === 'enter' && !pos) {
      const sl = regimeStop(o, atr);
      const notional = regimeNotional({ equity: cash, entry: o, stop: sl });
      const qty = notional / o;
      if (qty > 0) { cash -= o * qty + side * o * qty; pos = { qty, entry: o, sl, e: i }; }
    }
    if (pos && b[i]!.low <= pos.sl) closePos(i, Math.min(pos.sl, o) * (1 - slip), 'SL');
    if (i === b.length - 1 && pos) closePos(i, b[i]!.close, 'hết-kỳ');
    const s = regimeSignal(b.slice(0, i + 1), b[i]!.closeTime + 1);
    act = regimeAction(s, pos !== null);
    if (s.ok) atr = s.atr;
  }
  return trades;
}

test('SO KHỚP với btc-regime-sim.ts (GUARD=1, sma, sized): cùng chuỗi ngày tổng hợp → cùng ngày vào/ra, cùng lý do, cùng SL và khối lượng', () => {
  const b = synthetic(720);
  const ref = simReference(b);
  const bot = botDriven(b);
  assert.ok(ref.length >= 8, `chuỗi phải sinh đủ lệnh (được ${ref.length})`);
  assert.ok(ref.some((t) => t.reason === 'SL') && ref.some((t) => t.reason === 'tín-hiệu-tắt'), 'có cả chạm SL lẫn tín hiệu tắt');
  assert.ok(ref.some((t, k) => k > 0 && t.e === ref[k - 1]!.x + 1 && ref[k - 1]!.reason === 'SL'), 'có ca chạm SL rồi vào lại ở ngày kế tiếp');
  assert.deepEqual(bot.map((t) => [t.e, t.x, t.reason]), ref.map((t) => [t.e, t.x, t.reason]));
  for (let k = 0; k < ref.length; k++) {
    assert.ok(Math.abs(bot[k]!.qty / ref[k]!.qty - 1) < 1e-9, `khối lượng lệnh ${k}`);
    assert.ok(Math.abs(bot[k]!.sl / ref[k]!.sl - 1) < 1e-12, `SL lệnh ${k}`);
  }
});
