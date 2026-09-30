import { describe, expect, it } from 'vitest'
import { calculateFee } from './fees'

describe('calculateFee', () => {
  it('applies the ETF minimum commission and waives ETF stamp duty', () => {
    expect(calculateFee('510300', '买入', 1_000)).toBe(5)
    expect(calculateFee('510300', '卖出', 100_000)).toBeCloseTo(15)
  })

  it('does not apply the ETF minimum commission to ordinary A shares', () => {
    expect(calculateFee('600000', '买入', 1_000)).toBeCloseTo(0.15)
  })

  it('adds stamp duty only to ordinary A-share sales', () => {
    expect(calculateFee('600000', '卖出', 1_000)).toBeCloseTo(0.65)
    expect(calculateFee('510300', '卖出', 1_000)).toBe(5)
  })
})
