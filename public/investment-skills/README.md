# 投资分析 Skill · 使用说明

「AI 工具」第一项为统一的 **股票分析（stock-analysis）**：合并项目「研究方法 · 适用于所有公司」、股票研究专家（严估深 / 研股股）与腾讯自选股投研专家团（圆汇众 + 六位专家）。

| Skill 文件夹 | 适合的问题 | 交付 |
| --- | --- | --- |
| stock-analysis | 美股、港股、A 股公司研究、财报解读、深度估值、多股对比、持仓诊断、专家圆桌 | 综合结论卡、指标与来源、三情景估值、盈亏比、专家共识与分歧、条件化研究区间、风险证伪与验证日历 |
| trading-analysis-team | 多空辩论、交易情景、风险提案与裁决 | 多空交锋、交易情景、风险评估、Markdown 与 HTML 报告 |

## 安装

1. 解压 ZIP。单套包有一个 Skill 文件夹；投资分析合集有上表两套。
2. 保留整个文件夹，包括 `SKILL.md` 和全部 `references/`，不要只复制入口。
3. 放到项目的 `.agents/skills/`（Codex / Antigravity CLI）、`.claude/skills/`（Claude Code）、`.opencode/skills/`（OpenCode）或 `.codebuddy/skills/`（CodeBuddy Code）。统一入口示例：`.agents/skills/stock-analysis/SKILL.md`。
4. 重新打开会话，说明 Skill 名称、公司代码、市场、研究问题与期限。

## 示例

- 用股票分析研究腾讯（0700.HK），核实最新行情与财报，给三情景估值、盈亏比、专家共识与分歧、需要等待的证据。
- 用股票分析对比 AAPL 与 MSFT，统一估值与财年口径，列出各自最大反证与下一次验证条件。
- 用股票分析更新已有研究，说明哪些旧结论保留、调整或撤回，以及原因。
- 用交易分析团队对 NVDA 做风险诊断，说明主要风险和失效条件。

## 内容与使用条件

统一 Skill 使用「立论 → 取数 → 估值 → 专家视角与对抗 → 收口」五步流程。`references/research-method.md` 收录完整项目研究方法；`equity/` 保留深度研究与模型资料；`roundtable/` 保留六位专家、圆桌及数据字段资料；`screening-rules.md` 记录程序化初筛规则与限制。

综合评级与专家立场分别呈现。证据不足写「等待证据」；区间与加减仓条件是研究假设。初筛赔率未经公司级核实不能作为深度认证结论。

这些文件供支持 Skill 的 AI 助手读取，数据工具不会随包安装。使用时查看可用工具，可通过 yfinance / akshare 或公开网页取数，财报以公司一手公告为准。缺失写 `[MISSING]`，保留日期和口径。原平台 WorkBuddy / westock 的工具名只作历史资料，不代表当前环境已有连接器。

统一股票分析不要求子代理：支持且获得授权时可并行；否则标明「单模型多视角复核」。交易分析团队按其入口要求编排。

原两套 ZIP 下载地址保留，供历史链接使用；新安装优先使用 stock-analysis。统一包已完整包含两套参考资料，无需另装旧包。

来源沿用项目已有导出，角色为研究方法模拟，不代表腾讯官方报告。AI 输出需核对数据来源与日期，不构成个人投资建议。

## 项目内更新下载包

在 BusinessWeb 目录执行 `npm run skills:package`，先将网站研究方法同步到统一 Skill，再生成单套与合集 ZIP。正式合集包含股票分析和交易分析团队两套；兼容旧下载地址的两套 ZIP 也会更新。

`.agents/skills/stock-analysis/` 为统一来源，供 Codex 与 Antigravity CLI 共用。打包时会同步股票分析到 `.claude/skills/`、`.opencode/skills/` 与 `.codebuddy/skills/`，保持五种工具的项目版本一致。从 BusinessWeb 目录启动对应工具；重新打开会话后使用 `/skills`（Antigravity CLI / CodeBuddy Code）确认列表出现 `stock-analysis`，再提出研究任务。
