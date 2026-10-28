# 多 Agent 角色与隔离规则

岗位与模型分离：换模型不改职责；额度不足时换执行者，任务卡与门禁不变。

## 角色

| 角色 | 推荐执行者 | 职责 | 边界 |
| --- | --- | --- | --- |
| Orchestrator | 当前对话 agent（Claude 或 Codex） | 定模式、维护 OpenSpec 状态、派工、核实回执、守门禁、向用户汇报 | 不直接大段写业务代码；快速模式可兼任 Implementer |
| Architect | Claude | ③ 的 design.md、④ 架构审查、方案比较 | 不写实现代码；严格模式下与 Implementer 分属不同会话 |
| Implementer | Codex | 按任务卡 TDD 实现、调试、自测、请求审查 | 只改任务卡列出的文件；spec 有误回报而不是自行改 spec |
| Secondary Implementer | OpenCode / Kimi | 独立模块、并行任务、文档与测试补充 | 同上；不碰契约类文件 |
| Reviewer | 与 Implementer 不同的 Agent | Standards 轴 + Spec 轴审查，安全相关加安全轴 | 只读；发现问题回给 Implementer，不自己改 |
| Verifier | CI + 一个 Agent | 跑门禁、`/opsx:verify`、写验证报告 | 只解读 CI 输出，不以本地结果替代 CI |

一人多岗允许，但 Reviewer ≠ Implementer、Verifier ≠ Implementer 这两条不能破。

## 并行与隔离

1. **共享 Spec，隔离工作区。** 所有人读同一份 `openspec/changes/<change>/`；每个 Implementer 在自己的分支或 `git worktree add ../wt-<task> -b <change>/<task>` 里工作。
2. **同一文件串行。** tasks.md 每条任务标注涉及文件；两条任务文件集相交，就标 `blocked-by` 串行执行，或合并为一条。契约类文件（`packages/contracts/`、数据库迁移、路由表）只允许一个 owner。
3. **先契约后并行。** 前后端联动时先派一条任务产出契约（类型、OpenAPI、schema），契约合入后前后端才并行。
4. **合入顺序由 Orchestrator 定。** 按依赖图从底层（db → api → web）合入集成分支；每次合入后跑一次门禁预检。
5. **回执格式固定。** Implementer 完成任务时返回任务卡下半部分：改了哪些文件、运行了什么命令、输出摘要、未完成项、对 spec 的疑问。没有命令与输出的回执打回。

## 派工流程

```text
tasks.md ──► 任务卡(模板) ──► Implementer(worktree) ──► 回执 ──► Reviewer ──► 勾选 tasks.md
                                     │                        ▲
                                     └── 疑问/阻塞 ──► Orchestrator ┘
```

- 一次只派 frontier 上无阻塞依赖的任务；派出数量不超过可用执行器数量。
- 派工前检查执行器状态；需要真实跨 harness 派工时用 `dev-team` 的 `plan` 与派发流程，任务卡内容直接作为其任务描述。
- 执行器额度耗尽或失联：任务卡回收，标记 `handoff`，附当前 worktree 路径与已完成步骤，交给替补执行者继续。

## 上下文纪律

- 每个 Implementer 只加载：自己的任务卡、相关 specs 段落、design.md 相关节、涉及文件。不要把整份 OpenSpec 和所有参考文档都塞进去。
- 任务之间清空上下文；长任务按检查点写回任务卡，避免会话中断丢进度。
- Orchestrator 不转述代码，转述回执；需要看代码时直接读 diff。
