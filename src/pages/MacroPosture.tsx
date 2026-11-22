import React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge, Page, Segmented } from '../components/ui'
import { CANDIDATES } from '../features/macro-posture/candidates'
import { useMacroPostureData } from '../features/macro-posture/data'
import { buildMacroView, POSTURE_RULE_VERSION } from '../features/macro-posture/model'
import type {
  Candidate,
  Market,
  Metric,
  MacroView,
  SubIndex,
  Tone,
  Window,
} from '../features/macro-posture/types'
import '../styles/macro-posture.css'

export const MACRO_POSTURE_LEAD =
  '按公开宏观读数归纳当前经济周期与股票攻守位置。四个子指数是本站口径，不构成买卖建议。'

export const MACRO_POSTURE_FOOTER =
  '读数来自公开数据源；判定规则未经回测，过期指标只作参考。不构成买卖建议。'

const MARKETS: Array<{ id: Market; label: string }> = [
  { id: 'us', label: '美国' },
  { id: 'cn', label: 'A股' },
  { id: 'hk', label: '港股' },
]

const WINDOW_LABELS: Record<Window, string> = {
  fourWeeks: '4 周',
  twelveWeeks: '12 周',
  lastQuarter: '上季度',
  threeMonths: '3 个月',
}

const WINDOW_ORDER: Window[] = ['fourWeeks', 'twelveWeeks', 'threeMonths', 'lastQuarter']

function parseMarket(raw: string | null): Market {
  return raw === 'cn' || raw === 'hk' || raw === 'us' ? raw : 'us'
}

function toneClass(tone: Tone): string {
  return `is-${tone}`
}

function formatSigned(value: number, digits = 1): string {
  const magnitude = Number(Math.abs(value).toFixed(digits))
  return magnitude === 0 ? '0' : `${value > 0 ? '+' : '−'}${magnitude}`
}

function formatMetricValue(metric: Metric, precision: number): string {
  const raw = Number.isInteger(metric.value) ? String(metric.value) : metric.value.toFixed(precision).replace(/\.?0+$/, '')
  return metric.unit ? `${raw} ${metric.unit}` : raw
}

/** % 水平的差值按百分点计；其余沿用原单位 */
function changeUnit(unit: string): string {
  const trimmed = unit.trim()
  if (trimmed === '%' || /百分点|pp/i.test(trimmed)) return '个百分点'
  return trimmed
}

function formatChange(difference: number, unit: string, precision: number): string {
  const digits = Math.abs(difference) >= 10 ? 0 : precision
  const label = changeUnit(unit)
  return `${formatSigned(difference, digits)}${label ? ` ${label}` : ''}`
}

/** 仅 http(s) 做成可点外链；文案尽量短（域名或已知源名） */
function sourceLink(source: string): { href: string; label: string } | null {
  const match = source.match(/https?:\/\/[^\s·）)\]]+/i)
  if (!match) return null
  const href = match[0].replace(/[.,;:]+$/, '')
  if (!/^https?:\/\//i.test(href)) return null
  try {
    const host = new URL(href).hostname.replace(/^www\./, '')
    if (/fred\.stlouisfed\.org/i.test(host)) return { href, label: 'FRED' }
    if (/cboe\.com/i.test(host)) return { href, label: 'Cboe' }
    return { href, label: host }
  } catch {
    return null
  }
}

function SourceRef({ source }: { source: string }): JSX.Element | null {
  const link = sourceLink(source)
  if (link) {
    return (
      <a className="mp-source" href={link.href} target="_blank" rel="noopener noreferrer">
        {link.label}
      </a>
    )
  }
  const text = source.trim()
  return text ? <span className="mp-source mp-source--text">{text}</span> : null
}

function MetricBlock({ evidence }: { evidence: SubIndex['evidence'] }): JSX.Element {
  if (!evidence.length) {
    return <p className="mp-evidence__empty">暂无可用指标</p>
  }
  return (
    <ul className="mp-evidence">
      {evidence.map(item => {
        const metric = item.metric
        if (!metric) {
          return (
            <li key={item.key} className="mp-evidence__item">
              <span className="mp-evidence__label">{item.label}</span>
              <span className="mp-evidence__value">暂无读数</span>
            </li>
          )
        }
        const changes = WINDOW_ORDER
          .map(window => {
            const change = metric.changes[window]
            if (!change) return null
            return { window, change }
          })
          .filter((row): row is { window: Window; change: NonNullable<Metric['changes'][Window]> } => row != null)
        const source = metric.source ? <SourceRef source={metric.source} /> : null
        const precision = item.key === 'hkd' ? 4 : 2

        return (
          <li key={item.key} className="mp-evidence__item">
            <span className="mp-evidence__label">{item.label}</span>
            <span className="mp-evidence__value">{formatMetricValue(metric, precision)}</span>
            <span className={`mp-evidence__meta${metric.stale ? ' mp-evidence__stale' : ''}`}>
              {metric.date}
              {metric.stale ? ' · 已过期，仅供参考' : ''}
              {source ? <> · {source}</> : null}
            </span>
            {changes.length > 0 && (
              <ul className="mp-evidence__changes">
                {changes.map(({ window, change }) => (
                  <li key={window}>
                    {WINDOW_LABELS[window]} {formatChange(change.difference, metric.unit, precision)}
                    <span aria-hidden="true">
                      （前值 {change.before.value}{metric.unit ? ` ${metric.unit}` : ''} · {change.before.date}）
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function SignalCard({
  eyebrow,
  signal,
}: {
  eyebrow: string
  signal: MacroView['economy']
}): JSX.Element {
  return (
    <article className="mp-signal">
      <p className="mp-signal__eyebrow">{eyebrow}</p>
      <p className={`mp-signal__label ${toneClass(signal.tone)}`}>{signal.label}</p>
      <p className="mp-signal__detail">{signal.detail}</p>
    </article>
  )
}

function IndexCard({ index }: { index: SubIndex }): JSX.Element {
  return (
    <article className="mp-index" aria-labelledby={`mp-index-${index.id}`}>
      <div className="mp-index__head">
        <h3 id={`mp-index-${index.id}`} className="mp-index__title">{index.title}</h3>
        {index.score != null && (
          <span className="mp-index__score" aria-label={`分数 ${formatSigned(index.score)}`}>
            {formatSigned(index.score)}
          </span>
        )}
      </div>
      <p className={`mp-index__status ${toneClass(index.tone)}`}>{index.label}</p>
      <p className="mp-index__detail">{index.detail}</p>
      <MetricBlock evidence={index.evidence} />
    </article>
  )
}

function CandidatesPanel({ market, items }: { market: Market; items: readonly Candidate[] }): JSX.Element {
  const marketLabel = MARKETS.find(m => m.id === market)?.label ?? market
  return (
    <details className="mp-candidates" id="macro-posture-candidates">
      <summary className="mp-candidates__summary">备选指标 · {marketLabel}（{items.length}）</summary>
      <p className="mp-candidates__lead">
        覆盖状态按 2026 年 11 月盘点。每项列出拟验证的问题，现有指标也可补长历史或改用其他窗口。
      </p>
      {items.length === 0 ? (
        <p className="mp-candidates__empty" role="status">当前市场暂无备选指标。</p>
      ) : (
        <ul className="mp-candidates__list">
          {items.map(item => (
            <li key={`${item.category}-${item.name}`} className="mp-candidate">
              <p className="mp-candidate__name">{item.name}</p>
              <div className="mp-candidate__meta">
                <Badge tone="neutral">{item.category}</Badge>
                <Badge tone={item.coverage === '站内已有' ? 'accent' : 'muted'}>{item.coverage}</Badge>
              </div>
              <p className="mp-candidate__desc">
                <span className="visually-hidden">未来验证目标：</span>
                {item.description}
              </p>
              {item.source ? (
                <p className="mp-candidate__source">
                  来源 <SourceRef source={item.source} />
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

function ReadyView({ view }: { view: MacroView }): JSX.Element {
  return (
    <>
      <p className="mp-disclaimer" role="note">
        以下判定未经回测证实；过期读数只作参考，不参与进攻结论。
      </p>
      {view.failedSources.length > 0 && (
        <p className="mp-partial" role="status">
          失效源：{view.failedSources.join('、')}。相关读数按各自有效期判断。
        </p>
      )}

      <section className="mp-hero" aria-label="经济周期与股票攻守">
        <SignalCard eyebrow="经济周期" signal={view.economy} />
        <SignalCard eyebrow="股票攻守" signal={view.posture} />
      </section>

      <section className="mp-indices" aria-labelledby="mp-indices-title">
        <h2 id="mp-indices-title" className="mp-indices__title">四个子指数</h2>
        <div className="mp-indices__grid">
          {view.indices.map(index => <IndexCard key={index.id} index={index} />)}
        </div>
      </section>
    </>
  )
}

export default function MacroPosture(): JSX.Element {
  const [params, setParams] = useSearchParams()
  const market = parseMarket(params.get('market'))
  const state = useMacroPostureData()
  const candidates = CANDIDATES[market] ?? []

  const setMarket = (next: Market): void => {
    setParams(prev => {
      const copy = new URLSearchParams(prev)
      copy.set('market', next)
      return copy
    }, { replace: true })
  }

  const view = state.status === 'ready' ? buildMacroView(market, state.data[market]) : null
  const asOf = view?.asOf ?? (state.status === 'ready' ? state.data[market].asOf : null)

  return (
    <Page className="mp-page">
      <header className="page-head mp-head">
        <h1>宏观攻守</h1>
        <p className="mp-head__lead">{MACRO_POSTURE_LEAD}</p>
        <ul className="mp-head__links">
          <li><Link to="/monitor">宏观温度</Link></li>
          <li><Link to="/invest/macro-masters">宏观大师</Link></li>
          <li><a href="#macro-posture-candidates">回测备选</a></li>
        </ul>
      </header>

      <div className="mp-toolbar">
        <Segmented
          label="市场"
          items={MARKETS}
          value={market}
          onChange={setMarket}
        />
        {asOf ? <p className="mp-asof">最新指标观测日 {asOf}</p> : null}
      </div>

      {state.status === 'loading' && (
        <p className="mp-status" role="status">宏观攻守数据加载中…</p>
      )}
      {state.status === 'error' && (
        <p className="mp-error" role="alert">宏观攻守数据加载失败，请稍后重试。</p>
      )}
      {view && <ReadyView view={view} />}

      <CandidatesPanel market={market} items={candidates} />

      <footer className="mp-footer" role="note">
        <p>{POSTURE_RULE_VERSION}</p>
        <p>{MACRO_POSTURE_FOOTER}</p>
      </footer>
    </Page>
  )
}
