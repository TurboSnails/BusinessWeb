import { describe, expect, it } from 'vitest'
import { aggregateCandles } from './chinaHistory'
import { aggregateMarketVolume, aggregateVolume, dailySegment, isOngoing, parseCboeVolume } from './usHistory'

const weekdays = (from: string, to: string) => {
  const out: string[] = []
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10))
  }
  return out
}
// Cboe 文件形状：早期每周只留一天，最近一段逐日
const cboe = (history: [string, number][]) => ({ series: { volume: { name: '美股全市场成交量（Cboe）', unit: '亿股', history } } })
const sampled: [string, number][] = [['2025-11-14', 150], ['2025-11-21', 160], ['2025-11-28', 90]]
const daily: [string, number][] = weekdays('2025-12-03', '2026-01-16').map(d => [d, 200])

describe('美股成交量数据', () => {
  it('Cboe 只取末尾连续的逐日段，周抽样的旧点不参与', () => {
    const rows = parseCboeVolume(cboe([...sampled, ...daily]))!
    expect(rows[0]).toEqual({ date: '2025-12-03', volume: 200 })
    expect(rows).toHaveLength(daily.length)
    // 节假日（感恩节、圣诞）造成的 2–4 天间隔不算断档
    expect(dailySegment([{ date: '2025-11-26', volume: 1 }, { date: '2025-11-28', volume: 1 }, { date: '2025-12-01', volume: 1 }])).toHaveLength(3)
  })

  it('文件缺失、被回退成网页或结构不对时返回 null', () => {
    expect(parseCboeVolume(null)).toBeNull()
    expect(parseCboeVolume('<!doctype html>')).toBeNull()
    expect(parseCboeVolume({ series: {} })).toBeNull()
    expect(parseCboeVolume({ series: { volume: { unit: '股', history: daily } } })).toBeNull()
    expect(parseCboeVolume(cboe([...daily.slice(0, -1), ['2026-01-16', Number.NaN]]))).toBeNull()
    expect(parseCboeVolume(cboe(daily.slice(0, 5)))).toBeNull()
  })

  it('全美成交量按周 / 月累计，并略去逐日段开头不完整的那一期', () => {
    const rows = parseCboeVolume(cboe([...sampled, ...daily]))!
    const weeks = aggregateMarketVolume(rows, 'week')
    // 2025-12-03 所在的那周（12-01 起）只有三天，略去；第一期是 12-08 当周
    expect(weeks[0]).toEqual({ date: '2025-12-12', volume: 1000 })
    expect(weeks.at(-1)).toEqual({ date: '2026-01-16', volume: 1000 })
    const months = aggregateMarketVolume(rows, 'month')
    expect(months).toEqual([{ date: '2026-01-16', volume: 12 * 200 }])
    expect(aggregateMarketVolume(rows, 'day')).toEqual(rows)
  })

  it('指数成交量按周 / 月求和，K 线取首开末收与最高最低', () => {
    const candles = weekdays('2026-01-05', '2026-01-16').map((date, i) => ({ date, open: 100 + i, close: 101 + i, high: 103 + i, low: 99 + i, volume: 1e9 }))
    expect(aggregateVolume(candles.map(c => ({ date: c.date, volume: c.volume / 1e8 })), 'week')).toEqual([
      { date: '2026-01-09', volume: 50 }, { date: '2026-01-16', volume: 50 },
    ])
    expect(aggregateCandles(candles, 'week')[1]).toEqual({ date: '2026-01-16', open: 105, close: 110, high: 112, low: 104, volume: 5e9 })
    expect(aggregateCandles(candles, 'month')).toHaveLength(1)
  })

  it('进行中按纽约日期与收盘时间判断', () => {
    // 2026-11-24 15:00 纽约（EST，UTC-5）= 20:00 UTC
    const open = new Date('2026-11-24T20:00:00Z'), closed = new Date('2026-11-24T21:30:00Z')
    expect(isOngoing('2026-11-24', 'day', open)).toBe(true)
    expect(isOngoing('2026-11-24', 'day', closed)).toBe(false)
    expect(isOngoing('2026-11-23', 'week', closed)).toBe(true)
    expect(isOngoing('2026-11-21', 'week', closed)).toBe(false)
    // 上海已是 11-25 凌晨，纽约仍是 11-24
    expect(isOngoing('2026-11-25', 'day', new Date('2026-11-24T17:00:00Z'))).toBe(false)
  })
})
