import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TimelinePanel, { heatBand, strategyDetailRows } from './TimelinePanel'
import { combinedStrategyFixture } from './fixture'
import type { Heat } from './types'

vi.mock('../macro-posture/composite/load', () => ({
  useCompositePosture: vi.fn(() => ({ status: 'loading' })),
}))

afterEach(cleanup)

describe('TimelinePanel', () => {
  it('默认下带是冷热：图例、色带 class 与带名都按冷热', () => {
    render(<TimelinePanel data={combinedStrategyFixture()} />)
    const chart = screen.getByTestId('cs-dual-timeline')
    expect(chart.getAttribute('data-lower')).toBe('heat')
    expect(within(screen.getByTestId('cs-timeline-switch')).getByRole('button', { name: '下带：冷热' })
      .getAttribute('aria-pressed')).toBe('true')
    const labels = [...chart.querySelectorAll('.mp-timeline__band-label')].map(node => node.textContent)
    expect(labels).toEqual(['宏观档位（仓位）', '冷热'])
    expect(screen.getByTestId('mp-timeline-legend-hot').textContent).toBe('冷热：偏热')
    const regimeBands = [...chart.querySelectorAll('[data-band="regime"]')]
    expect(regimeBands.length).toBeGreaterThan(0)
    expect(regimeBands.every(node => /mp-timeline__band--heat-(hot|mid|cold)|^mp-timeline__band$/.test(node.getAttribute('class') ?? ''))).toBe(true)
    expect(chart.textContent).not.toContain('综合分档位')
  })

  it('切到「雷达综合分档位」子 tab：下带改画五档，并注明只作对照', () => {
    render(<TimelinePanel data={combinedStrategyFixture()} />)
    fireEvent.click(screen.getByRole('button', { name: '下带：雷达综合分档位' }))
    const chart = screen.getByTestId('cs-dual-timeline')
    expect(chart.getAttribute('data-lower')).toBe('tier')
    const labels = [...chart.querySelectorAll('.mp-timeline__band-label')].map(node => node.textContent)
    expect(labels).toEqual(['宏观档位（仓位）', '综合分档位'])
    expect(document.querySelector('.mp-timeline__legend-note')?.textContent).toContain('只作对照')
    expect(screen.queryByTestId('mp-timeline-legend-hot')).toBeNull()
    expect(chart.querySelector('.mp-timeline__band--heat-hot')).toBeNull()
  })
})

describe('heatBand', () => {
  it('按月份取冷热；缺值写读数暂缺', () => {
    const heats = new Map<string, Heat | null>([['2020-01', 'hot'], ['2020-02', null]])
    const band = heatBand(heats)
    const point = (d: string) => ({ d, spx: 1, final: null, regime: null, rec: 0 as const })
    expect(band.value(point('2020-01'))).toBe('hot')
    expect(band.label(band.value(point('2020-01')))).toBe('偏热')
    expect(band.label(band.value(point('2020-02')))).toBe('读数暂缺')
    expect(band.classSuffix('cold')).toBe('heat-cold')
    expect(band.legend.map(item => item.value)).toEqual(['hot', 'mid', 'cold'])
  })
})

describe('strategyDetailRows', () => {
  it('综合分档位模式下不用「偏防守/偏进攻」描述差距', () => {
    const rows = strategyDetailRows({ d: '2020-01', final: 'neutral', regime: 'defense' }, new Map())
    expect(rows.find(row => row.label === '差几档')?.value).toBe('综合分偏低 2 档')
    expect(rows.map(row => row.caption ?? '').join('')).not.toMatch(/偏防守|偏进攻/)
  })
})
