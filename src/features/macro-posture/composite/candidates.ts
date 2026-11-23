import { useEffect, useState } from 'react'
import type { CandidatesFile } from './types'

export type CandidatesState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: CandidatesFile }

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
export const CANDIDATES_URL = `${BASE.endsWith('/') ? BASE : `${BASE}/`}data/macro-posture-candidates.json`
const TIMEOUT_MS = 15_000

function isCandidates(body: unknown): body is CandidatesFile {
  if (!body || typeof body !== 'object') return false
  const file = body as Partial<CandidatesFile>
  return typeof file.generatedAt === 'string' && typeof file.baselineLabel === 'string'
    && typeof file.preregistered === 'string' && Array.isArray(file.criteria)
    && Array.isArray(file.candidates)
}

export async function loadCandidates(fetcher: typeof fetch = fetch): Promise<CandidatesFile> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetcher(CANDIDATES_URL, { cache: 'no-cache', signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body: unknown = await response.json()
    if (!isCandidates(body)) throw new Error('数据结构异常')
    return body
  } finally {
    clearTimeout(timer)
  }
}

let cache: Promise<CandidatesFile> | null = null

export function useCandidates(fetcher?: typeof fetch): CandidatesState {
  const [state, setState] = useState<CandidatesState>({ status: 'loading' })
  useEffect(() => {
    let alive = true
    const request = fetcher ? loadCandidates(fetcher) : (cache ??= loadCandidates())
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

export function resetCandidatesCache(): void {
  cache = null
}
