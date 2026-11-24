import { describe, expect, it } from 'vitest'
import { radarFixture } from './fixture'
import {
  applyRadarView,
  filterIndicators,
  parseRadarView,
  radarViewToSearchParams,
  revealForIndicator,
  sortIndicators,
  type RadarViewState,
} from './useRadarView'

const indicators = radarFixture().indicators
const ids = new Set(indicators.map(i => i.id))

const defaults: RadarViewState = {
  dim: null,
  view: 'core',
  scoredOnly: false,
  sort: 'default',
  expandedId: null,
}

describe('parseRadarView / radarViewToSearchParams', () => {
  it('默认值不写入网址', () => {
    const params = radarViewToSearchParams(defaults)
    expect([...params.keys()]).toEqual([])
  })

  it('写入非默认值并解析回来', () => {
    const state: RadarViewState = {
      dim: 'valuation',
      view: 'all',
      scoredOnly: true,
      sort: 'hot',
      expandedId: 'vix',
    }
    const params = radarViewToSearchParams(state)
    expect(params.get('dim')).toBe('valuation')
    expect(params.get('view')).toBe('all')
    expect(params.get('scored')).toBe('1')
    expect(params.get('sort')).toBe('hot')
    expect(params.get('ind')).toBe('vix')
    expect(parseRadarView(params, ids)).toEqual(state)
  })

  it('无效网址参数被忽略', () => {
    const params = new URLSearchParams('dim=foo&view=zzz&sort=abc&ind=%E4%B8%8D%E5%AD%98%E5%9C%A8&scored=yes')
    expect(parseRadarView(params, ids)).toEqual(defaults)
  })

  it('不存在的 ind 被忽略', () => {
    const params = new URLSearchParams('ind=not-an-indicator')
    expect(parseRadarView(params, ids).expandedId).toBeNull()
  })
})

describe('filterIndicators / sortIndicators', () => {
  it('核心视图只留 core', () => {
    const filtered = filterIndicators(indicators, { dim: null, view: 'core', scoredOnly: false })
    expect(filtered.every(i => i.core)).toBe(true)
    expect(filtered.some(i => i.id === 'reserves')).toBe(false)
  })

  it('维度 + 只看计分', () => {
    const filtered = filterIndicators(indicators, { dim: 'valuation', view: 'all', scoredOnly: true })
    expect(filtered.map(i => i.id).sort()).toEqual(['erp', 'pe'])
  })

  it('最热在前：按 heatRank 降序，无 heatRank 排最后', () => {
    const sorted = sortIndicators(indicators, 'hot')
    const ranks = sorted.map(i => i.heatRank)
    const withRank = ranks.filter((r): r is number => r != null)
    for (let i = 1; i < withRank.length; i++) expect(withRank[i - 1]).toBeGreaterThanOrEqual(withRank[i])
    const firstNull = ranks.findIndex(r => r == null)
    if (firstNull >= 0) {
      expect(ranks.slice(firstNull).every(r => r == null)).toBe(true)
    }
    expect(sorted[0].id).toBe('cashShare') // heatRank 98
  })

  it('最冷在前：按 heatRank 升序，无 heatRank 排最后', () => {
    const sorted = sortIndicators(indicators, 'cold')
    const withRank = sorted.filter(i => i.heatRank != null)
    for (let i = 1; i < withRank.length; i++) {
      expect(withRank[i - 1].heatRank!).toBeLessThanOrEqual(withRank[i].heatRank!)
    }
    expect(sorted[sorted.length - 1].heatRank).toBeNull()
  })

  it('最近更新按 observedOn 倒序', () => {
    const sorted = sortIndicators(indicators, 'recent')
    const dated = sorted.filter(i => i.observedOn)
    for (let i = 1; i < dated.length; i++) {
      expect(dated[i - 1].observedOn! >= dated[i].observedOn!).toBe(true)
    }
    expect(sorted[sorted.length - 1].observedOn).toBeNull()
  })

  it('空筛选结果为空数组', () => {
    const visible = applyRadarView(indicators, {
      ...defaults,
      dim: 'earnings',
      scoredOnly: true,
      view: 'core',
    })
    const empty = applyRadarView(
      indicators.filter(i => i.dimension === 'earnings' && !i.inScore),
      { ...defaults, dim: 'earnings', scoredOnly: true, view: 'all' },
    )
    expect(empty).toEqual([])
    expect(visible.some(i => i.id === 'epsYoy')).toBe(true)
  })
})

describe('revealForIndicator', () => {
  it('核心视图点非核心指标时切到全部并清维度', () => {
    const next = revealForIndicator(indicators, {
      ...defaults,
      view: 'core',
      dim: 'valuation',
      scoredOnly: true,
    }, 'reserves')
    expect(next).toMatchObject({
      expandedId: 'reserves',
      view: 'all',
      dim: null,
      scoredOnly: false,
    })
  })
})
