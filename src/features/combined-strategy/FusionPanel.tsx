import React from 'react'
import { TableWrap } from '../../components/ui'
import { formatNum2, formatPct1, visibleText } from './labels'
import type { CombinedStrategyFile, StrategyMetrics, WeeklyStrategyMetrics } from './types'

/** 回撤：按周为主，括号内月末口径（只出现一次）。 */
function DrawdownCell({
  weekly,
  monthly,
  testId,
}: {
  weekly: WeeklyStrategyMetrics | undefined
  monthly: StrategyMetrics
  testId?: string
}): JSX.Element {
  if (!weekly) {
    return <td className="num">{formatPct1(monthly.maxDd)}</td>
  }
  return (
    <td className="num">
      <span {...(testId ? { 'data-testid': testId } : {})}>{formatPct1(weekly.maxDd)}</span>
      <span className="cs-muted cs-fusion__monthly-ref" title="月末口径">
        {' '}（月 {formatPct1(monthly.maxDd)}）
      </span>
    </td>
  )
}

function PeriodCells({
  weekly,
  monthly,
  ddTestId,
}: {
  weekly: WeeklyStrategyMetrics | undefined
  monthly: StrategyMetrics
  ddTestId?: string
}): JSX.Element {
  return (
    <>
      <td className="num">{formatPct1(monthly.cagr)}</td>
      <DrawdownCell weekly={weekly} monthly={monthly} testId={ddTestId} />
      <td className="num">{visibleText(formatNum2(monthly.sharpe))}</td>
      <td className="num">{formatPct1(monthly.avgEquity)}</td>
    </>
  )
}

export default function FusionPanel({
  data,
  embedded = false,
}: {
  data: CombinedStrategyFile
  embedded?: boolean
}): JSX.Element {
  const { fusion, weekly } = data
  const weeklyById = new Map((weekly?.rows ?? []).map(row => [row.id, row]))
  const Tag = embedded ? 'div' : 'section'
  return (
    <Tag className="cs-fusion" id="cs-fusion" {...(embedded ? {} : { 'aria-labelledby': 'cs-fusion-title' })}>
      {embedded ? null : <h2 id="cs-fusion-title">融合检验</h2>}
      <p className="cs-verdict" data-testid="cs-fusion-verdict">{visibleText(fusion.verdict)}</p>
      <p className="cs-muted" data-testid="cs-fusion-range">
        {fusion.start} 至 {fusion.end}。训练期 {fusion.trainRange}；验证期 {fusion.testRange}。
      </p>
      {weekly ? (
        <p className="cs-lead" data-testid="cs-weekly-note">
          {visibleText(weekly.note)}
          {' '}回撤以按周记账为主，括号内是月末口径——只看月末会低估急跌时的回撤；夏普仍按月收益计算。
        </p>
      ) : null}

      <TableWrap label="融合规则对照" className="cs-fusion__scroll cs-fusion__scroll--sticky">
        <table className="cs-table cs-fusion__table" data-testid="cs-fusion-table">
          <thead>
            <tr>
              <th scope="col" className="cs-fusion__col--name">规则</th>
              <th scope="col">验证期年化</th>
              <th scope="col">验证期回撤（按周）</th>
              <th scope="col">验证期夏普（按月）</th>
              <th scope="col">验证期仓位</th>
              <th scope="col">训练期年化</th>
              <th scope="col">训练期回撤（按周）</th>
              <th scope="col">训练期夏普（按月）</th>
              <th scope="col">训练期仓位</th>
              <th scope="col">全样本年化</th>
              <th scope="col">全样本回撤（按周）</th>
              <th scope="col">全样本波动（按周）</th>
              <th scope="col">全样本夏普（按月）</th>
              <th scope="col">全样本仓位</th>
            </tr>
          </thead>
          <tbody>
            {fusion.rows.map(row => {
              const baseline = row.id === 'macro'
              const adopted = fusion.adopted === row.id
              const w = weeklyById.get(row.id)
              return (
                <tr
                  key={row.id}
                  className={baseline ? 'is-highlight' : undefined}
                  data-row={row.id}
                  data-adopted={adopted ? 'true' : undefined}
                >
                  <th scope="row" className="cs-fusion__col--name">
                    <span className="cs-fusion__label">{row.label}</span>
                    <span className="cs-fusion__rule">{visibleText(row.rule)}</span>
                    {row.passTrain === true ? (
                      <span className="cs-badge" data-testid={`cs-pass-train-${row.id}`}>训练期过线</span>
                    ) : null}
                    {adopted ? (
                      <span className="cs-badge cs-badge--adopt" data-testid="cs-adopted-badge">采用</span>
                    ) : null}
                  </th>
                  <PeriodCells weekly={w?.test} monthly={row.test} />
                  <PeriodCells weekly={w?.train} monthly={row.train} />
                  <td className="num">{formatPct1(row.full.cagr)}</td>
                  <DrawdownCell
                    weekly={w?.full}
                    monthly={row.full}
                    testId={baseline ? 'cs-weekly-dd' : undefined}
                  />
                  <td className="num" {...(baseline ? { 'data-testid': 'cs-weekly-vol' } : {})}>
                    {w?.full ? formatPct1(w.full.vol) : '—'}
                  </td>
                  <td className="num">{visibleText(formatNum2(row.full.sharpe))}</td>
                  <td className="num">{formatPct1(row.full.avgEquity)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>

      {weekly?.controls?.length ? (
        <>
          <h3 className="cs-subhead">按周记账对照</h3>
          <TableWrap label="按周记账对照" className="cs-fusion__scroll">
            <table className="cs-table" data-testid="cs-weekly-controls">
              <thead>
                <tr>
                  <th scope="col">对照</th>
                  <th scope="col">年化</th>
                  <th scope="col">波动</th>
                  <th scope="col">最大回撤</th>
                  <th scope="col">最长回撤（周）</th>
                  <th scope="col">最差一周</th>
                  <th scope="col">最差一月</th>
                </tr>
              </thead>
              <tbody>
                {[weekly.rows.find(r => r.id === 'macro'), ...weekly.controls].filter(Boolean).map(row => (
                  <tr key={row!.id} data-row={row!.id}>
                    <th scope="row">{row!.label}</th>
                    <td className="num">{formatPct1(row!.full.cagr)}</td>
                    <td className="num">{formatPct1(row!.full.vol)}</td>
                    <td className="num">{formatPct1(row!.full.maxDd)}</td>
                    <td className="num">{row!.full.maxDdWeeks}</td>
                    <td className="num">{formatPct1(row!.full.worstWeek)}</td>
                    <td className="num">{formatPct1(row!.full.worstMonth)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </>
      ) : null}

      <h3 className="cs-subhead">披露</h3>
      <ul className="cs-disclosures" data-testid="cs-fusion-disclosures">
        {[...(weekly?.disclosures ?? []), ...fusion.disclosures].map(item => (
          <li key={item}>{visibleText(item)}</li>
        ))}
      </ul>
    </Tag>
  )
}
