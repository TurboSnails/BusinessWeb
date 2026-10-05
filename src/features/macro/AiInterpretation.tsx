import React, { useEffect, useRef, useState } from 'react'
import { Sparkles, RefreshCw, Square, Server } from 'lucide-react'
import {
  cancelMacroInterpretation,
  connectValuation,
  fetchBackends,
  fetchModels,
  getMacroInterpretation,
  hostedPage,
  startMacroInterpretation,
  subscribeMacroInterpretation,
  type MacroInterpretationResult,
} from '../../services/valuationApi'
import type { Backend, BackendInfo, ModelOption } from '../valuation'
import type { MacroSnapshot } from './indicators'
import type { CnKey } from './china'
import { buildDigest } from './digest'
import { elapsedText } from '../valuation/session'

// 当前标签页内保留：进行中的任务、最近一次解读
const JOB_KEY = 'macro-ai-job'
const LAST_KEY = 'macro-ai-last'
const store = {
  get<T>(key: string): T | null { try { return JSON.parse(sessionStorage.getItem(key) || 'null') as T } catch { return null } },
  set(key: string, value: unknown) { try { value === null ? sessionStorage.removeItem(key) : sessionStorage.setItem(key, JSON.stringify(value)) } catch { /* 可选功能 */ } },
}
// 与公司估值共用同一组偏好：选过的 CLI 和模型在两页一致
const pref = (key: string) => { try { return localStorage.getItem(key) || '' } catch { return '' } }
const remember = (key: string, value: string) => { try { localStorage.setItem(key, value) } catch { /* 可选 */ } }

const DIRECTION_TONE: Record<string, string> = { 变好: 'green', 变坏: 'red', 持平: 'gray' }

export default function AiInterpretation({ us, cn }: { us: MacroSnapshot; cn: MacroSnapshot<CnKey> | null }): JSX.Element {
  const running = useRef(store.get<{ id: string; startedAt: number }>(JOB_KEY)).current
  const [connected, setConnected] = useState(false)
  const [backends, setBackends] = useState<BackendInfo[]>([])
  const [backend, setBackend] = useState<Backend>('codex')
  const [models, setModels] = useState<ModelOption[]>([])
  const [model, setModel] = useState('default')
  const [busy, setBusy] = useState(!!running)
  const [job, setJob] = useState<string | null>(running?.id ?? null)
  const [startedAt, setStartedAt] = useState<number | null>(running?.startedAt ?? null)
  const [now, setNow] = useState(() => Date.now())
  const [status, setStatus] = useState(running ? '正在恢复解读进度…' : '')
  const [activity, setActivity] = useState<{ chars: number; preview: string } | null>(null)
  const [result, setResult] = useState<MacroInterpretationResult | null>(() => store.get(LAST_KEY))
  const [error, setError] = useState('')
  const [outdated, setOutdated] = useState(false)
  const stop = useRef<(() => void) | null>(null)
  const asOf = us.fetchedAt?.slice(0, 10) ?? us.generatedAt

  async function connect(): Promise<void> {
    setError('')
    try {
      const health = await connectValuation()
      setOutdated(!health.features?.includes('macro-interpret'))
      const list = await fetchBackends()
      setBackends(list)
      setConnected(true)
      setBackend(list.find(b => b.id === pref('valuation-backend') && b.installed)?.id || list.find(b => b.installed)?.id || 'codex')
    } catch {
      setConnected(false)
      if (store.get(JOB_KEY)) { setBusy(false); setStatus('本地服务未连接，连接后会接着显示之前的解读进度') }
    }
  }
  useEffect(() => { void connect(); return () => stop.current?.() }, [])
  useEffect(() => {
    if (!busy) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [busy])
  useEffect(() => {
    if (!connected) return
    let alive = true
    fetchModels(backend).then(list => {
      if (!alive) return
      setModels(list)
      const remembered = pref('valuation-model-' + backend)
      setModel(list.some(m => m.modelId === remembered) ? remembered : 'default')
    }).catch(e => { if (alive) setError((e as Error).message) })
    return () => { alive = false }
  }, [connected, backend])

  function finish(value: MacroInterpretationResult) {
    setResult(value); store.set(LAST_KEY, value)
    setBusy(false); setStatus(''); store.set(JOB_KEY, null)
  }
  function attach(id: string) {
    stop.current?.()
    setActivity(null)
    stop.current = subscribeMacroInterpretation(id, event => {
      if (event.payload.message) setStatus(event.payload.message)
      if (event.type === 'activity' && typeof event.payload.chars === 'number') setActivity({ chars: event.payload.chars, preview: event.payload.preview || '' })
      if (event.type === 'completed' && event.payload.report) finish(event.payload.report as unknown as MacroInterpretationResult)
      if (event.type === 'failed' || event.type === 'cancelled') {
        setBusy(false); setStatus(event.type === 'cancelled' ? '已取消' : ''); setError(event.payload.error || ''); store.set(JOB_KEY, null)
      }
    }, () => setStatus('连接中断，正在自动重连…'))
  }
  // 回到页面：接上进行中的任务
  useEffect(() => {
    if (!connected) return
    const saved = store.get<{ id: string; startedAt: number }>(JOB_KEY)
    if (!saved) return
    getMacroInterpretation(saved.id).then(value => {
      if (value.report) finish(value.report)
      else if (!['cancelled', 'failed'].includes(value.state)) { setBusy(true); setJob(saved.id); attach(saved.id) }
      else { setBusy(false); setStatus(''); store.set(JOB_KEY, null) }
    }).catch(() => { setBusy(false); setStatus(''); store.set(JOB_KEY, null) })
  }, [connected])

  async function start(): Promise<void> {
    setError(''); setBusy(true); setStatus('正在启动'); setActivity(null)
    const began = Date.now()
    setStartedAt(began); setNow(began)
    try {
      const value = await startMacroInterpretation({ backend, modelId: model, digest: buildDigest(us, cn) })
      setJob(value.id)
      store.set(JOB_KEY, { id: value.id, startedAt: began })
      attach(value.id)
    } catch (e) { setError((e as Error).message); setBusy(false); setStatus('') }
  }

  const label = (m: ModelOption) => `${m.displayName} · ${m.availability === 'verified' ? '已验证' : m.availability === 'unavailable' ? '上次调用失败' : '未验证权限'}`
  return (
    <section className="macro-card macro-ai" aria-label="AI 解读">
      <div className="macro-card__head">
        <h3><Sparkles size={16} aria-hidden="true" /> AI 解读（可选）</h3>
        <span className={`macro-muted${connected ? ' is-connected' : ''}`}><Server size={13} aria-hidden="true" /> {connected ? '本地服务已连接' : '本地服务未连接'}</span>
      </div>
      <p className="macro-muted">用你本机的 CLI 和模型，把上面的读数和走势翻译成大白话。只解释，不改变阶段；阶段以规则为准。</p>

      {!connected && (
        <div className="macro-ai__offline">
          <p>{hostedPage ? '线上页面会连接你本机的服务：' : ''}在 BusinessWeb 目录运行 <code>npm run valuation:server</code>{hostedPage ? '（Safari 会拦截访问本机，请用 Chrome 或 Edge）' : '，同时运行 npm run dev'}，再点“重新连接”。和公司估值用的是同一个本地服务。</p>
          <button type="button" className="tool-btn" onClick={() => void connect()}><RefreshCw size={14} aria-hidden="true" />重新连接</button>
        </div>
      )}

      {connected && outdated && (
        <div className="macro-ai__offline" role="alert">
          <p>本机的估值服务是旧版本，还没有“AI 解读”功能。请在 BusinessWeb 目录重启：先关掉正在运行的服务，再运行 <code>npm run valuation:server</code>（或 <code>npm run valuation:app</code>），然后点“重新连接”。</p>
          <button type="button" className="tool-btn" onClick={() => void connect()}><RefreshCw size={14} aria-hidden="true" />重新连接</button>
        </div>
      )}

      {connected && !outdated && (
        <div className="macro-ai__form">
          <label>本地 CLI
            <select value={backend} disabled={busy} onChange={e => { setBackend(e.target.value as Backend); remember('valuation-backend', e.target.value) }}>
              {backends.map(b => <option key={b.id} value={b.id} disabled={!b.installed}>{b.id}{b.installed ? '' : '（未安装）'}</option>)}
            </select>
          </label>
          <label>模型版本
            <select value={model} disabled={busy} onChange={e => { setModel(e.target.value); remember('valuation-model-' + backend, e.target.value) }}>
              <option value="default">CLI 默认模型</option>
              {models.map(m => <option key={m.modelId} value={m.modelId}>{label(m)}</option>)}
            </select>
          </label>
          {busy
            ? <button type="button" className="tool-btn" onClick={() => job && cancelMacroInterpretation(job).catch(e => setError((e as Error).message))}><Square size={13} aria-hidden="true" />取消</button>
            : <button type="button" className="tool-btn tool-btn--primary" onClick={() => void start()}><Sparkles size={14} aria-hidden="true" />{result ? '重新解读' : '生成解读'}</button>}
        </div>
      )}

      {busy && (
        <div className="macro-ai__run" role="status" aria-live="polite">
          <p><span className="animate-spin macro-ai__spinner" aria-hidden="true" />{status || '模型运行中'}{startedAt && <span className="macro-muted"> · 已用时 {elapsedText(now - startedAt)}</span>}</p>
          {activity && activity.chars > 0 && <p className="macro-muted">模型已输出 {activity.chars.toLocaleString()} 字{activity.preview && <code>…{activity.preview}</code>}</p>}
          <p className="macro-muted">可以离开这个页面，回来时会接着显示进度。</p>
        </div>
      )}
      {!busy && status && <p className="macro-muted" role="status">{status}</p>}
      {error && <p role="alert" className="macro-ai__error">{error}</p>}

      {result && !busy && (
        <article className="macro-ai__result">
          {result.asOf && result.asOf !== asOf && <p className="macro-stamp is-stale">这份解读基于 {result.asOf} 的数据，当前数据已更新到 {asOf}，可点“重新解读”。</p>}
          <p className="macro-ai__summary">{result.interpretation.summary}</p>
          <h4>最值得注意的变化</h4>
          <ul className="macro-ai__list">
            {result.interpretation.changes.map(c => (
              <li key={c.indicator}><span className={`macro-badge macro-badge--${DIRECTION_TONE[c.direction] ?? 'gray'}`}>{c.direction}</span><b>{c.indicator}</b>：{c.evidence}</li>
            ))}
          </ul>
          {result.interpretation.analogs.length > 0 && <>
            <h4>历史对照</h4>
            <div className="macro-table-wrap"><table className="macro-table"><thead><tr><th>时期</th><th>相似</th><th>不同</th></tr></thead>
              <tbody>{result.interpretation.analogs.map(a => <tr key={a.period}><td>{a.period}</td><td>{a.similar}</td><td>{a.different}</td></tr>)}</tbody></table></div>
          </>}
          <h4>下个月盯什么</h4>
          <ul className="macro-ai__list">{result.interpretation.watch.map(w => <li key={w.item}><b>{w.item}</b>：{w.trigger}</li>)}</ul>
          {result.interpretation.caveats && <p className="macro-muted">局限：{result.interpretation.caveats}</p>}
          <p className="macro-ai__meta">AI 解读仅供参考，阶段以规则为准 · {result.execution.backend} · {result.execution.resolvedModelId || result.execution.requestedModelId} · 生成于 {new Date(result.createdAt).toLocaleString('zh-CN', { hour12: false })}</p>
        </article>
      )}
    </section>
  )
}
