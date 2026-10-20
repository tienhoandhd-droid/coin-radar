# Bằng chứng học thuật & practitioner (2020–2026): chiến lược crypto theo quy tắc nào thật sự có kỳ vọng dương sau phí

Ghi chú dùng làm "nền what-works" để đối chiếu với các claim của bot GitHub. Mọi con số đều kèm URL và nhãn chất lượng bằng chứng:

- **[PR]** = peer-reviewed (đã bình duyệt, đăng tạp chí)
- **[WP]** = working paper / preprint (SSRN, arXiv, NBER, Swiss Finance Institute) – chưa hoặc đang bình duyệt
- **[PRACT]** = practitioner / blog / tài liệu công ty quản lý quỹ
- **[SEC]** = nguồn thứ cấp (tóm tắt, aggregator như Quantpedia, CXO Advisory, Alpha Architect)
- **[THESIS]** = luận văn / luận án
- **[PAYWALL]** = bài bị khoá, tôi chỉ đọc được abstract hoặc tóm tắt

Giới hạn quan trọng: với vài bài quan trọng (Hudson & Urquhart 2021; Zarattini–Pagani–Barbon 2025; Grobys et al. 2020) tôi chỉ đọc được abstract/tóm tắt, không đọc được bảng kết quả đầy đủ (máy chủ trả 403/502). Những chỗ đó ghi rõ ở mục Gaps.

---

## Câu hỏi 1: Các replication có hệ thống của technical analysis (TA) trên crypto nói gì, và bao nhiêu quy tắc "thắng cao" sống sót sau hiệu chỉnh data-snooping?

### Takeaway
Khi kiểm hàng nghìn đến hàng chục nghìn quy tắc TA với hiệu chỉnh multiple-testing (data-snooping = thiên lệch do thử quá nhiều quy tắc rồi chọn cái tốt nhất), kết quả **chia đôi**: các nghiên cứu dùng dữ liệu 2010–2019 (giai đoạn thị trường non trẻ) thấy TA có dự báo được; các nghiên cứu dùng dữ liệu 2020–2023 hoặc áp dụng phương pháp "Lucky Factors" nghiêm ngặt hơn thấy gần như **không còn quy tắc nào** sống sót, nhất là với Bitcoin. Điểm chung đáng chú ý nhất: ngay cả bài lạc quan nhất (Hudson & Urquhart) cũng kết luận **Bitcoin không còn dự báo được out-of-sample**.

### Cited Findings
- Hudson & Urquhart, *Annals of Operations Research* 297:191–220 (2021, online 2019) **[PR][PAYWALL]**: kiểm "almost 15,000 rules" thuộc 5 lớp quy tắc TA (moving average, filter, support/resistance, oscillator, channel breakout) trên 2 sàn Bitcoin + 3 coin khác; dùng multiple-hypothesis tests để chống data-snooping; kết luận có "significant predictability and profitability" ở mọi lớp quy tắc, breakeven cost "substantially higher than those typically found in cryptocurrency markets", nhưng: "there is no predictability for Bitcoin in the out-of-sample period, although predictability remains in other cryptocurrency markets" — [Springer](https://link.springer.com/article/10.1007/s10479-019-03357-1); [Hull repository](https://hull-repository.worktribe.com/output/2328042); 5 lớp quy tắc theo survey arXiv [Fang et al.](https://arxiv.org/pdf/2003.11352) **[SEC]**.
- Li, Wang, Wang & Yang, *Journal of Accounting and Finance* 23(4), 2023 **[PR – tạp chí ít uy tín]**: kiểm 4 nhóm chiến lược TA trên BTC/USDT và ETH/USDT giai đoạn 2022–2023, chia mẫu analysis/prediction, hiệu chỉnh data-snooping (keyword "reality check"): "lack of profitable technical trading strategies in both sample periods, even after rigorous adjustments for data snooping" — [articlegateway.com](https://articlegateway.com/index.php/JAF/article/view/6453).
- Wei (PhD thesis, Glasgow 2021) **[THESIS]**: áp dụng phương pháp "Lucky Factors" của Harvey & Liu lên các quy tắc TA crypto; kết luận không quy tắc nào trong nhóm lợi nhuận cao nhất nhất quán với năng lực dự báo thật, lợi nhuận bề ngoài có thể do data-snooping — [theses.gla.ac.uk](https://theses.gla.ac.uk/82986/1/2021WeiMingzhePhD.pdf).
- Bài báo tiếp theo từ nhóm Glasgow, "Cryptocurrencies and Lucky Factors: The value of technical and fundamental analysis", *International Journal of Finance & Economics* (DOI 10.1002/ijfe.2863, 2024) **[PR]**: chỉ một nhóm nhỏ quy tắc có dự báo, "the short-term log moving-average ratio the only one showing genuine profitability in and out of sample"; kết luận giá trị của cả TA lẫn fundamental analysis trên crypto là "questionable" — [eprints.gla.ac.uk](https://eprints.gla.ac.uk/302711). (Tôi chỉ lấy được metadata PDF + tóm tắt từ search, không đọc được bảng.)
- Deprez & Frömmel, *International Review of Economics & Finance* 93:858–874 (2024) **[PR][PAYWALL]**: kiểm **75,360** quy tắc đơn giản thuộc 6 lớp, cả daily lẫn intraday trên Bitcoin, có phí giao dịch, chọn quy tắc bằng multiple-hypothesis procedure rồi gộp thành danh mục và đánh giá out-of-sample: các quy tắc đơn giản có thể vượt buy-and-hold out-of-sample "especially risk–return wise" — [IDEAS/RePEc](https://ideas.repec.org/a/eee/reveco/v93y2024ipbp858-874.html).
- Grobys, Ahmed & Sapkota, *Finance Research Letters* 32 (2020) **[PR, open access]**: SMA trên 11 coin giao dịch nhiều nhất, daily 2016–2018; quy tắc MA 20 ngày tốt nhất, "excluding Bitcoin the technical trading rule generates an excess return of 8.76% p.a. after controlling for the average market return" — [osuva.uwasa.fi](https://osuva.uwasa.fi/handle/11111/619). Bài tiếp theo trên 10 privacy coin: chỉ Dash có lợi (14.6–18.25%/năm vượt buy-and-hold), "when applying the technical trading rules to the entire set of ten privacy coins, simple technical trading rules do not generate positive returns in excess of a buy-and-hold strategy" — [osuva.uwasa.fi](https://osuva.uwasa.fi/items/6ea67061-d6a8-48b0-b7e0-a2b73ff27bd5/full) **[PR]**.
- Detzel, Liu, Strauss, Zhou & Zhu, *Financial Management* 50(1):107–137 (2021) **[PR][PAYWALL]**: tỉ số price/moving-average (SMA 5–100 ngày; giữ BTC khi giá > MA, ngược lại giữ tiền mặt) dự báo lợi nhuận BTC daily cả in-sample lẫn out-of-sample, chiến lược có alpha và Sharpe cao hơn buy-and-hold; có mô hình lý thuyết giải thích TA là kết quả của "rational learning" khi tài sản khó định giá — [WUSTL](https://profiles.wustl.edu/en/publications/learning-and-predictability-via-technical-analysis-evidence-from-/); [CXO tóm tắt bản WP 2018](https://www.cxoadvisory.com/currency-trading/timing-bitcoin-with-smas/) **[SEC]**.
- Bakker (Erasmus MSc thesis, 2017) **[THESIS]**: 3,312 quy tắc intraday trên BTC/USD 5 phút, nhiều quy tắc lãi sau data-snooping và phí, nhưng "profitability is highly unstable and declines over time" — [thesis.eur.nl](https://thesis.eur.nl/pub/41546/Bakker.pdf).
- Một bài trên *Risks* (2020, dữ liệu 2012–2019) **[PR]** – tóm tắt từ search: intraday thì buy-and-hold thắng các quy tắc TA, còn daily thì SMA là tốt nhất — chỉ có qua kết quả search (gaps bên dưới) [epub.ub.uni-muenchen.de](https://epub.ub.uni-muenchen.de/97651/) là bài intraday autocorrelation khác.

### Inferences
- Thứ tự thời gian của bằng chứng: TA "thắng" trên dữ liệu 2013–2019 (Hudson & Urquhart; Grobys; Detzel) → "còn thắng nhưng chỉ vài quy tắc MA ngắn hạn" (Glasgow 2024; Deprez & Frömmel 2024) → "không còn gì sau data-snooping" trên 2022–2023 (Li et al.). Điều này khớp với mô-típ thị trường trưởng thành, phí và cạnh tranh tăng.
- Quy tắc duy nhất lặp lại ở nhiều bài độc lập là **price vs moving average (regime filter) trên daily bars**: MA 20 ngày (Grobys), SMA 5–100 ngày (Detzel), "short-term log MA ratio" (Glasgow). Đây là họ quy tắc đáng tin nhất trong TA đơn giản.
- Không bài nào trong số trên báo cáo "win rate" như một chỉ số; học thuật đánh giá bằng mean excess return, t-stat sau hiệu chỉnh, Sharpe. Một bot GitHub khoe "win rate 85%" đang dùng thước đo mà văn liệu không coi trọng.
- Với Bitcoin riêng lẻ, phát hiện lặp lại là **dự báo được in-sample nhưng mất out-of-sample** (Hudson & Urquhart; Li et al.) → bot chỉ backtest BTC một giai đoạn là chưa đủ.

### Gaps
- Không truy cập được bảng kết quả Hudson & Urquhart (403) nên không có con số Sharpe/breakeven cost cụ thể; chỉ có abstract.
- Không đọc được số liệu bảng của bài Glasgow 2024 và Deprez & Frömmel (PDF nhị phân / paywall).
- Không tìm được nghiên cứu nào báo cáo trực tiếp "bao nhiêu % quy tắc có win rate cao sống sót sau White's Reality Check" cho crypto. Các bài chỉ báo cáo số quy tắc có ý nghĩa thống kê, không phân tầng theo win rate.

---

## Câu hỏi 2: Họ chiến lược nào có bằng chứng sau phí mạnh nhất trên crypto spot/perp, tham số và holding period ra sao, có sống qua 2022 và 2025 không?

### Takeaway
Ba họ có bằng chứng sau phí tốt nhất: (1) **time-series trend following trên daily bars** (Donchian/MA ensemble, vol-targeting, holding vài tuần → vài tháng) — Sharpe ~1.0–1.5+ sau phí trên mẫu dài; (2) **cross-sectional momentum** (past 1–4 tuần, rebalance tuần) — có ý nghĩa thống kê mạnh nhưng phí ăn mòn, alpha đến từ short leg; (3) **funding-rate carry / basis** (long spot, short perp) — Sharpe rất cao (2–6) trong 2020–2024 nhưng **âm trong 2025** và chịu rủi ro liquidation/sàn. Mean reversion intraday chỉ có bằng chứng về autocorrelation âm, không có chiến lược sau phí được bình duyệt.

### Cited Findings

**(a) Time-series trend following / momentum, daily bars**
- Zarattini, Pagani & Barbon, "Catching Crypto Trends: A Tactical Approach for Bitcoin and Altcoins", Swiss Finance Institute Research Paper 25-80 (2025) **[WP]**: ensemble Donchian channel nhiều lookback + vol-based position sizing, rotational portfolio top-20 coin thanh khoản nhất, dataset survivorship-bias-free từ 2015; "Sharpe ratio above 1.5" và "annualized alpha of 10.8% versus Bitcoin", net of fees — [IDEAS/RePEc](https://ideas.repec.org/p/chf/rpseri/rp2580.html); [abarbon.com](https://abarbon.com/papers/catching-crypto-trends). Chi tiết thiết lập theo CXO Advisory **[SEC][PAYWALL]**: 21,616 crypto-assets, Jan 2010–mid-Mar 2025, lookback 5/10/20/30/60/90/150/250/360 ngày, entry = max close của khoảng lookback, trailing stop = trung điểm max–min, vol target "25% divided by annualized 90-day standard deviation", leverage cap 200%, phí thử 0.10%/0.25%/0.50% — [CXO](https://www.cxoadvisory.com/technical-trading/crypto-asset-trend-following-strategies/).
- Rozario, Holt, West & Ng, "A Decade of Evidence of Trend Following Investing in Cryptocurrencies", arXiv 2009.12155 (2020) **[WP]**: BTCUSD Bitstamp hourly, 13/9/2011–12/12/2019, MA crossover (SMA/EMA/DEMA) lookback 1–1,000 giờ, walk-forward theo năm; best Sharpe full period SMA 1.09, EMA 1.35, DEMA 1.32; "255% walkforward annualised returns"; **nhưng** "We assumed negligible transaction fees, bid-offer spread, slippage and market impact" — [arXiv](https://arxiv.org/abs/2009.12155); [ar5iv](https://ar5iv.labs.arxiv.org/html/2009.12155). Chất lượng thấp: không phí, không MDD, mẫu kết thúc 2019.
- Bui & Nguyen, "AdaptiveTrend", arXiv 2602.11708 (Feb 2026) **[WP – tự backtest, chưa bình duyệt]**: trend following bar 6 giờ + xây danh mục hàng tháng, 150+ cặp, out-of-sample 2022–2024 (36 tháng): "annualized Sharpe ratio of 2.41, a maximum drawdown of -12.7%, and a Calmar ratio of 3.18", vượt TSMOM và buy-and-hold, có "transaction cost modeling" nhưng không nêu mức — [arXiv](https://arxiv.org/abs/2602.11708). Đây là ví dụ điển hình của claim cần nghi ngờ: Sharpe 2.41 trên 36 tháng với nhiều tham số thích nghi.
- Gbadebo (2026, *Buhalterinės apskaitos teorija ir praktika*) **[PR – tạp chí nhỏ]**: EMA đa khung trên 8 coin 2020–10/2025, time-series momentum annual return 31.96%, cross-sectional momentum MDD 55.0% — [journals.vu.lt](https://www.journals.vu.lt/BATP/en/article/view/44540).
- Liu & Tsyvinski, *Review of Financial Studies* (2021) **[PR]**: có "strong time-series momentum effect" trong lợi nhuận crypto — [NBER w24877](https://www.nber.org/system/files/working_papers/w24877/w24877.pdf).

**(b) Cross-sectional momentum**
- Liu, Tsyvinski & Wu, "Common Risk Factors in Cryptocurrency", *Journal of Finance* 77(2):1133–1177 (2022) **[PR]**: 3 nhân tố crypto market, size, momentum giải thích cross-section; 10 đặc tính tạo long-short có lãi — [SSRN 3379131](https://papers.ssrn.com/abstract=3379131); [NBER w25882](https://www.nber.org/papers/w25882.pdf); tóm tắt [Alpha Architect](https://alphaarchitect.com/2022/06/factors-investing-in-cryptocurrency) **[SEC]**.
- Borri, Liu, Tsyvinski & Wu, "Cryptocurrency as an Investable Asset Class: Coming of Age", arXiv 2510.14435 (Oct 2025, v4 Mar 2026) **[WP]**: cross-sectional momentum (CMOM, past two-week returns), quintile 5–1 mean weekly return 0.026 full sample (t = 3.89) và 0.021 post-2020 (t = 3.70); CoinGecko 31/12/2013–6/9/2025 — [arXiv html](https://arxiv.org/html/2510.14435). Không nêu phí.
- Fieberg, Liedtke & Zaremba, *International Review of Financial Analysis* 94 (2024) **[PR]**: "The momentum effect prevails in larger cryptocurrencies but incurs substantial trading costs and extracts alphas largely from short positions"; size/volume anomalies "originate from micro-cap coins of negligible economic importance"; "Most abnormal returns occur primarily in bull markets and fade over time"; khuyến nghị tập trung long, tính phí, nhấn mạnh hiệu năng các năm gần đây — [open.icm.edu.pl](https://open.icm.edu.pl/handle/123456789/25544).

**(c) Funding-rate carry / basis (long spot, short perpetual)**
- He, Manela, Ross & von Wachter, "Fundamentals of Perpetual Futures", arXiv 2212.06888 (v5; v7 Sep 2026) **[WP]**: Binance hourly, BTC/ETH từ 8/1/2020 đến 11/3/2024; Sharpe annualized theo bậc phí (Table 5): BTC 3.53 (no fee) / 2.20 / 2.16 / **1.80 (retail high fee)**; ETH 4.83 / 2.95 / 2.86 / **2.55**; BNB 12.31→4.84; DOGE 10.35→3.58; ADA 10.43→2.68. MDD under high fee: BTC −4.43%, ETH −3.94%, DOGE −8.56%. **2022: BTC high-fee Sharpe rơi xuống 0.70, chiến lược chỉ active ~9% thời gian** (Table 6). Cảnh báo: "Temporary worsening of apparent arbitrage opportunities can lead to liquidations and losses"; trên FTX một số vị thế bị "involuntarily" thanh lý — [arXiv html v5](https://arxiv.org/html/2212.06888v5).
- Borri, Liu, Tsyvinski & Wu (2025) **[WP]**: "Over the full sample, which goes from 2020 to 2025, the annualized Sharpe ratio of the cryptocurrency carry is 6.45. Beginning in 2024, the Sharpe ratio falls to 4.06, and it turns negative in 2025"; funding rate BTC Binance 8h, 1/8/2020–31/5/2025, "mean return of approximately 8% with a low volatility of 0.8%" — [arXiv html](https://arxiv.org/html/2510.14435). Không nêu phí.
- Bài Thái (JSTKU) **[PR – tạp chí nhỏ]**: funding-rate arbitrage Binance Futures 8 tài sản 4 năm, dùng mean-variance để cải thiện Sharpe; ML dự báo funding rate "hard to use profitably because the rates mean-revert" — [ph03.tci-thaijo.org](https://ph03.tci-thaijo.org/index.php/JSTKU/article/view/4724).

**(d) Mean reversion intraday / seasonality**
- Nghiên cứu BTC 5 phút **[nguồn chưa xác định năm]**: autocorrelation bậc 1 âm có ý nghĩa ở khung 1h/2h/4h, biến động lớn hơn → đảo chiều mạnh hơn — [epub.ub.uni-muenchen.de](https://epub.ub.uni-muenchen.de/97651/). Không có kết quả sau phí.
- Padysak & Vojtko (Quantpedia, 2022) **[PRACT]**: BTC có lợi nhuận trên trung bình khung 21:00–23:00 UTC; con số 33%/năm, vol 20.93%, MDD −22.45% chỉ xuất hiện trong mô tả script TradingView, **không kiểm chứng được** với bản gốc — [Quantpedia](https://quantpedia.com/category/uncategorized/page/29/); [TradingView](https://vn.tradingview.com/script/IzFZxayj).

**(e) Bối cảnh 2022**
- arXiv 2508.16378 (2025) **[WP]**: 2022 là drawdown toàn thị trường, "all major assets—BTC, ETH, BNB, ADA, and XRP—enter deep and persistent drawdowns almost simultaneously"; baseline momentum trong bài có MDD 85.92% — [arXiv](https://arxiv.org/pdf/2508.16378).

### Inferences
- **Tham số/holding period có bằng chứng**: trend following daily với lookback 20–360 ngày (ensemble, không một lookback đơn), vol-target ~25%, holding hàng tuần→tháng; cross-sectional momentum lookback 1–4 tuần, rebalance tuần; carry giữ chừng nào funding dương, thoát khi âm. Không có họ nào có bằng chứng bình duyệt ở khung 1–15 phút sau phí.
- **Sống qua 2022?** Trend following: có vol-targeting và trailing stop nên về lý thuyết giảm exposure (Hudson & Urquhart nói TA "reduced exposure to deep drawdowns"), nhưng tôi không lấy được số 2022 riêng của Zarattini et al. Carry: Sharpe BTC 2022 chỉ 0.70, gần như đứng ngoài. Buy-and-hold: −60–70%.
- **Sống qua 2025?** Carry: **âm** (Borri et al.). Trend following: dataset Zarattini kết thúc 3/2025, Sharpe >1.5 tính trên toàn mẫu nên không kết luận riêng 2025 được.
- Sharpe carry 6.45 (Borri) vs 1.80 (He et al. retail) khác nhau chủ yếu do He et al. tính phí theo bậc và chỉ vào lệnh khi lệch giá vượt ngưỡng; con số Borri là không phí. Bot khoe Sharpe 5–6 từ funding arb thường đang bỏ qua phí/slippage.
- Momentum crypto: tính chất "alpha từ short leg + micro-cap" (Fieberg) nghĩa là bot long-only spot altcoin momentum thường không chạm được phần alpha đã được công bố.

### Gaps
- Không lấy được bảng kết quả đầy đủ (MDD, return theo năm, 2022, 2025) của Zarattini–Pagani–Barbon; abarbon.com trả 502, CXO paywall, Concretum Substack chỉ có trích dẫn.
- Không tìm thấy bài Man AHL / AQR chuyên về crypto trend following; chỉ có tài liệu Man AHL về trend following nói chung — [man.com](https://www.man.com/insights/trend-following-generate-alpha) **[PRACT]**.
- Không tìm thấy nghiên cứu bình duyệt nào về mean reversion intraday crypto có tính phí và kiểm data-snooping.
- Không có số win rate/profit factor cho bất kỳ họ chiến lược nào trong các nguồn học thuật.

---

## Câu hỏi 3: Win rate vs expectancy — vì sao chiến lược win rate cao (short-vol, grid, mean reversion không stop) có negative skew?

### Takeaway
Văn liệu bình duyệt về grid/martingale kết luận thẳng: lãi ngắn hạn nhưng "almost surely" phá sản dài hạn (gambler's ruin). Với short-volatility, premium thu được (BVRP ≈ 0.14/năm) là tiền trả cho rủi ro nhảy giá: realized variance BTC chạm ~500% trong 3/2020, BVIX 120% trong 6/2022. Không tìm được nghiên cứu học thuật nào mô hình hoá trực tiếp "win rate → skewness"; mối quan hệ này là số học cơ bản (expectancy = p·W − (1−p)·L), được nêu ở nguồn practitioner.

### Cited Findings
- Taranto & Khan, "Gambler's ruin problem and bi-directional grid constrained trading and investment strategies", *Investment Management and Financial Innovations* 17(3):54–66 (2020) **[PR – tạp chí nhỏ]**: grid strategies "can outperform many other trading algorithms in the short term but will almost surely ruin an investment account in the long term"; Gambler's Ruin dựa trên martingale và được coi là "doomed strategy" — [research.usq.edu.au](https://research.usq.edu.au/item/q5x02/gambler-s-ruin-problem-and-bi-directional-grid-constrained-trading-and-investment-strategies). Bản mở rộng tính xác suất ruin và số bước kỳ vọng tới barrier, cho thấy grid "takes longer to reach ruin than the basic gambler's ruin problem" — [Virtus Interpress](https://www.virtusinterpress.org/Bi-directional-grid-absorption-barrier-constrained-stochastic-processes-with.html). (Tôi chỉ đọc được abstract qua search; fetch bị 405/403.)
- CoinAPI glossary **[PRACT]**: khi giá vượt biên grid "the bot may stop processing transactions. This can leave open positions that might result in losses" — [coinapi.io](https://www.coinapi.io/learn/glossary/grid-trading).
- QuantConnect forum **[PRACT – giai thoại]**: người chạy grid EURUSD live "learned some valuable lessons about warehousing risk (MAE) and negative skew" — [quantconnect.com](https://www.quantconnect.com/forum/discussion/13549).
- Almeida, Grith, Miftachov & Wang, "Risk Premia in the Bitcoin Market", arXiv 2410.15195 (Aug 2025) **[WP]**: Bitcoin variance risk premium (BVRP) ≈ 0.14 annualized (1-month) so với ~2% của S&P 500; BVRP cao hơn ở cụm low-vol (0.17) so với high-vol (0.12) → người bán vol thu nhiều premium nhất đúng lúc thị trường yên; 15/3–8/4/2020 realized variance "approached 500%" khi BTC rơi từ ~$10,000 xuống $5,000 rồi bật lại, BVRP < −2 (bị loại khỏi mẫu); dữ liệu Deribit 7/2017–12/2022 — [arXiv html](https://arxiv.org/html/2410.15195v2). Bài **không** backtest chiến lược short-vol.
- Alexander & Imeraj, "The Bitcoin VIX and its variance risk premium" **[PR]**: smile BTC hàm ý cả jump dương lẫn âm; market maker khó hedge nên "charge a higher premium" — [Sussex](https://sro.sussex.ac.uk/id/eprint/91094/). Một bài khác (Net Buying Pressure…) thấy volatility risk premium BTC "consistently negative, much larger in magnitude than that of S&P 500" — dấu khác nhau do định nghĩa — [arXiv 2109.02776](https://arxiv.org/pdf/2109.02776) **[WP]**.
- Informa Connect **[PRACT]**: BVIN "reached 120% during the June 2022 market crash, while the S&P 500 VIX rose only to 30%" — [informaconnect.com](https://informaconnect.com/what-drives-bitcoin-volatility/).
- Nguồn practitioner về công thức **[PRACT]**: Expectancy = (Win Rate × Avg Win) − (Loss Rate × Avg Loss); breakeven win rate = 1/(1 + reward:risk); ví dụ trader thắng 70% nhưng lỗ $6,000 sau 100 lệnh — [crosstrade.io](https://crosstrade.io/learn/performance-metrics/win-rate-vs-expectancy); [tradezella](https://www.tradezella.com/blog/win-rate); [traderspost](https://blog.traderspost.io/article/trading-strategy-performance-metrics-beyond-win-rate).
- Fernandez-Perez, Frijns, Fuertes & Miffre, *Journal of Banking and Finance* (2018) **[PR, không phải crypto]**: trên commodity futures, long contract skew âm nhất / short skew dương nhất cho excess return sống sót các risk factor — tức thị trường **trả premium cho việc gánh negative skew** — [City Research Online](https://openaccess.city.ac.uk/id/eprint/17843/).

### Inferences
- Số học minh hoạ (tính toán của tôi, không phải trích dẫn): grid/martingale thắng 90% với mỗi lệnh +0.5%, nhưng 10% lệnh còn lại lỗ trung bình −6% (vượt biên, không stop) → expectancy = 0.9×0.5 − 0.1×6 = **−0.15%/lệnh**. Với 85% thắng +0.5% và 15% lỗ −3%: 0.425 − 0.45 = **−0.025%**. Win rate cao đến đâu cũng không cứu được khi tail loss lớn gấp 6–12 lần avg win.
- Short-vol trên BTC: premium ~14%/năm nhưng một sự kiện realized variance 500% (3/2020) hoặc BVIX 120% (6/2022) đủ xoá nhiều năm premium — đúng mô-típ "thu nhặt xu trước xe lu".
- Mean reversion không stop về bản chất là short-vol tổng hợp: lãi nhỏ đều khi giá quay lại, lỗ lớn khi trend kéo dài (chính xác điều xảy ra 2022). Fieberg et al. cũng cho thấy anomaly crypto tập trung trong bull market — bot "thắng 90%" tối ưu trên 2023–2024 (bull) gần như chắc chắn chưa thấy regime như 2022.
- Vì vậy chỉ số đáng tin để đối chiếu bot GitHub là **profit factor, expectancy/lệnh sau phí, skewness của phân phối lệnh, MDD so với lợi nhuận năm**, không phải win rate.

### Gaps
- Không tìm được bài học thuật nào về crypto grid bot với phân phối lệnh/skewness định lượng; Taranto & Khan là lý thuyết trên forex/martingale, chỉ đọc được abstract.
- Không tìm được backtest bình duyệt của chiến lược short straddle/short variance BTC qua 2020 và 2022; Almeida et al. chỉ đo premium.
- Không có nghiên cứu nào nêu "win rate điển hình" của chiến lược crypto có kỳ vọng dương.

---

## Câu hỏi 4: Mức suy giảm out-of-sample điển hình của chiến lược đã công bố (McLean–Pontiff) và áp dụng cho crypto?

### Takeaway
Chuẩn tham chiếu là McLean & Pontiff (JF 2016): lợi nhuận anomaly cổ phiếu giảm **26% out-of-sample** và **58% post-publication**. Chưa có nghiên cứu crypto nào đo trực tiếp decay sau công bố; bằng chứng gần nhất là Fieberg et al. (anomaly crypto "fade over time", tập trung bull market) và nhiều bài TA cho thấy Bitcoin mất dự báo out-of-sample. Nghiên cứu 1,726 chiến lược thương mại (2026) xác nhận backtest marketed chủ yếu phản ánh factor regime trước launch.

### Cited Findings
- McLean & Pontiff, "Does Academic Research Destroy Stock Return Predictability?", *Journal of Finance* 71(1) (2016) **[PR]**: 97 biến dự báo; "Portfolio returns are 26% lower out-of-sample and 58% lower post-publication"; 26% là "upper bound estimate of data mining effects", phần 32% còn lại do nhà đầu tư học từ công bố — [PDF Ivey](https://ivey.uwo.ca/media/3775549/pontiff.pdf); [gwern mirror](https://Www.Gwern.net/doc/economics/2016-mclean.pdf). Bản WP sớm hơn (82 đặc tính) chỉ thấy ~10% decay không ý nghĩa thống kê; bản 95 đặc tính: 25% / 56% — [Bocconi WP](https://finance.unibocconi.eu/sites/default/files/files/media/attachments/The%2520Observation%2520Effect%2520%282%2920130502142550.pdf).
- Jensen/Kelly/Pedersen-style tổng kết trong "Publication Bias in Asset Pricing Research" arXiv 2209.13623 **[WP]**: post-publication returns "50% smaller than in-sample"; giảm ~25% sau 3 năm, 40% sau 5 năm post-sample — [arXiv](https://arxiv.org/pdf/2209.13623).
- Bartram, Djuranovik & Garratt, "Currency Anomalies" **[WP]**: anomaly FX có lãi in- và out-of-sample nhưng "trading profits fell substantially after the underlying research was published", giảm mạnh hơn với anomaly có lợi nhuận in-sample lớn và chi phí arbitrage thấp — [PDF](https://behavioralconfrence.mta.ac.il/_files/ugd/82105e_0008f67390df4a478f15e43e50da388e.pdf).
- Brogaard, Nguyen, Putnins & Zhang, "What Drives Anomaly Decay?" (AEA 2024) **[WP]**: decay xảy ra quanh các bước tăng thanh khoản cấu trúc; anomaly risk-based "often reflect data snooping" — [AEA](https://www.aeaweb.org/conference/2024/program/paper/SNQSBFkB).
- Fieberg, Liedtke & Zaremba (2024) **[PR]**: anomaly crypto "fade over time" và tập trung bull market — [open.icm.edu.pl](https://open.icm.edu.pl/handle/123456789/25544).
- Liu, "Evaluating Structured Strategy Backtests", arXiv 2604.18821 (Apr 2026) **[WP, không phải crypto]**: 1,726 chiến lược thương mại từ 10 tổ chức; "raw pro-forma performance has only limited portability into the live period"; "marketed backtests predominantly reflect the common factor regime present before launch rather than strategy-specific skill"; chiến lược launch sau giai đoạn factor mạnh bất thường "experience materially worse subsequent deterioration"; search snippet nêu decay ~2–3%/năm nhưng abstract không có số — [arXiv](https://arxiv.org/abs/2604.18821).
- Bakker (2017) **[THESIS]**: quy tắc intraday BTC "profitability is highly unstable and declines over time" — [thesis.eur.nl](https://thesis.eur.nl/pub/41546/Bakker.pdf).
- Hudson & Urquhart (2021) **[PR]**: "no predictability for Bitcoin in the out-of-sample period" — [Springer](https://link.springer.com/article/10.1007/s10479-019-03357-1).
- NexusFi **[PRACT – chưa xác minh]**: live ≈ 55–70% backtest cho ES scalping — [nexusfi.com](https://nexusfi.com/a/automation/backtest-to-live-performance-gap).

### Inferences
- Haircut tối thiểu nên áp cho một chiến lược crypto đã công bố hoặc public trên GitHub: **~25–30%** cho data-mining (ngưỡng McLean–Pontiff) và **~50–60%** nếu đã phổ biến rộng (post-publication). Code public trên GitHub với nhiều sao tương đương "post-publication".
- Crypto có thể decay **nhanh hơn** cổ phiếu vì: chi phí arbitrage thấp (Bartram: decay lớn hơn khi arbitrage cost thấp), thanh khoản tăng mạnh 2020→2025 (Brogaard: decay quanh bước tăng thanh khoản), và anomaly tập trung bull market (Fieberg).
- Bot backtest trên 2023–2024 rồi launch 2025 rơi đúng vào "launch after extreme factor run" mà Liu (2026) cảnh báo.

### Gaps
- Không có nghiên cứu crypto nào đo decay sau công bố theo kiểu McLean–Pontiff; con số 26%/58% là từ cổ phiếu Mỹ.
- Không có con số decay backtest→live riêng cho crypto từ nguồn đáng tin.

---

## Câu hỏi 5: Cỡ mẫu tối thiểu và test thống kê để tin một backtest; Sharpe/profit factor thực tế của một bot đáng tin; test nào lật tẩy bot overfit nhanh nhất?

### Takeaway
Bộ công cụ chuẩn: **Probabilistic Sharpe Ratio (PSR)** và **Minimum Track Record Length (MinTRL)** (Bailey & López de Prado 2012), **Deflated Sharpe Ratio (DSR)** hiệu chỉnh theo số lần thử (2014), **Probability of Backtest Overfitting (PBO)** qua combinatorially symmetric cross-validation (2017), và **haircut Sharpe theo multiple testing** (Harvey & Liu 2015). Ví dụ thực: Sharpe ~1.0 với 136 tháng dữ liệu BTC vẫn **chưa đủ** để kết luận Sharpe > 0.75 ở 95% (cần ~184 tháng). Chuẩn thực tế theo văn liệu: Sharpe sau phí **~1–1.5** cho trend following daily, **~1.8–2.5** cho carry có phí retail; bất kỳ bot nào khoe Sharpe > 3 trên khung ngắn hoặc win rate > 80% không kèm MDD/skew đều cần nghi ngờ.

### Cited Findings
- Bailey & López de Prado, "The Sharpe Ratio Efficient Frontier", *Journal of Risk* 15(2) (2012) **[PR]**: PSR = xác suất Sharpe thật > ngưỡng c, chuẩn hoá bằng sai số chuẩn phụ thuộc T, skewness, kurtosis; MinTRL = số quan sát tối thiểu để PSR vượt mức tin cậy; công thức theo lời: [1 − skew·SR + (kurt−1)·SR²/4] × [z_α/(SR − c)]². Ví dụ thực trên chiến lược RSI Bitcoin: 136 quan sát tháng, Sharpe ~1.0 annualized → MinTRL cho ngưỡng 0.75 ở 95% ≈ **184 tháng**, tức cần thêm ~48 tháng — [portfoliooptimizer.io](https://portfoliooptimizer.io/blog/the-probabilistic-sharpe-ratio-bias-adjustment-confidence-intervals-hypothesis-testing-and-minimum-track-record-length/) **[PRACT, trích dẫn bản gốc SSRN 1821643]**.
- Bailey & López de Prado, "The Deflated Sharpe Ratio: Correcting for Selection Bias, Backtest Overfitting and Non-Normality" (2014) **[WP → sau đăng *Journal of Portfolio Management*]**: hiệu chỉnh "two leading sources of performance inflation: Selection bias under multiple testing and non-Normally distributed returns"; "not controlling for the number of trials involved in a particular discovery leads to over-optimistic performance expectations" — [SSRN 2460551](https://papers.ssrn.com/abstract=2460551); DSR tăng khi Sharpe và track record dài hơn, giảm khi kurtosis tăng — [Wikipedia](https://en.wikipedia.org/wiki/Deflated_Sharpe_ratio) **[SEC]**. Hạn chế: giả định các lần thử độc lập; arXiv 2608.23808 (2026) **[WP]** ước "effective number of trials" bằng eigenvalue decorrelation — [arXiv](https://arxiv.org/pdf/2608.23808).
- Bailey, Borwein, López de Prado & Zhu, "The Probability of Backtest Overfitting", *Journal of Computational Finance* 20(4) (2017) **[PR]**: "Standard statistical techniques designed to prevent regression over-fitting, such as hold-out, tend to be unreliable and inaccurate in the context of investment backtests"; đề xuất CSCV để ước PBO; R package `pbo` tính PBO, performance degradation, probability of loss — [SSRN 2326253](https://papers.ssrn.com/abstract=2326253); [risk.net](https://www.risk.net/journal-of-computational-finance/2471206/the-probability-of-backtest-overfitting); [CRAN pbo](https://stat.ethz.ch/CRAN/web/packages/pbo/refman/pbo.html).
- Harvey & Liu, "Backtesting", *Journal of Portfolio Management* (2015) **[PR]**: "A common practice… is to discount the reported Sharpe ratios by 50%" nhưng đó "is only a rule of thumb"; single test t = 2.0 ↔ p = 0.05; với ≥316 factor đã được thử, một t = 3.0 sau hiệu chỉnh chỉ còn tương đương t = 2.0; "The highest Sharpe ratios are only moderately penalized while the marginal Sharpe ratios are heavily penalized" — [Man Institute tóm tắt](https://www.man.com/insights/backtesting) **[PRACT]**; bản gốc [Duke PDF](https://people.duke.edu/~charvey/Research/Published_Papers/P120_Backtesting.PDF) (không parse được text).
- Harvey, Liu & Zhu "…and the Cross-Section of Expected Returns" (RFS 2016) **[PR]** – nền cho ngưỡng t > 3.0: chỉ có gián tiếp qua Man.com ở trên; tôi không fetch bản gốc.
- Rozario et al. (2020) **[WP]**: walk-forward theo năm nhưng tham số tối ưu Y áp cho Y+1 "with no particular regard for parameter robustness" và không phí — ví dụ walk-forward **không** tự động chống overfit — [ar5iv](https://ar5iv.labs.arxiv.org/html/2009.12155).
- Mốc Sharpe/MDD thực tế từ các nguồn trên: trend following daily net of fees Sharpe >1.5 (Zarattini WP), 1.09–1.35 không phí (Rozario WP); carry BTC retail fee Sharpe 1.80, MDD −4.43%, 2022 Sharpe 0.70 (He et al. WP); carry không phí 6.45 → âm 2025 (Borri WP); BTC buy-and-hold Sharpe ~0.8 vs S&P ~0.5 (Almeida WP) — [arXiv 2410.15195](https://arxiv.org/html/2410.15195v2).

### Inferences
- **Mốc tin được cho bot crypto (suy ra từ văn liệu)**: Sharpe sau phí 1–2 trên ≥ 3–5 năm daily (gồm 2022); MDD cùng bậc với vol target (trend following ~20–35%); Sharpe > 3 chỉ xuất hiện ở carry không phí hoặc backtest 36 tháng tự khai (AdaptiveTrend). Profit factor và win rate không có mốc học thuật — nên yêu cầu expectancy/lệnh sau phí và skewness thay vì win rate.
- **Cỡ mẫu**: với Sharpe ~1 cần >15 năm tháng để tách khỏi 0.75 — crypto không có từng ấy; vì vậy hầu hết Sharpe crypto **không đạt ý nghĩa thống kê** ở mức ngưỡng thực dụng, và bất kỳ ai nói "đã chứng minh" là nói quá. Dùng daily/8h bars tăng T nhưng không tăng số regime độc lập.
- **Test lật tẩy nhanh (5 bước, dựa trên công cụ ở trên)**:
  1. Hỏi số lần thử tham số (N trials) → tính DSR; nếu tác giả không biết N hoặc N lớn mà Sharpe tụt dưới ~1 → bỏ.
  2. Chạy lại với phí taker thực + slippage (0.05–0.10%/chiều perp; 0.10–0.50% như Zarattini thử) — chiến lược intraday win-rate cao thường về âm.
  3. Tách riêng 2022 (bear) và 2025 (carry âm): nếu bot không báo cáo được hai năm này hoặc "bỏ qua vì bất thường" → red flag.
  4. PBO/CSCV trên ma trận lợi nhuận các cấu hình: PBO > 0.5 = loại.
  5. Tính skewness phân phối lệnh và tỉ lệ max loss / avg win: nếu >5× và không có stop → đó là short-vol trá hình.

### Gaps
- Không fetch được bản gốc Harvey & Liu (PDF) nên các câu trích là qua Man Institute.
- Không tìm được nguồn trực tiếp về combinatorial purged cross-validation (CPCV) — chỉ có CSCV của cùng nhóm tác giả; CPCV nằm trong sách *Advances in Financial Machine Learning* (2018), không có bản mở để trích.
- Không có nghiên cứu nào đặt mốc "profit factor đáng tin" cho crypto; mốc 1.5–2.0 chỉ xuất hiện ở blog practitioner, không trích dẫn.
- Chưa có nghiên cứu nào áp DSR/PBO cho tập bot GitHub crypto để đo tỉ lệ overfit thực tế.
