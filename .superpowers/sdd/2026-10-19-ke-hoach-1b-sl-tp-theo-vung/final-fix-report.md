# Báo cáo sửa 4 lỗi "phải sửa trước khi merge"

- 1.1 plan.ts: điều kiện "hoặc giá chạm TP1 trước" chỉ in khi TP1 nằm hẳn phía lợi nhuận so với giá thị trường (Long TP1 > giá; Short TP1 < giá). Test Long, Short (TP1 sai phía) và Short (TP1 đúng phía).
- 1.2 plan-print.ts: LƯU Ý trailing theo phía lệnh ("dưới giá cao nhất" / "trên giá thấp nhất"). Test Short và Long.
- 1.3 plan.ts: thêm `estLoss` = qty × |vào − SL| + phí; qty = 0 → valid=false với lý do đã định (G-12 chặn). plan-print in "Tiền mất ước tính nếu chạm SL" (kèm ngân sách rủi ro).
- 1.4 plan.ts: `splitQuantity` + `Target.qty`; phần có TP mà qty = 0 → không hợp lệ. plan-print in "= N coin" cho mọi TP, phần trailing vẫn ghi trailing. Test 29→14/8/7, 2→có phần 0 (invalid), 0,033→0,016/0,009/0,008.
- Test cũ plan-print.test.ts cập nhật theo định dạng in mới.

Kết quả: npm test 174/174, typecheck sạch.

## Chạy thật swing --limit 60
    TIAUSDT — LONG | điểm 75,9 | rủi ro Rất cao
      Kiểu vào lệnh: VÀO TRỰC TIẾP — Giá đang sát vùng hỗ trợ 0,6083–0,6501 (đỉnh 4H ×3, đỉnh 1D ×3, đáy 4H ×1, số tròn 0,6100) — vào trực tiếp, không mua cao hơn 0,6262
      Giá hiện tại: 0,6143 | Vùng giá vào: 0,6143–0,6262 | Giá vào dùng để tính: 0,6143
      SL: 0,5320 — Dưới vùng hỗ trợ 0,6083–0,6501 (đỉnh 4H ×3, đỉnh 1D ×3, đáy 4H ×1, số tròn 0,6100) − 0,3×ATR = 0,5963; nới tới tối thiểu 1×ATR ngày = 0,5404; đẩy qua số tròn 0,5400 = 0,5320
      TP1: 0,7610 chốt 50% = 14 coin | 1,78R — Trước vùng cản 0,7690 (đỉnh 4H ×1, số tròn 0,7700)
      TP2: chốt 30% = 8 coin — trailing stop: cách giá cao nhất 3×ATR = 0,1196 (19,5%) — Không còn vùng cản — phần này để trailing stop (3×ATR)
      TP3: chốt 20% = 7 coin — trailing stop: cách giá cao nhất 3×ATR = 0,1196 (19,5%) — Không còn vùng cản — phần này để trailing stop (3×ATR)
      Đạt TP1 → dời SL về giá vào 0,6143 (giữ nguyên sau TP2)
      LƯU Ý: lệnh trailing stop của Binance chỉ nhận callbackRate tối đa 10% (khoảng cách này là 19,5%) → không đặt được nguyên văn, hãy tự dời SL thủ công theo 0,1196 dưới giá cao nhất.
      Khối lượng: 29 (≈ 17,81 USDT) | Đòn bẩy gợi ý: 3x | Giá thanh lý ước tính: 0,4157
      Tiền mất ước tính nếu chạm SL: 2,43 USDT (đã gồm phí ước tính; ngân sách rủi ro 0,25% vốn = 2,50 USDT)

## Chạy thật fast
    QUSDT — LONG | điểm 96,3 | rủi ro Cao
      Kiểu vào lệnh: ĐẶT LIMIT CHỜ HỒI về 0,153777, hết hạn sau 2 giờ — Giá đã chạy xa vùng hỗ trợ 2,4×ATR — đặt limit 0,153777 chờ hồi về vùng 0,152888 (đỉnh 15M ×1, đỉnh 1H ×1); hủy nếu sau 2 giờ chưa khớp
      Giá hiện tại: 0,173839 | Vùng giá vào: 0,152888–0,153777 | Giá vào dùng để tính: 0,153777
      SL: 0,148221 — Dưới vùng hỗ trợ 0,152888 (đỉnh 15M ×1, đỉnh 1H ×1) − 0,3×ATR = 0,150219; đẩy qua số tròn 0,150000 = 0,148221
      Không có vùng cản phía trên → không có TP cố định; toàn bộ vị thế theo trailing stop: cách giá cao nhất 3×ATR = 0,026682 (17,4%)
      LƯU Ý: lệnh trailing stop của Binance chỉ nhận callbackRate tối đa 10% (khoảng cách này là 17,4%) → không đặt được nguyên văn, hãy tự dời SL thủ công theo 0,026682 dưới giá cao nhất.
      Khối lượng: 420 (≈ 64,59 USDT) | Đòn bẩy gợi ý: 10x | Giá thanh lý ước tính: 0,139937
      Tiền mất ước tính nếu chạm SL: 2,49 USDT (đã gồm phí ước tính; ngân sách rủi ro 0,25% vốn = 2,50 USDT)

Ghi chú: fast QUSDT không có TP cố định (đi nhánh trailing toàn bộ), nên nhánh chia 50/30/20 chỉ được kiểm bằng swing TIAUSDT và test. Chưa có lần chạy thật nào ra kế hoạch Short.


# Đợt 2 — quyết định người dùng

- 2.1 `zones.ts`: `stopSideZones` chỉ lấy vùng nằm hẳn một phía (Long: high < giá; Short: low > giá); thêm `zoneContaining`. `plan.ts`: giá trong bất kỳ vùng nào (kể cả đúng mép) → valid=false, "Giá đang nằm trong vùng <vùng> — chờ giá thoát hẳn khỏi vùng"; limit có giá nằm trong vùng → "Giá limit X nằm trong vùng …".
- 2.2 `plan.ts`: `TradePlan.fillTable: FillRow[]` (label, fill, qty, q[3], estLoss); market 3 dòng (giá hiện tại / giữa / giá tối đa), limit 1 dòng. Giá tối đa bị hạ (Long) / nâng (Short) về f = (TP1 + 1×SL)/2 làm tròn về phía an toàn nếu ở đó TP1 < 1R, entryReason ghi rõ. Kiểm hợp lệ qty/chia 50/30/20 vẫn chỉ trên dòng đầu. `plan-print.ts`: in bảng + "Đạt TP1 → dời SL về đúng giá KHỚP THẬT của anh".
- Test: 186/186 (thêm 12), typecheck sạch. Trước khi sửa: plan-print và các test mới FAIL như dự kiến.
- Quét thật: swing 0 Đạt / Theo dõi 387 / Không đạt 136; fast 1 Đạt Long (QUSDT, limit) / 68 / 81. Không có 418/429. Chi tiết trong docs/verification/ke-hoach-1b-2026-10-19.md mục 8.
- Quan sát: giá nằm trong vùng chiếm 319/508 ca trượt G-12 (swing), 95/141 (fast) → rất ít lệnh. Nhánh bảng 3 dòng/hạ giá tối đa chưa có mẫu thật, chỉ có test.

## Đợt 3

**Thay đổi.** `packages/core/plan.ts`: sau khi dòng đầu hợp lệ, kiểm MỌI dòng bảng khối lượng (lệnh market) cùng luật: qty > 0 và mọi phần có giá TP phải ≥ 1 bước. Dòng hỏng bị bỏ; `maxEntry` (và đầu mút `entryZone`) hạ/nâng về giá khớp của dòng hợp lệ cuối, làm tròn tick phía an toàn; `entryReason` thêm "giá tối đa hạ xuống/nâng lên … vì khối lượng không chia được 50/30/20 ở giá khớp xấu hơn". Dòng đầu hỏng thì vẫn không hợp lệ như cũ. `scanner/plan-print.ts`: phần trailing bằng 0 không in "= 0 coin" nữa mà in "gộp vào TP3" (cả dòng TP lẫn bảng).

**RED** (trước khi sửa): tests 192, pass 187, fail 5 (3.1 Long 1480, 3.1 Short 1490, 3.1 toàn trailing 370 Long/380 Short, 3.2 in phần gộp).

**GREEN**: tests 192, pass 192, fail 0; `npm run typecheck` sạch.

**Chạy thật**: `npm run scan -- --mode fast` thoát 0, không 418/429; dòng bảng thật: `Khớp 0,154176 (limit): 451 coin = TP1 225 / TP2 135 / TP3 91 | mất ước tính 2,50 USDT`.
