import React from 'react'
import AnchorNav from './AnchorNav'
import BacktestPanel from './BacktestPanel'
import ConclusionPanel from './ConclusionPanel'
import IndicatorsPanel from './IndicatorsPanel'
import type { RadarState } from './load'

export default function RadarView({ state }: { state: RadarState }): JSX.Element {
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
      <ConclusionPanel data={data} />
      <IndicatorsPanel data={data} />
      <BacktestPanel data={data} />
    </div>
  )
}
