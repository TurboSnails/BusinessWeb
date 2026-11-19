import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { Time } from 'lightweight-charts'
import { CHART_RANGES, holdLine, holdSegments, rangeStart, type ChartRange } from './plan-chart'
import type { PlanBar, PlanResult } from './plan-trades'
import './plan-chart.css'

type Lib = typeof import('lightweight-charts')

/** 价格—时间图：收盘价细线 + 规则持仓段粗线 + 买卖箭头。数据与回测同源（腾讯后复权日线 + 三方案信号）。 */
export function PlanPriceChart({ bars, plans, name }: { bars: PlanBar[]; plans: PlanResult[]; name: string }): JSX.Element {
  const [planKey, setPlanKey] = useState(plans[0]?.key)
  const [range, setRange] = useState<ChartRange>('3y')
  const [failed, setFailed] = useState('')
  const host = useRef<HTMLDivElement>(null)
  const plan = plans.find(p => p.key === planKey) ?? plans[0]
  const start = useMemo(() => rangeStart(bars, range), [bars, range])
  const rows = useMemo(() => bars.filter(b => b.date >= start), [bars, start])
  const segments = useMemo(() => holdSegments(plan?.signals ?? []), [plan])
  const trades = (plan?.signals ?? []).filter(s => !s.forced && s.date >= start)

  useEffect(() => {
    if (!host.current || !rows.length || !plan) return
    let chart: ReturnType<Lib['createChart']> | null = null
    let live = true
    import('lightweight-charts').then(lib => {
      if (!live || !host.current) return
      const theme = getComputedStyle(host.current)
      const color = (token: string, fallback: string): string => theme.getPropertyValue(token).trim() || fallback
      const rise = color('--up', '#c4503f'), fall = color('--down', '#3f9a62')
      chart = lib.createChart(host.current, {
        autoSize: true,
        layout: { background: { type: lib.ColorType.Solid, color: color('--bg-card', '#fff') }, textColor: color('--text-secondary', '#665f55'), attributionLogo: true },
        localization: { locale: 'zh-CN', dateFormat: 'yyyy-MM-dd' },
        rightPriceScale: { scaleMargins: { top: 0.06, bottom: 0.14 } },
        handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
      })
      // 价格轴只按收盘价取范围（留 8% 边距），不被持仓线 / 箭头拉到 0
      const lo = Math.min(...rows.map(r => r.close)), hi = Math.max(...rows.map(r => r.close)), pad = (hi - lo) * 0.08 || hi * 0.05
      const price = chart.addSeries(lib.LineSeries, {
        color: color('--text-secondary', '#8a8378'), lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
        autoscaleInfoProvider: () => ({ priceRange: { minValue: lo - pad, maxValue: hi + pad } }),
      })
      price.setData(rows.map(r => ({ time: r.date as Time, value: r.close })))
      const hold = chart.addSeries(lib.LineSeries, { color: color('--accent', '#a4772f'), lineWidth: 3, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, autoscaleInfoProvider: () => null })
      hold.setData(holdLine(rows, segments).map(p => ({ ...p, time: p.time as Time })))
      lib.createSeriesMarkers(price, trades.map(s => ({
        time: s.date as Time, position: s.side === 'buy' ? 'belowBar' as const : 'aboveBar' as const,
        shape: s.side === 'buy' ? 'arrowUp' as const : 'arrowDown' as const, color: s.side === 'buy' ? rise : fall,
      })))
      chart.timeScale().fitContent()
    }).catch(() => { if (live) setFailed('图表暂时无法绘制，可刷新重试；下方表格数据不受影响。') })
    return () => { live = false; chart?.remove() }
  }, [rows, segments, trades.length, plan])

  const holding = segments.at(-1)?.to === null
  return (
    <section className="plan-chart" aria-label={`${name} 价格与信号图`}>
      <div className="plan-chart__toolbar">
        <div role="group" aria-label="方案">
          {plans.map(p => <button key={p.key} type="button" aria-pressed={p.key === plan?.key} onClick={() => setPlanKey(p.key)}>{p.name}</button>)}
        </div>
        <div role="group" aria-label="区间">
          {CHART_RANGES.map(r => <button key={r.id} type="button" aria-pressed={r.id === range} onClick={() => setRange(r.id)}>{r.label}</button>)}
        </div>
      </div>
      <ul className="plan-chart__legend">
        <li><i className="plan-chart__key plan-chart__key--price" />收盘价（后复权）</li>
        <li><i className="plan-chart__key plan-chart__key--hold" />规则持仓段（买→卖，适合持有）</li>
        <li><i className="plan-chart__key plan-chart__key--buy">▲</i>买入 <i className="plan-chart__key plan-chart__key--sell">▼</i>卖出（均为信号次日成交价）</li>
      </ul>
      {failed ? <p role="alert" className="plan-chart__note">{failed}</p> : <div ref={host} className="plan-chart__canvas" role="img" aria-label={`${plan?.name}：区间内 ${trades.length} 个买卖信号，当前${holding ? '规则持有中' : '空仓'}`} />}
      <p className="plan-chart__note">粗线 = 规则认为该持有的时段；没有粗线 = 规则认为不该出手。{plan?.pendingBuy ? `当前有待买信号（${plan.pendingBuy.signalDate} 金叉，下一交易日进场）。` : ''}历史信号不代表未来，不是买卖指令。</p>
    </section>
  )
}
