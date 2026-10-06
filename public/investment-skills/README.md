# 投资分析 Skill 专家 · 使用说明

本项目整理了三套已有专家流程：

| Skill 文件夹 | 专家 | 适合的问题 |
| --- | --- | --- |
| stock-research-expert | 股票研究专家（严估深 / 研股股） | 公司研究、财报解读、DCF 与可比估值、三情景盈亏比 |
| tencent-stock-research-team | 腾讯自选股投研专家团（圆汇众） | 多视角圆桌、单股讨论、多股对比、持仓诊断 |
| trading-analysis-team | 交易分析团队（何执舟） | 多空辩论、交易情景、风险评估 |

## 安装

1. 解压 ZIP。单套包内有一个 Skill 文件夹，合集内有三个。
2. 保留整个文件夹与其中的 `SKILL.md`、`references/`，不要只复制入口文件。
3. 按所用助手，把 Skill 文件夹放进项目下的 `.agents/skills/`（Codex）、`.claude/skills/`（Claude Code）或 `.opencode/skills/`（OpenCode）。例如：`.agents/skills/stock-research-expert/SKILL.md`。
4. 重新打开会话，让助手发现新 Skill；提问时明确专家名称、股票代码、市场和研究问题。

## 示例

- 用股票研究专家分析 AAPL，给出三情景估值、关键假设与风险。
- 用腾讯自选股投研专家团讨论腾讯，看看不同专家的共识与分歧。
- 用交易分析团队对 NVDA 做风险诊断，说明主要风险和失效条件。

## 使用条件

这些文件是研究流程和角色提示词，需要支持 Skill 的 AI 编程助手读取后使用。
数据工具不会随 ZIP 自动安装。研究需要公开数据查询能力：股票研究专家可查询公司公告、交易所与监管机构材料；本项目的 Codex 版本优先用 yfinance / akshare MCP，需在使用环境中单独配置。遇到缺失数据按 Skill 要求标注，不能编造。

团队类 Skill 需要助手支持子代理编排。若环境不支持，请检查各套 SKILL.md 的降级说明；并非每套都提供单模型降级方式。

部分参考资料保留原 WorkBuddy 平台的工具名称，实际使用时以 SKILL.md 的当前环境说明和可用工具为准。来源信息保留在每套 SKILL.md 中。

AI 输出需核对数据来源与日期，仅供研究参考，不构成投资建议。

## 项目内更新下载包

下载包来源是项目 `.agents/skills/` 内的三套 Skill。修改源文件后，在 BusinessWeb 目录执行 `npm run skills:package`，重新生成单套与合集 ZIP。
