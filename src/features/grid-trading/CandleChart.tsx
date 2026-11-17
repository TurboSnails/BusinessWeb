import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { IChartApi, Time } from 'lightweight-charts'
import { getObservationCandles, type CandleResult } from './marketData'
import type { Candle } from './types'
import { candleIndicators, chartRows, CHART_RANGES, hasOpen, hasVolume } from './candleModel'
import './candleChart.css'

type Lib = typeof import('lightweight-charts')
const loadChartLibrary = (): Promise<Lib> => import('lightweight-charts')
const fmt = (n: number | undefined): string => n === undefined ? '未取得' : n.toLocaleString('zh-CN', { maximumFractionDigits: 4 })
type Ready = { code: string; data: CandleResult; lib: Lib }

function Canvas({ rows, allRows, lib, macd, onHover, onFailure, chartRef, label, summaryId }: {
  rows: Candle[]; allRows: Candle[]; lib: Lib; macd: boolean; onHover: (n: number) => void; onFailure: (message: string) => void
  chartRef: React.MutableRefObject<IChartApi | null>; label: string; summaryId: string
}): JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const hover = useRef(onHover), failure = useRef(onFailure)
  hover.current = onHover; failure.current = onFailure
  useEffect(() => {
    if (!host.current || !rows.length) return
    let chart: IChartApi | null = null
    try {
      const theme = getComputedStyle(host.current)
      const color = (name: string, fallbackName = name): string => theme.getPropertyValue(name).trim() || theme.getPropertyValue(fallbackName).trim()
      const rise = color('--up', '--grid-candle-up'), fall = color('--down', '--grid-candle-down')
      chart = lib.createChart(host.current, {
        autoSize: true,
        layout: { background: { type: lib.ColorType.Solid, color: color('--bg-card', '--grid-candle-surface') }, textColor: color('--text-secondary', '--grid-candle-text'), attributionLogo: true },
        localization: { locale: 'zh-CN', dateFormat: 'yyyy-MM-dd' },
        handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
      })
      chartRef.current = chart
      const complete = rows.every(hasOpen)
      if (complete) {
        const candles = chart.addSeries(lib.CandlestickSeries, { upColor: rise, downColor: fall, wickUpColor: rise, wickDownColor: fall, borderVisible: false, priceLineVisible: false })
        candles.setData(rows.filter(hasOpen).map(r => ({ time: r.date as Time, open: r.open, close: r.close, high: r.high, low: r.low })))
      } else {
        chart.addSeries(lib.LineSeries, { color: color('--accent', '--grid-candle-accent'), priceLineVisible: false }).setData(rows.map(r => ({ time: r.date as Time, value: r.close })))
      }
      const start = rows[0].date, indicators = candleIndicators(allRows)
      for (const [key, lineColor] of [['ma10', color('--grid-candle-ma10')], ['ma20', color('--grid-candle-ma20')]] as const) {
        chart.addSeries(lib.LineSeries, { color: lineColor, lineWidth: 2, priceLineVisible: false, lastValueVisible: false }).setData(indicators[key].filter(p => p.time >= start).map(p => ({ ...p, time: p.time as Time })))
      }
      const volumeAvailable = rows.some(hasVolume)
      if (volumeAvailable) {
        chart.addSeries(lib.HistogramSeries, { priceFormat: { type: 'volume' }, priceLineVisible: false }, 1).setData(rows.filter(hasVolume).map(r => ({ time: r.date as Time, value: r.volume, color: hasOpen(r) && r.close < r.open ? fall : rise })))
      }
      if (macd) {
        const pane = volumeAvailable ? 2 : 1
        chart.addSeries(lib.HistogramSeries, { priceLineVisible: false }, pane).setData(indicators.histogram.filter(p => p.time >= start).map(p => ({ ...p, time: p.time as Time, color: p.value >= 0 ? rise : fall })))
        for (const [key, lineColor] of [['dif', color('--grid-candle-ma10')], ['dea', color('--grid-candle-ma20')]] as const) {
          chart.addSeries(lib.LineSeries, { color: lineColor, lineWidth: 1, priceLineVisible: false }, pane).setData(indicators[key].filter(p => p.time >= start).map(p => ({ ...p, time: p.time as Time })))
        }
      }
      chart.timeScale().fitContent()
      chart.subscribeCrosshairMove(p => { if (typeof p.time === 'string') { const n = rows.findIndex(r => r.date === p.time); if (n >= 0) hover.current(n) } })
    } catch { failure.current('图表暂时无法绘制，可重试；逐日数据仍可查看。') }
    return () => { if (chartRef.current === chart) chartRef.current = null; chart?.remove() }
  }, [rows, allRows, lib, macd, chartRef])
  return <div ref={host} className={`grid-candle__canvas${macd ? ' grid-candle__canvas--macd' : ''}`} role="img" aria-label={label} aria-describedby={summaryId} />
}

/** Independently loaded historical observations; never merges unadjusted live quotes or writes account records. */
type Props = { code: string; name: string; endDate?: string; loadLib?: () => Promise<Lib> }

export default function CandleChart(props: Props): JSX.Element {
  return <CandleChartBody key={props.code} {...props} />
}

function CandleChartBody({ code, name, endDate, loadLib = loadChartLibrary }: Props): JSX.Element {
  const [requested, setRequested] = useState(false), [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [ready, setReady] = useState<Ready | null>(null)
  const [loadError, setLoadError] = useState('')
  const [range, setRange] = useState(1), [macd, setMacd] = useState(false), [hover, setHover] = useState<number | null>(null)
  const [canvasError, setCanvasError] = useState(''), [drawAttempt, setDrawAttempt] = useState(0)
  const chartRef = useRef<IChartApi | null>(null)
  const id = useId(), valid = /^\d{6}$/.test(code), busy = status === 'loading'
  useEffect(() => {
    if (!requested || !valid) return
    let alive = true
    setStatus('loading'); setLoadError(''); setCanvasError('')
    Promise.all([getObservationCandles(code, { force: attempt > 0 }), loadLib()])
      .then(([data, lib]) => { if (alive) { setReady({ code, data, lib }); setStatus('idle') } })
      .catch(e => { if (alive) { setLoadError(e instanceof Error ? e.message : '行情暂时不可用'); setStatus('error') } })
    return () => { alive = false }
  }, [code, valid, requested, attempt, loadLib])
  const allRows = useMemo(() => ready?.code === code ? chartRows(ready.data.candles).filter(r => !endDate || r.date <= endDate) : [], [ready, code, endDate])
  const rows = useMemo(() => allRows.slice(-Math.min(allRows.length, CHART_RANGES[range].count)), [allRows, range])
  const index = hover !== null && rows[hover] ? hover : rows.length - 1, current = rows[index]
  const changeRange = (n: number): void => { setRange(n); setHover(null) }
  const move = (delta: number, scale = 1): void => {
    const t = chartRef.current?.timeScale(), r = t?.getVisibleLogicalRange()
    if (!t || !r) return
    const span = r.to - r.from, middle = (r.from + r.to) / 2 + delta * span
    t.setVisibleLogicalRange({ from: middle - span * scale / 2, to: middle + span * scale / 2 })
  }
  return <section className="grid-card grid-candle" aria-label="历史行情观察" aria-busy={busy}>
    <h2>历史行情观察{valid ? ` · ${name || code}（${code}）` : ''}</h2>
    <p className="grid-candle__note">独立日线观察，MA10 / MA20 与可选 MACD；不会修改网格参数、账户缓存或成交记录。{endDate ? ` 观察截止 ${endDate}。` : ''}</p>
    {valid && <button type="button" aria-disabled={busy} onClick={() => { if (busy) return; if (!requested) setRequested(true); else setAttempt(n => n + 1) }}>{busy ? (ready ? '正在刷新…' : '正在加载…') : ready ? '刷新日K行情' : status === 'error' ? '重试日K行情' : '加载日K行情'}</button>}
    {!valid && <p>填写六位证券代码后可加载行情。</p>}
    {busy && <p role="status">正在{ready ? '刷新' : '加载'} {code} 历史日线…</p>}
    {loadError && <div role="alert"><p>{loadError}{ready ? '；已保留当前图表。' : ''}</p></div>}
    {ready && !rows.length && <p>没有可用的历史日线。</p>}
    {ready && current && <>
      <div className="grid-candle__toolbar" role="group" aria-label="日K显示区间">
        {CHART_RANGES.map((r, n) => <button type="button" key={r.label} aria-pressed={range === n} onClick={() => changeRange(n)}>{r.label}</button>)}
        <button type="button" aria-pressed={macd} onClick={() => setMacd(v => !v)}>MACD 副图</button>
      </div>
      <div className="grid-candle__readout" id={id} aria-live="polite"><b>{current.date}</b><span>开 {fmt(current.open)}</span><span>高 {fmt(current.high)}</span><span>低 {fmt(current.low)}</span><span>收 {fmt(current.close)}</span><span>量 {fmt(current.volume)}（来源原单位）</span></div>
      {!rows.every(hasOpen) && <p className="grid-candle__note">部分开盘价缺失，显示收盘折线，未伪造 K 线；刷新行情可补取新字段。</p>}
      {!rows.every(hasVolume) && <p className="grid-candle__note">部分或全部成交量未取得，缺失日不补零。</p>}
      {canvasError ? <div role="alert"><p>{canvasError}</p><button type="button" onClick={() => { setCanvasError(''); setDrawAttempt(n => n + 1) }}>重试绘制</button></div> : <Canvas key={`${code}:${drawAttempt}`} rows={rows} allRows={allRows} lib={ready.lib} macd={macd} onHover={setHover} onFailure={setCanvasError} chartRef={chartRef} label={`${name || code}日K与成交量，红涨绿跌，MA10/MA20${macd ? '及MACD副图' : ''}`} summaryId={id} />}
      <div className="grid-candle__toolbar" role="group" aria-label="图表平移与缩放">
        <button type="button" disabled={!!canvasError} onClick={() => move(-.3)}>向前平移</button><button type="button" disabled={!!canvasError} onClick={() => move(.3)}>向后平移</button>
        <button type="button" disabled={!!canvasError} onClick={() => move(0, .7)}>放大</button><button type="button" disabled={!!canvasError} onClick={() => move(0, 1.4)}>缩小</button>
        <button type="button" disabled={!!canvasError} onClick={() => chartRef.current?.timeScale().fitContent()}>重置视图</button>
      </div>
      <label className="grid-candle__reader">逐日查看<input aria-label="逐日查看行情" type="range" min="0" max={rows.length - 1} value={index} onChange={e => setHover(Number(e.target.value))} /></label>
      <p className="grid-candle__note">拖拽平移、双指或价格轴缩放，也可用上方按钮和逐日滑块操作。显示 {rows[0].date} 至 {rows.at(-1)!.date}，共 {rows.length} 个观测；短样本不代表完整区间。MA 需 10/20 根预热，MACD(12,26,9) 从第 26 根显示，柱为 2×(DIF−DEA)，仅作观察。</p>
      <p className="grid-candle__note">{ready.data.source}；获取于 {ready.data.fetchedOn}。未合并未复权实时报价；最后交易日数据可能仍未收盘。成交量保留来源原单位，与成交额不同。</p>
      <p className="grid-candle__note">图表：<a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">TradingView Lightweight Charts™</a> Copyright (c) 2025 TradingView, Inc.（Apache-2.0）</p>
    </>}
  </section>
}
