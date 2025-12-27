import React from 'react'
import type { StockQuote } from '../../types'
import { formatPrice, formatPercent } from '../../utils/format'

interface MarketCardProps {
  stock: StockQuote
  color: string
}

export const MarketCard: React.FC<MarketCardProps> = ({ stock, color }) => {
  const isPositive = stock.change >= 0
  const changeColor = isPositive ? '#16a34a' : '#dc2626'

  return (
    <div style={{
      background: 'white', borderRadius: '12px', padding: '14px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column',
      gap: '6px', borderLeft: `4px solid ${color}`, transition: 'transform 0.2s, box-shadow 0.2s'
    }}
      onMouseEnter={(e) => { 
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)' 
      }}
      onMouseLeave={(e) => { 
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)' 
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontWeight: '600', fontSize: '0.9rem', color: '#1f2937' }}>{stock.name}</span>
        {stock.rsi !== undefined && (
          <span style={{ 
            fontSize: '0.7rem', padding: '2px 5px', borderRadius: '4px',
            background: stock.rsi >= 70 ? '#fef2f2' : stock.rsi <= 30 ? '#f0fdf4' : '#f3f4f6',
            color: stock.rsi >= 70 ? '#dc2626' : stock.rsi <= 30 ? '#16a34a' : '#6b7280', 
            fontWeight: '500'
          }}>
            RSI {stock.rsi.toFixed(0)}
          </span>
        )}
      </div>
      <div style={{ fontSize: '1.3rem', fontWeight: '700', color: changeColor }}>
        {formatPrice(stock.price, stock.symbol)}
      </div>
      <div style={{ display: 'flex', gap: '8px', fontSize: '0.8rem' }}>
        <span style={{ color: changeColor, fontWeight: '500' }}>
          {isPositive ? '↑' : '↓'} {formatPrice(Math.abs(stock.change))}
        </span>
        <span style={{ 
          color: changeColor, fontWeight: '600', padding: '1px 5px', borderRadius: '4px', 
          background: isPositive ? '#f0fdf4' : '#fef2f2' 
        }}>
          {formatPercent(stock.changePercent)}
        </span>
      </div>
    </div>
  )
}

