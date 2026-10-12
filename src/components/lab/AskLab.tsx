import React, { useEffect, useState } from 'react'

const DAILY_LIMIT = 2
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

  return (
    <section id="lab-ask" className="lab-section" aria-labelledby="lab-ask-title">
      <h2 id="lab-ask-title">试问 AI</h2>
      <p>用 Google 或 GitHub 登录后，每天可免费提问 {DAILY_LIMIT} 次，范围限于投资研究方法与 AI 工具使用。回答仅供参考，不构成投资建议。</p>
      <p><a href={`${import.meta.env.BASE_URL}ai-privacy.html`}>登录与提问隐私说明</a></p>
      {token ? (
        <form onSubmit={submit} className="lab-ask__form">
          <label htmlFor="lab-ask-input">你的问题</label>
          <textarea id="lab-ask-input" value={question} maxLength={500} rows={3} onChange={e => setQuestion(e.target.value)} placeholder="例如：怎样用三情景法给一家公司做估值？" />
          <div className="skill-download-actions">
            <button type="submit" className="skill-download" disabled={busy || question.trim().length < 2}>{busy ? '思考中…' : '提问'}</button>
            <button type="button" className="skill-guide" onClick={logout}>退出登录</button>
          </div>
        </form>
      ) : (
        <div className="skill-download-actions">
          <button type="button" className="skill-download" onClick={() => login('google')}>使用 Google 登录</button>
          <button type="button" className="skill-download" onClick={() => login('github')}>使用 GitHub 登录</button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {answer && <article className="skill-card" aria-live="polite"><p className="ask-lab__answer">{answer}</p></article>}
    </section>
  )
}
