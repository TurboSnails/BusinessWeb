import React from 'react'
import { TableWrap } from '../../../components/ui'
import type { RunInput, RunResult, SignalState } from '../types'
import { percent, signalLabel, signedPercent } from './format'

function furtherMove(fromDrawdown: number, toDrawdown: number): number {
  return (1 + toDrawdown) / (1 + fromDrawdown) - 1
}

function statusCopy(state: SignalState): string {
  if (state.pendingAction === 'step') {
    if (state.steps === 0) {
      return '最后一个交易日收盘刚进入大跌状态，第一步按规则在下一交易日成交'
    }
    return `大跌状态中，已成交 ${state.steps} 步；最后一个交易日收盘又触发一步，按规则在下一交易日成交`
  }
  if (state.pendingAction === 'recover') {
    return '最后一个交易日收盘已满足恢复条件，按规则在下一交易日调回目标权重'
  }
  if (state.pendingAction === 'timeout') {
    return '最后一个交易日收盘已到超时期限，按规则在下一交易日调回目标权重'
  }
  if (state.inStress) {
    return `大跌状态中，已成交 ${state.steps} 步，累计卖出稳定资产的 ${percent(state.soldFraction)}（以进入日市值计）`
  }
  return '未触发'
}

function nextStepCopy(state: SignalState, input: RunInput): string {
  if (state.nextStepDrawdown == null) {
    const atCap = input.switch?.cap != null && state.soldFraction >= input.switch.cap - 1e-12
    return atCap ? '已到累计卖出上限' : '稳定资产已卖完'
  }
  const need = furtherMove(state.drawdown, state.nextStepDrawdown)
  if (need >= 0) {
    return `回撤到 ${signedPercent(state.nextStepDrawdown)}；当前回撤已低于该档，下一交易日收盘仍低于该档时触发`
  }
  return `回撤到 ${signedPercent(state.nextStepDrawdown)}；按当前收盘还需再跌 ${percent(-need)}`
}

function SignalPosition({ state, input }: { state: SignalState; input: RunInput }): JSX.Element {
  const name = signalLabel(state.symbol)
  const hideLevels = state.pendingAction === 'recover' || state.pendingAction === 'timeout'
  return (
    <section className="pr-section" aria-labelledby="pr-signal-title">
      <div className="pr-section__head">
        <h2 id="pr-signal-title">信号指数当前位置</h2>
        <p>截至 {state.asOf} 的历史回测状态，不是操作建议。</p>
      </div>
      <dl className="pr-signal-state">
        <div>
          <dt>信号指数</dt>
          <dd>{name}（{state.symbol}） · 截至 {state.asOf}</dd>
        </div>
        <div>
          <dt>距本轮高点</dt>
          <dd>{signedPercent(state.drawdown)}（高点 {state.peakDate}）</dd>
        </div>
        <div>
          <dt>状态</dt>
          <dd>{statusCopy(state)}</dd>
        </div>
        {!hideLevels && (
          <div>
            <dt>下一步触发位</dt>
            <dd>{nextStepCopy(state, input)}</dd>
          </div>
        )}
        {!hideLevels && state.inStress && (
          <div>
            <dt>恢复位</dt>
            <dd>
              回撤收窄到 {signedPercent(state.recoverDrawdown)}；按当前收盘还需上涨{' '}
              {percent(Math.max(0, furtherMove(state.drawdown, state.recoverDrawdown)))}
            </dd>
          </div>
        )}
      </dl>
    </section>
  )
}

export function CurrentStatus({
  result,
  names,
  input,
}: {
  result: RunResult
  names: Record<string, string>
  input: RunInput
}): JSX.Element | null {
  const signal = result.signalState
  const hasDistance = result.distance.length > 0
  if (!signal && !hasDistance) return null
  return (
    <>
      {signal && <SignalPosition state={signal} input={input} />}
      {hasDistance && (
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
      )}
    </>
  )
}
