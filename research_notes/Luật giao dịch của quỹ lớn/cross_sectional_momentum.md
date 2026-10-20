# Cross-sectional momentum và factor strategy trong crypto (ghi chú nghiên cứu, 2026-10-20)

Ghi chú: "cross-sectional momentum" (động lượng chéo/tương đối) = xếp hạng các coin với nhau theo lợi suất quá khứ, long nhóm mạnh và short nhóm yếu. Khác với "time-series momentum" (động lượng theo chuỗi thời gian), là xét từng coin so với chính quá khứ của nó.
Mọi con số dưới đây là **TRƯỚC phí (gross)** trừ khi ghi rõ "net/sau phí".

## 1. Cách xây chiến lược long/short xếp hạng (universe, signal, lookback, holding, số coin, weighting, neutrality, rebalance)

### Takeaway
Thiết kế chuẩn trong học thuật: universe gồm toàn bộ coin có vốn hóa trên 1 triệu USD (hàng trăm tới ~2.000 coin). Coin được xếp theo lợi suất 1–4 tuần, chia quintile (5 nhóm) hoặc nhóm 30/40/30. Portfolio dùng value-weight, rebalance hằng tuần và long nhóm top, short nhóm bottom. Không bài nào trong số đã đọc dùng beta-neutral đúng nghĩa: các factor là "zero-investment" (vốn 0, đô-la trung tính), không trung tính beta với BTC.

### Cited Findings
- Liu, Tsyvinski & Wu, bản NBER WP: 1.707 coin từ 2014 đến 2018, chỉ lấy coin có vốn hóa ≥ 1 triệu USD. Số coin đạt lọc tăng từ 109 (2014) lên 1.583 (2018). Lợi suất tuần được tính từ giá close ngày, và các biến không phải lợi suất bị winsorize ở 1%/99% mỗi tuần — [NBER w25882](https://www.nber.org/papers/w25882.pdf)
- LTW chia coin thành quintile theo từng đặc tính, dùng value-weight, rebalance hằng tuần. Factor CMOM dùng **momentum 3 tuần**: mỗi tuần chia nhóm bottom 30% / middle 40% / top 30%, value-weight, CMOM = top − bottom. Factor CSMB (size) dùng cách chia tương tự theo vốn hóa — [NBER w25882](https://www.nber.org/papers/w25882.pdf)
- Bài này dùng mô hình 3 factor (thị trường crypto CMKT, size CSMB, momentum CMOM). Mô hình này giải thích được các chiến lược long-short có ý nghĩa thống kê. Bản đăng Journal of Finance 2022 (tr. 1133–1177) nói "10 đặc tính" tạo được chiến lược long-short thành công, còn bản NBER nói "9" — [SSRN 3379131](https://papers.ssrn.com/abstract=3379131); [Alpha Architect](https://alphaarchitect.com/factors-investing-in-cryptocurrency/)
- Dobrynskaya dùng khung J/K chuẩn (J = số tuần dùng để xếp hạng, K = số tuần nắm giữ), J từ 1 đến 104 tuần và K từ 1 đến 12 tuần, trên khoảng 2.000 coin có vốn hóa > 1 triệu USD giai đoạn 2014–2020. Mỗi chân portfolio có trung bình 600 coin (chiến lược 1/1) đến 200 coin (104/1) — [Dobrynskaya, HSE WP](https://conference.hse.ru/files/download_file_ex?hash=FAE0AB2DC7A67656E89A0B1CB27D8C7D&id=3B5EE9A5-0B18-458A-9458-B4ED0F6C6664)
- Một thiết kế thực hành của Starkiller Capital chỉ dùng spot, không dùng perp. Universe: coin niêm yết trên ≥ 3 sàn, có volume trung bình ≥ 5 triệu USD trong một nửa số ngày của 30 ngày gần nhất. Lookback 30 ngày (đã thử 5–150 ngày), giữ 7 ngày, rebalance thứ Năm lúc 00:00 UTC. Chỉ long nhóm quintile top; họ **không dựng chân short** vì không mô hình hóa được chi phí vay/funding một cách tin cậy — [Starkiller Capital](https://www.starkiller.capital/post/cross-sectional-momentum-in-cryptocurrency-markets)
- Arefev (SSRN 2026) làm bản replication trên perp: 832 symbol Binance USDⓈ-M đã lưu trữ (có xử lý survivorship, tức thiên lệch do chỉ còn coin "sống sót"), giai đoạn 2020–2026, panel close ngày. Hai cấu hình được chốt trước khi chạy là J=1/K=1 và J=2/K=2 — [SSRN 7404139](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7404139)

### Inferences
- Với universe top-150 perp Binance, một bản tương đương gần nhất với tài liệu là: xếp hạng theo lợi suất 1–3 tuần, long/short mỗi bên khoảng 20–30% (30–45 coin), rebalance hằng tuần. Cấu hình này chưa được chứng minh là có lãi sau phí (xem mục 3).
- Tài liệu dùng value-weight. Trên perp, weight theo vốn hóa sẽ dồn vào BTC/ETH. Weight theo nghịch đảo volatility hoặc equal-weight có giới hạn thanh khoản là lựa chọn thực tế hơn, nhưng tôi không tìm thấy nghiên cứu so sánh trực tiếp hai cách này trên perp.

### Gaps
- Không tìm được bài học thuật nào dựng portfolio **beta-neutral với BTC** (chỉnh tỷ trọng long/short theo beta) và báo cáo kết quả riêng.
- Không có số liệu công khai của quỹ (fund letter) về số coin long/short thực tế họ dùng.

## 2. Factor nào có bằng chứng: momentum, short-term reversal, size, volume, liquidity, BTC beta

### Takeaway
Bằng chứng mạnh nhất (2014–2020, gross) là: momentum 1–4 tuần, size (coin nhỏ thắng), volume thấp thắng, và reversal (đảo chiều) ở chân trời dài hơn 1 tháng. Phần lớn size/volume/reversal ngày nằm ở coin micro-cap kém thanh khoản. Momentum mạnh hơn ở coin lớn. Về beta: beta thị trường thông thường không được định giá, còn downside beta (beta khi thị trường giảm) thì có.

### Cited Findings
- **Momentum (LTW, 2014–2018, gross, mỗi tuần):** chênh lệch quintile top − bottom là 1 tuần 2,7%, 2 tuần 3,3%, 3 tuần 4,1% (có ý nghĩa ở mức 1%), 4 tuần 2,5%. Momentum 8, 16, 50 và 100 tuần **không** có ý nghĩa thống kê; riêng momentum 16 tuần chỉ đạt 0,4%/tuần — [NBER w25882](https://www.nber.org/papers/w25882.pdf)
- **Momentum mạnh ở coin lớn:** nhóm coin có vốn hóa dưới trung vị chỉ đạt 0,6%/tuần (không có ý nghĩa thống kê), còn nhóm trên trung vị đạt 4,2%/tuần (có ý nghĩa). Factor loading của momentum "thoáng qua" (transient) hơn của size — [NBER w25882](https://www.nber.org/papers/w25882.pdf)
- **Size:** long coin nhỏ nhất, short coin lớn nhất được 3,4%/tuần (xếp theo vốn hóa), 3,9% (theo giá cuối tuần), 4,1% (theo giá cao nhất tuần). **Volume:** chênh lệch dollar volume −3,2%/tuần (coin volume thấp thắng). **Volatility:** khoảng 3%/tuần. Chính tác giả viết rằng các chiến lược này "không tính chi phí giao dịch" — [NBER w25882](https://www.nber.org/papers/w25882.pdf)
- **Fieberg, Liedtke & Zaremba (IRFA 2024, "Cryptocurrency anomalies and economic constraints"):** anomaly size và volume đến từ coin micro-cap, ít ý nghĩa kinh tế. Momentum tồn tại ở coin lớn nhưng **đắt để giao dịch**, và **lợi nhuận chủ yếu đến từ chân short**. Phần lớn lợi suất bất thường xảy ra trong thị trường tăng (bull) và **phai dần theo thời gian**. Tác giả khuyến nghị tập trung vào chân long, tính đủ chi phí và đặt trọng số cao hơn cho hiệu suất gần đây — [IRFA 2024, doi 10.1016/j.irfa.2024.103218, bản ghi tại open.icm.edu.pl](https://open.icm.edu.pl/handle/123456789/25544)
- **Factor momentum (Fieberg, Liedtke, Metko & Zaremba, Quantitative Finance 2023):** dữ liệu hơn 3.900 coin, 2014–2022, 34 anomaly. Factor thắng gần đây tiếp tục thắng factor thua. Hiệu ứng bền qua các giai đoạn con và bắt nguồn từ momentum giá — [Quant. Finance 23(12), bản ghi](https://open.icm.edu.pl/handle/123456789/25542)
- **Dobrynskaya (2014–2020):** có momentum dương ở chân trời ngắn tới 2–4 tuần, và reversal có ý nghĩa ở chân trời dài hơn. Reversal được dẫn dắt bởi các coin "thua trong quá khứ" — [Dobrynskaya](https://conference.hse.ru/files/download_file_ex?hash=FAE0AB2DC7A67656E89A0B1CB27D8C7D&id=3B5EE9A5-0B18-458A-9458-B4ED0F6C6664)
- **Downside beta / BTC beta:** chỉ khi xếp theo downside beta mới có lợi suất tăng đơn điệu theo nhóm. Phần bù rủi ro (premium) của beta thị trường thông thường không có ý nghĩa thống kê khi đã đưa downside risk vào mô hình — [Dobrynskaya qua CAIA](https://caia.org/node/5973). Một bài HSE khác (900+ coin, 2014–2018) thấy mô hình gồm downside market factor + SMB + WML giải thích hơn một nửa lợi suất chéo — [HSE WP](https://wp.hse.ru/data/2020/09/16/1583081932/79FE2020.pdf)
- **Low-risk anomaly:** để khai thác anomaly rủi ro thấp trong crypto, cần đòn bẩy vay ít nhất 50% vốn, và mức lỗ tiềm năng tới −84% vốn. Thêm vào đó là spread bid-ask rộng và thiếu broker hỗ trợ đủ coin — [phys.org tóm tắt nghiên cứu 2023](https://phys.org/news/2023-11-crypto-high-doesnt-equal-reward.html)
- **MAX effect (coin có ngày tăng cực đại):** các bằng chứng **trái chiều nhau**. Ozdamar, Akdeniz & Sensoy (2021) thấy MAX tháng trước dự báo lợi suất **dương** (spread 3,03%/tuần raw, 1,99% sau điều chỉnh rủi ro). Yadav (2025, dữ liệu intraday, top-100 coin) thấy +1 độ lệch chuẩn MAX tương ứng lợi suất sau đó **giảm** 0,043% — [tổng hợp IDEAS/Emerald](https://ideas.repec.org/a/eme/sefpps/sef-07-2024-0461.html); [TEDU](https://avesis.tedu.edu.tr/yayin/51d709f0-af97-4cc7-a4e5-ee93a1a86794/lottery-like-preferences-and-the-max-effect-in-the-cryptocurrency-market)

### Inferences
- Trong universe top-150 perp, size/volume/illiquidity gần như không khai thác được, vì các anomaly này nằm ở micro-cap. Factor có triển vọng nhất về lý thuyết là momentum ngắn hạn ở coin lớn, nhưng nó đắt để giao dịch.

### Gaps
- Bản Journal of Finance 2022 có sample kéo dài hơn (tôi đoán đến 2020). Tôi chỉ đọc được bản NBER (2014–2018) nên các con số trên lấy theo bản NBER.
- Không có số liệu cụ thể (spread %/tuần) cho factor liquidity/Amihud trên perp.

## 3. Chân trời nào hiệu quả? Rebalance ngày/tuần hay intraday? Có reversal ở 1H–1D không?

### Takeaway
Ở tần suất tuần: momentum mạnh nhất ở J=2/K=2 (khoảng 70%/năm, gross). J=1/K=1 thì dương nhưng không có ý nghĩa thống kê. Từ khoảng 4–6 tuần trở đi chuyển sang reversal. Ở tần suất ngày: reversal ngày hôm sau tồn tại trên toàn thị trường, nhưng gắn với illiquidity; coin lớn lại có momentum ngày. Ở tần suất intraday: không tìm thấy bằng chứng cross-sectional đáng tin. Trên perp, một bài thử nghiệm ở horizon 8 giờ thất bại hoàn toàn sau phí.

### Cited Findings
- J/1 (giữ 1 tuần): lookback 1–4 tuần cho lợi suất dương, chiến lược 1/1 cao nhất khoảng 40%/năm nhưng **tất cả không có ý nghĩa thống kê**. Lookback trên 4 tuần cho lợi suất âm, có ý nghĩa từ 11–13 tuần trở đi — [Dobrynskaya](https://conference.hse.ru/files/download_file_ex?hash=FAE0AB2DC7A67656E89A0B1CB27D8C7D&id=3B5EE9A5-0B18-458A-9458-B4ED0F6C6664)
- Momentum cao nhất và có ý nghĩa là chiến lược **2/2 (khoảng 70%/năm)**. Các chiến lược 1/2 và 1/4 cũng dương có ý nghĩa, nên "giữ 2 tuần có vẻ tối ưu". Reversal có ý nghĩa ở chân trời trên 4–6 tuần. Xếp theo lợi suất 1–2 tuần rồi giữ 10–12 tuần cho reversal tới −1.200%/năm, giống quá trình bong bóng hình thành rồi vỡ. Tác giả cũng ghi nhận momentum "kém ý nghĩa hơn trong những năm gần đây" — [Dobrynskaya](https://conference.hse.ru/files/download_file_ex?hash=FAE0AB2DC7A67656E89A0B1CB27D8C7D&id=3B5EE9A5-0B18-458A-9458-B4ED0F6C6664)
- **Reversal ngày (Zaremba et al., IRFA 2021):** dữ liệu ngày của hơn 3.600 coin. Coin có lợi suất ngày trước thấp vượt trội coin có lợi suất ngày trước cao. Hiệu ứng này do illiquidity gây ra; **coin lớn, dễ giao dịch nhất lại có momentum ngày** — [Zaremba et al. 2021](https://earsiv.medeniyet.edu.tr/items/23a96c9f-3952-4bdf-aec5-abafb3aaab70/full); [IDEAS](https://ideas.repec.org/a/eee/finana/v78y2021ics1057521921002349.html)
- Kozlowski et al. (2021) ghi nhận reversal ngày hôm sau trên 200 coin. Shen et al. (2020, equal-weight, 1.700 coin) thấy reversal tuần không có ý nghĩa thống kê (các kết quả này được Dobrynskaya trích dẫn lại) — [Dobrynskaya](https://conference.hse.ru/files/download_file_ex?hash=FAE0AB2DC7A67656E89A0B1CB27D8C7D&id=3B5EE9A5-0B18-458A-9458-B4ED0F6C6664)
- Một nghiên cứu trên hơn 3.100 coin báo cáo "cross-sectional momentum mạnh với lợi suất từ 1 ngày đến 2 tuần" — [arXiv 1904.00890, Momentum and liquidity in cryptocurrencies](https://arxiv.org/pdf/1904.00890)
- Intraday: Wen, Bouri, Xu & Zhao (2022, NAJEF) thấy có cả momentum lẫn reversal intraday, nhưng **chỉ trên BTC** (dữ liệu giờ, 2013–2020), tức là time-series chứ không phải cross-sectional — [SSRN 4080253](https://papers.ssrn.com/sol3/Delivery.cfm/SSRN_ID4135239_code2537556.pdf?abstractid=4080253&mirid=1)
- Perp, horizon 8 giờ: thử 10 perp Binance USDT-M từ 7/2022 đến 4/2026 với tín hiệu OHLCV và funding. Kết luận bác bỏ giả thuyết có alpha cross-sectional khai thác được. Mô hình tốt nhất (gradient-boosted ranker) có IC (information coefficient, hệ số tương quan giữa dự báo và lợi suất thực) hơi dương nhưng **net Sharpe = −2,91** — [SSRN 6701738, Fayez Junior](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6701738)

### Inferences
- Bằng chứng không ủng hộ cross-sectional momentum ở khung 1H–1D. Reversal ngày có tồn tại nhưng nằm ở coin kém thanh khoản, đúng nơi mà phí và trượt giá lớn nhất. Với top-150 perp, kỳ vọng hợp lý là momentum ngày yếu ở coin lớn, và reversal ở coin nhỏ hơn trong universe.

### Gaps
- Không tìm thấy nghiên cứu cross-sectional dùng dữ liệu giờ trên nhiều coin perp.

## 4. Độ lớn hiệu ứng sau phí, và riêng trên perp; chi phí short trên perp khác gì

### Takeaway
Các con số học thuật 2–4%/tuần đều là gross, trên spot, phần lớn trước 2021. Hai bản replication trên Binance perp giai đoạn 2020–2026 cho kết quả net **không khác 0** (chiến lược tuần) hoặc **âm nặng** (chiến lược 8 giờ). Trên perp, short không cần vay coin. Chi phí short thay bằng funding, mà funding thường dương, nên short thường **được nhận** funding. Đổi lại, short coin đang bị đám đông short sẽ phải trả funding âm.

### Cited Findings
- Arefev (SSRN 2026, Binance USDⓈ-M, 2020–2026): spread **gross của J=1/K=1 là +0,573%/tuần**, xấp xỉ mức phí giả định 0,40 điểm %/tuần, nên **net không phân biệt được với 0** dưới cả 3 kiểm định. Net của J=2/K=2 đổi dấu tùy vào ngày bắt đầu rebalance (rebalancing phase) — [SSRN 7404139](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7404139) (đây là working paper một tác giả, chưa qua bình duyệt; tôi chỉ đọc được qua snippet tìm kiếm vì SSRN chặn truy cập 403)
- So sánh: LTW (2014–2018) đạt 2,7%/tuần gross cho momentum 1 tuần ([NBER](https://www.nber.org/papers/w25882.pdf)), trong khi Arefev trên perp 2020–2026 chỉ đạt 0,573%/tuần gross. Hiệu ứng gross đã giảm khoảng 5 lần (đây là phép so sánh của tôi, hai nghiên cứu khác universe).
- Han, Kang & Ryu: khi tính phí giao dịch và biến động giá trong ngày, nhiều portfolio momentum **bị thanh lý** (liquidated), và nhiều portfolio có lợi suất có ý nghĩa thống kê trở thành không có ý nghĩa. Bằng chứng cho time-series momentum mạnh, còn cho cross-sectional momentum **yếu** — [ACFR/AUT PDF](https://acfr.aut.ac.nz/__data/assets/pdf_file/0009/918729/Time_Series_and_Cross_Sectional_Momentum_in_the_Cryptocurrency_Market_with_IA.pdf); [ResearchGate](https://www.researchgate.net/publication/377457967_Time-Series_and_Cross-Sectional_Momentum_in_the_Cryptocurrency_Market_A_Comprehensive_Analysis_under_Realistic_Assumptions)
- Starkiller (spot, chỉ long, 2018-04 đến 2022-11, **phí = 0**): quintile top đạt 37,8%/năm trên toàn mẫu so với 28,7% của BTC; in-sample 69,17%; **out-of-sample −2,35%** (BTC −37,82%). Quintile bottom đạt −33,8%/năm. Với phí trung bình 50 bp, lợi suất năm giảm khoảng 30 điểm % (in-sample) và khoảng 12 điểm % (OOS); ở mức 125 bp, chiến lược thua BTC — [Starkiller Capital](https://www.starkiller.capital/post/cross-sectional-momentum-in-cryptocurrency-markets)
- Gbadebo (2026, 8 coin lớn, 2020–10/2025): time-series momentum đạt 31,96%/năm và tốt hơn cross-sectional momentum xét theo rủi ro điều chỉnh. Cross-sectional có max drawdown (mức sụt giảm tối đa) 55,0%, và lợi nhuận thấp hơn một phần do tương quan cao giữa các coin. Không rõ bài có tính phí hay không — [journals.vu.lt](https://www.journals.vu.lt/BATP/en/article/view/44540)
- Một backtest cá nhân trên GitHub (không qua bình duyệt), phí 20 bp mỗi chiều: alpha momentum trong giai đoạn train mất ý nghĩa ở 2023–2024 và 2025–2026 — [GitHub README](https://raw.githubusercontent.com/prams2104/crypto-momentum-backtest/main/README.md)
- **Cơ chế funding:** funding thường trả mỗi 8 giờ; long trả cho short khi giá perp cao hơn giá spot, và ngược lại — [AFA, Fundamentals of Perpetual Futures](https://afajof.org/management/viewp.php?n=186844); [arXiv 2212.06888](https://arxiv.org/pdf/2212.06888). Theo nguồn thứ cấp (script TradingView, không phải tài liệu chính thức của Binance): funding Binance = premium index + clamp(interest − premium, ±0,05%), với interest 0,01%/8h (0,03%/ngày). Vì vậy khi thị trường trung tính, short mặc định **nhận** khoảng 0,03%/ngày — [TradingView script](https://www.tradingview.com/script/BKa9AHJx-Binance-Funding-Rates-vichtoreb) (cần đối chiếu với FAQ chính thức của Binance)
- Robot Wealth (Binance perp): xếp perp hằng ngày theo funding 24h vào 20 nhóm. Funding dự báo mạnh funding ngày hôm sau, và cũng dự báo lợi suất giá nhưng nhiễu hơn. Quan hệ **đảo chiều ở các nhóm cực trị** — [Robot Wealth / Edge Alchemy](https://edgealchemy.robotwealth.com/p/hyperliquid-carry-looks-trendy)

### Inferences
- Coin "yếu nhất" thường bị short đông, nên funding của chúng hay âm. Vì vậy chân short của chiến lược momentum trên perp có thể phải trả funding. Điều này làm xấu thêm phần lợi nhuận mà Fieberg et al. 2024 nói là "chủ yếu đến từ chân short". Đây là suy luận của tôi; tôi chưa tìm thấy số đo trực tiếp.
- Với phí taker Binance cộng trượt giá ở top-150, phí rebalance hằng tuần khoảng 0,4%/tuần (giả định của Arefev) có lẽ còn lạc quan với các coin xếp hạng 100–150.

### Gaps
- Không đọc được toàn văn Arefev và Fayez Junior (SSRN trả 403), nên không có Sharpe gross/net chi tiết của Arefev.
- Không có số đo funding trung bình riêng của chân short trong chiến lược momentum.

## 5. Bộ lọc relative strength (RS) coin-vs-BTC có giúp lệnh directional một coin không?

### Takeaway
Tôi không tìm thấy nghiên cứu nào kiểm định trực tiếp "RS z-score vs BTC" làm bộ lọc cho lệnh một coin. Bằng chứng gián tiếp: RS 1–4 tuần có giá trị dự báo yếu, đã suy giảm, và chỉ đáng kể ở coin lớn. RS ngắn (1 ngày) ở coin nhỏ có xu hướng đảo chiều.

### Cited Findings
- Momentum chỉ có ý nghĩa ở nhóm coin trên trung vị vốn hóa (4,2%/tuần, so với 0,6% không có ý nghĩa ở nhóm dưới) — [NBER w25882](https://www.nber.org/papers/w25882.pdf)
- Reversal ngày ở coin kém thanh khoản, momentum ngày ở coin lớn — [Zaremba et al. 2021](https://earsiv.medeniyet.edu.tr/items/23a96c9f-3952-4bdf-aec5-abafb3aaab70/full)
- Momentum 1/1 tuần không có ý nghĩa thống kê do volatility cao; 2/2 thì có — [Dobrynskaya](https://conference.hse.ru/files/download_file_ex?hash=FAE0AB2DC7A67656E89A0B1CB27D8C7D&id=3B5EE9A5-0B18-458A-9458-B4ED0F6C6664)

### Inferences
- Nếu RS z-score dùng cửa sổ ngắn (giờ hoặc ngày), tài liệu gợi ý nó có thể bắt trúng phần "đảo chiều" hơn là "tiếp diễn", nhất là ở coin xếp hạng thấp trong top-150. Nếu dùng cửa sổ 1–3 tuần thì nó khớp với vùng momentum, nhưng hiệu ứng sau 2020 rất nhỏ.

### Gaps
- Không có nghiên cứu nào đo RS-vs-BTC làm bộ lọc cho lệnh time-series trên một coin.

## 6. Tương quan/beta với BTC có dự báo gì không? Có tài liệu về vào lệnh muộn / xu hướng kéo dài / quá đà (overextension) phù hợp với phát hiện "BTC và coin cùng xu hướng thì kết quả XẤU hơn"?

### Takeaway
Có bằng chứng phù hợp với phát hiện của hệ thống. (a) Momentum crypto chuyển sang reversal rất nhanh, sau khoảng 2–4 tuần. Xếp theo lợi suất gần nhất rồi giữ lâu cho reversal mạnh nhất. (b) Lợi nhuận momentum tập trung trong thị trường tăng và chiến lược thua lỗ khi thị trường tăng mạnh. (c) Downside beta mới là thứ được định giá, beta thông thường thì không.

### Cited Findings
- Momentum và reversal "không phải phần bù cho rủi ro". Chiến lược momentum (và reversal) có xu hướng **thua lỗ khi lợi suất thị trường crypto cao** — [Dobrynskaya](https://conference.hse.ru/files/download_file_ex?hash=FAE0AB2DC7A67656E89A0B1CB27D8C7D&id=3B5EE9A5-0B18-458A-9458-B4ED0F6C6664)
- Xếp theo lợi suất 1–2 tuần gần nhất: giữ 1–2 tuần thì momentum lớn nhất, giữ 10–12 tuần thì reversal lớn nhất, giống mẫu "bong bóng rồi vỡ". Reversal do các coin thua trong quá khứ dẫn dắt — [Dobrynskaya](https://conference.hse.ru/files/download_file_ex?hash=FAE0AB2DC7A67656E89A0B1CB27D8C7D&id=3B5EE9A5-0B18-458A-9458-B4ED0F6C6664)
- Anomaly chủ yếu xuất hiện trong bull market và phai dần theo thời gian — [Fieberg, Liedtke & Zaremba 2024](https://open.icm.edu.pl/handle/123456789/25544)
- Lợi nhuận cross-sectional momentum bị kéo giảm một phần vì tương quan cao giữa các coin — [Gbadebo 2026](https://www.journals.vu.lt/BATP/en/article/view/44540)
- Trong cổ phiếu, hiện tượng kém hiệu quả sau ngày tăng cực đại (high-MAX) được giải thích là do **overreaction** (phản ứng thái quá) chứ không phải do tâm lý thích "xổ số" — [Gorman et al., Critical Finance Review](https://cfr.ivo-welch.info/published/papers/gorman2021could.pdf). Trong crypto, chiều của hiệu ứng tùy horizon: intraday thì âm (Yadav 2025), tuần thì dương (Ozdamar et al. 2021) — [IDEAS](https://ideas.repec.org/a/eme/sefpps/sef-07-2024-0461.html)
- Robot Wealth: funding cực trị (dấu hiệu đám đông đã vào cùng một phía) làm quan hệ dự báo đảo chiều — [Robot Wealth](https://edgealchemy.robotwealth.com/p/hyperliquid-carry-looks-trendy)

### Inferences
- Điều kiện "BTC và coin cùng xu hướng" thường chỉ thỏa mãn khi cả thị trường đã chạy một đoạn. Lúc đó lệnh vào muộn, rơi vào vùng chân trời mà momentum đang chuyển sang reversal, cộng thêm rủi ro đám đông (funding cao). Điều này nhất quán với các phát hiện ở trên, nhưng chưa có nghiên cứu nào kiểm định đúng bộ lọc này.

### Gaps
- Không có nghiên cứu trực tiếp nào về việc "lọc theo hướng xu hướng của BTC" cho lệnh altcoin.

## 7. Bằng chứng về suy giảm (decay) và crowding sau 2022

### Takeaway
Bằng chứng nhất quán là suy giảm. Momentum đã yếu đi từ cuối giai đoạn 2014–2020. Trên perp Binance 2020–2026, net bằng khoảng 0. Một backtest out-of-sample sau 2021 cho kết quả âm. Bằng chứng crowding trực tiếp (dòng vốn quỹ) thì chưa tìm thấy.

### Cited Findings
- "Momentum đã kém ý nghĩa hơn trong những năm gần đây" (mẫu tới 2020) — [Dobrynskaya](https://conference.hse.ru/files/download_file_ex?hash=FAE0AB2DC7A67656E89A0B1CB27D8C7D&id=3B5EE9A5-0B18-458A-9458-B4ED0F6C6664)
- Anomaly phai dần theo thời gian — [Fieberg et al. 2024](https://open.icm.edu.pl/handle/123456789/25544)
- Perp 2020–2026: net không khác 0 — [Arefev SSRN 7404139](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7404139). Perp 7/2022–4/2026, horizon 8 giờ: net Sharpe −2,91 — [SSRN 6701738](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6701738)
- Starkiller: out-of-sample 3/2021–11/2022 đạt −2,35%/năm khi phí = 0, so với 69% in-sample — [Starkiller](https://www.starkiller.capital/post/cross-sectional-momentum-in-cryptocurrency-markets)
- Ngược chiều: factor momentum (momentum giữa các factor với nhau) bền qua các giai đoạn con 2014–2022 — [Fieberg et al. 2023, QF](https://open.icm.edu.pl/handle/123456789/25542)

### Inferences
- Không nên kỳ vọng cross-sectional momentum thuần trên top-150 perp có lãi sau phí. Nếu dùng, nên coi nó là yếu tố phụ (tilt) hoặc bộ lọc thay vì nguồn alpha chính.

### Gaps
- Không tìm thấy báo cáo của Kaiko, Amberdata, Glassnode hay fund letter có số liệu về crowding của chiến lược momentum crypto.
- Không đọc được toàn văn các bài SSRN 2026 (lỗi 403), nên số liệu của chúng lấy từ abstract/snippet.
