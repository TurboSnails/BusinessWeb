# 范围：A 股「主线题材 + PE 高度」（L-052）

来源：`.dev-team/runs/theme-pe/scope.md`。日期：2026-11-28。登记号：**L-052**（LEDGER 已预留）。

## 用户原话

「还有一段时间，市场总有一个主要题材，跟主要矛盾，结合 PE 高度来制定一个策略，看是否有效。」总目标：只做多、同等暴露下降低波动、可靠优先；结论放「研究中」，不直接改仓位。

## 本阶段做什么 / 不做什么

| 做 | 不做 |
|---|---|
| 文献核实（DOI/SSRN） | 任何持仓收益、夏普、回撤、胜率 |
| 数据核查（cn_pit / fin_pit / 概念成分） | `unseal` / `evaluate_factor` |
| 数事件（主线、切换、PE 超阈、C2 触发） | 改 LEDGER.md、src、public、scripts、factorlab 源码 |
| 预注册草案 `PREREG.md` | git checkout / stash / 推送 |

## 产出清单

- `SCOPE.md`（本文件）
- `LITERATURE.md`
- `ASSESS.md` + `count_theme_pe.py` → `counts_theme_pe.json`
- `PREREG.md`（含 LEDGER 草稿行，不改 LEDGER.md）
- `.dev-team/runs/theme-pe/scope-REPORT.md`

## 与已有研究的关系（摘要）

- **factorlab R11 `cn_ind_mom`**：A 股行业动量未过第 1 关（RankIC≈0）。纯行业动量先验弱。
- **L-037**：美股板块轮动通过——不同市场，不能外推。
- **L-032 / L-035**：过热读数无预测力——「高估就差」不能想当然。
- **L-012**：美股行业动量卫星，统计通过但不可直接执行。
- 本研究增量：**资金集中（成交额占比）+ 行业 PE 历史分位过滤**，不是再测一遍裸行业动量。

## Manager 拍板（2026-11-28，未算收益前，依据事件计数）

- C2 → **报告项**；确认候选 = **C1a（持续主线）** + **C1b（每月主线）**，Holm 族大小 2。
- C1a：6 月相对强度、60/250 成交额、连续 2 月进前 K=2、跌出前 4 退出、空缺持全市场、PE>90% 跳过。
- 详见 `PREREG.md` v2、`ASSESS.md`。
