import React from 'react'
import { TableWrap } from '../../../components/ui'
import { formatSharePct, resolveFailedSourceLabels, TIER_ORDER_DEFENSE_LEFT } from './labels'
import type { CompositeFile } from './types'

export default function MethodNotes({ data }: { data: CompositeFile }): JSX.Element {
  const byId = new Map(data.tiers.map(t => [t.id, t]))
  const components = data.current.pillars.flatMap(p => p.components)
  const repair = data.current.repair
  const failedLabels = resolveFailedSourceLabels(data.failedSources, data.outer)

  return (
    <section className="mp-method" id="mp-method" aria-labelledby="mp-method-title">
      <h2 id="mp-method-title">方法说明与免责声明</h2>
      <p className="mp-section-lead">
        规则版本 {data.ruleVersion}。阈值与仓位来自本站公开规则，不在页面里另写死数。
      </p>

      <h3>支柱权重</h3>
      <ul className="mp-method__weights">
        {data.current.pillars.map(p => (
          <li key={p.id}>
            {p.title}
            {' '}
            {(p.weight * 100).toFixed(0)}%
          </li>
        ))}
      </ul>

      <h3>档位阈值与仓位</h3>
      <TableWrap label="档位阈值与仓位">
        <table className="mp-table">
          <thead>
            <tr>
              <th scope="col">档位</th>
              <th scope="col">区间</th>
              <th scope="col">占自设上限</th>
              <th scope="col">含义</th>
            </tr>
          </thead>
          <tbody>
            {TIER_ORDER_DEFENSE_LEFT.map(id => {
              const tier = byId.get(id)
              if (!tier) return null
              return (
                <tr key={id}>
                  <th scope="row">{tier.label}</th>
                  <td>{tier.range}</td>
                  <td>{formatSharePct(tier.equityShare)}</td>
                  <td>{tier.meaning}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>

      {repair?.rule ? (
        <div className="mp-method__repair" data-testid="mp-method-repair">
          <h3>v2.1 修复确认</h3>
          <p>{repair.rule}</p>
          <p>可以把经济与信用同时转弱触发的防守上调为偏防守。</p>
          {repair.display ? <p className="mp-muted">当前：{repair.display}</p> : null}
        </div>
      ) : null}

      <h3>组件阈值规则</h3>
      <details className="mp-method__rules">
        <summary>展开各组件规则（{components.length}）</summary>
        <ul>
          {components.map(c => (
            <li key={c.id}>
              <strong>{c.label}</strong>
              {' — '}
              {c.rule}
            </li>
          ))}
        </ul>
      </details>

      <div className="mp-method__disclaimer" role="note">
        <p>
          参考九位宏观投资人的公开方法，提炼成可回测的规则；九位中只有一位给过可机械执行的规则，其余为本站按其方法选取的指标。规则先验设定并公开回测结果，描述的是仓位档位与证据，不构成买卖建议，也不保证未来表现。
        </p>
        {failedLabels.length > 0 && (
          <p data-testid="mp-failed-sources">部分源本次失效：{failedLabels.join('、')}。</p>
        )}
      </div>
    </section>
  )
}
