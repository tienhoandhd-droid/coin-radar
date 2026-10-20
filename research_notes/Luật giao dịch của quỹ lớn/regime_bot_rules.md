# Luật bot theo chế độ thị trường (market regime) trong crypto và bằng chứng hiệu quả

Phạm vi: các bộ luật mà bot và trader hệ thống dùng cho 4 chế độ thị trường: uptrend, sideways (range, đi ngang), downtrend và "hot coin" (bơm/xả mạnh). Hệ thống đích là Binance USDⓈ-M perps (hợp đồng vĩnh cửu), long và short, hai chế độ Swing (1D/4H) và Fast (1H/15m), tài khoản khoảng 10.000 USDT, lỗ tối đa 2% mỗi lệnh (khoảng 200 USDT).

Ghi chú về độ tin cậy: nhiều nguồn dưới đây chỉ đọc được phần abstract (tóm tắt) hoặc trang tổng hợp, chưa đọc toàn văn. Những chỗ đó được ghi rõ. Tài liệu marketing và giai thoại cộng đồng được gắn nhãn **[MARKETING]** hoặc **[GIAI THOẠI]**.

---

## 1. Nhận diện chế độ thị trường (regime detection): cách nào có bằng chứng, độ trễ và tần suất báo sai

### Takeaway
Bộ lọc đơn giản theo giá so với đường trung bình dài (ví dụ BTC so với SMA200, hoặc ensemble Donchian) là cách có bằng chứng tốt nhất trong crypto, nhưng trễ nhiều tuần đến nhiều tháng và whipsaw (tín hiệu đảo chiều giả) nhiều trong thị trường đi ngang. HMM (Hidden Markov Model) phân biệt được bull/bear/calm khi đo trong mẫu, nhưng tôi không tìm thấy backtest giao dịch out-of-sample (ngoài mẫu) nào có số liệu cụ thể cho crypto. ADX, Hurst và Bollinger bandwidth chủ yếu chỉ có bằng chứng từ người làm thực tế hoặc vendor.

### Cited Findings
- **SMA200 trên BTC, độ trễ thực tế:** Theo K33 Research, BTC mất 189 ngày từ lần thủng SMA200 vào tháng 11 đến lần retest (kiểm tra lại) vào tháng 5/2026. Các chu kỳ trước mất 85–132 ngày. SMA200 dốc lên vào 2014, 2018 và 2022 nhưng dốc xuống vào 2026, nên "không phải SMA200 nào cũng giống nhau". — [The Block](https://www.theblock.co/post/401991/not-all-200-day-moving-averages-are-equal-k33-argues-februarys-60k-low-still-marks-cycles-maximum-drawdown)
- BTC đóng cửa dưới SMA200 liên tục 270 ngày tính đến cuối tháng 7/2026. Đây là mô tả, không phải backtest. — [CryptoBriefing](https://cryptobriefing.com/bitcoin-reclaims-200-day-moving-average/)
- BTC từng xuống khoảng −2,88 độ lệch chuẩn dưới SMA200. Martin Leinweber (MarketVector) nói mức này chưa từng xảy ra trong bộ dữ liệu 10 năm của ông. Ý nghĩa: bộ lọc SMA200 có thể giữ trạng thái "bear" rất lâu trong khi giá đã ở vùng cực đoan. — [Cointelegraph](https://cointelegraph.com/markets/bitcoin-beats-ftx-covid-19-crash-record-dive-below-200-day-trend-line)
- **Trend filter dạng crossover:** Paper "A Decade of Evidence of Trend Following Investing in Cryptocurrencies" tối ưu crossover hai đường MA trên BTCUSD, quét cửa sổ 1–1000 giờ, và báo cáo lợi nhuận walk-forward 255%/năm. Paper giả định phí và slippage (trượt giá) không đáng kể, nên kết quả bị thổi phồng. Tôi chỉ đọc được abstract và snippet. — [arXiv 2009.12155](https://arxiv.org/abs/2009.12155)
- **HMM:** Mô hình NHHM (non-homogeneous HMM) 4 trạng thái tách được ba chế độ bull, bear và calm của BTC. Mật độ dự báo theo regime tốt hơn random walk một chế độ. Đây là kết quả dự báo thống kê, không phải P&L giao dịch sau phí. — [Figà-Talamanca et al., NAJEF 2021 qua RePEc](https://econpapers.repec.org/RePEc:eee:ecofin:v:57:y:2021:i:c:s1062940821000577)
- Paper Bayesian HMM (2016–2019, BTC/ETH/LTC/XMR) chỉ nói mô hình "có thể được khai thác để xây chiến lược có lãi" và không đưa ra số lợi nhuận. — [arXiv 2011.03741](https://ar5iv.labs.arxiv.org/html/2011.03741)
- **ADX:** Ngưỡng hay dùng là ADX > 20 thì có trend. ADX > 40 rồi giảm báo hiệu bắt đầu đi ngang. ADX < 20 rồi tăng báo hiệu trend mới hình thành. Đây là quy ước của người làm thực tế, không có nghiên cứu nào được dẫn. — [SmartQuant](https://www.smartquant.com/products/openquant/strategies/strategy_10.htm); [CrossTrade](https://crosstrade.io/learn/trading-strategies/moving-average-crossover) **[MARKETING/giáo trình]**
- Walk-forward của chiến lược chuyển đổi theo regime trên cổ phiếu Ấn Độ cho kết quả lẫn lộn: phần lợi khi tránh được regime xấu phải bù được ma sát của những lần chuyển regime. Đây là nguồn thứ cấp, chưa kiểm chứng. — [EquitiesIndia glossary](https://equitiesindia.com/glossary/market-regime-detection)
- Quỹ trend crypto bị "trừng phạt" vì thị trường giằng co (choppy) năm 2025, sau đó có lãi nhờ đảo sang short đúng lúc trong đợt bán tháo cuối tháng 1/2026. Đây là bằng chứng thực tế về whipsaw. — [Bloomberg 27/02/2026](https://www.bloomberg.com/news/articles/2026-02-27/crypto-trend-following-trade-finds-relief-after-sharp-selloff)

### Inferences
- Với Swing 1D/4H, regime filter cấp danh mục kiểu "BTC close > SMA200 1D (và SMA200 dốc lên)" đơn giản, có lịch sử dài và ít tham số. Cái giá phải trả là vào và ra trễ nhiều tuần. Với Fast 1H/15m, một filter 1D như vậy chỉ nên dùng làm định hướng (bias), không dùng làm trigger.
- Mọi filter dựa trên MA đều báo sai nhiều nhất khi giá dao động sát đường MA, tức đúng lúc thị trường đi ngang. Muốn giảm báo sai thì có thể dùng hysteresis (vùng đệm, ví dụ ±2–3% quanh SMA) hoặc yêu cầu N cây nến xác nhận. Đây là suy luận, chưa thấy nguồn crypto định lượng mức cải thiện.

### Gaps
- Chưa tìm được nghiên cứu crypto nào đo định lượng độ trễ hoặc tỉ lệ flip sai của ADX, Hurst exponent hay Bollinger bandwidth so với SMA200.
- Chưa có backtest HMM out-of-sample sau phí cho BTC.

---

## 2. Bộ luật có sẵn trong các bot phổ biến và kết quả cộng đồng

### Takeaway
Bot mã nguồn mở nổi tiếng nhất (NostalgiaForInfinity trên Freqtrade) là bot long spot 5m có rất nhiều điều kiện, không công bố backtest chính thức trong README. Grid và DCA trên sàn về lý thuyết có kỳ vọng xấp xỉ 0 trước phí. Grid thua khi giá trend ra khỏi khung, còn DCA/martingale thua khi gặp downtrend kéo dài.

### Cited Findings
- **NostalgiaForInfinity (NFI):** timeframe bắt buộc 5m, 6–12 lệnh mở, stake không giới hạn, pairlist 40–80 cặp stablecoin theo volume, blacklist token đòn bẩy. README không nói về regime hay futures/short và không đăng backtest; kết quả backtest nằm rải rác "trong comment của từng commit". — [GitHub iterativv/NostalgiaForInfinity](https://github.com/iterativv/NostalgiaForInfinity)
- Một bài thử nghiệm năm 2023 ghi khuyến nghị tối đa 6 lệnh mở và 40–80 cặp. Khuyến nghị này đã cũ. — [Patreon Dutch Algotrading](https://www.patreon.com/posts/89663923) **[GIAI THOẠI]**
- Freqtrade chỉ đưa protections (cơ chế bảo vệ như StoplossGuard, MaxDrawdown) vào backtest khi bật cờ rõ ràng, nên backtest cộng đồng có thể không tính các cơ chế này. — [Freqtrade docs backtesting](https://codeclimate.com/github/freqtrade/freqtrade/docs/backtesting.md/source)
- **Grid bot, bằng chứng học thuật:** Nếu không có thông tin về xu hướng, kỳ vọng lợi nhuận của grid "về cơ bản bằng 0", và sau phí thì có rủi ro thua lỗ. Biến thể Dynamic Grid (DGT, tự đặt lại lưới theo thị trường) được báo cáo vượt grid truyền thống và buy-and-hold trên BTC/ETH dữ liệu phút, giai đoạn 01/2021–07/2024, về IRR và kiểm soát rủi ro. Abstract không có số cụ thể, chưa phản biện, và là backtest của chính tác giả. — [arXiv 2506.11921](https://arxiv.org/abs/2506.11921)
- **Grid thua trong trend:** Một người dùng có grid SOL bị dừng khi giá rơi dưới khung 84,30 USD, lỗ −23%. — [Binance Square #gridbot](https://www.binance.com/sl/square/hashtag/gridbot) **[GIAI THOẠI]**
- **Futures grid (Pionex):** Chế độ Neutral không mở vị thế ban đầu, đặt lệnh bán giới hạn phía trên và lệnh mua giới hạn phía dưới giá. Chế độ Long/Short mở sẵn một vị thế theo hướng đã chọn. — [Pionex Help](https://intercom.help/pionex/en/articles/14616311-futures-grid-bot)
- Futures grid của Binance (theo bên thứ ba) cho chọn hướng neutral/long/short, cross hoặc isolated margin, đòn bẩy tối đa 20x, và không có SL/TP như grid spot. Thông tin có thể đã cũ, chưa đối chiếu với help center của Binance. — [Gainium](https://gainium.io/bots/binance-bots) **[MARKETING]**
- Gainium khuyên dùng grid hình học (geometric) cho thị trường biến động và grid số học (arithmetic) cho thị trường đi ngang. — [Gainium](https://gainium.io/grid-bot) **[MARKETING]**
- **DCA bot (3Commas-style):** Safety order (lệnh trung bình giá) được đặt ở các mức lệch cố định dưới giá vào và tự khớp khi giá đi ngược. Các script cộng đồng khuyên volume multiplier thấp và đủ safety order "để chịu cả một bear market", giới hạn bot hung hăng ở mức ≤25% danh mục, và cảnh báo DCA "khuếch đại lỗ trong thị trường có trend". — [TradingView 3Commas DCA Backtester](https://www.tradingview.com/script/Txo3OEBa-3Commas-Bot-DCA-Backtester-Signals-FREE/); [TradingView dcabot](https://www.tradingview.com/scripts/dcabot/) **[GIAI THOẠI]**

### Inferences
- Grid và DCA đều là bán quyền chọn ngầm (short volatility, short gamma): lãi nhỏ đều đặn khi giá dao động trong khung, lỗ lớn khi giá thoát khung. Trên perps có đòn bẩy, chiều lỗ còn cộng thêm rủi ro bị thanh lý (liquidation).
- Martingale (gấp thếp) và safety order không tương thích với luật cứng lỗ 2% mỗi lệnh. Nếu vẫn dùng thì tổng rủi ro của cả chuỗi lệnh phải ≤2%, nghĩa là phải có stop cứng dưới safety order cuối.

### Gaps
- Không tìm được báo cáo hiệu suất độc lập và kiểm toán được cho NFI, Jesse, Hummingbot, OctoBot, 3Commas hay Pionex. Mọi con số do vendor hoặc cộng đồng công bố đều phải coi là marketing.
- Chưa có thống kê độc lập về thua lỗ của DCA bot trong các vụ LUNA (5/2022) và FTX (11/2022).
- Không đọc được tài liệu chính thức của Binance về tham số grid/DCA hiện hành.

---

## 3. Uptrend: momentum, breakout hay buy-the-dip?

### Takeaway
Bằng chứng mạnh nhất trong crypto là cho trend following/breakout có ensemble nhiều lookback và position sizing (định cỡ vị thế) theo volatility. Chưa tìm thấy nghiên cứu nào so sánh trực tiếp breakout với buy-the-dip (mua khi giá điều chỉnh trong uptrend).

### Cited Findings
- **Zarattini, Pagani, Barbon, "Catching Crypto Trends" (SFI RP 25-80, 2025):** ensemble nhiều mô hình Donchian channel với lookback khác nhau, gộp thành một tín hiệu, sizing theo volatility. Trên danh mục xoay vòng top 20 coin thanh khoản nhất, kết quả sau phí đạt Sharpe > 1,5 và alpha 10,8%/năm so với BTC. Dữ liệu không có survivorship bias (thiên lệch sống sót), gồm mọi coin từ 2015. — [Concretum Group](https://concretumgroup.com/catching-crypto-trends-a-tactical-approach-for-bitcoin-and-altcoins/); [RePEc](https://ideas.repec.org/p/chf/rpseri/rp2580.html)
- Chiến lược trend intraday BTC khác của Concretum đạt Sharpe khoảng 1,6 trước phí, giai đoạn 2018–2025. Đây là con số gross (chưa trừ phí). — [Concretum](https://concretumgroup.com/seasonality-in-bitcoin-intraday-trend-trading/)
- Borgards (2021): crypto có giai đoạn momentum lớn hơn và dài hơn ở mọi tần suất, được giải thích bằng noise trading (giao dịch nhiễu). — [EconPapers](https://econpapers.repec.org/RePEc:eee:ecofin:v:57:y:2021:i:c:s1062940821000590)
- Ngược lại, momentum cắt ngang (cross-sectional, winner trừ loser) trên 143 coin giai đoạn 2014–2018 có lợi nhuận gần 0 và không có ý nghĩa thống kê. — [Brunel BURA](https://bura.brunel.ac.uk/handle/2438/20686) (snippet tìm kiếm)

### Inferences
- Với Swing 1D/4H: breakout kiểu Donchian/ATR, ensemble nhiều lookback (ví dụ 20/55/100 ngày) và sizing theo ATR sao cho khoảng cách stop tương ứng ≤2% vốn là cấu hình có bằng chứng tốt nhất. Buy-the-dip trong uptrend (pullback về EMA20/50 khi BTC > SMA200) hợp lý về logic nhưng thiếu bằng chứng định lượng độc lập.
- Ở 1H/15m, mục 4 cho thấy return bị đảo dấu (autocorrelation âm) ở 1–4 giờ. Vì vậy breakout trên 15m/1H dễ gặp false breakout (phá vỡ giả). Mua pullback (fade ngắn hạn theo hướng trend lớn) có thể phù hợp hơn ở khung này. Đây là suy luận, chưa có backtest.

### Gaps
- Không có nghiên cứu crypto so sánh trực tiếp breakout, pullback và momentum cross-sectional trên perps sau funding.

---

## 4. Range (đi ngang): mean reversion có hoạt động sau phí không, ở khung nào?

### Takeaway
Có bằng chứng thống kê về autocorrelation (tự tương quan) âm ở khung 1–4 giờ của BTC, và hiệu ứng đảo chiều (reversal) cắt ngang ở coin nhỏ. Tuy nhiên bằng chứng lợi nhuận sau phí của RSI/Bollinger fade hay grid lại yếu hoặc âm.

### Cited Findings
- De Nicola, "On the Intraday Behavior of Bitcoin": autocorrelation bậc 1 âm, có ý nghĩa thống kê bất thường ở khung 1, 2 và 4 giờ. Biến động càng lớn thì đảo chiều càng mạnh, được giải thích bằng overreaction (phản ứng thái quá), volatility dư thừa và thanh lý đòn bẩy. Tôi chỉ đọc được snippet; trang gốc lỗi chứng chỉ SSL nên không mở được. — [Ledger (Pitt)](https://ledger.pitt.edu/ojs/ledger/article/view/213)
- Ngược lại, momentum intraday của BTC (nửa giờ đầu dự báo nửa giờ cuối) do cơ chế cung cấp thanh khoản tạo ra (Financial Review 2022). — [Univ. Birmingham](https://research.birmingham.ac.uk/en/publications/bitcoin-intraday-time-series-momentum/)
- Hiệu ứng reversal trên 200 coin giai đoạn 2015–2019 có ý nghĩa ở chu kỳ tái cân bằng ngày, tuần và tháng, mạnh nhất ở coin nhỏ và kém thanh khoản (nơi phí và slippage cao nhất). — [CESifo WP / kết quả tìm kiếm](https://epub.ub.uni-muenchen.de/97148)
- Grid không có thông tin trend có kỳ vọng xấp xỉ 0, sau phí thì âm. — [arXiv 2506.11921](https://arxiv.org/abs/2506.11921)

### Inferences
- Mean reversion trong crypto, nếu có, nằm ở khung giờ (1H–4H), trùng với chế độ Fast. Lãi trên mỗi lệnh nhỏ nên rất nhạy với phí. Phí taker và maker trên Binance USDⓈ-M cần được trừ đầy đủ trong backtest; ưu tiên lệnh limit (maker).
- Fade ở range chỉ nên bật khi filter regime báo "không trend" (ví dụ ADX thấp hoặc giá nằm trong band quanh SMA). Phải có stop cứng ngoài biên range, vì lần thoát khung là nơi grid và mean reversion mất hết lãi.

### Gaps
- Không tìm được backtest RSI/Bollinger mean reversion sau phí trên Binance perps có kiểm định out-of-sample.

---

## 5. Downtrend: short theo trend hay đứng ngoài (flat)?

### Takeaway
Bằng chứng định lượng trực tiếp rất ít. Các nguồn có được nghiêng về long-biased hoặc bất đối xứng: phần short nhỏ hơn hoặc đứng ngoài. Lý do gồm drift (xu hướng tăng dài hạn) dương của crypto, các cú squeeze (ép short) và whipsaw. Funding đóng vai trò nhỏ hơn biến động giá.

### Cited Findings
- Nghiên cứu nổi bật nhất về crypto trend (Zarattini et al.) là chiến lược xoay vòng dạng tactical/long, không phải long-short. Snippet cho thấy alpha đến từ việc đứng ngoài trong downtrend. — [Concretum](https://concretumgroup.com/catching-crypto-trends-a-tactical-approach-for-bitcoin-and-altcoins/)
- "AdaptiveTrend" phân bổ bất đối xứng 70/30 long/short, Calmar 3,18 giai đoạn 2022–2024, gần như đi ngang (flat) trong bear market khi buy-and-hold mất 60–70%. Đây là tóm tắt thứ cấp trên Substack, tôi chưa kiểm chứng paper gốc. — [Substack Quantitativo note](https://substack.com/@quantitativo/note/c-216039933)
- Bloomberg (02/2026): một quỹ trend crypto có lãi nhờ đảo sang short đúng lúc trong đợt bán tháo cuối tháng 1/2026, sau một năm 2025 bị thị trường giằng co gây lỗ. Shorting có thể hoạt động trong các pha giảm mạnh, nhưng whipsaw tốn kém. — [Bloomberg](https://www.bloomberg.com/news/articles/2026-02-27/crypto-trend-following-trade-finds-relief-after-sharp-selloff)
- **Funding:** Với chiến lược perps, chênh lệch giá hội tụ là phần chính của lợi nhuận; funding chỉ đóng vai trò nhỏ và giảm dần theo thời gian. — [arXiv 2212.06888 "Fundamentals of Perpetual Futures"](https://arxiv.org/pdf/2212.06888)
- Funding dương thì long trả cho short, funding âm thì short trả cho long. 0,01% mỗi 8 giờ tương đương khoảng 11%/năm. — [Spark glossary](https://www.spark.money/glossary/funding-rate)
- Phản ứng sau cú sốc giảm thường là overreaction rồi đảo chiều. BTC sau cực trị âm có tần suất đảo chiều trên 50% ở nhiều ngưỡng. Đây là lý do short sau cú giảm mạnh dễ bị kẹp. — [IJFMR 2026](https://www.ijfmr.com/papers/2026/4/86388.pdf); [JAE 2022 qua DOAJ](https://doaj.org/article/889af1e55ca44d83bcb079580903b1b0)

### Inferences
- Với tài khoản 10k và giới hạn 2%: "flat hoặc short nhỏ, chọn lọc" (chỉ short khi BTC < SMA200 *và* SMA200 dốc xuống, vào lệnh khi giá hồi lên kháng cự, không short ngay sau một cây nến sập) phù hợp với bằng chứng hơn short đối xứng. Funding âm sâu là dấu hiệu short đã đông, nguy cơ squeeze cao.
- Phân bổ bất đối xứng (rủi ro short ≤ một nửa rủi ro long) là cách thỏa hiệp. Bằng chứng mới ở mức thứ cấp.

### Gaps
- Không tìm được nghiên cứu nào so sánh trực tiếp và có kiểm định giữa "flat trong bear" và "short trend" trên crypto perps sau phí và funding.
- Chưa có số liệu về tần suất hoặc mức lỗ của short squeeze trên Binance perps.

---

## 6. Hot coin bơm/xả mạnh: tiếp diễn (momentum) hay đảo chiều?

### Takeaway
Bằng chứng tách đôi theo khung thời gian và loại sự kiện. Pump-and-dump có tổ chức (P&D) đảo chiều trong vài phút đến một giờ. Pump khi lên sàn (listing) phần lớn đi kèm dump sau đó. Ngược lại, hiệu ứng MAX trong crypto có dấu *dương*: coin có ngày tăng cực đại trong tháng trước thường tăng tiếp tuần sau, trái với cổ phiếu. Kết luận: không đuổi theo pump trong phút hoặc giờ đầu, nhưng momentum nhiều ngày ở coin đủ thanh khoản có bằng chứng ủng hộ.

### Cited Findings
- **P&D (Li, Shin, Wang, JFQA 2025):** giá đạt đỉnh trong vài phút. Theo bản nháp, giá bắt đầu đảo chiều khoảng 70 giây sau khi pump bắt đầu và phần lớn tác động mất hết sau 1 giờ. Trước pump có run-up (tăng sớm) khoảng 5% từ 5 phút trước, kèm volume bất thường, cho thấy của cải chuyển từ người ngoài sang người trong cuộc. P&D làm giảm thanh khoản và giá về lâu dài. — [Cambridge JFQA](https://www.cambridge.org/core/journals/journal-of-financial-and-quantitative-analysis/article/abs/cryptocurrency-pumpanddump-schemes/97149DCD519BAF838F269F98DC76D682); [CLS Blue Sky](https://clsbluesky.law.columbia.edu/2019/01/07/cryptocurrency-pump-and-dump-schemes/)
- 149 vụ pump phối hợp qua Telegram trên Binance tập trung ở coin vốn hóa < 50 triệu USD. — [IEEE 8955594](https://ieeexplore.ieee.org/abstract/document/8955594)
- Bộ dữ liệu 104 vụ P&D trên Binance do 12 nhóm tổ chức. — [arXiv 2005.06610](https://arxiv.org/pdf/2005.06610)
- **Listing pump:** Theo nghiên cứu ngành của CryptoNinjas/Storible (389 token niêm yết năm 2024 trên 6 sàn), token lên Binance tăng trung bình 87% khi niêm yết, và 89% token niêm yết trên CEX giảm sau đó, mức giảm trung bình 52%. Tiêu đề bài viết ghi "98%" cho Binance, mâu thuẫn với con số 89%. Nghiên cứu chưa qua phản biện. — [BitPinas](https://bitpinas.com/cryptocurrency/binance-token-listing-dump/)
- **Hiệu ứng MAX dương trong crypto:** Özdamar, Akdeniz, Şensoy (2021, *Financial Innovation*) cho thấy chênh lệch lợi nhuận tuần thô giữa decile MAX cao nhất và thấp nhất là 3,03%, vẫn đứng vững sau khi kiểm soát short-term reversal. — [Financial Innovation](https://jfin-swufe.springeropen.com/articles/10.1186/s40854-021-00291-9/tables/8); [Bilkent repo](https://repository.bilkent.edu.tr/items/78167f5c-d3e2-4f07-b4bc-5e8a3ed0b2c0)
- Li, Urquhart, Wang, Zhang đặt tên hiện tượng là "MAX momentum": coin có MAX cao thì lợi nhuận tương lai cao hơn, nhưng hiệu ứng thay đổi theo điều kiện thị trường và tâm lý. — [Univ. Birmingham](https://research.birmingham.ac.uk/en/publications/max-momentum-in-cryptocurrency-markets/)
- **Overreaction:** Trên BTC/LTC/XRP/DASH, chiến lược đánh ngược sau overreaction *không* có lãi. Chiến lược đi theo quán tính (inertia) có vẻ có lãi nhưng không khác ngẫu nhiên về mặt thống kê. — [Emerald JES](https://emerald.com/insight/content/doi/10.1108/JES-09-2018-0310)
- Overreaction ở crypto cho kết quả giao dịch tốt hơn cổ phiếu Mỹ, và dự báo tốt hơn đôi chút với overreaction dương. — [Fairfield faculty pubs](https://digitalcommons.fairfield.edu/business-facultypubs/246)
- Sau cú sốc giảm theo giờ, BTC có overreaction rõ (giá thường hồi lại). — [DOAJ JAE 2022](https://doaj.org/article/889af1e55ca44d83bcb079580903b1b0)

### Inferences
- Luật thực dụng rút ra cho bot:
  1. Không vào lệnh trong 1 giờ đầu của một cú spike volume/giá đột ngột ở coin nhỏ (đó là cửa sổ đảo chiều của P&D).
  2. Chỉ chơi momentum nhiều ngày với coin có thanh khoản perps đủ sâu, vào lệnh ở lần pullback đầu tiên có stop dưới đáy pullback, khối lượng cắt theo khoảng cách stop để lỗ ≤ 200 USDT.
  3. Short-the-blowoff (short ở đỉnh cú bơm cuối) chỉ nên làm sau khi có cấu trúc đảo chiều rõ (lower high), vì MAX momentum dương và rủi ro squeeze lớn.
- Trên coin perps vốn hóa nhỏ, slippage của stop-market có thể vượt xa 2% dự kiến trong các cú nến 20–50%. Khối lượng vị thế cần thêm hệ số an toàn hoặc giới hạn theo thanh khoản sổ lệnh.

### Gaps
- Không tìm được số liệu định lượng về slippage hoặc thanh lý của Binance perps trong các pha pump. Chưa có nghiên cứu về "chờ pullback đầu tiên" so với "vào breakout ngay".
- Paper Grobys & Junttila về MAX trong crypto: tôi chưa xác minh được kết quả. — [UWasa news](https://www.uwasa.fi/en/newshub/news/new-study-detects-lottery-behavior-cryptocurrency-markets)

---

## 7. Đổi bộ luật theo regime có thắng một bộ luật robust duy nhất ngoài mẫu không?

### Takeaway
Không tìm thấy bằng chứng crypto out-of-sample cho thấy nhiều bộ luật chuyển đổi theo regime thắng một hệ trend đơn giản và robust. Kết quả mạnh nhất (Zarattini et al.) dùng *một* hệ trend ensemble, trong đó "regime filter" được ngầm hiểu là chính tín hiệu trend. Việc chuyển regime tạo thêm tham số và ma sát.

### Cited Findings
- Một hệ ensemble Donchian duy nhất, không chuyển đổi chiến lược, đạt Sharpe > 1,5 sau phí trên dữ liệu không survivorship bias. — [Concretum](https://concretumgroup.com/catching-crypto-trends-a-tactical-approach-for-bitcoin-and-altcoins/)
- Walk-forward của chiến lược chuyển đổi theo regime cho kết quả lẫn lộn, vì phần lợi phải bù ma sát chuyển regime. Nguồn thứ cấp. — [EquitiesIndia](https://equitiesindia.com/glossary/market-regime-detection)
- Cảnh báo overfitting: khóa giai đoạn out-of-sample từ trước, giới hạn số vòng tối ưu, kiểm tra theo từng năm và từng thị trường. — [WisdomTrading](https://wisdomtrading.com/insights/ai-overfitting-trading-systems/) **[MARKETING]**
- Script SuperTrend có lọc theo regime phải chỉnh ATR length và factor riêng cho từng tài sản và khung thời gian thì mới có backtest dương. Đây là dấu hiệu curve-fitting (khớp quá mức vào dữ liệu quá khứ). — [TradingView SuperTrend V4](https://de.tradingview.com/script/9IpnB035-SuperTrend-Strategy-V4-Filtered-Directional)
- Grid truyền thống có kỳ vọng xấp xỉ 0, và chỉ biến thể "biết trend" mới có lãi trong backtest. Như vậy giá trị nằm ở thông tin trend, không nằm ở bản thân grid. — [arXiv 2506.11921](https://arxiv.org/abs/2506.11921)

### Inferences
- Thiết kế ít rủi ro overfit nhất cho Coin Radar:
  - Một trục regime duy nhất cấp BTC 1D (SMA200 cộng độ dốc, có hysteresis), dùng để *bật/tắt hoặc chỉnh khối lượng* long/short.
  - Một hệ trend/breakout robust cho Swing.
  - Mean reversion chỉ là module phụ ở Fast, bật khi regime "range".
  - Không tối ưu riêng tham số cho từng regime.
- Mỗi tham số thêm vào phải qua walk-forward và kiểm tra theo từng năm (2018, 2021, 2022, 2025 là các năm stress hoặc choppy).

### Gaps
- Không tìm được nghiên cứu crypto nào so sánh "regime-switching nhiều chiến lược" với "một chiến lược" trên cùng dữ liệu out-of-sample sau phí.
- Không tìm được tài liệu Robot Wealth hoặc Quantpedia cụ thể về chủ đề này (các lượt tìm không trả về kết quả liên quan).
