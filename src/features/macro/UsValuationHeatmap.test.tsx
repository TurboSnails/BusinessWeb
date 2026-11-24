import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import UsValuationHeatmap, { FINVIZ_MAP_LINKS } from './UsValuationHeatmap'
import { ValuationView } from './ValuationView'
import { groupBySector, layoutHeat, peStep, weightedFwd } from './usValuationHeat'
import type { IndexData, IndexSnapshot, Member } from './valuation'

const mem = (code: string, mcap: number, fwd: number | null, sector?: string): Member => ({ code, name: `${code} Inc.`, mcap, fwd, ttm: fwd, sector })
const MEMBERS = [
  mem('AAPL', 4000, 32, 'Information Technology'),
  mem('NVDA', 3000, 20, 'Information Technology'),
  mem('JPM', 800, 12, 'Financials'),
  mem('XOM', 500, 10, 'Energy'),
  mem('RIVN', 20, null, 'Consumer Discretionary'),
  mem('ZERO', 0, 15, 'Energy'),
  mem('NOSEC', 50, 22),
]

describe('usValuationHeat', () => {
  it('peStep 分档：亏损 / 缺失单独一档，边界值归入高档', () => {
    expect(peStep(null)).toBe('na')
    expect(peStep(-3)).toBe('na')
    expect(peStep(11.9)).toBe('g3')
    expect(peStep(12)).toBe('g2')
    expect(peStep(20)).toBe('n')
    expect(peStep(25)).toBe('r1')
    expect(peStep(50)).toBe('r3')
  })

  it('weightedFwd 是市值加权调和平均，亏损股不计', () => {
    expect(weightedFwd([mem('A', 100, 10), mem('B', 100, 30), mem('C', 50, null)])).toBeCloseTo(200 / (10 + 100 / 30), 6)
    expect(weightedFwd([mem('C', 50, null)])).toBeNull()
  })

  it('groupBySector：按行业总市值降序，组内按市值降序，0 市值剔除，缺行业归入其他', () => {
    const g = groupBySector(MEMBERS)
    expect(g.map(x => x.zh)).toEqual(['信息技术', '金融', '能源', '其他', '可选消费'])
    expect(g[0].members.map(m => m.code)).toEqual(['AAPL', 'NVDA'])
    expect(g.find(x => x.zh === '能源')!.members.map(m => m.code)).toEqual(['XOM'])
  })

  it('layoutHeat：方块面积与市值成比例，且都落在画布内', () => {
    const { tiles } = layoutHeat(groupBySector(MEMBERS), 1000, 600)
    expect(tiles).toHaveLength(6)
    for (const t of tiles) {
      expect(t.r.x).toBeGreaterThanOrEqual(-1e-6)
      expect(t.r.y).toBeGreaterThanOrEqual(-1e-6)
      expect(t.r.x + t.r.w).toBeLessThanOrEqual(1000 + 1e-6)
      expect(t.r.y + t.r.h).toBeLessThanOrEqual(600 + 1e-6)
    }
    const area = (c: string) => { const r = tiles.find(t => t.m.code === c)!.r; return r.w * r.h }
    expect(area('AAPL') / area('NVDA')).toBeCloseTo(4000 / 3000, 1)
  })
})

const MAPS: IndexSnapshot['maps'] = {
  adr: { date: '2026-11-22', source: 't', total: 2, members: [mem('TSM', 1600, 13.6, '中国台湾'), mem('BABA', 200, 8.9, '中国')] },
  etf: { date: '2026-11-22', source: 't', total: 2, members: [{ ...mem('SPY', 800, null, '美股宽基'), ttm: 22 }, { ...mem('TLT', 47, null, '债券'), ttm: null }] },
}

const ix = (over: Partial<IndexData> = {}): IndexData => ({
  symbol: '^GSPC', name: '标普 500', group: '美股', note: '', latest: { date: '2026-11-20', value: 6600 },
  monthly: [['2025-01-01', 5000], ['2026-11-01', 6600]], fpe: [['2026-11-01', 22]],
  members: MEMBERS,
  agg: { date: '2026-11-21', fwd: 22.4, fwdCovered: 0.99, fwdCount: 6, ttm: 22, medianFwd: 17, total: 7, got: 7 },
  ...over,
})

describe('UsValuationHeatmap', () => {
  it('站内直接画出成分股方块与行业按钮，点方块在下方显示明细', () => {
    render(<UsValuationHeatmap data={{ indexes: { spx: ix(), ndx: ix({ name: '纳斯达克 100', members: MEMBERS.slice(0, 2) }) }, maps: MAPS }} />)
    expect(screen.getByRole('tab', { name: '标普 500' }).getAttribute('aria-selected')).toBe('true')
    const svg = screen.getByRole('group', { name: /标普 500 Forward PE 热力图/ })
    const aapl = within(svg).getByRole('button', { name: /AAPL AAPL Inc\.：Forward PE 32\.0x/ })
    expect(aapl.querySelector('rect')!.getAttribute('class')).toContain('uvh--r1')
    expect(within(svg).getByRole('button', { name: /RIVN.*亏损\/无预期/ }).querySelector('rect')!.getAttribute('class')).toContain('uvh--na')
    fireEvent.click(aapl)
    expect(document.querySelector('.uvh__tip')!.textContent).toMatch(/AAPL.*信息技术.*Forward PE 32\.0x（行业 .*x，指数 22\.4x）.*滚动 PE/)
  })

  it('点行业按钮只画该行业；切换到纳指 100 后复位', () => {
    render(<UsValuationHeatmap data={{ indexes: { spx: ix(), ndx: ix({ name: '纳斯达克 100', members: MEMBERS.slice(0, 2) }) }, maps: MAPS }} />)
    fireEvent.click(screen.getByRole('button', { name: /^金融/ }))
    const svg = screen.getByRole('group', { name: /Forward PE 热力图（金融）/ })
    expect(within(svg).getAllByRole('button', { name: /：Forward PE/ }).map(b => b.getAttribute('aria-label')!.split(' ')[0])).toEqual(['JPM'])
    fireEvent.click(screen.getByRole('tab', { name: '纳指 100' }))
    const ndx = screen.getByRole('group', { name: /纳指 100 Forward PE 热力图$/ })
    expect(within(ndx).getAllByRole('button', { name: /：Forward PE/ })).toHaveLength(2)
  })

  it('4 张图都在：全球按国家分组，ETF 用规模和滚动 PE、债券 ETF 灰色', () => {
    render(<UsValuationHeatmap data={{ indexes: { spx: ix(), ndx: ix() }, maps: MAPS }} />)
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['标普 500', '纳指 100', '全球（在美上市）', 'ETF'])
    fireEvent.click(screen.getByRole('tab', { name: '全球（在美上市）' }))
    expect(screen.getByRole('group', { name: '按国家/地区放大' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^中国台湾/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'ETF' }))
    const svg = screen.getByRole('group', { name: /ETF 滚动 PE 热力图/ })
    expect(within(svg).getByRole('button', { name: /SPY .*滚动 PE 22\.0x，规模/ }).querySelector('rect')!.getAttribute('class')).toContain('uvh--n')
    expect(within(svg).getByRole('button', { name: /TLT .*无 PE/ }).querySelector('rect')!.getAttribute('class')).toContain('uvh--na')
  })

  it('图下列出 4 张 Finviz 原图外链，带用途说明、新窗口打开', () => {
    render(<UsValuationHeatmap data={{ indexes: { spx: ix() } }} />)
    const links = screen.getAllByRole('link').filter(a => (a.getAttribute('href') ?? '').includes('finviz.com/map'))
    expect(links).toHaveLength(4)
    for (const [i, item] of FINVIZ_MAP_LINKS.entries()) {
      expect(links[i].getAttribute('href')).toBe(item.href)
      expect(links[i].getAttribute('target')).toBe('_blank')
      expect(links[i].getAttribute('rel') ?? '').toMatch(/noopener/)
      expect(links[i].getAttribute('rel') ?? '').toMatch(/noreferrer/)
      expect(links[i].textContent).toContain(item.title)
      expect(links[i].textContent).toContain(item.use)
    }
  })

  it('沪深 300、恒生指数：方块写中文名，市值按亿元 / 港元写', () => {
    const csi = ix({ name: '沪深 300', members: [{ ...mem('601398.SS', 3350, 8.7, '金融'), name: '工商银行' }, { ...mem('600519.SS', 1866, 19.3, '食品饮料'), name: '贵州茅台' }] })
    const maps = { ...MAPS, hsi: { date: '2026-11-22', source: 't', total: 1, currency: 'HKD' as const, members: [{ ...mem('00700', 3097.6, 10.1, '通信与互联网'), name: '腾讯控股' }] } }
    render(<UsValuationHeatmap data={{ indexes: { spx: ix(), csi300: csi }, maps }} />)
    fireEvent.click(screen.getByRole('tab', { name: '沪深 300' }))
    const svg = screen.getByRole('group', { name: /沪深 300 Forward PE 热力图/ })
    fireEvent.click(within(svg).getByRole('button', { name: /^贵州茅台 600519：Forward PE 19\.3x，市值 1\.87 万亿元$/ }))
    expect(svg.textContent).toContain('工商银行')
    fireEvent.click(screen.getByRole('tab', { name: '恒生指数' }))
    expect(within(screen.getByRole('group', { name: /恒生指数 Forward PE 热力图/ })).getByRole('button', { name: /腾讯控股 00700：Forward PE 10\.1x，市值 3\.10 万亿港元/ })).toBeTruthy()
  })

  it('沪深 300 成分股没有行业时不出这个页签', () => {
    render(<UsValuationHeatmap data={{ indexes: { spx: ix(), csi300: ix({ members: [mem('601398.SS', 3350, 8.7)] }) } }} />)
    expect(screen.queryByRole('tab', { name: '沪深 300' })).toBeNull()
  })

  it('没有成分股数据时不渲染', () => {
    const { container } = render(<UsValuationHeatmap data={{ indexes: { spx: ix({ members: undefined }) } }} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('ValuationView · 估值热力图', () => {
  it('估值页直接内嵌热力图，图下附 Finviz 原图外链', () => {
    const data: IndexSnapshot = { generatedAt: '2026-11-20', source: 'test', indexes: { spx: ix() } }
    render(<ValuationView data={data} />)
    expect(screen.getByRole('heading', { name: '估值热力图' })).toBeTruthy()
    expect(screen.getAllByRole('link').filter(a => (a.getAttribute('href') ?? '').includes('finviz.com/map'))).toHaveLength(4)
  })
})
