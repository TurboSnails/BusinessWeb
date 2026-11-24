import React from 'react'
import { TableWrap } from '../../components/ui'
import { formatNum2, formatPct1, visibleText } from './labels'
import type { CombinedStrategyFile, StrategyMetrics } from './types'

function MetricCells({ m }: { m: StrategyMetrics }): JSX.Element {
  return (
    <>
      <td className="num">{formatPct1(m.cagr)}</td>
      <td className="num">{formatPct1(m.maxDd)}</td>
      <td className="num">{visibleText(formatNum2(m.sharpe))}</td>
      <td className="num">{formatPct1(m.avgEquity)}</td>
    </>
  )
}

export default function FusionPanel({ data }: { data: CombinedStrategyFile }): JSX.Element {
  const { fusion } = data
  return (
    <section className="cs-fusion" id="cs-fusion" aria-labelledby="cs-fusion-title">
      <h2 id="cs-fusion-title">融合检验</h2>
      <p className="cs-verdict" data-testid="cs-fusion-verdict">{visibleText(fusion.verdict)}</p>
      <p className="cs-muted" data-testid="cs-fusion-range">
        {fusion.start} 至 {fusion.end}。训练期 {fusion.trainRange}；验证期 {fusion.testRange}。
      </p>

      <TableWrap label="融合规则对照" className="cs-fusion__scroll cs-fusion__scroll--sticky">
        <table className="cs-table cs-fusion__table" data-testid="cs-fusion-table">
          <thead>
            <tr>
              <th scope="col" className="cs-fusion__col--name">规则</th>
              <th scope="col">验证期年化</th>
              <th scope="col">验证期回撤</th>
              <th scope="col">验证期夏普</th>
              <th scope="col">验证期仓位</th>
              <th scope="col">训练期年化</th>
              <th scope="col">训练期回撤</th>
              <th scope="col">训练期夏普</th>
              <th scope="col">训练期仓位</th>
              <th scope="col">全样本年化</th>
              <th scope="col">全样本回撤</th>
              <th scope="col">全样本夏普</th>
              <th scope="col">全样本仓位</th>
            </tr>
          </thead>
          <tbody>
            {fusion.rows.map(row => {
              const baseline = row.id === 'macro'
              const adopted = fusion.adopted === row.id
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
                  <MetricCells m={row.test} />
                  <MetricCells m={row.train} />
                  <MetricCells m={row.full} />
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>

      <h3 className="cs-subhead">披露</h3>
      <ul className="cs-disclosures" data-testid="cs-fusion-disclosures">
        {fusion.disclosures.map(item => <li key={item}>{visibleText(item)}</li>)}
      </ul>
    </section>
  )
}
