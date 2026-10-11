import React from 'react'
import type { MarketCategory as MarketCategoryType } from '../../types'
import { MarketCard } from './MarketCard'

interface MarketCategoryProps {
  category: MarketCategoryType
}

export const MarketCategory: React.FC<MarketCategoryProps> = ({ category }) => {
  return (
    <section className="pulse-category" aria-label={category.title}>
      <div className="pulse-category__head" style={{ background: category.bgColor, borderLeftColor: category.color }}>
        <span className="pulse-category__icon" aria-hidden="true">{category.icon}</span>
        <span className="pulse-category__title" style={{ color: category.color }}>{category.title}</span>
      </div>
      <div className="pulse-category__grid">
        {category.data.map(stock => (
          <MarketCard key={stock.symbol} stock={stock} color={category.color} />
        ))}
        {category.data.length === 0 && <div className="pulse-category__empty">加载中…</div>}
      </div>
    </section>
  )
}
