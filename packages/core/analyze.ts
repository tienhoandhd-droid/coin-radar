import { atr, last } from './indicators.ts';
import { volumeZ } from './flow.ts';
import { scoreSide, type SideScore } from './score.ts';
import { buildPlan, nearestLevels, maxSafeLeverage, type TradePlan, type CostTier } from './plan.ts';
import { evaluateGates, type GateResult } from './gates.ts';
import { eventWindow, type MacroEvent } from './events.ts';
import { riskTier, type RiskTier } from './risk.ts';
import { COMMON } from './config.ts';
import type { Regime } from './regime.ts';
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
  liquidityRankPct: number;
  spreadPct: number;
  premium: PremiumIndex;
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

function costTier(rankPct: number): CostTier {
  return rankPct <= COMMON.costTierRank.high ? 'high' : rankPct <= COMMON.costTierRank.mid ? 'mid' : 'low';
}

// Lỗi từ buildPlan (ATR/khoảng cắt lỗ không hợp lệ) được để nổi lên — scanner ghi lỗi theo từng coin.
export function analyze(i: AnalyzeInput): Analysis {
  const levels = nearestLevels(i.entry, COMMON.pivotConfirmBars);
  const dailyAtr = last(atr(i.daily, 14));
  const price = last(i.entry.map((k) => k.close));
  const planFor = (side: Side) => buildPlan({
    mode: i.mode, side, entry: i.entry, dailyAtr, capital: i.capital, riskPct: i.riskPct,
    costTier: costTier(i.liquidityRankPct), stepSize: i.contract.stepSize,
    fundingRate: i.premium.lastFundingRate, levels,
  });
  const planLong = planFor('long');
  const planShort = planFor('short');
  const liquid = i.liquidityRankPct <= COMMON.liquidRankForRs;
  const long = scoreSide({ mode: i.mode, trend: i.trend, entry: i.entry, btcTrend: i.btcTrend, liquid, nearestLevels: levels }, 'long', planLong.tp1 - planLong.entry);
  const short = scoreSide({ mode: i.mode, trend: i.trend, entry: i.entry, btcTrend: i.btcTrend, liquid, nearestLevels: levels }, 'short', planShort.entry - planShort.tp1);

  // F-01: funding quá nhiệt cùng chiều lệnh → trừ điểm
  const flags: string[] = [];
  const applyFunding = (s: SideScore): SideScore => {
    const adverse = (s.side === 'long' ? 1 : -1) * i.premium.lastFundingRate;
    if (adverse > COMMON.fundingHotPer8h) {
      flags.push(`F-01 Funding quá nhiệt cùng chiều ${s.side === 'long' ? 'Long' : 'Short'}`);
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
    mode: i.mode, side: best.side, score: best.score, regime: i.regime, breakerTripped: i.breakerTripped,
    warmupBars: Math.min(i.trend.length, i.entry.length), coverage: best.coverage,
    liquidityRankPct: i.liquidityRankPct, spreadPct: i.spreadPct,
    move1hPct, volumeZ1h: volumeZ(h, 20),
    ageDays: (i.now.getTime() - i.contract.onboardDate) / 86_400_000,
    eventBlocked: ev.blocked,
    liquidationOk: maxSafeLeverage(stopDistPct, COMMON.maintenanceMarginRate, COMMON.liquidationBufferStops) >= 1,
    fundingRate: i.premium.lastFundingRate,
    minutesToFunding: (i.premium.nextFundingTime - i.now.getTime()) / 60_000,
  });

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

  const allPass = gates.every((g) => g.pass);
  const label: Label = allPass && best.score >= COMMON.qualifyScore
    ? (best.side === 'long' ? 'Đạt tiêu chí Long' : 'Đạt tiêu chí Short')
    : best.score >= COMMON.watchScore ? 'Theo dõi' : 'Không đạt';

  return {
    symbol: i.contract.symbol, mode: i.mode, price, label, best, long: L, short: S, gates,
    plan: label.startsWith('Đạt') ? plan : null, risk, flags,
  };
}
