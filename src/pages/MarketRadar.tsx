import React from 'react'
import { Link } from 'react-router-dom'
import { Page } from '../components/ui'
import { useCompositePosture } from '../features/macro-posture/composite/load'
import { useMarketRadar } from '../features/market-radar/load'
import RadarView from '../features/market-radar/RadarView'
import '../styles/market-radar.css'

export const MARKET_RADAR_LEAD =
  '这是我自建的指标体系：流动性、估值、仓位与拥挤度、交易结构、盈利五个维度给出透明综合分。与大师方案（宏观攻守）完全独立，不影响其结论，也不进入其打分、置信度与前推记录。'

export const MARKET_RADAR_FOOTER =
  '规则先验设定并公开回测；验证期只作报告、不参与挑选。读数来自公开数据源。描述风险状态与仓位档位，不构成买卖建议。'

export default function MarketRadar(): JSX.Element {
  const radar = useMarketRadar()
  const composite = useCompositePosture()
  const mastersTier = composite.status === 'ready' ? composite.data.current.final.tier : null

  return (
    <Page className="mr-page">
      <header className="page-head mr-head">
        <h1>我的市场雷达</h1>
        <p className="mr-head__lead" data-testid="mr-head-lead">
          {MARKET_RADAR_LEAD}
        </p>
        <ul className="mr-head__links">
          <li><Link to="/invest/macro-posture">宏观攻守（大师方案）</Link></li>
          <li><a href="#mr-backtest">公开回测</a></li>
          <li><a href="#mp-market">市场综合</a></li>
        </ul>
      </header>

      <RadarView state={radar} mastersTier={mastersTier} />

      <footer className="mr-footer" role="note">
        <p>
          {radar.status === 'ready' ? `规则版本 ${radar.data.ruleVersion}` : '规则版本 radar-v1'}
        </p>
        <p>{MARKET_RADAR_FOOTER}</p>
      </footer>
    </Page>
  )
}
