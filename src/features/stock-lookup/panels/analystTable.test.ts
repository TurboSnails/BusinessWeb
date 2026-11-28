import { describe, expect, it } from 'vitest'
import type { AnalystAction } from '../types'
import { clampPage, pageCount, slicePage, sortActionsDesc, withUpside } from './analystTable'

const actions: AnalystAction[] = [
  { date: '2026-11-01', firm: 'A', action: 'main', target: 90 },
  { date: '2026-11-20', firm: 'B', action: 'up', target: 100 },
  { date: '2026-11-10', firm: 'C', action: 'down', target: 80 },
]

describe('analystTable', () => {
  it('按日期倒序', () => {
    expect(sortActionsDesc(actions).map(a => a.firm)).toEqual(['B', 'C', 'A'])
  })

  it('相对现价空间', () => {
    const rows = withUpside(actions, 50)
    expect(rows[0].upsidePct).toBeCloseTo(100)
  })

  it('分页', () => {
    const many = Array.from({ length: 45 }, (_, i) => ({
      date: `2026-11-${String((i % 28) + 1).padStart(2, '0')}`,
      firm: `F${i}`,
      action: 'main' as const,
    }))
    expect(pageCount(many.length)).toBe(3)
    expect(slicePage(many, 2)).toHaveLength(20)
    expect(slicePage(many, 3)).toHaveLength(5)
    expect(clampPage(99, many.length)).toBe(3)
  })
})
