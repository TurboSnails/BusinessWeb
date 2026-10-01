# BusinessWeb

个人投资研究与网格交易工具，采用 React + Vite + TypeScript。

## 开发

使用 Node 24：

```bash
npm ci
npm run dev
```

## 验证

```bash
npm test -- --run
npm run test:functions
npm run typecheck
npm run build
```

`typecheck` 覆盖网格交易模块和新增同步服务端；历史页面暂不在该检查范围内。

## 部署

默认构建部署到 Vercel 根路径；GitHub Pages 使用 `npm run build:pages` 或 `npm run deploy`。

参见 [部署指南](docs/DEPLOYMENT.md)，包含 Vercel 免费项目、可选 Supabase 同步、环境变量和 GitHub Pages 的具体步骤。

网格记录默认保存在本机。云同步只有手动配置独立服务后才启用。当前没有 R2 上传功能。

[实施计划](docs/superpowers/plans/2026-10-02-free-cloud-foundation.md) · [设计说明](docs/superpowers/specs/2026-10-02-free-cloud-design.md)
