import React, { useEffect, useState } from 'react'
import { Segmented } from '../../components/ui/PageTabs'
import { TableWrap } from '../../components/ui'
import './rating-review.css'

// 研究方法页「评级复盘」：读 scripts/rating-review.mjs 每周生成的 public/data/rating-review.json，只展示、不计算。
type CellStatus = 'pending' | 'insufficient' | 'early' | 'ok'
export interface ReviewCell { n: number; nExcess: number; periods: number; securities: number; status: CellStatus; mean?: number; median?: number; meanExcess?: number; medianExcess?: number; hitRate?: number }
export interface ReviewSpread { id: string; status: CellStatus; nHigh: number; nLow: number; meanExcess?: number }
export interface RatingReviewData {
  schemaVersion: 1; asOf: string; firstSnapshot: string; snapshots: number; minSample: number; minPeriods: number
  buckets: string[]; benchmarks: Record<string, string>; coverage: Record<string, Record<string, number>>
  method: string[]; caveats: string[]
  horizons: { weeks: number; reached: boolean; pairs: number; observations: number; markets: Record<string, { cells: Record<string, ReviewCell>; spreads: ReviewSpread[] }> }[]
}
type Scope = 'all' | 'cn' | 'hk' | 'us'
const SCOPES: { id: Scope; label: string }[] = [{ id: 'all', label: '全部' }, { id: 'cn', label: 'A股' }, { id: 'hk', label: '港股' }, { id: 'us', label: '美股' }]
const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
const pct = (v: number | undefined, digits = 1): string => (v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`)

export function validReview(v: unknown): v is RatingReviewData {
  const r = v as RatingReviewData | null
  return !!r && r.schemaVersion === 1 && typeof r.asOf === 'string' && Array.isArray(r.horizons) && Array.isArray(r.buckets) && Array.isArray(r.caveats)
}

function Cell({ c, minSample }: { c: ReviewCell | undefined; minSample: number }): JSX.Element {
  if (!c || c.status === 'pending') return <span className="rr-muted">待积累</span>
  if (c.status === 'insufficient') return <span className="rr-muted" title={`可比样本 ${c.nExcess}，少于 ${minSample}`}>样本不足<small>n={c.nExcess}</small></span>
  const tone = (c.meanExcess ?? 0) >= 0 ? 'rr-pos' : 'rr-neg'
  return (
    <span className={c.status === 'early' ? 'rr-early' : undefined}>
      <strong className={tone}>{pct(c.meanExcess, 2)}</strong>
      <small>胜率 {Math.round((c.hitRate ?? 0) * 100)}% · n={c.nExcess} · {c.periods}期</small>
    </span>
  )
}

export function RatingReviewTable({ data, scope }: { data: RatingReviewData; scope: Scope }): JSX.Element {
  const hs = data.horizons
  return (
    <TableWrap label="评级档位 × 持有期的平均超额收益">
      <table className="ui-table rn-table rr-table">
        <thead><tr><th scope="col">起点评级</th>{hs.map(h => <th key={h.weeks} scope="col">{h.weeks} 周</th>)}</tr></thead>
        <tbody>
          {data.buckets.map(b => (
            <tr key={b}><th scope="row">{b}</th>{hs.map(h => <td key={h.weeks}><Cell c={h.markets[scope]?.cells[b]} minSample={data.minSample} /></td>)}</tr>
          ))}
          {hs[0]?.markets[scope]?.spreads.map((s, i) => (
            <tr key={s.id} className="rr-spread"><th scope="row">档位差 {s.id}</th>{hs.map(h => {
              const x = h.markets[scope]?.spreads[i]
              return <td key={h.weeks}>{!x || x.status === 'pending' ? <span className="rr-muted">待积累</span> : x.meanExcess == null ? <span className="rr-muted">样本不足</span> : <span className={x.status === 'early' ? 'rr-early' : undefined}><strong>{pct(x.meanExcess, 2)}</strong></span>}</td>
            })}</tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )
}

/** 研究方法页：评级之后的价格表现。数据期太短时只展示进度与样本数，不当作业绩。 */
export default function RatingReview(): JSX.Element {
  const [data, setData] = useState<RatingReviewData | null | 'loading'>('loading')
  const [scope, setScope] = useState<Scope>('all')
  useEffect(() => {
    let alive = true
    fetch(`${BASE}data/rating-review.json`, { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : null)).catch(() => null)
      .then((body: unknown) => { if (alive) setData(validReview(body) ? body : null) })
    return () => { alive = false }
  }, [])
  return (
    <div className="ui-card rn-card rr-card">
      <h3 className="rn-card-title">评级复盘：评级之后的价格表现</h3>
      <p className="rr-caveat" role="note">
        <strong>样本期很短，不是业绩。</strong>
        信号台账自 {data && data !== 'loading' ? data.firstSnapshot : '2026-10-23'} 起每周记录评级与价格，至少要积累数月、跨过不同行情后才可能说明问题。评级是研究观察状态，不是买卖信号。
      </p>
      {data === 'loading' && <p className="rn-text">正在加载评级复盘…</p>}
      {data === null && <p className="rn-text">评级复盘暂时无法加载。</p>}
      {data && data !== 'loading' && <>
        <p className="rn-text">
          截至 {data.asOf}，共 {data.snapshots} 期快照。格子里是起点评级为该档的公司，持有到约 N 周后相对同市场指数（{Object.entries(data.benchmarks).map(([k, v]) => `${SCOPES.find(s => s.id === k)?.label ?? k}：${v}`).join('、')}）的平均超额收益、超额为正的占比（胜率）、样本数与起始期数。
          可比样本少于 {data.minSample} 个标为「样本不足」；起始期少于 {data.minPeriods} 期的数字以斜体显示，只是早期读数。
        </p>
        <Segmented<Scope> label="复盘市场" items={SCOPES} value={scope} onChange={setScope} />
        <RatingReviewTable data={data} scope={scope} />
        <ul className="rr-notes">{data.caveats.map(t => <li key={t}>{t}</li>)}</ul>
        <details className="rr-method"><summary>统计口径</summary><ul>{data.method.map(t => <li key={t}>{t}</li>)}</ul>
          <p className="rn-footnote">最新一期覆盖：{Object.entries(data.coverage).map(([v, c]) => `${SCOPES.find(s => s.id === v)?.label ?? v} ${data.buckets.map(b => `${b} ${c[b] ?? 0}`).join(' / ')}`).join('；')}。数据由每周工作流 scripts/rating-review.mjs 生成。</p>
        </details>
      </>}
    </div>
  )
}
