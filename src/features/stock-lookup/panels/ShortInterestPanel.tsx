import React from 'react'
import { Stat, StatGrid } from '../../../components/ui'
import type { ShortInterestData, StockLookupApi } from '../types'
import { changeTone, fmtPct, fmtRatioPct, fmtSignedShares, fmtVolume } from './format'
import { shortChange, shortLevel } from './shortInterest'
import { parseLookupSymbol } from './symbolParse'
import { UsBlockCard } from './UsBlockCard'
import { useUsBlock } from './useUsBlock'

export function ShortInterestPanel({ symbol, api }: { symbol: string; api: StockLookupApi }): JSX.Element {
  const usOnly = (parseLookupSymbol(symbol)?.market ?? 'us') === 'us'
  const state = useUsBlock(usOnly, symbol, api, signal => api.shortInterest(symbol, signal))
  return (
    <UsBlockCard
      title="做空数据（空头持仓）"
      className="sl-short"
      description="截至结算日，市场上借股卖出、还没买回来的股数。每月公布两次。"
      usOnly={usOnly}
      label="做空数据"
      state={state}
      isEmpty={d => d.sharesShort == null}
      emptyTitle="暂无空头持仓数据"
      emptyText="新上市或成交很少的股票，数据源可能还没有统计。"
    >
      {d => <ShortBody data={d} />}
    </UsBlockCard>
  )
}

function ShortBody({ data }: { data: ShortInterestData }): JSX.Element {
  const chg = shortChange(data)
  const level = shortLevel(data.pctFloat)
  return (
    <div className="sl-us__body">
      <StatGrid className="sl-us__stats">
        <Stat
          label="空头股数"
          value={`${fmtVolume(data.sharesShort ?? 0)} 股`}
          sub={data.settleDate ? `结算日 ${data.settleDate}` : undefined}
        />
        <Stat
          label="占流通股"
          value={data.pctFloat != null ? fmtRatioPct(data.pctFloat) : '—'}
          sub={level ?? (data.pctOutstanding != null ? `占总股本 ${fmtRatioPct(data.pctOutstanding)}` : undefined)}
        />
        <Stat
          label="回补天数"
          value={data.daysToCover != null ? `${data.daysToCover.toFixed(1)} 天` : '—'}
          sub="按近期日均成交量，空头全部买回要几天"
        />
        <Stat
          label="较上期变化"
          value={chg ? <span className={`sl-chg sl-chg--${changeTone(chg.delta)}`}>{fmtSignedShares(chg.delta)} 股</span> : '—'}
          sub={chg ? `${chg.pct != null ? fmtPct(chg.pct) : ''}${data.priorSettleDate ? `（上期 ${data.priorSettleDate}）` : ''}` : undefined}
        />
      </StatGrid>
      <p className="sl-muted">
        和上面「场外成交与做空量」的区别：那里是每天新发生的卖空成交量（当天卖出时借了股，很多当天就买回），反映的是交易流水；
        这里是某个结算日还没平掉的空头存量，半个月才更新一次，更能说明看空仓位有多重。两者数字不能直接比较。
      </p>
      <p className="sl-muted">数据出处：{data.source}。公布通常比结算日晚约一周。</p>
    </div>
  )
}
