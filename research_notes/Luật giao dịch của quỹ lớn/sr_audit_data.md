# Kiểm toán vùng hỗ trợ / kháng cự (S/R) của Coin Radar — mã nguồn và số liệu thật

Ngày lập: 20/10/2026. Phạm vi: chế độ Swing (vào lệnh khung 4H, xu hướng khung 1D). Không sửa file nào của repo; mọi script nằm ở
`/tmp/claude-1000/-home-admin1/9a91f9f2-51e2-4583-8952-2aee756c391e/scratchpad/sr/` (`collect.ts`, `analyze.ts`, `probe2.ts`).

> **Câu trả lời ngắn:** Vùng S/R mà dự án đang vẽ **không giữ giá tốt hơn một mức giá chọn ngẫu nhiên** (70,1% so với 70,2%).
> "Độ mạnh" (strength) hiện tại có vẻ phân biệt được vùng yếu/mạnh, nhưng đó là **ảo giác do độ rộng vùng**: mức ngẫu nhiên có cùng độ rộng cũng "mạnh" y hệt.
> Nến từ chối, RSI, taker… có giúp dự báo, nhưng giúp **ngang nhau** cho cả vùng thật lẫn mức ngẫu nhiên — tức là chúng đo hành vi giá, không xác nhận vùng.
> Dữ liệu chỉ ~14 tháng nến ngày và ~7 tháng nến 4H: **một chu kỳ thị trường**, không đủ để kết luận vĩnh viễn.

Thuật ngữ dùng trong tài liệu:
- **Pivot / swing point** (đỉnh/đáy cục bộ): nến có đỉnh cao hơn (hoặc đáy thấp hơn) N nến hai bên.
- **ATR** (Average True Range — biên độ dao động trung bình 14 nến): thước đo "một bước giá bình thường"; mọi khoảng cách quy về bội số ATR.
- **Clustering** (gom cụm): gộp các mức giá gần nhau thành một vùng.
- **Look-ahead** (nhìn trước): dùng dữ liệu tương lai mà lúc ra quyết định chưa có.
- **Control** (đối chứng): mức giá ngẫu nhiên, cùng khoảng cách tới giá và cùng độ rộng, dùng làm "nhóm giả dược" như thử nghiệm thuốc.
- **CI95** (khoảng tin cậy 95%, phương pháp Wilson cho tỉ lệ nhị thức): khoảng mà tỉ lệ thật có 95% khả năng nằm trong.
- **MFE / MAE** (Maximum Favorable / Adverse Excursion): quãng giá đi xa nhất theo hướng có lợi / bất lợi sau khi chạm.
- **Volume profile** (hồ sơ khối lượng theo giá); **HVN** (High Volume Node — vùng giá có khối lượng giao dịch dồn nhiều).
- **Taker** (bên khớp lệnh chủ động); **taker buy ratio** = takerBuyQuote / quoteVolume.
- **Regime** (chế độ thị trường): ở đây là BTC trên/dưới đường SMA200 ngày (SMA = trung bình động đơn giản).

---

## Phần A — Kiểm toán mã nguồn

### A1. Phát hiện vùng (detection)

| Bước | Cách làm | Vị trí |
|---|---|---|
| Nguồn điểm | Đỉnh/đáy pivot ở **hai khung**: khung vào lệnh (Swing: 4H, tối đa 499 nến ≈ 83 ngày) và khung xu hướng (1D, tối đa 299 nến ≈ 10 tháng). Pivot cần **3 nến mỗi bên** (`pivotConfirmBars: 3`). | `packages/core/zones.ts:16-24`, `packages/core/config.ts:69`, `packages/core/analyze.ts:146-150` |
| Định nghĩa pivot | So sánh **nghiêm ngặt** (`>` / `<`) với 3 nến hai bên. | `packages/core/indicators.ts:101-111` |
| Gom cụm | Sắp xếp mọi điểm theo giá; điểm mới vào cụm nếu cách điểm liền trước ≤ 0,5×ATR **và** cách điểm đầu cụm ≤ 1,5×ATR (ATR 14 nến của **khung 4H**, kể cả khi gộp pivot 1D). Đỉnh và đáy gộp chung, không phân biệt. | `zones.ts:43-52`, `config.ts:95-96` |
| Biên vùng | low = điểm thấp nhất cụm, high = điểm cao nhất cụm. **Cụm 1 điểm → vùng rộng 0** (một đường kẻ). | `zones.ts:57-58` |
| Phía | Không gắn nhãn hỗ trợ/kháng cự. Vùng **nằm hẳn dưới giá** là hỗ trợ, **nằm hẳn trên giá** là kháng cự; giá đang nằm trong vùng → không thuộc phía nào. | `zones.ts:94-98`, `zones.ts:101-103` |

### A2. Độ mạnh (strength)

`strength = Σ trọng số pivot` (mỗi pivot 4H = 1, mỗi pivot 1D = 2) `+ 0,5` nếu có **số tròn** trong vùng ±0,1×ATR `+ 1` nếu vùng thuộc **25% khối lượng cao nhất** (`zones.ts:61`, `66-76`, `78-88`; `config.ts:93-101`).
- "Số tròn" = bội của `roundStep(giá) = 10^(⌊log10 giá⌋−1)` (`indicators.ts:121-123`) → bước số tròn dao động **1%–10% giá** tùy giá nằm đâu trong thập phân.
- "Khối lượng" = tổng quoteVolume của **mọi nến 4H chạm vào vùng** trong 83 ngày (`zones.ts:80`) — thực chất đo "thời gian giá lưu lại", không phải khối lượng lúc vùng hình thành.
- `touches` = số pivot trong vùng, **không** phải số lần giá thực sự chạm vùng.

### A3. Dùng vùng trong lệnh

| Việc | Luật | Vị trí |
|---|---|---|
| Chọn vùng đặt SL | Vùng gần giá nhất nằm hẳn phía SL có strength ≥ 2 (`minSlStrength`). Hạng A còn đòi ≥ 3 (`minStopZoneStrength`). | `plan.ts:190`, `grade.ts:67-70`, `config.ts:102`, `config.ts:237` |
| Vào lệnh | Giá cách mép vùng ≤ 0,5×ATR → vào **market** ngay; xa hơn → **limit** tại mép vùng + 0,1×ATR, hết hạn sau 6 nến 4H. Giá nằm trong vùng → kế hoạch không hợp lệ. | `plan.ts:195-201`, `plan.ts:264-266`, `plan.ts:279-285`, `config.ts:108-110` |
| SL | Mép xa của vùng − 0,3×ATR; Swing nới tới tối thiểu 1×ATR **ngày**; đẩy qua số tròn nếu sát. | `plan.ts:209-226`, `config.ts:104` |
| TP1 | Mép gần của vùng **chặn** đầu tiên (strength ≥ 2) − 0,2×ATR; vùng yếu bị bỏ qua; TP1 < 1R → bỏ lệnh. | `zones.ts:113-126`, `plan.ts:238-248`, `plan.ts:273-276`, `config.ts:103-106` |

### A4. Xác nhận (confirmation) trước khi vào lệnh

**Không có.** Lệnh market vào ngay khi giá đang cách mép vùng ≤ 0,5×ATR; lệnh limit khớp khi giá chạm. Không đòi nến từ chối, không đòi đóng cửa quay lại, không xét RSI/khối lượng tại lúc chạm (`plan.ts:198-201`, `plan.ts:303-323`).

### A5. Đầu vào được dùng

| Đầu vào | Có dùng? |
|---|---|
| Pivot 4H + 1D | Có (nguồn chính) |
| Khối lượng | Có, dạng thô: tổng quoteVolume của nến chạm vùng (cộng 1 điểm) — không phải volume profile |
| Volume profile / HVN | Không |
| Sổ lệnh (order book) | Không |
| Số tròn | Có (+0,5 điểm; và đẩy SL qua số tròn) |

### A6. Lỗi và điểm yếu

| # | Vấn đề | Vị trí | Mức |
|---|---|---|---|
| 1 | **Vùng phủ gần kín bảng giá.** Trung bình 34,8 vùng mỗi lần quét, 4,6 vùng trong ±3 ATR quanh giá; **79,9%** dải ±3 ATR nằm trong một vùng (±0,25 ATR). 87% mức giá ngẫu nhiên rơi trúng một vùng. **53%** lần quét (101.266/191.032 lượt mã×chiều) giá đang nằm trong vùng → kế hoạch bị loại. Nguyên nhân gốc: dùng mọi pivot 3 nến của 83 ngày 4H + 10 tháng 1D, không lọc theo biên độ, không bỏ vùng cũ. | `zones.ts:35-64`, `config.ts:69` | Nghiêm trọng |
| 2 | **Strength đo độ rộng chứ không đo độ bền.** Vùng nhiều pivot thì rộng hơn (strength 1 → rộng 0 ATR; strength ≥ 6 → rộng trung bình 1,13 ATR); vùng rộng thì khó "gãy" hơn về mặt hình học. Mức ngẫu nhiên cùng độ rộng cho tỉ lệ bật y hệt (Phần B2). | `zones.ts:61`, `zones.ts:47` | Nghiêm trọng |
| 3 | **Vùng 1 pivot rộng bằng 0** (low = high) — là đường kẻ, không phải vùng; SL chỉ cách 0,3×ATR. | `zones.ts:57-58` | Trung bình |
| 4 | **Không loại vùng cũ / đã bị phá.** Pivot 1D 10 tháng trước vẫn được 2 điểm như pivot hôm qua; vùng giá đã cắt qua nhiều lần không bị trừ điểm. Lật vai trò S↔R chỉ xảy ra ngầm (vì phía xác định theo giá), không kiểm chứng vùng đã lật thật. | `zones.ts:35-41`, `zones.ts:94-98` | Trung bình |
| 5 | **Gộp pivot 1D bằng ATR 4H** — pivot 1D vốn nhiễu theo đơn vị ngày nhưng bị gom bằng thước 4H (nhỏ hơn ~2,5 lần) → sinh nhiều vùng con. | `zones.ts:47`, `analyze.ts:149` | Nhẹ |
| 6 | **Pivot so sánh nghiêm ngặt**: hai đỉnh bằng đúng nhau (đỉnh đôi chuẩn) trong 3 nến → không đỉnh nào được nhận. | `indicators.ts:106` | Nhẹ |
| 7 | **Điểm khối lượng thiên về vùng rộng và vùng giá lưu lâu** (cộng quoteVolume mọi nến chạm vùng); không đo khối lượng lúc vùng hình thành. | `zones.ts:80` | Trung bình |
| 8 | **Bước số tròn không đều**: giá 1,05 → bước 0,1 (≈9,5%); giá 9,5 → bước 0,1 (≈1%). | `indicators.ts:121-123` | Nhẹ |
| 9 | **Không có xác nhận** trước khi vào (xem A4). | `plan.ts:198-201` | Thiết kế |
| 10 | **TP1 thường < 1R**: vì vùng dày đặc và SL Swing bị nới ≥ 1×ATR ngày, vùng chặn kế tiếp thường quá gần. 67.965 lượt bị loại vì TP1 < 1R, chỉ 1.589 kế hoạch hợp lệ trên ~95.500 lần quét × 2 chiều. | `plan.ts:213-216`, `plan.ts:273-276` | Trung bình |
| — | **Không thấy look-ahead**: pivot cần 3 nến sau đã đóng; máy quét và phát lại chỉ dùng nến `closeTime < t` (`candles.ts:4-7`, `backtest/data.ts:155`). Pivot vì thế trễ 3 nến (12 giờ ở 4H, 3 ngày ở 1D) — đây là độ trễ, không phải lỗi. | | Đạt |

---

## Phần B — Phương pháp kiểm chứng

- **Dữ liệu**: nến Binance USDⓈ-M đã đệm trong `data/cache/klines`. 1D có từ 23/08/2025, 4H từ 27/03/2026, 1H từ 05/2026 (không dùng 1H). Dữ liệu tới 19/10/2026 00:00 UTC. Nạp bằng `loadCandles` của dự án; lỗi nạp hoặc có lỗ hổng (gap) → bỏ mã và ghi lại: **1 mã bị bỏ** (CTUSDT: chỉ 18 nến 1D, không vào top 100).
- **Vũ trụ**: 100 hợp đồng USDT có quoteVolume ngày trung bình lớn nhất trong kỳ. ⚠️ Thiên lệch sống sót (survivorship) và chọn theo khối lượng của cả kỳ (nhìn trước nhẹ ở khâu chọn mã).
- **Mốc quyết định**: mỗi lần nến 4H đóng, từ 01/05/2026 tới ~14/10/2026 (cần ≥ 200 nến 4H khởi động; máy quét thật dùng 499) → **95.516 mốc** (mã × nến).
- **Dựng vùng**: gọi **đúng** `findZones` của dự án với 499 nến 4H gần nhất và 299 nến 1D, chỉ nến đã đóng trước mốc.
- **Sự kiện chạm**: tại mỗi mốc lấy vùng hỗ trợ gần nhất (nằm hẳn dưới giá) và kháng cự gần nhất. Sự kiện = nến 4H kế tiếp **chạm vùng lần đầu** (nến trước đó chưa chạm).
- **Kết quả** (chốt trước khi chạy: **X = 1 ATR, Y = 1 ATR**, ATR 4H tại mốc, cửa sổ 30 nến 4H = 5 ngày):
  - **Bật (bounce)**: giá đi ngược lại ≥ 1×ATR tính từ mép gần, **trước khi** một nến đóng cửa vượt mép xa ≥ 1×ATR.
  - **Gãy (break)**: đóng cửa vượt mép xa ≥ 1×ATR trước. Cùng một nến có cả hai → tính gãy (thận trọng).
  - Tỉ lệ bật = bật / (bật + gãy); phần "chưa ngã ngũ" ghi riêng (1–4%).
  - Kết quả A: tính từ chính nến chạm. Kết quả B: quyết định lúc nến chạm đóng cửa (bỏ ca gãy ngay trong nến chạm) — dùng cho các đặc trưng đo trên nến chạm.
- **Đối chứng**: tại cùng mốc, 3 mức ngẫu nhiên/phía; khoảng cách tới giá và độ rộng rút từ phân phối khoảng cách/độ rộng của chính các vùng thật → cùng phân phối, khác vị trí. Thêm **đối chứng khớp độ rộng + phía** (tính lại theo đúng tỉ trọng độ rộng của nhóm vùng thật) vì độ rộng tự nó làm thay đổi tỉ lệ bật.
- **Phương pháp so sánh**: (1) vùng pivot của dự án, (2) **HVN**: volume profile 30 ngày 4H, ô giá 0,25×ATR, ô ≥ phân vị 80 và lớn nhất trong ±2 ô, (3) **số tròn** theo `roundStep` của dự án.
- **CI**: Wilson 95% cho mỗi tỉ lệ; với hiệu chính còn tính **bootstrap theo tuần** (lấy mẫu lại theo tuần, vì các coin cùng tuần biến động cùng nhau).
- **Điểm sức mạnh (chốt luật trước khi xem)**: chia thời gian — **nửa khám phá** 01/05–31/07/2026, **nửa kiểm tra** 01/08–19/10/2026. Trên nửa khám phá, với mỗi đặc trưng chọn nhóm có tỉ lệ bật cao nhất (n ≥ 100); đặc trưng "giúp rõ" nếu nhóm đó hơn phần còn lại ≥ 5 điểm % **và** z ≥ 2. Điểm = số điều kiện "giúp rõ" thỏa; Yếu = 0, Trung bình = 1, Mạnh ≥ 2. Đánh giá trên nửa kiểm tra.
- **TP1**: mô phỏng gọn `buildPlan` (Swing): vùng SL = vùng gần nhất strength ≥ 2; market nếu cách ≤ 0,5 ATR, không thì limit mép + 0,1 ATR (hết hạn 6 nến); SL = mép xa − 0,3 ATR, nới ≥ 1×ATR ngày; TP1 = vùng chặn kế tiếp − 0,2 ATR; bỏ nếu < 1R; mỗi mã/chiều một lệnh một lúc; giữ tối đa 21 ngày. Cùng nến chạm cả SL và TP → tính SL. **Không** mô phỏng việc đẩy SL qua số tròn, phí, funding. Đối chứng: cùng giá vào/SL, TP ở R ngẫu nhiên rút từ phân phối R thật.

---

## Phần B — Kết quả chính

### B0. Tóm tắt các con số then chốt

| Câu hỏi | Vùng dự án | Đối chứng ngẫu nhiên | Kết luận |
|---|---|---|---|
| Tỉ lệ bật chung (n vùng = 22.208) | **70,1%** [69,5–70,7] | 70,2% [69,8–70,5]; khớp độ rộng 69,9% | Hiệu −0,0 điểm (bootstrap tuần −0,8…+0,7) → **không hơn ngẫu nhiên** |
| Chỉ so với mức ngẫu nhiên KHÔNG trùng vùng nào (khớp độ rộng) | 70,1% | 69,7% ± 1,3 | Vẫn không hơn |
| HVN (volume profile) | 66,0% | 64,8% | +1,2 điểm (−0,1…+2,5) — dương ở cả 4 bộ ngưỡng nhưng **chưa có ý nghĩa thống kê** |
| Số tròn | 60,5% | 60,7% | −0,2 → không hơn |
| Nhạy với ngưỡng X/Y (0,5/0,5; 2/1; 1/0,25) | hiệu so đối chứng khớp: 0,0 / 0,0 / +0,1 | | Kết luận không đổi |
| Strength 1 → strength ≥ 6 | 60,8% → 74,5% | đối chứng khớp độ rộng 60,5% → 74,2% | Tăng do **độ rộng**, không do vùng |
| Nến từ chối (râu ≥ 50%, đóng lại) | 82,3% | 82,8% (khớp) | Giúp ~+14 điểm **cho cả hai** → là tín hiệu hành vi giá |
| TP1 chạm trước SL (568 lệnh đã ngã ngũ) | 36,3% | 36,0% (TP ngẫu nhiên cùng phân phối R) | Vùng không làm TP1 tốt hơn; kỳ vọng thô −0,10R vs −0,06R |

Các bảng đầy đủ (kèm CI, cỡ mẫu, MFE/MAE) ở Phụ lục bên dưới — sinh tự động bởi `analyze.ts`.

### B1. Chất lượng "điểm sức mạnh" từ các đặc trưng (nửa kiểm tra 01/08–19/10)

Trên nửa khám phá, 10 điều kiện đạt luật chọn (≥ 3 pivot, hợp lưu 1D+4H, có pivot 1D, gần SMA50/200, số tròn, taker cùng phía ≥ 0,52, RSI quy đổi ≥ 45, phân kỳ RSI, tiếp cận nhanh ≥ 2,5 ATR, râu ≥ 0,5). Trên nửa kiểm tra:

| Điểm | Vùng thật | Đối chứng khớp độ rộng |
|---|---|---|
| Yếu (0 điều kiện) | 58,1% [52,8–63,3] (n=332) | 65,8% |
| Trung bình (1) | 59,8% [56,3–63,2] (n=779) | 66,4% |
| Mạnh (≥ 2) | 73,2% [72,3–74,1] (n=8.773) | 72,7% |

Điểm có tách Yếu/Mạnh (58% → 73%), nhưng vùng "Mạnh" chỉ ngang mức ngẫu nhiên cùng độ rộng. 89% vùng rơi vào "Mạnh" vì điều kiện quá dễ thỏa. → **Không có bộ chỉ báo nào biến vùng của dự án thành vùng "thật".**

### B2. Strength hiện tại có phân biệt vùng yếu/mạnh không?

Trên nửa kiểm tra: strength < 2 → 66,7% (khớp 65,1%); 2–2,5 → 68,4% (66,0%); ≥ 3 (ngưỡng Hạng A) → 72,5% (73,3%).
→ Có xếp hạng **thô**, nhưng toàn bộ chênh lệch được giải thích bằng độ rộng vùng. **Strength không đo "độ bền" của vùng.**

---

## Kết luận

1. **Vùng S/R của dự án KHÔNG tốt hơn mức giá ngẫu nhiên** — trên 22.208 lần chạm, 100 coin, 5,5 tháng mốc 4H: 70,1% so với 70,2%. Kết quả giữ nguyên ở 4 bộ ngưỡng X/Y, ở cả hỗ trợ lẫn kháng cự, ở cả BTC trên và dưới SMA200.
2. **Nguyên nhân gốc**: vùng quá dày (≈80% dải giá ±3 ATR đã là "vùng"), nên "giá chạm vùng" gần như là "giá đi bất kỳ đâu". Một vùng chỉ có giá trị khi nó **hiếm**.
3. **Strength hiện tại** tách được vùng yếu/mạnh chỉ vì vùng mạnh **rộng hơn**; so với mức ngẫu nhiên cùng độ rộng thì không còn khác biệt. Ngưỡng strength ≥ 2 (SL) và ≥ 3 (Hạng A) chưa có cơ sở số liệu.
4. **Biến thể nào giúp?**
   - **Xác nhận bằng nến từ chối**: tăng tỉ lệ bật từ ~69% lên ~82% — **có ích cho việc vào lệnh**, nhưng giúp y hệt ở mức ngẫu nhiên. Nghĩa là: "đợi nến 4H rút râu rồi mới vào" là một luật hành vi giá có giá trị, không phải bằng chứng vùng đúng.
   - Tương tự: **taker cùng phía ≥ 0,52** (~79%), **phân kỳ RSI** (~84%), **RSI chưa quá bán/quá mua** (~76%) — đều tốt ngang nhau cho mức ngẫu nhiên. (Lưu ý: tỉ lệ cao một phần vì nến chạm đã đóng cửa thuận lợi.)
   - **Volume profile (HVN)**: hơn đối chứng +1,2 điểm, dương nhất quán ở mọi ngưỡng nhưng CI chạm 0 → **tín hiệu yếu, đáng thử tiếp**, chưa đủ để thay pivot.
   - **Số tròn**: không giúp.
   - **Hợp lưu 1D+4H, tuổi vùng, số lần chạm, khối lượng lúc hình thành, gần SMA50/200**: không vượt đối chứng khớp độ rộng (chênh ≤ 2,5 điểm, mẫu nhỏ ở các nhóm chênh nhiều nhất).
5. **TP1 theo vùng mạnh kế tiếp**: chạm trước SL 36,3% — ngang TP đặt ngẫu nhiên cùng khoảng R (36,0%) và không hơn mức bước ngẫu nhiên lý thuyết 1/(1+R) ở nhóm nào (nhóm 1–1,5R: 42,7% so với 45,3%). TP đặt **sau** vùng cản cũng không bị chặn nhiều hơn → vùng cản không chặn giá đo được. ⚠️ Chỉ 568 lệnh (các nhóm ≥ 2R là mẫu nhỏ).
6. **Giới hạn**: ~14 tháng dữ liệu ngày và ~7 tháng dữ liệu 4H là **một chu kỳ thị trường** (2/3 sự kiện rơi vào giai đoạn BTC dưới SMA200); vũ trụ có thiên lệch sống sót; các coin cùng tuần tương quan với nhau (đã bù bằng bootstrap tuần, ~24 tuần); chỉ kiểm chế độ Swing; độ phân giải 4H nên thứ tự chạm trong cùng nến được xử lý thận trọng.

**Đề xuất hướng sửa (chưa làm, cần duyệt)**: giảm mạnh số vùng (pivot theo biên độ tối thiểu, ví dụ ≥ 1,5–2×ATR; bỏ vùng đã bị đóng cửa xuyên qua), định nghĩa strength độc lập với độ rộng, thêm bước xác nhận nến 4H trước khi vào lệnh, và thử HVN làm nguồn vùng bổ sung — rồi chạy lại đúng bài kiểm này để xem vùng mới có vượt đối chứng không.

---

## Phụ lục — Bảng đầy đủ (sinh bởi `analyze.ts`, X = Y = 1 ATR)

Ghi chú đọc bảng: "⚠️mẫu nhỏ" = n < 100; "(mẫu vừa)" = n < 300. Với đặc trưng chỉ có ở vùng thật (số pivot, tuổi, hợp lưu khung, khối lượng tạo pivot, cờ của dự án), cột "Đối chứng ngẫu nhiên" trống — hãy đọc cột **Đối chứng KHỚP độ rộng+phía**.

Meta: vũ trụ 100 mã, dùng được 100; bỏ qua 1: CTUSDT (universe-1d: chỉ 18 nến 1d)
Mốc quyết định (mã × nến 4H): 95516. X=1 ATR, Y=1 ATR, cửa sổ 30 nến 4H, 3 mức đối chứng/mốc.
Mật độ vùng: trung bình 34.8 vùng/mốc; 4.6 vùng trong ±3 ATR quanh giá; 79.9% dải ±3 ATR nằm trong (vùng ± 0,25 ATR).
- Đối chứng zone: 87.0% chạm trùng một vùng của dự án; tỉ lệ bật (A) đối chứng TRÙNG vùng 71.1% [70.7–71.4] (n=58141); KHÔNG trùng 64.1% [63.1–65.1] (n=8839)
- Đối chứng hvn: 82.2% chạm trùng một vùng của dự án; tỉ lệ bật (A) đối chứng TRÙNG vùng 64.8% [64.1–65.4] (n=21420); KHÔNG trùng 65.0% [63.6–66.3] (n=4639)
- Đối chứng round: 66.8% chạm trùng một vùng của dự án; tỉ lệ bật (A) đối chứng TRÙNG vùng 60.6% [60.2–61.1] (n=48092); KHÔNG trùng 60.8% [60.1–61.4] (n=23948)

### B1. Ba phương pháp so với đối chứng (kết quả A: tính cả nến chạm)

#### Phương pháp: zone

| Nhóm | Vùng thật: tỉ lệ bật [CI95] | Đối chứng ngẫu nhiên: tỉ lệ bật [CI95] | Hiệu (điểm %) | CI95 bootstrap theo tuần | Đối chứng KHỚP độ rộng+phía [CI95] | Hiệu so đối chứng khớp | Chưa ngã ngũ (thật) | MFE/MAE thật (ATR) | MFE/MAE đối chứng |
|---|---|---|---|---|---|---|---|---|---|
| Tất cả | 70.1% [69.5–70.7] (n=22208) | 70.2% [69.8–70.5] (n=66980) | -0.0 | -0.8 … 0.7 | 69.9% [69.5–70.2] | **0.3** | 2.6% | 3.37 / 3.82 | 3.34 / 3.83 |
| Hỗ trợ (S) | 71.4% [70.5–72.2] (n=10329) | 71.2% [70.7–71.7] (n=31319) | 0.2 | -0.7 … 1.2 | 71.0% [70.5–71.5] | **0.3** | 4.2% | 3.86 / 2.68 | 3.78 / 2.68 |
| Kháng cự (R) | 69.0% [68.2–69.9] (n=11879) | 69.3% [68.8–69.8] (n=35661) | -0.2 | -1.2 … 0.7 | 68.8% [68.4–69.3] | **0.2** | 1.3% | 2.93 / 4.85 | 2.94 / 4.85 |
| BTC > SMA200 ngày | 68.8% [67.7–69.8] (n=7579) | 69.6% [69.0–70.2] (n=22682) | -0.9 | -1.9 … 0.3 | 69.4% [68.8–70.0] | **-0.6** | 2.5% | 3.23 / 3.78 | 3.24 / 3.81 |
| BTC < SMA200 ngày | 70.8% [70.1–71.6] (n=14629) | 70.4% [70.0–70.9] (n=44298) | 0.4 | -0.5 … 1.1 | 70.1% [69.7–70.5] | **0.7** | 2.7% | 3.44 / 3.84 | 3.39 / 3.84 |

#### Phương pháp: hvn

| Nhóm | Vùng thật: tỉ lệ bật [CI95] | Đối chứng ngẫu nhiên: tỉ lệ bật [CI95] | Hiệu (điểm %) | CI95 bootstrap theo tuần | Đối chứng KHỚP độ rộng+phía [CI95] | Hiệu so đối chứng khớp | Chưa ngã ngũ (thật) | MFE/MAE thật (ATR) | MFE/MAE đối chứng |
|---|---|---|---|---|---|---|---|---|---|
| Tất cả | 66.0% [64.9–67.0] (n=7872) | 64.8% [64.2–65.4] (n=26059) | 1.2 | -0.1 … 2.5 | 64.8% [64.2–65.4] | **1.2** | 1.4% | 3.33 / 3.81 | 3.36 / 3.75 |
| Hỗ trợ (S) | 66.2% [64.6–67.8] (n=3541) | 64.7% [63.8–65.5] (n=11810) | 1.5 | -0.2 … 3.5 | 64.7% [63.8–65.6] | **1.5** | 1.9% | 3.86 / 2.59 | 3.83 / 2.58 |
| Kháng cự (R) | 65.8% [64.4–67.2] (n=4331) | 64.9% [64.1–65.7] (n=14249) | 0.9 | -0.7 … 2.5 | 64.9% [64.1–65.7] | **0.9** | 1.1% | 2.90 / 4.81 | 2.96 / 4.73 |
| BTC > SMA200 ngày | 65.1% [63.2–66.8] (n=2724) | 63.8% [62.8–64.8] (n=8999) | 1.2 | -1.7 … 4.2 | 63.7% [62.7–64.7] | **1.4** | 1.3% | 3.24 / 3.63 | 3.35 / 3.39 |
| BTC < SMA200 ngày | 66.5% [65.2–67.8] (n=5148) | 65.3% [64.6–66.1] (n=17060) | 1.2 | -0.1 … 2.5 | 65.3% [64.6–66.0] | **1.2** | 1.5% | 3.38 / 3.90 | 3.36 / 3.94 |

#### Phương pháp: round

| Nhóm | Vùng thật: tỉ lệ bật [CI95] | Đối chứng ngẫu nhiên: tỉ lệ bật [CI95] | Hiệu (điểm %) | CI95 bootstrap theo tuần | Đối chứng KHỚP độ rộng+phía [CI95] | Hiệu so đối chứng khớp | Chưa ngã ngũ (thật) | MFE/MAE thật (ATR) | MFE/MAE đối chứng |
|---|---|---|---|---|---|---|---|---|---|
| Tất cả | 60.5% [59.9–61.1] (n=24017) | 60.7% [60.3–61.0] (n=72040) | -0.2 | -0.9 … 0.5 | 60.7% [60.3–61.0] | **-0.2** | 0.8% | 3.27 / 3.53 | 3.31 / 3.66 |
| Hỗ trợ (S) | 60.6% [59.7–61.5] (n=12005) | 60.7% [60.1–61.2] (n=35600) | -0.0 | -0.7 … 0.6 | 60.7% [60.1–61.2] | **-0.0** | 1.0% | 3.70 / 2.59 | 3.78 / 2.63 |
| Kháng cự (R) | 60.3% [59.5–61.2] (n=12012) | 60.7% [60.2–61.2] (n=36440) | -0.4 | -1.5 … 0.8 | 60.7% [60.2–61.2] | **-0.4** | 0.5% | 2.83 / 4.47 | 2.85 / 4.67 |
| BTC > SMA200 ngày | 59.1% [58.0–60.1] (n=8114) | 59.5% [58.9–60.1] (n=24044) | -0.4 | -1.7 … 1.0 | 59.5% [58.9–60.1] | **-0.4** | 0.7% | 3.13 / 3.63 | 3.16 / 3.66 |
| BTC < SMA200 ngày | 61.2% [60.4–62.0] (n=15903) | 61.3% [60.8–61.7] (n=47996) | -0.1 | -0.7 … 0.7 | 61.3% [60.8–61.7] | **-0.1** | 0.8% | 3.34 / 3.48 | 3.38 / 3.66 |

### B2. Độ mạnh của dự án (vùng zone, kết quả A)

#### Theo strength

| Nhóm | Vùng thật: tỉ lệ bật [CI95] | Đối chứng ngẫu nhiên: tỉ lệ bật [CI95] | Hiệu (điểm %) | Đối chứng KHỚP độ rộng+phía [CI95] | Hiệu so đối chứng khớp | Chưa ngã ngũ (thật) | MFE/MAE thật (ATR) | MFE/MAE đối chứng |
|---|---|---|---|---|---|---|---|---|
| strength = 1 | 60.8% [58.3–63.3] (n=1435) | 70.2% [69.8–70.5] (n=66980) | -9.3 | 60.5% [59.7–61.4] | **0.3** | 0.2% | 3.31 / 3.56 | 3.34 / 3.83 |
| strength 1,5 | 63.1% [58.7–67.3] (n=485) | 70.2% [69.8–70.5] (n=66980) | -7.1 | 60.5% [59.6–61.4] | **2.6** | 1.2% | 3.14 / 3.56 | 3.34 / 3.83 |
| strength 2–2,5 | 64.0% [62.0–65.9] (n=2234) | 70.2% [69.8–70.5] (n=66980) | -6.2 | 62.0% [61.3–62.6] | **2.0** | 0.2% | 3.56 / 4.14 | 3.34 / 3.83 |
| strength 3–3,5 | 61.3% [59.1–63.5] (n=1924) | 70.2% [69.8–70.5] (n=66980) | -8.8 | 63.3% [62.8–63.9] | **-2.0** | 0.7% | 3.41 / 4.08 | 3.34 / 3.83 |
| strength 4–5,5 | 66.0% [64.2–67.7] (n=2732) | 70.2% [69.8–70.5] (n=66980) | -4.2 | 66.3% [65.7–66.8] | **-0.3** | 0.8% | 3.44 / 3.83 | 3.34 / 3.83 |
| strength ≥ 6 | 74.5% [73.8–75.2] (n=13398) | 70.2% [69.8–70.5] (n=66980) | 4.3 | 74.2% [73.8–74.6] | **0.3** | 4.0% | 3.33 / 3.77 | 3.34 / 3.83 |

_Lưu ý: cột đối chứng ở bảng này là đối chứng chung (mức ngẫu nhiên không có strength)._

### B3. Xác nhận bằng nến từ chối (kết quả B: quyết định lúc nến chạm đóng)

#### Nến từ chối (râu ≥ 50% biên độ, đóng lại trong/ngoài vùng về phía cũ)

| Nhóm | Vùng thật: tỉ lệ bật [CI95] | Đối chứng ngẫu nhiên: tỉ lệ bật [CI95] | Hiệu (điểm %) | CI95 bootstrap theo tuần | Đối chứng KHỚP độ rộng+phía [CI95] | Hiệu so đối chứng khớp | Chưa ngã ngũ (thật) | MFE/MAE thật (ATR) | MFE/MAE đối chứng |
|---|---|---|---|---|---|---|---|---|---|
| Có nến từ chối | 82.3% [81.3–83.3] (n=5608) | 83.0% [82.4–83.5] (n=16830) | -0.6 | -1.6 … 0.5 | 82.8% [82.2–83.4] | **-0.5** | 2.0% | 3.79 / 3.25 | 3.82 / 3.26 |
| Không | 68.7% [67.9–69.4] (n=15959) | 68.4% [68.0–68.8] (n=48298) | 0.3 | -0.7 … 1.2 | 68.2% [67.8–68.6] | **0.5** | 2.9% | 3.28 / 3.79 | 3.23 / 3.78 |

#### Tương tự cho HVN

| Nhóm | Vùng thật: tỉ lệ bật [CI95] | Đối chứng ngẫu nhiên: tỉ lệ bật [CI95] | Hiệu (điểm %) | Đối chứng KHỚP độ rộng+phía [CI95] | Hiệu so đối chứng khớp | Chưa ngã ngũ (thật) | MFE/MAE thật (ATR) | MFE/MAE đối chứng |
|---|---|---|---|---|---|---|---|---|
| Có nến từ chối | 81.0% [79.2–82.7] (n=1922) | 79.6% [78.6–80.6] (n=6098) | 1.4 | 79.7% [78.7–80.7] | **1.3** | 1.1% | 3.75 / 3.18 | 3.82 / 3.18 |
| Không | 64.3% [63.1–65.6] (n=5654) | 63.5% [62.8–64.2] (n=18965) | 0.9 | 63.5% [62.8–64.2] | **0.9** | 1.5% | 3.27 / 3.70 | 3.30 / 3.62 |

#### Tương tự cho số tròn

| Nhóm | Vùng thật: tỉ lệ bật [CI95] | Đối chứng ngẫu nhiên: tỉ lệ bật [CI95] | Hiệu (điểm %) | Đối chứng KHỚP độ rộng+phía [CI95] | Hiệu so đối chứng khớp | Chưa ngã ngũ (thật) | MFE/MAE thật (ATR) | MFE/MAE đối chứng |
|---|---|---|---|---|---|---|---|---|
| Có nến từ chối | 74.9% [73.7–76.0] (n=5577) | 76.0% [75.4–76.7] (n=16810) | -1.2 | 76.0% [75.4–76.7] | **-1.2** | 0.7% | 3.65 / 2.96 | 3.72 / 3.06 |
| Không | 60.3% [59.6–61.1] (n=17155) | 60.3% [59.9–60.7] (n=51305) | 0.1 | 60.3% [59.8–60.7] | **0.1** | 0.8% | 3.25 / 3.38 | 3.29 / 3.52 |

### B4. Đặc trưng (vùng zone, kết quả B)

#### Số pivot (touches của dự án)

| Nhóm | Vùng thật: tỉ lệ bật [CI95] | Đối chứng ngẫu nhiên: tỉ lệ bật [CI95] | Hiệu (điểm %) | Đối chứng KHỚP độ rộng+phía [CI95] | Hiệu so đối chứng khớp | Chưa ngã ngũ (thật) | MFE/MAE thật (ATR) | MFE/MAE đối chứng |
|---|---|---|---|---|---|---|---|---|
| 1 | 65.8% [64.2–67.4] (n=3371) | —% [—–—] (n=0 ⚠️mẫu nhỏ) | NaN | 64.4% [63.5–65.3] | **1.4** | 0.3% | 3.34 / 3.58 | — / — |
| 2 | 67.2% [65.4–69.1] (n=2463) | —% [—–—] (n=0 ⚠️mẫu nhỏ) | NaN | 66.8% [66.1–67.4] | **0.5** | 0.6% | 3.56 / 3.83 | — / — |
| ≥3 | 74.4% [73.7–75.0] (n=15733) | —% [—–—] (n=0 ⚠️mẫu nhỏ) | NaN | 74.4% [74.0–74.7] | **-0.0** | 3.5% | 3.40 / 3.64 | — / — |

#### Số lần giá ghé vùng 30 ngày trước

| Nhóm | Vùng thật: tỉ lệ bật [CI95] | Đối chứng ngẫu nhiên: tỉ lệ bật [CI95] | Hiệu (điểm %) | Đối chứng KHỚP độ rộng+phía [CI95] | Hiệu so đối chứng khớp | Chưa ngã ngũ (thật) | MFE/MAE thật (ATR) | MFE/MAE đối chứng |
|---|---|---|---|---|---|---|---|---|
| 0 | 72.2% [68.7–75.4] (n=679) | 72.3% [70.7–73.8] (n=3207) | -0.1 | 70.3% [68.3–72.3] | **1.9** | 1.3% | 3.29 / 5.25 | 3.30 / 4.80 |
| 1–2 | 70.9% [69.1–72.6] (n=2663) | 73.3% [72.4–74.1] (n=10111) | -2.4 | 69.8% [68.7–70.9] | **1.1** | 2.0% | 3.39 / 3.58 | 3.38 / 3.55 |
| 3–5 | 71.3% [70.0–72.5] (n=5086) | 72.2% [71.5–72.9] (n=16286) | -1.0 | 70.4% [69.7–71.2] | **0.8** | 2.5% | 3.28 / 3.36 | 3.28 / 3.50 |
| ≥6 | 72.9% [72.1–73.6] (n=13139) | 71.8% [71.3–72.3] (n=35524) | 1.0 | 73.1% [72.7–73.6] | **-0.3** | 2.9% | 3.47 / 3.70 | 3.44 / 3.64 |

#### Tuổi pivot mới nhất (ngày)

| Nhóm | Vùng thật: tỉ lệ bật [CI95] | Đối chứng ngẫu nhiên: tỉ lệ bật [CI95] | Hiệu (điểm %) | Đối chứng KHỚP độ rộng+phía [CI95] | Hiệu so đối chứng khớp | Chưa ngã ngũ (thật) | MFE/MAE thật (ATR) | MFE/MAE đối chứng |
|---|---|---|---|---|---|---|---|---|
| < 7 | 72.7% [72.0–73.4] (n=15208) | —% [—–—] (n=0 ⚠️mẫu nhỏ) | NaN | 73.0% [72.6–73.3] | **-0.2** | 3.1% | 3.44 / 3.53 | — / — |
| 7–30 | 71.6% [70.1–73.0] (n=3866) | —% [—–—] (n=0 ⚠️mẫu nhỏ) | NaN | 70.7% [70.4–71.1] | **0.8** | 2.1% | 3.40 / 3.95 | — / — |
| 30–90 | 71.5% [69.0–73.9] (n=1313) | —% [—–—] (n=0 ⚠️mẫu nhỏ) | NaN | 69.1% [68.6–69.5] | **2.4** | 1.4% | 3.27 / 3.62 | — / — |
| ≥ 90 | 68.1% [65.4–70.7] (n=1180) | —% [—–—] (n=0 ⚠️mẫu nhỏ) | NaN | 66.1% [65.4–66.7] | **2.1** | 0.3% | 3.27 / 4.30 | — / — |

#### Hợp lưu khung 1D + 4H

| Nhóm | Vùng thật: tỉ lệ bật [CI95] | Đối chứng ngẫu nhiên: tỉ lệ bật [CI95] | Hiệu (điểm %) | Đối chứng KHỚP độ rộng+phía [CI95] | Hiệu so đối chứng khớp | Chưa ngã ngũ (thật) | MFE/MAE thật (ATR) | MFE/MAE đối chứng |
|---|---|---|---|---|---|---|---|---|
| có | 74.3% [73.5–75.0] (n=14091) | —% [—–—] (n=0 ⚠️mẫu nhỏ) | NaN | 74.1% [73.7–74.5] | **0.2** | 3.6% | 3.34 / 3.58 | — / — |
| không | 68.4% [67.3–69.4] (n=7476) | —% [—–—] (n=0 ⚠️mẫu nhỏ) | NaN | 67.9% [67.4–68.4] | **0.5** | 0.9% | 3.55 / 3.79 | — / — |

#### Có pivot 1D

| Nhóm | Vùng thật: tỉ lệ bật [CI95] | Đối chứng ngẫu nhiên: tỉ lệ bật [CI95] | Hiệu (điểm %) | Đối chứng KHỚP độ rộng+phía [CI95] | Hiệu so đối chứng khớp | Chưa ngã ngũ (thật) | MFE/MAE thật (ATR) | MFE/MAE đối chứng |
|---|---|---|---|---|---|---|---|---|
| có | 73.7% [73.0–74.4] (n=15434) | —% [—–—] (n=0 ⚠️mẫu nhỏ) | NaN | 73.4% [73.1–73.7] | **0.3** | 3.3% | 3.33 / 3.64 | — / — |
| không | 68.5% [67.4–69.7] (n=6133) | —% [—–—] (n=0 ⚠️mẫu nhỏ) | NaN | 68.3% [67.8–68.8] | **0.2** | 1.1% | 3.62 / 3.69 | — / — |

#### Gần SMA50/SMA200 ngày (±0,25 ATR)

| Nhóm | Vùng thật: tỉ lệ bật [CI95] | Đối chứng ngẫu nhiên: tỉ lệ bật [CI95] | Hiệu (điểm %) | Đối chứng KHỚP độ rộng+phía [CI95] | Hiệu so đối chứng khớp | Chưa ngã ngũ (thật) | MFE/MAE thật (ATR) | MFE/MAE đối chứng |
|---|---|---|---|---|---|---|---|---|
| có | 77.8% [76.2–79.4] (n=2571) | 75.3% [74.3–76.3] (n=6617) | 2.5 | 76.9% [75.8–78.0] | **0.9** | 6.6% | 3.42 / 3.18 | 3.40 / 3.23 |
| không | 71.4% [70.8–72.1] (n=18996) | 71.8% [71.4–72.2] (n=58511) | -0.4 | 71.3% [71.0–71.7] | **0.1** | 2.1% | 3.41 / 3.72 | 3.38 / 3.70 |

#### Số tròn (theo roundStep)

| Nhóm | Vùng thật: tỉ lệ bật [CI95] | Đối chứng ngẫu nhiên: tỉ lệ bật [CI95] | Hiệu (điểm %) | Đối chứng KHỚP độ rộng+phía [CI95] | Hiệu so đối chứng khớp | Chưa ngã ngũ (thật) | MFE/MAE thật (ATR) | MFE/MAE đối chứng |
|---|---|---|---|---|---|---|---|---|
| có | 74.5% [73.8–75.2] (n=14373) | 74.0% [73.6–74.4] (n=44119) | 0.5 | 74.0% [73.5–74.4] | **0.6** | 3.7% | 3.35 / 3.57 | 3.32 / 3.59 |
| không | 67.6% [66.5–68.7] (n=7194) | 68.2% [67.6–68.8] (n=21009) | -0.6 | 68.0% [67.4–68.6] | **-0.4** | 0.4% | 3.54 / 3.83 | 3.52 / 3.78 |

#### Cờ khối lượng cao của dự án

| Nhóm | Vùng thật: tỉ lệ bật [CI95] | Đối chứng ngẫu nhiên: tỉ lệ bật [CI95] | Hiệu (điểm %) | Đối chứng KHỚP độ rộng+phía [CI95] | Hiệu so đối chứng khớp | Chưa ngã ngũ (thật) | MFE/MAE thật (ATR) | MFE/MAE đối chứng |
|---|---|---|---|---|---|---|---|---|
| có | 73.1% [72.3–73.9] (n=11688) | —% [—–—] (n=0 ⚠️mẫu nhỏ) | NaN | 73.8% [73.5–74.2] | **-0.7** | 3.1% | 3.37 / 3.73 | — / — |
| không | 71.1% [70.2–72.0] (n=9879) | —% [—–—] (n=0 ⚠️mẫu nhỏ) | NaN | 69.8% [69.4–70.2] | **1.4** | 2.1% | 3.45 / 3.56 | — / — |

#### Z-score khối lượng nến tạo pivot (max)

| Nhóm | Vùng thật: tỉ lệ bật [CI95] | Đối chứng ngẫu nhiên: tỉ lệ bật [CI95] | Hiệu (điểm %) | Đối chứng KHỚP độ rộng+phía [CI95] | Hiệu so đối chứng khớp | Chưa ngã ngũ (thật) | MFE/MAE thật (ATR) | MFE/MAE đối chứng |
|---|---|---|---|---|---|---|---|---|
| < 0,5 | 67.4% [65.8–69.0] (n=3225) | —% [—–—] (n=0 ⚠️mẫu nhỏ) | NaN | 66.6% [66.0–67.1] | **0.9** | 0.6% | 3.51 / 3.65 | — / — |
| 0,5–1,5 | 71.3% [70.0–72.5] (n=5019) | —% [—–—] (n=0 ⚠️mẫu nhỏ) | NaN | 70.8% [70.4–71.2] | **0.5** | 1.3% | 3.55 / 3.74 | — / — |
| ≥ 1,5 | 73.7% [73.0–74.5] (n=13323) | —% [—–—] (n=0 ⚠️mẫu nhỏ) | NaN | 73.7% [73.4–74.0] | **0.0** | 3.6% | 3.34 / 3.62 | — / — |

#### Taker cùng phía vùng ở nến chạm (S: mua; R: bán)

| Nhóm | Vùng thật: tỉ lệ bật [CI95] | Đối chứng ngẫu nhiên: tỉ lệ bật [CI95] | Hiệu (điểm %) | Đối chứng KHỚP độ rộng+phía [CI95] | Hiệu so đối chứng khớp | Chưa ngã ngũ (thật) | MFE/MAE thật (ATR) | MFE/MAE đối chứng |
|---|---|---|---|---|---|---|---|---|
| < 0,48 | 69.1% [68.2–70.0] (n=9653) | 69.0% [68.4–69.5] (n=29247) | 0.2 | 68.8% [68.3–69.4] | **0.3** | 3.4% | 3.42 / 3.41 | 3.36 / 3.45 |
| 0,48–0,52 | 72.7% [71.7–73.6] (n=8360) | 72.9% [72.4–73.5] (n=25188) | -0.2 | 72.5% [72.0–73.1] | **0.2** | 2.2% | 3.33 / 3.88 | 3.31 / 3.87 |
| ≥ 0,52 | 79.4% [78.1–80.7] (n=3554) | 79.0% [78.3–79.8] (n=10693) | 0.4 | 79.1% [78.3–79.8] | **0.4** | 1.5% | 3.58 / 3.76 | 3.59 / 3.68 |

#### RSI(14) 4H lúc chạm (quy về phía S: thấp = quá bán)

| Nhóm | Vùng thật: tỉ lệ bật [CI95] | Đối chứng ngẫu nhiên: tỉ lệ bật [CI95] | Hiệu (điểm %) | Đối chứng KHỚP độ rộng+phía [CI95] | Hiệu so đối chứng khớp | Chưa ngã ngũ (thật) | MFE/MAE thật (ATR) | MFE/MAE đối chứng |
|---|---|---|---|---|---|---|---|---|
| < 30 | 63.6% [61.5–65.6] (n=2109) | 64.5% [63.4–65.7] (n=6765) | -0.9 | 63.1% [61.8–64.4] | **0.5** | 1.3% | 3.01 / 5.64 | 3.02 / 5.59 |
| 30–45 | 70.4% [69.4–71.3] (n=9167) | 70.5% [69.9–71.0] (n=27868) | -0.1 | 70.3% [69.7–70.8] | **0.1** | 2.7% | 3.38 / 3.68 | 3.33 / 3.66 |
| ≥ 45 | 75.6% [74.8–76.4] (n=10291) | 75.4% [74.9–75.9] (n=30495) | 0.2 | 75.6% [75.1–76.1] | **-0.0** | 2.9% | 3.52 / 3.22 | 3.51 / 3.21 |

#### Phân kỳ RSI so lần chạm trước

| Nhóm | Vùng thật: tỉ lệ bật [CI95] | Đối chứng ngẫu nhiên: tỉ lệ bật [CI95] | Hiệu (điểm %) | Đối chứng KHỚP độ rộng+phía [CI95] | Hiệu so đối chứng khớp | Chưa ngã ngũ (thật) | MFE/MAE thật (ATR) | MFE/MAE đối chứng |
|---|---|---|---|---|---|---|---|---|
| không có lần chạm trước | 73.0% [69.7–76.0] (n=758) | 72.7% [71.2–74.1] (n=3499) | 0.3 | 70.4% [68.5–72.3] | **2.5** | 1.4% | 3.24 / 5.14 | 3.26 / 4.77 |
| có, không phân kỳ | 71.4% [70.7–72.0] (n=19478) | 71.4% [71.0–71.8] (n=58069) | -0.0 | 71.4% [71.0–71.7] | **0.0** | 2.8% | 3.37 / 3.62 | 3.35 / 3.62 |
| phân kỳ | 84.0% [81.9–85.9] (n=1331) | 84.2% [82.9–85.3] (n=3560) | -0.2 | 83.4% [82.1–84.6] | **0.6** | 0.9% | 4.06 / 3.31 | 3.97 / 3.08 |

#### Tốc độ tiếp cận 4 nến (ATR)

| Nhóm | Vùng thật: tỉ lệ bật [CI95] | Đối chứng ngẫu nhiên: tỉ lệ bật [CI95] | Hiệu (điểm %) | Đối chứng KHỚP độ rộng+phía [CI95] | Hiệu so đối chứng khớp | Chưa ngã ngũ (thật) | MFE/MAE thật (ATR) | MFE/MAE đối chứng |
|---|---|---|---|---|---|---|---|---|
| < 1 | 72.3% [71.6–73.0] (n=16632) | 72.1% [71.8–72.5] (n=49587) | 0.2 | 72.1% [71.7–72.5] | **0.2** | 2.8% | 3.45 / 3.46 | 3.41 / 3.47 |
| 1–2,5 | 71.4% [70.0–72.8] (n=4144) | 71.8% [71.0–72.6] (n=13035) | -0.4 | 71.5% [70.7–72.3] | **-0.1** | 2.4% | 3.22 / 4.00 | 3.26 / 3.92 |
| ≥ 2,5 | 74.5% [71.3–77.4] (n=791) | 74.3% [72.5–75.9] (n=2506) | 0.2 | 74.1% [72.2–75.9] | **0.4** | 1.1% | 3.53 / 5.91 | 3.51 / 5.89 |

#### Tỉ lệ râu nến chạm

| Nhóm | Vùng thật: tỉ lệ bật [CI95] | Đối chứng ngẫu nhiên: tỉ lệ bật [CI95] | Hiệu (điểm %) | Đối chứng KHỚP độ rộng+phía [CI95] | Hiệu so đối chứng khớp | Chưa ngã ngũ (thật) | MFE/MAE thật (ATR) | MFE/MAE đối chứng |
|---|---|---|---|---|---|---|---|---|
| < 0,3 | 64.1% [63.1–65.0] (n=9818) | 64.3% [63.8–64.9] (n=29689) | -0.3 | 64.1% [63.6–64.7] | **-0.0** | 3.0% | 3.07 / 3.87 | 3.06 / 3.90 |
| 0,3–0,5 | 76.5% [75.4–77.5] (n=6009) | 75.6% [75.0–76.2] (n=18161) | 0.9 | 75.4% [74.8–76.0] | **1.1** | 2.7% | 3.61 / 3.64 | 3.51 / 3.58 |
| ≥ 0,5 | 81.6% [80.6–82.6] (n=5740) | 82.0% [81.4–82.6] (n=17278) | -0.4 | 81.8% [81.2–82.4] | **-0.2** | 2.0% | 3.79 / 3.28 | 3.82 / 3.29 |

#### Chế độ BTC

| Nhóm | Vùng thật: tỉ lệ bật [CI95] | Đối chứng ngẫu nhiên: tỉ lệ bật [CI95] | Hiệu (điểm %) | Đối chứng KHỚP độ rộng+phía [CI95] | Hiệu so đối chứng khớp | Chưa ngã ngũ (thật) | MFE/MAE thật (ATR) | MFE/MAE đối chứng |
|---|---|---|---|---|---|---|---|---|
| BTC > SMA200 ngày | 71.1% [70.0–72.1] (n=7331) | 71.9% [71.3–72.5] (n=21962) | -0.8 | 71.8% [71.2–72.4] | **-0.7** | 2.5% | 3.29 / 3.62 | 3.29 / 3.64 |
| BTC < SMA200 ngày | 72.8% [72.0–73.5] (n=14236) | 72.3% [71.9–72.7] (n=43166) | 0.5 | 72.0% [71.6–72.5] | **0.7** | 2.7% | 3.48 / 3.67 | 3.43 / 3.65 |

_Đặc trưng chỉ có ở vùng thật (pivot, tuổi, hợp lưu khung, khối lượng tạo pivot, cờ dự án): cột đối chứng = toàn bộ đối chứng thoả điều kiện; với đối chứng các trường này không tồn tại nên ô đối chứng trống/0._

### B5. Điểm sức mạnh (luật đặt trước; chọn trên nửa khám phá, đánh giá trên nửa kiểm tra)

| Đặc trưng | Nhóm tốt nhất (khám phá) | Tỉ lệ nhóm | Tỉ lệ phần còn lại | z | Chọn? |
|---|---|---|---|---|---|
| Số pivot (touches của dự án) | ≥3 | 75.3% (n=8385) | 65.9% (n=3298) | 10.3 | **có** |
| Số lần giá ghé vùng 30 ngày trước | 0 | 73.9% (n=329) | 72.6% (n=11354) | 0.5 | không |
| Tuổi pivot mới nhất (ngày) | < 7 | 73.0% (n=8343) | 71.7% (n=3340) | 1.4 | không |
| Hợp lưu khung 1D + 4H | có | 75.3% (n=7567) | 67.8% (n=4116) | 8.7 | **có** |
| Có pivot 1D | có | 74.5% (n=8236) | 68.3% (n=3447) | 6.9 | **có** |
| Gần SMA50/SMA200 ngày (±0,25 ATR) | có | 78.7% (n=1354) | 71.9% (n=10329) | 5.3 | **có** |
| Số tròn (theo roundStep) | có | 75.3% (n=7769) | 67.4% (n=3914) | 9.1 | **có** |
| Cờ khối lượng cao của dự án | có | 73.5% (n=6514) | 71.6% (n=5169) | 2.3 | không |
| Z-score khối lượng nến tạo pivot (max) | ≥ 1,5 | 74.3% (n=6998) | 70.2% (n=4685) | 4.9 | không |
| Taker cùng phía vùng ở nến chạm (S: mua; R: bán) | ≥ 0,52 | 80.3% (n=1803) | 71.3% (n=9880) | 7.9 | **có** |
| RSI(14) 4H lúc chạm (quy về phía S: thấp = quá bán) | ≥ 45 | 76.5% (n=5689) | 69.0% (n=5994) | 9.1 | **có** |
| Phân kỳ RSI so lần chạm trước | phân kỳ | 83.2% (n=710) | 72.0% (n=10973) | 6.5 | **có** |
| Tốc độ tiếp cận 4 nến (ATR) | ≥ 2,5 | 79.9% (n=363) | 72.4% (n=11320) | 3.1 | **có** |
| Tỉ lệ râu nến chạm | ≥ 0,5 | 81.9% (n=3098) | 69.3% (n=8585) | 13.5 | **có** |
| Chế độ BTC | BTC < SMA200 ngày | 72.7% (n=11683) | —% (n=0) | NaN | không |

Điều kiện được chọn: Số pivot (touches của dự án) = ≥3; Hợp lưu khung 1D + 4H = có; Có pivot 1D = có; Gần SMA50/SMA200 ngày (±0,25 ATR) = có; Số tròn (theo roundStep) = có; Taker cùng phía vùng ở nến chạm (S: mua; R: bán) = ≥ 0,52; RSI(14) 4H lúc chạm (quy về phía S: thấp = quá bán) = ≥ 45; Phân kỳ RSI so lần chạm trước = phân kỳ; Tốc độ tiếp cận 4 nến (ATR) = ≥ 2,5; Tỉ lệ râu nến chạm = ≥ 0,5

| Điểm (nửa kiểm tra 01/08–19/10/2026) | Vùng thật: tỉ lệ bật | Đối chứng cùng điểm (chỉ tính được điều kiện ngữ cảnh) | Đối chứng KHỚP độ rộng (toàn bộ đối chứng nửa kiểm tra) |
|---|---|---|---|
| Yếu | 58.1% [52.8–63.3] (n=332) | 60.2% [58.4–62.0] (n=2874) | 65.8% [64.8–66.8] |
| Trung bình | 59.8% [56.3–63.2] (n=779) | 67.0% [66.0–67.9] (n=9580) | 66.4% [65.5–67.3] |
| Mạnh | 73.2% [72.3–74.1] (n=8773) | 76.9% [76.2–77.5] (n=17061) | 72.7% [72.2–73.2] |
| Toàn bộ nửa kiểm tra | 71.7% [70.8–72.5] (n=9884) | 72.0% [71.5–72.5] (n=29515) |

Strength dự án trên nửa kiểm tra (kết quả B):

| Strength | Tỉ lệ bật | Đối chứng KHỚP độ rộng |
|---|---|---|
| < 2 | 66.7% [63.3–69.9] (n=780) | 65.1% [63.7–66.4] |
| 2–2,5 | 68.4% [65.4–71.2] (n=955) | 66.0% [65.1–66.9] |
| ≥ 3 (ngưỡng Hạng A) | 72.5% [71.5–73.5] (n=8149) | 73.3% [72.8–73.8] |

### B6. TP1 (vùng mạnh kế tiếp, strength ≥ 2) so với TP ngẫu nhiên cùng phân phối R

Mốc có vùng SL nhưng không có TP1 (không có vùng chặn phía trước): 3216; TP1 < 1R bị loại: 67965 (đếm theo mốc, không khử trùng). Kế hoạch hợp lệ đặt lệnh: 1589; mốc bị loại vì giá đang nằm TRONG một vùng: 101266. Lệnh khớp: 580.

| Nhóm R của TP1 | n | TP1 (thật) chạm trước SL [CI95] | TP đối chứng cùng nhóm R* | Lý thuyết bước ngẫu nhiên 1/(1+R) | TP đặt SAU vùng cản (+0,5 ATR) |
|---|---|---|---|---|---|
| 1–1,5R | 328 | 42.7% [37.4–48.1] | 39.2% [34.0–44.7] (n=316) | 45.3% | 34.3% (n=327) |
| 1,5–2R | 101 (mẫu vừa) | 39.6% [30.6–49.4] | 38.5% [29.9–47.9] (n=109) | 37.0% | 34.7% (n=101) |
| 2–3R | 86 ⚠️mẫu nhỏ | 24.4% [16.6–34.5] | 31.9% [23.2–42.0] (n=91) | 29.1% | 21.2% (n=85) |
| 3–5R | 42 ⚠️mẫu nhỏ | 11.9% [5.2–25.0] | 18.9% [9.5–34.2] (n=37) | 21.0% | 9.5% (n=42) |
| ≥ 5R | 11 ⚠️mẫu nhỏ | 0.0% [0.0–25.9] | 15.4% [4.3–42.2] (n=13) | 12.5% | 0.0% (n=11) |

TP đặt SAU vùng cản so với TP đối chứng cùng R (nếu vùng cản thật sự chặn giá, cột giữa phải thấp hơn rõ):

| Nhóm R | TP sau vùng cản: chạm trước SL | TP đối chứng cùng nhóm R |
|---|---|---|
| 1–1,5R | 40.8% [30.2–52.5] (n=71 ⚠️mẫu nhỏ) | 39.2% [34.0–44.7] (n=316) |
| 1,5–2R | 39.0% [32.5–45.9] (n=200 (mẫu vừa)) | 38.5% [29.9–47.9] (n=109) |
| 2–3R | 26.6% [20.8–33.4] (n=184 (mẫu vừa)) | 31.9% [23.2–42.0] (n=91) |
| 3–5R | 13.4% [8.0–21.6] (n=97 ⚠️mẫu nhỏ) | 18.9% [9.5–34.2] (n=37) |
| ≥ 5R | 0.0% [0.0–21.5] (n=14 ⚠️mẫu nhỏ) | 15.4% [4.3–42.2] (n=13) |

| Tất cả | 568 | 36.3% | 36.0% | — | — |

Lệnh chưa ngã ngũ sau 21 ngày: 12. Kỳ vọng thô (R, bỏ phí) khi chỉ tính TP1/SL: thật -0.10R/lệnh, đối chứng -0.06R/lệnh.
* TP đối chứng: cùng giá vào/SL/thời điểm khớp, TP đặt ở R' rút ngẫu nhiên từ phân phối R thật (không gắn với vùng nào).

Theo chế độ BTC:

- BTC > SMA200: TP1 trước SL 33.1% [26.7–40.4] (n=178), R trung bình 1.77, kỳ vọng thô -0.18R
- BTC < SMA200: TP1 trước SL 37.7% [33.0–42.6] (n=390), R trung bình 1.79, kỳ vọng thô -0.07R
