import React from 'react'
import AnchorNav from './AnchorNav'
import BacktestPanel from './BacktestPanel'
import ConclusionPanel from './ConclusionPanel'
import IndicatorsPanel from './IndicatorsPanel'
import MarketPanel from './market/MarketPanel'
import type { RadarState } from './load'
import type { TierId } from '../macro-posture/composite/types'

export default function RadarView({
  state,
  mastersTier,
}: {
  state: RadarState
  mastersTier: TierId | null
}): JSX.Element {
  if (state.status === 'loading') {
    return <p className="mr-status" role="status">市场雷达加载中…</p>
  }
  if (state.status === 'error') {
    return (
      <p className="mr-error" role="alert" data-testid="mr-error">
        市场雷达加载失败，请稍后重试。
        {state.message ? `（${state.message}）` : ''}
      </p>
    )
  }

  const { data } = state
  return (
    <div className="mr-body">
      <AnchorNav />
      <ConclusionPanel data={data} mastersTier={mastersTier} />
      <IndicatorsPanel data={data} />
      <BacktestPanel data={data} />
      <MarketPanel />
    </div>
  )
}
