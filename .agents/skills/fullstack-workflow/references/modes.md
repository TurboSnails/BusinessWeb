# 模式选择与执行策略

模式决定走哪些阶段、谁来审、哪些门禁必须过。先判模式，再开 change，并把模式与理由写进 `proposal.md` 第一段，格式：`模式：标准。理由：新增接口并改两张表，不涉及认证与支付。`

## 判定规则

按下面顺序检查，命中即停：

1. **命中严格触发项之一 → 严格模式。** 支付/计费、认证授权/会话/权限、密钥与凭据、破坏性数据库迁移（删列、改类型、拆表）、分布式一致性（队列、事务、幂等）、核心架构或跨模块大重构（改动超过约 20 个文件或 3 个包）、生产基础设施（Terraform、K8s、网关）、涉及用户数据删除或导出。
2. **涉及两层以上（前端 + 后端、后端 + 数据库），或新增数据库对象、新增外部依赖、新增公开 API → 标准模式。**
3. **其余 → 快速模式。** 典型：单组件 UI 调整、文案、已有接口加一个可选字段、明确复现的 Bug、日志与监控补充。

拿不准时升一级，不降级。用户可以显式降级，但要在 proposal 里记录“用户要求以快速模式处理”。

## 快速模式

目标：半小时到两小时内闭环，产物最少但可追溯。

| 阶段 | 做法 |
| --- | --- |
| ③ 规范 | `/opsx:new <change>` 或直接 `/opsx:propose`。proposal.md 写清 问题、改动、不改什么 三段；tasks.md 一到三条。Bug 修复时 specs 可以只记录“现有行为应为 X”的一条 delta。不写 design.md。 |
| ⑤ 实现 | 单个 Implementer，当前分支或短分支。Bug 必走 `systematic-debugging`（或 `diagnosing-bugs`）：先复现、再定位根因、先写失败测试再修。 |
| ⑥ 门禁 | 单元测试 + lint + 类型检查 + 构建。Reviewer 做一次 Standards 轴审查。 |
| ⑦ 归档 | `/opsx:archive`。无 staging 要求。 |

不要做的事：不开 `grill-with-docs`，不做架构审查，不派多个 Agent，不写发布清单。

## 标准模式

目标：一个功能一次 change，一天到一周内交付。

| 阶段 | 做法 |
| --- | --- |
| ② 澄清 | `grill-with-docs` 一轮，产出 [clarification](../templates/clarification.md) 回写 proposal.md；至少写出 3 条边界情况和 1 条非功能需求（性能、兼容、可观测）。 |
| ③ 规范 | `/opsx:propose` 或 `/opsx:ff` 一次生成 proposal、specs、design、tasks。specs 按能力拆目录（`specs/auth/spec.md`、`specs/orders/spec.md`），每条需求带场景（Given/When/Then）。tasks 按 tracer-bullet 排序：先打通一条最窄的端到端路径，再扩展。 |
| ④ 架构审查 | Orchestrator 自审 [architecture-review](../templates/architecture-review.md) 的“契约、数据、兼容”三节，结论写进 design.md。 |
| ⑤ 实现 | 按 tasks 的层拆给 1 到 3 个 Implementer，各自 worktree。每个任务 TDD；完成一个任务即请求 `requesting-code-review`（或 `code-review`），通过后勾选 tasks.md。 |
| ⑥ 门禁 | 单元 + 集成 + 构建 + lint + 类型；涉及 UI 时加一条 E2E 或浏览器验收；CI 绿才算过。Verifier 用 `/opsx:verify` 对照 specs 核对实现。 |
| ⑦ 归档 | 合入主分支 → staging 验收 → `/opsx:archive`（sync delta specs 到 `openspec/specs/`）。 |

## 严格模式

目标：把风险在动手前暴露出来；慢一点换可回滚。

| 阶段 | 做法 |
| --- | --- |
| ② 澄清 | `grill-with-docs` 直到没有悬而未决的问题；产出 ADR（架构决策记录）与术语表（`domain-modeling`），决策回写 design.md。必须明确：失败模式、回滚路径、数据迁移窗口、合规要求。 |
| ③ 规范 | 走扩展流程：`/opsx:new` → `/opsx:continue` 逐个产出并逐个确认；specs 必须包含 失败场景 与 安全场景；design.md 必须包含 API 契约（含错误码）、数据模型与迁移脚本草案、向后兼容策略、灰度与回滚。 |
| ④ 架构审查 | 由独立 Architect（与 Implementer 不同模型或不同会话）按 [architecture-review](../templates/architecture-review.md) 全部五节审查，列出阻塞项；阻塞项清零前不派工。 |
| ⑤ 实现 | 多 Implementer 各自 worktree，同一文件串行；契约类文件（`packages/contracts/`、迁移脚本）只允许一个 owner。每个任务 TDD + 审查；安全相关代码必须 Reviewer 做 Spec 轴与安全轴双审。 |
| ⑥ 门禁 | 标准模式全部 + 安全扫描（依赖漏洞、密钥泄漏）+ 迁移演练（在副本上跑 up/down）+ 性能基线对比；`/opsx:verify` 报告需人工确认。 |
| ⑦ 归档 | 审批门：生产部署、破坏性迁移、密钥变更均需用户逐项授权；按 [release-checklist](../templates/release-checklist.md) 分步 staging → 灰度 → 全量 → 观察窗 → `/opsx:archive`。 |

## 模式切换

实现过程中发现范围超出（例如“小 UI 改动”牵出后端字段变更），立即停下，升级模式，补齐缺的阶段产物，再继续。降级需要用户同意。切换要在 proposal.md 记录：`2026-10-28 由快速升为标准：原因 ……`。
