---
name: fullstack-workflow
description: 全栈 AI 开发工作流总控：OpenSpec 管规范、Matt 管澄清、Superpowers 管工程方法、多 Agent 分工实现、CI 与门禁证明结果。用户提到“全栈工作流”“OpenSpec 流程”“这个需求按什么模式做”“从需求到归档的完整流程”，或拿到一个功能、Bug、重构、性能需求而不确定先做什么时使用。适用于 Web、App、后端、数据库与云服务，不绑定任何语言或框架。
---

# 全栈 AI 开发工作流

```text
① 需求输入 ─ ② 澄清(Matt) ─ ③ 规范(OpenSpec) ─ ④ 架构审查 ─ ⑤ 实现(Superpowers+Agents) ─ ⑥ 质量门禁(CI) ─ ⑦ 合并·部署·归档
                 │                                                       │
                 └──────── 快速模式直接从 ③ 的最小 change 进入 ⑤ ────────┘
```

一句话：**OpenSpec 负责规范，Matt 负责思考，Superpowers 负责方法，Coding Agent 负责实现，Orchestrator 负责协调，CI 负责证明结果。**

当前对话 agent 是本次需求的 Orchestrator。职责是：定模式、推进阶段、派工并核实、守门禁、维护 OpenSpec 里的唯一事实。每个阶段的产物都写进 `openspec/changes/<change>/`，不在聊天里另存一份。

## 三条硬规则

1. **OpenSpec 是唯一 Spec 来源。** 需求、设计、任务只写在 `openspec/changes/<change>/` 下的 proposal、specs、design、tasks。Matt 的澄清结论、Superpowers 的计划都要回写到这些文件，不另建第二套文档或任务表。
2. **先定模式，再动手。** 读 [modes.md](references/modes.md)，按改动范围、风险域、涉及层数选 快速 / 标准 / 严格 之一，并把模式和理由写进 proposal.md 第一段。一个按钮不走全流程；支付、认证、迁移必须走严格模式。
3. **实现者不自证通过。** 测试、构建、E2E 由 CI 或独立 Verifier 运行并给出命令与输出；Reviewer 与 Implementer 不能是同一个 Agent。没有证据的“已完成”按未完成处理。

## 开始

1. 读项目的 AGENTS.md / CLAUDE.md、`openspec/config.yaml`（存在时）与工作区状态。保留用户已有改动。
2. 确认工具可用性，缺哪个就按 [tools.md](references/tools.md) 的“缺省替代”执行，不要因为某个工具没装而停下：
   - OpenSpec：`openspec list` 能运行，或 `openspec/` 目录存在。
   - Matt：`grill-with-docs` 或 `grilling` skill 可调用。
   - Superpowers：`test-driven-development`、`systematic-debugging`、`verification-before-completion`、`requesting-code-review` 可调用；没有时用项目自带的 `tdd`、`diagnosing-bugs`、`code-review`。
3. 把需求归类为 功能 / Bug / 性能 / 重构 之一，判定模式，然后按下表走。

| 模式 | 触发 | 走哪些阶段 | 详情 |
| --- | --- | --- | --- |
| 快速 | Bug 修复、小范围 UI、单接口小改、文案 | ③最小 change → ⑤ TDD 实现 → ⑥ 测试+审查 → ⑦ 归档 | [modes.md#快速](references/modes.md#快速模式) |
| 标准 | 新功能、数据库变更、前后端联动、新依赖 | ② → ③ → ④轻审 → ⑤ → ⑥ → ⑦ | [modes.md#标准](references/modes.md#标准模式) |
| 严格 | 大型重构、支付、认证授权、分布式、核心架构、破坏性迁移 | 全部七阶段，④ 独立 Architect，⑦ 含审批门 | [modes.md#严格](references/modes.md#严格模式) |

## 七个阶段

每阶段的输入、产出、使用的命令和退出条件见 [stages.md](references/stages.md)。摘要：

| 阶段 | 做什么 | 主要工具 | 产出落到哪 |
| --- | --- | --- | --- |
| ① 需求输入 | 归类、定模式、建 change | `/opsx:new` 或 `/opsx:propose` | `proposal.md` 首段 |
| ② 需求澄清 | 业务规则、边界、非功能需求、不做什么 | Matt `grill-with-docs` | `proposal.md` + [模板](templates/clarification.md) |
| ③ 规范与设计 | Proposal → Specs(delta) → Design → Tasks | `/opsx:propose` / `/opsx:ff` / `/opsx:update` | `specs/<capability>/spec.md`、`design.md`、`tasks.md` |
| ④ 架构审查 | API 契约、数据模型、安全、兼容性、回滚 | Architect 角色 + [审查清单](templates/architecture-review.md) | `design.md` 末尾“审查结论” |
| ⑤ 实现 | 按 tasks 派工，TDD，系统化调试，每任务审查 | Superpowers + Coding Agents + `/opsx:apply` | 代码 + `tasks.md` 勾选 |
| ⑥ 质量门禁 | 测试、构建、集成、E2E、安全扫描、CI | CI + Verifier + `/opsx:verify` | [验证报告](templates/verification-report.md) |
| ⑦ 合并与归档 | Merge → Staging → Production → Archive | `/opsx:archive`（含 sync specs） | `openspec/changes/archive/`、[发布清单](templates/release-checklist.md) |

阶段之间不自动连跑：每个阶段结束时向用户汇报产出位置和下一步，用户确认后进入下一阶段。快速模式可以一次汇报 ⑤⑥。

## 多 Agent 分工

角色、推荐执行者、隔离规则见 [agents.md](references/agents.md)。关键约束：

- 共享同一份 OpenSpec，但各 Implementer 在独立分支或 git worktree 里工作。
- 同一文件的修改串行：tasks.md 里标注文件 owner，有冲突的任务不并行派出。
- Reviewer 必须与 Implementer 不同；Verifier 以 CI 结果为准，Agent 只解读不替代。
- 需要跨 Codex / Claude / Cursor / Kimi / OpenCode / Antigravity 派工时，可交给项目里的 `dev-team` skill 做实际派发，本 skill 只定义任务卡与门禁。
- 执行者按能力分梯队：Claude / Codex 做推理岗位，Cursor / Kimi 做独立模块，OpenCode（倒数第二）与 Antigravity（agy，最后）只做步骤写死的流程性工作，不参与推理与判断。

## 门禁与审批

见 [gates.md](references/gates.md)。质量门禁自动跑，审批门必须等用户明确授权：破坏性数据库迁移、生产部署、密钥与权限变更、删除用户数据、改支付或计费逻辑。遇到审批门时停下，给出影响面与回滚方案，不要替用户点头。

## 新项目骨架

项目结构建议与 AGENTS.md / CLAUDE.md 模板见 [project-structure.md](references/project-structure.md)。目录是建议，不是三个工具的强制要求；已有项目不必重排，只需补上 `openspec/` 与 `AGENTS.md`。

## 这套流程不包含什么

三个工具相加不是自动化平台。Orchestrator 的状态持久化、执行沙箱、CI 流水线、审批门的技术实现都要在项目里单独配置，见 [gates.md](references/gates.md) 末尾的落地清单。本 skill 给的是编排规则，不是宣称工具装完就自动具备这些能力。
