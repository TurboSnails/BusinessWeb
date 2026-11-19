# 美股仪表盘「杠杆与资金」权威数据源补充调研 · 2026-11-20

只读数据源调研，核验时点为 2026 年 11 月 20 日。下文记录访问过的页面、接口和读取到的观测日期，并标示尚未验证的项目。

关联文档：[2026-11-17 科技多空比与 Put/Call 核查](2026-11-17-tech-long-short-vs-put-call.md)（高盛 Prime 多空比的公开可得性结论不复述，直接沿用）、[数据维护台账](../data-maintenance.md)。

## 现有集成（读代码确认，无需重复引入）

`server/macro.mjs` + `src/features/macro/indicators.ts` 的「杠杆与资金」（leverage 模块）已有：

| 已有指标 | 源 | 频率 |
| --- | --- | --- |
| FINRA 保证金（debit/cash/margin → marginGdp、cashDebt） | finra.org margin-statistics.xlsx | 月度 |
| Cboe 全产品 Put÷Call | cboe.com 日报 + totalpc.csv | 日度（历史月末抽样） |
| OFR 对冲基金股票多空比 hfEquityLs | data.financialresearch.gov（LGNE/SGNE） | 季度（滞后数月） |
| 家庭股票占金融资产比重 equityShare | FRED `BOGZ1FL153064486Q`（Z.1） | 季度 |

缺口正是任务点名的四块：**散户/经理现金、OFR 与高盛多空和仓位、杠杆、资金流**。

## 公开数据源及访问条件

### 1. NAAIM Exposure Index（经理股票敞口，周频）

- **是什么**：National Association of Active Investment Managers 会员每周三收盘后的美国股票敞口（−200% 杠杆空头 ～ +200% 杠杆多头）。敞口为零可来自现金仓位或对冲，无法反推经理现金。
- **频率/覆盖**：周频。公开网页延迟三个月，当前周读数及完整历史通过订阅或会员访问。
- **公开可用性**：公开网页可查延迟读数。官方声明商业使用须取得授权，调查未找到公开下载端点。[NAAIM Exposure Index](https://naaim.org/programs/naaim-exposure-index/)

### 2. AAII Asset Allocation Survey（散户现金配置，月频）

- **是什么**：美国个人投资者协会会员的自报资产配置（股票/债券/现金 %），是「散户现金水位」最直接的公开调查。与已有的「AAII 情绪调查」不同，这是仓位而非多空情绪。
- **频率/覆盖**：月频；页面带评论稿（今日读到 2026 年 10 月期：股票 70.1%，现金配置环比持平，股票配置连续 48 个月高于历史均值 62.0%）。投票需会员，结果全文公开。
- **公开可用性**：免费网页公开；历史各月评论可回溯翻阅。
- **URL**：https://www.aaii.com/assetallocationsurvey （今日访问成功）。

### 3. ICI 货币基金资产（机构+散户现金池，周频）

- **是什么**：Investment Company Institute 每周四公布截至周三的货币基金总资产，含 **Retail / Institutional × Government / Prime / Tax-exempt** 拆分。覆盖资金存放在货币基金里的那一部分。
- **频率/覆盖**：周频；官网只保留近 20 周明细；今日读到 2026-11-11 周 total $7.98T（retail $3.11T / institutional $4.87T）。
- **公开可用性**：免费网页，历史长序列需 ICI 数据服务或改用 FRED（见下条 RMFSL）。
- **URL**：https://www.ici.org/research/stats/mmf （今日访问成功）。
- **注意**：资产变动 ≈ 流量代理，但含市值/收益影响，不是净申赎。

### 4. ICI 长期基金周度净流量（资金流首选，周频）

- **是什么**：周度共同基金净流量估计（股票国内/全球、混合、债券应税/市政），并可合并 **ETF net issuance**；网站另有月度正式流量（Trends in Mutual Fund Investing）。美股「资金流向」最权威且免费的官方口径。
- **频率/覆盖**：周频估计（覆盖行业 98% 资产）+ 月频正式。今日读到截至 2026-11-11 当周长期基金净流出 $225.6 亿（股票 −82.0 亿）。
- **公开可用性**：免费网页。
- **URL**：https://www.ici.org/research/stats/flows （今日访问成功）。

### 5. CFTC Commitments of Traders（杠杆基金期货持仓，周频）

- **是什么**：官方期货持仓分解。用 **Traders in Financial Futures (TFF)** 报告的 **Leveraged Funds** 类别看股指期货（E-mini 标普、纳指、道指、罗素）净多/空，是对冲基金方向性仓位的免费高频代理，补足 OFR 季频的滞后。
- **频率/覆盖**：周频，周五 15:30 ET 公布（数据截至周二）；Legacy 历史至 1986，TFF/Disaggregated 至 2006。
- **公开可用性**：完全免费；当前与历史压缩 CSV 可直接下载，Public Reporting Environment API 无需 token（官方 FAQ 确认不过度使用即可）。
- **URL**：https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm （今日访问成功确认发布节奏、历史起点与 API 无 token）；数据查询 https://publicreporting.cftc.gov/stories/s/r4w3-av2u 。

### 6. OFR Hedge Fund Monitor 扩展序列（仓位与敞口，季频）

现有 hfEquityLs 只用了 LGNE/SGNE。今日实测同一免费 API（`https://data.financialresearch.gov/hf/v1/series/timeseries?mnemonic=...`，无 key）还有：

| 序列 | mnemonic | 含义 | 最新点 |
| --- | --- | --- | --- |
| 股票 GNE 合计 | `FPF-ASSETCLASS_EQUITIES_GNE_SUM` | 多头+空头总名义敞口 | 2026-06-30 |
| 股票现货多头 | `FPF-ASSETCLASS_LEQYSEC_SUM` | 不含衍生品的多头证券 | 2026-06-30 |
| 股票现货空头 | `FPF-ASSETCLASS_SEQYSEC_SUM` | 不含衍生品的空头证券 | 2026-06-30 |

全部 54 个季度（2013-03 起），与已集成序列同日对齐。可直接扩成「总敞口 / 现货多空」两张卡，无需新授权。猜测性 mnemonic（GNE/NAV、borrowing 类）返回 Invalid mnemonic，不列。

### 7. FRED H.6 零售货币基金（零售现金月度底账）

- H.6 自 2021-02 起改为**月频**发布，周频零售 MMF 序列停更。月频季调 `RMFSL`（Retail Money Market Funds，2026-10 约 $3,085B）经现有 FRED CSV 管道即可拉，作为 ICI 周频的补充长历史（1980 起）。
- URL：https://fred.stlouisfed.org/series/RMFSL （FRED 搜索确认；本站已用 fredgraph.csv 管道，接入成本零）。
- 同族可选项（搜索确认存在，未逐拉数据）：`BOGZ1FU153064105Q`（家庭直接+间接持股占金融资产 %，与已集成 equityShare 同族，勿重复）、`BOGZ1FL153064475Q`（持股资产额，1945 起）。

## 扩展数据源（二手/付费/人工，标注边界）

| 数据 | 频率 | 可用性 | 边界 |
| --- | --- | --- | --- |
| 高盛 Prime 多空比/仓位 | 周 | **无公开精确序列**；S3 Partners 经 Marquee/Bloomberg 付费 | 沿用 11-17 研究结论；只用媒体转述时单列标注，不与站内序列混排 |
| BofA Global Fund Manager Survey 现金比例 | 月 | 一手报告付费；媒体常转述 | 「经理现金」媒体口径的一手来源，公开仅二手 |
| Morningstar US Fund Flows | 月 | 公开文章 + 图表附 **Download CSV**（源 Morningstar Direct），2026 年 2/6/7/8 月文章均在 | 月频、偏共同基金+ETF 份额流量；自动抓 CSV 前确认条款。URL 示例：https://www.morningstar.com/funds/8-charts-us-fund-flows-strong-start-2026 |
| LSEG Lipper 周度流量 | 周 | 经 Reuters 等报道二手获取 | 周频流量的媒体口径；非一手 |
| EPFR | 周 | 付费 | 机构级资金流，不免费 |
| VandaTrack 散户净买入 | 日 | 付费（媒体报道节选） | 真正的「散户资金流」高频源，公开不可得 |
| SEC Form 13F | 季 | 免费（SEC EDGAR） | 经理持仓的多头一侧（官方 FAQ：不报空头），滞后约 45 天；适合做季度仓位背景而非高频信号 |
| FINRA / Nasdaq 空头持仓 | 半月 | 免费 | 已在 11-17 研究记录为高盛多空比的免费代理方案（只有空头一侧） |

## 落地建议（按优先级）

1. **周频资金与现金**：ICI 周度流量 + ICI 货币基金资产（表内 retail 拆分），先手工/半自动网页读数，页面文案写明「估计值、官网留 20 周」。
2. **周频仓位**：CFTC TFF Leveraged Funds 股指期货净持仓（免费 CSV/API），标注「期货口径 ≠ 股票持仓」。
3. **散户与基金现金**：先接 AAII 资产配置与 ICI 股票共同基金流动资产比率。NAAIM 周度经理敞口作为有访问条件的仓位补充。
4. **季频扩展现有卡**：OFR GNE 合计与现货多空并入 hfEquityLs 卡片组，纯 API 扩展。
5. **维持不接入**：高盛 Prime、BofA FMS、EPFR、VandaTrack（付费或仅二手）；引用时按 11-17 研究的标注规范单列。

## 核验记录（2026-11-20 实际访问）

| 源 | 结果 |
| --- | --- |
| naaim.org exposure-index 页 | 200，周三采集口径、授权声明确认 |
| aaii.com assetallocationsurvey | 200，读到 2026-10 期配置数据 |
| ici.org/stats/mmf | 200，读到 2026-11-11 周 $7.98T |
| ici.org/stats/flows | 200，读到截至 2026-11-11 当周流量 |
| cftc.gov CoT FAQ | 200，发布节奏/历史/API 无 token 确认 |
| data.financialresearch.gov hf API | 200，LGNE/SGNE/GNE/LEQYSEC/SEQYSEC 五序列拉到，最新 2026-06-30 |
| FRED 系列 ID（RMFSL、BOGZ1FU153064105Q、BOGZ1FL153064475Q） | 搜索确认存在与频率；fredgraph.csv 本机被 WAF 拦（返回 HTML），但仓库现有管道在 Actions 环境可用，不构成接入障碍 |
| NAAIM 指数可下载端点 | **未找到**，标为网页读数，不臆造 API |
