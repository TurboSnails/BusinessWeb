# 预注册：港股组合因子 hk_vqs52 锁箱确认（L-045，港股 2026Q4 批次）

写于 2026-11-28，在港股锁箱（2023-11-01 至 2026-11-30）解封之前提交；写这份文件时港股锁箱从未打开过。来源：R10（`docs/research/factorlab/rounds/R10-2026-11-28.md`，计划提交 `ac98bc6c`），hk_vqs52 按等权口径五关全过。

## 候选（1 个，冻结写法）

| 候选 | 判定统计量 | 因子名 | 源码哈希 | 参数哈希 | 配置哈希 |
|---|---|---|---|---|---|
| H1 | 等权 `tmu_ew`：前 20% 等权减股票池等权 | **hk_vqs52** | 7663e476652b | 7a42a11f2fa5 | 14a984b84f02 |

hk_vqs52 = zscore(hk_ep_ttm) + zscore(hk_roe_ttm) + zscore(hk_sue_h) + zscore(high_52w) 等权，至少 2 个成分有值。港股默认口径：每期流通市值前 500、股价 ≥ 1 港元，缺市值时按成交额代理；次日开盘执行。**成分是看过前几轮结果后挑的**（动机 `post-hoc: R4/R7 components`），门槛不放宽。

另外冻结（确认时逐一核对 sha256，不一致就不确认）：

- `research-py/factorlab/factors/composite_r10.py` sha256 `35c89d8533a086e005c55260c6cee916d2cd340c5265a8bc3889bb4cf66a3b24`
- `research-py/factorlab/factors/composite.py` sha256 `7bbc7b72e3fdb5d2a60943e65a6cf4ba24c800d4f12ab49ea280c13351750ebc`
- `research-py/factorlab/factors/fundamental_hk.py` sha256 `1fd2d43a1c2a5f87d6e0c26444cbf23b39ce410ed5282077db3610d3540ce256`
- `research-py/factorlab/fundamentals_hk.py` sha256 `4e0e86584a62904bceb2a7299010b05c9eb6f345e23da7c24141a95896d3e9be`
- `research-py/factorlab/factors/price2.py` sha256 `ef75123a2e4cccdd6bb565d67decdef242b58a11174a2ca6fa26e9e7882ad184`
- `factor-data/hk/fin_pit.parquet` sha256 `06525297501c494d9a78c4f02096af6f11e7b8a200cb589484f5a445f03daa90`（港股点时财报快照，确认时不重建，只补日线价格）

## 样本内数字（用于门槛）

| | 探索区（70%） | 验证区（30%） |
|---|---|---|
| 等权月超额 | +0.529%，NW t 3.28 | +0.543%，NW t 2.90 |
| 主口径月超额（只报告） | +0.19%，t 0.92 | +0.10%，t 0.47 |
| RankIC | +0.054，t 6.7 | +0.066，t 6.9 |

收缩估计 m* = **+0.536%/月**，门槛 ½·m* = **+0.268%/月**。

## 判定

锁箱期调仓日约 36 期，以引擎 confirm 模式给出的为准。只确认一次。本批只有这 1 个候选，Holm 即原值。

| 结论 | 条件 |
|---|---|
| **通过** | 锁箱 `tmu_ew` 均值 ≥ ½·m*，**且**单边 p < 0.05（`tmu_ew` 的 NW t） |
| **方向一致、证据不足** | 均值 ≥ ½·m*，但不显著 |
| **不通过** | 均值 < ½·m* |

## 功效（σ = 探索区等权超额月序列标准差 2.21%，36 期，独立同分布近似）

| 真实效应 | 均值 ≥ ½·m* 的概率 | 单边 p < 0.05（t ≥ 1.645）的概率 |
|---|---|---|
| m*（+0.536%） | 77% | 42% |
| 0 | 23% | — |

## 去向（港股是等级 B）

港股数据只含当前上市股。锁箱三年里退市的股票缺失，幸存者偏差比早年小，但仍然存在。

- **通过**：放进「研究中」并标明等级 B。要进「通过检验」，还需要 A 股对照 cn_vqs52 用另行预注册的检验（A 股锁箱或前推）同时成立。
- **方向一致、证据不足**：放进「研究中」继续前推，2027-12 用锁箱加前推合计 48 期重判一次。
- **不通过**：撤下。

不论结论，都从 2026-12 起按月前推记账，连续 24 个月 t < −1 撤下。

## 与成分的关系（如实）

- 与 hk_roe_ttm、hk_sue_h 的截面秩相关为 0.72、0.78，超过 0.7；它的等权 t（3.28）高于这两个成分（1.57、2.24），按第 4 关保留。
- 对四个成分序列做 spanning，截距每月 +0.05%，t 0.51，不显著。也就是说，好处来自组合后噪声更小，不是新信息。
- 主口径（市值加权）两区都不显著，超额集中在中小盘。等权前 20% 约 100 只港股，成本和流动性要求高。

## 操作（12 月）

港股没有增量更新命令，要用 `uv run python -m factorlab.sources.hk fetch --refresh` 全量重下日线（约数小时），再 `build`。**不重建 fin_pit**。补到 2026-11-30 之后的第一个交易日后，核对上面所列文件的哈希，然后：

```bash
uv run python -m factorlab.cli unseal --market hk --batch 2026Q4-hk --prereg <本文件提交> --candidate hk_vqs52 --execution open
uv run python -m factorlab.cli eval --market hk --factor hk_vqs52 --mode confirm --batch 2026Q4-hk --json ../docs/research/factorlab-confirm-2026Q4/confirm-hk_vqs52.json
```
