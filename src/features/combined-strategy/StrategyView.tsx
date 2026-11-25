import React from 'react'
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

export default function StrategyView({ state }: { state: CombinedStrategyState }): JSX.Element {
  const composite = useCompositePosture()
  const watch = tacticalWatch(composite.status === 'ready' ? composite.data : null)

  if (state.status === 'loading') {
    return <p className="cs-status" role="status">综合策略加载中…</p>
  }
  if (state.status === 'error') {
    return (
      <p className="cs-error" role="alert" data-testid="cs-error">
        综合策略加载失败，请稍后重试。
        {state.message ? `（${state.message}）` : ''}
      </p>
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
