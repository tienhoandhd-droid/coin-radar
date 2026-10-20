# Xác định và xác nhận Hỗ trợ / Kháng cự (S/R) trong crypto: bằng chứng, heatmap, dữ liệu Binance, luật cho hệ Swing

> Ghi chú thuật ngữ (dùng xuyên suốt):
> - **S/R (Support/Resistance)**: vùng giá Hỗ trợ (giá hay bật lên) / Kháng cự (giá hay bị đẩy xuống).
> - **Bounce**: giá chạm vùng rồi bật ngược. **Penetration/Break**: giá xuyên qua vùng.
> - **Stop-loss (SL)**: lệnh cắt lỗ. **Take-profit (TP)**: lệnh chốt lời.
> - **Order book (sổ lệnh)**: danh sách lệnh giới hạn mua/bán đang chờ khớp. **Resting order / liquidity wall**: lệnh chờ / "bức tường" lệnh khối lượng lớn.
> - **Spoofing**: đặt lệnh lớn giả để lừa thị trường rồi hủy trước khi khớp (hành vi thao túng).
> - **In-sample**: kết quả đo trên chính dữ liệu dùng để xây dựng quy tắc (dễ "đẹp giả"). **Out-of-sample**: kiểm trên dữ liệu chưa thấy.
> - **Vendor**: nhà cung cấp công cụ thương mại (Bookmap, Coinglass, Hyblock…) — tuyên bố của họ là quảng cáo, chưa được kiểm chứng độc lập.
> - **ATR (Average True Range)**: biên độ dao động trung bình của nến, dùng làm "thước đo" độ rộng vùng.

Ngày tra cứu: 2026-10-20. Các mục dữ liệu Binance được kiểm trực tiếp bằng `curl` tới endpoint công khai, chỉ đọc (không gọi API có ký/giao dịch).

---

## 1. Bằng chứng S/R có tồn tại không?

### Takeaway
Có bằng chứng thống kê, nhưng **hiệu ứng nhỏ**: ở FX, giá bật tại mức S/R do ngân hàng công bố 60,8% so với 56,2% tại mức ngẫu nhiên (chênh ~4,6 điểm %). Cơ chế được giải thích bằng việc lệnh TP gom ở số tròn và lệnh SL gom *ngay sau* số tròn. Ở crypto, giá BTC gom ở số tròn rõ rệt (>10% giá kết thúc bằng "00"), **nhưng không có mẫu hình lợi nhuận đáng kể sau số tròn**. S/R là "rào cản bán phần", không phải bức tường.

### Cited Findings
**Osler (2000), "Support for Resistance" — FRBNY Economic Policy Review**
- Dữ liệu: mức S/R mà 6 công ty FX gửi khách hàng hằng ngày, từ 01/1996 đến 03/1998 (28 tháng), 3 cặp USD/JPY, USD/DEM, GBP/USD — [Osler 2000 PDF](https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf)
- Định nghĩa: "chạm" = giá trong phạm vi 0,01% quanh mức (thử thêm 0,00% và 0,02%); "bounce" = 15 phút sau giá vẫn ở phía cũ (thử thêm 30 phút). Mức "giả" (artificial) = 20 mức hỗ trợ + 20 kháng cự ngẫu nhiên mỗi ngày quanh giá mở cửa; kiểm định bootstrap — [Osler 2000](https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf)
- **Kết quả: bounce tại mức ngẫu nhiên 56,2%, tại mức công bố 60,8%**; cả 16 cặp công ty–tiền tệ đều cao hơn ngẫu nhiên; có ý nghĩa thống kê 5% ở tất cả trừ 3 cặp; riêng JPY cao hơn ngẫu nhiên 9,2 điểm % — [Osler 2000](https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf)
- Sức dự báo kéo dài **ít nhất 5 ngày làm việc** sau khi công bố — [Osler 2000](https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf)
- **Không công ty nào đánh giá đúng "độ mạnh" tương đối** của các mức (mức họ gọi là mạnh không bật nhiều hơn mức yếu); mức ngoài cùng không có ý nghĩa thống kê — [Osler 2000](https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf)
- >70% mức S/R công bố kết thúc bằng 0, 96% kết thúc bằng 0 hoặc 5 (ngẫu nhiên sẽ là 10% và 20%) — [Osler 2000](https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf)
- Lưu ý: bounce ngẫu nhiên đã là 56,2% → **một mức bất kỳ cũng "bật" hơn nửa số lần** theo định nghĩa ngắn hạn này. Đây là mốc so sánh quan trọng khi tự backtest.

**Osler (2001 staff report → Journal of Finance 2003, "Currency Orders and Exchange Rate Dynamics", 58(5):1791–1819)**
- Dữ liệu: 9.667 lệnh có điều kiện (SL/TP) tại một ngân hàng FX lớn, 01/09/1999–11/04/2000 — [NY Fed SR125 PDF](https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr125.pdf)
- Hai dự báo được giải thích: (1) xu hướng hay đảo chiều tại S/R; (2) xu hướng **tăng tốc sau khi xuyên** S/R — [SR125](https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr125.pdf)
- Mức kết thúc bằng 00 là cụm lớn nhất (~8,7% số lệnh); **9,3% lệnh TP khớp đúng tại 00, so với 4,4% lệnh SL** → số tròn là rào cản "phản xạ bán phần" — [SR125](https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr125.pdf). (Một nguồn thứ cấp dẫn 9,9% vs 3,8% theo giá trị — chưa đối chiếu được với bản JF; dùng số 9,3/4,4 của bản staff report.)
- **Stop-loss mua gom ngay TRÊN số tròn**: 14,4% lệnh SL mua đặt ở mức đuôi 01–10, so với 7,4% ở đuôi 90–99; SL bán gom ngay DƯỚI số tròn → khi xuyên số tròn, chuỗi SL bị kích hoạt làm giá chạy mạnh ("price cascade") — [SR125](https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr125.pdf); xem thêm [Osler, Stop-loss orders and price cascades, SR150](https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr150.html)
- >70% lệnh bị xoá/đóng trong 1 ngày; trung vị thời gian tồn tại 0,4 ngày — [SR125](https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr125.pdf)

**Kavajecz & Odders-White (2004), Review of Financial Studies 17(4):1043–1071, "Technical Analysis and Liquidity Provision"**
- Mức S/R **trùng với các đỉnh độ sâu (depth peaks) trong sổ lệnh giới hạn**; tín hiệu đường trung bình động mang thông tin về nơi thanh khoản nằm. Diễn giải của tác giả: công cụ kỹ thuật *định vị* thanh khoản đã có sẵn, không nhất thiết *tạo ra* nó — [IDEAS/RePEc](https://ideas.repec.org/a/oup/rfinst/v17y2004i4p1043-1071.html)

**Chung & Bellotti (2021), arXiv 2101.07410**
- Dữ liệu phút năm 2018: EURUSD, cổ phiếu Lloyds (LLOY), dầu Brent; cửa sổ lag 60 và 240 phút — [arXiv 2101.07410](https://arxiv.org/abs/2101.07410)
- Mốc so sánh: chuỗi random walk / chuỗi xáo trộn lợi suất (shuffled returns) cho p(bounce) ≈ 0,5. Chuỗi thật có p(bounce | b_prev) cao hơn chuỗi xáo trộn và **tăng theo số lần bật trước đó (b_prev)**; kiểm định hoán vị với 1.000 chuỗi xáo trộn — [arXiv PDF](https://arxiv.org/pdf/2101.07410)
- **Suy giảm theo thời gian (decay)**: với EURUSD, mức có 1 lần bật trước giảm về p=0,5 sau ~350 phút; mức có 4 lần bật trước giảm về 0,5 sau ~900 phút; LLOY thì kết quả yếu (Λ thấp nhất 0,226) nên tác giả "dè dặt" kết luận — [arXiv PDF](https://arxiv.org/pdf/2101.07410)

**Crypto**
- Urquhart (2017), Economics Letters 159:145–148: >10% giá Bitcoin kết thúc bằng ".00"; ủng hộ giả thuyết thương lượng của Harris (1991); **"không có mẫu hình lợi suất đáng kể sau số tròn"** — [IDEAS](https://ideas.repec.org/a/eee/ecolet/v159y2017icp145-148.html); [Southampton eprints](https://eprints.soton.ac.uk/412873)
- Mbanga (2019): BTC gom số tròn nhiều nhất thứ Sáu, ít nhất thứ Hai — [BearWorks](https://bearworks.missouristate.edu/articles-cob/431)
- Giá trị tâm lý: tăng 1 độ lệch chuẩn Google Trends giải thích ~2,5–5% mức gom giá bất thường ở BTC (Finance Research Letters 2019) — [Boise State](https://experts.boisestate.edu/en/publications/price-clustering-and-sentiment-in-bitcoin/)
- Hudson & Urquhart (2019, Annals of Operations Research): ~15.000 quy tắc kỹ thuật trên 2 thị trường BTC + 3 coin khác; có khả năng dự báo và sinh lời ở mọi nhóm quy tắc, **nhưng BTC không còn dự báo được ở giai đoạn out-of-sample** — [Hull repository](https://hull-repository.worktribe.com/output/2328042)
- Tsinaslanidis (2024, Springer Proceedings): vùng S/R ngang tạo tự động trên BTC, ETH, BNB, dữ liệu ngày 2018–2022: **giá bật ở vùng hỗ trợ nhiều hơn ở kháng cự**; 3 chiến lược bounce cho kết quả lẫn lộn — 2/3 chiến lược thắng buy-and-hold về lợi suất điều chỉnh rủi ro, và chỉ trên 1/3 chuỗi giá — [IDEAS](https://ideas.repec.org/h/spr/prbchp/978-3-031-49105-4_62.html)

### Inferences
- Ngưỡng tham chiếu để tự kiểm: **mọi mức S/R của mình phải bật nhiều hơn mức ngẫu nhiên cùng khoảng cách**, không phải "nhiều hơn 50%". Osler cho thấy chênh lệch chỉ ~4–9 điểm %.
- Hiệu ứng "số tròn" trong crypto là có thật ở dạng *gom giá*, nhưng bằng chứng về *lợi nhuận* thì yếu → dùng số tròn như một yếu tố hợp lưu, không phải tín hiệu độc lập.
- Cơ chế của Osler gợi ý luật thực hành: **đặt SL không ngay sau số tròn/swing rõ ràng** (nơi SL đám đông nằm), mà xa hơn một khoảng đệm theo ATR.

### Gaps
- Không tìm được nghiên cứu crypto nào báo cáo tỷ lệ bounce cụ thể (%) tại S/R so với mức ngẫu nhiên; chương của Tsinaslanidis không có số trên trang tóm tắt (cần bản đầy đủ của Springer).
- Không tìm thấy nghiên cứu S/R trên khung 4H/1D cho crypto perpetual futures.

---

## 2. Các phương pháp phát hiện S/R và mức độ bằng chứng

### Takeaway
Chỉ có **3 nhóm có bằng chứng định lượng**: (a) đỉnh/đáy gần đây và mức S/R kiểu chuyên gia (Osler 2000; Chung & Bellotti), (b) số tròn (Osler 2003; Urquhart 2017), (c) độ sâu sổ lệnh trùng S/R (Kavajecz & Odders-White 2004). Volume profile, anchored VWAP, đỉnh/đáy ngày-tuần-tháng trước **chủ yếu là kinh nghiệm người hành nghề, chưa có kiểm định học thuật mà tôi tìm được**. Fibonacci: bằng chứng **yếu/không khác vùng không-Fibonacci**.

### Cited Findings
| Phương pháp | Mô tả ngắn | Bằng chứng |
|---|---|---|
| Swing pivot / fractal (đỉnh-đáy cục bộ: nến có high cao hơn N nến hai bên) | Cơ sở của hầu hết thuật toán | Osler: "đỉnh/đáy gần đây là xấp xỉ tốt như bất kỳ cách nào" (trích lại trong [Chung & Bellotti](https://arxiv.org/pdf/2101.07410)); Chung & Bellotti dùng thuật toán heuristic dựa trên vùng giá, độ rộng vùng theo bước giá trung bình — [arXiv](https://arxiv.org/pdf/2101.07410) |
| Volume profile (phân bố khối lượng theo mức giá): **POC** (Point of Control = mức giá có khối lượng lớn nhất), **Value Area** (vùng chứa ~70% khối lượng), **HVN/LVN** (nút khối lượng cao/thấp) | HVN thường được coi là S/R, LVN là vùng giá đi nhanh | Không tìm thấy nghiên cứu có đối chứng; các nguồn chỉ là tài liệu giáo dục của broker/vendor — [Schwab](https://www.schwab.com/learn/story/richer-technical-view-analyzing-volume-by-price), [LuxAlgo (vendor)](https://www.luxalgo.com/library/concept/volume-profile.md). Một bài 2025 (Martyushev và cộng sự, Contemporary Mathematics) báo cáo phương pháp "volume-weighted" có precision/recall tốt hơn phương pháp cực trị cổ điển — [wiserpub](https://ojs.wiserpub.com/index.php/CM/article/view/8482) (chưa đọc toàn văn, chưa rõ out-of-sample) |
| Anchored VWAP (giá trung bình theo khối lượng, neo từ một sự kiện như đỉnh/đáy lớn) | Mức "giá vốn trung bình" của người mua từ điểm neo | Không tìm thấy kiểm định học thuật — xem Gaps |
| Đỉnh/đáy ngày-tuần-tháng trước (PDH/PDL, PWH/PWL…) | Mức tham chiếu phổ biến | Không tìm thấy kiểm định cho crypto — xem Gaps |
| Số tròn | 10.000, 50.000, 100.000… | Có bằng chứng gom lệnh và gom giá (mục 1) — [SR125](https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr125.pdf), [Urquhart 2017](https://ideas.repec.org/a/eee/ecolet/v159y2017icp145-148.html) |
| Fibonacci (38,2% / 50% / 61,8%) | Tỷ lệ thoái lui | Một nghiên cứu nhận diện Fibonacci tự động trên 3 thị trường cổ phiếu (Expert Systems with Applications) thấy **hành vi giá tại vùng Fibonacci và không-Fibonacci không khác nhau có ý nghĩa thống kê** — [datalearner tóm tắt](https://www.datalearner.com/academic/journal-papers/0957-4174/volumes-and-issues/391/paper-detail/17703); Wikipedia ghi "ý nghĩa của các mức này không được xác nhận khi kiểm tra dữ liệu" — [Wikipedia](https://en.wikipedia.org/wiki/Fibonacci_retracement); Osler 2000 chỉ mô tả quy tắc 50%/38,2%/61,8% như kinh nghiệm thị trường — [Osler 2000](https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf) |
| Tường thanh khoản sổ lệnh | Lệnh chờ lớn | S/R trùng depth peaks (FX/cổ phiếu) — [Kavajecz & Odders-White](https://ideas.repec.org/a/oup/rfinst/v17y2004i4p1043-1071.html); nhưng xem mục 3 về spoofing |

- Mô hình mẫu hình biểu đồ (Bulkowski, **nguồn người hành nghề, chưa bình duyệt**) báo cáo mẫu hình ngày nay thất bại nhiều hơn 2–4 lần so với trước (nghiên cứu 1991–2008) — [thepatternsite FailureRates](https://thepatternsite.com/FailureRates.html)

### Inferences
- Với hệ thống tự động, cách an toàn nhất: **swing pivot làm khung + số tròn + (tùy chọn) HVN của volume profile làm yếu tố hợp lưu**, và chứng minh bằng backtest so với mức ngẫu nhiên. Không nên cộng điểm cho Fibonacci.
- Do Kavajecz & Odders-White cho thấy S/R kỹ thuật "định vị" thanh khoản có sẵn, một mức S/R tốt nên trùng nơi khối lượng/thanh khoản lịch sử lớn — đây là lý do hợp lý để thử HVN, nhưng vẫn cần tự kiểm.

### Gaps
- Không tìm được nghiên cứu học thuật kiểm định POC/HVN, anchored VWAP hay PDH/PDL so với mức ngẫu nhiên (đã tìm, kết quả chỉ là blog/vendor).
- Bài Fibonacci trên ESWA: chưa xác nhận được tên tác giả/năm qua nguồn chính.

---

## 3. Heatmap sổ lệnh (Bookmap-style, Coinglass/Hyblock) và heatmap thanh lý

### Takeaway
**Heatmap sổ lệnh** chỉ hiển thị lệnh *được công bố* trên một sàn; lệnh lớn có thể bị rút (pull) hoặc là spoofing, và lệnh ẩn (iceberg) thì không hiện. **Heatmap thanh lý là mô hình ước lượng** (từ open interest + giả định đòn bẩy), không phải dữ liệu quan sát; các vendor cho ra vùng "nóng" khác nhau cho cùng tài sản. Không tìm thấy nghiên cứu độc lập nào chứng minh "tường lệnh" hay "cụm thanh lý" dự báo đảo chiều ở khung 4H/1D. Bằng chứng về mất cân bằng sổ lệnh chỉ có ở **khung rất ngắn (giây–phút)**.

### Cited Findings
**Spoofing trong crypto**
- arXiv 2110.03687: mô hình GRU phát hiện spoofing trên sổ lệnh ETH; mô tả lệnh mua lớn được đặt và hủy lặp đi lặp lại, quy cho bot HFT; dùng sự kiện gắn nhãn thủ công để kiểm — [arXiv 2110.03687](https://arxiv.org/pdf/2110.03687)
- Fabre & Challet (2025): học "khả năng bị spoof" của sổ lệnh crypto bằng dữ liệu Level-3; lập luận rằng mô hình bỏ qua *khoảng cách lệnh tới giá tốt nhất* là không đủ — [arXiv 2504.15908](https://export.arxiv.org/pdf/2504.15908)
- Cointelegraph Research: tổng quan về spoofing trong crypto (không phải nghiên cứu chặt chẽ) — [Cointelegraph Research](https://research.cointelegraph.com/articles/spoofing-order-books-in-the-crypto-market)
- Bối cảnh FX: >70% lệnh có điều kiện bị xoá/đóng trong 1 ngày, trung vị 0,4 ngày — lệnh chờ thay đổi rất nhanh — [SR125](https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr125.pdf)

**Heatmap sổ lệnh — nguồn vendor (cần thận trọng)**
- Bookmap (vendor) tuyên bố heatmap giúp phân biệt lệnh thật được khớp và spoofing biến mất trước khi khớp; ví dụ minh họa là một lệnh 743 hợp đồng — **không có kiểm định độc lập** — [Bookmap blog](https://bookmap.com/blog/probing-testing-and-spoofing/)
- LuxAlgo (vendor): heatmap chỉ hiển thị lệnh giới hạn trên sàn được lấy mẫu; lệnh có thể bị rút khi giá đến gần; iceberg làm *ít* đi, spoof làm *nhiều* lên mức quan tâm thật → "hành vi khi giá tiếp cận quan trọng hơn độ sáng trên màn hình" — [LuxAlgo](https://www.luxalgo.com/library/concept/resting-liquidity-liquidity-heatmap.md)
- Diễn đàn NexusFi: phát hiện iceberg/spoof cần dữ liệu market-by-order (MBO); người mới coi mọi vùng sáng là hỗ trợ chắc chắn thì "bị đốt tiền"; đại diện Bookmap nói lợi thế nằm ở việc theo dõi *hành vi theo thời gian* của khối lệnh — [NexusFi](https://nexusfi.com/a/platforms/order-flow-heatmap-visualization), [NexusFi thread](https://nexusfi.com/showthread.php?p=840007)

**Mất cân bằng sổ lệnh (order book imbalance) — bằng chứng học thuật, khung ngắn**
- Luận văn Charles University: dữ liệu futures Binance (BTC, ETH, LTC) tần suất cao; các thước đo bất cân xứng bid/ask có ảnh hưởng thống kê lên lợi suất, **đặc biệt ở khoảng thời gian ngắn** — [dspace.cuni.cz](https://dspace.cuni.cz/handle/20.500.11956/200516)
- Mô hình Hawkes dùng dữ liệu sổ lệnh để dự báo dấu lợi suất crypto (preprint 2023) — [arXiv 2312.16190](https://arxiv.org/pdf/2312.16190)

**Heatmap thanh lý (liquidation heatmap) — là mô hình**
- Coinglass (vendor) mô tả heatmap dùng "thuật toán phức tạp" phân tích dữ liệu và các mức đòn bẩy để *dự đoán* vùng thanh lý tiềm năng; không công bố công thức; khuyên coi thang đo là tương đối, không phải số thanh lý thực — [Coinglass intro](https://www.coinglass.com/id/learn/coinglass-intro-en)
- Bên thứ ba: đầu vào thường là phân bố open interest, các bậc đòn bẩy giả định, độ sâu sổ lệnh; **hai công cụ có thể cho vùng nóng khác nhau cho cùng tài sản cùng thời điểm** vì giả định đòn bẩy khác — [Bitsgap](https://bitsgap.com/blog/crypto-liquidation-heatmap-explained), [DEXTools](https://www.dextools.io/tutorials/how-to-read-liquidation-maps-in-crypto-guide-2026)
- Cách tái tạo phổ biến: mỗi khi có khối lượng tại một mức giá, giả định một phần mở vị thế long/short ở các bậc đòn bẩy (vd ~10% cách giá vào cho 10x, ~1% cho 100x); sàn **không công bố** thang vị thế thật — [cryptometer](https://www.cryptometer.io/liquidation-heatmap), [TradingView open-source script](https://www.tradingview.com/script/2WzPEzZ4/), [Buildix](https://www.buildix.trade/hyperliquid/HYPER)
- Hyblock: không tìm thấy tài liệu phương pháp chính thức; chỉ có script bên thứ ba "lấy cảm hứng từ Hyblock" — [TradingView](https://jp.tradingview.com/script/zq54L34V-Liquidation-Levels)

### Inferences
- **Trả lời câu hỏi "có nên nhìn heatmap lệnh chờ?"**: với hệ Swing 1D/4H, *không nên dùng làm điều kiện chính*. Lý do: (1) lệnh chờ sống tính bằng giờ/phút, còn lệnh Swing giữ nhiều ngày; (2) không có kiểm định độc lập về khả năng dự báo đảo chiều ở khung này; (3) dữ liệu lịch sử miễn phí của Binance chỉ có độ sâu gộp theo % (mục 4), không tái tạo được heatmap mức giá cụ thể. Có thể dùng như **bộ lọc phụ** ở thời điểm vào lệnh (vd: độ sâu bid trong ±1% không sụt mạnh khi giá chạm hỗ trợ) — và phải backtest/forward-test trước.
- Heatmap thanh lý: hữu ích để hiểu "nhiên liệu" có thể làm giá quét qua một vùng (giống cơ chế SL cascade của Osler), nhưng vì là mô hình nên **không coi là S/R quan sát được**.

### Gaps
- Không tìm thấy nghiên cứu độc lập đo tỷ lệ "tường lệnh lớn bị rút trước khi khớp" trên Binance futures, hay tỷ lệ đảo chiều tại cụm thanh lý.
- Không tìm thấy công thức chính thức của Coinglass/Hyblock.

---

## 4. Dữ liệu khả dụng cho Binance USDⓈ-M (backtest và bot live)

### Takeaway
Lưu trữ công khai `data.binance.vision` có **bookDepth** (độ sâu gộp theo **±0,2/1/2/3/4/5%**, mỗi **~30 giây**, từ **2023-01-01**), **bookTicker** (giá/khối lượng tốt nhất, nhưng BTCUSDT daily chỉ từ **2023-05-16 đến 2024-03-30**), **aggTrades/trades** (từ 2019-12-31 với BTCUSDT), **klines có cột taker_buy_volume**, và **metrics** (open interest, tỷ lệ long/short, taker ratio — **5 phút**, từ 2020-09-01). **Không có** dữ liệu sổ lệnh đầy đủ (L2 theo từng mức giá) lịch sử miễn phí → không backtest được heatmap kiểu Bookmap. Live: diff depth stream + REST snapshot tối đa 1000 mức.

### Cited Findings (kiểm trực tiếp bằng S3 listing, 2026-10-20)
- Thư mục `data/futures/um/daily/`: aggTrades, bookDepth, bookTicker, indexPriceKlines, klines, markPriceKlines, metrics, premiumIndexKlines, trades. Thư mục `monthly/`: aggTrades, bookTicker, fundingRate, indexPriceKlines, klines, markPriceKlines, premiumIndexKlines, trades (không có bookDepth và metrics ở monthly) — [S3 listing daily](https://s3-ap-northeast-1.amazonaws.com/data.binance.vision?delimiter=/&prefix=data/futures/um/daily/), [S3 listing monthly](https://s3-ap-northeast-1.amazonaws.com/data.binance.vision?delimiter=/&prefix=data/futures/um/monthly/)
- **bookDepth**: file đầu tiên `BTCUSDT-bookDepth-2023-01-01.zip` (ETHUSDT, SOLUSDT cũng từ 2023-01-01); file mới nhất thấy được 2026-10-18. Header CSV: `timestamp,percentage,depth,notional`; percentage ∈ {−5, −4, −3, −2, −1, −0,2, 0,2, 1, 2, 3, 4, 5}; file 2026-10-15 có 34.560 dòng = 2.880 snapshot × 12 bucket → **1 snapshot mỗi 30 giây**. Ví dụ 00:00:01: bid tích lũy trong −1% = 3.092,6 BTC (~251 triệu USDT), trong −5% = 10.019,6 BTC (~803 triệu USDT) — [file mẫu](https://data.binance.vision/data/futures/um/daily/bookDepth/BTCUSDT/BTCUSDT-bookDepth-2026-10-15.zip). Diễn giải (suy luận từ số liệu tăng dần): `depth` là **lũy kế** từ giá giữa tới ngưỡng %, không phải theo từng mức giá.
- **bookTicker** (BTCUSDT daily): từ 2023-05-16; file cuối thấy được **2024-03-30**; không có file 2024-06, 2025-01, 2026-01, 2026-10 → đã ngừng — [S3 listing](https://s3-ap-northeast-1.amazonaws.com/data.binance.vision?prefix=data/futures/um/daily/bookTicker/BTCUSDT/&max-keys=4)
- **aggTrades** BTCUSDT: file đầu 2019-12-31; cột `agg_trade_id,price,quantity,first_trade_id,last_trade_id,transact_time,is_buyer_maker` (file 1 ngày ~1,82 triệu dòng, 22 MB zip). `is_buyer_maker=false` nghĩa là bên chủ động là người mua → tính được **delta** (khối lượng mua chủ động − bán chủ động) theo mức giá — [file mẫu](https://data.binance.vision/data/futures/um/daily/aggTrades/BTCUSDT/BTCUSDT-aggTrades-2026-10-15.zip)
- **klines** 4h: cột `open_time,open,high,low,close,volume,close_time,quote_volume,count,taker_buy_volume,taker_buy_quote_volume,ignore` → delta theo nến = 2×taker_buy_volume − volume — [file mẫu](https://data.binance.vision/data/futures/um/daily/klines/BTCUSDT/4h/BTCUSDT-4h-2026-10-15.zip)
- **metrics**: `create_time,symbol,sum_open_interest,sum_open_interest_value,count_toptrader_long_short_ratio,sum_toptrader_long_short_ratio,count_long_short_ratio,sum_taker_long_short_vol_ratio`; ~288 dòng/ngày (5 phút); file đầu 2020-09-01 — [file mẫu](https://data.binance.vision/data/futures/um/daily/metrics/BTCUSDT/BTCUSDT-metrics-2026-10-15.zip)

**Live (tài liệu chính thức Binance)**
- Quy trình giữ sổ lệnh cục bộ: mở stream `wss://fstream.binance.com/public/stream?streams=btcusdt@depth`; lấy snapshot `https://fapi.binance.com/fapi/v1/depth?symbol=BTCUSDT&limit=1000`; bỏ event có `u` < `lastUpdateId`; kiểm `pu` = `u` trước, sai thì làm lại; số lượng là **tuyệt đối**, qty=0 thì xóa mức giá — [Binance: How to manage a local order book](https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-market-streams/How-to-manage-a-local-order-book-correctly)
- Diff depth stream USDⓈ-M: tên `<symbol>@depth` hoặc `@depth@500ms` hoặc `@depth@100ms` — [Binance: Diff Book Depth Streams](https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-market-streams/Diff-Book-Depth-Streams)
- Partial depth: `<symbol>@depth<levels>` với levels 5/10/20, tốc độ 250ms/500ms/100ms — **xác nhận trên trang COIN-M**; trang USDⓈ-M tương ứng không tải được (trang render bằng JS) — [Binance COIN-M Partial Book Depth](https://developers.binance.com/docs/derivatives/coin-margined-futures/websocket-market-streams/Partial-Book-Depth-Streams)
- Thanh lý: `<symbol>@forceOrder` và `!forceOrder@arr`, **mỗi symbol chỉ đẩy lệnh thanh lý mới nhất trong mỗi 1000ms** (snapshot) → đếm thiếu — [Binance Liquidation Order Streams](https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-market-streams/Liquidation-Order-Streams); Coin Metrics ghi nhận thay đổi này từ 2021-04-27 khiến dữ liệu thanh lý Binance bị báo thiếu — [Coin Metrics](https://gitbook-docs.coinmetrics.io/market-data/market-data-overview/liquidations/futures-liquidations)

### Inferences
- Backtest hệ Swing chỉ cần **klines (có taker_buy_volume) + aggTrades + metrics (OI)** — đủ để thử xác nhận bằng delta/khối lượng và OI. bookDepth (từ 2023) đủ để thử *một* bộ lọc thô "độ sâu bid trong −1% so với ask trong +1%", nhưng không thấy được tường lệnh ở mức giá cụ thể.
- Heatmap lệnh chờ ở mức giá cụ thể: muốn có thì phải **tự ghi lại** từ WebSocket từ hôm nay (không có lịch sử) → không thể backtest ngược.
- Thanh lý từ stream bị lấy mẫu (1 lệnh/giây/symbol) → không tự dựng được heatmap thanh lý chính xác.

### Gaps
- **Không tìm thấy nguồn heatmap thanh lý lịch sử miễn phí** đáng tin; Coinglass/Hyblock là dịch vụ thương mại (chưa kiểm điều khoản/giá API).
- Chưa xác minh trên trang USDⓈ-M rằng partial depth có đúng 250/500/100ms (chỉ thấy trên trang COIN-M).
- Chưa kiểm ngày bắt đầu bookDepth cho altcoin ít thanh khoản, và có ngày nào bị thiếu file hay không (vd file metrics 2026-10-15 bắt đầu 01:15, có thể thiếu dòng).

---

## 5. XÁC NHẬN một mức trước khi vào lệnh

### Takeaway
Gần như **mọi kỹ thuật xác nhận đều thiếu kiểm định học thuật độc lập**. Bằng chứng gián tiếp: (1) Osler: xuyên S/R → xu hướng tăng tốc (ủng hộ việc *chờ đóng nến lại trong vùng* thay vì bắt dao rơi); (2) Chung & Bellotti: mức đã bật nhiều lần và còn "mới" bật tốt hơn; (3) mất cân bằng lệnh có sức dự báo nhưng chỉ khung ngắn. Hệ thống tự động nên mã hóa xác nhận thành điều kiện nhị phân rõ ràng và **so sánh với phiên bản không xác nhận** trong backtest.

### Cited Findings
- Xuyên mức → động lượng tăng (do chuỗi SL) — [SR125](https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr125.pdf); vì vậy một cú xuyên râu nến rồi **đóng cửa lại trong vùng** là dấu hiệu SL đã bị quét mà lực không theo tiếp (diễn giải của người viết dựa trên cơ chế Osler, chưa có kiểm định trực tiếp).
- Số lần bật trước tăng → xác suất bật tiếp tăng; xác suất giảm dần theo thời gian — [Chung & Bellotti](https://arxiv.org/pdf/2101.07410)
- Tín hiệu phá vỡ S/R trong FX có lợi nhuận sau chi phí (nghiên cứu FMG/LSE "When Support/Resistance Levels are Broken, Can Profits Be Made?") — [FMG](https://www.fmg.ac.uk/publications/discussion-papers/when-supportresistance-levels-are-broken-can-profits-be-made) (cơ sở cho chiến lược retest/S-R flip, nhưng nghiên cứu là FX và cũ)
- Mất cân bằng bid/ask trên Binance futures dự báo lợi suất **ngắn hạn** — [Charles Univ.](https://dspace.cuni.cz/handle/20.500.11956/200516)
- Rejection candle (pin bar), RSI divergence: không tìm thấy nghiên cứu có đối chứng; nguồn chỉ là blog/TradingView; một nguồn ghi divergence dễ cho tín hiệu sai trong xu hướng mạnh — [MQL5](https://www.mql5.com/en/blogs/post/496546)
- Absorption (lệnh chờ hấp thụ lực bán chủ động mà giá không giảm): chỉ có mô tả của vendor Bookmap — [Bookmap](https://bookmap.com/blog/order-flow-bookmap-gives-stock-traders-edge)

**Cách mã hóa (người viết đề xuất, cần backtest):**
| Xác nhận | Luật mã hóa (nến 4H tại hỗ trợ; đảo dấu cho kháng cự) |
|---|---|
| Rejection/pin bar | low ≤ đáy vùng; close ≥ đỉnh vùng hoặc close trong vùng; râu dưới ≥ 2× thân và ≥ 50% range nến |
| Đóng cửa lại trong vùng (failed breakdown) | low < (đáy vùng − 0,25×ATR) nhưng close > đáy vùng, trong cùng nến hoặc nến kế tiếp |
| Retest sau breakout (S/R flip) | nến close > kháng cự cũ + 0,25×ATR; trong ≤ 10 nến quay về chạm vùng mà **không** close dưới đáy vùng; vào khi có nến xác nhận |
| Delta/khối lượng | delta nến = 2×taker_buy_volume − volume; yêu cầu delta nến chạm ≥ 0 sau chuỗi delta âm, hoặc volume nến ≥ 1,5× SMA20(volume) kèm close trong nửa trên range |
| Absorption (từ aggTrades) | trong vùng: tổng bán chủ động lớn (vd ≥ 2× trung bình) nhưng giá không đóng dưới vùng → có hấp thụ |

### Inferences
- Thứ tự ưu tiên hợp lý cho hệ 4H/1D (dễ kiểm, dữ liệu sẵn): (1) đóng cửa lại trong vùng / failed breakdown, (2) retest-flip, (3) delta từ klines, (4) absorption từ aggTrades. Heatmap sổ lệnh xếp cuối.
- Mỗi xác nhận làm **giảm số lệnh và làm giá vào xấu hơn**; chỉ giữ cái nào cải thiện kỳ vọng (expectancy) out-of-sample.

### Gaps
- Không có nghiên cứu crypto nào lượng hóa tỷ lệ thắng của pin bar, retest, hay delta tại S/R.

---

## 6. (Mở rộng) Phân biệt S/R YẾU và MẠNH — từng chỉ báo

### Takeaway
Có bằng chứng học thuật cho **2 yếu tố**: số lần bật trước (nhiều hơn → mạnh hơn) và độ mới (cũ → yếu dần) [Chung & Bellotti]. Có cơ chế được chứng minh cho **số tròn** [Osler]. Các yếu tố còn lại (hợp lưu đa khung, MA/VWAP, divergence, tốc độ tiếp cận, OI/funding, tam giác tăng) **chỉ có kinh nghiệm người hành nghề hoặc thống kê không bình duyệt**. Lưu ý quan trọng: Osler cho thấy chính chuyên gia FX **không đánh giá đúng** mức nào mạnh hơn → chấm điểm "độ mạnh" phải được backtest, không dựa cảm tính.

### Cited Findings
| Yếu tố | Bằng chứng | Nguồn |
|---|---|---|
| **Số lần chạm** | Mức có nhiều lần bật trước có p(bounce) cao hơn (FX/hàng hóa, phút, 2018) — *mâu thuẫn* với niềm tin "chạm nhiều lần thì yếu đi do lệnh bị hấp thụ hết". Lưu ý: ở cửa sổ dài hơn hiệu ứng giảm. Một blog quyền chọn nói lần test 2 kém hơn lần 1 nhưng **không có mẫu số** | [Chung & Bellotti](https://arxiv.org/pdf/2101.07410); [OptionsTradingIQ](https://optionstradingiq.com/volume-profile-support-resistance/) |
| **Tuổi / độ mới** | p(bounce) giảm về 0,5 sau ~350 phút (1 lần bật trước) đến ~900 phút (4 lần bật) với EURUSD dữ liệu phút; Osler: mức công bố còn tác dụng ≥5 ngày làm việc | [Chung & Bellotti](https://arxiv.org/pdf/2101.07410); [Osler 2000](https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf) |
| **Hợp lưu đa khung** | Không tìm thấy kiểm định | — |
| **Hợp lưu MA / VWAP / số tròn / Fib** | MA mang thông tin về vị trí độ sâu sổ lệnh [Kavajecz & Odders-White]; số tròn có gom lệnh [Osler 2003]; Fib không khác vùng thường [ESWA] | [RFS 2004](https://ideas.repec.org/a/oup/rfinst/v17y2004i4p1043-1071.html); [SR125](https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr125.pdf); [datalearner](https://www.datalearner.com/academic/journal-papers/0957-4174/volumes-and-issues/391/paper-detail/17703) |
| **Khối lượng lúc hình thành, volume/delta lúc retest** | Không tìm thấy kiểm định cho S/R; chỉ có bằng chứng mất cân bằng lệnh dự báo lợi suất khung ngắn | [Charles Univ.](https://dspace.cuni.cz/handle/20.500.11956/200516) |
| **RSI/MACD divergence** | Không tìm thấy nghiên cứu có đối chứng; chỉ giai thoại | [MQL5](https://www.mql5.com/en/blogs/post/496546) |
| **Tốc độ tiếp cận** (giá lao nhanh vào mức hay phá) | Không tìm thấy kiểm định trực tiếp; cơ chế gián tiếp: SL gom ngay sau mức → khi đà đủ mạnh để chạm cụm SL thì giá tăng tốc | [SR125](https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr125.pdf) |
| **OI và funding tại mức** | Không tìm thấy nghiên cứu; dữ liệu OI 5 phút có sẵn để tự kiểm | [metrics mẫu](https://data.binance.vision/data/futures/um/daily/metrics/BTCUSDT/BTCUSDT-metrics-2026-10-15.zip) |
| **Dấu hiệu sắp phá: test lặp lại với nhịp bật nhỏ dần / tam giác tăng** | Bulkowski (người hành nghề, mẫu cổ phiếu thị trường tăng, >1.400 giao dịch): tam giác tăng phá lên 63% số lần; break-even failure 17% khi phá lên, 38% khi phá xuống; đạt mục tiêu giá 70% | [thepatternsite: ascending triangle](https://www.thepatternsite.com/at.html) |

### Inferences — luật mã hóa đề xuất (cần backtest; tham số là điểm khởi đầu, không phải kết quả đã chứng minh)
- **Điểm số độ mạnh** S = w1·min(số lần bật, 4) + w2·hợp lưu số tròn + w3·hợp lưu khung 1D (nếu vùng 4H trùng vùng 1D ± 0,5×ATR_1D) + w4·HVN − w5·tuổi. Chỉ giữ trọng số nào cải thiện out-of-sample.
- **Đếm lần bật**: chỉ tính lần chạm mà sau đó giá đi xa ≥ 1×ATR khỏi vùng trước khi quay lại (tránh đếm nhiễu).
- **Tốc độ tiếp cận**: v = |close_now − close_{t−3}| / ATR; nếu v > 2 (3 nến 4H đi > 2 ATR thẳng tới vùng) → *không* bắt bounce, chờ tín hiệu phá/retest.
- **Dấu hiệu sắp phá**: (a) ≥3 lần chạm trong ≤ 20 nến với biên độ bật của mỗi lần nhỏ hơn lần trước (vd giảm ≥ 30%); (b) các đáy (với kháng cự) cao dần → vùng nén. Khi có (a) hoặc (b) → bỏ setup bounce, chuyển sang theo dõi breakout-retest.
- **OI/funding** (giả thuyết để kiểm): giá chạm hỗ trợ + OI tăng mạnh + funding âm sâu = nhiều short mới → nguy cơ short squeeze (ủng hộ bounce); OI tăng + funding dương cao khi giá rơi vào hỗ trợ = long đòn bẩy đứng trước → nguy cơ thanh lý dây chuyền (chống bounce). Chưa có nguồn chứng minh.
- **Divergence**: chỉ dùng như điều kiện phụ, không cộng điểm khi xu hướng khung 1D mạnh.

### Gaps
- Không tìm thấy nghiên cứu crypto/học thuật nào về: hợp lưu đa khung, tốc độ tiếp cận, OI/funding tại S/R, RSI/MACD divergence tại S/R.
- Thống kê Bulkowski là của thị trường cổ phiếu, bull market, không bình duyệt.

---

## 7. Đề xuất luật thực hành cho hệ Swing 1D/4H (SL ngoài vùng, rủi ro tối đa 2%/lệnh)

### Takeaway
Đề xuất dưới đây là **thiết kế cần backtest**, không phải kết quả đã được chứng minh. Nguyên tắc rút từ bằng chứng: vùng (không phải đường), độ rộng theo ATR, ưu tiên mức đã bật nhiều lần và còn mới, SL đặt xa hơn cụm SL đám đông, kích thước lệnh tính từ khoảng cách SL để rủi ro ≤ 2%.

### Cited Findings
- Định nghĩa S/R là *khoảng* [a, b] chứ không phải một đường giá, độ rộng gắn với bước giá trung bình — [Chung & Bellotti](https://arxiv.org/pdf/2101.07410)
- SL đám đông gom ngay sau số tròn/mức → xuyên mức gây cascade — [SR125](https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr125.pdf)
- Hiệu ứng S/R suy giảm theo thời gian — [Chung & Bellotti](https://arxiv.org/pdf/2101.07410); Osler ≥5 ngày làm việc — [Osler 2000](https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf)
- BTC không còn dự báo được out-of-sample bằng quy tắc kỹ thuật trong Hudson & Urquhart → bắt buộc kiểm out-of-sample — [Hull repository](https://hull-repository.worktribe.com/output/2328042)

### Inferences — bộ luật đề xuất
1. **Phát hiện vùng (khung 1D và 4H)**: swing pivot với N = 3–5 nến mỗi bên. Gộp các pivot cách nhau ≤ 0,5×ATR(14) của khung đó thành một vùng.
2. **Độ rộng vùng**: 0,25–0,5×ATR(14) (biên = min/max các pivot trong cụm, tối đa 0,5×ATR; nếu rộng hơn → chia đôi hoặc bỏ).
3. **Số lần chạm**: tối thiểu 2 lần bật hợp lệ (mỗi lần giá rời vùng ≥ 1×ATR). Cộng điểm đến 4 lần; không cộng thêm sau đó.
4. **Độ mới (recency decay)**: trọng số = exp(−tuổi/τ), gợi ý τ ≈ 60 nến 4H (~10 ngày) hoặc 30 nến 1D; vùng có lần chạm gần nhất cũ hơn 3τ thì loại. (τ phải tối ưu bằng walk-forward — giá trị phút của Chung & Bellotti không chuyển trực tiếp sang 4H.)
5. **Hợp lưu**: +1 nếu trong vùng có số tròn (bội số 1.000 với BTC, 100 với ETH… tùy giá); +1 nếu vùng 4H nằm trong vùng 1D; +1 nếu trùng HVN volume profile 90 ngày. Không cộng Fibonacci.
6. **Xác nhận vào lệnh**: một trong — (a) nến 4H failed-breakdown đóng lại trong vùng, (b) retest-flip sau breakout, (c) pin bar; kèm delta nến ≥ 0 (từ taker_buy_volume). Bỏ qua setup nếu tốc độ tiếp cận v > 2 ATR/3 nến.
7. **Stop-loss**: đặt ngoài biên vùng **+ đệm 0,25–0,5×ATR(14)**, và nếu biên gần một số tròn thì đặt qua số tròn đó thêm đệm (tránh cụm SL đám đông).
8. **Kích thước lệnh**: khối lượng = (2% × vốn) / |giá vào − SL| (tính cả phí và trượt giá dự kiến). Nếu |giá vào − SL| > 2×ATR → bỏ lệnh (R:R kém).
9. **Vô hiệu (invalidation)**: (a) nến 4H **đóng cửa** vượt biên xa của vùng ≥ 0,25×ATR → vùng bị phá, chuyển vai trò (S thành R) và chỉ chờ retest; (b) ≥3 lần chạm với nhịp bật thu hẹp → dừng giao dịch bounce; (c) vùng quá tuổi (mục 4).
10. **Kiểm chứng bắt buộc**: so sánh tỷ lệ bounce và expectancy của vùng mình chọn với **vùng ngẫu nhiên cùng khoảng cách tới giá** (phương pháp của Osler 2000) trên dữ liệu 2020–2026, chia in-sample/out-of-sample theo thời gian. Nếu không vượt ngẫu nhiên → luật không có giá trị.

### Gaps
- Không có nghiên cứu nào cung cấp tham số tối ưu (N pivot, độ rộng ATR, τ) cho crypto 4H/1D; tất cả tham số trên là điểm khởi đầu do người viết đề xuất.
