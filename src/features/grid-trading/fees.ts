import { isEtf } from './types'

export type TradeSide = '买入' | '卖出' | '建仓'

export const COMMISSION_RATE = 0.00015
export const STOCK_SELL_TAX_RATE = 0.0005
export const FEE_VERSION = 'notes-fees-v1'

export function calculateFee(code: string, side: TradeSide, turnover: number): number {
  if (!Number.isFinite(turnover) || turnover < 0) {
    throw new RangeError('成交金额必须是非负有限数值')
  }

  const etf = isEtf(code)
  const commission = etf ? Math.max(5, turnover * COMMISSION_RATE) : turnover * COMMISSION_RATE
  const tax = side === '卖出' && !etf ? turnover * STOCK_SELL_TAX_RATE : 0
  return commission + tax
}
