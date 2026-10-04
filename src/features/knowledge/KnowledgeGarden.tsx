import React, { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Network, ArrowUpRight } from 'lucide-react'
import { errorText } from './api'
import type { KnowledgeApi, KnowledgeGraph } from './api'

export function gardenCategory(path: string): string {
  const parts = path.split('/')
  return parts[0] === 'Notion' ? (parts.length > 3 ? parts[2] : 'Notion 导航') : parts[0]
}
const COLORS = ['#c99a48', '#718d70', '#7095a4', '#ab819a', '#9b90b1', '#b48769', '#7fa29b', '#999078']
export default function KnowledgeGarden({ api, vaultId, onOpen }: { api: KnowledgeApi; vaultId?: string; onOpen(path: string): void }): JSX.Element {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null)
  const [error, setError] = useState(''), [loading, setLoading] = useState(false)
  const [query, setQuery] = useState(''), [category, setCategory] = useState(''), [focus, setFocus] = useState('')
  const [page, setPage] = useState(0), [zoom, setZoom] = useState(1), [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    setGraph(null); setError(''); setLoading(!!vaultId); setFocus('')
    if (!vaultId || !api.graph) { setLoading(false); return }
    api.graph().then(data => {
      if (!active) return
      if (data.vaultId !== vaultId) throw new Error('Vault 已更换，请刷新知识库')
      setGraph(data)
    }).catch(e => { if (active) setError(errorText(e)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api, vaultId, revision])
  useEffect(() => { setPage(0) }, [query, category, focus])
  const groups = useMemo(() => [...new Set(graph?.nodes.map(n => gardenCategory(n.path)) ?? [])].sort(), [graph])
  const neighbors = useMemo(() => new Set(graph?.edges.flatMap(e => e.source === focus ? [e.target] : e.target === focus ? [e.source] : []) ?? []), [graph, focus])
  const matching = (graph?.nodes ?? []).filter(n => (!category || gardenCategory(n.path) === category) && (!query || `${n.title} ${n.path}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) && (!focus || n.path === focus || neighbors.has(n.path)))
  const buckets = groups.map(g => matching.filter(n => gardenCategory(n.path) === g))
  const filtered = [] as typeof matching
  for (let i = 0; i < Math.max(0, ...buckets.map(b => b.length)); i++) for (const bucket of buckets) if (bucket[i]) filtered.push(bucket[i])
  const visible = filtered.slice(page * 90, (page + 1) * 90)
  const shownGroups = [...new Set(visible.map(n => gardenCategory(n.path)))]
  const hubs = shownGroups.map((name, i) => {
    const angle = i * Math.PI * 2 / shownGroups.length - Math.PI / 2
    return { name, x: 450 + Math.cos(angle) * 210, y: 330 + Math.sin(angle) * 210, color: COLORS[groups.indexOf(name) % COLORS.length] }
  })
  const positions = visible.map(n => {
    const hub = hubs.find(h => h.name === gardenCategory(n.path))!
    const siblings = visible.filter(other => gardenCategory(other.path) === hub.name)
    const i = siblings.indexOf(n), angle = i * 2.39996323
    const radius = 30 + Math.sqrt((i + 1) / siblings.length) * 80
    return { ...n, x: hub.x + Math.cos(angle) * radius, y: hub.y + Math.sin(angle) * radius, color: hub.color }
  })
  const byPath = new Map(positions.map(n => [n.path, n]))
  const selected = graph?.nodes.find(n => n.path === focus)
  return <section className="kb-garden" aria-label="蒲公英知识网络">
    <div className="kb-garden-head"><div><span className="kb-eyebrow">DANDELION · KNOWLEDGE GARDEN</span><h2>让知识，随连接生长。</h2><p>{graph ? `${graph.nodes.length} 篇笔记 · ${graph.edges.length} 条真实引用 · ${graph.unresolved} 处未解析引用` : '每篇笔记是一颗种子，真实引用把它们连在一起。'}</p></div><button onClick={() => setRevision(n => n + 1)} disabled={loading || !vaultId}><RefreshCw size={15} />刷新网络</button></div>
    <div className="kb-garden-controls"><input aria-label="搜索网络节点" placeholder="搜索标题或路径…" value={query} onChange={e => { setQuery(e.target.value); setFocus('') }} /><select aria-label="网络分类" value={category} onChange={e => { setCategory(e.target.value); setFocus('') }}><option value="">全部分类</option>{groups.map(g => <option key={g}>{g}</option>)}</select><label>缩放 <input aria-label="网络缩放" type="range" min="0.6" max="1.6" step="0.1" value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>{focus && <button onClick={() => setFocus('')}>返回全景</button>}</div>
    {error && <p role="alert" className="kb-alert">{error}</p>}
    {loading ? <p role="status" className="kb-muted">正在从 Markdown 生成真实连接…</p> : <div className="kb-garden-layout">
      <div className="kb-garden-canvas"><svg viewBox="0 0 900 660" role="img" aria-label="蒲公英网络：虚线表示分类，实线表示笔记引用"><g transform={`translate(450 330) scale(${zoom}) translate(-450 -330)`}>
        <defs><radialGradient id="gardenGlow"><stop stopColor="#c99a48" stopOpacity=".22" /><stop offset="1" stopColor="#c99a48" stopOpacity="0" /></radialGradient></defs>
        <circle cx="450" cy="330" r="300" fill="url(#gardenGlow)" />
        {hubs.map(h => <g key={h.name}><line x1="450" y1="330" x2={h.x} y2={h.y} stroke={h.color} strokeOpacity=".4" strokeDasharray="3 6" />{positions.filter(n => gardenCategory(n.path) === h.name).map(n => <line key={n.path} x1={h.x} y1={h.y} x2={n.x} y2={n.y} stroke={h.color} strokeOpacity=".18" strokeDasharray="2 5" />)}</g>)}
        {graph?.edges.filter(e => byPath.has(e.source) && byPath.has(e.target)).map(e => <line key={`${e.source}:${e.target}`} x1={byPath.get(e.source)!.x} y1={byPath.get(e.source)!.y} x2={byPath.get(e.target)!.x} y2={byPath.get(e.target)!.y} stroke="#d2bc86" strokeOpacity={focus ? '.8' : '.35'} />)}
        <circle cx="450" cy="330" r="28" fill="#292c28" stroke="#c99a48" /><text x="450" y="335" textAnchor="middle" fill="#e6d7b8" fontSize="12">个人大脑</text>
        {hubs.map(h => <g key={h.name}><circle cx={h.x} cy={h.y} r="12" fill={h.color} /><text x={h.x} y={h.y - 18} textAnchor="middle" fill={h.color} fontSize="12">{h.name}</text></g>)}
        {positions.map(n => <g key={n.path} role="button" tabIndex={0} aria-label={`聚焦 ${n.title}`} onClick={() => { setFocus(n.path); setQuery(''); setCategory('') }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFocus(n.path); setQuery(''); setCategory('') } }} className="kb-garden-node"><title>{n.title}\n{n.path}</title><circle cx={n.x} cy={n.y} r={n.path === focus ? 7 : 3.8} fill={n.color} stroke={n.path === focus ? '#fff' : n.color} /><circle cx={n.x} cy={n.y} r="11" fill="transparent" /></g>)}
      </g></svg><p className="kb-garden-legend">显示 {visible.length} / {filtered.length} 颗种子 · 虚线：分类 · 实线：当前节点间的真实引用</p>{!vaultId && <div className="kb-garden-empty"><Network size={42} /><h3>连接资料库，让蒲公英生长。</h3><p>本机运行 <code>npm run knowledge:app</code> 后显示真实笔记。<br />线上资料库需要先配置认证和云端同步。</p></div>}</div>
      <aside className="kb-garden-list">{selected && <div className="kb-garden-selected"><span className="kb-eyebrow">当前种子 · {neighbors.size} 篇关联</span><h3>{selected.title}</h3><button className="kb-primary" onClick={() => onOpen(selected.path)}>阅读这篇笔记<ArrowUpRight size={15} /></button></div>}<h3>{focus ? '关联笔记' : '资料库'} <small>{filtered.length}</small></h3>{visible.map(n => <div key={n.path}><button onClick={() => { setFocus(n.path); setQuery(''); setCategory('') }}>{n.title}</button><button aria-label={`阅读 ${n.title}`} onClick={() => onOpen(n.path)}><ArrowUpRight size={14} /></button><small>{n.path}</small></div>)}{vaultId && !filtered.length && <p className="kb-muted">{graph ? '没有匹配的笔记' : '网络暂不可用，请刷新'}</p>}<div className="kb-garden-paging"><button disabled={!page} onClick={() => setPage(n => n - 1)}>上一页</button><span>{page + 1} / {Math.max(1, Math.ceil(filtered.length / 90))}</span><button disabled={(page + 1) * 90 >= filtered.length} onClick={() => setPage(n => n + 1)}>下一页</button></div></aside>
    </div>}
  </section>
}
