import React from 'react'
import { Link } from 'react-router-dom'
import { LoadError } from '../../../components/ui'
import AnchorNav from './AnchorNav'
import BacktestPanel from './BacktestPanel'
import CandidatesPanel from './CandidatesPanel'
import ConclusionCard from './ConclusionCard'
import MastersOutlook from './MastersOutlook'
import MethodNotes from './MethodNotes'
import OuterRing from './OuterRing'
import PillarsSection from './PillarsSection'
import TacticalBreakers from './TacticalBreakers'
import type { CompositeState } from './types'

function MarketRadarCard(): JSX.Element {
  return (
    <aside className="mp-market-radar-card" data-testid="mp-market-radar-card" aria-label="股市内部与仓位指标">
      <p>股市内部与仓位指标见市场雷达。</p>
      <p>
        <Link to="/invest/market-radar">打开市场雷达</Link>
      </p>
    </aside>
  )
}

export default function UsCompositeView({ state, onRetry }: {
  state: CompositeState
  onRetry?: () => void
}): JSX.Element {
  if (state.status === 'loading') {
    return <p className="mp-status" role="status">宏观攻守综合指标加载中…</p>
  }
  if (state.status === 'error') {
    return (
      <LoadError
        reason="宏观攻守综合指标这份读数现在拿不到。"
        detail={state.message}
        onRetry={onRetry ?? (() => window.location.reload())}
      />
    )
  }

  const { data } = state
  return (
    <div className="mp-composite">
      <AnchorNav />
      <ConclusionCard data={data} />
      <PillarsSection pillars={data.current.pillars} />
      <MarketRadarCard />
      <TacticalBreakers current={data.current} />
      <OuterRing items={data.outer} />
      <MastersOutlook siteTier={data.current.final.tier} />
      <BacktestPanel data={data} />
      <CandidatesPanel />
      <MethodNotes data={data} />
    </div>
  )
}
