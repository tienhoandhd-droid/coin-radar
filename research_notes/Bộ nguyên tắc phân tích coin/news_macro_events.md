# Tin tức, vĩ mô và sự kiện crypto: tác động lên giá và cách đưa vào máy quét (Coin Radar)

> Ghi chú nghiên cứu, ngày 2026-10-19. Mỗi dữ kiện đều kèm nguồn. **Mức độ bằng chứng**: [HỌC THUẬT] = bài báo khoa học / working paper của ngân hàng trung ương; [NGÀNH] = báo cáo của công ty trong ngành (không qua bình duyệt); [GIAI THOẠI] = tin tức, blog, số liệu chưa kiểm chứng.
> Thử endpoint ngày 2026-10-19 bằng `curl` từ **máy cục bộ của người dùng (không phải server ở Mỹ / GitHub Actions)**. Kết quả HTTP ghi bên dưới là kết quả thật, nhưng **chưa kiểm chứng** khả năng truy cập từ runner GitHub Actions đặt tại Mỹ.

## 1. Vĩ mô: FOMC, CPI, NFP, lợi suất, DXY, thanh khoản

### Takeaway
Bằng chứng đáng tin nhất cho thấy tác động của vĩ mô là **nhanh và tập trung** (trong khoảng 30–60 phút sau công bố), **thay đổi theo chế độ thị trường** (lớn trong đợt lạm phát 2021–23, gần như bằng 0 khi lạm phát thấp), và chủ yếu thể hiện qua **biến động (volatility) tăng** chứ không phải hướng giá dự đoán được trước. Riêng tác động của "thanh khoản / M2" thì chỉ có bằng chứng từ blog, và tương quan trên lợi nhuận hằng ngày là yếu.

### Cited Findings
- [HỌC THUẬT] Working paper của Fed (Kroner, FEDS 2025-022), nghiên cứu sự kiện trong ngày (intraday event study) với cửa sổ 60 phút, dữ liệu BTC/USD giai đoạn 2014–2023: một cú bất ngờ CPI cao hơn dự báo 1 độ lệch chuẩn (1 SD) làm **BTC giảm −114,25 bp (≈ −1,14%) trong 60 phút ở giai đoạn lạm phát cao** (sai số chuẩn 40,41, có ý nghĩa ở mức 1%), so với **−3,87 bp (không có ý nghĩa) ở giai đoạn lạm phát thấp**. Giả thuyết hai hệ số bằng nhau bị bác bỏ với p = 0,01. Để so sánh, S&P 500 giảm −66 bp và EUR giảm −31 bp. Tác giả giải thích bằng **sự chú ý của nhà đầu tư (investor attention)**: thị trường phản ứng mạnh với loại tin đang được chú ý, và có xu hướng **phản ứng quá mức (overreact)** khi mức chú ý cao. Phản ứng với các loại tin vĩ mô khác "gần như không đổi". — [Kroner 2025, FEDS 2025-022](https://www.federalreserve.gov/econres/feds/files/2025022pap.pdf)
- [NGÀNH] Block Scholes (cập nhật tháng 9/2026), dữ liệu CPI từ 2020: trên toàn mẫu, bất ngờ CPI giải thích **25% lợi nhuận giờ đầu tiên** của BTC (R²). Hệ số β ≈ **−5,5% cho mỗi 1 điểm phần trăm (pp) bất ngờ**, tức ≈ −0,55% cho 0,1pp. Theo cửa sổ trượt 24 lần công bố, đỉnh là **R² 52% và β −13%/pp** (12/2021–11/2023). Độ lệch chuẩn trung bình của bất ngờ CPI là 0,16pp, nên một bất ngờ tăng điển hình tương ứng khoảng −1,3%. Từ cuối 2024 đến 2025, β và R² **sụp về gần 0**. Đến 6/2026: β −3,2%/pp, R² ≈ 22%. Theo cửa sổ 12 lần công bố, R² năm 2026 lên gần 80%, nhưng **chỉ ở khung 1 giờ; khung 4–24 giờ không có thay đổi tương tự**. — [Block Scholes](https://www.blockscholes.com/institutional-research/is-bitcoin-showing-greater-sensitivity-to-us-cpi-releases-again)
- [NGÀNH] Cùng nguồn trên, về NFP (bảng lương phi nông nghiệp): bất ngờ +100 nghìn việc làm ứng với **−0,16% trong 1 giờ**, R² 9% trên toàn mẫu. R² đạt đỉnh 59–60% vào 6/2024 (nguồn tự ghi hai con số khác nhau) và **gần bằng 0 ở mọi khung thời gian trong năm 2026**. — [Block Scholes](https://www.blockscholes.com/institutional-research/is-bitcoin-showing-greater-sensitivity-to-us-cpi-releases-again)
- [HỌC THUẬT] Dữ liệu 5 phút quanh các thông cáo FOMC (1/2018–12/2022): biến động của tài sản số **tăng ngay lúc công bố và kéo dài tới khoảng 1 giờ**, rõ nhất ở thời điểm công bố và 30 phút sau đó (lúc họp báo). — [Monetary Policy, Digital Assets, and DeFi Activity (arXiv 2302.10252)](https://arxiv.org/pdf/2302.10252)
- [HỌC THUẬT] Nghiên cứu sự kiện quanh các lần công bố FOMC và CPI của Mỹ: độ nhạy của Bitcoin với tin chính sách tiền tệ và lạm phát **tăng sau năm 2020**, phản ứng cùng chiều với cổ phiếu nhưng mạnh hơn, và không giải thích được bằng vai trò "phòng ngừa lạm phát". — [Monetary policy and Bitcoin, J. Int'l Money & Finance (ScienceDirect)](https://www.sciencedirect.com/science/article/abs/pii/S0261560623000815) (chỉ đọc được phần tóm tắt qua kết quả tìm kiếm)
- [HỌC THUẬT, kết quả âm tính] Một số luận văn **không tìm thấy** tác động có ý nghĩa: thông báo nới lỏng không ảnh hưởng lợi nhuận BTC trong cửa sổ [−10 phút, +45 phút] ([luận văn Lund](https://lup.lub.lu.se/student-papers/record/9066201)). FOMC trong chu kỳ thắt chặt 1/2022–4/2023 cũng không có ý nghĩa thống kê với giá BTC ([luận văn ISEG](https://www.iseg.ulisboa.pt/estudar/trabalhos-finais-de-mestrado/fi/1692298719004092)). Một luận văn năm 2026 nhận xét rằng "rất ít nghiên cứu học thuật đo có hệ thống phản ứng của BTC với các thông báo vĩ mô theo lịch" ([luận văn KSE 2026](https://kse.ua/wp-content/uploads/2026/05/illia-nazaruk_268722_assignsubmission_file_nazaruk_final_thesis.pdf)).
- [HỌC THUẬT, giai đoạn cũ] Tin tích cực về thất nghiệp và đơn hàng hàng lâu bền làm giảm lợi nhuận BTC, ngược chiều với cổ phiếu. Tin GDP và CPI không có ý nghĩa thống kê (mẫu trước giai đoạn lạm phát cao). — [The impact of macroeconomic news on Bitcoin returns](https://www.researchgate.net/publication/339812376_The_impact_of_macroeconomic_news_on_Bitcoin_returns)
- [GIAI THOẠI, thời kỳ có ETF] Từ khi ETF giao ngay ra đời (1/2024), phần lớn các kỳ FOMC trùng với **dòng tiền rút khỏi ETF (outflow) hoặc dòng vào nhỏ** (theo dữ liệu CoinGlass), và open interest của hợp đồng tương lai thường giảm trước FOMC. Ngoại lệ là tháng 1/2025. — [Cointelegraph](https://cointelegraph.com/markets/bitcoin-price-volatility-ramps-up-around-fomc-days-will-this-time-be-different)
- [GIAI THOẠI] Ví dụ một lần công bố CPI: ngày 14/10/2026, CPI tổng thể 3,7% so với dự báo 3,6%, BTC giảm xuống khoảng 80.200 USD; một bài khác ghi BTC giảm 3,5% sau một kỳ CPI "nóng". — [CoinMarketCap](https://coinmarketcap.com/top-stories/6ad051a531381a2cec79afae/), [KuCoin flash](https://www.kucoin.com/news/flash/u-s-september-cpi-surpasses-expectations-bitcoin-drops-below-82-000)
- [GIAI THOẠI / blog] M2 toàn cầu và DXY (chỉ số sức mạnh đồng USD): tương quan theo **mức giá** trông rất mạnh (BTC với M2 ≈ 0,78; BTC với DXY ≈ −0,58), nhưng trên **lợi nhuận hằng ngày** thì yếu. Tương quan tốt nhất chỉ là **0,16 khi M2 đi trước 42 ngày** và **−0,20 khi DXY đi trước 33 ngày**. Tương quan theo mức giá bị thổi phồng do hai chuỗi cùng có xu hướng. — [FX Macro Edge](https://fxmacroedge.substack.com/p/close-but-no-cigar). Các nguồn khác nêu độ trễ "khoảng 10 tuần", "56–60 ngày" hoặc "2–6 tháng" mà không dẫn nghiên cứu cụ thể. — [LookIntoBitcoin](https://www.lookintobitcoin.com/bitcoin-research/the-global-liquidity-influence-on-bitcoin/), [Bitcoin Magazine](https://bitcoinmagazine.com/markets/global-liquidity-fuels-bitcoin-price), [Newhedge](https://newhedge.io/bitcoin/bitcoin-vs-m2-10-week-lead)

### Inferences
- Với **chế độ Short-term (4H/1H, giữ ≤48h)**: các sự kiện FOMC và CPI chủ yếu tạo ra một **cú tăng biến động trong khoảng ~1 giờ**, có độ lớn ~1% mỗi 1 SD bất ngờ khi thị trường đang chú ý tới lạm phát. Một nến 1H vào giờ công bố có thể chạm stop-loss rồi đảo chiều. Lập luận này ủng hộ việc **chặn lệnh mới quanh giờ công bố**, chứ không ủng hộ việc dự đoán hướng giá.
- Với **chế độ Swing (1D/4H, giữ ≤10 ngày)**: không có bằng chứng tốt rằng một sự kiện vĩ mô đơn lẻ làm thay đổi xu hướng nhiều ngày (khung 4–24 giờ không thấy thay đổi theo Block Scholes). Chỉ nên **gắn cờ (flag)**, không nên hạ điểm mạnh.
- Độ nhạy thay đổi theo chế độ, nên một hệ số cứng (ví dụ "CPI luôn quan trọng") sẽ lỗi thời. Nếu muốn nâng cấp, có thể ước lượng độ nhạy theo cửa sổ trượt (phản ứng 1 giờ của BTC trong 12 kỳ CPI gần nhất).
- M2/DXY/10Y chỉ phù hợp làm **bộ lọc chế độ (regime filter)** chậm, ví dụ đồng USD tăng mạnh trong 30 ngày thì "thận trọng hơn". Bằng chứng không đủ để làm tín hiệu giao dịch.

### Gaps
- Chưa có nghiên cứu học thuật đã bình duyệt đo riêng phản ứng của BTC/ETH sau khi có ETF giao ngay (từ 2024), tách theo FOMC/CPI/NFP. Block Scholes không có phân tích riêng cho thời kỳ ETF.
- Không tìm được bản gốc nghiên cứu của Kaiko về biến động quanh FOMC (chỉ có trích dẫn lại, chưa kiểm chứng).
- Chưa có số liệu đáng tin về phản ứng của **altcoin** (top 1000) với vĩ mô. Có thể suy luận chúng biến động mạnh hơn BTC, nhưng chưa có nguồn đo.
- Chưa có bằng chứng lead-lag (dẫn trước – theo sau) đã bình duyệt giữa lợi suất 10 năm của Mỹ và lợi nhuận BTC.

## 2. Dòng tiền ETF giao ngay BTC/ETH của Mỹ

### Takeaway
Dòng tiền ETF và giá **đi cùng nhau**, và có quan hệ phản hồi hai chiều. Khả năng dự báo ngắn hạn tồn tại nhưng nhỏ: tương quan 7 ngày khoảng 0,30, phản ứng giá đạt đỉnh khoảng +1,2% sau 3–4 ngày (bằng chứng [NGÀNH]). Không có nguồn dữ liệu dòng tiền hằng ngày vừa **miễn phí, vừa có API chính thức, vừa ổn định**.

### Cited Findings
- [NGÀNH] FalconX, khoảng 10 tháng dữ liệu hằng ngày sau 11/1/2024, dùng thay đổi 7 ngày: tương quan **0,30** (tương quan trượt 60 ngày dao động 0,10 đến hơn 0,50). Kiểm định nhân quả Granger theo chiều dòng tiền → giá có **F = 8,48, p = 0,004**. Mô hình VAR độ trễ 1 ngày cho hệ số dòng tiền → giá là 0,027 (hệ số quán tính của giá là 0,802). Hàm phản ứng xung (IRF) đạt **đỉnh +1,2% vào ngày 3–4 rồi nhạt dần**. Dòng tiền giải thích dưới 10% biến động giá. Chính tác giả lưu ý: nhân quả Granger không phải nhân quả thật, và mẫu ngắn. — [FalconX](https://www.falconx.io/newsroom/what-can-spot-etf-flows-tell-us-about-the-trajectory-of-bitcoin-prices-a-preliminary-statistical-investigation)
- [HỌC THUẬT] Mazur & Polyzos (J. Alternative Investments, 2025): dòng tiền ròng vào ETF là "yếu tố dự báo dương mạnh" cho **mức giá** BTC. — [Zayed Univ. scholars](https://zuscholars.zu.ac.ae/works/7267) (chỉ đọc được tóm tắt)
- [HỌC THUẬT] Guliyev & Ahmadova (Ledger, 2025): tài sản của ETF và giá BTC có quan hệ đồng liên kết (cointegration) dài hạn. Kết quả nói về mức giá, không phải dự báo lợi nhuận ngắn hạn. — [Ledger](https://ledger.pitt.edu/ojs/ledger/article/view/393)
- [HỌC THUẬT, hướng ngược lại] Với ETF tương lai BTC (2021–2024): giá BTC quá khứ dự báo được giá ETF, còn **chiều ngược lại không có bằng chứng**. — [VJOL](https://vjol.vista.gov.vn/due/article/view/125157)
- [HỌC THUẬT] Babalos, Bouri & Gupta (QREF 2025): nghiên cứu sự kiện phê duyệt ETF cho thấy tác động dương lên BTC, ETH, LTC quanh ngày sự kiện. — [IDEAS/RePEc](https://ideas.repec.org/a/eee/quaeco/v102y2025ics106297692500047x.html)
- [NGÀNH] Newhedge có API trả dòng tiền ETF BTC hằng ngày (USD và BTC), **cần token**. Changelog 10/2026 ghi rằng số liệu 7 ngày giao dịch gần nhất **có thể bị điều chỉnh lại**. — [Newhedge docs](https://docs.newhedge.io/api/spot-bitcoin-etf-total-net-flows), [changelog](https://newhedge.io/changelog/spot-etf-flows-live-pending.md)
- [NGÀNH] Apify "Crypto ETF Flow Tracker" lấy dữ liệu từ SoSoValue và Farside, tính phí khoảng 1 USD / 1.000 bản ghi. Một nhà phát triển khác cho biết các scraper (công cụ cào trang) liên tục hỏng do lớp chống bot Cloudflare và bảng dữ liệu không chuẩn hóa. — [Apify](https://apify.com/gochujang/crypto-etf-flow-tracker), [ETF Flow (hunted.space)](https://hunted.space/product/etf-flow)
- [Tự kiểm tra] `https://farside.co.uk/btc/` trả **HTTP 403** cho `curl` (có User-Agent trình duyệt), nghĩa là bị chặn bot. `https://api.sosovalue.xyz` cũng trả **403**. (Kiểm tra bằng curl ngày 2026-10-19, từ máy cục bộ.)

### Inferences
- Dòng tiền ETF là **tín hiệu bối cảnh chậm, chỉ áp dụng cho BTC/ETH** (và có thể SOL), hợp với chế độ Swing. Ví dụ: tổng dòng tiền ròng 5 ngày âm mạnh thì hạ nhẹ điểm cho lệnh long BTC/ETH. Không nên dùng cho chế độ Short-term.
- Vì số liệu được công bố sau giờ đóng cửa thị trường Mỹ và còn bị sửa lại, máy quét chạy 15 phút một lần chỉ nên cập nhật dữ liệu này **mỗi ngày một lần**.

### Gaps
- Chưa tìm được nguồn dữ liệu dòng tiền ETF **miễn phí, có API, không cần cào trang**. Chưa kiểm chứng điều khoản và giới hạn của API SoSoValue.
- Chưa có nghiên cứu đã bình duyệt về dòng tiền ETF ETH dự báo giá ETH.

## 3. Mở khóa token (token unlock / vesting cliff)

### Takeaway
Bằng chứng **chỉ có từ ngành**, chủ yếu là Keyrock (hơn 16.000 sự kiện, không đọc được bản gốc). Khoảng 90% đợt mở khóa gây áp lực giảm giá. Giá thường bắt đầu giảm **khoảng 30 ngày trước** ngày mở khóa. Đợt mở khóa lớn (5–10% nguồn cung) giảm mạnh hơn khoảng 2,4 lần. Mở khóa cho đội ngũ (team) tệ nhất. Không có nguồn lịch mở khóa miễn phí đáng tin (endpoint `emissions` của DefiLlama là bản trả phí).

### Cited Findings
- [NGÀNH, đọc qua nguồn thứ cấp] Keyrock: hơn **16.000** sự kiện mở khóa, khoảng **90%** tạo áp lực giảm giá, "bất kể quy mô, loại hay người nhận". Áp lực thường **bắt đầu khoảng 30 ngày trước** ngày mở khóa. Mỗi tuần có khoảng 600 triệu USD token mới được mở khóa. Phương pháp chỉ ghi là "trung vị biến động giá có trọng số". — [crypto.news](https://crypto.news/token-unlocks-almost-always-negative-for-price-keyrocks-study-reveals/), [MEXC/PANews](https://www.mexc.com/news/777), [BeInCrypto](https://beincrypto.com/keyrock-research-token-unlocks/) (trang này trả 403 khi tải trực tiếp)
- [NGÀNH] Theo nhóm người nhận: mở khóa cho **team giảm khoảng 25%**. Mở khóa cho quỹ hệ sinh thái/phát triển ít hại nhất, **trung bình +1,18%**. Đợt 5–10% nguồn cung giảm mạnh hơn khoảng **2,4 lần** đợt nhỏ. Gợi ý của Keyrock: thoát vị thế 30 ngày trước và vào lại 14 ngày sau đợt mở khóa. — [Streamflow (trích Keyrock)](https://streamflow.finance/blog/do-token-unlocks-cause-price-drops), [BeInCrypto](https://beincrypto.com/keyrock-research-token-unlocks/)
- [NGÀNH, ngưỡng mâu thuẫn] Streamflow coi mở khóa **>5% nguồn cung lưu hành** là đáng kể. Autheo nói dưới **~1%** thì hầu như không có tác động đo được, nhưng không dẫn nguồn. — [Streamflow](https://streamflow.finance/blog/token-unlock-report), [Autheo](https://www.autheo.com/faq/do-token-unlocks-cause-price-drops)
- [NGÀNH] Có một nghiên cứu khác của The Tie với hơn 350.000 sự kiện mở khóa trên hơn 100 token. Chỉ tìm thấy video, chưa có số liệu. — [CoinDesk video](https://coindesk.com/video/examining-token-trends-before-and-after-unlock-events/)
- [Tự kiểm tra] Tài liệu DefiLlama liệt kê `GET /api/emissions` và `/api/emission/{protocol}` ở mục **Pro** (`https://pro-api.llama.fi/{API_KEY}/api/...`). Kết quả trả về gồm `circSupply, totalLocked, events, nextEvent, unlocksPerDay, mcap`. Gọi bản miễn phí `https://api.llama.fi/emissions` → **HTTP 402** (yêu cầu trả phí). — [DefiLlama llms-pro.txt](https://api-docs.defillama.com/llms-pro.txt)
- [NGÀNH] Tokenomist có API "Unlock Events", chưa kiểm chứng giá và giới hạn của gói miễn phí. — [Tokenomist docs](https://docs.tokenomist.ai/api-documents/api-endpoints/unlock-events-api)

### Inferences
- Quy tắc đề xuất (mức tin cậy trung bình–thấp, vì chưa có bản gốc): mở khóa ≥1% nguồn cung lưu hành trong 30 ngày tới → gắn cờ. Mở khóa ≥5%, hoặc người nhận là team/nhà đầu tư → hạ điểm lệnh long trong cả hai chế độ. Không mở lệnh long Short-term trong khoảng [−3 ngày, +1 ngày] quanh ngày mở khóa.
- Vì không có nguồn miễn phí, phương án thực tế là trả phí (gói Pro của DefiLlama hoặc Tokenomist), hoặc bỏ qua tính năng này.

### Gaps
- Không đọc được báo cáo gốc của Keyrock: chưa rõ cửa sổ sự kiện, chỉ số tham chiếu (benchmark), có điều chỉnh theo thị trường chung hay không.
- Chưa có nghiên cứu học thuật đã bình duyệt về mở khóa token.

## 4. Niêm yết/hủy niêm yết trên sàn, hack, hành động pháp lý, mất neo stablecoin

### Takeaway
Thông báo niêm yết trên Coinbase/Binance tạo **lợi nhuận bất thường dương lớn ngay ngày công bố** (+7% đến +33%) và có dấu hiệu rò rỉ thông tin trước đó. Tuy nhiên, nhiều nghiên cứu ngành ghi nhận giá **đảo chiều mạnh sau đó**. Hack làm tăng biến động và tương quan giữa các coin, nhưng không có ý nghĩa thống kê với giá BTC. Mất neo stablecoin nghiêm trọng thì lan sang cả thị trường.

### Cited Findings
- [HỌC THUẬT, working paper] Li, Luo, Wang & Wei: lợi nhuận ngày đầu quanh thông báo niêm yết trung bình **+32,8% trên Coinbase và +22,7% trên Binance**. Binance có xu hướng niêm yết coin mà chính sàn đã đầu tư, với nền tảng cơ bản kém hơn. — [Li et al. (Loyola)](https://loyola.edu/_media/sellinger-business/documents/academics/departments/finance/wealth-management-conference/speakers/J_Li.pdf)
- [HỌC THUẬT/NGÀNH, 2019] Lợi nhuận bất thường ngày niêm yết **+7,4%** (riêng Binance +14,7%). Trước thông báo có lợi nhuận bất thường **+3,2%**, dấu hiệu giao dịch nội gián. — [Blockchain Research Lab](https://www.blockchainresearchlab.org/de/2019/09/10/market-reaction-to-exchange-listings-of-cryptocurrencies-2/)
- [NGÀNH] Mẫu 389 token niêm yết năm 2024: **89%** giảm giá sau niêm yết, trung bình **−52%**. Animoca ghi nhận mức giảm khoảng −49% sau khi niêm yết trên sàn tập trung (CEX). — [RockawayX](https://rockawayx.com/insights/bullish-or-bearish-what-really-happens-when-tokens-list-on-a-cex), [BitPinas](https://bitpinas.com/cryptocurrency/binance-token-listing-dump/), [The Tie 2026](https://www.thetie.io/insights/what-does-an-exchange-listing-actually-deliver-in-2026)
- [HỌC THUẬT] Corbet, Cumming, Lucey, Peat & Vigne (2020, *Economics Letters*): hack làm **tăng biến động** của coin bị tấn công và **tăng tương quan** giữa các coin. Lợi nhuận bất thường xuất hiện **vài giờ trước** sự kiện rồi trở về 0 khi tin được công bố. — trích qua [Tyler Moore, J. Financial Research 2026](https://tylermoore.utulsa.edu/jfr26.pdf)
- [HỌC THUẬT] Nghiên cứu 44 vụ xâm nhập sàn giao dịch (2017–2025): USDT có lợi nhuận bất thường tích lũy (CAR) **−0,5% trong 21 ngày** sau vụ việc. **Không có tác động có ý nghĩa lên giá BTC.** — [Tyler Moore, J. Financial Research 2026](https://tylermoore.utulsa.edu/jfr26.pdf)
- [HỌC THUẬT, chưa xác minh tác giả] Dữ liệu theo giờ: phần lớn các vụ hack được hấp thụ như **cú sốc riêng lẻ (idiosyncratic)**. Chỉ những sự kiện liên quan đến hạ tầng mới làm tăng tạm thời mức đồng biến động toàn thị trường. — [Shamra Academia](https://shamra-academia.com/en/show/304b0a98bf6c45)
- [HỌC THUẬT] 8 lần mất neo stablecoin lớn: lợi nhuận bất thường âm và biến động của BTC/ETH/BNB tăng đáng kể, **mạnh nhất ở các vụ sụp đổ nghiêm trọng**. — [quanlynhanuoc.vn](https://www.quanlynhanuoc.vn/?p=59121)
- [GIAI THOẠI] Năm 2026: StablR USDR/EURR mất khoảng 20% giá neo sau vụ khai thác multisig rồi hồi lại ([Whale Alert](https://whale-alert.io/stories/eeb80162ddb3a8/StablR-stablecoins-USDR-and-EURR-briefly-depeg-after-multisig-exploit-mints-millions-of-fake-tokens-on-Ethereum)). Vụ hack Resolv USR, theo ước tính của một blog, gây thiệt hại dây chuyền hơn 500 triệu USD ([BlockEden](https://blockeden.xyz/blog/2026/04/19/defi-shadow-contagion-composability-cascade-risk-model/)).
- [Tự kiểm tra] `https://api.llama.fi/hacks` trả **HTTP 200, 1.307 bản ghi** gồm `{date (unix), name, classification, technique, amount, chain[], bridgeHack, targetType, returnedFunds, defillamaId}`. Bản ghi mới nhất là 15/10/2026. **Lưu ý:** tài liệu DefiLlama xếp `/api/hacks` vào mục Pro, nên endpoint miễn phí này có thể là không chính thức và có thể bị đóng. — [DefiLlama llms-pro.txt](https://api-docs.defillama.com/llms-pro.txt)
- [Tự kiểm tra] Danh sách bài "New Cryptocurrency Listing" của Binance (catalogId=48) qua `https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&catalogId=48&pageNo=1&pageSize=5` trả **HTTP 200 JSON** với `title, releaseDate`. Đây là **endpoint nội bộ, không có tài liệu chính thức**. Lưu ý: Binance chặn IP từ Mỹ ở nhiều dịch vụ; chưa kiểm chứng endpoint này từ GitHub Actions.
- [Tự kiểm tra] Có thể dùng `https://stablecoins.llama.fi/stablecoins?includePrices=true` (HTTP 200) để theo dõi giá stablecoin, từ đó phát hiện mất neo.

### Inferences
- Niêm yết: tác động diễn ra **trước khi máy quét 15 phút kịp phản ứng** (trong ngày đầu tiên), rồi có xu hướng đảo chiều. Quy tắc hợp lý: coin vừa có thông báo niêm yết trên sàn lớn trong 72 giờ qua → **không tăng điểm**, mà gắn cờ "bơm do niêm yết, rủi ro đảo chiều". Coin bị gắn tag Monitoring hoặc có thông báo hủy niêm yết → loại khỏi danh sách long.
- Hack: chỉ hạ điểm / loại **token của giao thức bị hack** (khớp `defillamaId` hoặc tên). Không giảm điểm toàn thị trường, trừ khi là hạ tầng lớn hoặc sàn lớn.
- Mất neo stablecoin: USDT/USDC lệch khỏi 1 USD quá 1–2% (ngưỡng do suy luận, chưa kiểm định) → **bật cờ rủi ro toàn thị trường** và tạm dừng tín hiệu Short-term.

### Gaps
- Chưa tìm được nghiên cứu sự kiện định lượng về **hành động pháp lý của SEC** (khởi kiện, Wells notice) lên giá coin bị nhắm tới.
- Chưa có số liệu đo tác động của **thông báo hủy niêm yết**.
- Không xác minh được số liệu "41%" của nghiên cứu Ren & Heinrich về niêm yết Binance ([Yahoo](https://malaysia.news.yahoo.com/binance-effect-means-41-price-173526978.html)).

## 5. Tâm lý tin tức và mạng xã hội (Fear & Greed Index, Google Trends, lượng thảo luận)

### Takeaway
Các chỉ số tâm lý và mức chú ý liên quan chặt với **biến động**, còn hướng nhân quả thường đi từ giá sang mức chú ý. Bằng chứng về khả năng dự báo **hướng giá** thì không nhất quán. Chiến lược "bán khi Tham lam" đứng vững hơn "mua khi Sợ hãi", nhưng đều là phân tích [NGÀNH] với mẫu nhỏ.

### Cited Findings
- [HỌC THUẬT] Chiến lược ngược đám đông (contrarian) dựa trên Crypto Fear & Greed Index (20 coin lớn nhất, 2018–2021) cho kết quả tốt hơn có ý nghĩa so với nắm giữ thụ động. — [Springer chapter (RePEc)](https://ideas.repec.org/h/spr/eurchp/978-3-031-36286-6_16.html)
- [NGÀNH] Lợi nhuận BTC trung bình 90 ngày sau đó: **+149%** sau giai đoạn "Extreme Greed" và **+126%** sau "Greed", nhưng chỉ **+5%** sau "Extreme Fear". Mẫu gồm 74 chuỗi 7 ngày liên tiếp, tức mẫu nhỏ. — [MEXC](https://www.mexc.com/news/1197268)
- [NGÀNH] Kiểm định trên 8 năm: "Sell the Greed" đứng vững, còn "Buy the Fear" là nửa kém tin cậy hơn ([phân tích 7/2026](https://san-1510.aid.brainsum.com/news/analysis/cryptos-favourite-adage-half-fails-bitcoin-hits-extreme-fear)). Extreme Greed thường đi trước **đà tăng tiếp theo trong ngắn hạn**, tức là có tính momentum chứ không phải đỉnh ([Ecoinometrics](https://ecoinometrics.substack.com/p/bitcoin-fear-and-greed-where-is-the)).
- [HỌC THUẬT] Bài trên Review of Behavioral Finance 2024 kiểm định nhân quả Granger giữa F&G và lợi nhuận BTC/ETH. Chỉ đọc được tóm tắt, chưa có kết quả. — [Emerald](https://www.emerald.com/insight/content/doi/10.1108/RBF-08-2023-0224/full/html)
- [Tự kiểm tra, phương pháp] Chỉ số F&G của Alternative.me **chỉ tính cho BTC**, gồm: biến động 25%, động lượng/khối lượng 25%, mạng xã hội 15%, khảo sát 15% (**hiện đang tạm dừng**), tỷ lệ thống trị (dominance) 10%, Google Trends 10%. Như vậy khoảng một nửa chỉ số được dựng từ chính giá và khối lượng, nên **trùng lặp với các chỉ báo kỹ thuật** mà máy quét đã có. — [Alternative.me](https://alternative.me/crypto/fear-and-greed-index/)
- [HỌC THUẬT] Google Trends: Urquhart (2018) cho thấy mức chú ý bị chi phối bởi biến động và khối lượng của ngày hôm trước, tức giá dẫn mức chú ý. Hai nguồn thứ cấp tóm tắt bài này khác nhau. Figà-Talamanca & Patacca thấy mức chú ý ảnh hưởng tới lợi nhuận. Một nghiên cứu khác thấy **không có quan hệ trực tiếp với lợi nhuận**, nhưng khối lượng và cường độ tìm kiếm làm tăng biến động, và lợi nhuận cao làm tăng lượng tìm kiếm. Arratia & Barrantes (2021): khả năng dự báo "không nhất quán". — [Urquhart (Soton eprint)](https://eprints.soton.ac.uk/417756/1/attention_bitcoin_3.pdf), [Talamanca (HSE)](https://icare.hse.ru/data/2018/10/23/1142386784/Talamanca.pdf), [arXiv 2106.07104](https://ar5iv.labs.arxiv.org/html/2106.07104)
- [HỌC THUẬT] Kroner (Fed): khi mức chú ý trước công bố cao, thị trường **phản ứng quá mức**. — [FEDS 2025-022](https://www.federalreserve.gov/econres/feds/files/2025022pap.pdf)

### Inferences
- F&G dùng tốt nhất như **bộ lọc chế độ / quy mô vị thế**, không phải tín hiệu vào lệnh. Ví dụ: Extreme Greed (>80) thì giảm nhẹ điểm cho lệnh long Swing mới, nhưng không đảo chiều thành tín hiệu short (vì có bằng chứng momentum). Extreme Fear (<20) thì **không** cộng điểm, vì "Buy the Fear" thiếu ổn định.
- Lượng thảo luận / Google Trends tăng đột biến là chỉ báo **biến động sắp tăng**, nên mở rộng stop-loss hoặc giảm khối lượng, không dùng để đoán hướng.
- Không có bằng chứng ủng hộ việc dùng tâm lý tin tức (news sentiment) để đoán hướng giá một cách đơn giản.

### Gaps
- Không đọc được kết quả bài RBF 2024 và chương sách Springer (bị tường phí).
- Chưa có nghiên cứu sự kiện về tâm lý tin tức từ CryptoPanic.

## 6. Nguồn dữ liệu miễn phí, đọc được bằng máy (endpoint, xác thực, giới hạn, giấy phép)

### Takeaway
Nguồn miễn phí và dùng ngay được: Alternative.me F&G (không cần key), FRED (cần API key miễn phí; `fredgraph.csv` dùng được không cần key), RSS của Fed, DefiLlama hacks và stablecoins (không cần key). **Lịch mở khóa token và dòng tiền ETF không có nguồn miễn phí ổn định.** Lịch FOMC chỉ có dạng HTML. BLS chặn curl.

### Cited Findings
| Nguồn | Endpoint | Xác thực | Kết quả thử (2026-10-19, máy cục bộ) | Ghi chú |
|---|---|---|---|---|
| Fear & Greed | `https://api.alternative.me/fng/?limit=N&format=json\|csv&date_format=` (`limit=0` = toàn bộ lịch sử) | Không | 200, có dữ liệu (59 "Greed") | Không công bố giới hạn tần suất (rate limit). Được dùng thương mại nếu **ghi nguồn ngay cạnh dữ liệu hiển thị**. Cập nhật 1 lần/ngày. — [Alternative.me](https://alternative.me/crypto/fear-and-greed-index/) |
| FRED API | `https://api.stlouisfed.org/fred/series/observations?series_id=WALCL&file_type=json&api_key=KEY` | API key miễn phí | 400 khi thiếu key | Chuỗi gợi ý: `WALCL` (bảng cân đối Fed), `M2SL`, `DGS10`, `DTWEXBGS` (USD rộng), `CPIAUCSL`, `PAYEMS` |
| FRED CSV | `https://fred.stlouisfed.org/graph/fredgraph.csv?id=WALCL` | Không | Có dữ liệu (dòng cuối `2026-10-14,6755639`). Một lần thử trước đó bị timeout (mã 000) | Không chính thức, nên ưu tiên dùng API |
| Lịch FOMC | `https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm` | Không | 200 (HTML) | Chỉ có HTML. Lịch cố định khoảng 8 kỳ/năm, có thể nhập tay mỗi năm |
| RSS chính sách tiền tệ của Fed | `https://www.federalreserve.gov/feeds/press_monetary.xml` | Không | 200 | Báo thông cáo theo thời gian thực |
| Lịch CPI/NFP của BLS | `https://www.bls.gov/schedule/news_release/cpi.htm`, `.../bls.ics` | Không | **403** với curl | BLS chặn bot. Phương án: nhập tay lịch năm |
| DefiLlama hacks | `https://api.llama.fi/hacks` | Không (tài liệu ghi Pro) | 200, 1.307 bản ghi | Có thể bị đóng. — [llms-pro.txt](https://api-docs.defillama.com/llms-pro.txt) |
| DefiLlama stablecoins | `https://stablecoins.llama.fi/stablecoins?includePrices=true` | Không | 200 | Phát hiện mất neo. — [llms-free.txt](https://api-docs.defillama.com/llms-free.txt) |
| DefiLlama unlocks | `https://pro-api.llama.fi/{KEY}/api/emissions` | **Trả phí** | Bản miễn phí trả 402 | Chỉ có hai bậc: miễn phí và gói API. — [llms-pro.txt](https://api-docs.defillama.com/llms-pro.txt) |
| Farside ETF flows | `https://farside.co.uk/btc/` | Chỉ có HTML | **403** (Cloudflare) | Cào trang không khả thi khi tự động hóa |
| SoSoValue | `https://api.sosovalue.xyz` | Chưa rõ | 403 | Chưa xác minh |
| Newhedge ETF flows | theo [tài liệu](https://docs.newhedge.io/api/spot-bitcoin-etf-total-net-flows) | Token | Chưa thử | Số liệu 7 ngày gần nhất có thể bị sửa lại |
| CryptoPanic | Đường dẫn gốc theo SDK là `https://cryptopanic.com/api/{plan}/v2/posts/?auth_token=...` ([SDK bên thứ ba](https://github.com/tigusigalpa/cryptopanic-php)) | Token | `.../api/developer/v2/posts/?public=true` không kèm token trả **404**. Trang tài liệu chỉ hiện "outdated browser" | **Không xác minh được** gói miễn phí và giới hạn |
| Binance listing | Endpoint CMS nội bộ (xem mục 4) | Không | 200 | Không có tài liệu chính thức |
| CoinGecko trending | `https://api.coingecko.com/api/v3/search/trending` | Không (gói công khai) | 200 | Dùng làm chỉ báo mức chú ý |
| GDELT | `https://api.gdeltproject.org/api/v2/doc/doc?query=bitcoin&mode=artlist&format=json` | Không | **429** (bị giới hạn tần suất) | Nguồn tin tức miễn phí, nhưng giới hạn tần suất chặt |

### Inferences
- Kiến trúc tối thiểu khả thi: (a) **lịch sự kiện tĩnh** (FOMC + CPI + NFP, nhập tay mỗi năm từ trang Fed/BLS) lưu thành JSON trong repo; (b) F&G gọi 1 lần/ngày; (c) DefiLlama hacks và stablecoins gọi mỗi giờ; (d) FRED (`WALCL`, `DGS10`, `DTWEXBGS`) gọi 1 lần/ngày.
- Gọi trong mỗi lần quét 15 phút chỉ cần đọc cache (bộ nhớ đệm), tránh gọi API trong vòng lặp 1.000 coin.

### Gaps
- **Chưa thử từ GitHub Actions (IP Mỹ).** Cần chạy thử một workflow. Đặc biệt cần thử Binance, Farside, BLS và GDELT.
- Không xác minh được giới hạn tần suất của FRED, Alternative.me và DefiLlama bản miễn phí, cũng như gói miễn phí của CryptoPanic.
- Không có nguồn miễn phí cho số liệu dự báo đồng thuận (consensus) của CPI/NFP. Thiếu số liệu này thì không tính được "bất ngờ" (surprise), chỉ biết được thời điểm công bố.

## 7. Thiết kế quy tắc thực tế: "bộ lọc lịch sự kiện"

### Takeaway
Bằng chứng ủng hộ **bộ lọc theo thời gian quanh sự kiện vĩ mô (dựa trên biến động)** cho chế độ Short-term, ủng hộ **gắn cờ mở khóa token / hack / niêm yết ở cấp từng token**, và **không** ủng hộ việc dùng tin tức để đoán hướng giá.

### Cited Findings
- Biến động quanh FOMC tập trung ở thời điểm công bố và trong khoảng 1 giờ sau đó — [arXiv 2302.10252](https://arxiv.org/pdf/2302.10252)
- Phản ứng với CPI tập trung trong 1 giờ; khung 4–24 giờ không có thay đổi tương tự — [Block Scholes](https://www.blockscholes.com/institutional-research/is-bitcoin-showing-greater-sensitivity-to-us-cpi-releases-again)
- Phản ứng bị phóng đại khi mức chú ý cao — [Kroner FEDS 2025-022](https://www.federalreserve.gov/econres/feds/files/2025022pap.pdf)
- Mở khóa token: áp lực giảm bắt đầu khoảng 30 ngày trước, gợi ý vào lại khoảng 14 ngày sau — [BeInCrypto/Keyrock](https://beincrypto.com/keyrock-research-token-unlocks/)
- Niêm yết: tăng mạnh ngày đầu, sau đó phần lớn đảo chiều — [Li et al.](https://loyola.edu/_media/sellinger-business/documents/academics/departments/finance/wealth-management-conference/speakers/J_Li.pdf), [RockawayX](https://rockawayx.com/insights/bullish-or-bearish-what-really-happens-when-tokens-list-on-a-cex)

### Inferences (đề xuất quy tắc; các ngưỡng thời gian là **suy luận từ bằng chứng, chưa được kiểm định ngược (backtest)**)
| Sự kiện | Short-term (4H/1H, ≤48h) | Swing (1D/4H, ≤10 ngày) | Căn cứ |
|---|---|---|---|
| Quyết định FOMC (14:00 ET) + họp báo | Không mở lệnh mới từ T−4h đến T+2h; tín hiệu trong T−24h bị gắn cờ "event risk" | Chỉ gắn cờ, không hạ điểm | Biến động kéo dài khoảng 1h; lấy thêm biên vì nến 1H/4H |
| CPI (08:30 ET) | Không mở lệnh mới từ T−2h đến T+2h; hạ điểm khi bối cảnh lạm phát được chú ý | Gắn cờ | Phản ứng tập trung trong 1h, độ lớn khoảng 1%/SD khi lạm phát cao |
| NFP | Chỉ gắn cờ (R² 2026 gần bằng 0) | Không xử lý | Block Scholes |
| Mở khóa ≥1% nguồn cung lưu hành trong 30 ngày | Gắn cờ | Hạ điểm long. Nếu ≥5% hoặc người nhận là team/nhà đầu tư thì hạ mạnh hoặc loại | Keyrock (nguồn thứ cấp) |
| Thông báo niêm yết trên sàn lớn trong 72h | Không cộng điểm; gắn cờ "đảo chiều sau niêm yết" | Như cột bên | Li et al.; RockawayX |
| Hack giao thức (DefiLlama) trong 7 ngày | Loại token liên quan | Loại token liên quan | Corbet 2020; Moore 2026 |
| Stablecoin lớn lệch >1–2% | Dừng tín hiệu mới toàn thị trường | Gắn cờ toàn thị trường | Nghiên cứu mất neo (quanlynhanuoc.vn) |
| F&G ≥80 | Không xử lý | Giảm nhẹ điểm long mới (không chuyển thành short) | Kết quả lẫn lộn; có tính momentum |
| F&G ≤20 | Không cộng điểm | Không cộng điểm | "Buy the Fear" kém ổn định |
| Dòng tiền ETF 5 ngày âm mạnh (chỉ BTC/ETH) | Không xử lý | Hạ nhẹ điểm | FalconX: r=0,30, đỉnh +1,2% sau 3–4 ngày |

- Nên tách "event risk" thành **trường riêng** (cờ + lý do + thời điểm sự kiện) thay vì trộn vào điểm kỹ thuật, để người dùng thấy rõ và để backtest riêng được.
- Tất cả các ngưỡng thời gian cần được backtest trên dữ liệu 1H của chính Coin Radar trước khi áp dụng.

### Gaps
- Không có nghiên cứu nào kiểm định trực tiếp quy tắc dạng "không vào lệnh trong X giờ trước FOMC" cho crypto. Các cửa sổ ở bảng trên là suy luận.
- Thiếu dữ liệu dự báo đồng thuận miễn phí, nên không thể làm quy tắc theo "độ lớn bất ngờ"; chỉ làm được theo "thời điểm".
