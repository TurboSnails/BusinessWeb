import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import type { VolumeProfileResult } from './volumeProfile'

export interface VpPixelBin {
  yTop: number
  yBot: number
  upVolume: number
  downVolume: number
  total: number
}

/** 主图内像素坐标的价位成交量布局（y 相对主图 pane 顶边） */
export interface VpPixels {
  profile: VolumeProfileResult
  /** overlay 相对 chart host 的 top */
  paneTop: number
  paneHeight: number
  bins: VpPixelBin[]
  pocY: number | null
  vaTop: number | null
  vaBot: number | null
  maxVol: number
}

/**
 * 用 candles.priceToCoordinate 把价格档映射到主图像素，并裁剪到 pane 高度内。
 * hostEl = 图表 canvas 容器；pane 用 chart.panes()[0]。
 */
export function buildVpPixels(
  chart: IChartApi,
  candles: ISeriesApi<'Candlestick'>,
  hostEl: HTMLElement,
  profile: VolumeProfileResult,
): VpPixels | null {
  const pane = chart.panes()[0]
  const paneEl = pane?.getHTMLElement?.() ?? null
  if (!paneEl || !profile.bins.length) return null

  const hostRect = hostEl.getBoundingClientRect()
  const paneRect = paneEl.getBoundingClientRect()
  const paneTop = paneRect.top - hostRect.top
  const paneHeight = paneRect.height
  if (!(paneHeight > 0)) return null

  const clip = (y: number | null): number | null => {
    if (y == null || !Number.isFinite(y)) return null
    return Math.max(0, Math.min(paneHeight, y))
  }

  const bins: VpPixelBin[] = []
  for (const b of profile.bins) {
    const rawTop = candles.priceToCoordinate(b.high)
    const rawBot = candles.priceToCoordinate(b.low)
    if (rawTop == null || rawBot == null) continue
    const yTop = clip(Math.min(rawTop, rawBot))!
    const yBot = clip(Math.max(rawTop, rawBot))!
    if (yBot - yTop < 0.5 && b.total <= 0) continue
    bins.push({
      yTop,
      yBot: Math.max(yTop + 0.5, yBot),
      upVolume: b.upVolume,
      downVolume: b.downVolume,
      total: b.total,
    })
  }

  const pocY = profile.poc != null ? clip(candles.priceToCoordinate(profile.poc)) : null
  let vaTop: number | null = null
  let vaBot: number | null = null
  if (profile.valueAreaHigh != null && profile.valueAreaLow != null) {
    const a = candles.priceToCoordinate(profile.valueAreaHigh)
    const b = candles.priceToCoordinate(profile.valueAreaLow)
    if (a != null && b != null) {
      vaTop = clip(Math.min(a, b))
      vaBot = clip(Math.max(a, b))
    }
  }

  const maxVol = Math.max(...bins.map(x => x.total), 1)
  return { profile, paneTop, paneHeight, bins, pocY, vaTop, vaBot, maxVol }
}
