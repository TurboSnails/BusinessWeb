import React, { useId } from 'react'
import { Link } from 'react-router-dom'
import { tierDef, useCompositePosture } from './load'
import { confidenceBadgeText, formatPct1 } from './labels'
import type { CompositeFile, TierId } from './types'
import './summary-card.css'

function TierStrip({ data, current }: { data: CompositeFile; current: TierId | null }): JSX.Element {
  const currentLabel = tierDef(data, current)?.label ?? '证据不足'
  return (
    <ol className="macro-summary__tiers" aria-label={`宏观攻守五档，当前为${currentLabel}`}>
      {[...data.tiers].reverse().map(tier => {
        const active = tier.id === current
        return (
          <li
            key={tier.id}
            className={`macro-summary__tier macro-summary__tier--${tier.id}${active ? ' is-current' : ''}`}
            aria-current={active ? 'step' : undefined}
          >
            <span>{tier.label}</span>
            {active && <strong className="macro-summary__current">当前</strong>}
          </li>
        )
      })}
    </ol>
  )
}

function DetailsLink(): JSX.Element {
  return <Link className="macro-summary__link" to="/invest/macro-posture">查看依据与回测<span aria-hidden="true"> →</span></Link>
}

function BacktestSummary({ data }: { data: CompositeFile }): JSX.Element | null {
  const variants = data.backtest.variants ?? []
  const conservative = variants.find(variant => variant.id === 'noNfci')
  const buyhold = variants.find(variant => variant.id === 'buyhold')
  if (!conservative || !buyhold) return null

  return (
    <p className="macro-summary__backtest">
      回测 {data.backtest.start.slice(0, 4)} 年以来（最保守口径）：年化 {formatPct1(conservative.cagr)} / 最大回撤 {formatPct1(conservative.maxDd)}，同期持有标普 {formatPct1(buyhold.cagr)} / {formatPct1(buyhold.maxDd)}
    </p>
  )
}

function pickSummaryDates(
  dates: CompositeFile['current']['dates'] | undefined,
  asOf: string,
): { label: string; date: string }[] {
  if (!Array.isArray(dates) || dates.length === 0) {
    return [{ label: '数据截至', date: asOf }]
  }
  const picked = dates.filter(row => /标普/.test(row.label) || /宏观月度/.test(row.label))
  return picked.length > 0 ? picked : dates.slice(0, 2)
}

export default function SummaryCard({ fetcher }: { fetcher?: typeof fetch }): JSX.Element {
  const state = useCompositePosture(fetcher)
  const titleId = useId()

  return (
    <section className="macro-summary" aria-labelledby={titleId} data-state={state.status}>
      <header className="macro-summary__head">
        <h2 id={titleId}>本站宏观攻守结论</h2>
        <DetailsLink />
      </header>

      {state.status === 'loading' && (
        <div className="macro-summary__loading" aria-busy="true">
          <p role="status">正在读取综合攻守结论…</p>
          <div className="macro-summary__skeleton-tiers" aria-hidden="true">
            {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
          </div>
          <div className="macro-summary__skeleton-lines" aria-hidden="true"><span /><span /></div>
        </div>
      )}

      {state.status === 'error' && (
        <p className="macro-summary__message" role="alert">综合攻守结论暂时无法读取，请稍后重试。</p>
      )}

      {state.status === 'ready' && (() => {
        const { data } = state
        const { current } = data
        const tier = tierDef(data, current.final.tier)
        const share = current.final.equityShare
        const hasPosition = Boolean(tier) && share != null && Number.isFinite(share)
        const warnings = current.warnings
        const tacticalDistance = current.distance?.tactical
        const dateRows = pickSummaryDates(current.dates, current.asOf)
        return (
          <div className="macro-summary__ready">
            <TierStrip data={data} current={current.final.tier} />
            <div className="macro-summary__conclusion">
              <div className="macro-summary__position">
                <p className="macro-summary__tier-name">{tier?.label ?? '证据不足'}</p>
                <p className="macro-summary__share">
                  {hasPosition
                    ? `股票仓位约为你自设上限的 ${Number((share! * 100).toFixed(1))}%`
                    : '证据不足，暂不给出股票仓位参考。'}
                </p>
              </div>
              <div className="macro-summary__reading">
                <p className="macro-summary__confidence">
                  {confidenceBadgeText(current.confidence)}
                </p>
                {warnings && (
                  <p className={`macro-summary__warnings${warnings.on > 0 ? ' is-active' : ''}`}>
                    短线预警 {warnings.on}/{warnings.total} 项亮灯
                  </p>
                )}
                {tacticalDistance && (
                  <p className="macro-summary__tactical-distance" title={tacticalDistance}>{tacticalDistance}</p>
                )}
                <p className="macro-summary__headline">{current.headline}</p>
              </div>
            </div>
            <ul className="macro-summary__date" data-testid="macro-summary-dates">
              {dateRows.map(row => (
                <li key={`${row.label}-${row.date}`}>
                  {row.label}
                  {' '}
                  <time dateTime={current.asOf}>{row.date}</time>
                </li>
              ))}
            </ul>
            <BacktestSummary data={data} />
          </div>
        )
      })()}
    </section>
  )
}
