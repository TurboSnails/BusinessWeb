# 免费云基础设施设计

用户已授权制定计划并直接实施。目标：沿用 React/Vite/TypeScript，使个人项目可部署到 Vercel 免费版，并让既有独立云同步入口支持自有 Supabase 免费项目。

## 架构和边界

- 默认构建使用根路径；GitHub Pages 使用显式 `/BusinessWeb/` 构建。Router 与资源使用同一 base。
- Vercel 使用 Node 24，API 和静态资源优先匹配文件系统，页面路由回退到 index.html。
- 网格行情通过固定目标的 Vercel Functions 获取腾讯 K 线/报价，禁止任意 URL 代理。本地 Vite 使用相同接口路由，Pages 构建保留直连。行情失败不伪造数据。
- 现有新浪代理增加方法、参数、超时和 GBK 解码检查。
- Supabase 只保存独立 BusinessWeb 记录快照；通过服务端 secret key 访问，客户端只持有独立同步 token。默认不配置、不自动同步。
- GET 返回 schemaVersion=1、records 和 ETag；PUT 校验记录结构并使用 If-Match 进行数据库原子版本比较，不一致返回 409，客户端保留本地记录。
- 新 Supabase 表启用 RLS；仅 service_role 可执行同步 RPC。没有凭证时 API 返回 503，不产生数据库请求。
- R2 待有附件需求时实施，当前无上传业务，不创建空壳模块。
- 不创建账号、发布站点或写入现有云端数据库。提供新建独立项目的 SQL 和配置说明。

## 验收

根路径/Pages 构建成功，现有测试与类型检查通过；API 参数错误、上游失败/超时、GBK 报价、云同步未配置/未授权/冲突都有验证。生产静态产物不得包含服务端密钥。
