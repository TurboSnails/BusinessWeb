# Study01 React App

移动优先的 React + Vite 模板，支持手机与桌面访问。

快速开始

1. 安装依赖：

```bash
npm install
```

2. 在本机开发并允许局域网访问（便于手机访问）：

```bash
npm run dev
```

3. 在手机上打开（同一局域网）浏览器，访问：`http://<your-machine-ip>:5173`。

提示：`npm run dev` 已包含 `--host` 参数以允许局域网访问。如果需要指定端口，可以设置环境变量或使用 `vite --host --port 3000`。

构建与预览

```bash
npm run build
npm run preview
```

部署到 GitHub Pages

项目已配置为部署到 `https://turbosnails.github.io/BusinessWeb/`

1. 确保已安装 gh-pages（已在 devDependencies 中）：
```bash
npm install
```

2. 构建并部署：
```bash
npm run deploy
```

这会自动：
- 运行 `npm run build` 构建项目
- 将 `dist` 目录推送到 GitHub 的 `gh-pages` 分支
- 项目将在 `https://turbosnails.github.io/BusinessWeb/` 可访问

**重要配置说明：**
- `vite.config.js` 中设置了 `base: '/BusinessWeb/'`
- `App.tsx` 中设置了 `basename="/BusinessWeb"`
- 当前仓库为 `TurboSnails/BusinessWeb`，发布目标是其 `gh-pages` 分支。
- 构建会生成网格入口页面和 SPA 的 `404.html` 回退页面，支持直接访问和刷新详情路由。

文件

- [package.json](study01/package.json) — 项目依赖与脚本
- [vite.config.js](study01/vite.config.js) — Vite 配置
- [index.html](study01/index.html) — 入口 HTML
- [src](study01/src) — 源码

下一步建议：根据需求添加路由（React Router）、UI 框架（Tailwind / MUI）、以及 PWA 支持以获得更接近原生的移动体验。# BusinessWeb
