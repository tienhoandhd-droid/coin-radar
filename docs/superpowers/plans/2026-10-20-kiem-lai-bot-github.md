# Kế hoạch: tải và kiểm lại các bot mã nguồn mở "tỉ lệ thắng cao" (20/10/2026)

Người dùng yêu cầu: nghiên cứu cấu hình bot trên GitHub có tỉ lệ thắng cao, tải về, kiểm lại cho phù hợp; mục tiêu tỉ lệ lợi nhuận tốt.
Ghi chú nghiên cứu: `research_notes/Bot mã nguồn mở tỉ lệ thắng cao/` (3 tệp). Báo cáo: `reports/Bot mã nguồn mở tỉ lệ thắng cao.md`.

## ĐĂNG KÝ TRƯỚC (viết trước khi chạy — không chỉnh tham số theo kết quả)

**Tải về:** clone vào `data/external/<repo>/` (git-ignore; mã lạ: CHỈ ĐỌC, không bao giờ chạy Python của họ). Ghi commit hash từng repo.

**Ứng viên (tham số lấy NGUYÊN từ mã nguồn, không hyperopt lại):**

| # | Tên | Nguồn | Khung | Kiểm trên |
|---|---|---|---|---|
| G1 | BinHV45 | freqtrade/freqtrade-strategies | 1m gốc → chạy 15m (ghi rõ) | D + 5–9/2026, top 200 PIT |
| G2 | ClucMay72018 | freqtrade-strategies | 5m gốc → 15m | như trên |
| G3 | SMAOffsetProtectOptV1 (họ ElliotV5) | cộng đồng (URL trong ghi chú) | 5m gốc → 15m | như trên |
| G4 | ReinforcedQuickie | freqtrade-strategies | 5m + 1h → 15m + 1h | như trên |
| G5 | BigZ04_TSL4 | phuchust/freqtrade_strategy | 5m + 1h → 15m + 1h | như trên (nếu port được trong giới hạn thời gian) |
| J1 | SMA 50/200 cross | Jesse ví dụ | 1D | 2020–2025 + 5–9/2026, 885 mã (gồm đã hủy niêm yết) |
| H1 | Bollinger %B 0,3/0,7 + triple barrier SL 1% / TP 3% / 6 giờ | Hummingbot ví dụ | 15m/1h | D + 5–9/2026 |
| H2 | MACD 21/42/9 + BB, SL 1% / TP 6% / 24 giờ | Hummingbot ví dụ | 1h | D + 5–9/2026 |
| P1 | Grid hình học 6 lưới, reset DGT | Pionex/arXiv | 15m đường giá | D + 5–9/2026, BTC/ETH + 20 mã top |
| P2 | Martingale 1-1-2-4 (DCA) | Pionex | 15m | như P1 |
| E1 | EMA walk-forward (arXiv 2602.10785) | arXiv | 1D BTC | 2020–2025 + 5–9/2026 |

**Cách chạy (giống nhau cho mọi ứng viên):**
- Hai bản: "lạc quan" kiểu Freqtrade (khớp giá mở, ROI chạm theo high, phí 0,1%) và "bi quan" (khớp giá mở nến sau + trượt 0,02%, SL trước TP khi cùng nến, phí khứ hồi 0,136% và bản 0,4%, funding thật khi giữ qua kỳ funding, giữ ≤ 30 ngày).
- Chiến lược Long-only spot giữ nguyên Long-only. Đòn bẩy 1×; grid/martingale còn thêm bản 3× để đo cháy (liquidation ≈ 100/đòn bẩy %).
- Rủi ro mỗi lệnh cố định 2% vốn ở SL nếu chiến lược có SL; chiến lược không SL (NFI-kiểu, grid, DCA) định cỡ theo tác giả và BÁO lỗ lớn nhất một lệnh.
- CẤM dữ liệu: kỳ mù B [2026-09-19, 2026-10-19). Kỳ C [2026-01-01, 2026-05-01) đã dùng (được đọc nhưng không dùng để chọn).
- Chỉ nến đã đóng; kiểm nhìn trước bằng cách tính chỉ báo tăng dần (không `.min()/.max()` toàn chuỗi).

**Báo cáo mỗi ứng viên:** số lệnh, tỉ lệ thắng, kỳ vọng R hoặc %/lệnh, CI95 khối ngày, PF, tổng lãi %, DD lớn nhất, lỗ lớn nhất 1 lệnh, % cháy
(grid/DCA), chênh "lạc quan − bi quan" (= mức ảo của claim), so với con số tác giả công bố.

**Tiêu chí "đáng xem tiếp" (đặt trước):** bản bi quan phí 0,136% có cận dưới CI95 kỳ vọng > 0 trên kỳ D VÀ tổng lãi > 0 ở 5–9/2026 VÀ
DD ≤ 20%. Đạt → lần kiểm tiếp theo chỉ có thể là paper từ 20/10/2026 (không còn kỳ mù). Không đạt → ghi "không có lợi thế trên dữ liệu
của mình", không chỉnh tham số để "cho đạt".
