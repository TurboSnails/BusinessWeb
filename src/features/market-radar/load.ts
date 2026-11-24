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

function isRadar(body: unknown): body is RadarFile {
  if (!body || typeof body !== 'object') return false
  const file = body as Partial<RadarFile>
  return typeof file.ruleVersion === 'string'
    && typeof file.generatedAt === 'string'
    && Boolean(file.current && typeof file.current === 'object')
    && Array.isArray(file.indicators)
    && Boolean(file.backtest && typeof file.backtest === 'object')
}

export async function loadRadar(fetcher: typeof fetch = fetch): Promise<RadarFile> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetcher(RADAR_URL, { cache: 'no-cache', signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body: unknown = await response.json()
    if (!isRadar(body)) throw new Error('数据结构异常')
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
