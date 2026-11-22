import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ComparisonGrid } from './ComparisonGrid'
import { MetricsTable } from './MetricsTable'
import { createConclusionFixture, createRunResultFixture } from '../fixtures'

afterEach(() => cleanup())

describe('基准实际窗口', () => {
  it('四格和核心指标标出 QQQE 实际区间，并禁止直接比较期末金额', () => {
    const fixture = createConclusionFixture()
    fixture.comparison.custom.active.start = '2010-01-04'
    fixture.comparison.benchmarks.QQQE = createRunResultFixture({ start: '2012-03-21' })
    const grid = render(<ComparisonGrid comparison={fixture.comparison} />)
    const benchmark = screen.getByText('QQQE（纳指 100 等权）').closest('.pr-benchmark')!
    expect(benchmark.textContent).toContain('2012-03-21 — 2026-01-01')
    expect(benchmark.textContent).toContain('基准 2012-03-21 起才有数据，与组合区间不同；期末金额不与组合直接比较。')
    grid.unmount()

    render(<MetricsTable comparison={fixture.comparison} />)
    const row = screen.getByText('QQQE（纳指 100 等权） · 不动').closest('tr')!
    expect(row.textContent).toContain('实际区间 2012-03-21 — 2026-01-01')
    expect(row.textContent).toContain('区间不同，不与组合直接比较')
  })
})
