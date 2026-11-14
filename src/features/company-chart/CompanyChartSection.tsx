// 公司页「价格走势与情景价位」卡片：所有市场统一用站内 Lightweight Charts（LwChart，本站日线数据 + 研究价位线），
// 北交所/非法代码不出图；下方保留研究价位刻度条。
import React from 'react'
import type { Market } from '../../data/companies'
import { Card } from '../../components/ui'
import { chartTargetOf } from './symbols'
import PriceLevels from './PriceLevels'
import type { PriceLevelsInput } from './levelsModel'
import LwChart from './LwChart'
import './company-chart.css'

export const CHART_DISCLAIMER = '走势图仅供看图，研究价格锚点以本页数据为准'

const SOURCE_NOTE: Record<Market, string> = {
  cn: '数据：腾讯行情 · 前复权日线（收盘后数据；盘中最后一根为延迟价）',
  hk: '数据：腾讯行情 · 港股日线（收盘后数据；盘中最后一根为延迟价）',
  us: '数据：Yahoo Finance · 日线（收盘后数据；盘中最后一根为延迟价）',
  adr: '数据：Yahoo Finance · 日线（收盘后数据；盘中最后一根为延迟价）',
  ndx: '数据：Yahoo Finance · 日线（收盘后数据；盘中最后一根为延迟价）',
}

export default function CompanyChartSection({ market, code, name, levels, priceDate, scenariosHref }: {
  market: Market
  code: string
  name: string
  levels: PriceLevelsInput
  /** 本页行情日期（marketRefresh.priceDate），无图时展示 */
  priceDate?: string
  scenariosHref?: string
}): JSX.Element {
  const target = chartTargetOf(market, code)
  return (
    <Card as="section" title="价格走势与情景价位" className="cc-section" id="company-chart">
      <p className="cc-section__note" role="note"><strong>{CHART_DISCLAIMER}</strong><span>{target.kind === 'chart' ? SOURCE_NOTE[market] : '无走势图'}</span></p>
      {target.kind === 'chart' && (
        <LwChart
          key={target.candleSymbol}
          candleSymbol={target.candleSymbol}
          market={market}
          currency={target.currency}
          name={name}
          levels={levels}
          externalUrl={target.externalUrl}
          externalLabel={target.externalLabel}
          note={target.exchangeKnown === false ? '本站资料未记录该股交易所，TradingView 外链按代码自动解析，请核对。' : undefined}
        />
      )}
      {target.kind === 'none' && (
        <p className="cc-section__empty" role="note">
          {target.reason === 'bse' ? '北交所个股暂无走势图数据源' : '代码无法对应走势图数据源'}
          {priceDate ? `；本页行情日期 ${priceDate}` : ''}。
        </p>
      )}
      <PriceLevels input={levels} scenariosHref={scenariosHref} />
    </Card>
  )
}
