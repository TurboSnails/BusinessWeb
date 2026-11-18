import React, { useEffect, useRef, useState } from 'react'
import { clampWindow, extent, pointerToIndex } from './chart-geometry'
import type { FlowPoint } from './model'
import './etf-flow.css'

const W = 760, H = 300, padL = 54, padR = 58, padT = 14, padB = 24
const plotW = W - padL - padR, plotH = H - padT - padB
const OVH = 50, oPadT = 8, oPadB = 14, oPlotH = OVH - oPadT - oPadB
const fmt1 = (v: number): string => (v >= 0 ? '+' : '') + v.toFixed(2)

type Drag = 'lo' | 'hi' | 'pan'

/** 净流入红绿柱 + 上证指数折线；十字光标 + 底部范围滑块。 */
export function EtfFlowChart({ series, scope }: { series: FlowPoint[]; scope: 'all' | 'broad' }): JSX.Element | null {
  const key = scope === 'all' ? 'flow_all' : 'flow_broad'
  const label = scope === 'all' ? '全A' : '宽基'
  const n = series.length
  const [win, setWin] = useState<[number, number]>([0, Math.max(0, n - 1)])
  const [hover, setHover] = useState<number | null>(null)
  const [hoverY, setHoverY] = useState<number | null>(null)
  const mainRef = useRef<SVGSVGElement>(null)
  const ovRef = useRef<SVGSVGElement>(null)
  const drag = useRef<Drag | null>(null)
  const panRef = useRef<{ x: number; win: [number, number] }>({ x: 0, win: [0, 0] })

  useEffect(() => { setWin([0, Math.max(0, n - 1)]); setHover(null) }, [n])

  if (!n) return null
  const [s, e] = clampWindow(win[0], win[1], n)
  const view = series.slice(s, e + 1)
  const m = view.length

  const flows = view.map(p => p[key] ?? 0)
  const maxAbs = Math.max(1, ...flows.map(Math.abs))
  const zeroY = padT + plotH / 2
  const barH = (v: number): number => (v / maxAbs) * (plotH / 2)
  const bw = Math.max(0.6, Math.min(10, (plotW / m) * 0.68))
  const xAt = (i: number): number => padL + (m <= 1 ? plotW / 2 : (i / (m - 1)) * plotW)

  const idxVals = view.map(p => p.index).filter((v): v is number => v != null)
  const [iMin, iMax] = idxVals.length ? extent(idxVals) : [0, 1]
  const iy = (v: number): number => (iMax === iMin ? zeroY : padT + plotH - ((v - iMin) / (iMax - iMin)) * plotH)
  const idxLine = view
    .map((p, i) => (p.index == null ? null : `${xAt(i).toFixed(1)},${iy(p.index).toFixed(1)}`))
    .filter(Boolean)
    .join(' ')

  const onMainMove = (ev: React.PointerEvent<SVGSVGElement>): void => {
    if (drag.current || !mainRef.current) return
    const rect = mainRef.current.getBoundingClientRect()
    setHover(pointerToIndex(ev.clientX, rect, W, padL, plotW, m))
    const vy = ((ev.clientY - rect.top) / rect.height) * H
    setHoverY(Math.max(padT, Math.min(padT + plotH, vy)))
  }
  const clearHover = (): void => { setHover(null); setHoverY(null) }
  const hp = hover != null && hover >= 0 && hover < m ? view[hover] : null
  const hx = hover != null ? xAt(hover) : 0
  const tipSide = hover != null && hover < m / 2 ? 'right' : 'left'
  const tipStyle: React.CSSProperties = {
    left: `${(hx / W) * 100}%`,
    transform: tipSide === 'right' ? 'translateX(12px)' : 'translateX(calc(-100% - 12px))',
  }

  const oFlows = series.map(p => p[key] ?? 0)
  const oMaxAbs = Math.max(1, ...oFlows.map(Math.abs))
  const oZero = oPadT + oPlotH / 2
  const oX = (i: number): number => padL + (n <= 1 ? 0 : (i / (n - 1)) * plotW)
  const selX0 = oX(s), selX1 = oX(e)

  function beginDrag(mode: Drag, ev: React.PointerEvent): void {
    ev.preventDefault()
    drag.current = mode
    panRef.current = { x: ev.clientX, win: [s, e] }
    setHover(null)
    const move = (me: PointerEvent): void => {
      if (!ovRef.current) return
      const rect = ovRef.current.getBoundingClientRect()
      if (mode === 'pan') {
        const from = panRef.current
        const perIdx = plotW / Math.max(1, n - 1)
        const d = Math.round(((me.clientX - from.x) / rect.width * W) / perIdx)
        const spanW = from.win[1] - from.win[0]
        let a = from.win[0] + d
        a = Math.max(0, Math.min(a, n - 1 - spanW))
        setWin([a, a + spanW])
      } else {
        const i = pointerToIndex(me.clientX, rect, W, padL, plotW, n)
        setWin(mode === 'lo' ? [i, Math.max(i, e)] : [Math.min(i, s), i])
      }
    }
    const up = (): void => {
      drag.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="etf-flow__wrap">
      <div className="etf-flow__legend" aria-hidden>
        <span className="etf-flow__lg"><i className="etf-flow__lg-bar is-in" />净流入</span>
        <span className="etf-flow__lg"><i className="etf-flow__lg-bar is-out" />净流出</span>
        <span className="etf-flow__lg"><i className="etf-flow__lg-line" />上证指数</span>
        <span className="etf-flow__lg">{label}</span>
      </div>
      <div style={{ position: 'relative' }}>
        <svg ref={mainRef} className="etf-flow__chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} ETF 净流入与上证指数`}
          onPointerMove={onMainMove} onPointerLeave={clearHover}>
          <line x1={padL} y1={zeroY} x2={padL + plotW} y2={zeroY} className="etf-flow__grid" />
          {[-1, -0.5, 0.5, 1].map(f => {
            const y = zeroY - f * (plotH / 2)
            return <g key={f}>
              <line x1={padL} y1={y} x2={padL + plotW} y2={y} className="etf-flow__grid" strokeDasharray="3 4" />
              <text x={padL - 6} y={y + 3} textAnchor="end" className="etf-flow__ax">{fmt1(f * maxAbs)}</text>
            </g>
          })}
          {view.map((p, i) => {
            const v = p[key] ?? 0
            const h = Math.abs(barH(v))
            const y = v >= 0 ? zeroY - h : zeroY
            return <rect key={p.date} x={xAt(i) - bw / 2} y={y} width={bw} height={Math.max(h, 0.5)}
              className={v >= 0 ? 'etf-flow__bar is-in' : 'etf-flow__bar is-out'} />
          })}
          {idxLine && <polyline points={idxLine} fill="none" className="etf-flow__idx" />}
          {idxVals.length > 0 && <>
            <text x={W - padR + 4} y={padT + 10} className="etf-flow__ax">{iMax.toFixed(0)}</text>
            <text x={W - padR + 4} y={padT + plotH} className="etf-flow__ax">{iMin.toFixed(0)}</text>
          </>}
          {hp && <>
            <line x1={hx} y1={padT} x2={hx} y2={padT + plotH} className="etf-flow__cross" />
            {hoverY != null && <line x1={padL} y1={hoverY} x2={padL + plotW} y2={hoverY} className="etf-flow__cross" />}
          </>}
        </svg>
        {hp && (
          <div className="etf-flow__tip" style={tipStyle}>
            <div className="etf-flow__tip-date">{hp.date}</div>
            <div className="etf-flow__tip-row"><span className="etf-flow__tip-k">{label}</span><span>{fmt1(hp[key] ?? 0)} 亿</span></div>
            {hp.index != null && <div className="etf-flow__tip-row"><span className="etf-flow__tip-k">上证</span><span>{hp.index.toFixed(2)}</span></div>}
          </div>
        )}
      </div>
      <svg ref={ovRef} className="etf-flow__ov" viewBox={`0 0 ${W} ${OVH}`} aria-hidden
        onPointerDown={ev => beginDrag('pan', ev)}>
        {series.map((p, i) => {
          const v = p[key] ?? 0
          const h = Math.abs((v / oMaxAbs) * (oPlotH / 2))
          const y = v >= 0 ? oZero - h : oZero
          return <rect key={p.date} x={oX(i) - 0.4} y={y} width={0.8} height={Math.max(h, 0.4)}
            className={v >= 0 ? 'etf-flow__bar is-in' : 'etf-flow__bar is-out'} opacity={0.55} />
        })}
        <rect x={selX0} y={oPadT} width={Math.max(1, selX1 - selX0)} height={oPlotH} className="etf-flow__ov-sel" />
        <rect x={0} y={oPadT} width={selX0} height={oPlotH} className="etf-flow__ov-mask" />
        <rect x={selX1} y={oPadT} width={W - selX1} height={oPlotH} className="etf-flow__ov-mask" />
        <circle cx={selX0} cy={oZero} r={5} className="etf-flow__ov-handle" onPointerDown={ev => beginDrag('lo', ev)} />
        <circle cx={selX1} cy={oZero} r={5} className="etf-flow__ov-handle" onPointerDown={ev => beginDrag('hi', ev)} />
      </svg>
    </div>
  )
}
