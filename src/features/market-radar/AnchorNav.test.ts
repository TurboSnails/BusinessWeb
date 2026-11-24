import { describe, expect, it } from 'vitest'
import { activeSectionFromTops } from './AnchorNav'

const IDS = ['mr-conclusion', 'mr-overview', 'mr-indicators', 'mr-backtest'] as const

describe('activeSectionFromTops', () => {
  it('以导航下沿为基准，顶边最后越过的区块高亮', () => {
    // 导航下沿 100；总览顶 80 已越过，指标顶 120 未越过 → 高亮总览
    expect(activeSectionFromTops([20, 80, 120, 400], IDS, 100)).toBe('mr-overview')
  })

  it('滚到指标区顶部时高亮指标（不再滞后一格）', () => {
    // 指标顶刚好贴在导航下沿
    expect(activeSectionFromTops([-200, -50, 100, 500], IDS, 100)).toBe('mr-indicators')
    expect(activeSectionFromTops([-200, -50, 99, 500], IDS, 100)).toBe('mr-indicators')
  })

  it('尚未越过任何后续区块时保持结论', () => {
    expect(activeSectionFromTops([120, 400, 700, 1000], IDS, 100)).toBe('mr-conclusion')
  })
})
