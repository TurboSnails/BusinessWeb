import React, { useEffect, useState } from 'react'
import { Callout, EmptyState, Page, PageToolbar, Stat, StatGrid } from '../components/ui'
import { PageTabs } from '../components/ui/PageTabs'
import { EtfFlowChart } from '../features/etf-flow/EtfFlowChart'
import { asEtfFlow, fmtYi, type EtfFlowData } from '../features/etf-flow/model'
import { LabNav } from '../features/etf-signal-plans/LabNav'
import '../features/etf-flow/etf-flow.css'

type Scope = 'all' | 'broad'
const BASE = import.meta.env.BASE_URL

function tone(value: number | null) {
  if (value == null || value === 0) return 'etf-kpi'
  return value > 0 ? 'etf-kpi etf-kpi--up' : 'etf-kpi etf-kpi--down'
}

export function EtfFlowView({ data, failed = false }: { data: EtfFlowData | null; failed?: boolean }): JSX.Element {
  const [scope, setScope] = useState<Scope>('all')
  const k = data?.kpi[scope]
  const lastDate = data?.series.at(-1)?.date
  const startDate = data?.series.slice(-60)[0]?.date
  const generated = data?.updated ? new Date(data.updated) : undefined

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
      {failed ? (
        <EmptyState title="资金流快照读取失败">请刷新页面重试。</EmptyState>
      ) : !data ? (
        <p role="status">正在读取资金流快照…</p>
      ) : !k || !lastDate ? (
        <EmptyState title="暂无数据">运行 <code>npm run etf-flow:update</code> 生成快照后再打开。</EmptyState>
      ) : (
        <>
          {data.sample && <Callout tone="warn" title="示例数据">本页展示样本快照。</Callout>}
          <StatGrid>
            <Stat className={tone(k.yesterday)} label="最新记录日净流入（亿元）" value={fmtYi(k.yesterday)} sub={lastDate} />
            <Stat className={tone(k.cum60)} label="近 60 个记录日累计（亿元）" value={fmtYi(k.cum60)}
              sub={`${startDate} 至 ${lastDate} · 有效 ${k.covered}/60 日`} />
          </StatGrid>
          <EtfFlowChart series={data.series} scope={scope} />
          {data.note && <p className="etf-flow__note">{data.note}</p>}
          {generated && Number.isFinite(generated.getTime()) && <p className="etf-flow__foot">快照生成于 {generated.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（北京时间）</p>}
        </>
      )}
    </Page>
  )
}

export default function EtfFlowLab(): JSX.Element {
  const [data, setData] = useState<EtfFlowData | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    fetch(`${BASE}data/etf-flow.json`, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then(body => {
        const snapshot = asEtfFlow(body)
        if (!snapshot) throw new Error('快照格式异常')
        if (live) setData(snapshot)
      })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [])
  return <EtfFlowView data={data} failed={failed} />
}
