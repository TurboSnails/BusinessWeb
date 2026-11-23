import React from 'react'
import AnchorNav from './AnchorNav'
import BacktestPanel from './BacktestPanel'
import CandidatesPanel from './CandidatesPanel'
import ConclusionCard from './ConclusionCard'
import MarketPanel from './MarketPanel'
import MastersOutlook from './MastersOutlook'
import MethodNotes from './MethodNotes'
import OuterRing from './OuterRing'
import PillarsSection from './PillarsSection'
import TacticalBreakers from './TacticalBreakers'
import type { CompositeState } from './types'

export default function UsCompositeView({ state }: { state: CompositeState }): JSX.Element {
  if (state.status === 'loading') {
    return <p className="mp-status" role="status">宏观攻守综合指标加载中…</p>
  }
  if (state.status === 'error') {
    return (
      <p className="mp-error" role="alert">
        宏观攻守综合指标加载失败，请稍后重试。
        {state.message ? `（${state.message}）` : ''}
      </p>
    )
  }

  const { data } = state
  return (
    <div className="mp-composite">
      <AnchorNav />
      <ConclusionCard data={data} />
      <PillarsSection pillars={data.current.pillars} />
      <MarketPanel />
      <TacticalBreakers current={data.current} />
      <OuterRing items={data.outer} />
      <MastersOutlook siteTier={data.current.final.tier} />
      <BacktestPanel data={data} />
      <CandidatesPanel />
      <MethodNotes data={data} />
    </div>
  )
}
