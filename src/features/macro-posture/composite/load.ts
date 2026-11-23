// 读取 public/data/macro-posture.json（manager 维护）。页面、监测页签、大师页共用。
import { useEffect, useState } from 'react'
import type { CompositeFile, CompositeState, TierDef, TierId } from './types'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
export const COMPOSITE_URL = `${BASE.endsWith('/') ? BASE : `${BASE}/`}data/macro-posture.json`
const TIMEOUT_MS = 15_000

function isComposite(body: unknown): body is CompositeFile {
  if (!body || typeof body !== 'object') return false
  const file = body as Partial<CompositeFile>
  return typeof file.ruleVersion === 'string' && Array.isArray(file.tiers) && !!file.current
    && Array.isArray(file.outer) && !!file.backtest
}

export async function loadComposite(fetcher: typeof fetch = fetch): Promise<CompositeFile> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetcher(COMPOSITE_URL, { cache: 'no-cache', signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body: unknown = await response.json()
    if (!isComposite(body)) throw new Error('数据结构异常')
    return body
  } finally {
    clearTimeout(timer)
  }
}

let cache: Promise<CompositeFile> | null = null

/** 同一次页面会话内只请求一次；失败后允许下次重试。 */
export function useCompositePosture(fetcher?: typeof fetch): CompositeState {
  const [state, setState] = useState<CompositeState>({ status: 'loading' })
  useEffect(() => {
    let alive = true
    const request = fetcher ? loadComposite(fetcher) : (cache ??= loadComposite())
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

export function tierDef(file: CompositeFile, id: TierId | null | undefined): TierDef | undefined {
  return id ? file.tiers.find(tier => tier.id === id) : undefined
}

/** 测试用：清空模块级缓存 */
export function resetCompositeCache(): void {
  cache = null
}
