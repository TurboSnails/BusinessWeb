import React, { useCallback } from 'react'
import { LoadError } from '../../components/ui'
import AnchorNav from './AnchorNav'
import BacktestPanel from './BacktestPanel'
import ConclusionPanel from './ConclusionPanel'
import IndicatorTable from './IndicatorTable'
import OverviewPanel from './OverviewPanel'
import { filterIndicators, useRadarView } from './useRadarView'
import type { RadarState } from './load'
import { STALE_DATA_MESSAGE } from './load'

export default function RadarView({ state, onRetry }: {
  state: RadarState
  onRetry?: () => void
}): JSX.Element {
  if (state.status === 'loading') {
    return <p className="mr-status" role="status">市场雷达加载中…</p>
  }
  if (state.status === 'error') {
    const stale = state.message === STALE_DATA_MESSAGE
    return (
      <LoadError
        testId="mr-error"
        reason={stale ? STALE_DATA_MESSAGE : '市场雷达这份读数现在拿不到。'}
        detail={stale ? undefined : state.message}
        onRetry={onRetry ?? (() => window.location.reload())}
      />
    )
  }

  return <RadarReady data={state.data} />
}

function RadarReady({ data }: { data: import('./types').RadarFile }): JSX.Element {
  const view = useRadarView(data.indicators)
  const { setExpandedId, setDim, setView, view: viewMode } = view
  const overviewItems = filterIndicators(data.indicators, {
    dim: null,
    view: viewMode,
    scoredOnly: false,
  })

  const openIndicator = useCallback((id: string) => {
    setExpandedId(id)
    window.requestAnimationFrame(() => {
      document.getElementById('mr-indicators')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      document.getElementById(`mr-ind-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }, [setExpandedId])

  const filterDimension = useCallback((dim: import('./types').RadarDimensionId) => {
    setDim(dim)
    setView('all')
    window.requestAnimationFrame(() => {
      document.getElementById('mr-indicators')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [setDim, setView])

  return (
    <div className="mr-body">
      <AnchorNav />
      <ConclusionPanel
        data={data}
        onOpenIndicator={openIndicator}
        onFilterDimension={filterDimension}
      />
      <OverviewPanel indicators={overviewItems} onSelect={openIndicator} />
      <IndicatorTable allIndicators={data.indicators} view={view} />
      <BacktestPanel data={data} />
    </div>
  )
}
