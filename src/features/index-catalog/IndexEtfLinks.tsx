import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { relationsFor, validCatalog, type EtfCatalog } from './catalog'
import './index-catalog.css'

let catalogRequest: Promise<EtfCatalog> | null = null
export function clearIndexEtfCatalogCache(): void { catalogRequest = null }
function loadCatalog(): Promise<EtfCatalog> {
  catalogRequest ??= fetch(`${import.meta.env.BASE_URL}data/index-etf-catalog.json`, { signal: AbortSignal.timeout(15_000) })
    .then(async r => { if (!r.ok) throw new Error(); const body: unknown = await r.json(); if (!validCatalog(body)) throw new Error(); return body })
    .catch(error => { catalogRequest = null; throw error })
  return catalogRequest
}

export default function IndexEtfLinks({ indexKey }: { indexKey: string }): JSX.Element {
  const [catalog, setCatalog] = useState<EtfCatalog | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setStatus('loading')
    loadCatalog()
      .then(body => { if (active) { setCatalog(body); setStatus('ready') } })
      .catch(() => { if (active) setStatus('error') })
    return () => { active = false }
  }, [attempt])
  const relations = relationsFor(catalog, indexKey)
  const count = relations.filter(r => r.relationship === 'tracks').length
  return <section className="index-related" aria-label="关联 ETF">
    <h4>关联 ETF</h4>
    {status === 'loading' ? <p role="status">正在读取已核验的跟踪关系…</p> : status === 'error' ? <p role="status">关系目录暂时无法读取。<button type="button" onClick={() => setAttempt(n => n + 1)}>重试目录</button></p> : <>
      <p className="macro-muted">已核验直接跟踪产品 {count} 只。这里只列少量代表产品，不代表全市场覆盖或推荐顺序。</p>
      {!relations.length ? <p>暂无已核实映射；不代表市场上没有相关产品。</p> : <ul>{relations.map(r => <li key={`${r.exchange}${r.code}`}>
        <strong>{r.name} · {r.exchange}{r.code}</strong> — {r.relationship === 'tracks' ? '直接跟踪' : '相关主题，非直接跟踪'} {r.benchmarkName}（{r.benchmarkCode}）
        {r.relationNote && <p>{r.relationNote}</p>}
        <div><Link to={`/etf-review?${new URLSearchParams({ code: r.code, name: r.name })}`}>加入复盘</Link><Link to={`/grid-trading?${new URLSearchParams({ code: r.code, name: r.name })}`}>查看网格工具</Link><a href={r.evidenceUrl} target="_blank" rel="noreferrer noopener">{r.evidenceLabel}</a></div>
        <small className="macro-muted">资料日期 {r.disclosureDate} · 人工核验 {r.verifiedAt}</small>
      </li>)}</ul>}
    </>}
  </section>
}
