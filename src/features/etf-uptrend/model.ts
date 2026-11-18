/** ETF 主升浪：筛选 / 排序 / 倒推纯函数。数据由 scripts/etf_uptrend.py 导出到 public/data/etf-uptrend/。 */

export const TAG_KEYS = ['trend_retracement', 'new_pool', 't0', 'industry', 'broad_index', 'unique_rep'] as const
export type TagKey = (typeof TAG_KEYS)[number]
export const bit = (k: TagKey): number => 1 << TAG_KEYS.indexOf(k)

/** [同花顺代码 如 20:589200, 名称, 标签位掩码] */
export type Row = [string, string, number]

export interface DayMeta {
  d: string
  asof: string | null
  at: string
  st: string
  n: Partial<Record<'all' | TagKey, number>>
  notes: string[]
}

export interface RunEntry {
  started_at?: string
  finished_at?: string
  status: string
  message?: string | null
  source_as_of?: string | null
}

export interface UptrendIndex {
  days: DayMeta[]
  status: { last_run?: RunEntry; last_success?: RunEntry }
  schedule: { times: string[]; tz: string }
  source_page: string
}

export interface Day {
  d: string
  cats: TagKey[]
  rows: Row[]
}

export interface Period {
  start_day: string
  end_day: string
  duration?: number
  period_rise?: number
  period_change?: number
  main_amount_in?: number
  step_signal_count?: number
  step_signal_dates?: string[]
}

export interface Detail {
  at: string
  periods: Period[]
  reasons: Record<string, { title: string; content: string }[]>
}

export type Tab = 'all' | 't0' | 'watch' | 'industry' | 'broad_index'
export const TABS: [Tab, string][] = [
  ['all', '全部'], ['t0', 'T+0'], ['watch', '自选'], ['industry', '行业板块'], ['broad_index', '宽基指数'],
]

export interface Filters {
  tab: Tab
  retr: boolean
  newPool: boolean
  unique: boolean
  entered: boolean
  q: string
}

export const DEFAULT_FILTERS: Filters = { tab: 'all', retr: false, newPool: false, unique: false, entered: false, q: '' }

export const securityCode = (thsCode: string): string => thsCode.split(':')[1] ?? thsCode

export function missingCats(day: Day, f: Filters): TagKey[] {
  const need: TagKey[] = []
  if (f.tab === 't0' || f.tab === 'industry' || f.tab === 'broad_index') need.push(f.tab)
  if (f.retr) need.push('trend_retracement')
  if (f.newPool) need.push('new_pool')
  if (f.unique) need.push('unique_rep')
  return need.filter(k => !day.cats.includes(k))
}

export function filterRows(day: Day, f: Filters, watch: Set<string>, prev: Set<string> | null): Row[] {
  if (missingCats(day, f).length) return []
  const q = f.q.trim().toLowerCase()
  return day.rows.filter(([code, name, flags]) => {
    if (f.tab === 'watch' && !watch.has(code)) return false
    if ((f.tab === 't0' || f.tab === 'industry' || f.tab === 'broad_index') && !(flags & bit(f.tab))) return false
    if (f.retr && !(flags & bit('trend_retracement'))) return false
    if (f.newPool && !(flags & bit('new_pool'))) return false
    if (f.unique && !(flags & bit('unique_rep'))) return false
    if (f.entered && (!prev || prev.has(code))) return false
    return !q || code.toLowerCase().includes(q) || name.toLowerCase().includes(q)
  })
}

export function tabCount(day: Day, tab: Tab, watch: Set<string>): number | null {
  if (tab === 'all') return day.rows.length
  if (tab === 'watch') return day.rows.filter(r => watch.has(r[0])).length
  if (!day.cats.includes(tab)) return null
  return day.rows.filter(r => r[2] & bit(tab)).length
}

export function latestPeriod(detail: Detail | undefined): Period | null {
  if (!detail?.periods?.length) return null
  return detail.periods.reduce((a, b) => (b.start_day > a.start_day ? b : a))
}

export type SortKey = 'start' | 'dur' | 'rise' | 'steps'
export interface SortState { key: SortKey; dir: 'asc' | 'desc' }

export function nextSort(cur: SortState | null, key: SortKey): SortState | null {
  if (!cur || cur.key !== key) return { key, dir: 'desc' }
  return cur.dir === 'desc' ? { key, dir: 'asc' } : null
}

function sortValue(p: Period | null, key: SortKey): string | number | null {
  if (!p) return null
  const v = { start: p.start_day, dur: p.duration, rise: p.period_rise, steps: p.step_signal_count }[key]
  return v ?? null
}

export function sortRows(rows: Row[], sort: SortState | null, detail: Record<string, Detail>): Row[] {
  if (!sort) return rows
  const m = sort.dir === 'asc' ? 1 : -1
  return rows
    .map((r, i) => ({ r, i, v: sortValue(latestPeriod(detail[r[0]]), sort.key) }))
    .sort((a, b) => {
      if (a.v === null || b.v === null) return a.v === b.v ? a.i - b.i : a.v === null ? 1 : -1
      return (a.v < b.v ? -1 : a.v > b.v ? 1 : 0) * m || a.i - b.i
    })
    .map(x => x.r)
}

export function asIndex(body: unknown): UptrendIndex | null {
  if (!body || typeof body !== 'object') return null
  const o = body as UptrendIndex
  if (!Array.isArray(o.days)) return null
  return o
}

export function asDay(body: unknown): Day | null {
  if (!body || typeof body !== 'object') return null
  const o = body as Day
  if (!Array.isArray(o.rows) || !Array.isArray(o.cats)) return null
  return o
}

export function asDetailMap(body: unknown): Record<string, Detail> {
  if (!body || typeof body !== 'object') return {}
  return body as Record<string, Detail>
}

/** [起, 止, period_rise, 回踩日期[]] */
export type ReconPeriod = [string, string, number | null, string[]]

export interface ReconCheck {
  d: string; real: number; recon: number; both: number
  retr_real: number; retr_recon: number; retr_both: number
}

export interface Reconstructed {
  built_at: string
  source_as_of: string | null
  earliest: string | null
  universe: number
  missing: string[]
  names: Record<string, string>
  periods: Record<string, ReconPeriod[]>
  checks?: ReconCheck[]
}

export interface ReconRow { code: string; name: string; start: string; end: string; retr: boolean }

export function reconDays(r: Reconstructed): string[] {
  const set = new Set<string>()
  for (const ps of Object.values(r.periods)) for (const [s, e, , steps] of ps) { set.add(s); set.add(e); steps.forEach(x => set.add(x)) }
  const last = r.source_as_of ?? '9999'
  return [...set].filter(d => d <= last).sort().reverse()
}

export function reconMembers(r: Reconstructed, day: string): ReconRow[] {
  const rows: ReconRow[] = []
  for (const [code, ps] of Object.entries(r.periods)) {
    const p = ps.find(([s, e]) => s <= day && day <= e)
    if (p) rows.push({ code, name: r.names[code] ?? '', start: p[0], end: p[1], retr: p[3].includes(day) })
  }
  return rows.sort((a, b) => (a.start === b.start ? a.code.localeCompare(b.code) : a.start < b.start ? 1 : -1))
}

export function asReconstructed(body: unknown): Reconstructed | null {
  if (!body || typeof body !== 'object') return null
  const o = body as Reconstructed
  if (!o.periods || typeof o.periods !== 'object') return null
  return o
}

const WATCH_KEY = 'etf-uptrend-watch'
const FILTER_KEY = 'etf-uptrend-filters'
const SORT_KEY = 'etf-uptrend-sort'

function loadJson<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : JSON.parse(v) as T
  } catch {
    return fallback
  }
}

export function loadWatch(): Set<string> {
  return new Set(loadJson<string[]>(WATCH_KEY, []))
}

export function saveWatch(watch: Set<string>): void {
  try { localStorage.setItem(WATCH_KEY, JSON.stringify([...watch])) } catch { /* 隐私模式 */ }
}

export function loadFilters(): Filters {
  const partial = loadJson<Partial<Filters>>(FILTER_KEY, {})
  const f = { ...DEFAULT_FILTERS, ...partial, q: '' }
  if (!TABS.some(([t]) => t === f.tab)) f.tab = 'all'
  return f
}

export function saveFilters(f: Filters): void {
  try { localStorage.setItem(FILTER_KEY, JSON.stringify({ ...f, q: '' })) } catch { /* */ }
}

export function loadSort(): SortState | null {
  return loadJson<SortState | null>(SORT_KEY, null)
}

export function saveSort(sort: SortState | null): void {
  try { localStorage.setItem(SORT_KEY, JSON.stringify(sort)) } catch { /* */ }
}
