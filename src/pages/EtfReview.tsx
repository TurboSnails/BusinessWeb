import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Download, FolderCog, Plus, Upload } from 'lucide-react'
import { PageTitle } from '../components/ui/PageTabs'
import { Callout, Card, Dialog, EmptyState, Page } from '../components/ui'
import { fetchQuotes, marketToday } from '../features/grid-trading/marketData'
import type { Quote } from '../features/grid-trading/types'
import {
  ACTIONS, CONCLUSIONS, SENTIMENTS, addGroup, addItem, deleteGroup, deleteNote, loadState, normalizeState, notesOf, removeItem,
  renameGroup, saveState, setItemGroups, groupsOf, mergeReviewState, upsertNote, type DailyNote, type ReviewState, type WatchItem,
} from '../features/etf-review/store'
import EtfTechCell from '../components/EtfTechCell'
import { useEtfTechnicalState } from '../data/etfTechnical'
import { matchesTechnical, PERIOD_LABELS, TECH_FILTERS, type TechnicalPeriod, type TechnicalFilter } from '../features/etf-review/technicalFilter'
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
  const [search, setSearch] = useSearchParams()
  const [prefill, setPrefill] = useState({ code: '', name: '' })
  const [pendingImport, setPendingImport] = useState<ReviewState | null>(null)
  const { map: tech, status: techStatus, retry: retryTech } = useEtfTechnicalState()
  const [period, setPeriod] = useState<TechnicalPeriod>('day')
  const [technical, setTechnical] = useState<TechnicalFilter>('all')
  const [includeUnfinished, setIncludeUnfinished] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)

  const setState = (next: ReviewState) => { setStateRaw(next); setSaveError(!saveState(next)) }
  const requestedCode = search.get('code') ?? ''
  const requestedName = search.get('name') ?? ''
  useEffect(() => {
    if (!requestedCode) return
    if (!/^\d{6}$/.test(requestedCode)) setMessage('链接中的 ETF 代码无效，未添加标的。')
    else if (state.items.some(i => i.code === requestedCode)) setMessage(`${requestedCode} 已在复盘列表，已保留原名称、分组和笔记。`)
    else { setPrefill({ code: requestedCode, name: requestedName.slice(0, 40) }); setAddOpen(true) }
    setSearch(params => { const next = new URLSearchParams(params); next.delete('code'); next.delete('name'); return next }, { replace: true })
  }, [requestedCode, requestedName, setSearch, state.items])

  const codesKey = state.items.map(i => i.code).join(',')
  useEffect(() => {
    if (!codesKey) { setQuotes(new Map()); return }
    let alive = true
    fetchQuotes(codesKey.split(','))
      .then(m => { if (alive) { setQuotes(m); setQuoteError('') } })
      .catch(e => { if (alive) setQuoteError(e instanceof Error ? e.message : '行情暂不可用') })
    return () => { alive = false }
  }, [codesKey])

  const visible = useMemo(() => state.items.filter(i =>
    (filter === 'all' || (filter === 'none' ? !groupsOf(i).length : groupsOf(i).includes(filter.slice('group:'.length)))) && matchesTechnical(tech.get(i.code), period, technical, includeUnfinished)),
  [state.items, filter, tech, period, technical, includeUnfinished])
  const techCovered = state.items.filter(i => tech.has(i.code)).length
  const hasCompletedPeriod = state.items.some(i => tech.get(i.code)?.[period].complete)
  const showUnfinishedHint = techStatus === 'ready' && technical !== 'all' && !includeUnfinished && techCovered > 0 && !hasCompletedPeriod
  const renameReviewGroup = (from: string, to: string) => {
    const next = renameGroup(state, from, to)
    if (next === state) return
    if (filter === `group:${from}`) setFilter(`group:${to.trim().slice(0, 20)}`)
    setState(next)
  }
  const deleteReviewGroup = (name: string) => {
    if (filter === `group:${name}`) setFilter('all')
    setState(deleteGroup(state, name))
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `etf-review-${marketToday()}.json`; a.click()
    URL.revokeObjectURL(a.href)
  }
  const importJson = async (file: File) => {
    try {
      const raw: unknown = JSON.parse(await file.text())
      if (!raw || typeof raw !== 'object' || !('version' in raw) || ![1, 2].includes(Number(raw.version))) throw new Error('unsupported backup version')
      const next = normalizeState(raw)
      if (!next.items.length && !next.notes.length) { setMessage('文件里没有可导入的标的或笔记。'); return }
      setPendingImport(next)
    } catch { setMessage('备份格式或版本不受支持，未导入。') }
  }

  return (
    <Page className="etf-review-page">
      <PageTitle>ETF 复盘</PageTitle>
      <Callout tone="muted" className="etf-review-gap">
        自选 ETF 的每日复盘笔记：记下溢价、情绪、结论和计划动作，事后回看自己的判断。数据只保存在当前浏览器，建议定期「导出备份」；不构成投资建议。
      </Callout>
      <div className="page-toolbar etf-review-toolbar">
        <button ref={addButtonRef} type="button" className="tool-btn tool-btn--primary" onClick={() => { setPrefill({ code: '', name: '' }); setAddOpen(true) }}><Plus size={15} aria-hidden="true" />添加标的</button>
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
          {[{ id: 'all', label: '全部', n: state.items.length }, ...state.groups.map(g => ({ id: `group:${g}`, label: g, n: state.items.filter(i => groupsOf(i).includes(g)).length })), { id: 'none', label: '未分组', n: state.items.filter(i => !groupsOf(i).length).length }]
            .filter(c => c.id !== 'none' || c.n > 0).map(c => (
              <button key={c.id} type="button" aria-pressed={filter === c.id} className={filter === c.id ? 'ui-chip is-active' : 'ui-chip'} onClick={() => setFilter(c.id)}>
                {c.label}<span className="ui-chip__count">{c.n}</span>
              </button>
            ))}
        </div>
      )}

      <section className="etf-review-technical" aria-label="技术面筛选">
        {techStatus === 'loading' && <p role="status">正在加载技术快照…</p>}
        {techStatus === 'error' && <p role="alert">技术快照加载失败，已保留复盘笔记。<button type="button" className="tool-btn" onClick={retryTech}>重试技术快照</button></p>}
        <div className="etf-review-toolbar page-toolbar">
          <label>技术周期 <select className="ui-input" value={period} onChange={e => setPeriod(e.target.value as TechnicalPeriod)}>{Object.entries(PERIOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>MACD 条件 <select className="ui-input" value={technical} onChange={e => setTechnical(e.target.value as TechnicalFilter)}>{TECH_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</select></label>
          <label><input type="checkbox" checked={includeUnfinished} onChange={e => setIncludeUnfinished(e.target.checked)} />包括未完成周期</label>
        </div>
        <p className="etf-review-hint">金叉/死叉指本期柱值相对前期穿越零轴，偏多/偏空是持续状态；筛选默认排除未完成周期。指标为历史观察，不是买卖指令。{techStatus === 'loading' ? '技术快照加载中。' : techStatus === 'error' ? '技术快照未取得；条件筛选不把缺数当成信号。' : state.items.length ? `已取得 ${techCovered}/${state.items.length} 只自选标的的技术快照（快照共 ${tech.size} 只），逐只日期见下方。` : `技术快照已加载，共 ${tech.size} 只；添加标的后显示自选覆盖。`} <Link to="/industry-etf">查看 ETF 清单</Link></p>
        {showUnfinishedHint && <p className="etf-review-hint" role="status">当前快照中，自选标的的{PERIOD_LABELS[period]}均为未完成周期；勾选「包括未完成周期」可查看当前信号，或等待下一期完成数据。</p>}
      </section>

      {state.items.length === 0 ? (
        <EmptyState title="还没有自选 ETF">点「添加标的」输入 6 位 ETF 代码开始复盘。</EmptyState>
      ) : (
        <div className="etf-review-grid">
          {!visible.length && <EmptyState title="没有符合条件的 ETF">可放宽分组或技术条件；未完成周期与缺失数据不会匹配已完成信号。</EmptyState>}
          {visible.map(item => {
            const notes = notesOf(state, item.code)
            const last = notes[0]
            const q = quotes.get(item.code)
            return (
              <Card key={item.code} className="etf-review-card">
                <div className="etf-review-card__head">
                  <div><strong>{item.name}</strong><span className="etf-review-code">{item.code}</span></div>
                  <details className="etf-review-tags"><summary>{groupsOf(item).join('、') || '未分组'} · 修改分组</summary>
                    <fieldset><legend>{item.name}所属分组（可多选）</legend>{state.groups.length ? state.groups.map(g => <label key={g}><input type="checkbox" checked={groupsOf(item).includes(g)} onChange={e => setState(setItemGroups(state, item.code, e.target.checked ? [...groupsOf(item), g] : groupsOf(item).filter(v => v !== g)))} />{g}</label>) : <span>先在「管理分组」创建标签。</span>}</fieldset>
                  </details>
                </div>
                <div className="etf-review-quote">{q ? <>现价 <b>{q.price.toFixed(3)}</b><small>{q.date}</small></> : <small>行情未取得</small>}</div>
                <EtfTechCell rec={tech.get(item.code)} />
                {techStatus === 'ready' && !tech.has(item.code) && <p className="etf-review-hint">未纳入本期技术快照；条件筛选不会把缺数当成信号。</p>}
                {tech.get(item.code) && <p className="etf-review-hint">技术快照 {tech.get(item.code)!.asOf} · {tech.get(item.code)!.priceSeries === 'qfqday' ? '腾讯前复权' : '来源原价格口径'} · {PERIOD_LABELS[period]} {tech.get(item.code)![period].asOf} · {tech.get(item.code)![period].count} 根{!tech.get(item.code)![period].complete && ' · 未完成周期'}{tech.get(item.code)!.asOf < marketToday() && ' · 非今日快照'}</p>}
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

      <AddDialog key={`${prefill.code}:${addOpen}`} initialCode={prefill.code} initialName={prefill.name} open={addOpen} onClose={() => setAddOpen(false)} groups={state.groups} existing={state.items.map(i => i.code)} fallbackFocusRef={addButtonRef}
        onAdd={(code, name, group) => { setState(addItem(state, code, name, group)); setAddOpen(false) }} />
      <GroupsDialog open={groupsOpen} onClose={() => setGroupsOpen(false)} state={state} setState={setState} onRename={renameReviewGroup} onDelete={deleteReviewGroup} />
      {noteFor && <NotesDialog item={noteFor} state={state} setState={setState} onClose={() => setNoteFor(null)} />}
      <Dialog open={!!pendingImport} onClose={() => setPendingImport(null)} title="导入复盘备份" size="sm" actions={<><button type="button" className="tool-btn" onClick={() => setPendingImport(null)}>取消</button><button type="button" className="tool-btn" onClick={exportJson} disabled={!state.items.length}>先导出当前数据</button><button type="button" className="tool-btn tool-btn--primary" onClick={() => { if (pendingImport) { setState(mergeReviewState(state, pendingImport)); setMessage('已合并备份；同日冲突保留当前笔记。'); setPendingImport(null) } }}>合并导入</button><button type="button" className="tool-btn" onClick={() => { if (pendingImport && window.confirm('替换会删除当前备份中没有的标的和笔记。确认已导出备份并替换？')) { setState(pendingImport); setMessage('已用备份替换当前复盘数据。'); setPendingImport(null) } }}>替换全部</button></>}>
        <p>备份含 {pendingImport?.items.length ?? 0} 个标的、{pendingImport?.notes.length ?? 0} 条笔记。合并会补入新标的和分组，同一标的同一天保留当前笔记。</p>
      </Dialog>
    </Page>
  )
}

function AddDialog({ open, onClose, groups, existing, onAdd, initialCode = '', initialName = '', fallbackFocusRef }: { open: boolean; onClose(): void; groups: string[]; existing: string[]; initialCode?: string; initialName?: string; fallbackFocusRef?: React.RefObject<HTMLElement>; onAdd(code: string, name: string, group: string): void }): JSX.Element | null {
  const [code, setCode] = useState(initialCode)
  const [name, setName] = useState(initialName)
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
    <Dialog open={open} onClose={onClose} title="添加观察标的" size="sm" fallbackFocusRef={fallbackFocusRef}
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

function GroupsDialog({ open, onClose, state, setState, onRename, onDelete }: { open: boolean; onClose(): void; state: ReviewState; setState(s: ReviewState): void; onRename(from: string, to: string): void; onDelete(name: string): void }): JSX.Element | null {
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
                <button type="button" className="tool-btn" onClick={() => { onRename(g, editing.to); setEditing(null) }}>保存</button>
              </>
            ) : (
              <>
                <span>{g}（{state.items.filter(i => groupsOf(i).includes(g)).length}）</span>
                <button type="button" className="tool-btn" onClick={() => setEditing({ from: g, to: g })}>改名</button>
                <button type="button" className="tool-btn" onClick={() => onDelete(g)}>删除</button>
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
