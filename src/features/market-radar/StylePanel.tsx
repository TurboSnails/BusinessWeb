import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TableWrap } from '../../components/ui'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
export const STYLE_SHADOW_URL = `${BASE.endsWith('/') ? BASE : `${BASE}/`}data/style-rotation-shadow.json`

export const LEG_ORDER = ['V+', 'V-', 'M+', 'P+', 'S+', 'MKT'] as const
export type Leg = (typeof LEG_ORDER)[number]

export interface StyleReading {
  mom: Record<Leg, number>
  r1: Leg[]
  r2: Record<Leg, number>
}
export interface StyleRet { R1: number | null; R2: number | null; EW6: number | null; STATIC: number | null; MKT: number | null }
export interface StyleShadow {
  since: string
  until: string
  groups: Record<'us' | 'intl', { label: string; legs: Record<Leg, string> }>
  legNames: Record<Leg, string>
  radar: { month: string; us: StyleReading | null; intl: StyleReading | null }
  rows: { month: string; groups: Record<'us' | 'intl', { ret: StyleRet }> }[]
  summary: { through: string | null } & Record<'us' | 'intl', { months: number; cumulative: StyleRet }>
}
export type StyleLoad = { state: 'loading' } | { state: 'error' } | { state: 'ok'; data: StyleShadow }

export function asStyleShadow(body: unknown): StyleShadow | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Partial<StyleShadow>
  return typeof b.since === 'string' && b.radar && b.groups && Array.isArray(b.rows) ? (b as StyleShadow) : null
}

export function useStyleShadow(): StyleLoad {
  const [load, setLoad] = useState<StyleLoad>({ state: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    Promise.resolve()
      .then(() => fetch(STYLE_SHADOW_URL, { cache: 'no-cache', signal: controller.signal }))
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body: unknown) => {
        const data = asStyleShadow(body)
        setLoad(data ? { state: 'ok', data } : { state: 'error' })
      })
      .catch(() => { if (!controller.signal.aborted) setLoad({ state: 'error' }) })
    return () => controller.abort()
  }, [])
  return load
}

export const pct1 = (v: number | null | undefined): string => (v == null ? '—' : `${v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(1)}%`)

export function StyleTable({ data, group }: { data: StyleShadow; group: 'us' | 'intl' }): JSX.Element {
  const g = data.groups[group]
  const reading = data.radar[group]
  const testid = `mr-style-${group}`
  if (!reading) return <p className="mr-muted" data-testid={testid}>{g.label}：ETF 行情不足 12 个月，暂无读数。</p>
  const ranked = [...LEG_ORDER].sort((a, b) => reading.mom[b] - reading.mom[a])
  return (
    <TableWrap label={`${g.label}风格 ETF 过去 12 个月`} className="mr-style__wrap">
      <table className="cs-table mr-style__table" data-testid={testid}>
        <caption className="mr-style__caption">{g.label}</caption>
        <thead>
          <tr>
            <th scope="col">风格</th>
            <th scope="col" className="num">过去 12 个月</th>
            <th scope="col">R1（最强 2 只）</th>
            <th scope="col" className="num">R2 权重</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map(leg => (
            <tr key={leg}>
              <th scope="row">{data.legNames[leg]}{" "}<span className="mr-style__etf">{g.legs[leg]}</span></th>
              <td className="num">{pct1(reading.mom[leg])}</td>
              <td>{reading.r1.includes(leg) ? '入选' : ''}</td>
              <td className="num">{reading.r2[leg] ? `${Math.round(reading.r2[leg] * 100)}%` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )
}

export default function StylePanel(): JSX.Element {
  const load = useStyleShadow()
  return (
    <section className="mr-style" id="mr-style" aria-labelledby="mr-style-title" data-testid="mr-style">
      <h2 id="mr-style-title">风格雷达</h2>
      <p className="mr-muted">
        上面看的是股市整体冷不冷热，这里看最近哪种风格更强：价值、成长、动量、高盈利、小盘、大盘，用可交易 ETF 的过去 12 个月含息收益排序。
        按过去 12 个月挑风格的规则（R1、R2）在海外与新兴市场历史上都通过了预注册检验，但一直持有价值、动量、高盈利、小盘几乎一样好、换手低得多，所以这里只作展示。
        详见 <Link to="/invest/verified?tab=style">通过检验 · 风格轮动</Link>。
      </p>
      {load.state === 'ok' ? (
        <>
          <p className="mr-muted" data-testid="mr-style-month">{load.data.radar.month} 读数（用到上月底）。</p>
          <div className="mr-style__grid">
            <StyleTable data={load.data} group="us" />
            <StyleTable data={load.data} group="intl" />
          </div>
        </>
      ) : (
        <p className="mr-muted" data-testid="mr-style-status">{load.state === 'loading' ? '风格读数加载中…' : '风格读数暂时加载不了'}</p>
      )}
      <p className="mr-muted">只描述风格强弱，不改变仓位，不构成买卖建议。A 股、港股的风格读数要等因子实验室 12 月锁箱确认之后再加。</p>
    </section>
  )
}
