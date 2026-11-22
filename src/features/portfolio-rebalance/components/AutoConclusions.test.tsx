import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AutoConclusions } from './AutoConclusions'
import { createConclusionFixture } from '../fixtures'

afterEach(() => cleanup())

describe('AutoConclusions', () => {
  it('典型组合渲染规则 1、2、3 和固定边界句', () => {
    const fixture = createConclusionFixture()
    render(<AutoConclusions {...fixture} />)
    expect(screen.getByRole('heading', { name: '这次回测说明了什么' })).toBeTruthy()
    expect(screen.getByText(/^按当前规则，期末金额/)).toBeTruthy()
    expect(screen.getByText(/^历史敏感性：/)).toBeTruthy()
    expect(screen.getByText(/^稳定组成员的历史取舍：/)).toBeTruthy()
    expect(screen.getByText(/^以上是所选历史区间的事后回测描述/)).toBeTruthy()
  })

  it('不足一年、1–3 年、不动与零调仓兜底都实际渲染', () => {
    const short = createConclusionFixture()
    for (const result of [short.comparison.custom.active, short.comparison.custom.hold]) {
      result.start = '2026-01-01'
      result.end = '2026-06-01'
    }
    const { unmount } = render(<AutoConclusions {...short} />)
    expect(screen.getByText(/^本区间仅 151 天/)).toBeTruthy()
    unmount()

    const medium = createConclusionFixture()
    medium.comparison.custom.active.end = '2023-06-01'
    const mediumView = render(<AutoConclusions {...medium} />)
    expect(screen.getByText('区间不足三年，以下仅描述本次结果，不用于归纳一般规律。')).toBeTruthy()
    mediumView.unmount()

    const hold = createConclusionFixture()
    hold.input.rule = { kind: 'buyHold' }
    const holdView = render(<AutoConclusions {...hold} />)
    expect(screen.getByText('当前未启用再平衡，两种结果相同，无法据此判断再平衡效果。')).toBeTruthy()
    holdView.unmount()

    const noTrades = createConclusionFixture()
    noTrades.comparison.custom.active.tradeCount = 0
    render(<AutoConclusions {...noTrades} />)
    expect(screen.getByText(/^本区间没有发生调仓/)).toBeTruthy()
  })

  it('材料性、非有限数、数据质量与两只股票兜底实际渲染', () => {
    const material = createConclusionFixture()
    material.comparison.custom.active.cagr = 0.104
    const materialView = render(<AutoConclusions {...material} />)
    expect(screen.getByText(/年化差不足 0.5 个百分点/)).toBeTruthy()
    materialView.unmount()

    const invalid = createConclusionFixture()
    invalid.comparison.custom.active.cagr = Number.NaN
    const invalidView = render(<AutoConclusions {...invalid} />)
    expect(screen.getByText('该项数据不足，暂不自动概括；请查看已计算的原始指标。')).toBeTruthy()
    expect(invalidView.container.textContent).not.toContain('NaN')
    invalidView.unmount()

    const quality = createConclusionFixture()
    quality.index.items[0].status = 'stale'
    const qualityView = render(<AutoConclusions {...quality} />)
    expect(screen.getByText(/^部分输入数据存在质量提示/)).toBeTruthy()
    qualityView.unmount()

    const two = createConclusionFixture()
    two.input.symbols = ['AVGO', 'META']
    two.input.weights = [0.5, 0.5]
    two.comparison.leaveOneOut = two.comparison.leaveOneOut.slice(0, 2)
    render(<AutoConclusions {...two} />)
    expect(screen.getByText(/^当前仅两只股票/)).toBeTruthy()
  })

  it('规则 2 的未下降、微小差异与集中权重提示实际渲染', () => {
    const noDecline = createConclusionFixture()
    noDecline.comparison.leaveOneOut[0].active.cagr = 0.13
    const noDeclineView = render(<AutoConclusions {...noDecline} />)
    expect(screen.getByText(/^本区间剔除任何一只后/)).toBeTruthy()
    noDeclineView.unmount()

    const small = createConclusionFixture()
    small.comparison.leaveOneOut[0].active.cagr = 0.127
    small.comparison.leaveOneOut[1].active.cagr = 0.132
    small.comparison.leaveOneOut[2].active.cagr = 0.128
    const smallView = render(<AutoConclusions {...small} />)
    expect(screen.getByText(/差异都不到 0.5 个百分点/)).toBeTruthy()
    smallView.unmount()

    const concentrated = createConclusionFixture()
    concentrated.input.weights = [0.6, 0.3, 0.1]
    render(<AutoConclusions {...concentrated} />)
    expect(screen.getByText(/组合权重较集中/)).toBeTruthy()
  })

  it('规则 3 的无稳定、全稳定、多稳定和未达双门槛兜底实际渲染', () => {
    const none = createConclusionFixture()
    none.index.items[2].group = 'growth'
    const noneView = render(<AutoConclusions {...none} />)
    expect(screen.getByText(/^当前没有页面分类为『稳定』的成员/)).toBeTruthy()
    noneView.unmount()

    const all = createConclusionFixture()
    for (const item of all.index.items) item.group = 'stable'
    const allView = render(<AutoConclusions {...all} />)
    expect(screen.getByText(/^全部成员都属于页面的『稳定』分组/)).toBeTruthy()
    allView.unmount()

    const multiple = createConclusionFixture()
    multiple.index.items[1].group = 'stable'
    const multipleView = render(<AutoConclusions {...multiple} />)
    expect(screen.getByText(/^组合有多只稳定组成员/)).toBeTruthy()
    multipleView.unmount()

    const noTradeoff = createConclusionFixture()
    noTradeoff.comparison.leaveOneOut[2].active.maxDrawdown.value = -0.29
    render(<AutoConclusions {...noTradeoff} />)
    expect(screen.getByText(/^稳定组成员的历史剔除结果见下表/)).toBeTruthy()
  })

  it('开启大跌切换时只显示合计效果，不显示单只历史结论', () => {
    const fixture = createConclusionFixture()
    fixture.input.switch = { stable: 'CB', entry: 0.2, gap: 0.05, step: 0.25, recover: 0.05 }
    render(<AutoConclusions {...fixture} />)
    expect(screen.getByText(/^按当前『再平衡＋大跌切换』/)).toBeTruthy()
    expect(screen.queryByText(/^历史敏感性：/)).toBeNull()
    expect(screen.queryByText(/^稳定组成员/)).toBeNull()
  })
})
