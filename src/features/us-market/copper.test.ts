import { describe, expect, it } from 'vitest'
import {
  alignSeries,
  buildCopperSnapshot,
  historyPercentile,
  isCopperStale,
  pointOnOrBefore,
  refreshFailedCopy,
  trailingYears,
  weekdaySessionsOnOrBefore,
  yearChange,
} from './copper'
import type { Point, Reading } from './model'

const reading = (history: Point[], unit = '倍', extra: Partial<Reading> = {}): Reading => ({
  name: 't', unit, source: '', scope: '', frequency: '日频', history, ...extra,
})

describe('weekdaySessionsOnOrBefore / isCopperStale', () => {
  it('lists weekdays newest-last and flags lag beyond two sessions', () => {
    expect(weekdaySessionsOnOrBefore('2026-11-20', 4)).toEqual([
      '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20',
    ])
    const now = new Date('2026-11-20T22:30:00Z')
    expect(isCopperStale('2026-11-20', '2026-11-20', now)).toBe(false)
    expect(isCopperStale('2026-11-19', '2026-11-20', now)).toBe(false)
    expect(isCopperStale('2026-11-18', '2026-11-20', now)).toBe(false)
    expect(isCopperStale('2026-11-17', '2026-11-20', now)).toBe(true)
  })

  it('counts today for COMEX freshness from 17:30 ET', () => {
    expect(isCopperStale('2026-11-17', '2026-11-20', new Date('2026-11-20T21:45Z'))).toBe(false)
    expect(isCopperStale('2026-11-17', '2026-11-20', new Date('2026-11-20T22:30Z'))).toBe(true)
  })

  it('Thanksgiving week uses NYSE sessions for copper lag', () => {
    const now = new Date('2026-11-27T22:30:00Z')
    // Sessions …20,23,24,25,27 — lag0=27, lag1=25, lag2=24; cutoff at(-3)=24 → <24 stale
    expect(isCopperStale('2026-11-25', '2026-11-27', now)).toBe(false)
    expect(isCopperStale('2026-11-24', '2026-11-27', now)).toBe(false)
    expect(isCopperStale('2026-11-23', '2026-11-27', now)).toBe(true)
    expect(isCopperStale('2026-11-20', '2026-11-27', now)).toBe(true)
  })
})

describe('percentile / yearChange / align', () => {
  it('ranks within history and finds year-ago baseline', () => {
    const hist: Point[] = [
      ['2025-11-18', 3.5],
      ['2025-11-19', 3.6],
      ['2026-05-01', 4.0],
      ['2026-11-18', 4.2],
    ]
    expect(historyPercentile(hist, 4.2)).toBe(88)
    expect(yearChange(hist)).toBeCloseTo((4.2 / 3.5 - 1) * 100, 5)
    expect(pointOnOrBefore(hist, '2025-12-01')).toEqual(['2025-11-19', 3.6])
    expect(trailingYears(hist, 0.6).map(([d]) => d)).toEqual(['2026-05-01', '2026-11-18'])
  })

  it('aligns copper-gold with yields on shared dates in the window', () => {
    const ratio: Point[] = [
      ['2021-01-04', 0.001],
      ['2022-06-01', 0.002],
      ['2024-06-03', 0.0015],
      ['2025-06-02', 0.0016],
      ['2026-11-18', 0.0017],
    ]
    const yields: Point[] = [
      ['2022-06-01', 3.0],
      ['2024-06-03', 4.2],
      ['2025-06-02', 4.4],
      ['2026-11-18', 4.1],
    ]
    const aligned = alignSeries(ratio, yields, 5)
    expect(aligned.dates).toEqual(['2022-06-01', '2024-06-03', '2025-06-02', '2026-11-18'])
    expect(aligned.left).toEqual([0.002, 0.0015, 0.0016, 0.0017])
    expect(aligned.right).toEqual([3.0, 4.2, 4.4, 4.1])
  })
})

describe('buildCopperSnapshot', () => {
  it('builds readings when both series exist and marks missing as not ready', () => {
    const empty = buildCopperSnapshot({}, '2026-11-20')
    expect(empty.ready).toBe(false)

    const copper: Point[] = [
      ['2025-11-18', 4.0],
      ['2026-11-17', 4.1],
      ['2026-11-18', 4.2],
    ]
    const ratio: Point[] = [
      ['2025-11-18', 0.0015],
      ['2026-11-17', 0.00155],
      ['2026-11-18', 0.0016],
    ]
    const tenYear: Point[] = [
      ['2026-11-17', 4.1],
      ['2026-11-18', 4.05],
    ]
    const snap = buildCopperSnapshot({
      copperDaily: reading(copper, '美元/磅'),
      copperGold: reading(ratio),
      tenYearDaily: reading(tenYear, '%'),
    }, '2026-11-20')
    expect(snap.ready).toBe(true)
    expect(snap.copper?.value).toBe(4.2)
    expect(snap.ratio?.value).toBe(0.0016)
    expect(snap.copper?.stale).toBe(false)
    expect(snap.ratio?.stale).toBe(false)
    expect(snap.chart.dates).toEqual(['2026-11-17', '2026-11-18'])
  })

  it('keeps independent dates: copper 11-20 fresh, ratio 11-13 with refresh error', () => {
    const now = new Date('2026-11-20T22:30:00Z')
    const copper: Point[] = [
      ['2026-11-18', 4.1],
      ['2026-11-19', 4.15],
      ['2026-11-20', 4.2],
    ]
    const gold: Point[] = [
      ['2026-11-12', 2600],
      ['2026-11-13', 2610],
    ]
    const ratio: Point[] = [
      ['2026-11-12', 0.00155],
      ['2026-11-13', 0.00158],
    ]
    const snap = buildCopperSnapshot({
      copperDaily: reading(copper, '美元/磅'),
      goldDaily: reading(gold, '美元/盎司'),
      copperGold: reading(ratio, '倍', { refreshError: 'HTTP 429' }),
    }, '2026-11-20', now)

    expect(snap.ready).toBe(true)
    expect(snap.copper?.date).toBe('2026-11-20')
    expect(snap.copper?.stale).toBe(false)
    expect(snap.copper?.refreshFailed).toBe(false)
    expect(snap.gold?.date).toBe('2026-11-13')
    expect(snap.ratio?.date).toBe('2026-11-13')
    expect(snap.ratio?.refreshFailed).toBe(true)
    expect(snap.asOfDate).toBe('2026-11-20')
    // Must not pretend the ratio is as fresh as copper.
    expect(snap.ratio?.date).not.toBe(snap.copper?.date)
    expect(refreshFailedCopy('2026-11-13')).toBe('最近一次更新失败，显示的是上次读数（截至 2026-11-13）')
  })

  it('shows copper alone when ratio is missing', () => {
    const snap = buildCopperSnapshot({
      copperDaily: reading([['2026-11-20', 4.2]], '美元/磅'),
    }, '2026-11-20')
    expect(snap.ready).toBe(true)
    expect(snap.copper?.value).toBe(4.2)
    expect(snap.ratio).toBeUndefined()
    expect(snap.gold).toBeUndefined()
  })
})
