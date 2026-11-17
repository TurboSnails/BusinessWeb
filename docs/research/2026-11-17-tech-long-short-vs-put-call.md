# 科技行业多空比与 Cboe 全产品 Put/Call 核查 · 2026-11-17

问题：媒体所称「科技行业多空比为 2016 年以来最低」是否与本站接入的 Cboe 全产品 Put/Call 指同一现象，能否用来质疑后者？

## 结论

1. **不是同一指标。** 该说法对应高盛 Prime Brokerage 的**美国信息技术板块对冲基金多空仓位比**，即多头市值÷空头市值；Cboe Total Put/Call 是**看跌期权成交量÷看涨期权成交量**。前者是特定客户账簿的行业持仓存量，后者是 Cboe 产品集合的期权交易流量，不能直接比较数值或推断二者应同向。
2. 二手报道一致指向：**截至 2026-11-12 当周，多空仓位比降至 1.50，为 2016 年以来最低；2026 年 6 月初高点为 2.14。** 1.50 表示每 1 美元空头对应约 1.50 美元多头，不表示「净多头 50%」，也不是多空基金数量比。
3. **本期高盛原始周报及底层时间序列未找到公开免费版本。** 因而 1.50、2.14 和「2016 年以来最低」目前只能确认多家媒体转述一致，不能声称已由一手数据独立复算。高盛公开旧报告可用于确认该指标的一般定义，但不能证明本期数值。
4. **两者甚至不能按「越低越悲观」作同向解读。** 高盛比值下降表示多头相对空头减少；Cboe 的 Put/Call 下降在常见解释中反而表示 Put 成交相对 Call 减少、情绪偏乐观，但期权成交还包含平仓、价差与对冲，不能机械等同于方向性观点。该新闻本身不构成对本站 Cboe 数据的反证。

## 指标与口径

| 项目 | 高盛科技多空仓位比 | Cboe Total Put/Call |
| --- | --- | --- |
| 原始含义 | 对冲基金美国信息技术板块多头市值÷空头市值 | Put 期权成交量÷Call 期权成交量 |
| 分子/分母 | 美元市值、持仓存量 | 合约成交量、期间流量；不是名义金额或未平仓量 |
| 统计对象 | 高盛 Prime Brokerage 客户账簿中的美国信息技术板块，不是全部对冲基金或全体科技投资者 | Cboe 日报「SUM OF ALL PRODUCTS」对应产品集合，含指数、ETP、股票期权等，不是科技行业专属 |
| 时间口径 | 截至 2026-11-12 的统计周；报道所述当前值 1.50 | 每个交易日的期权成交量比 |
| 可比性 | 不可与期权成交量比直接比较 | 不可用于验证高盛客户仓位比 |

「全产品」应按 Cboe 页面自身的产品汇总口径理解，不能扩写成「全美国所有交易所期权」。Cboe 官方也建议按指数、ETP、股票期权分别观察，因为不同产品的用途和成交特征不同。

## 原始来源与可复核性

- **高盛一手定义：公开。** 高盛 2021 年公开报告明确写道，long-short ratio 为「long market value divided by short market value」。这支持上述公式，但不是 2026 年 11 月本期报告。
- **本期一手数值：未公开核验。** 本次检索高盛官网及 GS Publishing，未找到截至 2026-11-12 当周的 Prime Brokerage 周报原件、图表或可下载序列。Investing.com 文末标 Reuters，属于「高盛客户报告被媒体看到」的转述，不等于报告公开。
- **统计边界：只能作有限确认。** 高盛公开的 Prime Services 资料说明其服务对象为对冲基金；另一份公开研究报告对 Prime Services 汇总数据明确提示「不应被视为全市场的完整图景」。因此不能把该比值外推为全行业统一仓位。该公开研究报告是基于 13-F 的 Hedge Fund Trend Monitor，**不是本期周报，也不是本期数值的原始凭证**。
- **Cboe：免费可复核。** 官方日报同时公布 Total Put/Call、各类产品比值及 Call/Put 成交量，可直接用 Put÷Call 复算；其官方说明也明确该指标是 listed option put volume to call volume。

## 来源 URL

一手来源：

1. Goldman Sachs，2021-02-25，*The Short and Long of Recent Volatility*（多空比定义）：https://www.goldmansachs.com/pdfs/insights/pages/gs-research/the-short-and-long-of-recent-volatility-f/report.pdf
2. Goldman Sachs，Prime Services（服务对象与业务边界）：https://www.goldmansachs.com/what-we-do/ficc-and-equities/prime-services
3. Goldman Sachs，2025-02-20，*Hedge Fund Trend Monitor*（Prime Services 数据非全市场的提示；并非本期周报）：https://www.gspublishing.com/content/research/en/reports/2025/02/20/499e771c-e4e7-466c-93c8-9d336e092686.html
4. Cboe，*U.S. Options Daily Market Statistics*（Total、分类比值及成交量原表）：https://www.cboe.com/markets/us/options/market-statistics/daily/
5. Cboe，2022-12-29，*How Early Exercise Order Flow Impacts Equity Option Put/Call Ratios*（成交量定义、解释假设与分类观察建议）：https://www.cboe.com/insights/posts/how-early-exercise-order-flow-impacts-equity-option-put-call-ratios

二手报道：

6. Investing.com／Reuters，2026-11-16，*Hedge funds sell U.S. stocks for second week, Goldman says*：https://www.investing.com/news/stock-market-news/hedge-funds-sell-us-stocks-for-second-week-goldman-says-93CH-5029300
7. 华尔街见闻，文章 3785954：https://wallstreetcn.com/articles/3785954
8. 搜狐转载「环球市场播报」，2026-11-16（可读取全文，日期、1.50、2.14 与 Investing.com 摘要一致）：https://m.sohu.com/a/1102377430_114984

## 未能核验项

- 本期高盛报告的准确标题、作者、报告编号、原图及底层序列；客户样本数、纳入工具、行业分类细节和聚合调整方法。
- 1.50 是否严格为 11 月 12 日收盘快照，而非周内其他汇总时点；二手报道只明确统计周截至该日。
- 2.14 在 2026 年 6 月初的准确日期，以及「2016 年以来」是历史窗口下界还是数据始于 2016 年；不应进一步写成「2016 年开始统计」。
- Investing.com 正文直接抓取返回 403，华尔街见闻正文抓取未返回文章；数值由搜索摘要与可访问的搜狐转载交叉确认，仍属二手核验。

处理建议：本站继续把 Cboe 指标标注为「期权成交量 Put/Call（Cboe 全产品）」；若引用上述新闻，应单列「高盛 Prime Brokerage 美国信息技术板块多空仓位比（截至 2026-11-12 当周，媒体转述）」，不要混作同一情绪序列。

## 三方获取补充

核查时点：2026-11-17。结论限于公开可发现的网页、产品目录和无需凭据可访问的接口；**未找到这条高盛精确序列的三方历史、API 或下载产品**，但不据此断言封闭终端或机构合同下一定不存在。

### 三方实际访问结果

| 提供方 | 实际结果 | 能否取得精确序列 |
| --- | --- | --- |
| YCharts | 可读取 [CBOE Total Put/Call](https://ycharts.com/indicators/total_putcall_ratio) 历史表；按高盛 Prime Brokerage、US Info Tech long/short 等组合检索未发现目标序列 | 否；现有页面是期权指标，不是高盛仓位 |
| MacroMicro | 可访问 [CBOE Total Put/Call & SKEW](https://en.macromicro.me/charts/120772/US-Equity-Market-Sentiment-CBOE-Total-Put-Call-Ratio)，页面显示 CSV 下载入口；未发现目标序列 | 否；同样是期权指标 |
| Barchart | 可读取 [GS 个股 Put/Call](https://www.barchart.com/stocks/quotes/GS/put-call-ratios) 及高盛相关转载新闻；未发现 Prime Brokerage 行业序列 | 否；GS 股票期权与高盛客户账簿无关 |
| Fintel | 目标检索未发现序列；直接读取其 VGT 期权页返回 403。公开搜索结果显示其另有 13F、个股/ETF short interest 和披露期权仓位产品 | 公开途径未取得；付费内容未测试，不能推定其私有库有目标序列 |
| WhaleWisdom | [首页](https://whalewisdom.com/)可访问，产品明确以 13F、13D 等申报为基础；未发现高盛 Prime 序列 | 否；13F 不是该序列来源 |
| Quiver | [Hedge Fund Activity API](https://api.quiverquant.com/datasets/hedge-fund-activity) 文档可访问，实际为 13F 持仓变化，需 API key，Trader 档标价 75 美元/月 | 否；不是高盛 Prime 数据 |
| Bloomberg / LSEG（Reuters） | 公开检索只找到 Reuters 对本期客户报告的新闻转述，未找到序列代码、数据产品说明或下载端点 | 公开途径否；本次无付费终端/数据权限，不能核验封闭目录 |

高盛自身 [Marquee 公开说明](https://www.goldmansachs.com/what-we-do/ficc-and-equities/prime-services/agency-lending)显示机构和企业客户可通过 Web、桌面、移动端及 API 获取研究、数据和 Prime Services，但公开目录未证明包含本条序列。精确数据的可行询问路径是高盛 Prime Services／Marquee 或获得授权的研报渠道；自动更新前必须取得该数据集的明确授权，不能用新闻抓取代替。

Fintel、WhaleWisdom、Quiver 等 13F 产品不能反推高盛多空比：[SEC 13F FAQ](https://www.sec.gov/rules-regulations/staff-guidance/frequently-asked-questions-about-form-13f) 明确要求不报空头仓位，也不能用空头冲减多头。媒体或研报存档可人工收集零散历史点，但不是完整序列，且转载、再分发权需另行确认。

### 可构造的公开代理（均非精确指标）

| 数据 | 频率、历史与覆盖 | 获取及自动化 | 与高盛指标的关键差异 |
| --- | --- | --- | --- |
| [FINRA Equity Short Interest](https://www.finra.org/finra-data/browse-catalog/equity-short-interest) | 半月度：月中和月末结算日，通常在结算日后第 7 个营业日发布；在线表格及 Equity API 为滚动 5 年；覆盖交易所上市及 OTC 股票的每股汇总空头持仓。[文件页](https://www.finra.org/finra-data/browse-catalog/equity-short-interest/files)注明 2014 年起的 archive 仅含 OTC | 免费历史文件、CSV/JSON API；API 使用 OAuth2。FINRA [FAQ](https://developer.finra.org/support)称个人可建 Public Credential，公开数据免费、每月上限 10GB | 有全部市场参与者的空头存量，但没有对应多头，也不区分高盛客户或对冲基金；半月频率低于高盛周报 |
| [FINRA Daily Short Sale Volume](https://www.finra.org/finra-data/browse-catalog/short-sale-volume) | 日度；交互表格最多 365 天，合并 NMS 文件最早 2018-08-01；仅覆盖报给 TRF/ADF/ORF 的场外成交，不含各交易所完整成交 | 免费文件和 Query API；页面注明非商业使用免费，可按交易日自动获取 | 是成交流量，不是未平仓空头。FINRA 明确说明它不等于半月度 short interest，且免费文件本身不是全市场合并口径 |
| [Nasdaq Short Interest](https://www.nasdaqtrader.com/Trader.aspx?id=ShortInterest) | 半月度、逐证券、滚动 12 个月；Nasdaq 上市证券 | 网页可查；批量文本下载为订阅产品。本次直接访问 [AAPL JSON 端点](https://api.nasdaq.com/api/quote/AAPL/short-interest?assetClass=stocks)无需登录即返回 2025-11-14 至 2026-10-30 共 24 期 | 可做单股/ETF代理，但覆盖及历史窄于 FINRA；该 JSON 是网页所用端点，未见稳定性/再分发承诺，不宜默认作生产 API |
| [NYSE Group Short Interest](https://www.nyse.com/market-data/reference) | 半月度，NYSE、NYSE Arca、NYSE American 上市证券的已报告未覆盖空头仓位 | [官方规范](https://www.nyse.com/publicdocs/nyse/data/NYSE_Group_Short_Interest_Client_Specification_v1.6.pdf)写明订阅制，经 SFTP 或 AWS S3 交付，可自动更新 | 仍是全账户空头存量，不含多头或基金身份；通常可用 FINRA 汇总数据替代，无需为构造代理重复购买 |
| [Cboe Short Interest Reports](https://www.cboe.com/en/markets/us/equities/market-statistics/short-interest/) | Cboe 上市证券的合并市场空头持仓；底层 FINRA 报告半月一次。本次页面可读取并列出截至 2026-11-16 的 CSV 文件 | 官方注明免费，CSV 可自动下载；需另查网站使用条款。每日出现文件不代表底层仓位变为日频 | 适合部分 Cboe 上市 ETF，不是全部科技股，也不是高盛客户仓位 |
| [Cboe U.S. Equity Short Volume and Trades](https://datashop.cboe.com/us-equity-short-volume-and-trades) | 日度成交汇总及月末逐笔记录，2015 年起；仅 BYX、BZX、EDGA、EDGX 的 Cboe 成交 | DataShop 订阅， nightly 文件；外部分发衍生数据需额外许可和用例批准 | 可构造 Cboe 场内日度空头成交代理，但不能外推为全市场或持仓存量 |

此外，SEC Form SHO 目前不能补缺口：SEC [2025-12-03 命令](https://www.sec.gov/files/rules/exorders/2025/34-104303.pdf)把首次报告推迟到 2028 年 1 月报告期，当前没有这套新的月度汇总历史可用。

### 推荐代理与边界

1. **行业空头仓位代理：** 固定透明的美国信息技术股票池，用 FINRA 每股 short interest×结算日价格汇总空头市值，再除以同一股票池的流通市值或总市值。结果命名为「科技行业空头市值率」，不得命名为「高盛多空比」。股票池、价格、股本/流通股、公司行动和修订值都需另设来源；高盛分子中的多头市值无法由此恢复。
2. **科技 ETF 代理：** 分别跟踪 XLK、VGT 等 ETF 的 short interest 或 short interest/shares outstanding，保留半月度频率。ETF 空头还包含做市、套利和对冲，且不能与成分股空头直接相加，以免混合工具或重复表达风险。
3. **高频成交代理：** 若只需日频，可汇总科技股票池的 short volume/total volume；只用 FINRA 文件时必须标注「场外报告部分」，要称全市场则需补齐各交易所文件。该序列衡量交易活动，不是净卖出或持仓变化。
4. **落地顺序：** 免费自动更新优先 FINRA Equity Short Interest API＋固定行业成分及价格/股本数据；Nasdaq 网页端点仅作交叉检查，Cboe 免费 CSV 仅补充上市 ETF。本站若公开发布或商业使用，需先核对 FINRA 非商业条款及相应供应商的展示、衍生数据和再分发授权。

## 2026-11-17 二次排查：可落地的近似源

结论不变：**仍无免费、可持续的「高盛 US Info Tech L/S = 1.50」精确序列。** 但有三类更接近的路径，其中一条已实测可自动拉取。

### A. 最接近的商业替代：S3 Partners（付费）

- 产品本身就是 **Active Long Interest + Daily Short Interest → Active Long-to-Short（LTS）**，可按行业/个股切；定义与高盛同型：`LongInterestMV / ShortInterestNotional`。
- 公开研报已写明：**对冲基金多空比大约 1.5:1**，与高盛本期科技 1.50 同量级；全市场 Active LTS 约 7–8（含主动多头机构，不是纯 HF L/S 账簿）。
- 2026-10 文：Tech 今年新增空头 \$221B，LTS 在 6/12 前后跌幅最大，之后空头从峰值回落约 1/5、多头持平，Tech LTS 回补约 60% 跌幅。这与「6 月初 GS 科技 L/S 高点 2.14 → 11 月 1.50」叙事方向一致，但口径/样本/时点不同，**不能数字对数字验证**。
- 分发：直连 API/SFTP/Snowflake，也挂在 Bloomberg、FactSet、**Goldman Marquee**。要「科技多空比」这就是正主替代，不是开源。

### B. 已实测可免费自动更新：OFR Hedge Fund Monitor（Form PF）

无 key REST：`https://data.financialresearch.gov/hf/v1/series/timeseries?mnemonic=...`

| 序列 | mnemonic |
| --- | --- |
| 股票多头名义敞口 | `FPF-ASSETCLASS_EQUITIES_LGNE_SUM` |
| 股票空头名义敞口 | `FPF-ASSETCLASS_EQUITIES_SGNE_SUM` |
| 现货多/空（不含衍生品） | `FPF-ASSETCLASS_LEQYSEC_SUM` / `SEQYSEC_SUM` |

实测 **Equity GNE L/S = LGNE/SGNE**（Qualifying Hedge Funds，全股票，非科技切分）：

| 季末 | L/S |
| --- | --- |
| 2024-09-30 | 1.818 |
| 2025-03-31 | 1.763 |
| 2025-09-30 | 1.671 |
| 2026-03-31 | 1.600 |
| **2026-06-30** | **1.503** |

含义：

1. 量级与高盛 HF L/S、S3「HF ≈ 1.5」一致，说明 **1.50 不是媒体编的离谱数**。
2. 2024Q3→2026Q2 持续下行，方向上支持「多头相对空头变薄」。
3. **不是** US Info Tech、**不是** 周频、**不是** GS Prime 客户账簿；最新点停在 2026-06-30，赶不上 11-12 当周新闻。只能标成「OFR/Form PF 对冲基金全股票多空比」。

### C. 免费但只有空头一侧（科技代理）

| 源 | 实测 | 用途 |
| --- | --- | --- |
| Nasdaq `api.nasdaq.com/api/quote/{T}/short-interest` | NVDA 等 Nasdaq 上市名可用；XLK 返回「仅支持 Nasdaq Listed」 | 半月度个股空头股数/Days to Cover；可拼 NVDA/AMD/AVGO… 科技篮子空头市值率 |
| FINRA Consolidated Short Interest API | 本环境被 Cloudflare WAF 打到 `error.waf.finra.org`，文档称免费无 key | 生产机若能过 WAF，仍是官方全市场半月度空头首选 |
| Ortex | 有日频 SI 估计 + TEST key，正式档付费；再分发受限 | 日频空头代理，不是 L/S |

没有免费公开「科技多头市值」高频源可与 FINRA 空头配成 L/S；13F 只有多头且季频滞后，不能配成 GS 式周频多空比。

### 对本站的务实建议

1. **Put/Call 继续独立标注**，不要改名成多空比。
2. 若要加「对冲基金仓位」免费序列：优先接 **OFR Equity GNE L/S**（上表），文案写清 Form PF / 全股票 / 季频。
3. 若必须 **科技行业**：要么谈 S3（或 Marquee/Bloomberg 里的 S3），要么自建「科技篮子 short interest / float」并承认缺多头。
4. 不要用新闻 PDF/二手摘录拼历史曲线当产品数据：无授权、不完整、不可自动更新。

### 落地状态（同日）

已接入 `hfEquityLs` 至「杠杆与资金」：`server/macro.mjs` + `macro-us.json`，随 `macro:update` 更新。最新 **2026-06-30 = 1.503**，自 2013 共 54 季，历史约 **2% 分位**。背景不打分；文案标明非高盛科技多空比。

