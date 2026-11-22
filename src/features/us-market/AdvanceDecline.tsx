import React, { useState } from 'react'
import { Segmented } from '../../components/ui/PageTabs'
import {
  ADV_DEC_FOOTNOTE,
  ADV_DEC_HISTORY_PENDING,
  AVG10_INCOMPLETE,
  MCCLELLAN_WARMUP_DAYS,
  SAMPLE_INSUFFICIENT,
  buildAdvDecMetrics,
  type AdvDecMetrics,
  type AdvDecUniverse,
} from './advDec'
import type { Breadth, Point } from './model'

const UNIVERSES: { id: AdvDecUniverse; label: string }[] = [
  { id: 'spx', label: '标普 500' },
  { id: 'ndx', label: '纳指 100' },
]

const W = 320
const H_LINE = 96
const H_BAR = 52
const TOP = 8
const BOTTOM = 16
const LEFT = 4
const RIGHT = 4
const TABLE_ROWS = 20

function fmtShare(share: number | undefined): string {
  return share === undefined ? '—' : `${(share * 100).toFixed(1)}%`
}

function fmtPctile(p: number | undefined): string {
  return p === undefined ? '—' : `${p}% 分位`
}

function fmtInt(n: number | undefined): string {
  return n === undefined || !Number.isFinite(n) ? '—' : String(Math.round(n))
}

function fmtOsc(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return '—'
  const rounded = Math.round(n * 10) / 10
  return rounded > 0 ? `+${rounded.toFixed(1)}` : rounded.toFixed(1)
}

function yScale(vals: number[], v: number, height: number): number {
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 1
  return TOP + (1 - (v - (lo - pad)) / ((hi + pad) - (lo - pad))) * (height - TOP - BOTTOM)
}

function RecentTable({ metrics }: { metrics: AdvDecMetrics }): JSX.Element {
  const rows = metrics.dailyNet.slice(-TABLE_ROWS).reverse()
  const cumByDate = new Map(metrics.cumulative)
  return (
    <details className="us-market__data-table">
      <summary>查看最近 {Math.min(TABLE_ROWS, metrics.dailyNet.length)} 个交易日数据</summary>
      <div className="us-market__data-table-wrap" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">日期</th>
              <th scope="col">净上涨</th>
              <th scope="col">累计净上涨</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([date, net]) => (
              <tr key={date}>
                <td><time dateTime={date}>{date}</time></td>
                <td className={net >= 0 ? 'us-chg--up' : 'us-chg--down'}>{fmtInt(net)}</td>
                <td>{fmtInt(cumByDate.get(date))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function AdvDecChart({ metrics, indexPoints, indexLabel }: {
  metrics: AdvDecMetrics
  indexPoints: readonly Point[]
  indexLabel: string
}): JSX.Element {
  const [hover, setHover] = useState<number | null>(null)
  const cum = metrics.cumulative
  const bars = metrics.dailyNet
  if (cum.length < 2) {
    return <p className="us-advdec__pending" role="status">{ADV_DEC_HISTORY_PENDING}</p>
  }

  const indexMap = new Map(indexPoints.filter(([, v]) => Number.isFinite(v) && v > 0))
  const pairedPx = cum.map(([date]) => indexMap.get(date))
  const hasIndex = pairedPx.filter((v): v is number => v !== undefined).length >= 2

  const dates = cum.map(([d]) => d)
  const t0 = Date.parse(dates[0]!)
  const span = Math.max(Date.parse(dates.at(-1)!) - t0, 1)
  const x = (date: string) => LEFT + ((Date.parse(date) - t0) / span) * (W - LEFT - RIGHT)

  const cumVals = cum.map(([, v]) => v)
  const adPath = cum.map(([d, v], i) => `${i ? 'L' : 'M'}${x(d).toFixed(1)},${yScale(cumVals, v, H_LINE).toFixed(1)}`).join('')

  const pxPairs = cum.flatMap(([date], i) => {
    const px = pairedPx[i]
    return px === undefined ? [] : [[date, px] as Point]
  })
  const pxVals = pxPairs.map(([, v]) => v)
  const pxPath = pxPairs.length >= 2
    ? pxPairs.map(([d, v], i) => `${i ? 'L' : 'M'}${x(d).toFixed(1)},${yScale(pxVals, v, H_LINE).toFixed(1)}`).join('')
    : ''

  const shown = hover === null ? cum.length - 1 : hover
  const barMax = Math.max(1, ...bars.map(([, v]) => Math.abs(v)))
  const zeroY = H_BAR / 2
  const yBar = (v: number) => zeroY - (v / barMax) * (zeroY - 4)
  const barW = Math.max(0.6, (W - LEFT - RIGHT) / Math.max(bars.length, 1) * 0.7)

  const onMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    const box = event.currentTarget.getBoundingClientRect()
    const rel = ((event.clientX - box.left) / box.width) * W
    const clamped = Math.max(0, Math.min(1, (rel - LEFT) / (W - LEFT - RIGHT)))
    const t = t0 + clamped * span
    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < dates.length; i++) {
      const dist = Math.abs(Date.parse(dates[i]!) - t)
      if (dist < bestDist) { best = i; bestDist = dist }
    }
    setHover(best)
  }

  return (
    <div className="us-advdec__charts">
      <figure className="us-advdec__chart us-chart">
        <svg viewBox={`0 0 ${W} ${H_LINE}`} role="img"
          aria-label={hasIndex
            ? `累计涨跌线与${indexLabel}近一年走势`
            : `累计涨跌线：${cum[0]![0]} 至 ${cum.at(-1)![0]}`}
          onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          <line className="us-chart__grid" x1={LEFT} x2={W - RIGHT}
            y1={yScale(cumVals, 0, H_LINE)} y2={yScale(cumVals, 0, H_LINE)} />
          <path className="us-chart__line us-advdec__ad-line" d={adPath} />
          {pxPath && <path className="us-chart__line us-advdec__index-line" d={pxPath} />}
          <circle className="us-chart__dot" cx={x(cum[shown]![0])} cy={yScale(cumVals, cumVals[shown]!, H_LINE)} r={2.5} />
          <text className="us-chart__axis" x={LEFT} y={H_LINE - 4}>{dates[0]!.slice(0, 7)}</text>
          <text className="us-chart__axis" x={W - RIGHT} y={H_LINE - 4} textAnchor="end">{dates.at(-1)!.slice(0, 7)}</text>
        </svg>
        <figcaption className="us-chart__caption">
          <span><time dateTime={cum[shown]![0]}>{cum[shown]![0]}</time> 累计净上涨 <strong>{fmtInt(cumVals[shown])}</strong> 家</span>
          <span className="us-advdec__legends">
            <span className="us-advdec__legend"><i className="us-advdec__swatch us-advdec__swatch--ad" aria-hidden />累计涨跌线</span>
            {hasIndex
              ? <span className="us-advdec__legend"><i className="us-advdec__swatch us-advdec__swatch--ix" aria-hidden />{indexLabel}（归一化）</span>
              : <span className="us-market__muted">暂无{indexLabel}价格序列，仅显示涨跌线</span>}
          </span>
        </figcaption>
      </figure>
      <figure className="us-advdec__chart us-chart">
        <svg viewBox={`0 0 ${W} ${H_BAR}`} role="img" aria-label="每日净上涨柱状图"
          onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          <line className="us-chart__grid" x1={LEFT} x2={W - RIGHT} y1={zeroY} y2={zeroY} />
          {bars.map(([date, net], i) => {
            const cx = x(date)
            const y1 = yBar(net)
            const top = Math.min(y1, zeroY)
            const h = Math.max(1, Math.abs(y1 - zeroY))
            return <rect key={date}
              className={net >= 0 ? 'us-advdec__bar us-advdec__bar--up' : 'us-advdec__bar us-advdec__bar--down'}
              x={cx - barW / 2} y={top} width={barW} height={h}
              opacity={hover === null || hover === i ? 1 : 0.35} />
          })}
        </svg>
        <figcaption className="us-chart__caption">
          <span>当日净上涨 <strong className={bars[shown]![1] >= 0 ? 'us-chg--up' : 'us-chg--down'}>{fmtInt(bars[shown]![1])}</strong> 家</span>
        </figcaption>
      </figure>
      <RecentTable metrics={metrics} />
    </div>
  )
}

export interface AdvanceDeclineProps {
  breadth: Partial<Record<AdvDecUniverse, Breadth | undefined>>
  indexes: Partial<Record<AdvDecUniverse, Point[] | undefined>>
  asOf: string
}

export default function AdvanceDecline({ breadth, indexes, asOf }: AdvanceDeclineProps): JSX.Element | null {
  const [universe, setUniverse] = useState<AdvDecUniverse>('spx')
  const anyBreadth = UNIVERSES.some(({ id }) =>
    breadth[id]?.advDec?.length || buildAdvDecMetrics(breadth[id], indexes[id], asOf))
  const hasObservations = Boolean(breadth[universe]?.advDec?.length)
  const metrics = buildAdvDecMetrics(breadth[universe], indexes[universe], asOf)
  if (!anyBreadth) return null

  const indexLabel = universe === 'spx' ? '标普 500' : '纳指 100'
  const indexPoints = indexes[universe] ?? []
  const t = metrics?.today
  const coverage = t?.total !== undefined ? `${t.covered}/${t.total}` : t ? String(t.covered) : '—'

  return (
    <section className="us-advdec" aria-label="市场宽度：涨跌家数">
      <header className="us-advdec__head">
        <div>
          <h3>市场宽度：涨跌家数</h3>
          <p className="us-market__muted">成分股收盘涨跌家数，用来观察上涨是否有多数股票跟随。</p>
        </div>
        <Segmented label="涨跌家数指数" items={UNIVERSES} value={universe} onChange={setUniverse} />
      </header>

      {!metrics ? (
        <p className="us-advdec__pending" role="status">{hasObservations ? AVG10_INCOMPLETE : '该指数暂无涨跌家数读数。'}</p>
      ) : (
        <>
          <p className="us-advdec__asof" role="status">
            数据截至 {t!.date} 收盘
            {metrics.stale && <span className="us-advdec__stale"> · 更新已落后超过一个交易日，请留意时效</span>}
          </p>

          <dl className="us-advdec__today">
            <div><dt>上涨</dt><dd className="us-chg--up">{fmtInt(t!.advancers)} 家</dd></div>
            <div><dt>下跌</dt><dd className="us-chg--down">{fmtInt(t!.decliners)} 家</dd></div>
            <div><dt>平盘</dt><dd>{t!.unchanged === undefined ? '—' : `${fmtInt(t!.unchanged)} 家`}</dd></div>
            <div><dt>净上涨</dt><dd className={t!.net >= 0 ? 'us-chg--up' : 'us-chg--down'}>{fmtInt(t!.net)} 家</dd></div>
            <div><dt>上涨占比</dt><dd>{fmtShare(t!.advanceShare)}</dd></div>
            <div><dt>覆盖</dt><dd>{coverage}</dd></div>
          </dl>

          <div className="us-advdec__stats">
            <div>
              <h4>10 日平均上涨占比</h4>
              {!metrics.historyReady && !hasObservations ? (
                <p className="us-market__muted">{ADV_DEC_HISTORY_PENDING}</p>
              ) : metrics.avg10Share === undefined ? (
                <p className="us-market__muted" role="status">{AVG10_INCOMPLETE}</p>
              ) : (
                <p>
                  <strong>{fmtShare(metrics.avg10Share)}</strong>
                  {metrics.avg10SampleReady
                    ? <span className="us-market__muted"> · 近一年 {fmtPctile(metrics.avg10Percentile)}</span>
                    : <span className="us-market__muted" role="status"> · {SAMPLE_INSUFFICIENT}</span>}
                </p>
              )}
            </div>
            <div>
              <h4>McClellan 振荡（比例调整）</h4>
              {metrics.historyReady
                ? metrics.mcclellanWarmup
                  ? <p className="us-market__muted">预热中（需满 {MCCLELLAN_WARMUP_DAYS} 个交易日），暂不判读</p>
                  : <p><strong>{fmtOsc(metrics.mcclellan)}</strong><span className="us-market__muted"> · 近一年 {fmtPctile(metrics.mcclellanPercentile)}</span></p>
                : <p className="us-market__muted">{ADV_DEC_HISTORY_PENDING}</p>}
            </div>
          </div>

          {metrics.historyReady
            ? <AdvDecChart key={universe} metrics={metrics} indexPoints={indexPoints} indexLabel={indexLabel} />
            : <p className="us-advdec__pending" role="status">{ADV_DEC_HISTORY_PENDING}</p>}

          {metrics.readings.length > 0 && (
            <ul className="us-advdec__readings">
              {metrics.readings.map(text => <li key={text}>{text}</li>)}
            </ul>
          )}
        </>
      )}

      <p className="us-advdec__footnote">{ADV_DEC_FOOTNOTE}</p>
    </section>
  )
}
