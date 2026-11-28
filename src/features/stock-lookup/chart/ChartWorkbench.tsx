import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type {
  IChartApi,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  LogicalRange,
  MouseEventParams,
  SeriesMarker,
  Time,
  UTCTimestamp,
  BusinessDay,
} from 'lightweight-charts'
import { Dialog } from '../../../components/ui/Dialog'
import { withAlpha } from '../../company-chart/lwModel'
import { token } from '../../company-chart/lwTheme'
import type { Bar, NewsItem, StockLookupApi, Timeframe } from '../types'
import { TIMEFRAMES } from '../types'
import {
  MA_OPTIONS,
  commonMaCrosses,
  macd as calcMacd,
  sma,
  volumeSpikes,
  type MaPeriod,
} from './indicators'
import { loadChartSettings, saveChartSettings, type ChartSettings } from './settings'
import {
  TF_LABEL,
  fmtPrice,
  fmtVolume,
  formatBarTime,
  formatShortDate,
  formatTickMark,
  groupNewsMarks,
  isTimeframe,
  toChartTime,
} from './time'
import { VOLUME_PROFILE_NOTE, binCountForHeight, computeVolumeProfile, type VolumeProfileResult } from './volumeProfile'
import './chart-workbench.css'

/** Playwright / 调试钩子：价位成交量像素对齐验收 */
export interface SlChartTestApi {
  pocPrice: number | null
  valueAreaLow: number | null
  valueAreaHigh: number | null
  pocY: number | null
  vaTopY: number | null
  vaBotY: number | null
  priceToCoordinate: (price: number) => number | null
  lastBarTimeLabel: string | null
  footEndDate: string | null
}

type Lib = typeof import('lightweight-charts')

export const loadLightweightCharts = (): Promise<Lib> => import('lightweight-charts')

const VISIBLE_BARS: Record<Timeframe, number> = {
  '1m': 120, '5m': 120, '15m': 120, '30m': 120, '1h': 120, '4h': 100, '1d': 120, '1w': 104, '1mo': 60,
}

const MA_COLOR: Record<number, string> = {
  5: '--system-teal',
  10: '--system-yellow',
  20: '--accent',
  60: '--system-purple',
  120: '--warm-ink',
  250: '--text-secondary',
}

function inferRedUp(symbol: string): boolean {
  return /^(hk|sh|sz)/i.test(symbol)
}

function asSeriesTime(tSec: number, timezone: string, tf: Timeframe): Time {
  const v = toChartTime(tSec, timezone, tf)
  return (typeof v === 'number' ? (v as UTCTimestamp) : v) as Time
}

export interface VpPixelBin {
  yTop: number
  yBot: number
  upVolume: number
  downVolume: number
  total: number
}

export interface VpPixelLayout {
  profile: VolumeProfileResult
  bins: VpPixelBin[]
  pocY: number | null
  vaTopY: number | null
  vaBotY: number | null
  paneTop: number
  paneHeight: number
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty'; reason: string }
  | { status: 'ready' }

interface ChartHandles {
  chart: IChartApi
  candles: ISeriesApi<'Candlestick'>
  volume: ISeriesApi<'Histogram'> | null
  dif: ISeriesApi<'Line'> | null
  dea: ISeriesApi<'Line'> | null
  hist: ISeriesApi<'Histogram'> | null
  mas: Map<number, ISeriesApi<'Line'>>
  markers: ISeriesMarkersPluginApi<Time>
  lib: Lib
}

export default function ChartWorkbench(props: {
  symbol: string
  api: Pick<StockLookupApi, 'bars'>
  timezone: string
  news?: NewsItem[]
  onSelectNews?: (id: string) => void
  loadLib?: () => Promise<Lib>
}): JSX.Element {
  const { symbol, api, timezone, news = [], onSelectNews, loadLib = loadLightweightCharts } = props
  const [params, setParams] = useSearchParams()
  const rawTf = params.get('tf')
  const tf: Timeframe = isTimeframe(rawTf) ? rawTf : '1d'

  const setTf = useCallback((next: Timeframe) => {
    setParams(prev => {
      const n = new URLSearchParams(prev)
      if (next === '1d') n.delete('tf')
      else n.set('tf', next)
      return n
    }, { replace: true })
  }, [setParams])

  const [settings, setSettings] = useState<ChartSettings>(() => loadChartSettings())
  const [newsOn, setNewsOn] = useState(() => loadChartSettings().newsMarkers)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [bars, setBars] = useState<Bar[]>([])
  /** 与 bars 同步的周期；切 tf 瞬间旧 bars 尚未清空时禁止建图，避免日线把分钟线压成同一 BusinessDay */
  const [dataTf, setDataTf] = useState<Timeframe | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [lib, setLib] = useState<Lib | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [vpLayout, setVpLayout] = useState<VpPixelLayout | null>(null)
  const [paneRatio, setPaneRatio] = useState(0.22)
  const [fullscreen, setFullscreen] = useState(false)
  const [newsTip, setNewsTip] = useState<{ x: number; y: number; ids: string[]; titles: string[] } | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  /** 结构变更（副图/均线集合）时重建图表 */
  const structureKey = `${settings.volume}|${settings.macd}|${settings.ma.join(',')}`

  const rootRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const handlesRef = useRef<ChartHandles | null>(null)
  const barsRef = useRef<Bar[]>([])
  const hasMoreRef = useRef(true)
  const loadingMoreRef = useRef(false)
  const loadGen = useRef(0)
  const prependRef = useRef(0) // 待应用到可见范围的左拼接根数
  const vpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settingsRef = useRef(settings)
  const paneRatioRef = useRef(paneRatio)
  const loadOlderRef = useRef<() => Promise<void>>(async () => undefined)
  const newsByBarRef = useRef<Map<number, { ids: string[]; titles: string[] }>>(new Map())
  const newsRef = useRef(news)
  const newsOnRef = useRef(newsOn)
  const timezoneRef = useRef(timezone)
  const tfRef = useRef(tf)
  const vpProfileRef = useRef<VolumeProfileResult | null>(null)

  barsRef.current = bars
  hasMoreRef.current = hasMore
  settingsRef.current = settings
  paneRatioRef.current = paneRatio
  newsRef.current = news
  newsOnRef.current = newsOn
  timezoneRef.current = timezone
  tfRef.current = tf

  const redUp = inferRedUp(symbol)
  const rise = token(redUp ? '--up' : '--down')
  const fall = token(redUp ? '--down' : '--up')

  const patchSettings = (patch: Partial<ChartSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      saveChartSettings(next)
      return next
    })
  }

  const reload = useCallback(() => {
    const gen = ++loadGen.current
    const ac = new AbortController()
    setState({ status: 'loading' })
    setBars([])
    setDataTf(null)
    setHasMore(true)
    setHover(null)
    setNewsTip(null)
    setVpLayout(null)
    vpProfileRef.current = null
    prependRef.current = 0
    Promise.all([loadLib(), api.bars(symbol, tf, undefined, ac.signal)])
      .then(([chartLib, page]) => {
        if (gen !== loadGen.current) return
        setLib(chartLib)
        if (!page.bars.length) {
          setBars([])
          setDataTf(null)
          setHasMore(false)
          setState({
            status: 'empty',
            reason: tf === '1m'
              ? '该周期暂无数据。1 分钟线通常只能覆盖较近交易时段，超出可得范围时接口不会返回更早的 K 线。'
              : '该周期暂无 K 线数据（可能停牌、退市、代码有误，或所选周期超出可得范围）。',
          })
          return
        }
        setBars(page.bars)
        setDataTf(page.tf)
        setHasMore(page.hasMore)
        setState({ status: 'ready' })
      })
      .catch(e => {
        if (gen !== loadGen.current || ac.signal.aborted) return
        setState({ status: 'error', message: e instanceof Error ? e.message : '行情暂时无法获取' })
      })
    return () => { ac.abort() }
  }, [symbol, tf, api, loadLib])

  useEffect(() => reload(), [reload]) // reload 自身返回 abort cleanup

  const loadOlder = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return
    const cur = barsRef.current
    if (!cur.length) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    const before = cur[0].t
    const gen = loadGen.current
    try {
      const page = await api.bars(symbol, tf, before)
      if (gen !== loadGen.current) return
      if (!page.bars.length) {
        setHasMore(false)
        return
      }
      const firstT = cur[0].t
      const older = page.bars.filter(b => b.t < firstT)
      if (!older.length) {
        setHasMore(page.hasMore)
        return
      }
      prependRef.current = older.length
      setBars(prev => [...older, ...prev])
      setHasMore(page.hasMore)
    } catch {
      /* 翻页失败保留现图 */
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [api, symbol, tf])
  loadOlderRef.current = loadOlder

  const closes = useMemo(() => bars.map(b => b.c), [bars])
  const volumes = useMemo(() => bars.map(b => b.v), [bars])

  // 新闻按 K 索引缓存，供点击/悬停
  useEffect(() => {
    const map = new Map<number, { ids: string[]; titles: string[] }>()
    for (const m of groupNewsMarks(bars, news)) {
      map.set(m.barIndex, { ids: m.ids, titles: m.titles })
    }
    newsByBarRef.current = map
  }, [bars, news])

  function applyPaneHeights(chart: IChartApi, ratio: number) {
    const panes = chart.panes()
    if (panes.length < 2) return
    const mainStretch = Math.max(0.4, 1 - ratio)
    const subEach = ratio / (panes.length - 1)
    panes[0].setStretchFactor(mainStretch)
    for (let i = 1; i < panes.length; i++) panes[i].setStretchFactor(subEach)
  }

  function pushSeriesData(h: ChartHandles, all: Bar[], s: ChartSettings) {
    const cs = all.map(b => b.c)
    const riseC = token(inferRedUp(symbol) ? '--up' : '--down')
    const fallC = token(inferRedUp(symbol) ? '--down' : '--up')
    const tz = timezoneRef.current
    const curTf = tfRef.current
    const tOf = (sec: number): Time => asSeriesTime(sec, tz, curTf)
    h.candles.setData(all.map(b => ({ time: tOf(b.t), open: b.o, high: b.h, low: b.l, close: b.c })))
    if (h.volume) {
      h.volume.setData(all.map(b => ({
        time: tOf(b.t),
        value: b.v,
        color: b.c >= b.o ? withAlpha(riseC, 0.5) : withAlpha(fallC, 0.5),
      })))
    }
    if (h.dif && h.dea && h.hist) {
      const m = calcMacd(cs)
      h.hist.setData(m.flatMap((p, i) => p.hist == null ? [] : [{
        time: tOf(all[i].t),
        value: p.hist,
        color: p.hist >= 0 ? withAlpha(riseC, 0.55) : withAlpha(fallC, 0.55),
      }]))
      h.dif.setData(m.flatMap((p, i) => p.dif == null ? [] : [{ time: tOf(all[i].t), value: p.dif }]))
      h.dea.setData(m.flatMap((p, i) => p.dea == null ? [] : [{ time: tOf(all[i].t), value: p.dea }]))
    }
    for (const [period, line] of h.mas) {
      const avg = sma(cs, period)
      line.setData(avg.flatMap((v, i) => v == null ? [] : [{ time: tOf(all[i].t), value: v }]))
    }
    void s
  }

  function layoutVpPixels(chart: IChartApi, candles: ISeriesApi<'Candlestick'>, profile: VolumeProfileResult): VpPixelLayout | null {
    const host = hostRef.current
    const paneEl = chart.panes()[0]?.getHTMLElement?.() ?? null
    if (!host || !paneEl) return null
    const hostRect = host.getBoundingClientRect()
    const paneRect = paneEl.getBoundingClientRect()
    const paneTop = paneRect.top - hostRect.top
    const paneHeight = paneRect.height
    if (!(paneHeight > 0)) return null

    const yOf = (price: number): number | null => {
      const y = candles.priceToCoordinate(price)
      return y == null || Number.isNaN(y as number) ? null : (y as number)
    }

    const bins: VpPixelBin[] = []
    for (const b of profile.bins) {
      const yTop = yOf(b.high)
      const yBot = yOf(b.low)
      if (yTop == null || yBot == null) continue
      bins.push({
        yTop: Math.min(yTop, yBot),
        yBot: Math.max(yTop, yBot),
        upVolume: b.upVolume,
        downVolume: b.downVolume,
        total: b.total,
      })
    }

    const pocY = profile.poc == null ? null : yOf(profile.poc)
    const vaTopY = profile.valueAreaHigh == null ? null : yOf(profile.valueAreaHigh)
    const vaBotY = profile.valueAreaLow == null ? null : yOf(profile.valueAreaLow)

    return {
      profile,
      bins,
      pocY,
      vaTopY: vaTopY == null || vaBotY == null ? null : Math.min(vaTopY, vaBotY),
      vaBotY: vaTopY == null || vaBotY == null ? null : Math.max(vaTopY, vaBotY),
      paneTop,
      paneHeight,
    }
  }

  function recalcVp(chart: IChartApi, all: Bar[], enabled: boolean) {
    const candles = handlesRef.current?.candles
    if (!enabled || !all.length || !candles) {
      vpProfileRef.current = null
      setVpLayout(null)
      publishTestApi(null)
      return
    }
    const range = chart.timeScale().getVisibleLogicalRange()
    if (!range) {
      vpProfileRef.current = null
      setVpLayout(null)
      publishTestApi(null)
      return
    }
    const from = Math.max(0, Math.floor(range.from))
    const to = Math.min(all.length - 1, Math.ceil(range.to))
    const slice = all.slice(from, to + 1)
    const paneH = chart.paneSize(0)?.height ?? 280
    const profile = computeVolumeProfile(slice, binCountForHeight(paneH))
    vpProfileRef.current = profile
    const layout = layoutVpPixels(chart, candles, profile)
    setVpLayout(layout)
    publishTestApi(layout)
  }

  function publishTestApi(layout: VpPixelLayout | null) {
    const h = handlesRef.current
    const all = barsRef.current
    const last = all[all.length - 1]
    const api: SlChartTestApi = {
      pocPrice: layout?.profile.poc ?? null,
      valueAreaLow: layout?.profile.valueAreaLow ?? null,
      valueAreaHigh: layout?.profile.valueAreaHigh ?? null,
      pocY: layout?.pocY ?? null,
      vaTopY: layout?.vaTopY ?? null,
      vaBotY: layout?.vaBotY ?? null,
      priceToCoordinate: (price: number) => {
        const y = h?.candles.priceToCoordinate(price)
        return y == null ? null : (y as number)
      },
      lastBarTimeLabel: last ? formatBarTime(last.t, timezoneRef.current, tfRef.current) : null,
      footEndDate: last ? formatShortDate(last.t, timezoneRef.current) : null,
    }
    ;(window as unknown as { __slChartTest?: SlChartTestApi }).__slChartTest = api
  }

  // 建图（结构变化或首次 ready）
  useEffect(() => {
    const el = hostRef.current
    if (!el || !lib || state.status !== 'ready' || !bars.length) return
    if (dataTf !== tf) return // 旧数据 + 新周期 → 跳过，等 reload 完成

    const chart = lib.createChart(el, {
      autoSize: true,
      layout: {
        background: { type: lib.ColorType.Solid, color: token('--bg-card') },
        textColor: token('--text-secondary'),
        fontSize: 11,
        attributionLogo: true,
        panes: {
          enableResize: true,
          separatorColor: withAlpha(token('--border-subtle'), 0.9),
          separatorHoverColor: token('--accent'),
        },
      },
      grid: {
        vertLines: { color: withAlpha(token('--border-subtle'), 0.6) },
        horzLines: { color: withAlpha(token('--border-subtle'), 0.9) },
      },
      rightPriceScale: { borderColor: token('--border-subtle') },
      timeScale: {
        borderColor: token('--border-subtle'),
        rightOffset: 6,
        timeVisible: tf !== '1d' && tf !== '1w' && tf !== '1mo',
        secondsVisible: false,
        tickMarkFormatter: (time: Time) => {
          if (typeof time === 'string') return formatTickMark(time, timezoneRef.current, tfRef.current)
          if (typeof time === 'number') return formatTickMark(time, timezoneRef.current, tfRef.current)
          const biz = time as BusinessDay
          return formatTickMark(
            `${biz.year}-${String(biz.month).padStart(2, '0')}-${String(biz.day).padStart(2, '0')}`,
            timezoneRef.current,
            tfRef.current,
          )
        },
      },
      crosshair: { mode: lib.CrosshairMode.Normal },
      localization: {
        locale: 'zh-CN',
        dateFormat: 'yyyy-MM-dd',
        timeFormatter: (time: Time) => {
          if (typeof time === 'number') return formatBarTime(time, timezoneRef.current, tfRef.current)
          if (typeof time === 'string') return time.replace(/-/g, '/')
          const biz = time as BusinessDay
          return `${biz.year}/${String(biz.month).padStart(2, '0')}/${String(biz.day).padStart(2, '0')}`
        },
      },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
    })

    const candles = chart.addSeries(lib.CandlestickSeries, {
      upColor: rise,
      downColor: fall,
      wickUpColor: rise,
      wickDownColor: fall,
      borderVisible: false,
      priceLineVisible: true,
    }, 0)

    let volume: ISeriesApi<'Histogram'> | null = null
    if (settings.volume) {
      chart.addPane(true)
      volume = chart.addSeries(lib.HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceLineVisible: false,
        lastValueVisible: false,
      }, 1)
    }

    let dif: ISeriesApi<'Line'> | null = null
    let dea: ISeriesApi<'Line'> | null = null
    let hist: ISeriesApi<'Histogram'> | null = null
    if (settings.macd) {
      const paneIdx = settings.volume ? 2 : 1
      while (chart.panes().length <= paneIdx) chart.addPane(true)
      hist = chart.addSeries(lib.HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, paneIdx)
      dif = chart.addSeries(lib.LineSeries, {
        color: token('--accent'), lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      }, paneIdx)
      dea = chart.addSeries(lib.LineSeries, {
        color: token('--system-yellow'), lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      }, paneIdx)
    }

    const mas = new Map<number, ISeriesApi<'Line'>>()
    for (const p of settings.ma) {
      mas.set(p, chart.addSeries(lib.LineSeries, {
        color: token(MA_COLOR[p] ?? '--text-secondary'),
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      }, 0))
    }

    const markers = lib.createSeriesMarkers(candles, [])
    const handles: ChartHandles = { chart, candles, volume, dif, dea, hist, mas, markers, lib }
    handlesRef.current = handles
    pushSeriesData(handles, bars, settings)
    applyPaneHeights(chart, paneRatioRef.current)

    const n = bars.length
    const visible = VISIBLE_BARS[tf]
    if (n > visible) chart.timeScale().setVisibleLogicalRange({ from: n - visible, to: n + 4 })
    else chart.timeScale().fitContent()

    const onMove = (param: MouseEventParams<Time>) => {
      if (param.point === undefined || param.logical === undefined) {
        setHover(null)
        return
      }
      const idx = Math.round(param.logical as number)
      const all = barsRef.current
      if (idx < 0 || idx >= all.length) {
        setHover(null)
        return
      }
      setHover(idx)
      if (newsOnRef.current) {
        const hitId = typeof param.hoveredObjectId === 'string' ? param.hoveredObjectId : null
        if (hitId && hitId.startsWith('news:')) {
          const ids = hitId.slice(5).split(',')
          const titles = ids.map(id => newsRef.current.find(n => n.id === id)?.title ?? id)
          setNewsTip({ x: param.point.x, y: param.point.y, ids, titles })
        }
      }
    }

    const onClick = (param: MouseEventParams<Time>) => {
      if (!param.point) return
      const hitId = typeof param.hoveredObjectId === 'string' ? param.hoveredObjectId : null
      if (hitId?.startsWith('news:') && newsOnRef.current) {
        const ids = hitId.slice(5).split(',')
        const titles = ids.map(id => newsRef.current.find(n => n.id === id)?.title ?? id)
        setNewsTip({ x: param.point.x, y: param.point.y, ids, titles })
        return
      }
      if (param.logical != null && newsOnRef.current) {
        const idx = Math.round(param.logical as number)
        const pack = newsByBarRef.current.get(idx)
        if (pack) setNewsTip({ x: param.point.x, y: param.point.y, ids: pack.ids, titles: pack.titles })
      }
    }

    const scheduleVp = () => {
      if (vpTimer.current) clearTimeout(vpTimer.current)
      vpTimer.current = setTimeout(() => {
        recalcVp(chart, barsRef.current, settingsRef.current.volumeProfile)
      }, 80)
    }

    const onRange = (range: LogicalRange | null) => {
      if (range && range.from < 8) void loadOlderRef.current()
      scheduleVp()
    }

    const onSize = () => scheduleVp()
    // 价格轴拖动 / 缩放后重算（库无专用订阅，用 pointerup + 尺寸变化兜底）
    const onPointerUp = () => scheduleVp()

    chart.subscribeCrosshairMove(onMove)
    chart.subscribeClick(onClick)
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange)
    chart.timeScale().subscribeSizeChange(onSize)
    el.addEventListener('pointerup', onPointerUp)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => scheduleVp()) : null
    ro?.observe(el)
    recalcVp(chart, bars, settings.volumeProfile)

    return () => {
      if (vpTimer.current) clearTimeout(vpTimer.current)
      chart.unsubscribeCrosshairMove(onMove)
      chart.unsubscribeClick(onClick)
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange)
      chart.timeScale().unsubscribeSizeChange(onSize)
      el.removeEventListener('pointerup', onPointerUp)
      ro?.disconnect()
      markers.detach()
      chart.remove()
      handlesRef.current = null
      delete (window as unknown as { __slChartTest?: SlChartTestApi }).__slChartTest
    }
    // bars 变化走下面的 data effect；此处只在结构/库/周期/ready 时建图
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib, state.status, tf, dataTf, structureKey, rise, fall, symbol, timezone])

  // 数据更新：setData + 无跳动左拼接
  useEffect(() => {
    const h = handlesRef.current
    if (!h || state.status !== 'ready' || !bars.length || dataTf !== tf) return
    const shift = prependRef.current
    const range = shift > 0 ? h.chart.timeScale().getVisibleLogicalRange() : null
    pushSeriesData(h, bars, settings)
    if (shift > 0 && range) {
      prependRef.current = 0
      h.chart.timeScale().setVisibleLogicalRange({
        from: range.from + shift,
        to: range.to + shift,
      })
    }
    recalcVp(h.chart, bars, settings.volumeProfile)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars, state.status, dataTf, tf])

  // 副图高度
  useEffect(() => {
    const h = handlesRef.current
    if (!h) return
    applyPaneHeights(h.chart, paneRatio)
    // 高度变化后价格坐标会变，延迟一帧再量
    requestAnimationFrame(() => recalcVp(h.chart, barsRef.current, settingsRef.current.volumeProfile))
  }, [paneRatio])

  // 价位成交量开关
  useEffect(() => {
    const h = handlesRef.current
    if (!h) return
    recalcVp(h.chart, barsRef.current, settings.volumeProfile)
  }, [settings.volumeProfile])

  // 新闻 / 常见指标 markers
  useEffect(() => {
    const h = handlesRef.current
    if (!h || !bars.length || dataTf !== tf) return
    const tz = timezone
    const markers: SeriesMarker<Time>[] = []
    if (newsOn && news.length) {
      for (const m of groupNewsMarks(bars, news)) {
        markers.push({
          time: asSeriesTime(m.t, tz, tf),
          position: 'aboveBar',
          color: token('--accent'),
          shape: 'circle',
          text: m.ids.length > 1 ? String(m.ids.length) : '讯',
          size: 1,
          id: `news:${m.ids.join(',')}`,
        })
      }
    }
    if (settings.commonSignals) {
      const periods = settings.ma.length >= 2 ? settings.ma : [5, 10, 20, 60]
      for (const x of commonMaCrosses(closes, periods)) {
        const b = bars[x.index]
        if (!b) continue
        markers.push({
          time: asSeriesTime(b.t, tz, tf),
          position: x.kind === 'golden' ? 'belowBar' : 'aboveBar',
          color: x.kind === 'golden' ? rise : fall,
          shape: x.kind === 'golden' ? 'arrowUp' : 'arrowDown',
          text: x.kind === 'golden' ? '金' : '死',
          size: 1,
        })
      }
      for (const i of volumeSpikes(volumes, 20, 2)) {
        const b = bars[i]
        if (!b) continue
        markers.push({
          time: asSeriesTime(b.t, tz, tf),
          position: 'aboveBar',
          color: token('--system-yellow'),
          shape: 'square',
          text: '量',
          size: 1,
        })
      }
    }
    markers.sort((a, b) => {
      const ta = typeof a.time === 'number' ? a.time : String(a.time)
      const tb = typeof b.time === 'number' ? b.time : String(b.time)
      return ta < tb ? -1 : ta > tb ? 1 : 0
    })
    h.markers.setMarkers(markers)
  }, [bars, news, newsOn, settings.commonSignals, settings.ma, closes, volumes, rise, fall, timezone, tf, dataTf])

  const goLatest = () => {
    const h = handlesRef.current
    if (!h || !bars.length) return
    const n = bars.length
    const visible = VISIBLE_BARS[tf]
    h.chart.timeScale().setVisibleLogicalRange({ from: Math.max(-2, n - visible), to: n + 4 })
  }

  const resetView = () => {
    handlesRef.current?.chart.timeScale().fitContent()
  }

  const toggleFullscreen = async () => {
    const el = rootRef.current
    if (!el) return
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen()
        setFullscreen(true)
      } else {
        await document.exitFullscreen()
        setFullscreen(false)
      }
    } catch {
      setFullscreen(f => !f)
    }
  }

  useEffect(() => {
    const onFs = () => {
      setFullscreen(!!document.fullscreenElement)
      // 退出全屏后图表 autoSize 会自己恢复；强制一次 resize 感知
      requestAnimationFrame(() => {
        handlesRef.current?.chart.timeScale().scrollToRealTime()
      })
    }
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const shown = hover != null && bars[hover] ? hover : (bars.length ? bars.length - 1 : -1)
  const row = shown >= 0 ? bars[shown] : null
  const prev = shown > 0 ? bars[shown - 1] : undefined
  const changePct = row && prev && prev.c ? ((row.c - prev.c) / prev.c) * 100 : null

  const footDates = bars.length
    ? `已加载 ${bars.length} 根 · ${formatShortDate(bars[0].t, timezone)} — ${formatShortDate(bars[bars.length - 1].t, timezone)}`
    : ''

  return (
    <div
      ref={rootRef}
      className={`sl-chart${fullscreen ? ' is-fullscreen' : ''}`}
      data-testid="chart-workbench"
    >
      <div className="sl-chart__toolbar">
        <div className="sl-chart__tfs" role="group" aria-label="K 线周期">
          {TIMEFRAMES.map(t => (
            <button key={t} type="button" aria-pressed={tf === t} onClick={() => setTf(t)}>
              {TF_LABEL[t]}
            </button>
          ))}
        </div>
        <label className="sl-chart__tf-mobile">
          <span className="visually-hidden">周期</span>
          <select
            className="sl-chart__tf-select"
            aria-label="K 线周期"
            value={tf}
            onChange={e => setTf(e.target.value as Timeframe)}
          >
            {TIMEFRAMES.map(t => <option key={t} value={t}>{TF_LABEL[t]}</option>)}
          </select>
        </label>
        <div className="sl-chart__actions">
          <button type="button" onClick={goLatest}>回到最新</button>
          <button type="button" onClick={resetView}>重置视图</button>
          <button type="button" aria-pressed={newsOn} onClick={() => setNewsOn(v => !v)}>
            {newsOn ? '新闻打点开' : '新闻打点关'}
          </button>
          <button type="button" onClick={() => setSettingsOpen(true)}>图表设置</button>
          <button type="button" onClick={() => void toggleFullscreen()}>
            {fullscreen ? '退出全屏' : '全屏'}
          </button>
        </div>
      </div>

      {state.status === 'ready' && row && (
        <div className="sl-chart__readout" aria-live="polite">
          <span className="sl-chart__readout-time">{formatBarTime(row.t, timezone, tf)}</span>
          <span>开 {fmtPrice(row.o)}</span>
          <span>高 {fmtPrice(row.h)}</span>
          <span>低 {fmtPrice(row.l)}</span>
          <span>
            收{' '}
            <b className={row.c === row.o ? undefined : (row.c > row.o) === redUp ? 'sl-chart__tone-up' : 'sl-chart__tone-down'}>
              {fmtPrice(row.c)}
            </b>
          </span>
          {changePct != null && (
            <span className={changePct === 0 ? undefined : (changePct > 0) === redUp ? 'sl-chart__tone-up' : 'sl-chart__tone-down'}>
              {changePct > 0 ? '+' : changePct < 0 ? '−' : ''}{Math.abs(changePct).toFixed(2)}%
            </span>
          )}
          <span>量 {fmtVolume(row.v)}</span>
        </div>
      )}

      <div className="sl-chart__frame">
        {state.status === 'loading' && (
          <div className="sl-chart__placeholder" role="status" aria-label="正在加载">
            <div className="sl-chart__skeleton" />
            <span>正在加载 K 线…</span>
          </div>
        )}
        {state.status === 'error' && (
          <div className="sl-chart__placeholder" role="alert">
            <p>K 线暂时无法获取：{state.message}</p>
            <button type="button" className="tool-btn" onClick={() => reload()}>重试</button>
          </div>
        )}
        {state.status === 'empty' && (
          <div className="sl-chart__placeholder" role="note">
            <p>{state.reason}</p>
          </div>
        )}
        {state.status === 'ready' && (
          <>
            <div
              ref={hostRef}
              className="sl-chart__canvas"
              role="img"
              aria-label={`${symbol} ${TF_LABEL[tf]} K 线图`}
            />
            {settings.volumeProfile && vpLayout && vpLayout.bins.length > 0 && (
              <VolumeProfileOverlay layout={vpLayout} rise={rise} fall={fall} />
            )}
            {newsTip && (
              <div
                className="sl-chart__news-tip"
                ref={el => {
                  if (!el) return
                  el.style.setProperty('--sl-tip-x', `${Math.min(newsTip.x, 240)}px`)
                  el.style.setProperty('--sl-tip-y', `${Math.max(8, newsTip.y - 8)}px`)
                }}
                role="dialog"
                aria-label="新闻"
              >
                {newsTip.titles.map((title, i) => (
                  <button
                    key={newsTip.ids[i]}
                    type="button"
                    onClick={() => {
                      onSelectNews?.(newsTip.ids[i])
                      setNewsTip(null)
                    }}
                  >
                    {title}
                  </button>
                ))}
                <button type="button" onClick={() => setNewsTip(null)}>关闭</button>
              </div>
            )}
          </>
        )}
      </div>

      {state.status === 'ready' && (settings.volume || settings.macd) && (
        <div className="sl-chart__pane-resizer">
          <label htmlFor="sl-pane-ratio">副图高度</label>
          <input
            id="sl-pane-ratio"
            type="range"
            min={0.12}
            max={0.45}
            step={0.01}
            value={paneRatio}
            aria-label="调整副图高度"
            aria-valuemin={12}
            aria-valuemax={45}
            aria-valuenow={Math.round(paneRatio * 100)}
            onChange={e => setPaneRatio(Number(e.target.value))}
            onKeyDown={e => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
                e.preventDefault()
                setPaneRatio(v => Math.min(0.45, +(v + 0.01).toFixed(2)))
              } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
                e.preventDefault()
                setPaneRatio(v => Math.max(0.12, +(v - 0.01).toFixed(2)))
              }
            }}
          />
        </div>
      )}

      <div className="sl-chart__foot">
        {state.status === 'ready' && (
          <>
            <span>{footDates}{loadingMore ? ' · 正在加载更早…' : ''}{!hasMore ? ' · 没有更多历史' : ''}</span>
            {settings.commonSignals && (
              <span className="sl-chart__signal-note">常见技术指标，不是买卖信号</span>
            )}
            {settings.volumeProfile && vpLayout && <span>{VOLUME_PROFILE_NOTE}</span>}
            <span>
              图表：
              <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer" className="rn-link">
                TradingView Lightweight Charts™
              </a>
            </span>
          </>
        )}
      </div>

      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} title="图表设置" size="md">
        <div className="sl-chart__settings">
          <fieldset>
            <legend>均线</legend>
            {MA_OPTIONS.map(p => (
              <label key={p}>
                <input
                  type="checkbox"
                  checked={settings.ma.includes(p)}
                  onChange={e => {
                    const ma = e.target.checked
                      ? [...settings.ma, p].sort((a, b) => a - b) as MaPeriod[]
                      : settings.ma.filter(x => x !== p)
                    patchSettings({ ma })
                  }}
                />
                MA{p}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>显示</legend>
            <label>
              <input
                type="checkbox"
                checked={settings.volumeProfile}
                onChange={e => patchSettings({ volumeProfile: e.target.checked })}
              />
              价位成交量
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.volume}
                onChange={e => patchSettings({ volume: e.target.checked })}
              />
              成交量
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.macd}
                onChange={e => patchSettings({ macd: e.target.checked })}
              />
              MACD
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.commonSignals}
                onChange={e => patchSettings({ commonSignals: e.target.checked })}
              />
              常见指标
            </label>
          </fieldset>
          {settings.commonSignals && (
            <p className="sl-chart__settings-hint">常见技术指标，不是买卖信号。含均线金叉/死叉与成交量突增（量 &gt; 20 根均量 2 倍）。</p>
          )}
          <p className="sl-chart__settings-hint">设置保存在本机浏览器，换设备不会同步。</p>
        </div>
      </Dialog>
    </div>
  )
}

function VolumeProfileOverlay({ layout, rise, fall }: {
  layout: VpPixelLayout
  rise: string
  fall: string
}): JSX.Element {
  const max = Math.max(...layout.bins.map(b => b.total), 1)
  const H = layout.paneHeight

  return (
    <div
      className="sl-chart__vp"
      aria-hidden="true"
      data-testid="volume-profile"
      data-poc-y={layout.pocY ?? undefined}
      data-poc-price={layout.profile.poc ?? undefined}
      ref={el => {
        if (!el) return
        el.style.setProperty('--sl-vp-top', `${layout.paneTop}px`)
        el.style.setProperty('--sl-vp-height', `${layout.paneHeight}px`)
      }}
    >
      <svg width="100%" height={H} viewBox={`0 0 100 ${H}`} preserveAspectRatio="none">
        {layout.vaTopY != null && layout.vaBotY != null && (
          <rect
            x="0"
            y={layout.vaTopY}
            width="100"
            height={Math.max(1, layout.vaBotY - layout.vaTopY)}
            fill={withAlpha(token('--system-yellow'), 0.18)}
            data-testid="vp-value-area"
          />
        )}
        {layout.bins.map((b, i) => {
          const w = (b.total / max) * 100
          const h = Math.max(1, b.yBot - b.yTop)
          const upW = b.total > 0 ? (b.upVolume / b.total) * w : 0
          return (
            <g key={i}>
              <rect x={100 - w} y={b.yTop} width={w} height={h} fill={withAlpha(fall, 0.35)} />
              <rect x={100 - upW} y={b.yTop} width={upW} height={h} fill={withAlpha(rise, 0.45)} />
            </g>
          )
        })}
        {layout.pocY != null && (
          <line
            x1="0" x2="100"
            y1={layout.pocY} y2={layout.pocY}
            stroke={token('--accent')}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            data-testid="vp-poc"
          />
        )}
      </svg>
      <div className="sl-chart__vp-note">70% 价值区</div>
    </div>
  )
}
