import { CONFIG, COMMON } from '../core/config.ts';
import { snapToTick, tickDecimals } from '../core/price.ts';
import { entryLegProblems, exitPartProblems, isStepMultiple } from '../core/filters.ts';
import { canOpen, type OpenTrade } from '../core/portfolio.ts';
import { mmrFor, liquidationPrice, splitQuantity, type TradePlan } from '../core/plan.ts';
import type { ExitPolicy } from '../core/exit.ts';
import type { MarginBracket } from '../core/margin.ts';
import type { Contract, Mode } from '../core/types.ts';
import {
  builders, bracketSlots, makeClientId,
  type EntryInput, type StopLossInput, type TakeProfitInput, type TrailingInput, type ClientIdParts,
} from '../binance/orders.ts';

// Planner (B3): kế hoạch lệnh (TradePlan vùng hoặc PatternPlan mô hình) → danh sách lệnh MONG MUỐN theo chính sách C2.
// Hàm THUẦN: không gửi gì, không đọc giờ máy. Mỗi chân lệnh khớp 1:1 với đầu vào của orders.ts (placeEntry / placeStopLoss /
// placeTakeProfit / placeTrailing). Vi phạm bất kỳ bất biến nào → allowed=false, legs=[] (không bao giờ phát nửa bộ lệnh).

// Phần chung của TradePlan và PatternPlan mà planner dùng. PatternPlan có thêm 'split', limitPrice, cancelIfTp1First.
type PlanCore = Pick<TradePlan, 'side' | 'marketPrice' | 'entry' | 'maxEntry' | 'stop' | 'targets' | 'exit' | 'valid' | 'invalidReason'
  | 'qty' | 'costPct' | 'suggestedLeverage' | 'limitExpiryHours' | 'riskPct'>;
export type PlannerPlan = PlanCore & {
  entryType: 'market' | 'limit' | 'split'; // split = chân market + chân limit (kế hoạch mô hình)
  limitPrice?: number | null; // PatternPlan; TradePlan limit dùng plan.entry
  cancelIfTp1First?: boolean; // PatternPlan; TradePlan: hủy limit nếu giá chạm TP1 trước (khi TP1 còn ở phía trước giá)
};

export type PlannerInput = {
  plan: PlannerPlan;
  grade: 'A' | 'B' | null; // Analysis.grade?.grade
  signal: { id: string; fresh: boolean } | null; // Analysis.signal — id dùng cho mã client tất định
  mode: Mode; // trần đòn bẩy theo chế độ (Swing 5×, Lướt nhanh 10×)
  contract: Contract; // bộ lọc sàn (exchangeInfo)
  capital: number; // vốn bot (USDT)
  openTrades: readonly OpenTrade[]; // danh mục thật (canOpen)
  openOrderCount: number; // số lệnh đang mở trên mã này (thường + algo) — MAX_NUM_ORDERS
  maxNotional: number; // trần notional theo thanh khoản (COMMON.slippage.maxParticipation × khối lượng 1 phút); Infinity = không giới hạn
  markPrice: number; // giá mark hiện tại
  runId: string; // mã lần chạy (1–8 chữ/số)
  now: number; // ms — tính hạn GTD của limit
  leverageBrackets?: readonly MarginBracket[]; // bậc ký quỹ thật; không có → bảng giả định thận trọng
  exitPolicy?: ExitPolicy; // mặc định COMMON.exit.defaultPolicy (C2); bot chỉ chạy C2
};

export type EntryRole = 'E1' | 'E2';
// when: 'now' = đặt ngay; 'on_entry_fill' = đặt ngay khi có khớp (kể cả một phần) — SL trước tiên; 'on_tp1_fill' = sau khi TP1 khớp.
// Lệnh dừng KHÔNG mang markPrice: nơi gửi điền giá mark MỚI lúc đặt (giá mark lúc lập kế hoạch đã cũ).
export type StopLegInput = Omit<StopLossInput, 'markPrice'>;
export type DesiredOrder =
  | { op: 'placeEntry'; role: EntryRole; when: 'now'; clientId: string; input: EntryInput; cancelIfMarkReaches: number | null }
  | { op: 'placeStopLoss'; role: 'SL'; when: 'on_entry_fill'; clientId: string; input: StopLegInput }
  | { op: 'placeTakeProfit'; role: 'TP1'; when: 'on_entry_fill'; clientId: string; input: TakeProfitInput }
  | { op: 'placeTrailing'; role: 'TR'; when: 'on_entry_fill'; clientId: string; input: TrailingInput }
  | { op: 'placeStopLoss'; role: 'BE'; when: 'on_tp1_fill'; clientId: string; input: StopLegInput };

// Khối lượng TP1/trailing theo những chân đã khớp — dữ liệu cho bộ đối chiếu (B4) đổi cỡ TP1/trailing khi khớp.
export type ExitScenario = { filled: EntryRole[]; positionQty: number; tp1Qty: number; trailQty: number };

export type Sizing = {
  requestedQty: number; // khối lượng theo kế hoạch (2%)
  qty: number; // khối lượng thật sẽ vào (sau canOpen + làm tròn bước)
  adjusted: boolean; // true: bị giảm vì danh mục/ký quỹ/thanh khoản
  riskAmount: number; // tiền mất nếu chạm SL với qty (gồm phí ước tính), tại giá vào dùng để tính
  riskPct: number; // riskAmount / vốn × 100 — rủi ro THỰC
  leverage: number;
  notional: number; // tại giá vào dùng để tính
  marginNeeded: number;
  worstEntry: number; // giá khớp xa SL nhất được phép
};

export type PlannerResult = {
  allowed: boolean;
  reasons: string[]; // vì sao từ chối, hoặc vì sao giảm khối lượng (khi allowed)
  legs: DesiredOrder[]; // theo thứ tự đặt; rỗng khi không cho vào
  sizing: Sizing | null;
  exitByFill: ExitScenario[]; // market/limit: [E1]; split: [E1] (chỉ chân market khớp) và [E1, E2]
  exitRule: { tp1Pct: number; qtyStep: number }; // khớp một phần bất kỳ: exitSplit(khối lượng đã khớp, qtyStep)
};

const GTD_MIN_MS = 610_000; // orders.ts: goodTillDate > hiện tại + 600 s (tài liệu) + 10 s đệm

// Chia vị thế: TP1 = floor(vị thế × 50% / bước) × bước; phần dư (kể cả lẻ bước) cho trailing → tổng luôn đúng bằng vị thế.
export function exitSplit(positionQty: number, qtyStep: number): { tp1Qty: number; trailQty: number } {
  const p = COMMON.zones.exitPcts[0]!;
  const [tp1Qty, trailQty] = splitQuantity(positionQty, qtyStep, [p, 100 - p]);
  return { tp1Qty: tp1Qty!, trailQty: trailQty! };
}

export function planOrders(i: PlannerInput): PlannerResult {
  const c = i.contract;
  // Mọi khối lượng theo bước THÔ hơn của LOT_SIZE / MARKET_LOT_SIZE: chân market và lệnh thoát (khớp market) không bị orders.ts
  // cắt bớt → tổng TP1 + trailing luôn đúng bằng vị thế.
  const qStep = Math.max(c.stepSize, c.marketStepSize);
  const exitRule = { tp1Pct: COMMON.zones.exitPcts[0]!, qtyStep: qStep };
  const problems: string[] = []; // vi phạm → từ chối
  const adjust: string[] = []; // lý do canOpen giảm khối lượng (vẫn cho vào)
  const reject = (...rs: string[]): PlannerResult => ({ allowed: false, reasons: [...adjust, ...problems, ...rs], legs: [], sizing: null, exitByFill: [], exitRule });

  // ---- 1. Tín hiệu và kế hoạch -----------------------------------------------------------------
  const p = i.plan;
  if (i.signal === null) return reject('Không có tín hiệu (signal = null) — không vào lệnh');
  if (i.grade !== 'A') problems.push(`Chỉ giao dịch tín hiệu Hạng A (tín hiệu này: ${i.grade === null ? 'chưa chấm hạng' : `Hạng ${i.grade}`})`);
  if (!i.signal.fresh) problems.push('Chỉ giao dịch tín hiệu MỚI — tín hiệu này đang giữ từ lần quét trước');
  if (!p.valid) problems.push(`Kế hoạch không hợp lệ: ${p.invalidReason ?? '(không rõ lý do)'}`);
  const policy = i.exitPolicy ?? COMMON.exit.defaultPolicy;
  if (policy !== 'C2' || p.exit.policy !== 'C2') problems.push(`Bot chỉ chạy chính sách thoát C2 (yêu cầu ${policy}, kế hoạch ${p.exit.policy})`);
  if (p.riskPct > COMMON.risk.perTradePct) problems.push(`Rủi ro kế hoạch ${p.riskPct}% vượt ${COMMON.risk.perTradePct}%/lệnh`);
  const tp1Raw = p.targets[0]?.price ?? null;
  const tr = p.exit.trailing;
  if (tp1Raw === null || tr === null) problems.push('Kế hoạch không có TP1/trailing trên sàn — bot không vào lệnh thiếu TP1');
  if (!(i.markPrice > 0) || !Number.isFinite(i.markPrice)) problems.push(`Giá mark ${i.markPrice} không hợp lệ`);
  if (problems.length > 0 || tp1Raw === null || tr === null) return reject();

  // ---- 2. Giá (làm tròn ĐÚNG như orders.ts → giá trong lệnh mong muốn = giá gửi sàn) ------------
  const side = p.side;
  const d = side === 'long' ? 1 : -1;
  const tick = c.tickSize;
  const awayDir = side === 'long' ? 'down' : 'up'; // SL ra xa giá vào; TP/kích hoạt/limit về phía giá vào (cùng hướng)
  const stop = snapToTick(p.stop, tick, awayDir);
  const tp1 = snapToTick(tp1Raw, tick, awayDir);
  const activate = snapToTick(tr.activationPrice, tick, awayDir);
  const hasMarket = p.entryType !== 'limit';
  const hasLimit = p.entryType !== 'market';
  const limitRaw = p.entryType === 'limit' ? (p.limitPrice ?? p.entry) : (p.limitPrice ?? null);
  if (hasLimit && (limitRaw === null || !(limitRaw > 0))) return reject(`Kế hoạch ${p.entryType} thiếu giá limit`);
  const limitPrice = hasLimit ? snapToTick(limitRaw!, tick, awayDir) : null;
  const maxEntry = snapToTick(p.maxEntry, tick, awayDir);
  // Mọi giá khớp được phép: market = [giá mark, giá tối đa]; limit = giá limit
  const fills = [...(hasMarket ? [i.markPrice, maxEntry] : []), ...(limitPrice !== null ? [limitPrice] : [])];
  const worstEntry = d > 0 ? Math.max(...fills) : Math.min(...fills);

  if (hasMarket && d * (i.markPrice - maxEntry) > 0) problems.push(`Giá mark ${i.markPrice} đã vượt giá tối đa ${maxEntry} — không đuổi giá`);
  if (fills.some((f) => d * (f - stop) <= 0)) problems.push(`SL ${stop} sai phía: phải ${d > 0 ? 'dưới' : 'trên'} mọi giá vào (${fills.join(', ')})`);
  if (d * (i.markPrice - stop) <= 0) problems.push(`Giá mark ${i.markPrice} đã chạm/vượt SL ${stop}`);
  if (fills.some((f) => d * (tp1 - f) <= 0)) problems.push(`TP1 ${tp1} sai phía: phải ${d > 0 ? 'trên' : 'dưới'} mọi giá vào (${fills.join(', ')})`);
  if (activate !== tp1) problems.push(`Giá kích hoạt trailing ${activate} ≠ TP1 ${tp1}`);
  const { binanceTrailCallbackMinPct: cbMin, binanceTrailMaxCallbackPct: cbMax } = COMMON;
  if (!(tr.callbackPct >= cbMin && tr.callbackPct <= cbMax)) problems.push(`callbackRate ${tr.callbackPct} ngoài [${cbMin}; ${cbMax}]`);
  // Dừng sàn hòa vốn (D10): giá vào xấu nhất + phí khứ hồi, phải nằm giữa giá vào và TP1 (đặt sau khi TP1 khớp, giá mark ≈ TP1)
  const beTrigger = tr.needsBreakevenFloor ? snapToTick(worstEntry * (1 + (d * p.costPct) / 100), tick, d > 0 ? 'up' : 'down') : null;
  if (beTrigger !== null && d * (tp1 - beTrigger) <= 0) {
    problems.push(`Dừng sàn hòa vốn ${beTrigger} (giá vào ${worstEntry} + phí ${p.costPct}%) không nằm trước TP1 ${tp1} — TP1 chưa bù phí`);
  }
  let expireAt: number | undefined;
  if (hasLimit) {
    const h = p.limitExpiryHours;
    if (h === null || !(h > 0)) problems.push('Lệnh limit thiếu hạn tự hủy (limitExpiryHours)');
    else {
      expireAt = i.now + h * 3_600_000;
      if (expireAt <= i.now + GTD_MIN_MS) problems.push(`Hạn limit ${h} giờ quá ngắn cho GTD (cần > 610 giây)`);
    }
  }
  // Đòn bẩy: số nguyên, ≤ trần chế độ
  const lev = p.suggestedLeverage;
  const levCap = CONFIG[i.mode].maxLeverage;
  if (!Number.isInteger(lev) || lev < 1) problems.push(`Đòn bẩy ${lev} phải là số nguyên ≥ 1`);
  else if (lev > levCap) problems.push(`Đòn bẩy ${lev}× vượt trần chế độ ${i.mode} ${levCap}×`);
  if (problems.length > 0) return reject();

  // ---- 3. Danh mục (canOpen): trần 10 lệnh còn rủi ro, tổng rủi ro ≤ 10%, ký quỹ, thanh khoản, bộ lọc sàn ---------------
  let po;
  try {
    po = canOpen({
      symbol: c.symbol, side, entry: p.entry, stop, qty: p.qty, leverage: lev, costPct: p.costPct,
      entryType: p.entryType === 'limit' ? 'limit' : 'market', filters: c, maxNotional: i.maxNotional,
    }, i.openTrades, i.capital);
  } catch (e) {
    return reject(`Kiểm danh mục lỗi: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!po.allowed) return reject(...po.reasons);
  adjust.push(...po.reasons);

  // ---- 4. Khối lượng: các chân vào, TP1, trailing (theo bước thô) -------------------------------------------------------
  const dec = tickDecimals(qStep);
  const qty = Number((Math.floor(Math.min(po.adjustedQty, p.qty) / qStep + 1e-9) * qStep).toFixed(dec));
  if (!(qty > 0)) return reject(`Khối lượng ${po.adjustedQty} nhỏ hơn bước ${qStep}`);
  const adjusted = qty < p.qty;
  let entryQty: number[];
  if (p.entryType === 'split') {
    const m = COMMON.patterns.plan.splitMarketPct;
    entryQty = splitQuantity(qty, qStep, [m, 100 - m]);
  } else {
    entryQty = [qty];
  }
  const kinds: Array<'market' | 'limit'> = p.entryType === 'split' ? ['market', 'limit'] : [p.entryType];
  // Giá kiểm MIN_NOTIONAL cho chân market: giá khớp cho notional NHỎ nhất trong dải (thận trọng)
  const marketRef = Math.min(i.markPrice, maxEntry);
  const legPrice = (k: 'market' | 'limit') => (k === 'market' ? marketRef : limitPrice!);
  kinds.forEach((k, j) => {
    if (!isStepMultiple(entryQty[j]!, c.stepSize) || !isStepMultiple(entryQty[j]!, c.marketStepSize)) problems.push(`Khối lượng chân ${k} ${entryQty[j]} không theo bước`);
    problems.push(...entryLegProblems({ kind: k, price: legPrice(k), qty: entryQty[j]! }, c));
  });
  const roles: EntryRole[] = kinds.map((_, j) => (j === 0 ? 'E1' : 'E2'));
  const scenarios: ExitScenario[] = [];
  if (p.entryType === 'split') scenarios.push({ filled: ['E1'], positionQty: entryQty[0]!, ...exitSplit(entryQty[0]!, qStep) });
  scenarios.push({ filled: roles, positionQty: qty, ...exitSplit(qty, qStep) });
  for (const s of scenarios) {
    problems.push(...exitPartProblems([s.tp1Qty, s.trailQty], c).map((x) => `${s.filled.length === 1 && p.entryType === 'split' ? 'Chỉ chân market khớp: ' : ''}${x}`));
  }
  const full = scenarios[scenarios.length - 1]!;

  // ---- 5. Bậc ký quỹ + thanh lý ở khối lượng thật: thanh lý cách giá vào ≥ (1 + đệm) × khoảng SL, ở mọi giá khớp --------
  const notional = qty * p.entry;
  const tier = mmrFor(qty * worstEntry, i.leverageBrackets);
  if (lev > tier.maxLeverage) problems.push(`Đòn bẩy ${lev}× vượt trần bậc ký quỹ ${tier.maxLeverage}× ở notional ${Math.round(qty * worstEntry)} USDT`);
  const buf = COMMON.liquidationBufferStops;
  for (const f of fills) {
    const liq = liquidationPrice(f, lev, side, tier.mmr);
    if (d * (f - liq) < (1 + buf) * d * (f - stop) - 1e-9) {
      problems.push(`Giá thanh lý ước tính ${liq.toFixed(tickDecimals(tick))} (giá vào ${f}, ${lev}×) không cách SL ${stop} đủ ${buf} khoảng cắt lỗ`);
    }
  }

  // ---- 6. Chỗ lệnh (MAX_NUM_ORDERS) ----------------------------------------------------------------------------------
  const slots = bracketSlots({ entryLegs: kinds.length, tp1: true, trailing: true, breakevenFloor: beTrigger !== null });
  if (!Number.isInteger(i.openOrderCount) || i.openOrderCount < 0) problems.push(`openOrderCount ${i.openOrderCount} phải là số nguyên ≥ 0`);
  else if (i.openOrderCount + slots > c.maxNumOrders) problems.push(`Đã có ${i.openOrderCount} lệnh mở trên ${c.symbol}; cả bộ cần ${slots} lệnh sẽ vượt MAX_NUM_ORDERS ${c.maxNumOrders}`);

  // ---- 7. Mã client tất định ----------------------------------------------------------------------------------------
  const idOf = (leg: string): ClientIdParts => ({ runId: i.runId, signalId: i.signal!.id, leg, attempt: 0 });
  try {
    makeClientId(idOf('E1'));
  } catch (e) {
    problems.push(`Mã client sai: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (problems.length > 0) return reject();

  // ---- 8. Dựng các chân theo thứ tự đặt. openCount = lệnh có sẵn + các chân đặt trước nó; lệnh vào giữ chỗ phần còn lại ----
  const legs: DesiredOrder[] = [];
  const base = i.openOrderCount;
  const tp1Qty = full.tp1Qty;
  const trailQty = full.trailQty;
  const cancelAt = (p.cancelIfTp1First ?? true) && d * (tp1 - i.markPrice) > 0 ? tp1 : null;
  kinds.forEach((k, j) => {
    const common = { contract: c, side, qty: entryQty[j]!, id: idOf(roles[j]!), openCount: base + j, reserveSlots: slots - j };
    const input: EntryInput = k === 'market'
      ? { ...common, kind: 'market', refPrice: marketRef }
      : { ...common, kind: 'limit', limitPrice: limitPrice!, ...(expireAt !== undefined ? { expireAt } : {}) };
    legs.push({ op: 'placeEntry', role: roles[j]!, when: 'now', clientId: makeClientId(input.id), input, cancelIfMarkReaches: k === 'limit' ? cancelAt : null });
  });
  let n = kinds.length;
  const slId = idOf('SL');
  legs.push({ op: 'placeStopLoss', role: 'SL', when: 'on_entry_fill', clientId: makeClientId(slId),
    input: { contract: c, side, triggerPrice: stop, purpose: 'initial', id: slId } });
  n++;
  const tpId = idOf('TP1');
  legs.push({ op: 'placeTakeProfit', role: 'TP1', when: 'on_entry_fill', clientId: makeClientId(tpId),
    input: { contract: c, side, entryPrice: worstEntry, triggerPrice: tp1, qty: tp1Qty, id: tpId, openCount: base + n } });
  n++;
  const trId = idOf('TR');
  legs.push({ op: 'placeTrailing', role: 'TR', when: 'on_entry_fill', clientId: makeClientId(trId),
    input: { contract: c, side, entryPrice: worstEntry, activatePrice: activate, callbackPct: tr.callbackPct, qty: trailQty, id: trId, openCount: base + n } });
  n++;
  if (beTrigger !== null) {
    const beId = idOf('BE');
    legs.push({ op: 'placeStopLoss', role: 'BE', when: 'on_tp1_fill', clientId: makeClientId(beId),
      input: { contract: c, side, triggerPrice: beTrigger, purpose: 'breakeven', id: beId } });
  }

  // ---- 9. Chốt chặn cuối: chạy đúng bộ dựng request của orders.ts cho TỪNG chân. Một chân bị từ chối tại chỗ → bỏ cả bộ ----
  // SL kiểm với giá mark hiện tại; dừng sàn hòa vốn kiểm với giá mark dự kiến lúc đặt (= TP1).
  for (const l of legs) {
    const b = l.op === 'placeEntry' ? builders.entry(l.input, i.now)
      : l.op === 'placeStopLoss' ? builders.stopLoss({ ...l.input, markPrice: l.role === 'BE' ? tp1 : i.markPrice })
        : l.op === 'placeTakeProfit' ? builders.takeProfit(l.input) : builders.trailing(l.input);
    if (!b.ok) problems.push(...b.problems.map((x) => `${l.role}: ${x}`));
  }
  if (problems.length > 0) return reject();

  const riskAmount = qty * (Math.abs(p.entry - stop) + (p.entry * p.costPct) / 100);
  return {
    allowed: true, reasons: adjust, legs, exitByFill: scenarios, exitRule,
    sizing: { requestedQty: p.qty, qty, adjusted, riskAmount, riskPct: (riskAmount / i.capital) * 100, leverage: lev, notional, marginNeeded: notional / lev, worstEntry },
  };
}

