# Money-Flow Analysis in Crypto (coin level and market level): Facts, Rules and Free Endpoints

Scope: who is buying and who is selling, and where money is moving. Inputs are OHLCV and taker flow, stablecoins, exchange netflows, ETF flows, rotation, abnormal volume, wash trading and whale trades.
Labels: [EVIDENCE] means peer-reviewed or a working paper with statistics. [INDUSTRY] means vendor or practitioner research with numbers. [FOLKLORE] means widely used but not tested.
Research date: 2026-10-19. The endpoint checks ran from a machine outside the US. Coin Radar runs on GitHub Actions US runners, so geo-blocking matters (see the last section).

---

## 1. Order flow / taker buy-sell imbalance and CVD: does it predict returns?

### Takeaway
Taker (aggressor) imbalance reliably explains price changes in the **same** window. Out-of-sample evidence that it predicts **future** returns is thin, but it does exist. The best 2026 evidence is from Binance perpetuals: order imbalance at quarter-hour openings predicts returns over 4–12 h, after a short reversal in the first ~30 min. "Spot CVD vs perp CVD divergence" is practitioner folklore. I found no academic test of it.

### Cited Findings
- [EVIDENCE] Kim & Hansen (arXiv 2607.09426, v2 July 2026), "The Quarter-Hour Effect". The data is trade data for 6 Binance USDT perpetuals (BTC, ETH, XRP, SOL, DOGE, ADA), with a quarter-hour sample from 2021-07-01 to 2024-10-31 and ~117k observations per asset. Opening returns are predictable out of sample. Opening order imbalance predicts returns over **4–12 hours**, with much weaker effects at finer clock frequencies. The response is non-monotonic: **negative over the first ~30 min (short-run reversal), then positive and rising, typically peaking at 8–12 h**. The authors warn that the imbalance is observed, not an identified shock, so the result is not causal price impact. — [arXiv abs](https://arxiv.org/abs/2607.09426); [HTML v2](https://arxiv.org/html/2607.09426v2)
- [EVIDENCE] The same paper finds periodic volume and volatility bursts at 1-min, 5-min and 15-min marks, which it attributes to algorithmic trading because trade-size roundness falls sharply during the bursts. — [arXiv abs](https://arxiv.org/abs/2607.09426)
- [EVIDENCE] "Fundamentals of Perpetual Futures" (arXiv 2212.06888) defines hourly signed taker order imbalance on Binance as (taker-buy $ − taker-sell $) / (taker-buy $ + taker-sell $), which lies in [−1, 1]. The paper uses it in a convergence-trading test, not a direct return-predictability test. — [arXiv 2212.06888](https://arxiv.org/pdf/2212.06888)
- [EVIDENCE] Very-short-horizon BTC OFI regressions have low explanatory power: R² = 0.094 at a 1-second horizon. — [arXiv 2308.14235](https://arxiv.org/pdf/2308.14235)
- [EVIDENCE] On BitMEX XBTUSD, **trade-flow imbalance (aggressor side) explains contemporaneous price changes better than order-book OFI**. The paper names thin depth and slow quote updates as what sets crypto microstructure apart. This copy is from Scribd, so treat the attribution with caution. — [Scribd copy](https://www.scribd.com/document/494134352/Order-Flow-Analysis)
- [EVIDENCE] Bitcoin fragmentation paper: trade flow across venues should carry predictive information. **Passive flow tends to be reactive rather than informative.** The authors describe the work on predicting future returns as ongoing. — [arXiv 2108.09750](https://arxiv.org/pdf/2108.09750)
- [EVIDENCE] Easley, O'Hara, Yang & Zhang (SSRN 4814346, 2024). Microstructure measures (VPIN, Roll, Kyle's lambda and others), used with ML, have predictive power for price dynamics, mainly volatility, in 5 major cryptocurrencies. BTC and ETH Roll and VPIN measures have important own-market and cross-market effects. The results hold through "crypto winter". — [Cornell PDF](https://stoye.economics.cornell.edu/docs/Easley_ssrn-4814346.pdf)
- [EVIDENCE, caveat] Andersen & Bondarenko argue that VPIN is mechanically correlated with volume and volatility, so any predictive claim must control for current volume and volatility. Easley et al. rejected this critique. — [SSRN 2062450](https://papers.ssrn.com/abstract=2062450)
- [INDUSTRY] Bitcoin metaorders follow the **square-root impact law** over 4 decades of size. The uninformed component of flow shows almost complete long-term decay of impact. — [arXiv 1412.4503](https://www.arxiv.org/abs/1412.4503)
- [INDUSTRY/secondary] A summary of an Evans–Lyons-style extension claims "world order flow predicts 11% of daily crypto returns". I **could not locate the original paper**. — [tradingstrategy.ai](https://tradingstrategy.ai/docs/learn/order-flow.html)
- [INDUSTRY] Commentary on Cont-style OFI: the result is that OFI over a period **explains the price change over the same period**, not future prices. — [tradingstrategy.ai](https://tradingstrategy.ai/docs/learn/order-flow.html)
- [FOLKLORE] Spot vs perp CVD divergence. TradingView scripts read "price above CVD" as a leverage-driven move and "price below CVD" as absorption. One open script only approximates CVD from volume × price direction, because Pine Script does not expose the buy/sell split. — [TradingView script](https://fr.tradingview.com/script/OnreHN3j-BTC-Spot-vs-Perpetual-CVD-Divergence); [TradingView](https://kr.tradingview.com/script/h2Vg2QMy)
- [FOLKLORE/INDUSTRY opinion] Jarvislabs (2023) argues that spot CVD has been more informative than futures CVD. This is an opinion with no systematic test. — [Jarvislabs](https://jarvislabs.substack.com/p/dazed-and-confused)

### Inferences (computable rules from Binance klines; no extra calls needed)
- Binance kline fields: `v` = idx5 base volume, `q` = idx7 quote volume, `n` = idx8 trades, `tb` = idx9 taker buy base, `tq` = idx10 taker buy quote (see §9).
  - `taker_buy_quote = tq`; `taker_sell_quote = q − tq`; `delta = 2*tq − q`.
  - `TBR` (taker buy ratio) = `tq / q`, which is in [0, 1]. `imbalance = (2*tq − q)/q` = 2·TBR − 1, which is in [−1, 1]. This is the same definition as arXiv 2212.06888.
  - `CVD_t = Σ delta` over a rolling window. Use a window (e.g. 24×1h or 30×4h), not an all-time cumulative sum, so coins stay comparable. Normalize by Σq in the window: `CVD_norm = Σdelta / Σq`.
  - Example checked live on 2026-10-19: BTCUSDT 1h bar with v = 41.84 BTC and tb = 22.34 → TBR = 0.534 (imbalance +0.068). BTCUSDT 4h bar with v = 2173.06 and tb = 1298.44 → TBR = 0.598 (imbalance +0.195).
- Suggested scoring use, consistent with the quarter-hour evidence:
  - Short-term mode (4H/1H, ≤48h): a positive imbalance z-score over the last 4–12 h is a mild positive. Do **not** chase imbalance from the last <30 min, because of the reversal.
  - Weight should be small. The evidence only covers 6 large perps and the authors stress non-causality.
- "Absorption" rule (folklore, treat as low weight): `CVD_norm` strongly negative while price is flat or up (e.g. CVD_norm < −0.1 and return > 0 over 24h) means passive buyers are absorbing selling. The opposite case is distribution.
- Spot vs perp divergence is computable for free: spot klines from api.binance.com and perp klines from fapi.binance.com have the same field layout. One possible rule: perp imbalance > +0.1 while spot imbalance < 0 over 24h means leverage-led → penalize. This is untested; label it FOLKLORE in the UI.

### Gaps
- I found no peer-reviewed study testing spot-vs-perp CVD divergence as a return predictor.
- I found no cross-sectional study across hundreds of altcoins ranking coins by taker imbalance (all evidence is on BTC/ETH/top perps). Its validity for small caps is unknown.
- The coefficient sizes and R² of the quarter-hour paper are not in the abstract. I did not extract them from the full text.

---

## 2. Volume-based flow indicators (OBV, MFI, CMF, A/D, VWAP): evidence vs folklore and formulas

### Takeaway
These are classic equity TA indicators. In this session I found **no peer-reviewed crypto study showing they are profitable after costs**, so treat them as [FOLKLORE] or as features. Their main advantage is that they are cheap to compute from OHLCV. Taker-based delta (§1) is a strictly better "who is aggressor" measure, because OBV/CMF only *infer* buying pressure from the close position.

### Cited Findings
- [INDUSTRY definition] CMF (StockCharts):
  - Money Flow Multiplier = [(Close − Low) − (High − Close)] / (High − Low)
  - Money Flow Volume = Multiplier × Volume
  - 20-period CMF = Σ20 MFV / Σ20 Volume
  - The Accumulation/Distribution Line is the cumulative indicator built from MFV.
  - [StockCharts CMF](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/chaikin-money-flow-cmf)
- [INDUSTRY definition] OBV is a running total that adds volume on up-closes and subtracts it on down-closes. MFI is a "volume-weighted RSI". — [Kiyotaka docs](https://docs.kiyotaka.ai/for-developers/k-script/functions/volume-indicators)
- [FOLKLORE] A search for crypto backtests or peer-reviewed tests of OBV/MFI returned only TradingView scripts and indicator docs, with no measured returns. — [TradingView volume scripts](https://cn.tradingview.com/scripts/volumeindicator/page-5)

### Inferences (standard formulas for implementation)
- A/D: `ADL_t = ADL_{t-1} + MFV_t` (cumulative MFV, per the StockCharts description above).
- OBV: `OBV_t = OBV_{t-1} + v_t·sign(close_t − close_{t-1})`. This is the standard Granville definition and matches the Kiyotaka description.
- MFI(14):
  - `TP = (H+L+C)/3`, `RMF = TP·v`
  - Positive flow is the sum of RMF where TP > TP_prev, and negative flow the sum where TP < TP_prev, over 14 bars.
  - `MFR = pos/neg`, `MFI = 100 − 100/(1+MFR)`
  - This is the standard definition. I did not fetch the formula page in this session; verify it before coding.
- VWAP over n bars: `Σ(TP·v)/Σv`. With Binance you can use the exact bar VWAP `q/v` (quote volume / base volume) instead of TP, which is more accurate. Anchored VWAP is the same sum, started from a chosen anchor bar (e.g. the swing low or a listing date).
- Recommendation:
  - Implement CMF(20) and the OBV slope only as secondary confirmation features.
  - Prefer the taker-delta versions: a "true CMF" = Σ(2·tq − q)/Σq, which is just `CVD_norm`.
  - Do not give OBV/MFI standalone weight without your own backtest.

### Gaps
- I found no rigorous crypto evidence (2019–2026) for OBV, MFI, CMF or VWAP predictability. A dedicated search on SSRN or Finance Research Letters ("technical trading rules cryptocurrency volume") may find some. This was not completed within the call budget.

---

## 3. Price–volume divergence and abnormal volume / volume spikes as predictors

### Takeaway
The academic evidence is mixed, and the sign depends on context:
- Abnormal volume on its own tends to predict **lower** future returns in crypto (the opposite of equities). This is linked to disagreement under short-sale constraints.
- Abnormal volume **interacted with past returns** predicts continuation or reversal at the 12–24 h horizon.
- Volume anomalies are concentrated in micro-caps.
- For "price up on falling volume" I found no direct crypto test, so it is [FOLKLORE].

### Cited Findings
- [EVIDENCE] Garfinkel, Hsiao & Hu, "Disagreement and returns: The case of cryptocurrencies", *Financial Management* (2025), vol. 54(3), pp. 633–672. Abnormal volume has a **negative** relation with future crypto returns, the reverse of equities. The authors interpret abnormal volume as disagreement under short-sale constraints. The effect **disappears after a coin's margin trading is activated**, and it is not explained by common risk factors. — [IDEAS/RePEc](https://ideas.repec.org/a/bla/finmgt/v54y2025i3p633-672.html); [Wiley](https://onlinelibrary.wiley.com/doi/10.1111/fima.12491); [WP version](https://iro.uiowa.edu/esploro/outputs/workingPaper/The-Negative-Abnormal-Volume-Return-Relation/9984414059502771)
- [EVIDENCE] Bianchi & Dickerson (2018 draft), later Babiak, Bianchi & Dickerson, "Trading volume and liquidity provision in cryptocurrency markets", *J. Banking & Finance* 142 (2022). Method: 12h and 24h intervals, with abnormal volume measured as the log deviation from trend over a 21-interval window. Findings: **volume alone has limited predictive power, but volume × past return predicts future returns**, both intraday and daily. — [CXO summary](https://www.cxoadvisory.com/technical-trading/predicting-crypto-asset-returns-with-past-returns-volume/); [RePEc JBF](https://ideas.repec.org/p/cer/papers/wp730.html)
- [INDUSTRY/press, treat with caution] A Warwick press release says a conditional reversal strategy based on past returns and volume earned 342% annualized risk-adjusted return net of costs, with a Sharpe ratio of 2.4. This figure is from the press release, not verified in the paper. — [Mondo Visione](https://mondovisione.com/news/evidence-highly-informed-traders-are-driving-cryptocurrency-prices-20181114/)
- [EVIDENCE] Bouri, Lau, Lucey & Roubaud (FRL 2019): across 7 coins, volume Granger-causes **extreme** negative and positive returns (copula-quantile causality). Volume predicts volatility for only a few coins. — [Brunel PDF](https://bura.brunel.ac.uk/bitstream/2438/22263/5/FullText.pdf)
- [EVIDENCE] Fieberg, Liedtke & Zaremba, "Cryptocurrency anomalies and economic constraints": size and volume anomalies **originate in micro-caps of negligible economic importance**. — [via search summary; CXO](https://www.cxoadvisory.com/?p=31597)
- [EVIDENCE] Pump-and-dump signatures:
  - The Kamps & Kleinberg (2018, *Crime Science*) detector flags events where **both price and volume exceed rolling anomaly thresholds**. — [DOAJ](https://doaj.org/article/4832ec694f404c1c8567492153997689)
  - Price+volume-only detectors give many false positives: Kamps-style reached 52.1% precision / 78.8% recall, against 98.2% / 91.2% for the "Doge of Wall Street" ML detector. — [arXiv 2105.00733](https://arxiv.org/pdf/2105.00733)
  - Per Xu & Livshits (2019) as cited by later work, price and volume **return to pre-pump levels within ~30 minutes**. — [SBC paper](https://sol.sbc.org.br/index.php/sbbd/article/download/30743/30546)

### Inferences (rules)
- Abnormal volume metric:
  - `AV = ln(q_t) − mean(ln q over the previous 21 bars)`, following Bianchi–Dickerson.
  - Or a z-score: `(q_t − median_30)/MAD_30`.
- Rule A (continuation, from the interaction evidence): high AV (z > 2) and positive return in the same bar → mild positive. High AV and negative return → negative.
- Rule B (Garfinkel): coins **without** a perp or margin market on major venues that show sustained high AV → slight negative drift. This fits small caps that cannot be shorted.
- Pump filter for small caps: if 1h return > +X% (e.g. 15%) **and** 1h volume z > 5 **and** no news or major listing, flag it as a "pump risk" and **exclude it from buy signals**. Most pumps revert within ~30 min to hours.
- Price-up-on-falling-volume divergence: compute it if you want, but label it [FOLKLORE].

### Gaps
- I found no crypto study that directly tests "price rising on declining volume → reversal".
- The full-text effect sizes for Garfinkel et al. were not available (Wiley returned 403).

---

## 4. Market-level flows: stablecoins, exchange netflows, spot ETF flows

### Takeaway
- All three show a **contemporaneous** association with price.
- Lead-lag evidence is weak to modest:
  - ETF flows Granger-cause BTC returns (p ≈ 0.004), but explain little: the 7-day correlation is 0.30, R² < 10%, with an impulse response of about +1.2% peaking at days 3–4.
  - Stablecoin issuance shows short-window event effects, but daily causal studies find none.
  - Exchange netflow is mostly practitioner heuristics.
- Use these as **regime context**, not as per-coin triggers.

### Cited Findings
- [INDUSTRY, statistical] FalconX: daily data from the spot ETF launch on 2024-01-11 to 2024-10-11.
  - Correlation between 7-day BTC price change and 7-day ETF flows is **0.30** (explains <10%). The rolling 60-day correlation ranged from **0.10 to ~0.50**.
  - In the VAR, the coefficient of yesterday's flow on today's price change is 0.027.
  - Impulse response to a flow shock peaks at about **+1.2% around days 3–4**, then fades.
  - **Granger F = 8.48, p = 0.0041.**
  - [FalconX](https://falconx.io/newsroom/what-can-spot-etf-flows-tell-us-about-the-trajectory-of-bitcoin-prices-a-preliminary-statistical-investigation)
- [EVIDENCE] A *Ledger* paper (daily data, Jan 2024–May 2025) finds a positive long-run cointegration between ETF AUM and BTC price level. This is a levels result, not a test of predictability. — [Ledger](https://ledger.pitt.edu/ojs/ledger/article/download/393/333?inline=1)
- [EVIDENCE, caution] Mazur & Polyzos (2025) report that ETF net flows predict BTC price **levels** with R² = 95%, and that most BTC price change happens outside ETF trading hours. The levels regression is likely spurious for returns. — [ZU Scholars](https://zuscholars.zu.ac.ae/works/7267)
- [INDUSTRY] Ecoinometrics finds a strong positive correlation between ETF flows and **monthly** returns, with no Granger test. — [Ecoinometrics](https://ecoinometrics.substack.com/p/bitcoin-returns-and-etf-flows-correlation)
- [EVIDENCE] Blockchain Research Lab WP No. 11 (Ante, Fiedler & Strehle, 2020) studied 565 issuance events across 7 stablecoins:
  - Crypto markets **declined in the week before** issuances.
  - **USDT issuances** were linked to positive abnormal returns in the 24 h **before** issuance. **HUSD/BUSD** issuances were linked to significant positive abnormal returns **after** issuance.
  - Magnitudes are shown only in charts.
  - [BRL blog](https://www.blockchainresearchlab.org/2020/06/24/how-do-stablecoin-issuances-affect-cryptocurrency-markets/); [BRL WP PDF](https://www.blockchainresearchlab.org/wp-content/uploads/2020/05/The_Influence_of_Stablecoin_Issuances_on_Cryptocurrency_Markets_BRL_Working_Paper_No_11.pdf)
- [EVIDENCE] Baur et al. (VoxEU) find **no systematic evidence that stablecoin issuance affects crypto prices**. Issuance mostly responds to deviations from the peg. Wei (Tether) found that issuance affects BTC **volume** but not returns. Griffin & Shams argued that issuance was used to push prices, which is disputed. — [VoxEU](https://voxeu.org/article/stable-coins-dont-inflate-crypto-markets); [Review arXiv 2507.13883](https://arxiv.org/pdf/2507.13883)
- [INDUSTRY] The Block (2021) studied daily data from 7 exchanges, Sep 2017–Sep 2021, on netflow vs volume vs price. Weekend volume drops were **not** preceded by drops in net inflow. — [The Block Research](https://www.theblock.co/research/institutional/to-what-extent-are-bitcoin-exchange-flows-trading-volumes-and-price-related-a-historical-view-118545)
- [INDUSTRY, unverified original] A Santiment 2021 study is cited as finding that large exchange-inflow spikes precede an average ~5% price drop. I could not verify the original. — [search summary; Bit.com](https://www.bit.com/insights/knowledge-hub/exchange-net-flow)
- [INDUSTRY] Bit.com: netflow is "probabilistic and context-dependent… not a standalone or reliable short-term price signal". — [Bit.com](https://www.bit.com/insights/knowledge-hub/exchange-net-flow)
- [FOLKLORE] Babypips: "inflows warn of drops, outflows signal increases". — [Babypips](https://www.babypips.com/crypto/learn/what-is-net-transfer-volume)
- [INDUSTRY method] Amberdata differences net flows and flags moves beyond 3σ. — [Amberdata](https://blog.amberdata.io/how-bit-mex-wallets-impact-the-price-of-bitcoin)
- Live data (curl, 2026-10-19):
  - DefiLlama total USD-pegged stablecoin circulating = **$304.6B**, latest daily point 2026-10-18 (3,247 daily points since 2017-11).
  - USDT circulating = **$183.44B**, prevDay $183.40B. — [DefiLlama stablecoins API](https://stablecoins.llama.fi/stablecoins?includePrices=false)
  - CoinMetrics community API returned BTC `FlowInExNtv` = 14,233.6 BTC and `FlowOutExNtv` = 12,183.2 BTC for 2026-10-17 (status "flash"), i.e. net +2,050 BTC into exchanges. — [CoinMetrics community API](https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=FlowInExNtv,FlowOutExNtv,SplyCur&page_size=2)

### Inferences (market-regime rules)
- Stablecoin liquidity: `S_t` = total peggedUSD (DefiLlama `/stablecoincharts/all`, daily).
  - Compute `ΔS_7d% = S_t/S_{t-7} − 1` and `ΔS_30d%`.
  - Regime "liquidity expanding" if ΔS_30d > +2% and ΔS_7d > 0. "Contracting" if ΔS_30d < 0.
  - Use it as a market-wide multiplier (e.g. ±5–10% on Swing scores), not a coin trigger. Evidence for a lead effect is mixed.
- BTC exchange netflow: `NF = FlowInExNtv − FlowOutExNtv` (daily, CoinMetrics community). Compute the z-score over 90d.
  - NF z > +2 → risk-off flag for the next 1–3 days (Santiment heuristic; weak evidence).
  - Persistent negative NF (30d sum < 0) → supportive. Low weight.
  - Note that the latest values are "flash" (preliminary) and can be revised.
- ETF flows: if you obtain a free source (out of scope here), a 5-day sum z-score > +1.5 is a mild BTC/market positive with a lag of about 3–4 days. Expected size is small: about 1% impulse, R² < 10%.

### Gaps
- I did not verify a free official API for daily spot ETF flows (Farside is HTML. SoSoValue requires a key). Covered by the macro/ETF researcher.
- I did not find stablecoin **exchange** inflow (USDT to exchanges) data free at scale. CoinMetrics community covers some assets; check `FlowInExUSD` for usdt_eth. Not tested.
- I found no rigorous peer-reviewed lead-lag test of BTC exchange netflow on returns, 2019–2026.
- Which CoinMetrics flow metrics are guaranteed in the community tier is not documented here; they worked on 2026-10-19.

---

## 5. Capital rotation (BTC → ETH → large caps → small caps) and sector volume share

### Takeaway
The "rotation" sequence is a widely repeated **practitioner narrative** [INDUSTRY/FOLKLORE] with no academic confirmation found here. The 2024–2026 cycle notably **did not** produce a broad altseason: the Altcoin Season Index was about 30 against a threshold of 75, and BTC dominance stayed at 55–62% in mid-2026. Academic support for "large coins lead small coins" exists in the form of cross-cryptocurrency return predictability (JEDC 2024), but I could not access the details.

### Cited Findings
- [INDUSTRY] Bybit × Block Scholes describe a rotation cycle BTC → ETH → mid/small caps, with regimes historically starting when BTC dominance peaks locally. In one earlier leg, dominance oscillated between 40% and 46% while altcoins gained about $1T. — [Block Scholes Substack](https://blockscholesresearch.substack.com/p/bybit-x-block-scholes-the-altcoin-rotation-why-and-when-altcoins-outperform-bitcoin); [Block Scholes](https://www.blockscholes.com/research/bybit-x-block-scholes-quarterly-report-altcoin-season-and-the-evolving-role-of-bitcoin)
- [INDUSTRY] Bit.com says the 2024–2026 cycle broke the script:
  - The Altcoin Season Index was about 30 in mid-2026, against a threshold of 75, and BTC dominance stayed at 55–62%.
  - Brief AI and RWA sector pumps pushed the index above 50, which Bit.com calls "narrow rotation", not altseason.
  - Index definition: the % of the top-50 altcoins (excluding stablecoins) that outperformed BTC over 90 days.
  - [Bit.com search page](https://www.bit.com/search?page=6) (article surfaced via search; exact URL not fetched)
- [FOLKLORE] TradingView: the bullish case is BTC dominance falling **while** BTC rises. — [TradingView BTC.D](https://it.tradingview.com/chart/BTC.D/DGfbCATP-BTC-D-down-BTC-up-ALTS-run)
- [EVIDENCE, details not retrieved] "Cross-cryptocurrency return predictability", *J. Economic Dynamics & Control* (2024). I could not read the abstract (403). — [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0165188924000551)
- CoinGecko `/coins/categories` (free, no key) returns per-category `market_cap`, `market_cap_change_24h` and `volume_24h`. Verified by curl: the first row was "smart-contract-platform", mcap $2.39T. — [CoinGecko categories](https://api.coingecko.com/api/v3/coins/categories)

### Inferences (computable rotation metrics from data already fetched)
- Coin volume share: `vs_i = q_i(24h) / Σ_top1000 q(24h)`. Rotation signal: `Δvs_i = vs_i(last 7d avg) / vs_i(prior 30d avg) − 1`. Rising share with positive price is money flowing in. Use Binance/OKX/Bybit quote volume only, to avoid wash-traded volume (§6).
- Tier rotation: bucket coins into BTC / ETH / top 2–20 / 21–100 / 101–1000 by mcap. Compute each tier's share of total volume and of total mcap, then the 7d change.
  - "Rotation down the cap curve" = BTC share falling while the 21–100 and 101–1000 tier shares rise for ≥2 consecutive weeks.
  - Use this as a regime flag that raises small-cap scores in Swing mode.
- Sector rotation: snapshot `/coins/categories` each run and store `volume_24h` and `market_cap` per category.
  - Sector volume share = cat_vol / Σcat_vol (categories overlap, so normalize on a fixed set of about 15–25 sectors).
  - Flag sectors whose 7d share is up more than 30% vs their 30d average.
  - Coin bonus = +x if the coin belongs to a top-3 rising sector.
- Altseason index (computable): the % of the top-50 non-stable alts with 90d return > BTC's 90d return. Above 75 = altseason. Below 25 = BTC season.

### Gaps
- I found no peer-reviewed test that volume-share or mcap-share rotation predicts returns.
- The JEDC 2024 cross-crypto predictability details (direction and horizon) were not retrieved.
- CoinGecko categories gives **current** values only. History must be built by storing snapshots; I found no free historical category endpoint.

---

## 6. Wash trading: how much volume is fake, and the implications

### Takeaway
On unregulated exchanges, wash trading averaged **over 70% of reported volume** (Cong et al., Management Science 2023). Bitwise (2019) estimated that ~95% of BTC volume reported on CoinMarketCap was fake. Major exchanges have since tightened controls (Kaiko). Practical implication: compute every flow and volume signal **only from the top venues (Binance/OKX/Bybit/Coinbase)**, never from aggregated CoinGecko total volume for small caps.

### Cited Findings
- [EVIDENCE] Cong, Li, Tang & Yang, "Crypto Wash Trading", *Management Science* 69(11):6427–6454 (2023):
  - 29 centralized exchanges studied. Wash trading **averaged over 70% of reported volume on each unregulated exchange**, with fabricated volume amounting to trillions of dollars a year.
  - Regulated exchanges show the usual statistical regularities (Benford's law for first significant digits, trade-size clustering at round numbers, power-law tails). Unregulated exchanges violate them.
  - Wash trading improves exchange rankings and temporarily distorts prices.
  - [NBER w30783](https://nber.org/papers/w30783); [NBER PDF](https://www.nber.org/system/files/working_papers/w30783/w30783.pdf); [arXiv 2108.10984](https://arxiv.org/abs/2108.10984v1)
- [INDUSTRY] Bitwise SEC presentation (March 2019):
  - About **95%** of reported BTC volume was fake. 71 of 81 exchanges showed signs of fake or wash volume.
  - Reported average daily volume was about $6B, against about **$270M real** across **10 exchanges**. CoinMarketCap was the source of the inflated figures.
  - [The Block](https://theblock.co/news/ecosystems/2019-03-22-bitwise-nearly-95-of-reported-bitcoin-trading-volume-are-artificially-created-by-unregulated-exchanges-16958); [MIT Tech Review](https://www.technologyreview.com/2019/03/26/1206/nearly-all-bitcoin-trades-are-fake-apparently/)
- [INDUSTRY] Kaiko:
  - Detect artificial volume by its **volume-to-depth ratio** (high USD volume relative to 2% depth), tick-trade analysis and wide spreads.
  - Major exchanges now have strict anti-wash measures that have drastically reduced the problem since 2017–18, but it persists on lesser-known venues.
  - [Kaiko research](https://research.kaiko.com/insights/how-to-spot-artificial-volume); [Kaiko docs](https://docs.kaiko.com/explore-our-data/examples/identify-wash-trading-and-volume-quality)
- [EVIDENCE] Kim & Hansen 2026: trade-size roundness is used as a marker of algorithmic trading on Binance perps. Roundness diagnostics are a tool in both directions. — [arXiv 2607.09426](https://arxiv.org/abs/2607.09426)

### Inferences (rules)
- Volume source whitelist: use Binance spot, then OKX, then Bybit (and Coinbase if added). Exclude CoinGecko `total_volume` from flow signals. It may be used only as a sanity check.
- Wash-suspicion flags per coin:
  - Volume/mcap: `q_24h / mcap > 1.0` on a small cap is suspicious. Industry thresholds vary; calibrate them yourself.
  - CoinGecko total volume ≫ sum of whitelist-venue volume (e.g. more than 5×) → down-weight that coin.
  - Trade-count sanity: Binance kline `n` (number of trades) is very low relative to volume → a few large prints, which is either whales or manipulation.
- Coins not listed on any whitelist venue: skip flow scoring, or score it as "low confidence".

### Gaps
- I did not retrieve a 2024–2026 quantitative estimate of the wash share on major exchanges.

---

## 7. Large-trade / whale flow detection from public trades (aggTrades)

### Takeaway
You can detect whale prints from public trade feeds: Binance aggTrades has a `m` flag (buyer is maker), and OKX and Bybit trades have a `side` field. However, **I found no crypto study showing that large-trade flow predicts subsequent returns**. Theory (Kyle, square-root impact) and BTC metaorder studies support the idea that size carries information, but impact from uninformed flow decays almost completely.

### Cited Findings
- [EVIDENCE] Bitcoin metaorders follow the square-root impact law. The uninformed component of order flow shows almost complete long-term decay of impact. — [arXiv 1412.4503](https://www.arxiv.org/abs/1412.4503)
- [INDUSTRY] There is no universal threshold for a "whale". Whales are defined by their market impact rather than a fixed size. — [KuCoin](https://www.kucoin.com/knowledge-base/Concepts/what-is-a-whale-in-crypto)
- [INDUSTRY] Impact depends on order size relative to book depth, and stress periods amplify it through liquidations. — [Mudrex](https://mudrex.com/learn/impact-large-orders-in-crypto-futures/)
- [EVIDENCE, analogous market] Polymarket Hasbrouck VAR: about 45.5% of the post-trade price move is permanent (informational) and 54.5% is temporary. This is not a crypto spot market. — [arXiv 2605.00493](https://arxiv.org/pdf/2605.00493)
- API facts (Binance docs):
  - `GET /api/v3/aggTrades` has weight 4 and a max limit of 1000.
  - Fields: `a` (agg id), `p`, `q`, `f`/`l` (first and last trade id), `T` (ms), `m` (buyer was maker, i.e. **m = true means the taker was a SELLER**), `M`.
  - startTime/endTime are inclusive.
  - [Binance market data docs](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints)
- Verified live: aggTrades returned `{"a":4092909020,"p":"82645.36","q":"0.00009","m":false,...}`. OKX `/api/v5/market/trades` returns `side:"buy"`. Bybit `/v5/market/recent-trade` returns `side:"Buy"` and `isBlockTrade`. (curl output, 2026-10-19)

### Inferences (rules, cost-aware)
- Fetching aggTrades for 1000 coins every 15 min is expensive: weight 4 per call and up to 1000 trades per call, and one call often covers only seconds for liquid pairs. Use it **only for a shortlist** (e.g. the top 30–50 candidates after the kline-based scoring).
- Whale print: trade notional `p·q ≥ max($100k, P99 of the trailing trade-size distribution for that symbol)`.
- Whale delta = Σ(notional of whale taker buys) − Σ(notional of whale taker sells) over the last 1–4 h. Taker buy = `m == false`.
- Signal: whale delta / total quote volume > +0.1 → mild positive (untested, label [FOLKLORE/INDUSTRY]).
- A cheaper proxy using klines only: average trade size `q/n`. A spike in average trade size (z > 2) together with TBR > 0.6 suggests large aggressive buyers.

### Gaps
- I found no peer-reviewed crypto evidence on large-trade direction → next 1h–10d returns.
- Bybit `isBlockTrade` semantics and coverage were not studied.

---

## 8. Practical rule set summary (scoring-ready, by mode)
(These are inferences built on the sections above. The weights are suggestions to be backtested.)

| Feature | Formula (Binance kline fields) | Swing 1D/4H | Short 4H/1H | Evidence label |
|---|---|---|---|---|
| Taker imbalance | (2·tq − q)/q, window sum | 7×1D / 30×4H | 4–12×1H | EVIDENCE (BTC/ETH perps, 4–12h) |
| CVD_norm trend | Σ(2tq−q)/Σq; slope vs price | divergence flag | divergence flag | FOLKLORE (divergence) |
| Spot vs perp imbalance gap | imb_perp − imb_spot | penalize > +0.15 | penalize > +0.15 | FOLKLORE |
| Abnormal volume × return | AV = ln q − mean21(ln q); sign(ret) | yes | yes | EVIDENCE (12–24h) |
| Abnormal volume, no short market | sustained AV > 0 | slight negative | – | EVIDENCE (Garfinkel 2025) |
| Pump filter | 1h ret > 15% & vol z > 5 | exclude | exclude | EVIDENCE (Kamps; Xu-Livshits ~30 min reversal) |
| CMF(20)/OBV slope | StockCharts formula | confirm only | confirm only | FOLKLORE |
| Coin volume-share momentum | vs_7d / vs_30d − 1 | yes | weak | INDUSTRY |
| Sector volume-share momentum | CoinGecko categories snapshots | yes | – | INDUSTRY |
| Stablecoin supply regime | ΔS_7d, ΔS_30d (DefiLlama) | market multiplier | – | Mixed EVIDENCE |
| BTC exchange netflow z | CoinMetrics FlowIn − FlowOut | market multiplier | – | INDUSTRY |
| Wash filter | whitelist venues; vol/mcap; CG/whitelist ratio | always | always | EVIDENCE (Cong 2023) |

---

## 9. Free endpoints: verified by curl on 2026-10-19 from a non-US machine

### Takeaway
Every endpoint below returned valid data on 2026-10-19. **Main risk:** Coin Radar runs on **US GitHub Actions runners**. `api.binance.com` and Bybit are widely reported to geo-block US IPs, which I could **not** test from here. The Binance market-data mirror `data-api.binance.vision` returned identical kline fields and is the documented public market-data host. Test all endpoints from the actual runner before relying on them.

### Cited Findings (all verified working from this machine; examples shown are real outputs)
- **Binance spot klines**: `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=1`. Weight 2.
  - Returns 12 fields: [0] openTime, [1] O, [2] H, [3] L, [4] C, [5] base vol, [6] closeTime, [7] quote vol, [8] trades, [9] **taker buy base vol**, [10] **taker buy quote vol**, [11] ignore.
  - Sample: `[...,"41.84295000",...,"3459349.43596970",7566,"22.34106000","1847031.87995440","0"]`.
  - [Binance docs](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints)
- **Binance mirror (market data only)**: `https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=4h&limit=1`. Same 12 fields; verified to return `[...,"2173.06049000",...,450965,"1298.44474000",...]`. [Binance docs](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints)
- **Binance aggTrades**: `https://api.binance.com/api/v3/aggTrades?symbol=BTCUSDT&limit=2`. Weight 4, limit ≤1000; `m` = buyer is maker. [Binance docs](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints)
- **Binance 24hr ticker**: weight 80 for all symbols. One call gives volume for every pair, which suits a top-1000 screen. [Binance docs](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints)
- **Binance USDⓈ-M perp klines**: `https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1h&limit=1` returned the same layout with taker buy fields: `"451.983",...,11884,"144.885","11972747.66680"`. Use it for perp CVD.
- **Binance futures taker long/short ratio**: `https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=BTCUSDT&period=1h&limit=1` → `{"buySellRatio":"1.2675","sellVol":"2695.5160","buyVol":"3416.6280",...}` (HTTP 200).
- **OKX taker volume (rubik)**: `https://www.okx.com/api/v5/rubik/stat/taker-volume?ccy=BTC&instType=SPOT&period=1H` → rows `[ts, sellVol, buyVol]`, e.g. `["1792375200000","93.5679","147.1061"]`.
  - `period` accepts 5m, 1H or 1D. `instType` is SPOT or CONTRACTS.
  - The **sell-then-buy order is per third-party code**; verify against the official OKX docs.
  - Taker flow can also be computed from OKX candles if needed.
  - [Glama/aktools schema](https://glama.ai/mcp/servers/aahl/mcp-aktools/tools/okx_taker_volume)
- **OKX trades**: `https://www.okx.com/api/v5/market/trades?instId=BTC-USDT&limit=2` → `side:"buy"` (taker side), `sz`, `px`, `ts`.
- **Bybit trades**: `https://api.bybit.com/v5/market/recent-trade?category=spot&symbol=BTCUSDT&limit=2` → `side:"Buy"`, `size`, `price`, `isBlockTrade`, `isRPITrade`.
- **DefiLlama stablecoins** (no key):
  - `https://stablecoins.llama.fi/stablecoins?includePrices=false`: per-coin `circulating`, `circulatingPrevDay`, `circulatingPrevWeek`. USDT = $183.44B.
  - `https://stablecoins.llama.fi/stablecoincharts/all`: daily total. Latest $304.6B peggedUSD; 3,247 points from 2017-11.
  - `...stablecoincharts/all?stablecoin=1` gives the USDT series.
- **CoinMetrics community** (no key): `https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=FlowInExNtv,FlowOutExNtv,SplyCur&page_size=2`. Returned daily BTC exchange inflow and outflow; the latest values carry status "flash".
- **CoinGecko** (no key, rate-limited):
  - `/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=2`: hourly prices, market caps and total volumes.
  - `/api/v3/coins/categories`: per-sector market_cap, volume_24h and changes.
  - [CoinGecko API](https://api.coingecko.com/api/v3/coins/categories)

### Inferences
- Cost plan per 15-min run:
  - 1 × Binance `ticker/24hr` (weight 80) for the universe.
  - Klines for about 400–600 Binance-listed USDT pairs (weight 2 each, about 1,200 weight). This fits Binance's per-minute IP weight budget if spread out; check the exact limit in the Rate limits section, which was not fetched.
  - OKX/Bybit klines for coins not on Binance.
  - Market-level series (DefiLlama, CoinMetrics) once per day, cached.
  - aggTrades only for the shortlist.
- If US runners get HTTP 451/403 from api.binance.com: switch the base URL to `data-api.binance.vision` (spot market data only; it has no fapi equivalent). Otherwise use OKX as the primary source, because OKX candles plus the rubik taker volume give the same information.

### Gaps
- **Not tested from a US IP.** The Binance/Bybit US geo-block status for GitHub-hosted runners must be confirmed with a one-off workflow run. I could not verify it from this machine.
- The exact Binance IP weight limit (per minute) was not fetched in this session.
- The OKX rubik `taker-volume` official field order and its coin coverage (it is per `ccy` and aggregated, not per pair) were not confirmed in the OKX docs.
- I did not check whether CoinGecko `/coins/categories` is still free without a demo key from a US IP in 2026. It worked keyless from this machine.
