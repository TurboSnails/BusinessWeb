import React from 'react'
import { TableWrap } from '../../../components/ui'
import type { CompareSet, RunResult } from '../types'
import { money, number, percent, returnClass } from './format'

export function MetricsTable({ comparison }: { comparison: CompareSet }): JSX.Element {
  const rows: Array<{ key: string; label: string; result: RunResult | null }> = [
    { key: 'custom-hold', label: '自定义 · 不动', result: comparison.custom.hold },
    { key: 'custom-active', label: '自定义 · 动态平衡', result: comparison.custom.active },
    { key: 'equal-hold', label: '等权 · 不动', result: comparison.equal.hold },
    { key: 'equal-active', label: '等权 · 动态平衡', result: comparison.equal.active },
    { key: 'QQQ', label: 'QQQ · 不动', result: comparison.benchmarks.QQQ },
    { key: 'QQQE', label: 'QQQE（纳指 100 等权） · 不动', result: comparison.benchmarks.QQQE },
  ]
  return (
    <section className="pr-section" aria-labelledby="pr-metrics-title">
      <div className="pr-section__head"><h2 id="pr-metrics-title">核心指标</h2><p>CER 为风险调整收益，风险厌恶系数取 3。</p></div>
      <p className="pr-table-hint">左右滑动查看更多列</p>
      <TableWrap label="核心指标" stickyFirst>
        <table className="ui-table pr-table">
          <thead><tr><th scope="col">方案</th><th scope="col" className="num">期末金额</th><th scope="col" className="num">年化收益</th><th scope="col" className="num">年化波动</th><th scope="col" className="num">最大回撤</th><th scope="col" className="num">CER</th><th scope="col" className="num">调仓次数</th><th scope="col" className="num">年化换手</th><th scope="col" className="num">累计成本</th></tr></thead>
          <tbody>{rows.map(({ key, label, result }) => result ? (
            <tr key={key}>
              <th scope="row">{label}</th>
              <td className="num">{money(result.finalAmount)}</td>
              <td className={`num ${returnClass(result.cagr)}`}>{percent(result.cagr)}</td>
              <td className="num">{percent(result.vol)}</td>
              <td className="num">{percent(result.maxDrawdown.value)}<small className="pr-table__sub">{result.maxDrawdown.peak} 至 {result.maxDrawdown.trough}</small></td>
              <td className="num">{number(result.cer)}</td>
              <td className="num">{result.tradeCount}</td>
              <td className="num">{percent(result.annualTurnover)}</td>
              <td className="num">{percent(result.totalCost, 2)}</td>
            </tr>
          ) : <tr key={key}><th scope="row">{label}</th><td colSpan={8}>暂无数据</td></tr>)}</tbody>
        </table>
      </TableWrap>
    </section>
  )
}
