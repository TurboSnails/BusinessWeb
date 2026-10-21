import { describe, expect, it } from 'vitest'
import { buildPlateRanking } from './rankMatrix'
import type { SectorData } from './classify'

const s = (name: string, changePercent: number, date: string): SectorData => ({ name, code: name, changePercent, rank: 0, date })

describe('buildPlateRanking', () => {
  const byDate = {
    '2026-10-20': [s('机器人', 2, '2026-10-20'), s('芯片', 0.5, '2026-10-20'), s('ST板块', 9, '2026-10-20'), s('其他', 3, '2026-10-20')],
    '2026-10-19': [s('机器人', 1.5, '2026-10-19'), s('芯片', 3, '2026-10-19')],
    '2026-10-18': [s('芯片', 1.2, '2026-10-18')],
  }
  it('日期从旧到新，按涨幅>1% 的天数排序，排除 ST 与「其他」', () => {
    const r = buildPlateRanking(byDate, 20)
    expect(r.dates).toEqual(['2026-10-18', '2026-10-19', '2026-10-20'])
    expect(r.rows.map(x => x.name)).toEqual(['芯片', '机器人'])
    expect(r.rows[0]).toMatchObject({ hotDays: 2, changes: [1.2, 3, 0.5] })
    expect(r.rows[1].changes).toEqual([null, 1.5, 2])
  })
  it('天数相同时按累计涨幅，且只取最近 N 个有数据的日期', () => {
    const r = buildPlateRanking({ ...byDate, '2026-10-17': [] }, 2)
    expect(r.dates).toEqual(['2026-10-19', '2026-10-20'])
    expect(r.rows.map(x => x.name)).toEqual(['机器人', '芯片'])
  })
  it('阈值严格大于：恰为 1% 不计入', () => {
    expect(buildPlateRanking({ '2026-10-20': [s('A', 1, '2026-10-20')] }, 20).rows[0].hotDays).toBe(0)
  })
})
