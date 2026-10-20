# Phân tích kỹ thuật (TA), giao dịch intraday crypto và quản trị rủi ro chuyên nghiệp — vì sao hệ luật của Coin Radar có thể lỗ

Bối cảnh hệ thống được đánh giá: vào lệnh gần vùng hỗ trợ/kháng cự (S/R), có điểm số từ trend + RS so với BTC + momentum, có thêm breakout mô hình giá; SL nằm ngoài vùng, TP1 ở vùng mạnh kế tiếp (chốt 50%), phần còn lại trailing; rủi ro 2%/lệnh, tối đa 10 lệnh cùng lúc. Backtest: Swing −0.10R/lệnh (96 lệnh, win 39%); Fast −0.19R/lệnh (441 lệnh, win 29%); short lỗ nhiều hơn long; Fast bị phí chi phối.

Quy ước: "IS" = in-sample (trong mẫu dùng để chọn tham số), "OOS" = out-of-sample (ngoài mẫu). "Trước phí" / "sau phí" ghi rõ từng dòng.

## 1. Bằng chứng nghiêm ngặt về S/R, mô hình giá và chỉ báo (RSI, MACD, MA) trong crypto sau phí và sau hiệu chỉnh data-snooping

### Takeaway
Các luật TA đơn giản trên crypto **có** khả năng dự báo (chủ yếu là luật bám xu hướng: MA, trading range breakout/Donchian) ở khung **ngày**, đặc biệt trong mẫu cũ (2010–2018). Nhưng: (a) Bitcoin mất khả năng dự báo OOS ở Hudson & Urquhart; (b) ở khung intraday, chỉ còn 22/3312 luật (0,7%) có ý nghĩa sau phí 13 bps và **không luật nào có ý nghĩa sau năm 2014**; (c) nhiều nghiên cứu "thắng buy-and-hold" không tính phí. Không tìm thấy nghiên cứu nghiêm ngặt nào cho thấy luật "vào lệnh tại vùng S/R + chấm điểm đa chỉ báo" kiểu retail có lợi nhuận OOS sau phí.

### Cited Findings
- Hudson & Urquhart ("Technical trading and cryptocurrencies", Annals of Operations Research): kiểm định gần **15.000 luật** thuộc 5 lớp; thấy dự báo/lợi nhuận có ý nghĩa ở mọi lớp cho mỗi đồng; **break-even transaction cost cao hơn đáng kể** phí thông thường; **Bitcoin không có khả năng dự báo ở giai đoạn OOS** (các đồng khác vẫn có); dùng thủ tục multiple-hypothesis để chống data-snooping. (Chưa đọc được bản toàn văn — số bps cụ thể chưa xác minh.) — [Springer abstract](https://link.springer.com/article/10.1007/s10479-019-03357-1)
- Detzel, Liu, Strauss, Zhou, Zhu (Financial Management 2021, 50(1):107–137): tỷ lệ giá/MA (5–100 ngày) dự báo lợi suất **ngày** của Bitcoin cả IS lẫn OOS, tạo alpha và Sharpe cao hơn buy-and-hold; có mô hình cân bằng giải thích TA phát sinh từ "rational learning" khi fundamentals khó định giá. Chiến lược: giữ BTC khi giá > MA, ngược lại giữ tiền mặt (T-bill) — tức là **long/flat trên khung ngày, không phải intraday, không short**. — [RePEc](https://ideas.repec.org/a/bla/finmgt/v50y2021i1p107-137.html); [CXO tóm tắt bản 2018](https://www.cxoadvisory.com/currency-trading/timing-bitcoin-with-smas/)
- Gerritsen, Bouri, Ramezanifar, Roubaud (Finance Research Letters 34, 2020, 101263): 7 chỉ báo trend-following, BTC ngày 07/2010–01/2019; **trading range breakout** có sức dự báo mạnh nhất và thắng buy-and-hold, giá trị gia tăng lớn nhất khi thị trường có xu hướng mạnh; Sharpe so sánh bằng bootstrap. Nguồn thứ cấp nói **không tính phí giao dịch**. — [RePEc](https://ideas.repec.org/a/eee/finlet/v34y2020ics1544612319303770.html); [Utrecht portal](https://research-portal.uu.nl/en/publications/the-profitability-of-technical-trading-rules-in-the-bitcoin-marke/)
- Corbet, Eraslan, Lucey, Sensoy (Finance Research Letters 31, 2019, 32–37): kiểm định MA-oscillator và trading range breakout trên **dữ liệu tần suất cao** của BTC (mục tiêu kiểm định S/R); MA được ủng hộ, **VMA** tốt nhất, tín hiệu mua cho lợi nhuận cao hơn tín hiệu bán (khớp với việc short của bạn kém hơn long). — [RePEc](https://ideas.repec.org/a/eee/finlet/v31y2019icp32-37.html)
- Ahmed, Grobys, Sapkota (2020): áp VMA trên 10 privacy coin (ngày) — chỉ thành công với **Dash**; luật TA đơn giản **không** tạo lợi nhuận vượt buy-and-hold trên tập 10 đồng. — [Osuva PDF](https://osuva.uwasa.fi/bitstream/10024/11193/2/Osuva_Ahmed_Grobys_Sapkota_2020.pdf)
- Bakker (Erasmus thesis, 2017): **3312 luật intraday** trên BTC/USD **5 phút** (Bitstamp, 01/2013–07/2017), dùng White's Reality Check, Hansen SPA, Romano-Wolf StepM, stepwise SPA. Trước phí: 541 luật có ý nghĩa. Luật tốt nhất BB(4,0.25,0,0) có break-even cost **6,32 bps một chiều** < phí tối thiểu Bitstamp **10 bps** → phí xóa sạch lợi nhuận. Với phí 13 bps một chiều: chỉ còn **22 luật (0,7%)** có ý nghĩa; số lệnh trung bình của luật có ý nghĩa giảm từ 33.436 xuống 10.720. Phân tích theo năm (sau phí 13 bps): **sau 2014 tất cả luật đều không có ý nghĩa**; luật tốt nhất thay đổi theo từng năm. Lớp OBV không có ý nghĩa dù giao dịch ít. Tác giả ghi "chênh 1 bps phí tạo khác biệt lợi suất rất lớn". — [Bakker PDF](https://thesis.eur.nl/pub/41546/Bakker.pdf)
- Bakker trích văn liệu FX (Schulmeister 2009): luật TA trên dữ liệu ngày suy giảm mạnh từ thập niên 1960 và không lãi từ 1990s, nhưng trên khung 30 phút vẫn có lợi nhuận — tức là cạnh tranh dịch chuyển dần xuống khung thấp hơn rồi bị phí ăn mòn. — [Bakker PDF](https://thesis.eur.nl/pub/41546/Bakker.pdf)
- Nghiên cứu 2025 (arXiv 2511.00665, "Technical Analysis Meets Machine Learning: Bitcoin Evidence") được search engine tóm tắt: chỉ **short-term log MA ratio** và Hashrate Index có lợi nhuận thật IS và OOS; tác giả đặt nghi vấn giá trị của cả TA lẫn phân tích cơ bản trên crypto. (Chỉ đọc qua snippet.) — [arXiv](https://arxiv.org/pdf/2511.00665)
- Zarattini, Pagani, Barbon ("Catching Crypto Trends", SFI RP 25-80, 2025): ensemble Donchian (lookback 5–360 ngày), long-only, top-20 coin thanh khoản nhất, vũ trụ 21.616 tài sản không survivorship bias (2010–03/2025), sizing theo vol mục tiêu 25%/năm, đòn bẩy tối đa 200%, phí kiểm thử 0,10%/0,25%/0,50%; báo cáo **Sharpe > 1,5 sau phí** và alpha 10,8%/năm so với BTC. Đây là bằng chứng mạnh nhất có backtest đầy đủ — và đặc trưng của nó **ngược với hệ của bạn**: khung ngày, long-only, sizing theo vol, ensemble nhiều lookback (không tối ưu một tham số). — [Concretum](https://concretumgroup.com/catching-crypto-trends-a-tactical-approach-for-bitcoin-and-altcoins/); [CXO](https://www.cxoadvisory.com/technical-trading/crypto-asset-trend-following-strategies/); [RePEc](https://ideas.repec.org/p/chf/rpseri/rp2580.html)

### Inferences
- Bằng chứng tích cực tập trung ở **trend-following khung ngày, long/flat**; bằng chứng cho **mean-reversion tại vùng S/R** (mua gần hỗ trợ, bán gần kháng cự) là yếu. Corbet et al. và Bakker đều xếp S/R/breakout vào nhóm trend-following — tức "breakout qua vùng" có cơ sở hơn "bật lại từ vùng".
- Tín hiệu mua > tín hiệu bán (Corbet) + bằng chứng long-only (Detzel, Zarattini) giải thích hợp lý vì sao short của hệ lỗ nhiều hơn: crypto có drift dương dài hạn và các luật bán khống không có bằng chứng tương đương.
- Hệ chấm điểm gộp trend + RS + momentum + S/R + mô hình giá có nhiều bậc tự do; các nghiên cứu nghiêm ngặt cho thấy càng nhiều luật được thử, số "thắng" thật sau hiệu chỉnh càng nhỏ (541 → 22 → 0 sau 2014).

### Gaps
- Không đọc được toàn văn Hudson & Urquhart → chưa có số break-even bps và tên chính xác của thủ tục data-snooping (abstract chỉ nói "multiple hypothesis procedures").
- Không tìm được nghiên cứu học thuật nào kiểm định riêng **RSI/MACD** trên crypto với Reality Check/SPA sau phí; cũng không tìm được nghiên cứu nghiêm ngặt về **chart pattern** (tam giác, cờ, vai-đầu-vai) trên crypto.
- Chưa xác minh được Sharpe/CAGR chi tiết của Zarattini et al. (phần kết quả trên CXO bị paywall); "Sharpe > 1,5 sau phí" lấy từ tóm tắt của search engine về trang Concretum/SSRN.

## 2. Có edge vững ở khung intraday (1H/15m) sau phí taker không?

### Takeaway
Có bằng chứng thống kê về **intraday momentum** (nửa giờ đầu dự báo nửa giờ cuối theo "đồng hồ khối lượng") và các mẫu hình theo giờ/ngày trong tuần, nhưng: hầu hết báo cáo **trước phí**, hiệu ứng **không ổn định theo thời gian** (Baur et al.: "không nhất quán, không bền"), và ở chiều cắt ngang, coin kém thanh khoản **đảo chiều** còn coin lớn **tiếp diễn**. Không tìm thấy nghiên cứu nào chứng minh edge 1H/15m bền vững sau phí taker cho một hệ retail. Với SL hẹp của khung 15m, phí tính theo R rất lớn — khớp với việc Fast mode bị phí chi phối.

### Cited Findings
- Shen, Urquhart, Wang ("Bitcoin intraday time-series momentum", Financial Review 2022): vì BTC giao dịch 24h, dùng khối lượng làm đồng hồ; **lợi suất nửa giờ đầu dự báo dương lợi suất nửa giờ cuối**; mạnh nhất ở phiên khối lượng/biến động cao; có lợi ích kinh tế cho market timing, nhất là khi BTC giảm. Một bài cùng nhóm kết luận momentum do **cung cấp thanh khoản** chứ không do giao dịch muộn có thông tin. — [Birmingham](https://research.birmingham.ac.uk/en/publications/bitcoin-intraday-time-series-momentum/); [Reading PDF](https://reading-9.eprints-hosting.org/100181/3/21Sep2021Bitcoin%20Intraday%20Time-Series%20Momentum.R2.pdf)
- Bài gốc thị trường cổ phiếu (Gao, Han, Li, Zhou): SPY 1993–2013, nửa giờ đầu dự báo nửa giờ cuối, mạnh hơn vào ngày biến động/khối lượng cao, ngày suy thoái, ngày tin vĩ mô. — [Alpha Architect](https://alphaarchitect.com/2014/08/attention-prop-traders-the-first-half-hour-of-trading-predicts-the-last-half-hour/)
- "Intraday return predictability in the cryptocurrency markets: Momentum, reversal, or both" (North American Journal of Economics and Finance 62, 2022, DOI 10.1016/j.najef.2022.101733): **chỉ xác nhận được tiêu đề/DOI**, không lấy được abstract hay số liệu. — [RePEc](https://ideas.repec.org:443/a/eee/ecofin/v62y2022ics1062940822000833.html)
- Zaremba et al. (IRFA 2021, "Up or down?"): cắt ngang, coin có lợi suất ngày trước thấp vượt trội coin có lợi suất cao (**đảo chiều ngắn hạn**), do kém thanh khoản của đa số coin; coin lớn nhất, thanh khoản nhất lại có **momentum ngày**. — [Medeniyet repo](https://earsiv.medeniyet.edu.tr/items/23a96c9f-3952-4bdf-aec5-abafb3aaab70)
- Baur, Cahill, Godfrey, Liu (Finance Research Letters 31, 2019): >15 triệu quan sát, 7 sàn; hiệu ứng giờ/ngày/tháng **thay đổi theo thời gian, không nhất quán/bền vững**, kết luận thị trường BTC hiệu quả; khối lượng cuối tuần thấp hơn, lợi suất thứ Hai cao hơn; hoạt động cao khi sàn Mỹ mở. — [UWA](https://research-repository.uwa.edu.au/en/publications/bitcoin-time-of-day-day-of-week-and-month-of-year-effects-in-retu/); [RePEc](https://ideas.repec.org:443/a/eee/finlet/v31y2019icp78-92.html)
- Quantpedia (dữ liệu Gemini theo giờ 2015–2022): không có giờ nào âm có ý nghĩa thống kê; tệ nhất 03:00–04:00 UTC; chiến lược mua 21:00 bán 23:00 UTC báo cáo **33%/năm**, không rõ đã trừ phí chưa. — [Quantpedia](https://quantpedia.com/are-there-any-simple-calendar-effects-in-bitcoin-market/)
- Concretum ("Seasonality in Bitcoin intraday trend trading"): ensemble trend-following tần suất cao trên BTC, vol mục tiêu 20%, 2018–2025, **Sharpe ~1,6 trước phí (gross)**, không báo cáo sau phí; lợi nhuận tập trung từ ~19:00 NY Chủ nhật kéo ~24h ("Monday Asia Open Effect", rõ hơn sau giữa 2020); sáng Chủ nhật Mỹ âm. BTC long-only vol-targeted làm benchmark có Sharpe < 0,8. — [Concretum](https://concretumgroup.com/seasonality-in-bitcoin-intraday-trend-trading/)
- Kim & Hansen (arXiv 2607.09426, 07/2026): 6 hợp đồng perpetual Binance; bùng nổ khối lượng/biến động ở mốc 1 phút, 5 phút, **15 phút** do thuật toán; lợi suất mở đầu mốc 15 phút dự báo được OOS; mất cân bằng lệnh đầu kỳ dự báo lợi suất 4–12 giờ, yếu hơn nhiều ở tần suất thấp hơn; **không** nêu khả năng giao dịch sau phí. — [arXiv](https://arxiv.org/abs/2607.09426)
- Bakker (BTC 5 phút): phí 10–13 bps một chiều xóa lợi nhuận luật tốt nhất (break-even 6,32 bps); không luật nào có ý nghĩa sau 2014. — [Bakker PDF](https://thesis.eur.nl/pub/41546/Bakker.pdf)

### Inferences
- **Số học phí theo R** (suy luận, không có nguồn): chi phí khứ hồi tính bằng R ≈ (phí vào + phí ra + trượt giá) / (khoảng cách SL theo %). Nếu phí taker ~0,05%/chiều (mức VIP0 của Binance USDⓈ-M — **chưa xác minh trong phiên này**), khứ hồi 0,10%: SL 2% → 0,05R; SL 1% → 0,10R; SL 0,5% → 0,20R; cộng trượt giá. Với Fast mode, −0,19R/lệnh có thể gần như toàn bộ là phí nếu SL trung bình ~0,5–1%. Chốt 50% ở TP1 không làm tăng tổng notional thoát nhưng nếu thoát bằng market thì mỗi phần đều trả taker.
- Win rate 29% với chi phí cố định ~0,1–0,2R mỗi lệnh nghĩa là lệnh thắng phải trung bình ≥ ~2,6–3R chỉ để hòa — khó đạt khi TP1 là "vùng mạnh kế tiếp" thường gần.
- Các hiệu ứng intraday có tài liệu (nửa giờ cuối, mốc 15 phút, Monday Asia open) là hiệu ứng **theo đồng hồ/thời điểm**, không phải theo vùng S/R; hệ hiện tại không khai thác chúng.
- Altcoin nhỏ có xu hướng đảo chiều ngắn hạn (Zaremba) — điều này làm luật breakout trên coin nhỏ ở khung thấp dễ dính "false breakout".

### Gaps
- Không lấy được abstract/kết quả của bài NAJEF 2022 "Momentum, reversal, or both" (tác giả có thể là Wen et al. — chưa xác nhận).
- Không tìm thấy nghiên cứu nào kiểm định hệ 1H/15m trên altcoin perpetual **sau phí taker + funding + trượt giá** với hiệu chỉnh data-snooping.
- Biểu phí Binance Futures hiện hành chưa được tra trực tiếp.

## 3. Trader hệ thống chuyên nghiệp định cỡ vị thế thế nào (volatility targeting, risk budget danh mục, sizing theo tương quan, Kelly) và bằng chứng vol targeting cải thiện Sharpe crypto

### Takeaway
Quỹ hệ thống định cỡ theo **biến động mục tiêu** (vd. 20–25%/năm cho cả danh mục hoặc từng tài sản), có trần đòn bẩy, và quản lý **rủi ro tổng danh mục** chứ không cộng dồn "2%/lệnh". Vol targeting cải thiện Sharpe rõ ở **tài sản rủi ro** (cổ phiếu, tín dụng) và luôn giảm đuôi cực trị; cho crypto, bằng chứng trực tiếp chủ yếu là trong các chiến lược trend/momentum (giảm "momentum crash"), chưa thấy một con số "Sharpe tăng X" được kiểm định độc lập. 10 lệnh altcoin cùng chiều với tương quan ~0,7 tương đương ~1,4 cược độc lập.

### Cited Findings
- Harvey, Hoyle, Korgaonkar, Rattray, Sargaison, Van Hemert ("The Impact of Volatility Targeting", JPM Fall 2018; Duke + Man AHL): vol targeting tăng Sharpe **chỉ với tài sản rủi ro** (cổ phiếu, tín dụng) do leverage effect; với trái phiếu, FX, hàng hóa tác động lên Sharpe **không đáng kể**; nhưng **giảm xác suất lợi suất cực trị ở mọi lớp tài sản**. Cổ phiếu: Sharpe 0,40 → 0,48–0,51 (số từ tóm tắt Alpha Architect). — [Duke PDF](https://people.duke.edu/~charvey/Research/Published_Papers/P135_The_impact_of.pdf); [Alpha Architect](https://alphaarchitect.com/volatility-targeting-improves-risk-adjusted-returns/)
- Zarattini et al. 2025: mỗi vị thế được điều chỉnh **hằng ngày** về vol mục tiêu 25%/năm (= 25% / độ lệch chuẩn 90 ngày annualized), trần đòn bẩy 200%. — [CXO](https://www.cxoadvisory.com/technical-trading/crypto-asset-trend-following-strategies/)
- Concretum intraday BTC: exposure scale theo vol mục tiêu 20%/năm. — [Concretum](https://concretumgroup.com/seasonality-in-bitcoin-intraday-trend-trading/)
- Bài Springer 2025 (Financial Markets and Portfolio Management, s11408-025-00474-9) về **volatility-managed cryptocurrency momentum**: vol management là công cụ hữu ích để giảm momentum crash trong crypto; văn liệu cổ phiếu còn tranh cãi (một nghiên cứu thấy vol management làm giảm hiệu quả real-time, nghiên cứu khác thấy cách Barroso–Santa-Clara không có look-ahead bias). Không lấy được số Sharpe. — [Springer](https://link.springer.com/article/10.1007/s11408-025-00474-9)
- Finance Research Letters 2021 (danh mục crypto biến động thấp): danh mục tập trung coin biến động thấp, lookback/holding 6–12 tháng cho excess return có ý nghĩa; thêm stop-loss giảm mạnh downside risk và cải thiện Sharpe đáng kể (đây là **chọn theo vol**, không phải vol targeting). — [ZHAW](https://srv-clst-301-data66.zhaw.ch/handle/11475/23853)
- Tương quan altcoin–BTC: phân tích trên TradingView cho tương quan trung bình ~**0,69**; một script retail nói "+0,7"; preprint arXiv thấy tương quan gần 1 khi tính trên trung bình 7/30 ngày. **Không phải nguồn bình duyệt.** — [TradingView](https://se.tradingview.com/chart/BTCUSDT/8DzZqPA4-Correlation-of-Cryptocurrencies); [arXiv 2409.03674](https://arxiv.org/pdf/2409.03674)
- MQL5 blog (09/2026, giai thoại): một chiến lược BTC đơn lẻ tốt trong pha xu hướng rồi đi ngang/chảy máu kéo dài. — [MQL5](https://www.mql5.com/en/blogs/post/775935)

### Inferences
- **Tính toán tương quan (suy luận, công thức chuẩn):** số cược hiệu dụng N_eff = N / (1 + (N−1)ρ). Với 10 lệnh, ρ=0,5 → 1,8; ρ=0,7 → **1,4**; ρ=0,8 → 1,2. Độ lệch chuẩn rủi ro danh mục khi mỗi lệnh rủi ro 2%: 2% × √(10 + 90ρ) = 14,8% (ρ=0,5), **17,1%** (ρ=0,7), 18,1% (ρ=0,8) — gần bằng mức tối đa 20% của tương quan hoàn hảo. Tức là "2% × 10 lệnh" thực chất là một cược ~15–20% vốn vào hướng của BTC. Trong cú sập (tương quan tăng về ~1), cả 10 SL có thể bị kích hoạt cùng lúc, cộng trượt giá.
- Cách chuyên nghiệp: đặt **ngân sách rủi ro danh mục** (vd. vol mục tiêu 20–25%/năm cho toàn danh mục), chia cho các vị thế theo nghịch đảo vol và điều chỉnh cho tương quan (hoặc tính rủi ro theo beta với BTC: tổng beta-dollar exposure có trần), thay vì rủi ro cố định theo khoảng cách SL.
- **Kelly** (suy luận từ định nghĩa, không có nguồn trong phiên): với edge âm (−0,10R, −0,19R), Kelly tối ưu = 0 — không nên giao dịch. Với edge +0,1R và độ lệch chuẩn ~1,3R, Kelly đầy đủ ≈ μ/σ² ≈ 0,1/1,69 ≈ 6% rủi ro mỗi lệnh *nếu các lệnh độc lập*; quỹ thường dùng ¼–½ Kelly vì ước lượng edge rất nhiễu, và với 10 lệnh tương quan 0,7 thì phải chia ngân sách đó cho N_eff≈1,4, không phải cho 10.
- Hệ "SL theo vùng S/R" tạo khoảng cách SL rất khác nhau giữa các lệnh → khối lượng notional dao động mạnh, và lệnh có SL hẹp (notional lớn) chịu phí/trượt giá theo R nặng nhất.

### Gaps
- Không tìm được nghiên cứu bình duyệt báo cáo con số cụ thể "vol targeting nâng Sharpe crypto từ X lên Y" có kiểm định OOS.
- Không xác minh được bài Liu, Tsyvinski, Wu (RFS 2022) về mức giải thích của nhân tố thị trường crypto.
- Không có nguồn chính thống về tỷ lệ Kelly mà quỹ crypto dùng thực tế.

## 4. Quant chuyên nghiệp chống overfitting thế nào; với 16 trial trên 3 tháng dev + 30 ngày blind, cần bao nhiêu dữ liệu để phát hiện edge +0,1R/lệnh?

### Takeaway
Theo MinBTL của Bailey–Borwein–López de Prado–Zhu, với 16 cấu hình độc lập cần **< ~5,5 năm** dữ liệu để Sharpe IS = 1 không phải là ảo; 3 tháng dev là quá ngắn tới mức Sharpe tối đa kỳ vọng của **16 chiến lược vô kỹ năng** có thể lên tới ~4 (cận trên). Để phát hiện +0,1R/lệnh với độ tin cậy cần khoảng **650–1.600 lệnh** (tùy độ lệch chuẩn R), trong khi Swing chỉ có 96 lệnh. Riêng kết quả Fast (−0,19R trên 441 lệnh) thì **âm có ý nghĩa thống kê** (t ≈ −3 đến −4).

### Cited Findings
- Bailey, Borwein, López de Prado, Zhu ("Pseudo-Mathematics and Financial Charlatanism", Notices of the AMS): Định lý 3.1 — MinBTL (năm) để tránh chọn một chiến lược có Sharpe IS = E[max_N] trong N chiến lược độc lập có Sharpe OOS kỳ vọng = 0; **cận trên MinBTL < 2·ln(N) / E[max_N]²**. Ví dụ: chỉ có 5 năm dữ liệu thì **không nên thử quá 45 cấu hình độc lập**, nếu không gần như chắc chắn tìm được chiến lược Sharpe IS = 1 nhưng Sharpe OOS kỳ vọng = 0. MinBTL là điều kiện **cần, không đủ**; trial không độc lập thì ước lượng N hiệu dụng bằng PCA. — [Bailey et al. PDF](https://carmamaths.org/jon/backtest.pdf)
- Cùng bài: trên chuỗi random walk 1000 ngày (~4 năm), vẫn tối ưu ra được cấu hình có thống kê đẹp — minh họa overfitting thuần túy. — [Bailey et al. PDF](https://carmamaths.org/jon/backtest.pdf)
- Bailey & López de Prado, "The Deflated Sharpe Ratio" (JPM 2014): DSR hiệu chỉnh 2 nguồn thổi phồng hiệu suất — **selection bias do multiple testing** và **lợi suất không chuẩn** (skew, kurtosis); không kiểm soát số trial dẫn đến kỳ vọng quá lạc quan. — [SSRN 2460551](https://papers.ssrn.com/abstract=2460551)
- DSR nâng ngưỡng của Probabilistic Sharpe Ratio theo số trial độc lập (giả định trial độc lập). — [Trading Strategy glossary](https://tradingstrategy.ai/glossary/probabilistic-sharpe-ratio)
- Công cụ Bailey/López de Prado: MinBTL là điều kiện cần không đủ; có thêm thước đo Probability of Backtest Overfitting (PBO) dựa trên CSCV. — [Bailey overfit tools](https://www.davidhbailey.com/dhbpapers/overfit-tools-at.pdf); [CXO](https://www.cxoadvisory.com/big-ideas/insidiousness-of-overfitting-investment-strategies-via-iterative-backtests)
- Bằng chứng thực nghiệm về suy giảm theo thời gian: Bakker — luật tốt nhất mỗi năm khác nhau, sau 2014 không luật nào có ý nghĩa; Hudson & Urquhart — BTC mất dự báo OOS. — [Bakker PDF](https://thesis.eur.nl/pub/41546/Bakker.pdf); [Springer](https://link.springer.com/article/10.1007/s10479-019-03357-1)

### Inferences
- **Áp MinBTL vào quy trình hiện tại (tính toán của tôi):** N=16 → 2·ln16 = 5,55 → cần < ~5,5 năm để Sharpe IS = 1 đáng tin. Đảo ngược: với T = 0,25 năm, Sharpe annualized tối đa kỳ vọng của 16 chiến lược vô kỹ năng có cận trên ≈ √(2·ln16/0,25) ≈ **4,7** (cận trên, giả định độc lập; thực tế 16 trial tương quan nên N hiệu dụng nhỏ hơn). Kết luận: dev 3 tháng gần như không phân biệt được kỹ năng và may rủi.
- **Cỡ mẫu để phát hiện +0,1R/lệnh** (z-test trung bình, giả định lệnh độc lập; σ_R chưa biết nên thử 3 mức):
  - σ=1,0R: 384 lệnh (để CI 95% hai phía loại 0, power 50%); **618 lệnh** (một phía 5%, power 80%).
  - σ=1,3R: 649 / **1.045** lệnh.
  - σ=1,6R: 983 / **1.583** lệnh.
  - Tương quan giữa các lệnh đồng thời (10 lệnh altcoin cùng chiều) làm số lệnh *hiệu dụng* nhỏ hơn nhiều → con số thực tế cần lớn hơn (có thể gấp vài lần). Cần thêm hiệu chỉnh DSR cho 16+ trial.
  - Ở nhịp Swing (~96 lệnh/3 tháng ≈ 1 lệnh/ngày) cần ~1,7–4 năm dữ liệu; 30 ngày blind (~30 lệnh) có sai số chuẩn ~0,18–0,24R → **không thể** xác nhận hay bác bỏ +0,1R.
- **Ý nghĩa kết quả hiện tại:** Swing −0,10R, n=96: SE ≈ 0,10–0,13R → t ≈ −0,75 đến −0,98 (không phân biệt được với 0, cũng không với +0,1R). Fast −0,19R, n=441: SE ≈ 0,048–0,062R → t ≈ −3,1 đến −4,0 → **lỗ có ý nghĩa thống kê** (trùng với kỳ vọng phí ăn mòn).
- Quy trình chuẩn của quant (theo López de Prado): ghi lại **mọi** trial để tính DSR; dùng **walk-forward** hoặc **CPCV** (combinatorial purged cross-validation, có purging + embargo để tránh rò rỉ nhãn chồng lấn giữa train/test) thay vì một lần tách dev/blind; báo cáo PBO; khóa tham số trước khi chạy blind và chỉ chạy blind một lần.

### Gaps
- Chưa trích xuất được công thức DSR đầy đủ và mô tả chi tiết CPCV từ nguồn gốc (sách *Advances in Financial Machine Learning*, 2018) trong phiên này — nội dung CPCV ở trên dựa trên hiểu biết chung, chưa có trích dẫn trực tiếp.
- Không biết σ_R thật của hệ; cần tính từ log backtest để chốt cỡ mẫu.

## 5. Lọc chế độ thị trường: điều kiện BTC trên SMA200 có cải thiện chiến lược long altcoin trong nghiên cứu có tài liệu không?

### Takeaway
Không tìm thấy nghiên cứu bình duyệt hoặc backtest công khai đầy đủ nào định lượng tác dụng của filter "BTC > SMA200" lên chiến lược long altcoin. Bằng chứng gián tiếp ủng hộ: lợi nhuận TA tập trung vào pha xu hướng và vào phía mua; các chiến lược tốt nhất có tài liệu là long-only/flat theo xu hướng. Nhưng đây là suy luận, không phải kết quả đo được.

### Cited Findings
- BTC SMA200 được mô tả là một regime filter phổ biến (trên SMA200 = bull) — chỉ là định nghĩa, không có số liệu hiệu quả. — [Trading Strategy glossary](https://tradingstrategy.ai/glossary/regime-filter)
- Các script TradingView kết hợp BTC>SMA200, BTC dominance, TOTAL3>SMA100 làm filter altcoin — không công bố backtest. — [TradingView](https://fr.tradingview.com/script/oEO0qLlk-BTC-Regime-Buy-the-Dip-Pro-with-Frozen-Manual-Levels)
- Detzel et al. 2021: luật giá > MA (5–100 ngày) của BTC dự báo lợi suất BTC IS và OOS, giữ tiền mặt khi dưới MA. — [RePEc](https://ideas.repec.org/a/bla/finmgt/v50y2021i1p107-137.html)
- Gerritsen et al. 2020: giá trị của trading range breakout lớn nhất khi thị trường có xu hướng mạnh. — [RePEc](https://ideas.repec.org/a/eee/finlet/v34y2020ics1544612319303770.html)
- Corbet et al. 2019: tín hiệu mua cho lợi suất cao hơn tín hiệu bán. — [RePEc](https://ideas.repec.org/a/eee/finlet/v31y2019icp32-37.html)
- Zarattini et al. 2025: long-only, đứng ngoài khi không có xu hướng; không đề cập filter BTC. — [CXO](https://www.cxoadvisory.com/technical-trading/crypto-asset-trend-following-strategies/)

### Inferences
- Vì altcoin tương quan ~0,7 với BTC, filter theo xu hướng BTC thực chất là kiểm soát "một cược lớn" (xem mục 3). Bằng chứng Detzel (MA ngày dự báo BTC OOS) là lý do hợp lý nhất để thử filter, nhưng phải kiểm định như một trial mới (tính vào N cho DSR), và chỉ tin khi có ≥ 2 chu kỳ bull/bear (≥ 4–8 năm dữ liệu altcoin, xử lý survivorship bias — coin đã hủy niêm yết).
- Short lỗ hơn long + bằng chứng long-only → phương án được văn liệu ủng hộ nhiều nhất là bỏ/giảm mạnh short, hoặc chỉ short khi BTC trong regime giảm.

### Gaps
- Không có nghiên cứu học thuật nào đo trực tiếp tác dụng của BTC>SMA200 trên lợi nhuận/drawdown chiến lược altcoin. Cần tự backtest với dữ liệu không survivorship bias, đếm vào số trial.
