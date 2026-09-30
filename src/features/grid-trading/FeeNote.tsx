import React from 'react'
import { COMMISSION_RATE, STOCK_SELL_TAX_RATE, FEE_VERSION } from './fees'
import { isEtf } from './types'
export default function FeeNote({ code }: { code: string }): JSX.Element {
  return <p className="grid-data-caption">费用口径：{isEtf(code) ? `ETF 佣金 ${COMMISSION_RATE * 100}%，每笔最低 ¥5，免印花税。` : `普通 A 股佣金 ${COMMISSION_RATE * 100}%（不加最低佣金），卖出印花税 ${STOCK_SELL_TAX_RATE * 100}%。`} 费率版本：{FEE_VERSION}</p>
}
