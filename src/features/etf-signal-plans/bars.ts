import { marketToday } from '../grid-trading/marketData'
import { symbolOf } from '../grid-trading/types'
import type { PlanBar } from './plan-trades'

type FetchLike = typeof fetch
const PAGE = 640
const MAX_PAGES = 20
/** 研究口径：后复权。红利 ETF 用前复权会扭曲「成长÷红利」择时比值。 */
export const PLAN_ADJUST = 'hfq' as const

/** 指数（sh/sz 前缀）或六位代码 → 日线 OHLC（缺开盘用收盘）。一律腾讯后复权。 */
export async function fetchPlanBars(codeOrSymbol: string, fetchImpl: FetchLike = fetch): Promise<{ bars: PlanBar[]; source: string }> {
  const raw = codeOrSymbol.trim()
  const symbol = /^(sh|sz)\d{6}$/i.test(raw) ? raw.toLowerCase() : /^\d{6}$/.test(raw) ? symbolOf(raw) : ''
  if (!symbol) throw new Error('代码须为六位数字或 sh/sz 指数')
  const bars = await downloadSymbol(symbol, fetchImpl)
  if (!bars.length) throw new Error(`无日线：${raw}`)
  return { bars, source: `腾讯后复权 ${symbol}` }
}

async function downloadSymbol(symbol: string, fetchImpl: FetchLike): Promise<PlanBar[]> {
  const begin = '2000-01-01'
  let end = marketToday()
  const lines: string[][] = []
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = import.meta.env.VITE_MARKET_DIRECT === 'true'
      ? `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?${new URLSearchParams({ param: `${symbol},day,${begin},${end},${PAGE},${PLAN_ADJUST}` })}`
      : `/api/grid-market?${new URLSearchParams({ kind: 'candles', symbol, begin, end, adjust: PLAN_ADJUST })}`
    const res = await fetchImpl(url)
    if (!res.ok) throw new Error(`行情接口暂时取不到数据（HTTP ${res.status}）`)
    const payload = await res.json() as { data?: Record<string, { hfqday?: string[][]; qfqday?: string[][]; day?: string[][] }> }
    const node = payload.data?.[symbol]
    const batch = node?.hfqday?.length
      ? node.hfqday
      : node?.qfqday?.length
        ? node.qfqday
        : node?.day ?? []
    if (!Array.isArray(batch) || !batch.length) break
    // 代理若仍只回前复权，宁可失败也不静默混用
    if (!node?.hfqday?.length && node?.qfqday?.length) {
      throw new Error(`行情未返回后复权（hfqday）：${symbol}；请确认 /api/grid-market 支持 adjust=hfq`)
    }
    lines.unshift(...batch)
    const firstDate = batch[0]?.[0]
    if (!firstDate || firstDate <= begin || batch.length < PAGE) break
    const previous = new Date(`${firstDate}T00:00:00Z`)
    previous.setUTCDate(previous.getUTCDate() - 1)
    end = previous.toISOString().slice(0, 10)
  }
  const map = new Map<string, PlanBar>()
  for (const line of lines) {
    const [date, openValue, closeValue, highValue, lowValue] = line
    const close = Number(closeValue), high = Number(highValue), low = Number(lowValue)
    const open = Number(openValue)
    if (!date || date < begin || ![close, high, low].every(v => Number.isFinite(v) && v > 0) || low > high) continue
    const o = Number.isFinite(open) && open > 0 && open >= low && open <= high ? open : close
    map.set(date, { date, open: o, high, low, close })
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
}
