import React from 'react'
import { TableWrap } from '../../components/ui'
import {
  TIER_LABEL,
  formatNum2,
  formatPct1,
  visibleText,
} from './labels'
import type { RadarFile, RadarMetrics } from './types'
import type { TierId } from '../macro-posture/composite/types'

function MetricCells({ m, period }: { m: RadarMetrics; period: 'train' | 'test' | 'full' }): JSX.Element {
  const testClass = period === 'test' ? ' mr-bt__col--test' : ''
  return (
    <>
      <td className={`num${testClass}`}>{formatPct1(m.cagr)}</td>
      <td className={`num${testClass}`}>{formatPct1(m.maxDd)}</td>
      <td className={`num${testClass}`}>{visibleText(formatNum2(m.sharpe))}</td>
      <td className={`num${testClass}`}>{formatPct1(m.avgEquity)}</td>
    </>
  )
}

function DualTimeline({ rows }: { rows: RadarFile['backtest']['timeline'] }): JSX.Element | null {
  if (!rows.length) return null
  return (
    <div className="mr-dual" data-testid="mr-dual-timeline">
      <h3 className="mr-subhead">月度档位对照</h3>
      <div className="mr-dual__row">
        <span className="mr-dual__label">雷达</span>
        <div className="mr-dual__band" role="img" aria-label="雷达月度档位色带">
          {rows.map(point => {
            const tier = point.radar
            const label = tier ? TIER_LABEL[tier] : '证据不足'
            return (
              <span
                key={`r-${point.d}`}
                className={`mr-dual__seg${tier ? ` mr-dual__seg--${tier}` : ' mr-dual__seg--none'}`}
                title={`${point.d} · 雷达 ${label}`}
              >
                <span className="visually-hidden">{point.d} 雷达 {label}</span>
              </span>
            )
          })}
        </div>
      </div>
      <div className="mr-dual__row">
        <span className="mr-dual__label">大师</span>
        <div className="mr-dual__band" role="img" aria-label="大师方案月度档位色带">
          {rows.map(point => {
            const tier = point.masters
            const label = tier ? TIER_LABEL[tier] : '证据不足'
            return (
              <span
                key={`m-${point.d}`}
                className={`mr-dual__seg${tier ? ` mr-dual__seg--${tier}` : ' mr-dual__seg--none'}`}
                title={`${point.d} · 大师 ${label}`}
              >
                <span className="visually-hidden">{point.d} 大师 {label}</span>
              </span>
            )
          })}
        </div>
      </div>
      <ul className="mr-dual__legend" aria-label="档位图例">
        {(Object.keys(TIER_LABEL) as TierId[]).map(id => (
          <li key={id}>
            <span className={`mr-dual__swatch mr-dual__swatch--${id}`} aria-hidden="true" />
            {TIER_LABEL[id]}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function BacktestPanel({ data }: { data: RadarFile }): JSX.Element {
  const bt = data.backtest
  return (
    <section className="mr-backtest" id="mr-backtest" aria-labelledby="mr-backtest-title">
      <h2 id="mr-backtest-title">回测对照</h2>
      <p className="mr-muted" data-testid="mr-backtest-range">
        {bt.start} 至 {bt.end}。训练期 {bt.trainRange} 定规则；验证期 {bt.testRange} 只原样报告，未参与挑选。
      </p>

      <TableWrap label="雷达回测对照" className="mr-bt__scroll mr-bt__scroll--sticky-test">
        <table className="mr-table mr-bt__table" data-testid="mr-backtest-table">
          <thead>
            <tr>
              <th scope="col" className="mr-bt__col--name">方案</th>
              <th scope="col" className="mr-bt__col--test">验证年化<span className="mr-bt__hint">未参与挑选</span></th>
              <th scope="col" className="mr-bt__col--test">验证回撤</th>
              <th scope="col" className="mr-bt__col--test">验证夏普</th>
              <th scope="col" className="mr-bt__col--test">验证仓位</th>
              <th scope="col">训练年化</th>
              <th scope="col">训练回撤</th>
              <th scope="col">训练夏普</th>
              <th scope="col">训练仓位</th>
              <th scope="col">全年化</th>
              <th scope="col">全回撤</th>
              <th scope="col">全夏普</th>
              <th scope="col">全仓位</th>
            </tr>
          </thead>
          <tbody>
            {bt.rows.map(row => (
              <tr key={row.id} className={row.id === 'radar' ? 'is-highlight' : undefined} data-row={row.id}>
                <th scope="row" className="mr-bt__col--name">{row.label}</th>
                <MetricCells m={row.test} period="test" />
                <MetricCells m={row.train} period="train" />
                <MetricCells m={row.full} period="full" />
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

      <DualTimeline rows={bt.timeline} />

      <h3 className="mr-subhead">披露</h3>
      <ul className="mr-disclosures" data-testid="mr-disclosures">
        {bt.disclosures.map(item => <li key={item}>{visibleText(item)}</li>)}
      </ul>
    </section>
  )
}
