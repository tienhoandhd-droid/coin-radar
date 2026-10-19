# Quy tắc giao dịch mô hình biểu đồ (vào lệnh, cắt lỗ, chốt lời, lọc theo biến động) cho futures USDT perpetual

Phạm vi: Coin Radar, Binance USDT perpetual, Long/Short; Swing (1D xu hướng / 4H vào lệnh, giữ ≤ 21 ngày) và Fast (1H / 15m, giữ ≤ 24h). Không lặp lại nội dung của `reports/Bộ nguyên tắc phân tích coin.md`.

Nhãn: **[EVIDENCE]** = có số liệu từ nghiên cứu có hệ thống (Bulkowski, bài báo học thuật); **[PRACTITIONER]** = quy tắc người hành nghề, không kèm kiểm định; **[FOLKLORE]** = truyền miệng/blog, không kiểm chứng được. **[ĐỀ XUẤT]** = ý kiến của người nghiên cứu, CHƯA backtest.

Lưu ý chung quan trọng nhất: gần như toàn bộ thống kê mô hình có số liệu là của **Bulkowski trên cổ phiếu Mỹ, khung ngày, thị trường bull, "perfect trades"** (mua đúng giá breakout, bán đúng đỉnh/đáy cuối cùng). Bulkowski tự cảnh báo kết quả dựa trên "hundreds of perfect trades, so do not expect to duplicate the results in actual trading" — [thepatternsite throwbacks](https://www.thepatternsite.com/throwbacks.html). Thống kê trên site ghi "Statistics updated on 8/26/2020" — [hst.html](https://thepatternsite.com/hst.html). Không tìm được bộ số liệu tương đương cho BTC/ETH hay futures crypto.

---

## 1. Vào lệnh: breakout close vs retest (throwback/pullback) vs vào sớm (anticipatory)

### Takeaway
Theo dữ liệu Bulkowski, ~2/3 mô hình có throwback/pullback về mức vừa phá, nhưng **các lần breakout KHÔNG có throwback chạy xa hơn**, và trong nghiên cứu so sánh trực tiếp, vào lệnh ngay khi đóng cửa vượt đỉnh mô hình thắng mọi cách vào chờ hồi. Vào sớm trước xác nhận rủi ro cao (ví dụ double bottom: 48% giá tiếp tục giảm). Nghĩa là quy tắc "limit chờ pullback" của Coin Radar sẽ **bỏ lỡ khoảng 1/3 lệnh — đúng nhóm lệnh tốt nhất**.

### Cited Findings
- [EVIDENCE] Tỷ lệ throwback/pullback cụ thể: head-and-shoulders top pullback 68% — [hst.html](https://thepatternsite.com/hst.html); ascending triangle throwback 64% (breakout lên) / pullback 63% (breakout xuống) — [at.html](https://thepatternsite.com/at.html); Adam & Adam double bottom throwback 67% — [aadb.html](https://thepatternsite.com/aadb.html).
- [EVIDENCE] Throwback/pullback làm hại hiệu suất sau breakout: "Pullbacks hurt post breakout performance" — [hst.html](https://thepatternsite.com/hst.html); ascending triangle: throwback/pullback "hurt post breakout performance" — [at.html](https://thepatternsite.com/at.html). Trong bull market, 97% trường hợp mô hình breakout lên có kết quả tốt hơn khi KHÔNG có throwback — [thepatternsite throwbacks](https://www.thepatternsite.com/throwbacks.html).
- [EVIDENCE] Throwback giữ được trên mức breakout: lãi trung bình 40% (400 mẫu) so với 29% khi giá rơi xuống dưới mức breakout (2.767 mẫu). Pullback giữ dưới mức breakout: giảm trung bình 25% (323 mẫu) so với 20% khi giá leo lại trên mức breakout (2.415 mẫu) — [thepatternsite throwbacks](https://www.thepatternsite.com/throwbacks.html) / [pullbacks](https://thepatternsite.com/pullbacks.html).
- [EVIDENCE] Throwback dừng trước đáy của ngày breakout: lãi 41,3% (1.717 mẫu) so với 26,7% khi hồi trọn (3.311 mẫu); với pullback: 25,1% vs 17,3% — [PartialRisesDeclinesThrowsPulls](https://thepatternsite.com/PartialRisesDeclinesThrowsPulls.html).
- [EVIDENCE] Volume và throwback: throwback xảy ra 57% sau breakout volume trên trung bình vs 18% khi volume dưới trung bình; pullback 47% vs 17% — [VolumeStudy](https://thepatternsite.com/VolumeStudy.html).
- [EVIDENCE] So sánh 3 cách vào lệnh trên mô hình có throwback (11 loại mô hình, cổ phiếu khung ngày 1991–2/2012, 10.000 USD/lệnh, stop cố định = % chiều cao mô hình dưới giá mua): Setup 1 (đóng cửa vượt đỉnh mô hình) lãi ròng TB 3.622 USD, thắng 89%, bị stop 10%; Setup 2 (đóng cửa vượt đỉnh của nhịp throwback) 2.925 USD, thắng 83%, stop 14%; Setup 3 (vượt minor high) 3.118 USD, thắng 84%, stop 14%. Với trailing stop, lợi nhuận TB gần như giảm một nửa và ~42% lệnh bị stop. Kết luận của tác giả: "Setup 1 wins hands down in every category" — [ThrowbackEntry](https://thepatternsite.com/ThrowbackEntry.html). Lưu ý: nghiên cứu này KHÔNG so sánh với lệnh limit đặt sẵn tại vùng breakout; chỉ so các cách vào trên các mô hình đã có throwback.
- [EVIDENCE] Mẫu nghiên cứu throwback lớn hơn: 12.711 mô hình, 8.333 có throwback, 463 cổ phiếu, 7/1992–10/2020 (giá trị trung vị) — [thepatternsite throwbacks](https://www.thepatternsite.com/throwbacks.html).
- [EVIDENCE] Vào sớm trước xác nhận: double bottom — "Wait for confirmation -- price to close above the peak between the valleys"; mua trước xác nhận có 48% khả năng giá tiếp tục giảm — [aadb.html](https://thepatternsite.com/aadb.html). H&S top: "Wait for confirmation before placing a trade" — [hst.html](https://thepatternsite.com/hst.html).
- [EVIDENCE] Định nghĩa breakout: đóng cửa vượt trendline (triangle) — [at.html](https://thepatternsite.com/at.html); symmetrical triangle breakout là đóng cửa vượt trendline trên/dưới, không phải đỉnh mô hình — [BustSymTriangles](https://thepatternsite.com/BustSymTriangles.html).
- [PRACTITIONER] Bộ lọc breakout 5% (giá phải cách đường bị phá > 5% để tránh đảo chiều), được trích lại từ Bulkowski qua nguồn thứ cấp — [luxalgo triangle](https://www.luxalgo.com/blog/how-consolidation-and-triangle-patterns-are-a-traders-friend/). Nguồn thứ cấp, chưa kiểm được bản gốc.
- [EVIDENCE] Gap vào ngày breakout cải thiện hiệu suất trong ≥ 2/3 trường hợp bất kể hướng — [TradingQuiz](https://thepatternsite.com/TradingQuiz.html).

**Failed / busted pattern (mô hình thất bại → giao dịch đảo chiều):**
- [EVIDENCE] Định nghĩa bust: breakout đi không quá 10% rồi đảo chiều và phá theo hướng ngược lại (ngưỡng 10% là tùy chọn của tác giả) — [BustedPatterns](https://www.thepatternsite.com/BustedPatterns.html).
- [EVIDENCE] Mức tăng TB của mô hình bị bust so với mô hình thường (bull market, single bust): ascending triangle 43% → 51%; descending triangle 38% → 54%; symmetrical triangle 34% → 52%; double top bị bust lên vượt Adam&Eve 43% → 52%, Eve&Adam 42% → 51%, Eve&Eve 50% → 54%; ngoại lệ Adam&Adam 39% vs 37% — [BustedPatterns](https://www.thepatternsite.com/BustedPatterns.html).
- [EVIDENCE] Tần suất: single bust ~19%, double và triple bust ~1% mỗi loại (dẫn từ nghiên cứu triple top) — [Busted.html](https://www.thepatternsite.com/Busted.html). Symmetrical triangle breakout xuống bị bust 48% trong bull market — [BustSymTriangles](https://thepatternsite.com/BustSymTriangles.html).
- [EVIDENCE] Busted double bottom: giảm TB chỉ 15% (~200 perfect trades); busted H&S bottom: giảm TB 22% — [BustDoubleBots](https://thepatternsite.com/BustDoubleBots.html), [BustHSB](https://thepatternsite.com/BustHSB.html).
- [PRACTITIONER] Bulkowski ưu tiên trade bust của breakout xuống (bust thành tăng) vì đà tăng không giới hạn còn rủi ro giảm bị chặn 100% — [BustedPatterns](https://www.thepatternsite.com/BustedPatterns.html). Lý lẽ này dựa trên cổ phiếu long-only; với futures hai chiều, lập luận bất đối xứng yếu hơn.

### Inferences
- Quy tắc entry hiện tại (market nếu trong 0,5×ATR của vùng; limit chờ hồi nếu xa) phù hợp với lệnh S/R thông thường, nhưng với mô hình, dữ liệu Bulkowski nghiêng về **vào ngay khi nến đóng cửa xác nhận breakout**. Lệnh limit chờ retest khớp được ~64–68% trường hợp nhưng chọn lọc ngược (adverse selection): nhóm khớp là nhóm yếu hơn.
- [ĐỀ XUẤT] Với mô hình, cho phép kiểu vào thứ ba "breakout-close": vào sau khi nến khung entry (4H cho Swing) đóng cửa vượt đường phá. Có thể chia: 50% khối lượng vào khi đóng cửa breakout, 50% đặt limit tại mức phá (retest) — vừa không lỡ lệnh mạnh, vừa có giá tốt nếu throwback. Chưa backtest.
- [ĐỀ XUẤT] Retest mà đóng cửa ngược vào trong mô hình (throwback xuyên qua đáy ngày breakout) là tín hiệu yếu (26,7% vs 41,3%) → nên coi là cảnh báo, và nếu giá đi tiếp tới biên đối diện thì xét lệnh bust theo hướng ngược lại.

### Gaps
- Không có số liệu R-multiple (lãi/lỗ tính theo đơn vị rủi ro) so sánh trực tiếp "limit tại retest" vs "market khi breakout" có tính phần lệnh không khớp. Bulkowski báo cáo % lãi, không báo R.
- Không có số liệu throwback/bust cho crypto, cho khung 4H/1H/15m.
- Không kiểm được bản gốc Bulkowski về bộ lọc 5%.

---

## 2. Cắt lỗ: đặt ở đâu theo từng mô hình, săn stop, khoảng đệm ATR

### Takeaway
Bulkowski đặt stop ở **phía đối diện của mô hình** (dưới đáy thấp hơn của double bottom; minor low trong tam giác) và bỏ lệnh nếu stop quá xa. Bằng chứng học thuật về stop tụ quanh số tròn có (Osler, FX), nhưng **không tìm được nghiên cứu định lượng nào về độ rộng đệm ATR tối ưu** hay săn stop có hệ thống trong crypto.

### Cited Findings
- [PRACTITIONER, nguồn Bulkowski] Double bottom: stop "slightly below the lower of the two bottoms"; nếu stop quá xa giá vào thì nâng stop (dùng volatility stop) hoặc bỏ lệnh — [aadb.html](https://thepatternsite.com/aadb.html).
- [PRACTITIONER, nguồn Bulkowski] Ascending triangle: "Place a stop loss order on the side opposite the breakout unless that would be too far away"; breakout lên → stop tại một minor low trong mô hình; breakout xuống → stop tại đường ngang phía trên — [at.html](https://thepatternsite.com/at.html).
- [EVIDENCE] H&S top: trang không đưa quy tắc stop cụ thể (không nói "trên vai phải"); vai phải chỉ dùng làm điểm breakout khi neckline dốc xuống — [hst.html](https://thepatternsite.com/hst.html). Quy tắc "stop trên vai phải" phổ biến là [PRACTITIONER] không có nguồn kiểm chứng trong lượt tìm này.
- [EVIDENCE] Trong nghiên cứu entry, stop cố định đặt cách giá mua bằng % chiều cao mô hình (mô hình cao 20% → stop ở 80% giá mua) cho 10–14% lệnh bị stop; trailing stop tăng tỷ lệ bị stop lên ~42% và giảm lợi nhuận TB gần một nửa — [ThrowbackEntry](https://thepatternsite.com/ThrowbackEntry.html).
- [EVIDENCE] Stop-loss tụ ngay sau số tròn: lệnh stop bán tụ ngay dưới số tròn, stop mua ngay trên số tròn; xu hướng tỷ giá nhanh bất thường khi chạm các mức có stop tụ (dữ liệu phút USD/DEM, USD/JPY, USD/GBP 1996–1998) — [Osler, NY Fed Staff Report 150](https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr150.html). Bản Journal of Finance 2003: take-profit tụ mạnh đúng tại số tròn, stop-loss tụ "just beyond" số tròn — [econpapers](https://econpapers.repec.org/RePEc:fip:fednsr:125). Tác giả lưu ý bằng chứng gián tiếp (lệnh stop không công khai) và chưa chứng minh hiệu ứng dây chuyền stop → stop — [sr150.pdf](https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr150.pdf).

### Inferences
- Hợp với quy tắc đã duyệt "stop phía sau vùng S/R thật": trong mô hình, biên đối diện / đáy cuối cùng / neckline là vùng S/R thật. Tuy nhiên chiều cao mô hình lớn (nhất là mô hình nhiều tháng) làm stop rất xa → Bulkowski khuyên bỏ lệnh hoặc dùng stop theo biến động.
- Từ Osler: nếu khách hàng đặt stop ngay sau mức tròn (ví dụ dưới 100.000 USD), stop của họ nằm đúng chỗ dòng stop tụ → dễ bị quét. Suy luận từ FX sang crypto là chưa kiểm chứng.
- [ĐỀ XUẤT] Stop = biên đối diện (hoặc đáy/đỉnh cuối của mô hình) cộng đệm 0,25–0,5×ATR(14) của khung entry, và đẩy qua mức số tròn gần nhất nếu số tròn nằm giữa vùng đệm. Con số 0,25–0,5 là đề xuất, không có nguồn.
- [ĐỀ XUẤT] Quy tắc bỏ lệnh: nếu khoảng cách stop > X×ATR khung entry (ví dụ 3×ATR 4H cho Swing) thì bỏ hoặc chờ retest gần hơn. Chưa backtest.

### Gaps
- Không tìm được nghiên cứu định lượng về độ rộng đệm ATR tối ưu cho stop sau mô hình.
- Không có nghiên cứu học thuật về stop-hunting/số tròn riêng cho BTC perpetual trong lượt tìm này.
- Không có dữ liệu Bulkowski về quy tắc stop cho H&S, flags (trang flags không nêu stop — [flags.html](https://thepatternsite.com/flags.html)).

---

## 3. Mục tiêu giá: tỷ lệ đạt measured move, flagpole, và cách khớp với TP theo vùng S/R 50/30/20

### Takeaway
Bulkowski đo được rằng **chiều cao mô hình chiếu đầy đủ chỉ đạt khoảng 46–73% số lần** tùy mô hình, nên chính ông dùng target = chiều cao × % đạt mục tiêu (target rút ngắn). Measured move đầy đủ hợp làm TP2/TP3 hơn TP1. Không có nguồn kiểm chứng nào về "chọn mục tiêu gần hơn giữa pattern và S/R" — đó là quy tắc thực hành/đề xuất.

### Cited Findings
- [EVIDENCE] Percentage meeting price target (bull market, cổ phiếu):
  - H&S top: 51% (> 2.800 lệnh), break-even failure 19%, giảm TB 16% — [hst.html](https://thepatternsite.com/hst.html). Complex H&S top: 47% (> 650 lệnh) — [chst.html](https://thepatternsite.com/chst.html).
  - Ascending triangle: 70% (breakout lên), 44% (breakout xuống); break-even failure 17% / 38%; tăng TB 43% / giảm 13% — [at.html](https://thepatternsite.com/at.html).
  - Adam & Adam double bottom: 73%, break-even failure 16%, tăng TB 39% — [aadb.html](https://thepatternsite.com/aadb.html).
  - Flags: 46% (lên) / 46% (xuống); break-even failure 44% / 45%; biến động TB chỉ 9% / 8% — [flags.html](https://thepatternsite.com/flags.html).
  - High and tight flag: 82% nhưng với target nửa chiều cao (half-height), 1.028 lệnh, tăng TB 39% — [htf.html](https://thepatternsite.com/htf.html).
- [EVIDENCE] Số liệu khác nhau giữa các phiên bản: H&S được trích 55% (bài BNN Bloomberg cũ) và 83% (bản sách 2005) so với 51% hiện tại — [BNN Bloomberg](https://www.bnnbloomberg.ca/talent/larry-berman-deconstructing-the-head-and-shoulders-trend-1.490532.amp.html), [qwe.edu.pl](https://www.qwe.edu.pl/tutorial/what-is-head-and-shoulders-pattern/). Nên dùng số hiện tại trên site.
- [EVIDENCE/phương pháp] Measure rule của Bulkowski: chiều cao (đầu → neckline; đường ngang → đáy thấp nhất; đỉnh giữa → đáy thấp hơn) × % đạt mục tiêu, cộng/trừ từ giá breakout — [hst.html](https://thepatternsite.com/hst.html), [at.html](https://thepatternsite.com/at.html), [aadb.html](https://thepatternsite.com/aadb.html). Trang double bottom tự mâu thuẫn chỗ cộng từ điểm A hay B — [aadb.html](https://thepatternsite.com/aadb.html).
- [EVIDENCE/phương pháp] Flag: đo cột cờ từ đầu nhịp (A) đến cuối (B), × 46%, cộng vào đáy cờ (breakout lên) hoặc trừ từ đỉnh cờ (breakout xuống) — [flags.html](https://thepatternsite.com/flags.html).
- [EVIDENCE] Mô hình cao (chiều cao/giá breakout trên trung vị) vượt mô hình thấp: 89% với breakout lên, 100% với breakout xuống; độ rộng mô hình là chỉ báo kém — [TradingQuiz](https://thepatternsite.com/TradingQuiz.html), [heightwidth](https://www.thepatternsite.com/heightwidth.html).
- [PRACTITIONER] Measured move của tam giác là "minimum objective" (mục tiêu tối thiểu) — [luxalgo](https://www.luxalgo.com/blog/how-consolidation-and-triangle-patterns-are-a-traders-friend/). Mâu thuẫn với số liệu Bulkowski (chỉ 44–70% đạt đầy đủ).
- [FOLKLORE] Fibonacci extension (1,272 / 1,618) làm mục tiêu mô hình: không tìm được nguồn có số liệu trong lượt tìm này.

### Inferences
- Measured move đầy đủ đạt được chỉ ~1/2 số lần với H&S và flag → không nên dùng làm TP1. Measured move × hệ số Bulkowski (51–73%) gần với khái niệm "mục tiêu đạt được ~đa số lần".
- [ĐỀ XUẤT] Ghép với khung 50/30/20 hiện có (vẫn giữ nguyên tắc TP tại vùng S/R):
  - TP1 (50%) = vùng S/R đầu tiên phía trước; nếu target rút ngắn (chiều cao × % Bulkowski) nằm GẦN hơn vùng S/R đầu tiên thì lấy mức nào gần hơn.
  - TP2 (30%) = vùng S/R gần nhất với measured move đầy đủ (100% chiều cao / cột cờ).
  - TP3 (20%) = vùng S/R kế tiếp hoặc chạy theo trailing (lưu ý trailing stop giảm lợi nhuận TB gần một nửa trong dữ liệu Bulkowski — [ThrowbackEntry](https://thepatternsite.com/ThrowbackEntry.html)).
  - Nếu không có vùng S/R nào gần target pattern, "neo" TP vào vùng S/R gần nhất **trước** target (nguyên tắc đặt TP trước kháng cự).
- [ĐỀ XUẤT] Kiểm tra R:R: nếu TP1 (sau khi lấy mức gần hơn) < 1R so với stop ở biên đối diện mô hình → bỏ lệnh. Flags có break-even failure ~44–45% → cần R:R cao mới đáng trade.

### Gaps
- Không có thống kê "hit rate theo mức %": ví dụ % mô hình đạt 50% / 100% / 150% chiều cao (ngoài các con số đơn lẻ trên).
- Không có nguồn kiểm chứng cho Fibonacci extension.
- Không có nguồn định lượng về việc ưu tiên mục tiêu gần hơn giữa S/R và pattern.
- Không lấy được bảng đầy đủ cho rectangle, symmetrical triangle, descending triangle, H&S bottom, double top trong giới hạn tìm kiếm (có trên thepatternsite từng trang riêng).

---

## 4. Lọc theo biến động: squeeze, ATR%, tầng vốn hoá, khung thời gian (BTC/ETH)

### Takeaway
Ý tưởng "co hẹp biến động → bùng nổ" (NR7, Bollinger squeeze) phổ biến nhưng **không tìm được nghiên cứu backtest đáng tin có chi phí giao dịch**. Bằng chứng duy nhất cho BTC là quy tắc trading range breakout có sức dự báo (2010–2019), mạnh nhất khi thị trường xu hướng rõ. Không có bằng chứng nào cho việc mô hình 15m có giá trị; cũng không có bằng chứng rằng mô hình 15m là nhiễu — đó là khoảng trống.

### Cited Findings
- [PRACTITIONER] NR7 của Toby Crabel: nến có biên độ hẹp nhất 7 phiên, ý tưởng co hẹp → giãn nở — [quantifiedstrategies](https://quantifiedstrategies.substack.com/p/price-compression-trading-strategy).
- [PRACTITIONER] Bollinger squeeze phát hiện co hẹp qua BandWidth, nhưng hướng bùng nổ không xác định, có cảnh báo "head-fake" (bẫy giả) của Bollinger — [luxalgo squeeze](https://www.luxalgo.com/library/concept/squeeze-release-direction.md).
- [FOLKLORE] Các script NR4/NR7 trên TradingView mô tả là "đã được nghiên cứu" nhưng không dẫn nghiên cứu nào; tự tuyên bố là công cụ giáo dục — [TradingView NR4/NR7](https://kr.tradingview.com/script/j2K2S9sB-NR4-NR7-Volatility-Squeeze-Breakouts).
- [EVIDENCE] Gerritsen, Bouri, Ramezanifar, Roubaud (Finance Research Letters 34, 101263, 5/2020): BTC giá ngày 7/2010–1/2019, 7 quy tắc trend-following; quy tắc trading range breakout có sức dự báo có ý nghĩa và vượt buy-and-hold theo Sharpe ratio (bootstrap); giá trị cao nhất trong thị trường xu hướng mạnh — [Utrecht research portal](https://research-portal.uu.nl/en/publications/the-profitability-of-technical-trading-rules-in-the-bitcoin-marke/).
- [EVIDENCE] Flags hoạt động tốt hơn khi cờ chặt (tight), gần nền phẳng, breakout trong 1/3 dưới của biên năm — [flags.html](https://thepatternsite.com/flags.html). Đây là bằng chứng gián tiếp ủng hộ "co hẹp tốt hơn".
- [EVIDENCE] Mô hình cao (so với giá) chạy xa hơn mô hình thấp (89%/100%) — [TradingQuiz](https://thepatternsite.com/TradingQuiz.html). Điều này có vẻ **ngược hướng** với giả thuyết "co hẹp càng nhiều càng tốt": chiều cao mô hình tương đối lớn mới là yếu tố có số liệu.
- [EVIDENCE] Breakout volume cao làm tăng xác suất throwback (57% vs 18%) — [VolumeStudy](https://thepatternsite.com/VolumeStudy.html).
- [EVIDENCE] Lo, Mamaysky, Wang (Journal of Finance 2000, cổ phiếu Mỹ 1962–1996): nhận dạng mô hình tự động bằng kernel regression; một số mô hình (H&S, double bottom...) cung cấp "incremental information" và "may have some practical value" — [MIT](https://web.mit.edu/Alo/www/Papers/techanal.html), [NBER w7613](https://www.nber.org/papers/w7613). Lưu ý: "thông tin gia tăng" về phân phối lợi suất, không phải lợi nhuận sau phí.
- [EVIDENCE] Savin, Weller, Zvingelis (J. Financial Econometrics 2007, bản nháp): S&P 500 và Russell 2000 1990–1999, chiến lược H&S có lợi suất vượt trội điều chỉnh rủi ro ~5–7%/năm, một phần nhờ chọn được cổ phiếu momentum âm — [bản nháp, U. Iowa](https://www.biz.uiowa.edu/faculty/gsavin/papers/HSrevision_paw_10%2019%2006.pdf).

### Inferences
- Gợi ý từ Gerritsen et al. + Savin et al.: mô hình có tác dụng tốt hơn **khi cùng chiều xu hướng lớn** (breakout trong thị trường xu hướng mạnh; H&S top trên tài sản có momentum âm). Điều này khớp với kiến trúc Coin Radar (khung xu hướng lọc khung entry).
- [ĐỀ XUẤT] Cổng (gate) áp dụng mô hình, chưa backtest:
  1. Chỉ nhận mô hình thuận chiều xu hướng khung lớn (1D cho Swing; 1H cho Fast), riêng mô hình đảo chiều (H&S, double top/bottom) chỉ chấp nhận khi đã có dấu hiệu gãy xu hướng ở khung lớn.
  2. Chiều cao mô hình / giá breakout ≥ k×ATR%(14) khung entry (ví dụ k = 3) — để mục tiêu đủ xa so với nhiễu; dựa trên phát hiện "mô hình cao chạy xa hơn".
  3. Co hẹp biến động (ví dụ BandWidth hoặc ATR% ở phân vị thấp của 100 nến gần nhất) chỉ dùng làm điểm cộng, không làm điều kiện bắt buộc, vì thiếu bằng chứng.
  4. Giới hạn ở coin thanh khoản cao (BTC, ETH và nhóm vốn hoá lớn) — lý do: mô hình được định nghĩa bằng mức giá rõ ràng; coin mỏng thanh khoản dễ bị râu nến phá giả. Đây là suy luận, không có số liệu.
- [ĐỀ XUẤT] Khung thời gian: ưu tiên 4H/1D cho nhận dạng mô hình ở chế độ Swing; 1W chỉ làm bối cảnh (xem mục 5). Với Fast (15m), chỉ chấp nhận mô hình nhỏ (flag/range) trùng với vùng S/R của 1H; không giao dịch H&S/double top 15m độc lập. Không có số liệu ủng hộ hay bác bỏ.

### Gaps
- Không tìm được nghiên cứu học thuật/backtest có kiểm soát về NR7 hay Bollinger squeeze (cần tìm bài gốc của Crabel 1990 "Day Trading with Short Term Price Patterns and Opening Range Breakout" hoặc nghiên cứu Bollinger có tính phí).
- Không có dữ liệu ATR% chuẩn của BTC/ETH trong nguồn đã đọc (giả định "BTC daily ATR% ~2–4%" trong đề bài chưa được kiểm chứng ở đây — nên tính từ dữ liệu Binance).
- Không có nghiên cứu về hiệu suất mô hình theo tầng vốn hoá crypto hay theo khung thời gian intraday.
- Không tìm được nghiên cứu Kaiko/Glassnode/Binance Research về mô hình biểu đồ.

---

## 5. Mô hình lớn (range nhiều tháng, tích luỹ/phân phối, mô hình tuần của BTC): bối cảnh hay tín hiệu vào lệnh

### Takeaway
Không có thống kê hệ thống cho mô hình tuần của BTC; mọi ví dụ lịch sử đều là giai thoại. Người hành nghề dùng range lớn chủ yếu để xác định **mức then chốt và thiên hướng (bias)**, đòi hỏi xác nhận chặt (ví dụ Brandt đòi giữ trên 76.000 USD mới tính là breakout thật).

### Cited Findings
- [PRACTITIONER, giai thoại] Sau ATH 73.700 USD (3/2024), BTC vào giai đoạn tích luỹ sau khi không giữ được trên 70.000; tác giả coi giữ trên 70.000 là điều kiện cho xu hướng tăng tiếp — [TradingView, SasanSeifi](https://vn.tradingview.com/chart/BTCUSD/JOw3seZp-SasanSeifi-A-Quick-Overview-of-Bitcoin-s-Movement).
- [PRACTITIONER, giai thoại] Peter Brandt: "true breakout" cần BTC củng cố trên 76.000 USD (khi giá ~72.556, cách ATH 73.737 ngày 14/3 khoảng 1,5%) — [Forklog](https://forklog.com/en/?p=18184). Ngày bài viết không rõ trong trích đoạn.
- [PRACTITIONER, giai thoại, 2026] Từ đáy năm 60.000 USD ngày 6/2, BTC giao dịch trong biên hẹp 60.000–74.000 USD — [Cointelegraph](https://cointelegraph.com/news/bitcoin-price-direction-consolidation-breakout-crypto-analyst). Kết quả breakout của range này chưa được xác minh trong lượt tìm.
- [FOLKLORE] Nhiều bài về H&S trên BTC (TradingView, blog sàn) không có số liệu hệ thống — [FXStreet](https://www.fxstreet.com/amp/analysis/head-shoulders-would-it-work-on-bitcoin-201709071040), [BYDFi](https://www.bydfi.com/en/cointalk/bitcoin-head-and-shoulders-pattern).
- [EVIDENCE] Mô hình cao chạy xa hơn — áp dụng cho mô hình lớn theo nghĩa chiều cao/giá — [TradingQuiz](https://thepatternsite.com/TradingQuiz.html).

### Inferences
- Range nhiều tháng tự nó tạo ra các vùng S/R mạnh nhất (biên trên/dưới) → hợp với cơ chế TP/SL theo vùng S/R sẵn có: dùng biên range làm vùng, không cần lệnh riêng cho "mô hình lớn".
- [ĐỀ XUẤT] Mô hình 1W/1D nhiều tháng = **bối cảnh**: (a) đặt thiên hướng Long/Short cho cả hai chế độ; (b) cấm Long ngay dưới biên trên chưa phá / cấm Short ngay trên biên dưới; (c) khi breakout tuần xác nhận (đóng nến tuần), chuyển các tín hiệu 4H thuận chiều thành ưu tiên. Không dùng breakout tuần làm lệnh vào trực tiếp vì stop ở biên đối diện quá xa so với giới hạn giữ ≤ 21 ngày.
- [ĐỀ XUẤT] Ngưỡng xác nhận breakout range lớn: đóng cửa 1D ngoài biên + đệm (ví dụ ≥ 0,5×ATR 1D) hoặc 2 nến 1D liên tiếp ngoài biên; tương tự cách Brandt đòi mức cao hơn ATH. Chưa backtest.

### Gaps
- Không có bộ dữ liệu ví dụ BTC 2019–2026 với kết quả đã kiểm chứng (ví dụ range 2024, H&S 2021, bear flag 2022); cần dựng thủ công từ dữ liệu Binance và đánh dấu là giai thoại.
- Kết cục range 2024 (60k–73k) không có nguồn ngày tháng rõ trong lượt tìm; kiến thức sẵn có cho thấy BTC vượt 73k cuối 2024 và lập đỉnh mới tháng 12/2024, nhưng CHƯA kiểm bằng nguồn trong ghi chú này.

---

## 6. Đặc thù futures: breakout và thanh lý dây chuyền, funding tăng vọt, phá giả quanh số tròn

### Takeaway
Breakout trên perpetual có thể bị khuếch đại bởi thanh lý dây chuyền (ví dụ 10/2025: 2,3 tỷ USD bị thanh lý trong một ngày, 86% là Long). Sau khi đòn bẩy bị xả và funding bình thường lại, giá thường cân bằng lại — nghĩa là breakout do thanh lý dễ hồi. Funding không còn là tín hiệu đáng tin tuyệt đối do vị thế basis lớn (Ethena).

### Cited Findings
- [EVIDENCE, dữ liệu sự kiện] 10/2025: 2,3 tỷ USD thanh lý trong một ngày, 86% từ Long bị buộc bán — [Amberdata](https://blog.amberdata.io/leverage-liquidations-the-31b-deleveraging). Open interest perpetual giảm 35% từ đỉnh tháng 10, 94 → 61 tỷ USD (theo CoinGlass) — [CoinChange](https://www.coinchange.io/blog/bitcoins-2-billion-reckoning-how-novembers-liquidations-cascade-exposed-cryptos-structural-fragilities).
- [PRACTITIONER] Sau khi vị thế bị buộc đóng được xả hết và funding bình thường lại, thanh khoản quay về và giá cân bằng lại — [CoinChange](https://www.coinchange.io/blog/bitcoins-2-billion-reckoning-how-novembers-liquidations-cascade-exposed-cryptos-structural-fragilities).
- [PRACTITIONER] Vị thế basis lớn (Ethena) làm funding bị kéo thấp nhân tạo → funding kém tin cậy làm tín hiệu cảnh báo — [CoinChange](https://www.coinchange.io/blog/bitcoins-2-billion-reckoning-how-novembers-liquidations-cascade-exposed-cryptos-structural-fragilities).
- [PRACTITIONER] Funding cao kéo dài (> 15% năm hoá) trong lịch sử đi trước các đợt điều chỉnh — [Amberdata](https://blog.amberdata.io/leverage-liquidations-the-31b-deleveraging). Không có kiểm định thống kê.
- [EVIDENCE, nguồn thứ cấp] Kaiko ước tính BTC perpetual chiếm ~68% khối lượng giao dịch BTC năm 2025 — trích qua [Amberdata](https://blog.amberdata.io/leverage-liquidations-the-31b-deleveraging).
- [FOLKLORE] Ngưỡng tự đặt: OI giảm > 15% trong 48h kèm giá giảm > 8% = tín hiệu cascade — [axeladlerjr.com](https://axeladlerjr.com/bitcoin-liquidation-cascades-guide/). Heuristic cá nhân chưa kiểm chứng.
- [EVIDENCE, FX] Stop tụ quanh số tròn và xu hướng tăng tốc khi chạm các mức đó — [Osler, NY Fed](https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr150.html) (xem mục 2). Áp dụng cho crypto là suy luận.

### Inferences
- Breakout mô hình trên perpetual nên được kiểm tra xem có phải do thanh lý (OI giảm mạnh trong nến breakout) hay do vị thế mới (OI tăng). Breakout có OI giảm mạnh = "quét thanh lý", dễ bị bust; breakout có OI tăng + volume taker thuận chiều = dòng tiền thật. Đây là suy luận từ cơ chế, chưa có nghiên cứu.
- [ĐỀ XUẤT] Bộ lọc futures khi vào lệnh mô hình (chưa backtest):
  1. Không vào market ngay trên nến breakout có thanh lý đột biến (OI giảm > một ngưỡng so với trung vị) — chuyển sang chờ đóng nến tiếp theo xác nhận giữ được mức phá.
  2. Breakout lên khi funding đã ở mức cực đoan → giảm khối lượng hoặc chỉ nhận TP1.
  3. Stop và mức breakout cách xa số tròn lớn (ví dụ bội số 5.000 USD với BTC); nếu breakout trùng số tròn, đòi đệm thêm.
- Tỷ lệ bust mô hình ~19% (cổ phiếu) có thể cao hơn trong crypto đòn bẩy cao do cascade — chưa có dữ liệu.

### Gaps
- Không tìm được báo cáo gốc của Kaiko/Glassnode/Binance Research về mối quan hệ breakout – funding – thanh lý (chỉ có nguồn thứ cấp).
- Không có nghiên cứu định lượng về fake-out quanh số tròn của BTC.
- Không có thống kê tỷ lệ bust mô hình trong perpetual crypto.
