import React from 'react'
import type { PriceIndex, Rule, RunInput } from '../types'

export type ReferencePreset = {
  id: string
  tag: string
  name: string
  symbols: string[]
  weights: number[]
  holdings: string
  reason: string
}

export const REFERENCE_PRESETS: ReferencePreset[] = [
  {
    id: 'preferred',
    tag: '首选',
    name: 'Meta 换苹果',
    symbols: ['AVGO', 'AAPL', 'CB', 'SOFI', 'RKLB'],
    weights: [0.25, 0.25, 0.25, 0.125, 0.125],
    holdings: '博通 25%、苹果 25%、安达保险 25%、SoFi 12.5%、Rocket Lab 12.5%',
    reason: '收益、回撤、换起点后的最差情况、前后两段与去掉博通后的表现都在前列，没有明显短板。研究时每年调一次年化 31.5%，最大回撤 −31.7%。',
  },
  {
    id: 'diversified',
    tag: '省心',
    name: '六只分散',
    symbols: ['AVGO', 'AAPL', 'V', 'CB', 'SOFI', 'RKLB'],
    weights: [0.2, 0.2, 0.2, 0.2, 0.1, 0.1],
    holdings: '博通 20%、苹果 20%、Visa 20%、安达保险 20%、SoFi 10%、Rocket Lab 10%',
    reason: '每只不超过 20%，回撤更浅；每年调一次在全部 39 个起点都胜过不动。研究时年化 28.3%，最大回撤 −29.2%。',
  },
  {
    id: 'drawdown',
    tag: '回撤最小',
    name: '拼多多替换 SoFi',
    symbols: ['AVGO', 'AAPL', 'CB', 'PDD', 'RKLB'],
    weights: [0.25, 0.25, 0.25, 0.125, 0.125],
    holdings: '博通 25%、苹果 25%、安达保险 25%、拼多多 12.5%、Rocket Lab 12.5%',
    reason: '两只高波动股走势不同步，各起点最深回撤约 −26%；但拼多多有中概股政策与退市风险。研究时年化 32.0%，最大回撤 −25.2%。',
  },
  {
    id: 'baseline',
    tag: '对照',
    name: '现组合',
    symbols: ['AVGO', 'META', 'CB', 'SOFI', 'RKLB'],
    weights: [0.25, 0.25, 0.25, 0.125, 0.125],
    holdings: '博通 25%、Meta 25%、安达保险 25%、SoFi 12.5%、Rocket Lab 12.5%',
    reason: '最初研究的五只方案，用来对比。研究时年化 30.1%，最大回撤 −43.6%。',
  },
]

export const REFERENCE_RULE: Rule = { kind: 'calendar', every: 'year' }

const WEIGHT_TOLERANCE = 1e-8

function sameWeights(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false
  return left.every((weight, index) => Math.abs(weight - right[index]) <= WEIGHT_TOLERANCE)
}

export function matchesReferencePreset(input: RunInput | null | undefined, preset: ReferencePreset): boolean {
  if (!input) return false
  if (input.switch) return false
  if (input.rule.kind !== 'calendar' || input.rule.every !== 'year') return false
  if (input.symbols.length !== preset.symbols.length) return false
  if (input.symbols.some((symbol, index) => symbol !== preset.symbols[index])) return false
  return sameWeights(input.weights, preset.weights)
}

export function missingSymbolsForPreset(index: PriceIndex, preset: ReferencePreset): string[] {
  const known = new Set(index.items.map(item => item.symbol))
  return preset.symbols.filter(symbol => !known.has(symbol))
}

export function ReferencePortfolios({
  index,
  applied,
  onLoad,
}: {
  index: PriceIndex
  applied: RunInput | null
  onLoad: (preset: ReferencePreset) => void
}): JSX.Element {
  // 窄屏默认收起，避免四张卡片把结果挤出首屏；桌面默认展开
  const [open, setOpen] = React.useState(() => typeof window === 'undefined' || typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 768px)').matches)
  return (
    <details className="pr-refs" open={open} onToggle={event => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
      <summary className="pr-refs__summary">
        <span className="pr-refs__title-row">
          <span className="pr-refs__title">研究参考组合</span>
          <span className="pr-refs__hint">事后挑选的参考组合，依据 2021-08 至 2026-11 的回测与稳健性检查，不是买卖建议。</span>
        </span>
        <span className="pr-refs__toggle" aria-hidden="true" />
      </summary>
      <div className="pr-refs__grid" role="list">
        {REFERENCE_PRESETS.map(preset => {
          const missing = missingSymbolsForPreset(index, preset)
          const current = matchesReferencePreset(applied, preset)
          const disabled = current || missing.length > 0
          return (
            <article className={`pr-ref-card${current ? ' is-current' : ''}`} key={preset.id} role="listitem">
              <header className="pr-ref-card__head">
                <span className="pr-ref-card__tag">{preset.tag}</span>
                <h3 className="pr-ref-card__name">{preset.name}</h3>
              </header>
              <p className="pr-ref-card__holdings">{preset.holdings}</p>
              <p className="pr-ref-card__reason">{preset.reason}</p>
              <div className="pr-ref-card__action">
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={disabled}
                  onClick={() => onLoad(preset)}
                >
                  {current ? '已载入' : '载入并计算'}
                </button>
                {missing.length > 0 && <span className="pr-ref-card__missing">数据暂缺</span>}
              </div>
            </article>
          )
        })}
      </div>
    </details>
  )
}
