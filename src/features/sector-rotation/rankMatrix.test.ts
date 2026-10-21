import { describe, expect, it } from 'vitest'
import { buildPlateRanking, plateDaysOf, type PlateDay } from './rankMatrix'
import type { LimitUpConcept, LimitUpStock } from '../../types'

const stock = (code: string): LimitUpStock => ({ code, name: code, currentPrice: 1, changePercent: 10, limitUpTime: '09:30:00', marketCap: 1, consecutiveDays: 1 })
const concept = (name: string, changePercent: number, codes: string[]): LimitUpConcept => ({ name, stockCount: codes.length, changePercent, stocks: codes.map(stock) })
const day = (...c: LimitUpConcept[]) => plateDaysOf(c)

describe('plateDaysOf', () => {
  it('排除 ST 与「其他」，记录涨停数与代码', () => {
    const m = day(concept('机器人', 2, ['1', '2']), concept('ST板块', 5, ['3']), concept('其他', 1, ['4']))
    expect([...m.keys()]).toEqual(['机器人'])
    expect(m.get('机器人')).toEqual({ change: 2, count: 2, codes: ['1', '2'] })
  })
})

describe('buildPlateRanking', () => {
  const byDate: Record<string, Map<string, PlateDay>> = {
    '2026-10-19': day(concept('A', 3, ['1', '2', '3', '4']), concept('B', 2, ['9'])),
    '2026-10-20': day(concept('A', 0.5, ['1', '2']), concept('C', 4, ['7'])),
    '2026-10-21': day(concept('A', 1.5, ['1']), concept('B', 0.2, ['9']), concept('C', 1.2, ['7'])),
  }
  const r = buildPlateRanking(byDate, 20)
  it('日期从新到旧', () => expect(r.dates).toEqual(['2026-10-21', '2026-10-20', '2026-10-19']))
  it('从最近一天起：当日涨幅>1% 的板块在前，涨幅高者优先；其后按更早日期', () => {
    expect(r.rows.map(x => x.name)).toEqual(['A', 'C', 'B'])
  })
  it('连板率 = 昨日涨停股今日继续涨停的比例；缺前一日则为 null', () => {
    const a = r.rows.find(x => x.name === 'A')!
    expect(a.cells[0]).toMatchObject({ change: 1.5, count: 1, rate: 0.5 }) // 昨日 {1,2}，今日 {1}
    expect(a.cells[1]).toMatchObject({ rate: 0.5 })                       // 前日 {1,2,3,4}，昨日 {1,2}
    expect(a.cells[2]?.rate).toBeNull()                                    // 最旧一天没有更早数据
    const c = r.rows.find(x => x.name === 'C')!
    expect(c.cells[2]).toBeNull()
    expect(c.cells[1]?.rate).toBeNull()                                    // 前日 C 没有涨停
    expect(c.cells[0]?.rate).toBe(1)
  })
  it('阈值严格大于，且只取最近 N 个有数据的日期', () => {
    const only = buildPlateRanking({ '2026-10-21': day(concept('A', 1, ['1'])), '2026-10-20': new Map() }, 5)
    expect(only.dates).toEqual(['2026-10-21'])
    expect(buildPlateRanking(byDate, 2).dates).toEqual(['2026-10-21', '2026-10-20'])
  })
})
