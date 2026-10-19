# Nhật ký thử trên kỳ D

Kế hoạch 2, "Quy trình mô phỏng MÙ": mọi lần thử thay đổi (luật vào lệnh, bộ lọc, cách thoát) trên kỳ phát triển D
[2026-06-21, 2026-09-19) đều ghi ở đây — kể cả lần không nhận. Ghi tự động bởi `node backtest/experiment.ts`.

- **k (số lần thử)** = số biến thể KHÁC gốc đã có trong bảng (tính cả lần đang ghi). Khoảng tin cậy ΔR dùng Bonferroni 95% → 1 − 0,05/k.
- **Kỳ vọng R** sau phí + trượt + funding, khoảng tin cậy bootstrap 95% (hạt cố định). **ΔR** = biến thể − gốc trên cùng signalId đã khớp ở cả hai.
- **Tiêu chí nhận:** cận dưới CI Bonferroni của ΔR > 0, sụt giảm lớn nhất không tệ hơn gốc, ≥ 30 lệnh và ≥ 30 cặp. Thay đổi luật vào lệnh/bộ lọc
  vẫn phải trình người dùng duyệt trước khi sửa `config.ts`. Rủi ro người dùng chốt giữ nguyên (2%/lệnh, ≤ 10 lệnh, ≤ 10% tổng rủi ro, cầu chì).

| Ngày | Biến thể | Chế độ | Thay đổi | Lý do | Lệnh | Kỳ vọng R [CI 95%] | ΔR so gốc [CI Bonferroni] (k) | Tổng lãi % | PF | Sụt lớn nhất % | Quyết định |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-19 | baseline | swing | gốc: mọi Đạt, thoát C2 (TP1 50% + trailing) | đối chứng cho mọi biến thể | 96 | −0,144 [−0,347; 0,060] | — | −7,21 | 0,84 | 20,30 | gốc (đối chứng) |
| 2026-10-19 | baseline | fast | gốc: mọi Đạt, thoát C2 (TP1 50% + trailing) | đối chứng cho mọi biến thể | 427 | −0,389 [−0,482; −0,292] | — | −68,74 | 0,53 | 71,11 | gốc (đối chứng) |
| 2026-10-19 | exit-A0 | swing | thoát A0 (TP1/TP2/TP3 50/30/20, dời SL sau TP1) | Task 4: so cách thoát với C2 (đã có trong bộ mô phỏng) | 105 | −0,131 [−0,325; 0,072] | −0,033 [−0,119; 0,049] (k=1, 94 cặp) | −7,64 | 0,83 | 20,93 | không nhận (cận dưới CI Bonferroni của ΔR ≤ 0) |
| 2026-10-19 | exit-A0 | fast | thoát A0 (TP1/TP2/TP3 50/30/20, dời SL sau TP1) | Task 4: so cách thoát với C2 (đã có trong bộ mô phỏng) | 423 | −0,376 [−0,474; −0,273] | −0,012 [−0,048; 0,022] (k=1, 406 cặp) | −67,71 | 0,53 | 69,37 | không nhận (cận dưới CI Bonferroni của ΔR ≤ 0) |
