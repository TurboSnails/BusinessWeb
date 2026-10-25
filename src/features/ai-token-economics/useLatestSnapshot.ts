import { useCallback, useState } from 'react'
import { SAVED_SNAPSHOTS, pickLatest, type Snapshot } from './data'

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

/** idle：只显示已保存数据；loading：抓取中；newer：抓到比已保存更新的一期；same：已是最新；error：取不到 */
export type RefreshState = 'idle' | 'loading' | 'newer' | 'same' | 'error'

const isSnapshot = (v: unknown): v is Snapshot => {
  const s = v as Snapshot | null
  return !!s && typeof s.weekEnding === 'string' && typeof s.tokenUsage === 'number' && typeof s.tokenSpend === 'number'
    && !!s.price?.combined && !!s.price.openai && !!s.price.anthropic && !!s.spendShare
}

/**
 * 默认显示每月自动保存的快照；refresh() 手动抓取 Ramp 最新一期，仅在本次浏览中覆盖显示，不写入文件。
 * 抓取失败时继续显示已保存数据。
 */
export function useLatestSnapshot(): { snapshot: Snapshot; saved: Snapshot; history: Snapshot[]; state: RefreshState; refresh: () => Promise<void> } {
  const [live, setLive] = useState<Snapshot | null>(null)
  const [state, setState] = useState<RefreshState>('idle')
  const saved = pickLatest(SAVED_SNAPSHOTS)

  const refresh = useCallback(async () => {
    setState('loading')
    try {
      const res = await fetch(`${API_BASE}/api/ai-token-economics`, { cache: 'no-store' })
      const body: unknown = await res.json().catch(() => null)
      if (!res.ok || !isSnapshot(body)) throw new Error('bad response')
      setLive(body)
      setState(body.weekEnding > saved.weekEnding ? 'newer' : 'same')
    } catch {
      setState('error')
    }
  }, [saved.weekEnding])

  return { snapshot: pickLatest(SAVED_SNAPSHOTS, live), saved, history: SAVED_SNAPSHOTS, state, refresh }
}
