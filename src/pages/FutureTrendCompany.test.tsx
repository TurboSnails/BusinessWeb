import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import type { CompanyResearch } from '../data/futureTrendsResearch'
import FutureTrendCompany from './FutureTrendCompany'

it('研究页优先展现披露来源，档案过期仍保留核验记录，主观胜率单列', async () => {
  const report: CompanyResearch = JSON.parse(readFileSync('public/research/future-trends-2026-10-09/companies/listed-688256.json', 'utf8'))
  report.winRate = '假设胜率 70%（未经校准）'
  const current = report.sources.find(s => s.url.includes('/data-refresh-') && existsSync('public' + s.url))
  expect(current).toBeTruthy()
  report.sources = [
    current!,
    { title: '行情证据', url: '/research/data-refresh-1999-01-01/tencent-quotes.json', status: '1999 年报价核验' },
    { title: '公司披露', url: 'https://example.org/disclosure', status: '公司公告原文' },
  ]
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => report }))
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  try {
    render(<MemoryRouter initialEntries={['/future-trends/company/listed-688256']}><Routes><Route path="/future-trends/company/:id" element={<FutureTrendCompany />} /></Routes></MemoryRouter>)
    const research = (await screen.findByRole('heading', { name: '研究说明与来源' })).closest('section')!
    expect(within(research).getAllByRole('link').map(a => a.getAttribute('href')).slice(0, 2)).toEqual([
      'https://example.org/disclosure', import.meta.env.BASE_URL + current!.url.slice(1),
    ])
    expect(research.textContent).toContain('1999-01-01 行情档案（站内文件未保留） — 1999 年报价核验')
    expect(screen.getByText(report.winRate)).toBeTruthy()
    expect(screen.getByText('原研究理由')).toBeTruthy()
    expect(screen.getByText('按该报价计算的情景盈亏比')).toBeTruthy()
  } finally {
    vi.unstubAllGlobals()
  }
})
