# 增持 / 回购 / 减持 / 解禁原始数据来源（立项调研 2026-11-28）

用途：`docs/research/insider-buyback-cn-2026-11-28/SCOPE.md` 的可得性调研与事件计数。`raw/` 下的文件只留在本机，不入库（**注意：仓库 `.gitignore` 目前没有忽略 `data-raw/insider-buyback-cn/raw/`，提交时只暂存本文件、`fetch/` 与研究目录，或由 manager 补一行忽略规则**）。下载脚本在 `fetch/`（用 `research-py/.venv` 的 Python 运行，依赖只有仓库已装的 akshare 自带 `cninfo.js` 与 `py_mini_racer`，没有新装包）。

请求约定：UA 只发 `Mozilla/5.0`，不带 cookie，也不带任何个人信息；巨潮数据中心要求的 `Accept-EncKey` 请求头用 akshare 自带的 `cninfo.js` 生成（与 `research-py/factorlab/sources/cn_pit.py` 相同）。限速：东方财富 ≥ 1.2 秒 / 次，巨潮数据中心 ≥ 1.2 秒 / 次，巨潮公告检索 1.5 秒 / 次（约 55 次后开始返回空响应，暂停 5 分钟后改为 5 秒 / 次补齐），交易所 ≥ 2 秒 / 次。

**截止日**：所有表都按 2023-10-31 截断（factorlab cn 锁箱从 2023-11-01 开始）。唯一的例外是 `em_repurchase_all.json`，它是回购表的全量**元数据**（代码、方案编号、日期、进度、备注），只用来核对日期字段的含义，不含任何价格或收益字段。

**事后收益字段已剔除**：东方财富回购表自带 `RCHANGE1DCP`、`RCHANGE20DCP` 等公告后涨跌幅，解禁表自带 `A20_ADJCHRATE`（解禁后 20 日涨跌幅）和 `B20_ADJCHRATE`，股东增减持表自带 `NEWEST_PRICE`、`CHANGE_RATE_QUOTES`（最新行情）。下载时用 `columns=` 显式列出字段，这些列都没有下载。（例外：最初的 3 次探测请求用了 `columns=ALL`，控制台显示过 6 条回购记录和 3 条解禁记录的这些字段，见 SCOPE.md 第八节。）

时间均为 UTC。

## 1. 董监高持股变动（巨潮数据中心「高管持股变动明细」）

| 项 | 内容 |
|---|---|
| URL | `POST https://webapi.cninfo.com.cn/api/sysapi/p_sysapi1030?sdate=YYYY-MM-DD&edate=YYYY-MM-DD&varytype=B\|S`（akshare `stock_hold_management_detail_cninfo` 用的接口，akshare 写死为最近一年；这里按季度分段） |
| 分段 | 2005Q1 至 2023-10-31，按季度，买（B）、卖（S）各 76 段，共 152 个文件；按**变动截止日（ENDDATE）**过滤 |
| 下载时间 | 2026-11-28 07:59 – 09:02（中间被 30 分钟后台时限中断一次，脚本跳过已有文件续传） |
| 行数 | 147,075 行；ENDDATE 2005-03-03 至 2023-10-30 |
| 文件 | `raw/cninfo_p_sysapi1030/{B,S}_起_止.json`；逐文件 SHA-256 见同目录 `SHA256SUMS`（这份清单本身的 SHA-256 是 `fb3087916bbb1887d497dea501180ab1f944cad830a0a8b7ac99a1a813c28b72`），合计 45.3 MB |
| 字段 | SECCODE、SECNAME、DECLAREDATE（公告日期）、ENDDATE（变动截止日）、HUMANNAME（变动人）、F001V（董监高姓名）、F002V（职务）、F003V（与董监高关系）、F004N / F005N（期初 / 期末持股）、F006N（变动股数，卖出为负）、F007N（变动比例 %）、F008N（成交均价）、F009N（期末市值）、F010V（变动原因：竞价交易 / 二级市场买卖 / 大宗交易 / 股权激励 / 分红送转 / 股改对价……）、F011V（数据来源：临时公告 / 定期报告） |
| 已知问题 | **不含退市股**：3,964 个代码里退市股为 0（证券表里 2008 年后退市的有 281 只）。2006 年的记录大多是股改对价、来自定期报告，公告日比变动日晚约半年；2007 年起 86%–94% 的记录在变动后 5 天内公告。 |

## 2. 董监高持股变动（东方财富数据中心，只作核对）

| 项 | 内容 |
|---|---|
| URL | `GET https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_EXECUTIVE_HOLD_DETAILS&columns=…&filter=(CHANGE_DATE>='2019-01-01')(CHANGE_DATE<='2019-12-31')&pageSize=500&sortColumns=CHANGE_DATE,GGEID&sortTypes=1,1&source=WEB&client=WEB`（akshare `stock_hold_management_detail_em`） |
| 范围 | 只下了 2019 年一年（全表 173,596 行，深分页每页约 20 秒，全量没有必要） |
| 下载时间 | 2026-11-28 09:00 |
| 行数 | 13,953 |
| 文件 | `raw/em_exec_hold_details.json`，SHA-256 `c1a30c021d19eab49005b4fa9e09899016538c667cb7e506fefe1b3a5bb0b65e` |
| 已知问题 | **没有公告日**，只有变动日（CHANGE_DATE）；同样**不含退市股**（2019 年 1,557 个代码，退市股 0）。2019 年公开市场买入与巨潮逐条匹配：巨潮 2,469 条、东方财富 2,454 条，两边都有的 2,326 条（94%）。 |

## 3. 董监高持股变动（沪深交易所，含退市股；只下了样本）

| 来源 | URL / 参数 | 规模 | 样本文件 | 说明 |
|---|---|---|---|---|
| 上交所 | `https://query.sse.com.cn/commonQuery.do?isPagination=true&pageHelp.pageSize=100&sqlId=COMMON_SSE_XXPL_CXJL_SSGSGFBDQK_S&COMPANY_CODE=&BEGIN_DATE=…&END_DATE=…`（需 `Referer: https://www.sse.com.cn/`；akshare `stock_share_hold_change_sse`） | 变动日 ≤ 2023-10-31 共 48,688 行（487 页） | `raw/samples/sse_ssgsgfbdqk_*.json`（2007 年以前首页、2019-03 首页、2023-10 首页、全期首页，退市股 600432 吉恩镍业 25 行、600074 保千里 9 行；601558 返回 0 行） | 有填报日期 FORM_DATE：2019-03、2023-10 中位数比变动日晚 2 天；但早年记录是补录的（全期首页 100 行里填报日比变动日晚 162–2,655 天，例如 2007 年的变动填报日是 2018-03-30），**早年 FORM_DATE 不能当公告日用** |
| 深交所 | `https://www.szse.cn/api/report/ShowReport/data?SHOWTYPE=JSON&CATALOGID=1801_cxda&TABKEY=tab1&PAGENO=n[&txtDMorJC=代码]`（akshare `stock_share_hold_change_szse`） | 全期 124,453 行，每页固定 20 行（6,223 页） | `raw/samples/szse_1801_cxda_p1.json`（最新）、`…_p6223.json`（最早：2004-11-29）、退市股 002450 康得退 8 行、000939 凯迪退 38 行 | 没有公告日；股数单位是万股。300104（乐视网）的请求超时、只收到半个响应，已删除 |

样本 SHA-256：

```
52bb9c9148e05616258f5abc6da89815c35e02fcaacc98156757cf1b024c37e0  sse_ssgsgfbdqk_1990-01-01_2023-10-31_p1.json
d7787a7f1a1f535a3c403e430da706a350bbd5e61f4c4dd26fb70b745efdc604  sse_ssgsgfbdqk_2019-03-01_2019-03-31_p1.json
54f1bef7a4d3cfc65c3884bab39338bfb63b2ec718352a656090782beb1ec2b7  sse_ssgsgfbdqk_2023-10-01_2023-10-31_p1.json
bd8922ad97a156a2a1e92cda753959cd86daa09ba9bb6efe8902f90486add7d2  sse_ssgsgfbdqk_to2007_p1.json
9acc1b56d38fb1152bacb4724645b243e411968a26bf5dc38d3ae87084d1650e  sse_ssgsgfbdqk_600074.json
fd2fb76f4c404e01fa07ac9cff862ca13221a89f268b02a128d01ef866e33323  sse_ssgsgfbdqk_600432.json
a36f30a187a30cf358bf8fc4ce27c022475e2f5303672570f0f11707266fa257  sse_ssgsgfbdqk_601558.json
18d4ec977d7882d643438f6bac889f8ad7fa17f5d52c2bcfefd13e105e4041fc  szse_1801_cxda_p1.json
1f47b6b9c148f21ecd048f21cb0a9663917c6c9e9fb1c2142da6f0726ffa3a34  szse_1801_cxda_p6223.json
311d5781c92bacba112e4b02010c05b4646cc29120dcc803dac16ba2cfcab3bf  szse_1801_cxda_000939.json
27fbdab91ece78cd4cc198f3f03018cd393a651b607c711229d9904aa8a6f169  szse_1801_cxda_002450.json
034c052b713f57245ba95f71e285c4c8af75d4f87ebc44d06399b78935042d68  cninfo_p_sysapi1030_B_2006-01-01_2006-12-31.json
902c8a17c8e72fb0f8ef65d1e3e4abb44d3995b877f259d74ef153b39be1eb30  cninfo_p_sysapi1030_B_2007-01-01_2007-12-31.json
ae12e6683ce1452a4df7325d9a93e0fa4de35df909e2863229eee82ead6f7458  cninfo_p_sysapi1030_B_2015-07-01_2015-07-31.json
0bc20d041c1c64add3f70831d89420338c1591332ef832e965738cf13ae9f813  cninfo_p_sysapi1030_B_2023-10-01_2023-10-31.json
b4d3dad137b471595ae3a1d5a07843885e31a5b0493837677d3ff00feb953dff  cninfo_p_sysapi1030_S_2015-07-01_2015-07-31.json
fc863aea3ac772a3c188dd20d8c4ee860f7cd02f086b36228b1be3248fe340a7  cninfo_p_sysapi1030_S_2023-10-01_2023-10-31.json
```

北交所（`stock_share_hold_change_bse`）没有试。北交所 2021 年才开市，且 factorlab 主口径剔除微盘，影响很小。

## 4. 股东增减持（东方财富数据中心）

| 项 | 内容 |
|---|---|
| URL | `GET https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_SHARE_HOLDER_INCREASE&columns=SECURITY_CODE,SECURITY_NAME_ABBR,HOLDER_NAME,DIRECTION,CHANGE_NUM,CHANGE_NUM_SYMBOL,CHANGE_RATE,CHANGE_FREE_RATIO,AFTER_HOLDER_NUM,AFTER_CHANGE_RATE,HOLD_RATIO,FREE_SHARES,FREE_SHARES_RATIO,TRADE_AVERAGE_PRICE,START_DATE,END_DATE,TRADE_DATE,NOTICE_DATE,MARKET,EITIME&filter=(NOTICE_DATE<='2023-10-31')(NOTICE_DATE>='Y-01-01')(NOTICE_DATE<'Y+1-01-01')&pageSize=500&sortColumns=NOTICE_DATE,SECURITY_CODE,HOLDER_NAME&sortTypes=1,1,1&source=WEB&client=WEB`（akshare `stock_ggcg_em`） |
| 分段 | 按公告年份分 20 段（2005 年以前一段、2005–2023 每年一段），避免深分页（深分页每页约 20 秒） |
| 下载时间 | 2026-11-28 08:57（第一次不分段的下载太慢，已中止） |
| 行数 | 124,515；NOTICE_DATE 1994-08-10 至 2023-10-31 |
| 文件 | `raw/em_holder_increase.json`，SHA-256 `97afee5504ac441c4cf095d7a7fecd1028c0b128de96e989614e5ed528ba14dc`（76 MB） |
| 字段含义（对照样本核实） | `HOLD_RATIO` = 变动后持股占总股本 %；**`AFTER_CHANGE_RATE` = 本次变动占总股本 %**（字段名有误导）；`CHANGE_NUM` 单位为万股；`START_DATE` / `END_DATE` = 本次变动区间；`TRADE_AVERAGE_PRICE` 缺 31%；`HOLD_RATIO` 缺 14% |
| 已知问题 | 没有股东类型（控股股东 / 5% 股东 / 董监高 / 国家队要靠名称和持股比例推断）；同一公告可拆成多行（多个区间）；2007–2012 年含大量董监高个人变动（每年约 400 条），2013 年起几乎只剩股东公告（每年约 40 条），**口径中途变了**；含退市股（4,280 个代码中 255 个）。公告日比区间截止日中位数晚 7 天。 |

## 5. 股票回购（东方财富数据中心）

| 项 | 内容 |
|---|---|
| URL | `GET https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPTA_WEB_GETHGLIST_NEW&columns=…&filter=(DIM_DATE<='2023-10-31')&pageSize=500&sortColumns=DIM_DATE,DIM_SCODE,REPURCODE&sortTypes=1,1,1&source=WEB`（akshare `stock_repurchase_em`；columns 显式列出 39 个字段，不含 `RCHANGE*`、`NEWPRICE`） |
| 下载时间 | 2026-11-28 07:51（`em_repurchase.json`）；全量元数据 `em_repurchase_all.json` 07:53 |
| 行数 | 2,642（DIM_DATE ≤ 2023-10-31）；全量元数据 5,962 行（只有代码、方案编号、日期、进度、备注 8 个字段） |
| 文件 | `raw/em_repurchase.json` SHA-256 `3ab1f242e758fdb59e0d9d425584fe141f47af38471adaccc08eddac1ba4efe6`；`raw/em_repurchase_all.json` SHA-256 `619df755775924f9c8ee7b73fd1c5921786a5567eb556012cfb3f50011f665c9` |
| 字段 | 每行一个回购方案，存的是**最新状态**：DIM_DATE（方案公告日，见下）、DIM_TRADEDATE（公告前一交易日）、REPURPROGRESS（001 董事会预案、002 股东大会通过、003 股东大会否决、004 实施中、005 停止实施、006 完成实施，另有少量 007 / 008 未见说明）、REPUROBJECTIVE（回购目的全文）、计划价格 / 数量 / 金额上下限、ZSZXX / ZSZSX（计划占总股本 % 下限 / 上限）、REPURSTARTDATE / REPURENDDATE、FINISHDATE（完成日）、NOTICEDATE（最新进展公告日）、REPURNUM / REPURAMOUNT（已回购股数 / 金额）、ZSZ（公告时总市值）、CPRICE（公告前收盘）、REMARK（历次公告摘要，以「YYYY.MM.DD公告」开头） |
| 已知问题 | ① 2006–2010 年一条都没有（2005 年 1 条，2011 年起才有），而巨潮标题检索 2005–2010 年每年都有几十到近三百条含「回购」的公告（含债券质押式回购、股权激励回购注销等噪声），**早年回购有缺口**；② DIM_DATE 与备注里第一次「公告」日期不一致的约 21%（全量 5,962 行中晚于备注 618 行、早于备注 647 行），进行中的方案 DIM_DATE 会随最新公告变化——方案首次公告日要用 min(DIM_DATE, 备注首日) 并对巨潮公告核对；③ 只有方案级数据，没有逐次回购进展；④ ZJSZBL 是按计划算的「预计占比」，不是实际完成占比，实际占比要用 REPURNUM ÷（ZSZ ÷ CPRICE）；⑤ 含退市股（1,731 个代码中 57 个）；⑥ 只覆盖二级市场集中竞价回购，不含股权激励限制性股票的定向回购注销。 |

## 6. 限售股解禁（东方财富数据中心）

| 项 | 内容 |
|---|---|
| URL | `GET https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_LIFT_STAGE&columns=SECURITY_CODE,SECURITY_NAME_ABBR,FREE_DATE,BATCH_HOLDER_NUM,CURRENT_FREE_SHARES,ABLE_FREE_SHARES,LIFT_MARKET_CAP,FREE_SHARES_TYPE,FREE_RATIO,TOTAL_RATIO,FREE_SHARES,NON_FREE_SHARES,MARKET_TYPE,LISTING_STATE&filter=(FREE_DATE<='2023-10-31')&pageSize=500&sortColumns=FREE_DATE,SECURITY_CODE&sortTypes=1,1&source=WEB&client=WEB`（akshare `stock_restricted_release_detail_em`） |
| 下载时间 | 2026-11-28 07:59 |
| 行数 | 22,661；FREE_DATE 2010-01-04 至 2023-10-31 |
| 文件 | `raw/em_lift_stage.json`，SHA-256 `cadb18b111d6342d7ee9a317b777adc0117ca1fa45a67f5ccae97bc29a551cf8` |
| 已知问题 | **2010 年以前没有**（2006–2009 年股权分置限售股解禁高峰缺失）；`TOTAL_RATIO` 是小数（0.03 = 3%）；`LISTING_STATE = 2` 的 330 行为退市股（含退市股）；解禁日是事先知道的日子，不是「公告」事件 |

## 7. 巨潮公告标题检索计数（只作量级参考）

| 项 | 内容 |
|---|---|
| URL | `POST http://www.cninfo.com.cn/new/hisAnnouncement/query`，表单 `column=szse&tabName=fulltext&searchkey=增持\|回购\|减持\|解除限售&seDate=Y-01-01~Y-12-31&pageNum=1&pageSize=30`（akshare `stock_zh_a_disclosure_report_cninfo` 的接口），只取返回的 `totalAnnouncement` |
| 下载时间 | 2026-11-28 07:59–08:03（55 次），08:08–08:11 补齐其余 21 次 |
| 文件 | `raw/cninfo_announcements/ann_关键词_年.json`（76 个，每个只有第 1 页 30 条）、`_counts.json`；逐文件 SHA-256 见 `SHA256SUMS`（清单 SHA-256 `3fef5104584b894aed8421e2e263681841e807bf77f306dcf171113be90b760d`） |
| 已知问题 | 关键词匹配标题，噪声大（「回购」含债券回购、股权激励回购注销；「解除限售」漏掉「限售股份上市流通」这类标题），**只能看量级**；约 55 次请求后返回空响应 |

## 未下载、只看了源码的接口

- akshare `stock_inner_trade_xq`（雪球内部交易）：只给最近一段，不是历史库，没试。
- akshare `stock_hold_control_cninfo`（巨潮实际控制人持股变动，2010 年起）、`stock_restricted_release_queue_sina`（新浪逐只解禁表，可能有 2010 年以前的记录）：可作补缺，本次没试。
- 增减持**计划 / 预披露**公告（2017-05 起减持须提前 15 个交易日预披露）：上述表里都没有「计划」与「实施」的区分，要从巨潮公告标题里抽，见 SCOPE.md 第三节。
