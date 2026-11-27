import React from 'react'
import { Link } from 'react-router-dom'
import {
  RECOMMENDED_EQUITY_CAP,
  useEquityCapInput,
} from '../macro-posture/composite/useEquityCapInput'
import { formatSharePct } from './labels'

/**
 * 综合策略页的「换算成你的仓位」：大号显示换算结果，上限可改。
 * 与宏观攻守页的上限输入共用同一本地存储键，改一处两页同步。
 */
export default function CapCalculator({ equityShare }: { equityShare: number | null }): JSX.Element {
  const {
    fieldId,
    errorId,
    hintId,
    describedBy,
    cap,
    draft,
    error,
    correction,
    isRecommended,
    invalid,
    onChange,
    onBlur,
    onKeyDown,
    reset,
  } = useEquityCapInput()
  const share = equityShare != null && Number.isFinite(equityShare) ? equityShare : null
  const implied = share == null ? null : Math.round(cap * share)

  return (
    <div className="cs-cap mp-equity-cap" data-testid="mp-equity-cap">
      <p className="cs-cap__kicker">换算成你的美股仓位</p>
      <p className="cs-cap__value" data-testid="mp-equity-cap-implied" aria-live="polite">
        {implied == null ? (
          <span className="cs-cap__na">暂不换算</span>
        ) : (
          <>
            <span className="cs-cap__num">{implied}</span>
            <span className="cs-cap__unit">%</span>
            <span className="visually-hidden">（现在约 {implied}%）</span>
          </>
        )}
      </p>
      <p className="cs-cap__formula">
        <label htmlFor={fieldId}>上限</label>
        <span className="cs-cap__field">
          <input
            id={fieldId}
            type="text"
            inputMode="decimal"
            value={draft}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={e => onChange(e.target.value)}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
          />
          <span aria-hidden="true">%</span>
        </span>
        {isRecommended ? null : (
          <button type="button" className="cs-cap__reset" onClick={reset}>
            改回 {RECOMMENDED_EQUITY_CAP}%
          </button>
        )}
        {share == null ? null : <span className="cs-cap__times">× 档位 {formatSharePct(share)}</span>}
      </p>
      {(error || correction) && (
        <p id={errorId} className="cs-cap__feedback" role="status" data-testid="mp-equity-cap-feedback">
          {error || correction}
        </p>
      )}
      <p id={hintId} className="cs-cap__def">
        上限 = 你打算投入美股的资金里，最多放股票的比例；其余放现金或短期国债。每月按这笔钱的当前总值算。
      </p>
      <details className="cs-cap__why">
        <summary data-testid="mp-equity-cap-recommend">
          {isRecommended ? `为什么建议 ${RECOMMENDED_EQUITY_CAP}%` : `建议 ${RECOMMENDED_EQUITY_CAP}%，为什么`}
        </summary>
        <p>
          以降低波动为目标。上限取 {RECOMMENDED_EQUITY_CAP}% 时，历史上波动约 11% → 9%，最大回撤约 −33% → −27%，
          年化少约 1 个百分点。能承受更大波动可以调高。
          {' '}<Link to="/invest/strategy/spec">依据</Link>
        </p>
      </details>
    </div>
  )
}
