import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FILTERS, TAG_KEYS, bit, filterRows, latestPeriod, missingCats, nextSort, reconDays, reconMembers,
  securityCode, sortRows, tabCount,
  type Day, type Detail, type Filters, type Reconstructed,
} from './model'

const f = (...keys: (typeof TAG_KEYS)[number][]) => keys.reduce((s, k) => s | bit(k), 0)
const day: Day = {
  d: '2026-11-13',
  cats: [...TAG_KEYS],
  rows: [
    ['20:589200', '科创200ETF工银', f('new_pool', 'broad_index', 'unique_rep')],
    ['36:159253', '银行ETF博时', f('industry')],
    ['20:515020', '银行ETF华夏', f('industry', 'unique_rep', 't0')],
    ['20:560670', '银行ETF华泰柏瑞', f('trend_retracement', 'industry')],
  ],
}
const F = (o: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, ...o })
const codes = (rows: { 0: string }[]) => rows.map(r => r[0])

describe('etf-uptrend filters', () => {
  it('分类与勾选项取交集', () => {
    expect(codes(filterRows(day, F({ tab: 'industry' }), new Set(), null))).toHaveLength(3)
    expect(codes(filterRows(day, F({ tab: 'industry', unique: true }), new Set(), null))).toEqual(['20:515020'])
    expect(codes(filterRows(day, F({ retr: true, newPool: true }), new Set(), null))).toEqual([])
    expect(codes(filterRows(day, F({ tab: 't0' }), new Set(), null))).toEqual(['20:515020'])
  })

  it('自选、较上次新进、搜索', () => {
    expect(codes(filterRows(day, F({ tab: 'watch' }), new Set(['36:159253']), null))).toEqual(['36:159253'])
    const prev = new Set(['20:589200', '36:159253', '20:515020'])
    expect(codes(filterRows(day, F({ entered: true }), new Set(), prev))).toEqual(['20:560670'])
    expect(filterRows(day, F({ entered: true }), new Set(), null)).toEqual([])
    expect(codes(filterRows(day, F({ q: '华夏' }), new Set(), null))).toEqual(['20:515020'])
  })

  it('旧快照缺少分类时明确报缺', () => {
    const old: Day = { ...day, cats: ['trend_retracement', 'new_pool'] }
    expect(missingCats(old, F({ tab: 'broad_index', unique: true }))).toEqual(['broad_index', 'unique_rep'])
    expect(filterRows(old, F({ tab: 'broad_index' }), new Set(), null)).toEqual([])
    expect(tabCount(old, 'industry', new Set())).toBeNull()
    expect(tabCount(day, 'industry', new Set())).toBe(3)
  })

  it('securityCode strips ths prefix', () => {
    expect(securityCode('20:512400')).toBe('512400')
  })
})

describe('etf-uptrend sorting', () => {
  const p = (start: string, dur: number | undefined): Detail => ({
    at: '', reasons: {}, periods: [{ start_day: start, end_day: '2026-11-12', duration: dur }],
  })
  const detail: Record<string, Detail> = {
    '20:589200': p('2026-11-04', 7),
    '36:159253': p('2026-09-29', 28),
    '20:560670': p('2026-09-30', 27),
  }

  it('降序 → 升序 → 原序；无数据的行在最后', () => {
    const s1 = nextSort(null, 'dur')
    expect(s1).toEqual({ key: 'dur', dir: 'desc' })
    expect(codes(sortRows(day.rows, s1, detail))).toEqual(['36:159253', '20:560670', '20:589200', '20:515020'])
    const s2 = nextSort(s1, 'dur')
    expect(codes(sortRows(day.rows, s2, detail))).toEqual(['20:589200', '20:560670', '36:159253', '20:515020'])
    expect(nextSort(s2, 'dur')).toBeNull()
    expect(latestPeriod(detail['36:159253'])?.duration).toBe(28)
  })
})

describe('倒推历史', () => {
  const r: Reconstructed = {
    built_at: '', source_as_of: '2026-11-16', earliest: '2026-09-01', universe: 3, missing: [],
    names: { '20:A': 'A', '36:B': 'B' },
    periods: {
      '20:A': [['2026-11-10', '2026-11-16', 5, ['2026-11-12']], ['2026-09-01', '2026-09-05', 3, []]],
      '36:B': [['2026-11-12', '2026-11-13', 1, []]],
    },
  }
  it('日期取区间起止与回踩日，新到旧', () => {
    expect(reconDays(r)).toEqual(['2026-11-16', '2026-11-13', '2026-11-12', '2026-11-10', '2026-09-05', '2026-09-01'])
  })
  it('起止两端都算在池，回踩按当天判断', () => {
    expect(reconMembers(r, '2026-11-12')).toEqual([
      { code: '36:B', name: 'B', start: '2026-11-12', end: '2026-11-13', retr: false },
      { code: '20:A', name: 'A', start: '2026-11-10', end: '2026-11-16', retr: true },
    ])
    expect(reconMembers(r, '2026-11-14').map(x => x.code)).toEqual(['20:A'])
  })
})
