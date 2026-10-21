import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, FolderCog, Plus, Upload } from 'lucide-react'
import { PageTitle } from '../components/ui/PageTabs'
import { Callout, Card, Dialog, EmptyState, Page } from '../components/ui'
import { fetchQuotes, marketToday } from '../features/grid-trading/marketData'
import type { Quote } from '../features/grid-trading/types'
import {
  ACTIONS, CONCLUSIONS, SENTIMENTS, addGroup, addItem, deleteGroup, deleteNote, loadState, normalizeState, notesOf, removeItem,
  renameGroup, saveState, setItemGroup, upsertNote, type DailyNote, type ReviewState, type WatchItem,
} from '../features/etf-review/store'
import '../styles/etf-review.css'

type NoteForm = { date: string; premium: string; sentiment: string; conclusion: string; action: string; risk: string; remark: string }
const blankNote = (date: string): NoteForm => ({ date, premium: '', sentiment: '', conclusion: '', action: '', risk: '', remark: '' })
const formOf = (n: DailyNote): NoteForm => ({ date: n.date, premium: n.premium == null ? '' : String(n.premium), sentiment: n.sentiment ?? '', conclusion: n.conclusion ?? '', action: n.action ?? '', risk: n.risk, remark: n.remark })
const toneOf = (c: string | null) => (c === '看多' ? 'up' : c === '看空' ? 'down' : 'flat')

export default function EtfReview(): JSX.Element {
  const [state, setStateRaw] = useState<ReviewState>(() => loadState())
  const [saveError, setSaveError] = useState(false)
  const [filter, setFilter] = useState<string>('all')
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map())
  const [quoteError, setQuoteError] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [noteFor, setNoteFor] = useState<WatchItem | null>(null)
  const [message, setMessage] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const setState = (next: ReviewState) => { setStateRaw(next); setSaveError(!saveState(next)) }

  const codesKey = state.items.map(i => i.code).join(',')
  useEffect(() => {
    if (!codesKey) { setQuotes(new Map()); return }
    let alive = true
    fetchQuotes(codesKey.split(','))
      .then(m => { if (alive) { setQuotes(m); setQuoteError('') } })
      .catch(e => { if (alive) setQuoteError(e instanceof Error ? e.message : '行情暂不可用') })
    return () => { alive = false }
  }, [codesKey])

  const visible = useMemo(() => state.items.filter(i => filter === 'all' || (filter === 'none' ? i.group === '' : i.group === filter)), [state.items, filter])

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `etf-review-${marketToday()}.json`; a.click()
    URL.revokeObjectURL(a.href)
  }
  const importJson = async (file: File) => {
    try {
      const next = normalizeState(JSON.parse(await file.text()))
      if (!next.items.length && !next.notes.length) { setMessage('文件里没有可导入的标的或笔记。'); return }
      setState(next); setMessage(`已导入 ${next.items.length} 个标的、${next.notes.length} 条笔记（覆盖当前数据）。`)
    } catch { setMessage('文件不是有效的 JSON，未导入。') }
  }

  return (
    <Page className="etf-review-page">
      <PageTitle>ETF 复盘</PageTitle>
      <Callout tone="muted" className="etf-review-gap">
        自选 ETF 的每日复盘笔记：记下溢价、情绪、结论和计划动作，事后回看自己的判断。数据只保存在当前浏览器，建议定期「导出备份」；不构成投资建议。
      </Callout>
      <div className="page-toolbar etf-review-toolbar">
        <button type="button" className="tool-btn tool-btn--primary" onClick={() => setAddOpen(true)}><Plus size={15} aria-hidden="true" />添加标的</button>
        <button type="button" className="tool-btn" onClick={() => setGroupsOpen(true)}><FolderCog size={15} aria-hidden="true" />管理分组</button>
        <button type="button" className="tool-btn" onClick={exportJson} disabled={!state.items.length}><Download size={15} aria-hidden="true" />导出备份</button>
        <button type="button" className="tool-btn" onClick={() => fileRef.current?.click()}><Upload size={15} aria-hidden="true" />导入</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden aria-label="导入备份文件" onChange={e => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = '' }} />
        <Link className="tool-btn" to="/grid-trading/records">网格记录</Link>
      </div>
      {message && <p className="etf-review-message" role="status">{message}</p>}
      {saveError && <Callout tone="danger" className="etf-review-gap">本机存储写入失败（可能是隐私模式或空间不足），当前修改不会保留，请先导出备份。</Callout>}
      {quoteError && <p className="etf-review-message" role="status">行情暂不可用：{quoteError}</p>}

      {state.items.length > 0 && (
        <div className="ui-cluster etf-review-filters" role="group" aria-label="分组筛选">
          {[{ id: 'all', label: '全部', n: state.items.length }, ...state.groups.map(g => ({ id: g, label: g, n: state.items.filter(i => i.group === g).length })), { id: 'none', label: '未分组', n: state.items.filter(i => i.group === '').length }]
            .filter(c => c.id !== 'none' || c.n > 0).map(c => (
              <button key={c.id} type="button" aria-pressed={filter === c.id} className={filter === c.id ? 'ui-chip is-active' : 'ui-chip'} onClick={() => setFilter(c.id)}>
                {c.label}<span className="ui-chip__count">{c.n}</span>
              </button>
            ))}
        </div>
      )}

      {state.items.length === 0 ? (
        <EmptyState title="还没有自选 ETF">点「添加标的」输入 6 位 ETF 代码开始复盘。</EmptyState>
      ) : (
        <div className="etf-review-grid">
          {visible.map(item => {
            const notes = notesOf(state, item.code)
            const last = notes[0]
            const q = quotes.get(item.code)
            return (
              <Card key={item.code} className="etf-review-card">
                <div className="etf-review-card__head">
                  <div><strong>{item.name}</strong><span className="etf-review-code">{item.code}</span></div>
                  <select aria-label={`${item.name}所属分组`} className="ui-input etf-review-group" value={item.group} onChange={e => setState(setItemGroup(state, item.code, e.target.value))}>
                    <option value="">未分组</option>
                    {state.groups.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="etf-review-quote">{q ? <>现价 <b>{q.price.toFixed(3)}</b><small>{q.date}</small></> : <small>行情未取得</small>}</div>
                {last ? (
                  <div className="etf-review-last">
                    <small>{last.date}{last.premium != null ? ` · 溢价 ${last.premium}%` : ''}</small>
                    <div className="etf-review-badges">
                      {last.conclusion && <span className={`etf-review-badge etf-review-badge--${toneOf(last.conclusion)}`}>{last.conclusion}</span>}
                      {last.action && <span className="etf-review-badge">{last.action}</span>}
                      {last.sentiment && <span className="etf-review-badge">{last.sentiment}</span>}
                    </div>
                    {last.risk && <p>风险点：{last.risk}</p>}
                    {last.remark && <p className="etf-review-remark">{last.remark}</p>}
                  </div>
                ) : <p className="etf-review-empty">还没有复盘笔记</p>}
                <div className="etf-review-card__actions">
                  <button type="button" className="tool-btn tool-btn--primary" onClick={() => setNoteFor(item)}>{notes.length ? `复盘笔记（${notes.length}）` : '写复盘笔记'}</button>
                  <Link className="tool-btn" to={`/grid-trading?code=${item.code}&name=${encodeURIComponent(item.name)}`}>网格</Link>
                  <button type="button" className="tool-btn" onClick={() => { if (window.confirm(`移除 ${item.name}？它的复盘笔记也会一并删除。`)) setState(removeItem(state, item.code)) }}>移除</button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <AddDialog open={addOpen} onClose={() => setAddOpen(false)} groups={state.groups} existing={state.items.map(i => i.code)}
        onAdd={(code, name, group) => { setState(addItem(state, code, name, group)); setAddOpen(false) }} />
      <GroupsDialog open={groupsOpen} onClose={() => setGroupsOpen(false)} state={state} setState={setState} />
      {noteFor && <NotesDialog item={noteFor} state={state} setState={setState} onClose={() => setNoteFor(null)} />}
    </Page>
  )
}

function AddDialog({ open, onClose, groups, existing, onAdd }: { open: boolean; onClose(): void; groups: string[]; existing: string[]; onAdd(code: string, name: string, group: string): void }): JSX.Element | null {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    const c = code.trim()
    if (!/^\d{6}$/.test(c)) { setErr('代码必须是 6 位数字。'); return }
    if (existing.includes(c)) { setErr('这个代码已经在自选里。'); return }
    let finalName = name.trim()
    if (!finalName) {
      setBusy(true)
      try { finalName = (await fetchQuotes([c])).get(c)?.name ?? '' } catch { /* 名称可选 */ }
      setBusy(false)
    }
    onAdd(c, finalName, group); setCode(''); setName(''); setGroup(''); setErr('')
  }
  return (
    <Dialog open={open} onClose={onClose} title="添加观察标的" size="sm"
      actions={<><button type="button" className="tool-btn" onClick={onClose}>取消</button><button type="button" className="tool-btn tool-btn--primary" disabled={busy} onClick={() => void submit()}>{busy ? '查询名称…' : '添加'}</button></>}>
      <div className="etf-review-form">
        <label>ETF 代码<input className="ui-input" value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="如 510300" /></label>
        <label>名称（可选，留空自动查询）<input className="ui-input" value={name} onChange={e => setName(e.target.value)} maxLength={40} /></label>
        <label>所属分组<select className="ui-input" value={group} onChange={e => setGroup(e.target.value)}><option value="">未分组</option>{groups.map(g => <option key={g} value={g}>{g}</option>)}</select></label>
        {err && <p className="etf-review-error" role="alert">{err}</p>}
      </div>
    </Dialog>
  )
}

function GroupsDialog({ open, onClose, state, setState }: { open: boolean; onClose(): void; state: ReviewState; setState(s: ReviewState): void }): JSX.Element | null {
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<{ from: string; to: string } | null>(null)
  return (
    <Dialog open={open} onClose={onClose} title="管理分组" size="sm" actions={<button type="button" className="tool-btn" onClick={onClose}>完成</button>}>
      <p className="etf-review-hint">删除分组只会移除标签，不会删除 ETF 和笔记。</p>
      <ul className="etf-review-grouplist">
        {state.groups.map(g => (
          <li key={g}>
            {editing?.from === g ? (
              <>
                <input className="ui-input" aria-label="新分组名" value={editing.to} onChange={e => setEditing({ from: g, to: e.target.value })} maxLength={20} />
                <button type="button" className="tool-btn" onClick={() => { setState(renameGroup(state, g, editing.to)); setEditing(null) }}>保存</button>
              </>
            ) : (
              <>
                <span>{g}（{state.items.filter(i => i.group === g).length}）</span>
                <button type="button" className="tool-btn" onClick={() => setEditing({ from: g, to: g })}>改名</button>
                <button type="button" className="tool-btn" onClick={() => setState(deleteGroup(state, g))}>删除</button>
              </>
            )}
          </li>
        ))}
        {!state.groups.length && <li className="etf-review-empty">还没有分组</li>}
      </ul>
      <div className="etf-review-addgroup">
        <input className="ui-input" aria-label="新增分组名称" value={name} onChange={e => setName(e.target.value)} maxLength={20} placeholder="新增分组" />
        <button type="button" className="tool-btn tool-btn--primary" onClick={() => { setState(addGroup(state, name)); setName('') }}>新增</button>
      </div>
    </Dialog>
  )
}

function NotesDialog({ item, state, setState, onClose }: { item: WatchItem; state: ReviewState; setState(s: ReviewState): void; onClose(): void }): JSX.Element {
  const notes = notesOf(state, item.code)
  const today = marketToday()
  const [form, setForm] = useState<NoteForm>(() => { const t = notes.find(n => n.date === today); return t ? formOf(t) : blankNote(today) })
  const [err, setErr] = useState('')
  const set = (k: keyof NoteForm, v: string) => setForm(f => ({ ...f, [k]: v }))
  const pick = (date: string) => { const n = notes.find(x => x.date === date); setForm(n ? formOf(n) : blankNote(date)) }
  const save = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) { setErr('请选择日期。'); return }
    const premium = form.premium.trim() === '' ? null : Number(form.premium)
    if (premium !== null && !Number.isFinite(premium)) { setErr('溢价必须是数字（单位 %）。'); return }
    setState(upsertNote(state, {
      code: item.code, date: form.date, premium,
      sentiment: (form.sentiment || null) as DailyNote['sentiment'], conclusion: (form.conclusion || null) as DailyNote['conclusion'], action: (form.action || null) as DailyNote['action'],
      risk: form.risk.trim(), remark: form.remark.trim(),
    }))
    setErr('')
  }
  const choice = (label: string, key: 'sentiment' | 'conclusion' | 'action', options: readonly string[]) => (
    <div className="etf-review-choice" role="group" aria-label={label}>
      <span>{label}</span>
      {options.map(o => <button key={o} type="button" aria-pressed={form[key] === o} className={form[key] === o ? 'ui-chip is-active' : 'ui-chip'} onClick={() => set(key, form[key] === o ? '' : o)}>{o}</button>)}
    </div>
  )
  return (
    <Dialog open onClose={onClose} title={`${item.name} · 每日复盘`} size="lg"
      actions={<><button type="button" className="tool-btn" onClick={onClose}>关闭</button><button type="button" className="tool-btn tool-btn--primary" onClick={save}>保存这一天</button></>}>
      <div className="etf-review-form">
        <div className="etf-review-row">
          <label>日期<input type="date" className="ui-input" value={form.date} max={today} onChange={e => pick(e.target.value)} /></label>
          <label>ETF 溢价（%）<input className="ui-input" inputMode="decimal" value={form.premium} onChange={e => set('premium', e.target.value)} placeholder="如 0.12，负数为折价" /></label>
        </div>
        {choice('情绪', 'sentiment', SENTIMENTS)}
        {choice('结论', 'conclusion', CONCLUSIONS)}
        {choice('计划动作', 'action', ACTIONS)}
        <label>风险点<input className="ui-input" value={form.risk} onChange={e => set('risk', e.target.value)} maxLength={500} /></label>
        <label>备注<textarea className="ui-input" rows={3} value={form.remark} onChange={e => set('remark', e.target.value)} maxLength={2000} /></label>
        {err && <p className="etf-review-error" role="alert">{err}</p>}
      </div>
      {notes.length > 0 && (
        <ul className="etf-review-history" aria-label="历史笔记">
          {notes.map(n => (
            <li key={n.id}>
              <button type="button" className="etf-review-history__date" onClick={() => pick(n.date)}>{n.date}</button>
              <span>{[n.conclusion, n.action, n.sentiment, n.premium != null ? `溢价${n.premium}%` : null].filter(Boolean).join(' · ') || '（无标签）'}</span>
              <button type="button" className="tool-btn" onClick={() => setState(deleteNote(state, n.id))}>删除</button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}
