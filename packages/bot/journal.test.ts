import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, readdirSync, appendFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openJournal, restore, journalFileName } from './journal.ts';
import { reconcile, tradeFromPlan, legClientId, type TradeState, type ExchangeState } from './reconcile.ts';
import { planOrders, type PlannerPlan } from './planner.ts';
import { trailingFor } from '../core/exit.ts';
import type { Contract } from '../core/types.ts';
import type { SignalIdentity } from '../core/signal.ts';

const C: Contract = {
  symbol: 'AAAUSDT', baseAsset: 'AAA', onboardDate: 0, tickSize: 0.01, stepSize: 0.001, minQty: 0.001, maxQty: 100_000,
  marketMinQty: 0.001, marketMaxQty: 100_000, marketStepSize: 0.001, minNotional: 5, maxNumOrders: 200, deliveryDate: 4133894400000,
};
const NOW = Date.UTC(2026, 9, 19, 23, 59, 0); // 19/10/2026 23:59 UTC
const tmp = () => join(mkdtempSync(join(tmpdir(), 'cr-journal-')), 'nested', 'bot'); // thư mục chưa tồn tại

function clock(start = NOW) {
  let t = start;
  return { now: () => t, tick: (ms: number) => { t += ms; } };
}

// Lệnh Long market thật từ planner (vốn 100.000, 60 coin, SL 97, TP1 106)
function plannedTrade(signalId = 'AAAUSDT|swing|long|zone|1|97'): TradeState {
  const plan: PlannerPlan = {
    side: 'long', entryType: 'market', marketPrice: 100, entry: 100, maxEntry: 100.5, stop: 97, limitPrice: null, cancelIfTp1First: false,
    targets: [
      { name: 'TP1', price: 106, pct: 50, qty: 30, r: 2, reason: 't' },
      { name: 'TP2', price: null, pct: 30, qty: 0, r: null, reason: 't' },
      { name: 'TP3', price: null, pct: 20, qty: 0, r: null, reason: 't' },
    ],
    exit: { policy: 'C2', tp1Qty: 30, trailQty: 30, trailing: trailingFor('long', 100.5, 106, 3, 0.1) },
    valid: true, invalidReason: null, qty: 60, costPct: 0.1, suggestedLeverage: 5, limitExpiryHours: null, riskPct: 2, capital: 100_000,
  };
  const r = planOrders({
    plan, grade: 'A', signal: { id: signalId, fresh: true }, mode: 'swing', contract: C, capital: 100_000,
    openTrades: [], openOrderCount: 0, maxNotional: Infinity, markPrice: 100, runId: 'r1', now: NOW,
  });
  assert.equal(r.allowed, true, r.reasons.join('; '));
  return tradeFromPlan({ signalId, runId: 'r1', now: NOW, result: r, costPct: 0.1 });
}

test('tradeFromPlan: lấy đúng giá/mã client/khối lượng từ kết quả planner', () => {
  const t = plannedTrade();
  assert.equal(t.status, 'pending');
  assert.deepEqual(Object.keys(t.legs), ['E1', 'SL', 'TP1', 'TR']);
  assert.equal(t.plan.stop, 97);
  assert.equal(t.plan.tp1, 106);
  assert.equal(t.plan.activatePrice, 106);
  assert.equal(t.legs.SL!.clientId, legClientId(t, 'SL', 0));
  assert.equal(t.legs.E1!.qty, 60);
  assert.equal(t.plan.needsBreakevenFloor, false);
});

test('nhật ký: tạo thư mục khi ghi lần đầu, tên file theo ngày UTC, mỗi dòng một JSON có seq/at', () => {
  const dir = tmp();
  const ck = clock();
  const j = openJournal({ dir, now: ck.now });
  assert.equal(existsSync(dir), false, 'chưa ghi thì chưa tạo thư mục');
  j.append({ type: 'note', text: 'bật bot' });
  ck.tick(120_000); // sang ngày 20/10 UTC
  j.append({ type: 'note', text: 'ngày mới' });
  assert.deepEqual(readdirSync(dir).sort(), ['journal-2026-10-19.jsonl', 'journal-2026-10-20.jsonl']);
  assert.equal(journalFileName(NOW), 'journal-2026-10-19.jsonl');
  const line = JSON.parse(readFileSync(join(dir, 'journal-2026-10-19.jsonl'), 'utf8').trim());
  assert.deepEqual(line, { seq: 1, at: NOW, type: 'note', text: 'bật bot' });
});

test('nhật ký: khôi phục khứ hồi — lệnh (chân/trạng thái/khớp), prevSignals, cầu chì', () => {
  const dir = tmp();
  const ck = clock();
  const j = openJournal({ dir, now: ck.now });
  const t = plannedTrade();
  j.append({ type: 'signal_accepted', trade: t });
  j.append({ type: 'order_intent', signalId: t.signalId, role: 'E1', clientId: t.legs.E1!.clientId, attempt: 0, qty: 60, triggerPrice: null });
  j.append({ type: 'order_result', signalId: t.signalId, role: 'E1', clientId: t.legs.E1!.clientId, kind: 'ok', sent: true, orderId: 1001, code: null, msg: '' });
  j.append({ type: 'fill', signalId: t.signalId, role: 'E1', fill: { tradeId: 1, orderId: 1001, clientId: t.legs.E1!.clientId, symbol: C.symbol, side: 'BUY', qty: 60, price: 100.2, time: NOW } });
  j.append({ type: 'order_intent', signalId: t.signalId, role: 'SL', clientId: t.legs.SL!.clientId, attempt: 0, qty: null, triggerPrice: 97 });
  j.append({ type: 'order_result', signalId: t.signalId, role: 'SL', clientId: t.legs.SL!.clientId, kind: 'unknown_status', sent: true, orderId: null, code: -1007, msg: 'timeout' });
  j.append({ type: 'algo_update', signalId: t.signalId, role: 'TR', clientId: t.legs.TR!.clientId, algoStatus: 'NEW', activated: true, orderId: null });
  j.append({ type: 'protection_tripped', name: 'daily_loss', reason: 'lỗ ngày 10,5%' });
  j.append({ type: 'protection_tripped', name: 'loss_streak', reason: '5 lệnh thua/24h' });
  j.append({ type: 'protection_reset', name: 'loss_streak', by: 'telegram:/tieptuc' });
  const ident = (id: string): SignalIdentity => ({ id, fresh: true, held: false, kind: 'zone', side: 'long' });
  j.recordSignals(new Map([['AAAUSDT', ident('a1')], ['BBBUSDT', ident('b1')]]));
  ck.tick(60_000);
  j.recordSignals(new Map([['AAAUSDT', null]])); // AAA kết thúc; BBB không quét lần này → giữ nguyên

  const s = restore({ dir });
  assert.deepEqual(s, j.state());
  const r = s.trades[t.signalId]!;
  assert.equal(r.status, 'open');
  assert.equal(r.legs.E1!.status, 'open');
  assert.deepEqual(r.legs.E1!.orderIds, [1001]);
  assert.equal(r.legs.SL!.status, 'unknown');
  assert.equal(r.trailingActivated, true);
  assert.equal(r.fills.length, 1);
  assert.equal(r.fills[0]!.role, 'E1');
  assert.deepEqual(s.prevSignals.AAAUSDT, { id: 'a1', side: 'long', kind: 'zone', endedAt: NOW + 60_000 });
  assert.deepEqual(s.prevSignals.BBBUSDT, { id: 'b1', side: 'long', kind: 'zone', endedAt: null });
  assert.equal(s.protections.daily_loss!.tripped, true);
  assert.equal(s.protections.loss_streak!.tripped, false);
  assert.equal(s.protections.loss_streak!.resetBy, 'telegram:/tieptuc');
  // runScan cần ReadonlyMap
  assert.equal(j.prevSignalsMap().get('AAAUSDT')!.endedAt, NOW + 60_000);
  // mở lại tiếp tục số thứ tự
  const j2 = openJournal({ dir, now: ck.now });
  assert.equal(j2.append({ type: 'note', text: 'x' }).seq, s.seq + 1);
});

test('nhật ký: khớp trùng tradeId không ghi đôi; tín hiệu đã nhận không nhận lại (khử trùng theo signal.id)', () => {
  const dir = tmp();
  const j = openJournal({ dir, now: () => NOW });
  const t = plannedTrade();
  j.append({ type: 'signal_accepted', trade: t });
  assert.throws(() => j.append({ type: 'signal_accepted', trade: t }), /đã nhận/);
  const fill = { tradeId: 9, orderId: 1, clientId: t.legs.E1!.clientId, symbol: C.symbol, side: 'BUY' as const, qty: 1, price: 100, time: NOW };
  j.append({ type: 'fill', signalId: t.signalId, role: 'E1', fill });
  j.append({ type: 'fill', signalId: t.signalId, role: 'E1', fill });
  assert.equal(j.state().trades[t.signalId]!.fills.length, 1);
  assert.equal(j.hasSignal(t.signalId), true);
});

test('nhật ký: ảnh chụp + sự kiện sau đó → khôi phục đúng; chỉ còn ảnh chụp vẫn khôi phục tới mốc ảnh chụp', () => {
  const dir = tmp();
  const ck = clock();
  const j = openJournal({ dir, now: ck.now, snapshotEveryMs: 60_000 });
  const t = plannedTrade();
  j.append({ type: 'signal_accepted', trade: t });
  assert.equal(j.maybeSnapshot(), true, 'chưa có ảnh chụp → chụp');
  assert.equal(j.maybeSnapshot(), false, 'vừa chụp → chưa tới hạn');
  const atSnap = structuredClone(j.state());
  j.append({ type: 'trade_closed', signalId: t.signalId, reason: 'chạm SL' });
  assert.deepEqual(restore({ dir }), j.state());
  for (const f of readdirSync(dir)) if (f.endsWith('.jsonl')) rmSync(join(dir, f));
  assert.deepEqual(restore({ dir }), atSnap);
  ck.tick(60_000);
  assert.equal(j.maybeSnapshot(), true);
});

test('nhật ký: dòng cuối bị cắt dở → bỏ qua CÓ cảnh báo; mở lại thì cắt phần hỏng sang file .torn rồi ghi tiếp bình thường', () => {
  const dir = tmp();
  const j = openJournal({ dir, now: () => NOW });
  j.append({ type: 'note', text: 'một' });
  j.append({ type: 'note', text: 'hai' });
  const file = join(dir, journalFileName(NOW));
  appendFileSync(file, '{"seq":3,"at":1,"type":"no');
  const warns: string[] = [];
  const s = restore({ dir, warn: (m) => warns.push(m) });
  assert.equal(s.seq, 2);
  assert.equal(warns.length, 1);
  assert.match(warns[0]!, /dòng cuối/);
  const warns2: string[] = [];
  const j2 = openJournal({ dir, now: () => NOW, warn: (m) => warns2.push(m) });
  assert.ok(warns2.some((m) => /\.torn/.test(m)), warns2.join(' | '));
  assert.ok(readdirSync(dir).some((f) => f.includes('.torn')));
  j2.append({ type: 'note', text: 'ba' });
  const warns3: string[] = [];
  assert.equal(restore({ dir, warn: (m) => warns3.push(m) }).seq, 3);
  assert.deepEqual(warns3, []);
});

test('nhật ký: dòng hỏng ở GIỮA → dừng khôi phục (không im lặng bỏ qua)', () => {
  const dir = tmp();
  const j = openJournal({ dir, now: () => NOW });
  j.append({ type: 'note', text: 'một' });
  appendFileSync(join(dir, journalFileName(NOW)), 'rác\n');
  j.append({ type: 'note', text: 'hai' });
  assert.throws(() => restore({ dir }), /hỏng/);
});

test('nhật ký: ảnh chụp hỏng → cảnh báo, phát lại toàn bộ nhật ký', () => {
  const dir = tmp();
  const j = openJournal({ dir, now: () => NOW });
  j.append({ type: 'note', text: 'một' });
  j.snapshot();
  writeFileSync(join(dir, 'snapshot.json'), '{hỏng');
  const warns: string[] = [];
  assert.equal(restore({ dir, warn: (m) => warns.push(m) }).seq, 1);
  assert.equal(warns.length, 1);
});

test('nhật ký: không bao giờ ghi secret (redact) — cả nhật ký lẫn ảnh chụp', () => {
  const dir = tmp();
  const secret = 'SECRETKEY123456';
  const j = openJournal({ dir, now: () => NOW, secrets: [secret] });
  j.append({ type: 'note', text: `lỗi gửi: signature=abcdef&x-mbx-apikey: ${secret}` });
  j.snapshot();
  for (const f of readdirSync(dir)) {
    const body = readFileSync(join(dir, f), 'utf8');
    assert.equal(body.includes(secret), false, f);
    assert.equal(body.includes('abcdef'), false, f);
  }
});

test('khôi phục khứ hồi → đối chiếu: nhật ký đủ lệnh + sàn khớp → không hành động; mất SL trên sàn → đặt SL lần thử mới', () => {
  const dir = tmp();
  const j = openJournal({ dir, now: () => NOW });
  const t = plannedTrade();
  j.append({ type: 'signal_accepted', trade: t });
  let algoId = 1;
  for (const role of ['E1', 'SL', 'TP1', 'TR'] as const) {
    const leg = t.legs[role]!;
    j.append({ type: 'order_intent', signalId: t.signalId, role, clientId: leg.clientId, attempt: 0, qty: leg.qty, triggerPrice: leg.triggerPrice });
    j.append({ type: 'order_result', signalId: t.signalId, role, clientId: leg.clientId, kind: 'ok', sent: true, orderId: role === 'E1' ? 1001 : algoId++, code: null, msg: '' });
  }
  j.append({ type: 'fill', signalId: t.signalId, role: 'E1', fill: { tradeId: 1, orderId: 1001, clientId: null, symbol: C.symbol, side: 'BUY', qty: 60, price: 100, time: NOW } });
  j.append({ type: 'leg_update', signalId: t.signalId, role: 'E1', clientId: t.legs.E1!.clientId, status: 'filled' });
  const s = restore({ dir });
  const trade = s.trades[t.signalId]!;
  const algo = (role: 'SL' | 'TP1' | 'TR', qty: number, trig: number) => ({
    symbol: C.symbol, algoId: 50, clientId: trade.legs[role]!.clientId, orderType: role === 'SL' ? 'STOP_MARKET' : role === 'TP1' ? 'TAKE_PROFIT_MARKET' : 'TRAILING_STOP_MARKET',
    side: 'SELL' as const, quantity: qty, triggerPrice: trig, closePosition: role === 'SL', algoStatus: 'NEW', activated: null,
  });
  const ex: ExchangeState = {
    positions: [{ symbol: C.symbol, positionAmt: 60, entryPrice: 100, liquidationPrice: null }], openOrders: [],
    openAlgoOrders: [algo('SL', 0, 97), algo('TP1', 30, 106), algo('TR', 30, 0)], recentFills: [],
  };
  const ctx = { now: NOW, markPrices: { [C.symbol]: 101 }, filters: { [C.symbol]: C }, capital: 100_000 };
  assert.deepEqual(reconcile(Object.values(s.trades), ex, ctx), []);
  const noSl = { ...ex, openAlgoOrders: ex.openAlgoOrders.slice(1) };
  const acts = reconcile(Object.values(s.trades), noSl, ctx);
  assert.equal(acts[0]!.type, 'place_stop');
  assert.equal((acts[0] as { clientId: string }).clientId, legClientId(t, 'SL', 1));
});

test('nhật ký: stop_replace_rejected → chân BE bị từ chối + lệnh chuyển sang cancel_then_place, khôi phục giữ nguyên', () => {
  const dir = tmp();
  const j = openJournal({ dir, now: () => NOW });
  const t = plannedTrade();
  assert.equal(t.stopReplaceFallback, false);
  j.append({ type: 'signal_accepted', trade: t });
  const be = legClientId(t, 'BE', 0);
  j.append({ type: 'order_intent', signalId: t.signalId, role: 'BE', clientId: be, attempt: 0, qty: 30, triggerPrice: 100.1 });
  j.append({ type: 'stop_replace_rejected', signalId: t.signalId, role: 'BE', clientId: be, code: -4130, msg: 'closePosition existing' });
  const s = restore({ dir });
  assert.equal(s.trades[t.signalId]!.stopReplaceFallback, true);
  assert.equal(s.trades[t.signalId]!.legs.BE!.status, 'rejected');
});
