import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, LockKeyhole } from 'lucide-react'
import { Page } from '../components/ui'
import { renderMarkdown } from '../components/MarkdownView'
import { unlockReport } from '../features/human3/privateReport'
import encrypted from '../features/human3/personal-report.encrypted.json'
import '../styles/personal-life.css'

export default function PersonalLifeAnalysis(): JSX.Element {
  const [password, setPassword] = useState('')
  const [report, setReport] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const mounted = useRef(true)
  const contentRef = useRef<HTMLElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { if (error && !busy && !report) passwordRef.current?.focus() }, [error, busy, report])

  async function unlock(event: React.FormEvent) {
    event.preventDefault()
    if (pending.current || !password) return
    pending.current = true; setBusy(true); setError('')
    try {
      const plaintext = await unlockReport(password, encrypted)
      if (mounted.current) {
        setReport(plaintext); setPassword('')
        window.setTimeout(() => contentRef.current?.focus(), 0)
      }
    } catch {
      if (mounted.current) {
        setPassword('')
        setError(globalThis.crypto?.subtle ? '密码不正确或报告无法解密，请重新输入。' : '当前环境不支持解密，请使用 HTTPS 或 localhost 地址打开。')
      }
    } finally {
      pending.current = false
      if (mounted.current) setBusy(false)
    }
  }

  return <Page variant="reading" className="personal-life">
    <Link to="/life" className="personal-life__back"><ArrowLeft size={16} aria-hidden="true" />自由之路</Link>
    <header className="personal-life__header"><h1>我的人生解析</h1><p>Human 3.0 四象限评估与90天行动方向 · 2026年10月21日</p></header>
    {report ? <>
      <div className="personal-life__toolbar"><span>已解锁，仅本页临时显示</span><button className="tool-btn" onClick={() => { setReport(''); setPassword(''); setError(''); window.setTimeout(() => passwordRef.current?.focus(), 0) }}><LockKeyhole size={16} aria-hidden="true" />重新锁定</button></div>
      <article ref={contentRef} tabIndex={-1} className="personal-life__document" aria-label="个人解析正文">{renderMarkdown(report)}</article>
    </> : <section className="personal-life__gate" aria-labelledby="personal-unlock-title">
      <LockKeyhole size={28} aria-hidden="true" />
      <h2 id="personal-unlock-title">输入密码，继续阅读</h2>
      <p>正文已加密。解锁后在当前页面临时显示，刷新或离开后需要重新输入密码。</p>
      <form onSubmit={event => void unlock(event)} aria-busy={busy}>
        <label htmlFor="life-report-password">阅读密码</label>
        <input ref={passwordRef} id="life-report-password" type="password" autoComplete="off" required value={password} disabled={busy} onChange={event => setPassword(event.target.value)} aria-describedby={error ? 'life-report-error' : undefined} />
        <button type="submit" className="tool-btn tool-btn--primary" disabled={busy || !password}>{busy ? '正在解锁…' : '解锁阅读'}</button>
      </form>
      {error && <p id="life-report-error" role="alert">{error}</p>}
    </section>}
  </Page>
}
