# Vận hành & kiểm chứng bot Binance USDT-M Futures — bài học thực tế và phương pháp kiểm chứng

(Ghi chú nghiên cứu, ngày 2026-10-19. Mọi khẳng định đều có URL. Mục ghi "CHƯA KIỂM CHỨNG" là nguồn thứ cấp / diễn đàn, chưa có tài liệu chính thức xác nhận.)

## 1. Các kiểu lỗi (failure modes) thường gặp khi chạy bot futures Binance, và bot trưởng thành xử lý ra sao

### Takeaway
Phần lớn lỗi vận hành trên Binance đều có mã lỗi chính thức, nên bot phải bắt từng mã và phản ứng riêng. Có một thay đổi API rất dễ làm "lệnh stop không được đặt": từ 2025-12-09, lệnh điều kiện (STOP_MARKET, TAKE_PROFIT_MARKET...) phải gửi qua Algo Service. Nếu gửi theo đường cũ, Binance trả lỗi -4120. Freqtrade xử lý lỗi đặt stop bằng emergency exit (thoát khẩn cấp bằng lệnh market). Nó cũng đặt lại stop nếu stop bị hủy, và từ chối khởi động khi position mode bị đặt sai.

### Cited Findings

**Lệnh stop phía sàn (exchange-side stop) không được đặt / bị hủy**
- Binance chuyển lệnh điều kiện của USDⓈ-M sang Algo Service, hiệu lực 2025-12-09. Các loại bị ảnh hưởng là STOP_MARKET, TAKE_PROFIT_MARKET, STOP, TAKE_PROFIT và TRAILING_STOP_MARKET. Nếu vẫn gửi chúng qua POST /fapi/v1/order hoặc /fapi/v1/batchOrders, sàn trả lỗi `-4120 STOP_ORDER_SWITCH_ALGO`. Sự kiện CONDITIONAL_ORDER_TRIGGER_REJECT bị bỏ (deprecated) từ 2025-12-15 — [Binance Derivatives Change Log](https://developers.binance.com/docs/derivatives/change-log)
- Ở endpoint New Algo Order (`algoType=CONDITIONAL`):
  - `closePosition=true` dùng với STOP_MARKET/TAKE_PROFIT_MARKET để đóng toàn bộ vị thế, và không được dùng cùng `quantity` hay `reduceOnly`.
  - `priceProtect` mặc định là false.
  - `workingType` nhận MARK_PRICE hoặc CONTRACT_PRICE, mặc định CONTRACT_PRICE.
  - Nguồn: [Binance USDⓈ-M Trade REST API](https://developers.binance.com/docs/derivatives/usds-margined-futures/trade/rest-api)
- Freqtrade `stoploss_on_exchange` đặt lệnh stop lên sàn ngay khi lệnh vào đã khớp:
  - Nếu đặt stop thất bại, "the bot will fallback to using the `emergency_exit` order type" (mặc định là market).
  - Nếu người dùng tự tay hủy stop trên sàn, "the bot will create a new stoploss order".
  - Tham số `stoploss_on_exchange_interval` (mặc định 60 giây) quyết định bao lâu kiểm tra stop một lần. Kiểm tra thưa như vậy để tránh bị sàn ban vì gọi API quá nhiều.
  - Tài liệu khuyên dùng stop-market thay vì stop-limit, vì stop-limit có thể không khớp khi giá sập nhanh.
  - Nguồn: [Freqtrade Stoploss docs](https://www.freqtrade.io/en/stable/stoploss/)
- Freqtrade cảnh báo stop quá rộng (ví dụ -1) có thể bị sàn từ chối, khi đó bot rơi vào nhánh emergency exit. Nguyên văn: "Freqtrade currently does not implement a limitation to avoid this situation." Với đòn bẩy, stop 10% ở 10x sẽ kích hoạt khi giá chỉ đi ngược 1% — [Freqtrade Stoploss docs](https://www.freqtrade.io/en/stable/stoploss/)
- Freqtrade cho chọn giá kích hoạt stop trên futures qua `stoploss_price_type` = `last` / `mark` / `index`, và kiểm tra giá trị này lúc khởi động — [Freqtrade Stoploss docs](https://www.freqtrade.io/en/stable/stoploss/)

**Reduce-only bị từ chối**
- `-2022 REDUCE_ONLY_REJECT`: "ReduceOnly Order is rejected." Một lệnh reduce-only mới có thể xung đột với các lệnh đang mở, khi đó phải hủy các lệnh đó rồi gửi lại — [Binance Futures Error Codes](https://developers.binance.com/docs/derivatives/usds-margined-futures/error-code)
- `reduceOnly` "Cannot be sent in Hedge Mode", tức không gửi được khi tài khoản ở chế độ hedge — [Binance Trade REST API](https://developers.binance.com/docs/derivatives/usds-margined-futures/trade/rest-api)

**Lệch position mode (hedge với one-way)**
- `-4061 POSITION_SIDE_NOT_MATCH`: "Order's position side does not match user's setting." — [Binance Error Codes](https://developers.binance.com/docs/derivatives/usds-margined-futures/error-code)
- `positionSide` mặc định là BOTH ở One-way Mode. Ở Hedge Mode thì bắt buộc gửi LONG hoặc SHORT — [Binance Trade REST API](https://developers.binance.com/docs/derivatives/usds-margined-futures/trade/rest-api)
- Freqtrade yêu cầu Position Mode = One-way và Asset Mode = Single-Asset (cho isolated). Nó "will show an error if this setting is wrong" lúc khởi động, nhưng không tự đổi cài đặt — [Freqtrade Exchange notes – Binance](https://www.freqtrade.io/en/stable/exchanges/)

**Lỗi min notional / step size / tick size / ký quỹ**
- Các mã lỗi liên quan:
  - `-4164 MIN_NOTIONAL`: "Order's notional must be no smaller than 5.0 (unless you choose reduce only)"
  - `-4023` "Qty not increased by step size"
  - `-4014` "Price not increased by tick size"
  - `-4004` "Quantity less than min quantity"
  - `-1111` "Precision is over the maximum defined for this asset"
  - `-2019` "Margin is insufficient"
  - Nguồn: [Binance Error Codes](https://developers.binance.com/docs/derivatives/usds-margined-futures/error-code)
- Chi tiết đáng chú ý: lệnh reduce-only được miễn mức notional tối thiểu 5 USDT. Nhờ vậy lệnh đóng vị thế nhỏ vẫn đi được — cùng nguồn trên.

**Rate limit (giới hạn tần suất gọi API) / IP bị ban**
- Giới hạn tính theo IP, không theo API key: "The limits on the API are based on the IPs, not the API keys."
- Mức dùng hiện tại nằm trong header `X-MBX-USED-WEIGHT-*`. Số lệnh đã đặt nằm trong `X-MBX-ORDER-COUNT-*` và được tính theo tài khoản.
- Vượt giới hạn thì nhận HTTP 429. Nếu vẫn bỏ qua 429 thì bị "automated IP ban (HTTP status 418)", thời gian ban tăng dần "from 2 minutes to 3 days".
- Nguồn: [Binance USDⓈ-M General Info](https://developers.binance.com/docs/derivatives/usds-margined-futures/general-info)
- `-1003`: "Way too many requests; IP banned until %s." Tài liệu khuyên chuyển sang WebSocket stream thay vì polling (hỏi liên tục qua REST) — [Binance Error Codes](https://developers.binance.com/docs/derivatives/usds-margined-futures/error-code)
- `-1008` (quá tải phía sàn): đây là thất bại chắc chắn, nên retry có backoff. Lệnh đóng vị thế, reduce-only và hủy lệnh được miễn throttle này — [Binance General Info](https://developers.binance.com/docs/derivatives/usds-margined-futures/general-info)
- Freqtrade khuyên không tự đặt `rateLimit` mà để thư viện ccxt tự quản lý — [Freqtrade Exchange notes](https://www.freqtrade.io/en/stable/exchanges/)

**Trạng thái thực thi không rõ (timeout / 503) → nguy cơ lệnh trùng**
- `-1007 TIMEOUT`: "Send status unknown; execution status unknown." — [Binance Error Codes](https://developers.binance.com/docs/derivatives/usds-margined-futures/error-code)
- Binance phân biệt hai loại HTTP 503:
  - "Unknown error, please check your request or try again later": lệnh CÓ THỂ đã thực thi. Phải kiểm tra qua WebSocket hoặc truy vấn orderId trước khi gửi lại, "to avoid duplicate orders".
  - "Service Unavailable": chắc chắn thất bại. Retry với backoff 200/400/800 ms, khoảng 3–5 lần.
  - Nguồn: [Binance General Info](https://developers.binance.com/docs/derivatives/usds-margined-futures/general-info)

**Lệch đồng hồ (timestamp/recvWindow)**
- `-1021 INVALID_TIMESTAMP`: "Timestamp for this request is outside of the recvWindow." — [Binance Error Codes](https://developers.binance.com/docs/derivatives/usds-margined-futures/error-code)
- `recvWindow` mặc định 5000 ms. Request bị từ chối nếu timestamp đi trước giờ server hơn 1000 ms, hoặc lệch ra ngoài recvWindow — [Binance General Info](https://developers.binance.com/docs/derivatives/usds-margined-futures/general-info)
- FAQ của Freqtrade liệt kê "Wrong system time -> Ensure your system-time is correct" là một nguyên nhân của lỗi "Outdated history" — [Freqtrade FAQ](https://www.freqtrade.io/en/stable/faq/)

**WebSocket mất kết nối / lỡ nến**
- listenKey của user data stream hết hạn sau 60 phút nếu không gửi keepalive (`PUT /fapi/v1/listenKey`) — [Binance User Data Streams](https://developers.binance.com/docs/derivatives/usds-margined-futures/user-data-streams)
- Binance đổi đường dẫn WebSocket sang các path /public, /market, /private (2026-03-05). URL cũ ngừng hoạt động từ 2026-04-23 — [Binance Change Log](https://developers.binance.com/docs/derivatives/change-log)
- Freqtrade: khi WebSocket có khoảng trống dữ liệu, "Freqtrade will handle this gracefully by falling back to the REST api". Nến thiếu được lấp bằng nến "empty", giữ giá đóng cửa trước đó và volume rỗng. Nếu nến mới nhất bị cũ (outdated), "Freqtrade will not enter a trade for this pair" — [Freqtrade FAQ](https://www.freqtrade.io/en/stable/faq/)

**Hủy niêm yết (delisting) hợp đồng perpetual**
- Năm 2026 Binance hủy niêm yết perpetual nhiều đợt: tháng 2, 17/3, 28–29/4, 5/10. Vị thế mở bị sàn tự đóng và tất toán. Quỹ bảo hiểm không tham gia thanh lý trong giờ cuối trước khi tất toán, nên rủi ro thanh lý trong giờ đó cao hơn — CHƯA KIỂM CHỨNG trực tiếp trên trang thông báo của Binance, chỉ từ nguồn thứ cấp: [EdgeX news](https://pro.edgex.exchange/en-US/news/article/binance-futures-delist-three-perpetual-contracts), [Tangem news](https://tangem.com/en/news/markets/13471-binance-to-delist-spot-pairs-and-futures-contracts-in-february/), [The Block](https://www.theblock.co/post/226425)

**Phí BNB, giới hạn theo quốc gia**
- Freqtrade không bao giờ tự mua BNB để trả phí, nên phải đưa BNB vào blacklist hoặc tự quản lý số dư BNB. Binance chặn API theo quốc gia đặt server (danh sách ví dụ: Canada, Malaysia, Hà Lan, Mỹ; danh sách chưa đầy đủ). Điều này quan trọng khi chọn VPS — [Freqtrade Exchange notes](https://www.freqtrade.io/en/stable/exchanges/)
- Binance có "Futures Trading Quantitative Rules". Vi phạm có thể bị hạn chế giao dịch — [Freqtrade Exchange notes](https://www.freqtrade.io/en/stable/exchanges/)

### Inferences
- Code đặt stop của Coin Radar phải dùng endpoint Algo Order. Nhiều ví dụ và thư viện cũ trên mạng vẫn gửi STOP_MARKET qua /fapi/v1/order, và cách đó sẽ bị trả lỗi -4120. Đây là ứng viên số 1 cho lỗi "vào lệnh được nhưng không có stop".
- Một lệnh vào khớp mà stop không đặt được thì phải xử lý ngay. Hoặc đóng vị thế bằng market (giống emergency_exit của Freqtrade), hoặc báo Telegram với mức ưu tiên cao. Không được im lặng.
- Lúc khởi động bot nên tự kiểm tra position mode, margin type và leverage, và dừng hẳn nếu sai, giống Freqtrade.

### Gaps
- Chưa tìm được post-mortem (bài phân tích sự cố) cụ thể có số liệu về quét giá (wick) / dây chuyền thanh lý ảnh hưởng tới bot, nên không đưa vào.
- Chưa tra lịch bảo trì của Binance Futures và cách bot xử lý bảo trì (ví dụ lỗi trả về trong lúc bảo trì).
- Chưa đọc tài liệu Jesse và chưa đọc riêng tài liệu Hummingbot về reconnect/rate limit. Chưa có GitHub issue cụ thể về lệnh trùng sau khi restart.
- Lỗi xảy ra khi set leverage / margin type mà sàn từ chối (ví dụ đổi margin type khi đang có vị thế) chưa được tra mã lỗi cụ thể.

## 2. Thiết kế khởi động lại an toàn: đối chiếu trạng thái, clientOrderId, luôn có stop trên sàn

### Takeaway
Freqtrade làm như sau khi khởi động: lấy mọi lệnh "đang mở" trong database, rồi truy vấn từng lệnh trên sàn để cập nhật trạng thái thật. Lệnh không tìm thấy và cũ hơn 5 ngày thì coi là đã bị hủy. Nó cũng có hàm "refind" để tìm lại lệnh lạ trên sàn khi số dư biến mất. Phía Binance cho phép tự đặt `newClientOrderId`, duy nhất trong số các lệnh đang mở. Binance cũng hướng dẫn rõ: khi trạng thái thực thi không rõ thì phải truy vấn lại trước khi retry.

### Cited Findings
- Thứ tự `startup()` của Freqtrade: migrate dữ liệu → khởi tạo lại stoploss (`Trade.stoploss_reinitialization`) → `startup_update_open_orders()` → cập nhật giá thanh lý → cập nhật funding fees — [freqtradebot.py (develop)](https://github.com/freqtrade/freqtrade/blob/develop/freqtrade/freqtradebot.py)
- `startup_update_open_orders()`:
  - Với mỗi lệnh đang mở trong DB, gọi `fetch_order_or_stoploss_order` trên sàn rồi `update_trade_state`.
  - Nếu sàn báo InvalidOrder và lệnh cũ hơn 5 ngày, "Assuming order was fully cancelled".
  - Ở dry-run bước này bị bỏ qua.
  - Nguồn: [freqtradebot.py](https://github.com/freqtrade/freqtrade/blob/develop/freqtrade/freqtradebot.py)
- `handle_insufficient_funds()` thử tìm lại "lost trade" khi lệnh thoát báo thiếu tiền. `handle_onexchange_order()` lấy toàn bộ lệnh trên sàn từ lúc mở trade để tìm "previously unknown order", tức lệnh mà DB không có — [freqtradebot.py](https://github.com/freqtrade/freqtrade/blob/develop/freqtrade/freqtradebot.py)
- Vòng lặp Freqtrade mỗi vài giây: lấy trade đang mở từ persistence (DB) → tải OHLCV → phân tích → "Update trades open order state from exchange" → kiểm tra timeout lệnh → xét stoploss/ROI/exit → mới tìm lệnh vào mới — [Freqtrade Bot Basics](https://www.freqtrade.io/en/stable/bot-basics/)
- Freqtrade gửi thông báo khi bot dừng (không phải reload) mà vẫn còn trade mở (`check_for_open_trades`) — [freqtradebot.py](https://github.com/freqtrade/freqtrade/blob/develop/freqtrade/freqtradebot.py)
- Binance `newClientOrderId`: "A unique ID among open orders", định dạng `^[\.A-Z\:/a-z0-9_-]{1,36}$`, tự sinh nếu không gửi — [Binance Trade REST API](https://developers.binance.com/docs/derivatives/usds-margined-futures/trade/rest-api)
- Khi gặp 503 "Unknown error" hoặc -1007, Binance yêu cầu kiểm tra qua WebSocket/orderId trước khi gửi lại, "to avoid duplicate orders" — [Binance General Info](https://developers.binance.com/docs/derivatives/usds-margined-futures/general-info)
- Stop phía sàn (stoploss_on_exchange) nằm trên sàn nên bảo vệ vị thế cả khi bot tắt. Freqtrade nói nó "will protect you against sudden crashes in market" — [Freqtrade Stoploss](https://www.freqtrade.io/en/stable/stoploss/)

### Inferences
- PC ở nhà không bật thường xuyên, nên mỗi vị thế PHẢI có stop trên sàn (dùng closePosition hoặc reduce-only qua Algo Order) ngay sau khi lệnh vào khớp. Bot tắt thì chỉ còn stop trên sàn bảo vệ tiền.
- Quy trình restart đề xuất (suy luận từ cách Freqtrade làm):
  1. Đọc trạng thái local.
  2. Gọi positionRisk / openOrders / openAlgoOrders trên sàn.
  3. Với mỗi vị thế trên sàn: nếu không có stop thì đặt stop ngay hoặc đóng vị thế. Nếu local không biết vị thế đó thì báo Telegram và không tự giao dịch tiếp.
  4. Với mỗi lệnh local "đang mở" mà trên sàn đã khớp hoặc đã hủy thì cập nhật local.
  5. Chỉ sau đó mới xét tín hiệu mới.
- clientOrderId nên tất định, sinh từ (symbol, thời điểm nến, loại lệnh). Khi gửi lại sau lỗi timeout, sàn sẽ từ chối lệnh trùng ID nếu lệnh cũ còn mở. Lưu ý: chỉ "unique among open orders", nên lệnh đã khớp ngay (market) KHÔNG được bảo vệ theo cách này. Vẫn phải truy vấn trước khi retry.

### Gaps
- Chưa xác nhận mã lỗi cụ thể khi trùng clientOrderId trên USDⓈ-M, và chưa rõ Algo Order dùng trường `clientAlgoId` hay tên khác. Cần đọc trang New Algo Order đầy đủ.
- Chưa có GitHub issue minh họa lỗi lệnh trùng sau restart.

## 3. Kill switch (công tắc ngắt khẩn cấp) và giới hạn rủi ro dùng trong thực tế

### Takeaway
Freqtrade có các "Protections" có sẵn: StoplossGuard (ngừng sau N lần dính stop), MaxDrawdown (theo equity), LowProfitPairs và CooldownPeriod. Chúng chạy được cả trong backtest. Hummingbot có `kill_switch_rate`: dừng toàn bộ bot khi lợi nhuận chạm một ngưỡng phần trăm (âm hoặc dương).

### Cited Findings
- Freqtrade Protections khóa tạm thời một cặp hoặc toàn bộ. Chúng chạy được trong backtest/hyperopt khi bật `--enable-protections`. Tham số chung gồm `stop_duration(_candles)`, `lookback_period(_candles)`, `trade_limit`, `unlock_at` — [Freqtrade Plugins/Protections](https://www.freqtrade.io/en/stable/plugins/)
- StoplossGuard: nếu trong cửa sổ lookback có ≥ `trade_limit` lệnh kết thúc bằng stoploss thì dừng giao dịch, mặc định cho mọi cặp. Có `only_per_pair` và `only_per_side` (chỉ long hoặc chỉ short) — [Freqtrade Protections](https://www.freqtrade.io/en/stable/plugins/)
- MaxDrawdown: chế độ `calculation_mode: "equity"` tính sụt giảm từ đỉnh xuống đáy (peak-to-trough) trên đường equity, và được khuyến nghị cho cấu hình mới. Ví dụ của tài liệu: `max_allowed_drawdown: 0.2`, `lookback_period_candles: 48`, `stop_duration_candles: 12` — [Freqtrade Protections](https://www.freqtrade.io/en/stable/plugins/)
- Ví dụ StoplossGuard trong tài liệu: `trade_limit: 4` trong 24 nến, khóa 4 nến. CooldownPeriod: khóa cặp 2 nến sau mỗi lần thoát — [Freqtrade Protections](https://www.freqtrade.io/en/stable/plugins/)
- Hummingbot kill switch "automatically stops the bot when it reaches a certain performance threshold, which can be either positive or negative". Giá trị -5 nghĩa là lỗ 5%. Nó dùng cùng phép tính với lệnh `history`, nên giá thay đổi (lỗ chưa chốt) cũng có thể kích hoạt — [Hummingbot Kill Switch](https://hummingbot.org/client/global-configs/kill-switch/)
- Freqtrade dùng `max_open_trades` để giới hạn số vị thế mở đồng thời — [Freqtrade Bot Basics](https://www.freqtrade.io/en/stable/bot-basics/)

### Inferences
- Bộ giới hạn tối thiểu hợp lý cho Coin Radar (suy luận, không phải chuẩn công bố):
  - Giới hạn lỗ theo ngày, tính trên equity bao gồm lỗ chưa chốt, giống cách Hummingbot tính.
  - Số vị thế mở tối đa.
  - Đòn bẩy tối đa, set cứng lúc khởi động.
  - Ngừng sau N lần stop liên tiếp, kiểu StoplossGuard.
  - Ngừng khi drawdown equity vượt X%.
- Mỗi lần kill switch kích hoạt phải gửi Telegram, và chỉ người dùng mới được mở lại, không tự mở sau một thời gian. Lý do: người dùng không xem màn hình thường xuyên.
- Nên chạy các giới hạn này ngay trong backtest để kết quả backtest phản ánh đúng hành vi live. Freqtrade làm được điều này với `--enable-protections`.

### Gaps
- Không tìm được nguồn uy tín đưa ra con số "chuẩn" cho giới hạn lỗ ngày hay đòn bẩy tối đa dành cho bot cá nhân. Các con số trên mạng chủ yếu là kinh nghiệm truyền miệng (folklore), không đưa vào.

## 4. Binance Futures Testnet / Demo Trading: mô phỏng được gì và không được gì

### Takeaway
Theo tài liệu chính thức hiện tại, môi trường thử USDⓈ-M là Demo Trading (REST `https://demo-fapi.binance.com`, WS `wss://demo-fstream.binance.com`). "Mock Trading" cũ đã chuyển thành Demo Trading. Chính Binance cảnh báo giá và nến trong môi trường mô phỏng có thể khác giá thị trường thật. Freqtrade không hỗ trợ sandbox và cho rằng sandbox "not suitable to test your strategy in a realistic environment".

### Cited Findings
- URL Testnet cho USDⓈ-M: REST "https://demo-fapi.binance.com", WebSocket "wss://demo-fstream.binance.com" — [Binance USDⓈ-M General Info](https://developers.binance.com/docs/derivatives/usds-margined-futures/general-info)
- "Mock Trading has transitioned to Binance Demo Trading" (cập nhật 2025-09-17) — [Binance FAQ Mock Trading](https://www.binance.com/en/support/faq/how-to-access-mock-trading-in-binance-futures-b3706b248f2b4b1caabb4bf253bf067f)
- Theo tóm tắt kết quả tìm kiếm, trang FAQ này (bản trước) nói biểu đồ nến và giá trong mô phỏng có thể khác giá trị thị trường, và số dư khởi đầu là 3.000 USDT. CHƯA KIỂM CHỨNG trên bản trang hiện tại, vì bản fetch về chỉ còn câu thông báo chuyển đổi — [Binance FAQ Mock Trading](https://www.binance.com/en/support/faq/how-to-access-mock-trading-in-binance-futures-b3706b248f2b4b1caabb4bf253bf067f)
- Với Spot demo, Binance hướng dẫn tạo API key riêng trên trang API Key Management của Demo Trading và đổi endpoint sang host demo — [Binance Spot Demo Mode General Info](https://developers.binance.com/docs/binance-spot-api-docs/demo-mode/general-info)
- Binance thông báo bảo trì riêng cho môi trường demo, ví dụ COIN-M demo bảo trì 2026-06-16 02:00 → 2026-06-23 10:00 UTC — [Binance Change Log](https://developers.binance.com/docs/derivatives/change-log)
- Freqtrade FAQ: "Sandbox markets are separate, simulated markets", "not suitable to test your strategy in a realistic environment". Thay vào đó Freqtrade dùng dry-run trên dữ liệu thị trường thật — [Freqtrade FAQ](https://www.freqtrade.io/en/stable/faq/)
- Spot testnet bị xóa toàn bộ dữ liệu theo định kỳ (periodic reset). Đây là spot, có thể khác futures — theo tóm tắt kết quả tìm kiếm về [Binance Spot testnet changelog](https://developers.binance.com/docs/binance-spot-api-docs/testnet)
- Thông tin faucet "chỉ nạp khi số dư < 1000 USDT, cách nhau 72 giờ" chỉ đến từ bài cộng đồng — CHƯA KIỂM CHỨNG ([Binance Square post](https://www.binance.com/en/square/post/17348051674122))

### Inferences
- Testnet/Demo có giá trị để kiểm tra phần CƠ KHÍ của bot: chữ ký API, định dạng lệnh, Algo Order stop, position mode, xử lý mã lỗi, reconnect, restart. Nó KHÔNG dùng được để đo hiệu quả chiến lược, vì sổ lệnh và giá có thể khác thị trường thật.
- Dry-run chạy trên dữ liệu thật (kiểu Freqtrade) phù hợp hơn để so tín hiệu với backtest. Testnet phù hợp hơn để thử luồng lệnh. Hai bước này bổ sung cho nhau, không thay thế nhau.

### Gaps
- Không tìm được tài liệu chính thức mô tả cụ thể Demo Futures xử lý ra sao về thanh khoản/độ sâu sổ lệnh, funding rate (có tính funding không), cơ chế khớp lệnh và thanh lý. Bài "How to Use Binance Demo Trading" chưa được fetch.

## 5. Phương pháp kiểm chứng: walk-forward, out-of-sample, lệch giữa paper và backtest, công cụ phát hiện look-ahead

### Takeaway
Bằng chứng định lượng tốt nhất là nghiên cứu của Quantopian trên 888 chiến lược: Sharpe trong backtest gần như không dự đoán được kết quả ngoài mẫu (R² < 0,025), và backtest càng nhiều thì khoảng cách backtest–thực tế càng lớn. Freqtrade có hai công cụ bắt lỗi kỹ thuật làm backtest đẹp giả: `lookahead-analysis` (dùng dữ liệu tương lai) và `recursive-analysis` (chỉ báo phụ thuộc độ dài lịch sử).

### Cited Findings
- Wiecki, Campbell, Lent, Stauth (Quantopian, 2016), 888 chiến lược có ≥ 6 tháng out-of-sample:
  - Sharpe backtest "offer little value in predicting out of sample performance" (R² < 0,025).
  - Volatility và max drawdown có giá trị dự đoán cao hơn.
  - "the more backtesting a quant has done for a strategy, the larger the discrepancy between backtest and out-of-sample performance".
  - Nguồn: [Quantpedia tóm tắt](https://quantpedia.com/quantopians-academic-paper-about-in-vs-out-of-sample-performance-of-trading-alg/), [bản PDF](https://c.mql5.com/forextsd/forum/208/All%20that%20Glitters%20Is%20Not%20Gold%20-%20Comparing%20Backtest%20and%20Out-of-Sample%20Performance%20on%20a%20Large%20Cohort%20o.pdf), [CXO Advisory](https://www.cxoadvisory.com/big-ideas/in-sample-vs-out-of-sample-performance-of-888-trading-strategies). Lưu ý: chỉ đọc qua abstract/tóm tắt, chưa đọc bản đầy đủ trên SSRN.
- Freqtrade `lookahead-analysis`:
  - Chạy một backtest gốc, sau đó chạy lại backtest cho từng tín hiệu vào/ra trên một cặp. So dataframe để phát hiện chỉ báo hoặc tín hiệu bị thay đổi (tức là đã dùng dữ liệu tương lai).
  - Cột `has_bias`, `biased_entry_signals`, `biased_exit_signals`, `biased_indicators`.
  - Có tùy chọn `--minimum-trade-amount`, `--targeted-trade-amount`.
  - Nguồn: [Freqtrade Lookahead analysis](https://www.freqtrade.io/en/stable/lookahead-analysis/)
- Giới hạn của lookahead-analysis:
  - "Signals that are not triggered will not have been verified" nên có thể bỏ sót (false negative).
  - Chiến lược phụ thuộc pairlist sẽ bị báo sai là có bias (false positive).
  - Nên sửa bias ở tín hiệu vào trước, rồi mới sửa tín hiệu ra.
  - Nguồn: [Freqtrade Lookahead analysis](https://www.freqtrade.io/en/stable/lookahead-analysis/)
- Freqtrade `recursive-analysis`:
  - Tính chỉ báo trên một khoảng dài làm chuẩn, rồi tính lại với `startup_candle_count` 199/499/999/1999. So % sai lệch ở hàng cuối.
  - Lý do cần làm: chỉ báo đệ quy như EMA khiến backtest khác dry/live, vì live chỉ có lượng lịch sử hạn chế.
  - Nên dùng ≥ ~5000 nến làm chuẩn. Công cụ chỉ phân tích `populate_indicators`.
  - Nguồn: [Freqtrade Recursive analysis](https://www.freqtrade.io/en/stable/recursive-analysis/)
- Freqtrade FAQ: dữ liệu "current" (orderbook/ticker) không dùng được trong backtest. Futures Binance cần định giá theo orderbook vì "there is no price ticker data for futures" — [Freqtrade FAQ](https://www.freqtrade.io/en/stable/faq/), [Freqtrade Exchange notes](https://www.freqtrade.io/en/stable/exchanges/)
- Live/dry-run tự động bỏ qua nến bị cũ (outdated) và lấp nến thiếu bằng nến rỗng. Đây là một nguồn lệch so với backtest trên dữ liệu đầy đủ — [Freqtrade FAQ](https://www.freqtrade.io/en/stable/faq/)

### Inferences
- Backtest chỉ trên "1 tháng gần nhất" có rủi ro rất cao: số giao dịch ít và chỉ có một chế độ thị trường (regime). Theo nghiên cứu Quantopian, việc chỉnh tham số liên tục trên cùng dữ liệu sẽ làm tăng khoảng cách với thực tế. Nên giữ lại một đoạn dữ liệu out-of-sample chưa từng chạm tới, và đánh giá drawdown/volatility chứ không chỉ Sharpe hay lợi nhuận.
- Nếu Coin Radar không dùng Freqtrade, nên tự làm phép thử tương đương lookahead-analysis: tính tín hiệu trên dữ liệu bị cắt cụt tại từng thời điểm, rồi so với tín hiệu tính trên toàn bộ dữ liệu. Hai kết quả phải giống hệt nhau.
- Tiêu chí chuyển giai đoạn (đề xuất): tín hiệu dry-run phải trùng với tín hiệu backtest chạy lại trên cùng khoảng thời gian. Lệch tín hiệu là lỗi code; lệch giá khớp là trượt giá (slippage) và phí.

### Gaps
- Không tìm được nguồn uy tín nêu "số giao dịch tối thiểu" cụ thể (ví dụ 30/100/200). Con số hay được trích là folklore, không đưa vào.
- Không tìm được bài công bố so sánh định lượng dry-run với backtest của Freqtrade, Jesse hay Hummingbot.
- Chưa tra tài liệu chính thức về walk-forward (Freqtrade không có lệnh walk-forward có sẵn; chưa xác minh) và về Monte Carlo xáo trộn chuỗi giao dịch. Chưa tra Probability of Backtest Overfitting / Deflated Sharpe (Bailey & López de Prado).

## 6. Bảo mật: quyền API key, IP whitelist, lưu secret

### Takeaway
Theo FAQ chính thức của Binance (cập nhật 20/3/2025): API key HMAC do hệ thống sinh mà KHÔNG giới hạn IP chỉ có quyền đọc, hiệu lực từ 2023-01-30. Muốn bật quyền giao dịch thì phải gắn IP whitelist, hoặc dùng key tự sinh Ed25519/RSA. Quyền rút tiền bắt buộc phải có IP whitelist. Blog bảo mật của Binance (2025) nói key không whitelist IP và không hoạt động 30 ngày sẽ bị xóa.

### Cited Findings
- "Unrestricted-IP-Access HMAC API Key(s) won't have any permission other than reading." Thay đổi giới hạn key hệ thống sinh có "Effective from 2023-01-30 00:00 (UTC)". Trang cập nhật lần cuối 20/3/2025 — [Binance FAQ: How to Create API Keys](https://www.binance.com/en/support/faq/how-to-create-api-keys-on-binance-360002502072)
- "Adding IP access (IPv4 format) restrictions is mandatory to enable withdrawal permission." — cùng nguồn
- Key tự sinh "use Ed25519 or RSA asymmetric encryption": người dùng tự tạo cặp khóa và chỉ gửi public key cho Binance — cùng nguồn
- Key tạo trước khi mở tài khoản Futures "won't be able to enable Futures permission", nên phải tạo key mới sau khi mở Futures — cùng nguồn
- Blog bảo mật Binance (2025-03-24) nói hai điều:
  - "If your API key is not IP whitelisted and inactive for 30 days, it will be deleted."
  - Mỗi ứng dụng nên dùng một key riêng, chỉ bật đúng quyền cần thiết.
  - Nguồn: [Binance Blog: 5 tips](https://www.binance.com/en/blog/security/how-to-use-an-api-key-securely-5-tips-from-binance-8638066848800196896)
- Nguồn thứ cấp nói key không whitelist sẽ hết hạn sau ~90 ngày, và Binance chỉ nhận IP đơn lẻ, không nhận dải CIDR — CHƯA KIỂM CHỨNG, có thể là chính sách cũ ([TradersPost](https://blog.traderspost.io/article/managing-binance-api-key-expiry-on-traderspost), [QuantConnect forum](https://www.quantconnect.com/forum/discussion/12734/binance-demands-ips-for-api-connection-after-90-days/))
- Binance.US (là sàn khác): đặt lại quyền về chỉ-đọc với key không whitelist IP và không dùng 90 ngày — [Binance.US support](https://support.binance.us/en/articles/9842812-binance-us-api-keys-best-practices-safety-tips)
- Binance chặn API theo quốc gia đặt server. Đây là ràng buộc khi chọn VPS — [Freqtrade Exchange notes](https://www.freqtrade.io/en/stable/exchanges/)

### Inferences
- PC ở nhà thường có IP động, nên khó gắn IP whitelist cho key HMAC. Có hai lựa chọn hợp lệ:
  - (a) Dùng key Ed25519 tự sinh. Theo FAQ, đây là cách thay thế IP whitelist để có quyền ngoài quyền đọc. Cần xác minh lại trên giao diện thật xem key Ed25519 không gắn IP có bật được quyền Futures không.
  - (b) Chuyển sang VPS có IP tĩnh rồi whitelist IP đó.
- Dù chọn cách nào cũng không bao giờ bật quyền rút tiền (withdrawal).
- Dùng key riêng cho Demo và cho thật. Secret lưu trong biến môi trường hoặc file `.env` có quyền 600, không đưa vào git, không gửi qua Telegram. Phần này là thực hành chung, chưa tra nguồn riêng.
- Nếu key không whitelist IP, bot bị tắt lâu (PC không bật) có thể làm key bị xóa sau 30 ngày không hoạt động, theo blog Binance.

### Gaps
- Chưa tìm được trang chính thức xác nhận key Ed25519/RSA KHÔNG gắn IP có bật được quyền Futures trading không, và có bị xóa sau 30 ngày không hoạt động không.
- Chưa tra hướng dẫn chính thức về lưu secret trên VPS (ví dụ systemd credentials, quyền file).
