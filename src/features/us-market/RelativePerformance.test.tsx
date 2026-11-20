import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import RelativePerformance, { comparePair, dailySince, rebase, weekdaysBetween } from './RelativePerformance'
import type { Point } from './model'

const days = (n: number, from = '2026-10-01') => Array.from({ length: n }, (_, i) => {
  const d = new Date(`${from}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10)
})
const series = (dates: string[], f: (i: number) => number): Point[] => dates.map((d, i) => [d, f(i)])

describe('comparePair', () => {
  const dates = days(25)
  it('computes 5/20-session returns and the gap in percentage points on the same endpoints', () => {
    const a = series(dates, i => 100 + i), b = series(dates, () => 50)
    const r = comparePair(a, b)
    expect(r.end).toBe(dates[24])
    const [five, twenty] = r.horizons
    if (five.status !== 'ok' || twenty.status !== 'ok') throw new Error('expected ok')
    expect(five.asset.start).toEqual([dates[19], 119])
    expect(five.asset.ret).toBeCloseTo((124 / 119 - 1) * 100, 10)
    expect(five.benchmark.ret).toBe(0)
    expect(five.relative).toBeCloseTo(five.asset.ret, 10)
    expect(twenty.asset.start).toEqual([dates[4], 104])
    expect(twenty.benchmark.start[0]).toBe(dates[4])
  })

  it('ends at the latest common date when one side is newer and reports both last dates', () => {
    const a = series(dates, i => 100 + i), b = series(dates.slice(0, -2), () => 50)
    const r = comparePair(a, b)
    expect(r.end).toBe(dates[22])
    expect(r.assetLast).toBe(dates[24])
    expect(r.benchmarkLast).toBe(dates[22])
    const five = r.horizons[0]
    expect(five.status === 'ok' && five.asset.end).toEqual([dates[22], 122])
  })

  it('does not forward-fill: a missing start close yields a gap, interior gaps still count as sessions', () => {
    const a = series(dates, i => 100 + i)
    const b = series(dates, () => 50).filter(([d]) => d !== dates[19])
    const r = comparePair(a, b)
    expect(r.horizons[0]).toEqual({ status: 'gap', sessions: 5, date: dates[19] })
    const interior = comparePair(a, series(dates, () => 50).filter(([d]) => d !== dates[21]))
    const five = interior.horizons[0]
    expect(five.status === 'ok' && five.asset.start[0]).toBe(dates[19])
  })

  it('reports insufficient history and ignores invalid closes', () => {
    const short = days(10)
    const r = comparePair(series(short, i => i === 3 ? Number.NaN : 10 + i), series(short, () => 5))
    expect(r.horizons[0].status).toBe('ok')
    expect(r.horizons[1]).toEqual({ status: 'insufficient', sessions: 20, available: 9 })
    expect(comparePair([], series(short, () => 5)).horizons[0]).toEqual({ status: 'insufficient', sessions: 5, available: 0 })
  })
})

describe('RelativePerformance', () => {
  const dates = days(25)
  it('renders the US equal-weight vs cap-weight row with verifiable closes', () => {
    render(<RelativePerformance market="us" slices={[
      { id: 'spx', name: '标普 500', history: series(dates, () => 100), source: 'https://finance.yahoo.com/quote/%5EGSPC/history/' },
      { id: 'rsp', name: '标普 500 等权', history: series(dates, i => i >= 20 ? 120 : 100) },
      { id: 'ndx', name: '纳斯达克 100', history: series(dates, () => 1) },
    ]} />)
    const region = screen.getByRole('region', { name: /等权与市值加权/ })
    const row = within(region).getByRole('row', { name: /标普 500 等权 对 标普 500/ })
    expect(within(row).getAllByText('+20.00 个百分点')).toHaveLength(2)
    expect(within(row).getAllByText('+20.00% 对 0.00%')).toHaveLength(2)
    expect(within(row).getAllByText(dates[24]).length).toBeGreaterThan(0)
    expect(within(row).getAllByRole('link', { name: '标普 500' })[0].getAttribute('href')).toContain('GSPC')
    expect(within(region).getAllByRole('table')[0].textContent).not.toMatch(/纳斯达克/)
  })

  it('renders China style rows vs CSI 300 and handles missing, stale and short series', () => {
    render(<RelativePerformance market="cn" slices={[
      { id: '000300', name: '沪深300', history: series(dates, () => 100) },
      { id: '000852', name: '中证1000', history: series(dates.slice(0, -1), i => 100 - i) },
      { id: '000922', name: '中证红利', history: series(dates.slice(-8), () => 100) },
    ]} />)
    const small = screen.getByRole('row', { name: /中证1000 对 沪深300/ })
    expect(small.textContent).toContain(`按共同日期计算`)
    expect(within(small).getAllByText(dates[23]).length).toBeGreaterThan(0)
    const dividend = screen.getByRole('row', { name: /中证红利 对 沪深300/ })
    expect(dividend.textContent).toContain('历史不足（7 个交易日）')
    expect(screen.getByRole('row', { name: /成长 − 沪深300/ }).textContent).toContain('暂无数据（缺少 399370）')
  })
})

const weekly = (n: number, from = '2026-01-02') => Array.from({ length: n }, (_, i) => {
  const d = new Date(`${from}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + i * 7); return d.toISOString().slice(0, 10)
})
const weekdays = (n: number, from = '2026-10-01') => {
  const out: string[] = []
  for (let t = Date.parse(`${from}T00:00:00Z`); out.length < n; t += 86_400_000) if (![0, 6].includes(new Date(t).getUTCDay())) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}

describe('frequency and calendar rules', () => {
  it('finds the trailing daily run, keeps holiday gaps, and rejects weekly-only series', () => {
    const recent = weekdays(30, '2026-09-01')
    expect(dailySince([...weekly(10, '2026-06-05'), ...recent])).toBe(recent[0])
    const holiday = [...weekdays(5, '2026-09-21'), ...weekdays(5, '2026-10-06')]
    expect(dailySince(holiday)).toBe(holiday[0])
    expect(dailySince(weekly(40))).toBeUndefined()
    expect(comparePair(series(weekly(40), i => 100 + i), series(weekly(40), () => 50)).horizons[0]).toEqual({ status: 'weekly', sessions: 5 })
  })

  it('counts weekdays between two dates', () => {
    expect(weekdaysBetween('2026-11-19', '2026-11-20')).toBe(0)
    expect(weekdaysBetween('2026-11-13', '2026-11-18')).toBe(2)
  })

  it('rebases every series to 100 on the same start date without filling gaps', () => {
    const dates = weekdays(25)
    const a = series(dates, i => 200 + i * 2), b = series(dates, () => 50).filter(([d]) => d !== dates[22])
    const r = rebase([a, b], 5)
    if (r.status !== 'ok' || !r.values) throw new Error('expected ok')
    expect(r.calendar).toEqual(dates.slice(19))
    expect(r.values[0][0]).toBe(100)
    expect(r.values[1][0]).toBe(100)
    expect(r.values[0][5]).toBeCloseTo(248 / 238 * 100, 10)
    expect(r.values[1][3]).toBeUndefined()
  })
})

describe('RelativePerformance staleness, sorting and overlay', () => {
  const dates = weekdays(25)
  it('shows the old date when both ends are equally stale against the market and the local date', () => {
    const { unmount } = render(<RelativePerformance market="us" asOf="2026-11-20" slices={[
      { id: 'spx', name: '标普 500', history: series(dates.slice(0, -2), () => 100) },
      { id: 'rsp', name: '标普 500 等权', history: series(dates.slice(0, -2), () => 100) },
      { id: 'ndx', name: '纳斯达克 100', history: series(dates, () => 1) },
    ]} />)
    expect(screen.getByRole('row', { name: /标普 500 等权 对/ }).textContent).toContain(`两者均停在 ${dates[22]}，本市场最新交易日为 ${dates[24]}`)
    unmount()
    render(<RelativePerformance market="us" asOf="2026-11-20" slices={[
      { id: 'spx', name: '标普 500', history: series(dates, () => 100) },
      { id: 'rsp', name: '标普 500 等权', history: series(dates, () => 100) },
    ]} />)
    expect(screen.getByRole('row', { name: /标普 500 等权 对/ }).textContent).toMatch(new RegExp(`两者均停在 ${dates[24]}，当地日期 2026-11-20，其间有 \\d+ 个工作日无收盘值`))
  })

  it('sorts China rows by relative value desc then asc with missing values last', () => {
    render(<RelativePerformance market="cn" slices={[
      { id: '000300', name: '沪深300', history: series(dates, () => 100) },
      { id: '000852', name: '中证1000', history: series(dates, i => i >= 20 ? 110 : 100) },
      { id: '000922', name: '中证红利', history: series(dates, i => i >= 20 ? 95 : 100) },
    ]} />)
    const table = screen.getAllByRole('table')[0] as HTMLTableElement
    const order = () => [...table.tBodies[0].rows].map(r => r.cells[0].firstChild?.textContent?.slice(0, 4))
    const header = within(table).getByRole('columnheader', { name: /近 5 个交易日/ })
    const sorter = screen.getByRole('combobox', { name: /排序/ })
    expect(header.getAttribute('aria-sort')).toBe('none')
    fireEvent.change(sorter, { target: { value: '5-desc' } })
    expect(header.getAttribute('aria-sort')).toBe('descending')
    expect(order()).toEqual(['中证10', '中证红利', '成长 −'])
    fireEvent.change(sorter, { target: { value: '5-asc' } })
    expect(header.getAttribute('aria-sort')).toBe('ascending')
    expect(order()).toEqual(['中证红利', '中证10', '成长 −'])
    fireEvent.change(sorter, { target: { value: '' } })
    expect(order()).toEqual(['中证10', '中证红利', '成长 −'])
  })

  it('overlays chosen indexes rebased to 100, switches period, and reports start gaps honestly', () => {
    render(<RelativePerformance market="us" slices={[
      { id: 'spx', name: '标普 500', history: series(dates, () => 100) },
      { id: 'rsp', name: '标普 500 等权', history: series(dates, i => 100 + i) },
      { id: 'ndx', name: '纳斯达克 100', history: series(dates, () => 1).filter(([d]) => d !== dates[19]) },
      { id: 'wk', name: '周频指数', history: series(weekly(30), () => 1) },
    ]} />)
    const chart = screen.getByRole('img', { name: new RegExp(`${dates[4]} 起均设为 100`) })
    expect(chart.getAttribute('aria-label')).toContain(`至 ${dates[24]}：标普 500 100.00，标普 500 等权 ${(124 / 104 * 100).toFixed(2)}`)
    expect(screen.getByText(/1 个仅有周频数据的指数未列入/)).toBeTruthy()
    expect(screen.queryByRole('option', { name: '周频指数' })).toBeNull()
    fireEvent.keyDown(chart, { key: 'Home' })
    expect(screen.getByRole('figure').querySelector('figcaption time')?.textContent).toBe(dates[4])
    fireEvent.change(screen.getByRole('combobox', { name: /对比 2/ }), { target: { value: 'ndx' } })
    fireEvent.click(screen.getByRole('radio', { name: /近 5 个交易日/ }))
    expect(screen.getByText(new RegExp(`起点 ${dates[19]} 纳斯达克 100没有收盘值`))).toBeTruthy()
  })
})

it('keeps default selections when slices arrive after the first mount and labels ETF proxies', () => {
  const dates = weekdays(25)
  const { rerender } = render(<RelativePerformance market="us" slices={[]} />)
  expect(screen.queryByRole('img')).toBeNull()
  rerender(<RelativePerformance market="us" slices={[
    { id: 'spx', name: '标普 500', history: series(dates, () => 100), scope: '美股指数 · 价格指数' },
    { id: 'rsp', name: '标普 500 等权', history: series(dates, () => 100), scope: '美股指数 · 价格指数' },
    { id: 'sector-xlk', name: '信息技术', history: series(dates, i => 100 + i), scope: '标普 500 行业 ETF 代理 · 价格' },
  ]} />)
  expect((screen.getByRole('combobox', { name: /基准/ }) as HTMLSelectElement).value).toBe('spx')
  expect((screen.getByRole('combobox', { name: /对比 1/ }) as HTMLSelectElement).value).toBe('rsp')
  expect(screen.getByRole('img').getAttribute('aria-label')).toContain('标普 500 100.00，标普 500 等权 100.00')
  fireEvent.keyDown(screen.getByRole('img'), { key: 'End' })
  fireEvent.change(screen.getByRole('combobox', { name: /对比 2/ }), { target: { value: 'sector-xlk' } })
  expect(screen.getAllByRole('option', { name: '信息技术（ETF）' }).length).toBe(4)
  expect(screen.getByText(/信息技术为 ETF 代理/)).toBeTruthy()
  fireEvent.click(screen.getByRole('radio', { name: /近 5 个交易日/ }))
  expect(screen.getByRole('figure').querySelector('figcaption time')?.textContent).toBe(dates[24])
})
