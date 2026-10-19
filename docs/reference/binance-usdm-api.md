# Tham chiếu API Binance USDⓈ-M Futures cho bot Coin Radar

Ngày truy cập tài liệu: **2026-10-19**. Nguồn: chỉ tài liệu chính thức của Binance (developers.binance.com, trang FAQ chính thức binance.com) và một số lệnh GET công khai gọi trực tiếp (ghi rõ ở từng chỗ). Không gọi lệnh ký (signed) hay lệnh giao dịch nào.

Quy ước:
- Chỗ nào tài liệu không nói, ghi **KHÔNG THẤY TRONG TÀI LIỆU**.
- Chỗ nào là khuyến nghị của người soạn (không phải câu chữ chính thức), ghi **[Đề xuất]**.
- Chỗ nào tài liệu tự mâu thuẫn, ghi **[MÂU THUẪN]**.
- Mọi nhãn như `[GI]`, `[TRADE#new-algo-order]` là link; URL đầy đủ nằm ở bảng "Nguồn" cuối file. Đầu mỗi mục cũng có URL đầy đủ.
- Các URL cũ dạng `developers.binance.com/docs/derivatives/usds-margined-futures/...` được chuyển hướng (HTTP 302) sang cấu trúc mới `/en/docs/products/derivatives-trading-usds-futures/...` và `/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/...`. File này dùng URL mới. Trang tài liệu nằm sau tường lửa AWS WAF (curl trơn nhận HTTP 202 rỗng), nên nội dung được đọc bằng trình duyệt Playwright.

---

## 0. Kiểm chứng các giả định nghiên cứu ban đầu

| Giả định | Kết quả | Nguồn |
|---|---|---|
| Từ 2025-12-09, lệnh điều kiện (STOP_MARKET, TAKE_PROFIT_MARKET, STOP, TAKE_PROFIT, TRAILING_STOP_MARKET) phải đi qua `/fapi/v1/algoOrder` | **Đúng.** Change log mục 2025-11-06: "Effective on 2025-12-09, USDⓈ-M Futures will migrate conditional orders to the Algo Service" | [CL] |
| `/fapi/v1/order` trả `-4120` cho các loại đó | **Đúng.** Change log nói `POST /fapi/v1/order` và `POST /fapi/v1/batchOrders` "will block the requests for order types after the migration... error code -4120 STOP_ORDER_SWITCH_ALGO". Bảng lỗi: `-4120 STOP_ORDER_SWITCH_ALGO` = "Order type not supported for this endpoint. Please use the Algo Order API endpoints instead." (Chưa thử trên server thật vì không được gọi lệnh ký.) | [CL], [ERR] |
| User data stream phát `ALGO_UPDATE` | **Đúng**, xem mục 6. Sự kiện cũ `CONDITIONAL_ORDER_TRIGGER_REJECT` bị bỏ từ 2025-12-15; lý do từ chối nằm trong trường `rm` của `ALGO_UPDATE` | [UDS], [CL] (mục 2025-12-10) |
| Tham số stop tên `stopPrice`, trailing tên `activationPrice` | **SAI với algo endpoint.** Algo dùng `triggerPrice`, `activatePrice`, `clientAlgoId`. Trang New Algo Order còn sót chữ `stopPrice`/`activationPrice` trong phần ghi chú ở trang New Order (cũ) | [TRADE#new-algo-order], [TRADE#new-order] |

---

## 1. Ký request (signing), thời gian, recvWindow

URL: [GI] https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/general-info ; [WSA] https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/websocket-api-general-info ; [FAQ-KEY] https://www.binance.com/en/support/faq/detail/360002502072

### 1.1 Cách ký
- Header `X-MBX-APIKEY` mang API key. Endpoint loại TRADE và USER_DATA là "SIGNED", cần thêm tham số `signature`. [GI]
- Endpoint loại `USER_STREAM` và `MARKET_DATA` chỉ cần API key, không cần chữ ký. [GI]
- **HMAC SHA256**: khóa là `secretKey`, giá trị là `totalParams` (= query string nối với request body). Chữ ký không phân biệt hoa thường. `signature` phải là phần **cuối cùng** của query string/body. [GI]
- Thứ tự tham số tùy ý; tham số có thể ở query string hoặc body `application/x-www-form-urlencoded`, trộn được; nếu trùng thì query string thắng. GET thì chỉ query string. [GI]
- **RSA**: tài liệu futures mô tả PKCS#8, ký RSASSA-PKCS1-v1_5 với SHA-256, mã hóa base64, bỏ ký tự xuống dòng, rồi **URL-encode** chữ ký trước khi gửi. [GI] (mục "RSA Keys")
- **Ed25519**:
  - Tài liệu REST của futures (General Info, Quick Start) **không có ví dụ hay mô tả ký Ed25519**: **KHÔNG THẤY TRONG TÀI LIỆU** (cách ký REST bằng Ed25519 cho futures). [GI], [QS]
  - Ed25519 chỉ xuất hiện ở WebSocket API của futures: `session.logon` ghi "Only Ed25519 keys are supported for this feature". [WSA]
  - FAQ chính thức: khóa "system-generated" dùng HMAC; khóa "self-generated" dùng Ed25519 hoặc RSA (tự tạo cặp khóa, gửi public key cho Binance). [FAQ-KEY]
  - Khóa loại nào được phép bật quyền Futures trading: **KHÔNG THẤY TRONG TÀI LIỆU** (không có câu "Ed25519 được/không được dùng cho futures" ở các trang futures). Điều kiện duy nhất nêu rõ: khóa tạo **trước** khi bạn mở tài khoản Futures, hoặc tài khoản đã bật Portfolio Margin, thì không bật được quyền Futures. [FAQ-KEY]
  - **[Đề xuất]**: bot Node 24 không thư viện ngoài vẫn ký được HMAC bằng `node:crypto`; chọn loại khóa nào thì nên thử trên môi trường Demo (mục 9) trước khi dùng thật.

### 1.2 timestamp và recvWindow
- `timestamp` (ms, bắt buộc với endpoint ký). `recvWindow` mặc định **5000** ms nếu không gửi. [GI]
- `recvWindow` tối đa **60000** (ghi trên từng endpoint: "max: 60000"). [TRADE#new-order], [ACC]
- Logic server (nguyên văn): `if (timestamp < serverTime + 1000 && serverTime - timestamp <= recvWindow) { process } else { reject }`. [GI]
- Có thêm lỗi `-5028 ME_RECVWINDOW_REJECT` "Timestamp for this request is outside of the ME recvWindow" (kiểm tra ở matching engine). [ERR]

### 1.3 Server time
- `GET /fapi/v1/time`, weight **1**, trả `{"serverTime": <ms>}`. [MKT#check-server-time]
- Đã gọi thử (GET công khai) 2026-10-19: `{"serverTime":1792402605813}`, HTTP 200. https://fapi.binance.com/fapi/v1/time

### 1.4 Lỗi -1021
- Hai thông điệp: "Timestamp for this request is outside of the recvWindow." và "Timestamp for this request was 1000ms ahead of the server's time." [ERR]
- Hướng dẫn chính thức (FAQ chung của Binance, viết cho Spot nhưng cùng mã lỗi): thường do đồng hồ máy lệch với server; đồng bộ đồng hồ hệ thống (Linux: ntpdate); nếu vẫn lỗi thì có thể do độ trễ mạng, thử tăng `recvWindow`. [FAQ-API]
- **[Đề xuất]**: định kỳ gọi `/fapi/v1/time` để tính độ lệch (offset) và trừ vào `timestamp`; khi gặp -1021 thì đồng bộ lại offset rồi thử lại đúng 1 lần.

---

## 2. Thiết lập tài khoản

URL: [TRADE] https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/trade ; [ACC] https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/account

| Việc | Method + path | Weight | Tham số | Ghi chú |
|---|---|---|---|---|
| Đổi position mode | `POST /fapi/v1/positionSide/dual` [TRADE#change-position-mode] | 1 | `dualSidePosition` (string, bắt buộc): `"true"` = Hedge, `"false"` = One-way; `timestamp`; `recvWindow` | Đổi cho **mọi symbol**. Sau hợp nhất CM, UM và CM dùng chung `dualSidePosition`; có lệnh mở/vị thế ở UM hoặc CM thì bị từ chối: `-4067` (có lệnh mở), `-4068` (có vị thế), `-4531` (CM có vị thế/lệnh; mã tạm thời theo change log 2026-05-11) |
| Xem position mode | `GET /fapi/v1/positionSide/dual` [ACC#get-current-position-mode] | **30** | `timestamp`, `recvWindow` | Trả `{"dualSidePosition": false}` = One-way |
| Đổi margin type | `POST /fapi/v1/marginType` [TRADE#change-margin-type] | 1 | `symbol`, `marginType` (enum `ISOLATED`, `CROSSED`), `timestamp`, `recvWindow` | Trả `{"code":200,"msg":"success"}` |
| Đổi leverage | `POST /fapi/v1/leverage` [TRADE#change-initial-leverage] | 1 | `symbol`, `leverage` (int, min 1), `timestamp`, `recvWindow` | Trả `leverage`, `maxNotionalValue`, `symbol`. Tối đa theo symbol = `initialLeverage` của bracket 1 trong `leverageBracket` (ví dụ 150 cho BTCUSDT, ETHUSDT). Mốc "tối đa 125" đã bị xóa khỏi tài liệu ngày 2026-10-09 [CL] |
| Bracket đòn bẩy (cần key) | `GET /fapi/v1/leverageBracket` [ACC#notional-and-leverage-brackets] | 1 | `symbol` (tùy chọn), `timestamp`, `recvWindow` | Trường: `symbol`, `notionalCoef`, `brackets[]`: `bracket`, `initialLeverage`, `notionalCap`, `notionalFloor`, `maintMarginRatio`, `cum`. Không có `symbol` thì trả mảng nhiều symbol |
| Cấu hình từng symbol | `GET /fapi/v1/symbolConfig` [ACC#symbol-configuration] | 5 | `symbol` (tùy chọn) | Trả `symbol`, `marginType`, `isAutoAddMargin`, `leverage`, `maxNotionalValue`. Dùng để kiểm tra trước khi vào lệnh |
| Cấu hình tài khoản | `GET /fapi/v1/accountConfig` [ACC#futures-account-configuration] | 5 | | Trả `feeTier`, `canTrade`, `dualSidePosition`, `multiAssetsMargin`, `tradeGroupId` |
| Multi-Assets mode (xem) | `GET /fapi/v1/multiAssetsMargin` [ACC#get-current-multi-assets-mode] | **30** | | Trả `multiAssetsMargin` (boolean) |
| Multi-Assets mode (đổi) | `POST /fapi/v1/multiAssetsMargin` [TRADE#change-multi-assets-mode] | 1 | `multiAssetsMargin` `"true"/"false"` | |

Mã lỗi liên quan thiết lập [ERR]:
- `-4059 NO_NEED_TO_CHANGE_POSITION_SIDE`, `-4046 NO_NEED_TO_CHANGE_MARGIN_TYPE`: trạng thái đã đúng rồi. **[Đề xuất]**: coi là thành công.
- `-4047` "Margin type cannot be changed if there exists open orders"; `-4048` "...if there exists position".
- `-4028 INVALID_LEVERAGE`. `-4161 ISOLATED_LEVERAGE_REJECT_WITH_POSITION`: "Leverage reduction is not supported in Isolated Margin Mode with open positions".
- `-2027 MAX_LEVERAGE_RATIO` "Exceeded the maximum allowable position at current leverage". `-2028 MIN_LEVERAGE_RATIO`.
- `-4203/-4205/-4206/-4208/-4209/-4403`: trần đòn bẩy theo tuổi tài khoản, quốc gia, symbol.

**Multi-Assets mode và isolated margin (caveat)**: bảng lỗi có `-4167` "Unable to adjust to Multi-Assets mode with symbols of USDⓈ-M Futures under isolated-margin mode." và `-4168` "Unable to adjust to isolated-margin mode under the Multi-Assets mode." Nghĩa là hai chế độ này **loại trừ nhau**: bot dùng isolated thì tài khoản phải ở Single-Asset mode. [ERR] **[Đề xuất]**: lúc khởi động gọi `GET /fapi/v1/accountConfig`, nếu `multiAssetsMargin == true` thì dừng và báo.

**Mẹo weight**: `dualSidePosition` và `multiAssetsMargin` đều có trong `GET /fapi/v1/accountConfig` (weight 5), rẻ hơn hai endpoint riêng (weight 30 mỗi cái). Đây là quan sát từ các bảng weight, tài liệu không nói gì thêm. [ACC]

---

## 3. Lệnh thường (`/fapi/v1/order`)

URL: [TRADE#new-order] https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/trade#new-order

### 3.1 New Order
- `POST /fapi/v1/order`. Weight: **0 IP weight**; tính **1** vào giới hạn lệnh 10 giây (`X-MBX-ORDER-COUNT-10S`) và **1** vào giới hạn lệnh 1 phút (`X-MBX-ORDER-COUNT-1M`). [TRADE#new-order]
- Tham số:

| Tham số | Kiểu | Bắt buộc | Giá trị/ghi chú |
|---|---|---|---|
| `symbol` | string | có | |
| `side` | enum | có | `BUY`, `SELL` |
| `type` | enum | có | `LIMIT`, `MARKET`, `STOP`, `STOP_MARKET`, `TAKE_PROFIT`, `TAKE_PROFIT_MARKET`, `TRAILING_STOP_MARKET`. **[MÂU THUẪN]**: enum vẫn liệt kê 5 loại điều kiện nhưng chúng bị chặn bằng `-4120` (mục 0). Bot chỉ gửi `LIMIT`/`MARKET` tới endpoint này |
| `timestamp` | int64 | có | |
| `positionSide` | string | không | Mặc định `BOTH` ở One-way; `LONG`/`SHORT` ở Hedge (bắt buộc ở Hedge) |
| `timeInForce` | enum | LIMIT thì có | `GTC`, `IOC`, `FOK`, `GTX`, `GTD`, `RPI` |
| `reduceOnly` | enum string | không | `"true"`/`"false"`, mặc định `false`. Không gửi được ở Hedge Mode |
| `quantity` | number | LIMIT, MARKET thì có | |
| `price` | number | LIMIT thì có | |
| `newClientOrderId` | string | không | Xem 3.2 |
| `newOrderRespType` | enum | không | `ACK` (mặc định), `RESULT` |
| `priceMatch` | enum | không | `OPPONENT`, `OPPONENT_5`, `OPPONENT_10`, `OPPONENT_20`, `QUEUE`, `QUEUE_5`, `QUEUE_10`, `QUEUE_20`; chỉ cho LIMIT/STOP/TAKE_PROFIT; không gửi cùng `price`. Change log 2025-10-21: `OPPONENT_10`, `OPPONENT_20` tạm thời bị gỡ khỏi lệnh đặt/sửa |
| `selfTradePreventionMode` | enum | không | `EXPIRE_TAKER`, `EXPIRE_BOTH`, `EXPIRE_MAKER`; mặc định `EXPIRE_MAKER`; chỉ hiệu lực khi TIF là IOC/GTC/GTD |
| `goodTillDate` | int64 | GTD thì có | Phải > thời điểm hiện tại + 600 giây và < 253402300799000; phần ms bị bỏ qua |
| `recvWindow` | int64 | không | max 60000 |

- Tham số bắt buộc theo type: `LIMIT` = `timeInForce`, `quantity`, `price`; `MARKET` = `quantity`. [TRADE#new-order]
- `newOrderRespType=RESULT`: MARKET trả luôn trạng thái `FILLED` cuối cùng; LIMIT với TIF đặc biệt trả `FILLED` hoặc `EXPIRED`. [TRADE#new-order]
- Trường phản hồi chính: `clientOrderId`, `orderId`, `symbol`, `status`, `side`, `positionSide`, `type`, `origType`, `timeInForce`, `origQty`, `executedQty`, `cumQty`, `price`, `reduceOnly`, `closePosition`, `stopPrice`, `workingType`, `priceProtect`, `priceMatch`, `selfTradePreventionMode`, `goodTillDate`, `updateTime`. [TRADE#new-order]
- Định nghĩa `timeInForce` [CD]: `GTC` (hiệu lực **1 năm** kể từ lúc đặt), `IOC`, `FOK`, `GTX` (Post Only), `GTD`, `RPI`. Trang https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/common-definition
- Kiểm tra trực tiếp (GET công khai `exchangeInfo`, 2026-10-19): BTCUSDT có `timeInForce: [GTC, IOC, FOK, GTX, GTD]`. https://fapi.binance.com/fapi/v1/exchangeInfo
- GTD: "In extreme market conditions, timeInForce GTD order auto-cancel time might be delayed compared to goodTillDate". Vì GTD tối thiểu cách hiện tại 600 giây, hạn "tự hủy sau X phút" ngắn hơn 10 phút phải tự bot hủy. [TRADE#new-order]
- Test lệnh không gửi vào khớp: `POST /fapi/v1/order/test` ("this order will not be submitted to matching engine"). Weight: **KHÔNG THẤY TRONG TÀI LIỆU** (trang không hiển thị dòng weight). [TRADE#test-order]

### 3.2 newClientOrderId
- Quy tắc nguyên văn: "A unique id among open orders. Automatically generated if not sent. Can only be string following the rule: `^[\.A-Z\:/a-z0-9_-]{1,36}$`". [TRADE#new-order]
- Tức là: độ dài 1 đến 36; ký tự cho phép: chữ cái hoa/thường, số, `.`, `:`, `/`, `_`, `-`. Quá dài bị `-4015 INVALID_CL_ORD_ID_LEN` ("length should not be more than 36 chars"). [ERR]
- **Duy nhất chỉ trong số các lệnh đang mở (open orders)**, không phải duy nhất vĩnh viễn. Trùng thì có `-4116 DUPLICATED_CLIENT_ORDER_ID`. [ERR] **[Đề xuất]**: id nên chứa mã chạy/uuid ngắn để không tái dùng sau khi lệnh cũ đã đóng (tài liệu không bảo đảm id đã đóng bị chặn tái dùng, cũng không nói ngược lại).
- Truy vấn theo client id: `origClientOrderId` (lệnh thường) hoặc `clientAlgoId` (algo). Lệnh canceled/expired không khớp nào và quá 3 ngày, hoặc lệnh quá 90 ngày, **sẽ không tìm thấy nữa**. [TRADE#query-order]

### 3.3 Truy vấn / hủy / liệt kê
| Việc | Endpoint | Weight | Tham số |
|---|---|---|---|
| Hỏi 1 lệnh | `GET /fapi/v1/order` [TRADE#query-order] | 1 | `symbol` (bắt buộc), `orderId` hoặc `origClientOrderId`, `timestamp`. Có cả hai thì ưu tiên theo trang; trả `-2013` nếu không tồn tại |
| Hỏi 1 lệnh đang mở | `GET /fapi/v1/openOrder` [TRADE#query-current-open-order] | 1 | như trên; lệnh đã khớp/hủy trả "Order does not exist" |
| Hủy 1 lệnh | `DELETE /fapi/v1/order` [TRADE#cancel-order] | 1 | `symbol`, `orderId` hoặc `origClientOrderId`. `-2011` = "Unknown order sent" |
| Mọi lệnh đang mở | `GET /fapi/v1/openOrders` [TRADE#current-all-open-orders] | **1 nếu có symbol; 40 nếu bỏ symbol** | `symbol` tùy chọn |
| Hủy tất cả theo symbol | `DELETE /fapi/v1/allOpenOrders` [TRADE#cancel-all-open-orders] | 1 | `symbol` (bắt buộc) |
| Lịch sử lệnh | `GET /fapi/v1/allOrders` [TRADE#all-orders] | 5 | `symbol` (từ 2026-08-25 là tùy chọn), `orderId`, `startTime`, `endTime`, `limit` (mặc định 500, max 1000). Cửa sổ mặc định 7 ngày |
| Giao dịch (fill) | `GET /fapi/v1/userTrades` [TRADE#account-trade-list] | 5 | `symbol` (bắt buộc), `orderId`, `startTime`, `endTime`, `fromId`, `limit` (mặc định 500, max 1000). Cửa sổ ≤ 7 ngày; `fromId` không đi cùng thời gian; chỉ 3 tháng gần nhất. Trường: `id`, `orderId`, `price`, `qty`, `quoteQty`, `commission`, `commissionAsset`, `realizedPnl`, `buyer`, `maker`, `side`, `positionSide`, `symbol`, `marginAsset`, `time` |

- Trạng thái lệnh (`status`): `NEW`, `PARTIALLY_FILLED`, `FILLED`, `CANCELED`, `REJECTED`, `EXPIRED`, `EXPIRED_IN_MATCH`. [CD]
- Câu hỏi: `GET /fapi/v1/openOrders` và `DELETE /fapi/v1/allOpenOrders` có bao gồm lệnh algo hay không: **KHÔNG THẤY TRONG TÀI LIỆU**. Có endpoint riêng cho algo (mục 4), nên **[Đề xuất]** reconcile phải gọi cả hai.
- Bộ lọc `MAX_NUM_ORDERS` (ví dụ BTCUSDT live = 200) "counts both algo orders and normal orders". [CD]

### 3.4 Countdown cancel-all (công tắc người chết)
URL: [TRADE#auto-cancel-all-open-orders] https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/trade#auto-cancel-all-open-orders
- `POST /fapi/v1/countdownCancelAll`, weight **10**. Tham số: `symbol` (bắt buộc), `countdownTime` (ms, bắt buộc; `0` = tắt), `timestamp`, `recvWindow`. Trả `{symbol, countdownTime}`.
- Cách dùng chính thức: gọi lặp như heartbeat; ví dụ gọi mỗi 30 giây với `countdownTime=120000`; không gọi trong 120 giây thì **mọi lệnh của symbol đó bị hủy**. Server kiểm tra các bộ đếm mỗi ~10 ms; "không nên đặt quá sát/quá nhỏ".
- Là **theo từng symbol**: phải gọi cho từng symbol bot đang giữ lệnh.
- Hủy cả lệnh algo (SL/TP điều kiện) hay không: **KHÔNG THẤY TRONG TÀI LIỆU**. Trang chỉ nói "all open orders of the specified symbol". **[Đề xuất]**: coi như KHÔNG hủy lệnh algo; vì SL phải luôn nằm trên sàn, đây là điều tốt, nhưng bot phải tự kiểm thử trên Demo để biết chắc.
- Hủy lệnh vào (entry LIMIT) khi PC tắt là đúng mục đích; **lệnh reduce-only TP có thể bị hủy cùng** nếu chúng là lệnh thường. **[Đề xuất]** cân nhắc khi chọn loại lệnh TP.
- Với PC nhà có thể tắt: nếu bot chết, vị thế đã mở vẫn còn SL algo trên sàn (nếu dùng algo SL). Cần kiểm chứng trên Demo.

### 3.5 Batch
- `POST /fapi/v1/batchOrders` [TRADE#place-multiple-orders]: `batchOrders` tối đa **5** lệnh; weight: **5** trên giới hạn 10 giây, **1** trên giới hạn 1 phút, **5** IP weight. Quy tắc tham số như New Order; xử lý **đồng thời, thứ tự khớp không bảo đảm**; mảng trả về cùng thứ tự với danh sách; mỗi phần tử có thể kèm `code`/`msg` riêng (ví dụ `-2022`).
- `DELETE /fapi/v1/batchOrders` [TRADE#cancel-multiple-orders]: tối đa **10** id (`orderIdList` hoặc `origClientOrderIdList`), weight 1.
- `PUT /fapi/v1/batchOrders` sửa nhiều lệnh LIMIT, tối đa 5, weight 5. [TRADE#modify-multiple-orders]
- General Info khuyên: lúc cao điểm nên dùng lệnh đơn thay vì batch để giảm bất định khi gặp 503 "unknown". [GI]
- Lệnh điều kiện (algo) **không** đi qua batch (change log 2025-11-06: chỉ có các endpoint algo đơn lẻ).

### 3.6 Modify order
- `PUT /fapi/v1/order` chỉ sửa được **LIMIT**; cần cả `quantity` và `price`; tối đa 10000 lần sửa mỗi lệnh; weight tính như đặt lệnh (1 trên 10s và 1 trên 1m). Có tham số `reduceOnly` (từ 2026-09-15) chỉ để kiểm tra, và `modifyId`. [TRADE#modify-order], [CL]

---

## 4. Lệnh điều kiện (Algo Order)

URL: [TRADE#new-algo-order] https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/trade#new-algo-order ; migration: [CL] https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/change-log (mục 2025-11-06)

### 4.1 Endpoint
| Việc | Method + path | Weight |
|---|---|---|
| Tạo | `POST /fapi/v1/algoOrder` | **0 IP weight**; 1 trên `X-MBX-ORDER-COUNT-10S`, 1 trên `X-MBX-ORDER-COUNT-1M` (cập nhật 2026-06-20 [CL]) |
| Hủy 1 | `DELETE /fapi/v1/algoOrder` [TRADE#cancel-algo-order] | 1 |
| Hủy tất cả theo symbol | `DELETE /fapi/v1/algoOpenOrders` [TRADE#cancel-all-algo-open-orders] | 1 |
| Hỏi 1 | `GET /fapi/v1/algoOrder` [TRADE#query-algo-order] | 1 |
| Đang mở | `GET /fapi/v1/openAlgoOrders` [TRADE#current-all-algo-open-orders] | 1 với symbol; **40** nếu bỏ symbol |
| Tất cả (cả đã đóng) | `GET /fapi/v1/allAlgoOrders` [TRADE#query-all-algo-orders] | 5 |

### 4.2 Tham số New Algo Order
| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `algoType` | enum | có | chỉ `CONDITIONAL` |
| `symbol` | string | có | |
| `side` | enum | có | `BUY`, `SELL` |
| `type` | enum | có | `LIMIT`, `MARKET`, `STOP`, `STOP_MARKET`, `TAKE_PROFIT`, `TAKE_PROFIT_MARKET`, `TRAILING_STOP_MARKET` (đoạn mô tả nói loại hỗ trợ: STOP_MARKET, TAKE_PROFIT_MARKET, STOP, TAKE_PROFIT, TRAILING_STOP_MARKET) |
| `timestamp` | int64 | có | |
| `positionSide` | string | không | mặc định `BOTH` |
| `timeInForce` | enum | không | `GTC`, `IOC`, `FOK`, `GTX`, `GTD`, `RPI` (STOP/TAKE_PROFIT mặc định GTC) |
| `quantity` | number | tùy | "Cannot be sent with closePosition=true" |
| `price` | number | tùy | cho STOP/TAKE_PROFIT (có giá) |
| `triggerPrice` | number | tùy | giá kích hoạt (không phải `stopPrice`) |
| `workingType` | enum | không | `MARK_PRICE`, `CONTRACT_PRICE`; **mặc định `CONTRACT_PRICE`**, nên bot phải gửi `MARK_PRICE` tường minh cho SL |
| `closePosition` | enum string | không | `"true"`/`"false"`; "Close-All", dùng với `STOP_MARKET` hoặc `TAKE_PROFIT_MARKET` |
| `priceProtect` | enum string | không | `"true"`/`"false"`, mặc định `false`; dùng với STOP_MARKET/TAKE_PROFIT_MARKET: khi chạm `triggerPrice`, chênh lệch giữa MARK_PRICE và CONTRACT_PRICE không được vượt `triggerProtect` của symbol (lấy từ `exchangeInfo`; BTCUSDT live = `0.0500`) |
| `reduceOnly` | enum string | không | `"true"`/`"false"`, mặc định `false`; không gửi được ở Hedge Mode; không gửi cùng `closePosition=true` |
| `activatePrice` | number | không | cho TRAILING_STOP_MARKET; mặc định = giá mới nhất (theo `workingType`) |
| `callbackRate` | number | tùy | cho TRAILING_STOP_MARKET; **min 0.1, max 10** (đơn vị % không được nêu rõ trên trang này; ví dụ phản hồi hủy lệnh cũ ghi `priceRate "0.3"`) |
| `clientAlgoId` | string | không | "A unique id among open orders. Automatically generated if not sent." Regex `^[\.A-Z\:/a-z0-9_-]{1,36}$` (giống newClientOrderId) |
| `newOrderRespType` | enum | không | `ACK` (mặc định), `RESULT` |
| `priceMatch` | enum | không | như mục 3.1 |
| `selfTradePreventionMode` | enum | không | `NONE`(mặc định), `EXPIRE_TAKER`, `EXPIRE_BOTH`, `EXPIRE_MAKER` |
| `goodTillDate` | int64 | GTD thì có | như mục 3.1 |
| `recvWindow` | int64 | không | |

### 4.3 Điều kiện kích hoạt (theo trang)
- `STOP`, `STOP_MARKET`: BUY khi giá mới nhất (`MARK_PRICE` hoặc `CONTRACT_PRICE`) `>= triggerPrice`. Dòng điều kiện cho SELL **bị mất chữ so sánh khi hiển thị** trên trang: **KHÔNG THẤY TRONG TÀI LIỆU** (nguyên văn trang chỉ còn "SELL: latest price (...)"). Suy luận hợp lý (không phải câu chính thức): SELL stop kích hoạt khi giá `<= triggerPrice`.
- `TAKE_PROFIT`, `TAKE_PROFIT_MARKET`: SELL khi giá `>= triggerPrice`; dòng BUY cũng bị mất ký tự so sánh (suy luận: `<=`).
- `TRAILING_STOP_MARKET`: SELL cần giá cao nhất sau khi đặt lệnh `>= activatePrice`, rồi kích hoạt khi giá hồi lại theo `callbackRate`. Nếu bị `-2021 Order would immediately trigger`: BUY cần `activatePrice` nhỏ hơn giá mới nhất; SELL cần `activatePrice` lớn hơn giá mới nhất.
- `closePosition=true` (STOP_MARKET/TAKE_PROFIT_MARKET): đóng toàn bộ vị thế long (nếu SELL) hoặc short (nếu BUY); không dùng được với `quantity` và `reduceOnly`; ở Hedge không dùng BUY cho LONG, SELL cho SHORT.

### 4.4 Hai lệnh closePosition cùng tồn tại?
**KHÔNG THẤY TRONG TÀI LIỆU.** Không có câu nào nói cho phép hay cấm hai lệnh `closePosition=true` đồng thời trên một symbol. Cũng không thấy mã lỗi riêng cho việc này. Giới hạn số lệnh algo được nêu:
- Mục định nghĩa filter `MAX_NUM_ALGO_ORDERS` ghi 100 lệnh algo mỗi symbol [CD]; nhưng change log 2025-12-29 nói filter này **đã bị xóa** khỏi `exchangeInfo` và "The conditional order limits is 200 across all symbols" [CL]. **[MÂU THUẪN]**. Kiểm tra trực tiếp `exchangeInfo` 2026-10-19: BTCUSDT chỉ có `MAX_NUM_ORDERS = 200`, không có `MAX_NUM_ALGO_ORDERS`. Lỗi khi vượt: `-4045 MAX_STOP_ORDER_EXCEEDED`, `-2025 MAX_OPEN_ORDER_EXCEEDED`. [ERR]
- **[Đề xuất]**: bot nên giữ đúng 1 lệnh SL `closePosition` cho mỗi symbol, và kiểm thử "hai SL" trên Demo nếu cần.

### 4.5 "Dời" SL: có endpoint sửa không?
- **Không.** Change log 2025-11-06: "Modification of untriggered conditional orders is not supported." `PUT /fapi/v1/order` chỉ sửa LIMIT. [CL], [TRADE#modify-order]
- Cách dời SL về giá vào lệnh là **hủy + đặt lại**: `DELETE /fapi/v1/algoOrder` (theo `algoId` hoặc `clientAlgoId`) rồi `POST /fapi/v1/algoOrder` mới với `triggerPrice` mới.
- Giữa hai bước có khoảng trống không có SL. Tài liệu không có thao tác nguyên tử. **[Đề xuất]**: đặt SL mới **trước**, xác nhận (`algoStatus: NEW` hoặc `ALGO_UPDATE`), rồi mới hủy SL cũ; việc có cho phép hai SL tồn tại tạm thời cần thử trên Demo (xem 4.4). Dùng `clientAlgoId` mới cho mỗi lệnh.

### 4.6 Hành vi khác sau di chuyển (change log 2025-11-06)
- "No margin check before the conditional order gets triggered" (không kiểm tra ký quỹ trước khi kích hoạt); lệnh bị `REJECTED` nếu hỏng kiểm tra ký quỹ lúc kích hoạt. [CL], [UDS]
- "GTE_GTC orders no longer depend on open orders of the opposite side, but rather on positions only." [CL]
- Không tăng độ trễ khi kích hoạt. [CL]

### 4.7 Phản hồi algo
- Tạo: `algoId`, `clientAlgoId`, `algoType`, `orderType`, `symbol`, `side`, `positionSide`, `timeInForce`, `quantity`, `algoStatus`, `triggerPrice`, `price`, `workingType`, `priceMatch`, `closePosition`, `priceProtect`, `reduceOnly`, `activatePrice`, `callbackRate`, `createTime`, `updateTime`, `triggerTime`, `goodTillDate`.
- Hỏi thêm: `actualOrderId` (rỗng nếu chưa kích hoạt; là `orderId` nếu đã kích hoạt), `actualPrice`, `actualType`, `actualQty`. Hủy trả `algoId`, `clientAlgoId`, `code`, `msg`.
- `GET /fapi/v1/algoOrder`: cần `algoId` hoặc `clientAlgoId`; `algoId` tự tăng theo từng symbol. Lệnh `CANCELED`/`EXPIRED` không khớp và quá 3 ngày, hoặc quá 90 ngày, sẽ không tìm thấy. `allAlgoOrders`: `symbol` bắt buộc, cửa sổ < 7 ngày, `limit` mặc định 500 max 1000.
- Trạng thái algo (`algoStatus`): `NEW`, `CANCELED`, `TRIGGERING`, `TRIGGERED`, `FINISHED`, `REJECTED`, `EXPIRED`. [UDS]

### 4.8 Mã lỗi riêng cho algo
- `-4120` (mục 0). `-4142 STRATEGY_INVALID_TRIGGER_PRICE` "REJECT: take profit or stop order will be triggered immediately". `-2021` cho trailing. `-4135 INVALID_ACTIVATION_PRICE`. `-4137` "Quantity must be zero with closePosition equals true". `-4138` "Reduce only must be true with closePosition equals true" (**[MÂU THUẪN]** với câu "Cannot be used with reduceOnly parameter" trên trang algo; bảng lỗi có thể là chữ cũ). `-4210/-4211` giá stop vượt trần/sàn. `-4117 STOP_ORDER_TRIGGERING`. [ERR]

---

## 5. Vị thế, tài khoản, thu nhập, phí

URL: [TRADE], [ACC] (mục 2).

| Việc | Endpoint | Weight | Ghi chú |
|---|---|---|---|
| Vị thế V3 (nên dùng) | `GET /fapi/v3/positionRisk` [TRADE#position-information-v3] | 5 | `symbol` tùy chọn; **chỉ trả symbol có vị thế hoặc lệnh mở**. Trường: `symbol`, `positionSide`, `positionAmt` (dương = long, âm = short), `entryPrice`, `breakEvenPrice`, `markPrice`, `unRealizedProfit`, `liquidationPrice`, `isolatedMargin`, `notional`, `marginAsset`, `isolatedWallet`, `initialMargin`, `maintMargin`, `positionInitialMargin`, `openOrderInitialMargin`, `adl`, `updateTime` |
| Vị thế V2 | `GET /fapi/v2/positionRisk` [TRADE#position-information-v2] | 5 | trả mọi symbol; có thêm `marginType`, `leverage`, `maxNotionalValue`, `isAutoAddMargin` |
| Số dư V3 | `GET /fapi/v3/balance` [ACC#futures-account-balance-v3] | 5 | `accountAlias`, `asset`, `balance`, `crossWalletBalance`, `crossUnPnl`, `availableBalance`, `maxWithdrawAmount`, `marginAvailable`, `updateTime` |
| Số dư V2 | `GET /fapi/v2/balance` | 5 | |
| Lịch sử thu nhập | `GET /fapi/v1/income` [ACC#get-income-history] | **30** | `symbol`, `incomeType` (có `REALIZED_PNL`, `FUNDING_FEE`, `COMMISSION`, `TRANSFER`, `WELCOME_BONUS`, `INSURANCE_CLEAR`, `REFERRAL_KICKBACK`, `COMMISSION_REBATE`, ... và `SPECIAL_FUNDING_FEE` từ 2026-09-10; trang chỉ hiển thị 8 giá trị đầu, còn 15 giá trị bị ẩn), `startTime`, `endTime`, `limit` (mặc định 100, max 1000). Mặc định 7 ngày gần nhất; chỉ có 3 tháng. **Tham số `page` đã bị bỏ từ 2026-10-16** [CL]. Trường: `symbol`, `incomeType`, `income`, `asset`, `info`, `time`, `tranId`, `tradeId` |
| Tỷ lệ phí | `GET /fapi/v1/commissionRate` [ACC#user-commission-rate] | **20** | `symbol` **bắt buộc**. Trả `makerCommissionRate`, `takerCommissionRate`, `rpiCommissionRate` (chuỗi, ví dụ `"0.0004"`) |
| Giới hạn lệnh của tài khoản | `GET /fapi/v1/rateLimit/order` [ACC#query-user-rate-limit] | 1 | trả mảng `rateLimitType`, `interval`, `intervalNum`, `limit` |
| Giao dịch | `GET /fapi/v1/userTrades` | 5 | mục 3.3 |

- Lưu ý chính thức trên trang vị thế: "Please use with user data stream ACCOUNT_UPDATE to meet your timeliness and accuracy needs." [TRADE#position-information-v3]
- Phí giao dịch thực tế của từng fill: lấy từ `userTrades.commission`/`commissionAsset` hoặc `ORDER_TRADE_UPDATE` (`n`, `N`).
- Giá trị `MIN_NOTIONAL`: tài liệu ví dụ là `"5.0"` và lỗi `-4164` nói "no smaller than 5.0 (unless you choose reduce only)", nhưng giá trị **thực tế trên server** BTCUSDT lúc kiểm tra (GET công khai `exchangeInfo`, 2026-10-19) là `"50"`. **[MÂU THUẪN]** giữa ví dụ trong tài liệu và dữ liệu thật; luôn đọc `exchangeInfo` từng symbol. Lệnh `reduceOnly` được miễn kiểm tra này. [ERR], [CD]
- **`deliveryDate` của hợp đồng vĩnh cửu — [QUAN SÁT, CHƯA CÓ TÀI LIỆU]:** GET công khai `exchangeInfo` ngày 2026-10-19: 523/525 hợp đồng PERPETUAL USDT đang TRADING có `deliveryDate` = 4133404800000 (2100-12-25); EPICUSDT = 2026-10-20 09:00 UTC và VELODROMEUSDT = 2026-10-28 09:00 UTC (trùng mẫu hợp đồng sắp hủy niêm yết). Chưa tìm thấy câu chữ tài liệu Binance nói ý nghĩa này. Cổng G-06 của Coin Radar dùng quy tắc “`deliveryDate` trước 2100 → trượt” **chỉ để thêm điều kiện chặn**; KHÔNG coi `deliveryDate` = 2100 là bằng chứng hợp đồng an toàn.

---

## 6. User data stream (luồng dữ liệu người dùng)

URL: [UDS] https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/user-data-streams ; [R-UDS] https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/user-data-streams ; [WSN] https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/websocket-market-streams/Important-WebSocket-Change-Notice

### 6.1 listenKey
| Việc | Endpoint | Weight | Ghi chú |
|---|---|---|---|
| Tạo | `POST /fapi/v1/listenKey` | 1 | Chỉ cần API key (loại USER_STREAM, không ký). Nếu tài khoản đã có listenKey đang hoạt động thì trả lại key đó và gia hạn 60 phút |
| Gia hạn | `PUT /fapi/v1/listenKey` | 1 | Gia hạn thêm 60 phút; nếu server trả `-1125` ("This listenKey does not exist") thì tạo lại bằng POST |
| Đóng | `DELETE /fapi/v1/listenKey` | 1 | Đóng stream, vô hiệu hóa key |

- listenKey có hiệu lực **60 phút** sau khi tạo; trang REST ghi "It's recommended to send a ping about every 60 minutes". [UDS], [R-UDS] **[Đề xuất]**: gia hạn thường xuyên hơn (ví dụ mỗi 30 phút) để có biên an toàn, vì tài liệu chỉ khuyến nghị đúng mốc 60 phút.
- Một kết nối WebSocket chỉ sống **24 giờ**, sẽ bị ngắt ở mốc 24 giờ. [UDS]

### 6.2 URL WebSocket (đã đổi cấu trúc)
- Cơ sở: `wss://fstream.binance.com`. Ba đường dẫn: `/public`, `/market`, `/private`. User data đi qua **`/private`**. [WSC], [UDS]
- Dạng kết nối user data: `wss://fstream.binance.com/private/ws/<listenKey>` (trang UDS) hoặc `wss://fstream.binance.com/private/ws?listenKey=<listenKey>&events=ORDER_TRADE_UPDATE/ACCOUNT_UPDATE` (trang Important Notice, có lọc sự kiện bằng `events`). [UDS], [WSN]
- **URL cũ `wss://fstream.binance.com/ws/...` và `/stream` bị ngừng hẳn sau 2026-04-23** (hôm nay là 2026-10-19, tức là đã hết hạn). Kết nối không có đường dẫn `/public|/market|/private` chỉ nhận dữ liệu của `/public`. [WSN]
- Sự kiện cùng loại trên cùng kết nối được sắp thứ tự nghiêm ngặt theo `T` và `E`; tài liệu khuyên dùng `E` để sắp xếp khi so các loại sự kiện khác nhau. [UDS]

### 6.3 Các sự kiện và trường bot dùng [UDS]
**ORDER_TRADE_UPDATE** (`e`, `E`, `T`, đối tượng `o`):
`s` symbol, `c` client order id, `S` side, `o` order type, `f` TIF, `q` qty gốc, `p` giá gốc, `ap` giá TB, `sp` stop price (bỏ qua với trailing), `x` execution type, `X` order status, `i` order id, `l` qty khớp lần cuối, `z` qty khớp lũy kế, `L` giá khớp lần cuối, `N` tài sản phí, `n` phí, `T` thời điểm giao dịch, `t` trade id, `m` maker?, `R` reduce only?, `wt` working type, `ot` order type gốc, `ps` position side, `cp` close-all?, `AP` activation price (trailing), `cr` callback rate (trailing), `pP` price protect, `rp` realized profit của giao dịch, `V` STP mode, `pm` price match, `gtd`, `er` expiry reason, `M` modifyId (chỉ với AMENDMENT).
- Execution type (`x`): `NEW`, `CANCELED`, `CALCULATED` (thanh lý), `EXPIRED`, `TRADE`, `AMENDMENT`. Order status (`X`): `NEW`, `PARTIALLY_FILLED`, `FILLED`, `CANCELED`, `EXPIRED`, `EXPIRED_IN_MATCH`.
- Thanh lý: `c` dạng `autoclose-XXX`; ADL: `c` = `adl_autoclose`.
- Expiry reason `er`: 0 mặc định; 1 tự khớp bản thân; 2 IOC không khớp hết; 3; 4 bị lệnh RO ưu tiên đẩy ra hoặc sẽ đảo vị thế; 5 thanh lý; 6 điều kiện GTE không thỏa; 7 delist; 8 lệnh gốc hết hạn sau khi stop kích hoạt; 9 MARKET không khớp hết.

**ALGO_UPDATE** (`e`, `T`, `E`, đối tượng `o`): `caid` client algo id, `aid` algo id, `at` algo type, `o` order type, `s` symbol, `S` side, `ps` position side, `f` TIF, `q` qty, `X` algo status, `ai` order id (id lệnh thực trong matching engine, dùng để nối với `ORDER_TRADE_UPDATE.i`), `ap` giá khớp TB, `aq` qty đã khớp, `act` loại lệnh thực, `tp` trigger price, `p` giá, `V` STP, `wt` working type, `pm`, `cp` close-all?, `pP`, `R` reduce only?, `tt` thời điểm kích hoạt, `gtd`, `rm` **lý do thất bại** (ví dụ "Reduce Only reject"), `ia` đã kích hoạt chưa (chỉ trailing).
- Trailing: trước khi kích hoạt (X vẫn `NEW`) có thể nhận **hai** sự kiện `NEW`: một với `ia:false`, một với `ia:true` khi trailing được kích hoạt (change log 2026-08-21). [CL]
- Khi lệnh algo được kích hoạt thì lệnh thực phát sinh có `clientOrderId` là gì và có phát `ORDER_TRADE_UPDATE` với client id nào: **KHÔNG THẤY TRONG TÀI LIỆU**. **[Đề xuất]**: nối bằng `ai`/`actualOrderId` ↔ `orderId`.

**ACCOUNT_UPDATE** (`e`, `E`, `T`, đối tượng `a`): `m` lý do (`ORDER`, `FUNDING_FEE`, `DEPOSIT`, `WITHDRAW`, `MARGIN_TYPE_CHANGE`, ...); `B[]`: `a` tài sản, `wb` số dư ví, `cw` số dư cross, `bc` thay đổi ngoài PnL và phí; `P[]`: `s`, `pa` khối lượng vị thế, `ep` giá vào, `bep` giá hòa vốn, `cr` PnL thực hiện lũy kế (trước phí), `up` PnL chưa thực hiện, `mt` margin type, `iw` isolated wallet, `ps`; `S` symbol (chỉ với FUNDING_FEE, từ 2026-08-07). Chỉ phát khi số dư/vị thế/margin type thay đổi; lệnh chưa khớp hoặc hủy không phát.

**ACCOUNT_CONFIG_UPDATE**: `ac.s` symbol, `ac.l` leverage; `ai.j` Multi-Assets mode.
**MARGIN_CALL** (`e`, `E`, `cw` chỉ cho cross, `p[]`: `s`, `ps`, `pa`, `mt`, `iw`, `mp` mark price, `up`, `mm` ký quỹ duy trì). "Chỉ để cảnh báo rủi ro"; có thể đã bị thanh lý khi nhận được.
**TRADE_LITE**: `s`, `q`, `p`, `m`, `c`, `S`, `L`, `l`, `t`, `i` (nhanh hơn, ít trường, chỉ TRADE).
**listenKeyExpired**: `e`, `E`, `listenKey`. "Not related to the websocket disconnection"; chỉ nhận khi một listenKey **đang kết nối** hết hạn; sau đó **không còn sự kiện nào** cho đến khi dùng listenKey mới.
**CONDITIONAL_ORDER_TRIGGER_REJECT**: bị bỏ từ 2025-12-15; lý do từ chối nằm trong `ALGO_UPDATE.o.rm`. [CL]

### 6.4 Gợi ý kết nối lại
- Tài liệu chính thức chỉ nêu: dữ liệu REST có thể trễ lúc thị trường biến động mạnh, "nên ưu tiên dùng user data stream". Không có quy trình reconnect/resync chính thức: **KHÔNG THẤY TRONG TÀI LIỆU**. [UDS]
- **[Đề xuất]** quy trình khôi phục (dựa trên các sự thật ở trên): khi mở lại kết nối hoặc nhận `listenKeyExpired`: (1) `POST /fapi/v1/listenKey` lấy key mới, (2) mở kết nối `/private`, (3) rồi gọi REST để đối chiếu: `GET /fapi/v3/positionRisk`, `GET /fapi/v1/openOrders`, `GET /fapi/v1/openAlgoOrders`, `GET /fapi/v1/userTrades`, (4) áp dụng sự kiện đến sau.

### 6.5 Bổ sung cho B8a (đọc lại 2026-10-19 bằng WebFetch)
- Phản hồi listenKey [R-UDS]: `POST` và `PUT /fapi/v1/listenKey` đều trả `{"listenKey": "<chuỗi>"}`; `DELETE` trả HTTP 200, không có dữ liệu. Cả ba chỉ cần header `X-MBX-APIKEY` (USER_STREAM), **PUT/DELETE không có tham số listenKey** trong tài liệu (sàn tự nhận diện theo API key: **KHÔNG THẤY TRONG TÀI LIỆU** cơ chế cụ thể).
- Trang UDS chỉ nêu dạng đường dẫn `wss://fstream.binance.com/private/ws/<listenKey>` (ví dụ đầy đủ có key thật dạng chuỗi dài). Trang [WSN] nêu dạng `.../private/ws?listenKey=<key>&events=ORDER_TRADE_UPDATE/ACCOUNT_UPDATE`; tham số `events` có bắt buộc hay không, bỏ trống thì nhận gì: **KHÔNG THẤY TRONG TÀI LIỆU**. Bot (B8a) dùng dạng đường dẫn của trang UDS để không phụ thuộc vào `events`.
- Trạng thái `ALGO_UPDATE.o.X` [UDS]: `NEW`, `CANCELED`, `TRIGGERING`, `TRIGGERED`, `FINISHED`, `REJECTED`, `EXPIRED`.
- Ví dụ JSON (schema) của `listenKeyExpired`, `ALGO_UPDATE`, `ORDER_TRADE_UPDATE`, `ACCOUNT_UPDATE` không tải được trên trang UDS khi đọc bằng WebFetch; tên trường dùng theo mục 6.3 (đọc trước đó bằng trình duyệt). Kiểu dữ liệu từng trường (số hay chuỗi) **KHÔNG THẤY TRONG TÀI LIỆU** ở lần đọc này → code chấp nhận cả số và chuỗi số.

---

## 7. Market streams cho bot

URL: [WSC] https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/websocket-market-streams/Connect ; [WSM] https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/ws-streams/market ; [WSN]

- Ba đường dẫn: **kline và markPrice thuộc `/market`**; depth và bookTicker thuộc `/public`. [WSN] (bảng "Endpoint & Stream Mapping")
- Kline: raw `wss://fstream.binance.com/market/ws/<symbol>@kline_<interval>`; combined `wss://fstream.binance.com/market/stream?streams=<symbol>@kline_<interval>/...`. Cập nhật mỗi **250 ms**. Khoảng nến hợp lệ (định nghĩa chung): `1s`, `1m`, `3m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `6h`, `8h`, `12h`, `1d`, `3d`, `1w`, `1M`. [WSM], [CD]
- Payload kline `k`: `t` giờ mở, `T` giờ đóng, `s`, `i`, `f`, `L`, `o`, `c`, `h`, `l`, `v`, `n`, `x` (**nến đã đóng chưa**), `q`, `V`, `Q`, `B`. Cấp ngoài: `e`, `E`, `s`. [WSM]
- Mark price: `<symbol>@markPrice` hoặc `<symbol>@markPrice@1s` (enum tốc độ: `1s`); đẩy mỗi 3 giây hoặc mỗi giây. Payload: `e` (`markPriceUpdate`), `E`, `s`, `p` mark, `i` index, `P` giá thanh toán ước tính, `r` funding rate, `ap` mark price MA, `T` giờ funding kế, `st`. Cả thị trường: `!markPrice@arr` hoặc `!markPrice@arr@1s`. [WSM]
- Combined stream bọc `{"stream":"<streamName>","data":<rawPayload>}`; tên symbol **viết thường**. [WSC]
- Kết nối kiểu SUBSCRIBE: kết nối `wss://fstream.binance.com/market/stream` rồi gửi `{"method":"SUBSCRIBE","params":[...],"id":"..."}`. [WSM]
- Giới hạn: tối đa **1024 stream** mỗi kết nối; **10 tin nhắn đến/giây** mỗi kết nối (vượt thì bị ngắt, IP vi phạm lặp lại có thể bị cấm); mỗi kết nối chỉ hợp lệ **24 giờ**. [WSC]
- Ping/pong: server gửi ping frame mỗi **3 phút**; không nhận pong trong **10 phút** thì ngắt; pong chủ động được phép (nên gửi tần suất cao hơn 15 phút). Trang WebSocket API bổ sung: khi nhận ping phải trả pong kèm đúng payload; pong chủ động không ngăn việc bị ngắt. [WSC], [WSA]
- Số kết nối tối đa mỗi IP: **KHÔNG THẤY TRONG TÀI LIỆU** (chỉ thấy giới hạn "5 weight cho mỗi lần handshake" ở WebSocket API, không áp dụng cho market stream).
- Kline REST tương ứng: `GET /fapi/v1/klines`, weight phụ thuộc `limit` (<100: 1; 100 đến <500: 2; 500 đến 1000: 5; >1000: 10); `limit` mặc định 500, max 1500; mỗi dòng 12 phần tử. [MKT#kline-candlestick-data]
- `GET /fapi/v1/premiumIndex` (mark price) weight 1 có symbol, **10** không có symbol. [MKT#mark-price]

### 7.1 Bổ sung cho B8a (đọc lại 2026-10-19 bằng WebFetch)
- SUBSCRIBE [WSL]: `{"method": "SUBSCRIBE", "params": ["btcusdt@aggTrade", "btcusdt@depth"], "id": 1}`; phản hồi `{"result": null, "id": 1}`. `id` là **số nguyên không âm** ("an unsigned INT"); thiếu hoặc sai kiểu → lỗi `"Invalid request: request ID must be an unsigned integer"`. (Sửa ví dụ ở mục 7 phía trên dùng `"id":"..."` dạng chuỗi.) Lỗi có dạng `{"code": <số>, "msg": "..."}`. Có lỗi `"Invalid request: too many parameters"` nhưng **trần số params mỗi tin: KHÔNG THẤY TRONG TÀI LIỆU** → **[Đề xuất]** 50 stream/tin.
- Vì phản hồi lỗi SUBSCRIBE không có `id` [WSL], không biết lô nào hỏng; thời hạn chờ ack: **KHÔNG THẤY TRONG TÀI LIỆU** → **[Đề xuất]** gặp lỗi hoặc quá 10 s không có ack thì gửi lại mọi lô chưa ack (id mới), coi các stream đó là stale tới khi có dữ liệu, quá 3 vòng thì đóng và nối lại.
- Giới hạn 10 tin đến/giây [WSC]: tài liệu không nói ping/pong/control frame có tính vào hay không: **KHÔNG THẤY TRONG TÀI LIỆU** → **[Đề xuất]** mặc định 5 tin/giây để chừa chỗ.
- Nghĩa trường kline `k` [WSM]: `t` Kline start time, `T` Kline close time, `s`, `i` Interval, `f` First trade ID, `L` Last trade ID, `o`/`c`/`h`/`l` giá mở/đóng/cao/thấp, `v` Base asset volume, `n` Number of trades, `x` "Is this kline closed?", `q` Quote asset volume, `V` Taker buy base asset volume, `Q` Taker buy quote asset volume, `B` Ignore. Ví dụ: `t` 1638747660000, `T` 1638747719999 (nến 1m: `T = t + khoảng − 1`) → nến kế liền mạch khi `t` mới = `T` cũ + 1.
- Mark price [WSM] ví dụ: `{"e":"markPriceUpdate","E":1562305380000,"s":"BTCUSDT","p":"11794.15000000",...}`: `p` là chuỗi số; `E` "Event time".
- Ping/pong phía client: API WebSocket chuẩn trong Node 24 không cho mã ứng dụng gửi/nhận ping-pong frame; đã kiểm trên máy (Node v24.21.0, server cục bộ gửi PING payload `abc123`) → Node tự trả **PONG kèm đúng payload**. Đây là kiểm thực nghiệm, không phải tài liệu Binance.

---

## 8. Giới hạn tần suất (rate limits)

URL: [GI] ; [CD] ; [WSA]

- Hai nhóm: giới hạn theo **IP** (`REQUEST_WEIGHT`) và giới hạn lệnh theo **tài khoản** (`ORDERS`). Giới hạn dựa trên IP, không dựa trên API key. [GI]
- Giá trị thực (GET công khai `exchangeInfo` 2026-10-19): `REQUEST_WEIGHT` 2400 mỗi 1 phút; `ORDERS` 1200 mỗi 1 phút; `ORDERS` 300 mỗi 10 giây. https://fapi.binance.com/fapi/v1/exchangeInfo . Mảng này nằm ở `rateLimits` của `exchangeInfo`. [GI]
- Header: mỗi response có `X-MBX-USED-WEIGHT-(intervalNum)(intervalLetter)` (ví dụ `x-mbx-used-weight-1m`); mỗi response **của lệnh** có `X-MBX-ORDER-COUNT-(intervalNum)(intervalLetter)` (ví dụ `-10S`, `-1M`). Lệnh bị từ chối/thất bại **không bảo đảm** có header đếm lệnh. [GI]
- Đã quan sát: sau một lần gọi `exchangeInfo`, header `x-mbx-used-weight-1m: 1661`. Vì giới hạn tính theo IP, mọi tiến trình dùng chung IP (kể cả phần quét dữ liệu công khai của Coin Radar) **cùng dùng một ngân sách 2400/phút** với bot giao dịch.
- 429: vi phạm giới hạn; client phải ngừng gọi. 418: IP bị cấm tự động vì tiếp tục gọi sau 429; thời gian cấm tăng dần với tái phạm từ **2 phút đến 3 ngày**. 403: vi phạm WAF. 408: hết thời gian chờ backend. 5xx: lỗi phía Binance. [GI]
- Header `Retry-After` khi 429/418: **KHÔNG THẤY TRONG TÀI LIỆU** futures (client hiện có `packages/binance/client.ts` đang đọc `retry-after`; nên giữ phương án dự phòng 60 giây). Mã lỗi: `-1003 TOO_MANY_REQUESTS` ("current limit is %s requests per minute" hoặc "IP banned until %s"), `-1015 TOO_MANY_ORDERS`. [ERR]
- Lệnh vào/hủy/sửa qua REST và WebSocket API dùng chung hạn mức lệnh; hạn mức weight WebSocket API tách riêng với REST (chỉ phần đặt/sửa/hủy lệnh đơn/batch dùng chung). [WSA]
- Bảng weight của các endpoint bot dùng: xem từng mục (time 1; exchangeInfo 1; klines 1 đến 10; order/algoOrder 0 IP weight; openOrders 1 hoặc 40; positionRisk 5; balance 5; income 30; commissionRate 20; positionSide/dual GET 30; multiAssetsMargin GET 30; listenKey 1; countdownCancelAll 10).
- Hệ thống bảo vệ quá tải: `-1008` "Request throttled by system-level protection. Reduce-only/close-position orders are exempt." Áp dụng `POST /fapi/v1/order`, `/batchOrders`, `/order/test`; **lệnh reduce-only/close-position/hủy được miễn**; không tính vào rate limit. [GI]

---

## 9. Môi trường: production, Testnet, Demo

URL: [GI] ; [QS] https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/quick-start ; [FAQ-DEMO] https://www.binance.com/en/support/faq/detail/ab78f9a1b8824cf0a106b4229c76496d

| Môi trường | REST | WebSocket | Nguồn |
|---|---|---|---|
| Production | `https://fapi.binance.com` | `wss://fstream.binance.com` + `/public`, `/market`, `/private` | [GI], [WSC] |
| "Testnet" theo mục General Info | `https://demo-fapi.binance.com` | `wss://demo-fstream.binance.com` | [GI] ("Testnet API Information") |
| Testnet theo trang REST schema | `https://testnet.binancefuture.com` | (ws-streams ghi `wss://stream.binancefuture.com`; WebSocket API ghi `wss://testnet.binancefuture.com/ws-fapi/v1`) | [TRADE], [WSM], [WSA] |

- **[MÂU THUẪN]**: tài liệu futures ghi hai bộ URL "testnet" khác nhau (demo-* và testnet.binancefuture.com / stream.binancefuture.com). Change log 2024-01-24 còn ghi một URL thứ ba: `wss://fstream.binancefuture.com`. [CL] Kiểm tra trực tiếp ngày 2026-10-19: cả `https://demo-fapi.binance.com/fapi/v1/time` và `https://testnet.binancefuture.com/fapi/v1/time` đều trả HTTP 200 kèm `serverTime`. Mục General Info (trang chính thức nói về "testnet") là nơi duy nhất nói rõ cặp URL đi chung nhau (`demo-fapi` + `demo-fstream`), nên **[Đề xuất]** dùng cặp này; xác minh lại bằng thử nghiệm.
- Chưa tìm thấy trang tài liệu riêng "Futures Demo Trading" của USDⓈ-M trên developers.binance.com (Quick Start trỏ tới "Futures Demo Trading page" nhưng không có link). Có: [FAQ-DEMO].
- Lấy key Demo: đăng nhập tài khoản **Binance Futures Demo Trading** (bấm Create nếu chưa có), vào API Management, chọn Create API và đặt tên; "You can now start testing". [FAQ-DEMO] Key Demo tách biệt với key thật (đăng nhập riêng tài khoản Demo); URL cổng demo cho Options được nêu ở change log là `https://demo.binance.com/zh-CN/my/settings/api-management`. [CL] (mục 2025-11-12, dành cho Options)
- Giới hạn của Demo: General Info chỉ nói "Most of the endpoints can be used in the testnet platform". Danh sách endpoint **không** hỗ trợ trên Demo (ví dụ `algoOrder`, `countdownCancelAll`, đường dẫn `/private`): **KHÔNG THẤY TRONG TÀI LIỆU**. Điều này phải tự kiểm thử trước khi tin vào Demo.
- Quick Start: "Futures Testnet... Currently, this is only available via the API." [QS]

---

## 10. Mã lỗi bot phải xử lý

URL: [ERR] https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/error-code ; [GI]

| Mã | Tên | Chữ chính thức | Xử lý theo tài liệu |
|---|---|---|---|
| HTTP 503 + `-1007`/"Unknown error, please check your request or try again later." | TIMEOUT | "Timeout waiting for response from backend server. Send status unknown; execution status unknown." | **KHÔNG coi là thất bại**; trạng thái thực thi là UNKNOWN, có thể đã thành công. Kiểm tra qua user data stream hoặc truy vấn theo `orderId`/`origClientOrderId` trước khi gửi lại, để tránh trùng lệnh. Lúc cao điểm nên dùng lệnh đơn thay vì batch. Có thể có hoặc không tính vào rate limit. [GI] |
| HTTP 503 "Service Unavailable." | | thất bại 100% | Retry với exponential backoff (ví dụ 200ms, 400ms, 800ms; tối đa 3 đến 5 lần); không tính rate limit [GI] |
| HTTP 503 "Internal error; unable to process your request. Please try again." (`-1001`) | DISCONNECTED | thất bại | Có thể gửi lại [GI] |
| `-1006` | UNEXPECTED_RESP | "Execution status unknown." | Như -1007: xác minh trước khi gửi lại [ERR] |
| `-1008` | Request Throttled | "Request throttled by system-level protection. Reduce-only/close-position orders are exempt. Please try again." | Thất bại 100%; retry với backoff và giảm đồng thời; lệnh giảm vị thế được miễn [GI] |
| `-1003` | TOO_MANY_REQUESTS | | Dừng gọi, backoff; lặp lại sẽ bị 418 [GI], [ERR] |
| `-1015` | TOO_MANY_ORDERS | "Too many new orders; current limit is %s orders per %s." | Giảm tốc độ lệnh [ERR] |
| `-1021` | INVALID_TIMESTAMP | mục 1.4 | Đồng bộ đồng hồ, thử lại [FAQ-API] |
| `-1022` | INVALID_SIGNATURE | | Kiểm tra cách ký và thứ tự `signature` ở cuối [GI], [ERR] |
| `-2015` | REJECTED_MBX_KEY | "Invalid API-key, IP, or permissions for action." | Kiểm tra IP whitelist/quyền khóa [ERR] |
| `-2019` | MARGIN_NOT_SUFFICIEN | "Margin is insufficient." | Không đủ ký quỹ; chữ chính thức chỉ có vậy, không nêu hướng xử lý riêng. **[Đề xuất]** giảm cỡ lệnh/đòn bẩy hoặc bỏ qua tín hiệu [ERR] |
| `-2021` | ORDER_WOULD_IMMEDIATELY_TRIGGER | "Order would immediately trigger." | Với trailing: BUY cần `activatePrice` < giá mới nhất, SELL cần `activatePrice` > giá mới nhất [TRADE#new-algo-order] |
| `-2022` | REDUCE_ONLY_REJECT | "ReduceOnly Order is rejected." + "This indicates the new reduce-only order conflicts with existing open orders; cancel the existing order and resubmit the reduce-only order." | Hủy lệnh cũ xung đột rồi đặt lại. Đây là rủi ro khi có 3 lệnh TP reduce-only cộng SL cùng lúc [ERR] |
| `-4118` | REDUCE_ONLY_MARGIN_CHECK_FAILED | "...the new reduce-only order, combined with an existing same-side open order, would create an opposite-side position and lead to insufficient margin; please cancel the open order and try again." | [ERR] |
| `-2024` | POSITION_NOT_SUFFICIENT | | [ERR] |
| `-2026` | REDUCE_ONLY_ORDER_TYPE_NOT_SUPPORTED | "This OrderType is not supported when reduceOnly." | [ERR] |
| `-2011` | CANCEL_REJECTED | "Unknown order sent." | Lệnh không còn trong sổ (đã khớp/hủy) [ERR] |
| `-2013` | NO_SUCH_ORDER | "Order does not exist." | [ERR] |
| `-4061` | POSITION_SIDE_NOT_MATCH | "Order's position side does not match user's setting." | Đang One-way thì không gửi `positionSide=LONG/SHORT`, để mặc định `BOTH` [ERR], [TRADE#new-order] |
| `-4120` | STOP_ORDER_SWITCH_ALGO | "Order type not supported for this endpoint. Please use the Algo Order API endpoints instead." | Chuyển sang `/fapi/v1/algoOrder` [ERR] |
| `-4131` | MARKET_ORDER_REJECT | "The counterparty's best price does not meet the PERCENT_PRICE filter limit" | Lệnh MARKET bị từ chối do giá bên đối ứng ngoài biên `PERCENT_PRICE`. Tài liệu không nêu cách xử lý; **[Đề xuất]** dùng LIMIT hoặc chờ [ERR] |
| `-4164` | MIN_NOTIONAL | "Order's notional must be no smaller than 5.0 (unless you choose reduce only)" | Giá trị tối thiểu thật lấy từ `exchangeInfo` (BTCUSDT live = 50); lệnh reduce-only được miễn [ERR] |
| `-4003/-4004/-4023/-4014/-1111` | lỗi số lượng/giá | `QTY_LESS_THAN_ZERO`, `QTY_LESS_THAN_MIN_QTY`, `QTY_NOT_INCREASED_BY_STEP_SIZE`, `PRICE_NOT_INCREASED_BY_TICK_SIZE`, `BAD_PRECISION` | Làm tròn theo `LOT_SIZE`/`PRICE_FILTER`/`MARKET_LOT_SIZE` ở `exchangeInfo` [ERR], [CD] |
| `-4015` | INVALID_CL_ORD_ID_LEN | "length should not be more than 36 chars" | [ERR] |
| `-4116` | DUPLICATED_CLIENT_ORDER_ID | "clientOrderId is duplicated" | [ERR] |
| `-2025`, `-4045` | MAX_OPEN_ORDER_EXCEEDED, MAX_STOP_ORDER_EXCEEDED | | [ERR] |
| `-4142` | STRATEGY_INVALID_TRIGGER_PRICE | "REJECT: take profit or stop order will be triggered immediately" | [ERR] |
| `-4400`, `-4401` | quy tắc định lượng / vị thế lớn | "only reduceOnly order is allowed" | Chỉ cho phép lệnh reduce-only [ERR] |
| `-4087`, `-4088`, `-2023`, `-4141`, `-4109` | quyền / thanh lý / symbol đóng / tài khoản chưa kích hoạt | | [ERR] |
| `-5021`, `-5022` | FOK_ORDER_REJECT, GTX_ORDER_REJECT | | [ERR] |
| `-4067`, `-4068`, `-4531`, `-4046`, `-4047`, `-4048`, `-4059`, `-4161`, `-4167`, `-4168` | thiết lập tài khoản | mục 2 | [ERR] |
| `-1125` | INVALID_LISTEN_KEY | "This listenKey does not exist. Please use POST /fapi/v1/listenKey to recreate listenKey" | Tạo lại listenKey [ERR] |

Định dạng lỗi: `{"code": -1121, "msg": "Invalid symbol."}`; "Codes are universal, but messages can vary." [ERR]

---

## 11. Bảo mật API key

URL: [FAQ-KEY] https://www.binance.com/en/support/faq/detail/360002502072 ; [QS] ; [FAQ-API] https://www.binance.com/en/support/faq/detail/360004492232

- Sau khi tạo, khóa mặc định chỉ có quyền "Enable Reading". Muốn rút tiền qua API phải đổi quyền trên giao diện Binance. Khuyến nghị đặt hạn chế IP cho khóa. [QS]
- Khóa HMAC (system-generated) **không có hạn chế IP** thì không có quyền nào ngoài đọc ("Unrestricted-IP-Access HMAC API Key(s) won't have any permission other than reading"). Muốn bật quyền khác: thêm hạn chế IP (định dạng IPv4), hoặc dùng khóa tự tạo (Ed25519/RSA), hoặc tắt các kiểm soát an ninh mặc định. [FAQ-KEY]
- Quyền rút tiền: **bắt buộc** có hạn chế IP (IPv4). [FAQ-KEY]
- Quyền Futures: khóa tạo trước khi mở tài khoản Futures, hoặc khi đã bật Portfolio Margin, thì không bật được quyền Futures. [FAQ-KEY]
- Từ 2023-01-30 00:00 UTC, quyền của khóa system-generated chỉ được đặt là "Enable Reading" nếu IP không bị hạn chế. [FAQ-KEY]
- Điều kiện để tạo khóa: bật 2FA, nạp một khoản bất kỳ vào ví Spot, và hoàn tất xác minh danh tính. [FAQ-KEY]
- Khóa tự xóa/hết hạn với khóa không hạn chế IP (hạn 30/90 ngày, v.v.): **KHÔNG THẤY TRONG TÀI LIỆU** chính thức nào mà tôi truy cập được (các trang FAQ chính thức chỉ nêu: khóa có thể bị xóa nếu bạn không hoạt động từ trước 2018-03-07, hoặc khi tài khoản bị vô hiệu hóa [FAQ-API]). Có nguồn bên thứ ba nói "90 ngày" nhưng đó không phải tài liệu chính thức nên **không dùng làm căn cứ**.
- Secret key chỉ hiện đúng một lần lúc tạo; mất thì phải tạo khóa mới. Không nhập key vào dịch vụ bên thứ ba. [FAQ-API]
- Quyền giao dịch và lệnh WebSocket API: nếu khóa mất hiệu lực giữa phiên (IP không còn trong danh sách trắng, bị xóa, thiếu quyền), phiên bị hủy ở request kế tiếp với `-2015`. [WSA]
- Khuyến nghị chung (từ Quick Start): không chia sẻ API key/secret cho bất kỳ ai. [QS]

---

## Nguồn (bảng URL đầy đủ, đã truy cập 2026-10-19)

| Nhãn | URL |
|---|---|
| GI | https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/general-info |
| QS | https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/quick-start |
| CL | https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/change-log |
| ERR | https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/error-code |
| CD | https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/common-definition |
| UDS | https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/user-data-streams |
| WSA | https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/websocket-api-general-info |
| WSC | https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/websocket-market-streams/Connect |
| WSN | https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/websocket-market-streams/Important-WebSocket-Change-Notice |
| WSM | https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/ws-streams/market |
| WSL | https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/websocket-market-streams/Live-Subscribing-Unsubscribing-to-streams |
| TRADE | https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/trade (neo: `#new-order`, `#new-algo-order`, `#cancel-algo-order`, `#cancel-all-algo-open-orders`, `#query-algo-order`, `#current-all-algo-open-orders`, `#query-all-algo-orders`, `#cancel-order`, `#query-order`, `#current-all-open-orders`, `#cancel-all-open-orders`, `#place-multiple-orders`, `#cancel-multiple-orders`, `#modify-multiple-orders`, `#modify-order`, `#auto-cancel-all-open-orders`, `#change-position-mode`, `#change-margin-type`, `#change-initial-leverage`, `#change-multi-assets-mode`, `#position-information-v3`, `#position-information-v2`, `#account-trade-list`, `#all-orders`, `#test-order`) |
| ACC | https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/account (neo: `#get-current-position-mode`, `#get-current-multi-assets-mode`, `#notional-and-leverage-brackets`, `#symbol-configuration`, `#futures-account-configuration`, `#futures-account-balance-v3`, `#get-income-history`, `#user-commission-rate`, `#query-user-rate-limit`, `#account-information-v3`) |
| MKT | https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data (neo: `#check-server-time`, `#exchange-information`, `#kline-candlestick-data`, `#mark-price`) |
| R-UDS | https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/user-data-streams |
| FAQ-KEY | https://www.binance.com/en/support/faq/detail/360002502072 |
| FAQ-DEMO | https://www.binance.com/en/support/faq/detail/ab78f9a1b8824cf0a106b4229c76496d |
| FAQ-API | https://www.binance.com/en/support/faq/detail/360004492232 |
| Live (GET công khai, không ký) | https://fapi.binance.com/fapi/v1/time ; https://fapi.binance.com/fapi/v1/exchangeInfo ; https://demo-fapi.binance.com/fapi/v1/time ; https://testnet.binancefuture.com/fapi/v1/time |

Ghi chú về độ tin cậy: các trang trên đọc bằng trình duyệt (văn bản hiển thị). Một số ký tự `<`, `<=` trong trang bị mất khi hiển thị (xem mục 4.3); các giá trị enum bị gập ("show N more") chỉ ghi những gì thấy được. Những điểm đó đã được đánh dấu **KHÔNG THẤY TRONG TÀI LIỆU** thay vì đoán.
