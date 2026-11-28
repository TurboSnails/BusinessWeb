import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Callout } from '../../components/ui'
import { stockLookupApi } from './api'
import type { AnalystData, NewsItem, Quote, StockLookupApi } from './types'
import { AnalystTablePanel } from './panels/AnalystTablePanel'
import { EarningsPanel } from './panels/EarningsPanel'
import { InsiderPanel } from './panels/InsiderPanel'
import { NewsCenter } from './panels/NewsCenter'
import { OffExchangePanel } from './panels/OffExchangePanel'
import { OptionsPanel } from './panels/OptionsPanel'
import { QuoteHeader } from './panels/QuoteHeader'
import { RatingDistribution } from './panels/RatingDistribution'
import { ShortInterestPanel } from './panels/ShortInterestPanel'
import { SymbolSearch } from './panels/SymbolSearch'
import { parseLookupSymbol } from './panels/symbolParse'
import './stock-lookup.css'

const ChartWorkbench = lazy(() => import('./chart/ChartWorkbench'))

export interface StockLookupProps {
  /** 测试注入；默认 stockLookupApi。开发环境可用 ?demo=1（生产忽略） */
  api?: StockLookupApi
}

/** 导出给测试：生产模式下 demo 查询参数不得启用演示 api */
export function resolveLookupApi(
  apiProp: StockLookupApi | undefined,
  opts: { demoParam: boolean; isDev: boolean; demoApi: StockLookupApi | null },
): { api: StockLookupApi; usingDemo: boolean } {
  if (apiProp) return { api: apiProp, usingDemo: false }
  if (opts.demoParam && opts.isDev && opts.demoApi) return { api: opts.demoApi, usingDemo: true }
  return { api: stockLookupApi, usingDemo: false }
}

export default function StockLookup({ api: apiProp }: StockLookupProps = {}): JSX.Element {
  const [params, setParams] = useSearchParams()
  const rawS = params.get('s')
  const symbol = useMemo(() => {
    if (!rawS) return null
    const trimmed = rawS.trim()
    if (!trimmed) return null
    return parseLookupSymbol(trimmed)?.symbol ?? trimmed
  }, [rawS])
  const wantDemo = params.get('demo') === '1'
  const [demoApi, setDemoApi] = useState<StockLookupApi | null>(null)

  // 仅 DEV 动态加载演示 api，生产构建不把 demoApi 打进默认路径
  useEffect(() => {
    if (!wantDemo || !import.meta.env.DEV || apiProp) {
      setDemoApi(null)
      return
    }
    let cancelled = false
    void import('./panels/demoApi').then(mod => {
      if (!cancelled) setDemoApi(mod.createDemoApi())
    })
    return () => { cancelled = true }
  }, [wantDemo, apiProp])

  const { api, usingDemo } = useMemo(
    () => resolveLookupApi(apiProp, {
      demoParam: wantDemo,
      isDev: import.meta.env.DEV,
      demoApi,
    }),
    [apiProp, wantDemo, demoApi],
  )

  const [quote, setQuote] = useState<Quote | null>(null)
  const [news, setNews] = useState<NewsItem[]>([])
  const [analysts, setAnalysts] = useState<AnalystData | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)

  const setSymbol = useCallback((next: string): void => {
    setParams(prev => {
      const p = new URLSearchParams(prev)
      p.set('tab', 'lookup')
      p.set('s', next)
      return p
    }, { replace: true })
    setQuote(null)
    setNews([])
    setAnalysts(null)
    setHighlightId(null)
  }, [setParams])

  const onQuote = useCallback((q: Quote | null) => setQuote(q), [])
  const onNewsItems = useCallback((items: NewsItem[]) => setNews(items), [])
  const onAnalysts = useCallback((d: AnalystData | null) => setAnalysts(d), [])

  return (
    <div className="sl-page">
      {usingDemo ? (
        <Callout tone="warn" title="演示数据，非真实行情" className="sl-demo-banner">
          当前为开发环境演示接口：机构、媒体、人物与新闻均为虚构样本，不代表真实市场。去掉网址中的 demo 参数可走公开接口。
        </Callout>
      ) : null}
      <SymbolSearch api={api} onSelect={sym => setSymbol(sym)} showExamples={!symbol} />
      {!symbol && (
        <p className="sl-intro">
          输入美股裸代码（如 MRVL）、港股 hk00700、或沪深 sh600519 / sz000858，查看行情、新闻、场外成交与分析师评级；美股另有财报预期、内部人交易、空头持仓与期权概况。公开数据整理，不构成买卖建议。
        </p>
      )}
      {symbol && (
        <>
          <QuoteHeader symbol={symbol} api={api} quote={quote} onQuote={onQuote} />
          <Suspense fallback={<div className="sl-chart-placeholder" role="status">正在加载图表…</div>}>
            <ChartWorkbench
              symbol={symbol}
              api={api}
              timezone={quote?.timezone ?? 'America/New_York'}
              news={news}
              onSelectNews={id => setHighlightId(id)}
            />
          </Suspense>
          <NewsCenter
            symbol={symbol}
            api={api}
            timezone={quote?.timezone ?? 'America/New_York'}
            highlightId={highlightId}
            onItems={onNewsItems}
          />
          <OffExchangePanel symbol={symbol} api={api} />
          <RatingDistribution symbol={symbol} api={api} data={analysts} onData={onAnalysts} />
          <AnalystTablePanel symbol={symbol} data={analysts} currentPrice={quote?.price} />
          <EarningsPanel symbol={symbol} api={api} />
          <InsiderPanel symbol={symbol} api={api} />
          <ShortInterestPanel symbol={symbol} api={api} />
          <OptionsPanel symbol={symbol} api={api} />
        </>
      )}
    </div>
  )
}
