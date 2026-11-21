import { describe, expect, it } from 'vitest'
import { judge, type Question, type SummaryItem } from './PlainSummary'
import type { Point, Reading } from './model'

const reading = (history: Point[], frequency = '月频'): Reading => ({ name: 'x', unit: '%', source: '', scope: '', frequency, history })
const item = (id: string, value: number, date = '2026-11-12', frequency = '月频'): SummaryItem => ({ id, name: id, reading: reading([[date, value]], frequency) })
const question = (items: SummaryItem[]): Question => ({ title: 'q', items, offense: '攻', defense: '守', neutral: '中' })
const asOf = '2026-11-20'

describe('judge', () => {
  it('lets one survey cast a single vote however many of its readings appear', () => {
    // AAII cash very low (−2) and AAII bulls low (contrarian +1): only the stronger AAII reading counts.
    const result = judge(question([item('retailCash', 10), item('retailBull', 30, '2026-11-18', '周频')]), asOf)
    expect(result.families).toBe(1)
    expect(result.score).toBe(-2)
    expect(result.votes.filter(vote => vote.counted)).toHaveLength(1)
  })

  it('keeps readings outside their publication window for historical reference only', () => {
    const fresh = judge(question([item('managerCash', 3)]), asOf)
    const stale = judge(question([item('managerCash', 3, '2026-06-30')]), asOf)
    expect(fresh.score).toBe(-2)
    expect(stale.score).toBe(0)
    expect(stale.families).toBe(0)
    expect(stale.votes[0].counted).toBe(false)
    expect(stale.stale).toBe(1)
  })

  it('excludes future observations and not-yet-published readings', () => {
    const pending = item('managerCash', 3)
    pending.reading!.releasedAt = '2026-11-21'
    const result = judge(question([pending, item('retailCash', 10, '2026-12-01')]), asOf)
    expect(result.families).toBe(0)
    expect(result.votes.every(vote => !vote.counted)).toBe(true)
  })

  it('reports missing data instead of a neutral verdict', () => {
    const result = judge(question([{ id: 'retailCash', name: '散户现金' }]), asOf)
    expect(result).toMatchObject({ families: 0, text: '数据不足', lean: 'neutral' })
  })
})

it('derives observation dates only from counted and finite readings', () => {
  const result = judge(question([
    item('managerCash', 3, '2026-10-31'),
    item('retailCash', 10, '2026-11-10'),
    item('retailBull', 30, '2026-11-18', '周频'),
    item('naaim', NaN),
    { name: '未采集' },
  ]), asOf)
  expect(result.periods).toEqual(['2026 年 10 月', '2026 年 11 月'])
  expect(result.counted).toHaveLength(2)
  expect(result.excluded.map(row => [row.item.name, row.reason])).toEqual([
    ['retailBull', '同组已有指标计入'], ['naaim', '暂无有效读数'], ['未采集', '暂无有效读数'],
  ])
})

it('leaves the date range empty when all readings are stale, pending or future-dated', () => {
  const pending = item('managerCash', 3)
  pending.reading!.releasedAt = '2026-11-21'
  const result = judge(question([pending, item('retailCash', 10, '2026-12-01'), item('retailBull', 30, '2026-01-31')]), asOf)
  expect(result.counted).toHaveLength(0)
  expect(result.periods).toEqual([])
  expect(result.excluded.map(row => row.reason)).toEqual(['尚未披露', '日期待核对', '已超过更新周期'])
})
