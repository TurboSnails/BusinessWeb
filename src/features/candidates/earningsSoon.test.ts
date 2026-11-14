import { describe, expect, it } from 'vitest'
import { earningsSoon, earningsSoonText, type EarningsEntryLike } from './earningsSoon'
import type { CandidateItem } from './validation'

const cand = (market: CandidateItem['market'], code: string): CandidateItem => ({ market, code, addedAt: '2026-11-01T00:00:00Z' })
const e = (over: Partial<EarningsEntryLike>): EarningsEntryLike => ({ market: 'us', code: 'NVDA', name: '英伟达', date: '2026-11-17', time: 'amc', confirmed: true, period: 'FY2027Q3', dateSource: 'yahoo', ...over })

describe('候选池「财报临近」', () => {
  it('只列候选公司、未来 N 天内（含今天）的财报，按日期排序；跨 us / ndx、港股代码位数都能对上', () => {
    const out = earningsSoon(
      [cand('ndx', 'NVDA'), cand('hk', '0700'), cand('cn', '600519'), cand('us', 'AAPL')],
      [e({}), e({ market: 'hk', code: '00700', name: '腾讯控股', date: '2026-11-14', time: 'unknown', confirmed: true, dateSource: 'hkex' }), e({ market: 'cn', code: '600519', name: '贵州茅台', date: '2026-12-30' }), e({ code: 'MSFT', date: '2026-11-15' }), e({ code: 'AAPL', date: '2026-11-13' })],
      '2026-11-14', 14,
    )
    expect(out.map(x => [x.market, x.code, x.date, x.daysUntil])).toEqual([['hk', '0700', '2026-11-14', 0], ['ndx', 'NVDA', '2026-11-17', 3]])
  })

  it('同一家只取最近一次；文字写明日期是否确认', () => {
    const out = earningsSoon([cand('us', 'NVDA')], [e({ date: '2026-11-25', confirmed: false }), e({ date: '2026-11-17' })], '2026-11-16')
    expect(out).toHaveLength(1)
    expect(earningsSoonText(out[0])).toBe('11-17 盘后公布 FY2027Q3（明天，已确认）')
    expect(earningsSoonText({ ...out[0], confirmed: false, time: 'unknown', daysUntil: 5, period: null })).toBe('11-17公布（5 天后，日期为预估）')
  })
})
