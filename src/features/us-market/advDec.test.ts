import { describe, expect, it } from 'vitest'
import {
  AVG10_SAMPLE_MIN,
  BOTH_AT_HIGHS_READING,
  NARROWING_READING,
  SAMPLE_INSUFFICIENT,
  advanceShare,
  bothAtHighs,
  buildAdvDecMetrics,
  commonSeries,
  continuousRollingMeans,
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
import { nyseSessionsOnOrBefore } from './tradingCalendar'
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

describe('divergence on common sessions', () => {
  it('detects joint highs and narrowing on aligned series', () => {
    const dates = d(25)
    const adUp: Point[] = dates.map((date, i) => [date, i])
    const ixUp: Point[] = dates.map((date, i) => [date, 100 + i])
    expect(bothAtHighs(adUp, ixUp)).toBe(true)

    const adFlat: Point[] = dates.map((date, i) => [date, i < 10 ? i : 10 - (i - 10) * 0.5])
    const ixNewHigh: Point[] = dates.map((date, i) => [date, 100 + i])
    expect(narrowingDivergence(adFlat, ixNewHigh)).toBe(true)
    expect(bothAtHighs(adFlat, ixNewHigh)).toBe(false)
  })

  it('review sample: 11-17 both at highs; 11-18 breadth-only drop does not fake narrowing', () => {
    // Index prints through 11-17; breadth continues to 11-18 with a pullback.
    const dates = [
      '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26',
      '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-11-02',
      '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09',
      '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16',
      '2026-11-17', '2026-11-18',
    ]
    const adLine: Point[] = dates.map((date, i) => {
      // Rising to a high on 11-17, then retreats on 11-18.
      const v = i <= 20 ? i : 19
      return [date, v]
    })
    const index: Point[] = dates.slice(0, 21).map((date, i) => [date, 1000 + i])

    expect(commonSeries(adLine, index)).toBeUndefined() // latest breadth day lacks index
    expect(bothAtHighs(adLine, index)).toBe(false)
    expect(narrowingDivergence(adLine, index)).toBe(false)

    // Through 11-17 alone both are at highs.
    const through17 = adLine.slice(0, 21)
    expect(bothAtHighs(through17, index)).toBe(true)
    expect(narrowingDivergence(through17, index)).toBe(false)

    const rows = dates.map((date, i) => {
      const adv = i <= 20 ? 300 + i : 280
      const dec = 200
      return [date, adv, dec, 5, 505] as [string, number, number, number, number]
    })
    const breadth: Breadth = {
      date: '2026-11-18', covered: 505, total: 505, above200: 60,
      source: 'test', scope: '标普 500', advDec: rows,
    }
    const m = buildAdvDecMetrics(breadth, index, '2026-11-18')
    expect(m?.readings.some(r => r.includes('参与度在变窄'))).toBe(false)
    expect(m?.readings).not.toContain(NARROWING_READING)
    // Signal disabled because latest breadth day has no index print.
    expect(m?.readings).not.toContain(BOTH_AT_HIGHS_READING)
  })

  it('disables 20-day narrowing when common sessions < 20', () => {
    const dates = d(15)
    const ad: Point[] = dates.map((date, i) => [date, i < 5 ? i : 5 - (i - 5)])
    const ix: Point[] = dates.map((date, i) => [date, 100 + i])
    expect(narrowingDivergence(ad, ix)).toBe(false)
  })
})

describe('isStale / weekdaySessions / Thanksgiving', () => {
  it('flags data older than the prior NYSE session vs asOf', () => {
    const now = new Date('2026-11-20T22:00:00Z')
    expect(isStale('2026-11-20', '2026-11-20', now)).toBe(false)
    expect(isStale('2026-11-19', '2026-11-20', now)).toBe(false)
    expect(isStale('2026-11-18', '2026-11-20', now)).toBe(true)
    expect(weekdaySessionsOnOrBefore('2026-11-22', 3)).toEqual(['2026-11-20', '2026-11-19', '2026-11-18'])
  })

  it('Thanksgiving week: Wed data is not stale vs Fri when Thu is holiday', () => {
    const now = new Date('2026-11-27T22:00:00Z') // after 16:40 ET
    // Prior completed session before Fri 27 is Wed 25.
    expect(isStale('2026-11-25', '2026-11-27', now)).toBe(false)
    expect(isStale('2026-11-24', '2026-11-27', now)).toBe(true)
  })
})

describe('continuous means / sample gate', () => {
  const now = new Date('2026-11-20T23:00Z')
  const latest = '2026-11-20'
  const dates = nyseSessionsOnOrBefore(latest, 160, now)
  const rows = dates.map((date, i): NonNullable<Breadth['advDec']>[number] =>
    [date, i < 150 ? 20 : 40, i < 150 ? 80 : 60, 0, 100])
  const metrics = (advDec: Breadth['advDec']) => buildAdvDecMetrics({
    date: latest, total: 100, covered: 100, above200: 50,
    source: 'test', scope: '标普 500', advDec,
  }, undefined, latest, now)!

  it('suppresses old 10-day means and percentiles after a missing November 19', () => {
    const result = metrics([...rows.slice(0, -1), [latest, 0, 100, 0, 100]]
      .filter(([date]) => date !== '2026-11-19') as Breadth['advDec'])
    expect(result.today.advanceShare).toBe(0)
    expect(result.avg10Share).toBeUndefined()
    expect(result.avg10Percentile).toBeUndefined()
    expect(result.readings).toEqual([])
  })

  it('excludes 1/100 coverage from RANA, EMA, cumulative net and the current mean', () => {
    const prior = rows.slice(0, -1)
    const result = metrics([...prior, [latest, 1, 0, 0, 1]])
    expect(result.ranaSeries).toEqual(metrics(prior).ranaSeries)
    expect(result.mcclellanSeries).toEqual(metrics(prior).mcclellanSeries)
    expect(result.cumulative).toEqual(metrics(prior).cumulative)
    expect(result.dailyNet).toEqual(metrics(prior).dailyNet)
    expect(result.ranaSeries.at(-1)?.[0]).toBe('2026-11-19')
    expect(result.avg10Share).toBeUndefined()
    expect(result.avg10Percentile).toBeUndefined()
  })

  it.each([
    [20, 40, '相对过去一年偏强。'],
    [80, 60, '相对过去一年偏弱。'],
    [20, 55, '短期普涨，热度偏高。'],
    [80, 45, '短期普跌，情绪偏冷。'],
  ])('reads breadth from %i to %i by both percentile and absolute share', (early, late, reading) => {
    const result = metrics(dates.map((date, i) => {
      const adv = i < 150 ? early : late
      return [date, adv, 100 - adv, 0, 100]
    }))
    expect(result.avg10Share).toBeCloseTo(late / 100)
    expect(result.readings).toEqual([reading])
  })

  it('does not stitch 10-day means across a coverage gap', () => {
    const dates = d(14)
    const points = dates.map((date, i) => ({ date, share: 0.5 + i * 0.01 }))
    // Drop one interior day → windows that include the gap fail.
    const gapped = points.filter(p => p.date !== dates[5])
    const means = continuousRollingMeans(gapped, 10)
    // Gap at index 5 with only 14 points → no full 10-session window after the hole.
    expect(means).toEqual([])
  })

  it('requires 120 continuous 10-day means before percentile / 短期普涨', () => {
    const dates = d(30)
    const rows = dates.map((date) => [date, 400, 100, 5, 505] as [string, number, number, number, number])
    const index: Point[] = dates.map((date, i) => [date, 1000 + i])
    const breadth: Breadth = {
      date: dates.at(-1)!, covered: 505, total: 505, above200: 60,
      source: 'test', scope: '标普 500', advDec: rows,
    }
    const m = buildAdvDecMetrics(breadth, index, dates.at(-1)!)
    expect(m?.avg10Share).toBeTypeOf('number')
    expect(m?.avg10SampleReady).toBe(false)
    expect(m?.avg10Percentile).toBeUndefined()
    expect(m?.readings.some(r => r.includes('短期普涨') || r.includes('短期普跌'))).toBe(false)
    expect(AVG10_SAMPLE_MIN).toBe(120)
    expect(SAMPLE_INSUFFICIENT).toContain('历史样本不足')
  })

  it('treats covered/total < 0.95 as a missing day for 10-day means', () => {
    const dates = d(15)
    const rows = dates.map((date, i) => {
      const covered = i === 7 ? 400 : 500 // day 7 below 95% of 500
      return [date, 300, 200, 0, covered] as [string, number, number, number, number]
    })
    const breadth: Breadth = {
      date: dates.at(-1)!, covered: 500, total: 500, above200: 50,
      source: 'test', scope: '标普 500', advDec: rows,
    }
    const m = buildAdvDecMetrics(breadth, undefined, dates.at(-1)!)
    // Gap at day 7 blocks means that would include it; late windows after the gap may exist.
    expect(m?.avg10SampleReady).toBe(false)
  })
})

describe('buildAdvDecMetrics', () => {
  it('computes full history path with McClellan and joint-high reading', () => {
    const dates = d(80)
    // Rising nets so AD line and index both finish at series highs.
    const rows = dates.map((date, i) => {
      const adv = 300 + i
      const dec = 200
      return [date, adv, dec, 5, 505] as [string, number, number, number, number]
    })
    const index: Point[] = dates.map((date, i) => [date, 1000 + i * 2])
    const breadth: Breadth = {
      date: dates.at(-1)!, covered: 505, total: 505, above200: 50,
      source: 'test', scope: '标普 500', advDec: rows,
    }
    const m = buildAdvDecMetrics(breadth, index, dates.at(-1)!)
    expect(m?.historyReady).toBe(true)
    expect(m?.today.advancers).toBe(rows.at(-1)![1])
    expect(m?.today.net).toBe(rows.at(-1)![1] - rows.at(-1)![2])
    expect(m?.avg10Share).toBeTypeOf('number')
    expect(m?.avg10SampleReady).toBe(false) // 80 days → < 120 means
    expect(m?.mcclellanWarmup).toBe(false)
    expect(m?.mcclellan).toBeTypeOf('number')
    expect(m?.cumulative).toHaveLength(80)
    expect(m?.readings).toContain(BOTH_AT_HIGHS_READING)
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
