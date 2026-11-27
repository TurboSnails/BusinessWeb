import React from 'react'
import { Link } from 'react-router-dom'
import { Page } from '../components/ui'
import StrategySpecView from '../features/strategy-spec/StrategySpecView'
import '../styles/combined-strategy.css'
import '../styles/strategy-spec.css'

export default function StrategySpec(): JSX.Element {
  return (
    <Page className="cs-page ss-page">
      <header className="page-head cs-head">
        <p className="ss-back"><Link to="/invest/strategy">← 返回综合策略</Link></p>
        <h1>综合策略说明书</h1>
        <p className="cs-head__lead" data-testid="ss-lead">
          把当前的仓位规则完整写下来：怎么打分、怎么定档、怎么执行、历史证据和已知局限。每一版都有版本号，以后升级或比较不同写法时，可以逐章对比。文中「L-0xx」是本站研究登记簿的编号，同一编号在说明书、研究中、通过检验三页指同一次检验。
        </p>
      </header>
      <StrategySpecView />
      <footer className="cs-footer" role="note">
        <p>规则先验设定并公开回测；验证期只作报告、不参与挑选。描述风险状态与仓位档位，不构成买卖建议。</p>
      </footer>
    </Page>
  )
}
