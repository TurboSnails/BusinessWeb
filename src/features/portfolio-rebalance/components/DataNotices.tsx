import React from 'react'
import { Callout, PageDataFreshness } from '../../../components/ui'
import type { PriceIndex, RunInput } from '../types'

export function DataNotices({ index, input }: { index: PriceIndex; input: RunInput }): JSX.Element {
  const selected = index.items.filter(item => input.symbols.includes(item.symbol))
  const stale = selected.filter(item => item.status === 'stale')
  const missing = selected.filter(item => item.dividendStatus === 'missing')
  const unavailable = selected.filter(item => item.crossCheck === 'unavailable')
  const names = (items: typeof selected): string => items.map(item => item.name).join('、')
  return (
    <aside className="pr-notices" aria-label="数据与研究边界">
      <PageDataFreshness checkedAt={index.generatedAt} dataLabel="数据截至" dataDates={selected.map(item => item.asOf)} note="来源：Yahoo Finance 复权收盘价；腾讯不复权日线交叉核对" />
      {stale.length > 2 ? <details className="pr-data-detail"><summary>{stale.length} 只代码数据过期（{names(stale)}），沿用上次数据</summary><div>{stale.map(item => <p key={item.symbol}>{item.name}（{item.symbol}）：{item.statusNote ?? '本次核对未通过，沿用上次数据'}。</p>)}</div></details> : stale.length > 0 && <Callout tone="warn" title="所选代码有过期数据">{stale.map(item => <p key={item.symbol}>{item.name}（{item.symbol}）：{item.statusNote ?? '本次核对未通过，沿用上次数据'}。</p>)}</Callout>}
      {missing.length > 2 ? <details className="pr-data-detail"><summary>{missing.length} 只代码缺分红数据（{names(missing)}），只算价格涨跌，结果偏低</summary><div>{missing.map(item => <p key={item.symbol}>{item.name}（{item.symbol}）：该股只算价格涨跌，结果偏低。</p>)}</div></details> : missing.length > 0 && <Callout tone="warn" title="部分代码缺分红">{missing.map(item => <p key={item.symbol}>{item.name}（{item.symbol}）：该股只算价格涨跌，结果偏低。</p>)}</Callout>}
      {unavailable.length > 0 && <p className="pr-crosscheck" role="note">以下代码暂未与第二来源核对，仅有 Yahoo 数据：{names(unavailable)}</p>}
      <details className="pr-boundary">
        <summary><span>组合是事后选的 · 未做显著性检验 · 不要按回测最高值挑规则 · 不构成投资建议</span><span>读懂回测的边界</span></summary>
        <div className="pr-boundary__full">
          <p>组合是事后选的，回测不代表以后；未做显著性检验。规则之间的收益差异常由少数几次调仓时点决定，不要按回测最高值挑规则。</p>
          <p>第 t 日收盘判断，第 t+1 日收盘成交；历史结果仅供研究，不构成投资建议。</p>
        </div>
      </details>
    </aside>
  )
}
