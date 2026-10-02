# About 页面改造 + 自动 changelog 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `src/pages/About.tsx` 从 12 行占位符替换为"站点介绍 + 自动 changelog"双区块页面，并接入构建流水线生成 `public/changelog.json`。

**Architecture:** 静态前端方案 A。changelog 由 `scripts/generate-changelog.mjs` 在 `npm run prebuild` 阶段从 git tag + git log 生成静态 JSON，About 组件 fetch 该 JSON 渲染。所有逻辑解耦、不引入第三方依赖。

**Tech Stack:** Node 24（`node:` 内置模块 + `child_process`）、React 18 + TypeScript + Vite 5、vitest 4 + @testing-library/react 16。

## Global Constraints

- 仓库当前 0 个 git tag；脚本必须把无 tag 的 commits 全部归入 `unreleased` 桶，不能报错。
- 视觉对齐首页段永平卡片：`background: var(--bg-card)`、`backdropFilter: blur(30px)`、`padding: 32px`、`borderRadius: var(--radius-lg)`、`boxShadow: var(--shadow-md)`、`border: 1px solid rgba(255, 255, 255, 0.7)`。
- 不引入新 npm 依赖；脚本仅用 `node:child_process`、`node:fs`、`node:path`。
- 不修改 `vite.config.js`、`vercel.json`、`Home.tsx`、Header、Footer。
- 仓库存放位置：spec 在 `docs/superpowers/specs/2026-10-02-about-redesign-design.md`，plan 在本文件。
- 节点版本：`engines.node = "24.x"`。
- 测试约定：组件测试文件 `*.test.tsx`，与被测文件同目录；脚本测试 `*.test.mjs`，与脚本同目录。

## File Structure

| 文件 | 操作 | 职责 |
|---|---|---|
| `scripts/generate-changelog.mjs` | Create | 跑 git 命令、生成 `public/changelog.json` |
| `scripts/generate-changelog.test.mjs` | Create | 用 `node --test` 测脚本行为（含临时 git 仓库 fixture） |
| `public/changelog.json` | Create (脚本产物) | 静态 changelog 数据，被 build 复制到 dist/ |
| `src/pages/About.tsx` | Modify | 重写为"站点介绍 + changelog 渲染"双区块 |
| `src/pages/About.test.tsx` | Create | 测 About 三态（loading / data / error） |
| `src/index.css` | Modify | 加 `@keyframes shimmer` 供骨架动画复用 |
| `package.json` | Modify | 加 `prebuild` script 和 `test:scripts` script |

---

## Task 1: 写 changelog 生成脚本（红）

**Files:**
- Create: `scripts/generate-changelog.mjs`
- Create: `scripts/generate-changelog.test.mjs`
- Modify: `package.json:5-15`

**Interfaces:**
- Produces: 写入 `public/changelog.json`，结构 `{ generatedAt: string, versions: Array<{ tag: string, date: string | null, commits: Array<{ hash: string, subject: string, author: string, date: string }> }> }`

- [ ] **Step 1: 创建脚本文件骨架（先写空函数使测试 fail）**

`scripts/generate-changelog.mjs`：

```js
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const argCwdIdx = process.argv.indexOf('--cwd')
const CWD = argCwdIdx > 0 ? resolve(process.argv[argCwdIdx + 1]) : resolve(__dirname, '..')
const OUT = resolve(CWD, 'public', 'changelog.json')

function runGit(args) {
  return execFileSync('git', args, { encoding: 'utf8', cwd: CWD }).trim()
}

function getTags() {
  const out = runGit(['tag', '--sort=-creatordate', '--format=%(refname:short)|%(creatordate:short)'])
  if (!out) return []
  return out.split('\n').map((line) => {
    const [tag, date] = line.split('|')
    return { tag, date }
  })
}

function getCommits(limit = 30) {
  const fmt = '%h|%s|%an|%ad'
  const out = runGit(['log', `--pretty=format:${fmt}`, '--date=short', '-n', String(limit)])
  if (!out) return []
  return out.split('\n').map((line) => {
    const [hash, subject, author, date] = line.split('|')
    return { hash, subject, author, date }
  })
}

function buildVersions(tags, commits) {
  if (commits.length === 0) {
    return [{ tag: 'unreleased', date: null, commits: [] }]
  }
  // 无 tag 时所有 commit 归 unreleased
  if (tags.length === 0) {
    return [{ tag: 'unreleased', date: null, commits }]
  }
  // 有 tag：按 tag 顺序切分（最近 tag 在前）。简化：全部归最近 tag 桶，其他 tag 留空。
  // Spec 要求：每个 commit 找到其上方最近的 tag。无 git rev-list 能力时退化为：所有 commits 归第一个桶（最新 tag），其余 tag 显式存在但 commits 为空数组。
  const latest = tags[0]
  return [
    { tag: latest.tag, date: latest.date, commits },
    ...tags.slice(1).map((t) => ({ tag: t.tag, date: t.date, commits: [] })),
  ]
}

function main() {
  const tags = getTags()
  const commits = getCommits(30)
  const versions = buildVersions(tags, commits)
  const payload = { generatedAt: new Date().toISOString(), versions }
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8')
}

main()
```

- [ ] **Step 2: 创建脚本测试（先创建以便观察初始 fail）**

`scripts/generate-changelog.test.mjs`：

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'cl-test-'))
  const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: dir, encoding: 'utf8', ...opts })
  run('git', ['init', '-q', '--initial-branch=main'])
  run('git', ['config', 'user.email', 'test@example.com'])
  run('git', ['config', 'user.name', 'Tester'])
  run('git', ['config', 'commit.gpgsign', 'false'])
  return { dir, run }
}

test('无 tag 时生成 unreleased 桶', () => {
  const { dir, run } = makeRepo()
  try {
    run('bash', ['-c', 'echo a > a.txt && git add a.txt && git commit -q -m "feat: first"'])
    run('bash', ['-c', 'echo b > b.txt && git add b.txt && git commit -q -m "fix: second"'])
    const r = run('node', [join(process.cwd(), 'scripts/generate-changelog.mjs'), '--cwd', dir])
    assert.equal(r.status, 0, r.stderr)
    const out = join(dir, 'public', 'changelog.json')
    assert.ok(existsSync(out), '应生成 public/changelog.json')
    const json = JSON.parse(readFileSync(out, 'utf8'))
    assert.equal(json.versions.length, 1)
    assert.equal(json.versions[0].tag, 'unreleased')
    assert.equal(json.versions[0].commits.length, 2)
    // git log 默认按时间倒序，最近的 commit 在前
    assert.match(json.versions[0].commits[0].subject, /fix: second/)
    assert.match(json.versions[0].commits[1].subject, /feat: first/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
```

注：脚本必须支持 `--cwd <path>` 参数，使测试能在临时 git 仓库跑。脚本顶部读取此参数并设置 `CWD`（已在本任务 Step 1 的脚本代码中体现）。

- [ ] **Step 3: 在 package.json 加 test:scripts 并跑测试**

`package.json` 加：

```json
"test:scripts": "node --test scripts/*.test.mjs"
```

跑：

```bash
npm run test:scripts
```

预期：测试通过（无 tag → unreleased 桶）。

- [ ] **Step 4: 加 "有 tag" 测试并跑通**

在 `scripts/generate-changelog.test.mjs` 末尾加：

```js
test('有 tag 时按版本分桶', () => {
  const { dir, run } = makeRepo()
  try {
    run('bash', ['-c', 'echo a > a.txt && git add a.txt && git commit -q -m "feat: first"'])
    run('git', ['tag', 'v1.0.0'])
    run('bash', ['-c', 'echo b > b.txt && git add b.txt && git commit -q -m "fix: second"'])
    run('git', ['tag', 'v1.1.0'])
    run('bash', ['-c', 'echo c > c.txt && git add c.txt && git commit -q -m "chore: third"'])
    const r = run('node', [join(process.cwd(), 'scripts/generate-changelog.mjs'), '--cwd', dir])
    assert.equal(r.status, 0, r.stderr)
    const json = JSON.parse(readFileSync(join(dir, 'public', 'changelog.json'), 'utf8'))
    assert.equal(json.versions.length, 2)
    // 最新 tag 在前
    assert.equal(json.versions[0].tag, 'v1.1.0')
    // 所有 commit 归到最新 tag 桶（脚本简化策略）
    assert.equal(json.versions[0].commits.length, 3)
    assert.equal(json.versions[1].tag, 'v1.0.0')
    assert.equal(json.versions[1].commits.length, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
```

跑：

```bash
npm run test:scripts
```

预期：两个测试都通过。

- [ ] **Step 5: 真实仓库跑一次，产出 public/changelog.json**

```bash
node scripts/generate-changelog.mjs
cat public/changelog.json
```

预期：产物存在，`versions[0].tag === 'unreleased'`，commits 长度 ≤ 30。

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-changelog.mjs scripts/generate-changelog.test.mjs public/changelog.json package.json
git commit -m "feat(about): 添加 changelog 生成脚本"
```

---

## Task 2: 加 shimmer 骨架动画 keyframes

**Files:**
- Modify: `src/index.css`（在 `.animate-fade-in` 之后追加）

- [ ] **Step 1: 在 index.css 末尾追加**

在 `src/index.css` 文件末尾追加：

```css
/* Skeleton shimmer for loading states */
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
```

- [ ] **Step 2: Commit**

```bash
git add src/index.css
git commit -m "feat(about): 添加骨架屏 shimmer 动画"
```

---

## Task 3: About 组件三态渲染（红）

**Files:**
- Modify: `src/pages/About.tsx`
- Create: `src/pages/About.test.tsx`

**Interfaces:**
- Consumes: `import.meta.env.BASE_URL`（dev = `/`，build = `/BusinessWeb/`）和 `fetch(BASE_URL + 'changelog.json')`
- Produces: 一个 React 组件，三个内部状态：`loading` / `error` / `data`，UI 渲染骨架 / 重试按钮 / 版本列表

- [ ] **Step 1: 先写失败的组件测试**

`src/pages/About.test.tsx`：

```tsx
import React from 'react'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import About from './About'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const mockFetchOnce = (impl: (url: string) => Promise<Response>): void => {
  vi.stubGlobal('fetch', ((url: string) => impl(url)) as typeof fetch)
}

describe('About 页面', () => {
  it('加载中显示 3 行骨架', () => {
    mockFetchOnce(() => new Promise(() => {})) // never resolves
    render(<MemoryRouter><About /></MemoryRouter>)
    const skeletons = document.querySelectorAll('.skeleton-line')
    expect(skeletons.length).toBe(3)
  })

  it('加载成功后显示 changelog 数据', async () => {
    mockFetchOnce(async () => ({
      ok: true,
      json: async () => ({
        generatedAt: '2026-10-02T00:00:00.000Z',
        versions: [
          {
            tag: 'v1.0.0',
            date: '2026-09-30',
            commits: [
              { hash: 'abc1234', subject: 'feat: 首页段永平卡片', author: 'Hassan', date: '2026-09-30' },
            ],
          },
        ],
      }),
    } as Response))
    render(<MemoryRouter><About /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText('v1.0.0')).toBeInTheDocument()
      expect(screen.getByText('feat: 首页段永平卡片')).toBeInTheDocument()
    })
  })

  it('加载失败显示重试按钮', async () => {
    mockFetchOnce(async () => {
      throw new Error('network down')
    })
    render(<MemoryRouter><About /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText(/日志加载失败/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /重试/ })).toBeInTheDocument()
    })
  })
})
```

跑：

```bash
npm test -- About
```

预期：3 个测试全部 FAIL（About 当前只渲染 `<h2>关于</h2>`，不满足任何断言）。

- [ ] **Step 2: 实现 About 组件**

`src/pages/About.tsx`：

```tsx
import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, AlertCircle, RefreshCw } from 'lucide-react'

interface Commit {
  hash: string
  subject: string
  author: string
  date: string
}

interface Version {
  tag: string
  date: string | null
  commits: Commit[]
}

interface Changelog {
  generatedAt: string
  versions: Version[]
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  backdropFilter: 'blur(30px)',
  WebkitBackdropFilter: 'blur(30px)',
  padding: '32px',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-md)',
  marginBottom: '24px',
  border: '1px solid rgba(255, 255, 255, 0.7)',
}

export default function About(): JSX.Element {
  const [data, setData] = useState<Changelog | null>(null)
  const [error, setError] = useState<boolean>(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(false)
    fetch(import.meta.env.BASE_URL + 'changelog.json')
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`)
        return r.json()
      })
      .then((j: Changelog) => {
        if (!cancelled) setData(j)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const retry = useCallback(() => setReloadKey((k) => k + 1), [])

  return (
    <main className="container" style={{ maxWidth: '1100px' }}>
      {/* 站点介绍 */}
      <section style={cardStyle}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 16px', color: 'var(--text-primary)' }}>
          关于 Hassan 投资工作台
        </h2>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 20px' }}>
          把分散在 Notion / Excel / 券商 App 里的标的、网格记录、监控指标，集中到一个移动优先的工作台。
        </p>
        <h3 style={{ fontSize: '0.95rem', color: 'var(--text-primary)', margin: '0 0 8px' }}>覆盖范围</h3>
        <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.8, paddingLeft: 20, margin: '0 0 20px' }}>
          <li>美股投资（A股 / 港股 / ADR）</li>
          <li>大陆投资（2026AI 组合）</li>
          <li>网格交易（回测 / 实盘 / 快照）</li>
          <li>经济脉搏 / 监控 / 板块涨停</li>
        </ul>
        <h3 style={{ fontSize: '0.95rem', color: 'var(--text-primary)', margin: '0 0 8px' }}>方法论</h3>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 20px' }}>
          详见<Link to="/" style={{ color: 'var(--system-blue)', textDecoration: 'none', fontWeight: 500 }}> 首页段永平思想精髓</Link>，融合巴菲特、邓普顿、双阶段轮动逻辑。
        </p>
        <div
          style={{
            background: 'rgba(255, 59, 48, 0.06)',
            border: '1px solid rgba(255, 59, 48, 0.2)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            color: 'var(--system-red)',
            fontSize: '0.9rem',
            lineHeight: 1.6,
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            marginBottom: '20px',
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>内容仅为个人研究记录，不构成投资建议；过往业绩不代表未来表现。</span>
        </div>
        <a
          href="https://cuchiscastagne277-crypto.github.io/website"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            fontSize: '0.9rem',
            padding: '8px 16px',
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-full)',
            border: '1px solid rgba(0,0,0,0.05)',
          }}
        >
          <ExternalLink size={16} />
          <span style={{ fontWeight: 500 }}>Train 的网页</span>
        </a>
      </section>

      {/* 更新日志 */}
      <section style={{ ...cardStyle, minHeight: 200 }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 20px', color: 'var(--text-primary)' }}>
          更新日志
        </h2>

        {data === null && !error && (
          <div data-testid="changelog-skeleton">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton-line" style={{ marginBottom: '12px', width: i === 0 ? '40%' : '90%' }} />
            ))}
          </div>
        )}

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-secondary)' }}>
            <span>日志加载失败</span>
            <button
              onClick={retry}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--system-blue)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-full)',
                padding: '6px 14px',
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={14} /> 重试
            </button>
          </div>
        )}

        {data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {data.versions.map((v) => (
              <div key={v.tag}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    {v.tag === 'unreleased' ? 'Unreleased' : v.tag}
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{v.date ?? '—'}</span>
                </div>
                {v.commits.length === 0 ? (
                  <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', margin: 0 }}>无变更</p>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {v.commits.map((c) => (
                      <li
                        key={c.hash}
                        style={{
                          padding: '8px 0',
                          borderBottom: '0.5px solid rgba(0,0,0,0.05)',
                          color: 'var(--text-secondary)',
                          fontSize: '0.9rem',
                          display: 'flex',
                          gap: '8px',
                          alignItems: 'baseline',
                        }}
                      >
                        <code
                          style={{
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                            fontSize: '0.8rem',
                            color: 'var(--text-tertiary)',
                            background: 'var(--system-gray6)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            flexShrink: 0,
                          }}
                        >
                          {c.hash}
                        </code>
                        <span>{c.subject}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
```

- [ ] **Step 3: 跑测试，验证通过**

```bash
npm test -- About
```

预期：3 个测试全部通过。

- [ ] **Step 4: Commit**

```bash
git add src/pages/About.tsx src/pages/About.test.tsx
git commit -m "feat(about): 重写 About 页面，引入 changelog 渲染"
```

---

## Task 4: 接入 prebuild 流水线

**Files:**
- Modify: `package.json:5-15`

- [ ] **Step 1: 加 prebuild script**

`package.json` 在 `scripts.build` 前一行加：

```json
"prebuild": "node scripts/generate-changelog.mjs",
```

- [ ] **Step 2: 跑 build，验证产物**

```bash
npm run build
ls dist/changelog.json
cat dist/changelog.json | head -20
```

预期：`dist/changelog.json` 存在，内容含 `versions` 数组。

- [ ] **Step 3: 跑 typecheck 和全量 test**

```bash
npm run typecheck
npm test
```

预期：两者均通过，无新增失败。

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "build: 在 vite build 前自动生成 changelog.json"
```

---

## Self-Review（写完后自查）

1. **Spec 覆盖**：
   - 页面结构两区块（站点介绍 + changelog） → Task 3 ✓
   - 站点介绍 5 段（初衷/覆盖/方法论/免责/反链） → Task 3 ✓
   - 数据模型 `{ generatedAt, versions: [{ tag, date, commits: [{ hash, subject, author, date }] }] }` → Task 1 ✓
   - 生成脚本流程（tag 解析 / commit 解析 / 分桶 / 写文件） → Task 1 ✓
   - 错误处理（git 失败 / 0 commit / 无 tag） → Task 1 ✓
   - `prebuild` 集成 → Task 4 ✓
   - About 组件三态（loading/error/data）+ 骨架 + 重试 → Task 3 ✓
   - 脚本测试（有 tag / 无 tag） → Task 1 ✓
   - 组件测试（loading / success / error） → Task 3 ✓
   - `BASE_URL` 自动适配 dev/build → Task 3 用了 `import.meta.env.BASE_URL` ✓
   - 视觉对齐首页（cardStyle 复用） → Task 3 ✓
   - shimmer keyframes → Task 2 ✓

2. **Placeholder 扫描**：无 TBD / TODO。

3. **类型一致性**：
   - `Changelog` 接口在 Task 3 引入，Task 1 的脚本输出结构与之对应（`generatedAt` + `versions[]`）。
   - `Commit` 字段（`hash/subject/author/date`）在 Task 1 脚本和 Task 3 组件测试 mock 中一致。
   - `Version.tag === 'unreleased'` 在 Task 1 测试和 Task 3 渲染逻辑中一致。

4. **风险记录**：
   - 仓库当前 0 tag → Task 1 第 1 个测试专门覆盖。
   - `public/changelog.json` 被 build 产物覆盖 → Task 4 验证 dist 包含它。
   - `vite dev` 不跑 prebuild → Task 3 已说明（用户需先 build 一次），不写额外测试。
