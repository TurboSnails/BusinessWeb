import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AiTokenEconomics from './AiTokenEconomics'
import { SAVED_SNAPSHOTS, impliedPriceChange, naiveSpendChange, pickLatest } from '../features/ai-token-economics/data'

// 页面显示最新一期；预期值从同一份快照算，每周新增数据不用改测试
const latest = pickLatest(SAVED_SNAPSHOTS)
const pct = (v: number) => `${v >= 0 ? '+' : '−'}${(Math.abs(v) * 100).toFixed(1)}%`
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const renderPage = () => render(<MemoryRouter><AiTokenEconomics /></MemoryRouter>)

describe('AI 降价与利润页', () => {
  it('说明 Ramp 数字来自页面解析，其余为对话所述', () => {
    renderPage()
    expect(screen.getByRole('note').textContent).toContain('由脚本直接解析自 Ramp AI Index')
    expect(screen.getByRole('note').textContent).toContain('对话所述')
  })

  it('显示数据截至日期与已保存的最新一期', () => {
    const { container } = renderPage()
    expect(container.querySelector('.ate-databar')?.textContent).toContain(`数据截至 ${latest.weekEnding} 当周`)
  })

  it('手动刷新：取到更新一期时覆盖显示并标注未保存', async () => {
    const snap = JSON.parse(JSON.stringify(SAVED_SNAPSHOTS[SAVED_SNAPSHOTS.length - 1]))
    const next = addDays(latest.weekEnding, 7)
    snap.weekEnding = next; snap.comparedWeekEnding = addDays(next, -28); snap.tokenUsage = 0.3
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => snap })))
    const { container } = renderPage()
    fireEvent.click(screen.getByRole('button', { name: '刷新最新数据' }))
    await waitFor(() => expect(container.querySelector('.ate-status')?.textContent).toContain('更新的一期'))
    expect(container.querySelector('.ate-databar')?.textContent).toContain(`数据截至 ${next} 当周`)
    expect(container.querySelector('.ate-databar')?.textContent).toContain('未保存')
    expect(container.textContent).toContain('+30.0%')
  })

  it('手动刷新：同一期提示已是最新；失败时保留已保存数据', async () => {
    const saved = SAVED_SNAPSHOTS[SAVED_SNAPSHOTS.length - 1]
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => saved })))
    const { container } = renderPage()
    fireEvent.click(screen.getByRole('button', { name: '刷新最新数据' }))
    await waitFor(() => expect(container.querySelector('.ate-status')?.textContent).toContain('已是最新一期'))
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'x' }) })))
    fireEvent.click(screen.getByRole('button', { name: '刷新最新数据' }))
    await waitFor(() => expect(container.querySelector('.ate-status')?.textContent).toContain('暂时取不到'))
    expect(container.querySelector('.ate-databar')?.textContent).toContain(`数据截至 ${latest.weekEnding} 当周`)
  })

  it('展示 Ramp 三个数字及反推的同口径单价', () => {
    const { container } = renderPage()
    const text = container.textContent ?? ''
    expect(text).toContain(pct(latest.tokenUsage))
    expect(text).toContain(pct(latest.tokenSpend))
    expect(text).toContain(pct(impliedPriceChange(latest.tokenSpend, latest.tokenUsage)))
    expect(text).toContain(pct(naiveSpendChange(latest.tokenUsage, latest.price.combined.change)))
  })

  it('图表带文字替代', () => {
    renderPage()
    expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(4)
    const usage = pct(latest.tokenUsage).replace(/[+.]/g, m => `\\${m}`)
    expect(screen.getByRole('img', { name: new RegExp(`Ramp 样本：对应周变化.*Token 用量 ${usage}`) })).toBeTruthy()
  })

  it('敏感性滑块即时重算毛利', () => {
    const { container } = renderPage()
    expect(container.querySelector('.ate-result')?.textContent).toContain('60.8')
    fireEvent.change(screen.getByLabelText(/API 平均售价变化/), { target: { value: '-50' } })
    // 收入 100×1.52×0.5=76，成本 50×1.52×0.7=53.2，毛利 22.8
    expect(container.querySelector('.ate-result')?.textContent).toContain('22.8')
  })
})
