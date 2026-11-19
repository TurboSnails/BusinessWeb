import type { PlanBar, PlanSignal } from './plan-trades'

export type HoldSegment = { from: string; to: string | null }
export type ChartRange = '1y' | '3y' | 'all'
export const CHART_RANGES: Array<{ id: ChartRange; label: string; days: number }> = [
  { id: '1y', label: '近 1 年', days: 366 }, { id: '3y', label: '近 3 年', days: 366 * 3 }, { id: 'all', label: '全部', days: Infinity },
]

/** 买入到卖出为一段持仓；`to` 为空 = 至今仍持有。 */
export function holdSegments(signals: PlanSignal[]): HoldSegment[] {
  const out: HoldSegment[] = []
  for (const s of signals) {
    if (s.side === 'buy' && (!out.length || out.at(-1)!.to !== null)) out.push({ from: s.date, to: null })
    else if (s.side === 'sell' && out.length && out.at(-1)!.to === null) out.at(-1)!.to = s.date
  }
  return out
}

/** 价格线上的持仓段：段内取收盘价，段外只给时间（留空），画出来就是「只在规则持有时高亮」的粗线段。 */
export function holdLine(bars: PlanBar[], segments: HoldSegment[]): Array<{ time: string; value?: number }> {
  let k = 0
  return bars.map(bar => {
    while (k < segments.length && segments[k].to !== null && segments[k].to! < bar.date) k++
    const seg = segments[k]
    const inside = !!seg && bar.date >= seg.from && (seg.to === null || bar.date <= seg.to)
    return inside ? { time: bar.date, value: bar.close } : { time: bar.date }
  })
}

export function rangeStart(bars: PlanBar[], range: ChartRange): string {
  const days = CHART_RANGES.find(r => r.id === range)?.days ?? Infinity
  if (!bars.length || !Number.isFinite(days)) return ''
  return new Date(Date.parse(bars.at(-1)!.date) - days * 86_400_000).toISOString().slice(0, 10)
}
