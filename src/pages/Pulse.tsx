import React, { useEffect, useState } from 'react'
import { fetchMarketDataByType } from '../services/api'
import type { StockQuote } from '../types'

type MarketCategory = {
  key: string
  title: string
  icon: string
  color: string
  bgColor: string
  data: StockQuote[]
}

export default function Pulse(): JSX.Element {
  const [categories, setCategories] = useState<MarketCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [timestamp, setTimestamp] = useState<string>('')

  useEffect(() => {
    let mounted = true

    const fetchAllData = async () => {
      setLoading(true)
      
      // 初始化分类
      const categoryConfig = [
        { key: 'us', title: '美股指数', icon: '🇺🇸', color: '#3b82f6', bgColor: '#eff6ff' },
        { key: 'cn', title: '中国A股', icon: '🇨🇳', color: '#ef4444', bgColor: '#fef2f2' },
        { key: 'hk', title: '港股指数', icon: '🇭🇰', color: '#22c55e', bgColor: '#f0fdf4' },
        { key: 'commodity', title: '大宗商品', icon: '📦', color: '#f59e0b', bgColor: '#fffbeb' },
        { key: 'forex', title: '外汇债券', icon: '💱', color: '#8b5cf6', bgColor: '#faf5ff' },
      ]
      
      // 并行获取所有数据
      const results = await Promise.all(
        categoryConfig.map(async (cat) => {
          const data = await fetchMarketDataByType(cat.key as any)
          return { ...cat, data }
        })
      )
      
      if (mounted) {
        setCategories(results)
        setTimestamp(new Date().toLocaleString('zh-CN'))
        setLoading(false)
      }
    }

    fetchAllData()

    return () => { mounted = false }
  }, [])

  const handleRefresh = () => {
    window.location.reload()
  }

  const formatPrice = (price: number, symbol?: string) => {
    // 比特币显示整数，其他保留2位
    if (symbol === 'BTC-USD') return price.toLocaleString('en-US', { maximumFractionDigits: 0 })
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const formatPercent = (percent: number) => {
    const sign = percent >= 0 ? '+' : ''
    return `${sign}${percent.toFixed(2)}%`
  }

  // 渲染单个数据卡片
  const renderCard = (stock: StockQuote, color: string) => {
    const isPositive = stock.change >= 0
    const changeColor = isPositive ? '#16a34a' : '#dc2626'
    
    return (
      <div 
        key={stock.symbol}
        style={{
          background: 'white',
          borderRadius: '12px',
          padding: '16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          borderLeft: `4px solid ${color}`,
          transition: 'transform 0.2s, box-shadow 0.2s',
          cursor: 'default'
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
          <span style={{ fontWeight: '600', fontSize: '0.95rem', color: '#1f2937' }}>
            {stock.name}
          </span>
          {stock.rsi !== undefined && (
            <span style={{ 
              fontSize: '0.75rem', 
              padding: '2px 6px', 
              borderRadius: '4px',
              background: stock.rsi >= 70 ? '#fef2f2' : stock.rsi <= 30 ? '#f0fdf4' : '#f3f4f6',
              color: stock.rsi >= 70 ? '#dc2626' : stock.rsi <= 30 ? '#16a34a' : '#6b7280',
              fontWeight: '500'
            }}>
              RSI {stock.rsi.toFixed(0)}
            </span>
          )}
        </div>
        
        <div style={{ fontSize: '1.5rem', fontWeight: '700', color: changeColor }}>
          {formatPrice(stock.price, stock.symbol)}
        </div>
        
        <div style={{ display: 'flex', gap: '12px', fontSize: '0.85rem' }}>
          <span style={{ color: changeColor, fontWeight: '500' }}>
            {isPositive ? '↑' : '↓'} {formatPrice(Math.abs(stock.change))}
          </span>
          <span style={{ 
            color: changeColor, 
            fontWeight: '600',
            padding: '1px 6px',
            borderRadius: '4px',
            background: isPositive ? '#f0fdf4' : '#fef2f2'
          }}>
            {formatPercent(stock.changePercent)}
          </span>
        </div>
      </div>
    )
  }

  // 渲染分类区块
  const renderCategory = (category: MarketCategory) => (
    <div key={category.key} style={{ marginBottom: '24px' }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px', 
        marginBottom: '12px',
        padding: '8px 12px',
        background: category.bgColor,
        borderRadius: '8px',
        borderLeft: `4px solid ${category.color}`
      }}>
        <span style={{ fontSize: '1.2rem' }}>{category.icon}</span>
        <span style={{ fontWeight: '600', color: category.color, fontSize: '1rem' }}>
          {category.title}
        </span>
        <span style={{ fontSize: '0.8rem', color: '#9ca3af', marginLeft: 'auto' }}>
          {category.data.length} 项
        </span>
      </div>
      
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: '12px'
      }}>
        {category.data.map(stock => renderCard(stock, category.color))}
        {category.data.length === 0 && (
          <div style={{ 
            padding: '20px', 
            color: '#9ca3af', 
            fontSize: '0.9rem',
            gridColumn: '1 / -1',
            textAlign: 'center'
          }}>
            加载中...
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div style={{ 
      maxWidth: '1200px', 
      margin: '0 auto', 
      padding: '16px',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '24px',
        padding: '16px 20px',
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
      }}>
        <div>
          <h1 style={{ 
            margin: 0, 
            fontSize: '1.5rem', 
            fontWeight: '700',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            📊 经济脉搏
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#6b7280' }}>
            每日市场数据一览
          </p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
            {timestamp || '--'}
          </span>
          <button
            onClick={handleRefresh}
            disabled={loading}
            style={{
              padding: '8px 16px',
              background: loading ? '#e5e7eb' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
              color: loading ? '#9ca3af' : 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            {loading ? '⏳' : '🔄'} {loading ? '加载中' : '刷新'}
          </button>
        </div>
      </div>

      {/* 数据分类 */}
      {categories.map(renderCategory)}

      {/* 其他资源链接 */}
      <div style={{ 
        marginTop: '24px', 
        padding: '20px',
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
      }}>
        <h3 style={{ 
          fontSize: '1rem', 
          marginBottom: '12px', 
          color: '#374151',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          🔗 常用资源
        </h3>
        <div style={{ 
          display: 'flex', 
          flexWrap: 'wrap',
          gap: '8px'
        }}>
          {[
            { name: '证券时报', url: 'https://stcn.com/article/search.html?keyword=%E6%8F%AD%E7%A7%98%E6%B6%A8%E5%81%9C' },
            { name: '选股通', url: 'https://xuangutong.com.cn/jingxuan' },
            { name: 'Yahoo Finance', url: 'https://finance.yahoo.com' },
            { name: '财联社', url: 'https://www.cls.cn/' },
            { name: '东方财富', url: 'https://www.eastmoney.com/' },
          ].map(link => (
            <a
              key={link.name}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '6px 12px',
                background: '#f3f4f6',
                color: '#4b5563',
                textDecoration: 'none',
                borderRadius: '6px',
                fontSize: '0.85rem',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#3b82f6'
                e.currentTarget.style.color = 'white'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#f3f4f6'
                e.currentTarget.style.color = '#4b5563'
              }}
            >
              {link.name}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
