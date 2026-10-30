# ADR 估值初稿与评级分档（2026-10-20）

估值初稿（未认证），仅为研究假设，不构成买卖建议。生成：`python3 scripts/review-adr-valuation-2026-10-20.py`（无联网、无时间戳，重跑输出不变）。

## 方法

- 覆盖 2026-10-07 ADR 事实复核的 66 家（public/research/adr-2026-10-07/previous.json）；SOFI 保留 src/data/details/sofi.ts 完整研究，不覆盖。
- 价格：src/data/companyMarketSnapshot.json `adr:<代码>` 的 price/date（本次 2026-10-30）；盈利输入冻结于 2026-10-20。
- 盈利基数：research/data-refresh-2026-10-20/yahoo-quote-batch.json（snapshot 的 valuationSource）中的 epsTrailingTwelveMonths / epsForward，即供应商 PE 反推的每 ADS 美元 EPS，非公司指引、非一手财报。2026-10-07 input.json 的 quotes 没有 forwardEps 字段，也没有 filings 字段（经 coordinator 确认改用此源）。
- PE 法：与 cn-itucd 相同，EPS = TTM × [max(0.15, 1+(g−off)), 1+g, 1+g+20%]，g 为供应商前瞻相对 TTM 的增速（基准 EPS = epsForward）；价格 = EPS × 类别 PE。
- 银行 / 券商：股息率法，DPS = 供应商 dividendRate × [0.8, 1, 1.05]，目标股息率 7.0/5.0/4.0%；股息率 <3%（不适用）或 >8%（可能含特别股息）记 [MISSING]。PB–ROE 未用：供应商每 ADS 账面价值口径错乱。
- 赔率 = (Base − P) ÷ (P − Bear)，仅在 Bear < P < Base 时计算；评级阶梯逐条照搬 scripts/review-cn-itucd-2026-10-07.py 214–236 行；TTM 亏损统一「回避」。
- 数据不稳定标记：前瞻 / TTM EPS 比值超出 [0.5, 3]、供应商 PE 与 EPS 不自洽、冻结批次腾讯与 Yahoo 价差 >3%、悲观价 ≥ 现价。

## 评级分布

| 评级 | 本轮 | 2026-10-07 |
| --- | --- | --- |
| 回避 | 5 | 0 |
| 条件关注 | 7 | 0 |
| 等待证据 | 0 | 5 |
| 观察 | 54 | 61 |

## 封顶 / 降级原因

| 原因 | 家数 |
| --- | --- |
| bear>=price | 10 |
| cyclical(no-effect) | 10 |
| data-flag | 2 |
| loss | 5 |
| loss-vendor-conflict | 2 |
| missing-value | 8 |
| ratio>8 | 3 |
| single-method | 5 |

逐家明细见 summary.csv 与 valuation.json。
