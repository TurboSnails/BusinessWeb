import React, { useMemo, useState } from 'react'
import { Segmented } from '../../components/ui'
import { useOverflowFade } from '../../hooks/useOverflowFade'
import { useCompositePosture } from '../macro-posture/composite/load'
import TimelineView, {
  type TimelineLabels,
} from '../macro-posture/composite/timeline/TimelineView'
import type { ChartPoint } from '../macro-posture/composite/timeline/dailyMath'
import EquityCurves from './EquityCurves'
import ForwardStats from './ForwardStats'
import {
  formatNum2,
  formatPct1,
  visibleText,
} from './labels'
import type { RadarFile, RadarMetrics } from './types'
import './backtest-panel.css'

type Period = 'test' | 'train' | 'full'

/** 宏观攻守月度时间线里只取衰退标记 */
type RecessionRow = { d: string; rec: 0 | 1 }

/**
 * 雷达月度档位 → 时间线的点：上带 final = 雷达；下带 regime 置空（单带图不画）。
 * 衰退阴影按月份从宏观攻守时间线合并；拿不到（或一个月份都对不上）时不画衰退。
 */
export function buildRadarTimeline(
  rows: RadarFile['backtest']['timeline'],
  recessions: readonly RecessionRow[] | null | undefined,
): { points: ChartPoint[]; hasRecession: boolean } {
  const recByMonth = new Map<string, 0 | 1>()
  for (const row of recessions ?? []) recByMonth.set(row.d, row.rec ? 1 : 0)
  let matched = 0
  const points = rows.map(row => {
    const rec = recByMonth.get(row.d)
    if (rec !== undefined) matched += 1
    return { d: row.d, spx: row.spx, final: row.radar, regime: null, rec: rec === 1 ? 1 : 0 } satisfies ChartPoint
  })
  return { points, hasRecession: matched > 0 }
}

/** 从 trainRange / testRange 抽出「1973–1999」这种年份跨度 */
export function yearSpanFromRange(range: string): string {
  const years = [...range.matchAll(/(\d{4})/g)].map(m => m[1])
  if (years.length >= 2) return `${years[0]}–${years[years.length - 1]}`
  return years[0] ?? range
}

export function periodItems(
  trainRange: string,
  testRange: string,
): { id: Period; label: string }[] {
  return [
    { id: 'test', label: `验证期 ${yearSpanFromRange(testRange)}` },
    { id: 'train', label: `训练期 ${yearSpanFromRange(trainRange)}` },
    { id: 'full', label: '全样本' },
  ]
}

/** 由单条 sharpeGaps 生成说明句（不含合并） */
export function sharpeGapSentence(
  gap: RadarFile['backtest']['sharpeGaps'][number],
  labelOverride?: string,
): string {
  const name = labelOverride ?? gap.label
  const diff = visibleText(formatNum2(gap.diff, { signed: true }))
  const low = visibleText(formatNum2(gap.low, { signed: true }))
  const high = visibleText(formatNum2(gap.high, { signed: true }))
  const containsZero = gap.low <= 0 && gap.high >= 0
  if (containsZero) {
    return `雷达与${name}的夏普差 ${diff}，95% 抽样区间 ${low} 至 ${high}，包含 0，差异在抽样误差内。`
  }
  const side = gap.low > 0 ? '高于' : '低于'
  return `雷达与${name}的夏普差 ${diff}，95% 抽样区间 ${low} 至 ${high}，不含 0，${side}对照。`
}

function gapKey(gap: RadarFile['backtest']['sharpeGaps'][number]): string {
  return `${gap.diff}|${gap.low}|${gap.high}`
}

/** 差值与区间完全相同的对照合并成一句 */
export function formatSharpeGapSentences(
  gaps: RadarFile['backtest']['sharpeGaps'],
): string[] {
  const groups = new Map<string, RadarFile['backtest']['sharpeGaps']>()
  for (const gap of gaps) {
    const key = gapKey(gap)
    const list = groups.get(key) ?? []
    list.push(gap)
    groups.set(key, list)
  }
  return [...groups.values()].map(group => {
    if (group.length === 1) return sharpeGapSentence(group[0])
    const labels = group.map(g => g.label).join('、')
    const merged = `${labels}（两者夏普按构造相同）`
    return sharpeGapSentence(group[0], merged)
  })
}

const RADAR_LABELS: Partial<TimelineLabels> = {
  title: '标普月均价对数走势与雷达月度档位',
  top: '雷达档位',
  bottom: '雷达档位',
  tooltipTop: '雷达档位',
  tooltipBottom: '雷达档位',
  legendNote: '色带「雷达档位」是市场雷达按当时可得数据的月度定档',
}

function FadeTable({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}): JSX.Element {
  const { ref } = useOverflowFade<HTMLDivElement>()
  return (
    <div
      ref={ref}
      className={`ui-table-wrap ui-table-wrap--sticky mr-bt__scroll mr-bt__fade${className ? ` ${className}` : ''}`}
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      {children}
    </div>
  )
}

function RadarTimeline({ rows }: { rows: RadarFile['backtest']['timeline'] }): JSX.Element | null {
  const composite = useCompositePosture()
  const recessions = composite.status === 'ready' ? composite.data.backtest?.timeline : null
  const { points, hasRecession } = useMemo(() => buildRadarTimeline(rows, recessions), [rows, recessions])
  const labels = useMemo<Partial<TimelineLabels>>(
    () => ({ ...RADAR_LABELS, recession: hasRecession ? '灰色阴影为美国官方认定的衰退期（NBER）' : null }),
    [hasRecession],
  )
  if (points.length < 2) return null
  return (
    <div className="mr-dual" data-testid="mr-radar-timeline">
      <h3 className="mr-subhead">雷达月度档位</h3>
      <TimelineView
        mode="month"
        points={points}
        labels={labels}
        defaultPreset="近 10 年"
        singleBand
      />
    </div>
  )
}

function MetricCells({ m }: { m: RadarMetrics }): JSX.Element {
  return (
    <>
      <td className="num">{formatPct1(m.cagr)}</td>
      <td className="num">{formatPct1(m.vol)}</td>
      <td className="num">{formatPct1(m.maxDd)}</td>
      <td className="num">{visibleText(formatNum2(m.sharpe))}</td>
      <td className="num">{formatPct1(m.avgEquity)}</td>
      <td className="num">{visibleText(formatNum2(m.switchesPerYear))}</td>
    </>
  )
}

export default function BacktestPanel({ data }: { data: RadarFile }): JSX.Element {
  const bt = data.backtest
  const [period, setPeriod] = useState<Period>('test')
  const monthEndById = useMemo(
    () => new Map(bt.monthEndRows.map(row => [row.id, row])),
    [bt.monthEndRows],
  )
  const periods = useMemo(
    () => periodItems(bt.trainRange, bt.testRange),
    [bt.trainRange, bt.testRange],
  )
  const gapSentences = useMemo(
    () => formatSharpeGapSentences(bt.sharpeGaps),
    [bt.sharpeGaps],
  )

  return (
    <section className="mr-backtest" id="mr-backtest" aria-labelledby="mr-backtest-title">
      <h2 id="mr-backtest-title">回测对照</h2>
      <p className="mr-muted" data-testid="mr-backtest-range">
        {bt.start} 至 {bt.end}。训练期 {bt.trainRange} 定规则；验证期 {bt.testRange} 只原样报告，未参与挑选。
      </p>
      {bt.verdict ? (
        <p className="mr-verdict" data-testid="mr-backtest-verdict">{visibleText(bt.verdict)}</p>
      ) : null}

      <div className="mr-bt__period">
        <Segmented
          items={periods}
          value={period}
          onChange={setPeriod}
          label="回测时段"
        />
      </div>

      <FadeTable label="雷达回测对照">
        <table className="mr-table mr-bt__table mr-bt__table--period" data-testid="mr-backtest-table">
          <thead>
            <tr>
              <th scope="col" className="mr-bt__col--name">方案</th>
              <th scope="col">年化</th>
              <th scope="col">波动</th>
              <th scope="col">最大回撤</th>
              <th scope="col">夏普</th>
              <th scope="col">平均仓位</th>
              <th scope="col">年均调仓次数</th>
            </tr>
          </thead>
          <tbody>
            {bt.rows.map(row => (
              <tr key={row.id} className={row.id === 'radar' ? 'is-highlight' : undefined} data-row={row.id}>
                <th scope="row" className="mr-bt__col--name">{row.label}</th>
                <MetricCells m={row[period]} />
              </tr>
            ))}
          </tbody>
        </table>
      </FadeTable>

      <h3 className="mr-subhead">稳健性对照</h3>
      <p className="mr-muted" data-testid="mr-bt-robust-note">
        同一套信号，换一种算收益的办法：用月末收盘价代替月均价。月均价会把波动算小，所以右边的夏普更低。
      </p>
      <FadeTable label="稳健性对照">
        <table className="mr-table mr-bt__table mr-bt__table--robust" data-testid="mr-bt-robust">
          <thead>
            <tr>
              <th scope="col" className="mr-bt__col--name">方案</th>
              <th scope="col">月均价夏普</th>
              <th scope="col">月均价最大回撤</th>
              <th scope="col">月末收盘夏普</th>
              <th scope="col">月末收盘最大回撤</th>
            </tr>
          </thead>
          <tbody>
            {bt.rows.map(row => {
              const me = monthEndById.get(row.id)
              return (
                <tr key={row.id} className={row.id === 'radar' ? 'is-highlight' : undefined}>
                  <th scope="row" className="mr-bt__col--name">{row.label}</th>
                  <td className="num">{visibleText(formatNum2(row.full.sharpe))}</td>
                  <td className="num">{formatPct1(row.full.maxDd)}</td>
                  <td className="num">{visibleText(formatNum2(me?.full.sharpe))}</td>
                  <td className="num">{formatPct1(me?.full.maxDd)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </FadeTable>
      {gapSentences.length > 0 ? (
        <div className="mr-bt__gaps" data-testid="mr-sharpe-gaps">
          {gapSentences.map(sentence => (
            <p key={sentence}>{sentence}</p>
          ))}
        </div>
      ) : null}

      <EquityCurves curves={bt.curves} />

      <ForwardStats tierStats={bt.tierStats} heatStats={bt.heatStats} />

      <RadarTimeline rows={bt.timeline} />

      <details className="mr-bt__disclose" data-testid="mr-disclosures">
        <summary>方法与披露（{bt.disclosures.length} 条）</summary>
        <ul className="mr-disclosures">
          {bt.disclosures.map(item => <li key={item}>{visibleText(item)}</li>)}
        </ul>
      </details>
    </section>
  )
}
