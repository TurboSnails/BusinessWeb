# gupiaoWS / BusinessWeb

个人投资研究与网格交易工作台。覆盖 **沪深 A 股 + 美股标普 500**，把多智能体投研流水线（A 股买/卖决策、美股深度覆盖）与本地化网格交易工具整合在一个静态站点里。

## 这是什么

- **个人知识中心**：顶层 `/knowledge` 默认打开蒲公英知识网络，与 Obsidian 共用真实 Markdown，支持每日 Inbox、编辑、搜索和双向链接。本地 stdio MCP 支持 Agent 读写；只读 HTTP MCP 提供带认证及目录范围的第三方 AI 访问。运行 `npm run knowledge:app`，详见[本地说明](docs/knowledge-local-setup.md)和[HTTP MCP 接入](docs/knowledge-garden-and-http-mcp.md)。私人数据不会发布到静态网站；远程托管、OAuth、向量索引及 R2 为后续阶段。

- **公司估值工作台**：`/valuation`支持本地Pi/Codex/Claude/OpenCode及具体模型版本选择、财务采集、六方法三情景估值、参数复算和报告导出。启动方法见[本地估值说明](docs/valuation-local-setup.md)。

- **网格交易**：`src/features/grid-trading/` 实现了完整的 ETF / 个股网格模拟器——行情接入、参数求解、回测、记录、导入导出、可选 Supabase 同步。记录默认保存在浏览器，云同步只在手动配置独立 Supabase + token 后才启用。
- **AI 投研**：项目自带统一股票分析与交易分析 skill（见 [AI 投研 skills](#ai-投研-skills)），支持深度研究、圆桌观点与交易风险分析。
- **多市场数据**：通过 MCP（yahoo-finance、baostock）和 `src/services/api.ts` 的本地封装，覆盖美股行情、A 股行情、ETF 实时数据、AkShare 数据字典。
- **每日分析**：`/daily-analysis` 自动获取 A 股指数、涨跌停、连板梯队和榜单，保存交易日快照；原手工记录保留在「历史旧版」。数据口径与定时归档见[每日分析说明](docs/daily-analysis.md)。

栈：React 18 · Vite 5 · TypeScript · React Router 6 · Vitest · Node 24。

## 目录结构

```
BusinessWeb/
├── src/
│   ├── pages/              路由页面（Home / ResearchNotes / GridCalculator / GridRecords 等）
│   ├── features/
│   │   └── grid-trading/   网格交易模块（自包含：模拟、回测、记录、同步、导入导出）
│   ├── components/         复用组件（Header / Footer / 各市场卡片）
│   ├── data/               标普500 / 沪深 / 概念板块数据源
│   ├── services/           API 封装（akshare / 行情代理）
│   └── hooks/, utils/, types/
├── api/                    Vercel Serverless Functions
├── server/                 Vite dev 中间件（行情代理）
├── supabase/migrations/    网格记录云同步表结构
├── docs/
│   ├── DEPLOYMENT.md       Vercel + Supabase 部署细节
│   ├── AKSHARE.md          AKTools 接入说明
│   ├── design/             ETF 网格设计文档
│   ├── research/           已完成的圆桌报告样例
│   └── superpowers/        计划与设计 spec
└── opencode.jsonc          opencode 配置（含 MCP servers）
```

## 快速开始

```bash
cd BusinessWeb
npm ci
npm run dev          # http://localhost:5173
```

需要 **Node 24**（已在 `package.json` 的 `engines` 中声明）。开发服务器自带 `/api/grid-market` 行情代理；`/api/grid-sync` 仅在 `vercel dev` 下运行。

## 验证

```bash
npm test -- --run
npm run test:functions
npm run typecheck
npm run build
```

`typecheck` 覆盖网格交易、估值、个人知识中心与新增同步服务端；历史页面暂不在该检查范围内。`test:functions` 检查 Vercel Function 的 schema 与环境变量使用。

## Orca 开发团队 dev_team

项目内置 [dev-team 技能](.agents/skills/dev-team/SKILL.md)：当前 agent 作为唯一管理入口，通过 Orca 协调 Codex、Claude、Kimi、Antigravity 与 OpenCode MiniMax M3。Android、Web 前端、后端分别生成需求、设计与测试流程，全栈按契约组织并行；按场景加载文档，支持额度不足时交接与替补。

在项目对话中输入 `$dev-team <开发目标>`（Claude Code 用 `/dev-team`，Kimi 用 `/skill:dev-team`）。网站「AI 实验室 › AI 工具 / Skill / Agent」与「AI 工具 › 开发协作」提供介绍、提示词、安装说明和下载入口。[操作与迁移说明](.agents/skills/dev-team/references/operations.md) 包含初始化、路由、真实派工、M3 兼容启动和恢复步骤。可分享 [独立 ZIP 包](public/ai-skills/dev-team.zip)，解压后在其他项目安装：

```bash
node /path/to/dev-team/scripts/dev-team.mjs init --project /path/to/other-project
```

依赖 Node 20+、支持 orchestration 的 Orca 和至少一个可用执行器；需在 Orca 打开目标项目后派工。当前网站下载包包含 `dev-team/` 与独立 [README 使用说明](src/content/dev-team-README.md)，介绍自检、项目配置、日常操作与验证范围。网站 `/ai/dev-team` 渲染完整说明，并提供 ZIP 与 Markdown 原文下载；旧原文阅读链接转向网页说明。`pack` 仅输出技能本体，更新网站下载包时需同时保留独立 README；项目运行记录与凭据不随包发布。

## 全栈 AI 开发工作流 fullstack-workflow

[fullstack-workflow](.agents/skills/fullstack-workflow/SKILL.md) 把 OpenSpec（唯一规范来源）、Matt Skills（需求澄清）、Superpowers（TDD、调试、审查、验证）与多 Agent 分工编排成七阶段流程，按快速 / 标准 / 严格三种模式执行，含质量门禁、审批门与五个模板。用法：`/fullstack-workflow <需求>`，skill 先判定模式，每阶段结束等用户确认。参考文档在 `references/`，模板在 `templates/`，包内 [README](.agents/skills/fullstack-workflow/README.md) 说明三个工具的安装与缺省替代。网站「AI Skills 工具库 › 开发协作」提供说明与 [ZIP 下载](public/ai-skills/fullstack-workflow.zip)；执行 `python3 scripts/package-fullstack-workflow.py` 可重新打包。

## 无货源电商实施方案

AI 实验室的 `/ai/dropshipping` 提供一件代发模式说明、30 天试验步骤、交互利润测算和订单记账模板。正文维护在 [src/content/dropshipping-strategy.md](src/content/dropshipping-strategy.md)，预算与首页摘要维护在 `src/data/aiLab.ts`；平台规则引用官方资料并标注核对日期。页面保持“未开始”，实际经营后再更新实验日志。

## Skills 同步工具

[sync-skills](.agents/skills/sync-skills/README.md) 不是 Skill，而是命令行工具：把 `.agents/skills/` 同步到全局中心库 `~/.agents/skills`，再用软链接分发给 Claude、Codex、Cursor、Kimi、OpenCode、Antigravity 等 agent，不必每个项目各装一份。默认只预览：`node .agents/skills/sync-skills/scripts/sync-skills.mjs`，加 `--apply` 执行，覆盖前自动备份。

## kf-deeper Skill

[kf-deeper](.agents/skills/kf-deeper/SKILL.md) 把现有任务改写得更深而不扩大范围：回答专业补足、原始材料、方法与工具、独立验证四问，给出改写提示词后停下等待确认。用法：`$kf-deeper <任务>`。网站「AI Skills 工具库 › 思考与提问」提供说明与 [ZIP 下载](public/ai-skills/kf-deeper.zip)；执行 `python3 scripts/package-kf-deeper.py` 可重新打包。

## 任务深挖 Skill

[deepen-task](agent-skills/skills/deepen-task/SKILL.md) 保持原任务范围，从专家补充工作、一手材料、具体方法与工具、独立验证四方面诊断，再重写提示词。用法：`用 deepen-task 深挖这个任务：<原始提示词和约束>`。网站「AI Skills 工具库 › 思考与提问」提供描述、示例与 [ZIP 下载](public/ai-skills/deepen-task.zip)；解压后将 `deepen-task/` 放入助手的 Skills 目录。执行 `python3 scripts/package-deepen-task.py` 可从仓库源文件重新打包。

## AI 投研 skills

项目以 `stock-analysis` 融合研究方法、股票研究专家、腾讯自选股投研专家团与 Public Markets Investing，位于「AI 工具」第一项。新增商业模式驱动树、核心假设、预测归因、行业周期及证据追溯；回测与组合风险按需启用。交易分析团队保留独立入口；旧两套名称转入融合版。

从 BusinessWeb 目录启动工具。股票分析已安装到以下项目目录：

| 工具 | 股票分析入口 |
| --- | --- |
| Codex / Antigravity CLI | `.agents/skills/stock-analysis/SKILL.md` |
| Claude Code | `.claude/skills/stock-analysis/SKILL.md` |
| OpenCode | `.opencode/skills/stock-analysis/SKILL.md` |
| CodeBuddy Code | `.codebuddy/skills/stock-analysis/SKILL.md` |

执行 `npm run skills:package` 会从 `.agents/skills/` 同步融合版股票分析及旧两套兼容入口到其他三个目录，并更新下载包。旧名称 ZIP 包含同级 `stock-analysis`，解压后可直接读取融合版。重新打开会话后确认 Skill 列表；普通分析一个 agent 即可，多视角不强制多 agent。

| Skill | 用途 | 何时触发 |
|---|---|---|
| **stock-analysis** | 五步流程：商业模式 / 核心假设 / 盈利预测 / 三情景与盈亏比 / 六专家 / 证据与验证；按需回测与组合风险 | 「用股票分析研究 XX」「商业模式」「核心假设」「估值」「财报解读」「圆桌」 |
| **trading-analysis-team** | 12 角色流水线：技术 / 基本面 / 新闻 / 情绪并行采集 → 多空辩论 → 风险三派挑战 → 拍板 BUY/SELL/HOLD | 「X 该不该买」「多空辩论」「风险诊断」 |

每个 skill 内置研究纪律：数据可追溯、缺失标 `[MISSING]`，研究区间与情景价标明条件，结尾声明不构成投资建议。股票分析优先研究约 2:1 及以上的情景盈亏比，同时核实悲观压力、期限与证据；初筛数字不能直接认证。用户要求更新网站时，可将结果同步到 `src/data/companyCore.ts`（手工行）或 `src/data/details/`（深度页）并显示在 `/research-notes`。

## MCP 数据源

在仓库根的 `opencode.jsonc` 中配置：

- **yahoo-finance**（`yahoo-finance-mcp-server`）：美股行情 / 财报 / 基本面
- **baostock**（`/Users/hassan/AndroidStudioProjects/gupiaoWS/.mcp-servers/mcp-baostock-server`）：A 股行情与财务数据（baostock 0.8.9）

## 部署

「最近更新」仅在 `/about` 展示，内容维护在 [src/data/siteUpdates.ts](src/data/siteUpdates.ts)：只登记已经上线、用户可感知的需求，用中文写功能变化和使用入口，同一需求合并一条，按上线日期倒序排列。不自动导入 Git 提交，不记录构建、维护、测试和例行数据刷新；`public/changelog.json` 仅保留为技术记录，不用于网站更新列表。

- **Vercel（推荐）**：默认 `npm run build` 输出到根路径；Serverless Functions 处理 `/api/grid-market` 与 `/api/grid-sync`。完整步骤见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)，包括 Vercel 免费项目额度、可选 Supabase 同步与环境变量。
- **GitHub Pages**：由 [.github/workflows/pages.yml](.github/workflows/pages.yml) 在推送 `main` 时自动测试、构建并发布，也可在 Actions 中手动运行。首次迁移需在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**；若 `github-pages` 环境限制了部署分支，需允许 `main`。不要将 Pages 的来源直接设成 `main` 分支静态目录，React 源码需要先构建。Pages 不运行 Functions，API 继续使用配置的 Vercel 服务。
  - 本地验证：`npm run build:pages`；构建产物上传为 Pages artifact，不提交到 `gh-pages`。`deploy` 脚本与 `gh-pages` 依赖已移除。
  - 确认新工作流部署成功后，才可以删除旧 `gh-pages` 分支。
  - **Vercel 独立配置**：Production Branch 设为 `main`、Root Directory 清空、Build Command 为 `npm run build`、Output Directory 为 `dist`。修改 Pages 工作流不会自动修正 Vercel 项目设置。

## 限制与边界

明确**没有**做、也**不在**路线图里立刻做的事：

- 没有 R2 / S3 文件上传；当前没有附件业务（PDF、图片、模型输出等需要文件存储时再接入）
- 不做多用户登录与权限系统；Supabase 同步用专用 token，按单用户多设备设计
- A 股行情仍依赖公共代理（东方财富、腾讯），不保证长期稳定
- AKTools 需 Python 服务，未自动部署；如需使用请配置 `VITE_AKTOOLS_BASE_URL`
- 投研 skill 的所有产出是研究材料，**不构成投资建议**

## 相关文档

- [docs/data-maintenance.md](docs/data-maintenance.md) — 数据过期盘点、更新台账、维护周期与验收方法
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Vercel + Supabase 部署
- [docs/AKSHARE.md](docs/AKSHARE.md) — AKTools 接入
- [docs/design/ETF_GRID_TRADING.md](docs/design/ETF_GRID_TRADING.md) — 网格交易设计
- [docs/research/](docs/research/) — 圆桌报告样例
- [docs/superpowers/plans/2026-10-02-free-cloud-foundation.md](docs/superpowers/plans/2026-10-02-free-cloud-foundation.md) — 免费云同步实施计划
- [docs/superpowers/specs/2026-10-02-free-cloud-design.md](docs/superpowers/specs/2026-10-02-free-cloud-design.md) — 设计 spec
