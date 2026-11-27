import React, { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageTabs, PageTitle, Segmented, type TabItem } from '../components/ui/PageTabs'
import { LoadError, Page } from '../components/ui'
import { PageDataFreshness } from '../components/ui/PageDataFreshness'
import SmartLink from '../components/SmartLink'
import { ValuationView } from '../features/macro/ValuationView'
import type { IndexSnapshot } from '../features/macro/valuation'
import { SpreadView } from '../features/macro/SpreadView'
import type { SpreadSnapshot } from '../features/macro/spread'
import { UsSpreadView } from '../features/macro/UsSpreadView'
import type { UsSpreadSnapshot } from '../features/macro/usSpread'
import '../styles/monitor.css'

type TabId = 'valuation' | 'spread'
const TABS: TabItem<TabId>[] = [
  { id: 'valuation', label: '估值位置' },
  { id: 'spread', label: '股债息差' },
]

type SpreadMarket = 'cn' | 'us'
const SPREAD_MARKETS: TabItem<SpreadMarket>[] = [
  { id: 'cn', label: 'A 股 · 沪深300' },
  { id: 'us', label: '美股 · 标普500' },
]

const load = (file: string, init?: RequestInit) =>
  fetch(`${import.meta.env.BASE_URL}data/${file}`, init).then(r => {
    if (!r.ok) throw new Error(String(r.status))
    return r.json()
  })

let indexCache: IndexSnapshot | null = null
let spreadCache: SpreadSnapshot | null = null
let usSpreadCache: UsSpreadSnapshot | null = null

/** 测试用：清掉模块级缓存，避免用例互相污染 */
export function resetIndexValuationCaches(): void {
  indexCache = null
  spreadCache = null
  usSpreadCache = null
}

export const INDEX_VALUATION_LEAD =
  '各大指数现在站在自己历史的什么位置，以及股票相对债券贵不贵。分位高说明相对过去偏贵，不是卖出信号。'

export default function IndexValuation(): JSX.Element {
  const [params, setParams] = useSearchParams()
  const [indexes, setIndexes] = useState<IndexSnapshot | null>(indexCache)
  const [indexError, setIndexError] = useState(false)
  const [spread, setSpread] = useState<SpreadSnapshot | null>(spreadCache)
  const [spreadError, setSpreadError] = useState(false)
  const [usSpread, setUsSpread] = useState<UsSpreadSnapshot | null>(usSpreadCache)
  const [usSpreadError, setUsSpreadError] = useState(false)
  const [indexRetry, setIndexRetry] = useState(0)
  const [spreadRetry, setSpreadRetry] = useState(0)
  const [usSpreadRetry, setUsSpreadRetry] = useState(0)
  const spreadMarket: SpreadMarket = params.get('mkt') === 'us' ? 'us' : 'cn'
  const tabParam = params.get('tab')
  const tab: TabId = TABS.some(t => t.id === tabParam) ? (tabParam as TabId) : 'valuation'

  const go = (patch: Record<string, string | null>): void => setParams(prev => {
    const next = new URLSearchParams(prev)
    Object.entries(patch).forEach(([k, v]) => (v === null ? next.delete(k) : next.set(k, v)))
    return next
  }, { replace: true })

  const retryIndexes = (): void => {
    indexCache = null
    setIndexes(null)
    setIndexError(false)
    setIndexRetry(n => n + 1)
  }
  const retrySpread = (): void => {
    spreadCache = null
    setSpread(null)
    setSpreadError(false)
    setSpreadRetry(n => n + 1)
  }
  const retryUsSpread = (): void => {
    usSpreadCache = null
    setUsSpread(null)
    setUsSpreadError(false)
    setUsSpreadRetry(n => n + 1)
  }

  useEffect(() => {
    if (tab !== 'valuation') return
    // 每次进页签都向服务器校验一次：数据文件会随更新变化，不能沿用浏览器或模块里的旧副本
    load('index-history.json', { cache: 'no-cache' })
      .then((d: IndexSnapshot) => { indexCache = d; setIndexes(d); setIndexError(false) })
      .catch(() => setIndexError(true))
  }, [tab, indexRetry])

  useEffect(() => {
    if (tab !== 'spread') return
    if (spreadMarket === 'us') {
      load('us-equity-bond-spread.json', { cache: 'no-cache' })
        .then((d: UsSpreadSnapshot) => { usSpreadCache = d; setUsSpread(d); setUsSpreadError(false) })
        .catch(() => setUsSpreadError(true))
    } else {
      load('equity-bond-spread.json', { cache: 'no-cache' })
        .then((d: SpreadSnapshot) => { spreadCache = d; setSpread(d); setSpreadError(false) })
        .catch(() => setSpreadError(true))
    }
  }, [tab, spreadMarket, spreadRetry, usSpreadRetry])

  return (
    <Page>
      <PageTitle>指数估值</PageTitle>
      <header className="page-head">
        <h1>指数估值</h1>
        <p data-testid="iv-head-lead">{INDEX_VALUATION_LEAD}</p>
        <p className="page-related" role="navigation" aria-label="相关页面">
          <SmartLink to="/index-panorama/">指数全景</SmartLink>
          <span aria-hidden="true"> · </span>
          <Link to="/invest/market-radar">市场雷达</Link>
          <span className="page-related__note">（估值只是其中一个维度）</span>
        </p>
      </header>
      <PageTabs
        label="指数估值栏目"
        items={TABS}
        value={tab}
        onChange={id => go({
          tab: id === 'valuation' ? null : id,
          mkt: id === 'spread' ? (spreadMarket === 'us' ? 'us' : null) : null,
        })}
      />
      {tab === 'valuation' && indexes && (
        <PageDataFreshness
          checkedAt={indexes.checkedAt}
          dataLabel="指数数据日期"
          dataDates={Object.values(indexes.indexes).flatMap(index => [index.latest.date, index.agg?.date])}
          note={`快照生成于 ${indexes.generatedAt}。`}
        />
      )}
      <div>
        {tab === 'valuation' && (
          indexes
            ? <ValuationView data={indexes} onData={d => { indexCache = d }} />
            : indexError
              ? <LoadError reason="指数估值这份读数现在拿不到。" onRetry={retryIndexes} />
              : <p role="status" className="macro-muted">正在加载指数数据…</p>
        )}
        {tab === 'spread' && (
          <>
            <div className="macro-spread__market">
              <Segmented
                label="股债息差市场"
                items={SPREAD_MARKETS}
                value={spreadMarket}
                onChange={id => go({ mkt: id === 'cn' ? null : id })}
              />
            </div>
            {spreadMarket === 'cn' && (
              spread
                ? <SpreadView data={spread} />
                : spreadError
                  ? <LoadError reason="股债息差这份读数现在拿不到。" onRetry={retrySpread} />
                  : <p role="status" className="macro-muted">正在加载股债息差数据…</p>
            )}
            {spreadMarket === 'us' && (
              usSpread
                ? <UsSpreadView data={usSpread} />
                : usSpreadError
                  ? <LoadError reason="美股股债息差这份读数现在拿不到。" onRetry={retryUsSpread} />
                  : <p role="status" className="macro-muted">正在加载美股股债息差数据…</p>
            )}
          </>
        )}
      </div>
    </Page>
  )
}
