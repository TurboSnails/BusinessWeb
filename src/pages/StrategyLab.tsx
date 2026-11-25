import React from 'react'
import { Link } from 'react-router-dom'
import { Page } from '../components/ui'
import DailyExecutionStudy from '../features/strategy-lab/DailyExecutionStudy'
import EffectiveStrategies from '../features/strategy-lab/EffectiveStrategies'
import EtfVolumeStudy from '../features/strategy-lab/EtfVolumeStudy'
import VolConfirmStudy from '../features/strategy-lab/VolConfirmStudy'
import VolTargetStudy from '../features/strategy-lab/VolTargetStudy'
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
        <nav className="lab-index" aria-label="研究列表">
          <ol>
            <li><a href="#lab-v01">有效策略初版：一条按月、一条按日</a><span>美股宏观攻守（现行）+ A 股 ETF 日线择时（影子运行）</span></li>
            <li><a href="#lab-vol-confirm">降低波动：确认检验与决定</a><span>波动率目标部分成立，不纳入规则；最可靠的是调低上限</span></li>
            <li><a href="#lab-etf-volume">A 股 ETF 择时加成交量</a><span>三种成交量条件都没有帮助</span></li>
            <li><a href="#lab-vol-target">波动率目标：市场越乱，仓位越低</a><span>回撤明显更浅，但按事先门槛差一点不通过</span></li>
            <li><a href="#lab-daily-execution">宏观攻守能不能按日执行</a><span>不通过，维持按月</span></li>
            <li><a href="#lab-late-cycle">牛市后段到回调：策略做了什么，月中加刹车有没有用</a><span>只对宏观先转差的下跌有用；刹车不通过</span></li>
          </ol>
        </nav>
        <EffectiveStrategies />
        <VolConfirmStudy />
        <EtfVolumeStudy />
        <VolTargetStudy />
        <DailyExecutionStudy />
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
