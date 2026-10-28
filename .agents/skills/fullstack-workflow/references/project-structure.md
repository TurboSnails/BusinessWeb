# 项目结构建议与 Agent 规则模板

目录是建议，不是 OpenSpec、Matt 或 Superpowers 的强制布局。已有项目只需补 `openspec/` 和 `AGENTS.md`，其余保持原样。

## 推荐结构

```text
my-project/
├── apps/
│   ├── web/                  # React / Next.js / Vue
│   ├── mobile/               # Flutter / Android / iOS
│   └── admin/                # 管理后台
├── services/
│   ├── api/                  # Python / Go / Node / Kotlin
│   └── worker/               # 异步任务、定时任务
├── packages/
│   ├── shared/               # 跨端共享逻辑
│   ├── ui/                   # 设计系统与组件
│   └── contracts/            # API / Schema 契约（单一 owner）
├── infrastructure/
│   ├── docker/
│   └── terraform/
├── openspec/
│   ├── config.yaml           # 项目上下文与产物规则
│   ├── specs/                # 当前有效规范（按 capability 分目录）
│   └── changes/              # 进行中的变更；archive/ 放已归档
├── .agents/skills/           # 各助手共享的 Skills（.claude/skills 等用符号链接指向这里）
├── AGENTS.md                 # 所有 Agent 的统一规则
├── CLAUDE.md                 # Claude 专用入口，只写“读 AGENTS.md”加 Claude 特有项
└── README.md
```

要点：
- `packages/contracts/` 是前后端并行的前提，变更必须先于实现合入，且只有一个 owner。
- 多端项目各自保留自己的测试与构建命令，并在 `AGENTS.md` 的“门禁命令”表里列出，Verifier 直接照表执行。
- Skills 只放一份在 `.agents/skills/`，其他目录用符号链接，避免多份漂移。

## AGENTS.md 模板

```markdown
# AGENTS.md

## 项目一句话
<做什么、给谁用、当前阶段>

## 工作流
本项目使用 fullstack-workflow：OpenSpec 为唯一 Spec 来源（`openspec/`），
需求澄清用 Matt grill-with-docs，实现用 Superpowers TDD / systematic-debugging，
门禁以 CI 为准。开始任何任务前先运行 `/fullstack-workflow` 判定模式。

## 目录与归属
| 目录 | 负责的层 | 测试命令 | 构建命令 |
| --- | --- | --- | --- |
| apps/web | 前端 | `npm -w apps/web test` | `npm -w apps/web run build` |
| services/api | 后端 | `pytest services/api` | `docker build services/api` |
| packages/contracts | 契约（单一 owner） | `npm -w packages/contracts run check` | — |

## 门禁命令
lint: `...`  typecheck: `...`  unit: `...`  integration: `...`  e2e: `...`

## 编码规范
<语言约定、错误处理、日志、命名；code-review 的 Standards 轴以此为准>

## 禁止事项
- 不直接修改 `openspec/specs/`，只通过 change 归档同步。
- 不连接生产数据库；不提交密钥。
- 破坏性迁移、生产部署、密钥变更必须经用户授权。

## 多 Agent
Reviewer 与 Implementer 不同；并行任务各用 worktree；契约文件串行。
```

## CLAUDE.md 模板

```markdown
# CLAUDE.md

先读 AGENTS.md，其规则全部适用。

Claude 特有：
- 使用 `/fullstack-workflow` 作为任务入口；OpenSpec 命令为 `/opsx:*`。
- Superpowers 已安装时优先其 skills；未安装时用 `.claude/skills/` 下的 tdd、diagnosing-bugs、code-review。
- 子代理派工遵循 AGENTS.md 的多 Agent 规则。
```

## openspec/config.yaml 建议写入的规则

```yaml
context: |
  <项目一句话、技术栈、部署方式>
rules:
  proposal:
    - 第一段写明模式（快速/标准/严格）与理由
    - 包含“明确不做”一节
  specs:
    - 每条需求至少一个 Given/When/Then 场景
    - 严格模式必须包含失败与安全场景
  design:
    - API 变更必须给出错误码表与向后兼容策略
    - 数据库变更必须给出迁移与回滚
  tasks:
    - 每条任务标注层、涉及文件、验收命令、依赖
    - 第一条任务是最窄的端到端 tracer bullet
```
