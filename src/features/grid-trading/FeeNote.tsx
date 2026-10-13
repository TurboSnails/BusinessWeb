import React from 'react'
import { COMMISSION_RATE, STOCK_SELL_TAX_RATE, FEE_VERSION, FEE_POLICY_CHECK } from './fees'
import { isEtf } from './types'
export default function FeeNote({ code }: { code: string }): JSX.Element {
  return <p className="grid-data-caption">回测费用假设：{isEtf(code) ? `ETF 佣金 ${COMMISSION_RATE * 100}%，每笔最低 ¥5，免印花税。` : `普通 A 股佣金 ${COMMISSION_RATE * 100}%（不加最低佣金），卖出印花税 ${STOCK_SELL_TAX_RATE * 100}%。`} 佣金请按券商实际账单核对。印花税规则核验 {FEE_POLICY_CHECK.checkedAt}，生效 {FEE_POLICY_CHECK.stockTaxEffectiveAt}，<a href={FEE_POLICY_CHECK.source} target="_blank" rel="noreferrer">官方公告</a>。费率版本：{FEE_VERSION}</p>
}
