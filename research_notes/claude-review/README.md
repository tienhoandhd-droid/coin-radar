# Claude phân tích độc lập 76 lệnh bot (kỳ D) — 20/10/2026

Cách làm: mỗi lệnh Swing của gốc cost-cal-f1 trên D có một hồ sơ nến 1D/4H/1H/15m + BTC, cắt tại lúc bot quyết định
(`backtest/research/claude-review-build.ts`). 8 phiên Claude Opus phân tích mù (không thấy kết quả): tự nhận định dài/trung/ngắn hạn,
tự đề xuất lệnh, rồi mới đọc kế hoạch bot và chấm take/modify/skip + lỗi. Kỳ D nằm sau mốc dữ liệu huấn luyện của model (6/2026).
Chấm: `backtest/research/claude-review-score.ts` → `cham-diem.txt`; nhận định đầy đủ: `nhan-dinh-76-lenh.json`.

Kết quả chính (R của lệnh bot thật; mẫu nhỏ, chưa có CI):
- Claude chấm "take" 11 lệnh −0,27R; "modify" 57 lệnh −0,14R; "skip" 8 lệnh −0,13R → bộ lọc của Claude KHÔNG tách được lệnh thắng/thua.
- Claude đồng ý phía của bot 66/76 lần; lệnh Claude TỰ đề xuất (39 lệnh khớp) −0,28R, tự tin cao hơn còn tệ hơn.
- Giá limit Claude đề xuất: chỉ 32/58 khớp, kết quả −0,145R so với vào ngay −0,136R → không tốt hơn.
- Hai lỗi Claude nêu có gắn với lệnh thua: "SL không ở cấu trúc" (19 lệnh, −0,41R) và "TP1 bất hợp lý" (33 lệnh, −0,28R) —
  gợi ý, chưa kiểm định; "đuổi giá" (35 lệnh, −0,00R) KHÔNG gắn với thua.
Kết luận: phân tích kỹ thuật kiểu chuyên gia (Claude) trên cùng dữ liệu không tạo lợi thế ở altcoin kỳ D; không đáng gọi Claude API
trước mỗi lệnh với mục đích lọc/đặt limit. Lỗi chính nằm ở chỗ các mẫu hình kỹ thuật này không có lợi thế, không phải ở bot đọc sai biểu đồ.
