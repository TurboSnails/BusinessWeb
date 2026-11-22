import type { PriceBook, PriceIndex } from './types'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
const ROOT = `${BASE}data/portfolio-prices`

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

async function readJson(url: string, label: string, fetcher: Fetcher): Promise<unknown> {
  const response = await fetcher(url, { cache: 'no-cache' })
  if (!response.ok) throw new Error(`${label}加载失败（HTTP ${response.status}）`)
  return response.json()
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isHolders(value: unknown): boolean {
  if (value === undefined) return true
  if (!Array.isArray(value)) return false
  return value.every(holder => holder && typeof holder === 'object'
    && typeof (holder as { who?: unknown }).who === 'string'
    && (holder as { who: string }).who.trim() !== ''
    && typeof (holder as { weight?: unknown }).weight === 'number'
    && Number.isFinite((holder as { weight: number }).weight)
    && (holder as { weight: number }).weight >= 0
    && (holder as { weight: number }).weight <= 1
    && isDate((holder as { asOf?: unknown }).asOf))
}

function isPriceIndex(value: unknown): value is PriceIndex {
  if (!value || typeof value !== 'object') return false
  const index = value as PriceIndex
  return index.schemaVersion === 1 && typeof index.generatedAt === 'string' && Array.isArray(index.items)
    && index.items.every(item => item && typeof item.symbol === 'string' && typeof item.name === 'string'
      && ['growth', 'highVol', 'stable', 'benchmark'].includes(item.group)
      && isDate(item.first) && isDate(item.last) && isDate(item.asOf)
      && ['ok', 'stale'].includes(item.status) && ['ok', 'missing', 'none'].includes(item.dividendStatus)
      && isHolders(item.holders))
}

export async function loadPriceIndex(fetcher: Fetcher = fetch): Promise<PriceIndex> {
  const body = await readJson(`${ROOT}/index.json`, '价格清单', fetcher)
  if (!isPriceIndex(body)) throw new Error('价格清单格式不正确')
  return body
}

export async function loadPriceBook(symbols: string[], fetcher: Fetcher = fetch): Promise<PriceBook> {
  const unique = [...new Set(symbols)]
  const entries = await Promise.all(unique.map(async symbol => {
    const body = await readJson(`${ROOT}/${encodeURIComponent(symbol)}.json`, symbol, fetcher) as {
      symbol?: unknown; dates?: unknown; adjClose?: unknown
    }
    if (body.symbol !== symbol || !Array.isArray(body.dates) || !Array.isArray(body.adjClose)
      || body.dates.length === 0 || body.dates.length !== body.adjClose.length
      || !body.dates.every(isDate)
      || !body.adjClose.every(value => typeof value === 'number' && Number.isFinite(value) && value > 0)) {
      throw new Error(`${symbol} 价格序列格式不正确`)
    }
    for (let i = 1; i < body.dates.length; i += 1) {
      if (body.dates[i] <= body.dates[i - 1]) throw new Error(`${symbol} 价格日期未按升序排列`)
    }
    return [symbol, { dates: body.dates, adjClose: body.adjClose }] as const
  }))
  return Object.fromEntries(entries)
}
