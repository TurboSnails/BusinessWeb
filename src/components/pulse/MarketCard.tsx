import React from 'react'
import type { StockQuote } from '../../types'
import { formatPrice, formatPercent } from '../../utils/format'
import '../../styles/pulse.css'

interface MarketCardProps {
  stock: StockQuote
  color: string
}

// 全球行情按美股习惯绿涨红跌，颜色用中性的 system-green / system-red（不借用 A 股的 --up/--down）
export const MarketCard: React.FC<MarketCardProps> = ({ stock, color }) => {
  const isPositive = stock.change >= 0
  const changeColor = isPositive ? 'var(--system-green)' : 'var(--system-red)'
  const rsiTone = stock.rsi === undefined ? '' : stock.rsi >= 70 ? ' is-hot' : stock.rsi <= 30 ? ' is-cold' : ''

  return (
    <div className="pulse-card" style={{ borderLeftColor: color }}>
      <div className="pulse-card__head">
        <span className="pulse-card__name">{stock.name}</span>
        {stock.rsi !== undefined && <span className={`pulse-card__rsi${rsiTone}`}>RSI {stock.rsi.toFixed(0)}</span>}
      </div>
      <div className="pulse-card__price" style={{ color: changeColor }}>{formatPrice(stock.price, stock.symbol)}</div>
      <div className="pulse-card__change" style={{ color: changeColor }}>
        <span>{isPositive ? '↑' : '↓'} {formatPrice(Math.abs(stock.change))}</span>
        <span className={isPositive ? 'pulse-card__pct is-up' : 'pulse-card__pct is-down'}>{formatPercent(stock.changePercent)}</span>
      </div>
    </div>
  )
}
