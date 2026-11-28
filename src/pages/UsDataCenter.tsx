import React from 'react'
import { Activity, CalendarDays, ChartNoAxesColumnIncreasing, Layers3 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Page, PageTabs } from '../components/ui'
import IpoPanel from '../features/us-data-center/IpoPanel'
import MoversPanel from '../features/us-data-center/MoversPanel'
import PutCallPanel from '../features/us-data-center/PutCallPanel'
import SectorPanel from '../features/us-data-center/SectorPanel'
import type { UsDataTab } from '../features/us-data-center/types'
import '../features/us-data-center/us-data-center.css'

const TABS = [
  { id: 'movers' as const, label: '异动榜', icon: <Activity size={16} aria-hidden="true" /> },
  { id: 'ipo' as const, label: '新股上市', icon: <CalendarDays size={16} aria-hidden="true" /> },
  { id: 'sectors' as const, label: '板块追踪', icon: <Layers3 size={16} aria-hidden="true" /> },
  { id: 'putcall' as const, label: '看跌 / 看涨比', icon: <ChartNoAxesColumnIncreasing size={16} aria-hidden="true" /> },
]

export default function UsDataCenter(): JSX.Element {
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab')
  const tab: UsDataTab = TABS.some(item => item.id === requested) ? requested as UsDataTab : 'movers'
  const changeTab = (next: UsDataTab): void => setParams(previous => {
    const updated = new URLSearchParams(previous)
    if (next === 'movers') updated.delete('tab')
    else updated.set('tab', next)
    return updated
  }, { replace: true })
  return <Page className="usdc-page">
    <header className="usdc-hero">
      <p className="usdc-eyebrow">美股 · 公开数据中心</p>
      <h1>美股数据</h1>
      <p>把当日异动、新股进度、行业强弱和期权成交结构放在一处。点击股票或 ETF 代码，可继续查个股行情。</p>
    </header>
    <PageTabs label="美股数据页签" items={TABS} value={tab} onChange={changeTab} />
    <div role="tabpanel" className="usdc-tabpanel" aria-label={TABS.find(item => item.id === tab)?.label}>
      {tab === 'movers' && <MoversPanel />}
      {tab === 'ipo' && <IpoPanel />}
      {tab === 'sectors' && <SectorPanel />}
      {tab === 'putcall' && <PutCallPanel />}
    </div>
    <footer className="usdc-footer">数据仅供参考，不构成买卖建议。</footer>
  </Page>
}
