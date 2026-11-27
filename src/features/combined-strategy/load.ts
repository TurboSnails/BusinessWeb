// 读取 public/data/combined-strategy.json（manager 维护契约）。页面只用本次加载。
import { useCallback, useEffect, useState } from 'react'
import type { CombinedStrategyFile } from './types'

export type CombinedStrategyState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: CombinedStrategyFile }

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
export const COMBINED_STRATEGY_URL = `${BASE.endsWith('/') ? BASE : `${BASE}/`}data/combined-strategy.json`
const TIMEOUT_MS = 15_000

function isCombinedStrategy(body: unknown): body is CombinedStrategyFile {
  if (!body || typeof body !== 'object') return false
  const file = body as Partial<CombinedStrategyFile>
  return file.ruleVersion === 'fusion-v1'
    && typeof file.generatedAt === 'string'
    && Boolean(file.current && typeof file.current === 'object')
    && Array.isArray(file.matrix)
    && Boolean(file.fusion && typeof file.fusion === 'object')
    && Array.isArray(file.timeline)
}

export async function loadCombinedStrategy(fetcher: typeof fetch = fetch): Promise<CombinedStrategyFile> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetcher(COMBINED_STRATEGY_URL, { cache: 'no-cache', signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body: unknown = await response.json()
    if (!isCombinedStrategy(body)) throw new Error('数据结构异常')
    return body
  } finally {
    clearTimeout(timer)
  }
}

let cache: Promise<CombinedStrategyFile> | null = null

/** 同一次页面会话内只请求一次；失败后允许 retry() 再拉。 */
export function useCombinedStrategy(fetcher?: typeof fetch): CombinedStrategyState & { retry: () => void } {
  const [state, setState] = useState<CombinedStrategyState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => {
    cache = null
    setState({ status: 'loading' })
    setAttempt(n => n + 1)
  }, [])
  useEffect(() => {
    let alive = true
    const request = fetcher ? loadCombinedStrategy(fetcher) : (cache ??= loadCombinedStrategy())
    request.then(
      data => { if (alive) setState({ status: 'ready', data }) },
      (error: unknown) => {
        if (!fetcher) cache = null
        if (alive) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
      },
    )
    return () => { alive = false }
  }, [fetcher, attempt])
  return { ...state, retry }
}

/** 测试用：清空模块级缓存 */
export function resetCombinedStrategyCache(): void {
  cache = null
}
