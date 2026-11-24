import React from 'react'
import MarketPanel from '../market-radar/market/MarketPanel'
import AnchorNav from './AnchorNav'
import FusionPanel from './FusionPanel'
import MatrixPanel from './MatrixPanel'
import NowPanel from './NowPanel'
import RulesPanel from './RulesPanel'
import TimelinePanel from './TimelinePanel'
import type { CombinedStrategyState } from './load'

const MARKET_NOTE =
  '这是更早的一次融合检验：先用股市内部与估值指标单独定档回测，再把它作为第五根支柱并入宏观攻守。结果同样没有达到采用门槛。'

export default function StrategyView({ state }: { state: CombinedStrategyState }): JSX.Element {
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
      <NowPanel data={data} />
      <RulesPanel data={data} />
      <MatrixPanel data={data} />
      <FusionPanel data={data} />
      <TimelinePanel data={data} />
      <MarketPanel intro={MARKET_NOTE} />
    </div>
  )
}
