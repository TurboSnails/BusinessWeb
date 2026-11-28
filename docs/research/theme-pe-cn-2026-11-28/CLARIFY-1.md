# L-052 口径澄清（manager 裁定，2026-11-28，冻结后、计算前；两实现一致执行）

1. **数据快照基线**：以本机当前三份文件为冻结基线——prices（与 MANIFEST / L-051 一致，dd61e308…）、fin_pit（da32cbce…，与 L-051 相同）、industry_pit（a75ebc7e…）。完整 SHA-256 写入 `results.json` 的 inputs；notes 注明本机 fin_pit 与 L-038 冻结版 MISMATCH（本研究不依赖 L-038 的冻结，锁箱确认须在同一快照上运行）。
2. **无风险利率**：沿用 `docs/research/factorlab/inputs/CH_4_fac_update_20211231.csv` 的 `rf_mon`（%，至 2021-12）；2022-01 至 2023-10 按人民银行一年期存款基准利率 1.50% / 年（2015-10-24 起未调整）补齐：月度 = (1 + 1.50%)^(1/12) − 1。日频 = (1 + 月度)^(1/当月交易日数) − 1。在 results.inputs 记录拼接点与补齐值。
3. **B4 的 PE 顺延范围**：与 C1b 一致，在当月综合排名前 2K（= 4）内顺延，不足的槽位归 B0；与冻结的 `count_theme_pe.py` 实现一致。PREREG「同 C1a PE 过滤」指同样的分位与跳过规则；B4 无持续状态，顺延上限取 C1b 的 2K。
4. **成本与滑点**：直接用 `factorlab.backtest` 的 `DEFAULT_COSTS` 与 `DEFAULT_SLIPPAGE['cn']`（按成交额分档），本金 1,000,000 元，计最低佣金与 100 股整手；基准同样计成本。
