import { describe, expect, it } from 'vitest'
import { holdLine, holdSegments, rangeStart } from './plan-chart'
import type { PlanBar, PlanSignal } from './plan-trades'

const bar = (date: string, close: number): PlanBar => ({ date, open: close, high: close, low: close, close })
const sig = (date: string, side: 'buy' | 'sell', forced = false): PlanSignal => ({ date, side, price: 1, signalDate: date, reason: '', ...(forced ? { forced } : {}) })

describe('plan-chart', () => {
  it('买卖配对成持仓段，未平仓的段 to 为空', () => {
    expect(holdSegments([sig('2026-01-02', 'buy'), sig('2026-01-05', 'sell'), sig('2026-01-07', 'buy')])).toEqual([
      { from: '2026-01-02', to: '2026-01-05' }, { from: '2026-01-07', to: null },
    ])
  })
  it('孤立的卖出与重复买入不产生脏段', () => {
    expect(holdSegments([sig('2026-01-01', 'sell'), sig('2026-01-02', 'buy'), sig('2026-01-03', 'buy')])).toEqual([{ from: '2026-01-02', to: null }])
  })
  it('持仓线：段内取收盘价、段外留空', () => {
    const bars = ['01', '02', '05', '06', '07'].map((d, i) => bar(`2026-01-${d}`, 10 + i))
    const line = holdLine(bars, [{ from: '2026-01-02', to: '2026-01-05' }, { from: '2026-01-07', to: null }])
    expect(line.map(p => p.value)).toEqual([undefined, 11, 12, undefined, 14])
  })
  it('区间起点：全部为空串，近 1 年按最后一根往前推', () => {
    const bars = [bar('2024-01-01', 1), bar('2026-06-30', 2)]
    expect(rangeStart(bars, 'all')).toBe('')
    expect(rangeStart(bars, '1y')).toBe('2025-06-29')
  })
})
