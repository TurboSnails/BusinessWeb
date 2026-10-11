import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const srcDir = resolve(__dirname, '..')
const app = readFileSync(resolve(srcDir, 'App.tsx'), 'utf8')

// 组件名 → 源文件：同时识别 import X from './pages/X' 和 lazy(() => import('./pages/X'))
const importOf = new Map<string, string>()
for (const m of app.matchAll(/import (\w+) from '\.\/([^']+)'/g)) importOf.set(m[1], m[2])
for (const m of app.matchAll(/const (\w+) = lazy\(\(\) => import\('\.\/([^']+)'\)\)/g)) importOf.set(m[1], m[2])

const routed = [...new Set([...app.matchAll(/element=\{<(\w+)/g)].map(m => m[1]))]

function sourceOf(name: string): string {
  const rel = importOf.get(name)
  if (!rel) throw new Error(`找不到 ${name} 的 import`)
  const file = resolve(srcDir, rel + '.tsx')
  return readFileSync(file, 'utf8')
}

/** 薄包装页（如 KnowledgeCenter → KnowledgeWorkspace）：跟着唯一的默认渲染组件找下去 */
function shellSource(name: string): string {
  let src = sourceOf(name)
  const rel = importOf.get(name)!
  const wrapped = src.match(/import (\w+) from '([^']+)'[\s\S]*return <\1\b/)
  if (wrapped && !/<Page\b/.test(src)) {
    const next = resolve(srcDir, dirname(rel), wrapped[2] + '.tsx')
    if (existsSync(next)) src = readFileSync(next, 'utf8')
  }
  return src
}

describe('页面外壳', () => {
  it('App.tsx 里每个路由页面都用 <Page> 作为根（书稿阅读器保留 reader-layout）', () => {
    const missing = routed.filter(name => {
      const src = shellSource(name)
      return !/<Page\b/.test(src) && !/className="[^"]*\breader-layout\b[^"]*"/.test(src)
    })
    expect(missing).toEqual([])
  })

  it('页面文件里不再手写 <main>（书稿阅读器除外）', () => {
    const offenders = routed.filter(name => {
      // The book reader may have an id and additional classes; keep the exception scoped to it.
      const source = shellSource(name)
      const src = name === 'FirstBook'
        ? source.replace(/<main\b(?=[^>]*\bclassName="[^"]*\breader-layout\b[^"]*")[^>]*>/g, '')
        : source
      return /<main\b/.test(src)
    })
    expect(offenders).toEqual([])
  })
})
