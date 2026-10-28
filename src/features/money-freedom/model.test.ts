import { describe, expect, it } from 'vitest'
import { calcFreedom, calcProgress, fourPercentRule } from './model'

describe('money freedom model', () => {
  it('computes 480X + K×n + M + H in 万元', () => {
    const r = calcFreedom({ monthly: 5000, years: 40, childCost: 60, children: 2, health: 80, major: 200 })
    expect(r.daily).toBe(240)
    expect(r.total).toBe(240 + 120 + 80 + 200)
  })
  it('4% rule is 300X', () => {
    expect(fourPercentRule(5000)).toBe(150)
  })
  it('progress without return divides the gap by monthly saving', () => {
    const p = calcProgress(100, 5000, { age: 30, savings: 10, income: 10000, rate: 0 })
    expect(p.yearsNeeded).toBeCloseTo(900000 / 5000 / 12)
    expect(p.freedomAge).toBeCloseTo(30 + 15)
  })
  it('returns null when nothing can be saved', () => {
    expect(calcProgress(100, 8000, { age: 30, savings: 0, income: 6000, rate: 0 }).yearsNeeded).toBeNull()
  })
  it('compounding shortens the time', () => {
    const base = { age: 30, savings: 10, income: 10000 }
    const a = calcProgress(300, 5000, { ...base, rate: 0 }).yearsNeeded!
    const b = calcProgress(300, 5000, { ...base, rate: 3 }).yearsNeeded!
    expect(b).toBeLessThan(a)
  })
  it('already free when savings reach target', () => {
    expect(calcProgress(50, 5000, { age: 40, savings: 60, income: 0, rate: 0 }).freedomAge).toBe(40)
  })
})
