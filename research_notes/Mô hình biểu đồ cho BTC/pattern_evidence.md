# Bằng chứng thực nghiệm về mô hình biểu đồ cổ điển (chart patterns) — ưu tiên crypto / BTC / ETH

Ghi chú nghiên cứu cho Coin Radar (Binance USDT perpetual, Swing 1D/4H ≤21 ngày, Fast 1H/15m ≤24h).
Ngày lập: 2026-10-19. Nhãn: [EVIDENCE] = nghiên cứu học thuật có phương pháp kiểm định; [PRACTITIONER] = số liệu người hành nghề (Bulkowski, blog backtest), chưa bình duyệt; [FOLKLORE] = khẳng định lưu truyền, không có nguồn kiểm chứng.

Lưu ý phạm vi: đã dùng ~18 lượt tìm/tải. Nhiều bài trả phí (Springer, ScienceDirect) không đọc được toàn văn — chỉ ghi những gì xác minh được từ tóm tắt/trang chính thức; phần còn lại đưa vào Gaps.

---

## 1. Các nghiên cứu nghiêm ngặt tìm thấy gì? (cổ phiếu/FX trước, crypto sau)

### Takeaway
Bằng chứng học thuật về cổ phiếu/FX cho thấy mô hình (đặc biệt head-and-shoulders, double top/bottom) có **thông tin thống kê** (phân phối lợi suất sau mô hình khác ngẫu nhiên), nhưng **giao dịch độc lập theo mô hình thường không có lãi** sau chi phí, hoặc bị các quy tắc đơn giản hơn (moving average, filter rule) vượt qua. Với crypto, **không tìm thấy nghiên cứu bình duyệt nào đo tỷ lệ thành công / biên độ di chuyển cho từng mô hình cổ điển trên BTC/ETH** với dữ liệu dài và chi phí giao dịch; bằng chứng crypto hiện chỉ là mảnh rời, mẫu nhỏ, hoặc là dự báo phân loại (AUC) chứ không phải lợi nhuận.

### Cited Findings

**Cổ phiếu / FX (bằng chứng thứ cấp cho crypto)**
- [EVIDENCE] Lo, Mamaysky & Wang (2000, Journal of Finance 55: 1705–1765): dùng kernel regression (hồi quy làm mượt phi tham số) để nhận diện tự động 10 mô hình (H&S, inverse H&S, broadening top/bottom, triangle top/bottom, rectangle top/bottom, double top/bottom) trên cổ phiếu Mỹ 1962–1996; so sánh phân phối lợi suất có điều kiện (sau mô hình) với phân phối không điều kiện; kết luận nhiều mô hình "add incremental information" và có thể có giá trị thực hành — [MIT, Lo](https://web.mit.edu/~alo/www/Papers/techanal.html)
- [EVIDENCE] Lo-Mamaysky-Wang: NYSE/AMEX 7/10 mô hình cho phân phối lợi suất khác biệt có ý nghĩa; NASDAQ 10/10. Double top/bottom và H&S là phổ biến nhất (~1 lần/năm/cổ phiếu). Mô hình xuất hiện nhiều hơn ở **cổ phiếu vốn hóa lớn** so với nhỏ, và nhiều hơn ở NYSE/AMEX so với NASDAQ. Tác giả **không** khẳng định tạo ra lợi nhuận giao dịch vượt trội; kết quả phụ thuộc mạnh vào định nghĩa mô hình. Không có số liệu chi phí — [CXO Advisory tóm tắt](https://www.cxoadvisory.com/technical-trading/classic-papers-returns-from-pattern-based-technical-analysis/)
- [EVIDENCE] Osler (1998), H&S trên cổ phiếu Mỹ: 100 cổ phiếu ngẫu nhiên, 7/1962–12/1993; ~1 mô hình/năm/cổ phiếu; volume tăng ~11% ngày phá neckline (có ý nghĩa thống kê ngày đó + 2 ngày sau); **lợi nhuận trung bình −0,24%/giao dịch khứ hồi, CHƯA trừ phí**, giữ ~10 ngày; hiệu ứng giá biến mất hoàn toàn sau ~2 tuần. Kết luận: giao dịch theo H&S tồn tại nhưng trung bình không có lãi — [CXO Advisory](https://www.cxoadvisory.com/technical-trading/classic-papers-returns-from-pattern-based-technical-analysis/)
- [EVIDENCE] Chang & Osler (NY Fed Staff Report No. 4, 1995 "Head and shoulders: not just a flaky pattern"; bản Economic Journal 1999 "Methodical Madness"): quy tắc H&S trên tỷ giá USD với các đồng tiền chính, 3/1973–6/1994; so với 10.000 chuỗi bootstrap theo giả thuyết random walk. Kết luận: quy tắc **có lãi nhưng không hiệu quả** — các quy tắc đơn giản hơn (moving average, filter) vượt trội — [IDEAS/RePEc Staff Report 4](https://ideas.repec.org/p/fip/fednsr/4.html); [Economic Journal 1999](https://ideas.repec.org/a/ecj/econjl/v109y1999i458p636-61.html)
- [EVIDENCE] Osler (phỏng vấn 2001): H&S "fairly useful" để dự báo nhưng MA và filter rule tốt hơn; chỉ nên dùng khi không có công cụ tốt hơn — [Traders.com interview](https://traders.com/Documentation/FEEDbk_docs/2001/06/Abstracts_new/Interview/Interview.html)
- [EVIDENCE] Savin, Weller & Zvingelis (2007, Journal of Financial Econometrics 5(2): 243–265): áp dụng thuật toán Lo-Mamaysky-Wang có thêm bộ lọc kiểu nhà phân tích kỹ thuật; S&P 500 và Russell 2000, 1990–1999. **Chiến lược bán khống chỉ dựa trên H&S không có lãi** (S&P 500), Russell 2000 có bằng chứng yếu; nhưng H&S có sức **dự báo lợi suất vượt trội** — chiến lược có điều kiện cho lợi suất vượt trội điều chỉnh rủi ro **5–7%/năm** — [IDEAS/RePEc](https://ideas.repec.org/a/oup/jfinec/v5yi2p243-265.html); [working paper](https://www.biz.uiowa.edu/faculty/gsavin/papers/HSrevision_paw_10%2019%2006.pdf); [CXO tóm tắt](https://www.cxoadvisory.com/technical-trading/testing-the-head-and-shoulders-pattern/)
- [EVIDENCE] Savin et al.: một phần (không phải toàn bộ) mức lợi suất kém sau H&S giải thích được bằng momentum âm — [CXO Advisory](https://www.cxoadvisory.com/technical-trading/testing-the-head-and-shoulders-pattern/)
- [EVIDENCE] Chong & Poon (2017, Studies in Nonlinear Dynamics & Econometrics 21(5)): đề xuất bộ lọc loại H&S "không hợp lệ"; lợi suất điều chỉnh rủi ro nhìn chung cải thiện khi lọc — [IDEAS/RePEc](https://ideas.repec.org/a/bpj/sndecm/v21y2017i5p18n1.html)

**Crypto**
- [EVIDENCE] Rink (2025, Financial Innovation 11(1)), "The role of technical chart patterns in the early Bitcoin market: intraday evidence from the Mt.Gox transaction dataset": dùng dữ liệu giao dịch thật của trader Mt.Gox; giao dịch đặt trong giai đoạn **tín hiệu mua** có lợi suất trung bình cao hơn có ý nghĩa so với giai đoạn không tín hiệu; trader dùng mô hình thường xuyên hơn có lợi suất khứ hồi trung bình cao hơn, giao dịch tích cực hơn, phân phối lợi suất lệch phải; nhưng việc dùng mô hình **không tự giải thích** độ lệch dương — [Springer](https://link.springer.com/article/10.1186/s40854-025-00763-2) (toàn văn bị chặn đăng nhập; chưa xác minh được số liệu theo từng mô hình). Lưu ý: thị trường BTC giai đoạn Mt.Gox (≈2011–2014) kém hiệu quả hơn nhiều so với Binance perp 2026.
- [EVIDENCE – yếu] Working paper Đại học New Mexico: smoothing spline trên **một tháng** dữ liệu BTC (GDAX); xác định H&S, inverse H&S, triangle bottom là chiến lược có lãi hơn trong mẫu, và ghi nhận cùng mô hình cho lợi suất yếu hơn trên cổ phiếu Mỹ; chính tác giả nói cần kỳ dài hơn — [UNM PDF](https://www.math.unm.edu/~gzhang12/paper/bitcoin03.pdf). Mẫu quá nhỏ, không thể dùng làm căn cứ.
- [EVIDENCE] Nghiên cứu 2026 (International Review of Economics & Finance, ScienceDirect) về mô hình **nến** (candlestick, không phải chart pattern) intraday: gần 2.000 cặp giao dịch crypto, khung 1H; chỉ **một số ít** mô hình đảo chiều có khả năng dự báo đáng kể, phù hợp với văn liệu về khả năng dự báo/lợi nhuận hạn chế của quy tắc kỹ thuật — [ScienceDirect](https://sciencedirect.com/science/article/pii/S1059056026002716)
- [EVIDENCE – thiết kế yếu] arXiv 2605.00875 (2026), CNN trên ảnh biểu đồ nến ngày, BTC/ETH/SPY 1/2018–12/2024, nhãn "bull" nếu lợi suất 7 ngày tới > 2%; chia theo thời gian 70/15/15 (không look-ahead). Test: **BTC AUC 0,734 (acc 69,3%)**, **ETH AUC 0,492** (≈ ngẫu nhiên), **SPY AUC 0,459** (dưới ngẫu nhiên). Chỉ **500 mẫu/tài sản**; số liệu BTC không nhất quán giữa các bảng (chỗ khác ghi AUC 0,760); **không có backtest, không tính phí**; biểu đồ chỉ giá tốt hơn biểu đồ có thêm chỉ báo (SMA, Bollinger) — [arXiv HTML](https://arxiv.org/html/2605.00875)
- [EVIDENCE] Bài "Deep learning and technical analysis in cryptocurrency market" (Finance Research Letters 2023): lịch sử giá BTC có thể chứa thông tin dự báo và chỉ báo kỹ thuật phổ biến có thể dùng xây chiến lược có lãi — [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S1544612323001824) (chỉ đọc được tóm tắt; đây là chỉ báo, không phải chart pattern hình học).
- [FOLKLORE] Blog giao dịch khẳng định H&S "tỷ lệ thành công 82%" và "tỷ lệ thất bại crypto 20–30% so với 10–15% cổ phiếu" mà không nêu nghiên cứu — xuất hiện trong kết quả tìm kiếm từ các trang sàn/giáo dục (vd. [Altrady](https://www.altrady.com/crypto-trading/technical-analysis/reversal-patterns-head-and-shoulders), [BingX](https://bingx.com/en/learn/article/how-to-use-crypto-chart-patterns-head-and-shoulders-triangles-wedges)). Không dùng.

### Inferences
- Mô hình hợp lý nhất để dùng làm **bộ lọc/ngữ cảnh** (thay đổi xác suất) hơn là **tín hiệu vào lệnh độc lập** — đây là kết luận nhất quán của Savin et al., Chang & Osler, Lo et al.
- Lo et al. ghi nhận mô hình xuất hiện nhiều hơn ở tài sản vốn hóa lớn → BTC/ETH có lẽ sinh nhiều mẫu hình "sạch" hơn altcoin nhỏ; nhưng điều này là suy luận từ cổ phiếu, chưa được kiểm chứng trên crypto.
- Kết quả CNN cho BTC (> ETH, > SPY) gợi ý BTC có cấu trúc hình ảnh khai thác được trên khung ngày, nhưng mẫu 500, không có phí, không nhất quán → chỉ là giả thuyết.

### Gaps
- Không tìm thấy nghiên cứu bình duyệt nào đo, cho BTC/ETH, tần suất / tỷ lệ thành công / biên độ trung bình của từng mô hình: double top/bottom, triangle, rectangle, flag/pennant, wedge, cup-and-handle, broadening.
- Không đọc được số liệu chi tiết của Rink (2025) và Dawson & Steeley (2003, Journal of Business Finance & Accounting, UK) do tường phí.
- Không tìm được nghiên cứu ML/CNN nhận diện mô hình cổ điển (H&S, triangle) trên BTC có backtest kèm chi phí (IEEE, Expert Systems with Applications) trong số lượt tìm có hạn — cần tìm thêm.

---

## 2. Tỷ lệ breakout thất bại, throwback/pullback, và có nên chờ retest?

### Takeaway
Số liệu duy nhất có quy mô lớn là của Bulkowski (cổ phiếu Mỹ, practitioner): throwback (giá quay lại test vùng breakout sau khi phá lên) xảy ra ở khoảng **58%** mô hình breakout lên; khi đã có throwback/pullback, kết quả **kém hơn** (đặc biệt nếu giá xuyên ngược qua vùng breakout). Không có bằng chứng crypto nào cho câu hỏi "chờ retest có tốt hơn không".

### Cited Findings
- [PRACTITIONER] Bulkowski: từ năm 2000, **58% của 10.305 mô hình** breakout lên có throwback; breakout volume cao throwback **70%** — [ThePatternSite throwbacks](https://ThePatternSite.com/throwbacks.html) (số liệu qua tóm tắt tìm kiếm; trang chưa tải trực tiếp)
- [PRACTITIONER] Bulkowski: sau throwback, ~**35%** tiếp tục giảm xuống dưới mô hình (≈65% hồi phục) — [ThePatternSite throwbacks](https://ThePatternSite.com/throwbacks.html) (qua tóm tắt tìm kiếm)
- [PRACTITIONER] Bulkowski, 7/1991–6/2008, 841 cổ phiếu, 9.372 mô hình có throwback/pullback, 30 loại mô hình:
  - Throwback **chỉ retrace một phần** (giữ trên đáy ngày breakout): tăng trung bình **41,3%** (n=1.717); **retrace hoàn toàn** (thủng đáy ngày breakout): **26,7%** (n=3.311).
  - Pullback (sau breakout xuống) một phần: giảm TB **25,1%** (n=1.355); hoàn toàn: **17,3%** (n=2.989).
  - Kiểm thử stop: đặt stop ở ngày breakout rồi chuyển volatility stop cho lãi gộp cao hơn ~11% so với chỉ volatility stop (5.188 mô hình, trước phí/trượt giá) — [ThePatternSite ThrowPull](https://thepatternsite.com/ThrowPull.html)
- [PRACTITIONER] Bulkowski, ~13.932 mô hình, 23 loại, 1991–2008; "thất bại" = không đi được ≥10% từ giá đóng cửa trước ngày breakout tới đỉnh/đáy cuối cùng:
  - Breakout lên, thất bại 10%: TB **14%** (thập niên 1990) → **28%** (2003–2007); đỉnh **44% năm 2007**, 32% năm 2008. Ngưỡng 20%: 22% (1991) → 64% (2007), 62% (2008). Ngưỡng 40%: 64% (1991) → 88% (2008).
  - Breakout xuống, thất bại 10%: **26%** (1990s) → **49%** (2003–2007); nhảy 15% (2002) → 48% (2003). Ngưỡng 20%: 59% → 75%. Ngưỡng 40%: 91% → 96% — [ThePatternSite FailureRates](https://thepatternsite.com/FailureRates.html)
- [PRACTITIONER] Bulkowski H&S top (cập nhật 26/8/2020, chỉ thị trường bull, >2.800 "perfect trades"): break-even failure **19%**, giảm TB **16%**, pullback **68%**, đạt mục tiêu đo (measure rule) **51%**, xếp hạng 9/36 — [ThePatternSite H&S top](https://thepatternsite.com/hst.html)
- [PRACTITIONER – chưa xác minh] Con số "hiệu quả tốt hơn khi không retest 97%/91%" chỉ lưu hành trên một script TradingView trích Bulkowski, không thấy trên site gốc — [TradingView](https://tradingview.com/chart/SPX500/QitTP6fy-Probabilities-of-Retest-Bulkowski-Throwback-Theory)

### Inferences
- Vì throwback xảy ra ở đa số trường hợp (~58%), chiến lược "chờ retest" sẽ **khớp lệnh ở hơn một nửa số breakout** với giá tốt hơn, nhưng bỏ lỡ nhóm không retest — mà theo số liệu Bulkowski, nhóm mạnh nhất lại là nhóm không retest hoặc chỉ retest nông. Retest **thủng sâu** qua vùng breakout là tín hiệu suy yếu (41,3% vs 26,7%).
- Gợi ý vận hành cho Coin Radar (suy luận, cần backtest): coi đóng cửa ngược qua mức breakout (vd. thủng đáy nến breakout 4H) là điều kiện vô hiệu hóa/thoát.
- Số liệu Bulkowski đo bằng "ultimate high/low" (đỉnh/đáy cuối cùng trước khi xu hướng đảo ≥20%), không giới hạn thời gian giữ — **không tương thích trực tiếp** với giới hạn ≤21 ngày hoặc ≤24h của Coin Radar, và chỉ là cổ phiếu long-only, không có đòn bẩy/funding.

### Gaps
- Không có nghiên cứu nào (học thuật hay practitioner) về throwback rate trên BTC/ETH hoặc trên khung 4H/15m.
- Không có số liệu định lượng so sánh trực tiếp "vào khi breakout" vs "vào khi retest" có tính phí; cần tự backtest trên dữ liệu Binance.
- Không xác minh được số ngày trung bình đến khi throwback/pullback xảy ra (trang ThrowPull không báo cáo chỉ số này).

---

## 3. Độ tin cậy có phụ thuộc vào regime biến động, khung thời gian, thanh khoản, xác nhận volume? BTC/ETH có tốt hơn small caps?

### Takeaway
Điểm có số liệu: (a) **volume breakout cao KHÔNG cải thiện kết quả** theo Bulkowski — thậm chí thất bại nhiều gấp 2–3 lần; (b) mô hình phổ biến hơn ở tài sản vốn hóa lớn (Lo et al.); (c) tỷ lệ thất bại phụ thuộc mạnh vào **regime thị trường** (bull/bear, chuyển pha). Không có bằng chứng crypto đáng tin cho câu hỏi khung thời gian hay BTC so với altcoin, ngoài một bài CNN mẫu nhỏ.

### Cited Findings
- [PRACTITIONER] Bulkowski volume study, ~8.000 mô hình (rectangle, double/triple top/bottom), 7/1991–5/2011; volume ngày breakout so với 31 ngày trước:
  - Breakout lên: volume trên TB +37,6% vs dưới TB +35,8% (chênh chỉ 1,8 điểm %). Breakout xuống: −15,1% vs −15,7%.
  - Thất bại (<10%): lên — **14% (volume cao) vs 5% (volume thấp)**; xuống — **28% vs 11%**.
  - Throwback: 57% (volume cao) vs 18% (thấp); pullback: 47% vs 17%.
  - Kết luận của tác giả: volume không phải tín hiệu đáng tin cho breakout — [ThePatternSite VolumeStudy](https://thepatternsite.com/VolumeStudy.html)
- [EVIDENCE] Osler (1998): volume tăng ~11% ngày phá neckline H&S (có ý nghĩa), nhưng giao dịch vẫn không có lãi — [CXO Advisory](https://www.cxoadvisory.com/technical-trading/classic-papers-returns-from-pattern-based-technical-analysis/)
- [EVIDENCE] Lo-Mamaysky-Wang: xu hướng volume ảnh hưởng đến mức ý nghĩa của một số mô hình; mô hình xuất hiện nhiều hơn ở cổ phiếu vốn hóa lớn; kết quả ý nghĩa hơn ở NASDAQ (10/10) so với NYSE/AMEX (7/10) — [CXO Advisory](https://www.cxoadvisory.com/technical-trading/classic-papers-returns-from-pattern-based-technical-analysis/)
- [PRACTITIONER] Bulkowski: thất bại breakout xuống tăng vọt khi thị trường chuyển từ bear sang bull (15% năm 2002 → 48% năm 2003); tác giả khuyên không nên short khi bear market kết thúc — [ThePatternSite FailureRates](https://thepatternsite.com/FailureRates.html)
- [PRACTITIONER] Breakout xuống thất bại nhiều hơn hẳn breakout lên trong mẫu cổ phiếu (26% vs 14% thập niên 1990; 49% vs 28% 2003–2007) — [ThePatternSite FailureRates](https://thepatternsite.com/FailureRates.html)
- [EVIDENCE – yếu] CNN ảnh biểu đồ ngày: BTC AUC 0,734 vs ETH 0,492 vs SPY 0,459; tác giả gắn với việc nhà đầu tư nhỏ lẻ dựa nhiều vào phân tích kỹ thuật; chỉ khung ngày, 500 mẫu — [arXiv 2605.00875](https://arxiv.org/html/2605.00875)
- [EVIDENCE] Nghiên cứu nến 1H trên ~2.000 cặp crypto: chỉ ít mô hình có sức dự báo → khung intraday ở crypto không cho thấy lợi thế phổ quát — [ScienceDirect 2026](https://sciencedirect.com/science/article/pii/S1059056026002716)

### Inferences
- Với Coin Radar: **không nên** dùng "volume breakout cao" làm điều kiện bắt buộc dựa trên folklore; số liệu cổ phiếu cho thấy volume cao đi kèm thất bại và retest nhiều hơn. Có thể dùng volume để **dự kiến retest** (57% vs 18%) thay vì để xác nhận.
- Short theo mô hình đảo chiều (H&S top, double top) có tỷ lệ thất bại cao hơn long trong dữ liệu cổ phiếu; với perp có funding và thị trường crypto có xu hướng tăng dài hạn, rủi ro short-pattern có thể tương tự — cần kiểm chứng.
- Bộ lọc regime (trend 1D/1H như Coin Radar đã có) phù hợp với bằng chứng rằng hiệu quả mô hình phụ thuộc pha thị trường.

### Gaps
- Không có nghiên cứu so sánh độ tin cậy mô hình theo khung 1H/4H/1D/1W trên crypto.
- Không có nghiên cứu so sánh BTC/ETH với altcoin nhỏ về chart pattern cổ điển.
- Không tìm thấy bằng chứng học thuật về Bollinger squeeze / NR7 / VCP (volatility contraction pattern) trên crypto. Bằng chứng tìm được chỉ là blog backtest: một hướng dẫn nêu BB squeeze breakout BTC/USDT 4H **win rate 48%, profit factor 1,61, 85 lệnh**, không mô tả phương pháp — [Stratbase](https://stratbase.ai/en/blog/bollinger-bands-strategy-guide) [PRACTITIONER, độ tin thấp]; QuantifiedStrategies thử nhiều biến thể BB squeeze trên cổ phiếu và **không biến thể nào hiệu quả** — [QuantifiedStrategies](https://www.quantifiedstrategies.com/bollinger-band-squeeze-strategy/) [PRACTITIONER]. Không tìm thấy dữ liệu NR7 trên crypto.

---

## 4. Độ chính xác của mục tiêu đo (measured-move target)

### Takeaway
Mục tiêu đo theo sách giáo khoa (chiều cao mô hình chiếu từ điểm breakout) chỉ đạt khoảng **một nửa số lần** với H&S top theo Bulkowski (51%). Không có số liệu crypto.

### Cited Findings
- [PRACTITIONER] H&S top (bull market, >2.800 mẫu): **51%** đạt mục tiêu theo measure rule; giảm trung bình 16% — [ThePatternSite H&S top](https://thepatternsite.com/hst.html)
- [PRACTITIONER] Breakout lên thất bại ở ngưỡng 20% tăng từ 22% (1991) lên 62–64% (2007–2008) → mục tiêu lớn ngày càng khó đạt theo thời gian — [ThePatternSite FailureRates](https://thepatternsite.com/FailureRates.html)

### Inferences
- Với giới hạn giữ lệnh ≤21 ngày (Swing) và ≤24h (Fast), xác suất chạm mục tiêu đo đủ chiều cao có lẽ còn thấp hơn số liệu Bulkowski (vốn không giới hạn thời gian). Hợp lý hơn khi đặt TP1 ở ~50% chiều cao mô hình và chỉ dùng mục tiêu đầy đủ cho phần còn lại — đây là suy luận, cần backtest.

### Gaps
- Trang tổng hợp "measure rule" của Bulkowski (MeasureRule.html) trả về 404; không lấy được tỷ lệ đạt mục tiêu cho các mô hình khác (double bottom, triangle, flag, rectangle, cup-and-handle).
- Không có dữ liệu crypto về tỷ lệ đạt measured move.

---

## 5. Lợi nhuận từ mô hình có suy giảm theo thời gian không?

### Takeaway
Có dấu hiệu suy giảm rõ ở số liệu practitioner (cổ phiếu Mỹ): tỷ lệ thất bại tăng **gấp 2–4 lần** từ thập niên 1990 đến 2003–2008. Bằng chứng học thuật về hiệu ứng H&S cho thấy hiệu ứng ngắn (≈2 tuần) và chiến lược độc lập đã không có lãi ngay từ những năm 1990. Không có nghiên cứu crypto đo sự suy giảm; một số tác giả crypto tự cảnh báo khả năng bị arbitrage.

### Cited Findings
- [PRACTITIONER] Bulkowski: mô hình "fail two to four times more often now than in the 1990s"; breakout lên thất bại 10% từ 14% → 28%; breakout xuống 26% → 49% — [ThePatternSite FailureRates](https://thepatternsite.com/FailureRates.html). Lưu ý: giai đoạn so sánh trùng với chuyển pha thị trường (bull 1990s vs 2000s), nên khó tách "suy giảm do phổ biến" khỏi "khác biệt regime".
- [EVIDENCE] Savin et al.: chiến lược short chỉ dựa trên H&S không có lãi trên S&P 500 giai đoạn 1990–1999 — [CXO Advisory](https://www.cxoadvisory.com/technical-trading/testing-the-head-and-shoulders-pattern/)
- [EVIDENCE] Osler (1998): hiệu ứng giá sau H&S biến mất trong ~2 tuần (dữ liệu 1962–1993) — [CXO Advisory](https://www.cxoadvisory.com/technical-trading/classic-papers-returns-from-pattern-based-technical-analysis/)
- [EVIDENCE] Một luận án Durham phát triển phương pháp đo tốc độ suy giảm lợi nhuận chiến lược H&S — [Durham e-theses](https://etheses.durham.ac.uk/id/eprint/198) (chưa đọc được kết quả)
- [EVIDENCE] Tác giả CNN BTC tự nêu: mô hình dự báo được có thể bị arbitrage khi thị trường hiệu quả hơn và phụ thuộc regime — [arXiv 2605.00875](https://arxiv.org/html/2605.00875)
- [EVIDENCE] Bằng chứng tích cực về chart pattern trên BTC tập trung ở giai đoạn sơ khai (Mt.Gox) — [Rink 2025, Financial Innovation](https://link.springer.com/article/10.1186/s40854-025-00763-2)

### Inferences
- Không nên giả định số liệu Bulkowski 1990s hoặc kết quả Mt.Gox áp dụng được cho BTC/ETH perp 2026 — thị trường đã sâu hơn, nhiều bot, phí/funding.
- Coin Radar nên kiểm tra out-of-sample theo thời gian (vd. 2019–2022 train, 2023–2026 test) và theo dõi hiệu quả theo năm để phát hiện suy giảm.

### Gaps
- Không có nghiên cứu crypto đo sự suy giảm hiệu quả chart pattern sau 2017/2020.
- Không đọc được kết quả Dawson & Steeley (2003) và luận án Durham.

---

## Bổ sung: mô hình cụ thể chưa có số liệu (tổng hợp Gaps theo mô hình)

| Mô hình | Crypto [EVIDENCE] | Cổ phiếu/FX [EVIDENCE] | Practitioner (Bulkowski) tìm được trong phiên này |
|---|---|---|---|
| H&S / inverse H&S | 1 tháng GDAX (UNM, rất yếu) | Osler 1998; Chang & Osler 1995/99; Savin et al. 2007; Lo et al. 2000 | H&S top: failure 19%, giảm TB 16%, pullback 68%, target 51% ([hst](https://thepatternsite.com/hst.html)) |
| Double/triple top/bottom | Không tìm thấy | Lo et al. 2000 (có ý nghĩa thống kê) | Chỉ gộp trong volume study |
| Triangles | UNM: triangle bottom (rất yếu) | Lo et al. 2000 | Không lấy được |
| Rectangle / trading range | Không tìm thấy | Lo et al. 2000 | Chỉ gộp trong volume study |
| Broadening | Không tìm thấy | Lo et al. 2000 | Không lấy được |
| Flag/pennant, wedge, cup-and-handle | Không tìm thấy | Không tìm thấy trong phiên này | Không lấy được |
| Accumulation/distribution range nhiều tháng (1W/1D) | Không tìm thấy | Không tìm thấy | Không lấy được |
| BB squeeze / NR7 / VCP | Chỉ blog (48% WR, PF 1,61, 85 lệnh, BTC 4H — không rõ phương pháp) | Không tìm thấy | QuantifiedStrategies: không biến thể nào hiệu quả (cổ phiếu) |

Lưu ý phương pháp của Bulkowski (áp dụng cho mọi số liệu [PRACTITIONER] ở trên): mẫu chủ yếu cổ phiếu Mỹ (~800 mã), mô hình do tác giả tự nhận diện (có thể thiên lệch chọn mẫu, survivorship bias do dùng các cổ phiếu còn tồn tại), đo tới "ultimate high/low" không giới hạn thời gian, trước phí và trượt giá — [FailureRates](https://thepatternsite.com/FailureRates.html); [ThrowPull](https://thepatternsite.com/ThrowPull.html).
