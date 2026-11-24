import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DIMENSION_ORDER } from './labels'
import type { RadarDimensionId, RadarIndicator } from './types'

export type RadarViewMode = 'core' | 'all'
export type RadarSort = 'default' | 'hot' | 'cold' | 'recent'

export type RadarViewState = {
  dim: RadarDimensionId | null
  view: RadarViewMode
  scoredOnly: boolean
  sort: RadarSort
  expandedId: string | null
}

const VIEW_VALUES = new Set<RadarViewMode>(['core', 'all'])
const SORT_VALUES = new Set<RadarSort>(['default', 'hot', 'cold', 'recent'])
const DIM_VALUES = new Set<string>(DIMENSION_ORDER)

export function parseRadarView(params: URLSearchParams, indicatorIds: ReadonlySet<string>): RadarViewState {
  const rawDim = params.get('dim')
  const dim = rawDim && DIM_VALUES.has(rawDim) ? (rawDim as RadarDimensionId) : null

  const rawView = params.get('view')
  const view: RadarViewMode = rawView && VIEW_VALUES.has(rawView as RadarViewMode)
    ? (rawView as RadarViewMode)
    : 'core'

  const scoredOnly = params.get('scored') === '1'

  const rawSort = params.get('sort')
  const sort: RadarSort = rawSort && SORT_VALUES.has(rawSort as RadarSort)
    ? (rawSort as RadarSort)
    : 'default'

  const rawInd = params.get('ind')
  const expandedId = rawInd && indicatorIds.has(rawInd) ? rawInd : null

  return { dim, view, scoredOnly, sort, expandedId }
}

/** 默认值不写入网址 */
export function radarViewToSearchParams(state: RadarViewState): URLSearchParams {
  const next = new URLSearchParams()
  if (state.dim) next.set('dim', state.dim)
  if (state.view !== 'core') next.set('view', state.view)
  if (state.scoredOnly) next.set('scored', '1')
  if (state.sort !== 'default') next.set('sort', state.sort)
  if (state.expandedId) next.set('ind', state.expandedId)
  return next
}

export function filterIndicators(
  indicators: readonly RadarIndicator[],
  state: Pick<RadarViewState, 'dim' | 'view' | 'scoredOnly'>,
): RadarIndicator[] {
  return indicators.filter(item => {
    if (state.dim && item.dimension !== state.dim) return false
    if (state.view === 'core' && !item.core) return false
    if (state.scoredOnly && !item.inScore) return false
    return true
  })
}

function heatRankOrLast(item: RadarIndicator): number {
  return item.heatRank == null ? Number.NEGATIVE_INFINITY : item.heatRank
}

export function sortIndicators(
  indicators: readonly RadarIndicator[],
  sort: RadarSort,
): RadarIndicator[] {
  if (sort === 'default') return [...indicators]
  const copy = [...indicators]
  if (sort === 'hot') {
    copy.sort((a, b) => {
      const ha = heatRankOrLast(a)
      const hb = heatRankOrLast(b)
      if (ha === hb) return 0
      // 无 heatRank 的排最后：NEG_INF 比任何真实值小
      if (a.heatRank == null && b.heatRank == null) return 0
      if (a.heatRank == null) return 1
      if (b.heatRank == null) return -1
      return hb - ha
    })
    return copy
  }
  if (sort === 'cold') {
    copy.sort((a, b) => {
      if (a.heatRank == null && b.heatRank == null) return 0
      if (a.heatRank == null) return 1
      if (b.heatRank == null) return -1
      return a.heatRank - b.heatRank
    })
    return copy
  }
  // recent：observedOn 倒序；无日期排最后
  copy.sort((a, b) => {
    if (!a.observedOn && !b.observedOn) return 0
    if (!a.observedOn) return 1
    if (!b.observedOn) return -1
    return b.observedOn.localeCompare(a.observedOn)
  })
  return copy
}

export function applyRadarView(
  indicators: readonly RadarIndicator[],
  state: RadarViewState,
): RadarIndicator[] {
  return sortIndicators(filterIndicators(indicators, state), state.sort)
}

/** 展开某指标时，把筛选切到能看见它（范围全部、清维度、取消只看计分） */
export function revealForIndicator(
  indicators: readonly RadarIndicator[],
  state: RadarViewState,
  id: string,
): RadarViewState {
  const item = indicators.find(i => i.id === id)
  if (!item) return { ...state, expandedId: null }
  const next: RadarViewState = { ...state, expandedId: id }
  if (next.view === 'core' && !item.core) next.view = 'all'
  if (next.dim && next.dim !== item.dimension) next.dim = null
  if (next.scoredOnly && !item.inScore) next.scoredOnly = false
  return next
}

export type RadarViewControls = RadarViewState & {
  setDim: (dim: RadarDimensionId | null) => void
  setView: (view: RadarViewMode) => void
  setScoredOnly: (on: boolean) => void
  setSort: (sort: RadarSort) => void
  setExpandedId: (id: string | null) => void
  clearFilters: () => void
  visible: RadarIndicator[]
}

export function useRadarView(indicators: readonly RadarIndicator[]): RadarViewControls {
  const [params, setParams] = useSearchParams()
  const ids = useMemo(() => new Set(indicators.map(i => i.id)), [indicators])
  const parsed = useMemo(() => parseRadarView(params, ids), [params, ids])
  const state = useMemo(() => {
    if (!parsed.expandedId) return parsed
    return revealForIndicator(indicators, parsed, parsed.expandedId)
  }, [parsed, indicators])
  const visible = useMemo(() => applyRadarView(indicators, state), [indicators, state])

  const write = useCallback((nextState: RadarViewState) => {
    setParams(radarViewToSearchParams(nextState), { replace: true })
  }, [setParams])

  const patch = useCallback((partial: Partial<RadarViewState>) => {
    write({ ...state, ...partial })
  }, [state, write])

  return {
    ...state,
    visible,
    setDim: dim => patch({ dim }),
    setView: view => patch({ view }),
    setScoredOnly: scoredOnly => patch({ scoredOnly }),
    setSort: sort => patch({ sort }),
    setExpandedId: expandedId => {
      if (!expandedId) {
        patch({ expandedId: null })
        return
      }
      write(revealForIndicator(indicators, state, expandedId))
    },
    clearFilters: () => write({ dim: null, view: 'core', scoredOnly: false, sort: 'default', expandedId: null }),
  }
}
