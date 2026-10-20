# Bot mã nguồn mở ngoài Freqtrade, bot grid/DCA/martingale và track record công khai đã xác minh (crypto, tính đến 10/2026)

Quy ước nhãn chất lượng bằng chứng (evidence quality) dùng trong toàn bộ ghi chú:
- **[A]** peer-reviewed / arXiv có phương pháp rõ, hoặc dữ liệu độc lập có thể kiểm tra lại
- **[B]** dữ liệu nội bộ của nền tảng/vendor, có nêu phương pháp nhưng không kiểm chứng độc lập được
- **[C]** giai thoại cá nhân (blog, Reddit, Binance Square) hoặc bài marketing có số liệu
- **[D]** tuyên bố không có số liệu kiểm chứng (README, listicle, bài quảng cáo)

Ghi chú về các nguồn không truy cập được trong phiên này (đã thử, trả lỗi HTTP): PDF/abstract Taranto–Khan trên USQ (405), Virtus Interpress (403), RePEc (404); alphaarena.ai (429); file STRATEGY_COMPARISON trên Gitea (yêu cầu đăng nhập); datax.berkeley.edu (DNS lỗi); mexc.com/news/370275 (410). Những chỗ này tôi chỉ dùng được trích đoạn từ kết quả tìm kiếm và ghi rõ là trích đoạn.

---

## Câu hỏi 1 — Trong các chiến lược mã nguồn mở ngoài Freqtrade, chiến lược nào có bằng chứng out-of-sample (ngoài mẫu) hoặc live (chạy thật) đáng tin về lợi nhuận sau phí trên crypto, và luật của chúng là gì?

### Takeaway
Không tìm thấy **bất kỳ** framework/repo mã nguồn mở nào (Jesse, Hummingbot, OctoBot, Superalgos, Gekko, Zenbot, Passivbot, vectorbt, ai-hedge-fund, TradingAgents) công bố track record live hoặc out-of-sample đã xác minh độc lập cho thấy lợi nhuận sau phí trên crypto; tất cả đều tự ghi "educational / use at your own risk" và chỉ đưa output backtest minh họa. Bằng chứng gần nhất với "đáng tin" là 2 bài học thuật: EMA walk-forward trên BTC chỉ **ngang buy-and-hold** với drawdown thấp hơn (phí 0,1%, hòa vốn ở ~0,4%/lệnh), và thí nghiệm Alpha Arena (LLM giao dịch perp tiền thật) với 4/6 model lỗ nặng.

### Cited Findings

**Jesse (jesse-ai)**
- Repo `jesse-ai/example-strategies` có 181 sao, 11 chiến lược: DUAL_THRUST, Donchian, IFR2, KDJstrategy, MACD_EMA, MAGen, RSI2, SMACrossover, SimpleBollinger, TradingView_RSI, TurtleRules. README ghi "This code is for educational purposes only", các chiến lược là ví dụ, không phải "ready-to-go profitable strategies" và "might only work on certain timeframes / symbols". Không có kết quả backtest nào được công bố. **[D]** — [GitHub jesse-ai/example-strategies](https://github.com/jesse-ai/example-strategies)
- Luật SMACrossover (ví dụ trong mô tả PyPI của Jesse): SMA chậm 200 kỳ, SMA nhanh 50 kỳ; long khi nhanh > chậm, short khi nhanh < chậm; vào lệnh bằng toàn bộ số dư đã trừ phí. **[D]** — [PyPI jesse](https://pypi.org/project/jesse)
- Jesse tự tuyên bố "for educational purposes only", tác giả "assume no responsibility for your trading results". Output backtest trên PyPI chỉ là một lần chạy demo. **[D]** — [PyPI jesse 0.35.7](https://www.pypi.org/project/jesse/0.35.7/)
- Docs Jesse: "TradingView's backtest metrics are usually different than what you see in Jesse's" — tức số của TradingView và Jesse không so sánh trực tiếp được. **[D]** — [docs.jesse.trade/backtest](https://docs.jesse.trade/docs/backtest)
- Tìm kiếm "jesse.trade blog strategy backtest results live" không ra bài nào công bố kết quả live. — [kết quả tìm kiếm chỉ ra docs/benchmark](https://docs.jesse.trade/docs/backtest/benchmark)

**Hummingbot (V2 controllers)**
- V2 framework ra mắt ở v1.20.0 (10/2023), kèm template directional và market-making, "backtest-able". **[D]** — [Hummingbot 1.20.0 release notes](https://docs.hummingbot.org/release-notes/1.20.0/)
- Trang ví dụ V2 liệt kê 3 controller directional với tham số mẫu đầy đủ nhưng **không có con số hiệu suất** nào (return, win rate, drawdown):
  - `bollinger_v1`: tín hiệu theo Bollinger %B, long khi < 0,3, short khi > 0,7; thoát bằng triple-barrier: SL 1%, TP 3%, time limit 21.600 s (6 h), trailing kích hoạt 0,8% / delta 0,4%; BB length 100, std 2,0; nến 1m/5m/1h.
  - `macd_bb_v1`: MACD 21/42/9 kết hợp BB (ngưỡng 0,3/0,7); SL 1%, TP 6%, time limit 86.400 s (24 h), trailing 1%/0,4%; BB 100/2,0; nến 3m.
  - `dman_v3`: mean reversion dạng grid theo Bollinger; BB 200/3,0; 5 mức lệnh, spread đầu 1,0, bước 0,2 (tính theo tỉ lệ BB); SL 20%, TP 6%, time limit 259.200 s (3 ngày), trailing 1%/0,3%; nến 30m. **[D]** — [hummingbot.org V2 examples](https://hummingbot.org/strategies/v2-strategies/examples/)
- Docs Dashboard backtest: dùng để "understand parameter sensitivity and validate that your strategy behaves as expected — not to predict exact live results"; metric gồm net PNL, max drawdown, Sharpe, profit factor. **[D]** — [hummingbot.org/dashboard/backtest](https://hummingbot.org/dashboard/backtest/)
- Controller `directional_trading` trong Condor dùng EMA fast/slow + TP/SL. **[D]** — [condor.hummingbot.org/bots/controllers](https://condor.hummingbot.org/bots/controllers)
- Hướng dẫn tối ưu `bollinger_v1` bằng Optuna (tự dò tham số) — chính là kiểu sweep dễ overfit. **[D]** — [Using Dashboard to Deploy and Backtest — Part 6](https://docs.hummingbot.org/academy-content/using-dashboard-to-deploy-and-backtest-strategies---part-6/)

**OctoBot, Superalgos, Gekko, Zenbot, Passivbot**
- OctoBot README chỉ có một báo cáo backtest "grid trading on eth btc with 8 percent profit"; các chế độ: grid, trailing grid, DCA, smart DCA, index, arbitrage, signal, market making, TradingView, TA. Không có kết quả live công khai. **[D]** — [GitHub OctoBot (fork MaxaAI, nội dung README gốc Drakkar-Software)](https://github.com/MaxaAI/OctoBot)
- Gekko: repo archived ngày 16/02/2020, "This repo is not maintained anymore", chỉ có "Use Gekko at your own risk", không tuyên bố lợi nhuận. **[D]** — [GitHub askmike/gekko](https://github.com/askmike/gekko)
- Một bài case-study nói Gekko "performed inconsistently and inspired mistrust" do tính năng hạn chế, không có con số. **[C]** — [wiuwi.com case study](https://wiuwi.com/blogs/159239/Case-Study-Success-Stories-and-Failures-of-Crypto-Trading-Bots)
- Zenbot chỉ được mô tả là bot CLI chạy số dư mô phỏng; không có số hiệu suất. **[D]** — [coinledger listicle](https://coinledger.io/tools/the-best-open-source-and-free-crypto-trading-bots)
- Superalgos: mô tả là nền tảng mã nguồn mở cộng đồng, mạng social-trading có token thưởng cho người phát tín hiệu theo số người theo dõi; không công bố return. **[D]** — [CoinMarketCap Superalgos](https://coinmarketcap.com/currencies/superalgos/); [Finextra](https://www.finextra.com/pressarticle/90508/superalgos-releases-crypto-trading-bot-platform)
- Passivbot (v7.8.4): grid + trailing entry trên perpetual futures, **không có stop-loss**, quản rủi ro bằng TWEL Enforcer (tự giảm vị thế khi wallet exposure vượt ngưỡng, v7.5.0) và `live.max_realized_loss_pct` (mặc định 0,05, v7.8.4). Kết quả thực tế được review trích: một người dùng ~6,3% năm hóa trong 100 ngày trong khi hold BTC cùng kỳ +16%; một trader khác chạy grid bot 1,5 năm: ~+30% với BTC, ~hòa với ETH, thắng lump-sum trong bear nhưng thua DCA. Review nói hệ thống "not fully set and forget", làm tốt hơn ở sideways. **[C]** — [Gainium review Passivbot](https://gainium.io/review/passivbot)

**vectorbt / backtesting.py / repo "crypto-trading-bot" trending**
- Trang usage vectorbt đưa ví dụ ETH với "Win Rate [%] 52.83" — chỉ là output minh họa, không phải bằng chứng. **[D]** — [vectorbt.dev usage](https://vectorbt.dev/getting-started/usage)
- `edeng23/binance-trade-bot` (nhảy coin qua USDT, "never end up having less of a certain coin") tự nêu rủi ro "one of the coins may freefall relative to the others"; không có số liệu người dùng. **[D]** — [GitHub ccxt/binance-trade-bot (fork)](https://github.com/ccxt/binance-trade-bot)
- Tìm kiếm repo GitHub trending có claim "win rate" không ra repo nào có kết quả live/OOS kiểm chứng; chỉ ra docs vectorbt. — [awesome.ecosyste.ms vectorbt](https://awesome.ecosyste.ms/projects/github.com%2Fpolakowo%2Fvectorbt)
- Một repo cá nhân (Gitea) test 6 chiến lược trên 26 token Binance, train 7–11/2024, test 12/2024–1/2025 bằng walk-forward: **không chiến lược nào dương out-of-sample**, chiến lược tốt nhất in-sample suy giảm nhiều nhất (trích từ snippet tìm kiếm; trang yêu cầu đăng nhập nên không đọc được bản gốc). **[C]** — [Gitea botdoggy42 STRATEGY_COMPARISON](https://gitea.com/botdoggy42/exploring-backup/src/branch/master/sr_shitcoin/STRATEGY_COMPARISON.md)

**Học thuật về walk-forward trên crypto**
- Mroziewicz & Ślepaczuk (arXiv 2602.10785, 2/2026): chiến lược EMA trên BTC intraday 6 khung 1–60 phút; train 19 tháng, out-of-sample 21 tháng; 81 tổ hợp cửa sổ walk-forward 1–28 ngày; phí giả định 0,1%/lệnh; kết quả OOS **tương đương buy-and-hold** nhưng drawdown thấp hơn và Information Ratio cao hơn; danh mục kết hợp B&H + chiến lược giảm ~50% drawdown; **chi phí hòa vốn ~0,4%/lệnh**; validate trên BNB/ETH bằng tham số ước lượng từ BTC. **[A]** — [arXiv 2602.10785](https://arxiv.org/abs/2602.10785v1)

**TradingView "percent profitable" port sang GitHub**
- Script "Fake Strategy" (open-source, đăng để minh họa): win rate cao thường do TP nhỏ + SL rất xa ("picks up pennies while risking plenty"); khuyên so sánh average trade với max drawdown; repaint qua `request.security` và dùng leverage trong Pine có thể tạo kết quả giả. **[C]** — [TradingView Fake Strategy](https://my.tradingview.com/script/ekQPU4LF-Fake-Strategy)
- "Percent Profitable" trong Strategy Tester chỉ là tỉ lệ lệnh thắng / tổng lệnh đóng. **[D]** — [Pine library replica backtesting engine](https://www.tradingview.com/script/y4wMeSpt-Replica-of-TradingView-s-Backtesting-Engine-with-Arrays)
- Một trader port Pine → Python → Tradovate (NQ, không phải crypto), chạy live với tham số tối ưu trên chính dữ liệu đã test, lỗ sau vài tháng, tự nhận "purely overfit model". **[C]** — [TradingView post](https://www.tradingview.com/chart/NQ1%21/4reovOWt-Intro-to-my-python-tradingview-strategy)

**LLM-agent trading (ai-hedge-fund, TradingAgents, Alpha Arena)**
- Bài TradingAgents (arXiv 2412.20138): backtest 1/1–29/3/2024 trên cổ phiếu công nghệ Mỹ (AAPL, NVDA, MSFT, META, GOOGL), **không có crypto**; tuyên bố tránh look-ahead bằng cách chỉ dùng dữ liệu tới ngày giao dịch. **[A nhưng không áp dụng cho crypto]** — [arXiv 2412.20138](https://arxiv.org/pdf/2412.20138)
- Claim bên thứ ba: 26,62% trên AAPL 6 tháng, Sharpe 8,21, MDD < 1% — blog marketing, không kiểm chứng. **[D]** — [PickMyTrade blog](https://blog.pickmytrade.io/build-ai-hedge-fund-tradingagents.md)
- `51bitquant/ai-hedge-fund-crypto`: 625 sao, 164 fork; workflow LangGraph với MACD/RSI/Bollinger đa khung rồi LLM ra quyết định; README **không có con số** return/win rate/Sharpe (chỉ 3 ảnh backtest); mâu thuẫn giữa "Real Trading Execution" và "Real Trading Integration (Planned)… not yet implemented"; có link referral Binance Futures. **[D]** — [GitHub 51bitquant/ai-hedge-fund-crypto](https://github.com/51bitquant/ai-hedge-fund-crypto)
- Beamforai gắn nhãn repo này "dying", commit cuối ~8 tháng trước. **[D]** — [beamforai](https://www.beamforai.com/tools/51bitquant/ai-hedge-fund-crypto)
- Lo ngại look-ahead đặc thù LLM: model có thể đã "nhìn thấy" sự kiện trong dữ liệu huấn luyện nên backtest là recall chứ không phải dự báo; có dự án "PIT audit" xin tài trợ để kiểm look-ahead bias cho benchmark AI trading. **[C]** — [Manifund PIT audit](https://manifund.org/projects/pit-audit-lookahead-bias-audits-for-ai-trading--forecasting-benchmarks)
- **Alpha Arena (Nof1)** — thí nghiệm tiền thật, 6 LLM × 10.000 USD giao dịch crypto perpetual trên Hyperliquid, mùa 1 bắt đầu giữa tháng 10/2025. Sau ~2,5 ngày DeepSeek dẫn +35,5% so với BTC hold +3,5%. **[C]** — [Empire/Blockworks](https://empire-blockworks.beehiiv.com/p/ai-trades-on-hyperliquid); [SCMP](https://www.scmp.com/tech/tech-trends/article/3329784/deepseek-outperforms-ai-rivals-real-money-real-market-crypto-showdown)
- Kết quả cuối mùa 1 theo Buildix (vendor): Qwen3 Max **+22,3%** (43 lệnh, **win rate 30,2%**), DeepSeek V3.1 +4,89%, Claude Sonnet 4.5 −30,8%, Grok 4 −45,3%, Gemini 2.5 Pro −56,7% (238 lệnh, phí 1.331 USD = >13% vốn), GPT-5 −62,7%. Buildix nói kết thúc 3/12/2025; Innobu nói mùa 1 chạy 17/18-10 → 3-11-2025 — **ngày kết thúc mâu thuẫn giữa nguồn**; trang alphaarena.ai trả 429 nên tôi không đối chiếu được với bảng xếp hạng chính thức. **[C]** — [Buildix](https://www.buildix.trade/blog/nof1-alpha-arena-lessons-ai-trading-byok-strategy-advisor-2026); [Innobu](https://www.innobu.com/en/articles/ai-trading-competition-chinese-llms-investors.html)
- Kết luận của Buildix: cửa sổ 2 tuần quá ngắn; tần suất lệnh cao làm phí ăn mòn vốn; Claude giữ 100% long không hedge/không stop; LLM hợp cho research hơn là tự giao dịch. **[C]** — [Buildix](https://www.buildix.trade/blog/nof1-alpha-arena-lessons-ai-trading-byok-strategy-advisor-2026)

### Inferences
- Toàn bộ "hệ sinh thái mã nguồn mở ngoài Freqtrade" chỉ cung cấp **công cụ** và **luật ví dụ**, không cung cấp **bằng chứng**. Người dùng muốn có bằng chứng phải tự chạy walk-forward.
- Hai bằng chứng độc lập nhất (EMA walk-forward [A] và repo 6 chiến lược × 26 token [C]) cùng chỉ về một hướng: chiến lược chỉ báo đơn giản trên crypto **không thắng buy-and-hold sau phí** ở out-of-sample; giá trị nếu có là giảm drawdown, không phải tăng return.
- Ngưỡng hòa vốn ~0,4%/lệnh (round-trip gồm phí + trượt giá) là con số then chốt: với phí taker Binance Futures ~0,05%/chiều, trượt giá và funding sẽ quyết định sống/chết của chiến lược tần suất cao. Alpha Arena (Gemini mất >13% vốn vì phí) là minh họa live.
- Alpha Arena cho thấy một "bot" có thể dương với **win rate chỉ 30%** nếu tỉ lệ lãi/lỗ trung bình đủ lớn — ngược với hình ảnh "win rate cao" mà grid/martingale đưa ra.

### Gaps
- Không tìm được bất kỳ ví dụ nào về chiến lược Jesse/Hummingbot/OctoBot có kết quả live công khai ≥ 1 năm; không có cộng đồng nào (Discord/forum) được index với số liệu kiểm chứng.
- Không đọc được bản gốc file STRATEGY_COMPARISON (Gitea) để xác nhận luật chiến lược, phí và có phải futures không.
- Không truy cập được bảng xếp hạng chính thức Alpha Arena để xác nhận số cuối và ngày kết thúc.
- Không tìm thấy repo Python/TS nào port chiến lược TradingView "percent profitable" cao kèm kết quả so sánh; chỉ có minh họa cách làm giả win rate.
- Nghiên cứu AnChain.ai/Berkeley DataX ("bot lỗ nhiều hơn người") không truy cập được (DNS lỗi) nên không trích số được. — [URL](https://datax.berkeley.edu/projects/anchain-ai-the-use-of-trading-bots-leads-to-great-financial-losses-compared-to-the-real-trading/)

---

## Câu hỏi 2 — Quan hệ giữa win rate và lợi nhuận của bot grid/DCA/martingale được ghi nhận như thế nào, kể cả các đợt mất sạch?

### Takeaway
Về lý thuyết (2 bài học thuật): grid truyền thống có **kỳ vọng bằng 0** khi giá là random walk đối xứng và **âm khi tính phí hoặc khi giá đi một chiều**; grid/martingale "thắng ngắn hạn nhưng hầu như chắc chắn phá sản dài hạn" (gambler's ruin). Về thực nghiệm (Bitsgap H1-2026, dữ liệu nền tảng): win rate tính theo "bot đóng có lãi" chỉ 35–58%, **median return 0,01–1,76%**, mean cao gấp 4,6–14,2 lần median do vài bot thắng lớn — và dữ liệu này **không đo liquidation**. Không tìm được vụ "cháy tài khoản" grid/DCA có tên tuổi được ghi chép (LUNA 5/2022, bear 2022) — chỉ có giai thoại và quy tắc liquidation ≈ 100/leverage.

### Cited Findings

**Lý thuyết**
- Chen, Chen & Jang (arXiv 2506.11921, 6/2025): với giả định giá lên/xuống k với xác suất bằng nhau và bỏ qua phí, "the expected value of a grid strategy is zero under our assumptions"; **có phí thì kỳ vọng âm**; giá đi tuyến tính một chiều → "negative expected value". Khi giá vượt biên trên: bot giữ USDT + lãi grid, không còn coin; khi thủng biên dưới: toàn bộ USDT đã thành coin (ôm bag), lãi grid vẫn giữ. Tham số backtest: BTC range 10.000–80.000, ETH 500–5.000, grid hình học n = 6, phí 0,0008 (maker L1 OKX), dữ liệu phút 1/2021–7/2024. Biến thể DGT (reset grid quanh giá mới) đạt IRR "60–70%", trong đợt ETH giảm ~80% DGT giới hạn drawdown ~50%; số liệu chi tiết chỉ nằm trong hình, không có bảng. **[A]** — [arXiv 2506.11921 HTML](https://arxiv.org/html/2506.11921v1); [abstract](https://arxiv.org/abs/2506.11921v1)
- Taranto & Khan, "Gambler's ruin problem and bi-directional grid constrained trading and investment strategies", *Investment Management and Financial Innovations* 17(3), 2020, 54–66, DOI 10.21511/imfi.17(3).2020.05: chiến lược grid 2 chiều (BGC) "tend to outperform in the short term but eventually fail"; "will almost surely ruin an investment account in the long term"; mô hình barrier hấp thụ tại số dư 0 (ruin) và tại mức lợi nhuận mục tiêu; grid mất nhiều bước hơn để tới ruin so với gambler's ruin cổ điển. (Trích từ abstract trong kết quả tìm kiếm; PDF trả 405.) **[A]** — [USQ repository](https://research.usq.edu.au/item/q5x02/gambler-s-ruin-problem-and-bi-directional-grid-constrained-trading-and-investment-strategies)
- Stevens FSC (Seshu & Yerramilli): grid trên Bybit, thêm Random Forest/LSTM để chỉnh tham số — ML **không** vượt phương pháp truyền thống; chiến lược hedging cho return tốt hơn hold BTC (không có số cụ thể trong snippet). **[B]** — [Stevens FSC](https://fsc.stevens.edu/cryptocurrency-market-making-improving-grid-trading-strategies-in-bitcoin/)
- cTrader FAQ: grid "like martingale, tends to win small often and lose huge occasionally" vì exposure phình ra khi thị trường trend ngược; chiến lược overfit "look excellent in backtesting and fail in live trading". **[D]** — [ctrader.com/faq/safety](https://ctrader.com/faq/safety)

**Luật và "toán win rate" của martingale DCA (Pionex và các bản white-label)**
- Martingale DCA Bot Standard Mode: chia vốn thành phần bằng nhau; với 3 safety order → 8 phần, mua theo chuỗi **1, 1, 2, 4**; multiplier ví dụ 1,5× → 1, 1,5, 2,25; mua thêm khi giá giảm "price scale" (%, hoặc tuyệt đối); **TP bán toàn bộ** khi giá hồi tới tỉ lệ take-profit rồi mở vòng mới; stop-loss tùy chọn theo % tổng lỗ. Bài viết tính xác suất lãi 50% → 75% → 87,5% → … theo số vòng, **giả định các vòng độc lập**, rồi thừa nhận "no one has unlimited funds" và **"even a 99.99% win rate" vẫn có thể mất toàn bộ vốn**; "Most … Martingale Bots will make profits unless the price keeps going down without returns after getting started". **[B/C]** — [Pionex.US help](https://intercom.help/pionexus/en/articles/14319693-martingale-dca-bot-standard-mode)
- Bản mirror (Webot): backtest BTC/USDT 15 tháng 1/4/2020–1/7/2021 (trong bull run) MDD **−52,84%** so với hold BTC −55,44%; cấu hình price-scale rộng hơn cho MDD −16,37%. **[B]** — [Webot help](https://intercom.help/webot/en/articles/14119846-martingale-dca-bot-standard-mode)
- Pionex so sánh (marketing): grid bot cần giá hồi ~99% mức ban đầu để hòa vốn, martingale chỉ ~4,2% — con số vendor, chưa kiểm chứng. **[D]** — [Substack Beginner's Guide Part 5](https://automatedincomelifestyle.substack.com/p/beginners-guide-to-crypto-trading-bots-part-5-martingale-dca-bots-23de4870b1d0)
- Script TradingView "Martingale Grid Bot": tăng size mỗi lệnh theo martingale; tác giả cảnh báo "trading with leverage and martingale involves increased risk", "intended for testing purposes only". **[D]** — [TradingView MGB](https://jp.tradingview.com/script/p0ym48jw-Martingale-Grid-Bot)

**Dữ liệu nền tảng Bitsgap (vendor, có phương pháp)**
- Báo cáo H1-2026 (bot đã đóng, dữ liệu nội bộ, không nêu cỡ mẫu): 

| Loại bot | "Win rate" (tỉ lệ bot đóng có lãi) | Return TB | Return median | Thời gian chạy TB |
|---|---|---|---|---|
| GRID (spot) | 35,14% | 2,34% | 0,51% | 10,23 ngày |
| DCA spot | 40,95% | −0,10% | 0,01% | 8,79 ngày |
| DCA Futures | 50,92% | 9,09% | 0,64% | 2,05 ngày |
| COMBO (futures) | 57,85% | 15,77% | 1,76% | 2,79 ngày |

  Mean/median gấp 4,6–14,2×; "win rate" đếm cả bot lãi 0,01%; **không risk-adjusted, không đo liquidation**, phản ánh một regime (năm trend nhiều hơn sideways). **[B]** — [Bitsgap: What actually worked in 2026](https://bitsgap.com/blog/what-actually-worked-in-2026)
- Bitsgap "spot vs futures grid" (cập nhật 5/10/2026): 513 spot grid bot tiền thật chạy > 7 ngày trong ≤ 3 tháng; spot ROE TB **+1,6%**, median **+1,5%**; replay futures (chỉ long) TB +9,7%, median +8,5%; futures hơn spot ở 370/513 bot (72,1%); **8 bản replay futures bị liquidation (1,6%)** — 7 trong số đó đã lỗ 25–90% ở spot, 1 bot spot lãi +150% nhưng bản futures vẫn cháy ("a strong spot result says little about how a leveraged copy would survive the path to it"); leverage, phí, funding, drawdown, win rate đều "[TBD]"; liquidation định nghĩa là mất ≥ 90% margin. **[B]** — [Bitsgap spot vs futures](https://bitsgap.com/blog/spot-vs-futures-grid-bot-what-backtests-show)

**Giai thoại live và cơ chế mất sạch**
- Dev chạy grid bot BTC perpetual trên Gate.io 6 tháng: bắt đầu 5×, giảm về 2×, khuyên 1–2×; mô tả downtrend khiến grid full-long tích lũy lỗ chưa thực hiện tới khi margin ratio sụp → liquidation ("at 5x, a 20% drop against an accumulated position is liquidation"); một cú BTC đi 3.000 USD/ngày khiến bot range hẹp đứng ngoài biên 2 tuần; kết quả ròng "roughly flat-to-modest after fees", không có số. 4 sai lầm: range quá hẹp, không có drawdown stop, leverage 5×, bỏ qua funding. **[C]** — [dev.to](https://dev.to/joe_hans_6c082d6c1caf189f/i-ran-a-gateio-btc-grid-bot-for-6-months-real-returns-and-3-fatal-mistakes-2i1p)
- Quy tắc Reddit r/KuCoinTradingBot (12/2024): futures martingale liquidation khi giá đi ngược ≈ 100/leverage (2× → 50%, 3× → 33%, 4× → 25%, 5× → 20%). **[C]** — [redlib mirror](https://redlib.ssps.io/r/KuCoinTradingBot/comments/1h9sirq/fut_martingale_liq_price)
- KuCoin Margin Grid FAQ: nếu Margin Grid bị cưỡng chế thanh lý thì không ảnh hưởng tài sản khác trong tài khoản (rủi ro giới hạn ở margin cấp cho bot). **[B]** — [KuCoin support](https://kucoin.com/support/20185497825433)
- Gainium: khi giá ra ngoài range, futures trader "should monitor out-of-range positions closely to avoid liquidation". **[D]** — [Gainium help](https://gainium.io/help/what-happens-when-the-price-is-out-of-range)
- 3Commas: sự cố 2022 được ghi nhận rõ nhất là **rò rỉ API key tháng 12/2022** gây thiệt hại cho người dùng và kiện tập thể (rủi ro nền tảng, không phải rủi ro chiến lược); DCA bot chỉ đóng deal khi tổng lãi ≥ Target Profit nên thị trường giảm để deal mở dài. **[C]** — [Gainium review 3Commas](https://gainium.io/review/3commas); [toolradar](https://toolradar.com/tools/3commas)

### Inferences
- "Win rate cao" của grid/martingale là **hệ quả cơ học** của việc TP nhỏ và không có SL (hoặc SL cực xa): mỗi vòng gần như chắc đóng lãi nhỏ, còn lỗ dồn vào các vòng chưa đóng → không xuất hiện trong thống kê lệnh đóng. Pionex nói thẳng: 99,99% win rate vẫn mất sạch.
- Khi Bitsgap đếm "win rate" ở **cấp bot** (bot đóng có lãi) thay vì cấp lệnh, con số rơi về 35–58% và median gần 0 → tỉ lệ thắng ở cấp lệnh (thường > 80–90% với grid) hoàn toàn không phản ánh kết quả tài khoản.
- Đuôi lỗ (loss tail): với spot là ôm bag ở đáy range (vốn đóng băng, không cháy); với futures là liquidation tại ~100/leverage % đi ngược. Dữ liệu 513 bot cho thấy 1,6% cháy ngay cả khi chỉ 3 tháng và chỉ long — kéo dài ≥ 1 năm qua một bear market, tỉ lệ này sẽ cao hơn nhiều (suy luận từ lý thuyết ruin của Taranto–Khan, chưa có số đo).
- Biến thể DGT (reset grid) trong bài Chen et al. về bản chất là đổi grid tĩnh thành trend-following có hedge; "IRR 60–70%" là backtest 1 giai đoạn, cần tái kiểm.

### Gaps
- **Không tìm thấy** tài liệu/thống kê nào về thiệt hại cụ thể của grid/DCA bot trong vụ LUNA (5/2022) hay bear 2022 — kết quả tìm kiếm chỉ ra bài về vụ sập LUNA nói chung.
- Không có nghiên cứu học thuật nào so sánh đầu-đối-đầu grid vs DCA vs martingale trên crypto; không có nghiên cứu DCA (safety-order) riêng.
- Bitsgap không công bố leverage, phí, funding, drawdown nên không tính được profit factor hay risk-adjusted return từ dữ liệu đó.
- Không truy cập được bản gốc Taranto–Khan nên không có công thức xác suất ruin cụ thể.

---

## Câu hỏi 3 — Track record công khai đã xác minh nói gì về mức "thực tế" (win rate, profit factor, max drawdown, lợi nhuận năm) của một bot futures crypto bán lẻ có lãi?

### Takeaway
Không có nguồn nào công bố bộ số (win rate, profit factor, MDD, return năm) đã xác minh độc lập cho bot futures crypto bán lẻ chạy ≥ 1 năm. Dữ liệu tốt nhất là **ảnh chụp 90 ngày**: nghiên cứu YieldFund (qua blog KuCoin) trên >100.000 kết quả copy-trading cho thấy 97% lead trader có PnL cá nhân dương nhưng chỉ **43,61%** mang lãi cho người copy; base rate chung: chỉ ~18% trader futures (KoinX, Ấn Độ, FY2024–25) có lãi, 70–80% người chơi derivatives lỗ. Tất cả nguồn đều là vendor/thứ cấp hoặc snapshot ngắn; không có số liệu "sống sót sau 6–12 tháng".

### Cited Findings

**Copy-trading Binance / Bybit / MEXC**
- Nghiên cứu "YieldFund Multi-Exchange Study (2025)", 90 ngày, >100.000 kết quả copy-trading, công bố cuối 2025, đăng lại trên blog KuCoin (đối thủ, có lợi ích thương mại; không có phương pháp/tác giả):

| Sàn | Win rate người copy | PnL ròng người copy | Lead trader mang lãi cho follower |
|---|---|---|---|
| Binance | 66,50% | +572.979 USDT | 72,45% |
| Bybit | 43,65% | +346.106 USDT | 40,34% |
| MEXC | 57,79% | −210.040 USDT | < 50% |
| Gộp | ~48,48% | +709.045 USDT | 43,61% |

  **97% lead trader có PnL cá nhân dương** nhưng chỉ 43,61% sinh lãi cho follower; lý do: lead vào lệnh trước, trượt giá khác, rủi ro không scale. Số gộp không phải trung bình đơn của 3 sàn (không giải thích). **Không có dữ liệu theo thời gian** về bao nhiêu lead trader giữ được lãi. **[B/C]** — [KuCoin blog](https://www.kucoin.com/blog/is-crypto-copytrading-profitable-in-2026)
- Bybit có ~90.000 master trader trên 3 sản phẩm copy, phí hiệu suất 10–15%. **[D]** — [spark.money glossary](https://www.spark.money/glossary/copy-trading)
- BitMEX guide: trader có thể tạo ROI cao bằng leverage cao/tập trung vị thế trong khi drawdown sâu; cần xem MDD cùng ROI. **[D]** — [BitMEX blog](https://www.bitmex.com/blog/best-crypto-master-traders-metrics-guide)
- Bybit leaderboard hiển thị ROI, win rate, MDD, Sharpe, profit/loss ratio, follower total profit; cửa sổ 7/30/90 ngày (không có cửa sổ ≥ 1 năm). **[D]** — [Apify Bybit scraper mô tả](https://apify.com/brilliant_gum/bybit-scraper)
- Binance Square (lead trader cá nhân): khuyên lọc theo ROI và hiệu suất **180D hoặc 360D** vì "consistency matters much more than short-term hype"; một bài khác nói khi BTC rơi từ ~122.500 xuống 101.500 ngày 9/10/2025 "many 'top' Lead Traders completely disappeared" — giai thoại, không số liệu; tôi không tìm lại được bài gốc trên trang profile khi fetch. **[C]** — [Binance Square profile](https://www.binance.com/en/square/profile/fg47)
- Tổng hợp ước tính của một sàn: chiến lược lãi gộp 20% chỉ còn 12–15% ròng cho follower sau profit-share và chi phí. **[D]** — [Arkm research](https://info.arkm.com/research/crypto-copy-trading-what-is-it-and-how-to-do-it)
- Decrypt (2022): trader đứng đầu Binance Futures leaderboard theo PnL (2,6 triệu USD/ngày) nhưng **ngoài top 500 theo ROI** — xếp hạng thay đổi theo metric. **[C]** — [Decrypt](https://decrypt.co/51812/crypto-futures-trader-makes-2-6-million-in-one-day)
- ChainCatcher 2025–2026: vị trí đầu bảng "smart money 30 ngày" đổi chủ thường xuyên; cựu leader quay lại mở vị thế ETH lớn sau 1 tháng nghỉ. **[C]** — [ChainCatcher](https://www.chaincatcher.com/en/article/2287321)
- Tồn tại API/scraper lấy dữ liệu leaderboard Binance (PnL/ROI/win rate theo 24h→all-time) nhưng **không có phân tích cohort nào được công bố**. **[D]** — [GitHub Binance-Futures-Leaderboard-API](https://github.com/Nunnito/Binance-Futures-Leaderboard-API)

**Base rate trader bán lẻ**
- KoinX (nền tảng thuế crypto Ấn Độ), ~7 lakh (~700.000) người dùng FY2024–25: chỉ **18,41%** trader futures có lãi, tổng lỗ 287 triệu USD > tổng lãi 261 triệu USD; toàn bộ người dùng (spot+futures) 50,91% lãi ròng / 49,09% lỗ ròng; **top 5% chiếm ~96% tổng lãi**; bài cũng trích ước tính ngành 70–80% người chơi derivatives lỗ. (Nguồn thứ cấp; báo cáo gốc KoinX không index.) **[C]** — [cryptonews.net](https://cryptonews.net/news/finance/33291178/)
- SEBI (Ấn Độ, equity F&O — không phải crypto): ~9/10 trader cá nhân lỗ; retail F&O lỗ ròng mọi năm FY22–FY26, tổng 40,36 tỉ USD/5 năm. **[A, khác thị trường]** — [Coin Edition](https://coinedition.com/indian-retail-fo-traders-lost-40-36b-in-5-years-with-losses-every-year/)
- Khảo sát CloseCross (nền tảng derivatives, tự chọn mẫu ≥ 5.000 USD/tháng): 83% nói có lãi — tự khai, thiên lệch. **[D]** — [Crowdfund Insider](https://www.crowdfundinsider.com/2021/12/183964-closecross-study-1-in-6-crypto-investors-lose-money/)
- Lambdafin tổng hợp: "10–20% consistent profitability", nhiều trader có win rate > 50% vẫn lỗ vì lệnh lỗ lớn hơn — **không nêu nguồn gốc**. **[D]** — [lambdafin](https://www.lambdafin.com/articles/what-percent-of-crypto-traders-are-profitable)
- Bond University (nghiên cứu social trading 25 triệu lệnh, 250.000 người, gồm cổ phiếu/crypto/fiat): người copy có xu hướng vào vị thế rủi ro hơn và lỗ. **[A, đa tài sản]** — [Bond University](https://bond.edu.au/news/fomo-wrecking-your-portfolio)
- Nghiên cứu on-chain về "FOMO copy trading": ~94% ví copy bị lỗ. **[C]** — [yellow.com](https://yellow.com/news/fomo-copy-trading-94-percent-wallet-losses)
- eToro (*Journal of Business Research*, 16.964 quan sát): copy trader kinh nghiệm có thể đạt kết quả tương tự leader **chỉ khi** follower tự quản rủi ro; *Management Science* 2020 (thí nghiệm): thấy thành công của người khác làm tăng rủi ro chấp nhận. (Qua tóm tắt Arkm.) **[A qua nguồn thứ cấp]** — [Arkm research](https://info.arkm.com/research/crypto-copy-trading-what-is-it-and-how-to-do-it)

**Những con số "thực tế" có thể trích được cho bot chạy dài**
- EMA walk-forward trên BTC, 21 tháng OOS, phí 0,1%: return ≈ buy-and-hold, drawdown thấp hơn; kết hợp B&H giảm 50% drawdown. **[A]** — [arXiv 2602.10785](https://arxiv.org/abs/2602.10785v1)
- Passivbot (user report): ~6,3% năm hóa/100 ngày vs BTC +16%; grid 1,5 năm: ~+30% BTC, ~0% ETH. **[C]** — [Gainium review](https://gainium.io/review/passivbot)
- Bitsgap: median return/bot 0,01–1,76%, mỗi bot chạy 2–10 ngày. **[B]** — [Bitsgap H1 2026](https://bitsgap.com/blog/what-actually-worked-in-2026)
- Alpha Arena (LLM, 2–7 tuần, tiền thật): model thắng +22,3% với win rate 30,2%, 43 lệnh; 4/6 lỗ 31–63%. **[C]** — [Buildix](https://www.buildix.trade/blog/nof1-alpha-arena-lessons-ai-trading-byok-strategy-advisor-2026)
- Pionex martingale backtest 15 tháng bull: MDD −52,84%. **[B]** — [Webot help](https://intercom.help/webot/en/articles/14119846-martingale-dca-bot-standard-mode)

### Inferences
- Khoảng cách "97% lead có lãi cá nhân" ↔ "43,61% mang lãi cho follower" cho thấy leaderboard **không phải** track record đã xác minh: PnL cá nhân có thể dương nhờ vào trước, nhờ vốn riêng, nhờ chọn cửa sổ 7/30/90 ngày; con số có ý nghĩa cho người copy là PnL của follower.
- Vì các sàn chỉ hiển thị cửa sổ ≤ 90 ngày (Bybit) hoặc tối đa 360D (Binance) và không có nghiên cứu cohort, **không thể** đưa base rate "x% lead trader còn lãi sau 6–12 tháng" có nguồn. Bằng chứng gián tiếp (xếp hạng đổi chủ liên tục, "top lead biến mất" sau 9/10/2025, 94% ví FOMO lỗ, 18% futures trader lãi) gợi ý tỉ lệ sống sót thấp.
- Mức "thực tế" an toàn để đặt kỳ vọng cho bot futures bán lẻ, suy từ nguồn [A] duy nhất: **return ≈ buy-and-hold BTC, MDD ≈ 50% của B&H**, sau phí 0,1%; mọi claim vượt xa mức này đều thuộc nhãn [C]/[D] hoặc cửa sổ < 3 tháng.
- Win rate không phải chỉ số định danh: 30% (Alpha Arena winner) có lãi, 99,99% (martingale) có thể cháy. Profit factor và MDD mới là thứ cần so.

### Gaps
- Không có nguồn nào công bố **profit factor** cho bot/lead trader crypto chạy ≥ 1 năm.
- Không có phân tích cohort/survivorship nào trên Binance/Bybit leaderboard được công bố (chỉ có công cụ scrape).
- Nghiên cứu YieldFund gốc không tìm thấy; chỉ có bản KuCoin đăng lại, số gộp mâu thuẫn nội bộ.
- Báo cáo gốc KoinX không index; con số 18,41% chỉ có qua báo thứ cấp.
- Không tìm thấy "Myfxbook-like" cho crypto bot với track record đã xác minh (verified) nhiều năm.
- Không tìm thấy thống kê chính thức từ Binance/Bybit về tỉ lệ lead trader có lãi.

---

## Câu hỏi 4 — Bộ luật nào đủ đơn giản để port vào simulator TypeScript ~200 dòng và tái kiểm trên dữ liệu Binance USDⓈ-M (1d/4h/1h/15m)?

### Takeaway
Có 6 bộ luật với tham số đầy đủ trong nguồn, mỗi bộ chỉ cần 1–3 chỉ báo và một cơ chế thoát: SMA 50/200 crossover (Jesse), Bollinger %B triple-barrier và MACD+BB triple-barrier (Hummingbot), grid hình học n=6 có/không reset (Chen et al.), martingale DCA 1-1-2-4 (Pionex), và EMA walk-forward (Mroziewicz–Ślepaczuk). Khi tái kiểm, phải chạy kèm phí round-trip 0,1% **và** kịch bản 0,4%, tính liquidation ở ~100/leverage %, và báo cáo median thay vì mean.

### Cited Findings
- **SMA crossover (Jesse SMACrossover)**: SMA200 chậm, SMA50 nhanh; long khi nhanh > chậm, short khi ngược lại; size = toàn bộ số dư trừ phí. **[D]** — [PyPI jesse](https://pypi.org/project/jesse)
- **Bollinger %B triple-barrier (Hummingbot `bollinger_v1`)**: BB(100, 2.0); long khi %B < 0,3, short khi %B > 0,7; thoát: SL 1%, TP 3%, time limit 6 h, trailing kích hoạt 0,8% / delta 0,4%; cooldown 15 s. **[D]** — [Hummingbot V2 examples](https://hummingbot.org/strategies/v2-strategies/examples/)
- **MACD + BB triple-barrier (Hummingbot `macd_bb_v1`)**: MACD(21, 42, 9) + BB(100, 2.0) ngưỡng 0,3/0,7; SL 1%, TP 6%, time limit 24 h, trailing 1%/0,4%; nến 3m (có thể đổi 15m/1h). **[D]** — [Hummingbot V2 examples](https://hummingbot.org/strategies/v2-strategies/examples/)
- **Mean-reversion grid (Hummingbot `dman_v3`)**: BB(200, 3.0); 5 mức lệnh, spread đầu 1,0 và bước 0,2 (tỉ lệ theo giá trị BB); SL 20%, TP 6%, time limit 3 ngày, trailing 1%/0,3%; nến 30m. **[D]** — [Hummingbot V2 examples](https://hummingbot.org/strategies/v2-strategies/examples/)
- **Grid hình học truyền thống và DGT (Chen et al.)**: n = 6 grid (7 mức), tỉ lệ k không đổi giữa các mức; vốn M chia M·(m/n) mua coin và M·((n−m)/n) giữ USDT với m = số mức trên giá vào; phí 0,0008/lệnh; BTC range 10.000–80.000; vượt biên trên → hết coin, thủng biên dưới → full coin; DGT = reset grid quanh giá mới khi chạm biên. **[A]** — [arXiv 2506.11921 HTML](https://arxiv.org/html/2506.11921v1)
- **Martingale DCA (Pionex Standard Mode)**: vốn chia 8 phần với 3 safety order; mua 1, 1, 2, 4 phần tại giá vào, −d%, −2d%… (price scale d); hoặc multiplier 1,5×; TP x% trên giá trung bình → bán toàn bộ, mở vòng mới; SL tùy chọn theo % tổng lỗ. **[B]** — [Pionex.US help](https://intercom.help/pionexus/en/articles/14319693-martingale-dca-bot-standard-mode)
- **EMA walk-forward**: chiến lược EMA trên BTC 1–60 phút; train 19 tháng / test 21 tháng; 81 tổ hợp cửa sổ 1–28 ngày; phí 0,1%; hòa vốn ~0,4%. **[A]** — [arXiv 2602.10785](https://arxiv.org/abs/2602.10785v1)
- Quy tắc liquidation futures ≈ 100/leverage (%) để mô phỏng cháy tài khoản. **[C]** — [redlib r/KuCoinTradingBot](https://redlib.ssps.io/r/KuCoinTradingBot/comments/1h9sirq/fut_martingale_liq_price)
- Bitsgap: báo cáo median vì mean bị kéo bởi vài bot thắng lớn (mean/median 4,6–14,2×); liquidation định nghĩa mất ≥ 90% margin. **[B]** — [Bitsgap H1 2026](https://bitsgap.com/blog/what-actually-worked-in-2026); [Bitsgap spot vs futures](https://bitsgap.com/blog/spot-vs-futures-grid-bot-what-backtests-show)
- Checklist chống win-rate giả: so sánh average trade với max drawdown; cảnh giác TP nhỏ/SL xa; không dùng leverage trong engine backtest để "làm đẹp"; xem đủ net profit, win rate, MDD, profit factor, số lệnh, average trade %. **[C]** — [TradingView Fake Strategy](https://my.tradingview.com/script/ekQPU4LF-Fake-Strategy); [Kotak backtesting dos and don'ts](https://www.kotakneo.com/stockshaala/trading-view/backtesting-dos-and-donts-pine-script/)

### Inferences
- Thứ tự ưu tiên port (theo độ đơn giản và giá trị tái kiểm): (1) SMA 50/200 và EMA walk-forward (benchmark "có thắng B&H không?"); (2) Bollinger %B triple-barrier (đại diện nhóm mean-reversion có SL — kiểm tra xem SL 1%/TP 3% có sống nổi với phí 0,1% trên 15m không); (3) grid n=6 ± DGT reset (tái hiện "kỳ vọng 0/âm có phí"); (4) martingale 1-1-2-4 (tái hiện win rate > 90% nhưng đuôi lỗ) — cố ý chạy qua giai đoạn 11/2021→11/2022 và 9–10/2025 để xem bag/liquidation.
- Với 15m/1h, các luật Hummingbot có SL 1% sẽ bị phí + trượt giá ăn phần lớn (round-trip 0,1% = 10% của SL); kỳ vọng từ nguồn [A] là không thắng B&H — simulator nên dùng để **bác bỏ** chứ không để tìm "chiến lược thắng".
- Vì mọi nguồn ngoài 2 bài arXiv đều là vendor/giai thoại, simulator TS chính là cách duy nhất để chuyển các claim [C]/[D] thành số [A] cho dự án Coin Radar.

### Gaps
- Luật chi tiết của các chiến lược Jesse khác (Donchian, TurtleRules, RSI2, DUAL_THRUST…) không có trong README; phải đọc mã nguồn từng thư mục.
- Chen et al. không công bố bảng số (chỉ hình) nên không có "đáp án" để so khớp simulator; chỉ so được định tính (grid có phí → âm; DGT giảm drawdown).
- Không có nguồn nào nêu trượt giá (slippage) thực tế trên Binance USDⓈ-M để tham số hóa; chỉ có ngưỡng hòa vốn 0,4% từ bài EMA.
- Hummingbot không công bố kết quả cho các tham số mẫu nên không biết chúng được chọn theo tối ưu hay chỉ là placeholder.
