import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import sector from '../features/strategy-lab/data/sector-rotation.json'
import StrategyLab, { LAB_STUDIES } from './StrategyLab'
import VerifiedStrategies, { VERIFIED, VERIFIED_LEAD } from './VerifiedStrategies'

vi.mock('../features/combined-strategy/load', () => ({
  useCombinedStrategy: vi.fn(() => ({ status: 'ready', data: { current: { instruction: '股票仓位保持在你上限的 85%，本月不用调。' } } })),
}))

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/invest/verified" element={<VerifiedStrategies />} />
        <Route path="/invest/strategy-lab" element={<StrategyLab />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('通过检验页', () => {
  it('页头说明、导航当前页；默认板块轮动页签，先写为什么没加入综合策略', () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    renderAt('/invest/verified')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('通过检验')
    expect(screen.getByTestId('verified-lead').textContent).toBe(VERIFIED_LEAD)
    const trio = screen.getByRole('navigation', { name: '策略相关页面' })
    expect(within(trio).getByRole('link', { name: '已通过 · 通过检验' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(VERIFIED.map(v => v.label))
    const why = screen.getByTestId('verified-why')
    expect(within(why).getAllByRole('listitem')).toHaveLength(VERIFIED[0].reasons.length)
    expect(screen.getByTestId('lab-sector-table').textContent).toContain(sector.main.S1.verdict)
  })

  it('板块轮动影子读数：加载失败有提示；成功时显示当月入选', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    renderAt('/invest/verified')
    expect(await screen.findByText('影子读数暂时加载不了')).toBeTruthy()
  })

  it('板块轮动影子读数：显示当月入选', async () => {
    const body = { since: '2026-12', until: '2027-11', rows: [], current: null, upcoming: { month: '2026-12', picks: { S1: ['XLE', 'XLK', 'XLB'], S2: null } } }
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(body) })))
    renderAt('/invest/verified')
    expect(await screen.findByText(/2026-12 入选——S1：能源（XLE）、科技（XLK）、原材料（XLB）；S2：待上月底数据。/)).toBeTruthy()
  })

  it('切到防守倾斜页签', () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    renderAt('/invest/verified')
    fireEvent.click(screen.getByRole('tab', { name: '防守倾斜' }))
    expect(screen.getByTestId('lab-defensive-tilt')).toBeTruthy()
    expect(screen.queryByTestId('lab-sector-rotation')).toBeNull()
  })

  it('研究中不再收录通过的研究；旧链接跳到通过检验页', () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    expect(LAB_STUDIES.some(s => s.status === 'pass')).toBe(false)
    renderAt('/invest/strategy-lab?tab=late#lab-defensive-tilt')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('通过检验')
    expect(screen.getByTestId('lab-defensive-tilt')).toBeTruthy()
  })

  it('旧的 ?tab=sector 链接跳到板块轮动', () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    renderAt('/invest/strategy-lab?tab=sector#lab-sector-rotation')
    expect(screen.getByTestId('lab-sector-rotation')).toBeTruthy()
  })
})
