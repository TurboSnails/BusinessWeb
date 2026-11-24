import React from 'react'
import { Page } from '../components/ui'
import TrioNav from '../features/combined-strategy/TrioNav'
import VerdictBar from '../features/combined-strategy/VerdictBar'
import { useMarketRadar } from '../features/market-radar/load'
import RadarView from '../features/market-radar/RadarView'
import '../styles/market-radar.css'

export const MARKET_RADAR_LEAD =
  '这是我自建的指标体系：从流动性、估值、仓位与拥挤度、交易结构、盈利五个维度看股市冷热，每项给出读数与历史位置。与大师方案（宏观攻守）完全独立，不影响其结论，也不进入其打分、置信度与前推记录。'

export const MARKET_RADAR_FOOTER =
  '规则先验设定并公开历史检验；验证期只作报告、不参与挑选。读数来自公开数据源。只描述股市冷热与各维度现状，不改变仓位，不构成买卖建议。'

export default function MarketRadar(): JSX.Element {
  const radar = useMarketRadar()

  return (
    <Page className="mr-page">
      <header className="page-head mr-head">
        <h1>市场雷达</h1>
        <p className="mr-head__lead" data-testid="mr-head-lead">
          {MARKET_RADAR_LEAD}
        </p>
        <TrioNav />
      </header>

      <VerdictBar />
      <RadarView state={radar} />

      <footer className="mr-footer" role="note">
        <p>
          {radar.status === 'ready' ? `规则版本 ${radar.data.ruleVersion}` : '规则版本 radar-v1'}
        </p>
        <p>{MARKET_RADAR_FOOTER}</p>
      </footer>
    </Page>
  )
}
