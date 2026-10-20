# Nguyên nhân coin chạy ngược / vượt xa xu hướng BTC (idiosyncratic moves) và khả năng TA nắm bắt

> Bối cảnh áp dụng: Binance USDⓈ-M perps (hợp đồng vĩnh cửu ký quỹ bằng stablecoin), top-100 coin, hệ thống Swing 1D/4H, lỗ tối đa 2%/lệnh.
> Thuật ngữ: **idiosyncratic return** = phần lợi nhuận riêng của coin sau khi trừ phần "đi theo thị trường" (beta với BTC/ETH). **Event study** = nghiên cứu sự kiện, đo **abnormal return (AR)** = lợi nhuận bất thường so với mốc chuẩn, và **CAR** = AR cộng dồn qua một cửa sổ ngày. **Drift** = giá trôi dần một chiều trước/sau sự kiện. **Backtest** = chạy thử luật trên dữ liệu quá khứ.
> Ký hiệu chất lượng nguồn: **[VENDOR]** = nghiên cứu của công ty có lợi ích thương mại (bán data, market maker, sàn); **[IS]** = chỉ in-sample (đo trên chính mẫu, chưa kiểm out-of-sample); **[ACAD]** = học thuật (peer-review hoặc working paper); **[NEWS]** = báo chí/giai thoại.

## 1. Token unlocks / vesting cliffs (mở khóa token / mốc vesting)

### Takeaway
Bằng chứng nhất quán (chủ yếu vendor) cho thấy unlock gây áp lực giảm, **phần lớn xảy ra TRƯỚC ngày unlock (drift ~30 ngày)**, mạnh nhất với unlock cho team và token float thấp/mới; giá thường ổn định sau ~2 tuần. Lịch unlock **biết trước công khai**, nhưng dữ liệu lịch sử đầy đủ **không miễn phí** (Tokenomist API free trial chỉ 50 token, 1 năm lùi).

### Cited Findings
**Keyrock — "From Locked to Liquidity: What 16,000 Token Unlocks Teach Us" [VENDOR – market maker] [IS]**
- Mẫu: ~16.000 sự kiện unlock trên 40 token; chuẩn hóa giá theo **ETH** (không phải BTC) để loại beta; cửa sổ −30 đến +30 ngày; mỗi đợt của unlock tuyến tính được tính là một sự kiện riêng; loại trừ unlock để burn. Không nêu giai đoạn mẫu. — [Keyrock](https://keyrock.com/from-locked-to-liquidity-what-16000-token-unlocks-teach-us/)
- >90% unlock gây áp lực giảm giá bất kể kích cỡ/loại; unlock lớn gây giảm mạnh hơn ~2,4 lần (không rõ so với mốc nào). — [Keyrock](https://keyrock.com/from-locked-to-liquidity-what-16000-token-unlocks-teach-us/); [CryptoSlate](https://cryptoslate.com/90-of-token-unlocks-drive-prices-down-declines-begin-a-month-ahead/)
- Nhóm kích cỡ (% supply): Nano <0,1%, Micro 0,1–0,5%, Small 0,5–1%, Medium 1–5%, Large 5–10%, Huge >10%. Bài **không công bố % tác động theo từng nhóm**; nói Huge ≥ Large về hiệu suất và "kích cỡ là biến dự báo yếu hơn tần suất". Unlock >5% supply gây biến động tức thì nhưng tác động giãn dần; unlock nhỏ thường xuyên tạo áp lực giảm đều. — [Keyrock](https://keyrock.com/from-locked-to-liquidity-what-16000-token-unlocks-teach-us/); [CryptoSlate](https://cryptoslate.com/90-of-token-unlocks-drive-prices-down-declines-begin-a-month-ahead/)
- Theo người nhận: **Team** tệ nhất (drawdown ~−25%, giá giảm từ >30 ngày trước unlock); **Investor** (106 sự kiện) giảm chậm, nhỏ — được giải thích do bán qua OTC và hedge bằng options; **Ecosystem** trung bình **+1,18%** (giảm nhẹ trong 30 ngày trước rồi bật lên ngay sau unlock); Community/public giảm từ từ trước và sau. — [Keyrock](https://keyrock.com/from-locked-to-liquidity-what-16000-token-unlocks-teach-us/)
- Timing: giảm bắt đầu ~30 ngày trước, **tăng tốc ở tuần cuối (~−7 ngày)**; volume thường đỉnh ở −14 hoặc −28 ngày; giá ổn định/về trung tính trong ~14 ngày sau; biến động ngày đầu lớn với unlock lớn, tắt trong ~14 ngày. Unlock tuyến tính ít gây xáo trộn ngắn hạn hơn cliff; cliff lớn hồi phục tốt hơn sau 30 ngày. — [Keyrock](https://keyrock.com/from-locked-to-liquidity-what-16000-token-unlocks-teach-us/)
- Gợi ý timing của Keyrock: thoát ~30 ngày trước sự kiện, vào lại ~14 ngày sau unlock lớn. — [CryptoSlate](https://cryptoslate.com/90-of-token-unlocks-drive-prices-down-declines-begin-a-month-ahead/)
- Case: APE giảm 77% trong 7 tháng sau khi unlock team bắt đầu, cùng kỳ ETH −9%. — [Keyrock](https://keyrock.com/from-locked-to-liquidity-what-16000-token-unlocks-teach-us/)

**The Tie [VENDOR – bán data unlock] [IS]**
- Mẫu >350.000 sự kiện unlock, >100 token, dữ liệu từ 2016 (trình bày EthCC 2023). Trung bình giá giảm trước unlock. Với unlock **>100% khối lượng giao dịch trung bình ngày (ADV)**: giá bật lại nhanh trong ngắn hạn nhưng **trong vòng 2 tuần rơi xuống dưới mức giá ngày unlock** (người nhận chờ vài ngày rồi mới bán); volume sau unlock tăng mạnh. Không có số % cụ thể. — [The Tie](https://thetie.io/insights/research/the-3-us-of-alternative-on-chain-data)
- The Tie bán bộ dữ liệu ~100.000 sự kiện unlock lịch sử có kiểm tra hợp đồng vesting on-chain (trả phí). — [The Tie data](https://thetie.io/data/token-unlock-data)

**Tokenomist (blog 29/06/2026) [VENDOR] [IS]** — chỉ đọc được qua snippet tìm kiếm; trang đầy đủ cần đăng nhập
- 236 unlock của token vốn hóa >$10M, đo **so với BTC**: median 1 tháng **−4,85% so với nhóm đối chứng (matched peers, n=221)**; **drift 1 tháng trước sự kiện −14,7%**; hiệu ứng tập trung ở token giai đoạn đầu, float mỏng; **token đã trưởng thành, thanh khoản cao không có hiệu ứng có ý nghĩa thống kê** dưới 2 cách kiểm soát độc lập. — [Tokenomist](https://tokenomist.ai/research/do-token-unlocks-crash-prices) (số liệu từ snippet, chưa xác minh trên toàn văn)

**Học thuật**
- Luận văn UVic: 24 dự án, 492 sự kiện unlock (dữ liệu DefiLlama): unlock lớn đi kèm giảm giá và tăng biến động, giá thường giảm trước sự kiện; hiệu ứng phụ thuộc loại nhà đầu tư nhận token. Không xác minh được có đo CAR hay không. — [UVic repository](https://repositori.uvic-ucc.cat/handle/10854/180316)
- Không tìm thấy event study peer-review trên SSRN/arXiv về unlock (xem Gaps).

**Bối cảnh vĩ mô của unlock**
- Binance Research (17/05/2024, "Low Float & High FDV: How Did We Get Here?"): ước ~**$155 tỷ** token sẽ unlock giai đoạn 2024–2030; nhiều token chỉ lưu hành 6–20% tổng cung; tăng giá ban đầu "không bền khi làn sóng cung đổ vào lúc unlock". [VENDOR – sàn] — [Forklog](https://forklog.com/en/binance-highlights-155-billion-token-unlock-overhang/); [Cointelegraph](https://cointelegraph.com/news/binance-urges-small-medium-projects-high-fdv-trend)

**Nguồn dữ liệu & khả năng backtest**
- Tokenomist API (base `api.tokenomist.ai`, domain cũ `api.unlocks.app` vẫn chạy): **free trial phải điền form**, chỉ 50 token, unlock event + emission ngày **lùi 1 năm**; Standard: mọi token, lùi 1 năm; Elite: lùi 2 năm + dự phóng 3 năm tới; rate limit 60 req/phút; dữ liệu chỉ cho dùng cá nhân/phi thương mại. Bản web miễn phí xem lịch theo tháng từng dự án. Giá các gói không công khai trong docs. — [Tokenomist tier overviews](https://docs.tokenomist.ai/tier-overviews); [Tokenomist API docs](https://docs.tokenomist.ai/api-documents)
- The Tie có Token Unlock API (trả phí). — [The Tie API](https://thetie.io/solutions/token-unlock-api)

### Inferences
- Với top-100 coin trên Binance perps (phần lớn đã thanh khoản cao), kết quả Tokenomist 2026 gợi ý hiệu ứng unlock **yếu hoặc không đáng kể** với coin trưởng thành; rủi ro tập trung ở coin mới niêm yết, float thấp (<~30% lưu hành) và unlock cho team/investor lớn so với ADV.
- Vì drift xảy ra **trước** sự kiện, một luật "tránh LONG coin có unlock lớn trong N ngày tới" (N ≈ 7–30) phù hợp hơn luật "short đúng ngày unlock" (lúc đó phần lớn tác động đã vào giá). Tiêu chí kích cỡ nên dùng **unlock/ADV** (ngưỡng 100% ADV của The Tie) và **unlock/lưu hành**, không chỉ % tổng cung.
- Backtest nghiêm túc khó làm miễn phí: free trial chỉ 1 năm, 50 token → mẫu nhỏ, dễ overfit (khớp quá mức dữ liệu quá khứ).

### Gaps
- Không có số % tác động theo từng nhóm kích cỡ từ Keyrock (chỉ có trong biểu đồ, không trích được).
- Không tìm thấy event study peer-review về unlock; các số chính đều từ vendor, không có kiểm tra out-of-sample.
- Không xác minh được CryptoRank có API lịch sử unlock miễn phí hay không.
- Số Tokenomist 2026 đến từ snippet; trang đầy đủ không đọc được.

## 2. Niêm yết và hủy niêm yết sàn (listings / delistings)

### Takeaway
Niêm yết tạo AR dương ngắn hạn (lớn nhất ở Coinbase/Binance spot, giai đoạn 2018–2021), nhưng **lợi nhuận dồn trước và trong ngày niêm yết rồi mean-revert (quay về trung bình) trong 1–2 tuần**; mua sau ngày 1 thường lỗ nặng (2025: listing Binance −71,7%, Upbit/Bithumb ≈ −70% nếu mua giá đóng cửa ngày 1). Perps mới niêm yết hay đỉnh ngay ngày đầu (~50% trên Binance). Delist/Monitoring Tag gây giảm 2 chữ số trong ngày (giai thoại). Thông báo Binance **công khai, có lịch sử truy vấn được miễn phí**.

### Cited Findings
**Học thuật**
- Ante (2019), Blockchain Research Lab: 327 sự kiện niêm yết trên 22 sàn; AR trung bình **+5,7%** ngày sự kiện trong một bản tóm tắt, bản khác báo **+7,4% ngày niêm yết và +9,2% sau 3 ngày**; AR **+3,2% ở các ngày trước niêm yết** (dấu hiệu informed trading = giao dịch có thông tin); chỉ 5 sàn có AR dương có ý nghĩa, 6 sàn âm. [ACAD, dữ liệu 2018–2019] — [Blockchain Research Lab](https://www.blockchainresearchlab.org/de/2019/09/10/market-reaction-to-exchange-listings-of-cryptocurrencies-2/); số 7,4%/9,2% trích lại trong [RockawayX](https://rockawayx.com/insights/bullish-or-bearish-what-really-happens-when-tokens-list-on-a-cex). (Hai con số 5,7% và 7,4% không thống nhất giữa các bản tóm tắt.)
- Li, Luo, Wang, Wei (AFT 2025; SSRN 4715718): AR ngắn hạn sau niêm yết dương ở cả Coinbase và Binance, lớn hơn đáng kể ở Coinbase; lợi nhuận trung bình ngày đầu quanh thông báo **Coinbase 32,8%, Binance 22,7%**; Binance (ít bị quản lý hơn) dễ niêm yết coin mà chính nó đầu tư với fundamentals kém hơn. [ACAD] — [AFT 2025 abstract](https://drops.dagstuhl.de/storage/00lipics/lipics-vol354-aft2025/html/LIPIcs.AFT.2025.11/LIPIcs.AFT.2025.11.html); số % từ [slide Loyola của J. Li](https://loyola.edu/_media/sellinger-business/documents/academics/departments/finance/wealth-management-conference/speakers/J_Li.pdf)
- Laucht (luận văn EUR): 390 sự kiện cross-listing trên 11 sàn CEX 2020–2021, AR ngày niêm yết **2,35%** (mô hình constant-mean) / **2,02%** (market model). [ACAD – luận văn] — [EUR thesis](https://thesis.eur.nl/pub/65625/Laucht_603384_Thesis.pdf)

**Industry/vendor**
- The Tie (2026): 1.844 sự kiện niêm yết, 01/2023–06/2026, lợi nhuận **trừ BTC**; lợi nhuận **dồn trước ngày niêm yết** (run-up trước thông báo), số token tăng vào ngày niêm yết nhiều hơn sau đó; drift "phần lớn mean-revert trong 2 tuần" (chỗ khác: "trong 1 tuần" với token điển hình); volume tăng và giữ cao nhiều tuần (không "ăn" volume sàn khác); chu kỳ 2021–2022 phản ứng mạnh hơn. Khoảng thời gian thông báo→giao dịch: Binance vài giờ–1/2 ngày; Coinbase 48–72h; Bybit 1–3 ngày; Upbit mở nạp ~90 phút–3h trước giao dịch. Không có số % theo mốc ngày; không phân tích Binance futures. [VENDOR] [IS] — [The Tie](https://www.thetie.io/insights/what-does-an-exchange-listing-actually-deliver-in-2026)
- RockawayX (2024, Binance/Bybit/MEXC): Binance tăng ngày 1–2 rồi phai trước ngày 7; 30–60 ngày trung tính đến giảm; DiD (difference-in-differences = so với nhóm token chưa niêm yết) 7 ngày dương có ý nghĩa nhưng khoảng tin cậy rất rộng; 30/60 ngày không có ý nghĩa; Bybit có run-up trước niêm yết ("buy the rumor, sell the news"); Binance token <$100M có hiệu ứng tăng (mẫu nhỏ). Tác giả khuyên backtest chiến lược giữ <7 ngày. Trích thêm: Animoca/Ouyang et al. 2024 — giảm trung bình ~49% sau niêm yết CEX. [VENDOR] [IS, chỉ năm 2024 – năm tăng giá] — [RockawayX](https://rockawayx.com/insights/bullish-or-bearish-what-really-happens-when-tokens-list-on-a-cex)
- 4pillars: mua mọi token niêm yết mới năm 2025 ở giá đóng cửa ngày 1 → còn ~30 cent/1 USD (≈ −70%) ở cả Upbit và Bithumb; listing **Binance 2025: −71,7%**; KITE là ngoại lệ (+233% Upbit). [VENDOR – blog nghiên cứu, tác giả có thể nắm giữ token] — [4pillars](https://research.4pillars.io/en/data/content/buying-every-new-listing-on-upbit-and-bithumb-in-2025-at-day-1-close-left-you-wi)
- Blockmedia: 59 token Upbit, 144 token Bithumb năm 2025, vào lệnh ở giá đóng cửa ngày 1 để loại pump ban đầu. — [Blockmedia](https://www.blockmedia.co.kr/research-english/1064579)
- Upbit 2026: 58 thị trường KRW mới trong 7 tháng đầu 2026; volume trung bình ngày Upbit giảm từ $1,9 tỷ (T2) xuống $590M (T7); listing mới chiếm trung bình 1,2% volume sàn trong 30 ngày đầu → tín hiệu "Upbit pump" suy yếu. Altcoin chiếm 85% volume nội địa Hàn (BTC 9%, ETH 6%) do Hàn Quốc không có phái sinh crypto hợp pháp. — [4pillars 2026](https://research.4pillars.io/en/data/content/upbit-in-2026-new-listings-propping-up-the-volume); [4pillars tail](https://research.4pillars.io/en/research/the-tale-of-the-tail-in-the-korea-cex)
- Pump Hàn thường phai trong vài ngày–vài tuần khi volume về mức trước niêm yết; ví dụ HYPER +475%, CFG +177%. [NEWS] — [The Defiant](https://thedefiant.io/news/markets/korean-cex-listings-continue-to-boost-altcoins)

**Perps mới niêm yết**
- BitMEX research (01/01–18/03/2025, BitMEX/Binance/Bybit/OKX): **50% perps mới trên Binance đạt ATH (đỉnh mọi thời) ngay ngày đầu**; OKX 70,83%; BitMEX 41,7%; với những con tăng sau ngày 1, đa số đỉnh trong tuần đầu. [VENDOR – sàn] — [BitMEX blog](https://blog.bitmex.com/2025q1-derivatives-report) (link hiện trả 404, số liệu lấy từ snippet tìm kiếm)
- FMZ Quant (dữ liệu 4H Binance perps 2023): hợp đồng mới niêm yết có xu hướng giảm dài; short ngày đầu và giữ một thời gian "xác suất thắng cao" — chưa tính phí, funding, trượt giá. [Blog] [IS – 1 năm] — [StockSharp repost](https://stocksharp.com/posts/m/79763)

**Delisting / Monitoring Tag**
- Không tìm thấy nghiên cứu hệ thống. Giai thoại: tháng 7/2025 BAKE −5,58%, IDEX −3,45%, SLF −3,29% sau gắn Monitoring Tag; tháng 6/2025 BIFI/FIS/KMD/MDT giảm 2 chữ số. Binance nói Monitoring Tag "không tự động dẫn đến delist". [NEWS] — [iTiger/BeInCrypto](https://www.itiger.com/news/2541807819); [iTiger](https://www.itiger.com/news/2549588158)
- Đợt delist 04/2026 (A2Z, FORTH, HOOK, IDEX, LRC, NTRN, RDNT, SXP): cả 8 giảm 2 chữ số, IDEX −33% trong ngày (1 nguồn chất lượng thấp). Đợt 12/2025 (FIS, REI, VOXEL): volume ngày <$1M trước thông báo. [NEWS] — [askfuzz](https://askfuzz.ai/discover/news/cryptocurrencies/binance-flags-3-altcoins-for-delisting-risk); [Kavout](https://www.kavout.com/market-lens/what-s-happening-with-binance-s-latest-delisting)

**Dữ liệu thông báo Binance — đã kiểm thử thật (20/10/2026)**
- Endpoint công khai không cần key: `https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&pageNo=1&pageSize=N&catalogId=48` trả về JSON với `catalogName: "New Cryptocurrency Listing"`, `total: 2283` bài, mỗi bài có `title` và `releaseDate` (epoch ms); `catalogId=161` = "Delisting", `total: 441` bài (ví dụ "Binance Will Delist EPIC, QUICK on 2026-10-28"). Đây là API nội bộ không có tài liệu chính thức → có thể đổi bất cứ lúc nào. — kiểm thử trực tiếp bằng `curl` (không có URL tài liệu).

### Inferences
- Với hệ Swing 1D/4H: phần lớn hiệu ứng listing xảy ra **trong vài giờ đến 1–2 ngày** (Binance thông báo chỉ trước vài giờ) → quá nhanh cho nến 1D; thứ còn lại cho swing là **pha mean-revert/giảm sau đó**. Luật hợp lý: không LONG perps mới niêm yết trong N ngày đầu (N ≈ 7–30), vì ~50% đạt đỉnh ngay ngày 1.
- Top-100 coin hiếm khi là token mới niêm yết, nên luật này chủ yếu tác động khi coin mới nhảy vào top-100 (thường là token low-float).
- Monitoring Tag/delist: luật loại coin khỏi danh sách giao dịch ngay khi có tag là phòng thủ rẻ; dữ liệu thông báo lấy được miễn phí qua endpoint trên.

### Gaps
- Không tìm thấy event study học thuật riêng cho **Binance futures listing**, **Monitoring Tag**, hay **delisting** có AR/CAR.
- Không có số % +1d/+7d/+30d từ The Tie 2026 (chỉ có trong biểu đồ).
- Bài BitMEX gốc trả 404 khi kiểm tra.

## 3. Hack/exploit, hành động pháp lý (SEC), tin dự án

### Takeaway
Hack gây AR âm có ý nghĩa ngày 0 và cửa sổ 3 ngày, trung bình ~−14% với các vụ lớn 2020–2022; vụ SEC 06/2023 làm 18 token bị gọi là "chứng khoán" giảm >11% trung bình so với BTC/ETH −2%. Cả hai **không biết trước**. Tin tốt (partnership, mainnet) không có event study đáng tin trong phạm vi tìm kiếm. Phản ứng với tin xấu mạnh hơn tin tốt.

### Cited Findings
- Complexity Science Hub: 22 vụ tấn công lớn 2020–2022; 12 vụ token sập sau đó; thiệt hại gián tiếp do giảm giá ~**$1,3 tỷ** so với ~$454M bị lấy cắp trực tiếp; token bị ảnh hưởng mất trung bình **14%** giá trị; có cả trường hợp tăng giá ngược trực giác. [ACAD] — [CSH](https://csh.ac.at/news/crypto-hacks-price-drops-often-outweigh-direct-losses/)
- HICSS-58 (2025) / luận văn UBC: AR âm có ý nghĩa ngày bị tấn công và cửa sổ 3 ngày quanh ngày đó; dự án dịch vụ tài chính chịu lỗ lớn hơn; **thông báo chính thức trên X gây hại nhiều hơn im lặng**. [ACAD] — [HICSS/ScholarSpace](https://scholarspace.manoa.hawaii.edu/items/2c663177-bd09-47fe-9c39-9ae4d560b542); [UBC](https://open.library.ubc.ca/cIRcle/collections/24/items/1.0440990)
- Corbet et al. (Economics Letters 2019): hack làm tăng biến động coin bị tấn công và tương quan chéo giữa các coin; **AR trước sự kiện về 0 khi tin được công bố**. [ACAD] — [DCU repository](https://doras.dcu.ie/25982)
- SEC kiện Binance (05/06/2023) và Coinbase (06/06/2023): 18 token bị gọi là chứng khoán (trừ BUSD) giảm **>11% trung bình**, BTC và ETH chỉ ~−2%; ~$300M long bị thanh lý; giờ đầu sau đơn kiện Binance: BTC −4%, ETH −4,5%, BNB −8%; chiều hôm sau thị trường gần như xóa hết mức giảm liên quan Binance. Tổng giá trị token bị nêu tên >$120 tỷ. [NEWS] — [Blockworks](https://blockworks.co/news/securities-bnb-sec-suits); [Fortune](https://dc.fortune.com/crypto/2023/06/05/bitcoin-ether-bnb-and-other-tokens-tank-after-sec-sues-binance-and-changpeng-zhao/); [Bloomberg Law](https://news.bloomberglaw.com/crypto/secs-net-now-covers-115-billion-of-crypto-after-binance-suit)
- Mehdian, Gherghina & Stoica (Studies in Economics and Finance): phân tích intraday ngày SEC kiện Binance — biến động tăng vọt bất kể nhà đầu tư coi tin là tốt hay xấu; phản ứng lẫn lộn. [ACAD] — [IDEAS/RePEc](https://ideas.repec.org/a/eme/sefpps/sef-08-2024-0521.html)
- Hashemi Joo, Nishikawa & Dandapani (Applied Economics 2020; BTC/ETH/XRP): AR cao ngày sự kiện; CAR tiếp tục phân kỳ trong cửa sổ (−3,+6) và (0,+6) → **thông tin không được phản ánh hết ngay**; tin xấu tác động mạnh hơn tin tốt. [ACAD] — [IDEAS/RePEc](https://ideas.repec.org/a/taf/applec/v52y2020i44p4794-4808.html)

### Inferences
- Hack/SEC là rủi ro **gap** (nhảy giá) không dự báo được → bảo vệ chính là **kích thước vị thế + stop**: với 2% max loss, stop phải tính được trong kịch bản trượt giá vì gap −10–15% trong vài giờ.
- Bằng chứng gợi ý tin xấu có drift kéo dài vài ngày (CAR đến +6 ngày), nên với hệ 1D, sau hack/kiện pháp lý **không bắt đáy** trong vài ngày đầu là hợp lý.

### Gaps
- Không tìm thấy event study hệ thống cho partnership, mainnet launch, airdrop.
- Không có dataset hack miễn phí được kiểm chứng trong phạm vi tìm kiếm này (ví dụ DeFiLlama hacks, Rekt — chưa xác minh).

## 4. Cơ chế cung–cầu (thanh lý, funding, OI, thao túng, low-float/high-FDV, buyback/burn)

### Takeaway
Bằng chứng định lượng nghiêm túc rất ít. Sự kiện lớn nhất (10/10/2025, ~$19 tỷ thanh lý) cho thấy altcoin rơi sâu hơn BTC nhiều lần trong cascade thanh lý; funding/OI cực đoan là heuristic (kinh nghiệm), chưa có backtest peer-review cho altcoin. Pump-and-dump có dấu vết volume nhưng ~70% volume trước sự kiện dồn trong 1 giờ cuối → quá nhanh cho 4H/1D.

### Cited Findings
- 10–11/10/2025: thanh lý ~$19,1–19,37 tỷ trong ~24h (≈$16,69 tỷ long, $2,46 tỷ short); CoinGlass cho rằng thực tế có thể $30–40 tỷ. BTC giảm ~18% từ đỉnh 6/10 về ~$104.782; >97% top-100 altcoin giảm cùng lúc, vài token nhỏ có lúc −99% trước khi hồi một phần. Nguyên nhân khuếch đại: đòn bẩy cao, thanh khoản altcoin mỏng, lỗi oracle giá của Binance (Binance bồi hoàn $283M). [NEWS] — [KuCoin News](https://www.kucoin.com/news/flash/crypto-market-sees-19-15b-liquidation-event-on-october-10-2025); [RockawayX](https://rockawayx.com/insights/crypto-market-update-october-2025); [Coin360](https://coin360.com/news/crypto-market-liquidation-2025-trump-tariffs)
- Whale Alert: nhiều tuần đòn bẩy tăng và cung trên sàn giảm trước 10/10/2025. [NEWS/vendor] — [Whale Alert](https://whale-alert.io/stories/b18701fb9e3a7e/Weeks-of-rising-leverage-falling-exchange-supply-preceded-Oct-10-2025-19B-Bitcoin-long-liquidation-early-warning-signs-to-watch)
- Funding: Levolytics thấy perps altcoin funding cao có xu hướng tiếp tục tăng (không đảo chiều ngay); funding âm phổ biến ở altcoin nhưng hiếm ở BTC; cặp có OI lớn có spike funding lớn hơn; "funding âm một mình không đủ để long". [Blog] [IS, không rõ mẫu] — [Levolytics](https://levolytics.substack.com/p/crypto-funding-rates-study)
- OI tăng cùng funding cực đoan = tích lũy một chiều nguy hiểm; sau cascade thanh lý thường là đáy/đỉnh cục bộ (heuristic, không backtest). — [Trading Strategy glossary](https://tradingstrategy.ai/glossary/open-interest)
- Số sự kiện funding cực đoan giảm ~90% từ 2016 (dữ liệu BitMEX trích lại) → tín hiệu cũ có thể yếu đi. — [Spark glossary](https://www.spark.money/glossary/funding-rate)
- Pump-and-dump: Kamps & Kleinberg (Crime Science 2018) đề xuất tiêu chí phát hiện bằng ngưỡng thích nghi trên giá/volume; tác giả nhấn mạnh không có dataset P&D xác nhận đáng tin. Karbalaii (arXiv 2025): **70% volume trước sự kiện giao dịch trong 1 giờ trước thông báo pump**. [ACAD] — [Kamps & Kleinberg](https://crimesciencejournal.biomedcentral.com/track/pdf/10.1186/s40163-018-0093-5); [arXiv 2504.15790](https://arxiv.org/html/2504.15790v1)
- Low-float/high-FDV (FDV = định giá pha loãng hoàn toàn = giá × tổng cung tối đa): Binance Research 2024 — lưu hành 6–20% tổng cung ở nhiều token, ~$155 tỷ sẽ unlock 2024–2030, tăng giá ban đầu không bền. [VENDOR] — [Forklog](https://forklog.com/en/binance-highlights-155-billion-token-unlock-overhang/)
- Buyback vs unlock: bài bitsonblocks (01/2026) chỉ là mô hình giả định (doanh thu $1M/tháng, 80% buyback, giả định 70% người nhận unlock bán → giá cân bằng ~$1,14), **không phải dữ liệu thực nghiệm**. — [bitsonblocks](https://bitsonblocks.net/2026/01/24/impact-buybacks-unlocks-token-price/)

### Inferences
- Trong cascade thanh lý, beta altcoin với BTC tăng đột biến (một chiều đi xuống) → idiosyncratic không còn là "riêng": quản trị rủi ro theo tương quan tổng danh mục quan trọng hơn chọn coin.
- Funding/OI có thể dùng làm **bộ lọc né** (không mở long khi funding cực dương + OI tăng dốc) hơn là tín hiệu vào lệnh — vì bằng chứng cho đảo chiều là heuristic.

### Gaps
- Không tìm thấy nghiên cứu peer-review đo lợi nhuận sau funding cực đoan/OI build-up riêng cho altcoin perps.
- Không có event study thực nghiệm về buyback/burn (ví dụ HYPE, JUP) trong phạm vi tìm kiếm.
- Không có số đo hệ thống short squeeze (ép short) trên perps mỏng.

## 5. Xoay vòng narrative / sector (AI, meme, RWA…)

### Takeaway
Có bằng chứng học thuật về **comovement** (cùng chuyển động) theo nhóm phong cách và momentum ở nhóm vốn hóa lớn, nhưng **không tìm thấy nghiên cứu học thuật đo lan tỏa momentum theo narrative (AI/meme/RWA)**. Công cụ thực tế chủ yếu là indicator TradingView chưa được kiểm định.

### Cited Findings
- Abd Rabbo & Disli (Research in International Business and Finance, 2025): comovement mạnh hơn giữa các coin cùng nhóm (theo tốc độ giao dịch) — ủng hộ giả thuyết "style investing" (dòng tiền theo nhóm). [ACAD] — [IDEAS](https://ideas.repec.org/a/eee/riibaf/v77y2025ipbs0275531925002053.html); [HBKU](https://elmi.hbku.edu.qa/en/publications/style-investing-and-return-comovement-in-the-cryptocurrency-marke/)
- Cong, Karolyi, Tang & Zhao: phân loại theo chức năng kinh tế; **momentum ở nhóm vốn hóa lớn nhất, reversal ở các nhóm khác**; các loại token có cấu trúc lợi nhuận khác nhau; phê phán phân loại kiểu CoinMarketCap là tùy tiện. [ACAD – working paper] — [EFMA 2022](https://www.efmaefm.org/0EFMAMEETINGS/EFMA%20ANNUAL%20MEETINGS/2022-Rome/papers/EFMA%202022_stage-3032_question-Full%20Paper_id-231.pdf)
- Fieberg, Liedtke, Metko & Zaremba (Quantitative Finance 2023): >3.900 coin; factor momentum xuất phát từ price momentum. [ACAD] — [ICM open](https://open.icm.edu.pl/items/d9f44e22-0614-4db8-8585-6dcba8906bb5)
- Kaiko "Beyond Homogeneity": xét hành vi factor (market, size, momentum, low-vol) trong từng nhóm Crypto Native, RWA, MEME. [VENDOR] — [Kaiko](https://www.kaiko.com/reports/beyond-homogenity-a-taxonomic-approach-to-cryptocurrency-factor-models)
- Indicator "sector rotation" trên TradingView so vốn hóa gộp 7–8 narrative (L1, meme, AI…) với TOTAL; chuẩn hóa 0–100 trên 5.000 nến; chưa kiểm định. — [TradingView](https://www.tradingview.com/script/SDNzXUDS/)

### Inferences
- Với swing 1D, một bộ lọc "sức mạnh nhóm" (nhóm của coin đang mạnh hơn TOTAL/BTC) có cơ sở gián tiếp (comovement theo nhóm + momentum ở coin lớn), nhưng phải tự backtest; định nghĩa nhóm (CoinGecko categories) là tùy tiện theo Cong et al.

### Gaps
- Không tìm thấy nghiên cứu đo tốc độ/độ dài lan tỏa narrative (ví dụ AI 2023–2024, meme 2024) giữa coin dẫn đầu và coin theo sau.

## 6. Chart/TA có biểu diễn được các cú chạy này không?

### Takeaway
(a) **Có rò rỉ thông tin trước niêm yết** (Coinbase: 10–25% sự kiện có dấu hiệu insider; AR +3,2% trước niêm yết trong Ante 2019) nhưng xảy ra trong giờ–ngày, ở DEX/coin nhỏ; (b) **momentum ngắn hạn ở coin lớn, reversal ở coin nhỏ/kém thanh khoản** (ngày và tuần); (c) phản ứng tin tức **không hoàn toàn tức thì** — có drift vài ngày, nhất là tin xấu; listing thì drift dương ngắn rồi mean-revert trong 1–2 tuần; (d) luật thực hành có nguồn rõ chỉ có vài cái (thoát 30 ngày trước unlock / vào lại 14 ngày sau; giữ <7 ngày quanh listing), còn lại là suy luận.

### Cited Findings
**Rò rỉ thông tin / insider trước tin**
- Félez-Viñas, Johnson & Putniņš (UTS, preprint 2022): 146 thông báo niêm yết Coinbase 25/09/2018–01/05/2022, theo dõi giá DEX từ −300h đến +100h; **insider trading ước tính ở 10–25% sự kiện** (cận dưới); lợi nhuận insider ~$1,5M; mẫu hình run-up giống các vụ insider cổ phiếu đã bị truy tố; dùng dữ liệu on-chain xác định ví. Bị phê bình là "vội kết luận". [ACAD – preprint] — [Decrypt](https://decrypt.co/107671/coinbase-insider-trading-problem-study); [UTS](https://www.uts.edu.au/node/366616); [Blockworks](https://www.blockworks.com/news/coinbase-insider-traders-profit-1-5m-since-2018-academic-study)
- DOJ từng truy tố một cựu product manager Coinbase và 2 người liên quan vì insider trading niêm yết. — [Decrypt](https://decrypt.co/107671/coinbase-insider-trading-problem-study)
- Ante (2019): AR +3,2% trong những ngày trước niêm yết. — [Blockchain Research Lab](https://www.blockchainresearchlab.org/de/2019/09/10/market-reaction-to-exchange-listings-of-cryptocurrencies-2/)
- The Tie 2026: lợi nhuận bắt đầu tăng trước Day 0 (run-up trước thông báo). [VENDOR] — [The Tie](https://www.thetie.io/insights/what-does-an-exchange-listing-actually-deliver-in-2026). RockawayX: Binance không thấy xu hướng tăng trước niêm yết rõ, Bybit có. [VENDOR] — [RockawayX](https://rockawayx.com/insights/bullish-or-bearish-what-really-happens-when-tokens-list-on-a-cex)
- Case: ví tích lũy LQTY ngay trước thông báo Binance (không chứng minh insider). — [Thanefield](https://thanefield.substack.com/p/accumulation-of-lqty-pre-binance). Binance xác nhận một nhân viên dùng tài khoản công ty để bơm token cá nhân +4.600% trong vài phút. [NEWS] — [CryptoSlate](https://cryptoslate.com/binance-confirmed-a-rogue-employee-used-the-company-account-to-pump-a-personal-token-4600-in-minutes/?rand=6792)
- Unlock: volume thường đỉnh ở −14/−28 ngày trước unlock (Keyrock) — đây là "dấu vết trên chart" có thể quan sát được. — [Keyrock](https://keyrock.com/from-locked-to-liquidity-what-16000-token-unlocks-teach-us/)
- Hack: Corbet et al. — AR bất thường trước sự kiện về 0 khi tin công bố. — [DCU](https://doras.dcu.ie/25982)

**Momentum riêng (idiosyncratic) — bền hay đảo chiều?**
- Zaremba et al. (IRFA 2021, >3.600 coin, dữ liệu ngày): coin có lợi nhuận ngày trước thấp vượt trội coin có lợi nhuận cao (**reversal 1 ngày**), do kém thanh khoản; **nhóm coin lớn, thanh khoản nhất có momentum ngày** thay vì reversal. [ACAD] — [Medeniyet repository](https://earsiv.medeniyet.edu.tr/items/23a96c9f-3952-4bdf-aec5-abafb3aaab70)
- Fičura (FFA WP 2023): reversal theo **tuần** chỉ ở coin nhỏ/kém thanh khoản; **coin lớn, thanh khoản có momentum tuần**; khoảng cách tới đỉnh 1 tuần dự báo âm với coin nhỏ, dương với coin lớn. [ACAD – working paper] — [VŠE FFA](https://wp.ffu.vse.cz/artkey/wps-202301-0003_impact-of-size-and-volume-on-cryptocurrency-momentum-and-reversal.php)
- Bài 2024 (Emerald/USQ): reversal xuất hiện ổn định với lookback 1–4 tuần trong cross-section rộng; đề xuất mô hình 4 nhân tố có reversal và illiquidity. [ACAD] — [USQ PDF](https://research.usq.edu.au/download/448ba51f55d384fe690327821d236d1e3d144b4eaaf32ac1a59aa49b54567ddd/979923/cafr-06-2024-0077en.pdf)
- Cong et al.: momentum ở nhóm vốn hóa lớn nhất, reversal ở nhóm khác. — [EFMA 2022](https://www.efmaefm.org/0EFMAMEETINGS/EFMA%20ANNUAL%20MEETINGS/2022-Rome/papers/EFMA%202022_stage-3032_question-Full%20Paper_id-231.pdf)
- Liu & Tsyvinski (NBER w24877): momentum chuỗi thời gian mạnh trong crypto (BTC/XRP/ETH). [ACAD] — [SSRN](https://papers.ssrn.com/abstract=3226806)

**Post-news drift hay phản ứng tức thì?**
- Hashemi Joo et al. (2020): CAR tiếp tục phân kỳ đến +6 ngày → điều chỉnh chậm; tin xấu mạnh hơn. — [IDEAS](https://ideas.repec.org/a/taf/applec/v52y2020i44p4794-4808.html)
- Miralles-Quirós & Miralles-Quirós (J. Applied Economics 2022): BTC **phản ứng quá mức (overreaction) sau cú sốc âm theo giờ**, mạnh dần trong 6–24 giờ sau sự kiện. [ACAD] — [IDEAS](https://ideas.repec.org/a/taf/recsxx/v25y2022i1p1294-1313.html)
- de Groot (luận văn EUR): 5 crypto đều có cả phản ứng quá mức và dưới mức quanh tin. — [EUR thesis](https://thesis.eur.nl/pub/45056/Groot-B.-de-414661-.pdf)
- Listing: drift dương 1–2 ngày (Binance) rồi phai trước ngày 7; mean-revert trong 1–2 tuần. — [RockawayX](https://rockawayx.com/insights/bullish-or-bearish-what-really-happens-when-tokens-list-on-a-cex); [The Tie](https://www.thetie.io/insights/what-does-an-exchange-listing-actually-deliver-in-2026)
- Unlock (team, investor lớn so với ADV): tiếp tục giảm đến 2 tuần sau. — [The Tie](https://thetie.io/insights/research/the-3-us-of-alternative-on-chain-data)

**Luật thực hành có nguồn**
- Thoát ~30 ngày trước unlock lớn, vào lại ~14 ngày sau. [VENDOR Keyrock, theo CryptoSlate] — [CryptoSlate](https://cryptoslate.com/90-of-token-unlocks-drive-prices-down-declines-begin-a-month-ahead/)
- Backtest chiến lược quanh listing nên giữ <7 ngày. [VENDOR RockawayX] — [RockawayX](https://rockawayx.com/insights/bullish-or-bearish-what-really-happens-when-tokens-list-on-a-cex)
- Short perps mới niêm yết từ ngày 1 (chưa tính phí/funding). [Blog FMZ] — [StockSharp](https://stocksharp.com/posts/m/79763)
- Phát hiện P&D bằng ngưỡng giá/volume thích nghi (precision ~50%, recall 75% ở cấu hình strict khi được dùng làm benchmark). — [SBC 2023](https://sol.sbc.org.br/index.php/sbbd/article/download/30743/30546)

### Inferences
- **TA trên 1D/4H thấy được "dấu chân" nhưng thường muộn**: rò rỉ niêm yết/P&D diễn ra trong giờ (70% volume trong 1h cuối); Binance thông báo trước niêm yết chỉ vài giờ. Thứ TA 1D bắt được là (i) drift trước unlock (30 ngày, có lịch → không cần đoán), (ii) pha mean-revert sau listing/pump, (iii) momentum ngắn của coin lớn.
- Với top-100 (coin lớn, thanh khoản), bằng chứng nghiêng về **momentum ngắn hạn (ngày–tuần)** cho idiosyncratic return; với coin nhỏ/kém thanh khoản → reversal. Tức là "breakout có volume" ở coin lớn đáng theo hơn ở coin nhỏ.
- Đề xuất luật (suy luận, CHƯA backtest, cần kiểm trước khi dùng):
  1. Không mở LONG nếu coin có unlock team/investor ≥ ~1% lưu hành hoặc ≥ 100% ADV trong 30 ngày tới; không bắt đáy trong 14 ngày sau unlock.
  2. Không giao dịch perps niêm yết < 30 ngày (~50% đỉnh ngày 1; mean-revert 1–2 tuần).
  3. Loại coin có Monitoring Tag / thông báo delist (lấy tự động từ endpoint Binance catalogId 48/161).
  4. Không bắt đáy 3–6 ngày sau hack/kiện pháp lý (CAR tin xấu kéo dài đến +6 ngày).
  5. Volume spike bất thường không kèm tin công khai: ở coin lớn coi là xác nhận momentum; ở coin nhỏ/low-float coi là cảnh báo P&D → không đuổi.
  6. Né long khi funding cực dương + OI tăng dốc (rủi ro cascade như 10/10/2025).

### Gaps
- Không tìm thấy nghiên cứu đo trực tiếp **OI thay đổi bất thường trên perps trước tin niêm yết/unlock**.
- Chưa có bằng chứng out-of-sample, sau phí/funding, cho bất kỳ luật nào ở trên trong bối cảnh Binance USDⓈ-M top-100 2024–2026.
- Không tìm thấy tài liệu luật nội bộ công khai của quỹ (ví dụ "không giao dịch coin có unlock trong N ngày") — các con số N trên là suy luận từ dữ liệu sự kiện.
- Nghiên cứu momentum/reversal phần lớn dùng dữ liệu trước 2022; chưa kiểm cho giai đoạn 2024–2026.
