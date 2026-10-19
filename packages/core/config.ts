import type { Mode } from './types.ts';

// MỌI ngưỡng dưới đây là điểm khởi đầu theo spec mục 3 — ĐỀ XUẤT, CHƯA BACKTEST.
export type ModeConfig = {
  trendInterval: '1h' | '1d';
  entryInterval: '15m' | '4h';
  trendLimit: number;
  entryLimit: number;
  weights: { trend: number; relativeStrength: number; momentum: number; flow: number; path: number };
  rsBars: number; // số nến khung xu hướng để đo sức mạnh tương đối so BTC
  flowBars: number; // số nến khung vào lệnh để đo mất cân bằng taker
  flowSkipBars: number; // bỏ các nến gần nhất (Lướt nhanh: 2 nến 15m = 30 phút)
  stopAtrMult: number;
  pivotBufferAtr: number;
  maxEntryAtr: number;
  tp1R: number;
  trailAtrMult: number;
  timeStopHours: number;
  maxHoldHours: number;
  defaultRiskPct: number;
  maxLeverage: number;
  fundingIntervalsPerHold: number; // số lần thanh toán funding dự kiến trong thời gian giữ (8h/lần)
  minAgeDays: number;
  breakerPauseHours: number;
};

export const CONFIG: Record<Mode, ModeConfig> = {
  fast: {
    trendInterval: '1h', entryInterval: '15m', trendLimit: 500, entryLimit: 500,
    weights: { trend: 30, relativeStrength: 15, momentum: 10, flow: 25, path: 20 },
    rsBars: 48, flowBars: 16, flowSkipBars: 2,
    stopAtrMult: 2.5, pivotBufferAtr: 0.5, maxEntryAtr: 0.3, tp1R: 1.5, trailAtrMult: 3,
    timeStopHours: 8, maxHoldHours: 24, defaultRiskPct: 0.25, maxLeverage: 10,
    fundingIntervalsPerHold: 1, minAgeDays: 30, breakerPauseHours: 3,
  },
  swing: {
    trendInterval: '1d', entryInterval: '4h', trendLimit: 300, entryLimit: 500,
    weights: { trend: 35, relativeStrength: 25, momentum: 10, flow: 15, path: 15 },
    rsBars: 14, flowBars: 30, flowSkipBars: 0,
    stopAtrMult: 2, pivotBufferAtr: 0.5, maxEntryAtr: 0.3, tp1R: 1.5, trailAtrMult: 3,
    timeStopHours: 7 * 24, maxHoldHours: 21 * 24, defaultRiskPct: 0.5, maxLeverage: 5,
    fundingIntervalsPerHold: 21, minAgeDays: 0, breakerPauseHours: 12,
  },
};

export const COMMON = {
  qualifyScore: 70,
  counterTrendScore: 80,
  minCoverage: 0.7,
  minWarmupBars: 250,
  topRankPct: 0.1,
  liquidityExcludeBottomPct: 0.3, // G-03: loại 30% hợp đồng khối lượng 24h thấp nhất
  maxSpreadPct: 0.15, // G-03: spread tối đa (%)
  pumpMovePct: 15, // G-04
  pumpVolumeZ: 5, // G-04
  fundingExtremePer8h: 0.001, // G-09: |funding| > 0,1%/8h cùng chiều lệnh → chặn. Tạm dùng ngưỡng tuyệt đối (spec: z-score 30 ngày — làm ở kế hoạch 3 khi có lịch sử)
  fundingHotPer8h: 0.0005, // F-01: > 0,05%/8h cùng chiều → trừ điểm
  fundingHotPenalty: 10,
  breakerBtcMovePct: 4,
  breakerRangeAtr: 3,
  regimeBandPct: 2,
  regimeDrawdownPct: 20,
  pivotConfirmBars: 3,
  // GIẢ ĐỊNH THẬN TRỌNG — chưa tra trang phí/ký quỹ chính thức Binance:
  costRoundTripPct: { high: 0.25, mid: 0.5, low: 1.0 }, // phí + trượt giá khứ hồi theo nhóm thanh khoản (%)
  maintenanceMarginRate: 0.01,
  liquidationBufferStops: 1, // giá thanh lý phải xa hơn cắt lỗ ≥ 1 khoảng cắt lỗ
  riskAtrPctTiers: [4, 6, 10],
  // ĐIỂM S-01/S-02/S-03 — ĐỀ XUẤT, CHƯA BACKTEST:
  score: {
    smaFast: 20, // SMA ngắn cho điểm xu hướng
    smaSlow: 50, // SMA dài cho điểm xu hướng
    emaLong: 200, // EMA dài cho điểm xu hướng
    emaOrderWeight: 0.5, // trọng số điều kiện thứ tự SMA50 so EMA200
    relStrengthZScale: 2, // quy đổi z sức mạnh tương đối về [0,1]: 0,5 + z / 2
    rsiPeriod: 14, // RSI khung vào lệnh
    rsiMid: 50, // ngưỡng RSI phân chia tăng/giảm
    macd: { fast: 12, slow: 26, signal: 9 }, // MACD khung vào lệnh
    volumeLookback: 20, // số nến so khối lượng bất thường
    volumeSpikeZ: 2, // z khối lượng vượt ngưỡng này mới được cộng điểm phụ S-02
    imbalanceScale: 0.2, // mất cân bằng taker ±20% là đạt tối đa thành phần taker
    flowTakerShare: 0.7, // tỷ trọng thành phần taker trong S-02
    flowVolumeShare: 0.3, // tỷ trọng thành phần khối lượng bất thường trong S-02
  },
} as const;
