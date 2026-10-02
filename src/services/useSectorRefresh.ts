import { useEffect, useRef } from 'react'

// Mounted and visible pages refresh only their newest effective trading date.
export function useSectorRefresh(dates: string[], refresh: (date: string, signal: AbortSignal) => Promise<void>) {
  const callback = useRef(refresh)
  callback.current = refresh
  const ordered = [...dates].sort()
  const latest = ordered[ordered.length - 1]
  useEffect(() => {
    if (!latest) return
    const controller = new AbortController()
    let busy = false
    const timer = setInterval(async () => {
      if (busy || document.visibilityState === 'hidden') return
      busy = true
      try { await callback.current(latest, controller.signal) }
      catch { /* The page reports refresh failures while retaining its snapshot. */ }
      finally { busy = false }
    }, 30_000)
    return () => { clearInterval(timer); controller.abort() }
  }, [latest])
}
