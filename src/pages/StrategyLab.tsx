import React from 'react'
import { Link } from 'react-router-dom'
import { Page } from '../components/ui'
import LateCycleStudy from '../features/strategy-lab/LateCycleStudy'
import TrioNav from '../features/combined-strategy/TrioNav'
import '../styles/combined-strategy.css'
import '../styles/strategy-spec.css'
import '../styles/strategy-lab.css'

export const STRATEGY_LAB_LEAD =
  '还没写进正式规则的研究放在这里：结论不确定、没通过检验、或只在影子跟踪的内容。这一页不影响仓位，仓位以综合策略和策略说明书为准。'

export default function StrategyLab(): JSX.Element {
  return (
    <Page className="cs-page ss-page lab-page">
      <header className="page-head cs-head">
        <h1>研究中</h1>
        <p className="cs-head__lead" data-testid="lab-lead">{STRATEGY_LAB_LEAD}</p>
        <TrioNav />
      </header>
      <div className="ss-body">
        <LateCycleStudy />
      </div>
      <footer className="cs-footer" role="note">
        <p>
          每项研究先写预注册、再计算；通过门槛也只进入影子跟踪，写入正式规则要另行检验。
          {' '}<Link to="/invest/strategy/spec">策略说明书</Link>
        </p>
        <p>历史统计，不构成买卖建议。</p>
      </footer>
    </Page>
  )
}
