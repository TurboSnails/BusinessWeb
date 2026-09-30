import { expect, it } from 'vitest'
import fixture from './parityFixture.json'
import { calculateGrid } from './simulation'
import type { Adjustments } from './types'

it('matches the frozen source algorithm fixture across all account metrics', () => {
  const actual = calculateGrid(fixture.row, fixture.candles, fixture.adjustments as Adjustments)
  for (const [key, expected] of Object.entries(fixture.expected)) {
    const value = actual[key as keyof typeof actual]
    if (typeof expected === 'number') expect(value).toBeCloseTo(expected, 8)
    else expect(value).toBe(expected)
  }
})
