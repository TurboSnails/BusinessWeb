// LwChart 的纯计算：K 线/成交量/均线数据映射、研究价位能否画成水平线、文字摘要。
// 价位规则复用 levelsModel.buildPriceLevels（币种不一致、与价格锚点相差 10 倍以上 → 不可比较），
// 画到图上之前再用图表自身的最新收盘价复核一次（币种必须等于图表币种、相差不超过 10 倍），
// 这样价格锚点过期（stale）或缺失时，线也不会凭旧价/无价被画出来。
import type { Market } from '../../data/companies'
import type { HistoryCandle } from '../../components/pulse/chinaHistory'
import { buildPriceLevels, type LevelKey, type PriceLevelsInput } from './levelsModel'
import type { ChartCurrency } from './symbols'

export const MA_PERIODS = [20, 60] as const

export interface CandlePoint { time: string; open: number; high: number; low: number; close: number }
export interface VolumePoint { time: string; value: number; color: string }
export interface LinePoint { time: string; value: number }

/** 美股绿涨红跌；沪深/港股红涨绿跌 */
export function isRedUp(market: Market): boolean {
  return market === 'cn' || market === 'hk'
}

export function toCandleData(rows: HistoryCandle[]): CandlePoint[] {
  return rows.map(r => ({ time: r.date, open: r.open, high: r.high, low: r.low, close: r.close }))
}

export function toVolumeData(rows: HistoryCandle[], riseColor: string, fallColor: string): VolumePoint[] {
  return rows.map(r => ({ time: r.date, value: r.volume, color: r.close >= r.open ? riseColor : fallColor }))
}

/** 简单移动平均（收盘价）；不足 n 根的前段不出点 */
export function movingAverage(rows: HistoryCandle[], n: number): LinePoint[] {
  const out: LinePoint[] = []
  let sum = 0
  rows.forEach((r, i) => {
    sum += r.close
    if (i >= n) sum -= rows[i - n].close
    if (i >= n - 1) out.push({ time: r.date, value: Math.round(sum / n * 10_000) / 10_000 })
  })
  return out
}

export const LEVEL_SHORT: Record<LevelKey, string> = { bear: '悲观', base: '基准', bull: '乐观', 'dcf-buy': 'DCF 买入', 'dcf-fair': 'DCF 合理' }

export interface ChartLevel {
  key: LevelKey
  label: string
  short: string
  value: number
  /** 是否在纵轴自动缩放范围内（最新收盘的 1/3–3 倍）；超出时线仍画，但需拖动纵轴才看得到 */
  inAutoscale: boolean
}
export interface ChartLevelsModel {
  drawn: ChartLevel[]
  notDrawn: { key: LevelKey; label: string; value: number; reason: string }[]
  anchorStale: boolean
}

export function chartLevels(input: PriceLevelsInput, chartCurrency: ChartCurrency, latestClose: number | undefined): ChartLevelsModel {
  const model = buildPriceLevels(input)
  const drawn: ChartLevel[] = []
  const notDrawn: ChartLevelsModel['notDrawn'] = []
  for (const l of model.levels) {
    const skip = (reason: string): void => { notDrawn.push({ key: l.key, label: l.label, value: l.value, reason }) }
    if (!l.comparable) { skip(l.reason ?? '不可比较'); continue }
    if (l.currency !== chartCurrency) { skip(l.currency ? `币种（${l.currency}）与走势图（${chartCurrency}）不同` : '币种未知'); continue }
    if (latestClose == null || !(latestClose > 0)) { skip('走势图没有最新收盘价，无法复核口径'); continue }
    const ratio = l.value / latestClose
    if (ratio < 0.1 || ratio > 10) { skip('与走势图最新收盘相差 10 倍以上，疑似口径不同'); continue }
    drawn.push({ key: l.key, label: l.label, short: LEVEL_SHORT[l.key], value: l.value, inAutoscale: ratio >= 1 / 3 && ratio <= 3 })
  }
  return { drawn, notDrawn, anchorStale: !!model.anchor?.stale }
}

const CURRENCY_UNIT: Record<ChartCurrency, string> = { CNY: '元', HKD: '港元', USD: '美元' }
export const currencyUnit = (c: ChartCurrency): string => CURRENCY_UNIT[c]

export const fmtPrice = (n: number): string => n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 给读屏与图注用的文字摘要：区间最低/最高、最新收盘与日期 */
export function chartSummary(rows: HistoryCandle[], period: 'day' | 'week', currency: ChartCurrency): string {
  if (!rows.length) return ''
  const last = rows[rows.length - 1]
  const low = Math.min(...rows.map(r => r.low)), high = Math.max(...rows.map(r => r.high))
  const unit = CURRENCY_UNIT[currency]
  return `近 ${rows.length} ${period === 'day' ? '个交易日' : '周'}最低 ${fmtPrice(low)} ${unit}、最高 ${fmtPrice(high)} ${unit}，最新收盘 ${fmtPrice(last.close)} ${unit}（${last.date}）`
}

/** #RRGGBB / rgb(r, g, b) → rgba()；其它写法原样返回 */
export function withAlpha(color: string, alpha: number): string {
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(color.trim())
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return color
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
