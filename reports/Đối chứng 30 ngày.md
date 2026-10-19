# Đối chứng dữ liệu thật và mô phỏng mù 30 ngày

Ngày 20/10/2026. Báo cáo cho anh Hoàn sau đợt làm việc 12 giờ theo ủy quyền ngày 19/10/2026.

## 1. Kết luận ngắn

- **Hệ thống hiện tại chưa có lãi.** Trên 3 tháng phát triển và trên 30 ngày mù, mọi cấu hình đều có kỳ vọng âm sau phí, trượt giá và funding.
- **Lướt nhanh lỗ chắc chắn**, kể cả khi dời lên khung 4H/1H: trên 30 ngày mù −0,28R mỗi lệnh, −15,2%, khoảng tin cậy nằm hẳn dưới 0.
  Đề xuất **tắt Lướt nhanh cho bot**.
- **Swing gần hòa vốn nhưng vẫn âm.** Bộ lọc tốt nhất tìm được (combo-loc) lãi +8,6% trên 3 tháng phát triển, nhưng trên 30 ngày mù
  còn −3,1% (−0,03R/lệnh). Theo tiêu chí viết trước khi chạy: **không đạt**.
- **Ràng buộc lỗ tối đa 2% mỗi lệnh được giữ:** 0 lệnh vượt trong mọi lần chạy, lệnh tệ nhất −1,99% vốn (đã gồm trượt giá, gap, funding).
- **Không nên đánh tiền thật** với luật hiện tại. Bot vẫn hoàn thiện tiếp để chạy giấy (paper), làm nền thử luật mới an toàn.

## 2. Cách làm (để anh kiểm lại được)

1. Tải dữ liệu thật từ Binance: 523 hợp đồng USDT, nến 1D/4H/1H/15m/5m/1m, funding, OI (952 MB + 406 MB). 0 nến thiếu.
2. Máy phát lại: tại từng giờ (Swing) hoặc từng 15 phút (Lướt nhanh), dựng lại đúng dữ liệu đã biết tại thời điểm đó rồi gọi
   **chính máy quét** của anh. Có bài kiểm “đổi dữ liệu tương lai thì kết quả hiện tại không đổi”, đã thử cài lỗi cố ý để chắc bài kiểm bắt được.
3. Bộ mô phỏng lệnh dùng **chính phần định cỡ của bot**: 2% theo giá khớp xấu nhất, ≤ 10 lệnh còn rủi ro, ≤ 10% tổng rủi ro, cầu chì
   5 lệnh thua/24 giờ, lỗ ngày > 10%, phí theo bậc, trượt giá theo cỡ lệnh, funding thật theo chiều Long/Short, xử lý nến mơ hồ bằng nến 1 phút.
   Người rà soát tính tay lại 5 lệnh từ dữ liệu thô: khớp tới chữ số thứ 9.
4. **Mô phỏng mù:** chỉ chỉnh trên 3 tháng phát triển (21/6 → 19/9/2026), ghi nhật ký mọi lần thử (16 lần), khóa luật bằng commit
   `621cb34` + mã băm cấu hình, rồi chạy 30 ngày gần nhất (19/9 → 19/10/2026) **đúng một lần**. Bộ chạy mù tự từ chối nếu mã hoặc cấu hình
   khác bản khóa, hoặc nếu đã từng chạy.

## 3. Kết quả 3 tháng phát triển (vốn 10 000 USDT)

| Cấu hình | Lệnh | Kỳ vọng R/lệnh | Tổng lãi | PF | Sụt lớn nhất |
|---|---|---|---|---|---|
| Swing, luật hiện tại | 97 | −0,13 | −4,9% | 0,87 | 16,7% |
| Swing, chỉ Hạng A | 0 | — | 0 | — | — |
| Lướt nhanh, luật hiện tại | 423 | −0,36 | −60,2% | 0,57 | 63,0% |
| Lướt nhanh, chỉ Hạng A | 9 | −0,56 | −1,9% | 0,30 | 2,2% |
| Swing combo-loc (sau 14 lần thử) | 27 | +0,25 | +8,6% | 1,50 | 6,5% |
| Lướt nhanh khung 4H/1H | 261 | −0,23 | −18,6% | 0,84 | 39,5% |

R = số lần mức rủi ro của lệnh. −0,13R nghĩa là mỗi lệnh trung bình mất 13% số tiền chấp nhận rủi ro. PF = lãi gộp / lỗ gộp.

## 4. Kết quả 30 ngày mù

| Cấu hình | Lệnh (Long/Short) | Kỳ vọng R [khoảng tin cậy 95%] | Tổng lãi | PF | Sụt lớn nhất | Lỗ tệ nhất |
|---|---|---|---|---|---|---|
| Swing, luật hiện tại | 52 (52/0) | −0,12 [−0,55; +0,28] | −4,9% | 0,85 | 17,0% | −1,92% |
| Swing combo-loc | 28 (28/0) | −0,03 [−0,48; +0,42] | −3,1% | 0,88 | 14,0% | −1,92% |
| Lướt nhanh 4H/1H | 118 (117/1) | −0,28 [−0,51; −0,03] | −15,2% | 0,76 | 25,7% | −1,99% |

30 ngày mù hầu như chỉ có lệnh Long (thị trường không cho tín hiệu Short đạt chuẩn), nên chưa đo được Short ngoài mẫu.

## 5. Điểm mạnh

- **Quản trị rủi ro chạy đúng như anh đặt:** không lệnh nào lỗ quá 2%, cầu chì ngắt đúng, sụt giảm Swing được giới hạn ~14–17%.
- **combo-loc giảm lỗ rõ** so với luật gốc ở cả hai kỳ: ít lệnh hơn, tỉ lệ thắng 43% so với 35%, sụt nhỏ hơn, không lần nào ngắt cầu chì.
- **Long Swing gần hòa vốn** (PF 0,99 trên 3 tháng phát triển) — hướng đáng nghiên cứu tiếp.
- Hạ tầng kiểm chứng đáng tin: dữ liệu thời điểm, mô phỏng tính tay khớp, quy trình mù có khóa.

## 6. Điểm yếu (nguyên nhân lỗ)

1. **Phí ăn mòn Lướt nhanh:** khoảng SL trung vị chỉ 0,64% giá → riêng phí đã chiếm ~0,32R mỗi lệnh. Vào lệnh **ngẫu nhiên** ở khung này
   cũng lỗ −0,31R — tức là khung 15 phút gần như không thể có lãi với mức phí hiện tại, bất kể tín hiệu.
2. **Luật vào lệnh chưa có lợi thế:** trên Swing, vào lệnh ngẫu nhiên được +0,04R, còn tín hiệu của hệ thống −0,13R.
   Không yếu tố bên ngoài nào (sốc BTC, sự kiện vĩ mô, funding, SL sát) phân biệt được lệnh thua với lệnh thắng → vấn đề nằm ở cách chọn điểm vào,
   không phải ở “xui”.
3. **Short là nguồn lỗ chính** trên 3 tháng phát triển (Swing Short −0,23R, PF 0,64).
4. **Hạng A gần như không có lệnh** (0 lệnh Swing trong 3 tháng). Máy quét chấm điểm cao nhất cho đúng những tín hiệu không có vùng cản phía trước —
   chính những tín hiệu bot không vào được vì “không có TP1”.
5. Mẫu nhỏ: 30 ngày mù chỉ 28–52 lệnh Swing, khoảng tin cậy rộng; cần thêm thời gian để kết luận chắc.

## 7. Lỗi đã tìm và sửa trong đợt này (đều có test)

- Lõi **thổi phồng chi phí** (trượt giá tính trên khối lượng trước khi cắt theo thanh khoản) → vào lệnh chỉ ~1% thay vì 2% và loại oan nhiều tín hiệu.
- Định cỡ chưa tính **phí chiều ra ở giá SL và funding** → có lệnh lỗ 2,005%. Nay: 0 lệnh vượt 2%.
- **Bản in máy quét định cỡ lớn hơn bot** (AKE: in 3,1 triệu coin, bot vào 1,7 triệu) → nay dùng chung một công thức; máy quét tải funding 30 ngày.
- Dữ liệu OI bị cắt mất 220 giờ đầu; 357 coin thiếu nến 15 phút; nhiều lỗ hổng trong bot (đối chiếu sau khi tắt máy, lệnh dừng bị hở,
  khóa tiền thật, Telegram `/dung` mất khi khởi động lại, WebSocket kết nối chết không tự nối lại).
- Tôi đã **đính chính** một kết luận sai của chính mình: “lệnh Lướt nhanh thua vì SL quá sát” — 82% lệnh thắng cũng có SL sát như vậy.

## 8. Việc cần anh quyết

1. **Tắt Lướt nhanh cho bot** (`COMMON.bot.modes = ['swing']`). Đề xuất: đồng ý.
2. **Sửa định cỡ F1** (đệm funding theo thời gian giữ dự kiến + bộ chặn funding khi đang giữ lệnh): đưa rủi ro thật mỗi lệnh về gần 2% như anh chốt,
   vẫn giữ lỗ ≤ 2%. Bot hiện tự từ chối chế độ này ở Demo/tiền thật cho tới khi phần chặn funding của bot (B8b) xong.
3. **Có bật combo-loc cho bot giấy không:** tốt hơn luật gốc ở cả hai kỳ nhưng vẫn âm trên dữ liệu mù → đề xuất chỉ bật ở **paper** để thu thêm mẫu.
4. **Vị thế lạ** (không do bot mở, ví dụ anh tự vào tay) trên sàn: hiện bot chỉ báo Telegram, không đặt SL. Anh muốn bot tự đặt SL bảo vệ không?
5. Cầu chì: lệnh đóng hòa vốn lỗ vài cent vì phí có tính là “thua” không? Thời gian chờ 2 nến áp sau mọi lần đóng hay chỉ sau SL?

## 9. Hướng tiếp theo đề xuất (chưa làm, cần anh duyệt vì là thay đổi luật)

- Nghiên cứu lại **luật vào lệnh Swing Long**: vào theo xu hướng/phá đỉnh có xác nhận khung ngày thay vì bật lại ở vùng; dùng 3 tháng phát triển
  cũ làm dữ liệu phát triển mới và chờ thêm 30 ngày dữ liệu mới làm phần mù tiếp theo (phần mù vừa dùng không được dùng lại).
- Chạy bot **paper** với Swing (Long ưu tiên) ≥ 100 lệnh và ≥ 4 tuần trước khi nghĩ tới Demo, đúng lộ trình đã thống nhất.
- Thêm nguồn tin coin riêng (thông báo niêm yết/hủy niêm yết Binance, DefiLlama hacks) — đã thử gọi được, nhưng chưa chứng minh giúp tăng lãi.

## 10. Tài liệu kèm

- Biên nhận mù: `docs/verification/khoa-luat-mo-phong-mu.md`, `docs/verification/ket-qua-mo-phong-mu.md`
- Nhật ký 16 lần thử: `docs/verification/nhat-ky-thu.md`
- Nghiên cứu cải thiện lợi nhuận: `reports/Nghiên cứu cải thiện lợi nhuận.md`
- Kết quả thô (không đưa lên git): `output/backtest/`, `output/experiments/`, `output/blind/`
