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
  maxEntryAtr: number;
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
    maxEntryAtr: 0.3, trailAtrMult: 3,
    timeStopHours: 8, maxHoldHours: 24, defaultRiskPct: 0.25, maxLeverage: 10,
    fundingHoldHours: 8, minAgeDays: 30, breakerPauseHours: 3,
  },
  swing: {
    trendInterval: '1d', entryInterval: '4h', trendLimit: 300, entryLimit: 500,
    weights: { trend: 35, relativeStrength: 25, momentum: 10, flow: 15, path: 15 },
    rsBars: 14, flowBars: 30, flowSkipBars: 0,
    maxEntryAtr: 0.3, trailAtrMult: 3,
    timeStopHours: 7 * 24, maxHoldHours: 21 * 24, defaultRiskPct: 0.5, maxLeverage: 5,
    fundingHoldHours: 7 * 24, minAgeDays: 0, breakerPauseHours: 12,
  },
};

export const COMMON = {
  qualifyScore: 70,
  counterTrendScore: 80,
  counterTrendRsZ: 1.5, // G-01: lệnh ngược chế độ cần |z sức mạnh tương đối so BTC| ≥ mức này, đúng chiều lệnh (Short: z ≤ −1,5; Long: z ≥ +1,5) — quyết định D2, đề xuất, chưa backtest
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
  maxStopDailyAtr: 2, // G-11: khoảng cắt lỗ tối đa = 2 × ATR(14) nến NGÀY — quyết định D1, đề xuất, chưa backtest
  maxStopPct: 20, // G-11: hoặc tối đa 20% giá vào lệnh — quyết định D1, đề xuất, chưa backtest
  breakerBtcMovePct: 4,
  breakerRangeAtr: 3,
  regimeBandPct: 2,
  regimeDrawdownPct: 20,
  pivotConfirmBars: 3,
  binanceTrailMaxCallbackPct: 10, // lệnh TRAILING_STOP_MARKET của Binance: callbackRate tối đa 10 (%), tối thiểu 0,1 — developers.binance.com/docs/derivatives/usds-margined-futures/trade/rest-api/New-Order (tra 19/10/2026)
  // Vùng hỗ trợ/kháng cự — ĐỀ XUẤT, CHƯA BACKTEST
  zones: {
    entryWeight: 1, // mỗi đỉnh/đáy khung vào lệnh
    trendWeight: 2, // mỗi đỉnh/đáy khung xu hướng (khung lớn mạnh hơn)
    mergeAtr: 0.5, // gộp các mức cách nhau ≤ 0,5×ATR khung vào lệnh
    maxWidthAtr: 1.5, // một vùng rộng tối đa 1,5×ATR
    roundBonus: 0.5, // vùng chứa số tròn
    roundToleranceAtr: 0.1, // số tròn nằm trong 0,1×ATR quanh vùng thì tính là chứa số tròn — đề xuất, chưa backtest
    volumeBonus: 1, // vùng thuộc nhóm 25% khối lượng giao dịch cao nhất
    minZonesForVolume: 4, // cần ≥ 4 vùng mới tính tứ phân vị khối lượng — đề xuất, chưa backtest
    volumePercentile: 0.75, // vùng có khối lượng ≥ phân vị 75% thì được cộng volumeBonus — đề xuất, chưa backtest
    minSlStrength: 2, // vùng dùng để đặt SL phải có độ mạnh ≥ 2
    slBufferAtr: 0.3, // SL nằm ngoài mép vùng 0,3×ATR
    tpBufferAtr: 0.2, // TP đặt trước mép vùng cản 0,2×ATR
    minTp1R: 1, // TP1 phải lời ≥ 1R, nếu không bỏ lệnh
    exitPcts: [50, 30, 20], // TP1 / TP2 / TP3 (% vị thế) — người dùng chốt 19/10/2026
    directEntryMaxAtr: 0.5, // giá cách mép vùng hỗ trợ (Long) ≤ 0,5×ATR → vào trực tiếp; xa hơn → đặt limit chờ hồi
    limitBufferAtr: 0.1, // giá limit = mép trên vùng hỗ trợ + 0,1×ATR (Short: mép dưới vùng kháng cự − 0,1×ATR)
    limitExpiryBars: { fast: 8, swing: 6 }, // limit hết hiệu lực sau 8 nến 15m (2h) / 6 nến 4H (24h)
  },
  // Mô hình biểu đồ — ĐỀ XUẤT, CHƯA BACKTEST (nguồn: reports/Mô hình biểu đồ cho BTC.md, mục (2))
  patterns: {
    minSwingAtr: { '15m': 1.0, '1h': 1.0, '4h': 0.75, '1d': 0.75 }, // biên độ swing tối thiểu so với pivot ngược chiều trước đó, tính bằng ×ATR(14) tại nến pivot — đề xuất, chưa backtest
    atrPeriod: 14, // chu kỳ ATR của khung nhận diện — đề xuất, chưa backtest
    zoneTolAtr: 0.5, // hai mức 'bằng nhau' khi chênh ≤ mức này (×A), theo quy tắc gom vùng S/R — đề xuất, chưa backtest
    rect: {
      minTouches: 2, // số chạm tối thiểu mỗi biên — đề xuất, chưa backtest
      tripleTouches: 3, // từ mức này ở một biên thì ghi chú ba đỉnh/ba đáy — đề xuất, chưa backtest
      minHeightAtr: 3, // chiều cao tối thiểu (×A) — đề xuất, chưa backtest
      minBars: 20, // thời lượng tối thiểu (nến) — đề xuất, chưa backtest
    },
    double: {
      tolAtr: 0.5, // hai đỉnh/đáy lệch ≤ min(mức này ×A, tolPct% giá) — đề xuất, chưa backtest
      tolPct: 3, // trần lệch theo % giá (Bulkowski <3%) — đề xuất, chưa backtest
      minDepthAtr: 2.5, // đáy giữa (đỉnh giữa) sâu tối thiểu (×A) — đề xuất, chưa backtest
      minGapBars: 10, // hai đỉnh/đáy cách nhau tối thiểu (nến) — đề xuất, chưa backtest
    },
    triangle: {
      minLongSide: 3, // số pivot tối thiểu ở cạnh dài hơn — đề xuất, chưa backtest
      minShortSide: 2, // số pivot tối thiểu ở cạnh còn lại — đề xuất, chưa backtest
      flatSlopeAtr: 0.03, // cạnh 'phẳng' khi |độ dốc| ≤ mức này (×A mỗi nến) — đề xuất, chưa backtest
      minConvergence: 0.3, // độ rộng thu hẹp tối thiểu từ đầu đến cuối (tỷ lệ) — đề xuất, chưa backtest
      apexMinRatio: 0.5, // apex cách pivot cuối ≥ mức này × chiều dài mô hình — đề xuất, chưa backtest
      apexMaxRatio: 3, // apex cách pivot cuối ≤ mức này × chiều dài mô hình — đề xuất, chưa backtest
      maxCloseBreachAtr: 0.25, // close vượt đường tối đa (×A) — đề xuất, chưa backtest
      minBars: 15, // thời lượng tối thiểu (nến) — đề xuất, chưa backtest
      classifyBandAtr: 0.01, // dải đệm quanh ngưỡng phẳng (×A mỗi nến): |dốc| trong flatSlopeAtr ± mức này là 'không rõ' → hai cạnh cùng hướng vào trong thì xếp tam giác cân, còn lại bỏ — đề xuất, chưa backtest
      maxPivots: 10, // số pivot tối đa trong một cửa sổ xét (giới hạn chi phí tính) — đề xuất, chưa backtest
    },
    flag: {
      minPoleAtr: 3, // cán cờ tối thiểu (×A) — đề xuất, chưa backtest
      maxPoleBars: 15, // cán cờ tối đa (nến) — đề xuất, chưa backtest
      maxWidthRatio: 0.5, // bề rộng cờ (nến từ tip) ≤ mức này × số nến của cán — đề xuất, chưa backtest
      maxHeightRatio: 0.5, // chiều cao cờ ≤ mức này × chiều cao cán — đề xuất, chưa backtest
      minBarsFromTip: 5, // tối thiểu nến kể từ tip — đề xuất, chưa backtest
      maxBars: 20, // tối đa nến kể từ tip (quá hạn) — đề xuất, chưa backtest
      minConvergence: 0.3, // độ rộng thu hẹp từ đầu đến cuối ≥ mức này → cờ đuôi nheo — đề xuất, chưa backtest
      flatSlopeAtr: 0.03, // cờ không hội tụ chỉ được trôi thuận chiều cán tối đa mức này (×A mỗi nến) — đề xuất, chưa backtest
    },
    hs: {
      shoulderTolAtr: 0.75, // hai vai lệch tối đa (×A) — đề xuất, chưa backtest
      neckTolAtr: 0.75, // hai nách lệch tối đa (×A)... — đề xuất, chưa backtest
      neckSlopeAtr: 0.1, // ...hoặc độ dốc neckline tối đa (×A mỗi nến) — đề xuất, chưa backtest
      shoulderMinRatio: 0.25, // vai cao tối thiểu so với đầu (tính từ neckline) — đề xuất, chưa backtest
      shoulderMaxRatio: 0.7, // vai cao tối đa so với đầu — đề xuất, chưa backtest
      headMinAtr: 1.5, // đầu − neckline tối thiểu (×A) — đề xuất, chưa backtest
      symmetryMax: 2.5, // thời gian vai→đầu hai bên lệch tối đa (lần) — đề xuất, chưa backtest
      emaPeriod: 200, // chu kỳ EMA lọc vị trí xu hướng — đề xuất, chưa backtest
      minOnTrendSide: 3, // số pivot (trong 5) phải ở phía đúng của EMA — đề xuất, chưa backtest
      minBars: 15, // thời lượng tối thiểu P1→P5 (nến) — đề xuất, chưa backtest
      maxBars: 120, // thời lượng tối đa P1→P5 (nến) — đề xuất, chưa backtest
      waitBars: 20, // chờ đóng thủng neckline tối đa (nến kể từ P5), quá hạn là hết hiệu lực — đề xuất, chưa backtest
      activeBars: 60, // sau khi xác nhận, bối cảnh còn hiệu lực tối đa (nến) — đề xuất, chưa backtest
    },
    multiMonth: {
      minTouches: 3, // số chạm tối thiểu mỗi biên — đề xuất, chưa backtest
      tripleTouches: 3, // như chữ nhật — đề xuất, chưa backtest
      minHeightAtr: 3, // như chữ nhật — đề xuất, chưa backtest
      minBars: 60, // thời lượng tối thiểu (nến 1D) — đề xuất, chưa backtest
      confirmAtr: 0.5, // phá được xác nhận khi đóng ngoài biên ≥ mức này (×A 1D) — đề xuất, chưa backtest
      confirmCloses: 2, // hoặc số nến 1D liên tiếp đóng ngoài biên — đề xuất, chưa backtest
      nearAtr: 1, // 'ngay dưới/trên biên' = trong khoảng này (×A 1D) — đề xuất, chưa backtest
    },
    // Kế hoạch lệnh theo mô hình (báo cáo mục (2) đệm cắt lỗ, (3), (4); quyết định người dùng 19/10/2026) — ĐỀ XUẤT, CHƯA BACKTEST
    plan: {
      stopBufferAtr: 0.5, // SL = mức cắt lỗ của mô hình ± đệm (×A); báo cáo cho khoảng 0,25–0,5, chọn mức rộng — đề xuất, chưa backtest
      maxRiskAtr: 3, // R = |giá vào − SL| > mức này (×A khung vào lệnh) → bỏ lệnh (mặc định mọi loại) — đề xuất, chưa backtest
      maxRiskAtrByKind: { double_top: 4, double_bottom: 4 }, // trần R riêng cho hai đỉnh/hai đáy — người dùng chọn 19/10/2026, chưa backtest
      targetRatio: { asc_triangle: 0.7, double_bottom: 0.73, head_shoulders: 0.51 }, // p của Bulkowski: T_ngắn = đường phá ± h×p — đề xuất, chưa backtest
      defaultTargetRatio: 0.5, // p khi không có số liệu — đề xuất, chưa backtest
      flagPoleRatio: 0.46, // cờ: T_đủ = đáy cờ (Short: đỉnh cờ) ± cán × mức này — đề xuất, chưa backtest
      flagShortFraction: 0.5, // cờ: T_ngắn = đường phá ± mức này × (T_đủ − đường phá), tức nửa quãng còn lại tới T_đủ (đọc nguyên văn 'đáy cờ + nửa của cán×0,46' thường rơi vào trong cờ) — đề xuất, chưa backtest
      tp2NearAtr: 1, // TP2: vùng S/R trong ±mức này (×A) quanh T_đủ — đề xuất, chưa backtest
      minTp1R: 1, // TP1 ≥ mức này (R) sau phí khứ hồi + funding dự kiến — đề xuất, chưa backtest
      flagMinTp1R: 1.5, // cờ: TP1 ≥ 1,5R vì thất bại hòa vốn 44–45% — đề xuất, chưa backtest
      marketMaxAtr: 1, // d ≤ mức này (×A) → vào trực tiếp 100%. d đo từ giá đóng nến CUỐI (giá sẽ khớp market) tới đường phá tại nến cuối, không phải từ nến phá — đề xuất, chưa backtest
      splitMaxAtr: 2, // 1 < d ≤ mức này → 50% trực tiếp + 50% limit; > mức này → chỉ limit 50% — đề xuất, chưa backtest
      splitMarketPct: 50, // phần vào trực tiếp khi chia (% tổng khối lượng) — đề xuất, chưa backtest
      limitOnlyPct: 50, // d quá xa: chỉ đặt limit cho % này của khối lượng đủ — đề xuất, chưa backtest
      limitOffsetAtr: 0.25, // giá limit = đường phá ± mức này (×A), phía ngoài mô hình — đề xuất, chưa backtest
      limitExpiryBars: 10, // hủy limit sau số nến này (khung nhận diện) — đề xuất, chưa backtest
      waitRangeAtr1h: 3, // biên độ nến phá > mức này × ATR(1H) → chờ thêm 1 nến đóng — đề xuất, chưa backtest
      afterTp1NearAtr: 0.5, // giá vào cách đường phá < mức này (×A) → sau TP1 SL về đường phá ∓ afterTp1StopAtr — đề xuất, chưa backtest
      afterTp1StopAtr: 0.5, // khoảng lùi khỏi đường phá cho SL sau TP1 (×A), đúng ngưỡng failed — đề xuất, chưa backtest
      reversalShortBlockDays: 30, // Short hai đỉnh / vai-đầu-vai: không vào trực tiếp trong số ngày này sau khi BTC lấy lại SMA200 ngày — đề xuất, chưa backtest
    },
    // Khung và loại mô hình nhận diện theo chế độ (báo cáo mục (1)): Swing 4H đủ 4 loại, 1D hai đỉnh/hai đáy + tam giác;
    // Lướt nhanh chỉ GHI NHẬN (ẩn) trên 1H (chữ nhật, cờ, hai đỉnh/đáy làm bối cảnh) và 15m (chữ nhật, cờ) — đề xuất, chưa backtest
    frames: {
      swing: [{ tf: '4h', kinds: ['rectangle', 'double', 'triangle', 'flag'] }, { tf: '1d', kinds: ['double', 'triangle'] }],
      fast: [{ tf: '1h', kinds: ['rectangle', 'double', 'flag'] }, { tf: '15m', kinds: ['rectangle', 'flag'] }],
    },
    // Số nến tải thêm cho hợp đồng trong phạm vi mô hình (P-G1): 1H để đo ATR(1H) tại nến phá (Swing), 4H/1D cho bối cảnh (Lướt nhanh).
    // 1D 300 nến để EMA200 của vai-đầu-vai 1D có giá trị — đề xuất, chưa backtest
    fetchBars: { h1: 300, h4: 500, d1: 300 },
    minSideScore: 70, // tín hiệu mô hình cần điểm phía đó ≥ mức này — người dùng chọn giữ 70, 19/10/2026 (đề xuất, chưa backtest)
    maxSignalAgeBars: 10, // breakout/retested cũ hơn mức này (nến khung nhận diện) → signalStale, không lập kế hoạch lệnh — đề xuất, chưa backtest
    state: {
      confirmAtr: { '15m': 0.5, '1h': 0.5, '4h': 0.25, '1d': 0.25 }, // đóng cửa vượt đường phá ≥ mức này (×A) mới là phá vỡ; 0 đến mức này → breakout_pending — đề xuất, chưa backtest
      retestBars: 10, // số nến sau phá vỡ để chờ retest — đề xuất, chưa backtest
      retestAtr: 0.5, // râu nến chạm lại đường phá ±mức này (×A) tính là retest — đề xuất, chưa backtest
      failAtr: 0.5, // đóng cửa quay vào trong mô hình > mức này (×A) → failed — đề xuất, chưa backtest
      armedExpiryRatio: 0.5, // chữ nhật/hai đỉnh/vai-đầu-vai...: ở trạng thái armed > mức này × thời lượng mô hình → expired — đề xuất, chưa backtest
      triangleWindow: { min: 0.5, max: 0.8 }, // cửa sổ phá vỡ tam giác (tỷ lệ quãng từ đầu mô hình tới apex); phá ngoài cửa sổ chỉ ghi chú — đề xuất, chưa backtest
      volumeSmaPeriod: 20, // SMA volume để so nến phá vỡ — đề xuất, chưa backtest
      volumeMult: 1.5, // volume nến phá ≥ mức này × SMA → ghi chú 'dự kiến retest cao' — đề xuất, chưa backtest
    },
    coil: {
      bbPeriod: 20, // chu kỳ Bollinger — đề xuất, chưa backtest
      bbK: 2, // số độ lệch chuẩn — đề xuất, chưa backtest
      bbWindow: 125, // số nến xét phân vị BBW — đề xuất, chưa backtest
      bbPercentile: 10, // BBW ≤ phân vị này (%) — đề xuất, chưa backtest
      nrWide: 7, // NR7 — đề xuất, chưa backtest
      nrNarrow: 4, // NR4 — đề xuất, chưa backtest
      atrFast: 14, // ATR ngắn — đề xuất, chưa backtest
      atrSlow: 100, // ATR dài — đề xuất, chưa backtest
      atrRatioMax: 0.7, // ATR ngắn/ATR dài ≤ mức này — đề xuất, chưa backtest
      minHits: 2, // số chỉ báo (trong 3) cùng bật mới gắn cờ — đề xuất, chưa backtest
    },
  },
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
