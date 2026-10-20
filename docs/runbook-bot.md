# Sổ tay vận hành bot Coin Radar

Cập nhật: 20/10/2026 (B8b). Dành cho người vận hành trên máy Ubuntu ở nhà. Thiết kế: `docs/specs/2026-10-19-bot-design.md`.

## 0. Đọc trước: kết luận backtest — CHỈ chạy `paper`

Mô phỏng mù 30 ngày (`docs/verification/ket-qua-mo-phong-mu.md`, `reports/Đối chứng 30 ngày.md`):

| Ứng viên | Lệnh | Kỳ vọng R | Tổng lãi | Kết luận |
|---|---|---|---|---|
| Swing, luật hiện tại | 52 | −0,12 | −4,9% | chưa có lãi |
| Swing combo-loc | 28 | −0,03 | −3,1% | chưa có lãi |
| Lướt nhanh 4H | 118 | −0,28 (cả khoảng tin cậy âm) | −15,2% | lỗ rõ → đề xuất tắt |

- **Chiến lược CHƯA có lợi thế sau phí.** Bot chỉ được chạy `paper` (giá thật, khớp giả lập, không có tiền thật).
- Quản trị rủi ro chạy đúng: không lệnh nào lỗ thật quá 2% vốn.
- Bot chỉ vào tín hiệu **Hạng A MỚI**; trên 3 tháng phát triển Swing gần như **không có** tín hiệu Hạng A → chạy paper nhiều ngày có thể
  không có lệnh nào. Đó là hành vi đúng, không phải lỗi.
- Lộ trình (đã thống nhất): paper ≥ 100 lệnh **và** ≥ 4 tuần, kỳ vọng R > 0 sau phí → Demo 2–4 tuần không lỗi cơ khí → live vốn nhỏ.

### Chọn chiến lược: mặc định `['btc-regime']` (20/10/2026)

Mặc định trong `packages/core/config.ts` là `COMMON.bot.modes = ['btc-regime']` (anh quyết định: Swing altcoin lỗ trên mọi lần kiểm).
`'swing'` / `'fast'` vẫn chọn được (sửa `bot: { modes: [...] }`), nhưng không mặc định. Bot ghi rõ lúc khởi động:
`chế độ chiến lược: btc-regime (khung quyết định 1d)`.

**Hệ BTC theo chế độ (`btc-regime`)** — luật đã khóa `docs/verification/khoa-luat-mo-phong-mu-C.md`:
- Chỉ BTCUSDT, chỉ Long. Mỗi ngày ngay sau khi nến 1D đóng (00:00 UTC = 07:00 giờ VN), dùng nến 1D đã đóng: giá đóng > SMA50 → giữ Long;
  ngược lại đứng ngoài.
- Vào: lệnh LIMIT IOC (giá trần = mark + 0,1%), đòn bẩy 1×, ISOLATED; SL trên sàn (STOP_MARKET closePosition) = giá vào − 2,5 × ATR(20) 1D.
  Khối lượng: giá trị = min(1 × vốn, 2% vốn / (khoảng SL % + 2 × 0,0575% + 0,02%)).
- Ra: tín hiệu tắt → đóng market reduce-only (SL bị hủy). Chạm SL mà tín hiệu còn bật → vào lại ở lần quyết định ngày kế tiếp.
- Không trailing. Chốt chặn funding (mỗi kỳ chốt funding): siết SL để lỗ tại SL + phí + trượt + funding đã trả ≤ 2% vốn lúc vào.
- Máy tắt: SL nằm trên sàn. Bật lại: bot đồng bộ vị thế + SL, lỡ quyết định 00:00 thì quyết định ngay lúc khởi động (nhật ký ghi
  `btc_regime_decision` — không quyết định lại cùng nến). Thiếu dữ liệu nến → không làm gì, báo Telegram, thử lại ở lượt định kỳ.
- Tính vào cầu chì / trần 10 lệnh / tổng rủi ro mở 10% như mọi lệnh. Tin Telegram mỗi ngày: "BTC theo chế độ — nến 1D …".

## 1. Cài đặt

Yêu cầu: Node 24 (`node --version` ≥ 24), mạng ra `fapi.binance.com` / `fstream.binance.com` (paper) — không cần thư viện thêm.

```bash
cd ~/coin-radar
npm install            # chỉ cài công cụ kiểm (typescript)
npm test && npm run typecheck
cp .env.example .env && chmod 600 .env   # BẮT BUỘC quyền 600
```

Bot tự đọc `~/coin-radar/.env` (kể cả khi chạy bằng systemd — dịch vụ không dùng `EnvironmentFile`). Cú pháp được hỗ trợ (tập con,
cố ý đơn giản): mỗi dòng `KEY=VALUE`; dòng trống và dòng bắt đầu bằng `#` bị bỏ qua; được phép tiền tố `export `; giá trị bỏ khoảng
trắng hai đầu và bỏ một cặp nháy bao ngoài (`'…'` hoặc `"…"`). **Không** hỗ trợ: chú thích cuối dòng (`A=1 # x` → giá trị `1 # x`),
giá trị nhiều dòng, `${BIẾN}`, ký tự thoát. Biến môi trường của tiến trình (nếu có) được ưu tiên hơn `.env`.

Nội dung `.env` (mọi biến, có sẵn trong `.env.example`):

| Biến | Ý nghĩa | Mặc định |
|---|---|---|
| `BOT_MODE` | `paper` \| `demo` \| `live` | `paper` |
| `BINANCE_ENV` | `demo` hoặc `live` — loại key đang đặt (paper không cần; `live` mà BOT_MODE khác `live` → bot từ chối chạy) | trống |
| `BINANCE_API_KEY`, `BINANCE_API_SECRET` | key Demo hoặc key thật (mục 2) — chỉ demo/live | trống |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | mục 3; bỏ trống cả hai = tắt Telegram (tin ghi vào log) | trống |
| `BOT_PAPER_BALANCE` | ví USDT ban đầu của sàn giả lập (chỉ khi chưa có `data/bot/paper-state.json`) | 1000 |
| `BOT_DATA_DIR` | nơi lưu nhật ký + trạng thái paper (phải nằm trong `data/bot/` để không lọt vào git) | `data/bot` |
| `BOT_RECONCILE_EVERY_S` | đối chiếu REST định kỳ (giây) | 60 |
| `BOT_SCAN_LIMIT` | chỉ quét N hợp đồng thanh khoản cao nhất (như `--limit` của máy quét) | không giới hạn |

Paper không cần key: dữ liệu thị trường công khai (REST + WebSocket), sàn giả lập chạy trong máy.

## 2. Tạo API key (chỉ khi lên Demo / live)

Nguyên tắc (tài liệu Binance, `docs/reference/binance-usdm-api.md` mục 9, 11):

- **Key Demo và key thật tách riêng.** Key Demo tạo trong tài khoản *Binance Futures Demo Trading* (đăng nhập Demo → API Management →
  Create API). Bot demo dùng `https://demo-fapi.binance.com` / `wss://demo-fstream.binance.com`.
- **Chỉ bật quyền Đọc + Futures. TUYỆT ĐỐI KHÔNG bật quyền Rút tiền (Withdraw)**, không bật Spot/Margin/Universal Transfer.
- **Hạn chế IP (IP whitelist)**: key HMAC (system-generated) không gắn IP thì Binance chỉ cho quyền Đọc → không giao dịch được. Gắn đúng
  IPv4 công khai của máy chạy bot (`curl -4 ifconfig.me`). IP nhà thay đổi → bot nhận lỗi `-2015` → sửa danh sách IP trên Binance.
- Secret chỉ hiện một lần: dán ngay vào `.env` (chmod 600). Không gửi key qua Telegram/email, không dán vào chat, không commit.
- Key thật: chỉ tạo khi đã qua đủ lộ trình mục 0.

Bot hiện ký bằng HMAC SHA256 (`BINANCE_API_KEY` + `BINANCE_API_SECRET`). Lúc khởi động demo/live bot tự kiểm: lệch giờ < 500 ms, One-way
mode, Multi-Assets tắt, tải bậc ký quỹ thật (`leverageBracket`); sai là dừng và nói rõ phải sửa gì (bot KHÔNG tự đổi chế độ tài khoản).
Trước mỗi lệnh bot đặt ISOLATED + đòn bẩy cho cặp đó.

## 3. Telegram (chỉ chat riêng)

1. Mở Telegram, nhắn `@BotFather` → `/newbot` → đặt tên → nhận **token** dạng `123456789:AA…`.
2. Nhắn một tin bất kỳ cho bot vừa tạo **từ tài khoản của anh, trong chat riêng 1-1** (không dùng nhóm/kênh).
3. Lấy **chat ID**: mở `https://api.telegram.org/bot<TOKEN>/getUpdates` trên trình duyệt, tìm `"chat":{"id": …, "type":"private"}`.
   **`type` phải là `private`** — `TELEGRAM_CHAT_ID` phải là chat riêng của anh (bot chỉ nhận lệnh từ đúng chat ID này; nhóm thì ai trong
   nhóm cũng ra lệnh được).
4. Ghi `TELEGRAM_BOT_TOKEN` và `TELEGRAM_CHAT_ID` vào `.env`. Không chia sẻ token.

Lệnh điều khiển (chỉ từ chat của anh):

| Lệnh | Tác dụng |
|---|---|
| `/trangthai` | chế độ, vốn, lệnh đang mở, cầu chì đang nhảy, lỗi gần nhất |
| `/dung` | ngừng mở lệnh MỚI (lệnh đang mở vẫn giữ SL/TP/trailing trên sàn). Bền qua khởi động lại |
| `/tieptuc` rồi `/tieptuc XACNHAN` (trong 2 phút) | bỏ tạm dừng **và** mở lại cầu chì (5 lệnh thua/24h, lỗ ngày > 10%) |
| `/trogiup` | danh sách lệnh |

Telegram tắt (để trống token): mọi tin ghi vào log với tiền tố `[telegram tắt]`; không có lệnh điều khiển.

## 4. Bật / tắt / trạng thái / log

Chạy tay (thử, xem log trực tiếp; Ctrl+C = tắt có kế hoạch):

```bash
cd ~/coin-radar && node packages/bot/main.ts
```

Chạy nền bằng systemd của người dùng (tự chạy lại khi lỗi):

```bash
mkdir -p ~/.config/systemd/user
cp deploy/coin-radar-bot.service ~/.config/systemd/user/
which node    # nếu khác ~/.nvm/versions/node/v24.21.0/bin/node thì sửa dòng ExecStart trong tệp vừa chép
systemctl --user daemon-reload
systemctl --user enable --now coin-radar-bot      # bật + tự chạy khi đăng nhập
systemctl --user status coin-radar-bot            # trạng thái
journalctl --user -u coin-radar-bot -f            # xem log trực tiếp
journalctl --user -u coin-radar-bot --since "1 hour ago"
systemctl --user restart coin-radar-bot           # khởi động lại (sau khi sửa .env / config)
systemctl --user stop coin-radar-bot              # tắt có kế hoạch
systemctl --user disable coin-radar-bot           # bỏ tự chạy
```

- Muốn bot chạy cả khi chưa đăng nhập (máy vừa bật): `loginctl enable-linger $USER` (một lần; có thể hỏi mật khẩu).
- **Tắt có kế hoạch** (stop / Ctrl+C / SIGTERM): bot hủy mọi lệnh VÀO còn treo (máy nhà không bao giờ để lệnh limit nằm trên sàn khi bot
  không chạy), giữ nguyên SL/TP/trailing của vị thế đang mở, ghi ảnh chụp nhật ký, báo "Bot tắt — vị thế còn mở: <mã> <khối lượng>: có SL"
  — bot kiểm THẬT từng vị thế với lệnh dừng trên sàn; vị thế nào thiếu → tin KHẨN "KHÔNG có SL".
- Bot dừng vì lỗi (mã thoát ≠ 0) → systemd chạy lại sau 30 giây; lỗi 5 lần trong 10 phút → ngừng, xem `journalctl`.

Log khởi động bình thường (thứ tự cố định):
`Đồng hồ: lệch … ms` → `exchangeInfo: … hợp đồng | chế độ chiến lược: …` → `Nhật ký khôi phục: …` → (paper) `nạp … nến 1m khoảng tắt máy`
→ `Đối chiếu #1 (khởi động)` → `Bot bật — …` → `Market #0: đã mở kết nối`. Sau đó mỗi phút `Đối chiếu #n (định kỳ REST)`, mỗi nến
quyết định `Quét swing (nến …): … mã chấm, Đạt …, Hạng A MỚI …`.

## 5. Kích hoạt live (chưa làm khi chưa qua lộ trình)

1. Tạo `data/bot/live-caps.json` (trần cứng, vượt là từ chối, không có cờ bỏ qua):
   `{"maxCapitalUsdt": 200, "maxLeverage": 3, "maxDailyLossPct": 10, "maxOpenTrades": 3, "riskPerTradePct": 1}` — `maxCapitalUsdt`,
   `maxLeverage` bắt buộc; các mục khác chỉ được chặt hơn mặc định (10%, 10 lệnh, 2%).
2. Trên terminal (không qua script): `node packages/bot/arm-live.ts` → đọc lại trần → gõ ĐÚNG câu `TOI HIEU BOT SE GIAO DICH BANG TIEN THAT`.
   Tệp kích hoạt `data/bot/live-arm.json` chứa băm của trần; sửa trần là mất kích hoạt.
3. `.env`: `BOT_MODE=live`, `BINANCE_ENV=live`, key thật (mục 2). `systemctl --user restart coin-radar-bot`.

## 6. Khi nhận cảnh báo

| Cảnh báo | Ý nghĩa | Việc làm |
|---|---|---|
| `…: đặt SL sau khi khớp vào — SL … (khớp cách đây … ms)` (mức thường, không KHẨN) | bình thường: lệnh vào vừa khớp, bot đặt SL lần đầu trong `COMMON.bot.postFillStopBudgetMs` (10 s). Log có dòng `khớp→SL <mã>: … ms` đo độ trễ | Không cần làm gì |
| `KHẨN …: vị thế … THIẾU lệnh dừng …` | SL đã từng nằm trên sàn rồi biến mất, hoặc khớp vào quá 10 s mà chưa có SL | Như dòng dưới |
| `KHẨN …: vị thế … KHÔNG có lệnh dừng` / `CHƯA BẢO VỆ` / đặt SL bị từ chối hoặc không rõ | đặt SL hỏng hoặc chưa xác nhận được | Bot tự thử lại/đóng market. Mở Binance kiểm vị thế mã đó **ngay**: có SL chưa? Không có → tự đặt SL hoặc đóng tay. Bot xử lý mã này TRƯỚC ở lượt sau (dấu bền qua khởi động lại) |
| `KHẨN đã đóng khẩn … bằng lệnh thị trường` | không giữ được lệnh dừng → đóng để bảo vệ tiền | Kiểm vị thế đã về 0; đọc lý do trong log |
| `KHẨN cầu chì … nhảy` (5 lệnh thua/24h, lỗ ngày > 10%) | ngừng mở lệnh mới, lệnh đang mở giữ nguyên | Xem lại lệnh thua (`/trangthai`, log). Chỉ khi chắc chắn: `/tieptuc` rồi `/tieptuc XACNHAN` |
| `Cảnh báo: vốn sụt 30% từ đỉnh` | chỉ cảnh báo (theo lựa chọn của anh), bot vẫn chạy | Cân nhắc `/dung` |
| `KHẨN Binance chặn tạm thời (418/429)` | vượt hạn mức gọi API theo IP; 418 = IP bị cấm 2 phút – 3 ngày | Bot tự ngừng gọi REST 2 phút; lệnh dừng trên sàn vẫn bảo vệ vị thế. **Tắt máy quét/script khác dùng chung IP**. Lặp lại → `systemctl --user stop`, chờ hết cấm |
| `KHẨN lệch giờ` / bot không khởi động vì lệch > 500 ms | đồng hồ máy sai | `timedatectl status`; bật `sudo timedatectl set-ntp true` |
| `Không xác định được lệnh sở hữu vị thế` / vị thế lạ | có vị thế không do bot mở (hoặc mơ hồ) | Bot khóa mã đó, không đụng vào. Anh tự xử lý trên Binance |
| `Chốt chặn funding: … siết SL` / `đóng market` | funding đã trả + lỗ tại SL vượt 2% vốn lúc vào | Không cần làm gì (đúng ràng buộc 2%); theo dõi |
| `KHẨN chốt chặn funding <mã> không chạy được: …` | sau giờ chốt funding bot không đọc được dữ liệu để kiểm (quá 2 lần hoặc quá 10 phút; bot vẫn thử lại mỗi phút) | Bot chặn vào lệnh mới mã đó, tạm dùng đệm funding "max", và (nếu sàn còn nhận lệnh) **siết SL phòng trước** theo funding xấu nhất đã biết cho cả thời gian giữ còn lại; mỗi kỳ chốt lỡ thêm → KHẨN lại. Kiểm mạng / Binance; tự kiểm lỗ của vị thế đó. Chạy lại được → bot báo "bỏ chặn" |
| `KHẨN …: siết SL về … KHÔNG được sàn nhận — giữ SL cũ` | sàn từ chối/không xác nhận lệnh dừng mới của chốt chặn funding; nhật ký giữ SL cũ (sàn là chuẩn) | Bot thử lại ở kỳ kiểm sau; theo dõi, cân nhắc đóng tay nếu lặp lại |
| `KHẨN …: lệnh dừng trên sàn … LỎNG hơn nhật ký …` | SL trên sàn khác SL bot ghi; bot lấy mức trên sàn làm chuẩn (rủi ro > 2% thì tự giảm vị thế) | Kiểm lệnh dừng mã đó trên Binance |
| `KHẨN Bot tắt — KHÔNG đọc được trạng thái sàn, kiểm tay ngay` | lúc tắt bot không đọc được sàn → chưa hủy được lệnh vào treo, chưa kiểm được SL | Mở Binance: hủy lệnh vào (limit) còn treo, kiểm mọi vị thế có SL |
| `KHẨN Bot tắt — … <mã>: KHÔNG có SL` | lúc tắt, vị thế đó không có lệnh dừng trên sàn (bot kiểm thật từng mã) | Đặt SL tay hoặc bật lại bot NGAY |
| `-2015` trong log | key sai/mất quyền/IP không trong whitelist | Sửa danh sách IP hoặc quyền key trên Binance |

## 7. Dữ liệu bot lưu ở đâu

Thư mục `data/bot/` (đã git-ignore — không bao giờ commit, không `git add -f`):

| Tệp | Nội dung |
|---|---|
| `journal-YYYY-MM-DD.jsonl` | nhật ký CHỈ GHI THÊM theo ngày UTC: mọi lệnh ghi trước khi gửi (`order_intent`) và sau phản hồi (`order_result`), khớp, cầu chì, tín hiệu đã nhận, kết quả lệnh, đỉnh vốn/vốn đầu ngày. Đọc được bằng mắt |
| `snapshot.json` | ảnh chụp trạng thái (15 phút/lần + lúc tắt); khởi động = ảnh chụp + phát lại sự kiện sau đó |
| `paper-state.json` | ví, vị thế, lệnh, lịch sử khớp của sàn giả lập (paper) — như sàn thật vẫn chạy khi bot tắt. Lúc bật lại bot nạp nến 1m + funding của khoảng tắt máy TRƯỚC khi nhận giá trực tiếp |
| `live-caps.json`, `live-arm.json` | trần live và tệp kích hoạt (mục 5) |

- Làm lại paper từ đầu: tắt bot, chuyển `data/bot/` sang chỗ khác (đừng xóa nếu còn cần đối chiếu), bật lại.
- Dòng cuối nhật ký bị cắt dở (mất điện) → bot tự chuyển sang tệp `.torn-*` và chạy tiếp; dòng hỏng ở giữa → bot dừng, cần xem tay.
- Không sửa tay nhật ký khi bot đang chạy.

## 8. Giới hạn đã biết

- Paper: không mô phỏng đòn bẩy theo bậc (-4028/-2027), hàng chờ sổ lệnh, countdownCancelAll; xem đầu `packages/bot/paper.ts`.
- Demo chưa kiểm cơ khí (B9: đường dẫn `/private/ws/<listenKey>`, hai kết nối chung listenKey khi xoay vòng, hai lệnh `closePosition`
  cùng tồn tại, Algo Order trên Demo…). Chưa chạy Demo trước khi B9 xong.
- Nến quyết định đã đóng TRƯỚC lúc bot bật không được quét lại (tín hiệu cũ không vào lệnh).
