# fullstack-workflow：OpenSpec + Matt + Superpowers 全栈开发工作流

```text
① 需求输入 ─ ② 澄清(Matt) ─ ③ 规范(OpenSpec) ─ ④ 架构审查 ─ ⑤ 实现(Superpowers+Agents) ─ ⑥ 质量门禁(CI) ─ ⑦ 合并·部署·归档
```

一套不绑定语言和框架的 AI Agent 软件工程流程：OpenSpec 负责规范，Matt 负责思考，Superpowers 负责方法，Coding Agent 负责实现，Orchestrator 负责协调，CI 负责证明结果。适用于 Web、App、后端、数据库与云服务。

## 包含

| 文件 | 作用 |
| --- | --- |
| `SKILL.md` | 入口：三条硬规则、模式判定表、七阶段摘要、角色与门禁 |
| `references/modes.md` | 快速 / 标准 / 严格 三种模式的判定规则与每阶段做法 |
| `references/stages.md` | 七阶段的输入、产出、OpenSpec 命令、退出条件 |
| `references/tools.md` | 三个工具各保留什么、安装与命令、缺省替代 |
| `references/agents.md` | Orchestrator / Architect / Implementer / Reviewer / Verifier 分工与隔离规则 |
| `references/gates.md` | 按模式的质量门禁表、审批门、平台落地清单 |
| `references/project-structure.md` | 推荐目录、AGENTS.md / CLAUDE.md / openspec config 模板 |
| `templates/clarification.md` | 需求澄清记录 |
| `templates/architecture-review.md` | 架构审查五节清单 |
| `templates/task-card.md` | 派工任务卡与回执 |
| `templates/verification-report.md` | 验证报告 |
| `templates/release-checklist.md` | 合并、staging、审批门、生产、回滚、归档 |

## 安装

1. 解压，把 `fullstack-workflow/` 整个文件夹放进项目的 `.agents/skills/`（Codex 等）或 `.claude/skills/`（Claude Code）；多目录时用符号链接指向同一份。
2. 安装三个工具（都可选，缺少时 skill 会用替代做法，见 `references/tools.md`）：
   - OpenSpec：`npm install -g @fission-ai/openspec` 后在项目里 `openspec init`；需要 verify 等扩展命令时 `openspec config profile` 选 expanded 再 `openspec update`。
   - Matt Skills：`grill-with-docs` / `grilling` / `domain-modeling`。
   - Superpowers：Claude Code 内 `/plugin marketplace add obra/superpowers-marketplace`，再 `/plugin install superpowers@superpowers-marketplace`。
3. 按 `references/project-structure.md` 在项目根补上 `AGENTS.md`（与可选的 `CLAUDE.md`），把门禁命令表填好。
4. 重新打开会话，输入 `/fullstack-workflow <需求>`。skill 会先判定模式，再带你走对应阶段；每阶段结束等你确认，不自动连跑。

## 用法示例

- `/fullstack-workflow 订单列表支持按状态筛选并导出 CSV` → 判为标准模式，先 grill 澄清，再 `/opsx:propose`。
- `/fullstack-workflow 登录页偶发 500，日志见 …` → 快速模式，`/opsx:new` 最小 change，systematic-debugging 后 TDD 修复。
- `/fullstack-workflow 把支付网关从 A 换成 B` → 严格模式，独立 Architect 审查，生产前审批门。

## 运行要求

- 支持 Skills 的助手（Claude Code、Codex、OpenCode、Kimi 等）。
- 多 Agent 并行需要 git worktree 与子代理能力；跨执行器真实派工可配合 `dev-team` skill。
- CI 流水线由项目自行配置；本 skill 只定义门禁要求，不替代 CI。

## 许可

本 skill 文本以 MIT 许可发布。OpenSpec、Matt Pocock Skills、Superpowers 各自遵循其上游许可，本包不包含它们的代码。
