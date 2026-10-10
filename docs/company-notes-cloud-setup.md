# 公司研究笔记云端配置

公司笔记面向所有访客公开阅读，主人用编辑 token 上传和修改。保存即公开。与 `/knowledge` 私人知识库使用独立表和接口，不改变私人资料授权。

## 上线配置

1. 在现有 BusinessWeb Supabase 项目的 SQL Editor 执行 `supabase/migrations/202610090001_company_notes.sql`。迁移创建独立表及版本比较函数，不修改已有候选池、知识库或交易数据。
2. 托管服务复用 `SUPABASE_URL` 和 `SUPABASE_SECRET_KEY`，新增服务端环境变量 `COMPANY_NOTES_WRITE_TOKEN`，使用至少 32 字符的随机独立 token。不要使用 `VITE_` 前缀，也不要复用数据库密钥或知识库同步 token。实际 token 不提交到 Git、不放进 URL、不发到聊天。
3. 部署 Vercel API 与前端。GitHub Pages 需要同时更新前端并通过现有 `VITE_API_BASE` 调用 Vercel 接口。添加环境变量后重新部署才生效。
4. 本地 `npm run dev` 将 `/api/company-notes` 代理到线上 Vercel；所以纯本地页面预览需先部署 API。运行 `vercel dev` 可以使用该环境中的 API，凭据需在其服务端配置。

没有编辑 token 时，已配置数据库的公开阅读仍可使用，编辑解锁返回未配置提示。数据库未配置时阅读显示服务配置错误，不以本机保存冒充云端成功。

## 使用

- 候选池或公司详情页点击“研究笔记”。
- 所有人可查看列表、阅读与下载 `.md`，可通过 `?note=<uuid>` 分享具体笔记。
- 主人点击“解锁编辑”并输入 token，随后可以新建、用模板新建、上传 `.md` 或编辑已有笔记。
- 文件必须是 UTF-8 `.md`，单篇最多 1 MiB。上传先生成草稿，点击“保存并公开”后才写入云端。
- 多设备同时修改发生冲突时不会覆盖已有内容；先下载草稿，再点击“重新加载云端版本”核对和继续修改。
- token 仅保存在当前浏览器会话；“锁定编辑”清除它。未保存草稿也只在本会话暂存，更换设备或清除浏览器数据无法恢复，必要时下载 MD。
- 首版不上传图片/PDF，不自动同步到 Obsidian，不提供删除操作。Markdown 中相对附件路径不会自动上传关联文件。

## 上线验收

在无 token 的隐私窗口打开笔记链接，确认列表和正文公开可读、编辑不可用。输入错误 token 应拒绝解锁。主人解锁后上传一篇 MD、预览并保存；另一设备无 token 刷新后应读到原文。编辑保存后重新加载应读到新内容和递增版本。两窗口先读取同一版本，窗口 A 保存后窗口 B 保存应收到冲突，且 B 的草稿仍在。

## 本地验证

`npm test -- --run src/features/company-notes src/components/CandidatePool.test.tsx`

`npm run typecheck`

`npm run test:functions`

`npm run build`
