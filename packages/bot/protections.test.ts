import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FUSE, PROTECTION_CONFIG,
  checkEntry, cooldownUntil, evaluateProtections, isLosingTrade, resetProtection, utcDayStart,
  type EntryCheckInput, type ProtectionInput, type TradeOutcome,
} from './protections.ts';
import { applyEvent, emptyState, type JournalEvent, type JournalEventBody, type ProtectionState } from './journal.ts';
import type { NewTrade, OpenTrade } from '../core/portfolio.ts';
import type { OrderFilters } from '../core/filters.ts';

const H = 3_600_000;
const NOW = Date.UTC(2026, 9, 20, 12, 0, 0); // 20/10/2026 12:00 UTC
const BAR15 = 15 * 60_000;

let outSeq = 0;
const out = (over: Partial<TradeOutcome> = {}): TradeOutcome => ({
  signalId: `s${outSeq++}`, symbol: 'AAAUSDT', side: 'long', closedAt: NOW - H, realizedPnl: -10, pastTp1: false, ...over,
});
const losses = (n: number, over: Partial<TradeOutcome> = {}) => Array.from({ length: n }, (_, i) => out({ signalId: `L${i}`, closedAt: NOW - (i + 1) * H, ...over }));

const base = (over: Partial<ProtectionInput> = {}): ProtectionInput => ({
  now: NOW, state: {}, outcomes: [], dayStartEquity: 10_000, equity: 10_000, equityPeak: 10_000, ...over,
});

// Áp các sự kiện vào trạng thái như nhật ký thật (khởi động lại vẫn giữ)
function applyAll(state: Record<string, ProtectionState>, bodies: JournalEventBody[], at = NOW): Record<string, ProtectionState> {
  const s = emptyState();
  s.protections = structuredClone(state);
  let seq = 0;
  for (const b of bodies) applyEvent(s, { seq: ++seq, at, ...b } as JournalEvent, () => {});
  return s.protections;
}

// ================= Cấu hình (quyết định người dùng 19/10/2026) =================
test('Cấu hình cầu chì đúng quyết định người dùng 19/10/2026', () => {
  assert.equal(PROTECTION_CONFIG.lossStreak.maxLosses, 5);
  assert.equal(PROTECTION_CONFIG.lossStreak.windowMs, 24 * H);
  assert.equal(PROTECTION_CONFIG.dailyLoss.maxLossPct, 10);
  assert.equal(PROTECTION_CONFIG.dailyLoss.dayBoundary, 'UTC');
  assert.equal(PROTECTION_CONFIG.drawdownAlert.alertPct, 30);
  assert.equal(PROTECTION_CONFIG.cooldownBars, 2);
});

// ================= Định nghĩa lệnh thua =================
test('Lệnh thua = PnL đã chốt SAU phí < 0 khi đóng hết; hòa vốn (0) và lệnh qua TP1 đóng bằng trailing ≥ hòa vốn KHÔNG thua', () => {
  assert.equal(isLosingTrade(out({ realizedPnl: -0.01 })), true);
  assert.equal(isLosingTrade(out({ realizedPnl: 0 })), false);
  assert.equal(isLosingTrade(out({ realizedPnl: 35, pastTp1: true })), false); // TP1 lời + trailing ở hòa vốn
  assert.equal(isLosingTrade(out({ realizedPnl: 0.5, pastTp1: true, side: 'short' })), false);
  assert.equal(isLosingTrade(out({ realizedPnl: Number.NaN })), true, 'PnL không đọc được → coi là thua (thận trọng)');
});

// ================= Cầu chì 5 lệnh thua / 24 giờ =================
test('5 lệnh thua trong 24 giờ trượt → cầu chì loss_streak nhảy (Long + Short lẫn lộn); 4 lệnh thì chưa', () => {
  const four = evaluateProtections(base({ outcomes: [...losses(2), ...losses(2, { side: 'short', symbol: 'BBBUSDT' }).map((o, i) => ({ ...o, signalId: `S${i}` }))] }));
  assert.deepEqual(four.events, []);
  assert.equal(four.lossesIn24h, 4);
  const five = evaluateProtections(base({ outcomes: [...losses(3), ...losses(2, { side: 'short' }).map((o, i) => ({ ...o, signalId: `S${i}` }))] }));
  assert.equal(five.events.length, 1);
  assert.deepEqual({ ...five.events[0], reason: '' }, { type: 'protection_tripped', name: FUSE.lossStreak, reason: '' });
  assert.match((five.events[0] as { reason: string }).reason, /5 lệnh thua/);
  assert.ok(five.alerts.some((a) => a.level === 'urgent'));
});

test('Lệnh thua cũ hơn 24 giờ, lệnh lời, lệnh hòa vốn không tính vào chuỗi thua', () => {
  const xs = [...losses(4), out({ signalId: 'old', closedAt: NOW - 24 * H - 1 }), out({ signalId: 'win', realizedPnl: 50 }), out({ signalId: 'be', realizedPnl: 0, pastTp1: true })];
  const r = evaluateProtections(base({ outcomes: xs }));
  assert.equal(r.lossesIn24h, 4);
  assert.deepEqual(r.events, []);
  // Đúng 24 giờ trước vẫn trong cửa sổ
  const edge = evaluateProtections(base({ outcomes: [...losses(4), out({ signalId: 'edge', closedAt: NOW - 24 * H })] }));
  assert.equal(edge.events.length, 1);
});

test('Cầu chì đã nhảy: không phát lại sự kiện; KHÔNG tự mở lại dù điều kiện đã hết (chỉ người dùng mở)', () => {
  const tripped = applyAll({}, evaluateProtections(base({ outcomes: losses(5) })).events);
  assert.equal(tripped[FUSE.lossStreak]!.tripped, true);
  assert.deepEqual(evaluateProtections(base({ state: tripped, outcomes: losses(5) })).events, []);
  // 2 ngày sau, không còn lệnh thua nào trong 24 giờ → vẫn nhảy
  const later = evaluateProtections(base({ now: NOW + 48 * H, state: tripped, outcomes: losses(5) }));
  assert.deepEqual(later.events, []);
  const blocked = checkEntry(entry({ now: NOW + 48 * H, protections: tripped }));
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reasons.join(), /loss_streak|thua/);
});

test('Người dùng mở lại: lệnh thua TRƯỚC lúc mở không tính nữa; 5 lệnh thua mới sau đó nhảy lại', () => {
  const tripped = applyAll({}, evaluateProtections(base({ outcomes: losses(5) })).events, NOW);
  const r = resetProtection({ name: FUSE.lossStreak, by: 'telegram:/tieptuc', state: tripped });
  assert.equal(r.ok, true);
  const reset = applyAll(tripped, [r.ok ? r.event : (null as never)], NOW + 1);
  assert.equal(reset[FUSE.lossStreak]!.tripped, false);
  assert.equal(reset[FUSE.lossStreak]!.resetAt, NOW + 1);
  assert.deepEqual(evaluateProtections(base({ now: NOW + 2, state: reset, outcomes: losses(5) })).events, []);
  const fresh = Array.from({ length: 5 }, (_, i) => out({ signalId: `N${i}`, closedAt: NOW + 10 + i }));
  const again = evaluateProtections(base({ now: NOW + 100, state: reset, outcomes: [...losses(5), ...fresh] }));
  assert.equal(again.events.length, 1);
  assert.equal(again.lossesIn24h, 5);
});

test('resetProtection: chỉ cầu chì chặn đã nhảy, phải có người mở; cầu chì lạ bị từ chối', () => {
  assert.equal(resetProtection({ name: FUSE.lossStreak, by: 'telegram:/tieptuc', state: {} }).ok, false);
  const st = { [FUSE.lossStreak]: { tripped: true, reason: 'x', since: NOW, resetBy: null } };
  assert.equal(resetProtection({ name: FUSE.lossStreak, by: '', state: st }).ok, false);
  assert.equal(resetProtection({ name: 'khong_co', by: 'telegram:/tieptuc', state: st }).ok, false);
});

// ================= Cầu chì lỗ ngày > 10% =================
test('utcDayStart: mốc 00:00 UTC', () => {
  assert.equal(utcDayStart(NOW), Date.UTC(2026, 9, 20));
  assert.equal(utcDayStart(Date.UTC(2026, 9, 20)), Date.UTC(2026, 9, 20));
});

test('Lỗ ngày (đã chốt + chưa chốt, so vốn đầu ngày UTC) > 10% → daily_loss nhảy; đúng 10% thì chưa', () => {
  assert.deepEqual(evaluateProtections(base({ equity: 9_000 })).events, []);
  const r = evaluateProtections(base({ equity: 8_999 }));
  assert.equal(r.events.length, 1);
  assert.equal((r.events[0] as { name: string }).name, FUSE.dailyLoss);
  assert.ok(Math.abs(r.dayLossPct - 10.01) < 1e-9);
  // Lời trong ngày không bao giờ nhảy
  assert.deepEqual(evaluateProtections(base({ equity: 12_000 })).events, []);
});

test('daily_loss: KHÔNG tự mở khi sang ngày mới; người dùng mở trong ngày → chỉ nhảy lại khi lỗ thêm > 10% từ mức lúc mở', () => {
  const tripped = applyAll({}, evaluateProtections(base({ equity: 8_800 })).events, NOW);
  // Ngày hôm sau, vốn hồi → vẫn nhảy
  assert.deepEqual(evaluateProtections(base({ now: NOW + 24 * H, state: tripped, dayStartEquity: 9_500, equity: 9_600 })).events, []);
  assert.equal(checkEntry(entry({ now: NOW + 24 * H, protections: tripped })).allowed, false);
  // Người dùng mở lúc lỗ 12% (mốc nền)
  const rejected = resetProtection({ name: FUSE.dailyLoss, by: 'telegram:/tieptuc', state: tripped });
  assert.equal(rejected.ok, false, 'mở daily_loss phải kèm mức lỗ ngày hiện tại làm mốc');
  const r = resetProtection({ name: FUSE.dailyLoss, by: 'telegram:/tieptuc', state: tripped, dayLossPct: 12 });
  assert.equal(r.ok, true);
  const reset = applyAll(tripped, [r.ok ? r.event : (null as never)], NOW + 1);
  assert.equal(reset[FUSE.dailyLoss]!.baseline, 12);
  assert.deepEqual(evaluateProtections(base({ now: NOW + 2, state: reset, equity: 8_000 })).events, []); // 20% < 12 + 10
  assert.equal(evaluateProtections(base({ now: NOW + 2, state: reset, equity: 7_790 })).events.length, 1); // 22,1% > 22
  // Ngày UTC mới: mốc nền hết hiệu lực → trở lại ngưỡng 10%
  assert.equal(evaluateProtections(base({ now: NOW + 24 * H, state: reset, dayStartEquity: 8_000, equity: 7_190 })).events.length, 1);
});

// ================= Sụt 30% từ đỉnh — chỉ cảnh báo =================
test('Sụt ≥ 30% từ đỉnh: cảnh báo MỘT lần mỗi lần vượt, KHÔNG chặn lệnh mới; hồi dưới 25% thì nạp lại', () => {
  const r1 = evaluateProtections(base({ equityPeak: 10_000, equity: 7_000, dayStartEquity: 7_000 }));
  assert.equal(r1.events.length, 1);
  assert.equal((r1.events[0] as { name: string }).name, FUSE.drawdown);
  assert.ok(r1.alerts.some((a) => /30/.test(a.text)));
  const s1 = applyAll({}, r1.events);
  assert.equal(checkEntry(entry({ protections: s1 })).allowed, true, 'sụt 30% chỉ cảnh báo');
  // Vẫn sụt → không cảnh báo lại
  const r2 = evaluateProtections(base({ state: s1, equityPeak: 10_000, equity: 6_500, dayStartEquity: 6_500 }));
  assert.deepEqual(r2.events, []);
  assert.deepEqual(r2.alerts, []);
  // Hồi về 26% → chưa nạp lại; 24% → tự nạp lại (cảnh báo không chặn gì nên được tự mở)
  assert.deepEqual(evaluateProtections(base({ state: s1, equityPeak: 10_000, equity: 7_400, dayStartEquity: 7_400 })).events, []);
  const r3 = evaluateProtections(base({ state: s1, equityPeak: 10_000, equity: 7_600, dayStartEquity: 7_600 }));
  assert.equal(r3.events.length, 1);
  assert.equal(r3.events[0]!.type, 'protection_reset');
  const s3 = applyAll(s1, r3.events);
  assert.equal(evaluateProtections(base({ state: s3, equityPeak: 10_000, equity: 6_900, dayStartEquity: 6_900 })).events.length, 1);
});

test('Cầu chì chặn (loss_streak, daily_loss) không bao giờ được tự mở bởi evaluateProtections', () => {
  const st = {
    [FUSE.lossStreak]: { tripped: true, reason: 'x', since: NOW - H, resetBy: null },
    [FUSE.dailyLoss]: { tripped: true, reason: 'y', since: NOW - H, resetBy: null },
  };
  for (const now of [NOW, NOW + 24 * H, NOW + 30 * 24 * H]) {
    const r = evaluateProtections(base({ now, state: st, equity: 20_000, dayStartEquity: 10_000, equityPeak: 20_000 }));
    assert.equal(r.events.filter((e) => e.type === 'protection_reset').length, 0);
  }
});

// ================= Cổng vào lệnh =================
const F: OrderFilters = { stepSize: 0.001, minQty: 0.001, maxQty: 10_000, marketMinQty: 0.001, marketMaxQty: 10_000, marketStepSize: 0.001, minNotional: 5, maxNumOrders: 200 };
const nt = (over: Partial<NewTrade> = {}): NewTrade => ({ symbol: 'AAAUSDT', side: 'long', entry: 100, stop: 98, qty: 100, leverage: 5, costPct: 0, entryType: 'market', filters: F, maxNotional: Infinity, ...over });
const opens = (n: number, over: Partial<OpenTrade> = {}): OpenTrade[] => Array.from({ length: n }, (_, i) => ({ symbol: `X${i}USDT`, side: 'long', notional: 1000, leverage: 5, riskAmount: 50, pastTp1: false, ...over }));
function entry(over: Partial<EntryCheckInput> = {}): EntryCheckInput {
  return {
    now: NOW, barMs: BAR15, signal: { symbol: 'AAAUSDT', side: 'long', grade: 'A', fresh: true }, protections: {}, recentCloses: [],
    newTrade: nt(), openTrades: [], capital: 10_000, ...over,
  };
}

test('checkEntry: Hạng A + MỚI + không cầu chì + danh mục trống → cho vào (Long và Short)', () => {
  const l = checkEntry(entry());
  assert.equal(l.allowed, true, l.reasons.join('; '));
  assert.equal(l.canOpen?.adjustedQty, 100);
  const s = checkEntry(entry({ signal: { symbol: 'AAAUSDT', side: 'short', grade: 'A', fresh: true }, newTrade: nt({ side: 'short', stop: 102 }) }));
  assert.equal(s.allowed, true, s.reasons.join('; '));
});

test('checkEntry: chỉ Hạng A MỚI — Hạng B, chưa chấm hạng, tín hiệu cũ đều bị chặn', () => {
  for (const sig of [
    { grade: 'B' as const, fresh: true }, { grade: null, fresh: true }, { grade: 'A' as const, fresh: false },
  ]) {
    const r = checkEntry(entry({ signal: { symbol: 'AAAUSDT', side: 'long', ...sig } }));
    assert.equal(r.allowed, false, JSON.stringify(sig));
  }
});

test('checkEntry: tín hiệu khác mã/chiều với lệnh định mở → lỗi lập trình, chặn', () => {
  const r = checkEntry(entry({ newTrade: nt({ symbol: 'BBBUSDT' }) }));
  assert.equal(r.allowed, false);
  const s = checkEntry(entry({ signal: { symbol: 'AAAUSDT', side: 'short', grade: 'A', fresh: true } }));
  assert.equal(s.allowed, false);
});

test('Cooldown: cùng cặp + cùng chiều bị chặn tới khi đủ 2 nến khung vào lệnh ĐÓNG sau lúc đóng lệnh', () => {
  const closedAt = Date.UTC(2026, 9, 20, 11, 20, 0); // giữa nến 11:15–11:30
  // Nến trọn vẹn đầu tiên sau lúc đóng: 11:30–11:45; thứ hai 11:45–12:00 → mở lại từ 12:00
  assert.equal(cooldownUntil(closedAt, BAR15, 2), Date.UTC(2026, 9, 20, 12, 0, 0));
  const closes = [out({ symbol: 'AAAUSDT', side: 'long', closedAt })];
  const at = (now: number, side: 'long' | 'short' = 'long', symbol = 'AAAUSDT') => checkEntry(entry({
    now, recentCloses: closes, signal: { symbol, side, grade: 'A', fresh: true },
    newTrade: nt({ symbol, side, stop: side === 'long' ? 98 : 102 }),
  })).allowed;
  assert.equal(at(Date.UTC(2026, 9, 20, 11, 45, 0)), false);
  assert.equal(at(Date.UTC(2026, 9, 20, 11, 59, 59)), false);
  assert.equal(at(Date.UTC(2026, 9, 20, 12, 0, 0)), true);
  // Chiều ngược lại / mã khác không bị cooldown
  assert.equal(at(Date.UTC(2026, 9, 20, 11, 45, 0), 'short'), true);
  assert.equal(at(Date.UTC(2026, 9, 20, 11, 45, 0), 'long', 'BBBUSDT'), true);
  // Đóng đúng mốc nến: 2 nến trọn sau đó
  assert.equal(cooldownUntil(Date.UTC(2026, 9, 20, 11, 30, 0), BAR15, 2), Date.UTC(2026, 9, 20, 12, 0, 0));
  // Cooldown Short
  const sc = [out({ side: 'short', closedAt })];
  assert.equal(checkEntry(entry({ now: Date.UTC(2026, 9, 20, 11, 50), recentCloses: sc, signal: { symbol: 'AAAUSDT', side: 'short', grade: 'A', fresh: true }, newTrade: nt({ side: 'short', stop: 102 }) })).allowed, false);
});

test('checkEntry: trần danh mục qua canOpen — 10 lệnh còn rủi ro thì chặn; lệnh đã qua TP1 không tính; tổng rủi ro mở ≤ 10% giảm khối lượng', () => {
  const ten = checkEntry(entry({ openTrades: opens(10) }));
  assert.equal(ten.allowed, false);
  assert.match(ten.reasons.join(), /10 lệnh còn rủi ro/);
  const past = opens(3, { pastTp1: true, riskAmount: 0 }).map((t, i) => ({ ...t, symbol: `P${i}USDT` }));
  assert.equal(checkEntry(entry({ openTrades: [...opens(9), ...past] })).allowed, true);
  // Đã mở 9% rủi ro (9 × 100 USDT trên vốn 10.000) → chỉ còn 1% = 100 USDT → 50 coin thay vì 100
  const cut = checkEntry(entry({ openTrades: opens(9, { riskAmount: 100 }) }));
  assert.equal(cut.allowed, true);
  assert.equal(cut.canOpen?.adjustedQty, 50);
  assert.ok(cut.reasons.some((r) => /rủi ro mở/.test(r)));
});

test('checkEntry: cầu chì daily_loss / loss_streak nhảy → chặn lệnh MỚI', () => {
  for (const name of [FUSE.dailyLoss, FUSE.lossStreak]) {
    const r = checkEntry(entry({ protections: { [name]: { tripped: true, reason: 'x', since: NOW, resetBy: null } } }));
    assert.equal(r.allowed, false, name);
    assert.equal(r.canOpen, null);
  }
});

test('Protections chỉ chặn lệnh MỚI: đầu ra không bao giờ chứa lệnh hủy/đóng/đặt (chỉ sự kiện cầu chì + cảnh báo)', () => {
  const r = evaluateProtections(base({ outcomes: losses(7), equity: 6_000, equityPeak: 10_000 }));
  assert.ok(r.events.length >= 3);
  for (const e of r.events) assert.ok(e.type === 'protection_tripped' || e.type === 'protection_reset', e.type);
  assert.deepEqual(Object.keys(r).sort(), ['alerts', 'dayLossPct', 'drawdownPct', 'events', 'lossesIn24h']);
});

test('Trần lỗ ngày của cấu hình live (chặt hơn) được dùng khi truyền vào; không bao giờ nới quá 10%', () => {
  assert.equal(evaluateProtections(base({ equity: 9_400, maxDailyLossPct: 5 })).events.length, 1);
  assert.deepEqual(evaluateProtections(base({ equity: 8_500, maxDailyLossPct: 50 })).events.map((e) => e.type), ['protection_tripped']);
  assert.deepEqual(evaluateProtections(base({ equity: 9_100, maxDailyLossPct: 50 })).events, []);
});

test('checkEntry với trần live: vốn bot, đòn bẩy, số lệnh còn rủi ro vượt trần live → chặn', () => {
  const caps = { maxCapitalUsdt: 5_000, maxLeverage: 3, maxDailyLossPct: 10, maxOpenTrades: 2, riskPerTradePct: 2 };
  assert.match(checkEntry(entry({ liveCaps: caps })).reasons.join(), /vốn bot/i);
  assert.match(checkEntry(entry({ liveCaps: { ...caps, maxCapitalUsdt: 20_000 } })).reasons.join(), /đòn bẩy/i);
  assert.match(checkEntry(entry({ liveCaps: { ...caps, maxCapitalUsdt: 20_000, maxLeverage: 5 }, openTrades: opens(2) })).reasons.join(), /lệnh/);
  assert.equal(checkEntry(entry({ liveCaps: { ...caps, maxCapitalUsdt: 20_000, maxLeverage: 5 } })).allowed, true);
});
