import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Callout, Card, EmptyState, Page, PageToolbar, TableWrap } from '../components/ui'
import { LabNav } from '../features/etf-signal-plans/LabNav'
import { fmtPct } from '../features/etf-watch-pool/model'
import '../features/etf-flow/etf-flow.css'

const BASE = import.meta.env.BASE_URL

type Kind = 'macd-good' | 'hs300-timing'

const META: Record<Kind, { path: string; title: string; file: string; note: string }> = {
  'macd-good': {
    path: '/lab/etf-macd-good',
    title: '创业板择时优选（实验）',
    file: 'etf-macd-good.json',
    note: '研究筛出的「创业板择时 + 金叉或站上 10 日线（研究编号 Y1）」逐年相对稳定名单。独立入口，不写入复盘。',
  },
  'hs300-timing': {
    path: '/lab/etf-hs300-timing',
    title: '沪深300择时优选（实验）',
    file: 'etf-hs300-timing.json',
    note: '研究筛出的「只认金叉 + 沪深300择时」名单。独立入口，不写入复盘。',
  },
}

interface Item {
  code: string
  name: string
  industry?: string
  years?: number
  annual?: number
  drawdown?: number
  calmar?: number
  yearAvg?: number
  worstYear?: number
}

interface Pool {
  asOf: string
  rule: string
  items: Item[]
}

export default function EtfResearchListLab({ kind }: { kind: Kind }): JSX.Element {
  const meta = META[kind]
  const [data, setData] = useState<Pool | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    fetch(`${BASE}data/${meta.file}`, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((body: Pool) => { if (live) { if (!Array.isArray(body.items)) throw new Error('格式不对'); setData(body) } })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : '加载失败') })
    return () => { live = false }
  }, [meta.file])

  return (
    <Page title={meta.title}>
      <LabNav current={meta.path} />
      <PageToolbar note={meta.note} />
      <Callout tone="warn" title="研究名单 · 不是投资建议">不并入 ETF 复盘默认分组，不发 Telegram。历史年化/回撤仅供对照。</Callout>
      {error && <EmptyState title="无法加载">{error}</EmptyState>}
      {data && (
        <Card title={`${data.items.length} 只 · 截至 ${data.asOf}`} as="section" description={data.rule}>
          <TableWrap label={meta.title}>
            <table>
              <thead>
                <tr>
                  <th scope="col">名称</th>
                  <th scope="col">年化</th>
                  <th scope="col">最大回撤</th>
                  <th scope="col">卡玛</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map(item => (
                  <tr key={item.code}>
                    <th scope="row">{item.name}<small> {item.code}</small></th>
                    <td className="num">{item.annual == null ? '—' : fmtPct(item.annual)}</td>
                    <td className="num">{item.drawdown == null ? '—' : fmtPct(item.drawdown)}</td>
                    <td className="num">{item.calmar == null ? '—' : item.calmar.toFixed(2)}</td>
                    <td>
                      <Link to={`/lab/etf-signal-plans?code=${encodeURIComponent(item.code)}&name=${encodeURIComponent(item.name)}`}>三方案</Link>
                      {' · '}
                      <Link to={`/grid-trading?code=${encodeURIComponent(item.code)}&name=${encodeURIComponent(item.name)}`}>网格</Link>
                      {' · '}
                      <Link to={`/etf-review?code=${encodeURIComponent(item.code)}&name=${encodeURIComponent(item.name)}`}>预填复盘</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}
    </Page>
  )
}
