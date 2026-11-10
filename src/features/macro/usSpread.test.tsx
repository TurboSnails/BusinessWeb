import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { UsSpreadView } from './UsSpreadView'
import { annualize, bucketOf, channelCheck, correlation, forwardPairs, percentileRank, quantile, spreadBuckets, type UsSpreadRow, type UsSpreadSnapshot } from './usSpread'

const day = (i: number): string => new Date(Date.UTC(1990, 0, 1 + i * 7)).toISOString().slice(0, 10)
/** 构造周度行：息差、价格、PE、10Y */
const rowsOf = (n: number, spread: (i: number) => number, price: (i: number) => number = i => 100 * 1.001 ** i): UsSpreadRow[] =>
  Array.from({ length: n }, (_, i) => [day(i), spread(i), price(i), 20, 3])

describe('美股股债息差计算', () => {
  it('分位：不高于当前值的占比', () => {
    expect(percentileRank([1, 2, 3, 4], 2)).toBe(50)
    expect(percentileRank([1, 2, 3, 4], 0)).toBe(0)
    expect(percentileRank([1, 2, 3, 4], 9)).toBe(100)
  })

  it('分位数线性插值', () => {
    expect(quantile([0, 10], 0.5)).toBe(5)
    expect(quantile([1, 2, 3, 4, 5], 0.25)).toBe(2)
  })

  it('年化：52 周不变，104 周翻倍约等于年化 41.4%', () => {
    expect(annualize(10, 52)).toBeCloseTo(10)
    expect(annualize(100, 104)).toBeCloseTo(41.42, 1)
  })

  it('相关系数：完全正相关为 1，反相关为 -1，样本太少给 NaN', () => {
    expect(correlation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1)
    expect(correlation([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1)
    expect(correlation([1, 2], [1, 2])).toBeNaN()
  })

  it('五等分：每组周数相近，组内统计用之后的价格', () => {
    const rows = rowsOf(500, i => i % 10)
    const b = spreadBuckets(rows, [52])
    expect(b).toHaveLength(5)
    expect(b.reduce((s, x) => s + x.weeks, 0)).toBe(500)
    expect(b[0].lo).toBe(0)
    expect(b[4].hi).toBe(9)
    // 价格每周涨 0.1%，任何一组 52 周后年化都约为 5.3%
    b.forEach(x => expect(x.stats[0].mean).toBeCloseTo((1.001 ** 52 - 1) * 100, 3))
    expect(bucketOf(b, -5)).toBe(0)
    expect(bucketOf(b, 99)).toBe(4)
  })

  it('散点只取到期日在样本内的周', () => {
    const rows = rowsOf(200, i => i)
    expect(forwardPairs(rows, 156).points).toHaveLength(44)
  })

  it('通道对照沿用 A 股的触轨规则', () => {
    const spreads = [...Array(200).fill(1).map((v, i) => v + (i % 2) * 0.01), 5, 5, 1, 1, ...Array(60).fill(1)]
    const check = channelCheck(rowsOf(spreads.length, i => spreads[i]), 156, 2, 4, [13])
    expect(check.ups).toEqual([200])
    expect(check.rows[0].upN).toBe(1)
  })
})

describe('UsSpreadView', () => {
  const snap: UsSpreadSnapshot = {
    generatedAt: '2026-11-10', source: '测试', window: 156, k: 2,
    latestYield: { date: '2099-01-01', value: 4.1 },
    rows: rowsOf(600, i => 3 + Math.sin(i / 40)),
  }

  it('显示当前息差、分位与对照表，并能叠加通道', () => {
    render(<UsSpreadView data={snap} />)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain(snap.rows.at(-1)![1].toFixed(2))
    expect(screen.getByText(/不拼进序列/)).toBeTruthy()
    expect(screen.getByText(/把 A 股的通道规则原样套到美股/)).toBeTruthy()
    const toggle = screen.getByRole('button', { name: '叠加 A 股式通道' })
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
  })
})
