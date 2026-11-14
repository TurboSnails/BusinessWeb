// 候选池「财报临近」：候选公司里未来 N 天内有财报的（public/data/earnings-calendar.json 的条目）。
// 纯函数，不读网络；只给事实（日期、时段、是否确认、来源），不提示买卖。
import { codeKey, venueOf } from './markets.js'
import type { CandidateItem, CandidateMarket } from './validation.js'

/** earnings-calendar.json 条目里这里用到的字段 */
export interface EarningsEntryLike {
  market: CandidateMarket
  code: string
  name: string
  date: string
  time: string
  confirmed: boolean | null
  period: string | null
  dateSource: string
}
export interface EarningsSoon {
  market: CandidateMarket
  code: string
  name: string
  date: string
  daysUntil: number
  time: string
  confirmed: boolean | null
  period: string | null
  dateSource: string
}

const DAY_MS = 86_400_000
const utc = (day: string): number => Date.parse(`${day}T00:00:00Z`)
const keyOf = (market: CandidateMarket, code: string): string => { const v = venueOf(market); return `${v}:${codeKey(v, code)}` }

/**
 * @param today   北京日期 YYYY-MM-DD
 * @param days    今天起往后多少天（含今天）
 * 返回按日期排序；同一家只取最近一次。候选记在 us / ndx / adr 任一市场都能对上同一家美股。
 */
export function earningsSoon(candidates: CandidateItem[], entries: EarningsEntryLike[], today: string, days = 14): EarningsSoon[] {
  const wanted = new Map(candidates.map(c => [keyOf(c.market, c.code), c]))
  const best = new Map<string, EarningsSoon>()
  for (const e of entries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue
    const k = keyOf(e.market, e.code)
    const cand = wanted.get(k)
    if (!cand) continue
    const daysUntil = Math.round((utc(e.date) - utc(today)) / DAY_MS)
    if (daysUntil < 0 || daysUntil >= days) continue
    const old = best.get(k)
    if (!old || e.date < old.date) best.set(k, { market: cand.market, code: cand.code, name: e.name, date: e.date, daysUntil, time: e.time, confirmed: e.confirmed, period: e.period, dateSource: e.dateSource })
  }
  return [...best.values()].sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code))
}

/** 一句话：「NVDA 11/17 盘后（已确认）」；日期为预估时写明 */
export function earningsSoonText(e: EarningsSoon): string {
  const time = e.time === 'bmo' ? '盘前' : e.time === 'amc' ? '盘后' : ''
  const conf = e.confirmed === true ? '已确认' : e.confirmed === false ? '日期为预估' : '确认状态未知'
  const when = e.daysUntil === 0 ? '今天' : e.daysUntil === 1 ? '明天' : `${e.daysUntil} 天后`
  return `${e.date.slice(5)}${time ? ` ${time}` : ''}公布${e.period ? ` ${e.period}` : ''}（${when}，${conf}）`
}
