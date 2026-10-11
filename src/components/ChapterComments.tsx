import React, { useEffect, useState } from 'react'

type Comment = { id: string; nickname: string; content: string; created_at: string; status?: string }
const TOKEN_KEY = 'comments-admin-token'
const STATUS_LABEL: Record<string, string> = { pending: '待审核', approved: '已显示', rejected: '已驳回' }

function storedToken(): string {
  try { return sessionStorage.getItem(TOKEN_KEY) ?? '' } catch { return '' }
}
function saveToken(value: string): void {
  try { value ? sessionStorage.setItem(TOKEN_KEY, value) : sessionStorage.removeItem(TOKEN_KEY) } catch { /* 隐私模式下忽略 */ }
}
type Notice = { kind: 'ok' | 'error'; text: string }

/** 章节评论：匿名提交，经审核后显示。后端为 /api/comments。 */
export default function ChapterComments({ slug, title = '读者评论' }: { slug: string; title?: string }): JSX.Element {
  const [comments, setComments] = useState<Comment[]>([])
  const [disabled, setDisabled] = useState(false)
  const [nickname, setNickname] = useState('')
  const [content, setContent] = useState('')
  const [website, setWebsite] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [token, setToken] = useState(storedToken)
  const [tokenInput, setTokenInput] = useState('')
  const [loginOpen, setLoginOpen] = useState(false)
  const [reload, setReload] = useState(0)
  const admin = token !== ''
  const authHeader = { authorization: `Bearer ${token}` }

  function logout(text?: string) {
    saveToken('')
    setToken('')
    if (text) setNotice({ kind: 'error', text })
  }

  useEffect(() => {
    let alive = true
    setComments([])
    setDisabled(false)
    fetch(`/api/comments?slug=${encodeURIComponent(slug)}`, admin ? { headers: authHeader } : undefined)
      .then(async r => {
        if (r.status === 401 && alive) return logout('管理员 token 无效，已退出管理')
        if (r.status === 503) return alive && (admin ? logout('管理员 token 尚未在服务端配置') : setDisabled(true))
        if (!r.ok) return
        const data: unknown = await r.json()
        const list = (data as { comments?: unknown })?.comments
        if (alive && Array.isArray(list)) setComments(list as Comment[])
      })
      .catch(() => undefined)
    return () => { alive = false }
  }, [slug, token, reload]) // eslint-disable-line react-hooks/exhaustive-deps

  if (disabled) return <></>

  async function moderate(id: string, action: 'approve' | 'reject' | 'delete') {
    setNotice(null)
    try {
      const r = action === 'delete'
        ? await fetch(`/api/comments?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeader })
        : await fetch('/api/comments', {
          method: 'PATCH', headers: { ...authHeader, 'content-type': 'application/json' },
          body: JSON.stringify({ id, status: action === 'approve' ? 'approved' : 'rejected' }),
        })
      if (r.status === 401) return logout('管理员 token 无效，已退出管理')
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string }
        return setNotice({ kind: 'error', text: data.error ?? '操作失败，请稍后重试' })
      }
      setReload(n => n + 1)
    } catch {
      setNotice({ kind: 'error', text: '网络异常，请稍后重试' })
    }
  }

  function login(event: React.FormEvent) {
    event.preventDefault()
    const value = tokenInput.trim()
    if (!value) return
    saveToken(value)
    setToken(value)
    setTokenInput('')
    setLoginOpen(false)
    setNotice(null)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSending(true)
    setNotice(null)
    try {
      const r = await fetch('/api/comments', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, nickname, content, website }),
      })
      const data = (await r.json().catch(() => ({}))) as { message?: string; error?: string }
      if (r.ok) {
        setContent('')
        setNotice({ kind: 'ok', text: data.message ?? '已提交，审核通过后显示' })
      } else {
        setNotice({ kind: 'error', text: data.error ?? '提交失败，请稍后重试' })
      }
    } catch {
      setNotice({ kind: 'error', text: '网络异常，请稍后重试' })
    } finally {
      setSending(false)
    }
  }

  return (
    <section aria-label={title} className="ui-card book-comments">
      <h3 className="comments-title">{title}{comments.length > 0 && `（${comments.length}）`}</h3>
      {comments.length === 0 && <p className="comments-empty">还没有评论，欢迎留下你的想法。</p>}
      <ul className="comments-list">
        {comments.map(c => (
          <li key={c.id} className="comments-item">
            <div className="comments-meta">
              {c.nickname} · {new Date(c.created_at).toLocaleDateString('zh-CN')}
              {admin && c.status && ` · ${STATUS_LABEL[c.status] ?? c.status}`}
            </div>
            <div className="comments-content">{c.content}</div>
            {admin && (
              <div className="comments-actions">
                {c.status !== 'approved' && <button type="button" onClick={() => moderate(c.id, 'approve')} className="comments-link">通过</button>}
                {c.status !== 'rejected' && <button type="button" onClick={() => moderate(c.id, 'reject')} className="comments-link">驳回</button>}
                <button type="button" onClick={() => moderate(c.id, 'delete')} className="comments-link is-danger">删除</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="comments-form">
        <input aria-label="昵称（可不填）" placeholder="昵称（可不填）" maxLength={20} value={nickname} onChange={e => setNickname(e.target.value)} className="ui-input" />
        <textarea aria-label="评论内容" placeholder="写下你的想法或疑问（2–1000 字，审核后显示）" required minLength={2} maxLength={1000} rows={4} value={content} onChange={e => setContent(e.target.value)} className="ui-input comments-textarea" />
        {/* 蜜罐：对真人隐藏 */}
        <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={e => setWebsite(e.target.value)} className="comments-honeypot" />
        <div className="ui-cluster">
          <button type="submit" disabled={sending} className="tool-btn tool-btn--primary">
            {sending ? '提交中…' : '提交评论'}
          </button>
          {notice && <span role="status" className={notice.kind === 'ok' ? 'comments-notice' : 'comments-notice is-error'}>{notice.text}</span>}
        </div>
      </form>
      <div className="comments-admin">
        {admin ? (
          <button type="button" onClick={() => logout()} className="comments-link">退出管理</button>
        ) : loginOpen ? (
          <form onSubmit={login} className="comments-login">
            <input type="password" aria-label="管理员 token" placeholder="管理员 token" autoComplete="off" value={tokenInput} onChange={e => setTokenInput(e.target.value)} className="ui-input" />
            <button type="submit" className="comments-link">进入</button>
          </form>
        ) : (
          <button type="button" onClick={() => setLoginOpen(true)} className="comments-link is-muted">管理</button>
        )}
      </div>
    </section>
  )
}
