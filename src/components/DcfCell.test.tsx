import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { DcfCell } from './DcfCell'
import type { ToolSources } from '../features/candidates/links'

const tools = (priceDate: string): ToolSources => ({
  dcf: [{ market: 'us', code: 'AAPL', savedAt: '2026-01-01T00:00:00.000Z', input: { currency: 'USD' }, result: { price: 150, mos: 0.5 } } as never],
  valuation: [], grid: [],
  auto: new Map([['us:AAPL', { status: 'ok', fair: 100, buyBelow: 80, credibility: 'medium', current: 100, currency: 'USD', priceDate } as never]]),
})

const renderCell = (sources: ToolSources): void => {
  render(<MemoryRouter><DcfCell market="us" code="AAPL" name="苹果" tools={sources} /></MemoryRouter>)
}

describe('DcfCell 本人保存记录', () => {
  it('当前价不新鲜时用中性保存时展示，不按旧现价着色或宣称按最新价计算', () => {
    renderCell(tools('2020-01-01'))
    const link = screen.getByRole('link', { name: 'DCF AAPL 保存时 安全边际 +50%' })
    expect(link.className).toContain('is-na')
    expect(link.className).not.toMatch(/is-good|is-bad/)
    expect(link.getAttribute('title')).toContain('保存时安全边际')
    expect(link.getAttribute('title')).not.toContain('按最新价')
  })

  it('恢复新鲜同币种现价后保留既有重算与方向展示', () => {
    renderCell(tools(new Date().toLocaleDateString('en-CA')))
    const link = screen.getByRole('link', { name: 'DCF AAPL 我的 安全边际 +50%' })
    expect(link.className).toContain('is-good')
    expect(link.getAttribute('title')).toContain('按最新价 100 计算')
  })
})
