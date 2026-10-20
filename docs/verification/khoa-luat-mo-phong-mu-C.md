# Khóa luật — kỳ mù C [2026-01-01, 2026-05-01) — hệ giữ BTC theo chế độ (S-sma)

Khóa lúc 2026-10-20, TRƯỚC khi chạy. Kỳ C dùng MỘT lần cho ứng viên duy nhất dưới đây (người dùng duyệt "hãy làm cho tôi" theo
`docs/superpowers/plans/2026-10-20-he-btc-theo-che-do.md`). Sau lần chạy này kỳ C coi như đã dùng — không chạy lại, không dùng để chỉnh.

## Ứng viên (chọn theo luật đăng ký trước: MAR cao nhất 2020–2025, > mua giữ, lãi kỳ 2026-05→09 > 0)
**S-sma 2%+SL** trên BTCUSDT perp:
- Quyết định lúc đóng nến 1D (00:00 UTC): giá đóng > SMA50 1D → giữ Long; ngược lại đứng ngoài. Vào/ra ở giá mở nến 1D kế tiếp.
- SL trên sàn = giá vào − 2,5 × ATR(20) 1D (Wilder); chạm SL → đóng (khớp min(SL, giá mở) − trượt 0,02%); tín hiệu còn bật → vào lại ngày sau.
- Định cỡ: giá trị vị thế = min(1 × vốn, 2% vốn / (khoảng SL % + 2 × 0,0575% + 0,02%)); không đòn bẩy > 1×.
- Chốt chặn funding (theo ngày): siết SL để (giá vào − SL)·qty + phí + trượt + funding đã trả ≤ 2% vốn lúc vào.
- Chi phí 0,0575%/chiều + funding thật.

**Sai khác so với bản đăng ký trước (công khai):** định cỡ gồm phí/trượt + chốt chặn funding được thêm SAU khi xem kết quả phát triển,
vì bản gốc vượt ràng buộc cứng "lỗ thật ≤ 2%/lệnh" (tối đa 2,13%). Ủy quyền có sẵn của người dùng: "vượt thì tăng đệm khi định cỡ".
Chỉ làm vị thế nhỏ hơn; kết quả phát triển sau sửa: 2020–2025 +147,4%, DD 18,3%, MAR 0,89, lỗ lớn nhất 2,00%; 2026-05→09 +7,4%.

## Cách chạy (một lần)
`GUARD=1 PERIOD=C node backtest/research/btc-regime-sim.ts` (bản trong repo giống hệt bản chạy ở scratchpad; dữ liệu C do
`backtest/research/btc-regime-dl-c.ts` tải). Chỉ báo khởi động từ 2025-09-01; chỉ mở lệnh từ 2026-01-01; đóng ở giá đóng 2026-04-30.
Đối chứng: mua giữ BTC 1× cân bằng ngày.

## Băm đầu vào (sha256)
- sim: 67376340df1993fefbeaebda6b533a4343b30f7d21031ce80b4606c1d0d0a185
- nến 1D C (c-data/BTCUSDT.json, 242 nến 2025-09-01→2026-04-30): 5d767bcc2930e3655e62784595efe0a7ac1b052455d6f9e051bdeed5a702530e
- funding C (726 kỳ): 125f533a631d859b2d40d4e485c18f1d74ca7949990ee1b850e908f2351bccb9
- fgi.json (không dùng bởi S-sma): 186bea79dd0d2d50a4ed14712ee055248013b9f9821d0a8d5cafa975c238f909

## Tiêu chí đọc kết quả (đặt trước)
Kỳ C 4 tháng chỉ có vài lệnh → KHÔNG chứng minh lợi thế. "Không hỏng" nếu: lỗ thật mỗi lệnh ≤ 2% vốn, DD ≤ 18,3% (DD lớn nhất
kỳ phát triển), và không thua mua giữ quá DD-điều-chỉnh (báo cả hai). Lãi/lỗ tổng chỉ báo cáo, không dùng để nhận/bỏ.
Nhiễm: phân tích theo ngày trước đây đã xem giá kỳ C (đồng biến, biến động riêng) — ghi nhận.
