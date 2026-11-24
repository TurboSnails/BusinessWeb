import React, { useId, useMemo, useState } from 'react'
import { clientXToSvgX } from '../macro-posture/composite/timeline/chartMath'
import ZoomChartDialog from './ZoomChart'
import type { RadarOverlay } from './types'

const W = 220
const H = 48
const PAD = 5

const UNIT_PATTERN = /([+\-−]?)(\d+(?:\.\d+)?)\s*(%|个基点|个百分点|倍|点)/g

function withMinus(text: string, value: number, signed: boolean): string {
  if (value < 0 && Number(text) !== 0) return `−${text}`
  if (signed && value > 0 && Number(text) !== 0) return `+${text}`
  return text
}

/**
 * 按指标读数句子里的单位格式化折线上的数值：在句子里找与最新观测（按句中小数位四舍五入后）
 * 相等的那个数，沿用它的单位、小数位与是否带正号；找不到时保留两位小数、不带单位。
 */
export function sparkFormatter(display: string | undefined, latest: number): (value: number) => string {
  let best: { decimals: number; unit: string; signed: boolean; distance: number } | null = null
  if (display && Number.isFinite(latest)) {
    for (const match of display.matchAll(UNIT_PATTERN)) {
      const [, sign, digits, unit] = match
      const decimals = digits.includes('.') ? digits.split('.')[1].length : 0
      const value = (sign === '-' || sign === '−' ? -1 : 1) * Number(digits)
      const distance = Math.abs(value - latest)
      if (distance > 0.5 * 10 ** -decimals + 1e-9) continue
      if (!best || distance < best.distance) best = { decimals, unit, signed: sign === '+', distance }
    }
  }
  if (!best) {
    return value => withMinus(Math.abs(value).toFixed(2), value, false)
  }
  const { decimals, unit, signed } = best
  const joiner = unit === '%' ? '' : ' '
  return value => `${withMinus(Math.abs(value).toFixed(decimals), value, signed)}${joiner}${unit}`
}

/** viewBox 横坐标 → 最近的观测下标 */
export function sparkIndexAt(svgX: number, count: number): number {
  if (count <= 1) return 0
  const ratio = (svgX - PAD) / (W - PAD * 2)
  return Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1))))
}

/** 迷你折线：指标历史；指针悬停、轻触或 ← → 查看各点日期与数值，双击或点「放大」打开可缩放的大图。simple = 行内只画线与末点 */
export default function MiniSparkline({
  history,
  label,
  display,
  overlays,
  simple = false,
}: {
  history: [string, number][]
  label: string
  /** 指标读数句子，用来推断数值单位 */
  display?: string
  /** 只在放大图里叠加的辅助序列 */
  overlays?: RadarOverlay[]
  /** 行内迷你图：去掉交互，只画线与末点 */
  simple?: boolean
}): JSX.Element | null {
  const titleId = useId()
  const hintId = useId()
  const [active, setActive] = useState<number | null>(null)
  const [zoomed, setZoomed] = useState(false)
  const count = history.length
  const latestValue = count ? history[count - 1][1] : Number.NaN
  const format = useMemo(() => sparkFormatter(display, latestValue), [display, latestValue])
  if (count < 2) return null

  const values = history.map(([, v]) => v)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  const x = (i: number) => PAD + (i / (count - 1)) * (W - PAD * 2)
  const y = (v: number) => PAD + (1 - (v - lo) / span) * (H - PAD * 2)
  const d = history.map(([, v], i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const lastIndex = count - 1
  const last = history[lastIndex]
  const first = history[0]
  const shownIndex = active === null ? null : Math.min(active, lastIndex)
  const shown = shownIndex === null ? null : history[shownIndex]

  if (simple) {
    return (
      <figure className="mr-spark mr-spark--simple" data-testid="mr-sparkline">
        <svg className="mr-spark__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={titleId}>
          <title id={titleId}>
            {label}：{first[0]} 至 {last[0]}，最新 {format(last[1])}
          </title>
          <path className="mr-spark__line" d={d} />
          <circle className="mr-spark__dot mr-spark__dot--latest" cx={x(lastIndex)} cy={y(last[1])} r={3} />
        </svg>
      </figure>
    )
  }

  const pick = (event: React.PointerEvent<SVGSVGElement>): void => {
    setActive(sparkIndexAt(clientXToSvgX(event.currentTarget, event.clientX), count))
  }

  const onKeyDown = (event: React.KeyboardEvent<SVGSVGElement>): void => {
    const current = shownIndex ?? lastIndex
    let next: number | null = current
    if (event.key === 'ArrowLeft') next = shownIndex === null ? lastIndex : Math.max(0, current - 1)
    else if (event.key === 'ArrowRight') next = shownIndex === null ? lastIndex : Math.min(lastIndex, current + 1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = lastIndex
    else if (event.key === 'Escape') next = null
    else return
    event.preventDefault()
    setActive(next)
  }

  return (
    <figure className="mr-spark" data-testid="mr-sparkline">
      <svg
        className="mr-spark__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={titleId}
        aria-describedby={hintId}
        tabIndex={0}
        data-active-index={shownIndex ?? ''}
        onPointerDown={event => {
          if (event.pointerType === 'mouse' && event.button !== 0) return
          pick(event)
        }}
        onPointerMove={pick}
        onPointerLeave={event => {
          // 触屏抬手后保留读数，鼠标移出才收起
          if (event.pointerType === 'mouse') setActive(null)
        }}
        onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); setZoomed(true); return }
          onKeyDown(event)
        }}
        onDoubleClick={() => setZoomed(true)}
        onBlur={() => setActive(null)}
      >
        <title id={titleId}>
          {label}：{first[0]} 至 {last[0]}，最新 {format(last[1])}
        </title>
        <path className="mr-spark__line" d={d} />
        {shown && shownIndex !== null ? (
          <line
            className="mr-spark__cursor"
            x1={x(shownIndex)}
            x2={x(shownIndex)}
            y1={1}
            y2={H - 1}
          />
        ) : null}
        <circle className="mr-spark__dot mr-spark__dot--latest" cx={x(lastIndex)} cy={y(last[1])} r={3} />
        {shown && shownIndex !== null && shownIndex !== lastIndex ? (
          <circle className="mr-spark__dot mr-spark__dot--active" cx={x(shownIndex)} cy={y(shown[1])} r={3} />
        ) : null}
      </svg>
      <figcaption className="mr-spark__cap">
        <span className="mr-spark__readout" data-testid="mr-spark-readout" aria-live="polite">
          {shown ? (
            <>
              <time dateTime={shown[0]}>{shown[0]}</time>
              {' · '}
              <strong>{format(shown[1])}</strong>
              {shownIndex === lastIndex ? '（最新）' : ''}
            </>
          ) : (
            <>
              {'最新 '}
              <time dateTime={last[0]}>{last[0]}</time>
              {' · '}
              <strong>{format(last[1])}</strong>
            </>
          )}
        </span>
        <span className="mr-spark__range">
          {first[0].slice(0, 7)} → {last[0].slice(0, 7)}
          <button type="button" className="mr-spark__zoom" onClick={() => setZoomed(true)} aria-label={`放大查看${label}`}>放大</button>
        </span>
        <span className="visually-hidden" id={hintId}>悬停、轻触或用左右方向键查看各点的日期与数值；双击或按回车打开大图</span>
      </figcaption>
      <ZoomChartDialog open={zoomed} onClose={() => setZoomed(false)} history={history} label={label} format={format} overlays={overlays} />
    </figure>
  )
}
