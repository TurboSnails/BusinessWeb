// 懒加载 public/data/macro-posture-daily.json（每日档位，设计第 14 节）。
// 时间线进入视口（或所在的折叠区展开、变得可见）时才请求；同一次页面会话只请求一次，失败后允许重试。
import { useEffect, useState, type RefObject } from 'react'
import type { DailyFile } from './types'

export type DailyState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: DailyFile }

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
export const DAILY_URL = `${BASE.endsWith('/') ? BASE : `${BASE}/`}data/macro-posture-daily.json`
const TIMEOUT_MS = 20_000

export function isDailyFile(body: unknown): body is DailyFile {
  if (!body || typeof body !== 'object') return false
  const file = body as Partial<DailyFile>
  if (typeof file.end !== 'string' || typeof file.start !== 'string') return false
  if (!Array.isArray(file.rows) || file.rows.length < 2 || !Array.isArray(file.changes)) return false
  const first = file.rows[0]
  const last = file.rows[file.rows.length - 1]
  return Array.isArray(first) && typeof first[0] === 'string' && typeof first[1] === 'number'
    && Array.isArray(last) && typeof last[0] === 'string' && first[0] < last[0]
}

export async function loadDaily(fetcher: typeof fetch = fetch): Promise<DailyFile> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetcher(DAILY_URL, { cache: 'no-cache', signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body: unknown = await response.json()
    if (!isDailyFile(body)) throw new Error('数据结构异常')
    return body
  } finally {
    clearTimeout(timer)
  }
}

let cache: Promise<DailyFile> | null = null

/**
 * 元素第一次接近视口时返回 true（之后保持 true）。
 * 收起的折叠区内容没有布局盒，观察器不会报告相交，因此展开前不会触发。
 * 环境不支持 IntersectionObserver 时直接视为可见。
 */
export function useNearViewport(ref: RefObject<Element | null>, rootMargin = '600px 0px'): boolean {
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    if (near) return
    const element = ref.current
    if (!element || typeof IntersectionObserver === 'undefined') {
      setNear(true)
      return
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setNear(true)
        observer.disconnect()
      }
    }, { rootMargin })
    observer.observe(element)
    return () => observer.disconnect()
  }, [near, ref, rootMargin])
  return near
}

/** 目标元素接近视口时才请求每日数据。 */
export function useDaily(ref: RefObject<Element | null>, options: { fetcher?: typeof fetch; rootMargin?: string } = {}): DailyState {
  const { fetcher, rootMargin } = options
  const near = useNearViewport(ref, rootMargin)
  const [state, setState] = useState<DailyState>({ status: 'idle' })
  useEffect(() => {
    if (!near) return
    let alive = true
    setState({ status: 'loading' })
    const request = fetcher ? loadDaily(fetcher) : (cache ??= loadDaily())
    request.then(
      data => { if (alive) setState({ status: 'ready', data }) },
      (error: unknown) => {
        if (!fetcher) cache = null
        if (alive) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
      },
    )
    return () => { alive = false }
  }, [near, fetcher])
  return state
}

/** 测试用：清空模块级缓存 */
export function resetDailyCache(): void {
  cache = null
}
