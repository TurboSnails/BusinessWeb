import React, { useEffect, useMemo, useRef } from 'react'
import { Segmented } from '../../components/ui'
import { useOverflowFade } from '../../hooks/useOverflowFade'
import { DIMENSION_ORDER, DIMENSION_TITLE } from './labels'
import IndicatorRow from './IndicatorRow'
import type { RadarViewControls, RadarSort } from './useRadarView'
import type { RadarDimensionId, RadarIndicator } from './types'

const DIM_ITEMS: { id: 'all' | RadarDimensionId; label: string }[] = [
  { id: 'all', label: '全部' },
  ...DIMENSION_ORDER.map(id => ({ id, label: DIMENSION_TITLE[id] })),
]

const SORT_ITEMS: { id: RadarSort; label: string }[] = [
  { id: 'default', label: '默认' },
  { id: 'hot', label: '最热在前' },
  { id: 'cold', label: '最冷在前' },
  { id: 'recent', label: '最近更新' },
]

function groupByGroup(items: RadarIndicator[]): { group: string; items: RadarIndicator[] }[] {
  const groups: { group: string; items: RadarIndicator[] }[] = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (last && last.group === item.group) last.items.push(item)
    else groups.push({ group: item.group, items: [item] })
  }
  return groups
}

export default function IndicatorTable({
  allIndicators,
  view,
}: {
  allIndicators: readonly RadarIndicator[]
  view: RadarViewControls
}): JSX.Element {
  const {
    dim, view: viewMode, scoredOnly, sort, expandedId, visible,
    setDim, setView, setScoredOnly, setSort, setExpandedId, clearFilters,
  } = view
  const showGroups = sort === 'default'
  const listRef = useRef<HTMLDivElement>(null)
  const dimFade = useOverflowFade<HTMLDivElement>()

  const coreCount = useMemo(() => allIndicators.filter(i => i.core).length, [allIndicators])
  const allCount = allIndicators.length

  useEffect(() => {
    if (!expandedId) return
    const el = document.getElementById(`mr-ind-${expandedId}`)
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [expandedId])

  const body = showGroups
    ? groupByGroup(visible).map(({ group, items }) => (
      <div key={`${items[0]?.dimension ?? ''}:${group}`} className="mr-ind-table__group">
        <h3 className="mr-ind-table__group-title">{group}</h3>
        {items.map(item => (
          <IndicatorRow
            key={item.id}
            item={item}
            expanded={expandedId === item.id}
            onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
          />
        ))}
      </div>
    ))
    : visible.map(item => (
      <IndicatorRow
        key={item.id}
        item={item}
        expanded={expandedId === item.id}
        onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
      />
    ))

  return (
    <section className="mr-indicators" id="mr-indicators" aria-labelledby="mr-indicators-title">
      <h2 id="mr-indicators-title">指标</h2>
      <p className="mr-muted">点任一行，看规则、变化和带规则线的历史图。</p>

      <div className="mr-ind-toolbar" data-testid="mr-ind-toolbar">
        <div className="mr-ind-toolbar__block mr-ind-toolbar__block--dim">
          <span className="mr-ind-toolbar__label" id="mr-filter-dim-label">维度</span>
          <div className="mr-ind-toolbar__dim-scroll" ref={dimFade.ref} onScroll={dimFade.sync}>
            <Segmented
              label="维度"
              items={DIM_ITEMS}
              value={dim ?? 'all'}
              onChange={id => setDim(id === 'all' ? null : id)}
            />
          </div>
        </div>

        <div className="mr-ind-toolbar__row2">
          <div className="mr-ind-toolbar__block">
            <span className="mr-ind-toolbar__label" id="mr-filter-view-label">范围</span>
            <Segmented
              label="范围"
              items={[
                { id: 'core' as const, label: `核心 ${coreCount}` },
                { id: 'all' as const, label: `全部 ${allCount}` },
              ]}
              value={viewMode}
              onChange={setView}
            />
          </div>

          <label className="mr-ind-toolbar__check">
            <input
              type="checkbox"
              checked={scoredOnly}
              onChange={e => setScoredOnly(e.target.checked)}
              data-testid="mr-filter-scored"
            />
            只看计分
          </label>

          <div className="mr-ind-toolbar__block mr-ind-toolbar__block--sort">
            <span className="mr-ind-toolbar__label" id="mr-filter-sort-label">排序</span>
            <div className="mr-ind-toolbar__sort-seg">
              <Segmented
                label="排序"
                items={SORT_ITEMS}
                value={sort}
                onChange={setSort}
              />
            </div>
            <select
              className="mr-ind-toolbar__sort-select"
              aria-labelledby="mr-filter-sort-label"
              value={sort}
              onChange={e => setSort(e.target.value as RadarSort)}
              data-testid="mr-sort-select"
            >
              {SORT_ITEMS.map(item => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mr-ind-table" data-testid="mr-ind-table" ref={listRef}>
        <div className="mr-ind-table__head" aria-hidden="true">
          <span>指标</span>
          <span>读数</span>
          <span>变化</span>
          <span>历史位置</span>
          <span>冷热</span>
          <span>走势</span>
          <span>更新</span>
        </div>
        {visible.length === 0 ? (
          <div className="mr-ind-table__empty" data-testid="mr-ind-empty">
            <p>没有符合条件的指标</p>
            <button type="button" className="mr-ind-table__clear" onClick={clearFilters}>
              清除筛选
            </button>
          </div>
        ) : (
          body
        )}
      </div>

      {DIMENSION_ORDER.map(dimId => {
        const has = allIndicators.some(i => i.dimension === dimId)
        return has ? <div key={dimId} data-testid={`mr-ind-group-${dimId}`} hidden /> : null
      })}
    </section>
  )
}
