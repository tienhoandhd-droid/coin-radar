# Mô hình biểu đồ nên lọc lệnh, không phát lệnh

Ngày lập: 19/10/2026. Phạm vi: ứng dụng Coin Radar giao dịch hợp đồng vĩnh cửu USDT (USDT perpetual futures, hợp đồng tương lai không có ngày đáo hạn, ký quỹ bằng USDT) trên Binance, cả Long (mua lên) lẫn Short (bán khống). Có hai chế độ: Swing (xu hướng 1D, vào lệnh 4H, giữ ≤21 ngày) và Lướt nhanh (1H/15m, giữ ≤24 giờ). Báo cáo tổng hợp từ 3 bộ ghi chú nghiên cứu về mô hình biểu đồ, cộng với báo cáo "Bộ nguyên tắc phân tích coin" và bản phản biện của nó. Không chạy thử nghiệm mới.

**Kết luận ngắn: có nên dùng, nhưng với vai trò bộ lọc và nguồn vùng giá, không phải nguồn tín hiệu độc lập. Ở chế độ Lướt nhanh 15m thì gần như không nên dùng.** Không có nghiên cứu bình duyệt (peer-reviewed, đã qua phản biện khoa học) nào chứng minh rằng bất kỳ mô hình biểu đồ (chart pattern, hình dạng giá lặp lại trên biểu đồ như vai-đầu-vai hay tam giác) nào **có lãi trên BTC/ETH sau khi trừ phí**. Bằng chứng học thuật tốt nhất đến từ cổ phiếu Mỹ và ngoại hối. Kết quả ở đó nhất quán: mô hình **mang thông tin thống kê**, nhưng giao dịch theo mô hình một mình thì thường không có lãi, hoặc thua các quy tắc đơn giản hơn như đường trung bình. Riêng crypto, căn cứ đáng kể duy nhất là quy tắc **phá vỡ vùng đi ngang (trading range breakout)** trên giá ngày BTC 2010–2019. Quy tắc này có sức dự báo, mạnh nhất khi thị trường có xu hướng rõ. Kho số liệu lớn nhất về từng mô hình là của Bulkowski, một người hành nghề (practitioner) đo trên cổ phiếu Mỹ. Số liệu này chỉ ra một điểm mâu thuẫn trực tiếp với luật hiện tại của app: khoảng **1/3 số lần phá vỡ không quay lại kiểm tra**, và nhóm đó chạy xa nhất. Vì vậy luật "đặt limit chờ hồi" sẽ lọc bỏ đúng nhóm lệnh tốt nhất. Đề xuất có năm phần. Thứ nhất, chỉ cho phép hình chữ nhật/vùng đi ngang, cờ, tam giác và hai đỉnh/hai đáy phát lệnh ở Swing 4H. Thứ hai, coi vai-đầu-vai và vùng tích lũy nhiều tháng là bối cảnh, bỏ nêm và mô hình mở rộng. Thứ ba, thêm kiểu vào lệnh "đóng cửa phá vỡ" riêng cho mô hình. Thứ tư, sửa luật "sau TP1 dời SL về giá vào" để không bị quét bởi lần kiểm tra lại vốn rất phổ biến. Thứ năm, backtest (kiểm thử trên dữ liệu quá khứ) mọi ngưỡng trước khi bật cho tiền thật. Mọi ngưỡng số trong báo cáo đều là đề xuất, trừ chỗ có nguồn ghi bên cạnh.

## Ba mức căn cứ, và vì sao số liệu Bulkowski không được tính là "bằng chứng"

Mỗi khẳng định trong báo cáo được gắn một nhãn, kèm thị trường mà bằng chứng đến từ đó:

- **[Có bằng chứng · crypto]** và **[Có bằng chứng · cổ phiếu/FX]**: nghiên cứu bình duyệt hoặc working paper (bản thảo nghiên cứu) có phương pháp kiểm định rõ.
- **[Thực hành ngành]**: số liệu hoặc quy tắc của người hành nghề, chưa qua bình duyệt.
- **[Truyền miệng]**: khẳng định lưu hành mà không có nguồn kiểm chứng.
- **[Đề xuất]**: con số do người nghiên cứu tự đặt, chưa backtest.

Ghi chú gốc có chỗ xếp số liệu của Thomas Bulkowski (trang thepatternsite.com) vào nhóm "bằng chứng". Báo cáo này **hạ xuống [Thực hành ngành]** vì bốn lý do. Mô hình do chính tác giả nhận diện bằng mắt, nên dễ thiên lệch chọn mẫu. Mẫu là khoảng 450–850 cổ phiếu Mỹ còn tồn tại, nên có thiên lệch sống sót (survivorship bias: chỉ tính những mã còn sống, bỏ qua mã đã chết). Kết quả đo tới "đỉnh/đáy cuối cùng", không giới hạn thời gian giữ. Và đó là "giao dịch hoàn hảo" trước phí. Chính Bulkowski cảnh báo đừng mong lặp lại kết quả này khi giao dịch thật ([thepatternsite throwbacks](https://www.thepatternsite.com/throwbacks.html); [FailureRates](https://thepatternsite.com/FailureRates.html)). Đặt vào ngôn ngữ GMP: đây là dữ liệu lịch sử của một nhà sản xuất khác, trên một sản phẩm khác. Nó hữu ích để đặt giả thuyết và tiêu chí chấp nhận ban đầu, nhưng **không thay được thẩm định trên chính quy trình của mình**.

Có bốn giới hạn chi phối mọi con số bên dưới. **Một**, không có nghiên cứu bình duyệt nào đo tần suất, tỷ lệ thành công hay biên độ của từng mô hình (hai đỉnh, tam giác, chữ nhật, cờ, nêm, cốc-tay cầm, mở rộng) trên BTC/ETH. **Hai**, số liệu Bulkowski là cổ phiếu chỉ mua, khung ngày, không đòn bẩy, không funding. **Ba**, giới hạn giữ ≤21 ngày và ≤24 giờ làm xác suất chạm mục tiêu **thấp hơn** con số "không giới hạn thời gian" của Bulkowski, nhưng thấp hơn bao nhiêu thì chưa ai đo. **Bốn**, nhiều hiệu ứng kỹ thuật đã yếu dần theo thời gian. Tỷ lệ thất bại của mô hình trên cổ phiếu tăng gấp 2–4 lần từ thập niên 1990 sang 2003–2008 ([FailureRates](https://thepatternsite.com/FailureRates.html)) [Thực hành ngành · cổ phiếu].

## Ba mươi năm nghiên cứu: mô hình có thông tin, nhưng hiếm khi tự kiếm ra tiền

Công trình nền tảng là Lo, Mamaysky & Wang (2000, *Journal of Finance*). Nhóm tác giả nhận diện tự động 10 mô hình trên cổ phiếu Mỹ 1962–1996 bằng kernel regression (hồi quy làm trơn phi tham số, tức làm mượt đường giá trước khi tìm đỉnh/đáy). Danh sách gồm vai-đầu-vai và vai-đầu-vai ngược, hai đỉnh/hai đáy, tam giác, chữ nhật, mở rộng. Kết quả: phân phối lợi suất sau mô hình khác có ý nghĩa thống kê so với bình thường ở **7/10 mô hình trên NYSE/AMEX và 10/10 trên NASDAQ**. Vai-đầu-vai và hai đỉnh/hai đáy là phổ biến nhất, khoảng 1 lần/năm/cổ phiếu. Mô hình cũng xuất hiện nhiều hơn ở **cổ phiếu vốn hóa lớn**. Tuy vậy tác giả **không** khẳng định có lợi nhuận giao dịch, và không tính chi phí ([MIT, Lo](https://web.mit.edu/~alo/www/Papers/techanal.html); [CXO Advisory](https://www.cxoadvisory.com/technical-trading/classic-papers-returns-from-pattern-based-technical-analysis/)) [Có bằng chứng · cổ phiếu].

Khi nhà nghiên cứu chuyển từ câu hỏi "có thông tin không" sang "có kiếm tiền không", kết quả xấu đi:

- **Osler (1998)**, 100 cổ phiếu Mỹ 1962–1993: giao dịch theo vai-đầu-vai lỗ trung bình **−0,24%/lệnh khứ hồi, chưa trừ phí**, giữ khoảng 10 ngày. Hiệu ứng giá biến mất sau khoảng 2 tuần ([CXO Advisory](https://www.cxoadvisory.com/technical-trading/classic-papers-returns-from-pattern-based-technical-analysis/)) [Có bằng chứng · cổ phiếu].
- **Chang & Osler (Fed New York 1995; Economic Journal 1999)**, vai-đầu-vai trên tỷ giá 1973–1994, so với 10.000 chuỗi giá ngẫu nhiên: quy tắc **có lãi nhưng không hiệu quả**, vì đường trung bình và quy tắc lọc đơn giản thắng nó ([IDEAS/RePEc SR4](https://ideas.repec.org/p/fip/fednsr/4.html); [Economic Journal](https://ideas.repec.org/a/ecj/econjl/v109y1999i458p636-61.html)) [Có bằng chứng · FX]. Osler sau đó khuyên chỉ dùng vai-đầu-vai khi không có công cụ tốt hơn ([Traders.com](https://traders.com/Documentation/FEEDbk_docs/2001/06/Abstracts_new/Interview/Interview.html)).
- **Savin, Weller & Zvingelis (2007)**: bán khống chỉ dựa vào vai-đầu-vai **không có lãi** trên S&P 500 giai đoạn 1990–1999. Nhưng khi dùng mô hình làm **điều kiện bổ sung**, lợi suất vượt trội đã điều chỉnh rủi ro đạt **5–7%/năm**. Một phần hiệu ứng đến từ việc mô hình "chọn trúng" cổ phiếu có đà giảm sẵn ([IDEAS/RePEc](https://ideas.repec.org/a/oup/jfinec/v5yi2p243-265.html); [CXO](https://www.cxoadvisory.com/technical-trading/testing-the-head-and-shoulders-pattern/)) [Có bằng chứng · cổ phiếu].
- **Chong & Poon (2017)**: lọc vai-đầu-vai theo vị trí so với đường trung bình 150/250 ngày thì cải thiện lợi suất điều chỉnh rủi ro ([IDEAS/RePEc](https://ideas.repec.org/a/bpj/sndecm/v21y2017i5p18n1.html)) [Có bằng chứng · cổ phiếu].

Bức tranh crypto mỏng hơn nhiều, và cần đọc từng nguồn theo đúng tầm vóc của nó:

| Nghiên cứu crypto | Phát hiện | Vì sao chưa đủ để tin |
|---|---|---|
| Gerritsen et al. 2020, *Finance Research Letters* — BTC giá ngày 2010–2019 | Phá vỡ vùng đi ngang có sức dự báo, Sharpe (lợi nhuận trên mỗi đơn vị rủi ro) vượt mua-giữ, mạnh nhất khi xu hướng rõ ([Utrecht](https://research-portal.uu.nl/en/publications/the-profitability-of-technical-trading-rules-in-the-bitcoin-marke/)) | Khung ngày, giao ngay (spot), trước thời kỳ ETF và perp chiếm ưu thế. **Đây là căn cứ crypto tốt nhất cho bất kỳ "mô hình" nào** [Có bằng chứng · crypto] |
| Rink 2025, *Financial Innovation* — dữ liệu giao dịch thật của trader Mt.Gox | Lệnh đặt khi có tín hiệu mua theo mô hình có lợi suất cao hơn; trader dùng mô hình nhiều hơn thì lãi hơn ([Springer](https://link.springer.com/article/10.1186/s40854-025-00763-2)) | Thị trường BTC 2011–2014 kém hiệu quả hơn nhiều. Toàn văn bị chặn nên chưa có số liệu theo từng mô hình [Có bằng chứng · crypto, giai đoạn sơ khai] |
| Working paper Đại học New Mexico | Vai-đầu-vai, vai-đầu-vai ngược, đáy tam giác có lãi trong mẫu ([UNM](https://www.math.unm.edu/~gzhang12/paper/bitcoin03.pdf)) | **Chỉ một tháng dữ liệu**, chính tác giả nói cần kỳ dài hơn. Không dùng làm căn cứ |
| arXiv 2605.00875 (2026) — mạng nơ-ron CNN đọc ảnh nến ngày, nhãn "tăng >2% trong 7 ngày" | BTC AUC 0,734 (AUC: thước đo phân loại, 0,5 = đoán bừa), **ETH 0,492**, cổ phiếu SPY 0,459 ([arXiv](https://arxiv.org/html/2605.00875)) | 500 mẫu mỗi tài sản, số liệu không khớp giữa các bảng, không backtest, không phí. Chỉ là giả thuyết [Có bằng chứng · crypto, thiết kế yếu] |
| Nghiên cứu 2026, *Int. Review of Economics & Finance* — mô hình nến 1H, khoảng 2.000 cặp crypto | Chỉ **số ít** mô hình đảo chiều có sức dự báo ([ScienceDirect](https://sciencedirect.com/science/article/pii/S1059056026002716)) | Đây là mô hình nến, không phải mô hình hình học. Nhưng nó cho thấy khung giờ ở crypto không có lợi thế phổ quát [Có bằng chứng · crypto] |

Các con số kiểu "vai-đầu-vai thành công 82%" hay "tỷ lệ thất bại crypto 20–30%" trên trang giáo dục của các sàn đều không dẫn nghiên cứu nào ([Altrady](https://www.altrady.com/crypto-trading/technical-analysis/reversal-patterns-head-and-shoulders); [altFINS](https://altfins.com/knowledge-base/chart-patterns-2/)) [Truyền miệng]. Không được dùng.

Đặt các mảnh lại với nhau, có một kết luận mà ba nhóm tác giả độc lập (Lo, Chang & Osler, Savin) cùng đi tới: **mô hình làm thay đổi xác suất, nên hợp làm bộ lọc trên một hệ đã có lợi thế**. Hệ đó với Coin Radar là lọc xu hướng và động lượng 1–4 tuần. Mô hình không nên là nguồn sinh lệnh riêng. Riêng ETH, bằng chứng còn yếu hơn BTC: ở nghiên cứu CNN, ETH chỉ ngang đoán bừa. Không có lý do để giả định mô hình trên ETH "sạch" như trên BTC.

## Bulkowski cho thấy lệnh tốt nhất là lệnh không chờ hồi

Ba thuật ngữ cần nắm trước. **Throwback** là lần giá quay xuống kiểm tra lại mức vừa phá, sau khi đã phá lên. **Pullback** là trường hợp ngược lại, quay lên kiểm tra sau khi đã phá xuống. Cả hai gọi chung là **retest**. **Measured move** là mục tiêu đo: lấy chiều cao mô hình chiếu từ điểm phá vỡ.

Toàn bộ phần này là [Thực hành ngành · cổ phiếu Mỹ, khung ngày]. Không có số liệu tương đương cho crypto, hay cho khung 4H/1H/15m.

**Retest phổ biến, nhưng không phải lúc nào cũng có.** Trong nghiên cứu lớn nhất (12.711 mô hình, 463 cổ phiếu, 1992–2020), 8.333 mô hình có throwback. Tức khoảng **66% có retest và khoảng 34% không** ([thepatternsite throwbacks](https://www.thepatternsite.com/throwbacks.html)). Các trang riêng cho từng mô hình cho con số tương tự:

- Vai-đầu-vai đỉnh: pullback 68%.
- Tam giác tăng: 63–64%.
- Hai đáy: 67%.
- Cốc-tay cầm: 62%.

Nguồn: [hst](https://thepatternsite.com/hst.html); [at](https://thepatternsite.com/at.html); [aadb](https://thepatternsite.com/aadb.html); [cup](https://thepatternsite.com/cup.html). Một con số khác hay được trích là 58% trên 10.305 mô hình. Con số này chỉ lấy được qua tóm tắt tìm kiếm, chưa tải được trang gốc, nên báo cáo dùng dải **58–68%**.

**Retest làm hại kết quả, và retest càng sâu càng hại.** Bulkowski tự viết rằng pullback "hurt post breakout performance" ([hst](https://thepatternsite.com/hst.html)). Đo cụ thể ([PartialRisesDeclinesThrowsPulls](https://thepatternsite.com/PartialRisesDeclinesThrowsPulls.html)):

- Throwback dừng **trên** đáy của nến phá vỡ: tăng trung bình **41,3%**.
- Throwback hồi **trọn** qua đáy nến phá vỡ: chỉ **26,7%**.
- Với pullback (phá xuống): 25,1% so với 17,3%.

Có một con số "97% trường hợp kết quả tốt hơn khi không có throwback". Một bộ ghi chú dẫn nó từ trang gốc, bộ kia chỉ thấy nó trên một script TradingView. Báo cáo coi con số này là **chưa xác minh chắc**.

**So sánh trực tiếp các cách vào lệnh nghiêng hẳn về "vào ngay khi đóng cửa vượt mô hình".** Bulkowski thử ba cách vào lệnh trên 11 loại mô hình **đã có throwback** (cổ phiếu, khung ngày, 1991–2012), với cắt lỗ cố định tính theo % chiều cao mô hình:

| Cách vào lệnh | Lãi ròng trung bình | Tỷ lệ thắng | Bị dừng lỗ |
|---|---|---|---|
| (1) Ngay khi đóng cửa vượt mô hình | 3.622 USD | 89% | 10% |
| (2) Khi đóng cửa vượt đỉnh của nhịp throwback | 2.925 USD | 83% | 14% |
| (3) Khi vượt một đỉnh nhỏ | 3.118 USD | 84% | 14% |

Nguồn: [ThrowbackEntry](https://thepatternsite.com/ThrowbackEntry.html). Kết luận của tác giả là cách (1) "wins hands down in every category". Điểm đáng chú ý: ngay cả trên những mô hình **có** hồi lại, vào sớm vẫn thắng, vì cắt lỗ đặt sau mô hình đủ rộng để chịu được nhịp hồi. Với trailing stop (cắt lỗ dời theo giá), lợi nhuận gần như giảm một nửa và khoảng 42% lệnh bị dừng. Cần lưu ý một giới hạn: nghiên cứu này **không** so với lệnh limit đặt sẵn tại mức phá. Vì vậy với câu hỏi của Coin Radar, đây là bằng chứng gián tiếp. Vào sớm hơn khi chưa xác nhận lại tệ hơn hẳn: mua hai đáy trước khi giá đóng cửa vượt đỉnh giữa thì **48%** trường hợp giá tiếp tục giảm ([aadb](https://thepatternsite.com/aadb.html)).

**Khối lượng cao lúc phá vỡ không giúp gì, thậm chí ngược lại.** Nghiên cứu khoảng 8.000 mô hình 1991–2011 so sánh hai nhóm phá vỡ ([VolumeStudy](https://thepatternsite.com/VolumeStudy.html)):

| Chỉ số | Volume cao | Volume thấp |
|---|---|---|
| Mức tăng trung bình (phá lên) | 37,6% | 35,8% |
| Thất bại (phá lên) | 14% | 5% |
| Thất bại (phá xuống) | 28% | 11% |
| Có throwback | 57% | 18% |

Tức là volume cao làm thất bại nhiều hơn và retest nhiều hơn, còn mức tăng gần như không khác. Ở chiều học thuật, Osler (1998) thấy volume tăng khoảng 11% vào ngày phá neckline (đường cổ) của vai-đầu-vai, nhưng giao dịch vẫn không có lãi [Có bằng chứng · cổ phiếu]. Volume crypto còn bị nhiễu bởi giao dịch giả (wash trading) và phân mảnh giữa các sàn. Vì vậy **không nên bắt buộc "phá vỡ kèm volume lớn"**. Có thể dùng volume theo chiều ngược lại, để **dự kiến** xác suất retest.

**Mục tiêu đo chỉ đạt khoảng một nửa đến ba phần tư số lần.** Bulkowski tính tỷ lệ đạt mục tiêu theo sách giáo khoa, trong thị trường giá lên, không giới hạn thời gian:

| Mô hình | Đạt mục tiêu | Thất bại hòa vốn | Biến động trung bình | Nguồn |
|---|---|---|---|---|
| Vai-đầu-vai đỉnh | **51%** | 19% | −16% | [hst](https://thepatternsite.com/hst.html) |
| Vai-đầu-vai phức hợp | 47% | — | — | [chst](https://thepatternsite.com/chst.html) |
| Tam giác tăng | 70% (phá lên) / 44% (phá xuống) | 17% / 38% | +43% / −13% | [at](https://thepatternsite.com/at.html) |
| Hai đáy (Adam & Adam) | 73% | 16% | +39% | [aadb](https://thepatternsite.com/aadb.html) |
| Hai đỉnh (Adam & Adam) | — | 25% | −15% | [aadt](https://thepatternsite.com/aadt.html) |
| Cờ | **46%** | **44–45%** | +9% / −8% | [flags](https://thepatternsite.com/flags.html) |
| Cờ cao và chặt (high and tight flag) | 82% với mục tiêu bằng **nửa** chiều cao | — | +39% | [htf](https://thepatternsite.com/htf.html) |
| Cốc-tay cầm | 61% | 5% | +54% | [cup](https://thepatternsite.com/cup.html) |
| Tam giác cân | — | 25% (lên) / 37% (xuống) | — | [st](https://thepatternsite.com/st.html) |
| Tam giác giảm | — | 22% / 23% | — | [dt](https://thepatternsite.com/dt.html) |

Bulkowski xử lý việc này bằng cách nhân chiều cao với tỷ lệ đạt mục tiêu ("mục tiêu rút gọn"). Ngoài ra, mô hình **cao** (chiều cao so với giá lớn hơn trung vị) chạy xa hơn mô hình thấp ở 89% trường hợp phá lên và 100% trường hợp phá xuống ([TradingQuiz](https://thepatternsite.com/TradingQuiz.html)). Cần chú ý rằng số liệu "vai-đầu-vai đạt mục tiêu" từng được trích là 83% (bản sách 2005) và 55% (bài báo cũ), nay trang gốc ghi 51% ([BNN Bloomberg](https://www.bnnbloomberg.ca/talent/larry-berman-deconstructing-the-head-and-shoulders-trend-1.490532.amp.html)). Số liệu practitioner dao động mạnh giữa các phiên bản, nên càng không thể dùng làm hằng số.

**Phá xuống thất bại nhiều hơn phá lên, nhất là khi thị trường chuyển pha.** Tính theo ngưỡng "không đi được 10%":

- Phá lên thất bại 14% (thập niên 1990), tăng lên 28% (2003–2007).
- Phá xuống thất bại 26%, tăng lên 49%.
- Riêng năm 2003, khi thị trường giá xuống kết thúc, tỷ lệ thất bại của phá xuống nhảy từ 15% lên 48%.

Bulkowski khuyên không bán khống khi thị trường giá xuống sắp kết thúc ([FailureRates](https://thepatternsite.com/FailureRates.html)). Với một app có Short, đây là cảnh báo đáng giá nhất của phần này. Mô hình đảo chiều phía bán (vai-đầu-vai đỉnh, hai đỉnh) cần cổng chặt hơn mô hình phía mua.

**Mô hình thất bại cũng là một tín hiệu.** Bulkowski gọi là busted pattern: mô hình phá vỡ, đi không quá 10%, rồi quay đầu phá theo hướng ngược lại. Hiện tượng này xảy ra khoảng 19% ([Busted](https://www.thepatternsite.com/Busted.html)). Sau khi "bust", mức chạy theo hướng ngược thường **lớn hơn** mô hình bình thường, ví dụ:

- Tam giác giảm: 38% lên 54%.
- Tam giác cân: 34% lên 52%.

Nguồn: [BustedPatterns](https://www.thepatternsite.com/BustedPatterns.html) [Thực hành ngành · cổ phiếu]. Với futures hai chiều, đây là ứng viên tín hiệu thứ cấp **đáng backtest**, chưa đáng bật ngay.

## Máy chỉ được nhìn đỉnh/đáy đã xác nhận

Cả hai nghiên cứu học thuật chuẩn định nghĩa mô hình **hoàn toàn bằng chuỗi 5 đỉnh/đáy luân phiên** cộng với dung sai. Ví dụ vai-đầu-vai theo Lo et al. đòi bốn điều kiện:

- Đầu cao hơn hai vai.
- Hai vai nằm trong 1,5% quanh trung bình của chúng.
- Hai "nách" (hai đáy giữa vai và đầu) cũng nằm trong 1,5%.
- Hai đỉnh của mô hình hai đỉnh cách nhau hơn 22 ngày giao dịch.

Nguồn: [LMW toàn văn](https://www.cis.upenn.edu/~mkearns/teaching/cis700/lo.pdf) [Có bằng chứng · cổ phiếu]. Savin et al. nới dung sai vai lên 4% và thêm "các ràng buộc Bulkowski": chiều cao vai bằng 0,25–0,7 chiều cao đầu, đầu cao hơn neckline ít nhất 3%, lệch thời gian không quá 1,2 lần khoảng trung bình. Họ chỉ vào lệnh **sau khi** đã có một đáy mới dưới neckline ([MPRA 60825](https://mpra.ub.uni-muenchen.de/60825/1/MPRA_paper_60825.pdf)). Chiều của các bất đẳng thức này được đọc qua bảng trích lại, chưa đối chiếu với bản gốc.

Điều quan trọng cho Coin Radar là cách hai nghiên cứu này tránh look-ahead (nhìn trước tương lai, tức vô tình dùng dữ liệu chưa có tại thời điểm ra quyết định). Lo et al. chỉ "phát hiện" mô hình sau khi điểm cực trị cuối đã qua **3 ngày**, và tính lợi suất từ sau mốc đó. Cách này đúng như cơ chế pivot (đỉnh/đáy cục bộ) xác nhận N=3 nến mà app đã có. Mã nguồn mở neurotrader888 (giấy phép MIT, có sẵn dữ liệu mẫu BTCUSDT 1h/1D) xác nhận đỉnh tại nến i−order chỉ khi đã có đủ `order` nến bên phải. Đường xu hướng của cờ được vẽ trên dữ liệu **không gồm** nến đang xét ([rolling_window.py](https://raw.githubusercontent.com/neurotrader888/TechnicalAnalysisAutomation/main/rolling_window.py); [flags_pennants.py](https://raw.githubusercontent.com/neurotrader888/TechnicalAnalysisAutomation/main/flags_pennants.py)) [Thực hành ngành]. Thư viện Trendoscope trên TradingView khuyên đặt `offset = 1` để quét không repaint (repaint: tín hiệu đã vẽ bị thay đổi về sau) ([TradingView](https://in.tradingview.com/script/OuVJr45r-chartpatterns)). TA-Lib, thư viện chỉ báo phổ biến, **không có** bộ nhận diện mô hình biểu đồ nào, chỉ có 61 hàm mô hình nến ([ta-lib.org](https://ta-lib.org/functions/)). Coin Radar phải tự viết phần này bằng TypeScript.

Có ba điều chỉnh cần làm để chuyển định nghĩa sang crypto.

**Một, đổi dung sai từ phần trăm sang bội số ATR** (Average True Range: biên độ dao động thực trung bình 14 nến). Mức 1,5% được hiệu chỉnh cho cổ phiếu Mỹ khung ngày. Trên nến 15m của BTC, 1,5% là một khoảng rất rộng so với dao động thông thường. Trên nến 1D, nó lại chỉ là một phần nhỏ của một ngày dao động. Đây là suy luận, chưa có số đo ATR% của BTC/ETH trong nguồn đã đọc, nên phải tự tính từ dữ liệu Binance.

**Hai, thay bước làm trơn bằng bộ lọc biên độ.** Lo et al. dùng kernel regression để loại các cực trị "quá cục bộ", vì cách so sánh nến kề nhau sinh ra quá nhiều đỉnh/đáy. Bỏ các pivot có biên độ swing nhỏ hơn k×ATR cũng làm được việc đó, và rẻ hơn 2–3 bậc độ lớn.

**Ba, ghi lịch sử theo kiểu hồ sơ lô.** Lưu ảnh chụp tại mỗi lần chuyển trạng thái, không sửa đè. Khi một pivot ứng viên bị thay bằng pivot tốt hơn, đóng bản ghi cũ là "vô hiệu" rồi tạo bản mới.

Về chi phí tính toán: ước tính cho 500 hợp đồng × 4 khung × 500 nến cỡ dưới một giây trong V8. Con số này **chưa đo trên máy**. Nút thắt thực tế là tải dữ liệu qua API.

## BTC/ETH ít biến động: đo bằng ATR, lọc bằng xu hướng, tránh khung 15m

Câu hỏi "BTC/ETH ít biến động thì mô hình có đáng tin hơn không" chưa có câu trả lời trực tiếp cho crypto. Có bốn manh mối.

**Manh mối 1: mô hình phổ biến hơn ở tài sản lớn.** Lo et al. thấy mô hình xuất hiện nhiều hơn ở cổ phiếu vốn hóa lớn [Có bằng chứng · cổ phiếu]. Suy ra BTC/ETH có lẽ sinh nhiều mô hình "sạch" hơn altcoin nhỏ, nhưng điều này chưa được kiểm trên crypto.

**Manh mối 2: phá vỡ hiệu quả nhất khi thuận xu hướng mạnh.** Đây là điểm chung của Gerritsen et al. (phá vỡ vùng đi ngang BTC mạnh nhất khi xu hướng rõ) [Có bằng chứng · crypto] và Savin et al. (vai-đầu-vai tốt hơn trên cổ phiếu có đà giảm sẵn) [Có bằng chứng · cổ phiếu]. Kiến trúc "khung lớn lọc khung vào lệnh" của Coin Radar đã khớp với điều này.

**Manh mối 3: mô hình cao chạy xa hơn.** Phát hiện này **ngược** với niềm tin "càng co hẹp càng bùng nổ" [Thực hành ngành · cổ phiếu]. Với BTC/ETH, mô hình nhỏ so với ATR sẽ có mục tiêu quá gần so với nhiễu và phí. Vì vậy cần một ngưỡng chiều cao tối thiểu tính theo ATR.

**Manh mối 4: không có căn cứ cho co hẹp biến động.** Đây là các chỉ báo đo độ "nén" của giá:

- Bollinger squeeze: dải Bollinger co hẹp.
- NR7 (Crabel): nến có biên độ hẹp nhất trong 7 phiên.
- VCP (volatility contraction pattern): mô hình co hẹp biến động.

Chưa có backtest đáng tin nào có tính phí. QuantifiedStrategies thử nhiều biến thể Bollinger squeeze trên cổ phiếu và **không biến thể nào hiệu quả** ([QuantifiedStrategies](https://www.quantifiedstrategies.com/bollinger-band-squeeze-strategy/)) [Thực hành ngành · cổ phiếu]. Một blog báo BTC/USDT 4H tỷ lệ thắng 48%, hệ số lợi nhuận 1,61 trên 85 lệnh, nhưng không mô tả phương pháp ([Stratbase](https://stratbase.ai/en/blog/bollinger-bands-strategy-guide)) [Truyền miệng]. Bollinger còn tự cảnh báo về "head fake" (cú phá giả ngược chiều trước khi đi thật) sau squeeze ([LuxAlgo](https://www.luxalgo.com/library/concept/bollinger-squeeze/)).

**Khung thời gian là chỗ phải nói thẳng nhất.** Không có nghiên cứu nào so sánh độ tin cậy của mô hình giữa 15m, 1H, 4H và 1D trên crypto. Có hai bằng chứng gián tiếp cùng chỉ một hướng. Thứ nhất, mô hình nến 1H trên khoảng 2.000 cặp crypto chỉ có số ít mô hình dự báo được ([ScienceDirect 2026](https://sciencedirect.com/science/article/pii/S1059056026002716)). Thứ hai, báo cáo trước đã dẫn một preprint (bản thảo chưa phản biện) cho thấy lợi thế đảo chiều 15 phút trên Binance chỉ khoảng 1,3 bp mỗi lệnh (bp: basis point, 0,01%), trong khi phí khứ hồi khoảng 5 bp ([arXiv 2608.21888](https://arxiv.org/pdf/2608.21888)) [Có bằng chứng · crypto, preprint].

Phép tính minh họa sau cho thấy vì sao khung nhỏ trên coin ít biến động bị phí ăn mòn. Gọi R là khoảng cách từ giá vào tới cắt lỗ. Nếu R chỉ bằng 0,4% giá, thì riêng phí taker khứ hồi 0,05% đã bằng **0,125R mỗi lệnh**, chưa tính trượt giá. Nếu R = 2% thì phí chỉ còn 0,025R. Mô hình 15m trên BTC thường có chiều cao nhỏ, nên R và mục tiêu đều nhỏ. Phí chiếm phần lớn kỳ vọng.

Về thanh khoản, giới hạn danh sách vào BTC, ETH và nhóm perp lớn. Lý do: mô hình được định nghĩa bằng các mức giá chính xác, mà coin mỏng thì râu nến dễ phá giả. Đây là suy luận, không có số liệu.

## Futures khuếch đại phá vỡ giả: thanh lý, funding, số tròn

Mọi số liệu về mô hình ở trên đều đến từ thị trường **không đòn bẩy**. Trên hợp đồng vĩnh cửu, một cú phá vỡ có thể không phải do người mua mới, mà do **vị thế đòn bẩy bị buộc đóng** (thanh lý, liquidation).

Ví dụ rõ nhất là tháng 10/2025:

- **2,3 tỷ USD bị thanh lý trong một ngày, 86% là vị thế Long** ([Amberdata](https://blog.amberdata.io/leverage-liquidations-the-31b-deleveraging)) [Thực hành ngành · crypto].
- Open interest (OI, tổng giá trị hợp đồng đang mở) giảm 35% từ đỉnh, từ 94 xuống 61 tỷ USD ([CoinChange](https://www.coinchange.io/blog/bitcoins-2-billion-reckoning-how-novembers-liquidations-cascade-exposed-cryptos-structural-fragilities)).
- Độ sâu sổ lệnh sát giá của BTC mất hơn 90% ([FTI Consulting](https://fticonsulting.com/insights/articles/crypto-crash-october-2025-leverage-met-liquidity)).
- Một số altcoin rơi về gần 0 **chỉ trên Binance** ([Cointelegraph](https://cointelegraph.com/markets/why-did-some-altcoins-on-binance-crash-to-zero)).

Sau khi vị thế bị xả hết và funding (phí cấp vốn định kỳ giữa phe Long và Short) trở về bình thường, giá thường cân bằng lại ([CoinChange](https://www.coinchange.io/blog/bitcoins-2-billion-reckoning-how-novembers-liquidations-cascade-exposed-cryptos-structural-fragilities)) [Thực hành ngành]. Hệ quả cho mô hình: **một nến phá vỡ đi kèm OI giảm mạnh là "quét thanh lý", dễ bị bust**. Một nến phá vỡ kèm OI tăng và lệnh chủ động (taker) cùng chiều thì giống dòng tiền thật hơn. Đây là suy luận từ cơ chế, chưa có nghiên cứu. Có một chi tiết làm dịu bớt nỗi lo: chuỗi thanh lý 10/2025 tự khuếch đại khá yếu, hệ số phân nhánh (mỗi lần thanh lý kéo theo bao nhiêu lần khác) chỉ khoảng 0,1–0,2 ([arXiv 2608.03616](https://ideas.repec.org/p/arx/papers/2608.03616.html)). Perp chiếm khoảng 68% khối lượng BTC năm 2025 theo Kaiko, trích qua [Amberdata](https://blog.amberdata.io/leverage-liquidations-the-31b-deleveraging) [Thực hành ngành · nguồn thứ cấp]. Nghĩa là phần lớn "cú phá" mà biểu đồ ghi nhận diễn ra trong chính thị trường đòn bẩy.

Rủi ro thứ hai là **dừng lỗ tụ quanh số tròn**. Trên ngoại hối, lệnh chốt lời tụ đúng tại số tròn, còn lệnh dừng lỗ tụ ngay **sau** số tròn. Khi giá chạm vùng dừng lỗ tụ, xu hướng tăng tốc bất thường ([Osler, NY Fed SR150](https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr150.html); [econpapers](https://econpapers.repec.org/RePEc:fip:fednsr:125)) [Có bằng chứng · FX, gián tiếp]. Giá BTC cũng tụ ở số tròn: hơn 10% giá kết thúc bằng 00 ([Urquhart 2017](https://ideas.repec.org/a/eee/ecolet/v159y2017icp145-148.html)) [Có bằng chứng · crypto]. Khi biên mô hình trùng số tròn lớn (ví dụ 100.000 USD), cả điểm phá lẫn điểm cắt lỗ đều nằm đúng chỗ dễ bị quét. Áp hiệu ứng FX sang crypto là suy luận.

Rủi ro thứ ba là **funding**. Funding cao kéo dài (trên khoảng 15%/năm quy đổi) từng đi trước các đợt điều chỉnh ([Amberdata](https://blog.amberdata.io/leverage-liquidations-the-31b-deleveraging)) [Thực hành ngành, chưa kiểm định]. Nhưng vị thế basis lớn (chênh lệch giá giao ngay và phái sinh, ví dụ của Ethena) kéo funding thấp một cách nhân tạo, làm nó kém tin cậy làm tín hiệu cảnh báo ([CoinChange](https://www.coinchange.io/blog/bitcoins-2-billion-reckoning-how-novembers-liquidations-cascade-exposed-cryptos-structural-fragilities)). Với lệnh Swing giữ tới 21 ngày, funding còn là **chi phí giữ lệnh** cần trừ vào R trong backtest. Chưa có số liệu sẵn, nên phải tính từ lịch sử funding thực của Binance.

Rủi ro thứ tư là **chiều Short**. Phá xuống thất bại gần gấp đôi phá lên trên cổ phiếu, và bùng lên khi thị trường giá xuống kết thúc ([FailureRates](https://thepatternsite.com/FailureRates.html)) [Thực hành ngành · cổ phiếu]. Trong crypto, các cú ép Short (short squeeze) cộng thêm rủi ro này. Lập luận "bust phá xuống đáng trade vì đà tăng không giới hạn" của Bulkowski dựa trên cổ phiếu chỉ mua, nên yếu đi khi áp vào futures hai chiều.

---

## Đề xuất áp dụng cho Coin Radar

Mọi con số dưới đây là **[Đề xuất]**, trừ chỗ có nguồn. Nguyên tắc chung: mô hình chỉ **bổ sung** cho hệ hiện có. Hệ đó gồm cổng xu hướng khung lớn, vùng hỗ trợ/kháng cự từ pivot đã xác nhận (pivot N=3, gom vùng 0,5×ATR), thang chốt lời 50/30/20 và các cờ rủi ro phái sinh. Mô hình không thay thế phần nào trong số đó. Quyết định chỉ được tính lại khi nến khung vào lệnh đóng, theo khuyến nghị của bản phản biện.

### (1) Bảng áp dụng từng mô hình

| Mô hình | Quyết định | Khung | Điều kiện | Căn cứ chính |
|---|---|---|---|---|
| Chữ nhật / vùng đi ngang (rectangle / range) | **Dùng** | Swing: nhận diện 4H, xác nhận đóng nến 4H. Lướt nhanh: 1H, chỉ chế độ ẩn | Phá vỡ **thuận** xu hướng 1D (Swing) / 1H (Lướt). Chiều cao ≥3×ATR khung nhận diện. Biên trùng vùng S/R sẵn có | Gerritsen 2020 [Có bằng chứng · crypto]; Lo 2000 [Có bằng chứng · cổ phiếu] |
| Cờ / cờ đuôi nheo (flag / pennant) | **Dùng có điều kiện** | Swing 4H. Lướt 1H (15m chỉ khi cờ trùng vùng S/R 1H), chế độ ẩn | Thuận xu hướng. Cờ "chặt". TP1 ≥1,5R vì thất bại hòa vốn 44–45% | Bulkowski flags [Thực hành ngành · cổ phiếu]; không có số liệu crypto |
| Tam giác tăng / giảm / cân (triangle) | **Dùng có điều kiện** | Swing 4H (1D nếu đủ dài). Lướt: không | Thuận xu hướng 1D. Phá vỡ trong khoảng 50–80% quãng đường tới đỉnh tam giác. Tam giác cân phá xuống trong thị trường giá lên → không Short | Bulkowski at/st/dt [Thực hành ngành]; Lo 2000 |
| Hai đỉnh / hai đáy (double top / bottom) | **Dùng có điều kiện** | Swing 4H/1D. Lướt: chỉ bối cảnh | Hai đáy (Long): khi 1D không còn giảm. Hai đỉnh (Short): chỉ khi 1D đã gãy xu hướng tăng (ví dụ đóng dưới MA ngắn–trung) và **không** trong giai đoạn vừa thoát thị trường giá xuống | Lo 2000; Bulkowski aadb/aadt; FailureRates (phá xuống thất bại nhiều) |
| Ba đỉnh / ba đáy | Gộp vào **chữ nhật** | Như chữ nhật | — | Chưa có định nghĩa thuật toán đã công bố |
| Vai-đầu-vai / vai-đầu-vai ngược | **Chỉ làm bối cảnh** (cờ cảnh báo đảo chiều, chặn lệnh ngược). Cân nhắc bật lệnh sau backtest | 4H/1D | Bộ lọc vị trí xu hướng (Chong–Poon). Không giao dịch độc lập ở 15m/1H | Osler 1998 lỗ; Savin 2007 short độc lập không lãi, có điều kiện thì có [Có bằng chứng · cổ phiếu/FX] |
| Cốc-tay cầm (cup and handle) | **Chỉ bối cảnh**, hoặc Long hạn chế ở 1D | 1D | Cốc 7–65 tuần thường dài hơn tầm nhìn của app. Nếu dùng: phá mép phải trên 1D, cắt lỗ dưới đáy tay cầm | Bulkowski cup [Thực hành ngành] |
| Nêm tăng / giảm (wedge) | **Không dùng** làm lệnh, chỉ gắn nhãn | — | Không có định nghĩa số có nguồn, không lấy được thống kê | Không có |
| Mô hình mở rộng (broadening) | **Không dùng** | — | Biên nở dần làm cắt lỗ xa và nhiễu. Có định nghĩa (Lo 2000) nhưng không có số liệu giao dịch | Lo 2000 (chỉ thông tin) |
| Vùng tích lũy / phân phối nhiều tháng (1D/1W) | **Chỉ bối cảnh và nguồn vùng S/R** | 1D/1W | (a) Đặt thiên hướng Long/Short. (b) Cấm Long ngay dưới biên trên chưa phá, cấm Short ngay trên biên dưới. (c) Khi phá biên được xác nhận bằng nến 1D, ưu tiên tín hiệu 4H thuận chiều. **Không** vào lệnh trực tiếp vì cắt lỗ ở biên đối diện quá xa so với 21 ngày | Brandt, ví dụ BTC 2024 [Thực hành ngành, giai thoại] |
| Nén biến động (squeeze, NR7, ATR co) | **Chỉ cờ "coil"** (điểm cộng nhỏ, báo riêng) | Mọi khung | Không bao giờ là điều kiện bắt buộc hay tín hiệu độc lập | QuantifiedStrategies âm [Thực hành ngành]; blog BTC [Truyền miệng] |
| Mô hình thất bại (busted) | **Ghi sổ, chưa phát lệnh** | 4H | Chỉ ghi nhận khi giá chạm biên đối diện sau một lần "failed" | BustedPatterns [Thực hành ngành · cổ phiếu] |

Toàn bộ chế độ Lướt nhanh dùng mô hình phải chạy **ẩn** (vẫn ghi sổ forward, giao diện không hiện lệnh). Điều kiện bật lại giữ như bản phản biện đã đề xuất: ≥100 lệnh, expectancy (kỳ vọng lãi/lỗ trung bình mỗi lệnh tính bằng R) sau phí >0,1R, cận dưới khoảng tin cậy >0.

### (2) Quy tắc nhận diện để lập trình

**Ký hiệu.** A = ATR(14) của khung nhận diện, lấy **tại nến đóng gần nhất lúc đánh giá**, không dùng giá trị về sau. P1…Pn = pivot đã xác nhận (đủ 3 nến bên phải), luân phiên đỉnh/đáy. "Đường phá" (breakout line) là giá trị của biên mô hình **tại nến đang xét**; nếu biên nghiêng thì tính theo đường kéo dài. Chỉ dùng nến đã đóng. Nến 15m đang chạy bị loại khỏi mọi phép tính.

**Lọc pivot chung.**

- Chỉ giữ pivot có biên độ swing so với pivot ngược chiều trước đó ≥1,0×A (15m/1H) hoặc ≥0,75×A (4H/1D).
- Nếu sau khi lọc có hai pivot cùng loại đứng liền nhau, giữ cái cực hơn, để chuỗi luôn luân phiên như Lo et al.
- Hai mức "bằng nhau" khi nằm cùng một vùng S/R theo bộ gom vùng sẵn có (≤0,5×A).

| Mô hình | Chuỗi pivot và hình học | Dung sai / tỷ lệ | Thời lượng | Đường phá | Cắt lỗ (trước đệm) | Chiều cao h |
|---|---|---|---|---|---|---|
| Vai-đầu-vai đỉnh (ngược: lật dấu) | Đỉnh–đáy–đỉnh–đáy–đỉnh, P3 > P1 và P3 > P5 (Lo) | Hai vai lệch ≤0,75×A; hai nách lệch ≤0,75×A hoặc độ dốc neckline ≤0,1×A/nến. Vai cao 0,25–0,7 lần đầu (Savin). Đầu − neckline ≥1,5×A. Thời gian vai→đầu mỗi bên ≤2,5 lần bên kia (neurotrader). ≥3/5 pivot ở phía đúng của EMA200 (phỏng Chong–Poon) | 15–120 nến | Neckline nối P2–P4 | Trên vai phải (P5) | Đầu − neckline tại thời điểm đầu |
| Hai đỉnh (hai đáy: lật dấu) | Đỉnh–đáy–đỉnh | Hai đỉnh lệch ≤ min(0,5×A; 3% giá) (Bulkowski <3%). Đáy giữa sâu ≥2,5×A | Hai đỉnh cách ≥10 nến (Lo: >22 ngày trên khung ngày) | Đáy giữa P2 | Trên đỉnh cao hơn | Đỉnh cao hơn − P2 |
| Chữ nhật / ba đỉnh, ba đáy | Các đỉnh trong một vùng kháng cự, các đáy trong một vùng hỗ trợ | ≥2 chạm mỗi biên (ba đỉnh/ba đáy: ≥3). h ≥3×A. Đỉnh thấp nhất > đáy cao nhất (Lo) | ≥20 nến | Biên bị phá | Pivot nhỏ gần nhất phía trong mô hình; nếu R >3×A thì dùng giữa vùng | Biên trên − biên dưới |
| Vùng nhiều tháng | Như chữ nhật | ≥3 chạm mỗi biên | ≥60 nến 1D hoặc ≥12 nến 1W | Đóng 1D ngoài biên ≥0,5×A(1D), hoặc 2 nến 1D liên tiếp ngoài biên | — (chỉ bối cảnh) | — |
| Tam giác | Vẽ hai đường bằng bình phương tối thiểu (least squares) qua các pivot cùng loại. ≥3 pivot ở một cạnh, ≥2 ở cạnh kia (Bulkowski) | Không close nào vượt đường quá 0,25×A bên trong mô hình. "Phẳng" khi \|độ dốc\| ≤0,03×A/nến. Tăng = trên phẳng, dưới dốc lên; giảm = ngược lại; cân = trên dốc xuống, dưới dốc lên. Hội tụ: độ rộng đầu − cuối ≥30%. Đỉnh tam giác (apex) nằm trước mặt 0,5–3 lần chiều dài mô hình | ≥15 nến; phá vỡ ở 50–80% quãng tới apex (Bulkowski trung bình 74%) | Cạnh bị phá | Pivot nhỏ gần nhất phía đối diện (Bulkowski) | Độ rộng tại pivot đầu tiên |
| Cờ / cờ đuôi nheo | Cán cờ = từ pivot đáy đến đỉnh cán (tip) | Cán ≥3×A trong ≤15 nến. Cờ rộng ≤0,5 lần cán, cao ≤0,5 lần cán (neurotrader). Không nến nào vượt tip. ≥5 nến từ tip. Đường vẽ chạm-không-cắt, không gồm nến hiện tại. Hội tụ → cờ đuôi nheo; song song hoặc nghiêng ngược → cờ | ≤20 nến (Bulkowski: <3 tuần trên khung ngày) | Đường kháng cự (hoặc hỗ trợ) của cờ kéo dài | Dưới đáy cờ (Long) / trên đỉnh cờ (Short) | Chiều cao cán |
| Cốc-tay cầm | Cụm đáy kéo dài, hai mép | Hai mép lệch ≤1×A. Hình chữ U: ≥20% số nến nằm trong 1/3 dưới. Tay cầm ở nửa trên cốc | Cốc 35–325 nến 1D (7–65 tuần, Bulkowski). Tay cầm ≥5 nến 1D | Mép phải | Dưới đáy tay cầm | Mép − đáy cốc |
| Nêm / mở rộng | Cùng cách vẽ như tam giác: hai đường cùng chiều và hội tụ (nêm), hoặc khoảng cách tăng dần (mở rộng) | — | — | Không phát lệnh | — | — |
| Nén biến động | BBW(20,2) ≤ phân vị 10% của 125 nến; NR7/NR4; ATR14/ATR100 ≤0,7 | ≥2/3 chỉ báo cùng bật → cờ "coil" | — | — | — | — |

**Đệm cắt lỗ:** +0,25–0,5×A ra phía ngoài mức ghi trong bảng. Nếu có số tròn lớn nằm trong vùng đệm thì đẩy cắt lỗ qua hẳn số tròn đó. **Bỏ lệnh** nếu R > 3×A của khung vào lệnh. Lý do: Bulkowski khuyên bỏ lệnh khi cắt lỗ quá xa ([aadb](https://thepatternsite.com/aadb.html); [at](https://thepatternsite.com/at.html)).

**Xác nhận phá vỡ:**

- Giá đóng cửa vượt đường phá ≥0,25×A (1D/4H) hoặc ≥0,5×A (1H/15m).
- Nếu chỉ vượt trong khoảng 0 đến ngưỡng trên thì ghi trạng thái `breakout_pending`. Cần thêm 1 nến đóng nữa không quay lại trong mô hình.
- Volume nến phá ≥1,5×SMA20 chỉ được ghi chú "dự kiến retest cao", không cộng điểm xác nhận (theo VolumeStudy).

**Máy trạng thái.** Mỗi mô hình là một bản ghi, chuyển trạng thái theo bảng sau:

| Trạng thái | Điều kiện vào | Điều kiện ra | App hiển thị |
|---|---|---|---|
| `forming` | Đã đủ n−1 pivot xác nhận; pivot cuối mới là ứng viên (cực trị kể từ pivot xác nhận gần nhất, chưa đủ 3 nến bên phải) | Pivot cuối được xác nhận và hình học vẫn hợp lệ → `armed`. Ứng viên bị thay thế hoặc hình học vỡ → `invalidated` | "Đang hình thành", không có lệnh |
| `armed` | Mọi pivot đã xác nhận; đường phá, h và mức cắt lỗ đã tính | Đóng cửa đạt ngưỡng xác nhận → `breakout`. Đóng cửa ngoài biên **đối diện** → `invalidated`. Quá hạn → `expired` | Cảnh báo chờ phá, không lệnh |
| `expired` | Tam giác: giá đã qua apex mà chưa phá. Cờ: >20 nến kể từ tip. Mô hình khác: thời gian ở trạng thái `armed` > 0,5 lần thời lượng mô hình | Kết thúc | — |
| `breakout` | Xác nhận phá (hai mức ngưỡng như trên) | Trong 10 nến: râu nến chạm lại đường phá ±0,5×A nhưng giá đóng vẫn ở phía phá → `retested`. Đóng cửa quay vào trong mô hình >0,5×A, hoặc chạm cắt lỗ → `failed`. Qua 10 nến mà không retest → giữ `breakout`, gắn `retest=none` | Phát lệnh theo mục (4) |
| `retested` | Như trên | Chạm TP hoặc cắt lỗ → kết thúc (`target_hit` / `failed`). Hết hạn giữ lệnh (21 ngày / 24 giờ) → đóng theo thời gian | — |
| `failed` | Như trên | Nếu giá sau đó chạm biên đối diện → ghi `bust_candidate` (chỉ ghi sổ) | — |

**Chống look-ahead và trùng lặp:**

- Định danh ổn định: id = hash(mã, khung, loại mô hình, chỉ số nến của 2 pivot đầu).
- Lưu ảnh chụp (các pivot, thời điểm phát hiện, phiên bản tham số) ở mỗi lần chuyển trạng thái. Không ghi đè.
- Mỗi mã chỉ có một tín hiệu mở cho mỗi chế độ.
- Backtest chạy từng nến một, giống hệt chế độ chạy thật. Bài kiểm tra bắt buộc: kết quả chạy toàn bộ một lần phải **trùng khớp** với kết quả chạy tăng dần từng nến.

### (3) Ghép mục tiêu mô hình với TP1/TP2/TP3 và vùng S/R

Mục tiêu mô hình không thay thế vùng S/R. Nó chỉ quyết định **chọn vùng nào** cho từng nấc chốt lời. Định nghĩa hai mức:

- **Mục tiêu rút gọn** T_ngắn = đường phá ± h × p. Trong đó p là tỷ lệ đạt mục tiêu của Bulkowski cho mô hình đó: vai-đầu-vai 0,51, tam giác tăng phá lên 0,70, hai đáy 0,73, cốc 0,61. Nếu không có số liệu thì p = 0,5.
- **Mục tiêu đầy đủ** T_đủ = đường phá ± h.

Riêng cờ, Bulkowski đo bằng **cán cờ × 0,46**, cộng vào đáy cờ khi phá lên ([flags](https://thepatternsite.com/flags.html)). Mức này dùng làm T_đủ. T_ngắn của cờ lấy bằng nửa mức đó (theo cách đo "nửa chiều cao" của cờ cao và chặt, [htf](https://thepatternsite.com/htf.html)).

| Nấc | Khối lượng | Quy tắc đặt |
|---|---|---|
| **TP1** | 50% | Mức **gần hơn** giữa (a) vùng S/R đầu tiên phía trước và (b) T_ngắn. Đặt ở **mép gần** của vùng (trước kháng cự / trên hỗ trợ), lùi thêm khỏi số tròn nếu có |
| **TP2** | 30% | Vùng S/R gần T_đủ nhất, ở **phía trước** T_đủ. Nếu không có vùng nào trong khoảng ±1×A quanh T_đủ thì dùng vùng gần nhất **trước** T_đủ |
| **TP3** | 20% | Vùng S/R kế tiếp sau TP2. Nếu không có vùng nào trong tầm thì dùng trailing theo cấu trúc (pivot đã xác nhận). Vẫn bị giới hạn bởi thời gian giữ 21 ngày / 24 giờ |

Bốn kiểm tra bắt buộc:

1. **R:R sau phí.** Nếu TP1 nhỏ hơn 1,0R (riêng cờ là 1,5R, vì thất bại hòa vốn 44–45%) sau khi trừ phí khứ hồi và funding dự kiến → bỏ lệnh.
2. **Kháng cự dày giữa đường.** Nếu có vùng kháng cự dày nằm giữa giá vào và TP1 → bỏ lệnh hoặc hạ cỡ. Dùng lại cách đo "độ dày vùng" của báo cáo trước.
3. **Mục tiêu nằm sau biên mô hình lớn.** Nếu T_đủ nằm bên kia một biên của vùng nhiều tháng chưa bị phá → TP2 lấy biên đó, bỏ TP3.
4. **Không dùng Fibonacci 1,272/1,618** làm mục tiêu. Không có nguồn kiểm chứng [Truyền miệng].

**Xung đột với luật "sau TP1 dời SL về giá vào".** Với lệnh mô hình, giá vào thường nằm ngay sát đường phá. Retest lại xảy ra ở khoảng 58–68% số lần. Dời cắt lỗ đúng về giá vào vì thế dễ bị chính nhịp retest bình thường quét mất 50% vị thế còn lại. Đề xuất sửa riêng cho lệnh mô hình:

- Nếu giá vào cách đường phá ≥0,5×A: giữ luật hiện tại.
- Nếu gần hơn: sau TP1, dời cắt lỗ về **đường phá − 0,5×A**, tức đúng ngưỡng trạng thái `failed`. Lệnh còn lại chịu rủi ro nhỏ (một phần nhỏ của R), đổi lại sống sót qua nhịp retest.

Hiện chưa biết retest thường xảy ra trước hay sau TP1, vì Bulkowski không công bố số ngày trung bình tới throwback. Đây là mục phải backtest. Không thay bằng trailing stop sớm: trong dữ liệu Bulkowski, trailing stop làm lợi nhuận trung bình **giảm gần một nửa** ([ThrowbackEntry](https://thepatternsite.com/ThrowbackEntry.html)).

### (4) Mâu thuẫn với luật "đặt limit chờ hồi" và cách xử lý

Luật hiện tại có hai nhánh: giá cách vùng ≤0,5×ATR thì vào trực tiếp; xa hơn thì đặt limit chờ hồi. Với vùng S/R thông thường, luật này hợp lý. Với mô hình thì không, vì ba lý do.

**Lý do 1: nhánh limit thường xuyên bị kích hoạt.** Theo định nghĩa ở mục (2), một tín hiệu mô hình chỉ ra đời khi giá **đã đóng cửa cách đường phá ít nhất 0,25–0,5×A**. Nến phá vỡ mạnh thường dài hơn mức đó nhiều. Vì vậy nhánh "đặt limit chờ hồi" sẽ chạy rất thường xuyên.

**Lý do 2: limit bỏ lỡ đúng nhóm tốt nhất.** Khoảng **34% số lần phá không hề quay lại** ([throwbacks](https://www.thepatternsite.com/throwbacks.html)), và đó là nhóm chạy xa nhất. Nhóm khớp limit lại thiên về các lần retest sâu, nhóm có kết quả kém hơn (26,7% so với 41,3%). Hiện tượng này gọi là **adverse selection**: lệnh chờ được khớp chủ yếu ở những trường hợp xấu.

**Lý do 3: vào ngay thắng vào sau ở mọi chỉ số.** Trên chính những mô hình có retest, vào ngay khi đóng cửa phá vỡ thắng mọi cách vào chờ hồi, ở cả lãi, tỷ lệ thắng lẫn tỷ lệ bị dừng ([ThrowbackEntry](https://thepatternsite.com/ThrowbackEntry.html)) [Thực hành ngành · cổ phiếu].

Đề xuất xử lý: giữ nguyên luật cũ cho tín hiệu S/R thường. Thêm kiểu vào lệnh **"đóng cửa phá vỡ"** chỉ cho tín hiệu mô hình ở trạng thái `breakout`. Gọi d là khoảng cách từ giá đóng nến phá tới đường phá:

| Khoảng cách d | Cách vào | Hạn của lệnh limit |
|---|---|---|
| d ≤ 1,0×A | **Vào trực tiếp 100%** (nới ngưỡng 0,5 lên 1,0 riêng cho mô hình) | — |
| 1,0×A < d ≤ 2,0×A | **50% vào trực tiếp + 50% limit** tại đường phá + 0,25×A (phía ngoài mô hình, tức retest nông). R tính theo giá vào trung bình **sau khi khớp** | Hủy sau 10 nến hoặc khi giá chạm TP1 trước |
| d > 2,0×A | Không vào trực tiếp (nến quá dài, R xấu, dễ là quét thanh lý). Chỉ đặt limit 50% khối lượng tại đường phá + 0,25×A | 10 nến |
| Bất kỳ d, nến phá có OI giảm mạnh bất thường hoặc biên độ nến >3×A(1H) | Chờ thêm 1 nến đóng xác nhận giữ được trên đường phá rồi mới áp bảng trên | — |

Ba ràng buộc đi kèm:

- R của mọi phương án phải qua kiểm tra R ≤3×A và TP1 ≥1R sau phí ở mục (3).
- Funding đang cực đoan cùng chiều lệnh → giảm khối lượng hoặc chỉ nhắm TP1.
- Lệnh Short theo mô hình đảo chiều không được vào trực tiếp trong 30 ngày đầu sau khi BTC lấy lại MA200 ngày. Lý do: phá xuống thất bại tăng vọt lúc thị trường chuyển pha ([FailureRates](https://thepatternsite.com/FailureRates.html)).

Bằng chứng cho đề xuất này là gián tiếp: cổ phiếu, không có phương án limit trong so sánh. Vì vậy phải backtest ba nhánh A/B/C ở mục (5) trước khi chọn.

### (5) Những điều phải backtest trước khi tin

| # | Câu hỏi | Cách kiểm | Tiêu chí chấp nhận gợi ý |
|---|---|---|---|
| 1 | Mô hình có cải thiện hệ hiện có không? | So hệ "xu hướng + S/R" với hệ "xu hướng + S/R + cổng mô hình" trên BTC, ETH và top perp. Chia theo thời gian: 2019–2022 để chỉnh tham số, 2023–2026 để kiểm | Expectancy sau phí và funding tăng ≥0,1R ở giai đoạn kiểm, sụt giảm không tệ hơn |
| 2 | Vào trực tiếp, limit hay chia đôi? | Nhánh A: 100% vào trực tiếp khi đóng phá vỡ. Nhánh B: limit tại đường phá (luật hiện tại). Nhánh C: chia 50/50 theo mục (4). **Tính cả lệnh không khớp** (kết quả = 0R nhưng mất cơ hội) | Chọn nhánh có tổng R trên mỗi tín hiệu cao nhất, không phải tỷ lệ thắng cao nhất |
| 3 | Tỷ lệ retest và độ sâu retest trên BTC/ETH 4H/1H | Đếm theo định nghĩa `retested` | So với 58–68% của cổ phiếu; đo thêm số nến tới retest |
| 4 | Retest xảy ra trước hay sau TP1? Dời cắt lỗ về giá vào hay về đường phá − 0,5×A? | So hai luật dời cắt lỗ | Luật nào giữ được nhiều R hơn ở phần 50% còn lại |
| 5 | Tỷ lệ chạm T_ngắn và T_đủ **trong 21 ngày / 24 giờ** | Đo từng mô hình, từng khung | Hiệu chỉnh lại p thay cho số Bulkowski |
| 6 | Long và Short theo mô hình có khác nhau? | Tách kết quả theo chiều và theo chế độ thị trường (BTC trên/dưới MA200, giai đoạn chuyển pha) | Short chỉ được bật nếu expectancy dương ở giai đoạn kiểm |
| 7 | Ngưỡng dung sai ATR có ổn định không? | Quét lưới quanh các mức đề xuất (0,5/0,75/1,0×A …), đếm **số cấu hình đã thử** | Kết quả không sụp khi ngưỡng lệch ±25%. Báo cáo kèm Deflated Sharpe hoặc PBO (xác suất overfitting, tức khớp quá mức với dữ liệu cũ) như bản phản biện yêu cầu |
| 8 | Nén biến động có giá trị gì không? | Bỏ đi / thêm vào cờ "coil" rồi chạy lại | Nếu không cải thiện thì bỏ hẳn |
| 9 | Volume và OI tại nến phá vỡ | Phân nhóm theo volume và theo mức thay đổi OI | Kiểm xem "OI giảm mạnh → dễ bust" có đúng không |
| 10 | Chiều cao tối thiểu 3×A và mô hình cao chạy xa hơn | Phân nhóm theo h/A | Xác nhận hoặc đổi ngưỡng |
| 11 | Ảnh hưởng số tròn | So kết quả khi đường phá/cắt lỗ sát số tròn với khi không sát | Quyết định có giữ luật "đẩy qua số tròn" |
| 12 | Không look-ahead | So chạy một lần với chạy tăng dần từng nến | Trùng khớp 100% |
| 13 | Nến dị thường riêng một sàn | Đánh dấu và loại các nến lệch xa giá sàn khác | Kết quả không phụ thuộc vào vài nến bẩn |
| 14 | Mô hình thất bại (bust) | Ghi sổ `bust_candidate` ít nhất 6 tháng forward | Chỉ bật nếu expectancy dương và đủ ≥100 lệnh |
| 15 | Hiệu quả có yếu dần theo thời gian? | Tính expectancy theo từng năm | Cảnh báo khi 2 năm liền giảm |

## Kết luận

Câu hỏi "có nên dùng mô hình biểu đồ cho BTC/ETH" hóa ra không phải câu hỏi về nhận diện hình dạng. Đó là câu hỏi về **thực thi lệnh**. Phần nhận diện đã có công thức rõ ràng từ năm 2000, chuyển sang pivot xác nhận và ATR khá dễ. Phần sinh lời thì chưa ai chứng minh được trên crypto sau phí. Điều số liệu practitioner nói rõ nhất lại là cách vào lệnh: cùng một mô hình, vào ngay lúc đóng cửa phá vỡ hay chờ hồi tạo ra hai bộ lệnh có chất lượng khác nhau. Luật "limit chờ hồi" vốn tốt cho vùng S/R tĩnh, nhưng nó tự động chọn ra những lần phá yếu. Vì vậy giá trị thực của báo cáo này nằm ở hai chỉnh sửa thực thi: kiểu vào "đóng cửa phá vỡ", và mức dời cắt lỗ sau TP1. Thêm bao nhiêu mô hình là chuyện phụ.

Hệ quả thứ hai: với BTC/ETH, mô hình đáng giá nhất lại là mô hình đơn giản nhất. Vùng đi ngang/chữ nhật là dạng duy nhất có bằng chứng crypto, trùng khít với bộ máy vùng S/R sẵn có, và có thể dùng cho cả Long lẫn Short mà không cần thêm hình học phức tạp. Các mô hình "đẹp" như vai-đầu-vai, cốc-tay cầm hay nêm có nhiều truyền miệng nhất, nhưng bằng chứng mỏng nhất. Chúng hợp với vai trò cờ bối cảnh hơn là nút bấm vào lệnh. Thứ tự triển khai hợp lý vì thế là: chữ nhật và cờ ở Swing 4H, chạy ẩn và ghi sổ forward song song với backtest mục (5). Chỉ mở rộng khi số liệu của chính Coin Radar, không phải của cổ phiếu Mỹ, cho thấy expectancy sau phí dương.
