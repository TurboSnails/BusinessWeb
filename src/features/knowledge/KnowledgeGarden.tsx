import React, { useEffect, useMemo, useState } from 'react'
import { RefreshCw, ArrowUpRight, Pause, Play } from 'lucide-react'
import { errorText } from './api'
import type { KnowledgeApi, KnowledgeGraph } from './api'
import GardenScene, { gardenCategory } from './GardenScene'
export default function KnowledgeGarden({ api, vaultId, onOpen }: { api: KnowledgeApi; vaultId?: string; onOpen(path: string): void }): JSX.Element {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null)
  const [error, setError] = useState(''), [loading, setLoading] = useState(false)
  const [query, setQuery] = useState(''), [category, setCategory] = useState(''), [focus, setFocus] = useState('')
  const [page, setPage] = useState(0), [zoom, setZoom] = useState(1), [revision, setRevision] = useState(0)
  const [paused, setPaused] = useState(false)
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
  const filtered = useMemo(() => {
    const matching = (graph?.nodes ?? []).filter(n => (!category || gardenCategory(n.path) === category) && (!query || `${n.title} ${n.path}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) && (!focus || n.path === focus || neighbors.has(n.path)))
    const buckets = groups.map(g => matching.filter(n => gardenCategory(n.path) === g))
    const result = [] as typeof matching
    for (let i = 0; i < Math.max(0, ...buckets.map(b => b.length)); i++) for (const bucket of buckets) if (bucket[i]) result.push(bucket[i])
    // Keep the focused note on every page so its neighbor edges remain meaningful.
    return focus ? result.sort((a, b) => Number(b.path === focus) - Number(a.path === focus)) : result
  }, [graph, groups, category, query, focus, neighbors])
  const visible = useMemo(() => {
    if (!focus) return filtered.slice(page * 90, (page + 1) * 90)
    const selected = filtered.find(n => n.path === focus)
    const rest = filtered.filter(n => n.path !== focus).slice(page * 89, (page + 1) * 89)
    return selected ? [selected, ...rest] : rest
  }, [filtered, page, focus])
  const pageSize = focus ? 89 : 90
  const pageCount = Math.max(1, Math.ceil((filtered.length - (focus ? 1 : 0)) / pageSize))
  const selected = graph?.nodes.find(n => n.path === focus)
  return <section className={`kb-garden ${paused ? 'is-motion-paused' : ''}`} aria-label="蒲公英知识网络">
    <div className="kb-garden-head"><div><span className="kb-eyebrow">DANDELION · KNOWLEDGE GARDEN</span><h2>让知识，随连接生长。</h2><p>{graph ? `${graph.nodes.length} 篇笔记 · ${graph.edges.length} 条真实引用 · ${graph.unresolved} 处未解析引用` : '每篇笔记是一颗种子，真实引用把它们连在一起。'}</p></div><button onClick={() => setRevision(n => n + 1)} disabled={loading || !vaultId}><RefreshCw size={15} />刷新网络</button></div>
    <div className="kb-garden-controls"><input aria-label="搜索网络节点" placeholder="搜索标题或路径…" value={query} onChange={e => { setQuery(e.target.value); setFocus('') }} /><select aria-label="网络分类" value={category} onChange={e => { setCategory(e.target.value); setFocus('') }}><option value="">全部分类</option>{groups.map(g => <option key={g}>{g}</option>)}</select><label>缩放 <input aria-label="网络缩放" type="range" min="0.6" max="1.6" step="0.1" value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label><button aria-pressed={paused} onClick={() => setPaused(p => !p)}>{paused ? <Play size={14} /> : <Pause size={14} />}{paused ? '播放动效' : '暂停动效'}</button>{focus && <button onClick={() => setFocus('')}>返回全景</button>}</div>
    {error && <p role="alert" className="kb-alert">{error}</p>}
    {loading ? <p role="status" className="kb-muted">正在从 Markdown 生成真实连接…</p> : <div className="kb-garden-layout">
      <div className="kb-garden-canvas"><GardenScene nodes={visible} groups={groups} edges={graph?.edges ?? []} focus={focus} zoom={zoom} paused={paused} onBack={() => setFocus('')} decorative={!vaultId} onFocus={path => { setFocus(path); setQuery(''); setCategory('') }} /><p className="kb-garden-legend">{!vaultId ? '蒲公英装饰动效 · 连接资料库后显示真实笔记' : `显示 ${visible.length} / ${filtered.length} 颗种子 · 颜色：分类 · 亮线：当前节点间的真实引用`}</p>{!vaultId && <div className="kb-garden-empty"><span className="kb-eyebrow">WAITING TO GROW</span><h3>连接资料库，让蒲公英生长。</h3><p>本机运行 <code>npm run knowledge:app</code> 后显示真实笔记。<br />线上请解锁私人资料库；完成同步后显示真实笔记。</p></div>}</div>
      <aside className="kb-garden-list">{selected && <div className="kb-garden-selected"><span className="kb-eyebrow">当前种子 · {neighbors.size} 篇关联</span><h3>{selected.title}</h3><button className="kb-primary" onClick={() => onOpen(selected.path)}>阅读这篇笔记<ArrowUpRight size={15} /></button></div>}<h3>{focus ? '关联笔记' : '资料库'} <small>{filtered.length}</small></h3>{visible.map(n => <div key={n.path}><button onClick={() => { setFocus(n.path); setQuery(''); setCategory('') }}>{n.title}</button><button aria-label={`阅读 ${n.title}`} onClick={() => onOpen(n.path)}><ArrowUpRight size={14} /></button><small>{n.path}</small></div>)}{vaultId && !filtered.length && <p className="kb-muted">{graph ? '没有匹配的笔记' : '网络暂不可用，请刷新'}</p>}{!vaultId && <p className="kb-muted">连接后，种子将对应你的笔记。点击一颗，沿着引用继续阅读。</p>}<div className="kb-garden-paging"><button disabled={!page} onClick={() => setPage(n => n - 1)}>上一页</button><span>{page + 1} / {pageCount}</span><button disabled={page + 1 >= pageCount} onClick={() => setPage(n => n + 1)}>下一页</button></div></aside>
    </div>}
  </section>
}
