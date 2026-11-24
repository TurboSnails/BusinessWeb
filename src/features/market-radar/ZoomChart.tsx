import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Dialog } from '../../components/ui/Dialog'
import {
  clamp,
  clientXToSvgX,
  normalizeRange,
  panRange,
  zoomRange,
  type VisibleRange,
} from '../macro-posture/composite/timeline/chartMath'
import type { RadarOverlay } from './types'

const W = 720
const H = 320
const LEFT = 56
const TOP = 14
const BOTTOM = 30
const PLOT_H = H - TOP - BOTTOM
/** 没有叠加序列时右侧只留边距；有叠加时留出右侧对数坐标的刻度 */
const RIGHT_PLAIN = 16
const RIGHT_AXIS = 56
/** 至少保留 10 个观测，避免放大到只剩一两个点 */
const MIN_SPAN = 10
/** 拖动超过这个像素才算平移，否则视为点击（定位指针） */
const DRAG_THRESHOLD = 4

/** 纵轴刻度：取 1、2、2.5、5 × 10^n 的整齐步长，最多约 5 个 */
export function niceTicks(lo: number, hi: number, maxTicks = 5): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return []
  if (hi === lo) return [lo]
  const raw = (hi - lo) / Math.max(1, maxTicks - 1)
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(m => m * power).find(s => s >= raw) ?? raw
  const ticks: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) ticks.push(Math.round(v / step) * step)
  return ticks
}

/** 刻度只写数字（负号用 −），单位统一放在工具栏 */
export function tickLabel(value: number): string {
  const text = String(Number(value.toFixed(6)))
  return text.startsWith('-') ? `−${text.slice(1)}` : text
}

/** 从格式化后的读数里取出单位，例如「1.99 个百分点」→「个百分点」 */
export function unitOf(formatted: string): string {
  return formatted.replace(/^[+\-−]?[\d.,]+\s*/, '').trim()
}

/** 对数坐标刻度：1、2、5 × 10^n 中落在区间内的值；跨度太大时只取 10 的整数次幂 */
export function logTicks(lo: number, hi: number): number[] {
  if (!(lo > 0) || !(hi > 0)) return []
  const ticks: number[] = []
  const decades = Math.log10(hi) - Math.log10(lo)
  const steps = decades > 2.5 ? [1] : [1, 2, 5]
  for (let p = Math.floor(Math.log10(lo)); p <= Math.ceil(Math.log10(hi)); p++) {
    for (const m of steps) {
      const v = m * 10 ** p
      if (v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9)) ticks.push(Number(v.toPrecision(6)))
    }
  }
  return ticks
}

/** 叠加序列配色：按 id 取约定色，其余按顺序取备用色 */
const OVERLAY_CLASS: Record<string, string> = { gold: 'mr-zoom__ov--gold', silver: 'mr-zoom__ov--silver', spx: 'mr-zoom__ov--spx' }
const overlayClass = (id: string, index: number) => OVERLAY_CLASS[id] ?? `mr-zoom__ov--${index % 2 ? 'b' : 'a'}`

/** 右轴说明：单位相同的序列合并写，例如「黄金、白银为美元/盎司，标普 500 为点」 */
export function rightAxisNote(overlays: { label: string; unit: string }[]): string {
  const units = [...new Set(overlays.map(o => o.unit))]
  if (units.length <= 1) return `右轴：${units[0] ?? ''}，对数`
  const parts = units.map(unit => {
    const names = overlays.filter(o => o.unit === unit).map(o => o.label).join('、')
    // 西文或数字结尾与中文之间留空格，如「标普 500 为点」
    return `${names}${/[A-Za-z0-9]$/.test(names) ? ' ' : ''}为${unit}`
  })
  return `右轴对数：${parts.join('，')}`
}

/** 叠加序列读数：千位分隔，按量级保留小数 */
export function formatPrice(value: number): string {
  const digits = Math.abs(value) >= 1000 ? 0 : Math.abs(value) >= 10 ? 1 : 2
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** 横轴刻度：按可见跨度选年、季或月，均匀挑出不超过 maxTicks 个落在刻度边界上的观测 */
export function dateTicks(dates: string[], range: VisibleRange, maxTicks = 7): { index: number; label: string }[] {
  const from = dates[range.start]
  const to = dates[range.end]
  if (!from || !to) return []
  const years = (Date.parse(to) - Date.parse(from)) / (365.2425 * 86_400_000)
  const key = years > 3 ? (d: string) => d.slice(0, 4) : years > 0.75 ? (d: string) => `${d.slice(0, 4)}-Q${Math.ceil(Number(d.slice(5, 7)) / 3)}` : (d: string) => d.slice(0, 7)
  const label = years > 3 ? (d: string) => d.slice(0, 4) : (d: string) => d.slice(0, 7)
  const boundaries: number[] = []
  for (let i = range.start + 1; i <= range.end; i++) if (key(dates[i]) !== key(dates[i - 1])) boundaries.push(i)
  const every = Math.max(1, Math.ceil(boundaries.length / maxTicks))
  // 年份刻度取整齐的倍数（每 5 年、10 年……），其余按间隔抽取
  const picked = years > 3
    ? boundaries.filter(i => Number(dates[i].slice(0, 4)) % every === 0)
    : boundaries.filter((_, n) => n % every === 0)
  return picked.map(index => ({ index, label: label(dates[index]) }))
}

export default function ZoomChartDialog({
  open,
  onClose,
  history,
  label,
  format,
  overlays = [],
}: {
  open: boolean
  onClose: () => void
  history: [string, number][]
  label: string
  format: (value: number) => string
  /** 叠加的辅助序列（右侧对数坐标），日期按主序列对齐 */
  overlays?: RadarOverlay[]
}): JSX.Element | null {
  const total = history.length
  const right = overlays.length ? RIGHT_AXIS : RIGHT_PLAIN
  const plotW = W - LEFT - right
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  // 默认每条叠加线按自己的可见区间缩放（对数），避免价位悬殊时高价序列被压平；可切回同一对数轴
  const [sharedAxis, setSharedAxis] = useState(false)
  const overlayValues = useMemo(() => overlays.map(overlay => {
    const byDate = new Map(overlay.history)
    return history.map(([date]) => byDate.get(date) ?? null)
  }), [overlays, history])
  const full = useMemo(() => normalizeRange({ start: 0, end: total - 1 }, total, MIN_SPAN), [total])
  const [range, setRange] = useState<VisibleRange>(full)
  const [pointer, setPointer] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; range: VisibleRange; moved: boolean } | null>(null)

  useEffect(() => {
    if (open) {
      setRange(full)
      setPointer(null)
    }
  }, [open, full])

  // 滚轮缩放需要阻止页面滚动，React 的 onWheel 是被动监听，只能手动注册
  useEffect(() => {
    const svg = svgRef.current
    if (!open || !svg) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const ratio = clamp((clientXToSvgX(svg, event.clientX) - LEFT) / plotW, 0, 1)
      const factor = Math.exp(clamp(event.deltaY, -200, 200) * 0.002)
      setRange(current => zoomRange(current, total, ratio, factor, MIN_SPAN))
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [open, total, plotW])

  if (!open || total < 2) return null

  const span = range.end - range.start
  const visible = history.slice(range.start, range.end + 1)
  const values = visible.map(([, v]) => v)
  const rawLo = Math.min(...values)
  const rawHi = Math.max(...values)
  const pad = (rawHi - rawLo || Math.abs(rawHi) || 1) * 0.06
  const lo = rawLo - pad
  const hi = rawHi + pad
  const x = (i: number) => LEFT + ((i - range.start) / span) * plotW
  const y = (v: number) => TOP + (1 - (v - lo) / (hi - lo)) * PLOT_H
  const d = visible.map(([, v], k) => `${k ? 'L' : 'M'}${x(range.start + k).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const yTicks = niceTicks(rawLo, rawHi)
  const xTicks = dateTicks(history.map(([date]) => date), range)
  const zero = lo < 0 && hi > 0 ? y(0) : null
  const shownIndex = pointer === null ? null : clamp(pointer, range.start, range.end)
  const shown = shownIndex === null ? null : history[shownIndex]
  const isFull = range.start === full.start && range.end === full.end

  // 叠加序列的纵向位置：各自缩放时每条线用自己在可见区间内的对数范围；同一对数轴时共用一个范围
  const visibleOf = (values: (number | null)[]) => values.slice(range.start, range.end + 1)
    .filter((v): v is number => v != null && v > 0)
  const logScale = (visible: number[]) => {
    const lo = visible.length ? Math.min(...visible) / 1.06 : 1
    const hi = visible.length ? Math.max(...visible) * 1.06 : 10
    return { lo, hi, at: (v: number) => TOP + (1 - (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo) || 1)) * PLOT_H }
  }
  const visibleOverlays = overlays.map((overlay, index) => ({ overlay, index, values: overlayValues[index] }))
    .filter(({ overlay }) => !hidden.has(overlay.id))
  const shared = logScale(visibleOverlays.flatMap(({ values }) => visibleOf(values)))
  const shownOverlays = visibleOverlays.map(item => ({ ...item, ly: sharedAxis ? shared.at : logScale(visibleOf(item.values)).at }))
  const rightTicks = sharedAxis && visibleOverlays.length ? logTicks(shared.lo, shared.hi) : []
  const ly = shared.at
  // 各自缩放时右侧标注每条线在可见区间最后一个点的数值，按纵向位置错开，至少相隔 13 个单位
  const endLabels = sharedAxis ? [] : shownOverlays.flatMap(({ overlay, index, values, ly: at }) => {
    for (let i = range.end; i >= range.start; i--) {
      const v = values[i]
      if (v != null && v > 0) return [{ id: overlay.id, cls: overlayClass(overlay.id, index), text: formatPrice(v), y: at(v) }]
    }
    return []
  }).sort((a, b) => a.y - b.y).reduce<{ id: string; cls: string; text: string; y: number }[]>((placed, label) => {
    const prev = placed.at(-1)
    placed.push(prev && label.y - prev.y < 13 ? { ...label, y: prev.y + 13 } : label)
    return placed
  }, [])
  const overlayPath = (values: (number | null)[], at: (v: number) => number) => {
    let path = ''
    let pen = false
    for (let i = range.start; i <= range.end; i++) {
      const v = values[i]
      if (v == null || !(v > 0)) { pen = false; continue }
      path += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${at(v).toFixed(1)}`
      pen = true
    }
    return path
  }
  const toggle = (id: string) => setHidden(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const indexAt = (clientX: number): number => {
    const svg = svgRef.current
    if (!svg) return range.end
    const ratio = clamp((clientXToSvgX(svg, clientX) - LEFT) / plotW, 0, 1)
    return Math.round(range.start + ratio * span)
  }
  const pan = (delta: number) => setRange(current => panRange(current, total, delta, MIN_SPAN))
  const zoom = (factor: number) => setRange(current => zoomRange(current, total, 0.5, factor, MIN_SPAN))
  const step = Math.max(1, Math.round(span / 4))

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drag.current = { x: event.clientX, range, moved: false }
    setPointer(indexAt(event.clientX))
  }
  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const state = drag.current
    if (state) {
      const svg = svgRef.current
      const dx = event.clientX - state.x
      if (!state.moved && Math.abs(dx) < DRAG_THRESHOLD) return
      state.moved = true
      if (svg) {
        const width = svg.getBoundingClientRect().width || W
        const delta = -Math.round((dx / width) * (W / plotW) * (state.range.end - state.range.start))
        setRange(panRange(state.range, total, delta, MIN_SPAN))
      }
      return
    }
    setPointer(indexAt(event.clientX))
  }
  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    drag.current = null
  }
  const onKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    const current = shownIndex ?? range.end
    if (event.key === 'ArrowLeft' && event.shiftKey) pan(-step)
    else if (event.key === 'ArrowRight' && event.shiftKey) pan(step)
    else if (event.key === 'ArrowLeft') setPointer(Math.max(range.start, current - 1))
    else if (event.key === 'ArrowRight') setPointer(Math.min(range.end, current + 1))
    else if (event.key === '+' || event.key === '=') zoom(0.7)
    else if (event.key === '-') zoom(1 / 0.7)
    else if (event.key === '0') setRange(full)
    else return
    event.preventDefault()
  }

  // 指针处的叠加读数（隐藏的序列不列出）
  const tipRows = shownIndex === null ? [] : shownOverlays.flatMap(({ overlay, index, values }) => {
    const v = values[shownIndex]
    return v != null ? [{ id: overlay.id, label: overlay.label, text: formatPrice(v), cls: overlayClass(overlay.id, index) }] : []
  })
  const tipW = tipRows.length ? 150 : 132

  // 提示框贴着指针，靠右时翻到左边
  const tipX = shownIndex === null ? 0 : x(shownIndex)
  const tipLeft = tipX > LEFT + plotW * 0.6

  const unit = unitOf(format(history[total - 1][1]))

  // 挂到 body 上：迷你图所在的指标行可能折叠或裁切，弹框不应受其影响
  return createPortal(
    <Dialog open={open} onClose={onClose} title={label} size="lg" className="mr-zoom">
      <div className="mr-zoom__toolbar">
        <button type="button" className="mr-zoom__btn" onClick={() => pan(-step)} disabled={range.start === 0} aria-label="向左移动">◀</button>
        <button type="button" className="mr-zoom__btn" onClick={() => pan(step)} disabled={range.end === total - 1} aria-label="向右移动">▶</button>
        <button type="button" className="mr-zoom__btn" onClick={() => zoom(0.7)} disabled={span <= Math.min(MIN_SPAN, total - 1)} aria-label="放大">＋</button>
        <button type="button" className="mr-zoom__btn" onClick={() => zoom(1 / 0.7)} disabled={isFull} aria-label="缩小">－</button>
        <button type="button" className="mr-zoom__btn mr-zoom__btn--text" onClick={() => setRange(full)} disabled={isFull}>全部</button>
        {unit && <span className="mr-zoom__unit">单位：{unit}</span>}
        {overlays.length > 0 && (
          <span className="mr-zoom__legend" data-testid="mr-zoom-legend">
            <span className="mr-zoom__key mr-zoom__key--main"><i aria-hidden="true" />{label}（左轴）</span>
            {overlays.map((overlay, index) => (
              <button
                key={overlay.id}
                type="button"
                className={`mr-zoom__key ${overlayClass(overlay.id, index)}`}
                aria-pressed={!hidden.has(overlay.id)}
                onClick={() => toggle(overlay.id)}
              >
                <i aria-hidden="true" />{overlay.label}
              </button>
            ))}
            <button
              type="button"
              className="mr-zoom__btn mr-zoom__btn--text mr-zoom__scale"
              aria-pressed={sharedAxis}
              onClick={() => setSharedAxis(value => !value)}
              title="切换叠加线的纵轴：各自缩放或同一对数轴"
            >
              {sharedAxis ? '同一对数轴' : '各自缩放'}
            </button>
            <span className="mr-zoom__unit">
              {sharedAxis ? rightAxisNote(overlays) : '右侧各线按可见区间各自缩放（对数），右端标注最新值'}
            </span>
          </span>
        )}
        <span className="mr-zoom__span" data-testid="mr-zoom-span">
          {history[range.start][0]} → {history[range.end][0]}
        </span>
      </div>
      <svg
        ref={svgRef}
        className="mr-zoom__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${label}放大图：滚轮缩放，拖动或点击左右按钮平移，方向键移动指针`}
        tabIndex={0}
        data-testid="mr-zoom-svg"
        data-range={`${range.start}-${range.end}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={event => { if (event.pointerType === 'mouse' && !drag.current) setPointer(null) }}
        onKeyDown={onKeyDown}
      >
        <defs>
          <clipPath id="mr-zoom-clip"><rect x={LEFT} y={TOP} width={plotW} height={PLOT_H} /></clipPath>
        </defs>
        {yTicks.map(tick => (
          <g key={tick} className="mr-zoom__grid">
            <line x1={LEFT} x2={LEFT + plotW} y1={y(tick)} y2={y(tick)} />
            <text x={LEFT - 6} y={y(tick)} dy="0.32em" textAnchor="end">{tickLabel(tick)}</text>
          </g>
        ))}
        {zero !== null && <line className="mr-zoom__zero" x1={LEFT} x2={LEFT + plotW} y1={zero} y2={zero} />}
        {rightTicks.map(tick => (
          <g key={`r${tick}`} className="mr-zoom__rtick">
            <line x1={LEFT + plotW} x2={LEFT + plotW + 4} y1={ly(tick)} y2={ly(tick)} />
            <text x={LEFT + plotW + 7} y={ly(tick)} dy="0.32em">{tick.toLocaleString('en-US', { maximumFractionDigits: 2 })}</text>
          </g>
        ))}
        {xTicks.map(tick => (
          <g key={tick.index} className="mr-zoom__xtick">
            <line x1={x(tick.index)} x2={x(tick.index)} y1={TOP + PLOT_H} y2={TOP + PLOT_H + 4} />
            <text x={x(tick.index)} y={TOP + PLOT_H + 17} textAnchor="middle">{tick.label}</text>
          </g>
        ))}
        <line className="mr-zoom__axis" x1={LEFT} x2={LEFT + plotW} y1={TOP + PLOT_H} y2={TOP + PLOT_H} />
        {shownOverlays.map(({ overlay, index, values, ly: at }) => (
          <path key={overlay.id} className={`mr-zoom__ovline ${overlayClass(overlay.id, index)}`} d={overlayPath(values, at)} clipPath="url(#mr-zoom-clip)" data-testid={`mr-zoom-overlay-${overlay.id}`} />
        ))}
        {endLabels.map(label => (
          <text key={label.id} className={`mr-zoom__endlabel ${label.cls}`} x={LEFT + plotW + 5} y={label.y} dy="0.32em" data-testid={`mr-zoom-end-${label.id}`}>
            {label.text}
          </text>
        ))}
        <path className="mr-zoom__line" d={d} clipPath="url(#mr-zoom-clip)" />
        {shown && shownIndex !== null && (
          <g className="mr-zoom__pointer" data-testid="mr-zoom-pointer">
            <line x1={tipX} x2={tipX} y1={TOP} y2={TOP + PLOT_H} />
            <line x1={LEFT} x2={LEFT + plotW} y1={y(shown[1])} y2={y(shown[1])} />
            {shownOverlays.map(({ overlay, index, values, ly: at }) => {
              const v = shownIndex === null ? null : values[shownIndex]
              return v != null && v > 0
                ? <circle key={overlay.id} className={`mr-zoom__ovdot ${overlayClass(overlay.id, index)}`} cx={tipX} cy={at(v)} r={3} />
                : null
            })}
            <circle cx={tipX} cy={y(shown[1])} r={4} />
            <g transform={`translate(${tipLeft ? tipX - 10 : tipX + 10}, ${TOP + 6})`}>
              <rect className="mr-zoom__tip" x={tipLeft ? -tipW : 0} y={0} width={tipW} height={40 + tipRows.length * 16} rx={6} />
              <text x={tipLeft ? 10 - tipW : 10} y={16} className="mr-zoom__tip-date">{shown[0]}</text>
              <text x={tipLeft ? 10 - tipW : 10} y={32} className="mr-zoom__tip-value">{format(shown[1])}</text>
              {tipRows.map((row, n) => (
                <text key={row.id} x={tipLeft ? 10 - tipW : 10} y={48 + n * 16} className={`mr-zoom__tip-ov ${row.cls}`}>
                  {row.label} {row.text}
                </text>
              ))}
            </g>
          </g>
        )}
      </svg>
      <p className="mr-zoom__hint">滚轮缩放 · 按住拖动或点 ◀ ▶ 左右移动 · 移动鼠标或轻触查看指针读数 · 方向键移动指针，Shift + 方向键平移，0 复原</p>
    </Dialog>,
    document.body,
  )
}
