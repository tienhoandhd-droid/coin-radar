# Kế hoạch: mô phỏng 5 bộ luật giao dịch nổi tiếng (21/10/2026)

Người dùng: "lên github hoặc mạng xã hội, kiếm 5 bộ luật nổi tiếng, mô phỏng và áp dụng xem kết quả thế nào".
Nguồn, luật gốc, tuyên bố, độ phổ biến: `research_notes/5 bộ luật nổi tiếng/sources.md`.
Đã kiểm trước đây (không lặp lại): 11 bot GitHub (BinHV45, ClucMay72018, SMAOffsetProtectOptV1, ReinforcedQuickie, BigZ04_TSL4, Jesse SMA 50/200,
Hummingbot %B, MACD+BB, grid, martingale, EMA walk-forward) và S-sma BTC của ta.

## ĐĂNG KÝ TRƯỚC (viết và commit TRƯỚC mọi lần chạy mô phỏng — không chỉnh tham số theo kết quả)

### Luật (tham số gốc, không tinh chỉnh)

| # | Bộ luật | Vào lệnh | Thoát | Stop dùng để định cỡ 2% | Khung | Chiều |
|---|---|---|---|---|---|---|
| 1a | Turtle System 1 | Giá đóng > đỉnh 20 nến trước (Short: < đáy 20). Bỏ qua nếu breakout 20 ngày gần nhất (lệnh ảo, tính cả lần không vào) là lệnh thắng; khi đã bỏ qua thì vào ở breakout 55 ngày (failsafe) | Chạm đáy 10 nến (Short: đỉnh 10) — lệnh dừng ở mức đã biết | 2N, N = ATR 20 Wilder (lệnh dừng cứng) | 1D (gốc) | Long + Short |
| 1b | Turtle System 2 | Giá đóng > đỉnh 55 nến trước (Short đối xứng) | Chạm đáy/đỉnh 20 nến | 2N | 1D | Long + Short |
| 2 | Supertrend | Hướng Supertrend (ATR 10 Wilder, ×3, nguồn hl2) đổi → vào theo hướng mới, đồng thời đóng lệnh cũ (luôn có vị thế, như chiến lược mặc định TradingView) | Hướng đổi (theo giá đóng) | Đường Supertrend lúc vào — **không** đặt stop cứng (đúng bản gốc; lỗ thật có thể > 2%) | Không có khung gốc → 1D, 4H, 1H | Long + Short |
| 3 | Connors RSI(2) | Long: giá đóng > SMA200 và RSI(2) < 5; Short: giá đóng < SMA200 và RSI(2) > 95 (ngưỡng Connors nói tốt hơn 10/90) | Long: giá đóng > SMA5; Short: giá đóng < SMA5 | Connors KHÔNG dùng stop → **ta thêm** stop cứng 3 × ATR(14) tính từ giá khớp | 1D (gốc) | Long + Short |
| 4 | Ichimoku 9/26/52 | Tenkan cắt lên Kijun, giá đóng trên mây (Senkou A/B tính ở nến i−26), Chikou: giá đóng > giá đóng 26 nến trước. Short đối xứng | Tenkan cắt ngược Kijun (nguồn không thống nhất luật thoát — chọn cách này, ghi rõ) | Không có stop gốc → **ta thêm** 3 × ATR(14) | 1D (gốc) | Long + Short |
| 5 | MACD + EMA200 (Trading Rush) | Long: giá đóng > EMA200, MACD(12,26,9) cắt lên đường signal, cả hai < 0. Short: < EMA200, cắt xuống, cả hai > 0 | Chốt lời 1,5R hoặc stop | Đáy thấp nhất 10 nến gần nhất tính tới nến tín hiệu (Short: đỉnh cao nhất) — video không định nghĩa bằng số, ta chọn 10 | Gốc 30 phút (FX) → 1H và 4H | Long + Short |

Bỏ khỏi bản gốc (ghi rõ): Turtle nhồi tới 4 đơn vị và giảm vốn 20% sau mỗi lần sụt 10% — bỏ vì làm rủi ro mỗi lệnh vượt 2%
(1 đơn vị Turtle = 1% vốn/N, stop 2N = đúng 2% vốn — trùng mức rủi ro của ta). Connors vào ở giá đóng → ta vào giá mở nến sau.
Biến thể chốt lời 1R/2R của Trading Rush không chạy (chỉ chạy 1,5R).

### Thị trường, kỳ, dữ liệu

- BTCUSDT, ETHUSDT, và **rổ top 20 thanh khoản theo thời điểm**: mỗi ngày xếp theo TB quoteVolume 30 nến ngày đã đóng trước đó,
  niêm yết ≥ 60 ngày, bỏ stablecoin, vàng/hàng hóa, token cổ phiếu, chỉ số (underlyingType của exchangeInfo + danh sách tay).
  Chỉ được VÀO lệnh khi mã đang trong top 20 ngày đó; lệnh đang mở vẫn quản lý theo luật khi mã rời top.
  Nhiều tín hiệu cùng lúc → ưu tiên mã hạng thanh khoản cao hơn. Tối đa 10 lệnh mở, tổng rủi ro mở ≤ 10% vốn.
- Kỳ: 2020-01-01 → 2025-12-31 (cả kỳ + từng năm) và 2026-01-01 → 2026-09-18 (chạy riêng, vốn mới; chỉ báo khởi động bằng nến trước đó).
  Nến khởi động từ 2019-09-01. **CẤM mọi dữ liệu ≥ 2026-09-19**: tải chặn endTime, đọc thì lọc rồi assert.
- Nến: 1D/4H/1H tải công khai fapi.binance.com vào `data/history/famous-5/` (không đưa lên git); kỳ thiếu 1D 2026-01..04 của tệp lịch sử
  được tải bù để xếp hạng. Mã đã hủy mà sàn không còn trả nến → ghi rõ (thiên lệch sống sót).

### Khớp lệnh, chi phí, định cỡ

- Chỉ nến đã đóng; tín hiệu ở giá đóng nến i, khớp giá mở nến i+1. Stop/chốt lời ở mức giá đã biết xét trong nến; nến mở vượt mức → khớp giá mở;
  stop và chốt lời cùng nến → tính stop trước. Kiểm nhìn trước (shift test): cắt 300 nến cuối, chỉ báo + tín hiệu các nến cũ phải y hệt.
- Chi phí "thật": phí 0,068%/chiều (khứ hồi 0,136%) + trượt 0,02% mỗi lần khớp; funding mỗi kỳ 8 giờ giữ qua: thật cho BTCUSDT và ETHUSDT
  (tệp funding đã tải), mã khác 0,01%/kỳ (Long trả, Short không nhận — thận trọng).
- Bản "lạc quan" (như người tạo khoe): 0 phí, 0 trượt, 0 funding — chỉ để thấy khoảng cách so với tuyên bố.
- Định cỡ: rủi ro 2% vốn (vốn đã chốt lúc vào) tại stop của chính chiến lược, tính cả phí 2 chiều + trượt; notional ≤ 1× vốn mỗi lệnh.
  Lãi kép. Vốn đầu 10.000.

### Báo cáo

Mỗi bộ luật × thị trường × khung: lệnh/năm, tỉ lệ thắng, TB %/lệnh (% vốn lúc vào) + CI95 bootstrap khối ngày, PF, tổng %, CAGR, DD max,
MAR, lỗ lớn nhất 1 lệnh, phí + funding đã trả; từng năm; tuyên bố gốc so với kết quả; bản lạc quan. Đối chứng: S-sma BTC 2020–2025
(+147%, DD 18,3%, MAR 0,89).

### Tiêu chí ĐẠT (giống `2026-10-21-tang-so-lenh.md`, đặt trước)

2020–2025: MAR ≥ 0,89 (MAR của S-sma BTC) HOẶC (MAR ≥ 0,6 VÀ cận dưới CI95 TB %/lệnh > 0); VÀ 2026-01→09-18 tổng lãi ≥ −5%;
VÀ lỗ thật lớn nhất mỗi lệnh ≤ 2% vốn (cả hai kỳ). Áp nguyên văn cho từng ô (bộ luật × thị trường × khung); có 27 ô được thử —
một ô đạt cũng có thể do may (nhiều phép thử); ô đạt chỉ được đề xuất chạy giấy, không bật tiền thật.
