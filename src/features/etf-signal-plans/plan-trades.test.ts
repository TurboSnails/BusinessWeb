import { describe, expect, it } from 'vitest'
import { backtestPlan, macdPlan } from './plan-trades'
import { styleRatio } from './ratio'
import { bullLookup } from './kd10-signals'

function bars(n: number, start = '2020-01-01') {
  const out = []
  let d = new Date(`${start}T00:00:00Z`)
  let p = 10
  for (let i = 0; i < n; i++) {
    const date = d.toISOString().slice(0, 10)
    const open = p, close = p * (1 + ((i % 7) - 3) * 0.01), high = Math.max(open, close) * 1.01, low = Math.min(open, close) * 0.99
    out.push({ date, open, high, low, close })
    p = close
    d = new Date(d.getTime() + 86400_000)
  }
  return out
}

describe('plan-trades', () => {
  it('macdPlan returns signals structure', () => {
    const result = macdPlan(bars(200))
    expect(result.key).toBe('macd')
    expect(Array.isArray(result.signals)).toBe(true)
  })

  it('backtestPlan needs warmup window and reports avgRet', () => {
    const b = bars(250)
    const alwaysBull = () => true
    const full = backtestPlan('macd', b, alwaysBull)
    expect(full?.sessions).toBeGreaterThan(100)
    expect(full?.mdd).toBeLessThanOrEqual(0)
    if (full && full.natural > 0) expect(typeof full.avgRet).toBe('number')
  })

  it('styleRatio + bullLookup', () => {
    const g = [{ date: '2020-01-01', close: 2 }, { date: '2020-01-02', close: 2.2 }, { date: '2020-01-03', close: 2.1 }]
    const d = [{ date: '2020-01-01', close: 1 }, { date: '2020-01-02', close: 1 }, { date: '2020-01-03', close: 1 }]
    const points = styleRatio(g, d, 2)
    expect(points[1].bull).not.toBeNull()
    const bull = bullLookup(points)
    expect(bull('2020-01-03')).toBe(points[2].bull ?? undefined)
  })
})
