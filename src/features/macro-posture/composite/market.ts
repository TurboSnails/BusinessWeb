import { useEffect, useState } from 'react'
import type { MarketFile } from './types'

export type MarketState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: MarketFile }

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
export const MARKET_URL = `${BASE.endsWith('/') ? BASE : `${BASE}/`}data/macro-posture-market.json`
const TIMEOUT_MS = 15_000

function isMarket(body: unknown): body is MarketFile {
  if (!body || typeof body !== 'object') return false
  const file = body as Partial<MarketFile>
  return typeof file.generatedAt === 'string'
    && typeof file.preregistered === 'string'
    && Boolean(file.stage1 && typeof file.stage1 === 'object')
    && Boolean(file.stage2 && typeof file.stage2 === 'object')
    && Array.isArray(file.disclosures)
}

export async function loadMarket(fetcher: typeof fetch = fetch): Promise<MarketFile> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetcher(MARKET_URL, { cache: 'no-cache', signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body: unknown = await response.json()
    if (!isMarket(body)) throw new Error('数据结构异常')
    return body
  } finally {
    clearTimeout(timer)
  }
}

let cache: Promise<MarketFile> | null = null

export function useMarket(fetcher?: typeof fetch): MarketState {
  const [state, setState] = useState<MarketState>({ status: 'loading' })
  useEffect(() => {
    let alive = true
    const request = fetcher ? loadMarket(fetcher) : (cache ??= loadMarket())
    request.then(
      data => { if (alive) setState({ status: 'ready', data }) },
      (error: unknown) => {
        if (!fetcher) cache = null
        if (alive) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
      },
    )
    return () => { alive = false }
  }, [fetcher])
  return state
}

export function resetMarketCache(): void {
  cache = null
}
