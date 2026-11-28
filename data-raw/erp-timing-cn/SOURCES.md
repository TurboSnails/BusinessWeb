# 数据来源：A 股股债性价比（ERP）与宏观择时（L-057 调研）

取数日期：2026-11-28（本机时区 UTC+4）。取数人：L-057 调研 worker。原始文件放 `raw/`，只留本机（`.gitignore` 第 64 行已有 `data-raw/erp-timing-cn/raw/`）。

**纪律**：本阶段**没有保存任何指数价格**。中证官网接口只保留日期与 `peg`（滚动市盈率）；乐咕乐股返回的「指数」「沪深300指数」列在落盘前丢弃。没有计算任何收益、回撤、夏普。

所有外部请求只发往公开接口，串行，间隔 3–5 秒（Crossref 4 秒），User-Agent 为通用浏览器串或 `research-script/1.0`，不带任何个人信息。

## 文件清单

| 文件 | 来源与参数 | 行数 | 起止 | SHA-256 |
|---|---|---:|---|---|
| `raw/csindex_pe_000300.json` | 中证指数官网 `GET https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000300&startDate=YYYY0101&endDate=YYYY1231`，2005 起每 4 年一段，共 6 段；脚本 `docs/research/erp-timing-cn-2026-11-28/fetch_csindex_pe.py` | 5,318 个交易日；有 PE 3,680 行 | 2005-01-04 至 2026-11-27；**PE 从 2011-06-28 起** | `a513349796ea8778ba8b90d5d3d79397ad73a05f8422476f40caef451d726f6b` |
| `raw/csindex_pe_000985.json` | 同上，`indexCode=000985`（中证全指） | 5,319；有 PE 3,681 | 同上；PE 从 2011-06-28 起 | `3c68b54a993c4744916961801649a81f18ab6d3ca3090275205e597b50e9bde2` |
| `raw/lg_pe_csi300.json` | 乐咕乐股，经 AkShare 1.20.70 `stock_index_pe_lg(symbol="沪深300")`；脚本 `fetch_ak.py` | 260（月末） | 2005-04-29 至 2026-11-27，无缺月 | `34241a334298a9e601dcffc81b43f527bd76ca901f8345f8e4d3ee0ceea4a28f` |
| `raw/lg_ebs_csi300.json` | 乐咕乐股 `stock_ebs_lg()`（沪深 300 股债利差，日频） | 5,253 | 2005-04-08 至 2026-11-27 | `ebd94edf2995ae1a7132cabc2b535f6f4fc16dc9d085be030143075f8421c323` |
| `raw/lg_a_ttm_lyr.json` | 乐咕乐股 `stock_a_ttm_lyr()`（全 A 市盈率中位数 / 等权，月末） | 263 | 2005-01-31 至 2026-11-27 | `07fd2bfe8c5535a9c8acf23548e6f666a7fa3b2934bcda233429d219e61058f5` |
| `raw/em_bond_10y.json` | 东方财富，经 AkShare `bond_zh_us_yield_em(start_date="20050101")` | 5,840 行；10 年期有值 5,476 | 10 年期 2005-01-04 至 2026-11-27 | `7a110108b52a08e87d61b2ff938c31794262ddd35ab5a9d822cfa4d65d8874c8` |
| `raw/sina_money_supply.json` | 新浪财经，经 AkShare `macro_china_money_supply_sina()`（统计月） | 586 | 1978-01 至 2026-10；M1 同比 1979-01 起，M2 同比 1991-12 起 | `9ca6ec4b8356e114b9ae08714c9cac2ec2c421198e9b50427f1b00a2b9b880f1` |
| `raw/em_money_supply.json` | 东方财富，经 AkShare `macro_china_money_supply_em()`（统计月；第一次请求断流，重试成功） | 226 | 2008-01 至 2026-10 | `23b0ecdd1018562ee3e7489c41b26b76803b5ecee281c44095bb49a85c49dc16` |
| `raw/jin10_m2_releases.json` | 金十数据中心 `GET https://datacenter-api.jin10.com/reports/list_v2?category=ec&attr_id=59&max_date=…`（中国 M2 同比，含发布日与当时公布值），按 max_date 往前翻页；脚本 `fetch_jin10.py` | 395 条（其中有公布值 337 条） | 1998-02 至 2025-09；**真实发布日只从 2010-11-10 起**（之前是占位的月初日期） | `926563870e86f1d34ceffc3f2932aba5ed0a1d6594381c6b2ebb724eabb2ecfd` |
| `raw/mofcom_afre_flow.json` | 商务部，经 AkShare `macro_china_social_financing()`（社融增量，统计月） | 136 | 2015-01 至 2026-04 | `3f0027c8b4dbc02fec0535088fa1d0c3d59aae0a2dcc2a1a844658769276298f` |
| `raw/pbc/index.html` | 人民银行调查统计司「统计数据」栏目 `https://www.pbc.gov.cn/diaochatongjisi/116219/116319/index.html` | — | 年度目录 1999–2025 | `6314e36292fec63514dd55ed2a6a6efa3d07ff020c93f690d2505bc28ec99fdb` |
| `raw/pbc/shrz_3013637_3013639.html` | 同上，2016 年「社会融资规模」页 | — | — | `732632f4e76a35afeabf06f873885065046de4bc8248548fb3e54a0ca8eec97a` |
| `raw/pbc/shrz_2161324_2161336.html` | 同上，2015 年「社会融资规模」页 | — | — | `1d900dc746ee46114d8d83c31114a8cb58362f916f4f65b6b0fa7307152a946a` |
| `raw/pbc/shrz_116354_116481.html` | 同上，2012 年「社会融资规模」页（只有增量表） | — | — | `7213cbd04f479a2eac92db86cc89c34fd844794f2456f1559f443de043dd794a` |
| `raw/pbc/afre_stock_2016.xls` | 人民银行 2016 年社会融资规模存量统计表 `…/cms/2018/04/2018041810585987735.xls` | 33 × 25 | **2016-01 至 2016-12，按月** | `b04a81c5eff4e3ff0022227891a5dd676716e098a954368130e8b3c2cf9a42b6` |
| `raw/pbc/afre_2015_b.xls` | 人民银行 2015 年社会融资规模存量统计表 `…/cms/2019/05/2019053116170320732.xls` | 27 × 9 | **2015Q1 至 2015Q4，按季** | `b4b6cbc2a2d83e89fa14c53b0cbddb86e33971565f4985cd747ea5750ef32f33` |
| `raw/crossref_check.json` | Crossref `GET https://api.crossref.org/works/{doi}`（文献元数据核对；第一批里有 6 个 DOI 是凭记忆写错的，第二批已按检索结果改正，两批都留档） | 31 条 | — | `ebcb299babef6e78e2f46d0623e930e6e50ba464d79ba898da7d274359e21bda` |

仓库内已有、作第二来源核对（未复制）：`public/data/cn-market-data.json` 的 `series.cnTenYear`（中债官网 historyQuery 为主，2002 起，2024 年前基本为周频），SHA-256 `e0b415dbb39736c28de067d5a68d1659d538307d0a1be77a90fde6deb46b4776`；`public/data/equity-bond-spread.json`（站内「股债息差」页的数据，即乐咕 `stock_ebs_lg`），SHA-256 `30bb3fb264194663a6fa19809f774a0a26764e2a0651f5888276593efa40bd50`。

文献摘要另用 OpenAlex `https://api.openalex.org/works/doi:{doi}` 与 Semantic Scholar `https://api.semanticscholar.org/graph/v1/paper/DOI:{doi}` 补取（只读摘要，不落盘）；SSRN 页面返回 403。

## 核对结果（`docs/research/erp-timing-cn-2026-11-28/count.py` → `count-results.json`）

| 项目 | 结果 |
|---|---|
| 中证官网 PE 起点 | 沪深 300、中证全指的 `peg` 都从 **2011-06-28** 才有值，之前为 null。起点后缺 66 个交易日，集中在 2011-06-29 起的头几个月 |
| 乐咕 TTM PE 与中证官网 PE（月末，2011-06 至 2026-11，184 个月） | 乐咕 ÷ 中证 中位数 **0.921**（5%–95% 分位 0.885–0.972），相关 0.969，184 个月里 159 个月差异 > 5%。**两者口径不同**：乐咕系统性低约 8%。原因未能核实（可能是成分加权、负盈利处理或股本口径不同） |
| 乐咕股债利差的定义 | 用月末数据重算 100 ÷ 乐咕滚动 PE − 东财 10 年期，与 `stock_ebs_lg` 的差：平均 0.041 个百分点、最大 0.31（259 个月）；用静态 PE 则差 0.415。**结论：乐咕股债利差 = 1 ÷ 滚动 PE − 10 年期国债**，也就是站内「股债息差」页的序列 |
| 乐咕静态 PE ÷ 滚动 PE | 中位数 1.051 |
| 10 年期国债（东财） | 2005-01-04 起有值，5,476 个值；工作日缺 389 天（每年 15–23 天，与节假日相符），最长间隔 11 天 |
| 东财与中债（仓库快照）对比 | 1,351 个共同日期（2005-01-07 至 2026-11-27），平均绝对差 0.24 个基点，最大 0.5 个基点，没有一天差 5 个基点以上 |
| M1 / M2 同比（新浪） | 2004 年以来无缺月。与东财（2008 起 226 个月）对比：M2 只有 2018-06 差 0.3 个百分点；M1 有 3 个月不同（2018-06 差 −0.6、2019-02 差 +0.4、2022-12 差 +2.1）。**主实现须选定一个来源，并对这 3 个月用人民银行「货币统计概览」原表核对** |
| M1 口径断点 | 新浪 M1 余额 2024-12 为 67.1 万亿元、2025-01 为 112.4 万亿元，同比为可比口径（0.4%）。即 2025-01 起 M1 改了口径（据人民银行 2024-12 公告纳入个人活期存款等，原文本次未核对）。主判定窗口（至 2023-10）不受影响，前推记录受影响 |
| M2 发布日（金十，2010-11 至 2025-08，177 次） | 发布日为次月第 **8–18** 日：中位数 12 日、90% 分位 15 日、最晚 18 日（2016-10-18 发布 2016-09 数据、2018-10-17、2020-02-17）。2010-11 以前金十只有占位日期。2016-03 缺一条 |
| M2 首发值与现值 | 177 个月里 12 个月差 ≥ 0.1 个百分点、10 个月 ≥ 0.3：2017-01/02/04 首发比现值高 0.6–0.7（事后修订），2019-03 低 0.6；2020-01 金十记为 0.0（1、2 月合并发布的录入问题），不是真实修订 |
| 社融存量增速 | 人民银行官网「社会融资规模」栏目 2012 年才有；2012–2014 年只有增量表；2015 年存量表**按季**；**2016 年起存量表按月**（含增速）。商务部增量序列 2015-01 起。即：**2016 年以前没有按月、点时可得的社融存量增速**。另外人民银行在 2018–2019 年至少三次扩大社融口径并回溯调整（具体月份本次未逐条核实） |

## 补充取数（2026-11-28，REVIEW-1 冻结前诊断）

人民银行调查统计司「货币统计概览 → 货币供应量」表，串行、间隔 3 秒：

| 文件 | URL | 内容 | SHA-256 |
|---|---|---|---|
| `raw/pbc/mso_116357.html` | `https://www.pbc.gov.cn/diaochatongjisi/116219/116319/116357/116511/index.html` | 2011 年货币统计概览目录 | `7a432613861d3dac0cbb04aae924d6a34b6e972e78668c6ed22ccc7200534044` |
| `raw/pbc/mso_3471721.html` | `…/116319/3471721/3471760/index.html` | 2018 年目录 | `6e029741e7362f4671fc9fe1931b0e0ec1da742380ce152ad4fad160cf62be5b` |
| `raw/pbc/mso_3750274.html` | `…/116319/3750274/3750284/index.html` | 2019 年目录 | `444dbb47081167f4c378e571c7b11bb0162806fd3ad2c1021c00a13c8ff52cc8` |
| `raw/pbc/mso_4458449.html` | `…/116319/4458449/4458451/index.html` | 2022 年目录 | `b9841827639410128f798ee2cfe21ce3be571368997d26c03d1dd7da63378da9` |
| `raw/pbc/ms_2011s07.htm` | `http://www.pbc.gov.cn/eportal/fileDir/defaultCurSite/resource/cms/2015/07/2011s07.htm` | 2011 年货币供应量表（含 2011-10 口径注释） | `c08919dc08a06f6aeedfb51d5f2565190b6250ac7ae2462ed73f1d74bd9f03af` |
| `raw/pbc/ms_2019020115394298232.xls` | `https://www.pbc.gov.cn/diaochatongjisi/fileDir/resource/cms/2019/02/2019020115394298232.xls` | 2018 年货币供应量表（含 2018-01 货币市场基金口径注释与 2017 年修订后 M2 增速） | `0209e3c0e937eef37e21936690e4507ecb737065912a17dc39e50f4a104a9fd2` |
| `raw/pbc/ms_2020011915353816215.xls` | `https://www.pbc.gov.cn/diaochatongjisi/fileDir/resource/cms/2020/01/2020011915353816215.xls` | 2019 年货币供应量表 | `ae1733b3bc790380806bbc3d376851ffb8b1ca89e27a92de6a209592e6fa650f` |
| `raw/pbc/ms_2025110417122028124.xls` | `https://www.pbc.gov.cn/diaochatongjisi/attachDir/2025/11/2025110417122028124.xls` | 2022 年货币供应量表（2025-11 重新上传；含 2022-12 起 M0 纳入数字人民币、M1/M2 增速无明显变化的注释） | `debab55e6e18cff6570c7dcb8e5aa29342b993a22ecd66925da38c9567974192` |

诊断结果见 `docs/research/erp-timing-cn-2026-11-28/DATA.md` 与 `diag-results.json`。
