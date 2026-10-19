# Kế hoạch Bot — lớp đặt lệnh Binance Futures (paper → demo → live)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây bot TypeScript đặt và quản lý lệnh theo `docs/specs/2026-10-19-bot-design.md`, chạy được ở chế độ `paper` trên máy nhà; sẵn sàng thử `demo` khi người dùng có key Demo.

**Nguồn bắt buộc:** thiết kế bot (quyết định D1–D11 của người dùng), `docs/reference/binance-usdm-api.md` (mọi endpoint/tham số/enum/mã lỗi lấy từ đây — **không đoán**; chỗ ghi “KHÔNG THẤY TRONG TÀI LIỆU” phải thiết kế để an toàn và kiểm trên Demo), yêu cầu R1–R18 trong `reports/Bot giao dịch mã nguồn mở.md`.

**Tech:** Node 24 (`fetch`, `WebSocket`, `node:crypto`), không thêm thư viện. systemd user service.

## Global Constraints

- Không bao giờ gửi lệnh điều kiện (STOP_MARKET/TAKE_PROFIT_MARKET/TRAILING_STOP_MARKET) tới `/fapi/v1/order` — chỉ `/fapi/v1/algoOrder` (`algoType=CONDITIONAL`); có test khẳng định.
- SL `workingType=MARK_PRICE` tường minh. Mọi vị thế luôn có lệnh dừng trên sàn; đặt dừng hỏng → đóng market + Telegram khẩn.
- ID tất định ≤ 36 ký tự theo regex trong tài liệu tra cứu, có mã lần chạy để không trùng.
- Trạng thái không rõ (503 “Unknown error”, -1006, -1007) → tra lại, không gửi lại mù.
- Mặc định chế độ `paper`. `live` chỉ bật bằng cấu hình + xác nhận gõ tay; khóa cứng không bỏ qua được.
- Secret chỉ trong `.env` (quyền 600, đã git-ignore); không log, không Telegram, không commit. Không `git add -f`.
- Quyết định người dùng (19/10/2026) phải có trong config và test: rủi ro **2%/lệnh**; **tối đa 10 lệnh mở và tổng rủi ro mở ≤ 10%**; thoát lệnh **TP1 50% + 50% trailing trên sàn kích hoạt tại TP1, callback sao cho mức dừng lúc kích hoạt ≥ giá vào + phí**; **5 lệnh thua/24h → dừng tới khi người dùng cho phép**; **lỗ ngày > 10% → dừng tới khi cho phép**; **sụt 30% → chỉ cảnh báo**; chỉ tín hiệu **Hạng A MỚI**.
- Làm trên `main`, push sau mỗi task đạt rà soát. Tiếng Việt cho log/Telegram.

---

### Task B0: Đưa quyết định người dùng vào lõi

`packages/core/config.ts` + nơi dùng: rủi ro mặc định 2% (bỏ phân tầng 0,5/0,25% cho bot — giữ phân tầng như tùy chọn hiển thị nếu cần, ghi rõ), trần 10 lệnh, chính sách thoát `C2` (TP1 50% + trailing) là mặc định khi in kế hoạch (vẫn tính TP2/TP3 làm thông tin và cho đối chứng các biến thể). Sửa máy quét in đúng chính sách mới. Cập nhật test và spec chính. Đồng bộ kế hoạch 2 (bộ mô phỏng dùng cùng hằng số).

### Task B0b: Sửa theo đánh giá độc lập (reports/Đánh giá độc lập hệ thống.md)

Người dùng chốt thêm 19/10/2026: **tổng rủi ro đang mở ≤ 10% vốn** (tối đa 10 lệnh; lệnh đã qua TP1 tính rủi ro 0).
- C3: kiểm **ký quỹ khả dụng** trước mỗi lệnh (tổng ký quỹ các lệnh mở + lệnh mới ≤ vốn bot × hệ số an toàn trong config); không đủ → giảm khối lượng tới mức tối đa cho phép (rủi ro thực in rõ < 2%) hoặc bỏ lệnh; trần đòn bẩy giữ nguyên.
- Trần danh mục: 10 lệnh **và** tổng rủi ro mở ≤ 10% (config), dùng chung cho máy quét (thông tin), mô phỏng kế hoạch 2 và bot.
- I2: đọc đủ bộ lọc sàn từ exchangeInfo (MIN_NOTIONAL theo từng hợp đồng, MARKET_LOT_SIZE, minQty/maxQty, MAX_NUM_ORDERS); kế hoạch vi phạm → không hợp lệ kèm lý do.
- I3: kế hoạch dùng **giá mark hiện tại** (premiumIndex) làm giá hiện tại; giá đóng nến cũ hơn ngưỡng (config) so với thời điểm quét → cờ “dữ liệu cũ”, không lập kế hoạch; phát hiện nến thiếu.
- I4: cổng thiếu dữ liệu **chặn** (G-04 thiếu khối lượng → trượt; lịch sự kiện hết hạn hoặc còn < 14 ngày → cảnh báo nổi bật; G-06 “chưa đánh giá” hiển thị rõ ở đầu bản in; G-08 kiểm thật theo bậc ký quỹ khi có).
- I5: tín hiệu vùng có `signalId` (theo hợp đồng + chế độ + hướng + thời điểm nến đóng) và cờ “MỚI”, vùng trễ 70/60 (hysteresis) theo spec.
- I7: chi phí trượt giá theo cỡ lệnh (tỉ lệ notional / khối lượng 1 phút gần đây, config) + bậc ký quỹ duy trì thật khi có key (leverageBracket), mặc định thận trọng khi chưa có.
- I8: sửa câu chữ thiết kế: “50% còn lại gần như hòa vốn, trừ trượt giá khi lệnh trailing khớp market”.
Test từng mục.

### Task B1: REST có ký + đồng bộ giờ + phân loại lỗi

`packages/binance/signed.ts`: ký HMAC-SHA256 (và RSA nếu tài liệu cho phép — Ed25519 chỉ khi tài liệu xác nhận cho REST futures), timestamp/recvWindow, đo lệch giờ với `/fapi/v1/time`, phân loại lỗi (unknown-status / retryable / rejected / ban), đọc header weight + order count, dùng chung bộ khóa 418/429 của client hiện có, **ưu tiên** bot hơn máy quét khi chia ngân sách weight (IP dùng chung). Test bằng fetch giả + vector ký tính tay.

### Task B2: Lệnh thường + Algo Order

`packages/binance/orders.ts`: MARKET/LIMIT (+ hạn tự hủy theo tài liệu), hủy/tra; Algo create/cancel/query/list cho SL (`closePosition`, MARK_PRICE, priceProtect), TP reduce-only, TRAILING (activatePrice, callbackRate 0,1–10), countdown cancel-all (heartbeat). Thiết lập tài khoản: position mode (kiểm One-way, sai thì dừng), multi-assets mode (phải tắt cho isolated), margin type ISOLATED, leverage. Test tham số khớp bảng tra cứu; test bất biến R1.

### Task B3: Planner (kế hoạch → lệnh mong muốn)

`packages/bot/planner.ts`: từ `TradePlan` + exchangeInfo (tick/step/minNotional/MAX_NUM_ORDERS) + vốn → danh sách lệnh mong muốn theo chính sách C2: vào (market/limit), SL gốc, TP1 50% reduce-only, trailing 50% với `activatePrice=TP1` và `callbackRate` = min(theo ATR, (TP1 − (giá vào + phí))/TP1) giới hạn trong [0,1; 10] — nếu < 0,1% → thêm lệnh dừng sàn ở giá vào làm lưới; khối lượng theo 2% và trần đòn bẩy; kiểm thanh lý. Thuần, test bảng ca Long/Short.

### Task B3b: TP1 bỏ qua vùng cản yếu (người dùng chốt 19/10/2026)

Người dùng: “lệnh quá ngắn thì khả năng biên độ lợi nhuận không cao” → chọn **bỏ vùng cản yếu đầu tiên, lấy TP1 xa hơn** (không thêm ngưỡng %). Quy tắc: khi đặt TP1 (lệnh vùng và lệnh mô hình), chỉ vùng có **độ mạnh ≥ 2** (config, cùng ngưỡng `minSlStrength`) mới là vật cản; vùng yếu hơn bị bỏ qua và ghi vào lý do (“bỏ qua vùng … (độ mạnh x) — TP1 lấy vùng kế tiếp”). Áp đồng bộ: chọn TP1 trong plan.ts và pattern-plan.ts, luật “kháng cự ngay sát giá vào” (G-12), S-03, Hạng A tiêu chí 3 (“không có vùng cản MẠNH giữa giá vào và TP1”), bản in. Kế hoạch 2: thêm biến thể so sánh “TP1 tại vùng đầu tiên bất kể độ mạnh” để đo tác động. Test Long/Short.

### Task B4: Nhật ký + bộ đối chiếu thuần

`packages/bot/journal.ts` (JSONL chỉ ghi thêm + ảnh chụp, khôi phục), `packages/bot/reconcile.ts` (mong muốn × thật → hành động theo R8: thiếu dừng → đặt/đóng; dừng mồ côi → hủy; TP1 khớp lúc vắng mặt → hủy SL gốc chỉ khi trailing đã kích hoạt; khớp một phần; vị thế lạ → báo, không đụng; chặn gán khớp của lệnh cũ cho lệnh mới). Test bảng ca ≥ 15 tình huống.

### Task B5: Protections + danh mục

`packages/bot/protections.ts`: cầu chì theo người dùng, cooldown cặp+chiều 2 nến, trần 10 lệnh, chỉ Hạng A MỚI, khóa cứng `live`. Trạng thái cầu chì lưu trong nhật ký (khởi động lại vẫn giữ), chỉ mở bằng lệnh người dùng. Test từng cầu chì.

### Task B6: Telegram

`packages/bot/telegram.ts`: gửi tin (fetch Bot API), nhận lệnh `/trangthai`, `/dung`, `/tieptuc` chỉ từ chat ID cấu hình; không bao giờ chứa secret (test lọc). Cần người dùng tạo bot Telegram và cấp token + chat ID vào `.env` (hướng dẫn trong runbook).

### Task B7: Sàn giả lập cho `paper`

`packages/bot/paper.ts`: sàn giả lập cùng giao diện với `orders.ts`, khớp theo giá mark/nến thật từ WebSocket, dùng chung logic khớp/phí/funding với bộ mô phỏng của kế hoạch 2 (Task 3) — nếu kế hoạch 2 Task 3 chưa xong, làm Task này sau.

### Task B8: Luồng dữ liệu + vòng đời + chạy nền

`packages/binance/stream.ts` (kline đóng nến, markPrice, user data + listenKey; URL mới theo tài liệu; nối lại; nến cũ → không vào lệnh), `bot/main.ts` (vòng đời theo thiết kế), `deploy/coin-radar-bot.service` (systemd user), `docs/runbook-bot.md` (cài, tạo key Demo/thật đúng quyền, IP, bật/tắt, đọc Telegram, xử lý sự cố). Chạy `paper` thật trên máy nhà ≥ 1 giờ, dán log.

### Task B9: Kịch bản kiểm cơ khí trên Demo (cần key Demo của người dùng)

`bot/demo-checks.ts`: đặt/khớp/hủy lệnh nhỏ, SL/TP/trailing qua Algo, hai `closePosition` cùng tồn tại?, countdown cancel có hủy algo?, khởi động lại giữa chừng, rút mạng giả. Ghi biên nhận. Chỉ chạy khi người dùng đã đặt key Demo vào `.env`.
