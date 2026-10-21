# Kế hoạch: tăng số lệnh (21/10/2026)

Người dùng: "ít lệnh quá, hãy tăng lên mỗi ngày vài lệnh … tôi không thể trực tuyến 24/24, bỏ lỡ nhiều cơ hội".
Hệ đang chạy (btc-regime, S-sma BTC): ~10 lệnh/năm; lãi 2020–2025 dồn vào 5 lệnh; CI95 TB %/lệnh [0,00; +5,27].
Bằng chứng cũ: mọi cách nhiều lệnh/ngày trên altcoin (Lướt nhanh, tf-15m/1h/4h, 11 bot GitHub khung nhỏ) đều lỗ sau phí.

## ĐĂNG KÝ TRƯỚC (viết trước khi chạy — không chỉnh tham số theo kết quả)

Luật gốc giữ nguyên (S-sma đã khóa): Long khi giá đóng > SMA50 của chính khung đó; đứng ngoài khi ≤; SL = giá vào − 2,5 × ATR(20);
định cỡ 2% vốn gồm phí 0,0575%/chiều + trượt 0,02%; chốt chặn funding; vào/ra ở giá mở nến kế tiếp; không Short.

| # | Tên | Thay đổi duy nhất so với S-sma |
|---|---|---|
| N1 | Rổ coin lớn, nến ngày | Áp S-sma cho mỗi mã trong top 20 thanh khoản theo thời điểm (TB quoteVolume 30 ngày, niêm yết ≥ 60 ngày, bỏ stablecoin/vàng/token cổ phiếu); tối đa 10 lệnh mở, tổng rủi ro mở ≤ 10%; risk-cluster mặc định (tương quan 30 ngày ≥ 0,7 cùng phía → bỏ); khi nhiều tín hiệu cùng lúc ưu tiên lợi suất 50 ngày cao nhất |
| N2 | BTC nến 4H | S-sma trên BTCUSDT với nến 4H (SMA50 4H, ATR20 4H, quyết định mỗi khi nến 4H đóng) |
| N3 | Rổ coin lớn, nến 4H | N1 nhưng nến 4H (như N2) |

Dữ liệu: nến 1D 885 mã `data/history/1d` (gồm mã đã hủy niêm yết) + kỳ C từ bộ đệm; nến 4H tải công khai cho BTC và các mã từng lọt top 20.
Funding thật nếu có, không có thì 0,01%/8 giờ (ghi rõ). Kỳ: 2020-01-01 → 2025-12-31 (từng năm) và 2026-01-01 → 2026-09-18; CẤM ≥ 2026-09-19.
Đối chứng: S-sma BTC hiện tại.

Báo: số lệnh/năm và /ngày, tỉ lệ thắng, TB %/lệnh + CI95 khối ngày, PF, tổng lãi, CAGR, DD, MAR, lỗ lớn nhất 1 lệnh, phí + funding đã trả,
phần lãi từ 5 lệnh lớn nhất.

**Tiêu chí "được đề xuất đưa vào bot" (đặt trước):** 2020–2025 MAR ≥ MAR của S-sma BTC (0,89) HOẶC (MAR ≥ 0,6 VÀ cận dưới CI95 TB %/lệnh > 0
— tức bằng chứng chắc hơn S-sma); VÀ 2026-01→09 tổng lãi ≥ −5%; VÀ lỗ thật mỗi lệnh ≤ 2%. Không ứng viên nào đạt → giữ S-sma, báo thẳng.
Không có kỳ mù nào còn lại: ứng viên đạt chỉ được bật sau chạy giấy.
