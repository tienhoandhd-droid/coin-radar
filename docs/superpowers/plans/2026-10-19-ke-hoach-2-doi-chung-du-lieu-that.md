# Kế hoạch 2 — Đối chứng phương pháp trên dữ liệu thật (backtest phát lại)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phát lại thị trường Binance Futures thật **từng giờ trong 30 ngày gần nhất** (và 2–3 tháng trước đó để kiểm ngoài mẫu), cho chính máy chấm hiện có ra quyết định như đang chạy thật, mô phỏng lệnh đúng như bot sẽ đặt, đo tỉ lệ thắng / kỳ vọng R / sụt giảm, **mổ xẻ nguyên nhân từng lệnh thua** (tin tức hay thứ khác), so **12 cách đặt/thoát lệnh** (cách chính: C2 — TP1 50% + trailing, người dùng chốt), rồi đề xuất điều chỉnh có kỷ luật.

**Yêu cầu người dùng (19/10/2026):** “lấy dữ liệu mỗi giờ của 1 tháng gần đây… theo phương pháp của bạn xem tỉ lệ thắng thế nào → rút ra nhận xét và điều chỉnh… nguyên nhân nào gây biến động sai → do tin tức hay thứ khác → bổ sung thêm nguồn thông tin”; so sánh TP cố định với trailing; học cách các bot đặt lệnh rồi thử nghiệm so sánh.

**Architecture:** Thư mục mới `backtest/` (Node, dùng lại `packages/core` y nguyên — không có “bản backtest” riêng của luật). Bộ tải dữ liệu lịch sử có bộ nhớ đệm trên đĩa (`data/cache/`, git-ignore). Máy phát lại gọi `analyze`/máy quét trên lát nến đã đóng tại mỗi mốc giờ. Bộ mô phỏng lệnh xử lý khớp/SL/TP từng phần bằng nến 5m (và 1m khi một nến 5m chạm cả hai mức). Bộ thống kê + bộ quy nguyên nhân + báo cáo.

**Nguồn:** `reports/Bot giao dịch mã nguồn mở.md` (ma trận A/B 12 biến thể, yêu cầu R1–R18), `reports/Phản biện bộ nguyên tắc.md` (phí theo nhóm, Wilson, expectancy, walk-forward, PBO, point-in-time), `reports/Mô hình biểu đồ cho BTC.md` mục (5).

## Global Constraints

- Dùng lại `packages/core` không sửa luật để “dễ thắng”; mọi thay đổi luật chỉ ở bước điều chỉnh (Task 8) và phải qua quy trình ngoài mẫu.
- **Không nhìn trước tương lai:** tại mốc t chỉ đưa nến có `closeTime < t` (dùng chung hàm `isClosed(candle, t)` ở `packages/core/candles.ts` với máy quét); funding/OI/sự kiện chỉ dùng giá trị biết được tại t. Bài kiểm bắt buộc: kết quả máy chấm trong phát lại tại t **bằng đúng** kết quả chạy máy quét trên cùng lát dữ liệu.
- Khớp lệnh thực tế: tín hiệu tại nến đóng t → lệnh market khớp ở **giá mở nến 1m kế tiếp + trượt giá theo nhóm thanh khoản**; limit chỉ khớp khi giá thật sự chạm (low ≤ limit với Long) trong hạn.
- Phí khứ hồi theo nhóm (0,25/0,5/1,0%, đã có trong config) + **funding thật từng kỳ** (`/fapi/v1/fundingRate`).
- Một nến chạm cả SL lẫn TP → xuống nến nhỏ hơn để phân xử; vẫn không phân xử được → **tính thua** và đếm tỉ lệ ca này.
- Ghi rõ **thiên lệch sống sót**: chỉ test hợp đồng còn giao dịch hôm nay.
- Không commit `data/cache/`, `output/`. Commit trên `main`, push sau mỗi task đạt rà soát (người dùng cho phép).
- Ngưỡng mới trong `config.ts`, chú thích “đề xuất, chưa backtest” cho đến khi qua Task 8.

---

### Task 1: Tải dữ liệu lịch sử có bộ nhớ đệm

`backtest/data.ts`: tải nến 1D/4H/1H/15m/5m/1m (theo nhu cầu), funding history, OI history 30 ngày (`/futures/data/openInterestHist`), exchangeInfo hiện tại; lưu JSON theo (symbol, interval, ngày) trong `data/cache/`; tôn trọng weight (client hiện có); tải lại được giữa chừng. Phạm vi: 523 hợp đồng cho Swing, 150 thanh khoản nhất cho Lướt nhanh; khung thời gian: 30 ngày + đủ nến khởi động (300 nến 1D trước đó); thêm 3 tháng trước đó cho ngoài mẫu. Test với fetch giả; chạy thật đo số lệnh gọi, dung lượng, thời gian.

### Task 2: Máy phát lại + bài kiểm khớp với máy quét

`backtest/replay.ts`: với mỗi mốc giờ t (và mỗi lần đóng nến 15m cho Lướt nhanh), cắt dữ liệu đã đóng ≤ t, gọi đúng hàm phân tích như `scanner/scan.ts`, ghi tín hiệu (Đạt / Hạng A / Hạng B, vùng hay mô hình). Một tín hiệu mở cho mỗi hợp đồng × chế độ; cooldown sau khi đóng. **Khử trùng tín hiệu mô hình theo `patternId` + `breakoutTime`** (một lần phá chỉ vào một lệnh — máy quét có thể in lại kế hoạch “MỚI” nhiều lần trong một nến khung nhận diện). Gọi `runScan` (scanner/run-scan.ts) với `klines` đồng bộ đọc từ bộ nhớ đệm, đúng như máy quét thật. Bài kiểm: tại 5 mốc ngẫu nhiên, kết quả phát lại = kết quả `analyze` gọi độc lập trên cùng dữ liệu.

### Task 3: Bộ mô phỏng lệnh

`backtest/simulate.ts`: market/limit/split, khối lượng & đòn bẩy & thanh lý (dùng lại `plan.ts`), SL trên sàn theo mark price (xấp xỉ bằng giá nến — ghi rõ), TP1/TP2/TP3 50/30/20, luật sau TP1 (vùng: về giá khớp thật; mô hình: đường phá ∓ 0,5×A hoặc giá khớp), trailing, dừng theo thời gian, phí, funding thật, phân xử trong nến bằng 5m/1m. Đầu ra mỗi lệnh: R thực, các mốc khớp, lý do đóng. Test tính tay từng nhánh.

### Task 4: Ma trận 12 cách đặt/thoát lệnh

Chạy cùng một bộ tín hiệu với: A0 (luật hiện tại = phương án A của người dùng), B1 Cornix (sau TP2 SL lên TP1), B2 không dời SL sau TP1, B3/B3x trailing cho 20% cuối (bot / trên sàn), C2 (= phương án B người dùng: TP1 50% + trailing phần còn lại), C3 (= phương án C: trailing toàn bộ từ TP1), T1/T2 dừng theo thời gian, P1 cầu chì (cooldown + dừng sau 3 SL/24h + lỗ ngày + sụt 10%), O1 “máy nhà tắt” (không quản lý lệnh trong các khoảng tắt máy giả lập), E1/E2 cách vào lệnh. Định nghĩa chính xác lấy từ `reports/Bot giao dịch mã nguồn mở.md`.

### Task 5: Thống kê

Theo chế độ × hướng × Hạng A/B × nguồn (vùng/mô hình) × biến thể: số lệnh, tỉ lệ thắng (chạm TP1 trước SL) + khoảng tin cậy Wilson, kỳ vọng R sau phí + khoảng tin cậy bootstrap, profit factor, sụt giảm lớn nhất (R), chuỗi thua dài nhất, so với **vào lệnh ngẫu nhiên** cùng số lệnh/hướng. Chênh lệch R theo cặp so với A0 (cùng tín hiệu).

### Task 6: Quy nguyên nhân lệnh thua + nguồn tin mới

`backtest/attribution.ts`: mỗi lệnh thua gắn một nhóm (ưu tiên theo thứ tự, ghi bằng chứng): (1) sự kiện vĩ mô có lịch trong cửa sổ lệnh (`data/events`), (2) cú sốc toàn thị trường (BTC ±x% trong cửa sổ), (3) thanh lý dây chuyền (OI giảm đột ngột + nến râu dài), (4) funding cực đoan, (5) sự kiện riêng của coin (thông báo niêm yết/hủy niêm yết Binance, hack DefiLlama — **kiểm chạy được trước**), (6) mật độ tin tức bất thường về coin (GDELT — kiểm giới hạn tốc độ, có thì dùng), (7) **không có nguyên nhân ngoài → lỗi phương pháp** (nhóm cần sửa nhất). Nguồn nào chưa lấy được thì ghi “chưa kiểm được”, không đoán. Tổng hợp: % lệnh thua theo nhóm → đề xuất bổ sung nguồn tin vào bộ lọc.

### Task 7: Chạy đầy đủ + báo cáo

Chạy 30 ngày gần nhất + 3 tháng ngoài mẫu; báo cáo `reports/Đối chứng 30 ngày.md` (tiếng Việt, số thật, biểu bảng, giới hạn: mẫu nhỏ, sống sót, mark price xấp xỉ) + biên nhận `docs/verification/ke-hoach-2-….md`.

### Task 8: Điều chỉnh có kỷ luật

Chỉ chỉnh trên **3 tuần đầu** của tháng gần nhất; kiểm trên **tuần cuối** + **3 tháng trước**; ghi nhật ký mọi lần thử (số lần thử → nêu rủi ro quá khớp). Chỉ đề xuất đổi luật khi cận dưới khoảng tin cậy của chênh lệch R > 0 **và** sụt giảm không tệ hơn. **Người dùng cho phép (19/10/2026): cách thoát lệnh chính là C2 (TP1 chốt 50% + 50% trailing); nếu một cách thoát khác tốt hơn RÕ RỆT thì ÁP DỤNG luôn và báo kèm số liệu.** “Rõ rệt” = cận dưới khoảng tin cậy 95% của chênh lệch R theo cặp so với C2 > 0 trên tuần kiểm **và** trên 3 tháng ngoài mẫu, sụt giảm lớn nhất và chuỗi thua dài nhất không tệ hơn, số lệnh đủ để tính (ghi rõ). Không đạt cả hai giai đoạn → giữ C2. Các thay đổi luật KHÁC (vào lệnh, bộ lọc, ngưỡng) vẫn trình người dùng duyệt trước khi sửa `config.ts`. Mô phỏng phải dùng trần **10 lệnh mở cùng lúc** và rủi ro **2%/lệnh** như bot thật.
