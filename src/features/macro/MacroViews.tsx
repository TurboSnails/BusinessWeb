import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, AlertTriangle, OctagonAlert, Minus, ChevronRight, X } from 'lucide-react'
import { SIGNALS, STAGES, signalTone, type Stage, type Tone } from './stages'
import { INDICATORS, MODULES, ageInDays, percentileOf, signalValues, stageFromSnapshot, thresholdText, toneOf, type Indicator, type MacroSnapshot, type ModuleId, type SeriesData } from './indicators'
import { CN_INDICATORS, CN_MODULES, type CnKey } from './china'
import Sparkline from './Sparkline'
import LongHistoryChart from './LongHistoryChart'
import AiInterpretation from './AiInterpretation'
import { QUALITY_LABEL, checkQuality, type QualityReport, type QualityResult } from './quality'
import './macro.css'

const TONE_LABEL: Record<Tone, string> = { green: '正常', yellow: '警惕', red: '危险', blue: '信息', gray: '背景' }
const TONE_ICON: Record<Tone, React.ElementType> = { green: CheckCircle2, yellow: AlertTriangle, red: OctagonAlert, blue: Minus, gray: Minus }

/** 状态徽章：颜色 + 图标 + 文字，不只靠颜色表达 */
export function ToneBadge({ tone, label }: { tone: Tone; label?: string }): JSX.Element {
  const Icon = TONE_ICON[tone]
  return <span className={`macro-badge macro-badge--${tone}`}><Icon size={13} aria-hidden="true" />{label ?? TONE_LABEL[tone]}</span>
}

const unitText = (unit: string) => (unit === 'pp' ? ' 个百分点' : unit === '万人' ? ' 万人' : unit)
const shortUnit = (unit: string) => (unit === 'pp' || unit === '万人' ? '' : unit)
const fmt = (v: number, digits: number) => v.toFixed(digits)

/** 新旧数据标记：实时刷新后，每项要么是这次刚拉到的，要么是沿用旧值的；没刷新过则统一是快照 */
export function freshnessOf(snap: MacroSnapshot<string>, d: SeriesData): { kind: 'live' | 'old' | 'snap'; text: string } {
  if (!snap.fetchedAt) return { kind: 'snap', text: `快照 ${snap.generatedAt.slice(5)}` }
  return d.live === true ? { kind: 'live', text: `实时 ${snap.fetchedAt.slice(11, 16)} UTC` } : { kind: 'old', text: `沿用旧值 · ${d.latest.date.slice(0, 10)}` }
}

export function FreshTag({ snap, d }: { snap: MacroSnapshot<string>; d: SeriesData }): JSX.Element {
  const f = freshnessOf(snap, d)
  return <span className={`macro-fresh macro-fresh--${f.kind}`} title={f.kind === 'old' ? '这次刷新没拉到这一项，显示的是上一次的读数' : f.kind === 'live' ? '这次刷新刚从数据源拉到' : '来自定期更新的快照文件，点右上角刷新可拉取实时数据'}>{f.text}</span>
}

function DataStamp({ snap, label = '美国' }: { snap: MacroSnapshot<string>; label?: string }): JSX.Element {
  const stale = !snap.fetchedAt && ageInDays(snap.generatedAt) > 40
  const all = Object.values(snap.series)
  const old = snap.fetchedAt ? all.filter(d => d.live !== true).length : 0
  return (
    <p className={`macro-stamp${stale || old > 0 ? ' is-stale' : ''}`}>
      {label}数据{snap.fetchedAt ? '实时拉取于' : '更新于'} {snap.fetchedAt ? snap.fetchedAt.slice(0, 16).replace('T', ' ') + ' UTC' : snap.generatedAt} · 来源 {snap.source}
      {snap.fetchedAt && ` · ${all.length - old} 项实时${old > 0 ? `，${old} 项沿用旧值（卡片上有标记）` : ''}`}
      {stale && ' · 已超过 40 天未更新，建议点右上角「刷新最新数据」'}
    </p>
  )
}

/** 数据体检一行：正常时只给计数，有问题时逐项列出 */
export function QualityLine({ report }: { report: QualityReport }): JSX.Element {
  const { counts, issues, stageAffected } = report
  const total = counts.ok + counts.stale + counts.invalid + counts.missing
  return (
    <div className={`macro-stamp${issues.length ? ' is-stale' : ''}`} role="note" aria-label="数据体检">
      数据体检：{total} 项中 {counts.ok} 项正常
      {counts.stale > 0 && `，${counts.stale} 项过期`}{counts.invalid > 0 && `，${counts.invalid} 项异常`}{counts.missing > 0 && `，${counts.missing} 项缺失`}
      {stageAffected.length > 0 && '；阶段信号受影响，阶段结论需打折看待'}
      {issues.length > 0 && (
        <ul className="macro-quality">
          {issues.map(i => <li key={i.country + i.key}>{i.country} · {i.key}：{QUALITY_LABEL[i.quality]}，{i.reason}</li>)}
        </ul>
      )}
    </div>
  )
}

function StageHero({ stage, score, entered }: { stage: Stage; score: number; entered: number }): JSX.Element {
  return (
    <section className={`macro-hero macro-hero--${stage.tone}`} aria-label="当前阶段">
      <div className="macro-hero__head">
        <span className="macro-eyebrow">当前阶段</span>
        <ToneBadge tone={stage.tone} label={`${score} 分 · ${entered}/${SIGNALS.length} 项信号`} />
      </div>
      <h2 className="macro-hero__name">{stage.name}</h2>
      <p className="macro-hero__summary">{stage.summary}</p>
      <div className="macro-two">
        <div>
          <h3>这个阶段做什么</h3>
          <ul>{stage.does.map(t => <li key={t}>{t}</li>)}</ul>
        </div>
        <div>
          <h3>这个阶段不做什么</h3>
          <ul>{stage.doesNot.map(t => <li key={t}>{t}</li>)}</ul>
        </div>
      </div>
    </section>
  )
}

/** 摘要里的一行：点开弹出历史曲线（杠杆类是长历史图，其余是近两年走势），Esc 或点遮罩关闭 */
function MiniRow({ ind, d }: { ind: Indicator<string>; d: SeriesData }): JSX.Element {
  const [open, setOpen] = useState(false)
  const thresholds = [ind.yellow, ind.red].filter((t): t is number => t !== undefined)
  const tone = toneOf(ind, d.latest.value, d.long)
  const pct = percentileOf(d.long, d.latest.value)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  return (
    <li>
      <button type="button" className="macro-mini__row" aria-haspopup="dialog" aria-label={`${ind.name}，点击查看历史曲线`} onClick={() => setOpen(true)}>
        <span className="macro-mini__name">{ind.name}</span>
        <b>{fmt(d.latest.value, ind.digits)}{shortUnit(d.unit)}</b>
        <ToneBadge tone={tone} />
        <ChevronRight size={14} className="macro-mini__chev" aria-hidden="true" />
      </button>
      {open && (
        <div className="macro-modal" onClick={() => setOpen(false)}>
          <div className="macro-modal__box" role="dialog" aria-modal="true" aria-label={`${ind.name}历史曲线`} onClick={e => e.stopPropagation()}>
            <div className="macro-card__head"><h3>{ind.name}</h3><button type="button" className="macro-modal__close" aria-label="关闭" onClick={() => setOpen(false)}><X size={16} aria-hidden="true" /></button></div>
            <p className="macro-ind__value">{fmt(d.latest.value, ind.digits)}<small>{unitText(d.unit)}</small> <ToneBadge tone={tone} />{pct !== undefined && <small> · 处于历史 {pct}% 分位</small>}</p>
            <p className="macro-muted">截至 {d.latest.date} · {ind.freq}</p>
            {d.long ? <LongHistoryChart points={d.long} digits={ind.digits} unit={shortUnit(d.unit)} label={ind.name} /> : <Sparkline points={d.history} thresholds={thresholds} digits={ind.digits} unit={shortUnit(d.unit)} label={ind.name} />}
            <p className="macro-ind__rule">{thresholdText(ind, shortUnit(d.unit))}</p>
            <p className="macro-ind__why">{ind.why}</p>
            <p className="macro-muted">局限：{ind.limit}</p>
          </div>
        </div>
      )}
    </li>
  )
}

function ModuleSummary<K extends string>({ modules, indicators, snap }: { modules: { id: ModuleId; name: string; question: string }[]; indicators: Indicator<K>[]; snap: MacroSnapshot<K> }): JSX.Element {
  return (
    <div className="macro-grid macro-grid--modules">
      {modules.map(m => {
        const items = indicators.filter(i => i.module === m.id && snap.series[i.key])
        const tones = items.map(i => toneOf(i, snap.series[i.key].latest.value, snap.series[i.key].long)).filter(t => t !== 'gray')
        const worst: Tone = tones.includes('red') ? 'red' : tones.includes('yellow') ? 'yellow' : 'green'
        return (
          <article key={m.id} className="macro-card">
            <div className="macro-card__head"><h3>{m.name}</h3><ToneBadge tone={worst} /></div>
            <p className="macro-muted">{m.question}</p>
            <ul className="macro-mini">
              {items.map(i => <MiniRow key={i.key} ind={i} d={snap.series[i.key]} />)}
            </ul>
          </article>
        )
      })}
    </div>
  )
}

export function OverviewView({ snap, cn, onRefresh }: { snap: MacroSnapshot; cn: MacroSnapshot<CnKey> | null; onRefresh?: () => Promise<{ us: MacroSnapshot; cn: MacroSnapshot<CnKey> | null } | null> }): JSX.Element {
  const { stage, score, entered } = stageFromSnapshot(snap)
  const quality = checkQuality(snap, cn)
  return (
    <div className="macro-stack">
      <DataStamp snap={snap} />
      <QualityLine report={quality} />
      <StageHero stage={stage} score={score} entered={entered} />
      <AiInterpretation us={snap} cn={cn} onRefresh={onRefresh} />
      <section aria-label="美国">
        <h2 className="macro-h2">美国</h2>
        <ModuleSummary modules={MODULES} indicators={INDICATORS} snap={snap} />
      </section>
      {cn && (
        <section aria-label="中国">
          <h2 className="macro-h2">中国</h2>
          <ModuleSummary modules={CN_MODULES} indicators={CN_INDICATORS} snap={cn} />
        </section>
      )}
      <section className="macro-card macro-card--note" aria-label="使用原则">
        <h3>这页怎么用</h3>
        <ul>
          <li>宏观温度决定<b>风险预算</b>（能承受多大回撤、主动额度用不用），不决定买卖时点。</li>
          <li>阶段只看美国的六项信号：美国衰退与信用事件对全球资产的冲击最大；中国读数用来理解 A 股和港股的基本面背景。</li>
          <li>任何阶段都<b>不做空、不加杠杆</b>；再平衡只在检查日按阈值做。每月更新一次就够了。</li>
        </ul>
      </section>
    </div>
  )
}

function IndicatorCard({ ind, d, snap, quality }: { ind: Indicator<string>; d: SeriesData; snap: MacroSnapshot<string>; quality?: QualityResult }): JSX.Element {
  const tone = toneOf(ind, d.latest.value, d.long)
  const thresholds = [ind.yellow, ind.red].filter((t): t is number => t !== undefined)
  const pct = percentileOf(d.long, d.latest.value)
  return (
    <article className={`macro-card macro-ind${d.long ? ' macro-card--wide' : ''}`}>
      <div className="macro-card__head"><h3>{ind.name}</h3><span><FreshTag snap={snap} d={d} /> <ToneBadge tone={tone} /></span></div>
      <p className="macro-ind__value">{fmt(d.latest.value, ind.digits)}<small>{unitText(d.unit)}</small>{pct !== undefined && <small> · 处于历史 {pct}% 分位</small>}</p>
      <p className="macro-muted">截至 {d.latest.date} · {ind.freq}{quality && quality.quality !== 'ok' && <span className="macro-badge macro-badge--yellow" title={quality.reason}> 数据{QUALITY_LABEL[quality.quality]}</span>}</p>
      {d.long ? <LongHistoryChart points={d.long} digits={ind.digits} unit={shortUnit(d.unit)} label={ind.name} /> : <Sparkline points={d.history} thresholds={thresholds} digits={ind.digits} unit={shortUnit(d.unit)} label={ind.name} />}
      <p className="macro-ind__rule">{thresholdText(ind, shortUnit(d.unit))}</p>
      <p className="macro-ind__why">{ind.why}</p>
    </article>
  )
}

/** 杠杆高 + 现金低同时出现，是最脆弱的组合 */
function LeverageCombo({ snap }: { snap: MacroSnapshot<string> }): JSX.Element | null {
  const lev = INDICATORS.find(i => i.key === 'marginGdp')!, cash = INDICATORS.find(i => i.key === 'cashDebt')!
  const a = snap.series.marginGdp, b = snap.series.cashDebt
  if (!a?.long || !b?.long) return null
  const [ta, tb] = [toneOf(lev, a.latest.value, a.long), toneOf(cash, b.latest.value, b.long)]
  if (ta === 'green' || tb === 'green' || ta === 'gray' || tb === 'gray') return null
  const red = ta === 'red' || tb === 'red'
  return <p className={`macro-combo macro-combo--${red ? 'red' : 'yellow'}`} role="note">杠杆偏高且现金偏低同时出现：借的钱多、手里的子弹少，一旦下跌容易被动卖出，也缺少新增买盘。这是风险预算要保守的信号，不是卖出信号。</p>
}

function CountryView<K extends string>({ snap, modules, indicators, label, quality }: { snap: MacroSnapshot<K>; modules: { id: ModuleId; name: string; question: string }[]; indicators: Indicator<K>[]; label: string; quality?: Record<string, QualityResult> }): JSX.Element {
  return (
    <div className="macro-stack">
      <DataStamp snap={snap} label={label} />
      {modules.map(m => (
        <section key={m.id} aria-label={m.name}>
          <h2 className="macro-h2">{m.name}<span className="macro-muted"> · {m.question}</span></h2>
          <div className="macro-grid">
            {indicators.filter(i => i.module === m.id && snap.series[i.key]).map(i => <IndicatorCard key={i.key} ind={i} d={snap.series[i.key]} snap={snap} quality={quality?.[i.key]} />)}
          </div>
          {m.id === 'leverage' && <LeverageCombo snap={snap} />}
        </section>
      ))}
    </div>
  )
}

export const UsView = ({ snap }: { snap: MacroSnapshot }): JSX.Element => <CountryView snap={snap} modules={MODULES} indicators={INDICATORS} label="美国" quality={checkQuality(snap, null).us} />
export const ChinaView = ({ snap }: { snap: MacroSnapshot<CnKey> }): JSX.Element => <CountryView snap={snap} modules={CN_MODULES} indicators={CN_INDICATORS} label="中国" quality={checkQuality({ generatedAt: snap.generatedAt, source: '', series: {} } as unknown as MacroSnapshot, snap).cn} />

export function StagesView({ snap }: { snap: MacroSnapshot }): JSX.Element {
  const { stage } = stageFromSnapshot(snap)
  const values = signalValues(snap)
  const value = (id: string): number | undefined => values[id]
  return (
    <div className="macro-stack">
      <section className="macro-card" aria-label="阶段信号">
        <h3>阶段信号（与 2026 投资计划同一套规则）</h3>
        <p className="macro-muted">每项绿灯 0 分、黄灯 1 分、红灯 2 分。合计 ≥2 分为预警，≥5 分为防御，≥8 分为危机。</p>
        <div className="macro-table-wrap">
          <table className="macro-table">
            <thead><tr><th>信号</th><th>当前</th><th>黄灯</th><th>红灯</th><th>状态</th><th>来源</th></tr></thead>
            <tbody>
              {SIGNALS.map(s => {
                const v = value(s.id)
                return (
                  <tr key={s.id}>
                    <td>{s.name}<div className="macro-muted">{s.hint}</div></td>
                    <td className="macro-num">{v === undefined ? '暂缺' : `${v}${s.unit === 'pp' || s.unit === '' ? '' : ` ${s.unit}`}`}</td>
                    <td className="macro-num">{s.yellow}</td><td className="macro-num">{s.red}</td>
                    <td>{v === undefined ? <ToneBadge tone="gray" label="未接入" /> : <ToneBadge tone={signalTone(s, v)} />}</td>
                    <td>{s.source}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="macro-muted">读数每月自动更新；也可以在 <Link to="/investment-plan-2026">2026 投资计划 · 风险仪表盘</Link> 里手动填最新值自查。</p>
      </section>
      <div className="macro-grid macro-grid--stages">
        {STAGES.map(s => (
          <article key={s.level} className={`macro-card macro-stage${s === stage ? ' is-current' : ''}`}>
            <div className="macro-card__head"><h3>{s.name}</h3>{s === stage ? <ToneBadge tone={s.tone} label="当前" /> : <ToneBadge tone={s.tone} label={TONE_LABEL[s.tone]} />}</div>
            <p>{s.summary}</p>
            <h4>做</h4><ul>{s.does.map(t => <li key={t}>{t}</li>)}</ul>
            <h4>不做</h4><ul>{s.doesNot.map(t => <li key={t}>{t}</li>)}</ul>
          </article>
        ))}
      </div>
      <p className="macro-muted">危机阶段的分批补仓规则见 <Link to="/investment-plan-2026">2026 投资计划 · 回撤梯度</Link>。</p>
    </div>
  )
}

function GuideTable<K extends string>({ indicators, snap, sourceOf }: { indicators: Indicator<K>[]; snap: MacroSnapshot<K>; sourceOf(d: SeriesData): string }): JSX.Element {
  return (
    <div className="macro-table-wrap">
      <table className="macro-table">
        <thead><tr><th>指标</th><th>频率</th><th>阈值</th><th>为什么看</th><th>局限</th><th>来源</th></tr></thead>
        <tbody>
          {indicators.filter(i => snap.series[i.key]).map(i => {
            const d = snap.series[i.key]
            return (
              <tr key={i.key}>
                <td>{i.name}</td><td>{i.freq}</td><td>{thresholdText(i, shortUnit(d.unit))}</td>
                <td>{i.why}</td><td>{i.limit}</td><td><code>{sourceOf(d)}</code>{d.note && <div className="macro-muted">{d.note}</div>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function GuideView({ snap, cn }: { snap: MacroSnapshot; cn: MacroSnapshot<CnKey> | null }): JSX.Element {
  return (
    <div className="macro-stack">
      <section className="macro-card macro-card--note">
        <h3>为什么只看这些</h3>
        <p>宏观指标成百上千，这里只留能回答“风险预算还撑不撑得住”的少数几项：就业和信用最先反映衰退，通胀决定央行能不能救，市场指标描述当下情绪。没有一项能预测拐点，几项同时走坏才值得调整预算。</p>
      </section>
      <section aria-label="美国指标"><h2 className="macro-h2">美国</h2><GuideTable indicators={INDICATORS} snap={snap} sourceOf={d => d.fred ?? ''} /></section>
      {cn && <section aria-label="中国指标"><h2 className="macro-h2">中国</h2><GuideTable indicators={CN_INDICATORS} snap={cn} sourceOf={d => d.source ?? ''} /></section>}
      <section className="macro-card">
        <h3>怎么更新</h3>
        <p>页面右上角「刷新最新数据」会实时拉取：本地开发时由本机 Node 拉取，线上由 Vercel 函数拉取，某项失败时沿用快照。快照文件由 GitHub Action 每月 8 日自动运行 <code>npm run macro:update</code> 更新，从 FRED、雅虎财经和东方财富数据中心拉取最新数据写入 <code>public/data/</code>，提交后网页自动更新；也可以在 BusinessWeb 目录手动运行。某个数据源失败时会保留上一次的读数。</p>
      </section>
    </div>
  )
}
