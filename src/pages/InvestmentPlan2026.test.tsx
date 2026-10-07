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

describe('情绪工具：打开即并行获取全部读数', () => {
  it('一次请求 /api/sentiment 填入六项读数，并显示数据日期与来源', async () => {
    const snapshot = { equityPC: 0.58, spxPC: 1.15, pcDate: '2026-10-02', vix: 15.59, vix3m: 18.07, vixDate: '2026-10-05', gexBn: 7.69, gexDate: '2026-10-02', goldSilver: 67.73, goldSilverDate: '2026-10-05', warnings: [] }
    const fetcher = vi.fn(async (url: string) => (String(url).includes('/api/sentiment') ? new Response(JSON.stringify(snapshot)) : new Response('{}', { status: 500 })))
    vi.stubGlobal('fetch', fetcher)
    render(<MemoryRouter><InvestmentPlan2026 /></MemoryRouter>)
    fireEvent.click(screen.getByRole('tab', { name: /情绪工具/ }))
    const value = (label: RegExp) => (screen.getByLabelText(label) as HTMLInputElement).value
    await screen.findByText(/P\/C 2026-10-02/)
    expect([value(/Equity P\/C/), value(/SPX P\/C/), value(/VIX（30天）/), value(/VIX3M/), value(/Net GEX/), value(/金银比/)]).toEqual(['0.58', '1.15', '15.59', '18.07', '7.69', '67.73'])
    expect(fetcher.mock.calls.filter(([u]) => String(u).includes('/api/sentiment'))).toHaveLength(1)
    expect(screen.getByText(/VIX 期限结构正常/)).toBeTruthy()
  })
})

describe('再平衡检查器：风险贡献', () => {
  it('作者案例里恒生科技只占 20% 的钱，却承担约一半以上的风险，并给出提示', () => {
    openAllocation()
    fireEvent.click(screen.getByRole('button', { name: '作者案例' }))
    expect(screen.getByText(/权重 vs 风险贡献（按目标占比）/)).toBeTruthy()
    expect(screen.getByText(/只占钱的 20%（占风险资产的 25%），却承担约 55%/)).toBeTruthy()
  })

  it('均衡档没有单项风险畸高，不出现提示；个股名称标为未识别', () => {
    openAllocation()
    expect(screen.queryByText(/却承担约/)).toBeNull()
    expect(screen.getByText(/风险资产合计占钱的 50%，承担约 (9\d|10\d)%/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /添加/ }))
    fireEvent.change(screen.getByLabelText('资产名称 新资产'), { target: { value: '某只个股' } })
    fireEvent.change(screen.getByLabelText('目标占比 某只个股'), { target: { value: '10' } })
    expect(screen.getByText(/未识别并排除：某只个股/)).toBeTruthy()
  })
})

describe('交易前检查单与冷静期', () => {
  const register = (name: string) => {
    fireEvent.change(screen.getByLabelText('登记标的或操作'), { target: { value: name } })
    fireEvent.click(screen.getByRole('button', { name: /登记这个想法/ }))
  }

  it('登记后处于「检查单未通过」，勾全并写证伪条件后进入冷静期而不是直接可执行', () => {
    openAllocation()
    register('腾讯控股')
    expect(screen.getByText('检查单未通过')).toBeTruthy()
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box)
    fireEvent.change(screen.getByLabelText('证伪条件 腾讯控股'), { target: { value: '云业务毛利率连续两季下滑' } })
    expect(screen.getByText('冷静期中')).toBeTruthy()
    expect(screen.getByText(/还剩 (47|48) 小时|还剩 1 天 2\d 小时|还剩 2 天/)).toBeTruthy()
  })

  it('写下提前执行理由后留痕，状态变为「已提前执行」；记录刷新后仍在', () => {
    openAllocation()
    register('英伟达')
    fireEvent.change(screen.getByLabelText('提前执行理由 英伟达'), { target: { value: '财报后大幅跳空' } })
    expect(screen.getByText('已提前执行（留痕）')).toBeTruthy()
    cleanup()
    openAllocation()
    expect(screen.getByText('英伟达')).toBeTruthy()
    expect(screen.getByText('已提前执行（留痕）')).toBeTruthy()
  })

  it('空名称不登记，可删除记录', () => {
    openAllocation()
    fireEvent.click(screen.getByRole('button', { name: /登记这个想法/ }))
    expect(screen.queryByText('检查单未通过')).toBeNull()
    register('美团')
    fireEvent.click(screen.getByRole('button', { name: '删除 美团' }))
    expect(screen.queryByText('美团')).toBeNull()
  })
})
