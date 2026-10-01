# 免费云基础设施实施计划

> 执行方式：当前会话直接实施，用户已要求做好计划并开始。使用 executing-plans 按任务执行。

**Goal:** 完成免费部署基础和可选 Supabase 同步服务。
**Architecture:** React SPA + 固定目标行情 Functions + Supabase REST/RPC。保留本地优先的记录存储。
**Tech Stack:** React、Vite、TypeScript、Node 24、Vercel、Supabase PostgreSQL。
**Spec:** ../specs/2026-10-02-free-cloud-design.md

## 全局约束

默认本地模式；密钥只在服务端；只使用独立 BusinessWeb 数据库；R2 当前不接入；不发布云端。

## 验证重点

API 不得成为任意 URL 代理；无凭证不联网；同步版本冲突不得写回本地；报价 GBK 字节正确解码；Pages 与根路径路由一致。

### Task 1：部署基础

- [x] 修复锁文件，安装依赖，运行基线测试。
- [x] 修改 vite.config.js、App.tsx、package.json、vercel.json；默认根路径，build:pages 显式设置 Pages 路径。
- [x] 构建两种目标，检查 index.html 的资源路径。

### Task 2：网格行情服务

Files: api/grid-market.js、api/china-stock.js、server/market.mjs、src/features/grid-trading/marketData.ts、src/services/marketApi.test.ts。

Interface: GET /api/grid-market?kind=candles&symbol=sh510300&begin=YYYY-MM-DD&end=YYYY-MM-DD 或 kind=quotes&symbols=sh510300,sz159915。日线返回 JSON；报价保留 GBK 字节供现有解析器解码。

- [x] 先编写方法/参数限制、上游错误、固定目标、报价字节和超时测试，并观察失败。
- [x] 实现受限代理、缓存响应和本地 Vite 中间件；前端默认同源访问，Pages 构建直连。
- [x] 验证新增测试和现有行情测试。

### Task 3：可选 Supabase 同步

Files: api/grid-sync.ts、supabase/migrations/202610020001_grid_sync.sql、src/services/gridSyncApi.test.ts、cloudSync.ts、cloudSync.test.ts。

Interface: GET /api/grid-sync 返回 {schemaVersion:1,records} 和 ETag；PUT 相同 payload，要求 If-Match；专用 GRID_SYNC_TOKEN 认证。

- [x] 先编写未配置、未授权、无效数据、读写、版本冲突测试，并观察失败。
- [x] 实现 REST 读取、RPC 原子条件写入；客户端传递 GET 的 ETag。
- [x] 写迁移：独立表、初始空快照、RLS、service_role 专用 RPC。
- [x] 验证同步测试和既有隐私测试。

### Task 4：交付和验证

- [x] .env.example、忽略规则、README 和部署指南写明免费方案、配置和未接入项。
- [x] npm ci、完整测试、typecheck、根路径/Pages build、git diff --check。
- [x] 记录实际结果和云端未验证限制。

## 执行记录

- 实施分支：`feat/free-cloud-foundation`；部署分支：`deploy-free-cloud`，代码已推送 GitHub。
- 初始基线：18 个测试文件、99 项测试通过；既有网格类型检查通过。
- 修复原锁文件缺失的 esbuild/平台依赖；`npm ci --offline --no-audit --no-fund` 成功。
- 最终：20 个测试文件、117 项测试通过；网格及新增服务端类型检查通过。
- 根路径与 Pages 构建通过；检查资源 base、Pages 回退入口与静态产物中无服务端密钥标识。
- 本地 HTTP：首页、网格页与详情路径返回 HTML 200；非法行情参数返回 400；腾讯真实行情返回 200，GBK 中文正确解码。
- 独立审查未发现新增 API/SQL/路由的确定阻断问题；发现并修复既有 stale React props 覆盖本地新记录的漏洞，新增回归测试先失败后通过。
- 通用旧同步入口仍支持至少 16 字符的其他独立服务 token；新 Supabase 服务要求 32 字符，部署指南推荐生成 64 字符随机 token。
- 修复 Vercel 原生模块加载：package.json 声明 ESM，服务端验证器导入使用 `.js` 扩展名。新增 `npm run test:functions`，验证原生 Node 加载编译后的函数；117 项测试、类型检查和构建再次通过。
- 插件仍有弃用警告，现有主 bundle 约 1.83 MB；构建成功，本次未改页面拆包。
- 正式站点：https://business-web-black.vercel.app/ 。2026-10-02 手动发布 `e87b2a5`，Vercel 生产部署显示 Ready / Current。
- `node scripts/check-deployment.mjs https://business-web-black.vercel.app` 六项通过：首页、网格页、详情路径 HTTP 200，未知 API 404，未配置同步 503，真实报价 200。
- Supabase 免费项目 BusinessWeb（`wrcxymsdfpgontzbxozt`）已创建，控制台状态 Healthy，区域 Mumbai。迁移在 SQL Editor 执行成功；远端检查：单例 id=1、revision=0、records=0、RLS=true，anon/authenticated 无 SELECT 权限，service_role 有 SELECT/UPDATE 权限。
- Vercel Production 三项变量 SUPABASE_URL、SUPABASE_SECRET_KEY、GRID_SYNC_TOKEN 已保存；密钥传输经用户授权，同步 token 由用户输入和提交。生产部署 `7yLCWyzahsLwWjiiuYXZzhCPwauP` Ready / Current；正式同步接口由未配置 503 变为未授权 401。
- 线上检查新增 JS/CSS MIME 检查，资源及原有六项通过。浏览器在部署切换时曾载入错误类型的脚本响应，重新导航后网格页和记录页正常显示。
- 用户保存网站同步配置并执行同步；页面显示“同步完成：0 条记录”。随后只读 SQL 核对：id=1、revision=1、record_count=0、updated_at=2026-10-01 17:37:21 UTC，确认认证、云端读取和条件写入已打通。当前本地无记录，实际验证使用空快照；非空记录合并和冲突保护已有自动化测试。
- Vercel 生产分支设置仍为 main，当前采用手动提升部署；自动跟踪 deploy-free-cloud 的设置变更待用户确认。
- R2 暂缓，当前无附件功能。Yahoo/东方财富等历史页面代理与 AKTools 服务不在此次替换范围，指南已注明。
