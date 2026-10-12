import { describe, expect, it } from 'vitest'
import { aggregateCandles, combineVolume, parseHistory } from './chinaHistory'

describe('中国市场历史数据', () => {
  it('保留开高低收及成交手数，拒绝损坏的数据而非画出假行情', () => {
    expect(parseHistory([['2026-01-05', '10', '12', '13', '9', '200']])).toEqual([
      { date: '2026-01-05', open: 10, close: 12, high: 13, low: 9, volume: 200 },
    ])
    expect(() => parseHistory([['2026-02-30', '10', '12', '13', '9', '200']])).toThrow()
    expect(() => parseHistory([['2026-01-05', '10', '12', '11', '9', '200']])).toThrow()
    expect(() => parseHistory([['2026-01-05', '10', '12', '13', '9', '']])).toThrow()
  })
  const rows = [
    { date: '2025-12-31', open: 10, close: 12, high: 13, low: 9, volume: 100 },
    { date: '2026-01-02', open: 12, close: 11, high: 14, low: 10, volume: 200 },
    { date: '2026-01-05', open: 11, close: 15, high: 16, low: 10, volume: 300 },
  ]
  it('周线跨年按同一周聚合，取首开末收及最高最低并累加成交量', () => {
    expect(aggregateCandles(rows, 'week')[0]).toEqual({ date: '2026-01-02', open: 10, close: 11, high: 14, low: 9, volume: 300 })
    expect(aggregateCandles(rows, 'year')).toEqual([rows[0], { date: '2026-01-05', open: 12, close: 15, high: 16, low: 10, volume: 500 }])
  })
  it('沪深按周期对齐后合计，成交手数转换为亿股', () => {
    expect(combineVolume([rows[0]], [{ ...rows[0], volume: 200 }], 'day')[0].volume).toBe(0.0003)
    expect(combineVolume([{ ...rows[0], date: '2026-01-30' }], [{ ...rows[0], date: '2026-01-29', volume: 200 }], 'month')[0].volume).toBe(0.0003)
  })
  it('某市场缺失最新或中间交易日时拒绝不完整的合计', () => {
    expect(() => combineVolume(rows, [rows[0], rows[2]], 'day')).toThrow('沪深')
    expect(() => combineVolume(rows, rows.slice(0, 2), 'day')).toThrow('沪深')
  })
  it('年成交量先校验月份完整性，不能把缺月数据当作完整年', () => {
    const monthly = [
      { ...rows[0], date: '2025-01-31' },
      { ...rows[1], date: '2025-02-28' },
      { ...rows[2], date: '2025-03-31' },
    ]
    expect(() => combineVolume(monthly, [monthly[0], monthly[2]], 'year')).toThrow('沪深')
  })
})
