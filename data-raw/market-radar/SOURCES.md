# 「我的市场雷达」数据来源

整理日期：2026-11-24。雷达由 `scripts/market-radar.mjs` 生成，输出 `public/data/market-radar.json`；
大部分底层序列来自 `public/data/us-market-data.json`（`scripts/us-market-data.mjs`）和本目录的缓存。

更新方式说明：
- **自动**：GitHub Actions 定时任务刷新，不用管。
- **手动**：没有抓取脚本，需要人工把新读数写进 `us-market-data.json` 对应序列的 `history`（并更新 `source`、`releasedAt`）。
- **回补**：一次性往前补的历史，已经写进序列；只有来源方修订历史、或想再往前补时才需要重跑。

## 一、逐项来源

### 流动性

| 指标 | 来源 | 口径 | 历史起点 | 更新方式 |
|---|---|---|---|---|
| 美元净流动性 13 周变化 | FRED [WALCL](https://fred.stlouisfed.org/series/WALCL) − [WTREGEN](https://fred.stlouisfed.org/series/WTREGEN) − [RRPONTSYD](https://fred.stlouisfed.org/series/RRPONTSYD) | 联储总资产扣除 TGA 和隔夜逆回购，13 周变化 | 2003-06（WALCL 2002-12 才开始，**物理上限**） | 自动：`market-cycle.yml` → `us-market-data.mjs` |
| 高收益债利差 | FRED [BAMLH0A0HYM2](https://fred.stlouisfed.org/series/BAMLH0A0HYM2) | ICE BofA 美国高收益债 OAS，日频 | 2023-11-24（FRED 受 ICE 授权限制只给近 3 年，站内逐日累积） | 自动：`us-market-data.mjs` |
| 企业债利差半年变化 | FRED [BAA](https://fred.stlouisfed.org/series/BAA)、[AAA](https://fred.stlouisfed.org/series/AAA) | Baa − Aaa 的 6 个月变化 | 1919 | 自动：`macro-snapshot.yml` → `market-radar.mjs` |
| 金银比 | Yahoo [GC=F](https://finance.yahoo.com/quote/GC=F/)、[SI=F](https://finance.yahoo.com/quote/SI=F/) 全历史日线 | COMEX 金 ÷ 银连续合约收盘（不是官方结算价，换月有小跳空），附 20 个交易日变化；事后新增，只展示 | 2000-08 | 自动（缓存 `gold.json`、`silver.json`） |

### 估值

| 指标 | 来源 | 口径 | 历史起点 | 更新方式 |
|---|---|---|---|---|
| 股债利差 | [Multpl 市盈率](https://www.multpl.com/s-p-500-pe-ratio) + FRED [GS10](https://fred.stlouisfed.org/series/GS10) | 过去 12 个月盈利收益率 − 10 年期美债月均收益率 | 1953 | 自动 |
| 过去 12 个月市盈率 | [Multpl](https://www.multpl.com/s-p-500-pe-ratio) | 标普 500 TTM P/E | 1900 | 自动 |
| 周期调整市盈率 | [Multpl Shiller PE](https://www.multpl.com/shiller-pe) | CAPE | 1900 | 自动 |
| 前瞻市盈率 | [FactSet Earnings Insight](https://advantage.factset.com/hubfs/Website/Resources%20Section/Research%20Desk/Earnings%20Insight/EarningsInsight_112026.pdf)（文件名 `EarningsInsight_MMDDYY.pdf`，每周五发布） | 原文 “The forward 12-month P/E ratio for the S&P 500 is X” | 2016-12（早年按月末取一期） | **手动**：每周把新一期写进 `spxFactSetFpe`；早年历史见下文回补 |

### 仓位与拥挤度

| 指标 | 来源 | 口径 | 历史起点 | 更新方式 |
|---|---|---|---|---|
| 家庭股票占金融资产比例 | FRED [BOGZ1FL153064486Q](https://fred.stlouisfed.org/series/BOGZ1FL153064486Q)（美联储 Z.1） | 季度，季末后约 10 周发布 | 1945 | 自动 |
| 家庭现金占金融资产比例 | FRED [CDCABSHNO](https://fred.stlouisfed.org/series/CDCABSHNO)、[TSDABSHNO](https://fred.stlouisfed.org/series/TSDABSHNO)、[MMFSABSHNO](https://fred.stlouisfed.org/series/MMFSABSHNO) ÷ [TFAABSHNO](https://fred.stlouisfed.org/series/TFAABSHNO) | 支票、储蓄存款与货币基金 ÷ 金融资产 | 1945 | 自动（缓存在本目录） |
| 融资余额同比 | [FINRA Margin Statistics](https://www.finra.org/rules-guidance/key-topics/margin-accounts/margin-statistics)；全历史 [xlsx](https://www.finra.org/sites/default/files/2021-03/margin-statistics.xlsx) | 客户保证金借方余额同比 | 1998 | 自动 |
| 基金经理现金比例、美股净超配、科技股净超配 | 美银全球基金经理调查（BofA FMS），每月第二个周二前后发布；原始报告需授权，用媒体转述（目前是 [MNI/macenews](https://macenews.com/bofa-global-research-fund-manager-survey-fading-inflation-jitters-prompt-shift-out-of-cash-into-fixed-income/)，也可查 Reuters、Investing.com） | 全球基金经理，不限美股组合 | 只有零星读数 | **手动**：每月写进 `managerCash`、`managerUsOverweight`、`managerTechOverweight`（科技股 2026-11 起，读数转述自 [Fortune](https://fortune.com/2026/11/17/ai-bubble-popping-bofa-fund-manager-survey-largest-cut-since-2006/)） |
| NAAIM 主动经理敞口 | [NAAIM Exposure Index](https://naaim.org/programs/naaim-exposure-index/)；公开表 `index.naaim.org/embeddable/table` | 周度平均敞口 | 2006-07 | 自动抓公开表，但 **2026-08-01 起改订阅制**，公开表停在 2026-08-19；早年历史见下文回补 |
| AAII 散户多空差（美银调查的平替） | [AAII 情绪调查](https://www.aaii.com/sentimentsurvey)；全历史 [sentiment.xls](https://www.aaii.com/files/surveys/sentiment.xls) | 看多 − 看空，按调查截止日（周三） | 1987-07 | 自动抓最新一周；早年历史见下文回补 |
| CFTC 资管机构标普期货净多（NAAIM 的平替） | CFTC 交易者持仓报告 TFF：[API](https://publicreporting.cftc.gov/resource/gpe5-46if.json)（合约代码 `13874+`） | 资管机构净多 ÷ 未平仓合约 | 2010-06 | 自动 |
| CFTC 资管机构纳指期货净多（科技股超配的自动口径） | 同上 TFF（合约代码 `20974+`），站内序列 `cftcNdxAsset` | 资管机构净多 ÷ 未平仓合约 | 2010-06 | 自动 |

### 交易结构

| 指标 | 来源 | 口径 | 历史起点 | 更新方式 |
|---|---|---|---|---|
| 行业宽度 | [Ken French 49 行业月表](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/49_Industry_Portfolios_CSV.zip) | 站上 10 个月均线的行业占比 | 1927 | 自动（缓存 `data-raw/macro-posture-market/industry-breadth.json`） |
| 量价（3 月 / 12 月均量） | [Yahoo ^GSPC](https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC) | 月均成交量与 10 个月均线 | 1950 | 自动 |
| VIX 期限结构 | Cboe [VIX](https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv)、[VIX3M](https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX3M_History.csv)；2009-09 以前用 FRED [VXVCLS](https://fred.stlouisfed.org/series/VXVCLS)（同一指数） | VIX ÷ VIX3M | 2007-12 | 自动（缓存在本目录） |
| 隐含相关性（1 个月） | Cboe [COR1M](https://cdn.cboe.com/api/global/us_indices/daily_prices/COR1M_History.csv)，对照 [COR3M](https://cdn.cboe.com/api/global/us_indices/daily_prices/COR3M_History.csv)（CDN 会 307 跳转到 cdn-api.cboe.com） | 期权隐含的标普成分股平均相关性，附 5 个交易日变化 | 2006-01 | 自动（缓存在本目录） |
| 做市商 Gamma 敞口（GEX） | [SqueezeMetrics](https://squeezemetrics.com/monitor/dix) 公开的 [DIX.csv](https://squeezemetrics.com/monitor/static/DIX.csv)（列为 date,price,dix,gex） | 估算值，按期权未平仓量和做市商持仓方向假设推算，单位换算为亿美元；附近 5 个交易日为负的天数。转载条款不明，按注明出处、研究展示处理 | 2011-05 | 自动（缓存在本目录） |
| 成分股站上 200 日线比例 | [datasets/s-and-p-500-companies](https://github.com/datasets/s-and-p-500-companies) 成分名单 + Yahoo 复权收盘 | 按当前成分名单回算，有幸存者偏差 | 2025-11 | 自动：`us-market-breadth.yml` |
| 美股 20 日量比 | [Cboe 全市场成交](https://www.cboe.com/markets/us/equities/market-statistics/historical-market-volume)（年度文件 `market_history_YYYY.csv`） | 当日成交股数 ÷ 前 20 个完整交易日均量，核心交易场所齐全、剔除半日市 | 2010-08 | 自动；早年历史见下文回补 |

### 盈利

| 指标 | 来源 | 口径 | 历史起点 | 更新方式 |
|---|---|---|---|---|
| 过去 12 个月每股盈利同比 | [Shiller 数据](https://shillerdata.com/)（`data-raw/sp500-backtest/shiller.csv`）；超出快照的月份用 [Multpl 盈利](https://www.multpl.com/s-p-500-earnings/table/by-month) × FRED [CPIAUCNS](https://fred.stlouisfed.org/series/CPIAUCNS) 补算 | 名义 EPS 同比 | 1872 | 自动（Shiller 快照需定期更新） |
| 前瞻每股盈利修正 | 标普收盘（`data-raw/macro-posture-daily/spx-daily.json`）÷ FactSet 前瞻市盈率 | 隐含前瞻 EPS 较约 3 个月前的变化；FactSet 引用发布日前一交易日收盘 | 2017-04 | 跟着前瞻市盈率走，前瞻市盈率手动更新后自动算出 |

## 二、一次性回补

回补脚本只把早于现有首个观测的部分接到序列前面，不改动已有观测，可以重复运行。

```bash
# Python 工具需要临时虚拟环境（项目本身不依赖它们）
python3 -m venv /tmp/radar-venv && /tmp/radar-venv/bin/pip install pypdf xlrd

/tmp/radar-venv/bin/python scripts/factset-forward-pe.py      # → factset-forward-pe.json（每行附 PDF 原文链接）
/tmp/radar-venv/bin/python scripts/aaii-sentiment-history.py  # → aaii-sentiment.json
node scripts/backfill-us-history.mjs                          # 合并进 public/data/us-market-data.json
node scripts/market-radar.mjs                                 # 重新生成雷达
```

| 序列 | 回补来源 | 本目录文件 |
|---|---|---|
| `volume` / `volumeRatio` | Cboe 2010 年起的年度成交文件（2010 年 7 月 EDGX 成为交易所后核心场所才齐全）；2010–2023 年 NYSE 半日市在 `scripts/lib/us-market-calendar.mjs` | 无（脚本直接下载） |
| `naaim` | NAAIM 改订阅前最后一版免费全历史 [USE_Data-since-Inception_2026-07-29.xlsx](https://naaim.org/wp-content/uploads/2026/07/USE_Data-since-Inception_2026-07-29.xlsx)；与站内重叠的 128 周逐一一致 | 无（脚本直接下载） |
| `spxFactSetFpe` | FactSet 官网存档 2016-12 起；官网返回 429 或缺档时改读 [互联网档案馆](https://web.archive.org/) 的同一 PDF。2014–2016 年只找到 2016-12 一期，2022-08 缺档 | `factset-forward-pe.json` |
| `retailBull` / `retailBear` | AAII 官方 `sentiment.xls`，发布日换成之前最近的周三、保留一位小数；与站内重叠的 4 周一致 | `aaii-sentiment.json` |

## 三、访问上的坑

- **FRED**：本机 Node 26 的 `fetch` 走 HTTP/2 会被 FRED 断开（CI 不受影响）；用 curl 可以，但不要带 `-A Mozilla/5.0`，会超时。
- **FactSet**：请求密集会返回 429 并封一段时间，抓取脚本已经单线程、间隔 3 秒。
- **Multpl**：短时间内反复抓取会被拒绝连接，等一阵再试。
- **AAII**：需要浏览器 User-Agent；资产配置调查的历史表已改为会员内容（404）。
- **NAAIM**：订阅制以后公开表不再更新，读数会一直显示“较旧”。

## 四、已确认补不了或决定不补

| 指标 | 原因 |
|---|---|
| 高收益债利差更早的历史 | 1996 年起的全历史只在 FRED 2023 年限流前的备份里；FRED 页面写明数据版权归 ICE、未经许可禁止转载，而本仓库公开，**决定不导入**（2026-11-24）。站内继续逐日累积 |
| 美元净流动性更早的历史 | WALCL 2002-12 才开始发布，ON RRP 2013 年才推出 |
| 成分股 200 日线比例长历史 | TradingView（S5TH）、Barchart（$S5TH）、StockCharts（$SPXA200R）都没有免费数据接口，抓取违反服务条款；自建需要按日的历史成分名单 |
| 美银调查完整历史 | 只在 Bloomberg、Refinitiv 等终端提供 |
| NAAIM 2026-08-19 之后的读数 | 需要订阅 |
| 前瞻市盈率 2016 年以前的历史 | FactSet 官网和互联网档案馆都没有留存 |
