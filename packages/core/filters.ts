import { tickDecimals } from './price.ts';
import type { Contract } from './types.ts';
import type { TradePlan } from './plan.ts';
import type { PatternPlan } from './patterns/pattern-plan.ts';
import type { ExitPolicy } from './exit.ts';

// Bộ lọc sàn áp lên một lệnh (I2, đánh giá độc lập). Nguồn: exchangeInfo — docs/reference/binance-usdm-api.md.
export type OrderFilters = Pick<Contract, 'stepSize' | 'minQty' | 'maxQty' | 'marketMinQty' | 'marketMaxQty' | 'marketStepSize' | 'minNotional' | 'maxNumOrders'>;
export type EntryLeg = { kind: 'market' | 'limit'; price: number; qty: number };

const vn = (x: number) => String(Number(x.toPrecision(10))).replace('.', ',');

// qty có phải bội của bước không (sai số dấu phẩy động 1e-6 bước)
export function isStepMultiple(qty: number, step: number): boolean {
  const n = qty / step;
  return Math.abs(n - Math.round(n)) < 1e-6;
}

// Lệnh VÀO (không reduce-only): khối lượng theo LOT_SIZE (limit) hoặc MARKET_LOT_SIZE (market), giá trị ≥ MIN_NOTIONAL
export function entryLegProblems(leg: EntryLeg, f: OrderFilters): string[] {
  const out: string[] = [];
  const market = leg.kind === 'market';
  const [name, min, max, step] = market
    ? ['MARKET_LOT_SIZE', f.marketMinQty, f.marketMaxQty, f.marketStepSize]
    : ['LOT_SIZE', f.minQty, f.maxQty, f.stepSize];
  const what = `Lệnh vào ${market ? 'market' : 'limit'} ${vn(leg.qty)} coin`;
  if (leg.qty < min) out.push(`${what} < ${name}.minQty ${vn(min)}`);
  if (leg.qty > max) out.push(`${what} vượt ${name}.maxQty ${vn(max)}${market ? ' (sàn từ chối, lỗi -4005)' : ''}`);
  if (!isStepMultiple(leg.qty, step)) out.push(`${what} không theo bước ${name}.stepSize ${vn(step)}`);
  const notional = leg.qty * leg.price;
  if (notional < f.minNotional) out.push(`${what} ≈ ${vn(Number(notional.toFixed(2)))} USDT < MIN_NOTIONAL ${vn(f.minNotional)} USDT (sàn từ chối, lỗi -4164)`);
  return out;
}

// Phần thoát (TP1, trailing...) là reduce-only: miễn MIN_NOTIONAL, nhưng vẫn phải ≥ minQty (lấy mức chặt hơn của LOT_SIZE và
// MARKET_LOT_SIZE vì lệnh dừng/trailing khớp bằng market) và ≤ MARKET_LOT_SIZE.maxQty.
export function exitPartProblems(parts: number[], f: OrderFilters): string[] {
  const out: string[] = [];
  const min = Math.max(f.minQty, f.marketMinQty);
  for (const q of parts) {
    if (q < min) out.push(`Phần thoát ${vn(q)} coin < minQty ${vn(min)}`);
    if (q > f.marketMaxQty) out.push(`Phần thoát ${vn(q)} coin vượt MARKET_LOT_SIZE.maxQty ${vn(f.marketMaxQty)}`);
  }
  return out;
}

// Các phần thoát thật sự đặt lệnh: C2 có TP1 = [TP1, phần trailing]; C2 không TP1 = [cả vị thế]; A0 = các phần > 0.
// C3 (chỉ mô phỏng, Task 8 #6) cũng hai phần như C2 — kế hoạch máy quét không lập C3.
function exitParts(policy: ExitPolicy, hasTp1: boolean, qty: number, q: readonly number[], stepSize: number): number[] {
  const snap = (x: number) => Number(x.toFixed(tickDecimals(stepSize)));
  if (policy !== 'A0') return hasTp1 ? [q[0]!, snap(qty - q[0]!)] : [qty];
  return q.filter((x) => x > 0);
}

function ordersProblem(n: number, f: OrderFilters): string[] {
  return n > f.maxNumOrders ? [`Cần ${n} lệnh mở trên mã > MAX_NUM_ORDERS ${f.maxNumOrders}`] : [];
}

const unique = (xs: string[]) => [...new Set(xs)];

// Kế hoạch vùng: kiểm từng dòng bảng khối lượng theo giá khớp (mỗi dòng là một khả năng khớp được in ra)
export function zonePlanFilterProblems(p: TradePlan, f: OrderFilters): string[] {
  const hasTp1 = p.targets[0]?.price !== null && p.targets[0]?.price !== undefined;
  const out: string[] = [];
  for (const row of p.fillTable) {
    const parts = exitParts(p.exit.policy, hasTp1, row.qty, row.q, f.stepSize);
    out.push(...entryLegProblems({ kind: p.entryType, price: row.fill, qty: row.qty }, f), ...exitPartProblems(parts, f));
    out.push(...ordersProblem(1 + 1 + parts.length, f)); // vào + SL + các lệnh thoát
  }
  return unique(out);
}

// Kế hoạch mô hình: mỗi chân vào là một lệnh riêng; lệnh thoát tính trên tổng khối lượng khi khớp mọi chân
export function patternPlanFilterProblems(p: PatternPlan, f: OrderFilters): string[] {
  const hasTp1 = p.targets[0]?.price !== null && p.targets[0]?.price !== undefined;
  const out: string[] = [];
  for (const row of p.fillTable) {
    for (const leg of row.legs) out.push(...entryLegProblems({ kind: leg.kind, price: leg.price, qty: leg.qty }, f));
    const parts = exitParts(p.exit.policy, hasTp1, row.qty, row.q, f.stepSize);
    out.push(...exitPartProblems(parts, f), ...ordersProblem(row.legs.length + 1 + parts.length, f));
  }
  return unique(out);
}

// Đánh dấu kế hoạch không hợp lệ (bản sao, không sửa bản gốc). Không hợp lệ thì không đặt lệnh nào → không có trailing (như buildExit).
export function invalidateZonePlan(p: TradePlan, reason: string): TradePlan {
  return { ...p, valid: false, invalidReason: reason, exit: { ...p.exit, trailing: null } };
}
