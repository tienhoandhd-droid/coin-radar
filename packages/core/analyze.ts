import { atr, last } from './indicators.ts';
import { volumeZ } from './flow.ts';
import { scoreSide, type SideScore } from './score.ts';
import { findZones } from './zones.ts';
import { buildPlan, nearestLevels, maxSafeLeverage, type TradePlan, type CostTier } from './plan.ts';
import { evaluateGates, ratePer8h, fundingNote, type GateResult } from './gates.ts';
import { eventWindow, type MacroEvent } from './events.ts';
import { riskTier, type RiskTier } from './risk.ts';
import { COMMON, CONFIG } from './config.ts';
import { btcHourlySide, type Regime } from './regime.ts';
import type { Candle, Contract, Mode, PremiumIndex, Side } from './types.ts';

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
};

// TẠM: quãng tới TP1; chưa có vùng cản thì dùng 1,5R như trước để điểm S-03 không đổi bản chất
function tp1Distance(p: TradePlan): number {
  const t = p.targets[0]!.price;
  return t === null ? 1.5 * p.riskPerUnit : Math.abs(t - p.entry);
}

function costTier(rankPct: number): CostTier {
  return rankPct <= COMMON.costTierRank.high ? 'high' : rankPct <= COMMON.costTierRank.mid ? 'mid' : 'low';
}

// Lỗi từ buildPlan (ATR/khoảng cắt lỗ không hợp lệ) được để nổi lên — scanner ghi lỗi theo từng coin.
export function analyze(i: AnalyzeInput): Analysis {
  const levels = nearestLevels(i.entry, COMMON.pivotConfirmBars);
  const dailyAtr = last(atr(i.daily, 14));
  // TẠM (Task 3 tích hợp thật): dựng vùng ở đây để biên dịch được; nhãn khung chỉ để ghi nguồn
  const zones = findZones({ entry: i.entry, trend: i.trend, entryLabel: CONFIG[i.mode].entryInterval, trendLabel: CONFIG[i.mode].trendInterval, atr: last(atr(i.entry, 14)) });
  const price = last(i.entry.map((k) => k.close));
  const closesWindow = i.daily.slice(-COMMON.drawdownDays).map((k) => k.close);
  let peak = -Infinity;
  let maxDd = 0;
  for (const c of closesWindow) { peak = Math.max(peak, c); maxDd = Math.max(maxDd, (1 - c / peak) * 100); }
  const risk = riskTier({
    dailyAtrPct: (dailyAtr / price) * 100,
    ageDays: (i.now.getTime() - i.contract.onboardDate) / 86_400_000,
    liquidityRank: i.liquidityRankPct,
    maxDrawdown90Pct: maxDd,
  });
  // P-01: rủi ro mỗi lệnh tối đa 0,25% cho Lướt nhanh và coin rủi ro Cao/Rất cao
  const capRisk = i.mode === 'fast' || risk.tier === 'Cao' || risk.tier === 'Rất cao';
  const riskPct = capRisk ? Math.min(i.riskPct, COMMON.highRiskTierPct) : i.riskPct;
  if (riskPct < i.riskPct) risk.notes.push(`P-01: hạ rủi ro mỗi lệnh từ ${i.riskPct}% xuống ${riskPct}% (${i.mode === 'fast' ? 'Lướt nhanh' : 'mức rủi ro ' + risk.tier})`);

  const planFor = (side: Side) => buildPlan({
    mode: i.mode, side, entry: i.entry, dailyAtr, capital: i.capital, riskPct,
    costTier: costTier(i.liquidityRankPct), stepSize: i.contract.stepSize,
    fundingRate: i.premium.lastFundingRate, fundingIntervalHours: i.fundingIntervalHours, zones,
  });
  const planLong = planFor('long');
  const planShort = planFor('short');
  const liquid = i.liquidityRankPct <= COMMON.liquidRankForRs;
  const long = scoreSide({ mode: i.mode, trend: i.trend, entry: i.entry, btcTrend: i.btcTrend, liquid, nearestLevels: levels }, 'long', tp1Distance(planLong));
  const short = scoreSide({ mode: i.mode, trend: i.trend, entry: i.entry, btcTrend: i.btcTrend, liquid, nearestLevels: levels }, 'short', tp1Distance(planShort));

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
  const stopDistPct = plan.riskPerUnit / plan.entry;
  const gates = evaluateGates({
    mode: i.mode, side: best.side, score: best.score, regime: i.regime, btcHourly: i.mode === 'fast' ? btcHourlySide(i.btcTrend) : null, rsZ: best.rsZ, riskTier: risk.tier, breakerTripped: i.breakerTripped, breakerNote: i.breakerNote,
    warmupBars: Math.min(i.trend.length, i.entry.length), coverage: best.coverage,
    liquidityRankPct: i.liquidityRankPct, spreadPct: i.spreadPct,
    move1hPct, volumeZ1h: volumeZ(h, 20),
    ageDays: (i.now.getTime() - i.contract.onboardDate) / 86_400_000,
    eventBlocked: ev.blocked,
    stopDistPct: stopDistPct * 100, stopDistAtr: plan.riskPerUnit / dailyAtr,
    liquidationOk: maxSafeLeverage(stopDistPct, COMMON.maintenanceMarginRate, COMMON.liquidationBufferStops) >= 1,
    fundingRate: i.premium.lastFundingRate, fundingIntervalHours: i.fundingIntervalHours, fundingIntervalDefault: i.fundingIntervalDefault,
    minutesToFunding: (i.premium.nextFundingTime - i.now.getTime()) / 60_000,
  });

  const allPass = gates.every((g) => g.pass);
  const label: Label = allPass && best.score >= COMMON.qualifyScore
    ? (best.side === 'long' ? 'Đạt tiêu chí Long' : 'Đạt tiêu chí Short')
    : best.score >= COMMON.watchScore ? 'Theo dõi' : 'Không đạt';

  return {
    symbol: i.contract.symbol, mode: i.mode, price, label, best, long: L, short: S, gates,
    plan: label.startsWith('Đạt') ? plan : null, risk, flags,
  };
}
