# Kết quả kiểm lại bot mã nguồn mở "tỉ lệ thắng cao" trên dữ liệu Binance USDⓈ-M của mình

Ngày chạy: 2026-10-20. Kế hoạch đăng ký trước: `docs/superpowers/plans/2026-10-20-kiem-lai-bot-github.md` (không chỉnh tham số theo kết quả). Mã mô phỏng: `backtest/research/github-retest/` (chạy `node backtest/research/github-retest/run.ts`, 0.6 phút).

## Cách đọc (cho người không lập trình)

Mỗi bot được "dịch" nguyên luật từ mã nguồn trên GitHub sang bộ mô phỏng của mình rồi chạy lại trên nến Binance Futures của mình, với hai cách tính: **lạc quan** (giả định như bộ backtest gốc: khớp đúng giá mở nến, chốt lời tính là đạt nếu giá cao nhất của nến chạm tới, phí 0,1% khứ hồi) và **bi quan** (khớp giá mở nến sau cộng trượt 0,02%, nếu trong cùng một nến giá chạm cả cắt lỗ lẫn chốt lời thì tính là cắt lỗ, phí khứ hồi 0,136% — mức đo thực tế của mình — và bản 0,4%, trả funding thật khi giữ qua kỳ funding, giữ tối đa 30 ngày). **Chênh lệch lạc quan − bi quan chính là phần "ảo" của con số quảng cáo.**

- **Kỳ vọng R**: lãi trung bình mỗi lệnh tính theo đơn vị rủi ro (1R = 2% vốn đặt ở cắt lỗ). Dương là có lợi thế, âm là mất tiền dần. **CI95 khối ngày**: khoảng tin cậy 95% của kỳ vọng, lấy mẫu lại theo từng ngày (lệnh cùng ngày chịu chung cú sốc). Nếu **cận dưới > 0** thì lợi thế mới được coi là có thật về thống kê.
- **PF** (profit factor): tổng lãi chia tổng lỗ; > 1 là lãi. **DD** (drawdown): mức sụt vốn lớn nhất từ đỉnh. **Tổng %**: lãi cộng dồn trên vốn ban đầu (không lãi kép, trừ J1/E1/P1/P2 ghi riêng). Vì không lãi kép nên tổng % có thể âm quá −100 và DD quá 100%: nghĩa là **vốn đã cháy trước khi hết kỳ** (với cách định cỡ 2%/lệnh, 5 lệnh cùng lúc); con số càng âm chỉ cho biết lỗ dồn càng nhanh.
- Tiêu chí "đáng xem tiếp" đặt trước khi chạy: bản **bi quan 0,136%** phải có cận dưới CI95 > 0 trên kỳ D **và** tổng lãi > 0 ở 5–9/2026 **và** DD ≤ 20%. Không đạt → "không có lợi thế trên dữ liệu của mình", không chỉnh tham số để cho đạt.

## Tóm tắt

| Ứng viên | Bi quan 0,136% kỳ D: lệnh | Kỳ vọng (R hoặc %) | CI95 | PF | Tổng % D | DD % D | Tổng % 5–9/2026 | Lạc quan tổng % 5–9/2026 | Đạt tiêu chí? |
|---|---|---|---|---|---|---|---|---|---|
| G1 BinHV45 | 603 | -0.087 R | [-0.137, -0.034] | 0.68 | -104.5 | 106.0 | -143.0 | -122.7 | không |
| G2 ClucMay72018 | 3250 | -0.096 R | [-0.119, -0.075] | 0.60 | -625.7 | 627.3 | -1069.3 | -964.1 | không |
| G3 SMAOffsetProtectOptV1 | 2281 | -0.007 R | [-0.016, 0.001] | 0.83 | -31.5 | 34.0 | -60.7 | -55.3 | không |
| G4 ReinforcedQuickie | 1488 | -0.015 R | [-0.039, 0.009] | 0.91 | -43.6 | 88.2 | -125.8 | -42.1 | không |
| G5 BigZ04_TSL4 | 1063 | -0.026 R | [-0.072, 0.026] | 0.91 | -55.2 | 72.8 | -103.3 | 399.8 | không |
| H1 Bollinger %B (15m) | 8236 | -0.155 R | [-0.190, -0.122] | 0.77 | -2555.4 | 2477.4 | -3690.4 | 2757.0 | không |
| H1 Bollinger %B (1h) | 4502 | -0.160 R | [-0.205, -0.111] | 0.77 | -1443.6 | 1265.8 | -2135.1 | 5902.4 | không |
| H2 MACD+BB (1h) | 3730 | -0.136 R | [-0.189, -0.078] | 0.82 | -1013.4 | 912.6 | -2032.4 | 8992.7 | không |
| J1 SMA 50/200 (1D) (cột D = 2020–2025) | 8121 | 2.526 % | [1.531, 3.484] | 1.29 | -14.3 | 69.9 | -14.7 | -4.9 | không |
| E1 EMA walk-forward (BTC) (cột D = 2020–2025) | 84 | 1.338 % | [-1.772, 4.865] | 1.27 | 28.7 | 74.0 | -3.9 | 6.4 | không |
| P1 Grid 6 lưới tĩnh (1×) | 40 | 2.125% | [-3.536, 12.096] | 1.31 | 5.7 | 72.9 (max) | 1.7 | 2.6 | không |
| P1 Grid 6 lưới + DGT reset (1×) | 45 | 1.993% | [-5.446, 13.192] | 1.25 | 0.0 | 100.0 (max) | -0.5 | 0.7 | không |
| P2 Martingale 1-1-2-4 (1×) | 1752 | -0.059% | [-0.287, 0.135] | 0.83 | -2.0 | 100.0 (max) | -20.0 | -5.4 | không |

**Lý do từng ứng viên (tiêu chí đặt trước):**

- G1 BinHV45: không đạt — CI dưới D [ -0.137 ≤ 0; tổng 5–9/2026 -143.0% ≤ 0; DD 106.0%/142.2% > 20%.
- G2 ClucMay72018: không đạt — CI dưới D [ -0.119 ≤ 0; tổng 5–9/2026 -1069.3% ≤ 0; DD 627.3%/999.9% > 20%.
- G3 SMAOffsetProtectOptV1: không đạt — CI dưới D [ -0.016 ≤ 0; tổng 5–9/2026 -60.7% ≤ 0; DD 34.0%/63.3% > 20%.
- G4 ReinforcedQuickie: không đạt — CI dưới D [ -0.039 ≤ 0; tổng 5–9/2026 -125.8% ≤ 0; DD 88.2%/164.5% > 20%.
- G5 BigZ04_TSL4: không đạt — CI dưới D [ -0.072 ≤ 0; tổng 5–9/2026 -103.3% ≤ 0; DD 72.8%/113.2% > 20%.
- H1 Bollinger %B (15m): không đạt — CI dưới D [ -0.190 ≤ 0; tổng 5–9/2026 -3690.4% ≤ 0; DD 2477.4%/3671.9% > 20%.
- H1 Bollinger %B (1h): không đạt — CI dưới D [ -0.205 ≤ 0; tổng 5–9/2026 -2135.1% ≤ 0; DD 1265.8%/1838.3% > 20%.
- H2 MACD+BB (1h): không đạt — CI dưới D [ -0.189 ≤ 0; tổng 5–9/2026 -2032.4% ≤ 0; DD 912.6%/2035.3% > 20%.
- J1 SMA 50/200 (1D): không đạt — CI dưới 2020–2025 1.531 > 0; tổng 5–9/2026 -14.7% ≤ 0; DD 69.9%/18.7% > 20%.
- E1 EMA walk-forward (BTC): không đạt — 1D: CI dưới 2020–2025 -1.772 ≤ 0; tổng 5–9/2026 -3.9% ≤ 0; DD 74.0%/21.9% > 20%; 1h 5–9/2026 tổng -9.4%, DD 30.6%.
- P1-static: không đạt — CI dưới D -3.536 ≤ 0; tổng TB 5–9/2026 1.7% > 0; DD lớn nhất 72.9%/79.5% > 20% (1×).
- P1-dgt: không đạt — CI dưới D -5.446 ≤ 0; tổng TB 5–9/2026 -0.5% ≤ 0; DD lớn nhất 100.0%/95.1% > 20% (1×).
- P2: không đạt — CI dưới D -0.287 ≤ 0; tổng TB 5–9/2026 -20.0% ≤ 0; DD lớn nhất 100.0%/100.0% > 20% (1×).

**Đạt tiêu chí:** không ứng viên nào.

## Cách chạy chung

- Cửa sổ: D = [19/6/2026, 19/9/2026); "5–9/2026" = [1/5/2026, 19/9/2026) (D nằm trong); 2020–2025 = [1/1/2020, 1/1/2026). **Kỳ mù B [19/9, 19/10/2026) không được đọc** (assert trong mã: mọi nến nạp vào đều kiểm closeTime; funding kỳ B bị cắt). Kỳ C [1/1, 1/5/2026) chỉ dùng làm nến khởi động chỉ báo cho cửa sổ 5–9/2026 (900 nến 15m / 260 nến 1h / 210 nến 1d trước 1/5/2026).
- Vũ trụ G/H: top-200 thanh khoản **theo thời điểm** — mỗi ngày xếp hạng trung bình quoteVolume 30 nến ngày đã đóng (data/history/1d, 885 mã kể cả đã hủy niêm yết, bỏ stablecoin); chỉ vào lệnh nếu mã đang trong top-200 ngày đó. 430 mã từng lọt top-200 trong 5–9/2026; thiếu nến 15m: 75 mã (AAOIUSDT, AAPLUSDT, AMDUSDT, AMZNUSDT, ARMUSDT, AVGOUSDT, AXTIUSDT, BABAUSDT, BEUSDT, BMNRUSDT, BNCUSDT, BZUSDT…); thiếu 1h: 75.
- Khung: G1 gốc 1m, G2–G5 gốc 5m, H gốc 3m → **chạy 15m** (không có 1m/5m cho vũ trụ này); G4/G5 cần 1h → gộp từ 15m. H1 chạy cả 15m và 1h, H2 chạy 1h, J1 1D, E1 1D (và 1h cho 5–9/2026).
- Định cỡ: rủi ro 2% vốn tại cắt lỗ (G1/G2/G4 SL 5% → notional 40% vốn; G3 SL 50% → 4%; G5 stop cứng 8% → 25%; H1/H2 SL 1% → 200% vốn = đòn bẩy 2×). J1/E1 không SL → 100% số dư mỗi mã theo tác giả, lãi kép, tài khoản riêng từng mã; "tổng %" = trung bình các mã. P1/P2 theo tác giả (vốn M chia lưới / 8 phần).
- **Giới hạn danh mục (giả định báo cáo, không có trong kế hoạch): tối đa 5 lệnh mở cùng lúc** (2% × 5 = 10% rủi ro mở, trùng luật bot hiện tại), lệnh đến trước lấy chỗ trước; lệnh hết chỗ bị bỏ (cột "Bỏ vì hết chỗ"). Không giới hạn thì H1 có hàng trăm lệnh/mã × 200 mã và "tổng %" thành con số vô nghĩa. Số lệnh thô (không giới hạn) ghi trong ngoặc.
- Lạc quan = tái hiện giả định của bộ backtest gốc: Freqtrade (đọc mã lõi freqtrade/strategy/interface.py: thứ tự exit-signal → stoploss → ROI → trailing; ROI theo lãi RÒNG đã trừ phí; custom_stoploss tính ở HIGH của nến rồi mới so với LOW); Hummingbot (TP ưu tiên khi cùng nến). Phí 0,1% khứ hồi (0,05%/chiều — hiểu "phí 0,1%" trong kế hoạch là khứ hồi để bản lạc quan luôn lạc quan hơn bản bi quan; Freqtrade mặc định 0,1%/lệnh còn tốn hơn).
- Bi quan: trượt 0,02% mọi lệnh thị trường (vào, SL, thoát tín hiệu/thời gian); SL xét trước TP cùng nến và stop chỉ cập nhật bằng giá ĐÓNG nến trước; phí 0,068%/chiều (0,136% khứ hồi) và 0,2%/chiều (0,4%); funding thật mỗi 8h từ data/cache/funding (từ 3/2025) + BTC/ETH từ 12/2019; thiếu dữ liệu → long trả 0,01%/kỳ, short không nhận; giữ tối đa 30 ngày rồi đóng ở giá mở (J1/E1 vào lại ngay nếu tín hiệu còn → tốn thêm phí).
- Chống nhìn trước: mọi chỉ báo tính cuốn chiếu từ nến đã đóng; chỉ báo khung 1h lấy nến 1h ĐÃ ĐÓNG tại giờ mở nến 15m (như merge_informative_pair); **shift test** chạy trong mã (cắt 60 nến cuối, tín hiệu phần còn lại phải y hệt) trên BTC/ETH/SOL cho mọi chiến lược — đều qua (nếu không, mã ném lỗi và không có báo cáo này).
- Bootstrap: 2000 lần lấy mẫu lại theo khối ngày vào lệnh, seed cố định.

## Nguồn đã tải (data/external, chỉ đọc, không chạy)

| Repo | Commit | Licence | Dùng cho |
|---|---|---|---|
| freqtrade/freqtrade-strategies | f3340ce11f5bdf62f598522e64d1f5638eaa13f5 | GPL-3.0 | G1 BinHV45.py, G2 ClucMay72018.py, G4 ReinforcedQuickie.py |
| PeetCrypto/freqtrade-stuff | f6c38def0b2fe01d8d42e47740cdeab53511527b | không có file licence | G3 SMAOffsetProtectOptV1.py |
| phuchust/freqtrade_strategy | 4a0176ed284379a060262d5943394f2ca056d3d7 | không có file licence (README: "Don't use for live trading") | G5 BigZ04_TSL4.py |
| freqtrade/freqtrade (mã lõi) | 7ff17f5f5ac2f7bbc55a2937fd493a68c9951647 | GPL-3.0 | xác nhận thứ tự thoát lệnh/giá khớp của bộ backtest |
| jesse-ai/example-strategies | 7c91e0a37bf62165790120d730442e4f6eb00364 | MIT | J1 SMACrossover |
| hummingbot/hummingbot | 9af100d6822da7d2d0291a906c730ef172284ee2 | Apache-2.0 | H1 bollinger_v1.py, H2 macd_bb_v1.py (ngưỡng 0,3/0,7 + triple barrier lấy từ trang ví dụ docs; mã hiện tại mặc định 0,0/1,0) |
| arXiv 2506.11921 (Chen, Chen & Jang), Pionex help, arXiv 2602.10785 | — | — | P1, P2, E1 (không có mã, port theo mô tả) |

## G1 BinHV45

Tác giả công bố: Tác giả không công bố số liệu (file không có claim). Danh tiếng "win rate cao" truyền miệng Discord 2021.

- Số mã có dữ liệu 15m: 355/430.

| Bản | Cửa sổ | Lệnh (thô) | Bỏ vì hết chỗ | Thắng % | Kỳ vọng %/lệnh | Kỳ vọng R | CI95 khối ngày | PF | Tổng % | DD % | Lỗ nhất 1 lệnh % | Mở cuối kỳ | Mở đồng thời max |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lạc quan (phí 0,1% khứ hồi) | D [19/6–19/9/2026) | 604 (629) | 25 | 74.2 | -0.156 | -0.078 | [-0.127, -0.029] R | 0.70 | -94.0 | 95.5 | -2.04 | 0 | 5 |
| lạc quan (phí 0,1% khứ hồi) | 5–9/2026 [1/5–19/9/2026) | 1044 (1207) | 163 | 75.7 | -0.118 | -0.059 | [-0.095, -0.021] R | 0.76 | -122.7 | 122.3 | -2.04 | 0 | 5 |
| bi quan 0,136% | D [19/6–19/9/2026) | 603 (628) | 25 | 73.5 | -0.173 | -0.087 | [-0.137, -0.034] R | 0.68 | -104.5 | 106.0 | -2.08 | 0 | 5 |
| bi quan 0,136% | 5–9/2026 [1/5–19/9/2026) | 1040 (1206) | 166 | 74.9 | -0.138 | -0.069 | [-0.106, -0.030] R | 0.73 | -143.0 | 142.2 | -2.08 | 0 | 5 |
| bi quan 0,4% | D [19/6–19/9/2026) | 598 (625) | 27 | 70.2 | -0.283 | -0.142 | [-0.197, -0.085] R | 0.55 | -169.3 | 168.7 | -2.18 | 1 | 5 |
| bi quan 0,4% | 5–9/2026 [1/5–19/9/2026) | 1032 (1203) | 171 | 71.8 | -0.243 | -0.122 | [-0.162, -0.078] R | 0.60 | -251.3 | 249.8 | -2.18 | 1 | 5 |

## G2 ClucMay72018

Tác giả công bố: Tác giả không công bố số liệu.

- Số mã có dữ liệu 15m: 355/430.

| Bản | Cửa sổ | Lệnh (thô) | Bỏ vì hết chỗ | Thắng % | Kỳ vọng %/lệnh | Kỳ vọng R | CI95 khối ngày | PF | Tổng % | DD % | Lỗ nhất 1 lệnh % | Mở cuối kỳ | Mở đồng thời max |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lạc quan (phí 0,1% khứ hồi) | D [19/6–19/9/2026) | 3282 (3771) | 489 | 74.9 | -0.168 | -0.084 | [-0.104, -0.063] R | 0.64 | -550.2 | 552.9 | -2.04 | 0 | 5 |
| lạc quan (phí 0,1% khứ hồi) | 5–9/2026 [1/5–19/9/2026) | 5310 (6615) | 1305 | 74.3 | -0.182 | -0.091 | [-0.109, -0.073] R | 0.62 | -964.1 | 903.2 | -2.04 | 0 | 5 |
| bi quan 0,136% | D [19/6–19/9/2026) | 3250 (3749) | 499 | 73.9 | -0.193 | -0.096 | [-0.119, -0.075] R | 0.60 | -625.7 | 627.3 | -2.08 | 0 | 5 |
| bi quan 0,136% | 5–9/2026 [1/5–19/9/2026) | 5244 (6576) | 1332 | 73.3 | -0.204 | -0.102 | [-0.120, -0.084] R | 0.59 | -1069.3 | 999.9 | -2.11 | 0 | 5 |
| bi quan 0,4% | D [19/6–19/9/2026) | 3139 (3672) | 533 | 70.4 | -0.284 | -0.142 | [-0.166, -0.119] R | 0.50 | -891.5 | 886.3 | -2.18 | 0 | 5 |
| bi quan 0,4% | 5–9/2026 [1/5–19/9/2026) | 5058 (6453) | 1395 | 70.0 | -0.293 | -0.147 | [-0.165, -0.127] R | 0.49 | -1482.3 | 1400.0 | -2.21 | 0 | 5 |

## G3 SMAOffsetProtectOptV1

Tác giả công bố: Tác giả không công bố số liệu. Cùng họ với NotAnotherSMAOffsetStrategyHO: Freqle League 2022–2024 (aggregator, nhãn C) +117,0%, win rate 80,7%, DD −3,51%.

- Số mã có dữ liệu 15m: 355/430.

| Bản | Cửa sổ | Lệnh (thô) | Bỏ vì hết chỗ | Thắng % | Kỳ vọng %/lệnh | Kỳ vọng R | CI95 khối ngày | PF | Tổng % | DD % | Lỗ nhất 1 lệnh % | Mở cuối kỳ | Mở đồng thời max |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lạc quan (phí 0,1% khứ hồi) | D [19/6–19/9/2026) | 2296 (2896) | 600 | 77.0 | -0.012 | -0.006 | [-0.015, 0.002] R | 0.85 | -28.3 | 31.3 | -2.00 | 3 | 5 |
| lạc quan (phí 0,1% khứ hồi) | 5–9/2026 [1/5–19/9/2026) | 3546 (4675) | 1129 | 76.6 | -0.016 | -0.008 | [-0.014, -0.002] R | 0.81 | -55.3 | 58.1 | -2.00 | 3 | 5 |
| bi quan 0,136% | D [19/6–19/9/2026) | 2281 (2878) | 597 | 76.5 | -0.014 | -0.007 | [-0.016, 0.001] R | 0.83 | -31.5 | 34.0 | -2.01 | 3 | 5 |
| bi quan 0,136% | 5–9/2026 [1/5–19/9/2026) | 3520 (4646) | 1126 | 76.1 | -0.017 | -0.009 | [-0.015, -0.002] R | 0.79 | -60.7 | 63.3 | -2.01 | 3 | 5 |
| bi quan 0,4% | D [19/6–19/9/2026) | 2219 (2816) | 597 | 73.3 | -0.022 | -0.011 | [-0.021, -0.003] R | 0.74 | -49.1 | 50.5 | -2.02 | 3 | 5 |
| bi quan 0,4% | 5–9/2026 [1/5–19/9/2026) | 3413 (4551) | 1138 | 72.8 | -0.025 | -0.012 | [-0.019, -0.006] R | 0.72 | -84.0 | 85.1 | -2.02 | 3 | 5 |

## G4 ReinforcedQuickie

Tác giả công bố: Tác giả không công bố số liệu ("only buy on an upward tending market").

- Số mã có dữ liệu 15m: 355/430.
- Khác mã gốc: gốc nội suy SMA25(1h) theo thời gian tới nến 1h CHƯA đóng (nhìn trước); bản port dùng SMA25 của nến 1h đã đóng gần nhất và "đang tăng" = SMA giờ này > SMA giờ trước. Gốc tính BB trên typical price rồi ghi đè bằng BB trên close — giữ nguyên (BB close).

| Bản | Cửa sổ | Lệnh (thô) | Bỏ vì hết chỗ | Thắng % | Kỳ vọng %/lệnh | Kỳ vọng R | CI95 khối ngày | PF | Tổng % | DD % | Lỗ nhất 1 lệnh % | Mở cuối kỳ | Mở đồng thời max |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lạc quan (phí 0,1% khứ hồi) | D [19/6–19/9/2026) | 1595 (4815) | 3220 | 80.9 | 0.005 | 0.003 | [-0.019, 0.025] R | 1.02 | 8.7 | 60.5 | -2.04 | 5 | 5 |
| lạc quan (phí 0,1% khứ hồi) | 5–9/2026 [1/5–19/9/2026) | 2611 (8266) | 5655 | 80.6 | -0.016 | -0.008 | [-0.026, 0.010] R | 0.95 | -42.1 | 108.2 | -2.04 | 5 | 5 |
| bi quan 0,136% | D [19/6–19/9/2026) | 1488 (4780) | 3292 | 79.2 | -0.029 | -0.015 | [-0.039, 0.009] R | 0.91 | -43.6 | 88.2 | -2.10 | 5 | 5 |
| bi quan 0,136% | 5–9/2026 [1/5–19/9/2026) | 2474 (8197) | 5723 | 78.9 | -0.051 | -0.025 | [-0.044, -0.007] R | 0.86 | -125.8 | 164.5 | -2.11 | 5 | 5 |
| bi quan 0,4% | D [19/6–19/9/2026) | 1313 (4652) | 3339 | 74.3 | -0.137 | -0.068 | [-0.101, -0.037] R | 0.68 | -179.5 | 190.6 | -2.20 | 5 | 5 |
| bi quan 0,4% | 5–9/2026 [1/5–19/9/2026) | 2228 (7965) | 5737 | 74.8 | -0.150 | -0.075 | [-0.099, -0.053] R | 0.66 | -334.7 | 329.5 | -2.30 | 5 | 5 |

## G5 BigZ04_TSL4

Tác giả công bố: Tác giả không công bố số liệu; README repo: "Don't use for live trading".

- Số mã có dữ liệu 15m: 355/430.
- Port đủ 13 nhóm điều kiện mua OR (cond 13 bị tắt trong mã gốc), custom_stoploss (cứng −8% lãi ròng, nội suy 1,1%→4% khi lãi 1,6%→8%, trên 8% trượt theo lãi), không sell signal, ROI tắt. Bản lạc quan không giới hạn thời gian giữ.

| Bản | Cửa sổ | Lệnh (thô) | Bỏ vì hết chỗ | Thắng % | Kỳ vọng %/lệnh | Kỳ vọng R | CI95 khối ngày | PF | Tổng % | DD % | Lỗ nhất 1 lệnh % | Mở cuối kỳ | Mở đồng thời max |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lạc quan (phí 0,1% khứ hồi) | D [19/6–19/9/2026) | 1552 (2166) | 614 | 83.8 | 0.152 | 0.076 | [0.049, 0.102] R | 1.47 | 235.6 | 10.4 | -2.00 | 2 | 5 |
| lạc quan (phí 0,1% khứ hồi) | 5–9/2026 [1/5–19/9/2026) | 2406 (3517) | 1111 | 83.7 | 0.166 | 0.083 | [0.059, 0.109] R | 1.51 | 399.8 | 11.0 | -2.00 | 2 | 5 |
| bi quan 0,136% | D [19/6–19/9/2026) | 1063 (1787) | 724 | 70.6 | -0.052 | -0.026 | [-0.072, 0.026] R | 0.91 | -55.2 | 72.8 | -2.03 | 3 | 5 |
| bi quan 0,136% | 5–9/2026 [1/5–19/9/2026) | 1612 (2927) | 1315 | 69.5 | -0.064 | -0.032 | [-0.073, 0.010] R | 0.89 | -103.3 | 113.2 | -2.06 | 3 | 5 |
| bi quan 0,4% | D [19/6–19/9/2026) | 1101 (1785) | 684 | 66.9 | -0.169 | -0.085 | [-0.131, -0.033] R | 0.74 | -186.1 | 199.6 | -2.03 | 2 | 5 |
| bi quan 0,4% | 5–9/2026 [1/5–19/9/2026) | 1613 (2926) | 1313 | 66.8 | -0.162 | -0.081 | [-0.122, -0.038] R | 0.76 | -260.8 | 227.8 | -2.06 | 2 | 5 |

## H1 Bollinger %B (15m)

Tác giả công bố: Hummingbot không công bố kết quả cho tham số ví dụ.

- Số mã có dữ liệu 15m: 355/430.
- Một vị thế mỗi mã (Hummingbot mặc định cho phép 2 executor mỗi phía — không mô phỏng); tín hiệu còn thì vào lại ngay sau khi thoát. Trailing: kích hoạt khi lãi ròng ≥ 0,8% (H1) / 1% (H2), dừng tại lãi tốt nhất − 0,4%.

| Bản | Cửa sổ | Lệnh (thô) | Bỏ vì hết chỗ | Thắng % | Kỳ vọng %/lệnh | Kỳ vọng R | CI95 khối ngày | PF | Tổng % | DD % | Lỗ nhất 1 lệnh % | Mở cuối kỳ | Mở đồng thời max |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lạc quan (phí 0,1% khứ hồi) | D [19/6–19/9/2026) | 11432 (279147) | 267715 | 55.8 | 0.197 | 0.099 | [0.055, 0.143] R | 1.21 | 2255.1 | 85.3 | -2.20 | 3 | 5 |
| lạc quan (phí 0,1% khứ hồi) | 5–9/2026 [1/5–19/9/2026) | 17254 (479496) | 462242 | 55.6 | 0.160 | 0.080 | [0.044, 0.115] R | 1.17 | 2757.0 | 63.3 | -2.20 | 3 | 5 |
| bi quan 0,136% | D [19/6–19/9/2026) | 8236 (206052) | 197816 | 38.5 | -0.310 | -0.155 | [-0.190, -0.122] R | 0.77 | -2555.4 | 2477.4 | -3.78 | 4 | 5 |
| bi quan 0,136% | 5–9/2026 [1/5–19/9/2026) | 12387 (352745) | 340358 | 39.2 | -0.298 | -0.149 | [-0.176, -0.122] R | 0.78 | -3690.4 | 3671.9 | -3.78 | 4 | 5 |
| bi quan 0,4% | D [19/6–19/9/2026) | 7565 (192655) | 185090 | 33.8 | -0.864 | -0.432 | [-0.466, -0.400] R | 0.51 | -6532.7 | 6304.8 | -3.32 | 4 | 5 |
| bi quan 0,4% | 5–9/2026 [1/5–19/9/2026) | 11379 (329899) | 318520 | 34.3 | -0.862 | -0.431 | [-0.457, -0.404] R | 0.51 | -9804.8 | 9348.0 | -3.32 | 4 | 5 |

## H1 Bollinger %B (1h)

Tác giả công bố: Hummingbot không công bố kết quả cho tham số ví dụ.

- Số mã có dữ liệu 1h: 355/430.
- Một vị thế mỗi mã (Hummingbot mặc định cho phép 2 executor mỗi phía — không mô phỏng); tín hiệu còn thì vào lại ngay sau khi thoát. Trailing: kích hoạt khi lãi ròng ≥ 0,8% (H1) / 1% (H2), dừng tại lãi tốt nhất − 0,4%.

| Bản | Cửa sổ | Lệnh (thô) | Bỏ vì hết chỗ | Thắng % | Kỳ vọng %/lệnh | Kỳ vọng R | CI95 khối ngày | PF | Tổng % | DD % | Lỗ nhất 1 lệnh % | Mở cuối kỳ | Mở đồng thời max |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lạc quan (phí 0,1% khứ hồi) | D [19/6–19/9/2026) | 6339 (127609) | 121270 | 59.3 | 0.659 | 0.330 | [0.279, 0.380] R | 1.76 | 4180.1 | 25.2 | -2.20 | 4 | 5 |
| lạc quan (phí 0,1% khứ hồi) | 5–9/2026 [1/5–19/9/2026) | 9708 (222952) | 213244 | 58.6 | 0.608 | 0.304 | [0.262, 0.348] R | 1.69 | 5902.4 | 17.1 | -2.20 | 4 | 5 |
| bi quan 0,136% | D [19/6–19/9/2026) | 4502 (96791) | 92289 | 36.0 | -0.321 | -0.160 | [-0.205, -0.111] R | 0.77 | -1443.6 | 1265.8 | -4.33 | 4 | 5 |
| bi quan 0,136% | 5–9/2026 [1/5–19/9/2026) | 6899 (168494) | 161595 | 36.2 | -0.309 | -0.155 | [-0.196, -0.115] R | 0.77 | -2135.1 | 1838.3 | -4.33 | 4 | 5 |
| bi quan 0,4% | D [19/6–19/9/2026) | 4371 (93788) | 89417 | 31.4 | -0.881 | -0.440 | [-0.484, -0.393] R | 0.51 | -3849.6 | 3853.1 | -4.86 | 4 | 5 |
| bi quan 0,4% | 5–9/2026 [1/5–19/9/2026) | 6686 (163329) | 156643 | 31.7 | -0.860 | -0.430 | [-0.470, -0.390] R | 0.52 | -5749.1 | 5752.6 | -4.86 | 4 | 5 |

## H2 MACD+BB (1h)

Tác giả công bố: Hummingbot không công bố kết quả cho tham số ví dụ.

- Số mã có dữ liệu 1h: 355/430.
- Một vị thế mỗi mã (Hummingbot mặc định cho phép 2 executor mỗi phía — không mô phỏng); tín hiệu còn thì vào lại ngay sau khi thoát. Trailing: kích hoạt khi lãi ròng ≥ 0,8% (H1) / 1% (H2), dừng tại lãi tốt nhất − 0,4%.

| Bản | Cửa sổ | Lệnh (thô) | Bỏ vì hết chỗ | Thắng % | Kỳ vọng %/lệnh | Kỳ vọng R | CI95 khối ngày | PF | Tổng % | DD % | Lỗ nhất 1 lệnh % | Mở cuối kỳ | Mở đồng thời max |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lạc quan (phí 0,1% khứ hồi) | D [19/6–19/9/2026) | 5703 (42793) | 37090 | 56.9 | 1.167 | 0.584 | [0.515, 0.659] R | 2.23 | 6655.6 | 18.9 | -2.20 | 1 | 5 |
| lạc quan (phí 0,1% khứ hồi) | 5–9/2026 [1/5–19/9/2026) | 8863 (75813) | 66950 | 54.9 | 1.015 | 0.507 | [0.445, 0.571] R | 2.02 | 8992.7 | 13.0 | -2.20 | 1 | 5 |
| bi quan 0,136% | D [19/6–19/9/2026) | 3730 (32301) | 28571 | 31.9 | -0.272 | -0.136 | [-0.189, -0.078] R | 0.82 | -1013.4 | 912.6 | -4.27 | 2 | 5 |
| bi quan 0,136% | 5–9/2026 [1/5–19/9/2026) | 5869 (57168) | 51299 | 30.7 | -0.346 | -0.173 | [-0.218, -0.124] R | 0.78 | -2032.4 | 2035.3 | -4.27 | 2 | 5 |
| bi quan 0,4% | D [19/6–19/9/2026) | 3522 (31035) | 27513 | 29.1 | -0.785 | -0.392 | [-0.451, -0.330] R | 0.60 | -2764.3 | 2764.3 | -4.80 | 2 | 5 |
| bi quan 0,4% | 5–9/2026 [1/5–19/9/2026) | 5545 (54913) | 49368 | 28.0 | -0.866 | -0.433 | [-0.484, -0.379] R | 0.56 | -4803.0 | 4803.0 | -4.80 | 2 | 5 |

## J1 SMA 50/200 (1D)

Tác giả công bố: Jesse: ví dụ "hello world", không có số liệu.

- 2020–2025: 436 mã có ≥ 210 nến ngày liên tục (gồm mã đã hủy niêm yết); bỏ 52 mã có khoảng trống nến ngày (tệp lịch sử thiếu kỳ C và không có bản đệm); khởi động SMA200 = 200 nến trước cửa sổ.
- 5–9/2026 [1/5–19/9/2026): 486 mã có ≥ 210 nến ngày liên tục (gồm mã đã hủy niêm yết); bỏ 131 mã có khoảng trống nến ngày (tệp lịch sử thiếu kỳ C và không có bản đệm); khởi động SMA200 = 200 nến trước cửa sổ.
- Lệnh "flip" = đóng Long mở Short (hoặc ngược lại) cùng giá mở; bản bi quan đóng sau 30 ngày rồi vào lại ngay nếu SMA vẫn cùng phía.

| Bản | Cửa sổ | Lệnh (thô) | Bỏ vì hết chỗ | Thắng % | Kỳ vọng %/lệnh | Kỳ vọng R | CI95 khối ngày | PF | Tổng % | DD % | Lỗ nhất 1 lệnh % | Mở cuối kỳ | Mở đồng thời max |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lạc quan (phí 0,1% khứ hồi) | 2020–2025 | 1607 (1607) | 0 | 45.1 | 13.482 | — | [7.931, 19.937] % | 1.82 | 1.3 | 68.3 | -98.77 | 367 | 351 — trung vị mã -12.5%, 436 mã |
| bi quan 0,136% | 2020–2025 | 8121 (8121) | 0 | 48.3 | 2.526 | — | [1.531, 3.484] % | 1.29 | -14.3 | 69.9 | -99.59 | 340 | 325 — trung vị mã -39.2%, 436 mã |
| bi quan 0,4% | 2020–2025 | 8121 (8121) | 0 | 47.9 | 2.266 | — | [1.271, 3.225] % | 1.25 | -17.2 | 70.7 | -99.98 | 340 | 325 — trung vị mã -42.3%, 436 mã |
| lạc quan (phí 0,1% khứ hồi) | 5–9/2026 [1/5–19/9/2026) | 737 (737) | 0 | 58.1 | 10.332 | — | [0.876, 13.185] % | 2.11 | -4.9 | 11.8 | -95.23 | 434 | 440 — trung vị mã 5.3%, 486 mã |
| bi quan 0,136% | 5–9/2026 [1/5–19/9/2026) | 2381 (2381) | 0 | 53.6 | 3.323 | — | [-4.340, 10.069] % | 1.40 | -14.7 | 18.7 | -97.29 | 429 | 441 — trung vị mã -9.7%, 486 mã |
| bi quan 0,4% | 5–9/2026 [1/5–19/9/2026) | 2381 (2381) | 0 | 53.0 | 3.062 | — | [-4.611, 9.817] % | 1.37 | -15.6 | 18.9 | -97.68 | 429 | 441 — trung vị mã -10.6%, 486 mã |

## E1 EMA walk-forward (BTC)

Tác giả công bố: Bài gốc (BTC 60 phút, OOS 11/2019–8/2021, phí 0,1%/giao dịch): WF 14/10 lợi suất năm 90,9%, Sharpe 1,11, MDD 52,4%, IR 2,63 — so với mua-giữ 92,7% / 1,13 / 62,3% / 2,05; WF 7/28: 68,3% / 0,83 / 58,5%. Hòa vốn ~0,4%/lệnh.

- Bài gốc chạy nến 1–60 phút; dữ liệu 1h BTC chỉ có từ 12/2025 nên 2020–2025 chạy 1D (cửa sổ 7/28 và 14/10 NGÀY = 7/28 và 14/10 nến — rất ít mẫu), 5–9/2026 chạy cả 1D và 1h. Cửa sổ huấn luyện đầu tiên bắt đầu trong kỳ kiểm (không dùng kỳ C).

| Bản | Cửa sổ | Lệnh (thô) | Bỏ vì hết chỗ | Thắng % | Kỳ vọng %/lệnh | Kỳ vọng R | CI95 khối ngày | PF | Tổng % | DD % | Lỗ nhất 1 lệnh % | Mở cuối kỳ | Mở đồng thời max |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lạc quan (phí 0,1% khứ hồi), WF 7/28 | 1D 2020–2025 | 64 (64) | 0 | 31.3 | 7.860 | — | [-0.756, 22.348] % | 2.85 | 722.6 | 51.0 | -18.50 | 1 | 1 — 57 bước, mua-giữ 672.3% |
| bi quan 0,136%, WF 7/28 | 1D 2020–2025 | 102 (102) | 0 | 37.3 | 2.797 | — | [0.022, 5.838] % | 1.71 | 522.7 | 56.9 | -19.48 | 1 | 1 — 57 bước, mua-giữ 672.3% |
| bi quan 0,4%, WF 7/28 | 1D 2020–2025 | 102 (102) | 0 | 36.3 | 2.528 | — | [-0.244, 5.565] % | 1.62 | 376.6 | 58.2 | -19.71 | 1 | 1 — 57 bước, mua-giữ 672.3% |
| lạc quan (phí 0,1% khứ hồi), WF 14/10 | 1D 2020–2025 | 52 (52) | 0 | 32.7 | 8.384 | — | [-2.882, 25.523] % | 2.44 | 266.9 | 71.3 | -28.70 | 1 | 1 — 83 bước, mua-giữ 672.3% |
| bi quan 0,136%, WF 14/10 | 1D 2020–2025 | 84 (84) | 0 | 39.3 | 1.338 | — | [-1.772, 4.865] % | 1.27 | 28.7 | 74.0 | -28.48 | 1 | 1 — 83 bước, mua-giữ 672.3% |
| bi quan 0,4%, WF 14/10 | 1D 2020–2025 | 84 (84) | 0 | 38.1 | 1.071 | — | [-2.035, 4.594] % | 1.21 | 3.0 | 76.5 | -28.78 | 1 | 1 — 83 bước, mua-giữ 672.3% |
| lạc quan (phí 0,1% khứ hồi), WF 7/28 | 1D 5–9/2026 [1/5–19/9/2026) | 7 (7) | 0 | 28.6 | 1.145 | — | [-5.127, 7.924] % | 1.36 | 5.4 | 20.6 | -9.13 | 1 | 1 — 4 bước, mua-giữ -0.2% |
| bi quan 0,136%, WF 7/28 | 1D 5–9/2026 [1/5–19/9/2026) | 8 (8) | 0 | 25.0 | 0.603 | — | [-5.124, 7.014] % | 1.18 | 2.3 | 24.4 | -9.07 | 1 | 1 — 4 bước, mua-giữ -0.2% |
| bi quan 0,4%, WF 7/28 | 1D 5–9/2026 [1/5–19/9/2026) | 8 (8) | 0 | 25.0 | 0.338 | — | [-5.388, 6.750] % | 1.09 | 0.4 | 25.2 | -9.35 | 1 | 1 — 4 bước, mua-giữ -0.2% |
| lạc quan (phí 0,1% khứ hồi), WF 14/10 | 1D 5–9/2026 [1/5–19/9/2026) | 3 (3) | 0 | 66.7 | 2.324 | — | [-6.927, 8.189] % | 2.01 | 6.4 | 15.6 | -6.93 | 1 | 1 — 6 bước, mua-giữ -0.2% |
| bi quan 0,136%, WF 14/10 | 1D 5–9/2026 [1/5–19/9/2026) | 5 (5) | 0 | 40.0 | -0.230 | — | [-10.116, 9.642] % | 0.96 | -3.9 | 21.9 | -15.99 | 1 | 1 — 6 bước, mua-giữ -0.2% |
| bi quan 0,4%, WF 14/10 | 1D 5–9/2026 [1/5–19/9/2026) | 5 (5) | 0 | 40.0 | -0.497 | — | [-10.387, 9.380] % | 0.91 | -4.9 | 22.3 | -16.27 | 1 | 1 — 6 bước, mua-giữ -0.2% |
| lạc quan (phí 0,1% khứ hồi), WF 7/28 | 1h 5–9/2026 [1/5–19/9/2026) | 51 (51) | 0 | 25.5 | 0.332 | — | [-0.662, 1.817] % | 1.40 | 13.7 | 19.9 | -3.30 | 1 | 1 — 4 bước, mua-giữ -0.2% |
| bi quan 0,136%, WF 7/28 | 1h 5–9/2026 [1/5–19/9/2026) | 51 (51) | 0 | 25.5 | 0.261 | — | [-0.735, 1.754] % | 1.29 | 9.8 | 21.0 | -3.37 | 1 | 1 — 4 bước, mua-giữ -0.2% |
| bi quan 0,4%, WF 7/28 | 1h 5–9/2026 [1/5–19/9/2026) | 51 (51) | 0 | 23.5 | -0.003 | — | [-0.999, 1.490] % | 1.00 | -3.8 | 26.3 | -3.64 | 1 | 1 — 4 bước, mua-giữ -0.2% |
| lạc quan (phí 0,1% khứ hồi), WF 14/10 | 1h 5–9/2026 [1/5–19/9/2026) | 39 (39) | 0 | 28.2 | -0.049 | — | [-1.578, 1.465] % | 0.96 | -6.3 | 28.5 | -18.44 | 1 | 1 — 6 bước, mua-giữ -0.2% |
| bi quan 0,136%, WF 14/10 | 1h 5–9/2026 [1/5–19/9/2026) | 39 (39) | 0 | 23.1 | -0.139 | — | [-1.667, 1.349] % | 0.89 | -9.4 | 30.6 | -18.72 | 1 | 1 — 6 bước, mua-giữ -0.2% |
| bi quan 0,4%, WF 14/10 | 1h 5–9/2026 [1/5–19/9/2026) | 39 (39) | 0 | 23.1 | -0.403 | — | [-1.929, 1.082] % | 0.72 | -18.1 | 36.4 | -18.96 | 1 | 1 — 6 bước, mua-giữ -0.2% |

## P1 Grid hình học 6 lưới tĩnh (Chen et al.)

Tác giả công bố: Chen et al. chỉ có hình, không có bảng số; kết luận lý thuyết "kỳ vọng grid = 0 khi không phí, ÂM khi có phí"; DGT giảm drawdown; "IRR 60–70%" là backtest một giai đoạn. Tham số: n = 6 (7 mức), tỉ lệ dải 8 (BTC 10 000–80 000) → k = 1,414 mỗi mức, lưới đặt quanh giá mở đầu cửa sổ (mức 3 = giá vào; 3 khoảng trên giữ coin, 3 khoảng dưới giữ tiền). Phí bài gốc 0,08%/lệnh; ở đây dùng phí của từng bản. Không có giới hạn 30 ngày (grid không có "lệnh" để đóng); funding tính trên coin đang giữ. Mỗi lần bán ở mức trên = 1 lệnh thắng cơ học; kho coin chưa bán (bag) ghi thành 1 "lệnh" cuối kỳ để CI và PF không bị đánh lừa.

Mã (BTC, ETH + 20 thanh khoản nhất ngày đầu cửa sổ): D → BTCUSDT, ETHUSDT, SOLUSDT, ZECUSDT, HYPEUSDT, XAUUSDT, XAGUSDT, CLUSDT, XRPUSDT, WLDUSDT, MUUSDT, BNBUSDT, NEARUSDT, LABUSDT, DOGEUSDT, SNDKUSDT, XLMUSDT, SOXLUSDT, BEATUSDT, SUIUSDT, BSBUSDT, BZUSDT (có nến 15m: 15/22); 5–9/2026 → BTCUSDT, ETHUSDT, SOLUSDT, RAVEUSDT, XRPUSDT, DOGEUSDT, ZECUSDT, HYPEUSDT, 1000PEPEUSDT, SIRENUSDT, STOUSDT, BNBUSDT, TAOUSDT, 币安人生USDT, ADAUSDT, ORDIUSDT, ARIAUSDT, ENJUSDT, SUIUSDT, AVAXUSDT, RIVERUSDT, BSBUSDT (có nến 15m: 22/22). Mã không có 15m là hợp đồng vàng/bạc/dầu/cổ phiếu token hóa hoặc mã ngoài vũ trụ đã tải. LABUSDT về ≈ 0 trong kỳ D (sập/hủy niêm yết), BEAT và BSB mất 80–95% — đúng loại rủi ro "ôm bag" của grid/DCA.

| Bản | Cửa sổ | Đòn bẩy | Lệnh | Thắng % | Kỳ vọng %/lệnh | CI95 | PF | Tổng TB % | Tổng trung vị % | Lãi đã chốt TB % | Chưa chốt (bag) TB % | Funding TB % | DD TB % | DD lớn nhất % | Tệ nhất 1 mã % | Cháy % mã |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lạc quan (phí 0,1% khứ hồi) | D [19/6–19/9/2026) | 1× | 40 | 87.5 | 2.138 | [-3.522, 12.108] | 1.31 | 5.7 | 14.2 | 15.9 | -10.2 | 0.00 | 23.3 | 77.9 | -72.1 | 0 |
| bi quan 0,136% | D [19/6–19/9/2026) | 1× | 40 | 87.5 | 2.125 | [-3.536, 12.096] | 1.31 | 5.7 | 13.3 | 15.9 | -10.2 | -0.03 | 23.1 | 72.9 | -64.2 | 0 |
| bi quan 0,4% | D [19/6–19/9/2026) | 1× | 40 | 87.5 | 2.063 | [-3.601, 12.036] | 1.30 | 5.5 | 13.3 | 15.8 | -10.3 | -0.03 | 23.2 | 73.1 | -64.5 | 0 |
| lạc quan (phí 0,1% khứ hồi) | D [19/6–19/9/2026) | 3× | 34 | 85.3 | 11.450 | [-1.713, 40.726] | 1.65 | 21.8 | 42.5 | 40.9 | -14.9 | 0.00 | 48.0 | 100.0 | -100.0 | 20 |
| bi quan 0,136% | D [19/6–19/9/2026) | 3× | 35 | 85.7 | 11.086 | [-1.673, 40.686] | 1.65 | 20.5 | 40.0 | 40.8 | -14.9 | 0.24 | 48.3 | 100.0 | -100.0 | 20 |
| bi quan 0,4% | D [19/6–19/9/2026) | 3× | 35 | 85.7 | 10.926 | [-1.825, 40.500] | 1.64 | 20.1 | 39.8 | 40.6 | -15.1 | 0.24 | 48.3 | 100.0 | -100.0 | 20 |
| lạc quan (phí 0,1% khứ hồi) | 5–9/2026 [1/5–19/9/2026) | 1× | 65 | 80.0 | 0.877 | [-6.544, 10.242] | 1.14 | 2.6 | 3.0 | 17.8 | -15.2 | 0.00 | 32.0 | 77.4 | -69.3 | 0 |
| bi quan 0,136% | 5–9/2026 [1/5–19/9/2026) | 1× | 65 | 80.0 | 0.864 | [-6.558, 10.232] | 1.14 | 1.7 | 2.1 | 17.8 | -15.2 | 0.81 | 32.2 | 79.5 | -71.9 | 0 |
| bi quan 0,4% | 5–9/2026 [1/5–19/9/2026) | 1× | 65 | 80.0 | 0.800 | [-6.629, 10.174] | 1.13 | 1.6 | 2.0 | 17.7 | -15.3 | 0.81 | 32.2 | 79.6 | -72.0 | 0 |
| lạc quan (phí 0,1% khứ hồi) | 5–9/2026 [1/5–19/9/2026) | 3× | 60 | 78.3 | 6.925 | [-11.006, 32.569] | 1.47 | 11.9 | 8.9 | 48.7 | -29.9 | 0.00 | 67.6 | 100.0 | -100.0 | 23 |
| bi quan 0,136% | 5–9/2026 [1/5–19/9/2026) | 3× | 60 | 80.0 | 6.891 | [-11.043, 32.537] | 1.47 | 10.3 | 6.3 | 48.7 | -29.9 | 1.55 | 67.9 | 100.0 | -100.0 | 23 |
| bi quan 0,4% | 5–9/2026 [1/5–19/9/2026) | 3× | 60 | 80.0 | 6.727 | [-11.203, 32.361] | 1.46 | 9.9 | 6.0 | 48.4 | -30.1 | 1.54 | 68.0 | 100.0 | -100.0 | 23 |

## P1 Grid hình học 6 lưới + DGT reset

Tác giả công bố: Chen et al. chỉ có hình, không có bảng số; kết luận lý thuyết "kỳ vọng grid = 0 khi không phí, ÂM khi có phí"; DGT giảm drawdown; "IRR 60–70%" là backtest một giai đoạn. Tham số: n = 6 (7 mức), tỉ lệ dải 8 (BTC 10 000–80 000) → k = 1,414 mỗi mức, lưới đặt quanh giá mở đầu cửa sổ (mức 3 = giá vào; 3 khoảng trên giữ coin, 3 khoảng dưới giữ tiền). Phí bài gốc 0,08%/lệnh; ở đây dùng phí của từng bản. Không có giới hạn 30 ngày (grid không có "lệnh" để đóng); funding tính trên coin đang giữ. Mỗi lần bán ở mức trên = 1 lệnh thắng cơ học; kho coin chưa bán (bag) ghi thành 1 "lệnh" cuối kỳ để CI và PF không bị đánh lừa.

Mã (BTC, ETH + 20 thanh khoản nhất ngày đầu cửa sổ): D → BTCUSDT, ETHUSDT, SOLUSDT, ZECUSDT, HYPEUSDT, XAUUSDT, XAGUSDT, CLUSDT, XRPUSDT, WLDUSDT, MUUSDT, BNBUSDT, NEARUSDT, LABUSDT, DOGEUSDT, SNDKUSDT, XLMUSDT, SOXLUSDT, BEATUSDT, SUIUSDT, BSBUSDT, BZUSDT (có nến 15m: 15/22); 5–9/2026 → BTCUSDT, ETHUSDT, SOLUSDT, RAVEUSDT, XRPUSDT, DOGEUSDT, ZECUSDT, HYPEUSDT, 1000PEPEUSDT, SIRENUSDT, STOUSDT, BNBUSDT, TAOUSDT, 币安人生USDT, ADAUSDT, ORDIUSDT, ARIAUSDT, ENJUSDT, SUIUSDT, AVAXUSDT, RIVERUSDT, BSBUSDT (có nến 15m: 22/22). Mã không có 15m là hợp đồng vàng/bạc/dầu/cổ phiếu token hóa hoặc mã ngoài vũ trụ đã tải. LABUSDT về ≈ 0 trong kỳ D (sập/hủy niêm yết), BEAT và BSB mất 80–95% — đúng loại rủi ro "ôm bag" của grid/DCA.

| Bản | Cửa sổ | Đòn bẩy | Lệnh | Thắng % | Kỳ vọng %/lệnh | CI95 | PF | Tổng TB % | Tổng trung vị % | Lãi đã chốt TB % | Chưa chốt (bag) TB % | Funding TB % | DD TB % | DD lớn nhất % | Tệ nhất 1 mã % | Cháy % mã |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lạc quan (phí 0,1% khứ hồi) | D [19/6–19/9/2026) | 1× | 45 | 88.9 | 2.007 | [-5.430, 13.203] | 1.25 | 0.6 | 14.2 | 21.1 | -15.1 | 0.00 | 26.9 | 100.0 | -100.0 | 7 |
| bi quan 0,136% | D [19/6–19/9/2026) | 1× | 45 | 88.9 | 1.993 | [-5.446, 13.192] | 1.25 | 0.0 | 13.3 | 21.1 | -15.1 | 0.01 | 27.1 | 100.0 | -100.0 | 7 |
| bi quan 0,4% | D [19/6–19/9/2026) | 1× | 45 | 88.9 | 1.927 | [-5.517, 13.131] | 1.24 | -0.2 | 13.3 | 20.9 | -15.2 | 0.01 | 27.2 | 100.0 | -100.0 | 7 |
| lạc quan (phí 0,1% khứ hồi) | D [19/6–19/9/2026) | 3× | 35 | 85.7 | 17.915 | [7.986, 42.334] | 2.50 | 16.7 | 42.5 | 42.8 | -1.0 | 0.00 | 49.9 | 100.0 | -100.0 | 27 |
| bi quan 0,136% | D [19/6–19/9/2026) | 3× | 35 | 85.7 | 17.878 | [7.950, 42.295] | 2.50 | 15.5 | 40.0 | 42.8 | -1.1 | 0.21 | 50.1 | 100.0 | -100.0 | 27 |
| bi quan 0,4% | D [19/6–19/9/2026) | 3× | 35 | 85.7 | 17.722 | [7.807, 42.107] | 2.48 | 15.2 | 39.8 | 42.5 | -1.2 | 0.21 | 50.2 | 100.0 | -100.0 | 27 |
| lạc quan (phí 0,1% khứ hồi) | 5–9/2026 [1/5–19/9/2026) | 1× | 72 | 83.3 | 0.200 | [-9.245, 10.525] | 1.03 | 0.7 | 2.5 | 21.3 | -20.7 | 0.00 | 33.5 | 93.4 | -76.3 | 0 |
| bi quan 0,136% | 5–9/2026 [1/5–19/9/2026) | 1× | 72 | 83.3 | 0.187 | [-9.262, 10.515] | 1.02 | -0.5 | 2.1 | 21.3 | -20.7 | 1.12 | 33.8 | 95.1 | -83.0 | 0 |
| bi quan 0,4% | 5–9/2026 [1/5–19/9/2026) | 1× | 72 | 83.3 | 0.119 | [-9.343, 10.457] | 1.02 | -0.7 | 2.0 | 21.2 | -20.8 | 1.12 | 33.9 | 95.5 | -83.7 | 0 |
| lạc quan (phí 0,1% khứ hồi) | 5–9/2026 [1/5–19/9/2026) | 3× | 63 | 81.0 | 5.413 | [-15.473, 32.264] | 1.31 | 7.6 | 7.5 | 52.9 | -37.4 | 0.00 | 68.1 | 100.0 | -100.0 | 23 |
| bi quan 0,136% | 5–9/2026 [1/5–19/9/2026) | 3× | 63 | 81.0 | 5.377 | [-15.511, 32.232] | 1.31 | 5.9 | 6.2 | 52.8 | -37.4 | 1.62 | 68.3 | 100.0 | -100.0 | 23 |
| bi quan 0,4% | 5–9/2026 [1/5–19/9/2026) | 3× | 63 | 81.0 | 5.204 | [-15.686, 32.057] | 1.30 | 5.5 | 5.9 | 52.5 | -37.6 | 1.61 | 68.4 | 100.0 | -100.0 | 23 |

## P2 Martingale DCA 1-1-2-4 (Pionex Standard Mode)

Tác giả công bố: Pionex (vendor): "xác suất lãi 50% → 75% → 87,5%…" theo số vòng, tự thừa nhận "even a 99.99% win rate" vẫn có thể mất sạch; Webot (bản white-label) backtest 15 tháng bull MDD −52,84%. Tham số: 8 phần vốn, mua 1-1-2-4 tại giá vào, −1%, −2%, −3% so với giá vào (ví dụ 1% trong bài Pionex); **TP 1% trên giá trung bình là giả định** (Pionex không công bố mặc định); không SL. Bản bi quan đóng vòng sau 30 ngày (ghi lỗ) rồi mở vòng mới.

Mã (BTC, ETH + 20 thanh khoản nhất ngày đầu cửa sổ): D → BTCUSDT, ETHUSDT, SOLUSDT, ZECUSDT, HYPEUSDT, XAUUSDT, XAGUSDT, CLUSDT, XRPUSDT, WLDUSDT, MUUSDT, BNBUSDT, NEARUSDT, LABUSDT, DOGEUSDT, SNDKUSDT, XLMUSDT, SOXLUSDT, BEATUSDT, SUIUSDT, BSBUSDT, BZUSDT (có nến 15m: 15/22); 5–9/2026 → BTCUSDT, ETHUSDT, SOLUSDT, RAVEUSDT, XRPUSDT, DOGEUSDT, ZECUSDT, HYPEUSDT, 1000PEPEUSDT, SIRENUSDT, STOUSDT, BNBUSDT, TAOUSDT, 币安人生USDT, ADAUSDT, ORDIUSDT, ARIAUSDT, ENJUSDT, SUIUSDT, AVAXUSDT, RIVERUSDT, BSBUSDT (có nến 15m: 22/22). Mã không có 15m là hợp đồng vàng/bạc/dầu/cổ phiếu token hóa hoặc mã ngoài vũ trụ đã tải. LABUSDT về ≈ 0 trong kỳ D (sập/hủy niêm yết), BEAT và BSB mất 80–95% — đúng loại rủi ro "ôm bag" của grid/DCA.

| Bản | Cửa sổ | Đòn bẩy | Lệnh | Thắng % | Kỳ vọng %/lệnh | CI95 | PF | Tổng TB % | Tổng trung vị % | Lãi đã chốt TB % | Chưa chốt (bag) TB % | Funding TB % | DD TB % | DD lớn nhất % | Tệ nhất 1 mã % | Cháy % mã |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lạc quan (phí 0,1% khứ hồi) | D [19/6–19/9/2026) | 1× | 1409 | 99.0 | 0.060 | [-0.189, 0.251] | 1.24 | 5.6 | 19.0 | 29.5 | -23.8 | 0.00 | 30.9 | 89.9 | -88.8 | 0 |
| bi quan 0,136% | D [19/6–19/9/2026) | 1× | 1752 | 98.5 | -0.059 | [-0.287, 0.135] | 0.83 | -2.0 | 5.8 | 6.1 | -12.9 | 0.04 | 34.2 | 100.0 | -100.0 | 7 |
| bi quan 0,4% | D [19/6–19/9/2026) | 1× | 1752 | 98.4 | -0.153 | [-0.383, 0.042] | 0.57 | -12.6 | 0.0 | -4.8 | -13.1 | 0.04 | 36.8 | 100.0 | -100.0 | 7 |
| lạc quan (phí 0,1% khứ hồi) | D [19/6–19/9/2026) | 3× | 1380 | 99.0 | 0.360 | [-0.318, 0.967] | 1.62 | 28.6 | 56.9 | 86.5 | -53.4 | 0.00 | 62.3 | 100.0 | -100.0 | 27 |
| bi quan 0,136% | D [19/6–19/9/2026) | 3× | 1524 | 98.5 | 0.095 | [-0.568, 0.671] | 1.12 | 6.7 | 17.4 | 50.4 | -40.7 | 1.75 | 65.6 | 100.0 | -100.0 | 27 |
| bi quan 0,4% | D [19/6–19/9/2026) | 3× | 1524 | 98.4 | -0.178 | [-0.930, 0.457] | 0.77 | -16.1 | 0.1 | 22.6 | -40.6 | 1.71 | 68.7 | 100.0 | -100.0 | 33 |
| lạc quan (phí 0,1% khứ hồi) | 5–9/2026 [1/5–19/9/2026) | 1× | 1900 | 98.9 | -0.063 | [-0.290, 0.136] | 0.83 | -5.4 | -9.3 | 26.5 | -32.0 | 0.00 | 43.7 | 65.2 | -51.3 | 0 |
| bi quan 0,136% | 5–9/2026 [1/5–19/9/2026) | 1× | 3781 | 98.3 | -0.152 | [-0.341, 0.013] | 0.66 | -20.0 | -25.0 | -10.2 | -15.9 | 1.39 | 54.6 | 100.0 | -100.0 | 9 |
| bi quan 0,4% | 5–9/2026 [1/5–19/9/2026) | 1× | 3650 | 98.3 | -0.257 | [-0.494, -0.067] | 0.44 | -34.5 | -34.2 | -22.2 | -20.5 | 1.32 | 58.4 | 100.0 | -100.0 | 14 |
| lạc quan (phí 0,1% khứ hồi) | 5–9/2026 [1/5–19/9/2026) | 3× | 1775 | 98.8 | -0.105 | [-1.509, 0.874] | 0.90 | -26.7 | -100.0 | 73.5 | -81.9 | 0.00 | 88.5 | 100.0 | -100.0 | 55 |
| bi quan 0,136% | 5–9/2026 [1/5–19/9/2026) | 3× | 2138 | 98.1 | -0.699 | [-2.250, 0.407] | 0.55 | -58.9 | -100.0 | 7.6 | -75.6 | 1.35 | 91.7 | 100.0 | -100.0 | 73 |
| bi quan 0,4% | 5–9/2026 [1/5–19/9/2026) | 3× | 1831 | 98.1 | -0.925 | [-2.870, 0.330] | 0.39 | -76.9 | -100.0 | 7.1 | -84.0 | 0.82 | 93.7 | 100.0 | -100.0 | 82 |

## Lưu ý và hạn chế

- Khung 15m thay cho 1m/5m gốc: chiến lược scalping (G1–G3) được thiết kế cho nến 1–5 phút; trên 15m số tín hiệu ít hơn nhiều và hành vi khác — đây là hạn chế dữ liệu, không phải lỗi port. Kết luận chỉ áp cho 15m.
- Vũ trụ là hợp đồng vĩnh cửu USDⓈ-M 2026 (Long-only vẫn giữ Long-only); các tham số hyperopt (0,978/1,006/5,638/−19,993/7-17-25…) được fit cho spot 2021 — đây là out-of-sample thật, kỳ vọng xấu đi là bình thường.
- Giới hạn 5 lệnh mở cùng lúc là giả định báo cáo; lệnh bị bỏ vì hết chỗ không làm mã đó vào lại ở tín hiệu kế tiếp (xấp xỉ). Kỳ vọng/CI của lệnh thô (không giới hạn) có thể xem thêm ở cột "Lệnh (thô)" và JSON kết quả.
- Funding trước 3/2025 chỉ có BTC/ETH; mã khác dùng mặc định 0,01%/kỳ cho long (bi quan) — ảnh hưởng J1 2020–2025.
- J1/E1: tài khoản mỗi mã cháy (= 0, dừng) khi vốn MTM ≤ 0 — xảy ra với lệnh Short trên mã tăng > 2× (không đòn bẩy nhưng Short có thể lỗ quá 100%); "tổng %" trung bình các mã gồm cả mã đã cháy.
- E1: bài gốc dùng nến phút với cửa sổ 7–28 NGÀY; trên 1D thì cửa sổ huấn luyện chỉ 7–14 nến nên chọn tham số gần như ngẫu nhiên — bản 1h 5–9/2026 gần bài gốc hơn nhưng chỉ có 4,5 tháng.
- P2: TP 1% và bước 1% là giả định ghi trước khi chạy; thay đổi hai số này sẽ đổi kết quả nhưng không đổi bản chất (lãi nhỏ đều, lỗ dồn vào vòng chưa đóng).
- DD của G/H tính trên vốn thực hiện (lệnh đã đóng) — chưa gồm lỗ tạm thời của lệnh đang mở; P1/P2/J1/E1 tính theo giá thị trường từng nến/ngày.
- Số liệu tác giả (nếu có) đến từ sàn/giai đoạn/phí khác; đặt cạnh để so, không phải cùng điều kiện.
