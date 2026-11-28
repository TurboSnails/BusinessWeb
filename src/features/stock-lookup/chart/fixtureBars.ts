/** 把接口任务 fixtures/ 里的 Yahoo chart 样本转成 BarsPage，供组件测使用 */
import type { Bar, BarsPage, Timeframe } from '../types'

interface YahooChartFixture {
  meta?: { symbol?: string; exchangeTimezoneName?: string }
  timestamp?: number[]
  indicators?: { quote?: Array<{ open?: number[]; high?: number[]; low?: number[]; close?: number[]; volume?: number[] }> }
}

export function barsPageFromYahooChart(
  raw: YahooChartFixture,
  tf: Timeframe = '1d',
): BarsPage {
  const q = raw.indicators?.quote?.[0]
  const ts = raw.timestamp ?? []
  const bars: Bar[] = []
  for (let i = 0; i < ts.length; i++) {
    const o = q?.open?.[i], h = q?.high?.[i], l = q?.low?.[i], c = q?.close?.[i], v = q?.volume?.[i]
    if (o == null || h == null || l == null || c == null) continue
    bars.push({ t: ts[i], o, h, l, c, v: v ?? 0 })
  }
  return {
    symbol: raw.meta?.symbol ?? 'MRVL',
    tf,
    bars,
    hasMore: false,
    timezone: raw.meta?.exchangeTimezoneName ?? 'America/New_York',
    adjustment: 'split',
    source: 'yahoo',
  }
}
