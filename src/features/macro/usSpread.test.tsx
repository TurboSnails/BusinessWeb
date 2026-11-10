import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { UsSpreadView } from './UsSpreadView'
import { annualize, bucketOf, channelCheck, correlation, forwardPairs, percentileRank, periodAverages, quantile, realSpreads, reversionScenarios, spreadBuckets, type UsSpreadRow, type UsSpreadSnapshot } from './usSpread'

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

  it('实际口径：盈利收益率减同日 TIPS，没有 TIPS 的周留空', () => {
    const rows = rowsOf(3, () => 2)
    const snap: UsSpreadSnapshot = { generatedAt: '', source: '', window: 156, k: 2, rows, real: [[rows[1][0], 1.5], [rows[2][0], 2]] }
    const real = realSpreads(snap)
    expect(real[0]).toBeUndefined()
    expect(real[1]).toBeCloseTo(100 / 20 - 1.5)
    expect(real[2]).toBeCloseTo(3)
  })

  it('时期均值按年份前缀含首尾截取', () => {
    // 1990-01-01 起每 7 天一个点，1990 年内共 53 个点（下标 0–52）
    const rows = rowsOf(120, i => (rowsOf(120, () => 0)[i][0] < '1991' ? 1 : 3))
    const [p] = periodAverages(rows, rows.map(() => undefined), [{ label: '1990', from: '1990', to: '1990' }])
    expect(p.spread).toBeCloseTo(1)
    expect(p.real).toBeUndefined()
    expect(p.pe).toBe(20)
  })

  it('回到中位数：利率不变时的目标 PE、所需利率与横盘年数', () => {
    // 息差 2 和 4 混合；最后一周 PE 20（盈利收益率 5%）、10Y 3
    const rows = rowsOf(100, i => (i < 50 ? 2 : 4)).map((r, i, all) => (i === all.length - 1 ? [r[0], 2, r[2], 20, 3] as UsSpreadRow : r))
    const snap: UsSpreadSnapshot = { generatedAt: '', source: '', window: 156, k: 2, rows }
    const [nominal] = reversionScenarios(snap, rows.map(() => undefined), 0.1)
    expect([2, 3, 4]).toContain(Math.round(nominal.median))
    expect(nominal.targetPe).toBeCloseTo(100 / (nominal.median + 3))
    expect(nominal.priceChange).toBeCloseTo((nominal.targetPe / 20 - 1) * 100)
    expect(nominal.rateNeeded).toBeCloseTo(5 - nominal.median)
    expect(nominal.years).toBeCloseTo(Math.log(20 / nominal.targetPe) / Math.log(1.1))
    const pe = reversionScenarios(snap, rows.map(() => undefined), 0.1).at(-1)!
    expect(pe.unit).toBe('x')
    expect(pe.years).toBe(0)                 // PE 中位数就是 20，已在中位数上
  })

  it('回到中位数：扣除通胀的口径另给零利率之前与 2022 年以来两个锚点', () => {
    const day0 = (y: number, w: number): string => new Date(Date.UTC(y, 0, 1 + w * 7)).toISOString().slice(0, 10)
    const rows: UsSpreadRow[] = [2004, 2015, 2023].flatMap(y => Array.from({ length: 30 }, (_, w) => [day0(y, w), 1, 100, 20, 3] as UsSpreadRow))
    const tipsOf = (d: string): number => (d < '2009' ? 1 : d < '2022' ? 0 : 2)
    const snap: UsSpreadSnapshot = { generatedAt: '', source: '', window: 156, k: 2, rows, real: rows.map(r => [r[0], tipsOf(r[0])]) }
    const labels = reversionScenarios(snap, realSpreads(snap), 0.07).map(r => r.label)
    expect(labels.filter(l => l.startsWith('扣除通胀'))).toHaveLength(3)
    const pre = reversionScenarios(snap, realSpreads(snap), 0.07).find(r => r.label.includes('2003–2008'))!
    expect(pre.median).toBeCloseTo(5 - 1)    // 盈利收益率 5% − TIPS 1%
    const cur = reversionScenarios(snap, realSpreads(snap), 0.07).find(r => r.label.includes('2022'))!
    expect(cur.median).toBeCloseTo(5 - 2)
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
    real: rowsOf(600, () => 0).slice(300).map(r => [r[0], 2]),
  }

  it('显示当前息差、分位与对照表，并能叠加通道', () => {
    render(<UsSpreadView data={snap} />)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain(snap.rows.at(-1)![1].toFixed(2))
    expect(screen.getByText(/不拼进序列/)).toBeTruthy()
    expect(screen.getByText(/把 A 股的通道规则原样套到美股/)).toBeTruthy()
    expect(screen.getByText(/换成实际口径/)).toBeTruthy()
    expect(screen.getByText(/如果回到历史中位数/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '10%' }))
    expect(screen.getByRole('button', { name: '10%' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '显示扣除通胀后的息差' }).getAttribute('aria-pressed')).toBe('true')
    const toggle = screen.getByRole('button', { name: '叠加 A 股式通道' })
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
  })
})
