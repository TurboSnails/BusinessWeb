import React, { useMemo } from 'react'
import { TableWrap } from '../../components/ui'
import { useCompositePosture } from '../macro-posture/composite/load'
import TimelineView, {
  type TimelineDetailRow,
  type TimelineLabels,
} from '../macro-posture/composite/timeline/TimelineView'
import type { ChartPoint } from '../macro-posture/composite/timeline/dailyMath'
import {
  TIER_ORDER_DEFENSE_LEFT,
  formatNum2,
  formatPct1,
  visibleText,
} from './labels'
import type { RadarFile, RadarMetrics } from './types'

function MetricCells({ m, period }: { m: RadarMetrics; period: 'train' | 'test' | 'full' }): JSX.Element {
  const testClass = period === 'test' ? ' mr-bt__col--test' : ''
  return (
    <>
      <td className={`num${testClass}`}>{formatPct1(m.cagr)}</td>
      <td className={`num${testClass}`}>{formatPct1(m.maxDd)}</td>
      <td className={`num${testClass}`}>{visibleText(formatNum2(m.sharpe))}</td>
      <td className={`num${testClass}`}>{formatPct1(m.avgEquity)}</td>
    </>
  )
}

/** 宏观攻守月度时间线里只取衰退标记 */
type RecessionRow = { d: string; rec: 0 | 1 }

/**
 * 雷达月度档位 → 时间线的点：上带 final = 雷达，下带 regime = 大师方案。
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
    return { d: row.d, spx: row.spx, final: row.radar, regime: row.masters, rec: rec === 1 ? 1 : 0 } satisfies ChartPoint
  })
  return { points, hasRecession: matched > 0 }
}

/** 两条带是否一致；不一致时再给一行：雷达比大师偏防守还是偏进攻几档。 */
export function agreementRows(point: Pick<ChartPoint, 'final' | 'regime'>): TimelineDetailRow[] {
  const radar = point.final
  const masters = point.regime
  if (!radar || !masters) {
    return [{ label: '是否一致', value: '无法比较', caption: '雷达与大师方案无法比较（有一方证据不足）' }]
  }
  if (radar === masters) return [{ label: '是否一致', value: '一致', caption: '雷达与大师方案一致' }]
  const gap = TIER_ORDER_DEFENSE_LEFT.indexOf(radar) - TIER_ORDER_DEFENSE_LEFT.indexOf(masters)
  const diff = `雷达${gap < 0 ? '偏防守' : '偏进攻'} ${Math.abs(gap)} 档`
  return [
    { label: '是否一致', value: '不一致', caption: `雷达与大师方案不一致（${diff}）` },
    { label: '差几档', value: diff },
  ]
}

const RADAR_LABELS: Partial<TimelineLabels> = {
  title: '标普月均价对数走势、雷达月度档位与大师方案月度档位',
  top: '雷达档位',
  bottom: '大师档位',
  tooltipTop: '雷达档位',
  tooltipBottom: '大师方案档位',
  legendNote: '上带「雷达档位」是我的市场雷达按当时可得数据的月度定档；下带「大师方案档位」与宏观攻守页的月度时间线是同一份数据。两条带颜色相同的月份，两者结论一致',
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
    <div className="mr-dual" data-testid="mr-dual-timeline">
      <h3 className="mr-subhead">月度档位对照</h3>
      <TimelineView mode="month" points={points} labels={labels} defaultPreset="近 10 年" details={agreementRows} />
    </div>
  )
}


export default function BacktestPanel({ data }: { data: RadarFile }): JSX.Element {
  const bt = data.backtest
  return (
    <section className="mr-backtest" id="mr-backtest" aria-labelledby="mr-backtest-title">
      <h2 id="mr-backtest-title">回测对照</h2>
      <p className="mr-muted" data-testid="mr-backtest-range">
        {bt.start} 至 {bt.end}。训练期 {bt.trainRange} 定规则；验证期 {bt.testRange} 只原样报告，未参与挑选。
      </p>
      {bt.verdict ? (
        <p className="mr-verdict" data-testid="mr-backtest-verdict">{visibleText(bt.verdict)}</p>
      ) : null}

      <TableWrap label="雷达回测对照" className="mr-bt__scroll mr-bt__scroll--sticky-test">
        <table className="mr-table mr-bt__table" data-testid="mr-backtest-table">
          <thead>
            <tr>
              <th scope="col" className="mr-bt__col--name">方案</th>
              <th scope="col" className="mr-bt__col--test">验证年化<span className="mr-bt__hint">未参与挑选</span></th>
              <th scope="col" className="mr-bt__col--test">验证回撤</th>
              <th scope="col" className="mr-bt__col--test">验证夏普</th>
              <th scope="col" className="mr-bt__col--test">验证仓位</th>
              <th scope="col">训练年化</th>
              <th scope="col">训练回撤</th>
              <th scope="col">训练夏普</th>
              <th scope="col">训练仓位</th>
              <th scope="col">全年化</th>
              <th scope="col">全回撤</th>
              <th scope="col">全夏普</th>
              <th scope="col">全仓位</th>
            </tr>
          </thead>
          <tbody>
            {bt.rows.map(row => (
              <tr key={row.id} className={row.id === 'radar' ? 'is-highlight' : undefined} data-row={row.id}>
                <th scope="row" className="mr-bt__col--name">{row.label}</th>
                <MetricCells m={row.test} period="test" />
                <MetricCells m={row.train} period="train" />
                <MetricCells m={row.full} period="full" />
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

      <RadarTimeline rows={bt.timeline} />

      <h3 className="mr-subhead">披露</h3>
      <ul className="mr-disclosures" data-testid="mr-disclosures">
        {bt.disclosures.map(item => <li key={item}>{visibleText(item)}</li>)}
      </ul>
    </section>
  )
}
