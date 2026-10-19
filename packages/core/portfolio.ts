import { COMMON } from './config.ts';
import { tickDecimals } from './price.ts';
import { entryLegProblems, exitPartProblems, type OrderFilters } from './filters.ts';
import type { Side } from './types.ts';

// Trần danh mục và ký quỹ (đánh giá độc lập C1, C3) — hàm THUẦN dùng chung cho máy quét (danh sách lệnh mở rỗng hoặc do người
// dùng đưa vào → chỉ để thông tin), bộ mô phỏng của kế hoạch 2 và bot.

// Một lệnh đang mở. riskAmount = số tiền mất nếu chạm SL hiện tại (USDT); pastTp1 = đã qua TP1 → tính rủi ro 0 VÀ không tính vào
// trần số lệnh (kèo không rủi ro), nhưng vẫn tính ký quỹ (người dùng chốt 19/10/2026).
export type OpenTrade = { symbol: string; side: Side; notional: number; leverage: number; riskAmount: number; pastTp1: boolean };

// Lệnh định mở. qty = khối lượng theo 2% (từ kế hoạch); leverage = đòn bẩy sẽ dùng (≤ trần chế độ và trần bậc ký quỹ);
// costPct = phí + trượt giá khứ hồi (%); maxNotional = trần notional theo thanh khoản (Infinity = không giới hạn).
export type NewTrade = {
  symbol: string; side: Side; entry: number; stop: number; qty: number; leverage: number; costPct: number;
  entryType: 'market' | 'limit'; filters: OrderFilters; maxNotional: number;
};

export type PortfolioConfig = { maxOpenTrades: number; maxOpenRiskPct: number; marginSafetyFactor: number };

export type CanOpenResult = {
  allowed: boolean;
  requestedQty: number;
  adjustedQty: number; // khối lượng tối đa cho phép (≤ requestedQty); 0 khi không cho vào
  riskAmount: number; // tiền mất nếu chạm SL với adjustedQty (đã gồm phí ước tính)
  riskPctActual: number; // riskAmount / vốn × 100 — có thể < 2% khi bị giảm
  marginNeeded: number; // notional / đòn bẩy với adjustedQty
  openCount: number; // tổng số lệnh đang mở (gồm cả lệnh đã qua TP1)
  atRiskCount: number; // số lệnh CÒN RỦI RO (chưa qua TP1) — chỉ số này tính vào trần maxOpenTrades (người dùng chốt 19/10/2026)
  pastTp1Count: number; // số lệnh đã qua TP1 (kèo không rủi ro): không tính trần lệnh, không tính rủi ro, VẪN tính ký quỹ
  sameSideOpen: number; // số lệnh đang mở cùng chiều lệnh mới (altcoin thường chạy cùng chiều BTC — theo dõi sau đánh giá C1)
  openRiskPct: number; // tổng rủi ro đang mở (lệnh đã qua TP1 = 0), % vốn
  openMarginPct: number; // tổng ký quỹ đang dùng, % vốn
  reasons: string[]; // vì sao bị giảm / bị từ chối (rỗng = vào đủ)
};

export function openRiskAmount(open: readonly OpenTrade[]): number {
  return open.reduce((s, t) => s + (t.pastTp1 ? 0 : t.riskAmount), 0);
}

const pct = (x: number) => x.toFixed(2).replace('.', ',');

export function canOpen(t: NewTrade, open: readonly OpenTrade[], capital: number, cfg: PortfolioConfig = COMMON.portfolio): CanOpenResult {
  if (!(capital > 0) || !Number.isFinite(capital)) throw new Error(`canOpen: vốn không hợp lệ (${capital})`);
  if (!(t.leverage >= 1) || !Number.isFinite(t.leverage)) throw new Error(`canOpen: đòn bẩy không hợp lệ (${t.leverage})`);
  const perUnit = Math.abs(t.entry - t.stop) + (t.entry * t.costPct) / 100;
  if (!(Math.abs(t.entry - t.stop) > 0) || !Number.isFinite(perUnit)) throw new Error(`canOpen: khoảng cắt lỗ không hợp lệ (giá vào ${t.entry}, SL ${t.stop})`);

  // Bước khối lượng: lệnh market phải theo cả MARKET_LOT_SIZE → lấy bước thô hơn
  const step = t.entryType === 'market' ? Math.max(t.filters.stepSize, t.filters.marketStepSize) : t.filters.stepSize;
  const dec = tickDecimals(step);
  const floorStep = (x: number) => (x > 0 && Number.isFinite(x) ? Number((Math.floor(x / step + 1e-9) * step).toFixed(dec)) : x === Infinity ? Infinity : 0);

  const openRisk = openRiskAmount(open);
  const openMargin = open.reduce((s, o) => s + o.notional / o.leverage, 0);
  const atRiskCount = open.filter((o) => !o.pastTp1).length;
  const base = { requestedQty: t.qty, openCount: open.length, atRiskCount, pastTp1Count: open.length - atRiskCount, sameSideOpen: open.filter((o) => o.side === t.side).length, openRiskPct: (openRisk / capital) * 100, openMarginPct: (openMargin / capital) * 100 };
  const reject = (reasons: string[]): CanOpenResult => ({ ...base, allowed: false, adjustedQty: 0, riskAmount: 0, riskPctActual: 0, marginNeeded: 0, reasons });

  // Trần lệnh chỉ đếm lệnh còn rủi ro: lệnh đã qua TP1 (phần còn lại do trailing quản) không tính (người dùng chốt 19/10/2026)
  if (atRiskCount >= cfg.maxOpenTrades) {
    return reject([`Đã có ${atRiskCount} lệnh còn rủi ro = trần ${cfg.maxOpenTrades} lệnh (không tính ${base.pastTp1Count} lệnh đã qua TP1) — không vào lệnh mới`]);
  }
  const same = open.find((o) => o.symbol === t.symbol);
  if (same) return reject([`${t.symbol} đang có lệnh mở (${same.side === 'long' ? 'Long' : 'Short'}) — một vị thế mỗi hợp đồng`]);

  const reasons: string[] = [];
  const riskRoom = (capital * cfg.maxOpenRiskPct) / 100 - openRisk;
  const marginRoom = capital * cfg.marginSafetyFactor - openMargin;
  const limits: Array<{ qty: number; why: string }> = [
    { qty: floorStep(riskRoom / perUnit), why: `tổng rủi ro mở đang ${pct(base.openRiskPct)}% vốn, trần ${cfg.maxOpenRiskPct}%` },
    { qty: floorStep((marginRoom * t.leverage) / t.entry), why: `ký quỹ đang dùng ${pct(base.openMarginPct)}% vốn, trần ${pct(cfg.marginSafetyFactor * 100)}% (đòn bẩy ${t.leverage}×, isolated)` },
    { qty: floorStep(t.maxNotional / t.entry), why: `trần notional theo thanh khoản ${Number.isFinite(t.maxNotional) ? Math.round(t.maxNotional) : '∞'} USDT` },
  ];
  let qty = t.qty;
  for (const l of limits) {
    if (l.qty < qty) {
      qty = Math.max(0, l.qty);
      reasons.push(`Giảm khối lượng vì ${l.why}`);
    }
  }
  if (qty <= 0) return reject([...reasons, 'Không còn chỗ cho lệnh mới — bỏ lệnh']);

  // Khối lượng sau khi giảm vẫn phải qua bộ lọc sàn: lệnh vào và hai phần thoát (TP1 + trailing, C2)
  const tp1 = Number((Math.floor((qty * COMMON.zones.exitPcts[0]!) / 100 / t.filters.stepSize + 1e-9) * t.filters.stepSize).toFixed(tickDecimals(t.filters.stepSize)));
  const rest = Number((qty - tp1).toFixed(tickDecimals(t.filters.stepSize)));
  const problems = [...entryLegProblems({ kind: t.entryType, price: t.entry, qty }, t.filters), ...exitPartProblems([tp1, rest], t.filters)];
  if (problems.length > 0) return reject([...reasons, ...problems.map((p) => `Bộ lọc sàn: ${p}`), 'Bỏ lệnh']);

  const riskAmount = qty * perUnit;
  return {
    ...base, allowed: true, adjustedQty: qty, riskAmount, riskPctActual: (riskAmount / capital) * 100,
    marginNeeded: (qty * t.entry) / t.leverage, reasons,
  };
}
