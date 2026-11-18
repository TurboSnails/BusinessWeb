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
      return { ok: true, json: async () => ({ ...dailyReportFixture, asOf: '2026-11-14', prevDate: null, missingPrev: true }) }
    }
    return { ok, json: async () => index }
  }))
  return render(<MemoryRouter initialEntries={['/jixing/daily']}><JixingDaily /></MemoryRouter>)
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('指数日报', () => {
  it('渲染摘要与变化表', async () => {
    renderPage()
    expect(await screen.findByText(/摘要 · 2026-11-17/)).toBeTruthy()
    expect(screen.getByText(/进入低估/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '沪深300' }).getAttribute('href')).toBe('/jixing/table?code=000300')
  })

  it('日期切换', async () => {
    renderPage()
    await screen.findByText(/摘要 · 2026-11-17/)
    fireEvent.click(screen.getByRole('button', { name: '上一天' }))
    expect(await screen.findByText(/摘要 · 2026-11-14/)).toBeTruthy()
  })

  it('空态', async () => {
    renderPage(null, false)
    expect(await screen.findByText('暂无指数日报')).toBeTruthy()
  })

  it('缺前日校验', () => {
    const r = asJixingDailyReport(dailyMissingPrevFixture)
    expect(r?.missingPrev).toBe(true)
    expect(r?.rows[0].changePct).toBeNull()
  })
})
