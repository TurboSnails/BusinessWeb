import React from 'react'
import { Link } from 'react-router-dom'
import type { ShadowItem } from './model'

export type BarPair = { label: string; hold: number | null | undefined; timing: number | null | undefined }

const ok = (x: number | null | undefined): x is number => x != null && Number.isFinite(x)
const fmt = (x: number): string => `${x.toFixed(1).replace('-', '−')}%`

/** 「一直持有 vs 择时」成对横条：以 0 为轴，正值向右、负值向左（回撤全为负，自然朝左）。 */
export function PairBars({ title, hint, pairs }: { title: string; hint: string; pairs: BarPair[] }): JSX.Element {
  const vals = pairs.flatMap(p => [p.hold, p.timing]).filter(ok)
  const lo = Math.min(0, ...vals)
  const hi = Math.max(0, ...vals)
  const span = hi - lo || 1
  const zero = (-lo / span) * 100
  const bar = (v: number | null | undefined, kind: 'hold' | 'timing'): JSX.Element => {
    if (!ok(v)) return <div className="et-bar et-bar--na">—</div>
    const at = ((v - lo) / span) * 100
    return (
      <div className="et-bar">
        <span className={`et-bar__fill et-bar__fill--${kind}`} style={{ left: `${Math.min(zero, at)}%`, width: `${Math.max(Math.abs(at - zero), 0.6)}%` }} />
        <span className="et-bar__val" style={at >= zero ? { left: `${Math.min(at, 88)}%` } : { right: `${Math.min(100 - at, 88)}%` }}>{fmt(v)}</span>
      </div>
    )
  }
  return (
    <figure className="et-chart">
      <figcaption>
        <strong>{title}</strong>
        <span className="et-chart__legend"><i className="et-key et-key--hold" />一直持有<i className="et-key et-key--timing" />择时</span>
      </figcaption>
      <p className="et-chart__hint">{hint}</p>
      <ul className="et-chart__rows">
        {pairs.map(p => (
          <li key={p.label}>
            <span className="et-chart__label">{p.label}</span>
            <div className="et-chart__plot">
              <span className="et-chart__zero" style={{ left: `${zero}%` }} aria-hidden="true" />
              {bar(p.hold, 'hold')}
              {bar(p.timing, 'timing')}
            </div>
          </li>
        ))}
      </ul>
    </figure>
  )
}

/** 单只 ETF 的价格—信号图（三方案回测页）。 */
export const priceChartPath = (i: Pick<ShadowItem, 'code' | 'name'>): string => `/lab/etf-signal-plans?code=${i.code}&name=${encodeURIComponent(i.name)}`

export type TileState = 'buy' | 'sell' | 'hold' | 'flat'
/** 近 7 天有信号按信号方向着色，其余按是否持有。 */
export function tileState(i: ShadowItem, recent: boolean): TileState {
  if (recent && i.hs.lastSignal) return i.hs.lastSignal.side === 'buy' ? 'buy' : 'sell'
  return i.hs.holding ? 'hold' : 'flat'
}
const TILE_TEXT: Record<TileState, string> = { buy: '近 7 天进场', sell: '近 7 天离场', hold: '规则持有中', flat: '空仓' }

/** 全部名单一屏看完：每只一格，颜色 = 当前规则状态。 */
export function StatusGrid({ items, asOf, isRecent }: { items: ShadowItem[]; asOf: string; isRecent: (s: ShadowItem['hs']['lastSignal'], asOf: string) => boolean }): JSX.Element {
  const rows = [...items].map(i => ({ i, s: tileState(i, isRecent(i.hs.lastSignal, asOf)) }))
  const order: TileState[] = ['buy', 'sell', 'hold', 'flat']
  rows.sort((a, b) => order.indexOf(a.s) - order.indexOf(b.s) || a.i.code.localeCompare(b.i.code))
  const count = (s: TileState): number => rows.filter(r => r.s === s).length
  return (
    <div className="et-grid-wrap" role="group" aria-label="状态总览">
      <ul className="et-grid__legend">
        {order.map(s => <li key={s}><i className={`et-tile et-tile--${s}`} />{TILE_TEXT[s]} {count(s)}</li>)}
      </ul>
      <ul className="et-grid">
        {rows.map(({ i, s }) => <li key={i.code} className={`et-tile et-tile--${s}`} title={`${i.name} ${i.code}：${TILE_TEXT[s]}，点开看价格图`}><Link to={priceChartPath(i)}>{i.name}</Link></li>)}
      </ul>
    </div>
  )
}
