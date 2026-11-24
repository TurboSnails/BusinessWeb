import React, { useEffect, useMemo, useRef, useState } from 'react'
import { logTicks, tickLabel } from './ZoomChart'
import { formatNum2, visibleText } from './labels'
import type { RadarFile, RadarStrategyId } from './types'

export type CurvePreset = 'all' | 'since2000' | 'y10'
export type CurveMode = 'equity' | 'drawdown'

type CurveRow = RadarFile['backtest']['curves'][number]

const SERIES: { id: RadarStrategyId; label: string; dash: string | undefined }[] = [
  { id: 'radar', label: '市场雷达', dash: undefined },
  { id: 'trend', label: '10 个月均线', dash: '7 4' },
  { id: 'buyhold', label: '全程持有标普', dash: '2 3' },
  { id: 'static70', label: '恒定七成股票', dash: '9 3 2 3' },
]

const PRESETS: { id: CurvePreset; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'since2000', label: '2000 年以来' },
  { id: 'y10', label: '近 10 年' },
]

const LEFT = 48
const RIGHT_WITH_LABELS = 96
const RIGHT_BARE = 16
const TOP = 18
const BOTTOM = 32
/** 末端标签最小垂直间距（≥ 实际字高约 13px） */
export const END_LABEL_GAP = 15
const MIN_CHART_H = 220
const DESKTOP_CHART_H = 280

export function sliceCurveRange(
  curves: readonly CurveRow[],
  preset: CurvePreset,
): { start: number; end: number } {
  const end = Math.max(0, curves.length - 1)
  if (preset === 'all' || curves.length === 0) return { start: 0, end }
  if (preset === 'since2000') {
    const idx = curves.findIndex(row => row.d >= '2000-01')
    return { start: idx < 0 ? 0 : idx, end }
  }
  const span = Math.min(119, end)
  return { start: end - span, end }
}

export function renormalizeCurve(
  curves: readonly CurveRow[],
  range: { start: number; end: number },
  id: RadarStrategyId,
): number[] {
  const base = curves[range.start]?.[id]
  if (!(base > 0)) return []
  const out: number[] = []
  for (let i = range.start; i <= range.end; i++) {
    out.push(curves[i][id] / base)
  }
  return out
}

export function toDrawdown(values: readonly number[]): number[] {
  if (values.length === 0) return []
  let peak = values[0]
  return values.map(v => {
    if (v > peak) peak = v
    return peak > 0 ? v / peak - 1 : 0
  })
}

/** 横轴年份刻度：5–7 个，落在新年份边界上 */
export function yearAxisTicks(
  curves: readonly CurveRow[],
  range: { start: number; end: number },
  maxTicks = 7,
): { index: number; label: string }[] {
  const boundaries: { index: number; label: string }[] = []
  for (let i = range.start; i <= range.end; i++) {
    const year = curves[i].d.slice(0, 4)
    if (i === range.start || year !== curves[i - 1].d.slice(0, 4)) {
      boundaries.push({ index: i, label: year })
    }
  }
  if (boundaries.length === 0) return []
  if (boundaries.length <= maxTicks) return boundaries
  const every = Math.max(1, Math.ceil(boundaries.length / maxTicks))
  const nice = boundaries.filter(({ label }, n) => {
    const y = Number(label)
    if (n === 0 || n === boundaries.length - 1) return true
    return y % (every <= 2 ? 5 : 10) === 0 || n % every === 0
  })
  // 去重后仍可能偏多，均匀抽
  if (nice.length <= maxTicks) return nice
  const step = Math.ceil(nice.length / maxTicks)
  return nice.filter((_, n) => n % step === 0 || n === nice.length - 1)
}

/**
 * 末端标签错开：间距 ≥ gap；仍放不下则返回 null（不画标签）。
 */
export function placeEndLabels(
  items: { id: string; label: string; y: number }[],
  opts: { top: number; bottom: number; gap?: number },
): { id: string; label: string; y: number }[] | null {
  if (items.length === 0) return []
  const gap = opts.gap ?? END_LABEL_GAP
  const lo = opts.top + 4
  const hi = opts.bottom - 2
  if (hi - lo < gap * (items.length - 1)) return null
  const sorted = [...items].sort((a, b) => a.y - b.y)
  const out: { id: string; label: string; y: number }[] = []
  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i]
    const y = i === 0 ? item.y : Math.max(item.y, out[i - 1].y + gap)
    out.push({ ...item, y })
  }
  if (out[out.length - 1].y > hi) {
    const shift = out[out.length - 1].y - hi
    for (const row of out) row.y -= shift
  }
  if (out[0].y < lo) {
    const shift = lo - out[0].y
    for (const row of out) row.y += shift
  }
  if (out[out.length - 1].y > hi + 0.5) return null
  for (let i = 1; i < out.length; i++) {
    if (out[i].y - out[i - 1].y < gap - 0.5) return null
  }
  return out
}

function niceLinearTicks(lo: number, hi: number, maxTicks = 5): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi === lo) return [lo]
  const raw = (hi - lo) / Math.max(1, maxTicks - 1)
  const power = 10 ** Math.floor(Math.log10(Math.abs(raw) || 1))
  const step = [1, 2, 2.5, 5, 10].map(m => m * power).find(s => s >= raw) ?? raw
  const ticks: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) {
    ticks.push(Math.round(v / step) * step)
  }
  return ticks
}

function formatEquity(value: number): string {
  return visibleText(formatNum2(value))
}

function formatDd(value: number): string {
  return visibleText(`${(value * 100).toFixed(1)}%`.replace(/^-/, '−'))
}

export default function EquityCurves({
  curves,
}: {
  curves: RadarFile['backtest']['curves']
}): JSX.Element | null {
  const [preset, setPreset] = useState<CurvePreset>('all')
  const [mode, setMode] = useState<CurveMode>('equity')
  const [hidden, setHidden] = useState<Set<RadarStrategyId>>(() => new Set())
  const [pointer, setPointer] = useState<number | null>(null)
  const [size, setSize] = useState({ width: 720, height: DESKTOP_CHART_H })
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = (): void => {
      const measured = Math.round(el.clientWidth || el.getBoundingClientRect().width)
      if (measured <= 0) return
      const height = measured <= 560 ? Math.max(MIN_CHART_H, 240) : DESKTOP_CHART_H
      setSize(current => (
        current.width === measured && current.height === height
          ? current
          : { width: measured, height }
      ))
    }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const range = useMemo(() => sliceCurveRange(curves, preset), [curves, preset])
  const span = Math.max(1, range.end - range.start)
  const W = size.width
  const H = size.height

  const series = useMemo(() => SERIES.map(s => {
    const equity = renormalizeCurve(curves, range, s.id)
    const values = mode === 'drawdown' ? toDrawdown(equity) : equity
    return { ...s, equity, values }
  }), [curves, range, mode])

  const visible = series.filter(s => !hidden.has(s.id) && s.values.length > 0)

  const yDomain = useMemo(() => {
    const vals = visible.flatMap(s => s.values).filter(Number.isFinite)
    if (vals.length === 0) return mode === 'drawdown' ? { lo: -0.5, hi: 0 } : { lo: 0.5, hi: 2 }
    if (mode === 'drawdown') {
      const lo = Math.min(...vals, -0.01)
      return { lo, hi: 0 }
    }
    const lo = Math.min(...vals.filter(v => v > 0), 1)
    const hi = Math.max(...vals.filter(v => v > 0), 1)
    return { lo: lo * 0.98, hi: hi * 1.02 }
  }, [visible, mode])

  const rawEnds = visible.map(s => {
    const last = s.values[s.values.length - 1]
    return last == null ? null : { id: s.id, label: s.label, y: 0 as number, value: last }
  }).filter(Boolean) as { id: RadarStrategyId; label: string; y: number; value: number }[]

  // 先用临时 RIGHT 算 y，再决定要不要末端标签
  const yAt = (v: number, right: number) => {
    void right
    if (mode === 'drawdown') {
      const spanY = yDomain.hi - yDomain.lo || 1
      return TOP + ((yDomain.hi - v) / spanY) * (H - TOP - BOTTOM)
    }
    const logLo = Math.log(Math.max(yDomain.lo, 1e-9))
    const logHi = Math.log(Math.max(yDomain.hi, 1e-9))
    const spanY = logHi - logLo || 1
    return TOP + ((logHi - Math.log(Math.max(v, 1e-9))) / spanY) * (H - TOP - BOTTOM)
  }

  const trialEnds = rawEnds.map(e => ({ id: e.id, label: e.label, y: yAt(e.value, RIGHT_WITH_LABELS) }))
  const placedEnds = placeEndLabels(trialEnds, {
    top: TOP,
    bottom: H - BOTTOM,
    gap: END_LABEL_GAP,
  })
  // 窄屏放不下长标签时放弃末端文字
  const showEnds = placedEnds != null && W >= 420
  const RIGHT = showEnds ? RIGHT_WITH_LABELS : RIGHT_BARE

  const x = (i: number) => LEFT + ((i - range.start) / span) * (W - LEFT - RIGHT)
  const y = (v: number) => yAt(v, RIGHT)

  const ticks = mode === 'drawdown'
    ? niceLinearTicks(yDomain.lo, yDomain.hi)
    : logTicks(Math.max(yDomain.lo, 1e-9), Math.max(yDomain.hi, 1e-9))

  const xTicks = yearAxisTicks(curves, range, W < 500 ? 5 : 7)

  const pathOf = (values: number[]) => values.map((v, i) => {
    const xi = x(range.start + i)
    const yi = y(v)
    return `${i === 0 ? 'M' : 'L'}${xi.toFixed(1)},${yi.toFixed(1)}`
  }).join(' ')

  const toggle = (id: RadarStrategyId) => setHidden(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const indexAtClientX = (clientX: number): number => {
    const svg = svgRef.current
    if (!svg) return range.end
    const box = svg.getBoundingClientRect()
    const viewW = svg.viewBox.baseVal.width || W
    const svgX = ((clientX - box.left) / (box.width || 1)) * viewW
    const ratio = Math.max(0, Math.min(1, (svgX - LEFT) / Math.max(1, W - LEFT - RIGHT)))
    return Math.round(range.start + ratio * span)
  }

  const shownIndex = pointer === null
    ? null
    : Math.max(range.start, Math.min(range.end, pointer))

  const onKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    const current = shownIndex ?? range.end
    if (event.key === 'ArrowLeft') {
      setPointer(Math.max(range.start, current - 1))
      event.preventDefault()
    } else if (event.key === 'ArrowRight') {
      setPointer(Math.min(range.end, current + 1))
      event.preventDefault()
    }
  }

  if (curves.length < 2) return null

  const endDate = curves[range.end]?.d ?? ''
  const tipDate = shownIndex != null ? curves[shownIndex]?.d : null

  return (
    <div className="mr-eq" data-testid="mr-equity-curves">
      <h3 className="mr-subhead">净值曲线</h3>
      <p className="mr-muted mr-eq__note">区间起点净值归一为 1；对数纵轴。可切换回撤视图。</p>

      <div className="mr-eq__toolbar" role="toolbar" aria-label="净值曲线控件">
        <div className="mr-eq__presets" role="group" aria-label="区间">
          {PRESETS.map(p => (
            <button
              key={p.id}
              type="button"
              className={`mr-eq__chip${preset === p.id ? ' is-on' : ''}`}
              aria-pressed={preset === p.id}
              onClick={() => { setPreset(p.id); setPointer(null) }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="mr-eq__modes" role="group" aria-label="视图">
          <button
            type="button"
            className={`mr-eq__chip${mode === 'equity' ? ' is-on' : ''}`}
            aria-pressed={mode === 'equity'}
            onClick={() => setMode('equity')}
          >
            净值
          </button>
          <button
            type="button"
            className={`mr-eq__chip${mode === 'drawdown' ? ' is-on' : ''}`}
            aria-pressed={mode === 'drawdown'}
            onClick={() => setMode('drawdown')}
          >
            回撤
          </button>
        </div>
      </div>

      <div className="mr-eq__legend" role="group" aria-label="图例，点击隐藏或显示">
        {SERIES.map(s => (
          <button
            key={s.id}
            type="button"
            className={`mr-eq__key mr-eq__key--${s.id}`}
            aria-pressed={!hidden.has(s.id)}
            onClick={() => toggle(s.id)}
          >
            <i aria-hidden="true" />
            {s.label}
          </button>
        ))}
      </div>

      <div ref={wrapRef} className="mr-eq__frame">
        <svg
          ref={svgRef}
          className="mr-eq__svg"
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          role="img"
          tabIndex={0}
          data-testid="mr-eq-chart"
          data-mode={mode}
          data-width={W}
          data-height={H}
          aria-label="四条策略净值曲线"
          onPointerMove={e => setPointer(indexAtClientX(e.clientX))}
          onPointerLeave={() => setPointer(null)}
          onFocus={() => setPointer(current => current ?? range.end)}
          onKeyDown={onKeyDown}
        >
          <title>策略净值曲线</title>
          <g data-testid="mr-eq-yaxis">
            {ticks.map(tick => {
              const yy = y(mode === 'drawdown' ? tick : Math.max(tick, 1e-9))
              const label = mode === 'drawdown' ? formatDd(tick) : tickLabel(tick)
              return (
                <g key={`${mode}-${tick}`}>
                  <line className="mr-eq__grid" x1={LEFT} x2={W - RIGHT} y1={yy} y2={yy} />
                  <text className="mr-eq__tick" x={LEFT - 6} y={yy + 4} textAnchor="end">{label}</text>
                </g>
              )
            })}
            <text className="mr-eq__tick mr-eq__tick--axis" x={LEFT - 6} y={TOP - 4} textAnchor="end">
              {mode === 'drawdown' ? '回撤' : '净值'}
            </text>
          </g>
          <g data-testid="mr-eq-xaxis">
            {xTicks.map(tick => (
              <text
                key={tick.index}
                className="mr-eq__tick"
                x={x(tick.index)}
                y={H - 10}
                textAnchor="middle"
              >
                {tick.label}
              </text>
            ))}
          </g>

          {visible.map(s => (
            <path
              key={s.id}
              className={`mr-eq__line mr-eq__line--${s.id}`}
              data-series={s.id}
              d={pathOf(s.values)}
              fill="none"
              strokeDasharray={s.dash}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {showEnds && placedEnds
            ? placedEnds.map(s => (
              <text
                key={`label-${s.id}`}
                className={`mr-eq__end-label mr-eq__end-label--${s.id}`}
                data-end-label={s.id}
                x={W - RIGHT + 6}
                y={s.y + 4}
              >
                {s.label}
              </text>
            ))
            : null}

          {shownIndex != null && tipDate ? (
            <g data-testid="mr-eq-tip">
              <line
                className="mr-eq__cursor"
                x1={x(shownIndex)}
                x2={x(shownIndex)}
                y1={TOP}
                y2={H - BOTTOM}
              />
              <text className="mr-eq__tip-date" x={x(shownIndex)} y={TOP + 12} textAnchor="middle">
                {tipDate}
              </text>
              {visible.map((s, i) => {
                const local = shownIndex - range.start
                const v = s.values[local]
                if (v == null) return null
                const text = mode === 'drawdown' ? formatDd(v) : formatEquity(v)
                return (
                  <text
                    key={`tip-${s.id}`}
                    className={`mr-eq__tip-row mr-eq__tip-row--${s.id}`}
                    x={Math.min(x(shownIndex) + 8, W - RIGHT - 4)}
                    y={TOP + 28 + i * 14}
                  >
                    {s.label} {text}
                  </text>
                )
              })}
            </g>
          ) : null}
        </svg>
      </div>

      <p className="mr-eq__text" data-testid="mr-eq-text">
        {endDate} 区间末
        {SERIES.map(s => {
          const row = series.find(item => item.id === s.id)
          const v = row?.equity[row.equity.length - 1]
          return (
            <span key={s.id}>
              {' '}· {s.label}{' '}
              <span data-testid={`mr-eq-end-${s.id}`}>{v == null ? '—' : formatEquity(v)}</span>
            </span>
          )
        })}
      </p>
    </div>
  )
}
