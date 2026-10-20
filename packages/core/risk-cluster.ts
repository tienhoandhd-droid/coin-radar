import type { OpenTrade } from './portfolio.ts';
import type { Candle, Side } from './types.ts';

// Kiểm soát rủi ro danh mục "risk-cluster" (COMMON.portfolio.cluster, đăng ký trước 20/10/2026 — chỉ SIẾT, không nới). Hàm THUẦN.
// Nến 1D đưa vào phải là nến ĐÃ ĐÓNG trước thời điểm quyết định (nơi gọi cắt — phát lại: closeTime < t), tăng dần theo openTime.
//   (1) Một lệnh mỗi cụm: lệnh mới bị từ chối nếu tương quan lợi suất ngày (log) corrDays ngày với BẤT KỲ lệnh đang mở cùng phía ≥ corrMax
//       (tính cả lệnh đã qua TP1 — vẫn là vị thế trong cụm).
//   (2) Tổng rủi ro có trọng số beta: Σ max(β, betaFloor) × rủi ro lệnh (lệnh đã qua TP1 = 0, như canOpen) ≤ maxBetaRiskPct% vốn,
//       β = beta lợi suất ngày betaDays ngày so với BTCUSDT. Lệnh mới được giảm rủi ro cho vừa trần (như canOpen giảm khối lượng).
// Thiếu số liệu (mã mới, thiếu nến) của lệnh mới hoặc lệnh đang mở liên quan → từ chối (fail closed) kèm lý do.
export type ClusterConfig = { corrDays: number; corrMax: number; betaDays: number; betaFloor: number; maxBetaRiskPct: number };
export const BTC_SYMBOL = 'BTCUSDT';

// Lợi suất log theo openTime của nến SAU; chỉ cặp nến liền nhau đúng 1 ngày (khoảng trống → bỏ cặp đó)
export function dailyLogReturns(daily: readonly Candle[]): Map<number, number> {
  const out = new Map<number, number>();
  for (let i = 1; i < daily.length; i++) {
    const a = daily[i - 1]!, b = daily[i]!;
    if (b.openTime - a.openTime !== 86_400_000 || !(a.close > 0) || !(b.close > 0)) continue;
    out.set(b.openTime, Math.log(b.close / a.close));
  }
  return out;
}

// n ngày chung GẦN NHẤT của hai chuỗi lợi suất; null nếu chưa đủ n ngày
function lastCommon(x: ReadonlyMap<number, number>, y: ReadonlyMap<number, number>, n: number): { a: number[]; b: number[] } | null {
  const keys = [...x.keys()].filter((k) => y.has(k)).sort((p, q) => p - q).slice(-n);
  if (keys.length < n) return null;
  return { a: keys.map((k) => x.get(k)!), b: keys.map((k) => y.get(k)!) };
}

const mean = (xs: readonly number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;

export function correlation(x: ReadonlyMap<number, number>, y: ReadonlyMap<number, number>, n: number): number | null {
  const c = lastCommon(x, y, n);
  if (c === null) return null;
  const ma = mean(c.a), mb = mean(c.b);
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (c.a[i]! - ma) * (c.b[i]! - mb);
    saa += (c.a[i]! - ma) ** 2;
    sbb += (c.b[i]! - mb) ** 2;
  }
  if (!(saa > 0) || !(sbb > 0)) return null; // chuỗi phẳng: tương quan không xác định
  return sab / Math.sqrt(saa * sbb);
}

// beta = cov(r_mã, r_BTC) / var(r_BTC) trên n ngày chung gần nhất
export function betaTo(asset: ReadonlyMap<number, number>, btc: ReadonlyMap<number, number>, n: number): number | null {
  const c = lastCommon(asset, btc, n);
  if (c === null) return null;
  const ma = mean(c.a), mb = mean(c.b);
  let cov = 0, v = 0;
  for (let i = 0; i < n; i++) {
    cov += (c.a[i]! - ma) * (c.b[i]! - mb);
    v += (c.b[i]! - mb) ** 2;
  }
  return v > 0 ? cov / v : null;
}

export type ClusterResult =
  | { allowed: false; reasons: string[] }
  | { allowed: true; maxRisk: number; weight: number; reasons: string[] }; // maxRisk = rủi ro (USDT, chưa trọng số) tối đa của lệnh mới

const vn = (x: number, d = 2) => x.toFixed(d).replace('.', ',');

export function clusterCheck(i: {
  symbol: string; side: Side; open: readonly OpenTrade[]; capital: number;
  daily: ReadonlyMap<string, readonly Candle[]>; cfg: ClusterConfig;
}): ClusterResult {
  const { cfg } = i;
  const rets = new Map<string, Map<number, number>>();
  const retOf = (s: string) => {
    let r = rets.get(s);
    if (r === undefined) {
      const d = i.daily.get(s);
      r = d === undefined ? new Map() : dailyLogReturns(d);
      rets.set(s, r);
    }
    return r;
  };
  const reasons: string[] = [];
  // (1) một lệnh mỗi cụm (cùng phía)
  for (const o of i.open) {
    if (o.side !== i.side || o.symbol === i.symbol) continue;
    const c = correlation(retOf(i.symbol), retOf(o.symbol), cfg.corrDays);
    if (c === null) return { allowed: false, reasons: [`risk-cluster: thiếu ${cfg.corrDays} ngày lợi suất chung của ${i.symbol} và ${o.symbol} để đo tương quan — không vào lệnh`] };
    if (c >= cfg.corrMax) return { allowed: false, reasons: [`risk-cluster: tương quan ${cfg.corrDays} ngày với ${o.symbol} (cùng phía, đang mở) = ${vn(c)} ≥ ${vn(cfg.corrMax)} — một lệnh mỗi cụm`] };
  }
  // (2) tổng rủi ro có trọng số beta
  const btc = retOf(BTC_SYMBOL);
  const weightOf = (s: string): number | null => {
    if (s === BTC_SYMBOL) return Math.max(1, cfg.betaFloor);
    const b = betaTo(retOf(s), btc, cfg.betaDays);
    return b === null ? null : Math.max(b, cfg.betaFloor);
  };
  let weighted = 0;
  for (const o of i.open) {
    if (o.pastTp1) continue;
    const w = weightOf(o.symbol);
    if (w === null) return { allowed: false, reasons: [`risk-cluster: thiếu ${cfg.betaDays} ngày lợi suất để đo beta của lệnh đang mở ${o.symbol} — không vào lệnh`] };
    weighted += w * o.riskAmount;
  }
  const wNew = weightOf(i.symbol);
  if (wNew === null) return { allowed: false, reasons: [`risk-cluster: thiếu ${cfg.betaDays} ngày lợi suất để đo beta của ${i.symbol} so BTC — không vào lệnh`] };
  const cap = (i.capital * cfg.maxBetaRiskPct) / 100;
  const room = cap - weighted;
  if (!(room > 0)) return { allowed: false, reasons: [`risk-cluster: rủi ro mở có trọng số beta ${vn((weighted / i.capital) * 100)}% vốn ≥ trần ${cfg.maxBetaRiskPct}% — không vào lệnh`] };
  reasons.push(`risk-cluster: trọng số beta ${vn(wNew)}, rủi ro mở có trọng số ${vn((weighted / i.capital) * 100)}% vốn, trần ${cfg.maxBetaRiskPct}%`);
  return { allowed: true, maxRisk: room / wNew, weight: wNew, reasons };
}

// Các mã cần nến 1D cho một lần kiểm: lệnh mới, mọi lệnh đang mở, BTC
export function clusterSymbols(symbol: string, open: readonly OpenTrade[]): string[] {
  return [...new Set([symbol, BTC_SYMBOL, ...open.map((o) => o.symbol)])];
}
