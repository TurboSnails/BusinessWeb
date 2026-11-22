import { describe, expect, it } from 'vitest'
import {
  advanceShare,
  bothAtHighs,
  buildAdvDecMetrics,
  cumulativeNet,
  ema,
  isStale,
  mcclellanOscillator,
  narrowingDivergence,
  parseAdvDec,
  rana,
  rollingMean,
  weekdaySessionsOnOrBefore,
  MCCLELLAN_WARMUP_DAYS,
} from './advDec'
import type { Breadth, Point } from './model'
import { percentileOf } from './explain'

const d = (n: number, from = '2025-01-02') => {
  const start = new Date(`${from}T12:00:00Z`)
  const out: string[] = []
  let i = 0
  while (out.length < n) {
    const cur = new Date(start)
    cur.setUTCDate(start.getUTCDate() + i)
    i++
    const day = cur.getUTCDay()
    if (day === 0 || day === 6) continue
    out.push(cur.toISOString().slice(0, 10))
  }
  return out
}

describe('rana / advanceShare', () => {
  it('computes RANA and advance share; rejects empty market', () => {
    expect(rana(300, 200)).toBeCloseTo(200, 10)
    expect(advanceShare(300, 200)).toBeCloseTo(0.6, 10)
    expect(rana(0, 0)).toBeUndefined()
    expect(advanceShare(0, 0)).toBeUndefined()
  })
})

describe('ema', () => {
  it('seeds with the first value and uses k = 2/(n+1)', () => {
    const values = [10, 20, 30]
    const out = ema(values, 2)
    const k = 2 / 3
    expect(out[0]).toBe(10)
    expect(out[1]).toBeCloseTo(20 * k + 10 * (1 - k), 10)
    expect(out[2]).toBeCloseTo(30 * k + out[1]! * (1 - k), 10)
    expect(ema([], 19)).toEqual([])
  })
})

describe('mcclellanOscillator', () => {
  it('marks the first 39 sessions as warmup and then returns EMA19 − EMA39', () => {
    const vals = Array.from({ length: 50 }, (_, i) => i * 10 - 100)
    const osc = mcclellanOscillator(vals)
    expect(osc).toHaveLength(50)
    expect(osc.slice(0, MCCLELLAN_WARMUP_DAYS).every(v => v === null)).toBe(true)
    const fast = ema(vals, 19)
    const slow = ema(vals, 39)
    expect(osc[39]).toBeCloseTo(fast[39]! - slow[39]!, 10)
    expect(osc[49]).toBeCloseTo(fast[49]! - slow[49]!, 10)
  })
})

describe('rollingMean / cumulativeNet / percentile', () => {
  it('builds 10-day means, cumulative net from 0 path, and percentile rank', () => {
    const dates = d(12)
    const rows = dates.map((date, i): [string, number, number, number, number] => [date, 60 + i, 40, 0, 100])
    const means = rollingMean(rows.map(r => advanceShare(r[1], r[2])!), 10)
    expect(means[8]).toBeUndefined()
    expect(means[9]).toBeCloseTo(rows.slice(0, 10).reduce((s, r) => s + advanceShare(r[1], r[2])!, 0) / 10, 10)
    const cum = cumulativeNet(rows)
    expect(cum[0]).toEqual([dates[0], 20])
    expect(cum[1]![1]).toBe(20 + 21)
    expect(percentileOf([1, 2, 3, 4], 4)).toBe(88)
  })
})

describe('divergence', () => {
  it('detects joint highs and narrowing (index 20d high without AD high)', () => {
    const dates = d(25)
    const adUp: Point[] = dates.map((date, i) => [date, i])
    const ixUp: Point[] = dates.map((date, i) => [date, 100 + i])
    expect(bothAtHighs(adUp, ixUp)).toBe(true)

    const adFlat: Point[] = dates.map((date, i) => [date, i < 10 ? i : 10 - (i - 10) * 0.5])
    const ixNewHigh: Point[] = dates.map((date, i) => [date, 100 + i])
    expect(narrowingDivergence(adFlat, ixNewHigh)).toBe(true)
    expect(bothAtHighs(adFlat, ixNewHigh)).toBe(false)
  })
})

describe('isStale / weekdaySessions', () => {
  it('flags data older than the prior session vs asOf', () => {
    // Friday 2026-11-20 asOf; latest = Fri, prior = Thu 11-19. Data on Wed 11-18 is stale.
    expect(isStale('2026-11-20', '2026-11-20')).toBe(false)
    expect(isStale('2026-11-19', '2026-11-20')).toBe(false)
    expect(isStale('2026-11-18', '2026-11-20')).toBe(true)
    const cal = ['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']
    expect(isStale('2026-11-18', '2026-11-20', cal)).toBe(true)
    expect(isStale('2026-11-19', '2026-11-20', cal)).toBe(false)
    expect(weekdaySessionsOnOrBefore('2026-11-22', 3)).toEqual(['2026-11-20', '2026-11-19', '2026-11-18'])
  })
})

describe('buildAdvDecMetrics', () => {
  it('computes full history path with McClellan percentile and readings', () => {
    const dates = d(80)
    const rows = dates.map((date, i) => {
      // Later sessions lean more advances → both AD and index trend up.
      const adv = 200 + i
      const dec = 300 - Math.min(i, 250)
      return [date, adv, Math.max(dec, 1), 5, adv + Math.max(dec, 1) + 5] as [string, number, number, number, number]
    })
    const index: Point[] = dates.map((date, i) => [date, 1000 + i * 2])
    const breadth: Breadth = {
      date: dates.at(-1)!, covered: 500, total: 503, above200: 50,
      source: 'test', scope: '标普 500', advDec: rows,
    }
    const m = buildAdvDecMetrics(breadth, index, dates.at(-1)!)
    expect(m?.historyReady).toBe(true)
    expect(m?.today.advancers).toBe(rows.at(-1)![1])
    expect(m?.today.net).toBe(rows.at(-1)![1] - rows.at(-1)![2])
    expect(m?.avg10Share).toBeTypeOf('number')
    expect(m?.mcclellanWarmup).toBe(false)
    expect(m?.mcclellan).toBeTypeOf('number')
    expect(m?.cumulative).toHaveLength(80)
    expect(m?.readings.some(r => r.includes('参与度广') || r.includes('参与度在变窄') || r.includes('热度') || r.includes('情绪'))).toBe(true)
  })

  it('falls back to highsLows when advDec is missing', () => {
    const breadth: Breadth = {
      date: '2026-11-20', covered: 500, total: 503, above200: 48,
      source: 'test', scope: '标普 500',
      highsLows: { date: '2026-11-20', covered: 500, newHighs: 0, newLows: 26, advancers: 122, decliners: 375, netHighsPct: -5.2 },
    }
    const m = buildAdvDecMetrics(breadth, undefined, '2026-11-20')
    expect(m?.historyReady).toBe(false)
    expect(m?.today.fallback).toBe(true)
    expect(m?.today.advancers).toBe(122)
    expect(m?.today.decliners).toBe(375)
    expect(m?.today.unchanged).toBeUndefined()
    expect(m?.cumulative).toEqual([])
    expect(m?.readings).toEqual([])
  })

  it('returns undefined when neither advDec nor highsLows exists', () => {
    expect(buildAdvDecMetrics({
      date: '2026-11-20', covered: 500, total: 503, above200: 48, source: '', scope: '',
    }, undefined, '2026-11-20')).toBeUndefined()
  })

  it('parseAdvDec sorts and drops malformed rows', () => {
    expect(parseAdvDec([
      ['2026-11-20', 1, 2, 0, 3],
      ['2026-11-18', 3, 1, 0, 4],
      ['bad'] as unknown as [string, number, number, number, number],
    ]).map(r => r[0])).toEqual(['2026-11-18', '2026-11-20'])
  })
})
