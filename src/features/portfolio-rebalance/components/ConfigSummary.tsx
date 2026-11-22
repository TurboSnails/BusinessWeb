import React from 'react'
import type { RunInput } from '../types'
import { signalLabel } from './format'

const trimPercent = (value: number, digits = 4): string => `${Number((value * 100).toFixed(digits))}%`

function ruleText(input: RunInput): string {
  if (input.rule.kind === 'relative') return `相对偏离 ${trimPercent(input.rule.pct)}`
  if (input.rule.kind === 'absolute') return `绝对偏离 ${trimPercent(input.rule.points)} 个百分点`
  if (input.rule.kind === 'calendar') return `${{ month: '每月', quarter: '每季', year: '每年' }[input.rule.every]}调仓`
  return '不动'
}

function switchText(input: RunInput): string {
  if (!input.switch) return '大跌切换：关'
  return `大跌切换：开（${signalLabel(input.signal ?? 'QQQ')}）`
}

export function ConfigSummary({ input, onEdit }: { input: RunInput; onEdit: () => void }): JSX.Element {
  const weights = input.symbols.map((symbol, index) => `${symbol} ${trimPercent(input.weights[index])}`).join(' · ')
  return (
    <section className="pr-config-summary" aria-label="当前组合与规则">
      <p><strong>当前方案</strong><span>{weights} ｜ {ruleText(input)} ｜ {switchText(input)} ｜ {input.start ?? '共同最早日'} 起 · 成本 {(input.cost * 100).toFixed(2)}%</span></p>
      <button type="button" className="btn-ghost" onClick={onEdit}>修改组合与规则</button>
    </section>
  )
}
