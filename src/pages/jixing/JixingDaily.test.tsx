import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dailyIndexFixture, dailyMissingPrevFixture, dailyReportFixture } from '../../features/jixing-daily/fixtures'
import { asJixingDailyReport } from '../../features/jixing-daily/model'
import JixingDaily from './JixingDaily'

function renderPage(index: unknown = dailyIndexFixture, ok = true) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo) => {
    const url = String(input)
    if (url.includes('jixing-daily-2026-11-14')) {
      return { ok: true, status: 200, json: async () => ({ ...dailyReportFixture, asOf: '2026-11-14', prevDate: null, missingPrev: true }) }
    }
    return { ok, status: ok ? 200 : 404, json: async () => index }
  }))
  return render(<MemoryRouter initialEntries={['/jixing/daily']}><JixingDaily /></MemoryRouter>)
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('指数日报', () => {
  it('渲染摘要与变化表', async () => {
    renderPage()
    expect(await screen.findByText(/摘要 · 2026-11-17/)).toBeTruthy()
    expect(screen.getByText(/行业中性星级/)).toBeTruthy()
    expect(screen.getByText(/进入低估/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '沪深300' }).getAttribute('href')).toBe('/jixing/table?code=000300')
  })

  it('历史日报加载期间隐藏旧内容，返回最新日后直接显示摘要', async () => {
    renderPage()
    await screen.findByText(/摘要 · 2026-11-17/)
    fireEvent.click(screen.getByRole('button', { name: '上一天' }))
    expect(screen.getByRole('status').textContent).toBe('正在读取 2026-11-14 日报…')
    expect(screen.queryByText(/摘要 · 2026-11-17/)).toBeNull()
    expect(await screen.findByText(/摘要 · 2026-11-14/)).toBeTruthy()

    fireEvent.change(screen.getByRole('combobox', { name: '选择日报日期' }), { target: { value: '2026-11-17' } })
    expect(screen.getByText(/摘要 · 2026-11-17/)).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('旧日报注明中证全指口径', async () => {
    renderPage({ ...dailyIndexFixture, latest: { ...dailyReportFixture, starBasis: undefined } })
    expect(await screen.findByText(/中证全指口径星级/)).toBeTruthy()
  })

  it('行业中性日期不一致时显示空值和来源日期', async () => {
    renderPage({ ...dailyIndexFixture, latest: {
      ...dailyReportFixture, star: null, starChange: null, starAsOf: '2026-11-18',
    } })
    const summary = await screen.findByText(/行业中性星级/)
    expect(summary.textContent).toContain('星级 —')
    expect(summary.textContent).toContain('星级数据日 2026-11-18')
  })

  it('空态显示 LoadError 与重试', async () => {
    renderPage(null, false)
    expect((await screen.findByRole('alert')).textContent).toContain('数据暂时取不到')
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
  })

  it('缺前日校验', () => {
    const r = asJixingDailyReport(dailyMissingPrevFixture)
    expect(r?.missingPrev).toBe(true)
    expect(r?.rows[0].changePct).toBeNull()
  })
})
