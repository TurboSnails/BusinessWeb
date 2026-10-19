---
name: matt-workflow
description: Matt Pocock Skills v1.3 端到端开发工作流总览与导航：grill-me → to-spec → to-tickets → implement / implement-spec → code-review → pr → retro。用户提到“Matt 工作流”“skills 工作流”“从想法到 PR 的完整流程”，或不确定下一步该用哪个 skill 时使用。
---

# Matt Pocock 工作流（Skills v1.3）

```text
grill-me ─ to-spec ─ to-tickets ─┬─ implement ──────┬─ code-review ─ pr ─ retro
                                 └─ implement-spec ─┘
```

当前对话 agent 负责判断用户处在哪一站，告诉用户下一步该运行哪个 skill，并在用户确认后运行它。每一站都是用户主动调用的 slash command，不要自动连跑多站。

## 各站

| 站 | 输入 | 产出 | 何时进入下一站 |
| --- | --- | --- | --- |
| `/grill-me` | 一个想法或计划 | 经过追问、共识清晰的设计 | 用户认为没有悬而未决的问题 |
| `/to-spec` | 当前对话 | issue tracker 上的 spec（PRD），带测试 seams | spec 已发布 |
| `/to-tickets` | spec | 带 blocking edges 的 tracer-bullet tickets | 用户批准拆分 |
| `/implement` | 单个 ticket 或小 spec | 当前 branch 上的 commits（已过 `/code-review`） | frontier 上的 ticket 完成；清空 context 后取下一个 |
| `/implement-spec` | 整份 spec + tickets | integration branch，可选 draft PR | 全部 tickets 完成并过 review |
| `/code-review` | 固定点到 HEAD 的 diff | Standards / Spec 双轴报告 | 问题已修复 |
| `/pr` | 已完成的 branch | PR body：Summary 图示、Evidence、Merge Danger | PR 已开 |
| `/retro` | 一次 session | 改进 agent 环境的建议（按严重度） | 用户选择落地的改进 |

## 选路：implement 还是 implement-spec

- **implement**：一次一个 ticket，人在回路，每个 ticket 之间清空 context。适合小改动、ticket 少、或想逐个把关时。
- **implement-spec**（v1.3 新增）：整份 spec 一次跑完；按 task graph 的 frontier 并行派后台 implementer subagents，各自 worktree，由 merger subagent 合入 integration branch，最后统一 `/code-review`。适合 ticket 多且可并行、用户想 AFK 时。

## 前置条件

- Issue tracker 与 triage labels 未配置时，先运行 `/setup-matt-pocock-skills`。
- 可选：`/domain-modeling` 维护领域术语，供 to-spec、to-tickets、pr 使用。
- 被引用的辅助 skills：`/grilling`（grill-me）、`/tdd`（implement、implement-spec）。

## 来源

上游：[mattpocock/skills](https://github.com/mattpocock/skills) `skills/engineering/`，v1.3 新增 `implement-spec`、`pr`、`retro`；`implement` 增加 ticket reference 处理。
