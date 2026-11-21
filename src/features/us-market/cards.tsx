import React, { createContext, useContext } from 'react'
import { Link } from 'react-router-dom'
import { assess, comparableHistory, FAMILY, GUIDES, LEAN_LABEL, withinYears, type Guide } from './explain'
import HistoryChart from './HistoryChart'
import { freshness, type Point, type Reading } from './model'

/** Which interpretation rules the cards and summary use; the US rules unless a page provides its own. */
export const GuideContext = createContext<{ guides: Record<string, Guide>; family: Record<string, string> }>({ guides: GUIDES, family: FAMILY })

export type Item = { id?: string; name: string; reading?: Reading }
export const RANGES = [{ id: '1y', label: '近 1 年', years: 1 }, { id: '5y', label: '近 5 年', years: 5 }, { id: '10y', label: '近 10 年', years: 10 }, { id: 'all', label: '全部', years: null }] as const
export type RangeId = typeof RANGES[number]['id']

export const format = (value: number, unit: string) => {
  const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: unit === 'bp' ? 0 : 3 }).format(value)
  return unit === 'bp' || unit === '十亿美元' ? number + ' ' + unit : number + unit
}
export const signed = (value: number | undefined, unit: string) => value === undefined ? '—' : (value > 0 ? '+' : '') + format(Math.round(value * 100) / 100, unit)
export const route = (tab: string) => `/monitor?tab=${tab}`
export const val = (name: string, unit: string, source: string, scope: string, frequency: string, history: Point[], note?: string): Reading => ({
  name, unit, source, scope, frequency, history, note,
})

export function ReadingRow({ item, asOf, years }: { item: Item; asOf: string; years: number | null }) {
  const { guides } = useContext(GuideContext)
  const r = item.reading
  const last = r?.history?.at(-1)
  const usable = last && Number.isFinite(last[1])
  if (!r || !last || !usable) return <li className="us-market__row"><span>{item.name}</span><span className="us-market__muted">暂无同口径数据</span></li>
  const state = freshness(last[0], r.frequency, asOf)
  const guide = item.id ? guides[item.id] : undefined
  const verdict = assess(r, guide)
  const comparable = comparableHistory(r, guide)
  const previous = comparable.at(-2)
  const shown = withinYears(comparable, years)
  const fmt = (value: number) => format(value, r.unit)
  return (
    <li className="us-market__metric">
      <div className="us-market__row">
        <span>{item.name}</span><strong className={state === '沿用上期' ? 'us-market__muted' : undefined}>{fmt(last[1])}</strong>
      </div>
      {verdict && <p className="us-market__verdict">
        <span className="us-market__chip" data-lean={verdict.lean}>{verdict.label}{verdict.lean !== 'neutral' ? ` · ${LEAN_LABEL[verdict.lean]}` : ''}</span>
        {verdict.basis && <span className="us-market__basis">{verdict.basis}</span>}
      </p>}
      {guide?.comparableSince && <p className="us-market__meta">图表及历史比较自 {guide.comparableSince.slice(0, 7)} 新统计口径起算</p>}
      {verdict && <p className="us-market__comment">{verdict.sentence}</p>}
      {shown.length >= 8 ? <HistoryChart points={shown} label={item.name} format={fmt} />
        : comparable.length >= 8 ? <p className="us-market__meta">所选区间内数据太少，可切换到更长的历史区间。</p>
          : <>
            {comparable.length > 1 && <ol className="us-market__recent" aria-label={`${item.name}最近几期`}>
              {comparable.slice(-6).map(([date, value]) => <li key={date}><time dateTime={date}>{date.slice(2)}</time><span>{fmt(value)}</span></li>)}
            </ol>}
            <p className="us-market__meta">当前可比数据共 {comparable.length} 期，满 8 期后显示走势图。</p>
          </>}
      <div className="us-market__meta"><time dateTime={last[0]}>{last[0]}</time><span>{r.frequency} · {state}{r.refreshError ? ' · 本次未能复核' : ''}</span></div>
      <details>
        <summary>这是什么 · 口径与来源</summary>
        <p>本期观测 {last[0]} · 可比历史 {comparable.length} 期{verdict?.basis ? ` · 判定依据 ${verdict.basis}` : ''}</p>
        {guide && <p><strong>这是什么：</strong>{guide.what}</p>}
        <p><strong>口径：</strong>{r.scope}</p>
        {previous && <p>较上次 {previous[0]} {signed(last[1] - previous[1], r.unit === '%' ? ' 个百分点' : r.unit)}</p>}
        {(r.benchmark5y !== undefined || r.benchmark10y !== undefined) && <p>
          {r.benchmark5y !== undefined && <span>5 年均值 {fmt(r.benchmark5y)} </span>}
          {r.benchmark10y !== undefined && <span>10 年均值 {fmt(r.benchmark10y)}</span>}
        </p>}
        {r.releasedAt && <p>发布于 {r.releasedAt.slice(0, 10)}</p>}
        {r.refreshError && <p>本次更新未取得新数据（{r.refreshError}），显示最近一次核实的观测。</p>}
        {r.note && <p>{r.note}</p>}
        {/^https:\/\//.test(r.source) && <a href={r.source} target="_blank" rel="noreferrer">数据来源</a>}
      </details>
    </li>
  )
}

export function MarketCard({ title, items, asOf, years, link }: { title: string; items: Item[]; asOf: string; years: number | null; link?: { tab: string; label: string } }) {
  return <section className="us-market__card" aria-label={title}>
    <h3>{title}</h3>
    <ul>{items.slice(0, 3).map(item => <ReadingRow key={item.name} item={item} asOf={asOf} years={years} />)}</ul>
    {items.length > 3 && <details className="us-market__more"><summary>其余 {items.length - 3} 项</summary>
      <ul>{items.slice(3).map(item => <ReadingRow key={item.name} item={item} asOf={asOf} years={years} />)}</ul>
    </details>}
    {link && <Link className="us-market__link" to={route(link.tab)}>{link.label}</Link>}
  </section>
}

