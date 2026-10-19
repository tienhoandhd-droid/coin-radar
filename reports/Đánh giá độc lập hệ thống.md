# Đánh giá độc lập hệ thống Coin Radar

Ngày: 19/10/2026 · Người đánh giá: agent độc lập (không viết code này) · Phạm vi: `packages/core`, `packages/binance`,
`scanner`, `backtest` (đang làm), hai spec, các test.

**Bản được đánh giá.** Commit `ed912e6` (HEAD lúc bắt đầu). Trong lúc đánh giá, một agent khác đang sửa cây làm việc
(working tree, các thay đổi chưa commit) cho Task B0 của kế hoạch bot. Họ đổi `config.ts`, `analyze.ts`, `plan.ts`,
`pattern-plan.ts`, `rules.ts`, `plan-print.ts` và thêm `exit.ts`. Số dòng trong báo cáo lấy theo **HEAD `ed912e6`**.
Chỗ nào bản sửa dở đã đụng tới thì có ghi chú. Báo cáo không sửa file nào của repo.

**Kết quả chạy thật**

| Lệnh | Kết quả |
|---|---|
| `npm test` (đầu phiên) | `tests 496 · pass 496 · fail 0` |
| `npm run typecheck` (đầu phiên) | thoát mã 0 |
| `npm run typecheck` (cuối phiên, trên cây đang bị agent khác sửa) | **lỗi**: `scanner/run-scan.ts(104)` và `scanner/scan.ts(60)` vẫn gọi `defaultRiskPct`/`highRiskTierPct` đã bị xóa; `scanner/plan-print.test.ts(6)` thiếu trường `exit`. Lỗi này là tạm thời, do việc sửa đang làm dở, không phải lỗi của HEAD |
| `npm run scan -- --mode swing --limit 40` (một lần, code HEAD) | 40 hợp đồng, 32 giây, 0 lỗi. Thị trường `up`. **Đạt tiêu chí: 0. Hạng A: 0** |

Không chạy `backtest/fetch.ts` và không đụng vào `data/cache`.

---

## Phần 1 — Bảng kiểm (checklist) các lỗi chết người trong hệ thống giao dịch thuật toán

Mỗi mục ghi: cần kiểm gì, nguồn tham khảo, và kết quả kiểm trên Coin Radar.

| # | Lỗi | Cần kiểm | Nguồn | Coin Radar |
|---|---|---|---|---|
| 1 | Nhìn trước tương lai (look-ahead) do dùng nến chưa đóng | Chỉ dùng nến đã đóng. Nến cuối của REST có thể đang chạy | [Binance WS kline, trường `x`](https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams); [Freqtrade lookahead-analysis](https://www.freqtrade.io/en/stable/lookahead-analysis/) | **Đạt.** `isClosed` (`candles.ts`) dùng chung cho máy quét và phát lại; `parseKlines` lọc nến chưa đóng (`parse.ts:35`) |
| 2 | Look-ahead do chỉ báo tính trên cả chuỗi | Không dùng thống kê toàn chuỗi, không lệch âm | [Freqtrade, Common mistakes](https://www.freqtrade.io/en/stable/strategy-customization/) | **Đạt.** Pivot cần 3 nến bên phải. Mô hình có test tiền tố bằng nhau trên dữ liệu thật ETH 4H (`track.test.ts:104–153`, `context.test.ts:210,233`). Chưa có test tiền tố end-to-end cho `analyze` (kế hoạch 2 Task 2) |
| 3 | Khởi động chỉ báo (recursive/startup bias) | Giá trị cuối không đổi khi nạp thêm lịch sử | [Freqtrade recursive-analysis](https://www.freqtrade.io/en/stable/recursive-analysis/) | **Phần lớn đạt.** G-02 cần ≥ 250 nến. EMA200 trên 300 nến 1D vẫn còn phụ thuộc điểm khởi đầu, nhưng mức ảnh hưởng nhỏ |
| 4 | Thiên lệch sống sót (survivorship) | Tập coin backtest có gồm mã đã hủy niêm yết | [Binance delisting announcements](https://www.binance.com/en/support/announcement/delisting?c=161&navId=161) | **Không đạt** (đã ghi nhận). Xem I6 |
| 5 | Dò dữ liệu / quá khớp (data snooping, overfitting) | Đếm số lần thử; dùng PBO/CSCV hoặc Deflated Sharpe; holdout đơn thuần là chưa đủ | [Bailey, Borwein, López de Prado, Zhu – PBO](https://papers.ssrn.com/abstract=2326253); [Bailey & López de Prado – Deflated Sharpe Ratio](https://papers.ssrn.com/abstract=2460551); [López de Prado – 10 reasons ML funds fail](https://www.garp.org/hubfs/Whitepapers/a1Z1W0000054x6lUAA.pdf) | **Không đạt.** Xem C2 |
| 6 | Rò rỉ khi kiểm chéo (purge/embargo) | Purged K-fold nếu nhãn chồng thời gian | López de Prado, *Advances in Financial ML* ch.7/12 | Chưa áp dụng (chưa có ML) |
| 7 | Bỏ qua phí, trượt giá | Mọi lần khớp đều trả phí taker/maker và trượt giá | [Binance Futures fee FAQ](https://www.binance.com/en/support/faq/binance-futures-fee-structure-fee-calculations-360033544231) | **Một phần.** Có phí + trượt giá khứ hồi theo nhóm (0,25/0,5/1,0%), nhưng không phụ thuộc cỡ lệnh. Xem I7 |
| 8 | Bỏ qua funding hoặc mặc định cứng 8h | Đọc chu kỳ funding từng mã | [Binance fundingInfo](https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Get-Funding-Rate-Info); [thông báo 8h→4h](https://www.binance.com/en/support/announcement/important-updates-on-funding-rates-of-usd%E2%93%A2-m-perpetual-contracts-98d6b24d3e5c4f84a8ed04087997d8d0) | **Đạt.** Đọc `fundingInfo`; Long trả khi funding dương. Dấu đúng ở `plan.ts:325–327`, test `analyze.test` M1 |
| 9 | Lỗi múi giờ / ranh giới nến | Dùng UTC, mili giây, khóa theo openTime; khung lớn chỉ dùng nến đã đóng | Binance WS (UTC) | **Đạt.** Mọi thời gian theo UTC ms; `closeTime < t` |
| 10 | Nhầm đơn vị (%, phần, bps) | Một quy ước, tên biến có đơn vị | [Leverage Brackets – maintMarginRatio là phần](https://developers.binance.com/docs/derivatives/usds-margined-futures/account/rest-api/Notional-and-Leverage-Brackets) | **Đạt.** Đã kiểm `costPct` (%)/100, `fundingExtremePer8h` (phần), `stopDistPct`×100 so với 20 (%), `maxSpreadPct` (%), callback (%) |
| 11 | Sai dấu Long/Short | PnL = cỡ × hướng × (ra − vào). Test cả hai chiều | [Binance PnL FAQ](https://www.binance.com/en/support/faq/how-to-calculate-profit-and-loss-for-futures-contracts-3a55a23768cb416fb404f06ffedde4b2) | **Đạt.** Xem bảng tính tay ở Phần 2 |
| 12 | Làm tròn tick/step sai phía; MIN_NOTIONAL | Giá theo tickSize, khối lượng làm tròn xuống theo stepSize (MARKET_LOT_SIZE cho market), giá × khối lượng ≥ MIN_NOTIONAL | [Binance symbol filters](https://developers.binance.com/docs/derivatives/usds-margined-futures/common-definition) | **Làm tròn: đạt. Bộ lọc: không đạt.** Xem I2 |
| 13 | NaN/Infinity lan truyền | Giá trị khởi động NaN không được sinh tín hiệu | [pandas missing data](https://pandas.pydata.org/docs/user_guide/missing_data.html) | **Phần lớn đạt.** `parse.ts` ném lỗi khi gặp số không hợp lệ; `buildPlan` ném lỗi khi ATR NaN; điểm coi NaN = 0 (thận trọng) |
| 14 | Dữ liệu cũ (stale data) | Kiểm thời điểm nến/giá cuối trước mỗi quyết định | Thực hành ngành (chưa có nguồn Binance chính thức) | **Không đạt.** Xem I3 |
| 15 | Lệnh trùng (idempotency) | `newClientOrderId` tất định; hết giờ chờ thì tra lại chứ không gửi lại | [Binance New Order](https://developers.binance.com/docs/derivatives/usds-margined-futures/trade/rest-api) | Bot chưa có code. Thiết kế có nêu. Còn thiếu định danh cho tín hiệu vùng, xem I5 |
| 16 | Thiếu stop đặt trên sàn | STOP_MARKET `closePosition` trên sàn và xác nhận lệnh đang sống | như trên + Algo Order | Thiết kế đúng hướng (R2, D7). Chưa có code |
| 17 | Tính sai đòn bẩy/thanh lý | Dùng giá mark và bậc ký quỹ theo notional | [Binance liquidation FAQ](https://www.binance.com/en/support/faq/how-to-calculate-liquidation-price-of-usd%E2%93%A2-m-futures-contracts-b3c689c1f50a44cabb3a84e663b81d93); [Leverage brackets](https://developers.binance.com/docs/derivatives/usds-margined-futures/account/rest-api/Notional-and-Leverage-Brackets) | **Một phần.** MMR cố định 1%, bỏ qua bậc ký quỹ. Xem C3, M1 |
| 18 | Cỡ vị thế, nguy cơ cháy tài khoản (risk of ruin) | Fixed fractional; không dùng full Kelly trên lợi thế ước từ backtest | [Thorp – Kelly](https://www.gwern.net/doc/statistics/decision/2006-thorp.pdf); [Maier-Paape – optimal f](https://www.instmath.rwth-aachen.de/Preprints/maierpaape20131008.pdf) | **Không đạt ở tầng danh mục.** Xem C1, C3 |
| 19 | Tương quan, tập trung | Mười lệnh Long altcoin gần bằng một lệnh Long BTC lớn; cần trần cùng chiều/tổng rủi ro | [Liu, Tsyvinski, Wu – Common Risk Factors in Cryptocurrency (J. Finance 2022)](https://papers.ssrn.com/abstract=3379131); [Kaiko](https://research.kaiko.com/insights/gap-grows-between-bitcoin-and-altcoins) | **Không đạt.** Xem C1 |
| 20 | Lệch cấu hình giữa tài liệu và code | Một nguồn sự thật; ghi phiên bản cấu hình; không tái dụng cờ cũ | [SEC Order – Knight Capital (34-70694)](https://www.sec.gov/litigation/admin/2013/34-70694.pdf); [tóm tắt](https://www.jrvarma.in/blog/Y2013/Knight-Capital.html) | **Không đạt.** Xem I1 |
| 21 | Nhánh chưa test, nuốt lỗi | Không có catch rỗng; test nhánh lỗi | [Yuan et al., OSDI 2014](https://usenix.org/conference/osdi14/technical-sessions/presentation/yuan) | **Catch: đạt** (không có catch rỗng, mọi catch đều ghi lỗi). **Fail-open: không đạt**, xem I4, M7 |
| 22 | Lộ secret trong git | gitleaks, bật secret scanning; key không có quyền rút, có whitelist IP | [GitHub secret scanning](https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning); [gitleaks](https://github.com/gitleaks/gitleaks); [vụ lộ key 3Commas 2022](https://www.bleepingcomputer.com/news/security/crypto-platform-3commas-admits-hackers-stole-api-keys) | **Đạt.** Xem M6 |

Ghi chú về nguồn: không trích được nội dung PDF lệnh SEC về Knight Capital. Chi tiết vụ việc lấy từ bản tóm tắt jrvarma.
Không có nguồn chính thức xác nhận Binance có chu kỳ funding 1h. Đã xác nhận có 2h, 4h và 8h.

---

## Phần 2 — Kiểm tiền bằng tính tay (gọi thẳng hàm của `packages/core`)

Giả định: vốn 10.000 USDT, rủi ro 2%, phí + trượt giá khứ hồi 0,25%, stepSize 0,001, MMR 1%, trần đòn bẩy Swing 5×.

| Ca | Tính tay | Code trả về | Kết luận |
|---|---|---|---|
| Long vào 100, SL 98 | Khối lượng = 200 ÷ (2 + 0,25) = 88,888 | `qty 88.888, notional 8888.8` | Đúng |
| Long: đòn bẩy an toàn | 1 ÷ (2 × 0,02 + 0,01) = 20 → kẹp 5× | `safe 20, lev 5` | Đúng |
| Long: thanh lý ở 5× | Công thức Binance bậc 1: 100 × 0,8 ÷ 0,99 = 80,81 | code 81,00 (gần giá vào hơn, tức thận trọng) | Chấp nhận được |
| Short vào 100, SL 102: thanh lý ở 5× | Binance: 100 × 1,2 ÷ 1,01 = 118,81 | code 119,00 (**xa giá vào hơn, tức lạc quan**) | Lệch nhỏ, xem M1 |
| TP1 sau phí, Long 100→104, SL 98 | (4 − 0,25) ÷ 2 = 1,875R | `1.875` (Short đối xứng cũng ra `1.875`) | Đúng |
| Trần giá khớp (`capFill`) | Long: f ≤ (TP1 + m·SL)/(1 + m + k). Short: f ≥ (TP1 + m·SL)/(1 + m − k) | đúng như `pattern-plan.ts` | Đúng (đã suy lại đại số) |
| Trailing không lỗ (`exit.ts`, bản sửa dở) | Long: cb ≤ (TP1 − hòa vốn)/TP1. Short: cb ≤ (hòa vốn − TP1)/TP1 | khớp | Đúng |
| Làm tròn | SL Long xuống, SL Short lên; TP về phía giá vào; khối lượng làm tròn xuống | `98.0049→98`, `101.9951→102` | Phía an toàn |
| **SL chặt 0,5%** | Khối lượng = 200 ÷ 0,75% = 26.667 USDT notional = 2,67 × vốn; ký quỹ ở 5× = 5.333 (53% vốn) | `notional 26666.6`, ký quỹ 5333 | **Hai lệnh là hết vốn**. Xem C3 |
| Vốn 100.000, SL 1% | notional 160.000; ký quỹ ở 5× = 32.000 | đúng như vậy | Khối lượng lớn, chạm bậc ký quỹ cao hơn. Xem I7 |
| Chia 50/30/20, qty 0,003 | 0,001 / 0,000 / 0,002 | `[0.001, 0, 0.002]` | Phần dư dồn vào TP xa nhất; kế hoạch bị đánh dấu không hợp lệ. Bắt được |

---

## Phần 3 — Phát hiện

Tóm tắt: **3 nghiêm trọng (Critical) · 8 quan trọng (Important) · 9 nhỏ (Minor).**

### Nghiêm trọng (Critical) — phải xử lý trước khi chạy bot với tiền thật

#### C1. Rủi ro danh mục 20% trên cùng một nhân tố thị trường, và các cầu chì không chặn được mức lỗ đó

- **Ở đâu:** `docs/specs/2026-10-19-bot-design.md:35` (D11: 2%/lệnh, tối đa 10 lệnh, "tổng rủi ro mở có thể tới 20%") và `:62` (cầu chì: 5 lệnh thua/24h, lỗ ngày > 10%, sụt 30% chỉ cảnh báo). Trần cũ P-05 (`coin-radar-design.md:204`: tổng rủi ro mở ≤ 3%, ≤ 3 lệnh cùng chiều khi tương quan với BTC > 0,7) đã bị bỏ. Code không có trần theo chiều, theo tương quan hay theo tổng rủi ro. `rules.ts` ghi P-05 là `not_evaluated`. Bản sửa dở chỉ thêm `COMMON.portfolio.maxOpenTrades = 10`.
- **Hậu quả về tiền:** cả hai cầu chì chỉ chặn lệnh **mới**. Mười lệnh Long altcoin đang mở thực chất là một lệnh đặt cược vào cùng một nhân tố thị trường (Liu–Tsyvinski–Wu 2022). Một giờ BTC giảm mạnh có thể chạm cả 10 SL cùng lúc: −20% vốn, cộng trượt giá khi STOP_MARKET khớp giữa đợt thanh lý dây chuyền, thực tế có thể −22% đến −25%. Mức này gấp đôi trần "lỗ ngày 10%" người dùng đặt ra, và xảy ra trước khi cầu chì kịp làm gì. Hai ngày như vậy đưa tài khoản về khoảng −40%, trong khi sụt 30% chỉ gửi cảnh báo.
- **Sửa:**
  - Thêm **trần rủi ro mở** bằng hoặc thấp hơn trần lỗ ngày, ví dụ tổng rủi ro mở ≤ 10% (tức tối đa 5 lệnh ở mức 2%).
  - Thêm **trần cùng chiều**, ví dụ ≤ 3–4 lệnh Long altcoin khi tương quan với BTC > 0,7, như P-05 cũ.
  - Tính "lỗ ngày" gồm cả lỗ chưa thực hiện cộng rủi ro đang mở, chứ không chỉ lệnh đã đóng.
  - Mức sụt 30% nên **dừng** bot, không chỉ cảnh báo.
  - Đây là quyết định của người dùng, cần trình người dùng duyệt lại kèm con số −20% ở trên.

#### C2. Chưa có bằng chứng hệ thống có lợi thế; quy trình kiểm chứng hiện tại không đủ để phát hiện quá khớp

- **Ở đâu:**
  - Số tín hiệu thực tế: trong 8 lần quét Swing/Lướt nhanh có chấm hạng (7 file trong `output/` và lần tôi chạy, gồm 2 lần quét đủ 523 hợp đồng), có **0 tín hiệu "Đạt tiêu chí" và 0 tín hiệu Hạng A**.
  - `docs/specs/2026-10-19-bot-design.md:116`: cổng qua bậc paper là "≥ 100 lệnh **hoặc** ≥ 4 tuần".
  - `backtest/data.ts:42` (`planRange`): chỉ có 30 ngày đánh giá cộng 3 tháng ngoài mẫu, trong khi spec chính mục 4 yêu cầu walk-forward 12 tháng huấn luyện / 3 tháng kiểm.
  - `docs/superpowers/plans/2026-10-19-ke-hoach-2-doi-chung-du-lieu-that.md:56` (Task 8): **tự áp dụng** cách thoát tốt nhất trong ma trận 12 biến thể, mà không có PBO hay Deflated Sharpe.
- **Hậu quả về tiền:** với tần suất tín hiệu hiện nay, 4 tuần paper có thể chỉ cho 0–10 lệnh, vậy mà vẫn qua cổng vì điều kiện là "hoặc". Với 10 lệnh, tỉ lệ thắng 60% có khoảng tin cậy 95% khoảng 31–83%. Không phân biệt được hệ thống có lợi thế với tung đồng xu. Khi chọn biến thể tốt nhất trong 12 biến thể, xác suất ít nhất một biến thể "thắng" ở mức 95% chỉ do may là khoảng 46% nếu các biến thể độc lập. Mức thực tế thấp hơn vì phải qua hai giai đoạn, nhưng vẫn đáng kể. Khi đó, rủi ro 2% mỗi lệnh trên vốn lớn sẽ đặt cược vào một lợi thế chưa đo được.
- **Sửa:**
  - Đổi cổng thành "≥ N lệnh **và** cận dưới khoảng tin cậy của kỳ vọng R (sau phí và funding) > 0". Chọn N trước, ví dụ ≥ 100.
  - Kéo dài dữ liệu kiểm (≥ 12–24 tháng, có cả thị trường lên, xuống và đi ngang).
  - Ghi nhật ký số lần thử. Báo cáo PBO/CSCV hoặc Deflated Sharpe trước khi tự áp dụng biến thể.
  - Trong lúc chưa đủ mẫu, chạy tiền thật ở mức rủi ro thấp (0,25–0,5%) rồi mới tăng dần lên 2%.

#### C3. Khối lượng 2% không bị giới hạn bởi vốn hay ký quỹ; quy tắc D11 "vào khối lượng tối đa cho phép" chưa có trong code

- **Ở đâu:** `packages/core/plan.ts:22–29` (`positionSize` chỉ tính theo rủi ro); `plan.ts:323,353` và `patterns/pattern-plan.ts:520,576` (`suggestedLeverage`/`marginNeeded` chỉ để hiển thị, **không có chỗ nào so `marginNeeded` với vốn**); `analyze.ts:189` (G-08 chỉ cần `maxSafeLeverage ≥ 1`).
- **Hậu quả về tiền:** xem bảng Phần 2.
  - SL 0,5% ở mức 2% cho notional 2,67 × vốn và ký quỹ 53% vốn. Hai lệnh là hết vốn.
  - Lệnh BTC với SL 2% cần ký quỹ 16% vốn. Mười lệnh cần 160% vốn.
  - Ở chế độ isolated, sàn sẽ từ chối lệnh (`-2019 MARGIN_NOT_SUFFICIEN`), có thể khi lệnh vào đã khớp một phần mà SL/TP chưa đặt xong.
  - Nếu ai đó chuyển sang cross margin cho "đủ tiền", các vị thế dùng chung ký quỹ và giá thanh lý lùi sát lại SL. Quy tắc P-04 (thanh lý xa SL ≥ 1 khoảng SL) mất hiệu lực.
- **Sửa:** viết một hàm thuần (pure function) trong core, có test, ví dụ `capByMargin(qty, entry, leverageCap, freeMargin, bracketMaxNotional)`, để:
  - giảm khối lượng sao cho notional ≤ ký quỹ còn trống × đòn bẩy trần, và ≤ notional tối đa của bậc ký quỹ;
  - ghi lại số rủi ro thực tế (nhỏ hơn 2%).
  
  Kế hoạch lệnh phải trả về cả `riskPctActual`, và planner của bot chỉ dùng hàm này.

### Quan trọng (Important)

#### I1. Lệch cấu hình: code và tài liệu còn giữ giá trị cũ, trái với quyết định ngày 19/10/2026

Quyết định hiện hành (`bot-design.md` D9–D11, mục protections): rủi ro 2%/lệnh; tối đa 10 lệnh; thoát lệnh = TP1 50% + trailing trên sàn; 5 lệnh thua/24h → dừng; lỗ ngày > 10% → dừng; sụt 30% → cảnh báo.

| Vị trí (HEAD `ed912e6`) | Giá trị cũ | Phải đổi trước bot/backtest? | Bản sửa dở |
|---|---|---|---|
| `packages/core/config.ts:30,38` `defaultRiskPct` 0,25 / 0,5 | rủi ro cũ | **Có** | đã xóa, thay bằng `COMMON.risk.perTradePct = 2` |
| `config.ts:55` `highRiskTierPct: 0.25` và `analyze.ts:143–145` (hạ xuống 0,25% cho Lướt nhanh và coin Cao/Rất cao) | trần 0,25% | **Có** | đã bỏ |
| `scanner/run-scan.ts:104` `riskPct: cfg.defaultRiskPct`; `scanner/scan.ts:60` in "0,5%/0,25%" | rủi ro cũ | **Có** (đây là đường backtest sẽ gọi) | đang sửa; lúc kiểm thì typecheck đang lỗi |
| `config.ts:83` `exitPcts: [50, 30, 20]`; `plan.ts:63–64,306,319,339` (`afterTp1Stop: entry`, "chia 50/30/20"); `pattern-plan.ts:332`; `scanner/plan-print.ts:40,46` ("Đạt TP1 → dời SL về giá khớp", "chia 50/30/20") | thoát A0 cũ | **Có** cho bot và cho mô phỏng chính (C2) | đã thêm `exit.ts` (C2 mặc định), nhưng `exitPcts`/`afterTp1Stop` vẫn còn và vẫn được in |
| `docs/specs/2026-10-19-coin-radar-design.md:41,44,222,224` (50/30/20, dời SL về giá vào/giá khớp), `:55,200` (0,25% / 0,5%), `:204` (P-05: 3%, 5 lệnh, 3 cùng chiều) | cũ | **Có** (spec chính phải khớp) | file đang được agent khác sửa |
| `docs/specs/2026-10-19-bot-design.md:60,77,90` ("TP1/2/3 reduce-only", Telegram "TP1/2/3") | trái với D9 của chính file này | **Có** | chưa sửa |
| Kế hoạch 2, Task 3 ("TP1/TP2/TP3 50/30/20") và Task 4 (P1 "dừng sau 3 SL/24h + sụt 10%") | cũ | **Có**: bộ mô phỏng phải dùng 2%, 10 lệnh, C2, cầu chì 5 lệnh/10% | Task 8 đã ghi 2% và 10 lệnh |
| `packages/core/rules.ts` P-01/P-05/P-06 | cũ | Có (danh mục nguyên tắc) | đã sửa |
| `docs/verification/ke-hoach-1b-*.md` (0,25%, 50/30/20) | lịch sử | Không (là biên nhận lịch sử; nên ghi chú "đã thay") | — |

- **Hậu quả về tiền:** nếu backtest chạy qua `runScan` với `defaultRiskPct` 0,5% trong khi bot dùng 2%, mọi con số sụt giảm, chuỗi thua và cầu chì đo được sẽ sai 4 lần. Đây đúng là loại lỗi "cờ cũ, nghĩa mới" trong vụ Knight Capital.
- **Sửa:** chỉ để **một** hằng số cho mỗi quyết định trong `config.ts`. Viết test khẳng định giá trị (2, 10, C2, 5, 10%, 30%). Thêm test khẳng định spec và config không mâu thuẫn, ví dụ bằng cách đọc bảng D9–D11. In mã băm (hash) cấu hình ở đầu mỗi lần quét, backtest hoặc chạy bot.

#### I2. Thiếu bộ lọc của sàn: MIN_NOTIONAL, MARKET_LOT_SIZE, minQty/maxQty

- **Ở đâu:** `packages/binance/parse.ts:52–70` chỉ đọc `PRICE_FILTER.tickSize` và `LOT_SIZE.stepSize`. Kiểu `Contract` (`types.ts`) không có các trường khác. Tài liệu tra cứu của chính repo (`docs/reference/binance-usdm-api.md:253,381`) ghi MIN_NOTIONAL thực tế của BTCUSDT là **50 USDT**.
- **Hậu quả về tiền:**
  - Với vốn nhỏ hoặc SL rộng, lệnh TP1 50% có thể dưới MIN_NOTIONAL. Thực ra lệnh reduce-only được miễn, nhưng lệnh vào lệnh thì không. Kết quả là lệnh bị từ chối hoặc chỉ vào được một phần.
  - Với vốn lớn, khối lượng market có thể vượt `MARKET_LOT_SIZE.maxQty` (−4005), gây vào thiếu khối lượng hoặc lỗi giữa chừng.
  - Kế hoạch in ra hiện vẫn được đánh dấu "hợp lệ" trong các trường hợp này.
- **Sửa:** mở rộng `Contract` (minQty, maxQty, marketMaxQty, minNotional) với `parse` fail-closed (thiếu thì ném lỗi). `buildPlan`/`buildPatternPlan` phải đánh dấu kế hoạch không hợp lệ khi vi phạm. Có test.

#### I3. Không phát hiện dữ liệu cũ; lệnh "vào trực tiếp" dùng giá đóng nến 4H có thể đã cũ tới 4 giờ

- **Ở đâu:**
  - `parse.ts:21–35` chỉ lọc nến chưa đóng, không kiểm nến cuối có đủ mới không (`now − closeTime` ≤ 1 khung) hay chuỗi có thủng nến không (`findGaps` chỉ có ở `backtest/data.ts`).
  - `plan.ts` đặt `marketPrice = close nến 4H cuối`, trong khi `premium.markPrice` đã tải nhưng không dùng.
  - Spec chính mục 2 có quy tắc "Nguồn lỗi → dữ liệu cũ, không tạo tín hiệu", nhưng chưa có trong code.
- **Hậu quả về tiền:** chạy máy quét giữa nến (ví dụ 02:00 UTC với nến 4H đóng lúc 00:00), kế hoạch sẽ "vào trực tiếp" theo giá của 2 giờ trước. Khối lượng tính theo khoảng SL cũ. Nếu giá đã chạy về phía SL, rủi ro thật nhỏ hơn dự tính. Nếu giá đã chạy ra xa SL, rủi ro thật lớn hơn 2% và TP1 có thể đã < 1R. Một hợp đồng bị dừng giao dịch, hoặc kline trả dữ liệu cũ, vẫn được chấm như bình thường.
- **Sửa:**
  - Trong `runScan`, mỗi mã phải có `entry.at(-1).closeTime ≥ now − 1 khung`; nếu không thì ghi lỗi "dữ liệu cũ" và không chấm.
  - Thêm kiểm khoảng trống (gap) dùng chung với `findGaps`.
  - Kế hoạch market phải kiểm `markPrice` hiện tại có còn nằm trong `[giá hiện tại; giá tối đa]` không, và tính lại khối lượng theo giá đó. Bot phải làm việc này ngay trước khi gửi lệnh.

#### I4. Các cổng "mở khi thiếu dữ liệu" (fail-open)

- **Ở đâu và hậu quả:**
  - `gates.ts:86`: **G-06 luôn qua**. Không chặn mã đã có thông báo hủy niêm yết. Bot có thể mở vị thế trên một hợp đồng sắp bị đóng: sàn hạ đòn bẩy, thanh khoản cạn, và vị thế bị tất toán ở giá thanh toán.
  - `analyze.ts:189`: G-08 qua khi `maxSafeLeverage ≥ 1`, tức khoảng SL ≤ 49,5%. Vì G-11 đã giới hạn SL ≤ 20%, G-08 **không bao giờ trượt** và không kiểm gì với đòn bẩy thật sẽ dùng.
  - `data/events/events.json`: chỉ có 4 sự kiện (28/10 → 10/12/2026), chưa có BOJ, và không có cảnh báo khi danh sách hết hạn. Sau 10/12/2026, G-07 và Hạng A tiêu chí 5 sẽ âm thầm coi như "không có sự kiện". Trong backtest quá khứ, danh sách cũng rỗng.
  - `flow.ts`: `volumeZ` trả 0 khi thiếu dữ liệu, nên G-04 qua.
- **Sửa:**
  - G-06: đọc `deliveryDate` trong `exchangeInfo`. Với hợp đồng vĩnh cửu, trường này thường là năm 2100 và đổi sang ngày thật khi có lịch hủy. **Cần đối chiếu tài liệu Binance trước khi dựa vào.** Nếu không làm được thì trượt có ghi chú, hoặc lấy từ trang thông báo hủy niêm yết.
  - G-08: kiểm theo đòn bẩy thật và bậc ký quỹ.
  - `events.json`: thêm trường `validUntil`; quá hạn thì G-07 trượt.
  - `volumeZ`: thiếu dữ liệu thì trả `NaN` và cổng trượt.

#### I5. Tín hiệu vùng không có định danh hay độ mới, và chưa có hysteresis → nguy cơ vào lại cùng một tín hiệu, đặt lệnh trùng

- **Ở đâu:**
  - `TradePlan` (`plan.ts`) không có id, không có `fresh`/`signalTime`. Chỉ tín hiệu mô hình mới có `patternId`, `fresh`.
  - Spec chính `:191` yêu cầu hysteresis (vào ≥ 70, rời < 60) và "một tín hiệu mở mỗi hợp đồng × chế độ". Code chưa làm.
  - Bot D3 lại "chỉ giao dịch tín hiệu MỚI".
- **Hậu quả về tiền:** với lệnh vùng, mỗi lần quét đều phát lại cùng kế hoạch chừng nào nến 4H chưa đổi. Sau khi dính SL, lần quét sau có thể vào lại đúng tín hiệu đó. Cooldown 2 nến giảm bớt nhưng không loại hẳn. Điểm dao động quanh 70 làm tín hiệu bật/tắt liên tục.
- **Sửa:** thêm `signalId = mã|chế độ|chiều|openTime nến vào lệnh|vùng SL` và `fresh` cho tín hiệu vùng. Cài hysteresis. Bot khử trùng theo `signalId` lưu trong nhật ký. Viết test "cùng dữ liệu quét hai lần → một lệnh".

#### I6. Backtest: thiên lệch sống sót cộng nhìn trước tương lai qua xếp hạng thanh khoản hiện tại

- **Ở đâu:**
  - `backtest/fetch.ts:48` chọn và xếp hạng mã theo **khối lượng 24h hôm nay**.
  - `scanner/run-scan.ts:48` dùng xếp hạng này cho nhóm chi phí (`costTier`), phạm vi mô hình P-G1, G-03 (loại 30% thanh khoản thấp) và top 10%.
  - Spread và funding/`nextFundingTime` cũng là giá trị hiện tại. Phần sống sót đã được ghi nhận, phần xếp hạng thì chưa.
- **Hậu quả về tiền:** coin hôm nay thanh khoản cao thường là coin vừa tăng mạnh. Đưa chúng vào nhóm phí thấp và vào phạm vi mô hình trong quá khứ sẽ thổi phồng kết quả. Mã đã hủy niêm yết, thường là mã lỗ nặng, bị loại khỏi mẫu.
- **Sửa:** xếp hạng thanh khoản tại mốc t phải tính từ `quoteVolume` của nến 1H/1D trong 24 giờ trước t. Spread dùng giá trị thay thế thận trọng, ghi rõ. Funding lấy từ lịch sử `fundingRate` tại t. Báo cáo kết quả kèm nhãn sống sót, như spec mục 4 đã yêu cầu.

#### I7. Chi phí không phụ thuộc cỡ lệnh; bậc ký quỹ bị bỏ qua — nguy hiểm khi "đánh vốn lớn"

- **Ở đâu:** `config.ts:222` (`costRoundTripPct` cố định theo nhóm thanh khoản), `config.ts:223` (`maintenanceMarginRate: 0.01` cố định).
- **Hậu quả về tiền:**
  - Ví dụ vốn 100.000 USDT, SL 1% → notional 160.000 USDT trên một altcoin nhóm "high" mà vẫn chỉ tính 0,25% khứ hồi.
  - Trượt giá thật của lệnh market và lệnh STOP_MARKET khi thị trường rơi nhanh có thể gấp nhiều lần mức đó. Mỗi 0,5% trượt thêm trên SL 1% làm mỗi lệnh thua mất thêm 0,5R, tức −1% vốn thay vì −2% thêm vào.
  - Notional lớn rơi vào bậc ký quỹ cao hơn (MMR 2,5–5%, đòn bẩy tối đa thấp hơn).
- **Sửa:**
  - Giới hạn notional mỗi lệnh theo một tỉ lệ nhỏ của khối lượng 24h hoặc của độ sâu sổ lệnh trong ±0,5%.
  - Thêm trượt giá tăng theo cỡ lệnh vào mô phỏng.
  - Bot đọc `leverageBracket` (có key) để tính MMR và notional tối đa đúng.

#### I8. Tài liệu bot nói quá mức về độ an toàn của phần trailing

- **Ở đâu:** `bot-design.md:34` (D10: "phần 50% còn lại **không thể lỗ**").
- **Lý do:**
  1. Trailing kích hoạt là một **lệnh market** theo MARK_PRICE. Khi trượt giá hoặc nhảy giá (gap), lệnh có thể khớp dưới mức hòa vốn.
  2. `exit.ts` (bản sửa dở) phải kẹp callback lên mức tối thiểu 0,1% khi khoảng không lỗ nhỏ hơn mức đó. Code có cờ `needsBreakevenFloor` cho trường hợp này, nghĩa là vẫn có thể lỗ.
  3. Hòa vốn hiện tính theo `entry` của kế hoạch chứ không theo giá khớp thật.
  4. Nếu trailing chưa kích hoạt hoặc bot vắng mặt, phần còn lại có thể lỗ tới −0,5R. Chính `:81` thừa nhận điều này.
- **Sửa:** viết lại thành "được bảo vệ ở mức xấp xỉ hòa vốn, chưa tính trượt giá". Tính callback theo giá khớp thật lấy từ user-data stream. Test ca kẹp mức tối thiểu.

### Nhỏ (Minor)

| # | Vị trí | Vấn đề | Sửa |
|---|---|---|---|
| M1 | `plan.ts:13–15`; test `plan.test.ts:15–18` | Công thức thanh lý gần đúng bỏ mẫu số (1 ± MMR). Với Short nó **lạc quan** (119 so với 118,81 ở 5×). Test chỉ so công thức với chính nó, nên không thể phát hiện sai lệch | Dùng công thức Binance có `cum`/bậc; test so với ví dụ tính tay theo FAQ Binance |
| M2 | `scanner/rank.ts:16–30`, `run-scan.ts:110–117` | Top 10% xếp hạng trong phạm vi được quét, nên kết quả đổi theo `--limit` hoặc khi quét dừng giữa chừng vì bị chặn (418/429) | Bot và backtest luôn quét đủ phạm vi; nếu quét dở thì không phát tín hiệu |
| M3 | `events.ts:22` | `Date.parse` ra NaN (chuỗi thời gian sai) thì sự kiện bị bỏ qua âm thầm | Kiểm định dạng khi đọc file, sai thì ném lỗi |
| M4 | `backtest/data.ts` (`fetchFunding`) | `markPrice` không hợp lệ được thay bằng 0 mà không báo; `backtest/fetch.ts` gọi `fetch` không có timeout (có thể treo) | Ném lỗi hoặc ghi cảnh báo; thêm `AbortSignal.timeout` như `scan.ts` |
| M5 | `plan.ts:339` (A0) | "Dời SL về đúng giá khớp" vẫn lỗ phí khứ hồi ở phần còn lại, nên không thật sự là hòa vốn | Nếu còn dùng A0: SL = giá khớp ± phí |
| M6 | Lịch sử git | **Không tìm thấy secret** (đã grep `git log -p` theo api key/secret/token/password/JWT/AKIA/ghp_/sk-/postgres://, supabase.co). Email duy nhất là của tác giả commit (`tienhoan.dhd@…`) và `noreply@anthropic.com`. Có lộ nhẹ: đường dẫn `/home/admin1`, tên repo/tài khoản, và việc dùng chung dự án Supabase với game trong spec public. Workflow dùng `actions/*@v4` chưa ghim theo SHA | Trước khi thêm `.env` có key: bật GitHub secret scanning + push protection, thêm gitleaks pre-commit; ghim action theo SHA |
| M7 | Test | Test G-06 khẳng định cổng **luôn qua** (`gates.test.ts:26–30`), tức đóng băng hành vi fail-open. Chưa có test cho: ký quỹ so với vốn, MIN_NOTIONAL, dữ liệu cũ, nến trùng/sai thứ tự ở `parseKlines` của máy quét, chạy lại cùng tín hiệu hai lần. Chưa có test tiền tố end-to-end cho `analyze`/`runScan` | Thêm các test này trước bot (đi kèm C3, I2–I5) |
| M8 | `packages/core/rules.ts` | Nhãn `evidence: 'evidence'` gắn cho cả ngưỡng cụ thể chưa backtest (G-04 15%/z 5; G-09 0,1%/8h tuyệt đối thay cho z-score như spec) | Tách "khái niệm có căn cứ" khỏi "ngưỡng chưa kiểm" |
| M9 | `bot-design.md:25` (D1) | Dùng "480+ test" làm lý lẽ. Số lượng test chứng minh code chạy đúng như viết, không chứng minh chiến lược có lời | Ghi rõ sự khác nhau này |

### Những phần đã kiểm và thấy đúng (để người dùng biết chỗ nào đáng tin)

- Dấu Long/Short, công thức R sau phí (`tp1NetRAt`), trần giá khớp `capFill`, chiều làm tròn tick/step, đơn vị %/phần, dấu và chu kỳ funding.
- Ranh giới nến đã đóng dùng chung một hàm. Mô hình biểu đồ có test chống look-ahead trên tiền tố, cả dữ liệu thật.
- `parse.ts` từ chối số NaN/rỗng. Không có `catch` rỗng; lỗi từng mã được ghi lại. Bị chặn 418/429 thì dừng hẳn.
- Không có secret trong lịch sử git; `.env`, `output/`, `data/cache/` đã được git-ignore.

## Thứ tự sửa đề xuất

1. **C1, C3** (trần danh mục và ký quỹ): trình người dùng duyệt lại D11 kèm con số −20% trong một giờ.
2. **I1**: đồng bộ cấu hình trước khi viết bộ mô phỏng của kế hoạch 2, nếu không mọi con số backtest sẽ sai thang.
3. **C2, I6**: sửa thiết kế kiểm chứng (cổng "và", dữ liệu dài hơn, PBO/DSR, xếp hạng tại thời điểm t) trước khi chạy Task 7–8.
4. **I2–I5, I7, I8**: làm trong Task B3/B5 của kế hoạch bot, có test.
5. Phần Minor: làm dần.
