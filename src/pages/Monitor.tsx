import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { OverviewTab } from '../components/monitor/OverviewTab'
import { IndicatorsTab } from '../components/monitor/IndicatorsTab'
import { TemperatureTab } from '../components/monitor/TemperatureTab'
import { ChinaTemperatureTab } from '../components/monitor/ChinaTemperatureTab'
import { StagesTab } from '../components/monitor/StagesTab'
import { ExecutionTab } from '../components/monitor/ExecutionTab'
import { USMonitorTab } from '../components/monitor/USMonitorTab'
import { ChinaStockTab } from '../components/monitor/ChinaStockTab'
import { PageTabs, PageTitle, Segmented, type TabItem } from '../components/ui/PageTabs'
import { ChinaView, GuideView, OverviewView, StagesView, UsView } from '../features/macro/MacroViews'
import type { MacroSnapshot } from '../features/macro/indicators'
import type { CnKey } from '../features/macro/china'

type TabId = 'overview' | 'us' | 'cn' | 'stages' | 'guide' | 'archive'
const TABS: TabItem<TabId>[] = [
  { id: 'overview', label: '温度总览' },
  { id: 'us', label: '美国宏观' },
  { id: 'cn', label: '中国宏观' },
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
type Snapshots = { us: MacroSnapshot; cn: MacroSnapshot<CnKey> | null }
let snapshotCache: Snapshots | null = null
const load = (file: string) => fetch(`${import.meta.env.BASE_URL}data/${file}`).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })

export default function Monitor(): JSX.Element {
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab: TabId = TABS.some(t => t.id === tabParam) ? (tabParam as TabId) : 'overview'
  const archiveParam = params.get('old')
  const archive: ArchiveId = ARCHIVE.some(a => a.id === archiveParam) ? (archiveParam as ArchiveId) : 'execution'
  const [data, setData] = useState<Snapshots | null>(snapshotCache)
  const [error, setError] = useState('')

  useEffect(() => {
    if (snapshotCache) return
    // 中国数据失败不影响美国部分
    Promise.all([load('macro-us.json'), load('macro-cn.json').catch(() => null)])
      .then(([us, cn]: [MacroSnapshot, MacroSnapshot<CnKey> | null]) => { snapshotCache = { us, cn }; setData(snapshotCache) })
      .catch(() => setError('宏观数据加载失败，请刷新重试。'))
  }, [])

  const go = (patch: Record<string, string | null>): void => setParams(prev => {
    const next = new URLSearchParams(prev)
    Object.entries(patch).forEach(([k, v]) => (v === null ? next.delete(k) : next.set(k, v)))
    return next
  }, { replace: true })

  const needsData = tab !== 'archive'
  const snap = data?.us
  return (
    <div style={{ minHeight: '100vh' }}>
      <PageTitle>宏观温度</PageTitle>
      <PageTabs label="宏观温度栏目" items={TABS} value={tab} onChange={id => go({ tab: id === 'overview' ? null : id, old: null })} />
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 16px 40px' }}>
        {needsData && !snap && <p role={error ? 'alert' : 'status'} className="macro-muted">{error || '正在加载宏观数据…'}</p>}
        {snap && tab === 'overview' && <OverviewView snap={snap} cn={data.cn} />}
        {snap && tab === 'us' && <UsView snap={snap} />}
        {snap && tab === 'cn' && (data.cn ? <ChinaView snap={data.cn} /> : <p role="alert" className="macro-muted">中国数据加载失败，请刷新重试。</p>)}
        {snap && tab === 'stages' && <StagesView snap={snap} />}
        {snap && tab === 'guide' && <GuideView snap={snap} cn={data.cn} />}
        {tab === 'archive' && (
          <>
            <p className="macro-archive-note" role="note">
              已停用：旧版以期权情绪（Put/Call、Gamma）、做空工具和具体个股仓位为主，数据停在 2025 年底，和书中「不预测、不做空、不加杠杆」的方法不一致。保留原样，仅供回看，不再更新。
            </p>
            <Segmented label="旧版栏目" items={ARCHIVE} value={archive} onChange={id => go({ old: id })} />
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
              {ARCHIVE.find(a => a.id === archive)!.el()}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
