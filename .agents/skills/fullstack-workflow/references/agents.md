# 多 Agent 角色与隔离规则

岗位与模型分离：换模型不改职责；额度不足时换执行者，任务卡与门禁不变。

## 角色

| 角色 | 推荐执行者 | 职责 | 边界 |
| --- | --- | --- | --- |
| Orchestrator | 当前对话 agent（Claude 或 Codex） | 定模式、维护 OpenSpec 状态、派工、核实回执、守门禁、向用户汇报 | 不直接大段写业务代码；快速模式可兼任 Implementer |
| Architect | Claude | ③ 的 design.md、④ 架构审查、方案比较 | 不写实现代码；严格模式下与 Implementer 分属不同会话 |
| Implementer | Codex | 按任务卡 TDD 实现、调试、自测、请求审查 | 只改任务卡列出的文件；spec 有误回报而不是自行改 spec |
| Secondary Implementer | Cursor / Kimi | 独立模块、并行任务、文档与测试补充 | 同上；不碰契约类文件 |
| Mechanical Runner | OpenCode、Antigravity（agy） | 只做步骤已写死的流程性工作，见下文“机械执行者” | 不推理、不决策；任务卡必须自带完整步骤与预期输出 |
| Reviewer | 与 Implementer 不同的 Agent | Standards 轴 + Spec 轴审查，安全相关加安全轴 | 只读；发现问题回给 Implementer，不自己改 |
| Verifier | CI + 一个 Agent | 跑门禁、`/opsx:verify`、写验证报告 | 只解读 CI 输出，不以本地结果替代 CI |

一人多岗允许，但 Reviewer ≠ Implementer、Verifier ≠ Implementer 这两条不能破。

## 执行者梯队

按推理能力从强到弱排序，派工时先从前往后选；额度不足时顺序补位，但越靠后的越不能接需要判断的任务。

1. Claude / Codex：Orchestrator、Architect、Implementer、Reviewer 等需要推理的岗位。
2. Cursor、Kimi：Secondary Implementer，做边界清晰的独立模块、测试与文档。
3. **OpenCode（倒数第二）**、**Antigravity / agy（最后）**：Mechanical Runner，只能做最简单的流程工作。

### 机械执行者

OpenCode 与 agy 能力偏弱，只接**不需要推理**的任务，尽量不让它们参与分析、设计和排错：

- 可以做：按任务卡给定的命令跑测试、构建、lint 并如实贴出输出；按明确清单重命名、移动、格式化文件；套用模板生成样板文件；勾选 tasks.md；整理 CI 输出、日志和变更清单；合入已审查的分支并按固定顺序跑门禁预检。
- 不做：写 spec、design、架构审查；设计或改动契约、数据库迁移；定位 Bug 根因；写业务逻辑或需要取舍的重构；担任 Reviewer 或 Verifier 的判断部分；解读失败原因。
- 任务卡要求：步骤逐条写死，给出要执行的命令与预期输出；遇到偏离预期的结果立即停下回报 Orchestrator，不自行猜测或修补。
- 同样遵守 Reviewer ≠ Implementer：它们的产出同样必须由更强的执行者复核。

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
- 执行器额度耗尽或失联：任务卡回收，标记 `handoff`，附当前 worktree 路径与已完成步骤，按执行者梯队交给替补继续；需要推理的任务不得降级交给 OpenCode 或 agy，宁可等待或回到 Orchestrator。

## 上下文纪律

- 每个 Implementer 只加载：自己的任务卡、相关 specs 段落、design.md 相关节、涉及文件。不要把整份 OpenSpec 和所有参考文档都塞进去。
- 任务之间清空上下文；长任务按检查点写回任务卡，避免会话中断丢进度。
- Orchestrator 不转述代码，转述回执；需要看代码时直接读 diff。
