# Kết quả kỳ mù C [2026-01-01, 2026-05-01) — hệ giữ BTC theo chế độ (S-sma 2%+SL)

Chạy MỘT lần ngày 2026-10-20 theo `khoa-luat-mo-phong-mu-C.md` (commit 932298b, khóa trước khi chạy). Kỳ C đã dùng — không chạy lại.

| Chiến lược | Tổng lãi | DD lớn nhất | Số lệnh | % thời gian có vị thế | Funding (% vốn) | Lỗ thật lớn nhất/lệnh |
|---|---|---|---|---|---|---|
| S-sma 2%+SL | −0,1% | 4,1% | 5 | 42% | 0,02% | 0,74% |
| Mua giữ BTC 1× (cân bằng ngày) | −13,1% | 35,3% | 1 | 99% | 0,19% | 13,11% |

Lệnh: 03/01→21/01 −0,52%; 16/03→20/03 −0,74%; 21/03→22/03 −0,43%; 24/03→27/03 −0,55%; 06/04→30/04 (hết kỳ) +2,20%.

Theo tiêu chí đặt trước: lỗ thật mỗi lệnh ≤ 2% (tối đa 0,74%) — ĐẠT; DD 4,1% ≤ 18,3% — ĐẠT; "không hỏng". Kỳ BTC giảm −13%,
hệ đứng ngoài phần lớn thời gian và giữ vốn gần nguyên. Kỳ 4 tháng, 5 lệnh: KHÔNG chứng minh lợi thế — chỉ xác nhận hệ hành xử
như thiết kế (cắt rủi ro khi giá dưới SMA50, mỗi lệnh lỗ nhỏ, chờ xu hướng).
