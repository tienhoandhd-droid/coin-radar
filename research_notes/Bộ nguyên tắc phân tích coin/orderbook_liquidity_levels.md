# Độ "dày" vùng hỗ trợ/kháng cự theo thanh khoản tại mức giá (order book, liquidation heatmap, volume profile)

> Ghi chú cho người tổng hợp: ngày nghiên cứu 2026-10-19. Nhãn: [EVIDENCE] = nghiên cứu có số liệu/peer-review/arXiv; [INDUSTRY] = tài liệu nhà cung cấp/sàn/đo đạc thực tế; [FOLKLORE] = niềm tin trader chưa được kiểm chứng. Các phép đo "[ĐO TRỰC TIẾP]" được chạy bằng curl/python từ máy này (máy KHÔNG đặt ở Mỹ) vào 2026-10-19 — chỉ là một snapshot (ảnh chụp tức thời), không phải thống kê.

## 1. Order-book depth & imbalance có dự báo giá không, ở khung thời gian nào?

### Takeaway
Bằng chứng mạnh cho thấy imbalance (mất cân bằng) của sổ lệnh / order flow giải thích biến động giá ở khung **mili-giây đến vài giây/phút**, và tác động giá tỉ lệ nghịch với depth (độ sâu). Ở khung 1H–4H–1D, chưa tìm thấy bằng chứng rằng *sổ lệnh tĩnh* (resting depth) dự báo giá; bằng chứng duy nhất ở khung giờ là **taker order imbalance** (dòng lệnh khớp chủ động, lấy từ trade, không phải sổ lệnh) dự báo lợi suất 4–12 giờ với hiệu ứng nhỏ (vài bp).

### Cited Findings
- [EVIDENCE] Cont, Kukanov, Stoikov: trên 50 cổ phiếu Mỹ (NYSE TAQ), thay đổi giá ở khoảng thời gian ngắn chủ yếu do order flow imbalance (OFI); quan hệ tuyến tính, **độ dốc tỉ lệ nghịch với market depth**; ổn định qua các khung thời gian và cổ phiếu — [arXiv 1011.6402](https://arxiv.org/abs/1011.6402). (Một nguồn thứ cấp nói R² ~70%, không xác minh được từ abstract — [Medium/TDS](https://medium.com/data-science/price-impact-of-order-book-imbalance-in-cryptocurrency-markets-bf39695246f6).)
- [EVIDENCE] Binance BTC/USDT, dùng sự kiện Binance chuyển từ 0 phí sang có phí (3/2023): sức giải thích của OFI cho thay đổi giá tăng từ **R² 5% lên 21,55%** sau khi có phí; dữ liệu tần suất cao (ms) — [Springer chapter "Fee Structure and Order Flow Informativeness"](https://link.springer.com/chapter/10.1007/978-3-032-18109-1_13) (chỉ đọc qua tóm tắt tìm kiếm; trang bị paywall).
- [EVIDENCE] Nghiên cứu BTC trên Bybit/OKEx hồi quy lợi suất kỳ sau theo order book imbalance ở các khung **100 ms đến 10 giây** — [arXiv 2306.17178](https://arxiv.org/pdf/2306.17178).
- [EVIDENCE] Mota Navarro et al. (sổ lệnh BTC-e): kích thước "gap" (khoảng trống giá) trong sổ lệnh hiện tại hầu như không giúp dự báo lợi suất cực đại tương lai; quan hệ chỉ là "nhân quả tức thời" (cùng kỳ) — [arXiv 2106.02187](https://arxiv.org/pdf/2106.02187).
- [EVIDENCE] Trong thị trường BTC phân mảnh, lệnh thụ động (passive, resting) chủ yếu *phản ứng* theo dòng lệnh chủ động, nên mang ít thông tin mới — [arXiv 2108.09750](https://arxiv.org/pdf/2108.09750).
- [EVIDENCE] "Quarter-Hour Effect" (Binance USDT-M perps; BTC, ETH, XRP, SOL, DOGE, ADA; 1/2021–10/2024): order imbalance **dựa trên trade** (cờ `isBuyerMaker`, net signed volume / tổng volume, dải −1…1; *không* dùng dữ liệu sổ lệnh) ở đầu mỗi 15 phút dự báo lợi suất **4–12 giờ**; ý nghĩa 95% cho 4/6 hợp đồng; thành phần lagged-flow đóng góp ổn định **5–6 bp**, thành phần tín hiệu công khai tăng từ <1 bp (4h) lên 9,8 bp (8h) và 16,9 bp (12h); khung 1 và 5 phút gần như không dự báo; OOS R² trung bình 2,46–3,37%; tác giả nói đây là liên hệ dự báo, không phải nhân quả — [arXiv 2607.09426](https://arxiv.org/html/2607.09426v2).

### Inferences
- Snapshot sổ lệnh 15 phút/lần **không** nên được dùng như tín hiệu dự báo hướng giá kiểu imbalance cổ điển ở khung 1H–1D: hiệu ứng nằm ở giây-phút và bị nhiễu bởi lệnh bị hủy. Dùng depth đúng hơn là thước đo **chi phí để đẩy giá qua một vùng** (tác động giá ∝ 1/depth, theo Cont et al.), tức "độ dày" chứ không phải "hướng".
- Thứ dự báo được ở khung giờ là **taker flow** (lấy từ aggTrades/klines: Binance kline có trường taker buy base/quote volume). Đây là input khả thi hơn cho scanner 15 phút (đề xuất: tính taker-buy ratio 1H/4H từ klines, rẻ: weight 2/request).

### Gaps
- Không tìm thấy nghiên cứu học thuật nào kiểm định *resting depth* (±1–2%) dự báo lợi suất crypto ở khung 1H–1D.
- Không lấy được R² theo từng horizon của arXiv 2306.17178 (chưa mở toàn văn).

## 2. Spoofing / tường giả: độ tin cậy của depth hiển thị và cách lọc

### Takeaway
Spoofing (đặt lệnh lớn rồi hủy để tạo ảo giác cung/cầu) là có thật trong crypto; một nghiên cứu Level-3 năm 2024 ước tính **~31% lệnh lớn** có khả năng spoof. Lệnh càng xa giá tốt nhất càng ít khả năng là spoof (vì ít khả năng bị khớp lẫn ít tác động), nhưng cũng càng ít "thật" trong ý nghĩa sẽ được khớp. Snapshot định kỳ bỏ sót các lệnh sống ngắn, nên bộ lọc thực tế duy nhất cho scanner 15 phút là **độ bền (persistence) qua nhiều snapshot**.

### Cited Findings
- [EVIDENCE] Fabre & Challet, dữ liệu Level-3 sàn tập trung crypto 4–7/12/2024: mô hình bỏ qua *khoảng cách đặt lệnh so với giá tốt nhất* là không đầy đủ; ước tính **31% lệnh lớn** có thể spoof thị trường (có kỳ vọng lợi nhuận thao túng dương) — [arXiv 2504.15908](https://arxiv.org/abs/2504.15908).
- [EVIDENCE] Định nghĩa vận hành của spoofing dùng trong một mô hình phát hiện: lệnh lớn bị hủy, nằm gần bid-ask, và biến động tăng sau đó; ví dụ ETH/USD Kraken 3/2020 — [arXiv 2110.03687](https://arxiv.org/pdf/2110.03687).
- [EVIDENCE] Lệnh lớn bị hủy ở xa mid-price khó có khả năng là spoofing — [arXiv 2308.08683](https://arxiv.org/pdf/2308.08683).
- [INDUSTRY] Giám sát thị trường dùng cancel rate, cancel-to-trade ratio, thời gian sống của lệnh; spoof tập trung ở lệnh sống rất ngắn; phát hiện cần dữ liệu sự kiện đầy đủ theo thời gian chứ **không phải snapshot định kỳ** (snapshot bỏ sót lệnh sống ngắn) — [Elliptic](https://www.elliptic.co/corpus/gen-3103/spoofing-finance/detecting-exchange-order-book-spoofing-and-layering-in-crypto-markets.html).
- [INDUSTRY/báo chí] Lệnh bán 2.500 BTC (~212 triệu USD) trên Binance biến mất (4/2025) — [Yahoo Finance](https://finance.yahoo.com/news/vanishing-212m-bitcoin-order-caused-130604349.html).
- [INDUSTRY] Lệnh trên heatmap "có thể bị sửa hoặc rút ngay khi giá tới gần"; stop order không bao giờ hiện trong sổ lệnh — [NexusFi](https://nexusfi.com/a/market-structure/order-flow-heatmaps-liquidity-visualization).
- [FOLKLORE] Con số "cancel rate bình thường 15–35%" lan truyền trên blog không có nguồn dữ liệu — [theledgermind](https://theledgermind.com/?p=1056) (không nên dùng).

### Inferences
- Quy tắc lọc đề xuất (heuristic, chưa được kiểm định): chỉ tính một "tường" (wall) là thật nếu cùng bucket giá (ví dụ bucket 0,25% giá) có depth ≥ k × median depth của các bucket lân cận **trong ≥ 3 snapshot liên tiếp (≥ 45 phút)** và không dịch chuyển theo giá. Tường xuất hiện–biến mất giữa 2 snapshot → loại.
- Chiết khấu depth hiển thị: dựa trên con số 31% lệnh lớn có thể spoof, một hệ số an toàn hợp lý là chỉ tin ~50–70% depth lớn bất thường (đây là suy luận, không phải chuẩn công bố).

### Gaps
- Không có nghiên cứu công khai nào đo tỷ lệ hủy tường lớn trên Binance/OKX theo từng coin vốn hóa nhỏ.
- Chưa có số liệu "bao nhiêu % depth trong ±2% biến mất khi giá chạm tới" — cần tự thu thập (lưu snapshot rồi so sánh).

## 3. Liquidity heatmap được xây thế nào; scanner 15 phút sao chép được gì

### Takeaway
Heatmap kiểu Bookmap/TradingLite/Coinglass-orderbook = xếp chồng các snapshot sổ lệnh theo thời gian trên lưới giá × thời gian, màu = khối lượng chờ. Bookmap cập nhật theo từng sự kiện; scanner 15 phút chỉ tạo được heatmap "thô" (96 cột/ngày), đủ để thấy tường bền nhiều giờ nhưng mù với tường sống ngắn. Hạn chế quan trọng hơn: **số level REST trả về không phủ đủ ±2% cho coin lớn** do tick size nhỏ.

### Cited Findings
- [INDUSTRY] Heatmap vẽ lệnh limit chờ theo thời gian (trục ngang thời gian, trục dọc giá), màu sáng = nhiều lệnh; công cụ chụp sổ lệnh theo lịch và đặt cạnh nhau — [Bookmap blog](https://blog.bookmap.com/blog/heatmap-in-trading-the-complete-guide-to-market-depth-visualization); [NexusFi](https://nexusfi.com/a/market-structure/order-flow-heatmaps-liquidity-visualization).
- [INDUSTRY] Script TradingView "giả Bookmap" dùng volume lịch sử chứ không phải dữ liệu L2 → chỉ thấy nơi đã khớp, không phải nơi lệnh đang chờ — [LuxAlgo](https://www.luxalgo.com/library/concept/resting-liquidity-liquidity-heatmap.md).
- [ĐO TRỰC TIẾP] Phạm vi giá mà REST depth phủ được (snapshot 2026-10-19):
  - Binance spot BTCUSDT: limit=100 → ±0,02%; limit=1000 → ~±0,25%; limit=5000 → bid −1,13% / ask +0,91%. ⇒ ngay cả limit tối đa cũng **không phủ hết ±1%** của BTC.
  - OKX BTC-USDT: `books` sz=400 → −0,15%/+0,24%; `books-full` sz=5000 → −1,17%/+1,12%.
  - Bybit spot BTCUSDT limit=1000 → −1,03%/+0,56%.
  - Kraken XBTUSD count=500 → −2,59%/+1,71%.
  - Coinbase BTC-USD `level=2` → toàn bộ sổ gộp theo giá (~20.900 bid / ~20.200 ask level), phủ 100%.
  - Altcoin: Binance SOLUSDT limit=1000 → ±9,5%; ARUSDT limit=100 → −3,5%/+3,0%, limit=1000 → ~±85%; PEPEUSDT limit=1000 → −96%/+246%.
  - (Nguồn: tự chạy curl tới [Binance](https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=5000), [OKX](https://www.okx.com/api/v5/market/books-full?instId=BTC-USDT&sz=5000), [Bybit](https://api.bybit.com/v5/market/orderbook?category=spot&symbol=BTCUSDT&limit=1000), [Kraken](https://api.kraken.com/0/public/Depth?pair=XBTUSD&count=500), [Coinbase](https://api.exchange.coinbase.com/products/BTC-USD/book?level=2).)

### Inferences
- Với coin top (BTC/ETH), muốn đo ±2–5% phải dùng Coinbase level=2 (full book), hoặc chấp nhận chỉ đo ±1%. Với đa số altcoin, Binance limit=100–500 đã phủ ±3% trở lên.
- Quy tắc thực tế: chọn `limit` động — gọi limit=100 trước; nếu level xa nhất chưa tới ±2% thì gọi lại với limit lớn hơn. Ghi rõ cờ `depth_truncated=true` nếu vẫn chưa phủ đủ, để engine không hiểu nhầm "không có tường" là "mỏng".
- Heatmap thô từ snapshot 15 phút: lưu depth theo bucket (ví dụ 0,25% hoặc 0,5% giá) cho mỗi coin, giữ 24–96 snapshot gần nhất → tính `persistence = số snapshot bucket đó vượt ngưỡng / tổng`.

### Gaps
- Không tìm được tài liệu kỹ thuật chính thức của Bookmap/TradingLite về tần suất lấy mẫu và cách chuẩn hóa màu.

## 4. Đo "độ dày tường": depth trong ±X% so với volume giao dịch

### Takeaway
Chuẩn ngành là **market depth ±1% / ±2% quanh mid-price tính bằng USD** (Kaiko). Chưa có chuẩn học thuật cho tỷ lệ "depth / volume giờ", nhưng nó là cách chuẩn hóa tự nhiên giữa 1000 coin khác quy mô: số giờ khối lượng taker cần để "ăn" hết thanh khoản trong vùng.

### Cited Findings
- [INDUSTRY] Kaiko định nghĩa Market Depth = tổng khối lượng bid và ask trong 0–10% từ best bid/ask; có các chỉ số `bid_volume_1`/`ask_volume_1` = giá trị USD của bid/ask trong 1% quanh mid; Kaiko thừa nhận **không thu đủ snapshot 10% ở mọi sàn**, nên với một số sàn số liệu không phản ánh đúng — [Kaiko docs Market Depth](https://docs.kaiko.com/kaiko-rest-api/market-data/order-books/order-book-snapshots/market-depth); [Kaiko example](https://docs.kaiko.com/getting-started/kaiko-examples/compare-market-depth-between-exchanges).
- [INDUSTRY] Kaiko công bố "2% depth" tách bid/ask theo USD — [Kaiko dataplus](https://dataplus.kaiko.com/asset/liquidity). Lý do chọn 2% (cân bằng giữa quá hẹp và quá rộng) là quan điểm của CryptoSlate, không phải phương pháp Kaiko — [CryptoSlate](https://cryptoslate.com/how-do-us-exchanges-contribute-to-bitcoins-market-liquidity/).
- [EVIDENCE] Tác động giá của order flow tỉ lệ nghịch với depth — [arXiv 1011.6402](https://arxiv.org/abs/1011.6402).
- [ĐO TRỰC TIẾP] Ví dụ snapshot Binance spot 2026-10-19: BTCUSDT depth ±1% (limit 5000, chưa phủ đủ): bid ~$22,3M / ask ~$24,9M. SOLUSDT ±1%: ~$4,27M mỗi bên. ARUSDT: ask trong +2% ≈ **$82.680**; volume 24h ≈ **$1,65M** → volume trung bình/giờ ≈ $68.900 ⇒ ask ±2% ≈ **1,2 giờ tổng volume** (≈ 2,4 giờ nếu taker-buy chiếm ~50%). (Tự tính từ [depth](https://api.binance.com/api/v3/depth?symbol=ARUSDT&limit=1000) và [ticker/24hr](https://api.binance.com/api/v3/ticker/24hr?symbol=ARUSDT).)

### Inferences — công thức đề xuất (có thể tính ngay)
- `ask_depth_zone` = Σ(giá × khối lượng) các ask trong vùng kháng cự [Z_low, Z_high] (hoặc trong +X% từ mid). Tương tự `bid_depth_zone` cho hỗ trợ.
- `taker_buy_per_hour` = trung bình `taker buy quote volume` của 24 nến 1H gần nhất (Binance klines cột 10).
- **`hours_to_absorb` = ask_depth_zone × persistence_discount / taker_buy_per_hour.** Ngưỡng gợi ý (heuristic, cần backtest): < 0,5h = mỏng (dễ phá); 0,5–2h = trung bình; > 2h = dày. Với Swing (1D/4H) so với taker trung bình **ngày**; Short-term (4H/1H) so với taker trung bình **giờ**.
- `depth_imbalance_2pct = (bid_2% − ask_2%)/(bid_2% + ask_2%)` chỉ dùng làm thông tin phụ (xem mục 1: dự báo yếu ở khung giờ).
- Chuẩn hóa chéo coin: `depth_2pct / volume_24h` (phần trăm) cho phép so sánh coin $50M với coin $5B.

### Gaps
- Không có nghiên cứu xác nhận ngưỡng "số giờ để hấp thụ" nào dự báo tỷ lệ phá vùng. Ngưỡng trên là đề xuất cần kiểm chứng.
- Depth một sàn ≠ depth toàn thị trường (thanh khoản phân mảnh nhiều sàn).

## 5. Liquidation heatmap (kiểu Coinglass): cách ước tính, độ chính xác, "nam châm thanh khoản"

### Takeaway
Liquidation heatmap là **ước tính mô hình** (OI × phân phối đòn bẩy giả định × giá vào lệnh giả định), không phải dữ liệu vị thế thật (trừ Hyperliquid, nơi vị thế on-chain công khai). Không tìm thấy nghiên cứu nào kiểm định "giá bị hút về cụm thanh lý"; đây hiện là [FOLKLORE]/[INDUSTRY]. API heatmap của Coinglass yêu cầu gói trả phí cao.

### Cited Findings
- [INDUSTRY] Coinglass API: `GET https://open-api-v4.coinglass.com/api/futures/liquidation/heatmap/model1`, tham số `exchange`, `symbol`, `range` (12h…1y), header `CG-API-KEY`; **chỉ gói Professional/Enterprise** (Hobbyist/Startup/Standard không có) — [Coinglass docs](https://docs.coinglass.com/reference/liquidation-heatmap).
- [INDUSTRY] Đầu vào được mô tả gồm open interest, funding và mô hình phân phối đòn bẩy — [DEXTools guide](https://www.dextools.io/tutorials/how-to-read-liquidation-maps-in-crypto-guide-2026). Script tự dựng trên TradingView back-solve giá thanh lý cho nhiều mức đòn bẩy, lấy volume mỗi nến làm proxy kích thước vị thế; tác giả thừa nhận khác với dữ liệu sàn, chỉ "trùng các cụm lớn", mật độ tuyệt đối khác — [TradingView script](https://www.tradingview.com/script/2WzPEzZ4/).
- [EVIDENCE] Cascade thanh lý 10/2025 (dữ liệu fill on-chain của sàn minh bạch): branching ratio ~**0,1–0,2**, tức "subcritical" sâu — chuỗi thanh lý không tự khuếch đại mạnh như kể lại — [arXiv 2608.03616](https://ideas.repec.org/p/arx/papers/2608.03616.html).
- [EVIDENCE] 7 cascade BTC: không có biến cảnh báo sớm nào bất biến qua các sự kiện; dấu hiệu chỉ có ý nghĩa ở cấp tổng thể, không báo động được từng sự kiện — [arXiv 2607.27070](https://ideas.repec.org/p/arx/papers/2607.27070.html); [CryptoSlate](https://cryptoslate.com/new-bitcoin-study-shows-the-strongest-recurring-liquidation-warning-signs-cannot-warn-of-an-individual-crash/).
- [EVIDENCE, FX, cơ chế tương tự] Osler: lệnh stop-loss làm giá chạy nhanh tự củng cố ("price cascades") khi bị kích hoạt — [NY Fed SR150](https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr150.pdf).
- [FOLKLORE] "Giá bị hút về cụm thanh lý" — chỉ có bình luận thị trường, ví dụ — [MEXC news](https://www.mexc.com/news/292737).

### Inferences
- Bản tự dựng miễn phí khả thi: với mỗi coin futures, lấy OI (Binance `/fapi/v1/openInterest`) và giá trung bình có trọng số volume của các nến khi OI tăng (proxy giá vào lệnh), rồi chiếu giá thanh lý cho đòn bẩy 10×/25×/50×/100× (long: entry×(1−1/L+mmr), short: entry×(1+1/L−mmr)). Đây là ước tính thô, chỉ nên dùng để đánh dấu "vùng có thể tăng tốc khi bị phá" (cơ chế cascade như stop-loss của Osler), không dùng như nam châm.
- Diễn giải cho scoring: cụm thanh lý **short** nằm ngay trên kháng cự → nếu phá, có thể bị squeeze (giảm "độ dày" hiệu dụng của kháng cự). Ngược lại cụm long dưới hỗ trợ.

### Gaps
- Coinglass không công bố công thức/ trọng số đòn bẩy; không có nghiên cứu đo sai số của heatmap so với thanh lý thật.
- Không tìm thấy bằng chứng định lượng cho hiệu ứng "magnet".
- Chưa xác minh endpoint vị thế công khai của Hyperliquid trong lượt này.

## 6. Volume profile (VPVR, HVN/LVN) tính từ OHLCV

### Takeaway
Không tìm thấy nghiên cứu học thuật nào kiểm định HVN là hỗ trợ/kháng cự hay LVN bị đi qua nhanh — toàn bộ là [INDUSTRY]/[FOLKLORE] dựa trên Auction Market Theory. Tuy vậy, đây là chỉ báo duy nhất trong nhóm "thanh khoản tại mức giá" tính được cho đủ 1000 coin, có lịch sử, rẻ.

### Cited Findings
- [FOLKLORE/INDUSTRY] HVN thường được coi là hỗ trợ/kháng cự, LVN là vùng dễ breakout; POC (Point of Control) là "giá trị hợp lý" theo Auction Market Theory, giá lệch xa có xu hướng quay lại — không có mẫu/kết quả kiểm định — [MQL5 profile](https://www.mql5.com/en/users/chelx); [OptionsTradingIQ](https://optionstradingiq.com/volume-profile-support-resistance/) (có ví dụ vùng hỗ trợ thất bại).
- [INDUSTRY] Bản giả heatmap trên TradingView dùng volume lịch sử → cho biết nơi đã khớp, không phải nơi lệnh đang chờ — [LuxAlgo](https://www.luxalgo.com/library/concept/resting-liquidity-liquidity-heatmap.md).

### Inferences — phương pháp tính từ OHLCV
- Lấy N nến (Swing: 90–180 nến 1D hoặc 4H; Short-term: 7–14 ngày nến 1H). Chia dải [min low, max high] thành B bucket (ví dụ 50–100, hoặc bucket = 0,5% giá). Phân bổ volume mỗi nến **đều trên dải [low, high]** của nến (hoặc tam giác quanh close/typical price). Cộng dồn.
- POC = bucket max; Value Area = 70% volume quanh POC; HVN = đỉnh cục bộ > 1,5× median bucket; LVN = đáy cục bộ < 0,5× median.
- Hạn chế: phân bổ đều trong nến là giả định (sai số lớn với nến dài); volume chỉ của một sàn; volume bị thổi phồng bởi wash trading ở coin nhỏ (xem [arXiv 2108.10984](https://arxiv.org/pdf/2108.10984)); dùng nến nhỏ hơn (1H cho profile Swing) giảm sai số nhưng tốn request hơn.
- Kết hợp: vùng kháng cự trùng HVN + depth ask dày bền → "dày"; kháng cự nằm trong LVN + depth mỏng → "mỏng, dễ xuyên".

### Gaps
- Không có bằng chứng thực nghiệm cho HVN/LVN, kể cả ngoài crypto. Cần backtest nội bộ trước khi cho trọng số lớn.

## 7. Số tròn / đỉnh cũ làm hỗ trợ-kháng cự

### Takeaway
Giá BTC **tụ (clustering)** ở số tròn là có bằng chứng; nhưng nghiên cứu chính không thấy lợi suất bất thường sau số tròn. Ở FX, lệnh take-profit tụ đúng số tròn (gây đảo chiều) còn stop-loss tụ ngay sau số tròn (gây tăng tốc khi xuyên) — cơ chế này giải thích "số tròn giữ được, nhưng xuyên qua thì chạy nhanh".

### Cited Findings
- [EVIDENCE] Urquhart (2017, Economics Letters): >10% giá BTC kết thúc bằng 00; không có mẫu lợi suất đáng kể sau số tròn — [IDEAS/RePEc](https://ideas.repec.org/a/eee/ecolet/v159y2017icp145-148.html).
- [EVIDENCE] Mbanga (2019, Applied Economics Letters): clustering ở số nguyên mạnh nhất thứ Sáu, yếu nhất thứ Hai — [IDEAS/RePEc](https://ideas.repec.org/a/taf/apeclt/v26y2019i10p807-811.html).
- [EVIDENCE] Sentiment (Google Trends) giải thích ~2,5–5% mức clustering bất thường của BTC — [Boise State](https://experts.boisestate.edu/en/publications/price-clustering-and-sentiment-in-bitcoin/).
- [EVIDENCE, FX] Osler: lệnh của Royal Bank of Scotland 8/1999–4/2000, 9.655 lệnh, >55 tỷ USD; giá đặt tụ mạnh ở số tròn; take-profit tụ ở số tròn (phản hồi âm → đảo chiều), stop-loss tụ ngay sau số tròn (phản hồi dương → tăng tốc, tác động lớn và kéo dài hơn); 9,9% take-profit kết thúc "00" so với 3,8% stop-loss và 1% nếu phân bố đều — [NY Fed SR125](https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr125.pdf); [SUFE newsletter](https://academicnewsletter.sufe.edu.cn/info/361290); [ATAS](https://atas.net/blog/the-magic-of-round-numbers/) (nguồn thứ cấp cho các tỷ lệ %).

### Inferences
- Gán điểm nhỏ cho "số tròn" (ví dụ mức có nhiều số 0 so với độ lớn giá: 100.000, 1,00, 0,50) như một yếu tố cộng vào độ dày kháng cự, nhưng đánh dấu khả năng **tăng tốc sau khi xuyên** (stop cluster).

### Gaps
- Chưa thấy nghiên cứu crypto kiểm định trực tiếp số tròn/đỉnh cũ như rào cản giá.

## 8. Số lần test một mức: làm yếu hay làm mạnh?

### Takeaway
Bằng chứng học thuật duy nhất tìm được (Chung & Bellotti 2021, dữ liệu intraday) cho thấy mức S/R đảo chiều giá với tần suất có ý nghĩa thống kê, **càng bật nhiều lần trước đó thì càng dễ bật tiếp**, và xác suất bật **giảm theo tuổi** của mức. Quan điểm "test nhiều lần làm mòn cầu" là [FOLKLORE] phổ biến, mâu thuẫn với kết quả này.

### Cited Findings
- [EVIDENCE] Chung & Bellotti (arXiv 2101.07410, 2021): S/R tìm bằng thuật toán heuristic đảo chiều xu hướng ở tỷ lệ có ý nghĩa thống kê; số lần bật trước cao hơn → xác suất bật tiếp cao hơn; xác suất bật giảm theo thời gian; không giải thích được bằng AR(1) — [arXiv 2101.07410](https://arxiv.org/abs/2101.07410) (abstract không nêu con số cụ thể; dữ liệu không phải crypto theo những gì đọc được).
- [FOLKLORE] Mỗi lần test "tiêu thụ" lượng cầu giữ mức — [LuxAlgo](https://www.luxalgo.com/library/concept/support-level.md); ngược lại các indicator TradingView coi nhiều touch = mạnh hơn — [TradingView](https://www.tradingview.com/script/N1Bi54WD-Support-and-Resistance-all-in-one/).

### Inferences
- Quy tắc đề xuất: `touch_score` tăng theo số lần bật (log, bão hòa ~4–5 lần) nhân hệ số suy giảm theo tuổi (ví dụ half-life 30 ngày cho Swing, 3–5 ngày cho Short-term). Kết hợp với depth: nếu số lần test tăng mà `ask_depth_zone` giảm dần qua các lần test → tín hiệu "tường đang bị ăn mòn" (cầu nối hai trường phái; cần kiểm định).

### Gaps
- Không có con số bounce probability cụ thể, không có kiểm định trên crypto.

## 9. Endpoint miễn phí: tham số, giới hạn, chi phí cho ~1000 coin mỗi 15 phút

### Takeaway
Binance spot chỉ có **511** cặp USDT đang giao dịch và Binance USDT-M có **525** perp (đếm 2026-10-19), nên "1000 coin" phải gộp nhiều sàn. Lấy depth limit=100 cho toàn bộ Binance spot chỉ tốn ~2.555 weight (< 6.000/phút) — rất rẻ. Rủi ro lớn nhất là **HTTP 451 từ IP Mỹ/IP datacenter** (GitHub Actions) — chưa kiểm tra được từ đây.

### Cited Findings
- [INDUSTRY] Binance spot `GET /api/v3/depth`: `symbol`, `limit` mặc định 100, tối đa 5000; weight: 1–100 → **5**; 101–500 → **25**; 501–1000 → **50**; 1001–5000 → **250**. Klines weight 2; aggTrades 4; ticker/24hr: 1 symbol = 2, toàn bộ = 80 — [Binance spot docs](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints).
- [ĐO TRỰC TIẾP] `exchangeInfo` Binance spot: REQUEST_WEIGHT **6000/phút**, RAW_REQUESTS 300.000/5 phút; 511 cặp USDT TRADING. Header `x-mbx-used-weight-1m` trả về 250 cho 1 lần limit=5000 — xác nhận bảng weight. — [Binance exchangeInfo](https://api.binance.com/api/v3/exchangeInfo).
- [ĐO TRỰC TIẾP] `data-api.binance.vision/api/v3/depth` (mirror dữ liệu thị trường công khai) trả 5000 level; header weight tăng lên 500 sau lần gọi thứ 2 → **chung quỹ weight** với api.binance.com theo IP — [data-api.binance.vision](https://data-api.binance.vision/api/v3/depth?symbol=BTCUSDT&limit=5000).
- [ĐO TRỰC TIẾP] `api.binance.us` hoạt động nhưng BTCUSD limit=5000 chỉ trả ~600 level (thanh khoản mỏng hơn nhiều) — [Binance.US](https://api.binance.us/api/v3/depth?symbol=BTCUSD&limit=5000).
- [INDUSTRY] Binance USDT-M `GET /fapi/v1/depth`: limit hợp lệ 5,10,20,50,100,500,1000 (mặc định 500); weight 5–50 → **2**, 100 → **5**, 500 → **10**, 1000 → **20** — [Binance futures docs](https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Order-Book). [ĐO TRỰC TIẾP] futures REQUEST_WEIGHT **2400/phút**; 525 perp USDT TRADING — [fapi exchangeInfo](https://fapi.binance.com/fapi/v1/exchangeInfo).
- [INDUSTRY] OKX `GET /api/v5/market/books`: `instId`, `sz` tối đa **400**/bên, **40 request/2s theo IP**; `GET /api/v5/market/books-full`: `sz` tối đa **5000**/bên, **10 request/2s theo IP**; `candles` 40 req/2s (1.440 nến gần nhất), `history-candles` 20 req/2s — [OKX API v5 docs](https://www.okx.com/docs-v5/en/) (trích bằng cách tải trang docs và tìm chuỗi).
- [INDUSTRY] Bybit `GET /v5/market/orderbook`: `category`, `symbol`, `limit` — spot 1–1000 (mặc định 1; [ĐO TRỰC TIẾP] spot limit=1000 trả đủ 1000 level), linear/inverse 1–1000 (mặc định 25), option 1–25 — [Bybit docs](https://bybit-exchange.github.io/docs/v5/market/orderbook).
- [ĐO TRỰC TIẾP] Coinbase Exchange `GET /products/BTC-USD/book?level=2` trả toàn bộ sổ gộp theo giá (~20.900/20.200 level) — [Coinbase](https://api.exchange.coinbase.com/products/BTC-USD/book?level=2). Kraken `GET /0/public/Depth?pair=XBTUSD&count=500` trả 500 level; `count=5000` chỉ trả 100 (vượt max bị đưa về mặc định) — [Kraken](https://api.kraken.com/0/public/Depth?pair=XBTUSD&count=500).
- [INDUSTRY] Lỗi 451 của Binance áp theo vị trí IP máy gọi, áp cả cho endpoint công khai không cần key; nhiều dải IP cloud/datacenter bị chặn; dùng VPN/proxy để lách có thể vi phạm điều khoản Binance; 451 không nên retry — [Vercel community](https://community.vercel.com/t/binance-api-calls-on-vercel/29895); [Railway](https://station.railway.com/questions/deployment-is-crashing-7b190d57); [Octokit issue](https://redirect.github.com/octokit/plugin-retry.js/issues/447).

### Inferences — ngân sách mỗi lần quét 15 phút (tự tính)
| Nguồn | Số symbol | Cấu hình | Tổng weight/request | Giới hạn | Thời gian tối thiểu |
|---|---|---|---|---|---|
| Binance spot | 511 | limit=100 | 2.555 weight | 6.000/phút | < 1 phút |
| Binance spot | 511 | limit=1000 | 25.550 weight | 6.000/phút | ~4,3 phút |
| Binance USDT-M | 525 | limit=100 | 2.625 weight | 2.400/phút | ~1,1 phút |
| Binance USDT-M | 525 | limit=1000 | 10.500 weight | 2.400/phút | ~4,4 phút |
| OKX books | ~vài trăm | sz=400 | 1 req/coin | 40 req/2s = 1.200/phút | < 1 phút cho 1000 |
| OKX books-full | – | sz=5000 | 1 req/coin | 10 req/2s = 300/phút | ~3,3 phút cho 1000 |
- Đề xuất: Binance spot limit=100 cho tất cả, nâng lên 500/1000 chỉ cho coin mà limit=100 chưa phủ ±2% (thường là coin top tick nhỏ); fallback OKX `books` sz=400 + Bybit cho coin không có trên Binance hoặc khi bị 451. Coinbase level=2 chỉ dùng cho BTC/ETH để đo ±2–5%.
- Lưu trữ: mỗi coin chỉ cần lưu vector bucket (ví dụ 40 bucket × 2 bên) mỗi snapshot → nhẹ, đủ dựng heatmap thô và persistence.
- Chạy thử 1 job GitHub Actions gọi `api.binance.com/api/v3/ping` và `data-api.binance.vision` để xác nhận 451 trước khi phụ thuộc Binance.

### Gaps
- **Chưa kiểm tra được 451 từ runner GitHub Actions (máy nghiên cứu không ở Mỹ).** Chưa rõ `data-api.binance.vision` có bị geoblock cùng kiểu không.
- Chưa xác minh giới hạn tốc độ chính thức của Bybit, Coinbase, Kraken cho endpoint công khai trong lượt này.
- Chưa đếm tổng số coin duy nhất khi gộp Binance + OKX + Bybit (để biết có đạt 1000 coin hay không; nhiều coin top-1000 theo vốn hóa có thể chỉ niêm yết trên sàn khác như Gate/MEXC).
