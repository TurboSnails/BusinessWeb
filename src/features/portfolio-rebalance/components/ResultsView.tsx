import React from 'react'
import { Callout } from '../../../components/ui'
import type { CompareSet, PriceIndex, RunInput, RunResult } from '../types'
import { AutoConclusions } from './AutoConclusions'
import { ComparisonGrid } from './ComparisonGrid'
import { CurrentStatus } from './CurrentStatus'
import { DataNotices } from './DataNotices'
import { EquityChart } from './EquityChart'
import { LeaveOneOut } from './LeaveOneOut'
import { MetricsTable } from './MetricsTable'
import { SwitchEpisodes } from './SwitchEpisodes'
import { TradeLog } from './TradeLog'
import { YearlyReturns } from './YearlyReturns'

export function ResultsView({ comparison, baseline, index, input }: {
  comparison: CompareSet
  baseline?: RunResult
  index: PriceIndex
  input: RunInput
}): JSX.Element {
  const names = Object.fromEntries(index.items.map(item => [item.symbol, item.name]))
  const result = comparison.custom.active
  return (
    <div className="pr-results" id="pr-results">
      <div className="pr-results__status" role="status"><span>回测区间 <strong>{result.start} — {result.end}</strong></span><span>美股涨跌色：收益为正绿色，为负红色；回撤使用正文色。</span></div>
      {result.startAdjusted && <Callout tone="info" title="起点已自动顺延">所选代码与基准的共同交易日从 {result.start} 开始，早于该日的数据不参与本次计算。</Callout>}
      <AutoConclusions comparison={comparison} index={index} input={input} />
      <ComparisonGrid comparison={comparison} />
      <DataNotices index={index} input={input} />
      <SwitchEpisodes result={result} baseline={baseline} input={input} />
      <MetricsTable comparison={comparison} />
      <EquityChart comparison={comparison} />
      <YearlyReturns comparison={comparison} />
      <CurrentStatus result={result} names={names} input={input} />
      <LeaveOneOut comparison={comparison} names={names} input={input} />
      <TradeLog result={result} />
    </div>
  )
}
