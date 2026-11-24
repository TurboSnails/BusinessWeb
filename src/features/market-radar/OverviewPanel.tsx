import React, { useLayoutEffect, useMemo, useRef } from 'react'
import { DIMENSION_ORDER, DIMENSION_TITLE, HEAT_LABEL, statusLabel, visibleText } from './labels'
import type { RadarDimensionId, RadarHeat, RadarIndicator } from './types'

const HEAT_ORDER: RadarHeat[] = ['hot', 'warm', 'neutral', 'cool', 'cold', 'na']

function countHeat(items: readonly RadarIndicator[]): Record<RadarHeat, number> {
  const counts: Record<RadarHeat, number> = { hot: 0, warm: 0, neutral: 0, cool: 0, cold: 0, na: 0 }
  for (const item of items) counts[item.heat] += 1
  return counts
}

function cellSecondLine(item: RadarIndicator): string {
  const reading = visibleText(item.valueText)
  if (item.percentile == null) return reading
  return `${reading} · ${Math.round(item.percentile)} 分位`
}

export default function OverviewPanel({
  indicators,
  onSelect,
}: {
  indicators: readonly RadarIndicator[]
  onSelect: (id: string) => void
}): JSX.Element {
  const heatCounts = useMemo(() => countHeat(indicators), [indicators])
  const segments = useMemo(
    () => HEAT_ORDER.map(heat => ({ heat, n: heatCounts[heat] })).filter(s => s.n > 0),
    [heatCounts],
  )
  const barRef = useRef<HTMLDivElement>(null)
  const byDim = useMemo(() => {
    const map = new Map<RadarDimensionId, RadarIndicator[]>()
    for (const id of DIMENSION_ORDER) map.set(id, [])
    for (const item of indicators) {
      map.get(item.dimension)?.push(item)
    }
    return map
  }, [indicators])

  useLayoutEffect(() => {
    const el = barRef.current
    if (!el) return
    el.style.setProperty('--mr-heat-cols', segments.map(s => `${s.n}fr`).join(' '))
  }, [segments])

  return (
    <section className="mr-overview" id="mr-overview" aria-labelledby="mr-overview-title">
      <h2 id="mr-overview-title">总览</h2>
      <p className="mr-overview__legend">
        热 = 乐观、昂贵、拥挤或景气强；冷相反。冷热不等于加分扣分，带角标的九项才计分。
      </p>

      <div
        className="mr-overview__bar"
        data-testid="mr-overview-counts"
        ref={barRef}
        role="img"
        aria-label={HEAT_ORDER.map(h => `${HEAT_LABEL[h]} ${heatCounts[h]}`).join('，')}
      >
        {segments.map(({ heat, n }) => (
          <div key={heat} className={`mr-overview__bar-seg mr-overview__bar-seg--${heat}`}>
            <span className="mr-overview__bar-num">{n}</span>
            <span className="mr-overview__bar-label">{HEAT_LABEL[heat]}</span>
          </div>
        ))}
      </div>

      <div className="mr-overview__dims" data-testid="mr-overview-grid">
        {DIMENSION_ORDER.map(dimId => {
          const items = byDim.get(dimId) ?? []
          if (!items.length) return null
          return (
            <div key={dimId} className="mr-overview__dim" data-testid={`mr-overview-dim-${dimId}`}>
              <h3 className="mr-overview__dim-title">{DIMENSION_TITLE[dimId]}</h3>
              <div className="mr-overview__cells">
                {items.map(item => {
                  const statusText = statusLabel(item.status, item.ageDays)
                  const striped = item.status !== 'fresh'
                  const aria = [
                    item.label,
                    cellSecondLine(item),
                    HEAT_LABEL[item.heat],
                    item.inScore ? '计分' : '只展示',
                    statusText,
                  ].filter(Boolean).join('，')
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`mr-overview__cell mr-overview__cell--${item.heat}${striped ? ' is-striped' : ''}${item.inScore ? ' is-scored' : ''}`}
                      data-testid={`mr-overview-cell-${item.id}`}
                      aria-label={aria}
                      onClick={() => onSelect(item.id)}
                    >
                      <span className="mr-overview__cell-name">{item.label}</span>
                      <span className="mr-overview__cell-pct">{cellSecondLine(item)}</span>
                      {item.inScore ? <span className="mr-overview__cell-mark" aria-hidden="true">★</span> : null}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
