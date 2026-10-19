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
| Lệnh ngược xu hướng (19/10) | Chỉ khi điểm ≥ 80 **và** sức mạnh so BTC rõ ngược chiều (z ≤ −1,5 cho Short / ≥ +1,5 cho Long) **và** rủi ro không “Rất cao”; thiếu z → không cho. Lướt nhanh: bắt buộc cùng phía SMA200 1H của BTC, không ngoại lệ |
| Top 10% (19/10) | Chỉ xếp hạng trong các hợp đồng đã qua mọi cổng và điểm ≥ 70, tách Long/Short, theo nhóm thanh khoản (khuyến nghị của rà soát cuối) |
| Web | Độc lập, repo public `tienhoandhd-droid/coin-radar`, GitHub Pages |
| Ai xem | Chỉ admin đăng nhập; dữ liệu khóa RLS |
| Supabase | Dùng chung dự án Pháp Sư, bảng `coin_*`, không đụng bảng game |
| Biểu đồ nến | Không vẽ |
| Quyền | Đổi database (thêm bảng `coin_*`), tạo repo public, push — từng bước |

**Thay đổi so với đề xuất trước về Lướt nhanh:** vì Lướt nhanh chỉ ghi sổ khi web đang mở, chờ đủ 100 lệnh
thực tế mới hiện tín hiệu sẽ rất lâu. Thiết kế chọn: **hiện tín hiệu ngay với nhãn “thử nghiệm”**, rủi ro
mặc định thấp hơn (0,25%), và mọi tín hiệu đều ghi sổ. Người dùng có thể đổi sang “chỉ ghi sổ” trong
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
| `scanner/` | Swing nền: lấy dữ liệu, chấm, ghi Supabase qua `psql` | `core`, `binance`, `psql` trên runner |
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
| Danh sách hợp đồng | `/fapi/v1/exchangeInfo` (lọc PERPETUAL, USDT, TRADING; lấy tick size, step size, ngày niêm yết) | Cả hai |
| Nến + taker | `/fapi/v1/klines` — Swing: 1D × 300, 4H × 500; Lướt nhanh: 1H × 500, 15m × 500 | Cả hai |
| 24h, spread | `/fapi/v1/ticker/24hr`, `/fapi/v1/ticker/bookTicker` (toàn bộ, 1 lệnh) | Thanh khoản |
| Funding, mark price | `/fapi/v1/premiumIndex` (toàn bộ, 1 lệnh), `/fapi/v1/fundingInfo` (chu kỳ funding từng mã) | Chi phí giữ lệnh, cắt lỗ theo mark |
| OI, long/short, taker | `/fapi/v1/openInterest`, `/futures/data/openInterestHist`, `globalLongShortAccountRatio`, `takerlongshortRatio` (Binance chỉ giữ 30 ngày → **tự lưu** vào `coin_market_history`) | Cờ phái sinh |
| Bậc ký quỹ | `/fapi/v1/leverageBracket` **cần API key** → không dùng; giá thanh lý tính theo công thức gần đúng, ghi rõ “ước tính”, người dùng đối chiếu trên Binance | Kế hoạch lệnh |
| Độ sâu | `/fapi/v1/depth?limit=100` chỉ cho coin đang đạt tiêu chí hoặc đang có lệnh | Độ dày vùng cản |
| Vốn hóa, ngành, FDV | CoinGecko `/coins/markets` (Demo key), mỗi giờ, ghép theo ký hiệu | Rủi ro, nhóm ngành |
| Bối cảnh | Coinbase premium, Fear & Greed, DefiLlama stablecoin, SMA200 tuần BTC | Bối cảnh, cờ |
| Sự kiện | `data/events/*.json`: FOMC, CPI, BOJ; đáo hạn quyền chọn quý (tự tính) | Cổng sự kiện |

Phí giao dịch và trượt giá là **tham số cấu hình**, giá trị mặc định lấy từ trang phí chính thức của
Binance lúc triển khai (chưa tra — không đoán).

Quy tắc dữ liệu:
- Chỉ dùng **nến đã đóng** cho quyết định.
- Nguồn lỗi → coin hiện “dữ liệu cũ”, không tạo tín hiệu.
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
| G-04 | Không đang bị bơm/xả: biến động > 15%/1H kèm z-score khối lượng > 5 |
| G-05 | Hợp đồng niêm yết < 30 ngày: không vào Lướt nhanh; rủi ro tối thiểu “Cao” |
| G-06 | Không hack 7 ngày, không có thông báo hủy niêm yết/đóng hợp đồng, stablecoin không lệch neo |
| G-07 | Lướt nhanh: ngoài cửa sổ FOMC (−4h/+2h), CPI (±2h), BOJ; cả hai chế độ: cờ ±24h đáo hạn quyền chọn quý |
| G-08 | **Giá thanh lý ước tính nằm xa hơn cắt lỗ ≥ 1 lần khoảng cắt lỗ** (P-04) |
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
  ngay — chờ 1 nến khung xu hướng.
- Nhãn: **Đạt tiêu chí Long / Đạt tiêu chí Short / Theo dõi / Không đạt**; ghi “điểm xếp hạng, không phải
  xác suất thắng”.

### 3.7 Quản lý vốn và đòn bẩy

| Mã | Nguyên tắc |
|---|---|
| P-01 | Người dùng nhập **vốn futures** và **% rủi ro/lệnh** (lưu trong trình duyệt). Mặc định 0,5% (Swing, rủi ro Thấp/Vừa); 0,25% (Lướt nhanh, hoặc rủi ro Cao/Rất cao) |
| P-02 | **Khối lượng = (vốn × % rủi ro) ÷ khoảng cách cắt lỗ** (đã cộng phí + trượt giá). Làm tròn theo step size của hợp đồng |
| P-03 | **Đòn bẩy chỉ là hệ quả**: đòn bẩy cần = giá trị vị thế ÷ ký quỹ dự định. App hiện đòn bẩy tối thiểu cần dùng; **trần đòn bẩy gợi ý: Swing 5×, Lướt nhanh 10×** (đề xuất). Khuyên chế độ **isolated** |
| P-04 | **Giá thanh lý ước tính phải xa hơn cắt lỗ ≥ 1 khoảng cắt lỗ**; không đạt → không đưa kế hoạch (G-08). Ghi rõ công thức gần đúng, người dùng đối chiếu trên Binance |
| P-05 | **Trần danh mục**: tổng rủi ro đang mở ≤ 3%; tối đa 5 lệnh altcoin cùng lúc (Đi ngang: 3); tối đa 2 lệnh cùng ngành; **tối đa 3 lệnh cùng chiều** khi tương quan với BTC > 0,7 (vì 5 Long altcoin ≈ 1 Long BTC lớn) |
| P-06 | Vượt trần → chỉ các tín hiệu xếp hạng cao nhất có nhãn “ưu tiên” |
| P-07 | **Chi phí funding dự kiến** cho thời gian giữ lệnh được trừ vào R kỳ vọng |

### 3.8 Kế hoạch lệnh (Long; Short đối xứng)

| Mục | Lướt nhanh | Swing |
|---|---|---|
| Mức kích hoạt | **Theo mark price** (giá Binance dùng để thanh lý) | như Lướt nhanh |
| Cắt lỗ | thấp hơn giữa (pivot đã xác nhận − 0,5×ATR15m) và (giá vào − 2,5×ATR15m); sát số tròn → đẩy qua số tròn | thấp hơn giữa (pivot − 0,5×ATR4H) và (giá vào − 2×ATR4H); không chặt hơn 1×ATR1D |
| Giá vào tối đa | giá đóng + 0,3×ATR khung vào lệnh; vượt → “Đã chạy – bỏ qua” | như Lướt nhanh |
| Chốt lời | 1/3 ở 1,5R → dời cắt lỗ về giá vào + phí → phần còn lại trailing chandelier 3×ATR | như Lướt nhanh |
| Dừng theo thời gian | chưa +1R sau 8h; trần 24h | chưa +1R sau 7 ngày; trần 21 ngày |

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
