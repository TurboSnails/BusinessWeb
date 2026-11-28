import React from 'react'
import { ExternalLink } from 'lucide-react'
import { EmptyState, LoadError, Stat, StatGrid } from '../../components/ui'
import { parsePutCall, usdcUrl, useUsdcQuery } from './api'
import { Loading, RefreshButton } from './DataChrome'
import { formatNyTime, formatVolume } from './format'
import type { PricePoint, PutCallData, PutCallRatio } from './types'

const W = 760, H = 280, LEFT = 48, RIGHT = 52, TOP = 22, BOTTOM = 38
const ratioValue = (row: PutCallData['rows'][number], key: 'total' | 'equity' | 'index') => row[key].ratio

function PutCallChart({ data }: { data: PutCallData }): JSX.Element {
  const rows = data.rows
  const spyByDate = new Map(data.spy.map(point => [point.date, point.close]))
  const firstSpy = rows.map(row => spyByDate.get(row.date)).find((value): value is number => !!value)
  const normalizedSpy = rows.map(row => {
    const close = spyByDate.get(row.date)
    return close && firstSpy ? close / firstSpy * 100 : null
  })
  const ratios = rows.flatMap(row => [row.total.ratio, row.equity.ratio, row.index.ratio])
  const ratioMin = Math.min(...ratios), ratioMax = Math.max(...ratios)
  const ratioPad = Math.max((ratioMax - ratioMin) * 0.12, 0.08)
  const lo = Math.max(0, ratioMin - ratioPad), hi = ratioMax + ratioPad
  const spyValues = normalizedSpy.filter((value): value is number => value !== null)
  const spyLo = Math.min(...spyValues), spyHi = Math.max(...spyValues)
  const spyPad = Math.max((spyHi - spyLo) * 0.1, 1)
  const x = (index: number) => LEFT + (index / Math.max(rows.length - 1, 1)) * (W - LEFT - RIGHT)
  const y = (value: number) => TOP + (1 - (value - lo) / (hi - lo)) * (H - TOP - BOTTOM)
  const sy = (value: number) => TOP + (1 - (value - spyLo + spyPad) / (spyHi - spyLo + 2 * spyPad)) * (H - TOP - BOTTOM)
  const path = (values: (number | null)[], scale: (value: number) => number) => values.map((value, index) => value === null ? '' : `${index && values[index - 1] !== null ? 'L' : 'M'}${x(index).toFixed(1)},${scale(value).toFixed(1)}`).join('')
  const latest = rows.at(-1)!
  const lastSpy = normalizedSpy.at(-1)
  const ticks = [lo, (lo + hi) / 2, hi]
  const dateIndexes = [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])]
  return <figure className="usdc-pc-chart">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${rows[0].date} 至 ${latest.date} 的每日看跌看涨比。最新总量 ${latest.total.ratio.toFixed(2)}、股票 ${latest.equity.ratio.toFixed(2)}、指数 ${latest.index.ratio.toFixed(2)}；SPY 区间价格变化 ${lastSpy == null ? '无数据' : `${(lastSpy - 100).toFixed(2)}%`}。`}>
      {ticks.map(tick => <g key={tick}>
        <line className="usdc-chart-grid" x1={LEFT} x2={W - RIGHT} y1={y(tick)} y2={y(tick)} />
        <text className="usdc-chart-tick" x={LEFT - 8} y={y(tick) + 4} textAnchor="end">{tick.toFixed(2)}</text>
        <text className="usdc-chart-tick usdc-chart-tick--spy" x={W - RIGHT + 8} y={y(tick) + 4}>{(spyLo - spyPad + (1 - (y(tick) - TOP) / (H - TOP - BOTTOM)) * (spyHi - spyLo + 2 * spyPad)).toFixed(0)}</text>
      </g>)}
      <text className="usdc-chart-axis-title" x={LEFT} y={12}>比值</text><text className="usdc-chart-axis-title" x={W - RIGHT} y={12} textAnchor="end">SPY 起点=100</text>
      {(['total', 'equity', 'index'] as const).map(key => <path key={key} className={`usdc-pc-line usdc-pc-line--${key}`} d={path(rows.map(row => ratioValue(row, key)), y)} />)}
      <path className="usdc-pc-line usdc-pc-line--spy" d={path(normalizedSpy, sy)} />
      {dateIndexes.map(index => <text key={index} className="usdc-chart-date" x={x(index)} y={H - 10} textAnchor={index === 0 ? 'start' : index === rows.length - 1 ? 'end' : 'middle'}>{rows[index].date}</text>)}
    </svg>
    <figcaption><ul className="usdc-pc-legend">
      <li data-series="total">总量</li><li data-series="equity">股票期权</li><li data-series="index">指数期权</li><li data-series="spy">SPY（右轴，起点设为 100）</li>
    </ul><p>比值按左轴读取；SPY 只用于对照同段价格方向，不与比值共用刻度。缺少同日 SPY 收盘时，该线段断开。</p></figcaption>
  </figure>
}

function RatioStat({ label, value }: { label: string; value: PutCallRatio }): JSX.Element {
  return <Stat label={label} value={value.ratio.toFixed(2)} sub={<span>看跌 {formatVolume(value.putVolume)} 张 · 看涨 {formatVolume(value.callVolume)} 张</span>} />
}

function spyCloseAt(spy: PricePoint[], date: string): number | null {
  return spy.find(point => point.date === date)?.close ?? null
}

export default function PutCallPanel(): JSX.Element {
  const { state, retry } = useUsdcQuery(usdcUrl('usdc-putcall'), parsePutCall)
  const latest = state.status === 'ready' ? state.data.rows.at(-1) : undefined
  return <section className="usdc-panel" aria-labelledby="usdc-putcall-title">
    <div className="usdc-panel__head">
      <div><h2 id="usdc-putcall-title">全市场看跌 / 看涨比</h2><p>每天看跌期权成交量除以看涨期权成交量，分别看总量、股票期权和指数期权。</p></div>
      <RefreshButton onClick={retry} loading={state.status === 'loading'} />
    </div>
    <p className="usdc-explain">比值升高表示当日看跌成交相对更多，降低则表示看涨成交相对更多；它只是成交结构，不单独代表后市方向。</p>
    {state.status === 'loading' && <Loading label="正在核对 Cboe 逐日统计…" />}
    {state.status === 'error' && <LoadError reason="Cboe 每日统计暂时取不到，请稍后重试。" detail={state.error} onRetry={retry} />}
    {state.status === 'ready' && <>
      <p className="usdc-meta">统计日期：{state.data.asOf}（纽约交易日）<span>本页取数：{formatNyTime(state.data.fetchedAt)}（纽约时间） · 收盘后发布，不是实时数据</span></p>
      <p className="usdc-source">来源：<a href={state.data.sourceUrl} target="_blank" rel="noreferrer">Cboe 每日期权市场统计<ExternalLink size={12} aria-hidden="true" /></a>。展示最近 {state.data.rows.length} 个可得交易日；SPY 来自 Yahoo Finance。</p>
      {!latest ? <EmptyState title="暂时没有可用的每日统计"><p>请稍后刷新。</p></EmptyState> : <>
        <StatGrid className="usdc-pc-stats"><RatioStat label="总量" value={latest.total} /><RatioStat label="股票期权" value={latest.equity} /><RatioStat label="指数期权" value={latest.index} /></StatGrid>
        {state.data.rows.length >= 2 && <PutCallChart data={state.data} />}
        <p className="usdc-note">Cboe 官方旧下载表停在 2019 年，本图改用仍可按日期查询的官方每日页面，不用旧表冒充近期历史。个别日期未取到时不会补值。</p>
        <details className="usdc-daily-details"><summary>查看逐日数值</summary><div className="usdc-table-wrap"><table className="usdc-table">
          <caption className="visually-hidden">逐日看跌看涨比与 SPY 收盘价</caption>
          <thead><tr><th scope="col">日期</th><th scope="col">总量</th><th scope="col">股票期权</th><th scope="col">指数期权</th><th scope="col">SPY 收盘价</th></tr></thead>
          <tbody>{[...state.data.rows].reverse().map(row => <tr key={row.date}><th scope="row">{row.date}</th><td data-label="总量">{row.total.ratio.toFixed(2)}</td><td data-label="股票期权">{row.equity.ratio.toFixed(2)}</td><td data-label="指数期权">{row.index.ratio.toFixed(2)}</td><td data-label="SPY 收盘价">{spyCloseAt(state.data.spy, row.date)?.toFixed(2) ?? '—'}</td></tr>)}</tbody>
        </table></div></details>
      </>}
    </>}
  </section>
}
