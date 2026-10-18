import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Segmented } from '../../components/ui/PageTabs'
import { evaluate, MANUAL_NAMES, MARKETS, manualFields, RULE_VERSION, safeUrl, SIGNAL_LABEL, type CycleSnapshot, type MacroContext, type ManualDimension, type Market, type Observation, type TechnicalPoint } from './engine'
import { EMPTY_BUDGET, loadState, macroSchema, parseBackup, persistState, snapshotSchema, automaticSchema, breadthSchema, reportSchema, type AutomaticReport, type Budget, type LocalState, type ReviewLog } from './storage'
import { automaticRows, factLabel, factUsable, shadowState, type AutomaticSnapshot, type BreadthSnapshot } from './automation'
import './market-cycle.css'

const CHECKS = ['已核对数据日期、来源与缺失项', '已复核多空冲突及策略失效条件', '已检查策略资金范围与回撤预算', '已写明本次动作或继续观察的理由']
const DIMENSIONS: ManualDimension[] = ['valuation', 'funding', 'breadth']
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
const f = (v: number | null | undefined, digits = 2) => v == null ? '—' : v.toFixed(digits)
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
  const [importText, setImportText] = useState('')
  const asOf = today()
  const manual = local.observations[market] ?? {}
  const budget = local.budgets[market] ?? EMPTY_BUDGET
  const manualOnly = manualModes[market] ?? []
  const base = evaluate(market, snapshot?.markets[market], manual, cn, us, asOf)
  const collected = automaticRows(market, automatic, breadth, asOf, base.newHigh)
  const result = evaluate(market, snapshot?.markets[market], manual, cn, us, asOf, collected, manualOnly)
  const shadow = shadowState(result.rows)
  const facts = [...new Map((automatic?.facts ?? []).filter(fact => fact.market === market || fact.market === 'all').sort((a, b) => a.observationDate.localeCompare(b.observationDate)).map(fact => [`${fact.market}-${fact.metricId}`, fact])).values()]
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
  function generateReviewDraft() {
    if (note.trim()) return
    const missing = result.rows.filter(row => !row.available).map(row => row.name)
    setNote([`${asOf} · ${MARKETS.find(m => m.id === market)?.label}复盘草稿（待本人确认）`,
      `观察状态：${result.summary.state}。`,
      `赔率区域：${shadow.valuationZone}；趋势：${shadow.trendState}；风险约束：${shadow.riskGate}。`,
      `六维读数：${result.rows.map(row => `${row.name}：${SIGNAL_LABEL[row.signal]}`).join('；')}。`,
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
  return <section className="cycle-board" aria-label="A股港股牛熊周期">
    <header className="cycle-intro"><div><h2>用完整周与月，观察牛熊周期</h2><p>估值看赔率，资金看燃料，趋势决定何时复核。每周15分钟，少做一次情绪决策。</p></div><span className="cycle-version">观察版 · 未经策略回测</span></header>
    <div className="cycle-toolbar"><Segmented label="周期市场" items={[...MARKETS]} value={market} onChange={id => setParams(p => { const next = new URLSearchParams(p); next.set('market', id); return next }, { replace: true })} /><button type="button" className="tool-btn" disabled={loading} onClick={() => { setReload(n => n + 1); setChecks(CHECKS.map(() => false)) }}>{loading ? '读取中…' : '重新读取数据'}</button></div>
    {errors.length > 0 && <p role="alert" className="cycle-notice">{errors.length}个数据文件未能加载：{errors.join('、')}。成功加载的部分仍可用；重读失败时保留原数据及日期。</p>}
    {snapshot?.warnings.map(w => <p key={w} className="cycle-notice">{w}</p>)}
    <div className="cycle-summary"><div><p className="macro-muted">{MARKETS.find(m => m.id === market)?.label} · 截至 {asOf}</p><h3>{result.summary.state}</h3><p>{result.summary.note}</p></div><dl><div><dt>有效证据</dt><dd>{result.summary.valid}<small> / 6维</small></dd></div><div><dt>底部候选</dt><dd>{result.summary.bottom}</dd></div><div><dt>修复 / 持有</dt><dd>{result.summary.positive}</dd></div><div><dt>风险</dt><dd>{result.summary.risk}</dd></div></dl></div>
    <p className="cycle-notice">这是待验证规则的观察输出，不是牛熊概率。{budgetReady ? `策略资金 ${budget.capital!.toLocaleString()}元，最大仓位 ${budget.maxPosition}%、回撤复核线 ${budget.maxDrawdown}%，均为本人设定。${budget.currentPosition! > budget.maxPosition! ? ' 当前仓位已超过自定上限，请复核。' : ''}` : '尚未完整设置策略资金与风险预算，只显示市场状态。'} 满仓 / 清仓仅指策略资金，不涉及备用金与长期底仓。</p>
    <section className="cycle-section" aria-label="分层观察与自动数据"><div className="cycle-toolbar"><h3>分层观察 · 影子规则</h3><span className="cycle-version">cycle-shadow-v2 · 待验证</span></div><dl className="cycle-shadow">{[{ label: '赔率区域', value: shadow.valuationZone }, { label: '当前趋势', value: shadow.trendState }, { label: '风险约束', value: shadow.riskGate }, { label: '数据质量', value: shadow.dataQuality }].map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl><p className="macro-muted">低估可以与防守并存。此处显示当前读数，连续两周趋势确认由自动周报留档计算；页面刷新不增加确认次数。新规则不执行交易。</p>{report?.records[0] && <p className="cycle-notice">最近自动周报：{report.records[0].decisionAt.slice(0, 10)} · 趋势 {report.records[0].markets[market].shadow.trendState} · 连续确认 {report.records[0].markets[market].shadow.confirmations}/2周 · {report.records[0].markets[market].shadow.riskGate}。本机人工补录不改变自动周报。</p>}<p>自动更新：{automatic?.generatedAt ?? '等待首次采集'} · <a href={`${import.meta.env.BASE_URL}data/market-cycle-report.json`} target="_blank" rel="noreferrer">查看自动周报与输入校验指纹</a></p>{[...(automatic?.issues ?? []), ...(breadth?.issues ?? [])].length > 0 && <details><summary>数据质量与缺失项（{[...(automatic?.issues ?? []), ...(breadth?.issues ?? [])].length}）</summary><ul>{[...(automatic?.issues ?? []), ...(breadth?.issues ?? [])].map((issue, i) => <li key={i}>{issue}</li>)}</ul></details>}<details><summary>自动采集原值（{facts.length}项）</summary><div className="cycle-facts">{facts.map(fact => <article key={`${fact.market}-${fact.metricId}`}><strong>{factLabel(fact.metricId)} · {fact.value.toLocaleString()} {fact.unit}</strong><p>{fact.description}</p><p className="macro-muted">观测 {fact.observationDate} · {({ observed: '原始观测', proxy: '代理指标', backfilled: '历史回填' })[fact.kind]} · {factUsable(fact, asOf) ? '在有效期内' : '已过期或尚不可得'}<br />抓取 {fact.fetchedAt} · 首次记录 {fact.firstSeenAt}<br />原始发布时间 {fact.availableAt ?? '未知；不作为历史可得时点'}</p><a href={fact.source} target="_blank" rel="noreferrer">公开来源</a></article>)}</div></details></section>
    <section aria-labelledby="cycle-evidence-title"><h3 id="cycle-evidence-title">六维证据</h3><div className="cycle-evidence">{result.rows.map(row => <article key={row.id} className="cycle-row"><div className="cycle-row__title"><h4>{row.name}</h4><span className={`cycle-signal cycle-signal--${row.signal}`}>{SIGNAL_LABEL[row.signal]}</span></div><p>{row.detail}</p><div className="cycle-row__meta"><span>{row.date ? `观测：${row.date}` : '尚无有效观测日期'}</span>{row.source && safeUrl(row.source) && <a href={row.source} target="_blank" rel="noreferrer">公开来源</a>}</div></article>)}</div></section>
    <section className="cycle-section" aria-labelledby="cycle-chart-title"><div className="cycle-toolbar"><h3 id="cycle-chart-title">趋势与持仓防线</h3><Segmented label="图表周期" items={[{ id: 'week', label: '周线' }, { id: 'month', label: '月线' }]} value={period} onChange={setPeriod} /></div><TrendChart key={`${market}-${period}`} points={period === 'week' ? result.weekly : result.monthly} period={period === 'week' ? '周' : '月'} />{snapshot?.markets[market] && <p className="macro-muted">腾讯行情快照抓取于 {snapshot.markets[market]?.fetchedAt}；图表保守排除当前日历周 / 月。周五收盘后于周六确认。</p>}</section>
    <p className="cycle-notice">市场数据由系统定时采集，直接查看上方六维证据与自动周报即可，无需填写市场数据表单。缺失项会如实标注，不要求你手动补齐。</p><details className="cycle-section"><summary>手动补录或覆盖（可选）</summary><p className="macro-muted">合格自动证据优先，缺失时使用有效人工补录；也可明确选择人工覆盖。每项补录需数值、同一口径的观测日和公开来源，14天后过期。覆盖选择会随本次复盘留档。宽度仅指各指数成分，不代表全A股。</p><div className="cycle-editors">{DIMENSIONS.map(id => <fieldset key={id}><legend>{MANUAL_NAMES[id]}</legend><p className="macro-muted">{collected[id]?.available ? `已有自动证据（${collected[id]?.date}），默认使用，无需填写。` : collected[id] ? '已取得部分自动数据，尚未通过判断门槛；详见上方六维证据。不补录也可继续查看和复盘。' : '暂缺合格自动证据，不要求补录；如有可信数据，可在此补充。'}{manualOnly.includes(id) ? ' 当前已选择人工覆盖，将使用下方数值。' : ''}</p><label>{MANUAL_NAMES[id]}证据模式<select aria-label={`${MANUAL_NAMES[id]}证据模式`} value={manualOnly.includes(id) ? 'manual' : 'auto'} onChange={e => { setManualModes(old => ({ ...old, [market]: e.target.value === 'manual' ? [...new Set([...manualOnly, id])] : manualOnly.filter(x => x !== id) })); setChecks(CHECKS.map(() => false)) }}><option value="auto">自动优先，人工补缺</option><option value="manual">本次使用人工覆盖</option></select></label>{manualFields(id, market).map(field => <label key={field.key}>{field.label}<input type="number" step="any" min={field.min} max={field.max} value={manual[id]?.values[field.key] ?? ''} onChange={e => { const values = { ...manual[id]?.values }; if (e.target.value === '') delete values[field.key]; else values[field.key] = Number(e.target.value); updateObservation(id, { values }) }} /></label>)}<label>{MANUAL_NAMES[id]}观测日期<input type="date" max={asOf} value={manual[id]?.date ?? ''} onChange={e => updateObservation(id, { date: e.target.value })} /></label><label>{MANUAL_NAMES[id]}来源链接<input type="url" placeholder="https://" value={manual[id]?.source ?? ''} onChange={e => updateObservation(id, { source: e.target.value })} /></label></fieldset>)}</div><button type="button" className="tool-btn" onClick={() => commit(local, '补录已保存在本机；不完整或过期项目仍不计票。')}>保存补录</button></details>
    <section className="cycle-section" aria-labelledby="cycle-review-title"><h3 id="cycle-review-title">本周 / 本月复盘</h3><details><summary>设置本人策略资金与风险预算</summary><p className="macro-muted">个人参数设置后保存在本机，无需每次重填。当前未接入券商账户，系统无法读取你的真实资金与持仓，也不会代设回撤承受能力。资金以人民币记录，港股需先折算。</p><div className="cycle-budget">{([{ key: 'capital', label: '本策略资金（元）' }, { key: 'currentPosition', label: '当前策略仓位（%）' }, { key: 'maxPosition', label: '策略仓位上限（%）' }, { key: 'maxDrawdown', label: '可接受回撤复核线（%）' }] as const).map(field => <label key={field.key}>{field.label}<input type="number" min="0" max={field.key === 'capital' ? undefined : 100} step="any" value={budget[field.key] ?? ''} onChange={e => updateBudget(field.key, e.target.value)} /></label>)}</div><button type="button" className="tool-btn" onClick={() => commit(local, '策略预算已保存在本机。')}>保存预算</button></details><p className="macro-muted">系统已自动留档市场周报。个人复盘可一键生成证据草稿；实际操作与四项核对由本人确认。</p><button type="button" className="tool-btn" disabled={loading || !!note.trim()} onClick={generateReviewDraft}>生成复盘草稿</button><label className="cycle-note">本次决定与理由<textarea aria-label="本次决定与理由" rows={3} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} placeholder="例如：继续观察；等待市场宽度与估值补齐。若调整仓位，记录触发条件及重新进入条件。" /></label><div className="cycle-checks">{CHECKS.map((text, i) => <label key={text}><input type="checkbox" checked={checks[i]} onChange={e => setChecks(old => old.map((v, j) => i === j ? e.target.checked : v))} />{text}</label>)}</div><button type="button" className="tool-btn tool-btn--primary" disabled={!checks.every(Boolean)} onClick={saveReview}>保存本次复盘</button><p role="status" aria-live="polite">{status}</p></section>
    <section className="cycle-section" aria-labelledby="cycle-history-title"><div className="cycle-toolbar"><h3 id="cycle-history-title">复盘记录</h3><button type="button" className="tool-btn" onClick={() => download(`牛熊周期备份-${asOf}.json`, local)}>导出备份</button></div><p className="macro-muted">仅存本浏览器，最多保留最近52次；保存时冻结当时输入、证据与规则版本，不随新行情改写。定期导出备份。</p>{local.logs.filter(log => log.market === market).length === 0 && <p>尚无复盘记录。完成上面的检查后保存第一条。</p>}{local.logs.filter(log => log.market === market).map(log => <details key={log.id} className="cycle-log"><summary>{log.savedAt.slice(0, 10)} · {log.state} · {MARKETS.find(m => m.id === log.market)?.label}</summary><p>{log.note}</p><p className="macro-muted">规则 {log.version} · 保存于 {log.savedAt}</p><ul>{log.rows.map(row => <li key={row.id}>{row.name}：{SIGNAL_LABEL[row.signal]}（{row.date ?? '缺日期'}）<p>{row.detail}</p></li>)}</ul></details>)}<details><summary>从备份恢复</summary><p>导入会替换本机记录。请先导出当前记录，并检查将导入的文件内容。</p><label>备份JSON<textarea rows={3} value={importText} onChange={e => setImportText(e.target.value)} /></label><button type="button" className="tool-btn" disabled={!importText.trim()} onClick={() => { try { const next = parseBackup(importText); if (commit(next, '备份已恢复。')) { setImportText(''); setChecks(CHECKS.map(() => false)) } } catch { setStatus('导入失败：备份格式、版本或数值不合法，原记录未改动。') } }}>替换本机记录</button></details></section>
    <details className="cycle-section"><summary>规则、来源与适用边界</summary><p>规则版本 {RULE_VERSION}。六维等权，技术只算一维。底部需3维极端且无风险；右侧需至少4维支持、技术向上且无风险；不足4维不提高风险；趋势破位独立复核。所有门槛均为研究假设，尚未完成多周期、成本后及样本外验证。</p><p>周线 / 月线MACD(12,26,9)以SMA初始化EMA，柱=DIF−DEA；RSI(14)使用Wilder平滑；BOLL(20,2)使用总体标准差。只采用完成K线，保留至少60个月预热。放量与带宽不单独预测方向，顶部背离尚不自动识别。</p><p>A股ERP需固定PE、10年国债与历史窗口；港股使用自身TTM PE分位。融资原值、汇率与部分ETF份额自动采集；未核定融资成交额分母前不计算占比。港股PE历史不足时不生成分位。宽度需当期名单及95%覆盖门禁，未通过则缺失。CSI300/SPX和周线背离仍需复核；海外维度仅为利率与VIX代理，不使用固定60%～70%权重。</p><p>M1−M2只使用2025年后新口径；宏观快照没有完整原始发布日期，当前观察读数不用于历史交易回测。港股国内宏观与南向资金存在相关性，六票不等于六个独立证据。</p><p><a href="https://www.pbc.gov.cn/en/3688247/3688978/3709137/5838983/index.html" target="_blank" rel="noreferrer">人民银行M1口径说明</a> · <a href="https://www.bollingerbands.com/bollinger-band-rules" target="_blank" rel="noreferrer">布林带官方使用规则</a> · <a href="https://www.cboe.com/tradable_products/vix/" target="_blank" rel="noreferrer">Cboe VIX说明</a></p><p>本面板仅供研究参考，不构成个人投资建议。</p></details>
  </section>
}
