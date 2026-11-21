# AI 技能与 AI 实验室说明

本文收录项目内置的 AI 技能（Skill）与命令行工具的使用、打包和分发方式，以及 AI 实验室里个别页面的维护说明。原先写在仓库 README 里，2026-11-21 移到这里。

网站入口：「AI 实验室 › AI 投研 Skills」（`/ai/ai-skills`）提供各技能的介绍、示例和下载包。

## AI 投研 skills

项目以 `stock-analysis` 融合研究方法、股票研究专家、腾讯自选股投研专家团与 Public Markets Investing，位于「AI 工具」第一项。包含商业模式驱动树、核心假设、预测归因、行业周期及证据追溯；回测与组合风险按需启用。交易分析团队保留独立入口；旧两套名称转入融合版。

从 BusinessWeb 目录启动工具。股票分析已安装到以下项目目录：

| 工具 | 股票分析入口 |
| --- | --- |
| Codex / Antigravity CLI | `.agents/skills/stock-analysis/SKILL.md` |
| Claude Code | `.claude/skills/stock-analysis/SKILL.md` |
| OpenCode | `.opencode/skills/stock-analysis/SKILL.md` |
| CodeBuddy Code | `.codebuddy/skills/stock-analysis/SKILL.md` |

执行 `npm run skills:package` 会从 `.agents/skills/` 同步融合版股票分析及旧两套兼容入口到其他三个目录，并更新下载包。旧名称 ZIP 包含同级 `stock-analysis`，解压后可直接读取融合版。重新打开会话后确认 Skill 列表；普通分析一个 agent 即可，多视角不强制多 agent。

| Skill | 用途 | 何时触发 |
|---|---|---|
| **stock-analysis** | 五步流程：商业模式 / 核心假设 / 盈利预测 / 三情景与盈亏比 / 六专家 / 证据与验证；按需回测与组合风险 | 「用股票分析研究 XX」「商业模式」「核心假设」「估值」「财报解读」「圆桌」 |
| **trading-analysis-team** | 12 角色流水线：技术 / 基本面 / 新闻 / 情绪并行采集 → 多空辩论 → 风险三派挑战 → 拍板 BUY/SELL/HOLD | 「X 该不该买」「多空辩论」「风险诊断」 |

每个 skill 内置研究纪律：数据可追溯、缺失标 `[MISSING]`，研究区间与情景价标明条件，结尾声明不构成投资建议。股票分析优先研究约 2:1 及以上的情景盈亏比，同时核实悲观压力、期限与证据；初筛数字不能直接认证。用户要求更新网站时，可将结果同步到 `src/data/companyCore.ts`（手工行）或 `src/data/details/`（深度页）并显示在 `/research-notes`。

## Orca 开发团队 dev_team

项目内置 [dev-team 技能](../.agents/skills/dev-team/SKILL.md)：当前 agent 作为唯一管理入口，通过 Orca 协调 Codex、Claude、Cursor、Kimi、Antigravity 与 OpenCode MiniMax M3。Android、Web 前端、后端分别生成需求、设计与测试流程，全栈按契约组织并行；按场景加载文档，支持额度不足时交接与替补。

在项目对话中输入 `$dev-team <开发目标>`（Claude Code 用 `/dev-team`，Kimi 用 `/skill:dev-team`）。网站「AI 实验室 › AI 工具 / Skill / Agent」与「AI 工具 › 开发协作」提供介绍、提示词、安装说明和下载入口。[操作与迁移说明](../.agents/skills/dev-team/references/operations.md) 包含初始化、路由、真实派工、M3 兼容启动和恢复步骤。可分享 [独立 ZIP 包](../public/ai-skills/dev-team.zip)，解压后在其他项目安装：

```bash
node /path/to/dev-team/scripts/dev-team.mjs init --project /path/to/other-project
```

依赖 Node 20+、支持 orchestration 的 Orca 和至少一个可用执行器；需在 Orca 打开目标项目后派工。当前网站下载包包含 `dev-team/` 与独立 [README 使用说明](../src/content/dev-team-README.md)，介绍自检、项目配置、日常操作与验证范围。网站 `/ai/dev-team` 渲染完整说明，并提供 ZIP 与 Markdown 原文下载；旧原文阅读链接转向网页说明。`pack` 仅输出技能本体，更新网站下载包时需同时保留独立 README；项目运行记录与凭据不随包发布。

## 全栈 AI 开发工作流 fullstack-workflow

[fullstack-workflow](../.agents/skills/fullstack-workflow/SKILL.md) 把 OpenSpec（唯一规范来源）、Matt Skills（需求澄清）、Superpowers（TDD、调试、审查、验证）与多 Agent 分工编排成七阶段流程，按快速 / 标准 / 严格三种模式执行，含质量门禁、审批门与五个模板。用法：`/fullstack-workflow <需求>`，skill 先判定模式，每阶段结束等用户确认。参考文档在 `references/`，模板在 `templates/`，包内 [README](../.agents/skills/fullstack-workflow/README.md) 说明三个工具的安装与缺省替代。网站「AI Skills 工具库 › 开发协作」提供说明与 [ZIP 下载](../public/ai-skills/fullstack-workflow.zip)；执行 `python3 scripts/package-fullstack-workflow.py` 可重新打包。

## kf-deeper Skill

[kf-deeper](../.agents/skills/kf-deeper/SKILL.md) 把现有任务改写得更深而不扩大范围：回答专业补足、原始材料、方法与工具、独立验证四问，给出改写提示词后停下等待确认。用法：`$kf-deeper <任务>`。网站「AI Skills 工具库 › 思考与提问」提供说明与 [ZIP 下载](../public/ai-skills/kf-deeper.zip)；执行 `python3 scripts/package-kf-deeper.py` 可重新打包。

## 任务深挖 Skill

[deepen-task](../agent-skills/skills/deepen-task/SKILL.md) 保持原任务范围，从专家补充工作、一手材料、具体方法与工具、独立验证四方面诊断，再重写提示词。用法：`用 deepen-task 深挖这个任务：<原始提示词和约束>`。网站「AI Skills 工具库 › 思考与提问」提供描述、示例与 [ZIP 下载](../public/ai-skills/deepen-task.zip)；解压后将 `deepen-task/` 放入助手的 Skills 目录。执行 `python3 scripts/package-deepen-task.py` 可从仓库源文件重新打包。

## Skills 同步工具

[sync-skills](../.agents/skills/sync-skills/README.md) 不是 Skill，而是命令行工具：把 `.agents/skills/` 同步到全局中心库 `~/.agents/skills`，再用软链接分发给 Claude、Codex、Cursor、Kimi、OpenCode、Antigravity 等 agent，不必每个项目各装一份。默认只预览：`node .agents/skills/sync-skills/scripts/sync-skills.mjs`，加 `--apply` 执行，覆盖前自动备份。

## AI 实验室：无货源电商实施方案

AI 实验室的 `/ai/dropshipping` 提供一件代发模式说明、30 天试验步骤、交互利润测算和订单记账模板。正文维护在 [src/content/dropshipping-strategy.md](../src/content/dropshipping-strategy.md)，预算与首页摘要维护在 `src/data/aiLab.ts`；平台规则引用官方资料并标注核对日期。页面保持“未开始”，实际经营后再更新实验日志。
