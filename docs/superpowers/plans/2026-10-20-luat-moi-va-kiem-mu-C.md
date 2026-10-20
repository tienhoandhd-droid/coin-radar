# Kế hoạch: bộ luật mới + kiểm mù kỳ C (20/10/2026)

Người dùng duyệt 20/10/2026 (trả lời 7 quyết định cuối `reports/Luật giao dịch của quỹ lớn.md`):
1. Thu kỳ mù C về [2026-01-01, 2026-05-01) — ĐÃ LÀM (`backtest/replay.ts`).
2. Thử các phương án trên D, so sánh, rồi dùng kỳ C.
3. Kiểm vùng S/R "clean" so với mức ngẫu nhiên trước khi dùng kỳ mù.
4. Nhận diện xu hướng thị trường bằng chỉ số Sợ hãi & Tham lam (FGI) để chọn phía Long/Short.
5. Định cỡ theo mức phụ thuộc BTC + một lệnh mỗi cụm tương quan.
6. Bộ lọc sự kiện miễn phí (coin mới niêm yết, sắp hủy niêm yết).
7. Tải nhiều năm nến ngày để kiểm hệ đi theo xu hướng.
Sau đó khóa luật và chạy kỳ mù C.

## ĐĂNG KÝ TRƯỚC (viết trước khi xem bất kỳ kết quả nào — không chỉnh sau)

Mỗi luật một bộ tham số duy nhất, không quét.

**FGI-hướng (`COMMON.entryRules.fgiDirection`)** — nguồn Alternative.me (`api.alternative.me/fng/?limit=0`, chỉ BTC, theo ngày).
Giá trị của ngày d coi như biết lúc 00:00 UTC ngày d+1 (trễ 1 ngày, tránh nhìn trước). Trung bình 7 ngày gần nhất đã biết:
≥ 50 → chỉ Long; < 50 → chỉ Short. Thiếu dữ liệu → không vào lệnh mới.

**Chỉ Long (`COMMON.entryRules.sides`)** — mặc định `['long','short']`; biến thể `['long']`.

**Hệ đi theo xu hướng khung ngày (trend-d1)** — vũ trụ top 200 thanh khoản theo thời điểm (như Swing):
- Vào Long khi nến 1D đóng > đỉnh giá đóng của 50 nến 1D trước đó; vào lệnh thị trường ở nến kế tiếp.
- Vào Short (chỉ ở biến thể có FGI) khi nến 1D đóng < đáy giá đóng 50 nến trước, và FGI-hướng cho phép Short.
- SL ban đầu = giá vào ∓ 2 × ATR(20) 1D; định cỡ rủi ro 2% như hiện tại (lỗ thật ≤ 2%).
- Thoát: 100% dừng kéo theo giá ĐÓNG 1D = đỉnh giá đóng kể từ khi vào − 3 × ATR(20) 1D (Short đối xứng), không chốt lời cố định,
  không bao giờ nới SL ra xa hơn SL ban đầu; giữ tối đa 180 ngày.
- Không vào lại cùng mã khi đang có lệnh mở.

**Kiểm soát rủi ro danh mục (risk-cluster)** — chỉ siết, không nới:
- Một lệnh mỗi cụm: từ chối lệnh mới cùng phía nếu tương quan lợi suất ngày 30 ngày với một lệnh đang mở cùng phía ≥ 0,7.
- Tổng rủi ro mở có trọng số beta: Σ max(β, 0,5) × rủi ro lệnh (β = beta lợi suất ngày 60 ngày so với BTC) ≤ 10% vốn
  (trần 10% hiện tại, tính theo beta).
- Bỏ hợp đồng niêm yết dưới 30 ngày (onboardDate của exchangeInfo).
- Chỉ khi chạy thật (không kiểm lịch sử được): bỏ hợp đồng có deliveryDate khác mặc định (đã có lịch hủy niêm yết).
  "Monitoring Tag" của Binance không có API công khai → không làm, ghi rõ.

**Các lần thử trên D (đều tính vào k Bonferroni; k hiện tại 17 → 23):**

| # | Tên | Gốc | Nội dung |
|---|---|---|---|
| 18 | sr-long | sr-confirm | luật S/R xác nhận + chỉ Long |
| 19 | fgi-dir | f1-funding-fix | FGI-hướng |
| 20 | sr-fgi | sr-confirm | luật S/R xác nhận + FGI-hướng |
| 21 | risk-cluster | f1-funding-fix | kiểm soát rủi ro danh mục |
| 22 | trend-d1 | f1-funding-fix | hệ xu hướng 1D, chỉ Long (thay hoàn toàn lệnh vùng) |
| 23 | trend-d1-fgi | f1-funding-fix | hệ xu hướng 1D, Long/Short theo FGI-hướng |

Mọi lần thử báo cả chi phí thận trọng (cấu hình) và chi phí hiệu chỉnh (COST_CALIBRATED).

**Nghiên cứu nhiều năm (không phải lần thử trên D, chỉ để chọn họ xu hướng):** mô phỏng nến ngày 2020-01-01 → 2025-12-31 cộng
[2026-05-01, 2026-09-19); KHÔNG đọc dữ liệu kỳ C [2026-01-01, 2026-05-01) và kỳ B. Cùng tham số trend-d1 / trend-d1-fgi; thêm
đối chứng mua giữ BTC và FGI-hướng trên BTC.

**Chọn luật đưa vào kỳ C (đăng ký trước):**
- Họ vùng S/R: trong {f1-funding-fix, sr-confirm, sr-long, fgi-dir, sr-fgi} chọn kỳ vọng R cao nhất trên D (chi phí hiệu chỉnh)
  với ≥ 20 lệnh.
- Họ xu hướng: trong {trend-d1, trend-d1-fgi} chọn kỳ vọng R cao hơn ở nghiên cứu nhiều năm; nếu cả hai âm ở nhiều năm thì không đưa họ
  xu hướng vào C.
- risk-cluster được gắn vào cả hai ứng viên nếu trên D sụt vốn lớn nhất không tệ hơn gốc f1-funding-fix.
- Tối đa 2 ứng viên vào C, mỗi ứng viên chạy MỘT lần; trên C dùng Bonferroni k = 2. Chi phí chính = hiệu chỉnh.
- "Đạt" trên C: cận dưới CI95 Bonferroni (khối ngày) của kỳ vọng R > 0 VÀ tổng lãi > 0. Không đạt thì báo thẳng, không chỉnh luật
  rồi chạy lại C.

## Việc

1. Thu kỳ C — xong.
2. Dữ liệu (nền): FGI lịch sử + nến 1D nhiều năm (data.binance.vision gồm cả mã đã hủy niêm yết khi có) vào `data/` (không commit).
3. Kiểm toán vùng "clean" so với mức ngẫu nhiên trên D (script nháp, cách làm như `sr_audit_data.md`).
4. Code luật (tắt mặc định): FGI-hướng, sides, risk-cluster, trend-d1; biến thể #18–#23 trong `backtest/experiment.ts`.
5. Chạy #18–#23 trên D + bản chi phí hiệu chỉnh; nghiên cứu nhiều năm.
6. Chọn theo luật trên, viết `docs/verification/khoa-luat-mo-phong-mu-C.md`, commit, chạy kỳ C một lần.
7. Báo cáo kết quả.

## BỔ SUNG đăng ký trước — lần thử #24 "mtf-pullback" (người dùng đưa ý 20/10/2026, duyệt "sau đó test dữ liệu cho tôi")

Ý người dùng: "xu hướng chung thị trường tăng và kỹ thuật nến giờ tăng hoặc hồi phục ⇒ mua, ngược lại bán; mua theo nến giờ, 4h,
ngày với khoảng hỗ trợ và cản". Luật (gốc f1-funding-fix, Swing, top 200, một bộ tham số):
1. Xu hướng chung: chế độ BTC 1D (marketRegime hiện có) = Lên → chỉ Long; Xuống → chỉ Short; Đi ngang → không vào.
2. Xu hướng coin 4H: giá đóng 4H > EMA50 4H (Long) / < (Short).
3. Vị trí: giá thấp nhất nến 1H vừa đóng chạm vùng hỗ trợ "clean" 1D/4H độ mạnh ≥ 2 hoặc cách mép trên vùng ≤ 0,5 ATR(14) 4H
   (Short: vùng kháng cự, đối xứng).
4. Nến 1H vừa đóng: nến tăng (đóng > mở), đóng > đỉnh nến 1H trước, đóng > EMA20 1H, và nến 1H trước đóng ≤ EMA20 1H (Short đối xứng).
5. Vào lệnh thị trường ở nến 1H kế tiếp; SL = đáy vùng − 0,25 ATR(14) 4H; rủi ro 2% như hiện tại.
6. TP1 = kháng cự "clean" gần nhất độ mạnh ≥ 2 với R:R ≥ 1,5 (không có → bỏ); thoát C2 (TP1 50% + trailing) như hiện tại.
Gắn risk-cluster nếu risk-cluster đạt điều kiện ở mục chọn luật. k = 24. Thuộc họ vùng S/R khi chọn luật vào C.
