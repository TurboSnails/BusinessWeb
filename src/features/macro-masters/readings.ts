// 宏观大师板块的实时读数（manager 定接口；本文件实现 loadReadings）
import { useEffect, useState } from 'react'
import { buildAdvDecMetrics, parseAdvDec } from '../us-market/advDec'
import { weekStart } from '../us-market/chartSeries'
import { isCopperStale } from '../us-market/copper'
import { percentileOf, spanYears, withinYears } from '../us-market/explain'
import type { Breadth, Point, Reading as UsReading } from '../us-market/model'
import { nyDate } from '../us-market/model'
import { nyseSessionsOnOrBefore } from '../us-market/tradingCalendar'
import type { MacroSnapshot, SeriesData } from '../macro/indicators'
import type { Reading, ReadingKey } from './types'

export type ReadingsResult = {
  readings: Partial<Record<ReadingKey, Reading | null>>
  asOf: string
  failedSources?: string[]
}

export type ReadingsState =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ok'; readings: Partial<Record<ReadingKey, Reading | null>>; asOf: string; failedSources?: string[] }

export const READING_LABELS: Record<ReadingKey, string> = {
  fedAssets: '美联储总资产',
  netLiquidity: '净流动性（近似）',
  bankReserves: '银行准备金',
  realRate: '实际政策利率',
  realYield10: '10 年期 TIPS 实际收益率',
  tenYear: '10 年期美债收益率',
  curve10y2y: '10 年 − 2 年期限利差',
  nfci: '芝加哥联储金融条件指数',
  hySpread: '高收益债利差',
  baaAaa: '穆迪 Baa − Aaa',
  spxAbove200: '标普 500 高于 200 日线占比',
  netNewHighs: '标普 500 净新高比例',
  advDecLine: '标普 500 累计涨跌线',
  mcclellan: 'McClellan 振荡（比例调整）',
  spxVs200dma: '标普 500 相对 200 日均线',
  epsRevision: '标普 500 前瞻 EPS 预期变化',
  forwardPe: '标普 500 前瞻市盈率',
  cape: '席勒 CAPE',
  vix: 'VIX',
  fearGreed: 'CNN 恐慌贪婪指数',
  retailBullBear: '散户看多减看空',
  naaim: 'NAAIM 主动经理敞口',
  marginDebtYoy: '融资余额同比',
  managerCash: '基金经理现金比例',
  copperGold: '铜金比',
  copper: 'COMEX 铜价',
}

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
const ROOT = `${BASE}data`
const DAY = 86_400_000
const FETCH_TIMEOUT_MS = 15_000
const FILES = {
  public: 'us-market-data.json',
  breadth: 'us-market-breadth.json',
  slices: 'us-market-slices.json',
  macro: 'macro-us.json',
  rates: 'us-equity-bond-spread.json',
} as const

type Freq = 'daily' | 'weekly' | 'monthly'
type Fetcher = typeof fetch

type PublicFile = { series?: Record<string, UsReading>; generatedAt?: string }
type BreadthFile = { breadth?: Record<string, Breadth>; generatedAt?: string }
type SlicesFile = { slices?: Array<{ id: string; history: Point[] }>; generatedAt?: string }
type RatesFile = {
  generatedAt?: string
  latestReal?: { date: string; value: number }
  latestYield?: { date: string; value: number }
  real?: [string, number][]
  rows?: Array<[string, number, number, number, number]>
}

type SourceLoad<T> = { ok: true; data: T } | { ok: false; label: string }

async function readJson(url: string, label: string, fetcher: Fetcher): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetcher(url, { cache: 'no-cache', signal: controller.signal })
    if (!response.ok) throw new Error(`${label}加载失败（HTTP ${response.status}）`)
    return await response.json()
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${label}加载失败（超时）`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function loadSource<T>(file: string, label: string, fetcher: Fetcher): Promise<SourceLoad<T>> {
  try {
    const data = await readJson(`${ROOT}/${file}`, label, fetcher) as T
    return { ok: true, data }
  } catch {
    return { ok: false, label }
  }
}

function detectFreq(raw?: string): Freq {
  if (!raw) return 'daily'
  if (/月|month|季|quarter/i.test(raw)) return 'monthly'
  if (/周|week/i.test(raw)) return 'weekly'
  return 'daily'
}

function calendarAge(date: string, asOf: string): number {
  return (Date.parse(asOf) - Date.parse(date)) / DAY
}

function isStale(date: string, freq: Freq, asOf: string, now = new Date()): boolean {
  if (!date || !asOf || date > asOf) return false
  if (freq === 'daily') {
    const sessions = nyseSessionsOnOrBefore(asOf, 8, now)
    if (sessions.length < 4) return calendarAge(date, asOf) > 5
    return date < sessions.at(-4)!
  }
  if (freq === 'weekly') return calendarAge(date, asOf) > 10
  return calendarAge(date, asOf) > 45
}

/** 过滤未来日、去重、剔除非有限值并按日期升序。 */
export function sanitizePoints(history: readonly Point[] | undefined, asOf: string): Point[] {
  if (!history?.length) return []
  const map = new Map<string, number>()
  for (const point of history) {
    const date = point?.[0]
    const value = point?.[1]
    if (typeof date !== 'string' || !date || date > asOf) continue
    if (!Number.isFinite(value)) continue
    map.set(date, value)
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])) as Point[]
}

/** 每个 ISO 周保留最后一个观测。 */
export function weeklyLastObservations(history: readonly Point[]): Point[] {
  const byWeek = new Map<string, Point>()
  for (const point of history) byWeek.set(weekStart(point[0]), point)
  return [...byWeek.values()].sort((a, b) => a[0].localeCompare(b[0]))
}

function decadePercentile(history: readonly Point[], value: number): { percentile: number; percentileYears: number } | undefined {
  const weekly = weeklyLastObservations(history)
  const window = withinYears(weekly, 10)
  if (window.length < 2) return undefined
  const years = spanYears(window)
  if (years < 5) return undefined
  return {
    percentile: percentileOf(window.map(([, v]) => v), value),
    percentileYears: Math.round(Math.min(years, 10) * 10) / 10,
  }
}

function monthAgoPoint(history: readonly Point[], asOfDate: string): Point | undefined {
  const target = Date.parse(asOfDate) - 28 * DAY
  const asOfMs = Date.parse(asOfDate)
  let best: Point | undefined
  let bestDist = Infinity
  for (const point of history) {
    const value = point[1]
    if (!Number.isFinite(value)) continue
    const t = Date.parse(point[0])
    if (!Number.isFinite(t) || t >= asOfMs) continue
    const age = (asOfMs - t) / DAY
    if (age < 18 || age > 40) continue
    const dist = Math.abs(t - target)
    if (dist < bestDist) {
      best = point
      bestDist = dist
    }
  }
  return best
}

/** 相对变化：|Δ| / |一月前| < 0.5% 视为持平；一月前为 0 时用绝对差。 */
export function directionOf(curr: number, prev: number): 'up' | 'down' | 'flat' {
  if (!Number.isFinite(curr) || !Number.isFinite(prev)) return 'flat'
  if (prev === 0) {
    if (Math.abs(curr) < 0.005) return 'flat'
    return curr > 0 ? 'up' : 'down'
  }
  const rel = Math.abs(curr - prev) / Math.abs(prev)
  if (rel < 0.005) return 'flat'
  return curr > prev ? 'up' : 'down'
}

function preferNewer(a: Reading | null, b: Reading | null): Reading | null {
  if (!a) return b
  if (!b) return a
  return a.date >= b.date ? a : b
}

function directionNote(priorDate: string): string {
  return `近一月方向相对 ${priorDate}`
}

function mergeNote(...parts: Array<string | undefined>): string | undefined {
  const text = parts.filter(Boolean).join('；')
  return text || undefined
}

function fromHistory(
  key: ReadingKey,
  history: readonly Point[] | undefined,
  opts: {
    unit: string
    source: string
    freq: Freq
    asOf: string
    now?: Date
    label?: string
    note?: string
    refreshFailed?: boolean
    stale?: boolean
    allowPercentile?: boolean
  },
): Reading | null {
  const points = sanitizePoints(history, opts.asOf)
  if (!points.length) return null
  const last = points.at(-1)!
  if (!Number.isFinite(last[1])) return null
  const prior = monthAgoPoint(points, last[0])
  const reading: Reading = {
    key,
    label: opts.label ?? READING_LABELS[key],
    value: last[1],
    unit: opts.unit,
    date: last[0],
    source: opts.source,
  }
  if (opts.allowPercentile !== false) {
    const pct = decadePercentile(points, last[1])
    if (pct) {
      reading.percentile = pct.percentile
      reading.percentileYears = pct.percentileYears
    }
  }
  const notes = [opts.note]
  if (prior) {
    reading.direction = directionOf(last[1], prior[1])
    notes.push(directionNote(prior[0]))
  }
  const note = mergeNote(...notes)
  if (note) reading.note = note
  if (opts.refreshFailed) reading.refreshFailed = true
  const stale = opts.stale ?? isStale(last[0], opts.freq, opts.asOf, opts.now)
  if (stale) reading.stale = true
  return reading
}

function fromUsSeries(
  key: ReadingKey,
  series: UsReading | undefined,
  asOf: string,
  now?: Date,
  extras?: { label?: string; unit?: string; note?: string; stale?: boolean },
): Reading | null {
  if (!series?.history?.length) return null
  return fromHistory(key, series.history, {
    unit: extras?.unit ?? series.unit ?? '',
    source: series.source || series.name || READING_LABELS[key],
    freq: detectFreq(series.frequency),
    asOf,
    now,
    label: extras?.label,
    note: extras?.note,
    refreshFailed: Boolean(series.refreshError),
    stale: extras?.stale,
  })
}

function fromMacro(
  key: ReadingKey,
  series: SeriesData | undefined,
  asOf: string,
  freq: Freq,
  now?: Date,
  extras?: { source?: string; note?: string },
): Reading | null {
  if (!series?.latest || !Number.isFinite(series.latest.value)) return null
  const history: Point[] = [
    ...(series.long ?? []),
    ...series.history,
    [series.latest.date, series.latest.value],
  ]
  const source = extras?.source
    ?? (series.fred && !/[−-]/.test(series.fred)
      ? `https://fred.stlouisfed.org/series/${series.fred}`
      : series.source || READING_LABELS[key])
  return fromHistory(key, history, {
    unit: series.unit || '',
    source,
    freq,
    asOf,
    now,
    note: extras?.note ?? series.note,
  })
}

function pointOnOrBefore(history: readonly Point[], target: string): Point | undefined {
  let best: Point | undefined
  for (const point of history) {
    if (point[0] > target) break
    best = point
  }
  return best
}

function isUtcWednesday(date: string): boolean {
  return new Date(`${date}T12:00:00Z`).getUTCDay() === 3
}

/**
 * 美联储总资产 − TGA − 隔夜逆回购（市场常用近似）。
 * 按周三对齐：总资产为周三余额、TGA 为截至周三的周均值、逆回购取同一周三或之前最近日。
 */
export function computeNetLiquidity(
  fedAssets: readonly Point[],
  tga: readonly Point[],
  rrp: readonly Point[],
  asOf: string,
  now?: Date,
): Reading | null {
  const assetsH = sanitizePoints(fedAssets, asOf)
  const tgaH = sanitizePoints(tga, asOf)
  const rrpH = sanitizePoints(rrp, asOf)
  if (!assetsH.length || !tgaH.length || !rrpH.length) return null
  const history: Point[] = []
  for (const [date] of assetsH) {
    if (!isUtcWednesday(date)) continue
    const assets = pointOnOrBefore(assetsH, date)
    const cash = pointOnOrBefore(tgaH, date)
    const overnight = pointOnOrBefore(rrpH, date)
    if (!assets || !cash || !overnight) continue
    if (assets[0] !== date || cash[0] !== date) continue
    const value = assets[1] - cash[1] - overnight[1]
    if (!Number.isFinite(value)) continue
    history.push([date, Math.round(value * 1000) / 1000])
  }
  if (!history.length) return null
  return fromHistory('netLiquidity', history, {
    unit: '十亿美元',
    source: '市场常用近似：美联储总资产 − TGA − 隔夜逆回购',
    freq: 'weekly',
    asOf,
    now,
    note: '周三对齐：美联储总资产为周三余额，TGA 为截至周三的周均值，逆回购取同一周三或之前最近日',
  })
}

/** 自序列末向前截取连续日线段（相邻间隔超过 5 个日历日则断开）。 */
export function continuousDailySegment(history: readonly Point[]): Point[] {
  if (!history.length) return []
  let start = 0
  for (let i = history.length - 1; i > 0; i -= 1) {
    const gap = (Date.parse(history[i][0]) - Date.parse(history[i - 1][0])) / DAY
    if (gap > 5) {
      start = i
      break
    }
    start = i - 1
  }
  return history.slice(start)
}

function spxVs200dma(history: readonly Point[], asOf: string, now?: Date): Reading | null {
  const daily = continuousDailySegment(sanitizePoints(history, asOf))
  if (daily.length < 200) return null
  const series: Point[] = []
  for (let i = 199; i < daily.length; i += 1) {
    let sum = 0
    let ok = true
    for (let j = i - 199; j <= i; j += 1) {
      const v = daily[j][1]
      if (!Number.isFinite(v)) { ok = false; break }
      sum += v
    }
    if (!ok) continue
    const sma = sum / 200
    if (!(sma > 0)) continue
    const pct = (daily[i][1] / sma - 1) * 100
    series.push([daily[i][0], Math.round(pct * 100) / 100])
  }
  if (!series.length) return null
  const allowPercentile = series.length >= 250
  return fromHistory('spxVs200dma', series, {
    unit: '%',
    source: '标普 500 日收盘相对其 200 日简单均线',
    freq: 'daily',
    asOf,
    now,
    allowPercentile,
  })
}

function retailBullBear(
  bull: UsReading | undefined,
  bear: UsReading | undefined,
  asOf: string,
  now?: Date,
): Reading | null {
  if (!bull?.history?.length || !bear?.history?.length) return null
  const bullH = sanitizePoints(bull.history, asOf)
  const bearMap = new Map(sanitizePoints(bear.history, asOf))
  const history: Point[] = []
  for (const [date, value] of bullH) {
    const b = bearMap.get(date)
    if (b === undefined || !Number.isFinite(value) || !Number.isFinite(b)) continue
    history.push([date, Math.round((value - b) * 100) / 100])
  }
  return fromHistory('retailBullBear', history, {
    unit: '个百分点',
    source: bull.source || 'AAII 散户情绪',
    freq: detectFreq(bull.frequency),
    asOf,
    now,
    refreshFailed: Boolean(bull.refreshError || bear.refreshError),
  })
}

function epsRevisionNote(series: UsReading | undefined): string | undefined {
  if (!series) return undefined
  const fromScope = series.scope?.match(/较\s*((?:\d{4}\s*年\s*)?\d{1,2}\s*月\s*\d{1,2}\s*日)/)
  if (fromScope) return `未来 12 个月 EPS 预期相对 ${fromScope[1].replace(/\s+/g, '')} 的修正`
  const fromName = series.name?.match(/较(.+?)变化/)
  if (fromName) return `未来 12 个月 EPS 预期相对 ${fromName[1].trim()} 的修正`
  return '未来 12 个月 EPS 预期相对基期的修正'
}

function capeEstimateNote(date: string, asOf: string, scope?: string): string | undefined {
  if (!scope?.includes('估算')) return undefined
  if (date.slice(0, 7) === asOf.slice(0, 7) || !/-01$/.test(date)) return '当月值为估算'
  return undefined
}

function realYieldHistory(rates: RatesFile | undefined, asOf: string): Point[] {
  if (!rates) return []
  const map = new Map<string, number>()
  for (const [d, v] of rates.real ?? []) {
    if (typeof d === 'string' && Number.isFinite(v) && d <= asOf) map.set(d, v)
  }
  if (rates.latestReal && rates.latestReal.date <= asOf && Number.isFinite(rates.latestReal.value)) {
    map.set(rates.latestReal.date, rates.latestReal.value)
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])) as Point[]
}

function buildReadings(input: {
  public?: PublicFile
  breadth?: BreadthFile
  slices?: SlicesFile
  macro?: MacroSnapshot
  rates?: RatesFile
  asOf: string
  now?: Date
}): Partial<Record<ReadingKey, Reading | null>> {
  const { public: pub, breadth, slices, macro, rates, asOf, now } = input
  const s = pub?.series ?? {}
  const m = macro?.series
  const out: Partial<Record<ReadingKey, Reading | null>> = {}

  out.fedAssets = fromUsSeries('fedAssets', s.fedAssets, asOf, now)
  out.bankReserves = fromUsSeries('bankReserves', s.bankReserves, asOf, now)
  out.netLiquidity = computeNetLiquidity(
    s.fedAssets?.history ?? [],
    s.treasuryCash?.history ?? [],
    s.overnightRrp?.history ?? [],
    asOf,
    now,
  )

  out.realRate = fromMacro('realRate', m?.realRate, asOf, 'monthly', now, {
    source: '联邦基金利率（https://fred.stlouisfed.org/series/FEDFUNDS）− 核心 PCE 同比（https://fred.stlouisfed.org/series/PCEPILFE）',
    note: '实际政策利率 = 联邦基金利率 − 核心 PCE 同比',
  })

  out.realYield10 = fromHistory('realYield10', realYieldHistory(rates, asOf), {
    unit: '%',
    source: 'https://fred.stlouisfed.org/series/DFII10',
    freq: 'daily',
    asOf,
    now,
  })

  out.tenYear = preferNewer(
    fromUsSeries('tenYear', s.tenYearDaily, asOf, now),
    fromMacro('tenYear', m?.tenYear, asOf, 'daily', now),
  )
  out.curve10y2y = fromMacro('curve10y2y', m?.curve, asOf, 'daily', now)
  out.nfci = fromMacro('nfci', m?.nfci, asOf, 'weekly', now)

  out.hySpread = preferNewer(
    fromUsSeries('hySpread', s.hyDaily, asOf, now),
    fromMacro('hySpread', m?.hy, asOf, 'daily', now),
  )
  out.baaAaa = fromUsSeries('baaAaa', s.baaAaa, asOf, now)

  const spxBreadth = breadth?.breadth?.spx
  out.spxAbove200 = (() => {
    if (!spxBreadth) return null
    const map = new Map<string, number>()
    for (const [d, v] of [...(spxBreadth.backfill ?? []), ...(spxBreadth.history ?? []), [spxBreadth.date, spxBreadth.above200] as Point]) {
      if (typeof d === 'string' && Number.isFinite(v) && d <= asOf) map.set(d, v)
    }
    const history = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])) as Point[]
    return fromHistory('spxAbove200', history, {
      unit: '%',
      source: spxBreadth.source || '标普 500 成分股宽度',
      freq: 'daily',
      asOf,
      now,
    })
  })()

  out.netNewHighs = preferNewer(
    spxBreadth?.netHighs?.length
      ? fromHistory('netNewHighs', spxBreadth.netHighs, {
        unit: '%',
        source: spxBreadth.source || '标普 500 净新高',
        freq: 'daily',
        asOf,
        now,
      })
      : null,
    spxBreadth?.highsLows
      ? fromHistory('netNewHighs', [[spxBreadth.highsLows.date, spxBreadth.highsLows.netHighsPct]], {
        unit: '%',
        source: spxBreadth.source || '标普 500 净新高',
        freq: 'daily',
        asOf,
        now,
      })
      : null,
  )

  const spxSlice = slices?.slices?.find(slice => slice.id === 'spx')?.history
  const advRows = parseAdvDec(spxBreadth?.advDec)
  if (!advRows.length) {
    out.advDecLine = null
    out.mcclellan = null
  } else {
    const metrics = buildAdvDecMetrics(spxBreadth, spxSlice, asOf, now)
    out.advDecLine = metrics?.cumulative.length
      ? fromHistory('advDecLine', metrics.cumulative, {
        unit: '',
        source: '标普 500 成分股累计涨跌线',
        freq: 'daily',
        asOf,
        now,
      })
      : null
    const oscHistory = (metrics?.mcclellanSeries ?? [])
      .filter((row): row is [string, number] => row[1] !== null && Number.isFinite(row[1]))
    out.mcclellan = oscHistory.length
      ? fromHistory('mcclellan', oscHistory, {
        unit: '',
        source: '比例调整 McClellan 振荡',
        freq: 'daily',
        asOf,
        now,
      })
      : null
  }

  out.spxVs200dma = spxSlice ? spxVs200dma(spxSlice, asOf, now) : null

  out.epsRevision = fromUsSeries('epsRevision', s.spxForwardEpsChange, asOf, now, {
    note: epsRevisionNote(s.spxForwardEpsChange),
  })
  out.forwardPe = fromUsSeries('forwardPe', s.spxFactSetFpe, asOf, now)
  out.cape = (() => {
    const primary = fromUsSeries('cape', s.shillerCape, asOf, now, {
      note: s.shillerCape?.history?.length
        ? capeEstimateNote(
          sanitizePoints(s.shillerCape.history, asOf).at(-1)?.[0] ?? '',
          asOf,
          s.shillerCape.scope,
        )
        : undefined,
    })
    const fallback = fromUsSeries('cape', s.spxCape, asOf, now)
    return preferNewer(primary, fallback)
  })()

  out.vix = preferNewer(
    fromUsSeries('vix', s.vixDaily, asOf, now),
    fromMacro('vix', m?.vix, asOf, 'daily', now),
  )
  out.fearGreed = fromUsSeries('fearGreed', s.fearGreed, asOf, now)
  out.retailBullBear = retailBullBear(s.retailBull, s.retailBear, asOf, now)
  out.naaim = fromUsSeries('naaim', s.naaim, asOf, now, {
    note: '公开数据约滞后三个月',
  })
  out.marginDebtYoy = fromUsSeries('marginDebtYoy', s.finraDebtYoy, asOf, now)
  out.managerCash = fromUsSeries('managerCash', s.managerCash, asOf, now)

  out.copperGold = fromUsSeries('copperGold', s.copperGold, asOf, now, {
    unit: '铜（美元/磅）÷ 金（美元/盎司）',
  })
  out.copper = (() => {
    const hist = sanitizePoints(s.copperDaily?.history, asOf)
    if (!hist.length) return null
    const last = hist.at(-1)!
    return fromHistory('copper', hist, {
      unit: s.copperDaily?.unit || '',
      source: s.copperDaily?.source || s.copperDaily?.name || READING_LABELS.copper,
      freq: 'daily',
      asOf,
      now,
      refreshFailed: Boolean(s.copperDaily?.refreshError),
      stale: isCopperStale(last[0], asOf, now),
    })
  })()

  return out
}

/** 读取本站已有数据文件，计算各指标最新读数。 */
export async function loadReadings(fetcher: typeof fetch = fetch): Promise<ReadingsResult> {
  const [pub, breadth, slices, macro, rates] = await Promise.all([
    loadSource<PublicFile>(FILES.public, '美股市场读数', fetcher),
    loadSource<BreadthFile>(FILES.breadth, '美股宽度', fetcher),
    loadSource<SlicesFile>(FILES.slices, '美股切片', fetcher),
    loadSource<MacroSnapshot>(FILES.macro, '美国宏观', fetcher),
    loadSource<RatesFile>(FILES.rates, '美股股债息差', fetcher),
  ])

  const failedSources = [pub, breadth, slices, macro, rates]
    .flatMap(result => (result.ok ? [] : [result.label]))

  if (failedSources.length === 5) {
    throw new Error(`${failedSources.join('、')}加载失败`)
  }

  const asOf = nyDate()
  const readings = buildReadings({
    public: pub.ok ? pub.data : undefined,
    breadth: breadth.ok ? breadth.data : undefined,
    slices: slices.ok ? slices.data : undefined,
    macro: macro.ok ? macro.data : undefined,
    rates: rates.ok ? rates.data : undefined,
    asOf,
  })
  const dates = Object.values(readings)
    .flatMap(r => (r?.date && r.date <= asOf ? [r.date] : []))
    .sort()
  return {
    readings,
    asOf: dates.at(-1) ?? asOf,
    ...(failedSources.length ? { failedSources } : {}),
  }
}

export function useReadings(): ReadingsState {
  const [state, setState] = useState<ReadingsState>({ state: 'loading' })
  useEffect(() => {
    let alive = true
    loadReadings()
      .then(result => { if (alive) setState({ state: 'ok', ...result }) })
      .catch(error => { if (alive) setState({ state: 'error', message: error instanceof Error ? error.message : '数据加载失败' }) })
    return () => { alive = false }
  }, [])
  return state
}

/** 测试与总览主题表共用的指标主题分组 */
export const READING_THEMES: { id: string; name: string; keys: ReadingKey[] }[] = [
  { id: 'liquidity', name: '流动性', keys: ['fedAssets', 'netLiquidity', 'bankReserves'] },
  { id: 'rates', name: '利率', keys: ['realRate', 'realYield10', 'tenYear', 'curve10y2y', 'nfci'] },
  { id: 'credit', name: '信用', keys: ['hySpread', 'baaAaa'] },
  { id: 'breadth', name: '宽度与趋势', keys: ['spxAbove200', 'netNewHighs', 'advDecLine', 'mcclellan', 'spxVs200dma'] },
  { id: 'valuation', name: '盈利与估值', keys: ['epsRevision', 'forwardPe', 'cape'] },
  { id: 'sentiment', name: '情绪与仓位', keys: ['vix', 'fearGreed', 'retailBullBear', 'naaim', 'marginDebtYoy', 'managerCash'] },
  { id: 'commodities', name: '商品', keys: ['copperGold', 'copper'] },
]
