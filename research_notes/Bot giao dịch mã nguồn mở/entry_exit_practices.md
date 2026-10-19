# Cách các bot phổ biến đặt ENTRY / STOP-LOSS / TAKE-PROFIT và quản lý lệnh đang mở

Ngày tra cứu: 2026-10-19. Nhãn: [EVIDENCE] = nghiên cứu hoặc backtest mẫu lớn có phương pháp công khai; [PRACTITIONER] = tài liệu chính thức của bot hoặc cấu hình thực tế được dùng rộng rãi; [FOLKLORE] = lời khuyên phổ biến, không có dữ liệu. Đề xuất riêng của researcher được đánh dấu **[ĐỀ XUẤT]**.

Bối cảnh so sánh (luật hiện tại của Coin Radar): SL đặt sau vùng S/R mạnh + 0.3×ATR; TP1/TP2/TP3 trước 3 vùng kháng cự tiếp theo, chốt 50/30/20; dời SL về giá khớp thật sau TP1; vào lệnh market nếu cách vùng ≤0.5×ATR, ngược lại đặt limit ở mép vùng (hết hạn 24h/2h).

---

## Câu hỏi 1: Những sơ đồ thoát lệnh (exit) nào phổ biến nhất, và tham số mặc định điển hình là gì?

### Takeaway
Có hai "trường phái" tách bạch: (a) bot định lượng (Freqtrade, Jesse) thoát theo **% lợi nhuận/thời gian (ROI table) + stoploss % cố định hoặc trailing**, hiếm khi dùng S/R; (b) các nền tảng copy tín hiệu (Cornix, 3Commas) dùng **vùng entry + nhiều TP + SL + dời SL về hòa vốn / về TP trước sau mỗi TP** — rất gần với luật hiện tại của Coin Radar. Không nền tảng nào công bố bằng chứng rằng phân bổ 50/30/20 tốt hơn phân bổ khác.

### Cited Findings

**Freqtrade — stoploss & trailing (tài liệu chính thức) [PRACTITIONER]**
- `stoploss = -0.10` nghĩa là thoát khi lợi nhuận < −10%; phí đã được tính vào phép tính — [Freqtrade Stoploss](https://www.freqtrade.io/en/stable/stoploss/)
- `trailing_stop=True`: stop đi theo giá cao nhất; `trailing_stop_positive=0.02` = khoảng trail 2% khi đã lãi; `trailing_stop_positive_offset=0.03` = chỉ bật trail dương khi lãi ≥3%; `trailing_only_offset_is_reached` mặc định `False` (nếu `True`, stop giữ nguyên ở `stoploss` gốc cho tới khi đạt offset) — [Freqtrade Stoploss](https://www.freqtrade.io/en/stable/stoploss/)
- Cảnh báo chính thức: `trailing_stop_positive_offset` phải **thấp hơn** minimal ROI, nếu không ROI sẽ chốt trước; với đòn bẩy 10x, stoploss 10% kích hoạt ở biến động giá 1% — [Freqtrade Stoploss](https://www.freqtrade.io/en/stable/stoploss/)
- `stoploss_on_exchange` mặc định `False`; tài liệu khuyên dùng stop-market thay vì stop-limit vì limit có thể không khớp khi sập giá; `stoploss_price_type` cho futures chọn `"last"`, `"mark"`, `"index"` — [Freqtrade Stoploss](https://www.freqtrade.io/en/stable/stoploss/)

**Freqtrade — custom_stoploss (các mẫu trong tài liệu) [PRACTITIONER]**
- Trail cố định 4%; trail theo thời gian (giữ stop gốc 60 phút đầu, sau đó −10%, sau 120 phút −5%) — [Freqtrade Strategy Callbacks](https://www.freqtrade.io/en/stable/strategy-callbacks/)
- "Trail có offset": dưới 4% lãi giữ stop gốc; trên 4% stop = lãi/2, kẹp trong khoảng 2.5%–5% — [Freqtrade Strategy Callbacks](https://www.freqtrade.io/en/stable/strategy-callbacks/)
- "Step/breakeven kiểu bậc thang": lãi >20% → stop lên +7% trên giá mở; >25% → +15%; >40% → +25% (dùng `stoploss_from_open`) — [Freqtrade Strategy Callbacks](https://www.freqtrade.io/en/stable/strategy-callbacks/)
- Stop theo chỉ báo: Parabolic SAR làm giá stop tuyệt đối (`stoploss_from_absolute`); ví dụ helper trail 2×ATR(14) dưới giá hiện tại — [Freqtrade Strategy Callbacks](https://www.freqtrade.io/en/stable/strategy-callbacks/)
- `custom_exit` mẫu: lãi >20% và RSI <80 → thoát; lệnh lỗ giữ ≥1 ngày → thoát "unclog" (time-stop cho lệnh lỗ) — [Freqtrade Strategy Callbacks](https://www.freqtrade.io/en/stable/strategy-callbacks/)

**Freqtrade — adjust_trade_position (chốt từng phần / DCA) [PRACTITIONER]**
- Mẫu `DigDeeperStrategy`: `stoploss=-0.30`, tối đa 3 lần bồi thêm, tổng vốn tối đa 5.5× lệnh đầu (1 + 1.25 + 1.5 + 1.75); bồi khi lãi < −5%; **chốt một nửa khi lãi >5%** (tag `half_profit_5%`) — [Freqtrade Strategy Callbacks](https://www.freqtrade.io/en/stable/strategy-callbacks/)
- Cảnh báo: callback chạy mỗi ~5 giây khi live, logic lỏng có thể đặt lệnh lặp; kết quả backtest có thể khác live; **stoploss vẫn tính từ giá mở ban đầu, không phải giá trung bình** — [Freqtrade Strategy Callbacks](https://www.freqtrade.io/en/stable/strategy-callbacks/)

**NostalgiaForInfinity X6 (strategy cộng đồng nổi tiếng nhất của Freqtrade) [PRACTITIONER]**
- Khung 5m; `stoploss = -0.99` (thực chất vô hiệu stoploss cứng); `use_custom_stoploss=False`; `trailing_stop=False` — [NFI X6 source](https://raw.githubusercontent.com/iterativv/NostalgiaForInfinity/main/NostalgiaForInfinityX6.py)
- Thay cho SL truyền thống: "stop threshold" 10% (thường), "doom stop" 20%, cùng nhiều mức "derisk" (ví dụ futures −0.60; grinding v2 futures các bậc −0.18/−0.35, −0.16/−0.54, −0.30/−0.60) và cơ chế "grinding" (mua thêm/chốt dần, tối đa 20 lần grind+buyback) — [NFI X6 source](https://raw.githubusercontent.com/iterativv/NostalgiaForInfinity/main/NostalgiaForInfinityX6.py)
- Futures mặc định đòn bẩy 3.0 — [NFI X6 source](https://raw.githubusercontent.com/iterativv/NostalgiaForInfinity/main/NostalgiaForInfinityX6.py)
- (Lưu ý: chỉ đọc được 100k/2.9 triệu ký tự đầu của file; `minimal_roi` không nằm trong đoạn đã đọc.)

**Jesse [PRACTITIONER]**
- Lệnh định nghĩa bằng tuple `(qty, price)`: `self.buy`, `self.stop_loss`, `self.take_profit`; chốt từng phần bằng list, ví dụ `self.take_profit = [(qty/2, 120), (qty/2, 140)]`; entry cũng có thể chia nhiều mức — [Jesse docs: Entering and exiting](https://docs.jesse.trade/docs/strategies/entering-and-exiting)
- Jesse tự chọn loại lệnh: giá entry bằng giá hiện tại → MARKET; thấp hơn (long) → LIMIT; cao hơn → STOP — [Jesse docs](https://docs.jesse.trade/docs/strategies/entering-and-exiting)
- `update_position()` dùng để trail TP/SL, thoát theo điều kiện (ví dụ RSI = 100 → `liquidate()`), hoặc bồi thêm khi lãi >5% và RSI <30 — [Jesse docs](https://docs.jesse.trade/docs/strategies/entering-and-exiting)

**Cornix (copy tín hiệu Telegram) [PRACTITIONER]**
- 5 kiểu trailing stop: Off; **Breakeven** (dời stop về giá entry trung bình khi chạm trigger — trigger là 1 target hoặc 1 % vượt entry); **Moving Target** (stop dời về giá target trước đó; trigger mặc định = TP1, tức chạm TP1 → stop về hòa vốn, TP2 → stop về TP1...); **Moving 2-Target** (lùi 2 target, mặc định bắt đầu từ TP2); **Percent Below Triggers**; **Percent Below Highest** — [Cornix Help: Trailing Stop Loss](https://intercom.help/cornix/en/articles/5814874-trailing-stop-loss)
- Phản hồi người dùng: không kết hợp được Breakeven và Moving Target cùng lúc — [Cornix feature board](https://cornix.nolt.io/329) (yêu cầu tính năng, có thể đã lỗi thời)

**3Commas / TradingView [PRACTITIONER]**
- 3Commas SmartTrade: TP nhiều bậc, trailing stop-loss, stop-limit (nguồn thứ ba, không phải tài liệu chính thức) — [toolworthy.ai](https://www.toolworthy.ai/tool/3commas)
- Pine Script `strategy.exit` nhận `qty_percent`, `profit`, `limit`, `loss`, `stop`, `trail_points`, `trail_offset`; `strategy.close` đóng từng phần bằng `qty`/`qty_percent` — [QuantNomad](https://quantnomad.com/?p=6214)
- Tham số trailing của `strategy.exit` tính bằng **tick** chứ không phải đơn vị giá; % phải quy đổi qua `syminfo.mintick` — [TradingView open-source script](https://www.tradingview.com/script/uakAuWEg)
- Một mẫu cộng đồng phổ biến: chốt 1/3 tại 1R, 2R, 3R, dời SL về hòa vốn sau TP1 — [TradingView: Break Retest Scale](https://de.tradingview.com/script/MFZfW0AE-Break-Retest-Scale-v1)

**Chandelier exit — mặc định [PRACTITIONER]**
- Stop long = đỉnh cao nhất N nến − k×ATR; mặc định phổ biến N = 22, k = 3.0 — [LuxAlgo Chandelier](https://www.luxalgo.com/library/indicator/tV4GQ8w0-chandelier-exit-atr-trailing-stop-atr-bands); biến thể k = 2.5, N = 14 trên Optuma, nhấn mạnh tính "ratchet" (chỉ đi một chiều) — [Optuma forum](https://forum.optuma.com/t/backtesting-atr/3839)

### Inferences
- Luật Coin Radar (TP theo S/R + SL về entry sau TP1) gần như trùng với "Cornix Moving Target" mặc định — tức là đây đã là chuẩn phổ biến của giới copy-signal, không phải tự chế. Khác biệt: Cornix Moving Target sau TP2 dời SL lên TP1 (khóa lãi bậc thang), Coin Radar hiện chỉ dời về entry.
- Bot định lượng phổ biến nhất (NFI) gần như **không dùng SL chặt**, mà dựa vào DCA/grinding + đòn bẩy thấp (3x). Đây là triết lý khác hẳn (win rate cao, đuôi lỗ lớn) — **không nên** sao chép cho futures đòn bẩy của Coin Radar.
- Không tìm thấy nguồn chính thức nào khẳng định "phân bổ TP mặc định" là 50/30/20, 33/33/34 hay 25/25/50.

### Gaps
- Không tìm được tài liệu chính thức về các kiểu phân bổ TP của Cornix (ví dụ "Evenly Divided") — chỉ có phản hồi người dùng nói Cornix chia đều sau TP1 ([cornix.nolt.io/687](https://cornix.nolt.io/687)).
- Không xác minh được tính năng "move SL to breakeven" của 3Commas và WunderTrading từ tài liệu chính thức.
- Chưa đọc được bảng `minimal_roi` của NFI X6 (file 2.9 MB).

---

## Câu hỏi 2: Sơ đồ nào có bằng chứng đáng tin (win rate vs expectancy)?

### Takeaway
Bằng chứng học thuật ủng hộ **stop-loss/trailing stop trong chiến lược có động lượng (momentum/trend)**, chủ yếu giúp **giảm drawdown**, còn tác dụng lên lợi nhuận kỳ vọng thì không chắc. **Không có** nghiên cứu nghiêm túc nào về "dời SL về hòa vốn sau TP1" hay về các tỷ lệ chốt từng phần — đó là [FOLKLORE]/[PRACTITIONER]. Một backtest mẫu lớn (105k lệnh cổ phiếu) cho thấy trailing stop chặt **làm giảm** lợi nhuận/lệnh.

### Cited Findings
- [EVIDENCE] Kaminski & Lo (Journal of Financial Markets 18, 2014): dưới giả thuyết bước ngẫu nhiên, stop-loss 0/1 **luôn làm giảm** lợi nhuận kỳ vọng; khi có momentum, stop-loss có thể tạo giá trị; với dữ liệu futures chỉ số, một số stop-loss tăng lợi nhuận kỳ vọng và giảm mạnh biến động ở tần suất dài — [MIT DSpace](https://dspace.mit.edu/handle/1721.1/114876). (Các nguồn thứ cấp mâu thuẫn về giai đoạn dữ liệu: 1950–2004 cổ phiếu Mỹ theo [KTH seminar](https://www.math.kth.se/matstat/seminarier/080211.htm) vs 1993–2011 futures.)
- [EVIDENCE, nguồn thứ cấp] Han, Zhou & Zhu (2014) "Taming Momentum Crashes": stop-loss 10% so với giá đầu tháng trên danh mục momentum Mỹ 1926–2011 giảm mạnh rủi ro sập momentum — [Quant Investing](https://www.quant-investing.com/blog/truths-about-stop-losses-that-nobody-wants-to-believe), [Seeking Alpha](https://seekingalpha.com/article/3257295-momentum-and-stop-losses) (chưa đọc bản gốc).
- [EVIDENCE, tự công bố] 105,708 lệnh Russell 1000 trong 26 năm (entry: đóng cửa trên MA200, khớp mở cửa phiên sau): trailing stop "give-back" chặt nhất −0.14%/lệnh (t = −3.6); kênh đáy đóng cửa 5 ngày −0.17%/lệnh (t = −2.5) và cắt 2/3 số lệnh; Donchian-low trung bình +0.24%/lệnh; **thoát theo thời gian** trung bình +0.52%/lệnh, 12 tháng 1.03%/lệnh — [setup4alpha](https://setup4alpha.substack.com/p/trailing-stop-vs-fixed-stop-tested). Hạn chế: cổ phiếu, phần lớn kết quả bị paywall, không có hiệu ứng danh mục.
- [EVIDENCE, crypto] Zarattini, Pagani & Barbon (2025) "Catching Crypto Trends": entry = đóng cửa vượt max đóng cửa N ngày (N = 5…360); exit = **trailing stop hằng ngày = max(stop hôm qua, điểm giữa của max/min đóng cửa N ngày)**; size theo biến động mục tiêu 25%/năm, đòn bẩy tối đa 200%; dữ liệu không survivorship bias 2010–3/2025; phí thử 0.10/0.25/0.50% — [CXO Advisory](https://www.cxoadvisory.com/?p=46798). Chưa lấy được số Sharpe/drawdown (paywall).
- [EVIDENCE yếu, preprint] AdaptiveTrend (arXiv 2602.11708): bỏ trailing stop động làm Sharpe giảm 2.41 → 1.68, max drawdown tệ hơn −12.7% → −22.4% — [arXiv](https://arxiv.org/pdf/2602.11708). Tác giả tự backtest, chưa phản biện.
- [EVIDENCE yếu, luận văn cử nhân] Trailing stop trên BTC 2020–2025: cấu hình tốt nhất nâng Sharpe 0.80 → 1.47, drawdown −76.6% (buy & hold) → −53.9%; kết quả phụ thuộc mạnh vào tham số và logic vào lại — [TH Köln](https://publiscologne.th-koeln.de/files/2830/BA_Trutnau_Rosales_Pablo.pdf). Lưu ý: "cấu hình tốt nhất" = chọn sau khi xem kết quả → nguy cơ overfit.
- [PRACTITIONER] Tỷ lệ R:R cao hơn thường làm giảm win rate nhưng có thể tăng expectancy nếu lãi trung bình tăng nhanh hơn — [Backtrex](https://backtrex.com/en/blog/risk-reward-ratio-backtesting-optimization)
- [PRACTITIONER, tự báo cáo] Mẫu chốt 1/3 tại 1R/2R/3R + breakeven sau TP1: PF 2.10, win rate 52%, MaxDD 11.9% (MYM 5 phút) — [TradingView](https://de.tradingview.com/script/MFZfW0AE-Break-Retest-Scale-v1); EMA cross BTCUSDT 1H (1–5/2025) có TP từng phần + breakeven sau TP1: win rate 62.8%, R:R 1:1.25, phí 0.10%/chiều, trượt giá 0.05% — [TradingView](https://es.tradingview.com/script/GRTkk75x-Backtesting-System). Mẫu nhỏ, chưa kiểm chứng.
- [FOLKLORE] Breakeven quá sớm hay bị quét bởi nhịp hồi bình thường rồi giá mới chạy — [ATAS](https://atas.net/blog/break-even-in-trading/); chỉ nên dời khi giá đã vượt một mức có ý nghĩa — [BabyPips forum](https://forums.babypips.com/t/should-i-breakeven/1244035)

### Inferences
- Bằng chứng nhất quán nhất: **stop ratchet rộng theo cấu trúc/trend (Donchian-midpoint, Chandelier 3×ATR)** giúp giảm drawdown trong chiến lược trend; **stop chặt** (give-back nhỏ, kênh 5 ngày) làm hại lợi nhuận. Điều này ủng hộ việc Coin Radar giữ SL theo cấu trúc + buffer ATR thay vì % cố định.
- "Dời SL về hòa vốn sau TP1" tăng win rate (nhiều lệnh thành 0R thay vì −1R) nhưng chưa có bằng chứng tăng expectancy; trên nến crypto nhiều râu, nguy cơ bị quét cao. Đây là **ứng viên số 1 cho A/B test**.
- Thoát theo thời gian ("time stop") có kết quả tốt bất ngờ trong mẫu lớn cổ phiếu và được Freqtrade dùng (lệnh lỗ ≥1 ngày → thoát) — đáng thử.

### Gaps
- Không có nghiên cứu được phản biện nào so sánh 50/30/20 vs 33/33/34 vs 25/25/50 trên crypto.
- Không có dữ liệu crypto mẫu lớn về breakeven-after-TP1.
- Không lấy được số liệu Sharpe/drawdown của Zarattini et al. và Han-Zhou-Zhu bản gốc.

---

## Câu hỏi 3: Entry timing và các cơ chế bảo vệ (protections) — mặc định thế nào?

### Takeaway
Chuẩn chung là **ra quyết định khi nến đóng**, khớp ở giá mở nến kế tiếp; giá limit tùy chỉnh bị giới hạn khoảng cách (Freqtrade mặc định 2%). Cooldown/StoplossGuard/MaxDrawdown là "cầu chì" chuẩn trong Freqtrade với ví dụ mặc định cụ thể.

### Cited Findings
- [PRACTITIONER] Backtest Freqtrade: entry khớp ở giá **mở** nến (trừ khi có custom price); exit-signal khớp ở mở nến sau; không tính slippage nếu giá nằm trong high/low nến — [Freqtrade Backtesting](https://www.freqtrade.io/en/stable/backtesting/)
- [PRACTITIONER] `custom_entry_price`: ví dụ dùng dải Bollinger dưới; khoảng cách tối đa mặc định so với giá đề xuất là 2% (`custom_price_max_distance_ratio`); giá custom chỉ dùng cho lệnh limit — [Freqtrade Strategy Callbacks](https://www.freqtrade.io/en/stable/strategy-callbacks/)
- [PRACTITIONER] Jesse: entry dưới giá hiện tại → LIMIT (chờ retest), trên → STOP (breakout), bằng → MARKET; `should_cancel_entry()` quyết định hủy lệnh chưa khớp — [Jesse docs](https://docs.jesse.trade/docs/strategies/entering-and-exiting)
- [PRACTITIONER] Protections Freqtrade (ví dụ trong tài liệu): **StoplossGuard** — 4 lần dính SL trong 24 nến → khóa mọi cặp 4 nến (có tùy chọn `only_per_pair`, `only_per_side` cho futures); **MaxDrawdown** — mode "equity", nhìn lại 48 nến, ≥20 lệnh, drawdown >20% → dừng 12 nến; **LowProfitPairs** — cặp có tổng lãi <2% trong 6 nến (≥2 lệnh) → khóa 60 phút; **CooldownPeriod** — khóa cặp 2 nến sau khi thoát lệnh — [Freqtrade Protections](https://www.freqtrade.io/en/stable/plugins/)
- [PRACTITIONER] Pine: `calc_on_every_tick=true` chỉ tính lại trên nến realtime, nến lịch sử tính khác → backtest/live lệch — [TradingView script](https://www.tradingview.com/script/uakAuWEg)

### Inferences
- Luật Coin Radar (market nếu ≤0.5×ATR, limit ở mép vùng, hết hạn 24h/2h) tương đương Jesse LIMIT + `should_cancel_entry` theo thời gian — hợp chuẩn.
- Coin Radar chưa có cơ chế tương đương StoplossGuard / CooldownPeriod theo cặp và theo chiều (long/short).

### Gaps
- Không tìm được nghiên cứu định lượng về "cooldown sau lệnh thua" hay "vào lệnh retest vs vào ngay khi breakout" trên crypto.

---

## Câu hỏi 4: Các cạm bẫy đã được ghi nhận (overfit ROI table, hyperopt, sai lệch backtest)?

### Takeaway
Tài liệu Freqtrade tự cảnh báo: giá trị chính xác hơn 0.001 thường là overfit; hyperopt chạy lại với seed khác cho kết quả khác; và backtest có các giả định trong-nến (low trước high, SL trước ROI) khiến kết quả lệch so với live. ROI table 4 bậc do hyperopt sinh ra là nguồn overfit kinh điển.

### Cited Findings
- [PRACTITIONER] Hyperopt: "mọi giá trị chính xác hơn [0.001] thường dẫn đến kết quả overfit"; các lần chạy khác random state "rất có thể cho kết quả khác" — [Freqtrade Hyperopt](https://www.freqtrade.io/en/stable/hyperopt/)
- [PRACTITIONER] ROI table mặc định 4 bậc; ví dụ khung 1h: bậc 1 lãi 6.8%–71.1% ở phút 0, bậc 4 về 0% sau 360–2640 phút; khoảng tìm stoploss mặc định −0.35 đến −0.02; trailing_stop_positive 0.02–0.35, offset 0.01–0.1 — [Freqtrade Hyperopt](https://www.freqtrade.io/en/stable/hyperopt/)
- [PRACTITIONER] Giả định backtest Freqtrade: trong một nến giả định **low xảy ra trước high**; thứ tự xét: exit signal → stoploss → ROI → trailing; stoploss xét trước ROI nên backtest có thể nhiều lệnh SL hơn live; ROI chốt đúng mức ROI dù high vượt xa; `--timeframe-detail` (ví dụ 5m cho chiến lược 1h) mô phỏng chuyển động trong nến — [Freqtrade Backtesting](https://www.freqtrade.io/en/stable/backtesting/)
- [PRACTITIONER] `minimal_roi` quá thấp sẽ "chặn trần" lợi nhuận, quá cao gần như không bao giờ chạm — [Freqtrade Backtesting](https://www.freqtrade.io/en/stable/backtesting/)
- [PRACTITIONER] Kho freqtrade-strategies chính thức: chỉ để học, không bảo hành, kết quả phụ thuộc mạnh vào cặp/khung/giai đoạn, "một số chỉ chạy trong điều kiện thị trường nhất định" — [GitHub freqtrade-strategies](https://github.com/freqtrade/freqtrade-strategies)
- [FOLKLORE/giai thoại] Một dev báo hyperopt 150 epoch cho chiến lược tệ hơn 4 lần ngoài mẫu so với tham số chỉnh tay — [hackclub](https://stardance.hackclub.com/projects/17999); người dùng tự làm "cross-validation thô" bằng cách hyperopt nhiều seed rồi backtest giai đoạn sau — [freqtrade issue #7190](https://redirect.github.com/freqtrade/freqtrade/issues/7190)
- [PRACTITIONER] Hàm loss bên thứ ba (MoniGoMani) phạt epoch có quá ít lệnh để chống overfit — [MGM docs](https://monigomani.readthedocs.io/Docs-MGM-HyperOptLoss-Functions/)
- [PRACTITIONER] Lookahead bias kinh điển: dùng high/low của chính nến để kích hoạt entry trong cùng nến — [CoinAPI glossary](https://www.coinapi.io/learn/glossary/lookahead-bias)

### Inferences
- Coin Radar dùng TP theo S/R (không phải ROI table %) nên tránh được kiểu overfit ROI table; nhưng nếu tối ưu buffer (0.3×ATR), ngưỡng 0.5×ATR, tỷ lệ 50/30/20 trên cùng dữ liệu thì rủi ro overfit tương tự.
- Backtest của Coin Radar cần quy tắc "nến chạm cả SL và TP → giả định SL trước" (như Freqtrade) hoặc dùng dữ liệu khung nhỏ hơn.

### Gaps
- Không tìm thấy trang strat.ninja hay leaderboard dry-run/live công khai đáng tin; không có số liệu live của NFI.

---

## Câu hỏi 5: Nên A/B test sơ đồ nào so với luật hiện tại? **[ĐỀ XUẤT]**

### Takeaway
**[ĐỀ XUẤT]** Giữ nguyên entry và SL cấu trúc; chỉ thay đổi **một biến quản lý lệnh mỗi lần**. Ưu tiên 5 biến thể sau, xếp theo mức hậu thuẫn của nguồn.

### Cited Findings (cơ sở cho đề xuất)
- Moving Target (TP1 → SL hòa vốn, TP2 → SL lên TP1) là mặc định Cornix — [Cornix Help](https://intercom.help/cornix/en/articles/5814874-trailing-stop-loss)
- Trailing ratchet theo điểm giữa kênh Donchian trong nghiên cứu crypto — [CXO Advisory](https://www.cxoadvisory.com/?p=46798); Chandelier 22/3.0 — [LuxAlgo](https://www.luxalgo.com/library/indicator/tV4GQ8w0-chandelier-exit-atr-trailing-stop-atr-bands)
- Time stop cho lệnh lỗ (Freqtrade "unclog" ≥1 ngày) — [Freqtrade Callbacks](https://www.freqtrade.io/en/stable/strategy-callbacks/); time exit tốt trong mẫu lớn — [setup4alpha](https://setup4alpha.substack.com/p/trailing-stop-vs-fixed-stop-tested)
- Stop chặt làm giảm lợi nhuận/lệnh — [setup4alpha](https://setup4alpha.substack.com/p/trailing-stop-vs-fixed-stop-tested); stop-loss chỉ có giá trị khi có momentum — [Kaminski & Lo](https://dspace.mit.edu/handle/1721.1/114876)
- StoplossGuard / CooldownPeriod — [Freqtrade Protections](https://www.freqtrade.io/en/stable/plugins/)

### Inferences — danh sách A/B **[ĐỀ XUẤT]**
1. **A0 (hiện tại)** vs **A1 "không breakeven"**: giữ SL gốc tới khi chạm TP2, rồi mới dời về entry. Đo: expectancy (R/lệnh), win rate, tỷ lệ lệnh bị quét về 0R rồi chạm TP2/TP3 sau đó.
2. **A2 "Moving Target kiểu Cornix"**: TP1 → SL về entry (như hiện tại), TP2 → SL lên TP1. Chỉ khác A0 ở phần còn 20%.
3. **A3 "phần đuôi trailing"**: 20% cuối không đặt TP3 mà trail Chandelier (ATR 22, k = 3 trên khung entry) hoặc điểm giữa kênh Donchian; ý là để lệnh trend chạy xa hơn kháng cự thứ 3.
4. **A4 "phân bổ"**: 50/30/20 vs 33/33/34 vs 25/25/50 — nhưng giữ cùng mức TP. Kỳ vọng ít khác biệt; chỉ chạy khi A1–A3 đã xong.
5. **A5 "time stop"**: lệnh chưa chạm TP1 sau N nến khung entry (ví dụ Swing 4H: 12–18 nến; Fast 15m: 16–24 nến — con số giả định, cần kiểm) → đóng.
6. **Cầu chì (không phải A/B lợi nhuận, mà là an toàn)**: cooldown theo cặp+chiều sau lệnh dính SL (tương tự CooldownPeriod 2 nến / StoplossGuard 4 SL/24 nến).
- Quy tắc kiểm: chia dữ liệu in-sample/out-of-sample (giữ 20–30% cuối làm kiểm định, theo gợi ý cộng đồng — [hackclub](https://stardance.hackclub.com/projects/17999)), tính phí futures + funding, giả định SL trước TP nếu cùng nến, đủ số lệnh (ít nhất vài trăm lệnh/biến thể — **[ĐỀ XUẤT]**, không có nguồn ngưỡng cụ thể).
- **Không đề xuất** áp dụng DCA/grinding kiểu NFI (stoploss −0.99) cho futures đòn bẩy: mâu thuẫn với nguyên tắc SL cấu trúc và tạo rủi ro đuôi lớn.

### Gaps
- Chưa có dữ liệu lệnh thật của Coin Radar để ước lượng tỷ lệ "chạm TP1 rồi quay về entry" — cần chạy trên lịch sử tín hiệu.
