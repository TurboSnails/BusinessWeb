import { afterEach, describe, expect, it, vi } from 'vitest'
import { summarizeLocalRecords } from './localRecords'
import * as grid from '../grid-trading/repository'
import * as dcf from '../dcf/storage'
import * as valuation from '../valuation/storage'
import * as candidates from '../candidates/store'

afterEach(() => vi.restoreAllMocks())

const empty = () => {
  vi.spyOn(grid, 'readRecords').mockReturnValue([])
  vi.spyOn(dcf, 'loadDcfRecords').mockReturnValue([])
  vi.spyOn(valuation, 'loadReports').mockReturnValue([])
  vi.spyOn(candidates, 'loadLocal').mockReturnValue([])
}

describe('summarizeLocalRecords', () => {
  it('都没有数据时返回空数组', () => {
    empty()
    expect(summarizeLocalRecords()).toEqual([])
  })

  it('按最新时间取最近一条，只返回有数据的类别', () => {
    empty()
    vi.spyOn(grid, 'readRecords').mockReturnValue([
      { id: '1', savedAt: '2026-09-01T00:00:00Z', row: { name: '沪深300ETF', code: '510300' }, result: {} },
      { id: '2', savedAt: '2026-08-01T00:00:00Z', updatedAt: '2026-10-05T08:00:00Z', row: { name: '中证500ETF', code: '510500' }, result: {} },
    ] as never)
    vi.spyOn(candidates, 'loadLocal').mockReturnValue([
      { market: 'us', code: 'AAPL', addedAt: '2026-10-01T00:00:00Z' },
      { market: 'cn', code: '600519', addedAt: '2026-10-09T00:00:00Z' },
    ])
    expect(summarizeLocalRecords()).toEqual([
      { kind: 'grid', label: '网格记录', path: '/grid-trading/records', count: 2, latestName: '中证500ETF', latestDate: '2026-10-05' },
      { kind: 'candidates', label: '候选池', path: '/research-notes', count: 2, latestName: '600519', latestDate: '2026-10-09' },
    ])
  })

  it('DCF 与估值报告取公司名', () => {
    empty()
    vi.spyOn(dcf, 'loadDcfRecords').mockReturnValue([{ company: '贵州茅台', code: '600519', savedAt: '2026-10-02T00:00:00Z' }] as never)
    vi.spyOn(valuation, 'loadReports').mockReturnValue([{ snapshot: { security: { name: '腾讯控股', code: '00700' } }, createdAt: '2026-10-03T00:00:00Z' }] as never)
    const out = summarizeLocalRecords()
    expect(out.map(r => [r.kind, r.latestName, r.latestDate])).toEqual([
      ['dcf', '贵州茅台', '2026-10-02'],
      ['valuation', '腾讯控股', '2026-10-03'],
    ])
  })

  it('某个来源抛错时跳过该类，不影响其他', () => {
    empty()
    vi.spyOn(grid, 'readRecords').mockImplementation(() => { throw new Error('boom') })
    vi.spyOn(candidates, 'loadLocal').mockReturnValue([{ market: 'us', code: 'MSFT', addedAt: '2026-10-01T00:00:00Z' }])
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(summarizeLocalRecords().map(r => r.kind)).toEqual(['candidates'])
  })
})
