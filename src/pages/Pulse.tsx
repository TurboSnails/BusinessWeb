import React, { useEffect, useState } from 'react'
import { fetchMarketDataByType } from '../services/api'
import type { MarketData, StockQuote } from '../types'

export default function Pulse(): JSX.Element {
  const [data, setData] = useState<MarketData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let mounted = true
    let timeoutId: ReturnType<typeof setTimeout>

    setLoading(true)
    setError(null)
    setData(null)

    // 添加超时处理（25秒，给更多时间）
    timeoutId = setTimeout(() => {
      if (mounted) {
        console.warn('请求超时')
        setError(new Error('请求超时（25秒），可能是网络问题'))
        setLoading(false)
        // 即使超时也设置空数据，避免一直显示加载中
        setData({
          usStocks: [],
          chinaIndices: [],
          hkIndices: [],
          timestamp: new Date().toISOString()
        })
      }
    }, 25000)

    const fetchData = async () => {
      // 初始化数据
      if (mounted) {
        setData({
          usStocks: [],
          chinaIndices: [],
          hkIndices: [],
          timestamp: new Date().toISOString()
        })
      }

      // 分别获取各个市场的数据，每获取到一个就立即更新
      const fetchUS = async () => {
        try {
          const usData = await fetchMarketDataByType('us')
          if (mounted) {
            setData(prev => prev ? { ...prev, usStocks: usData } : {
              usStocks: usData,
              chinaIndices: [],
              hkIndices: [],
              timestamp: new Date().toISOString()
            })
          }
        } catch (e) {
          console.error('获取美股数据失败:', e)
        }
      }

      const fetchCN = async () => {
        try {
          const cnData = await fetchMarketDataByType('cn')
          if (mounted) {
            setData(prev => prev ? { ...prev, chinaIndices: cnData } : {
              usStocks: [],
              chinaIndices: cnData,
              hkIndices: [],
              timestamp: new Date().toISOString()
            })
          }
        } catch (e) {
          console.error('获取中国数据失败:', e)
        }
      }

      const fetchHK = async () => {
        try {
          const hkData = await fetchMarketDataByType('hk')
          if (mounted) {
            setData(prev => prev ? { ...prev, hkIndices: hkData } : {
              usStocks: [],
              chinaIndices: [],
              hkIndices: hkData,
              timestamp: new Date().toISOString()
            })
          }
        } catch (e) {
          console.error('获取香港数据失败:', e)
        }
      }

      // 并行获取所有数据，但每个市场独立更新
      Promise.allSettled([fetchUS(), fetchCN(), fetchHK()]).then(() => {
        clearTimeout(timeoutId)
        if (mounted) {
          setLoading(false)
          setData(prev => prev ? { ...prev, timestamp: new Date().toISOString() } : {
            usStocks: [],
            chinaIndices: [],
            hkIndices: [],
            timestamp: new Date().toISOString()
          })
        }
      }).catch((e) => {
        clearTimeout(timeoutId)
        if (mounted) {
          console.error('数据获取失败:', e)
          setError(new Error('部分数据获取失败'))
          setLoading(false)
        }
      })
    }

    fetchData()

    return () => {
      mounted = false
      clearTimeout(timeoutId)
    }
  }, [refreshKey])

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1)
  }

  const formatPrice = (price: number) => {
    return price.toFixed(2)
  }

  const formatPercent = (percent: number) => {
    const sign = percent >= 0 ? '+' : ''
    return `${sign}${percent.toFixed(2)}%`
  }

  // 合并所有指数数据，并添加分组信息
  const allIndices = data ? [
    ...data.usStocks.map(s => ({ ...s, category: '美股', groupColor: '#dbeafe' })),
    ...data.chinaIndices.map(s => ({ ...s, category: '中国', groupColor: '#fef3c7' })),
    ...data.hkIndices.map(s => ({ ...s, category: '香港', groupColor: '#d1fae5' }))
  ] : []
  
  // 调试日志
  console.log('页面数据:', {
    usStocks: data?.usStocks?.length || 0,
    chinaIndices: data?.chinaIndices?.length || 0,
    hkIndices: data?.hkIndices?.length || 0,
    allIndices: allIndices.length
  })
  
  // 获取分组边框颜色
  const getGroupBorderColor = (category: string) => {
    switch(category) {
      case '美股': return '#3b82f6' // 蓝色
      case '中国': return '#f59e0b' // 黄色/橙色
      case '香港': return '#10b981' // 绿色
      default: return '#e5e7eb'
    }
  }

  return (
    <div className="container" style={{ maxWidth: '100%', padding: '12px' }}>
      <div className="card" style={{ padding: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>经济脉搏</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ color: '#6b7280', fontSize: '0.8rem', fontWeight: '400' }}>
              {data?.timestamp ? new Date(data.timestamp).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '--'}
            </span>
            <button
              onClick={handleRefresh}
              disabled={loading}
              style={{
                padding: '6px 12px',
                background: loading ? '#e5e7eb' : '#ffffff',
                color: loading ? '#9ca3af' : '#2563eb',
                border: loading ? '1px solid #e5e7eb' : '1px solid #dbeafe',
                borderRadius: '6px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '0.8rem',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s ease',
                boxShadow: loading ? 'none' : '0 1px 2px rgba(0, 0, 0, 0.05)'
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = '#eff6ff'
                  e.currentTarget.style.borderColor = '#93c5fd'
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)'
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = '#ffffff'
                  e.currentTarget.style.borderColor = '#dbeafe'
                  e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)'
                }
              }}
            >
              <span style={{ fontSize: '0.9rem' }}>{loading ? '⏳' : '🔄'}</span>
              <span>{loading ? '加载中' : '刷新'}</span>
            </button>
          </div>
        </div>

        {error && (
          <div style={{ padding: '8px 12px', background: '#fef3c7', borderRadius: '4px', color: '#92400e', marginBottom: '12px', fontSize: '0.8rem' }}>
            ⚠️ {error.message}
          </div>
        )}

        {/* 表格展示所有指数 */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280', fontSize: '0.9rem' }}>
            加载中...
          </div>
        ) : allIndices.length > 0 ? (
          <div style={{ overflowX: 'auto', marginTop: '12px', WebkitOverflowScrolling: 'touch', borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: '600px', backgroundColor: 'white' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: '600', color: '#475569', fontSize: '0.8rem', letterSpacing: '0.3px' }}>指数</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: '600', color: '#475569', fontSize: '0.8rem', letterSpacing: '0.3px' }}>价格</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: '600', color: '#475569', fontSize: '0.8rem', letterSpacing: '0.3px' }}>涨跌</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: '600', color: '#475569', fontSize: '0.8rem', letterSpacing: '0.3px' }}>涨跌幅</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: '600', color: '#475569', fontSize: '0.8rem', letterSpacing: '0.3px' }}>RSI</th>
                </tr>
              </thead>
              <tbody>
                {allIndices.map((stock, index) => {
                  const isPositive = stock.change >= 0
                  const color = isPositive ? '#059669' : '#dc2626'
                  const groupBorderColor = getGroupBorderColor(stock.category)
                  const isFirstInGroup = index === 0 || allIndices[index - 1].category !== stock.category
                  
                  return (
                    <tr 
                      key={stock.symbol} 
                      style={{ 
                        borderBottom: '1px solid #f1f5f9',
                        backgroundColor: stock.groupColor || '#ffffff',
                        borderLeft: `4px solid ${groupBorderColor}`,
                        borderTop: isFirstInGroup ? `2px solid ${groupBorderColor}` : 'none',
                        transition: 'background-color 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = stock.groupColor ? 
                          (stock.category === '美股' ? '#bfdbfe' : stock.category === '中国' ? '#fde68a' : '#a7f3d0') : 
                          '#f8fafc'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = stock.groupColor || '#ffffff'
                      }}
                    >
                      <td style={{ padding: '10px 12px', lineHeight: '1.4' }}>
                        <div style={{ fontWeight: '600', fontSize: '0.9rem', color: '#1e293b' }}>{stock.name}</div>
                      </td>
                      <td style={{ textAlign: 'right', padding: '10px 12px', fontWeight: '600', color: color, fontSize: '0.9rem' }}>
                        {formatPrice(stock.price)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '10px 12px', fontSize: '0.85rem' }}>
                        <span style={{ color: color, fontWeight: '500' }}>
                          {stock.change >= 0 ? '↑' : '↓'} {formatPrice(Math.abs(stock.change))}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', padding: '10px 12px', fontWeight: '600', color: color, fontSize: '0.85rem' }}>
                        {formatPercent(stock.changePercent)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '10px 12px', fontSize: '0.85rem' }}>
                        {stock.rsi !== undefined ? (
                          <span style={{ 
                            color: stock.rsi >= 70 ? '#dc2626' : stock.rsi <= 30 ? '#059669' : '#6b7280',
                            fontWeight: '500'
                          }}>
                            {stock.rsi.toFixed(1)}
                          </span>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>--</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '12px', background: '#f3f4f6', borderRadius: '4px', color: '#6b7280', fontSize: '0.85rem', textAlign: 'center' }}>
            暂无数据
          </div>
        )}

        {/* 其他资源链接 */}
        <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
          <h3 style={{ fontSize: '0.9rem', marginBottom: '8px', color: '#1f2937' }}>📊 其他资源</h3>
          <div style={{ display: 'grid', gap: '6px' }}>
            <a 
              href="https://stcn.com/article/search.html?keyword=%E6%8F%AD%E7%A7%98%E6%B6%A8%E5%81%9C" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.85rem' }}
            >
              → 证券时报 — 搜索：揭秘涨停
            </a>
            <a 
              href="https://xuangutong.com.cn/jingxuan" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.85rem' }}
            >
              → 选股通 — 精选
            </a>
            <a 
              href="http://csme.cnthesims.com/pages/index/index" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.85rem' }}
            >
              → cs财经
            </a>
            <a 
              href="https://finance.yahoo.com" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.85rem' }}
            >
              → Yahoo Finance
            </a>
            <a 
              href="https://www.cls.cn/" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.85rem' }}
            >
              → 财联社
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
