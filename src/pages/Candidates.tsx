import React, { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ListChecks, Microscope } from 'lucide-react'
import CandidatePool from '../components/CandidatePool'
import { PageTabs, PageTitle } from '../components/ui/PageTabs'
import { DcfCell, DcfFilterChips } from '../components/DcfCell'
import { DCF_FILTERS, matchDcfFilter, type DcfFilterId } from '../features/dcf/filter'
import { Page } from '../components/ui'
import type { Company, Market } from '../data/companies'
import { valuationReliability } from '../features/company-valuation/model'
import { localDay } from '../components/DecisionDialog'
import { isReviewDue } from '../features/candidates/store'
import { candidateAlerts, priceAlertStates } from '../features/candidates/alerts'
import { addDays, priceObservations, SNOOZE_DAYS, VENUE_CURRENCY, type PriceObservation } from '../features/candidates/priceAlert'
import CandidateAlerts from '../components/CandidateAlerts'
import WeeklyChanges from '../components/WeeklyChanges'
import EarningsSoonList from '../components/EarningsSoonList'
import { useEarningsCalendar } from '../features/earnings/loadCalendar'
import type { ResearchSummary } from '../data/futureTrendsResearch'
import { useCandidates } from '../features/candidates/useCandidates'
import { autoDcfOf, dcfOf, MARKET_LABEL, researchToCandidate, toolProgress, venueOf } from '../features/candidates/links'
import { useToolSources } from '../features/candidates/useToolSources'
import MarketCompaniesLoader, { type MarketCompaniesSlice } from '../features/candidates/MarketCompaniesLoader'
import { marketsForTab, RESEARCH_US_MARKETS } from '../features/candidates/marketsNeeded'
import '../styles/candidates.css'

type TabId = 'mine' | 'research'

const FutureTrendsPool = lazy(() => import('./FutureTrendsPool'))

export default function Candidates(): JSX.Element {
  const [params, setParams] = useSearchParams()
  const tab: TabId = params.get('tab') === 'research' ? 'research' : 'mine'
  // 切页签时只保留各自的筛选参数，避免「研究筛出」的 view/market 残留在「我的候选」
  const setTab = (next: TabId): void => setParams(next === 'mine' ? {} : { tab: 'research' }, { replace: true })

  const cand = useCandidates(true)
  const neededMarkets = useMemo(() => marketsForTab(tab, cand.items), [tab, cand.items])
  const [slices, setSlices] = useState<Partial<Record<Market, MarketCompaniesSlice>>>({})
  const onMarketUpdate = useCallback((market: Market, slice: MarketCompaniesSlice | undefined) => {
    setSlices(prev => (prev[market] === slice ? prev : { ...prev, [market]: slice }))
  }, [])

  const companies = useMemo(() => {
    const out: Company[] = []
    for (const m of neededMarkets) {
      const list = slices[m]?.list
      if (list) out.push(...list)
    }
    return out
  }, [neededMarkets, slices])

  const usLists = useMemo(() => ({
    us: new Set((slices.us?.list ?? []).map(c => c.code)),
    ndx: new Set((slices.ndx?.list ?? []).map(c => c.code)),
  }), [slices.us, slices.ndx])

  const usMarketsLoading = tab === 'research' && RESEARCH_US_MARKETS.some(m => slices[m]?.loading !== false)

  // 从估值、DCF、网格页回来时重新读取本机记录，进度立即更新
  const tools = useToolSources()

  const dcfF = DCF_FILTERS.find(f => f.id === params.get('dcf'))?.id ?? 'all'
  const setDcfF = (value: DcfFilterId): void => {
    const next = new URLSearchParams(params)
    if (value === 'all') next.delete('dcf')
    else next.set('dcf', value)
    next.delete('page')
    setParams(next)
  }
  const valued = cand.items.filter(i => { const p = toolProgress(i.market, i.code, tools); return p.dcf || p.valuation }).length
  const today = localDay()
  const due = cand.items.filter(i => isReviewDue(i, today)).length
  const recorded = cand.items.filter(i => i.decisions?.length).length
  // 价位提醒的另一个价格来源：公司页价格锚点（带行情日期）；自动 DCF 预填库的现价由 alerts.ts 自己读
  const anchorPrices = useMemo(() => new Map<string, PriceObservation[]>(companies.filter(c => c.marketRefresh).map(c => [`${c.market}:${c.code}`,
    priceObservations({ venueCurrency: VENUE_CURRENCY[venueOf(c.market)], marketRefresh: c.marketRefresh })])), [companies])
  const valuationReliabilityByCode = useMemo(() => new Map(companies.filter(c => c.valuation).map(c => {
    const refreshed = c.marketRefresh?.tradability === 'unverified' ? undefined : c.marketRefresh
    return [`${c.market}:${c.code}`, valuationReliability(c.valuation!, refreshed).ok] as const
  })), [companies])
  const alerts = useMemo(() => candidateAlerts(cand.items, tools, today, new Map(companies.map(c => [`${c.market}:${c.code}`, c.rating])), anchorPrices, valuationReliabilityByCode), [cand.items, tools, today, companies, anchorPrices, valuationReliabilityByCode])
  // 本周变化里的「本周触及条件价」：与今日待处理同一价格来源（自动 DCF 预填库收盘价 + 公司页价格锚点）
  const weeklyObservations = useMemo(() => new Map<string, PriceObservation[]>(cand.items.filter(i => i.alert).map(i => [`${i.market}:${i.code}`, [
    ...priceObservations({ venueCurrency: VENUE_CURRENCY[venueOf(i.market)], autoDcf: autoDcfOf(i.market, i.code, tools) }), ...(anchorPrices.get(`${i.market}:${i.code}`) ?? []),
  ]])), [cand.items, tools, anchorPrices])
  const alertStates = useMemo(() => priceAlertStates(cand.items, tools, today, anchorPrices, valuationReliabilityByCode), [cand.items, tools, today, anchorPrices, valuationReliabilityByCode])
  const pausedAlerts = [...alertStates.values()].filter(r => r.status === 'skipped' && (r.reason === 'stale' || r.reason === 'currency-mismatch' || r.reason === 'no-price' || r.reason === 'valuation-unreliable')).length
  const pendingLibraries = neededMarkets.filter(m => slices[m]?.loading !== false).map(m => MARKET_LABEL[m])
  const failedLibraries = neededMarkets.filter(m => slices[m]?.failed).map(m => MARKET_LABEL[m])
  const alertCoverage = [
    pendingLibraries.length && `正在读取${pendingLibraries.join('、')}公司资料。`,
    failedLibraries.length && `${failedLibraries.join('、')}公司资料未能读取。`,
    !tools.auto ? '正在读取自动 DCF。' : !tools.auto.size && '暂无可用的自动 DCF 数据。',
  ].filter(Boolean).join('')
  // 财报临近：与「本周变化」的下周财报共用一次 earnings-calendar.json 请求（模块级缓存）
  const { cal: earningsCal } = useEarningsCalendar(tab === 'mine' && cand.items.length > 0)

  // 研究筛出按 DCF 筛选：对应不上四个市场的公司没有 DCF 记录，只在「全部」和「未算」里出现
  const dcfFilter = (r: ResearchSummary): boolean => {
    if (dcfF === 'all') return true
    const t = researchToCandidate(r, usLists)
    return matchDcfFilter(dcfF, t ? dcfOf(t.market, t.code, tools) : undefined)
  }

  const addAction = (r: ResearchSummary): React.ReactNode => {
    const target = researchToCandidate(r, usLists)
    if (!target) return <span className="cand-add cand-add--off" title="目前只支持美股、港股与 A 股">该市场暂不支持</span>
    const on = cand.items.some(i => i.market === target.market && i.code === target.code)
    return (
      <>
      <DcfCell market={target.market} code={target.code} name={r.name} tools={tools} />
      <button type="button" className="cand-add" aria-pressed={on} aria-label={`${on ? '移出我的池' : '加入我的池'} ${r.name}`}
        onClick={() => cand.toggle(target.market, target.code)}>
        {on ? '✓ 已在我的池' : '＋ 加入我的池'}
        <span className="visually-hidden">（{MARKET_LABEL[target.market]}）</span>
      </button>
      </>
    )
  }

  return (
    <Page className="cand-page">
      {neededMarkets.map(m => (
        <MarketCompaniesLoader key={m} market={m} onUpdate={onMarketUpdate} />
      ))}
      <PageTitle>候选池</PageTitle>
      <p className="cand-lead">分析筛选之后的落脚点：研究筛出的公司和你自己挑的公司都在这里。逐家估值、写下等待的条件，价格到了再按计划执行。筛选顺序见<Link to="/investment-plan-2026?tab=screening">投资计划 · 选股流程</Link>。</p>

      {cand.items.length > 0 ? (
        <dl className="cand-stats" aria-label="候选池概况">
          <div><dt>我的候选</dt><dd>{cand.items.length}<small> 家</small></dd></div>
          <div><dt>已做估值</dt><dd>{valued}<small> / {cand.items.length}</small></dd></div>
          <div><dt>有决策记录</dt><dd>{recorded}<small> / {cand.items.length}</small></dd></div>
          <div className={due ? 'is-due' : undefined}><dt>到期待复查</dt><dd>{due}<small> 家</small></dd></div>
        </dl>
      ) : null}

      <PageTabs label="候选池视图" value={tab} onChange={setTab} items={[
        { id: 'mine', label: `我的候选 · ${cand.items.length}`, icon: <ListChecks size={14} /> },
        { id: 'research', label: '研究筛出', icon: <Microscope size={14} /> },
      ]} />

      {tab === 'mine' ? (
        <>
          {cand.items.length === 0 && (cand.state === 'syncing' ? (
            <p className="cand-buyable" role="status">正在同步候选…</p>
          ) : (
            <section className="cand-empty" aria-label="空候选池">
              <p>候选池还是空的。</p>
              <div className="cand-empty__actions">
                <Link to="/research-notes" className="tool-btn tool-btn--primary">去公司研究挑公司</Link>
                <button type="button" className="tool-btn" onClick={() => setTab('research')}>看研究筛出的公司</button>
              </div>
            </section>
          ))}
          <ol className="cand-flow" aria-label="使用流程">
            <li><strong>挑公司</strong>在<Link to="/research-notes">公司研究</Link>点「加入候选」，或在「研究筛出」里加入</li>
            <li><strong>写记录</strong>点「写决策记录」：为什么买、什么情况说明错了、下次检查日；到期会标出「待复查」</li>
            <li><strong>算价格</strong>点「估值」「DCF」，代码和市场自动带入；结果回到这里显示</li>
            <li><strong>管节奏</strong>A 股和 ETF 可以直接进「网格」回测</li>
          </ol>
          {cand.items.length > 0 && pendingLibraries.length > 0 && (
            <p className="cand-buyable" role="status">正在加载公司资料…</p>
          )}
          {cand.items.length > 0 && <WeeklyChanges items={cand.items} companies={companies} observations={weeklyObservations} />}
          {cand.items.length > 0 && <EarningsSoonList items={cand.items} cal={earningsCal} today={today} />}
          {cand.items.length > 0 && <CandidateAlerts alerts={alerts} companies={companies} paused={pausedAlerts} coverage={alertCoverage}
            onSeen={a => cand.markAlertSeen(a.market, a.code)} onSnooze={a => cand.snoozeAlert(a.market, a.code, addDays(today, SNOOZE_DAYS))} />}
          <CandidatePool items={cand.items} companies={companies} companiesLoading={pendingLibraries.length > 0} tools={tools} state={cand.state} message={cand.message} localError={cand.localError} onRetryLocal={cand.retryLocal}
            onMove={cand.move} onRemove={i => cand.remove(i.market, i.code)} onDecision={(i, r) => cand.addDecision(i.market, i.code, r)} onNote={(i, t) => cand.setNote(i.market, i.code, t)}
            onClear={cand.clear} onConnect={cand.connect} onRetry={cand.retry}
            onAlert={(i, rule) => cand.setAlert(i.market, i.code, rule)} alertStates={alertStates} />
        </>
      ) : (
        <div className="cand-research">
          {cand.localError && <p role="alert" className="rn-warn-text">{cand.localError} <button type="button" className="tool-btn" onClick={cand.retryLocal}>重试本机保存</button></p>}
          <Suspense fallback={<p className="cand-buyable" role="status">正在加载…</p>}>
            <FutureTrendsPool loading={usMarketsLoading} action={addAction} filter={dcfFilter} toolbar={<div className="ui-cluster"><DcfFilterChips value={dcfF} onChange={setDcfF} className="ui-cluster" /></div>} />
          </Suspense>
        </div>
      )}
    </Page>
  )
}
