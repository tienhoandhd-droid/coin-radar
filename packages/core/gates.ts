import { regimeCheck, type Regime } from './regime.ts';
import { COMMON, CONFIG } from './config.ts';
import type { RiskTier } from './risk.ts';
import type { Mode, Side } from './types.ts';

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
  liquidationOk: boolean;
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
    {
      code: 'G-04',
      pass: !(Math.abs(c.move1hPct) > COMMON.pumpMovePct && c.volumeZ1h > COMMON.pumpVolumeZ),
      note: `1H ${c.move1hPct.toFixed(1)}%, z khối lượng ${c.volumeZ1h.toFixed(1)}`,
    },
    {
      code: 'G-05',
      pass: c.ageDays >= CONFIG[c.mode].minAgeDays,
      note: `${Math.floor(c.ageDays)} ngày tuổi`,
    },
    { code: 'G-06', pass: true, note: 'chưa đánh giá — chưa có nguồn hack/hủy niêm yết (kế hoạch sau)' },
    { code: 'G-07', pass: !c.eventBlocked, note: c.eventBlocked ? 'Trong cửa sổ sự kiện' : 'Ngoài cửa sổ sự kiện' },
    { code: 'G-08', pass: c.liquidationOk, note: c.liquidationOk ? 'Thanh lý ước tính xa hơn cắt lỗ' : 'Thanh lý quá gần cắt lỗ' },
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
