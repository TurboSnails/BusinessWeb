import React from 'react'
import type { SectorCategory } from '../../types'

interface SectorSectionProps {
  category: SectorCategory
}

export const SectorSection: React.FC<SectorSectionProps> = ({ category }) => {
  const formatPercent = (percent: number): string => {
    const sign = percent >= 0 ? '+' : ''
    return `${sign}${percent.toFixed(2)}%`
  }

  const formatAmount = (amount: number): string => {
    // amount 单位是万元，转换为合适的显示
    if (amount >= 10000) {
      return `${(amount / 10000).toFixed(1)}亿`
    } else if (amount >= 1) {
      return `${amount.toFixed(1)}万`
    } else {
      return `${(amount * 10000).toFixed(0)}元`
    }
  }

  // 分离上涨和下跌的板块
  const upSectors = category.data
    .filter(s => s.changePercent > 0)
    .sort((a, b) => b.changePercent - a.changePercent)  // 按涨幅降序
    .slice(0, 15)
  
  const downSectors = category.data
    .filter(s => s.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent)  // 按跌幅升序（最跌的在前面）
    .slice(0, 15)

  // 调试信息
  if (category.data.length > 0 && upSectors.length === 0 && downSectors.length === 0) {
    console.warn(`${category.title} 数据异常:`, {
      total: category.data.length,
      sample: category.data.slice(0, 3).map(s => ({ name: s.name, changePercent: s.changePercent }))
    })
  }

  return (
    <div style={{ marginBottom: '24px', padding: '16px', background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <div style={{ 
        display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '6px 10px',
        background: category.bgColor, borderRadius: '6px', borderLeft: `3px solid ${category.color}` 
      }}>
        <span style={{ fontSize: '1rem' }}>{category.icon}</span>
        <span style={{ fontWeight: '600', color: category.color, fontSize: '0.9rem' }}>
          {category.title}
        </span>
      </div>

      {/* 上涨板块 */}
      {upSectors.length > 0 && (
        <>
          <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#16a34a', marginBottom: '10px', padding: '6px 0' }}>
            📈 涨幅前15
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px', marginBottom: '20px' }}>
            {upSectors.map((sector) => {
            const isPositive = sector.changePercent >= 0
            const changeColor = isPositive ? '#16a34a' : '#dc2626'
            
            return (
              <div
                key={sector.code}
                style={{
                  background: 'white',
                  borderRadius: '8px',
                  padding: '12px',
                  border: `1px solid ${isPositive ? '#d1fae5' : '#fee2e2'}`,
                  borderLeft: `3px solid ${changeColor}`,
                  transition: 'transform 0.2s, box-shadow 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <span style={{ fontWeight: '600', fontSize: '0.9rem', color: '#1f2937', flex: 1 }}>
                    {sector.name}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {sector.rsi !== undefined && (
                      <span style={{ 
                        fontSize: '0.7rem', padding: '2px 5px', borderRadius: '4px', fontWeight: '500',
                        background: sector.rsi >= 70 ? '#fef2f2' : sector.rsi <= 30 ? '#f0fdf4' : '#f3f4f6',
                        color: sector.rsi >= 70 ? '#dc2626' : sector.rsi <= 30 ? '#16a34a' : '#6b7280'
                      }}>
                        RSI {sector.rsi.toFixed(0)}
                      </span>
                    )}
                    <span style={{ 
                      fontSize: '0.85rem', fontWeight: '700', color: changeColor 
                    }}>
                      {formatPercent(sector.changePercent)}
                    </span>
                  </div>
                </div>
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '0.75rem', color: '#6b7280' }}>
                  <span>成交额: <strong style={{ color: '#374151' }}>{formatAmount(sector.amount)}</strong></span>
                  {sector.stockCount > 0 && (
                    <>
                      <span>•</span>
                      <span>成分股: <strong style={{ color: '#374151' }}>{sector.stockCount}</strong></span>
                    </>
                  )}
                </div>
              </div>
            )
          })}
          </div>
        </>
      )}

      {/* 下跌板块 */}
      {downSectors.length > 0 && (
        <>
          <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#dc2626', marginBottom: '10px', padding: '6px 0', marginTop: '20px' }}>
            📉 跌幅前15
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
            {downSectors.map((sector) => {
              const isPositive = sector.changePercent >= 0
              const changeColor = isPositive ? '#16a34a' : '#dc2626'
              
              return (
                <div
                  key={sector.code}
                  style={{
                    background: 'white',
                    borderRadius: '8px',
                    padding: '12px',
                    border: `1px solid ${isPositive ? '#d1fae5' : '#fee2e2'}`,
                    borderLeft: `3px solid ${changeColor}`,
                    transition: 'transform 0.2s, box-shadow 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <span style={{ fontWeight: '600', fontSize: '0.9rem', color: '#1f2937', flex: 1 }}>
                      {sector.name}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {sector.rsi !== undefined && (
                        <span style={{ 
                          fontSize: '0.7rem', padding: '2px 5px', borderRadius: '4px', fontWeight: '500',
                          background: sector.rsi >= 70 ? '#fef2f2' : sector.rsi <= 30 ? '#f0fdf4' : '#f3f4f6',
                          color: sector.rsi >= 70 ? '#dc2626' : sector.rsi <= 30 ? '#16a34a' : '#6b7280'
                        }}>
                          RSI {sector.rsi.toFixed(0)}
                        </span>
                      )}
                      <span style={{ 
                        fontSize: '0.85rem', fontWeight: '700', color: changeColor 
                      }}>
                        {formatPercent(sector.changePercent)}
                      </span>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '0.75rem', color: '#6b7280' }}>
                    <span>成交额: <strong style={{ color: '#374151' }}>{formatAmount(sector.amount)}</strong></span>
                    {sector.stockCount > 0 && (
                      <>
                        <span>•</span>
                        <span>成分股: <strong style={{ color: '#374151' }}>{sector.stockCount}</strong></span>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {upSectors.length === 0 && downSectors.length === 0 && (
        <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>
          {category.data.length === 0 ? '暂无数据' : '加载中...'}
        </div>
      )}
      
      {/* 如果只有上涨或只有下跌，显示提示 */}
      {upSectors.length > 0 && downSectors.length === 0 && (
        <div style={{ padding: '12px', textAlign: 'center', color: '#9ca3af', fontSize: '0.75rem', marginTop: '10px' }}>
          暂无下跌板块数据
        </div>
      )}
      
      {upSectors.length === 0 && downSectors.length > 0 && (
        <div style={{ padding: '12px', textAlign: 'center', color: '#9ca3af', fontSize: '0.75rem', marginTop: '10px' }}>
          暂无上涨板块数据
        </div>
      )}
    </div>
  )
}

