// 读取 public/data/market-radar.json（manager 维护契约）。页面只用本次加载。
import { useEffect, useState } from 'react'
import type { RadarFile } from './types'

export type RadarState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: RadarFile }

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
export const RADAR_URL = `${BASE.endsWith('/') ? BASE : `${BASE}/`}data/market-radar.json`
const TIMEOUT_MS = 15_000
export const STALE_DATA_MESSAGE = '数据版本过旧，请稍后刷新'

function isRadar(body: unknown): body is RadarFile {
  if (!body || typeof body !== 'object') return false
  const file = body as Partial<RadarFile>
  if (typeof file.ruleVersion !== 'string' || typeof file.generatedAt !== 'string') return false
  if (!file.current || typeof file.current !== 'object') return false
  if (!Array.isArray(file.indicators) || !file.backtest || typeof file.backtest !== 'object') return false

  const counts = (file.current as RadarFile['current']).counts
  if (!counts || typeof counts !== 'object') return false
  if (typeof counts.total !== 'number' || typeof counts.scored !== 'number' || typeof counts.core !== 'number') {
    return false
  }
  if (!counts.heat || typeof counts.heat !== 'object' || !counts.status || typeof counts.status !== 'object') {
    return false
  }

  const backtest = file.backtest as RadarFile['backtest']
  if (!Array.isArray(backtest.curves)) return false

  const sample = file.indicators[0] as Partial<RadarFile['indicators'][number]> | undefined
  if (sample) {
    if (typeof sample.valueText !== 'string' || typeof sample.status !== 'string') return false
  }

  return true
}

export async function loadRadar(fetcher: typeof fetch = fetch): Promise<RadarFile> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetcher(RADAR_URL, { cache: 'no-cache', signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body: unknown = await response.json()
    if (!isRadar(body)) throw new Error(STALE_DATA_MESSAGE)
    return body
  } finally {
    clearTimeout(timer)
  }
}

let cache: Promise<RadarFile> | null = null

/** 同一次页面会话内只请求一次；失败后允许下次重试。 */
export function useMarketRadar(fetcher?: typeof fetch): RadarState {
  const [state, setState] = useState<RadarState>({ status: 'loading' })
  useEffect(() => {
    let alive = true
    const request = fetcher ? loadRadar(fetcher) : (cache ??= loadRadar())
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

/** 测试用：清空模块级缓存 */
export function resetRadarCache(): void {
  cache = null
}
