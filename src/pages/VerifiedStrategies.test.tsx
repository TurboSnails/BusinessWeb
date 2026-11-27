import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import recheck from '../features/strategy-lab/data/daily-recheck.json'
import sector from '../features/strategy-lab/data/sector-rotation.json'
import style from '../features/strategy-lab/data/style-rotation.json'
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


const legs = (a: string[]) => ({ 'V+': a[0], 'V-': a[1], 'M+': a[2], 'P+': a[3], 'S+': a[4], MKT: a[5] })
const reading = { mom: { 'V+': 0.16, 'V-': 0.08, 'M+': 0.12, 'P+': 0.14, 'S+': 0.2, MKT: 0.12 }, r1: ['S+', 'V+'], r2: { 'V+': 0.2, 'V-': 0, 'M+': 0.2, 'P+': 0.2, 'S+': 0.2, MKT: 0.2 } }
const emptyRet = { R1: null, R2: null, EW6: null, STATIC: null, MKT: null }
const STYLE_BODY = {
  since: '2026-12', until: '2027-11',
  groups: { us: { label: '美国', legs: legs(['IVE', 'IVW', 'MTUM', 'QUAL', 'IJR', 'IVV']) }, intl: { label: '海外发达市场', legs: legs(['EFV', 'EFG', 'IMTM', 'IQLT', 'SCZ', 'EFA']) } },
  legNames: { 'V+': '价值', 'V-': '成长', 'M+': '动量', 'P+': '高盈利', 'S+': '小盘', MKT: '大盘' },
  radar: { month: '2026-11', us: reading, intl: null },
  rows: [],
  summary: { through: null, us: { months: 0, cumulative: emptyRet }, intl: { months: 0, cumulative: emptyRet } },
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

  it('按日复核：板块轮动页签列出 7 条门槛的月末与日线夏普差和大跌表，结论来自 L-040 结果', () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    renderAt('/invest/verified')
    const sec = screen.getByTestId('verified-recheck')
    expect(sec.textContent).toContain(`S1 ${recheck.sector.S1.verdict}`)
    expect(within(screen.getByTestId('verified-recheck-sector')).getAllByRole('row')).toHaveLength(8)
    const crash = within(screen.getByTestId('verified-recheck-crashes')).getAllByRole('row')
    expect(crash).toHaveLength(6)
    expect(crash[5].textContent).toContain('2020')
    expect(crash[5].textContent).toContain('−20% / −34%')
  })

  it('按日复核：防守倾斜页签显示 P2 结论与 G2 余量', () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    renderAt('/invest/verified?tab=tilt')
    const sec = screen.getByTestId('verified-recheck')
    expect(sec.textContent).toContain(`P2 ${recheck.tilt.P2.verdict}`)
    expect(sec.textContent).toContain('只深 0.34 个百分点')
    expect(within(screen.getByTestId('verified-recheck-tilt')).getAllByRole('row')).toHaveLength(6)
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

  it('风格轮动页签：两个候选都通过，但写明一直持有正向腿几乎一样好；没有按日复核', () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    renderAt('/invest/verified?tab=style')
    expect(screen.getByTestId('verified-panel-style')).toBeTruthy()
    expect(screen.getByTestId('lab-style-rotation-table').textContent).toContain(style.markets.dxus.R1.sharpe.toFixed(3))
    expect(screen.getByTestId('lab-style-rotation-static').textContent).toContain(style.posthoc.dxus.static.sharpe.toFixed(3))
    expect(style.candidates.R1.verdict).toBe('通过')
    expect(screen.getByTestId('verified-why').textContent).toContain('轮动本身没有多赚')
    expect(screen.queryByTestId('verified-recheck-sector')).toBeNull()
    expect(screen.getByTestId('lab-style-lockbox-verdict').textContent).toContain(`R2「${style.confirm.verdicts.R2.verdict}」`)
    expect(screen.getByTestId('lab-style-lockbox').textContent).toContain(style.confirm.markets.us.R1.sharpe.toFixed(3))
  })

  it('风格轮动影子：显示当月读数表，缺数据的一组给提示', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(STYLE_BODY) })))
    renderAt('/invest/verified?tab=style')
    const table = await screen.findByTestId('mr-style-us')
    expect(within(table).getAllByRole('row')[1].textContent).toContain('小盘')
    expect(within(table).getAllByRole('row')[1].textContent).toContain('入选')
    expect(screen.getByTestId('mr-style-intl').textContent).toContain('暂无读数')
    expect(screen.getByTestId('lab-style-shadow').textContent).toContain('还没有完整月份')
  })
})
