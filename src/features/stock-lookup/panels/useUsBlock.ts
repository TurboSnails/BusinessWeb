import { useEffect, useRef, useState } from 'react'

/** 美股专项面板通用取数：加载 / 出错 / 重试；非美股不发请求 */
export function useUsBlock<T>(
  enabled: boolean,
  symbol: string,
  /** 数据源对象（通常是 api），换了就重取 */
  source: object,
  load: (signal: AbortSignal) => Promise<T>,
  /** 额外的重取条件，如期权到期日 */
  extra = '',
): { data: T | null; loading: boolean; error: unknown; retry: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    if (!enabled) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    void loadRef.current(ac.signal).then(
      d => {
        if (cancelled) return
        setData(d)
        setLoading(false)
      },
      err => {
        if (cancelled || ac.signal.aborted) return
        setData(null)
        setError(err)
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
      ac.abort()
    }
  }, [enabled, symbol, source, extra, attempt])

  return { data, loading, error, retry: () => setAttempt(n => n + 1) }
}

/** 今天的美东日期 YYYY-MM-DD */
export function todayEt(now = new Date()): string {
  try { return now.toLocaleDateString('sv-SE', { timeZone: 'America/New_York' }) } catch { return now.toISOString().slice(0, 10) }
}
