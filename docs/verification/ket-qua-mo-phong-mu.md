# Kết quả mô phỏng mù 30 ngày (biên nhận)

Chạy ngày 2026-10-20 theo `docs/verification/khoa-luat-mo-phong-mu.md` (commit khóa `621cb34`, configHash `b9e532a7…ccbece`,
sha256 tệp khóa `406ccd6ea85e02aa…`). Kỳ B = [2026-09-19, 2026-10-19). Vốn 10 000 USDT, rủi ro 2%/lệnh, lọc "mọi Đạt", thoát C2.
Lệnh: `npm run blind -- --lock docs/verification/khoa-luat-mo-phong-mu.md`. Kết quả thô: `output/blind/<id>/` (không commit).

Sự cố: `fast-4h` đổ lần đầu vì Node hết bộ nhớ heap (“JavaScript heap out of memory”, mã 134) — sự cố hạ tầng; chạy lại đúng ứng viên đó
bằng `--rerun-after-crash fast-4h` với `NODE_OPTIONS=--max-old-space-size=4500`, cùng commit và cùng tệp khóa (cờ chạy lại ghi trong summary.json).

| Ứng viên | Lệnh (L/S) | Kỳ vọng R [CI95 iid] [CI95 khối ngày] | Tổng lãi % | PF | DD % | Chuỗi thua | Thắng % | Lỗ thật tệ nhất % vốn | > 2% |
|---|---|---|---|---|---|---|---|---|---|
| swing-goc | 52 (52/0) | −0,122 [−0,444; 0,226] [−0,546; 0,285] | −4,90 | 0,85 | 17,04 | 9 | 34,6 | −1,918 | 0 |
| swing-combo | 28 (28/0) | −0,034 [−0,452; 0,437] [−0,482; 0,419] | −3,13 | 0,88 | 14,03 | 5 | 42,9 | −1,919 | 0 |
| fast-4h | 118 (117/1) | −0,283 [−0,493; −0,064] [−0,511; −0,027] | −15,17 | 0,76 | 25,67 | 12 | 23,7 | −1,992 | 0 |

Theo tiêu chí viết trước: `swing-combo` KHÔNG đứng vững (kỳ vọng R < 0, tổng lãi < 0, PF < 1), dù tốt hơn `swing-goc` ở mọi chỉ số;
`fast-4h` kỳ vọng R < 0 (cả khoảng tin cậy âm) → giữ đề xuất tắt Lướt nhanh; không lệnh nào lỗ thật > 2% vốn.
Kết quả B không dùng để chỉnh tiếp.
