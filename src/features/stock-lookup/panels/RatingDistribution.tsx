import React, { useEffect, useState } from 'react'
import { Card } from '../../../components/ui'
import type { AnalystData, StockLookupApi } from '../types'
import { BlockEmpty, BlockError, BlockLoading, BlockUnsupported } from './BlockState'
import { fmtPrice, isLookupError } from './format'
import {
  consensusOf,
  currentMonth,
  donutArcs,
  periodLabel,
  RATING_COLOR,
  RATING_KEYS,
  RATING_LABEL,
  ratingSlices,
  type RatingKey,
} from './ratingStats'
import { parseLookupSymbol } from './symbolParse'

export function RatingDistribution({
  symbol,
  api,
  data,
  onData,
}: {
  symbol: string
  api: StockLookupApi
  data: AnalystData | null
  onData: (d: AnalystData | null) => void
}): JSX.Element {
  const market = parseLookupSymbol(symbol)?.market
  const [loading, setLoading] = useState(!data)
  const [error, setError] = useState<unknown>(null)
  const [retry, setRetry] = useState(0)
  const onDataRef = React.useRef(onData)
  onDataRef.current = onData

  useEffect(() => {
    if (market && market !== 'us') {
      setLoading(false)
      onDataRef.current(null)
      setError(null)
      return
    }
    let cancelled = false
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    void api.analysts(symbol, ac.signal).then(
      d => {
        if (cancelled) return
        onDataRef.current(d)
        setLoading(false)
      },
      err => {
        if (cancelled || ac.signal.aborted) return
        onDataRef.current(null)
        setError(err)
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
      ac.abort()
    }
  }, [symbol, api, retry, market])

  return (
    <Card as="section" title="评级分布" className="sl-rating" description="来自公开分析师汇总，仅供研究参考，不构成买卖建议。">
      {market && market !== 'us' ? (
        <BlockUnsupported reason="评级分布目前仅支持美股；沪深与港股暂不提供。" />
      ) : null}
      {(!market || market === 'us') && loading ? <BlockLoading label="评级分布" /> : null}
      {(!market || market === 'us') && !loading && error ? (
        isLookupError(error) && error.reason === 'unsupported'
          ? <BlockUnsupported reason={error.error} />
          : <BlockError error={error} onRetry={() => setRetry(n => n + 1)} />
      ) : null}
      {(!market || market === 'us') && !loading && !error && data ? (
        data.trend.length === 0
          ? <BlockEmpty title="暂无评级分布" />
          : <RatingBody data={data} />
      ) : null}
    </Card>
  )
}

function RatingBody({ data }: { data: AnalystData }): JSX.Element {
  const month = currentMonth(data.trend)
  const slices = ratingSlices(month)
  const consensus = consensusOf(month)
  const arcs = donutArcs(slices, 90, 90, 78, 48)
  const trend = data.trend.slice().reverse()
  const maxStack = Math.max(...trend.map(m => RATING_KEYS.reduce((s, k) => s + (m[k] ?? 0), 0)), 1)
  const target = data.target
  const price = target?.current

  return (
    <div className="sl-rating__body">
      <div className="sl-rating__top">
        <div className="sl-rating__donut-wrap">
          <svg viewBox="0 0 180 180" className="sl-rating__donut" role="img" aria-label="评级环形图">
            {arcs.map(a => <path key={a.key} d={a.d} fill={a.color} />)}
            <text x="90" y="86" textAnchor="middle" className="sl-rating__donut-main">
              {consensus?.label ?? '—'}
            </text>
            <text x="90" y="108" textAnchor="middle" className="sl-rating__donut-sub">
              {consensus ? `${consensus.total} 家` : '暂无'}
            </text>
          </svg>
          <ul className="sl-rating__legend">
            {RATING_KEYS.map(k => (
              <li key={k}>
                <span className={`sl-rating__swatch sl-rating__swatch--${k}`} />
                {RATING_LABEL[k]}
                <span className="sl-muted">（{month?.[k] ?? 0}）</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="sl-rating__bars">
          <h3 className="sl-subhead">评级随月份</h3>
          <svg viewBox={`0 0 ${Math.max(280, trend.length * 56)} 168`} className="sl-rating__bars-svg" role="img" aria-label="评级堆叠柱">
            {trend.map((m, i) => {
              const x = 36 + i * 56
              let y = 140
              const stack: { key: RatingKey; h: number; y: number }[] = []
              for (const key of [...RATING_KEYS].reverse()) {
                const h = ((m[key] ?? 0) / maxStack) * 120
                y -= h
                stack.push({ key, h, y })
              }
              return (
                <g key={m.period}>
                  {stack.map(s => (
                    <rect key={s.key} x={x} y={s.y} width={28} height={s.h} fill={RATING_COLOR[s.key]} />
                  ))}
                  <text className="sl-rating__ax" x={x + 14} y={158} textAnchor="middle">
                    {periodLabel(m.period)}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
      </div>
      {target && (target.low != null || target.mean != null || target.high != null) && (
        <TargetGauge
          low={target.low}
          mean={target.mean}
          high={target.high}
          current={price}
          currency="USD"
        />
      )}
      <p className="sl-muted">数据出处：{data.source}</p>
    </div>
  )
}

function TargetGauge({
  low,
  mean,
  high,
  current,
  currency,
}: {
  low?: number
  mean?: number
  high?: number
  current?: number
  currency: string
}): JSX.Element {
  const nums = [low, mean, high, current].filter((n): n is number => n != null)
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const span = max - min || 1
  const pct = (n: number): number => ((n - min) / span) * 100

  const xOf = (n: number): number => 8 + (pct(n) / 100) * 284

  return (
    <div className="sl-target">
      <h3 className="sl-subhead">目标价区间</h3>
      <svg className="sl-target__svg" viewBox="0 0 300 28" aria-hidden="true">
        <rect className="sl-target__rail" x="8" y="10" width="284" height="8" rx="4" />
        {low != null ? <circle className="sl-target__dot" cx={xOf(low)} cy="14" r="4" /> : null}
        {mean != null ? <circle className="sl-target__dot sl-target__dot--mean" cx={xOf(mean)} cy="14" r="5" /> : null}
        {high != null ? <circle className="sl-target__dot" cx={xOf(high)} cy="14" r="4" /> : null}
        {current != null ? <circle className="sl-target__dot sl-target__dot--now" cx={xOf(current)} cy="14" r="6" /> : null}
      </svg>
      <div className="sl-target__labels">
        <span>低 {low != null ? fmtPrice(low, currency) : '—'}</span>
        <span>均值 {mean != null ? fmtPrice(mean, currency) : '—'}</span>
        <span>高 {high != null ? fmtPrice(high, currency) : '—'}</span>
        <span>现价 {current != null ? fmtPrice(current, currency) : '—'}</span>
      </div>
    </div>
  )
}

/** 供测试导出 */
export function ratingViewModel(data: AnalystData) {
  const month = currentMonth(data.trend)
  return { month, slices: ratingSlices(month), consensus: consensusOf(month) }
}
