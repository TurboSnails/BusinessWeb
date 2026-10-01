# 免费部署与可选云同步

## 当前技术栈

React + Vite + TypeScript + React Router；Vercel 托管静态页面及 Node 24 Functions。Supabase 仅用于可选的独立网格记录同步。记录默认保存在浏览器，启用同步前建议导出 JSON 备份。

R2 暂未接入：当前没有附件上传业务。将来需要图片、PDF 等文件时，再接入 R2 并在 Supabase 保存文件元数据。

## 本地开发

```bash
npm ci
npm run dev
```

使用 Node 24。Vite 开发服务器实现 `/api/grid-market`，可直接运行网格行情。`/api/grid-sync` 是 Vercel Function，本地调试该接口需使用 Vercel CLI 的 `vercel dev`，并将服务端变量保存在忽略的 `.env.local`。普通 `npm run dev` 不启动 Supabase 同步接口。

```bash
npm test -- --run
npm run test:functions
npm run typecheck
npm run build
```

## 部署 Vercel 免费项目

1. 将代码推送到自己的 BusinessWeb GitHub 仓库。
2. 在 Vercel 导入该仓库，Root Directory 选择包含 `package.json` 的目录。
3. Framework 为 Vite；Build Command 为 `npm run build`；Output 为 `dist`；Node 为 24.x。
4. 初次部署不用填写 Supabase 变量，页面和本地记录即可工作。
5. 验证首页、`/grid-trading`、`/grid-trading/records` 和详情链接直接访问及刷新。
6. 打开 `/api/grid-market?kind=quotes&symbols=sh510300`，应返回腾讯行情文本。错误 `/api/...` 应为 404，而不是页面 HTML。

Vercel Hobby 适用个人非商业用途；实际额度和用途限制以官方页面为准：
https://vercel.com/docs/plans/hobby

## 启用自有 Supabase 免费同步

这是单人/同一拥有者多设备的手动同步，使用专用 token；目前不是多用户登录系统。

1. 新建**独立 BusinessWeb** Supabase Free 项目，不使用其他项目的数据库或 token。
2. 在 SQL Editor 执行 `supabase/migrations/202610020001_grid_sync.sql`。脚本幂等，重复执行不清空记录。
3. 在 Supabase 的 API Keys 中取得服务端 secret key（`sb_secret_...`）；也兼容 legacy service_role JWT。不要使用 publishable/anon key 代替。
4. 为同步创建随机 token，可本地运行：

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

5. 在 Vercel Environment Variables 中设置以下**服务端变量**，然后重新部署：

   | 变量 | 内容 |
   |---|---|
   | `SUPABASE_URL` | 新项目的 `https://<project-ref>.supabase.co` 地址 |
   | `SUPABASE_SECRET_KEY` | 新项目 secret key |
   | `GRID_SYNC_TOKEN` | 随机专用 token，至少 32 字符 |

   不要加 `VITE_` 前缀，不要将密钥提交 Git。建议只为 Production 设置凭证，避免 Preview 与正式站点共用交易数据。

6. 网站的网格记录页中，手动填写独立同步地址 `https://<你的站点>/api/grid-sync` 与专用 token，确认目标域名并保存。
7. 点击立即同步。新设备使用相同地址/token。Supabase key 不进入浏览器；token 保存在本机，JSON 导出不包含 token。

同步 GET 返回快照与 ETag，PUT 使用 If-Match 进行原子版本检查。发生并发更新时返回 409，本地数据保留，重新同步即可。相同时间但内容不同的记录仍需按照界面提示解决冲突。每次同步最多 500 条记录（含删除标记），请求体最多 3 MB；达到限制时先导出备份。

表启用 RLS，匿名与登录用户没有直接读取权限，只有服务端 service_role 可以读写。不要将同步 token 分享给其他用户：持有者拥有该独立快照的读写权限。

## 保留 GitHub Pages

```bash
npm run build:pages
npm run deploy
```

此构建显式使用 `/BusinessWeb/` 资源和 Router 路径，并生成详情路由回退页面。GitHub Pages 不运行 Functions，所以网格行情保留直接访问腾讯（受浏览器 CORS 限制），本次 Vercel 同步接口仅支持同源访问，Pages 网站不能直接跨域使用该接口；如保留 Pages 并需要云同步，需另外配置支持 CORS 的独立同步服务。

## 仍需独立处理的接口

- 首页/市场脉搏等原有 `src/services/api.ts` 中的 Yahoo、东方财富等接口仍沿用公共代理；本次替换的是网格交易行情。不保证所有公开数据源长期稳定。
- AKTools 需要 Python 服务，当前未部署，Vercel 不会自动运行本地的 `127.0.0.1:8080`。如需使用，配置可访问的 `VITE_AKTOOLS_BASE_URL`。
- 免费 Supabase 的暂停与用量限制可能影响同步，失败时本地记录继续可用。
- 当前交付代码与配置，未创建云账号、执行远端 SQL、设置线上密钥或发布站点。实际云端路由与数据库权限需部署后按上文验证。

参考：
https://vercel.com/docs/frameworks/frontend/vite
https://supabase.com/docs/guides/getting-started/api-keys
https://supabase.com/docs/guides/database/postgres/row-level-security
https://developers.cloudflare.com/r2/pricing/
