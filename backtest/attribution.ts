// Quy nguyên nhân lệnh thua (kế hoạch 2, Task 6) — HÀM THUẦN. Mỗi lệnh thua (đã khớp, lãi lỗ thật < 0) gắn MỘT nhóm theo thứ tự ưu
// tiên, kèm bằng chứng; mọi phép kiểm vẫn được ghi (có / không / không đủ dữ liệu) để thấy chồng lấn. Bộ đọc dữ liệu ở experiment.ts.
//
//  (1) macro          sự kiện vĩ mô có lịch (data/events) nằm trong [giờ vào, giờ ra]
//  (2) btc_shock      BTC đi ≥ btcShockPct[chế độ] % so với giá mở nến 1H đầu cửa sổ (đỉnh/đáy nến 1H trong cửa sổ)
//  (3) liquidation    OI giảm ≥ oiDropPct % giữa hai mốc 1H liền nhau trong cửa sổ + nến khung vào lệnh có râu NGƯỢC chiều lệnh
//                     ≥ wickAtr × ATR(14). Binance chỉ giữ OI 30 ngày → kỳ D KHÔNG có OI → "không đủ dữ liệu" (rồi xét tiếp nhóm sau)
//  (4) funding        có kỳ funding trong cửa sổ với |rate| ≥ fundingExtreme (mặc định = COMMON.fundingExtremePer8h, theo kỳ, không quy đổi 8h)
//  (5) stop_tight     khoảng cắt lỗ < stopAtrK × ATR(14) khung vào lệnh lúc vào; HOẶC thoát do SL rồi giá chạm TP1 trong sweepBars nến
//                     khung vào lệnh sau đó ("bị quét SL") — chỉ dùng nến đóng trước mốc cuối kỳ (không nhìn sang kỳ mù B)
//  (6) against_trend  Long khi giá đóng khung xu hướng < SMA(trendSma), Short khi > (nến đã đóng trước giờ vào)
//  (7) fees           chi phí (phí + trượt) ≥ feeR × 1R
//  (8) other          không thuộc nhóm nào → nghi lỗi phương pháp
// Mọi ngưỡng ở DEFAULT_ATTR là ĐỀ XUẤT, CHƯA BACKTEST (chỉ để phân loại, không phải luật giao dịch).
import { COMMON } from '../packages/core/config.ts';
import { atr, sma } from '../packages/core/indicators.ts';
import type { MacroEvent } from '../packages/core/events.ts';
import type { Candle, Mode, Side } from '../packages/core/types.ts';
import type { FundingRow } from './replay.ts';

export const CATEGORIES = ['macro', 'btc_shock', 'liquidation', 'funding', 'stop_tight', 'against_trend', 'fees', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Record<Category, string> = {
  macro: '(1) Sự kiện vĩ mô có lịch', btc_shock: '(2) Cú sốc toàn thị trường (BTC)', liquidation: '(3) Thanh lý dây chuyền',
  funding: '(4) Funding cực đoan', stop_tight: '(5) SL quá sát / bị quét SL', against_trend: '(6) Ngược xu hướng khung lớn',
  fees: '(7) Phí áp đảo', other: '(8) Khác (nghi lỗi phương pháp)',
};
type CheckKey = Exclude<Category, 'other'>;
export type CheckResult = 'có' | 'không' | 'không đủ dữ liệu';

export type AttrConfig = {
  btcShockPct: Record<Mode, number>; oiDropPct: number; wickAtr: number; fundingExtreme: number;
  stopAtrK: number; sweepBars: number; trendSma: number; feeR: number;
};
export const DEFAULT_ATTR: AttrConfig = {
  btcShockPct: { swing: 5, fast: 2 }, oiDropPct: 5, wickAtr: 1.5, fundingExtreme: COMMON.fundingExtremePer8h,
  stopAtrK: 1, sweepBars: 6, trendSma: 50, feeR: 0.3,
};

export type AttrTrade = {
  id: string; symbol: string; mode: Mode; side: Side; entryTime: string | null; exitTime: string | null; avgEntry: number | null;
  stop: number; tp1: number; reason: string | null; costs: number; riskAtFill: number; pnl: number; R: number; filled: boolean;
};
export type AttrContext = {
  events: readonly MacroEvent[]; btc1h: readonly Candle[]; oi: ReadonlyArray<{ t: number; oi: number }> | null; funding: readonly FundingRow[];
  entryBars: readonly Candle[]; entryIntervalMs: number; trendBars: readonly Candle[]; periodEnd: number;
};
export type Attribution = { id: string; symbol: string; mode: Mode; side: Side; R: number; category: Category; evidence: string; checks: Record<CheckKey, CheckResult> };

const iso = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
const f2 = (x: number) => x.toFixed(2);

function atrAt(bars: readonly Candle[], t: number): number {
  const closed = bars.filter((c) => c.closeTime < t);
  if (closed.length < 15) return NaN;
  return atr(closed, 14).at(-1)!;
}

export function attributeLoss(tr: AttrTrade, cx: AttrContext, cfg: AttrConfig): Attribution | null {
  if (!tr.filled || !(tr.pnl < 0) || tr.entryTime === null || tr.exitTime === null || tr.avgEntry === null) return null;
  const t0 = Date.parse(tr.entryTime), t1 = Date.parse(tr.exitTime);
  const sgn = tr.side === 'long' ? 1 : -1;
  const ev: Partial<Record<CheckKey, string>> = {};
  const checks = {} as Record<CheckKey, CheckResult>;
  const set = (k: CheckKey, r: CheckResult, why?: string) => { checks[k] = r; if (r === 'có' && why !== undefined) ev[k] = why; };

  // (1) sự kiện vĩ mô
  const evs = cx.events.filter((e) => { const t = Date.parse(e.time); return t >= t0 && t <= t1; });
  set('macro', evs.length > 0 ? 'có' : 'không', evs.map((e) => `${e.kind} ${iso(Date.parse(e.time))}`).join(', '));

  // (2) cú sốc BTC
  // nến giao cửa sổ [t0, t1]; luôn gồm nến chứa mốc vào (lệnh vào = ra cùng mốc), không gồm nến BẮT ĐẦU đúng lúc ra
  const overlaps = (c: Candle) => c.closeTime >= t0 && (c.openTime < t1 || c.openTime <= t0);
  const btc = cx.btc1h.filter(overlaps);
  if (btc.length === 0) set('btc_shock', 'không đủ dữ liệu');
  else {
    const ref = btc[0]!.open;
    let move = 0;
    for (const c of btc) move = Math.max(move, Math.abs(c.high / ref - 1), Math.abs(c.low / ref - 1));
    const pct = move * 100;
    set('btc_shock', pct >= cfg.btcShockPct[tr.mode] ? 'có' : 'không', `BTC đi ${f2(pct)}% trong cửa sổ (ngưỡng ${cfg.btcShockPct[tr.mode]}%)`);
  }

  // (3) thanh lý dây chuyền
  const atrEntry = atrAt(cx.entryBars, t0);
  const oi = cx.oi === null ? [] : cx.oi.filter((p) => p.t >= t0 - 3_600_000 && p.t <= t1);
  const oiCovers = cx.oi !== null && cx.oi.some((p) => p.t <= t0) && cx.oi.some((p) => p.t >= t1 - 3_600_000);
  if (!oiCovers || !Number.isFinite(atrEntry)) set('liquidation', 'không đủ dữ liệu');
  else {
    let drop = 0;
    for (let i = 1; i < oi.length; i++) drop = Math.max(drop, (1 - oi[i]!.oi / oi[i - 1]!.oi) * 100);
    const wickBar = cx.entryBars.find((c) => overlaps(c) &&
      (sgn === 1 ? Math.min(c.open, c.close) - c.low : c.high - Math.max(c.open, c.close)) >= cfg.wickAtr * atrEntry);
    set('liquidation', drop >= cfg.oiDropPct && wickBar !== undefined ? 'có' : 'không',
      `OI giảm ${f2(drop)}% trong 1 giờ + râu ngược chiều ≥ ${cfg.wickAtr}×ATR lúc ${wickBar === undefined ? '?' : iso(wickBar.openTime)}`);
  }

  // (4) funding cực đoan
  const hot = cx.funding.filter((r) => r.fundingTime >= t0 && r.fundingTime <= t1 && Math.abs(r.fundingRate) >= cfg.fundingExtreme);
  set('funding', hot.length > 0 ? 'có' : 'không', hot.map((r) => `funding ${(r.fundingRate * 100).toFixed(3)}% lúc ${iso(r.fundingTime)}`).join(', '));

  // (5) SL quá sát / bị quét SL
  const d = Math.abs(tr.avgEntry - tr.stop);
  if (Number.isFinite(atrEntry) && d < cfg.stopAtrK * atrEntry) set('stop_tight', 'có', `khoảng cắt lỗ ${f2(d / atrEntry)}×ATR(14) khung vào lệnh (< ${cfg.stopAtrK})`);
  else {
    const horizon = Math.min(t1 + cfg.sweepBars * cx.entryIntervalMs, cx.periodEnd);
    const swept = tr.reason === 'stop_loss'
      ? cx.entryBars.find((c) => c.openTime >= t1 && c.closeTime < horizon && (sgn === 1 ? c.high >= tr.tp1 : c.low <= tr.tp1))
      : undefined;
    if (swept !== undefined) set('stop_tight', 'có', `bị quét SL: dừng lỗ ${iso(t1)} rồi giá chạm TP1 ${tr.tp1} lúc ${iso(swept.openTime)} (≤ ${cfg.sweepBars} nến)`);
    else set('stop_tight', Number.isFinite(atrEntry) ? 'không' : 'không đủ dữ liệu');
  }

  // (6) ngược xu hướng khung lớn
  const trend = cx.trendBars.filter((c) => c.closeTime < t0);
  if (trend.length < cfg.trendSma) set('against_trend', 'không đủ dữ liệu');
  else {
    const closes = trend.map((c) => c.close);
    const m = sma(closes, cfg.trendSma).at(-1)!, last = closes.at(-1)!;
    set('against_trend', sgn * (last - m) < 0 ? 'có' : 'không', `${tr.side} khi giá ${last} ${last < m ? '<' : '>'} SMA${cfg.trendSma} ${m.toPrecision(6)} khung xu hướng`);
  }

  // (7) phí áp đảo
  const feeR = tr.riskAtFill > 0 ? tr.costs / tr.riskAtFill : NaN;
  set('fees', feeR >= cfg.feeR ? 'có' : Number.isFinite(feeR) ? 'không' : 'không đủ dữ liệu', `phí + trượt ${f2(feeR)}R (≥ ${cfg.feeR}R)`);

  const cat = CATEGORIES.find((c): c is CheckKey => c !== 'other' && checks[c] === 'có') ?? 'other';
  return { id: tr.id, symbol: tr.symbol, mode: tr.mode, side: tr.side, R: tr.R, category: cat, evidence: cat === 'other' ? 'không có nguyên nhân ngoài nào được kiểm thấy' : ev[cat]!, checks };
}

type Cell = { count: number; rLost: number };
const emptyRow = () => Object.fromEntries(CATEGORIES.map((c) => [c, { count: 0, rLost: 0 }])) as Record<Category, Cell>;

export function summarizeAttribution(xs: readonly Attribution[]) {
  const byCategory = emptyRow();
  const byModeSide: Record<string, Record<Category, Cell>> = {};
  const insufficient = Object.fromEntries(CATEGORIES.filter((c) => c !== 'other').map((c) => [c, 0])) as Record<CheckKey, number>;
  const flagged = Object.fromEntries(CATEGORIES.filter((c) => c !== 'other').map((c) => [c, 0])) as Record<CheckKey, number>; // mọi kiểm "có" (chồng lấn)
  const total: Cell = { count: 0, rLost: 0 };
  for (const a of xs) {
    const k = `${a.mode}|${a.side}`;
    byModeSide[k] ??= emptyRow();
    for (const cell of [byCategory[a.category], byModeSide[k][a.category], total]) { cell.count++; cell.rLost += a.R; }
    for (const [c, r] of Object.entries(a.checks) as Array<[CheckKey, CheckResult]>) { if (r === 'không đủ dữ liệu') insufficient[c]++; if (r === 'có') flagged[c]++; }
  }
  return { total, byCategory, byModeSide, insufficient, flagged };
}
