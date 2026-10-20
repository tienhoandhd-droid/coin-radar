import { pivotHighs, pivotLows, roundStep } from './indicators.ts';
import { COMMON } from './config.ts';
import { formatTick } from './price.ts';
import type { Candle, Side } from './types.ts';

export type Zone = { low: number; high: number; strength: number; touches: number; sources: string[] };

type Point = { price: number; weight: number; label: string };

// Số kiểu Việt Nam: dấu phẩy thập phân, 5 chữ số có nghĩa (giá ≥ 100.000 thì làm tròn nguyên)
export function formatPrice(x: number): string {
  const s = Math.abs(x) >= 100_000 ? x.toFixed(0) : x.toPrecision(5);
  return s.replace('.', ',');
}

function pivotPoints(c: Candle[], label: string, weight: number): Point[] {
  const n = COMMON.pivotConfirmBars;
  const highs = c.map((k) => k.high);
  const lows = c.map((k) => k.low);
  return [
    ...pivotHighs(highs, n).map((i) => ({ price: highs[i]!, weight, label: `đỉnh ${label}` })),
    ...pivotLows(lows, n).map((i) => ({ price: lows[i]!, weight, label: `đáy ${label}` })),
  ];
}

// Phân vị p (0..1) theo nội suy tuyến tính trên mảng đã sắp tăng dần
function percentile(sorted: number[], p: number): number {
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export function findZones(a: { entry: Candle[]; trend: Candle[]; entryLabel: string; trendLabel: string; atr: number; tickSize?: number }): Zone[] {
  if (!Number.isFinite(a.atr) || a.atr <= 0) throw new Error(`findZones: ATR không hợp lệ (${a.atr}), cần số hữu hạn > 0`);
  const cfg = COMMON.zones;
  const points = [
    ...pivotPoints(a.entry, a.entryLabel, cfg.entryWeight),
    ...pivotPoints(a.trend, a.trendLabel, cfg.trendWeight),
  ].sort((p, q) => p.price - q.price);

  // Gom điểm thành nhóm: gần điểm liền trước (≤ mergeAtr×ATR) và không quá rộng so với điểm đầu nhóm (≤ maxWidthAtr×ATR)
  const groups: Point[][] = [];
  for (const p of points) {
    const cur = groups[groups.length - 1];
    const prev = cur?.[cur.length - 1];
    if (cur && prev && p.price - prev.price <= cfg.mergeAtr * a.atr && p.price - cur[0]!.price <= cfg.maxWidthAtr * a.atr) {
      cur.push(p);
    } else {
      groups.push([p]);
    }
  }

  const zones: Zone[] = groups.map((g) => {
    const counts = new Map<string, number>();
    for (const p of g) counts.set(p.label, (counts.get(p.label) ?? 0) + 1);
    return {
      low: g[0]!.price,
      high: g[g.length - 1]!.price,
      touches: g.length,
      strength: g.reduce((s, p) => s + p.weight, 0),
      sources: [...counts].map(([label, n]) => `${label} ×${n}`),
    };
  });

  // Số tròn
  for (const z of zones) {
    const step = roundStep((z.low + z.high) / 2);
    const from = z.low - cfg.roundToleranceAtr * a.atr;
    const to = z.high + cfg.roundToleranceAtr * a.atr;
    const k = Math.ceil(from / step - 1e-9);
    if (k * step <= to + 1e-9) {
      z.strength += cfg.roundBonus;
      z.sources.push(`số tròn ${a.tickSize === undefined ? formatPrice(k * step) : formatTick(k * step, a.tickSize)}`);
    }
  }

  // Khối lượng giao dịch: cần đủ số vùng tối thiểu để có tứ phân vị
  if (zones.length >= cfg.minZonesForVolume) {
    const vols = zones.map((z) => a.entry.reduce((s, k) => (k.low <= z.high && k.high >= z.low ? s + k.quoteVolume : s), 0));
    const p75 = percentile([...vols].sort((x, y) => x - y), cfg.volumePercentile);
    zones.forEach((z, i) => {
      if (vols[i]! >= p75) {
        z.strength += cfg.volumeBonus;
        z.sources.push('khối lượng giao dịch cao');
      }
    });
  }
  return zones;
}

// Phía đặt SL: Long = vùng nằm HẲN dưới giá (zone.high < giá); Short = nằm hẳn trên giá (zone.low > giá).
// Vùng đang chứa giá không thuộc phía nào (người dùng chốt 19/10/2026: giá trong vùng thì không vào lệnh).
export function stopSideZones(zones: Zone[], price: number, side: Side): Zone[] {
  return side === 'long'
    ? zones.filter((z) => z.high < price).sort((p, q) => q.high - p.high)
    : zones.filter((z) => z.low > price).sort((p, q) => p.low - q.low);
}

// Vùng đang chứa giá (kể cả đúng mép: low ≤ giá ≤ high); không có thì null
export function zoneContaining(zones: Zone[], price: number): Zone | null {
  return zones.find((z) => z.low <= price && price <= z.high) ?? null;
}

// Phía mục tiêu: Long = vùng nằm hẳn phía trên giá; Short = nằm hẳn phía dưới
export function targetSideZones(zones: Zone[], price: number, side: Side): Zone[] {
  return side === 'long'
    ? zones.filter((z) => z.low > price).sort((p, q) => p.low - q.low)
    : zones.filter((z) => z.high < price).sort((p, q) => q.high - p.high);
}

// Vùng cản đủ mạnh để chặn TP1 (B3b): độ mạnh ≥ minSlStrength. Cờ tp1SkipWeak = false → mọi vùng đều chặn (biến thể so sánh).
export function isBlockingZone(z: Zone): boolean {
  return !COMMON.zones.tp1SkipWeak || z.strength >= COMMON.zones.minSlStrength;
}

// Vùng phía mục tiêu, gần giá nhất trước, tách thành: vùng chặn (đủ mạnh) và vùng yếu bị bỏ qua.
// skipped = chỉ các vùng yếu NẰM TRƯỚC `until` (mặc định: trước vùng chặn đầu tiên; không có vùng chặn thì tất cả) — đúng các vùng TP1 đã "bước qua".
export function targetZonesSplit(zones: Zone[], price: number, side: Side, until?: number): { blocking: Zone[]; skipped: Zone[] } {
  const all = targetSideZones(zones, price, side);
  const blocking = all.filter(isBlockingZone);
  const edge = (z: Zone) => (side === 'long' ? z.low : z.high);
  const limit = until ?? (blocking[0] !== undefined ? edge(blocking[0]) : undefined);
  const skipped = all.filter((z) => !isBlockingZone(z) && (limit === undefined || (side === 'long' ? edge(z) < limit : edge(z) > limit)));
  return { blocking, skipped };
}

// Khoảng giá của vùng, in theo tickSize; vùng chỉ có một mức (low = high) in một giá
export function describeZoneRange(z: Zone, tickSize?: number): string {
  const f = (x: number) => (tickSize === undefined ? formatPrice(x) : formatTick(x, tickSize));
  return f(z.low) === f(z.high) ? f(z.low) : `${f(z.low)}–${f(z.high)}`;
}

export function describeZone(z: Zone, tickSize?: number): string {
  return `${describeZoneRange(z, tickSize)} (${z.sources.join(', ')})`;
}

// Dòng lý do cho mỗi vùng yếu bị bỏ qua khi chọn TP1 (B3b)
export function skippedZoneLine(z: Zone, tickSize?: number): string {
  return `bỏ qua vùng ${describeZoneRange(z, tickSize)} (độ mạnh ${String(z.strength).replace('.', ',')}) — TP1 lấy vùng kế tiếp`;
}

// ---- Luật S/R xác nhận (COMMON.entryRules.srConfirm) và nhãn vùng ----

// Nhãn độ mạnh của vùng 'clean' (độ mạnh = số lần bật đã xác nhận + 1 nếu có HVN hoặc hợp lưu 1D + 4H — zones-clean.ts):
//   Yếu ≤ 1 | Trung bình = 2 | Mạnh ≥ 3
export function strengthLabel(strength: number): 'Yếu' | 'Trung bình' | 'Mạnh' {
  if (strength >= 3) return 'Mạnh';
  if (strength >= 2) return 'Trung bình';
  return 'Yếu';
}

// Vai trò theo giá hiện tại: nằm HẲN dưới giá = Hỗ trợ; nằm HẲN trên giá = Kháng cự; chứa giá = không thuộc phía nào (không vào lệnh)
export function zoneRole(z: Zone, price: number): 'Hỗ trợ' | 'Kháng cự' | 'Vùng chứa giá' {
  if (z.high < price) return 'Hỗ trợ';
  if (z.low > price) return 'Kháng cự';
  return 'Vùng chứa giá';
}

// "Hỗ trợ 1,20–1,25 (Trung bình, độ mạnh 2; đáy 4H ×2, hvn)" — dùng trong lý do của kế hoạch khi bật srConfirm
export function describeZoneSr(z: Zone, price: number, tickSize?: number): string {
  return `${zoneRole(z, price)} ${describeZoneRange(z, tickSize)} (${strengthLabel(z.strength)}, độ mạnh ${String(z.strength).replace('.', ',')}; ${z.sources.join(', ')})`;
}

export type SrConfirmation = { zone: Zone | null; reason: string };

// Nến xác nhận (nến khung vào lệnh ĐÃ ĐÓNG cuối cùng) tại vùng mạnh, theo COMMON.zones.confirm:
//   Long : low chạm một HỖ TRỢ độ mạnh ≥ 2 (low ≤ zone.high), đóng cửa TRÊN zone.high, râu dưới ≥ 50% biên độ, taker mua ≥ 0,5
//   Short: high chạm một KHÁNG CỰ độ mạnh ≥ 2 (high ≥ zone.low), đóng cửa DƯỚI zone.low, râu trên ≥ 50% biên độ, taker mua ≤ 0,5
//   Thêm: nến xác nhận KHÔNG được chạm mức SL (Long: low > zone.low − slBufferAtr×ATR; Short: high < zone.high + slBufferAtr×ATR) —
//   nến đã xuyên qua mức SL thì SL sẽ nằm trong chính nến xác nhận, không phải "ngoài vùng". atrEntry = ATR(14) khung vào lệnh.
// Hỗ trợ/kháng cự xét theo giá hiện tại `price`. Nhiều vùng thỏa → lấy vùng gần giá nhất. Không có → zone = null + lý do tiếng Việt.
export function confirmedZone(zones: Zone[], bar: Candle, price: number, side: Side, atrEntry: number, tickSize?: number): SrConfirmation {
  const cfg = COMMON.zones.confirm;
  const sideWord = side === 'long' ? 'hỗ trợ' : 'kháng cự';
  const head = `Không có ${sideWord} rõ ràng (vùng mạnh ≥ ${cfg.minStrength}) / chưa có nến xác nhận`;
  const strong = stopSideZones(zones, price, side).filter((z) => z.strength >= cfg.minStrength);
  if (strong.length === 0) return { zone: null, reason: `${head}: không có vùng ${sideWord} nào độ mạnh ≥ ${cfg.minStrength}` };
  const touched = strong.filter((z) => (side === 'long' ? bar.low <= z.high : bar.high >= z.low));
  if (touched.length === 0) return { zone: null, reason: `${head}: nến 4H vừa đóng không chạm vùng ${sideWord} mạnh nào` };
  const range = bar.high - bar.low;
  const wick = side === 'long' ? Math.min(bar.open, bar.close) - bar.low : bar.high - Math.max(bar.open, bar.close);
  const wickPct = range > 0 ? wick / range : 0;
  const taker = bar.quoteVolume > 0 ? bar.takerBuyQuote / bar.quoteVolume : NaN;
  for (const z of touched) {
    const closedBack = side === 'long' ? bar.close > z.high : bar.close < z.low;
    if (!closedBack) continue;
    const slLevel = side === 'long' ? z.low - cfg.slBufferAtr * atrEntry : z.high + cfg.slBufferAtr * atrEntry;
    const breached = side === 'long' ? bar.low <= slLevel : bar.high >= slLevel;
    if (breached) {
      const f = (x: number) => (tickSize === undefined ? formatPrice(x) : formatTick(x, tickSize));
      return { zone: null, reason: `${head}: nến chạm ${describeZoneSr(z, price, tickSize)} nhưng đã xuyên qua mức SL ${f(slLevel)} (${side === 'long' ? 'đáy' : 'đỉnh'} nến ${f(side === 'long' ? bar.low : bar.high)}) — vùng không giữ được` };
    }
    if (wickPct < cfg.minWickPct) {
      return { zone: null, reason: `${head}: nến chạm ${describeZoneSr(z, price, tickSize)} nhưng râu ${side === 'long' ? 'dưới' : 'trên'} chỉ ${Math.round(wickPct * 100)}% biên độ (< ${cfg.minWickPct * 100}%)` };
    }
    const takerOk = side === 'long' ? taker >= cfg.takerRatio : taker <= cfg.takerRatio;
    if (!takerOk) {
      const tk = Number.isFinite(taker) ? taker.toFixed(2).replace('.', ',') : 'không có (khối lượng 0)';
      const lim = String(cfg.takerRatio).replace('.', ',');
      return { zone: null, reason: `${head}: nến chạm ${describeZoneSr(z, price, tickSize)} nhưng tỉ lệ taker mua ${tk} ${side === 'long' ? '<' : '>'} ${lim}` };
    }
    return { zone: z, reason: `nến 4H đã đóng chạm ${describeZoneSr(z, price, tickSize)}, đóng lại ${side === 'long' ? 'trên' : 'dưới'} vùng, râu ${Math.round(wickPct * 100)}%, taker mua ${taker.toFixed(2).replace('.', ',')}` };
  }
  return { zone: null, reason: `${head}: nến 4H vừa đóng chạm vùng ${sideWord} mạnh nhưng không đóng cửa lại ${side === 'long' ? 'trên' : 'dưới'} vùng` };
}
