import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import RatingReview, { validReview, type RatingReviewData, type ReviewCell } from './RatingReview'

const BUCKETS = ['优先关注', '条件关注', '观察', '回避']
const ok = (meanExcess: number, status: ReviewCell['status'] = 'early'): ReviewCell => ({ n: 300, nExcess: 300, periods: 3, securities: 100, status, mean: 0.01, median: 0.01, meanExcess, medianExcess: meanExcess, hitRate: 0.55 })
const thin: ReviewCell = { n: 15, nExcess: 15, periods: 3, securities: 5, status: 'insufficient' }
const pending: ReviewCell = { n: 0, nExcess: 0, periods: 0, securities: 0, status: 'pending' }
const scope = (cells: ReviewCell[]) => ({ cells: Object.fromEntries(BUCKETS.map((b, i) => [b, cells[i]])), spreads: [{ id: '条件关注−观察', status: 'early' as const, nHigh: 300, nLow: 300, meanExcess: 0.009 }] })
const data: RatingReviewData = {
  schemaVersion: 1, asOf: '2026-11-13', firstSnapshot: '2026-10-23', snapshots: 4, minSample: 30, minPeriods: 8,
  buckets: BUCKETS, benchmarks: { cn: '沪深300', hk: '恒生指数', us: '标普500' }, coverage: { us: { 优先关注: 5 } },
  method: ['统计口径说明'], caveats: ['评级是研究观察状态，不是买卖信号'],
  horizons: [
    { weeks: 1, reached: true, pairs: 3, observations: 900, markets: { all: scope([thin, ok(0.0121), ok(0.0032), ok(-0.002)]), us: scope([thin, ok(0.02), ok(0.01), thin]) } },
    { weeks: 4, reached: false, pairs: 0, observations: 0, markets: { all: scope([pending, pending, pending, pending]), us: scope([pending, pending, pending, pending]) } },
  ],
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe('评级复盘', () => {
  it('醒目提示样本期短；样本不足与待积累不给数值；可切换市场', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => data })))
    render(<RatingReview />)
    expect(await screen.findByText('+1.21%')).toBeTruthy()
    expect(screen.getByRole('note').textContent).toMatch(/样本期很短，不是业绩.*2026-10-23/)
    expect(screen.getAllByText('样本不足').length).toBeGreaterThan(0)
    expect(screen.getAllByText('待积累').length).toBeGreaterThanOrEqual(4)
    expect(screen.getByText('-0.20%')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '美股' }))
    expect(screen.getByText('+2.00%')).toBeTruthy()
    expect(screen.queryByText('+1.21%')).toBeNull()
  })
  it('文件缺失或结构不对时只提示无法加载', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => null })))
    render(<RatingReview />)
    expect(await screen.findByText('评级复盘暂时无法加载。')).toBeTruthy()
    expect(validReview([])).toBe(false)
  })
})
