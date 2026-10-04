import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (p: string): string => readFileSync(resolve(__dirname, '../../', p), 'utf8')

describe('品牌文件', () => {
  it('manifest 名称、描述、主题色都是正念生活 / 纸色', () => {
    const m = JSON.parse(read('public/manifest.webmanifest'))
    expect(m.name).toBe('正念生活')
    expect(m.short_name).toBe('正念生活')
    expect(m.description).toContain('投资')
    expect(m.theme_color).toBe('#FAF6EE')
    expect(m.background_color).toBe('#FAF6EE')
  })

  it('图标改为纸底暗绿叶片，不再是黑底绿折线', () => {
    for (const f of ['public/favicon.svg', 'public/favicon-32.svg']) {
      const svg = read(f)
      expect(svg, f).not.toContain('#0A0A0A')
      expect(svg, f).not.toContain('#3DDC84')
      expect(svg, f).toContain('#FAF6EE')
      expect(svg, f).toContain('#5B7B65')
    }
  })

  it('index.css 里不再保留无人引用的 fadeInScale 别名', () => {
    expect(read('src/index.css')).not.toContain('fadeInScale')
  })
})
