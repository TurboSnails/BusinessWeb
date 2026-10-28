# 工具取舍与命令对照

三个工具各管一段，不重复。下表是选用策略；Skill 不能跨工具自动触发，每一站都由 Orchestrator 显式调用。

| 工具 | 在本流程中保留 | 不要重复启用 | 原因 |
| --- | --- | --- | --- |
| OpenSpec | propose / explore / update / sync / archive，扩展流程的 new / continue / ff / verify / bulk-archive | 其他框架的 spec、PRD、ticket | 唯一 Spec 来源，避免两套文档漂移 |
| Matt Skills | `grill-with-docs`、`grilling`、`domain-modeling`、`design-an-interface`、`diagnosing-bugs`、`code-review`（作为 Superpowers 缺省时的替代） | `to-spec`、`to-tickets`、`implement-spec` 的 issue tracker 流 | 这些会产生第二套 spec 与任务跟踪 |
| Superpowers | `test-driven-development`、`systematic-debugging`、`verification-before-completion`、`requesting-code-review`、`receiving-code-review`、`using-git-worktrees`、`subagent-driven-development` | `brainstorming`、`writing-plans`、`executing-plans` | 澄清与计划已由 Matt 和 OpenSpec 承担 |

## OpenSpec

- 安装：`npm install -g @fission-ai/openspec`，项目内 `openspec init`，选择要生成命令的助手。
- 扩展命令：`openspec config profile` 选 expanded，再在项目里 `openspec update`。
- 常用 CLI：`openspec list`、`openspec status --change <name> --json`、`openspec update`（重新生成 skill 与命令）。
- 目录：`openspec/config.yaml`（项目上下文与各产物规则）、`openspec/specs/`（当前有效规范）、`openspec/changes/<name>/`（进行中）、`openspec/changes/archive/`（已归档）。
- 把团队约定写进 `openspec/config.yaml` 的 context 与 rules，例如“所有 API 变更必须在 design.md 给出错误码表”，这样 propose 生成的产物自带约束。

**缺省替代**：没有 OpenSpec CLI 时，Orchestrator 手工维护同样的目录与文件。`proposal.md`、`specs/<capability>/spec.md`、`design.md`、`tasks.md` 的格式见 [stages.md ③](stages.md#③-规范与设计openspec)；归档时手动把 change 目录移到 `archive/YYYY-MM-DD-<name>/`，并把 delta specs 合并进 `openspec/specs/`。

## Matt Skills

- 安装：按 mattpocock/skills 仓库说明，或使用本项目已带的中文版（`grill-me`、`grilling`、`domain-modeling`、`design-an-interface`、`diagnosing-bugs`、`code-review`）。
- `grill-with-docs` = `grilling` 会话 + `domain-modeling`，在追问过程中直接产出 ADR 与术语表。严格模式必用；标准模式用 `grilling` 即可。
- `code-review` 的 Standards / Spec 两轴正好对应本流程的编码规范与 OpenSpec specs；让 Reviewer 以 `openspec/changes/<change>/specs/` 作为 Spec 轴的来源。

**缺省替代**：没有任何 Matt skill 时，Orchestrator 自己按 [clarification 模板](../templates/clarification.md) 的问题列表逐条追问，追问到用户说“没有了”为止。

## Superpowers

- 安装（Claude Code）：`/plugin marketplace add obra/superpowers-marketplace`，再 `/plugin install superpowers@superpowers-marketplace`。其他助手按仓库 README 把 `skills/` 复制到对应目录。
- 关键用法：
  - `test-driven-development`：每个任务先写失败测试；测试名描述行为，不描述实现。
  - `systematic-debugging`：复现 → 缩小范围 → 根因 → 最小修复 → 回归测试；不允许“试一下看看”。
  - `verification-before-completion`：声明完成前重新运行验证命令并贴输出。
  - `requesting-code-review` / `receiving-code-review`：请求审查时附 specs 路径与任务卡；收到审查意见先核实再改，不无脑照办。
  - `using-git-worktrees`、`subagent-driven-development`：多 Implementer 并行时的隔离方式。

**缺省替代**：用本项目自带的 `tdd`、`diagnosing-bugs`、`code-review`；验证环节由 Orchestrator 按 [verification-report 模板](../templates/verification-report.md) 强制附命令与输出。

## Coding Agents 与派工

本 skill 不绑定执行器。推荐分工见 [agents.md](agents.md)。需要真实跨 Codex / Claude / Cursor / Kimi / OpenCode / Antigravity 派工、回执、替补时，使用项目里的 `dev-team` skill：它负责派发与执行器管理，本 skill 负责任务卡、门禁与 OpenSpec 状态。OpenCode 与 agy 能力较弱，只派流程性任务，见 agents.md 的“机械执行者”。
