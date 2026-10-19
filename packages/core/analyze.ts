import { atr, last } from './indicators.ts';
import { isClosed } from './candles.ts';
import { volumeZ } from './flow.ts';
import { scoreSide, type SideScore } from './score.ts';
import { findZones } from './zones.ts';
import { buildPlan, tp1R, maxSafeLeverage, worstTp1NetR, type TradePlan, type CostTier } from './plan.ts';
import { evaluateGates, ratePer8h, fundingNote, inPatternScope, dailyTrend, patternTrendGate, contextGate, type GateResult } from './gates.ts';
import { eventWindow, type MacroEvent } from './events.ts';
import { riskTier, type RiskTier } from './risk.ts';
import { COMMON, CONFIG } from './config.ts';
import { btcHourlySide, type Regime } from './regime.ts';
import type { Candle, Contract, Mode, PremiumIndex, Side } from './types.ts';
import { contextFlags, type ContextFlags } from './patterns/context.ts';
import { trackPatterns, isTracked, type PatternTf, type TrackedPattern } from './patterns/track.ts';
import { buildPatternPlan, type PatternPlan } from './patterns/pattern-plan.ts';
import type { PatternKind } from './patterns/types.ts';
import type { PatternState } from './patterns/state.ts';
import { gradeSignal, coilReleasedAt, type GradeInput, type GradeResult } from './grade.ts';
import { zonePlanFilterProblems, patternPlanFilterProblems, invalidateZonePlan } from './filters.ts';

// Nến cho phần mô hình biểu đồ (kế hoạch 1c), chỉ bắt buộc với hợp đồng trong phạm vi P-G1.
// c4h / c1d: bối cảnh (vai-đầu-vai, vùng nhiều tháng, coil) và nhận diện Swing; c1h: ATR(1H) tại nến phá.
export type PatternData = { c4h: Candle[]; c1d: Candle[]; c1h: Candle[]; btcSma200ReclaimedAt: number | null };

// Một mô hình đang theo dõi (đã khử trùng, chưa kết thúc, tín hiệu chưa cũ). hidden = Lướt nhanh: chỉ ghi nhận, không phát lệnh.
export type PatternInfo = {
  id: string;
  kind: PatternKind;
  timeframe: string;
  state: PatternState;
  side: 'up' | 'down' | null; // chiều đã phá / đang chờ xác nhận; null khi chưa phá
  upper: number; // biên trên tại nến cuối
  lower: number; // biên dưới tại nến cuối
  breakoutLine: number | null; // giá đường phá tại nến phá
  height: number;
  pivots: Array<{ time: number; price: number; kind: 'high' | 'low' }>; // time = openTime của nến pivot (để đối chiếu dữ liệu thô)
  notes: string[];
  hidden: boolean;
  contextOnly: boolean; // hai đỉnh/hai đáy (người dùng chọn 19/10/2026): chỉ bối cảnh, không lập lệnh
};

export type AnalyzeInput = {
  mode: Mode;
  contract: Contract;
  trend: Candle[];
  entry: Candle[];
  daily: Candle[];
  hourly: Candle[];
  btcTrend: Candle[];
  regime: Regime;
  breakerTripped: boolean;
  breakerNote?: string;
  liquidityRankPct: number;
  spreadPct: number;
  premium: PremiumIndex;
  fundingIntervalHours: number; // chu kỳ funding (giờ); mã không có trong fundingInfo → 8 và fundingIntervalDefault = true
  fundingIntervalDefault: boolean;
  now: Date;
  events: MacroEvent[];
  capital: number;
  riskPct: number;
  patternData: PatternData | null; // null = không tải (hợp đồng ngoài phạm vi P-G1); trong phạm vi mà null → ném lỗi
};

export type Label = 'Đạt tiêu chí Long' | 'Đạt tiêu chí Short' | 'Theo dõi' | 'Không đạt';
export type Analysis = {
  symbol: string;
  mode: Mode;
  price: number;
  label: Label;
  best: SideScore;
  long: SideScore;
  short: SideScore;
  gates: GateResult[];
  plan: TradePlan | null;
  risk: { tier: RiskTier; notes: string[] };
  flags: string[];
  patternScope: { ok: boolean; note: string };
  context: ContextFlags | null; // bối cảnh mô hình; null khi ngoài phạm vi P-G1
  patterns: PatternInfo[];
  patternSignal: PatternPlan | null; // kế hoạch lệnh theo mô hình khi tín hiệu được phát là tín hiệu mô hình
  grading: GradeInput; // dữ kiện để chấm Hạng A/B (gradeSignal)
  grade: GradeResult | null; // chỉ có khi tín hiệu Đạt tiêu chí; null = không phải tín hiệu
};

// Một hợp đồng × chế độ chỉ một tín hiệu. Cùng chiều → dùng tín hiệu mô hình; ngược chiều → không phát cả hai.
export function arbitrate(zoneSide: Side | null, patternSide: Side | null): { use: 'zone' | 'pattern' | null; note: string | null } {
  const name = (x: Side) => (x === 'long' ? 'Long' : 'Short');
  if (zoneSide === null && patternSide === null) return { use: null, note: null };
  if (patternSide === null) return { use: 'zone', note: null };
  if (zoneSide === null) return { use: 'pattern', note: null };
  if (zoneSide === patternSide) {
    return { use: 'pattern', note: `Tín hiệu vùng và tín hiệu mô hình cùng chiều ${name(zoneSide)} → dùng kế hoạch theo mô hình (một tín hiệu mỗi hợp đồng)` };
  }
  return { use: null, note: `xung đột: tín hiệu vùng ${name(zoneSide)} ngược tín hiệu mô hình ${name(patternSide)} → không phát cả hai` };
}

// Mức rủi ro của hợp đồng (R-01) — tách riêng để máy quét biết trước hợp đồng có thuộc phạm vi P-G1 không (để tải thêm nến).
export function contractRisk(a: { daily: Candle[]; price: number; contract: Contract; liquidityRankPct: number; now: Date }): { tier: RiskTier; notes: string[] } {
  const dailyAtr = last(atr(a.daily, 14));
  const closesWindow = a.daily.slice(-COMMON.drawdownDays).map((k) => k.close);
  let peak = -Infinity;
  let maxDd = 0;
  for (const c of closesWindow) { peak = Math.max(peak, c); maxDd = Math.max(maxDd, (1 - c / peak) * 100); }
  return riskTier({
    dailyAtrPct: (dailyAtr / a.price) * 100,
    ageDays: (a.now.getTime() - a.contract.onboardDate) / 86_400_000,
    liquidityRank: a.liquidityRankPct,
    maxDrawdown90Pct: maxDd,
  });
}

const FRAME_HOURS: Record<PatternTf, number> = { '15m': 0.25, '1h': 1, '4h': 4, '1d': 24 };
const TF_ORDER: Record<string, number> = { '1d': 0, '4h': 1, '1h': 2, '15m': 3 };

const label4 = (iv: string) => iv.toUpperCase(); // '15m' → '15M', '4h' → '4H'

// Mô tả vùng cản của TP1 để ghi vào lý do S-03
function tp1Reason(p: TradePlan): string | undefined {
  return p.targets[0]?.price === null ? undefined : p.targets[0]?.reason;
}

// TP1 không đặt được (kế hoạch không hợp lệ và không có R) → trả lý do của kế hoạch để S-03 cho 0 điểm
function tp1Blocked(p: TradePlan): string | undefined {
  return !p.valid && tp1R(p) === null ? (p.invalidReason ?? 'kế hoạch không hợp lệ') : undefined;
}

function costTier(rankPct: number): CostTier {
  return rankPct <= COMMON.costTierRank.high ? 'high' : rankPct <= COMMON.costTierRank.mid ? 'mid' : 'low';
}

// Lỗi từ buildPlan (ATR/khoảng cắt lỗ không hợp lệ) được để nổi lên — scanner ghi lỗi theo từng coin.
export function analyze(i: AnalyzeInput): Analysis {
  const dailyAtr = last(atr(i.daily, 14));
  const atrEntry = last(atr(i.entry, 14));
  const zones = findZones({
    entry: i.entry, trend: i.trend,
    entryLabel: label4(CONFIG[i.mode].entryInterval), trendLabel: label4(CONFIG[i.mode].trendInterval),
    atr: atrEntry, tickSize: i.contract.tickSize,
  });
  const price = last(i.entry.map((k) => k.close));
  const risk = contractRisk({ daily: i.daily, price, contract: i.contract, liquidityRankPct: i.liquidityRankPct, now: i.now });
  // P-01: rủi ro mỗi lệnh = i.riskPct (mặc định COMMON.risk.perTradePct = 2%, người dùng chốt 19/10/2026). Không còn hạ xuống 0,25% theo chế độ/mức rủi ro; mức rủi ro chỉ để hiển thị và lọc Hạng A.
  const riskPct = i.riskPct;

  // I2: kế hoạch vi phạm bộ lọc sàn (MIN_NOTIONAL, LOT_SIZE/MARKET_LOT_SIZE, MAX_NUM_ORDERS) → không hợp lệ kèm lý do
  const planFor = (side: Side) => {
    const p = buildPlan({
      mode: i.mode, side, entry: i.entry, dailyAtr, capital: i.capital, riskPct,
      costTier: costTier(i.liquidityRankPct), tickSize: i.contract.tickSize, stepSize: i.contract.stepSize,
      fundingRate: i.premium.lastFundingRate, fundingIntervalHours: i.fundingIntervalHours, zones,
    });
    const problems = p.valid ? zonePlanFilterProblems(p, i.contract) : [];
    return problems.length > 0 ? invalidateZonePlan(p, `Bộ lọc sàn: ${problems.join('; ')}`) : p;
  };
  const planLong = planFor('long');
  const planShort = planFor('short');
  const liquid = i.liquidityRankPct <= COMMON.liquidRankForRs;
  const scoreIn = { mode: i.mode, trend: i.trend, entry: i.entry, btcTrend: i.btcTrend, liquid };
  const long = scoreSide(scoreIn, 'long', tp1R(planLong), tp1Reason(planLong), tp1Blocked(planLong));
  const short = scoreSide(scoreIn, 'short', tp1R(planShort), tp1Reason(planShort), tp1Blocked(planShort));

  // F-01: funding quá nhiệt cùng chiều lệnh → trừ điểm
  const flags: string[] = [];
  const applyFunding = (s: SideScore): SideScore => {
    const adverse = (s.side === 'long' ? 1 : -1) * ratePer8h(i.premium.lastFundingRate, i.fundingIntervalHours);
    if (adverse > COMMON.fundingHotPer8h) {
      flags.push(`F-01 Funding quá nhiệt cùng chiều ${s.side === 'long' ? 'Long' : 'Short'} (${fundingNote(i.premium.lastFundingRate, i.fundingIntervalHours, i.fundingIntervalDefault)})`);
      return { ...s, score: Math.max(0, s.score - COMMON.fundingHotPenalty), reasons: [...s.reasons, { code: 'F-01', text: 'Funding quá nhiệt cùng chiều lệnh', points: -COMMON.fundingHotPenalty }] };
    }
    return s;
  };
  const L = applyFunding(long);
  const S = applyFunding(short);
  const best = L.score >= S.score ? L : S;
  const plan = best.side === 'long' ? planLong : planShort;

  const ev = eventWindow(i.now, i.events, i.mode);
  if (ev.flag) flags.push(`G-07 ${ev.flag}`);
  const h = i.hourly;
  const move1hPct = h.length >= 2 ? (last(h.map((k) => k.close)) / h[h.length - 2]!.close - 1) * 100 : 0;
  // Cổng hiện có cho một chiều + một kế hoạch (vùng hoặc mô hình) — dùng chung để tín hiệu mô hình qua đủ các cổng như tín hiệu vùng.
  const gatesFor = (s: SideScore, p: { riskPerUnit: number; entry: number; valid: boolean; note: string }): GateResult[] => {
    const stopDistPct = p.riskPerUnit / p.entry;
    return evaluateGates({
      mode: i.mode, side: s.side, score: s.score, regime: i.regime, btcHourly: i.mode === 'fast' ? btcHourlySide(i.btcTrend) : null, rsZ: s.rsZ, riskTier: risk.tier, breakerTripped: i.breakerTripped, breakerNote: i.breakerNote,
      warmupBars: Math.min(i.trend.length, i.entry.length), coverage: s.coverage,
      liquidityRankPct: i.liquidityRankPct, spreadPct: i.spreadPct,
      move1hPct, volumeZ1h: volumeZ(h, 20),
      ageDays: (i.now.getTime() - i.contract.onboardDate) / 86_400_000,
      eventBlocked: ev.blocked,
      stopDistPct: stopDistPct * 100, stopDistAtr: p.riskPerUnit / dailyAtr,
      liquidationOk: maxSafeLeverage(stopDistPct, COMMON.maintenanceMarginRate, COMMON.liquidationBufferStops) >= 1,
      fundingRate: i.premium.lastFundingRate, fundingIntervalHours: i.fundingIntervalHours, fundingIntervalDefault: i.fundingIntervalDefault,
      minutesToFunding: (i.premium.nextFundingTime - i.now.getTime()) / 60_000,
      planValid: p.valid, planNote: p.note,
    });
  };

  // ---- Mô hình biểu đồ (kế hoạch 1c): chỉ cho hợp đồng trong phạm vi P-G1 ----
  const patternScope = inPatternScope(risk.tier, i.liquidityRankPct);
  let context: ContextFlags | null = null;
  const patterns: PatternInfo[] = [];
  const candidates: PatternCandidate[] = [];
  if (patternScope.ok) {
    const pd = i.patternData;
    if (pd === null) throw new Error(`${i.contract.symbol} thuộc phạm vi mô hình (P-G1) nhưng không có dữ liệu mô hình (nến 4H/1D/1H)`);
    context = contextFlags(pd.c4h, pd.c1d);
    if (context.coil) flags.push(`P-C2 coil (nén biến động 4H) — chỉ báo, không phải tín hiệu`);
    const daily = i.mode === 'swing' ? dailyTrend(i.trend) : null; // P-G2 chỉ dùng ở Swing (Lướt nhanh ẩn)
    const candlesFor = (tf: PatternTf): Candle[] =>
      tf === '4h' ? pd.c4h : tf === '1d' ? pd.c1d : tf === '1h' ? (i.mode === 'fast' ? i.trend : pd.c1h) : i.entry;
    const hidden = i.mode === 'fast';
    const tracked: Array<{ t: TrackedPattern; c: Candle[]; tf: PatternTf }> = [];
    for (const f of COMMON.patterns.frames[i.mode]) {
      const c = candlesFor(f.tf);
      for (const t of trackPatterns(i.contract.symbol, c, f.tf, f.kinds)) if (isTracked(t.result)) tracked.push({ t, c, tf: f.tf });
    }
    tracked.sort((x, y) => TF_ORDER[x.tf]! - TF_ORDER[y.tf]! || x.t.geometry.endIndex - y.t.geometry.endIndex);
    const atr1hAll = atr(pd.c1h, 14);
    // M3: "giá hiện tại" của kế hoạch mô hình = nến ĐÃ ĐÓNG gần nhất của khung vào lệnh (Swing: 4H = pd.c4h, cũng là nến nhận diện 4H;
    // Lướt nhanh: 15m = i.entry), kể cả mô hình 1D — nến ngày cuối có thể cũ tới 24 giờ.
    const priceBars = i.mode === 'swing' ? pd.c4h : i.entry;
    const lastEntry = priceBars[priceBars.length - 1];
    if (!lastEntry) throw new Error(`${i.contract.symbol}: không có nến khung vào lệnh để lấy giá hiện tại`);
    const priceNow = { close: lastEntry.close, time: lastEntry.closeTime, tf: CONFIG[i.mode].entryInterval };
    for (const { t, c, tf } of tracked) {
      const g = t.geometry;
      const r = t.result;
      const lastIdx = c.length - 1;
      const info: PatternInfo = {
        id: t.id, kind: g.kind, timeframe: tf, state: r.state, side: r.side,
        upper: g.upper(lastIdx), lower: g.lower(lastIdx), breakoutLine: r.breakoutLine, height: g.height,
        pivots: g.pivots.map((p) => ({ time: c[p.index]!.openTime, price: p.price, kind: p.kind })),
        notes: [...g.notes, ...r.notes], hidden,
        contextOnly: g.kind === 'double_top' || g.kind === 'double_bottom',
      };
      patterns.push(info);
      if (info.contextOnly) {
        if (r.state === 'breakout' || r.state === 'retested') info.notes.push('Hai đỉnh/hai đáy: chỉ bối cảnh (P-C1), không lập lệnh');
        continue;
      }
      if (hidden || daily === null || (r.state !== 'breakout' && r.state !== 'retested') || r.side === null || r.breakoutIndex === null) continue;
      const side: Side = r.side === 'up' ? 'long' : 'short';
      const pg2 = patternTrendGate({ kind: g.kind, side, daily, regime: i.regime });
      info.notes.push(pg2.note);
      if (!pg2.pass) continue;
      // ATR(1H) tại nến 1H đóng cùng lúc (hoặc ngay trước) nến phá của khung nhận diện
      const breakClose = c[r.breakoutIndex]!.closeTime;
      let j = -1;
      // nến 1H đã đóng tại thời điểm ngay sau khi nến phá đóng (breakClose + 1 ms = mở nến kế tiếp), cùng ranh giới isClosed
      for (let q = pd.c1h.length - 1; q >= 0; q--) if (isClosed(pd.c1h[q]!, breakClose + 1)) { j = q; break; }
      const atr1h = j >= 0 ? atr1hAll[j]! : NaN;
      if (!Number.isFinite(atr1h) || atr1h <= 0 || breakClose - pd.c1h[j]!.closeTime >= FRAME_HOURS[tf] * 3_600_000) {
        info.notes.push('Kế hoạch mô hình: bỏ — thiếu ATR(1H) tại nến phá (dữ liệu 1H không phủ tới nến phá)');
        continue;
      }
      // Mức cắt lỗ (chữ nhật: pivot nhỏ phía trong) do patternStopLevel tính chung cho kế hoạch và máy trạng thái
      const res = buildPatternPlan({
        mode: i.mode, patternId: t.id, price: priceNow, geometry: g, state: r, candles: c, atr: t.atr, atr1h, zones, multiMonth: context.multiMonth,
        btcSma200ReclaimedAt: pd.btcSma200ReclaimedAt, capital: i.capital, riskPct, costTier: costTier(i.liquidityRankPct),
        tickSize: i.contract.tickSize, stepSize: i.contract.stepSize, fundingRate: i.premium.lastFundingRate, fundingIntervalHours: i.fundingIntervalHours,
      });
      if (res.status !== 'ready' || res.plan === null) {
        info.notes.push(`Kế hoạch mô hình: ${res.status === 'wait_confirm' ? 'chờ xác nhận' : 'bỏ'} — ${res.reason}`);
        continue;
      }
      const pp = res.plan;
      const filterProblems = patternPlanFilterProblems(pp, i.contract);
      if (filterProblems.length > 0) {
        info.notes.push(`Kế hoạch mô hình: bỏ — bộ lọc sàn: ${filterProblems.join('; ')}`);
        continue;
      }
      const sideScore = side === 'long' ? L : S;
      const gs = [
        ...gatesFor(sideScore, { riskPerUnit: Math.max(pp.riskPerUnit, pp.riskAtr * pp.atr), entry: pp.entry, valid: pp.valid, note: pp.invalidReason ?? pp.stopReason }),
        { code: 'P-G1', pass: true, note: patternScope.note }, pg2, contextGate(context, side),
      ];
      const failed = gs.filter((x) => !x.pass);
      if (failed.length > 0) {
        info.notes.push(`Kế hoạch mô hình: lập được nhưng cổng trượt — ${failed.map((x) => `${x.code} (${x.note})`).join('; ')}`);
        continue;
      }
      if (sideScore.score < COMMON.patterns.minSideScore) {
        info.notes.push(`Kế hoạch mô hình: lập được, qua cổng nhưng điểm ${side === 'long' ? 'Long' : 'Short'} ${sideScore.score} < ${COMMON.patterns.minSideScore}`);
        continue;
      }
      info.notes.push(`Kế hoạch mô hình: đủ điều kiện (TP1 ${pp.tp1NetR.toFixed(2).replace('.', ',')}R sau phí)`);
      candidates.push({ plan: pp, gates: gs, score: sideScore });
    }
  }
  let pattern: PatternCandidate | null = null;
  if (candidates.length > 0) {
    if (new Set(candidates.map((x) => x.plan.side)).size > 1) {
      flags.push('xung đột: các mô hình đủ điều kiện ngược chiều nhau → không phát tín hiệu mô hình');
    } else {
      pattern = candidates.reduce((b, x) => (x.plan.tp1NetR > b.plan.tp1NetR ? x : b));
    }
  }

  // ---- Tín hiệu theo vùng (như 1b) + bối cảnh P-C1 ----
  const zoneGates = [
    ...gatesFor(best, { riskPerUnit: plan.riskPerUnit, entry: plan.entry, valid: plan.valid, note: plan.invalidReason ?? plan.stopReason }),
    contextGate(context, best.side),
  ];
  const zoneOk = zoneGates.every((g) => g.pass) && best.score >= COMMON.qualifyScore;
  const chosen = finalizeSignal({ best, zoneGates, zoneOk, plan, pattern, flags });
  // Hạng A/B (Task 8): dữ kiện gom ở đây vì Analysis không giữ nến. TP1 sau phí ở giá khớp XẤU NHẤT cho phép (M2, rà soát cuối 1c):
  // lệnh vùng = worstTp1NetR (market: giá tối đa; limit: giá limit), cùng công thức tp1NetRAt với lệnh mô hình.
  const zoneDir = plan.side === 'long' ? 1 : -1;
  const zoneCostFrac = COMMON.costRoundTripPct[costTier(i.liquidityRankPct)] / 100
    + Math.max(0, zoneDir * i.premium.lastFundingRate * (CONFIG[i.mode].fundingHoldHours / i.fundingIntervalHours));
  const zoneTp1Net = worstTp1NetR(plan, zoneCostFrac);
  const grading: GradeInput = {
    regime: i.regime, breakerTripped: i.breakerTripped,
    trendSide: dailyTrend(i.trend).trend, entrySide: dailyTrend(i.entry).trend,
    btcSide: i.mode === 'swing' ? dailyTrend(i.btcTrend).trend : null,
    zones, atr: atrEntry,
    tp1NetR: chosen.patternSignal !== null ? chosen.patternSignal.tp1NetR : zoneTp1Net,
    coilReleased: i.patternData === null ? { long: false, short: false } : coilReleasedAt(i.patternData.c4h),
    eventFlagged: Boolean(ev.flag),
  };
  const result = { symbol: i.contract.symbol, mode: i.mode, price, long: L, short: S, risk, flags, patternScope, context, patterns, ...chosen, grading, grade: null as GradeResult | null };
  if (result.label.startsWith('Đạt') && (result.plan !== null || result.patternSignal !== null)) result.grade = gradeSignal(result);
  return result;
}

export type PatternCandidate = { plan: PatternPlan; gates: GateResult[]; score: SideScore };

// Chọn tín hiệu cuối cho một hợp đồng × chế độ (đã qua arbitrate). flags được ghi thêm ghi chú cùng chiều / xung đột.
export function finalizeSignal(a: { best: SideScore; zoneGates: GateResult[]; zoneOk: boolean; plan: TradePlan; pattern: PatternCandidate | null; flags: string[] }):
  { label: Label; best: SideScore; gates: GateResult[]; plan: TradePlan | null; patternSignal: PatternPlan | null } {
  const pick = arbitrate(a.zoneOk ? a.best.side : null, a.pattern ? a.pattern.plan.side : null);
  if (pick.note) a.flags.push(pick.note);
  const qualified = (side: Side): Label => (side === 'long' ? 'Đạt tiêu chí Long' : 'Đạt tiêu chí Short');
  if (pick.use === 'pattern' && a.pattern) {
    return { label: qualified(a.pattern.plan.side), best: a.pattern.score, gates: a.pattern.gates, plan: null, patternSignal: a.pattern.plan };
  }
  if (pick.use === 'zone') return { label: qualified(a.best.side), best: a.best, gates: a.zoneGates, plan: a.plan, patternSignal: null };
  const fallback: Label = a.best.score >= COMMON.watchScore ? 'Theo dõi' : 'Không đạt';
  return { label: fallback, best: a.best, gates: a.zoneGates, plan: null, patternSignal: null };
}
