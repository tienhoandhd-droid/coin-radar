# Kế hoạch 1b — SL/TP theo vùng hỗ trợ/kháng cự, chốt 50/30/20

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đặt SL ngay sau vùng hỗ trợ (Long) / kháng cự (Short) đủ mạnh, đặt TP1/TP2/TP3 ngay trước 3 vùng cản kế tiếp, chốt 50% / 30% / 20%, sau TP1 dời SL về giá vào; mỗi mức giá có lý do; loại hợp đồng chỉ số.

**Architecture:** Thêm `packages/core/zones.ts` (hàm thuần dựng vùng từ đỉnh/đáy đã xác nhận của khung vào lệnh + khung xu hướng, gộp theo ATR, cộng điểm số tròn và khối lượng). `plan.ts` dùng vùng thay cho `nearestLevels` và bội số R cố định. `analyze`/`score`/`gates` nối vào; cổng mới G-12. `parse.ts` lọc `underlyingType === 'COIN'`.

**Tech Stack:** Như kế hoạch 1 (Node 24 type stripping, `node --test`, TypeScript 6.0.3 typecheck). Không thêm thư viện.

**Người dùng duyệt 19/10/2026:** SL/TP phải đặt đúng vùng hỗ trợ/cản, không đặt bừa; SL được phép xa (cổng G-11 vẫn giữ); TP1 chốt 50%, TP2 30%, TP3 (khó đạt nhất) 20%; đạt TP1 thì SL = giá vào; sau TP2 giữ SL ở giá vào (người dùng không yêu cầu dời thêm); loại hợp đồng chỉ số; chấp nhận sửa nhiều file.

## Global Constraints

- Ngôn ngữ giao diện/console/tài liệu: tiếng Việt. Tên biến/hàm: tiếng Anh.
- Không thêm thư viện. Import nội bộ dùng đuôi `.ts`; chỉ cú pháp TS xóa được (không `enum`, `namespace`, parameter properties).
- Không nuốt lỗi: cấm `catch {}` rỗng; không trả NaN/Infinity im lặng.
- Chỉ dùng nến đã đóng.
- Mọi ngưỡng số trong `packages/core/config.ts`, chú thích “đề xuất, chưa backtest”.
- `packages/core` và `packages/binance` phải chạy được trên trình duyệt (không API riêng của Node).
- Không commit `output/`. Commit: `-c user.name="Tào Tiến Hoàn" -c user.email="tienhoan.dhd@gmail.com"`, trailer đúng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Kiểm: `npm test`, `npm run typecheck`. Mỗi commit phải qua typecheck.

## Tham số mới (thêm vào `COMMON` trong `config.ts`)

```ts
  // Vùng hỗ trợ/kháng cự — ĐỀ XUẤT, CHƯA BACKTEST
  zones: {
    entryWeight: 1,        // mỗi đỉnh/đáy khung vào lệnh
    trendWeight: 2,        // mỗi đỉnh/đáy khung xu hướng (khung lớn mạnh hơn)
    mergeAtr: 0.5,         // gộp các mức cách nhau ≤ 0,5×ATR khung vào lệnh
    maxWidthAtr: 1.5,      // một vùng rộng tối đa 1,5×ATR
    roundBonus: 0.5,       // vùng chứa số tròn
    volumeBonus: 1,        // vùng thuộc nhóm 25% khối lượng giao dịch cao nhất
    minSlStrength: 2,      // vùng dùng để đặt SL phải có độ mạnh ≥ 2
    slBufferAtr: 0.3,      // SL nằm ngoài mép vùng 0,3×ATR
    tpBufferAtr: 0.2,      // TP đặt trước mép vùng cản 0,2×ATR
    minTp1R: 1,            // TP1 phải lời ≥ 1R, nếu không bỏ lệnh
    exitPcts: [50, 30, 20],// TP1 / TP2 / TP3 (% vị thế) — người dùng chốt 19/10/2026
    directEntryMaxAtr: 0.5,// giá cách mép vùng hỗ trợ (Long) ≤ 0,5×ATR → vào trực tiếp; xa hơn → đặt limit chờ hồi
    limitBufferAtr: 0.1,   // giá limit = mép trên vùng hỗ trợ + 0,1×ATR (Short: mép dưới vùng kháng cự − 0,1×ATR)
    limitExpiryBars: { fast: 8, swing: 6 }, // limit hết hiệu lực sau 8 nến 15m (2h) / 6 nến 4H (24h)
  },
```

Bỏ `CONFIG[mode].tp1R` (không còn dùng). Giữ `stopAtrMult`, `pivotBufferAtr` chỉ nếu còn chỗ dùng — nếu không, xóa và cập nhật test cũ tương ứng.

---

### Task 1: Dựng vùng hỗ trợ/kháng cự (`zones.ts`) + loại hợp đồng chỉ số

**Files:**
- Create: `packages/core/zones.ts`, `packages/core/zones.test.ts`
- Modify: `packages/core/config.ts` (thêm `COMMON.zones`), `packages/binance/parse.ts` + `packages/binance/parse.test.ts` (lọc `underlyingType`)

**Interfaces:**
- Consumes: `pivotHighs`, `pivotLows` (`indicators.ts`), `roundStep` (`plan.ts` — nếu tạo vòng import thì chuyển `roundStep` sang `indicators.ts` và re-export từ `plan.ts`), `COMMON.pivotConfirmBars`.
- Produces:
  - `type Zone = { low: number; high: number; strength: number; touches: number; sources: string[] }`
  - `findZones(a: { entry: Candle[]; trend: Candle[]; entryLabel: string; trendLabel: string; atr: number }): Zone[]` — sắp theo `low` tăng dần; ném lỗi nếu ATR không hữu hạn hoặc ≤ 0.
  - `stopSideZones(zones: Zone[], price: number, side: Side): Zone[]` — Long: vùng có `low < price` (gồm vùng đang chứa giá), sắp theo `high` giảm dần; Short: vùng có `high > price`, sắp theo `low` tăng dần.
  - `targetSideZones(zones: Zone[], price: number, side: Side): Zone[]` — Long: vùng có `low > price`, sắp `low` tăng; Short: vùng có `high < price`, sắp `high` giảm.
  - `describeZone(z: Zone): string` — ví dụ `"0,0560–0,0572 (đáy 4H ×3, đáy 1D ×1, số tròn 0,057)"`.

Thuật toán `findZones`:
1. Lấy mọi đỉnh và đáy đã xác nhận (`COMMON.pivotConfirmBars` nến mỗi bên) của `entry` (trọng số `entryWeight`, nhãn `đỉnh/đáy ${entryLabel}`) và `trend` (trọng số `trendWeight`).
2. Sắp theo giá. Duyệt tuần tự: điểm mới thuộc vùng hiện tại nếu cách điểm liền trước ≤ `mergeAtr×atr` **và** cách điểm đầu vùng ≤ `maxWidthAtr×atr`; ngược lại mở vùng mới.
3. Mỗi vùng: `low`/`high` = giá nhỏ/lớn nhất; `touches` = số điểm; `strength` = tổng trọng số; `sources` = đếm theo nhãn (`"đáy 4H ×3"`).
4. Số tròn: với `step = roundStep((low+high)/2)`, nếu có bội số của `step` nằm trong `[low − 0,1×atr, high + 0,1×atr]` → `strength += roundBonus`, thêm nguồn `số tròn X`.
5. Khối lượng: với mỗi vùng, cộng `quoteVolume` các nến `entry` có `[low, high]` giao vùng; nếu có ≥ 4 vùng và vùng thuộc tứ phân vị trên (≥ phân vị 75%) → `strength += volumeBonus`, thêm nguồn `khối lượng giao dịch cao`.

- [ ] **Step 1: Viết test thất bại** (`zones.test.ts`) — mỗi ca tự dựng nến bằng helper `candle(i, high, low)`; dùng `.find` theo khoảng giá để không phụ thuộc thứ tự:
  1. Hai đáy khung vào lệnh ở 100,0 và 100,3, ATR = 1 → **một** vùng `low=100`, `high=100.3`, `touches=2`, `strength ≥ 2`.
  2. Hai đáy ở 100 và 103, ATR = 1 → **hai** vùng riêng.
  3. Chuỗi đáy 100; 100,4; 100,8; 101,2; 101,6 (mỗi bước ≤ 0,5 ATR) → vùng bị cắt khi rộng quá 1,5×ATR (không có vùng nào `high − low > 1.5`).
  4. Một đáy khung xu hướng → `strength` của vùng = 2 (trendWeight), nguồn có nhãn khung xu hướng.
  5. Vùng 99,8–100,1 (giá ~100, `roundStep` = 10 → 100 là số tròn) → nguồn có `số tròn`, `strength` tăng 0,5.
  6. ATR = 0 hoặc NaN → ném lỗi chứa `ATR`.
  7. `stopSideZones`/`targetSideZones`: vùng chứa giá được tính vào phía SL, không vào phía mục tiêu; thứ tự đúng cho Long và Short.
  8. `parseContracts`: hợp đồng `underlyingType: 'INDEX'` bị loại; `'COIN'` giữ (thêm vào `parse.test.ts`; cập nhật fixture cũ có `underlyingType: 'COIN'`).
- [ ] **Step 2:** `npm test` → FAIL (thiếu module / hàm).
- [ ] **Step 3:** Viết `zones.ts`, thêm `COMMON.zones`, lọc trong `parseContracts` (`s.underlyingType === 'COIN'`; thiếu trường → ném lỗi rõ, không âm thầm giữ).
- [ ] **Step 4:** `npm test && npm run typecheck` → PASS.
- [ ] **Step 5:** Commit `feat(core): dựng vùng hỗ trợ/kháng cự và loại hợp đồng chỉ số`.

---

### Task 2: Kế hoạch lệnh theo vùng — SL sau vùng, TP1/TP2/TP3 trước vùng cản, 50/30/20

**Files:**
- Modify: `packages/core/plan.ts`, `packages/core/plan.test.ts`, `packages/core/config.ts`

**Interfaces:**
- Consumes: `Zone`, `findZones`, `stopSideZones`, `targetSideZones`, `describeZone` (Task 1).
- Produces (thay đổi `TradePlan`/`PlanArgs`):
  - `PlanArgs`: bỏ `levels`; thêm `zones: Zone[]`. Giữ các trường khác.
  - `type Target = { name: 'TP1' | 'TP2' | 'TP3'; price: number | null; pct: number; r: number | null; reason: string }` — `price = null` nghĩa là “không còn vùng cản → phần này để trailing stop”.
  - `TradePlan`: bỏ `tp1`; thêm `targets: Target[]` (luôn 3 phần tử, `pct` lấy từ `COMMON.zones.exitPcts`), `stopReason: string`, `afterTp1Stop: number` (= `entry`), `valid: boolean`, `invalidReason: string | null`. Giữ `trailAtr`, khối lượng, đòn bẩy, thanh lý, funding, `riskPct`, thời gian.
  - Hàm tiện ích `tp1R(plan: TradePlan): number | null`.
  - **Kiểu vào lệnh** (người dùng yêu cầu 19/10/2026): `TradePlan` thêm `entryType: 'market' | 'limit'`, `entryZone: { low: number; high: number }`, `limitExpiryHours: number | null`, `entryReason: string`. Trường `entry` là **giá dùng để tính** kế hoạch: giá hiện tại nếu `market`, giá limit nếu `limit`. Thêm `marketPrice` (giá đóng nến gần nhất) để hiển thị.

Quy tắc kiểu vào lệnh (Long; Short đối xứng với vùng kháng cự phía trên):
- `dist = (marketPrice − support.high) / ATR` (giá đang nằm trong vùng hỗ trợ → `dist ≤ 0`).
- `dist ≤ directEntryMaxAtr` → **`market` — vào trực tiếp**: `entry = marketPrice`, `entryZone = { low: max(support.high, stop + 0,5×ATR) , high: maxEntry }` với `maxEntry = marketPrice + maxEntryAtr×ATR` (giữ quy tắc cũ), `limitExpiryHours = null`, `entryReason = "Giá đang sát vùng hỗ trợ <vùng> — vào trực tiếp, không mua cao hơn <maxEntry>"`.
- `dist > directEntryMaxAtr` → **`limit` — đặt lệnh chờ giá hồi**: `entry = support.high + limitBufferAtr×ATR`, `entryZone = { low: support.high, high: entry }`, `limitExpiryHours = limitExpiryBars[mode] × số giờ mỗi nến khung vào lệnh`, `entryReason = "Giá đã chạy xa vùng hỗ trợ <dist>×ATR — đặt limit <entry> chờ hồi về vùng <vùng>; hủy nếu sau <h> giờ chưa khớp hoặc giá chạm TP1 trước"`. SL, TP, R, khối lượng, đòn bẩy, kiểm TP1 ≥ 1R đều tính **từ giá limit** (TP chỉ lấy vùng cản nằm trên giá limit).

Quy tắc (Long; Short đối xứng):
1. `support` = phần tử đầu của `stopSideZones(zones, entry, side)` có `strength ≥ minSlStrength`. Không có → `valid=false`, `invalidReason="Không có vùng hỗ trợ đủ mạnh phía dưới để đặt SL"` (Short: “kháng cự … phía trên”). Các trường số vẫn hữu hạn (dùng ATR làm khoảng tạm) để không lọt NaN, nhưng nhãn sẽ không “Đạt”.
2. `stop = support.low − slBufferAtr×ATR`; nếu sát số tròn (trong `roundNumberProximityAtr×ATR`) thì đẩy qua số tròn (giữ logic hiện có). Swing: khoảng cắt lỗ không nhỏ hơn 1×ATR ngày (giữ quy tắc cũ). `stopReason = "Dưới vùng hỗ trợ " + describeZone(support) + " − 0,3×ATR"`.
3. `R = entry − stop`. Ứng viên TP: duyệt `targetSideZones`, `tp = zone.low − tpBufferAtr×ATR`; bỏ nếu `tp ≤ entry` hoặc `tp ≤` TP trước đó; lấy tối đa 3. `reason = "Trước vùng cản " + describeZone(zone)`, `r = (tp − entry)/R`.
4. Không có vùng cản nào phía trên → cả 3 TP `price=null`, `reason="Không có vùng cản phía trên (giá ở vùng đỉnh mới) — để trailing stop"`, `valid` vẫn có thể true.
5. Có TP1 nhưng `r < minTp1R` → `valid=false`, `invalidReason="Kháng cự đầu tiên quá gần: TP1 chỉ ${r}R < 1R"`.
6. Thiếu TP2/TP3 → `price=null`, `reason="Không còn vùng cản — phần này để trailing stop (3×ATR)"`.
7. `afterTp1Stop = entry`. Khối lượng, đòn bẩy, thanh lý, funding: giữ công thức hiện có (dựa trên `stop`).

- [ ] **Step 1: Viết test thất bại** (`plan.test.ts`, sửa các test cũ dùng `tp1`/`levels`):
  1. Vùng hỗ trợ mạnh 95–96, 3 vùng cản 99–100, 102–103, 106–107, giá hiện tại 96,3 (cách vùng 0,3 ATR → vào trực tiếp), ATR 1 → Long: `entry = 96.3`, `stop = 95 − 0.3 = 94.7` (dựng dữ liệu để không có số tròn trong 0,2×ATR quanh SL, hoặc khẳng định đúng mức sau khi đẩy), R = 1,6, TP1 = 98.8, TP2 = 101.8, TP3 = 105.8; `pct` = 50/30/20; `afterTp1Stop = 96.3`; `valid = true`; mỗi `reason` chứa khoảng giá của vùng. (Đổi số nếu `roundStep` biến 100 thành số tròn ảnh hưởng ca này — giữ đúng ý nghĩa ca.)
  2. Như ca 1 nhưng vùng cản đầu 97–97,5 → TP1 = 96.8 (0,31R < 1R) → `valid=false`, `invalidReason` chứa `quá gần`.
  3. Không có vùng hỗ trợ đủ mạnh → `valid=false`, `invalidReason` chứa `hỗ trợ`; mọi trường số hữu hạn.
  4. Chỉ 1 vùng cản → TP2, TP3 `price=null`, reason chứa `trailing`.
  5. Không có vùng cản → cả 3 TP `null`, `valid=true`.
  6. Short đối xứng ca 1 (SL trên vùng kháng cự, TP dưới các vùng hỗ trợ, giảm dần).
  7. Kiểu vào lệnh: giá 96,2 sát vùng hỗ trợ 95–96 (ATR 1, dist 0,2) → `entryType='market'`, `entry=96.2`; giá 100 (dist 4) → `entryType='limit'`, `entry = 96.1`, `entryZone = {low: 96, high: 96.1}`, R và TP tính từ 96,1, `limitExpiryHours` = 24 (swing) / 2 (fast); Short đối xứng.
  8. Giữ các test cũ còn đúng nghĩa: thanh lý, đòn bẩy an toàn, khối lượng, ATR không hợp lệ ném lỗi, riskPct.
- [ ] **Step 2:** `node --test packages/core/plan.test.ts` → FAIL.
- [ ] **Step 3:** Sửa `plan.ts` theo quy tắc trên; bỏ `nearestLevels` nếu không còn ai dùng (Task 3 sẽ đổi `analyze`; nếu cần giữ để typecheck qua ở commit này, đánh dấu và xóa ở Task 3).
- [ ] **Step 4:** `npm test && npm run typecheck` → PASS (sửa chỗ gọi trong `analyze.ts` ở mức tối thiểu để biên dịch được nếu bắt buộc).
- [ ] **Step 5:** Commit `feat(core): SL sau vùng hỗ trợ/kháng cự, TP1/TP2/TP3 trước vùng cản, chốt 50/30/20`.

---

### Task 3: Nối vào phân tích — S-03, cổng G-12, danh mục nguyên tắc

**Files:**
- Modify: `packages/core/analyze.ts`, `packages/core/score.ts`, `packages/core/gates.ts`, `packages/core/rules.ts` + các file test tương ứng.

**Interfaces:**
- `analyze`: tính `atrEntry`, gọi `findZones({ entry: i.entry, trend: i.trend, entryLabel, trendLabel, atr: atrEntry })` (nhãn theo `CONFIG[mode].entryInterval/trendInterval`, viết hoa: `15M`, `1H`, `4H`, `1D`), truyền `zones` vào `buildPlan` cho cả Long và Short.
- `ScoreInput`: bỏ `nearestLevels`; `scoreSide(input, side, tp1R: number | null)` — S-03: `tp1R === null` (không có vùng cản) → đủ điểm; ngược lại điểm = `w.path × clamp01(tp1R − 1)` (1R → 0, ≥ 2R → đủ). Lý do S-03 ghi TP1 bao nhiêu R và vùng cản nào.
- Cổng **G-12** “SL/TP theo vùng hợp lệ”: `pass = plan.valid`, `note = plan.invalidReason ?? plan.stopReason`. Thêm vào `RULES` (`evidence: 'industry'`, `status: 'active'`, nguồn `reports/Bộ nguyên tắc phân tích coin.md`). Cập nhật `rules.test.ts` danh sách mã.
- `Analysis.plan` chỉ có khi nhãn “Đạt…” (như cũ).

- [ ] **Step 1:** Test thất bại: G-12 trượt khi `plan.valid=false` → không “Đạt”; S-03 với tp1R = 1 → 0 điểm, 2 → đủ, null → đủ; `analyze` trả `plan.targets` 3 phần tử có `pct` 50/30/20; mọi mã lý do/cổng có trong `RULES`.
- [ ] **Step 2:** FAIL. **Step 3:** sửa code; xóa `nearestLevels` nếu không còn dùng. **Step 4:** `npm test && npm run typecheck` PASS.
- [ ] **Step 5:** Commit `feat(core): nối vùng hỗ trợ/kháng cự vào điểm S-03 và cổng G-12`.

---

### Task 4: Máy quét in kế hoạch theo vùng + chạy thật + biên nhận + cập nhật thiết kế

**Files:**
- Modify: `scanner/scan.ts`, `docs/specs/2026-10-19-coin-radar-design.md` (mục 3.8 kế hoạch lệnh: SL/TP theo vùng, 50/30/20, sau TP1 SL = giá vào; G-11 giữ; G-12 mới; loại hợp đồng chỉ số)
- Create: `docs/verification/ke-hoach-1b-2026-10-19.md`

- [ ] **Step 1:** Sau bảng top 10, in khối “Kế hoạch lệnh các hợp đồng Đạt tiêu chí”: mỗi hợp đồng in hướng, điểm, rủi ro, **kiểu vào lệnh** (“VÀO TRỰC TIẾP” hoặc “ĐẶT LIMIT CHỜ HỒI … hết hạn sau … giờ”) kèm `entryReason`, giá hiện tại, vùng giá vào (`entryZone`), giá vào dùng để tính, SL + `stopReason`, TP1/TP2/TP3 (giá, % chốt, R, lý do; `null` in “trailing stop 3×ATR = …”), “Đạt TP1 → dời SL về giá vào …”, khối lượng, đòn bẩy gợi ý, giá thanh lý ước tính, tiền mất nếu chạm SL. Số in theo `tickSize` của hợp đồng.
- [ ] **Step 2:** `npm test && npm run typecheck`; chạy thật `npm run scan -- --mode swing` rồi `--mode fast` (dừng nếu HTTP 418/429).
- [ ] **Step 3:** Kiểm hợp lý: mọi kế hoạch “Đạt” có SL đúng phía, TP tăng dần (Long)/giảm dần (Short), TP1 ≥ 1R, tổng % = 100, `afterTp1Stop = entry`; số hợp đồng chấm = 523 (đã loại 2 chỉ số). Đối chiếu tay 1 hợp đồng: lấy nến bằng `curl` trực tiếp, xác nhận vùng hỗ trợ dưới SL có thật (các đáy ghi trong lý do tồn tại trong dữ liệu).
- [ ] **Step 4:** Viết biên nhận (số thật, phần chưa làm: độ dày sổ lệnh chưa đưa vào; ngưỡng chưa backtest), cập nhật spec.
- [ ] **Step 5:** Commit `feat(scanner): in kế hoạch lệnh theo vùng; docs: biên nhận kế hoạch 1b`.
