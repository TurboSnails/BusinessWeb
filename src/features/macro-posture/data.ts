// 宏观攻守数据适配器：读取站内已有的宏观 JSON，产出 types.ts 约定的 MacroData
import { useEffect, useState } from 'react'
import { computeNetLiquidity, isValidIsoDate, sanitizePoints } from '../macro-masters/readings'
import { qualifiedBreadth, type Breadth } from '../us-market/model'
import type { DataState, MacroData, Market, MarketData, Metric, Window } from './types'

type Tuple = [string, number]
type Fetcher = typeof fetch
type Freq = 'daily' | 'weekly' | 'monthly' | 'quarterly'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
const ROOT = `${BASE.endsWith('/') ? BASE : `${BASE}/`}data`
const DAY = 86_400_000
const FETCH_TIMEOUT_MS = 15_000

export const FILES = {
  us: 'macro-us.json',
  cn: 'macro-cn.json',
  hk: 'macro-hk.json',
  market: 'us-market-data.json',
  fred: 'macro-masters-fred.json',
  breadth: 'us-market-breadth.json',
} as const
type FileId = keyof typeof FILES

/** 周窗口：目标日之前最近观测距目标不得超过此天数（容许节假日、发布日漂移）。 */
const WEEKLY_TARGET_TOLERANCE_DAYS = 6
/** 周窗口内相邻观测的最大间隔：允许漏一周，月度抽样（≈30 天）不能冒充周频。 */
const WEEKLY_MAX_GAP_DAYS = 15

const WEEK_WINDOWS = ['fourWeeks', 'twelveWeeks'] as const
const WINDOW_DAYS: Record<(typeof WEEK_WINDOWS)[number], number> = { fourWeeks: 28, twelveWeeks: 84 }

/** 每种频率超过多少日历天算过期；个别序列在规格里单独给。 */
const STALE_DAYS: Record<Freq, number> = { daily: 7, weekly: 14, monthly: 95, quarterly: 230 }

type RawSeries = {
  fred?: string
  source?: string
  name?: string
  unit?: string
  frequency?: string
  latest?: { date?: unknown; value?: unknown }
  history?: unknown
  long?: unknown
  refreshError?: unknown
}
type RawFile = { series?: Record<string, RawSeries | undefined>; breadth?: { spx?: Breadth } }

/** refs：该读数实际用到的序列（file:key），只有它们的 refreshError 才计入 failedSources。 */
type Candidate = { points: Tuple[]; unit: string; source?: string; refs: string[] }

// ---------- 读取 ----------

async function readJson(id: FileId, fetcher: Fetcher): Promise<RawFile> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetcher(`${ROOT}/${FILES[id]}`, { cache: 'no-cache', signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body: unknown = await response.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('结构异常')
    const block = id === 'breadth' ? (body as RawFile).breadth : (body as RawFile).series
    if (!block || typeof block !== 'object' || Array.isArray(block)) throw new Error('缺少数据分组')
    return body as RawFile
  } finally {
    clearTimeout(timer)
  }
}

function toTuples(raw: unknown): Tuple[] {
  if (!Array.isArray(raw)) return []
  const out: Tuple[] = []
  for (const item of raw) {
    if (!Array.isArray(item) || item.length < 2) continue
    const [date, value] = item
    if (typeof date === 'string' && typeof value === 'number' && Number.isFinite(value)) out.push([date, value])
  }
  return out
}

/** history（含 long）+ latest 合并，按 asOf 过滤未来、无效、重复观测；同日以后出现者为准（latest 优先）。 */
function seriesPoints(series: RawSeries | undefined, asOf: string): Tuple[] {
  if (!series) return []
  const merged = [...toTuples(series.long), ...toTuples(series.history)]
  const latest = series.latest
  if (latest && typeof latest.date === 'string' && typeof latest.value === 'number') {
    merged.push([latest.date, latest.value])
  }
  return sanitizePoints(merged, asOf) as Tuple[]
}

function sourceOf(series: RawSeries | undefined, fallback: string): string {
  if (series?.fred && /^[A-Z0-9]+$/.test(series.fred)) return `https://fred.stlouisfed.org/series/${series.fred}`
  return series?.source || series?.name || fallback
}

// ---------- 窗口 ----------

const ms = (iso: string) => Date.parse(`${iso}T12:00:00Z`)
const shiftDays = (iso: string, days: number) => new Date(ms(iso) + days * DAY).toISOString().slice(0, 10)
const round = (n: number) => Math.round(n * 1e6) / 1e6
const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1
const quarterIndex = (iso: string) => Math.floor(monthIndex(iso) / 3)

/** 周窗口：取目标日（最新观测 − N 天）当天或之前最近观测；该观测须贴近目标且区间内无月级大缺口。 */
export function weeklyBefore(points: readonly Tuple[], days: number): Tuple | undefined {
  const last = points.at(-1)
  if (!last) return undefined
  const target = shiftDays(last[0], -days)
  let idx = -1
  for (let i = points.length - 1; i >= 0; i -= 1) {
    if (points[i][0] <= target) { idx = i; break }
  }
  if (idx < 0) return undefined
  if ((ms(target) - ms(points[idx][0])) / DAY > WEEKLY_TARGET_TOLERANCE_DAYS) return undefined
  for (let i = idx + 1; i < points.length; i += 1) {
    if ((ms(points[i][0]) - ms(points[i - 1][0])) / DAY > WEEKLY_MAX_GAP_DAYS) return undefined
  }
  return points[idx]
}

/** 按日历桶回看：offset 个月（或季度）前那个桶里的最后一个观测；桶空则不给，绝不退到更早的行。 */
export function bucketBefore(points: readonly Tuple[], unit: 'month' | 'quarter', offset: number): Tuple | undefined {
  const last = points.at(-1)
  if (!last) return undefined
  const idxOf = unit === 'month' ? monthIndex : quarterIndex
  const want = idxOf(last[0]) - offset
  for (let i = points.length - 2; i >= 0; i -= 1) {
    const at = idxOf(points[i][0])
    if (at === want) return points[i]
    if (at < want) return undefined
  }
  return undefined
}

function changesFor(points: readonly Tuple[], windows: readonly Window[]): Metric['changes'] {
  const last = points.at(-1)
  const changes: Metric['changes'] = {}
  if (!last) return changes
  for (const w of windows) {
    const before = w === 'fourWeeks' || w === 'twelveWeeks'
      ? weeklyBefore(points, WINDOW_DAYS[w])
      : w === 'threeMonths'
        ? bucketBefore(points, 'month', 3)
        : bucketBefore(points, 'quarter', 1)
    if (before) changes[w] = { before: { date: before[0], value: before[1] }, difference: round(last[1] - before[1]) }
  }
  return changes
}

function isStale(date: string, asOf: string, maxDays: number): boolean {
  return (ms(asOf) - ms(date)) / DAY > maxDays
}

function buildMetric(
  candidate: Candidate | undefined,
  opts: { asOf: string; freq: Freq; windows: readonly Window[]; staleDays?: number },
): Metric | undefined {
  const last = candidate?.points.at(-1)
  if (!candidate || !last) return undefined
  const metric: Metric = {
    date: last[0],
    value: last[1],
    unit: candidate.unit,
    stale: isStale(last[0], opts.asOf, opts.staleDays ?? STALE_DAYS[opts.freq]),
    changes: changesFor(candidate.points, opts.windows),
  }
  if (candidate.source) metric.source = candidate.source
  return metric
}

// ---------- 单位 ----------

function toBp(points: Tuple[], unit: string | undefined): Tuple[] | undefined {
  if (!unit || /bp|基点/i.test(unit)) return points
  if (unit === '%' || /百分点|pp/.test(unit)) return points.map(([d, v]) => [d, round(v * 100)])
  return undefined
}

function toPercent(points: Tuple[], unit: string | undefined): Tuple[] | undefined {
  if (!unit || unit === '%') return points
  if (/bp|基点/i.test(unit)) return points.map(([d, v]) => [d, round(v / 100)])
  return undefined
}

/** 同口径多来源：取最新观测更新者；同日优先排在前面的（日频源）。 */
function fresher(...candidates: Array<Candidate | undefined>): Candidate | undefined {
  let best: Candidate | undefined
  for (const c of candidates) {
    const last = c?.points.at(-1)
    if (!c || !last) continue
    if (!best || last[0] > best.points.at(-1)![0]) best = c
  }
  return best
}

// ---------- 组装 ----------

type Loaded = Partial<Record<FileId, RawFile>>

function seriesOf(loaded: Loaded, file: FileId, key: string): RawSeries | undefined {
  const s = loaded[file]?.series?.[key]
  return s && typeof s === 'object' && !Array.isArray(s) ? s : undefined
}

/** 返回带 refreshError 的输入序列标识。 */
function refsOf(loaded: Loaded, inputs: Array<[FileId, string]>): string[] {
  return inputs
    .filter(([file, key]) => Boolean(seriesOf(loaded, file, key)?.refreshError))
    .map(([file, key]) => `${FILES[file]}:${key}`)
}

function plain(loaded: Loaded, file: FileId, key: string, asOf: string, unit?: string): Candidate | undefined {
  const s = seriesOf(loaded, file, key)
  const points = seriesPoints(s, asOf)
  if (!points.length) return undefined
  return { points, unit: unit ?? s?.unit ?? '', source: sourceOf(s, FILES[file]), refs: refsOf(loaded, [[file, key]]) }
}

function converted(
  loaded: Loaded, file: FileId, key: string, asOf: string,
  convert: (p: Tuple[], unit: string | undefined) => Tuple[] | undefined, unit: string,
): Candidate | undefined {
  const s = seriesOf(loaded, file, key)
  const points = convert(seriesPoints(s, asOf), s?.unit)
  if (!points?.length) return undefined
  return { points, unit, source: sourceOf(s, FILES[file]), refs: refsOf(loaded, [[file, key]]) }
}

const NET_LIQUIDITY_LOOKBACK_DAYS = 120

function netLiquidityCandidate(loaded: Loaded, asOf: string): Candidate | undefined {
  const fed = seriesPoints(seriesOf(loaded, 'market', 'fedAssets'), asOf)
  const tga = seriesPoints(seriesOf(loaded, 'market', 'treasuryCash'), asOf)
  const rrp = seriesPoints(seriesOf(loaded, 'market', 'overnightRrp'), asOf)
  const latest = computeNetLiquidity(fed, tga, rrp, asOf)
  if (!latest) return undefined
  // 复用同一周三对齐口径，逐周取值组成近段历史，供 4/12 周变化使用
  const from = shiftDays(latest.date, -NET_LIQUIDITY_LOOKBACK_DAYS)
  const points: Tuple[] = []
  for (const [date] of fed) {
    if (date < from || date >= latest.date) continue
    const r = computeNetLiquidity(fed, tga, rrp, date)
    if (r && r.date === date) points.push([date, r.value])
  }
  points.push([latest.date, latest.value])
  return {
    points,
    unit: latest.unit,
    source: latest.source,
    refs: refsOf(loaded, [['market', 'fedAssets'], ['market', 'treasuryCash'], ['market', 'overnightRrp']]),
  }
}

type Spec = { key: string; freq: Freq; windows: readonly Window[]; staleDays?: number; get: () => Candidate | undefined }

const W = WEEK_WINDOWS
const M3: readonly Window[] = ['threeMonths']
const Q1: readonly Window[] = ['lastQuarter']

function spxBreadth(loaded: Loaded, asOf: string): Candidate | undefined {
  const row = loaded.breadth?.breadth?.spx
  if (!qualifiedBreadth(row) || ![row.above200, row.covered, row.total].every(Number.isFinite)
    || typeof row.date !== 'string' || !isValidIsoDate(row.date) || row.date > asOf) return undefined
  return { points: [[row.date, row.above200]], unit: '%', source: row.source, refs: [] }
}

function usSpecs(l: Loaded, asOf: string): Spec[] {
  return [
    { key: 'gdp', freq: 'quarterly', windows: Q1, get: () => plain(l, 'us', 'gdp', asOf) },
    { key: 'unrate', freq: 'monthly', windows: M3, get: () => plain(l, 'us', 'unrate', asOf) },
    { key: 'sahm', freq: 'monthly', windows: M3, get: () => plain(l, 'us', 'sahm', asOf) },
    { key: 'claims', freq: 'weekly', windows: W, get: () => plain(l, 'us', 'claims', asOf) },
    { key: 'corePce', freq: 'monthly', windows: M3, get: () => plain(l, 'us', 'corePce', asOf) },
    {
      key: 'tenYear', freq: 'daily', windows: W,
      get: () => fresher(
        converted(l, 'market', 'tenYearDaily', asOf, toPercent, '%'),
        converted(l, 'us', 'tenYear', asOf, toPercent, '%'),
      ),
    },
    { key: 'inflationExp', freq: 'daily', windows: W, get: () => plain(l, 'fred', 'inflationExp', asOf) },
    {
      key: 'hy', freq: 'daily', windows: W,
      get: () => fresher(
        converted(l, 'market', 'hyDaily', asOf, toBp, 'bp'),
        converted(l, 'us', 'hy', asOf, toBp, 'bp'),
      ),
    },
    { key: 'cccSpread', freq: 'daily', windows: W, get: () => plain(l, 'fred', 'cccSpread', asOf) },
    { key: 'baaAaa', freq: 'monthly', windows: M3, get: () => plain(l, 'market', 'baaAaa', asOf) },
    { key: 'nfci', freq: 'weekly', windows: W, get: () => plain(l, 'us', 'nfci', asOf) },
    { key: 'netLiquidity', freq: 'weekly', windows: W, get: () => netLiquidityCandidate(l, asOf) },
    { key: 'bankReserves', freq: 'weekly', windows: W, get: () => plain(l, 'market', 'bankReserves', asOf) },
    { key: 'fedFunds', freq: 'monthly', windows: M3, get: () => plain(l, 'fred', 'fedFunds', asOf) },
    // 仅用于展示净流动性的驱动项，不进入规则
    { key: 'fedAssets', freq: 'weekly', windows: W, get: () => plain(l, 'market', 'fedAssets', asOf) },
    { key: 'tga', freq: 'weekly', windows: W, get: () => plain(l, 'market', 'treasuryCash', asOf) },
    { key: 'rrp', freq: 'daily', windows: W, get: () => plain(l, 'market', 'overnightRrp', asOf) },
    { key: 'vix', freq: 'daily', staleDays: 5, windows: [], get: () => fresher(plain(l, 'market', 'vixDaily', asOf), plain(l, 'us', 'vix', asOf)) },
    { key: 'breadth200', freq: 'daily', staleDays: 5, windows: [], get: () => spxBreadth(l, asOf) },
    { key: 'forwardPe', freq: 'weekly', windows: [], get: () => plain(l, 'market', 'spxFactSetFpe', asOf) },
    { key: 'epsRevision', freq: 'weekly', windows: [], get: () => plain(l, 'market', 'spxForwardEpsChange', asOf) },
  ]
}

function cnSpecs(l: Loaded, asOf: string): Spec[] {
  const monthly = (key: string): Spec => ({ key, freq: 'monthly', windows: M3, get: () => plain(l, 'cn', key, asOf) })
  return [
    { key: 'gdp', freq: 'quarterly', windows: Q1, get: () => plain(l, 'cn', 'gdp', asOf) },
    ...['pmi', 'nmpmi', 'ip', 'cpi', 'ppi', 'm1m2', 'lpr'].map(monthly),
  ]
}

function hkSpecs(l: Loaded, asOf: string): Spec[] {
  return [
    // DEXHKUS 在 FRED 上约滞后一周发布
    { key: 'hkd', freq: 'daily', windows: M3, staleDays: 14, get: () => plain(l, 'hk', 'hkd', asOf) },
    { key: 'fed', freq: 'monthly', windows: M3, get: () => plain(l, 'hk', 'fed', asOf) },
    { key: 'south', freq: 'daily', windows: M3, get: () => plain(l, 'hk', 'south', asOf) },
    // 内地景气是港股盈利的主要来源，取自 CN 快照
    { key: 'cnPmi', freq: 'monthly', windows: M3, get: () => plain(l, 'cn', 'pmi', asOf) },
    { key: 'cnNmpmi', freq: 'monthly', windows: M3, get: () => plain(l, 'cn', 'nmpmi', asOf) },
  ]
}

const MARKET_FILES: Record<Market, FileId[]> = {
  us: ['us', 'market', 'fred', 'breadth'],
  cn: ['cn'],
  hk: ['hk', 'cn'],
}

function buildMarket(market: Market, loaded: Loaded, failed: Set<FileId>, asOf: string): MarketData {
  const specs = market === 'us' ? usSpecs(loaded, asOf) : market === 'cn' ? cnSpecs(loaded, asOf) : hkSpecs(loaded, asOf)
  const metrics: Record<string, Metric | undefined> = {}
  const refreshFailed = new Set<string>()
  for (const spec of specs) {
    const candidate = spec.get()
    // 序列自身报告的采集失败（refreshError）与过期（stale）分开：前者记入 failedSources
    const metric = buildMetric(candidate, { asOf, freq: spec.freq, windows: spec.windows, staleDays: spec.staleDays })
    if (metric) candidate!.refs.forEach(ref => refreshFailed.add(ref))
    metrics[spec.key] = metric
  }
  const failedSources = [
    ...MARKET_FILES[market].filter(f => failed.has(f)).map(f => FILES[f]),
    ...refreshFailed,
  ]
  const dates = Object.values(metrics).flatMap(m => (m ? [m.date] : [])).sort()
  return { metrics, asOf: dates.at(-1) ?? null, failedSources }
}

/** 默认上限取上海日期：三地市场里日期最靠前，美国观测不会合法地晚于它。 */
function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date())
}

/**
 * 并行读取数据文件；单个文件失败时其余照常产出，并记入相关市场的 failedSources；
 * 全部失败或没有任何读数时抛错。asOf 为观测日期上限（之后的观测视为未来值丢弃）。
 */
export async function loadMacroPostureData(fetcher: Fetcher = fetch, asOf?: string): Promise<MacroData> {
  const limit = asOf ?? todayIso()
  const ids = Object.keys(FILES) as FileId[]
  const results = await Promise.allSettled(ids.map(id => readJson(id, fetcher)))
  const loaded: Loaded = {}
  const failed = new Set<FileId>()
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') loaded[ids[i]] = r.value
    else failed.add(ids[i])
  })
  if (failed.size === ids.length) throw new Error('宏观数据全部加载失败')
  const data: MacroData = {
    us: buildMarket('us', loaded, failed, limit),
    cn: buildMarket('cn', loaded, failed, limit),
    hk: buildMarket('hk', loaded, failed, limit),
  }
  const any = (Object.values(data) as MarketData[]).some(m => Object.values(m.metrics).some(Boolean))
  if (!any) throw new Error('宏观数据没有可用读数')
  return data
}

export function useMacroPostureData(): DataState {
  const [state, setState] = useState<DataState>({ status: 'loading' })
  useEffect(() => {
    let alive = true
    loadMacroPostureData()
      .then(data => { if (alive) setState({ status: 'ready', data }) })
      .catch(() => { if (alive) setState({ status: 'error' }) })
    return () => { alive = false }
  }, [])
  return state
}
