import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import FinvizMaps, { FINVIZ_MAP_LINKS } from './FinvizMaps'
import { ValuationView } from './ValuationView'
import type { IndexData, IndexSnapshot } from './valuation'

describe('FinvizMaps', () => {
  it('渲染 4 个外链，href / target / rel 正确', () => {
    render(<FinvizMaps />)
    const card = screen.getByRole('heading', { name: '美股个股估值热力图（Finviz）' }).closest('section')!
    const links = within(card).getAllByRole('link')
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
})

describe('ValuationView · Finviz 卡片', () => {
  const ix = (over: Partial<IndexData> = {}): IndexData => ({
    symbol: '^GSPC', name: '标普 500', group: '美股', note: '', latest: { date: '2026-11-20', value: 6600 },
    monthly: [['2025-01-01', 5000], ['2026-11-01', 6600]], fpe: [['2026-11-01', 22]], ...over,
  })
  const data: IndexSnapshot = { generatedAt: '2026-11-20', source: 'test', indexes: { spx: ix() } }

  it('在说明卡之后渲染 Finviz 热力图卡片', () => {
    render(<ValuationView data={data} />)
    expect(screen.getByRole('heading', { name: '怎么读这一页' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '美股个股估值热力图（Finviz）' })).toBeTruthy()
    expect(screen.getAllByRole('link').filter(a => (a.getAttribute('href') ?? '').includes('finviz.com/map'))).toHaveLength(4)
  })
})
