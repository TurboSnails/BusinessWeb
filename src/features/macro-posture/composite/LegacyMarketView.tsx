import React from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../../../components/ui'
import { CANDIDATES } from '../candidates'
import type {
  Candidate,
  Market,
  Metric,
  MacroView,
  PostureReview,
  SubIndex,
  Tone,
  Window,
} from '../types'

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

function sourceLink(source: string): { href: string; label: string } | null {
  const match = source.match(/https?:\/\/[^\s·）)\]]+/i)
  if (!match) return null
  const href = match[0].replace(/[.,;:]+$/, '')
  if (!/^https?:\/\//i.test(href)) return null
  try {
    const host = new URL(href).hostname.replace(/^www\./, '')
    if (/fred\.stlouisfed\.org/i.test(host)) return { href, label: 'FRED' }
    if (/cboe\.com/i.test(host)) return { href, label: 'Cboe' }
    if (host === 'factset.com' || host.endsWith('.factset.com')) return { href, label: 'FactSet' }
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

function ReviewPanel({ review }: { review: PostureReview }): JSX.Element {
  return (
    <section className="mp-review" aria-labelledby="mp-review-title">
      <header className="mp-review__head">
        <h2 id="mp-review-title">未来 4–12 周怎么观察</h2>
        <p>{review.guidance}</p>
        <p><strong>主要风险</strong> {review.risk}</p>
      </header>
      <div className="mp-review__grid">
        <section className="mp-review__panel" aria-labelledby="mp-counter-title">
          <h3 id="mp-counter-title">反向证据</h3>
          <p>{review.counterpoint}</p>
          <MetricBlock evidence={review.counterEvidence} />
        </section>
        <section className="mp-review__panel" aria-labelledby="mp-market-title">
          <h3 id="mp-market-title">市场压力</h3>
          <p className={`mp-index__status ${toneClass(review.market.tone)}`}>{review.market.label}</p>
          <p>{review.market.detail}</p>
          <MetricBlock evidence={review.market.evidence} />
          <p><Link to="/monitor?tab=us-market">查看美股市场详情</Link></p>
        </section>
      </div>
      <h3>什么情况会改判</h3>
      <dl className="mp-review__conditions">
        {review.reassess.map(item => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** A 股 / 港股沿用旧模型渲染，行为与改版前一致。 */
export default function LegacyMarketView({
  market,
  view,
  status,
}: {
  market: Market
  view: MacroView | null
  status: 'loading' | 'error' | 'ready'
}): JSX.Element {
  const candidates = CANDIDATES[market] ?? []

  return (
    <>
      {status === 'loading' && (
        <p className="mp-status" role="status">宏观攻守数据加载中…</p>
      )}
      {status === 'error' && (
        <p className="mp-error" role="alert">宏观攻守数据加载失败，请稍后重试。</p>
      )}
      {view && (
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

          {view.review && <ReviewPanel review={view.review} />}

          <section className="mp-indices" aria-labelledby="mp-indices-title">
            <h2 id="mp-indices-title" className="mp-indices__title">四个子指数</h2>
            <div className="mp-indices__grid">
              {view.indices.map(index => <IndexCard key={index.id} index={index} />)}
            </div>
          </section>
        </>
      )}

      <CandidatesPanel market={market} items={candidates} />
    </>
  )
}
