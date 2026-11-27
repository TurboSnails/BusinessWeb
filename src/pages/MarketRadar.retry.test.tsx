/** 市场雷达：失败 → 重试 → 成功（真实 useMarketRadar，不 mock load） */
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { radarFixture } from '../features/market-radar/fixture'
import { resetRadarCache } from '../features/market-radar/load'
import MarketRadar from './MarketRadar'

vi.mock('../features/macro-posture/composite/load', () => ({
  useCompositePosture: vi.fn(() => ({ status: 'loading' })),
  tierDef: vi.fn(),
  resetCompositeCache: vi.fn(),
  COMPOSITE_URL: '/data/macro-posture.json',
}))

vi.mock('../features/combined-strategy/load', () => ({
  useCombinedStrategy: vi.fn(() => ({ status: 'ready', data: { current: { instruction: '股票仓位保持在你上限的 85%，本月不用调。' } }, retry: vi.fn() })),
  resetCombinedStrategyCache: vi.fn(),
  COMBINED_STRATEGY_URL: '/data/combined-strategy.json',
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  resetRadarCache()
})

describe('市场雷达 LoadError 重试', () => {
  it('失败 → 重试 → 成功', async () => {
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (!url.includes('market-radar.json')) return Response.json({})
      calls += 1
      if (calls === 1) return new Response('err', { status: 500 })
      return Response.json(radarFixture())
    }))
    render(<MemoryRouter initialEntries={['/invest/market-radar']}><MarketRadar /></MemoryRouter>)
    expect(await screen.findByTestId('mr-error')).toBeTruthy()
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(screen.queryByTestId('mr-error')).toBeNull())
    expect(screen.getByTestId('mr-heat')).toBeTruthy()
    expect(calls).toBe(2)
  })
})
