---
name: implement-spec
description: "把 /to-spec 和 /to-tickets 的产出整体实现为代码：按 ticket task graph 并行派 implementer subagents，合并到单一 integration branch。"
disable-model-invocation: true
---

你拿到的是一份 spec。这份 spec 应该已经有关联的 tickets，描述如何实现它。

Issue tracker 应该已经提供给你；如果没有，让用户运行 `/setup-matt-pocock-skills`。

目标：整份 spec 实现在单一 **integration branch** 上，且每个 ticket 都按 issue tracker 关闭工作的方式被 resolve。

Tickets 不是步骤列表，而是带 blocking 关系的 **task graph**。因此总有一个 **frontier**：可以立即领取的 tickets。

与 subagents 的往来沟通应尽量精简。主要通过 **context pointers** 沟通：指向 spec、tickets、research notes 和之前的 commits。不要重复 pointer 已能拿到的信息。

**Implementer subagents** 尽可能在后台运行，以获得最大并发。

## Steps

1. 阅读 spec 和 tickets，理解 task graph。

2. （可选）用一个 **exploration subagent** 完成 tickets 需要的探索：相关 codebase 文件或外部文档。确保 exploration subagent 能写文件：它应把 markdown notes 存到 repo 之外、所有后续 subagents 都能访问的目录。这样 **implementer subagents** 可以专注实现而不是探索。

3. 创建 integration branch。如果 issue tracker 通过 PR 关闭工作，或用户要求开 PR，就在第 5 步第一次 merge 之后开一个 draft PR（没有领先 main 的 commit 的 branch 开不了 PR），并标注它关闭 spec 和 tickets。PR body 使用 `/pr`。

4. 用 **implementer subagents** 实现每个 ticket，每个都在自己的 worktree、自己的 branch 上。每个 implementer subagent：
   - 开始前确认 worktree 基于 integration branch，如果不是就 reset 到它上面；
   - 使用 `/tdd` 构建这个 ticket；
   - 汇报完成前，把 integration branch tip merge 进自己的 branch。

5. 一个 **implementer subagent** 完成后，用一个 **merger subagent** 把它的工作 merge 到 integration branch。

6. 如果这改变了可用 tickets 的 **frontier**，就为新 tickets 启动更多 **implementer subagents**，以获得最大并发。

7. 所有 tickets 完成后，对 integration branch 运行 `/code-review`。用单个 **implementer subagent** 修复 code review 提出的所有问题。

8. 如果存在 draft PR，把它标记为 ready for review。否则按 issue tracker 关闭工作的方式 resolve 每个 ticket，并报告 integration branch。

9. 清理所有 **implementer subagent** worktrees。
