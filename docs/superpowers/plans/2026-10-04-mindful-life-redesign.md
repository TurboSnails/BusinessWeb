# 正念生活 站点重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把站点改成「正念生活」个人品牌站：5 项导航、「正念投资」栏目收纳全部旧页面、纸书茶室视觉，桌面和手机都可用。

**Architecture:** 一份站点地图数据（`src/data/siteMap.ts`）同时驱动顶部导航、面包屑、同组切换条和栏目页，旧路由一个不改。视觉靠 `index.css` 变量整体换色板，旧变量（`--system-blue` 等）映射到新色板，老页面无需改逻辑即换肤；外壳样式放进 `src/styles/shell.css`，用媒体查询而不是内联样式处理手机适配。

**Tech Stack:** React 18, React Router 6, Vite 5, TypeScript, Vitest + Testing Library, lucide-react。

**Spec:** `docs/superpowers/specs/2026-10-04-mindful-life-redesign-design.md`

## Global Constraints

- 工作目录 `/Users/hassan/Documents/workspace/gupiaoWS/BusinessWeb`，该目录本身是 git 仓库（根即此目录）。
- 所有旧路由路径保持可访问：`/valuation /about /pulse /monitor /investment-plan-2026 /investment-targets /limit-up-analysis /trading-philosophy /sector-rotation /mainland-investment-targets /investment-strategy /first-book /first-book/slow-is-fast /first-book/:file /industry-landscape /research-notes /research-notes/:market/:code /grid-trading /grid-trading/records /grid-trading/records/:recordId`。
- 站内链接一律用 router（`<Link to>`），不写绝对路径；`build:pages` 子路径 `/BusinessWeb/` 要可用。
- 断点：`max-width: 767px` 为手机，`min-width: 768px` 为桌面。
- 手机验收视口：360×740、390×844；桌面 1280×800。页面无横向滚动；点击目标 ≥ 44px；正文 ≥ 16px。
- 色板（逐字）：`#FAF6EE` 页面底、`#FFFDF8` 卡片底、`#3A3A34` 正文、`#7A766B` 次要文字、`#5B7B65` 主色暗绿、`#C9794F` 点缀陶土、`#E6DFD0` 细线、涨 `#C4503F`、跌 `#3F9A62`。
- 标题字体 Noto Serif SC（Google Fonts，`display=swap`），回退 `"Songti SC", "STSong", serif`。
- 不改书稿 `PARTS`、不改任何数据接口、估值、网格逻辑。
- 提交只用 `git add <具体文件>`，不用 `git add .`。提交信息结尾加：`Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`。不 push。
- 工作区里有用户的未提交改动：`public/changelog.json`（不要碰）、`src/pages/IndustryLandscape.tsx`、`public/industry/`、`src/App.tsx`、`src/components/Header.tsx`。前三项里 `IndustryLandscape.tsx` 和 `public/industry/` 被 `App.tsx` 引用，Task 4 提交 `App.tsx` 时需一并提交，其余不碰。

## Review Focus

- 旧链接 `/first-book/some%20file.md`（含编码字符）仍打开章节阅读页，并正确落在「读这本书」分组下。
- `/grid-trading/records/xyz` 这类深层路径，导航高亮、面包屑、切换条都落在「工具」分组，且最长前缀匹配不会误判为 `/grid-trading`。
- 手机抽屉打开后，点链接、按 Esc、路由变化三种方式都会关闭，并恢复背景滚动（`body` 的 `overflow`）。
- `changelog.json` 加载失败或为空时，首页“最近更新”区块整体不显示，不报错、不留空标题。
- 未知路径（如 `/nope`）不让导航崩溃，没有任何导航项高亮。

---

## File Structure

| 文件 | 责任 |
|---|---|
| `src/index.css`（改） | 色板变量、旧变量映射、基础排版、去玻璃拟态 |
| `src/styles/shell.css`（新） | 顶部栏、抽屉、页脚、面包屑、切换条、栏目页、首页、书稿阅读的响应式样式 |
| `src/main.tsx`（改） | 引入 `shell.css` |
| `index.html`（改） | 标题、`theme-color`、`viewport-fit=cover`、字体 |
| `src/data/siteMap.ts`（新） | 导航项、「正念投资」分组、路径→分组查找、高亮判断 |
| `src/data/quotes.ts`（新） | 投资大师名句（从旧 Home 原样搬出） |
| `src/components/Header.tsx`（重写） | 品牌 + 5 项导航 + 手机抽屉 |
| `src/components/Footer.tsx`（重写） | 品牌页脚 |
| `src/components/SectionChrome.tsx`（新） | 面包屑 + 同组切换条，按当前路径自动渲染 |
| `src/pages/InvestHub.tsx`（新） | 「正念投资」栏目页 |
| `src/pages/AiStudio.tsx`、`src/pages/LifeLab.tsx`（新） | 两个轻量栏目页 |
| `src/pages/Home.tsx`（重写） | 新首页 |
| `src/components/RecentUpdates.tsx`（新） | 读取 `changelog.json` 显示最近更新 |
| `src/App.tsx`（改） | 新增三条路由、挂载 `SectionChrome` |
| `src/pages/FirstBook.tsx`、`MyBooks.tsx`（改） | 阅读样式 class 与移动端 |
| `scripts/retheme-colors.mjs`（新） | 第二阶段：老页面硬编码颜色→变量 |

---

### Task 1: 设计变量与基础样式

**Files:**
- Modify: `src/index.css`（整体重写）
- Modify: `index.html`
- Create: `src/styles/shell.css`（本任务先放空壳和基础工具类，后续任务追加）
- Modify: `src/main.tsx`
- Test: `src/styles/tokens.test.ts`

**Interfaces:**
- Produces: CSS 变量 `--bg-primary --bg-card --text-primary --text-secondary --accent --accent-warm --border-subtle --up --down --font-serif`，以及旧变量映射；工具类 `.container`、`.card`、`.btn-primary`、`.skeleton-line`、`.animate-fade-in`（保持原类名，About 测试依赖 `.skeleton-line`）。

- [ ] **Step 1: 写失败的测试**

```ts
// src/styles/tokens.test.ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8')
const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')

const TOKENS: Record<string, string> = {
  '--bg-primary': '#FAF6EE',
  '--bg-card': '#FFFDF8',
  '--text-primary': '#3A3A34',
  '--text-secondary': '#7A766B',
  '--accent': '#5B7B65',
  '--accent-warm': '#C9794F',
  '--border-subtle': '#E6DFD0',
  '--up': '#C4503F',
  '--down': '#3F9A62',
}

describe('设计变量', () => {
  for (const [name, value] of Object.entries(TOKENS)) {
    it(`${name} = ${value}`, () => {
      const re = new RegExp(`${name}\\s*:\\s*${value}`, 'i')
      expect(css).toMatch(re)
    })
  }

  it('旧变量 --system-blue 映射到主色，老页面自动换肤', () => {
    expect(css).toMatch(/--system-blue\s*:\s*var\(--accent\)/)
  })

  it('不再使用玻璃拟态 backdrop-filter', () => {
    expect(css).not.toMatch(/backdrop-filter\s*:\s*blur/)
  })

  it('index.html 为正念生活并启用 viewport-fit=cover', () => {
    expect(html).toContain('<title>正念生活')
    expect(html).toContain('viewport-fit=cover')
    expect(html).toContain('Noto+Serif+SC')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/styles/tokens.test.ts`
Expected: FAIL（变量不存在，标题仍是 BusinessWeb）

- [ ] **Step 3: 重写 `src/index.css`**

```css
:root {
  /* 纸书茶室色板 */
  --bg-primary: #FAF6EE;
  --bg-card: #FFFDF8;
  --text-primary: #3A3A34;
  --text-secondary: #7A766B;
  --accent: #5B7B65;
  --accent-soft: rgba(91, 123, 101, 0.12);
  --accent-warm: #C9794F;
  --accent-warm-soft: rgba(201, 121, 79, 0.12);
  --border-subtle: #E6DFD0;
  --up: #C4503F;
  --down: #3F9A62;

  --font-serif: "Noto Serif SC", "Songti SC", "STSong", "SimSun", serif;
  --font-sans: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif;

  /* 旧变量映射：老页面引用这些名字，自动换肤 */
  --system-blue: var(--accent);
  --system-blue-light: var(--accent-soft);
  --system-indigo: #6B7A8F;
  --system-purple: #8C7A99;
  --system-pink: var(--accent-warm);
  --system-red: var(--up);
  --system-red-light: rgba(196, 80, 63, 0.1);
  --system-orange: var(--accent-warm);
  --system-yellow: #D9A441;
  --system-green: var(--down);
  --system-green-light: rgba(63, 154, 98, 0.1);
  --system-teal: #6E9C94;
  --system-cyan: #7BA3A8;
  --system-gray: #9A9588;
  --system-gray2: #B5B0A3;
  --system-gray3: #CFC9BB;
  --system-gray4: #DDD6C6;
  --system-gray5: #E6DFD0;
  --system-gray6: #F1EBDD;

  --accent-color: var(--accent);
  --glass-bg: var(--bg-primary);
  --glass-border: var(--border-subtle);
  --glass-blur: none;

  --shadow-sm: none;
  --shadow-md: none;
  --shadow-lg: 0 6px 18px rgba(58, 58, 52, 0.06);
  --shadow-glass: none;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 14px;
  --radius-full: 9999px;

  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}

* {
  box-sizing: border-box;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

html,
body,
#root {
  min-height: 100%;
}

html {
  -webkit-text-size-adjust: 100%;
}

body {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 16px;
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.7;
  overflow-x: hidden;
}

img,
svg,
video {
  max-width: 100%;
}

h1,
h2,
h3,
h4,
h5,
h6 {
  margin: 0 0 0.5em 0;
  font-family: var(--font-serif);
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.01em;
  line-height: 1.4;
}

a {
  color: var(--accent);
}

.glass-panel {
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-subtle);
}

.container {
  display: block;
  padding: 24px 16px 40px;
  max-width: 1100px;
  margin: 0 auto;
}

.card {
  background: var(--bg-card);
  padding: 24px;
  border-radius: var(--radius-lg);
  margin-bottom: 16px;
  border: 1px solid var(--border-subtle);
  transition: border-color 0.2s ease;
}

.card:hover {
  border-color: var(--system-gray3);
}

.title {
  font-size: 1.5rem;
  font-weight: 700;
}

button {
  cursor: pointer;
  font-family: inherit;
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  background-color: var(--accent);
  color: #fff;
  border: none;
  padding: 10px 22px;
  border-radius: var(--radius-full);
  font-weight: 500;
  font-size: 1rem;
  text-decoration: none;
  transition: background-color 0.2s ease;
}

.btn-primary:hover {
  background-color: #4B6A55;
}

.btn-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 10px 22px;
  border-radius: var(--radius-full);
  border: 1px solid var(--accent);
  color: var(--accent);
  background: transparent;
  text-decoration: none;
  font-size: 1rem;
  transition: background-color 0.2s ease;
}

.btn-ghost:hover {
  background: var(--accent-soft);
}

@media (min-width: 768px) {
  .container {
    padding: 32px 24px 56px;
  }

  .card {
    padding: 32px;
  }

  .title {
    font-size: 2rem;
  }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.animate-fade-in {
  animation: fadeIn 0.4s ease-out forwards;
}

@keyframes shimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}

.skeleton-line {
  height: 14px;
  border-radius: 6px;
  background: linear-gradient(90deg, var(--system-gray6) 0px, var(--system-gray5) 200px, var(--system-gray6) 400px);
  background-size: 800px 100%;
  animation: shimmer 1.4s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .animate-fade-in,
  .skeleton-line {
    animation: none;
  }
}
```

注意：旧 `index.css` 里的 `fadeInScale` 动画被 `fadeIn` 取代后，`Home.tsx`/`Header.tsx` 旧代码里引用 `fadeInScale` 的地方会在 Task 3、6 被重写掉；若 Task 1 完成时仍有其他文件引用，在 `index.css` 末尾追加：

```css
@keyframes fadeInScale {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

用 `grep -rn "fadeInScale" src` 检查，有引用就追加。

- [ ] **Step 4: 创建 `src/styles/shell.css`（空壳）并在 `src/main.tsx` 引入**

`src/styles/shell.css`：

```css
/* 外壳样式：Header / Footer / SectionChrome / 栏目页 / 首页 / 书稿阅读。后续任务追加。 */
```

`src/main.tsx` 的 `import './index.css'` 下一行加：

```ts
import './styles/shell.css'
```

- [ ] **Step 5: 改 `index.html`**

把 `<head>` 内改为：

```html
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>正念生活 · Mindful Life</title>
    <meta name="description" content="投资 · AI · 独立开发 · 自由生活。《正念投资》作者的长期实验。" />
    <meta name="theme-color" content="#FAF6EE" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@500;600;700&display=swap" rel="stylesheet" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/svg+xml" sizes="32x32" href="/favicon-32.svg" />
    <link rel="manifest" href="/manifest.webmanifest" />
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npx vitest run src/styles/tokens.test.ts`
Expected: PASS（全部变量用例 + 3 个附加用例）

- [ ] **Step 7: 提交**

```bash
git add src/index.css src/styles/shell.css src/styles/tokens.test.ts src/main.tsx index.html
git commit -m "feat(site): 纸书茶室设计变量与基础样式" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 站点地图数据

**Files:**
- Create: `src/data/siteMap.ts`
- Test: `src/data/siteMap.test.ts`

**Interfaces:**
- Produces（后续任务逐字使用）：

```ts
export interface NavItem { path: string; label: string }
export interface HubLink { path: string; label: string; desc: string }
export interface HubGroup { id: string; title: string; hint?: string; collapsed?: boolean; links: HubLink[] }
export const NAV_ITEMS: NavItem[]
export const INVEST_GROUPS: HubGroup[]
export function findInvestEntry(pathname: string): { group: HubGroup; link: HubLink } | null
export function isNavActive(itemPath: string, pathname: string): boolean
```

- [ ] **Step 1: 写失败的测试**

```ts
// src/data/siteMap.test.ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { INVEST_GROUPS, NAV_ITEMS, findInvestEntry, isNavActive } from './siteMap'

const appSource = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8')

describe('NAV_ITEMS', () => {
  it('恰好 5 项，顺序固定', () => {
    expect(NAV_ITEMS.map(i => i.label)).toEqual([
      '首页', '正念投资', 'AI 与独立开发', '自由生活实验', '关于',
    ])
    expect(NAV_ITEMS.map(i => i.path)).toEqual(['/', '/invest', '/ai', '/life', '/about'])
  })
})

describe('INVEST_GROUPS', () => {
  const allLinks = INVEST_GROUPS.flatMap(g => g.links)

  it('收纳全部 14 个旧入口，且无重复', () => {
    const paths = allLinks.map(l => l.path).sort()
    expect(paths).toEqual([
      '/first-book', '/grid-trading', '/industry-landscape', '/investment-plan-2026',
      '/investment-strategy', '/investment-targets', '/limit-up-analysis',
      '/mainland-investment-targets', '/monitor', '/pulse', '/research-notes',
      '/sector-rotation', '/trading-philosophy', '/valuation',
    ].sort())
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('每个入口路径都在 App.tsx 路由表里', () => {
    for (const l of allLinks) {
      expect(appSource, l.path).toContain(`path="${l.path}"`)
    }
  })

  it('盯盘观察组在最后且默认折叠', () => {
    const last = INVEST_GROUPS[INVEST_GROUPS.length - 1]
    expect(last.id).toBe('watch')
    expect(last.collapsed).toBe(true)
    expect(last.links.map(l => l.path)).toEqual(['/monitor', '/limit-up-analysis', '/sector-rotation'])
  })
})

describe('findInvestEntry', () => {
  it('精确匹配', () => {
    expect(findInvestEntry('/valuation')?.group.id).toBe('tools')
  })

  it('深层路径落在父入口所在分组，最长前缀优先', () => {
    expect(findInvestEntry('/grid-trading/records/xyz')?.link.path).toBe('/grid-trading')
    expect(findInvestEntry('/research-notes/us/AAPL')?.link.path).toBe('/research-notes')
  })

  it('含编码字符的章节路径落在「读这本书」', () => {
    const e = findInvestEntry('/first-book/%E7%AC%AC1%E7%AB%A0.md')
    expect(e?.group.id).toBe('read')
    expect(e?.link.path).toBe('/first-book')
  })

  it('不按字符串前缀误判', () => {
    expect(findInvestEntry('/pulses')).toBeNull()
    expect(findInvestEntry('/nope')).toBeNull()
  })
})

describe('isNavActive', () => {
  it('首页只在根路径高亮', () => {
    expect(isNavActive('/', '/')).toBe(true)
    expect(isNavActive('/', '/invest')).toBe(false)
  })

  it('任何收纳页面都点亮「正念投资」', () => {
    expect(isNavActive('/invest', '/invest')).toBe(true)
    expect(isNavActive('/invest', '/sector-rotation')).toBe(true)
    expect(isNavActive('/invest', '/grid-trading/records/1')).toBe(true)
    expect(isNavActive('/invest', '/first-book/x.md')).toBe(true)
  })

  it('未知路径无任何高亮', () => {
    for (const item of NAV_ITEMS) {
      expect(isNavActive(item.path, '/nope')).toBe(false)
    }
  })

  it('/ai /life /about 精确或子路径高亮', () => {
    expect(isNavActive('/ai', '/ai')).toBe(true)
    expect(isNavActive('/about', '/about')).toBe(true)
    expect(isNavActive('/life', '/invest')).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/data/siteMap.test.ts`
Expected: FAIL，找不到 `./siteMap`

- [ ] **Step 3: 实现**

```ts
// src/data/siteMap.ts
export interface NavItem {
  path: string
  label: string
}

export interface HubLink {
  path: string
  label: string
  desc: string
}

export interface HubGroup {
  id: string
  title: string
  hint?: string
  collapsed?: boolean
  links: HubLink[]
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: '首页' },
  { path: '/invest', label: '正念投资' },
  { path: '/ai', label: 'AI 与独立开发' },
  { path: '/life', label: '自由生活实验' },
  { path: '/about', label: '关于' },
]

export const INVEST_GROUPS: HubGroup[] = [
  {
    id: 'read',
    title: '读这本书',
    links: [
      { path: '/first-book', label: '我的书', desc: '《正念投资：不盯盘、不预测的普通人投资方法》全文与目录' },
    ],
  },
  {
    id: 'method',
    title: '方法与框架',
    links: [
      { path: '/investment-strategy', label: '策略框架', desc: '综合投资策略框架' },
      { path: '/trading-philosophy', label: '道与术', desc: '交易哲学与方法' },
      { path: '/investment-plan-2026', label: '2026 投资计划', desc: '全年投资作战计划书' },
    ],
  },
  {
    id: 'tools',
    title: '工具',
    links: [
      { path: '/valuation', label: '公司估值', desc: '六方法三情景估值与报告导出' },
      { path: '/grid-trading', label: '网格交易', desc: 'ETF / 个股网格模拟、回测与记录' },
    ],
  },
  {
    id: 'research',
    title: '研究',
    links: [
      { path: '/research-notes', label: '研究笔记', desc: '公司研究笔记与候选池' },
      { path: '/industry-landscape', label: '产业格局', desc: '产业链与竞争格局' },
      { path: '/investment-targets', label: '美股投资', desc: '美股标的与观察' },
      { path: '/mainland-investment-targets', label: '大陆投资', desc: 'A 股标的与观察' },
      { path: '/pulse', label: '经济脉搏', desc: '宏观与市场指标' },
    ],
  },
  {
    id: 'watch',
    title: '盯盘观察（选看）',
    hint: '书里主张少看行情，这三页留作参考。',
    collapsed: true,
    links: [
      { path: '/monitor', label: '每日监控', desc: '每日行情监控' },
      { path: '/limit-up-analysis', label: '涨停分析', desc: '每日板块涨停' },
      { path: '/sector-rotation', label: '板块轮动', desc: '板块强弱与轮动' },
    ],
  },
]

const ALL_LINKS: Array<{ group: HubGroup; link: HubLink }> = INVEST_GROUPS.flatMap(group =>
  group.links.map(link => ({ group, link }))
)

function matchesPath(base: string, pathname: string): boolean {
  return pathname === base || pathname.startsWith(base + '/')
}

export function findInvestEntry(pathname: string): { group: HubGroup; link: HubLink } | null {
  let best: { group: HubGroup; link: HubLink } | null = null
  for (const entry of ALL_LINKS) {
    if (!matchesPath(entry.link.path, pathname)) continue
    if (!best || entry.link.path.length > best.link.path.length) best = entry
  }
  return best
}

export function isNavActive(itemPath: string, pathname: string): boolean {
  if (itemPath === '/') return pathname === '/'
  if (itemPath === '/invest') {
    return matchesPath('/invest', pathname) || findInvestEntry(pathname) !== null
  }
  return matchesPath(itemPath, pathname)
}
```

- [ ] **Step 4: 运行测试**

Run: `npx vitest run src/data/siteMap.test.ts`
Expected: 除「每个入口路径都在 App.tsx 路由表里」外全部 PASS；该用例此时也应 PASS，因为这 14 条旧路径都已在当前 `App.tsx`。若 FAIL，核对 `App.tsx` 的 `path="..."` 写法与路径是否一致。


- [ ] **Step 5: 提交**

```bash
git add src/data/siteMap.ts src/data/siteMap.test.ts
git commit -m "feat(site): 站点地图数据与分组查找" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Header 与 Footer（含手机抽屉）

**Files:**
- Modify: `src/components/Header.tsx`（整体重写）
- Modify: `src/components/Footer.tsx`（整体重写）
- Modify: `src/styles/shell.css`（追加）
- Test: `src/components/Header.test.tsx`

**Interfaces:**
- Consumes: `NAV_ITEMS`, `isNavActive` from `src/data/siteMap.ts`。
- Produces: `Header`、`Footer` 默认导出，无 props。桌面导航 `aria-label="主导航"`；抽屉导航 `aria-label="移动导航"`，仅在打开时渲染；菜单按钮 `aria-label` 为“打开菜单”/“关闭菜单”，带 `aria-expanded`。

- [ ] **Step 1: 写失败的测试**

```tsx
// src/components/Header.test.tsx
import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import Header from './Header'

afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
})

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Header />
    </MemoryRouter>
  )

describe('Header', () => {
  it('品牌名是正念生活，链接回首页', () => {
    renderAt('/invest')
    const brand = screen.getByRole('link', { name: /正念生活/ })
    expect(brand.getAttribute('href')).toBe('/')
  })

  it('主导航恰好 5 项', () => {
    renderAt('/')
    const nav = screen.getByRole('navigation', { name: '主导航' })
    expect(within(nav).getAllByRole('link').map(a => a.textContent)).toEqual([
      '首页', '正念投资', 'AI 与独立开发', '自由生活实验', '关于',
    ])
  })

  it('旧页面路径点亮「正念投资」', () => {
    renderAt('/sector-rotation')
    const nav = screen.getByRole('navigation', { name: '主导航' })
    const active = within(nav).getAllByRole('link').filter(a => a.getAttribute('aria-current') === 'page')
    expect(active.map(a => a.textContent)).toEqual(['正念投资'])
  })

  it('未知路径没有高亮项且不报错', () => {
    renderAt('/nope')
    const nav = screen.getByRole('navigation', { name: '主导航' })
    const active = within(nav).getAllByRole('link').filter(a => a.getAttribute('aria-current') === 'page')
    expect(active).toHaveLength(0)
  })

  it('抽屉：默认不渲染，点按钮打开并锁定滚动，再点关闭并恢复', () => {
    renderAt('/')
    expect(screen.queryByRole('navigation', { name: '移动导航' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '打开菜单' }))
    expect(screen.getByRole('navigation', { name: '移动导航' })).toBeTruthy()
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.click(screen.getByRole('button', { name: '关闭菜单' }))
    expect(screen.queryByRole('navigation', { name: '移动导航' })).toBeNull()
    expect(document.body.style.overflow).toBe('')
  })

  it('抽屉：点链接后关闭', () => {
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: '打开菜单' }))
    const drawer = screen.getByRole('navigation', { name: '移动导航' })
    fireEvent.click(within(drawer).getByRole('link', { name: '正念投资' }))
    expect(screen.queryByRole('navigation', { name: '移动导航' })).toBeNull()
    expect(document.body.style.overflow).toBe('')
  })

  it('抽屉：按 Esc 关闭', () => {
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: '打开菜单' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('navigation', { name: '移动导航' })).toBeNull()
    expect(document.body.style.overflow).toBe('')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/components/Header.test.tsx`
Expected: FAIL（旧 Header 没有“主导航”等）

- [ ] **Step 3: 重写 `src/components/Header.tsx`**

先 `Read` 当前文件（含用户未提交改动），整体替换为：

```tsx
import React, { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { NAV_ITEMS, isNavActive } from '../data/siteMap'

function Leaf(): JSX.Element {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5 19c3-4 6-7 10-9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export default function Header(): JSX.Element {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

  // 路由变化时关闭抽屉
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // 抽屉打开时锁定背景滚动，Esc 关闭
  useEffect(() => {
    if (!open) {
      document.body.style.overflow = ''
      return
    }
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <header className="site-header">
      <div className="site-header__bar">
        <Link to="/" className="site-brand" onClick={() => setOpen(false)}>
          <Leaf />
          <span className="site-brand__name">正念生活</span>
        </Link>

        <nav className="site-nav" aria-label="主导航">
          {NAV_ITEMS.map(item => {
            const active = isNavActive(item.path, pathname)
            return (
              <Link
                key={item.path}
                to={item.path}
                className={active ? 'site-nav__link is-active' : 'site-nav__link'}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <button
          type="button"
          className="site-menu-btn"
          aria-label={open ? '关闭菜单' : '打开菜单'}
          aria-expanded={open}
          onClick={() => setOpen(v => !v)}
        >
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {open && (
        <nav className="site-drawer" aria-label="移动导航">
          {NAV_ITEMS.map(item => {
            const active = isNavActive(item.path, pathname)
            return (
              <Link
                key={item.path}
                to={item.path}
                className={active ? 'site-drawer__link is-active' : 'site-drawer__link'}
                aria-current={active ? 'page' : undefined}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      )}
    </header>
  )
}
```

- [ ] **Step 4: 重写 `src/components/Footer.tsx`**

```tsx
import React from 'react'

declare const __BUILD_TIME__: string

export default function Footer(): JSX.Element {
  const built = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toLocaleDateString('zh-CN')
  return (
    <footer className="site-footer">
      <div className="site-footer__name">正念生活 · Mindful Life</div>
      <div className="site-footer__line">投资 · AI · 独立开发 · 自由生活</div>
      <div className="site-footer__note">本站内容仅为个人研究与方法讨论，不构成任何投资建议。</div>
      <div className="site-footer__build">更新于 {built}</div>
    </footer>
  )
}
```

- [ ] **Step 5: 追加到 `src/styles/shell.css`**

```css
/* ---------- Header ---------- */
.site-header {
  position: sticky;
  top: 0;
  z-index: 1000;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-subtle);
  padding-top: var(--safe-top);
}

.site-header__bar {
  max-width: 1100px;
  margin: 0 auto;
  min-height: 56px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.site-brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  color: var(--accent);
  text-decoration: none;
}

.site-brand__name {
  font-family: var(--font-serif);
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.04em;
}

.site-nav {
  display: none;
}

.site-nav__link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 14px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 0.95rem;
  border-bottom: 2px solid transparent;
  transition: color 0.2s ease, border-color 0.2s ease;
}

.site-nav__link:hover {
  color: var(--text-primary);
}

.site-nav__link.is-active {
  color: var(--accent);
  border-bottom-color: var(--accent);
  font-weight: 600;
}

.site-menu-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  background: transparent;
  color: var(--text-primary);
}

.site-drawer {
  position: fixed;
  inset: 0;
  top: calc(56px + var(--safe-top));
  background: var(--bg-primary);
  padding: 16px 16px calc(24px + var(--safe-bottom));
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  animation: fadeIn 0.2s ease-out;
}

.site-drawer__link {
  display: flex;
  align-items: center;
  min-height: 56px;
  padding: 0 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-card);
  color: var(--text-primary);
  text-decoration: none;
  font-family: var(--font-serif);
  font-size: 1.1rem;
}

.site-drawer__link.is-active {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

@media (min-width: 768px) {
  .site-header__bar {
    padding: 0 24px;
  }

  .site-nav {
    display: flex;
    align-items: center;
  }

  .site-menu-btn,
  .site-drawer {
    display: none;
  }
}

/* ---------- Footer ---------- */
.site-footer {
  margin-top: 40px;
  padding: 32px 16px calc(32px + var(--safe-bottom));
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.9rem;
  border-top: 1px solid var(--border-subtle);
}

.site-footer__name {
  font-family: var(--font-serif);
  font-size: 1.05rem;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.site-footer__note {
  margin-top: 8px;
}

.site-footer__build {
  margin-top: 8px;
  font-size: 0.78rem;
  opacity: 0.7;
}
```

- [ ] **Step 6: 运行测试**

Run: `npx vitest run src/components/Header.test.tsx`
Expected: PASS（7 个用例）

- [ ] **Step 7: 提交**

Header.tsx 含用户之前的未提交改动（已被整体替换，不再保留旧导航列表）：

```bash
git add src/components/Header.tsx src/components/Footer.tsx src/styles/shell.css src/components/Header.test.tsx
git commit -m "feat(site): 5 项导航、手机抽屉与新页脚" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: SectionChrome（面包屑 + 同组切换条）与新路由

**Files:**
- Create: `src/components/SectionChrome.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles/shell.css`（追加）
- Create（占位以便路由编译，Task 5 填实）: `src/pages/InvestHub.tsx`、`src/pages/AiStudio.tsx`、`src/pages/LifeLab.tsx`
- Test: `src/components/SectionChrome.test.tsx`

**Interfaces:**
- Consumes: `findInvestEntry`, `INVEST_GROUPS` from `src/data/siteMap.ts`。
- Produces: `SectionChrome` 默认导出，无 props；在 `/invest` 本身与不在分组内的路径（`/`、`/ai`、`/life`、`/about`、未知）渲染 `null`。切换条当前项带 `aria-current="page"`。

- [ ] **Step 1: 写失败的测试**

```tsx
// src/components/SectionChrome.test.tsx
import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import SectionChrome from './SectionChrome'

afterEach(cleanup)

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <SectionChrome />
    </MemoryRouter>
  )

describe('SectionChrome', () => {
  it('分组内页面显示面包屑：正念生活 › 正念投资 › 页面名', () => {
    renderAt('/valuation')
    const crumb = screen.getByRole('navigation', { name: '面包屑' })
    expect(within(crumb).getAllByRole('link').map(a => a.textContent)).toEqual(['正念生活', '正念投资'])
    expect(crumb.textContent).toContain('公司估值')
  })

  it('同组切换条列出同组页面，当前项高亮', () => {
    renderAt('/valuation')
    const tabs = screen.getByRole('navigation', { name: '同组页面' })
    const links = within(tabs).getAllByRole('link')
    expect(links.map(a => a.textContent)).toEqual(['公司估值', '网格交易'])
    expect(links[0].getAttribute('aria-current')).toBe('page')
    expect(links[1].getAttribute('aria-current')).toBeNull()
  })

  it('深层路径仍落在同组并高亮父入口', () => {
    renderAt('/grid-trading/records/abc')
    const tabs = screen.getByRole('navigation', { name: '同组页面' })
    const current = within(tabs).getAllByRole('link').find(a => a.getAttribute('aria-current') === 'page')
    expect(current?.textContent).toBe('网格交易')
  })

  it('/invest 本身、首页、/ai、未知路径都不渲染', () => {
    for (const p of ['/invest', '/', '/ai', '/life', '/about', '/nope']) {
      const { container, unmount } = renderAt(p)
      expect(container.innerHTML, p).toBe('')
      unmount()
    }
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/components/SectionChrome.test.tsx`
Expected: FAIL，找不到 `./SectionChrome`

- [ ] **Step 3: 实现 `src/components/SectionChrome.tsx`**

```tsx
import React, { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { findInvestEntry } from '../data/siteMap'

export default function SectionChrome(): JSX.Element | null {
  const { pathname } = useLocation()
  const entry = findInvestEntry(pathname)
  const currentRef = useRef<HTMLAnchorElement | null>(null)

  // 手机上切换条横向滚动，让当前项自动进入可视区
  useEffect(() => {
    currentRef.current?.scrollIntoView?.({ inline: 'center', block: 'nearest' })
  }, [pathname])

  if (!entry) return null
  const { group, link } = entry

  return (
    <div className="section-chrome">
      <nav className="breadcrumb" aria-label="面包屑">
        <Link to="/">正念生活</Link>
        <span aria-hidden="true">›</span>
        <Link to="/invest">正念投资</Link>
        <span aria-hidden="true">›</span>
        <span className="breadcrumb__current">{link.label}</span>
      </nav>
      {group.links.length > 1 && (
        <nav className="section-tabs" aria-label="同组页面">
          {group.links.map(l => {
            const active = l.path === link.path
            return (
              <Link
                key={l.path}
                to={l.path}
                ref={active ? currentRef : undefined}
                className={active ? 'section-tabs__link is-active' : 'section-tabs__link'}
                aria-current={active ? 'page' : undefined}
              >
                {l.label}
              </Link>
            )
          })}
        </nav>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 三个占位页面（Task 5 重写）**

`src/pages/InvestHub.tsx`、`AiStudio.tsx`、`LifeLab.tsx` 分别：

```tsx
import React from 'react'

export default function InvestHub(): JSX.Element {
  return <main className="container"><h1>正念投资</h1></main>
}
```

（`AiStudio` 标题“AI 与独立开发”，`LifeLab` 标题“自由生活实验”，函数名与文件名一致。）

- [ ] **Step 5: 修改 `src/App.tsx`**

先 `Read` 当前文件（含用户加入的 `IndustryLandscape` 引入与路由，保留）。改动三处：

1. 引入区加：

```tsx
import SectionChrome from './components/SectionChrome'
import InvestHub from './pages/InvestHub'
import AiStudio from './pages/AiStudio'
import LifeLab from './pages/LifeLab'
```

2. `<Header />` 之后加一行 `<SectionChrome />`。
3. `<Route path="/" element={<Home />} />` 之后加：

```tsx
          <Route path="/invest" element={<InvestHub />} />
          <Route path="/ai" element={<AiStudio />} />
          <Route path="/life" element={<LifeLab />} />
```

- [ ] **Step 6: 追加到 `src/styles/shell.css`**

```css
/* ---------- 面包屑与同组切换条 ---------- */
.section-chrome {
  max-width: 1100px;
  margin: 0 auto;
  padding: 12px 16px 0;
}

.breadcrumb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.breadcrumb a {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  color: var(--text-secondary);
  text-decoration: none;
}

.breadcrumb a:hover {
  color: var(--accent);
}

.breadcrumb__current {
  color: var(--text-primary);
}

.section-tabs {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  overflow-x: auto;
  white-space: nowrap;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.section-tabs::-webkit-scrollbar {
  display: none;
}

.section-tabs__link {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 16px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-subtle);
  background: var(--bg-card);
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 0.95rem;
}

.section-tabs__link.is-active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

@media (min-width: 768px) {
  .section-chrome {
    padding: 16px 24px 0;
  }
}
```

- [ ] **Step 7: 运行测试 + 类型检查**

Run: `npx vitest run src/components/SectionChrome.test.tsx src/data/siteMap.test.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS；tsc 无新增报错（若 `tsconfig.json` 原本就有报错，只确认没有来自本任务文件的）。

- [ ] **Step 8: 提交**

`App.tsx` 引用了用户未提交的 `IndustryLandscape`，需一并提交以保证可构建：

```bash
git add src/components/SectionChrome.tsx src/components/SectionChrome.test.tsx src/pages/InvestHub.tsx src/pages/AiStudio.tsx src/pages/LifeLab.tsx src/App.tsx src/styles/shell.css src/pages/IndustryLandscape.tsx public/industry
git commit -m "feat(site): 面包屑、同组切换条与栏目路由" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 三个栏目页（正念投资 / AI 与独立开发 / 自由生活实验）

**Files:**
- Modify: `src/pages/InvestHub.tsx`、`src/pages/AiStudio.tsx`、`src/pages/LifeLab.tsx`
- Modify: `src/styles/shell.css`（追加）
- Test: `src/pages/Sections.test.tsx`

**Interfaces:**
- Consumes: `INVEST_GROUPS` from `src/data/siteMap.ts`。
- Produces: 三个默认导出页面，无 props。`InvestHub` 对 `collapsed` 分组使用 `<details>`，其余分组直接展开。

- [ ] **Step 1: 写失败的测试**

```tsx
// src/pages/Sections.test.tsx
import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import InvestHub from './InvestHub'
import AiStudio from './AiStudio'
import LifeLab from './LifeLab'
import { INVEST_GROUPS } from '../data/siteMap'

afterEach(cleanup)

const wrap = (el: JSX.Element) => render(<MemoryRouter>{el}</MemoryRouter>)

describe('InvestHub', () => {
  it('渲染全部分组标题与每个入口链接', () => {
    wrap(<InvestHub />)
    for (const g of INVEST_GROUPS) {
      expect(screen.getByText(g.title), g.title).toBeTruthy()
      for (const l of g.links) {
        const a = screen.getAllByRole('link').find(x => x.getAttribute('href') === l.path)
        expect(a, l.path).toBeTruthy()
      }
    }
  })

  it('盯盘观察组是默认折叠的 details，并带提示语', () => {
    const { container } = wrap(<InvestHub />)
    const details = container.querySelector('details')
    expect(details).toBeTruthy()
    expect(details?.hasAttribute('open')).toBe(false)
    expect(within(details as HTMLElement).getByText(/少看行情/)).toBeTruthy()
  })

  it('「读这本书」突出显示并链接到 /first-book', () => {
    wrap(<InvestHub />)
    expect(screen.getByRole('link', { name: /我的书/ }).getAttribute('href')).toBe('/first-book')
  })
})

describe('AiStudio / LifeLab', () => {
  it('AiStudio 标出“准备中”并给出路线', () => {
    wrap(<AiStudio />)
    expect(screen.getByRole('heading', { level: 1, name: 'AI 与独立开发' })).toBeTruthy()
    expect(screen.getAllByText('准备中').length).toBeGreaterThan(0)
    expect(screen.getByText(/正念投资 AI/)).toBeTruthy()
  })

  it('LifeLab 标出“准备中”并给出阶段', () => {
    wrap(<LifeLab />)
    expect(screen.getByRole('heading', { level: 1, name: '自由生活实验' })).toBeTruthy()
    expect(screen.getAllByText('准备中').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/400/).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/pages/Sections.test.tsx`
Expected: FAIL（占位页没有这些内容）

- [ ] **Step 3: 实现 `src/pages/InvestHub.tsx`**

```tsx
import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { INVEST_GROUPS, type HubGroup } from '../data/siteMap'

function GroupLinks({ group }: { group: HubGroup }): JSX.Element {
  return (
    <div className="hub-grid">
      {group.links.map(l => (
        <Link key={l.path} to={l.path} className="hub-card">
          <span className="hub-card__title">{l.label}</span>
          <span className="hub-card__desc">{l.desc}</span>
          <ArrowRight size={16} className="hub-card__arrow" aria-hidden="true" />
        </Link>
      ))}
    </div>
  )
}

export default function InvestHub(): JSX.Element {
  return (
    <main className="container animate-fade-in">
      <header className="page-head">
        <h1>正念投资</h1>
        <p>不盯盘、不预测的普通人投资方法。先读书，再用工具，最后才看行情。</p>
      </header>

      {INVEST_GROUPS.map(group =>
        group.collapsed ? (
          <details key={group.id} className="hub-group hub-group--fold">
            <summary>{group.title}</summary>
            {group.hint && <p className="hub-group__hint">{group.hint}</p>}
            <GroupLinks group={group} />
          </details>
        ) : (
          <section key={group.id} className={`hub-group hub-group--${group.id}`}>
            <h2>{group.title}</h2>
            <GroupLinks group={group} />
          </section>
        )
      )}
    </main>
  )
}
```

- [ ] **Step 4: 实现 `src/pages/AiStudio.tsx`**

```tsx
import React from 'react'

const STEPS = [
  { title: '建站', desc: '用 Next.js / React 把个人网站做成学习项目，同时沉淀作品。', state: '进行中' },
  { title: '正念投资 AI V0.1', desc: '输入一家公司，按书里的框架一步步提问：分类、产业、商业模式、护城河、财报、估值、周期、证伪条件，最后生成投资决策卡。不预测涨跌。', state: '准备中' },
  { title: '公开验证', desc: '找 20 个真实用户用起来，看哪些环节有人愿意持续使用。', state: '准备中' },
]

export default function AiStudio(): JSX.Element {
  return (
    <main className="container animate-fade-in">
      <header className="page-head">
        <h1>AI 与独立开发</h1>
        <p>用技术放大自己的创造力。第一个作品，从《正念投资》长出来。</p>
      </header>
      <ol className="road">
        {STEPS.map(s => (
          <li key={s.title} className="road__item">
            <div className="road__head">
              <h2>{s.title}</h2>
              <span className="tag">{s.state}</span>
            </div>
            <p>{s.desc}</p>
          </li>
        ))}
      </ol>
    </main>
  )
}
```

- [ ] **Step 5: 实现 `src/pages/LifeLab.tsx`**

```tsx
import React from 'react'

const STAGES = [
  { title: '300 万 → 400 万', desc: '工作积累本金，同时每周拿出几小时积累作品：写书、建站、做第一个小产品。', state: '进行中' },
  { title: '离开全职工作', desc: '到达 400 万后，从“最大化工资”换成“时间自主”。前三个月只休息，不要求赚钱。', state: '准备中' },
  { title: '自由生活第一年', desc: '记录花了多少钱、投资怎么样、每天做什么、有没有后悔。让真正有生命力的事自然长大。', state: '准备中' },
]

export default function LifeLab(): JSX.Element {
  return (
    <main className="container animate-fade-in">
      <header className="page-head">
        <h1>自由生活实验</h1>
        <p>一个普通程序员关于钱、技术与自由生活的长期实验。钱不是终点，是选择权。</p>
      </header>
      <ol className="road">
        {STAGES.map(s => (
          <li key={s.title} className="road__item">
            <div className="road__head">
              <h2>{s.title}</h2>
              <span className="tag">{s.state}</span>
            </div>
            <p>{s.desc}</p>
          </li>
        ))}
      </ol>
    </main>
  )
}
```


- [ ] **Step 6: 追加到 `src/styles/shell.css`**

```css
/* ---------- 栏目页通用 ---------- */
.page-head {
  margin: 8px 0 24px;
}

.page-head h1 {
  font-size: 1.7rem;
  margin-bottom: 8px;
}

.page-head p {
  margin: 0;
  color: var(--text-secondary);
}

.hub-group {
  margin-bottom: 28px;
}

.hub-group h2,
.hub-group summary {
  font-size: 1.15rem;
  font-family: var(--font-serif);
  font-weight: 600;
  margin-bottom: 12px;
}

.hub-group summary {
  display: flex;
  align-items: center;
  min-height: 44px;
  cursor: pointer;
  color: var(--text-secondary);
}

.hub-group__hint {
  margin: 0 0 12px;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.hub-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
  gap: 12px;
}

.hub-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 44px;
  padding: 16px 40px 16px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  color: var(--text-primary);
  text-decoration: none;
  transition: border-color 0.2s ease;
}

.hub-card:hover {
  border-color: var(--accent);
}

.hub-card__title {
  font-family: var(--font-serif);
  font-weight: 600;
  font-size: 1.05rem;
}

.hub-card__desc {
  color: var(--text-secondary);
  font-size: 0.92rem;
}

.hub-card__arrow {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--accent);
}

.hub-group--read .hub-card {
  background: var(--accent-soft);
  border-color: var(--accent);
}

.road {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.road__item {
  padding: 20px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}

.road__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.road__head h2 {
  margin: 0;
  font-size: 1.1rem;
}

.road__item p {
  margin: 0;
  color: var(--text-secondary);
}

.tag {
  flex: 0 0 auto;
  padding: 2px 10px;
  border-radius: var(--radius-full);
  background: var(--accent-warm-soft);
  color: var(--accent-warm);
  font-size: 0.82rem;
}

@media (min-width: 768px) {
  .page-head h1 {
    font-size: 2.1rem;
  }
}
```

- [ ] **Step 7: 运行测试**

Run: `npx vitest run src/pages/Sections.test.tsx`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add src/pages/InvestHub.tsx src/pages/AiStudio.tsx src/pages/LifeLab.tsx src/pages/Sections.test.tsx src/styles/shell.css
git commit -m "feat(site): 正念投资、AI 与独立开发、自由生活实验栏目页" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 新首页（含最近更新与名句）

**Files:**
- Create: `src/data/quotes.ts`
- Create: `src/components/RecentUpdates.tsx`
- Modify: `src/pages/Home.tsx`（整体重写）
- Modify: `src/styles/shell.css`（追加）
- Test: `src/pages/Home.test.tsx`

**Interfaces:**
- Produces: `QUOTES: Array<{ author: string; text: string }>`；`RecentUpdates` 默认导出，无 props，内部 `fetch(import.meta.env.BASE_URL + 'changelog.json')`，成功且有提交时才渲染，否则 `null`，最多显示 5 条。

- [ ] **Step 1: 写失败的测试**

```tsx
// src/pages/Home.test.tsx
import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Home from './Home'
import RecentUpdates from '../components/RecentUpdates'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const stubFetch = (impl: () => Promise<unknown>) =>
  vi.stubGlobal('fetch', (() => impl()) as unknown as typeof fetch)

const changelog = (n: number) => ({
  generatedAt: '2026-10-04T00:00:00.000Z',
  versions: [
    {
      tag: 'unreleased',
      date: null,
      commits: Array.from({ length: n }, (_, i) => ({
        hash: `h${i}`, subject: `更新${i}`, author: 'a', date: '2026-10-04',
      })),
    },
  ],
})

describe('Home', () => {
  it('首屏有书名、副标题与「开始阅读」按钮', () => {
    stubFetch(() => new Promise(() => {}))
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: /正念投资/ })).toBeTruthy()
    expect(screen.getByText(/不盯盘、不预测的普通人投资方法/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '开始阅读' }).getAttribute('href')).toBe('/first-book')
    expect(screen.getByRole('link', { name: '看目录' }).getAttribute('href')).toBe('/first-book/slow-is-fast')
  })

  it('三个栏目入口', () => {
    stubFetch(() => new Promise(() => {}))
    render(<MemoryRouter><Home /></MemoryRouter>)
    const hrefs = ['/invest', '/ai', '/life']
    for (const h of hrefs) {
      expect(screen.getAllByRole('link').some(a => a.getAttribute('href') === h), h).toBe(true)
    }
  })

  it('投资大师名句 8 条，默认折叠', () => {
    stubFetch(() => new Promise(() => {}))
    const { container } = render(<MemoryRouter><Home /></MemoryRouter>)
    const details = container.querySelector('details.quotes')
    expect(details).toBeTruthy()
    expect(details?.hasAttribute('open')).toBe(false)
    expect(details?.querySelectorAll('blockquote').length).toBe(8)
  })
})

describe('RecentUpdates', () => {
  it('最多显示 5 条', async () => {
    stubFetch(async () => ({ ok: true, json: async () => changelog(9) }))
    render(<RecentUpdates />)
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(5))
    expect(screen.getByText('更新0')).toBeTruthy()
    expect(screen.queryByText('更新5')).toBeNull()
  })

  it('加载失败时整块不显示', async () => {
    stubFetch(async () => { throw new Error('down') })
    const { container } = render(<RecentUpdates />)
    await new Promise(r => setTimeout(r, 20))
    expect(container.innerHTML).toBe('')
  })

  it('空提交列表时整块不显示', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ generatedAt: 'x', versions: [] }) }))
    const { container } = render(<RecentUpdates />)
    await new Promise(r => setTimeout(r, 20))
    expect(container.innerHTML).toBe('')
  })

  it('响应非 ok 时整块不显示', async () => {
    stubFetch(async () => ({ ok: false, status: 404, json: async () => ({}) }))
    const { container } = render(<RecentUpdates />)
    await new Promise(r => setTimeout(r, 20))
    expect(container.innerHTML).toBe('')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/pages/Home.test.tsx`
Expected: FAIL，找不到 `RecentUpdates`

- [ ] **Step 3: `src/data/quotes.ts`（原文从旧 Home 逐字搬出）**

```ts
export interface Quote {
  author: string
  text: string
}

export const QUOTES: Quote[] = [
  { author: '彼得·林奇', text: '要清楚自己持有什么，更要清楚为什么持有。' },
  { author: '沃伦·巴菲特', text: '别人贪婪时恐惧，别人恐惧时贪婪。' },
  { author: '查理·芒格', text: '反过来想，总是反过来想。' },
  { author: '本杰明·格雷厄姆', text: '市场短期是投票机，长期是称重机。' },
  { author: '约翰·邓普顿', text: '牛市在悲观中诞生，在怀疑中成长，在乐观中成熟，在狂喜中死亡。' },
  { author: '霍华德·马克斯', text: '你无法预测，但你可以做好准备。' },
  { author: '约翰·博格', text: '不要在草堆里找针，把整个草堆买下来。' },
  { author: '段永平', text: '做对的事情，把事情做对。' },
]
```

- [ ] **Step 4: `src/components/RecentUpdates.tsx`**

```tsx
import React, { useEffect, useState } from 'react'

interface Commit {
  hash: string
  subject: string
  date: string
}

interface Changelog {
  versions?: Array<{ commits?: Commit[] }>
}

export default function RecentUpdates(): JSX.Element | null {
  const [items, setItems] = useState<Commit[]>([])

  useEffect(() => {
    let cancelled = false
    fetch(import.meta.env.BASE_URL + 'changelog.json')
      .then(r => {
        if (!r.ok) throw new Error(`status ${r.status}`)
        return r.json() as Promise<Changelog>
      })
      .then(j => {
        const commits = (j.versions ?? []).flatMap(v => v.commits ?? []).slice(0, 5)
        if (!cancelled) setItems(commits)
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (items.length === 0) return null

  return (
    <section className="home-section">
      <h2>最近更新</h2>
      <ul className="updates">
        {items.map(c => (
          <li key={c.hash}>
            <span className="updates__date">{c.date}</span>
            <span className="updates__text">{c.subject}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
```

- [ ] **Step 5: 重写 `src/pages/Home.tsx`**

先 `Read` 当前文件确认没有需要保留的其他内容（旧版仅含名句折叠卡与功能模块卡），然后整体替换：

```tsx
import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { QUOTES } from '../data/quotes'
import RecentUpdates from '../components/RecentUpdates'

const COLUMNS = [
  { to: '/invest', title: '正念投资', desc: '读书、方法、工具与研究。普通人用规则代替盯盘。' },
  { to: '/ai', title: 'AI 与独立开发', desc: '把书里的框架做成小产品，边学边做。' },
  { to: '/life', title: '自由生活实验', desc: '从 300 万到 400 万，再到自由生活的第一年。' },
]

export default function Home(): JSX.Element {
  return (
    <main className="container animate-fade-in">
      <section className="hero">
        <p className="hero__eyebrow">正念生活 · Mindful Life</p>
        <h1 className="hero__title">《正念投资》</h1>
        <p className="hero__subtitle">不盯盘、不预测的普通人投资方法</p>
        <div className="hero__actions">
          <Link to="/first-book" className="btn-primary">开始阅读</Link>
          <Link to="/first-book/slow-is-fast" className="btn-ghost">看目录</Link>
        </div>
      </section>

      <p className="manifesto">赚钱不是为了最终什么都不做，而是为了能自由选择值得做的事。</p>

      <section className="home-section">
        <h2>三个栏目</h2>
        <div className="hub-grid">
          {COLUMNS.map(c => (
            <Link key={c.to} to={c.to} className="hub-card">
              <span className="hub-card__title">{c.title}</span>
              <span className="hub-card__desc">{c.desc}</span>
              <ArrowRight size={16} className="hub-card__arrow" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <RecentUpdates />

      <details className="quotes">
        <summary>投资大师名句</summary>
        <div className="quotes__grid">
          {QUOTES.map(q => (
            <blockquote key={q.author} className="quote">
              <p>{q.text}</p>
              <footer>—— {q.author}</footer>
            </blockquote>
          ))}
        </div>
      </details>
    </main>
  )
}
```

- [ ] **Step 6: 追加到 `src/styles/shell.css`**

```css
/* ---------- 首页 ---------- */
.hero {
  padding: 32px 0 24px;
  text-align: center;
}

.hero__eyebrow {
  margin: 0 0 12px;
  color: var(--accent);
  letter-spacing: 0.12em;
  font-size: 0.9rem;
}

.hero__title {
  font-size: 2.4rem;
  margin: 0 0 8px;
  letter-spacing: 0.08em;
}

.hero__subtitle {
  margin: 0 0 24px;
  color: var(--text-secondary);
  font-family: var(--font-serif);
  font-size: 1.05rem;
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
}

.manifesto {
  max-width: 34em;
  margin: 8px auto 32px;
  padding: 0 8px;
  text-align: center;
  font-family: var(--font-serif);
  font-size: 1.1rem;
  line-height: 1.9;
}

.home-section {
  margin-bottom: 32px;
}

.home-section h2 {
  font-size: 1.15rem;
  margin-bottom: 12px;
}

.updates {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
}

.updates li {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.updates li:last-child {
  border-bottom: none;
}

.updates__date {
  color: var(--text-secondary);
  font-size: 0.82rem;
}

.updates__text {
  overflow-wrap: anywhere;
}

.quotes {
  margin-bottom: 24px;
}

.quotes summary {
  display: flex;
  align-items: center;
  min-height: 44px;
  cursor: pointer;
  font-family: var(--font-serif);
  font-size: 1.05rem;
  color: var(--text-secondary);
}

.quotes__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 12px;
  margin-top: 8px;
}

.quote {
  margin: 0;
  padding: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-left: 3px solid var(--accent-warm);
  border-radius: var(--radius-md);
}

.quote p {
  margin: 0 0 8px;
  font-family: var(--font-serif);
}

.quote footer {
  color: var(--text-secondary);
  font-size: 0.88rem;
}

@media (min-width: 768px) {
  .hero {
    padding: 56px 0 32px;
  }

  .hero__title {
    font-size: 3.2rem;
  }

  .updates li {
    flex-direction: row;
    gap: 16px;
  }

  .updates__date {
    flex: 0 0 96px;
  }
}
```

- [ ] **Step 7: 运行测试**

Run: `npx vitest run src/pages/Home.test.tsx`
Expected: PASS（7 个用例）

- [ ] **Step 8: 提交**

```bash
git add src/data/quotes.ts src/components/RecentUpdates.tsx src/pages/Home.tsx src/pages/Home.test.tsx src/styles/shell.css
git commit -m "feat(site): 新首页（书名首屏、栏目入口、最近更新、名句）" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 书稿阅读页与「我的书」的新样式及移动端

**Files:**
- Modify: `src/pages/FirstBook.tsx`（只改 className 与颜色字面量，不动 `PARTS`、不动渲染逻辑）
- Modify: `src/pages/MyBooks.tsx`
- Modify: `src/styles/shell.css`（追加）
- Test: `src/pages/FirstBookStyle.test.tsx`

**Interfaces:**
- Produces: `ChapterReader` 正文卡片带 `className="book-reader"`，上一篇/下一篇容器带 `className="book-pager"`。

- [ ] **Step 1: 写失败的测试**

```tsx
// src/pages/FirstBookStyle.test.tsx
import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FirstBook from './FirstBook'
import { PARTS } from './FirstBook'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('书稿阅读页样式钩子', () => {
  it('章节正文使用 book-reader，翻页区使用 book-pager', async () => {
    const first = PARTS.flatMap(p => p.chapters).find(c => c.file)
    expect(first).toBeTruthy()
    vi.stubGlobal('fetch', (async () => ({ ok: true, text: async () => '# 标题\n\n正文一段。' })) as unknown as typeof fetch)
    const { container } = render(
      <MemoryRouter initialEntries={[`/first-book/${encodeURIComponent(first!.file)}`]}>
        <Routes>
          <Route path="/first-book/:file" element={<FirstBook />} />
        </Routes>
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByText('正文一段。')).toBeTruthy())
    expect(container.querySelector('.book-reader')).toBeTruthy()
    expect(container.querySelector('.book-pager')).toBeTruthy()
  })
})
```

先确认 `PARTS` 是否已 `export`：`grep -n "const PARTS" src/pages/FirstBook.tsx`。若未导出，不要修改导出，改为在测试里写死一个已存在的章节文件名：`ls public/first-book | head`，取第一个 `第1章-*.md` 的真实文件名替换 `first!.file`。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/pages/FirstBookStyle.test.tsx`
Expected: FAIL（没有 `.book-reader`）

- [ ] **Step 3: 改 `FirstBook.tsx`**

1. 章节阅读卡片：把 `<div style={{ ...cardStyle, lineHeight: 1.8, fontSize: '0.97rem' }}>` 改为 `<div className="book-reader" style={cardStyle}>`。
2. 翻页容器：把 `<div style={{ display: 'flex', gap: '12px', marginBottom: '28px' }}>` 改为 `<div className="book-pager" style={{ display: 'flex', gap: '12px', marginBottom: '28px' }}>`。
3. 颜色字面量换变量（只替换这几类，保持其余不动）：`'var(--system-blue, #007aff)'` → `'var(--accent)'`；`'#6e6e73'`、`'#8e8e93'`、`'#aeaeb2'` → `'var(--text-secondary)'`；`'#ff3b30'` → `'var(--up)'`；`'rgba(0,0,0,0.06)'`（行内代码背景）→ `'var(--system-gray6)'`；`'1px solid rgba(0,0,0,0.1)'`（`hr`）→ `'1px solid var(--border-subtle)'`。注意 `STATUS_COLOR` 常量里的颜色，若是 `#xxxxxx` 字面量，改成对应变量：已完成 `var(--down)`、草稿 `var(--accent-warm)`、待写 `var(--system-gray)`（先 `Read` 常量原值再对应改）。
4. `cardStyle` 常量里的 `backdropFilter`、`WebkitBackdropFilter`、`boxShadow`、`border: '1px solid rgba(255,255,255,0.7)'` 删除，`border` 改为 `'1px solid var(--border-subtle)'`，`borderRadius: 'var(--radius-lg)'`、`background: 'var(--bg-card)'` 保持。

- [ ] **Step 4: 改 `MyBooks.tsx`**

- 去掉卡片内联的 `boxShadow` 与半透明白边框，改 `border: '1px solid var(--border-subtle)'`；
- `color="var(--system-blue, #007aff)"` 与链接文字颜色改 `var(--accent)`；
- 描述文字 `color: '#6e6e73'` 改 `var(--text-secondary)`；
- `<h1 style={{ margin: '0 0 24px', fontSize: '1.7rem' }}>` 保持。

- [ ] **Step 5: 追加到 `src/styles/shell.css`**

```css
/* ---------- 书稿阅读 ---------- */
.book-reader {
  padding: 20px 16px !important;
  font-size: 17px;
  line-height: 1.9 !important;
  overflow-wrap: anywhere;
}

.book-reader h1,
.book-reader h2,
.book-reader h3 {
  font-family: var(--font-serif);
}

.book-reader p {
  margin: 12px 0;
}

.book-reader table {
  display: block;
  max-width: 100%;
  overflow-x: auto;
}

.book-reader pre {
  max-width: 100%;
  overflow-x: auto;
}

.book-reader blockquote {
  margin: 14px 0;
  padding: 4px 14px;
  border-left: 3px solid var(--accent-warm);
  background: var(--accent-warm-soft);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.book-pager {
  flex-direction: column;
}

.book-pager > a,
.book-pager > div {
  min-height: 44px;
}

@media (min-width: 768px) {
  .book-reader {
    padding: 40px 48px !important;
    font-size: 18px;
    line-height: 2 !important;
  }

  .book-pager {
    flex-direction: row;
  }
}
```

`book-pager` 的子元素原本是 `flex: 1` 的 `Link`，手机上改为纵向堆叠，不会被挤窄。

- [ ] **Step 6: 运行测试**

Run: `npx vitest run src/pages/FirstBookStyle.test.tsx`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src/pages/FirstBook.tsx src/pages/MyBooks.tsx src/pages/FirstBookStyle.test.tsx src/styles/shell.css
git commit -m "feat(site): 书稿阅读页与我的书换新样式并适配手机" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 第一阶段整体验证（含手机）

**Files:**
- Modify: `src/pages/About.tsx`（只换颜色/卡片样式，保持测试通过）
- 其余只读验证

- [ ] **Step 1: About 页换肤**

`About.tsx` 的 `cardStyle` 删除 `backdropFilter`、`WebkitBackdropFilter`、`boxShadow`，`border` 改 `'1px solid var(--border-subtle)'`，`padding` 改 `'20px'`。不改文案与结构（`About.test.tsx` 依赖）。

- [ ] **Step 2: 全量测试与类型检查与构建**

Run: `npm test`
Expected: 全部 PASS。若有旧测试因文案变化失败（例如断言“Hassan投资”），只改断言文案为新文案，不改被测逻辑；若失败与本次改动无关，先 `git stash` 对比确认是原有失败，并在汇报里单独列出，不要掩盖。

Run: `npm run typecheck && npm run build`
Expected: 无错误；`dist/` 生成。

- [ ] **Step 3: 浏览器验证（桌面 + 手机）**

启动：`npm run dev`（后台），用 Claude in Chrome（先加载其工具）依次：

1. `resize_window` 到 390×844，打开 `http://localhost:5173/`：确认首屏无需滚动即可看到书名、副标题、「开始阅读」；用 `javascript_tool` 执行 `document.documentElement.scrollWidth <= window.innerWidth`，应为 `true`。
2. 点菜单按钮：抽屉出现，5 项，按 Esc 关闭。
3. 依次打开 `/invest`、`/valuation`、`/grid-trading/records`、`/first-book`、一章阅读页、`/sector-rotation`、`/trading-philosophy`、`/about`：每页重复 `scrollWidth` 检查并截图；记录有横向溢出的页面。
4. 把宽度改为 360×740 重复 1、3。
5. 改为 1280×800 重复首页、`/invest`、一章阅读页、`/valuation`，截图目检。

对每个 `scrollWidth > innerWidth` 的页面：用 `javascript_tool` 找出溢出元素：

```js
[...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 8).map(e => e.tagName + '.' + e.className)
```

老页面（`TradingPhilosophy`、`SectorRotation`、`Pulse` 等）若溢出，给其最外层容器加 `overflow-x: auto` 或把固定宽度改为 `min(100%, Npx)`，只做最小修改，并在提交信息里列出页面。

- [ ] **Step 4: 提交**

```bash
git add src/pages/About.tsx
# 加上 Step 3 中为修复溢出而改的具体文件
git commit -m "feat(site): 第一阶段验收：About 换肤与移动端溢出修复" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: 向用户汇报并等待确认再进入第二阶段**

汇报：测试/构建结果，桌面与手机截图，发现并修复的溢出页面，仍存在的问题。第二阶段由用户确认后再做。

---

### Task 9（第二阶段，需用户确认后执行）: 老页面硬编码颜色清理

**Files:**
- Create: `scripts/retheme-colors.mjs`
- Modify: `src/pages/TradingPhilosophy.tsx`、`Pulse.tsx`、`SectorRotation.tsx`、`ResearchNotes.tsx`、`InvestmentStrategy.tsx`、`LimitUpAnalysis.tsx`、`CompanyDetail.tsx`、`InvestmentPlan2026.tsx`、`Monitor.tsx`、`IndustryLandscape.tsx`、`src/components/AIDiffusion.tsx`、`src/components/TableStyles.tsx`
- Test: 各页面现有测试 + `scripts/retheme-colors.test.mjs`

**Interfaces:**
- Produces: `retheme(source: string): { output: string; count: number }`，纯函数，导出供测试；CLI 用法 `node scripts/retheme-colors.mjs <file...>`，原地改写并打印每个文件替换数。

前置检查：`grep -rln "getContext\|fillStyle" src` 在第一阶段已确认无结果；若之后新增了 canvas 代码，脚本必须跳过含这些关键字的行（脚本已实现）。

- [ ] **Step 1: 写失败的测试**

```js
// scripts/retheme-colors.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { retheme } from './retheme-colors.mjs'

test('苹果系统色字面量换成变量', () => {
  const { output, count } = retheme(`color: '#007AFF', background: '#f5f5f7'`)
  assert.equal(output, `color: 'var(--system-blue)', background: 'var(--bg-primary)'`)
  assert.equal(count, 2)
})

test('大小写不敏感', () => {
  assert.equal(retheme(`'#007aff'`).output, `'var(--system-blue)'`)
})

test('rgba 系统色换成 color-mix，保留透明度', () => {
  const { output } = retheme(`background: 'rgba(0, 122, 255, 0.1)'`)
  assert.equal(output, `background: 'color-mix(in srgb, var(--system-blue) 10%, transparent)'`)
})

test('含 canvas 关键字的行不改', () => {
  const line = `ctx.fillStyle = '#007AFF'`
  assert.equal(retheme(line).output, line)
  assert.equal(retheme(line).count, 0)
})

test('不认识的颜色不改', () => {
  const line = `color: '#123456'`
  assert.equal(retheme(line).output, line)
})

test('幂等：再跑一遍不再变化', () => {
  const once = retheme(`'#34C759'`).output
  assert.equal(retheme(once).output, once)
})
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test scripts/retheme-colors.test.mjs`
Expected: FAIL，找不到模块

- [ ] **Step 3: 实现 `scripts/retheme-colors.mjs`**

```js
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const HEX = {
  '#007aff': 'var(--system-blue)',
  '#5856d6': 'var(--system-indigo)',
  '#af52de': 'var(--system-purple)',
  '#ff2d55': 'var(--system-pink)',
  '#ff3b30': 'var(--system-red)',
  '#ff9500': 'var(--system-orange)',
  '#ffcc00': 'var(--system-yellow)',
  '#34c759': 'var(--system-green)',
  '#5ac8fa': 'var(--system-teal)',
  '#32ade6': 'var(--system-cyan)',
  '#8e8e93': 'var(--system-gray)',
  '#aeaeb2': 'var(--system-gray2)',
  '#c7c7cc': 'var(--system-gray3)',
  '#d1d1d6': 'var(--system-gray4)',
  '#e5e5ea': 'var(--system-gray5)',
  '#f2f2f7': 'var(--system-gray6)',
  '#1d1d1f': 'var(--text-primary)',
  '#86868b': 'var(--text-secondary)',
  '#6e6e73': 'var(--text-secondary)',
  '#f5f5f7': 'var(--bg-primary)',
}

const RGB = {
  '0,122,255': '--system-blue',
  '88,86,214': '--system-indigo',
  '175,82,222': '--system-purple',
  '255,45,85': '--system-pink',
  '255,59,48': '--system-red',
  '255,149,0': '--system-orange',
  '255,204,0': '--system-yellow',
  '52,199,89': '--system-green',
  '90,200,250': '--system-teal',
}

const SKIP_LINE = /getContext|fillStyle|strokeStyle|ctx\./

export function retheme(source) {
  let count = 0
  const output = source
    .split('\n')
    .map(line => {
      if (SKIP_LINE.test(line)) return line
      let out = line.replace(/#[0-9a-fA-F]{6}\b/g, m => {
        const v = HEX[m.toLowerCase()]
        if (!v) return m
        count += 1
        return v
      })
      out = out.replace(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)/g, (m, r, g, b, a) => {
        const name = RGB[`${r},${g},${b}`]
        if (!name) return m
        count += 1
        const pct = Math.round(parseFloat(a) * 100)
        return `color-mix(in srgb, var(${name}) ${pct}%, transparent)`
      })
      return out
    })
    .join('\n')
  return { output, count }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const file of process.argv.slice(2)) {
    const src = readFileSync(file, 'utf8')
    const { output, count } = retheme(src)
    if (count > 0) writeFileSync(file, output)
    console.log(`${String(count).padStart(4)}  ${file}`)
  }
}
```

- [ ] **Step 4: 运行测试**

Run: `node --test scripts/retheme-colors.test.mjs`
Expected: PASS（6 个用例）

- [ ] **Step 5: 逐页执行并验证（一页一提交）**

对下列文件依次执行，每个文件：

```bash
node scripts/retheme-colors.mjs src/pages/TradingPhilosophy.tsx
git diff --stat src/pages/TradingPhilosophy.tsx
npx tsc --noEmit -p tsconfig.json
npx vitest run src/pages/ --reporter=dot
```

顺序：`TradingPhilosophy` → `Pulse` → `SectorRotation` → `ResearchNotes` → `InvestmentStrategy` → `LimitUpAnalysis` → `CompanyDetail` → `InvestmentPlan2026` → `Monitor` → `IndustryLandscape` → `components/AIDiffusion` → `components/TableStyles`。

每个文件改完后，用浏览器（390 和 1280 宽）打开对应路由截图，检查：白底白字、深色块上深色字、涨跌红绿是否仍符合 A 股习惯（红涨绿跌）、渐变背景是否突兀。发现问题就在该文件里手工微调，不回滚脚本。

注意：`IndustryLandscape.tsx` 是用户尚未做过提交的文件，Task 4 已将其提交，所以这里的改动是独立可回滚的提交。

每页一个提交：

```bash
git add src/pages/TradingPhilosophy.tsx
git commit -m "style(site): TradingPhilosophy 硬编码颜色换为设计变量" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: 收尾核查**

Run: `grep -rnE "#(007aff|5856d6|af52de|ff2d55|ff3b30|ff9500|34c759|5ac8fa|32ade6|f5f5f7|1d1d1f)" src --include=*.tsx -i | grep -v test | head -20`
Expected: 无输出，或只剩 canvas 行与有意保留的颜色（列入汇报）。

Run: `npm test && npm run typecheck && npm run build`
Expected: 全部通过。

---

## Self-Review 记录

- **Spec 覆盖**：目标 1–6 → Task 3/4/5（导航、路由）、Task 8（构建验证、手机验证）；信息架构 → Task 2/5/6；视觉系统 → Task 1/7；移动端 3.1 → Task 1（viewport-fit、44px、16px）、Task 3（抽屉、Esc、锁滚动、safe-area）、Task 4（切换条横向滚动并滚入视口）、Task 6（首屏）、Task 7（阅读页）、Task 8（360/390/1280 实测）；第二阶段 → Task 9；约束（用户未提交文件）→ Global Constraints 与 Task 4/8 提交说明。
- **类型一致**：`NavItem/HubLink/HubGroup/NAV_ITEMS/INVEST_GROUPS/findInvestEntry/isNavActive` 在 Task 2 定义，Task 3/4/5 按原名使用；`QUOTES` 在 Task 6 定义并使用；类名 `site-*`、`section-*`、`hub-*`、`book-*` 在 CSS 与 TSX 中一致。
- **已知需在执行时现场确认的点**：`PARTS` 是否 `export`（Task 7 Step 1 已给备选）、`STATUS_COLOR` 原值（Task 7 Step 3 要求先读）、`fadeInScale` 是否仍被引用（Task 1 Step 3 给了检查与补救）。
