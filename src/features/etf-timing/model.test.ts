import { describe, expect, it } from 'vitest'
import { asEtfTiming, filterItems, isRecent, staleDays, verdictSummary, type ShadowItem } from './model'
import { fixture } from './fixtures'


describe('asEtfTiming', () => {
  it('解析合法数据，丢弃坏条目', () => {
    const d = asEtfTiming(fixture())!
    expect(d.latest!.items.map(i => i.code)).toEqual(['512760', '510050', '159915'])
    expect(d.latest!.timing).toEqual({ hs300Bull: false, cybBull: true })
    expect(d.research!.results).toHaveLength(1)
  })
  it('版本或结构不对返回 null；latest/research 缺失时仍可用', () => {
    expect(asEtfTiming(null)).toBeNull()
    expect(asEtfTiming({ ...fixture(), version: 2 })).toBeNull()
    const d = asEtfTiming({ version: 1, history: [] })!
    expect(d.latest).toBeNull()
    expect(d.research).toBeNull()
  })
})

describe('筛选与判定', () => {
  const items = asEtfTiming(fixture())!.latest!.items as ShadowItem[]
  it('isRecent：asOf 前 7 天内（含）', () => {
    expect(isRecent({ date: '2026-11-06', side: 'buy' }, '2026-11-13')).toBe(true)
    expect(isRecent({ date: '2026-11-05', side: 'buy' }, '2026-11-13')).toBe(false)
    expect(isRecent({ date: '2026-11-14', side: 'buy' }, '2026-11-13')).toBe(false)
    expect(isRecent(null, '2026-11-13')).toBe(false)
  })
  it('filterItems：任一规则持有 / 近 7 天信号；沪深300 规则持有的排前', () => {
    expect(filterItems(items, 'all', '2026-11-13').map(i => i.code)).toEqual(['512760', '159915', '510050'])
    expect(filterItems(items, 'holding', '2026-11-13').map(i => i.code)).toEqual(['512760', '510050'])
    expect(filterItems(items, 'recent', '2026-11-13').map(i => i.code)).toEqual(['512760'])
  })
  it('verdictSummary 与 staleDays', () => {
    expect(verdictSummary(asEtfTiming(fixture())!.research!.verdict)).toEqual({ dd: 1, annual: 1, both: 1, total: 2 })
    expect(staleDays('2026-11-13', new Date('2026-11-16T02:00:00Z'))).toBe(3)
  })
})
