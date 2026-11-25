import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import MatrixPanel from './MatrixPanel'
import { combinedStrategyAdoptedFixture, combinedStrategyFixture } from './fixture'

afterEach(cleanup)

describe('MatrixPanel', () => {
  it('全样本九格、当前格高亮、thin 标样本少、格子显示名字', () => {
    render(<MatrixPanel data={combinedStrategyFixture()} />)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('九种状态的历史表现')
    expect(screen.getByTestId('cs-matrix-lead').textContent).toContain('不是交易规则')
    const all = screen.getByTestId('cs-matrix-all')
    expect(all.querySelectorAll('tbody tr')).toHaveLength(3)
    expect(all.querySelector('[data-cell="offense:hot"]')?.getAttribute('data-current')).toBe('true')
    expect(all.querySelectorAll('[data-testid="cs-matrix-thin"]').length).toBeGreaterThan(0)
    expect(all.textContent).toContain('按档位持有')
    expect(all.textContent).toContain('扩张后段')
    expect(all.querySelectorAll('[data-testid="cs-matrix-name"]')).toHaveLength(9)
    const since = screen.getByTestId('cs-matrix-2000')
    expect(since.querySelector('[data-cell="offense:cold"]')?.textContent).toContain('—')
  })

  it('默认显示全样本，切到 2000 年以后', () => {
    render(<MatrixPanel data={combinedStrategyFixture()} />)
    const all = screen.getByTestId('cs-matrix-all').closest('[hidden]')
    expect(all).toBeNull()
    expect(screen.getByTestId('cs-matrix-2000').closest('[hidden]')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '2000 年以后' }))
    expect(screen.getByTestId('cs-matrix-2000').closest('[hidden]')).toBeNull()
    expect(screen.getByTestId('cs-matrix-all').closest('[hidden]')).not.toBeNull()
    expect(screen.getByRole('button', { name: '2000 年以后' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('since2000 全空显示 —，不重复 action', () => {
    render(<MatrixPanel data={combinedStrategyAdoptedFixture()} />)
    const table = screen.getByTestId('cs-matrix-2000')
    expect(table.textContent).toContain('—')
    expect(table.textContent).not.toContain('按档位持有')
  })
})
