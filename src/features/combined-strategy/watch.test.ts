import { describe, expect, it } from 'vitest'
import { compositeFixture } from '../macro-posture/composite/fixture'
import { tacticalWatch } from './watch'

describe('tacticalWatch', () => {
  it('均线未触发时给出门槛、距离和降到哪一档', () => {
    const w = tacticalWatch(compositeFixture())
    expect(w).not.toBeNull()
    expect(w!.text).toContain('11 月剩下 6 个交易日')
    expect(w!.text).toContain('低于 5,050 点')
    expect(w!.text).toContain('比 11 月 20 日收盘 5,780 点低 12.6%')
    expect(w!.text).toContain('月底降一档到中性（上限的 70%）')
    expect(w!.close).toBe(false)
  })

  it('月内均价已在均线下方时直接提示', () => {
    const file = compositeFixture()
    file.current.tactical.mtd!.below = true
    const w = tacticalWatch(file)
    expect(w!.text).toContain('已低于 10 个月均线')
    expect(w!.close).toBe(true)
  })

  it('正式档位已被均线下调、无 mtd、无剩余交易日或已是最低档时不提示', () => {
    const below = compositeFixture(); below.current.tactical.below = true
    expect(tacticalWatch(below)).toBeNull()
    const noMtd = compositeFixture(); delete noMtd.current.tactical.mtd
    expect(tacticalWatch(noMtd)).toBeNull()
    const done = compositeFixture(); done.current.tactical.mtd!.remaining = 0
    expect(tacticalWatch(done)).toBeNull()
    const lowest = compositeFixture(); lowest.current.final.tier = 'defense'
    expect(tacticalWatch(lowest)).toBeNull()
    expect(tacticalWatch(null)).toBeNull()
  })
})
