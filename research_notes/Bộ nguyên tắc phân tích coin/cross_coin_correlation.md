# Quan hệ chéo giữa các coin (correlation, lead-lag, regime) — cơ sở cho bộ chấm điểm Coin Radar

Ngày ghi chú: 2026-10-19. Phạm vi: Swing (1D/4H, ≤10 ngày) và Short-term (4H/1H, ≤48h), top 1000 coin, quét 15 phút/lần.
Quy ước: "Bằng chứng" là nghiên cứu có số liệu, phương pháp rõ ràng. "Folklore" (kinh nghiệm truyền miệng của trader) là chỉ báo phổ biến nhưng chưa có kiểm định thống kê công bố. Mọi số liệu đều ghi kỳ mẫu nếu nguồn có nêu.

---

## 1. Altcoin tương quan (correlation) và beta với BTC bao nhiêu? Có tăng vọt khi sập không?

### Takeaway
Altcoin lớn có tương quan với BTC rất cao (khoảng 0,7–0,96 trên cửa sổ 30 ngày), và tương quan **tăng lên khi thị trường giảm mạnh**: có bất đối xứng, phía giảm mạnh hơn phía tăng. Nghĩa là khi BTC gãy thì "đa dạng hoá bằng altcoin" gần như mất tác dụng. Mình không tìm được nguồn công khai đáng tin nào có bảng beta theo nhóm vốn hoá, nên engine phải tự tính.

### Cited Findings
- Sau đợt bán tháo ngày 10/10/2025, theo số liệu CoinMetrics: tương quan BTC–ETH tăng từ 0,69 lên 0,73, BTC–XRP từ 0,75 lên 0,77 trong 8 ngày kế tiếp. Bài viết diễn giải: altcoin không tách khỏi BTC trong các đợt bán tháo do thanh khoản (liquidity-driven) — [Cointelegraph](https://cointelegraph.com/news/without-bitcoin-what-happens-to-ether-and-xrp)
- Trong một lần BTC flash crash (sập chớp nhoáng), phần lớn crypto khác rơi còn mạnh hơn: ETH giảm hơn 25% trong 15 phút. Tương quan ETH–BTC 30 ngày được dẫn là 0,96 — [Deribit Insights](https://insights.deribit.com/?p=2162)
- Nghiên cứu dùng EVT (extreme value theory, lý thuyết giá trị cực trị) trên 10 crypto lớn: tương quan cực trị **tăng trong bear market, không tăng trong bull market**; hiệu ứng đi theo xu hướng thị trường chứ không phải theo biến động — [Unimore/IRIS](https://iris.unimore.it/handle/11380/1261318) (tóm tắt qua kết quả tìm kiếm, chưa đọc toàn văn)
- Nghiên cứu multifractal (đa phân dạng) trên BTC, ETH, XRP, LTC: với BTC và ETH, tương quan chéo mạnh hơn khi thị trường đi xuống. XRP và LTC lại phản ứng ngược, nên hiện tượng này **không đúng với mọi coin** — [arXiv 2102.02865](https://arxiv.org/pdf/2102.02865)
- Phụ thuộc đuôi (tail dependence) giữa crypto và S&P 500: tương quan ở đuôi giảm lớn hơn nhiều so với đuôi tăng; mô hình đối xứng không giải thích được cấu trúc này — [SeoulTech](https://pure.seoultech.ac.kr/en/publications/asymmetric-tail-dependence-in-cryptocurrency-markets-a-model-free/)
- Giai đoạn 2015–2020: biến động lợi suất BTC ngày càng giải thích được nhiều hơn lợi suất altcoin; Granger causality giữa BTC và altcoin tăng trong 2017–2020 — [JMU Research Journal](https://commons.lib.jmu.edu/jmurj/vol9/iss1/5)
- Liu–Tsyvinski–Wu (2014–2018, 1.707 coin): yếu tố "market" (thị trường crypto, gia quyền theo vốn hoá) là 1 trong 3 nhân tố giải thích lợi suất chéo. Lợi suất trung bình của chỉ số thị trường cao hơn BTC (BTC 1,2%/tuần; XRP 3,5%/tuần; ETH 4,6%/tuần). Đáng chú ý: **sắp xếp coin theo beta thì KHÔNG tạo ra chênh lệch lợi suất có ý nghĩa thống kê** — [NBER w25882](https://www.nber.org/papers/w25882.pdf)
- Ý kiến trái chiều (chỉ là bài báo, không kèm dữ liệu kiểm chứng): large-cap altcoin đi theo BTC nhưng giảm sâu hơn, còn mid/small cap thời gian gần đây lại ít nhạy với BTC hơn — [AMBCrypto](https://ambcrypto.com/as-bitcoin-dominance-gains-why-smaller-altcoins-are-falling-behind/amp/)

### Inferences
- Bộ lọc regime (chế độ thị trường) dựa trên BTC là hợp lý, vì khi BTC giảm, tương quan tăng và altcoin thường rơi mạnh hơn BTC. Nên tự tính beta và correlation của từng coin với BTC (ví dụ 30 nến 1D cho Swing, 60–90 nến 1H cho Short-term) thay vì dùng bảng beta cố định theo nhóm vốn hoá.
- Gợi ý luật chấm điểm: khi BTC ở regime xấu (dưới EMA200 1D, hoặc 4H/1D đang giảm), phạt **thêm** những coin có beta > 1 và tương quan cao (> 0,7). Coin có tương quan thấp có thể bị phạt nhẹ hơn, nhưng vì bằng chứng về tách khỏi BTC (decoupling) khi sập là yếu, mức giảm phạt nên nhỏ.

### Gaps
- Chưa tìm được bảng beta với BTC theo tier vốn hoá (top 10 / 11–100 / 101–1000) từ Kaiko, Glassnode hay CoinMetrics có ghi kỳ mẫu. Kết quả tìm kiếm không có nghiên cứu Kaiko nào về chủ đề này.
- Chưa đọc toàn văn nghiên cứu EVT trên 10 crypto, nên chưa có con số độ tăng của tương quan.

---

## 2. Lead-lag: BTC có đi trước altcoin không? ETH có đi trước token hệ sinh thái? Có lan toả từ coin lớn sang coin nhỏ?

### Takeaway
Bằng chứng học thuật (2018–2021) cho thấy BTC là **nguồn lan toả chính** (spillover transmitter) về lợi suất và biến động, và BTC chứa thông tin dự báo được altcoin ở tần suất trong ngày (intraday). Tuy vậy độ trễ chỉ tính bằng phút đến giờ, lợi thế nhỏ, và kết luận không tuyệt đối (một số coin nhỏ cũng truyền biến động). Không tìm được bằng chứng định lượng nào cho việc "ETH dẫn token hệ sinh thái ETH".

### Cited Findings
- Koutmos (2018, Economics Letters 173:122–127), 18 crypto lớn, khung Diebold–Yilmaz: BTC là nguồn đóng góp chính vào lan toả lợi suất và biến động; mức lan toả tăng dần theo thời gian; tăng vọt khi có tin lớn. Thông tin lấy qua nguồn thứ cấp — [IDEAS/RePEc](https://ideas.repec.org/a/eee/ecolet/v173y2018icp122-127.html); [tóm tắt trong Financial Innovation](https://jfin-swufe.springeropen.com/track/pdf/10.1186/s40854-020-00213-1)
- Yi và cộng sự (2018), 52 crypto, LASSO-VAR + Diebold–Yilmaz: biến động có truyền từ BTC sang coin khác, nhưng BTC **không phải** nguồn truyền duy nhất. Vốn hoá giải thích một phần mức kết nối, và một số coin ít phổ biến (ví dụ MaidSafeCoin) cũng là nguồn truyền biến động — [Financial Innovation (tóm tắt)](https://jfin-swufe.springeropen.com/track/pdf/10.1186/s40854-020-00213-1); [bảng tóm tắt](https://jfin-swufe.springeropen.com/articles/10.1186/s40854-021-00308-3/tables/1)
- "Does Bitcoin still own the dominant power? An intraday analysis" (International Review of Financial Analysis, 2020), nonlinear Granger trên dữ liệu intraday: BTC chứa thông tin dự báo phi tuyến cho các crypto khác, cả khi giá đang tăng lẫn đang giảm — [NJIT](https://researchwith.njit.edu/en/publications/does-bitcoin-still-own-the-dominant-power-an-intraday-analysis/)
- Nghiên cứu tần suất cao của Tokyo Tech dùng cross-correlation, Granger và VAR để đo độ trễ ảnh hưởng của BTC lên altcoin, tập trung vào small-cap có độ trễ rõ, và mô phỏng chiến lược giao dịch kích hoạt theo biến động BTC. Toàn văn bị chặn (HTTP 403), nên chưa có số phút trễ hay lợi nhuận — [Titech T2R2](https://t2r2.star.titech.ac.jp/rrws/file/CTT100941776/ATD100000413/)
- Dữ liệu ngày 2010–2018: quan hệ ngắn hạn BTC–altcoin có ý nghĩa và **hai chiều**, không có quan hệ dài hạn (cointegration, đồng liên kết) — [Çankaya Univ.](https://caa.cankaya.edu.tr/entities/publication/bc1c4c3d-5a41-4689-b426-60d2ffb47abd/full)
- Hiệu ứng bất đối xứng của BTC lên altcoin, mô hình NARDL (Finance Research Letters, tập 40, 2021) — [IDEAS](https://ideas.repec.org/a/eee/finlet/v40y2021ics1544612319310311.html) (chỉ có tiêu đề, chưa có số liệu)
- Nghiên cứu năm 2022 (dữ liệu ngày) về BTC, ETH, SOL, MATIC: MATIC lại là chỉ báo đi trước, dù vốn hoá nhỏ hơn. Kết quả này **trái** với giả thuyết "lớn dẫn nhỏ" — [JBFE Warsaw](https://press.wz.uw.edu.pl/jbfe/vol2024/iss1/5)
- Phân tích của một trader (Robot Wealth) trên lợi suất 1H: có quan hệ lead-lag ổn định giữa một số coin và BTC, nhưng chỉ hữu ích cho execution (khớp lệnh) hoặc giao dịch nhanh, "khó khai thác trong chiến lược chậm" — [Robot Wealth](https://robotwealth.com/topic-tag/data-analysis)
- Lead-lag giữa các sàn: Bitfinex và Gemini dẫn, Bittrex theo sau (Giudici & Pagnottoni) — [kết quả tìm kiếm Unipv](https://iris.unipv.it/handle/11571/1316609)

### Inferences
- Với chu kỳ quét 15 phút và khung 1H–1D, lead-lag kiểu "BTC đi trước vài phút" gần như không khai thác được. Cách dùng hợp lý: lấy **trạng thái BTC trên khung cao hơn** (4H/1D) làm bộ lọc điều kiện, không dùng để dự báo từng nến.
- Một luật Short-term có thể thử nhưng phải tự backtest (kiểm thử trên dữ liệu quá khứ): nếu BTC vừa có cú giảm mạnh trên 1H (ví dụ < −2%/1H), tạm hoãn tín hiệu Buy cho small-cap trong 1–2 nến 1H, vì lan toả sang small-cap có độ trễ. Chưa có số liệu công bố để chọn ngưỡng.

### Gaps
- Không tìm được nghiên cứu định lượng về "ETH dẫn token hệ ETH" hay "SOL dẫn hệ Solana".
- Không có số liệu độ trễ (phút) đã kiểm chứng cho dữ liệu 2023–2026 (thời kỳ sau ETF). Phần lớn nghiên cứu lead-lag dùng mẫu 2015–2021.

---

## 3. BTC dominance, ETH/BTC, TOTAL2/TOTAL3, Altcoin Season Index: định nghĩa, cách tính, có dự báo được không?

### Takeaway
Các chỉ số này **tính được miễn phí** (dominance lấy trực tiếp từ CoinGecko `/global`), nhưng khả năng dự báo altcoin vượt BTC **chưa có kiểm định học thuật nào** trong các nguồn tìm được. Chúng là folklore hoặc heuristic (luật kinh nghiệm) của trader. Nên dùng như biến mô tả regime hiện tại, không dùng như tín hiệu dự báo.

### Cited Findings
- **BTC dominance**: thị phần vốn hoá BTC trên tổng vốn hoá crypto. CoinGecko trả về trường `market_cap_percentage` (btc, eth, usdt…) trong endpoint `/global`, cập nhật 10 phút/lần — [CoinGecko docs /global](https://docs.coingecko.com/v3.0.1/reference/crypto-global)
- Số đo thực tế mình gọi `/global` không cần key lúc 2026-10-19 ~03:00 UTC: BTC 60,13%, ETH 10,74%, USDT 6,65%, BNB 3,51%, XRP 3,00%, USDC 2,63%, SOL 2,25%; tổng vốn hoá ≈ 2,76 nghìn tỷ USD — [CoinGecko API /global](https://api.coingecko.com/api/v3/global)
- **TOTAL2 / TOTAL3** (quy ước TradingView): tổng vốn hoá trừ BTC, và trừ BTC + ETH. Tự tính được: `TOTAL2 = total_mcap × (1 − btc%)`, `TOTAL3 = total_mcap × (1 − btc% − eth%)`. Đây là suy luận của mình từ các trường của `/global`, mình không tìm thấy định nghĩa chính thức nào từ TradingView.
- **Altcoin Season Index** (Blockchain Center): tỷ lệ % trong top 50 coin (loại BTC, stablecoin và token bọc/tài sản đảm bảo như WBTC, stETH) có lợi suất 90 ngày cao hơn BTC. ≥ 75 = "altcoin season", ≤ 25 = "Bitcoin season" — [Blockworks](https://www.blockworks.com/news/bitcoin-miners-may-trigger-altcoin-season-but-were-not-there-yet); [Mudrex](https://mudrex.com/learn/altcoin-season-index/). Các nguồn mô tả không thống nhất: một bài của Mudrex ghi "top 100", một bài khác ghi "vượt BTC ≥ 20%" — [Mudrex](https://mudrex.com/learn/?p=77658)
- Trang Blockchain Center truy cập được (HTTP 200 sau khi redirect sang `https://www.blockchaincenter.net/altcoin-season-index/`), nhưng **mình không tìm thấy API công khai**; muốn lấy số phải scrape (cào HTML) — kết quả tự kiểm tra bằng curl.
- Một bài có tiêu đề "Altseason ended 2024, Bitcoin dominance 71% before returns" — [Cointelegraph](https://cointelegraph.com/news/altseason-ended-2024-bitcoin-dominance-71-before-returns). Đây là dự báo của trader (Rekt Capital) dựa trên hình mẫu biểu đồ, **không phải** mô hình đã kiểm định.
- Folklore được nhắc nhiều: BTC dominance tăng trong bear market (dòng tiền về tài sản "an toàn hơn") và giảm trong bull market — [CMT Association](https://cmtassociation.org/?p=117610)
- Một nguồn nói vùng BTC.D 50–60% "lịch sử cho lợi suất altcoin điều chỉnh rủi ro tốt nhất", và BTC.D năm 2026 bị hiểu sai lệch 4–6 điểm nếu không loại stablecoin. Nguồn này **không nêu mẫu và phương pháp**, coi như chưa kiểm chứng — [LambdaFin](https://www.lambdafin.com/articles/bitcoin-dominance-history)
- Mức dominance giữa các thời kỳ không so sánh trực tiếp được, vì stablecoin và cấu trúc thị trường mới làm méo chỉ số — [txid.uk](https://learn.txid.uk/en/articles/bitcoin-dominance-explained/)

### Inferences
- Vì stablecoin chiếm khoảng 9% (USDT 6,65% + USDC 2,63%), BTC.D "thô" bị kéo xuống khi stablecoin phình ra lúc risk-off. Nên tính **BTC.D không tính stablecoin**: `btc% / (100 − usdt% − usdc% − ...)`.
- Altcoin Season Index có thể **tự tính** từ dữ liệu engine đang có sẵn (đã quét top 1000): tỷ lệ % trong top 50 (sau khi loại stable/wrapped) có lợi suất 90 ngày > BTC. Với Swing ≤ 10 ngày, cửa sổ 90 ngày quá chậm, nên tính thêm bản 14 hoặc 30 ngày làm "breadth" (độ rộng thị trường).
- Gợi ý dùng: biến này chỉ **điều chỉnh trọng số** (ví dụ cộng/trừ vài điểm cho alt nếu breadth > 60% hoặc < 25%), không làm cổng chặn cứng, vì chưa có bằng chứng dự báo.

### Gaps
- Không tìm được paper peer-reviewed nào kiểm định "BTC dominance giảm → alt vượt BTC trong N ngày tới".
- Không có API miễn phí chính thức cho Altcoin Season Index.
- ETH/BTC: mình không tìm được nghiên cứu nào về khả năng dự báo của tỷ lệ này. Mọi nhận định về nó trên thị trường đều thuộc loại folklore.

---

## 4. Luân chuyển ngành/narrative (L1, L2, DeFi, AI, meme, RWA, gaming): có momentum theo ngành không? Lấy phân loại miễn phí ở đâu?

### Takeaway
Bằng chứng học thuật về **sector momentum** (đà tăng theo ngành) trong crypto: mình không tìm được nghiên cứu nào. Momentum ở cấp **từng coin** thì có bằng chứng (xem mục 5). Phân loại ngành lấy miễn phí từ CoinGecko categories.

### Cited Findings
- `GET /coins/categories`: danh sách category kèm dữ liệu thị trường (`market_cap`, `market_cap_change_24h`, `volume_24h`, `top_3_coins_id`, `updated_at`). Tham số `order` nhận: market_cap_desc/asc, name_desc/asc, market_cap_change_24h_desc/asc. Cập nhật 5 phút/lần — [CoinGecko docs](https://docs.coingecko.com/reference/coins-categories)
- Lọc coin theo ngành bằng `/coins/markets?vs_currency=usd&category=<category_id>`. Mình đã kiểm tra `category=layer-1`: HTTP 200, header `total: 421` (421 coin thuộc layer-1), `cache-control: max-age=30, s-maxage=60` — kết quả tự kiểm tra bằng curl tới [api.coingecko.com](https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=layer-1&per_page=5)
- Endpoint `/coins/categories/list` (chỉ ID + tên) trả HTTP 200 ở lần gọi đầu, các lần sau bị 429 (vượt rate limit) — kết quả tự kiểm tra bằng curl.
- Category của CoinGecko khác category của GeckoTerminal (GeckoTerminal có endpoint riêng) — [CoinGecko docs](https://docs.coingecko.com/reference/coins-categories)

### Inferences
- Chỉ có `market_cap_change_24h` cho mỗi category, nên muốn có momentum ngành 7 hoặc 30 ngày thì phải **tự tổng hợp**: map coin sang category (gọi `/coins/markets?category=...` khoảng 1 lần/ngày cho mỗi ngành cần theo dõi), sau đó tính lợi suất trung vị hoặc gia quyền vốn hoá của ngành từ dữ liệu giá engine đã có.
- Đề xuất luật (cần backtest vì chưa có bằng chứng ngành): cộng điểm nhỏ nếu ngành của coin thuộc top 20% theo lợi suất 7 ngày so với BTC. Lưu ý: một coin thường thuộc nhiều category (ví dụ vừa "AI" vừa "solana-ecosystem"), nên chọn danh sách ngành chính cố định để tránh trùng lặp.
- Chưa xác nhận đầy đủ các ID cụ thể (layer-2, meme-token, artificial-intelligence, real-world-assets-rwa, gaming…) vì bị 429. Chỉ `layer-1` đã được xác nhận chạy được.

### Gaps
- Không tìm thấy nghiên cứu nào (2020–2026) về sector momentum hay narrative rotation (xoay vòng câu chuyện đầu tư) có số liệu.
- Danh sách `category_id` đầy đủ chưa lấy được do rate limit; cần gọi lại với Demo key.

---

## 5. Relative strength so với BTC làm bộ lọc: coin mạnh hơn BTC có tiếp tục mạnh hơn không?

### Takeaway
**Có bằng chứng**, nhưng phụ thuộc rất nhiều vào khung thời gian và cỡ coin. Momentum chéo 1–4 tuần có ý nghĩa thống kê (mẫu 2014–2018) và **chỉ mạnh ở coin lớn**. Ở khung ngày hoặc ngắn hơn, coin nhỏ/kém thanh khoản lại có xu hướng **đảo chiều** (reversal). Điều này khớp với Swing (≤ 10 ngày) cho coin vốn hoá lớn, và đặt dấu hỏi lớn cho Short-term ở small-cap.

### Cited Findings
- Liu, Tsyvinski & Wu, "Common Risk Factors in Cryptocurrency" (Journal of Finance 2022, 77:1133–1177, DOI 10.1111/jofi.13119), mẫu 1.707 coin, 2014–2018, loại coin vốn hoá < 1 triệu USD, tái cân bằng hàng tuần: chiến lược long quintile (nhóm 1/5) tăng mạnh nhất, short nhóm tăng yếu nhất cho lợi suất vượt **2,7%/tuần (momentum 1 tuần), 3,3% (2 tuần), 4,1% (3 tuần), 2,5% (4 tuần)**, có ý nghĩa ở mức 5% (riêng 3 tuần ở mức 1%) — [NBER w25882](https://www.nber.org/papers/w25882.pdf); [SSRN](https://papers.ssrn.com/abstract=3379131); [SUFE (thông tin xuất bản)](https://academicnewsletter.sufe.edu.cn/info/359095)
- Cùng nghiên cứu: momentum 8, 16, 50, 100 tuần **không có ý nghĩa** (ví dụ 16 tuần chỉ 0,4%/tuần) — [NBER w25882](https://www.nber.org/papers/w25882.pdf)
- Cùng nghiên cứu: momentum ở nhóm **trên trung vị vốn hoá** cho 4,2%/tuần (có ý nghĩa); ở nhóm dưới trung vị chỉ 0,6%/tuần (không có ý nghĩa). Kết quả chưa tính phí giao dịch — [NBER w25882](https://www.nber.org/papers/w25882.pdf)
- "Up or down? Short-term reversal, momentum, and liquidity effects in cryptocurrency markets" (IRFA, tập 78, 2021), hơn 3.600 coin: coin giảm mạnh hôm trước thắng coin tăng mạnh hôm trước (reversal theo ngày), do kém thanh khoản. Riêng nhóm coin lớn, dễ giao dịch nhất thì có **momentum theo ngày** — [IDEAS](https://ideas.repec.org/a/eee/finana/v78y2021ics1057521921002349.html); [Medeniyet repo](https://earsiv.medeniyet.edu.tr/items/23a96c9f-3952-4bdf-aec5-abafb3aaab70/full)
- Kozlowski, Puleo & Zhou (2020, Applied Economics Letters), 200 coin, 2015–2019: đảo chiều ở cả nhịp tái cân bằng ngày, tuần, tháng; mạnh nhất ở coin nhỏ, kém thanh khoản — [Fairfield](https://fairfield.elsevierpure.com/en/publications/cryptocurrency-return-reversals/)
- Một nghiên cứu khác (Economics Letters) trên 12 coin, khoảng 3 năm: momentum có ý nghĩa ở khung ngắn, biến mất ở khung dài — [Portsmouth](https://researchportal.port.ac.uk/en/publications/momentum-trading-in-cryptocurrencies-short-term-returns-and-diver/)
- Preprint (bản thảo chưa phản biện) tháng 8/2026, khung 15 phút trên Binance: đảo chiều mạnh, nhưng lợi thế gộp chỉ khoảng 1,3 bp mỗi lệnh, trong khi phí khứ hồi khoảng 5 bp, tức **không có lãi sau phí** — [arXiv 2608.21888](https://arxiv.org/pdf/2608.21888)

### Inferences
- **Swing**: cộng điểm cho coin có RS vs BTC (relative strength, sức mạnh tương đối, tính bằng lợi suất coin/BTC) dương trên 7–21 ngày, **chỉ áp dụng cho coin thanh khoản cao** (ví dụ top 200 hoặc volume 24h > ngưỡng). Đây là phần có bằng chứng tốt nhất trong toàn bộ ghi chú.
- **Short-term**: với small-cap kém thanh khoản, tăng mạnh 24h trước đó dễ đảo chiều, nên **không** cộng điểm RS 1 ngày; có thể trừ điểm nếu coin đã tăng quá nóng (ví dụ top 5% lợi suất 24h mà volume thấp). Với large-cap, RS 1 ngày có thể cộng nhẹ.
- RS dài hơn khoảng 8 tuần không nên đưa vào điểm (theo bằng chứng 2014–2018).
- Lưu ý: mẫu dữ liệu chủ yếu là 2014–2019. Hiệu ứng có thể đã yếu đi sau khi thị trường trưởng thành; cần tự backtest trên dữ liệu 2022–2026.

### Gaps
- Chưa tìm thấy nghiên cứu cập nhật 2022–2026 về momentum chéo trong crypto có tính phí giao dịch.

---

## 6. Stablecoin dominance (USDT.D) làm thước đo risk-on/risk-off

### Takeaway
Quan hệ nghịch giữa USDT.D và giá BTC là **heuristic của cộng đồng trader**, mình không tìm thấy kiểm định thống kê nào. Về mặt cơ học thì quan hệ này gần như hiển nhiên: USDT.D = vốn hoá USDT / tổng vốn hoá, nên khi giá crypto giảm mà vốn hoá USDT giữ nguyên thì tỷ lệ tự tăng. Vì vậy USDT.D phần lớn **trùng lặp** với bộ lọc giá BTC và tổng vốn hoá.

### Cited Findings
- Diễn giải phổ biến: USDT.D tăng = dòng tiền trú vào stablecoin (risk-off); quan hệ nghịch với BTC. Đây là bài phân tích của người dùng TradingView, không có kiểm định — [TradingView](https://tr.tradingview.com/chart/USDT.D/TnlCiUVv-BTC-Price-Predictions-based-on-USDT-dominance); [TradingView guide](https://it.tradingview.com/chart/USDT.D/dwi3eigw-USDT-Dominance-prediction)
- Ngưỡng không thống nhất giữa các nguồn: một nguồn ghi thấp < 5–7%, cao > 8–10%; nguồn khác coi khoảng 5% là "mức cân bằng" — [TradingView](https://www.tradingview.com/chart/USDT.D/O4fAjnca-USDT-Dominance-USDT-D-Daily-Timeframe-Analysis)
- Ngày 9/6/2026 có tin (dẫn CoinDesk) về "golden cross" của USDT dominance, được đọc là tín hiệu xấu cho BTC. Đây chỉ là một lần quan sát — [Pluang](https://pluang.com/en/news-feed/dominasi-usdt-flash-golden-cross-buruk-untuk-harga-bitcoin)
- Giá trị hiện tại (2026-10-19): USDT 6,65%, USDC 2,63% — [CoinGecko /global](https://api.coingecko.com/api/v3/global)

### Inferences
- Thay vì dùng mức USDT.D tuyệt đối (ngưỡng lệch theo thời kỳ do nguồn cung stablecoin tăng đều), nên dùng **xu hướng**: so USDT.D + USDC.D hiện tại với EMA 20 ngày của nó. Tăng mạnh thì là risk-off, phạt nhẹ tín hiệu Buy. Do chỉ số trùng lặp với BTC, trọng số nên nhỏ.
- Một chỉ báo ít trùng lặp hơn là **tổng vốn hoá stablecoin tuyệt đối** tăng hay giảm (nguồn cung mới, "dry powder" = tiền chờ giải ngân). Tuy nhiên mình chưa tìm nguồn kiểm chứng nào cho chỉ báo này.

### Gaps
- Không tìm được nghiên cứu học thuật hay note của Kaiko/Glassnode kiểm định USDT.D như chỉ báo dự báo.

---

## 7. Tương quan với thị trường truyền thống (Nasdaq, S&P 500, vàng, DXY), 2020–2026

### Takeaway
Tương quan BTC–cổ phiếu Mỹ **thay đổi theo regime** (chế độ thị trường): gần 0 giai đoạn 2017–2019, khoảng 0,36 giai đoạn 2020–2021 (IMF), 0,6–0,8 ở một số thời điểm 2022 và 2025, rồi giảm xuống khoảng 0,33 (90 ngày) vào cuối 2026; trong khi tương quan với vàng lên mức kỷ lục 0,8 (30 ngày) vào 1/9/2026. Phía giảm có tương quan cao hơn phía tăng. Không nên dùng hệ số cố định.

### Cited Findings
- IMF (blog 11/1/2022): tương quan lợi suất ngày BTC–S&P 500 là 0,01 giai đoạn 2017–2019, tăng lên 0,36 giai đoạn 2020–2021; BTC–MSCI EM là 0,34 (tăng 17 lần). IMF quy cho phản ứng của ngân hàng trung ương năm 2020 và điều kiện tài chính nới lỏng — [IMF](https://www.imf.org/en/blogs/articles/2022/01/11/crypto-prices-move-more-in-sync-with-stocks-posing-new-risks). Theo nguồn thứ cấp, ETH–S&P 500 tăng từ 0,06 lên 0,37 (chưa đối chiếu được với văn bản gốc của IMF) — [Masterworks](https://insights.masterworks.com/crypto/markets/crypto-stocks-correlation/)
- Kaiko (2023): tương quan BTC–Nasdaq 100 giảm còn khoảng 3%, thấp nhất trong khoảng 3 năm, do các sự kiện riêng của crypto — [Decrypt](https://decrypt.co/146302/bitcoin-tech-stock-correlation-hits-three-year-low)
- Arcane Research: tương quan 30 ngày BTC–Nasdaq là 0,70, cao nhất kể từ tháng 7/2020 (bài năm 2022) — [Decrypt](https://decrypt.co/98201/bitcoin-is-trading-like-tech-stock-not-digital-gold?amp=1)
- Tương quan 30 ngày BTC–Nasdaq 100 khoảng 0,80, "cao nhất kể từ 2022" (bài không ghi ngày rõ) — [Yahoo Finance](https://finance.yahoo.com/news/bitcoin-falls-harder-tech-nasdaq-085744323.html)
- Wintermute (11/2025): BTC giảm mạnh hơn trong những ngày cổ phiếu giảm so với mức tăng trong những ngày cổ phiếu tăng ("tương quan chỉ gây hại"), một hình mẫu thấy lần cuối ở bear market 2022 — [Wintermute](https://www.wintermute.com/insights/views/opinions/btc-and-the-nasdaq-the-correlation-that-only-hurts)
- Crypto Briefing (2/9/2026): tương quan 90 ngày BTC–Nasdaq 100 khoảng 33%, giảm từ trên 60% hồi đầu 2026; BTC–vàng trên 50% (90 ngày) và **0,8 (30 ngày) ngày 1/9/2026, mức cao nhất mọi thời**. Grayscale gọi đây là "thay đổi hành vi mang tính cấu trúc". Bài không nêu nhà cung cấp dữ liệu — [Crypto Briefing](https://cryptobriefing.com/bitcoin-decouples-nasdaq-aligns-gold/)
- Năm 2025: tương quan 30 ngày BTC–vàng là 0,70 trong giai đoạn bất định về thuế quan (dẫn CoinDesk) — [Forklog](https://forklog.com/en/tag/correlation)
- Một blog sinh viên (dữ liệu Yahoo Finance) ghi tương quan BTC–S&P/Nasdaq > 0,6 sau dòng tiền ETF đầu 2025, khoảng 0,7 giữa năm. Đây là bằng chứng yếu — [Berkeley Business Review](https://businessreview.studentorg.berkeley.edu/the-21st-century-gold-rush-why-bitcoins-digital-gold-narrative-is-a-lie/)

### Inferences
- Engine chỉ chấm crypto, nên tác dụng thực tế của dữ liệu thị trường truyền thống là một **cờ cảnh báo vĩ mô** (macro risk flag), ví dụ khi Nasdaq giảm mạnh trong phiên. Vì tương quan dao động từ 0 đến 0,8 và có bất đối xứng phía giảm, không nên cộng điểm khi cổ phiếu tăng; chỉ nên phạt khi có cú sốc giảm.
- Với Swing/Short-term ≤ 10 ngày, thêm dữ liệu chứng khoán làm tăng độ phức tạp (giờ giao dịch Mỹ, ngày nghỉ) mà lợi ích không chắc chắn. Đề xuất để làm giai đoạn sau, có tuỳ chọn tắt.

### Gaps
- Chưa tìm được số liệu chính thức về tương quan BTC–DXY giai đoạn 2024–2026.
- Kết quả tìm kiếm có nhắc một nghiên cứu (Hung; Diebold–Yilmaz + nhân quả phi tuyến Kyrtsou–Labys) cho rằng S&P 500 nhận biến động ròng từ Bitcoin, nhưng mình không xác định được URL gốc, nên chưa đưa vào phần Findings.
- Chưa có nguồn gốc (primary) từ Kaiko/CoinMetrics cho số liệu 2025–2026; các số trên đều qua báo chí.
- Chưa tìm được nguồn dữ liệu miễn phí chính thức cho chỉ số Nasdaq/DXY trong khuôn khổ nghiên cứu này.

---

## 8. API miễn phí: endpoint, rate limit, có cần key, có chạy được từ server Mỹ (GitHub Actions) không

### Takeaway
CoinGecko có đủ dữ liệu dominance, tổng vốn hoá và category. Gọi không cần key được nhưng **rất dễ bị 429** (mình bị chặn sau khoảng 5–6 lần gọi liên tiếp). Nên dùng **Demo key miễn phí**. Binance chặn IP Mỹ/datacenter (lỗi 451), nên nếu engine chạy trên GitHub Actions thì **không được phụ thuộc vào api.binance.com**.

### Cited Findings
- `GET https://api.coingecko.com/api/v3/global`: các trường `total_market_cap`, `total_volume`, `market_cap_percentage`, `market_cap_change_percentage_24h_usd`, `updated_at`; cập nhật 10 phút/lần. Demo key gửi qua header `x-cg-demo-api-key` hoặc query `x_cg_demo_api_key` — [CoinGecko docs](https://docs.coingecko.com/v3.0.1/reference/crypto-global)
- `GET /coins/categories` (có dữ liệu thị trường, cập nhật 5 phút/lần) và `/coins/markets?category=<id>` — [CoinGecko docs](https://docs.coingecko.com/reference/coins-categories)
- Rate limit: Public (không key) tính theo IP, mọi người dùng chung IP chia chung hạn mức, không công bố con số; Demo ghi 100 lần/phút trên trang lỗi/rate limit. Lỗi 4xx/5xx **vẫn bị tính** vào hạn mức. 403 = bị chặn, 1020 = CDN firewall — [CoinGecko docs: rate limit](https://docs.coingecko.com/docs/common-errors-rate-limit)
- **Mâu thuẫn**: nhiều nguồn khác ghi Demo = 30 lần/phút và 10.000 lần/tháng, có yêu cầu ghi nguồn (attribution) — [Zuplo](https://zuplo.com/learning-center/coingecko-api); 10.000 credit/tháng còn được trang do CoinGecko host xác nhận — [CoinGecko docs](https://docs.coingecko.com/openclaw-kl). Trang giá chính thức trả 403 với công cụ fetch nên mình chưa đối chiếu được.
- Mình tự kiểm tra (2026-10-19, từ IP ngoài Mỹ, không key): `/global` 200; `/coins/categories` 200; `/coins/categories/list` 200 rồi 429; `/coins/markets?category=layer-1` 200; sau đó liên tục 429 với thông điệp "You've exceeded the Rate Limit".
- Binance áp giới hạn theo IP của server gửi request; IP cloud/datacenter thường bị chặn, kể cả endpoint công khai không cần xác thực. Lỗi thường gặp là 451 — [Railway](https://station.railway.com/questions/deployment-is-crashing-7b190d57); [Vercel Community](https://community.vercel.com/t/binance-api-calls-on-vercel/29895); [Bubble forum](https://forum.bubble.io/t/binance-api-call-stopped-working-because-it-just-restricted-a-service-for-us-location/234946)
- Blockchain Center Altcoin Season Index: trang web truy cập được (200), chưa thấy API — tự kiểm tra bằng curl.

### Inferences
- **Ngân sách gọi API**: quét 15 phút/lần = 96 lần/ngày, khoảng 2.880 lần/tháng. Lấy top 1000 bằng `/coins/markets?per_page=250` mất 4 lần gọi mỗi lượt, tức khoảng 11.520 lần/tháng, **vượt 10.000** của Demo nếu con số đó đúng. Thêm `/global` (khoảng 2.880/tháng) thì càng vượt. Hướng xử lý: giảm tần suất cho coin hạng 251–1000, hoặc dùng nguồn OHLCV khác (Binance không dùng được trên GitHub Actions; sàn khác cần kiểm tra riêng).
- `/global` chỉ cần gọi khoảng 1 lần/giờ vì dữ liệu cập nhật 10 phút/lần và regime thay đổi chậm. Category map chỉ cần cập nhật 1 lần/ngày.
- Mình chưa kiểm tra được CoinGecko có chặn IP GitHub Actions hay không. Rủi ro chính là IP dùng chung nên dễ bị 429 khi không có key → **bắt buộc dùng Demo key**, lưu trong GitHub Secrets.

### Gaps
- Chưa xác minh trực tiếp từ runner GitHub Actions (IP Mỹ) với CoinGecko.
- Con số rate limit Demo (30 hay 100 lần/phút) cần đọc trang pricing chính thức hoặc dashboard tài khoản để chốt.

---

## Tổng hợp đề xuất luật chấm điểm (suy luận từ các phát hiện trên — cần backtest trước khi dùng)

1. **Regime BTC (giữ, mở rộng)**: BTC < EMA200 1D thì hạ Buy (luật hiện có). Thêm: hệ số phạt nhân với beta/correlation của coin với BTC (mục 1). Có bằng chứng về tương quan tăng khi giảm, nhưng ngưỡng là tự chọn.
2. **RS vs BTC, 7–21 ngày (Swing)**: cộng điểm, chỉ cho coin thanh khoản cao (mục 5). Có bằng chứng (mẫu 2014–2018).
3. **Không thưởng RS 1 ngày cho small-cap** (Short-term); có thể phạt coin small-cap vừa tăng quá nóng (mục 5). Có bằng chứng về reversal.
4. **Breadth (độ rộng) alt vs BTC** tự tính trên top 50, cửa sổ 14–30 ngày: điều chỉnh nhẹ ±. Folklore, chưa có kiểm định.
5. **Xu hướng stablecoin dominance (USDT+USDC) so với EMA20**: phạt nhẹ khi tăng mạnh. Folklore, trùng lặp với BTC.
6. **Momentum ngành 7 ngày**: cộng điểm nhỏ. Chưa có bằng chứng, chỉ là thử nghiệm.
7. **Sốc BTC 1H** (giảm > X%/1H): hoãn Buy cho small-cap 1–2 nến (mục 2). Bằng chứng gián tiếp, ngưỡng X chưa có.
