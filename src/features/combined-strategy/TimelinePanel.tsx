import React, { useMemo, useState } from 'react'
import { Segmented } from '../../components/ui'
import { useCompositePosture } from '../macro-posture/composite/load'
import TimelineView, {
  type TimelineBottomBand,
  type TimelineDetailRow,
  type TimelineLabels,
} from '../macro-posture/composite/timeline/TimelineView'
import type { ChartPoint } from '../macro-posture/composite/timeline/dailyMath'
import { TIER_ORDER_DEFENSE_LEFT } from '../market-radar/labels'
import { HEAT_LABEL, heatLabel } from './labels'
import type { CombinedStrategyFile, Heat } from './types'

type RecessionRow = { d: string; rec: 0 | 1 }

export function buildStrategyTimeline(
  rows: CombinedStrategyFile['timeline'],
  recessions: readonly RecessionRow[] | null | undefined,
): { points: ChartPoint[]; heats: Map<string, Heat | null>; hasRecession: boolean } {
  const recByMonth = new Map<string, 0 | 1>()
  for (const row of recessions ?? []) recByMonth.set(row.d, row.rec ? 1 : 0)
  const heats = new Map<string, Heat | null>()
  let matched = 0
  const points = rows.map(row => {
    const rec = recByMonth.get(row.d)
    if (rec !== undefined) matched += 1
    heats.set(row.d, row.heat)
    return {
      d: row.d,
      spx: row.spx,
      final: row.macro,
      regime: row.radar,
      rec: rec === 1 ? 1 : 0,
    } satisfies ChartPoint
  })
  return { points, heats, hasRecession: matched > 0 }
}

export type LowerBand = 'heat' | 'tier'

export const LOWER_BAND_ITEMS: { id: LowerBand; label: string }[] = [
  { id: 'heat', label: '下带：冷热' },
  { id: 'tier', label: '下带：雷达综合分档位' },
]

/** 综合分档位模式：是否一致 / 差几档 + 热度 */
export function strategyDetailRows(
  point: Pick<ChartPoint, 'final' | 'regime' | 'd'>,
  heats: Map<string, Heat | null>,
): TimelineDetailRow[] {
  const rows: TimelineDetailRow[] = []
  const macro = point.final
  const radar = point.regime
  if (!macro || !radar) {
    rows.push({ label: '是否一致', value: '无法比较', caption: '宏观与综合分档位无法比较（有一方证据不足）' })
  } else if (macro === radar) {
    rows.push({ label: '是否一致', value: '一致', caption: '宏观档位与综合分档位一致' })
  } else {
    const gap = TIER_ORDER_DEFENSE_LEFT.indexOf(radar) - TIER_ORDER_DEFENSE_LEFT.indexOf(macro)
    const diff = `综合分${gap < 0 ? '偏低' : '偏高'} ${Math.abs(gap)} 档`
    rows.push(
      { label: '是否一致', value: '不一致', caption: `宏观与综合分档位不一致（${diff}）` },
      { label: '差几档', value: diff },
    )
  }
  const heat = heats.get(point.d) ?? null
  rows.push({ label: '热度', value: heat ? HEAT_LABEL[heat] : heatLabel(heat) })
  return rows
}

const NO_ROWS = (): TimelineDetailRow[] => []

const HEAT_LABELS: Partial<TimelineLabels> = {
  title: '标普月均价对数走势、宏观档位与股市冷热',
  top: '宏观档位（仓位）',
  bottom: '冷热',
  tooltipTop: '宏观档位（仓位）',
  tooltipBottom: '冷热',
  legendNote: '上带「宏观档位（仓位）」决定仓位；下带是市场雷达的冷热（估值与持股拥挤度），不改变仓位。两者的组合就是上面九格里的那一格',
}

const TIER_LABELS: Partial<TimelineLabels> = {
  title: '标普月均价对数走势、宏观档位与雷达综合分档位',
  top: '宏观档位（仓位）',
  bottom: '综合分档位',
  tooltipTop: '宏观档位（仓位）',
  tooltipBottom: '综合分档位',
  legendNote: '下带是雷达五维综合分按宏观刻度分的五档，历史上不能区分之后的回报（见市场雷达「历史检验」），只作对照；颜色相同的月份两者档位一致',
}

export function heatBand(heats: Map<string, Heat | null>): TimelineBottomBand {
  return {
    value: point => heats.get(point.d) ?? null,
    label: value => (value ? HEAT_LABEL[value as Heat] : '读数暂缺'),
    classSuffix: value => `heat-${value}`,
    legend: (['hot', 'mid', 'cold'] as const).map(value => ({ value, label: `冷热：${HEAT_LABEL[value]}` })),
  }
}

export default function TimelinePanel({
  data,
  embedded = false,
}: {
  data: CombinedStrategyFile
  embedded?: boolean
}): JSX.Element | null {
  const composite = useCompositePosture()
  const recessions = composite.status === 'ready' ? composite.data.backtest?.timeline : null
  const [lower, setLower] = useState<LowerBand>('heat')
  const { points, heats, hasRecession } = useMemo(
    () => buildStrategyTimeline(data.timeline, recessions),
    [data.timeline, recessions],
  )
  const bottomBand = useMemo(() => heatBand(heats), [heats])
  const labels = useMemo<Partial<TimelineLabels>>(
    () => ({
      ...(lower === 'heat' ? HEAT_LABELS : TIER_LABELS),
      recession: hasRecession ? '灰色阴影为美国官方认定的衰退期（NBER）' : null,
    }),
    [lower, hasRecession],
  )
  const details = useMemo(
    () => (lower === 'heat' ? NO_ROWS : (point: ChartPoint) => strategyDetailRows(point, heats)),
    [lower, heats],
  )

  if (points.length < 2) return null

  const Tag = embedded ? 'div' : 'section'
  return (
    <Tag className="cs-timeline" id="cs-timeline" {...(embedded ? {} : { 'aria-labelledby': 'cs-timeline-title' })}>
      {embedded ? null : <h2 id="cs-timeline-title">月度对照</h2>}
      <div className="cs-timeline__switch" data-testid="cs-timeline-switch">
        <Segmented items={LOWER_BAND_ITEMS} value={lower} onChange={setLower} label="下带显示" />
      </div>
      <div data-testid="cs-dual-timeline" data-lower={lower}>
        <TimelineView
          mode="month"
          points={points}
          labels={labels}
          defaultPreset="近 10 年"
          details={details}
          bottomBand={lower === 'heat' ? bottomBand : undefined}
        />
      </div>
    </Tag>
  )
}
