import { atr, pivotHighs, pivotLows, last, roundStep } from './indicators.ts';
import { CONFIG, COMMON } from './config.ts';
import { stopSideZones, targetSideZones, describeZone, formatPrice, type Zone } from './zones.ts';
import type { Candle, Mode, Side } from './types.ts';

export type CostTier = 'high' | 'mid' | 'low';

// roundStep nằm ở indicators.ts (để zones.ts dùng mà không tạo vòng import); re-export để import cũ vẫn chạy
export { roundStep };

// TẠM GIỮ: score.ts (S-03) còn dùng; Task 3 (tích hợp analyze) sẽ thay bằng vùng và xóa hàm này.
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

export type Target = { name: 'TP1' | 'TP2' | 'TP3'; price: number | null; pct: number; r: number | null; reason: string };

export type TradePlan = {
  side: Side;
  entryType: 'market' | 'limit';
  marketPrice: number; // giá đóng nến gần nhất, để hiển thị
  entry: number; // giá DÙNG ĐỂ TÍNH: giá hiện tại nếu market, giá limit nếu limit
  entryZone: { low: number; high: number };
  limitExpiryHours: number | null;
  entryReason: string;
  maxEntry: number;
  stop: number;
  stopReason: string;
  targets: Target[]; // luôn 3 phần tử, pct theo COMMON.zones.exitPcts
  afterTp1Stop: number; // sau TP1 dời SL về giá vào; sau TP2 giữ nguyên
  valid: boolean;
  invalidReason: string | null;
  trailAtr: number;
  riskPerUnit: number;
  qty: number;
  notional: number;
  riskAmount: number;
  riskPct: number; // % vốn rủi ro thực sự đã dùng để tính khối lượng (P-01)
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
  fundingRate: number; // mức MỖI KỲ funding của hợp đồng (không phải %/8h)
  fundingIntervalHours: number; // chu kỳ funding của hợp đồng (giờ)
  zones: Zone[];
};

// R của TP1; null nếu không có vùng cản để đặt TP1
export function tp1R(plan: TradePlan): number | null {
  return plan.targets[0]?.r ?? null;
}

// Số kiểu Việt Nam cho thông báo: dấu phẩy thập phân
function vn(x: number, digits: number): string {
  return x.toFixed(digits).replace('.', ',');
}

const ENTRY_BAR_HOURS: Record<Mode, number> = { fast: 0.25, swing: 4 }; // 15m / 4H

export function buildPlan(a: PlanArgs): TradePlan {
  const cfg = CONFIG[a.mode];
  const zc = COMMON.zones;
  const dir = a.side === 'long' ? 1 : -1;
  const marketPrice = last(a.entry.map((k) => k.close));
  const atrEntry = last(atr(a.entry, 14));
  if (!Number.isFinite(atrEntry) || atrEntry <= 0) {
    throw new Error(`Không lập được kế hoạch: ATR khung vào lệnh không hợp lệ (${atrEntry})`);
  }
  if (a.mode === 'swing' && (!Number.isFinite(a.dailyAtr) || a.dailyAtr <= 0)) {
    throw new Error(`Không lập được kế hoạch: ATR ngày không hợp lệ (${a.dailyAtr})`);
  }
  if (!Number.isFinite(a.fundingIntervalHours) || a.fundingIntervalHours <= 0) {
    throw new Error(`Không lập được kế hoạch: chu kỳ funding không hợp lệ (${a.fundingIntervalHours})`);
  }
  const sideWord = a.side === 'long' ? 'hỗ trợ' : 'kháng cự';
  const dirWord = a.side === 'long' ? 'dưới' : 'trên';

  // Vùng đặt SL: vùng đầu tiên (gần giá nhất) đủ mạnh, tính từ giá thị trường
  const support = stopSideZones(a.zones, marketPrice, a.side).find((z) => z.strength >= zc.minSlStrength) ?? null;
  // Mép vùng phía giá: Long = mép trên vùng hỗ trợ; Short = mép dưới vùng kháng cản
  const nearEdge = support === null ? marketPrice : a.side === 'long' ? support.high : support.low;
  const distAtr = support === null ? 0 : (dir * (marketPrice - nearEdge)) / atrEntry;

  let entryType: 'market' | 'limit' = 'market';
  let entry = marketPrice;
  if (support !== null && distAtr > zc.directEntryMaxAtr) {
    entryType = 'limit';
    entry = nearEdge + dir * zc.limitBufferAtr * atrEntry;
  }

  // Cắt lỗ
  let stop: number;
  let stopReason: string;
  if (support === null) {
    stop = entry - dir * atrEntry; // khoảng tạm để mọi số vẫn hữu hạn; kế hoạch bị đánh dấu không hợp lệ
    stopReason = `Không có vùng ${sideWord} đủ mạnh để đặt SL`;
  } else {
    const farEdge = a.side === 'long' ? support.low : support.high;
    stop = farEdge - dir * zc.slBufferAtr * atrEntry;
    if (a.mode === 'swing' && Math.abs(entry - stop) < a.dailyAtr) stop = entry - dir * a.dailyAtr;
    // Đẩy qua số tròn nếu cắt lỗ nằm sát (trong 0,2×ATR) phía bên kia số tròn
    const step = roundStep(entry);
    const round = a.side === 'long' ? Math.floor(stop / step) * step : Math.ceil(stop / step) * step;
    if (Math.abs(stop - round) < COMMON.roundNumberProximityAtr * atrEntry) {
      stop = round - dir * COMMON.roundNumberProximityAtr * atrEntry;
    }
    stopReason = `${a.side === 'long' ? 'Dưới' : 'Trên'} vùng ${sideWord} ${describeZone(support)} ${a.side === 'long' ? '−' : '+'} ${vn(zc.slBufferAtr, 1)}×ATR`;
  }

  const riskPerUnit = Math.abs(entry - stop);
  if (!Number.isFinite(riskPerUnit) || riskPerUnit <= 0) {
    throw new Error('Không lập được kế hoạch: khoảng cắt lỗ bằng 0');
  }

  // Mục tiêu: trước mép vùng cản, tính từ giá dùng để vào lệnh
  const found: Target[] = [];
  let blockedBy: Zone | null = null; // vùng cản đầu tiên nằm sát giá vào, không còn chỗ đặt TP1
  const candidates = targetSideZones(a.zones, entry, a.side);
  for (const z of candidates) {
    if (found.length >= zc.exitPcts.length) break;
    const tp = (a.side === 'long' ? z.low : z.high) - dir * zc.tpBufferAtr * atrEntry;
    if (found.length === 0 && z === candidates[0] && dir * (tp - entry) <= 0) { blockedBy = z; break; }
    const prev = found.length ? found[found.length - 1]!.price! : entry;
    if (dir * (tp - prev) <= 0) continue;
    found.push({ name: `TP${found.length + 1}` as Target['name'], price: tp, pct: 0, r: (dir * (tp - entry)) / riskPerUnit,
      reason: `Trước vùng cản ${describeZone(z)}` });
  }
  const names = ['TP1', 'TP2', 'TP3'] as const;
  const targets: Target[] = names.map((name, idx) => {
    const pct = zc.exitPcts[idx]!;
    const hit = found[idx];
    if (hit) return { ...hit, name, pct };
    return { name, price: null, pct, r: null,
      reason: found.length === 0 ? 'Không có vùng cản phía trên (giá ở vùng đỉnh mới) — để trailing stop' : 'Không còn vùng cản — phần này để trailing stop (3×ATR)' };
  });
  if (blockedBy !== null) {
    targets.forEach((t) => { t.reason = `Không có chỗ đặt TP1: vùng ${describeZone(blockedBy!)} sát giá vào`; });
  } else if (a.side === 'short' && found.length === 0) {
    targets.forEach((t) => { t.reason = 'Không có vùng đỡ phía dưới (giá ở vùng đáy mới) — để trailing stop'; });
  }

  let valid = true;
  let invalidReason: string | null = null;
  if (support === null) {
    valid = false;
    invalidReason = `Không có vùng ${sideWord} đủ mạnh phía ${dirWord} để đặt SL`;
  } else if (blockedBy !== null) {
    valid = false;
    invalidReason = `${a.side === 'long' ? 'Kháng cự' : 'Hỗ trợ'} ngay sát ${a.side === 'long' ? 'trên' : 'dưới'} giá vào ${describeZone(blockedBy)} — không có chỗ đặt TP1`;
  } else if (targets[0]!.r !== null && targets[0]!.r < zc.minTp1R) {
    valid = false;
    invalidReason = `Kháng cự đầu tiên quá gần: TP1 chỉ ${vn(targets[0]!.r, 2)}R < ${zc.minTp1R}R`;
  }

  // Vùng vào lệnh + lý do
  const maxEntry = marketPrice + dir * cfg.maxEntryAtr * atrEntry;
  let entryZone: { low: number; high: number };
  let limitExpiryHours: number | null = null;
  let entryReason: string;
  if (entryType === 'limit' && support !== null) {
    entryZone = a.side === 'long' ? { low: nearEdge, high: entry } : { low: entry, high: nearEdge };
    limitExpiryHours = zc.limitExpiryBars[a.mode] * ENTRY_BAR_HOURS[a.mode];
    entryReason = `Giá đã chạy xa vùng ${sideWord} ${vn(distAtr, 1)}×ATR — đặt limit ${formatPrice(entry)} chờ hồi về vùng ${describeZone(support)}; hủy nếu sau ${limitExpiryHours} giờ chưa khớp hoặc giá chạm TP1 trước`;
  } else {
    const inner = support === null ? marketPrice : a.side === 'long' ? Math.max(support.high, stop + 0.5 * atrEntry) : Math.min(support.low, stop - 0.5 * atrEntry);
    // vùng luôn chứa giá thị trường (giá có thể đang nằm trong vùng hỗ trợ)
    entryZone = a.side === 'long'
      ? { low: Math.min(inner, marketPrice), high: maxEntry }
      : { low: maxEntry, high: Math.max(inner, marketPrice) };
    entryReason = support === null
      ? invalidReason!
      : `Giá đang sát vùng ${sideWord} ${describeZone(support)} — vào trực tiếp, không ${a.side === 'long' ? 'mua cao' : 'bán thấp'} hơn ${formatPrice(maxEntry)}`;
  }

  const costPct = COMMON.costRoundTripPct[a.costTier];
  const size = positionSize(a.capital, a.riskPct, entry, stop, costPct, a.stepSize);
  const safe = maxSafeLeverage(riskPerUnit / entry, COMMON.maintenanceMarginRate, COMMON.liquidationBufferStops);
  const suggested = Math.max(1, Math.min(cfg.maxLeverage, Math.floor(safe)));
  // Số kỳ funding thật trong thời gian giữ dự kiến: 4h/kỳ → gấp đôi 8h/kỳ
  const fundingEvents = cfg.fundingHoldHours / a.fundingIntervalHours;
  const fundingPerUnit = a.fundingRate * fundingEvents * entry; // dương = Long trả
  return {
    side: a.side,
    entryType,
    marketPrice,
    entry,
    entryZone,
    limitExpiryHours,
    entryReason,
    maxEntry: entryType === 'limit' ? entry : maxEntry,
    stop,
    stopReason,
    targets,
    afterTp1Stop: entry,
    valid,
    invalidReason,
    trailAtr: cfg.trailAtrMult * atrEntry,
    riskPerUnit,
    qty: size.qty,
    notional: size.notional,
    riskAmount: size.riskAmount,
    riskPct: a.riskPct,
    safeLeverage: safe,
    suggestedLeverage: suggested,
    liquidationEstimate: liquidationPrice(entry, suggested, a.side, COMMON.maintenanceMarginRate),
    marginNeeded: size.notional / suggested,
    fundingCostR: (dir * fundingPerUnit) / riskPerUnit,
    timeStopHours: cfg.timeStopHours,
    maxHoldHours: cfg.maxHoldHours,
  };
}
