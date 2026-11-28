import { useEffect, useMemo, useRef, useState } from 'react'
import { defaultPlans, loadReviewCatalog, type CatalogGroup } from './catalog'
import { calculateHoldings, loadHoldingCache, reviewSession, saveHoldingCache } from './holdings'

export function useHoldings(codesKey: string) {
  const [catalog, setCatalog] = useState<CatalogGroup[] | null>(null)
  const [catalogFailed, setCatalogFailed] = useState(false)
  const [catalogAttempt, setCatalogAttempt] = useState(0)
  const [request, setRequest] = useState<{ code?: string; codesKey?: string }>({})
  const [busy, setBusy] = useState(false)
  const [snapshot, setSnapshot] = useState(loadHoldingCache)
  const latest = useRef(snapshot)
  const plans = useMemo(() => defaultPlans(catalog ?? []), [catalog])

  useEffect(() => {
    const controller = new AbortController()
    loadReviewCatalog(controller.signal).then(next => {
      if (!controller.signal.aborted) { setCatalog(next); setCatalogFailed(false) }
    }).catch(() => { if (!controller.signal.aborted) setCatalogFailed(true) })
    return () => { controller.abort() }
  }, [catalogAttempt])

  useEffect(() => {
    const codes = new Set(codesKey.split(','))
    const listed = new Map([...plans].filter(([code]) => codes.has(code)))
    if (!listed.size) { setBusy(false); return }
    const controller = new AbortController()
    const session = reviewSession(new Date())
    const prior = latest.current
    const code = request.code
    const onlyOne = code && request.codesKey === codesKey && listed.has(code) && prior?.date === session.date && prior.phase === session.phase
    const scheduled = onlyOne ? new Map([[code, listed.get(code)!]]) : listed
    setBusy(true)
    calculateHoldings(scheduled, session, controller.signal).then(result => {
      if (controller.signal.aborted) return
      if (onlyOne) {
        const untouched = Object.entries(prior.statuses).filter(([code, holding]) => listed.get(code) === holding.plan)
        result.statuses = { ...Object.fromEntries(untouched), ...result.statuses }
      }
      latest.current = result
      setSnapshot(result)
      saveHoldingCache(result)
    }).finally(() => { if (!controller.signal.aborted) setBusy(false) })
    return () => { controller.abort() }
  }, [codesKey, plans, request])

  const refresh = (code?: string) => {
    if (!catalog) { setCatalogFailed(false); setCatalogAttempt(current => current + 1) }
    setRequest({ code, codesKey })
  }
  return { catalog, catalogFailed, plans, snapshot, busy, refresh }
}
