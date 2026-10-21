import { describe, expect, it } from 'vitest'
import { buildLadder, ladderCopyText } from './ladder'
import type { LimitUpConcept, LimitUpStock } from '../../types'

const stock = (code: string, boards: number, time: string, pct = 10): LimitUpStock => ({ code, name: `股${code}`, currentPrice: 10, changePercent: pct, limitUpTime: time, marketCap: 50, consecutiveDays: boards })
const concept = (name: string, stocks: LimitUpStock[]): LimitUpConcept => ({ name, stockCount: stocks.length, changePercent: 1, stocks } as LimitUpConcept)

describe('buildLadder', () => {
  it('去重跨概念个股并合并概念名，按连板数降序分层，层内按涨停时间升序', () => {
    const tiers = buildLadder([
      concept('A', [stock('1', 3, '10:00:00'), stock('2', 1, '09:40:00'), stock('3', 1, '09:31:00')]),
      concept('B', [stock('1', 3, '10:00:00')]),
    ], true)
    expect(tiers.map(t => t.boards)).toEqual([3, 1])
    expect(tiers[0].stocks[0].concepts).toEqual(['A', 'B'])
    expect(tiers[1].stocks.map(s => s.code)).toEqual(['3', '2'])
  })
  it('连板数缺失的涨停股计为首板；非只看涨停时排除未涨停个股', () => {
    expect(buildLadder([concept('A', [stock('1', 0, '09:31:00')])], true)[0].boards).toBe(1)
    const tiers = buildLadder([concept('A', [stock('1', 0, '', 3.2), stock('2', 0, '09:35:00', 10.01), stock('3', 2, '09:50:00', 10)])], false)
    expect(tiers.flatMap(t => t.stocks.map(s => s.code)).sort()).toEqual(['2', '3'])
  })
  it('生成可复制文本', () => {
    expect(ladderCopyText(buildLadder([concept('A', [stock('1', 2, '09:31:00')])], true))).toBe('2板：股1(1)')
  })
})
