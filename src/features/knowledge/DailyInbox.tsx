import React, { useEffect, useRef, useState } from 'react'
import { Inbox, ArrowUpRight } from 'lucide-react'
import { KnowledgeApiError, errorText } from './api'
import type { KnowledgeApi, Note } from './api'

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export default function DailyInbox({ api, vaultKey, vaultId, onSaved, onError }: { api: KnowledgeApi; vaultKey: string; vaultId: string; onSaved(note: Note): void; onError(message: string): void }): JSX.Element {
  const key = `knowledge-inbox:${vaultKey}`
  const [text, setText] = useState(() => { try { return sessionStorage.getItem(key) || '' } catch { return '' } })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const alive = useRef(true), sequence = useRef(0)
  useEffect(() => { alive.current = true; return () => { alive.current = false; sequence.current++ } }, [vaultKey, vaultId])
  useEffect(() => { try { text ? sessionStorage.setItem(key, text) : sessionStorage.removeItem(key) } catch { /* 输入仍保存在当前页面 */ } }, [key, text])
  async function submit() {
    if (!text.trim() || busy) return
    const date = today(), captured = text, id = ++sequence.current
    const active = () => alive.current && sequence.current === id
    setBusy(true); setMessage(''); onError('')
    try {
      let version: string | null = null
      try { version = (await api.read(`00-Inbox/${date}.md`)).version }
      catch (e) { if (!(e instanceof KnowledgeApiError && e.status === 404)) throw e }
      if (!active()) return
      const note = await api.inbox(date, captured, version, vaultId)
      if (!active()) return
      setText(current => current === captured ? '' : current)
      setMessage('已记入今日 Inbox'); onSaved(note)
    } catch (error) { if (active()) onError(errorText(error)) }
    finally { if (active()) setBusy(false) }
  }
  return <section className="kb-inbox">
    <div className="kb-section-label"><Inbox size={16} /><h2>每日 Inbox</h2><span>先记录，再整理</span></div>
    <label className="kb-sr-only" htmlFor="kb-inbox">每日 Inbox</label>
    <textarea id="kb-inbox" value={text} disabled={busy} onChange={e => { setText(e.target.value); setMessage('') }} placeholder="今天想到什么？一个念头、一段观察，或一个值得追问的问题。" rows={3} />
    <div className="kb-inbox-foot"><small>{today()} · 保存为 Markdown</small><button type="button" disabled={!text.trim() || busy} onClick={submit}>{busy ? '记录中…' : '记入 Inbox'}<ArrowUpRight size={15} /></button></div>
    {message && <p role="status" className="kb-success">{message}</p>}
  </section>
}
