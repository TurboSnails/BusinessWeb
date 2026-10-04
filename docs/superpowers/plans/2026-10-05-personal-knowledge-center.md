# 个人知识中心 Implementation Plan

> 执行方式：用户已授权自行计划并持续执行；使用 executing-plans 在当前会话实施，不再请求阶段性批准。

**Goal:** 新增可与 Obsidian 共用真实 Markdown 的个人知识中心，并提供本地 Agent MCP 入口。

**Architecture:** 独立 Node Vault 服务负责文件及关系解析，HTTP 与 stdio MCP 共用它。React 页面经仅允许本机来源的开发代理访问 HTTP；私有 Vault 与访问凭据不进入公开构建。

**Tech Stack:** React、TypeScript、Node 24、Vitest、Node test、官方 MCP SDK。

**Spec:** `docs/superpowers/specs/2026-10-05-personal-knowledge-center-design.md`

## Global Constraints

- Markdown 为笔记正文唯一来源；索引从文件重建。
- 私人 Vault 默认位于被 Git 忽略的 `.local/SecondBrain`，可以指定现有绝对路径。
- 原有功能不迁移、不自动改写。
- 用户授权持续执行；本机 Git 因 Xcode 许可证不可用，不修改系统配置，不提交或推送。

## Review Focus

- 同一笔记被网页、Obsidian 或多个 MCP 进程修改：旧版本拒绝覆盖，保留草稿。
- 路径穿越、隐藏目录、符号链接：拒绝越界并不读取私人配置。
- 重名、别名、标题片段：明确歧义，不错误连接同名笔记。
- 服务掉线、请求乱序、切换笔记：错误不丢草稿、不显示虚假保存状态。
- 公网部署与局域网访问：不公开 Vault、令牌或本地文件 API。

### Task 1: Vault 文件与关系服务

**Files:** `server/knowledge/vault.mjs`、`links.mjs`、`vault.test.mjs`。
**Interface:** `createVault(root)` → `init/status/list/search/read/write/append/related`；读写返回 `{path,content,version,title}`；版本为 SHA-256，创建版本为 null。

- [x] 写临时目录测试：真实文件读写/搜索、外部修改冲突、并发、路径越界、符号链接、链接歧义。
- [x] 运行 `node --test server/knowledge/vault.test.mjs`，确认新增接口缺失造成失败。
- [x] 实现限制在 Vault 内的文件操作、原子写、跨进程文件锁及 wikilink 解析。
- [x] 重跑测试，确认通过。

### Task 2: 本地 HTTP 与启动入口

**Files:** `server/knowledge/http.mjs`、`index.mjs`、`http.test.mjs`；`scripts/knowledge-app.mjs`；`vite.config.js`、`package.json`、`.gitignore`。
**Interface:** `/api/knowledge/{status,notes,note,search,related,inbox}`；JSON 请求、版本字段、有限请求体、Bearer 认证；仅绑定 `127.0.0.1`。

- [x] 测试认证、来源拒绝、保存冲突、Inbox 追加及服务失败。
- [x] 运行 HTTP 测试确认失败；实现并重跑。
- [x] 启动命令自动共享仅服务端可见的随机令牌；开发代理拒绝非本机来源和连接。

### Task 3: 页面与导航

**Files:** `src/features/knowledge/{api.ts,KnowledgeWorkspace.tsx,knowledge.css}`、`src/pages/KnowledgeCenter.tsx`、页面测试、`src/App.tsx`、`src/data/siteMap.ts`、导航测试、`tsconfig.knowledge.json`。
**Interface:** 页面使用 Task 2 的 HTTP JSON 接口；API 错误展示人类可读信息；保存与追加携带版本。

- [x] 写页面测试：断线说明、读写、失败保留草稿、关系、搜索、导航六项。
- [x] 运行相关 Vitest，确认失败。
- [x] 实现目录、列表、编辑、搜索、每日 Inbox、关系与连接状态；处理脏草稿、冲突和请求乱序。
- [x] 运行页面测试、新模块严格类型检查与生产构建。

### Task 4: 本地 MCP 与使用文档

**Files:** `server/knowledge/{mcp.mjs,mcp.test.mjs}`、`docs/knowledge-local-setup.md`、README、包依赖和锁文件。
**Interface:** `search_knowledge/read_note/find_related_notes/write_note/append_note`；所有写工具要求读取版本，创建明确使用 null。

- [x] 核对官方 SDK 文档并安装锁定的依赖；写真实 MCP 客户端测试。
- [x] 运行测试确认缺少服务；实现 stdio MCP 并验证 tools/list、读取、保存及冲突。
- [x] 写启动、现有 Vault 配置、Agent 配置样例和后续云接入边界。
- [x] 完整前端测试、知识服务测试、现有类型检查、新模块类型检查与构建。

## 执行记录

按任务更新；不把未来云阶段标为已经完成。


### 最终验证（2026-10-05）

- 前端完整测试：64 文件、349 项通过。
- 知识服务：17 项通过，包括真实 MCP、多个 Agent 并发、Vault 身份和直接文件 URL 拒绝。
- `npm run typecheck` 全部通过，包含新增知识模块。
- `npm exec -- vite build` 生产构建通过；产物不含私人 Vault 文件或已创建笔记正文。
- 浏览器验证新建、保存、阅读、Inbox、链接与手机导航；390px 视图无页面横向溢出。
- 独立审查的 3 项 Important 已修正并通过回归测试；同时修正既有异常文件名影响列表、带点笔记名解析和模板换行。
- `npm run build` 的既有 Git changelog 前置步骤受 Xcode 许可证阻挡，未提交或推送。
- Supabase、R2、远程 MCP 和自动整理仍为后续阶段，详见本地使用说明。
