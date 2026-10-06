# AI实验室 栏目重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/ai` 改成「作品橱窗 + 方向地图（推荐/不推荐，按匹配度排序打标记）+ 每个方向的实验档案页 `/ai/:slug`」。

**Architecture:** 全部内容放在数据文件 `src/data/aiLab.ts`，导出数据与排序/查找函数；`AiStudio` 页与新的 `AiLabDirection` 页只负责渲染；方向卡抽成 `src/components/lab/LabDirectionCard.tsx` 供列表复用。样式追加到 `src/styles/shell.css`（站点外壳与栏目样式都在这里，`.hub-card` 也在此）。

**Tech Stack:** React 18 + TypeScript、react-router-dom v6、Vitest + Testing Library、Vite。

**Spec:** `docs/superpowers/specs/2026-10-06-ai-lab-redesign-design.md`

## Global Constraints

- 只放真实内容：不写收入、用户数等未发生的结果；无日志的方向显示“还没开始。开始后会在这里公开记录。”
- 共 11 个方向；标记文案固定：强烈推荐 / 推荐 / 可以试 / 实验 / 不推荐。
- 星级用 ★/☆ 字符，并带 `aria-label="匹配度 N/5"`；标记是文字徽章，不只靠颜色。
- 点击目标 ≥ 44px；页面无横向滚动（作品橱窗容器内部滚动除外）；断点 768px。
- 沿用「纸书茶室」CSS 变量（`--accent`、`--accent-warm`、`--text-secondary`、`--bg-card`、`--border-subtle`、`--radius-lg`、`--font-serif`），不引入新颜色。
- `dropshipping` 必须有预算 ¥5000、期限 3 个月、停止条件“到期未盈利即停”。
- 现有路由与 `/ai`、`/life` 路径不变；工作区里已有大量未提交改动，每次提交只 `git add` 本任务列出的文件。

## Review Focus

1. 直接打开或刷新 `/ai/blog` 这类深链：应正常渲染详情页（路由表须有 `/ai/:slug`）——Task 3 用 App.tsx 源码断言覆盖。
2. 输入错误的 slug（`/ai/xxx`）：显示 404，而不是空白页或报错——Task 3 测试覆盖。
3. 不推荐方向的详情页：标题应为「为什么不做」且不出现日志块与“还没开始”文案——Task 3 测试覆盖。
4. 窄屏下作品橱窗横向滑动不应撑出整页横向滚动——Task 2 CSS 中橱窗 `overflow-x:auto` 且 `.lab-page` 设 `overflow-x: clip`，测试断言类名存在。
5. 数据里出现重复 slug 会导致两张卡链到同一页——Task 1 测试断言 slug 唯一。

---

### Task 1: 数据模块 `aiLab.ts`

**Files:**
- Create: `src/data/aiLab.ts`
- Test: `src/data/aiLab.test.ts`

**Interfaces:**
- Produces（后续任务依赖）：
  - `type LabVerdict = 'strong' | 'recommend' | 'try' | 'experiment' | 'avoid'`
  - `type LabStatus = '进行中' | '计划中' | '未开始' | '已暂停' | '已停止' | '不做'`
  - `interface LabShowcaseItem { title: string; desc: string; path: string }`
  - `interface LabLogEntry { date: string; did: string; result: string }`
  - `interface LabDirection { slug; title; verdict; fit: 1|2|3|4|5; status; reason; why; hoursPerWeek?: number; startCost?: string; limits?: { budget?: string; deadline?: string; stopWhen?: string }; firstStep?: string; logs: LabLogEntry[] }`
  - `VERDICT_LABEL: Record<LabVerdict, string>`、`LAB_SHOWCASE`、`LAB_DIRECTIONS`
  - `recommendedDirections(): LabDirection[]`、`avoidedDirections(): LabDirection[]`、`findDirection(slug: string): LabDirection | undefined`、`labStats(): { works: number; running: number; stopped: number }`

- [ ] **Step 1: 写失败测试** `src/data/aiLab.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import {
  LAB_DIRECTIONS, LAB_SHOWCASE, VERDICT_LABEL,
  avoidedDirections, findDirection, labStats, recommendedDirections,
} from './aiLab'

describe('aiLab 数据', () => {
  it('共 11 个方向，slug 唯一', () => {
    expect(LAB_DIRECTIONS).toHaveLength(11)
    const slugs = LAB_DIRECTIONS.map(d => d.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('标记文案固定', () => {
    expect(VERDICT_LABEL).toEqual({
      strong: '强烈推荐', recommend: '推荐', try: '可以试', experiment: '实验', avoid: '不推荐',
    })
    for (const d of LAB_DIRECTIONS) expect(VERDICT_LABEL[d.verdict], d.slug).toBeTruthy()
  })

  it('推荐组按匹配度降序且不含不推荐；同分保持原顺序', () => {
    const rec = recommendedDirections()
    expect(rec).toHaveLength(8)
    expect(rec.every(d => d.verdict !== 'avoid')).toBe(true)
    for (let i = 1; i < rec.length; i++) expect(rec[i - 1].fit).toBeGreaterThanOrEqual(rec[i].fit)
    expect(rec.map(d => d.slug)).toEqual([
      'ai-skills', 'indie-dev', 'free-tools', 'digital-goods', 'blog', 'newsletter', 'video', 'dropshipping',
    ])
  })

  it('不推荐组 3 个，全部是 avoid', () => {
    expect(avoidedDirections().map(d => d.slug)).toEqual(['outsourcing', 'content-farm', 'paid-signals'])
  })

  it('findDirection 命中与未命中', () => {
    expect(findDirection('blog')?.title).toBe('博客')
    expect(findDirection('nope')).toBeUndefined()
  })

  it('labStats 与数据一致', () => {
    expect(labStats()).toEqual({
      works: LAB_SHOWCASE.length,
      running: LAB_DIRECTIONS.filter(d => d.status === '进行中').length,
      stopped: LAB_DIRECTIONS.filter(d => d.status === '已停止').length,
    })
    expect(labStats()).toEqual({ works: 4, running: 2, stopped: 0 })
  })

  it('无货源电商带预算、期限与停止条件', () => {
    const d = findDirection('dropshipping')!
    expect(d.verdict).toBe('experiment')
    expect(d.limits).toEqual({ budget: '¥5000', deadline: '3 个月', stopWhen: '到期未盈利即停' })
  })

  it('只有已发生的事才有日志', () => {
    const withLogs = LAB_DIRECTIONS.filter(d => d.logs.length > 0).map(d => d.slug)
    expect(withLogs.sort()).toEqual(['ai-skills', 'indie-dev'])
    for (const d of LAB_DIRECTIONS) for (const l of d.logs) expect(l.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('作品橱窗 4 个站内链接', () => {
    expect(LAB_SHOWCASE.map(s => s.path)).toEqual(['/invest/ai-tools', '/valuation', '/grid-trading', '/about'])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/data/aiLab.test.ts`
Expected: FAIL，`Failed to resolve import "./aiLab"`

- [ ] **Step 3: 实现** `src/data/aiLab.ts`

```ts
export type LabVerdict = 'strong' | 'recommend' | 'try' | 'experiment' | 'avoid'
export type LabStatus = '进行中' | '计划中' | '未开始' | '已暂停' | '已停止' | '不做'

export interface LabShowcaseItem {
  title: string
  desc: string
  path: string
}

export interface LabLogEntry {
  date: string
  did: string
  result: string
}

export interface LabDirection {
  slug: string
  title: string
  verdict: LabVerdict
  fit: 1 | 2 | 3 | 4 | 5
  status: LabStatus
  /** 卡片上的一句理由 */
  reason: string
  /** 详情页：为什么做 / 为什么不做 */
  why: string
  hoursPerWeek?: number
  startCost?: string
  limits?: { budget?: string; deadline?: string; stopWhen?: string }
  firstStep?: string
  /** 只记已经发生的事，没开始就留空 */
  logs: LabLogEntry[]
}

export const VERDICT_LABEL: Record<LabVerdict, string> = {
  strong: '强烈推荐',
  recommend: '推荐',
  try: '可以试',
  experiment: '实验',
  avoid: '不推荐',
}

// 只放已经做出来、能直接用的东西
export const LAB_SHOWCASE: LabShowcaseItem[] = [
  { title: '投资分析 Skill 包', desc: '三套投资分析 Skill 专家，可完整下载', path: '/invest/ai-tools' },
  { title: '公司估值', desc: '六方法三情景估值与报告导出', path: '/valuation' },
  { title: '网格交易', desc: 'ETF / 个股网格模拟、回测与记录', path: '/grid-trading' },
  { title: '这个网站', desc: '用 React 自己搭的个人站，本身就是第一个作品', path: '/about' },
]

// 顺序即同分时的展示顺序
export const LAB_DIRECTIONS: LabDirection[] = [
  {
    slug: 'ai-skills',
    title: 'AI 工具 / Skill / Agent',
    verdict: 'strong',
    fit: 5,
    status: '进行中',
    reason: '已有三套投资 Skill，新领域有先发优势',
    why: '把自己反复做的事写成 Skill、Agent 或 MCP，先给自己用，再公开分享。程序员加投资作者的组合刚好能做出别人做不出的专业 Skill，而且这个领域还很新。',
    hoursPerWeek: 3,
    startCost: '¥0',
    firstStep: '把三套投资 Skill 的使用反馈整理出来，挑最常用的一个做成可单独安装的版本。',
    logs: [
      { date: '2026-10-06', did: '发布三套投资分析 Skill 的介绍页与完整下载包', result: '已上线到「正念投资 › AI 工具」' },
    ],
  },
  {
    slug: 'indie-dev',
    title: '独立产品开发',
    verdict: 'strong',
    fit: 5,
    status: '进行中',
    reason: '程序员本行，第一个产品从书里长出来',
    why: '路线是：建站 → 正念投资 AI V0.1 → 公开验证。V0.1 输入一家公司，按书里的框架一步步提问：分类、产业、商业模式、护城河、财报、估值、周期、证伪条件，最后生成投资决策卡，不预测涨跌。',
    hoursPerWeek: 4,
    startCost: '¥0',
    limits: { stopWhen: '找不到 20 个愿意持续使用的真实用户，就回到框架本身重新想' },
    firstStep: '做出正念投资 AI V0.1 的最小版本，找 20 个真实用户试用。',
    logs: [
      { date: '2026-10-04', did: '个人网站改版为「正念生活」，按书重组栏目', result: '网站作为第一个作品上线' },
    ],
  },
  {
    slug: 'free-tools',
    title: '免费在线工具',
    verdict: 'recommend',
    fit: 4,
    status: '未开始',
    reason: '做一次长期获客，和书互相引流',
    why: '比如 FIRE / 400 万倒计时计算器、家庭财务体检、定投回测。工具解决一个具体问题，用的人会顺着找到书和其他作品。',
    hoursPerWeek: 2,
    startCost: '¥0',
    firstStep: '先做一个 FIRE 倒计时计算器：输入资产、储蓄率、预期收益，算出离目标还有几年。',
    logs: [],
  },
  {
    slug: 'digital-goods',
    title: '数字商品',
    verdict: 'recommend',
    fit: 4,
    status: '未开始',
    reason: '无库存、几乎不用客服',
    why: '书的电子版、投资计划 Notion / Excel 模板、Skill 完整包、小册子。做一次可以卖很多次，和个人定位最搭。',
    hoursPerWeek: 2,
    startCost: '¥0',
    firstStep: '把 2026 投资计划整理成一份可复制的模板，先免费发，看有多少人要。',
    logs: [],
  },
  {
    slug: 'blog',
    title: '博客',
    verdict: 'recommend',
    fit: 4,
    status: '未开始',
    reason: '沉淀自己的读者，也整理思路',
    why: '写 AI 编程实践、副业实验复盘、工具背后的思考。写作本身就是整理思路，文章也是其他方向的入口。',
    hoursPerWeek: 2,
    startCost: '¥0',
    firstStep: '每两周一篇，第一篇写这个 AI 实验室为什么这样分方向。',
    logs: [],
  },
  {
    slug: 'newsletter',
    title: 'Newsletter',
    verdict: 'recommend',
    fit: 3,
    status: '计划中',
    reason: '读者归自己，等有读者再开',
    why: '每月一封：实验进展加投资计划执行情况。读者是自己的，不受平台推荐影响。读者太少时发出去没有回应，所以放在博客之后。',
    hoursPerWeek: 1,
    startCost: '¥0',
    firstStep: '博客写满 6 篇后再开订阅。',
    logs: [],
  },
  {
    slug: 'video',
    title: '视频',
    verdict: 'try',
    fit: 3,
    status: '未开始',
    reason: '曝光大但很耗时，先做录屏 + 字幕',
    why: '视频平台曝光最大，但一条像样的视频至少 3 到 5 小时，和每周几小时的预算冲突。先用最低成本的形式试：工具演示录屏加字幕。',
    hoursPerWeek: 2,
    startCost: '¥0',
    limits: { deadline: '先做 5 条', stopWhen: '5 条之后看播放与反馈，没有起色就停' },
    firstStep: '录一条「公司估值」工具的使用演示。',
    logs: [],
  },
  {
    slug: 'dropshipping',
    title: '无货源电商',
    verdict: 'experiment',
    fit: 2,
    status: '未开始',
    reason: '和优势关系不大，限 3 个月 / ¥5000',
    why: '这个模式拼的是选品、价格战、平台规则和客服，很吃时间，利润也越来越薄，和程序员的优势关系不大。可以当一次实验来了解电商，但先定死边界。',
    hoursPerWeek: 3,
    startCost: '¥5000 以内',
    limits: { budget: '¥5000', deadline: '3 个月', stopWhen: '到期未盈利即停' },
    firstStep: '开始前先写好选品规则和每周记账表，再决定平台。',
    logs: [],
  },
  {
    slug: 'outsourcing',
    title: 'AI 外包接单',
    verdict: 'avoid',
    fit: 1,
    status: '不做',
    reason: '仍是拿时间换钱，和时间自主相反',
    why: '接单本质上是换一个老板拿时间换钱，需求和节奏都由别人定，正是离开全职工作想摆脱的东西。',
    logs: [],
  },
  {
    slug: 'content-farm',
    title: '代写 / 内容农场',
    verdict: 'avoid',
    fit: 1,
    status: '不做',
    reason: '损害个人品牌，平台规则风险高',
    why: '用 AI 批量产出低质内容换流量，短期也许有收入，但会损害个人品牌，平台规则一变就归零。',
    logs: [],
  },
  {
    slug: 'paid-signals',
    title: '付费投资群 / 荐股',
    verdict: 'avoid',
    fit: 1,
    status: '不做',
    reason: '违背书里“不荐股”，且有合规风险',
    why: '书的核心是不盯盘、不预测、不荐股。收费荐股既违背这个原则，又有证券投资咨询的合规风险。',
    logs: [],
  },
]

export function recommendedDirections(): LabDirection[] {
  // Array.prototype.sort 是稳定排序，同分保持数据里的顺序
  return LAB_DIRECTIONS.filter(d => d.verdict !== 'avoid').sort((a, b) => b.fit - a.fit)
}

export function avoidedDirections(): LabDirection[] {
  return LAB_DIRECTIONS.filter(d => d.verdict === 'avoid')
}

export function findDirection(slug: string): LabDirection | undefined {
  return LAB_DIRECTIONS.find(d => d.slug === slug)
}

export function labStats(): { works: number; running: number; stopped: number } {
  return {
    works: LAB_SHOWCASE.length,
    running: LAB_DIRECTIONS.filter(d => d.status === '进行中').length,
    stopped: LAB_DIRECTIONS.filter(d => d.status === '已停止').length,
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/data/aiLab.test.ts`
Expected: 9 passed

- [ ] **Step 5: 提交**

```bash
git add src/data/aiLab.ts src/data/aiLab.test.ts
git commit -m "feat(ai-lab): AI实验室方向与作品数据"
```

---

### Task 2: 方向卡组件 + `/ai` 页面重写 + 样式

**Files:**
- Create: `src/components/lab/LabDirectionCard.tsx`
- Modify: `src/pages/AiStudio.tsx`（整文件重写）
- Modify: `src/styles/shell.css`（文件末尾追加 AI 实验室区块）
- Create: `src/pages/AiStudio.test.tsx`
- Modify: `src/pages/Sections.test.tsx`（删除旧的 “AiStudio 标出‘准备中’并给出路线” 用例与 `AiStudio` import）

**Interfaces:**
- Consumes: Task 1 的 `LAB_SHOWCASE`、`VERDICT_LABEL`、`recommendedDirections`、`avoidedDirections`、`labStats`、`LabDirection`
- Produces: `LabDirectionCard({ direction }: { direction: LabDirection }): JSX.Element`；`Stars({ fit }: { fit: number }): JSX.Element`（同文件导出，Task 3 复用）；`VerdictBadge({ verdict }: { verdict: LabVerdict }): JSX.Element`（同文件导出）

- [ ] **Step 1: 写失败测试** `src/pages/AiStudio.test.tsx`

```tsx
import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import AiStudio from './AiStudio'
import { LAB_SHOWCASE, avoidedDirections, recommendedDirections } from '../data/aiLab'

afterEach(cleanup)

const wrap = () => render(<MemoryRouter><AiStudio /></MemoryRouter>)

describe('AiStudio', () => {
  it('页头：标题与统计', () => {
    wrap()
    expect(screen.getByRole('heading', { level: 1, name: 'AI实验室' })).toBeTruthy()
    expect(screen.getByText('作品 4 · 进行中 2 · 已停止 0')).toBeTruthy()
  })

  it('作品橱窗 4 个链接，放在可横向滑动的容器里', () => {
    const { container } = wrap()
    const shelf = container.querySelector('.lab-showcase') as HTMLElement
    expect(shelf).toBeTruthy()
    expect(within(shelf).getAllByRole('link').map(a => a.getAttribute('href'))).toEqual(LAB_SHOWCASE.map(s => s.path))
    expect(container.querySelector('main')?.classList.contains('lab-page')).toBe(true)
  })

  it('推荐组卡片顺序与数据排序一致，每张卡带标记、星级、状态', () => {
    wrap()
    const section = screen.getByRole('heading', { level: 2, name: '推荐方向' }).closest('section') as HTMLElement
    const links = within(section).getAllByRole('link')
    expect(links.map(a => a.getAttribute('href'))).toEqual(recommendedDirections().map(d => `/ai/${d.slug}`))
    const first = links[0]
    expect(within(first).getByText('强烈推荐')).toBeTruthy()
    expect(within(first).getByLabelText('匹配度 5/5')).toBeTruthy()
    expect(within(first).getByText('进行中')).toBeTruthy()
  })

  it('无货源电商卡片标为“实验”', () => {
    wrap()
    const card = screen.getByRole('link', { name: /无货源电商/ })
    expect(within(card).getByText('实验')).toBeTruthy()
    expect(within(card).getByLabelText('匹配度 2/5')).toBeTruthy()
  })

  it('不推荐组在默认收起的 details 里，写明数量', () => {
    const { container } = wrap()
    const fold = container.querySelector('details') as HTMLDetailsElement
    expect(fold.open).toBe(false)
    expect(fold.querySelector('summary')?.textContent).toBe(`不推荐（${avoidedDirections().length}）`)
    expect(within(fold).getAllByRole('link').map(a => a.getAttribute('href'))).toEqual(
      avoidedDirections().map(d => `/ai/${d.slug}`)
    )
  })

  it('最后是实验规则', () => {
    wrap()
    expect(screen.getByRole('heading', { level: 2, name: '实验规则' })).toBeTruthy()
  })
})
```

同时在 `src/pages/Sections.test.tsx` 中：删掉 `import AiStudio from './AiStudio'` 一行，删掉 `it('AiStudio 标出“准备中”并给出路线', ...)` 整个用例，并把 `describe('AiStudio / LifeLab'` 改名为 `describe('LifeLab'`。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/pages/AiStudio.test.tsx`
Expected: FAIL（找不到“作品 4 · 进行中 2 · 已停止 0”等）

- [ ] **Step 3: 实现组件** `src/components/lab/LabDirectionCard.tsx`

```tsx
import React from 'react'
import { Link } from 'react-router-dom'
import { VERDICT_LABEL, type LabDirection, type LabVerdict } from '../../data/aiLab'

export function Stars({ fit }: { fit: number }): JSX.Element {
  return (
    <span className="lab-stars" role="img" aria-label={`匹配度 ${fit}/5`}>
      {'★'.repeat(fit)}{'☆'.repeat(5 - fit)}
    </span>
  )
}

export function VerdictBadge({ verdict }: { verdict: LabVerdict }): JSX.Element {
  return <span className={`lab-badge lab-badge--${verdict}`}>{VERDICT_LABEL[verdict]}</span>
}

function costLine(d: LabDirection): string {
  const parts: string[] = []
  if (d.hoursPerWeek !== undefined) parts.push(`每周 ${d.hoursPerWeek}h`)
  if (d.startCost) parts.push(`启动 ${d.startCost}`)
  return parts.join(' · ')
}

export default function LabDirectionCard({ direction: d }: { direction: LabDirection }): JSX.Element {
  const cost = costLine(d)
  return (
    <Link to={`/ai/${d.slug}`} className={`lab-card lab-card--${d.verdict}`}>
      <span className="lab-card__meta">
        <VerdictBadge verdict={d.verdict} />
        <Stars fit={d.fit} />
        <span className="tag lab-card__status">{d.status}</span>
      </span>
      <span className="lab-card__title">{d.title}</span>
      <span className="lab-card__reason">{d.reason}</span>
      {cost && <span className="lab-card__cost">{cost}</span>}
    </Link>
  )
}
```

- [ ] **Step 4: 重写页面** `src/pages/AiStudio.tsx`

```tsx
import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import LabDirectionCard from '../components/lab/LabDirectionCard'
import { LAB_SHOWCASE, avoidedDirections, labStats, recommendedDirections } from '../data/aiLab'

export default function AiStudio(): JSX.Element {
  const stats = labStats()
  const avoided = avoidedDirections()
  return (
    <main className="container animate-fade-in lab-page">
      <header className="page-head">
        <h1>AI实验室</h1>
        <p>一个程序员为自由生活准备的第二曲线：开发、工具、内容和小生意，每个方向都当成一次公开实验。</p>
        <p className="lab-stats">作品 {stats.works} · 进行中 {stats.running} · 已停止 {stats.stopped}</p>
      </header>

      <section className="lab-section">
        <h2>作品</h2>
        <div className="lab-showcase">
          {LAB_SHOWCASE.map(s => (
            <Link key={s.path} to={s.path} className="hub-card lab-showcase__item">
              <span className="hub-card__title">{s.title}</span>
              <span className="hub-card__desc">{s.desc}</span>
              <ArrowRight size={16} className="hub-card__arrow" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <section className="lab-section">
        <h2>推荐方向</h2>
        <p className="hub-group__hint">按和我的匹配度从高到低排列。点开看每个实验的边界和日志。</p>
        <div className="lab-grid">
          {recommendedDirections().map(d => <LabDirectionCard key={d.slug} direction={d} />)}
        </div>
      </section>

      <details className="hub-group hub-group--fold lab-section">
        <summary>不推荐（{avoided.length}）</summary>
        <p className="hub-group__hint">这些方向我不做，原因写在每一项里，给想做的人提个醒。</p>
        <div className="lab-grid">
          {avoided.map(d => <LabDirectionCard key={d.slug} direction={d} />)}
        </div>
      </details>

      <section className="lab-section">
        <h2>实验规则</h2>
        <p>每个实验开始前先定好每周时间、预算上限和截止日期；到期看数据，决定继续还是停止。过程和结果都公开记录，没开始的就写“还没开始”。</p>
      </section>
    </main>
  )
}
```

注意 summary 的文本必须是 `不推荐（3）`（JSX `不推荐（{avoided.length}）` 渲染后 textContent 即此）。

- [ ] **Step 5: 追加样式** 到 `src/styles/shell.css` 末尾

```css
/* AI 实验室 */
.lab-page {
  overflow-x: clip;
}

.lab-stats {
  margin-top: 8px;
  color: var(--text-secondary);
  font-size: 0.92rem;
}

.lab-section {
  margin-top: 32px;
}

.lab-section > h2 {
  font-family: var(--font-serif);
  margin-bottom: 12px;
}

.lab-showcase {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  padding-bottom: 8px;
  -webkit-overflow-scrolling: touch;
}

.lab-showcase__item {
  flex: 0 0 78%;
  scroll-snap-align: start;
}

.lab-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

.lab-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 44px;
  padding: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  color: var(--text-primary);
  text-decoration: none;
  transition: border-color 0.2s ease;
}

.lab-card:hover {
  border-color: var(--accent);
}

.lab-card--avoid {
  opacity: 0.85;
}

.lab-card__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
}

.lab-card__status {
  margin-left: auto;
}

.lab-card__title {
  font-family: var(--font-serif);
  font-weight: 600;
  font-size: 1.1rem;
}

.lab-card__reason {
  color: var(--text-primary);
  font-size: 0.95rem;
}

.lab-card__cost {
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.lab-stars {
  color: var(--accent-warm);
  letter-spacing: 1px;
}

.lab-badge {
  display: inline-block;
  padding: 2px 8px;
  border: 1px solid currentColor;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.5;
}

.lab-badge--strong,
.lab-badge--recommend {
  color: var(--accent);
}

.lab-badge--strong {
  background: var(--accent-soft);
}

.lab-badge--try,
.lab-badge--experiment {
  color: var(--accent-warm);
}

.lab-badge--avoid {
  color: var(--text-secondary);
}

.lab-back {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  color: var(--accent);
  text-decoration: none;
}

.lab-detail__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.lab-limits {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 8px 16px;
}

.lab-limits dt {
  color: var(--text-secondary);
}

.lab-limits dd {
  margin: 0;
}

.lab-log {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.lab-log__date {
  color: var(--text-secondary);
  font-size: 0.85rem;
}

@media (min-width: 768px) {
  .lab-showcase {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    overflow-x: visible;
  }

  .lab-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

（`--accent-soft` 已在 `.hub-group--read .hub-card` 中使用，属于现有变量。）

- [ ] **Step 6: 运行确认通过**

Run: `npx vitest run src/pages/AiStudio.test.tsx src/pages/Sections.test.tsx`
Expected: 全部通过

- [ ] **Step 7: 提交**

```bash
git add src/components/lab/LabDirectionCard.tsx src/pages/AiStudio.tsx src/pages/AiStudio.test.tsx src/styles/shell.css src/pages/Sections.test.tsx
git commit -m "feat(ai-lab): AI实验室页改为作品橱窗 + 方向地图"
```

注意：`src/styles/shell.css`、`src/pages/AiStudio.tsx`、`src/pages/Sections.test.tsx` 可能含本任务之前的未提交改动，提交前用 `git diff --cached` 确认，若有无关改动先告知用户。

---

### Task 3: 方向详情页 `/ai/:slug` + 路由

**Files:**
- Create: `src/pages/AiLabDirection.tsx`
- Create: `src/pages/AiLabDirection.test.tsx`
- Modify: `src/App.tsx`（lazy import + 路由）
- Modify: `src/data/siteMap.test.ts`（补 `/ai/:slug` 路由与导航高亮用例）

**Interfaces:**
- Consumes: Task 1 `findDirection`、`LabDirection`；Task 2 `Stars`、`VerdictBadge`（从 `../components/lab/LabDirectionCard` 具名导入）；现有 `NotFound` 默认导出
- Produces: 默认导出 `AiLabDirection(): JSX.Element`

- [ ] **Step 1: 写失败测试** `src/pages/AiLabDirection.test.tsx`

```tsx
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import AiLabDirection from './AiLabDirection'

afterEach(cleanup)

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/ai/:slug" element={<AiLabDirection />} /></Routes>
    </MemoryRouter>
  )

describe('AiLabDirection', () => {
  it('推荐方向：标题、标记、为什么做、返回链接', () => {
    at('/ai/indie-dev')
    expect(screen.getByRole('heading', { level: 1, name: '独立产品开发' })).toBeTruthy()
    expect(screen.getByText('强烈推荐')).toBeTruthy()
    expect(screen.getByLabelText('匹配度 5/5')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: '为什么做' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /AI实验室/ }).getAttribute('href')).toBe('/ai')
  })

  it('有日志的方向显示日志', () => {
    at('/ai/indie-dev')
    expect(screen.getByRole('heading', { level: 2, name: '实验日志' })).toBeTruthy()
    expect(screen.getByText('2026-10-04')).toBeTruthy()
  })

  it('无日志的方向显示“还没开始”', () => {
    at('/ai/blog')
    expect(screen.getByText('还没开始。开始后会在这里公开记录。')).toBeTruthy()
  })

  it('无货源电商显示实验边界', () => {
    at('/ai/dropshipping')
    expect(screen.getByRole('heading', { level: 2, name: '实验边界' })).toBeTruthy()
    expect(screen.getByText('¥5000')).toBeTruthy()
    expect(screen.getByText('3 个月')).toBeTruthy()
    expect(screen.getByText('到期未盈利即停')).toBeTruthy()
  })

  it('不推荐方向：为什么不做，无日志块、无实验边界', () => {
    at('/ai/paid-signals')
    expect(screen.getByRole('heading', { level: 2, name: '为什么不做' })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 2, name: '实验日志' })).toBeNull()
    expect(screen.queryByRole('heading', { level: 2, name: '实验边界' })).toBeNull()
    expect(screen.queryByText(/还没开始/)).toBeNull()
  })

  it('未知 slug 显示 404', () => {
    at('/ai/nope')
    expect(screen.getByRole('heading', { level: 1, name: '这一页不存在' })).toBeTruthy()
  })
})
```

在 `src/data/siteMap.test.ts` 的 `describe('INVEST_GROUPS'` 之前追加：

```ts
describe('AI实验室路由', () => {
  it('App.tsx 有 /ai/:slug 深链路由', () => {
    expect(appSource).toContain('path="/ai/:slug"')
  })

  it('访问方向详情页时导航「AI实验室」高亮', () => {
    expect(isNavActive('/ai', '/ai/blog')).toBe(true)
    expect(isNavActive('/ai', '/aix')).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/pages/AiLabDirection.test.tsx src/data/siteMap.test.ts`
Expected: FAIL（`./AiLabDirection` 无法解析；App.tsx 不含 `/ai/:slug`）

- [ ] **Step 3: 实现页面** `src/pages/AiLabDirection.tsx`

```tsx
import React from 'react'
import { Link, useParams } from 'react-router-dom'
import { Stars, VerdictBadge } from '../components/lab/LabDirectionCard'
import { findDirection, type LabDirection } from '../data/aiLab'
import NotFound from './NotFound'

function limitRows(d: LabDirection): Array<[string, string]> {
  const rows: Array<[string, string]> = []
  if (d.hoursPerWeek !== undefined) rows.push(['每周时间', `${d.hoursPerWeek} 小时`])
  if (d.startCost) rows.push(['启动成本', d.startCost])
  if (d.limits?.budget) rows.push(['预算上限', d.limits.budget])
  if (d.limits?.deadline) rows.push(['期限', d.limits.deadline])
  if (d.limits?.stopWhen) rows.push(['停止条件', d.limits.stopWhen])
  return rows
}

export default function AiLabDirection(): JSX.Element {
  const { slug = '' } = useParams()
  const d = findDirection(slug)
  if (!d) return <NotFound />

  const avoid = d.verdict === 'avoid'
  const rows = avoid ? [] : limitRows(d)
  const logs = [...d.logs].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <main className="container animate-fade-in lab-page">
      <Link to="/ai" className="lab-back">← AI实验室</Link>
      <header className="page-head">
        <h1>{d.title}</h1>
        <div className="lab-detail__meta">
          <VerdictBadge verdict={d.verdict} />
          <Stars fit={d.fit} />
          <span className="tag">{d.status}</span>
        </div>
      </header>

      <section className="lab-section">
        <h2>{avoid ? '为什么不做' : '为什么做'}</h2>
        <p>{d.why}</p>
      </section>

      {rows.length > 0 && (
        <section className="lab-section">
          <h2>实验边界</h2>
          <dl className="lab-limits">
            {rows.map(([k, v]) => (
              <React.Fragment key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </React.Fragment>
            ))}
          </dl>
        </section>
      )}

      {!avoid && d.firstStep && (
        <section className="lab-section">
          <h2>第一步</h2>
          <p>{d.firstStep}</p>
        </section>
      )}

      {!avoid && (
        <section className="lab-section">
          <h2>实验日志</h2>
          {logs.length === 0 ? (
            <p className="hub-group__hint">还没开始。开始后会在这里公开记录。</p>
          ) : (
            <ol className="lab-log">
              {logs.map(l => (
                <li key={l.date + l.did}>
                  <div className="lab-log__date">{l.date}</div>
                  <div>{l.did}</div>
                  <div className="hub-group__hint">{l.result}</div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </main>
  )
}
```

- [ ] **Step 4: 加路由** `src/App.tsx`

在 lazy 区块末尾（`const InvestmentAiTools = lazy(...)` 下一行）加：

```tsx
const AiLabDirection = lazy(() => import('./pages/AiLabDirection'))
```

在 `<Route path="/ai" element={<AiStudio />} />` 下一行加：

```tsx
          <Route path="/ai/:slug" element={<AiLabDirection />} />
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run src/pages/AiLabDirection.test.tsx src/data/siteMap.test.ts`
Expected: 全部通过

- [ ] **Step 6: 提交**

```bash
git add src/pages/AiLabDirection.tsx src/pages/AiLabDirection.test.tsx src/App.tsx src/data/siteMap.test.ts
git commit -m "feat(ai-lab): 方向实验档案页 /ai/:slug"
```

注意：`src/App.tsx`、`src/data/siteMap.test.ts` 已有本任务之前的未提交改动，提交前用 `git diff --cached` 确认；若含无关改动，先告知用户再决定是否一并提交。

---

### Task 4: 全量验证

**Files:** 无新增

- [ ] **Step 1:** Run: `npm test -- --run` → Expected: 全部通过，0 failed
- [ ] **Step 2:** Run: `npm run typecheck` → Expected: 无错误
- [ ] **Step 3:** Run: `npm run build` → Expected: 构建成功，产物中包含 `AiLabDirection` 拆包 chunk
- [ ] **Step 4:** 用 `npm run dev` 在浏览器打开 `/ai`、`/ai/dropshipping`、`/ai/paid-signals`、`/ai/nope`，宽度 390px 与 1280px 各看一次：无整页横向滚动，橱窗手机端可横滑、桌面 4 列，方向卡桌面 2 列。
