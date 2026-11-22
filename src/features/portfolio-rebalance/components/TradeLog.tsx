import React from 'react'
import { TableWrap } from '../../../components/ui'
import type { RunResult, TradeReason } from '../types'
import { percent, returnClass, signedMoney } from './format'

const REASONS: Record<TradeReason, string> = {
  band: '偏离触发', calendar: '定期调仓', switchStep: '大跌切换', switchRecover: '大跌恢复', switchTimeout: '超时恢复',
}

export function TradeLog({ result }: { result: RunResult }): JSX.Element {
  return (
    <details className="pr-section pr-trades">
      <summary><span><strong>调仓记录</strong><small>自定义权重 · 动态平衡，共 {result.tradeCount} 次；默认折叠</small></span><span className="pr-trades__hint">展开</span></summary>
      <TableWrap label="调仓记录" stickyFirst>
        <table className="ui-table pr-table">
          <thead><tr><th scope="col">成交日</th><th scope="col">原因</th><th scope="col">触发代码与占比</th><th scope="col">各代码买卖金额</th></tr></thead>
          <tbody>{result.trades.length ? result.trades.map((trade, index) => <tr key={`${trade.date}-${index}`}>
            <th scope="row">{trade.date}</th><td>{REASONS[trade.reason]}</td>
            <td>{trade.trigger ? <><code>{trade.trigger.symbol}</code> {percent(trade.trigger.weight)}</> : '—'}</td>
            <td><div className="pr-trade-amounts">{Object.entries(trade.amounts).filter(([, amount]) => Math.abs(amount) >= 0.005).map(([symbol, amount]) => <span className={returnClass(amount)} key={symbol}><code>{symbol}</code> {signedMoney(amount)}</span>)}</div></td>
          </tr>) : <tr><td colSpan={4}>本区间没有调仓。</td></tr>}</tbody>
        </table>
      </TableWrap>
    </details>
  )
}
