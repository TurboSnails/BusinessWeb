import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MarketCycleView from './MarketCycleView'
const renderView = () => render(<MemoryRouter><MarketCycleView /></MemoryRouter>)

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals() })
describe('牛熊周期复盘', () => {
  it('自动证据优先，可明确人工覆盖，保存时冻结自动输入与选择', async () => {
    const automatic = { schemaVersion: 1, generatedAt: '2026-10-17T10:00:00Z', issues: [], facts: [{ metricId: 'erp_z', market: 'csi300', value: 2.1,
      observationDate: '2026-10-16', availableAt: null, firstSeenAt: '2026-10-17T09:00:00Z', fetchedAt: '2026-10-17T10:00:00Z',
      source: 'https://www.csindex.com.cn/', unit: 'z-score', kind: 'observed', frequency: 'daily', description: '5年同日交集' }] }
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-17T12:00:00Z'))
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('market-cycle-auto.json')) return { ok: true, json: async () => automatic }
      throw new Error('offline')
    }))
    try {
      renderView()
      expect(await screen.findByText(/自动 · 简化ERP z-score 2.10/)).toBeTruthy()
      fireEvent.change(screen.getByLabelText(/ERP z-score/), { target: { value: '-2' } })
      fireEvent.change(screen.getByLabelText('估值与赔率观测日期'), { target: { value: '2026-10-16' } })
      fireEvent.change(screen.getByLabelText('估值与赔率来源链接'), { target: { value: 'https://example.com/manual' } })
      expect(screen.getByText(/自动 · 简化ERP z-score 2.10/)).toBeTruthy()
      fireEvent.change(screen.getByLabelText('估值与赔率证据模式'), { target: { value: 'manual' } })
      expect(screen.getByText(/人工覆盖 · 简化ERP z-score −?-?2.00/)).toBeTruthy()
      for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box)
      fireEvent.click(screen.getByRole('button', { name: '保存本次复盘' }))
      const saved = JSON.parse(localStorage.getItem('businessweb.market-cycle.v1')!)
      expect(saved.logs[0].inputs.automatic.facts[0].value).toBe(2.1)
      expect(saved.logs[0].inputs.manualOnly).toEqual(['valuation'])
    } finally { vi.useRealTimers() }
  })
  it('取数失败明确显示缺失，仍可切换市场、补录证据与重试', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    renderView()
    expect(await screen.findByText(/6个数据文件未能加载/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: '等待证据' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '港股 · 恒生科技' }))
    expect(screen.getByLabelText(/该指数TTM PE历史分位/)).toBeTruthy()
    expect(screen.queryByLabelText(/融资买入占成交额/)).toBeNull()
    expect(screen.getByRole('button', { name: '重新读取数据' })).toBeTruthy()
  })
  it('补录持久化、跨市场隔离，复盘需全部检查完成才能保存', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const view = renderView()
    await screen.findByText(/6个数据文件未能加载/)
    fireEvent.change(screen.getByLabelText(/ERP z-score/), { target: { value: '2.1' } })
    fireEvent.click(screen.getByRole('button', { name: '保存补录' }))
    expect(screen.getByRole('status').textContent).toMatch(/补录已保存在本机/)
    fireEvent.click(screen.getByRole('button', { name: '港股 · 恒生指数' }))
    expect((screen.getByLabelText(/该指数TTM PE历史分位/) as HTMLInputElement).value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'A股 · 沪深300' }))
    expect((screen.getByLabelText(/ERP z-score/) as HTMLInputElement).value).toBe('2.1')
    const save = screen.getByRole('button', { name: '保存本次复盘' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box)
    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    expect(screen.getByText(/复盘已保存/)).toBeTruthy()
    view.unmount()
    renderView()
    expect(await screen.findByText(/等待证据 · A股/)).toBeTruthy()
  })
})
