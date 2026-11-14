// 「财报前瞻」页的数据形状与纯函数：public/data/earnings-calendar.json（scripts/earnings-calendar.mjs 生成）。
// 不读 DOM / localStorage / 网络；页面、候选池「财报临近」与每周摘要共用同一组判断。
// 只整理事实（日期、一致预期、历史超预期幅度、实际结果）与站内已有研究，不做预测、不给买卖指令。
import { codeKey, venueOf, type Venue } from '../candidates/markets'
import type { CandidateItem, CandidateMarket } from '../candidates/validation'

export type EarningsMarket = CandidateMarket
/** bmo 盘前 · amc 盘后 · midday 午间休市（港股）· offhours 非交易时段（A 股按交易所披露时段规则）· unknown 时间未提供 */
export type EarningsTime = 'bmo' | 'amc' | 'midday' | 'offhours' | 'unknown'

export interface Consensus {
  eps: number | null
  revenue: number | null
  analysts: number | null
  revenueAnalysts: number | null
  currency: string | null
  asOf: string
  source: string
  note?: string
}
export interface SurpriseRow { date: string; epsActual: number | null; epsEstimate: number | null; surprisePct: number | null }
export interface EarningsResult {
  epsActual: number | null
  epsEstimate: number | null
  surprisePct: number | null
  revenueActual: number | null
  revenueYoY: number | null
  netProfitYoY?: number | null
  revenuePeriodEnd?: string | null
  currency: string | null
  asOf: string
  source: string
}
export interface ScenarioBand { bear: number; base: number; bull: number; price: number | null; priceDate: string | null; currency: string | null }
export interface ResearchSummary {
  rating: string | null
  lynch: string | null
  lynchAttention: string | null
  scenarios: ScenarioBand | null
  verify: string[]
  risk: string | null
  /** 程序化研究页：后续验证多为统一模板 */
  auto: boolean
  asOf: string | null
}
export interface EarningsItem {
  market: EarningsMarket
  code: string
  name: string
  date: string
  time: EarningsTime
  /** true 已确认（公司 / 交易所公布）· false 预估 · null 来源未说明 */
  confirmed: boolean | null
  dateSource: string
  period: string | null
  periodEnd?: string | null
  consensus: Consensus | null
  lastYear: { eps: number | null; revenue: number | null } | null
  history: SurpriseRow[]
  result: EarningsResult | null
  marketCap: { value: number; currency: string } | null
  research: ResearchSummary | null
  asOf: string
  note?: string
  appoint?: { first: string | null; changes: number; actual: string | null }
  /** 本次该源失败，沿用上次文件的条目 */
  carried?: boolean
}
export interface CnNotice {
  market: 'cn'
  code: string
  name: string
  kind: 'forecast' | 'express'
  noticeDate: string
  period: string | null
  reportDate: string | null
  metric?: string | null
  type?: string | null
  lower?: number | null
  upper?: number | null
  changeLower?: number | null
  changeUpper?: number | null
  lastYear?: number | null
  content?: string | null
  eps?: number | null
  revenue?: number | null
  revenueYoY?: number | null
  netProfit?: number | null
  netProfitYoY?: number | null
  source: string
  research: ResearchSummary | null
}
export interface SourceStatus { label: string; url: string; ok: boolean | null; fetchedAt: string | null; error: string | null; skipped?: boolean }
export interface CnWindow { reportDate: string; period: string; label: string; start: string; end: string }
export interface EarningsCalendar {
  schemaVersion: 1
  generatedAt: string
  today: string
  window: { start: string; end: string }
  sources: Record<string, SourceStatus>
  seasons: { cn?: { next: CnWindow | null; rule: string }; hk?: { rule: string } }
  items: EarningsItem[]
  cnNotices: CnNotice[]
}

/** 最小形状检查：坏文件不让页面报错 */
export function asEarningsCalendar(v: unknown): EarningsCalendar | null {
  const x = v as EarningsCalendar | null
  if (!x || x.schemaVersion !== 1 || typeof x.generatedAt !== 'string' || !Array.isArray(x.items)) return null
  return {
    ...x,
    sources: x.sources && typeof x.sources === 'object' ? x.sources : {},
    seasons: x.seasons ?? {},
    cnNotices: Array.isArray(x.cnNotices) ? x.cnNotices : [],
    items: x.items.filter(i => i && typeof i.code === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(i.date)),
  }
}

// ── 日期 ──
const DAY_MS = 86_400_000
const utc = (day: string): number => Date.parse(`${day}T00:00:00Z`)
export const addDays = (day: string, n: number): string => new Date(utc(day) + n * DAY_MS).toISOString().slice(0, 10)
export const daysBetween = (from: string, to: string): number => Math.round((utc(to) - utc(from)) / DAY_MS)
export const mondayOf = (day: string): string => addDays(day, -((new Date(utc(day)).getUTCDay() + 6) % 7))
/** 本周一至周五（周六、周日看的是下一周：周末打开页面时「本周」指即将到来的这一周） */
export function weekDays(today: string, offsetWeeks = 0): string[] {
  const dow = new Date(utc(today)).getUTCDay()
  const monday = addDays(mondayOf(today), (dow === 0 || dow === 6 ? 7 : 0) + offsetWeeks * 7)
  return [0, 1, 2, 3, 4].map(i => addDays(monday, i))
}
const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
export const weekdayLabel = (day: string): string => WEEKDAY[new Date(utc(day)).getUTCDay()]
export const shortDay = (day: string): string => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`

/** 数据超过 2 天没更新（工作流每天跑；周末也跑）就提示过期 */
export function staleDays(generatedAt: string, now: Date): number | null {
  const t = Date.parse(generatedAt)
  if (!Number.isFinite(t)) return null
  const d = Math.floor((now.getTime() - t) / DAY_MS)
  return d >= 2 ? d : null
}

// ── 市场 ──
export type VenueFilter = 'all' | Venue
export const VENUE_NAME: Record<Venue, string> = { us: '美股', hk: '港股', cn: 'A股' }
export const MARKET_NAME: Record<EarningsMarket, string> = { us: '标普500', ndx: '纳指100', adr: '美股非标普', hk: '港股', cn: 'A股' }
export const venueOfItem = (i: { market: EarningsMarket }): Venue => venueOf(i.market)
/** 交易地 + 统一代码：候选池里同一家可能记在 us / ndx / adr，港股 0700 / 00700 视为同一家 */
export const venueKey = (market: EarningsMarket, code: string): string => { const v = venueOf(market); return `${v}:${codeKey(v, code)}` }
export const candidateKeys = (items: CandidateItem[]): Set<string> => new Set(items.map(i => venueKey(i.market, i.code)))
export const companyHref = (i: { market: string; code: string }): string => `/research-notes/${i.market}/${encodeURIComponent(i.code)}`

// ── 站内评级 ──
/** 「条件关注」及以上：优先关注 / 优先跟踪 / 条件关注 */
export const isRatedUp = (rating: string | null | undefined): boolean => !!rating && /优先关注|优先跟踪|条件关注/.test(rating)
export type RatingTone = 'good' | 'watch' | 'warn' | 'bad' | 'none'
export function ratingTone(rating: string | null | undefined): RatingTone {
  if (!rating) return 'none'
  if (/回避|暂不/.test(rating)) return 'bad'
  if (/高风险|高位|透支|不追/.test(rating)) return 'warn'
  if (/条件关注|优先|首选|核心/.test(rating)) return 'good'
  return 'watch'
}

// ── 筛选 ──
export interface Filters { venue: VenueFilter; onlyCandidates: boolean; onlyRated: boolean; query: string }
export const DEFAULT_FILTERS: Filters = { venue: 'all', onlyCandidates: false, onlyRated: false, query: '' }
export function matches(i: { market: EarningsMarket; code: string; name: string; research: ResearchSummary | null }, f: Filters, pool: Set<string>): boolean {
  if (f.venue !== 'all' && venueOf(i.market) !== f.venue) return false
  if (f.onlyCandidates && !pool.has(venueKey(i.market, i.code))) return false
  if (f.onlyRated && !isRatedUp(i.research?.rating)) return false
  const q = f.query.trim().toLowerCase()
  if (q && !i.name.toLowerCase().includes(q) && !i.code.toLowerCase().includes(q)) return false
  return true
}

// ── 时段分组 ──
export type Slot = 'bmo' | 'amc' | 'other'
export const slotOf = (t: EarningsTime): Slot => (t === 'bmo' ? 'bmo' : t === 'amc' ? 'amc' : 'other')
export const SLOT_LABEL: Record<Slot, string> = { bmo: '盘前', amc: '盘后', other: '时段未定 / 非交易时段' }
export const TIME_LABEL: Record<EarningsTime, string> = { bmo: '盘前', amc: '盘后', midday: '午间休市', offhours: '非交易时段', unknown: '时间未提供' }
export function groupByDay<T extends { date: string; time: EarningsTime }>(items: T[], days: string[]): Map<string, Record<Slot, T[]>> {
  const out = new Map(days.map(d => [d, { bmo: [] as T[], amc: [] as T[], other: [] as T[] }]))
  for (const i of items) out.get(i.date)?.[slotOf(i.time)].push(i)
  return out
}

// ── 本周最受关注（站内口径，不是外部热度） ──
/** 美股 / 港股的“大市值”门槛（按条目自带货币）：2,000 亿美元 / 1 万亿港元 */
export const MEGA_CAP: Record<string, number> = { USD: 200e9, HKD: 1000e9 }
export const isMegaCap = (m: EarningsItem['marketCap']): boolean => !!m && Number.isFinite(m.value) && m.value >= (MEGA_CAP[m.currency] ?? Infinity)
/**
 * 打分：在候选池 +3；站内评级优先关注 / 优先跟踪 +2、条件关注 +1；大市值 +1。至少 1 分才入选。
 * 同分按市值（同币种）再按日期排序；最多 limit 家。
 */
export function watchScore(i: EarningsItem, pool: Set<string>): number {
  const r = i.research?.rating ?? ''
  return (pool.has(venueKey(i.market, i.code)) ? 3 : 0) + (/优先关注|优先跟踪/.test(r) ? 2 : /条件关注/.test(r) ? 1 : 0) + (isMegaCap(i.marketCap) ? 1 : 0)
}
export function mostWatched(items: EarningsItem[], pool: Set<string>, limit = 8): EarningsItem[] {
  return items.map(i => ({ i, s: watchScore(i, pool) })).filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || (b.i.marketCap?.value ?? 0) - (a.i.marketCap?.value ?? 0) || a.i.date.localeCompare(b.i.date) || a.i.code.localeCompare(b.i.code))
    .slice(0, limit).map(x => x.i)
}

// ── 超预期 ──
export type SurpriseTone = 'beat' | 'miss' | 'inline'
export function surpriseTone(pct: number | null | undefined): SurpriseTone | null {
  if (pct == null || !Number.isFinite(pct)) return null
  return pct > 0 ? 'beat' : pct < 0 ? 'miss' : 'inline'
}
/** 颜色习惯：美股绿涨红跌，A 股 / 港股红涨绿跌（CSS 类按交易地区分） */
export const surpriseClass = (market: EarningsMarket, pct: number | null | undefined): string => {
  const t = surpriseTone(pct)
  return t ? `ec-surprise is-${t} is-${venueOf(market)}` : 'ec-surprise is-missing'
}

// ── 情景带 ──
export interface BandPosition { position: number; vsBase: number; zone: 'below-bear' | 'bear-base' | 'base-bull' | 'above-bull' }
/** 现价在悲观—乐观区间里的位置（0..1，夹在两端）与相对基准情景的幅度 */
export function bandPosition(b: ScenarioBand | null | undefined): BandPosition | null {
  if (!b || b.price == null || !(b.bull > b.bear) || !(b.price > 0) || !(b.base > 0)) return null
  const raw = (b.price - b.bear) / (b.bull - b.bear)
  const zone = b.price < b.bear ? 'below-bear' : b.price < b.base ? 'bear-base' : b.price <= b.bull ? 'base-bull' : 'above-bull'
  return { position: Math.min(1, Math.max(0, raw)), vsBase: Math.round((b.base / b.price - 1) * 10000) / 100, zone }
}
export const ZONE_LABEL: Record<BandPosition['zone'], string> = { 'below-bear': '低于悲观情景', 'bear-base': '悲观—基准之间', 'base-bull': '基准—乐观之间', 'above-bull': '高于乐观情景' }

// ── 格式 ──
const CCY: Record<string, string> = { USD: '$', HKD: 'HK$', CNY: '¥', EUR: '€', GBP: '£', JPY: '¥', TWD: 'NT$' }
export const MISSING = '缺失'
export function fmtEps(v: number | null | undefined, currency?: string | null): string {
  if (v == null || !Number.isFinite(v)) return MISSING
  const sym = currency ? CCY[currency] ?? `${currency} ` : ''
  return `${v < 0 ? '−' : ''}${sym}${Math.abs(v).toFixed(Math.abs(v) >= 100 ? 1 : 2)}`
}
/** 大额：亿 / 万亿（带货币符号） */
export function fmtAmount(v: number | null | undefined, currency?: string | null): string {
  if (v == null || !Number.isFinite(v)) return MISSING
  const sym = currency ? CCY[currency] ?? `${currency} ` : ''
  const a = Math.abs(v), sign = v < 0 ? '−' : ''
  if (a >= 1e12) return `${sign}${sym}${(a / 1e12).toFixed(2)} 万亿`
  if (a >= 1e8) return `${sign}${sym}${(a / 1e8).toFixed(a >= 1e10 ? 0 : 1)} 亿`
  if (a >= 1e4) return `${sign}${sym}${(a / 1e4).toFixed(0)} 万`
  return `${sign}${sym}${a.toFixed(0)}`
}
export const fmtPct = (v: number | null | undefined, digits = 1): string => (v == null || !Number.isFinite(v) ? MISSING : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}%`)
export const fmtPrice = (v: number | null | undefined): string => (v == null || !Number.isFinite(v) ? MISSING : v.toLocaleString('en-US', { maximumFractionDigits: v >= 100 ? 0 : 2 }))
