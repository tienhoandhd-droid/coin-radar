# Kế hoạch 1c — Mô hình biểu đồ cho coin ít biến động (BTC/ETH/coin lớn)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nhận diện mô hình biểu đồ từ nến đã đóng, dùng làm bộ lọc + nguồn vùng giá + tín hiệu phá vỡ có điều kiện cho coin ít biến động, theo đúng khuyến nghị của báo cáo `reports/Mô hình biểu đồ cho BTC.md` mục “Đề xuất áp dụng cho Coin Radar”.

**Architecture:** Thư mục mới `packages/core/patterns/` (hàm thuần): lọc pivot theo biên độ, hình học (đường bình phương tối thiểu), các bộ nhận diện, máy trạng thái chạy lại từ nến đã đóng (không lưu trạng thái — lưu trữ/ảnh chụp để kế hoạch 3), kế hoạch lệnh theo mô hình. `analyze` gọi bộ nhận diện cho hợp đồng đủ điều kiện; tín hiệu mô hình là một nguồn tín hiệu **bổ sung**, phải qua đủ các cổng hiện có.

**Tech Stack:** Như kế hoạch 1/1b. Không thêm thư viện.

**Nguồn quy tắc (bắt buộc đọc phần liên quan):** `reports/Mô hình biểu đồ cho BTC.md` — mục (1) bảng áp dụng, (2) quy tắc nhận diện + máy trạng thái + chống look-ahead, (3) ghép mục tiêu với TP1/TP2/TP3, (4) kiểu vào lệnh “đóng cửa phá vỡ”. Mọi con số trong các mục đó là **[Đề xuất]**, đưa vào `config.ts` với chú thích “đề xuất, chưa backtest”.

**Người dùng duyệt 19/10/2026:**
- Áp dụng theo khuyến nghị báo cáo: Swing 4H dùng **chữ nhật/vùng đi ngang, cờ/cờ đuôi nheo, tam giác, hai đỉnh/hai đáy** làm bộ lọc + nguồn vùng giá + tín hiệu; **vai-đầu-vai, vùng nhiều tháng (1D)** chỉ làm bối cảnh; **nêm, mở rộng** không dùng; **15m/1H chỉ ghi nhận (ẩn), không hiện lệnh**; nén biến động chỉ là cờ “coil”.
- Lệnh phá mô hình vào khi **nến đóng vượt**: d ≤ 1×A vào hết; 1–2×A nửa trực tiếp nửa limit; > 2×A chỉ limit (bảng mục (4) báo cáo).
- **Sau TP1 với lệnh mô hình: dời SL về đường phá − 0,5×A** (khi giá vào cách đường phá < 0,5×A; xa hơn thì giữ luật “SL về giá vào”). Lệnh theo vùng thường giữ nguyên luật “SL về giá khớp thật”.
- Đã chốt ở 1b và vẫn áp dụng: không vào khi giá nằm trong vùng; TP 50/30/20; bảng khối lượng theo giá khớp; G-11, G-12.

**Ngoài phạm vi (ghi rõ trong biên nhận):** cốc-tay cầm (cần 7–65 tuần, để sau), mô hình thất bại (busted) chỉ ghi sổ khi có Supabase (kế hoạch 3), ảnh chụp/không ghi đè trạng thái (kế hoạch 3), backtest 15 mục ở mục (5) báo cáo (kế hoạch 2), kiểm tra “kháng cự dày giữa đường” bằng sổ lệnh.

## Global Constraints

- Tiếng Việt cho giao diện/console/tài liệu; tên biến/hàm tiếng Anh.
- Không thêm thư viện; import nội bộ đuôi `.ts`; chỉ cú pháp TS xóa được.
- Không nuốt lỗi; không NaN/Infinity im lặng; chỉ nến đã đóng; pivot chỉ khi đủ 3 nến bên phải.
- Mọi ngưỡng trong `packages/core/config.ts` (nhóm `COMMON.patterns`), chú thích “đề xuất, chưa backtest”.
- `packages/core` chạy được trên trình duyệt.
- Giá in theo `tickSize`, làm tròn về phía an toàn (đã có `price.ts`).
- Không commit `output/`. Commit: `-c user.name="Tào Tiến Hoàn" -c user.email="tienhoan.dhd@gmail.com"`, trailer đúng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Mỗi commit qua typecheck.
- **Bài kiểm bắt buộc chống look-ahead:** với mọi bộ nhận diện và máy trạng thái, kết quả chạy trên toàn bộ chuỗi nến phải **trùng khớp** với kết quả khi chạy tăng dần từng nến rồi lấy kết quả tại nến cuối.

## Phạm vi coin áp dụng tín hiệu mô hình (cổng P-G1, mới)

Chỉ phát **tín hiệu** mô hình (không phải bối cảnh) cho hợp đồng: mức rủi ro **Thấp hoặc Vừa** VÀ nhóm thanh khoản cao (`liquidityRank ≤ COMMON.costTierRank.high`) — tức coin ít biến động, thanh khoản lớn như BTC/ETH. Bối cảnh (vai-đầu-vai, vùng nhiều tháng, coil) tính cho cùng phạm vi đó.

---

### Task 1: Lọc pivot theo biên độ + hình học cơ bản

**Files:** Create `packages/core/patterns/pivots.ts`, `packages/core/patterns/geometry.ts`, tests cùng tên `.test.ts`; Modify `packages/core/config.ts` (`COMMON.patterns`).

**Interfaces (Produces):**
- `type Pivot = { index: number; price: number; kind: 'high' | 'low' }`
- `swingPivots(c: Candle[], atr: number[], minSwingAtr: number): Pivot[]` — từ pivot đã xác nhận (N=3), giữ pivot có biên độ so với pivot ngược chiều trước đó ≥ `minSwingAtr × atr[index]` (ATR **tại nến pivot**, không dùng giá trị sau), hai pivot cùng loại liền nhau giữ cái cực hơn → chuỗi luân phiên.
- `fitLine(points: Array<{ x: number; y: number }>): { slope: number; intercept: number; at(x: number): number }` — bình phương tối thiểu; ném lỗi nếu < 2 điểm hoặc mọi x trùng nhau.
- `minSwingAtr` theo khung: 4H/1D = 0,75; 15m/1H = 1,0 (config).

- [ ] Tests trước (chuỗi luân phiên; pivot nhỏ bị lọc; ATR lấy tại nến pivot — đổi ATR ở nến SAU không đổi kết quả; fitLine đúng với điểm thẳng hàng; ném lỗi đúng ca) → FAIL → code → `npm test && npm run typecheck` PASS → commit `feat(core): lọc pivot theo biên độ và hình học cho mô hình`.

### Task 2: Nhận diện chữ nhật/vùng đi ngang và hai đỉnh/hai đáy

**Files:** Create `packages/core/patterns/detect-range.ts`, `packages/core/patterns/detect-double.ts`, tests.

**Interfaces:**
- `type PatternKind = 'rectangle' | 'double_top' | 'double_bottom' | 'asc_triangle' | 'desc_triangle' | 'sym_triangle' | 'bull_flag' | 'bear_flag' | 'head_shoulders' | 'inv_head_shoulders' | 'multi_month_range'`
- `type PatternGeometry = { kind: PatternKind; timeframe: string; pivots: Pivot[]; startIndex: number; endIndex: number; upper: (i: number) => number; lower: (i: number) => number; breakoutSide: 'up' | 'down' | 'both'; height: number; stopRef: { up: number; down: number }; quality: number; notes: string[] }`
- `detectRectangles(c, pivots, atr): PatternGeometry[]`, `detectDoubles(c, pivots, atr): PatternGeometry[]` — theo đúng bảng mục (2) báo cáo (dung sai theo A, thời lượng, chiều cao, mức cắt lỗ trước đệm). Ba đỉnh/ba đáy gộp vào chữ nhật.
- [ ] Tests với chuỗi nến dựng tay cho từng ca hợp lệ/không hợp lệ (biên lệch quá dung sai, chiều cao < 3×A, thời lượng ngắn, hai đỉnh quá gần nhau) + bài kiểm toàn bộ = tăng dần → FAIL → code → PASS → commit `feat(core): nhận diện chữ nhật và hai đỉnh/hai đáy`.

### Task 3: Nhận diện tam giác và cờ/cờ đuôi nheo

**Files:** Create `packages/core/patterns/detect-triangle.ts`, `packages/core/patterns/detect-flag.ts`, tests.
- Tam giác: đường bình phương tối thiểu qua pivot cùng loại, ≥3 pivot một cạnh và ≥2 cạnh kia, phẳng khi |độ dốc| ≤ 0,03×A/nến, hội tụ ≥30%, apex 0,5–3 lần chiều dài, không close nào vượt đường > 0,25×A bên trong, ≥15 nến (bảng mục (2)).
- Cờ: cán ≥3×A trong ≤15 nến; cờ rộng ≤0,5 cán, cao ≤0,5 cán; không nến vượt tip; ≥5 nến từ tip; ≤20 nến; đường không gồm nến hiện tại.
- [ ] Tests mỗi biến thể (tăng/giảm/cân; cờ tăng/giảm; ca vỡ điều kiện) + toàn bộ = tăng dần → commit `feat(core): nhận diện tam giác và cờ`.

### Task 4: Bối cảnh — vai-đầu-vai, vùng nhiều tháng (1D), cờ “coil”

**Files:** Create `packages/core/patterns/detect-hs.ts`, `packages/core/patterns/context.ts`, tests.
- Vai-đầu-vai (và ngược) theo bảng mục (2) (vai lệch ≤0,75×A, tỉ lệ vai/đầu 0,25–0,7, đầu − neckline ≥1,5×A, đối xứng thời gian ≤2,5, ≥3/5 pivot đúng phía EMA200).
- Vùng nhiều tháng trên 1D: ≥3 chạm mỗi biên, ≥60 nến; xác nhận phá khi đóng 1D ngoài biên ≥0,5×A(1D) hoặc 2 nến 1D liên tiếp ngoài biên.
- Coil: ≥2/3 của BBW(20,2) ≤ phân vị 10% của 125 nến; NR7 hoặc NR4; ATR14/ATR100 ≤ 0,7.
- `contextFlags(...)` trả: `{ hs: …|null, multiMonth: { upper, lower, state } | null, coil: boolean, notes: string[] }`. Quy tắc dùng: cấm Long ngay dưới biên trên vùng nhiều tháng chưa phá (trong 1×A(1D)), cấm Short ngay trên biên dưới; vai-đầu-vai đỉnh đã xác nhận → chặn Long mới trên hợp đồng đó (ngược lại cho Short).
- [ ] Tests + toàn bộ = tăng dần → commit `feat(core): bối cảnh vai-đầu-vai, vùng nhiều tháng, coil`.

### Task 5: Máy trạng thái phá vỡ (chạy lại từ nến đã đóng)

**Files:** Create `packages/core/patterns/state.ts`, test.
- `type PatternState = 'forming' | 'armed' | 'breakout_pending' | 'breakout' | 'retested' | 'failed' | 'expired' | 'invalidated'`
- `evaluateState(g: PatternGeometry, c: Candle[], atr: number[], tf: string): { state: PatternState; breakoutIndex: number | null; side: 'up'|'down'|null; breakoutLine: number | null; distanceAtr: number | null; retest: 'none'|'yes'|null; notes: string[] }` — theo bảng máy trạng thái và ngưỡng xác nhận mục (2) (≥0,25×A cho 1D/4H, ≥0,5×A cho 1H/15m; pending cần thêm 1 nến; retest trong 10 nến ±0,5×A; failed khi đóng quay vào >0,5×A; expired theo từng loại). Volume ≥1,5×SMA20 chỉ thêm ghi chú “dự kiến retest cao”.
- [ ] Tests mỗi chuyển trạng thái + toàn bộ = tăng dần → commit `feat(core): máy trạng thái phá vỡ mô hình`.

### Task 6: Kế hoạch lệnh theo mô hình

**Files:** Modify `packages/core/plan.ts` (hoặc Create `packages/core/patterns/pattern-plan.ts` dùng lại hàm khối lượng/thanh lý/làm tròn/bảng giá khớp sẵn có — không nhân bản), tests.
- Chỉ cho trạng thái `breakout` (và `retested` còn trong hạn). SL = `stopRef` + đệm 0,25–0,5×A (config), đẩy qua số tròn; **bỏ nếu R > 3×A**.
- TP theo mục (3): T_ngắn = đường phá ± h×p (p theo loại: tam giác tăng 0,70, hai đáy 0,73, vai-đầu-vai 0,51, mặc định 0,5); T_đủ = đường phá ± h (cờ: cán × 0,46 cộng vào đáy cờ; T_ngắn = nửa mức đó). TP1 = gần hơn giữa vùng S/R đầu tiên và T_ngắn; TP2 = vùng gần T_đủ ở phía trước; TP3 = vùng kế tiếp hoặc trailing. TP1 ≥ 1R sau phí + funding (cờ ≥ 1,5R). T_đủ nằm sau biên vùng nhiều tháng chưa phá → TP2 = biên đó, bỏ TP3. Không dùng Fibonacci.
- Kiểu vào theo bảng mục (4) với d = khoảng cách giá đóng nến phá tới đường phá: ≤1×A trực tiếp 100%; 1–2×A 50% trực tiếp + 50% limit tại đường phá ± 0,25×A (hạn 10 nến hoặc hủy khi chạm TP1 trước — chỉ khi TP1 ở phía trước giá hiện tại); >2×A chỉ limit 50% khối lượng; biên độ nến >3×A(1H) → chờ thêm 1 nến. Short theo mô hình đảo chiều (hai đỉnh, vai-đầu-vai) không vào trực tiếp trong 30 ngày sau khi BTC lấy lại SMA200 ngày.
- **Sau TP1:** nếu giá vào cách đường phá < 0,5×A → SL về đường phá − 0,5×A (Short: + 0,5×A); ngược lại → SL về giá khớp thật. In rõ câu tương ứng.
- Giá vào không được nằm trong vùng S/R (luật 1b); giá in theo tick; bảng khối lượng theo giá khớp và chia 50/30/20 như 1b.
- [ ] Tests (từng loại mô hình; 3 nhánh d; luật sau TP1; R > 3×A bị bỏ; cờ 1,5R; biên vùng nhiều tháng chặn TP3; Short đối xứng) → commit `feat(core): kế hoạch lệnh theo mô hình biểu đồ`.

### Task 7: Nối vào phân tích + máy quét + chạy thật + biên nhận

**Files:** Modify `packages/core/analyze.ts`, `packages/core/gates.ts`, `packages/core/rules.ts`, `scanner/scan.ts`, `scanner/plan-print.ts`, spec; Create `docs/verification/ke-hoach-1c-2026-10-19.md`.
- Cổng **P-G1** (phạm vi coin, xem trên) và **P-G2** (thuận xu hướng: mô hình Swing 4H chỉ khi hướng phá cùng chiều xu hướng 1D theo S-01/chế độ thị trường; tam giác cân phá xuống trong thị trường Lên → không Short; hai đỉnh Short chỉ khi 1D đã đóng dưới SMA20 và không trong 30 ngày sau khi BTC lấy lại SMA200). Thêm mã vào `RULES` (mức căn cứ theo báo cáo).
- Bối cảnh (Task 4) áp lên **mọi** tín hiệu của hợp đồng trong phạm vi: chặn Long/Short theo quy tắc Task 4, ghi lý do.
- `Analysis` thêm `patterns: Array<{ kind, timeframe, state, notes }>` và `patternSignal` (kế hoạch mô hình nếu có). Một hợp đồng × chế độ chỉ một tín hiệu: nếu cả tín hiệu vùng thường và tín hiệu mô hình cùng hợp lệ cùng chiều → ưu tiên tín hiệu mô hình, ghi chú; ngược chiều → không phát cả hai, ghi “xung đột”.
- Lướt nhanh: chạy nhận diện trên 1H/15m nhưng **không** cho nhãn “Đạt” từ mô hình (ẩn), chỉ ghi vào `patterns`.
- In: khối “Mô hình đang theo dõi” (loại, khung, trạng thái, đường phá, chiều cao) cho hợp đồng trong phạm vi; kế hoạch mô hình in như 1b + dòng “Sau TP1 → SL về …”.
- Chạy thật `npm run scan -- --mode swing` (đầy đủ) và `--mode fast`; kiểm hợp lý; đối chiếu bằng `curl` một mô hình phát hiện được (các pivot cấu thành có trong dữ liệu thô); biên nhận số thật + phần ngoài phạm vi; cập nhật spec.
- [ ] Commit `feat: nối mô hình biểu đồ vào phân tích và máy quét; docs: biên nhận kế hoạch 1c`.

### Task 8: Hạng A — chỉ hiện lệnh chất lượng cao (người dùng yêu cầu 19/10/2026)

Người dùng: “Tôi cần điểm vào đẹp, khả năng xu hướng tốt, tỉ lệ thắng cao. Có thể ít lệnh hơn bình thường.”

**Files:** Create `packages/core/grade.ts` + test; Modify `analyze.ts`, `rules.ts`, `config.ts` (`COMMON.gradeA`), `scanner/plan-print.ts`, `scanner/scan.ts`, spec.

- `gradeSignal(a: Analysis): { grade: 'A' | 'B'; failed: string[] }` — chỉ tính cho tín hiệu đã “Đạt tiêu chí”. **Hạng A** khi đạt TẤT CẢ (ngưỡng trong config, “đề xuất, chưa backtest”):
  1. **Xu hướng đồng thuận nhiều khung:** chế độ thị trường cùng chiều lệnh (không ngược xu hướng); khung xu hướng (1D/1H) và khung vào lệnh (4H/15m) cùng chiều (giá và SMA20 > SMA50 cùng phía); với Swing thêm BTC 1D cùng chiều.
  2. **Điểm cao:** điểm ≥ 80.
  3. **Điểm vào đẹp:** SL đặt sau vùng có độ mạnh ≥ 3 (có pivot khung lớn hoặc ≥ 3 lần chạm); giá vào cách mép vùng ≤ 0,5×ATR (market) hoặc là limit tại mép vùng; KHÔNG có vùng cản nào giữa giá vào và TP1.
  4. **Tỉ lệ lời/lỗ:** TP1 ≥ 1,5R sau phí + funding.
  5. **Rủi ro coin:** mức rủi ro Thấp/Vừa; funding không bất lợi (không bật F-01); cầu dao tắt; ngoài cửa sổ sự kiện.
  6. **Hợp lưu (ít nhất 1):** tín hiệu mô hình ở trạng thái `breakout`/`retested`, HOẶC dòng tiền taker cùng chiều (thành phần S-02 ≥ 70% điểm tối đa), HOẶC cờ “coil” vừa bung theo chiều lệnh.
- Mặc định máy quét **chỉ in kế hoạch Hạng A**; tín hiệu Hạng B in ở danh sách ngắn “Hạng B (không đủ: …)” kèm tiêu chí trượt, không in kế hoạch chi tiết (cờ `--show-b` để in đủ).
- Ghi rõ trên đầu khối Hạng A: “Hạng A là tiêu chí lọc chặt, KHÔNG phải xác suất thắng. Tỉ lệ thắng thực sẽ đo ở sổ tín hiệu/backtest.”
- [ ] Tests mỗi tiêu chí (đạt/trượt), Short đối xứng, thứ tự in → commit `feat: hạng A cho tín hiệu chất lượng cao`.
- [ ] Chạy thật hai chế độ; ghi số Hạng A / Hạng B vào biên nhận 1c (có thể là 0 — nói thẳng).
