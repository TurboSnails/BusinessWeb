import type { Backup, GridResult } from './types'
import { positionOf } from './recordMutations'
type Row = { label: string; values: (number | null)[] }
const percent = (value: number, capital: number) => capital > 0 ? value / capital * 100 : null
export function comparisonRows(backup: Backup, pure: GridResult, live: GridResult): Row[] {
  const pureExtra = pure.pnl - backup.pnl, liveExtra = live.pnl - backup.pnl
  const incrementalPure = percent(pureExtra, backup.capital), incrementalLive = percent(liveExtra, backup.capital)
  const pureRate = percent(pure.pnl, pure.maxCapital), liveRate = percent(live.pnl, live.maxCapital)
  const difference = (a: number | null, b: number | null) => a === null || b === null ? null : a - b
  return [
    { label: '总盈亏', values: [backup.pnl, pure.pnl, live.pnl, live.pnl - pure.pnl] },
    { label: '快照后新增盈亏', values: [null, pureExtra, liveExtra, liveExtra - pureExtra] },
    { label: '快照后收益率 %', values: [null, incrementalPure, incrementalLive, difference(incrementalLive, incrementalPure)] },
    { label: '总收益率 %', values: [percent(backup.pnl, backup.maxCapital), pureRate, liveRate, difference(liveRate, pureRate)] },
    { label: '快照后买入次数', values: [null, pure.buys - backup.buys, live.buys - backup.buys, live.buys - pure.buys] },
    { label: '快照后卖出次数', values: [null, pure.sells - backup.sells, live.sells - backup.sells, live.sells - pure.sells] },
    { label: '持仓市值', values: [backup.holding, positionOf(pure) * pure.current, positionOf(live) * live.current, positionOf(live) * live.current - positionOf(pure) * pure.current] },
    { label: '持仓份额', values: [backup.position, positionOf(pure), positionOf(live), positionOf(live) - positionOf(pure)] },
    { label: '占用峰值', values: [backup.maxCapital, pure.maxCapital, live.maxCapital, live.maxCapital - pure.maxCapital] },
  ]
}
