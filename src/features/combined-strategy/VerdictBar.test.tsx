import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STAGES } from '../macro/stages'
import { combinedStrategyFixture } from './fixture'
import { resetCombinedStrategyCache } from './load'
import { beijingToday, officialFreshness } from './freshness'
import VerdictBar from './VerdictBar'

afterEach(() => {
  cleanup()
  resetCombinedStrategyCache()
  vi.restoreAllMocks()
})

function wrap(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

function okFetcher(data = combinedStrategyFixture()) {
  return vi.fn(async () => new Response(JSON.stringify(data), { status: 200 })) as unknown as typeof fetch
}

describe('officialFreshness', () => {
  it('本月 4 日起，正式定档还停在更早月份才算过期；1–3 日不算（1 日是周日时 3 日早上才生成）', () => {
    expect(officialFreshness('2026-10', '2026-11-25')).toEqual({ stale: false, expected: '2026-10' })
    expect(officialFreshness('2026-10', '2026-12-03')).toEqual({ stale: false, expected: '2026-11' })
    expect(officialFreshness('2026-10', '2026-12-04')).toEqual({ stale: true, expected: '2026-11' })
    expect(officialFreshness('2026-12', '2027-01-05')).toEqual({ stale: false, expected: '2026-12' })
    expect(officialFreshness('2026-11', '2027-01-05').stale).toBe(true)
    expect(officialFreshness(null, '2026-11-25').stale).toBe(true)
  })

  it('beijingToday 按东八区换日', () => {
    expect(beijingToday(new Date('2026-11-30T16:30:00Z'))).toBe('2026-12-01')
    expect(beijingToday(new Date('2026-11-30T15:30:00Z'))).toBe('2026-11-30')
  })
})

describe('VerdictBar', () => {
  it('定档过期时在结论下方提示，不按它调仓', async () => {
    wrap(<VerdictBar fetcher={okFetcher()} today="2026-12-05" />)
    const stale = await screen.findByTestId('verdict-bar-stale')
    expect(stale.textContent).toContain('还停在2026 年 10 月底')
    expect(stale.textContent).toContain('2026 年 11 月底的定档还没生成')
  })

  it('定档及时时不提示', async () => {
    wrap(<VerdictBar fetcher={okFetcher()} today="2026-11-25" />)
    await screen.findByTestId('verdict-bar-equity')
    expect(screen.queryByTestId('verdict-bar-stale')).toBeNull()
  })

  it('加载中显示占位', () => {
    const fetcher = vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch
    wrap(<VerdictBar fetcher={fetcher} />)
    expect(screen.getByRole('complementary', { name: '本站当前结论' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('正在读取当前结论…')
  })

  it('失败时提示并链到综合策略，不抛错', async () => {
    const fetcher = vi.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch
    wrap(<VerdictBar fetcher={fetcher} />)
    await waitFor(() => expect(screen.getByText(/当前结论暂时读不到/)).toBeTruthy())
    expect(screen.getByRole('link', { name: '综合策略' }).getAttribute('href')).toBe('/invest/strategy')
  })

  it('有阶段：展示可执行仓位与阶段动作', async () => {
    localStorage.removeItem('mp-equity-cap')
    wrap(<VerdictBar fetcher={okFetcher()} stage={STAGES[1]} />)
    await waitFor(() => {
      const text = screen.getByTestId('verdict-bar-equity').textContent ?? ''
      expect(text).toContain('美股股票仓位约 68%')
      expect(text).toContain('你的上限 80%')
      expect(text).toContain('当前档位 85%')
    })
    expect(screen.getByTestId('verdict-bar-stage').textContent).toBe('风险预算阶段：预警。暂停新增主动持仓')
    expect(screen.getByRole('link', { name: '综合策略' }).getAttribute('href')).toBe('/invest/strategy')
    expect(screen.getByRole('link', { name: '阶段规则' }).getAttribute('href')).toBe('/monitor?tab=method')
    expect(screen.getByText('以上只针对美股；A 股、港股暂无仓位结论。')).toBeTruthy()
  })

  it('无阶段：用通用说明', async () => {
    wrap(<VerdictBar fetcher={okFetcher()} />)
    await waitFor(() => expect(screen.getByTestId('verdict-bar-stage').textContent).toBe('按风险预算阶段执行，不随仓位档位变。'))
  })

  it('hideStage 不显示主动额度行', async () => {
    wrap(<VerdictBar fetcher={okFetcher()} stage={STAGES[0]} hideStage />)
    await waitFor(() => expect(screen.getByTestId('verdict-bar-equity')).toBeTruthy())
    expect(screen.queryByTestId('verdict-bar-stage')).toBeNull()
    expect(screen.queryByRole('link', { name: '阶段规则' })).toBeNull()
  })
})
