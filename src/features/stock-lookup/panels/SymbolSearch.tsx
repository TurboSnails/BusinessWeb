import React, { useEffect, useId, useRef, useState } from 'react'
import type { StockLookupApi, SymbolHit } from '../types'
import { loadRecentSymbols, pushRecentSymbol, type RecentHit } from './recentSymbols'
import { EXAMPLE_SYMBOLS, parseLookupSymbol } from './symbolParse'

export interface SymbolSearchProps {
  api: StockLookupApi
  onSelect: (symbol: string, name?: string) => void
  /** 无代码时展示示例入口 */
  showExamples?: boolean
}

export function SymbolSearch({ api, onSelect, showExamples }: SymbolSearchProps): JSX.Element {
  const listId = useId()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SymbolHit[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [recent, setRecent] = useState<RecentHit[]>(() => loadRecentSymbols())
  const [searching, setSearching] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const needle = q.trim()
    abortRef.current?.abort()
    if (!needle) {
      setHits([])
      setSearching(false)
      return
    }
    const ac = new AbortController()
    abortRef.current = ac
    setSearching(true)
    const timer = window.setTimeout(() => {
      void api.search(needle, ac.signal).then(
        list => {
          if (ac.signal.aborted) return
          setHits(list)
          setOpen(true)
          setActive(list.length ? 0 : -1)
          setSearching(false)
        },
        () => {
          if (ac.signal.aborted) return
          setHits([])
          setSearching(false)
        },
      )
    }, 250)
    return () => {
      window.clearTimeout(timer)
      ac.abort()
    }
  }, [q, api])

  useEffect(() => {
    const onDoc = (e: MouseEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const commit = (symbol: string, name?: string): void => {
    const parsed = parseLookupSymbol(symbol)
    const sym = parsed?.symbol ?? symbol.trim().toUpperCase()
    if (!sym) return
    const next = pushRecentSymbol({ symbol: sym, name: name ?? sym })
    setRecent(next)
    setQ('')
    setHits([])
    setOpen(false)
    onSelect(sym, name)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open && hits.length) setOpen(true)
      setActive(i => (hits.length ? (i + 1) % hits.length : -1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(i => (hits.length ? (i - 1 + hits.length) % hits.length : -1))
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      setActive(-1)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (open && active >= 0 && hits[active]) {
        commit(hits[active].symbol, hits[active].name)
        return
      }
      const raw = q.trim()
      if (!raw) return
      const parsed = parseLookupSymbol(raw)
      commit(parsed?.symbol ?? raw)
    }
  }

  return (
    <div className="sl-search" ref={wrapRef}>
      <label className="sl-search__label" htmlFor={`${listId}-input`}>查询代码或名称</label>
      <div className="sl-search__row">
        <input
          id={`${listId}-input`}
          className="sl-search__input"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && hits.length > 0}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-opt-${active}` : undefined}
          placeholder="例如 MRVL、hk00700、sh600519"
          value={q}
          autoComplete="off"
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => { if (hits.length) setOpen(true) }}
          onKeyDown={onKeyDown}
        />
        {searching && <span className="sl-muted sl-search__hint" aria-live="polite">搜索中…</span>}
      </div>
      {open && hits.length > 0 && (
        <ul id={listId} role="listbox" className="sl-search__list">
          {hits.map((h, i) => (
            <li
              key={`${h.market}-${h.symbol}`}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'is-active' : undefined}
              onMouseEnter={() => setActive(i)}
              onMouseDown={e => { e.preventDefault(); commit(h.symbol, h.name) }}
            >
              <span className="sl-search__sym">{h.symbol}</span>
              <span className="sl-search__name">{h.name}</span>
              <span className="sl-search__mkt">{h.market === 'us' ? '美股' : h.market === 'hk' ? '港股' : '沪深'}</span>
            </li>
          ))}
        </ul>
      )}
      {showExamples && (
        <div className="sl-examples">
          <span className="sl-muted">试试：</span>
          {EXAMPLE_SYMBOLS.map(ex => (
            <button key={ex.symbol} type="button" className="ui-chip" onClick={() => commit(ex.symbol, ex.label)}>
              {ex.label}
            </button>
          ))}
        </div>
      )}
      {!showExamples && recent.length > 0 && !q && (
        <div className="sl-recent">
          <span className="sl-muted">最近查过：</span>
          {recent.map(r => (
            <button key={r.symbol} type="button" className="ui-chip" onClick={() => commit(r.symbol, r.name)}>
              {r.symbol}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
