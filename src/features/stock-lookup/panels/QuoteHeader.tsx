import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Quote, StockLookupApi } from '../types'
import { BlockError, BlockLoading } from './BlockState'
import {
  changeTone,
  fmtChange,
  fmtPct,
  fmtPrice,
  fmtQuoteTime,
  sessionLabel,
  shouldPollQuote,
  sourceDelayNote,
} from './format'
import { findResearchPath } from './symbolParse'

const POLL_MS = 30_000

export function QuoteHeader({
  symbol,
  api,
  quote,
  onQuote,
}: {
  symbol: string
  api: StockLookupApi
  quote: Quote | null
  onQuote: (q: Quote | null) => void
}): JSX.Element {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [researchHref, setResearchHref] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const onQuoteRef = useRef(onQuote)
  onQuoteRef.current = onQuote

  useEffect(() => {
    let cancelled = false
    setResearchHref(null)
    void findResearchPath(symbol).then(href => {
      if (!cancelled) setResearchHref(href)
    })
    return () => { cancelled = true }
  }, [symbol])

  useEffect(() => {
    let cancelled = false
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    void api.quote(symbol, ac.signal).then(
      q => {
        if (cancelled) return
        onQuoteRef.current(q)
        setLoading(false)
      },
      err => {
        if (cancelled || ac.signal.aborted) return
        onQuoteRef.current(null)
        setError(err)
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
      ac.abort()
    }
  }, [symbol, api, retry])

  useEffect(() => {
    const session = quote?.session
    if (!session || !shouldPollQuote(session)) return
    const refresh = (): void => {
      if (document.visibilityState !== 'visible') return
      const ac = new AbortController()
      void api.quote(symbol, ac.signal).then(
        q => onQuoteRef.current(q),
        () => { /* 轮询失败保留旧值 */ },
      )
    }
    const id = window.setInterval(refresh, POLL_MS)
    const onVis = (): void => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [quote?.session, symbol, api])

  if (loading && !quote) return <BlockLoading label="行情" />
  if (error && !quote) return <BlockError error={error} onRetry={() => setRetry(t => t + 1)} />
  if (!quote) return <BlockError error={{ error: '暂无行情', reason: 'not-found' }} onRetry={() => setRetry(t => t + 1)} />

  const tone = changeTone(quote.change)
  const ext = quote.extended

  return (
    <header className="sl-quote">
      <div className="sl-quote__main">
        <div className="sl-quote__names">
          <h2 className="sl-quote__name">{quote.name}</h2>
          <span className="sl-quote__code">{quote.symbol}</span>
          {researchHref && (
            <Link className="sl-quote__research" to={researchHref}>查看本站研究</Link>
          )}
        </div>
        <div className="sl-quote__price-row">
          <span className="sl-quote__price">{fmtPrice(quote.price, quote.currency)}</span>
          <span className={`sl-chg sl-chg--${tone}`}>
            {fmtChange(quote.change)}（{fmtPct(quote.changePct)}）
          </span>
          <span className="sl-quote__session">{sessionLabel(quote.session)}</span>
        </div>
        {ext && (
          <div className="sl-quote__ext">
            <span>{ext.session === 'pre' ? '盘前' : '盘后'} {fmtPrice(ext.price, quote.currency)}</span>
            <span className={`sl-chg sl-chg--${changeTone(ext.change)}`}>
              {fmtChange(ext.change)}（{fmtPct(ext.changePct)}）
            </span>
          </div>
        )}
        <p className="sl-quote__time">{fmtQuoteTime(ext?.time ?? quote.time, quote.timezone)}</p>
      </div>
      <p className="sl-quote__note">{sourceDelayNote(quote.market)}不构成买卖建议。</p>
    </header>
  )
}
