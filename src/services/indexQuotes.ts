// 观察盘指数报价：走同源 /api/grid-market?kind=quotes（腾讯行情），与热力图同一条链路。
// 旧实现经公共 CORS 代理（corsproxy.io / allorigins / cors.sh）取 Yahoo、东财，代理均已失效，美股、港股一直取不到。
import type { QuoteRow } from '../features/watch/sentiment'

const QUOTE_RE = /v_((?:sh|sz)\d{6}|r_hk(?:\d{5}|[A-Z]{2,8})|us[A-Z0-9.]{1,10})="([^"]*)"/g

/** 解析腾讯行情文本：字段 3 现价、32 涨跌幅%、30 行情时间（YYYYMMDDHHmmss 或带分隔符）。无效报价丢弃，不补零 */
export function parseTencentQuotes(text: string): Map<string, { price: number; changePercent: number; quoteTime: string }> {
  const out = new Map<string, { price: number; changePercent: number; quoteTime: string }>()
  for (const match of text.matchAll(QUOTE_RE)) {
    const fields = match[2].split('~')
    const stamp = (fields[30] ?? '').replace(/\D/g, '')
    const price = Number(fields[3]), changePercent = Number(fields[32])
    if (!/^\d{12,14}$/.test(stamp) || !fields[32]?.trim() || !Number.isFinite(price) || price <= 0 || !Number.isFinite(changePercent)) continue
    out.set(match[1], { price, changePercent, quoteTime: `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)} ${stamp.slice(8, 10)}:${stamp.slice(10, 12)}` })
  }
  return out
}

/** 取一组指数的最新报价；接口失败抛错，个别代码缺报价时只返回取到的 */
export async function fetchIndexQuotes(items: Array<{ symbol: string; name: string }>, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<QuoteRow[]> {
  if (!items.length) return []
  const symbols = items.map(i => i.symbol).join(',')
  const base = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')
  const url = import.meta.env.VITE_MARKET_DIRECT === 'true'
    ? `https://qt.gtimg.cn/q=${symbols}`
    : `${base}/api/grid-market?${new URLSearchParams({ kind: 'quotes', symbols })}`
  const response = await fetchImpl(url, { cache: 'no-store', signal: signal ?? AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error(`指数报价请求失败 HTTP ${response.status}`)
  const quotes = parseTencentQuotes(new TextDecoder('gbk').decode(await response.arrayBuffer()))
  return items.flatMap(i => {
    const q = quotes.get(i.symbol)
    return q ? [{ symbol: i.symbol, name: i.name, ...q }] : []
  })
}
