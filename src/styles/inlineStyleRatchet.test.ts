import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import baseline from './inlineStyleBaseline.json'

// 棘轮：每个文件的内联样式与硬编码颜色只能减少，不能增加。
// 迁移后数字下降时，运行 `node scripts/inline-style-baseline.mjs` 收紧基线。
const SRC = resolve(__dirname, '..')
const INLINE = /style=\{\{/g
const COLOR = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\(\s*\d|'white'|'black'|"white"|"black"/g

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return tsxFiles(full)
    return name.endsWith('.tsx') && !name.includes('.test.') ? [full] : []
  })
}

export function countAll(): Record<string, { inline: number; color: number }> {
  const out: Record<string, { inline: number; color: number }> = {}
  for (const file of tsxFiles(SRC)) {
    const src = readFileSync(file, 'utf8')
    const inline = src.match(INLINE)?.length ?? 0
    const color = src.match(COLOR)?.length ?? 0
    if (inline || color) out[relative(SRC, file)] = { inline, color }
  }
  return out
}

describe('内联样式与硬编码颜色棘轮', () => {
  const counts = countAll()
  const base = baseline as Record<string, { inline: number; color: number }>

  it('没有文件超过基线（新文件基线为 0）', () => {
    const over = Object.entries(counts).flatMap(([file, c]) => {
      const b = base[file] ?? { inline: 0, color: 0 }
      const issues: string[] = []
      if (c.inline > b.inline) issues.push(`${file}: style={{ ${c.inline} > 基线 ${b.inline}`)
      if (c.color > b.color) issues.push(`${file}: 硬编码颜色 ${c.color} > 基线 ${b.color}`)
      return issues
    })
    expect(over).toEqual([])
  })
})
