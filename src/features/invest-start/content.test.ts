import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ALL_STEP_IDS, COMBINED_STEPS, FOUNDATION_STEPS, QUESTIONS, REASONS, REF, RESEARCH_STEPS, ROUTE_STEPS, SIMPLE_STEPS,
  chapterHref, type ChapterRef,
} from './content'

const ROOT = resolve(__dirname, '../../..')
const bookFile = (f: string): string => resolve(ROOT, 'public/first-book', f)
const h2s = (f: string): string[] => readFileSync(bookFile(f), 'utf8').split('\n').filter(l => /^## /.test(l)).map(l => l.slice(3))

function allRefs(): ChapterRef[] {
  const groups = [FOUNDATION_STEPS, SIMPLE_STEPS, COMBINED_STEPS, RESEARCH_STEPS]
  return [
    ...Object.values(REF),
    ...QUESTIONS.flatMap(q => q.refs),
    ...Object.values(REASONS).flatMap(r => r.refs),
    ...groups.flatMap(g => g.steps.flatMap(s => s.refs ?? [])),
  ]
}

describe('书章节链接', () => {
  it('每个章节文件都存在，并且是书目录里已发布的章节', () => {
    const toc = readFileSync(resolve(ROOT, 'src/pages/FirstBook.tsx'), 'utf8')
    for (const r of allRefs()) {
      expect(existsSync(bookFile(r.file)), r.file).toBe(true)
      expect(toc, r.file).toMatch(new RegExp(`file: '${r.file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}', status: '(done|draft)'`))
    }
  })

  it('#chapter-section-N 锚点指向的正是标注的小节（阅读页按 ## 标题顺序编号）', () => {
    for (const r of allRefs()) {
      if (r.section === undefined) continue
      const heads = h2s(r.file)
      expect(heads[r.section], `${r.file} #${r.section}`).toBeDefined()
      expect(heads[r.section].startsWith(r.heading ?? '__'), `${r.file} #${r.section} = ${heads[r.section]}，期望以「${r.heading}」开头`).toBe(true)
    }
  })

  it('链接格式与站内其他书链一致', () => {
    expect(chapterHref(REF.s7_8)).toBe(`/first-book/read/${encodeURIComponent('第7章-配置优先.md')}#chapter-section-7`)
    expect(chapterHref(REF.ch19)).toBe(`/first-book/read/${encodeURIComponent('第19章-总纲.md')}`)
  })
})

describe('路线清单', () => {
  it('同一分组内 stepId 不重复，且都是 kebab-case', () => {
    for (const g of [FOUNDATION_STEPS, SIMPLE_STEPS, COMBINED_STEPS, RESEARCH_STEPS]) {
      const ids = g.steps.map(s => s.id)
      expect(new Set(ids).size, g.id).toBe(ids.length)
      for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{1,64}$/)
    }
    expect(ALL_STEP_IDS.length).toBeGreaterThan(10)
  })

  it('结合 = 省心 + 结合；研究 = 省心 + 结合 + 研究（先完成底仓）', () => {
    expect(ROUTE_STEPS.combined.map(g => g.id)).toEqual(['simple', 'combined'])
    expect(ROUTE_STEPS.research.map(g => g.id)).toEqual(['simple', 'combined', 'research'])
  })

  it('站内链接都指向 App.tsx 里已有的路由；页内锚点在入口页里存在', () => {
    const app = readFileSync(resolve(ROOT, 'src/App.tsx'), 'utf8')
    const routes = [...app.matchAll(/<Route path="([^"]+)"/g)].map(m => m[1]).filter(p => p !== '*')
    const page = readFileSync(resolve(ROOT, 'src/pages/StartHere.tsx'), 'utf8')
    const links = [FOUNDATION_STEPS, SIMPLE_STEPS, COMBINED_STEPS, RESEARCH_STEPS].flatMap(g => g.steps.flatMap(s => s.links ?? []))
    for (const l of links) {
      if (l.to.startsWith('#')) {
        expect(page, l.to).toContain(`id="${l.to.slice(1)}"`)
        continue
      }
      const path = l.to.split(/[?#]/)[0]
      expect(routes, l.to).toContain(path)
    }
  })

  it('不链接到还不存在的「我的计划」页面', () => {
    const src = readFileSync(resolve(__dirname, 'content.ts'), 'utf8')
    expect(src).not.toContain('/invest/my-plan')
  })
})

describe('入口页代码边界', () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) && !n.includes('.test.') ? [p] : []
  })
  const sources = [...files(__dirname), resolve(ROOT, 'src/pages/StartHere.tsx')].map(f => ({ f, src: readFileSync(f, 'utf8') }))

  it('不引入投资计划页（首屏不带旧页代码）、不发网络请求、不调用 localStorage.clear()', () => {
    for (const { f, src } of sources) {
      expect(src, f).not.toMatch(/(from|import\()\s*['"][^'"]*InvestmentPlan2026/)
      expect(src, f).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|new WebSocket|EventSource/)
      expect(src, f).not.toMatch(/localStorage\.clear\(/)
      expect(src, f).not.toMatch(/dangerouslySetInnerHTML/)
    }
  })

  it('只有 store.ts 写本机存储，写的键只有 start:v1', () => {
    for (const { f, src } of sources) {
      if (f.endsWith('store.ts')) continue
      expect(src, f).not.toMatch(/\.setItem\(|\.removeItem\(/)
    }
    const store = sources.find(s => s.f.endsWith('store.ts'))!.src
    expect(store).toContain("START_KEY = 'start:v1'")
    expect(store.match(/\.setItem\(/g)).toHaveLength(1)
    expect(store).toMatch(/\.setItem\(START_KEY,/)
    expect(store).toMatch(/\.removeItem\(START_KEY\)/)
  })

  it('不含内联样式与硬编码颜色', () => {
    for (const { f, src } of sources.filter(s => s.f.endsWith('.tsx'))) {
      expect(src, f).not.toMatch(/style=\{\{/)
      expect(src, f).not.toMatch(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\(\s*\d/)
    }
  })
})
