// 宏观大师板块的实时读数（manager 定接口；本文件实现 loadReadings）
import { useEffect, useState } from 'react'
import { buildAdvDecMetrics, parseAdvDec } from '../us-market/advDec'
import { percentileOf, withinYears } from '../us-market/explain'
import type { Breadth, Point, Reading as UsReading } from '../us-market/model'
import { nyDate } from '../us-market/model'
import { nyseSessionsOnOrBefore } from '../us-market/tradingCalendar'
import type { MacroSnapshot, SeriesData } from '../macro/indicators'
import type { Reading, ReadingKey } from './types'

export type ReadingsState =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ok'; readings: Partial<Record<ReadingKey, Reading | null>>; asOf: string }

export const READING_LABELS: Record<ReadingKey, string> = {
  fedAssets: '美联储总资产',
  netLiquidity: '净流动性（近似）',
  bankReserves: '银行准备金',
  realRate: '实际政策利率',
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
const FILES = {
  public: 'us-market-data.json',
  breadth: 'us-market-breadth.json',
  slices: 'us-market-slices.json',
  indexes: 'index-history.json',
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

async function readJson(url: string, label: string, fetcher: Fetcher): Promise<unknown> {
  const response = await fetcher(url, { cache: 'no-cache' })
  if (!response.ok) throw new Error(`${label}加载失败（HTTP ${response.status}）`)
  return response.json()
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
    // 落后最近应有交易日 3 个以上 → dataDate < sessions.at(-4) 的“第 4 个最新”
    return date < sessions.at(-4)!
  }
  if (freq === 'weekly') return calendarAge(date, asOf) > 10
  return calendarAge(date, asOf) > 45
}

function decadePercentile(history: readonly Point[], value: number): number | undefined {
  const window = withinYears([...history], 10)
  if (window.length < 24) return undefined
  const span = (Date.parse(window.at(-1)![0]) - Date.parse(window[0][0])) / (365.25 * DAY)
  if (span < 5) return undefined
  return percentileOf(window.map(([, v]) => v), value)
}

function monthAgoPoint(history: readonly Point[], asOfDate: string): Point | undefined {
  const target = Date.parse(asOfDate) - 28 * DAY
  let best: Point | undefined
  let bestDist = Infinity
  for (const point of history) {
    const t = Date.parse(point[0])
    if (!Number.isFinite(t) || t >= Date.parse(asOfDate)) continue
    const age = (Date.parse(asOfDate) - t) / DAY
    if (age < 18 || age > 40) continue
    const dist = Math.abs(t - target)
    if (dist < bestDist) {
      best = point
      bestDist = dist
    }
  }
  return best
}

function directionOf(curr: number, prev: number): 'up' | 'down' | 'flat' {
  const scale = Math.max(Math.abs(curr), Math.abs(prev), 1)
  const delta = curr - prev
  if (Math.abs(delta) / scale < 0.005) return 'flat'
  return delta > 0 ? 'up' : 'down'
}

function fromHistory(
  key: ReadingKey,
  history: readonly Point[] | undefined,
  opts: { unit: string; source: string; freq: Freq; asOf: string; now?: Date; label?: string },
): Reading | null {
  if (!history?.length) return null
  const last = history.at(-1)!
  if (!Number.isFinite(last[1])) return null
  const prior = monthAgoPoint(history, last[0])
  const reading: Reading = {
    key,
    label: opts.label ?? READING_LABELS[key],
    value: last[1],
    unit: opts.unit,
    date: last[0],
    source: opts.source,
  }
  const pct = decadePercentile(history, last[1])
  if (pct !== undefined) reading.percentile = pct
  if (prior) reading.direction = directionOf(last[1], prior[1])
  if (isStale(last[0], opts.freq, opts.asOf, opts.now)) reading.stale = true
  return reading
}

function fromUsSeries(
  key: ReadingKey,
  series: UsReading | undefined,
  asOf: string,
  now?: Date,
  label?: string,
): Reading | null {
  if (!series?.history?.length) return null
  return fromHistory(key, series.history, {
    unit: series.unit || '',
    source: series.source || series.name || READING_LABELS[key],
    freq: detectFreq(series.frequency),
    asOf,
    now,
    label,
  })
}

function fromMacro(
  key: ReadingKey,
  series: SeriesData | undefined,
  asOf: string,
  freq: Freq,
  now?: Date,
): Reading | null {
  if (!series?.latest || !Number.isFinite(series.latest.value)) return null
  const history: Point[] = [
    ...(series.long ?? []),
    ...series.history,
    [series.latest.date, series.latest.value],
  ]
  const map = new Map<string, number>()
  for (const [d, v] of history) {
    if (typeof d === 'string' && Number.isFinite(v)) map.set(d, v)
  }
  const points = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])) as Point[]
  return fromHistory(key, points, {
    unit: series.unit || '',
    source: series.fred ? `https://fred.stlouisfed.org/series/${series.fred}` : series.source || READING_LABELS[key],
    freq,
    asOf,
    now,
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

/** 美联储总资产 − TGA − 隔夜逆回购；周频余额按观测日对齐，逆回购取同日或之前最近日频值。 */
export function computeNetLiquidity(
  fedAssets: readonly Point[],
  tga: readonly Point[],
  rrp: readonly Point[],
  asOf: string,
  now?: Date,
): Reading | null {
  if (!fedAssets.length || !tga.length || !rrp.length) return null
  const history: Point[] = []
  for (const [date] of fedAssets) {
    const assets = pointOnOrBefore(fedAssets, date)
    const cash = pointOnOrBefore(tga, date)
    const overnight = pointOnOrBefore(rrp, date)
    if (!assets || !cash || !overnight) continue
    if (assets[0] !== date || cash[0] !== date) continue
    // 逆回购允许取同日或之前最近值，但不得早于一周（周频与日频混合对齐）
    if ((Date.parse(date) - Date.parse(overnight[0])) / DAY > 7) continue
    const value = assets[1] - cash[1] - overnight[1]
    if (!Number.isFinite(value)) continue
    history.push([date, Math.round(value * 1000) / 1000])
  }
  if (!history.length) return null
  return fromHistory('netLiquidity', history, {
    unit: '十亿美元',
    source: '市场常用近似：美联储总资产 − TGA − 隔夜逆回购；周频余额按观测日对齐，逆回购取同日或之前最近日频值',
    freq: 'weekly',
    asOf,
    now,
  })
}

function spxVs200dma(history: readonly Point[], asOf: string, now?: Date): Reading | null {
  if (history.length < 200) return null
  const series: Point[] = []
  for (let i = 199; i < history.length; i += 1) {
    let sum = 0
    for (let j = i - 199; j <= i; j += 1) sum += history[j][1]
    const sma = sum / 200
    if (!(sma > 0)) continue
    const pct = (history[i][1] / sma - 1) * 100
    series.push([history[i][0], Math.round(pct * 100) / 100])
  }
  return fromHistory('spxVs200dma', series, {
    unit: '%',
    source: '标普 500 日线相对其 200 日简单均线',
    freq: 'daily',
    asOf,
    now,
  })
}

function retailBullBear(
  bull: UsReading | undefined,
  bear: UsReading | undefined,
  asOf: string,
  now?: Date,
): Reading | null {
  if (!bull?.history?.length || !bear?.history?.length) return null
  const bearMap = new Map(bear.history)
  const history: Point[] = []
  for (const [date, value] of bull.history) {
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
  })
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

  out.realRate = fromMacro('realRate', m?.realRate, asOf, 'monthly', now)
    ?? (() => {
      if (!rates?.latestReal) return null
      const tips = new Map<string, number>(rates.real ?? [])
      tips.set(rates.latestReal.date, rates.latestReal.value)
      const history = [...tips.entries()].sort((a, b) => a[0].localeCompare(b[0])) as Point[]
      return fromHistory('realRate', history, {
        unit: '%',
        source: 'https://fred.stlouisfed.org/series/DFII10',
        freq: 'daily',
        asOf,
        now,
        label: '10 年期 TIPS 实际收益率',
      })
    })()

  out.tenYear = fromUsSeries('tenYear', s.tenYearDaily, asOf, now)
    ?? fromMacro('tenYear', m?.tenYear, asOf, 'daily', now)
  out.curve10y2y = fromMacro('curve10y2y', m?.curve, asOf, 'daily', now)
  out.nfci = fromMacro('nfci', m?.nfci, asOf, 'weekly', now)

  out.hySpread = fromUsSeries('hySpread', s.hyDaily, asOf, now)
    ?? fromMacro('hySpread', m?.hy, asOf, 'daily', now)
  out.baaAaa = fromUsSeries('baaAaa', s.baaAaa, asOf, now)

  const spxBreadth = breadth?.breadth?.spx
  out.spxAbove200 = (() => {
    if (!spxBreadth) return null
    const map = new Map<string, number>()
    for (const [d, v] of [...(spxBreadth.backfill ?? []), ...(spxBreadth.history ?? []), [spxBreadth.date, spxBreadth.above200] as Point]) {
      if (typeof d === 'string' && Number.isFinite(v)) map.set(d, v)
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

  out.netNewHighs = spxBreadth?.netHighs?.length
    ? fromHistory('netNewHighs', spxBreadth.netHighs, {
      unit: '%',
      source: spxBreadth.source || '标普 500 净新高',
      freq: 'daily',
      asOf,
      now,
    })
    : (spxBreadth?.highsLows
      ? fromHistory('netNewHighs', [[spxBreadth.highsLows.date, spxBreadth.highsLows.netHighsPct]], {
        unit: '%',
        source: spxBreadth.source || '标普 500 净新高',
        freq: 'daily',
        asOf,
        now,
      })
      : null)

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

  out.epsRevision = fromUsSeries('epsRevision', s.spxForwardEpsChange, asOf, now)
  out.forwardPe = fromUsSeries('forwardPe', s.spxFactSetFpe, asOf, now)
  out.cape = fromUsSeries('cape', s.shillerCape, asOf, now)
    ?? fromUsSeries('cape', s.spxCape, asOf, now)

  out.vix = fromUsSeries('vix', s.vixDaily, asOf, now)
    ?? fromMacro('vix', m?.vix, asOf, 'daily', now)
  out.fearGreed = fromUsSeries('fearGreed', s.fearGreed, asOf, now)
  out.retailBullBear = retailBullBear(s.retailBull, s.retailBear, asOf, now)
  out.naaim = fromUsSeries('naaim', s.naaim, asOf, now)
  out.marginDebtYoy = fromUsSeries('marginDebtYoy', s.finraDebtYoy, asOf, now)
  out.managerCash = fromUsSeries('managerCash', s.managerCash, asOf, now)

  out.copperGold = fromUsSeries('copperGold', s.copperGold, asOf, now)
  out.copper = fromUsSeries('copper', s.copperDaily, asOf, now)

  return out
}

/** 读取本站已有数据文件，计算各指标最新读数。 */
export async function loadReadings(fetcher: typeof fetch = fetch): Promise<{ readings: Partial<Record<ReadingKey, Reading | null>>; asOf: string }> {
  const load = async <T,>(file: string, label: string): Promise<T> =>
    readJson(`${ROOT}/${file}`, label, fetcher) as Promise<T>

  const [pub, breadth, slices, indexes, macro, rates] = await Promise.all([
    load<PublicFile>(FILES.public, '美股市场读数'),
    load<BreadthFile>(FILES.breadth, '美股宽度'),
    load<SlicesFile>(FILES.slices, '美股切片'),
    load<{ generatedAt?: string }>(FILES.indexes, '指数历史'),
    load<MacroSnapshot>(FILES.macro, '美国宏观'),
    load<RatesFile>(FILES.rates, '美股股债息差'),
  ])

  void indexes // 日线优先用 slices；indexes 保留加载以便日后扩展，并保证文件可读
  const asOf = nyDate()
  const readings = buildReadings({ public: pub, breadth, slices, macro, rates, asOf })
  const dates = Object.values(readings)
    .flatMap(r => (r?.date ? [r.date] : []))
    .sort()
  return { readings, asOf: dates.at(-1) ?? asOf }
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
  { id: 'rates', name: '利率', keys: ['realRate', 'tenYear', 'curve10y2y', 'nfci'] },
  { id: 'credit', name: '信用', keys: ['hySpread', 'baaAaa'] },
  { id: 'breadth', name: '宽度与趋势', keys: ['spxAbove200', 'netNewHighs', 'advDecLine', 'mcclellan', 'spxVs200dma'] },
  { id: 'valuation', name: '盈利与估值', keys: ['epsRevision', 'forwardPe', 'cape'] },
  { id: 'sentiment', name: '情绪与仓位', keys: ['vix', 'fearGreed', 'retailBullBear', 'naaim', 'marginDebtYoy', 'managerCash'] },
  { id: 'commodities', name: '商品', keys: ['copperGold', 'copper'] },
]
