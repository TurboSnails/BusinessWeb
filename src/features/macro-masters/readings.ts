// 宏观大师板块的实时读数（manager 定接口；本文件实现 loadReadings）
import { useEffect, useState } from 'react'
import { buildAdvDecMetrics, parseAdvDec } from '../us-market/advDec'
import { weekStart } from '../us-market/chartSeries'
import { isCopperStale } from '../us-market/copper'
import { percentileOf, spanYears, withinYears } from '../us-market/explain'
import type { Breadth, Point, Reading as UsReading } from '../us-market/model'
import { nyDate } from '../us-market/model'
import { isNyseSession, nyseSessionsOnOrBefore } from '../us-market/tradingCalendar'
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
  policyRate: '准备金余额利率',
  spxDrawdown: '标普 500 距近 52 周高点回撤',
  equalWeightRel: '等权相对市值加权（近 3 个月）',
  cyclicalDefensive: '可选消费相对必需消费（近 3 个月）',
  smallCapRel: '小盘相对标普 500（近 3 个月）',
  growthValueRel: '成长相对价值（近 3 个月）',
  unrate: '失业率',
  sahm: '萨姆规则实时值',
  debtService: '家庭偿债比',
  buffett: '非金融企业股票市值 ÷ GDP',
  putCall: '期权 Put ÷ Call',
  tga: '财政部一般账户（TGA）',
  mmfAssets: '货币基金总资产',
  cftcLevSpx: '杠杆基金标普期货净仓',
  hfGrossExposure: '对冲基金股票总名义敞口',
  volumeRatio: '美股全市场 20 日量比',
  corePce: '核心 PCE 同比',
  claims: '初请失业金（4 周均值）',
  fedFunds: '联邦基金有效利率',
  nominalGdpYoy: '名义 GDP 同比',
  dotMedian: '点阵图：明年末利率中位数',
  privateCreditGdp: '私人非金融部门信贷 ÷ GDP',
  govDebtGdp: '联邦政府债务 ÷ GDP',
  hyYield: '高收益债有效收益率',
  cccSpread: 'CCC 及以下高收益债利差',
  m2Yoy: 'M2 同比',
  inflationExp: '10 年盈亏平衡通胀率',
  primeRate: '优惠利率',
  discountRate: '贴现窗口一级信贷利率',
  consumerCreditYoy: '非循环消费信贷同比',
  profitGdp: '企业税后利润 ÷ GDP',
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
  fred: 'macro-masters-fred.json',
} as const

type Freq = 'daily' | 'weekly' | 'monthly' | 'quarterly'
type Fetcher = typeof fetch
const MONTH_MS = (365.25 / 12) * DAY
const QUARTER_MS = (365.25 / 4) * DAY

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

type FredSeries = {
  fred?: string
  name?: string
  unit?: string
  frequency?: string
  note?: string
  updated?: string
  history?: unknown
  refreshError?: string
}

type FredFile = {
  generatedAt?: string
  source?: string
  series?: Record<string, FredSeries>
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
  if (/季|quarter/i.test(raw)) return 'quarterly'
  if (/月|month/i.test(raw)) return 'monthly'
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
  if (freq === 'weekly') return calendarAge(date, asOf) > 14
  if (freq === 'monthly') return calendarAge(date, asOf) > 95
  return calendarAge(date, asOf) > 270
}

/** YYYY-MM-DD 且日历合法（拒 `2026-10-xx`、`2026-02-30`）。 */
export function isValidIsoDate(date: string): boolean {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const ms = Date.parse(`${date}T12:00:00Z`)
  if (!Number.isFinite(ms)) return false
  return new Date(ms).toISOString().slice(0, 10) === date
}

function shiftIsoDate(iso: string, deltaDays: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 从未知数组逐条清洗 Point；null / 非二元组 / 无效值丢弃。 */
function filterPointEntries(history: readonly unknown[]): Point[] {
  const points: Point[] = []
  for (const item of history) {
    if (!Array.isArray(item) || item.length < 2) continue
    const date = item[0]
    const value = item[1]
    if (typeof date !== 'string' || !Number.isFinite(value as number)) continue
    points.push([date, value as number])
  }
  return points
}

/** 观测数组：null / 非数组视为结构异常；数组内脏条目逐条丢弃，不交给解构循环。 */
function asPointList(history: unknown): { points: Point[]; malformed: boolean } {
  if (history === undefined) return { points: [], malformed: false }
  if (history === null || !Array.isArray(history)) return { points: [], malformed: true }
  return { points: filterPointEntries(history), malformed: false }
}

/** 过滤无效日期、未来日、去重、剔除非有限值并按日期升序。 */
export function sanitizePoints(history: readonly Point[] | undefined | null, asOf: string): Point[] {
  if (!history?.length) return []
  const map = new Map<string, number>()
  for (const point of history) {
    const date = point?.[0]
    const value = point?.[1]
    if (typeof date !== 'string' || !isValidIsoDate(date) || date > asOf) continue
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

/** 按原生频率取分位用的观测：日频周采样，其余用原始点。 */
function nativeSample(history: readonly Point[], freq: Freq): Point[] {
  return freq === 'daily' ? weeklyLastObservations(history) : [...history]
}

function decadePercentile(
  history: readonly Point[],
  value: number,
  freq: Freq,
): { percentile: number; percentileYears: number } | undefined {
  const sampled = nativeSample(history, freq)
  const window = withinYears(sampled, 10)
  const years = spanYears(window)
  if (years < 5) return undefined
  const spanMs = Date.parse(window.at(-1)![0]) - Date.parse(window[0][0])
  if (!(spanMs > 0)) return undefined

  if (freq === 'monthly') {
    if (window.length < 60) return undefined
    const spannedMonths = spanMs / MONTH_MS
    if (!(spannedMonths > 0) || window.length / spannedMonths < 0.6) return undefined
  } else if (freq === 'quarterly') {
    if (window.length < 20) return undefined
    const spannedQuarters = spanMs / QUARTER_MS
    if (!(spannedQuarters > 0) || window.length / spannedQuarters < 0.6) return undefined
  } else {
    // 日频（周采样后）与周频：至少 52 点，覆盖所跨周数的 60%
    if (window.length < 52) return undefined
    const spannedWeeks = spanMs / (7 * DAY)
    if (!(spannedWeeks > 0) || window.length / spannedWeeks < 0.6) return undefined
  }

  return {
    percentile: percentileOf(window.map(([, v]) => v), value),
    percentileYears: Math.round(Math.min(years, 10) * 10) / 10,
  }
}

/** 全样本分位；跨度不足 30 年不给。 */
function longHistoryPercentile(
  history: readonly Point[],
  value: number,
  freq: Freq,
): { longPercentile: number; longPercentileSince: number } | undefined {
  const sampled = nativeSample(history, freq)
  if (sampled.length < 2) return undefined
  const years = spanYears(sampled)
  if (years < 30) return undefined
  const since = Number.parseInt(sampled[0][0].slice(0, 4), 10)
  if (!Number.isFinite(since)) return undefined
  return {
    longPercentile: percentileOf(sampled.map(([, v]) => v), value),
    longPercentileSince: since,
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

/** 季频：取上一观测定方向，距当前观测不超过 130 天。 */
function priorQuarterPoint(history: readonly Point[], asOfDate: string): Point | undefined {
  if (history.length < 2) return undefined
  const last = history.at(-1)!
  if (last[0] !== asOfDate) return undefined
  const prev = history.at(-2)!
  if (!Number.isFinite(prev[1])) return undefined
  const age = (Date.parse(asOfDate) - Date.parse(prev[0])) / DAY
  if (!(age > 0) || age > 130) return undefined
  return prev
}

function priorForDirection(history: readonly Point[], asOfDate: string, freq: Freq): Point | undefined {
  return freq === 'quarterly'
    ? priorQuarterPoint(history, asOfDate)
    : monthAgoPoint(history, asOfDate)
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

function directionNote(priorDate: string, freq: Freq): string {
  return freq === 'quarterly' ? `相对上一观测 ${priorDate}` : `近一月方向相对 ${priorDate}`
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
  const prior = priorForDirection(points, last[0], opts.freq)
  const reading: Reading = {
    key,
    label: opts.label ?? READING_LABELS[key],
    value: last[1],
    unit: opts.unit,
    date: last[0],
    frequency: opts.freq,
    source: opts.source,
  }
  if (opts.allowPercentile !== false) {
    const pct = decadePercentile(points, last[1], opts.freq)
    if (pct) {
      reading.percentile = pct.percentile
      reading.percentileYears = pct.percentileYears
    }
    const long = longHistoryPercentile(points, last[1], opts.freq)
    if (long) {
      reading.longPercentile = long.longPercentile
      reading.longPercentileSince = long.longPercentileSince
    }
  }
  const notes = [opts.note]
  if (prior) {
    reading.direction = directionOf(last[1], prior[1])
    reading.prior = { date: prior[0], value: prior[1] }
    notes.push(directionNote(prior[0], opts.freq))
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
  extras?: { label?: string; unit?: string; source?: string; note?: string; stale?: boolean },
): Reading | null {
  const { points, malformed } = asPointList(series?.history)
  if (malformed || !points.length) return null
  return fromHistory(key, points, {
    unit: extras?.unit ?? series?.unit ?? '',
    source: extras?.source ?? (series?.source || series?.name || READING_LABELS[key]),
    freq: detectFreq(series?.frequency),
    asOf,
    now,
    label: extras?.label,
    note: extras?.note,
    refreshFailed: Boolean(series?.refreshError),
    stale: extras?.stale,
  })
}

function fromMacro(
  key: ReadingKey,
  series: SeriesData | undefined,
  asOf: string,
  freq: Freq,
  now?: Date,
  extras?: { source?: string; note?: string; unit?: string },
): Reading | null {
  if (!series?.latest || !Number.isFinite(series.latest.value)) return null
  if (!isValidIsoDate(series.latest.date)) return null
  const hist = asPointList(series.history)
  const long = asPointList(series.long)
  if (hist.malformed || long.malformed) return null
  const history: Point[] = [
    ...long.points,
    ...hist.points,
    [series.latest.date, series.latest.value],
  ]
  const source = extras?.source
    ?? (series.fred && !/[−-]/.test(series.fred)
      ? `https://fred.stlouisfed.org/series/${series.fred}`
      : series.source || READING_LABELS[key])
  return fromHistory(key, history, {
    unit: extras?.unit ?? (series.unit || ''),
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

const RRP_LOOKBACK_DAYS = 7

function mmDd(iso: string): string {
  return iso.slice(5)
}

/**
 * 美联储总资产 − TGA − 隔夜逆回购（市场常用近似）。
 * 按周三对齐：总资产为周三余额、TGA 为截至周三的周均值、
 * 逆回购取同一周三或之前最近日，且不得超过 7 天；超出则该周不算。
 */
export function computeNetLiquidity(
  fedAssets: readonly Point[],
  tga: readonly Point[],
  rrp: readonly Point[],
  asOf: string,
  now?: Date,
  flags?: { refreshFailed?: boolean; stale?: boolean },
): Reading | null {
  const assetsH = sanitizePoints(fedAssets, asOf)
  const tgaH = sanitizePoints(tga, asOf)
  const rrpH = sanitizePoints(rrp, asOf)
  if (!assetsH.length || !tgaH.length || !rrpH.length) return null
  const history: Point[] = []
  let lastRrpDate: string | undefined
  for (const [date] of assetsH) {
    if (!isUtcWednesday(date)) continue
    const assets = pointOnOrBefore(assetsH, date)
    const cash = pointOnOrBefore(tgaH, date)
    const overnight = pointOnOrBefore(rrpH, date)
    if (!assets || !cash || !overnight) continue
    if (assets[0] !== date || cash[0] !== date) continue
    const rrpAge = (Date.parse(date) - Date.parse(overnight[0])) / DAY
    if (!(rrpAge >= 0) || rrpAge > RRP_LOOKBACK_DAYS) continue
    const value = assets[1] - cash[1] - overnight[1]
    if (!Number.isFinite(value)) continue
    history.push([date, Math.round(value * 1000) / 1000])
    lastRrpDate = overnight[0]
  }
  if (!history.length || !lastRrpDate) return null
  return fromHistory('netLiquidity', history, {
    unit: '十亿美元',
    source: '市场常用近似：美联储总资产 − TGA − 隔夜逆回购',
    freq: 'weekly',
    asOf,
    now,
    note: `周三对齐：美联储总资产为周三余额，TGA 为截至周三的周均值，逆回购取同一周三或之前最近日（逆回购取 ${mmDd(lastRrpDate)}）`,
    refreshFailed: flags?.refreshFailed,
    stale: flags?.stale,
  })
}

/** 相邻两点之间若漏掉任一 NYSE 交易日，则视为日线段断开。 */
function hasMissingNyseSession(prev: string, curr: string): boolean {
  let cursor = shiftIsoDate(prev, 1)
  while (cursor < curr) {
    if (isNyseSession(cursor)) return true
    cursor = shiftIsoDate(cursor, 1)
  }
  return false
}

/** 自序列末向前截取连续日线段（漏一个 NYSE 交易日即断开）。 */
export function continuousDailySegment(history: readonly Point[]): Point[] {
  if (!history.length) return []
  let start = 0
  for (let i = history.length - 1; i > 0; i -= 1) {
    if (hasMissingNyseSession(history[i - 1][0], history[i][0])) {
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

const POLICY_HOLD = 3
const POLICY_PENDING_NOTE = '最近一次变动要连续三天保持才计入'

/** 政策利率：新水平连续 ≥3 个观测才算调息；短偏离当噪声；末尾未确认不计入。 */
export function policyRateMoves(history: readonly Point[]): {
  lastMove?: { date: string; from: number; to: number }
  moveRun?: { direction: 'up' | 'down'; count: number; total: number; startLevel: number; since: string }
  pendingUnconfirmed?: boolean
} {
  const runs: Array<{ value: number; startDate: string; count: number }> = []
  for (const [date, value] of history) {
    if (!Number.isFinite(value)) continue
    const last = runs.at(-1)
    if (last && last.value === value) last.count += 1
    else runs.push({ value, startDate: date, count: 1 })
  }
  if (!runs.length) return {}

  const confirmed: Array<{ value: number; since: string }> = []
  let pendingUnconfirmed = false
  for (let i = 0; i < runs.length; i += 1) {
    const run = runs[i]
    if (run.count >= POLICY_HOLD) {
      const prev = confirmed.at(-1)
      if (!prev || prev.value !== run.value) confirmed.push({ value: run.value, since: run.startDate })
      continue
    }
    // 短平台：末尾且相对已确认水平是新值 → 待确认；中间短偏离当作噪声跳过
    if (i === runs.length - 1) {
      const prev = confirmed.at(-1)
      if (prev && prev.value !== run.value) pendingUnconfirmed = true
    }
  }

  if (confirmed.length < 2) {
    return pendingUnconfirmed ? { pendingUnconfirmed } : {}
  }

  const changes: Array<{ date: string; from: number; to: number; delta: number }> = []
  for (let i = 1; i < confirmed.length; i += 1) {
    const from = confirmed[i - 1].value
    const to = confirmed[i].value
    changes.push({
      date: confirmed[i].since,
      from,
      to,
      delta: to - from,
    })
  }
  const last = changes.at(-1)!
  const direction: 'up' | 'down' = last.delta > 0 ? 'up' : 'down'
  let count = 0
  let total = 0
  let startLevel = last.from
  let since = last.date
  for (let i = changes.length - 1; i >= 0; i -= 1) {
    const change = changes[i]
    const dir: 'up' | 'down' | null = change.delta > 0 ? 'up' : change.delta < 0 ? 'down' : null
    if (dir !== direction) break
    count += 1
    total += change.delta
    startLevel = change.from
    since = change.date
  }
  return {
    lastMove: { date: last.date, from: last.from, to: last.to },
    moveRun: {
      direction,
      count,
      total: Math.round(total * 1e6) / 1e6,
      startLevel,
      since,
    },
    ...(pendingUnconfirmed ? { pendingUnconfirmed } : {}),
  }
}

function policyRateReading(
  series: UsReading | undefined,
  asOf: string,
  now?: Date,
): Reading | null {
  const { points, malformed } = asPointList(series?.history)
  if (malformed || !points.length) return null
  const clean = sanitizePoints(points, asOf)
  const moves = policyRateMoves(clean)
  const baseNote = '准备金余额利率通常比联邦基金目标区间上限低 0.1 个百分点'
  const reading = fromHistory('policyRate', clean, {
    unit: series?.unit || '%',
    source: series?.source || series?.name || READING_LABELS.policyRate,
    freq: 'daily',
    asOf,
    now,
    note: moves.pendingUnconfirmed ? mergeNote(baseNote, POLICY_PENDING_NOTE) : baseNote,
    refreshFailed: Boolean(series?.refreshError),
    allowPercentile: false,
  })
  if (!reading) return null
  if (moves.lastMove) reading.lastMove = moves.lastMove
  if (moves.moveRun) reading.moveRun = moves.moveRun
  return reading
}

/** 标普 500 距近 252 个交易日最高收盘的回撤（%）。 */
function spxDrawdownReading(history: readonly Point[] | undefined, asOf: string, now?: Date): Reading | null {
  if (!history?.length) return null
  const daily = continuousDailySegment(sanitizePoints(history, asOf))
  if (daily.length < 252) return null
  const series: Point[] = []
  let lastHigh = daily[251][1]
  let lastHighDate = daily[251][0]
  for (let i = 251; i < daily.length; i += 1) {
    let peak = -Infinity
    let peakDate = daily[i - 251][0]
    for (let j = i - 251; j <= i; j += 1) {
      if (daily[j][1] >= peak) {
        peak = daily[j][1]
        peakDate = daily[j][0]
      }
    }
    if (!(peak > 0)) continue
    const dd = (daily[i][1] / peak - 1) * 100
    series.push([daily[i][0], Math.round(dd * 100) / 100])
    lastHigh = peak
    lastHighDate = peakDate
  }
  if (!series.length) return null
  return fromHistory('spxDrawdown', series, {
    unit: '%',
    source: '标普 500 日收盘距近 52 周最高收盘',
    freq: 'daily',
    asOf,
    now,
    allowPercentile: false,
    note: `近 52 周最高收盘 ${Math.round(lastHigh * 100) / 100}（${lastHighDate}）`,
  })
}

const REL_LOOKBACK = 63

function relativePerformanceReading(
  key: ReadingKey,
  aHistory: readonly Point[] | undefined,
  bHistory: readonly Point[] | undefined,
  asOf: string,
  note: string,
  now?: Date,
): Reading | null {
  if (!aHistory?.length || !bHistory?.length) return null
  const aSeg = continuousDailySegment(sanitizePoints(aHistory, asOf))
  const bSeg = continuousDailySegment(sanitizePoints(bHistory, asOf))
  if (!aSeg.length || !bSeg.length) return null
  const bMap = new Map(bSeg)
  const aligned: Array<{ date: string; a: number; b: number }> = []
  for (const [date, a] of aSeg) {
    const b = bMap.get(date)
    if (b === undefined || !Number.isFinite(a) || !Number.isFinite(b)) continue
    if (!(a > 0) || !(b > 0)) continue
    aligned.push({ date, a, b })
  }
  if (aligned.length < REL_LOOKBACK + 1) return null
  const series: Point[] = []
  for (let i = REL_LOOKBACK; i < aligned.length; i += 1) {
    const cur = aligned[i]
    const prev = aligned[i - REL_LOOKBACK]
    const rel = (cur.a / prev.a) / (cur.b / prev.b) - 1
    series.push([cur.date, Math.round(rel * 10_000) / 100])
  }
  if (!series.length) return null
  return fromHistory(key, series, {
    unit: '%',
    source: '美股切片日收盘相对表现',
    freq: 'daily',
    asOf,
    now,
    allowPercentile: false,
    note,
  })
}

function slicePoints(
  slices: SlicesFile | undefined,
  id: string,
): { points: Point[]; malformed: boolean } {
  const entry = slices?.slices?.find(slice => slice?.id === id)
  if (!entry) return { points: [], malformed: false }
  return asPointList(entry.history)
}

function retailBullBear(
  bull: UsReading | undefined,
  bear: UsReading | undefined,
  asOf: string,
  now?: Date,
): Reading | null {
  const bullList = asPointList(bull?.history)
  const bearList = asPointList(bear?.history)
  if (bullList.malformed || bearList.malformed || !bullList.points.length || !bearList.points.length) return null
  const bullH = sanitizePoints(bullList.points, asOf)
  const bearMap = new Map(sanitizePoints(bearList.points, asOf))
  const history: Point[] = []
  for (const [date, value] of bullH) {
    const b = bearMap.get(date)
    if (b === undefined || !Number.isFinite(value) || !Number.isFinite(b)) continue
    history.push([date, Math.round((value - b) * 100) / 100])
  }
  return fromHistory('retailBullBear', history, {
    unit: '个百分点',
    source: bull?.source || 'AAII 散户情绪',
    freq: detectFreq(bull?.frequency),
    asOf,
    now,
    refreshFailed: Boolean(bull?.refreshError || bear?.refreshError),
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
  if (rates.real != null && !Array.isArray(rates.real)) return []
  const map = new Map<string, number>()
  for (const [d, v] of filterPointEntries(rates.real ?? [])) {
    if (isValidIsoDate(d) && d <= asOf) map.set(d, v)
  }
  if (
    rates.latestReal
    && isValidIsoDate(rates.latestReal.date)
    && rates.latestReal.date <= asOf
    && Number.isFinite(rates.latestReal.value)
  ) {
    map.set(rates.latestReal.date, rates.latestReal.value)
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])) as Point[]
}

const SOURCE_PUBLIC = '美股市场读数'
const SOURCE_BREADTH = '美股宽度'
const SOURCE_SLICES = '美股切片'
const SOURCE_MACRO = '美国宏观'
const SOURCE_RATES = '美股股债息差'
const SOURCE_FRED = 'FRED 补充序列'
const ALL_SOURCE_LABELS = [
  SOURCE_PUBLIC, SOURCE_BREADTH, SOURCE_SLICES, SOURCE_MACRO, SOURCE_RATES, SOURCE_FRED,
] as const

function fredSourceUrl(fred: string | undefined, fallback: string): string {
  if (!fred || /[−\-/÷]/.test(fred) || /\s/.test(fred)) return fallback
  return `https://fred.stlouisfed.org/series/${fred}`
}

function detectFredFreq(raw?: string): Freq {
  if (!raw) return 'daily'
  if (/quarter/i.test(raw)) return 'quarterly'
  if (/month/i.test(raw)) return 'monthly'
  if (/week/i.test(raw)) return 'weekly'
  if (/day/i.test(raw)) return 'daily'
  return detectFreq(raw)
}

function fromFredSeries(
  key: ReadingKey,
  series: FredSeries | undefined,
  asOf: string,
  freq: Freq,
  now?: Date,
  extras?: { note?: string; unit?: string; allowPercentile?: boolean },
): Reading | null {
  if (!series) return null
  const { points, malformed } = asPointList(series.history)
  if (malformed || !points.length) return null
  return fromHistory(key, points, {
    unit: extras?.unit ?? series.unit ?? '',
    source: fredSourceUrl(series.fred, series.name || READING_LABELS[key]),
    freq,
    asOf,
    now,
    note: extras?.note ?? series.note,
    refreshFailed: Boolean(series.refreshError),
    allowPercentile: extras?.allowPercentile,
  })
}

/** 点阵图：history 日期是预测目标年，不是观测日；取下一日历年的中位数。 */
export function dotMedianReading(
  series: FredSeries | undefined,
  asOf: string,
  now?: Date,
): Reading | null {
  if (!series?.updated || !isValidIsoDate(series.updated)) return null
  const { points, malformed } = asPointList(series.history)
  if (malformed || !points.length) return null
  const map = new Map<string, number>()
  for (const [date, value] of points) {
    if (typeof date !== 'string' || !isValidIsoDate(date) || !Number.isFinite(value)) continue
    map.set(date, value)
  }
  const path = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])) as Point[]
  if (!path.length) return null
  const targetYear = Number.parseInt(series.updated.slice(0, 4), 10) + 1
  if (!Number.isFinite(targetYear)) return null
  const chosen = path.find(([date]) => Number.parseInt(date.slice(0, 4), 10) >= targetYear) ?? null
  if (!chosen || !Number.isFinite(chosen[1])) return null
  const pathNote = path
    .map(([date, value]) => `${date.slice(0, 4)} 年末 ${value}%`)
    .join('、')
  const release = series.updated
  const releaseLabel = `${Number(release.slice(5, 7))} 月 ${Number(release.slice(8, 10))} 日`
  const reading: Reading = {
    key: 'dotMedian',
    label: READING_LABELS.dotMedian,
    value: chosen[1],
    unit: series.unit || '%',
    date: series.updated,
    frequency: 'quarterly',
    source: fredSourceUrl(series.fred, series.name || READING_LABELS.dotMedian),
    // 数据文件里的 series.note 是给开发者看的口径说明（日期是目标年份），不展示给读者
    note: `SEP 中位数：${pathNote}（${releaseLabel}发布）`,
  }
  if (series.refreshError) reading.refreshFailed = true
  if (isStale(series.updated, 'quarterly', asOf, now)) reading.stale = true
  return reading
}

function ofrLagNote(date: string, asOf: string): string {
  const days = calendarAge(date, asOf)
  if (!(days > 0) || !Number.isFinite(days)) return 'OFR Form PF'
  const quarters = Math.max(1, Math.round(days / 91))
  return `OFR Form PF，约滞后${quarters === 2 ? '两个' : quarters === 1 ? '一个' : `${quarters} 个`}季度`
}

function failSource<T>(label: string): SourceLoad<T> {
  return { ok: false, label }
}

/** 读入后校验容器；非整对象/数组的整源判失败，并清洗脏条目。 */
function coercePublic(result: SourceLoad<PublicFile>): SourceLoad<PublicFile> {
  if (!result.ok) return result
  if (!isPlainObject(result.data)) return failSource(SOURCE_PUBLIC)
  if (result.data.series != null && !isPlainObject(result.data.series)) return failSource(SOURCE_PUBLIC)
  return result
}

/** 数组则清洗条目；null/非数组原样保留，供 asPointList 标 malformed。 */
function cleanOrKeepPoints(value: unknown): Point[] | undefined | null | unknown {
  if (value === undefined) return undefined
  if (value === null || !Array.isArray(value)) return value
  return filterPointEntries(value)
}

function coerceBreadth(result: SourceLoad<BreadthFile>): SourceLoad<BreadthFile> {
  if (!result.ok) return result
  if (!isPlainObject(result.data)) return failSource(SOURCE_BREADTH)
  if (result.data.breadth != null && !isPlainObject(result.data.breadth)) return failSource(SOURCE_BREADTH)
  if (!result.data.breadth) return result
  const cleaned: Record<string, Breadth> = {}
  for (const [key, entry] of Object.entries(result.data.breadth)) {
    // 非 spx/ndx 等条目为 null 只跳过，不拖垮整源
    if (entry == null) continue
    if (!isPlainObject(entry)) continue
    const row = entry as Breadth
    cleaned[key] = {
      ...row,
      history: cleanOrKeepPoints(row.history) as Breadth['history'],
      backfill: cleanOrKeepPoints(row.backfill) as Breadth['backfill'],
      netHighs: cleanOrKeepPoints(row.netHighs) as Breadth['netHighs'],
      advDec: Array.isArray(row.advDec)
        ? row.advDec.filter((item): item is NonNullable<Breadth['advDec']>[number] => Array.isArray(item))
        : row.advDec,
    }
  }
  return { ok: true, data: { ...result.data, breadth: cleaned } }
}

function coerceSlices(result: SourceLoad<SlicesFile>): SourceLoad<SlicesFile> {
  if (!result.ok) return result
  if (!isPlainObject(result.data)) return failSource(SOURCE_SLICES)
  if (result.data.slices != null && !Array.isArray(result.data.slices)) return failSource(SOURCE_SLICES)
  if (!result.data.slices) return result
  const cleaned: Array<{ id: string; history: Point[] }> = []
  for (const slice of result.data.slices) {
    if (slice == null || !isPlainObject(slice)) continue
    if (typeof slice.id !== 'string') continue
    cleaned.push({
      id: slice.id,
      history: cleanOrKeepPoints(slice.history) as Point[],
    })
  }
  return { ok: true, data: { ...result.data, slices: cleaned } }
}

function coerceMacro(result: SourceLoad<MacroSnapshot>): SourceLoad<MacroSnapshot> {
  if (!result.ok) return result
  if (!isPlainObject(result.data)) return failSource(SOURCE_MACRO)
  if (result.data.series != null && !isPlainObject(result.data.series)) return failSource(SOURCE_MACRO)
  return result
}

function coerceRates(result: SourceLoad<RatesFile>): SourceLoad<RatesFile> {
  if (!result.ok) return result
  if (!isPlainObject(result.data)) return failSource(SOURCE_RATES)
  if (result.data.real != null && !Array.isArray(result.data.real)) return failSource(SOURCE_RATES)
  // 本页只用 real / latestReal；rows 结构异常时丢弃 rows，不拖垮整源
  const data = Array.isArray(result.data.rows) || result.data.rows == null ? result.data : { ...result.data, rows: undefined }
  if (!Array.isArray(data.real)) return { ok: true, data }
  return {
    ok: true,
    data: {
      ...data,
      real: filterPointEntries(data.real as unknown[]) as RatesFile['real'],
    },
  }
}

function coerceFred(result: SourceLoad<FredFile>): SourceLoad<FredFile> {
  if (!result.ok) return result
  if (!isPlainObject(result.data)) return failSource(SOURCE_FRED)
  if (result.data.series != null && !isPlainObject(result.data.series)) return failSource(SOURCE_FRED)
  if (!result.data.series) return result
  const cleaned: Record<string, FredSeries> = {}
  for (const [key, entry] of Object.entries(result.data.series)) {
    if (entry == null) continue
    if (!isPlainObject(entry)) continue
    cleaned[key] = {
      ...(entry as FredSeries),
      history: cleanOrKeepPoints((entry as FredSeries).history),
    }
  }
  return { ok: true, data: { ...result.data, series: cleaned } }
}

const COPPER_GOLD_SOURCE =
  'https://finance.yahoo.com/quote/HG=F/ · https://finance.yahoo.com/quote/GC=F/'

function inputSeriesStale(
  series: UsReading | undefined,
  freq: Freq,
  asOf: string,
  now?: Date,
): boolean {
  const points = sanitizePoints(series?.history, asOf)
  const last = points.at(-1)
  if (!last) return false
  return isStale(last[0], freq, asOf, now)
}

function buildReadings(input: {
  public?: PublicFile
  breadth?: BreadthFile
  slices?: SlicesFile
  macro?: MacroSnapshot
  rates?: RatesFile
  fred?: FredFile
  asOf: string
  now?: Date
}): { readings: Partial<Record<ReadingKey, Reading | null>>; structuralFailures: string[] } {
  const { public: pub, breadth, slices, macro, rates, fred, asOf, now } = input
  const s = pub?.series ?? {}
  const m = macro?.series
  const f = fred?.series ?? {}
  const out: Partial<Record<ReadingKey, Reading | null>> = {}
  const structuralFailures: string[] = []
  const noteFailure = (label: string) => {
    if (!structuralFailures.includes(label)) structuralFailures.push(label)
  }
  /** 逐指标隔离：抛错只置该读数为 null，并记录依赖来源。 */
  const run = (sources: string | string[], compute: () => Reading | null): Reading | null => {
    try {
      return compute()
    } catch {
      for (const label of Array.isArray(sources) ? sources : [sources]) noteFailure(label)
      return null
    }
  }

  const markUsHistory = (series: UsReading | undefined, label = SOURCE_PUBLIC) => {
    if (series && asPointList(series.history).malformed) noteFailure(label)
  }
  const markMacroHistory = (series: SeriesData | undefined) => {
    if (!series) return
    if (asPointList(series.history).malformed || asPointList(series.long).malformed) {
      noteFailure(SOURCE_MACRO)
    }
  }

  for (const key of Object.keys(s) as Array<keyof typeof s>) markUsHistory(s[key])
  if (m) for (const key of Object.keys(m) as Array<keyof typeof m>) markMacroHistory(m[key])
  if (slices?.slices?.some(slice => slice && asPointList(slice.history).malformed)) noteFailure(SOURCE_SLICES)
  if (breadth?.breadth) {
    for (const b of Object.values(breadth.breadth)) {
      if (!b || typeof b !== 'object') continue
      if (asPointList(b.history).malformed || asPointList(b.backfill).malformed || asPointList(b.netHighs).malformed) {
        noteFailure(SOURCE_BREADTH)
      }
    }
  }

  out.fedAssets = run(SOURCE_PUBLIC, () => fromUsSeries('fedAssets', s.fedAssets, asOf, now))
  out.bankReserves = run(SOURCE_PUBLIC, () => fromUsSeries('bankReserves', s.bankReserves, asOf, now))
  out.netLiquidity = run(SOURCE_PUBLIC, () => {
    const fedHist = asPointList(s.fedAssets?.history)
    const tgaHist = asPointList(s.treasuryCash?.history)
    const rrpHist = asPointList(s.overnightRrp?.history)
    if (fedHist.malformed || tgaHist.malformed || rrpHist.malformed) noteFailure(SOURCE_PUBLIC)
    return computeNetLiquidity(
      fedHist.points,
      tgaHist.points,
      rrpHist.points,
      asOf,
      now,
      {
        refreshFailed: Boolean(
          s.fedAssets?.refreshError || s.treasuryCash?.refreshError || s.overnightRrp?.refreshError,
        ),
        stale: inputSeriesStale(s.fedAssets, detectFreq(s.fedAssets?.frequency), asOf, now)
          || inputSeriesStale(s.treasuryCash, detectFreq(s.treasuryCash?.frequency), asOf, now)
          || inputSeriesStale(s.overnightRrp, detectFreq(s.overnightRrp?.frequency), asOf, now)
          || undefined,
      },
    )
  })

  markMacroHistory(m?.realRate)
  out.realRate = run(SOURCE_MACRO, () => fromMacro('realRate', m?.realRate, asOf, 'monthly', now, {
    source: '联邦基金利率（https://fred.stlouisfed.org/series/FEDFUNDS）− 核心 PCE 同比（https://fred.stlouisfed.org/series/PCEPILFE）',
    note: '实际政策利率 = 联邦基金利率 − 核心 PCE 同比',
  }))

  out.realYield10 = run(SOURCE_RATES, () => fromHistory('realYield10', realYieldHistory(rates, asOf), {
    unit: '%',
    source: 'https://fred.stlouisfed.org/series/DFII10',
    freq: 'daily',
    asOf,
    now,
  }))

  out.tenYear = preferNewer(
    run(SOURCE_PUBLIC, () => fromUsSeries('tenYear', s.tenYearDaily, asOf, now)),
    run(SOURCE_MACRO, () => fromMacro('tenYear', m?.tenYear, asOf, 'daily', now)),
  )
  out.curve10y2y = run(SOURCE_MACRO, () => fromMacro('curve10y2y', m?.curve, asOf, 'daily', now))
  out.nfci = run(SOURCE_MACRO, () => fromMacro('nfci', m?.nfci, asOf, 'weekly', now))

  out.hySpread = preferNewer(
    run(SOURCE_PUBLIC, () => fromUsSeries('hySpread', s.hyDaily, asOf, now)),
    run(SOURCE_MACRO, () => fromMacro('hySpread', m?.hy, asOf, 'daily', now)),
  )
  out.baaAaa = run(SOURCE_PUBLIC, () => fromUsSeries('baaAaa', s.baaAaa, asOf, now))

  const spxBreadth = breadth?.breadth?.spx
  // 宽度入口校验：容器存在但缺 spx，或 spx.advDec 不是数组，只记宽度来源
  if (breadth?.breadth && !breadth.breadth.spx) noteFailure(SOURCE_BREADTH)
  if (spxBreadth && spxBreadth.advDec != null && !Array.isArray(spxBreadth.advDec)) noteFailure(SOURCE_BREADTH)
  out.spxAbove200 = run(SOURCE_BREADTH, () => {
    if (!spxBreadth) return null
    const map = new Map<string, number>()
    const backfill = asPointList(spxBreadth.backfill)
    const hist = asPointList(spxBreadth.history)
    if (backfill.malformed || hist.malformed) noteFailure(SOURCE_BREADTH)
    for (const [d, v] of [...backfill.points, ...hist.points]) {
      if (typeof d === 'string' && isValidIsoDate(d) && Number.isFinite(v) && d <= asOf) map.set(d, v)
    }
    if (isValidIsoDate(spxBreadth.date) && Number.isFinite(spxBreadth.above200) && spxBreadth.date <= asOf) {
      map.set(spxBreadth.date, spxBreadth.above200)
    }
    const history = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])) as Point[]
    return fromHistory('spxAbove200', history, {
      unit: '%',
      source: spxBreadth.source || '标普 500 成分股宽度',
      freq: 'daily',
      asOf,
      now,
    })
  })

  out.netNewHighs = run(SOURCE_BREADTH, () => {
    const netHighsList = asPointList(spxBreadth?.netHighs)
    if (spxBreadth && netHighsList.malformed) noteFailure(SOURCE_BREADTH)
    return preferNewer(
      netHighsList.points.length
        ? fromHistory('netNewHighs', netHighsList.points, {
          unit: '%',
          source: spxBreadth?.source || '标普 500 净新高',
          freq: 'daily',
          asOf,
          now,
        })
        : null,
      spxBreadth?.highsLows && isValidIsoDate(spxBreadth.highsLows.date)
        ? fromHistory('netNewHighs', [[spxBreadth.highsLows.date, spxBreadth.highsLows.netHighsPct]], {
          unit: '%',
          source: spxBreadth.source || '标普 500 净新高',
          freq: 'daily',
          asOf,
          now,
        })
        : null,
    )
  })

  const spxSliceEntry = slices?.slices?.find(slice => slice?.id === 'spx')
  const spxSliceList = asPointList(spxSliceEntry?.history)
  if (spxSliceEntry && spxSliceList.malformed) noteFailure(SOURCE_SLICES)
  const spxSlice = spxSliceList.malformed ? undefined : spxSliceList.points

  out.advDecLine = run(SOURCE_BREADTH, () => {
    const advRows = parseAdvDec(spxBreadth?.advDec)
    if (!advRows.length) return null
    const metrics = buildAdvDecMetrics(spxBreadth, spxSlice, asOf, now)
    return metrics?.cumulative.length
      ? fromHistory('advDecLine', metrics.cumulative, {
        unit: '',
        source: '标普 500 成分股累计涨跌线',
        freq: 'daily',
        asOf,
        now,
      })
      : null
  })
  out.mcclellan = run(SOURCE_BREADTH, () => {
    const advRows = parseAdvDec(spxBreadth?.advDec)
    if (!advRows.length) return null
    const metrics = buildAdvDecMetrics(spxBreadth, spxSlice, asOf, now)
    const oscHistory = (metrics?.mcclellanSeries ?? [])
      .filter((row): row is [string, number] => row[1] !== null && Number.isFinite(row[1]))
    return oscHistory.length
      ? fromHistory('mcclellan', oscHistory, {
        unit: '',
        source: '比例调整 McClellan 振荡',
        freq: 'daily',
        asOf,
        now,
      })
      : null
  })

  out.spxVs200dma = run(SOURCE_SLICES, () => (spxSlice?.length ? spxVs200dma(spxSlice, asOf, now) : null))
  out.spxDrawdown = run(SOURCE_SLICES, () => (spxSlice?.length ? spxDrawdownReading(spxSlice, asOf, now) : null))

  const markSlice = (id: string) => {
    const { malformed } = slicePoints(slices, id)
    if (malformed) noteFailure(SOURCE_SLICES)
  }
  for (const id of ['rsp', 'sector-xly', 'sector-xlp', 'small', 'growth', 'value'] as const) markSlice(id)

  out.equalWeightRel = run(SOURCE_SLICES, () => relativePerformanceReading(
    'equalWeightRel',
    slicePoints(slices, 'rsp').points,
    slicePoints(slices, 'spx').points,
    asOf,
    '正值表示等权跑赢，上涨在扩散；负值表示少数大市值股票在领涨',
    now,
  ))
  out.cyclicalDefensive = run(SOURCE_SLICES, () => relativePerformanceReading(
    'cyclicalDefensive',
    slicePoints(slices, 'sector-xly').points,
    slicePoints(slices, 'sector-xlp').points,
    asOf,
    '正值表示可选消费跑赢必需消费，资金偏顺周期；负值表示防御板块相对更强',
    now,
  ))
  out.smallCapRel = run(SOURCE_SLICES, () => relativePerformanceReading(
    'smallCapRel',
    slicePoints(slices, 'small').points,
    slicePoints(slices, 'spx').points,
    asOf,
    '正值表示小盘跑赢大盘；负值表示大盘相对更强',
    now,
  ))
  out.growthValueRel = run(SOURCE_SLICES, () => relativePerformanceReading(
    'growthValueRel',
    slicePoints(slices, 'growth').points,
    slicePoints(slices, 'value').points,
    asOf,
    '正值表示成长跑赢价值；负值表示价值相对更强',
    now,
  ))

  out.policyRate = run(SOURCE_PUBLIC, () => {
    markUsHistory(s.iorb)
    return policyRateReading(s.iorb, asOf, now)
  })

  out.epsRevision = run(SOURCE_PUBLIC, () => fromUsSeries('epsRevision', s.spxForwardEpsChange, asOf, now, {
    note: epsRevisionNote(s.spxForwardEpsChange),
  }))
  out.forwardPe = run(SOURCE_PUBLIC, () => fromUsSeries('forwardPe', s.spxFactSetFpe, asOf, now))
  out.cape = run(SOURCE_PUBLIC, () => {
    const capeHist = asPointList(s.shillerCape?.history)
    const primary = fromUsSeries('cape', s.shillerCape, asOf, now, {
      note: capeHist.points.length
        ? capeEstimateNote(
          sanitizePoints(capeHist.points, asOf).at(-1)?.[0] ?? '',
          asOf,
          s.shillerCape?.scope,
        )
        : undefined,
    })
    const fallback = fromUsSeries('cape', s.spxCape, asOf, now)
    return preferNewer(primary, fallback)
  })

  out.vix = preferNewer(
    run(SOURCE_PUBLIC, () => fromUsSeries('vix', s.vixDaily, asOf, now)),
    run(SOURCE_MACRO, () => fromMacro('vix', m?.vix, asOf, 'daily', now, { unit: '点' })),
  )
  out.fearGreed = run(SOURCE_PUBLIC, () => fromUsSeries('fearGreed', s.fearGreed, asOf, now))
  out.retailBullBear = run(SOURCE_PUBLIC, () => retailBullBear(s.retailBull, s.retailBear, asOf, now))
  out.naaim = run(SOURCE_PUBLIC, () => fromUsSeries('naaim', s.naaim, asOf, now, {
    note: '公开数据约滞后三个月',
  }))
  out.marginDebtYoy = run(SOURCE_PUBLIC, () => fromUsSeries('marginDebtYoy', s.finraDebtYoy, asOf, now))
  out.managerCash = run(SOURCE_PUBLIC, () => fromUsSeries('managerCash', s.managerCash, asOf, now))

  out.copperGold = run(SOURCE_PUBLIC, () => fromUsSeries('copperGold', s.copperGold, asOf, now, {
    unit: '铜（美元/磅）÷ 金（美元/盎司）',
    source: COPPER_GOLD_SOURCE,
  }))
  out.copper = run(SOURCE_PUBLIC, () => {
    const copperList = asPointList(s.copperDaily?.history)
    if (s.copperDaily && copperList.malformed) noteFailure(SOURCE_PUBLIC)
    const hist = sanitizePoints(copperList.points, asOf)
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
  })

  markMacroHistory(m?.unrate)
  markMacroHistory(m?.sahm)
  markMacroHistory(m?.debtService)
  markMacroHistory(m?.buffett)
  markMacroHistory(m?.putCall)
  markMacroHistory(m?.corePce)
  markMacroHistory(m?.claims)
  out.unrate = run(SOURCE_MACRO, () => fromMacro('unrate', m?.unrate, asOf, 'monthly', now))
  out.sahm = run(SOURCE_MACRO, () => fromMacro('sahm', m?.sahm, asOf, 'monthly', now))
  out.debtService = run(SOURCE_MACRO, () => fromMacro('debtService', m?.debtService, asOf, 'quarterly', now))
  out.buffett = run(SOURCE_MACRO, () => fromMacro('buffett', m?.buffett, asOf, 'quarterly', now))
  out.putCall = run(SOURCE_MACRO, () => fromMacro('putCall', m?.putCall, asOf, 'monthly', now))
  out.corePce = run(SOURCE_MACRO, () => fromMacro('corePce', m?.corePce, asOf, 'monthly', now))
  out.claims = run(SOURCE_MACRO, () => fromMacro('claims', m?.claims, asOf, 'weekly', now, { unit: '万人' }))

  out.tga = run(SOURCE_PUBLIC, () => fromUsSeries('tga', s.treasuryCash, asOf, now, {
    unit: '十亿美元',
    source: s.treasuryCash?.source || 'https://fred.stlouisfed.org/series/WTREGEN',
  }))
  out.mmfAssets = run(SOURCE_PUBLIC, () => fromUsSeries('mmfAssets', s.mmfTotal, asOf, now, {
    unit: '亿美元',
    note: 'ICI 美国货币基金总资产，每周公布',
  }))
  out.cftcLevSpx = run(SOURCE_PUBLIC, () => fromUsSeries('cftcLevSpx', s.cftcSpxLev, asOf, now, {
    unit: '%',
  }))
  out.hfGrossExposure = run(SOURCE_PUBLIC, () => {
    const base = fromUsSeries('hfGrossExposure', s.ofrEquityGross, asOf, now, { unit: '亿美元' })
    if (!base) return null
    return {
      ...base,
      note: mergeNote(ofrLagNote(base.date, asOf), base.note),
    }
  })
  out.volumeRatio = run(SOURCE_PUBLIC, () => fromUsSeries('volumeRatio', s.volumeRatio, asOf, now, {
    unit: '倍',
  }))

  const markFredHistory = (series: FredSeries | undefined) => {
    if (series && asPointList(series.history).malformed) noteFailure(SOURCE_FRED)
  }
  for (const key of Object.keys(f)) markFredHistory(f[key])

  const fredFreq = (series: FredSeries | undefined, fallback: Freq): Freq =>
    series?.frequency ? detectFredFreq(series.frequency) : fallback

  out.fedFunds = run(SOURCE_FRED, () => fromFredSeries('fedFunds', f.fedFunds, asOf, fredFreq(f.fedFunds, 'monthly'), now))
  out.nominalGdpYoy = run(SOURCE_FRED, () => fromFredSeries('nominalGdpYoy', f.nominalGdpYoy, asOf, fredFreq(f.nominalGdpYoy, 'quarterly'), now))
  out.dotMedian = run(SOURCE_FRED, () => dotMedianReading(f.dotMedian, asOf, now))
  // BIS 季度数据通常滞后约两个季度公布，季频默认的 270 天过期线会误报；放宽到 400 天
  out.privateCreditGdp = run(SOURCE_FRED, () => {
    const base = fromFredSeries('privateCreditGdp', f.privateCreditGdp, asOf, fredFreq(f.privateCreditGdp, 'quarterly'), now, {
      note: 'BIS 数据，通常滞后约两个季度公布',
    })
    if (!base) return null
    const { stale: _stale, ...rest } = base
    return calendarAge(base.date, asOf) > 400 ? { ...rest, stale: true } : rest
  })
  out.govDebtGdp = run(SOURCE_FRED, () => fromFredSeries('govDebtGdp', f.govDebtGdp, asOf, fredFreq(f.govDebtGdp, 'quarterly'), now))
  out.hyYield = run(SOURCE_FRED, () => fromFredSeries('hyYield', f.hyYield, asOf, fredFreq(f.hyYield, 'daily'), now))
  out.cccSpread = run(SOURCE_FRED, () => fromFredSeries('cccSpread', f.cccSpread, asOf, fredFreq(f.cccSpread, 'daily'), now, { unit: 'bp' }))
  out.m2Yoy = run(SOURCE_FRED, () => fromFredSeries('m2Yoy', f.m2Yoy, asOf, fredFreq(f.m2Yoy, 'monthly'), now))
  out.inflationExp = run(SOURCE_FRED, () => fromFredSeries('inflationExp', f.inflationExp, asOf, fredFreq(f.inflationExp, 'daily'), now))
  out.primeRate = run(SOURCE_FRED, () => fromFredSeries('primeRate', f.primeRate, asOf, fredFreq(f.primeRate, 'monthly'), now))
  out.discountRate = run(SOURCE_FRED, () => fromFredSeries('discountRate', f.discountRate, asOf, fredFreq(f.discountRate, 'daily'), now))
  out.consumerCreditYoy = run(SOURCE_FRED, () => fromFredSeries('consumerCreditYoy', f.consumerCreditYoy, asOf, fredFreq(f.consumerCreditYoy, 'monthly'), now))
  out.profitGdp = run(SOURCE_FRED, () => fromFredSeries('profitGdp', f.profitGdp, asOf, fredFreq(f.profitGdp, 'quarterly'), now))

  // 展示字段统一清洗：文本字段必须是字符串，数值必须有限，日期必须合法；否则该读数作废或字段回落默认值
  for (const key of Object.keys(out) as ReadingKey[]) {
    const r = out[key]
    if (!r) continue
    if (!Number.isFinite(r.value) || !isValidIsoDate(r.date)) { out[key] = null; continue }
    const text = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback)
    r.label = text(r.label, READING_LABELS[key])
    r.unit = text(r.unit, '')
    r.source = text(r.source, READING_LABELS[key])
    if (r.note !== undefined && typeof r.note !== 'string') delete r.note
    if (r.percentile !== undefined && !Number.isFinite(r.percentile)) { delete r.percentile; delete r.percentileYears }
    if (r.percentileYears !== undefined && !Number.isFinite(r.percentileYears)) delete r.percentileYears
    if (r.longPercentile !== undefined && !Number.isFinite(r.longPercentile)) {
      delete r.longPercentile
      delete r.longPercentileSince
    }
    if (r.longPercentileSince !== undefined && !Number.isFinite(r.longPercentileSince)) delete r.longPercentileSince
    if (r.frequency !== 'daily' && r.frequency !== 'weekly' && r.frequency !== 'monthly' && r.frequency !== 'quarterly') {
      delete r.frequency
    }
    if (r.prior) {
      if (!isValidIsoDate(r.prior.date) || !Number.isFinite(r.prior.value)) delete r.prior
    }
    if (r.lastMove) {
      if (!isValidIsoDate(r.lastMove.date) || !Number.isFinite(r.lastMove.from) || !Number.isFinite(r.lastMove.to)) {
        delete r.lastMove
      }
    }
    if (r.moveRun) {
      const okDir = r.moveRun.direction === 'up' || r.moveRun.direction === 'down'
      if (
        !okDir
        || !Number.isFinite(r.moveRun.count)
        || !Number.isFinite(r.moveRun.total)
        || !Number.isFinite(r.moveRun.startLevel)
        || !isValidIsoDate(r.moveRun.since)
      ) {
        delete r.moveRun
      }
    }
  }
  return { readings: out, structuralFailures }
}

function countNonNullReadings(readings: Partial<Record<ReadingKey, Reading | null>>): number {
  return Object.values(readings).filter(r => r != null).length
}

/** 读取本站已有数据文件，计算各指标最新读数。 */
export async function loadReadings(fetcher: typeof fetch = fetch): Promise<ReadingsResult> {
  const [rawPub, rawBreadth, rawSlices, rawMacro, rawRates, rawFred] = await Promise.all([
    loadSource<PublicFile>(FILES.public, SOURCE_PUBLIC, fetcher),
    loadSource<BreadthFile>(FILES.breadth, SOURCE_BREADTH, fetcher),
    loadSource<SlicesFile>(FILES.slices, SOURCE_SLICES, fetcher),
    loadSource<MacroSnapshot>(FILES.macro, SOURCE_MACRO, fetcher),
    loadSource<RatesFile>(FILES.rates, SOURCE_RATES, fetcher),
    loadSource<FredFile>(FILES.fred, SOURCE_FRED, fetcher),
  ])

  const pub = coercePublic(rawPub)
  const breadth = coerceBreadth(rawBreadth)
  const slices = coerceSlices(rawSlices)
  const macro = coerceMacro(rawMacro)
  const rates = coerceRates(rawRates)
  const fred = coerceFred(rawFred)

  const failedSources = [pub, breadth, slices, macro, rates, fred]
    .flatMap(result => (result.ok ? [] : [result.label]))

  if (failedSources.length === ALL_SOURCE_LABELS.length) {
    throw new Error(`${failedSources.join('、')}加载失败`)
  }

  // today 仅作过滤未来观测的上限；快照 asOf 取自成功读数
  const today = nyDate()
  const built = buildReadings({
    public: pub.ok ? pub.data : undefined,
    breadth: breadth.ok ? breadth.data : undefined,
    slices: slices.ok ? slices.data : undefined,
    macro: macro.ok ? macro.data : undefined,
    rates: rates.ok ? rates.data : undefined,
    fred: fred.ok ? fred.data : undefined,
    asOf: today,
  })
  for (const label of built.structuralFailures) {
    if (!failedSources.includes(label)) failedSources.push(label)
  }

  const readings = built.readings
  const nonNull = countNonNullReadings(readings)
  if (nonNull === 0) {
    throw new Error(
      failedSources.length
        ? `${failedSources.join('、')}加载失败`
        : '读数计算失败',
    )
  }

  // 政策利率按日历日（含周末），不参与快照 asOf，避免把大师页拖到非交易日；点阵图 date=发布日亦排除
  const dates = (Object.entries(readings) as Array<[ReadingKey, Reading | null | undefined]>)
    .flatMap(([key, r]) => {
      if (key === 'policyRate' || key === 'dotMedian') return []
      return r?.date && r.date <= today ? [r.date] : []
    })
    .sort()
  const snapshotAsOf = dates.at(-1)
  if (!snapshotAsOf) {
    throw new Error('读数计算失败')
  }

  return {
    readings,
    asOf: snapshotAsOf,
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
  { id: 'policy', name: '利率与政策', keys: ['policyRate', 'realRate', 'realYield10', 'tenYear', 'curve10y2y', 'fedFunds', 'dotMedian', 'primeRate', 'discountRate'] },
  { id: 'liquidity', name: '流动性', keys: ['fedAssets', 'netLiquidity', 'bankReserves', 'nfci', 'tga', 'm2Yoy'] },
  { id: 'credit', name: '信用', keys: ['hySpread', 'baaAaa', 'hyYield', 'cccSpread'] },
  { id: 'trend', name: '趋势', keys: ['spxVs200dma', 'spxDrawdown'] },
  { id: 'breadth', name: '宽度与轮动', keys: ['spxAbove200', 'netNewHighs', 'advDecLine', 'mcclellan', 'equalWeightRel', 'smallCapRel', 'cyclicalDefensive', 'growthValueRel'] },
  { id: 'fundamentals', name: '盈利与就业', keys: ['epsRevision', 'unrate', 'sahm', 'debtService'] },
  { id: 'macro', name: '增长、通胀与债务', keys: ['nominalGdpYoy', 'corePce', 'inflationExp', 'claims', 'consumerCreditYoy', 'privateCreditGdp', 'govDebtGdp', 'profitGdp'] },
  { id: 'valuation', name: '估值', keys: ['forwardPe', 'cape', 'buffett'] },
  { id: 'sentiment', name: '情绪与仓位', keys: ['vix', 'fearGreed', 'putCall', 'retailBullBear', 'naaim', 'marginDebtYoy', 'managerCash', 'mmfAssets', 'cftcLevSpx', 'hfGrossExposure', 'volumeRatio'] },
  { id: 'commodities', name: '商品', keys: ['copper', 'copperGold'] },
]
