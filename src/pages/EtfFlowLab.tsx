import React, { useEffect, useState } from 'react'
import { Callout, EmptyState, Page, PageToolbar, Stat, StatGrid } from '../components/ui'
import { PageTabs } from '../components/ui/PageTabs'
import { EtfFlowChart } from '../features/etf-flow/EtfFlowChart'
import { asEtfFlow, EMPTY_FLOW, fmtYi, type EtfFlowData } from '../features/etf-flow/model'
import { LabNav } from '../features/etf-signal-plans/LabNav'
import '../features/etf-flow/etf-flow.css'

type Scope = 'all' | 'broad'
const BASE = import.meta.env.BASE_URL

export function EtfFlowView({ data }: { data: EtfFlowData }): JSX.Element {
  const [scope, setScope] = useState<Scope>('all')
  const k = data.kpi?.[scope] ?? { yesterday: 0, cum60: 0 }
  const empty = !data.series?.length
  const broadReady = (data.series ?? []).some(s => s.flow_broad != null)

  return (
    <Page title="ETF 资金净流入（实验）">
      <LabNav current="/lab/etf-flow" />
      <PageToolbar note="全 A / 宽基 ETF 日度申购净流入（同花顺原口径）叠加上证指数。与「同花顺 · ETF资金」页入口分离：那里看个股份额推算，这里看全市场大周期。" />
      <Callout tone="warn" title="观察中，不是买卖指令">实验页；历史统计与展示口径仍可能调整。不构成投资建议。</Callout>
      <PageTabs<Scope>
        label="口径"
        items={[{ id: 'all', label: '全A' }, { id: 'broad', label: '宽基' }]}
        value={scope}
        onChange={setScope}
      />
      {empty ? (
        <EmptyState title="暂无数据">运行 <code>npm run etf-flow:update</code> 生成快照后再打开。</EmptyState>
      ) : scope === 'broad' && !broadReady ? (
        <EmptyState title="宽基口径暂无数据">先看全 A；宽基序列下次快照会补。</EmptyState>
      ) : (
        <>
          <StatGrid>
            <Stat className={`etf-kpi etf-kpi--${k.yesterday >= 0 ? 'up' : 'down'}`} label="昨日净流入（亿元）" value={fmtYi(k.yesterday)} />
            <Stat className={`etf-kpi etf-kpi--${k.cum60 >= 0 ? 'up' : 'down'}`} label="近 60 日累计（亿元）" value={fmtYi(k.cum60)} />
          </StatGrid>
          <EtfFlowChart series={data.series} scope={scope} />
          {data.note && <p className="etf-flow__note">{data.note}</p>}
          {data.updated && <p className="etf-flow__foot">更新于 {data.updated.replace('T', ' ').replace(/\..*$/, '')}</p>}
        </>
      )}
    </Page>
  )
}

export default function EtfFlowLab(): JSX.Element {
  const [data, setData] = useState<EtfFlowData | null>(null)
  useEffect(() => {
    let live = true
    fetch(`${BASE}data/etf-flow.json`, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then(body => { if (live) setData(asEtfFlow(body) ?? EMPTY_FLOW) })
      .catch(() => { if (live) setData(EMPTY_FLOW) })
    return () => { live = false }
  }, [])
  return <EtfFlowView data={data ?? EMPTY_FLOW} />
}
