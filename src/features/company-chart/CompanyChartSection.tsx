// 公司详情页「价格走势与情景价位」卡片：按市场选图（美股 TradingView / 沪深自绘 / 港股与北交所不出图）+ 研究价位刻度条。
import React from 'react'
import type { Market } from '../../data/companies'
import { Card } from '../../components/ui'
import { chartTargetOf } from './symbols'
import PriceLevels from './PriceLevels'
import type { PriceLevelsInput } from './levelsModel'
import TvChart from './TvChart'
import CnChart from './CnChart'
import './company-chart.css'

export const CHART_DISCLAIMER = '走势图仅供看图，研究价格锚点以本页数据为准'

export default function CompanyChartSection({ market, code, name, levels, priceDate, scenariosHref }: {
  market: Market
  code: string
  name: string
  levels: PriceLevelsInput
  /** 本页行情日期（marketRefresh.priceDate），港股/北交所无图时展示 */
  priceDate?: string
  scenariosHref?: string
}): JSX.Element {
  const target = chartTargetOf(market, code)
  const mode = target.kind === 'tradingview' ? '数据：TradingView · 美股延迟行情'
    : target.kind === 'cn' ? '数据：腾讯行情 · 收盘后（EOD）'
      : '无走势图'
  return (
    <Card as="section" title="价格走势与情景价位" className="cc-section" id="company-chart">
      <p className="cc-section__note" role="note"><strong>{CHART_DISCLAIMER}</strong><span>{mode}</span></p>
      {target.kind === 'tradingview' && (
        <TvChart key={target.tvSymbol} tvSymbol={target.tvSymbol} externalUrl={target.externalUrl} market={market} name={name} exchangeKnown={target.exchange !== null} />
      )}
      {target.kind === 'cn' && <CnChart key={target.tencentSymbol} tencentSymbol={target.tencentSymbol} name={name} externalUrl={target.externalUrl} />}
      {target.kind === 'none' && (
        <p className="cc-section__empty" role="note">
          {target.reason === 'hk' ? '港股走势图暂无免费嵌入源（TradingView 免费组件不含港交所个股）'
            : target.reason === 'bse' ? '北交所个股暂无走势图数据源'
              : '代码无法对应走势图数据源'}
          {priceDate ? `；本页行情日期 ${priceDate}` : ''}。
          {target.externalUrl && <> <a href={target.externalUrl} target="_blank" rel="noopener noreferrer" className="rn-link">在港交所查看报价 ↗</a></>}
        </p>
      )}
      <PriceLevels input={levels} scenariosHref={scenariosHref} />
    </Card>
  )
}
