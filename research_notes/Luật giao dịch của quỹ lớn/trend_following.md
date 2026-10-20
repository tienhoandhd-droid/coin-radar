# Trend following / time-series momentum: CTA rules and the crypto evidence after costs

Scope: the rules large trend followers use (entry signals, exits, filters, sizing, rebalancing) and the published evidence for these rules on crypto, after costs. Target system: Binance USDⓈ-M perpetuals, long and short, Swing mode (1D trend / 4H entry) and Fast mode (1H/15m).
Research date: 2026-10-20. Source-quality tags: [PEER] = peer-reviewed journal; [WP] = working paper or preprint, not peer-reviewed; [PRACT] = practitioner or asset-manager research (has a commercial interest); [SECONDARY] = aggregator, blog or forum.

---

## Q1. Which signal types do CTAs use, with which lookbacks, and how are signals combined?

### Takeaway
The canonical public definitions come in three forms. (a) Return-sign time-series momentum (TSMOM) over 1, 3 and 12 months, equal-weighted and volatility-scaled, as in AQR / Hurst-Ooi-Pedersen. (b) Donchian channel breakouts over many lookbacks combined into an ensemble, as in Turtle 20/55 and Concretum's 5 to 360 days. (c) Continuous "trend-strength" signals that replace the ±1 sign to cut turnover (Baltas-Kosowski). Large funds (Man AHL, Winton) publish no exact parameters; the public material only says they are "more sophisticated" versions of the same logic.

### Cited Findings
- **AQR / Hurst, Ooi, Pedersen, "A Century of Evidence on Trend-Following Investing" (JPM, Fall 2017) [PEER, written by AQR staff].**
  - Signal: "an equal-weighted combination of 1-month, 3-month, and 12-month time-series momentum strategies for the 67 markets", January 1880 to December 2016, rebalanced monthly.
  - Rule: a positive past excess return over the lookback means long, a negative one means short, so the strategy "always holds either a long or short position in every market".
  - Each position is "sized to target the same amount of volatility". The combined portfolio is scaled to "an annualized ex ante volatility target of 10%".
  - Source: [Hurst et al. PDF (Yale mirror)](https://fairmodel.econ.yale.edu/ec439/hurst.pdf)
- **Same paper: signal lag.** Lagging the signal by one month leaves returns positive in most decades, "but the performance naturally deteriorates with the lagging, especially for the shorter-term signals". The average per-market Sharpe is "approximately 0.4" (gross of fees and costs) across 67 markets. — [Hurst et al.](https://fairmodel.econ.yale.edu/ec439/hurst.pdf)
- **Moskowitz, Ooi, Pedersen (JFE 2012) [PEER].** 12-month TSMOM profits are positive "for every asset contract we examine (58 in total)". Returns persist for 1 to 12 months, then partially reverse. Positions are scaled by ex-ante volatility. — [SSRN abstract](https://papers.ssrn.com/abstract=2089463); [Quantpedia summary](https://quantpedia.com/strategies/time-series-momentum-effect/)
- **Counter-evidence.** Huang, Li, Wang and Zhou (2020) conclude that "the evidence for TSMOM is not statistically reliable" at the single-asset level. — [Search summary via buttondown/mdickens](https://buttondown.com/mdickens/archive/contra-time-series-momentum-is-it-there/) [SECONDARY]
- **Baltas & Kosowski, "Demystifying Time-Series Momentum Strategies" [WP; data 1974/1984 to 2013, versions differ].**
  - Replaces the ±1 signal (sign of the 12-month return) with a continuous signal between −1 and +1 based on the statistical significance of the trend (t-stat).
  - Using a more efficient volatility estimator together with this trend rule cuts turnover "by more than one third" with no statistically significant loss of performance. The trend-strength rule alone cuts turnover "by two thirds" compared with the sign rule.
  - Sources: [SSRN 2140091](https://papers.ssrn.com/abstract=2140091); [CME-hosted PDF](https://www.cmegroup.com/education/files/demystifiing-time-series-momentum-strategies.pdf)
- **Turtle rules (Curtis Faith, *Way of the Turtle*), from secondary sources only.**
  - System 1: 20-day breakout, with a "skip rule" that skips a signal if the previous System 1 breakout in the same direction was a winner. Exit long on a 10-day low.
  - System 2: 55-day breakout, no skip rule. Exit on a 20-day low.
  - N = Wilder ATR (20 days). Unified 2N stop. Pyramiding adds a unit every 0.5N, up to 4 units.
  - Sources: [MQL5 article](https://www.mql5.com/en/articles/23448); [TradingView script](https://www.tradingview.com/script/KG9WhlYR) [SECONDARY]
- **Man AHL.** Public material only describes the lineage from Richard Donchian's breakout rule; AHL's systems are "more sophisticated versions of the same core logic" with longer lookbacks. No parameters are published. — [TurtleTrader page on Man AHL](https://www.turtletrader.com/man-investments) [SECONDARY]
- **Concretum ensemble (Zarattini, Pagani, Barbon, "Catching Crypto Trends", SFI RP 25-80) [WP/PRACT].**
  - Lookbacks: 9 Donchian windows, n ∈ {5, 10, 20, 30, 60, 90, 150, 250, 360} days, on closing prices.
  - Entry: close = n-day Donchian upper band.
  - Combination: Combo = simple average of the 9 weights, w^Combo = (1/N)·Σ wⁿ.
  - Sources: [Paper PDF](https://concretumgroup.com/wp-content/uploads/2026/02/Catching-Crypto-Trends.pdf); [abstract on Concretum](https://concretumgroup.com/catching-crypto-trends-a-tactical-approach-for-bitcoin-and-altcoins/)
- **Concretum note: exits matter more than the indicator.** A test with randomly generated entry signals supports "the notion that the choice of trend indicator may be secondary to position management and exits". — [Paper PDF, footnote](https://concretumgroup.com/wp-content/uploads/2026/02/Catching-Crypto-Trends.pdf)

### Inferences
- The industry consensus is: many lookbacks (short through long), equal-weighted, volatility-scaled positions, applied across many assets. Single-lookback, single-asset systems have a less stable Sharpe.
- A ±1 signal produces high turnover; continuous or ensemble signals ("fractional" positions) reduce turnover. This matters for crypto because fees are charged on every adjustment.

### Gaps
- No exact parameters from Man AHL, Winton, Campbell or Quantica (proprietary). I did not find a primary document from these firms describing lookbacks.
- The Turtle 1%-of-equity-per-N unit size could not be confirmed from a primary source in this session; it is commonly cited but unverified here.
- I did not verify MOP 2012's exact volatility target (often cited as 40% per asset) and Sharpe figures from the paper's tables.

---

## Q2. How do trend followers exit? Trailing stops vs signal reversal vs time exits; fixed TP; win rate and payoff ratio

### Takeaway
None of the canonical systems uses a fixed take-profit. AQR-style TSMOM exits only when the signal reverses (monthly rebalance). Turtle and Donchian systems use an opposite-channel or midline trailing stop plus an ATR stop. The trade profile is a low-to-medium win rate (≈34–49% at short-to-medium lookbacks) with a gain:loss ratio of about 3–9×; profits are concentrated in a small share of trades.

### Cited Findings
- **Hurst et al. exit.** There is no stop; the position flips or rebalances monthly with the sign of the 1/3/12-month return. — [Hurst et al.](https://fairmodel.econ.yale.edu/ec439/hurst.pdf)
- **Turtle exit.** Exit on a 10-day low (System 1) or 20-day low (System 2), plus a 2N hard stop. There is no take-profit. — [MQL5](https://www.mql5.com/en/articles/23448) [SECONDARY]
- **Concretum exit.**
  - The position is held "until the first closure below a trailing stop", where TrailingStop_{t+1} = max(TrailingStop_t, DonchianMid_t). DonchianMid = 0.5·(Up + Down).
  - The initial stop is the channel midline at entry. The stop is "never" moved downward; for shorts it uses min.
  - There is no take-profit.
  - Source: [Paper PDF](https://concretumgroup.com/wp-content/uploads/2026/02/Catching-Crypto-Trends.pdf)
- **Concretum trade statistics: BTC long-only, 2015-01-01 to 2025-03-19, NO transaction costs.** Table 2 shows the win rate rising as the lookback lengthens:

  | Lookback | Trades | Win rate | Gain:Loss | MaxRet | MinRet |
  |---|---|---|---|---|---|
  | 5d | 292 | 41% | 3.7 | 29% | −5% |
  | 10d | 156 | 40% | 4.5 | — | — |
  | 20d | 78 | 47% | 5.2 | — | — |
  | 30d | 49 | 49% | 6.7 | — | — |
  | 60d | 28 | 46% | 9.2 | — | — |
  | 90d | 20 | 60% | 6.5 | — | — |
  | 150d | 15 | 60% | 4.1 | — | — |
  | 250d | 9 | 78% | 4.7 | — | — |
  | 360d | 5 | 80% | 12.8 | — | — |

  Source: [Paper PDF](https://concretumgroup.com/wp-content/uploads/2026/02/Catching-Crypto-Trends.pdf)
- **Concretum trade statistics: BTC long-short, no costs (Table 6).** Win rates are 37% (5d, 591 trades), 34% (10d), 41% (20d), 39% (30d), 39% (60d), 41% (90d), 48% (150d), 67% (250d) and 57% (360d). Gain:Loss ratios are 2.82, 3.45, 3.68, 4.27, 5.44, 4.71, 3.36, 4.97 and 12.68 respectively. Adding the short side lowers both the win rate and the payoff ratio. — [Paper PDF](https://concretumgroup.com/wp-content/uploads/2026/02/Catching-Crypto-Trends.pdf)
- **ATR trailing stop on Binance perps (AdaptiveTrend, arXiv 2602.11708) [WP].**
  - Stop rule: S_t = max(S_{t−1}, P_t − α·ATR_t), with a robust α plateau of 2.0–3.5 and optimum ≈2.5.
  - Ablation without the trailing stop: Sharpe falls from 2.41 to 1.68 and MDD worsens from −12.7% to −22.4%.
  - Win rate by regime: 54.2% (bull), 47.8% (sideways), 41.3% (bear).
  - Source: [arXiv HTML](https://arxiv.org/html/2602.11708v1)
- **Concentration of profits.** In a Zarattini, Pagani and Wilcox study of stock trend following, "less than 7% of trades generate the majority of cumulative profits". — [Harbourfront summary](https://harbourfrontquant.substack.com/p/does-trend-following-still-work-on) [SECONDARY; stocks, not crypto]
- **Win rate is a weak metric for positively skewed strategies.** Small losses are frequent; big gains are rare. — [arXiv 2101.01006](https://arxiv.org/pdf/2101.01006v1) [WP]

### Inferences
- A fixed TP1 at the nearest support/resistance zone runs directly against the trend-following mechanism. Gain:Loss of 3–9× in the Concretum tables comes from a handful of trades with MaxRet of 29–350%. Cutting winners at TP1 (even if only partially) lowers the payoff ratio and pushes the system toward needing a win rate above 50%.
- If TP1 is kept, the partial size taken off should be small and the remainder should ride the trailing stop. That is an inference; no source tests TP1 at S/R.

### Gaps
- No published study tests "partial TP at an S/R zone + trailing" against "trailing only" on crypto.
- No win rate or payoff data from large CTAs (Man AHL, Winton) at the trade level.

---

## Q3. Position sizing: vol targeting, ATR units, risk parity vs fixed 2% risk per trade

### Takeaway
Large trend followers size by volatility, not by fixed % risk to the stop. Each market gets equal risk (risk parity across assets) and the portfolio is scaled to a volatility target (10% at AQR, 25% per asset at Concretum, 20% in Concretum's intraday version). Rebalancing because of volatility changes is a large cost source; a 20% threshold rule cuts it.

### Cited Findings
- **AQR.** Equal volatility per market, portfolio ex-ante volatility target of 10% p.a. — [Hurst et al.](https://fairmodel.econ.yale.edu/ec439/hurst.pdf)
- **Concretum weight formula.**
  - wⁿ_t = min(0.25/σ_t, 200%) × Posⁿ_t, where σ_t is the annualized volatility over 3 months of daily returns. That gives a 25% target with a 200% leverage cap.
  - Portfolio: equal capital (1/B) per asset, monthly rebalance.
  - Liquidity exit: an asset is removed if its 30-day median daily volume is < $1 million, or its median daily change is < 0.5%.
  - Source: [Paper PDF](https://concretumgroup.com/wp-content/uploads/2026/02/Catching-Crypto-Trends.pdf)
- **Concretum: limits of vol targeting.** Volatility targeting shrinks the position precisely when a trend accelerates (volatility rises), which "creates a structural trade-off between risk management and trend participation". The authors tested alternative methods (volatility parity, pyramiding) on traditional assets. — [Paper PDF](https://concretumgroup.com/wp-content/uploads/2026/02/Catching-Crypto-Trends.pdf); [Concretum position-sizing article](https://concretumgroup.com/position-sizing-in-trend-following-comparing-volatility-targeting-volatility-parity-and-pyramiding/)
- **Turtle.** Unit sized by N (ATR); a 2N stop; at most 4 units per market. — [MQL5](https://www.mql5.com/en/articles/23448) [SECONDARY]
- **AdaptiveTrend.** Equal weight within each leg, 70% capital long / 30% short, monthly rebalance. 70/30 beats 50/50 on Sharpe (2.41 vs 2.12). — [arXiv HTML](https://arxiv.org/html/2602.11708v1) [WP]
- **Concretum intraday version.** Exposure is "volatility-scaled to a 20% annualized volatility target". — [Concretum seasonality post](https://concretumgroup.com/seasonality-in-bitcoin-intraday-trend-trading/)

### Inferences
- Fixed 2% risk per trade is a form of ATR sizing (risk = distance to the stop). It does not control total portfolio risk when many correlated coins enter at once. Crypto correlations are high, so 5 altcoin longs at 2% each are close to one 10% bet on the "market" factor. CTAs avoid this by targeting volatility at the portfolio level.
- Volatility-driven rebalancing (as opposed to signal-driven trades) should only run when the deviation exceeds a threshold (Concretum uses 20%).

### Gaps
- I found no study that compares fixed-% risk per trade directly with vol targeting on crypto.

---

## Q4. Crypto evidence: daily vs intraday, after costs, concentration in a few trends

### Takeaway
After a realistic 10 bps cost, daily Donchian-ensemble trend following on BTC/ETH/top-20 coins has a Sharpe of ≈1.5 (2015 to March 2025, Concretum, not peer-reviewed). Results vary widely across altcoins (Sharpe 0.21–1.68). On Binance perps 2022–2024, one preprint finds 4H–8H bars best (Sharpe 2.08–2.41) and 1H worst (1.54, turnover 412%/month). Costs erode short-lookback / short-timeframe versions much faster. No peer-reviewed study gives a net Sharpe at 15m/1H on perpetuals.

### Cited Findings
- **Liu & Tsyvinski, "Risks and Returns of Cryptocurrency" (NBER WP 24877, 2018; RFS 2021) [PEER in its final version].**
  - Strong TSMOM at daily and weekly frequencies for BTC, XRP and ETH.
  - A one-standard-deviation increase in the current week's BTC return is associated with a 3.16% higher return the following week.
  - Exposure to traditional factors is small.
  - Sources: [NBER w24877](https://www.nber.org/system/files/working_papers/w24877/w24877.pdf); [VoxEU](https://cepr.org/voxeu/columns/risks-and-returns-cryptocurrencies)
  - Caveat: the figures "top quintile 11.2% vs 2.6% next week" come from [CXO summary](https://www.cxoadvisory.com/currency-trading/crypto-asset-risks-and-returns/) [SECONDARY]; they may be confused with the Google-search test. Not verified.
- **Concretum: BTC long-only, NO costs (Table 1).**
  - The Combo model has CAGR 30%, Vol 17%, Sharpe 1.58, Sortino 2.03, MDD 19% (BTC passive >80%), alpha 14%/yr, beta 0.17.
  - The 5–30-day models are best: Sharpe 1.55–1.66 (5d: CAGR 36%, Sharpe 1.66, MDD 25%).
  - The 150d model is weakest: Sharpe 0.99.
  - Source: [Paper PDF](https://concretumgroup.com/wp-content/uploads/2026/02/Catching-Crypto-Trends.pdf)
- **Concretum cost sensitivity.**
  - Costs were tested at 0/10/25/50 bps. At 50 bps the 5-day model's CAGR falls "from 34% to 18%"; longer-term models are less affected.
  - The 20% rebalance threshold recovers ≈100 bps/yr at 50 bps cost.
  - From that point on, every result is net of 10 bps (citing Liu & Tsyvinski 2021) with the 20% threshold. The authors note that the actual cost on large exchanges is "below 5 bps".
  - Source: [Paper PDF](https://concretumgroup.com/wp-content/uploads/2026/02/Catching-Crypto-Trends.pdf)
- **Concretum: single coins, NET of 10 bps (Table 3), Combo model, from 2015 or the listing date.**

  | Coin | CAGR | Sharpe | MDD |
  |---|---|---|---|
  | BTC | 30% | 1.56 | 19% |
  | ETH | 27% | 1.51 | 15% |
  | SOL | 27% | 1.68 | 12% |
  | AVAX | 22% | 1.49 | 12% |
  | DOGE | 24% | 1.20 | 15% |
  | BNB | 17% | 1.06 | 17% |
  | XRP | 18% | 1.00 | 14% |
  | ADA | 17% | 1.13 | 18% |
  | LTC | 11% | 0.72 | 29% |
  | BCH | 7% | 0.48 | 19% |
  | EOS | 7% | 0.53 | 19% |
  | DOT | 7% | 0.60 | 17% |
  | ATOM | 6% | 0.47 | 16% |
  | FIL | 5% | 0.39 | 30% |
  | BSV | 3% | 0.21 | 23% |

  Source: [Paper PDF](https://concretumgroup.com/wp-content/uploads/2026/02/Catching-Crypto-Trends.pdf)
- **Concretum portfolio: long-only, NET of 10 bps (Table 4), 2015 to 2025-03-19.**
  - Top 20 by volume: Tot.Ret 443%, CAGR 18%, Vol 9%, Sharpe 1.57, Sortino 1.97, MDD 11%, alpha 10.8%, beta 0.08.
  - 5 assets: Sharpe 1.44. 50 assets: Sharpe 1.54.
  - Diversification benefit flattens after about 20 assets.
  - Sharpe shows no clear pattern across liquidity deciles (Figure 6).
  - Source: [Paper PDF](https://concretumgroup.com/wp-content/uploads/2026/02/Catching-Crypto-Trends.pdf)
- **Concretum equity curve shape.** The equity curve is "stair-step": periods of consolidation or mild drawdown, then sharp jumps. Returns are concentrated in a few big trend phases. — [Paper PDF](https://concretumgroup.com/wp-content/uploads/2026/02/Catching-Crypto-Trends.pdf)
- **Concretum intraday BTC, long-short, 2018–2025.**
  - Ensemble of high-frequency trend models with a 20% vol target. Sharpe ≈1.6 **GROSS of fees** (no net figure published on the page).
  - Long-only vol-targeted BTC: Sharpe "just below 0.8".
  - Returns are concentrated from Sunday 7 PM New York time through Monday (the "Monday Asia Open Effect"), stronger after mid-2020.
  - Source: [Concretum seasonality](https://concretumgroup.com/seasonality-in-bitcoin-intraday-trend-trading/) — **flag: NOT after costs.**
- **AdaptiveTrend (Bui & Nguyen, arXiv 2602.11708, 2026) [WP, not peer-reviewed; has internal inconsistencies].**
  - Data: Binance Futures perps, 150+ contracts, 6H bars, OOS January 2022 to December 2024.
  - Costs: 4 bps taker fee + slippage proportional to 5-minute volume + 8H funding.
  - 70/30 result: return 40.5%/yr, Vol 16.8%, Sharpe 2.41, MDD −12.7%.
  - Baselines: Vol-scaled TSMOM Sharpe 1.83 (MDD −16.1%); TSMOM-1M 0.65 (MDD −34.8%); TSMOM-3M 0.54; BTC buy-and-hold 0.17 (MDD −64.1%).
  - Costs 0/4/8/12 bps → Sharpe 2.87 / 2.41 / 2.01 / 1.62.
  - Fixed parameters (no monthly re-optimization): Sharpe 1.34, MDD −28.6%. This suggests a large part of the performance comes from optimization, so overfitting risk is high.
  - Source: [arXiv HTML](https://arxiv.org/html/2602.11708v1)
- **AdaptiveTrend by timeframe, net of 4 bps.**

  | Timeframe | Sharpe | MDD | Trades/month | Turnover |
  |---|---|---|---|---|
  | H1 | 1.54 | −21.3% | 847 | 412% |
  | H4 | 2.08 | −15.6% | 213 | 186% |
  | H6 | 2.41 | −12.7% | 142 | 134% |
  | H8 | 2.18 | — | — | 112% |
  | H12 | 1.91 | — | — | 87% |
  | D1 | 1.63 | −19.4% | 41 | 52% |

  Source: [arXiv HTML](https://arxiv.org/html/2602.11708v1)
- **Han, Kang & Ryu.** After accounting for transaction costs, crypto TSMOM evidence remains strong but cross-sectional momentum is weak. — [AUT PDF](https://acfr.aut.ac.nz/__data/assets/pdf_file/0009/918729/Time_Series_and_Cross_Sectional_Momentum_in_the_Cryptocurrency_Market_with_IA.pdf) [WP]
- **Shen, Urquhart & Wang (Financial Review 2022) [PEER].** BTC intraday momentum: the first half-hour predicts the last half-hour. Gains appear mainly in downturns and are explained by liquidity provision. No net Sharpe found. — [Birmingham repository](https://research.birmingham.ac.uk/en/publications/bitcoin-intraday-time-series-momentum/)
- **Le & Ruthbah (2024) [WP].** SMA 20/65/150/200-day rules on BTC, ETH and the S&P Crypto LargeCap ex-MegaCap index, with costs of 0.1%/0.25%/0.5%. I did not find the result figures. — [CXO summary](https://cxoadvisory.com/technical-trading/applying-simple-trend-following-rules-to-cryptocurrencies)
- **Rohrbach, Suremann, Osterrieder (2017) [WP].** TSMOM suits fiat FX best; for crypto, cross-sectional momentum fits better. Higher-volatility currencies have higher Sharpe. — [U Twente](https://research.utwente.nl/en/publications/momentum-and-trend-following-trading-strategies-for-currencies-re/)
- **Rozario et al. (arXiv 2009.12155, 2020) [WP].** Reports "255% walkforward annualised returns". The abstract gives no cost assumption, Sharpe or MDD. **Flag: not confirmed to be after costs.** — [arXiv](https://arxiv.org/abs/2009.12155v1)

### Inferences
- At daily or slower horizons (relevant to Swing 1D/4H), the evidence is fairly consistent: net Sharpe ≈1.0–1.6 for BTC/ETH/majors and below 0.8 for many weaker altcoins. At 1H the net Sharpe falls and turnover spikes. 15m has no reliable net-of-cost evidence.
- At Binance VIP0 taker fees (~4–5 bps per side) plus slippage, the Fast mode (1H/15m) faces costs that grow linearly with trade count. In AdaptiveTrend, H1 has 6× the trades of H6 and a Sharpe 0.87 lower.
- Returns are concentrated in a few large trend phases (stair-step curve). Fixed take-profits or a tight filter that misses a big trend will remove most of the expected value.

### Gaps
- No peer-reviewed study tests 15m/1H trend following on Binance perps after fees + slippage + funding.
- No exact figures found for the share of profit coming from the top-N trades in crypto.
- Grayscale, Fidelity, 21Shares and CoinShares: I found no research note with a full trend backtest including costs. Search results only returned indicator pages.
- I did not extract Hurst et al.'s Exhibit 1 net numbers, because the table is an image. A secondary source cites ≈14.3% net / 9.9% vol for the 1903–2012 version, which is unverified. — [Search snippet] (not cited as fact)

---

## Q5. Long/short asymmetry in crypto

### Takeaway
On BTC (2015–2025), adding the short side LOWERS the Sharpe of the Donchian ensemble: 1.58 → 1.31 with no costs, and 1.57 → 1.24 net of 10 bps for a top-20 portfolio. The short leg mainly lowers beta (close to 0) and raises alpha, not total return. Practitioner research deliberately weights short exposure lower or treats it more strictly.

### Cited Findings
- **Concretum BTC long-short Combo, NO costs.**
  - CAGR 27%, Vol 18%, Sharpe 1.31, MDD 19%, alpha 20%, beta 0.07.
  - Compare long-only: Sharpe 1.58, beta 0.17.
  - Individual long-short models: Sharpe 0.67 (150d) to 1.15 (20d).
  - Source: [Paper PDF, Table 5](https://concretumgroup.com/wp-content/uploads/2026/02/Catching-Crypto-Trends.pdf)
- **Concretum top-20 long-short portfolio, NET of 10 bps.**
  - CAGR 16%, Vol 10%, Sharpe 1.24, MDD 13%, alpha 15.5%, beta 0.00.
  - Compare long-only top-20: Sharpe 1.57, MDD 11%.
  - Source: [Paper PDF, Table 7](https://concretumgroup.com/wp-content/uploads/2026/02/Catching-Crypto-Trends.pdf)
- **Concretum on short-selling costs.** The authors focus on long-only partly because "the estimation of short-selling costs, particularly for less liquid tokens, remains highly uncertain, rendering long-short backtests sensitive to modeling assumptions". — [Paper PDF](https://concretumgroup.com/wp-content/uploads/2026/02/Catching-Crypto-Trends.pdf)
- **AdaptiveTrend asymmetry.**
  - The short leg requires a higher Sharpe threshold (1.7 vs 1.3 for longs) and gets only 30% of capital.
  - Short-leg capacity is ≈$5–10M before slippage exceeds 10 bps; the long leg is not constrained up to ≈$50M.
  - Bear regime: −4.2%/yr, Sharpe −0.31. Even with a short leg, the system loses money in bear markets.
  - Separate long and short P&L is not reported.
  - Source: [arXiv HTML](https://arxiv.org/html/2602.11708v1)
- **Shen, Urquhart & Wang.** Gains from BTC intraday momentum come mainly "in downturns" (a different signal from daily trend). — [Birmingham](https://research.birmingham.ac.uk/en/publications/bitcoin-intraday-time-series-momentum/)

### Inferences
- Crypto has a long-term upward drift plus sharp short squeezes, so short trend trades have a lower win rate and payoff ratio (long-short 5d: 37% / 2.82 vs long-only 41% / 3.7). The short leg is mainly a hedge, not a profit source.
- On perps, the short side also pays or receives funding. In bull phases funding is usually positive (shorts receive it), which helps; but the Concretum study used spot data and ignored this. AdaptiveTrend includes funding but does not split P&L by leg.

### Gaps
- No study found reports P&L for the short leg alone on altcoin perps after funding.

---

## Q6. Main failure modes: choppy markets, whipsaw, post-publication decay

### Takeaway
Trend following loses in sideways or choppy regimes (whipsaw) and in bear phases without a clear trend. Short lookbacks are more fragile to costs. Large CTAs have had multi-year drawdowns. Crypto results depend heavily on parameter choice and in-sample optimization.

### Cited Findings
- **Hurst et al.** The diversified TSMOM strategy "has experienced significant drawdowns, losing up to 25%, over extended time periods" (1880–2016, gross of fees, net of costs). — [Hurst et al.](https://fairmodel.econ.yale.edu/ec439/hurst.pdf)
- **Man AHL Diversified.** Lost 7.8% in 9 days of April, taking year-to-date losses to −15.15% (the article's year is not shown in the snippet; I could not check it). — [Hedgeweek](https://hedgeweek.com/news/man-groups-trend-tracker-facing-one-of-its-toughest-years-on-record) [SECONDARY]
- **AdaptiveTrend by regime.** Sideways regime: Sharpe 1.87, win rate 47.8%. Bear regime: Sharpe −0.31, win rate 41.3%. Fixed parameters cut the Sharpe from 2.41 to 1.34 (sign of overfitting). — [arXiv HTML](https://arxiv.org/html/2602.11708v1)
- **Concretum: costs hit short lookbacks hardest.** 5d CAGR falls 34% → 18% at 50 bps. — [Paper PDF](https://concretumgroup.com/wp-content/uploads/2026/02/Catching-Crypto-Trends.pdf)
- **Hurst et al.: signal lag hurts short horizons most.** A one-month lag hurts mainly the short-term signals. This implies short horizons are sensitive to execution speed. — [Hurst et al.](https://fairmodel.econ.yale.edu/ec439/hurst.pdf)
- **Statistical reliability of TSMOM is debated.** Huang et al. (2020). — [mdickens summary](https://buttondown.com/mdickens/archive/contra-time-series-momentum-is-it-there/) [SECONDARY]
- **Turnover as a hidden cost.** Moving from a ±1 signal to a trend-strength signal cuts turnover by 1/3 to 2/3 without significant loss. — [SSRN 2140091](https://papers.ssrn.com/abstract=2140091)

### Inferences
- For the Fast mode (1H/15m), the evidence points to the highest risk being costs plus whipsaw. If it is kept, it needs a stronger regime filter, for example only trading in the direction of the daily trend, and a cap on trade frequency.
- Crypto published results are mostly 2015–2025 backtests by their authors (not peer-reviewed, and Concretum is an asset manager). Expect real-world performance to be lower.

### Gaps
- I found no study that measures crypto trend-following decay after publication. The 2017–2025 sample is too short to test.
- I found no quantified data on 2023–2026 CTA industry drawdowns from a primary source in this session.
