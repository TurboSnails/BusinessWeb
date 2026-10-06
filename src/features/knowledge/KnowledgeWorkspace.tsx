import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, Plus, RefreshCw, Save, FileText, FolderOpen, Network, ArrowUpRight, BookOpen, HardDrive } from 'lucide-react'
import { errorText, knowledgeApi, cloudTokenKey, isCloudKnowledge, preferCloudOnLocal } from './api'
import type { KnowledgeApi, Note, NoteInfo, Relations, VaultStatus } from './api'
import DailyInbox from './DailyInbox'
import MarkdownPreview from './MarkdownPreview'
import KnowledgeSetup from './KnowledgeSetup'
import KnowledgeGarden from './KnowledgeGarden'
import { cachedKnowledgeApi } from './cache'
import './knowledge.css'

const FOLDERS = [
  ['00-Inbox', '收集箱'], ['01-Investment', '投资研究'], ['02-AI', 'AI 与模型'],
  ['03-Development', '技术与开发'], ['04-Projects', '项目'], ['05-Life', '生活与阅读'], ['Templates', '模板'],
]
type Editor = { note: Note; path: string; content: string }
const isDirty = (editor: Editor | null) => !!editor && (editor.note.version === null || editor.path !== editor.note.path || editor.content !== editor.note.content)

function Workspace({ api: rawApi = knowledgeApi, initialTab = 'workspace' }: { api?: KnowledgeApi; initialTab?: 'workspace' | 'garden' | 'setup' }): JSX.Element {
  // 读取结果缓存在内存里：切走再切回直接用上次的数据，点「刷新」才重新请求
  const api = useMemo(() => cachedKnowledgeApi(rawApi), [rawApi])
  const [status, setStatus] = useState<VaultStatus | null>(() => api.peek<VaultStatus>('status') ?? null)
  const [connection, setConnection] = useState<'loading' | 'ready' | 'offline'>(() => (api.peek('status') && api.peek('list') ? 'ready' : 'loading'))
  const [notes, setNotes] = useState<NoteInfo[]>(() => api.peek<NoteInfo[]>('list') ?? [])
  const [results, setResults] = useState<NoteInfo[] | null>(null)
  const [query, setQuery] = useState('')
  const [folder, setFolder] = useState('')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [relations, setRelations] = useState<Relations | null>(null)
  const [view, setView] = useState<'edit' | 'read'>('edit')
  const [tab, setTab] = useState<'workspace' | 'garden' | 'setup'>(initialTab)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [storageWarning, setStorageWarning] = useState(false)
  const alive = useRef(true), reading = useRef(0), searching = useRef(0), connecting = useRef(0)
  const editorRef = useRef(editor), restored = useRef(false)
  const currentVault = useRef<string | null>(null), currentVaultId = useRef<string | null>(null)
  editorRef.current = editor
  const dirty = isDirty(editor)
  const storageKey = status ? `knowledge-draft:${status.vaultPath}` : null

  const connect = useCallback(async () => {
    const id = ++connecting.current
    if (!api.peek('status') || !api.peek('list')) setConnection('loading')
    setError('')
    try {
      const [info, list] = await Promise.all([api.status(), api.list()])
      if (!alive.current || id !== connecting.current) return
      if (currentVault.current && currentVault.current !== info.vaultPath) {
        reading.current++
        setEditor(null); editorRef.current = null; setRelations(null)
        restored.current = false
        setMessage('Vault 已更换，旧草稿保留在原 Vault 的本会话暂存中')
      }
      currentVault.current = info.vaultPath; currentVaultId.current = info.vaultId
      setStatus(info); setNotes(list); setConnection('ready')
      if (!restored.current && !info.readOnly) {
        restored.current = true
        try {
          const draft = JSON.parse(sessionStorage.getItem(`knowledge-draft:${info.vaultPath}`) || 'null')
          if (draft && typeof draft.content === 'string' && typeof draft.path === 'string' && typeof draft.note?.content === 'string' && typeof draft.note?.path === 'string' && (draft.note.version === null || typeof draft.note.version === 'string')) {
            setEditor(draft); setMessage('已恢复本会话草稿，请核对后保存')
          }
        } catch { /* 损坏的草稿不影响文件服务 */ }
      }
    } catch (e) {
      if (alive.current && id === connecting.current) { setConnection('offline'); setError(errorText(e)) }
    }
  }, [api])
  useEffect(() => {
    alive.current = true
    void connect()
    return () => { alive.current = false; reading.current++; searching.current++; connecting.current++ }
  }, [connect])
  useEffect(() => {
    if (!storageKey) return
    try { dirty ? sessionStorage.setItem(storageKey, JSON.stringify(editor)) : sessionStorage.removeItem(storageKey) }
    catch { setStorageWarning(true) }
  }, [storageKey, editor, dirty])
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function canReplace(): boolean {
    return !isDirty(editorRef.current) || window.confirm('当前笔记有未保存的修改。放弃这些修改并打开另一篇笔记？')
  }
  async function openNote(path: string, force = false) {
    if (busy || (!force && !canReplace())) return
    const id = ++reading.current
    setBusy('read'); setError(''); setMessage(''); setRelations(null)
    try {
      const note = await api.read(path)
      if (!alive.current || id !== reading.current) return
      if (note.vaultId !== currentVaultId.current) throw new Error('Vault 已更换，请刷新知识库。原草稿仍保留。')
      setEditor({ note, path: note.path, content: note.content }); setView('read') // 打开已有笔记默认排版阅读，点「编辑」再改源码
      try {
        const related = await api.related(path)
        if (alive.current && id === reading.current) setRelations(related)
      } catch (e) { if (alive.current && id === reading.current) setError(`笔记已读取，关联暂不可用：${errorText(e)}`) }
    } catch (e) { if (alive.current && id === reading.current) setError(errorText(e)) }
    finally { if (alive.current && id === reading.current) setBusy('') }
  }
  function newNote() {
    if (busy || !canReplace()) return
    reading.current++; setRelations(null); setError(''); setMessage(''); setView('edit')
    const path = `${folder || '00-Inbox'}/未命名.md`
    setEditor({ note: { path, content: '', title: '新笔记', version: null, vaultId: status!.vaultId }, path, content: '# 新笔记\n\n' })
  }
  async function search(e?: React.FormEvent) {
    e?.preventDefault()
    const id = ++searching.current
    setError(''); setFolder('')
    if (!query.trim()) { setResults(null); return }
    try {
      const found = await api.search(query.trim())
      if (alive.current && id === searching.current) setResults(found)
    } catch (e) { if (alive.current && id === searching.current) setError(errorText(e)) }
  }
  async function refresh() {
    if (busy) return
    api.invalidate()
    await connect()
    if (!alive.current) return
    searching.current++; setResults(null)
    const current = editorRef.current
    if (current && !isDirty(current) && current.note.version !== null) await openNote(current.note.path, true)
  }
  async function save() {
    if (!editor || busy) return
    const captured = editor
    setBusy('save'); setError(''); setMessage('')
    try {
      const saved = await api.write(captured.path.trim(), captured.content, captured.note.version, captured.note.vaultId)
      if (!alive.current) return
      setEditor({ note: saved, path: saved.path, content: saved.content }); setMessage('已保存到 Markdown')
      // 保存已成功，索引刷新失败不能把保存状态误报为失败。
      try {
        const [list, related] = await Promise.all([api.list(), api.related(saved.path)])
        if (alive.current) { setNotes(list); setRelations(related); setResults(null) }
      } catch (e) { if (alive.current) setError(`文件已保存，列表刷新失败：${errorText(e)}`) }
    } catch (e) { if (alive.current) setError(errorText(e)) }
    finally { if (alive.current) setBusy('') }
  }
  async function inboxSaved(note: Note) {
    if (!alive.current || note.vaultId !== currentVaultId.current) return
    setMessage('已记入今日 Inbox')
    if (editorRef.current?.note.path === note.path && !isDirty(editorRef.current)) {
      setEditor({ note, path: note.path, content: note.content })
    }
    try { const list = await api.list(); if (alive.current && note.vaultId === currentVaultId.current) { setNotes(list); setResults(null) } }
    catch (e) { if (alive.current && note.vaultId === currentVaultId.current) setError(`Inbox 已保存，列表刷新失败：${errorText(e)}`) }
  }
  const filtered = (results ?? notes).filter(n => !folder || n.path.startsWith(folder + '/'))
  const connected = connection === 'ready'
  return <main className="kb-page animate-fade-in">
    <header className="kb-page-head">
      <div><span className="kb-eyebrow">PERSONAL BRAIN</span><h1>知识图谱<span className="kb-head-dot">.</span></h1><p>让知识慢慢连成一片。每一条记录，都是下一次思考的起点。</p></div>
      <span className={`kb-connection ${connected ? 'is-connected' : ''}`}><i />{connected ? status?.source === 'cloud' ? '已连接云端资料库' : '已连接本地 Vault' : connection === 'loading' ? '正在连接…' : isCloudKnowledge() ? '云端资料库未连接' : '本地 Vault 未连接'}</span>
    </header>
    <nav className="kb-tabs" aria-label="知识中心栏目"><button className={tab === 'garden' ? 'is-active' : ''} onClick={() => setTab('garden')}><Network size={16} />蒲公英网络</button><button className={tab === 'workspace' ? 'is-active' : ''} onClick={() => setTab('workspace')}><BookOpen size={16} />知识工作台</button><button className={tab === 'setup' ? 'is-active' : ''} onClick={() => setTab('setup')}><Network size={16} />连接与扩展</button><span><HardDrive size={14} />Markdown 是唯一真实数据</span></nav>
    {error && <div className="kb-alert" role="alert">{error}</div>}
    {storageWarning && <p className="kb-alert">浏览器未允许暂存草稿，关闭页面前请保存或复制内容。</p>}
    {tab === 'garden' ? <KnowledgeGarden api={api} vaultId={connected ? status?.vaultId : undefined} onOpen={path => { setTab('workspace'); void openNote(path) }} /> : tab === 'setup' ? <KnowledgeSetup /> : !status ? <section className="kb-offline">
      <div className="kb-offline-icon"><FolderOpen size={32} strokeWidth={1.3} /></div><span className="kb-eyebrow">START SMALL, KEEP IT YOURS</span><h2>连接本地知识库</h2><p>打开 Obsidian 写笔记，在这里搜索、整理，再交给 AI 接着思考。</p><div className="kb-command"><code>npm run knowledge:app</code><span>在 BusinessWeb 目录运行</span></div><div className="kb-offline-actions"><button className="kb-primary" onClick={() => void connect()} disabled={connection === 'loading'}><RefreshCw size={16} />{connection === 'loading' ? '正在连接…' : '重新连接'}</button><button onClick={() => setTab('setup')}>查看连接说明<ArrowUpRight size={16} /></button>{!isCloudKnowledge() && <button onClick={() => { preferCloudOnLocal(true); window.location.reload() }}>改用云端资料库</button>}</div><p className="kb-muted">默认使用独立的私人 Vault，也可指定现有 Obsidian 目录。</p>
    </section> : <>
      <div className="kb-overview"><div><strong>{notes.length}</strong><span>篇 Markdown 笔记</span></div><div><strong>{new Set(notes.map(n => n.path.split('/')[0])).size}</strong><span>个已有内容的目录</span></div><div className="kb-vault-path"><span>当前 Vault</span><code title={status.vaultPath}>{status.vaultPath}</code></div><button aria-label="刷新知识库" onClick={() => void refresh()} disabled={!!busy || connection === 'loading'}><RefreshCw size={16} />刷新</button></div>
      {!status.readOnly && <DailyInbox key={status.vaultPath} vaultKey={status.vaultPath} vaultId={status.vaultId} api={api} onSaved={note => void inboxSaved(note)} onError={setError} />}
      <div className="kb-workspace">
        <aside className="kb-library" aria-label="笔记目录">
          <div className="kb-section-label"><FolderOpen size={16} /><h2>我的知识库</h2></div>
          <form role="search" onSubmit={e => void search(e)} className="kb-search"><Search size={16} /><input aria-label="搜索知识库" value={query} onChange={e => { setQuery(e.target.value); if (!e.target.value.trim()) { searching.current++; setResults(null) } }} placeholder="搜索标题、内容…" /><button aria-label="执行搜索" type="submit"><ArrowUpRight size={16} /></button></form>
          <div className="kb-folders"><button className={!folder && !results ? 'is-active' : ''} onClick={() => { searching.current++; setFolder(''); setResults(null); setQuery('') }}><FileText size={15} />全部笔记<span>{notes.length}</span></button>{FOLDERS.map(([path, label]) => <button key={path} className={folder === path ? 'is-active' : ''} onClick={() => { searching.current++; setFolder(path); setResults(null); setQuery('') }}><FolderOpen size={15} />{label}<span>{notes.filter(n => n.path.startsWith(path + '/')).length}</span></button>)}</div>
          <div className="kb-notes-head"><span>{results ? `搜索结果 · ${filtered.length}` : '笔记'} </span><button aria-label="新建笔记" onClick={newNote} disabled={!!busy || !connected || status.readOnly}><Plus size={17} /></button></div>
          <div className="kb-note-list">{filtered.map(n => <button key={n.path} disabled={!!busy} className={editor?.note.path === n.path ? 'is-active' : ''} aria-label={`打开笔记 ${n.title} ${n.path}`} onClick={() => void openNote(n.path)}><span>{n.title}</span><small>{n.path}</small>{results && <p>{n.excerpt}</p>}</button>)}{!filtered.length && <p className="kb-muted">{results ? '没有匹配的笔记。' : '还没有笔记，点击 + 写下第一条。'}</p>}</div>
        </aside>
        <section className="kb-editor-pane" aria-label="笔记工作区">
          {editor ? <>
            <div className="kb-editor-head"><span><FileText size={16} />{editor.note.version === null ? '新笔记' : editor.note.title}</span>{!status.readOnly && <div className="kb-editor-tabs"><button className={view === 'edit' ? 'is-active' : ''} onClick={() => setView('edit')}>编辑</button><button className={view === 'read' ? 'is-active' : ''} onClick={() => setView('read')}>阅读</button></div>}</div>
            <label className="kb-path-label" htmlFor="kb-path">笔记路径</label><input className="kb-note-path" id="kb-path" value={editor.path} readOnly={editor.note.version !== null} disabled={!!busy} onChange={e => setEditor({ ...editor, path: e.target.value })} />
            {view === 'edit' ? <><label className="kb-sr-only" htmlFor="kb-content">Markdown 内容</label><textarea className="kb-markdown-editor" id="kb-content" spellCheck={false} disabled={!!busy} value={editor.content} onChange={e => { setEditor({ ...editor, content: e.target.value }); setMessage('') }} /></> : <MarkdownPreview content={editor.content} relations={relations} onOpen={path => void openNote(path)} />}
            <div className="kb-editor-foot"><span>{dirty ? '有未保存修改' : '文件内容已同步'} · {editor.content.length} 字符</span>{!status.readOnly && <button className="kb-primary" aria-label="保存笔记" disabled={!dirty || !!busy || !connected} onClick={() => void save()}><Save size={15} />{busy === 'save' ? '保存中…' : '保存笔记'}</button>}</div>
            {message && <p className="kb-success" role="status">{message}</p>}
            {error && dirty && <div className="kb-draft-actions"><button onClick={() => { const blob = new Blob([editor.content], { type: 'text/markdown;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = editor.path.split('/').pop() || 'draft.md'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }}>导出当前草稿</button><button onClick={() => { if (window.confirm('重新读取会放弃当前未保存草稿，请先导出或复制需要保留的内容。继续？')) void openNote(editor.note.path, true) }} disabled={!!busy || editor.note.version === null}>重新读取文件</button></div>}
          </> : <div className="kb-empty-editor"><Network size={44} strokeWidth={1} /><h2>给想法一个留下来的地方。</h2><p>选择一篇笔记，或从今天的 Inbox 开始。<br />用 [[双向链接]]，把独立的想法连起来。</p><button onClick={newNote} disabled={!connected || status.readOnly}><Plus size={16} />写第一篇笔记</button></div>}
        </section>
        <aside className="kb-relations"><div className="kb-section-label"><Network size={16} /><h2>知识连接</h2></div><p className="kb-muted">每一个链接，都让下一次思考多一条路。</p><h3>引用的笔记</h3>{relations ? relations.outgoing.length ? relations.outgoing.map((link, i) => <div className="kb-relation" key={i}>{link.path ? <button onClick={() => void openNote(link.path!)}>{link.label}<ArrowUpRight size={13} /></button> : <><span>{link.label}</span><small>{link.status === 'ambiguous' ? '存在同名笔记' : link.status === 'attachment' ? '附件 · 在 Obsidian 查看' : '未创建'}</small>{link.status === 'ambiguous' && <small>{link.candidates.join(' / ')}</small>}</>}</div>) : <p className="kb-muted">暂无引用</p> : <p className="kb-muted">{editor ? '保存或重新读取后更新关联' : '打开笔记后显示'}</p>}<h3>被这些笔记引用</h3>{relations?.backlinks.length ? relations.backlinks.map(n => <div className="kb-relation" key={n.path}><button onClick={() => void openNote(n.path)}>{n.title}<ArrowUpRight size={13} /></button><small>{n.path}</small></div>) : <p className="kb-muted">暂无反向链接</p>}<div className="kb-principle"><span className="kb-eyebrow">慢慢积累</span><p>先写下来。<br />让连接随着使用生长。</p></div></aside>
      </div>
    </>}
  </main>
}

export default function KnowledgeWorkspace(props: { api?: KnowledgeApi; initialTab?: 'workspace' | 'garden' | 'setup' }): JSX.Element | null {
  const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
  const cloud = !props.api && isCloudKnowledge()
  const [hasToken, setHasToken] = useState(() => !!sessionStorage.getItem(cloudTokenKey))
  const [probing, setProbing] = useState(() => !props.api && localHost && !cloud)
  const unlocked = !cloud || hasToken
  const [token, setToken] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  // A local page with no running local service falls back to the synced cloud library.
  useEffect(() => {
    if (!probing) return
    let active = true
    knowledgeApi.status().catch(() => { if (active) preferCloudOnLocal(true) }).finally(() => { if (active) setProbing(false) })
    return () => { active = false }
  }, [probing])
  async function unlock(e: React.FormEvent) {
    e.preventDefault(); setError(''); setBusy(true)
    try {
      if (token.trim().length < 32) throw new Error('访问码至少 32 个字符。')
      sessionStorage.setItem(cloudTokenKey, token.trim())
      await knowledgeApi.status()
      setToken(''); setHasToken(true)
    } catch (e) { sessionStorage.removeItem(cloudTokenKey); setError(errorText(e)) }
    finally { setBusy(false) }
  }
  if (probing) return null
  if (!unlocked) return <main className="kb-page"><section className="kb-offline">
    <span className="kb-eyebrow">YOUR PRIVATE LIBRARY</span><h1>解锁知识图谱</h1><p>输入资料库访问码，查看真实笔记与蒲公英网络。</p>
    <form onSubmit={e => void unlock(e)} className="kb-cloud-login"><label htmlFor="knowledge-token">资料库访问码</label><input id="knowledge-token" type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} required /><button className="kb-primary" disabled={busy}>{busy ? '正在连接…' : '解锁资料库'}</button></form>
    {error && <p className="kb-alert" role="alert">{error}</p>}<p className="kb-muted">访问码只保留在当前浏览器会话。原始 Markdown 保存在你的本机。</p>{['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) && <button onClick={() => { preferCloudOnLocal(false); window.location.reload() }}>切回本地 Vault</button>}
  </section></main>
  return <>{cloud && <div className="kb-cloud-session"><span>私人云端副本 · 只读</span><button onClick={() => { sessionStorage.removeItem(cloudTokenKey); setHasToken(false) }}>锁定资料库</button>{['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) && <button onClick={() => { preferCloudOnLocal(false); window.location.reload() }}>切回本地 Vault</button>}</div>}<Workspace {...props} /></>
}
