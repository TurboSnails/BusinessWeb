# L-039 数据可得性与质量

数据日为 UTC。日频来源的共同截点为 2026-11-26，剔除下载当日尚未完成的日线。逐响应 URL、参数、下载时间、行数、时间界及 SHA-256 见 [SOURCES.md](../../../data-raw/crypto-trend/SOURCES.md)。下表是此次实测覆盖，不是服务商承诺。

| 来源 | 今次可得覆盖 | 频率与访问 | 局限 |
|---|---|---|---|
| [Binance 现货 REST](https://data-api.binance.vision/api/v3/klines)、[公共 ZIP 说明](https://github.com/binance/binance-public-data) | BTCUSDT、ETHUSDT 皆 2017-08-17 → 2026-11-26，各 3,389 根 | 日 OHLC，免费免 key | 从上架开始，USDT 计价、单所成交。REST 用毫秒，公共 ZIP 的现货时间戳自 2025 年改为微秒。 |
| [Coin Metrics Community 日序列](https://community-api.coinmetrics.io/v4/timeseries/asset-metrics)、[PriceUSD 定义](https://coverage.coinmetrics.io/asset-metrics/PriceUSD) | BTC 2010-07-18 → 2026-11-26，5,976 个价格；ETH 2015-08-08 → 2026-11-26，4,129 个价格 | 日价格，免费免 key | 数据日 t 覆盖 [t 00:00, t+1 00:00) UTC，PriceUSD 为 t+1 00:00 UTC 的 USD 参考价，单值无 OHLC。早期代表性与今日定盘不同，不能当成可成交的下一日开盘价。 |
| [Coin Metrics 当前供应量和 MVRV](https://community-api.coinmetrics.io/v4/catalog-v2/asset-metrics?metrics=CapMrktCurUSD,CapMVRVCur,SplyCur,CapRealUSD) | BTC SplyCur 自 2009-01-03，ETH 自 2015-07-30；两币有效推导值自各自 PriceUSD 首日起，同为 5,976 和 4,129 日 | 日频，三项社区输入免费免 key；直接 CapRealUSD 两币均 HTTP 403 | 当前版本的链上读数可修订，首印和真实历史上线时间无逐日快照。供应量及已实现价格口径也与用户在交易所的实际成本不同。 |
| [Bitstamp OHLC](https://www.bitstamp.net/api/) | BTC/USD 2011-08-18 → 2026-11-26，5,580 个日期；ETH/USD 用于抽查，抽中日期最早 2017-08-17 | 日 OHLC，免费免 key | 交易所价格只代表该场所；BTC 早期 OHLC 虽连续，交易规模非常小。返回区间可能比请求宽，净重复诊断见下文。 |
| [Binance USDT 永续资金费率](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data) | BTCUSDT 2019-09-10 08:00 起 7,904 条；ETHUSDT 2019-11-27 08:00 起 7,670 条；ZECUSDT 2020-02-04 08:00 起 7,463 条。均至 2026-11-26 16:00 | 实测三合约每 8 小时，免费免 key | 早期标记价列缺失，衍生品只有平台特定成本与风险。结算时间有毫秒级抖动。 |
| [Binance 永续成交／标记价](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data) | 成交日线 BTC 2019-09-08 起 2,637 根，ETH 2019-11-27 起 2,557 根，ZEC 2020-02-05 起 2,487 根；日标记 BTC/ETH 2019-12-23 起各 2,531 根，ZEC 2020-02-04 起 2,488 根；均至 2026-11-26 | 日 OHLC 与 8 小时标记价，免费免 key | 以同结算时点的 8 小时标记 K 线开盘近似旧结算标记。日低点不知道发生时刻，不能跨市场或不同合约共用。 |
| [BitMEX XBTUSD 历史资金费率接口](https://www.bitmex.com/api/v1/funding?symbol=XBTUSD&count=2&reverse=false) | 合约 2016-05-13 上线，2026-09-16 到期；旧 REST 403，公开归档入口返回关闭公告，本次未取得记录 | 历史公开接口曾无需 key；末期官方说明按 8h 计息 | 不能证实 2016 至 Binance 前的实际首末条或缺口。XBTUSD 是 BTC 保证金反向合约，与 USDT 线性永续不同。期前采用现货。 [CFTC 上线记录](https://www.cftc.gov/media/7221/enfreedconsentorder050522/download) · [BitMEX 结算公告](https://www.bitmex.com/blog/reduce-only-september/) · [关闭公告](https://www.bitmex.com/wind-down/) |

### 已实现价格

定义为 CapRealUSD / SplyCur。两币直接请求 CapRealUSD 都收到明确的社区权限拒绝，免费 catalog 也未列该字段。可以按 MVRV 的定义反推：

**已实现价格 = CapMrktCurUSD / CapMVRVCur / SplyCur**。

这是同一数据源、同一供应量和时点的恒等式。逐日核对 CapMrktCurUSD / SplyCur 与 PriceUSD，在本脚本的 Decimal 精度内全部相等。两币所有计算日三字段均为正，逐日比较 CapMVRVCur < 1 与 PriceUSD < 反推已实现价格，信号零分歧。底部信号直接采用同源 CapMVRVCur，已实现价格用于展示，Bitstamp BTC/USD 用于现货执行。未使用付费 CapRealUSD 独立比对。ETH 有同形式的推导值，但 ETH 帐户型链的移动成本口径与 BTC UTXO 不同，本研究只使用 BTC 底部信号。 [Coin Metrics MVRV 字段](https://coverage.coinmetrics.io/asset-metrics/CapMVRVCur) · [市值字段说明](https://docs.coinmetrics.io/tutorials-and-examples/tutorials/ndp_marketcap_metrics)

2025-01-01 之后观测到的 AssetEODCompletionTime 相对日收盘，BTC 中位数 3.00 小时，3/695 个日子超过 24 小时，最大 94.17 小时。ETH 中位数 3.37 小时，79/695 天超过 24 小时，最大 1,079.10 小时。该字段是全部指标计算完成时间，并不能证明 MVRV 单项的首印时间。历史首印缺口使旧史 K2 只适合回溯核验。前推按实际下载时间留档，仅在候选规定的换日截止前取得才使用。 [字段说明](https://docs.coinmetrics.io/network-data/network-data-overview/availability/asseteodcompletiontime)

### 交易所资金与交易价的交集

费率结算点按最近 UTC 分钟核对，原始时间戳保留。三个市场均有连续的 00:00、08:00、16:00 UTC 结算，零缺口、零重复。结算记录里的标记价都从 2023-10-31 08:00 才出现。加入 8h 标记 K 线开盘后，BTC 首段仍缺 312 个结算标记，ETH 缺 78 个，尾端均为 2019-12-23 00:00；ZEC 无未匹配结算点，但其成交日线次日才起。整天共同覆盖可用起点为 BTC/ETH 2019-12-24、ZEC 2020-02-05。8h 开盘标记与结算价格仅近似同步，分别保留数据来源。期外不得以零或固定 11% 代填。2021-12-04 ZECUSDT 的 Binance 成交日低为 141.17 USDT，标记日低为 141.74 USDT。仅核对原始报价，截图没有足够的账户与仓位信息来核验当日强平。

## 历史市值与幸存者偏差

- **Coin Metrics Community**。2026-11-27 分页查询的目录中，CapMrktCurUSD 日频覆盖 135 个资产代码。它是可核验链上供应量的数据集，缺少部分市场资产，不等同于完整可交易宇宙，且代码中包含各链表示和包装版本。FTT 的该指标自 2019-08-20 提供至 2026-11-26；LUNA 自 2020-02-24 有 PriceUSD，但无 CapMrktCurUSD，也未看到 LUNC 的市值覆盖。完整资产列表见末尾。 [社区目录](https://community-api.coinmetrics.io/v4/catalog-v2/asset-metrics?metrics=CapMrktCurUSD)
- **CoinGecko**。Demo 免费 API 仅过去 365 天，正式 Demo 用 API key。超过 365 天的日历史需付费层；分币 ID 的历史市值也不能单独证明某天的全市场名单与退市覆盖。 [CoinGecko 历史权限说明](https://www.coingecko.com/learn/coingecko-api-troubleshooting-guide-and-solutions)
- **CoinMarketCap**。免费免 key 的历史网页从 2013-04-28 开始，索引按周浏览，样本中也有额外日期可访问。2022-04-10 的旧 Terra（LUNA）排第 9，2022-06-12 的 FTX Token（FTT）排第 19；可见历史截面确实留下部分后来暴跌的币。2018-01-07 是 XRP 第 2、ETH 第 3，足以否定「BTC 和 ETH 一直市值前二」。网页可作为定期历史选币研究的候选，仍需验证全部所需截面、稳定币和跨链去重、日后有无重写、退市价、市场上架与可执行成交。专业 API 可请求日截面，回溯范围看订阅层。 [快照索引](https://coinmarketcap.com/historical/) · [首日](https://coinmarketcap.com/historical/20130428/) · [XRP/ETH](https://coinmarketcap.com/historical/20180107/) · [LUNA](https://coinmarketcap.com/historical/20220410/) · [FTT](https://coinmarketcap.com/historical/20220612/) · [API 说明](https://coinmarketcap.com/api/documentation/pro-api-reference/cryptocurrency)

**本阶段做不到**用已核实的免费数据重建 2011–2026 年全时段、含退市币并可执行的五币历史篮子，也无法确认截图的五个标的。可行退路为 BTC 单标的确认、ETH/ZEC 只报告，结论限定于 BTC。若以后用 CMC 周或月截面，应作为单独预注册的可交易历史篮子研究。

## 缺日、重复、异常

- Binance BTC/ETH 现货、三种永续成交／标记日线，各自首末间零缺日、零重复，零非正价或 OHLC 顺序异常。8h 标记价与结算的匹配缺口见上。Coin Metrics 价格及三项派生输入各自有效覆盖区间零缺日、零重复和零无效推导值。
- Bitstamp BTCUSD 保留 5,771 条原始响应记录。最后请求被服务商按 limit 从结束日向前补足，与前页重叠 191 个日期（2024-03-02 → 2024-09-08）。同日原始字段一致，回放按日期仅保留一条，冲突即报错。5,580 个唯一日无缺日、无 OHLC 顺序异常。ETH 专用于跨所抽查，短请求也返回最多 1,000 根，取所请求抽查日。
- 交叉核对是同一 UTC 日期收盘，误差 = 主源 / Bitstamp USD 收盘 − 1。Binance USDT 与 Bitstamp USD 的偏离混合了平台价差和报价币差异。不据价差改写价格。Coin Metrics 跨平台指数可能使用 Bitstamp，早期资料交叉核对比较的是独立获取的两个序列，并非证明底层成交流独立。样本不代表所有日内低点。

### Coin Metrics BTC/USD 对 Bitstamp

10/10 匹配。绝对误差中位数 0.3285%，最大 2.9325%。

| UTC 日期 | 主源收盘 | Bitstamp 收盘 | 相对差 |
|---|---:|---:|---:|
| 2011-09-13 | 5.80252328 | 5.97000000 | -2.8053% |
| 2011-12-31 | 4.71430633 | 4.58000000 | +2.9325% |
| 2012-03-31 | 4.88977687 | 4.90000000 | -0.2086% |
| 2012-12-31 | 13.54555244 | 13.24000000 | +2.3078% |
| 2013-03-31 | 93.89923842 | 96.15000000 | -2.3409% |
| 2013-12-31 | 729.55758291 | 732.00000000 | -0.3337% |
| 2014-12-31 | 320.66228726 | 321.00000000 | -0.1052% |
| 2015-12-31 | 429.67715342 | 430.89000000 | -0.2815% |
| 2016-12-31 | 968.97059702 | 966.30000000 | +0.2764% |
| 2017-08-16 | 4364.67857463 | 4378.84000000 | -0.3234% |

### Binance BTCUSDT 对 Bitstamp BTC/USD

10/10 匹配。绝对误差中位数 0.0679%，最大 0.2006%。

| UTC 日期 | 主源收盘 | Bitstamp 收盘 | 相对差 |
|---|---:|---:|---:|
| 2017-08-17 | 4285.08000000 | 4276.50000000 | +0.2006% |
| 2018-08-17 | 6584.49000000 | 6580.15000000 | +0.0660% |
| 2019-08-17 | 10216.02000000 | 10210.89000000 | +0.0502% |
| 2020-08-17 | 12281.13000000 | 12298.38000000 | -0.1403% |
| 2021-08-17 | 44695.95000000 | 44694.35000000 | +0.0036% |
| 2022-08-17 | 23342.66000000 | 23340.00000000 | +0.0114% |
| 2023-08-17 | 26623.41000000 | 26642.00000000 | -0.0698% |
| 2024-08-17 | 59491.99000000 | 59487.00000000 | +0.0084% |
| 2025-08-17 | 117405.01000000 | 117490.00000000 | -0.0723% |
| 2026-08-17 | 64532.10000000 | 64484.76000000 | +0.0734% |

### Binance ETHUSDT 对 Bitstamp ETH/USD

10/10 匹配。绝对误差中位数 0.0420%，最大 0.3156%。

| UTC 日期 | 主源收盘 | Bitstamp 收盘 | 相对差 |
|---|---:|---:|---:|
| 2017-08-17 | 302.00000000 | 301.05000000 | +0.3156% |
| 2018-08-17 | 317.51000000 | 317.43000000 | +0.0252% |
| 2019-08-17 | 185.59000000 | 185.51000000 | +0.0431% |
| 2020-08-17 | 430.89000000 | 430.86000000 | +0.0070% |
| 2021-08-17 | 3011.72000000 | 3011.95000000 | -0.0076% |
| 2022-08-17 | 1834.25000000 | 1835.00000000 | -0.0409% |
| 2023-08-17 | 1681.49000000 | 1683.50000000 | -0.1194% |
| 2024-08-17 | 2614.51000000 | 2614.70000000 | -0.0073% |
| 2025-08-17 | 4472.33000000 | 4475.70000000 | -0.0753% |
| 2026-08-17 | 1913.60000000 | 1912.09000000 | +0.0790% |

## Community CapMrktCurUSD 覆盖代码

1inch, aave, ada, ae_eth, aion_eth, algo, alpha, ant, avaxc, avaxp, avaxx, bal, bat, bch, bnb, bnb_eth, bsv, btc, btg, btm_eth, buidl_eth, busd, comp, cro, crv, crvusd_eth, cvc, dai, dash, dcr, dgb, doge, dot, drgn, elf, eos_eth, etc, eth, eurc_eth, fdusd_eth, flow, flow_native, frax_eth, ftt, fun, gas, gno, gnt, grin, gusd, hbtc, hedg, ht, husd, icp, icx_eth, knc, ldo, lend, leo_eos, leo_eth, link, lpt, lrc_eth, ltc, lusd_eth, maid, mana, matic_eth, mkr, nas_eth, neo, nxm, omg, pax, paxg, pay, perp, pol_eth, poly, powr, ppt, pyusd_eth, qash, qnt, qtum_eth, ren, renbtc, rep, rev_eth, sai, sdai_eth, shib_eth, snt, snx, srm, susde_eth, sushi, swrv, trx_eth, tusd, tusd_eth, tusd_trx, uma, uni, usdc, usdc_avaxc, usdc_eth, usdc_trx, usdd_eth, usde_eth, usdk, usdm_eth, usdt, usdt_avaxc, usdt_eth, usdt_omni, usdt_trx, vet_eth, vtc, wbtc, weth, wnxm, wtc, xaut, xem, xlm, xmr, xrp, xtz, xvg, yfi, zec, zil_eth, zrx

## Bitstamp 手续费与滑点口径

Bitstamp 官方 2015-02-26 公告明确新费率自 **2015-03-02** 生效，过去 30 日成交不足 20,000 美元档为每边 25 bp。前期用审稿小额保守值每边 50 bp。Wayback 索引找到了生效前 2015-02-14 和生效后 2015-03-18 两份费率页，但实际回放均仅返回访问校验代码，无法从存档复核表格内容。现行公开费率页也只返回脚本验证，未读到现行档位，因此按审稿保守值冻结前推每边 40 bp。滑点取 2012 年每边 25 bp、2013 年起 10 bp；压力中费率和滑点均翻倍。 [Bitstamp 2015 公告](https://blog.bitstamp.net/post/reducedfeeschedule/) · [生效前 Wayback 快照](https://web.archive.org/web/20150214095206/https://www.bitstamp.net/fee_schedule/) · [生效后 Wayback 快照](https://web.archive.org/web/20150318154036/https://www.bitstamp.net/fee_schedule/) · [现行费率页](https://www.bitstamp.net/fee-schedule/)

## Bitstamp 零成交与平盘

平盘分别列「收盘等于前一有效日收盘」和「日内高低价相等」，按同日原始日志去重后计数。2011-08-18 至 2012-03-04 首个 MA200 预热窗口共 200 天，其中零成交 30 天、收盘平盘 42 天、日内同价 60 天，足见早期开盘价的代表性有限。2015-01-06/07/08 三天均是停市后的零成交同价填充。主口径保留这些收盘用于均线和估值，订单顺延至有成交的开盘。 [Bitstamp 复市说明](https://blog.bitstamp.net/post/relaunch-faq/)

| 期间 | 零成交 | 收盘平盘 | 日内同价 |
|---|---:|---:|---:|
| 首个 MA200 预热窗 | 30 | 42 | 60 |
| 2011（8 月 18 日起） | 30 | 40 | 56 |
| 2012 | 0 | 18 | 4 |
| 2013 | 0 | 5 | 0 |
| 2014 | 0 | 1 | 0 |
| 2015 | 3 | 3 | 3 |
| 2016–2021 | 0 | 0 | 0 |
| 2022 | 0 | 1 | 0 |
| 2023–2026-11-26 | 0 | 0 | 0 |

只取 2012-01-01 以来正成交量日形成 MA200 时，首个有效状态由 2012-03-04 延至 2012-07-18，2012 下穿／上穿由 2／3 变为 0／0。2013 起的逐年次数相同。此处核查的是信号状态，没有计算信号后绩效。

### 零成交及收盘平盘日期

| 年 | 零成交日期（月-日） | 收盘平盘日期（月-日） |
|---|---|---|
| 2011 | 08-23, 08-26, 08-27, 08-28, 08-29, 08-31, 09-03, 09-05, 09-09, 09-10, 09-11, 09-12, 09-30, 10-01, 10-02, 10-15, 10-16, 10-18, 10-19, 10-22, 10-23, 10-27, 11-02, 11-03, 11-07, 11-23, 11-27, 12-04, 12-09, 12-17 | 08-21, 08-22, 08-23, 08-26, 08-27, 08-28, 08-29, 08-31, 09-03, 09-05, 09-09, 09-10, 09-11, 09-12, 09-21, 09-23, 09-29, 09-30, 10-01, 10-02, 10-15, 10-16, 10-18, 10-19, 10-22, 10-23, 10-27, 11-02, 11-03, 11-07, 11-10, 11-11, 11-13, 11-23, 11-27, 12-04, 12-05, 12-08, 12-09, 12-17 |
| 2012 | — | 01-02, 02-06, 04-13, 04-17, 04-29, 05-09, 05-19, 05-27, 05-28, 06-03, 06-21, 07-04, 07-13, 09-29, 10-30, 11-13, 11-20, 12-22 |
| 2013 | — | 01-04, 01-06, 01-11, 01-26, 02-21 |
| 2014 | — | 05-15 |
| 2015 | 01-06, 01-07, 01-08 | 01-06, 01-07, 01-08 |
| 2022 | — | 12-10 |
