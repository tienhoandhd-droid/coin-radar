import { atr, ema, last } from './indicators.ts';
import { CONFIG, COMMON } from './config.ts';
import { findCleanZones } from './zones-clean.ts';
import { stopSideZones, targetSideZones, type Zone } from './zones.ts';
import { snapToTick } from './price.ts';
import { positionSize, planCostPct, mmrFor, maxSafeLeverage, splitQuantity, type Target } from './plan.ts';
import { buildExit, type ExitPlan } from './exit.ts';
import type { Regime } from './regime.ts';
import type { CostModel, FundingBuffer } from './sizing.ts';
import type { Candle, Side } from './types.ts';

// Lần thử #24 "mtf-pullback" (COMMON.entryRules.mtfPullback, đăng ký trước 20/10/2026 — docs/superpowers/plans/2026-10-20-luat-moi-va-kiem-mu-C.md,
// mục "BỔ SUNG đăng ký trước — lần thử #24"). Hệ vào lệnh riêng của Swing (bộ mô phỏng xét MỖI GIỜ, thay lệnh vùng), một bộ tham số:
//   1. chế độ BTC 1D (marketRegime) Lên → chỉ Long; Xuống → chỉ Short; Đi ngang → không vào
//   2. giá đóng 4H cuối > EMA50 4H (Long) / < (Short)
//   3. đáy nến 1H vừa đóng chạm vùng hỗ trợ "clean" 1D/4H độ mạnh ≥ 2 hoặc cách mép trên vùng ≤ 0,5 ATR(14) 4H (Short: kháng cự, đối xứng)
//   4. nến 1H vừa đóng: tăng (đóng > mở), đóng > đỉnh nến 1H trước, đóng > EMA20 1H, nến 1H trước đóng ≤ EMA20 1H (Short đối xứng)
//   5. vào market ở nến 1H kế tiếp; SL = đáy vùng − 0,25 ATR(14) 4H; rủi ro 2%
//   6. TP1 = vùng cản "clean" gần nhất độ mạnh ≥ 2 với R:R ≥ 1,5 (không có → bỏ); thoát C2 (TP1 50% + trailing) như hiện tại
// Hàm THUẦN. Nến đưa vào là nến ĐÃ ĐÓNG tại t, tăng dần.
export type MtfConfig = { emaH4: number; emaH1: number; atrPeriod: number; nearAtr: number; slBufferAtr: number; minStrength: number; minRR: number };

export type MtfPlan = {
  side: Side; entryType: 'market'; marketPrice: number; entry: number; maxEntry: number; stop: number; targets: Target[]; exit: ExitPlan;
  valid: boolean; invalidReason: string | null; qty: number; costPct: number; suggestedLeverage: number; limitExpiryHours: null;
  riskPct: number; capital: number; trailAtr: number; reason: string; zone: Zone | null; tp1Zone: Zone;
};

// Phía theo chế độ thị trường (điều kiện 1)
export function mtfSide(regime: Regime): Side | null {
  return regime === 'up' ? 'long' : regime === 'down' ? 'short' : null;
}

// Điều kiện 4 (rẻ, xét trước): nến 1H vừa đóng hồi phục cắt lên EMA20 1H (Short: đối xứng)
export function h1Trigger(h1: readonly Candle[], side: Side, n: number): boolean {
  if (h1.length < n + 2) return false;
  const e = ema(h1.map((c) => c.close), n);
  const b = h1[h1.length - 1]!, p = h1[h1.length - 2]!;
  const eb = e[e.length - 1]!, ep = e[e.length - 2]!;
  if (!Number.isFinite(eb) || !Number.isFinite(ep)) return false;
  return side === 'long'
    ? b.close > b.open && b.close > p.high && b.close > eb && p.close <= ep
    : b.close < b.open && b.close < p.low && b.close < eb && p.close >= ep;
}

// Điều kiện 2: giá đóng 4H cuối so với EMA50 4H
export function h4TrendOk(h4: readonly Candle[], side: Side, n: number): boolean {
  const e = last(ema(h4.map((c) => c.close), n));
  const c = h4[h4.length - 1]?.close;
  if (c === undefined || !Number.isFinite(e)) return false;
  return side === 'long' ? c > e : c < e;
}

// Điều kiện 3 + 5 + 6 → kế hoạch (hoặc lý do không vào). Giá tối đa = giá mark ± maxEntryAtr × ATR(14) 4H như lệnh vùng; R:R kiểm ở giá
// khớp XẤU NHẤT (giá tối đa) cho thận trọng. TP1 đặt trước mép vùng cản tpBufferAtr × ATR như kế hoạch vùng.
export function buildMtfPlan(a: {
  side: Side; h1: readonly Candle[]; h4: readonly Candle[]; d1: readonly Candle[]; now: number; markPrice: number;
  tickSize: number; stepSize: number; capital: number; riskPct: number; cost: CostModel; fundingBuffer: FundingBuffer; cfg: MtfConfig;
}): { plan: MtfPlan | null; reason: string } {
  const { side, cfg } = a;
  const d = side === 'long' ? 1 : -1;
  const away = side === 'long' ? 'down' : 'up';
  const mark = a.markPrice;
  const atr4 = last(atr([...a.h4], cfg.atrPeriod));
  if (!Number.isFinite(atr4) || !(atr4 > 0)) return { plan: null, reason: 'mtf: ATR 4H không hợp lệ' };
  const zones = findCleanZones({ entry: [...a.h4], trend: [...a.d1], entryInterval: CONFIG.swing.entryInterval, trendInterval: CONFIG.swing.trendInterval, price: mark, now: a.now });
  const bar = a.h1[a.h1.length - 1]!;
  // vùng phía SL đủ mạnh gần giá nhất mà nến 1H chạm (Long: đáy nến ≤ mép trên + 0,5 ATR; Short: đỉnh nến ≥ mép dưới − 0,5 ATR)
  const zone = stopSideZones(zones, mark, side).filter((z) => z.strength >= cfg.minStrength)
    .find((z) => (side === 'long' ? bar.low - z.high : z.low - bar.high) <= cfg.nearAtr * atr4) ?? null;
  if (zone === null) return { plan: null, reason: `mtf: nến 1H không chạm vùng ${side === 'long' ? 'hỗ trợ' : 'kháng cự'} độ mạnh ≥ ${cfg.minStrength}` };
  const stop = snapToTick((side === 'long' ? zone.low : zone.high) - d * cfg.slBufferAtr * atr4, a.tickSize, away);
  const maxEntry = snapToTick(mark + d * CONFIG.swing.maxEntryAtr * atr4, a.tickSize, away);
  return zoneTargetPlan({ ...a, zones, stop, maxEntry, atr4, minStrength: cfg.minStrength, minRR: cfg.minRR,
    label: `mtf-pullback ${side === 'long' ? 'Long' : 'Short'}: vùng ${zone.low}–${zone.high} (độ mạnh ${zone.strength})`, zone });
}

// Phần chung của #24/#25/#26: SL và giá tối đa đã có → TP1 = vùng cản "clean" gần nhất độ mạnh ≥ minStrength (trước mép vùng tpBufferAtr ×
// ATR 4H), R:R ở giá khớp XẤU NHẤT ≥ minRR (không thì bỏ); khối lượng 2% (positionSize), đòn bẩy an toàn, thoát C2 (buildExit).
export function zoneTargetPlan(a: {
  side: Side; markPrice: number; stop: number; maxEntry: number; zones: Zone[]; atr4: number; minStrength: number; minRR: number;
  tickSize: number; stepSize: number; capital: number; riskPct: number; cost: CostModel; fundingBuffer: FundingBuffer; label: string; zone: Zone | null;
}): { plan: MtfPlan | null; reason: string } {
  const { side, stop, maxEntry, atr4 } = a;
  const d = side === 'long' ? 1 : -1;
  const away = side === 'long' ? 'down' : 'up';
  const mark = a.markPrice;
  if (d * (mark - stop) <= 0) return { plan: null, reason: `mtf: SL ${stop} sai phía giá ${mark}` };
  const tz = targetSideZones(a.zones, maxEntry, side).find((z) => z.strength >= a.minStrength) ?? null;
  if (tz === null) return { plan: null, reason: `mtf: không có ${side === 'long' ? 'kháng cự' : 'hỗ trợ'} độ mạnh ≥ ${a.minStrength} để đặt TP1` };
  const tp1 = snapToTick((side === 'long' ? tz.low : tz.high) - d * COMMON.zones.tpBufferAtr * atr4, a.tickSize, away);
  const rr = (d * (tp1 - maxEntry)) / (d * (maxEntry - stop));
  if (!(rr >= a.minRR)) return { plan: null, reason: `mtf: TP1 ${tp1} chỉ ${rr.toFixed(2)}R ở giá xấu nhất ${maxEntry} < ${a.minRR}R` };
  const size = positionSize({ mode: 'swing', capital: a.capital, riskPct: a.riskPct, entry: mark, stop, stepSize: a.stepSize, cost: a.cost, fundingBuffer: a.fundingBuffer });
  if (!(size.qty > 0)) return { plan: null, reason: 'mtf: khối lượng 2% nhỏ hơn bước khối lượng' };
  const costPct = planCostPct(a.cost, size.notional);
  const parts = splitQuantity(size.qty, a.stepSize, COMMON.zones.exitPcts);
  const trailAtr = CONFIG.swing.trailAtrMult * atr4;
  const mmr = mmrFor(size.notional);
  const safe = maxSafeLeverage(Math.abs(mark - stop) / mark, mmr.mmr, COMMON.liquidationBufferStops);
  const reason = `${a.label}, SL ${stop}, TP1 ${tp1} (${rr.toFixed(2)}R ở giá xấu nhất)`;
  return {
    reason,
    plan: {
      side, entryType: 'market', marketPrice: mark, entry: mark, maxEntry, stop,
      targets: [
        { name: 'TP1', price: tp1, pct: COMMON.zones.exitPcts[0]!, qty: parts[0]!, r: (d * (tp1 - mark)) / (d * (mark - stop)), reason: `Trước vùng cản ${tz.low}–${tz.high}` },
        { name: 'TP2', price: null, pct: COMMON.zones.exitPcts[1]!, qty: parts[1]!, r: null, reason: 'trailing' },
        { name: 'TP3', price: null, pct: COMMON.zones.exitPcts[2]!, qty: parts[2]!, r: null, reason: 'trailing' },
      ],
      exit: buildExit({ policy: 'C2', side, worstEntry: maxEntry, valid: true, tp1, trailAtr, costPct, qty: size.qty, tp1Qty: parts[0]! }),
      valid: true, invalidReason: null, qty: size.qty, costPct,
      suggestedLeverage: Math.max(1, Math.min(CONFIG.swing.maxLeverage, mmr.maxLeverage, Math.floor(safe))), limitExpiryHours: null,
      riskPct: a.riskPct, capital: a.capital, trailAtr, reason, zone: a.zone, tp1Zone: tz,
    },
  };
}

// ---- Lần thử #25 "mtf-align" và #26 "mtf-recovery" (đăng ký trước 20/10/2026, mục BỔ SUNG #25/#26 của kế hoạch 2026-10-20) ----
// Xu hướng mỗi khung (nến đã đóng): Lên = đóng > EMA50 và EMA20 > EMA50; Xuống = đối xứng; còn lại Trung tính.
// Điểm vào (Long; Short đối xứng): trong 8 nến 15m gần nhất có nến chạm EMA20 15m (đáy ≤ EMA20 của chính nến đó), nến 15m vừa đóng tăng,
// đóng > EMA20 15m và > đỉnh nến 15m trước → market ở nến 15m kế tiếp. SL = đáy thấp nhất 12 nến 15m − 0,25 × ATR(14) 1H. TP1 như #24.
// #25: 1D, 4H, 1H cùng Lên (Long) / cùng Xuống (Short), thoát C2. #26: thêm lệnh HỒI PHỤC — 1D Xuống nhưng 4H, 1H cùng Lên → Long
// (1D Lên, 4H, 1H cùng Xuống → Short); lệnh hồi phục chốt 100% tại TP1, giữ tối đa 48 giờ (bộ mô phỏng: exitOverride).
export type FrameTrend = 'up' | 'down' | 'neutral';
export type TrendFrame = '15m' | '1h' | '4h' | '1d';
// frames = các khung phải CÙNG xu hướng (#25/#26: 1D, 4H, 1H; #27/#28/#29: một khung 15m / 1H / 4H — mục BỔ SUNG #27–#29)
export type AlignConfig = { frames: TrendFrame[]; emaFast: number; emaSlow: number; touchBars: number; slBars: number; slBufferAtr: number; atrPeriod: number;
  minStrength: number; minRR: number; recovery: boolean; recoveryMaxHoldHours: number };

export function frameTrend(c: readonly Candle[], fast: number, slow: number): FrameTrend {
  const closes = c.map((k) => k.close);
  const ef = last(ema(closes, fast)), es = last(ema(closes, slow));
  const close = closes[closes.length - 1];
  if (close === undefined || !Number.isFinite(ef) || !Number.isFinite(es)) return 'neutral';
  if (close > es && ef > es) return 'up';
  if (close < es && ef < es) return 'down';
  return 'neutral';
}

// Phía + loại lệnh: mọi khung trong frames cùng Lên → Long, cùng Xuống → Short (lệnh xu hướng). recovery (#26, cần 1D/4H/1H): 1D Xuống
// nhưng 4H, 1H cùng Lên → Long hồi phục; 1D Lên nhưng 4H, 1H cùng Xuống → Short hồi phục. null = không vào.
export function alignSetup(t: Partial<Record<TrendFrame, FrameTrend>>, frames: readonly TrendFrame[], recovery: boolean): { side: Side; kind: 'trend' | 'recovery' } | null {
  if (frames.length === 0) return null;
  if (frames.every((f) => t[f] === 'up')) return { side: 'long', kind: 'trend' };
  if (frames.every((f) => t[f] === 'down')) return { side: 'short', kind: 'trend' };
  if (recovery && t['1d'] === 'down' && t['4h'] === 'up' && t['1h'] === 'up') return { side: 'long', kind: 'recovery' };
  if (recovery && t['1d'] === 'up' && t['4h'] === 'down' && t['1h'] === 'down') return { side: 'short', kind: 'recovery' };
  return null;
}

// Nến 15m kích hoạt (Long; Short đối xứng)
export function m15Trigger(m15: readonly Candle[], side: Side, cfg: Pick<AlignConfig, 'emaFast' | 'touchBars'>): boolean {
  if (m15.length < cfg.emaFast + cfg.touchBars + 1) return false;
  const e = ema(m15.map((c) => c.close), cfg.emaFast);
  const n = m15.length;
  const b = m15[n - 1]!, p = m15[n - 2]!, eb = e[n - 1]!;
  if (!Number.isFinite(eb)) return false;
  let touched = false;
  for (let i = n - cfg.touchBars; i < n; i++) {
    const ei = e[i]!;
    if (Number.isFinite(ei) && (side === 'long' ? m15[i]!.low <= ei : m15[i]!.high >= ei)) touched = true;
  }
  return touched && (side === 'long' ? b.close > b.open && b.close > eb && b.close > p.high : b.close < b.open && b.close < eb && b.close < p.low);
}

export function buildAlignPlan(a: {
  side: Side; m15: readonly Candle[]; h1: readonly Candle[]; h4: readonly Candle[]; d1: readonly Candle[]; now: number; markPrice: number;
  tickSize: number; stepSize: number; capital: number; riskPct: number; cost: CostModel; fundingBuffer: FundingBuffer; cfg: AlignConfig; label: string;
}): { plan: MtfPlan | null; reason: string } {
  const { side, cfg } = a;
  const d = side === 'long' ? 1 : -1;
  const away = side === 'long' ? 'down' : 'up';
  const atr1 = last(atr([...a.h1], cfg.atrPeriod));
  const atr4 = last(atr([...a.h4], cfg.atrPeriod));
  if (!Number.isFinite(atr1) || !(atr1 > 0) || !Number.isFinite(atr4) || !(atr4 > 0)) return { plan: null, reason: 'mtf: ATR 1H/4H không hợp lệ' };
  const recent = a.m15.slice(-cfg.slBars);
  const extreme = side === 'long' ? Math.min(...recent.map((c) => c.low)) : Math.max(...recent.map((c) => c.high));
  const stop = snapToTick(extreme - d * cfg.slBufferAtr * atr1, a.tickSize, away);
  // giá tối đa: ± maxEntryAtr × ATR(14) 1H (khung nhỏ nhất có ATR trong luật; lệnh vùng dùng ATR khung vào lệnh)
  const maxEntry = snapToTick(a.markPrice + d * CONFIG.swing.maxEntryAtr * atr1, a.tickSize, away);
  const zones = findCleanZones({ entry: [...a.h4], trend: [...a.d1], entryInterval: CONFIG.swing.entryInterval, trendInterval: CONFIG.swing.trendInterval, price: a.markPrice, now: a.now });
  return zoneTargetPlan({ ...a, zones, stop, maxEntry, atr4, minStrength: cfg.minStrength, minRR: cfg.minRR, label: a.label, zone: null });
}
