// Bộ mô phỏng lệnh (kế hoạch 2, Task 3) — phần LÕI THUẦN: một lệnh đi qua chuỗi nến (khớp vào, SL, TP1, trailing, phí, trượt giá,
// funding, dừng theo thời gian, thanh lý) + sổ vốn (cầu chì người dùng) + thống kê. Vòng lặp theo sự kiện trên kỳ D và CLI ở
// backtest/simulate-run.ts. Lệnh lấy từ planner của bot (packages/bot/planner.ts) — KHÔNG tự định cỡ/đặt giá lại.
//
// MÔ HÌNH (xấp xỉ — ghi rõ để đọc kết quả đúng):
//  1. Giá kích hoạt SL/TP/trailing trên sàn là giá MARK; mô phỏng dùng giá giao dịch của nến (5m nếu có trong bộ đệm, không thì 15m,
//     không thì 1H). Chênh mark − last bị bỏ qua (thường < 0,1%, lớn hơn lúc biến động mạnh).
//  2. Chi phí mỗi lần khớp (vào hoặc ra) = costRoundTripPct[nhóm thanh khoản]/2 % notional (phí + trượt giá nền, KHÔNG tách phí sàn
//     vì repo chưa có nguồn phí chính thức; áp cả cho lệnh limit — thận trọng) + trượt theo cỡ lệnh (I7, COMMON.slippage):
//     biên trượt tuyến tính theo notional đã khớp — tại notional N biên = pctPerParticipation% × N / KL1phút; trượt TB = nửa biên
//     = đúng nửa mức khứ hồi của sizeSlippagePct (margin.ts). Trượt theo cỡ chỉ áp lệnh khớp kiểu market (IOC, SL, TP, trailing,
//     đóng theo thời gian), làm giá khớp xấu đi. KL1phút = TB quoteVolume 24 nến 1H đã đóng lúc vào lệnh ÷ 60, giữ cố định cả lệnh.
//  3. Chân "market" = LIMIT IOC giá trần (planner): khớp ở giá MỞ nến đầu tiên từ lúc đặt; chỉ khớp phần có biên trượt ≤ giá trần
//     (phần còn lại hủy) → khớp một phần khi trượt theo cỡ chạm trần; giá mở đã vượt trần → không khớp.
//  4. Limit chỉ khớp khi giá thật sự chạm (Long: low ≤ limit) trong hạn; mở cửa đã vượt qua limit → khớp ở giá mở (tốt hơn).
//     Hủy nếu giá chạm TP1 trước (cancelIfMarkReaches của planner). Vị thế đóng hết → hủy chân vào còn chờ (bot hủy lệnh mồ côi).
//  5. Trong một nến: nếu thứ tự sự kiện đổi kết quả (phía bất lợi: SL/trailing/khớp limit; phía có lợi: TP/kích hoạt/đỉnh mới/hủy
//     limit) → xuống nến nhỏ hơn (1m) để phân xử; không phân xử được → BẤT LỢI TRƯỚC (SL trước TP; limit chờ: hủy trước khi khớp)
//     và đếm. Gap: mở cửa đã vượt SL → khớp ở giá mở (trừ trượt). Giá mở luôn là sự kiện đầu tiên của nến.
//  6. C2 (mặc định, người dùng chốt): TP1 50% (TAKE_PROFIT_MARKET) + 50% trailing (TRAILING_STOP_MARKET kích hoạt tại TP1, callback
//     của planner/exit.ts): dừng = đỉnh sau kích hoạt × (1 − callback) Long (đối xứng Short); SL gốc (closePosition) vẫn còn;
//     dừng sàn hòa vốn BE khi planner đặt. A0 (đối chứng): TP1/TP2/TP3 50/30/20; sau TP1 dời SL (vùng: về giá khớp thật; mô hình:
//     đường phá ∓ 0,5×A hoặc giá khớp theo afterTp1Rule); phần không có giá TP → trailing 3×ATR từ đỉnh (bot tự quản).
//  7. Funding thật từng kỳ (data/cache/funding): mỗi kỳ chốt khi vị thế đang mở (khớp TRƯỚC giờ chốt): −dấu × KL × markPrice × rate
//     (Long trả khi rate > 0). Giờ chốt làm tròn xuống phút (sàn ghi lệch vài ms).
//  8. Dừng theo thời gian (plan-print): chưa đạt +1R (đỉnh có lợi ≥ giá vào TB + 1R) sau timeStopHours → đóng ở giá mở nến kế tiếp;
//     giữ tối đa maxHoldHours. Thanh lý: giá thanh lý isolated ước tính (plan.ts) — giá mở gap qua nó thì mất đúng ký quỹ (đóng ở giá
//     phá sản) và gắn cờ (không nên xảy ra: planner giữ thanh lý cách SL ≥ 1 khoảng cắt lỗ).
//  9. 1R = rủi ro định cỡ của planner cho khối lượng đã khớp (sizing.riskModel, không gồm đệm funding): |giá xấu nhất − SL| + phí nhóm
//     hai chiều (vào ở giá xấu nhất, ra ở giá SL) + trượt theo cỡ → chạm SL đủ ở giá xấu nhất = −1R. Lãi lỗ USDT/% vốn là số thật.
// 10. Thiên lệch đã biết (rà soát Task 3): lệnh limit (maker) vẫn trả nửa phí nhóm (gồm phần trượt) → BẤT LỢI ~0,05R/lệnh ở Lướt nhanh;
//     limit khớp khi low = đúng giá limit (ràng buộc toàn cục) → LẠC QUAN về hàng chờ. Nến khớp limit giữa chừng: bỏ phía trên của nến đó.
// 11. Mốc thời gian sự kiện trong nến = openTime của nến (hoặc nến 1m khi phân xử) — cầu chì/lỗ ngày có thể "bắt đầu" tại mốc đặt lệnh
//     khi lần thua thứ 5 xảy ra ngay trong nến đầu tiên của lệnh vừa đặt.
import { COMMON, CONFIG } from '../packages/core/config.ts';
import { snapToTick, tickDecimals } from '../packages/core/price.ts';
import { liquidationPrice, mmrFor, splitQuantity } from '../packages/core/plan.ts';
import { fundingGuard } from '../packages/core/funding-guard.ts';
import { atr } from '../packages/core/indicators.ts';
import { exitSplit, type PlannerPlan, type PlannerResult } from '../packages/bot/planner.ts';
import type { ExitPolicy } from '../packages/core/exit.ts';
import type { OpenTrade } from '../packages/core/portfolio.ts';
import type { AfterTp1Rule } from '../packages/core/patterns/pattern-plan.ts';
import type { Candle, Contract, Mode, Side } from '../packages/core/types.ts';
import type { FundingRow } from './replay.ts';

const HOUR = 3_600_000;
const DAY = 86_400_000;

export type SimCost = {
  tierPct: number; // COMMON.costRoundTripPct[nhóm] — khứ hồi; mỗi lần khớp trả một nửa
  impactPct: number; // COMMON.slippage.pctPerParticipation — biên trượt (%) khi notional = KL 1 phút
  vol1m: number; // KL giao dịch 1 phút (USDT); Infinity = bỏ trượt theo cỡ (chỉ dùng trong test)
};

export type TrailState = { kind: 'callback'; actX: number; cbPct: number; peakX: number | null } | { kind: 'atr'; dist: number }
  | { kind: 'close4h'; levelX: number | null }; // C3: mức dừng chỉ đổi khi nến 4H ĐÓNG (bot đặt lại STOP_MARKET), giữa nến là dừng tĩnh
export type Part = { name: 'TP1' | 'TP2' | 'TP3' | 'TR'; qty: number; targetX: number | null; trail: TrailState | null; open: boolean };
export type EntryLeg = {
  role: 'E1' | 'E2'; ioc: boolean; limitX: number; qty: number; expireAt: number | null; cancelX: number | null;
  status: 'pending' | 'filled' | 'partial' | 'nofill' | 'cancelled' | 'expired'; filledQty: number; fillPrice: number | null; fillTime: number | null;
};

// Phần trạng thái được sao chép khi thử thứ tự sự kiện trong một nến (giá ở KHÔNG GIAN x = dấu × giá: Long +p, Short −p → luôn
// "lên là có lợi", một bộ luật cho cả hai chiều).
type State = {
  legs: EntryLeg[]; parts: Part[]; posQty: number; avgX: number; stopX: number; floorX: number | null; tp1Done: boolean;
  peakX: number | null; troughX: number | null;
  tp1At: number | null; maxCloseX: number | null; // C3: lúc TP1 khớp, đỉnh đóng 4H từ đó
};

export type Exit = { role: string; qty: number; price: number; time: number };
export type Flags = {
  gap: boolean; resolvedBars: number; unresolvedBars: number; unresolvedTrailing: number; iocPartial: boolean; liquidation: boolean;
  limitCancelledUnresolved: number;
  fundingGuardTightened: number; fundingGuardClosed: number; // F1: chốt chặn funding khi chạy (siết SL / đóng)
};
export type AfterTp1 = { rule: AfterTp1Rule; ruleIfMarketOnly: AfterTp1Rule | null } | null;
export type TradeMeta = { grade: string | null; label: string; kind: 'zone' | 'pattern'; score: number; signalId: string; key: string; afterTp1: AfterTp1 };
// Định cỡ của planner: rủi ro dự kiến (% vốn, ở giá khớp xấu nhất) + lý do giảm khối lượng (nếu có)
export type Sizing = { plannedRiskPct: number; requestedQty: number; qty: number; notes: string[] };

export type SimTrade = {
  k: {
    id: string; symbol: string; mode: Mode; side: Side; d: 1 | -1; policy: ExitPolicy; placedAt: number; equityAtEntry: number;
    tick: number; qStep: number; leverage: number; costPct: number; cost: SimCost; pathInterval: string; meta: TradeMeta;
    initialStopX: number; tp1X: number; actX: number; cbPct: number; beX: number | null; tp2X: number | null; tp3X: number | null;
    trailAtr: number; timeStopMs: number; maxHoldMs: number; entryType: PlannerPlan['entryType']; sizing: Sizing;
    riskModel: { a: number; b: number; fundingPerUnit: number }; // từ planner: rủi ro(q) = q·a + q²·b
  };
  s: State;
  b: {
    gross: number; costs: number; funding: number; exits: Exit[]; flows: Array<{ t: number; amount: number }>;
    firstFillAt: number | null; maxPosQty: number; entryNotional: number; nextT: number; lastFundingT: number; h4Idx: number;
    closedAt: number | null; reason: string | null; flags: Flags; liqX: number | null;
  };
};

const roundPx = (x: number) => Number(x.toPrecision(12));
const toX = (d: number, p: number) => d * p;

export function createTrade(a: {
  id: string; symbol: string; mode: Mode; policy: ExitPolicy; placedAt: number; equityAtEntry: number; contract: Contract;
  plan: PlannerPlan; planner: PlannerResult; cost: SimCost; pathInterval: string; meta: TradeMeta;
}): SimTrade {
  const pr = a.planner;
  if (!pr.allowed || pr.sizing === null) throw new Error(`createTrade ${a.symbol}: planner không cho vào (${pr.reasons.join('; ')})`);
  const side = a.plan.side;
  const d = side === 'long' ? 1 : -1;
  const sl = pr.legs.find((l) => l.op === 'placeStopLoss' && l.role === 'SL');
  const tp = pr.legs.find((l) => l.op === 'placeTakeProfit');
  const tr = pr.legs.find((l) => l.op === 'placeTrailing');
  const be = pr.legs.find((l) => l.op === 'placeStopLoss' && l.role === 'BE');
  if (sl?.op !== 'placeStopLoss' || tp?.op !== 'placeTakeProfit' || tr?.op !== 'placeTrailing') throw new Error(`createTrade ${a.symbol}: planner thiếu SL/TP1/trailing`);
  const legs: EntryLeg[] = pr.legs.flatMap((l): EntryLeg[] => {
    if (l.op !== 'placeEntry' || l.input.kind !== 'limit') return [];
    return [{
      role: l.role, ioc: l.input.ioc === true, limitX: toX(d, l.input.limitPrice), qty: l.input.qty, expireAt: l.input.expireAt ?? null,
      cancelX: l.cancelIfMarkReaches === null ? null : toX(d, l.cancelIfMarkReaches), status: 'pending', filledQty: 0, fillPrice: null, fillTime: null,
    }];
  });
  const away = side === 'long' ? 'down' : 'up';
  const tgt = (i: number) => {
    const p = a.plan.targets[i]?.price ?? null;
    return p === null ? null : toX(d, snapToTick(p, a.contract.tickSize, away));
  };
  const trailAtr = 'trailAtr' in a.plan && typeof (a.plan as { trailAtr?: unknown }).trailAtr === 'number' ? (a.plan as { trailAtr: number }).trailAtr : NaN;
  const cfg = CONFIG[a.mode];
  return {
    k: {
      id: a.id, symbol: a.symbol, mode: a.mode, side, d, policy: a.policy, placedAt: a.placedAt, equityAtEntry: a.equityAtEntry,
      tick: a.contract.tickSize, qStep: pr.exitRule.qtyStep, leverage: pr.sizing.leverage, costPct: a.plan.costPct, cost: a.cost,
      pathInterval: a.pathInterval, meta: a.meta,
      initialStopX: toX(d, sl.input.triggerPrice), tp1X: toX(d, tp.input.triggerPrice), actX: toX(d, tr.input.activatePrice), cbPct: tr.input.callbackPct,
      beX: be?.op === 'placeStopLoss' ? toX(d, be.input.triggerPrice) : null, tp2X: tgt(1), tp3X: tgt(2), trailAtr,
      timeStopMs: cfg.timeStopHours * HOUR, maxHoldMs: cfg.maxHoldHours * HOUR, entryType: a.plan.entryType,
      sizing: { plannedRiskPct: pr.sizing.realRiskPct, requestedQty: pr.sizing.requestedQty, qty: pr.sizing.qty, notes: pr.reasons },
      riskModel: { a: pr.sizing.riskModel.a, b: pr.sizing.riskModel.b, fundingPerUnit: pr.sizing.riskModel.fundingPerUnit },
    },
    s: { legs, parts: [], posQty: 0, avgX: 0, stopX: toX(d, sl.input.triggerPrice), floorX: null, tp1Done: false, peakX: null, troughX: null, tp1At: null, maxCloseX: null },
    b: {
      gross: 0, costs: 0, funding: 0, exits: [], flows: [], firstFillAt: null, maxPosQty: 0, entryNotional: 0, nextT: a.placedAt, lastFundingT: a.placedAt, h4Idx: 0,
      closedAt: null, reason: null, flags: { gap: false, resolvedBars: 0, unresolvedBars: 0, unresolvedTrailing: 0, iocPartial: false, liquidation: false, limitCancelledUnresolved: 0,
        fundingGuardTightened: 0, fundingGuardClosed: 0 },
      liqX: null,
    },
  };
}

// ---------------------------------------------------------------- khối lượng & giá ----------------------------------------------
const qRound = (tr: SimTrade, q: number) => Number(q.toFixed(tickDecimals(tr.k.qStep)));
const floorQ = (tr: SimTrade, q: number) => (q > 0 && Number.isFinite(q) ? qRound(tr, Math.floor(q / tr.k.qStep + 1e-9) * tr.k.qStep) : 0);
// trượt TB một chiều (phần giá) cho notional N khớp kiểu market: nửa biên tuyến tính
const avgImpact = (c: SimCost, notional: number) => (Number.isFinite(c.vol1m) ? ((c.impactPct / 100) * notional) / c.vol1m / 2 : 0);
const realPx = (tr: SimTrade, x: number) => tr.k.d * x;

export const isDone = (tr: SimTrade) => tr.b.closedAt !== null;

function rebuildParts(tr: SimTrade, s: State): void {
  const k = tr.k;
  if (k.policy === 'C2') {
    const { tp1Qty, trailQty } = exitSplit(s.posQty, k.qStep);
    s.parts = [
      { name: 'TP1' as const, qty: tp1Qty, targetX: k.tp1X, trail: null, open: true },
      { name: 'TR' as const, qty: trailQty, targetX: null, trail: { kind: 'callback' as const, actX: k.actX, cbPct: k.cbPct, peakX: null }, open: true },
    ].filter((p) => p.qty > 0);
    return;
  }
  if (k.policy === 'C3') {
    const p = COMMON.exitC3.tp1Pct;
    const [tp1Qty, trailQty] = splitQuantity(s.posQty, k.qStep, [p, 100 - p]);
    s.parts = [
      { name: 'TP1' as const, qty: tp1Qty!, targetX: k.tp1X, trail: null, open: true },
      { name: 'TR' as const, qty: trailQty!, targetX: null, trail: { kind: 'close4h' as const, levelX: null }, open: true },
    ].filter((x) => x.qty > 0);
    return;
  }
  const q = splitQuantity(s.posQty, k.qStep, COMMON.zones.exitPcts);
  const xs = [k.tp1X, k.tp2X, k.tp3X];
  const names = ['TP1', 'TP2', 'TP3'] as const;
  s.parts = names.map((name, i) => ({
    name, qty: q[i]!, targetX: xs[i]!, open: true,
    trail: xs[i] === null ? { kind: 'atr' as const, dist: k.trailAtr } : null,
  })).filter((p) => p.qty > 0);
}

function sharedStop(s: State): number {
  return s.tp1Done && s.floorX !== null ? Math.max(s.stopX, s.floorX) : s.stopX;
}

function trailLevel(tr: SimTrade, s: State, p: Part): number {
  const t = p.trail;
  if (t === null) return -Infinity;
  if (t.kind === 'callback') {
    if (t.peakX === null) return -Infinity;
    return roundPx(tr.k.d > 0 ? t.peakX * (1 - t.cbPct / 100) : t.peakX * (1 + t.cbPct / 100));
  }
  if (t.kind === 'close4h') return t.levelX ?? -Infinity;
  if (!Number.isFinite(t.dist) || s.peakX === null) return -Infinity;
  return s.peakX - t.dist;
}

const partStop = (tr: SimTrade, s: State, p: Part) => Math.max(sharedStop(s), trailLevel(tr, s, p));

type Ev = { level: number; kind: 'part'; part: Part } | { level: number; kind: 'leg'; leg: EntryLeg } | { level: number; kind: 'liq' }
  | { level: number; kind: 'target'; part: Part } | { level: number; kind: 'activate'; part: Part } | { level: number; kind: 'cancel'; leg: EntryLeg };

function lowEvents(tr: SimTrade, s: State): Ev[] {
  const out: Ev[] = [];
  if (s.posQty > 0) {
    for (const p of s.parts) if (p.open) out.push({ level: partStop(tr, s, p), kind: 'part', part: p });
    if (tr.b.liqX !== null) out.push({ level: tr.b.liqX, kind: 'liq' });
  }
  for (const l of s.legs) if (l.status === 'pending' && !l.ioc) out.push({ level: l.limitX, kind: 'leg', leg: l });
  return out;
}

function highEvents(s: State): Ev[] {
  const out: Ev[] = [];
  if (s.posQty > 0) {
    for (const p of s.parts) {
      if (!p.open) continue;
      if (p.targetX !== null) out.push({ level: p.targetX, kind: 'target', part: p });
      if (p.trail?.kind === 'callback' && p.trail.peakX === null) out.push({ level: p.trail.actX, kind: 'activate', part: p });
    }
  }
  for (const l of s.legs) if (l.status === 'pending' && !l.ioc && l.cancelX !== null) out.push({ level: l.cancelX, kind: 'cancel', leg: l });
  return out;
}

// --------------------------------------------------------------- khớp / đóng ------------------------------------------------------
function fillEntry(tr: SimTrade, s: State, leg: EntryLeg, qty: number, priceX: number, t: number, rec: boolean): void {
  if (!(qty > 0)) return;
  const n = qRound(tr, s.posQty + qty);
  s.avgX = (s.avgX * s.posQty + priceX * qty) / n;
  s.posQty = n;
  leg.filledQty = qRound(tr, leg.filledQty + qty);
  leg.fillPrice = roundPx(realPx(tr, priceX));
  leg.fillTime = t;
  leg.status = leg.filledQty < leg.qty ? 'partial' : 'filled';
  if (!s.tp1Done) rebuildParts(tr, s);
  else {
    const last = [...s.parts].reverse().find((p) => p.open);
    if (last) last.qty = qRound(tr, last.qty + qty);
  }
  if (s.peakX === null || priceX > s.peakX) s.peakX = Math.max(s.peakX ?? -Infinity, priceX);
  if (s.troughX === null || priceX < s.troughX) s.troughX = Math.min(s.troughX ?? Infinity, priceX);
  if (!rec) return;
  const b = tr.b;
  const px = realPx(tr, priceX);
  // #1 (tùy chọn COMMON.fees.makerTakerSplit): lệnh LIMIT chờ khớp = maker, chỉ phí maker; chân IOC giữ nửa phí nhóm (taker + trượt nền)
  const cost = !leg.ioc && COMMON.fees.makerTakerSplit ? (qty * px * COMMON.fees.makerPct) / 100 : (qty * px * tr.k.cost.tierPct) / 200;
  b.costs += cost;
  b.flows.push({ t, amount: -cost });
  b.firstFillAt ??= t;
  b.maxPosQty = Math.max(b.maxPosQty, s.posQty);
  b.entryNotional += qty * px;
  const avg = realPx(tr, s.avgX);
  const liq = liquidationPrice(avg, tr.k.leverage, tr.k.side, mmrFor(s.posQty * avg).mmr);
  b.liqX = toX(tr.k.d, liq);
}

// Đóng qty ở mức giá x (chưa trượt) — lệnh kiểu market: trừ trượt theo cỡ
function exitQty(tr: SimTrade, s: State, qty: number, levelX: number, t: number, role: string, rec: boolean, impact = true): void {
  if (!(qty > 0)) return;
  const px0 = realPx(tr, levelX);
  const xExec = roundPx(levelX - (impact ? Math.abs(px0) * avgImpact(tr.k.cost, qty * px0) : 0));
  s.posQty = qRound(tr, s.posQty - qty);
  if (!rec) return;
  const b = tr.b;
  const px = realPx(tr, xExec);
  const pnl = (xExec - s.avgX) * qty;
  const cost = (qty * px * tr.k.cost.tierPct) / 200;
  b.gross += pnl;
  b.costs += cost;
  b.flows.push({ t, amount: pnl - cost });
  b.exits.push({ role, qty, price: roundPx(px), time: t });
}

function closePart(tr: SimTrade, s: State, p: Part, levelX: number, t: number, role: string, rec: boolean): void {
  p.open = false;
  exitQty(tr, s, Math.min(p.qty, s.posQty), levelX, t, role, rec);
}

function stopRole(tr: SimTrade, s: State, p: Part): string {
  const shared = sharedStop(s);
  if (trailLevel(tr, s, p) > shared) return p.trail?.kind === 'atr' ? 'TRA' : 'TR';
  if (s.tp1Done && s.floorX !== null && s.floorX > s.stopX) return tr.k.policy === 'A0' ? 'A1' : 'BE';
  return 'SL';
}

function onTp1(tr: SimTrade, s: State, t: number): void {
  s.tp1Done = true;
  s.tp1At = t;
  const k = tr.k;
  if (k.policy === 'C2') { s.floorX = k.beX; return; }
  // C3: sàn hòa vốn = giá vào TB + phí khứ hồi nhóm (không gian x: luôn "lên là có lợi")
  if (k.policy === 'C3') { s.floorX = s.avgX + Math.abs(s.avgX) * (k.cost.tierPct / 100); return; }
  // A0: dời SL sau TP1 — vùng: về giá khớp thật; mô hình: theo afterTp1Rule của kế hoạch (đường phá ∓ 0,5×A nếu khớp gần đường phá)
  const avg = realPx(tr, s.avgX);
  const fillStop = snapToTick(avg, k.tick, k.d > 0 ? 'up' : 'down');
  const at = k.meta.afterTp1;
  if (at === null) { s.floorX = toX(k.d, fillStop); return; }
  const both = s.legs.every((l) => l.filledQty > 0);
  const rule = !both && at.ruleIfMarketOnly !== null ? at.ruleIfMarketOnly : at.rule;
  const near = k.d * (rule.threshold - avg) > 0;
  s.floorX = toX(k.d, near ? rule.nearStop : fillStop);
}

function applyLow(tr: SimTrade, s: State, e: Ev, priceX: number, t: number, rec: boolean): void {
  if (e.kind === 'leg') { fillEntry(tr, s, e.leg, e.leg.qty - e.leg.filledQty, priceX, t, rec); return; }
  if (e.kind === 'liq') {
    if (rec) tr.b.flags.liquidation = true;
    for (const p of s.parts) p.open = false;
    exitQty(tr, s, s.posQty, priceX, t, 'LIQ', rec);
    return;
  }
  if (e.kind === 'part') {
    const role = stopRole(tr, s, e.part);
    if (role === 'TR' || role === 'TRA') { closePart(tr, s, e.part, priceX, t, role, rec); return; }
    // SL/BE/dời SL là MỘT lệnh closePosition: mọi phần đang theo mức dừng chung đóng trong một lệnh (trượt theo cỡ tính trên tổng)
    const group = s.parts.filter((p) => p.open && trailLevel(tr, s, p) <= sharedStop(s));
    for (const p of group) p.open = false;
    exitQty(tr, s, Math.min(s.posQty, qRound(tr, group.reduce((x, p) => x + p.qty, 0))), priceX, t, role, rec);
  }
}

function applyHigh(tr: SimTrade, s: State, e: Ev, priceX: number, t: number, rec: boolean): void {
  if (e.kind === 'target') {
    closePart(tr, s, e.part, priceX, t, e.part.name, rec);
    if (e.part.name === 'TP1') onTp1(tr, s, t);
  } else if (e.kind === 'activate' && e.part.trail?.kind === 'callback') {
    e.part.trail.peakX = Math.max(priceX, e.part.trail.actX);
  } else if (e.kind === 'cancel') {
    e.leg.status = 'cancelled';
  }
}

function raisePeaks(s: State, x: number): void {
  if (s.posQty <= 0) return;
  for (const p of s.parts) if (p.open && p.trail?.kind === 'callback' && p.trail.peakX !== null && x > p.trail.peakX) p.trail.peakX = x;
  if (s.peakX === null || x > s.peakX) s.peakX = x;
}

// Bất lợi trước: mọi sự kiện phía dưới (mức cao nhất trước), rồi phía trên (mức thấp nhất trước), rồi nâng đỉnh.
function runLow(tr: SimTrade, s: State, l: number, t: number, rec: boolean, atPrice: number | null): void {
  for (let guard = 0; guard < 100; guard++) {
    const evs = lowEvents(tr, s).filter((e) => e.level >= l);
    if (evs.length === 0) return;
    const e = evs.reduce((a, b) => (b.level > a.level ? b : a));
    applyLow(tr, s, e, atPrice ?? e.level, t, rec);
  }
  throw new Error(`${tr.k.symbol}: vòng sự kiện phía dưới không dừng`);
}
function runHigh(tr: SimTrade, s: State, h: number, t: number, rec: boolean, atPrice: number | null): void {
  for (let guard = 0; guard < 100; guard++) {
    const evs = highEvents(s).filter((e) => e.level <= h);
    if (evs.length === 0) break;
    const e = evs.reduce((a, b) => (b.level < a.level ? b : a));
    applyHigh(tr, s, e, atPrice ?? e.level, t, rec);
  }
  raisePeaks(s, h);
}

function finishIfFlat(tr: SimTrade, t: number): void {
  const s = tr.s;
  const b = tr.b;
  if (b.closedAt !== null) return;
  const pending = s.legs.some((l) => l.status === 'pending');
  if (b.firstFillAt !== null && s.posQty <= 0) {
    for (const l of s.legs) if (l.status === 'pending') l.status = 'cancelled';
    b.closedAt = t;
    b.reason = reasonOf(b.exits[b.exits.length - 1]?.role ?? 'SL');
    return;
  }
  if (b.firstFillAt === null && !pending) {
    b.closedAt = t;
    b.reason = s.legs.some((l) => !l.ioc) ? 'limit_unfilled' : 'ioc_nofill';
  }
}

function reasonOf(role: string): string {
  const m: Record<string, string> = {
    SL: 'stop_loss', TR: 'trailing', TRA: 'trailing', BE: 'breakeven_floor', A1: 'after_tp1_stop', TP1: 'take_profit', TP2: 'take_profit', TP3: 'take_profit',
    TIME: 'time_stop', HOLD: 'max_hold', END: 'period_end', LIQ: 'liquidation', FUND: 'funding_guard',
  };
  return m[role] ?? role;
}

// Giá mở: sự kiện đầu tiên của nến (IOC khớp ở đây; gap qua SL/TP/limit khớp ở giá mở).
function applyOpen(tr: SimTrade, o: number, t: number): void {
  const s = tr.s;
  for (const leg of s.legs) {
    if (leg.status !== 'pending' || !leg.ioc) continue;
    const px0 = Math.abs(o);
    const slack = (leg.limitX - o) / px0; // khoảng còn lại tới giá trần (phần giá)
    let q = 0;
    if (slack >= 0) {
      const c = tr.k.cost;
      const maxN = Number.isFinite(c.vol1m) ? (slack / (c.impactPct / 100)) * c.vol1m : Infinity;
      q = maxN === Infinity ? leg.qty : Math.min(leg.qty, floorQ(tr, maxN / px0));
    }
    if (q > 0) {
      const x = roundPx(o + px0 * avgImpact(tr.k.cost, q * px0));
      fillEntry(tr, s, leg, q, x, t, true);
      if (q < leg.qty) tr.b.flags.iocPartial = true;
    } else {
      leg.status = 'nofill';
    }
  }
  // Gap qua giá thanh lý (ước tính isolated): sàn thanh lý trước khi lệnh SL kịp khớp → mất đúng ký quỹ (đóng ở giá phá sản
  // = giá vào TB × (1 ∓ 1/đòn bẩy)), gắn cờ. Không nên xảy ra (planner giữ thanh lý cách SL ≥ 1 khoảng cắt lỗ).
  if (s.posQty > 0 && tr.b.liqX !== null && o <= tr.b.liqX) {
    tr.b.flags.liquidation = true;
    const bankrupt = toX(tr.k.d, realPx(tr, s.avgX) * (1 - tr.k.d / tr.k.leverage));
    for (const p of s.parts) p.open = false;
    exitQty(tr, s, s.posQty, bankrupt, t, 'LIQ', true, false);
    finishIfFlat(tr, t);
    return;
  }
  const lows = lowEvents(tr, s).filter((e) => e.level >= o);
  if (lows.some((e) => e.kind === 'part' && e.level > o)) tr.b.flags.gap = true;
  runLow(tr, s, o, t, true, o);
  runHigh(tr, s, o, t, true, o);
  finishIfFlat(tr, t);
}

// Thứ tự trong nến có đổi kết quả không? (có sự kiện phía trên VÀ có sự kiện phía dưới trước hoặc sau khi áp phía trên)
function ambiguous(tr: SimTrade, h: number, l: number): boolean {
  const s = tr.s;
  const raise = s.posQty > 0 && s.parts.some((p) => p.open && (
    (p.trail?.kind === 'callback' && p.trail.peakX !== null && h > p.trail.peakX) || (p.trail?.kind === 'atr' && (s.peakX === null || h > s.peakX))));
  const hasHigh = raise || highEvents(s).some((e) => e.level <= h);
  if (!hasHigh) return false;
  if (lowEvents(tr, s).some((e) => e.level >= l)) return true;
  const c = structuredClone(s);
  runHigh(tr, c, h, 0, false, null);
  return lowEvents(tr, c).some((e) => e.level >= l);
}

export type Resolver = (symbol: string, bar: Candle) => Promise<Candle[] | null>;

function barX(tr: SimTrade, bar: Candle): { o: number; h: number; l: number } {
  return tr.k.d > 0 ? { o: bar.open, h: bar.high, l: bar.low } : { o: -bar.open, h: -bar.low, l: -bar.high };
}

async function feedBar(tr: SimTrade, bar: Candle, resolve: Resolver | null): Promise<void> {
  if (isDone(tr)) return;
  const { o, h, l } = barX(tr, bar);
  applyOpen(tr, o, bar.openTime);
  if (isDone(tr)) return;
  const hadPos = tr.s.posQty > 0 || tr.s.legs.some((x) => x.status === 'pending' && !x.ioc);
  if (ambiguous(tr, h, l)) {
    const subs = resolve === null ? null : await resolve(tr.k.symbol, bar);
    if (subs !== null && subs.length > 0) {
      tr.b.flags.resolvedBars++;
      for (const sb of subs) await feedBar(tr, sb, null);
      return;
    }
    tr.b.flags.unresolvedBars++;
    // loại nến không phân xử được: có phần đang trailing (callback đã kích hoạt, hoặc ATR) — "bất lợi trước" với trailing KHÔNG chắc bất lợi
    if (tr.s.posQty > 0 && tr.s.parts.some((p) => p.open && ((p.trail?.kind === 'callback' && p.trail.peakX !== null) || p.trail?.kind === 'atr'))) tr.b.flags.unresolvedTrailing++;
    if (tr.s.legs.some((x) => x.status === 'pending' && !x.ioc && x.cancelX !== null && x.cancelX <= h)) tr.b.flags.limitCancelledUnresolved++;
    // limit chờ + giá chạm TP1 cùng nến: hủy trước (không vào lệnh) — áp phía trên cho riêng lệnh chờ trước
    if (tr.s.posQty <= 0) {
      for (const leg of tr.s.legs) if (leg.status === 'pending' && !leg.ioc && leg.cancelX !== null && leg.cancelX <= h) leg.status = 'cancelled';
    }
  }
  const s = tr.s;
  const posAtStart = s.posQty;
  runLow(tr, s, l, bar.openTime, true, null);
  // Vị thế mở giữa nến (khớp limit): không biết đỉnh của nến đến trước hay sau lúc khớp → bỏ phía trên của nến này (thận trọng:
  // không TP, không nâng đỉnh/MFE). Nếu thứ tự quan trọng (có TP1/hủy limit trong tầm) thì nến đã được phân xử bằng 1m ở trên.
  const filledMidBar = posAtStart <= 0 && s.posQty > 0;
  if (!filledMidBar) runHigh(tr, s, h, bar.openTime, true, null);
  if (hadPos || s.posQty > 0) {
    if (s.troughX !== null) s.troughX = Math.min(s.troughX, l);
    if (s.peakX !== null && !filledMidBar) s.peakX = Math.max(s.peakX, h);
  }
  finishIfFlat(tr, bar.openTime);
}

// Đóng toàn bộ ở giá thị trường (dừng theo thời gian / hết kỳ): giá thật p (chưa trượt)
export function closeAll(tr: SimTrade, t: number, priceReal: number, role: string): void {
  const s = tr.s;
  for (const leg of s.legs) if (leg.status === 'pending') leg.status = 'cancelled';
  for (const p of s.parts) p.open = false;
  if (s.posQty > 0) exitQty(tr, s, s.posQty, toX(tr.k.d, priceReal), t, role, true); // một lệnh market cho cả vị thế
  finishIfFlat(tr, t);
  if (tr.b.closedAt === null) { tr.b.closedAt = t; tr.b.reason = reasonOf(role); }
}

export function forceClose(tr: SimTrade, t: number, priceReal: number, reason: 'period_end'): void {
  if (isDone(tr)) return;
  closeAll(tr, t, priceReal, reason === 'period_end' ? 'END' : reason);
}

// F1: chốt chặn funding sau mỗi kỳ chốt (cùng hàm với bot — packages/core/funding-guard.ts). Giá mark ≈ giá mở nến kế tiếp sau kỳ chốt.
function applyFundingGuard(tr: SimTrade, T: number, openReal: number): void {
  const s = tr.s;
  const b = tr.b;
  if (!(s.posQty > 0)) return;
  const exitCostFrac = tr.k.cost.tierPct / 200 + avgImpact(tr.k.cost, s.posQty * openReal);
  const g = fundingGuard({
    side: tr.k.side, qty: s.posQty, avgEntry: realPx(tr, s.avgX), stop: realPx(tr, sharedStop(s)), markPrice: openReal,
    equityAtEntry: tr.k.equityAtEntry, riskPct: COMMON.risk.perTradePct, lockedLoss: b.costs - b.gross - b.funding, exitCostFrac, tickSize: tr.k.tick,
  });
  if (g.action === 'tighten') {
    s.stopX = Math.max(s.stopX, toX(tr.k.d, g.stop));
    b.flags.fundingGuardTightened++;
  } else if (g.action === 'close') {
    b.flags.fundingGuardClosed++;
    closeAll(tr, T, openReal, 'FUND');
  }
}

// Trước mỗi nến: hết hạn limit, funding đã chốt, dừng theo thời gian.
// C3: xử lý các nến 4H đã ĐÓNG trước T (closeTime < T — không nhìn trước): nâng mức dừng phần còn lại theo đỉnh đóng 4H từ TP1 − m×ATR
function onH4Closes(tr: SimTrade, T: number, h4: H4Ctx): void {
  const s = tr.s;
  const b = tr.b;
  const d = tr.k.d;
  while (b.h4Idx < h4.c.length && h4.c[b.h4Idx]!.closeTime < T) {
    const i = b.h4Idx++;
    const bar = h4.c[i]!;
    if (!s.tp1Done || s.tp1At === null || bar.closeTime < s.tp1At || s.posQty <= 0) continue;
    const cx = d * bar.close;
    s.maxCloseX = Math.max(s.maxCloseX ?? -Infinity, cx);
    const a = h4.atr[i]!;
    if (!Number.isFinite(a)) continue;
    const level = Math.max(s.floorX ?? -Infinity, s.maxCloseX - COMMON.exitC3.trailAtrMult4h * a);
    for (const p of s.parts) if (p.open && p.trail?.kind === 'close4h') p.trail.levelX = Math.max(p.trail.levelX ?? -Infinity, level);
  }
}
export type H4Ctx = { c: readonly Candle[]; atr: readonly number[] };

function preBar(tr: SimTrade, bar: Candle, funding: readonly FundingRow[], h4: H4Ctx | null): void {
  const s = tr.s;
  const b = tr.b;
  const T = bar.openTime;
  if (h4 !== null) onH4Closes(tr, T, h4);
  for (const leg of s.legs) if (leg.status === 'pending' && !leg.ioc && leg.expireAt !== null && leg.expireAt <= T) leg.status = 'expired';
  let settled = false;
  for (const row of funding) {
    const ft = Math.floor(row.fundingTime / 60_000) * 60_000;
    if (ft <= b.lastFundingT || ft > T) continue;
    if (s.posQty > 0 && b.firstFillAt !== null && b.firstFillAt < ft) {
      const mark = row.markPrice > 0 ? row.markPrice : realPx(tr, s.avgX);
      const amt = -tr.k.d * s.posQty * mark * row.fundingRate;
      b.funding += amt;
      b.flows.push({ t: ft, amount: amt });
      settled = true;
    }
  }
  b.lastFundingT = Math.max(b.lastFundingT, T);
  if (settled && COMMON.risk.fundingRuntimeGuard) applyFundingGuard(tr, T, bar.open);
  if (s.posQty > 0 && b.firstFillAt !== null) {
    const held = T - b.firstFillAt;
    const oneR = s.avgX - tr.k.initialStopX;
    if (held >= tr.k.maxHoldMs) closeAll(tr, T, bar.open, 'HOLD');
    else if (held >= tr.k.timeStopMs && !s.tp1Done && (s.peakX ?? -Infinity) - s.avgX < oneR - 1e-12) closeAll(tr, T, bar.open, 'TIME');
  }
  finishIfFlat(tr, T);
}

// Chạy lệnh qua các nến có openTime trong [tr.b.nextT, until). series tăng dần theo openTime.
// ctx.h4: nến 4H của mã (C3 bắt buộc — có nến khởi động trước lúc vào để tính ATR), chỉ nến đã đóng trong kỳ.
export async function advanceTrade(tr: SimTrade, series: readonly Candle[], until: number,
  ctx: { funding: readonly FundingRow[]; resolve: Resolver | null; h4?: readonly Candle[] }): Promise<void> {
  if (tr.k.policy === 'C3' && ctx.h4 === undefined) throw new Error(`${tr.k.symbol}: thoát C3 cần nến 4H (ctx.h4)`);
  const h4: H4Ctx | null = tr.k.policy === 'C3' && ctx.h4 !== undefined ? { c: ctx.h4, atr: atr([...ctx.h4], COMMON.exitC3.atrPeriod) } : null;
  let lo = 0, hi = series.length;
  while (lo < hi) { const m = (lo + hi) >>> 1; if (series[m]!.openTime < tr.b.nextT) lo = m + 1; else hi = m; }
  for (let i = lo; i < series.length && !isDone(tr); i++) {
    const bar = series[i]!;
    if (bar.openTime >= until) break;
    preBar(tr, bar, ctx.funding, h4);
    if (!isDone(tr)) await feedBar(tr, bar, ctx.resolve);
    tr.b.nextT = bar.openTime + 1;
  }
}

// ------------------------------------------------------------------ danh mục -----------------------------------------------------
// Lệnh mô phỏng → OpenTrade cho canOpen/planner. Lệnh limit CHỜ khớp vẫn giữ chỗ rủi ro + ký quỹ (thận trọng).
export function portfolioView(trades: readonly SimTrade[]): OpenTrade[] {
  return trades.filter((t) => !isDone(t)).map((t) => {
    const s = t.s;
    const k = t.k;
    // rủi ro = cùng công thức định cỡ của planner (giá vào xấu nhất, phí hai chiều, trượt theo cỡ, đệm funding) cho phần đang mở + phần chờ khớp
    let notional = 0, q = 0;
    if (s.posQty > 0) { notional += s.posQty * realPx(t, s.avgX); q += s.posQty; }
    for (const l of s.legs) {
      if (l.status !== 'pending') continue;
      const rest = l.qty - l.filledQty;
      notional += rest * realPx(t, l.limitX);
      q += rest;
    }
    const risk = q * k.riskModel.a + q * q * k.riskModel.b;
    return { symbol: k.symbol, side: k.side, notional, leverage: k.leverage, riskAmount: risk, pastTp1: s.tp1Done };
  });
}

// ------------------------------------------------------------------ bản ghi lệnh ---------------------------------------------------
export type TradeRecord = {
  id: string; symbol: string; side: Side; mode: Mode; policy: ExitPolicy; grade: string | null; label: string; kind: 'zone' | 'pattern';
  score: number; signalId: string; key: string; pathInterval: string; entryType: string;
  placedAt: string; entryTime: string | null; exitTime: string | null; filled: boolean;
  legs: Array<{ role: string; ioc: boolean; limit: number; qty: number; status: string; filledQty: number; fillPrice: number | null; fillTime: string | null }>;
  stop: number; tp1: number; callbackPct: number; beFloor: number | null; leverage: number;
  avgEntry: number | null; qty: number; exits: Exit[]; avgExit: number | null; reason: string | null;
  gross: number; costs: number; funding: number; pnl: number; equityAtEntry: number; pctEquity: number; riskAtFill: number; R: number;
  maeR: number | null; mfeR: number | null; maePct: number | null; flags: Flags; sizing: Sizing;
};

const iso = (t: number | null) => (t === null ? null : new Date(t).toISOString());

export function tradeRecord(tr: SimTrade): TradeRecord {
  const { k, s, b } = tr;
  const filled = b.firstFillAt !== null;
  const avg = filled ? roundPx(b.entryNotional / b.maxPosQty) : null; // giá vào TB theo mọi chân đã khớp
  const pnl = b.gross - b.costs + b.funding;
  const stopReal = realPx(tr, k.initialStopX);
  // 1R = rủi ro định cỡ của planner cho KHỐI LƯỢNG ĐÃ KHỚP, không gồm đệm funding: q·(a − funding/coin) + q²·b
  // (|giá xấu nhất − SL| + phí hai chiều + trượt theo cỡ) → chạm SL đủ ở giá xấu nhất = −1R; funding thật tính riêng vào lãi lỗ.
  const q = b.maxPosQty;
  const riskAtFill = q * (k.riskModel.a - k.riskModel.fundingPerUnit) + q * q * k.riskModel.b;
  const exQty = b.exits.reduce((x, e) => x + e.qty, 0);
  const oneR = avg === null ? NaN : Math.abs(avg - stopReal);
  const avgXv = avg === null ? NaN : toX(k.d, avg);
  return {
    id: k.id, symbol: k.symbol, side: k.side, mode: k.mode, policy: k.policy, grade: k.meta.grade, label: k.meta.label, kind: k.meta.kind,
    score: k.meta.score, signalId: k.meta.signalId, key: k.meta.key, pathInterval: k.pathInterval, entryType: k.entryType,
    placedAt: iso(k.placedAt)!, entryTime: iso(b.firstFillAt), exitTime: filled ? iso(b.closedAt) : null, filled,
    legs: s.legs.map((l) => ({ role: l.role, ioc: l.ioc, limit: realPx(tr, l.limitX), qty: l.qty, status: l.status, filledQty: l.filledQty, fillPrice: l.fillPrice, fillTime: iso(l.fillTime) })),
    stop: stopReal, tp1: realPx(tr, k.tp1X), callbackPct: k.cbPct, beFloor: k.beX === null ? null : realPx(tr, k.beX), leverage: k.leverage,
    avgEntry: avg, qty: b.maxPosQty, exits: b.exits, avgExit: exQty > 0 ? roundPx(b.exits.reduce((x, e) => x + e.qty * e.price, 0) / exQty) : null,
    reason: b.reason, gross: b.gross, costs: b.costs, funding: b.funding, pnl, equityAtEntry: k.equityAtEntry,
    pctEquity: (pnl / k.equityAtEntry) * 100, riskAtFill, R: riskAtFill > 0 ? pnl / riskAtFill : 0,
    maeR: filled && s.troughX !== null ? (s.troughX - avgXv) / oneR : null,
    mfeR: filled && s.peakX !== null ? (s.peakX - avgXv) / oneR : null,
    maePct: filled && s.troughX !== null && avg !== null ? ((s.troughX - avgXv) / avg) * 100 : null,
    flags: { ...b.flags }, sizing: k.sizing,
  };
}

// ---------------------------------------------------------------- sổ vốn + cầu chì -------------------------------------------------
export type BookConfig = { capital: number; lossesMax: number; lossesWindowHours: number; pauseHours: number; dailyLossPct: number; ddAlertPct: number };
export const DEFAULT_BOOK: Omit<BookConfig, 'capital'> = { lossesMax: 5, lossesWindowHours: 24, pauseHours: 24, dailyLossPct: 10, ddAlertPct: 30 };

export type Book = {
  cfg: BookConfig; equity: number; peak: number; maxDdPct: number; day: number; dayStart: number; pausedUntil: number;
  losses: number[]; trips: { losses: number; daily: number }; ddAlerts: number; ddArmed: boolean;
  curve: Array<{ t: number; equity: number }>; pauses: Array<{ from: number; until: number; why: string }>;
};

export function createBook(cfg: BookConfig): Book {
  return { cfg, equity: cfg.capital, peak: cfg.capital, maxDdPct: 0, day: -1, dayStart: cfg.capital, pausedUntil: -Infinity, losses: [],
    trips: { losses: 0, daily: 0 }, ddAlerts: 0, ddArmed: true, curve: [], pauses: [] };
}

function pause(b: Book, t: number, why: string): void {
  const until = t + b.cfg.pauseHours * HOUR;
  b.pauses.push({ from: t, until, why });
  b.pausedUntil = Math.max(b.pausedUntil, until);
}

// Dòng tiền (khớp, phí, funding) theo thời gian thật → vốn ví, sụt giảm, lỗ trong ngày (so vốn đầu ngày UTC).
export function bookFlow(b: Book, t: number, amount: number): void {
  const day = Math.floor(t / DAY);
  if (day !== b.day) { b.day = day; b.dayStart = b.equity; }
  b.equity += amount;
  b.curve.push({ t, equity: b.equity });
  if (b.equity > b.peak) { b.peak = b.equity; b.ddArmed = true; }
  const dd = ((b.peak - b.equity) / b.peak) * 100;
  b.maxDdPct = Math.max(b.maxDdPct, dd);
  if (dd >= b.cfg.ddAlertPct && b.ddArmed) { b.ddAlerts++; b.ddArmed = false; }
  if (amount < 0 && b.equity < b.dayStart * (1 - b.cfg.dailyLossPct / 100) && !isPaused(b, t)) {
    b.trips.daily++;
    pause(b, t, `lỗ trong ngày > ${b.cfg.dailyLossPct}%`);
  }
}

// Lệnh đóng: đếm lệnh thua trong cửa sổ 24 giờ (5 lệnh → dừng). Sau khi ngắt, đếm lại từ đầu (như người dùng cho phép lại).
export function bookClose(b: Book, t: number, net: number): void {
  if (!(net < 0)) return;
  b.losses = b.losses.filter((x) => x > t - b.cfg.lossesWindowHours * HOUR);
  b.losses.push(t);
  if (b.losses.length >= b.cfg.lossesMax) {
    if (!isPaused(b, t)) b.trips.losses++;
    pause(b, t, `${b.cfg.lossesMax} lệnh thua trong ${b.cfg.lossesWindowHours} giờ`);
    b.losses = [];
  }
}

export const isPaused = (b: Book, t: number) => t < b.pausedUntil;

// ------------------------------------------------------------------ thống kê -------------------------------------------------------
export type GroupStats = {
  trades: number; wins: number; winRate: number; expectancyR: number; sumR: number; pnl: number; profitFactor: number;
  longestLosingStreak: number; breaches2pct: { count: number; worstPct: number | null; ids: string[] }; avgWinR: number; avgLossR: number;
};

export function groupStats(recs: readonly TradeRecord[]): GroupStats {
  const xs = recs.filter((r) => r.filled);
  let streak = 0, longest = 0, gp = 0, gl = 0, sumR = 0, pnl = 0, wins = 0, winR = 0, lossR = 0;
  const breaches: TradeRecord[] = [];
  for (const r of xs) {
    sumR += r.R;
    pnl += r.pnl;
    if (r.pnl > 0) { wins++; gp += r.pnl; winR += r.R; streak = 0; } else { gl += -r.pnl; lossR += r.R; streak++; longest = Math.max(longest, streak); }
    if (r.pctEquity < -COMMON.risk.perTradePct - 1e-9) breaches.push(r);
  }
  const n = xs.length;
  return {
    trades: n, wins, winRate: n > 0 ? wins / n : 0, expectancyR: n > 0 ? sumR / n : 0, sumR, pnl,
    profitFactor: gl > 0 ? gp / gl : gp > 0 ? Infinity : 0, longestLosingStreak: longest,
    breaches2pct: { count: breaches.length, worstPct: breaches.length > 0 ? Math.min(...breaches.map((r) => r.pctEquity)) : null, ids: breaches.map((r) => r.id) },
    avgWinR: wins > 0 ? winR / wins : 0, avgLossR: n - wins > 0 ? lossR / (n - wins) : 0,
  };
}

export function summarize(recs: readonly TradeRecord[], book: { capital: number; equity: number; maxDdPct: number }) {
  return {
    totalReturnPct: ((book.equity - book.capital) / book.capital) * 100, maxDdPct: book.maxDdPct,
    all: groupStats(recs), long: groupStats(recs.filter((r) => r.side === 'long')), short: groupStats(recs.filter((r) => r.side === 'short')),
  };
}
