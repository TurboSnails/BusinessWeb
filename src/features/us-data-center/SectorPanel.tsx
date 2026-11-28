import React, { useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState, LoadError } from '../../components/ui'
import { parseSectors, usdcUrl, useUsdcQuery } from './api'
import { Loading, MarketTime, RefreshButton } from './DataChrome'
import { formatChange, stockPath } from './format'
import type { ReturnPeriod, SectorRow } from './types'

const PERIODS: { id: ReturnPeriod; label: string }[] = [
  { id: 'day', label: '1 日' }, { id: 'week', label: '1 周' }, { id: 'month', label: '1 月' },
  { id: 'quarter', label: '3 月' }, { id: 'ytd', label: '年初至今' },
]
type Sort = { key: ReturnPeriod; direction: 'desc' | 'asc' } | null

function heat(value: number | null): string {
  if (value === null || value === 0) return 'flat'
  const level = Math.abs(value) >= 10 ? 4 : Math.abs(value) >= 5 ? 3 : Math.abs(value) >= 2 ? 2 : 1
  return `${value > 0 ? 'up' : 'down'}-${level}`
}

function ReturnCell({ value, label }: { value: number | null; label: string }): JSX.Element {
  return <td data-label={label} className={`usdc-heat usdc-heat--${heat(value)}`} data-change={value === null ? 'flat' : value > 0 ? 'up' : value < 0 ? 'down' : 'flat'}>{formatChange(value)}</td>
}

export default function SectorPanel(): JSX.Element {
  const { state, retry } = useUsdcQuery(usdcUrl('usdc-sectors'), parseSectors)
  const [sort, setSort] = useState<Sort>(null)
  const sortRows = (rows: SectorRow[]): SectorRow[] => {
    if (!sort) return rows
    return [...rows].sort((a, b) => {
      const av = a.returns[sort.key], bv = b.returns[sort.key]
      if (av === null || bv === null) return av === null ? (bv === null ? 0 : 1) : -1
      return sort.direction === 'desc' ? bv - av : av - bv
    })
  }
  const chooseSort = (key: ReturnPeriod): void => setSort(current => current?.key !== key ? { key, direction: 'desc' }
    : current.direction === 'desc' ? { key, direction: 'asc' } : null)
  const renderRow = (row: SectorRow): JSX.Element => <tr key={row.symbol} className={row.group === 'benchmark' ? 'usdc-benchmark' : undefined}>
    <th scope="row"><Link className="usdc-symbol" to={stockPath(row.symbol)}>{row.symbol}</Link><span>{row.name}</span><small>{row.group === 'benchmark' ? '对照' : row.group === 'sector' ? 'SPDR 行业' : '主题'}</small></th>
    {PERIODS.map(period => <ReturnCell key={period.id} value={row.returns[period.id]} label={period.label} />)}
  </tr>
  const latestTime = state.status === 'ready' ? state.data.rows.map(row => row.time).filter((value): value is string => !!value).sort().at(-1) ?? null : null
  const delay = state.status === 'ready' ? Math.max(0, ...state.data.rows.map(row => row.delayedBy ?? 0)) || null : null
  const benchmark = state.status === 'ready' ? state.data.rows.find(row => row.group === 'benchmark') : undefined
  const funds = state.status === 'ready' ? sortRows(state.data.rows.filter(row => row.group !== 'benchmark')) : []
  return <section className="usdc-panel" aria-labelledby="usdc-sectors-title">
    <div className="usdc-panel__head">
      <div><h2 id="usdc-sectors-title">板块追踪</h2><p>用行业与主题 ETF 的价格变化观察强弱，SPY 作为标普 500 对照。</p></div>
      <RefreshButton onClick={retry} loading={state.status === 'loading'} />
    </div>
    <p className="usdc-explain">1 日按上一个交易日收盘价计算；1 周、1 月、3 月按相应日历日前最后一个可得收盘价计算。只比较价格，不含分红。</p>
    {state.status === 'loading' && <Loading label="正在计算板块区间涨跌…" />}
    {state.status === 'error' && <LoadError detail={state.error} onRetry={retry} />}
    {state.status === 'ready' && <>
      <MarketTime asOf={latestTime} delayedBy={delay} fetchedAt={state.data.fetchedAt} />
      <p className="usdc-source">来源：Yahoo Finance 日线。绿色上涨、红色下跌，颜色越深表示幅度越大；点击区间名可排序，缺值排在最后。</p>
      {state.data.rows.length === 0 ? <EmptyState title="暂时没有板块行情"><p>请稍后刷新。</p></EmptyState> : <div className="usdc-table-wrap"><table className="usdc-table usdc-sector-table">
        <caption className="visually-hidden">行业与主题 ETF 区间涨跌，对照 SPY</caption>
        <thead><tr><th scope="col">板块 / ETF</th>{PERIODS.map(period => {
          const active = sort?.key === period.id ? sort.direction : null
          return <th scope="col" key={period.id} aria-sort={active === 'desc' ? 'descending' : active === 'asc' ? 'ascending' : 'none'}>
            <button type="button" onClick={() => chooseSort(period.id)}>{period.label}{active === 'desc' ? <ArrowDown size={13} aria-hidden="true" /> : active === 'asc' ? <ArrowUp size={13} aria-hidden="true" /> : null}<span className="visually-hidden">{active ? (active === 'desc' ? '，当前高到低' : '，当前低到高') : '，点击排序'}</span></button>
          </th>
        })}</tr></thead>
        <tbody>{benchmark && renderRow(benchmark)}{funds.map(renderRow)}</tbody>
      </table></div>}
    </>}
  </section>
}
