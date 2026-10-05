# Own-server Obsidian Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 多台桌面电脑通过 Obsidian 插件同步现有 Supabase 中的 Markdown，同时保留离线编辑和冲突内容。

**Architecture:** 插件连接现有 Vercel API，每次下载绑定一个不可变 generation。纯同步引擎比较基线、本地和远端；现有快照发布接口负责原子切换版本。服务端稳定资料库身份独立于本机路径。

**Tech Stack:** 现有 Node 24、TypeScript、Vercel、Supabase PostgreSQL；桌面 Obsidian 插件使用官方 API，独立构建目录。

**Spec:** `docs/superpowers/specs/2026-10-05-knowledge-own-server-sync-design.md`

## Global Constraints

- 沿用现有服务器和数据库，不购买 Obsidian Sync，不迁移现有生产正文。
- 首版同步 Markdown 正文和目录；不宣称同步图片/PDF 原件。
- 首次取回完成前禁止发布空本地快照。
- 两方不同修改或删除与编辑冲突时，保留正文副本供用户处理，并显示冲突，不静默覆盖。
- Supabase 管理密钥仅保存在服务端；日志和插件包不包含访问凭据。
- 保留现有未提交改动；实现时创建隔离工作树，检查并纳入相关已有改动，不能重置或覆盖当前工作区。
- 生产阶段先读取并备份当前快照，再执行迁移、部署和首次下载。

## Review Focus

- 新设备的空文件夹和未完成初始化不得触发远端清空（Task 3、5）。
- HTTP 发布成功但响应丢失，重启后不得重复应用或错误更新基线（Task 4）。
- macOS/Windows 大小写和 Unicode 路径冲突必须在任何文件写入前被发现（Task 2、4）。
- 用户在下载期间继续编辑，写入前重新检测本地哈希，保留新内容（Task 4）。
- 同步操作产生的文件事件不能反复触发上传，插件卸载必须停止任务（Task 5）。

## 文件与边界

- `server/knowledge/sync-contract.ts`：清单、笔记、发布类型与共享路径/哈希校验。
- `server/knowledge/cloud-sync.ts`：固定快照读取与同步认证接口。
- `api/knowledge.ts`：路由新增同步接口，保留只读网页/MCP。
- `supabase/migrations/202610050002_knowledge_sync.sql`：正文完整性和空快照发布规则。
- `knowledge-sync/merge.ts`：不依赖文件系统的三方合并计划。
- `knowledge-sync/transport.ts`：分页、超时、重试与服务端错误。
- `knowledge-sync/engine.ts`：同步事务、下载/发布、基线提交。
- `obsidian-plugin/src/vault-adapter.ts`：Obsidian Vault API、恢复日志和冲突副本。
- `obsidian-plugin/src/main.ts`、`settings.ts`：设置、连接、状态、调度、卸载。
- `obsidian-plugin/manifest.json`、`package.json`、`build.mjs`：独立插件构建；插件 ID 为 `businessweb-knowledge-sync`，桌面限定。
- `docs/knowledge-obsidian-sync.md`：安装、连接和恢复步骤。

### Task 1: 服务端同步协议和原子发布

**Files:** 新建 `server/knowledge/sync-contract.ts`、`cloud-sync.ts`；修改 `api/knowledge.ts`；新建 SQL 迁移；扩充 `src/features/knowledge/cloud-handler.test.ts`；新增 `server/knowledge/sync-contract.test.ts`。

**Interfaces:** `SyncHead = { revision: number; generation: string | null; vaultId: string | null }`；`SyncNote = { path: string; content: string; version: string }`；`SyncManifest = { head: SyncHead; notes: { path: string; version: string }[]; nextCursor: string | null }`。所有读接口强制传入已选 generation。

- [ ] 写失败测试：同步凭据可读/发布、网页/MCP 凭据不能发布；路径穿越与伪造哈希返回 400；未知或未发布 generation 拒绝读取；请求绑定旧 generation 时不混入新版本；空快照可以在正确 revision 下发布。
- [ ] 运行 `npm test -- --run src/features/knowledge/cloud-handler.test.ts server/knowledge/sync-contract.test.ts`，确认新行为失败。
- [ ] 增加独立 `KNOWLEDGE_SYNC_TOKEN`，至少 32 字符且不同于现有凭据。未配置时只禁用新同步接口，不影响旧只读功能。
- [ ] 新增 `sync-head`、`sync-manifest`、`sync-note`、`sync-batch`、`sync-commit` 路由；清单每页最多 200 条，游标按 path 排序，正文单篇仍为 1 MiB，批次仍小于 3 MB。首个发布使用客户端生成并持续保存的 UUID；已有资料库沿用 head 的共享身份。
- [ ] SQL 新增同步发布 RPC，保留旧上传 RPC 兼容；服务器校验 sha256 正文、共享身份、规范路径、唯一节点及边引用。允许空快照；CAS 失败返回 409，已发布 generation 不可写，旧快照保持可读。
- [ ] 在临时 PostgreSQL 实例运行新旧迁移并验证并发 CAS、伪造哈希、空快照、旧快照读取及角色授权。
- [ ] 重跑上述测试、`npm run typecheck`；结果全通过后单独提交服务端改动。

### Task 2: 纯三方合并模块

**Files:** 新建 `knowledge-sync/merge.ts`、`merge.test.ts`。

**Interfaces:** `mergeNotes(base: Map<string, SyncNote>, local: Map<string, SyncNote>, remote: Map<string, SyncNote>): MergePlan`；`MergePlan = { merged: Map<string, SyncNote>; conflicts: { path: string; local: SyncNote | null; remote: SyncNote | null }[] }`。

- [ ] 写失败测试并断言：不同路径双边修改全部保留；相同正文无冲突；同路径不同正文冲突；删除/编辑冲突；删除/不变采用删除；重命名不覆盖远端修改；无基线同路径不同正文冲突。
- [ ] 运行 `npm test -- --run knowledge-sync/merge.test.ts`，确认失败。
- [ ] 实现合并；存在任一冲突时引擎暂不发布，客户端先保留双方正文并提示处理。比较缺失和内容哈希，不使用设备时间裁决。
- [ ] 加入路径规范化预检：NFC + 大小写折叠的路径碰撞返回明确错误；不同文件内容不能因规范化被合并丢失。
- [ ] 重跑合并测试通过后单独提交。

### Task 3: 固定快照下载与首次恢复

**Files:** 新建 `knowledge-sync/transport.ts`、`transport.test.ts`、`engine.ts`、`engine.test.ts`。

**Interfaces:** `SyncRemote` 提供 `head(): Promise<SyncHead>`、`manifest(head, cursor): Promise<SyncManifest>`、`read(head, path): Promise<SyncNote>`、`publish(expectedHead, notes): Promise<SyncHead>`；`VaultAdapter` 提供 `list()`、`read(path)`、`apply(plan)`、`loadState()`、`saveState(state)`。`SyncState` 包含资料库身份、成功 head、正文基线、未完成事务；凭据不进入该状态。

- [ ] 写失败测试：超过 200 篇全部下载；下载中 head 改变仍保持固定 generation；正文哈希错误、重复路径、缺页或重复游标拒绝应用；首次空本地目录下载后不发布；有本地独有内容时保留；失败后基线仍未初始化。
- [ ] 运行 `npm test -- --run knowledge-sync/transport.test.ts knowledge-sync/engine.test.ts` 确认失败。
- [ ] 实现 HTTPS endpoint 校验、30 秒请求超时、禁止重定向、有限并发下载和哈希验证；接口错误不包含凭据。
- [ ] `syncOnce(remote: SyncRemote, vault: VaultAdapter): Promise<SyncResult>` 先完整读取远端、预检所有路径，再合并和应用；只有完整成功才记录基线。没有基线的首轮先恢复，不发布。
- [ ] 重跑测试通过后提交；这一步可独立验证现有云端向空仓库恢复。

### Task 4: 双向发布、事务恢复和并发保护

**Files:** 扩充 `knowledge-sync/engine.ts`、`engine.test.ts`；新建 `obsidian-plugin/src/vault-adapter.ts`、`vault-adapter.test.ts`。

**Interfaces:** Task 3 的 `VaultAdapter.apply(plan)` 采用写前哈希检查；事务包含操作原文、目标哈希和发布 generation。`SyncResult = { status: 'synced' | 'conflict' | 'offline'; conflicts: string[]; head: SyncHead | null }`。

- [ ] 写失败测试：A/B 修改不同笔记最终都存在；CAS 409 重新读/合并最多 3 次；发布响应丢失后查询 head 确认；写文件中断后恢复；下载期间用户编辑不覆盖；删除进入可恢复目录；冲突副本名称不碰撞已有笔记。
- [ ] 运行引擎和 adapter 测试确认失败。
- [ ] 实现事务日志先落盘再修改文件，状态通过临时文件原子替换；插件 adapter 仅使用 Vault API 操作笔记，插件私有状态位于自身目录，不同步 `.obsidian`。
- [ ] 冲突时保持本地原文，把远端正文写入 `Sync-Conflicts/` 唯一副本并记录该冲突；未处理时暂停发布，冲突副本排除自动上传。对远端删除记录可读说明；用户显式选择版本后解除冲突。
- [ ] 上传当前合并后的完整快照并原子发布。确认服务器 head 已接受后保存基线；本地应用前再次检测变化，发生变化时退出并重新计算，不覆盖用户正在编辑的文件。
- [ ] 同一任务串行，发布超时查自身 generation；有限恢复失败后保留事务和错误说明。
- [ ] 重跑测试通过后提交。

### Task 5: 桌面 Obsidian 插件和生产恢复

**Files:** 新建插件构建、manifest、`src/main.ts`、`settings.ts`、`main.test.ts`；更新 `.env.example` 与 `docs/knowledge-obsidian-sync.md`。

**Interfaces:** `KnowledgeSyncPlugin` 初始化 Task 3/4 引擎；设置字段 `endpoint`、`syncToken`、`pollSeconds`，默认检查间隔 30 秒，本地事件防抖 2 秒。插件卸载注销事件并中止网络任务。

- [ ] 写失败测试：未配置凭据不联网；启动先恢复再上传；自身写入事件不产生回环；重复事件合并成一次任务；卸载后没有定时/网络任务；断网提示后能恢复同步。
- [ ] 运行插件测试确认失败。
- [ ] 实现设置界面、连接测试、立即同步、冲突列表和状态提示，文案固定包含“仅笔记同步，图片/PDF 尚未同步”。凭据输入隐藏；插件设置包含凭据的事实在连接说明中明确。
- [ ] 实现独立插件构建，将同步核心打包进 `main.js`，发布包只含 `main.js`、`manifest.json`、必要样式和说明，不含本地配置。安装到两个临时 Vault，在真实 Obsidian 验证下载安装、双向编辑、冲突和离线恢复。
- [ ] 运行相关测试及 `npm run test:knowledge`、`npm run typecheck`、`npm run build` 和插件 build；仅对本次相关失败修复，不覆盖工作区其他改动。
- [ ] 生产连接前寻找已有授权的访问配置，凭据不打印；认证读取 head 与完整正文，下载到独立备份目录并校验清单/哈希。认证失败时停在连接步骤，不能假定生产没有数据。
- [ ] 应用经过验证的迁移，配置同步凭据并部署现有服务；不运行旧的空目录全量上传。先把生产笔记恢复到当前 `SecondBrain`，核对正文数量/哈希后安装并启用插件。
- [ ] 验证网页与 Obsidian 展示同一篇实际笔记；首次恢复成功前保持自动上传关闭。向用户报告笔记数量、同步状态、附件限制和备份位置后提交最终改动。

## 执行方式

推荐由当前代理在本会话逐项实施，最后独立审查整个同步变更。该计划各任务共享协议和基线语义，顺序实现更便于验证两台设备的实际行为。实施前需用户审阅本计划并选择执行方式。
