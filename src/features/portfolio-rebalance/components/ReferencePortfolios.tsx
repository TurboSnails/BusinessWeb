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
    tag: '各项较均衡',
    name: 'Meta 换苹果',
    symbols: ['AVGO', 'AAPL', 'CB', 'SOFI', 'RKLB'],
    weights: [0.25, 0.25, 0.25, 0.125, 0.125],
    holdings: '博通 25%、苹果 25%、安达保险 25%、SoFi 12.5%、Rocket Lab 12.5%',
    reason: '在 39 个起点、前后两段与去掉博通后的测试中均排在前列。研究时（截至 2026-11-20）每年调一次年化 31.5%，最大回撤 −31.7%。',
  },
  {
    id: 'diversified',
    tag: '更分散',
    name: '六只分散',
    symbols: ['AVGO', 'AAPL', 'V', 'CB', 'SOFI', 'RKLB'],
    weights: [0.2, 0.2, 0.2, 0.2, 0.1, 0.1],
    holdings: '博通 20%、苹果 20%、Visa 20%、安达保险 20%、SoFi 10%、Rocket Lab 10%',
    reason: '单只目标权重不超过 20%；每年调一次在全部 39 个起点都胜过不动。研究时（截至 2026-11-20）每年调一次年化 28.3%，最大回撤 −29.2%。',
  },
  {
    id: 'drawdown',
    tag: '回撤最浅',
    name: '拼多多替换 SoFi',
    symbols: ['AVGO', 'AAPL', 'CB', 'PDD', 'RKLB'],
    weights: [0.25, 0.25, 0.25, 0.125, 0.125],
    holdings: '博通 25%、苹果 25%、安达保险 25%、拼多多 12.5%、Rocket Lab 12.5%',
    reason: '两只高波动股在这段样本中相关性较低，各起点最深回撤约 −26%；拼多多有中概股政策与退市风险。研究时（截至 2026-11-20）每年调一次年化 32.0%，最大回撤 −25.2%。',
  },
  {
    id: 'baseline',
    tag: '对照',
    name: '现组合',
    symbols: ['AVGO', 'META', 'CB', 'SOFI', 'RKLB'],
    weights: [0.25, 0.25, 0.25, 0.125, 0.125],
    holdings: '博通 25%、Meta 25%、安达保险 25%、SoFi 12.5%、Rocket Lab 12.5%',
    reason: '最初研究的五只方案，用来对比。研究时（截至 2026-11-20）每年调一次年化 30.1%，最大回撤 −43.6%。',
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

function ResearchObservations(): JSX.Element {
  return (
    <details className="pr-research">
      <summary><span>本页研究观察（特定历史样本，不是通用结论）</span><span className="pr-research__toggle" aria-hidden="true" /></summary>
      <div className="pr-research__body">
        <p>以下观察来自 2021-08-25 至 2026-11-20 的固定研究网格，以及 2018-07 以来的补充候选测试。组合和规则均为事后探索，网格之间高度相关，比例不是独立实验的置信区间，也不是未来胜率。</p>
        <ol>
          <li>再平衡的主要用途是把权重拉回目标、管理风险暴露；它不保证收益更高或回撤更小。在 35,280 个固定网格中，90.4% 的组合再平衡年化更高，但 44.9% 的组合最大回撤反而更深（55.1% 变浅）。</li>
          <li>成员历史股价年化收益的差异与再平衡结果有关，但差异小不等于已经证明『轮动』，差异大也不必然只有一只赢家。固定网格中：离散度 ≤10% 的 13,432 个组合样本内 100% 年化更高，中位差 +4.5 个百分点；10%–16% 的 14,558 个组合为 97.1%，中位差 +3.1 个百分点；&gt;16% 的 7,290 个组合为 59.1%，中位差 +0.5 个百分点。这些比例只适用于固定五只、固定分组与权重、相对偏离 40% 的同一历史网格，不能套到任意自定义组合或未来。</li>
          <li>部分候选组合中，安达保险与科技成员的历史相关性较低，剔除后回撤加深；但幅度随成员、权重和规则变化，不能概括为『稳定股都能少 8–10 点回撤』，也不构成持有安达保险的建议。</li>
          <li>在 11 个事后挑选的候选组合中，每年一次与相对偏离 40% 的结果有胜有负，每年一次通常调仓更少，不能概括为『每年一次就够』。大跌切换同样有胜有负，且常加深回撤；主要样本只有 2022 年一次大跌，不能认定存在稳定加成。</li>
          <li>绝对收益高不等于相对基准有优势。2018-07 以来的 6,188 个大师股五只等权组合中，只有 14%（不动）至 26%（再平衡）跑赢同期纳指 100；只抄长期持仓并不能保证跑赢指数。</li>
          <li>本页的『增长』只指历史股价年化收益，不是营收或利润增速；逐一剔除是权重重新分配后的历史敏感性，不是公司质量判断或卖出排序。</li>
        </ol>
        <p>历史回测不计税，未做显著性检验；大跌时机械买入低配资产可能加仓基本面已经恶化的股票，回测规则本身不是补仓依据。以上不构成买卖建议。</p>
      </div>
    </details>
  )
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
          <span className="pr-refs__hint">事后挑选的历史测试组合，用来对照，不是推荐或买卖建议。</span>
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
      <ResearchObservations />
    </details>
  )
}
