import { atr, last, roundStep } from './indicators.ts';
import { CONFIG, COMMON } from './config.ts';
import { stopSideZones, targetSideZones, zoneContaining, describeZone, type Zone } from './zones.ts';
import { snapToTick, formatTick, tickDecimals } from './price.ts';
import { buildExit, type ExitPlan, type ExitPolicy } from './exit.ts';
import { marginTier } from './margin.ts';
import type { Candle, Mode, Side } from './types.ts';

export type CostTier = 'high' | 'mid' | 'low';

// roundStep nằm ở indicators.ts (để zones.ts dùng mà không tạo vòng import); re-export để import cũ vẫn chạy
export { roundStep };

// MMR + đòn bẩy tối đa theo bậc ký quỹ của notional (mặc định thận trọng khi chưa có leverageBracket). Notional vượt bậc cuối →
// trả bậc cuối (chỉ để các số in ra hữu hạn); việc chặn do G-08 (analyze) làm.
export function mmrFor(notional: number): { mmr: number; maxLeverage: number } {
  const t = marginTier(notional);
  if (t !== null) return t;
  const list = COMMON.margin.defaultBrackets;
  const lastB = list[list.length - 1]!;
  return { mmr: lastB.maintMarginRatio, maxLeverage: lastB.maxLeverage };
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

// Chia khối lượng theo % chốt: các phần đầu làm tròn XUỐNG theo stepSize, phần cuối nhận phần còn lại (tổng luôn bằng qty)
export function splitQuantity(qty: number, stepSize: number, pcts: readonly number[]): number[] {
  const d = tickDecimals(stepSize);
  const snap = (x: number) => Number(x.toFixed(d));
  const parts: number[] = [];
  let used = 0;
  for (let i = 0; i < pcts.length - 1; i++) {
    const part = snap(Math.floor((qty * pcts[i]!) / 100 / stepSize + 1e-9) * stepSize);
    parts.push(part);
    used += part;
  }
  parts.push(snap(qty - used));
  return parts;
}

// qty = khối lượng của phần này; nếu price = null thì phần này nằm trong phần để trailing stop
export type Target = { name: 'TP1' | 'TP2' | 'TP3'; price: number | null; pct: number; qty: number; r: number | null; reason: string };

// Một dòng của bảng khối lượng theo giá khớp: cùng ngân sách rủi ro, khối lượng đổi theo giá khớp
export type FillRow = { label: 'giá hiện tại' | 'giữa' | 'giá tối đa' | 'limit'; fill: number; qty: number; q: [number, number, number]; estLoss: number };

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
  afterTp1Stop: number; // sau TP1 dời SL về giá vào; sau TP2 giữ nguyên (chỉ áp dụng cho A0)
  exit: ExitPlan; // chính sách thoát (mặc định C2: TP1 50% + trailing trên sàn); TP2/TP3 ở targets là mức thông tin/đối chứng
  valid: boolean;
  invalidReason: string | null;
  trailAtr: number;
  riskPerUnit: number;
  qty: number;
  notional: number;
  riskAmount: number; // NGÂN SÁCH rủi ro (vốn × %), không phải số tiền mất thật
  estLoss: number; // số tiền mất ước tính nếu chạm SL = qty × |vào − SL| + phí ước tính
  fillTable: FillRow[]; // market: 3 dòng (giá hiện tại / giữa / giá tối đa); limit: 1 dòng (giá limit)
  riskPct: number; // % vốn rủi ro thực sự đã dùng để tính khối lượng (P-01)
  costPct: number; // phí + trượt giá khứ hồi đã dùng (%): theo nhóm thanh khoản + trượt thêm theo cỡ lệnh (I7)
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
  extraCostPct: number; // trượt giá THÊM theo cỡ lệnh (% khứ hồi, I7 — sizeSlippagePct), cộng vào phí theo nhóm thanh khoản; 0 = không thêm
  tickSize: number; // bước giá của hợp đồng: mọi giá trong kế hoạch là bội của số này
  stepSize: number;
  fundingRate: number; // mức MỖI KỲ funding của hợp đồng (không phải %/8h)
  fundingIntervalHours: number; // chu kỳ funding của hợp đồng (giờ)
  zones: Zone[];
  exitPolicy?: ExitPolicy; // mặc định COMMON.exit.defaultPolicy
};

// R của TP1; null nếu không có vùng cản để đặt TP1
export function tp1R(plan: TradePlan): number | null {
  return plan.targets[0]?.r ?? null;
}

// TP1 tính bằng R sau phí khứ hồi + funding phải trả, TẠI MỘT GIÁ KHỚP f. costFrac = phí khứ hồi (phần giá) + funding phải trả (phần giá).
// Dùng chung cho lệnh vùng và lệnh mô hình (in "ở giá khớp xấu nhất" và Hạng A tiêu chí 4).
export function tp1NetRAt(side: Side, tp1: number, fill: number, stop: number, costFrac: number): number {
  const dir = side === 'long' ? 1 : -1;
  const risk = Math.abs(fill - stop);
  if (!(risk > 0)) throw new Error(`tp1NetRAt: khoảng cắt lỗ bằng 0 hoặc không hợp lệ (giá khớp ${fill}, SL ${stop})`);
  return (dir * (tp1 - fill) - costFrac * fill) / risk;
}

// Lệnh vùng: TP1 sau phí ở giá khớp XẤU NHẤT cho phép — market: giá tối đa (maxEntry); limit: giá limit. null = không có TP1 cố định.
export function worstTp1NetR(plan: TradePlan, costFrac: number): number | null {
  const tp1 = plan.targets[0]?.price ?? null;
  if (tp1 === null) return null;
  const worst = plan.entryType === 'market' ? plan.maxEntry : plan.entry;
  return tp1NetRAt(plan.side, tp1, worst, plan.stop, costFrac);
}

// Số kiểu Việt Nam cho thông báo: dấu phẩy thập phân
export function vn(x: number, digits: number): string {
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
  if (!Number.isFinite(a.extraCostPct) || a.extraCostPct < 0) {
    throw new Error(`Không lập được kế hoạch: trượt giá thêm theo cỡ lệnh không hợp lệ (${a.extraCostPct})`);
  }
  const tick = a.tickSize;
  const fp = (x: number) => formatTick(x, tick);
  const dz = (z: Zone) => describeZone(z, tick);
  // Làm tròn về phía an toàn: 'away' = ra xa giá vào (SL), 'toward' = vào gần giá vào (TP), 'safeLimit' = Long xuống / Short lên
  const awayDir = a.side === 'long' ? 'down' : 'up';
  const towardDir = a.side === 'long' ? 'down' : 'up';
  const sideWord = a.side === 'long' ? 'hỗ trợ' : 'kháng cự';
  const dirWord = a.side === 'long' ? 'dưới' : 'trên';

  // Vùng đặt SL: vùng đầu tiên (gần giá nhất) đủ mạnh và nằm hẳn một phía của giá thị trường
  const support = stopSideZones(a.zones, marketPrice, a.side).find((z) => z.strength >= zc.minSlStrength) ?? null;
  // Mép vùng phía giá: Long = mép trên vùng hỗ trợ; Short = mép dưới vùng kháng cản
  const nearEdge = support === null ? marketPrice : a.side === 'long' ? support.high : support.low;
  const distAtr = support === null ? 0 : (dir * (marketPrice - nearEdge)) / atrEntry;

  const insideZone = zoneContaining(a.zones, marketPrice);
  let entryType: 'market' | 'limit' = 'market';
  let entry = marketPrice;
  if (support !== null && distAtr > zc.directEntryMaxAtr) {
    entryType = 'limit';
    entry = snapToTick(nearEdge + dir * zc.limitBufferAtr * atrEntry, tick, a.side === 'long' ? 'down' : 'up');
  }

  // Cắt lỗ: ghi lại từng bước thực sự làm đổi SL, SL cuối cùng luôn là số cuối cùng trong lý do
  let stop: number;
  let stopReason: string;
  if (support === null) {
    stop = snapToTick(entry - dir * atrEntry, tick, awayDir); // khoảng tạm để mọi số vẫn hữu hạn; kế hoạch bị đánh dấu không hợp lệ
    stopReason = `Không có vùng ${sideWord} đủ mạnh để đặt SL`;
  } else {
    const farEdge = a.side === 'long' ? support.low : support.high;
    stop = snapToTick(farEdge - dir * zc.slBufferAtr * atrEntry, tick, awayDir);
    stopReason = `${a.side === 'long' ? 'Dưới' : 'Trên'} vùng ${sideWord} ${dz(support)} ${a.side === 'long' ? '−' : '+'} ${vn(zc.slBufferAtr, 1)}×ATR = ${fp(stop)}`;
    if (a.mode === 'swing' && Math.abs(entry - stop) < a.dailyAtr) {
      stop = snapToTick(entry - dir * a.dailyAtr, tick, awayDir);
      stopReason += `; nới tới tối thiểu 1×ATR ngày = ${fp(stop)}`;
    }
    // Đẩy qua số tròn nếu cắt lỗ nằm sát (trong 0,2×ATR) phía bên kia số tròn
    const step = roundStep(entry);
    const round = a.side === 'long' ? Math.floor(stop / step) * step : Math.ceil(stop / step) * step;
    if (Math.abs(stop - round) < COMMON.roundNumberProximityAtr * atrEntry) {
      const pushed = snapToTick(round - dir * COMMON.roundNumberProximityAtr * atrEntry, tick, awayDir);
      if (pushed !== stop) {
        stop = pushed;
        stopReason += `; đẩy qua số tròn ${fp(round)} = ${fp(stop)}`;
      }
    }
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
    const tp = snapToTick((a.side === 'long' ? z.low : z.high) - dir * zc.tpBufferAtr * atrEntry, tick, towardDir);
    if (found.length === 0 && z === candidates[0] && dir * (tp - entry) <= 0) { blockedBy = z; break; }
    const prev = found.length ? found[found.length - 1]!.price! : entry;
    if (dir * (tp - prev) <= 0) continue;
    found.push({ name: `TP${found.length + 1}` as Target['name'], price: tp, pct: 0, qty: 0, r: (dir * (tp - entry)) / riskPerUnit,
      reason: `Trước vùng cản ${dz(z)}` });
  }
  const names = ['TP1', 'TP2', 'TP3'] as const;
  const targets: Target[] = names.map((name, idx) => {
    const pct = zc.exitPcts[idx]!;
    const hit = found[idx];
    if (hit) return { ...hit, name, pct };
    return { name, price: null, pct, qty: 0, r: null,
      reason: found.length === 0 ? 'Không có vùng cản phía trên (giá ở vùng đỉnh mới) — để trailing stop' : 'Không còn vùng cản — phần này để trailing stop (3×ATR)' };
  });
  if (blockedBy !== null) {
    targets.forEach((t) => { t.reason = `Không có chỗ đặt TP1: vùng ${dz(blockedBy!)} sát giá vào`; });
  } else if (a.side === 'short' && found.length === 0) {
    targets.forEach((t) => { t.reason = 'Không có vùng đỡ phía dưới (giá ở vùng đáy mới) — để trailing stop'; });
  }

  let valid = true;
  let invalidReason: string | null = null;
  if (insideZone !== null) {
    valid = false;
    invalidReason = `Giá đang nằm trong vùng ${dz(insideZone)} — chờ giá thoát hẳn khỏi vùng`;
  } else if (support === null) {
    valid = false;
    invalidReason = `Không có vùng ${sideWord} đủ mạnh phía ${dirWord} để đặt SL`;
  } else if (blockedBy !== null) {
    valid = false;
    invalidReason = `${a.side === 'long' ? 'Kháng cự' : 'Hỗ trợ'} ngay sát ${a.side === 'long' ? 'trên' : 'dưới'} giá vào ${dz(blockedBy)} — không có chỗ đặt TP1`;
  } else if (targets[0]!.r !== null && targets[0]!.r < zc.minTp1R) {
    valid = false;
    invalidReason = `Kháng cự đầu tiên quá gần: TP1 chỉ ${vn(targets[0]!.r, 2)}R < ${zc.minTp1R}R`;
  }

  // Giá limit không được nằm trong một vùng
  if (valid && entryType === 'limit') {
    const limitZone = zoneContaining(a.zones, entry);
    if (limitZone !== null) {
      valid = false;
      invalidReason = `Giá limit ${fp(entry)} nằm trong vùng ${dz(limitZone)} — chờ giá thoát hẳn khỏi vùng`;
    }
  }

  // Vùng vào lệnh + lý do
  let maxEntry = snapToTick(marketPrice + dir * cfg.maxEntryAtr * atrEntry, tick, a.side === 'long' ? 'down' : 'up');
  // Dòng xấu nhất (giá khớp tối đa) cũng phải còn TP1 ≥ minTp1R: R = |TP1 − f| / |f − SL| ≥ m ⇔ f ≤ (TP1 + m·SL)/(1+m) (Long); Short đảo chiều
  let maxEntryNote = '';
  const tp1Price = targets[0]!.price;
  if (valid && entryType === 'market' && tp1Price !== null) {
    const limitFill = (tp1Price + zc.minTp1R * stop) / (1 + zc.minTp1R);
    const capped = snapToTick(limitFill, tick, a.side === 'long' ? 'down' : 'up');
    const safeCap = a.side === 'long' ? Math.max(capped, marketPrice) : Math.min(capped, marketPrice);
    if (dir * (maxEntry - safeCap) > 0) {
      const verb = a.side === 'long' ? 'hạ' : 'nâng';
      const prep = a.side === 'long' ? 'xuống' : 'lên';
      maxEntryNote = `; giá tối đa ${verb} từ ${fp(maxEntry)} ${prep} ${fp(safeCap)} để TP1 vẫn ≥ ${zc.minTp1R}R ở giá khớp xấu nhất`;
      maxEntry = safeCap;
    }
  }
  let entryZone: { low: number; high: number };
  let limitExpiryHours: number | null = null;
  let entryReason: string;
  if (entryType === 'limit' && support !== null) {
    entryZone = a.side === 'long' ? { low: nearEdge, high: entry } : { low: entry, high: nearEdge };
    // TP1 đã nằm sai phía giá thị trường (Long ≤, Short ≥) thì điều kiện "chạm TP1 trước" vô nghĩa
    const tp1 = targets[0]!.price;
    const hasTp1 = tp1 !== null && dir * (tp1 - marketPrice) > 0;
    limitExpiryHours = zc.limitExpiryBars[a.mode] * ENTRY_BAR_HOURS[a.mode];
    entryReason = `Giá đã chạy xa vùng ${sideWord} ${vn(distAtr, 1)}×ATR — đặt limit ${fp(entry)} chờ hồi về vùng ${dz(support)}; hủy nếu sau ${limitExpiryHours} giờ chưa khớp${hasTp1 ? ' hoặc giá chạm TP1 trước' : ''}`;
  } else {
    const inner = support === null ? marketPrice : a.side === 'long' ? Math.max(support.high, stop + 0.5 * atrEntry) : Math.min(support.low, stop - 0.5 * atrEntry);
    // vùng luôn chứa giá thị trường (giá có thể đang nằm trong vùng hỗ trợ)
    entryZone = a.side === 'long'
      ? { low: snapToTick(Math.min(inner, marketPrice), tick, 'down'), high: maxEntry }
      : { low: maxEntry, high: snapToTick(Math.max(inner, marketPrice), tick, 'up') };
    entryReason = support === null || insideZone !== null
      ? invalidReason!
      : `Giá đang sát vùng ${sideWord} ${dz(support)} — vào trực tiếp, không ${a.side === 'long' ? 'mua cao' : 'bán thấp'} hơn ${fp(maxEntry)}${maxEntryNote}`;
  }

  const exitPolicy = a.exitPolicy ?? COMMON.exit.defaultPolicy;
  const c2 = exitPolicy === 'C2' && targets[0]!.price !== null; // C2 không có TP1 -> cả vị thế theo trailing ATR như cũ, giữ kiểm tra cũ
  const costPct = COMMON.costRoundTripPct[a.costTier] + a.extraCostPct;
  const size = positionSize(a.capital, a.riskPct, entry, stop, costPct, a.stepSize);
  const estLoss = size.qty * riskPerUnit + (size.notional * costPct) / 100;
  const parts = splitQuantity(size.qty, a.stepSize, zc.exitPcts);
  targets.forEach((t, i) => { t.qty = parts[i]!; });
  // Bảng khối lượng theo giá khớp: cùng ngân sách rủi ro, khối lượng = rủi ro ÷ (|khớp − SL| + phí)
  const row = (label: FillRow['label'], fill: number): FillRow => {
    const sz = positionSize(a.capital, a.riskPct, fill, stop, costPct, a.stepSize);
    const q = splitQuantity(sz.qty, a.stepSize, zc.exitPcts) as [number, number, number];
    return { label, fill, qty: sz.qty, q, estLoss: sz.qty * Math.abs(fill - stop) + (sz.notional * costPct) / 100 };
  };
  const fillTable: FillRow[] = entryType === 'limit'
    ? [row('limit', entry)]
    : [row('giá hiện tại', marketPrice), row('giữa', snapToTick((marketPrice + maxEntry) / 2, tick, 'nearest')), row('giá tối đa', maxEntry)];
  if (valid) {
    if (size.qty <= 0) {
      valid = false;
      invalidReason = 'Khối lượng quá nhỏ so với bước khối lượng của sàn — tăng vốn hoặc bỏ lệnh';
    } else if (c2 ? !(targets[0]!.qty > 0 && size.qty - targets[0]!.qty > 0) : targets.some((t) => t.price !== null && t.qty <= 0)) {
      valid = false;
      invalidReason = c2
        ? `Khối lượng không chia được TP1 ${zc.exitPcts[0]}% + trailing ${100 - zc.exitPcts[0]!}% theo bước khối lượng của sàn`
        : 'Khối lượng không chia được 50/30/20 theo bước khối lượng của sàn';
    }
  }
  // Dòng đầu đã hợp lệ thì kiểm nốt các dòng sau bằng cùng luật: khối lượng > 0 và mọi phần có giá TP phải ≥ 1 bước.
  // Giá khớp càng xấu thì khối lượng càng nhỏ nên các dòng sau dễ hỏng trước → bỏ dòng hỏng, hạ giá tối đa về dòng hợp lệ cuối cùng.
  if (valid && entryType === 'market') {
    const rowOk = (f: FillRow) => f.qty > 0 && (c2 ? f.q[0] > 0 && f.qty - f.q[0] > 0 : targets.every((t, i) => t.price === null || f.q[i]! > 0));
    const kept = fillTable.filter(rowOk);
    if (kept.length < fillTable.length && kept.length > 0) {
      fillTable.length = 0;
      fillTable.push(...kept);
      maxEntry = snapToTick(kept[kept.length - 1]!.fill, tick, a.side === 'long' ? 'down' : 'up');
      if (a.side === 'long') entryZone.high = maxEntry; else entryZone.low = maxEntry;
      entryReason += `; giá tối đa ${a.side === 'long' ? 'hạ xuống' : 'nâng lên'} ${fp(maxEntry)} vì khối lượng không chia được ${c2 ? `TP1 ${zc.exitPcts[0]}% + trailing ${100 - zc.exitPcts[0]!}%` : zc.exitPcts.join('/')} ở giá khớp xấu hơn`;
    }
  }
  // Bậc ký quỹ theo notional (I7): MMR và đòn bẩy tối đa của bậc; vượt bậc cuối → dùng bậc cuối để in số, G-08 sẽ trượt
  const mmr = mmrFor(size.notional);
  const safe = maxSafeLeverage(riskPerUnit / entry, mmr.mmr, COMMON.liquidationBufferStops);
  const suggested = Math.max(1, Math.min(cfg.maxLeverage, mmr.maxLeverage, Math.floor(safe)));
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
    exit: buildExit({ policy: exitPolicy, side: a.side, worstEntry: entryType === 'limit' ? entry : maxEntry, valid, tp1: targets[0]!.price, trailAtr: cfg.trailAtrMult * atrEntry, costPct, qty: size.qty, tp1Qty: targets[0]!.qty }),
    valid,
    invalidReason,
    trailAtr: cfg.trailAtrMult * atrEntry,
    riskPerUnit,
    qty: size.qty,
    notional: size.notional,
    riskAmount: size.riskAmount,
    estLoss,
    fillTable,
    riskPct: a.riskPct,
    costPct,
    safeLeverage: safe,
    suggestedLeverage: suggested,
    liquidationEstimate: liquidationPrice(entry, suggested, a.side, mmr.mmr),
    marginNeeded: size.notional / suggested,
    fundingCostR: (dir * fundingPerUnit) / riskPerUnit,
    timeStopHours: cfg.timeStopHours,
    maxHoldHours: cfg.maxHoldHours,
  };
}
