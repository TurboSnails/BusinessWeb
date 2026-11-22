import React, { useEffect, useMemo, useState } from 'react'
import { Callout, Page, PageTitle } from '../components/ui'
import { loadPriceBook, loadPriceIndex } from '../features/portfolio-rebalance/data'
import { compareSet, runBacktest } from '../features/portfolio-rebalance/engine'
import { PortfolioForm } from '../features/portfolio-rebalance/components/PortfolioForm'
import { ConfigSummary } from '../features/portfolio-rebalance/components/ConfigSummary'
import { ResultsView } from '../features/portfolio-rebalance/components/ResultsView'
import { createDefaultInput, decode, encode } from '../features/portfolio-rebalance/urlState'
import type { CompareSet, PriceBook, PriceIndex, RunInput, RunResult } from '../features/portfolio-rebalance/types'
import '../styles/portfolio-rebalance.css'

type IndexLoad =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ok'; index: PriceIndex }

type PriceLoad =
  | { state: 'idle' | 'loading' }
  | { state: 'error'; key: string; message: string }
  | { state: 'ok'; key: string; book: PriceBook }

type Computation = { comparison: CompareSet; baseline?: RunResult } | { error: string } | null

function requiredSymbols(input: RunInput, index: PriceIndex | null): string[] {
  const benchmarks = ['QQQ', 'QQEW'].filter(symbol => !index || index.items.some(item => item.symbol === symbol))
  const signal = input.switch ? [input.signal ?? 'QQQ'] : []
  return [...new Set([...input.symbols, ...benchmarks, ...signal])]
}

function commonStart(index: PriceIndex, symbols: string[]): string {
  return symbols.map(symbol => index.items.find(item => item.symbol === symbol)?.first ?? '').sort().at(-1) ?? ''
}

export default function PortfolioRebalanceLab(): JSX.Element {
  const [load, setLoad] = useState<IndexLoad>({ state: 'loading' })
  const [retry, setRetry] = useState(0)
  const [priceRetry, setPriceRetry] = useState(0)
  const [draft, setDraft] = useState<RunInput>(createDefaultInput)
  const [applied, setApplied] = useState<RunInput | null>(null)
  const [prices, setPrices] = useState<PriceLoad>({ state: 'idle' })
  const [invalidLink, setInvalidLink] = useState(false)
  const [formOpen, setFormOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    loadPriceIndex().then(index => {
      if (controller.signal.aborted) return
      const decoded = decode(new URLSearchParams(window.location.search), index.items.map(item => item.symbol))
      const initial = { ...decoded.input, start: decoded.input.start ?? commonStart(index, decoded.input.symbols) }
      setDraft(initial)
      setApplied(initial)
      setInvalidLink(decoded.invalid)
      setLoad({ state: 'ok', index })
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoad({ state: 'error', message: error instanceof Error ? error.message : '网络错误' })
    })
    return () => controller.abort()
  }, [retry])

  const index = load.state === 'ok' ? load.index : null
  const draftCommonStart = useMemo(() => index ? commonStart(index, draft.symbols) : '', [draft.symbols, index])
  const requestKey = applied ? requiredSymbols(applied, index).join(',') : ''

  useEffect(() => {
    if (!applied) return
    const controller = new AbortController()
    const key = requiredSymbols(applied, index).join(',')
    setPrices({ state: 'loading' })
    loadPriceBook(requiredSymbols(applied, index)).then(book => {
      if (!controller.signal.aborted) setPrices({ state: 'ok', key, book })
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setPrices({ state: 'error', key, message: error instanceof Error ? error.message : '网络错误' })
    })
    return () => controller.abort()
  }, [applied, index, priceRetry])

  const computation = useMemo<Computation>(() => {
    if (!applied || prices.state !== 'ok' || prices.key !== requestKey) return null
    try {
      const comparison = compareSet(prices.book, applied)
      const baseline = applied.switch ? runBacktest(prices.book, { ...applied, switch: undefined }) : undefined
      return { comparison, baseline }
    } catch (error) {
      return { error: error instanceof Error ? error.message : '输入或数据不符合计算要求' }
    }
  }, [applied, prices, requestKey])

  useEffect(() => {
    if (!index) return
    const query = encode(draft).toString()
    window.history.replaceState(null, '', `${window.location.pathname}?${query}${window.location.hash}`)
  }, [draft, index])

  const submit = (): void => {
    setApplied({ ...draft, start: draft.start ?? draftCommonStart })
    setFormOpen(false)
    const scroll = (): void => {
      const results = document.getElementById('pr-results')
      if (results && typeof results.scrollIntoView === 'function') results.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(scroll)
    else scroll()
  }

  return (
    <Page className="portfolio-rebalance-page">
      <PageTitle>组合再平衡回测</PageTitle>
      <header className="pr-intro">
        <h2>组合再平衡回测</h2>
        <p>设定目标权重与再平衡规则，对照不动、等权与纳指 100。看清收益、回撤、调仓代价，以及当前离触发线还有多远。</p>
      </header>
      {invalidLink && <Callout tone="warn" title="链接中的部分设置无效，已恢复默认">请核对代码、权重、规则与日期后重新计算。</Callout>}
      {load.state === 'loading' && <p className="pr-loading" role="status">正在加载可选代码与数据状态…</p>}
      {load.state === 'error' && <Callout tone="danger" title="价格数据暂时无法加载"><p>{load.message}。请检查网络后重试。</p><button type="button" className="btn-ghost" onClick={() => { setLoad({ state: 'loading' }); setRetry(value => value + 1) }}>重试</button></Callout>}
      {index && (formOpen
        ? <section className="pr-workbench" aria-label="组合回测设置"><PortfolioForm index={index} value={draft} onChange={setDraft} onSubmit={submit} defaultStart={draftCommonStart} /></section>
        : <ConfigSummary input={draft} onEdit={() => setFormOpen(true)} />)}
      {applied && prices.state === 'loading' && <p className="pr-loading" role="status">正在读取所选代码并计算…</p>}
      {applied && prices.state === 'error' && prices.key === requestKey && <Callout tone="danger" title="所选价格数据暂时无法加载"><p>{prices.message}。请稍后重试。</p><button type="button" className="btn-ghost" onClick={() => setPriceRetry(value => value + 1)}>重试</button></Callout>}
      {computation && 'error' in computation && <Callout tone="danger" title="回测计算未完成">{computation.error}。请调整输入后重新计算。</Callout>}
      {computation && 'comparison' in computation && index && <ResultsView comparison={computation.comparison} baseline={computation.baseline} index={index} input={applied ?? draft} />}
    </Page>
  )
}
