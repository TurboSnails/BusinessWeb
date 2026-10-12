import React, { useEffect, useState } from 'react'
import '../../styles/ask-lab.css'

const DAILY_LIMIT = 2
const MAX_LENGTH = 500
const STORAGE_KEY = 'askLab.accessToken'
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const apiBase = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

const readToken = (): string => { try { return sessionStorage.getItem(STORAGE_KEY) ?? '' } catch { return '' } }
const writeToken = (token: string): void => { try { token ? sessionStorage.setItem(STORAGE_KEY, token) : sessionStorage.removeItem(STORAGE_KEY) } catch { /* 隐私模式下不保存登录态 */ } }

// Supabase OAuth 回跳后 token 在 URL hash 里：取出后立即从地址栏清掉。
function takeTokenFromHash(): string {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const token = params.get('access_token') ?? ''
  if (token) window.history.replaceState(null, '', window.location.pathname + window.location.search)
  return token
}

export default function AskLab(): JSX.Element | null {
  const [token, setToken] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const fromHash = takeTokenFromHash()
    if (fromHash) writeToken(fromHash)
    setToken(fromHash || readToken())
  }, [])

  if (!supabaseUrl || !supabaseAnon) return null

  const login = (provider: 'google' | 'github') => {
    const back = encodeURIComponent(window.location.origin + window.location.pathname)
    window.location.href = `${supabaseUrl}/auth/v1/authorize?provider=${provider}&redirect_to=${back}`
  }
  const logout = () => { writeToken(''); setToken(''); setAnswer(''); setError('') }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy || question.trim().length < 2) return
    setBusy(true); setError(''); setAnswer('')
    try {
      const response = await fetch(`${apiBase}/api/ask`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ question }),
      })
      const data = (await response.json().catch(() => ({}))) as { answer?: string; error?: string }
      if (response.status === 401) logout()
      if (!response.ok || !data.answer) throw new Error(data.error || '请求失败，请稍后再试')
      setAnswer(data.answer)
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败，请稍后再试')
    } finally {
      setBusy(false)
    }
  }

  const length = question.length
  const canSubmit = !busy && question.trim().length >= 2
  const submitOnShortcut = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.currentTarget.form?.requestSubmit() }
  }

  return (
    <section id="lab-ask" className="lab-section ask-lab" aria-labelledby="lab-ask-title">
      <h2 id="lab-ask-title">试问 AI</h2>
      <div className="ask-lab__card">
        <p className="ask-lab__intro">用 Google 或 GitHub 登录后，每天可免费提问 {DAILY_LIMIT} 次，范围限于投资研究方法与 AI 工具使用。回答仅供参考，不构成投资建议。<a href={`${import.meta.env.BASE_URL}ai-privacy.html`}>登录与提问隐私说明</a></p>
        {token ? (
          <form onSubmit={submit} className="ask-lab__form">
            <div className="ui-field">
              <label className="ui-field__label" htmlFor="lab-ask-input">你的问题</label>
              <textarea id="lab-ask-input" value={question} maxLength={MAX_LENGTH} rows={4} onChange={e => setQuestion(e.target.value)} onKeyDown={submitOnShortcut}
                placeholder="例如：怎样用三情景法给一家公司做估值？" aria-describedby="lab-ask-count" />
              <div className="ask-lab__meta">
                <span className="ui-field__hint">Ctrl / ⌘ + Enter 提交</span>
                <span id="lab-ask-count" className={length > MAX_LENGTH - 50 ? 'ask-lab__count is-near' : 'ask-lab__count'}>{length} / {MAX_LENGTH}</span>
              </div>
            </div>
            <div className="ask-lab__actions">
              <button type="submit" className="tool-btn tool-btn--primary ask-lab__submit" disabled={!canSubmit}>{busy ? '思考中…' : '提问'}</button>
              <span className="ask-lab__account">已登录<button type="button" className="ask-lab__logout" onClick={logout}>退出登录</button></span>
            </div>
          </form>
        ) : (
          <div className="ask-lab__actions ask-lab__actions--login">
            <button type="button" className="tool-btn tool-btn--primary" onClick={() => login('google')}>使用 Google 登录</button>
            <button type="button" className="tool-btn" onClick={() => login('github')}>使用 GitHub 登录</button>
          </div>
        )}
        {error && <div className="ui-callout ui-callout--warn ask-lab__error" role="alert">{error}</div>}
        {(busy || answer) && <article className="ask-lab__answer-card" aria-live="polite" aria-busy={busy}>
          <h3>回答</h3>
          {busy ? <p className="ask-lab__pending">正在思考…</p> : <p className="ask-lab__answer">{answer}</p>}
          {!busy && <p className="ask-lab__disclaimer">仅供参考，不构成投资建议。</p>}
        </article>}
      </div>
    </section>
  )
}
