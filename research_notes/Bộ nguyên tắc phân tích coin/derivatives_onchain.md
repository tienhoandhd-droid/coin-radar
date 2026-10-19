# Derivatives-market and on-chain indicators for Coin Radar: evidence and free API sources

Note on method: about 20 web searches/fetches, plus live `curl` probes of every endpoint listed, run on 2026-10-19 from this workstation, which has a **non-US IP**. Lines marked "[LIVE TEST]" are first-hand observations from those probes (HTTP status, fields, symbol counts) and have no external URL; the URL given is the endpoint itself. US/GitHub-Actions behaviour was NOT tested directly (see Gaps in section 7).

---

## 1. Perpetual funding rate: does extreme funding predict reversal or continuation? Thresholds and horizon

### Takeaway
The strongest peer-reviewed evidence (BIS "Crypto carry") finds that a **high futures premium/carry predicts future crashes** for BTC/ETH. The perp-spot gap is mean-reverting, co-moves across coins and is shrinking over time. Cross-sectional "funding as alpha" evidence for altcoins is mixed: one recent large-cap test finds no out-of-sample alpha, and the funding carry trade's Sharpe turned negative in 2025. No peer-reviewed source gives a universal numeric "extreme" threshold. Exchange default funding is 0.01%/8h (the interest component), so multiples of that are the practical reference point.

### Cited Findings
- Perpetuals have no expiry, so nothing forces convergence to spot. Longs pay shorts a funding rate tied to the perp-spot gap. Crypto deviations are larger than in traditional FX, **co-move across currencies, and decline over time**, and an implied arbitrage strategy earns "high Sharpe ratios". The abstract gives no numbers. — [He, Manela, Ross, von Wachter, "Fundamentals of Perpetual Futures", arXiv 2212.06888](https://arxiv.org/abs/2212.06888v6)
- Crypto carry (futures-spot basis) averages **>10% p.a.**, reaching **up to 60% p.a.** It is driven by trend-chasing small investors seeking leveraged upside in booms, plus scarce arbitrage capital. **High carry predicts future price crashes** and goes with a rise in the price of crash insurance. Cash-and-carry is risky because margins spike and positions are liquidated in drawdowns. — [BIS WP 1087, Schmeling, Schrimpf & Todorov, "Crypto carry" (2023, rev. Oct 2025)](https://www.bis.org/publ/work1087.htm)
- Carry-trade profit is mostly driven by the funding rate. The Sharpe ratio falls to 4.06 and **turns negative in 2025**. — [arXiv 2510.14435 "Cryptocurrency as an Investable Asset Class: Coming of Age"](https://arxiv.org/html/2510.14435v2)
- **Null result:** cross-sectional long-short screening with OHLCV + funding-rate signals on 10 large-cap Binance perps finds **no exploitable alpha at an 8h horizon**, and the naive model has negative net Sharpe. — [Fayez Junior, SSRN 6701738](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6701738)
- Of 170 perp return predictors (basis, momentum, liquidity, size, volatility), **63 sorted strategies earn significant returns including funding fees**. A two-factor model (log basis + a price-volume factor) largely explains them, so basis is a priced signal. (Abstract via search summary; the SSRN page returned 403 to fetch.) — [Cao, Luo, Cheng, Dong, "Anatomy of Cryptocurrency Perpetual Futures Returns", SSRN 6365329](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6365329)
- Funding rates themselves are forecastable: double-autoregressive models beat no-change out of sample for BTC perps on Binance/Bybit, though predictability varies over time. — [Inan, "Predictability of Funding Rates", SSRN 5576424](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5576424)
- Funding-rate spreads across exchanges are strongly autocorrelated: large spreads persist, and adjustment to shocks is slow. — [Zhivkov, Mathematics 14(2):346 (2026)](https://www.mdpi.com/2227-7390/14/2/346)
- 200 Binance perps share a funding "template" without shared feedback strength, which affects price-gap correction. — [He, Wang, Zhang, SSRN 6185958](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6185958)
- [LIVE TEST] Binance BTCUSDT `premiumIndex` returned `interestRate":"0.00010000"` (0.01% per 8h) with `lastFundingRate` 0.0001. Recent settled rates were 0.0000584 and 0.0000496. OKX BTC-USDT-SWAP `funding-rate` returns `maxFundingRate":"0.00375"` (cap 0.375%/period) plus `minFundingRate`, so caps are per-instrument and available via the API. — https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT ; https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP

### Inferences
- An evidence-based rule is **"funding/basis persistently far above baseline → crash/reversal risk up (risk flag, de-rate longs)"**, not "negative funding → buy". The BIS result is about high carry and crash risk. Symmetric "short squeeze" claims for deeply negative funding are practitioner folklore here: no source in this pass tested them.
- Practical threshold design (inference, not from literature): express funding as a multiple of the 0.01%/8h baseline, or as a z-score vs. the coin's own 30-day history. Use each instrument's API-reported max/min cap to normalize altcoins, which often hit caps. Annualize (rate × 3 × 365) to compare with the BIS ">10% avg, 60% extreme" carry range.
- Horizon: BIS-type crash prediction is a multi-day-to-weeks property, so it fits Swing mode (≤10d). The only short-horizon (8h) cross-sectional test is null, so treat funding as weak for Short-term mode.

### Gaps
- Exact regression horizons and magnitudes in BIS WP 1087 and in He-Manela (Sharpe values, sample): only abstracts were retrieved.
- No source found that tests extreme **negative** funding as a long signal for altcoins.
- Practitioner thresholds (e.g., ">0.05%/8h = overheated") were not found in a citable primary source, so none are listed.

---

## 2. Open interest (OI) changes combined with price

### Takeaway
The classic 4-quadrant table (OI↑+price↑ = new longs/"healthy trend", OI↑+price↓ = new shorts, and so on) is **practitioner folklore**. This pass found no peer-reviewed test of it. The documented, evidence-backed role of OI is as a **leverage/fragility gauge**: record OI before 10–11 Oct 2025 was followed by a ~30% OI wipe-out and record liquidations.

### Cited Findings
- 10–11 Oct 2025: about **$19bn liquidated, a record**, with up to ~90% longs. Futures OI fell ~30–31% (≈$220bn → $150bn per RockawayX). BTC −14%, ETH −19%, SOL briefly >−20%. — [Forklog](https://forklog.com/en/forced-liquidations-in-2025-surpass-150-billion/amp); [RockawayX Q4 2025](https://rockawayx.com/insights/quarterly-insights-q4-2025); [CoinGecko explainer](https://www.coingecko.com/learn/october-10-crypto-crash-explained)
- On that day BTC top-of-book depth shrank by **>90%** on key venues, and market makers widened spreads or withdrew. ADL triggered more often in less liquid markets. — [FTI Consulting](https://fticonsulting.com/insights/articles/crypto-crash-october-2025-leverage-met-liquidity)
- Exchange split of Oct-10 liquidations, per Galaxy Research as cited by a newsletter (secondary): Hyperliquid $10.08bn, Bybit $4.58bn, Binance $2.31bn. Hyperliquid triggered ADL for the first time in >2 years. — [Das Crypto newsletter](https://das-crypto-newsletter.beehiiv.com/p/crypto-leverage-is-built-different)
- Liquidations across 2025 surpassed $150bn. — [Forklog](https://forklog.com/en/forced-liquidations-in-2025-surpass-150-billion/amp)
- Binance `openInterestHist` keeps only the **latest 1 month** of history, and the docs say a period with no trades has no record and is omitted. — [Binance docs: Open Interest Statistics](https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Open-Interest-Statistics)

### Inferences
- A defensible scoring use is **OI/market-cap (or OI/24h volume) as a leverage ratio**, plus a fast rise in OI with elevated funding treated as a fragility/crash-risk flag. Binance's `openInterestHist` returns `CMCCirculatingSupply` [LIVE TEST], so OI/supply can be computed directly. Treat the 4-quadrant reading as a low-weight heuristic only.
- Because history is capped at 30 days, Coin Radar must **store its own OI snapshots** each 15-minute run if it wants longer baselines.

### Gaps
- No peer-reviewed study of the OI×price quadrant found in this pass.
- Coinglass-style aggregated liquidation data is not free via API (not verified in this pass).

---

## 3. Liquidations, long/short ratios (account vs position, top traders), taker buy/sell volume

### Takeaway
These are free on Binance, Bybit and OKX for most perps, but **this pass found no academic evidence of predictive power** for long/short ratios. Liquidation cascades are well documented as amplifiers in thin markets. Order-flow evidence (related to taker imbalance) exists at weekly frequency.

### Cited Findings
- Portfolios sorted on orthogonalized world **order flow** earn strong returns, especially at weekly frequency. This is the closest academic evidence for taker buy/sell imbalance. — [Journal of Financial Markets (2026), "Order flow and cryptocurrency returns"](https://www.sciencedirect.com/science/article/pii/S1386418126000029)
- Liquidation loss is discontinuous. Venue rules use index/mark price, maintenance margin, insurance funds and ADL. — [arXiv 2609.04917](https://arxiv.org/pdf/2609.04917)
- [LIVE TEST] Binance `globalLongShortAccountRatio` for BTCUSDT 4h returned longAccount 0.6384, ratio 1.7655. Bybit `account-ratio` returned buyRatio 0.6437. Retail-account ratios for BTC sat persistently >1 (more accounts long). Binance `takerlongshortRatio` returned buySellRatio 1.1237 with buyVol/sellVol. — https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=4h&limit=1 ; https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=4h&limit=1
- [LIVE TEST] Binance public `/fapi/v1/allForceOrders` (liquidation orders) returned an HTML error page, not data: the REST liquidation feed is not usable. Live liquidations are, as far as known, only on the WebSocket `forceOrder` stream (not tested). — https://fapi.binance.com/fapi/v1/allForceOrders?symbol=BTCUSDT
- Binance long/short ratio endpoints have weight 0, an IP limit of 1000 requests/5min, max limit 500, and only the latest 30 days. — [Binance docs](https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Open-Interest-Statistics)

### Inferences
- Pitfalls:
  - The account ratio counts accounts, not size. The "top trader position" ratio is a different series.
  - The BTC account ratio sits structurally above 1, so use **changes or z-scores vs. own history**, never a fixed 1.0 cut-off.
  - Ratios are per-exchange, not market-wide.
- Recommendation: low weight, or use only as a contrarian tiebreaker. Taker buy/sell imbalance has slightly better (order-flow) support.

### Gaps
- No peer-reviewed test of long/short ratios or liquidation counts as return predictors was found.
- The exact Binance top-trader endpoint names (`topLongShortAccountRatio`, `topLongShortPositionRatio`) were not fetched from the docs in this pass, so their parameters are unverified.

---

## 4. Spot vs perp basis; options skew and implied volatility (Deribit DVOL) for BTC/ETH

### Takeaway
Basis is the best-evidenced derivatives signal: high carry predicts crashes [BIS], and log basis is one of two factors explaining perp return anomalies [Cao et al.]. DVOL and the options data are free from Deribit for BTC/ETH only. This pass found no academic evidence quantifying DVOL or skew as a return predictor.

### Cited Findings
- High carry predicts crashes and coincides with costlier crash insurance (i.e., options skew moves with carry). — [BIS WP 1087](https://www.bis.org/publ/work1087.htm)
- Log basis is a key factor in perp returns. — [SSRN 6365329](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6365329)
- Binance has a `GET /futures/data/basis` endpoint: `pair`, `contractType` (PERPETUAL/CURRENT_QUARTER/NEXT_QUARTER), `period`, limit ≤500, latest 30 days, weight 0. — [Binance docs](https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Open-Interest-Statistics)
- [LIVE TEST] Deribit `public/get_volatility_index_data?currency=BTC&start_timestamp&end_timestamp&resolution=3600` returns OHLC DVOL candles (e.g., ~39.5 on Oct 2025 timestamps), with no auth. `public/get_book_summary_by_currency?currency=ETH&kind=option` returned 830 option instruments with `mark_iv`. — https://www.deribit.com/api/v2/public/get_volatility_index_data ; https://www.deribit.com/api/v2/public/get_book_summary_by_currency

### Inferences
- Use BTC basis/funding and DVOL as **market-regime filters** applied to all coins (risk-on/off), not per-altcoin signals.
- For altcoins, the perp premium can be computed per coin from `premiumIndex` (markPrice vs indexPrice) on Binance, from Bybit tickers (markPrice/indexPrice), or from the Hyperliquid `premium` field.

### Gaps
- No academic or primary research source with numeric DVOL/skew thresholds was retrieved.
- Deribit public rate limits were not verified.

---

## 5. On-chain: exchange net flows, stablecoin supply, MVRV, SOPR, NUPL, active addresses

### Takeaway
Evidence is weak at swing horizons. **No peer-reviewed out-of-sample study of MVRV/SOPR/NUPL/exchange netflow** surfaced; their thresholds (MVRV<1 at cycle bottoms) rest on a handful of BTC cycles and are cycle-scale, not ≤10-day. Stablecoin issuance has contested short-run evidence. Free coverage is narrow:
- MVRV is available for ~125 assets.
- Active addresses are available for ~138 assets.
- Exchange flows are available **only for BTC and ETH** on the free CoinMetrics community API.

### Cited Findings
- MVRV cycle bottoms <1.0 (e.g., 2015 bottom MVRV 0.87) are retrospective descriptions of a few cycles. Caveats include short histories, few cycles, lagging realized-cap data, and exchange-wallet labeling distortions. The sources are industry blogs, not academic work. — [LuxAlgo MVRV](https://www.luxalgo.com/library/concept/mvrv.md); [Nansen](https://www.nansen.ai/post/onchain-metrics-key-indicators-for-cryptocurrency-price-prediction); [Axel Adler SOPR](https://axeladlerjr.com/charts/bitcoin-sopr/)
- Tether flows were timed after market drops, and **1% of hours with the largest Tether flows were associated with >50% of BTC's compounded return** in the 2017 boom (Griffin & Shams). The finding is contested: Wei (2018) finds Tether lacks the heft to move BTC. A review says stablecoin issuances can affect BTC in the short term. — [Quantpedia summary](https://quantpedia.com/a-very-influential-paper-about-tether-bitcoin-relationship-manipulation/); [CEPR VoxEU "Stable coins don't inflate crypto markets"](https://cepr.org/voxeu/columns/stable-coins-dont-inflate-crypto-markets); [arXiv 2507.13883 stablecoin review](https://arxiv.org/pdf/2507.13883); [BRL WP 11](https://www.blockchainresearchlab.org/wp-content/uploads/2020/05/The_Influence_of_Stablecoin_Issuances_on_Cryptocurrency_Markets_BRL_Working_Paper_No_11.pdf)
- [LIVE TEST] CoinMetrics community API (no key):
  - `CapMVRVCur` is available for **125 assets**.
  - `AdrActCnt` (active addresses) is available for **138 assets**.
  - `FlowInExNtv` (exchange inflow) is available for **only 2 assets (btc, eth)**.
  - Response header: `x-ratelimit-limit: 6000, 6000;w=20` (sliding 20-second window).
  - Latest BTC values: MVRV 1.52, active addresses 608,276 (2026-10-18). Flow data is flagged `"status":"flash"` (provisional).
  — https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=CapMVRVCur,AdrActCnt,FlowInExNtv ; catalog: https://community-api.coinmetrics.io/v4/catalog-v2/asset-metrics?metrics=FlowInExNtv
- [LIVE TEST] DefiLlama stablecoins: `https://stablecoins.llama.fi/stablecoincharts/all?stablecoin=1` returns daily circulating supply from 2017 with no key (HTTP 200, ~470KB). — https://stablecoins.llama.fi/stablecoincharts/all?stablecoin=1
- [LIVE TEST] Blockchain.com: `https://api.blockchain.info/charts/n-unique-addresses?timespan=1week&format=json` returns daily BTC unique addresses with no key. BTC only. — https://api.blockchain.info/charts/n-unique-addresses?timespan=1week&format=json
- Glassnode: all metrics exist at 24h resolution. The free Standard plan gives T1 metrics at daily resolution, but third parties say it is display-only (no API). Free API access is unconfirmed. — [Glassnode docs](https://docs.glassnode.com/data/general-information/timestamps-and-resolutions); [Fitgap listing](https://us.fitgap.com/products/glassnode-studio)
- CryptoQuant free Basic plan: 10,000 credits/month, 10 req/min, 30-day history, **on-chain data not included** (market data only). A third party claims there is no free plan; the official page is preferred. — [CryptoQuant APIs](https://cryptoquant.com/apis); conflicting: [CostBench](https://www.costbench.com/software/onchain-analytics/cryptoquant/free-plan/)

### Inferences
- For a 1000-coin scanner, the realistic on-chain inputs are:
  - **Market-wide stablecoin supply growth** (DefiLlama) as a liquidity regime factor.
  - **BTC/ETH MVRV and exchange flows** (CoinMetrics community) as regime filters.
  - **MVRV/active-address trend for ~125–138 larger coins** as a minor per-coin factor.
- Do not build per-altcoin exchange-flow signals. No free source covers them.
- Treat MVRV/SOPR/NUPL as slow (cycle) context, not ≤10-day triggers.

### Gaps
- No peer-reviewed predictive test of MVRV/SOPR/NUPL/exchange flows was found.
- NUPL and SOPR availability on the CoinMetrics community API was not checked. The candidate metric names are guesses and are not used here.
- DefiLlama exchange-level stablecoin balances: no free endpoint was confirmed.

---

## 6. Liquidity/tradability for small caps: depth, spread, volume/market-cap

### Takeaway
Liquidity matters for both risk and the implementability of signals: momentum works mainly in liquid coins, and costs are high in the illiquid tail. Reported volume on unregulated venues is heavily inflated (~70% wash), so **volume/market-cap from aggregators is unreliable**. Order-book depth within ±1% and spread from a regulated or major venue are better gauges, and depth can vanish in stress (>90% drop on 10 Oct 2025).

### Cited Findings
- Momentum is significant in the **most liquid** cryptocurrencies (711 coins). Illiquid losers concentrate in the least-liquid coins, where bid-ask costs are much higher. — ["Momentum and liquidity in cryptocurrencies", arXiv 1904.00890](https://ar5iv.arxiv.org/html/1904.00890)
- Wash trading **averaged >70% of reported volume on unregulated exchanges** (29 exchanges, Jul–Nov 2019). Regulated exchanges show normal patterns. Fake volume improves rankings and temporarily distorts prices. — [Cong, Li, Tang, Yang, NBER w30783 / Management Science 69(11) 2023](https://nber.org/papers/w30783)
- Kaiko uses **1% depth** because 2% depth (used by CoinGecko/CMC) is more easily gamed. Kaiko's liquidity studies cover BTC/ETH/top-30 only. Altcoin depth on US-available exchanges is concentrated on three platforms. — [Kaiko CEX liquidity](https://marketing.kaiko.com/cex-liquidity-data); [Kaiko liquidity concentration report](https://www.kaiko.com/resources/the-crypto-liquidity-concentration-report)
- Aggregated 1% depth for the top-10 altcoins was ~$162M (Kaiko, via CoinDesk). — [CoinDesk Kaiko tag](https://www.coindesk.com/de/tag/kaiko/2)
- The spread captures only "tightness". Liquidity also has depth and resiliency dimensions. The Kyle-Obizhaeva illiquidity measure uses volatility/dollar volume. — [arXiv 2609.00943 "Illiquidity at Risk"](https://arxiv.org/pdf/2609.00943); [Macro Hive](https://macrohive.com/deep-dives/the-best-methods-for-measuring-cryptocurrency-market-liquidity)
- BTC top-of-book depth fell >90% on 10 Oct 2025. — [FTI Consulting](https://fticonsulting.com/insights/articles/crypto-crash-october-2025-leverage-met-liquidity)
- [LIVE TEST] Binance `fapi/v1/depth?symbol=BTCUSDT&limit=5` and spot `api/v3/ticker/bookTicker` returned HTTP 200 from this non-US IP. — https://fapi.binance.com/fapi/v1/depth?symbol=BTCUSDT&limit=5

### Inferences
- Scoring use:
  - Compute **spread (bps)** and **±1% depth (USD)** from one or two reputable venues' order books. Use it as a hard tradability gate plus a position-size cap, e.g., the intended order should be ≤ a fraction of ±1% depth. That fraction is a design choice, not from the literature.
  - Use volume/market-cap only from regulated or top venues, and penalize coins whose volume is concentrated on unregulated exchanges.
- Calling depth for 1000 coins every 15 minutes is heavy. Bybit/Binance bulk tickers give best bid/ask (spread) for all symbols in one call, so fetch depth only for shortlisted coins.

### Gaps
- No crypto-specific study directly linking illiquidity to crash risk was found. No numeric spread/depth thresholds come from the literature.

---

## 7. Exact free endpoints: parameters, limits, coverage, US accessibility

### Takeaway
All derivatives endpoints below are free and keyless.
- **Bybit** (912 linear tickers in one call, including funding and OI) and **OKX** (509 swaps; one call for all OI) give the broadest single-call altcoin coverage.
- **Binance** has 525 USDT perps but the strongest US-blocking risk.
- **Hyperliquid** (234 perps, one POST for funding + OI + premium for all) and **Kraken Futures** (211 perps) are US-friendlier alternatives.
- **Deribit** covers BTC/ETH options/DVOL only.

On-chain free coverage is narrow (see section 5).

### Cited Findings
**Binance USD-M (base https://fapi.binance.com)**
- [LIVE TEST] `exchangeInfo`: 568 PERPETUAL TRADING contracts, 525 USDT-quoted. The global `REQUEST_WEIGHT` limit is 2400/min. — https://fapi.binance.com/fapi/v1/exchangeInfo
- [LIVE TEST] `GET /fapi/v1/premiumIndex` (no symbol) returned 930 entries in one call, used weight 12. Fields: markPrice, indexPrice, lastFundingRate, interestRate, nextFundingTime. — https://fapi.binance.com/fapi/v1/premiumIndex
- [LIVE TEST] `GET /fapi/v1/fundingRate?symbol=&limit=` returns the settled funding history (fundingRate, markPrice). — https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=2
- `GET /futures/data/openInterestHist`, `/globalLongShortAccountRatio` and `/basis` take `symbol` (or `pair`), `period` (5m…12h…), `limit` (default 30, max 500), `startTime`, `endTime`. **History is the latest 30 days only.** Weight is 0, with an IP limit of 1000 req/5min. — [Binance docs](https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Open-Interest-Statistics)
- [LIVE TEST] `GET /futures/data/takerlongshortRatio?symbol=&period=&limit=` returns buySellRatio, buyVol, sellVol. — https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=BTCUSDT&period=4h&limit=1
- **US blocking:**
  - Binance returns HTTP 451 "restricted location" to US and many cloud/datacenter IPs. A US Linode got the error while Frankfurt did not.
  - QuantConnect saw 451 from the Binance brokerage.
  - A blog says Binance restricted even public market data for US at end-2022.
  - No official Binance statement specific to `fapi` + GitHub Actions was found.
  — [Linode community](https://www.linode.com/community/questions/23972/linode-and-binancecom); [Vercel community](https://community.vercel.com/t/binance-api-calls-on-vercel/29895); [QuantConnect forum](https://quantconnect.com/forum/discussion/14508); [CryptoDataDownload](https://www.cryptodatadownload.com/blog/posts/binance-download-data-python-usa-residents/); [Railway](https://station.railway.com/questions/deployment-is-crashing-7b190d57)

**Bybit v5 (base https://api.bybit.com)**
- [LIVE TEST] `GET /v5/market/tickers?category=linear` returns **912 symbols in one call**, including `fundingRate`, `openInterest`, `openInterestValue`, markPrice, indexPrice, bid/ask and 24h volume. — https://api.bybit.com/v5/market/tickers?category=linear
- [LIVE TEST] `GET /v5/market/open-interest?category=linear&symbol=&intervalTime=(5min,15min,30min,1h,4h,1d)&limit=` returns OI history with a cursor. `intervalTime=4h` worked. — https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=4h&limit=1
- [LIVE TEST] `GET /v5/market/account-ratio?category=linear&symbol=&period=&limit=` returns buyRatio/sellRatio. — https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=4h&limit=1
- Bybit also geo-restricts US users; whether US IPs can reach the API was not tested.

**OKX v5 (base https://www.okx.com)**
- [LIVE TEST] `GET /api/v5/public/funding-rate?instId=BTC-USDT-SWAP` returns fundingRate, fundingTime, interestRate, maxFundingRate (0.00375), minFundingRate, method. — https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP
- [LIVE TEST] `GET /api/v5/public/open-interest?instType=SWAP` returns **all swaps in one call** (oi, oiCcy, oiUsd). `public/instruments?instType=SWAP` lists 509. — https://www.okx.com/api/v5/public/open-interest?instType=SWAP
- [LIVE TEST] Rubik stats: `GET /api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=SOL&period=1H` works. **`period` only accepts 5m, 1H, 1D**: `4H` returned error 51000 "support [5m,1H,1D]". Data is per currency (ccy), as [ts, ratio] arrays. — https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=SOL&period=1H

**Hyperliquid (US-friendlier DEX)**
- [LIVE TEST] `POST https://api.hyperliquid.xyz/info` with body `{"type":"metaAndAssetCtxs"}` returns **234 perps** with funding, openInterest, premium, markPx, oraclePx, dayNtlVlm and impactPxs in one call. GET returns 405. — https://api.hyperliquid.xyz/info
- Hyperliquid carried the largest share of 10-Oct-2025 liquidations ($10.08bn, secondary source). — [Das Crypto newsletter](https://das-crypto-newsletter.beehiiv.com/p/crypto-leverage-is-built-different)

**Kraken Futures**
- [LIVE TEST] `GET https://futures.kraken.com/derivatives/api/v3/tickers` returns 211 perpetuals with fundingRate and openInterest. — https://futures.kraken.com/derivatives/api/v3/tickers

**Deribit (BTC/ETH, plus some SOL options)**
- [LIVE TEST] `public/get_index_price?index_name=btc_usd`, `public/get_volatility_index_data?currency=BTC|ETH&start_timestamp&end_timestamp&resolution` (DVOL) and `public/get_book_summary_by_currency?currency=&kind=option` (mark_iv per option) all work with no auth. — https://www.deribit.com/api/v2/public/get_volatility_index_data

**On-chain / macro**
- CoinMetrics community (`community-api.coinmetrics.io/v4`), no key, 6000 requests per 20s sliding window. Coverage: MVRV for 125 assets, active addresses for 138, exchange flows for BTC/ETH only. [LIVE TEST, section 5]
- DefiLlama stablecoins (`stablecoins.llama.fi/stablecoincharts/all?stablecoin=<id>`; `/stablecoins` list) is free with no key. [LIVE TEST]
- Blockchain.com charts (`api.blockchain.info/charts/<chart>?timespan=&format=json`) is free and covers BTC only. [LIVE TEST]
- Glassnode: no confirmed free API. CryptoQuant: free market data only, 10 req/min. — [CryptoQuant APIs](https://cryptoquant.com/apis); [Glassnode docs](https://docs.glassnode.com/data/general-information/timestamps-and-resolutions)

### Inferences
- **Coverage map:**
  - Funding, OI, premium and spread for altcoins come broadly from Bybit, OKX, Binance and Hyperliquid. The union probably covers most perp-listed coins in the top 1000, but **coins without a perp listing (likely several hundred of the top 1000) have no derivatives signal at all.** The scoring engine must treat "no data" as neutral, not negative.
  - Long/short and taker ratios: Binance/Bybit per symbol (one call per symbol, rate-limit bound); OKX per ccy.
  - Options/DVOL: BTC/ETH only.
  - On-chain flows: BTC/ETH only.
- **Cheapest 15-minute design** (≈4 calls per run for all coins):
  - Bybit tickers (1 call), OKX OI (1 call) + OKX funding (per instrument, or via tickers), Binance premiumIndex (1 call, weight 12, if reachable), Hyperliquid metaAndAssetCtxs (1 call).
  - Store snapshots in your own DB to build history beyond Binance's 30-day window.
- **US runner risk:** GitHub-hosted runners are US/Azure datacenter IPs, so Binance (and likely Bybit) may return 451/403. Hyperliquid, Kraken Futures, OKX (unverified for US), Deribit, CoinMetrics and DefiLlama are the safer core. Verify with one test workflow before committing.

### Gaps
- **Not verified:** actual HTTP status of fapi.binance.com, api.bybit.com and www.okx.com from a GitHub Actions US runner. All live tests here ran from a non-US IP. A one-off workflow `curl -w "%{http_code}"` test is needed.
- Bybit and OKX public rate limits were not read from the docs in this pass.
- Top-trader long/short endpoints (Binance) and Bybit funding history parameters were not fetched.
