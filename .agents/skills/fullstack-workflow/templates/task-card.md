# 任务卡（阶段 ⑤，每条 tasks.md 任务一张）

> 上半部分由 Orchestrator 填写后派出；下半部分由 Implementer 作为回执填写。没有命令与输出的回执打回。可落盘到 `openspec/changes/<change>/runs/<task-id>.md`。

## 派工

| 字段 | 内容 |
| --- | --- |
| Change | `<change>` |
| 任务 | `<task-id>` <tasks.md 中的原文> |
| 层 | web / api / db / infra / mobile |
| 执行者 | <角色 · 模型/工具> |
| 工作区 | `git worktree add ../wt-<task-id> -b <change>/<task-id>` |
| 只读依据 | `openspec/changes/<change>/specs/<capability>/spec.md` 第 <节>；`design.md` 第 <节> |
| 允许修改的文件 | <列表；契约类文件未列出即禁止> |
| 禁止事项 | 不改 specs；不碰 <文件>；不连生产；不提交密钥 |
| 验收命令 | `<test cmd>`，`<lint cmd>`，<其他> |
| 完成定义 | 验收命令通过 + 新增测试覆盖本任务场景 + 审查通过 |
| 依赖 | blocked-by: <task-id> / 无 |
| 方法 | test-driven-development；异常时 systematic-debugging |
| 逐步命令 | 仅执行者为 OpenCode / agy 时填写：逐条写死要执行的命令与预期输出；结果与预期不符立即停下回报，不自行排错 |

## 回执（Implementer 填写）

**状态**：完成 / 部分完成 / 阻塞 / 交接

**改动文件**：
- `path/to/file` — <一句话>

**运行的命令与输出**：
```text
$ <命令>
<关键输出，含通过数、失败数、耗时>
```

**新增/修改的测试**：
- `<测试文件>::<用例名>` — 覆盖 spec 场景 <名称>

**未完成项与原因**：
- …

**对 spec / design 的疑问**（Orchestrator 处理，Implementer 不自行改 spec）：
- …

**交接信息**（状态为交接时必填）：
- worktree 路径、已完成步骤、下一步、未提交改动
