# Carry / Funding-rate / Basis trên perpetual futures crypto — cách quỹ lớn vận hành và tín hiệu funding cho lệnh có hướng

> Ghi chú nghiên cứu (cập nhật 2026-10-20). Thuật ngữ: **perpetual (perp)** = hợp đồng tương lai vĩnh cửu, không đáo hạn; **funding rate** = phí trao đổi định kỳ (thường 8 giờ/lần) giữa bên long và short để kéo giá perp về giá spot; **basis** = chênh lệch giá futures so với spot; **cash-and-carry** = mua spot + bán (short) futures/perp cùng lượng để ăn chênh lệch, không chịu rủi ro hướng giá (**delta-neutral**); **OI (open interest)** = tổng vị thế đang mở; **ADL (auto-deleveraging)** = sàn tự đóng bớt vị thế lời của người khác khi quỹ bảo hiểm không đủ.
> Quy ước: mọi con số ghi rõ **gộp (trước phí)** hay **ròng (sau phí)** khi nguồn cho biết; không rõ thì ghi "không nêu".

## Câu 1 — Cash-and-carry & funding arbitrage: lợi suất lịch sử 2020–2026, nén lợi suất sau ETF/Ethena, rủi ro

### Takeaway
Funding-carry trên BTC/ETH từng cho lợi suất ~8–14%/năm với Sharpe rất cao (2020–2023), nhưng đã nén mạnh từ 2024 và **Sharpe chuyển âm trong 2025** theo nghiên cứu học thuật mới nhất; basis CME từ ~20–25% (2024) xuống ~5–10% (2025). Rủi ro chính không nằm ở giá mà ở sàn, margin/thanh lý chân short, ADL, và các giai đoạn funding âm (~16–18% số ngày).

### Cited Findings
**Cơ chế**
- Funding thường trả mỗi 8 giờ, xấp xỉ bằng chênh lệch trung bình perp–spot trong 8 giờ trước; long trả short khi perp cao hơn spot. Perp **không bảo đảm hội tụ về spot** tại bất kỳ thời điểm nào → arbitrage là "random-maturity" (đáo hạn ngẫu nhiên), không phải phi rủi ro — [He, Manela, Ross, von Wachter, "Fundamentals of Perpetual Futures", arXiv 2212.06888](https://arxiv.org/html/2212.06888v5)
- Công thức perp có thành phần lãi suất cài sẵn nên funding "neo" quanh **0,01%/8h** (≈10,95%/năm gộp); funding dương **>92% thời gian trong Q3 2025**; vốn arbitrage (kể cả Ethena) short ngay khi premium bật cao, tạo "trần" cho funding — [BitMEX Q3 2025 Derivatives Report](https://www.bitmex.com/blog/2025q3-derivatives-report)
- 0,01%/8h × 1.095 lần/năm = 10,95%/năm **gộp** — [Sharpe.ai guide](https://www.sharpe.ai/learn/funding-rate-arbitrage)

**Lợi suất lịch sử — học thuật**
- He et al., dữ liệu giờ Binance 01/2020–03/2024. Chiến lược arbitrage mở khi độ lệch vượt ngưỡng phí, đóng khi về 0. Lợi suất năm / Sharpe **ròng sau phí maker** (bậc phí "High": spot 0,0675%, futures 0,0144%): BTC **6,38% / SR 1,80**; ETH **9,59% / 2,55**; BNB 18,41% / 4,84; DOGE 23,31% / 3,58; ADA 12,03% / 2,68. Không phí: BTC 13,70% / 3,53; ETH 21,23% / 4,83. BTC bậc phí cao: vol 3,55%, max drawdown **−4,43%**, chỉ hoạt động 20% thời gian. Phân rã lợi nhuận BTC: hội tụ giá 8,64% + funding 5,06% — [arXiv 2212.06888v5](https://arxiv.org/html/2212.06888v5)
- Độ lệch tuyệt đối trung bình perp so với giá không-arbitrage: ~57–88%/năm (BTC 0,57, ETH 0,63, BNB 0,88); độ lệch **co lại ~11%/năm** (>44% trên toàn mẫu) khi thị trường trưởng thành — [arXiv 2212.06888v5](https://arxiv.org/html/2212.06888v5)
- Chi phí gián tiếp (spread + price impact) ước < 0,35 bps — nhỏ so với phí trực tiếp — [arXiv 2212.06888v5](https://arxiv.org/html/2212.06888v5)
- Borri, Liu, Tsyvinski, Wu (2025): carry kiểu Schmeling–Schrimpf–Todorov (long spot BTC + short perp Binance, 01/08/2020–31/05/2025): **Sharpe 6,45 toàn mẫu → 4,06 từ 2024 → âm trong 2025**. Lợi nhuận chủ yếu từ funding, trung bình ~8%/năm, vol 0,8% (không nêu đã trừ phí hay chưa) — [arXiv 2510.14435, "Cryptocurrency as an Investable Asset Class: Coming of Age", Stylized fact 6](https://arxiv.org/pdf/2510.14435)
- BIS WP 1087 "Crypto carry" (Schmeling, Schrimpf, Todorov; 04/2023, sửa 10/2025): carry BTC/ETH **trung bình >10%/năm**, có lúc **tới 60%/năm**; chênh lệch lãi suất giải thích rất ít — [BIS](https://www.bis.org/publ/work1087.htm)
- Ethena docs (3 năm tới 12/2024, trọng số OI/volume): funding năm hoá trung bình **BTC 7,80%, ETH 9,15%** (gồm cả gấu 2022) — [Ethena docs – Funding Risk](https://docs.ethena.fi/solution-overview/risks/funding-risk)

**Nén lợi suất sau ETF / Ethena (2024–2026)**
- Basis CME (long ETF spot + short CME): đỉnh ~20–25% năm 2024, ~10% giữa 2025 — [BIT knowledge hub (nguồn vendor)](https://www.bit.com/knowledge-hub/basis-trade); nguồn khác: trung bình 9,27% từ đầu 2024, nén về ~5% (phần lớn tháng 12/2025 dưới mức này); dòng rút ETF kỷ lục 4,57 tỷ USD T11–T12/2025 được cho một phần là do gỡ basis trade — [Santiment/brainsum (thứ cấp)](https://san-1510.aid.brainsum.com/news/analysis/bitcoins-institutional-bid-quietly-weakening)
- OI CME giảm từ ~175.000 BTC đầu 2025 xuống ~123.000 BTC (mức thấp 14 tháng, 04/2026) — [AlphaMaven](https://alpha-maven.com/story/crypto/cme-bitcoin-futures-open-interest-hits-14-month-low-intellectia-ai)
- Funding perp BTC trung bình: **11% (2024) → 4,9% (2025) → 2,2% (2026 tới 11/8)** — chỉ thấy qua tóm tắt của trang thứ cấp, **chưa xác minh được nguồn gốc** — [MEXC news (thứ cấp)](https://www.mexc.com/news/72). Ảnh chụp tức thời DeFi Rate cho thấy funding BTC dao động mạnh: +2,1% (25/9/2026, trung bình 6 sàn) đến +10,3% OI-weighted (15/10/2026) — [DeFi Rate snapshot](https://defirate.com/perp/bitcoin/snapshot/2026-10-15T1508/)
- Ethena: USDe vốn hoá ~14 tỷ USD (09/2025); Borri et al. cảnh báo lợi suất của các sản phẩm "synthetic dollar" sẽ giảm khi funding premia nén — [arXiv 2510.14435](https://arxiv.org/pdf/2510.14435). Ethena được cho là chuyển sang perp cổ phiếu (equity perps) vì funding ở đó ~14% (Hyperliquid) / 17,5% (Binance) — [MEXC news (thứ cấp, chưa xác minh)](https://www.mexc.com/news/72)
- BitMEX: sự kiện funding cực đoan giảm ~90% từ 2016 nhờ vốn arbitrage tổ chức (con số trích lại, **chưa thấy báo cáo gốc**) — [spark.money glossary](https://www.spark.money/glossary/funding-rate)

**Rủi ro**
- **Funding âm**: 15,9% số ngày (BTC), 17,5% (ETH) có funding năm hoá âm; chuỗi âm dài nhất 13 ngày; chuỗi dương dài nhất 176 ngày (cuối 2023–đầu 2024); stETH ~3%/năm làm đệm — [Ethena docs](https://docs.ethena.fi/solution-overview/risks/funding-risk)
- Funding ≤ −50%/năm kéo dài xảy ra ~2,5% thời gian; LlamaRisk đánh giá quỹ dự phòng Ethena chưa đủ, có rủi ro cạn kiệt mức trung bình — [Aave governance – LlamaRisk](https://governance.aave.com/t/arfc-onboard-susde-to-aave-v3-on-ethereum/17191/11)
- **Margin/thanh lý**: arbitrageur phải "sống sót lâu hơn thời gian thị trường phi lý"; margin có thể buộc đóng vị thế trước khi hội tụ — [arXiv 2212.06888v5](https://arxiv.org/html/2212.06888v5); carry rủi ro vì margin tăng vọt và vị thế bị thanh lý trong drawdown — [BIS WP 1087](https://www.bis.org/publ/work1087.htm)
- **Rủi ro sàn**: vụ sập FTX làm funding giữa các sàn phân kỳ mạnh — [arXiv 2212.06888v5](https://arxiv.org/html/2212.06888v5)
- **Sự kiện 10/10/2025**: >19 tỷ USD thanh lý (~17 tỷ là long), lớn nhất lịch sử; market maker cho rằng con số thật 30–40 tỷ do sàn giới hạn báo cáo — [investinglive](https://investinglive.com/cryptocurrency/one-year-after-crypto-s-20-billion-liquidation-day-the-lesson-for-bitcoin-traders/), [whale-alert](https://whale-alert.io/stories/b18701fb9e3a7e/Weeks-of-rising-leverage-falling-exchange-supply-preceded-Oct-10-2025-19B-Bitcoin-long-liquidation-early-warning-signs-to-watch)

### Inferences
- Lợi suất "ròng" đáng tin nhất cho BTC trên Binance giai đoạn 2020–2024 là ~6–8%/năm (He et al., sau phí) — thấp hơn nhiều con số 10,95% hay 20–30% hay quảng cáo. Từ 2025 trở đi, bằng chứng học thuật (Sharpe âm) cho thấy carry BTC thụ động trên Binance gần như không còn hơn lãi suất phi rủi ro.
- Nguyên nhân nén: vốn arbitrage tăng (ETF basis desks, Ethena hàng chục tỷ USD) làm "trần" cho funding, trong khi phía cầu long đòn bẩy giảm.
- Rủi ro đuôi (sàn sập, ADL đóng chân short đang lời khi giá sập, funding âm kéo dài) không lộ ra trong Sharpe lịch sử.

### Gaps
- Không đọc được toàn văn BIS WP 1087 (PDF bị chặn tải) → thiếu Sharpe, lợi suất theo năm/sàn của họ.
- Chưa có số liệu năm 2025–2026 từ nguồn gốc (Kaiko, Glassnode, Coinbase Institutional, Binance Research) — tìm không ra trong giới hạn thời gian.
- Không tìm được dữ liệu định lượng về tác động ADL lên vị thế basis ngày 10/10/2025.
- Chỉ số 1Token Funding Arbitrage (8 đội, tổng AUM >2 tỷ USD, Q2/2025) chỉ có số liệu trong hình, không trích được — [1Token](https://blog.1token.tech/strategy-index-iii-2025-q2/)

## Câu 2 — Cross-sectional funding carry (long coin funding thấp/âm, short coin funding cao)

### Takeaway
Bằng chứng công khai yếu và không ủng hộ: nghiên cứu học thuật duy nhất tìm thấy kiểm định trực tiếp long-short theo funding trên perp Binance cho kết quả **Sharpe ròng âm**. Phần lớn "carry" altcoin được ghi nhận nằm ở arbitrage delta-neutral từng coin (lợi suất cao hơn BTC nhưng rủi ro đuôi lớn hơn), không phải ở xếp hạng cross-section.

### Cited Findings
- "Failure of Cross-Sectional Alpha Screening on Cryptocurrency Perpetual Futures" (03/2026): long-short cross-section trên 10 perp USDT-M Binance, tín hiệu OHLCV + funding, chu kỳ 8 giờ → **Rank IC trung bình ≈ −0,01, Sharpe ròng âm**; không có alpha khai thác được — [SSRN 6701738](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6701738)
- Arbitrage từng coin delta-neutral cho lợi suất ròng cao hơn BTC (BNB 18,4%, DOGE 23,3%, ADA 12,0%/năm sau phí bậc cao, 2020–2024), độ lệch ở altcoin lớn hơn (|ρ| 0,83–0,88 so với 0,57 của BTC) — [arXiv 2212.06888v5](https://arxiv.org/html/2212.06888v5)
- He, Wang, Zhang (SSRN 6185958): dữ liệu 200 perp USDT-M Binance, đảo chiều basis gắn với thanh lý một chiều — mô hình cơ chế, không kiểm định lợi nhuận dự báo — [SSRN 6185958](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6185958)
- Funding BTC có thể dự báo được ở mức nào đó (mô hình double autoregressive vượt benchmark "không đổi" về sai số và độ chính xác hướng trên Binance/Bybit, độ dự báo thay đổi theo thời gian) — [Inan, SSRN 5576424](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5576424)
- Lưu ý ETH PoW: quý duy nhất có tổng lợi suất âm trong 3 năm của Ethena do giai đoạn arbitrage ETH PoW — minh hoạ funding âm theo sự kiện riêng của coin — [Ethena docs](https://docs.ethena.fi/solution-overview/risks/funding-risk)

### Inferences
- Coin có funding âm sâu thường là coin đang bị short dồn (tin xấu, unlock token, delist) — long chúng để ăn funding là đang nhận rủi ro hướng giá, không phải carry thuần.
- Với altcoin, nếu muốn ăn funding cao thì hình thức an toàn hơn là delta-neutral từng coin (long spot + short perp), không phải long/short giữa các coin.

### Gaps
- Không tìm thấy paper công bố (peer-reviewed) chứng minh một cross-sectional funding factor có lợi nhuận dương sau phí; cũng không tìm thấy dữ liệu nội bộ quỹ.

## Câu 3 — Funding cực đoan / thay đổi OI có dự báo đảo chiều không?

### Takeaway
Ở khung ngắn (8 giờ), funding gần như **không có sức dự báo hướng giá** (tỷ lệ trúng 44–53%). Ở khung dài hơn, bằng chứng học thuật mạnh nhất là BIS: **carry cao dự báo rủi ro sập giá (crash)** — tức là funding/basis cao là thước đo "đông người long" và rủi ro đuôi, không phải tín hiệu vào lệnh short có thời điểm chính xác. OI tăng nhanh + funding cao là điều kiện nền cho cascade thanh lý (như 10/10/2025), nhưng chỉ là heuristic, chưa có kiểm định định lượng công bố.

### Cited Findings
- BIS WP 1087: **carry cao dự báo các đợt sập giá trong tương lai**; carry tăng đi kèm giá bảo hiểm crash (option put) tăng; carry do cầu của nhà đầu tư nhỏ đuổi theo xu hướng, muốn đòn bẩy trong giai đoạn bùng nổ — [BIS](https://www.bis.org/publ/work1087.htm)
- He et al.: lợi suất 120 ngày quá khứ có hệ số dương, rất có ý nghĩa thống kê, với premium perp (giá tăng → perp đắt hơn spot) — funding đi theo xu hướng giá, R² tối đa 0,33 — [arXiv 2212.06888v5](https://arxiv.org/html/2212.06888v5)
- BitMEX (XBTUSD): funding **không có sức dự báo đáng kể**; funding cực đoan ở ngưỡng 1 và 2 độ lệch chuẩn dự báo chiều ngược lại trong 8 giờ tiếp với tỷ lệ trúng **~44–53%** (≈ tung đồng xu) — tóm tắt từ kết quả tìm kiếm, link gốc nay trả 404 — [BitMEX blog (404)](https://www.bitmex.com/blog/xbtusd-funding-mean-reversion-strategy)
- Trước 10/10/2025: OI BTC tăng từ ~38 tỷ lên >47 tỷ USD (27/9–5/10) cùng lúc giá tăng; sau sự kiện OI giảm ~70.000 BTC trong một ngày — [beincrypto (dẫn CryptoQuant)](https://beincrypto.com/liquidation-cascade-onchain-technical-analysis/), [whale-alert](https://whale-alert.io/stories/b18701fb9e3a7e/Weeks-of-rising-leverage-falling-exchange-supply-preceded-Oct-10-2025-19B-Bitcoin-long-liquidation-early-warning-signs-to-watch). Các nguồn thừa nhận đòn bẩy nhìn thấy được trước, nhưng **cú kích hoạt thì không đoán được**.
- Funding nhỏ dao động quanh mức neo 0,01% do arbitrage; mức cực đoan bị vốn arbitrage dập nhanh — [BitMEX Q3 2025](https://www.bitmex.com/blog/2025q3-derivatives-report)
- Lập luận thực hành: OI tăng ở funding cực đoan = đám đông vẫn đang thêm vị thế; OI giảm = đã bắt đầu gỡ (không phải kiểm định thống kê) — [LuxAlgo](https://www.luxalgo.com/library/concept/funding-rate.md)

### Inferences
- Dùng funding/OI như **bộ lọc rủi ro** (giảm size, không mở long mới khi funding + OI cùng ở mức cực đoan) hợp lý hơn dùng như **tín hiệu vào lệnh** đảo chiều.
- Vì funding đi theo momentum 120 ngày, funding dương cao thường trùng xu hướng tăng; short ngược chỉ vì funding cao là đi ngược trend — trùng với kết quả hit-rate ~50%.

### Gaps
- Không tìm được paper học thuật kiểm định OI-change → lợi nhuận tương lai với số liệu cụ thể (Sharpe, t-stat). Không đọc được bảng crash-prediction cụ thể của BIS.
- Không có số liệu định lượng Glassnode/Kaiko về "funding cực đoan → drawdown X% trong N ngày".

## Câu 4 — Quỹ lớn kết hợp carry với trend thế nào (Ethena, Galaxy, Wintermute, Amber)

### Takeaway
Tư liệu công khai về cách quỹ lớn kết hợp carry + trend rất hạn chế. Điều có tài liệu: Ethena vận hành carry ở quy mô hàng chục tỷ USD với **phân bổ động** (rút về stablecoin khi funding thấp/âm), quỹ dự phòng, và đa dạng tài sản; các quỹ arbitrage chạy trên nhiều sàn (Binance/OKX/Bybit). Không tìm thấy nghiên cứu công khai của Galaxy, Wintermute hay Amber về chiến lược carry + trend.

### Cited Findings
- Ethena: khi funding thấp/âm, chuyển phần lớn tài sản bảo chứng USDe sang stablecoin thanh khoản hưởng ~lãi suất trái phiếu Mỹ; quỹ dự phòng bù khi tổng doanh thu (stETH + funding + basis futures ngắn hạn + lãi stablecoin) âm — [Ethena docs](https://docs.ethena.fi/solution-overview/risks/funding-risk)
- Chaos Labs (08/2024): funding âm trên 37% tài sản bảo chứng liên quan ETH được bù bởi funding BTC dương trên 46% tài sản liên quan BTC và lợi suất staking — đa dạng hoá giữa tài sản — [Aave governance – Chaos Labs](https://governance.aave.com/t/chaos-labs-ethenas-usde-and-susde-funding-rates-08-06-24/18565)
- Chỉ số Funding Arbitrage 1Token Q2/2025: 8 đội, chạy trên Binance, OKX, Bybit; PnL tách thành thu funding, phí giao dịch, lãi vay, PnL giao dịch; tổng AUM các đội >2 tỷ USD (4-Alpha >600 triệu, JZL >200 triệu) — [1Token Strategy Index III](https://blog.1token.tech/strategy-index-iii-2025-q2/)
- Bằng chứng gián tiếp về liên hệ carry–trend: premium perp tăng theo lợi suất 120 ngày quá khứ — [arXiv 2212.06888v5](https://arxiv.org/html/2212.06888v5); carry do nhà đầu tư nhỏ đuổi theo xu hướng — [BIS](https://www.bis.org/publ/work1087.htm). Tức là carry cao nhất đúng lúc trend tăng mạnh nhất.
- Nguồn (thứ cấp) cho rằng quỹ crypto thường rút khỏi basis trade khi lợi suất xuống ~6–8% — **chưa xác minh** — [brainsum (thứ cấp)](https://san-1510.aid.brainsum.com/news/analysis/bitcoins-institutional-bid-quietly-weakening)

### Inferences
- Vì carry và momentum tương quan dương (funding cao ↔ trend tăng), danh mục "carry + trend" thực chất tập trung rủi ro vào cùng một chế độ thị trường (bull, đòn bẩy cao) và cùng thua khi crash — đúng với phát hiện BIS "carry cao dự báo crash".
- Lợi thế thật của quỹ lớn nằm ở hạ tầng (phí VIP, đa sàn, tín dụng, quản lý collateral), không phải ở một tín hiệu bí mật.

### Gaps
- Không tìm thấy nghiên cứu công khai của Galaxy Research, Wintermute, Amber Group, Coinbase Institutional hay Binance Research về kết hợp carry–trend trong giới hạn tìm kiếm.

## Câu 5 — Có thực tế cho tài khoản ~10.000 USDT chạy bot trên Binance không?

### Takeaway
Về kỹ thuật thì làm được (Binance thậm chí có sẵn bot Funding Rate Arbitrage), nhưng lợi nhuận kỳ vọng nhỏ: ở funding chuẩn 0,01%/8h, phí vào+ra của hai chân "ăn" khoảng 8–10 ngày funding, và vì chỉ dùng được khoảng một nửa vốn làm notional nên lợi suất trên tổng vốn chỉ ~4–5%/năm ở điều kiện tốt — trong khi bằng chứng 2025 cho thấy carry BTC thụ động có Sharpe âm.

### Cited Findings
- Funding 0,01%/8h = 10,95%/năm gộp; ví dụ giữ 30 ngày với 4 lần phí maker 0,02% → phí ~0,97%/năm, ròng ~9,98% APR (chưa tính trượt giá, chi phí vốn) — [Sharpe.ai guide](https://www.sharpe.ai/arbitrage/guide/funding-rate-arbitrage)
- Tài khoản nhỏ: không có mức tối thiểu cứng, nhưng phí và trượt giá chiếm tỷ trọng lớn hơn — [OneKey blog](https://onekey.so/blog/ecosystem/hyperliquid-binance-funding-arbitrage-20260429/)
- Binance ra mắt Funding Rate Arbitrage Bot (2024) tự động hoá cặp spot + perp — [The Defiant](https://thedefiant.io/news/press-releases/binance-delivers-on-community-requests-for-more-choices-with-new-funding-rate-arbitrage-bot-and-full-availability-of-spot-copy-trading)
- Ngay cả ở bậc phí cao nhất trong nghiên cứu (spot maker 0,0675%), chiến lược có ngưỡng — chỉ vào khi độ lệch vượt chi phí — vẫn có Sharpe BTC 1,80, lợi suất 6,38%/năm (2020–2024, ròng, giả định khớp maker) — [arXiv 2212.06888v5](https://arxiv.org/html/2212.06888v5)
- Sharpe carry BTC Binance âm trong 2025 — [arXiv 2510.14435](https://arxiv.org/pdf/2510.14435)
- Binance funding kém ổn định hơn BitMEX (ít bám mức neo 0,01% hơn) — [BitMEX Q3 2025](https://www.bitmex.com/blog/2025q3-derivatives-report)

### Inferences (tính toán của người ghi chú, không phải số liệu nguồn)
- **Phí một vòng (vào + ra, cả hai chân)**, với phí futures người dùng cung cấp (taker 0,05%, maker 0,02%) và giả định phí spot Binance tiêu chuẩn 0,1% (**con số phí spot chưa được xác minh trong phiên này**):
  - Toàn maker futures + spot 0,1%: 2×0,02% + 2×0,1% = **0,24% notional** ≈ 8 ngày funding ở 0,03%/ngày.
  - Toàn taker: 2×0,05% + 2×0,1% = **0,30%** ≈ 10 ngày funding.
  - Nếu xoay vòng vào/ra theo funding (mỗi tháng 1 lần) → phí ~2,9–3,6%/năm, nuốt 1/3 lợi suất gộp 10,95%.
- **Hiệu suất vốn**: 10.000 USDT chia ~50/50 (5.000 spot + 5.000 margin cho short 1x) → notional ~5.000 → funding 10,95% trên notional ≈ **~550 USDT/năm gộp ≈ 5,5% trên tổng vốn**, trước phí. Tăng đòn bẩy chân short tăng hiệu suất vốn nhưng tăng rủi ro thanh lý chân short khi giá tăng vọt.
- **Ở mức funding 2025–2026** (~2–5%/năm theo các nguồn thứ cấp ở Câu 1), lợi suất ròng trên vốn chỉ còn ~1–2%/năm — thấp hơn gửi stablecoin.
- **Rủi ro vận hành** cho bot nhỏ: lệch chân (một chân khớp, chân kia không), API lỗi khi biến động mạnh, ADL đóng chân short đúng lúc giá sập, cần theo dõi margin 24/7, 100% vốn nằm trên một sàn.
- **Ứng dụng hợp lý hơn cho bot định hướng (Coin Radar)**: dùng funding + OI làm **bộ lọc rủi ro** (giảm size/không mở long khi funding cực đoan và OI vừa tăng nhanh), không dùng làm tín hiệu đảo chiều độc lập (Câu 3).

### Gaps
- Không có nghiên cứu độc lập nào về lợi suất ròng thực tế của tài khoản retail Binance chạy funding arbitrage 2025–2026.
- Biểu phí spot/futures Binance hiện hành cho tài khoản nhỏ chưa được xác minh trực tiếp trong phiên này.
