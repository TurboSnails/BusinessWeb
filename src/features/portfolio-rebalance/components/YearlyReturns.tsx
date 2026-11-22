import React from 'react'
import { TableWrap } from '../../../components/ui'
import type { CompareSet, RunResult } from '../types'
import { percent, returnClass } from './format'

export function YearlyReturns({ comparison }: { comparison: CompareSet }): JSX.Element {
  const columns: Array<{ key: string; label: string; result: RunResult }> = [
    { key: 'custom-hold', label: '自定义 · 不动', result: comparison.custom.hold },
    { key: 'custom-active', label: '自定义 · 动态', result: comparison.custom.active },
    { key: 'equal-hold', label: '等权 · 不动', result: comparison.equal.hold },
    { key: 'equal-active', label: '等权 · 动态', result: comparison.equal.active },
    ...(comparison.benchmarks.QQQ ? [{ key: 'QQQ', label: 'QQQ', result: comparison.benchmarks.QQQ }] : []),
  ]
  const years = [...new Set(columns.flatMap(column => column.result.yearly.map(row => row.year)))].sort((a, b) => b - a)
  return (
    <section className="pr-section" aria-labelledby="pr-yearly-title">
      <div className="pr-section__head"><h2 id="pr-yearly-title">逐年收益</h2><p>按日历年统计，首尾年份可能不是完整年度。</p></div>
      <TableWrap label="逐年收益" stickyFirst>
        <table className="ui-table pr-table">
          <thead><tr><th scope="col">年份</th>{columns.map(column => <th scope="col" className="num" key={column.key}>{column.label}</th>)}</tr></thead>
          <tbody>{years.map(year => <tr key={year}><th scope="row">{year}</th>{columns.map(column => {
            const value = column.result.yearly.find(row => row.year === year)?.ret
            return <td className={`num ${value === undefined ? '' : returnClass(value)}`} key={column.key}>{value === undefined ? '—' : percent(value)}</td>
          })}</tr>)}</tbody>
        </table>
      </TableWrap>
    </section>
  )
}
