# Coin Radar Bot — Thiết kế

Ngày: 19/10/2026 · Trạng thái: chờ người dùng duyệt

## Mục tiêu

Bot tự đặt và quản lý lệnh trên **Binance USDⓈ-M Futures** theo đúng kế hoạch lệnh của `packages/core`, vì
người dùng “không thể canh trừng được”. Chạy thử trên **máy Ubuntu ở nhà** (không bật 24/24), hiệu quả rồi mới
chuyển **VPS châu Á**. Báo mọi sự kiện qua **Telegram**.

Không phải mục tiêu bản này: giao dịch sao chép, viết bài (giai đoạn 6); giao diện web; tối ưu tham số.

## Nguồn

- `reports/Bot giao dịch mã nguồn mở.md` — khuyến nghị hướng lai và **18 yêu cầu R1–R18** (bản này tuân thủ
  toàn bộ; số hiệu R dùng xuyên suốt).
- `docs/reference/binance-usdm-api.md` — tra cứu API chính thức (đang lập; mọi endpoint/tham số trong code phải
  lấy từ đây, không đoán).
- `docs/specs/2026-10-19-coin-radar-design.md` — luật phân tích, kế hoạch lệnh, Hạng A.

## Quyết định chính (đề xuất — người dùng duyệt)

| # | Quyết định | Lý do |
|---|---|---|
| D1 | **Tự xây lớp đặt lệnh bằng TypeScript, không thêm thư viện** | Node 24 có sẵn `fetch`, `WebSocket`, `node:crypto` (HMAC + Ed25519) — đã kiểm trên máy 19/10/2026. Giữ bộ lõi đã có 480+ test; treo được SL **và** 3 TP trên sàn (Freqtrade không làm được TP trên sàn) |
| D2 | **Bộ não = `runScan` hiện có**, bot chỉ là “tay” | Một nguồn sự thật cho luật; backtest, máy quét, bot dùng chung |
| D3 | **Chỉ giao dịch tín hiệu Hạng A, chỉ tín hiệu “MỚI”** | Ưu tiên chất lượng của người dùng; mỗi lần phá/mỗi tín hiệu vào tối đa một lệnh |
| D4 | **Ba chế độ chạy cùng một code:** `paper` (giá thật, khớp giả lập — dùng chung bộ mô phỏng của kế hoạch 2) → `demo` (Binance Demo Trading, API thật, tiền ảo) → `live` (tiền thật) | Paper kiểm **chiến lược**, Demo kiểm **cơ khí** (chữ ký, Algo Order, lỗi, khởi động lại); không thay được nhau |
| D5 | **Lưu trạng thái bằng nhật ký JSON chỉ ghi thêm** (`data/bot/journal-*.jsonl`) + ảnh chụp định kỳ | Không cần cơ sở dữ liệu; đọc được bằng mắt; khôi phục được sau khi tắt máy |
| D6 | **Bộ đối chiếu thuần (pure reconciler):** từ “trạng thái mong muốn” (kế hoạch + các lần khớp) và “trạng thái thật trên sàn” → danh sách hành động | Toàn bộ logic nguy hiểm (thiếu SL, lệnh mồ côi, dời SL) kiểm được bằng test không cần mạng |
| D7 | **Máy nhà:** không bao giờ để lệnh limit vào nằm trên sàn khi bot không chạy (R13); tắt có kế hoạch → hủy hết limit; mọi vị thế luôn có SL trên sàn (R2) | Máy tắt chỉ còn lệnh trên sàn bảo vệ tiền |
| D8 | **Chạy nền bằng systemd của người dùng** (tự khởi động khi bật máy, tự chạy lại khi lỗi) | Có sẵn trên Ubuntu (systemd 255), không cần quyền root |
| D9 | **Cách thoát lệnh (người dùng chốt 19/10/2026) = TP1 chốt 50%, 50% còn lại theo trailing stop** (biến thể C2 của ma trận A/B; không còn TP2/TP3 cố định, không còn SL cố định sau TP1) | Người dùng: “đạt TP1 thì không cần SL, TP1 chốt 50% còn lại theo phương án trailing stop… TP dài hơn để ăn lợi nhuận” |
| D10 | **Trailing đặt TRÊN SÀN** (`TRAILING_STOP_MARKET` qua Algo Order, kích hoạt tại TP1, theo MARK_PRICE), khoảng cách (callback %) do bot tính sao cho **mức dừng lúc kích hoạt ≥ giá khớp thật + phí** → phần 50% còn lại không thể lỗ. Nếu khoảng cách cần thiết < mức tối thiểu sàn cho phép thì giữ thêm một lệnh dừng ở giá vào làm lưới an toàn; nếu khoảng cách theo ATR > mức tối đa sàn cho phép thì dùng mức tối đa và ghi rõ | Trailing là lệnh dừng nằm trên sàn → vị thế luôn được bảo vệ kể cả khi máy nhà tắt; tránh bẫy “trailing rộng hơn quãng tới TP1 → vẫn lỗ” |
| D11 | **Rủi ro mỗi lệnh 2% vốn bot** (người dùng chốt 19/10/2026, “sẽ đánh vốn lớn”); **tối đa 10 lệnh mở cùng lúc — đủ 10 thì không vào lệnh mới** (người dùng chốt 19/10/2026, thay mức 3 lệnh/6% trước đó; tổng rủi ro mở có thể tới 20%); đòn bẩy vẫn ≤ trần (Swing 5×, Lướt nhanh 10×) và giá thanh lý cách SL ≥ 1 khoảng SL — nếu đòn bẩy trần không đủ để vào khối lượng 2% thì vào khối lượng tối đa cho phép và báo rõ | Vào ít lệnh nhưng chặt; giữ khóa đòn bẩy và thanh lý |

## Kiến trúc

```
Binance WS (kline đóng nến, mark price, user data)        Binance REST (ký Ed25519/HMAC)
            │                                                   ▲
            ▼                                                   │
  packages/bot/feed ──► runScan (bộ não) ──► tín hiệu Hạng A MỚI │
                                               │                 │
                                               ▼                 │
                 planner: TradePlan → “lệnh mong muốn”           │
                                               │                 │
   journal (JSONL) ◄──► reconciler (thuần) ◄── sàn thật/giả ─────┘
                                               │
                                     executor: gửi/hủy lệnh (R1–R17)
                                               │
                                     protections (R14) · telegram
```

| Thư mục | Vai trò |
|---|---|
| `packages/binance/signed.ts` | Ký request, đồng bộ giờ (R10), gửi REST có ký, phân loại lỗi (R7, R17), rate limit (R9) |
| `packages/binance/orders.ts` | Lệnh thường + **Algo Order** (R1, R3, R4, R6) — tham số đúng theo `docs/reference/binance-usdm-api.md` |
| `packages/binance/stream.ts` | WebSocket: kline, mark price, user data + giữ listenKey (R16) |
| `packages/bot/planner.ts` | `TradePlan` → danh sách lệnh mong muốn (vào, SL `closePosition`, TP1/2/3 reduce-only, trailing) |
| `packages/bot/reconcile.ts` | Thuần: mong muốn × thật → hành động (đặt SL thiếu, hủy mồ côi, dời SL sau TP1, đóng khẩn cấp) (R2, R5, R8) |
| `packages/bot/protections.ts` | Cầu chì theo người dùng (19/10/2026): **5 lệnh thua trong 24 giờ → dừng mở lệnh mới tới khi người dùng cho phép (`/tieptuc`)**; **lỗ trong ngày > 10% → dừng tới khi người dùng cho phép**; **sụt 30% từ đỉnh → chỉ cảnh báo** (không dừng); cooldown cặp + chiều vừa dính SL 2 nến; **trần 10 lệnh mở cùng lúc** |
| `packages/bot/journal.ts` | Nhật ký JSONL + ảnh chụp; khôi phục khi khởi động |
| `packages/bot/paper.ts` | Sàn giả lập cho chế độ `paper` (dùng chung mô phỏng của kế hoạch 2) |
| `packages/bot/telegram.ts` | Gửi tin qua Bot API bằng `fetch`; không bao giờ gửi secret |
| `bot/main.ts` | Vòng đời: khởi động → kiểm cấu hình/key/giờ/position mode → đối chiếu → nghe WS → mỗi nến đóng: `runScan` → đặt lệnh; tắt: hủy limit |

## Vòng đời

1. **Khởi động:** đọc cấu hình (`.env` quyền 600); kiểm giờ lệch < 500 ms (R10); kiểm key còn sống, quyền
   futures, **không** có quyền rút (R15); kiểm One-way mode (R11) — sai thì dừng; đặt ISOLATED + đòn bẩy cho
   cặp khi cần (R12).
2. **Đối chiếu** (R8) theo đúng thứ tự a–g; xong mới nghe tín hiệu.
3. **Mỗi nến khung vào lệnh đóng** (15m Lướt nhanh / 4H Swing): `runScan` cho phạm vi; tín hiệu Hạng A MỚI qua
   protections → planner → executor.
4. **Vào lệnh:** market hoặc limit (GTD theo hạn) với `clientOrderId` tất định. Khớp (kể cả một phần) → **ngay**
   SL `closePosition` theo MARK_PRICE; thất bại → đóng market + Telegram khẩn (R2). Sau đó TP1/2/3 reduce-only.
5. **Quản lý:** ngay khi vào lệnh đặt cùng lúc trên sàn: SL gốc (`closePosition`), TP1 reduce-only 50% khối
   lượng, và TRAILING_STOP_MARKET reduce-only 50% với `activationPrice` = TP1 (D10). TP1 khớp → hủy SL gốc
   (trailing đã kích hoạt là lệnh dừng của phần còn lại; nếu trailing chưa xác nhận kích hoạt trên sàn thì CHƯA
   hủy SL gốc). Bot vắng mặt lúc TP1 khớp: SL gốc vẫn nằm trên sàn cho phần còn lại cho tới khi bot bật lại
   (phần này có thể lỗ tới −0,5R — đã nêu trong đối chứng biến thể O1). Dừng theo thời gian; cầu dao biến động;
   hủy limit quá hạn.
6. **Tắt có kế hoạch** (SIGTERM): hủy mọi limit vào; ghi ảnh chụp; Telegram “bot tắt, vị thế còn mở: … đều có
   SL trên sàn”.
7. **Khởi động lại sau khi máy tắt:** bước 1–2; nếu TP1 đã khớp khi vắng mặt → dời SL ngay.

## Telegram (mỗi tin ngắn, tiếng Việt)

Vào lệnh (giá, SL, TP1/2/3, khối lượng, rủi ro USDT), khớp TP/SL (R thực), dời SL, cầu chì nhảy, lỗi khẩn
(thiếu SL, đặt SL hỏng, key sắp hết hạn, lệch giờ), bot bật/tắt, tóm tắt ngày. Lệnh điều khiển tối thiểu:
`/trangthai`, `/dung` (ngừng mở lệnh mới), `/tieptuc` — chỉ nhận từ đúng chat ID của người dùng.

## An toàn tiền (không thương lượng)

- Mặc định chạy `paper`. `demo`/`live` phải bật bằng cấu hình + gõ xác nhận khi khởi động lần đầu.
- `live` có **khóa cứng** trong cấu hình: vốn tối đa bot được dùng, đòn bẩy tối đa, lỗ tối đa/ngày, số lệnh
  mở tối đa — vượt là từ chối, không có cờ bỏ qua.
- Key: không quyền rút; key Demo và key thật tách; secret chỉ ở `.env` (quyền 600), không vào git/Telegram/log.
- Mọi lệnh gửi đi đều được ghi nhật ký trước khi gửi và sau khi có phản hồi.

## Kiểm thử

| Phần | Cách kiểm |
|---|---|
| Ký request | So với ví dụ chữ ký trong tài liệu chính thức (nếu có) + test HMAC/Ed25519 |
| Orders/Algo | Test khẳng định SL/TP/trailing **chỉ** đi qua endpoint Algo (R1); tham số đúng bảng tra cứu |
| Reconciler | Bảng ca: thiếu SL, SL mồ côi, TP1 khớp lúc vắng mặt, khớp một phần, vị thế lạ, lệnh trùng ID |
| Protections | Ca nhảy từng cầu chì; không tự mở lại (d), (f) |
| Paper | Chạy song song máy quét ≥ 1 tuần, so với backtest |
| Demo | Kịch bản cơ khí: đặt/khớp/dời SL/hủy/khởi động lại giữa chừng/rút mạng; ghi biên nhận |

## Lộ trình (mỗi bậc có tiêu chí qua — như đã thống nhất)

1. Kế hoạch 2 (đối chứng) cho kỳ vọng dương sau phí ngoài mẫu.
2. Bot `paper` ≥ 100 lệnh hoặc ≥ 4 tuần, khớp với đối chứng.
3. Bot `demo` 2–4 tuần không lỗi cơ khí.
4. Bot `live` vốn nhỏ (người dùng chọn số), khóa cứng; chuyển VPS.

## Điểm chưa kiểm chứng (phải kiểm trên Demo trước `live`)

Hai SL `closePosition` có cùng tồn tại được không (R5); có endpoint tự hủy lệnh khi mất liên lạc (dead-man
switch) không; Demo có xử lý Algo Order và funding như thật không; key Ed25519 không gắn IP có quyền futures và
có bị xóa sau thời gian không hoạt động không.
