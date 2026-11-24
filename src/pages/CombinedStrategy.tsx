import React from 'react'
import { Link } from 'react-router-dom'
import { Page } from '../components/ui'
import StrategyView from '../features/combined-strategy/StrategyView'
import { useCombinedStrategy } from '../features/combined-strategy/load'
import '../styles/combined-strategy.css'
import '../styles/market-radar.css'

export const COMBINED_STRATEGY_LEAD =
  '把宏观攻守和市场雷达合在一起看：仓位按宏观档位定，雷达的冷热决定这一格具体怎么做。附九格状态的历史表现、融合规则的检验结果和月度档位对照。'

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
        <ul className="cs-head__links">
          <li><Link to="/invest/macro-posture">宏观攻守</Link></li>
          <li><Link to="/invest/market-radar">我的市场雷达</Link></li>
          <li><a href="#cs-now">现在怎么做</a></li>
        </ul>
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
