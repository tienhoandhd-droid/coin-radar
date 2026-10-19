import { CONFIG, COMMON } from '../core/config.ts';
import { snapToTick, tickDecimals } from '../core/price.ts';
import { entryLegProblems, exitPartProblems, isStepMultiple } from '../core/filters.ts';
import { canOpen, type OpenTrade } from '../core/portfolio.ts';
import { mmrFor, liquidationPrice, splitQuantity, type TradePlan } from '../core/plan.ts';
import { floorPct } from '../core/exit.ts';
import { riskModel, riskAt as riskAtModel, qtyForRisk, costPctAt, costModelProblems, fundingBufferProblems, costR, type CostModel, type FundingBuffer } from '../core/sizing.ts';
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
  | 'qty' | 'costPct' | 'suggestedLeverage' | 'limitExpiryHours' | 'riskPct' | 'capital'>;
export type PlannerPlan = PlanCore & {
  entryType: 'market' | 'limit' | 'split'; // split = chân market + chân limit (kế hoạch mô hình)
  limitPrice?: number | null; // PatternPlan; TradePlan limit dùng plan.entry
  cancelIfTp1First?: boolean; // PatternPlan; TradePlan: hủy limit nếu giá chạm TP1 trước (khi TP1 còn ở phía trước giá)
  trailAtr?: number; // TradePlan: khoảng trailing theo ATR khung vào lệnh (giá) — dùng cho lệnh phá vỡ không TP1 (#3 Task 8)
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
  // Rà soát Task 3 kế hoạch 2 (I1): phí nhóm thanh khoản (% khứ hồi, COMMON.costRoundTripPct) + KL 1 phút (USDT) để planner tính lại
  // trượt theo cỡ (I7) cho KHỐI LƯỢNG CUỐI thay vì dùng costPct của kế hoạch. BẮT BUỘC (fail closed — rà soát lại vòng 2).
  costModel: CostModel;
  // Ràng buộc cứng người dùng "lỗ thật mỗi lệnh ≤ 2% vốn": đệm funding cho thời gian giữ dự kiến. maxAbsRate = |funding| lớn nhất mỗi kỳ
  // của mã trong COMMON.risk.fundingBufferLookbackDays ngày gần nhất (biết tại thời điểm lập lệnh); intervalHours = chu kỳ funding.
  // Số kỳ = ceil(CONFIG[mode].fundingHoldHours / intervalHours). Bắt buộc — thiếu thì không định cỡ được đúng ràng buộc.
  fundingBuffer: FundingBuffer;
  // #1 sàn chi phí (Task 8, COMMON.risk.maxCostR): funding TB có dấu mỗi kỳ trong COMMON.risk.fundingBufferLookbackDays ngày (dương = Long trả)
  // để ước funding DỰ KIẾN; bắt buộc khi bật sàn chi phí (fail closed), bỏ qua khi tắt.
  fundingMeanRate?: number;
  // #3 phá vỡ (Task 8, COMMON.breakout): giá đóng 1D cuối > đỉnh đóng COMMON.breakout.donchianDays ngày trước đó (nơi gọi tính từ nến 1D
  // đã đóng — core/breakout.ts donchianBreakout). Chỉ xét khi kế hoạch không có TP1 và tùy chọn bật.
  breakout?: { closeAboveDonchian: boolean };
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
  requestedQty: number; // khối lượng 2% vốn bot do planner TỰ tính ở giá khớp xấu nhất (≤ plan.qty — kế hoạch chỉ là trần trên)
  qty: number; // khối lượng thật sẽ vào (sau canOpen + làm tròn bước)
  adjusted: boolean; // true: bị giảm vì danh mục/ký quỹ/thanh khoản (canOpen)
  riskAmount: number; // tiền mất nếu MỌI chân khớp ở giá xấu nhất rồi chạm SL (gồm phí + trượt ước tính)
  realRiskPct: number; // riskAmount / vốn × 100 — luôn ≤ 2% (bất biến)
  leverage: number;
  notional: number; // ở giá khớp xấu nhất
  marginNeeded: number; // ở giá khớp xấu nhất
  worstEntry: number; // giá khớp xa SL nhất được phép
  costPct: number; // phí + trượt khứ hồi (%) dùng cho khối lượng CUỐI (costModel)
  // Mô hình rủi ro dùng để định cỡ: rủi ro(q) = q·a + q²·b (USDT), a gồm |giá xấu nhất − SL|, phí nhóm chiều vào (ở giá xấu nhất) + chiều ra
  // (ở giá SL) và đệm funding fundingPerUnit; b = trượt theo cỡ hai chiều. 1R của bộ mô phỏng = q·(a − fundingPerUnit) + q²·b.
  riskModel: { a: number; b: number; fundingPerUnit: number; fundingSettlements: number };
};

export type PlannerResult = {
  allowed: boolean;
  reasons: string[]; // vì sao từ chối, hoặc vì sao giảm khối lượng (khi allowed)
  legs: DesiredOrder[]; // theo thứ tự đặt; rỗng khi không cho vào
  sizing: Sizing | null;
  exitByFill: ExitScenario[]; // market/limit: [E1]; split: [E1] (chỉ chân market khớp) và [E1, E2]
  // basis 'filled_qty': TP1/trailing LUÔN định cỡ theo khối lượng ĐÃ khớp thật (IOC khớp một phần, split chỉ một chân, ...):
  // exitSplit(khối lượng đã khớp, qtyStep). Khối lượng trong legs là kịch bản "khớp đủ".
  exitRule: { basis: 'filled_qty'; tp1Pct: number; qtyStep: number };
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
  const exitRule: PlannerResult['exitRule'] = { basis: 'filled_qty', tp1Pct: COMMON.zones.exitPcts[0]!, qtyStep: qStep }; // #3 trailing 100%: đặt lại tp1Pct = 0 bên dưới
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
  // Kế hoạch lập với vốn nào thì khối lượng/rủi ro của nó đúng với vốn đó: lệch vốn bot → bot phải lập lại kế hoạch bằng vốn của chính nó
  if (p.capital !== i.capital) problems.push(`Kế hoạch được lập với vốn ${p.capital} USDT nhưng vốn bot là ${i.capital} USDT — bot phải lập lại kế hoạch với vốn của mình rồi mới vào lệnh`);
  if (p.riskPct > COMMON.risk.perTradePct) problems.push(`Rủi ro kế hoạch ${p.riskPct}% vượt ${COMMON.risk.perTradePct}%/lệnh`);
  const tp1Raw = p.targets[0]?.price ?? null;
  const trPlan = p.exit.trailing;
  // #3 (tùy chọn): không TP1 + phá đỉnh Donchian → chỉ SL + trailing 100% (tính ở bước 2 khi đã biết giá xấu nhất)
  const B = COMMON.breakout;
  const trailOnly = tp1Raw === null && B.enabled && B.sides.includes(p.side) && B.modes.includes(i.mode);
  if (trailOnly) {
    if (i.breakout?.closeAboveDonchian !== true) problems.push(`Không TP1 và giá đóng 1D chưa phá đỉnh Donchian ${B.donchianDays} ngày (${i.breakout === undefined ? 'thiếu dữ liệu' : 'chưa phá'}) — không vào lệnh phá vỡ`);
    if (!(typeof p.trailAtr === 'number' && p.trailAtr > 0)) problems.push(`Lệnh phá vỡ cần khoảng trailing ATR của kế hoạch (trailAtr ${String(p.trailAtr)})`);
  } else if (tp1Raw === null || trPlan === null) problems.push('Kế hoạch không có TP1/trailing trên sàn — bot không vào lệnh thiếu TP1');
  if (!(i.markPrice > 0) || !Number.isFinite(i.markPrice)) problems.push(`Giá mark ${i.markPrice} không hợp lệ`);
  if (problems.length > 0 || (!trailOnly && (tp1Raw === null || trPlan === null))) return reject();

  // ---- 2. Giá (làm tròn ĐÚNG như orders.ts → giá trong lệnh mong muốn = giá gửi sàn) ------------
  const side = p.side;
  const d = side === 'long' ? 1 : -1;
  const tick = c.tickSize;
  const awayDir = side === 'long' ? 'down' : 'up'; // SL ra xa giá vào; TP/kích hoạt/limit về phía giá vào (cùng hướng)
  const stop = snapToTick(p.stop, tick, awayDir);
  const hasMarket = p.entryType !== 'limit';
  const hasLimit = p.entryType !== 'market';
  const limitRaw = p.entryType === 'limit' ? (p.limitPrice ?? p.entry) : (p.limitPrice ?? null);
  if (hasLimit && (limitRaw === null || !(limitRaw > 0))) return reject(`Kế hoạch ${p.entryType} thiếu giá limit`);
  const limitPrice = hasLimit ? snapToTick(limitRaw!, tick, awayDir) : null;
  const maxEntry = snapToTick(p.maxEntry, tick, awayDir);
  // Mọi giá khớp được phép: market = [giá mark, giá tối đa]; limit = giá limit
  const fills = [...(hasMarket ? [i.markPrice, maxEntry] : []), ...(limitPrice !== null ? [limitPrice] : [])];
  const worstEntry = d > 0 ? Math.max(...fills) : Math.min(...fills);
  // Chốt lời: C2 = TP1 + trailing kích hoạt tại TP1; #3 phá vỡ = trailing 100% kích hoạt tại giá xấu nhất + activationR × |giá xấu nhất − SL|,
  // callback = trailAtr ÷ giá kích hoạt (làm tròn XUỐNG 0,01 như floorPct; ngoài [min; max] sàn → từ chối ở dưới)
  const tp1 = trailOnly ? null : snapToTick(tp1Raw!, tick, awayDir);
  const activate = trailOnly ? snapToTick(worstEntry + d * B.activationR * Math.abs(worstEntry - stop), tick, awayDir) : snapToTick(trPlan!.activationPrice, tick, awayDir);
  const tr = trailOnly ? { callbackPct: floorPct((p.trailAtr! / activate) * 100) } : trPlan!;

  if (hasMarket && d * (i.markPrice - maxEntry) > 0) problems.push(`Giá mark ${i.markPrice} đã vượt giá tối đa ${maxEntry} — không đuổi giá`);
  if (fills.some((f) => d * (f - stop) <= 0)) problems.push(`SL ${stop} sai phía: phải ${d > 0 ? 'dưới' : 'trên'} mọi giá vào (${fills.join(', ')})`);
  if (d * (i.markPrice - stop) <= 0) problems.push(`Giá mark ${i.markPrice} đã chạm/vượt SL ${stop}`);
  if (tp1 !== null && fills.some((f) => d * (tp1 - f) <= 0)) problems.push(`TP1 ${tp1} sai phía: phải ${d > 0 ? 'trên' : 'dưới'} mọi giá vào (${fills.join(', ')})`);
  if (tp1 !== null && activate !== tp1) problems.push(`Giá kích hoạt trailing ${activate} ≠ TP1 ${tp1}`);
  const { binanceTrailCallbackMinPct: cbMin, binanceTrailMaxCallbackPct: cbMax } = COMMON;
  if (!(tr.callbackPct >= cbMin && tr.callbackPct <= cbMax)) problems.push(`callbackRate ${tr.callbackPct} ngoài [${cbMin}; ${cbMax}]`);
  const cm = i.costModel;
  const fb = i.fundingBuffer;
  problems.push(...fundingBufferProblems(fb).map((x) => `${x} — cần để giữ lỗ ≤ ${COMMON.risk.perTradePct}%`));
  problems.push(...costModelProblems(cm)); // bắt buộc (fail closed): không quay về phí kế hoạch
  // KL 1 phút = Infinity (chỉ dùng trong test của core) nghĩa là trượt theo cỡ = 0 — bot chạy thật phải có KL thật (rà soát lại Task 3 vòng 2)
  if (cm !== undefined && !Number.isFinite(cm.quoteVolPerMin)) problems.push(`costModel: KL 1 phút ${cm.quoteVolPerMin} không hữu hạn — trượt theo cỡ sẽ bằng 0 mà không báo`);
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

  // ---- 3. Khối lượng 2% do planner TỰ tính ở giá khớp XẤU NHẤT (rà soát B3 #1/#2) --------------------------------------
  // Không tin plan.qty/plan.riskPct (kế hoạch có thể lập với vốn khác, hoặc ở giá kế hoạch thay vì giá xấu nhất).
  // Rủi ro(q) = q·a + q²·b (packages/core/sizing.ts riskModel): a = |giá xấu nhất − SL| + nửa phí nhóm ở giá xấu nhất + nửa phí nhóm ở giá SL
  // + đệm funding/coin; b = trượt theo cỡ hai chiều. Khối lượng = nghiệm dương của rủi ro(q) = 2% vốn, làm tròn xuống theo bước.
  // plan.qty chỉ là trần trên (vd kế hoạch mô hình chỉ đặt limit cho 50% khối lượng) — không bao giờ phóng to.
  const dec = tickDecimals(qStep);
  const floorQ = (x: number) => (x > 0 && Number.isFinite(x) ? Number((Math.floor(x / qStep + 1e-9) * qStep).toFixed(dec)) : 0);
  // Lỗ thật khi chạm SL (ràng buộc cứng ≤ 2% vốn): công thức DUY NHẤT ở packages/core/sizing.ts (dùng chung với kế hoạch/bản in máy quét).
  const cost: CostModel = cm!;
  const model = riskModel(i.mode, worstEntry, stop, cost, fb);
  const { a: ra, fundingPerUnit, fundingSettlements } = model;
  const riskAt = (q: number) => riskAtModel(model, q);
  const qForRisk = (r: number) => qtyForRisk(model, r);
  const costAt = (q: number) => costPctAt(cost, q * worstEntry); // % khứ hồi
  const budget = (i.capital * COMMON.risk.perTradePct) / 100;
  const riskCapQty = floorQ(qForRisk(budget)); // khối lượng tối đa theo trần 2% vốn
  const requestedQty = floorQ(Math.min(p.qty, qForRisk(budget)));
  const perUnit = requestedQty > 0 ? riskAt(requestedQty) / requestedQty : ra;
  const pctVn = (qty: number) => ((riskAt(qty) / i.capital) * 100).toFixed(2).replace('.', ',');
  // Ghi rõ giới hạn nào đang áp dụng và rủi ro thực sau đó (không giảm âm thầm)
  if (requestedQty < floorQ(p.qty)) {
    adjust.push(`Khối lượng bị cắt về trần ${COMMON.risk.perTradePct}% vốn: kế hoạch ${p.qty} → ${requestedQty} coin (${i.capital} USDT × ${COMMON.risk.perTradePct}% ÷ ${perUnit} USDT/coin ở giá xấu nhất ${worstEntry}); rủi ro thực ${pctVn(requestedQty)}%`);
  } else if (requestedQty < riskCapQty) {
    adjust.push(`Khối lượng kế hoạch ${p.qty} coin nhỏ hơn trần ${COMMON.risk.perTradePct}% vốn ${riskCapQty} coin — giữ khối lượng kế hoạch; rủi ro thực ${pctVn(requestedQty)}%`);
  }
  if (!(requestedQty > 0)) return reject(`Khối lượng 2% vốn (${budget.toFixed(2)} USDT ÷ ${perUnit} USDT/coin ở giá xấu nhất ${worstEntry}) nhỏ hơn bước ${qStep}`);

  // ---- 4. Danh mục (canOpen) ở giá xấu nhất: trần 10 lệnh còn rủi ro, tổng rủi ro ≤ 10%, ký quỹ, thanh khoản, bộ lọc sàn ----
  // Mọi chân vào đều là LIMIT (chân "market" = LIMIT IOC) → bộ lọc LOT_SIZE.
  let po;
  try {
    po = canOpen({
      symbol: c.symbol, side, entry: worstEntry, stop, qty: requestedQty, leverage: lev,
      costPct: ((riskAt(requestedQty) / requestedQty - Math.abs(worstEntry - stop)) / worstEntry) * 100, // cùng rủi ro/coin với định cỡ ở trên
      entryType: 'limit', filters: c, maxNotional: i.maxNotional,
    }, i.openTrades, i.capital);
  } catch (e) {
    return reject(`Kiểm danh mục lỗi: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!po.allowed) return reject(...po.reasons);
  adjust.push(...po.reasons);

  // ---- 5. Khối lượng: các chân vào, TP1, trailing (theo bước thô) -------------------------------------------------------
  const qty = floorQ(Math.min(po.adjustedQty, requestedQty));
  if (!(qty > 0)) return reject(`Khối lượng ${po.adjustedQty} nhỏ hơn bước ${qStep}`);
  const adjusted = qty < requestedQty;
  if (adjusted) adjust.push(`Khối lượng giảm tiếp ${requestedQty} → ${qty} coin do giới hạn danh mục/ký quỹ/thanh khoản (lý do ở trên); rủi ro thực ${pctVn(qty)}%`);
  const riskAmount = riskAt(qty);
  const realRiskPct = (riskAmount / i.capital) * 100;
  if (realRiskPct > COMMON.risk.perTradePct + 1e-9) problems.push(`Rủi ro thực ${realRiskPct.toFixed(4)}% ở giá xấu nhất vượt ${COMMON.risk.perTradePct}%/lệnh`);
  // Dừng sàn hòa vốn (D10): giá vào xấu nhất + phí khứ hồi CỦA KHỐI LƯỢNG CUỐI, phải nằm giữa giá vào và TP1 (đặt sau khi TP1 khớp).
  // Cần khi callback của trailing lớn hơn khoảng bảo đảm không lỗ tính với phí đó (mức dừng lúc kích hoạt < hòa vốn).
  const costPct = costAt(qty);
  // #3 trailing 100% không có TP1 → không có dừng sàn hòa vốn (trailing kích hoạt tại +1R, callback theo ATR — có thể thoát dưới hòa vốn)
  const noLossPct = tp1 === null ? Infinity : ((d * (tp1 - worstEntry * (1 + (d * costPct) / 100))) / tp1) * 100;
  const beTrigger = tr.callbackPct > noLossPct + 1e-12 ? snapToTick(worstEntry * (1 + (d * costPct) / 100), tick, d > 0 ? 'up' : 'down') : null;
  if (beTrigger !== null && tp1 !== null && d * (tp1 - beTrigger) <= 0) {
    problems.push(`Dừng sàn hòa vốn ${beTrigger} (giá vào ${worstEntry} + phí ${Number(costPct.toFixed(6))}%) không nằm trước TP1 ${tp1} — TP1 chưa bù phí`);
  }
  let entryQty: number[];
  if (p.entryType === 'split') {
    const m = COMMON.patterns.plan.splitMarketPct;
    entryQty = splitQuantity(qty, qStep, [m, 100 - m]);
  } else {
    entryQty = [qty];
  }
  const kinds: Array<'market' | 'limit'> = p.entryType === 'split' ? ['market', 'limit'] : [p.entryType];
  // Giá kiểm MIN_NOTIONAL cho chân "market" (IOC): giá khớp cho notional NHỎ nhất trong dải (thận trọng)
  const marketRef = Math.min(i.markPrice, maxEntry);
  const legPrice = (k: 'market' | 'limit') => (k === 'market' ? marketRef : limitPrice!);
  kinds.forEach((k, j) => {
    if (!isStepMultiple(entryQty[j]!, c.stepSize) || !isStepMultiple(entryQty[j]!, c.marketStepSize)) problems.push(`Khối lượng chân ${k} ${entryQty[j]} không theo bước`);
    problems.push(...entryLegProblems({ kind: 'limit', price: legPrice(k), qty: entryQty[j]! }, c));
  });
  const roles: EntryRole[] = kinds.map((_, j) => (j === 0 ? 'E1' : 'E2'));
  const scenarios: ExitScenario[] = [];
  const split = (q: number) => (trailOnly ? { tp1Qty: 0, trailQty: q } : exitSplit(q, qStep));
  if (trailOnly) exitRule.tp1Pct = 0;
  if (p.entryType === 'split') scenarios.push({ filled: ['E1'], positionQty: entryQty[0]!, ...split(entryQty[0]!) });
  scenarios.push({ filled: roles, positionQty: qty, ...split(qty) });
  for (const s of scenarios) {
    problems.push(...exitPartProblems(trailOnly ? [s.trailQty] : [s.tp1Qty, s.trailQty], c).map((x) => `${s.filled.length === 1 && p.entryType === 'split' ? 'Chỉ chân market khớp: ' : ''}${x}`));
  }
  const full = scenarios[scenarios.length - 1]!;

  // ---- 5b. #1 sàn chi phí (tùy chọn): chi phí chắc chắn trả của lệnh, tính bằng R thô (khoảng SL) ---------------------------------
  const maxCostR = COMMON.risk.maxCostR;
  if (maxCostR !== null) {
    const cr = costR({ side, entryType: p.entryType, entry: worstEntry, stop, qty, cost, fundingMeanRate: i.fundingMeanRate, mode: i.mode, intervalHours: fb.intervalHours });
    if (cr === null) problems.push('Sàn chi phí bật nhưng thiếu fundingMeanRate (funding TB gần đây) — không ước được funding dự kiến');
    else if (cr > maxCostR) problems.push(`Bỏ theo sàn chi phí (#1): phí + trượt + funding dự kiến = ${cr.toFixed(2).replace('.', ',')}R > ${String(maxCostR).replace('.', ',')}R`);
  }

  // ---- 6. Bậc ký quỹ + thanh lý ở khối lượng thật: thanh lý cách giá vào ≥ (1 + đệm) × khoảng SL, ở mọi giá khớp --------
  const notional = qty * worstEntry;
  const tier = mmrFor(qty * worstEntry, i.leverageBrackets);
  if (lev > tier.maxLeverage) problems.push(`Đòn bẩy ${lev}× vượt trần bậc ký quỹ ${tier.maxLeverage}× ở notional ${Math.round(qty * worstEntry)} USDT`);
  const buf = COMMON.liquidationBufferStops;
  for (const f of fills) {
    const liq = liquidationPrice(f, lev, side, tier.mmr);
    if (d * (f - liq) < (1 + buf) * d * (f - stop) - 1e-9) {
      problems.push(`Giá thanh lý ước tính ${liq.toFixed(tickDecimals(tick))} (giá vào ${f}, ${lev}×) không cách SL ${stop} đủ ${buf} khoảng cắt lỗ`);
    }
  }

  // ---- 7. Chỗ lệnh (MAX_NUM_ORDERS) ----------------------------------------------------------------------------------
  const slots = bracketSlots({ entryLegs: kinds.length, tp1: tp1 !== null, trailing: true, breakevenFloor: beTrigger !== null });
  if (!Number.isInteger(i.openOrderCount) || i.openOrderCount < 0) problems.push(`openOrderCount ${i.openOrderCount} phải là số nguyên ≥ 0`);
  else if (i.openOrderCount + slots > c.maxNumOrders) problems.push(`Đã có ${i.openOrderCount} lệnh mở trên ${c.symbol}; cả bộ cần ${slots} lệnh sẽ vượt MAX_NUM_ORDERS ${c.maxNumOrders}`);

  // ---- 8. Mã client tất định ----------------------------------------------------------------------------------------
  const idOf = (leg: string): ClientIdParts => ({ runId: i.runId, signalId: i.signal!.id, leg, attempt: 0 });
  try {
    makeClientId(idOf('E1'));
  } catch (e) {
    problems.push(`Mã client sai: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (problems.length > 0) return reject();

  // ---- 9. Dựng các chân theo thứ tự đặt. openCount = lệnh có sẵn + các chân đặt trước nó; lệnh vào giữ chỗ phần còn lại ----
  const legs: DesiredOrder[] = [];
  const base = i.openOrderCount;
  const tp1Qty = full.tp1Qty;
  const trailQty = full.trailQty;
  const cancelAt = tp1 !== null && (p.cancelIfTp1First ?? true) && d * (tp1 - i.markPrice) > 0 ? tp1 : null;
  kinds.forEach((k, j) => {
    const common = { contract: c, side, qty: entryQty[j]!, id: idOf(roles[j]!), openCount: base + j, reserveSlots: slots - j };
    // Chân "market" = LIMIT IOC giá trần = giá tối đa (Long làm tròn XUỐNG, Short LÊN): sàn không bao giờ khớp vượt giá cho phép;
    // phần không khớp tự hủy → bộ lệnh thoát định cỡ theo khối lượng đã khớp (exitRule.basis = 'filled_qty').
    const input: EntryInput = k === 'market'
      ? { ...common, kind: 'limit', limitPrice: maxEntry, ioc: true }
      : { ...common, kind: 'limit', limitPrice: limitPrice!, ...(expireAt !== undefined ? { expireAt } : {}) };
    legs.push({ op: 'placeEntry', role: roles[j]!, when: 'now', clientId: makeClientId(input.id), input, cancelIfMarkReaches: k === 'limit' ? cancelAt : null });
  });
  let n = kinds.length;
  const slId = idOf('SL');
  legs.push({ op: 'placeStopLoss', role: 'SL', when: 'on_entry_fill', clientId: makeClientId(slId),
    input: { contract: c, side, triggerPrice: stop, purpose: 'initial', id: slId } });
  n++;
  if (tp1 !== null) {
    const tpId = idOf('TP1');
    legs.push({ op: 'placeTakeProfit', role: 'TP1', when: 'on_entry_fill', clientId: makeClientId(tpId),
      input: { contract: c, side, entryPrice: worstEntry, triggerPrice: tp1, qty: tp1Qty, id: tpId, openCount: base + n } });
    n++;
  }
  const trId = idOf('TR');
  legs.push({ op: 'placeTrailing', role: 'TR', when: 'on_entry_fill', clientId: makeClientId(trId),
    input: { contract: c, side, entryPrice: worstEntry, activatePrice: activate, callbackPct: tr.callbackPct, qty: trailQty, id: trId, openCount: base + n } });
  n++;
  if (beTrigger !== null) {
    const beId = idOf('BE');
    legs.push({ op: 'placeStopLoss', role: 'BE', when: 'on_tp1_fill', clientId: makeClientId(beId),
      input: { contract: c, side, triggerPrice: beTrigger, purpose: 'breakeven', id: beId } });
  }

  // ---- 10. Chốt chặn cuối: chạy đúng bộ dựng request của orders.ts cho TỪNG chân. Một chân bị từ chối tại chỗ → bỏ cả bộ ----
  // SL kiểm với giá mark hiện tại; dừng sàn hòa vốn kiểm với giá mark dự kiến lúc đặt (= TP1).
  for (const l of legs) {
    const b = l.op === 'placeEntry' ? builders.entry(l.input, i.now)
      : l.op === 'placeStopLoss' ? builders.stopLoss({ ...l.input, markPrice: l.role === 'BE' && tp1 !== null ? tp1 : i.markPrice })
        : l.op === 'placeTakeProfit' ? builders.takeProfit(l.input) : builders.trailing(l.input);
    if (!b.ok) problems.push(...b.problems.map((x) => `${l.role}: ${x}`));
  }
  if (problems.length > 0) return reject();

  return {
    allowed: true, reasons: adjust, legs, exitByFill: scenarios, exitRule,
    sizing: { requestedQty, qty, adjusted, riskAmount, realRiskPct, leverage: lev, notional, marginNeeded: notional / lev, worstEntry, costPct,
      riskModel: { a: ra, b: model.b, fundingPerUnit, fundingSettlements } },
  };
}

