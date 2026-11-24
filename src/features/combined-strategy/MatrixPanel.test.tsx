import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import MatrixPanel from './MatrixPanel'
import { combinedStrategyAdoptedFixture, combinedStrategyFixture } from './fixture'

afterEach(cleanup)

describe('MatrixPanel', () => {
  it('全样本九格、当前格高亮、thin 标样本少', () => {
    render(<MatrixPanel data={combinedStrategyFixture()} />)
    expect(screen.getByTestId('cs-matrix-lead').textContent).toContain('不是交易规则')
    const all = screen.getByTestId('cs-matrix-all')
    expect(all.querySelectorAll('tbody tr')).toHaveLength(3)
    expect(all.querySelector('[data-cell="offense:hot"]')?.getAttribute('data-current')).toBe('true')
    expect(all.querySelectorAll('[data-testid="cs-matrix-thin"]').length).toBeGreaterThan(0)
    expect(all.textContent).toContain('按档位持有')
    const since = screen.getByTestId('cs-matrix-2000')
    expect(since.querySelector('[data-cell="offense:cold"]')?.textContent).toContain('—')
  })

  it('since2000 全空显示 —，不重复 action', () => {
    render(<MatrixPanel data={combinedStrategyAdoptedFixture()} />)
    const table = screen.getByTestId('cs-matrix-2000')
    expect(table.textContent).toContain('—')
    expect(table.textContent).not.toContain('按档位持有')
  })
})
