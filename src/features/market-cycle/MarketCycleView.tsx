import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Segmented } from '../../components/ui/PageTabs'
import { DIMENSION_RULES, evaluate, MANUAL_NAMES, MARKETS, manualFields, RULE_VERSION, safeUrl, SIGNAL_LABEL, STATE_RULES, type CycleSnapshot, type Evidence, type MacroContext, type ManualDimension, type Market, type Observation, type TechnicalPoint } from './engine'
import { EMPTY_BUDGET, loadState, macroSchema, parseBackup, persistState, snapshotSchema, automaticSchema, breadthSchema, reportSchema, type AutomaticReport, type Budget, type LocalState, type ReviewLog } from './storage'
import { automaticRows, factLabel, factUsable, humanizeDetail, shadowState, type AutomaticSnapshot, type BreadthSnapshot } from './automation'
import './market-cycle.css'

const CHECKS = ['已核对数据日期、来源与缺失项', '已复核多空冲突及策略失效条件', '已检查策略资金范围与回撤预算', '已写明本次动作或继续观察的理由']
const DIMENSIONS: ManualDimension[] = ['valuation', 'funding', 'breadth']
const DIMENSION_SHORT: Record<string, string> = { valuation: '估值', funding: '资金', breadth: '宽度', macro: '流动性', technical: '技术', overseas: '海外' }
const SOURCE_NAMES: Record<string, string> = { 'csi300-erp': '沪深300估值', 'hsi-pe': '恒指PE', 'hstech-pe': '恒科PE', 'hsi-official-pe': '恒指官方PE分位', 'hstech-official-pe': '恒科官方PE分位', 'hsi-pe-history': '恒指第三方PE', margin: '两市融资', 'cn-funding': 'A股融资占比', 'cn-turnover': 'A股成交额基准', 'fred-hkd': '港元汇率', 'yahoo-cnh': '离岸人民币', 'sse-etf': 'ETF份额', 'hk-south': '南向资金', 'hk-liquidity': '恒科成交额', 'hstech-liquidity': '恒科成交额', 'hsi-turnover': '恒指成交额' }
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
const f = (v: number | null | undefined, digits = 2) => v == null ? '—' : v.toFixed(digits)
const beijing = (iso: string) => new Date(iso).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
const humanIssue = (issue: string) => humanizeDetail(issue.replace(/^([a-z0-9-]+):\s*/, (_, id: string) => SOURCE_NAMES[id] ? `${SOURCE_NAMES[id]}：` : `${id}：`).replaceAll('fetch failed', '网络请求失败'))
const splitDetail = (text: string) => { const i = text.indexOf('。'); return i < 0 ? [text, ''] : [text.slice(0, i), text.slice(i + 1).trim()] }
const evidenceLabel = (row: Evidence) => row.signal !== 'missing' ? SIGNAL_LABEL[row.signal]
  : row.pendingReason ?? (row.date && row.source && safeUrl(row.source) ? '部分数据待补齐' : '待补齐')
const signalOf = (row?: Evidence) => row?.available ? row.signal : 'missing'
/** Dimensions whose vote moved between two evidence sets, e.g. "技术 中性→偏空 / 风险". */
function changes(before: Evidence[] | undefined, after: Evidence[]): string[] {
  if (!before) return []
  return after.flatMap(row => {
    const was = signalOf(before.find(r => r.id === row.id)), now = signalOf(row)
    return was === now ? [] : [`${DIMENSION_SHORT[row.id] ?? row.name} ${SIGNAL_LABEL[was]}→${SIGNAL_LABEL[now]}`]
  })
}
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function TrendChart({ points, period }: { points: TechnicalPoint[]; period: string }): JSX.Element {
  const data = points.slice(-80)
  const [selection, setSelection] = useState<number | null>(null)
  const at = Math.min(selection ?? data.length - 1, data.length - 1)
  const p = data[at]
  if (!p) return <p className="macro-muted">暂无可用完整{period}线，重新读取快照或补齐行情后显示。</p>
  const values = data.flatMap(p => [p.close, p.upper ?? p.close, p.lower ?? p.close])
  const min = Math.min(...values), span = Math.max(...values) - min || 1
  const x = (i: number) => 18 + i / Math.max(1, data.length - 1) * 764
  const y = (v: number) => 194 - (v - min) / span * 176
  const path = (key: 'close' | 'mid' | 'upper' | 'lower') => data.map((p, i) => p[key] == null ? '' : `${i === 0 || data[i - 1][key] == null ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[key]!).toFixed(1)}`).join(' ')
  return <figure className="cycle-chart">
    <svg role="img" aria-label={`最近${data.length}个完整${period}收盘与布林带`} viewBox="0 0 800 216">
      <path d={path('upper')} className="cycle-chart__band" /><path d={path('lower')} className="cycle-chart__band" />
      <path d={path('mid')} className="cycle-chart__mid" /><path d={path('close')} className="cycle-chart__price" />
      <line x1={x(at)} x2={x(at)} y1="12" y2="200" className="cycle-chart__cursor" />
      <circle cx={x(at)} cy={y(p.close)} r="4" className="cycle-chart__dot" />
    </svg>
    <label className="cycle-chart__slider">查看历史{period}读数<input type="range" min="0" max={data.length - 1} value={at} onChange={e => setSelection(Number(e.target.value))} /></label>
    <figcaption><strong>{p.date}</strong><span>收盘 {f(p.close)}</span><span>20期线 {f(p.mid)}</span><span>RSI {f(p.rsi, 1)}</span><span>MACD柱 {f(p.histogram)}</span><span>带宽 {f(p.bandwidth, 1)}%</span></figcaption>
    <p className="macro-muted">实线为收盘，虚线为20期均线，浅线为上下轨。历史滑块仅查看指标，不回填历史六维判断。</p>
  </figure>
}

export default function MarketCycleView(): JSX.Element {
  const [params, setParams] = useSearchParams()
  const market: Market = MARKETS.some(m => m.id === params.get('market')) ? params.get('market') as Market : 'csi300'
  const [initial] = useState(loadState)
  const [local, setLocal] = useState<LocalState>(initial.state)
  const [status, setStatus] = useState(initial.error)
  const [report, setReport] = useState<AutomaticReport | null>(null)
  const [automatic, setAutomatic] = useState<AutomaticSnapshot | null>(null)
  const [breadth, setBreadth] = useState<BreadthSnapshot | null>(null)
  const [manualModes, setManualModes] = useState<Partial<Record<Market, ManualDimension[]>>>({})
  const [snapshot, setSnapshot] = useState<CycleSnapshot | null>(null)
  const [cn, setCn] = useState<MacroContext | null>(null), [us, setUs] = useState<MacroContext | null>(null)
  const [loading, setLoading] = useState(true), [errors, setErrors] = useState<string[]>([]), [reload, setReload] = useState(0)
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const [checks, setChecks] = useState<boolean[]>(CHECKS.map(() => false)), [note, setNote] = useState('')
  const asOf = today()
  const assess = (m: Market) => {
    const own = local.observations[m] ?? {}
    const base = evaluate(m, snapshot?.markets[m], own, cn, us, asOf)
    const collected = automaticRows(m, automatic, breadth, asOf, base.newHigh)
    const result = evaluate(m, snapshot?.markets[m], own, cn, us, asOf, collected, manualModes[m] ?? [])
    return { collected, result, shadow: shadowState(result.rows) }
  }
  const all = Object.fromEntries(MARKETS.map(m => [m.id, assess(m.id)])) as Record<Market, ReturnType<typeof assess>>
  const { collected, result, shadow } = all[market]
  const manual = local.observations[market] ?? {}
  const budget = local.budgets[market] ?? EMPTY_BUDGET
  const manualOnly = manualModes[market] ?? []
  const marketLabel = MARKETS.find(m => m.id === market)?.label
  const facts = [...new Map((automatic?.facts ?? []).filter(fact => fact.market === market || fact.market === 'all').sort((a, b) => a.observationDate.localeCompare(b.observationDate)).map(fact => [`${fact.market}-${fact.metricId}`, fact])).values()]
  const issues = [...(automatic?.issues ?? []), ...(breadth?.issues ?? [])]
  const latestEvidence = result.rows.map(r => r.available ? r.date : undefined).filter((d): d is string => !!d && d <= asOf).sort().at(-1)
  const [thisWeek, lastWeek] = report?.records ?? []
  const weekChanges = thisWeek && lastWeek ? changes(lastWeek.markets[market].rows, thisWeek.markets[market].rows) : []
  const sinceReport = thisWeek ? changes(thisWeek.markets[market].rows, result.rows) : []
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLoading(true)
    const files = ['market-cycle.json', 'macro-cn.json', 'macro-us.json', 'market-cycle-auto.json', 'market-cycle-breadth.json', 'market-cycle-report.json']
    void Promise.allSettled(files.map(async (file, i) => {
      const res = await fetch(`${import.meta.env.BASE_URL}data/${file}`, { cache: 'no-cache', signal: controller.signal })
      if (!res.ok) throw new Error(file)
      const body: unknown = await res.json()
      return i === 0 ? snapshotSchema.parse(body) : i === 3 ? automaticSchema.parse(body) : i === 4 ? breadthSchema.parse(body) : i === 5 ? reportSchema.parse(body) : macroSchema.parse(body)
    })).then(out => {
      if (!active) return
      const failed: string[] = []
      out.forEach((r, i) => {
        if (r.status === 'rejected') { failed.push(files[i]); return }
        if (i === 0) setSnapshot(r.value as CycleSnapshot)
        else if (i === 1) setCn(r.value as MacroContext)
        else if (i === 2) setUs(r.value as MacroContext)
        else if (i === 3) setAutomatic(r.value as AutomaticSnapshot)
        else if (i === 4) setBreadth(r.value as BreadthSnapshot)
        else setReport(r.value as AutomaticReport)
      })
      setErrors(failed); setLoading(false); setChecks(CHECKS.map(() => false))
    })
    return () => { active = false; controller.abort() }
  }, [reload])
  useEffect(() => { setChecks(CHECKS.map(() => false)); setNote('') }, [market])

  const selectMarket = (id: Market) => setParams(p => { const next = new URLSearchParams(p); next.set('market', id); return next }, { replace: true })
  function commit(next: LocalState, message: string): boolean {
    try { persistState(next); setLocal(next); setStatus(message); return true }
    catch (error) { setStatus(error instanceof Error && error.name === 'ZodError' ? '保存失败：请检查资金是否非负、仓位与回撤是否在0～100%内。未保存的修改仍在本页。' : '保存失败：本机存储不可用或空间不足。请先导出备份；未保存的修改仍在本页。'); return false }
  }
  function updateObservation(id: ManualDimension, patch: Partial<Observation>) {
    const o = manual[id] ?? { date: '', source: '', values: {} }
    setLocal({ ...local, observations: { ...local.observations, [market]: { ...manual, [id]: { ...o, ...patch } } } })
    setChecks(CHECKS.map(() => false))
    setStatus('有未保存的补录修改；点击“保存补录”后留在本机。')
  }
  function updateBudget(key: keyof Budget, value: string) {
    setLocal({ ...local, budgets: { ...local.budgets, [market]: { ...budget, [key]: value.trim() === '' ? null : Number(value) } } })
    setChecks(CHECKS.map(() => false))
    setStatus('有未保存的预算修改；点击“保存预算”后留在本机。')
  }
  const budgetReady = budget.capital !== null && budget.capital > 0 && budget.maxDrawdown !== null && budget.maxDrawdown > 0 && budget.maxDrawdown <= 100 && budget.maxPosition !== null && budget.maxPosition > 0 && budget.maxPosition <= 100 && budget.currentPosition !== null && budget.currentPosition >= 0 && budget.currentPosition <= 100
  const overLimit = budgetReady && budget.currentPosition! > budget.maxPosition!
  function generateReviewDraft() {
    if (note.trim()) return
    const missing = result.rows.filter(row => !row.available).map(row => row.name)
    setNote([`${asOf} · ${marketLabel}复盘草稿（待本人确认）`,
      `观察状态：${result.summary.state}。`,
      `赔率区域：${shadow.valuationZone}；趋势：${shadow.trendState}；风险约束：${shadow.riskGate}。`,
      `六维读数：${result.rows.map(row => `${row.name}：${evidenceLabel(row)}`).join('；')}。`,
      ...(weekChanges.length || sinceReport.length ? [`较上期变化：${[...weekChanges, ...sinceReport].join('；')}。`] : []),
      missing.length ? `缺失证据：${missing.join('、')}；缺失不视为中性或买入信号。` : '本期六维证据齐备，仍需本人核对来源与风险预算。',
      '本人实际操作与理由：待填写。'].join('\n'))
    setChecks(CHECKS.map(() => false))
    setStatus('已生成当前证据摘要，尚未保存；请补充本人实际决定并完成核对。')
  }
  function saveReview() {
    if (!checks.every(Boolean)) return
    const log: ReviewLog = { id: `${Date.now()}-${market}`, savedAt: new Date().toISOString(), market, version: RULE_VERSION, state: result.summary.state, note: note.trim() || '继续观察，等待补齐证据。', rows: result.rows, budget: { ...budget }, observations: manual,
      inputs: { ...(snapshot?.markets[market] ? { price: snapshot.markets[market] } : {}), cn, us, automatic, breadth, manualOnly } }
    if (commit({ ...local, logs: [log, ...local.logs].slice(0, 52) }, '复盘已保存，保留当时证据与规则版本。')) setChecks(CHECKS.map(() => false))
  }
  async function restore(file: File | undefined) {
    if (!file) return
    try { const next = parseBackup(await file.text()); if (commit(next, '备份已恢复。')) setChecks(CHECKS.map(() => false)) }
    catch { setStatus('导入失败：备份格式、版本或数值不合法，原记录未改动。') }
  }
  return <section className="cycle-board" aria-label="A股港股牛熊周期">
    <header className="cycle-intro"><div><h2>用完整周与月，观察牛熊周期</h2><p>估值看赔率，资金看燃料，趋势决定何时复核。每周15分钟，少做一次情绪决策。</p></div><span className="cycle-version">观察版 · 规则未经回测 · 非交易指令</span></header>
    {errors.length > 0 && <p role="alert" className="cycle-notice">{errors.length}个数据文件未能加载：{errors.join('、')}。成功加载的部分仍可用；重读失败时保留原数据及日期。</p>}
    {snapshot?.warnings.map(w => <p key={w} className="cycle-notice">{w}</p>)}

    <section aria-labelledby="cycle-overview-title">
      <div className="cycle-toolbar"><h3 id="cycle-overview-title">三市场一览</h3><span className="macro-muted">{automatic ? `自动数据更新于 ${beijing(automatic.generatedAt)}（北京时间）` : loading ? '读取中…' : '等待首次采集'}</span></div>
      <div className="cycle-overview" role="table" aria-label="三市场六维读数">
        <div role="row" className="cycle-overview__head"><span role="columnheader">市场</span><span role="columnheader">观察状态</span>{result.rows.map(row => <span key={row.id} role="columnheader">{DIMENSION_SHORT[row.id]}</span>)}</div>
        {MARKETS.map(m => { const r = all[m.id].result; return <div role="row" key={m.id} className={m.id === market ? 'is-current' : undefined}>
          <span role="cell"><button type="button" className="cycle-overview__market" aria-label={`查看${m.label}`} aria-current={m.id === market || undefined} onClick={() => selectMarket(m.id)}>{m.label.split(' · ')[1]}</button></span>
          <span role="cell" className="cycle-overview__state">{r.summary.state}</span>
          {r.rows.map(row => <span role="cell" key={row.id} className={`cycle-dot cycle-dot--${signalOf(row)}`} title={`${row.name}：${evidenceLabel(row)}`}><span className="cycle-dot__mark" aria-hidden="true" />{SIGNAL_LABEL[signalOf(row)]}</span>)}
        </div> })}
      </div>
    </section>

    <div className="cycle-toolbar"><Segmented label="周期市场" items={[...MARKETS]} value={market} onChange={selectMarket} /><button type="button" className="tool-btn" disabled={loading} onClick={() => { setReload(n => n + 1); setChecks(CHECKS.map(() => false)) }}>{loading ? '读取中…' : '重新读取数据'}</button></div>
    <div className="cycle-summary">
      <div>
        <p className="macro-muted">{marketLabel} · {latestEvidence ? `证据最新至 ${latestEvidence}` : '尚无有效证据日期'}</p>
        <h3>{result.summary.state}</h3>
        <p className="cycle-summary__lead">{STATE_RULES.find(r => r.state === result.summary.state)?.lead}</p>
        <p className="macro-muted">{result.summary.note}</p>
        {overLimit && <p className="cycle-alert">当前策略仓位已超过你自定的上限，请复核。</p>}
      </div>
      <dl><div><dt>偏多</dt><dd>{result.summary.positive}</dd></div><div><dt>偏空 / 风险</dt><dd>{result.summary.risk}</dd></div><div><dt>偏低估</dt><dd>{result.summary.bottom}</dd></div><div><dt>数据不足</dt><dd>{6 - result.summary.valid}</dd></div></dl>
      <ul className="cycle-chips" aria-label="分层读数">{[['赔率', shadow.valuationZone], ['趋势', shadow.trendState], ['风险约束', shadow.riskGate], ['数据质量', shadow.dataQuality]].map(([k, v]) => <li key={k}><span>{k}</span>{v}</li>)}</ul>
      <div className="cycle-changes">
        {thisWeek ? <p><strong>较上期：</strong>{lastWeek ? weekChanges.length ? `周报${lastWeek.weekEnding}→${thisWeek.weekEnding}：${weekChanges.join('；')}` : `周报${lastWeek.weekEnding}→${thisWeek.weekEnding}无维度变化` : `首份自动周报${thisWeek.weekEnding}，下周起显示周度变化`}{sinceReport.length ? `。周报后新数据：${sinceReport.join('；')}` : ''}。趋势连续确认 {thisWeek.markets[market].shadow.confirmations}/2 周。</p>
          : <p className="macro-muted">尚无自动周报，暂无周度对比。</p>}
      </div>
      <details className="cycle-rules"><summary>这个结论怎么来的？（共6个维度，按顺序匹配第一条）</summary><ol>{STATE_RULES.map(r => <li key={r.state} className={r.state === result.summary.state ? 'is-current' : undefined}><strong>{r.state}</strong>：{r.rule}</li>)}</ol><p className="macro-muted">每个维度先各自判成 偏多 / 偏空 / 偏低估 / 中性 / 数据不足，再按上表汇总；缺失或过期的维度不计票，也不当作中性。分层读数（cycle-shadow-v2）把赔率与趋势分开看：低估可以与趋势防守并存；正向趋势需连续两份完整周确认，风险即时生效；少于4个有效维度或缺估值 / 宽度时暂停提高风险。页面刷新不增加确认次数。</p></details>
    </div>

    <section aria-labelledby="cycle-evidence-title"><h3 id="cycle-evidence-title">六维证据</h3><div className="cycle-evidence">{result.rows.map(row => <article key={row.id} className="cycle-row"><div className="cycle-row__title"><h4>{row.name}</h4><span className={`cycle-signal cycle-signal--${row.signal}`}>{evidenceLabel(row)}</span></div><div className="cycle-row__content"><p className="cycle-row__headline">{row.headline ?? splitDetail(row.detail)[0]}</p><details className="cycle-row__more"><summary>依据与阈值</summary><p className="cycle-row__rule">判定规则：{DIMENSION_RULES[row.id]?.(market)}</p>{(row.headline ? row.detail : splitDetail(row.detail)[1]) && <p>{row.headline ? row.detail : splitDetail(row.detail)[1]}</p>}</details>{row.methodDetail && <details className="cycle-method"><summary>数据口径与来源</summary><p>{row.methodDetail}</p></details>}</div><div className="cycle-row__meta"><span>{row.date ? `观测：${row.date}` : '尚无有效观测日期'}</span>{row.source && safeUrl(row.source) && <a href={row.source} target="_blank" rel="noreferrer">公开来源</a>}</div></article>)}</div></section>

    <section className="cycle-section" aria-labelledby="cycle-chart-title"><div className="cycle-toolbar"><h3 id="cycle-chart-title">趋势与持仓防线</h3><Segmented label="图表周期" items={[{ id: 'week', label: '周线' }, { id: 'month', label: '月线' }]} value={period} onChange={setPeriod} /></div><TrendChart key={`${market}-${period}`} points={period === 'week' ? result.weekly : result.monthly} period={period === 'week' ? '周' : '月'} />{snapshot?.markets[market] && <p className="macro-muted">行情快照抓取于 {beijing(snapshot.markets[market]!.fetchedAt)}；图表只用已完成的周 / 月K线，周五收盘后于周六确认。</p>}</section>

    <section className="cycle-section" aria-labelledby="cycle-review-title"><h3 id="cycle-review-title">本周 / 本月复盘</h3>
      <details><summary>本人策略资金与风险预算{budgetReady ? `：${budget.capital!.toLocaleString()}元 · 仓位${budget.currentPosition}%/${budget.maxPosition}% · 回撤线${budget.maxDrawdown}%` : '（未设置）'}</summary><p className="macro-muted">只用于提醒，保存在本机。未接入券商账户，系统读取不到真实持仓，也不替你设定回撤承受能力。资金以人民币记录，港股需先折算；满仓 / 清仓仅指策略资金，不含备用金与长期底仓。</p><div className="cycle-budget">{([{ key: 'capital', label: '本策略资金（元）' }, { key: 'currentPosition', label: '当前策略仓位（%）' }, { key: 'maxPosition', label: '策略仓位上限（%）' }, { key: 'maxDrawdown', label: '可接受回撤复核线（%）' }] as const).map(field => <label key={field.key}>{field.label}<input type="number" min="0" max={field.key === 'capital' ? undefined : 100} step="any" value={budget[field.key] ?? ''} onChange={e => updateBudget(field.key, e.target.value)} /></label>)}</div><button type="button" className="tool-btn" onClick={() => commit(local, '策略预算已保存在本机。')}>保存预算</button></details>
      <div className="cycle-toolbar"><p className="macro-muted">先生成证据草稿，再写下你的实际决定。</p><button type="button" className="tool-btn" disabled={loading || !!note.trim()} onClick={generateReviewDraft}>生成复盘草稿</button></div>
      <label className="cycle-note">本次决定与理由<textarea aria-label="本次决定与理由" rows={4} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} placeholder="例如：继续观察；等待市场宽度与估值补齐。若调整仓位，记录触发条件及重新进入条件。" /></label>
      <div className="cycle-checks">{CHECKS.map((text, i) => <label key={text}><input type="checkbox" checked={checks[i]} onChange={e => setChecks(old => old.map((v, j) => i === j ? e.target.checked : v))} />{text}</label>)}</div>
      <button type="button" className="tool-btn tool-btn--primary" disabled={!checks.every(Boolean)} onClick={saveReview}>保存本次复盘</button><p role="status" aria-live="polite">{status}</p>
    </section>

    <section className="cycle-section" aria-labelledby="cycle-history-title"><div className="cycle-toolbar"><h3 id="cycle-history-title">复盘记录</h3><div className="cycle-actions"><button type="button" className="tool-btn" onClick={() => download(`牛熊周期备份-${asOf}.json`, local)}>导出备份</button><label className="tool-btn cycle-file">从备份恢复<input type="file" accept="application/json,.json" aria-label="从备份恢复（替换本机记录）" onChange={e => { void restore(e.target.files?.[0]); e.target.value = '' }} /></label></div></div><p className="macro-muted">仅存本浏览器，最多52次；保存时冻结当时证据与规则版本。恢复会替换本机记录，请先导出。</p>{local.logs.filter(log => log.market === market).length === 0 && <p>尚无复盘记录。完成上面的检查后保存第一条。</p>}{local.logs.filter(log => log.market === market).map(log => <details key={log.id} className="cycle-log"><summary>{log.savedAt.slice(0, 10)} · {log.state} · {MARKETS.find(m => m.id === log.market)?.label}</summary><p>{log.note}</p><p className="macro-muted">规则 {log.version} · 保存于 {log.savedAt}</p><ul>{log.rows.map(row => <li key={row.id}>{row.name}：{evidenceLabel(row)}（{row.date ?? '缺日期'}）<p>{row.detail}</p></li>)}</ul></details>)}</section>

    <details className="cycle-section"><summary>数据档案与质量（{facts.length}项原值{issues.length ? ` · ${issues.length}条提示` : ''}）</summary>
      <p className="macro-muted">系统每12小时自动采集并按周留档，无需手动填写。<a href={`${import.meta.env.BASE_URL}data/market-cycle-report.json`} target="_blank" rel="noreferrer">自动周报与输入校验指纹</a></p>
      {issues.length > 0 && <><h4>采集提示</h4><ul className="cycle-issues">{issues.map((issue, i) => <li key={i}>{humanIssue(issue)}</li>)}</ul></>}
      <h4>自动采集原值</h4>
      <div className="cycle-table-wrap"><table className="cycle-facts"><thead><tr><th scope="col">指标</th><th scope="col">数值</th><th scope="col">观测日</th><th scope="col">状态</th></tr></thead><tbody>{facts.map(fact => <tr key={`${fact.market}-${fact.metricId}`}><td><a href={fact.source} target="_blank" rel="noreferrer" title={fact.description}>{factLabel(fact.metricId)}</a></td><td>{fact.value.toLocaleString()} {fact.unit}</td><td>{fact.observationDate}</td><td>{factUsable(fact, asOf) ? '有效' : '已过期'}{fact.kind !== 'observed' ? ' · 代理' : ''}</td></tr>)}</tbody></table></div>
    </details>

    <details className="cycle-section"><summary>手动补录或覆盖（可选）</summary><p className="macro-muted">合格自动证据优先，缺失时使用有效人工补录；也可明确选择人工覆盖。每项补录需数值、同一口径的观测日和公开来源，14天后过期。覆盖选择会随本次复盘留档。宽度仅指各指数成分，不代表全A股。</p><div className="cycle-editors">{DIMENSIONS.map(id => <fieldset key={id}><legend>{MANUAL_NAMES[id]}</legend><p className="macro-muted">{collected[id]?.available ? `已有自动证据（${collected[id]?.date}），默认使用，无需填写。` : collected[id] ? '已取得部分自动数据，尚未通过判断门槛；详见上方六维证据。不补录也可继续查看和复盘。' : '暂缺合格自动证据，不要求补录；如有可信数据，可在此补充。'}{manualOnly.includes(id) ? ' 当前已选择人工覆盖，将使用下方数值。' : ''}</p><label>{MANUAL_NAMES[id]}证据模式<select aria-label={`${MANUAL_NAMES[id]}证据模式`} value={manualOnly.includes(id) ? 'manual' : 'auto'} onChange={e => { setManualModes(old => ({ ...old, [market]: e.target.value === 'manual' ? [...new Set([...manualOnly, id])] : manualOnly.filter(x => x !== id) })); setChecks(CHECKS.map(() => false)) }}><option value="auto">自动优先，人工补缺</option><option value="manual">本次使用人工覆盖</option></select></label>{manualFields(id, market).map(field => <label key={field.key}>{field.label}<input type="number" step="any" min={field.min} max={field.max} value={manual[id]?.values[field.key] ?? ''} onChange={e => { const values = { ...manual[id]?.values }; if (e.target.value === '') delete values[field.key]; else values[field.key] = Number(e.target.value); updateObservation(id, { values }) }} /></label>)}<label>{MANUAL_NAMES[id]}观测日期<input type="date" max={asOf} value={manual[id]?.date ?? ''} onChange={e => updateObservation(id, { date: e.target.value })} /></label><label>{MANUAL_NAMES[id]}来源链接<input type="url" placeholder="https://" value={manual[id]?.source ?? ''} onChange={e => updateObservation(id, { source: e.target.value })} /></label></fieldset>)}</div><button type="button" className="tool-btn" onClick={() => commit(local, '补录已保存在本机；不完整或过期项目仍不计票。')}>保存补录</button></details>

    <details className="cycle-section"><summary>规则、来源与适用边界</summary><p>规则版本 {RULE_VERSION}。六维等权，技术只算一维。底部需3维极端且无风险；右侧需至少4维支持、技术向上且无风险；不足4维不提高风险；趋势破位独立复核。所有门槛均为研究假设，尚未完成多周期、成本后及样本外验证；输出是观察状态，不是牛熊概率。</p><p>周线 / 月线MACD(12,26,9)以SMA初始化EMA，柱=DIF−DEA；RSI(14)使用Wilder平滑；BOLL(20,2)使用总体标准差。只采用完成K线，保留至少60个月预热。放量与带宽不单独预测方向，顶部背离尚不自动识别。</p><p>A股ERP需固定PE、10年国债与历史窗口。港股使用官方同口径五年月末PE分位，按盈利收益率（E/P）排序：全为盈利月份时与PE分位一致，指数整体亏损的月份视为比任何盈利月份更贵，不删除样本；盈利依据最新年度业绩，不标作TTM。A股融资占比以同日沪深A股及上市基金成交额为分母，并与相同范围的53周成交额历史配对。港股指数成交额与全市场成交额严格区分；恒指官方日报仅开放约1–2个月，52周基准由当前成分逐股成交额加总，且完整周须与官方日报逐日吻合才发布。宽度需当期名单及95%覆盖门禁；上市不足220个交易日、尚无MA200的次新股移出分母（最多占成分10%）。海外维度仅为利率与VIX代理，不使用固定60%～70%权重。</p><p>M1−M2只使用2025年后新口径；宏观快照没有完整原始发布日期，当前观察读数不用于历史交易回测。港股国内宏观与南向资金存在相关性，六票不等于六个独立证据。</p><p><a href="https://www.pbc.gov.cn/en/3688247/3688978/3709137/5838983/index.html" target="_blank" rel="noreferrer">人民银行M1口径说明</a> · <a href="https://www.bollingerbands.com/bollinger-band-rules" target="_blank" rel="noreferrer">布林带官方使用规则</a> · <a href="https://www.cboe.com/tradable_products/vix/" target="_blank" rel="noreferrer">Cboe VIX说明</a></p><p>本面板仅供研究参考，不构成个人投资建议。</p></details>
  </section>
}
