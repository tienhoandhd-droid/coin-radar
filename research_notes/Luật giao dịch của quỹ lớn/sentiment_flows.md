# Sentiment, "smart money" and fund-flow indicators for crypto (Binance focus): predictive evidence and backtest data availability

Research date: 2026-10-20. Live checks against Binance and Alternative.me APIs were run on this date from this machine. Results are quoted below as "[live check 2026-10-20]".
Legend: **[VENDOR]** = vendor or marketing claim. **[IS]** = in-sample only, or OOS status not stated. **[OOS]** = out-of-sample result reported. **[NOT PEER-REVIEWED]** = working paper, preprint, blog or GitHub.

## Q1. Indicator-by-indicator: definition, where shown, evidence, professional use, data availability

### Takeaway
Most "sentiment" gauges (Fear & Greed, altseason) are built mostly from past price, volatility and momentum. The best 2026 evidence finds they react to returns rather than lead them, and they do not beat a historical-mean forecast out of sample. Of the flow and positioning series, USDT exchange inflows and funding/OI have the most academic support for predicting returns. Binance positioning ratios have no peer-reviewed evidence. The key practical finding is that Binance's REST positioning endpoints keep only 30 days of history. Binance's free public archive (data.binance.vision "metrics") holds the same ratios at 5-minute resolution back to 2020-09-01, so a 2025–2026 backtest is fully feasible for free.

### Cited Findings

**1. Fear & Greed Index (FGI)**
- Alternative.me FGI covers Bitcoin only, on a 0–100 scale. Weights: volatility 25% (vs 30/90-day averages, including max drawdown), momentum/volume 25%, social media 15%, surveys 15% (currently paused), BTC dominance 10%, Google Trends 10%. The page does not say how the paused 15% survey weight is reallocated. — [Alternative.me](https://alternative.me/crypto/fear-and-greed-index/)
- Construction note: about 50%+ of the weights are direct functions of past price, volatility and volume. Dominance is also price-derived. — inference from the weights in [Alternative.me](https://alternative.me/crypto/fear-and-greed-index/)
- Alternative.me API: `GET https://api.alternative.me/fng/?limit=0` returns full history. `format=json|csv`, daily values. Commercial use is allowed with attribution "right next to the display of the data". — [Alternative.me](https://alternative.me/crypto/fear-and-greed-index/)
- [live check 2026-10-20] `limit=0` returned 3,180 daily points from **2018-02-01** to 2026-10-20, free, no API key.
- CoinMarketCap FGI is described as covering a broad market rather than BTC only. It uses top-10 coin price momentum and BTC/ETH volatility, among other inputs. — [CryptoSlate comparison](https://cryptoslate.com/how-different-bitcoin-fear-greed-indexes-calculate-market-sentiment/) (secondary source)
- CMC API paths: `GET /v3/fear-and-greed/historical` and `GET /v3/fear-and-greed/latest`. — [CMC Global Metrics reference](https://coinmarketcap.com/api/documentation/pro-api-reference/global-metrics/)
- [live check 2026-10-20] The historical endpoint without a key returned HTTP 401, so it needs an API key. The plan tier and history depth were not confirmed (see Gaps).
- **Which version Binance shows: NOT CONFIRMED.** Binance's own explainer lists Alternative.me, CoinMarketCap and Coinglass as separate publishers whose readings can differ on the same day. It does not name the source of its own widget. — [Binance Square post 43031](https://www.binance.com/en/square/post/43031)
- **Evidence, Szeberényi & Kovács, *Digital Finance* 8(3), 2026** (peer-reviewed):
  - Sample: 2,945 daily observations, 2018-02-01 to 2026-02-27.
  - A +1 SD in FGI is associated with +0.14 pp higher 1-day forward BTC return; the moving-block confidence interval stays positive.
  - A +1 SD in FGI is associated with +0.88 pp higher 7-day forward return; the interval includes zero.
  - **[OOS] Expanding-window forecasts do NOT beat the historical-mean benchmark.**
  - Extreme Fear persists to the next day 82.0% of the time; Greed persists 80.0%.
  - The authors conclude FGI is a "market-state"/risk-interpretation variable, not a standalone trading rule.
  - Note: the in-sample sign is positive (greed → higher next-day return), i.e. trend-confirming, not contrarian.
  - Source: [RePEc/IDEAS abstract](https://ideas.repec.org/a/spr/digfin/v8y2026i3d10.1007_s42521-026-00218-y.html)
- **Evidence, "Do bitcoin returns move sentiment? Evidence from the crypto fear & greed index"** (ScienceDirect, 2026, *Finance Research Open*):
  - Per a search-result summary: 2018–2025 daily data, small VAR.
  - FGI changes do **not** Granger-cause BTC returns, and offer **no OOS forecasting gain**.
  - Returns **do** Granger-cause FGI changes.
  - Caveat: the full text returned HTTP 403, and the author name ("Gessie") could not be verified by a second search. Treat the details as unverified. — [ScienceDirect S305070062600006X](https://www.sciencedirect.com/science/article/pii/S305070062600006X)
- Evidence, Łęt et al. (2023 Springer chapter): contrarian strategies based on the crypto FGI "may generate significantly better results" than passive investment. **[IS]**; no numbers seen in the abstract. — [Springer](https://link.springer.com/chapter/10.1007/978-3-031-36286-6_16)
- Evidence, Cavalheiro, Vieira & Thue, *Review of Behavioral Finance* 16(5), 2024, pp. 819–835: Granger tests of FGI on BTC/ETH returns. Results not visible (paywall). — [Emerald / IDEAS](https://ideas.repec.org/a/eme/rbfpps/rbf-08-2023-0224.html)
- A news-sentiment paper (not FGI itself) finds OOS excess returns generally unpredictable. Forecasts become significant only when split into greed vs fear regimes, i.e. conditional predictability. — [ScienceDirect S3050700625000672](https://www.sciencedirect.com/science/article/pii/S3050700625000672)
- Another paper (ScienceDirect 2023, "daily updated and accessible predictor") reports significant in-sample and OOS predictive power at 1-day to 1-week horizons across coins. This is a different predictor; the abstract seen does not say it is the FGI. — [ScienceDirect S154461232300778X](https://www.sciencedirect.com/science/article/abs/pii/S154461232300778X)

**2. Altcoin Season Index, BTC dominance, ETH/BTC**
- Blockchaincenter definition (as described by secondary sources): "Altcoin season" means **75% of the top 50 coins outperformed BTC over the last 90 days**. Stablecoins and wrapped tokens are excluded. A reading of 25 or below means "Bitcoin season". Variants exist (top 100, top 20). — [Mudrex](https://mudrex.com/learn/altcoin-season-index/), [Apify actor description](https://apify.com/gochujang/altcoin-season-index) (secondary; the official Blockchaincenter page was not retrieved)
- CMC API paths: `GET /v1/altcoin-season-index/latest` and `GET /v1/altcoin-season-index/historical`. Requires an API key; plan tier not confirmed. — [CMC Global Metrics reference](https://coinmarketcap.com/api/documentation/pro-api-reference/global-metrics/)
- By construction, the index is a 90-day trailing cross-sectional relative-momentum measure (alts vs BTC). It is pure past-price information. — inference from the definition above
- **No peer-reviewed study was found that tests the Altcoin Season Index, BTC dominance or ETH/BTC as a forward-return predictor.** See Gaps.
- Related academic evidence: strong cross-cryptocurrency return predictability using Binance data. A long-short portfolio formed on lagged returns of other coins earns sizable OOS returns after transaction costs. Relative-momentum effects of this kind are what altseason gauges proxy. — [ScienceDirect, *J. Econ. Dynamics & Control* 2024](https://www.sciencedirect.com/science/article/abs/pii/S0165188924000551)

**3. Binance USDⓈ-M futures positioning data**
- Official endpoints. Base URL is `https://fapi.binance.com`; all are weight 0, `limit` default 30 / max 500, with optional `startTime`/`endTime`. — [Binance docs: Open Interest Statistics](https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Open-Interest-Statistics)
  - `GET /futures/data/openInterestHist`:
    - Fields: `sumOpenInterest`, `sumOpenInterestValue`, `CMCCirculatingSupply`, `timestamp`.
    - Docs quote: "Only the data of the latest 1 month is available."
    - IP rate limit: 1000 requests / 5 min.
  - `GET /futures/data/globalLongShortAccountRatio`:
    - Fields: `longShortRatio`, `longAccount`, `shortAccount`.
    - History: "latest 30 days".
  - `GET /futures/data/basis` (pair, contractType): latest 30 days.
  - Shared `period` enum: 5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, plus one value hidden in the rendered page (the live test below shows `1d` works).
- [live check 2026-10-20] All five endpoints exist and enforce the 30-day cap:
  - Endpoints tested: `topLongShortAccountRatio`, `topLongShortPositionRatio`, `globalLongShortAccountRatio`, `takerlongshortRatio`, `openInterestHist`.
  - With `period=1d&limit=500`, each returned exactly **30 rows** (2026-09-21 → 2026-10-20; taker 2026-09-20 → 10-19).
  - A `startTime` 40 days back was rejected with `{"code":-1130,"msg":"parameter 'startTime' is invalid."}`.
  - **The ~30-day history limit is confirmed.**
- **Free full history exists via the Binance public data archive** [live check 2026-10-20]:
  - URL pattern: `https://data.binance.vision/data/futures/um/daily/metrics/{SYMBOL}/{SYMBOL}-metrics-YYYY-MM-DD.zip`.
  - The S3 listing for BTCUSDT starts at **2020-09-01**. Files for 2021-12-01, 2025-01-01 and 2026-10-18 all returned HTTP 200.
  - CSV columns: `create_time, symbol, sum_open_interest, sum_open_interest_value, count_toptrader_long_short_ratio, sum_toptrader_long_short_ratio, count_long_short_ratio, sum_taker_long_short_vol_ratio`.
  - **5-minute rows** (288 per day + header).
  - Mapping (inferred from names): `count_toptrader…` = top trader accounts ratio; `sum_toptrader…` = top trader positions ratio; `count_long_short_ratio` = global account ratio; `sum_taker…` = taker buy/sell volume ratio.
  - The archive URL is per symbol; coverage for each altcoin starts at its listing date (not checked symbol by symbol).
- [live check 2026-10-20] An S3 listing of `data/futures/um/daily/liquidationSnapshot/` returned **empty**. Binance does not appear to publish USDⓈ-M liquidation history in the archive.
- Binance "Smart Money" product (UI, not API):
  - "Smart Signal" inside Futures → Smart Money shows, per USDⓈ-M contract, whether top traders/whales are net long or short, plus net volume, average entry, live L/S ratio and unrealized PnL.
  - Smart Money evolved from the Futures Leaderboard. — [FX News Group](https://fxnewsgroup.com/forex-news/cryptocurrency/binance-futures-introduces-smart-signal-feature/) (secondary)
  - "Smart Money Signal Auto-Copy" was reported 2026-07-27. It mirrors selected top traders' USDT-M trades from 10 USDT; the selection method is not disclosed. — [Traders Union](https://tradersunion.com/news/brokers-news/show/2803351-binance-debuts-auto-copy-trading-feature/) (secondary)
  - No official API or history for Smart Signal was found.
- **Evidence on the L/S ratios: no peer-reviewed or arXiv study was found in this session that tests Binance top-trader, global or taker ratios as return predictors.** This is a search result, not a citation; see Gaps. The nearest related work is listed below.
- Related evidence on taker flow imbalance: a CSI 300 index-futures order-flow study finds predictability concentrated below 2 minutes, which is a microstructure horizon, not 1D–1W. — [arXiv 2505.17388](https://arxiv.org/pdf/2505.17388)
  - A search summary also mentioned an arXiv paper on cross-exchange trade imbalance: imbalance is roughly proportional to future returns, with better prediction on Bybit than OKEx, and Binance not studied. Its URL was not captured, so treat this as unverified.
- Funding/OI: Palazzi, Júnior & Klotzle (SSRN) report that "crypto-native valuation and positioning variables, in particular MVRV, **funding rates and open interest**, predict Bitcoin returns in every regime". Macro variables matter mainly in 2022–23. **[NOT PEER-REVIEWED]**; abstract only; OOS design not verified. — [SSRN 6725492](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6725492)
- Crypto carry (funding/basis) Sharpe fell from 6.45 (2020–2025) to 4.06 from 2024, and turned negative in 2025. This shows crowding/decay of positioning-related premia. — [arXiv 2510.14435](https://arxiv.org/pdf/2510.14435)
- Funding rates themselves are forecastable OOS (Binance, Bybit) with double-autoregressive models vs a no-change benchmark. This is forecasting funding, not returns. — [Inan, SSRN 5576424](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5576424)

**4. On-chain and fund flows**
- **Exchange netflows (BTC/ETH)**: Chi, Chu & Hao, arXiv 2411.06327 (v2 Sept 2025), 2017–2023, 1–6h intervals. **[NOT PEER-REVIEWED]**; the abstract gives no coefficients or OOS numbers.
  - **BTC net inflows to exchanges generally do NOT predict BTC returns**, except at the 4h horizon. They are negatively associated with BTC volatility at all intraday intervals.
  - **ETH net inflows negatively predict ETH returns** and volatility at all intraday intervals (the "deposit to sell" story).
  - **USDT net inflows to exchanges positively predict BTC and ETH returns** at multiple intervals.
  - Source: [arXiv 2411.06327](https://arxiv.org/abs/2411.06327)
- **Stablecoin supply/issuance**:
  - Griffin & Shams: the 1% of hours with the largest Tether flows were associated with >50% of BTC's compounded return in the 2017 boom. Also a negative month-end pattern in high-issuance months. — [Quantpedia summary](https://quantpedia.com/a-very-influential-paper-about-tether-bitcoin-relationship-manipulation/)
  - Wei (2018), daily VAR: no evidence that Tether grants cause subsequent BTC returns; issuance raises volume only. — [Bitcoin Magazine summary](https://bitcoinmagazine.com/markets/new-study-argues-tether-wasnt-used-prop-bitcoin-price)
  - Blockchain Research Lab: abnormal returns around issuance events, but issuance **size** is not significant. — [BRL WP 11](https://www.blockchainresearchlab.org/wp-content/uploads/2020/05/The_Influence_of_Stablecoin_Issuances_on_Cryptocurrency_Markets_BRL_Working_Paper_No_11.pdf)
  - A 2025 review attributes the conflict to intraday on-chain data vs daily data. — [arXiv 2507.13883](https://arxiv.org/pdf/2507.13883)
- **Whale transactions**: no peer-reviewed 1D–1W return-predictability evidence was found in this session (see Gaps).
- **US spot BTC ETF flows**:
  - Lim (SSRN): flows explain **21% of daily return variation (t = 8.99)** and predict next-day returns (Newey-West **t = 3.12**). Granger causality is bidirectional, with no reversal at 1–20 days. **[NOT PEER-REVIEWED]**. — [SSRN 6592830](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6592830)
  - Fabus, Vartiak, Stalmasekova & Kicova (SSRN) **contradict Lim**:
    - The flow→price effect depends on timestamp alignment. Same-day raw pairing gives a large coefficient.
    - Aligning returns to the 24h after the ETF close cuts it to **1.67 (HAC p = 0.007, adj. R² = 0.036)**.
    - A window starting after flows are public shows **no positive association**.
    - Prior BTC returns predict flows under every convention. Lagged flows predict returns only marginally.
    - Source: [SSRN 7545019](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7545019)
  - *Economics Letters* (2025), one year of spot ETPs: a 3.4% BTC price change corresponds to a 0.2% net fund flow, i.e. flows chase price. — [ScienceDirect S0165176525001417](https://www.sciencedirect.com/science/article/pii/S0165176525001417)
  - Guliyev & Ahmadova (*Ledger*, 2025), Jan 2024–May 2025: cointegration of ETF assets with price at the 10% level only (long-run levels, not short-horizon prediction). — [Ledger](https://ledger.pitt.edu/ojs/ledger/article/view/393)
  - A GitHub analysis of 686 trading days found raw flows have "almost no" next-day predictive power, and residual (unexpected) flows give a small signal. **[NOT PEER-REVIEWED]**. — [GitHub](https://github.com/azusayamaguchi/btc-etf-residual-flow)
- ETF flow data:
  - Farside publishes daily US spot BTC (and ETH) ETF flow tables in US$m, free to view, and warns that figures contain estimates. — [Farside](https://farside.co.uk/?p=997)
  - SoSoValue: no official API terms were found. A paid third-party Apify scraper claims about 300 days of history per ETF type. — [Apify](https://apify.com/gochujang/crypto-etf-flow-tracker)
  - Coinglass offers an `etf-flows-history` API endpoint (paid key). — [Coinglass docs](https://docs.coinglass.com/v3.0/reference/etf-flows-history)

**5. Liquidations**
- The Binance stream `{symbol}@forceOrder` (also an all-market stream) updates every 1000ms. Docs quote: "For each symbol, only the latest one liquidation order within 1000ms will be pushed as the snapshot". The stream therefore **undercounts** liquidations during cascades. — [Binance docs](https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-market-streams/All-Market-Liquidation-Order-Streams)
- No REST history of market-wide liquidations was found. The data.binance.vision `liquidationSnapshot` prefix for UM futures is empty [live check 2026-10-20].
- Garcia Seuma (arXiv 2607.27070, 2026): across 7 BTC perp liquidation cascades from 2022 to 2025 (including October 2025), no early-warning variable (variance, autocorrelation) behaves the same way across events. This is evidence **against** a reproducible pre-cascade signal. **[NOT PEER-REVIEWED]**. — [arXiv 2607.27070](https://arxiv.org/pdf/2607.27070)
- Hyperliquid post-shock study: quoted spreads returned to ≤1.2× pre-event levels within 23 days, but inside depth stayed contracted. This covers liquidity, not price direction. — [JFDA](https://journals.lincoln.ac.nz/index.php/JFDA/article/view/1395)
- Amberdata argues liquidations "provide valuable insights" for short-term moves. **[VENDOR]**, no test shown. — [Amberdata blog](https://blog.amberdata.io/liquidations-on-perpetual-futures-contracts-as-a-leading-indicator-of-market-movement)

### Inferences
- For a 2025–2026 Binance USDⓈ-M backtest, the free data stack is complete for:
  - FGI (Alternative.me, daily since 2018);
  - OI, top-trader account/position ratios, global ratio and taker ratio (data.binance.vision metrics, 5-min since 2020-09 for BTCUSDT);
  - ETF flows (Farside, manual scrape);
  - altseason (can be **recomputed from Binance klines** as "% of top-N USDT pairs beating BTC over 90 days", which avoids CMC's key requirement).
- Gaps in free data: CMC FGI/altseason history (API key needed); CryptoQuant/Glassnode exchange netflows (paywalled at the needed resolution; not verified this session); liquidation history.
- Because FGI and altseason are deterministic functions of past price, volatility and volume, any backtest must include past returns, volatility and momentum as controls. Otherwise the indicator's "edge" is likely just repackaged momentum or volatility.

### Gaps
- Which F&G version the Binance UI shows: not stated in any Binance source found.
- CMC FGI/altseason API: plan tier, credit cost and history start not retrieved (the endpoint pages did not render).
- The official Blockchaincenter methodology page was not retrieved; the definition comes from secondary sources.
- CryptoQuant and Glassnode API pricing and free-tier history depth for exchange netflows were not checked in this session (tool-call budget).
- The `/fapi/v1/fundingRate` history depth was not verified in this session.
- No peer-reviewed tests were found for whale-transaction alerts, BTC dominance or ETH/BTC as 1D–1W predictors.

## Q2. Which indicators have rigorous 1D–1W predictive evidence after controlling for past returns? Do they add information beyond price?

### Takeaway
None of the retail-facing sentiment gauges has robust OOS evidence of adding information beyond price at 1D–1W. FGI is "caused" by returns, not the reverse, and its OOS forecasts lose to the historical mean. The strongest candidates are flow variables:
- USDT exchange inflows (positive);
- ETH exchange inflows (negative);
- spot ETF flows (contested: the result disappears with correct timestamp alignment);
- funding/OI (working-paper evidence).

### Cited Findings
- FGI: +1 SD → +0.14 pp (1D) and +0.88 pp (7D, CI includes 0). OOS expanding-window forecasts do not beat the historical mean. — [Szeberényi & Kovács 2026](https://ideas.repec.org/a/spr/digfin/v8y2026i3d10.1007_s42521-026-00218-y.html)
- FGI changes do not Granger-cause returns, while returns Granger-cause FGI changes; no OOS gain (details partly unverified). — [ScienceDirect 2026](https://www.sciencedirect.com/science/article/pii/S305070062600006X)
- Over half of Alternative.me FGI weight is volatility, momentum and volume. — [Alternative.me](https://alternative.me/crypto/fear-and-greed-index/)
- USDT exchange inflows positively predict BTC/ETH returns intraday (1–6h); BTC inflows do not, except at 4h. — [arXiv 2411.06327](https://arxiv.org/abs/2411.06327)
- ETF flows predict next-day returns (t = 3.12) per Lim. — [SSRN 6592830](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6592830); contradicted by: no positive association once the return window starts after flows are public — [SSRN 7545019](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7545019)
- Funding rates and OI predict BTC returns "in every regime" (abstract only). — [SSRN 6725492](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6725492)

### Inferences
- The ETF-flow controversy is a look-ahead problem. Farside/SoSoValue flows for day *t* are published after the US close. A backtest must therefore only trade from roughly the publication time onward. Same-day pairing inflates results.
- The intraday horizons in the on-chain flow paper (1–6h) may not carry over to 1D–1W.

### Gaps
- No study was found that runs Binance L/S ratios against forward returns while controlling for past returns.

## Q3. Are extreme readings contrarian? Numbers.

### Takeaway
The evidence does not support a clean contrarian rule for FGI. The in-sample sign is positive (greed → slightly higher next-day returns, i.e. trend-confirming), extreme states are highly persistent (about 80% day-to-day), and OOS gains are nil. Claims that contrarian FGI strategies beat buy-and-hold come from in-sample studies. No rigorous numbers were found for extreme L/S ratios.

### Cited Findings
- Extreme Fear persists next day 82.0% of the time; Greed 80.0%. The 1D slope is positive. — [Szeberényi & Kovács 2026](https://ideas.repec.org/a/spr/digfin/v8y2026i3d10.1007_s42521-026-00218-y.html)
- Contrarian FGI strategies "may generate significantly better results" than passive investment. **[IS]**. — [Łęt et al. 2023](https://link.springer.com/chapter/10.1007/978-3-031-36286-6_16)
- Greed/fear regime split makes otherwise-unpredictable OOS returns significant (news sentiment). — [ScienceDirect S3050700625000672](https://www.sciencedirect.com/science/article/pii/S3050700625000672)
- ETF flows show no reversal at 1–20 days after flows. — [SSRN 6592830](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6592830)

### Inferences
- Persistence of about 80% means a "buy extreme fear" rule fires in clusters, and its entries overlap with drawdowns. It behaves like a mean-reversion bet on volatility rather than an independent signal.

### Gaps
- No rigorous forward-return numbers were found for extreme Binance L/S readings (e.g. global ratio > 2 or < 0.7). Blog/vendor claims were not collected because they are untested.
- The extreme-state forward returns in Szeberényi & Kovács are in the full paper, not the abstract.

## Q4. How quant funds and bots use them (filter, sizing, signal)

### Takeaway
No primary disclosure from a named quant fund was found. The available evidence supports using these indicators as **regime/risk filters or sizing inputs** rather than entry signals. The FGI authors explicitly recommend "risk interpretation… not a standalone trading rule".

### Cited Findings
- FGI should be framed as a market-state variable, not a buy/sell signal. — [Szeberényi & Kovács 2026](https://ideas.repec.org/a/spr/digfin/v8y2026i3d10.1007_s42521-026-00218-y.html)
- Positioning-premium decay: carry Sharpe fell from 6.45 to 4.06 and turned negative in 2025. — [arXiv 2510.14435](https://arxiv.org/pdf/2510.14435)
- Binance's own product packages top-trader net positioning as "Smart Signal" and offers auto-copy. This shows retail-facing use as a follow (not fade) signal. — [FX News Group](https://fxnewsgroup.com/forex-news/cryptocurrency/binance-futures-introduces-smart-signal-feature/); [Traders Union](https://tradersunion.com/news/brokers-news/show/2803351-binance-debuts-auto-copy-trading-feature/)

### Inferences
- Rules such as "altcoin longs only when altseason > X" are effectively cross-sectional momentum filters. Cross-crypto lagged-return predictability supports this family. — [JEDC 2024](https://www.sciencedirect.com/science/article/abs/pii/S0165188924000551)
- "Fade the crowded retail L/S ratio" is untested in the literature found and should be backtested with return and volatility controls using the data.binance.vision metrics files.

### Gaps
- No published thresholds or sizing rules from named funds or bots were found in this session.

## Q5. Data practicality for a 2025–2026 Binance USDⓈ-M backtest

### Takeaway
Free and sufficient: Alternative.me FGI (daily from 2018) and Binance metrics archive (5-min OI + 3 L/S ratios + taker ratio from 2020-09). Not free or not available: Binance REST positioning history beyond 30 days, liquidation history, CMC indices without a key, and high-resolution CryptoQuant/Glassnode netflows (unverified).

### Cited Findings
- The REST positioning endpoints are capped at 30 days, and older `startTime` gives error -1130. — [live check 2026-10-20]; [Binance docs](https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Open-Interest-Statistics)
- The metrics archive is 5-min, starts 2020-09-01 for BTCUSDT, and has 8 columns (listed above). — [live check 2026-10-20 on data.binance.vision](https://data.binance.vision/data/futures/um/daily/metrics/BTCUSDT/BTCUSDT-metrics-2025-01-01.zip)
- FGI: 3,180 daily points from 2018-02-01, free. — [live check](https://api.alternative.me/fng/?limit=0)
- The liquidation stream sends only one order per symbol per second; there is no archive. — [Binance docs](https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-market-streams/All-Market-Liquidation-Order-Streams)
- ETF flows are on Farside (free table, estimates). — [Farside](https://farside.co.uk/?p=997)

### Inferences
- Recommended pipeline: bulk-download `metrics` zips per symbol, plus klines from data.binance.vision, plus FGI JSON, plus a Farside scrape. Liquidations would have to be self-recorded going forward from the websocket, and remain a lower bound.

### Gaps
- Free-tier depth of CryptoQuant/Glassnode/CMC was not verified.
