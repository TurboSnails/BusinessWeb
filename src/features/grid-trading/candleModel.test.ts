import { expect, it } from 'vitest'
import { candleIndicators, chartRows, hasOpen, hasVolume } from './candleModel'
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10), close: i + 1, high: i + 2, low: i + .5 }))
it('requires real MA and MACD warmup and keeps stable-price oscillator at zero', () => {
  const r = candleIndicators(rows(26))
  expect(r.ma10[0]).toEqual({ time: '2026-01-10', value: 5.5 })
  expect(r.ma20[0].value).toBe(10.5)
  expect(r.dif).toHaveLength(1)
  expect(candleIndicators(rows(25)).dif).toHaveLength(0)
  expect(candleIndicators(rows(40).map(r => ({ ...r, close: 2 }))).histogram.every(p => p.value === 0)).toBe(true)
})
it('deduplicates/sorts real observations and rejects impossible prices without inventing optional fields', () => {
  const result = chartRows([rows(2)[1], rows(2)[0], rows(2)[1], { date: '2026-01-03', close: 9, high: 3, low: 2 }])
  expect(result.map(r => r.date)).toEqual(['2026-01-01', '2026-01-02'])
  expect(hasOpen(result[0])).toBe(false)
  expect(hasVolume({ ...result[0], volume: 0 })).toBe(true)
  expect(hasVolume({ ...result[0], volume: -1 })).toBe(false)
})
