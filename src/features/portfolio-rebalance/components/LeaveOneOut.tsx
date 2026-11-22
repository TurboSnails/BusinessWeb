import React from 'react'
import { TableWrap } from '../../../components/ui'
import type { CompareSet, RunInput } from '../types'
import { hasCompletedYears } from '../conclusions'
import { money, number, percent, returnClass } from './format'

function signedPoints(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${value > 0 ? '+' : ''}${number(value * 100, 1)} 个点`
}

function drawdownPoints(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  if (value > 0) return `加深 ${number(value * 100, 1)} 点`
  if (value < 0) return `变浅 ${number(Math.abs(value) * 100, 1)} 点`
  return '0.0 点 · 持平'
}

export function LeaveOneOut({ comparison, names, input }: {
  comparison: CompareSet
  names: Record<string, string>
  input: RunInput
}): JSX.Element {
  const base = comparison.custom.active
  const shortPeriod = !hasCompletedYears(base, 1)
  const differenceLabel = shortPeriod ? '去掉后累计收益变化（百分点）' : '去掉后年化变化（百分点）'
  return (
    <section className="pr-section" aria-labelledby="pr-leave-title">
      <div className="pr-section__head">
        <h2 id="pr-leave-title">逐一剔除一只（历史敏感性，不是卖出排序）</h2>
        <p>{shortPeriod
          ? '去掉一只后，其目标权重按比例分给其余股票重新回测。本区间不足一年，以下用区间累计收益变化；负数表示去掉后累计收益下降，正数表示上升，但要同时看回撤。各行是不同组合，差值不能相加，也不是公司质量判断。'
          : '去掉一只后，其目标权重按比例分给其余股票重新回测。负数表示去掉后年化下降（它在本区间拉高了结果）；正数表示去掉后年化上升，但要同时看回撤。各行是不同组合，差值不能相加，也不是公司质量判断。'}</p>
      </div>
      <p className="pr-table-hint">左右滑动查看更多列</p>
      <TableWrap label="逐一剔除对比" stickyFirst>
        <table className="ui-table pr-table pr-table--leave">
          <thead><tr><th scope="col">剔除代码（原目标权重）</th><th scope="col" className="num">不动期末金额</th><th scope="col" className="num">动态期末金额</th><th scope="col" className="num">{shortPeriod ? '动态累计收益' : '动态年化'}</th><th scope="col" className="num">{differenceLabel}</th><th scope="col" className="num">动态最大回撤</th><th scope="col" className="num">去掉后回撤变化（百分点）</th></tr></thead>
          <tbody>{comparison.leaveOneOut.map(row => {
            const comparable = row.active.start === base.start && row.active.end === base.end
            const difference = !comparable ? null : shortPeriod
              ? row.active.final - base.final
              : row.active.cagr - base.cagr
            const mddDifference = comparable
              ? Math.abs(row.active.maxDrawdown.value) - Math.abs(base.maxDrawdown.value)
              : null
            const originalPosition = input.symbols.indexOf(row.dropped)
            const switchChanged = input.switch?.stable === row.dropped
            const displayedReturn = shortPeriod ? row.active.final - 1 : row.active.cagr
            return <tr key={row.dropped}>
              <th scope="row">
                <span className="pr-symbol">{names[row.dropped] ?? row.dropped}</span>
                <code>{row.dropped} · {percent(input.weights[originalPosition])}</code>
                {!comparable && <span className="pr-loo__rule-note">实际区间 {row.active.start} — {row.active.end}，与原组合不同，不计算差值。</span>}
                {switchChanged && <span className="pr-loo__rule-note">去掉它后无法执行大跌切换，这一行同时包含规则变化。</span>}
              </th>
              <td className="num">{money(row.hold.finalAmount)}</td>
              <td className="num">{money(row.active.finalAmount)}</td>
              <td className={`num ${returnClass(displayedReturn)}`}>{percent(displayedReturn)}</td>
              <td className="num pr-change">{signedPoints(difference)}</td>
              <td className="num">{percent(row.active.maxDrawdown.value)}</td>
              <td className="num pr-change">{drawdownPoints(mddDifference)}</td>
            </tr>
          })}</tbody>
        </table>
      </TableWrap>
      <p className="pr-section__foot">这里的年化是历史股价年化，不是营收或利润增速；每行都是重新分配权重后的不同组合，多行变化不能相加。</p>
      {input.symbols.length === 2 && <p className="pr-section__foot">剔除后只剩一只股票，该行不再是分散组合之间的比较。</p>}
      {input.switch && <p className="pr-section__foot">当前开启大跌切换；剔除所设稳定资产还会关闭切换，因此该行同时包含成员变化和规则变化，不能用于判断稳定资产的独立作用。</p>}
    </section>
  )
}
