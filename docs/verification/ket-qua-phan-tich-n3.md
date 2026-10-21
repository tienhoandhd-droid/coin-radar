# Kết quả: phân tích lệnh thắng/thua của N3 và thử luật bổ sung (21/10/2026)

Kế hoạch: `docs/superpowers/plans/2026-10-21-phan-tich-n3.md` (chia kỳ đặt trước; luật khóa ở commit `7df6692` TRƯỚC khi chạy kỳ B).
Mã nguồn: `backtest/research/more-trades/` — `sim.ts` (thêm trường cấp lệnh + móc luật, mặc định không đổi kết quả), `lab.ts` (nạp dữ liệu, chỉ số, bối cảnh lúc vào `n3Features`), `n3.ts` (phân tích kỳ A + chạy A/B).
Chạy lại: `node backtest/research/more-trades/n3.ts a` (kỳ A); kỳ B đã chạy một lần và bị khóa (`data/history/more-trades/n3-B-ran.json`).
Lệnh cấp chi tiết: `node backtest/research/more-trades/run.ts` ghi `data/history/more-trades/n3-trades.json` (4 533 lệnh N3 của báo cáo tăng số lệnh, kèm bối cảnh lúc vào). Số tiêu đề N3 không đổi: 2020–2025 +3 740,9%, DD 76,5%.

## Kết luận

**Không luật nào đạt tiêu chí đặt trước → giữ N3 như cũ, không thêm luật.** Cả 2 luật (và tổ hợp) đều nâng MAR kỳ B một chút nhưng DD kỳ B chỉ giảm 1–15%, không tới mức 25% kế hoạch đòi.

Điều quan trọng hơn mà kỳ B cho thấy: **bản thân N3 gốc yếu hẳn ở 2024 → 09/2026** — tổng +50,4% trong 2,7 năm nhưng DD 64,4%, MAR 0,25 (kỳ A: MAR 1,68); cận dưới CI95 lãi/lệnh âm (−0,09%), tức chưa loại được khả năng "lãi do may"; và 367% lãi ròng đến từ 5 lệnh lớn nhất (bỏ 5 lệnh đó thì lỗ). Phần lớn vẻ đẹp của N3 nằm ở 2020–2023.

## Cách đọc (cho người không lập trình)

- **Kỳ A** (2020-03 → 2023-12): chỉ ở đây được "mổ xẻ" lệnh và nghĩ luật. **Kỳ B** (2024-01 → 2026-09-18): luật mới chạy đúng MỘT lần, không sửa sau khi xem. A đẹp mà B không đẹp ⇒ luật chỉ "khớp" quá khứ, không thật.
- **R**: lãi/lỗ của lệnh chia cho tiền rủi ro lúc vào (≈ 2% vốn). R = −1 là mất trọn phần rủi ro; R = 10 là lãi gấp 10 lần phần rủi ro.
- **MFE / MAE**: lãi tạm lớn nhất / lỗ tạm lớn nhất (theo % giá) trong lúc giữ lệnh.
- **Ngũ phân vị (quintile)**: xếp các lệnh theo một đại lượng lúc vào (vd. BTC cao hơn SMA50 bao nhiêu %), chia 5 nhóm bằng nhau, xem nhóm nào thắng/thua.
- **TB %/lệnh [CI95]**: lãi trung bình mỗi lệnh (% vốn lúc vào); ngoặc là vùng tin cậy 95% (bootstrap lấy mẫu lại theo khối ngày). Cận dưới > 0 mới coi là "có lãi thật".
- **DD**: sụt vốn lớn nhất từ đỉnh xuống đáy (vốn cuối ngày). **MAR** = CAGR ÷ DD — càng cao càng tốt. **PF** = tổng lãi lệnh thắng ÷ tổng lỗ lệnh thua.
- **Funding ròng**: + là nhận về, − là phải trả (phe Long trả khi funding dương).
- **Phần lãi từ 5 lệnh lớn nhất** > 100% nghĩa là bỏ 5 lệnh đó đi thì cả kỳ lỗ.

## Vì sao thua (kỳ A)

- **Lệnh lỗ chủ yếu vì "cưa" quanh SMA50 4H, không phải vì cú sập lớn.** 79% lệnh thua; lệnh thua điển hình giữ 12 giờ, lãi tạm lớn nhất chỉ 2,0%, lỗ −0,27R (≈ −0,37% vốn): giá vừa đóng trên SMA50 rồi rơi lại ngay, hệ ra ở giá mở nến sau. Chỉ 198/2 708 lệnh chạm SL, nhưng nhóm này mất −2 698% vốn đầu kỳ (−1,01R mỗi lệnh).
- **Lệnh "vừa nhô lên" là nhóm tệ nhất.** Khi giá đóng chỉ cách SMA50 4H dưới 0,11 ATR, tỉ lệ thắng 16% và nhóm này lỗ ròng (−354%); càng cách xa, thắng càng nhiều (lên 27%).
- **Lệnh vào khi BTC yếu gần như không đem lại gì.** BTC dưới SMA50 ngày: 1 185 lệnh, tổng chỉ +22%; BTC trên SMA50 ngày: 1 523 lệnh, +2 251%.
- **Đợt sụt 76,5% (25/11/2021 → 22/10/2022, 331 ngày) là "chảy máu chậm", không phải một cú sập.** 607 lệnh đóng trong đợt, thắng 17%, mất 56,5% vốn đỉnh; 503/607 lệnh vào khi BTC dưới SMA50 ngày. Tháng nào cũng mất 5–15% vốn đỉnh (nặng nhất 04/2022: −14,9%). Có dồn cục nhưng không phải chính: ngày tệ nhất 13/12/2021 có 8 lệnh lỗ cùng ngày (−3,96% vốn), nhưng chỉ 103/505 lệnh lỗ nằm ở nến 4H có ≥ 3 lệnh lỗ cùng lúc; lúc vào thường chỉ có 3 lệnh đang mở; tương quan với BTC của lệnh lỗ trung vị 0,63 (dưới ngưỡng lọc 0,7 nên lọt). Funding không phải nguyên nhân (chỉ 0,58% vốn đỉnh).
- **Những thứ KHÔNG giải thích được lệnh thua:** funding 3 ngày trước, số lệnh đang mở, hạng thanh khoản, giờ vào lệnh, tương quan BTC — các nhóm lên xuống lộn xộn, không có chiều rõ.

## Vì sao thắng (kỳ A)

- **Lệnh thắng vì bắt được một đợt tăng dài.** 21% lệnh thắng, giữ trung vị 7 ngày, lãi tạm lớn nhất trung vị 24%; ra theo tín hiệu tắt (giá đóng lại dưới SMA50 4H) chứ không chốt lời sớm. 57 lệnh đạt ≥ 5R, 23 lệnh ≥ 10R, lớn nhất 48,8R.
- **5 lệnh lãi nhất chiếm 62% lãi ròng kỳ A** — đều là đợt "bùng nổ" của một coin: 1000SHIB 10/2021 (+20,4% vốn, giá đỉnh +219%), SEI 12/2023 (+16,7%), AVAX 11–12/2023 (+19,0%), DOGE 10–11/2022 (+46,9%, đợt tin Twitter), TRB 10/2023 (+35,3%, riêng funding nhận về 11,4% vốn vì phe Short bị ép). Giữ 12–19 ngày, MFE 118–219%.
- DOGE lãi to vì ATR thấp (1,45% giá) ⇒ SL gần ⇒ khối lượng lớn (định cỡ theo rủi ro), rồi giá tăng 167%. DOGE vào khi BTC −0,1% dưới SMA50 — luật L1 sẽ chặn lệnh này (đã ghi trước trong kế hoạch).

## Luật đề xuất (khóa trước khi chạy kỳ B)

Chỉ chọn **2 luật** (k = 2, + tổ hợp = 3 phương án) vì các ứng viên khác không có bằng chứng đơn điệu ở kỳ A:
- **L1**: chỉ mở Long khi giá đóng ngày BTC > SMA50 ngày BTC (tham số 50).
- **L2**: chỉ vào khi giá đóng nến 4H tín hiệu cách SMA50 4H ≥ 0,1 × ATR20 (tham số 0,1).
Lý do chi tiết, ứng viên bị loại và lý do loại: xem mục "Luật chọn từ kỳ A" trong kế hoạch.

## Kết quả kỳ B (chạy một lần)

### Kỳ A (2020-03-01→2023-12-31) và kỳ B (2024-01-01→2026-09-18), mỗi kỳ một lần chạy riêng vốn 10 000

| Phương án | Kỳ | Lệnh/ngày | Thắng | TB %/lệnh [CI95 khối ngày] | PF | Tổng lãi | CAGR | DD max | MAR | Lỗ thật lớn nhất/lệnh | Funding ròng (+ nhận, − trả; % vốn đầu kỳ) | Phần lãi từ 5 lệnh lớn nhất |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| N3 gốc | A | 1,93 | 21% | 0,21% [0,08%; 0,35%] | 1,21 | 2273,4% | 128,2% | 76,5% | 1,68 | 2,00% | -72,9% | 62% |
| N3 gốc | **B** | 1,20 | 20% | 0,16% [-0,09%; 0,54%] | 1,09 | 50,4% | 16,2% | 64,4% | 0,25 | 2,00% | -13,7% | 367% |
| L1 (BTC > SMA50 ngày) | A | 1,21 | 23% | 0,31% [0,12%; 0,51%] | 1,37 | 2493,1% | 133,5% | 62,9% | 2,12 | 2,00% | -214,0% | 60% |
| L1 (BTC > SMA50 ngày) | **B** | 0,82 | 20% | 0,23% [-0,13%; 0,76%] | 1,14 | 50,7% | 16,3% | 56,5% | 0,29 | 2,00% | -13,8% | 317% |
| L2 (cách SMA 4H ≥ 0,1 ATR) | A | 1,76 | 21% | 0,21% [0,08%; 0,35%] | 1,19 | 1594,3% | 109,0% | 75,4% | 1,45 | 2,00% | -24,2% | 67% |
| L2 (cách SMA 4H ≥ 0,1 ATR) | **B** | 1,09 | 21% | 0,09% [-0,06%; 0,28%] | 1,10 | 57,1% | 18,1% | 64,1% | 0,28 | 2,00% | -15,2% | 247% |
| L1 + L2 | A | 1,11 | 23% | 0,30% [0,11%; 0,50%] | 1,35 | 1839,7% | 116,5% | 62,5% | 1,86 | 2,00% | -158,1% | 63% |
| L1 + L2 | **B** | 0,76 | 20% | 0,12% [-0,10%; 0,38%] | 1,13 | 44,0% | 14,4% | 54,6% | 0,26 | 2,00% | -14,0% | 256% |

### Kỳ B khi BỎ funding nhận ở kỳ |funding quy 8 giờ| > 0,5% (tham khảo, không thuộc tiêu chí)

| Phương án | Kỳ | Lệnh/ngày | Thắng | TB %/lệnh [CI95 khối ngày] | PF | Tổng lãi | CAGR | DD max | MAR | Lỗ thật lớn nhất/lệnh | Funding ròng (+ nhận, − trả; % vốn đầu kỳ) | Phần lãi từ 5 lệnh lớn nhất |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| N3 gốc | B bỏ funding bơm | 1,20 | 20% | 0,15% [-0,09%; 0,53%] | 1,07 | 38,8% | 12,8% | 65,2% | 0,20 | 2,00% | -22,3% | 463% |
| L1 (BTC > SMA50 ngày) | B bỏ funding bơm | 0,81 | 20% | 0,22% [-0,13%; 0,75%] | 1,13 | 45,8% | 14,9% | 56,8% | 0,26 | 2,00% | -17,9% | 344% |
| L2 (cách SMA 4H ≥ 0,1 ATR) | B bỏ funding bơm | 1,09 | 21% | 0,09% [-0,07%; 0,27%] | 1,08 | 45,4% | 14,8% | 64,1% | 0,23 | 2,00% | -24,0% | 306% |
| L1 + L2 | B bỏ funding bơm | 0,76 | 20% | 0,11% [-0,10%; 0,37%] | 1,11 | 39,4% | 13,0% | 54,8% | 0,24 | 2,00% | -18,2% | 282% |

### Tiêu chí (đặt trước, so với N3 gốc kỳ B: DD 64,4%, MAR 0,25)

| Phương án | DD giảm ≥ 25% tương đối (DD ≤ 48,3%) | MAR ≥ 0,25 | Lỗ thật mỗi lệnh ≤ 2,00% | KẾT LUẬN |
|---|---|---|---|---|
| L1 (BTC > SMA50 ngày) | không (56,5%, giảm 12%) | đạt (0,29) | đạt (2,00%) | **KHÔNG NHẬN** |
| L2 (cách SMA 4H ≥ 0,1 ATR) | không (64,1%, giảm 1%) | đạt (0,28) | đạt (2,00%) | **KHÔNG NHẬN** |
| L1 + L2 | không (54,6%, giảm 15%) | đạt (0,26) | đạt (2,00%) | **KHÔNG NHẬN** |

**Áp tiêu chí nguyên văn:** không phương án nào đạt điều kiện "DD giảm ≥ 25%" ⇒ **không nhận luật nào**.

**Nhận xét (không đổi kết luận):**
- Ở kỳ A, L1 trông rất tốt (DD 76,5% → 62,9%, MAR 1,68 → 2,12). Sang kỳ B, DD chỉ giảm 64,4% → 56,5% (−12%) và tổng lãi không đổi (+50,7% so với +50,4%). Đây đúng là hình ảnh "A đẹp, B nhạt" mà kế hoạch cảnh báo.
- L2 ở kỳ A làm giảm lãi (+2 273% → +1 594%) mà DD gần như không đổi; ở B cũng không đổi DD. Bộ lọc "vừa nhô lên" cắt cả lệnh tốt lẫn xấu.
- Mọi phương án kỳ B có cận dưới CI95 âm và > 240% lãi đến từ 5 lệnh lớn nhất ⇒ lãi kỳ B của N3 dựa vào vài cú bùng nổ, không ổn định.
- Bỏ funding "bơm" (kỳ |funding quy 8 giờ| > 0,5%) chỉ làm N3 gốc kỳ B giảm từ +50,4% xuống +38,8% (DD 65,2%): ở lần chạy liên tục 2024 → 09/2026 này, funding bơm không phải nguồn lãi chính như ở lần chạy riêng 2026 trước đây. Lưu ý: vì kỳ B là một lần chạy liên tục từ 2024 (vốn 10 000), con số khác với báo cáo "tăng số lệnh" (chạy riêng 2026, +160,9%).
- Nhãn cột funding trong lần chạy gốc in nhầm là "Funding NHẬN"; số âm ở đây là trả ròng — đã sửa nhãn trong mã (không chạy lại kỳ B).

## Chi tiết kỳ A (đầu ra nguyên văn của `n3.ts a`)

<details><summary>Bảng thắng/thua, ngũ phân vị, chế độ BTC, đợt sụt, 5 lệnh lãi nhất</summary>

## Kỳ A tổng quát

N3 chạy riêng 2020-03-01→2023-12-31 (vốn 10 000): 2708 lệnh, thắng 21%, tổng 2273,4%, CAGR 128,2%, DD 76,5%, MAR 1,68, PF 1,21, TB/lệnh 0,21% [0,08%; 0,35%].

### Thắng vs thua — trung vị bối cảnh lúc vào và diễn biến

| Trường | Thắng (556) | Thua (2152) |
|---|---|---|
| BTC so với SMA50 ngày | 6,1% | 2,9% |
| Coin so với SMA50 ngày | 14,5% | 13,2% |
| Giá cách SMA50 4H (số ATR) | 0,47 | 0,33 |
| ATR 4H / giá | 3,86% | 3,68% |
| Hạng thanh khoản (1 = lớn nhất) | 11 | 11 |
| Số lệnh đang mở lúc vào | 4 | 5 |
| Tương quan 30 ngày với BTC | 0,54 | 0,54 |
| Funding TB 3 ngày (quy 8 giờ) | 0,009% | 0,009% |
| Lợi suất 7 ngày trước | 2,5% | 0,0% |
| Lợi suất 30 ngày trước | 23,6% | 21,2% |
| Giờ UTC lúc vào | 8 | 8 |
| %vốn mỗi lệnh | 0,81% | -0,37% |
| R | 0,71 | -0,27 |
| Giữ (giờ) | 168 | 12 |
| MFE (lãi tạm lớn nhất, % giá) | 24,2% | 2,0% |
| MAE (lỗ tạm lớn nhất, % giá) | -1,5% | -3,5% |
| Funding (% vốn lúc vào, + = trả) | 0,019% | 0,001% |

### Theo lý do thoát

| Nhóm | Số lệnh | Thắng | R TB | %vốn TB/lệnh | Tổng lãi (% vốn đầu kỳ 10 000) |
|---|---|---|---|---|---|
| tín-hiệu-tắt | 2504 | 22% | 0,24 | 0,32% | 4430% |
| SL | 198 | 0% | -1,01 | -1,36% | -2698% |
| hết-dữ-liệu | 1 | 0% | -0,01 | -0,00% | -0% |
| hết-kỳ | 5 | 100% | 5,32 | 5,90% | 542% |

Lệnh thua từng lãi tạm ≥ 5% giá: 552/2152 (26%); MFE trung vị lệnh thua 2,0%.

### Ngũ phân vị (quintile) theo bối cảnh lúc vào

**BTC so với SMA50 ngày**

| Nhóm | Số lệnh | Thắng | R TB | %vốn TB/lệnh | Tổng lãi (% vốn đầu kỳ 10 000) |
|---|---|---|---|---|---|
| Q1: -38,5% → -6,7% | 541 | 21% | 0,00 | 0,01% | -169% |
| Q2: -6,7% → -1,0% | 542 | 17% | 0,05 | 0,07% | -632% |
| Q3: -1,0% → 8,0% | 541 | 18% | 0,45 | 0,47% | 1200% |
| Q4: 8,0% → 17,4% | 542 | 24% | 0,20 | 0,27% | 1067% |
| Q5: 17,5% → 75,0% | 542 | 23% | 0,11 | 0,22% | 808% |

**Coin so với SMA50 ngày**

| Nhóm | Số lệnh | Thắng | R TB | %vốn TB/lệnh | Tổng lãi (% vốn đầu kỳ 10 000) |
|---|---|---|---|---|---|
| Q1: -59,2% → -5,2% | 541 | 20% | 0,06 | 0,00% | -159% |
| Q2: -5,1% → 6,7% | 542 | 18% | 0,22 | 0,31% | 679% |
| Q3: 6,7% → 20,4% | 541 | 22% | 0,41 | 0,45% | 884% |
| Q4: 20,4% → 39,6% | 542 | 20% | 0,01 | 0,05% | -236% |
| Q5: 39,6% → 327,5% | 542 | 22% | 0,09 | 0,23% | 1106% |

**Giá cách SMA50 4H (số ATR)**

| Nhóm | Số lệnh | Thắng | R TB | %vốn TB/lệnh | Tổng lãi (% vốn đầu kỳ 10 000) |
|---|---|---|---|---|---|
| Q1: 0,00 → 0,11 | 541 | 16% | -0,00 | -0,06% | -354% |
| Q2: 0,11 → 0,26 | 542 | 16% | 0,05 | 0,13% | 529% |
| Q3: 0,26 → 0,46 | 541 | 19% | 0,20 | 0,26% | 621% |
| Q4: 0,46 → 1,02 | 542 | 25% | 0,38 | 0,35% | 828% |
| Q5: 1,02 → 10,67 | 542 | 27% | 0,18 | 0,36% | 650% |

**ATR 4H / giá**

| Nhóm | Số lệnh | Thắng | R TB | %vốn TB/lệnh | Tổng lãi (% vốn đầu kỳ 10 000) |
|---|---|---|---|---|---|
| Q1: 0,53% → 2,40% | 541 | 19% | 0,44 | 0,65% | 1371% |
| Q2: 2,40% → 3,27% | 542 | 20% | 0,15 | 0,05% | 432% |
| Q3: 3,27% → 4,23% | 541 | 18% | 0,01 | 0,02% | -430% |
| Q4: 4,23% → 5,48% | 542 | 22% | 0,10 | 0,16% | 692% |
| Q5: 5,48% → 24,12% | 542 | 23% | 0,10 | 0,16% | 209% |

**Hạng thanh khoản (1 = lớn nhất)**

| Nhóm | Số lệnh | Thắng | R TB | %vốn TB/lệnh | Tổng lãi (% vốn đầu kỳ 10 000) |
|---|---|---|---|---|---|
| Q1: 1 → 5 | 541 | 22% | 0,27 | 0,47% | 1366% |
| Q2: 5 → 9 | 542 | 20% | 0,16 | 0,27% | 806% |
| Q3: 9 → 13 | 541 | 20% | 0,03 | 0,02% | 22% |
| Q4: 13 → 17 | 542 | 21% | 0,20 | 0,10% | 195% |
| Q5: 17 → 20 | 542 | 20% | 0,13 | 0,19% | -116% |

**Số lệnh đang mở lúc vào**

| Nhóm | Số lệnh | Thắng | R TB | %vốn TB/lệnh | Tổng lãi (% vốn đầu kỳ 10 000) |
|---|---|---|---|---|---|
| Q1: 0 → 2 | 541 | 24% | 0,26 | 0,53% | 838% |
| Q2: 2 → 4 | 542 | 20% | 0,05 | 0,10% | -9% |
| Q3: 4 → 5 | 541 | 19% | 0,09 | 0,11% | 529% |
| Q4: 5 → 7 | 542 | 18% | 0,23 | 0,17% | 120% |
| Q5: 7 → 9 | 542 | 22% | 0,17 | 0,13% | 795% |

**Tương quan 30 ngày với BTC**

| Nhóm | Số lệnh | Thắng | R TB | %vốn TB/lệnh | Tổng lãi (% vốn đầu kỳ 10 000) |
|---|---|---|---|---|---|
| Q1: -0,49 → 0,31 | 541 | 19% | 0,10 | 0,15% | 75% |
| Q2: 0,31 → 0,48 | 542 | 20% | 0,09 | 0,03% | 138% |
| Q3: 0,48 → 0,60 | 541 | 24% | 0,33 | 0,47% | 1851% |
| Q4: 0,60 → 0,70 | 542 | 21% | 0,08 | 0,15% | -36% |
| Q5: 0,71 → 1,00 | 542 | 19% | 0,19 | 0,25% | 246% |

**Funding TB 3 ngày (quy 8 giờ)**

| Nhóm | Số lệnh | Thắng | R TB | %vốn TB/lệnh | Tổng lãi (% vốn đầu kỳ 10 000) |
|---|---|---|---|---|---|
| Q1: -2,004% → -0,005% | 538 | 21% | 0,16 | 0,20% | 136% |
| Q2: -0,005% → 0,006% | 538 | 22% | 0,30 | 0,42% | 912% |
| Q3: 0,006% → 0,010% | 538 | 19% | 0,09 | 0,14% | -88% |
| Q4: 0,010% → 0,024% | 538 | 21% | 0,14 | 0,22% | 1458% |
| Q5: 0,024% → 0,299% | 538 | 20% | 0,12 | 0,06% | -115% |
| thiếu số liệu | 18 | 17% | -0,12 | -0,14% | -30% |

**Lợi suất 7 ngày trước**

| Nhóm | Số lệnh | Thắng | R TB | %vốn TB/lệnh | Tổng lãi (% vốn đầu kỳ 10 000) |
|---|---|---|---|---|---|
| Q1: -37,9% → -5,8% | 541 | 16% | 0,06 | 0,06% | -458% |
| Q2: -5,8% → -1,3% | 542 | 18% | 0,25 | 0,15% | 513% |
| Q3: -1,3% → 2,8% | 541 | 19% | 0,33 | 0,55% | 1550% |
| Q4: 2,8% → 10,7% | 542 | 23% | 0,19 | 0,26% | 956% |
| Q5: 10,8% → 351,7% | 542 | 27% | -0,02 | 0,03% | -288% |

**Lợi suất 30 ngày trước**

| Nhóm | Số lệnh | Thắng | R TB | %vốn TB/lệnh | Tổng lãi (% vốn đầu kỳ 10 000) |
|---|---|---|---|---|---|
| Q1: -74,5% → -6,3% | 540 | 18% | 0,09 | 0,07% | 46% |
| Q2: -6,3% → 10,9% | 541 | 19% | 0,25 | 0,36% | 888% |
| Q3: 10,9% → 33,5% | 541 | 23% | 0,31 | 0,25% | 403% |
| Q4: 33,6% → 69,7% | 541 | 21% | 0,07 | 0,13% | -113% |
| Q5: 69,8% → 945,7% | 541 | 22% | 0,09 | 0,23% | 1080% |
| thiếu số liệu | 4 | 25% | -0,68 | -0,45% | -32% |

**Giờ UTC lúc vào**

| Nhóm | Số lệnh | Thắng | R TB | %vốn TB/lệnh | Tổng lãi (% vốn đầu kỳ 10 000) |
|---|---|---|---|---|---|
| Q1: 0 → 0 | 541 | 22% | 0,07 | 0,10% | 573% |
| Q2: 0 → 8 | 542 | 23% | 0,34 | 0,23% | 394% |
| Q3: 8 → 12 | 541 | 18% | 0,10 | 0,21% | -159% |
| Q4: 12 → 16 | 542 | 20% | 0,12 | 0,24% | 792% |
| Q5: 16 → 20 | 542 | 19% | 0,16 | 0,25% | 673% |

### Chế độ BTC (giá đóng ngày so với SMA50 ngày) và năm

| Nhóm | Số lệnh | Thắng | R TB | %vốn TB/lệnh | Tổng lãi (% vốn đầu kỳ 10 000) |
|---|---|---|---|---|---|
| BTC trên SMA50 ngày | 1523 | 22% | 0,21 | 0,26% | 2251% |
| BTC dưới/bằng SMA50 ngày | 1185 | 19% | 0,10 | 0,14% | 22% |
| Coin trên SMA50 ngày | 1928 | 21% | 0,16 | 0,22% | 1592% |
| Coin dưới/bằng SMA50 ngày | 780 | 19% | 0,17 | 0,19% | 681% |
| 2020 | 468 | 22% | 0,19 | 0,42% | 292% |
| 2020, BTC trên SMA50 | 343 | 22% | 0,17 | 0,38% | 241% |
| 2020, BTC dưới SMA50 | 125 | 22% | 0,24 | 0,54% | 52% |
| 2021 | 798 | 22% | 0,23 | 0,27% | 1371% |
| 2021, BTC trên SMA50 | 520 | 24% | 0,32 | 0,38% | 1424% |
| 2021, BTC dưới SMA50 | 278 | 19% | 0,06 | 0,06% | -54% |
| 2022 | 633 | 16% | -0,03 | -0,07% | -966% |
| 2022, BTC trên SMA50 | 131 | 15% | -0,18 | -0,29% | -419% |
| 2022, BTC dưới SMA50 | 502 | 17% | 0,01 | -0,01% | -547% |
| 2023 | 809 | 21% | 0,22 | 0,24% | 1577% |
| 2023, BTC trên SMA50 | 529 | 21% | 0,22 | 0,20% | 1005% |
| 2023, BTC dưới SMA50 | 280 | 21% | 0,23 | 0,32% | 572% |

### DD lớn nhất kỳ A: 76,5% từ 2021-11-25 tới 2022-10-22 (331 ngày)

Lệnh ĐÓNG trong đoạn sụt: 607, thắng 17%, tổng -56,5% vốn đỉnh; R TB -0,11; trong đó vào khi BTC dưới SMA50 ngày: 503, funding 0,58% vốn đỉnh (+ = trả).

| Tháng đóng lệnh | Số lệnh | Thắng | Tổng (% vốn đỉnh) | Lệnh SL | Vào khi BTC < SMA50 |
|---|---|---|---|---|---|
| 2021-11 | 16 | 13% | 0,3% | 2 | 15 |
| 2021-12 | 84 | 19% | -8,0% | 4 | 84 |
| 2022-01 | 46 | 15% | -8,6% | 3 | 46 |
| 2022-02 | 42 | 24% | -5,4% | 0 | 30 |
| 2022-03 | 26 | 15% | 3,4% | 2 | 15 |
| 2022-04 | 74 | 12% | -14,9% | 6 | 44 |
| 2022-05 | 29 | 17% | -5,7% | 2 | 29 |
| 2022-06 | 48 | 19% | -4,5% | 1 | 48 |
| 2022-07 | 46 | 26% | 0,5% | 0 | 39 |
| 2022-08 | 59 | 24% | -0,8% | 3 | 26 |
| 2022-09 | 72 | 13% | -6,6% | 8 | 69 |
| 2022-10 | 65 | 8% | -6,1% | 1 | 58 |

Dồn cục: số lệnh lỗ đóng CÙNG một nến 4H — nhiều nhất 5; số nến có ≥ 3 lệnh lỗ cùng lúc: 32; lệnh lỗ nằm trong các nến đó: 103/505.

5 ngày lỗ nặng nhất trong đoạn sụt:

| Ngày | Lệnh lỗ đóng | Tổng (% vốn đỉnh) | Mã |
|---|---|---|---|
| 2021-12-13 | 8 | -3,96% | BTC 1000SHIB SAND AVAX DOT LRC DOT GALA |
| 2021-12-04 | 4 | -3,87% | SOL LUNA MATIC MATIC |
| 2021-12-03 | 6 | -3,74% | 1000SHIB ALICE BNB 1000SHIB LTC ADA |
| 2022-05-05 | 5 | -3,17% | ETH DOGE NEAR WAVES ZIL |
| 2022-02-18 | 5 | -3,13% | MANA ATOM AVAX MANA ATOM |

Tương quan với BTC của lệnh lỗ trong đoạn sụt: trung vị 0,63; số lệnh mở lúc vào trung vị 3.

### 5 lệnh lãi lớn nhất (tổng 62% lãi ròng kỳ A)

| Mã | Vào → ra | Lý do | %vốn | R | Giữ (ngày) | MFE | Funding (%vốn) | BTC vs SMA50 | Coin vs SMA50 | Cách SMA 4H (ATR) | ATR% | Lệnh mở | ret30 | fund3d |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1000SHIBUSDT | 2021-10-20T00 → 2021-11-03T08 | tín-hiệu-tắt | 20,4% | 10,2 | 14,3 | 219% | 0,01% | 29,6% | 112,4% | 0,26 | 5,29% | 4 | 247% | 0,023% |
| SEIUSDT | 2023-12-18T20 → 2023-12-31T20 | hết-kỳ | 16,7% | 8,4 | 13,0 | 136% | 0,46% | 7,9% | 20,5% | 2,00 | 4,95% | 4 | 61% | 0,021% |
| AVAXUSDT | 2023-11-29T04 → 2023-12-18T08 | tín-hiệu-tắt | 19,0% | 10,9 | 19,2 | 118% | 0,30% | 11,6% | 45,7% | 0,25 | 3,06% | 7 | 82% | 0,010% |
| DOGEUSDT | 2022-10-24T20 → 2022-11-06T04 | tín-hiệu-tắt | 46,9% | 29,1 | 12,3 | 167% | 0,13% | -0,1% | -0,7% | 0,13 | 1,45% | 6 | -5% | 0,009% |
| TRBUSDT | 2023-10-14T12 → 2023-11-02T16 | tín-hiệu-tắt | 35,3% | 17,6 | 19,2 | 153% | -11,41% | 0,8% | 41,2% | 0,72 | 3,36% | 0 | 59% | 0,004% |

R lớn nhất 48,8; số lệnh R ≥ 5: 57; R ≥ 10: 23. MFE ≥ 100%: 49 lệnh.

</details>

## Ghi chú cách đo

- Bối cảnh lúc vào chỉ dùng nến ngày đã đóng trước ngày vào và nến 4H tín hiệu đã đóng (không nhìn trước). Funding 3 ngày = tổng các kỳ funding trong 72 giờ trước khi vào ÷ 9 (quy về kỳ 8 giờ, để mã có kỳ funding 1/4 giờ so được).
- MFE/MAE đo theo giá cao/thấp của nến 4H trong lúc giữ; nến chạm SL tính đáy bằng giá khớp.
- Kỳ A và B là hai lần chạy riêng (vốn 10 000 mỗi lần); chỉ báo dùng nến trước kỳ để khởi động. Không dùng dữ liệu ≥ 2026-09-19 (assert trong `common.ts`). Không tải thêm dữ liệu nào.
- "Bỏ funding bơm": ở mỗi kỳ funding mà phe Long được NHẬN với |tỉ lệ quy 8 giờ| > 0,5%, khoản nhận đó không cộng vào vốn (các khoản trả vẫn tính đủ).
