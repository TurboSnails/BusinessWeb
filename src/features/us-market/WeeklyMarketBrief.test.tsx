import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import WeeklyMarketBrief, { alignedMove, buildBrief, weekWindow, type BriefSignal, type BriefSlice } from './WeeklyMarketBrief'
import type { Point } from './model'

const DATES = ['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']
const series = (values: number[], dates = DATES): Point[] => values.map((v, i) => [dates[dates.length - values.length + i], v])
const slice = (id: string, name: string, values: number[], dates?: string[]): BriefSlice => ({ id, name, source: `https://example.com/${id}`, scope: '指数', history: series(values, dates) })
const daily = (id: string, name: string, unit: string, values: number[], dates?: string[]): BriefSignal['item'] => ({
  id, name, reading: { name, unit, source: `https://example.com/${id}`, scope: '测试口径', frequency: '日频', history: series(values, dates) },
})

const spx = slice('spx', '标普 500', [99, 100, 101, 102, 103, 104, 95])
const peers = [
  spx,
  slice('ndx', '纳斯达克 100', [0, 200, 200, 200, 200, 200, 180]),
  slice('xlu', '公用事业', [0, 50, 50, 50, 50, 50, 51]),
  slice('xlp', '必需消费', [0, 80, 80, 80, 80, 80, 79]),
  slice('late', '缺最新日', [10, 10, 10, 10, 10, 10], DATES.slice(0, 6)),
]
const signals: BriefSignal[] = [
  { item: daily('vix', 'VIX', '点', [18, 18, 19, 20, 22, 25, 26]), label: 'VIX 波动率', polarity: -1, min: 1 },
  // Breadth improving while the index fell: opposing evidence.
  { item: daily('breadth', '宽度', '%', [0, 50, 51, 52, 53, 54, 55]), label: '高于 200 日线', polarity: 1, min: 1 },
  // Credit trails one session: shown, flagged as lagged.
  { item: daily('hy', '高收益债利差', 'bp', [320, 323, 334, 343, 347, 350], DATES.slice(0, 6)), label: '高收益债利差', polarity: -1, min: 5 },
  { item: { id: 'none', name: '缺失' }, label: '缺失指标', polarity: 1, min: 1 },
]

describe('weekly window', () => {
  it('uses the last six closes and rejects weekly-only data', () => {
    expect(weekWindow(spx.history)).toEqual({ start: '2026-11-12', end: '2026-11-19', dates: DATES.slice(1) })
    const weekly: Point[] = [['2026-09-01', 1], ['2026-09-08', 1], ['2026-09-15', 1], ['2026-09-22', 1], ['2026-09-29', 1], ['2026-10-06', 1]]
    expect(weekWindow(weekly)).toBeUndefined()
    expect(weekWindow(spx.history.slice(-3))).toBeUndefined()
  })
  it('only compares series on the exact same dates', () => {
    const window = weekWindow(spx.history)!
    expect(alignedMove(spx.history, window)?.change).toBeCloseTo(-5)
    expect(alignedMove(peers[4].history, window)).toBeUndefined()
  })
})

describe('buildBrief', () => {
  const brief = buildBrief({ benchmark: spx, peers, signals, asOf: '2026-11-20', market: 'us' })

  it('reports actual aligned changes with explicit dates', () => {
    expect(brief.change).toBeCloseTo(-5)
    expect(brief.direction).toBe(-1)
    expect(brief.observations.length).toBeGreaterThanOrEqual(2)
    expect(brief.observations.length).toBeLessThanOrEqual(3)
    expect(brief.observations[0]).toContain('11-12 → 11-19')
    expect(brief.observations[0]).toContain('-5%')
    expect(brief.observations[0]).toContain('3 个可比指数中 1 个上涨')
    expect(brief.observations[1]).toContain('公用事业 +2%')
    expect(brief.observations[1]).toContain('纳斯达克 100 -10%')
  })

  it('collects objective opposing evidence with sources', () => {
    const labels = brief.counter.map(c => c.label)
    expect(labels).toContain('高于 200 日线')
    expect(labels).toContain('公用事业')
    expect(labels).not.toContain('VIX 波动率')
    expect(labels).not.toContain('必需消费') // −1.25% is the same direction as the index
    const breadth = brief.counter.find(c => c.label === '高于 200 日线')!
    expect(breadth.from).toEqual(['2026-11-12', 50])
    expect(breadth.to).toEqual(['2026-11-19', 55])
    expect(breadth.source).toBe('https://example.com/breadth')
  })

  it('marks partial data: unaligned peers, lagged and missing indicators', () => {
    expect(brief.state).toBe('partial')
    expect(brief.unaligned).toEqual(['缺最新日'])
    expect(brief.skipped).toEqual([{ label: '缺失指标', why: '暂无数据' }])
    const hy = brief.signals.find(s => s.signal.label === '高收益债利差')!
    expect(hy.lagged).toBe(true)
    expect(hy.from[0]).toBe('2026-11-11')
    expect(hy.to[0]).toBe('2026-11-18')
  })

  it('flags stale snapshots and missing benchmarks', () => {
    expect(buildBrief({ benchmark: spx, peers: [], signals: [], asOf: '2026-12-10', market: 'us' }).state).toBe('stale')
    const missing = buildBrief({ peers, signals, asOf: '2026-11-20', market: 'cn' })
    expect(missing.state).toBe('missing')
    expect(missing.reason).toContain('沪深300')
    expect(buildBrief({ benchmark: slice('spx', '标普 500', [1, 2]), peers: [], signals: [], asOf: '2026-11-20', market: 'us' }).state).toBe('missing')
  })

  it('rejects future benchmark dates and malformed or non-positive closes', () => {
    const future = buildBrief({ benchmark: spx, peers: [], signals: [], asOf: '2026-11-18', market: 'us' })
    expect(future.state).toBe('missing')
    expect(future.reason).toContain('晚于查询日')
    for (const bad of [0, -1, NaN, Infinity]) {
      const broken = slice('spx', '标普 500', [99, 100, 101, bad, 103, 104, 95])
      expect(buildBrief({ benchmark: broken, peers: [], signals: [], asOf: '2026-11-20', market: 'us' }).state).toBe('missing')
    }
    const badDate: BriefSlice = { ...spx, history: spx.history.map(([d, v], i) => [i === 3 ? '11/13/2026' : d, v] as Point) }
    expect(weekWindow(badDate.history)).toBeUndefined()
    const window = weekWindow(spx.history)!
    expect(alignedMove(series([0, 0, 0, 0, 0, 0, 0]), window)).toBeUndefined()
  })

  it('never uses a lagged, mismatched-window move as counter-evidence', () => {
    // Credit spread narrowed (would oppose a fall) but its window ends a day early.
    const narrowing: BriefSignal = { item: daily('hy', '高收益债利差', 'bp', [350, 347, 343, 334, 323, 320], DATES.slice(0, 6)), label: '高收益债利差', polarity: -1, min: 5 }
    const result = buildBrief({ benchmark: spx, peers: [spx], signals: [narrowing], asOf: '2026-11-20', market: 'us' })
    expect(result.signals[0].lagged).toBe(true)
    expect(result.signals[0].lean).toBe(1)
    expect(result.counter).toEqual([])
    expect(result.observations.join('')).not.toContain('高收益债利差')
    render(<WeeklyMarketBrief market="us" asOf="2026-11-20" benchmark={spx} peers={[spx]} signals={[narrowing]} />)
    expect(screen.getByText(/日期与行情窗口不同，仅作背景/)).toBeTruthy()
  })

  it('does not assert counter-evidence for a sideways week', () => {
    const flat = slice('spx', '标普 500', [100, 100, 100, 100, 100, 100.2])
    const result = buildBrief({ benchmark: flat, peers: [flat, peers[1]], signals, asOf: '2026-11-20', market: 'us' })
    expect(result.direction).toBe(0)
    expect(result.counter).toEqual([])
  })

  it('uses percent change for pct-mode signals and keeps level units', () => {
    const margin: BriefSignal = { item: daily('m', '两融余额', '亿元', [0, 20000, 20000, 20000, 20000, 20000, 20400]), label: '两融余额', polarity: 1, min: 0.5, mode: 'pct' }
    const result = buildBrief({ benchmark: spx, peers: [spx], signals: [margin], asOf: '2026-11-20', market: 'cn' })
    expect(result.signals[0].change).toBeCloseTo(2)
    expect(result.counter[0].text).toContain('+2%')
    expect(result.counter[0].unit).toBe('亿元')
  })
})

describe('WeeklyMarketBrief', () => {
  it('renders observations, state and drilldown to sources', () => {
    render(<WeeklyMarketBrief market="us" asOf="2026-11-20" benchmark={spx} peers={peers} signals={signals} />)
    const region = screen.getByRole('region', { name: '本周美股变化' })
    expect(within(region).getByText('部分数据')).toBeTruthy()
    expect(within(region).getAllByRole('listitem').length).toBeGreaterThan(2)
    expect(region.querySelector('time[datetime="2026-11-12"]')).toBeTruthy()
    const link = within(region).getAllByRole('link', { name: /查看数据来源/ })[0]
    expect(link.getAttribute('href')).toMatch(/^https:\/\/example.com\//)
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(within(region).getByText(/未纳入本周比较的数据/)).toBeTruthy()
  })

  it('shows a loading then missing state in Chinese', () => {
    const { rerender } = render(<WeeklyMarketBrief market="cn" asOf="2026-11-20" peers={[]} signals={[]} loading />)
    expect(screen.getByText('正在核对')).toBeTruthy()
    rerender(<WeeklyMarketBrief market="cn" asOf="2026-11-20" peers={[]} signals={[]} />)
    expect(screen.getByRole('region', { name: '本周 A 股变化' })).toBeTruthy()
    expect(screen.getByText('暂无数据')).toBeTruthy()
    expect(screen.getByText(/沪深300 行情快照暂不可用/)).toBeTruthy()
  })
})
