# Coin Radar — Thiết kế

Ngày: 19/10/2026 · Cập nhật lần 2: 19/10/2026 (chuyển sang **Binance Futures**, Long + Short, hai chế độ
15m/1H và 4H/1D) · Trạng thái: **người dùng đã duyệt 19/10/2026** (bot: giai đoạn 2, làm sau)

## Mục tiêu

Web riêng giúp chủ dự án phân tích kỹ thuật **toàn bộ hợp đồng vĩnh cửu USDT trên Binance Futures**
(525 hợp đồng đang giao dịch, đo ngày 19/10/2026), với dữ liệu hiện trạng, để sàng lọc: coin nào đáng chú
ý theo hướng **Long hay Short**, rủi ro ra sao, kế hoạch lệnh và khối lượng thế nào, và tín hiệu đã
thắng/thua bao nhiêu.

Không phải mục tiêu:
- Không vẽ biểu đồ nến (người dùng xem trên Binance; web có nút mở đúng hợp đồng).
- Không đặt lệnh, không kết nối tài khoản, không cầm API key Binance.
- Không cảnh báo Telegram/email ở bản này.
- Không cam kết lợi nhuận. Mọi con số thắng/thua là thống kê, ghi rõ nguồn gốc.

## Tài liệu nguồn của bộ nguyên tắc

| Tài liệu | Vai trò |
|---|---|
| `reports/Bộ nguyên tắc phân tích coin.md` | Nghiên cứu: căn cứ từng nguyên tắc, 27 kịch bản biến động, bảng dữ liệu |
| `reports/Phản biện bộ nguyên tắc.md` | Phản biện độc lập: 24 lỗi (5 nghiêm trọng) và sửa đổi |
| `research_notes/Bộ nguyên tắc phân tích coin/` | 8 ghi chú gốc có nguồn |

Thiết kế đã áp dụng toàn bộ mục 5 của phản biện, điều chỉnh cho futures. Mọi ngưỡng số là **điểm khởi đầu
chưa backtest**, trừ khi ghi khác. Mỗi nguyên tắc có mã (`G-01`, `S-02`, `P-03`…) dùng chung cho máy chấm,
lý do chấm điểm của từng coin, và trang “Nguyên tắc” trên web.

## Quyết định đã chốt với người dùng

| Vấn đề | Quyết định |
|---|---|
| Sản phẩm giao dịch | **Chỉ futures, sàn Binance** (USDⓈ-M, hợp đồng vĩnh cửu USDT) |
| Hướng lệnh | **Long và Short** |
| Chế độ | **Lướt nhanh** (xu hướng 1H, vào lệnh 15m) và **Swing** (xu hướng 1D, vào lệnh 4H) |
| Lướt nhanh chạy ở đâu | **Trên trình duyệt** khi mở web (IP Việt Nam, không trễ) |
| Swing chạy ở đâu | ~~GitHub Actions~~ — **đổi 19/10/2026**: runner GitHub (Mỹ) bị Binance trả 451 (`docs/verification/probe-2026-10-19.md`). Swing tính **trên trình duyệt** khi mở web; ghi sổ 24/7 bằng **lịch chạy trên máy Ubuntu của người dùng** khi máy bật (IP Việt Nam) |
| Cắt lỗ quá rộng (19/10) | Không “Đạt tiêu chí” khi khoảng cắt lỗ > 2×ATR ngày **hoặc** > 20% giá vào (cổng G-11) |
| SL/TP theo vùng (19/10, kế hoạch 1b) | SL đặt sau vùng hỗ trợ (Long) / kháng cự (Short) đủ mạnh; TP1/TP2/TP3 đặt trước các vùng cản kế tiếp; chốt **50% / 30% / 20%**; **đạt TP1 thì dời SL về giá vào, sau TP2 giữ nguyên**; vùng nào không còn thì phần đó để trailing stop 3×ATR. Cổng **G-11 giữ nguyên**, thêm cổng **G-12** (kế hoạch theo vùng phải hợp lệ: có vùng đặt SL, TP1 đặt được và ≥ 1R). **Hợp đồng chỉ số (INDEX) bị loại** khỏi danh sách quét (525 → 523 hợp đồng) |
| Vào lệnh trực tiếp hay limit (19/10) | Giá cách mép vùng hỗ trợ ≤ 0,5×ATR → **VÀO TRỰC TIẾP**; xa hơn → **đặt limit chờ hồi** tại mép vùng + 0,1×ATR, hết hạn sau 8 nến 15m (2 giờ, Lướt nhanh) / 6 nến 4H (24 giờ, Swing) |
| Giá trong vùng (19/10, đợt 2) | **Không vào lệnh khi giá đang nằm trong một vùng** (vùng.thấp ≤ giá ≤ vùng.cao): kế hoạch không hợp lệ, lý do “Giá đang nằm trong vùng … — chờ giá thoát hẳn khỏi vùng”. Vùng đặt SL chỉ lấy vùng nằm hẳn một phía của giá (Long: vùng.cao < giá; Short: vùng.thấp > giá). Giá limit cũng không được nằm trong vùng |
| Bảng khối lượng theo giá khớp (19/10, đợt 2) | Lệnh vào trực tiếp in khối lượng cho 3 giá khớp (giá hiện tại / giữa / giá tối đa), cùng ngân sách rủi ro, chia 50/30/20 và tiền mất ước tính từng dòng. Dòng xấu nhất (giá tối đa) phải còn TP1 ≥ 1R, nếu không **hạ giá tối đa** về mức còn ≥ 1R. “Đạt TP1 → dời SL về đúng giá KHỚP THẬT”. Lệnh limit chỉ một dòng |
| Lệnh ngược xu hướng (19/10) | Chỉ khi điểm ≥ 80 **và** sức mạnh so BTC rõ ngược chiều (z ≤ −1,5 cho Short / ≥ +1,5 cho Long) **và** rủi ro không “Rất cao”; thiếu z → không cho. Lướt nhanh: bắt buộc cùng phía SMA200 1H của BTC, không ngoại lệ |
| Top 10% (19/10) | Chỉ xếp hạng trong các hợp đồng đã qua mọi cổng và điểm ≥ 70, tách Long/Short, theo nhóm thanh khoản (khuyến nghị của rà soát cuối) |
| Web | Độc lập, repo public `tienhoandhd-droid/coin-radar`, GitHub Pages |
| Ai xem | Chỉ admin đăng nhập; dữ liệu khóa RLS |
| Supabase | Dùng chung dự án Pháp Sư, bảng `coin_*`, không đụng bảng game |
| Biểu đồ nến | Không vẽ |
| Quyền | Đổi database (thêm bảng `coin_*`), tạo repo public, push — từng bước |

**Thay đổi so với đề xuất trước về Lướt nhanh:** vì Lướt nhanh chỉ ghi sổ khi web đang mở, chờ đủ 100 lệnh
thực tế mới hiện tín hiệu sẽ rất lâu. Thiết kế chọn: **hiện tín hiệu ngay với nhãn “thử nghiệm”**, rủi ro
rủi ro mỗi lệnh dùng chung mức 2% (người dùng chốt 19/10/2026 — thay mức 0,25% cũ của Lướt nhanh), và mọi tín hiệu đều ghi sổ. Người dùng có thể đổi sang “chỉ ghi sổ” trong
phần cài đặt.

## 1. Kiến trúc

```
            Binance Futures (fapi) — nến, taker, funding, OI, mark price, depth
                 │                                     │
   GitHub Actions (~15 phút, 24/7)               Trình duyệt người dùng (khi mở web)
   SWING: 1D + 4H, toàn bộ 525 hợp đồng          LƯỚT NHANH: 1H + 15m, ~150 hợp đồng
   + bối cảnh thị trường, đối chiếu sổ           thanh khoản nhất, tính lại mỗi 1 phút
                 │                                     │
                 ▼                                     ▼
        Supabase coin_* (RLS: chỉ admin) ◄── ghi sổ Lướt nhanh (admin, qua RLS)
                 │
                 ▼
        Web (Vite + React + TS, GitHub Pages)
```

**Cả hai nơi chạy cùng một `packages/core`**, nên cùng một dữ liệu luôn cho cùng một kết quả.

| Thư mục | Vai trò | Phụ thuộc |
|---|---|---|
| `packages/core/` | Hàm thuần TS: chỉ báo, chế độ thị trường, cổng, điểm Long/Short, cờ, kế hoạch lệnh futures, khối lượng/đòn bẩy/giá thanh lý, rủi ro, backtest, thống kê, **danh mục nguyên tắc** | Không có |
| `packages/binance/` | Gọi API Binance Futures (dùng `fetch`, chạy được cả Node lẫn trình duyệt), tôn trọng weight | `core` (kiểu dữ liệu) |
| `scanner/` | Swing nền: lấy dữ liệu, chấm, ghi Supabase qua `psql`. Bước quét là hàm `runScan` (`scanner/run-scan.ts`, không I/O mạng: nhận dữ liệu và hàm `klines`) — máy quét và phát lại/backtest gọi chung; `scan.ts` chỉ tải và in | `core`, `binance`, `psql` trên runner |
| `web/` | Giao diện + máy chấm Lướt nhanh chạy trong trình duyệt | `core`, `binance`, React, Vite, `@supabase/supabase-js` |
| `supabase/` | Migration bảng `coin_*`, script cài login `coin_scanner` | — |
| `data/events/` | Lịch sự kiện nhập tay (FOMC, CPI, BOJ…) JSON | — |

Thư viện web giống Pháp Sư: `react`, `react-dom`, `vite`, `typescript`, `@supabase/supabase-js`.
Không thêm thư viện biểu đồ.

## 2. Dữ liệu (Binance USDⓈ-M Futures)

Đã kiểm 19/10/2026 từ máy người dùng (không phải IP Mỹ): `fapi.binance.com` trả 200 và cho phép trình
duyệt gọi thẳng (`access-control-allow-origin: *`); nến futures có 12 cột, gồm **taker buy volume**.

| Nhóm | Endpoint | Dùng cho |
|---|---|---|
| Danh sách hợp đồng | `/fapi/v1/exchangeInfo` (lọc PERPETUAL, USDT, TRADING; lấy tick size, step size, ngày niêm yết; **B0b/I2**: thêm LOT_SIZE minQty/maxQty, MARKET_LOT_SIZE minQty/maxQty/stepSize, MIN_NOTIONAL (khóa `notional`), MAX_NUM_ORDERS (`limit`), `deliveryDate` — thiếu là ném lỗi) | Cả hai |
| Nến + taker | `/fapi/v1/klines` — Swing: 1D × 300, 4H × 500; Lướt nhanh: 1H × 500, 15m × 500 | Cả hai |
| 24h, spread | `/fapi/v1/ticker/24hr`, `/fapi/v1/ticker/bookTicker` (toàn bộ, 1 lệnh) | Thanh khoản |
| Funding, mark price | `/fapi/v1/premiumIndex` (toàn bộ, 1 lệnh), `/fapi/v1/fundingInfo` (chu kỳ funding từng mã) | Chi phí giữ lệnh, cắt lỗ theo mark |
| OI, long/short, taker | `/fapi/v1/openInterest`, `/futures/data/openInterestHist`, `globalLongShortAccountRatio`, `takerlongshortRatio` (Binance chỉ giữ 30 ngày → **tự lưu** vào `coin_market_history`) | Cờ phái sinh |
| Bậc ký quỹ | `/fapi/v1/leverageBracket` **cần API key** → máy quét không dùng. **B0b/I7**: MMR và đòn bẩy tối đa lấy theo bậc của notional (`margin.ts` `marginTier(notional, brackets?)`); chưa có key thì dùng bảng `COMMON.margin.defaultBrackets` — **GIẢ ĐỊNH THẬN TRỌNG, không phải số Binance** (rà soát B0b: với mỗi notional chọn MMR ≥ bậc cao thường gặp của altcoin thanh khoản thấp: ≤ 5k 2,5%/20×, ≤ 25k 5%/10×, ≤ 100k 10%/5×, ≤ 250k 12,5%/4×, ≤ 1M 25%/2×, ≤ 3M 50%/1×; lớn hơn → không mở). Bậc thật (đúng dạng `leverageBracket`, `parseLeverageBrackets`) đi qua `ScanInput.leverageBrackets` (theo mã) → `AnalyzeInput.leverageBrackets` → kế hoạch và G-08; có bảng mà thiếu mã → G-08 trượt. Bản in ghi “bậc ký quỹ: giả định” hoặc “leverageBracket”. Giá thanh lý vẫn là công thức gần đúng, ghi rõ “ước tính” | Kế hoạch lệnh, G-08 |
| Độ sâu | `/fapi/v1/depth?limit=100` chỉ cho coin đang đạt tiêu chí hoặc đang có lệnh | Độ dày vùng cản |
| Vốn hóa, ngành, FDV | CoinGecko `/coins/markets` (Demo key), mỗi giờ, ghép theo ký hiệu | Rủi ro, nhóm ngành |
| Bối cảnh | Coinbase premium, Fear & Greed, DefiLlama stablecoin, SMA200 tuần BTC | Bối cảnh, cờ |
| Sự kiện | `data/events/*.json`: FOMC, CPI, BOJ; đáo hạn quyền chọn quý (tự tính) | Cổng sự kiện |

Phí giao dịch và trượt giá là **tham số cấu hình**, giá trị mặc định lấy từ trang phí chính thức của
Binance lúc triển khai (chưa tra — không đoán). **B0b/I7:** cộng thêm trượt giá theo cỡ lệnh =
`COMMON.slippage.pctPerParticipation` × notional ÷ khối lượng giao dịch 1 phút (ước bằng TB `quoteVolume` 24 nến 1H ÷ 60;
thiếu → lỗi, không coi là 0). Kế hoạch lập hai lần: lần đầu ra notional, lần hai cộng trượt giá của notional đó
(`TradePlan.costPct`/`PatternPlan.costPct`). Notional bị giới hạn ≤ `maxParticipation` × khối lượng 1 phút trong
`portfolio.canOpen`. Các hệ số là đề xuất, chưa backtest.

Quy tắc dữ liệu:
- Chỉ dùng **nến đã đóng** cho quyết định.
- Nguồn lỗi → coin hiện “dữ liệu cũ”, không tạo tín hiệu. **B0b/I3 (đã làm):** `runScan` kiểm chuỗi nến khung xu hướng và
  khung vào lệnh, và (rà soát B0b) MỌI chuỗi khác của mã — Swing 1H, Lướt nhanh 1D, 4H mô hình (`candles.ts` `candleProblems`): nến cuối đóng trước thời điểm quét quá 1 khung + `COMMON.data.staleToleranceMinutes`
  (5 phút) → “dữ liệu cũ”; thiếu nến giữa chuỗi; nến trùng/sai thứ tự → ghi lỗi theo mã, không chấm. Nến BTC hỏng → dừng cả lần quét.
- **Giá hiện tại của kế hoạch = giá mark** (`premiumIndex.markPrice`) lúc quét (B0b/I3), cho cả lệnh vùng và lệnh mô hình — không
  dùng giá đóng nến (có thể cũ tới 1 khung). Bot phải lấy lại giá mark ngay trước khi gửi lệnh.
- Hợp đồng dạng `1000PEPEUSDT` (nhân 1000) → ghép CoinGecko đúng hệ số; kiểm chéo giá lệch > 5% → không chấm.
- Phát hiện chuỗi giá gãy (đổi ticker, gộp hợp đồng) và nến dị thường.

**Rủi ro lớn nhất, kiểm đầu tiên:** runner GitHub đặt ở Mỹ; Binance được báo là trả **451** cho IP Mỹ/máy
chủ đám mây. Nếu bị chặn:
1. Phương án chính: chạy máy quét Swing **cũng trong trình duyệt** (giống Lướt nhanh) + GitHub chỉ còn
   làm việc đối chiếu sổ bằng nguồn không bị chặn; hoặc
2. Máy/VPS luôn bật ở châu Á (có chi phí) — người dùng quyết định khi có kết quả kiểm.
Không dùng VPN/proxy để lách chặn (có thể vi phạm điều khoản Binance).

## 3. Bộ nguyên tắc chấm điểm

### 3.1 Khung thời gian

| | Lướt nhanh | Swing |
|---|---|---|
| Khung xu hướng | 1H | 1D |
| Khung vào lệnh | 15m | 4H |
| ATR dùng cho lệnh | ATR(14) 15m | ATR(14) 4H, kiểm thêm ATR(14) 1D |
| Hạn chưa đạt +1R | 8 giờ | 7 ngày |
| Trần giữ lệnh | 24 giờ | 21 ngày |
| Phạm vi | ~150 hợp đồng thanh khoản nhất | Toàn bộ 525 |
| Nhãn | “thử nghiệm” | — |

### 3.2 Chế độ thị trường (Lên / Đi ngang / Xuống)

- **SMA200 ngày của BTC** có vùng đệm ±2% hoặc xác nhận 2 nến 1D.
- Lên: trên SMA200 và SMA50 > SMA200. Xuống: dưới SMA200 và giảm > 20% từ đỉnh. Còn lại: Đi ngang.
- **Lên** → chỉ Long (Short chỉ khi coin rất yếu so BTC và điểm Short ≥ 80).
  **Xuống** → chỉ Short (Long tương tự, ngưỡng 80). **Đi ngang** → cả hai, trần lệnh giảm.
- Lướt nhanh thêm bộ lọc phụ: SMA200 nến 1H của BTC cùng chiều với lệnh.
- **Cầu dao biến động:** BTC biến động ±4% trong 4H, hoặc biên độ nến 1H > 3×ATR1H → dừng tín hiệu mới
  12h (Swing) / 3h (Lướt nhanh).

### 3.3 Tầng 1 — Cổng loại trừ

| Mã | Cổng |
|---|---|
| G-01 | Hướng lệnh được phép theo chế độ thị trường; cầu dao không bật |
| G-02 | Đủ dữ liệu: ≥ 250 nến khởi động; độ phủ dữ liệu ≥ 70% |
| G-03 | Thanh khoản tối thiểu (khối lượng 24h) + spread tối đa — ngưỡng tự hiệu chỉnh theo phân bố thật |
| G-04 | Không đang bị bơm/xả: biến động > 15%/1H kèm z-score khối lượng > 5. **Thiếu dữ liệu 1H (biến động hoặc z = NaN) → trượt** (B0b/I4) |
| G-05 | Hợp đồng niêm yết < 30 ngày: không vào Lướt nhanh; rủi ro tối thiểu “Cao” |
| G-06 | Không hack 7 ngày, không có thông báo hủy niêm yết/đóng hợp đồng, stablecoin không lệch neo. **B0b/I4:** hiện chỉ kiểm được `deliveryDate` — hợp đồng vĩnh cửu có ngày tất toán trước 2100 (`COMMON.perpetualDeliveryFloor`) → trượt (quan sát exchangeInfo 19/10/2026: 523/525 = 2100-12-25; EPICUSDT, VELODROMEUSDT có ngày thật; chưa có câu chữ tài liệu Binance xác nhận). Phần hack/hủy niêm yết/lệch neo **chưa đánh giá**, in rõ ở đầu bản in |
| G-07 | Lướt nhanh: ngoài cửa sổ FOMC (−4h/+2h), CPI (±2h), BOJ; cả hai chế độ: cờ ±24h đáo hạn quyền chọn quý. **B0b/I4:** lịch `data/events/events.json` đã qua sự kiện cuối (hoặc rỗng) → G-07 trượt với mọi mã; còn < 14 ngày → cảnh báo `!!!` ở đầu bản in; đọc file sai định dạng → lỗi |
| G-08 | **Giá thanh lý ước tính nằm xa hơn cắt lỗ ≥ 1 lần khoảng cắt lỗ** (P-04). **B0b/I4:** tính theo MMR của bậc ký quỹ của notional (`gates.liquidationCheck`) ở đòn bẩy sẽ dùng = min(trần chế độ, trần bậc, đòn bẩy an toàn); notional vượt bậc cuối → trượt |
| G-09 | **Funding cùng chiều lệnh không cực đoan**: Long khi funding quá dương / Short khi funding quá âm (z-score so 30 ngày) → chặn |
| G-10 | Không còn < 30 phút tới mốc thanh toán funding nếu funding bất lợi cho lệnh (Lướt nhanh) |

### 3.4 Tầng 2 — Điểm 0–100 (tính riêng cho Long và cho Short; Short là đối xứng của Long)

| Mã | Thành phần | Lướt nhanh | Swing |
|---|---|---|---|
| S-01 | **Đà giá**: xu hướng (giá/SMA20–50 khung xu hướng; thứ tự EMA phụ) + sức mạnh tương đối so BTC (Swing 7–21 ngày; Lướt nhanh 24–72 giờ) chia biến động + RSI so 50 / MACD histogram | 55 | 70 |
| S-02 | **Dòng tiền**: mất cân bằng taker (Lướt nhanh 4–12 × 1H, **bỏ 30 phút gần nhất**; Swing 7 × 1D / 30 × 4H) + khối lượng bất thường cùng chiều + OI tăng cùng chiều giá | 25 | 15 |
| S-03 | **Đường đi**: chốt lời 1 có nằm trước vùng cản dày không (pivot đã xác nhận, số tròn, số lần bật, độ sâu sổ lệnh nếu có) | 20 | 15 |

- Điểm chuẩn hóa theo trọng số có dữ liệu; hiện “độ phủ dữ liệu %”.
- Coin thanh khoản thấp: không thưởng tăng/giảm mạnh 24h (coin nhỏ hay đảo chiều).
- Short: không thưởng “đã giảm rất sâu” ở coin nhỏ (dễ bị short squeeze — giá bật mạnh do phe short bị
  thanh lý dây chuyền).
- Bỏ hẳn: Bollinger dưới/trên để bắt đáy/đỉnh, RSI 30/70, “khối lượng > TB20” đơn thuần.

### 3.5 Tầng 3 — Điểm trừ và cờ (chỉ trừ, không cộng)

| Mã | Điều chỉnh | Lướt nhanh | Swing |
|---|---|---|---|
| F-01 | Funding/basis quá nhiệt **cùng chiều lệnh** (chưa tới mức chặn G-09) | −10 | −10 |
| F-02 | OI/vốn hóa cao bất thường (đòn bẩy toàn thị trường coin đó cao, dễ thanh lý dây chuyền) | −5 | −5 |
| F-03 | Tỉ lệ long/short tài khoản lệch mạnh cùng chiều lệnh (đám đông cùng phía) | cờ | cờ |
| F-04 | Mở khóa token lớn trong 30 ngày (nếu có dữ liệu) | cờ | −10 (Long) |
| F-05 | Fear & Greed ≥ 80 (Long) / ≤ 20 (Short); niêm yết sàn lớn 72h; khối lượng bất thường kéo dài | cờ | cờ |
| F-06 | BTC dominance, USDT.D, ngành, Coinbase premium, Kimchi premium | chỉ hiển thị | chỉ hiển thị |

### 3.6 Quyết định tín hiệu

- **Chỉ quyết định khi nến khung vào lệnh đóng** (15m / 4H); giữa hai nến chỉ cập nhật giá và cờ.
- **“Đạt tiêu chí Long” / “Đạt tiêu chí Short”** = qua mọi cổng + điểm ≥ 70 + top 10% thứ hạng trong nhóm
  thanh khoản.
- **Hysteresis**: vào ≥ 70, rời < 60. Mỗi hợp đồng × chế độ một tín hiệu mở; không đảo chiều Long↔Short
  ngay — chờ 1 nến khung xu hướng. **B0b/I5 (đã làm phần vào/rời và định danh):** `signal.ts` (thuần) —
  `zoneQualifies` (tín hiệu vùng cùng chiều đang mở → giữ tới khi điểm < `COMMON.exitScore` 60), `zoneSignalId` =
  `mã|chế độ|chiều|zone|openTime nến vào lệnh|SL`, `signalIdentity` (đã có trong trạng thái → giữ id cũ, không “MỚI”).
  Trạng thái lần trước do nơi gọi giữ (`AnalyzeInput.prevSignal`, `ScanInput.prevSignals`): máy quét không giữ → như cũ;
  bot/backtest truyền vào và khử trùng theo id. Tín hiệu đang giữ không bị hạ nhãn vì top 10%. **Rà soát B0b:** hysteresis xét chiều ĐANG GIỮ trước
  (`chooseZoneSide`: giữ khi ≥ 60 và qua cổng, dù chiều kia điểm cao hơn). Luật đảo chiều (`flipAllowed`): chiều ngược chỉ phát
  khi tín hiệu cũ đã kết thúc (`SignalState.endedAt`, cập nhật bằng `advanceSignalState`) và đã đóng trọn 1 nến khung xu hướng
  mở từ lúc kết thúc; tín hiệu cũ còn mở → chặn, ghi cờ “Chặn đảo chiều”.
- Nhãn: **Đạt tiêu chí Long / Đạt tiêu chí Short / Theo dõi / Không đạt**; ghi “điểm xếp hạng, không phải
  xác suất thắng”.

### 3.7 Quản lý vốn và đòn bẩy

| Mã | Nguyên tắc |
|---|---|
| P-01 | Người dùng nhập **vốn futures**; **rủi ro mỗi lệnh = 2% vốn bot** (`COMMON.risk.perTradePct`, người dùng chốt 19/10/2026, cho cả Swing và Lướt nhanh). **Bỏ phân tầng 0,5%/0,25%** (trước đây Swing 0,5%; Lướt nhanh hoặc coin rủi ro Cao/Rất cao 0,25%). Mức rủi ro coin (Thấp…Rất cao) chỉ còn để hiển thị và lọc Hạng A. Kế hoạch in rõ số tiền rủi ro (vốn × 2%) |
| P-02 | **Khối lượng = (vốn × % rủi ro) ÷ khoảng cách cắt lỗ** (đã cộng phí + trượt giá). Làm tròn theo step size của hợp đồng |
| P-03 | **Đòn bẩy chỉ là hệ quả**: đòn bẩy cần = giá trị vị thế ÷ ký quỹ dự định. App hiện đòn bẩy tối thiểu cần dùng; **trần đòn bẩy gợi ý: Swing 5×, Lướt nhanh 10×** (đề xuất). Khuyên chế độ **isolated** |
| P-04 | **Giá thanh lý ước tính phải xa hơn cắt lỗ ≥ 1 khoảng cắt lỗ**; không đạt → không đưa kế hoạch (G-08). Ghi rõ công thức gần đúng, người dùng đối chiếu trên Binance |
| P-05 | **Trần danh mục: tối đa 10 lệnh còn rủi ro cùng lúc VÀ tổng rủi ro đang mở ≤ 10% vốn** (lệnh đã qua TP1 tính rủi ro 0 và KHÔNG tính vào trần 10 lệnh — “kèo không rủi ro”, người dùng chốt 19/10/2026; vẫn tính ký quỹ và MAX_NUM_ORDERS của sàn) (`COMMON.portfolio.maxOpenTrades` / `maxOpenRiskPct`, người dùng chốt 19/10/2026 sau đánh giá độc lập C1). **Kiểm ký quỹ (C3):** tổng ký quỹ (notional ÷ đòn bẩy) các lệnh mở + lệnh mới ≤ vốn × `marginSafetyFactor` (0,8, đề xuất). Hàm thuần `portfolio.canOpen(lệnh mới, lệnh đang mở, vốn)` dùng chung cho máy quét (danh mục trống → chỉ thông tin, dòng “Danh mục/ký quỹ”), bộ mô phỏng kế hoạch 2 và bot: không đủ chỗ thì **giảm khối lượng tới mức tối đa cho phép** (in rõ rủi ro thực < 2%) hoặc bỏ; khối lượng sau giảm phải qua bộ lọc sàn; cùng hợp đồng đang mở → không mở thêm. Trần đòn bẩy giữ nguyên |
| P-06 | Đủ 10 lệnh còn rủi ro thì **không vào lệnh mới** (không còn xếp hạng “ưu tiên” khi vượt trần) |
| P-07 | **Chi phí funding dự kiến** cho thời gian giữ lệnh được trừ vào R kỳ vọng |

### 3.8 Kế hoạch lệnh (Long; Short đối xứng)

Kế hoạch dựa trên **vùng hỗ trợ/kháng cự** (`packages/core/zones.ts`) và chỉ lập cho hợp đồng có nhãn “Đạt tiêu chí”. Mọi ngưỡng ở `COMMON.zones` trong `packages/core/config.ts`, đề xuất, chưa backtest.

**Dựng vùng.** Lấy đỉnh/đáy đã xác nhận (pivot, 3 nến mỗi bên) của khung vào lệnh (trọng số 1) và khung xu hướng (trọng số 2); gộp các mức cách nhau ≤ 0,5×ATR khung vào lệnh, một vùng rộng tối đa 1,5×ATR. Độ mạnh = tổng trọng số + 0,5 nếu vùng chứa số tròn + 1 nếu vùng thuộc nhóm 25% khối lượng giao dịch cao nhất.

| Mục | Quy tắc (cả Lướt nhanh và Swing) |
|---|---|
| Giá trong vùng (đợt 2) | Giá hiện tại nằm trong bất kỳ vùng nào (kể cả đúng mép) → **không vào lệnh**: kế hoạch không hợp lệ (G-12 trượt), lý do “Giá đang nằm trong vùng … — chờ giá thoát hẳn khỏi vùng”. Kế hoạch limit mà giá limit nằm trong một vùng cũng không hợp lệ |
| Mức kích hoạt | **Theo mark price** (giá Binance dùng để thanh lý) |
| Vùng đặt SL | Vùng hỗ trợ (Long) / kháng cự (Short) gần nhất có độ mạnh ≥ 2. Chỉ xét vùng nằm **hẳn** một phía của giá (Long: vùng.cao < giá; Short: vùng.thấp > giá); vùng đang chứa giá không được dùng. Không có vùng đủ mạnh → kế hoạch không hợp lệ (G-12 trượt) |
| Kiểu vào lệnh | Giá cách mép vùng ≤ 0,5×ATR → **VÀO TRỰC TIẾP** (giá vào = giá đóng nến gần nhất; không mua cao hơn / bán thấp hơn giá đóng quá `maxEntryAtr`×ATR của chế độ). Xa hơn → **ĐẶT LIMIT** tại mép vùng ± 0,1×ATR, hết hạn sau 8 nến 15m (2 giờ) / 6 nến 4H (24 giờ), hoặc hủy nếu giá chạm TP1 trước |
| Giá vào dùng để tính | Giá hiện tại nếu vào trực tiếp; giá limit nếu đặt limit. SL, R, khối lượng, thanh lý đều tính từ giá này |
| Cắt lỗ | Ngoài mép xa của vùng 0,3×ATR; Swing không chặt hơn 1×ATR ngày; sát số tròn → đẩy qua số tròn. Khoảng cắt lỗ vẫn chịu cổng G-11 (≤ 2×ATR ngày và ≤ 20% giá vào) |
| Chính sách thoát (B0, người dùng chốt 19/10/2026) | `ExitPolicy` (`packages/core/exit.ts`), id khớp ma trận kế hoạch 2: **`A0`** = TP1/TP2/TP3 cố định 50/30/20 + dời SL (luật cũ); **`C2`** (mặc định, `COMMON.exit.defaultPolicy`) = TP1 chốt 50%, 50% còn lại là **trailing stop trên sàn** kích hoạt tại TP1. Kế hoạch vẫn tính TP1/TP2/TP3 (TP2/TP3 chỉ để tham khảo và đối chứng). Thông số trailing của C2: `activatePrice` = TP1; `callbackRate` = min(khoảng lùi ATR = trailAtrMult×ATR tính bằng % của TP1; mức bảo đảm không lỗ = (TP1 − (giá vào + phí khứ hồi/đơn vị))/TP1 × 100 cho Long, đối xứng cho Short), kẹp trong [0,1; 10]% theo `docs/reference/binance-usdm-api.md`, rồi **làm tròn XUỐNG 0,01%** (`floorPct`, dùng chung cho in và bot). Mức bảo đảm tính tại **giá khớp xấu nhất cho phép** (Long: giá tối đa; Short: giá thấp nhất; limit: giá limit; chia 2 chân: chân xấu hơn). C2 chỉ đòi TP1 và phần trailing mỗi phần ≥ 1 bước khối lượng (TP2/TP3 không đặt lệnh nên không cần chia được); A0 giữ kiểm tra 50/30/20. % chốt TP1 lấy từ `COMMON.zones.exitPcts[0]`. Mức dừng lúc kích hoạt = TP1 × (1 ∓ callback). Mức bảo đảm < 0,1% → cờ `needsBreakevenFloor` (bot phải giữ thêm lệnh dừng hòa vốn). Bot tính lại bằng giá khớp thật. Hạng A tiêu chí 4 (TP1 ≥ 1,5R) không đổi |
| Chốt lời (A0 và mức tham khảo) | TP1/TP2/TP3 = trước mép vùng cản kế tiếp 0,2×ATR, chốt **50% / 30% / 20%** vị thế (A0). Hết vùng cản → phần còn lại để **trailing stop 3×ATR** (giá TP = null). TP1 phải ≥ 1R, nếu không bỏ lệnh (G-12). Vùng cản sát ngay giá vào, không còn chỗ đặt TP1 → bỏ lệnh |
| Bảng khối lượng theo giá khớp (đợt 2) | Lệnh vào trực tiếp: 3 dòng — giá hiện tại, giữa (làm tròn tick), giá tối đa. Mỗi dòng: khối lượng = ngân sách rủi ro ÷ (\|giá khớp − SL\| + phí), làm tròn xuống theo stepSize, chia 50/30/20 theo từng TP, kèm tiền mất ước tính (`TradePlan.fillTable`). Giá tối đa bị hạ (Long) / nâng (Short) nếu ở đó TP1 < 1R: f ≤ (TP1 + 1×SL)/2 (Long), f ≥ (TP1 + 1×SL)/2 (Short), làm tròn về phía an toàn; `entryReason` ghi rõ. Lệnh limit: một dòng ở giá limit |
| Sau khi chốt (A0; với C2 trailing trên sàn thay SL cho phần còn lại) | **Đạt TP1 → dời SL về đúng giá KHỚP THẬT của người dùng; sau TP2 SL vẫn ở giá đó** |
| Điểm S-03 (đường đi) | TP1 = 1R → 0 điểm, ≥ 2R → đủ; không có vùng cản phía trước → đủ điểm; TP1 bị chặn/kế hoạch không hợp lệ → 0 điểm, lý do ghi lý do của kế hoạch |
| Dừng theo thời gian | Lướt nhanh: chưa +1R sau 8h, trần 24h. Swing: chưa +1R sau 7 ngày, trần 21 ngày |

Cổng liên quan: **G-11 giữ nguyên** (cắt lỗ không quá rộng); **G-12 mới** (kế hoạch theo vùng hợp lệ: có vùng đặt SL, TP1 đặt được và ≥ 1R). Hợp đồng chỉ số (INDEX) không phải coin giao dịch thật nên bị loại ngay khi đọc `exchangeInfo`.

Giá in ra console theo `tickSize` của từng hợp đồng, dấu phẩy thập phân.

**Bộ lọc sàn (B0b/I2):** `filters.ts` kiểm mọi dòng bảng khối lượng theo giá khớp: lệnh vào market theo MARKET_LOT_SIZE
(minQty, maxQty — vượt là lỗi −4005, stepSize), lệnh limit theo LOT_SIZE, giá trị lệnh vào ≥ MIN_NOTIONAL (−4164);
phần thoát (TP1, trailing — reduce-only, miễn MIN_NOTIONAL) ≥ minQty và ≤ MARKET_LOT_SIZE.maxQty; số lệnh cần (vào + SL +
thoát) ≤ MAX_NUM_ORDERS. Vi phạm → kế hoạch không hợp lệ (G-12) kèm lý do; kế hoạch mô hình bị bỏ kèm ghi chú.

**Lệnh đang mở gặp kịch bản xấu** (cầu dao, đổi chế độ thị trường, funding đảo chiều cực đoan, hack, lệch neo,
thông báo hủy hợp đồng…): mỗi kịch bản có hành động cho lệnh đang mở — thoát / giảm / siết cắt lỗ.

### 3.9 Mức rủi ro

Thấp / Vừa / Cao / Rất cao từ: ATR% khung ngày (mốc khởi đầu ≤ 4% / 4–6% / 6–10% / > 10%, tự hiệu chỉnh),
thanh khoản và spread, sụt giảm lớn nhất 90 ngày, tuổi hợp đồng, MC/FDV, beta với BTC, OI/vốn hóa, độ biến
động của funding.

### 3.10 Kịch bản biến động

27 kịch bản trong báo cáo + 9 kịch bản bổ sung từ phản biện + kịch bản riêng futures: **thanh lý dây chuyền**,
**short squeeze**, **funding đảo chiều cực đoan**, **Binance đổi đòn bẩy tối đa / ký quỹ của hợp đồng**,
**hủy hợp đồng (delist)**, **giá mark lệch giá cuối bất thường**. Mỗi kịch bản trong `core` có: mã, dấu hiệu
nhận biết bằng dữ liệu (nếu tự phát hiện được), hành động với tín hiệu mới, hành động với lệnh đang mở, mức
căn cứ.

### 3.11 Mô hình biểu đồ (kế hoạch 1c, nguồn `reports/Mô hình biểu đồ cho BTC.md`)

Mô hình **lọc lệnh và bổ sung tín hiệu**, không thay hệ vùng S/R. Mọi ngưỡng ở `COMMON.patterns` (`packages/core/config.ts`), đề xuất, chưa backtest. Mã cổng/nguyên tắc trong `packages/core/rules.ts`.

| Mã | Quy tắc |
|---|---|
| P-G1 | Chỉ chạy mô hình (tín hiệu **và** bối cảnh) cho hợp đồng rủi ro **Thấp/Vừa** VÀ hạng thanh khoản ≤ `costTierRank.high` (nhóm cao). Máy quét tính mức rủi ro trước, chỉ hợp đồng trong phạm vi mới tải thêm nến (Swing: 300 nến 1H; Lướt nhanh: 500 nến 4H; 1D luôn 300 nến) |
| Khung | Swing: 4H chữ nhật, hai đỉnh/hai đáy (bối cảnh), tam giác, cờ; 1D hai đỉnh/hai đáy (bối cảnh), tam giác. Lướt nhanh: 1H chữ nhật, hai đỉnh/đáy, cờ; 15m chữ nhật, cờ — **chỉ ghi nhận (ẩn), không bao giờ phát nhãn “Đạt” từ mô hình** |
| Theo dõi | Mỗi khung: chạy bộ nhận diện trên nến đã đóng (`isClosed`: `closeTime < t`); id = mã \| khung \| loại \| **openTime** nến của 2 pivot đầu (ổn định khi cửa sổ nến trượt giữa các lần quét); `asOf` chỉ cắt mảng về tiền tố rồi tính lại (không lọc mảng dài hơn — pivot có thể bị pivot tương lai thay); cùng id — bản phát sau thay bản trước khi bản trước còn forming/armed/expired lúc bản sau được biết, đóng băng khi đã chờ xác nhận/phá/failed/invalidated; tính trạng thái tại nến cuối; khử trùng mỗi (họ mô hình, khung) — họ: tam giác tăng/giảm/cân, cờ tăng/giảm, hai đỉnh/đáy; ưu tiên trạng thái → nhiều chạm → mới hơn. Tam giác phân loại có dải đệm ±0,01×A/nến quanh ngưỡng phẳng. In các mô hình chưa kết thúc và chưa cũ (forming / armed / chờ xác nhận / breakout / retested). Sau phá: **mức phá cố định** = giá trị đường phá tại nến phá (`breakoutLevel`, một hàm cho máy trạng thái và kế hoạch) — failed (đóng quay vào > 0,5×A), retest, d, giá limit, SL sau TP1 đều đo từ mức này; đường nghiêng không kéo dài sau nến phá. Trạng thái kết thúc mới **target_hit**: nến sau nến phá chạm T_ngắn (`patternTargets` từ mức phá cố định, cùng hàm với kế hoạch) → không lập lệnh mới cho lần phá đó |
| P-G2 | Swing: chữ nhật/cờ/tam giác chỉ phá **cùng chiều xu hướng 1D** (đủ 3 điều kiện S-01: giá/SMA20, giá/SMA50, SMA20/SMA50); tam giác cân phá xuống khi thị trường Lên → không Short |
| P-C1 | Bối cảnh (vai-đầu-vai 4H/1D đã xác nhận; **hai đỉnh/hai đáy 4H/1D đã phá cổ, trong `hs.activeBars` = 60 nến kể từ nến phá — hai đỉnh chặn Long, hai đáy chặn Short** (người dùng chọn 19/10/2026: hai đỉnh/hai đáy chỉ là bối cảnh, không lập lệnh); vùng nhiều tháng 1D) chặn Long/Short **mới** cho mọi tín hiệu (vùng và mô hình) của hợp đồng trong phạm vi. Vai-đầu-vai 4H và 1D đã xác nhận ngược nhau → chặn cả hai chiều, ghi “xung đột bối cảnh” |
| P-C2 | Coil (nén biến động) chỉ là cờ báo |
| P-S1 | Tín hiệu mô hình chỉ khi trạng thái breakout/retested chưa cũ (tam giác phá ngoài cửa sổ 50–80% → không), qua P-G2, kế hoạch mô hình hợp lệ (mục (2)–(4) báo cáo: SL = mức mô hình ∓ 0,5×A(nến phá) — chữ nhật: pivot nhỏ phía trong sau lần chạm cuối của biên bị phá, cách biên ≥ 0,5×A, không có thì giữa vùng; **cùng một hàm `patternStopLevel` cho kế hoạch và cho máy trạng thái (failed khi chạm mức này)**, kế hoạch chỉ đẩy SL ra xa hơn (tick, số tròn); R ≤ 3×A; TP1 ≥ 1R sau phí — cờ 1,5R), qua **đủ các cổng hiện có** G-01…G-12 tính bằng số của kế hoạch mô hình, P-C1, và điểm phía đó ≥ `minSideScore` = 70 (người dùng chọn giữ) |
| Một tín hiệu | Mỗi hợp đồng × chế độ một tín hiệu: vùng và mô hình cùng chiều → dùng kế hoạch mô hình (ghi chú); ngược chiều → không phát cả hai, ghi “xung đột”. Nhiều mô hình đủ điều kiện cùng chiều → chọn TP1 (R sau phí) cao nhất; ngược chiều → không phát |
| Giá hiện tại | Giá đóng nến **đã đóng gần nhất của khung vào lệnh** (Swing 4H, Lướt nhanh 15m) — kể cả mô hình 1D (nến ngày cuối có thể cũ tới 24 giờ); in kèm khung và thời điểm |
| Kiểu vào lệnh mô hình | d (từ mức phá cố định) ≤ 1×A vào trực tiếp 100%; 1–2×A chia 2 chân 50% market + 50% limit tại mức phá ± 0,25×A; > 2×A chỉ limit 50% khối lượng; limit hủy sau 10 nến hoặc khi chạm TP1 trước. Giá limit phải nằm giữa mức phá và giá hiện tại (Long: mức phá ≤ limit ≤ giá; Short đối xứng), không thì bỏ lệnh. Chân market chỉ vào trong dải [mức phá; giá tối đa] (Short đối xứng), ngoài dải bỏ lệnh |
| TP1 sau phí | Tính ở giá khớp **xấu nhất cho phép**: market = giá tối đa; limit = giá limit; chia chân = tệ hơn của “chỉ khớp market ở giá tối đa” và “khớp cả hai”. Lệnh vùng: market = giá tối đa, limit = giá limit. Dùng cho dòng in và Hạng A tiêu chí 4 |
| Độ mới | Tín hiệu mô hình **MỚI** chỉ ở lần quét mà nến phá (hoặc nến phá + 1 khi phải chờ thêm 1 nến) là nến đóng cuối; các lần quét sau chỉ in “đã phát lúc …, còn hạn n nến”, `--show-old` để in lại kế hoạch. Kế hoạch mang `patternId`, `breakoutTime`, `firstSignalTime` để bot/backtest nhận ra cùng một lần phá |
| Sau TP1 (lệnh mô hình) | Giá khớp cách mức phá < 0,5×A → SL về mức phá ∓ 0,5×A (không nới quá SL gốc); xa hơn → SL về đúng giá khớp thật. Lệnh chia 2 chân in luật cho cả “khớp cả hai” và “chỉ khớp chân market” |
| In | Khối “Mô hình đang theo dõi” (loại, khung, trạng thái, đường phá hoặc hai biên, chiều cao, ghi chú P-G2 / lý do kế hoạch) cho mọi hợp đồng trong phạm vi; kế hoạch mô hình in từng chân, khối lượng mỗi chân, TP theo hai trường hợp khớp, dòng “Sau TP1 → SL về …” |

Ngoài phạm vi 1c: cốc-tay cầm, mô hình thất bại (busted), ảnh chụp/lưu trạng thái (kế hoạch 3), điều kiện OI giảm mạnh ở nến phá, backtest (kế hoạch 2), kiểm tra “kháng cự dày giữa đường” bằng sổ lệnh.

### 3.12 Hạng A / Hạng B (Task 8, người dùng yêu cầu 19/10/2026)

Người dùng: “Tôi cần điểm vào đẹp, khả năng xu hướng tốt, tỉ lệ thắng cao. Có thể ít lệnh hơn bình thường.” `gradeSignal(a)` (`packages/core/grade.ts`) chỉ chấm tín hiệu đã **Đạt tiêu chí**; **Hạng A = đạt cả 6 tiêu chí**, còn lại là Hạng B kèm danh sách tiêu chí trượt. Mọi ngưỡng ở `COMMON.gradeA` (đề xuất, chưa backtest); mã nguyên tắc `H-A1…H-A6`.

**Hạng A là tiêu chí lọc chặt, KHÔNG phải xác suất thắng. Tỉ lệ thắng thực sẽ đo ở sổ tín hiệu/backtest.**

| # | Tiêu chí | Dữ liệu dùng | Cách xấp xỉ / quyết định |
|---|---|---|---|
| 1 | Xu hướng đồng thuận nhiều khung | chế độ thị trường; giá/SMA20/SMA50 khung xu hướng (1D hoặc 1H) và khung vào lệnh (4H hoặc 15m) theo cùng luật `dailyTrend`; Swing thêm BTC 1D | “Cùng chiều lệnh (không ngược xu hướng)” đọc là: Swing — chế độ **không ngược** chiều lệnh (đi ngang được chấp nhận vì BTC 1D phải cùng chiều). Lệnh ngược chế độ (ngoại lệ điểm ≥ 80 của G-01) luôn là Hạng B. Lướt nhanh không thêm BTC 1D (đã có cổng BTC 1H ở G-01) nên chế độ phải **cùng chiều** lệnh (đi ngang không đạt) |
| 2 | Điểm ≥ 80 | điểm phía lệnh | — |
| 3 | Điểm vào đẹp | (a) vùng đặt SL độ mạnh ≥ 3; (b) giá vào cách mép vùng ≤ 0,5×ATR (limit tại mép cũng đạt); (c) không vùng nào nằm giữa giá vào và TP1 | Lệnh vùng: đúng vùng mà `buildPlan` chọn. Lệnh **mô hình** không đặt SL theo vùng nên xấp xỉ: có vùng độ mạnh ≥ 3 ngay trước SL (mép xa cách SL ≤ 1×A), và “mép” = đường phá (chân market/chia phải có d ≤ 0,5×A; chỉ limit thì đạt). (c) kiểm bằng `targetSideZones` từ giá vào xa TP1 nhất (với lệnh chia chân là giá limit); `buildPlan` và `buildPatternPlan` đã đặt TP1 trước vùng cản đầu tiên nên tiêu chí này là kiểm lại độc lập |
| 4 | TP1 ≥ 1,5R sau phí + funding | ở **giá khớp xấu nhất cho phép** (rà soát cuối 1c, M2): lệnh mô hình `tp1NetR`; lệnh vùng `worstTp1NetR` (market: giá tối đa; limit: giá limit), cùng công thức `tp1NetRAt` | Lệnh vùng không có TP1 cố định (không vùng cản) → trượt (không đoán) |
| 5 | Rủi ro coin | mức rủi ro Thấp/Vừa; không F-01 **cùng chiều lệnh**; cầu dao tắt; cổng G-07 qua và không có cờ G-07 (đáo hạn quyền chọn ±24h cũng tính là cửa sổ sự kiện) | — |
| 6 | Hợp lưu (≥ 1) | điểm S-02 ≥ 70% điểm tối đa S-02; coil vừa bung theo chiều lệnh (chỉ hai nguồn này). **Phá vỡ/retest của mô hình không còn tính** (rà soát cuối 1c, B5) | Coil “vừa bung”: dữ liệu chỉ có coil bật/tắt nên xấp xỉ = coil bật ở một trong 6 nến 4H trước nến cuối và nến cuối đóng ngoài biên cao/thấp của 6 nến đó. Hai đáy/hai đỉnh đã xác nhận **không** tính là hợp lưu (điều phối 19/10/2026). Trước đây “phá vỡ/retest” là nguồn thứ ba nhưng luôn đúng với lệnh mô hình (P-S1 đã ép trạng thái đó) nên tín hiệu mô hình được tiêu chí 6 miễn phí; nay lệnh mô hình cũng cần dòng tiền hoặc coil như lệnh vùng |

In ra: mặc định chỉ in kế hoạch đầy đủ của Hạng A (lời cảnh báo ở đầu khối, điểm cao trước); Hạng B in danh sách ngắn “không đủ: …”; `--show-b` in đủ kế hoạch Hạng B sau Hạng A. Điều kiện top 10% điểm của nhóm thanh khoản (D4) vẫn áp dụng trước khi chấm hạng. Không đổi cổng hay điểm — Hạng chỉ là lớp lọc hiển thị.

## 4. Đo kết quả

- Kết quả mỗi lệnh = **R thực sau phí, trượt giá và funding**. Giá nhảy qua cắt lỗ → khớp ở giá mở cửa trừ
  trượt giá. Một nến chạm cả hai mức → tính thua (Lướt nhanh phân xử bằng nến 1m; báo tỷ lệ ca không phân
  xử được).
- **Không hiện % thắng theo từng coin.** Số gộp theo nhóm thanh khoản × hướng (Long/Short) × chế độ; chỉ
  hiện % khi ≥ 100 lệnh; luôn kèm khoảng tin cậy Wilson, kỳ vọng R kèm khoảng tin cậy, sụt giảm lớn nhất
  (R), chuỗi thua dài nhất, profit factor, so với vào lệnh ngẫu nhiên.
- Walk-forward 12 tháng huấn luyện / 3 tháng kiểm; nhật ký số lần thử tham số.
- Point-in-time: pivot sau N nến xác nhận; ngưỡng theo cửa sổ trượt; sự kiện có thời điểm biết được.
- Backtest chỉ trên hợp đồng đang giao dịch → nhãn **“Kết quả bị thổi phồng do thiếu hợp đồng đã bị hủy”**.
- Sổ thực tế: ghi **giá lúc ghi** (Lướt nhanh: lúc trình duyệt phát hiện; Swing: lúc ghi DB); khóa duy nhất
  (hợp đồng, chế độ, hướng, thời điểm nến). Lượt quét Swing nền đối chiếu và đóng cả tín hiệu Lướt nhanh
  (dùng nến 1m) để sổ đầy đủ dù web đã đóng. Cầu dao sổ: −6R → gợi ý giảm một nửa rủi ro; −10R → tạm
  dừng nhãn “Đạt tiêu chí”.

## 5. Supabase

Dự án Pháp Sư; schema `public`, tiền tố `coin_`.

| Bảng | Nội dung |
|---|---|
| `coin_scan_runs` | Mỗi lượt quét Swing: thời gian, số hợp đồng, lỗi, nguồn bị chặn, lượt gọi CoinGecko; giữ 30 ngày |
| `coin_snapshots` | Kết quả Swing mới nhất mỗi hợp đồng: giá, điểm Long/Short, độ phủ, lý do (mã), cờ, rủi ro, kế hoạch; ghi đè |
| `coin_signals` | Sổ tín hiệu cả hai chế độ; khóa duy nhất (hợp đồng, chế độ, hướng, thời điểm nến) |
| `coin_market` | Bối cảnh mỗi lượt: chế độ thị trường, cầu dao, dominance, F&G, Coinbase premium |
| `coin_market_history` | Lưu OI, long/short, funding theo thời gian (Binance chỉ giữ 30 ngày) |

- RLS cả 5 bảng: `select` chỉ `private.is_active_admin()`; `anon` không quyền gì.
- **Ghi từ trình duyệt** (sổ Lướt nhanh): chỉ qua hàm `coin_log_fast_signal(...)` kiểm `is_active_admin()`,
  chỉ thêm tín hiệu mới, không sửa/xóa.
- Máy quét: login `coin_scanner` chỉ `execute` hàm `coin_ingest(jsonb)` (security definer), theo mẫu
  `project_heartbeat` (pooler, `verify-full`, ghim CA).
- Chụp lược đồ trước khi áp migration. Web đọc theo trang (tối đa 1000 dòng/lần).

## 6. Giao diện

1. **Đăng nhập** bằng tài khoản admin Pháp Sư; không phải admin → “không có quyền”.
2. **Đầu trang:** chế độ thị trường + hướng được phép, cầu dao, BTC, sự kiện sắp tới, giờ cập nhật
   (Swing > 60 phút → đỏ; > 2 giờ không có lượt quét → cảnh báo), nút **Lướt nhanh / Swing**.
3. **Heatmap:** ô theo khối lượng hoặc vốn hóa; màu theo % 24h, điểm Long/Short, hoặc funding.
4. **Bảng xếp hạng:** lọc nhãn (Long/Short), rủi ro, ngành; sắp theo điểm; cột funding và OI thay đổi.
5. **Lướt nhanh:** đồng hồ “lần tính gần nhất”, đếm ngược tới nến 15m kế tiếp, tự tính lại mỗi 1 phút khi
   tab đang mở; tab ẩn thì tạm dừng để đỡ tốn lượt gọi.
6. **Chi tiết hợp đồng:** điểm + độ phủ + lý do theo mã, cờ, kế hoạch lệnh (vùng giá vào, giá vào tối đa, cắt
   lỗ theo mark, chốt lời, **khối lượng, đòn bẩy tối thiểu, giá thanh lý ước tính, số tiền có thể mất, funding
   dự kiến**), rủi ro, lịch sử tín hiệu, nút mở hợp đồng trên Binance.
7. **Danh mục theo dõi:** tổng rủi ro mở so trần, số lệnh cùng chiều, hành động gợi ý khi có kịch bản xấu.
8. **Sổ tín hiệu:** số gộp theo nhóm × hướng × chế độ, kèm khoảng tin cậy, kỳ vọng R, sụt giảm, chuỗi thua.
9. **Trang Nguyên tắc:** toàn bộ cổng, điểm, cờ, kế hoạch, quản lý vốn/đòn bẩy, kịch bản — mỗi mục có mã,
   mức căn cứ, nguồn, trạng thái (đang dùng / chỉ hiển thị / chờ backtest). Sinh từ danh mục trong `core`.
10. **Trang giới thiệu:** 7–10 lệnh thua liên tiếp là bình thường; futures có đòn bẩy làm lỗ đến nhanh hơn;
    lợi thế chính là giảm sụt giảm, không phải thắng nhiều.
11. Đủ 4 trạng thái: đang tải, lỗi (kèm nội dung), rỗng, có dữ liệu. Dùng được trên điện thoại.
12. Dòng miễn trừ cố định: “Phân tích kỹ thuật tự động từ số liệu quá khứ. Giao dịch futures có đòn bẩy có
    thể mất toàn bộ ký quỹ. Không phải lời khuyên tài chính.”

## 7. Kiểm thử

| Phần | Cách kiểm |
|---|---|
| Chỉ báo | So bảng số tham chiếu đã công bố |
| Cổng, điểm Long/Short, cờ, kế hoạch lệnh | Test hành vi viết trước code; test Short đối xứng Long |
| Khối lượng, đòn bẩy, giá thanh lý | Test số tính tay; làm tròn step size; ca giá thanh lý gần cắt lỗ bị chặn |
| Backtest | Không nhìn trước tương lai; ca chạm cả hai mức; phí/trượt giá/funding; gap qua cắt lỗ |
| Thống kê | Wilson, expectancy, chuỗi thua — so số tính tay |
| Danh mục nguyên tắc | Mọi mã dùng trong máy chấm có trong danh mục và ngược lại |
| Ghép CoinGecko | Hợp đồng `1000…`, trùng ký hiệu, giá lệch > 5% |
| RLS | Postgres thật: tài khoản thường 0 dòng; admin đọc + ghi sổ Lướt nhanh qua hàm; `coin_scanner` không đọc bảng game |
| Máy quét | Chạy thật trên máy, rồi trên GitHub Actions; dán số hợp đồng / lỗi / nguồn bị chặn |
| Lướt nhanh trên trình duyệt | Đo số lượt gọi và weight mỗi phút; không vượt giới hạn Binance |
| Web | Typecheck, lint, build; kiểm trình duyệt với dữ liệu thật sau đăng nhập |

## 8. Giới hạn đã biết (ghi trên web và báo cáo)

- Gần như mọi ngưỡng là đề xuất chưa backtest; Lướt nhanh ít căn cứ nhất.
- Mô hình biểu đồ (3.11): hai đỉnh/hai đáy chỉ là bối cảnh vì với SL ngoài đáy/đỉnh cực trị TP1 luôn < 0,73R (TP1 ≤ cổ ± 0,73h, R ≥ h + 0,5×A + d) — người dùng chọn trần R 4×A rồi đổi sang chỉ bối cảnh (19/10/2026). Chữ nhật chỉ ra lệnh khi có pivot nhỏ phía trong sát biên bị phá.
- Giá thanh lý là **ước tính** (bậc ký quỹ thật cần API key); luôn đối chiếu trên Binance.
- Sổ Lướt nhanh chỉ ghi khi web đang mở → mẫu ít hơn Swing.
- Lịch GitHub Actions có thể trễ/bỏ lượt; repo public không hoạt động 60 ngày bị tắt lịch.
- Binance có thể chặn runner Mỹ — chưa kiểm.
- Không có nguồn miễn phí ổn định cho dòng tiền ETF, lịch mở khóa token, bản đồ thanh lý.

## 9. Giai đoạn 2 — Bot tự giao dịch (CHƯA LÀM, người dùng duyệt 19/10/2026 để “xử lý sau”)

Bot là chương trình chạy luật trong `core` và đặt lệnh qua API Binance; không phải Claude giao dịch trong
chat. Chỉ bắt đầu khi đạt tiêu chí của bậc trước:

| Bậc | Làm gì | Tiêu chí qua bậc sau |
|---|---|---|
| 1 | Web phân tích + sổ tín hiệu (thiết kế này) | Backtest kỳ vọng R dương sau phí + funding, ngoài mẫu |
| 2 | Giao dịch giấy: sổ tự đóng lệnh theo đúng kế hoạch | ≥ 100 lệnh thực tế, kỳ vọng > 0, cận dưới khoảng tin cậy > 0, sụt giảm trong giới hạn |
| 3 | Bot trên **Binance Futures Testnet** (tiền ảo) | ≥ 2–4 tuần không lỗi; lệnh trên sàn khớp kế hoạch |
| 4 | Tiền thật rất nhỏ, khóa cứng: đòn bẩy tối đa, lỗ tối đa/ngày, nút dừng khẩn cấp | Kết quả khớp sổ giấy |
| 5 | Tăng vốn từng bậc | Theo dõi liên tục |

Ràng buộc bất biến: key **không có quyền rút tiền**, **giới hạn IP** → bot chạy trên máy chủ có IP cố định
(không phải GitHub Actions); key chỉ nằm trên máy chủ đó, không ở repo, không dán vào chat. Thiết kế chi tiết
bot làm thành spec riêng khi tới bậc 3.

**Việc giai đoạn 1 phải chuẩn bị sẵn:** sổ tín hiệu lưu đủ trường để giao dịch giấy (giá vào, cắt lỗ, chốt
lời, khối lượng, thời điểm, từng lần chốt một phần) — đã có trong mục 4.

## 10. Thứ tự làm

Mỗi bước kiểm xong, báo số thật, rồi mới sang bước sau.

1. Tạo repo public, chạy thử Binance Futures trên runner GitHub (Mỹ) → chốt nơi chạy Swing.
2. `packages/core` + `packages/binance` + `scanner` chạy trên máy, in kết quả thật 525 hợp đồng.
3. Backtest + thống kê trên dữ liệu lịch sử; hiệu chỉnh ngưỡng có nhật ký số lần thử.
4. Migration Supabase + RLS + login `coin_scanner` + hàm ghi sổ (đổi database thật).
5. Workflow quét Swing ghi Supabase.
6. Web: đăng nhập, đầu trang, heatmap, bảng, Lướt nhanh trong trình duyệt, chi tiết, danh mục, sổ tín hiệu,
   trang Nguyên tắc.
7. Phát hành GitHub Pages, kiểm trên web thật.
