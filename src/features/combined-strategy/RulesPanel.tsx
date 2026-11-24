import React from 'react'
import { TableWrap } from '../../components/ui'
import { useCompositePosture } from '../macro-posture/composite/load'
import { formatSharePct, visibleText } from './labels'
import type { CombinedStrategyFile } from './types'

const CADENCE = [
  '每月最后一个交易日正式定档，下个月内把仓位调到位。回测里档位是隔一个月才生效的，不需要当天交易。',
  '月中页面上的档位是按当月至今的数据预估的，只作提醒，不据此调仓。',
  '股票以外的部分放现金或短期国债。回测里这部分按 3 个月国库券利率计息。',
  '仓位只看宏观攻守的档位。雷达的冷热不改变仓位，只影响下面每一格的做法。',
] as const

export default function RulesPanel({ data }: { data: CombinedStrategyFile }): JSX.Element {
  const composite = useCompositePosture()
  const currentTier = data.current.macroTier
  const tiers = composite.status === 'ready' ? composite.data.tiers : []
  const full = composite.status === 'ready'
    ? composite.data.backtest.variants.find(v => v.id === 'full')
    : undefined
  const costs = composite.status === 'ready' ? composite.data.backtest.costs : undefined
  const costRow = costs?.rows.find(r => Math.abs(r.cost - 0.001) < 1e-9) ?? costs?.rows[1]

  return (
    <section className="cs-rules" id="cs-rules" aria-labelledby="cs-rules-title">
      <h2 id="cs-rules-title">仓位规则</h2>

      {tiers.length > 0 ? (
        <TableWrap label="五档仓位" className="cs-rules__scroll">
          <table className="cs-table" data-testid="cs-tiers-table">
            <thead>
              <tr>
                <th scope="col">档位</th>
                <th scope="col">仓位比例</th>
                <th scope="col">这一档怎么配</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map(tier => {
                const share = formatSharePct(tier.equityShare)
                const active = tier.id === currentTier
                return (
                  <tr
                    key={tier.id}
                    className={active ? 'is-highlight' : undefined}
                    data-testid={active ? 'cs-tier-current' : undefined}
                    data-tier={tier.id}
                  >
                    <th scope="row">{tier.label}</th>
                    <td className="num">{share ?? '—'}</td>
                    <td>
                      {tier.actions?.length ? (
                        <ul className="cs-rules__actions">
                          {tier.actions.map(action => <li key={action}>{visibleText(action)}</li>)}
                        </ul>
                      ) : (
                        <span className="cs-muted">{visibleText(tier.meaning)}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableWrap>
      ) : (
        <p className="cs-muted" data-testid="cs-tiers-pending">
          {composite.status === 'error' ? '宏观攻守数据暂不可用，五档表稍后再看。' : '宏观攻守加载中…'}
        </p>
      )}

      <h3 className="cs-subhead">执行节奏</h3>
      <ul className="cs-rules__cadence" data-testid="cs-cadence">
        {CADENCE.map(line => <li key={line}>{line}</li>)}
      </ul>

      {full && costRow ? (
        <p className="cs-rules__cost" data-testid="cs-cost-note">
          {visibleText(
            `历史上平均每年换档约 ${full.switchesPerYear.toFixed(1)} 次；单边成本 ${(costRow.cost * 100).toFixed(2)}% 时年化收益少约 ${(Math.abs(costRow.drag) * 100).toFixed(2)} 个百分点`
            + (costs?.turnoverPerYear != null ? `；年换手约 ${(costs.turnoverPerYear * 100).toFixed(0)}%。` : '。'),
          )}
        </p>
      ) : null}
    </section>
  )
}
