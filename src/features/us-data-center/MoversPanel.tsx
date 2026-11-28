import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Callout, EmptyState, LoadError, Segmented } from '../../components/ui'
import { parseMovers, usdcUrl, useUsdcQuery } from './api'
import { Loading, MarketTime, RefreshButton } from './DataChrome'
import { formatChange, formatMarketCap, formatPrice, formatVolume, stockPath } from './format'
import type { MoverMode } from './types'

const MODES: { id: MoverMode; label: string }[] = [
  { id: 'gainers', label: '涨幅最大' },
  { id: 'losers', label: '跌幅最大' },
  { id: 'active', label: '成交最活跃' },
  { id: 'surge', label: '成交量激增' },
]

export default function MoversPanel(): JSX.Element {
  const [mode, setMode] = useState<MoverMode>('gainers')
  const { state, retry } = useUsdcQuery(usdcUrl('usdc-movers', { list: mode }), parseMovers)
  return <section className="usdc-panel" aria-labelledby="usdc-movers-title">
    <div className="usdc-panel__head">
      <div><h2 id="usdc-movers-title">异动榜</h2><p>从当日涨跌和成交中找出变化突出的美股。</p></div>
      <RefreshButton onClick={retry} loading={state.status === 'loading'} />
    </div>
    <Segmented label="异动榜类型" items={MODES} value={mode} onChange={setMode} />
    <Callout tone="muted" className="usdc-filter">
      默认只列市值至少 3 亿美元、股价至少 2 美元、在交易所上市的股票（不含场外交易），减少超低价小市值股票带来的噪音。成交量激增指当日成交量达到近 3 个月日均的 3 倍；量比不足 3 倍不会入榜。
    </Callout>
    {state.status === 'loading' && <Loading />}
    {state.status === 'error' && <LoadError detail={state.error} onRetry={retry} />}
    {state.status === 'ready' && <>
      <MarketTime asOf={state.data.asOf} delayedBy={state.data.delayedBy} fetchedAt={state.data.fetchedAt} />
      <p className="usdc-source">来源：Yahoo Finance 公开筛选器。{mode === 'surge' ? '成交量激增从当日成交量前 250 名和涨幅榜、跌幅榜中挑出量比达到 3 倍的股票，成交量更小的个股可能不在其中。' : '每榜最多列 50 只。'}</p>
      {state.data.partial && <Callout tone="warn" className="usdc-filter">部分筛选来源这次没有取到，本榜可能不完整，可稍后刷新。</Callout>}
      {state.data.rows.length === 0 ? <EmptyState title="这一榜暂时没有符合过滤条件的股票"><p>可以稍后刷新，或切换其他榜单。</p></EmptyState> : <div className="usdc-table-wrap">
        <table className="usdc-table usdc-movers-table">
          <caption className="visually-hidden">{MODES.find(item => item.id === mode)?.label}，已按股价和市值过滤</caption>
          <thead><tr><th scope="col">代码</th><th scope="col">名称</th><th scope="col">价格</th><th scope="col">涨跌幅</th><th scope="col">成交量</th><th scope="col">量比</th><th scope="col">市值</th></tr></thead>
          <tbody>{state.data.rows.map(row => <tr key={row.symbol}>
            <th scope="row"><Link className="usdc-symbol" to={stockPath(row.symbol)}>{row.symbol}</Link></th>
            <td data-label="名称" className="usdc-company">{row.name}</td>
            <td data-label="价格">{formatPrice(row.price)}</td>
            <td data-label="涨跌幅" data-change={row.changePct > 0 ? 'up' : row.changePct < 0 ? 'down' : 'flat'}>{formatChange(row.changePct)}</td>
            <td data-label="成交量">{formatVolume(row.volume)}</td>
            <td data-label="量比">{row.volumeRatio === null ? '—' : `${row.volumeRatio.toFixed(2)} 倍`}</td>
            <td data-label="市值">{formatMarketCap(row.marketCap)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </>}
  </section>
}
