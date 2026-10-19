# Nhật ký thử trên kỳ D

Kế hoạch 2, "Quy trình mô phỏng MÙ": mọi lần thử thay đổi (luật vào lệnh, bộ lọc, cách thoát) trên kỳ phát triển D
[2026-06-21, 2026-09-19) đều ghi ở đây — kể cả lần không nhận. Ghi tự động bởi `node backtest/experiment.ts`.

**Cách đếm k (số lần thử, cho Bonferroni 95% → 1 − 0,05/k):**
- Mỗi cặp (biến thể × chế độ) khác gốc = MỘT lần thử (mỗi chế độ là một quyết định riêng). k = số cặp như vậy trong bảng, tính cả lần đang chạy.
- Các lần đã NHÌN kết quả D trước khi có nhật ký được ghi bù: lọc Hạng A (`filter-A`) và thoát A0 (`exit-A0`), cả hai chế độ (Task 3).
  Cấu hình Hạng A × A0 cũng đã xem — coi là một phần của hai lần thử này, không đếm thêm.
- Các lần chạy lại của Task 3 sau khi sửa lỗi bộ mô phỏng KHÔNG phải lần thử (cùng giả thuyết, sửa công cụ).
- Chạy lại cùng (biến thể, chế độ) — vd. quyết định lại theo tiêu chí mới — THAY dòng cũ, không tăng k.

**Tiêu chí nhận (cấp danh mục, cùng lịch ngày D):** cận dưới CI Bonferroni (bootstrap theo khối NGÀY) của Δ R/ngày **và** Δ lợi suất
vốn %/ngày > 0; kỳ vọng R toàn bộ tăng; sụt giảm lớn nhất % vốn **và** chuỗi thua dài nhất không tệ hơn gốc (không có dung sai); ≥ 30 lệnh.
ΔR theo cặp (cùng signalId) chỉ là chẩn đoán phụ. Thay đổi luật vào lệnh/bộ lọc vẫn phải trình người dùng duyệt trước khi sửa
`config.ts`. Rủi ro người dùng chốt giữ nguyên (2%/lệnh, ≤ 10 lệnh, ≤ 10% tổng rủi ro, cầu chì).
Kỳ vọng R: sau phí + trượt + funding, CI 95% bootstrap theo khối ngày vào lệnh (iid ở output/experiments/…/stats.json).

| Ngày | Biến thể | Chế độ | Thay đổi | Lý do | Lệnh | Kỳ vọng R [CI khối ngày] | Δ R/ngày [CI Bonf.] | Δ lợi suất %/ngày [CI Bonf.] | Δ tổng lãi % / Δ DD % / Δ chuỗi thua | ΔR theo cặp (phụ) | k | Tổng lãi % | PF | Sụt lớn nhất % | Chuỗi thua | Quyết định |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-19 | baseline | swing | gốc: mọi Đạt, thoát C2 (TP1 50% + trailing) | đối chứng cho mọi biến thể | 96 | −0,144 [−0,353; 0,073] | — | — | — | — | — | −7,21 | 0,84 | 20,30 | 12 | gốc (đối chứng) |
| 2026-10-19 | baseline | fast | gốc: mọi Đạt, thoát C2 (TP1 50% + trailing) | đối chứng cho mọi biến thể | 427 | −0,389 [−0,498; −0,275] | — | — | — | — | — | −68,74 | 0,53 | 71,11 | 42 | gốc (đối chứng) |
| 2026-10-19 | filter-A | swing | chỉ tín hiệu Hạng A (bot thật), thoát C2 | lọc Hạng A so với mọi Đạt — đã xem trên D trước khi có nhật ký (Task 3) | 0 | 0,000 [—; —] | 0,154 [−0,225; 0,496] | 0,070 [−0,418; 0,481] | 7,21 / −20,30 / −12 | — [—; —] (0 cặp; chỉ gốc 96 lệnh −13,8R, chỉ biến thể 0 lệnh 0,0R) | 4 | 0,00 | 0,00 | 0,00 | 0 | không kết luận được (< 30 lệnh: 0) |
| 2026-10-19 | filter-A | fast | chỉ tín hiệu Hạng A (bot thật), thoát C2 | lọc Hạng A so với mọi Đạt — đã xem trên D trước khi có nhật ký (Task 3) | 9 | −0,557 [−0,909; −0,062] | 1,788 [1,117; 2,429] | 1,217 [0,412; 1,995] | 66,81 / −68,90 / −37 | 0,000 [0,000; 0,000] (2 cặp; chỉ gốc 425 lệnh −166,4R, chỉ biến thể 7 lệnh −5,5R) | 4 | −1,92 | 0,30 | 2,21 | 5 | không kết luận được (< 30 lệnh: 9) |
| 2026-10-19 | exit-A0 | swing | thoát A0 (TP1/TP2/TP3 50/30/20, dời SL sau TP1) | Task 4: so cách thoát với C2 — đã xem trên D trước khi có nhật ký (Task 3) | 105 | −0,131 [−0,331; 0,081] | 0,001 [−0,268; 0,280] | −0,007 [−0,288; 0,292] | −0,43 / 0,63 / −1 | −0,033 [−0,142; 0,068] (94 cặp; chỉ gốc 2 lệnh −0,1R, chỉ biến thể 11 lệnh 3,1R) | 4 | −7,64 | 0,83 | 20,93 | 11 | không nhận (cận dưới CI Bonferroni của Δ R/ngày ≤ 0) |
| 2026-10-19 | exit-A0 | fast | thoát A0 (TP1/TP2/TP3 50/30/20, dời SL sau TP1) | Task 4: so cách thoát với C2 — đã xem trên D trước khi có nhật ký (Task 3) | 423 | −0,376 [−0,505; −0,242] | 0,076 [−0,261; 0,465] | 0,058 [−0,287; 0,648] | 1,03 / −1,75 / +3 | −0,012 [−0,057; 0,034] (406 cặp; chỉ gốc 21 lệnh −4,5R, chỉ biến thể 17 lệnh 7,2R) | 4 | −67,71 | 0,53 | 69,37 | 45 | không nhận (cận dưới CI Bonferroni của Δ R/ngày ≤ 0) |
