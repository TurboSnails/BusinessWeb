import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PUBLIC = resolve(__dirname, '../../public')
const notes = readdirSync(resolve(PUBLIC, 'notes')).filter(f => f.endsWith('.md'))

describe('笔记 Markdown 内部链接', () => {
  it('站内绝对路径都指向 public 下存在的文件或笔记', () => {
    const missing: string[] = []
    for (const file of notes) {
      const text = readFileSync(resolve(PUBLIC, 'notes', file), 'utf8')
      for (const m of text.matchAll(/\]\((\/[^)\s#?]+)/g)) {
        const path = m[1]
        const slug = path.match(/^\/notes\/([\w-]+)\/?$/)?.[1]
        const ok = slug ? existsSync(resolve(PUBLIC, 'notes', `${slug}.md`)) : existsSync(resolve(PUBLIC, `.${path}`))
        if (!ok) missing.push(`${file} -> ${path}`)
      }
    }
    expect(missing).toEqual([])
  })
})
