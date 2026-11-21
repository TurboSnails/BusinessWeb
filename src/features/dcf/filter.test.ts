import { describe, expect, it } from 'vitest'
import { matchDcfFilter } from './filter'

describe('DCF 筛选', () => {
  const up = { price: 120, mos: 0.25 }, flat = { price: 100, mos: 0.05 }, noMos = { price: null, mos: null }
  it('全部 / 已算 / 未算', () => {
    expect(matchDcfFilter('all', undefined)).toBe(true)
    expect(matchDcfFilter('done', up)).toBe(true); expect(matchDcfFilter('done', undefined)).toBe(false)
    expect(matchDcfFilter('none', undefined)).toBe(true); expect(matchDcfFilter('none', up)).toBe(false)
  })
  it('安全边际下限；没算出安全边际的不通过', () => {
    expect(matchDcfFilter('mos0', flat)).toBe(true); expect(matchDcfFilter('mos20', flat)).toBe(false)
    expect(matchDcfFilter('mos20', up)).toBe(true)
    expect(matchDcfFilter('mos0', noMos)).toBe(false); expect(matchDcfFilter('mos0', undefined)).toBe(false)
  })
  it('本人 DCF 没有新鲜同币种现价时保留记录，但不进入当前 MOS 筛选', () => {
    const saved = { ...up, source: 'mine' as const, savedAt: '2026-10-01T00:00:00Z', currentFresh: false }
    expect(matchDcfFilter('done', saved)).toBe(true)
    expect(matchDcfFilter('mine', saved)).toBe(true)
    expect(matchDcfFilter('mos20', saved)).toBe(false)
    expect(matchDcfFilter('mos0', saved)).toBe(false)
    expect(matchDcfFilter('mos20', { ...saved, currentFresh: true, current: 96 })).toBe(true)
  })
})
