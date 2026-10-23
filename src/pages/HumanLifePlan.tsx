import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Download, RotateCcw } from 'lucide-react'
import { Page } from '../components/ui'
import HumanInterviewPrompt from '../components/life/HumanInterviewPrompt'
import { renderMarkdown } from '../components/MarkdownView'
import { FIRST_QUESTION, MAX_ANSWER, MAX_MESSAGES, MIN_REPORT_ANSWERS, validConversation, type LifeMessage } from '../features/human3/model'
import { lifeReply, LifeReplyError } from '../features/human3/client'
import '../styles/human-life.css'

const SAVE_KEY = 'human3.private-draft.v1'
const TOKEN_KEY = 'askLab.accessToken'
const initial = (): LifeMessage[] => [{ role: 'assistant', content: FIRST_QUESTION }]
interface Draft { messages: LifeMessage[]; answer: string; report: string; saved: boolean }
function readDraft(): Draft {
  const empty = { messages: initial(), answer: '', report: '', saved: false }
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return empty
    const data = JSON.parse(raw) as Draft
    const messages = data.messages
    if (!Array.isArray(messages) || messages.length % 2 !== 1 || messages.length > MAX_MESSAGES + 1) return empty
    if (messages.length === 1 ? messages[0]?.role !== 'assistant' || messages[0]?.content !== FIRST_QUESTION : !validConversation(messages.slice(0, -1))) return empty
    const last = messages[messages.length - 1]
    if (last.role !== 'assistant' || typeof last.content !== 'string' || last.content.length > 4000) return empty
    return { messages, answer: typeof data.answer === 'string' ? data.answer.slice(0, MAX_ANSWER) : '', report: typeof data.report === 'string' ? data.report.slice(0, 20000) : '', saved: true }
  } catch { return empty }
}
function readToken(): string { try { return sessionStorage.getItem(TOKEN_KEY) || '' } catch { return '' } }

export default function HumanLifePlan(): JSX.Element {
  const [draft, setDraft] = useState(readDraft)
  const [token, setToken] = useState(readToken)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [quotaError, setQuotaError] = useState('')
  const [quotaRefresh, setQuotaRefresh] = useState(0)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [busy, setBusy] = useState<'interview' | 'report' | null>(null)
  const [partial, setPartial] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const request = useRef<AbortController | null>(null)
  const pending = useRef(false)
  const answerRef = useRef<HTMLTextAreaElement>(null)
  const reportRef = useRef<HTMLElement>(null)
  const answers = Math.floor(draft.messages.length / 2)
  const limitReached = draft.messages.length + 1 > MAX_MESSAGES
  const configured = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
  const base = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    try {
      if (draft.saved) localStorage.setItem(SAVE_KEY, JSON.stringify(draft))
      else localStorage.removeItem(SAVE_KEY)
      setSaveError('')
    } catch { setSaveError('本机存储不可用，请在离开前导出记录。') }
  }, [draft])
  useEffect(() => {
    if (!token || !configured) return
    const controller = new AbortController()
    setQuotaError('')
    fetch(`${base}/api/ask`, { headers: { authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async response => {
        if (response.status === 401) {
          try { sessionStorage.removeItem(TOKEN_KEY) } catch {}
          setToken(''); setRemaining(null)
          return
        }
        if (!response.ok) throw new Error('暂时无法查询额度，提交时将由服务端核实。')
        const data = await response.json() as { remaining?: number }
        if (typeof data.remaining === 'number') setRemaining(data.remaining)
      }).catch(() => { if (!controller.signal.aborted) setQuotaError('暂时无法查询额度，提交时将由服务端核实。') })
    return () => controller.abort()
  }, [base, configured, token, quotaRefresh])

  function login(provider: 'google' | 'github') {
    if (!draft.saved && (draft.answer.trim() || answers || draft.report)) {
      setError('登录需要跳转页面。请先勾选“在此浏览器保存访谈”，以保留当前记录；也可导出后清除记录再登录。')
      return
    }
    if (draft.saved) {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(draft)) }
      catch { setError('无法安全保存当前访谈，已阻止登录跳转。请先导出记录，清除后再登录。'); return }
    }
    // Reuse the already allowlisted /ai callback, then return to this tool.
    try { sessionStorage.setItem('askLab.returnTo', 'human3') }
    catch { setError('浏览器无法保存登录状态，请允许此站点使用会话存储后重试。'); return }
    const back = `${window.location.origin}${import.meta.env.BASE_URL}ai`
    const authUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
    window.location.assign(`${authUrl}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(back)}`)
  }

  async function submit(action: 'interview' | 'report') {
    if (pending.current || !token || remaining === 0 || (action === 'interview' && (!draft.answer.trim() || limitReached)) || (action === 'report' && answers < MIN_REPORT_ANSWERS)) return
    const messages: LifeMessage[] = action === 'report'
      ? draft.messages.slice(0, -1)
      : [...draft.messages, { role: 'user', content: draft.answer.trim() }]
    pending.current = true
    setBusy(action); setError(''); setPartial(''); setQuotaError('')
    const controller = new AbortController()
    request.current = controller
    const timeout = window.setTimeout(() => controller.abort(), 65_000)
    let result = ''
    try {
      const left = await lifeReply(token, messages, action, controller.signal, text => { result = text; setPartial(text) })
      if (controller.signal.aborted) return
      if (action === 'report') {
        setDraft(previous => ({ ...previous, report: result }))
        window.setTimeout(() => reportRef.current?.focus(), 0)
      } else {
        setDraft(previous => ({ ...previous, messages: [...messages, { role: 'assistant', content: result }], answer: '' }))
        window.setTimeout(() => answerRef.current?.focus(), 0)
      }
      setRemaining(left)
    } catch (cause) {
      if (controller.signal.aborted) setError('请求已停止，草稿保留。请稍后查询额度再重试。')
      else setError(cause instanceof Error ? cause.message : '请求失败，请稍后再试')
      // The server may have consumed/refunded a request; do not guess the balance.
      setRemaining(cause instanceof LifeReplyError ? cause.remaining : null)
      if (cause instanceof LifeReplyError && cause.status === 401) {
        try { sessionStorage.removeItem(TOKEN_KEY) } catch {}
        setToken('')
      }
    } finally {
      window.clearTimeout(timeout)
      pending.current = false
      setBusy(null); setPartial('')
    }
  }
  function exportDraft() {
    const text = '# Human 3.0 私人访谈\n\n' + draft.messages.map(message => `## ${message.role === 'user' ? '我的回答' : '顾问'}\n\n${message.content}`).join('\n\n')
      + (draft.answer ? `\n\n## 尚未提交的草稿\n\n${draft.answer}` : '')
      + (draft.report ? `\n\n# 90天人生规划\n\n${draft.report}` : '')
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = 'human-3-private.md'; anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  function reset() {
    setDraft({ messages: initial(), answer: '', report: '', saved: false }); setConfirmReset(false); setError('')
  }
  const latest = draft.messages[draft.messages.length - 1]

  return <Page className="human-life">
    <Link className="human-life__back" to="/life"><ArrowLeft size={16} aria-hidden="true" /> 自由之路</Link>
    <header className="human-life__header">
      <h1>你想怎样度过这一生？</h1>
      <p>借助 Human 3.0，从真实的一天开始，理清想要的生活、正在付出的代价，以及接下来90天值得做的事。</p>
    </header>
    <HumanInterviewPrompt />
    <div className="human-life__layout">
      <aside className="human-life__guide" aria-label="访谈方法">
        <h2>从四个方向看自己</h2>
        <dl>
          <div><dt>心智 <span>Mind</span></dt><dd>认知、情绪、思维与自我觉察</dd></div>
          <div><dt>身体 <span>Body</span></dt><dd>睡眠、运动、健康与精力</dd></div>
          <div><dt>精神 <span>Spirit</span></dt><dd>价值、意义、关系与人生方向</dd></div>
          <div><dt>事业 <span>Vocation</span></dt><dd>工作、技能、收入与自主程度</dd></div>
        </dl>
        <details><summary>L1、L2、L3 怎么理解？</summary><p>L1 偏向遵循外部规则；L2 开始自主选择目标；L3 能整合多种视角，并根据反馈协调行动。四个象限分别判断，证据不足时保留“待判断”。</p></details>
        <p className="human-life__note">依据你的具体经历判断，每次只推进一个问题。等级用于反思，不代表人的价值，也不是心理诊断。</p>
        <a href="https://thedankoe.com/letters/human-3-0-a-map-to-reach-the-top-1/" target="_blank" rel="noreferrer">阅读 Dan Koe 原始模型</a>
      </aside>
      <section className="human-life__work" aria-labelledby="human-interview-title">
        <div className="human-life__section-head"><h2 id="human-interview-title">人生战略访谈</h2><span>已回答 {answers} 轮</span></div>
        <p className="human-life__quota">首个问题免费。登录后每天共2次 AI 回复，与「试问 AI」共享额度；追问和生成规划各用1次，北京时间零点重置。可保存后跨日继续。</p>
        {token && <div className="human-life__balance"><p role="status">{remaining === null ? '提交时核实今日额度' : `今日剩余 ${remaining} / 2 次`}</p><button className="tool-btn" disabled={!!busy} onClick={() => setQuotaRefresh(value => value + 1)}>刷新今日额度</button></div>}
        {quotaError && <p className="human-life__note">{quotaError}</p>}
        {answers > 0 && <details className="human-life__history"><summary>查看前 {answers} 轮访谈</summary>{draft.messages.slice(0, -1).map((message, index) => <article key={index}><h3>{message.role === 'user' ? '你的回答' : '顾问'}</h3><p>{message.content}</p></article>)}</details>}
        <div className="human-life__question"><h3>当前问题</h3><p>{latest.content}</p></div>
        {!configured && <p className="human-life__notice">AI 登录尚未配置。你仍可记录、保存和导出回答；配置服务后即可继续访谈。</p>}
        {!token && configured && <div className="human-life__login"><p>你的回答与已有访谈将发送给 MiniMax，用于追问和生成规划。请省略姓名、账号等身份信息。</p><button className="tool-btn tool-btn--primary" onClick={() => login('google')}>使用 Google 登录</button><button className="tool-btn" onClick={() => login('github')}>使用 GitHub 登录</button></div>}
        <form onSubmit={event => { event.preventDefault(); void submit('interview') }}>
          <label htmlFor="human-answer">你的回答</label>
          <textarea ref={answerRef} id="human-answer" rows={6} maxLength={MAX_ANSWER} disabled={!!busy} value={draft.answer} placeholder="写具体发生过的事。可以不完整，不需要给一个好看的答案。" onChange={event => setDraft(previous => ({ ...previous, answer: event.target.value }))} aria-describedby="human-answer-count" />
          <div className="human-life__composer-actions"><span id="human-answer-count">{draft.answer.length} / {MAX_ANSWER} 字</span><button type="submit" className="tool-btn tool-btn--primary" disabled={!configured || !token || !!busy || remaining === 0 || !draft.answer.trim() || limitReached}>{busy === 'interview' ? '正在追问…' : remaining === 0 ? '今天额度已用完' : '提交回答，继续访谈'}</button></div>
        </form>
        {limitReached && <p className="human-life__notice">本次访谈已达到24轮上限，请生成规划并导出记录。</p>}
        {busy && <div className="human-life__pending" aria-busy="true"><p role="status">{busy === 'report' ? '正在整理四象限评估与90天计划…' : '正在根据你的回答思考下一个问题…'}</p>{partial && <p className="human-life__partial">{partial}</p>}<button className="tool-btn" onClick={() => request.current?.abort()}>停止等待</button></div>}
        {error && <p role="alert" className="human-life__notice">{error}</p>}
        <div className="human-life__report-action"><button className="tool-btn" disabled={!configured || !token || !!busy || remaining === 0 || answers < MIN_REPORT_ANSWERS || !!draft.answer.trim()} onClick={() => void submit('report')}>生成90天规划</button><p>至少回答5轮后可请求初稿；完整规划需要四象限都有具体证据。未提交的草稿不会计入报告，请先提交。证据不足的结论会标注“待判断”。</p></div>
        <section className="human-life__privacy" aria-label="记录与隐私">
          <label><input type="checkbox" checked={draft.saved} disabled={!!busy} onChange={event => setDraft(previous => ({ ...previous, saved: event.target.checked }))} /> 在此浏览器保存访谈</label>
          <p>默认不持久保存。勾选后，回答、草稿和规划仅保存在此设备的浏览器中，共用设备上的其他人也可能看到；取消勾选会删除本机保存。本站问答接口不把内容写入应用数据库。<a href={`${import.meta.env.BASE_URL}ai-privacy.html`}>隐私说明</a></p>
          {saveError && <p role="alert">{saveError}</p>}
          <div className="human-life__record-actions"><button className="tool-btn" onClick={exportDraft} disabled={!!busy}><Download size={16} aria-hidden="true" />导出访谈与规划</button><button className="tool-btn" onClick={() => setConfirmReset(true)} disabled={!!busy}><RotateCcw size={16} aria-hidden="true" />重新开始</button></div>
          {confirmReset && <div className="human-life__reset"><p>这会清除当前访谈和本机保存的记录。请先导出需要保留的内容。</p><button className="tool-btn" onClick={reset}>清除并重新开始</button><button className="tool-btn" onClick={() => setConfirmReset(false)}>保留记录</button></div>}
        </section>
        {token && <button className="tool-btn" disabled={!!busy} onClick={() => {
          try { sessionStorage.removeItem(TOKEN_KEY) } catch {}
          setToken(''); setRemaining(null); reset()
        }}>退出登录并清除访谈</button>}
      </section>
    </div>
    {draft.report && <section ref={reportRef} tabIndex={-1} className="human-life__report" aria-labelledby="human-report-title"><h2 id="human-report-title">你的90天人生规划</h2><p className="human-life__note">这是基于当前访谈的AI分析，可继续补充证据后重新生成。投资、健康等重要决定需要另行核实。</p><div className="human-life__markdown">{renderMarkdown(draft.report)}</div></section>}
  </Page>
}
