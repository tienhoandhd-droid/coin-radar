# Open-source crypto bot frameworks as a foundation for an automated Binance USDT-M futures bot (status as of 2026-10-19)

Method note: repo facts (license SPDX, primary language, stars, last push, latest release) were pulled live from the GitHub REST API on 2026-10-19 via `gh api repos/<owner>/<repo>` and `.../releases/latest`. Feature facts come from official docs and GitHub issues linked inline. Anything not confirmed from a primary source is marked **UNVERIFIED** or listed under Gaps.

## Which framework best matches our requirements, and what is the integration cost?

### Takeaway
No framework covers our exact trade plan (an exchange-side SL, three partial TPs at 50/30/20, SL moved to entry after TP1, limit-entry expiry, a TS signal brain) out of the box. Freqtrade comes closest among the mature open-source options and has the largest community, but its partial exits are bot-side (they are not resting TP orders on the exchange), its license is GPL-3.0, and it is Python. NautilusTrader has the most complete Binance order and reconciliation model, but it is the heaviest to learn. Hummingbot (Apache-2.0) has a PositionExecutor with SL, TP, a time limit and a trailing stop, but the docs don't show multi-level partial TPs. Jesse live trading is a closed paid plugin. Passivbot is a grid/market-maker that can't take external signals. OctoBot is GPL and moving toward a cloud and node model. On the facts, a hybrid (C) or our own TS layer (A) on top of a maintained MIT Binance client is the strongest option. Freqtrade (B or C) is the fastest path to a working paper/live bot if Python plus GPL is acceptable.

### Cited Findings

**Repo snapshot (GitHub API, 2026-10-19)**
| Project | License (SPDX from repo) | Main lang | Stars | Last push | Latest release |
|---|---|---|---|---|---|
| freqtrade/freqtrade | GPL-3.0 | Python | 55,593 | 2026-10-19 | 2026.9 (2026-09-29) |
| jesse-ai/jesse | MIT (core only, see below) | Python | 8,668 | 2026-10-18 | tag v3.4.0 (no GitHub "release" object); last commit 2026-10-17 |
| hummingbot/hummingbot | Apache-2.0 | Python | 20,574 | 2026-10-15 | v2.17.0 (2026-09-22) |
| Drakkar-Software/OctoBot | GPL-3.0 | Python | 6,826 | 2026-10-16 | 3.0.0-beta3 (2026-10-08) |
| nautechsystems/nautilus_trader | LGPL-3.0 | Rust (+Python API) | 30,322 | 2026-10-19 | v1.231.0 (2026-08-02) |
| enarjord/passivbot | Unlicense | Python (+Rust) | 2,135 | 2026-10-18 | v8.1.0 (2026-08-10) |
| ccxt/ccxt (library) | MIT | multi (JS/TS/Python/…) | 44,461 | 2026-10-19 | v4.5.88 (2026-10-14) |
| binance/binance-connector-js (official) | MIT | TS/JS | 752 | 2026-10-15 | — |
| sieblyio/binance (formerly tiagosiebler/binance, Node/TS SDK) | MIT | TS | 930 | 2026-10-16 | v3.6.8 (2026-10-16) |
Sources: [freqtrade](https://github.com/freqtrade/freqtrade), [jesse](https://github.com/jesse-ai/jesse), [hummingbot](https://github.com/hummingbot/hummingbot), [OctoBot](https://github.com/Drakkar-Software/OctoBot), [nautilus_trader](https://github.com/nautechsystems/nautilus_trader), [passivbot](https://github.com/enarjord/passivbot), [ccxt](https://github.com/ccxt/ccxt), [binance-connector-js](https://github.com/binance/binance-connector-js), [sieblyio/binance](https://github.com/sieblyio/binance)

**Freqtrade (Python, GPL-3.0)**
- Binance Futures: isolated and cross margin. Order types are market and limit. Stoploss-on-exchange supports both `stop-limit` and `stop-market`, chosen by `order_types.stoploss`. — [Freqtrade exchange notes](https://www.freqtrade.io/en/stable/exchanges/)
- Isolated futures require Binance "One-way Mode" and "Single-Asset Mode". Freqtrade checks both at startup and **will not change them**. **Hedge mode is not supported/mentioned.** — [exchange notes](https://www.freqtrade.io/en/stable/exchanges/)
- Futures need order-book pricing (`use_order_book: true`) because "there is no price ticker data for futures". — [exchange notes](https://www.freqtrade.io/en/stable/exchanges/)
- Leverage is set per trade through a `leverage()` strategy callback (default 1.0, capped at `max_leverage`). — [strategy callbacks](https://www.freqtrade.io/en/stable/strategy-callbacks/)
- `liquidation_buffer` (default 0.05) keeps a gap between the stoploss and the liquidation price. Freqtrade calculates liquidation prices but **not liquidation fees**. "Currently only supports one margin mode" per bot. — [leverage docs](https://www.freqtrade.io/en/stable/leverage/)
- The exchange SL can be triggered on `stoploss_price_type` "last"/"mark"/"index", validated at startup. The exchange SL is refreshed every `stoploss_on_exchange_interval` (default 60 s). A manually cancelled SL is re-created on the next check. If the SL can't be placed, the fallback is an `emergency_exit` market order. — [stoploss docs](https://www.freqtrade.io/en/stable/stoploss/)
- Moving the SL to breakeven: `custom_stoploss()` can only move the stop up, except in the `after_fill=True` call made after an order fills. The value also drives the stoploss-on-exchange. — [strategy callbacks](https://www.freqtrade.io/en/stable/strategy-callbacks/)
- Trailing stop exists (`trailing_stop`, `trailing_stop_positive`, offset), but it is bot-managed. A request for a **trailing stop on the exchange is still open** (issue #9662, opened 2024-01-09). — [stoploss docs](https://www.freqtrade.io/en/stable/stoploss/), [issue #9662](https://github.com/freqtrade/freqtrade/issues/9662)
- Partial TPs: `adjust_trade_position()` returns a negative stake to reduce the position. It requires `position_adjustment_enable`. Live it runs every throttle (~5 s); in backtest it runs once per candle, so "results can differ from live". The docs don't describe resting TP orders on the exchange, so partial exits are **bot-side**. — [strategy callbacks](https://www.freqtrade.io/en/stable/strategy-callbacks/)
- Time exits: `custom_exit()`. Limit-entry expiry: `unfilledtimeout` plus `check_entry_timeout()`. Limit price: `custom_entry_price()` (capped at 2% from the proposed rate by default). Fill hook: `order_filled()`. — [strategy callbacks](https://www.freqtrade.io/en/stable/strategy-callbacks/)
- External control: REST `/forceenter` (pair, side long/short, price, ordertype, stakeamount, **leverage**, entry_tag; requires `force_entry_enable`) and `/forceexit` (tradeid, ordertype, **amount** for a partial exit). The API listens on localhost by default and the docs warn strongly against exposing it. — [REST API docs](https://www.freqtrade.io/en/stable/rest-api/)
- Protections: StoplossGuard, MaxDrawdown, LowProfitPairs, CooldownPeriod. — [protections.md](https://raw.githubusercontent.com/freqtrade/freqtrade/develop/docs/includes/protections.md)
- Dry-run mode, persistence in SQLite, and control via Telegram/webUI. Python 3.12+. — [README](https://github.com/freqtrade/freqtrade/blob/develop/README.md)
- Backtest realism tools: `lookahead-analysis` (re-runs per signal to detect future-data use; it only checks signals that actually fire, and forces market orders by default) and a separate recursive-analysis page. — [lookahead-analysis](https://www.freqtrade.io/en/stable/lookahead-analysis/)
- Backtest assumptions: fills at the requested price with **no slippage**; stoploss fills exactly at the stop price even if the low went lower; inside a candle the **low is assumed before the high** (pessimistic for SL); `--timeframe-detail` simulates intrabar moves on a lower timeframe; fees are applied on entry and exit. — [backtesting docs](https://www.freqtrade.io/en/stable/backtesting/)
- Funding in backtest: funding-rate data is often missing for older ranges. `futures_funding_rate` can fill the gap, and the docs recommend 0 unless the real rate is known. In live trading, funding is added to or subtracted from the trade total. — [leverage docs](https://www.freqtrade.io/en/stable/leverage/)

**Hummingbot (Python, Apache-2.0)**
- The V2 PositionExecutor is a "triple barrier" (SL, TP, time limit) plus a trailing stop (`trailing_stop_activation_price_delta`, `trailing_stop_trailing_delta`). The open order defaults to LIMIT; exits default to MARKET. Works on perpetual and spot. Other executors: Grid, DCA, Arbitrage, XEMM, TWAP. — [PositionExecutor docs](https://hummingbot.org/strategies/v2-strategies/executors/positionexecutor/)
- The docs **don't say** whether perpetual SL/TP are exchange-side orders or monitored locally, and don't mention multi-level partial TPs or limit-entry expiry. — [PositionExecutor docs](https://hummingbot.org/strategies/v2-strategies/executors/positionexecutor/)

**NautilusTrader (Rust core + Python, LGPL-3.0)**
- Binance USD-M: perpetuals and delivery. Environments: Live, **Demo** (recommended for new simulated setups) and legacy Testnet. Order types: MARKET, LIMIT, STOP_MARKET, STOP_LIMIT, MIT, LIT, TRAILING_STOP_MARKET. `reduce_only` is supported. Hedge mode works via `OmsType.HEDGING` with position IDs. Leverage and margin type can be set per symbol (`futures_leverages`, `futures_margin_types`). Conditional orders go through Binance **algo endpoints**. — [Nautilus Binance integration](https://nautilustrader.io/docs/latest/integrations/binance/)
- Startup reconciliation is supported: if any position report fails, the call returns an error rather than an incomplete set; fill history is limited to the last 88 days. Order commands are **never auto-retried** (to avoid duplicates); ambiguous results are resolved by reconciliation. **Bracket orders are denied** at submission. Native GTD expiry must be more than 600 s away. — [Nautilus Binance integration](https://nautilustrader.io/docs/latest/integrations/binance/)
- Nautilus also hit the Binance algo-order migration as a bug (issue #3287). — [nautilus_trader #3287](https://github.com/nautechsystems/nautilus_trader/issues/3287)

**Jesse (Python, MIT core)**
- The live-trade plugin is **not open source**: "The package is pre-built and the access is limited to those with an active license". Paper trading is a dashboard toggle. Pricing, exchanges and restart recovery are not on that page. — [Jesse live trading docs](https://docs.jesse.trade/docs/livetrade)

**Passivbot (Python + Rust, Unlicense)**
- It is a "contrarian market maker" (grid/trailing entries that add to positions against the move). Instead of a classic SL it uses an "unstucking" mechanism plus an equity hard stop. It has a backtester and an evolutionary optimizer. The README describes no external or custom signals, so it doesn't fit our signal-driven plan. — [passivbot README](https://github.com/enarjord/passivbot)

**OctoBot (Python, GPL-3.0)**
- Binance spot and futures via REST and websocket, TradingView alert connectors, paper trading, Telegram, backtesting. The latest release runs in "node mode" by default, and backtesting, Telegram and TradingView require a "manual OctoBot". Some features are tied to octobot.cloud. — [OctoBot README](https://github.com/Drakkar-Software/OctoBot)

**TS/Node building blocks (for options A/C)**
- CCXT (MIT, has a JS/TS build) is actively fixing Binance algo-order handling, for example PR #30651 "clientOrderId for swap algo orders" (2026-09-26), #30685 derivatives updates (2026-09-29) and #30742 cancelOrderWs for conditional orders (2026-10-02). — [ccxt #30651](https://github.com/ccxt/ccxt/pull/30651), [ccxt #30685](https://github.com/ccxt/ccxt/pull/30685), [ccxt #30742](https://github.com/ccxt/ccxt/pull/30742)
- Official Binance JS connector (MIT) and sieblyio/binance (MIT, v3.6.8 released 2026-10-16) are maintained. — [binance-connector-js](https://github.com/binance/binance-connector-js), [sieblyio/binance](https://github.com/sieblyio/binance)

### Inferences
- **Option A or C (our TS core decides, a thin TS execution layer on an MIT client)** keeps Node 24 and our tested math, places SL/TP1/TP2/TP3 as **resting exchange orders** (closePosition STOP_MARKET plus reduceOnly TAKE_PROFIT_MARKET legs), and avoids GPL. The cost is that we build reconciliation, a persistence/state machine, Telegram and a paper-fill simulator ourselves. Those are exactly the parts that Freqtrade and Nautilus issue trackers show are hard (see pitfalls).
- **Option B or C with Freqtrade**: the TS core can stay the brain by calling `/forceenter` with price, leverage and stake. The SL can be expressed via `custom_stoploss` (breakeven after TP1 through the `after_fill` call) and TPs via `adjust_trade_position`. Gaps versus our plan: TPs are not resting exchange orders (a home PC that is off means no TP execution, though the exchange SL still protects), one-way mode only, Python/GPL. Integration cost is moderate: a Python strategy shim plus HTTP bridge, and partial-exit and breakeven logic that must be re-tested.
- Because the home PC is not always on, the deciding requirement is that **every protective leg (SL and ideally TPs) lives on the exchange**. Only a custom layer (or Nautilus) gives full control of that. In Freqtrade only the SL is on the exchange.
- Nautilus is technically the strongest match for exchange-side orders and reconciliation, but it is Python/Rust and has a steep learning curve for a beginner maintainer.

### Gaps
- Hummingbot: whether perpetual SL/TP are exchange orders, and Binance algo-order compatibility after 2025-12-09. Not verified.
- Jesse live-plugin price and Binance futures and Telegram support: not on the page fetched.
- Freqtrade Binance Futures **testnet/sandbox**: not documented in exchange notes or configuration.md (a `sandbox-testing.md` doc returned 404). **UNVERIFIED** whether it is supported.
- I didn't find a maintained, reputable TypeScript *framework* (as opposed to a client library) for Binance futures order management. My GitHub repo search returned empty results (tool limitation), so this is not proof that none exists.
- OctoBot specifics (exchange-side SL, partial TPs, hedge mode) not verified.

## Known pitfalls reported by users for Binance futures

### Takeaway
The biggest recent breaking change: since **2025-12-09** Binance USDT-M rejects STOP_MARKET, TAKE_PROFIT_MARKET, STOP, TAKE_PROFIT and TRAILING_STOP_MARKET on `/fapi/v1/order` (error -4120). They must go through `/fapi/v1/algoOrder`. This broke Freqtrade, Nautilus and Python SDK users, and the follow-up bugs (orphaned stops, recovery mis-attribution) continued into 2026. Any home-built layer must use the algo endpoints and the `ALGO_UPDATE` stream from day one.

### Cited Findings
- Binance moved conditional orders to the Algo Service effective 2025-12-09. The old `/fapi/v1/order` and `batchOrders` return -4120 `STOP_ORDER_SWITCH_ALGO`. A new `ALGO_UPDATE` user-stream event exists, and `CONDITIONAL_ORDER_TRIGGER_REJECT` was deprecated 2025-12-15. — [Binance derivatives changelog](https://developers.binance.com/docs/derivatives)
- New Algo Order: `POST /fapi/v1/algoOrder`, `algoType=CONDITIONAL`. Parameters include `triggerPrice`, `workingType` MARK_PRICE/CONTRACT_PRICE (**default CONTRACT_PRICE**), `priceProtect`, `reduceOnly` (not allowed in Hedge Mode or with closePosition), `closePosition` (STOP_MARKET/TAKE_PROFIT_MARKET only, not combinable with quantity), `positionSide` (BOTH in one-way, mandatory LONG/SHORT in hedge), TRAILING_STOP_MARKET `callbackRate` 0.1–10 and `activatePrice`, `clientAlgoId` max 36 chars, and GTD `goodTillDate` more than 600 s ahead. Weight is 1 on the 10 s and 1 min order counters, 0 on IP weight. -2021 "Order would immediately trigger". — [Binance New Algo Order](https://developers.binance.com/docs/derivatives/usds-margined-futures/trade/rest-api/New-Algo-Order)
- Freqtrade 2025.11 failed to place stoplosses with -4120 (issue #12610). The maintainer said no fix was possible until ccxt PRs merged, then released **2025.11.1** with the fix on 2025-12-14. — [freqtrade #12610](https://github.com/freqtrade/freqtrade/issues/12610)
- After the migration, orphaned conditional STOP_MARKET orders appeared (fetch/cancel returns -2013/-2011). The maintainer says the Binance API sometimes "forgets" a placed order on some endpoints "for over half an hour" in high-volume times, so users should "watch your bot/account from time to time for orphaned orders". All stop orders are placed reduceOnly. — [freqtrade #12681](https://github.com/freqtrade/freqtrade/issues/12681)
- Fee data for stoploss-on-exchange trades was not assigned (issue #12680). — [freqtrade #12680](https://github.com/freqtrade/freqtrade/issues/12680)
- Freqtrade 2026.6 on Binance USDT-M one-way: during order recovery after a reversal, a fill from the previous trade's algo stop could be attached to the new trade and **crash-loop** the bot (closed 2026-08-03). — [freqtrade #13399](https://github.com/freqtrade/freqtrade/issues/13399)
- Funding-rate data not downloaded from Binance (historic issue #10531). — [freqtrade #10531](https://github.com/freqtrade/freqtrade/issues/10531)
- Freqtrade warnings: a very wide SL may fail to place, and the bot then uses an emergency market exit. Stop-limit can leave you unfilled. The SL can't update every loop "since the exchange could ban" for excessive requests. — [stoploss docs](https://www.freqtrade.io/en/stable/stoploss/)
- Don't run two bots on one leveraged account, because liquidation calculations assume the bot is the only user. Liquidation fees are not modelled. — [leverage docs](https://www.freqtrade.io/en/stable/leverage/)
- Binance futures trading rules prohibit too-low stake amounts across too many orders, and violations can lead to a trading restriction. Put BNB on the blacklist if BNB is used for fees. — [exchange notes](https://www.freqtrade.io/en/stable/exchanges/)
- Geo-blocking: Binance restricts API access by server country. Freqtrade lists Canada, Malaysia, the Netherlands and the US as blocked (non-exhaustive). — [exchange notes](https://www.freqtrade.io/en/stable/exchanges/)
- Rate limits cited by Nautilus for Binance futures: 2,400 request weight per minute, 300 orders per 10 s, 1,200 orders per minute. Ed25519 keys are recommended, HMAC is deprecated, RSA is not supported (per Nautilus). — [Nautilus Binance integration](https://nautilustrader.io/docs/latest/integrations/binance/)
- Testnet status: Nautilus calls Binance Futures Testnet "legacy … separate accounts and different liquidity" and recommends **Demo** for new futures testing. — [Nautilus Binance integration](https://nautilustrader.io/docs/latest/integrations/binance/)

### Inferences
- For our plan: SL = `STOP_MARKET closePosition=true workingType=MARK_PRICE` via algoOrder. Each TP = `TAKE_PROFIT_MARKET reduceOnly quantity=…`. The SL→entry move after TP1 = cancel and replace the algo SL on the TP1 fill event. This must be idempotent (`clientAlgoId`) because of the "API forgets the order" behavior and the orphaned stops.
- Restart recovery must reconcile from three sources: positions, open normal orders, and **open algo orders** (`openAlgoOrders`). Freqtrade #13399 shows that attributing fills to the wrong trade after a reversal is a real failure mode.
- Websocket disconnects: no primary source fetched in this pass (see Gaps).

### Gaps
- No primary source fetched on listenKey expiry and websocket reconnection behavior for USDT-M user data streams. Check the Binance user-data-stream docs.
- Min notional / `-4164` and `-2019` margin-insufficient errors: not verified in this pass.
- Whether the Binance "Demo" trading environment supports the algo endpoints identically to production: not verified.
- Whether Binance blocks API calls from Vietnam residential IPs: not verified. The US-cloud HTTP 451 is from the task context, not a source fetched here.

## Licensing implications (GPL vs MIT/Apache) for a public repo that also contains our code

### Takeaway
Freqtrade and OctoBot are GPL-3.0, Nautilus is LGPL-3.0, Hummingbot is Apache-2.0, Jesse core and CCXT are MIT, and Passivbot is Unlicense. Jesse's live trading is proprietary. If our public repo is to stay MIT/permissive, building on MIT clients (ccxt, binance-connector-js, sieblyio/binance) is the cleanest route.

### Cited Findings
- License SPDX IDs from the GitHub API: freqtrade GPL-3.0, OctoBot GPL-3.0 (README: "GPL-3.0 or later"), nautilus_trader LGPL-3.0, hummingbot Apache-2.0, jesse MIT, ccxt MIT, passivbot Unlicense, binance-connector-js MIT, sieblyio/binance MIT. — [freqtrade](https://github.com/freqtrade/freqtrade), [OctoBot](https://github.com/Drakkar-Software/OctoBot), [nautilus_trader](https://github.com/nautechsystems/nautilus_trader), [hummingbot](https://github.com/hummingbot/hummingbot), [jesse](https://github.com/jesse-ai/jesse), [ccxt](https://github.com/ccxt/ccxt), [passivbot](https://github.com/enarjord/passivbot)
- Jesse's live plugin is pre-built, license-gated access. — [Jesse docs](https://docs.jesse.trade/docs/livetrade)
- OctoBot offers commercial licenses on request. — [OctoBot README](https://github.com/Drakkar-Software/OctoBot)

### Inferences (not legal advice)
- A Freqtrade strategy file that imports Freqtrade classes is commonly treated as a derivative work. Publishing it in the same repo would then put that part under GPL-3.0 obligations. **UNVERIFIED legal interpretation.** Keeping the TS core as a separate program that only talks to Freqtrade over HTTP (`/forceenter`) is the usual "arm's-length" pattern, and it would let the TS core keep its own license.
- LGPL (Nautilus) allows use as a library from differently licensed code, as long as the LGPL parts stay replaceable or modifiable. **UNVERIFIED**; check with the license text.
- MIT/Apache/Unlicense dependencies impose only notice requirements (Apache also has patent terms).

### Gaps
- No legal source on GPL "linking via HTTP API" was fetched. Treat the above as an inference.
