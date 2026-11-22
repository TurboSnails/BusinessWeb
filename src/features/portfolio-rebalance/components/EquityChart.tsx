import React, { useMemo, useState } from 'react'
import type { CompareSet, RunResult } from '../types'
import { number } from './format'

const WIDTH = 1000
const HEIGHT = 330
const LEFT = 64
const RIGHT = 24
const TOP = 22
const BOTTOM = 46

export function EquityChart({ comparison }: { comparison: CompareSet }): JSX.Element {
  const [log, setLog] = useState(false)
  const series = useMemo(() => [
    { key: 'custom-active', label: '自定义 · 动态平衡', result: comparison.custom.active },
    { key: 'custom-hold', label: '自定义 · 不动', result: comparison.custom.hold },
    ...(comparison.benchmarks.QQQ ? [{ key: 'QQQ', label: 'QQQ', result: comparison.benchmarks.QQQ }] : []),
  ], [comparison])
  const allDates = series.flatMap(item => item.result.dates)
  const allValues = series.flatMap(item => item.result.equity).filter(value => Number.isFinite(value) && value > 0)
  const firstDate = allDates.reduce((min, date) => date < min ? date : min, allDates[0] ?? '')
  const lastDate = allDates.reduce((max, date) => date > max ? date : max, allDates[0] ?? '')
  const firstTime = Date.parse(`${firstDate}T00:00:00Z`)
  const lastTime = Date.parse(`${lastDate}T00:00:00Z`)
  const low = Math.min(...allValues)
  const high = Math.max(...allValues)
  const lower = log ? Math.log(low) : low
  const upper = log ? Math.log(high) : high
  const span = upper - lower || 1
  const x = (date: string): number => LEFT + (Date.parse(`${date}T00:00:00Z`) - firstTime) / (lastTime - firstTime || 1) * (WIDTH - LEFT - RIGHT)
  const y = (value: number): number => TOP + (upper - (log ? Math.log(value) : value)) / span * (HEIGHT - TOP - BOTTOM)
  const path = (result: RunResult): string => result.dates.map((date, index) => `${index === 0 ? 'M' : 'L'}${x(date).toFixed(2)},${y(result.equity[index]).toFixed(2)}`).join(' ')
  const ticks = Array.from({ length: 5 }, (_, index) => {
    const transformed = lower + span * index / 4
    return log ? Math.exp(transformed) : transformed
  })
  return (
    <section className="pr-section" aria-labelledby="pr-chart-title">
      <div className="pr-section__head pr-section__head--actions">
        <div><h2 id="pr-chart-title">净值曲线</h2><p>起点净值均为 1；{firstDate} 至 {lastDate}。</p></div>
        <button type="button" className="pr-chart-toggle" aria-pressed={log} onClick={() => setLog(value => !value)}>{log ? '切换线性坐标' : '切换对数坐标'}</button>
      </div>
      <figure className="pr-chart">
        <div className="pr-chart__legend" aria-label="图例">{series.map(item => <span key={item.key}><i className={`pr-chart__swatch pr-chart__swatch--${item.key}`} aria-hidden="true" />{item.label}</span>)}</div>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby="pr-chart-svg-title pr-chart-svg-desc" preserveAspectRatio="xMidYMid meet">
          <title id="pr-chart-svg-title">自定义组合与 QQQ 净值曲线</title>
          <desc id="pr-chart-svg-desc">对比自定义权重动态平衡、自定义权重不动与 QQQ 买入持有，当前使用{log ? '对数' : '线性'}坐标。</desc>
          {ticks.map(tick => <g key={tick}><line className="pr-chart__grid" x1={LEFT} x2={WIDTH - RIGHT} y1={y(tick)} y2={y(tick)} /><text className="pr-chart__tick" x={LEFT - 10} y={y(tick) + 4} textAnchor="end">{number(tick, tick >= 10 ? 0 : 1)}</text></g>)}
          <text className="pr-chart__tick" x={LEFT} y={HEIGHT - 14} textAnchor="start">{firstDate}</text>
          <text className="pr-chart__tick" x={WIDTH - RIGHT} y={HEIGHT - 14} textAnchor="end">{lastDate}</text>
          {series.map(item => <path key={item.key} className={`pr-chart__line pr-chart__line--${item.key}`} d={path(item.result)} fill="none" vectorEffect="non-scaling-stroke" />)}
        </svg>
        <figcaption>净值已扣单边交易成本；价格采用复权收盘价。</figcaption>
      </figure>
    </section>
  )
}
