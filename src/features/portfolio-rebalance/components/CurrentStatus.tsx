import React from 'react'
import { TableWrap } from '../../../components/ui'
import type { RunResult } from '../types'
import { percent, signedPercent } from './format'

export function CurrentStatus({ result, names }: { result: RunResult; names: Record<string, string> }): JSX.Element | null {
  if (result.distance.length === 0) return null
  return (
    <section className="pr-section" aria-labelledby="pr-distance-title">
      <div className="pr-section__head"><h2 id="pr-distance-title">当前离线距离</h2><p>截至 {result.end}；假设其余资产价格不变，仅该资产继续上涨或下跌。</p></div>
      <p className="pr-table-hint">左右滑动查看更多列</p>
      <TableWrap label="当前离线距离" stickyFirst>
        <table className="ui-table pr-table">
          <thead><tr><th scope="col">代码</th><th scope="col" className="num">当前占比</th><th scope="col" className="num">允许区间</th><th scope="col" className="num">再涨多少触发卖出</th><th scope="col" className="num">再跌多少触发补仓</th></tr></thead>
          <tbody>{result.distance.map(row => <tr key={row.symbol}>
            <th scope="row"><span className="pr-symbol">{names[row.symbol] ?? row.symbol}</span><code>{row.symbol}</code></th>
            <td className="num">{percent(row.weight)}</td>
            <td className="num">{percent(row.lower)} — {percent(row.upper)}</td>
            <td className="num">{signedPercent(row.riseToUpper)}</td>
            <td className="num">{signedPercent(row.fallToLower)}</td>
          </tr>)}</tbody>
        </table>
      </TableWrap>
    </section>
  )
}
