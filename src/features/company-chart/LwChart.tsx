// 公司页统一走势图：TradingView 开源 Lightweight Charts（Apache-2.0，npm lightweight-charts@5.2.1）+ 本站日线数据。
// - 图表库按需加载：卡片进入视口（或用户点按钮）后才 import('lightweight-charts')，不进主包。
// - 日/周 K 线 + 成交量 + MA20/MA60；研究价位（三情景、DCF）用 createPriceLine 画成水平线，规则见 lwModel.chartLevels。
// - 署名：库的 NOTICE 要求在页面展示归属声明并链接 tradingview.com；图上保留 attributionLogo，图注写出 NOTICE 文本。
// 图中价格只供看图，不回写任何研究数据。
import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { IChartApi, MouseEventParams } from 'lightweight-charts'
import type { Market } from '../../data/companies'
import { aggregateCandles, type HistoryCandle } from '../../components/pulse/chinaHistory'
import { PageDataFreshness } from '../../components/ui/PageDataFreshness'
import { useInView } from './useInView'
import { fetchCandles, type CandlesResult } from './candles'
import type { PriceLevelsInput } from './levelsModel'
import type { ChartCurrency } from './symbols'
import {
  MA_PERIODS, chartLevels, chartSummary, currencyUnit, fmtPrice, isRedUp, movingAverage, toCandleData, toVolumeData, withAlpha,
  type ChartLevel,
} from './lwModel'
import { LEVEL_STYLE, MA_COLOR, token } from './lwTheme'
import './company-chart.css'

type Lib = typeof import('lightweight-charts')
type Period = 'day' | 'week'

/** 动态加载图表库（测试里可注入替身） */
export const loadLightweightCharts = (): Promise<Lib> => import('lightweight-charts')

const VISIBLE: Record<Period, number> = { day: 120, week: 104 }
const FETCH_TIMEOUT_MS = 12_000

const SOURCE_TEXT = (r: Pick<CandlesResult, 'source' | 'adjustment'>, market: Market): string => {
  if (r.source === 'yahoo') return 'Yahoo Finance 日线（按拆股调整，未按分红调整）'
  const adj = r.adjustment === 'qfq' ? '前复权' : '未复权'
  return `腾讯行情${market === 'hk' ? '港股' : ''}日线（${adj}）`
}
const DELAY_NOTE = '收盘后为当日收盘价；交易时段内最后一根 K 线是盘中价（延迟行情，接口缓存约 5 分钟）'

function Readout({ row, prev, market, volumeUnit }: { row: HistoryCandle; prev?: HistoryCandle; market: Market; volumeUnit: string }): JSX.Element {
  const change = prev ? (row.close - prev.close) / prev.close * 100 : null
  const tone = (up: boolean): string => (up === isRedUp(market) ? 'cc-tone-red' : 'cc-tone-green')
  return (
    <div className="cc-lw__readout" aria-hidden="true">
      <span className="cc-lw__date">{row.date}</span>
      <span>开 {fmtPrice(row.open)}</span><span>高 {fmtPrice(row.high)}</span><span>低 {fmtPrice(row.low)}</span>
      <span>收 <b className={row.close === row.open ? undefined : tone(row.close > row.open)}>{fmtPrice(row.close)}</b></span>
      {change !== null && <span className={change === 0 ? undefined : tone(change > 0)}>{change > 0 ? '+' : change < 0 ? '−' : ''}{Math.abs(change).toFixed(2)}%</span>}
      <span>量 {row.volume.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} {volumeUnit}</span>
    </div>
  )
}

function ChartCanvas({ lib, rows, period, levels, market, label, describedBy, onHover }: {
  lib: Lib
  rows: HistoryCandle[]
  period: Period
  levels: ChartLevel[]
  market: Market
  label: string
  describedBy: string
  onHover: (index: number | null) => void
}): JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const hoverRef = useRef(onHover)
  hoverRef.current = onHover

  useEffect(() => {
    const el = host.current
    if (!el || !rows.length) return
    const redUp = isRedUp(market)
    const rise = token(redUp ? '--up' : '--down'), fall = token(redUp ? '--down' : '--up')
    const chart: IChartApi = lib.createChart(el, {
      autoSize: true,
      layout: {
        background: { type: lib.ColorType.Solid, color: token('--bg-card') },
        textColor: token('--text-secondary'),
        fontSize: 11,
        attributionLogo: true,
      },
      grid: { vertLines: { color: withAlpha(token('--border-subtle'), 0.6) }, horzLines: { color: withAlpha(token('--border-subtle'), 0.9) } },
      rightPriceScale: { borderColor: token('--border-subtle') },
      timeScale: { borderColor: token('--border-subtle'), rightOffset: 4 },
      crosshair: { mode: lib.CrosshairMode.Normal },
      localization: { locale: 'zh-CN', dateFormat: 'yyyy-MM-dd' },
      // 滚轮留给页面滚动；拖动/双指缩放查看历史
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
    })
    const inScale = levels.filter(l => l.inAutoscale).map(l => l.value)
    const candles = chart.addSeries(lib.CandlestickSeries, {
      upColor: rise, downColor: fall, wickUpColor: rise, wickDownColor: fall, borderVisible: false,
      priceLineVisible: false,
      // 让纵轴自动范围包含研究价位线（仅最新收盘 1/3–3 倍以内的线）
      autoscaleInfoProvider: (base: () => { priceRange: { minValue: number; maxValue: number } | null } | null) => {
        const info = base()
        if (!info?.priceRange || !inScale.length) return info as never
        return { ...info, priceRange: { minValue: Math.min(info.priceRange.minValue, ...inScale), maxValue: Math.max(info.priceRange.maxValue, ...inScale) } } as never
      },
    })
    candles.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.24 } })
    candles.setData(toCandleData(rows))

    const volume = chart.addSeries(lib.HistogramSeries, { priceScaleId: '', priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false })
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    volume.setData(toVolumeData(rows, withAlpha(rise, 0.45), withAlpha(fall, 0.45)))

    for (const n of MA_PERIODS) {
      const ma = chart.addSeries(lib.LineSeries, { color: token(MA_COLOR[n]), lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
      ma.setData(movingAverage(rows, n))
    }

    for (const l of levels) {
      const style = LEVEL_STYLE[l.key]
      candles.createPriceLine({
        price: l.value, color: token(style.color), lineWidth: 1,
        lineStyle: style.dash === 'dashed' ? lib.LineStyle.Dashed : lib.LineStyle.Dotted,
        axisLabelVisible: true, title: l.short,
      })
    }

    const n = rows.length
    const visible = VISIBLE[period]
    if (n > visible) chart.timeScale().setVisibleLogicalRange({ from: n - visible, to: n + 3 })
    else chart.timeScale().fitContent()

    const move = (p: MouseEventParams): void => {
      if (p.point === undefined || p.logical === undefined || p.logical < 0 || p.logical >= n) { hoverRef.current(null); return }
      hoverRef.current(Math.round(p.logical))
    }
    chart.subscribeCrosshairMove(move)
    return () => {
      chart.unsubscribeCrosshairMove(move)
      chart.remove()
    }
  }, [lib, rows, levels, market, period])

  return <div ref={host} className="cc-lw__canvas" role="img" aria-label={label} aria-describedby={describedBy} />
}

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; lib: Lib; data: CandlesResult }

export default function LwChart({ candleSymbol, market, currency, name, levels, externalUrl, externalLabel, note, fetchImpl, loadLib = loadLightweightCharts }: {
  candleSymbol: string
  market: Market
  currency: ChartCurrency
  name: string
  levels: PriceLevelsInput
  externalUrl?: string
  externalLabel?: string
  /** 图注里的补充说明（如美股交易所未记录） */
  note?: string
  fetchImpl?: typeof fetch
  loadLib?: () => Promise<Lib>
}): JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const inView = useInView(box, candleSymbol)
  const [requested, setRequested] = useState(false)
  const [period, setPeriod] = useState<Period>('day')
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<State>({ status: 'idle' })
  const [hover, setHover] = useState<number | null>(null)
  const active = inView || requested
  const uid = useId().replace(/:/g, '')
  const skipId = `cc-after-chart-${uid}`
  const summaryId = `cc-chart-summary-${uid}`

  useEffect(() => { setRequested(false); setState({ status: 'idle' }); setPeriod('day') }, [candleSymbol])

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    let alive = true
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    setState({ status: 'loading' })
    Promise.all([
      loadLib().catch(() => { throw new Error('图表组件加载失败') }),
      fetchCandles(candleSymbol, controller.signal, fetchImpl),
    ])
      .then(([lib, data]) => { if (alive) setState({ status: 'ready', lib, data }) })
      .catch(e => { if (alive) setState({ status: 'error', message: controller.signal.aborted ? '行情请求超时' : e instanceof Error ? e.message : '行情暂时无法获取' }) })
      .finally(() => clearTimeout(timer))
    return () => { alive = false; clearTimeout(timer); controller.abort() }
  }, [active, candleSymbol, attempt, fetchImpl, loadLib])

  const data = state.status === 'ready' ? state.data : null
  const rows = useMemo(() => (data ? aggregateCandles(data.rows, period) : []), [data, period])
  const last = rows[rows.length - 1]
  // 上层每次渲染都会新建 levels 对象；按内容做 key，避免图表被反复重建
  const levelsKey = JSON.stringify(levels)
  const latestClose = data?.rows.at(-1)?.close
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lvl = useMemo(() => chartLevels(levels, currency, latestClose), [levelsKey, currency, latestClose])
  useEffect(() => { setHover(null) }, [rows])

  const unit = currencyUnit(currency)
  const volumeUnit = market === 'cn' ? '手' : '股'
  const periodLabel = period === 'day' ? '日线' : '周线'
  const tones = isRedUp(market) ? '红涨绿跌' : '绿涨红跌'
  const summary = chartSummary(rows.slice(-VISIBLE[period]), period, currency)
  const shown = hover != null && rows[hover] ? hover : rows.length - 1
  const sourceText = data ? SOURCE_TEXT(data, market) : ''

  return (
    <figure className="cc-chart cc-lw" aria-label={`${name} 走势图`}>
      <a className="cc-skip" href={`#${skipId}`}>跳过走势图</a>
      <div className="cc-lw__toolbar">
        <div className="cc-lw__periods" role="group" aria-label="走势图周期">
          {(['day', 'week'] as const).map(p => (
            <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}>{p === 'day' ? '日线' : '周线'}</button>
          ))}
        </div>
        <span className="cc-lw__unit">{unit} · {tones} · MA{MA_PERIODS.join(' / MA')}</span>
      </div>
      <div ref={box} className="cc-chart__frame cc-lw__frame">
        {state.status === 'idle' && (
          <div className="cc-chart__placeholder">
            <button type="button" className="tool-btn" onClick={() => setRequested(true)}>加载走势图</button>
            <span>滚动到这里时自动加载</span>
          </div>
        )}
        {state.status === 'loading' && <div className="cc-chart__placeholder" role="status">正在加载走势图…</div>}
        {state.status === 'error' && (
          <div className="cc-chart__placeholder" role="alert">
            <p>走势图暂时无法获取：{state.message}。页面其他内容不受影响。</p>
            <p>
              <button type="button" className="tool-btn" onClick={() => setAttempt(n => n + 1)}>重试</button>
              {externalUrl && <>{' '}<a href={externalUrl} target="_blank" rel="noopener noreferrer" className="rn-link">{externalLabel ?? '外部行情'} ↗</a></>}
            </p>
          </div>
        )}
        {state.status === 'ready' && rows.length === 0 && (
          <div className="cc-chart__placeholder" role="note">行情源没有返回这只股票的日线数据（可能停牌、退市或代码有误）。</div>
        )}
        {state.status === 'ready' && rows.length > 0 && <>
          <Readout row={rows[shown]} prev={rows[shown - 1]} market={market} volumeUnit={volumeUnit} />
          <ChartCanvas
            key={`${candleSymbol}:${period}`}
            lib={state.lib}
            rows={rows}
            period={period}
            levels={lvl.drawn}
            market={market}
            label={`${name}${periodLabel} K 线图，单位${unit}，${tones}，含成交量与 MA${MA_PERIODS.join('、MA')} 均线${lvl.drawn.length ? `及 ${lvl.drawn.length} 条研究价位线` : ''}`}
            describedBy={summaryId}
            onHover={setHover}
          />
        </>}
      </div>
      {state.status === 'ready' && rows.length > 0 && (
        <div className="cc-lw__legend">
          <ul aria-label="图例">
            {MA_PERIODS.map(n => <li key={n}><span className={`cc-lw__swatch cc-lw__swatch--ma${n}`} aria-hidden="true" />MA{n}（{n} {period === 'day' ? '日' : '周'}均线）</li>)}
            {lvl.drawn.map(l => (
              <li key={l.key}>
                <span className={`cc-lw__swatch cc-lw__swatch--${l.key}`} aria-hidden="true" />
                {l.label} {fmtPrice(l.value)} {unit}{!l.inAutoscale && '（超出默认纵轴范围，拖动纵轴可见）'}
              </li>
            ))}
          </ul>
          {lvl.drawn.length > 0 && <p>虚线 = 三情景价，点线 = DCF 价；价位来自本页研究数据，不是行情预测。{lvl.anchorStale && ' 本页价格锚点已过期，价位线已用走势图最新收盘复核口径。'}</p>}
          {lvl.drawn.length === 0 && lvl.notDrawn.length === 0 && <p>本公司还没有可画的三情景价或 DCF 价位。</p>}
          {lvl.notDrawn.length > 0 && (
            <p className="cc-lw__skipped">未画出：{lvl.notDrawn.map(l => `${l.label} ${fmtPrice(l.value)}（${l.reason}）`).join('；')}</p>
          )}
        </div>
      )}
      <figcaption className="cc-chart__caption">
        {summary && <span id={summaryId}>{name}{periodLabel}：{summary}。</span>}
        {data && last && <PageDataFreshness checkedAt={data.fetchedAt} dataLabel="行情日期" dataDates={[data.rows.at(-1)?.date]} note={`来源：${sourceText}；${DELAY_NOTE}`} />}
        {note && <span>{note}</span>}
        {externalUrl && <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="rn-link">{externalLabel ?? '外部行情'} ↗</a>}
        <span className="cc-lw__notice">图表：<a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer" className="rn-link">TradingView Lightweight Charts™</a> Copyright (c) 2025 TradingView, Inc.（Apache-2.0）</span>
      </figcaption>
      <span id={skipId} tabIndex={-1} />
    </figure>
  )
}
