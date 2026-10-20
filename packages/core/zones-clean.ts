import { atr, last, pivotHighs, pivotLows } from './indicators.ts';
import { isClosed } from './candles.ts';
import { COMMON } from './config.ts';
import type { Candle } from './types.ts';
import type { Zone } from './zones.ts';

// Vùng hỗ trợ/kháng cự cách 'clean' (COMMON.zones.method = 'clean', chỉ Swing) — sửa các lỗi của kiểm toán S/R 20/10/2026
// (research_notes/Luật giao dịch của quỹ lớn/sr_audit_data.md, mục A6). Các bước:
//   1. Pivot từng khung (4H, 1D) — đỉnh/đáy BẰNG nhau cũng tính — gom cụm bằng ATR(14) CỦA CHÍNH KHUNG ĐÓ (cách cũ dùng ATR 4H cho cả 1D).
//   2. Vùng rộng tối thiểu 0,25×ATR khung của nó (cách cũ: vùng 1 pivot rộng 0) — nới đều hai bên quanh tâm.
//   3. Bỏ vùng cũ: pivot mới nhất quá maxAgeDays (1D 180 ngày, 4H 60 ngày).
//   4. Bỏ vùng đã bị phá: nến đã đóng của khung đó đóng cửa xuyên mép xa − 0,5×ATR. Vùng bị phá mà sau đó giá quay lại chạm vùng từ phía mới
//      và vẫn đóng cửa ở phía mới → LẬT VAI TRÒ (hỗ trợ cũ thành kháng cự), giữ lại; không có lần kiểm lại → bỏ.
//   5. Vùng HVN từ hồ sơ khối lượng 60 ngày nến 4H; gộp mọi vùng chồng nhau (pivot 1D, pivot 4H, HVN) thành một.
//   6. Giữ tối đa 3 vùng gần giá nhất mỗi phía (+ vùng đang chứa giá, để luật "giá trong vùng thì không vào lệnh" vẫn chạy).
//   7. Độ mạnh = số lần BẬT đã xác nhận trên nến 4H + 1 nếu có HVN hoặc có cả nguồn 1D lẫn 4H (hợp lưu) — KHÔNG phụ thuộc độ rộng vùng.
//      Nhãn: Yếu ≤ 1, Trung bình = 2, Mạnh ≥ 3 (zones.ts strengthLabel).
// Chỉ dùng nến ĐÃ ĐÓNG trước thời điểm quyết định `now` (closeTime < now) — nến chưa đóng / nến tương lai bị bỏ (không nhìn trước).

const DAY_MS = 86_400_000;

// Vùng đang dựng (nội bộ): giữ thêm khung nguồn, số pivot theo nhãn, cờ HVN / lật vai trò
// atrRef = ATR của khung nguồn (HVN: ATR 4H); vùng gộp lấy ATR lớn nhất — làm thước cho trần độ rộng khi gộp
type Draft = { low: number; high: number; labels: Map<string, number>; frames: Set<string>; hvn: boolean; flipped: boolean; atrRef: number };

type Point = { price: number; index: number; label: string };

export type CleanZoneInput = {
  entry: Candle[]; // khung vào lệnh (Swing: 4H) — cũng dùng cho HVN và đếm lần bật
  trend: Candle[]; // khung xu hướng (Swing: 1D)
  entryInterval: string; // '4h'
  trendInterval: string; // '1d'
  price: number; // giá hiện tại (giá mark) để gắn phía hỗ trợ/kháng cự và chọn 3 vùng gần nhất mỗi phía
  now: number; // thời điểm quyết định (ms)
};

// Trạng thái phá vỡ của một vùng, xét các nến đã đóng SAU pivot mới nhất của vùng (cùng khung):
// 'intact' = chưa bị phá; 'flipped' = bị phá rồi được kiểm lại từ phía mới (lật vai trò); 'broken' = bị phá, chưa kiểm lại → bỏ
export function breakStatus(c: Candle[], atrs: number[], low: number, high: number, from: number): 'intact' | 'flipped' | 'broken' {
  const k0 = COMMON.zones.clean.breakAtr;
  let side: 'above' | 'below' | null = null; // giá đang ở phía nào của vùng (đặt ở lần đóng cửa ngoài vùng đầu tiên, đổi khi bị phá)
  let broken = false;
  let flipped = false;
  for (let j = from + 1; j < c.length; j++) {
    const k = c[j]!;
    const a = atrs[j]!;
    if (!Number.isFinite(a)) continue;
    if (broken) {
      // Kiểm lại: chạm vùng từ phía mới nhưng đóng cửa vẫn ở phía mới
      const retest = side === 'below' ? k.high >= low && k.close < low : k.low <= high && k.close > high;
      if (retest) { broken = false; flipped = true; }
      continue;
    }
    if (side === 'above' && k.close < low - k0 * a) { broken = true; side = 'below'; continue; }
    if (side === 'below' && k.close > high + k0 * a) { broken = true; side = 'above'; continue; }
    if (side === null && k.close > high) side = 'above';
    else if (side === null && k.close < low) side = 'below';
  }
  if (broken) return 'broken';
  return flipped ? 'flipped' : 'intact';
}

// Vùng pivot của một khung: gom cụm bằng ATR khung đó, nới độ rộng tối thiểu, bỏ vùng cũ và vùng đã bị phá
function frameZones(c: Candle[], interval: string, now: number): Draft[] {
  const cfg = COMMON.zones.clean;
  const zc = COMMON.zones;
  const atrs = atr(c, cfg.atrPeriod);
  const a = last(atrs);
  // Khung không đủ nến để có ATR (hợp đồng mới) → không có vùng từ khung này
  if (!Number.isFinite(a) || a <= 0) return [];
  const maxAge = cfg.maxAgeDays[interval];
  if (maxAge === undefined) throw new Error(`Vùng 'clean': chưa có maxAgeDays cho khung '${interval}' (chỉ hỗ trợ Swing 4H/1D)`);
  const label = interval.toUpperCase();
  const n = COMMON.pivotConfirmBars;
  const highs = c.map((k) => k.high);
  const lows = c.map((k) => k.low);
  const points: Point[] = [
    ...pivotHighs(highs, n, true).map((i) => ({ price: highs[i]!, index: i, label: `đỉnh ${label}` })),
    ...pivotLows(lows, n, true).map((i) => ({ price: lows[i]!, index: i, label: `đáy ${label}` })),
  ].sort((p, q) => p.price - q.price);

  // Gom như cách cũ (mergeAtr, maxWidthAtr) nhưng bằng ATR của chính khung này
  const groups: Point[][] = [];
  for (const p of points) {
    const cur = groups[groups.length - 1];
    const prev = cur?.[cur.length - 1];
    if (cur && prev && p.price - prev.price <= zc.mergeAtr * a && p.price - cur[0]!.price <= zc.maxWidthAtr * a) cur.push(p);
    else groups.push([p]);
  }

  const out: Draft[] = [];
  for (const g of groups) {
    const newest = Math.max(...g.map((p) => p.index));
    if (c[newest]!.openTime < now - maxAge * DAY_MS) continue; // vùng cũ
    let low = g[0]!.price;
    let high = g[g.length - 1]!.price;
    const minWidth = cfg.minWidthAtr * a;
    if (high - low < minWidth) {
      const mid = (low + high) / 2;
      low = mid - minWidth / 2;
      high = mid + minWidth / 2;
    }
    const status = breakStatus(c, atrs, low, high, newest);
    if (status === 'broken') continue;
    const labels = new Map<string, number>();
    for (const p of g) labels.set(p.label, (labels.get(p.label) ?? 0) + 1);
    out.push({ low, high, labels, frames: new Set([interval]), hvn: false, flipped: status === 'flipped', atrRef: a });
  }
  return out;
}

// Trung vị của mảng số (không sửa mảng gốc)
function median(xs: number[]): number {
  const s = [...xs].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

// Vùng HVN (High Volume Node): hồ sơ khối lượng 60 ngày nến 4H. quoteVolume mỗi nến rải ĐỀU trên [low, high] vào các ô rộng
// 0,25×ATR(4H); ô là cực đại cục bộ (lớn hơn ô dưới, ≥ ô trên) và ≥ 1,5 × trung vị các ô → một vùng HVN đúng bằng ô đó.
export function hvnZones(c: Candle[], atr4h: number, now: number): Array<{ low: number; high: number }> {
  const cfg = COMMON.zones.clean;
  const recent = c.filter((k) => k.openTime >= now - cfg.hvnDays * DAY_MS);
  if (recent.length === 0 || !(atr4h > 0)) return [];
  const w = cfg.hvnBinAtr * atr4h;
  const base = Math.min(...recent.map((k) => k.low));
  const top = Math.max(...recent.map((k) => k.high));
  const nBins = Math.floor((top - base) / w) + 1;
  const vol = new Array<number>(nBins).fill(0);
  for (const k of recent) {
    const lo = (k.low - base) / w;
    const hi = (k.high - base) / w;
    if (hi <= lo) { vol[Math.min(nBins - 1, Math.floor(lo))]! += k.quoteVolume; continue; } // nến không có biên độ: dồn vào một ô
    for (let b = Math.floor(lo); b <= Math.min(Math.floor(hi), nBins - 1); b++) {
      const overlap = Math.min(hi, b + 1) - Math.max(lo, b);
      if (overlap > 0) vol[b]! += (k.quoteVolume * overlap) / (hi - lo);
    }
  }
  const cut = cfg.hvnMinMedianMult * median(vol);
  const out: Array<{ low: number; high: number }> = [];
  for (let b = 0; b < nBins; b++) {
    const v = vol[b]!;
    const below = b > 0 ? vol[b - 1]! : 0;
    const above = b < nBins - 1 ? vol[b + 1]! : 0;
    if (v > 0 && v > below && v >= above && v >= cut) out.push({ low: base + b * w, high: base + (b + 1) * w });
  }
  return out;
}

// Số lần BẬT đã xác nhận trên nến 4H: một lần chạm = nến chạm vùng khi nến trước chưa chạm; tiếp cận từ trên (nến trước đóng trên vùng)
// thì bật = có nến SAU nến chạm lên tới mép trên + 1×ATR(4H tại nến chạm) TRƯỚC khi có nến nào đóng cửa dưới mép dưới (tiếp cận từ dưới:
// đối xứng). Cùng một nến vừa đóng xuyên vừa chạm mục tiêu → tính là không bật (thận trọng). Lần chạm chưa ngã ngũ tới nến cuối → không tính.
export function countBounces(c: Candle[], atrs: number[], low: number, high: number): number {
  const move = COMMON.zones.clean.bounceAtr;
  const touches = (k: Candle) => k.low <= high && k.high >= low;
  let count = 0;
  let j = 1;
  while (j < c.length) {
    const prev = c[j - 1]!;
    const a = atrs[j]!;
    if (!touches(c[j]!) || touches(prev) || !Number.isFinite(a)) { j++; continue; }
    const fromAbove = prev.close > high; // nến trước không chạm vùng nên đóng hẳn trên hoặc hẳn dưới
    let end = c.length - 1;
    for (let m = j; m < c.length; m++) {
      const q = c[m]!;
      if (fromAbove ? q.close < low : q.close > high) { end = m; break; } // đóng xuyên vùng → không bật
      if (m > j && (fromAbove ? q.high >= high + move * a : q.low <= low - move * a)) { count++; end = m; break; }
    }
    j = end + 1;
  }
  return count;
}

// Gộp vùng chồng nhau (low ≤ high của vùng trước) thành một: hợp biên, cộng nhãn pivot, hợp khung nguồn. Trần: vùng sau khi gộp rộng
// ≤ maxWidthAtr (1,5) × ATR lớn nhất của các khung nguồn — như trần gom cụm của cách cũ; không có trần thì các vùng chồng nối tiếp nhau
// thành vùng rộng 5–9×ATR (thấy khi kiểm thử trên dữ liệu thật, trước khi chạy backtest). Vượt trần → hai vùng để riêng.
export function mergeOverlapping(drafts: Draft[]): Draft[] {
  const sorted = [...drafts].sort((p, q) => p.low - q.low);
  const out: Draft[] = [];
  for (const d of sorted) {
    const cur = out[out.length - 1];
    const capAtr = Math.max(cur?.atrRef ?? 0, d.atrRef);
    const tooWide = cur !== undefined && Math.max(cur.high, d.high) - cur.low > COMMON.zones.maxWidthAtr * capAtr;
    if (cur === undefined || d.low > cur.high || tooWide) {
      out.push({ ...d, labels: new Map(d.labels), frames: new Set(d.frames) });
      continue;
    }
    cur.high = Math.max(cur.high, d.high);
    for (const [k, v] of d.labels) cur.labels.set(k, (cur.labels.get(k) ?? 0) + v);
    for (const f of d.frames) cur.frames.add(f);
    cur.hvn = cur.hvn || d.hvn;
    cur.flipped = cur.flipped || d.flipped;
    cur.atrRef = capAtr;
  }
  return out;
}

// Giữ tối đa `max` vùng gần giá nhất mỗi phía (hỗ trợ: nằm hẳn dưới giá; kháng cự: nằm hẳn trên giá) + vùng đang chứa giá; sắp theo giá tăng dần
export function keepNearest<T extends { low: number; high: number }>(zones: T[], price: number, max: number): T[] {
  const below = zones.filter((z) => z.high < price).sort((p, q) => q.high - p.high).slice(0, max);
  const above = zones.filter((z) => z.low > price).sort((p, q) => p.low - q.low).slice(0, max);
  const inside = zones.filter((z) => z.low <= price && price <= z.high);
  return [...below, ...inside, ...above].sort((p, q) => p.low - q.low);
}

export function findCleanZones(a: CleanZoneInput): Zone[] {
  if (!Number.isFinite(a.price) || a.price <= 0) throw new Error(`findCleanZones: giá hiện tại không hợp lệ (${a.price})`);
  const cfg = COMMON.zones.clean;
  // Không nhìn trước: chỉ nến đã đóng trước now
  const entry = a.entry.filter((k) => isClosed(k, a.now));
  const trend = a.trend.filter((k) => isClosed(k, a.now));
  // Hợp đồng mới niêm yết: chưa đủ nến 4H đã đóng để có ATR(14) → không có vùng (xử lý tường minh, không bắt lỗi).
  // Lý do vẫn hiện như đường cũ: analyze → buildPlan báo lỗi "ATR khung vào lệnh không hợp lệ" cho mã này (máy quét ghi theo từng mã).
  if (entry.length < cfg.atrPeriod) return [];
  const atrs4h = atr(entry, cfg.atrPeriod);
  const atr4h = last(atrs4h);
  // Đủ nến nhưng ATR = 0 (giá đứng yên tuyệt đối) là dữ liệu bất thường → báo lỗi như findZones cũ
  if (!Number.isFinite(atr4h) || atr4h <= 0) throw new Error(`findCleanZones: ATR khung vào lệnh không hợp lệ (${atr4h}), cần số hữu hạn > 0`);

  const hvn: Draft[] = hvnZones(entry, atr4h, a.now)
    .map((z) => ({ ...z, labels: new Map<string, number>(), frames: new Set<string>(), hvn: true, flipped: false, atrRef: atr4h }));
  const merged = mergeOverlapping([
    ...frameZones(entry, a.entryInterval, a.now),
    ...frameZones(trend, a.trendInterval, a.now),
    ...hvn,
  ]);

  return keepNearest(merged, a.price, cfg.maxPerSide).map((d) => {
    const confluence = d.hvn || (d.frames.has(a.entryInterval) && d.frames.has(a.trendInterval));
    const sources = [...d.labels].map(([label, n]) => `${label} ×${n}`);
    if (d.hvn) sources.push('hvn');
    if (d.flipped) sources.push('đã lật vai trò');
    return {
      low: d.low,
      high: d.high,
      touches: [...d.labels.values()].reduce((s, n) => s + n, 0), // số pivot trong vùng (như cách cũ)
      strength: countBounces(entry, atrs4h, d.low, d.high) + (confluence ? 1 : 0),
      sources,
    };
  });
}
