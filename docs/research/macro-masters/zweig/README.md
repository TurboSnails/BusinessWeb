# 马丁·兹威格（Martin Zweig）怎么判断市场周期

> 整理日期：2026-11-22。只收录能找到来源的说法。证据等级标记：
> - **【原话】**：有书摘、记录稿或主流媒体的直接引语。
> - **【转述】**：书评、读书笔记或二手资料的意译与转引，措辞和阈值不一定准确。
> - **【未证实】**：常被归到他名下，但没有找到他本人的表述，或者各来源说法互相矛盾。
>
> 他的代表作《Martin Zweig's Winning on Wall Street》1986 年初版、1990 年代出过修订版。本文没有拿到原书全文，书中内容都是经书评、读书笔记或技术分析工具书转引的，所以大多标为【转述】。

## 一、一句话总结与人物简介

**一句话**：先看钱（利率和美联储的方向），再看盘面（涨跌家数和价格趋势）。两者都站在多头一边时才重仓，也就是 “Don't fight the Fed（别和美联储作对）” 加上 “Don't fight the tape（别和盘面作对）”。

- 1971 年创办投资通讯（即后来广为人知的《The Zweig Forecast》）；1984 年创办对冲基金。[Z3] 同年与人合创 Zweig-DiMenna Partners，前后发行通讯 26 年。[Z2]
- 他是 PBS 节目《Wall Street Week》的常客。**1987-10-16（周五）**他在节目上警告股市可能出现类似 1929 年的“vicious”（凶猛的）下跌，下一个交易日道指暴跌 508 点，约 23%。[Z2] 据 Wharton Magazine 报道，他当年夏天就开始在基金和通讯里买入看跌期权，崩盘当天组合上涨 8.7%，全年上涨 50%。[Z3]
- 2013-02-18 去世，享年 70 岁。[Z1]

## 二、核心思路

| # | 思路 | 原话（英文） | 中文意译 | 来源/日期 | 等级 |
|---|---|---|---|---|---|
| 1 | 货币条件主导股价 | "Monetary conditions exert enormous influence on stock prices." | 货币条件对股价的影响极大。 | 《Winning on Wall Street》（1986），经 Globe and Mail 2015-09-20 转引 [Z4] | 原话（书摘转引） |
| 2 | 别和美联储作对 | "Don't fight the Fed." | 利率下行时股市往往上涨，反之下跌。 | 他的座右铭，Wharton Magazine 纪念文章 [Z3] | 原话 |
| 3 | 别和盘面作对 | "His cardinal rule--never fight the tape" | 他的头号规则是永远不要和盘面趋势作对。 | Kirkus 书评，评 1986-04-23 出版的原书 [Z5] | 转述（书评措辞） |
| 4 | 顺势，强买弱卖 | "Buy strength, sell weakness and stay in gear with the tape." | 买强卖弱，跟上盘面节奏。 | 读书笔记转引修订版 [Z6] | 转述 |
| 5 | 群体在顶底常犯错 | "The crowd tends to follow the wrong signs near the market tops and bottoms." | 在顶部和底部附近，大众往往跟着错误的信号走。 | 读书笔记转引 [Z6] | 转述 |
| 6 | 大牛市多从宽度“推力”开始 | "most bull markets begin with a Breadth Thrust" | 大多数牛市以一次宽度推力开始。 | RecessionALERT 转引原书 [Z8] | 转述，未对照原书 |

## 三、他判断周期时看的具体指标

### 3.1 货币模型（“别和美联储作对”）

据读书笔记，修订版把货币面拆成几个子指标分别打分，再合成总分。[Z6] Globe and Mail 的介绍与此一致：模型由三类因素组成，分别是**优惠利率（prime rate）**、**美联储贴现率与存款准备金率**、**消费分期债务**。[Z4]

| 子指标 | 规则（读书笔记所记） | 怎么读 | 等级/来源 |
|---|---|---|---|
| **优惠利率指标** | 以 8% 为高低分界。买入信号：前一轮高点低于 8% 时，出现首次降息；高点在 8% 以上时，要等第二次降息或者累计降 1 个百分点。卖出信号反过来：低点在 8% 以上时首次加息就算；低点在 8% 以下时，要等第二次加息或者累计加 1 个百分点。修订版第 45 页原话："But at levels below 8%, somewhat larger increases in rates are needed to give bearish signals." | 利率**方向**比水平更重要；利率低时容忍更多加息。 | 转述 [Z6]；8% 分界亦见 [Z4] |
| **美联储指标**（贴现率 + 存款准备金率） | 加息记负分，6 个月后过期；转向宽松时清掉累计负分并加 2 分，6 个月后减 1 分。合计 ≥ +2 为极度看多，0 至 +1 为中性，−1 至 −2 为温和看空，≤ −3 为极度看空。 | 连续加息越多越危险；首次转松的信号很强。 | 转述 [Z6] |
| 分期债务指标 | 用消费分期信贷增速衡量信贷需求。有资料称阈值是 9%。 | — | 9% 阈值【未证实】（只见于 AI 生成的书摘网站） |
| 货币模型总分 | 有资料称总分 0–8 分，≥6 分买入、≤2 分卖出，各来源不一致。 | — | 【未证实】 |

**放到现在要注意**：美联储已于 2020-03-26 把存款准备金率降为 0，[Z12] 这个子指标已经失效。现在的贴现率（一级信贷利率，FRED `DPCREDIT`）等于联邦基金目标区间上限，优惠利率（`DPRIME`）按惯例等于上限加 3 个百分点。2026-11 的读数分别为 4.00%、7.00%，上限 `DFEDTARU` 为 4.00%（2026-11-22 经 FRED 接口核对）。也就是说，优惠利率和贴现率这两个指标如今都只是联邦基金利率的机械翻版，信息高度重复。

### 3.2 动量 / 盘面（“别和盘面作对”）

| 指标 | 定义 | 阈值/读法 | 等级/来源 |
|---|---|---|---|
| **涨跌家数指标（10 日 2:1）** | 10 个交易日里，上涨家数与下跌家数之比达到 2:1 以上。书中原话："It's very rare for advances to lead declines by a ratio of 2-to-1 over such a span." 以及 "Just three months after such instances in the past, the stock market rose an additional 12.3%." | 读书笔记称 1953–1994 年只出现过 11 次。 | 转述 [Z7][Z6] |
| **兹威格宽度推力（Zweig Breadth Thrust, ZBT）** | 纽交所（NYSE）**全部股票**的“上涨家数 ÷（上涨家数 + 下跌家数）”取 10 日指数移动平均（EMA）；该值在 10 个交易日内从 **0.40 以下**升到 **0.615 以上**，即为信号。 | Achelis《Technical Analysis from A to Z》称：“据 Zweig 博士统计，1945 年以来只有 14 次宽度推力，之后平均上涨 24.6%，平均历时约 11 个月。” | 定义：StockCharts [Z9]、Achelis [Z10]；统计：转述 [Z10][Z8] |
| **4% 模型**（Ned Davis 开发，Zweig 推广） | 书中原话（经 CXO 转引）："This trend-following model gives a buy signal when the weekly Value Line Index rallies 4% or more from any weekly close. It then gives a sell signal when the weekly close of the Value Line Composite drops by 4% or more from any weekly peak." | 价值线指数周收盘较任一周收盘反弹 ≥4% 时买入，较任一周高点回落 ≥4% 时卖出。 | 原话（书摘转引）[Z11] |
| 情绪 | 大众在顶底附近常犯错（见上表第 5 条）。 | 反向使用。 | 转述 [Z6] |

**关于 ZBT 出处的分歧**：很多资料说 ZBT 出自 1986 年原书，但 StockCharts 分析师 Arthur Hill 写道 "The Zweig Breadth Thrust does not feature in the book"，并称这个公式来自 Greg Morris 的宽度指标工具书。[Z9] 书中确定有的是上面的“10 日 2:1”涨跌家数指标。[Z7] 0.40 / 0.615 这组阈值是否出自 Zweig 本人，本文**未能核实**。另外，“10 日 EMA”在多数资料里指对比值本身取均线（而不是只对上涨家数取均线）。

## 四、经典周期判断案例

1. **1987 年崩盘**：1987-10-16 在《Wall Street Week》上预警，下一个交易日道指跌约 23%。[Z2] 他此前已买入看跌期权，崩盘当日组合 +8.7%，全年 +50%。[Z3]
2. **2023-11 宽度推力**：NYSE 版 ZBT 的 10 日窗口在 2023-11-03 结束。Arthur Hill 统计，这是 2009 年初以来第六次触发。[Z9] SentimenTrader 称这是 1928 年以来第 20 次（不同数据源计数不同），并说 1950 年以来信号之后 6–12 个月标普 500 从未亏损。[Z13] **之后**：按本站 `index-history.json` 的月末收盘粗算，标普 500 从 2023-10 的 4,193.8 涨到 2024-10 的 5,705.5，约 +36%。
3. **2015-10 信号之后先跌后涨**：Investing.com 列出的信号日期包括 2015-10-08、2019-01-07、2023-11-03、2025-04-24 等，作者自己也承认 2015 年那次约两个月后市场又创了新低。[Z14] 按本站月线粗算，2015-10 末到 2016-02 末标普跌 7.1%，一年后只涨 2.3%。说明这个信号不保证“马上就涨”。

## 五、局限与争议

- **样本极少**：1945 年以来只有十几到二十次，[Z10][Z13] 计数随数据源变化，统计置信区间很宽。SentimenTrader 也承认这个信号在 1930 年代有过失败，规则本身“部分”带有数据挖掘的风险。[Z13]
- **NYSE 全部股票口径已经变味**：Arthur Hill 指出这个口径漏掉了纳斯达克股票，只能代表“大板”。[Z9] 另外（本文判断，未找到量化来源），NYSE 挂牌品种的构成几十年来变化很大，今天的读数与 1940–1980 年代的历史统计并不完全可比。
- **4% 模型实证偏弱**：CXO Advisory 用价值线几何指数的周信号交易 SPY、QQQ、IWM、RSP（从各自上市到 2014-09），结果回撤更小，但收益和终值普遍跑输买入持有，计入交易成本后更差。[Z11] Achelis 的工具书也提到，约一半信号是错的。[Z10]
- **货币模型部分失效**：存款准备金率已经归零；优惠利率和贴现率机械地跟随联邦基金利率（见 3.1 节）。
- **“别和美联储作对”并非总灵**（本文分析，非 Zweig 原话）：衰退型熊市里，美联储往往一边降息股市一边下跌，例如 2001 年和 2007–2008 年。这也是 Zweig 坚持要用盘面动量做确认的原因。

## 六、可映射到本站数据的指标清单

本站相关数据：`public/data/us-market-data.json`、`macro-us.json`、`us-market-breadth.json`、`index-history.json`（截至 2026-11-22）。

| 指标 | Zweig 是否使用 | 本站状态 | 本站字段 / 建议数据源（免费、条款允许） |
|---|---|---|---|
| 联邦基金目标利率及方向 | 间接（贴现率） | 部分已有 | 已有 `sofr`、`iorb`（日频）；`macro-us` 的 `realRate` 内部用了 FEDFUNDS。建议补 FRED `DFEDTARU`/`DFEDTARL` |
| 优惠利率 | 是 | 缺少 | FRED `DPRIME`（信息与目标利率重复） |
| 贴现率 | 是 | 缺少 | FRED `DPCREDIT` |
| 存款准备金率 | 是 | 不适用 | 2020-03-26 起为 0 [Z12] |
| 消费分期信贷增速 | 是 | 缺少 | FRED `NONREVSL`（非循环信贷，最接近分期贷款）或 `TOTALSL` 同比 |
| 10 日涨跌比 2:1、ZBT | 是（NYSE 全部股票） | 部分已有 | `us-market-breadth.json` 已约定 `advDec` 字段（`[date, adv, dec, unch, covered]`，标普 500 / 纳指 100 **当前成分股**，回算 250 日），生成脚本也已支持，但 2026-11-20 的 JSON 里**尚未写入**；目前只有最新一天的 `highsLows.advancers/decliners`。成分股版只有约 500 / 100 只、按当前名单回算，有幸存者偏差，**不等于** NYSE 全部股票口径，阈值不能直接照搬。NYSE 全市场涨跌家数没有找到确认可免费再分发的来源 |
| 4% 模型 | 是 | 缺少 | 价值线几何指数需付费；本站 `rsp` 只有月线。等权 RSP 周线可作替代（Yahoo，使用条款需核实） |
| 趋势 / 均线 | 是（盘面） | 已有 | `above50`、`above200`、`netHighs` |
| 情绪（反向） | 是 | 已有 | `retailBull`/`retailBear`（AAII，本站历史从 2026-10-28 起，较短）、`cnnPutCall`、`macro-us.putCall`、`naaim`、`fearGreed` |
| 长端利率 | 背景 | 已有 | `tenYearDaily` |

> 上表 FRED 序列 ID 已于 2026-11-22 通过 fredgraph CSV 接口确认可以返回数据。

## 七、参考来源

- [Z1] Wikipedia，Martin Zweig：https://en.wikipedia.org/wiki/Martin_Zweig ；NYT 讣告索引（Legacy.com）：https://www.legacy.com/us/obituaries/nytimes/name/martin-zweig-obituary?id=24598248
- [Z2] Philadelphia Inquirer 讣告，2013-02-20：https://www.inquirer.com/philly/obituaries/20130220_Martin_E__Zweig____Rock_star__stock_analyst__70.html
- [Z3] Wharton Magazine，"A Forecaster Who Made Headlines and Moved Markets"：https://magazine.wharton.upenn.edu/issues/anniversary-issue/a-forecaster-who-made-headlines-and-moved-markets-martin-e-zweig-w-64
- [Z4] John Reese，The Globe and Mail，2015-09-20：https://www.theglobeandmail.com/amp/globe-investor/investment-ideas/zweig-model-points-to-ongoing-buy-environment-as-us-fed-reluctant-to-raise-rates/article26447481/
- [Z5] Kirkus Reviews，《Martin Zweig's Winning on Wall Street》书评：https://www.kirkusreviews.com/book-reviews/martin-e-with-morrie-goldfischer-zweig/martin-zweigs-winning-on-wall-street/print/
- [Z6] 读书笔记（RBCPA，2005-01-10，作者自称可能有误）：https://www.rbcpa.com/?p=1378
- [Z7] TradingCenter.org，"Marty Zweig & the Breadth Thrust Signal"（转引原书）：https://tradingcenter.org/index.php/trade/equities/368-zweig-breadth-thrust-signal
- [Z8] RecessionALERT，"Zweig Breadth Thrust Redux"：https://recessionalert.com/zweig-breadth-thrust-redux/
- [Z9] Arthur Hill，StockCharts，"The Zweig Breadth Thrust Triggers, but the Indicator is Missing Something"，2023-11：https://articles.stockcharts.com/article/articles-arthurhill-2023-11-the-zweig-breadth-thrust-trigg-609/
- [Z10] Steven Achelis，《Technical Analysis from A to Z》，MetaStock 在线版：Breadth Thrust https://www.metastock.com/Customer/Resources/TAAZ/?p=37 ；Four Percent Model https://www.metastock.com/Customer/Resources/TAAZ/?p=57
- [Z11] CXO Advisory，"Martin Zweig's Four Percent Model Indicator"（含原书引文，测试截至 2014-09）：https://www.cxoadvisory.com/technical-trading/martin-zweigs-four-percent-model-indicator/
- [Z12] 美联储，Reserve Requirements：https://www.federalreserve.gov/monetarypolicy/reservereq.htm
- [Z13] SentimenTrader，"The grandaddy of thrusts with a perfect record"，2023-11-06：https://sentimentrader.com/blog/the-grandaddy-of-thrusts-with-a-perfect-record
- [Z14] Paulo Celig，Investing.com，2025-04-28：https://www.investing.com/analysis/zweig-breadth-thrust-is-it-a-trustworthy-technical-indicator-for-stock-market-200660043
- 数据：FRED https://fred.stlouisfed.org/ ；本站 `public/data/index-history.json`（标普 500 月末收盘）
