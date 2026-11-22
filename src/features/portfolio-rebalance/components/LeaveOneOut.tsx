import React from 'react'
import { TableWrap } from '../../../components/ui'
import type { CompareSet } from '../types'
import { money, percent, returnClass, signedPercent } from './format'

export function LeaveOneOut({ comparison, names }: { comparison: CompareSet; names: Record<string, string> }): JSX.Element {
  return (
    <section className="pr-section" aria-labelledby="pr-leave-title">
      <div className="pr-section__head"><h2 id="pr-leave-title">逐一剔除一只</h2><p>剔除者的目标权重按比例分给其余资产；年化差为剔除后动态平衡减原组合动态平衡。</p></div>
      <p className="pr-table-hint">左右滑动查看更多列</p>
      <TableWrap label="逐一剔除对比" stickyFirst>
        <table className="ui-table pr-table">
          <thead><tr><th scope="col">剔除代码</th><th scope="col" className="num">不动期末金额</th><th scope="col" className="num">动态期末金额</th><th scope="col" className="num">动态年化</th><th scope="col" className="num">年化差</th><th scope="col" className="num">动态最大回撤</th></tr></thead>
          <tbody>{comparison.leaveOneOut.map(row => {
            const difference = row.active.cagr - comparison.custom.active.cagr
            return <tr key={row.dropped}>
              <th scope="row"><span className="pr-symbol">{names[row.dropped] ?? row.dropped}</span><code>{row.dropped}</code></th>
              <td className="num">{money(row.hold.finalAmount)}</td>
              <td className="num">{money(row.active.finalAmount)}</td>
              <td className={`num ${returnClass(row.active.cagr)}`}>{percent(row.active.cagr)}</td>
              <td className={`num ${returnClass(difference)}`}>{signedPercent(difference)}</td>
              <td className="num">{percent(row.active.maxDrawdown.value)}</td>
            </tr>
          })}</tbody>
        </table>
      </TableWrap>
    </section>
  )
}
