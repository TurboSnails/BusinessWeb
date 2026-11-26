# 引擎校验记录

## 2026-11-26 美股动量 vs Ken French UMD

- 数据：美股个股全量（Yahoo，5,262 只，1995-01 至 2026-11，幸存者偏差等级 B），探索区（70% 证券、2023-10 以前）。
- 命令：`uv run python -m factorlab.cli eval --market us --factor mom_12_1 --motivation "literature: engine validation vs KF UMD"`（登记簿 `factor-ledger/us.jsonl` 第一条）。
- 校验：引擎的「前 20% − 后 20%」等权月收益与 Ken French 动量因子 UMD 同月相关 **0.91**（1996-02 至 2023-09，332 个月）；错开 ±1 个月相关 −0.01、+0.02。说明收益期对齐正确、没有错月或前视。只做多口径（前 20% 对股票池，市值 / 成交额加权）与 UMD 相关 0.71–0.75。
- 用途只是验证引擎；这里的收益数字是幸存者偏差数据上的探索结果，不据此做任何判断。
- 顺带修复：容量比例在成交额为 0 时除以零。
