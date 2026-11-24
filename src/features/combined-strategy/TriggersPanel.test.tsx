import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { compositeFixture } from '../macro-posture/composite/fixture'
import TriggersPanel from './TriggersPanel'

vi.mock('../macro-posture/composite/load', () => ({
  useCompositePosture: vi.fn(),
  tierDef: vi.fn((file: { tiers: { id: string; equityShare: number }[] }, id: string) => (
    file.tiers.find(t => t.id === id)
  )),
}))

import { useCompositePosture } from '../macro-posture/composite/load'

const mocked = vi.mocked(useCompositePosture)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TriggersPanel', () => {
  it('升降档、均线、最近指标与固定说明', () => {
    mocked.mockReturnValue({ status: 'ready', data: compositeFixture() })
    render(<TriggersPanel />)
    expect(screen.getByTestId('cs-triggers-down').textContent).toContain('会降一档')
    expect(screen.getByTestId('cs-triggers-up').textContent).toContain('会升一档')
    expect(screen.getByTestId('cs-triggers-tactical').textContent).toContain('本月均线')
    expect(screen.getByTestId('cs-triggers-nearest').textContent).toContain('萨姆规则')
    expect(screen.getByTestId('cs-triggers-note').textContent).toContain('雷达的冷热变化不触发调仓')
  })

  it('distance 缺失显示暂缺', () => {
    mocked.mockReturnValue({ status: 'error', message: 'x' })
    render(<TriggersPanel />)
    expect(screen.getByTestId('cs-triggers-missing').textContent).toBe('暂缺')
  })
})
