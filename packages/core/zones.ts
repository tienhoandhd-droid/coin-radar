import { pivotHighs, pivotLows, roundStep } from './indicators.ts';
import { COMMON } from './config.ts';
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

export function findZones(a: { entry: Candle[]; trend: Candle[]; entryLabel: string; trendLabel: string; atr: number }): Zone[] {
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
      z.sources.push(`số tròn ${formatPrice(k * step)}`);
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

// Phía đặt SL: Long = vùng nằm dưới (gồm vùng đang chứa giá), gần giá nhất trước
export function stopSideZones(zones: Zone[], price: number, side: Side): Zone[] {
  return side === 'long'
    ? zones.filter((z) => z.low < price).sort((p, q) => q.high - p.high)
    : zones.filter((z) => z.high > price).sort((p, q) => p.low - q.low);
}

// Phía mục tiêu: Long = vùng nằm hẳn phía trên giá; Short = nằm hẳn phía dưới
export function targetSideZones(zones: Zone[], price: number, side: Side): Zone[] {
  return side === 'long'
    ? zones.filter((z) => z.low > price).sort((p, q) => p.low - q.low)
    : zones.filter((z) => z.high < price).sort((p, q) => q.high - p.high);
}

export function describeZone(z: Zone): string {
  return `${formatPrice(z.low)}–${formatPrice(z.high)} (${z.sources.join(', ')})`;
}
