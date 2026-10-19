# Coin Radar — Thiết kế

Ngày: 19/10/2026 · Cập nhật: 19/10/2026 (đưa bộ nguyên tắc + phản biện vào) · Trạng thái: chờ người dùng duyệt

## Mục tiêu

Một web riêng giúp chủ dự án phân tích kỹ thuật **top 1000 coin** theo vốn hóa, với dữ liệu hiện trạng,
để sàng lọc nên chú ý coin nào, rủi ro ra sao, kế hoạch lệnh thế nào, và tín hiệu đã thắng/thua bao nhiêu.

Không phải mục tiêu:
- Không vẽ lại biểu đồ nến (người dùng xem trên sàn; web có nút mở biểu đồ sàn).
- Không đặt lệnh, không kết nối tài khoản sàn, không cầm API key sàn.
- Không cảnh báo Telegram/email ở bản này.
- Không cam kết lợi nhuận. Mọi con số thắng/thua là thống kê, ghi rõ nguồn gốc (quá khứ hay thực tế).

## Tài liệu nguồn của bộ nguyên tắc

| Tài liệu | Vai trò |
|---|---|
| `reports/Bộ nguyên tắc phân tích coin.md` | Nghiên cứu: căn cứ từng nguyên tắc, 27 kịch bản biến động, bảng dữ liệu cần lấy |
| `reports/Phản biện bộ nguyên tắc.md` | Phản biện độc lập: 24 lỗi (5 nghiêm trọng), sửa đổi đề xuất |
| `research_notes/Bộ nguyên tắc phân tích coin/` | 8 ghi chú gốc có nguồn |

Thiết kế này đã áp dụng **toàn bộ mục 5 của bản phản biện**. Mọi ngưỡng số dưới đây là **điểm khởi đầu
chưa backtest**, trừ khi ghi khác. Mỗi nguyên tắc trong code mang mã (ví dụ `G-01`, `S-03`) để trang
“Nguyên tắc” trên web và lý do chấm điểm của từng coin trỏ về cùng một chỗ.

## Quyết định đã chốt với người dùng

| Vấn đề | Quyết định |
|---|---|
| Kiểu đầu tư | Cả **Swing** (trung hạn) và **Lướt ngắn** |
| Hạ tầng | Máy quét chạy nền → Supabase → Web |
| Vị trí | Web **độc lập**, repo public mới `tienhoandhd-droid/coin-radar` |
| Ai xem được | **Chỉ admin** đăng nhập; dữ liệu khóa bằng RLS |
| Supabase | **Dùng chung dự án của Pháp Sư**, không đụng bảng game |
| Biểu đồ nến | **Không vẽ**; không thêm `lightweight-charts` |
| Quyền | Cho phép đổi database (thêm bảng `coin_*`), tạo repo public, push — từng bước |

**Còn chờ người dùng chốt:** chế độ Lướt ngắn hiện “Đạt tiêu chí mua” ngay (nhãn “thử nghiệm”) hay chạy
ẩn — chỉ ghi sổ — cho tới khi đủ 100 lệnh thực tế có kỳ vọng dương (khuyến nghị của phản biện).

## 1. Kiến trúc

```
CoinGecko (danh sách top 1000, mỗi giờ)          ─┐
Binance → OKX → Bybit (nến, taker, perp), Coinbase/Kraken dự phòng ─┼─► scanner/ (GitHub Actions, ~15 phút, phút lệch)
Bối cảnh: Coinbase premium, F&G, DefiLlama, Deribit, lịch sự kiện  ─┘       dùng packages/core
                                 ▼
                 Supabase (dự án Pháp Sư): bảng coin_*  — RLS: chỉ admin đọc
                                 ▼
                 web/ (Vite + React + TS → GitHub Pages) — đăng nhập Supabase
```

| Thư mục | Vai trò | Phụ thuộc |
|---|---|---|
| `packages/core/` | Hàm thuần TypeScript: chỉ báo, cổng, điểm, cờ, kế hoạch lệnh, rủi ro, backtest, thống kê, ghép sàn, **danh mục nguyên tắc** | Không có |
| `scanner/` | Lấy dữ liệu, gọi `core`, ghi Supabase qua `psql` | `core`, `psql` có sẵn trên runner |
| `web/` | Giao diện | `core`, React, Vite, `@supabase/supabase-js` |
| `supabase/` | Migration SQL các bảng `coin_*`, script cài login `coin_scanner` | — |
| `data/events/` | Lịch sự kiện nhập tay (FOMC, CPI, BOJ…) dạng JSON | — |
| `docs/`, `reports/`, `research_notes/` | Thiết kế, nghiên cứu, báo cáo kiểm | — |

Thư viện web (cùng bộ với Pháp Sư): `react`, `react-dom`, `vite`, `typescript`, `@supabase/supabase-js`,
phiên bản theo đúng bản Pháp Sư. Không thêm thư viện biểu đồ; heatmap tự vẽ bằng CSS grid.

## 2. Dữ liệu đầu vào

Chi tiết endpoint, giới hạn, độ phủ: bảng “(2) Dữ liệu cần lấy” trong báo cáo nghiên cứu. Bản này lấy
**ưu tiên 1–3**; ưu tiên 4–5 để sau.

| Nhóm | Lấy gì | Tần suất |
|---|---|---|
| Danh sách | CoinGecko `/coins/markets` 4 trang (Demo key miễn phí) + `/global` | **Mỗi giờ** (≈2.900 lượt/tháng, dưới hạn 10.000); đếm lượt, cảnh báo khi > 80% |
| Nến | 1D × 300, 4H × 500, 1H × 500 + trường **taker buy** (Binance) | Mỗi lượt |
| Thanh khoản | `ticker/24hr`, `bookTicker` (spread) | Mỗi lượt |
| Perp | Bybit tickers linear (funding, OI), OKX open-interest SWAP | Mỗi lượt |
| Bối cảnh | Coinbase premium, Fear & Greed, DefiLlama stablecoin (giá → lệch neo), MA200 tuần BTC | Mỗi lượt / mỗi ngày |
| Sự kiện | `data/events/*.json`: FOMC, CPI, BOJ (nhập tay); đáo hạn quyền chọn quý (tự tính) | Đọc mỗi lượt |
| Sổ lệnh | Độ sâu ±2% **chỉ cho coin đang đạt tiêu chí hoặc đang có lệnh mở** | Mỗi lượt |

Quy tắc dữ liệu:
- **Ghim nguồn chính cho từng coin**; nguồn lỗi → coin đó hiện “dữ liệu cũ”, **không tạo tín hiệu**, không
  tự đổi sàn giữa chừng.
- Ghép sàn: `<SYMBOL>USDT`, Binance → OKX → Bybit. Trùng ký hiệu → coin vốn hóa lớn hơn. **Kiểm chéo giá
  sàn với CoinGecko: lệch > 5% → nghi ghép sai, không chấm.** Phát hiện chuỗi giá gãy (đổi ticker/
  chuyển đổi token) và nến dị thường chỉ ở một sàn.
- Loại stablecoin, token bọc/staking (danh sách trong code, có test).
- Coin không ghép được: vẫn hiện giá/% từ CoinGecko, điểm “—”.
- Chỉ dùng **nến đã đóng**.
- **Kiểm chứng bắt buộc trước khi dựng hạ tầng:** chạy thử trên runner GitHub (Mỹ) để biết nguồn nào trả
  451/403; nếu Binance bị chặn → OKX làm nguồn chính, Coinbase/Kraken dự phòng, và **trọng số taker phải
  xem lại** (taker miễn phí chủ yếu từ nến Binance).

## 3. Bộ nguyên tắc chấm điểm

Ba tầng tách riêng, mỗi tầng backtest riêng được.

### 3.1 Chế độ thị trường (Lên / Đi ngang / Xuống)

- Dùng **SMA200 ngày của BTC**, có vùng đệm ±2% hoặc xác nhận 2 nến 1D để không nhấp nháy.
- Lên: BTC trên SMA200 và SMA50 > SMA200. Xuống: dưới SMA200 và giảm > 20% từ đỉnh. Còn lại: Đi ngang.
- Xuống → không có “Đạt tiêu chí mua”. Đi ngang → trần lệnh đồng thời giảm (mục 3.6).
- **Cầu dao biến động:** BTC −4% trong 4H, hoặc biên độ nến 1H > 3×ATR1H → dừng tín hiệu mới 12h (Swing) /
  6h (Lướt ngắn).

### 3.2 Tầng 1 — Cổng loại trừ (không qua = không bao giờ “Đạt tiêu chí mua”)

| Mã | Cổng |
|---|---|
| G-01 | Chế độ thị trường không phải “Xuống”; cầu dao không bật |
| G-02 | Đủ dữ liệu: ≥ 250 nến khởi động; độ phủ dữ liệu ≥ 70% |
| G-03 | Thanh khoản tối thiểu (khối lượng USDT sàn lớn) + spread tối đa — ngưỡng tự hiệu chỉnh theo phân bố thật |
| G-04 | Không đang bị bơm: tăng > 15%/1H kèm z-score khối lượng > 5 |
| G-05 | Coin < 90 ngày tuổi: không vào ở Lướt ngắn; rủi ro tối thiểu “Cao” |
| G-06 | Không có hack trong 7 ngày, không bị gắn Monitoring/hủy niêm yết, không lệch neo stablecoin |
| G-07 | Lướt ngắn: ngoài cửa sổ FOMC (−4h/+2h), CPI (±2h), BOJ; cờ ±24h đáo hạn quyền chọn quý |
| G-08 | Giá kiểm chéo khớp CoinGecko; nguồn dữ liệu không “cũ” |

### 3.3 Tầng 2 — Điểm 0–100

| Mã | Thành phần | Swing | Lướt ngắn |
|---|---|---|---|
| S-01 | **Đà giá**: xu hướng (giá/SMA20–50 khung xu hướng; thứ tự EMA là phụ) + sức mạnh tương đối so với BTC 7–21 ngày chia biến động (chỉ coin thanh khoản cao) + RSI > 50 / MACD histogram dương | 70 | 55 |
| S-02 | **Dòng tiền**: mất cân bằng taker (Swing 7×1D/30×4H; Lướt ngắn 4–12×1H, **bỏ 30 phút gần nhất**) + khối lượng bất thường cùng chiều nến | 15 | 25 |
| S-03 | **Đường đi lên**: chốt lời 1 có nằm trước kháng cự dày không (pivot đã xác nhận, số tròn, số lần bật, độ dày sổ lệnh nếu có) | 15 | 20 |

- Điểm **chuẩn hóa theo tổng trọng số có dữ liệu**, hiện “độ phủ dữ liệu %”.
- Coin nhỏ: **không** thưởng tăng mạnh 24h (coin nhỏ hay đảo chiều).
- Bỏ hẳn: “gần dải Bollinger dưới”, RSI 30/70 bắt đáy, “khối lượng > TB20” đơn thuần.

### 3.4 Tầng 3 — Điểm trừ và cờ (chỉ trừ, không cộng)

| Mã | Điều chỉnh | Swing | Lướt ngắn |
|---|---|---|---|
| F-01 | Funding/basis quá nhiệt (z-score cao so 30 ngày; chỉ coin có perp) | −10 | −10 |
| F-02 | Coin nhỏ trong top 5% lợi nhuận 24h | cờ | −10 |
| F-03 | Mở khóa token lớn trong 30 ngày (nếu có dữ liệu) | −10 | cờ |
| F-04 | Đi ngang + beta > 1 + tương quan > 0,7 với BTC; Fear & Greed ≥ 80; khối lượng bất thường kéo dài; niêm yết sàn lớn trong 72h | cờ | cờ |
| F-05 | BTC dominance, USDT.D, ngành, MVRV, Coinbase premium, Kimchi premium | chỉ hiển thị bối cảnh | như Swing |

### 3.5 Quyết định tín hiệu

- **Chỉ ra quyết định khi nến khung vào lệnh đóng**; lượt quét ở giữa chỉ cập nhật giá và cờ.
- **“Đạt tiêu chí mua”** = qua mọi cổng + điểm ≥ 70 + top 10% thứ hạng trong nhóm thanh khoản.
- **Hysteresis** (*độ trễ chống nhấp nháy*): vào ≥ 70, chỉ rời khi < 60. Mỗi coin × chế độ một tín hiệu mở;
  sau khi đóng, chờ 1 nến khung xu hướng mới cho tín hiệu lại.
- Nhãn: **Đạt tiêu chí mua / Theo dõi / Không đạt** (không dùng “Mua / Tránh”). Ghi rõ “điểm xếp hạng,
  không phải xác suất thắng”.

### 3.6 Quản lý vốn (mới — lỗi nghiêm trọng #1 của phản biện)

- Người dùng nhập **vốn** và **% rủi ro/lệnh** (lưu trong trình duyệt). Mặc định: 0,5% (Swing, rủi ro
  Thấp/Vừa); 0,25% (rủi ro Cao/Rất cao, hoặc Lướt ngắn).
- App tính **số lượng coin** và **số tiền mất nếu chạm cắt lỗ** cho từng kế hoạch.
- **Trần:** tổng rủi ro đang mở 3%; tối đa 5 lệnh altcoin cùng lúc (Đi ngang: 3); tối đa 2 lệnh cùng ngành.
  Vượt trần → chỉ 5 coin xếp hạng cao nhất có nhãn “ưu tiên”. Lý do: altcoin tương quan 0,7–0,96 với BTC,
  20 tín hiệu cùng lúc thực chất là một ván cược.

### 3.7 Kế hoạch lệnh

| Mục | Swing | Lướt ngắn |
|---|---|---|
| ATR dùng | ATR(14) nến 1D | ATR(14) nến 1H |
| Cắt lỗ | thấp hơn giữa (pivot − 0,5×ATR) và (giá vào − 2×ATR); nằm sát số tròn → đẩy xuống dưới số tròn | như Swing, 2,5×ATR1H |
| Giá vào tối đa | giá đóng + 0,3×ATR; vượt → “Đã chạy – bỏ qua” | như Swing |
| Chốt lời | 1/3 ở 1,5R → dời cắt lỗ về giá vào + phí → phần còn lại trailing chandelier 3×ATR | như Swing |
| Dừng theo thời gian | chưa đạt +1R sau 10 ngày; trần cứng 30 ngày | chưa đạt +1R sau 48h; trần 96h |

**Lệnh đang mở gặp kịch bản xấu** (cầu dao, chế độ chuyển Xuống, hack, lệch neo…): bảng kịch bản có cột
“Lệnh đang mở” — thoát / giảm / siết cắt lỗ. App hiện hành động gợi ý trên lệnh đang theo dõi.

### 3.8 Mức rủi ro

Thấp / Vừa / Cao / Rất cao từ: ATR% khung ngày (mốc khởi đầu ≤ 4% / 4–6% / 6–10% / > 10%, tự hiệu chỉnh theo
phân bố thật), thanh khoản, sụt giảm lớn nhất 90 ngày, tuổi coin, MC/FDV, beta với BTC, OI/vốn hóa (nếu có
perp), cờ khối lượng ảo.

### 3.9 Kịch bản biến động

Lấy **27 kịch bản** trong báo cáo + **9 kịch bản bổ sung** từ phản biện (sốc không lịch như 10/10/2025, giá dị
thường một sàn, đổi ticker/chuyển đổi token, niêm yết phái sinh mới…). Mỗi kịch bản trong `core` có: mã,
dấu hiệu nhận biết bằng dữ liệu (nếu tự phát hiện được), hành động với tín hiệu mới, hành động với lệnh
đang mở, mức căn cứ. Kịch bản không tự phát hiện được → chỉ hiển thị trên trang Nguyên tắc.

## 4. Đo kết quả (backtest và sổ tín hiệu thực tế)

- Kết quả mỗi lệnh = **R thực sau phí và trượt giá**. Phí khứ hồi theo nhóm thanh khoản: 0,25% / 0,5% / 1,0%.
  Giá nhảy qua cắt lỗ → khớp ở giá mở cửa trừ trượt giá. Một nến chạm cả hai mức → tính thua (Lướt ngắn:
  phân xử bằng nến 5 phút, báo tỷ lệ ca không phân xử được).
- **Không hiện % thắng theo từng coin.** Hiện số gộp theo nhóm thanh khoản, chỉ hiện % khi ≥ 100 lệnh, luôn
  kèm: khoảng tin cậy Wilson, kỳ vọng R (expectancy) kèm khoảng tin cậy, sụt giảm lớn nhất (R), chuỗi thua
  dài nhất, profit factor, và so với vào lệnh ngẫu nhiên.
- Walk-forward 12 tháng huấn luyện / 3 tháng kiểm; ghi nhật ký số lần thử tham số.
- **Point-in-time** (*chỉ dùng thông tin có tại thời điểm đó*): pivot chỉ dùng sau N nến xác nhận; ngưỡng
  ATR%/thanh khoản theo cửa sổ trượt; sự kiện có trường thời điểm biết được.
- Backtest trên danh sách coin hiện tại → nhãn **“Kết quả bị thổi phồng do chỉ gồm coin còn sống”**.
- Sổ thực tế: ghi **giá lúc ghi DB** (không phải giá đóng nến); khóa duy nhất (coin, chế độ, thời điểm nến);
  cầu dao sổ: −6R → gợi ý giảm một nửa rủi ro; −10R → tạm dừng nhãn “Đạt tiêu chí mua”.

## 5. Supabase

Dự án Pháp Sư; schema `public`, tiền tố `coin_` (không phải đổi cấu hình API của game).

| Bảng | Nội dung |
|---|---|
| `coin_scan_runs` | Mỗi lượt quét: thời gian, số coin, lỗi, nguồn bị chặn, lượt gọi CoinGecko; giữ 30 ngày |
| `coin_snapshots` | Kết quả mới nhất mỗi coin × chế độ: giá, điểm, độ phủ, lý do (mã nguyên tắc), cờ, rủi ro, kế hoạch lệnh; ghi đè |
| `coin_signals` | Sổ tín hiệu thực tế, khóa duy nhất (coin, chế độ, thời điểm nến) |
| `coin_market` | Bối cảnh thị trường mỗi lượt: chế độ, cầu dao, dominance, F&G, Coinbase premium… |

- RLS bật cả 4 bảng; `select` chỉ khi `private.is_active_admin()`; `anon` không có quyền.
- Máy quét: login Postgres `coin_scanner` chỉ có `execute` hàm `coin_ingest(jsonb)` (security definer),
  ghi cả lượt trong một transaction; theo mẫu `project_heartbeat` (pooler, `verify-full`, ghim CA).
- Chụp lược đồ trước khi áp migration. Web đọc theo trang (PostgREST tối đa 1000 dòng/lần).

## 6. Giao diện

1. **Đăng nhập** bằng tài khoản admin Pháp Sư; không phải admin → “không có quyền”.
2. **Đầu trang:** chế độ thị trường, cầu dao, BTC, sự kiện sắp tới, “Đang chấm điểm N/1000 coin”, giờ cập
   nhật (> 60 phút → đỏ “dữ liệu cũ”; > 2 giờ không có lượt quét → cảnh báo), nút Swing / Lướt ngắn.
3. **Heatmap:** ô theo vốn hóa, màu theo % 24h hoặc điểm.
4. **Bảng xếp hạng:** lọc theo nhãn, rủi ro, nhóm vốn hóa, ngành; sắp theo điểm; tìm tên.
5. **Chi tiết coin:** điểm + độ phủ + **lý do theo mã nguyên tắc**, cờ, kế hoạch lệnh (vùng giá vào, giá vào
   tối đa, cắt lỗ, chốt lời, **số lượng và số tiền có thể mất**), rủi ro, lịch sử tín hiệu, nút mở biểu đồ sàn.
6. **Danh mục theo dõi:** tổng rủi ro đang mở so với trần, hành động gợi ý cho lệnh đang mở khi có kịch bản xấu.
7. **Sổ tín hiệu:** số gộp theo nhóm, kèm khoảng tin cậy, kỳ vọng R, sụt giảm, chuỗi thua.
8. **Trang Nguyên tắc** (mới): toàn bộ cổng, điểm, cờ, kế hoạch lệnh, quản lý vốn, 36 kịch bản biến động —
   mỗi mục có mã, mức căn cứ (Có bằng chứng / Thực hành ngành / Truyền miệng), nguồn, và trạng thái
   (đang dùng / chỉ hiển thị / chờ backtest). Sinh từ cùng danh mục trong `core`, nên trang và máy chấm
   không thể lệch nhau.
9. **Trang giới thiệu:** chuỗi 7–10 lệnh thua liên tiếp là bình thường; lợi thế chính là giảm sụt giảm,
   không phải thắng nhiều.
10. Đủ 4 trạng thái: đang tải, lỗi (kèm nội dung), rỗng, có dữ liệu. Dùng được trên điện thoại.
11. Dòng miễn trừ cố định: “Phân tích kỹ thuật tự động từ số liệu quá khứ. Không phải lời khuyên tài chính.”

## 7. Kiểm thử

| Phần | Cách kiểm |
|---|---|
| Chỉ báo | So bảng số tham chiếu đã công bố (nguồn ghi trong test) |
| Cổng, điểm, cờ, kế hoạch lệnh, quản lý vốn | Test hành vi viết trước code |
| Backtest | Không nhìn trước tương lai; ca chạm cả hai mức; phí/trượt giá; gap qua cắt lỗ |
| Thống kê | Wilson, expectancy, chuỗi thua — so số tính tay |
| Danh mục nguyên tắc | Mọi mã dùng trong máy chấm đều có trong danh mục và ngược lại |
| Ghép sàn, kiểm chéo giá | Dữ liệu mẫu, gồm ca trùng ký hiệu và giá lệch > 5% |
| RLS | Postgres thật: tài khoản thường 0 dòng, admin đọc được, `coin_scanner` không đọc được bảng game |
| Máy quét | Chạy thật trên máy, rồi trên GitHub Actions; dán số coin quét / lỗi / nguồn bị chặn |
| Web | Typecheck, lint, build; kiểm trình duyệt với dữ liệu thật sau đăng nhập |

## 8. Giới hạn đã biết (ghi trên web và báo cáo)

- Gần như mọi ngưỡng là đề xuất chưa backtest; Lướt ngắn ít căn cứ nhất.
- Nghiên cứu momentum chủ yếu là long-short; app chỉ mua nên kết quả thực tế thấp hơn số trong nghiên cứu.
- Lịch GitHub Actions có thể trễ/bỏ lượt; repo public không hoạt động 60 ngày bị GitHub tắt lịch.
- Coin không có trên Binance/OKX/Bybit không được chấm điểm.
- Không có nguồn miễn phí ổn định cho dòng tiền ETF, lịch mở khóa token, bản đồ thanh lý.

## 9. Thứ tự làm

Mỗi bước kiểm xong, báo số thật, rồi mới sang bước sau.

1. Chạy thử nguồn dữ liệu trên runner GitHub (Mỹ) — quyết định nguồn chính.
2. `packages/core` (chỉ báo, cổng, điểm, cờ, kế hoạch lệnh, danh mục nguyên tắc) + `scanner` chạy trên máy,
   in kết quả thật 1000 coin (chưa ghi đâu cả).
3. Backtest + thống kê trên dữ liệu lịch sử; hiệu chỉnh ngưỡng có nhật ký số lần thử.
4. Migration Supabase + RLS + login `coin_scanner` (đổi database thật).
5. Workflow quét trên GitHub Actions ghi Supabase.
6. Web: đăng nhập, đầu trang, heatmap, bảng, chi tiết, danh mục theo dõi, sổ tín hiệu, trang Nguyên tắc.
7. Phát hành GitHub Pages, kiểm trên web thật.
