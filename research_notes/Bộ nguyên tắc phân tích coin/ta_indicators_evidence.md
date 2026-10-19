# Chỉ báo phân tích kỹ thuật (TA) cho crypto: bằng chứng thực nghiệm và hàm ý cho bộ chấm điểm Coin Radar

Ghi chú nghiên cứu, ngày 2026-10-19. Phạm vi: các quy tắc/chỉ báo TA và bằng chứng về hiệu quả của chúng trên thị trường crypto. Thuật ngữ: "OOS" = out-of-sample (ngoài mẫu, kiểm tra trên dữ liệu không dùng để chọn tham số); "data snooping" = đào dữ liệu (thử quá nhiều quy tắc nên có cái "thắng" do may mắn); "long-short" = mua nhóm mạnh, bán khống nhóm yếu.

Cách phân loại dùng bên dưới:
- **[BẰNG CHỨNG]**: có trong nghiên cứu được bình duyệt (peer-reviewed) hoặc working paper nghiêm túc (NBER/SSRN).
- **[TẬP QUÁN]**: practitioner folklore, tức thông lệ của giới giao dịch, chưa thấy kiểm định nghiêm túc riêng cho crypto.

---

## 1. Quy tắc TA nào có lợi nhuận OOS vững sau phí trong crypto, quy tắc nào thất bại?

### Takeaway
Quy tắc bám xu hướng kiểu moving average (giá so với MA, nhất là MA ngắn khoảng 5–20 ngày) có bằng chứng tốt nhất. Lợi thế chủ yếu là **giảm drawdown và tăng return đã điều chỉnh rủi ro**, không phải lợi nhuận tuyệt đối cao hơn buy-and-hold. Với BTC, khả năng dự báo yếu đi hoặc biến mất trong giai đoạn OOS gần đây. Các nghiên cứu nghiêm túc tìm thấy rất ít bằng chứng ủng hộ RSI/Bollinger theo lối mean reversion (đảo chiều về trung bình), và có kết quả âm.

### Cited Findings
- [BẰNG CHỨNG] Detzel, Liu, Strauss, Zhou & Zhu, "Learning and predictability via technical analysis: Evidence from bitcoin and stocks with hard-to-value fundamentals", *Financial Management* 50(1), 2021, tr. 107–137. Tỷ số giá/MA (price-to-moving-average) dự báo được lợi nhuận ngày của Bitcoin cả trong mẫu lẫn OOS. Chiến lược dựa trên tỷ số này cho alpha và mức tăng Sharpe đáng kể so với buy-and-hold. Mô hình cân bằng giải thích TA xuất hiện từ việc nhà đầu tư học hỏi hợp lý khi tài sản khó định giá cơ bản — [IDEAS/RePEc](https://ideas.repec.org/a/bla/finmgt/v50y2021i1p107-137.html)
- [BẰNG CHỨNG, nguồn thứ cấp] Bản working paper 2018 của Detzel et al. ("Bitcoin: Predictability and Profitability via Technical Analysis") dùng SMA 5/10/20/50/100 ngày. Quy tắc: giữ BTC khi giá > SMA, giữ tiền mặt khi giá < SMA — [CXO Advisory](https://www.cxoadvisory.com/currency-trading/timing-bitcoin-with-smas/). Lưu ý: chưa kiểm chứng số liệu hiệu suất chính xác từ bản công bố.
- [BẰNG CHỨNG] Hudson & Urquhart, "Technical trading and cryptocurrencies", *Annals of Operations Research* 297 (2021; online 2019). Thử gần 15.000 quy tắc thuộc 5 nhóm chính trên Bitcoin và 3 coin khác. Có kiểm soát data snooping bằng FWER (family-wise error rate) và FDR (false discovery rate). Kết quả: có predictability ở mọi nhóm quy tắc, chi phí giao dịch hòa vốn (breakeven) cao hơn nhiều so với phí thực tế, risk-adjusted return cao hơn buy-and-hold. Tuy vậy, **giai đoạn OOS không có predictability cho Bitcoin**, trong khi các coin khác vẫn còn — [Springer DOI 10.1007/s10479-019-03357-1](https://link.springer.com/article/10.1007/s10479-019-03357-1); [Hull repository](https://hull-repository.worktribe.com/output/2328042)
- [BẰNG CHỨNG] Deprez & Frömmel, "Are simple technical trading rules profitable in bitcoin markets?", *International Review of Economics & Finance* 93 (2024), tr. 858–874. Thử 75.360 quy tắc thuộc 6 nhóm, dữ liệu ngày và intraday. Trước hết lọc quy tắc tốt nhất sau phí bằng thủ tục kiểm định đa giả thuyết, rồi gộp thành danh mục để kiểm tra OOS. Kết quả: danh mục quy tắc có thể thắng buy-and-hold OOS, **"chủ yếu về mặt risk-return"** — [IDEAS/RePEc](https://ideas.repec.org/a/eee/reveco/v93y2024ipbp858-874.html)
- [BẰNG CHỨNG] Grobys, Ahmed & Sapkota, "Technical trading rules in the cryptocurrency market", *Finance Research Letters* (2020). Dữ liệu ngày của 11 coin giao dịch nhiều nhất, 2016–2018. Chỉ quy tắc variable moving average (VMA) **20 ngày** thành công: khi loại Bitcoin, excess return là 8,76%/năm sau khi kiểm soát lợi nhuận trung bình của thị trường — [Osuva (U. Vaasa)](https://osuva.uwasa.fi/handle/11111/619)
- [BẰNG CHỨNG, thất bại] Ahmed, Grobys & Sapkota trên 10 privacy coin: VMA chỉ có vẻ có lãi với Dash. Ở mức tổng hợp, quy tắc TA đơn giản **không** tạo lợi nhuận vượt buy-and-hold — [Osuva](https://osuva.uwasa.fi/handle/11111/636)
- [Không rõ đã bình duyệt hay chưa] Một nghiên cứu dữ liệu ngày 2014–2024 trên các coin lớn: chiến lược **Bollinger Bands cho annualized return âm ở mọi coin**. Chiến lược RSI chỉ có lãi khi liên tục tối ưu lại tham số — [kết quả tìm kiếm: um.edu.mt OAR](https://www.um.edu.mt/library/oar/feed/rss_2.0/123456789/137676) *(chưa kiểm chứng toàn văn)*
- [BẰNG CHỨNG, intraday] Shen, Urquhart & Wang, "Bitcoin intraday time-series momentum": lợi nhuận nửa giờ đầu dự báo được nửa giờ cuối của "ngày giao dịch" Bitcoin (định nghĩa ngày theo volume). Hiệu ứng mạnh nhất ở phiên mở có volume hoặc volatility cao, và có lãi đáng kể nhất khi thị trường đi xuống — [Birmingham repository](https://research.birmingham.ac.uk/en/publications/bitcoin-intraday-time-series-momentum/); [bản working paper](https://reading-9.eprints-hosting.org/100181/3/21Sep2021Bitcoin%20Intraday%20Time-Series%20Momentum.R2.pdf)
- [Preprint/thương mại, độ tin cậy thấp hơn] Zarattini, Pagani & Barbon, "Catching Crypto Trends" (2025): ensemble Donchian channel kèm định cỡ vị thế theo volatility (target 20%/năm). Sharpe gộp phí khoảng 1,6 giai đoạn 2018–2025, so với Sharpe gần 0,8 của BTC long-only có volatility targeting. Một abstract khác: danh mục xoay vòng top-20 có Sharpe > 1,5 và alpha 10,8%/năm so với BTC, đã trừ phí — [abarbon.com](https://abarbon.com/papers/catching-crypto-trends) (trang trả về lỗi 502 khi fetch; số liệu lấy từ snippet tìm kiếm)

### Inferences
- Trend filter kiểu "giá > MA" là thành phần có bằng chứng tốt nhất trong bản nháp (Trend 40 điểm). Tuy nhiên, bằng chứng nghiêng về **MA ngắn/trung (5–20, tối đa 50–100 ngày)** trên dữ liệu ngày. Việc xếp thứ tự EMA20/50/200 là tập quán, chưa thấy được kiểm định trực tiếp.
- Lợi thế chính của trend filter là **né drawdown**. Vì vậy hệ thống nên đo hiệu quả bằng Sharpe/max drawdown, không chỉ bằng tỷ lệ thắng.
- BTC mất predictability OOS, còn altcoin vẫn giữ. Nhưng altcoin nhỏ có phí/slippage cao (xem mục 6), nên phần "còn lãi" ở altcoin nhỏ có thể không khai thác được trên thực tế.
- Dùng RSI/Bollinger theo lối mean reversion (mua khi RSI < 30, mua chạm band dưới) có bằng chứng yếu hoặc âm. Không nên cộng điểm "Price position" theo hướng mua gần band dưới trong mode Swing.

### Gaps
- Chưa đọc được toàn văn Hudson & Urquhart để tách kết quả theo từng nhóm (MA, filter, support/resistance, channel breakout, OBV).
- Chưa tìm thấy nghiên cứu bình duyệt nào kiểm định riêng MACD 12/26/9 trên crypto có OOS, phí và hiệu chỉnh data snooping.
- Không lấy được số Sharpe/return cụ thể từ bản công bố của Detzel et al. 2021.
- Snippet tìm kiếm nhắc tới một nghiên cứu năm 2023 (Li, Wang, Wang & Yang) trên BTC/USDT và ETH/USDT. Theo snippet, nghiên cứu này **không tìm thấy** chiến lược kỹ thuật nào có lãi sau khi điều chỉnh data snooping, cả trong mẫu lẫn ngoài mẫu. Chưa xác định được URL/tạp chí, nên chưa dùng làm bằng chứng chính thức.

---

## 2. Momentum hay reversal chiếm ưu thế ở khung ngày/tuần/giờ? Lookback bao nhiêu?

### Takeaway
Với **coin lớn và thanh khoản cao**: momentum chiếm ưu thế ở khung ngày và tuần (lookback 1–4 tuần). Với **coin nhỏ, kém thanh khoản**: reversal (đảo chiều) chiếm ưu thế ở khung ngày/tuần. Momentum dài (8–100 tuần) không có ý nghĩa thống kê. Phần lớn lợi nhuận momentum cross-sectional đến từ vế short, và bị phí giao dịch ăn mòn đáng kể.

### Cited Findings
- [BẰNG CHỨNG] Liu & Tsyvinski, "Risks and Returns of Cryptocurrency", *Review of Financial Studies* 34(6), 2021, tr. 2689–2727. Kết luận: crypto có **time-series momentum mạnh**, và proxy về sự chú ý của nhà đầu tư dự báo được lợi nhuận — [IDEAS/RePEc](https://ideas.repec.org/a/oup/rfinst/v34y2021i6p2689-2727..html)
  - Số liệu từ bản NBER w24877 (8/2018). Dữ liệu BTC 01/01/2011–31/05/2018, XRP từ 08/2013, ETH từ 08/2015 (CoinDesk).
  - Lợi nhuận hôm nay tăng 1 độ lệch chuẩn thì lợi nhuận ngày tiếp theo tăng 0,33%. Mức tăng ở các mốc 1, 3, 5, 6 ngày sau lần lượt là 0,33%, 0,17%, 0,39%, 0,50%.
  - Lợi nhuận tuần tăng 1 độ lệch chuẩn thì lợi nhuận các tuần sau tăng: 3,16% (1 tuần), 3,66% (2 tuần), 3,49% (3 tuần), 1,50% (4 tuần).
  - Chia lợi nhuận tuần thành 5 nhóm (quintile): ở horizon 1 tuần, nhóm cao nhất có lợi nhuận 11,22%/tuần (Sharpe 0,45), nhóm thấp nhất 2,60%/tuần (Sharpe 0,19).
  - Kết quả vẫn đúng khi chỉ dùng dữ liệu từ 2013 và khi kiểm tra OOS (2 năm đầu dùng để đặt ngưỡng). Hiệu ứng ở ETH yếu hơn.
  - Nguồn: [NBER w24877 PDF](https://www.nber.org/system/files/working_papers/w24877/w24877.pdf)
- [BẰNG CHỨNG] Liu, Tsyvinski & Wu, "Common Risk Factors in Cryptocurrency" (NBER w25882, 2019; *Journal of Finance* 2022, DOI 10.1111/jofi.13119). Mẫu 1.707 coin từ đầu 2014 đến cuối 2018, chỉ lấy coin có vốn hóa > 1 triệu USD (109 coin năm 2014, tăng lên 1.583 coin năm 2018). Danh mục value-weighted, rebalance hàng tuần.
  - Chênh lệch long-short giữa quintile cao nhất và thấp nhất: **2,7%/tuần** (momentum 1 tuần), **3,3%** (2 tuần), **4,1%** (3 tuần), **2,5%** (4 tuần).
  - Momentum 8, 16, 50, 100 tuần **không có ý nghĩa thống kê**; ví dụ 16 tuần chỉ đạt 0,4%/tuần.
  - Momentum mạnh hơn hẳn ở coin lớn: nhóm dưới trung vị vốn hóa chỉ đạt 0,6%/tuần (không ý nghĩa), nhóm trên trung vị đạt **4,2%/tuần (có ý nghĩa)**.
  - Mô hình 3 nhân tố (market, size, momentum CMOM xây trên momentum 3 tuần) giải thích được 9 chiến lược long-short thành công. Các con số trên **chưa trừ phí và chưa tính tính khả thi của short**.
  - Nguồn: [NBER w25882 PDF](https://www.nber.org/papers/w25882.pdf); [SSRN](https://papers.ssrn.com/abstract=3379131); thông tin tạp chí theo [SUFE newsletter](https://academicnewsletter.sufe.edu.cn/info/359095)
- [BẰNG CHỨNG] Zaremba, Bilgin, Long, Mercik & Szczygielski, "Up or down? Short-term reversal, momentum, and liquidity effects in cryptocurrency markets", *International Review of Financial Analysis* 78 (2021), 101908. Mẫu hơn 3.600 coin, dữ liệu ngày. Coin có lợi nhuận ngày hôm trước thấp vượt trội coin có lợi nhuận cao, tức **reversal ngày**, chủ yếu do kém thanh khoản. Riêng nhóm coin lớn và dễ giao dịch nhất thì có **momentum ngày** thay vì reversal — [IDEAS/RePEc](https://ideas.repec.org/a/eee/finana/v78y2021ics1057521921002349.html)
- [BẰNG CHỨNG] *Applied Economics Letters* (2020), 200 coin giai đoạn 2015–2019: có reversal ở tần suất rebalance ngày, tuần và tháng. Reversal rõ nhất ở coin vốn hóa nhỏ, kém thanh khoản — [U. Pretoria repository](https://repository.up.ac.za/handle/2263/76329)
- [Working paper] FFA Working Papers 5:003 (2023, Prague University of Economics and Business): reversal tuần chỉ xuất hiện ở coin nhỏ và kém thanh khoản; coin lớn và thanh khoản cao có **momentum tuần** — [VŠE](https://wp.ffu.vse.cz/artkey/wps-202301-0003_impact-of-size-and-volume-on-cryptocurrency-momentum-and-reversal.php)
- [BẰNG CHỨNG] Fieberg, Liedtke & Zaremba, "Cryptocurrency anomalies and economic constraints", *International Review of Financial Analysis* 94 (2024), 103218.
  - Các anomaly về size và volume đến từ micro-cap, ít ý nghĩa kinh tế.
  - Momentum tồn tại ở coin lớn hơn, nhưng **chi phí giao dịch cao và phần lớn alpha nằm ở vế short**.
  - Lợi nhuận bất thường chủ yếu xuất hiện trong bull market và **yếu dần theo thời gian**.
  - Khuyến nghị: tập trung vào vị thế long và tính đủ chi phí.
  - Nguồn: [ICM open repository](https://open.icm.edu.pl/handle/123456789/25544) (toàn văn trả về 403, thông tin lấy từ tóm tắt)
- [BẰNG CHỨNG] Grobys, Kolari, Sandretto, Shahzad & Äijö, "Cryptocurrency momentum has (not) its moments", *Financial Markets and Portfolio Management* (2025). Với coin large-cap và danh mục momentum equal-weighted, momentum crypto có **crash nghiêm trọng**. Chỉ một coin cũng có thể làm lợi nhuận momentum mất ý nghĩa thống kê. Volatility scaling giúp giảm crash. Hiệu ứng tập trung ở coin large-cap — [Springer](https://link.springer.com/article/10.1007/s11408-025-00474-9); [Osuva](https://osuva.uwasa.fi/handle/10024/20018)
- [BẰNG CHỨNG, khung giờ] Momentum intraday của BTC (nửa giờ đầu dự báo nửa giờ cuối) — [Birmingham](https://research.birmingham.ac.uk/en/publications/bitcoin-intraday-time-series-momentum/)

### Inferences
- Coin Radar quét **top 1000** nên trộn hai chế độ ngược nhau. Bằng chứng gợi ý nên **tách tham số theo bậc thanh khoản/vốn hóa**, ví dụ top ~100 so với phần còn lại. Ở coin nhỏ, tín hiệu "breakout/momentum ngắn hạn" (lợi nhuận ngày/tuần vừa qua cao) có xu hướng **đảo chiều**, nên điểm Momentum cao ở coin nhỏ có thể là tín hiệu ngược.
- Lookback có bằng chứng: **1–4 tuần** (khoảng 7–28 ngày) cho momentum. Lookback cho mode Swing (giữ tối đa 10 ngày) khớp với vùng này. Momentum dài (≥ 8 tuần) không có ý nghĩa.
- App chỉ mua (không short), mà Fieberg et al. cho thấy phần lớn alpha momentum nằm ở vế short. Vì vậy kỳ vọng thực tế của tín hiệu long-only phải **thấp hơn nhiều** so với các con số long-short (2,5–4,2%/tuần).
- Mode Short-term (1H/4H): bằng chứng ở khung giờ cho altcoin rất ít. Chỉ có bằng chứng intraday cho BTC.

### Gaps
- Không lấy được t-stat cụ thể của Zaremba et al. 2021 và Fieberg et al. 2024 (toàn văn bị paywall hoặc 403).
- Chưa tìm thấy nghiên cứu bình duyệt về momentum/reversal ở khung 1H–4H cho altcoin.

---

## 3. Volume confirmation, multi-timeframe alignment, volatility regime filter có được bằng chứng ủng hộ không?

### Takeaway
**Volatility scaling/targeting** có bằng chứng khá tốt (giảm crash momentum, tăng Sharpe của trend-following). **Volume confirmation** theo kiểu "volume > MA20 thì cộng điểm" chưa có bằng chứng trực tiếp. Bằng chứng học thuật về volume lại chủ yếu theo chiều ngược: coin volume thấp có lợi nhuận cao hơn, nhưng đó là hiệu ứng micro-cap/thanh khoản. **Multi-timeframe alignment** chưa có nghiên cứu bình duyệt nào trong các nguồn tìm được.

### Cited Findings
- [BẰNG CHỨNG] Volatility management là công cụ hữu ích để giảm crash của momentum crypto — [Grobys et al. 2025, Springer](https://link.springer.com/article/10.1007/s11408-025-00474-9). Bài này cũng ghi nhận tranh cãi ở thị trường cổ phiếu: một nghiên cứu cho thấy volatility management thường làm giảm hiệu suất real-time trên 103 danh mục cổ phiếu — [Osuva](https://osuva.uwasa.fi/handle/10024/20018)
- [Preprint] Danh mục trend-following Donchian có volatility target 20% đạt Sharpe khoảng 1,6 (2018–2025, chưa trừ phí) — [Zarattini, Pagani & Barbon](https://abarbon.com/papers/catching-crypto-trends)
- [BẰNG CHỨNG] Long-short "mua coin volume thấp, bán coin volume cao" đạt khoảng 3,2%/tuần (dollar volume). Tuy nhiên đây là hiệu ứng cross-sectional về mức volume, không phải volume spike xác nhận breakout — [Liu, Tsyvinski & Wu, NBER w25882](https://www.nber.org/papers/w25882.pdf)
- [BẰNG CHỨNG] Anomaly về volume chủ yếu đến từ micro-cap — [Fieberg et al. 2024](https://open.icm.edu.pl/handle/123456789/25544)
- [BẰNG CHỨNG] Momentum intraday của BTC mạnh nhất ở phiên mở có volume/volatility cao. Đây là bằng chứng gián tiếp rằng volume cao làm tăng độ bền của tín hiệu trend ngắn — [Shen, Urquhart & Wang](https://research.birmingham.ac.uk/en/publications/bitcoin-intraday-time-series-momentum/)
- [BẰNG CHỨNG] Lợi nhuận bất thường tập trung trong bull market. Đây là lập luận cho bộ lọc chế độ thị trường (market regime filter), ví dụ BTC trên MA — [Fieberg et al. 2024](https://open.icm.edu.pl/handle/123456789/25544)

### Inferences
- Nên giữ volume ở trọng số thấp (≤ 10–15). Nên đổi từ "volume cao hơn MA20" sang **bộ lọc thanh khoản tối thiểu** (loại coin có dollar volume thấp để giảm slippage); bộ lọc này có cơ sở chắc hơn.
- Nên thêm **market regime filter**: chỉ phát tín hiệu Buy khi BTC hoặc chỉ số thị trường đang trên MA trend. Lý do: anomaly tập trung trong bull market, và trend filter đã được chứng minh trên BTC.
- Multi-timeframe (trend 1D + entry 4H) hiện là tập quán. Có thể giữ, nhưng nên coi là giả thuyết cần backtest.

### Gaps
- Không tìm thấy nghiên cứu bình duyệt nào kiểm định "multi-timeframe confirmation" trong crypto.
- Không tìm thấy nghiên cứu kiểm định "volume spike xác nhận breakout" trong crypto.

---

## 4. Tham số: chuẩn (thông lệ) và có bằng chứng

### Takeaway
Các tham số mặc định (RSI 14, MACD 12/26/9, BB 20/2, EMA 20/50/200, ATR 14) chủ yếu là **thông lệ từ Wilder/Appel/Bollinger**, chưa được tối ưu hay chứng minh cho crypto. Tham số có bằng chứng crypto cụ thể: MA khoảng 20 ngày (Grobys et al.), SMA 5–100 ngày (Detzel et al.), lookback momentum 1–4 tuần (Liu, Tsyvinski & Wu).

### Cited Findings
- [BẰNG CHỨNG] VMA 20 ngày là biến thể duy nhất thành công trong Grobys, Ahmed & Sapkota (2016–2018) — [Osuva](https://osuva.uwasa.fi/handle/11111/619)
- [BẰNG CHỨNG] Detzel et al. dùng SMA 5/10/20/50/100 ngày — [CXO Advisory](https://www.cxoadvisory.com/currency-trading/timing-bitcoin-with-smas/); [RePEc](https://ideas.repec.org/a/bla/finmgt/v50y2021i1p107-137.html)
- [BẰNG CHỨNG] Momentum tối ưu nằm trong cửa sổ 1–4 tuần, đỉnh ở 3 tuần với 4,1%/tuần — [LTW NBER](https://www.nber.org/papers/w25882.pdf)
- [Không rõ bình duyệt] RSI chỉ có lãi khi liên tục tối ưu lại tham số. Đây là dấu hiệu tham số không ổn định — [um.edu.mt OAR](https://www.um.edu.mt/library/oar/feed/rss_2.0/123456789/137676)
- [TẬP QUÁN] RSI 14 với ngưỡng 30/70, MACD 12/26/9, BB 20/2: là tham số mặc định của các tác giả gốc và nền tảng biểu đồ; StockCharts dùng 14 làm mặc định RSI — [StockCharts RSI](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/relative-strength-index-rsi)

### Inferences
- Trong hệ thống bám xu hướng, nên dùng RSI theo kiểu **"RSI > 50 = động lượng tăng"** thay cho 30/70 kiểu mean reversion. Nhất quán với bằng chứng momentum ở mục 2, và nhất quán với việc bằng chứng mean reversion yếu ở coin lớn. Đây là suy luận, chưa có nghiên cứu trực tiếp so sánh hai cách dùng này trên crypto.
- RSI và MACD đều là biến đổi của lợi nhuận quá khứ, nên đo trùng thông tin với Trend (EMA). Cho 25 điểm Momentum + 40 điểm Trend nghĩa là chủ yếu **đếm hai lần cùng một tín hiệu**. Có thể thay bằng một thước đo trực tiếp: lợi nhuận 7–28 ngày, có thể chia cho volatility (risk-adjusted momentum).
- EMA200 trên khung 1D cần 200 ngày dữ liệu. Coin mới niêm yết không tính được, nên cần quy tắc xử lý thiếu dữ liệu.

### Gaps
- Không có nghiên cứu crypto so sánh trực tiếp RSI 30/70 với RSI > 50.
- Không có nghiên cứu crypto chứng minh EMA 20/50/200 tốt hơn các cách chọn độ dài khác.

---

## 5. Entry/exit và định cỡ vị thế (position sizing): ATR stop, R-multiple, trailing stop, time stop, volatility targeting

### Takeaway
Bằng chứng học thuật mạnh nhất là **volatility targeting/scaling**. Các nghiên cứu dùng nó ở cấp danh mục, và nó giảm crash rõ rệt. Stop theo ATR, mốc TP 1,5R/3R và time stop hầu như chưa có kiểm định học thuật riêng cho crypto. Hệ trend-following thành công (Donchian ensemble) dùng **trailing exit**, không dùng take-profit cố định.

### Cited Findings
- [BẰNG CHỨNG] Volatility scaling giảm crash của momentum crypto — [Grobys et al. 2025](https://link.springer.com/article/10.1007/s11408-025-00474-9)
- [Preprint] Danh mục Donchian ensemble có volatility target 20%/năm: Sharpe khoảng 1,6, so với khoảng 0,8 của BTC long-only có volatility target — [Zarattini, Pagani & Barbon](https://abarbon.com/papers/catching-crypto-trends)
- [BẰNG CHỨNG] Lợi thế của quy tắc TA trên BTC chủ yếu là risk-adjusted, nhờ tránh drawdown lớn — [Hudson & Urquhart](https://link.springer.com/article/10.1007/s10479-019-03357-1); [Deprez & Frömmel](https://ideas.repec.org/a/eee/reveco/v93y2024ipbp858-874.html)
- [Định nghĩa] ATR theo Wilder: True Range = max(High − Low, |High − Close trước|, |Low − Close trước|). ATR đầu tiên = trung bình 14 TR. Sau đó ATR = (ATR trước × 13 + TR hiện tại) / 14 — [StockCharts ATR](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/average-true-range-atr-and-average-true-range-percent-atrp)

### Inferences
- Stop = max(support − 0,2·ATR, entry − 1,5·ATR), lấy mức xa hơn, là **tập quán**. Logic hợp lý nhưng chưa có kiểm định. Lưu ý: chọn mức **xa hơn** làm R lớn hơn, nên nếu định cỡ vị thế theo % rủi ro cố định thì vị thế nhỏ đi; điều này là tốt.
- TP cố định 1,5R/3R dễ **cắt mất phần đuôi phải** (các đợt chạy rất dài) vốn là nguồn lợi nhuận chính của trend-following crypto. Nên cân nhắc: TP1 chốt một phần, phần còn lại dùng trailing stop (ATR chandelier hoặc Donchian low), thay vì TP2 cố định. Đây là suy luận từ thiết kế của Zarattini et al., chưa phải kết quả kiểm định so sánh trực tiếp.
- Nên định cỡ vị thế theo volatility, ví dụ rủi ro cố định % vốn chia cho khoảng cách stop (theo ATR). Đây là phần có cơ sở bằng chứng tốt nhất trong mục này.
- Time stop (Swing 10 ngày, Short-term 48 giờ) khớp với horizon momentum 1–4 tuần, nhưng chưa được kiểm định riêng.

### Gaps
- Không tìm thấy nghiên cứu bình duyệt nào so sánh stop theo ATR với stop cố định %, hoặc TP cố định với trailing stop, riêng trên crypto.
- Không tìm thấy bằng chứng về số nhân ATR tối ưu (1,5 so với 2 so với 3) cho crypto.

---

## 6. Sai lầm khi backtest: look-ahead, survivorship bias, overfitting, intrabar ambiguity, phí/slippage coin nhỏ

### Takeaway
Survivorship bias (thiên lệch sống sót) trong crypto **cực lớn với danh mục equal-weighted**, khoảng 62%/năm. Data snooping là rủi ro chính khi thử nhiều quy tắc. Kết quả momentum có thể phụ thuộc vào một coin duy nhất. Phí và chi phí bán khống làm mất phần lớn anomaly ở coin nhỏ.

### Cited Findings
- [BẰNG CHỨNG] Survivorship/delisting bias: mẫu 3.904 coin giai đoạn 2014–2021. Bias ước tính **0,93%/năm (value-weighted)** và **62,19%/năm (equal-weighted)**. Size premium bị phóng đại 50% khi chỉ dùng mẫu coin còn sống. Tác giả và tạp chí lấy từ tóm tắt tìm kiếm (Stöckl, Ammann và cộng sự, U. St. Gallen; *Financial Markets and Portfolio Management*) — [Alexandria U. St. Gallen](https://alexandria.unisg.ch/handle/20.500.14171/108037) *(cần kiểm lại tên tác giả, năm, số tập)*
- [Thứ cấp] Theo dữ liệu CoinGecko, 14.039 trên hơn 24.000 dự án "chết" trong giai đoạn 2014–2023 — [Forklog](https://forklog.com/en/why-the-crypto-market-is-not-immune-to-survivorship-bias/)
- [BẰNG CHỨNG] Data snooping: Hudson & Urquhart dùng FWER/FDR để kiểm soát — [Springer](https://link.springer.com/article/10.1007/s10479-019-03357-1). Deprez & Frömmel dùng thủ tục kiểm định đa giả thuyết rồi kiểm tra OOS — [RePEc](https://ideas.repec.org/a/eee/reveco/v93y2024ipbp858-874.html)
- [Thesis] 3.312 quy tắc intraday trên BTC: nhiều quy tắc có lãi sau điều chỉnh data snooping và phí, nhưng **lợi nhuận rất không ổn định và giảm dần theo thời gian** — [Erasmus thesis](https://thesis.eur.nl/pub/41546/Bakker.pdf)
- [BẰNG CHỨNG] Chỉ một coin cũng có thể làm lợi nhuận momentum mất ý nghĩa — [Grobys et al. 2025](https://link.springer.com/article/10.1007/s11408-025-00474-9)
- [BẰNG CHỨNG] Momentum có chi phí giao dịch cao. Anomaly ở micro-cap không có ý nghĩa kinh tế — [Fieberg et al. 2024](https://open.icm.edu.pl/handle/123456789/25544)
- [BẰNG CHỨNG] Các con số long-short của LTW **chưa trừ phí và chưa tính tính khả thi của short**. Tác giả có thử thay vế short bằng BTC — [NBER w25882](https://www.nber.org/papers/w25882.pdf)
- [Định nghĩa] Chỉ báo dùng Wilder smoothing (RSI, ATR) phụ thuộc vào điểm bắt đầu tính. StockCharts tính lùi ít nhất 250 kỳ để giá trị ổn định — [StockCharts RSI](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/relative-strength-index-rsi); [StockCharts ATR](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/average-true-range-atr-and-average-true-range-percent-atrp)

### Inferences
- Backtest cho Coin Radar bắt buộc phải dùng **danh sách top-1000 tại từng thời điểm** (point-in-time), gồm cả coin đã bị delist. Nếu chỉ dùng danh sách hiện tại, kết quả sẽ phóng đại mạnh, nhất là khi các tín hiệu được đánh trọng số đều nhau.
- Look-ahead: chỉ dùng nến **đã đóng**. Hệ thống quét 15 phút một lần nên có nguy cơ dùng nến 1H/4H/1D chưa đóng. Mức support/resistance phải tính từ dữ liệu đến thời điểm t.
- Intrabar ambiguity (không biết trong cùng một nến thì giá chạm stop hay TP trước): khi cùng một nến chạm cả stop và TP, nên giả định chạm **stop trước** (bảo thủ), hoặc dùng dữ liệu khung nhỏ hơn để phân xử.
- Coin hạng 300–1000 có spread và slippage lớn. Phải mô phỏng phí + slippage theo bậc thanh khoản và đặt ngưỡng volume tối thiểu.
- Warm-up: cần ≥ 250 nến trước điểm đầu tiên dùng RSI/ATR. EMA200 cần nhiều hơn.

### Gaps
- Không tìm được nghiên cứu định lượng slippage theo bậc vốn hóa trên Binance/OKX/Bybit.
- Thông tin tác giả/năm của bài survivorship bias (U. St. Gallen) cần kiểm lại; kết quả tìm kiếm trộn lẫn thông tin.

---

## 7. Công thức chính xác và bảng giá trị tham chiếu (fixture cho unit test)

### Takeaway
Đã xác minh công thức RSI và ATR của Wilder qua StockCharts. Bảng ví dụ của StockCharts chỉ có dạng ảnh/spreadsheet tải về, không có dạng text, nên chưa lấy được giá trị fixture. Công thức MACD, Bollinger và ADX **chưa được xác minh trong phiên này**.

### Cited Findings
- RSI: RS = Average Gain / Average Loss; RSI = 100 − 100/(1 + RS). Average Gain/Loss đầu tiên = tổng gain/loss của 14 kỳ chia 14 (trung bình đơn giản). Từ kỳ sau: AvgGain = (AvgGain trước × 13 + Gain hiện tại)/14, AvgLoss tương tự (loss tính theo giá trị dương). Nếu AvgLoss = 0 thì RSI = 100; nếu AvgGain = 0 thì RSI = 0. Bảng ví dụ nằm trong spreadsheet tải về (chỉ là ảnh trên trang) — [StockCharts RSI](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/relative-strength-index-rsi)
- ATR: công thức TR và Wilder smoothing như ở mục 5. Spreadsheet ví dụ dùng QQQ: TR đầu tiên = 0,91, ATR 14 ngày đầu tiên = 0,56. Công thức smoothing bắt đầu từ ngày 15. Giá trị phụ thuộc điểm bắt đầu và cách làm tròn — [StockCharts ATR](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/average-true-range-atr-and-average-true-range-percent-atrp)

### Inferences
- Unit test nên kiểm (a) các trường hợp biên: AvgLoss = 0 thì RSI = 100; chuỗi giá phẳng; (b) giá trị seed (SMA 14 kỳ đầu) và bước smoothing đầu tiên; (c) đối chiếu với một thư viện tham chiếu độc lập (ví dụ TA-Lib) trên cùng dữ liệu. Không nên so với giá trị hiển thị trên sàn khi chưa có đủ ≥ 250 nến warm-up.

### Gaps
- Chưa tải được spreadsheet ví dụ của StockCharts (RSI, ATR) để lấy cột giá/kết quả làm fixture.
- Các công thức sau là định nghĩa phổ biến (theo trí nhớ), **CHƯA xác minh nguồn trong phiên này**, cần đối chiếu trang StockCharts tương ứng trước khi dùng:
  - MACD = EMA12 − EMA26; Signal = EMA9 của MACD; Histogram = MACD − Signal; hệ số EMA α = 2/(n+1).
  - Bollinger: giữa = SMA20; band = SMA20 ± 2 × độ lệch chuẩn quần thể (population SD) của 20 giá đóng cửa.
  - ADX (Wilder 14): +DM/−DM, smoothing kiểu Wilder, +DI/−DI, DX = 100·|+DI − −DI|/(+DI + −DI), ADX = trung bình Wilder của DX.
- Chưa có nghiên cứu crypto nào về ADX như bộ lọc chế độ xu hướng.
