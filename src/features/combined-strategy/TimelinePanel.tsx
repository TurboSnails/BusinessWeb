import React, { useMemo } from 'react'
import { useCompositePosture } from '../macro-posture/composite/load'
import TimelineView, {
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

/** 是否一致 / 差几档 + 热度 */
export function strategyDetailRows(
  point: Pick<ChartPoint, 'final' | 'regime' | 'd'>,
  heats: Map<string, Heat | null>,
): TimelineDetailRow[] {
  const rows: TimelineDetailRow[] = []
  const macro = point.final
  const radar = point.regime
  if (!macro || !radar) {
    rows.push({ label: '是否一致', value: '无法比较', caption: '宏观与雷达无法比较（有一方证据不足）' })
  } else if (macro === radar) {
    rows.push({ label: '是否一致', value: '一致', caption: '宏观档位与雷达档位一致' })
  } else {
    const gap = TIER_ORDER_DEFENSE_LEFT.indexOf(radar) - TIER_ORDER_DEFENSE_LEFT.indexOf(macro)
    const diff = `雷达${gap < 0 ? '偏防守' : '偏进攻'} ${Math.abs(gap)} 档`
    rows.push(
      { label: '是否一致', value: '不一致', caption: `宏观与雷达不一致（${diff}）` },
      { label: '差几档', value: diff },
    )
  }
  const heat = heats.get(point.d) ?? null
  rows.push({ label: '热度', value: heat ? HEAT_LABEL[heat] : heatLabel(heat) })
  return rows
}

const STRATEGY_LABELS: Partial<TimelineLabels> = {
  title: '标普月均价对数走势、宏观档位与雷达档位',
  top: '宏观档位（仓位）',
  bottom: '雷达档位',
  tooltipTop: '宏观档位（仓位）',
  tooltipBottom: '雷达档位',
  legendNote: '上带「宏观档位（仓位）」决定仓位；下带「雷达档位」只说明市场冷热。两条带颜色相同的月份，两者档位一致',
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
  const { points, heats, hasRecession } = useMemo(
    () => buildStrategyTimeline(data.timeline, recessions),
    [data.timeline, recessions],
  )
  const labels = useMemo<Partial<TimelineLabels>>(
    () => ({ ...STRATEGY_LABELS, recession: hasRecession ? '灰色阴影为美国官方认定的衰退期（NBER）' : null }),
    [hasRecession],
  )
  const details = useMemo(
    () => (point: ChartPoint) => strategyDetailRows(point, heats),
    [heats],
  )

  if (points.length < 2) return null

  const Tag = embedded ? 'div' : 'section'
  return (
    <Tag className="cs-timeline" id="cs-timeline" {...(embedded ? {} : { 'aria-labelledby': 'cs-timeline-title' })}>
      {embedded ? null : <h2 id="cs-timeline-title">月度档位对照</h2>}
      <div data-testid="cs-dual-timeline">
        <TimelineView
          mode="month"
          points={points}
          labels={labels}
          defaultPreset="近 10 年"
          details={details}
        />
      </div>
    </Tag>
  )
}
