import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InvestmentPlan2026 from './InvestmentPlan2026'

beforeEach(() => { localStorage.clear(); vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 }))) })
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals() })

const openAllocation = () => {
  render(<MemoryRouter><InvestmentPlan2026 /></MemoryRouter>)
  fireEvent.click(screen.getByRole('tab', { name: /配置与纪律/ }))
}
const names = () => (screen.getAllByRole('textbox', { name: /资产名称/ }) as HTMLInputElement[]).map(i => i.value)
const targets = () => (screen.getAllByRole('textbox', { name: /目标占比/ }) as HTMLInputElement[]).map(i => Number(i.value))

describe('再平衡检查器的示例与书第9章9.10一致', () => {
  it('默认是宽基均衡档：权益50%以A股宽基为主，不含主题指数', () => {
    openAllocation()
    expect(names()).toEqual(['A股宽基', '标普500', '红利低波', '中短债/纯债'])
    expect(targets()).toEqual([30, 15, 5, 50])
    expect(names()).not.toContain('恒生科技')
  })

  it('可切换保守、积极档与作者案例；每档目标合计100%', () => {
    openAllocation()
    fireEvent.click(screen.getByRole('button', { name: '保守档' }))
    expect(targets()).toEqual([18, 9, 3, 70])
    fireEvent.click(screen.getByRole('button', { name: '积极档' }))
    expect(targets()).toEqual([42, 21, 7, 30])
    fireEvent.click(screen.getByRole('button', { name: '作者案例' }))
    expect(names()).toContain('恒生科技')
    expect(targets().reduce((a, b) => a + b, 0)).toBe(100)
  })
})
