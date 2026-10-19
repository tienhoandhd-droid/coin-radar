# Coin Radar — Thiết kế

Ngày: 19/10/2026 · Trạng thái: chờ người dùng duyệt bản viết

## Mục tiêu

Một web riêng giúp chủ dự án phân tích kỹ thuật **top 1000 coin** theo vốn hóa, với dữ liệu hiện trạng,
để sàng lọc nên chú ý coin nào, rủi ro ra sao, và tỉ lệ thắng của tín hiệu là bao nhiêu.

Không phải mục tiêu:
- Không vẽ lại biểu đồ nến (người dùng xem trên sàn; web có nút mở biểu đồ sàn).
- Không đặt lệnh, không kết nối tài khoản sàn, không cầm API key sàn.
- Không cảnh báo Telegram/email ở bản này.
- Không cam kết lợi nhuận. Mọi tỉ lệ thắng là thống kê, có ghi rõ nguồn gốc (quá khứ hay thực tế).

## Quyết định đã chốt với người dùng

| Vấn đề | Quyết định |
|---|---|
| Kiểu đầu tư | Cả **Swing** (trung hạn) và **Lướt ngắn** |
| Hạ tầng | Máy quét chạy nền → Supabase → Web (cách B) |
| Vị trí | Web **độc lập**, repo public mới `tienhoandhd-droid/coin-radar` |
| Ai xem được | **Chỉ admin** đăng nhập; dữ liệu khóa bằng RLS |
| Supabase | **Dùng chung dự án của Pháp Sư**, không đụng bảng game |
| Biểu đồ nến | **Không vẽ**; không thêm `lightweight-charts` |

## 1. Kiến trúc

```
CoinGecko (danh sách top 1000) ─┐
Binance → OKX → Bybit (nến)     ─┼─► scanner/  (GitHub Actions, mục tiêu 15 phút/lần)
                                 │       dùng packages/core: chỉ báo, điểm, backtest, đối chiếu tín hiệu
                                 ▼
                 Supabase (dự án Pháp Sư): bảng coin_*  — RLS: chỉ admin đọc
                                 ▼
                 web/  (Vite + React + TS → GitHub Pages) — đăng nhập Supabase
```

Repo `coin-radar` (một repo, public):

| Thư mục | Vai trò | Phụ thuộc |
|---|---|---|
| `packages/core/` | Hàm thuần TypeScript: chỉ báo, chấm điểm, rủi ro, backtest, ghép sàn | Không có |
| `scanner/` | Lấy dữ liệu, gọi `core`, ghi Supabase qua `psql` | `core`, `psql` có sẵn trên runner |
| `web/` | Giao diện | `core` (chỉ kiểu dữ liệu, nhãn), React, Vite, `@supabase/supabase-js` |
| `supabase/` | Migration SQL cho các bảng `coin_*`, script cài tài khoản máy quét | — |
| `docs/` | Thiết kế, kế hoạch, báo cáo kiểm | — |

Vì sao một repo public: máy quét và web dùng **chung một bộ hàm**, nên con số luôn khớp. GitHub Actions
không giới hạn phút cho repo public, GitHub Pages miễn phí. Code public không lộ gì vì mật khẩu nằm trong
GitHub Secrets, còn dữ liệu bị khóa bởi đăng nhập + RLS.

Thư viện cho web (cùng bộ với Pháp Sư, không có gì mới với người dùng): `react`, `react-dom`, `vite`,
`typescript`, `@supabase/supabase-js`. Phiên bản lấy theo đúng bản Pháp Sư đang dùng. Không thêm thư viện
biểu đồ; heatmap tự vẽ bằng CSS grid.

## 2. Dữ liệu đầu vào

**Danh sách coin:** CoinGecko `/coins/markets`, 4 trang × 250, sắp theo vốn hóa. Loại bỏ stablecoin và
token bọc/staking (danh sách loại trừ viết rõ trong code, có test).

**Ghép sàn:** mỗi coin tìm cặp `<SYMBOL>USDT` theo thứ tự Binance → OKX → Bybit (lấy danh sách cặp đang
giao dịch của từng sàn mỗi lượt quét). Trùng ký hiệu giữa hai coin khác nhau (ví dụ hai token cùng tên
"ABC") → chỉ ghép coin có vốn hóa lớn hơn, coin kia ghi "không ghép được".

**Coin không có trên sàn nào:** vẫn hiện giá, % thay đổi, vốn hóa từ CoinGecko; **không chấm điểm**, hiện
"—" và nhãn "không đủ dữ liệu nến".

**Nến lấy mỗi lượt:** 1D × 300, 4H × 500, 1H × 500 cho mỗi coin ghép được.

**Kiểm chứng bắt buộc trước khi dựng hạ tầng:** runner GitHub đặt ở Mỹ; phải chạy thử thật để biết sàn
nào trả lỗi chặn vùng (HTTP 451/403). Nguồn bị chặn thì bỏ khỏi chuỗi ưu tiên, ghi lại trong báo cáo.
Đã đo trên máy người dùng (19/10/2026): Binance 511 cặp USDT đang giao dịch; Binance, OKX, Bybit,
CoinGecko đều trả 200.

**Giới hạn tốc độ:** gọi tuần tự có giãn cách, tôn trọng header trọng số của Binance; CoinGecko free
~30 lượt/phút (chỉ cần 4 lượt/lần quét). Lỗi mạng một coin → ghi lỗi cho coin đó, không làm hỏng cả lượt.

## 3. Phân tích

### Khung thời gian

| | Swing | Lướt ngắn |
|---|---|---|
| Khung xu hướng | 1D | 4H |
| Khung vào lệnh | 4H | 1H |
| Hạn chờ kết quả tín hiệu | 10 ngày | 48 giờ |

### Chỉ báo (tự viết trong `core`)

EMA 20/50/200, RSI 14 (Wilder), MACD 12/26/9, Bollinger 20/2, ATR 14 (Wilder), khối lượng / TB 20 phiên,
hỗ trợ–kháng cự từ đỉnh/đáy pivot gần nhất.

Chỉ dùng **nến đã đóng**. Nến đang chạy dở bị bỏ khỏi tính toán.

### Điểm 0–100

| Thành phần | Tối đa | Đo gì |
|---|---|---|
| Xu hướng | 40 | Giá so EMA, thứ tự EMA20/50/200 ở khung xu hướng |
| Động lượng | 25 | RSI, MACD ở khung vào lệnh |
| Khối lượng | 15 | Khối lượng so TB 20 phiên, hướng nến đi kèm |
| Vị trí giá | 20 | Khoảng cách tới hỗ trợ/kháng cự, vị trí trong Bollinger |

Kết luận: **Mua ≥ 70**, **Theo dõi 50–69**, **Tránh < 50**.

**Lọc thị trường:** BTC dưới EMA200 khung ngày → mọi “Mua” hạ xuống “Theo dõi”, kèm nhãn lý do.

Mỗi coin có **danh sách lý do bằng lời** (ví dụ “Giá trên EMA200 ngày: +12”) để người dùng hiểu điểm từ đâu.

### Kế hoạch lệnh (chỉ khi “Mua”)

- Vào lệnh: giá đóng nến gần nhất.
- Cắt lỗ: mức thấp hơn trong (hỗ trợ gần nhất − 0,2×ATR) và (giá vào − 1,5×ATR) — tức là cách giá vào **xa hơn** trong hai mức.
- Chốt lời 1 = giá vào + 1,5 × (giá vào − cắt lỗ); Chốt lời 2 = + 3 ×.
- Hiện R:R và % khoảng cách.

### Mức rủi ro

Thấp / Vừa / Cao / Rất cao, cộng điểm từ: ATR% khung ngày, khối lượng 24h, vốn hóa, sụt giảm lớn nhất
90 ngày, số nến 1D có sẵn (coin mới niêm yết < 90 ngày → tối thiểu “Cao”). Ngưỡng cụ thể ghi trong code và
có test.

### Tỉ lệ thắng — hai con số tách biệt, không trộn

1. **Backtest (quá khứ):** chạy đúng quy tắc chấm điểm trên lịch sử nến của chính coin đó. Mỗi lần điểm
   vượt 70 → mở lệnh giả ở giá đóng nến, dùng cắt lỗ/chốt lời 1 như trên. Kết quả: chạm chốt lời trước =
   thắng, chạm cắt lỗ trước = thua, cùng một nến chạm cả hai = **tính thua** (giả định xấu), hết hạn =
   tính theo giá đóng lúc hết hạn. Không mở lệnh mới khi lệnh cũ chưa đóng.
   Hiện: số lần, % thắng, lãi/lỗ trung bình tính theo R. **Dưới 20 lần → “chưa đủ mẫu”, không hiện %.**
   Bắt buộc có test chứng minh không nhìn trước tương lai (thay đổi nến sau thời điểm t không đổi
   quyết định tại t).
2. **Thực tế (forward):** mỗi tín hiệu “Mua” mới được ghi vào `coin_signals`. Các lượt quét sau đối chiếu
   nến 1H để đóng: Thắng / Thua / Hết hạn. Trang “Sổ tín hiệu” hiện tỉ lệ cộng dồn. Ban đầu chưa có mẫu
   → hiện “—”.

## 4. Supabase

Dự án hiện có của Pháp Sư. Bảng đặt trong schema `public` với tiền tố `coin_` (schema `public` đã được
API công khai sẵn; đặt schema riêng sẽ phải đổi cấu hình API của dự án game).

| Bảng | Nội dung | Kích thước dự kiến |
|---|---|---|
| `coin_scan_runs` | Mỗi lượt quét: bắt đầu, kết thúc, số coin, số lỗi, nguồn nào bị chặn | ~100 dòng/ngày; giữ 30 ngày |
| `coin_snapshots` | Kết quả mới nhất mỗi coin × chế độ (giá, điểm, lý do, rủi ro, kế hoạch lệnh, backtest) | ~2000 dòng, ghi đè |
| `coin_signals` | Sổ tín hiệu forward | Tăng dần, vài trăm dòng/tuần |

Không lưu nến.

**Quyền:**
- RLS bật trên cả 3 bảng. `select` chỉ khi `private.is_active_admin()`. `anon` không có quyền gì.
- Máy quét dùng login Postgres riêng `coin_scanner`, **chỉ** có quyền `execute` một hàm
  `coin_ingest(jsonb)` (security definer) ghi cả lượt trong một transaction. Không có quyền đọc/ghi bảng
  game, không dùng `service_role`.
- Theo đúng mẫu `project_heartbeat` của Pháp Sư: kết nối qua pooler, `sslmode=verify-full`, ghim CA.

**Thay đổi database thật:** chụp lược đồ (`pg_dump --schema-only`) trước khi áp migration; người dùng đã
cho phép ngày 19/10/2026.

**Lưu ý đọc dữ liệu:** PostgREST mặc định trả tối đa 1000 dòng mỗi lần → web phải đọc theo trang.

## 5. Giao diện

1. **Đăng nhập** bằng tài khoản admin Pháp Sư. Không phải admin → báo “không có quyền”, không hiện gì.
2. **Đầu trang:** BTC (giá, xu hướng), trạng thái lọc thị trường, giờ cập nhật (“cách đây 7 phút”;
   > 60 phút → báo đỏ “dữ liệu cũ”), nút **Swing / Lướt ngắn**.
3. **Heatmap:** ô theo vốn hóa, màu theo % 24h hoặc theo điểm (chuyển được).
4. **Bảng xếp hạng:** lọc theo kết luận, mức rủi ro, nhóm vốn hóa; sắp theo điểm; tìm theo tên.
5. **Chi tiết coin:** điểm và danh sách lý do, kế hoạch lệnh, rủi ro, backtest, lịch sử tín hiệu thực tế,
   nút mở biểu đồ trên đúng sàn đã ghép.
6. **Sổ tín hiệu:** tỉ lệ thắng thực tế theo chế độ và theo mức rủi ro.
7. Đủ 4 trạng thái mọi nơi: đang tải, lỗi (kèm nội dung lỗi), rỗng, có dữ liệu.
8. Dòng miễn trừ cố định: “Phân tích kỹ thuật tự động từ số liệu quá khứ. Không phải lời khuyên tài chính.”
9. Dùng được trên điện thoại (bảng cuộn ngang trong khung, không cuộn cả trang).

## 6. Kiểm thử

| Phần | Cách kiểm |
|---|---|
| Chỉ báo | So với bảng số tham chiếu đã công bố (nguồn ghi trong test) |
| Điểm, rủi ro, kế hoạch lệnh | Test hành vi viết trước code |
| Backtest | Test không nhìn trước tương lai; test ca cùng nến chạm cả hai mức |
| Ghép sàn, loại stablecoin | Test với dữ liệu mẫu |
| RLS | Trên Postgres thật: tài khoản thường đọc 0 dòng, admin đọc được, `coin_scanner` không đọc được bảng game |
| Máy quét | Chạy thật trên máy, rồi chạy thật trên GitHub Actions; dán số coin quét được / lỗi |
| Web | Typecheck, lint, build; kiểm trình duyệt với dữ liệu thật sau đăng nhập |

## 7. Giới hạn đã biết (sẽ ghi trên web và trong báo cáo)

- Lịch GitHub Actions có thể trễ hoặc bỏ lượt lúc cao điểm; 15 phút là mục tiêu, không phải cam kết.
- Coin không có trên Binance/OKX/Bybit không được chấm điểm.
- Backtest dựa trên quá khứ; thị trường đổi trạng thái thì kết quả đổi.
- Dự án Supabase miễn phí có thể ngủ; máy quét 15 phút/lần cũng giúp giữ thức.

## 8. Thứ tự làm

Mỗi bước kiểm xong, báo số thật, rồi mới sang bước sau.

1. `packages/core` + `scanner` chạy trên máy, in ra kết quả thật 1000 coin (chưa ghi đâu cả).
2. Migration Supabase + RLS + login `coin_scanner` (đổi database thật).
3. Tạo repo public `coin-radar`, workflow quét, chạy thử trên GitHub để xác định nguồn bị chặn.
4. Web: đăng nhập, bảng, heatmap, chi tiết, sổ tín hiệu.
5. Phát hành GitHub Pages, kiểm trên web thật.
