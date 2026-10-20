# Kế hoạch: hệ giữ BTC theo chế độ thị trường (20/10/2026)

Người dùng duyệt 20/10/2026 ("hãy làm cho tôi") sau khi nghiên cứu nhiều năm cho thấy "giữ BTC khi FGI 7 ngày ≥ 50, đứng ngoài khi
< 50" +685%, DD 37% (2020–2025) so với mua giữ +1119%, DD 77% (`scratchpad/history/report.md`, chưa tính funding, không có SL).

## ĐĂNG KÝ TRƯỚC (viết trước khi chạy — không chỉnh sau)

Dữ liệu: BTCUSDT perp nến 1D (`data/history/1d/`), funding thật (`/fapi/v1/fundingRate`, công khai), FGI Alternative.me.
KHÔNG đọc [2026-01-01, 2026-05-01) (kỳ mù C) và ≥ 2026-09-19 (kỳ B đã dùng).
Kỳ phát triển: 2020-01-01 → 2025-12-31 (báo từng năm) và [2026-05-01, 2026-09-19) riêng.

Tín hiệu (quyết định lúc 00:00 UTC bằng dữ liệu đã đóng; vào/ra ở giá mở nến 1D kế tiếp):
- **S-fgi**: TB 7 ngày FGI (giá trị ngày d dùng từ 00:00 UTC ngày d+1) ≥ 50 → có vị thế Long; < 50 → đứng ngoài.
- **S-sma**: giá đóng 1D BTC > SMA50 1D → Long; ngược lại đứng ngoài.
- **S-both**: cả hai điều kiện trên.
Không Short (chỉ Long hoặc đứng ngoài).

Định cỡ (ràng buộc cứng của người dùng: lỗ tối đa 2% vốn mỗi lệnh, không tăng rủi ro):
- Khi vào: SL = giá vào − 2,5 × ATR(20) 1D (Wilder, tính tới nến đã đóng). Giá trị vị thế = min(1 × vốn, 2% vốn / khoảng SL %).
  Không đòn bẩy quá 1×.
- SL đặt trên sàn; chạm SL (khớp = min(SL, giá mở nếu gap) − trượt 0,02%) → đóng. Nếu tín hiệu vẫn bật, vào lại ở giá mở ngày kế
  tiếp với SL mới. Không dời SL theo giá (tín hiệu tắt mới thoát).
- Chi phí 0,115% khứ hồi (0,0575%/chiều) + funding thật mỗi kỳ thanh toán trên giá trị vị thế.
- Đối chứng: mua giữ BTC 1× (có funding, không SL); và bản 1× không SL của từng tín hiệu (VI PHẠM luật 2% — chỉ để so).
- Kiểm độ bền: cùng luật trên ETHUSDT (không dùng để chọn).

Chỉ số: tổng lãi %, CAGR, DD lớn nhất, MAR = CAGR/DD, số lệnh, % thời gian có vị thế, funding đã trả, lỗ thật lớn nhất mỗi lệnh
(% vốn, phải ≤ 2%), từng năm.

Chọn ứng viên duy nhất cho kỳ mù C: MAR cao nhất 2020–2025 trong 3 tín hiệu có định cỡ 2%; điều kiện: MAR > MAR mua giữ VÀ tổng lãi
[2026-05-01, 2026-09-19) > 0. Không ứng viên nào đạt → không dùng kỳ C, báo người dùng.
Kỳ C (4 tháng) chỉ có vài lệnh — kết quả C chỉ để phát hiện sai hỏng lớn, không chứng minh lợi thế; báo cáo phải nói rõ.
