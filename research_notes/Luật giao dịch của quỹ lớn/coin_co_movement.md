# Top 100 coin cùng tăng, cùng giảm thế nào — số liệu đồng biến từ cache Binance

> Ghi chú nghiên cứu (cập nhật 2026-10-20). Đây là phân tích **cấu trúc thị trường**, không dùng để tinh chỉnh chiến lược.
> Dữ liệu là **Binance USDⓈ-M perp**, đọc từ `data/cache` (chỉ đọc, không tải thêm). Số liệu dừng ở **2026-10-18**, ngày cuối là nến đóng trước 2026-10-19.
>
> **Thuật ngữ** (giải thích ở lần đầu dùng):
> - **log return** (lợi suất log) = ln(giá hôm nay / giá hôm qua). Gần bằng % thay đổi khi biến động nhỏ, và cộng dồn được.
> - **correlation (corr, tương quan)**: từ −1 đến +1. Bằng +1 nghĩa là luôn cùng chiều, cùng tỷ lệ. Bằng 0 nghĩa là không có quan hệ tuyến tính.
> - **beta (β)**: khi BTC đi 1% thì coin đi trung bình bao nhiêu %. β = 1,3 nghĩa là BTC −1% thì coin ≈ −1,3%.
> - **upside / downside beta (β+ / β−)**: beta chỉ tính trên các ngày BTC tăng, hoặc chỉ trên các ngày BTC giảm.
> - **dispersion (độ phân tán chéo)**: trong cùng một ngày, lợi suất của các coin lệch nhau bao nhiêu (đo bằng std hoặc IQR). Phân tán thấp nghĩa là cả rổ đi "đồng loạt".
> - **IQR**: khoảng giữa phân vị 25% và 75%. Khác std, IQR ít bị một coin bơm/xả cực đoan kéo lệch.
> - **R² (hệ số xác định)**: tỷ lệ biến động của lợi suất alt mà mô hình giải thích được (0–1).
> - **lead–lag (dẫn–trễ)**: biến động của BTC ở giờ này có báo trước biến động của alt ở giờ sau không.
> - **hierarchical clustering, average-linkage (gom cụm phân cấp, liên kết trung bình)**: bắt đầu với mỗi coin là một cụm, rồi lần lượt gộp hai cụm "gần nhau nhất". Khoảng cách giữa hai coin = 1 − corr; khoảng cách giữa hai cụm = trung bình khoảng cách mọi cặp coin.
> - **residual (phần dư)**: phần lợi suất còn lại sau khi trừ phần "do BTC kéo" (β × lợi suất BTC).
> - **realized volatility (vol thực hiện)**: độ lệch chuẩn của lợi suất ngày trong 14 ngày gần nhất.
> - **altseason**: giai đoạn đa số altcoin tăng mạnh hơn BTC.
> - **N_eff (số cược độc lập hiệu dụng)**: N lệnh tương quan ρ với nhau chỉ đa dạng hoá bằng N/(1+(N−1)ρ) lệnh độc lập.

## ⚠ Giới hạn — đọc trước
- **Chỉ ~14 tháng dữ liệu (422 ngày), tức một chu kỳ thị trường duy nhất.** Đó lại là một chu kỳ BTC đi xuống: BTC −28,9%, và BTC nằm trong vùng drawdown (sụt từ đỉnh) > 20% ở 340/392 cửa sổ 30 ngày. Kết luận có thể khác trong thị trường tăng kéo dài.
- Các nhóm ngày cực đoan có **mẫu nhỏ**: BTC < −5% chỉ có **7 ngày**, BTC > +5% chỉ có **11 ngày**. Hai dòng này chỉ để tham khảo.
- Dữ liệu 1h chỉ có **~4,5 tháng** (3.408 nến) và 15m chỉ **~4 tháng**.
- **Thiên lệch chọn mẫu**: universe chọn theo khối lượng *trong chính giai đoạn này* và chỉ giữ coin có ≥ 400 ngày dữ liệu. Vì vậy universe có nhiều coin "bơm–xả" thanh khoản lớn (JELLYJELLY, BULLA, SIREN…) và bỏ sót coin niêm yết sau ~11/9/2025.
- Mọi kết quả dưới đây là **tương quan cùng thời điểm, không phải nhân quả**. Volume z-score được đo **cùng ngày** với lợi suất, nên không dùng được để dự báo.

## 1. Phương pháp

| Bước | Chi tiết |
|---|---|
| Nguồn | `data/cache/klines/<SYMBOL>/{1d,1h,15m}/`, nạp bằng `loadCandles()` của `backtest/data.ts`. Funding lấy từ `data/cache/funding/<SYMBOL>.json` (từng kỳ 8h; tính tổng theo ngày UTC). |
| Độ phủ kiểm tra thực tế | 1d: 2025-08-23 → 2026-10-18 (523/523 mã có tệp). 1h: bắt đầu 2026-05-29 04:00 UTC. 15m: bắt đầu 2026-06-13 19:00 UTC (513 mã). 5m: từ 2026-06-17, chỉ 150 mã (không dùng). 4h: từ 2026-03 (không dùng). |
| Lỗi nạp | 1d: **0/523** lỗi. 1h và 15m: **0/100** lỗi. Funding: đọc được **100/100**. Script ném lỗi rõ ràng chứ không nuốt; lần chạy đầu với 15m từ 2026-06-01 báo thiếu độ phủ cho cả 100 mã nên đã dời ngày bắt đầu. |
| Universe | Xếp hạng USDT perp theo **quoteVolume trung bình/ngày** (tổng quoteVolume chia 422 ngày). Loại USDC (stablecoin), PAXG và XAUT (vàng token hoá). Chỉ giữ mã có ≥ 400/422 ngày nến. Lấy 100 mã đầu. Mã nhỏ nhất ≈ 25,9 triệu USDT/ngày. |
| Lợi suất | log return theo ngày UTC (nến 1d). Có 421 ngày lợi suất BTC. |
| Script | `/tmp/claude-1000/-home-admin1/9a91f9f2-51e2-4583-8952-2aee756c391e/scratchpad/comove/analyze.ts` và `lib.ts` (tự viết: OLS, corr, gom cụm; không dùng thư viện ngoài). Chạy bằng `node analyze.ts`, khoảng 1–2 phút. |

**Universe (100 mã, xếp theo khối lượng):** BTC, ETH, SOL, XRP, ZEC, DOGE, BNB, HYPE, 1000PEPE, SUI, ADA, ENA, AVAX, LINK, NEAR, PUMP, WLD, XPL, TAO, WLFI, UNI, BCH, LTC, FIL, PIPPIN, TRUMP, AAVE, FARTCOIN, DOT, MYX, PENGU, DASH, ARB, AVNT, XLM, ONDO, WIF, SIREN, TRX, 1000BONK, 1000SHIB, APT, VIRTUAL, H, HBAR, ICP, CRV, BIO, FET, TIA, INJ, OP, BANK, XMR, SOMI, ZEN, ETC, STRK, JELLYJELLY, AXS, LDO, ETHFI, SEI, QNT, VVV, LINEA, VELVET, M, USELESS, EIGEN, SKYAI, ORDI, LSK, NMR, UB, BERA, TUT, HEMI, TNSR, PYTH, ZRO, KAITO, STO, RENDER, GALA, BAS, SOON, ATOM, 1000LUNC, SAND, DEXE, BULLA, ESPORTS, Q, ZK, JTO, MERL, POL, BTR, RESOLV.

**Mã thanh khoản cao bị loại vì thiếu lịch sử** (nằm trong top 130 theo khối lượng nhưng có < 400 ngày): ASTER(395d), RIVER, LAB, BEAT, RAVE, COAI, GIGGLE, 币安人生, 0G, AKE, LIGHT, BLESS, LIT, EVAA, ALLO, BSB, POWER, PIEVERSE, MMT, BTW, ENSO, FF, MON, 4, KITE, STBL, BARD, CHIP, ZBT, CLO, TRADOOR, FOLKS, NIGHT (33 mã).

## 2. Tương quan và beta với BTC (99 alt, lợi suất ngày)

| Chỉ số | P10 | Q1 | Trung vị | Q3 | P90 |
|---|---|---|---|---|---|
| corr với BTC | 0,12 | 0,31 | **0,51** | 0,65 | 0,73 |
| beta | 0,61 | 1,00 | **1,30** | 1,44 | 1,59 |
| β+ (ngày BTC tăng) | 0,27 | 0,65 | **0,95** | 1,14 | 1,34 |
| β− (ngày BTC giảm) | 0,80 | 1,09 | **1,32** | 1,49 | 1,67 |
| β− / β+ | 0,57 | 1,03 | **1,36** | 1,65 | 2,97 |

- **85/99 alt có β− > β+**: alt "ăn" cú giảm của BTC mạnh hơn cú tăng.
- BTC có 206 ngày tăng (trung bình +1,52%) và 215 ngày giảm (trung bình −1,62%). Trong cùng các ngày đó, alt điển hình có lợi suất trung bình +2,02% khi BTC tăng và −2,42% khi BTC giảm. Như vậy alt khuếch đại **1,32× khi tăng và 1,50× khi giảm**. Con số này đã gồm xu hướng trôi xuống của alt trong giai đoạn.

**10 alt tương quan cao nhất**

| Coin | corr | beta | β+ | β− |
|---|---|---|---|---|
| ETH | 0,90 | 1,29 | 1,27 | 1,29 |
| XRP | 0,87 | 1,30 | 1,35 | 1,25 |
| SOL | 0,85 | 1,34 | 1,10 | 1,30 |
| LINK | 0,81 | 1,35 | 1,16 | 1,30 |
| ADA | 0,80 | 1,44 | 1,33 | 1,33 |
| DOGE | 0,79 | 1,32 | 1,23 | 1,23 |
| SUI | 0,78 | 1,59 | 1,39 | 1,52 |
| BNB | 0,76 | 0,90 | 0,68 | 0,99 |
| 1000SHIB | 0,74 | 1,17 | 1,01 | 1,12 |
| PENGU | 0,74 | 1,78 | 1,48 | 1,49 |

**10 alt tương quan thấp nhất** (phần lớn là coin mới hoặc coin bơm–xả; β+/β− của nhóm này nhiễu, đừng đọc quá sâu)

| Coin | corr | beta | β+ | β− |
|---|---|---|---|---|
| VELVET | −0,01 | −0,10 | −0,23 | 0,74 |
| SIREN | 0,02 | 0,18 | −0,65 | 0,53 |
| JELLYJELLY | 0,03 | 0,18 | 0,25 | −0,01 |
| ESPORTS | 0,04 | 0,38 | 1,18 | 0,54 |
| BULLA | 0,05 | 0,41 | 0,05 | −0,41 |
| M | 0,05 | 0,23 | 0,12 | 0,53 |
| Q | 0,06 | 0,30 | −0,82 | 1,26 |
| BAS | 0,09 | 0,61 | −0,22 | 1,07 |
| BTR | 0,09 | 0,59 | −0,54 | 1,00 |
| H | 0,11 | 0,91 | −0,14 | 0,65 |

**Trả lời: alt có giảm mạnh hơn tăng so với BTC không?** Có. Trung vị β− là 1,32, còn β+ là 0,95. Nói cách khác, khi BTC giảm, alt điển hình giảm khoảng **1,3–1,5×** BTC. Khi BTC tăng, alt điển hình chỉ tăng khoảng **0,9–1,3×**.

## 3. Tương quan theo thời gian và các ngày bán tháo

Corr cặp trung bình được tính trên cửa sổ trượt 30 ngày, cho cả 100 mã (392 cửa sổ). Trung vị **0,40**. Thấp nhất **0,22** (cửa sổ kết thúc 2026-08-15, lúc BTC tăng mạnh). Cao nhất **0,61** (kết thúc 2025-10-10, ngày sập).

| Trạng thái BTC trong cửa sổ 30 ngày | Số cửa sổ | Corr cặp TB (trung vị) |
|---|---|---|
| BTC 30d < −10% | 99 | **0,45** |
| BTC 30d −10%..0 | 95 | 0,41 |
| BTC 30d 0..+10% | 135 | 0,38 |
| BTC 30d > +10% | 63 | **0,38** |

- Corr giữa "corr cặp TB" và lợi suất BTC 30 ngày là **−0,44**: BTC càng giảm thì cả rổ càng dính vào nhau.
- Cách chia theo "drawdown từ đỉnh trong mẫu" không dùng được, vì BTC sụt > 20% gần như suốt mẫu (340/392 cửa sổ).

| Tháng | Corr cặp TB | BTC trong tháng |
|---|---|---|
| 2025-09 | 0,50 | +5,3% |
| 2025-10 | 0,56 | −3,9% |
| 2025-11 | 0,49 | −17,6% |
| 2025-12 | 0,40 | −3,0% |
| 2026-01 | 0,41 | −10,2% |
| 2026-02 | 0,55 | −15,0% |
| 2026-03 | 0,41 | +1,9% |
| 2026-04 | 0,39 | +11,8% |
| 2026-05 | 0,34 | −3,5% |
| 2026-06 | 0,40 | −20,4% |
| 2026-07 | 0,29 | +7,3% |
| 2026-08 | 0,30 | +25,0% |
| 2026-09 | 0,40 | +6,4% |
| 2026-10 | 0,38 | −1,8% (tới 18/10) |

**10 ngày giảm mạnh nhất toàn thị trường** (xếp theo trung vị lợi suất của 100 mã). Std bị một coin bơm cực đoan kéo lệch, ví dụ JELLYJELLY +234% ngày 3/11/2025.

| Ngày | BTC | Trung vị 100 mã | % mã giảm | Std chéo | 5 mã tệ nhất | 5 mã tốt nhất |
|---|---|---|---|---|---|---|
| 2025-10-10 | −7,3% | **−26,5%** | 92% | 12,8% | TUT −58%, DEXE −51%, PIPPIN −51%, MYX −48%, SKYAI −47% | DASH +7%, MERL +6%, ZEC +6%, SOON +4%, JELLYJELLY +4% |
| 2026-02-05 | −14,0% | −15,2% | **99%** | 4,5% | BULLA −27%, XMR −23%, USELESS −22%, LDO −20%, VVV −20% | BTR +1%, HEMI −3%, Q −4%, RESOLV −4%, MYX −5% |
| 2025-11-03 | −3,6% | −12,1% | 92% | 25,4% | FARTCOIN −22%, WIF −19%, ATOM −18%, APT −18%, USELESS −18% | JELLYJELLY +234%, DASH +33%, ESPORTS +10%, ZEN +10%, ZEC +4% |
| 2026-01-31 | −6,5% | −9,4% | 92% | 19,5% | Q −24%, USELESS −23%, PIPPIN −20%, MERL −18%, SIREN −16% | BULLA +180%, BTR +3%, VELVET +3%, UB +2%, ESPORTS +2% |
| 2025-08-25 | −3,0% | −9,1% | 96% | 4,0% | FARTCOIN −17%, BIO −17%, USELESS −17%, CRV −14%, ETHFI −14% | ESPORTS +8%, WLFI +3%, M +2%, DEXE +1%, MYX −0% |
| 2026-06-05 | −4,4% | −8,9% | 89% | 6,8% | BANK −21%, XPL −21%, XMR −17%, ZEN −16%, FARTCOIN −16% | VELVET +27%, BAS +11%, TUT +9%, VVV +6%, ESPORTS +6% |
| 2026-06-02 | −6,5% | −7,2% | 86% | 6,6% | UB −34%, SKYAI −24%, ORDI −16%, BERA −16%, PIPPIN −14% | USELESS +15%, ZEC +12%, ONDO +9%, ENA +6%, BIO +5% |
| 2025-09-22 | −2,2% | −7,1% | 93% | 5,4% | BTR −20%, SKYAI −19%, SOMI −18%, RESOLV −17%, BANK −17% | XPL +13%, M +8%, TUT +8%, EIGEN +3%, PIPPIN +3% |
| 2026-01-29 | −5,2% | −6,8% | 92% | 16,2% | Q −38%, PIPPIN −25%, WLD −18%, SOMI −17%, VIRTUAL −13% | BULLA +145%, ZRO +7%, BTR +6%, SKYAI +4%, UB +3% |
| 2025-11-11 | −2,8% | −6,8% | 89% | 8,4% | USELESS −19%, XPL −15%, ZEC −15%, FARTCOIN −14%, STRK −13% | LSK +61%, RESOLV +18%, ESPORTS +8%, MERL +6%, SIREN +6% |

Đối chứng, **10 ngày tăng mạnh nhất**: trung vị 100 mã từ +6,3% đến +11,6%; 85–96% số mã tăng; std chéo 6–18%.

Đọc bảng:
- Ngày sập thường kéo **86–99% số mã** đi xuống. Trung vị alt giảm **mạnh hơn BTC từ ~1,1 đến ~4 lần** (2026-02-05: 1,1 lần; 2025-11-03: 3,4 lần).
- 2025-10-10 là ngoại lệ lớn: BTC −7,3% nhưng alt trung vị −26,5% (gấp ~3,6 lần), và nhiều mã nhỏ mất ~50% trong một ngày. Nghi là thanh lý dây chuyền; dữ liệu nến không chứng minh được nguyên nhân.
- Mã "sống sót" trong ngày sập gần như luôn là mã có câu chuyện riêng (ZEC, DASH, các mã bơm–xả). Chúng không phải "nơi trú ẩn" dự đoán trước được.

## 4. Độ đồng đều theo nhóm ngày BTC

| BTC trong ngày | Số ngày | Trung vị BTC | % alt cùng chiều BTC | Trung vị alt | alt/BTC | Trung vị (alt − β·BTC) | Std chéo (trung vị) | IQR chéo (trung vị) |
|---|---|---|---|---|---|---|---|---|
| < −5% ⚠ mẫu nhỏ | 7 | −6,53% | **91%** | −7,30% | 1,12× | +1,22% | 12,8% | 4,2% |
| −5..−2% | 56 | −2,61% | **83%** | −3,84% | **1,47×** | −0,02% | 5,7% | 3,5% |
| −2..+2% | 309 | +0,04% | 67% | −0,26% | – | −0,35% | 5,8% | 3,0% |
| +2..+5% | 38 | +2,56% | **79%** | +2,37% | **0,92×** | −0,97% | 7,2% | 3,5% |
| > +5% ⚠ mẫu nhỏ | 11 | +6,12% | **89%** | +6,40% | 1,05× | −1,55% | 6,8% | 5,0% |

**Trả lời: chiều giảm có đồng đều hơn chiều tăng không?** Có, nhưng chênh lệch vừa phải.
- Ở mức biến động vừa (±2–5%), 83% alt đi cùng BTC khi BTC giảm, so với 79% khi BTC tăng.
- Rõ hơn là **biên độ**: ngày BTC −2..−5% thì alt giảm **1,47×** BTC; ngày BTC +2..+5% thì alt chỉ tăng **0,92×** BTC.
- Phần dư "alt − β·BTC" âm vào các ngày tăng (−1,0% và −1,6%). Nghĩa là trong mẫu này, **ngày BTC tăng alt thường không theo kịp beta lý thuyết**. Vào ngày giảm vừa, alt giảm đúng như beta dự báo.
- Hai nhóm cực đoan có quá ít ngày nên không kết luận riêng.

## 5. Dẫn–trễ (BTC có đi trước alt không?)

Cách đo: corr(BTC[t], alt[t+k]) cho từng coin, rồi lấy trung vị trên 99 alt. k > 0 nghĩa là BTC đi trước k nến.

| k | 1h: trung vị corr | 1h: số coin corr > 0 | 15m: trung vị corr | 15m: số coin corr > 0 |
|---|---|---|---|---|
| −3 | −0,003 | 47/99 | −0,008 | 11/99 |
| −2 | −0,023 | 9/99 | −0,008 | 17/99 |
| −1 | −0,026 | 10/99 | −0,000 | 49/99 |
| **0** | **0,514** | 99/99 | **0,499** | 99/99 |
| +1 | −0,028 | 9/99 | +0,004 | 71/99 |
| +2 | −0,007 | 32/99 | −0,013 | 9/99 |
| +3 | −0,003 | 43/99 | −0,012 | 12/99 |

- Khung 1h: 2026-05-30 → 2026-10-18, 3.408 nến, sai số chuẩn ≈ ±0,017. Khung 15m: 2026-06-14 → 2026-10-18, 12.192 nến, sai số chuẩn ≈ ±0,009.
- **Gần như toàn bộ đồng biến xảy ra trong cùng một nến.** Ở khung 1h, BTC giờ trước **không** báo trước alt giờ sau. Corr lag +1 hơi âm (−0,028, 90/99 coin âm), tức là có một chút "hồi lại". Sau 171 giờ BTC biến động mạnh (|r| > 0,83%), giờ đó alt đi cùng chiều +1,33%, sang giờ kế tiếp alt trả lại −0,16%.
- Khung 15m: lag +1 chỉ +0,004, nhỏ hơn sai số chuẩn của từng coin. Thêm BTC[t] để dự báo alt[t+1] chỉ làm R² tăng thêm trung vị **0,011%** (1h: 0,038%). Mức này **không đủ trả phí giao dịch**.
- **Alt beta cao có trễ hơn không?** Không. Chia 3 nhóm theo beta ngày, corr lag +1 ở 1h là −0,016 / −0,031 / −0,034; ở 15m là 0,003 / 0,004 / 0,004. Alt beta cao chỉ **đồng biến mạnh hơn cùng lúc**: corr lag 0 là 0,56 ở nhóm beta cao/giữa, so với 0,28 ở nhóm beta thấp. Không thấy alt beta cao phản ứng chậm hơn.
- Muốn biết BTC có dẫn ở mức vài phút hay không thì cần dữ liệu 1m/5m đầy đủ. Hiện 5m chỉ có 150 mã nên chưa đo.

## 6. Nhóm coin

**(a) Chia theo tứ phân vị corr với BTC**

| Nhóm | Số coin | corr BTC TB | beta TB | corr cặp nội nhóm | Thành viên |
|---|---|---|---|---|---|
| Q4 (cao nhất) | 25 | 0,73 | 1,39 | **0,74** | ETH, SOL, XRP, DOGE, BNB, 1000PEPE, SUI, ADA, AVAX, LINK, BCH, LTC, AAVE, PENGU, WIF, 1000BONK, 1000SHIB, APT, VIRTUAL, HBAR, ETC, LDO, SEI, RENDER, GALA |
| Q3 | 25 | 0,59 | 1,43 | 0,59 | HYPE, ENA, NEAR, PUMP, TAO, UNI, FIL, FARTCOIN, DOT, ARB, XLM, ONDO, CRV, FET, TIA, INJ, OP, ETHFI, LINEA, USELESS, EIGEN, PYTH, ATOM, SAND, POL |
| Q2 | 24 | 0,44 | 1,22 | 0,32 | ZEC, WLD, XPL, WLFI, TRUMP, DASH, AVNT, TRX, ICP, BIO, XMR, ZEN, STRK, AXS, QNT, VVV, ORDI, BERA, HEMI, ZRO, KAITO, 1000LUNC, ZK, JTO |
| Q1 (thấp nhất) | 25 | 0,15 | 0,71 | **0,05** | PIPPIN, MYX, SIREN, H, BANK, SOMI, JELLYJELLY, VELVET, M, SKYAI, LSK, NMR, UB, TUT, TNSR, STO, BAS, SOON, DEXE, BULLA, ESPORTS, Q, MERL, BTR, RESOLV |

Nhóm Q4 gần như là **một tài sản**: corr cặp 0,74. Nhóm Q1 gồm các coin mỗi con chạy một kiểu, phần lớn là coin mới hoặc coin bơm–xả.

**(b) Gom cụm phân cấp trên phần dư.** Phần dư lấy sau khi trừ BTC **và** trừ "rổ alt" (trung vị lợi suất alt mỗi ngày), cắt ở mức corr phần dư nội cụm ≥ 0,20. Phải trừ cả rổ alt vì nếu chỉ trừ BTC thì 58/99 coin dính thành một cụm khổng lồ: alt còn một nhân tố chung riêng ngoài BTC. Tên nhóm là phán đoán của người viết theo tên coin, **chưa xác minh**.

| Cụm | Thành viên | corr phần dư | corr thô | Tên nhóm (nghi là) |
|---|---|---|---|---|
| C1 | DOGE, 1000PEPE, 1000SHIB, WIF, 1000BONK, PENGU | 0,31 | **0,84** | meme coin |
| C2 | ETH, LINK, SOL | 0,29 | **0,87** | blue-chip hệ hợp đồng thông minh |
| C3 | XRP, XLM, HBAR | 0,36 | 0,75 | coin "thanh toán" đời cũ (nghi) |
| C4 | ZEC, DASH, ZEN | **0,55** | 0,65 | coin riêng tư (privacy). XMR lại đứng riêng |
| C5 | NEAR, FIL, ICP | 0,25 | 0,63 | chưa rõ (nghi L1/hạ tầng cũ) |
| C6 | WLFI, SOMI, LINEA | 0,32 | 0,53 | chưa rõ |
| C7 | VIRTUAL, FET, RENDER | 0,24 | 0,75 | AI (nghi) |
| C8 | AXS, SAND, GALA | 0,36 | 0,73 | game / metaverse (nghi) |
| C9 | HYPE, FARTCOIN | 0,25 | 0,61 | chưa rõ |
| C10 | SUI, SEI | 0,35 | 0,84 | L1 mới (nghi) |
| C11–C19 (2 mã/cụm) | WLD+MYX, UNI+AAVE (DeFi, nghi), DOT+APT, ARB+OP (L2), TIA+ORDI, BANK+STO, STRK+ZK (L2 ZK, nghi), ETHFI+EIGEN (restaking, nghi), QNT+SOON | 0,20–0,35 | 0,29–0,82 | |

50/99 coin đứng riêng, không vào cụm nào. Nhóm này gồm cả mã lớn như BNB, ADA, AVAX, TRX, BCH, LTC.

**Trả lời: mỗi nhóm có đi cùng nhau không?** Có, nhưng đóng góp chủ yếu là **nhân tố chung**:
- Nhân tố thứ nhất (PC1, tính bằng power iteration trên ma trận corr) giải thích **42,8%** phương sai chuẩn hoá của 99 alt.
- Corr thô giữa hai alt bất kỳ là trung bình 0,35 (trung vị 0,33). Corr phần dư sau khi trừ BTC còn 0,20.
- Yếu tố ngành chỉ cộng thêm khoảng **0,2–0,35** corr phần dư. Cụm chặt nhất là coin riêng tư, ở mức 0,55.
- Trong cụm meme hoặc cụm ETH/SOL/LINK, corr thô 0,84–0,87. Long hai mã cùng cụm gần như là **một lệnh**.

## 7. Biến giải thích lợi suất alt ngày

Phương pháp: hồi quy gộp OLS (pooled, gộp mọi cặp coin–ngày). Có 38.255 quan sát của 98 alt; bỏ ETH vì ETH được dùng làm biến. Các biến đưa vào lần lượt:

| Mô hình | R² | R² tăng thêm |
|---|---|---|
| Chỉ BTC | 0,108 | 0,108 |
| + ETH vượt BTC (phần dư ETH sau BTC) | 0,122 | +0,013 |
| + z-score khối lượng của chính coin (cùng ngày) | 0,147 | +0,026 |
| + funding hôm trước (tổng các kỳ) | 0,153 | +0,006 |
| + chế độ vol BTC (dummy vol14 > trung vị, cộng BTC×dummy) | 0,153 | +0,000 |

- Hệ số mô hình đầy đủ: BTC 1,30; ETH vượt BTC 0,73; volume z +1,08% cho mỗi 1σ; funding 1,34 (ảnh hưởng không đáng kể vì funding ngày chỉ cỡ 0,0001–0,001); BTC×vol cao −0,14.
- R² **từng coin** chỉ với BTC: trung vị **0,26** (Q1 0,10, Q3 0,42). R² gộp thấp hơn (0,108) vì các coin bơm–xả gần như không theo BTC.
- Volume z là **đo cùng ngày**: khối lượng tăng đột biến đi kèm biến động mạnh (|z| giải thích 0,026, cao hơn z có dấu là 0,021). Đây không phải tín hiệu dự báo.
- **Phần lớn biến động alt theo ngày (~75–85%) không được các biến trên giải thích.** Đó là phần riêng của từng coin (tin tức, unlock, bơm–xả).

**Corr với BTC có tăng khi BTC biến động mạnh không?** Có. Vol14 trung vị của BTC là 1,94%/ngày. Ở ngày vol cao, corr trung vị là **0,58**; ở ngày vol thấp là **0,44**. 89/99 coin có corr tăng khi vol cao. Riêng beta thì hơi giảm (1,25 so với 1,39): khi thị trường dữ, alt đi cùng chiều đều đặn hơn nhưng không khuếch đại nhiều hơn.

## 8. Giai đoạn "altseason" (trung vị alt thắng BTC trong 30 ngày)

- Chỉ **77/392 cửa sổ (20%)** có trung vị alt thắng BTC trong 30 ngày. Trung vị số alt thắng BTC là 35%; cao nhất 81%.
- Tính cả giai đoạn: BTC −28,9%, alt trung vị (mua và giữ) **−59,3%**, chỉ **24/99 alt thắng BTC**. Nếu tính rổ alt chia đều tái cân bằng mỗi ngày thì ra +37,5%, nhưng con số này bị vài mã bơm hàng trăm % trong một ngày kéo lên; trên thực tế không mua được như vậy, nên **đừng dùng con số này**.
- Trung vị alt − BTC trong 30 ngày là **−5,8%**. Tệ nhất −29,1%, ở cửa sổ kết thúc 2025-10-10.

| Cửa sổ dài ≥ 5 ngày (ngày cuối của 30 ngày) | Số ngày | Alt−BTC lúc đỉnh | % alt thắng BTC | BTC 30 ngày | BTC vol14 |
|---|---|---|---|---|---|
| 2026-05-06 → 05-15 | 10 | +6,9% | 64% | **+11,9%** | 1,22% |
| 2026-05-30 → 06-04 | 6 | +10,5% | 75% | **−19,7%** | 2,23% |
| 2026-06-15 → 06-19 | 5 | +4,5% | 61% | −18,1% | 2,31% |
| 2026-09-17 → 10-07 | 21 | **+18,3%** | 77% | **+7,7%** | 2,39% |
| 2026-10-09 → 10-16 | 8 | +8,4% | 68% | +8,5% | 1,29% |

Ngoài ra còn 15 đợt ngắn 1–3 ngày, rải rác từ 11/2025 đến 09/2026.

**BTC làm gì lúc đó?** Lẫn lộn.
- Trung vị BTC 30 ngày khi alt thắng là **+5,9%**, khi alt thua là −0,9%. Corr giữa (alt − BTC) và BTC trong 30 ngày chỉ là **0,20**.
- Đợt dài nhất và mạnh nhất (09–10/2026) xảy ra khi BTC **tăng vừa phải** (+7–8%) **sau** đợt BTC +25% của tháng 8.
- Đợt 06/2026 lại xảy ra khi BTC **giảm ~20%**. Đó là kiểu alt "bớt thua" hoặc hồi kỹ thuật, không phải altseason thật.
- Với 14 tháng dữ liệu, chưa đủ để nói có quy luật xoay vòng BTC → alt.

## Kết luận cho Coin Radar

1. **10 lệnh long alt cùng lúc chỉ ≈ 2,5 cược độc lập**, tính với corr cặp trung vị 0,33 theo N_eff = N/(1+(N−1)ρ).
   - Lúc thị trường căng (corr cửa sổ 30 ngày ở P90 = 0,57), con số này còn **≈ 1,6**.
   - Nếu 10 lệnh đều là coin lớn trong nhóm Q4 (corr 0,74) thì còn **≈ 1,3**.
   - Hệ quả: giới hạn rủi ro nên tính trên **tổng beta-BTC của danh mục**, không tính theo số lệnh. Không nên mở hai lệnh trong cùng một cụm (meme, ETH/SOL/LINK, SUI/SEI, ARB/OP…) mà coi là đa dạng hoá.
2. **Alt giảm mạnh hơn tăng.**
   - β− ≈ 1,32 so với β+ ≈ 0,95 (trung vị). Ngày BTC −2..−5%, alt giảm ≈ **1,5×** BTC; ngày BTC +2..+5%, alt chỉ tăng ≈ **0,9×**.
   - Ngày sập, 86–99% mã cùng giảm và alt trung vị có thể mất 3–4 lần BTC (2025-10-10: −26,5% so với −7,3%).
   - Hệ quả: stop-loss của alt cần tính theo biến động của chính alt, và nên có **công tắc tắt toàn danh mục theo BTC** (ví dụ BTC giảm mạnh trong ngày thì đóng hoặc giảm mọi lệnh long alt), vì lúc đó đa dạng hoá gần như mất tác dụng.
3. **Tương quan tăng khi thị trường xấu.** Corr cặp TB là 0,45 khi BTC 30 ngày < −10%, so với 0,38 khi BTC tăng. Ngày vol BTC cao, corr là 0,58, so với 0,44 khi vol thấp. Nghĩa là lúc cần đa dạng hoá nhất thì nó yếu nhất.
4. **BTC không "dẫn" alt ở khung 1h hay 15m.** Đồng biến xảy ra trong cùng một nến (corr cùng nến ≈ 0,5; lệch một nến chỉ ≈ 0). Không nên xây luật kiểu "BTC vừa nhảy thì vào alt nến sau": ở khung 1h còn có hồi lại nhẹ (alt trả lại ~12% cú nhảy). Nếu có dẫn ở mức vài phút thì cần dữ liệu 1m/5m để kiểm.
5. **BTC giải thích khoảng 1/4 biến động ngày của alt điển hình** (R² trung vị 0,26). ETH, khối lượng, funding và chế độ vol chỉ cộng thêm vài điểm %. Funding hôm trước gần như không giải thích lợi suất hôm sau (R² 0,005).
6. **Altseason hiếm và ngắn** trong mẫu này: 20% số cửa sổ, chỉ 24/99 alt thắng BTC trong cả giai đoạn. Không nên mặc định "alt sẽ đuổi kịp BTC". Long alt có hướng nên cần thêm lý do riêng, ngoài việc BTC đang tăng.

> Nhắc lại: toàn bộ con số đến từ **một chu kỳ ~14 tháng, phần lớn là BTC giảm**, cộng với universe có thiên lệch chọn mẫu. Đây là mô tả cấu trúc, chưa phải luật đã kiểm chứng ngoài mẫu.
