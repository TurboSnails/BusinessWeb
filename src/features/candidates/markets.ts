// 候选池的市场与代码换算：纯函数、只依赖 validation，站内与服务端每日提醒邮件共用。
import type { CandidateMarket } from './validation.js'

export const MARKET_LABEL: Record<CandidateMarket, string> = { us: '标普500', ndx: '纳指100', adr: '美股非标普', hk: '港股', cn: 'A股' }

/** 交易地：标普、纳指、非标普都在美股交易 */
export type Venue = 'cn' | 'hk' | 'us'
export const venueOf = (market: CandidateMarket): Venue => (market === 'cn' ? 'cn' : market === 'hk' ? 'hk' : 'us')
export const VENUE_LABEL: Record<Venue, string> = { cn: 'A股', hk: '港股', us: '美股' }

const normCode = (code: string): string => code.trim().toUpperCase()
/** 港股代码统一成 5 位，便于和估值、DCF 记录比对（0700 / 00700 / 0700.HK 视为同一家） */
export function codeKey(venue: Venue, code: string): string {
  const c = normCode(code).replace(/\.HK$/, '')
  return venue === 'hk' && /^\d{1,5}$/.test(c) ? c.padStart(5, '0') : c
}
