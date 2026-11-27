import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Callout, Card, EmptyState, Page, PageToolbar, TableWrap } from '../components/ui'
import { asWatchPool, fmtPct, PLAN_LABEL, type WatchPool } from '../features/etf-watch-pool/model'
import '../features/etf-flow/etf-flow.css'

const BASE = import.meta.env.BASE_URL

export default function EtfWatchPoolLab(): JSX.Element {
  const [data, setData] = useState<WatchPool | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    fetch(`${BASE}data/etf-watch-pool.json`, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(body => {
        if (!live) return
        const pool = asWatchPool(body)
        if (!pool) setError('数据格式不对')
        else setData(pool)
      })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : '加载失败') })
    return () => { live = false }
  }, [])

  return (
    <Page title="行业观察池（实验）">
      <PageToolbar note="高波动 / 大行业 ETF 观察名单。独立入口，不自动写入 ETF 复盘分组，也不发提醒。" />
      <Callout tone="warn" title="只看信号 · 不是优选组合">
        对照研究导出名单；样本外未证明可提高收益。历史年化/回撤仅供对照，不构成投资建议。
      </Callout>
      {error && <EmptyState title="无法加载">{error}</EmptyState>}
      {data && (
        <Card title={`${data.items.length} 只 · 规则截至 ${data.asOf}`} as="section" description={data.rule}>
          <TableWrap label="行业观察池">
            <table>
              <thead>
                <tr>
                  <th scope="col">名称</th>
                  <th scope="col">行业</th>
                  <th scope="col">方案</th>
                  <th scope="col">年化</th>
                  <th scope="col">最大回撤</th>
                  <th scope="col">卡玛</th>
                  <th scope="col">上市年</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map(item => (
                  <tr key={item.code}>
                    <th scope="row">{item.name}<small> {item.code}</small></th>
                    <td>{item.industry}</td>
                    <td>{PLAN_LABEL[item.plan]}</td>
                    <td className="num">{fmtPct(item.annual)}</td>
                    <td className="num">{fmtPct(item.drawdown)}</td>
                    <td className="num">{item.calmar.toFixed(2)}</td>
                    <td className="num">{item.years.toFixed(1)}</td>
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
