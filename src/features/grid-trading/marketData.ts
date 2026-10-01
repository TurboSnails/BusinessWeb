import type { Candle, Quote } from './types'
import { symbolOf } from './types'

const CANDLE_CACHE_PREFIX = 'businessweb.grid-trading.candles.v1:'
const QUOTE_CACHE_KEY = 'businessweb.grid-trading.quotes.v1'
const QUOTE_TTL = 60_000
const REQUEST_TIMEOUT = 10_000
const MAX_HISTORY_PAGES = 20
const PAGE_SIZE = 640

type CandleCache = { fetchedOn: string; from: string; candles: Candle[] }
type QuoteCache = Record<string, { at: number; quote: Quote }>
type FetchLike = typeof fetch

export type CandleResult = CandleCache & { source: string }

export const marketToday = (now = new Date()): string => now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })

export const marketSessionOpen = (now = new Date()): boolean => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
  const minutes = Number(value('hour')) * 60 + Number(value('minute'))
  return !['Sat', 'Sun'].includes(value('weekday')) && ((minutes >= 570 && minutes < 690) || (minutes >= 780 && minutes < 900))
}

function parseCached<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const value = storage.getItem(key)
    return value ? JSON.parse(value) as T : fallback
  } catch {
    return fallback
  }
}

function cacheValue(storage: Storage, key: string, value: unknown): void {
  try { storage.setItem(key, JSON.stringify(value)) } catch { /* cache failure must not hide valid market data */ }
}

async function request(url: string, fetchImpl: FetchLike): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    const response = await fetchImpl(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`行情服务返回 HTTP ${response.status}`)
    return response
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('行情服务')) throw error
    if (controller.signal.aborted) throw new Error('行情请求超时，请稍后重试')
    throw new Error('行情请求失败，请检查网络或浏览器跨域设置')
  } finally {
    clearTimeout(timeout)
  }
}

async function downloadCandles(code: string, begin: string, fetchImpl: FetchLike): Promise<Candle[]> {
  const symbol = symbolOf(code)
  let end = marketToday()
  const lines: string[][] = []
  for (let page = 0; page < MAX_HISTORY_PAGES; page += 1) {
    const params = new URLSearchParams({ param: `${symbol},day,${begin},${end},${PAGE_SIZE},qfq` })
    const url = import.meta.env.VITE_MARKET_DIRECT === 'true'
      ? `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?${params.toString()}`
      : `/api/grid-market?${new URLSearchParams({ kind: 'candles', symbol, begin, end })}`
    const response = await request(url, fetchImpl)
    let payload: { data?: Record<string, { qfqday?: string[][]; day?: string[][] }> }
    try {
      payload = await response.json() as typeof payload
    } catch {
      throw new Error('行情服务返回了无法解析的数据')
    }
    const batch = payload.data?.[symbol]?.qfqday ?? payload.data?.[symbol]?.day ?? []
    if (!Array.isArray(batch) || batch.some(line => !Array.isArray(line) || !/^\d{4}-\d{2}-\d{2}$/.test(line[0]) || ![line[2], line[3], line[4]].every(value => Number.isFinite(Number(value)) && Number(value) > 0) || Number(line[4]) > Number(line[3]))) throw new Error('行情包含无效日线，数据不完整；请刷新后重试')
    if (!batch.length) break
    lines.unshift(...batch)
    const firstDate = batch[0]?.[0]
    if (!firstDate || firstDate <= begin || batch.length < PAGE_SIZE) break
    const previous = new Date(`${firstDate}T00:00:00Z`)
    previous.setUTCDate(previous.getUTCDate() - 1)
    end = previous.toISOString().slice(0, 10)
  }

  const unique = new Map<string, Candle>()
  for (const line of lines) {
    const [date, , closeValue, highValue, lowValue] = line
    const close = Number(closeValue), high = Number(highValue), low = Number(lowValue)
    if (!date || date < begin || ![close, high, low].every(value => Number.isFinite(value) && value > 0) || low > high) continue
    unique.set(date, { date, close, high, low })
  }
  return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export async function getCandles(
  code: string,
  begin: string,
  options: { force?: boolean } = {},
  fetchImpl: FetchLike = fetch,
): Promise<CandleResult> {
  if (!/^\d{6}$/.test(code.trim())) throw new Error('证券代码必须为六位数字')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(begin)) throw new Error('起始日期格式无效')
  const key = `${CANDLE_CACHE_PREFIX}${code.trim()}:qfq`
  const cached = parseCached<CandleCache | null>(localStorage, key, null)
  if (!options.force && cached?.fetchedOn === marketToday() && cached.from <= begin && cached.candles.length) {
    return { ...cached, candles: cached.candles.filter(candle => candle.date >= begin), source: '腾讯前复权日线（本地缓存）' }
  }
  const from = cached && cached.from < begin ? cached.from : begin
  const candles = await downloadCandles(code, from, fetchImpl)
  if (!candles.length) throw new Error('腾讯行情服务没有返回有效日线数据')
  const entry: CandleCache = { fetchedOn: marketToday(), from, candles }
  cacheValue(localStorage, key, entry)
  return { ...entry, candles: candles.filter(candle => candle.date >= begin), source: '腾讯前复权日线' }
}

function parseQuoteText(text: string): Quote[] {
  const quotes: Quote[] = []
  for (const match of text.matchAll(/v_(?:sh|sz)(\d{6})="([^"]*)"/g)) {
    const fields = match[2].split('~')
    const stamp = fields[30] ?? ''
    const quote: Quote = {
      code: match[1],
      name: fields[1]?.trim() ?? '',
      price: Number(fields[3]),
      high: Number(fields[33]),
      low: Number(fields[34]),
      date: `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`,
    }
    if ([quote.price, quote.high, quote.low].every(value => Number.isFinite(value) && value > 0) && /^\d{8}/.test(stamp) && quote.low <= quote.high) quotes.push(quote)
  }
  return quotes
}

export async function fetchQuotes(codes: string[], fetchImpl: FetchLike = fetch): Promise<Map<string, Quote>> {
  const unique = [...new Set(codes.map(code => code.trim()).filter(code => /^\d{6}$/.test(code))) ]
  const cache = parseCached<QuoteCache>(sessionStorage, QUOTE_CACHE_KEY, {})
  const result = new Map<string, Quote>()
  const missing = unique.filter(code => {
    const hit = cache[code]
    if (hit && Date.now() - hit.at < QUOTE_TTL) {
      result.set(code, hit.quote)
      return false
    }
    return true
  })
  if (!missing.length) return result
  for (let offset = 0; offset < missing.length; offset += 100) {
    const params = missing.slice(offset, offset + 100).map(symbolOf).join(',')
    const url = import.meta.env.VITE_MARKET_DIRECT === 'true'
      ? `https://qt.gtimg.cn/q=${params}`
      : `/api/grid-market?${new URLSearchParams({ kind: 'quotes', symbols: params })}`
    const response = await request(url, fetchImpl)
    let text: string
    try {
      text = new TextDecoder('gbk').decode(await response.arrayBuffer())
    } catch {
      throw new Error('无法解码腾讯 GBK 行情响应')
    }
    for (const quote of parseQuoteText(text)) {
      result.set(quote.code, quote)
      cache[quote.code] = { at: Date.now(), quote }
    }
  }
  cacheValue(sessionStorage, QUOTE_CACHE_KEY, cache)
  const absent = missing.filter(code => !result.has(code))
  if (absent.length) throw new Error(`实时报价缺少有效数据：${absent.join('、')}`)
  return result
}

export function mergeQuote(candles: Candle[], quote?: Quote): Candle[] {
  if (!quote) return candles
  const index = candles.findIndex(candle => candle.date === quote.date)
  if (index >= 0) {
    const merged = [...candles]
    const previous = candles[index]
    merged[index] = { date: quote.date, close: quote.price, high: Math.max(previous.high, quote.high), low: Math.min(previous.low, quote.low) }
    return merged
  }
  const last = candles[candles.length - 1]
  return !last || quote.date > last.date ? [...candles, { date: quote.date, close: quote.price, high: quote.high, low: quote.low }] : candles
}
