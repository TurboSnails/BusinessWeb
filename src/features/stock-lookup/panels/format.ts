import type { LookupError, Session } from '../types'

export function isLookupError(e: unknown): e is LookupError {
  return !!e && typeof e === 'object' && 'reason' in e && 'error' in e
}

export function lookupErrorMessage(e: unknown): string {
  if (isLookupError(e)) {
    if (e.reason === 'unsupported') return e.error || '当前市场暂不支持该数据'
    if (e.reason === 'not-found') return '未找到该代码，请检查后重试'
    if (e.reason === 'bad-request') return '请求参数有误，请换一个代码试试'
    return e.error || '上游数据暂时不可用，请稍后重试'
  }
  if (e instanceof Error) return e.message || '数据暂时不可用，请稍后重试'
  return '数据暂时不可用，请稍后重试'
}

export function fmtPrice(n: number, currency?: string): string {
  const digits = Math.abs(n) >= 1000 ? 2 : Math.abs(n) >= 1 ? 2 : 4
  const body = n.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  if (!currency) return body
  if (currency === 'USD') return `$${body}`
  if (currency === 'HKD') return `HK$${body}`
  if (currency === 'CNY') return `¥${body}`
  return `${body} ${currency}`
}

export function fmtChange(n: number): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}`
}

export function fmtPct(n: number): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

export function changeTone(n: number): 'up' | 'down' | 'flat' {
  if (n > 0) return 'up'
  if (n < 0) return 'down'
  return 'flat'
}

const SESSION_LABEL: Record<Session, string> = {
  pre: '盘前',
  regular: '盘中',
  post: '盘后',
  closed: '已收盘',
}

export function sessionLabel(s: Session): string {
  return SESSION_LABEL[s] ?? s
}

const TZ_NOTE: Record<string, string> = {
  'America/New_York': '纽约时间',
  'Asia/Shanghai': '北京时间',
  'Asia/Hong_Kong': '香港时间',
}

export function timezoneNote(tz: string): string {
  return TZ_NOTE[tz] ?? tz
}

export function fmtQuoteTime(iso: string, timezone: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return iso
  try {
    const body = new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(d)
    return `${body}（${timezoneNote(timezone)}）`
  } catch {
    return iso
  }
}

export function fmtNewsTime(iso: string, timezone: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(d)
  } catch {
    return d.toISOString().slice(11, 16)
  }
}

export function fmtVolume(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)}亿`
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)}万`
  return n.toLocaleString('zh-CN')
}

/** 开盘相关时段（含美股盘前盘后）才轮询 */
export function shouldPollQuote(session: Session): boolean {
  return session === 'pre' || session === 'regular' || session === 'post'
}

export function sourceDelayNote(market: 'us' | 'hk' | 'cn'): string {
  if (market === 'us') return '美股行情来自 Yahoo Finance，可能有约 15 分钟延迟；盘前盘后为延长时段报价。'
  if (market === 'hk') return '港股行情来自腾讯行情，盘中近实时，收盘后为当日收盘价。'
  return '沪深行情来自腾讯行情，盘中近实时，收盘后为当日收盘价。'
}

/** 美元金额：万 / 亿美元，小额直接给美元 */
export function fmtUsdAmount(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(2)}亿美元`
  if (abs >= 1e4) return `${sign}${(abs / 1e4).toFixed(1)}万美元`
  return `${sign}$${abs.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`
}

/** 带正负号的股数（万 / 亿） */
export function fmtSignedShares(n: number): string {
  if (n === 0) return '0'
  return `${n > 0 ? '+' : '-'}${fmtVolume(Math.abs(n))}`
}

/** 0–1 比例 → 百分比 */
export function fmtRatioPct(r: number, digits = 2): string {
  return `${(r * 100).toFixed(digits)}%`
}
