# 5 bộ luật giao dịch nổi tiếng — nguồn gốc và luật gốc (để backtest crypto)

Ngày tra cứu: **2026-10-21**. Mọi con số độ phổ biến dưới đây là số đọc được trong ngày này.
Quy ước: **[ĐÃ XÁC MINH]** = đọc trực tiếp từ nguồn gốc; **[GIÁN TIẾP]** = chỉ qua nguồn thứ cấp;
**[CHƯA XÁC MINH]** = không kiểm được, đừng dùng làm căn cứ.

Kết luận chọn: giữ nguyên 5 ứng viên. Không có bộ luật nào ngoài danh sách loại trừ mà rõ ràng nổi tiếng hơn
(xem ghi chú TradingLab ở mục 5 — cùng họ MACD + 200 EMA, không phải thay thế).

---

## 1. Turtle Trading — System 1 & System 2 (Richard Dennis / William Eckhardt, 1983)

**Nguồn chính:** "The Original Turtle Trading Rules" (originalturtles.org, Curtis Faith công bố, PDF).
- PDF đã đọc: https://oxfordstrat.com/coasdfASD32/uploads/2016/01/turtle-rules.pdf (bản sao; trang gốc originalturtles.org hiện không trả về PDF)
- Sách: Curtis Faith, *Way of the Turtle* (2007) — không đọc trực tiếp.

**(a) Luật gốc [ĐÃ XÁC MINH từ PDF]**
- **N** (= ATR — Average True Range, biên độ dao động trung bình): TR = max(H−L, H−PDC, PDC−L);
  `N = (19 × N_hôm_trước + TR) / 20`, khởi tạo bằng SMA 20 ngày của TR (tức làm mượt kiểu Wilder 20).
- **Unit** (1 phần vị thế) = 1% vốn / (N × giá trị 1 điểm) → 1 N biến động = 1% vốn.
- **System 1 vào lệnh:** giá vượt 1 tick trên đỉnh 20 ngày trước đó → mua 1 Unit; thủng đáy 20 ngày → bán khống.
  - **Bộ lọc bỏ qua:** bỏ tín hiệu nếu breakout gần nhất (bất kể chiều long/short, bất kể có vào thật hay không)
    *sẽ là lệnh thắng*. Breakout được tính là THUA nếu giá đi ngược 2N trước khi có lệnh thoát 10 ngày có lãi.
  - **Failsafe:** nếu bị bỏ qua vì lệnh trước thắng → vào ở breakout 55 ngày.
- **System 2 vào lệnh:** breakout 55 ngày, luôn lấy, không lọc.
- **Nhồi lệnh (pyramiding):** thêm 1 Unit mỗi ½ N tính từ *giá khớp thực tế* của lệnh trước, tối đa **4 Unit/thị trường**.
- **Stop:** 2N từ giá vào (= 2% rủi ro). Khi thêm Unit, dời stop của các Unit cũ lên ½ N (tất cả cùng một mức stop).
  Biến thể "Whipsaw": stop ½ N (rủi ro ½%), không bắt buộc.
- **Thoát:** System 1 = đáy 10 ngày (long) / đỉnh 10 ngày (short); System 2 = đáy/đỉnh 20 ngày. Thoát toàn bộ Unit.
- **Giới hạn danh mục:** 4 Unit/thị trường, 6 Unit nhóm tương quan chặt, 10 Unit nhóm tương quan lỏng, 12 Unit/một chiều.
- **Giảm vốn khi sụt:** mỗi lần sụt 10% vốn gốc → giảm vốn danh nghĩa 20%.

**Điểm mơ hồ cần chốt khi code:**
- "Vượt 1 tick" trong ngày (intraday) — backtest nến đóng phải chọn: khớp tại mức breakout hay tại giá đóng/mở nến sau.
- Bộ lọc System 1 cần mô phỏng cả các breakout "ảo" (không vào lệnh) → phải theo dõi song song.
- Giới hạn tương quan (6/10 Unit) với crypto: không có định nghĩa sẵn, phải tự quy ước.
- PDF nói "System 1 entry 20 ngày" nhưng thoát 10 ngày; có nguồn (Covel, *The Complete TurtleTrader*) nói thêm Unit mỗi 1 N thay vì ½ N — PDF gốc ghi ½ N.

**(b) Khung thời gian / thị trường gốc:** nến **ngày**, hợp đồng tương lai (trái phiếu, tiền tệ, kim loại, dầu, ngũ cốc…), 1983–1988.

**(c) Tuyên bố:** PDF: "trong 4 năm tiếp theo, chúng tôi đạt lợi nhuận kép trung bình **80%/năm**" (Curtis Faith / nhóm Turtles).
Đây là kết quả giao dịch thật của nhóm, không phải backtest; không kiểm chứng độc lập được → [CHƯA XÁC MINH độc lập].

**(e) Độ phổ biến (2026-10-21):**
- YouTube "TURTLE TRADERS STRATEGY – The Complete TurtleTrader" (Financial Wisdom): **580.845 views** — https://www.youtube.com/watch?v=NJkXSZUHl1g
- YouTube "Turtles Trading Strategy Explained" (ThinkMarkets): 137.837 views.
- GitHub: repo Turtle lớn nhất chỉ ~65 sao (bideeen/…), pplonski/turtle-trading-python (crypto) 50 sao → độ phổ biến chủ yếu đến từ sách/lịch sử, không từ code.

---

## 2. Supertrend (ATR 10, hệ số 3) — chiến lược đảo chiều của TradingView

**Nguồn chính:**
- Script phổ biến nhất: "SuperTrend" by KivancOzbilgic — https://www.tradingview.com/script/r6dAP7yi/ (13/03/2020)
- Bản strategy: "SuperTrend STRATEGY" by KivancOzbilgic — https://www.tradingview.com/script/P5Gu6F8k/
- Trợ giúp TradingView về chỉ báo: https://www.tradingview.com/support/solutions/43000634738-supertrend-strategy/
- Freqtrade: `user_data/strategies/Supertrend.py`, `futures/FSupertrendStrategy.py` trong https://github.com/freqtrade/freqtrade-strategies
- Tác giả gốc chỉ báo: Olivier Seban (Pháp) — [GIÁN TIẾP, chưa tìm thấy tài liệu gốc].

**(a) Luật [ĐÃ XÁC MINH phần chỉ báo; GIÁN TIẾP phần strategy built-in]**
- Nguồn giá hl2 = (H+L)/2. Dải trên = hl2 + 3×ATR(10); dải dưới = hl2 − 3×ATR(10); dải chỉ được dịch theo hướng có lợi
  (dải dưới chỉ tăng, dải trên chỉ giảm) cho tới khi giá đóng cửa vượt qua → đổi hướng.
- ATR: KivancOzbilgic mặc định **RMA** (Wilder), tùy chọn SMA. Pine `ta.supertrend(factor, atrPeriod)` dùng ATR chuẩn (RMA).
- **Strategy built-in "Supertrend Strategy" của TradingView:** `ta.change(direction) < 0` → `strategy.entry` long;
  `ta.change(direction) > 0` → `strategy.entry` short. Vì `strategy.entry` ngược chiều tự đóng lệnh cũ → **luôn có vị thế,
  đảo chiều long↔short**, không stop/TP riêng. `default_qty_value=15` (% vốn) — thấy trong bản sao của fmzquant
  (github.com/fmzquant/strategies, file Three-Supertrend-Strategy.md), **chưa đối chiếu được mã gốc trong Pine Editor**.
- Lưu ý dấu: trong Pine, direction = −1 là xu hướng tăng, +1 là giảm.

**Điểm mơ hồ:** RMA hay SMA cho ATR (kết quả khác nhau); vào lệnh ở giá đóng nến tín hiệu (mặc định TradingView) hay mở nến sau;
kích thước lệnh 15% hay 100% vốn.

**(b) Khung / thị trường gốc:** không có khung gốc; Kivanc ghi "chạy được cho cổ phiếu, futures, forex, crypto; ngày, tuần, giờ",
và thừa nhận "kém trong thị trường đi ngang".

**(c) Tuyên bố:** Không có tuyên bố win rate/CAGR chính thức từ TradingView hay Kivanc. Các video YouTube có tuyên bố riêng
(ví dụ Trade Pro "Triple Supertrend… Proven 100 Trade Results") — không thuộc luật gốc.

**(e) Độ phổ biến (2026-10-21):**
- Trang script r6dAP7yi hiện 3 con số không nhãn: **83,9K / 636 / 2.278.082** (khả năng là boosts / bình luận / lượt dùng — **chưa xác minh nhãn**).
- Trang P5Gu6F8k (bản strategy): 25,4K / 127 / 670.953 (cũng không nhãn).
- GitHub: hackingthemarkets/supertrend-crypto-bot **413 sao**; freqtrade-strategies (chứa Supertrend.py) **5.575 sao**.
- YouTube: TradingLab "DEMA + SuperTrend" 606.062 views; Trade Pro "Triple Supertrend" 391.850 views.

---

## 3. Larry Connors RSI(2) (sách *Short Term Trading Strategies That Work*, Connors & Alvarez, 2008)

**Nguồn:**
- StockCharts ChartSchool: https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/rsi-2
- Quantified Strategies (backtest SPY): https://quantifiedstrategies.substack.com/p/rsi-2-strategy-explained-larry-connors (phần luật bị paywall)
- Sách gốc: **không đọc được trực tiếp** → các ngưỡng dưới đây lấy từ ChartSchool.

**(a) Luật [GIÁN TIẾP — theo ChartSchool]**
- Lọc xu hướng: **close > SMA200** (ngày) mới tìm lệnh mua; **close < SMA200** mới tìm bán khống.
- RSI(2) tính trên giá đóng cửa.
- **Long:** RSI(2) < **10** là tín hiệu chung; Connors thấy **< 5** cho lợi nhuận cao hơn.
- **Short:** RSI(2) > **90**; Connors thấy **> 95** tốt hơn.
- **Vào lệnh:** ngay trước giờ đóng cửa (Connors chọn cách này) hoặc giá mở cửa phiên sau.
- **Thoát:** long thoát khi giá **đóng trên SMA5**; short thoát khi **đóng dưới SMA5**.
- **Stop:** "Connors không chủ trương dùng stop" — theo ông, stop **làm giảm** hiệu quả trên cổ phiếu/chỉ số
  (dựa trên "hàng trăm nghìn lệnh" đã test). ChartSchool cảnh báo không stop → drawdown lớn.
- Bộ lọc "chờ RSI(2) cắt lại 50" trên ChartSchool là **của StockCharts, không phải của Connors**.

**Điểm mơ hồ:** chọn ngưỡng 5 hay 10 (95 hay 90) — phải test cả hai; "trên SMA5" là giá đóng cửa so với SMA5 đóng cửa;
có cho vào thêm khi RSI tiếp tục giảm không — sách có biến thể nhưng **chưa xác minh**; crypto giao dịch 24/7 → "đóng cửa"
phải quy ước (nến ngày UTC 00:00). Một số bản (MQL5 market) thoát khi RSI(2) > 65 — **không phải luật ChartSchool**.

**(b) Khung / thị trường gốc:** nến **ngày**, cổ phiếu Mỹ & ETF chỉ số (SPY…).

**(c) Tuyên bố:**
- Sách: % thắng cụ thể **chưa xác minh** (không đọc được sách; nhiều blog ghi "~70–80%" nhưng không trích nguồn → bỏ).
- Quantified Strategies (30/03/2026), SPY từ 1993: lãi TB/lệnh **0,9%**, CAGR **9%**, max drawdown **34%**, thời gian có vị thế **28%**
  (không thấy rõ họ dùng đúng bộ luật nào vì paywall).

**(e) Độ phổ biến (2026-10-21):**
- YouTube: Quantified Strategies "I Backtested 6 Larry Connors Strategies" 48.857 views; "New Improved! 2 Period RSI" (The Transparent Trader) 99.593 views.
- GitHub: không có repo đáng kể khi tìm "rsi2 connors". Reddit: **chưa kiểm**.
- Độ nổi tiếng chủ yếu ở giới quant/blog (ChartSchool, Quantified Strategies), kém viral trên YouTube hơn 4 bộ kia.

---

## 4. Ichimoku Kinko Hyo — chuẩn 9/26/52 (Goichi Hosoda, sách 1969)

**Nguồn:**
- ChartSchool chỉ báo: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/ichimoku-cloud
- ChartSchool chiến lược: https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/ichimoku-cloud-trading-strategies
- Sách gốc của Hosoda (tiếng Nhật): không đọc được.

**(a) Công thức [ĐÃ XÁC MINH — ChartSchool]**
- Tenkan (đường chuyển đổi) = (đỉnh 9 + đáy 9)/2; Kijun (đường cơ sở) = (đỉnh 26 + đáy 26)/2.
- Senkou A = (Tenkan + Kijun)/2, vẽ **dịch tới trước (tương lai) 26 kỳ**; Senkou B = (đỉnh 52 + đáy 52)/2, vẽ tới 26 kỳ.
- Chikou = giá đóng cửa vẽ lùi **26 kỳ về quá khứ**.
- → Khi backtest: mây "tại nến t" = Senkou A/B tính từ dữ liệu nến t−26 (không nhìn tương lai). Chikou so sánh close[t] với close[t−26] (hoặc với mây/giá tại t−26).

**Luật tín hiệu "bộ ba kinh điển" [GIÁN TIẾP — tổng hợp từ nhiều nguồn, không có văn bản gốc duy nhất]:**
- Long: Tenkan cắt lên Kijun (TK cross) **và** giá đóng trên mây **và** Chikou trên giá 26 kỳ trước (thường thêm: mây phía trước xanh, Senkou A > B).
- Short: đối xứng.
- ChartSchool: tín hiệu tăng ưu tiên khi giá ở trên mây xanh; TK cross ngược xu hướng lớn là tín hiệu yếu.

**Chiến lược ChartSchool (có stop) [ĐÃ XÁC MINH]:**
- Long: giá trên cạnh dưới của mây → giá hồi xuống dưới Kijun → vào khi giá vượt lại lên Tenkan.
- Stop ban đầu: đáy ngay trước tín hiệu; sau đó trailing (Parabolic SAR hoặc 2×ATR). Short đối xứng.
- **Không có take-profit / tín hiệu thoát cụ thể.**

**Thoát lệnh — KHÔNG có quy định gốc thống nhất.** Các luật thoát phổ biến (phải chọn và ghi rõ khi test):
TK cross ngược chiều; giá đóng dưới Kijun; giá đóng vào/xuống dưới mây. → Đánh dấu **mơ hồ**.

**(b) Khung / thị trường gốc:** cổ phiếu Nhật, nến **ngày**; 9/26/52 ứng với 1,5 tuần / 1 tháng / 2 tháng khi Nhật còn giao dịch thứ Bảy (6 ngày/tuần).
Với crypto 24/7, nhiều người dùng 20/60/120 hoặc 10/30/60 — **ngoài phạm vi luật gốc**.

**(c) Tuyên bố:** không có win rate/CAGR chính thức từ Hosoda. Video Trade Pro "Crazy Results Best Ichimoku… Proven 100 Trades" có tuyên bố riêng (chưa xem số).

**(e) Độ phổ biến (2026-10-21):** là chỉ báo **built-in** của TradingView, Binance Academy có bài riêng.
- YouTube: Trade Pro "Complete Ichimoku Cloud Trading Strategy" **591.234 views**; Wysetrade "ULTIMATE Ichimoku…" 538.258 views;
  Trade Pro "…Proven 100 Trades" 351.974 views.
- GitHub: harryguiacorn/TradingView-Proprietary-Indicators 219 sao (có Ichimoku), kumotrader/ichimoku-crypto 61 sao.

---

## 5. "MACD + 200 EMA" — TRADING RUSH (YouTube)

**Nguồn chính:**
- Video: **"I risked MACD Trading Strategy 100 TIMES Here's What Happened... - Forex Day Trading"** — kênh TRADING RUSH,
  đăng **23/01/2020** — https://www.youtube.com/watch?v=nmffSjdZbWQ
- Bản ghi trên web của kênh: https://tradingrush.net/i-risked-macd-trading-strategy-100-times-heres-what-happened/
- Script TradingView không chính thức: https://www.tradingview.com/script/4gXXEI5Y-Trading-Rush-Signals-Alerts

**(a) Luật [ĐÃ XÁC MINH theo bản ghi tradingrush.net]**
- MACD mặc định (12, 26, 9) — **giả định**, video không nói khác. EMA 200 làm bộ lọc xu hướng.
- **Mua:** giá trên EMA200 **và** đường MACD cắt lên đường signal **khi cả hai đang dưới 0**.
- **Bán:** giá dưới EMA200 **và** MACD cắt xuống signal **khi đang trên 0**.
- Vào lệnh tại nến có giao cắt. Bỏ qua tín hiệu "không rõ ràng" (yếu tố tùy ý — không code được).
- **Stop:** long đặt "dưới đáy nhịp hồi (pullback) của xu hướng"; bên bán không nói rõ (suy ra: trên đỉnh nhịp hồi).
- **Chốt lời: video MÂU THUẪN** — ví dụ chính: chốt 25% ở 1R, dời stop về hòa vốn, phần còn lại ở 2R;
  ví dụ khác dùng 1 mục tiêu **1,5R**. Script TradingView & bài ForexFactory dùng **1,5R**.
- Quản lý vốn: rủi ro **1%** tài khoản 10.000 USD/lệnh.

**Điểm mơ hồ phải tự chốt:**
- "Đáy pullback" (swing low) không có định nghĩa số: chọn fractal Bill Williams (2 nến mỗi bên — như bài ForexFactory nói "last fractal")
  hoặc đáy thấp nhất N nến gần nhất (ví dụ 5–10 nến). Đây là biến số ảnh hưởng mạnh tới kết quả.
- Nhiều người dùng EMA200 làm stop — **không có trong video**.
- 1,5R hay (25% @1R + 75% @2R): nên test cả hai.
- "MACD dưới 0": cả MACD và signal dưới 0, hay chỉ điểm cắt dưới 0? Bản ghi nói "giao cắt xảy ra dưới đường 0".

**(b) Khung / thị trường gốc:** biểu đồ **30 phút**, **EUR/USD rồi chuyển sang EUR/JPY** (forex). Tác giả nói "chạy mọi khung".

**(c) Tuyên bố (Trading Rush, backtest thủ công 100 lệnh):** **62% thắng** (62 thắng / 38 thua), chuỗi thắng dài nhất 9, thua dài nhất 5,
lãi ~**50%** tài khoản. Không tính phí, spread, trượt giá; không có nhật ký từng lệnh. Bài tổng hợp 2026 của chính kênh
(https://tradingrush.net/i-tested-7000-trades-with-38-trading-strategies/) cho thấy MACD chỉ thắng **33%** trong thị trường đi ngang.

**(e) Độ phổ biến (2026-10-21):** video **1.444.666 views**, ~50.448 likes (số like đọc từ HTML trang, **chưa xác minh**).
Kênh có video MACD khác: "Best Part Of The MACD Indicator Trading" 336.643 views; "I took 100 trades with MACD + STOCHASTIC" 205.891 views.

**Ghi chú — ứng viên cùng họ, phổ biến hơn:** TradingLab "BEST MACD Trading Strategy [86% Win Rate]" (03/10/2021)
— **4.612.997 views**, ~182.974 likes — https://www.youtube.com/watch?v=rf_EQvubKlk. Phần mô tả video **không ghi luật**;
nhiều nguồn thứ cấp nói là MACD + 200 EMA + vùng hỗ trợ/kháng cự (yếu tố tùy ý, khó code) → **chưa xác minh luật**,
không đề xuất thay thế. Tuyên bố 86% không có dữ liệu kèm theo.

---

## Bảng tóm tắt

| # | Bộ luật | Khung gốc | Tuyên bố | Ai tuyên bố | Mức xác minh luật |
|---|---------|-----------|----------|-------------|-------------------|
| 1 | Turtle S1/S2 | Ngày, futures | 80%/năm (1984–88, giao dịch thật) | Curtis Faith / Turtles | Đã xác minh (PDF) |
| 2 | Supertrend 10/3 đảo chiều | Không cố định | Không có | — | Chỉ báo: đã xác minh; strategy built-in: gián tiếp |
| 3 | Connors RSI(2) | Ngày, cổ phiếu/ETF Mỹ | QS: CAGR 9%, DD 34% (SPY 1993–) | Quantified Strategies | Gián tiếp (ChartSchool) |
| 4 | Ichimoku 9/26/52 | Ngày, cổ phiếu Nhật | Không có | — | Công thức: đã xác minh; luật thoát: không có gốc |
| 5 | MACD + EMA200 | 30 phút, EUR/USD, EUR/JPY | 62% thắng / 100 lệnh, +50% | Trading Rush | Đã xác minh (bản ghi), stop/TP mơ hồ |

## Việc chưa làm được
- Không đọc được sách gốc của Connors, Hosoda, Faith (*Way of the Turtle*).
- Không xem được mã nguồn gốc "Supertrend Strategy" trong Pine Editor (cần đăng nhập TradingView).
- Không kiểm số upvote Reddit / X cho bộ nào.
- Số liệu engagement TradingView không có nhãn → chưa biết đâu là boosts.
