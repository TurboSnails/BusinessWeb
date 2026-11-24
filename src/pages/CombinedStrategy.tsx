import React from 'react'
import { Page } from '../components/ui'
import StrategyView from '../features/combined-strategy/StrategyView'
import TrioNav from '../features/combined-strategy/TrioNav'
import { useCombinedStrategy } from '../features/combined-strategy/load'
import '../styles/combined-strategy.css'
import '../styles/market-radar.css'

export const COMBINED_STRATEGY_LEAD =
  '这一页回答四个问题：现在怎么做、处在什么位置、为什么这么做、什么情况下要动。仓位按宏观攻守的档位定，市场雷达的冷热决定这个阶段具体怎么做。'

export const COMBINED_STRATEGY_FOOTER =
  '规则先验设定并公开回测；验证期只作报告、不参与挑选。读数来自公开数据源。描述风险状态与仓位档位，不构成买卖建议。'

export default function CombinedStrategy(): JSX.Element {
  const state = useCombinedStrategy()

  return (
    <Page className="cs-page">
      <header className="page-head cs-head">
        <h1>综合策略</h1>
        <p className="cs-head__lead" data-testid="cs-head-lead">
          {COMBINED_STRATEGY_LEAD}
        </p>
        <TrioNav />
      </header>

      <StrategyView state={state} />

      <footer className="cs-footer" role="note">
        <p>
          {state.status === 'ready' ? `规则版本 ${state.data.ruleVersion}` : '规则版本 fusion-v1'}
        </p>
        <p>{COMBINED_STRATEGY_FOOTER}</p>
      </footer>
    </Page>
  )
}
