import { atr, last } from './indicators.ts';
import { CONFIG, COMMON } from './config.ts';
import { donchianBreakout, donchianBreakdown } from './breakout.ts';
import { snapToTick } from './price.ts';
import { positionSize, planCostPct, mmrFor, maxSafeLeverage } from './plan.ts';
import type { ExitPlan } from './exit.ts';
import type { Target } from './plan.ts';
import type { CostModel, FundingBuffer } from './sizing.ts';
import type { Candle, Side } from './types.ts';

// Hệ đi theo xu hướng khung ngày "trend-d1" (COMMON.trend, đăng ký trước 20/10/2026 — docs/superpowers/plans/2026-10-20-luat-moi-va-kiem-mu-C.md).
// CHỈ MÔ PHỎNG: thoát bằng dừng theo giá ĐÓNG 1D (backtest/simulate.ts, trail 'close1d') — bot chưa đặt lại STOP_MARKET mỗi ngày nên planner
// chỉ nhận kế hoạch này khi nơi gọi khai báo trendSim (packages/bot/planner.ts). Hàm THUẦN.
export type TrendConfig = typeof COMMON.trend;

export type TrendSignal = { side: Side; barOpenTime: number; close: number; atrD: number };

// daily = nến 1D ĐÃ ĐÓNG tại t, tăng dần. Chỉ xét đúng lúc nến 1D cuối vừa đóng (closeTime + 1 = t → vào ở nến kế tiếp); khác → null.
// Long: đóng > đỉnh giá đóng donchianDays nến trước; Short (chỉ khi cfg.sides có 'short'): đóng < đáy giá đóng donchianDays nến trước.
export function trendSignal(daily: readonly Candle[], t: number, cfg: TrendConfig = COMMON.trend): TrendSignal | null {
  const bar = daily[daily.length - 1];
  if (bar === undefined || bar.closeTime + 1 !== t) return null;
  const a = last(atr([...daily], cfg.atrDays));
  if (!Number.isFinite(a) || !(a > 0)) return null;
  const n = cfg.donchianDays;
  if (cfg.sides.includes('long') && donchianBreakout(daily, n) === true) return { side: 'long', barOpenTime: bar.openTime, close: bar.close, atrD: a };
  if (cfg.sides.includes('short') && donchianBreakdown(daily, n) === true) return { side: 'short', barOpenTime: bar.openTime, close: bar.close, atrD: a };
  return null;
}

// Kế hoạch lệnh trend-d1: vào market (IOC giá trần như lệnh vùng: giá mark ± maxEntryAtr × ATR(14) 4H), SL = giá mark ∓ stopAtr × ATR(atrDays) 1D,
// không TP; khối lượng 2% cùng công thức với kế hoạch vùng (positionSize — đệm funding + phí + trượt), planner định cỡ lại ở giá xấu nhất.
export type TrendPlan = {
  side: Side; entryType: 'market'; marketPrice: number; entry: number; maxEntry: number; stop: number; targets: Target[]; exit: ExitPlan;
  valid: boolean; invalidReason: string | null; qty: number; costPct: number; suggestedLeverage: number; limitExpiryHours: null;
  riskPct: number; capital: number; trailAtr: number; trendD1: true; reason: string;
};

export function buildTrendPlan(a: {
  signal: TrendSignal; markPrice: number; h4: readonly Candle[]; tickSize: number; stepSize: number; capital: number; riskPct: number;
  cost: CostModel; fundingBuffer: FundingBuffer; cfg?: TrendConfig;
}): TrendPlan {
  const cfg = a.cfg ?? COMMON.trend;
  const side = a.signal.side;
  const d = side === 'long' ? 1 : -1;
  const mark = a.markPrice;
  if (!(mark > 0) || !Number.isFinite(mark)) throw new Error(`trend-d1: giá mark không hợp lệ (${mark})`);
  const atr4h = last(atr([...a.h4], 14));
  if (!Number.isFinite(atr4h) || !(atr4h > 0)) throw new Error(`trend-d1: ATR 4H không hợp lệ (${atr4h})`);
  const stop = snapToTick(mark - d * cfg.stopAtr * a.signal.atrD, a.tickSize, side === 'long' ? 'down' : 'up');
  const maxEntry = snapToTick(mark + d * CONFIG.swing.maxEntryAtr * atr4h, a.tickSize, side === 'long' ? 'down' : 'up');
  const base = { side, entryType: 'market' as const, marketPrice: mark, entry: mark, maxEntry, stop, targets: [] as Target[], limitExpiryHours: null,
    riskPct: a.riskPct, capital: a.capital, trailAtr: cfg.trailAtr * a.signal.atrD, trendD1: true as const };
  const reason = `trend-d1: đóng 1D ${a.signal.close} ${side === 'long' ? '>' : '<'} ${side === 'long' ? 'đỉnh' : 'đáy'} giá đóng ${cfg.donchianDays} ngày; SL = ${mark} ${d > 0 ? '−' : '+'} ${cfg.stopAtr}×ATR(${cfg.atrDays}) 1D = ${stop}`;
  if (!(stop > 0) || d * (mark - stop) <= 0) {
    return { ...base, exit: { policy: 'C2', tp1Qty: 0, trailQty: 0, trailing: null }, valid: false, invalidReason: `trend-d1: SL ${stop} không hợp lệ`, qty: 0, costPct: 0, suggestedLeverage: 1, reason };
  }
  const size = positionSize({ mode: 'swing', capital: a.capital, riskPct: a.riskPct, entry: mark, stop, stepSize: a.stepSize, cost: a.cost, fundingBuffer: a.fundingBuffer });
  const mmr = mmrFor(size.notional);
  const safe = maxSafeLeverage(Math.abs(mark - stop) / mark, mmr.mmr, COMMON.liquidationBufferStops);
  const suggestedLeverage = Math.max(1, Math.min(CONFIG.swing.maxLeverage, mmr.maxLeverage, Math.floor(safe)));
  const valid = size.qty > 0;
  return {
    ...base, exit: { policy: 'C2', tp1Qty: 0, trailQty: size.qty, trailing: null }, valid,
    invalidReason: valid ? null : 'trend-d1: khối lượng 2% nhỏ hơn bước khối lượng', qty: size.qty, costPct: planCostPct(a.cost, size.notional), suggestedLeverage, reason,
  };
}

// Mức dừng theo giá đóng 1D sau một nến 1D đóng: đỉnh giá đóng từ khi vào ∓ trailAtr × ATR — không bao giờ nới ra xa hơn mức cũ / SL ban đầu.
// Không gian x = dấu × giá (Long +p, Short −p: "lên là có lợi").
export function trendStopX(a: { prevLevelX: number | null; initialStopX: number; bestCloseX: number; atrD: number; trailAtr: number }): number {
  return Math.max(a.prevLevelX ?? -Infinity, a.initialStopX, a.bestCloseX - a.trailAtr * a.atrD);
}
