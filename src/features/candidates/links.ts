// 候选池与各工具之间的连接：市场换算、带参数的工具链接、按公司汇总已保存的工具结果。
// 只读本机记录，不改动任何工具的存储格式。
import { buildDcfLink } from '../dcf/prefill'
import { autoDcfKey, type AutoDcf } from '../dcf/autoDcf'
import type { DcfSummary } from '../dcf/filter'
import { loadDcfRecords } from '../dcf/storage'
import type { DcfRecord } from '../dcf/types'
import { readRecords } from '../grid-trading/repository'
import type { SavedRecord } from '../grid-trading/types'
import { loadReports } from '../valuation/storage'
import type { ValuationReport } from '../valuation/types'
import type { CandidateMarket } from './validation'

export const MARKET_LABEL: Record<CandidateMarket, string> = { us: '标普500', ndx: '纳指100', adr: '美股非标普', hk: '港股', cn: 'A股' }

/** 交易地：标普、纳指、非标普都在美股交易 */
export type Venue = 'cn' | 'hk' | 'us'
export const venueOf = (market: CandidateMarket): Venue => (market === 'cn' ? 'cn' : market === 'hk' ? 'hk' : 'us')
export const VENUE_LABEL: Record<Venue, string> = { cn: 'A股', hk: '港股', us: '美股' }

const normCode = (code: string): string => code.trim().toUpperCase()
/** 港股代码统一成 5 位，便于和估值、DCF 记录比对（0700 / 00700 / 0700.HK 视为同一家） */
function codeKey(venue: Venue, code: string): string {
  const c = normCode(code).replace(/\.HK$/, '')
  return venue === 'hk' && /^\d{1,5}$/.test(c) ? c.padStart(5, '0') : c
}

export const valuationLink = (market: CandidateMarket, code: string): string =>
  `/valuation?${new URLSearchParams({ market: venueOf(market), code })}`

export const dcfLink = (market: CandidateMarket, code: string, name: string, price?: number | null): string =>
  buildDcfLink({ company: name, code, researchMarket: market, price })

/** 网格只支持沪深 6 位代码（个股与场内 ETF） */
export const gridSupported = (market: CandidateMarket, code: string): boolean => market === 'cn' && /^\d{6}$/.test(code.trim())
export const gridLink = (market: CandidateMarket, code: string, name: string): string | null =>
  gridSupported(market, code) ? `/grid-trading?${new URLSearchParams({ code: code.trim(), ...(name ? { name } : {}) })}` : null

export interface ToolSources {
  dcf: DcfRecord[]
  valuation: ValuationReport[]
  grid: SavedRecord[]
  /** 预填库的自动 DCF（异步加载，可能尚未就绪） */
  auto?: Map<string, AutoDcf>
}

/** 三类记录分别读取，任何一类损坏都只当作没有记录 */
export function readToolSources(): ToolSources {
  const safe = <T,>(read: () => T[]): T[] => { try { return read() } catch { return [] } }
  return { dcf: safe(loadDcfRecords), valuation: safe(loadReports), grid: safe(readRecords) }
}

export interface ToolProgress {
  dcf?: { price: number | null; mos: number | null; currency: string; savedAt: string }
  valuation?: { low: number; high: number; currency: string; createdAt: string }
  grid?: { id: string; pnl: number; savedAt: string }
}

const time = (iso: string | undefined): number => { const t = Date.parse(iso ?? ''); return Number.isFinite(t) ? t : 0 }
const latest = <T,>(list: T[], at: (x: T) => string | undefined): T | undefined =>
  list.reduce<T | undefined>((best, x) => (!best || time(at(x)) > time(at(best)) ? x : best), undefined)

/**
 * 列表里展示与筛选用的 DCF：本人保存的记录优先，否则用预填库的自动估值。
 * 安全边际一律按最新股价重算（本人记录的合理价不变），避免沿用保存当天的旧价。
 */
export function dcfOf(market: CandidateMarket, code: string, sources: ToolSources): DcfSummary | undefined {
  const venue = venueOf(market)
  const auto = sources.auto?.get(autoDcfKey(venue, codeKey(venue, code)))
  const mine = toolProgress(market, code, sources).dcf
  if (mine) {
    const current = auto && auto.currency === mine.currency ? auto.current : null
    const mos = mine.price != null && current ? (mine.price - current) / current : mine.mos
    return { price: mine.price, mos, source: 'mine', savedAt: mine.savedAt, current, buyBelow: null, status: 'ok', currency: mine.currency }
  }
  if (!auto) return undefined
  return {
    price: auto.fair, mos: auto.fair != null ? (auto.fair - auto.current) / auto.current : null, source: 'auto',
    current: auto.current, buyBelow: auto.buyBelow, status: auto.status, credibility: auto.credibility, currency: auto.currency,
  }
}

/** 某家公司最近一次的 DCF、估值报告与网格记录 */
export function toolProgress(market: CandidateMarket, code: string, sources: ToolSources): ToolProgress {
  const venue = venueOf(market)
  const key = codeKey(venue, code)
  const out: ToolProgress = {}

  const dcf = latest(sources.dcf.filter(r => r.market === venue && codeKey(venue, r.code) === key), r => r.savedAt)
  if (dcf) out.dcf = { price: dcf.result.price, mos: dcf.result.mos, currency: dcf.input.currency, savedAt: dcf.savedAt }

  const report = latest(sources.valuation.filter(r => r.snapshot.security.market === venue && codeKey(venue, r.snapshot.security.code) === key), r => r.createdAt)
  if (report) {
    const prices = Object.values(report.results.base ?? {})
      .filter(m => m?.status === 'calculated' && typeof m.price === 'number' && Number.isFinite(m.price))
      .map(m => m.price as number)
    if (prices.length) out.valuation = { low: Math.min(...prices), high: Math.max(...prices), currency: report.snapshot.security.quoteCurrency, createdAt: report.createdAt }
  }

  if (venue === 'cn') {
    const grid = latest(sources.grid.filter(r => normCode(r.row.code) === key), r => r.updatedAt ?? r.savedAt)
    if (grid) out.grid = { id: grid.id, pnl: grid.result.pnl, savedAt: grid.updatedAt ?? grid.savedAt }
  }
  return out
}

// 非美国交易所的后缀（BRK.B 这类美股份额类别不算）
const FOREIGN_SUFFIX = /\.(KS|KQ|PA|TW|TWO|T|L|DE|AS|SW|TO|V|HK|SS|SZ|CO|ST|MI|MC|AX|OL|HE|BR|VI|SA|MX|NS|BO|JK|SI|IL)$/

export interface ResearchRef { key: string; code: string }

/**
 * 研究筛出的公司 → 我的候选池条目。
 * 研究索引的键形如「中国:688256」「中国:0700.HK」「海外:NVDA」，代码可能带「/」分隔的第二上市地。
 * 美股按公司库判断属于标普、纳指还是非标普；无法对应到四个市场（如台股、韩股）的返回 null。
 */
export function researchToCandidate(ref: ResearchRef, usLists: { us: Set<string>; ndx: Set<string>; adr: Set<string> }): { market: CandidateMarket; code: string } | null {
  const region = ref.key.split(':')[0]
  const primary = ref.code.split(/\s*[/（(]\s*/)[0].trim().toUpperCase()
  if (region === '中国') {
    if (/^\d{6}$/.test(primary)) return { market: 'cn', code: primary }
    const hk = primary.match(/^(\d{1,5})\.HK$/)
    if (hk) return { market: 'hk', code: hk[1].padStart(5, '0') }
    return null
  }
  if (region === '海外' && /^[A-Z][A-Z.-]{0,9}$/.test(primary) && !FOREIGN_SUFFIX.test(primary)) {
    if (usLists.us.has(primary)) return { market: 'us', code: primary }
    if (usLists.ndx.has(primary)) return { market: 'ndx', code: primary }
    return { market: 'adr', code: primary }
  }
  return null
}
