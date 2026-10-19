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
  fundingHoldHours: number; // thời gian giữ lệnh DỰ KIẾN (giờ) để ước chi phí funding; số kỳ = fundingHoldHours / chu kỳ funding thật của hợp đồng. Đề xuất, chưa backtest. KHÔNG phải trần maxHoldHours
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
    fundingHoldHours: 8, minAgeDays: 30, breakerPauseHours: 3,
  },
  swing: {
    trendInterval: '1d', entryInterval: '4h', trendLimit: 300, entryLimit: 500,
    weights: { trend: 35, relativeStrength: 25, momentum: 10, flow: 15, path: 15 },
    rsBars: 14, flowBars: 30, flowSkipBars: 0,
    stopAtrMult: 2, pivotBufferAtr: 0.5, maxEntryAtr: 0.3, tp1R: 1.5, trailAtrMult: 3,
    timeStopHours: 7 * 24, maxHoldHours: 21 * 24, defaultRiskPct: 0.5, maxLeverage: 5,
    fundingHoldHours: 7 * 24, minAgeDays: 0, breakerPauseHours: 12,
  },
};

export const COMMON = {
  qualifyScore: 70,
  counterTrendScore: 80,
  minCoverage: 0.7,
  minWarmupBars: 250,
  topRankPct: 0.1,
  fastUniverseSize: 150, // Lướt nhanh chỉ quét N hợp đồng thanh khoản cao nhất — đề xuất, chưa backtest
  liquidityExcludeBottomPct: 0.3, // G-03: loại 30% hợp đồng khối lượng 24h thấp nhất
  maxSpreadPct: 0.15, // G-03: spread tối đa (%)
  pumpMovePct: 15, // G-04
  pumpVolumeZ: 5, // G-04
  highRiskTierPct: 0.25, // P-01: rủi ro tối đa mỗi lệnh (% vốn) cho Lướt nhanh và cho coin mức rủi ro Cao/Rất cao — theo spec, đề xuất, chưa backtest
  defaultFundingIntervalHours: 8, // Binance: hợp đồng KHÔNG có trong /fapi/v1/fundingInfo dùng chu kỳ mặc định 8h (theo tài liệu Binance) — đề xuất, chưa backtest
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
  roundNumberProximityAtr: 0.2, // cắt lỗ cách số tròn trong khoảng này (×ATR) thì đẩy qua số tròn — đề xuất, chưa backtest
  riskAtrPctTiers: [4, 6, 10],
  // analyze — đề xuất, chưa backtest:
  costTierRank: { high: 0.2, mid: 0.5 }, // hạng thanh khoản ≤ high → nhóm 'high'; ≤ mid → 'mid'; còn lại 'low'
  liquidRankForRs: 0.5, // chỉ tính sức mạnh tương đối so BTC khi hạng thanh khoản ≤ mức này
  watchScore: 50, // điểm tối thiểu để gắn nhãn 'Theo dõi'
  drawdownDays: 90, // cửa sổ (ngày) đo mức sụt tối đa cho mức rủi ro
  // G-07 / G-10 / mức rủi ro — đề xuất, chưa backtest:
  eventWindowsHours: {
    FOMC: { before: 4, after: 2 },
    CPI: { before: 2, after: 2 },
    BOJ: { before: 2, after: 2 },
  }, // cửa sổ chặn quanh sự kiện vĩ mô (giờ) — đề xuất, chưa backtest
  expiryFlagHours: 24, // gắn cờ ±24h quanh đáo hạn quyền chọn quý — đề xuất, chưa backtest
  fundingCutoffMinutes: 30, // G-10: Lướt nhanh không vào lệnh phải trả funding khi còn < 30 phút — đề xuất, chưa backtest
  risk: {
    lowLiquidityRank: 0.5, // hạng thanh khoản > mức này thì tăng 1 bậc rủi ro
    maxDrawdown90Pct: 60, // sụt > mức này (%) trong 90 ngày thì tăng 1 bậc
    newListingDays: 90, // tuổi < mức này (ngày) thì tối thiểu 'Cao'
  }, // đề xuất, chưa backtest
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
