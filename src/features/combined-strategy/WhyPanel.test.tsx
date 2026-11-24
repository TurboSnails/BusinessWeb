import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import WhyPanel from './WhyPanel'
import { combinedStrategyFixture } from './fixture'

afterEach(cleanup)

describe('WhyPanel', () => {
  it('四条道理：标题、理论、证据', () => {
    render(<WhyPanel data={combinedStrategyFixture()} />)
    expect(screen.getByTestId('cs-why-lead').textContent).toContain('1973 年以来的数据')
    expect(screen.getByTestId('cs-why-仓位跟着宏观周期走').textContent).toContain('最大回撤')
    expect(screen.getByTestId('cs-why-贵不是减仓的理由').textContent).toContain('仍涨')
    expect(screen.getByTestId('cs-why-贵加上宏观转差才危险').textContent).toContain('防守侧')
    expect(screen.getByTestId('cs-why-按月操作，不追日线').textContent).toContain('换档')
  })
})
