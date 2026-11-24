import { describe, expect, it } from 'vitest'
import {
  estimateLabelWidth,
  formatPercentileSince,
  placeThresholdLabels,
  sliceByYears,
  sourceHost,
  yAxisTicks,
} from './IndicatorHistoryChart'

describe('IndicatorHistoryChart helpers', () => {
  it('sliceByYears 默认近 5 年', () => {
    const history: [string, number][] = Array.from({ length: 120 }, (_, i) => {
      const year = 2016 + Math.floor(i / 12)
      const month = String((i % 12) + 1).padStart(2, '0')
      return [`${year}-${month}-28`, i] as [string, number]
    })
    const sliced = sliceByYears(history, 5)
    expect(sliced.length).toBeLessThan(history.length)
    expect(sliced.at(-1)?.[0]).toBe(history.at(-1)?.[0])
  })

  it('规则线标签错开且避开最新点', () => {
    const placed = placeThresholdLabels(
      [
        { y: 100, label: 'A', kind: 'minus', width: 20 },
        { y: 105, label: 'B', kind: 'plus', width: 20 },
        { y: 200, label: 'C', kind: 'reference', width: 20 },
      ],
      100,
      10,
      220,
    )
    expect(Math.abs(placed[0].y - 100)).toBeGreaterThanOrEqual(6)
    expect(placed[1].y - placed[0].y).toBeGreaterThanOrEqual(14)
  })

  it('「当前第 80 百分位」标签宽估算足以完整显示，且可放入绘图区右侧', () => {
    const label = '当前第 80 百分位'
    const width = estimateLabelWidth(label)
    expect(width).toBeGreaterThanOrEqual(label.replace(/\s/g, '').length * 10)
    // 典型桌面 plotW ≈ 900，手机 ≈ 280；标签必须短于绘图宽
    expect(width).toBeLessThan(280)
  })

  it('纵轴至少 3 个刻度', () => {
    expect(yAxisTicks(20, 23, 4).length).toBeGreaterThanOrEqual(3)
    expect(yAxisTicks(5, 5, 4).length).toBeGreaterThanOrEqual(3)
    expect(yAxisTicks(18, 26, 4).length).toBeGreaterThanOrEqual(3)
  })

  it('百分位窗口文案与来源域名', () => {
    expect(formatPercentileSince('1900-01-01')).toBe('1900 年 1 月起')
    expect(sourceHost('https://www.multpl.com/s-p-500-pe-ratio')).toBe('multpl.com')
  })
})
