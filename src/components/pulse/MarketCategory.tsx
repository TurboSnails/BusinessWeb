import React from 'react'
import type { MarketCategory as MarketCategoryType } from '../../types'
import { MarketCard } from './MarketCard'

interface MarketCategoryProps {
  category: MarketCategoryType
}

export const MarketCategory: React.FC<MarketCategoryProps> = ({ category }) => {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ 
        display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', padding: '6px 10px',
        background: category.bgColor, borderRadius: '6px', borderLeft: `3px solid ${category.color}` 
      }}>
        <span style={{ fontSize: '1rem' }}>{category.icon}</span>
        <span style={{ fontWeight: '600', color: category.color, fontSize: '0.9rem' }}>
          {category.title}
        </span>
      </div>
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', 
        gap: '10px' 
      }}>
        {category.data.map(stock => (
          <MarketCard key={stock.symbol} stock={stock} color={category.color} />
        ))}
        {category.data.length === 0 && (
          <div style={{ 
            padding: '16px', color: '#9ca3af', fontSize: '0.85rem', 
            gridColumn: '1 / -1', textAlign: 'center' 
          }}>
            加载中...
          </div>
        )}
      </div>
    </div>
  )
}

