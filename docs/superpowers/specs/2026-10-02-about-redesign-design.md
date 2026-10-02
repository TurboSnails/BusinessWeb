# About 页面改造 + 自动 changelog 设计

用户已授权按方案 A 实施：站点介绍（手写）+ 自动 changelog（构建时生成 JSON）。目标是把 `src/pages/About.tsx` 从 12 行占位符替换为与首页同等质感的"关于"页，同时让版本更新可见。

## 背景与约束

- `src/pages/About.tsx` 当前只有 12 行占位文本，与首页"段永平思想精髓"玻璃卡片、其他 module 页风格不一致。
- Header 已将 `/about` 作为正经导航项（`src/components/Header.tsx:47`）。
- 仓库当前无 git tag，脚本必须宽容运行。
- Vite + React + TypeScript，部署到 Vercel 静态 + GitHub Pages 静态。

## 页面结构

About.tsx 重写为两个区块，沿用首页 `main.container`，maxWidth 1100px：

1. **站点介绍区**：glass 卡片，5 段（站点初衷 / 覆盖范围 / 方法论 / 免责声明 / 反链）。
2. **更新日志区**：glass 卡片，fetch `changelog.json` 渲染。

风格复用首页常量：
- 卡片：`background: var(--bg-card)`、backdropFilter blur(30px)、padding 32px、radius lg、shadow md、border 1px 白。
- 标题 h2：1.5rem、700、text-primary。
- 次级文字：text-secondary。

## 站点介绍内容

1. **站点初衷**：1-2 句。"Hassan 投资工作台 —— 把分散在 Notion / Excel / 券商 App 里的标的、网格记录、监控指标，集中到一个移动优先的工作台。"
2. **覆盖范围**：4 个 bullet（美股 / 大陆 / 网格 / 监控脉搏）。
3. **方法论**：1 段，链回首页 `/`（首页段永平卡片当前无 id 锚点，因此仅路由跳转，不做 hash 定位）。
4. **免责声明**：警示色（var(--system-red)）1 行，"内容仅为个人研究记录，不构成投资建议；过往业绩不代表未来表现。"
5. **反链**：保留首页已有的 `cuchiscastagne277-crypto.github.io/website` 外部链接，与首页 footer 一致。

## changelog 数据模型

文件路径：`public/changelog.json`。

```json
{
  "generatedAt": "ISO-8601",
  "versions": [
    {
      "tag": "v1.2.0",
      "date": "2026-09-30",
      "commits": [
        { "hash": "abc1234", "subject": "feat: 首页段永平卡片", "author": "Hassan", "date": "2026-09-30" }
      ]
    },
    { "tag": "unreleased", "date": null, "commits": [ ... ] }
  ]
}
```

约束：
- `versions` 至少 1 个；无 tag 时全部归入 `unreleased`。
- 每个 `versions[i].commits` 不限条数；总条数被脚本截到 30。
- `generatedAt` 写入脚本运行时刻。

## 生成脚本

文件：`scripts/generate-changelog.mjs`（纯 ESM，使用 `node:child_process` 跑 git）。

流程：
1. `execSync('git tag --sort=-creatordate --format=%(refname:short)|%(creatordate:iso-strict)', { encoding: 'utf8' })`，解析出 `[{ tag, date }]`。
2. `execSync('git log --pretty=format:%h|%s|%an|%ad|%H --date=short -n 30', { encoding: 'utf8' })`，解析出 30 条 commit。
3. 按 tag 切分：每个 commit 找到其上方最近的 tag，归属该 tag 桶；无 tag 覆盖的归 `unreleased`。
4. `fs.writeFileSync(path.resolve(__dirname, '..', 'public', 'changelog.json'), JSON.stringify({ generatedAt, versions }, null, 2))`。

错误处理：
- `git` 命令失败（非 0 exit）→ 抛错，build 失败。
- 当前目录不是 git 仓库 → 抛错，build 失败。
- 0 条 commit → 仍写出 `versions: [{ tag: 'unreleased', date: null, commits: [] }]`，不报错。

无新增依赖（仅 `node:` 内置模块）。

## 构建集成

`package.json` 改 `scripts.build`：

```json
"prebuild": "node scripts/generate-changelog.mjs",
"build": "vite build"
```

`prebuild` 由 npm 自动在 `build` 之前执行。dev 模式不跑（不污染热更新）。

## About 组件渲染

文件：`src/pages/About.tsx`。

数据获取：
- `useEffect` 内 `fetch(import.meta.env.BASE_URL + 'changelog.json')`。
- 三个状态：`loading` / `error` / `data`。
- `error`：显示一行"日志加载失败"+ 重试按钮（`onClick` 重置 effect 重新 fetch），不暴露堆栈。
- `loading`：3 行骨架占位（脉冲灰背景动画，CSS keyframes 已在 `index.css` 现有 `@keyframes fadeInScale` 基础上新增 `@keyframes shimmer`，占位 div 用 `background: linear-gradient(90deg, var(--system-gray6), var(--system-gray5), var(--system-gray6))` + `animation: shimmer 1.4s infinite`）。
- `data`：每个 version 一段：
  - 标题：tag（如 `v1.2.0`），unreleased 显示 `Unreleased`。
  - 右侧日期右对齐。
  - commit 列表：`<li>` 行内 `monospace` 短 hash（`abc1234`）+ ` · ` + 主题。
- 容器：`min-height: 200px` 防加载闪烁导致页面跳。

## 测试

脚本测试（`scripts/generate-changelog.test.mjs`，用 `node --test`）：
- 在临时 git 仓库跑脚本：建几个 commit + 1 个 tag，断言生成的 JSON 满足：
  - `versions.length >= 1`
  - `versions[0].tag` 等于最近 tag
  - `commits.length === 30`（除非总 commit < 30）
- 无 tag 场景：`versions.length === 1 && versions[0].tag === 'unreleased'`。

组件测试（`src/pages/About.test.tsx`，vitest + @testing-library/react）：
- 加载中显示 3 行骨架。
- fetch 成功显示 tag 和 commit 文本。
- fetch 失败显示重试按钮。
- mock `globalThis.fetch`。

不测样式像素。

## 不做的事

- 不引入 changelog 第三方库（无 conventional commits 解析）。
- 不改首页段永平卡片。
- 不改 vite.config.js、vercel.json。
- 不在 About 引入 commit 语义分类（feat/fix 徽章）。
- 不为 changelog 写后端 API。

## 验收

- `npm run prebuild` 单独能跑、产出 `public/changelog.json`。
- `npm run build` 成功，dist 包含 `changelog.json`。
- `npm test` 全部通过。
- 视觉与首页"段永平思想精髓"卡片同级（玻璃质感、padding、阴影一致）。
- Header 中"关于"链接（`/about`）点击进入新页面，包含站点介绍 + 更新日志两块。

## 风险

- 仓库当前 0 个 tag，所有 commit 会聚到 `unreleased`；需要后续手动 `git tag v0.1.0` 才能分桶 —— 已与用户确认。
- `public/changelog.json` 进入 git 后会成为噪音（每次 build 变化）；提交策略：脚本不写入 git，由 `.gitignore` 忽略，但保留 `public/changelog.json.example` 占位 —— 已确认无需 example。
- 改用 `prebuild` 后，本地 `vite dev` 不跑脚本，访问 About 会 404 changelog —— 接受；用户需要先 build 一次或手动复制。
