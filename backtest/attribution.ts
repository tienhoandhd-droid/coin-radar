// Quy nguyên nhân lệnh thua (kế hoạch 2, Task 6) — HÀM THUẦN. Mỗi lệnh thua (đã khớp, lãi lỗ thật < 0) gắn MỘT nhóm theo thứ tự ưu
// tiên, kèm bằng chứng; mọi phép kiểm vẫn được ghi (có / không / không đủ dữ liệu / chưa kiểm được) để thấy chồng lấn. Bộ đọc dữ liệu
// ở experiment.ts. Phép kiểm chạy cho CẢ lệnh không thua (evaluateChecks) để so tỉ lệ nền: phép kiểm bật ở lệnh thắng nhiều như ở
// lệnh thua (độ nâng ≈ 1) là đặc tính chung, KHÔNG phải nguyên nhân — experiment.ts loại nó khỏi xếp nhóm (liftFilter).
//
//  (1) macro          sự kiện vĩ mô có lịch (data/events) nằm trong [giờ vào, giờ ra]
//  (2) btc_shock      BTC đi ≥ btcShockPct[chế độ] % so với giá mở nến BTC đầu tiên bắt đầu tại/sau giờ vào (đỉnh/đáy các nến tới giờ ra;
//                     không có nến bắt đầu trong cửa sổ → dùng nến chứa giờ vào). experiment.ts dùng nến BTC 5m.
//  (3) liquidation    OI giảm ≥ oiDropPct % giữa hai mốc 1H liền nhau trong cửa sổ + nến khung vào lệnh có râu NGƯỢC chiều lệnh
//                     ≥ wickAtr × ATR(14). Binance chỉ giữ OI 30 ngày → kỳ D KHÔNG có OI → "không đủ dữ liệu" (rồi xét tiếp nhóm sau)
//  (4) funding        có kỳ funding trong cửa sổ với |rate| quy về 8 giờ (× 8 / chu kỳ thật, suy từ khoảng cách các kỳ) ≥ fundingExtreme
//  (5) coin_event     sự kiện riêng của coin (niêm yết/hủy niêm yết Binance, hack DefiLlama) — CHƯA KIỂM ĐƯỢC: chưa có dữ liệu lịch sử
//  (6) coin_news      mật độ tin bất thường (GDELT) — CHƯA KIỂM ĐƯỢC: chưa có dữ liệu lịch sử
//  (7) stop_tight     khoảng cắt lỗ < stopAtrK × ATR(14) khung vào lệnh lúc vào; HOẶC thoát do SL rồi giá chạm TP1 trong sweepBars nến
//                     khung vào lệnh sau đó ("bị quét SL") — chỉ dùng nến đóng trước mốc cuối kỳ (không nhìn sang kỳ mù B)
//  (8) against_trend  Long khi giá đóng khung xu hướng < SMA(trendSma), Short khi > (nến đã đóng trước giờ vào)
//  (9) fees           chi phí (phí + trượt) ≥ feeR × 1R
// (10) other          không thuộc nhóm nào → nghi lỗi phương pháp (gồm cả lệnh lẽ ra thuộc (5)/(6) nếu có dữ liệu)
// Mọi ngưỡng ở DEFAULT_ATTR là ĐỀ XUẤT, CHƯA BACKTEST (chỉ để phân loại, không phải luật giao dịch).
import { COMMON } from '../packages/core/config.ts';
import { atr, sma } from '../packages/core/indicators.ts';
import type { MacroEvent } from '../packages/core/events.ts';
import type { Candle, Mode, Side } from '../packages/core/types.ts';
import type { FundingRow } from './replay.ts';

export const CATEGORIES = ['macro', 'btc_shock', 'liquidation', 'funding', 'coin_event', 'coin_news', 'stop_tight', 'against_trend', 'fees', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Record<Category, string> = {
  macro: '(1) Sự kiện vĩ mô có lịch', btc_shock: '(2) Cú sốc toàn thị trường (BTC)', liquidation: '(3) Thanh lý dây chuyền',
  funding: '(4) Funding cực đoan', coin_event: '(5) Sự kiện riêng của coin', coin_news: '(6) Mật độ tin bất thường',
  stop_tight: '(7) SL quá sát / bị quét SL', against_trend: '(8) Ngược xu hướng khung lớn', fees: '(9) Phí áp đảo',
  other: '(10) Khác (nghi lỗi phương pháp)',
};
export type CheckKey = Exclude<Category, 'other'>;
export const CHECKS = CATEGORIES.filter((c): c is CheckKey => c !== 'other');
export type CheckResult = 'có' | 'không' | 'không đủ dữ liệu' | 'chưa kiểm được';
const UNCHECKED_SOURCE = 'chưa kiểm được — thiếu nguồn dữ liệu lịch sử';

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
  events: readonly MacroEvent[]; btc: readonly Candle[]; oi: ReadonlyArray<{ t: number; oi: number }> | null; funding: readonly FundingRow[];
  entryBars: readonly Candle[]; entryIntervalMs: number; trendBars: readonly Candle[]; periodEnd: number;
};
export type Checks = Record<CheckKey, CheckResult>;
export type Evaluated = { id: string; symbol: string; mode: Mode; side: Side; R: number; checks: Checks; evidence: Partial<Record<CheckKey, string>> };
export type Attribution = { id: string; symbol: string; mode: Mode; side: Side; R: number; category: Category; evidence: string; checks: Checks };

const H = 3_600_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
const f2 = (x: number) => x.toFixed(2);

function atrAt(bars: readonly Candle[], t: number): number {
  const closed = bars.filter((c) => c.closeTime < t);
  if (closed.length < 15) return NaN;
  return atr(closed, 14).at(-1)!;
}

// Chu kỳ funding (giờ) = trung vị khoảng cách giữa các kỳ liền nhau, làm tròn giờ; < 2 kỳ → 8 giờ (mặc định Binance)
function fundingIntervalHours(rows: readonly FundingRow[]): number {
  const gaps = rows.slice(1).map((r, i) => Math.round((r.fundingTime - rows[i]!.fundingTime) / H)).filter((g) => g > 0).sort((a, b) => a - b);
  return gaps.length === 0 ? COMMON.defaultFundingIntervalHours : gaps[gaps.length >> 1]!;
}

// Mọi phép kiểm cho MỘT lệnh đã khớp (thắng hay thua) — dùng cho xếp nhóm lệnh thua và tỉ lệ nền ở lệnh không thua.
export function evaluateChecks(tr: AttrTrade, cx: AttrContext, cfg: AttrConfig): Evaluated | null {
  if (!tr.filled || tr.entryTime === null || tr.exitTime === null || tr.avgEntry === null) return null;
  const t0 = Date.parse(tr.entryTime), t1 = Date.parse(tr.exitTime);
  const sgn = tr.side === 'long' ? 1 : -1;
  const ev: Partial<Record<CheckKey, string>> = {};
  const checks = {} as Checks;
  const set = (k: CheckKey, r: CheckResult, why?: string) => { checks[k] = r; if (r === 'có' && why !== undefined) ev[k] = why; };
  // nến bắt đầu trong [t0, t1); không có (vào = ra trong cùng một nến) → nến chứa t0
  const inWindow = (bars: readonly Candle[]) => {
    const after = bars.filter((c) => c.openTime >= t0 && c.openTime < t1);
    return after.length > 0 ? after : bars.filter((c) => c.openTime <= t0 && c.closeTime >= t0);
  };

  // (1) sự kiện vĩ mô
  const evs = cx.events.filter((e) => { const t = Date.parse(e.time); return t >= t0 && t <= t1; });
  set('macro', evs.length > 0 ? 'có' : 'không', evs.map((e) => `${e.kind} ${iso(Date.parse(e.time))}`).join(', '));

  // (2) cú sốc BTC
  const btc = inWindow(cx.btc);
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
  const oi = cx.oi === null ? [] : cx.oi.filter((p) => p.t >= t0 - H && p.t <= t1);
  const oiCovers = cx.oi !== null && cx.oi.some((p) => p.t <= t0) && cx.oi.some((p) => p.t >= t1 - H);
  if (!oiCovers || !Number.isFinite(atrEntry)) set('liquidation', 'không đủ dữ liệu');
  else {
    let drop = 0;
    for (let i = 1; i < oi.length; i++) drop = Math.max(drop, (1 - oi[i]!.oi / oi[i - 1]!.oi) * 100);
    const wickBar = inWindow(cx.entryBars).find((c) =>
      (sgn === 1 ? Math.min(c.open, c.close) - c.low : c.high - Math.max(c.open, c.close)) >= cfg.wickAtr * atrEntry);
    set('liquidation', drop >= cfg.oiDropPct && wickBar !== undefined ? 'có' : 'không',
      `OI giảm ${f2(drop)}% trong 1 giờ + râu ngược chiều ≥ ${cfg.wickAtr}×ATR lúc ${wickBar === undefined ? '?' : iso(wickBar.openTime)}`);
  }

  // (4) funding cực đoan (quy về 8 giờ)
  const per8h = 8 / fundingIntervalHours(cx.funding);
  const hot = cx.funding.filter((r) => r.fundingTime >= t0 && r.fundingTime <= t1 && Math.abs(r.fundingRate) * per8h >= cfg.fundingExtreme);
  set('funding', hot.length > 0 ? 'có' : 'không', hot.map((r) => `funding ${(r.fundingRate * 100).toFixed(3)}%/kỳ (${(r.fundingRate * per8h * 100).toFixed(3)}%/8h) lúc ${iso(r.fundingTime)}`).join(', '));

  // (5)(6) nguồn tin riêng của coin — chưa có dữ liệu lịch sử (xem báo cáo Task 5–6: nguồn đề xuất)
  set('coin_event', 'chưa kiểm được');
  set('coin_news', 'chưa kiểm được');

  // (7) SL quá sát / bị quét SL
  const d = Math.abs(tr.avgEntry - tr.stop);
  if (Number.isFinite(atrEntry) && d < cfg.stopAtrK * atrEntry) set('stop_tight', 'có', `khoảng cắt lỗ ${f2(d / atrEntry)}×ATR(14) khung vào lệnh (< ${cfg.stopAtrK})`);
  else {
    const horizon = Math.min(t1 + cfg.sweepBars * cx.entryIntervalMs, cx.periodEnd);
    // lệnh không có TP1 (phá vỡ #3, trend-d1): tp1 = NaN, đọc lại từ JSON thành null — không kiểm "bị quét SL rồi chạm TP1"
    const swept = tr.reason === 'stop_loss' && Number.isFinite(tr.tp1)
      ? cx.entryBars.find((c) => c.openTime >= t1 && c.closeTime < horizon && (sgn === 1 ? c.high >= tr.tp1 : c.low <= tr.tp1))
      : undefined;
    if (swept !== undefined) set('stop_tight', 'có', `bị quét SL: dừng lỗ ${iso(t1)} rồi giá chạm TP1 ${tr.tp1} lúc ${iso(swept.openTime)} (≤ ${cfg.sweepBars} nến)`);
    else set('stop_tight', Number.isFinite(atrEntry) ? 'không' : 'không đủ dữ liệu');
  }

  // (8) ngược xu hướng khung lớn
  const trend = cx.trendBars.filter((c) => c.closeTime < t0);
  if (trend.length < cfg.trendSma) set('against_trend', 'không đủ dữ liệu');
  else {
    const closes = trend.map((c) => c.close);
    const m = sma(closes, cfg.trendSma).at(-1)!, last = closes.at(-1)!;
    set('against_trend', sgn * (last - m) < 0 ? 'có' : 'không', `${tr.side} khi giá ${last} ${last < m ? '<' : '>'} SMA${cfg.trendSma} ${m.toPrecision(6)} khung xu hướng`);
  }

  // (9) phí áp đảo
  const feeR = tr.riskAtFill > 0 ? tr.costs / tr.riskAtFill : NaN;
  set('fees', feeR >= cfg.feeR ? 'có' : Number.isFinite(feeR) ? 'không' : 'không đủ dữ liệu', `phí + trượt ${f2(feeR)}R (≥ ${cfg.feeR}R)`);

  return { id: tr.id, symbol: tr.symbol, mode: tr.mode, side: tr.side, R: tr.R, checks, evidence: ev };
}

// Lệnh thua → một nhóm: phép kiểm "có" đầu tiên theo thứ tự, BỎ QUA các phép kiểm trong `skip` (không phân biệt thắng/thua).
export function attributeLoss(tr: AttrTrade, cx: AttrContext, cfg: AttrConfig, skip: ReadonlySet<CheckKey> = new Set()): Attribution | null {
  if (!(tr.pnl < 0)) return null;
  const e = evaluateChecks(tr, cx, cfg);
  if (e === null) return null;
  const cat: Category = CHECKS.find((c) => !skip.has(c) && e.checks[c] === 'có') ?? 'other';
  return { id: e.id, symbol: e.symbol, mode: e.mode, side: e.side, R: e.R, category: cat, checks: e.checks,
    evidence: cat === 'other' ? 'không có nguyên nhân ngoài nào được kiểm thấy (nguồn tin riêng của coin chưa kiểm được)' : e.evidence[cat]! };
}

type Cell = { count: number; rLost: number };
type Rate = { n: number; flagged: number; share: number };
export type BaseRate = { losers: Rate; nonLosers: Rate; lift: number | null };
const emptyRow = () => Object.fromEntries(CATEGORIES.map((c) => [c, { count: 0, rLost: 0 }])) as Record<Category, Cell>;
const zeroChecks = () => Object.fromEntries(CHECKS.map((c) => [c, 0])) as Record<CheckKey, number>;

function rate(xs: ReadonlyArray<{ checks: Checks }>, c: CheckKey): Rate {
  const flagged = xs.filter((x) => x.checks[c] === 'có').length;
  return { n: xs.length, flagged, share: xs.length > 0 ? flagged / xs.length : 0 };
}

// losers: lệnh thua đã xếp nhóm; nonLosers: kết quả kiểm của lệnh KHÔNG thua (tỉ lệ nền).
export function summarizeAttribution(losers: readonly Attribution[], nonLosers: ReadonlyArray<{ checks: Checks }> = []) {
  const byCategory = emptyRow();
  const byModeSide: Record<string, Record<Category, Cell>> = {};
  const insufficient = zeroChecks(); // "không đủ dữ liệu" hoặc "chưa kiểm được"
  const flagged = zeroChecks(); // mọi kiểm "có" (chồng lấn)
  const total: Cell = { count: 0, rLost: 0 };
  for (const a of losers) {
    const k = `${a.mode}|${a.side}`;
    byModeSide[k] ??= emptyRow();
    for (const cell of [byCategory[a.category], byModeSide[k][a.category], total]) { cell.count++; cell.rLost += a.R; }
    for (const c of CHECKS) {
      const r = a.checks[c];
      if (r === 'không đủ dữ liệu' || r === 'chưa kiểm được') insufficient[c]++;
      if (r === 'có') flagged[c]++;
    }
  }
  const baseRates = Object.fromEntries(CHECKS.map((c) => {
    const l = rate(losers, c), w = rate(nonLosers, c);
    const lift = l.flagged === 0 ? null : w.share > 0 ? l.share / w.share : Infinity;
    return [c, { losers: l, nonLosers: w, lift }];
  })) as Record<CheckKey, BaseRate>;
  const shareOfLosers = Object.fromEntries(CATEGORIES.map((c) => [c, total.count > 0 ? byCategory[c].count / total.count : 0])) as Record<Category, number>;
  // lệnh thua chưa được (1)–(4) giải thích → lẽ ra cần nguồn tin riêng của coin để xếp đúng
  const pending = losers.filter((a) => (['stop_tight', 'against_trend', 'fees', 'other'] as Category[]).includes(a.category)).length;
  return { total, byCategory, shareOfLosers, byModeSide, insufficient, flagged, baseRates, pendingSources: { coin_event: pending, coin_news: pending }, sourceNote: UNCHECKED_SOURCE };
}

// Phép kiểm KHÔNG phân biệt thắng/thua: có bật ở lệnh thua nhưng độ nâng (tỉ lệ ở thua ÷ tỉ lệ ở không thua) < minLift.
export function liftFilter(rates: Record<CheckKey, BaseRate>, minLift: number): Set<CheckKey> {
  return new Set(CHECKS.filter((c) => { const l = rates[c].lift; return l !== null && l < minLift; }));
}
