# 恒指自身成交额的官方日报归档

2026-10-19，实际从恒生指数公司公开目录下载并解析 33 份 Index Performance Summary CSV，日期覆盖 2026-09-01 至 2026-10-16。原始文件持久保存在忽略提交的 `.cache/market-cycle-hsi-turnover/YYYY-MM-DD.csv`，后续只采新增或无效缓存，不重复请求全部历史文件。

公开[日报目录接口](https://www.hsi.com.hk/api/wsit-hsi-ddoc-ea-public-website-proxy/v1/product-data/pub/series/metadata/v2?data=dailyReport&seriesCode=hsi) 的 `hsi` 系列包含 `reportType=idx` 和逐日报告路径。与部分其他 metadata 接口不同，`dailyReport` 请求不能附加 `language` 参数：本次附加时真实返回 HTTP 400，去掉后返回 200，官方前端调用也只传 `data` 和 `seriesCode`。

报告下载使用同站 `content/gcs/download?resource=<编码后的报告路径>`，例如 [2026-10-16 官方 CSV](https://www.hsi.com.hk/api/wsit-hsi-ddoc-ea-public-website-proxy/v1/content/gcs/download?resource=%2Fpublic-website%2Fwebapp%2Fcontents%2Fen%2Findexes%2Freport%2Fhsi%2Fidx_16Oct26.csv)。原文件带 UTF16LE BOM，用制表符分列、双引号包裹字段，第二行是英文表头。只接受 `Index="Hang Seng Index 恒生指數"`、`Index Currency="HKD"`、报告日期与 URL 一致的唯一行。采集 `Index Turnover (Mn)`，乘一百万变成港元，明确不使用 `Market Turnover (Mn)`。

2026-10-16 同行官方恒指成交额是 **80,378 百万港元**，全港市场成交额是 **178,207 百万港元**。腾讯及东财 `HSI` 行情里的金额不能据名字直接作为恒指自身金额；本模块仅从腾讯 `hkHSI` 读取真实交易日期用于交叉校验，完全忽略其成交额字段。官方 [Index Operation Guide](https://www.hsi.com.hk/content/dam/wpb/hsil/index_operation/en_hk/index_operation_guide.pdf) 第 10.17 节定义指数成交额为组成证券实际成交额合计。

本次完整周（2026-10-12 至 2026-10-18）的真实恒指成交额：

| 日报日期 | Index Turnover（百万港元） | 亿元港币 |
| --- | ---: | ---: |
| 2026-10-12 | 66,209 | 662.09 |
| 2026-10-13 | 72,854 | 728.54 |
| 2026-10-14 | 87,228 | 872.28 |
| 2026-10-15 | 101,146 | 1,011.46 |
| 2026-10-16 | 80,378 | 803.78 |

完整五个真实交易日的日均为 **81,563 百万港元，即 815.63 亿港元**。事实 `index_week_daily_turnover_hkd/hsi` 的值为 `81563000000` 港元，频率 weekly，观测日 2026-10-16；描述保留完整窗口、实际交易日数、档案覆盖范围及五个逐日报告来源链接。只要参考日历有一天缺少对应日报，就不产生完整周金额。

目前公开目录 33 日不足此前完整 52 周基准，不能计算资金活跃比或据此计票。每轮最多下载 40 份日报，同时至多两份；归档未来积累到完整 53 周并逐日匹配参考日历后，复用既有 `computeWeeklyTurnoverRatio`，额外输出 `turnover_ratio_52w/hsi`，不使用合成零值或全市场成交额填缺。

验证：`node --test scripts/market-cycle-hsi-turnover.test.mjs` 8/8 通过。覆盖指数金额和全市场金额区分、错指数/币种/日期/空金额/重复拒绝、目录白名单、完整周缺日拒绝、原始缓存续采、40 份硬上限、并发上限，以及档案完整后输出真实 52 周比的路径。首次真实采集共 35 次 HTTP（目录、参考交易日历和 33 份 CSV）；数据没有写入公共快照，留给主采集器整合。
