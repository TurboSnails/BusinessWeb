import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STAGES } from '../macro/stages'
import { combinedStrategyFixture } from './fixture'
import { resetCombinedStrategyCache } from './load'
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

describe('VerdictBar', () => {
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

  it('有阶段：展示指令与阶段动作', async () => {
    wrap(<VerdictBar fetcher={okFetcher()} stage={STAGES[1]} />)
    await waitFor(() => expect(screen.getByTestId('verdict-bar-equity').textContent).toContain('股票仓位保持在你上限的 85%'))
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
