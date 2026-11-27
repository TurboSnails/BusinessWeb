import React from 'react'
import { Link } from 'react-router-dom'
import { useEquityCapInput } from '../macro-posture/composite/useEquityCapInput'
import CapCalculator from './CapCalculator'
import { formatSharePct, resolveExecutable, tierLabel, visibleText } from './labels'
import type { CombinedStrategyFile } from './types'
import type { TacticalWatch } from './watch'

function officialText(month: string | undefined): string | null {
  if (!month) return null
  const m = Number(month.slice(5, 7))
  return m ? `${m} 月底定档` : null
}

export default function NowPanel({
  data,
  watch = null,
}: {
  data: CombinedStrategyFile
  watch?: TacticalWatch | null
}): JSX.Element {
  const { current } = data
  const tier = current.macroTier
  const share = formatSharePct(current.equityShare)
  const official = officialText(current.official?.month)
  const capInput = useEquityCapInput()
  const position = resolveExecutable({
    instruction: current.instruction,
    macroTier: current.macroTier,
    equityShare: current.equityShare,
    official: current.official,
    cap: capInput.cap,
  })

  return (
    <section
      className="cs-now cs-hero"
      id="cs-now"
      aria-labelledby="cs-now-title"
      data-tier={tier ?? 'none'}
    >
      <div className="cs-hero__top">
        <h2 id="cs-now-title" className="cs-hero__eyebrow">现在怎么做</h2>
        <span className="cs-hero__chips">
          <span className="cs-chip cs-chip--tier" data-testid="cs-now-tier">
            {tierLabel(tier)}{share ? ` · ${share}` : ''}
          </span>
          {official ? <span className="cs-chip">{official}</span> : null}
        </span>
      </div>

      <div className="cs-hero__grid">
        <div className="cs-hero__main">
          <p className="cs-now__instruction" data-testid="cs-instruction">
            {position.text}
          </p>
          <p className="cs-now__scope" data-testid="cs-now-scope">
            这是美股总仓位。主动额度和备用金另按
            <Link to="/monitor?tab=method">风险预算阶段</Link>
            执行。
          </p>
        </div>
        <CapCalculator position={position} capInput={capInput} />
        {watch ? (
          <p
            className={`cs-watch${watch.close ? ' is-close' : ''}`}
            data-testid="cs-now-watch"
            role="note"
          >
            <strong className="cs-watch__label">月底前留意</strong>
            <span>{visibleText(watch.text)}</span>
            {' '}<a href="#cs-triggers">什么情况下要动</a>
          </p>
        ) : null}
      </div>

      <h3 className="cs-now__steps-title">这个月要做的三件事</h3>
      <ol className="cs-now__steps" data-testid="cs-steps">
        {current.steps.map((step, i) => (
          <li key={step.title} data-testid={`cs-step-${step.title}`}>
            <span className="cs-now__step-no" aria-hidden="true">{i + 1}</span>
            <strong className="cs-now__step-title">{step.title}</strong>
            <span className="cs-now__step-text">{visibleText(step.text)}</span>
          </li>
        ))}
      </ol>

      {current.heat === 'hot' ? (
        <details className="cs-discipline" data-testid="cs-discipline">
          <summary>
            <strong className="cs-discipline__label">偏热时的纪律</strong>
            标普跌 20% 时，按建议上限 80%，美股资金大约跌 14%（上限 100% 约 17%）。规则不会提前躲开。
          </summary>
          <ul className="cs-discipline__list">
            <li>不融资，不用杠杆 ETF。</li>
            <li>三年内确定要用的钱，不放在股票里。</li>
            <li>新增资金先放短期国债，每月执行时按档位买入。</li>
            <li>急跌时不手动加减仓，按月执行。</li>
          </ul>
          <p className="cs-discipline__why">
            依据：宏观没问题但偏热时开始的 9 次回调，本策略中位承受标普约 85% 的跌幅；用利差走阔、VIX 放大、新高变少等提前预警的 7 种写法都没有通过，这些现象多在回调开始后才出现。
            {' '}<Link to="/invest/strategy/spec">说明书第十章</Link>
          </p>
        </details>
      ) : null}

      {current.dates.length > 0 ? (
        <p className="cs-now__dates" data-testid="cs-dates">
          <span className="cs-now__dates-label">数据更新</span>
          {current.dates.map((row, i) => (
            <span key={`${row.label}-${row.date}`}>
              {i > 0 ? ' · ' : ''}{row.label} {row.date}
            </span>
          ))}
        </p>
      ) : null}
    </section>
  )
}
