import { atr, pivotHighs, pivotLows, last } from './indicators.ts';
import { CONFIG, COMMON } from './config.ts';
import type { Candle, Mode, Side } from './types.ts';

export type CostTier = 'high' | 'mid' | 'low';

export function roundStep(price: number): number {
  return 10 ** (Math.floor(Math.log10(price)) - 1);
}

export function nearestLevels(entry: Candle[], confirm: number): { above: number | null; below: number | null } {
  const price = last(entry.map((k) => k.close));
  const highs = entry.map((k) => k.high);
  const lows = entry.map((k) => k.low);
  const above = pivotHighs(highs, confirm).map((i) => highs[i]!).filter((h) => h > price);
  const below = pivotLows(lows, confirm).map((i) => lows[i]!).filter((l) => l < price);
  return {
    above: above.length ? Math.min(...above) : null,
    below: below.length ? Math.max(...below) : null,
  };
}

// Công thức gần đúng cho ký quỹ isolated (bỏ qua bậc ký quỹ thật — cần API key). P-04.
export function liquidationPrice(entry: number, leverage: number, side: Side, mmr: number): number {
  return side === 'long' ? entry * (1 - 1 / leverage + mmr) : entry * (1 + 1 / leverage - mmr);
}

// Đòn bẩy lớn nhất để giá thanh lý cách giá vào ≥ (1 + bufferStops) × khoảng cắt lỗ.
export function maxSafeLeverage(stopDistPct: number, mmr: number, bufferStops: number): number {
  return 1 / ((1 + bufferStops) * stopDistPct + mmr);
}

export function positionSize(capital: number, riskPct: number, entry: number, stop: number, costPct: number, stepSize: number) {
  const riskAmount = (capital * riskPct) / 100;
  const perUnit = Math.abs(entry - stop) + (entry * costPct) / 100;
  const raw = riskAmount / perUnit;
  const qty = Math.floor(raw / stepSize + 1e-9) * stepSize;
  const q = Math.round(qty * 1e8) / 1e8;
  return { qty: q, notional: Math.round(q * entry * 1e8) / 1e8, riskAmount };
}

export type TradePlan = {
  side: Side;
  entry: number;
  maxEntry: number;
  stop: number;
  tp1: number;
  trailAtr: number;
  riskPerUnit: number;
  qty: number;
  notional: number;
  riskAmount: number;
  safeLeverage: number;
  suggestedLeverage: number;
  liquidationEstimate: number;
  marginNeeded: number;
  fundingCostR: number;
  timeStopHours: number;
  maxHoldHours: number;
};

export type PlanArgs = {
  mode: Mode;
  side: Side;
  entry: Candle[];
  dailyAtr: number;
  capital: number;
  riskPct: number;
  costTier: CostTier;
  stepSize: number;
  fundingRate: number;
  levels: { above: number | null; below: number | null };
};

export function buildPlan(a: PlanArgs): TradePlan {
  const cfg = CONFIG[a.mode];
  const dir = a.side === 'long' ? 1 : -1;
  const closes = a.entry.map((k) => k.close);
  const price = last(closes);
  const atrEntry = last(atr(a.entry, 14));
  if (!Number.isFinite(atrEntry) || atrEntry <= 0) {
    throw new Error(`Không lập được kế hoạch: ATR khung vào lệnh không hợp lệ (${atrEntry})`);
  }
  if (a.mode === 'swing' && (!Number.isFinite(a.dailyAtr) || a.dailyAtr <= 0)) {
    throw new Error(`Không lập được kế hoạch: ATR ngày không hợp lệ (${a.dailyAtr})`);
  }

  // Cắt lỗ: xa hơn giữa (pivot ± buffer) và (giá ∓ k×ATR)
  const pivot = a.side === 'long' ? a.levels.below : a.levels.above;
  const byAtr = price - dir * cfg.stopAtrMult * atrEntry;
  const byPivot = pivot === null ? byAtr : pivot - dir * cfg.pivotBufferAtr * atrEntry;
  let stop = a.side === 'long' ? Math.min(byAtr, byPivot) : Math.max(byAtr, byPivot);
  if (a.mode === 'swing') {
    const minDist = a.dailyAtr;
    if (Math.abs(price - stop) < minDist) stop = price - dir * minDist;
  }
  // Đẩy qua số tròn nếu cắt lỗ nằm sát (trong 0,2×ATR) phía bên kia số tròn
  const step = roundStep(price);
  const round = a.side === 'long' ? Math.floor(stop / step) * step : Math.ceil(stop / step) * step;
  if (Math.abs(stop - round) < COMMON.roundNumberProximityAtr * atrEntry) {
    stop = round - dir * COMMON.roundNumberProximityAtr * atrEntry;
  }

  const riskPerUnit = Math.abs(price - stop);
  if (!Number.isFinite(riskPerUnit) || riskPerUnit <= 0) {
    throw new Error('Không lập được kế hoạch: khoảng cắt lỗ bằng 0');
  }
  const tp1 = price + dir * cfg.tp1R * riskPerUnit;
  const costPct = COMMON.costRoundTripPct[a.costTier];
  const size = positionSize(a.capital, a.riskPct, price, stop, costPct, a.stepSize);
  const safe = maxSafeLeverage(riskPerUnit / price, COMMON.maintenanceMarginRate, COMMON.liquidationBufferStops);
  const suggested = Math.max(1, Math.min(cfg.maxLeverage, Math.floor(safe)));
  const fundingPerUnit = a.fundingRate * cfg.fundingIntervalsPerHold * price; // dương = Long trả
  return {
    side: a.side,
    entry: price,
    maxEntry: price + dir * cfg.maxEntryAtr * atrEntry,
    stop,
    tp1,
    trailAtr: cfg.trailAtrMult * atrEntry,
    riskPerUnit,
    qty: size.qty,
    notional: size.notional,
    riskAmount: size.riskAmount,
    safeLeverage: safe,
    suggestedLeverage: suggested,
    liquidationEstimate: liquidationPrice(price, suggested, a.side, COMMON.maintenanceMarginRate),
    marginNeeded: size.notional / suggested,
    fundingCostR: (dir * fundingPerUnit) / riskPerUnit,
    timeStopHours: cfg.timeStopHours,
    maxHoldHours: cfg.maxHoldHours,
  };
}
