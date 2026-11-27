import React from 'react'
import { LoadError } from '../../components/ui'
import AnchorNav from './AnchorNav'
import MatrixPanel from './MatrixPanel'
import NowPanel from './NowPanel'
import PositionPanel from './PositionPanel'
import ResearchPanel from './ResearchPanel'
import RulesPanel from './RulesPanel'
import TriggersPanel from './TriggersPanel'
import WhyPanel from './WhyPanel'
import { useCompositePosture } from '../macro-posture/composite/load'
import { tacticalWatch } from './watch'
import type { CombinedStrategyState } from './load'

export default function StrategyView({ state, onRetry }: {
  state: CombinedStrategyState
  onRetry?: () => void
}): JSX.Element {
  const composite = useCompositePosture()
  const watch = tacticalWatch(composite.status === 'ready' ? composite.data : null)

  if (state.status === 'loading') {
    return <p className="cs-status" role="status">综合策略加载中…</p>
  }
  if (state.status === 'error') {
    return (
      <LoadError
        testId="cs-error"
        reason="综合策略这份读数现在拿不到。"
        detail={state.message}
        onRetry={onRetry ?? (() => window.location.reload())}
      />
    )
  }

  const { data } = state
  return (
    <div className="cs-body">
      <AnchorNav />
      <NowPanel data={data} watch={watch} />
      <PositionPanel data={data} />
      <WhyPanel data={data} />
      <TriggersPanel />
      <RulesPanel data={data} />
      <MatrixPanel data={data} />
      <ResearchPanel data={data} />
    </div>
  )
}
