import type { LimitUpConcept } from '../types'
import { clsProxy } from './clsProxy'

// 上交所2026休市通知： https://www.sse.com.cn/disclosure/announcement/general/c/c_20251222_10802507.shtml
const holidays2026 = [
  ['2026-01-01', '2026-01-03'], ['2026-02-15', '2026-02-23'], ['2026-04-04', '2026-04-06'],
  ['2026-05-01', '2026-05-05'], ['2026-06-19', '2026-06-21'], ['2026-09-25', '2026-09-27'], ['2026-10-01', '2026-10-07'],
]
export function shanghaiDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10)
}
export function isClosedDate(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return day === 0 || day === 6 || holidays2026.some(([from, to]) => date >= from && date <= to)
}
export function previousTradingDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (!Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) throw new Error('请选择有效日期')
  while (isClosedDate(date)) date = dayBefore(date)
  return date
}
export interface LimitUpResult {
  status: 'closed' | 'ready' | 'empty'
  dataDate: string | null
  concepts: LimitUpConcept[]
  fetchedAt: string
}
function parsePayload(body: any, date: string): LimitUpConcept[] {
  if (body?.code !== 200) throw new Error(`数据源返回错误：${body?.msg || body?.code || '未知状态'}`)
  if (!Array.isArray(body?.data?.plate_stock)) throw new Error('数据源响应缺少板块列表')
  const dates = new Set<string>()
  const concepts: LimitUpConcept[] = body.data.plate_stock.map((p: any) => {
    if (typeof p?.secu_name !== 'string' || !Array.isArray(p.stock_list)) throw new Error('数据源板块格式异常')
    const stocks = p.stock_list.map((s: any) => {
      if (!s?.secu_code || !s?.secu_name) throw new Error('数据源股票格式异常')
      const time = String(s.time || '')
      if (/^\d{4}-\d{2}-\d{2}/.test(time)) dates.add(time.slice(0, 10))
      const boards = String(s.up_num || '').match(/(?:\d+天)?(\d+)板/)
      return { code: s.secu_code, name: s.secu_name, currentPrice: Number(s.last_px ?? s.price ?? 0), changePercent: Number(s.change ?? 0) * 100, limitUpTime: time, marketCap: Number(s.cmc ?? 0) / 100000000, consecutiveDays: boards ? Number(boards[1]) : 0, description: s.up_reason || '' }
    })
    return { name: p.secu_name, stockCount: Number(p.plate_stock_up_num ?? stocks.length), changePercent: Number(p.change ?? 0) * 100, drivingFactor: p.up_reason || '', stocks }
  })
  // 财联社可能忽略date返回最近数据，禁止将它冒充所选历史日期。
  if (dates.size && (dates.size !== 1 || !dates.has(date))) throw new Error(`数据日期不匹配：请求 ${date}，返回 ${Array.from(dates).join('、')}`)
  return concepts
}
export async function loadLimitUp(date: string, onlyLimitUp: boolean, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<LimitUpResult> {
  const closed = isClosedDate(date)
  let target = previousTradingDate(date)
  // 只在明确休市时向前寻找数据；交易日请求失败绝不按休市处理。
  for (let attempt = 0; attempt < (closed ? 10 : 1); attempt++) {
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) controller.abort()
    const timer = setTimeout(abort, 10000)
    let concepts: LimitUpConcept[]
    try {
      const url = clsProxy(`https://x-quote.cls.cn/v2/quote/a/plate/up_down_analysis?up_limit=${onlyLimitUp ? 1 : 0}&date=${target.replace(/-/g, '')}`)
      const response = await fetcher(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
      if (!response.ok) throw new Error(`数据请求失败（HTTP ${response.status}）`)
      concepts = parsePayload(await response.json(), target)
    } catch (error) {
      if (controller.signal.aborted && !signal?.aborted) throw new Error('数据请求超时，请重试')
      throw error
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
    if (concepts.length) return { status: closed ? 'closed' : 'ready', dataDate: target, concepts, fetchedAt: new Date().toISOString() }
    if (!closed) return { status: 'empty', dataDate: target, concepts: [], fetchedAt: new Date().toISOString() }
    target = previousTradingDate(dayBefore(target))
  }
  return { status: 'closed', dataDate: null, concepts: [], fetchedAt: new Date().toISOString() }
}
