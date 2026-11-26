# 美股数据（factorlab：us / us_kf / us_sec）

建立于 2026-11-26。本文写明美股三个数据源的来源、字段对应、幸存者偏差等级和理由、Ken French 数据集目录，以及首次试下载的审计结果。代码在 `research-py/factorlab/sources/{kf,us,sec}.py`，离线单元测试在 `research-py/tests/test_sources_us.py`。数据写在 `research-py/factor-data/`（不进 git）。

**本轮只做结构检查，没有计算任何因子统计，也没有计算任何与收益预测有关的统计。**

## 一、三个数据源一览

| 数据集 | 模块 | 来源 | 粒度 | 幸存者偏差等级 | 理由 |
|---|---|---|---|---|---|
| `us_kf` | `kf.py` | Ken French Data Library（月度 CSV zip） | 组合级月收益 | **C** | 组合由 CRSP（美国）/ Bloomberg（国际）全样本构造，退市收益由提供方处理，可以视同 A |
| `us` | `us.py` | Nasdaq Trader 符号目录 + Yahoo chart v8 日线 | 个股日线 | **B** | 证券表只有**当前上市**的股票，退市股票一只都没有，免费渠道拿不到退市股票的价格 |
| `us_sec` | `sec.py` | SEC EDGAR companyfacts（XBRL） | 公司 × 科目 × 期间 × 申报版本 | 不适用（点时财报） | 用 CIK 做主键，已退市公司的历史申报也在；数值从申报日之后才算可知 |

DESIGN.md 已定：B 级数据上得出的结论不能单独拿来决定采用。美国的确认检验优先用 KF 组合（C）和 SEC 财报。

## 二、Ken French（us_kf，等级 C）

### 字段对应

`{root}/us_kf/portfolios.parquet` 是长表，列沿用 `schema.KF_COLUMNS`，另加两列可选列：

| 列 | 含义 |
|---|---|
| `date` | 月末日期（YYYYMM 转成当月最后一天） |
| `dataset` | zip 文件名去掉 `_CSV.zip`，例如 `Portfolios_Formed_on_ME`、`Developed_ex_US_5_Factors` |
| `portfolio` | 表头列名，连续空白压成一个空格并去掉首尾空格（例如 `Lo 10`、`SMALL LoBM`、`Mkt-RF`、`RF`） |
| `weighting` | `vw` / `ew`。因子文件只有一个没有标题的月度段，记为 `vw`（因子本身就是用市值加权组合构造的） |
| `ret` | 月收益，用小数表示（原文件的百分数除以 100）。因子数据集里 `RF` 也以组合的形式存放 |
| `n_firms` | 同一文件「Number of Firms in Portfolios」段的公司数，因子数据集为 NaN |
| `avg_size` | 同一文件「Average Firm Size / Average Market Cap」段的平均市值（百万美元），因子数据集为 NaN |

- 缺失码 `-99.99` 和 `-999` 一律不写行，长表里没有这一行就表示缺失。每个数据集有多少个缺失格，记在 MANIFEST 的 `datasets.*.missing_cells` 里。
- 只取**月度**段。年度段、BE/ME 等特征段会被识别出来，但不写入。
- MANIFEST（`{root}/us_kf/MANIFEST.json`）的 `datasets` 记了每个 zip 的 URL、sha256、字节数、下载时间、覆盖区间和文件首行（例如 `created using the 202609 CRSP database`）。`sha256` 字段同时覆盖 `portfolios.parquet` 和全部 `raw/*.zip`。

### 解析器处理的格式问题（都有单元测试覆盖）

- 换行有 CRLF、LF 和裸 CR 三种，而且同一个文件里会混用（例如 `Portfolios_Formed_on_VAR`）。
- 段标题有多种写法：`Average Value Weighted Returns -- Monthly`、`Value Weight Returns -- Monthly`、`Value Weight Average Returns -- Monthly`，还有拼错的 `Aerage Value Weighted Returns`（出现在 `10_Portfolios_Prior_1_0`）。解析器的规则是：标题里有 `returns`、没有 `average of` 的段，才算收益段。`Value-Weighted Average of Past Return Variance` 这样的特征段因此不会被误判成收益段。
- 段标题可能跨好几行（例如 `For portfolios formed in June of year t …`），也可能没有标题（因子文件）。
- 表头名后面可能带空格（49 行业文件的 VW 段写成 `Food `，EW 段写成 `Food`）。数据行末尾可能多一个逗号，日期格里可能夹空格（国际文件写成 `199007   ,4.54`）。
- 个别年度段在表头和数据之间夹着空行。
- 有一处是 KF 文件自己的错误：`25_Portfolios_ME_NI_5x5` 的 Accruals 特征段，表头 35 列，数据只有 34 列。解析器对特征段只记一条警告，照常继续；如果收益段、公司数段或市值段的列数对不上，就直接报错。
- 数据集名和 zip 里的文件名大小写不一致（`Developed_ex_US_Mom_Factor_CSV.zip` 里的文件是 `Developed_ex_US_MOM_Factor.csv`），所以读取时取 zip 里唯一的那个 `.csv`。

### 数据集目录（94 个，2026-11-26 下载，CRSP / Bloomberg 截至 2026-09）

| 分组 | 数据集 | 区间 | 组合数 | 加权 | 缺失格 |
|---|---|---|---|---|---|
| 美国因子 | F-F_Research_Data_Factors（Mkt-RF、SMB、HML、RF） | 1926-07 – 2026-09 | 4 | vw | 0 |
| 美国因子 | F-F_Research_Data_5_Factors_2x3（+RMW、CMA） | 1963-07 – 2026-09 | 6 | vw | 0 |
| 美国因子 | F-F_Momentum_Factor | 1927-01 – 2026-09 | 1 | vw | 0 |
| 美国因子 | F-F_ST_Reversal_Factor | 1926-02 – 2026-09 | 1 | vw | 0 |
| 美国因子 | F-F_LT_Reversal_Factor | 1931-01 – 2026-09 | 1 | vw | 0 |
| 单变量 | Portfolios_Formed_on_ME | 1926-07 – 2026-09 | 18 | ew/vw | 2406（`<= 0` 整列为空） |
| 单变量 | Portfolios_Formed_on_BE-ME | 1926-07 – 2026-09 | 19 | ew/vw | 86 |
| 单变量 | Portfolios_Formed_on_OP / _INV | 1963-07 – 2026-09 | 18 / 18 | ew/vw | 0 |
| 单变量 | Portfolios_Formed_on_E-P / _CF-P | 1951-07 – 2026-09 | 19 / 19 | ew/vw | 0 |
| 单变量 | Portfolios_Formed_on_D-P | 1927-07 – 2026-09 | 19 | ew/vw | 0 |
| 单变量 | Portfolios_Formed_on_BETA / _VAR / _RESVAR / _AC | 1963-07 – 2026-09 | 15 | ew/vw | 0 |
| 单变量 | Portfolios_Formed_on_NI | 1963-07 – 2026-09 | 17 | ew/vw | 0 |
| 单变量 | 10_Portfolios_Prior_12_2（动量） | 1927-01 – 2026-09 | 10 | ew/vw | 0 |
| 单变量 | 10_Portfolios_Prior_1_0（短期反转） | 1926-02 – 2026-09 | 10 | ew/vw | 0 |
| 单变量 | 10_Portfolios_Prior_60_13（长期反转） | 1931-01 – 2026-09 | 10 | ew/vw | 0 |
| 双变量 | 6_Portfolios_2x3、25_Portfolios_5x5、100_Portfolios_10x10（ME×BE/ME） | 1926-07 – 2026-09 | 6 / 25 / 100 | ew/vw | 0 / 0 / 2905 |
| 双变量 | 6_Portfolios_ME_OP_2x3、_ME_INV_2x3 | 1963-07 – 2026-09 | 6 | ew/vw | 0 |
| 双变量 | 6_Portfolios_ME_Prior_12_2 / _1_0 / _60_13 | 1927-01 / 1926-02 / 1931-01 – 2026-09 | 6 | ew/vw | 0 |
| 双变量 | 6_Portfolios_ME_EP_2x3、_CFP_2x3 | 1951-07 – 2026-09 | 6 | ew/vw | 0 |
| 双变量 | 6_Portfolios_ME_DP_2x3 | 1927-07 – 2026-09 | 6 | ew/vw | 0 |
| 双变量 | 25_Portfolios_ME_OP_5x5、_ME_INV_5x5 | 1963-07 – 2026-09 | 25 | ew/vw | 0 |
| 双变量 | 25_Portfolios_ME_Prior_12_2 | 1927-01 – 2026-09 | 25 | ew/vw | 8 |
| 双变量 | 25_Portfolios_ME_Prior_1_0 | 1926-02 – 2026-09 | 25 | ew/vw | 0 |
| 双变量 | 25_Portfolios_ME_Prior_60_13 | 1931-01 – 2026-09 | 25 | ew/vw | 42 |
| 双变量 | 25_Portfolios_ME_AC_5x5、_ME_BETA_5x5、_ME_VAR_5x5、_ME_RESVAR_5x5 | 1963-07 – 2026-09 | 25 | ew/vw | 0 |
| 双变量 | 25_Portfolios_ME_NI_5x5（实际有 35 个组合：含 NegNI / ZeroNI） | 1963-07 – 2026-09 | 35 | ew/vw | 0 |
| 双变量 | 25_Portfolios_BEME_OP_5x5、_BEME_INV_5x5、_OP_INV_5x5 | 1963-07 – 2026-09 | 25 | ew/vw | 0 |
| 双变量 | 100_Portfolios_ME_OP_10x10、_ME_INV_10x10 | 1963-07 – 2026-09 | 100 | ew/vw | 0 / 96 |
| 行业 | 5、10、12、17、30 行业 | 1926-07 – 2026-09 | 同名 | ew/vw | 0 |
| 行业 | 38、48、49 行业 | 1926-07 – 2026-09 | 同名 | ew/vw | 7142 / 4800 / 5736（早年部分行业没有公司） |
| 国际因子 | Developed / Developed_ex_US / Europe / Japan / Asia_Pacific_ex_Japan / North_America 的 3 因子与 5 因子 | 1990-07 – 2026-09 | 4 / 6 | vw | 0 |
| 国际因子 | 上述 6 个地区的动量（Mom / MOM） | 1990-11 – 2026-09 | 1 | vw | 0 |
| 国际因子 | Emerging_5_Factors | 1989-07 – 2026-09 | 6 | vw | 60 |
| 国际因子 | Emerging_MOM_Factor | 1990-01 – 2026-09 | 1 | vw | 0 |
| 国际组合 | Developed、Developed_ex_US 的 6 / 25 组合：ME×BE-ME、ME×OP、ME×INV | 1990-07 – 2026-09 | 6 / 25 | ew/vw | 0 |
| 国际组合 | Developed、Developed_ex_US 的 6 / 25 组合：ME×Prior_12_2 | 1990-11 – 2026-09 | 6 / 25 | ew/vw | 0 |
| 国际组合 | Emerging_Markets_6_Portfolios_ME_BE-ME / _OP / _INV / _Prior_12_2 | 1989-07 / 1991-07 / 1992-07 / 1990-01 – 2026-09 | 6 | ew/vw | 0 |

完整清单在 `uv run python -m factorlab.sources.kf catalog`，逐个数据集的明细在 MANIFEST 的 `datasets` 字段。

### 试运行审计（2026-11-26）

- 下载 94 个 zip，共 94 次请求，限速 1 次/秒，用时约 95 秒，raw 目录 17 MB。生成的 `portfolios.parquet` 有 2,496,152 行，占 27 MB，覆盖 1926-02 至 2026-09。
- 主键 `(date, dataset, portfolio, weighting)` 没有重复，`ret` 没有 NaN，所有日期都是月末。
- 月份缺口：极端分组在早年有空月，例如 100_Portfolios_10x10 里个别格子缺 5–7 个月，25_Portfolios_ME_Prior_60_13 的 `BIG LoPRIOR` 缺 5 个月，38 行业的 `Govt` 缺 5 个月。这些缺口都来自原文件里的缺失码，解析没有丢数据。
- `ret ≤ −100%` 的有 4 行，全是 100_Portfolios_10x10 在 1927、1932 年只有 1 家公司的格子，属于原始数据本来如此。|ret| > 100% 的有 221 行，集中在早年公司很少的细分组合里。
- **一致性核对**（只看绝对差，不涉及任何因子表现）：用 `n_firms × avg_size` 作权重，对 49 行业的 VW 收益求和，再和 `Mkt-RF + RF` 比较。1,203 个月里，平均绝对差 0.044 个百分点，中位数 0.019 个百分点，最大 1.75 个百分点（2000-03），99.3% 的月份差距小于 0.5 个百分点。用 ME 十分位组合做同样的核对，平均 0.043 个百分点，最大 1.68 个百分点（同样在 2000-03）。差距来源是 KF 的市场组合与行业 / 规模组合的样本口径略有不同，例如行业组合不包括没有 SIC 代码的公司。

## 三、美股个股（us，等级 B）

### 来源与字段对应

**证券表**：用 `nasdaqlisted.txt` 和 `otherlisted.txt`（Nasdaq Trader 符号目录，每日更新），写入 `{root}/us/securities.parquet`。

- 只保留 NASDAQ、NYSE、AMEX 上市的证券。剔除 ETF、测试证券，以及名称里带权证、权利、SPAC 单位、优先股、票据 / 债券、ADR / 纽约注册股、封闭式基金、结构化产品的证券，也剔除代码里含 `$ ^ = +` 的证券。名称匹配按词边界进行，例如 `UnitedHealth` 不会被当成 `unit`。
- 保留 `sec_type ∈ {common, ordinary, unspecified}`。`unspecified` 是名称里没写证券类型的证券，大多是 NYSE 普通股，例如 `Advance Auto Parts Inc.`。2026-11-26 共保留 5,262 只：NASDAQ 3,210 只、NYSE 1,818 只、AMEX 234 只。其中 217 只是 SPAC（`is_spac` 列标出，主要是 `Class A Ordinary Shares`），使用时应剔除。
- 额外列：`sec_type`、`is_spac`、`yahoo`（Yahoo 代码，`BRK.B` 写成 `BRK-B`）、`financial_status`（纳斯达克的财务状况标记）、`has_prices`。
- `list_date` 取 Yahoo 的 `firstTradeDate`。这是 **Yahoo 数据的起点**，老股票的这个日期会被截断，不等于真实上市日。`delist_date` 全部为空，`status` 全部是 `listed`。
- **代码是下载当天的 ticker。ticker 会被重复使用**：退市公司的代码可能分给新公司，公司改名时也会换代码。跨时期把个股价格和财报合并时，必须以 SEC 的 CIK 为准（见第四节）。

**日线**：Yahoo chart API v8，请求为 `query1.finance.yahoo.com/v8/finance/chart/{SYM}?period1=…&interval=1d&events=div|split&includeAdjustedClose=true`，请求头只带 UA `Mozilla/5.0`，限速每 1.1 秒 1 次。原始 JSON 用 gzip 压缩后缓存在 `{root}/us/raw/yahoo/{CODE}.json.gz`，下载可以断点续传，失败记录在 `_status.json`。

| schema 列 | 来源与换算 |
|---|---|
| `close` / `open` / `high` / `low` | Yahoo 的 `quote` 值**已经按拆股调整过**（我们用 2020-08-31 AAPL 4:1 拆股实测确认过）。用 `events.splits` 把它还原成真正的不复权价：t 日的价格乘以 t 日之后所有拆股比例的连乘积。试运行里 AAPL 2020-08-28 还原后是 499.23，与当日实际收盘一致 |
| `volume` | 除以同一个连乘积，再取整，得到不复权股数 |
| `close_adj` | Yahoo 的 `adjclose` 同时按拆股和现金分红调整，口径是分红再投资的总收益，并以最新价为锚。这里把整列乘一个常数，使首日等于首日的不复权收盘，变成后复权口径。比值不变，收益可以连乘，重新下载时历史水平也不会漂移 |
| `amount` | `close × volume`，是近似成交额 |
| `turnover`、`mcap_float`、`mcap_total` | NaN。没有免费的历史股本数据，以后可以用 SEC dei 的股本补，见下文 |
| `limit_up`、`limit_down`、`is_suspended` | 空 |

另外写了 `{root}/us/actions.parquet`，记录拆股（`value` = 新股数 / 旧股数，反向拆股小于 1）和现金分红（`value` = 每股金额，不复权）。

- 未收盘的当日 K 线不写入（美东 16:30 之前，当天的行一律丢弃）。
- 备用源：东方财富美股 K 线 `fetch_eastmoney()`（secid 105 / 106 / 107）。**2026-11-26 在本机测试时 push2his 返回空响应，没能验证**，东方财富美股复权是否包含分红也没有核实，所以主流程不用它。

### 股票池建议（个股级，等级 B）

DESIGN 的建议是：取市值前 500、价格不低于 1 美元的股票。目前没有免费的历史市值，可行的办法是用 **SEC dei:EntityCommonStockSharesOutstanding**（每份 10-K / 10-Q 封面上的流通股数，按申报日点时生效），按 CIK 对到 ticker 上，再乘以不复权收盘价，得到点时市值。等 SEC_USER_AGENT 设好以后再做。在那之前，只能用 `close ≥ 1`、`volume > 0`、滚动成交额门槛做近似，而且这个近似的结论必须注明。

### 试运行（2026-11-26，200 只，1995-01-01 起）

样本由 `pilot_sample` 按固定随机种子抽取，包括 60 只大盘股（`LARGE_CAPS`），24 只 2023–2025 年上市的新股（CART、KVYO、CAVA、RDDT、ALAB、RBRK、CRWV、CRCL、CHYM、ETOR、FIG、KLAR、SAIL、VG、LOAR、TEM、WAY、OKLO、NBIS、BIRK、SFD、MNTN、GRND、HNGE；ARM、PONY 是 ADR，按规则已被剔除），其余 116 只从证券表随机抽取，多为中小盘。按交易所分，NASDAQ 102 只、NYSE 90 只、AMEX 8 只。样本里有 SPAC 8 只，最新收盘低于 1 美元的 14 只。

| 项目 | 结果 |
|---|---|
| 请求 | 证券表 2 次 + Yahoo 200 次，**失败 0 次**，用时约 4.5 分钟（每只约 1.3 秒） |
| 行数 | 866,574 行，日期 1995-01-03 至 2026-11-25（11-26 是感恩节，休市） |
| 每只股票的行数 | 中位数 4,220 行，最少 44 行，最多 8,029 行（1995 年起全程都有数据的 60 只） |
| 首日分布 | 1995 年 60 只；2024–2026 年 41 只（近年新股和新上市小盘股） |
| 重复 `(date, code)` | 0 |
| close_adj 为 NaN 或 ≤ 0 | 0 |
| OHLC 不自洽（high < low，或收盘价在高低价区间外） | 0 |
| 相对交易日历的缺日；间隔超过 7 天的缺口 | 0；0（Yahoo 对没有成交的交易日也给行，见下一项） |
| **volume = 0 的行** | 24,040 行。其中 22 只股票超过 10% 的交易日成交量为 0，最高的 NXPL 达 70%，NXTS 67%，OGG 64%。这些日子 Yahoo 沿用前一天的价格 |
| 不复权收盘 < 0.5 美元的行 | 20,616 |
| 拆股 / 分红事件 | 281 次拆股（其中 69 次反向拆股），8,063 次分红 |
| **复权因子核对**（k = close_adj / close） | 拆股日 k 的变化应当等于拆股比例：280 次中 98.9% 吻合，偏差在 ±2% 以内。不吻合的 3 次都是 TSM 的股票股利（1.05、1.03、1.005）恰好和现金分红同一天除权，属于正常情况。非拆股日 k 下降超过 0.5% 的有 0 次 |
| **极端日收益**（\|close_adj 日收益\| > 50%） | 370 次，涉及 49 只股票，其中 125 次发生在 volume = 0 的日子。最极端的是 OGG 2020-12-03 的 +96,900%：前一天 2020-12-02 是 1:60 反向拆股日，又没有成交，Yahoo 沿用了拆股前的价格 0.006，复权价因此被错误地除以 60，第二天恢复成交后就出现了虚假的暴涨。NXTS、NXPL 情况类似。大盘股里只有 6 次，都是真实事件：AIG 2008-09-15 −61%，2009-03 +66%，2009-08 +63%；C 2008-11-24 +58%；AMD 2016-04-22 +52%；AAPL 2000-09-29 −52% |

**结论**：大盘股和流动性好的股票数据干净，拆股还原和复权口径都核对通过。仙股和无成交股票有 Yahoo 的结构性问题：沿用前值的价格碰上反向拆股，会产生虚假收益。因子计算前**必须**剔除 volume = 0 的日子（或剔除这些股票），并设价格和成交额门槛。

## 四、SEC EDGAR（us_sec，点时财报）

### 启用方法

SEC 要求请求头带上能联系到的 User-Agent。本模块**只从环境变量读取** UA，代码和请求里都不写任何个人信息：

```bash
export SEC_USER_AGENT="你的组织名 你的联系邮箱"
cd research-py
uv run python -m factorlab.sources.sec tickers              # ticker → CIK 映射（当天快照）
uv run python -m factorlab.sources.sec facts --cik 320193   # 某公司点时 vintage 表 → {root}/us_sec/pit/CIK0000320193.parquet
```

没有设置时，所有联网函数都会抛出 `SecUserAgentMissing`，命令行打印设置方法并以退出码 2 结束。2026-11-26 这个变量没有设置，所以**没有发出过任何 SEC 请求**，只跑了离线测试。

### 点时规则（实现见 `sec.py`，每条都有单元测试）

1. **主键是 CIK**。`company_tickers.json` 只是下载当天的 ticker → CIK 映射，ticker 会被重复使用，历史归属要以 CIK 为准。
2. **一个数值从申报（filed）以后才算可知**。只用 companyfacts 每条事实自带的 `filed` 和 `accn` 来判断，不用 `fy` / `fp`，因为这两个字段描述的是**申报文件本身**的财年和季度，而同一期间的数值会出现在之后多份文件的对比栏里。
3. **期间按 start / end 对齐**。时点科目（资产、权益、股本）只有 end，流量科目有 start 和 end，`period_days` 用来区分单季、半年、9 个月和全年。
4. **生效日**：如果有受理时间（submissions API 的 `acceptanceDateTime`，只覆盖最近约 1,000 份申报），美东 16:00 前受理的当天生效，16:00 及以后受理的下一个工作日生效。没有受理时间时，保守地按 `filed + 1 个工作日` 生效。工作日只是交易日的近似，遇到节假日由引擎按交易日历顺延。
5. **vintage 表**（`vintages()`）：同一期间如果在之后的文件里重复出现、数值不变，只保留最早的那一条。数值变了（重述、10-K/A、10-Q/A）就另记一个新版本（`version` 加 1），**从不覆盖历史**。`asof(vint, date)` 返回截至某天已经生效的最新值。
6. **单季还原**（`quarterize()`）：10-Q 里的现金流量科目（有时也包括利润表科目）是年初至今的累计值。还原规则是 Q2 = H1 − Q1，Q3 = 9M − H1，Q4 = 全年 − 9M。有直接披露的 3 个月数值时优先用直接值。差分值的生效日等于所用各分量里最晚的那个生效日。任何一个分量后来被重述，差分值都另记一个新版本。例如测试里 10-K/A 把全年数从 600 改成 610，Q4 就从 180 变成 190，新版本从重述生效那天开始用，旧值保留。

默认提取的科目：NetIncomeLoss、StockholdersEquity、Assets、Liabilities、Revenues、RevenueFromContractWithCustomerExcludingAssessedTax、SalesRevenueNet、OperatingIncomeLoss、GrossProfit、NetCashProvidedByUsedInOperatingActivities、PaymentsToAcquirePropertyPlantAndEquipment、CommonStockSharesOutstanding、dei:EntityCommonStockSharesOutstanding。三个收入科目互相替代，不做合并，各自保留。

## 五、缺口与局限

1. **免费渠道拿不到已退市美股的价格**，所以个股级数据只能是 B 级。要做到 A 级，需要 CRSP（WRDS 订阅）或同类付费库（例如 Norgate 含退市数据的套餐）。在那之前，个股结论只作探索，确认检验用 KF 组合（C）。
2. 没有历史市值和股本。以后用 SEC dei 股本 × 不复权价构造点时市值（见第三节），SEC_USER_AGENT 设置好之后才能做。
3. Yahoo 仙股数据质量差：沿用前值的价格加上反向拆股会产生虚假收益，见第三节审计。Yahoo 对停牌日和无成交日不作区分。
4. 证券表里的「当前上市」状态有前视问题：任何用证券表筛选出来的历史股票池，都已经剔除了之后退市的公司。
5. KF 数据是按月更新的，本次截至 2026-09。KF 会回溯修订历史数据（CRSP 版本更新时），每次重新下载都会改变 sha256，MANIFEST 会记录。
6. 东方财富美股备用源没有经过验证。
7. 存储层有一个已知问题（不在本模块内）：`store._coerce` 对缺少的 float 列会填 `pd.NA` 再转 float64，结果报错。`build_us` 先显式填 NaN 绕开了，建议 `store.py` 的维护方修复。另外 `store.py` 目前没有写 SEC 点时表的函数，所以 `sec.py` 直接写 `{root}/us_sec/pit/*.parquet`。

## 六、全量下载命令与估算

```bash
cd research-py
# Ken French：94 个 zip，约 94 次请求、约 2 分钟、17 MB
uv run python -m factorlab.sources.kf fetch && uv run python -m factorlab.sources.kf build && uv run python -m factorlab.sources.kf audit

# 美股个股：证券表约 5,262 只 → 约 5,264 次请求，每只约 1.3 秒 → 约 1.9 小时；
# raw 约 550 MB（gzip 压缩后），prices.parquet 约 20M 行、0.6–0.8 GB。可以随时中断，重跑时自动跳过已下载的
uv run python -m factorlab.sources.us fetch                   # 全量（断点续传）
uv run python -m factorlab.sources.us fetch --retry-failed    # 重试失败的
uv run python -m factorlab.sources.us build && uv run python -m factorlab.sources.us audit

# SEC：先 export SEC_USER_AGENT=...；每家公司 2 次请求（companyfacts + submissions），每秒约 6 次
# 约 5,000 家公司 ≈ 10,000 次请求 ≈ 30 分钟；companyfacts 每家 1–10 MB（gzip 压缩后约其 15%）
uv run python -m factorlab.sources.sec tickers
uv run python -m factorlab.sources.sec facts --cik <CIK>
```

如果要全量拉 SEC，更省请求的办法是 SEC 每晚发布的批量包 `companyfacts.zip`（Archives/edgar/daily-index/xbrl/，压缩后约 1 GB 以上），一次下载即可。批量入口还没有实现，留到 v2。

## 七、测试

```bash
cd research-py && uv run pytest -q tests/test_sources_us.py    # 16 个离线测试：KF 解析、Yahoo 拆股还原、符号目录过滤、SEC 点时
```

## 八、点时基本面面板与市值（2026-11-27，R1 用）

代码 `research-py/factorlab/fundamentals_us.py`，因子 `factorlab/factors/fundamental.py`，测试 `tests/test_factorlab_fundamental.py`（10 个，含无前视、TTM 数值、负账面权益、拆股、量纲笔误、锁箱截断）。

**两步**：`uv run python -m factorlab.fundamentals_us build` 把 5,027 个 vintage 表变成「知识时点」事件表 `factor-data/us_sec/derived/events.parquet`（每家公司在任一所需科目的生效日上算一行状态，只用生效日 ≤ 该日的数值；约 18.9 万行，单进程约 1 分钟）。评估时 `data.load_market("us", …)` 经 `data.EXTRA_PROVIDERS` 调 `fundamentals_us.panel_fields`：先按 `data.window()`（即 `guard.Lockbox`）给出的可见上界删掉生效日不早于上界、或落在被删区间的事件，再在面板的每个月末交易日取最新状态。**不写进 prices.parquet**：prices 里的 `mcap_float / mcap_total / turnover` 仍是空，美股的这三个字段改由这里现算（月末行；turnover 为日度），数据快照哈希 = prices MANIFEST 哈希 + 事件表 MANIFEST 哈希。

**字段**（陈旧度：所用期末日早于月末超过 15 个月即为空）：

| 字段 | 口径 |
|---|---|
| `mcap_total` = `mcap_float` | 股本 × 当日不复权收盘。股本优先 dei 封面股数，缺失或比 us-gaap 晚一年以上用 CommonStockSharesOutstanding；拆股按 actions.parquet 调整到当日（dei 从封面日起算，us-gaap 从申报日起算；拆股落在两者之间时取与上一个通过值更接近的口径）。只有总股本，没有流通股本，两列相同 |
| `fund_be` | StockholdersEquity（不含少数股东权益，没有加递延税、减优先股） |
| `fund_ni_ttm` / `fund_cfo_ttm` / `fund_gp_ttm` | 最近 12 个月 = 最新年报 + 本年累计 − 上年同期；退而用连续 4 个单季、再退而用最新年报。真实数据抽 25 家 164 个时点，与 `sec.quarterize` 单季还原后 4 季相加完全一致 |
| `fund_assets` / `fund_assets_lag` | 最新总资产；同一快照里期末早 330–400 天的总资产 |
| `fund_accruals` | (NI_TTM − CFO_TTM) / 平均总资产，三者期末相差 > 10 天为空 |
| `fund_net_issuance` | log(拆股调整后股本 / 12 个月前月末已知的股本，调整到同一口径) |
| `turnover`（日度） | 成交量 / 当日已知的拆股调整后股本 |

**股本清洗**（都只用当时可得的信息）：① 最新股数来自 20-F 的不用（外国私人发行人，美国上市的多是 ADR，1 份 ADR ≠ 1 股；TM、TSM 原先算出 2 万亿美元级市值）；② 用事件日之前 63 日成交量中位数 ÷ 股本得日换手，不在 [0.002%, 25%] 的视为量纲笔误（实测 AEP 2010 年 3 份 10-Q 封面股数 ×10⁶、HL 2023-08 ×10³、EEFT 2021-02 ×10⁹）；③ 与上一个通过值相差 10^2.5 倍以上的同样剔除；被剔除时沿用上一个通过值（陈旧度照查）。清洗后探索区月末市值前 500 合计：2020-12 为 31.5 万亿美元、2023-09 为 35.6 万亿（同期标普 500 约 33、37 万亿）；AAPL、TSLA、NVDA、AMZN、GOOGL、NFLX 的拆股月份市值连续。

**覆盖**（2012 年以后每月平均有值的代码数）：市值约 2,280、BE 2,550、NI_TTM 2,380、CFO_TTM 2,180、毛利 1,170（只用 GrossProfit 科目，约一半公司不报）、应计 1,860、净发行 2,080。市值在候选股票里的覆盖率 2010-08 才过 50%（XBRL 第二批），此前美股股票池仍按成交额排序；基本面字段在前 500 股票池的覆盖率 2011-08 起全部 ≥ 70%，R1 的基本面评估从 2011-08 起算。

**局限**：代码 → CIK 用当前 company_tickers 快照，同一 CIK 多个代码只给排第一的（43 家多类股公司的次要类别没有市值，不进股票池）；控股公司重组换 CIK 的（如 Google 2015 年改为 Alphabet）旧 CIK 的财报对不上，GOOGL 2016-02 以前没有市值；Yahoo 价格历史若接了旧公司的代码会错配，无法从免费数据核实；BE 没有做 Fama–French 的调整。
