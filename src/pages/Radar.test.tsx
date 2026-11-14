import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Radar from './Radar'

const YI = 1e8
const item = (c: string, n: string, extra: Record<string, unknown> = {}) => ({
  m: 'cn', c, n, g: ['沪深300'], px: 25, pxDate: '2026-11-13', ccy: 'CNY', fy: '2025-12-31', ind: '食品饮料',
  years: [['2025', 100 * YI, 30 * YI, 2 * YI], ['2024', 95 * YI, 29 * YI, 2 * YI], ['2023', 90 * YI, 28 * YI, 2 * YI]],
  cash: 50 * YI, inv: 0, debt: 0, shares: 10 * YI, interest: 0, pretax: 40 * YI, tax: 8 * YI, ebitda: 40 * YI, ni: 30 * YI, beta: 0.8, betaRaw: 0.8, betaWeeks: 104, src: '', at: '',
  fyh: { now: 26, pct: 90, med: 10, lo: 5, hi: 27, n: 60 }, ...extra,
})
const moat = { s: 5, n: 6, l: '宽护城河迹象', i: [['盈利持续', true, '三个 TTM 窗口利润 30/29/28'], ['财务稳健', true, '资产负债率 20%']] }
const lib = { schemaVersion: 1, generatedAt: '2026-11-14T00:00:00Z', riskFree: { cn: { value: 1.8, date: '2026-11-13', label: '' }, us: { value: 4, date: '2026-11-13', label: '' } }, universe: 3, issues: [], items: [item('000001', '稳价'), item('000002', '快增'), item('000003', '周期顶')] }
const lynch = {
  'cn:000001': { t: '稳健型', pe: 10, g: 10, c: 9, rg: 6, w: [], f: [], m: moat },
  'cn:000002': { t: '快速增长型', pe: 18, g: 30, c: 32, rg: 25, w: [], f: [], m: moat, peAsOf: '2026-11-13' },
  'cn:000003': { t: '周期型', pe: 4, g: 120, c: 80, rg: 40, ph: '盈利低位', w: ['行业属强周期'], f: [], m: moat },
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const body = url.includes('dcf-prefill') ? lib : url.includes('lynch.json') ? lynch : null
    return { ok: !!body, json: async () => body } as unknown as Response
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('机会雷达页', () => {
  it('两条主线分开显示，周期型只在「不在主线」里出现', async () => {
    render(<MemoryRouter><Radar /></MemoryRouter>)
    expect(await screen.findByRole('link', { name: '稳价' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: '快增' })).toBeNull()
    expect(screen.getByText(/不在主线的 1 家/)).toBeTruthy()
    expect(screen.getAllByRole('link', { name: '第20章' }).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /快速增长/ }))
    expect(screen.getByRole('link', { name: '快增' }).getAttribute('href')).toBe('/research-notes/cn/000002')
    expect(screen.getByTitle(/≤ \(1\+30%\)³ ÷ 1.10³ × 15 = 24.8×/)).toBeTruthy()
    expect(screen.queryByRole('link', { name: '稳价' })).toBeNull()
  })
})
