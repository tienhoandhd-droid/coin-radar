import type { RequestOpts, SignedResult } from '../binance/signed.ts';
import type { ExAlgoOrder, ExchangeState, ExOrder, ExPosition, Fill } from './reconcile.ts';

// Trạng thái THẬT trên sàn qua REST (B8b) cho reconcile — dùng chung cho paper (sàn giả lập có cùng tên trường) và demo/live (REST ký).
// Endpoint + trường theo docs/reference/binance-usdm-api.md mục 3.3, 4.1/4.7, 5:
//   GET /fapi/v3/positionRisk (weight 5; chỉ trả mã CÓ vị thế hoặc lệnh mở) → vị thế + PnL chưa chốt; danh sách mã cần hỏi tiếp
//   GET /fapi/v1/openOrders?symbol (1) · GET /fapi/v1/openAlgoOrders?symbol (1) · GET /fapi/v1/userTrades?symbol&startTime (5)
//   GET /fapi/v3/balance (5) → ví USDT
// Mọi lỗi REST → ném StateFetchError (kind của signed.ts): không bao giờ trả trạng thái nửa vời (reconcile trên dữ liệu thiếu có thể
// hủy nhầm lệnh dừng/đóng nhầm vị thế).

type Api = { request(o: RequestOpts): Promise<SignedResult> };
type Obj = Record<string, unknown>;

export class StateFetchError extends Error {
  readonly kind: string;
  constructor(kind: string, msg: string) {
    super(msg);
    this.kind = kind;
  }
}

// Một lần khớp kèm phí + PnL đã chốt (userTrades) — chốt chặn funding (lỗ đã chốt) và kết quả lệnh (cầu chì)
export type TradeRow = { fill: Fill; commission: number; commissionAsset: string | null; realizedPnl: number };

export type FetchedState = {
  ex: ExchangeState;
  trades: Map<string, TradeRow[]>; // theo mã — mọi khớp từ fillsSince
  wallet: number; // ví USDT (balance)
  unrealized: number; // Σ PnL chưa chốt của mọi vị thế
  equity: number; // ví + PnL chưa chốt
  symbols: string[]; // mã đã hỏi lệnh (vị thế/lệnh mở ∪ mã được yêu cầu)
};

const obj = (v: unknown, what: string): Obj => {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${what}: không phải object`);
  return v as Obj;
};
const arr = (v: unknown, what: string): unknown[] => {
  if (!Array.isArray(v)) throw new Error(`${what}: không phải mảng`);
  return v;
};
function num(o: Obj, k: string, what: string): number {
  const v = o[k];
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw new Error(`${what}.${k}: số không hợp lệ (${JSON.stringify(v) ?? 'undefined'})`);
  return n;
}
function str(o: Obj, k: string, what: string): string {
  const v = o[k];
  if (typeof v !== 'string' || v === '') throw new Error(`${what}.${k}: thiếu chuỗi`);
  return v;
}
const bs = (o: Obj, what: string): 'BUY' | 'SELL' => {
  const s = str(o, 'side', what);
  if (s !== 'BUY' && s !== 'SELL') throw new Error(`${what}.side: "${s}" không phải BUY/SELL`);
  return s;
};

// liquidationPrice "0" = không có giá thanh lý (không vị thế / không tính được) → null
export function parsePositions(raw: unknown): ExPosition[] {
  return arr(raw, 'positionRisk').map((x) => {
    const o = obj(x, 'positionRisk[]');
    const w = `positionRisk ${String(o.symbol)}`;
    const liq = num(o, 'liquidationPrice', w);
    return { symbol: str(o, 'symbol', w), positionAmt: num(o, 'positionAmt', w), entryPrice: num(o, 'entryPrice', w), liquidationPrice: liq > 0 ? liq : null };
  });
}

function unrealizedOf(raw: unknown): number {
  return arr(raw, 'positionRisk').reduce((s: number, x) => {
    const o = obj(x, 'positionRisk[]');
    return s + (o.unRealizedProfit === undefined ? 0 : num(o, 'unRealizedProfit', `positionRisk ${String(o.symbol)}`));
  }, 0);
}

export function parseOpenOrders(raw: unknown): ExOrder[] {
  return arr(raw, 'openOrders').map((x) => {
    const o = obj(x, 'openOrders[]');
    const w = `openOrders ${String(o.clientOrderId)}`;
    return {
      symbol: str(o, 'symbol', w), orderId: num(o, 'orderId', w), clientId: str(o, 'clientOrderId', w), type: str(o, 'type', w), side: bs(o, w),
      origQty: num(o, 'origQty', w), executedQty: num(o, 'executedQty', w), price: num(o, 'price', w), status: str(o, 'status', w),
    };
  });
}

// activated: REST algo không có cờ "trailing đã kích hoạt" (mục 4.7) → null; nguồn là ALGO_UPDATE.ia (luồng user) ghi vào nhật ký
export function parseOpenAlgos(raw: unknown): ExAlgoOrder[] {
  return arr(raw, 'openAlgoOrders').map((x) => {
    const o = obj(x, 'openAlgoOrders[]');
    const w = `openAlgoOrders ${String(o.clientAlgoId)}`;
    const cp = o.closePosition;
    if (typeof cp !== 'boolean') throw new Error(`${w}.closePosition: không phải boolean`);
    return {
      symbol: str(o, 'symbol', w), algoId: num(o, 'algoId', w), clientId: str(o, 'clientAlgoId', w), orderType: str(o, 'orderType', w), side: bs(o, w),
      quantity: num(o, 'quantity', w), triggerPrice: num(o, 'triggerPrice', w), closePosition: cp, algoStatus: str(o, 'algoStatus', w), activated: null,
    };
  });
}

export function parseUserTrades(raw: unknown): TradeRow[] {
  return arr(raw, 'userTrades').map((x) => {
    const o = obj(x, 'userTrades[]');
    const w = `userTrades ${String(o.id)}`;
    return {
      fill: { tradeId: num(o, 'id', w), orderId: num(o, 'orderId', w), clientId: null, symbol: str(o, 'symbol', w), side: bs(o, w), qty: num(o, 'qty', w), price: num(o, 'price', w), time: num(o, 'time', w) },
      commission: num(o, 'commission', w),
      commissionAsset: typeof o.commissionAsset === 'string' ? o.commissionAsset : null,
      realizedPnl: num(o, 'realizedPnl', w),
    };
  });
}

// GET /fapi/v1/income (incomeType=FUNDING_FEE): income có dấu (âm = đã trả)
export function parseIncome(raw: unknown): Array<{ symbol: string; incomeType: string; income: number; time: number }> {
  return arr(raw, 'income').map((x) => {
    const o = obj(x, 'income[]');
    const w = `income ${String(o.tranId)}`;
    return { symbol: typeof o.symbol === 'string' ? o.symbol : '', incomeType: str(o, 'incomeType', w), income: num(o, 'income', w), time: num(o, 'time', w) };
  });
}

export function parseUsdtBalance(raw: unknown): number {
  const row = arr(raw, 'balance').map((x) => obj(x, 'balance[]')).find((o) => o.asset === 'USDT');
  if (row === undefined) throw new Error('balance: không có tài sản USDT');
  return num(row, 'balance', 'balance USDT');
}

export async function getOk(api: Api, path: string, params: Record<string, string | number> = {}): Promise<unknown> {
  const r = await api.request({ method: 'GET', path, params, createsOrder: false });
  if (r.kind !== 'ok') throw new StateFetchError(r.kind, `GET ${path}${params.symbol !== undefined ? ` ${String(params.symbol)}` : ''}: ${r.kind}${r.code !== null ? ` (${r.code})` : ''} ${r.msg}`.trim());
  return r.body;
}

// userTrades: cửa sổ startTime..endTime ≤ 7 ngày (mục 3.3) → chia trang 7 ngày. Mọi khớp của mã từ `since` tới `now`.
export const USER_TRADES_WINDOW_MS = 7 * 86_400_000 - 60_000;
export async function fetchTradeHistory(api: Api, symbol: string, since: number, now: number): Promise<TradeRow[]> {
  const out: TradeRow[] = [];
  for (let from = since; from <= now; from += USER_TRADES_WINDOW_MS + 1) {
    const to = Math.min(now, from + USER_TRADES_WINDOW_MS);
    out.push(...parseUserTrades(await getOk(api, '/fapi/v1/userTrades', { symbol, startTime: from, endTime: to, limit: 1000 })));
  }
  const seen = new Set<number>();
  return out.filter((r) => (seen.has(r.fill.tradeId) ? false : (seen.add(r.fill.tradeId), true)));
}

// symbols: mã bot quan tâm (lệnh đang theo dõi trong nhật ký); fillsSince: mã → mốc lấy khớp (lúc tạo lệnh sớm nhất của mã).
// Mỗi lượt chỉ lấy khớp trong 7 ngày gần nhất (một trang): khớp cũ hơn đã được ghi vào nhật ký ở các lượt trước.
export async function fetchExchangeState(api: Api, o: { symbols: readonly string[]; fillsSince: ReadonlyMap<string, number>; now?: number }): Promise<FetchedState> {
  const pr = await getOk(api, '/fapi/v3/positionRisk');
  const positions = parsePositions(pr).filter((p) => p.positionAmt !== 0);
  const unrealized = unrealizedOf(pr);
  const symbols = [...new Set([...parsePositions(pr).map((p) => p.symbol), ...o.symbols, ...o.fillsSince.keys()])].sort();
  const openOrders: ExOrder[] = [];
  const openAlgoOrders: ExAlgoOrder[] = [];
  const recentFills: Fill[] = [];
  const trades = new Map<string, TradeRow[]>();
  for (const s of symbols) {
    openOrders.push(...parseOpenOrders(await getOk(api, '/fapi/v1/openOrders', { symbol: s })));
    openAlgoOrders.push(...parseOpenAlgos(await getOk(api, '/fapi/v1/openAlgoOrders', { symbol: s })));
    const since = o.fillsSince.get(s);
    if (since !== undefined) {
      const now = o.now ?? Date.now();
      const from = Math.max(since, now - USER_TRADES_WINDOW_MS);
      const rows = parseUserTrades(await getOk(api, '/fapi/v1/userTrades', { symbol: s, startTime: from, endTime: now, limit: 1000 }));
      trades.set(s, rows);
      recentFills.push(...rows.map((r) => r.fill));
    }
  }
  const wallet = parseUsdtBalance(await getOk(api, '/fapi/v3/balance'));
  return { ex: { positions, openOrders, openAlgoOrders, recentFills }, trades, wallet, unrealized, equity: wallet + unrealized, symbols };
}
