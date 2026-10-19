import type { Candle, Mode, Side } from '../types.ts';
import { CONFIG, COMMON } from '../config.ts';
import { roundStep } from '../indicators.ts';
import { snapToTick, formatTick, tickDecimals } from '../price.ts';
import { targetSideZones, zoneContaining, describeZone, type Zone } from '../zones.ts';
import { positionSize, splitQuantity, liquidationPrice, maxSafeLeverage, vn, type CostTier, type Target, type FillRow } from '../plan.ts';
import type { MultiMonthContext } from './context.ts';
import type { StateResult } from './state.ts';
import type { PatternGeometry, PatternKind } from './types.ts';

// Kế hoạch lệnh theo mô hình biểu đồ (báo cáo "Mô hình biểu đồ cho BTC", mục (2) đệm cắt lỗ, (3), (4)).
// Dùng lại khối lượng / chia 50-30-20 / thanh lý / làm tròn tick của plan.ts; chỉ phần chọn giá là riêng cho mô hình.

// Một chân vào lệnh. q = khối lượng chốt ở TP1/TP2/TP3 của RIÊNG chân này.
export type EntryLeg = { kind: 'market' | 'limit'; price: number; qty: number; q: [number, number, number] };

// Một dòng bảng khối lượng theo giá khớp của chân market (chân limit giữ nguyên giá).
// fill = giá chân market (hoặc giá limit nếu chỉ có limit); qty/q/estLoss = khi MỌI chân đều khớp.
export type PatternFillRow = FillRow & { legs: EntryLeg[]; avgEntry: number };

export type PatternPlan = {
  kind: PatternKind;
  timeframe: string;
  side: Side;
  entryType: 'market' | 'split' | 'limit'; // split = 50% market + 50% limit
  marketPrice: number; // giá đóng nến gần nhất
  breakoutLine: number; // giá đường phá tại nến phá (mức cố định dùng cho limit và luật sau TP1)
  atr: number; // A = ATR khung nhận diện tại nến cuối
  distanceAtr: number; // d = (giá hiện tại − đường phá) / A, dương = ngoài mô hình
  entry: number; // giá DÙNG ĐỂ TÍNH: market = giá hiện tại; limit = giá limit; split = giá TB khi khớp cả hai chân
  limitPrice: number | null;
  limitExpiryBars: number | null;
  limitExpiryHours: number | null;
  cancelIfTp1First: boolean; // chỉ true khi TP1 nằm phía trước giá hiện tại
  maxEntry: number; // giá khớp xấu nhất cho chân market; chỉ limit thì = giá limit
  entryReason: string;
  stop: number;
  stopReason: string;
  riskAtr: number; // R ở giá khớp xấu nhất có thể (chân market tại giá hiện tại, hoặc giá limit) / A
  targetShort: number; // T_ngắn (theo tick)
  targetFull: number; // T_đủ (theo tick)
  targets: Target[]; // 3 phần tử; qty = khi mọi chân khớp
  targetsIfMarketOnly: [number, number, number] | null; // split: khối lượng TP nếu chỉ khớp chân market
  tp1NetR: number; // TP1 tính bằng R sau phí khứ hồi + funding phải trả, ở giá khớp xấu nhất
  afterTp1Stop: number;
  afterTp1StopIfMarketOnly: number | null;
  afterTp1Reason: string;
  valid: boolean;
  invalidReason: string | null;
  trailAtr: number;
  riskPerUnit: number; // |entry − SL|
  qty: number;
  notional: number;
  riskAmount: number; // ngân sách rủi ro (vốn × %)
  estLoss: number; // tiền mất ước tính nếu chạm SL khi mọi chân khớp
  fillTable: PatternFillRow[];
  riskPct: number;
  safeLeverage: number;
  suggestedLeverage: number;
  liquidationEstimate: number;
  marginNeeded: number;
  fundingCostR: number;
  timeStopHours: number;
  maxHoldHours: number;
  notes: string[];
};

export type PatternPlanResult = {
  status: 'ready' | 'wait_confirm' | 'rejected';
  plan: PatternPlan | null; // null khi chưa đủ điều kiện để tính số (sai trạng thái, chờ xác nhận...)
  reason: string | null;
};

export type PatternPlanArgs = {
  mode: Mode;
  geometry: PatternGeometry;
  state: StateResult; // evaluateState tại nến cuối của `candles`
  candles: Candle[]; // nến ĐÃ ĐÓNG của khung nhận diện, cùng chỉ số với geometry/state
  atr: number[]; // ATR(14) khung nhận diện, cùng độ dài candles
  atr1h: number; // ATR(14) khung 1H tại nến phá (luật chờ thêm 1 nến)
  zones: Zone[];
  multiMonth: MultiMonthContext | null; // từ contextFlags
  btcSma200ReclaimedAt: number | null; // thời điểm (ms) BTC đóng nến ngày lấy lại SMA200 gần nhất; null = không có
  capital: number;
  riskPct: number;
  costTier: CostTier;
  tickSize: number;
  stepSize: number;
  fundingRate: number; // mức MỖI KỲ funding
  fundingIntervalHours: number;
};

const TF_HOURS: Record<string, number> = { '15m': 0.25, '1h': 1, '4h': 4, '1d': 24 };
const isFlag = (k: PatternKind) => k === 'bull_flag' || k === 'bear_flag';
const isTriangle = (k: PatternKind) => k === 'asc_triangle' || k === 'desc_triangle' || k === 'sym_triangle';
const num = (x: number) => String(x).replace('.', ',');

function stopLabel(kind: PatternKind, side: Side): string {
  if (isFlag(kind)) return side === 'long' ? 'Đáy cờ' : 'Đỉnh cờ';
  if (kind === 'double_top' || kind === 'double_bottom') return side === 'long' ? 'Đáy thấp hơn' : 'Đỉnh cao hơn';
  if (kind === 'head_shoulders' || kind === 'inv_head_shoulders') return 'Vai phải';
  if (isTriangle(kind)) return 'Pivot gần nhất phía đối diện';
  return 'Mức cắt lỗ của mô hình';
}

export function buildPatternPlan(a: PatternPlanArgs): PatternPlanResult {
  const P = COMMON.patterns.plan;
  const cfg = CONFIG[a.mode];
  const g = a.geometry;
  const s = a.state;
  const c = a.candles;
  const reject = (reason: string): PatternPlanResult => ({ status: 'rejected', plan: null, reason });

  if (c.length === 0) throw new Error('buildPatternPlan: chuỗi nến rỗng');
  if (a.atr.length !== c.length) throw new Error(`buildPatternPlan: độ dài atr (${a.atr.length}) khác độ dài nến (${c.length})`);
  if (g.kind === 'multi_month_range') return reject('Vùng nhiều tháng chỉ là bối cảnh — không lập lệnh trực tiếp');
  if (s.state !== 'breakout' && s.state !== 'retested') {
    return reject(`Mô hình đang ở trạng thái ${s.state} — chỉ lập lệnh khi đã phá vỡ (breakout/retested)`);
  }
  if (s.signalStale) return reject(`Tín hiệu phá vỡ đã cũ hơn ${COMMON.patterns.maxSignalAgeBars} nến — không lập lệnh`);
  if (s.inBreakoutWindow === false) {
    const w = COMMON.patterns.state.triangleWindow;
    return reject(`Tam giác phá ngoài cửa sổ ${w.min * 100}–${w.max * 100}% quãng tới apex — không lập lệnh`);
  }
  if (s.side === null || s.breakoutIndex === null || s.breakoutLine === null) {
    throw new Error('buildPatternPlan: trạng thái phá vỡ thiếu side / breakoutIndex / breakoutLine');
  }
  const last = c.length - 1;
  const bi = s.breakoutIndex;
  if (!Number.isInteger(bi) || bi < 0 || bi > last) throw new Error(`buildPatternPlan: breakoutIndex ${bi} ngoài dữ liệu (${c.length} nến)`);
  const A = a.atr[last]!;
  if (!Number.isFinite(A) || A <= 0) throw new Error(`buildPatternPlan: ATR khung nhận diện không hợp lệ (${A})`);
  if (!Number.isFinite(a.atr1h) || a.atr1h <= 0) throw new Error(`buildPatternPlan: ATR 1H không hợp lệ (${a.atr1h})`);
  if (!Number.isFinite(a.fundingIntervalHours) || a.fundingIntervalHours <= 0) {
    throw new Error(`buildPatternPlan: chu kỳ funding không hợp lệ (${a.fundingIntervalHours})`);
  }
  if (!Number.isFinite(g.height) || g.height <= 0) throw new Error(`buildPatternPlan: chiều cao mô hình không hợp lệ (${g.height})`);
  const tfHours = TF_HOURS[g.timeframe];
  if (tfHours === undefined) throw new Error(`buildPatternPlan: khung không hỗ trợ: ${g.timeframe}`);

  const side: Side = s.side === 'up' ? 'long' : 'short';
  const dir = side === 'long' ? 1 : -1;
  const tick = a.tickSize;
  const fp = (x: number) => formatTick(x, tick);
  const dz = (z: Zone) => describeZone(z, tick);
  const away = side === 'long' ? 'down' : 'up'; // SL ra xa giá vào
  const toward = side === 'long' ? 'down' : 'up'; // TP vào gần giá vào; giá limit Long xuống / Short lên
  const pm = side === 'long' ? '+' : '−';
  const mp = side === 'long' ? '−' : '+';
  const line = s.breakoutLine;
  const marketPrice = c[last]!.close;

  // ---- Chờ thêm 1 nến khi nến phá quá dài (biên độ > 3×ATR 1H) ----
  const range = c[bi]!.high - c[bi]!.low;
  if (range > P.waitRangeAtr1h * a.atr1h) {
    const where = side === 'long' ? 'trên' : 'dưới';
    if (bi === last) {
      return { status: 'wait_confirm', plan: null,
        reason: `Chờ xác nhận: nến phá biên độ ${fp(range)} > ${P.waitRangeAtr1h}×ATR(1H) = ${fp(P.waitRangeAtr1h * a.atr1h)} — chờ thêm 1 nến đóng giữ được ${where} đường phá ${fp(line)} rồi mới vào` };
    }
    const nextLine = side === 'long' ? g.upper(bi + 1) : g.lower(bi + 1);
    if (dir * (c[bi + 1]!.close - nextLine) <= 0) {
      return reject(`Nến phá biên độ lớn (${fp(range)} > ${P.waitRangeAtr1h}×ATR(1H)) và nến sau không giữ được ${where} đường phá ${fp(nextLine)} — bỏ`);
    }
  }

  const d = (dir * (marketPrice - line)) / A;
  if (d <= 0) return reject(`Giá đã quay vào trong mô hình (đóng ${fp(marketPrice)}, đường phá ${fp(line)}) — không lập lệnh`);

  // ---- Kiểu vào lệnh theo d ----
  let entryType: PatternPlan['entryType'] = d <= P.marketMaxAtr ? 'market' : d <= P.splitMaxAtr ? 'split' : 'limit';
  const notes = [...s.notes];
  const now = c[last]!.closeTime;
  const reversalShort = side === 'short' && (g.kind === 'double_top' || g.kind === 'head_shoulders');
  let blockedMarket = false;
  if (reversalShort && a.btcSma200ReclaimedAt !== null) {
    if (a.btcSma200ReclaimedAt > now) throw new Error('buildPatternPlan: btcSma200ReclaimedAt nằm sau nến cuối (dữ liệu tương lai)');
    if (now - a.btcSma200ReclaimedAt < P.reversalShortBlockDays * 86_400_000 && entryType !== 'limit') {
      entryType = 'limit';
      blockedMarket = true;
    }
  }
  const hasLimit = entryType !== 'market';
  const limitPrice = hasLimit ? snapToTick(line + dir * P.limitOffsetAtr * A, tick, toward) : null;
  if (limitPrice !== null && dir * (marketPrice - limitPrice) <= 0) {
    return reject(`Giá limit ${fp(limitPrice)} (đường phá ${pm} ${num(P.limitOffsetAtr)}×A) không nằm ${side === 'long' ? 'dưới' : 'trên'} giá hiện tại ${fp(marketPrice)} — không đặt được limit${blockedMarket ? '; Short đảo chiều đang bị cấm vào trực tiếp' : ''}`);
  }

  // ---- Cắt lỗ: mức của mô hình ± đệm, đẩy qua số tròn ----
  const stopRef = side === 'long' ? g.stopRef.up : g.stopRef.down;
  let stop = snapToTick(stopRef - dir * P.stopBufferAtr * A, tick, away);
  let stopReason = `${stopLabel(g.kind, side)} ${fp(stopRef)} ${mp} ${num(P.stopBufferAtr)}×A = ${fp(stop)}`;
  {
    // Số tròn nằm trong vùng đệm (giữa mức mô hình và SL) hoặc sát ngoài SL (< 0,2×A) → SL qua hẳn số tròn 0,2×A
    const step = roundStep(marketPrice);
    const prox = COMMON.roundNumberProximityAtr * A;
    const round = side === 'long' ? Math.ceil((stop - prox) / step - 1e-9) * step : Math.floor((stop + prox) / step + 1e-9) * step;
    const inBand = side === 'long' ? round > stop - prox && round <= stopRef : round < stop + prox && round >= stopRef;
    if (inBand) {
      const pushed = snapToTick(round - dir * prox, tick, away);
      if (dir * (stop - pushed) > 0) {
        stop = pushed;
        stopReason += `; đẩy qua số tròn ${fp(round)} = ${fp(stop)}`;
      }
    }
  }
  const worstEntry = entryType === 'limit' ? limitPrice! : marketPrice; // giá khớp xa SL nhất
  for (const e of [marketPrice, ...(limitPrice === null ? [] : [limitPrice])]) {
    if (dir * (e - stop) <= 0) return reject(`SL ${fp(stop)} nằm sai phía giá vào ${fp(e)} — mô hình không còn hợp lệ`);
  }

  // ---- Mục tiêu (mục 3) ----
  let tShortRaw: number;
  let tFullRaw: number;
  if (isFlag(g.kind)) {
    const base = side === 'long' ? g.stopRef.up : g.stopRef.down; // đáy cờ (Long) / đỉnh cờ (Short)
    tFullRaw = base + dir * P.flagPoleRatio * g.height;
    if (dir * (tFullRaw - line) <= 0) return reject(`Mục tiêu cờ T_đủ ${fp(tFullRaw)} không vượt đường phá ${fp(line)} — không lập lệnh`);
    tShortRaw = line + P.flagShortFraction * (tFullRaw - line);
  } else {
    const ratio = (P.targetRatio as Partial<Record<PatternKind, number>>)[g.kind] ?? P.defaultTargetRatio;
    tShortRaw = line + dir * g.height * ratio;
    tFullRaw = line + dir * g.height;
  }
  const targetShort = snapToTick(tShortRaw, tick, toward);
  const targetFull = snapToTick(tFullRaw, tick, toward);
  const ref = entryType === 'limit' ? limitPrice! : marketPrice; // TP phải nằm phía trước giá vào xa nhất
  const zoneTp = (z: Zone) => snapToTick((side === 'long' ? z.low : z.high) - dir * COMMON.zones.tpBufferAtr * A, tick, toward);
  const nearEdge = (z: Zone) => (side === 'long' ? z.low : z.high);

  if (dir * (targetShort - ref) <= 0) {
    return reject(`Giá vào ${fp(ref)} đã vượt mục tiêu rút gọn T_ngắn ${fp(targetShort)} — không còn chỗ cho TP1`);
  }
  const first = targetSideZones(a.zones, ref, side)[0] ?? null;
  let tp1: number;
  let tp1Reason: string;
  if (first !== null && dir * (zoneTp(first) - ref) <= 0) {
    return reject(`${side === 'long' ? 'Kháng cự' : 'Hỗ trợ'} ngay sát giá vào ${dz(first)} — không có chỗ đặt TP1`);
  }
  if (first !== null && dir * (zoneTp(first) - targetShort) < 0) {
    tp1 = zoneTp(first);
    tp1Reason = `Trước vùng cản ${dz(first)} (gần hơn T_ngắn ${fp(targetShort)})`;
  } else {
    tp1 = targetShort;
    tp1Reason = `T_ngắn = đường phá ${pm} ${isFlag(g.kind) ? `½ quãng tới T_đủ` : `h×p`} = ${fp(targetShort)}`;
  }

  // TP2 / TP3 và biên vùng nhiều tháng
  const ahead = targetSideZones(a.zones, tp1, side).filter((z) => dir * (zoneTp(z) - tp1) > 0);
  let tp2: number | null;
  let tp2Reason: string;
  let tp2Zone: Zone | null = null;
  const nearFull = ahead.filter((z) => z.low <= tFullRaw + P.tp2NearAtr * A && z.high >= tFullRaw - P.tp2NearAtr * A);
  const gap = (z: Zone) => (z.low <= tFullRaw && tFullRaw <= z.high ? 0 : Math.min(Math.abs(z.low - tFullRaw), Math.abs(z.high - tFullRaw)));
  if (nearFull.length > 0) {
    tp2Zone = nearFull.reduce((best, z) => (gap(z) < gap(best) ? z : best));
    tp2 = zoneTp(tp2Zone);
    tp2Reason = `Trước vùng ${dz(tp2Zone)} gần T_đủ ${fp(targetFull)}`;
  } else {
    const before = ahead.filter((z) => dir * (nearEdge(z) - tFullRaw) < 0);
    if (before.length > 0) {
      tp2Zone = before[before.length - 1]!;
      tp2 = zoneTp(tp2Zone);
      tp2Reason = `Trước vùng ${dz(tp2Zone)} — vùng gần nhất trước T_đủ ${fp(targetFull)}`;
    } else if (dir * (targetFull - tp1) > 0) {
      tp2 = targetFull;
      tp2Reason = `Không có vùng S/R trước T_đủ — dùng T_đủ = ${fp(targetFull)}`;
    } else {
      tp2 = null;
      tp2Reason = 'Không còn mục tiêu — phần này để trailing stop';
    }
  }
  let tp3: number | null = null;
  let tp3Reason = `Không còn vùng cản — phần này để trailing stop (${cfg.trailAtrMult}×ATR)`;
  if (tp2 !== null) {
    const next = targetSideZones(a.zones, tp2, side).find((z) => z !== tp2Zone && dir * (zoneTp(z) - tp2!) > 0);
    if (next) {
      tp3 = zoneTp(next);
      tp3Reason = `Trước vùng cản ${dz(next)}`;
    }
  } else {
    tp3Reason = tp2Reason;
  }
  let dropTp3 = false;
  const mm = a.multiMonth;
  if (mm !== null) {
    const edge = side === 'long' ? mm.upper : mm.lower;
    const unbroken = side === 'long' ? mm.state !== 'broken_up' : mm.state !== 'broken_down';
    if (unbroken && dir * (edge - ref) > 0 && dir * (tFullRaw - edge) > 0) {
      const capTp = snapToTick(edge - dir * COMMON.zones.tpBufferAtr * A, tick, toward);
      if (dir * (capTp - tp1) <= 0) {
        return reject(`Biên ${side === 'long' ? 'trên' : 'dưới'} vùng nhiều tháng chưa phá ${fp(edge)} nằm trước TP1 ${fp(tp1)} — không đủ chỗ`);
      }
      tp2 = capTp;
      tp2Reason = `T_đủ ${fp(targetFull)} nằm sau biên vùng nhiều tháng chưa phá ${fp(edge)} → TP2 trước biên đó`;
      tp3 = null;
      tp3Reason = 'Bỏ TP3: T_đủ nằm sau biên vùng nhiều tháng chưa phá — phần 20% chốt cùng TP2';
      dropTp3 = true;
    }
  }
  const ex = COMMON.zones.exitPcts;
  const pcts: number[] = dropTp3 ? [ex[0]!, ex[1]! + ex[2]!] : [...ex];
  const prices = [tp1, tp2, tp3];
  const reasons = [tp1Reason, tp2Reason, tp3Reason];

  // ---- Chi phí và R:R ở giá khớp xấu nhất ----
  const costPct = COMMON.costRoundTripPct[a.costTier];
  const fundingEvents = cfg.fundingHoldHours / a.fundingIntervalHours;
  const fundingPaidFrac = Math.max(0, dir * a.fundingRate * fundingEvents); // chỉ tính khi lệnh phải TRẢ funding
  const costFrac = costPct / 100 + fundingPaidFrac;
  const netR = (f: number) => (dir * (tp1 - f) - costFrac * f) / Math.abs(f - stop);
  const minR = isFlag(g.kind) ? P.flagMinTp1R : P.minTp1R;
  const tp1NetR = netR(worstEntry);
  const riskAtr = Math.abs(worstEntry - stop) / A;

  // Giá tối đa cho chân market: ≤ maxEntryAtr×A, R ≤ maxRiskAtr×A, và TP1 sau phí ≥ minR
  // dir(TP1 − f) − k·f ≥ m·dir(f − SL) ⇔ Long f ≤ (TP1 + m·SL)/(1 + m + k); Short f ≥ (TP1 + m·SL)/(1 + m − k)
  let maxEntry = worstEntry;
  if (entryType !== 'limit') {
    const capFill = (tp1 + minR * stop) / (1 + minR + dir * costFrac);
    const raw = side === 'long'
      ? Math.min(marketPrice + cfg.maxEntryAtr * A, stop + P.maxRiskAtr * A, capFill)
      : Math.max(marketPrice - cfg.maxEntryAtr * A, stop - P.maxRiskAtr * A, capFill);
    const snapped = snapToTick(raw, tick, toward);
    maxEntry = side === 'long' ? Math.max(snapped, marketPrice) : Math.min(snapped, marketPrice);
  }

  // ---- Khối lượng theo chân ----
  const stepDec = tickDecimals(a.stepSize);
  const sq = (x: number) => Number(x.toFixed(stepDec));
  const exitQ = (qty: number): [number, number, number] => {
    const parts = splitQuantity(qty, a.stepSize, pcts);
    while (parts.length < 3) parts.push(0);
    return parts as [number, number, number];
  };
  const fullQty = (f: number) => positionSize(a.capital, a.riskPct, f, stop, costPct, a.stepSize).qty;
  const mPct = P.splitMarketPct;
  const makeRow = (label: FillRow['label'], f: number): PatternFillRow => {
    let raw: Array<{ kind: EntryLeg['kind']; price: number; qty: number }>;
    if (entryType === 'market') {
      raw = [{ kind: 'market', price: f, qty: fullQty(f) }];
    } else if (entryType === 'limit') {
      raw = [{ kind: 'limit', price: limitPrice!, qty: splitQuantity(fullQty(limitPrice!), a.stepSize, [P.limitOnlyPct, 100 - P.limitOnlyPct])[0]! }];
    } else {
      // Tổng khối lượng tính theo giá TB có trọng số → rủi ro khi khớp cả hai = ngân sách; chân market nhận phần làm tròn xuống
      const avg = (mPct * f + (100 - mPct) * limitPrice!) / 100;
      const total = positionSize(a.capital, a.riskPct, avg, stop, costPct, a.stepSize).qty;
      const [qm, ql] = splitQuantity(total, a.stepSize, [mPct, 100 - mPct]);
      raw = [{ kind: 'market', price: f, qty: qm! }, { kind: 'limit', price: limitPrice!, qty: ql! }];
    }
    const legs: EntryLeg[] = raw.map((l) => ({ ...l, q: exitQ(l.qty) }));
    const qty = sq(legs.reduce((sum, l) => sum + l.qty, 0));
    const q = [0, 1, 2].map((i) => sq(legs.reduce((sum, l) => sum + l.q[i]!, 0))) as [number, number, number];
    const notional = legs.reduce((sum, l) => sum + l.qty * l.price, 0);
    const avgEntry = qty > 0 ? notional / qty : legs.reduce((sum, l) => sum + l.price, 0) / legs.length;
    const estLoss = legs.reduce((sum, l) => sum + l.qty * Math.abs(l.price - stop), 0) + (notional * costPct) / 100;
    return { label, fill: f, qty, q, estLoss, legs, avgEntry };
  };
  const rowOk = (r: PatternFillRow) =>
    r.legs.every((l) => l.qty > 0 && prices.every((p, i) => p === null || (pcts[i] ?? 0) === 0 || l.q[i]! > 0));
  let fillTable: PatternFillRow[] = entryType === 'limit'
    ? [makeRow('limit', limitPrice!)]
    : [makeRow('giá hiện tại', marketPrice), makeRow('giữa', snapToTick((marketPrice + maxEntry) / 2, tick, 'nearest')), makeRow('giá tối đa', maxEntry)];
  const row0 = fillTable[0]!;

  // ---- Kiểm tra hợp lệ (lý do đầu tiên được in) ----
  const problems: string[] = [];
  if (entryType !== 'limit') {
    const z = zoneContaining(a.zones, marketPrice);
    if (z) problems.push(`Giá vào ${fp(marketPrice)} nằm trong vùng ${dz(z)} — chờ giá thoát hẳn khỏi vùng`);
  }
  if (limitPrice !== null) {
    const z = zoneContaining(a.zones, limitPrice);
    if (z) problems.push(`Giá limit ${fp(limitPrice)} nằm trong vùng ${dz(z)} — không đặt limit trong vùng`);
  }
  if (riskAtr > P.maxRiskAtr) problems.push(`R = ${vn(riskAtr, 2)}×A > ${P.maxRiskAtr}×A — cắt lỗ quá xa, bỏ lệnh`);
  if (tp1NetR < minR) {
    problems.push(`TP1 chỉ ${vn(tp1NetR, 2)}R sau phí + funding < ${num(minR)}R${isFlag(g.kind) ? ' (cờ cần ≥ 1,5R)' : ''} — bỏ lệnh`);
  }
  if (!rowOk(row0)) {
    problems.push(row0.legs.some((l) => l.qty <= 0)
      ? 'Khối lượng quá nhỏ so với bước khối lượng của sàn — tăng vốn hoặc bỏ lệnh'
      : `Khối lượng không chia được ${pcts.join('/')} theo bước khối lượng của sàn`);
  }
  let maxNote = '';
  if (problems.length === 0 && entryType !== 'limit') {
    const kept = fillTable.filter(rowOk);
    if (kept.length < fillTable.length) {
      fillTable = kept;
      maxEntry = snapToTick(kept[kept.length - 1]!.fill, tick, toward);
      maxNote = `; giá tối đa ${side === 'long' ? 'hạ xuống' : 'nâng lên'} ${fp(maxEntry)} vì khối lượng không chia được ở giá khớp xấu hơn`;
    }
  }
  const valid = problems.length === 0;
  const invalidReason = valid ? null : problems[0]!;

  // ---- Giá dùng để tính, mục tiêu ----
  const entry = entryType === 'split' ? row0.avgEntry : worstEntry;
  const riskPerUnit = Math.abs(entry - stop);
  const targets: Target[] = (['TP1', 'TP2', 'TP3'] as const).map((name, i) => ({
    name,
    price: prices[i]!,
    pct: pcts[i] ?? 0,
    qty: row0.q[i]!,
    r: prices[i] === null ? null : (dir * (prices[i]! - entry)) / riskPerUnit,
    reason: reasons[i]!,
  }));
  const cancelIfTp1First = hasLimit && dir * (tp1 - marketPrice) > 0;
  const limitExpiryBars = hasLimit ? P.limitExpiryBars : null;
  const limitExpiryHours = hasLimit ? P.limitExpiryBars * tfHours : null;

  // ---- Sau TP1 (quyết định người dùng 19/10/2026) ----
  const afterTp1For = (fill: number, estimate: boolean): { stop: number; text: string } => {
    const dist = (dir * (fill - line)) / A;
    if (dist < P.afterTp1NearAtr) {
      let x = snapToTick(line - dir * P.afterTp1StopAtr * A, tick, away);
      let text = `giá vào ${fp(fill)} cách đường phá ${vn(dist, 2)}×A < ${num(P.afterTp1NearAtr)}×A → sau TP1 dời SL về đường phá ${fp(line)} ${mp} ${num(P.afterTp1StopAtr)}×A = ${fp(x)}`;
      if (dir * (x - stop) < 0) {
        x = stop;
        text += ` (xa hơn SL gốc nên giữ SL ${fp(stop)})`;
      }
      return { stop: x, text };
    }
    const x = snapToTick(fill, tick, side === 'long' ? 'up' : 'down');
    return { stop: x, text: `giá vào cách đường phá ${vn(dist, 2)}×A ≥ ${num(P.afterTp1NearAtr)}×A → sau TP1 dời SL về giá khớp thật ${fp(x)}${estimate ? ' (ước tính theo giá hiện tại — dùng giá khớp thật trên sàn)' : ''}` };
  };
  let afterTp1Stop: number;
  let afterTp1StopIfMarketOnly: number | null = null;
  let afterTp1Reason: string;
  if (entryType === 'split') {
    const both = afterTp1For(row0.avgEntry, false);
    const mOnly = afterTp1For(marketPrice, true);
    afterTp1Stop = both.stop;
    afterTp1StopIfMarketOnly = mOnly.stop;
    afterTp1Reason = `Nếu khớp cả hai chân (giá TB ${fp(row0.avgEntry)}): ${both.text}. Nếu chỉ khớp chân market: ${mOnly.text}`;
  } else {
    const r = afterTp1For(entry, entryType === 'market');
    afterTp1Stop = r.stop;
    afterTp1Reason = r.text.charAt(0).toUpperCase() + r.text.slice(1);
  }

  // ---- Lý do vào lệnh ----
  const dTxt = `Giá đóng ${fp(marketPrice)} cách đường phá ${fp(line)} ${vn(d, 2)}×A`;
  const chase = side === 'long' ? 'mua cao' : 'bán thấp';
  const cancelTxt = `hủy sau ${P.limitExpiryBars} nến (${limitExpiryHours} giờ) chưa khớp${cancelIfTp1First ? ' hoặc khi giá chạm TP1 trước' : ''}`;
  const limitTxt = `limit ${fp(limitPrice ?? 0)} = đường phá ${pm} ${num(P.limitOffsetAtr)}×A`;
  let entryReason: string;
  if (entryType === 'market') {
    entryReason = `${dTxt} ≤ ${num(P.marketMaxAtr)}×A — vào trực tiếp 100%, không ${chase} hơn ${fp(maxEntry)}${maxNote}`;
  } else if (entryType === 'split') {
    entryReason = `${dTxt} trong (${num(P.marketMaxAtr)}; ${num(P.splitMaxAtr)}]×A — ${mPct}% vào trực tiếp (không ${chase} hơn ${fp(maxEntry)}) + ${100 - mPct}% ${limitTxt}; giá TB nếu khớp cả hai ${fp(row0.avgEntry)}; ${cancelTxt}${maxNote}`;
  } else if (blockedMarket) {
    entryReason = `${dTxt} — Short theo mô hình đảo chiều trong ${P.reversalShortBlockDays} ngày sau khi BTC lấy lại SMA200 ngày: không vào trực tiếp; chỉ đặt ${limitTxt} cho ${P.limitOnlyPct}% khối lượng; ${cancelTxt}`;
  } else {
    entryReason = `${dTxt} > ${num(P.splitMaxAtr)}×A — không vào trực tiếp (nến quá dài); chỉ đặt ${limitTxt} cho ${P.limitOnlyPct}% khối lượng; ${cancelTxt}`;
  }

  // ---- Đòn bẩy, thanh lý, funding (như plan.ts) ----
  const safe = maxSafeLeverage(riskPerUnit / entry, COMMON.maintenanceMarginRate, COMMON.liquidationBufferStops);
  const suggested = Math.max(1, Math.min(cfg.maxLeverage, Math.floor(safe)));
  const notional = Math.round(row0.legs.reduce((sum, l) => sum + l.qty * l.price, 0) * 1e8) / 1e8;
  const fundingPerUnit = a.fundingRate * fundingEvents * entry;

  const plan: PatternPlan = {
    kind: g.kind,
    timeframe: g.timeframe,
    side,
    entryType,
    marketPrice,
    breakoutLine: line,
    atr: A,
    distanceAtr: d,
    entry,
    limitPrice,
    limitExpiryBars,
    limitExpiryHours,
    cancelIfTp1First,
    maxEntry,
    entryReason,
    stop,
    stopReason,
    riskAtr,
    targetShort,
    targetFull,
    targets,
    targetsIfMarketOnly: entryType === 'split' ? row0.legs[0]!.q : null,
    tp1NetR,
    afterTp1Stop,
    afterTp1StopIfMarketOnly,
    afterTp1Reason,
    valid,
    invalidReason,
    trailAtr: cfg.trailAtrMult * A,
    riskPerUnit,
    qty: row0.qty,
    notional,
    riskAmount: (a.capital * a.riskPct) / 100,
    estLoss: row0.estLoss,
    fillTable,
    riskPct: a.riskPct,
    safeLeverage: safe,
    suggestedLeverage: suggested,
    liquidationEstimate: liquidationPrice(entry, suggested, side, COMMON.maintenanceMarginRate),
    marginNeeded: notional / suggested,
    fundingCostR: (dir * fundingPerUnit) / riskPerUnit,
    timeStopHours: cfg.timeStopHours,
    maxHoldHours: cfg.maxHoldHours,
    notes,
  };
  return { status: valid ? 'ready' : 'rejected', plan, reason: invalidReason };
}
