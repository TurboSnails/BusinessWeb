import React, { lazy, Suspense, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { OverviewTab } from '../components/monitor/OverviewTab'
import { IndicatorsTab } from '../components/monitor/IndicatorsTab'
import { TemperatureTab } from '../components/monitor/TemperatureTab'
import { ChinaTemperatureTab } from '../components/monitor/ChinaTemperatureTab'
import { StagesTab } from '../components/monitor/StagesTab'
import { ExecutionTab } from '../components/monitor/ExecutionTab'
import { USMonitorTab } from '../components/monitor/USMonitorTab'
import { ChinaStockTab } from '../components/monitor/ChinaStockTab'
import { PageTabs, PageTitle, Segmented, type TabItem } from '../components/ui/PageTabs'
import { CyclesView } from '../features/macro/CycleViews'
import { ChinaView, GuideView, HkView, OverviewView, StagesView, UsView } from '../features/macro/MacroViews'
import type { MacroSnapshot } from '../features/macro/indicators'
import type { CnKey } from '../features/macro/china'
import type { HkKey } from '../features/macro/hk'
import { LoadError, Page } from '../components/ui'
import VerdictBar from '../features/combined-strategy/VerdictBar'
import { stageFromSnapshot } from '../features/macro/indicators'
import { PageDataFreshness } from '../components/ui/PageDataFreshness'
import '../styles/monitor.css'

const MarketCycleView = lazy(() => import('../features/market-cycle/MarketCycleView'))
const UsMarketView = lazy(() => import('../features/us-market/UsMarketView'))
const CnMarketView = lazy(() => import('../features/cn-market/CnMarketView'))

type TabId = 'overview' | 'us-market' | 'cn-market' | 'us' | 'cn' | 'hk' | 'market-cycle' | 'cycles' | 'method'
type MethodId = 'stages' | 'guide' | 'archive'
const LEGACY_METHOD = new Set<string>(['stages', 'guide', 'archive'])

const TABS: TabItem<TabId>[] = [
  { id: 'overview', label: '温度总览' },
  { id: 'us-market', label: '美股市场', group: '市场', shortLabel: '美股' },
  { id: 'cn-market', label: '中国市场', group: '市场', shortLabel: '中国市场' },
  { id: 'us', label: '美国宏观', group: '宏观', shortLabel: '美国' },
  { id: 'cn', label: '中国宏观', group: '宏观', shortLabel: '中国宏观' },
  { id: 'hk', label: '港股宏观', group: '宏观', shortLabel: '港股' },
  { id: 'market-cycle', label: '牛熊周期', group: '周期' },
  { id: 'cycles', label: '周期位置', group: '周期' },
  { id: 'method', label: '方法' },
]

const METHOD_ITEMS: TabItem<MethodId>[] = [
  { id: 'stages', label: '阶段与动作' },
  { id: 'guide', label: '指标说明' },
  { id: 'archive', label: '旧版存档' },
]

// 旧版内容以期权情绪、做空与个股仓位为主，和书中方法不一致；保留原样，仅供查阅
type ArchiveId = 'execution' | 'stages' | 'us-monitor' | 'overview' | 'china-stock' | 'indicators' | 'temperature' | 'china-temperature'
const ARCHIVE: (TabItem<ArchiveId> & { el: () => JSX.Element })[] = [
  { id: 'execution', label: '日常执行', el: () => <ExecutionTab /> },
  { id: 'stages', label: '阶段划分', el: () => <StagesTab /> },
  { id: 'us-monitor', label: '美经监控', el: () => <USMonitorTab /> },
  { id: 'overview', label: '投资总纲', el: () => <OverviewTab /> },
  { id: 'china-stock', label: '中股投资', el: () => <ChinaStockTab /> },
  { id: 'indicators', label: '指标体系', el: () => <IndicatorsTab /> },
  { id: 'temperature', label: '美经温度', el: () => <TemperatureTab /> },
  { id: 'china-temperature', label: '中经温度', el: () => <ChinaTemperatureTab /> },
]

// 快照只请求一次，切走再回来直接用
type Snapshots = { us: MacroSnapshot; cn: MacroSnapshot<CnKey> | null; hk: MacroSnapshot<HkKey> | null }
let snapshotCache: Snapshots | null = null
const load = (file: string, init?: RequestInit) => fetch(`${import.meta.env.BASE_URL}data/${file}`, init).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
// 本地开发由 Vite 中间件在本机拉取；Vercel 走同源函数；GitHub Pages 通过 VITE_API_BASE 调 Vercel
const apiBase = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

/** 实时结果覆盖快照；某项没拉到时沿用快照里的旧值 */
export function mergeSnapshot<T extends MacroSnapshot<string>>(old: T | null, fresh: T | undefined): T | null {
  if (!fresh || !Object.keys(fresh.series).length) return old
  const series = { ...(old?.series ?? {}), ...fresh.series }
  for (const [key, previous] of Object.entries(old?.series ?? {})) {
    const incoming = fresh.series[key]
    if (previous.long && incoming && (!incoming.long || incoming.long.length < previous.long.length)) series[key] = { ...incoming, long: previous.long }
  }
  return { ...fresh, series } as T
}
const timeText = (iso: string) => new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function Monitor(): JSX.Element {
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const redirectToValuation = tabParam === 'valuation'
  const redirectToSpread = tabParam === 'spread'
  const legacyMethod = !redirectToValuation && !redirectToSpread && LEGACY_METHOD.has(tabParam ?? '')
    ? (tabParam as MethodId)
    : null
  const tab: TabId = legacyMethod
    ? 'method'
    : TABS.some(t => t.id === tabParam) ? (tabParam as TabId) : 'overview'
  const methodParam = params.get('m')
  const method: MethodId = legacyMethod
    ?? (METHOD_ITEMS.some(m => m.id === methodParam) ? (methodParam as MethodId) : 'stages')
  const archiveParam = params.get('old')
  const archive: ArchiveId = ARCHIVE.some(a => a.id === archiveParam) ? (archiveParam as ArchiveId) : 'execution'
  const [data, setData] = useState<Snapshots | null>(snapshotCache)
  const [error, setError] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState('')
  const loadsMacro = !redirectToValuation && !redirectToSpread && tab !== 'us-market' && tab !== 'cn-market'

  const retrySnapshots = (): void => {
    snapshotCache = null
    setData(null)
    setError('')
    setRetryKey(n => n + 1)
  }

  /** 拉取实时数据；成功返回新快照（AI 解读会先调用它，保证解读的是最新数据） */
  const refresh = async (): Promise<Snapshots | null> => {
    setRefreshing(true); setNotice('')
    try {
      const res = await fetch(`${apiBase}/api/macro`, { cache: 'no-store' })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.us) throw new Error(body?.error || '数据源暂时不可用')
      const us = mergeSnapshot(data?.us ?? null, body.us)!
      snapshotCache = { us, cn: mergeSnapshot(data?.cn ?? null, body.cn), hk: mergeSnapshot(data?.hk ?? null, body.hk) }
      setData(snapshotCache)
      const missing = (body.warnings as string[] | undefined)?.length ?? 0
      setNotice(`已刷新：实时数据拉取于 ${timeText(body.us.fetchedAt)}${missing ? `；${missing} 项没拉到，沿用快照` : ''}`)
      return snapshotCache
    } catch (e) {
      setNotice(`刷新失败：${e instanceof Error ? e.message : '数据源暂时不可用'}，仍显示快照数据`)
      return null
    } finally { setRefreshing(false) }
  }

  useEffect(() => {
    if (snapshotCache || !loadsMacro) return
    // 中国数据失败不影响美国部分
    Promise.all([load('macro-us.json'), load('macro-cn.json').catch(() => null), load('macro-hk.json').catch(() => null)])
      .then(([us, cn, hk]: [MacroSnapshot, MacroSnapshot<CnKey> | null, MacroSnapshot<HkKey> | null]) => { snapshotCache = { us, cn, hk }; setData(snapshotCache) })
      .catch(() => setError('宏观数据加载失败'))
  }, [loadsMacro, retryKey])

  const go = (patch: Record<string, string | null>): void => setParams(prev => {
    const next = new URLSearchParams(prev)
    Object.entries(patch).forEach(([k, v]) => (v === null ? next.delete(k) : next.set(k, v)))
    return next
  }, { replace: true })

  if (redirectToValuation) {
    return <Navigate to="/invest/index-valuation" replace />
  }
  if (redirectToSpread) {
    const next = new URLSearchParams()
    next.set('tab', 'spread')
    const mkt = params.get('mkt')
    if (mkt) next.set('mkt', mkt)
    return <Navigate to={`/invest/index-valuation?${next}`} replace />
  }

  const needsData = tab !== 'method' && tab !== 'market-cycle' && tab !== 'us-market' && tab !== 'cn-market'
    || (tab === 'method' && method !== 'archive')
  const snap = data?.us
  const stage = snap ? stageFromSnapshot(snap).stage : undefined
  return (
    <Page>
      <PageTitle>宏观温度</PageTitle>
      <VerdictBar stage={stage} />
      <PageTabs
        label="宏观温度栏目"
        items={TABS}
        value={tab}
        onChange={id => go({ tab: id === 'overview' ? null : id, old: null, m: null })}
      />
      {needsData && snap && <PageDataFreshness checkedAt={[data.us, data.cn, data.hk].map(section => section?.checkedAt ?? section?.fetchedAt).filter(Boolean).sort().at(-1)} dataLabel="指标观测日期" dataDates={[...Object.values(snap.series).map(series => series.latest.date), ...Object.values(data?.cn?.series ?? {}).map(series => series.latest.date), ...Object.values(data?.hk?.series ?? {}).map(series => series.latest.date)]} note="各指标观测日期不同；页面显示本次核验日与可用数据日期。" />}
      <div>
        {tab === 'cn-market' && <Suspense fallback={<p role="status">正在加载中国市场…</p>}><CnMarketView /></Suspense>}
        {tab === 'us-market' && <Suspense fallback={<p role="status">正在加载美股市场…</p>}><UsMarketView /></Suspense>}
        {tab === 'market-cycle' && <Suspense fallback={<p role="status">正在加载牛熊周期面板…</p>}><MarketCycleView /></Suspense>}
        {needsData && !snap && (error
          ? <LoadError reason="宏观温度这份读数现在拿不到。" detail={error} onRetry={retrySnapshots} />
          : <p role="status" className="macro-muted">正在加载宏观数据…</p>)}
        {snap && needsData && (
          <div className="page-toolbar">
            <span className="page-toolbar__note" role="status">{notice || (snap.fetchedAt ? `实时数据 · 拉取于 ${timeText(snap.fetchedAt)}` : `当前为 ${snap.generatedAt} 的快照，可刷新获取最新读数`)}</span>
            <button type="button" className="tool-btn tool-btn--primary" onClick={() => void refresh()} disabled={refreshing}>
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />{refreshing ? '正在拉取…' : '刷新最新数据'}
            </button>
          </div>
        )}
        {snap && tab === 'overview' && <OverviewView snap={snap} cn={data.cn} hk={data.hk} onRefresh={refresh} />}
        {snap && tab === 'us' && <UsView snap={snap} />}
        {snap && tab === 'cn' && (data.cn ? <ChinaView snap={data.cn} /> : <LoadError reason="中国宏观数据这份读数现在拿不到。" onRetry={retrySnapshots} />)}
        {snap && tab === 'hk' && (data.hk ? <HkView snap={data.hk} /> : <LoadError reason="港股宏观数据这份读数现在拿不到。" onRetry={retrySnapshots} />)}
        {snap && tab === 'cycles' && <CyclesView us={snap} cn={data.cn} />}
        {tab === 'method' && (
          <>
            <Segmented
              label="方法子栏目"
              items={METHOD_ITEMS}
              value={method}
              onChange={id => go({
                tab: 'method',
                m: id === 'stages' ? null : id,
                old: id === 'archive' ? archive : null,
              })}
            />
            {snap && method === 'stages' && <StagesView snap={snap} />}
            {snap && method === 'guide' && <GuideView snap={snap} cn={data.cn} hk={data.hk} />}
            {method === 'archive' && (
              <>
                <p className="macro-archive-note" role="note">
                  已停用：旧版以期权情绪（Put/Call、Gamma）、做空工具和具体个股仓位为主，数据停在 2025 年底，和书中「不预测、不做空、不加杠杆」的方法不一致。保留原样，仅供回看，不再更新。
                </p>
                <Segmented label="旧版栏目" items={ARCHIVE} value={archive} onChange={id => go({ old: id })} />
                <div className="ui-card">
                  {ARCHIVE.find(a => a.id === archive)!.el()}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Page>
  )
}
