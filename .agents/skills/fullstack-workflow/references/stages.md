# 七个阶段：输入、产出、命令、退出条件

所有产物都放在 `openspec/changes/<change>/` 下。change 名用 kebab-case 动词短语，例如 `add-order-export`、`fix-login-rate-limit`、`refactor-payment-gateway`。

命令写法以 Claude Code 为准（`/opsx:propose`）；Cursor 为 `/opsx-propose`，Codex 为 `$openspec-propose`。OpenSpec 默认只装 core 六个命令（propose、explore、apply、update、sync、archive）；需要 new、continue、ff、verify 时运行 `openspec config profile` 选扩展流程，再 `openspec update`。工具未安装时的替代做法见 [tools.md](tools.md)。

## ① 需求输入

- **输入**：用户的一句话需求、Bug 报告、性能数据或重构动机。
- **动作**：归类（功能 / Bug / 性能 / 重构），按 [modes.md](modes.md) 定模式；想法还不成形时先 `/opsx:explore` 比较方案，不建 change。确定后 `/opsx:new <change>`（扩展流程）或直接进入 ③ 的 `/opsx:propose`。
- **产出**：`proposal.md` 第一段：模式、理由、一句话目标。
- **退出条件**：用户认可模式与 change 名。

## ② 需求澄清（Matt）

- **输入**：proposal 首段 + 用户。
- **动作**：运行 `grill-with-docs`（没有则 `grilling`）。追问顺序：业务规则 → 边界与异常 → 非功能需求（性能、兼容、安全、可观测）→ 不做什么 → 验收方式。涉及新术语时用 `domain-modeling` 补术语表。
- **产出**：按 [clarification 模板](../templates/clarification.md) 回写 `proposal.md` 的“业务规则 / 边界情况 / 非功能需求 / 明确不做”四节；严格模式另产出 ADR 放到 `design.md` 的“决策记录”。
- **退出条件**：用户确认没有悬而未决的问题；每条边界情况都能对应到后面的一条 spec 场景。
- **不要**：在这一阶段写代码、拆任务，或者用 Matt 的 `to-spec`/`to-tickets` 再产一套文档。

## ③ 规范与设计（OpenSpec）

- **输入**：澄清后的 proposal。
- **动作**：`/opsx:propose`（一次生成全部规划产物）或扩展流程的 `/opsx:ff`；严格模式用 `/opsx:continue` 逐个产出并确认。后续修改用 `/opsx:update` 保持四个文件一致，不手工改到互相矛盾。
- **产出**：
  - `proposal.md`：为什么做、做什么、不做什么、影响面。
  - `specs/<capability>/spec.md`：delta specs，用 ADDED / MODIFIED / REMOVED 标记需求，每条需求至少一个场景。
  - `design.md`：API 契约（路径、方法、请求/响应、错误码）、数据模型与迁移、模块边界、非功能方案、回滚。快速模式可省。
  - `tasks.md`：有序复选框列表；每条写明 层（web/api/db/infra）、涉及文件或模块、验收方式、依赖的任务。先排 tracer bullet（最窄的端到端路径）。
- **退出条件**：`openspec status --change <change>` 显示规划产物齐全；用户批准 tasks 拆分。

## ④ 架构审查

- **输入**：design.md、specs、现有代码。
- **动作**：按 [architecture-review 模板](../templates/architecture-review.md) 过五节：API 契约、数据模型、安全、兼容性、运维与回滚。标准模式由 Orchestrator 自审前三节；严格模式由独立 Architect 全审。需要比较方案时可用 `design-an-interface` 出两版再选。
- **产出**：`design.md` 末尾“审查结论”：通过 / 有条件通过（列条件）/ 阻塞（列阻塞项）。
- **退出条件**：没有阻塞项；有条件通过的条件已转成 tasks.md 里的任务。

## ⑤ 实现（Superpowers + Coding Agents）

- **输入**：tasks.md、design.md、specs。
- **动作**：
  1. Orchestrator 按 [agents.md](agents.md) 把任务分配给 Implementer，每人一张 [任务卡](../templates/task-card.md)，各自 worktree。需要跨执行器派工时交给 `dev-team`。
  2. Implementer 对每个任务：`test-driven-development`（先红后绿再重构）；遇到异常行为走 `systematic-debugging` 的四步（复现、定位、根因、最小修复），禁止猜测式修改。
  3. 任务完成后 Implementer 自己运行该任务的验收命令，然后请求审查（`requesting-code-review` 或项目的 `code-review`），Reviewer 按 Standards 与 Spec 两轴报告。
  4. 审查通过后用 `/opsx:apply` 的方式勾选 `tasks.md` 对应项，并在任务卡记录命令与输出。
- **产出**：分支上的提交、勾选完的 tasks.md、每个任务的审查记录。
- **退出条件**：所有任务勾选且各自审查通过；Implementer 的 worktree 已合入集成分支，无冲突。
- **不要**：Implementer 自行改 specs 来迁就实现。spec 有误时回到 ③ 用 `/opsx:update` 改，并通知 Orchestrator。

## ⑥ 自动化质量门禁

- **输入**：集成分支。
- **动作**：按 [gates.md](gates.md) 的门禁清单由 CI 跑；本地只能作为预检。Verifier 运行 `/opsx:verify` 核对实现与 specs 的一致性，并执行 `verification-before-completion`：每条声明都附命令与输出。
- **产出**：[验证报告](../templates/verification-report.md)，放在 `openspec/changes/<change>/verification.md`。
- **退出条件**：CI 全绿、verify 无未解释差异、覆盖率不低于项目基线。任一失败回到 ⑤，由原 Implementer 修复，Reviewer 复审。
- **不要**：把“本地跑过了”当作通过；把跳过的测试写成通过。

## ⑦ 合并、部署、验收、归档

- **输入**：验证报告 + 用户授权。
- **动作**：按 [release-checklist](../templates/release-checklist.md)：PR 合并 → staging 部署与验收 → 审批门（生产、迁移、密钥）→ 生产部署 → 观察窗 → `/opsx:archive`（归档时同意 sync delta specs 到 `openspec/specs/`）。多个 change 同时完成时用 `/opsx:bulk-archive` 处理 spec 冲突。
- **产出**：`openspec/changes/archive/YYYY-MM-DD-<change>/`、更新后的 `openspec/specs/`、发布记录。
- **退出条件**：归档完成，`openspec list` 不再显示该 change；用户收到一段包含 变更摘要、验证证据位置、回滚方法 的收尾汇报。
