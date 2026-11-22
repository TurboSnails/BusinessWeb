import React from 'react'
import type { CompareSet, RunResult } from '../types'
import { money, percent, returnClass, signedPercent } from './format'

function Cell({ title, result, baseline }: { title: string; result: RunResult; baseline?: RunResult }): JSX.Element {
  const relative = baseline ? result.final / baseline.final - 1 : null
  return (
    <article className="pr-comparison-cell">
      <h3>{title}</h3>
      <strong className="pr-comparison-cell__amount">{money(result.finalAmount)}</strong>
      {relative !== null && <span className={`pr-comparison-cell__relative ${returnClass(relative)}`}>相对不动 {signedPercent(relative)}</span>}
      <dl>
        <div><dt>年化收益</dt><dd className={returnClass(result.cagr)}>{percent(result.cagr)}</dd></div>
        <div><dt>最大回撤</dt><dd>{percent(result.maxDrawdown.value)}</dd></div>
      </dl>
    </article>
  )
}

export function ComparisonGrid({ comparison }: { comparison: CompareSet }): JSX.Element {
  const benchmarks = (['QQQ', 'QQEW'] as const).map(symbol => ({ symbol, result: comparison.benchmarks[symbol] }))
  return (
    <section className="pr-section pr-comparison" aria-labelledby="pr-comparison-title">
      <div className="pr-section__head">
        <h2 id="pr-comparison-title">四格对比</h2>
        <p>同一区间、同一成本口径；金额为期末美元价值。</p>
      </div>
      <div className="pr-comparison__labels" aria-hidden="true"><span>自定义权重</span><span>等权</span></div>
      <div className="pr-comparison__grid">
        <Cell title="不动" result={comparison.custom.hold} />
        <Cell title="不动" result={comparison.equal.hold} />
        <Cell title="动态平衡" result={comparison.custom.active} baseline={comparison.custom.hold} />
        <Cell title="动态平衡" result={comparison.equal.active} baseline={comparison.equal.hold} />
      </div>
      <div className="pr-benchmarks" aria-label="纳指 100 基准">
        <h3>纳指 100 · 买入持有</h3>
        {benchmarks.map(({ symbol, result }) => (
          <div className="pr-benchmark" key={symbol}>
            <strong>{symbol}</strong>
            {result ? <><span>{money(result.finalAmount)}</span><span className={returnClass(result.cagr)}>年化 {percent(result.cagr)}</span><span>回撤 {percent(result.maxDrawdown.value)}</span></> : <span>暂无数据</span>}
          </div>
        ))}
      </div>
    </section>
  )
}
