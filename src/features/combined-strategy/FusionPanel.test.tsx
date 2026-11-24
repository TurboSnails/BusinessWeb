import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import FusionPanel from './FusionPanel'
import { combinedStrategyAdoptedFixture, combinedStrategyFixture } from './fixture'

afterEach(cleanup)

describe('FusionPanel', () => {
  it('verdict、基线高亮、adopted 为 null 无采用标', () => {
    render(<FusionPanel data={combinedStrategyFixture()} />)
    expect(screen.getByTestId('cs-fusion-verdict').textContent).toContain('只按宏观攻守')
    const table = screen.getByTestId('cs-fusion-table')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(8)
    expect(table.querySelector('[data-row="macro"]')?.classList.contains('is-highlight')).toBe(true)
    expect(screen.queryByTestId('cs-adopted-badge')).toBeNull()
    expect(table.textContent).toContain('训练期年化')
    expect(table.textContent).toContain('验证期年化')
    expect(table.textContent).toContain('全样本年化')
  })

  it('adopted 非 null 与 passTrain 显示标记', () => {
    render(<FusionPanel data={combinedStrategyAdoptedFixture()} />)
    expect(screen.getByTestId('cs-adopted-badge').textContent).toBe('采用')
    expect(screen.getByTestId('cs-pass-train-m4').textContent).toBe('训练期过线')
    expect(screen.getByTestId('cs-fusion-table').querySelector('[data-row="m4"]')?.getAttribute('data-adopted')).toBe('true')
  })
})
