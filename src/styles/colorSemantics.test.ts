import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MarketCard } from '../components/pulse/MarketCard'

afterEach(cleanup)

const root = resolve(__dirname, '..')
const read = (p: string): string => readFileSync(resolve(root, p), 'utf8')
const tsxIn = (dir: string): string[] =>
  readdirSync(resolve(root, dir))
    .filter(f => f.endsWith('.tsx') && !f.includes('.test.') && !/Heatmap/.test(f))
    .map(f => join(dir, f))

describe('涨跌色语义：--up/--down 只表示 A 股红涨绿跌', () => {
  it('脉搏页（美股习惯：绿涨红跌）与监控页不再借用 --up/--down，改用中性颜色名', () => {
    const files = ['pages/Pulse.tsx', ...tsxIn('components/pulse'), ...tsxIn('components/monitor')]
    for (const f of files) {
      const src = read(f)
      expect(src, f).not.toMatch(/var\(--up\)|var\(--down\)/)
    }
  })

  it('MarketCard：上涨用绿、下跌用红（视觉不变），变量是中性的 system-green / system-red', () => {
    const base = { symbol: 'AAPL', name: '苹果', price: 100, change: 1, changePercent: 1 }
    const up = render(React.createElement(MarketCard, { stock: base as never, color: '#000' }))
    expect(up.container.innerHTML).toContain('var(--system-green)')
    expect(up.container.innerHTML).not.toContain('var(--system-red)')
    up.unmount()
    const down = render(React.createElement(MarketCard, { stock: { ...base, change: -1, changePercent: -1 } as never, color: '#000' }))
    expect(down.container.innerHTML).toContain('var(--system-red)')
    expect(down.container.innerHTML).not.toContain('var(--system-green)')
  })

  it('A 股页面（板块轮动）仍按红涨绿跌使用 --up/--down', () => {
    expect(read('pages/SectorRotation.tsx')).toMatch(/>= 0 \? 'var\(--up\)' : 'var\(--down\)'/)
  })
})

describe('美股页与观察盘涨跌色锁', () => {
  it('us-market 美股涨跌用 system-green/red，不用 A 股 --up/--down 令牌', () => {
    const brief = read('features/us-market/weekly-brief.css')
    const market = read('features/us-market/us-market.css')
    expect(brief).toMatch(/\[data-market=["']us["']\][^{]*\.weekly-brief__big\[data-sign=["']up["']\][^{]*\{[^}]*--system-green/)
    expect(brief).toMatch(/\[data-market=["']us["']\][^{]*\.weekly-brief__big\[data-sign=["']down["']\][^{]*\{[^}]*--system-red/)
    expect(brief).not.toMatch(/\[data-market=["']us["']\][^}]*--(?:up|down)(?:-ink)?/)
    expect(market).toMatch(/--us-chg-up:\s*var\(--system-green\)/)
    expect(market).toMatch(/--us-chg-down:\s*var\(--system-red\)/)
    expect(market).not.toMatch(/--lean-defense:[^;]*var\(--up\)/)
  })

  it('watch.css 不再有会命中宏观卡片的裸 .is-green / .is-red 颜色规则', () => {
    const css = read('styles/watch.css')
    expect(css).not.toMatch(/\.watch-page\s+\.is-green\s*\{/)
    expect(css).not.toMatch(/\.watch-page\s+\.is-red\s*\{/)
    expect(css).toMatch(/\.watch-q__chg\.is-green/)
    expect(css).toMatch(/\.watch-q__chg\.is-red/)
  })
})

describe('样式小问题', () => {
  it('valuation.css 没有 var(--x, var(--x)) 这种自己引用自己的回退', () => {
    const css = read('components/valuation/valuation.css')
    expect(css).not.toMatch(/var\((--[a-z0-9-]+),\s*var\(\1\)\)/)
  })

  it('章节目录里不可点击的条目鼠标样式为 default', () => {
    expect(read('styles/shell.css')).toMatch(/\.chapter-nav__item\.is-disabled\s*\{[^}]*cursor:\s*default/)
  })
})
