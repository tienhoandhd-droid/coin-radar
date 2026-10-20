# Biến động "riêng" của từng coin: dữ liệu nói gì?

*Phần dữ liệu cho câu hỏi: "Khi một coin tăng/giảm mạnh khác xu hướng chung thì do đâu — tin xấu, unlock token? Biểu đồ/phân tích kỹ thuật có thấy trước không, hay chỉ là xu hướng?"*
*Phần tài liệu nghiên cứu do một người khác viết riêng. Ghi chú này chỉ dùng dữ liệu nến có sẵn trong repo.*

> **Giới hạn quan trọng nhất:** repo **không có** dữ liệu tin tức, lịch unlock hay lịch niêm yết. Vì vậy ghi chú này **không thể** và **không** nói nguyên nhân của bất kỳ sự kiện cụ thể nào. Ghi chú chỉ phân loại: "trùng ngày cả thị trường", "riêng lẻ" hoặc "niêm yết gần".

---

## 1. Phương pháp

### Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| **idiosyncratic move** | Biến động "riêng" của một coin, tức phần không giải thích được bằng chuyển động chung của thị trường (ở đây thị trường được đại diện bằng BTC) |
| **beta (β)** | Độ nhạy của coin so với BTC. β = 2 nghĩa là khi BTC đi 1% thì coin thường đi 2% |
| **residual (phần dư)** | Lợi nhuận coin − β × lợi nhuận BTC, tức phần "riêng" còn lại |
| **σ (độ lệch chuẩn)** | Mức dao động "bình thường" của residual |
| **look-ahead (nhìn trước)** | Lỗi dùng dữ liệu tương lai để tính quá khứ. Ở đây đã tránh: β và σ của ngày d chỉ tính từ 60 ngày d−60…d−1 |
| **z-score** | Một giá trị cách mức trung bình bao nhiêu lần σ |
| **base rate (tỷ lệ cơ sở)** | Xác suất xảy ra sự kiện khi không biết thêm gì |
| **lift** | P(sự kiện \| điều kiện) ÷ P(sự kiện). Lift = 1 là không có thông tin; lift = 3 là gấp 3 lần ngẫu nhiên |
| **ATR (Average True Range)** | Biên độ dao động trung bình mỗi ngày. Tỷ lệ ATR5/ATR20 thấp nghĩa là biến động đang bị **nén (squeeze)** |
| **SMA20/SMA50** | Đường trung bình giá đóng cửa 20 hoặc 50 ngày, dùng để xác định xu hướng |
| **funding** | Phí mà phe long và phe short trả cho nhau trên hợp đồng perp. Funding dương nghĩa là phe long đông hơn |
| **in-sample (trong mẫu)** | Kết quả đo trên chính dữ liệu dùng để tìm ra quy luật. Kết quả kiểu này dễ đẹp hơn thực tế |

### Dữ liệu và cách tính

- **Nguồn:** nến 1d (1 ngày) Binance USDⓈ-M trong bộ đệm `data/cache/klines`, nạp bằng `loadCandles()` của `backtest/data.ts`.
  - 1d có từ **2025-08-23** đến **2026-10-17** (nến cuối mở cửa ngày 17/10, trước mốc 2026-10-19), tổng **421 ngày**.
  - 1h chỉ có từ 2026-05; 4h từ 2026-03. Vì vậy phân tích này **chỉ dùng 1d**.
- **Funding:** có đủ cho cả 100 coin trong toàn bộ cửa sổ (`data/cache/funding`). Lấy trung bình các kỳ funding của ngày d−1.
- **OI (Open Interest — tổng vị thế mở):** chỉ có 30 ngày gần nhất (khung 1h), quá ngắn nên **không dùng**.
- **Universe (tập coin):** 100 coin perp USDT có quoteVolume (khối lượng tính bằng USDT) trung bình ngày cao nhất, không tính BTC (BTC dùng làm chuẩn).
  - Đã loại USDCUSDT (stablecoin), PAXGUSDT và XAUTUSDT (vàng, cũng neo giá).
  - Chỉ lấy `underlyingType = COIN` (bộ đệm không có mã cổ phiếu hay hàng hóa nào).
  - Loại 7 mã có dưới 90 ngày dữ liệu.
  - Không mã nào bị lỗi khi nạp (0 lần bỏ qua). Không có ngày nào bị khuyết dữ liệu.
  - 34/100 coin niêm yết sau 2025-08-23.
- **Sự kiện (event):** coin-day (một coin trong một ngày) thỏa **|residual| > 3σ₆₀ và |residual| > 8%**.
  - β và σ ước lượng bằng OLS (hồi quy bình phương nhỏ nhất) trên 60 ngày trước đó.
  - Ngày sớm nhất có thể có sự kiện là 2025-10-23.
- **Lợi nhuận sau sự kiện:** residual tích lũy từ giá đóng cửa ngày sự kiện đến ngày +k:
  `(P_{d+k}/P_d − 1) − β × (BTC_{d+k}/BTC_d − 1)`, với β cố định của ngày sự kiện.
- **Đặc trưng trước sự kiện:** chỉ dùng thông tin đến hết ngày d−1.
- **Mẫu so sánh:**
  - (i) mọi coin-day không có sự kiện (base rate);
  - (ii) **so khớp cùng ngày:** xếp hạng phân vị của coin có sự kiện so với các coin không có sự kiện **trong cùng ngày**. Mốc 50 nghĩa là không khác gì.

### Quy mô mẫu

| Chỉ số | Giá trị |
|---|---|
| Cửa sổ | 2025-08-23 → 2026-10-17 (421 ngày; ngày có thể có sự kiện: 2025-10-23 → 2026-10-17) |
| Coin-days đủ điều kiện | 33.004 |
| Sự kiện | **682** (tăng **570**, giảm **112**) |
| Tỷ lệ cơ sở P(event) | 2,07% mỗi coin-day (tăng 1,73%, giảm 0,34%) |
| Số coin có ≥ 1 sự kiện | 95/100 |
| Số ngày khác nhau có sự kiện | 251 |
| Sự kiện lặp (cùng coin đã có sự kiện trong 5 ngày trước) | 197 |
| Trung vị \|residual\| | tăng 18,7%; giảm 16,1% |

**Theo tháng (tăng/giảm):**

| Tháng | Tăng/giảm |
|---|---|
| 2025-10 | 13/1 |
| 2025-11 | 40/5 |
| 2025-12 | 12/3 |
| 2026-01 | 43/5 |
| 2026-02 | 59/15 |
| 2026-03 | 21/8 |
| 2026-04 | 56/13 |
| 2026-05 | 73/4 |
| 2026-06 | 71/28 |
| 2026-07 | 28/10 |
| 2026-08 | 50/10 |
| 2026-09 | 91/8 |
| 2026-10 | 13/2 (chưa trọn tháng) |

**Bất đối xứng rõ:** sự kiện tăng nhiều gấp khoảng **5 lần** sự kiện giảm. Lý do là residual của altcoin lệch phải: có những cú bơm +100–270% trong một ngày, còn giảm thì tối đa −100%. Mẫu sự kiện **giảm chỉ có 112** (≈ 69 ngày khác nhau), nên mọi kết luận về chiều giảm đều **mẫu nhỏ**.

**Nhiễu do mô hình β:** 20/682 sự kiện (3%) có dấu residual ngược với dấu lợi nhuận thô.

- Tất cả 20 sự kiện này rơi vào ngày BTC biến động hơn 4%.
- Ví dụ: ngày 2026-02-05 BTC giảm 14%, và 13 coin bị gắn "sự kiện tăng" dù giá thô **giảm** 14–22%. Lý do là chúng giảm ít hơn mức β dự đoán.
- Đây là giới hạn của mô hình một nhân tố (chỉ dùng BTC), không phải tin riêng của coin.

Theo nhóm ngành (thẻ `underlyingSubType` của Binance), tỷ lệ sự kiện khá đều, từ 1,1% đến 3,2% mỗi coin-day. Điều này cũng dễ hiểu vì ngưỡng 3σ đã điều chỉnh theo độ biến động riêng của từng coin.

---

## 2. Ba mươi sự kiện lớn nhất (theo |residual|)

Cột "bối cảnh" dùng ba nhãn:
- "trùng ngày cả thị trường": cùng ngày có ≥ 3 sự kiện cùng chiều;
- "riêng lẻ": đây là sự kiện duy nhất trong ngày;
- "ít coin cùng ngày": các trường hợp còn lại.

Cột "tuổi" là số ngày kể từ nến đầu tiên của coin trong bộ đệm.

| # | Ngày | Coin | Nhóm | Thô | BTC | β | Residual | σ60 | volZ ngày đó | Tuổi | Bối cảnh | +5d res | +20d res |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2026-04-04 | SIREN | Alpha | 268,6% | 0,5% | −0,09 | 268,7% | 43,0% | 1,6 | 224 | riêng lẻ | 27% | 32% |
| 2 | 2026-07-15 | AKE | Alpha | 257,1% | −0,5% | 0,90 | 257,5% | 9,0% | 5,8 | 292 | trùng ngày cả thị trường | 149% | 534% |
| 3 | 2026-04-13 | BLESS | Alpha | 247,9% | 5,2% | 0,72 | 244,1% | 6,4% | 5,4 | 202 | trùng ngày cả thị trường | −80% | −84% |
| 4 | 2025-12-31 | LIGHT | Infrastructure | 240,2% | −1,0% | 2,89 | 243,0% | 25,8% | 2,0 | 95 | ít coin cùng ngày | −79% | −75% |
| 5 | 2025-11-03 | JELLYJELLY | Alpha | 234,0% | −3,6% | 0,30 | 235,1% | 17,6% | 2,5 | 72 | ít coin cùng ngày | −57% | −76% |
| 6 | 2026-04-09 | RAVE | Alpha | 215,8% | 1,0% | 1,63 | 214,1% | 11,1% | 8,6 | 116 | trùng ngày cả thị trường | 1478% | −31% |
| 7 | 2026-10-01 | 龙虾 | Chinese | 207,3% | 1,5% | −1,06 | 208,9% | 29,4% | 2,1 | 204 | riêng lẻ | −39% | — |
| 8 | 2026-02-07 | SIREN | Alpha | 187,4% | −1,8% | 0,71 | 188,7% | 4,9% | 6,9 | 168 | riêng lẻ | −49% | 38% |
| 9 | 2026-04-12 | RAVE | Alpha | 175,2% | −3,2% | 2,47 | 183,0% | 30,7% | 2,6 | 119 | trùng ngày cả thị trường | 245% | −117% |
| 10 | 2026-07-07 | EVAA | DeFi | 164,2% | −1,1% | 2,64 | 167,0% | 18,0% | 5,1 | 277 | ít coin cùng ngày | −59% | −68% |
| 11 | 2026-07-04 | LAB | Alpha | 160,9% | 0,9% | −0,26 | 161,1% | 22,6% | 3,2 | 260 | ít coin cùng ngày | −93% | −99% |
| 12 | 2025-10-24 | H | Infrastructure | 155,1% | 0,9% | 1,96 | 153,5% | 23,5% | 2,0 | 62 | ít coin cùng ngày | −24% | −34% |
| 13 | 2026-04-16 | SIREN | Alpha | 151,6% | 0,4% | 0,47 | 151,3% | 48,6% | 0,0 | 236 | trùng ngày cả thị trường | −65% | −63% |
| 14 | 2026-03-22 | SIREN | Alpha | 145,0% | −1,5% | 0,11 | 145,1% | 29,8% | 3,7 | 211 | trùng ngày cả thị trường | −65% | −70% |
| 15 | 2026-09-18 | AKE | Alpha | 117,9% | 5,9% | −3,85 | 140,5% | 22,3% | 1,2 | 357 | trùng ngày cả thị trường | 10% | −39% |
| 16 | 2026-08-05 | BLESS | Alpha | 135,4% | 0,9% | 3,66 | 132,3% | 17,5% | 2,4 | 316 | riêng lẻ | −43% | −144% |
| 17 | 2026-01-24 | ENSO | Infrastructure | 131,5% | −0,4% | 1,20 | 132,0% | 5,0% | 4,8 | 102 | trùng ngày cả thị trường | −28% | −5% |
| 18 | 2026-06-27 | VELVET | DeFi | 129,8% | −0,1% | 0,18 | 129,8% | 23,8% | 1,4 | 308 | trùng ngày cả thị trường | −70% | −68% |
| 19 | 2025-11-24 | PIPPIN | Meme | 131,3% | 1,7% | 1,60 | 128,6% | 17,4% | 2,9 | 93 | trùng ngày cả thị trường | 54% | 429% |
| 20 | 2026-06-11 | H | Infrastructure | 128,2% | 3,4% | 0,82 | 125,4% | 17,3% | 0,9 | 292 | trùng ngày cả thị trường | 30% | −63% |
| 21 | 2025-12-31 | RIVER | Alpha | 123,4% | −1,0% | 1,72 | 125,0% | 12,2% | 4,2 | 75 | ít coin cùng ngày; niêm yết gần | 36% | 224% |
| 22 | 2026-06-10 | VELVET | DeFi | 123,2% | −0,3% | −0,97 | 122,9% | 10,8% | 2,4 | 291 | ít coin cùng ngày | −52% | 76% |
| 23 | 2026-09-12 | 龙虾 | Chinese | 116,6% | 0,1% | −0,37 | 116,6% | 22,6% | 2,7 | 185 | riêng lẻ | 48% | −71% |
| 24 | 2025-11-07 | H | Infrastructure | 112,2% | 2,0% | 2,52 | 107,2% | 31,4% | 1,0 | 76 | trùng ngày cả thị trường | −24% | −21% |
| 25 | 2026-07-19 | BANK | Meme | 103,3% | −0,2% | 2,12 | 103,6% | 11,1% | 2,8 | 330 | ít coin cùng ngày | 35% | −83% |
| 26 | 2026-06-06 | ALLO | AI | 95,9% | −0,3% | −0,01 | 95,9% | 14,5% | 1,7 | 207 | trùng ngày cả thị trường | −9% | −23% |
| 27 | 2026-04-19 | PIEVERSE | Alpha | 92,3% | −2,5% | 0,37 | 93,3% | 6,2% | 6,8 | 156 | riêng lẻ | −35% | −38% |
| 28 | 2026-02-26 | POWER | Alpha | 90,0% | −0,7% | −0,03 | 90,0% | 14,1% | 1,8 | 82 | riêng lẻ; niêm yết gần | −89% | −94% |
| 29 | 2026-03-03 | POWER | Alpha | −90,0% | −0,7% | 0,18 | −89,9% | 18,6% | 1,4 | 87 | riêng lẻ; niêm yết gần | −30% | −47% |
| 30 | 2026-09-27 | QNT | Infrastructure | 89,2% | 0,0% | 0,68 | 89,2% | 8,1% | 4,0 | 400 | riêng lẻ | −14% | −29% |

Nhận xét:

- 29/30 sự kiện lớn nhất là sự kiện **tăng**, chủ yếu ở coin nhóm "Alpha", coin nhỏ hoặc coin mới.
- Một số coin lặp lại nhiều lần: SIREN 4 lần, H 3 lần, RAVE, AKE, BLESS, VELVET và POWER mỗi coin 2 lần.
- Ở +20 ngày, phần lớn các cú bơm này đã trả lại gần hết, nhưng vẫn có vài ca tăng tiếp rất mạnh (AKE +534%, PIPPIN +429%).

**Về nhãn "mới niêm yết":** đề bài muốn gắn nhãn "mới niêm yết" khi lịch sử nến bắt đầu trong vòng 30 ngày trước sự kiện. Nhưng phương pháp cần 60 ngày lịch sử để ước lượng β, nên về cấu trúc **không thể có sự kiện nào trong 30 ngày đầu**. Ghi chú này dùng nhãn thay thế "niêm yết gần" cho coin có dữ liệu bắt đầu sau 2025-08-23 và có tuổi ≤ 90 ngày. Có **17/682** sự kiện mang nhãn này. Do đó **giai đoạn ngay sau niêm yết (thường biến động dữ dội nhất) nằm ngoài phân tích.**

---

## 3. Trước sự kiện: biểu đồ có thấy trước không?

### 3a. Tỷ lệ cơ sở theo thập phân vị cực

Thập phân vị (decile) được tính trên toàn bộ 33.004 coin-days. Tỷ lệ cơ sở là P(tăng) = 1,73% và P(giảm) = 0,34%.

| Đặc trưng (đến hết d−1) | Nhóm | n | P(tăng) (số sự kiện) | Lift tăng | P(giảm) (số sự kiện) | Lift giảm |
|---|---|---|---|---|---|---|
| volZ ngày d−1 | 10% thấp nhất | 3.301 | 0,51% (17) | 0,30 | 0,03% (1) | 0,09 |
| | 10% cao nhất (≥ 1,44) | 3.301 | 5,33% (176) | **3,09** | 1,48% (49) | **4,37** |
| volZ cao nhất trong d−5…d−1 | 10% thấp nhất | 3.303 | 0,61% (20) | 0,35 | 0,06% (2) | 0,18 |
| | 10% cao nhất (≥ 2,76) | 3.305 | 4,63% (153) | 2,68 | 1,15% (38) | 3,39 |
| Residual tích lũy d−5…d−1 | 10% thấp nhất (≤ −10,5%) | 3.301 | 1,00% (33) | 0,58 | 0,27% (9) | 0,80 |
| | 10% cao nhất (≥ +14,1%) | 3.301 | 4,88% (161) | 2,82 | 1,36% (45) | 4,02 |
| Cách đỉnh 20 ngày | 10% xa đỉnh nhất (≤ −40%) | 3.301 | 1,61% (53) | 0,93 | 0,36% (12) | 1,07 |
| | 10% sát đỉnh nhất (≥ −5,2%) | 3.301 | 3,60% (119) | 2,09 | 0,64% (21) | 1,87 |
| Cách đáy 20 ngày | 10% sát đáy nhất (≤ +3,3%) | 3.301 | 0,76% (25) | 0,44 | 0,48% (16) | 1,43 |
| | 10% xa đáy nhất (≥ +57%) | 3.301 | 3,70% (122) | 2,14 | 1,03% (34) | 3,04 |
| ATR5/ATR20 | 10% **nén nhất** (≤ 0,66) | 3.301 | 0,64% (21) | **0,37** | 0,12% (4) | 0,36 |
| | 10% giãn nhất (≥ 1,39) | 3.301 | 4,21% (139) | 2,44 | 1,09% (36) | 3,21 |
| Funding TB ngày d−1 | < −0,02% | 1.937 | 2,58% (50) | 1,49 | 0,93% (18) | 2,74 |
| | −0,02% … 0 | 7.242 | 1,71% (124) | 0,99 | 0,30% (22) | 0,90 |
| | 0 … 0,01% (mức thường) | 20.510 | 1,58% (325) | 0,92 | 0,27% (55) | 0,79 |
| | > 0,01% | 3.315 | 2,14% (71) | 1,24 | 0,51% (17) | 1,51 |

Funding dồn rất nhiều ở mức mặc định 0,01%, nên ở đây dùng nhóm cố định thay cho thập phân vị. Lưu ý thêm: chu kỳ funding của các coin khác nhau (4h hoặc 8h), nên so sánh mức funding giữa các coin chỉ mang tính thô.

### 3b. So khớp cùng ngày

Bảng dưới là phân vị trung bình của coin có sự kiện so với các coin khác **trong cùng ngày**. Mốc 50 nghĩa là không khác gì các coin còn lại.

| Đặc trưng | Sự kiện tăng (n=570) | Sự kiện giảm (n=112) |
|---|---|---|
| volZ d−1 | 68,3 | 71,5 |
| volZ cao nhất d−5…d−1 | 66,2 | 68,5 |
| Residual d−5…d−1 | 66,0 | 63,1 |
| Cách đỉnh 20 ngày (cao = sát đỉnh) | 59,9 | 60,6 |
| Cách đáy 20 ngày (cao = xa đáy) | 64,3 | 63,5 |
| ATR5/ATR20 | 65,1 | 67,6 |
| Funding d−1 | 46,7 | 46,5 |

### 3c. Đột biến khối lượng (volume spike) trước sự kiện

"Đột biến" ở đây nghĩa là volZ cao nhất trong 5 ngày trước sự kiện vượt một ngưỡng.

| Ngưỡng | % sự kiện có đột biến trước đó | % coin-day không sự kiện có đột biến | P(event \| đột biến) | P(event \| không đột biến) |
|---|---|---|---|---|
| volZ ≥ 2 | **282/682 = 41,3%** | 17,5% | 4,74% | 1,48% |
| volZ ≥ 3 | 173/682 = 25,4% | 8,1% | 6,22% | 1,68% |
| volZ ≥ 2, **bỏ coin-day có sự kiện trong 5 ngày trước** | 133/485 = 27,4% | 12,6% | 3,42% | 1,34% |
| volZ ≥ 3, bỏ như trên | 61/485 = 12,6% | 4,6% | 4,29% | 1,47% |

Cách đọc:

- Có đột biến khối lượng trước sự kiện thì khả năng có sự kiện **cao hơn mức ngẫu nhiên khoảng 2,5–3 lần**.
- Nhưng **độ chính xác vẫn thấp**: trong 100 lần đột biến volZ ≥ 2 chỉ có khoảng 3–5 lần đi kèm sự kiện trong ngày kế tiếp. Hơn 95% là báo động giả.
- Một phần tín hiệu chỉ là "sự kiện trước gây ra sự kiện sau" (coin đang "nóng"). Khi bỏ phần này đi, tỷ lệ sự kiện có đột biến trước giảm từ 41% xuống 27%.

### Kết luận phần "trước"

1. Điều báo trước rõ nhất là **"coin đang nóng"**: khối lượng cao, đã chạy mạnh 5 ngày trước, biên độ đang **giãn** ra, giá xa đáy hoặc sát đỉnh 20 ngày. Cả sự kiện tăng lẫn sự kiện giảm đều xảy ra nhiều hơn trong trạng thái này.
   - Nói cách khác, các đặc trưng này báo trước **"sắp có biến động lớn"**, nhưng **không báo trước chiều**.
2. **Nén biến động (squeeze) KHÔNG báo trước sự kiện.** Ngược lại, coin đang bị nén có xác suất sự kiện chỉ bằng **0,37 lần** mức cơ sở.
   - Ở khung 1d và với định nghĩa này, câu "nén lâu thì nổ" không đúng.
   - Lưu ý: ngưỡng sự kiện là 3σ, nên coin đang nén có σ nhỏ, về nguyên tắc **dễ** vượt ngưỡng hơn. Dù vậy, kết quả vẫn ngược lại.
3. Funding cực âm (< −0,02%) đi kèm lift 1,5 cho sự kiện tăng và 2,7 cho sự kiện giảm, nhưng **mẫu nhỏ** (68 sự kiện). So khớp cùng ngày thì funding gần như không khác (phân vị 47).
4. Khoảng **một nửa sự kiện (59%) không có đột biến khối lượng nào trong 5 ngày trước**: biểu đồ không cho thấy gì trước khi chúng xảy ra.

---

## 4. Sau sự kiện: tiếp diễn hay đảo chiều?

Ô bảng ghi theo thứ tự: **TB / TB cắt đuôi 5% / trung vị / % tiếp diễn**.

- "TB cắt đuôi 5%" (winsorized mean) là trung bình sau khi kéo các giá trị nằm ngoài khoảng 5%–95% về mép, để vài cú bơm nghìn phần trăm không làm lệch kết quả.
- "Tiếp diễn" nghĩa là residual tích lũy cùng dấu với sự kiện.
- **Mức tham chiếu** cho mọi coin-day: residual tương lai dương ở 46–47% số ngày, âm ở 53–54%. Trung vị +5 ngày là −0,7%, trung vị +20 ngày là −1,1%. Tức là altcoin nói chung đuối dần so với BTC.

### Tất cả sự kiện

| Nhóm | n | +1d | +3d | +5d | +10d | +20d |
|---|---|---|---|---|---|---|
| Tăng | 570 | 1,8 / 1,1 / −0,8% / 46% | 2,9 / 0,7 / −2,7% / 42% | 5,5 / 0,4 / **−4,1%** / **37%** | 2,7 / −0,1 / −5,2% / 38% | 7,5 / 2,0 / −4,9% / 42% |
| Giảm | 112 | −1,6 / −1,8 / −1,6% / 62% | 2,3 / −2,7 / −2,6% / 59% | 1,0 / −2,6 / −2,4% / **65%** | 9,0 / 3,1 / −1,7% / 55% | 23,7 / 0,4 / −3,9% / 60% |
| Tham chiếu: mọi coin-day | 33.004 | 0,3 / 0,1 / −0,3% | 1,1 / 0,3 / −0,5% | 1,9 / 0,5 / −0,7% | 4,4 / 1,1 / −0,8% | 7,8 / 2,3 / −1,1% |

### (a) Cú nhảy một ngày, hay sau một chuỗi đã chạy?

"Sau chạy" nghĩa là residual 5 ngày trước sự kiện đã đi cùng chiều hơn 10%.

| Nhóm | n | +1d | +5d | +20d |
|---|---|---|---|---|
| Tăng – đột ngột | 361 | 1,9 / 1,1 / −0,7% / 46% | 3,4 / 0,5 / −3,5% / 35% | 4,9 / 2,3 / −4,6% / 40% |
| Tăng – sau chạy | 209 | 1,6 / 1,0 / −1,6% / 46% | 9,1 / 0,3 / **−6,2%** / 41% | 12,0 / 4,4 / −5,6% / 45% |
| Giảm – đột ngột | 103 | −1,7 / −2,1 / −1,8% / 61% | 0,8 / −2,7 / −2,3% / 65% | 7,7 / 0,5 / −3,5% / 59% |
| Giảm – sau chạy | **9** | 0,1 / 0,1 / −1,1% / 67% | 2,8 / 2,8 / −2,8% / 67% | (n=9, quá nhỏ để đọc) |

### (b) Có hay không có đột biến khối lượng ngay trong ngày sự kiện (volZ ≥ 2)

| Nhóm | n | +1d | +5d | +20d |
|---|---|---|---|---|
| Tăng – có đột biến | 382 | 1,7 / 1,1 / −1,1% / 45% | 6,5 / 0,7 / −4,4% / 37% | 10,3 / 4,0 / −6,2% / 40% |
| Tăng – không đột biến | 188 | 1,9 / 1,4 / −0,2% / 48% | 3,5 / 0,3 / −3,0% / 38% | 1,9 / −0,4 / −2,7% / 46% |
| Giảm – có đột biến | 46 | −1,6 / −1,8 / −2,3% / 65% | −2,7 / −3,8 / −1,3% / 62% | 58,5 / 2,8 / −2,2% / 55% |
| Giảm – không đột biến | 66 | −1,5 / −2,0 / −1,4% / 59% | 3,5 / −1,7 / −3,1% / 68% | 0,1 / −2,6 / −5,3% / 63% |

### (c) Trùng ngày cả thị trường, hay riêng lẻ/ít coin

| Nhóm | n | +1d | +5d | +20d |
|---|---|---|---|---|
| Tăng – trùng ngày cả thị trường | 357 | 1,2 / 0,8 / −0,8% / 45% | 8,0 / 1,2 / −4,1% / 35% | 8,2 / 3,1 / −4,7% / 41% |
| Tăng – riêng lẻ/ít coin | 213 | 2,8 / 3,1 / −0,8% / 47% | 1,3 / −0,4 / −3,7% / 41% | 6,2 / 0,0 / −7,2% / 43% |
| Giảm – trùng ngày cả thị trường | 32 | −1,9 / −1,9 / −2,7% / 69% | 1,7 / 1,6 / −2,3% / 72% | 9,5 / 9,4 / −1,3% / 50% |
| Giảm – riêng lẻ/ít coin | 80 | −1,4 / −1,6 / −1,3% / 59% | 0,7 / −3,9 / −2,7% / 63% | 29,6 / −2,0 / −5,8% / 64% |

### Kết luận phần "sau"

- **Sự kiện tăng:** một coin-day **điển hình** sẽ **trả lại một phần** sau đó.
  - Trung vị +5 ngày là −4,1%, so với mức tham chiếu −0,7%.
  - Chỉ 37% số trường hợp còn tăng tiếp, thấp hơn mức nền 46%.
  - Nhưng trung bình thô lại **dương**, vì một số ít ca "bơm tiếp" hàng trăm, hàng nghìn phần trăm (RAVE +1478% sau 5 ngày).
  - Phân phối kiểu "vé số": thường thua ít, đôi khi thắng rất lớn.
- **Sự kiện giảm:** **tiếp diễn** nhiều hơn mức nền. 65% còn yếu tiếp ở +5 ngày, so với 54% của mọi coin-day.
  - Trung vị chỉ −2,4%, và **mẫu nhỏ** (n=112).
- Trả lại mạnh nhất là **cú tăng sau một chuỗi đã chạy** (trung vị −6,2% sau 5 ngày).
- Có hay không có đột biến khối lượng trong ngày sự kiện làm thay đổi trung vị khá ít.

---

## 5. Cụm thời gian: tin riêng hay sóng cả thị trường?

Bảng dưới so sánh số ngày quan sát được với số ngày kỳ vọng nếu các sự kiện xảy ra **độc lập** với nhau. Kỳ vọng được tính bằng Binomial (phân phối nhị thức) theo số coin có mặt mỗi ngày, với p = 2,07%.

| Số sự kiện trong một ngày | Số ngày quan sát | Kỳ vọng nếu độc lập |
|---|---|---|
| 0 | 109 | 54,1 |
| 1 | 87 | 102,5 |
| 2 | 69 | 97,2 |
| 3–4 | 55 | 90,6 |
| 5–9 | 33 | 15,6 |
| ≥ 10 | **7** | **≈ 0,0** |

- **Sự kiện tụ thành cụm rất rõ.** Số ngày không có sự kiện nào gấp đôi kỳ vọng. Ngày có ≥ 5 sự kiện là 40, so với kỳ vọng khoảng 16.
- **389/682 (57%)** sự kiện thuộc nhãn "trùng ngày cả thị trường" (cùng ngày có ≥ 3 sự kiện cùng chiều). Chỉ **87 (13%)** là "riêng lẻ", tức duy nhất trong ngày của nó.
- **Ngày BTC biến động hơn 4%** có trung bình 3,71 sự kiện mỗi ngày, so với 1,74 vào ngày thường.
  - Phần lớn là do β 60 ngày **không bắt kịp** β thực của altcoin trong ngày biến động mạnh, hoặc do có một nhân tố "altcoin chung" mà mô hình chỉ dùng BTC không bắt được.
  - Ví dụ: ngày 2026-08-21 BTC +7,3% có 14 sự kiện tăng; ngày 2026-02-05 BTC −14% có 13 sự kiện "tăng" dù giá thô của các coin đó đều giảm.
- **Theo nhóm ngành:** trong các cặp sự kiện cùng ngày cùng chiều, 15,5% thuộc cùng nhóm ngành, so với 12,2% nếu ghép ngẫu nhiên. Có hơi cùng ngành hơn, nhưng rất yếu, và thẻ ngành của Binance khá thô.

Các ngày có nhiều sự kiện nhất:

| Ngày | BTC | Số sự kiện (tăng/giảm) | Các coin lớn nhất (nhóm) |
|---|---|---|---|
| 2026-06-04 | −0,4% | 14 (1/13) | 龙虾 +28%, ZEC −25%, NEAR −22%, INJ −17%, FET −14%, HYPE −13%, VIRTUAL −12%, SEI −12% … |
| 2026-08-21 | +7,3% | 14 (14/0) | BCH, ZEC, 1000PEPE, 币安人生, AAVE, PENGU, CRV, ETC … |
| 2025-11-07 | +2,0% | 14 (14/0) | H +107%, FIL +75%, FET +54%, STRK, NEAR, TIA, ETC, DOT … |
| 2026-02-05 | −14,0% | 13 (13/0) | (giá thô đều giảm; "tăng" do mô hình β, xem mục 1) |
| 2026-04-16 | +0,4% | 11 (11/0) | SIREN +151%, PIPPIN +59%, M, TIA, EIGEN, LDO, ENA, ARB … |
| 2026-06-03 | −3,9% | 10 (10/0) | WLD +45%, 龙虾, ENA, FARTCOIN, XMR, XPL, WIF, PUMP … |
| 2026-05-08 | +0,2% | 10 (10/0) | ONDO, STRK, ICP, FIL, OP, TIA, EIGEN, ARB … |
| 2026-02-14 | +1,4% | 9 (8/1) | USELESS, 1000PEPE, ZEC, PENGU, WIF, DOGE (nhiều meme); KITE −19% |

Ghi chú thêm về 2026-06-03 → 2026-06-04: hai ngày liền nhau có nhiều coin cùng tăng mạnh rồi cùng giảm mạnh. Số liệu chỉ cho thấy dạng "cả rổ coin lên rồi xuống"; ghi chú này **không suy đoán nguyên nhân**.

---

## 6. Xu hướng có giải thích được không?

So sánh giá đóng cửa ngày d−1 với SMA:

| Nhóm | % trên SMA20 | % trên SMA50 |
|---|---|---|
| Mọi coin-day | 40,9% | 37,4% |
| Sự kiện tăng (n=570) | **63,3%** | 56,0% |
| Sự kiện giảm (n=112) | 57,1% | 55,4% |

| Điều kiện | P(tăng) | P(giảm) |
|---|---|---|
| Trên SMA20 | 2,68% | 0,47% |
| Dưới SMA20 | 1,07% | 0,25% |
| Trên SMA50 | 2,59% | 0,50% |
| Dưới SMA50 | 1,21% | 0,24% |

- **63% sự kiện tăng lớn xảy ra ở coin đã nằm trên SMA20**, so với 41% của mọi coin-day. Xác suất có cú tăng lớn ở coin đang trên SMA20 cao gấp khoảng **2,5 lần** coin đang dưới SMA20.
- Tính chung, số sự kiện "cùng chiều xu hướng" là 60,0% theo SMA20 (kỳ vọng ngẫu nhiên 43,9%) và 54,1% theo SMA50 (kỳ vọng 41,5%).
- **Nhưng sự kiện giảm cũng xảy ra nhiều hơn ở coin đang trên SMA20** (57%, so với nền 41%). Tức là cú giảm lớn thường là cú **sập sau khi đã tăng**, không phải "xu hướng giảm tiếp diễn".
  - Do đó, con số "60% cùng chiều xu hướng" thực chất đến từ sự kiện tăng. Ý nghĩa thật của nó là: **coin đang trong xu hướng tăng thì biến động lớn hơn theo cả hai chiều.**
- Như vậy, xu hướng giải thích được **một phần chiều tăng**. Nó không giải thích cú sập và không giải thích độ lớn của cú bơm.

---

## 7. Kiểm tra giao dịch thử (chỉ để mô tả, KHÔNG phải chiến lược)

Cách làm:
- Vào lệnh ở giá mở cửa ngày d+1, thoát ở giá đóng cửa ngày d+5.
- Trừ phí khứ hồi 0,12%.
- Dùng lợi nhuận **thô** (chưa trừ phần BTC).
- t-stat thô bỏ qua việc nhiều sự kiện rơi cùng một ngày, nên thực tế còn **thổi phồng** độ tin cậy. Chỉ có 225 ngày khác nhau cho chiều tăng và 69 ngày cho chiều giảm.

| Quy tắc | n | TB | TB cắt đuôi 5% | Trung vị | % thắng | t-stat thô | Số ngày khác nhau |
|---|---|---|---|---|---|---|---|
| Mua theo sau sự kiện tăng | 568 | +4,59% | −0,65% | −4,77% | 38% | 1,48 | 225 |
| Short ngược chiều (fade) sau sự kiện tăng | 568 | −4,83% | +0,41% | +4,53% | 62% | −1,56 | 225 |
| Short theo sau sự kiện giảm | 110 | −0,52% | +2,82% | +3,75% | 62% | −0,14 | 69 |
| Mua ngược chiều (fade) sau sự kiện giảm | 110 | +0,28% | −3,06% | −3,99% | 36% | 0,08 | 69 |
| *Tham chiếu: mua mọi coin-day* | 32.504 | +1,10% | −0,36% | −1,30% | 43% | — | 355 |
| Mua theo sự kiện tăng (bỏ sự kiện lặp ≤ 5 ngày) | 422 | +6,41% | +0,02% | −4,10% | 39% | 1,61 | 188 |
| Fade sự kiện tăng (bỏ lặp) | 422 | −6,65% | −0,26% | +3,86% | 60% | −1,67 | 188 |
| Short theo sự kiện giảm (bỏ lặp) | 59 | −0,89% | +4,17% | +5,95% | 61% | −0,14 | 45 |
| Mua theo tăng – nửa đầu (trước 2026-04-21) | 232 | +6,44% | −1,26% | −4,74% | 38% | 0,94 | 99 |
| Mua theo tăng – nửa sau | 336 | +3,32% | −0,16% | −4,94% | 38% | 1,45 | 126 |

Cách đọc:

- **Không quy tắc nào có ý nghĩa thống kê** (mọi |t| < 1,7, và đây còn là t-stat đã bị thổi phồng).
- "Mua theo" có trung bình dương nhờ vài ca bơm cực lớn, nhưng thua ở 62% số lần.
- "Fade cú tăng" thắng 62% số lần, nhưng trung bình **âm**, vì chỉ một lần coin bơm tiếp là xóa sạch mọi lần thắng. Một lệnh short không có điểm cắt lỗ trên coin vừa bơm là rủi ro **không giới hạn**.
- "Short theo cú giảm" có trung vị +3,75%, nhưng chỉ 110 lần trên 69 ngày, trung bình âm, t ≈ 0. **Mẫu nhỏ.**
- **Toàn bộ kết quả là in-sample, trên một chu kỳ khoảng 14 tháng duy nhất.**
  - Universe được chọn theo khối lượng của **cả** giai đoạn, nên có nhìn trước nhẹ.
  - Universe chỉ gồm coin **còn niêm yết hôm nay**, nên có thiên lệch sống sót (survivorship bias): coin đã bị hủy niêm yết sau khi sập không có mặt.
  - Chưa tính trượt giá (slippage), funding trong 5 ngày giữ lệnh, hay khả năng không vào được lệnh ở giá mở cửa của coin vừa bơm.

---

## 8. Kết luận cho Coin Radar

1. **Biến động riêng lớn là chuyện thường ở altcoin.** Khoảng 2% coin-day vượt ngưỡng 3σ và 8%, và 95/100 coin có ít nhất một lần. Chiều tăng nhiều gấp 5 lần chiều giảm. Đuôi cực lớn (trên 100% một ngày) tập trung ở coin nhỏ, coin "Alpha" và coin mới.
2. **Biểu đồ báo trước được "coin đang nóng", không báo trước được "coin sắp nổ theo chiều nào".**
   - Khối lượng tăng, đã chạy mạnh, biên độ giãn, xa đáy 20 ngày: mỗi đặc trưng nâng xác suất có sự kiện lên khoảng 2–4 lần, nhưng xác suất tuyệt đối vẫn chỉ khoảng 3–6%.
   - Khoảng 59% sự kiện **không có** đột biến khối lượng nào trong 5 ngày trước.
   - Phần không báo trước này phù hợp với giả thuyết "tin riêng / sự kiện ngoài biểu đồ". Nhưng **dữ liệu ở đây không chứng minh được nguyên nhân**, vì repo không có dữ liệu tin tức hay unlock.
3. **Squeeze (nén biến động) ở khung 1d không báo trước cú bùng nổ**, mà còn ngược lại (lift 0,37). Coin Radar không nên dùng "nén" như một tín hiệu sắp có biến động riêng, ít nhất ở khung ngày.
4. **Phần lớn "biến động riêng" thật ra là sóng chung.** 57% sự kiện rơi vào ngày có từ 3 coin trở lên cùng bùng nổ cùng chiều. Chỉ 13% thực sự riêng lẻ.
   - Nếu Coin Radar muốn tách "tin riêng" khỏi "sóng chung", nên so sánh với **rổ altcoin cùng ngày** (chẳng hạn trung vị lợi nhuận của universe), không chỉ với BTC.
   - Mô hình β theo BTC tạo ra sự kiện giả trong những ngày BTC biến động mạnh.
5. **Sau cú tăng lớn:** trường hợp điển hình là trả lại một phần (trung vị −4% sau 5 ngày; chỉ 37% tăng tiếp). Nhưng đuôi phải rất dày.
   - Đuổi theo không có lợi thế rõ.
   - Đánh ngược thì thắng thường xuyên nhưng có thể mất rất lớn.
   - Gợi ý cho Coin Radar: khi một coin vừa có cú tăng vượt 3σ, đây là **cảnh báo rủi ro** (dễ trả lại, rất khó đoán), **không phải tín hiệu vào lệnh**.
6. **Sau cú giảm lớn:** nghiêng về tiếp diễn (65% so với nền 54% ở +5 ngày), nhưng mẫu chỉ có 112 sự kiện và 69 ngày, chưa đủ để tin.
7. **Xu hướng giải thích một phần:** cú tăng lớn xảy ra nhiều hơn khoảng 2,5 lần ở coin đang trên SMA20. Nhưng cú sập cũng hay xảy ra ở coin đang tăng. Xu hướng là **bối cảnh rủi ro**, không phải lời giải thích nguyên nhân.
8. **Giới hạn dữ liệu cần ghi nhớ:**
   - Một chu kỳ khoảng 14 tháng, in-sample.
   - Universe có thiên lệch sống sót và có nhìn trước nhẹ.
   - Giai đoạn 60 ngày đầu sau niêm yết bị loại khỏi phân tích.
   - Không có OI dài hạn, không có tin tức, không có lịch unlock.
   - Để trả lời trọn câu hỏi "do tin hay do unlock", cần thêm một nguồn lịch unlock hoặc tin tức có dấu thời gian, rồi ghép vào danh sách sự kiện ở đây.

---

*Script (nằm ngoài repo, chỉ đọc dữ liệu):*
- `/tmp/claude-1000/-home-admin1/9a91f9f2-51e2-4583-8952-2aee756c391e/scratchpad/idio/load.ts`: nạp dữ liệu và chọn universe.
- `/tmp/claude-1000/-home-admin1/9a91f9f2-51e2-4583-8952-2aee756c391e/scratchpad/idio/analyze.ts`: phân tích. Kết quả thô nằm ở `results.txt` và `events.json` cùng thư mục.

*Chạy lại từ `/home/admin1/coin-radar` bằng:* `node <đường dẫn>/load.ts && node <đường dẫn>/analyze.ts`
