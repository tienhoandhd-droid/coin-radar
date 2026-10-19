# Khóa luật — mô phỏng mù 30 ngày

Khóa lúc 2026-10-20 (giờ máy), trước mọi lần chạy kỳ mù B = [2026-09-19T00:00Z, 2026-10-19T00:00Z).
Mọi phân tích và điều chỉnh trước đó chỉ dùng kỳ phát triển D = [2026-06-21, 2026-09-19); nhật ký: `docs/verification/nhat-ky-thu.md` (16 lần thử).

Luật đã khóa = mã ở commit `621cb34717ad2e319f2216aa76ee62ab66345a24` + mặc định `packages/core/config.ts` (configHash bên dưới) + ghi đè của từng ứng viên
(dựng bằng `stackRun` của `backtest/experiment.ts`, như trên D). Vốn 10 000 USDT, rủi ro 2%/lệnh, ≤ 10 lệnh còn rủi ro, ≤ 10% tổng rủi ro, cầu chì
như người dùng chốt (mô phỏng: dừng 24 giờ). Lọc "mọi Đạt" (Hạng A gần như không có lệnh trên D).

## Ứng viên (đăng ký trước)

1. `swing-goc` — Swing, luật hiện tại + sửa định cỡ F1. Đối chứng.
2. `swing-combo` — Swing, F1 + combo-loc (#4 bỏ Đi ngang, #7 top 150 & Long RS ≥ trung vị, #5 Short chặt, #8 funding phân vị 70%). Ứng viên chính.
   Trên D: 27 lệnh, +0,254R [−0,161; 0,772], +8,62%, PF 1,50, DD 6,51% — chọn sau 14 lần thử nên rủi ro quá khớp cao.
3. `fast-4h` — Lướt nhanh khung 4H/1H + F1. Kiểm khuyến nghị tắt Lướt nhanh. Trên D: −0,227R, −18,6%.

## Tiêu chí (viết trước khi chạy)

- `swing-combo` được coi là **đứng vững trên B** nếu cả ba: kỳ vọng R > 0, tổng lãi > 0, profit factor > 1. Với ~30 ngày, số lệnh ít — kết quả B
  chỉ là bằng chứng bổ sung, KHÔNG đủ để đánh tiền thật; cần paper/Demo ≥ 100 lệnh và ≥ 4 tuần như lộ trình đã thống nhất.
- `swing-combo` hơn `swing-goc` về kỳ vọng R và tổng lãi → ủng hộ đề xuất bật combo-loc cho bot (người dùng quyết).
- `fast-4h` kỳ vọng R ≤ 0 → giữ đề xuất tắt Lướt nhanh cho bot.
- Ràng buộc cứng: không lệnh nào lỗ thật > 2% vốn (gồm trượt giá, gap, funding). Có vi phạm → báo và sửa định cỡ, kết quả B vẫn giữ nguyên.
- Kết quả B không được dùng để chỉnh tiếp. Mọi chỉnh sửa sau này phải ghi "sau khi xem B".

```json lock
{
  "lockedCommit": "621cb34717ad2e319f2216aa76ee62ab66345a24",
  "configHash": "b9e532a707e6c43787c72c609a084488d48bb38a30a442ecfab81873e9ccbece",
  "capital": 10000,
  "pauseHours": 24,
  "criteria": "swing-combo đứng vững nếu kỳ vọng R > 0, tổng lãi > 0, PF > 1 trên B; so với swing-goc về kỳ vọng R và tổng lãi; fast-4h kỳ vọng R <= 0 thì giữ đề xuất tắt Lướt nhanh; không lệnh nào lỗ thật > 2% vốn; B không dùng để chỉnh tiếp.",
  "candidates": [
    { "id": "swing-goc", "mode": "swing", "filter": "all", "policy": "C2", "variant": "f1-funding-fix", "base": "baseline" },
    { "id": "swing-combo", "mode": "swing", "filter": "all", "policy": "C2", "variant": "combo-loc", "base": "f1-funding-fix" },
    { "id": "fast-4h", "mode": "fast", "filter": "all", "policy": "C2", "variant": "p2-fast-4h", "base": "f1-funding-fix" }
  ]
}
```
