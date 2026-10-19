# Yếu tố bổ sung cho BTC — rà soát theo góc nhìn người giao dịch

Ngày 19/10/2026. Phần này **không** qua vòng nghiên cứu có trích dẫn như 7 ghi chú còn lại; đây là
danh sách rà soát từ kinh nghiệm thực hành. Mức căn cứ ghi cho từng mục là đánh giá của người rà soát,
**cần kiểm nguồn trước khi đưa thành quy tắc chấm điểm**. Riêng phần “Nguồn dữ liệu” đã gọi thử thật
ngày 19/10/2026 từ máy người dùng (không phải IP Mỹ).

## 1. Coinbase Premium — cầu giao ngay từ Mỹ

- **Là gì:** chênh lệch giá BTC trên Coinbase (USD) so với Binance (USDT). Dương = nhà đầu tư Mỹ / tổ
  chức đang mua mạnh hơn; âm = Mỹ đang bán hoặc đứng ngoài.
- **Vì sao quan trọng:** từ khi có ETF giao ngay (01/2024), phần lớn cầu tổ chức đi qua Coinbase (bên lưu
  ký của đa số ETF). Premium âm kéo dài thường đi cùng giai đoạn giá yếu.
- **Mức căn cứ:** Thực hành ngành. Lưu ý USDT không đúng bằng 1 USD, nên chênh lệch nhỏ (±0,1%) có thể
  chỉ là chênh lệch tỉ giá USDT/USD.
- **Dùng thế nào:** bối cảnh thị trường (không chấm từng coin). Theo dõi xu hướng 24h–7 ngày, không phải
  giá trị tức thời.
- **Nguồn (đã thử, 200):** `api.exchange.coinbase.com/products/BTC-USD/ticker` và `/candles`. Đo thử:
  Coinbase 82.542,1 / Binance 82.630,0 → premium −0,106%.

## 2. Thị trường quyền chọn (options): ngày đáo hạn và “max pain”

- **Ngày đáo hạn:** Deribit đáo hạn 08:00 UTC thứ Sáu; đáo hạn **cuối tháng** và **cuối quý** (tháng 3, 6,
  9, 12) có khối lượng hợp đồng rất lớn. Giá hay dao động mạnh / bị “ghim” quanh vài mức giá trong những
  ngày sát đáo hạn.
- **Max pain:** mức giá khiến tổng giá trị quyền chọn hết hạn có lời thấp nhất. Giả thuyết “giá bị kéo về
  max pain” là **Truyền miệng** với crypto; hiện tượng “ghim giá” khi đáo hạn có nghiên cứu trên cổ phiếu
  nhưng chưa thấy nghiên cứu crypto chắc chắn.
- **Dùng thế nào:** cờ sự kiện cho chế độ Lướt ngắn (trước đáo hạn quý ±24h: cảnh báo biến động), không
  dùng để đoán hướng.
- **Nguồn (đã thử, 200):** Deribit `public/get_book_summary_by_currency?currency=BTC&kind=option` (có OI
  từng mã quyền chọn → tự tính max pain và tỉ lệ put/call), `public/get_volatility_index_data` (DVOL).

## 3. Vị thế quỹ lớn trên CME (báo cáo COT)

- **Là gì:** CFTC công bố hằng tuần (thứ Sáu, số liệu chốt thứ Ba) vị thế của quỹ đầu cơ (Leveraged
  Funds), quản lý tài sản (Asset Managers), đại lý trên hợp đồng Bitcoin CME.
- **Vì sao quan trọng:** quỹ đầu cơ bán khống CME nhiều thường là giao dịch chênh lệch (mua ETF, bán CME
  ăn basis), **không phải** đặt cược giá giảm. Đọc sai rất dễ.
- **Mức căn cứ:** Thực hành ngành; bằng chứng dự báo từ COT ở hàng hoá truyền thống lẫn lộn.
- **Dùng thế nào:** bối cảnh tuần, chỉ BTC/ETH.
- **Nguồn:** file chính thức `https://www.cftc.gov/dea/newcot/FinFutWk.txt` (đã thử, 200; dòng
  “BITCOIN - CHICAGO MERCANTILE EXCHANGE”, báo cáo ngày 2026-10-13). API Socrata
  `publicreporting.cftc.gov` thử với một mã dataset **trả 403** — chưa xác định mã đúng, không dùng.
- **Khoảng trống CME (CME gap):** niềm tin “giá luôn quay lại lấp khoảng trống cuối tuần của CME” là
  **Truyền miệng**, không đưa vào chấm điểm.

## 4. Thợ đào (miner)

- **Hashrate, độ khó, hashprice:** khi giá giảm mạnh mà chi phí điện không đổi, thợ đào yếu phải bán BTC
  hoặc tắt máy (“miner capitulation”). Chỉ báo “Hash Ribbons” (MA30/MA60 của hashrate) được giới phân tích
  dùng để báo đáy trung hạn.
- **Mức căn cứ:** Thực hành ngành / Truyền miệng; ít lần quan sát.
- **Dùng thế nào:** bối cảnh dài hạn cho Swing, trọng số nhỏ.
- **Nguồn (đã thử, 200):** `mempool.space/api/v1/mining/hashrate/3m`, `/api/v1/difficulty-adjustment`.

## 5. Nguồn cung treo (supply overhang) từ các ví lớn đã biết

- **Là gì:** các khối BTC lớn có thể bị bán: chính phủ (Mỹ, Đức, Anh… từ tịch thu), quỹ phá sản / hoàn
  trả (Mt.Gox, FTX), và ngược lại là **bên mua lớn đều đặn** (công ty giữ BTC trong kho bạc như Strategy,
  các “công ty kho bạc” khác). Khi một ví chính phủ chuyển BTC lên sàn, thị trường thường phản ứng ngay.
- **Mức căn cứ:** Thực hành ngành (sự kiện có thật, đo lường hệ thống còn ít).
- **Dùng thế nào:** cờ sự kiện thủ công (người dùng nhập), vì dữ liệu ví gắn nhãn miễn phí (Arkham…) cần
  key/đăng ký — **chưa kiểm**.

## 6. Thanh khoản toàn cầu ngoài Fed: Ngân hàng Nhật (BOJ) và carry trade đồng Yên

- **Là gì:** nhà đầu tư vay Yên lãi thấp để mua tài sản rủi ro. Khi BOJ tăng lãi hoặc Yên tăng mạnh, họ
  bán tháo để trả nợ — BTC bị kéo theo (ví dụ ngày 05/08/2024, thị trường toàn cầu sập cùng lúc).
- **Mức căn cứ:** Thực hành ngành; sự kiện lịch sử có thật, chưa có nghiên cứu crypto riêng.
- **Dùng thế nào:** thêm **lịch họp BOJ** vào bộ lọc sự kiện cạnh FOMC/CPI; theo dõi USD/JPY biến động
  mạnh như cờ rủi ro toàn thị trường.
- **Nguồn:** USD/JPY có trên FRED (`DEXJPUS`, bản CSV không cần key — theo ghi chú vĩ mô); lịch BOJ phải
  nhập tay.

## 7. Phí bảo hiểm Hàn Quốc (Kimchi premium)

- **Là gì:** BTC trên sàn Hàn Quốc (Upbit, giá KRW) đắt hơn giá quốc tế. Premium cao (vài %) thường báo
  hiệu nhà đầu tư nhỏ lẻ đang hưng phấn quá mức.
- **Mức căn cứ:** Có nghiên cứu về sự tồn tại và nguyên nhân (kiểm soát vốn); khả năng **dự báo** là
  Thực hành ngành.
- **Dùng thế nào:** cờ “quá nóng” bối cảnh thị trường.
- **Nguồn (đã thử, 200):** `api.upbit.com/v1/ticker?markets=KRW-BTC` + tỉ giá USD/KRW (FRED `DEXKOUS`).

## 8. Rủi ro hạ tầng: stablecoin và sàn

- Tether/USDC mất neo, sàn lớn ngừng rút tiền hoặc vỡ nợ (tiền lệ FTX 11/2022) → cả thị trường sập.
  Ghi chú vĩ mô đã có phần mất neo stablecoin; bổ sung thêm **giá USDT/USD** làm cờ cảnh báo
  (Kraken có cặp `USDTUSD` — chưa kiểm).

## 9. Mốc thời gian kỹ thuật

- **Giờ đóng nến ngày/tuần (00:00 UTC, Chủ nhật)**, **giờ mở cửa phiên Mỹ (13:30 UTC)** và **CME mở lại
  chiều Chủ nhật**: biến động thường dồn vào các mốc này. Nến chưa đóng không được dùng (đã có trong
  thiết kế).
- **Đáo hạn/đảo hợp đồng tương lai theo quý** trên CME và các sàn: cùng ngày với đáo hạn quyền chọn quý.

## 10. Mốc giá theo chi phí vốn của người nắm giữ

- **Giá thực hiện (realized price) của người nắm giữ ngắn hạn (STH)** và **MA 200 tuần** là các vùng hỗ
  trợ / kháng cự lớn mà giới giao dịch BTC theo dõi. MA 200 tuần tính được từ nến tuần miễn phí;
  realized price cần dữ liệu on-chain (CoinMetrics community có `CapRealUSD` cho BTC — theo ghi chú
  on-chain; **chưa kiểm**).
- **Mức căn cứ:** Thực hành ngành.

## Nguồn dự phòng nếu Binance chặn IP Mỹ

Coinbase (`api.exchange.coinbase.com`, đã thử 200) và Kraken (`api.kraken.com/0/public`, đã thử 200) là
sàn Mỹ, khả năng cao **không** chặn runner GitHub. Độ phủ altcoin của hai sàn thấp hơn Binance/OKX nhiều
— chưa đếm số cặp.

## Tóm tắt ưu tiên (đề xuất)

| Ưu tiên | Yếu tố | Chi phí lấy | Phạm vi |
|---|---|---|---|
| 1 | Coinbase Premium | Rất thấp (2 lệnh gọi) | Bối cảnh toàn thị trường |
| 1 | Lịch đáo hạn options + lịch BOJ vào bộ lọc sự kiện | Thấp (tính lịch + nhập tay) | Lướt ngắn |
| 2 | MA 200 tuần, Kimchi premium, giá USDT/USD | Thấp | Bối cảnh |
| 3 | COT CME, hashrate/thợ đào, max pain / put-call | Trung bình | Chỉ BTC/ETH, tham khảo |
| 4 | Ví chính phủ / Mt.Gox, công ty kho bạc | Nhập tay | Cờ sự kiện |
| Bỏ | CME gap, “giá bị hút về max pain” | — | Truyền miệng |
