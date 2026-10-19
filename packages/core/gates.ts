import { regimeCheck, type Regime } from './regime.ts';
import { COMMON, CONFIG } from './config.ts';
import type { RiskTier } from './risk.ts';
import type { Candle, Mode, Side } from './types.ts';
import { sma } from './indicators.ts';
import type { PatternKind } from './patterns/types.ts';
import { marginTier, type MarginBracket } from './margin.ts';
import { maxSafeLeverage } from './plan.ts';

export type GateResult = { code: string; pass: boolean; note: string };
export type GateContext = {
  mode: Mode;
  side: Side;
  score: number;
  regime: Regime;
  btcHourly: { side: Side | null; note: string } | null; // chỉ Lướt nhanh: phía của BTC so SMA200 1H; null = không có dữ liệu
  rsZ: number | null; // z sức mạnh tương đối so BTC (từ scoreSide); null = không đo được
  riskTier: RiskTier;
  breakerTripped: boolean;
  breakerNote?: string;
  warmupBars: number;
  coverage: number;
  liquidityRankPct: number; // 0 = thanh khoản cao nhất, 1 = thấp nhất
  spreadPct: number;
  move1hPct: number;
  volumeZ1h: number;
  ageDays: number;
  eventBlocked: boolean;
  eventCalendarExpired: boolean; // I4: lịch sự kiện đã qua sự kiện cuối (hoặc rỗng) → G-07 trượt
  deliveryDate: number; // G-06: deliveryDate của hợp đồng (exchangeInfo)
  liquidation: { ok: boolean; note: string }; // G-08 — từ liquidationCheck
  stopDistPct: number; // khoảng cắt lỗ theo % giá vào lệnh
  stopDistAtr: number; // khoảng cắt lỗ chia ATR(14) nến NGÀY; NaN nếu thiếu ATR ngày
  fundingRate: number; // mức MỖI KỲ funding của hợp đồng, dương = Long trả
  fundingIntervalHours: number; // chu kỳ funding của hợp đồng (giờ)
  fundingIntervalDefault: boolean; // true = mã không có trong fundingInfo, dùng mặc định 8h
  minutesToFunding: number;
  planValid: boolean; // kế hoạch SL/TP theo vùng có hợp lệ không (TradePlan.valid)
  planNote: string; // lý do không hợp lệ, hoặc lý do đặt SL
};

const comma1 = (x: number) => x.toFixed(1).replace('.', ',');
const pct4 = (rate: number) => (rate * 100).toFixed(4).replace('.', ',');

// Quy mức funding mỗi kỳ về %/8h để dùng chung một ngưỡng cho mọi hợp đồng.
export function ratePer8h(rate: number, intervalHours: number): number {
  return (rate * 8) / intervalHours;
}

export function fundingNote(rate: number, intervalHours: number, isDefault: boolean): string {
  const base = intervalHours === 8
    ? `Funding ${pct4(rate)}%/8h`
    : `Funding ${pct4(rate)}%/${intervalHours}h ≈ ${pct4(ratePer8h(rate, intervalHours))}%/8h`;
  return isDefault ? `${base} (mặc định 8h: mã không có trong fundingInfo)` : base;
}

// G-08 (P-04) theo bậc ký quỹ của notional (I4/I7): giá thanh lý ở đòn bẩy sẽ dùng = min(trần chế độ, trần bậc, đòn bẩy an toàn)
// phải cách giá vào ≥ (1 + liquidationBufferStops) × khoảng SL. brackets = bậc thật (leverageBracket, cần key); không có → mặc định thận trọng.
export function liquidationCheck(a: { stopDistFrac: number; notional: number; leverageCap: number; brackets?: readonly MarginBracket[] }): { ok: boolean; note: string } {
  const tier = marginTier(a.notional, a.brackets);
  const usd = (x: number) => Math.round(x).toLocaleString('vi-VN');
  if (tier === null) {
    return { ok: false, note: `Notional ${usd(a.notional)} USDT vượt bậc ký quỹ cao nhất (${a.brackets ? 'leverageBracket' : 'mặc định thận trọng'}) — không mở được cỡ này` };
  }
  const safe = maxSafeLeverage(a.stopDistFrac, tier.mmr, COMMON.liquidationBufferStops);
  const lev = Math.min(a.leverageCap, tier.maxLeverage, Math.floor(safe));
  const head = `MMR ${(tier.mmr * 100).toFixed(1).replace('.', ',')}% (bậc ≤ ${usd(tier.notionalCap)} USDT, ${tier.source})`;
  return lev >= 1
    ? { ok: true, note: `${head}; ở ${lev}× thanh lý ước tính cách giá vào ≥ ${1 + COMMON.liquidationBufferStops} khoảng SL` }
    : { ok: false, note: `${head}; thanh lý quá gần cắt lỗ ngay cả ở 1×` };
}

export function evaluateGates(c: GateContext): GateResult[] {
  const dir = c.side === 'long' ? 1 : -1;
  const regimeVerdict = regimeCheck(c.regime, c.side, c.score, c.rsZ, c.riskTier);
  // D3: Lướt nhanh cần BTC 1H cùng phía lệnh, KHÔNG có ngoại lệ điểm cao; thiếu dữ liệu → chặn
  const btcOk = c.mode !== 'fast' || (c.btcHourly !== null && c.btcHourly.side === c.side);
  const btcNote = c.mode !== 'fast' ? '' : `; ${c.btcHourly === null ? 'thiếu dữ liệu BTC 1H' : c.btcHourly.note}${btcOk ? '' : ` — ngược chiều lệnh ${c.side === 'long' ? 'Long' : 'Short'}`}`;
  const adverseFunding = dir * ratePer8h(c.fundingRate, c.fundingIntervalHours); // %/8h; > 0 nghĩa là lệnh phải trả funding
  return [
    {
      code: 'G-01',
      pass: !c.breakerTripped && regimeVerdict.ok && btcOk,
      note: c.breakerTripped ? `Cầu dao biến động đang bật${c.breakerNote ? ' — ' + c.breakerNote : ''}` : regimeVerdict.note + btcNote,
    },
    {
      code: 'G-02',
      pass: c.warmupBars >= COMMON.minWarmupBars && c.coverage >= COMMON.minCoverage,
      note: `${c.warmupBars} nến, độ phủ ${Math.round(c.coverage * 100)}%`,
    },
    {
      code: 'G-03',
      pass: c.liquidityRankPct <= 1 - COMMON.liquidityExcludeBottomPct && c.spreadPct <= COMMON.maxSpreadPct,
      note: `Hạng thanh khoản ${Math.round(c.liquidityRankPct * 100)}%, spread ${c.spreadPct.toFixed(3)}%`,
    },
    // I4: thiếu dữ liệu 1H (NaN) → trượt, không coi là "không bị bơm/xả"
    (Number.isNaN(c.move1hPct) || Number.isNaN(c.volumeZ1h))
      ? { code: 'G-04', pass: false, note: `thiếu dữ liệu 1H để kiểm bơm/xả (biến động ${Number.isNaN(c.move1hPct) ? 'NaN' : c.move1hPct.toFixed(1) + '%'}, z khối lượng ${Number.isNaN(c.volumeZ1h) ? 'NaN' : c.volumeZ1h.toFixed(1)}) — chặn` }
      : {
        code: 'G-04',
        pass: !(Math.abs(c.move1hPct) > COMMON.pumpMovePct && c.volumeZ1h > COMMON.pumpVolumeZ),
        note: `1H ${c.move1hPct.toFixed(1)}%, z khối lượng ${c.volumeZ1h.toFixed(1)}`,
      },
    {
      code: 'G-05',
      pass: c.ageDays >= CONFIG[c.mode].minAgeDays,
      note: `${Math.floor(c.ageDays)} ngày tuổi`,
    },
    // I4: G-06 chỉ kiểm được ngày tất toán (deliveryDate); hack 7 ngày / thông báo hủy niêm yết / lệch neo stablecoin CHƯA có nguồn
    c.deliveryDate < COMMON.perpetualDeliveryFloor
      ? { code: 'G-06', pass: false, note: `Hợp đồng có ngày tất toán ${new Date(c.deliveryDate).toISOString().slice(0, 16).replace('T', ' ')} UTC — có thể sắp hủy niêm yết` }
      : { code: 'G-06', pass: true, note: 'Chỉ kiểm ngày tất toán (không có); hack/thông báo hủy niêm yết/lệch neo: CHƯA ĐÁNH GIÁ (chưa có nguồn)' },
    {
      code: 'G-07',
      pass: !c.eventBlocked && !c.eventCalendarExpired,
      note: c.eventCalendarExpired ? 'Lịch sự kiện đã hết hạn — không biết có sự kiện vĩ mô hay không, chặn' : c.eventBlocked ? 'Trong cửa sổ sự kiện' : 'Ngoài cửa sổ sự kiện',
    },
    { code: 'G-08', pass: c.liquidation.ok, note: c.liquidation.note },
    {
      code: 'G-09',
      pass: adverseFunding <= COMMON.fundingExtremePer8h,
      note: fundingNote(c.fundingRate, c.fundingIntervalHours, c.fundingIntervalDefault),
    },
    {
      code: 'G-10',
      pass: !(c.mode === 'fast' && adverseFunding > 0 && c.minutesToFunding < COMMON.fundingCutoffMinutes),
      note: `${Math.round(c.minutesToFunding)} phút tới mốc funding`,
    },
    {
      code: 'G-11',
      pass: Number.isFinite(c.stopDistAtr) && c.stopDistAtr <= COMMON.maxStopDailyAtr && c.stopDistPct <= COMMON.maxStopPct,
      note: Number.isFinite(c.stopDistAtr)
        ? `Cắt lỗ cách ${comma1(c.stopDistPct)}% giá (${comma1(c.stopDistAtr)}×ATR ngày); trần ${COMMON.maxStopDailyAtr}×ATR hoặc ${COMMON.maxStopPct}%`
        : `Cắt lỗ cách ${comma1(c.stopDistPct)}% giá; thiếu ATR ngày nên không đánh giá được — chặn`,
    },
    { code: 'G-12', pass: c.planValid, note: c.planNote },
  ];
}

// ---------- Kế hoạch 1c: cổng mô hình biểu đồ ----------

// P-G1: chỉ chạy mô hình (tín hiệu + bối cảnh) cho coin rủi ro Thấp/Vừa VÀ thanh khoản nhóm cao.
export function inPatternScope(tier: RiskTier, liquidityRankPct: number): { ok: boolean; note: string } {
  const tierOk = tier === 'Thấp' || tier === 'Vừa';
  const liqOk = liquidityRankPct <= COMMON.costTierRank.high;
  const rank = `hạng thanh khoản ${Math.round(liquidityRankPct * 100)}%`;
  if (tierOk && liqOk) return { ok: true, note: `P-G1: trong phạm vi mô hình (rủi ro ${tier}, ${rank})` };
  const why: string[] = [];
  if (!tierOk) why.push(`rủi ro ${tier}`);
  if (!liqOk) why.push(`${rank} > ${Math.round(COMMON.costTierRank.high * 100)}% (không thuộc nhóm thanh khoản cao)`);
  return { ok: false, note: `P-G1: ngoài phạm vi mô hình — ${why.join('; ')}` };
}

export type DailyTrend = { trend: 'up' | 'down' | 'sideways'; closeBelowSma20: boolean; note: string };

// Xu hướng 1D của hợp đồng theo đúng ba điều kiện S-01 (giá/SMA20, giá/SMA50, SMA20/SMA50): đủ cả ba cùng chiều mới là up/down.
export function dailyTrend(daily: Candle[]): DailyTrend {
  const S = COMMON.score;
  const closes = daily.map((k) => k.close);
  const n = closes.length;
  const fast = sma(closes, S.smaFast)[n - 1];
  const slow = sma(closes, S.smaSlow)[n - 1];
  if (n === 0 || fast === undefined || slow === undefined || !Number.isFinite(fast) || !Number.isFinite(slow)) {
    return { trend: 'sideways', closeBelowSma20: false, note: `Thiếu dữ liệu 1D (${n}/${S.smaSlow} nến) — coi là đi ngang` };
  }
  const p = closes[n - 1]!;
  const upAll = p > fast && p > slow && fast > slow;
  const downAll = p < fast && p < slow && fast < slow;
  const trend = upAll ? 'up' : downAll ? 'down' : 'sideways';
  const name = trend === 'up' ? 'tăng' : trend === 'down' ? 'giảm' : 'đi ngang';
  const f6 = (x: number) => String(Number(x.toPrecision(6))).replace('.', ',');
  return { trend, closeBelowSma20: p < fast, note: `1D ${name} (đóng ${f6(p)}, SMA${S.smaFast} ${f6(fast)}, SMA${S.smaSlow} ${f6(slow)})` };
}

// P-G2: mô hình Swing chỉ phá thuận xu hướng 1D (báo cáo mục (1)).
//  - chữ nhật / cờ / tam giác: xu hướng 1D phải cùng chiều lệnh; tam giác cân phá xuống khi thị trường Lên → không Short;
//  (hai đỉnh/hai đáy: chỉ là bối cảnh từ 19/10/2026 nên không còn luật riêng ở đây.)
export function patternTrendGate(a: { kind: PatternKind; side: Side; daily: DailyTrend; regime: Regime }): GateResult {
  const sideTxt = a.side === 'long' ? 'Long' : 'Short';
  const fail = (why: string): GateResult => ({ code: 'P-G2', pass: false, note: `P-G2 trượt: ${why} — ${a.daily.note}` });
  const pass = (why: string): GateResult => ({ code: 'P-G2', pass: true, note: `P-G2 qua: ${why} — ${a.daily.note}` });
  if (a.kind === 'sym_triangle' && a.side === 'short' && a.regime === 'up') {
    return fail('tam giác cân phá xuống trong thị trường Lên → không Short');
  }
  const want = a.side === 'long' ? 'up' : 'down';
  return a.daily.trend === want
    ? pass(`${sideTxt} cùng chiều xu hướng 1D`)
    : fail(`${sideTxt} không cùng chiều xu hướng 1D`);
}

// P-C1: bối cảnh (vai-đầu-vai, vùng nhiều tháng) chặn lệnh MỚI theo chiều. null = hợp đồng ngoài phạm vi mô hình (P-G1).
export function contextGate(ctx: { block: { long: boolean; short: boolean }; notes: string[] } | null, side: Side): GateResult {
  if (ctx === null) return { code: 'P-C1', pass: true, note: 'Bối cảnh mô hình: ngoài phạm vi P-G1, không đánh giá' };
  const blocked = side === 'long' ? ctx.block.long : ctx.block.short;
  const sideTxt = side === 'long' ? 'Long' : 'Short';
  if (blocked) return { code: 'P-C1', pass: false, note: `Bối cảnh chặn ${sideTxt}: ${ctx.notes.join('; ')}` };
  return { code: 'P-C1', pass: true, note: ctx.notes.length > 0 ? `Bối cảnh không chặn ${sideTxt}: ${ctx.notes.join('; ')}` : 'Không có bối cảnh chặn' };
}
