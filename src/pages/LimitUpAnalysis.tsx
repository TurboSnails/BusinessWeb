import React, { useState, useEffect, useCallback } from 'react'
import {
  TrendingUp,
  Calendar,
  RefreshCcw,
  AlertTriangle,
  BarChart2,
  TrendingDown,
  Info,
  ChevronDown,
  ChevronUp,
  ArrowRight
} from 'lucide-react'
import type { LimitUpConcept, LimitUpStock } from '../types'

export default function LimitUpAnalysis(): JSX.Element {
  const [concepts, setConcepts] = useState<LimitUpConcept[]>([])
  const [selectedConcept, setSelectedConcept] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [onlyLimitUp, setOnlyLimitUp] = useState(true) // 默认勾选"只看涨停"
  const [expandedStocks, setExpandedStocks] = useState<Set<string>>(new Set()) // 记录展开的股票代码
  // 日期选择：默认今天，格式 YYYY-MM-DD
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date()
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  })

  // 解析API返回的数据，转换为 LimitUpConcept[] 格式
  // API返回格式：{ code: 200, data: { plate_stock: [...] } }
  const parseApiData = (data: any): LimitUpConcept[] => {
    try {
      console.log('🔍 开始解析API数据，原始数据结构:', {
        code: data?.code,
        hasData: !!data?.data,
        plateStockLength: data?.data?.plate_stock?.length,
        sample: JSON.stringify(data).substring(0, 1000)
      })

      // 检查API返回状态
      if (data?.code !== 200) {
        console.warn('⚠️ API返回错误码:', data?.code, data?.msg)
        return getMockData()
      }

      // 从 data.plate_stock 获取板块数据
      const plateStockData = data?.data?.plate_stock

      if (!Array.isArray(plateStockData) || plateStockData.length === 0) {
        console.warn('⚠️ 无法提取板块数据，使用模拟数据')
        return getMockData()
      }

      console.log(`📊 提取到的板块数据，数量: ${plateStockData.length}`)

      // 解析每个板块
      const mappedConcepts = plateStockData.map((plate: any, index: number): LimitUpConcept | null => {
        try {
          // 解析股票列表 - API字段名是 stock_list
          const stocksArray = plate.stock_list || []
          const stocks: LimitUpStock[] = Array.isArray(stocksArray) ? stocksArray.map((stock: any) => {
            // API字段映射：
            // secu_code -> code
            // secu_name -> name
            // last_px -> currentPrice
            // change -> changePercent (小数形式，需要转换为百分比)
            // time -> limitUpTime
            // cmc -> marketCap (可能是以分为单位，需要转换为亿元)
            // up_num -> consecutiveDays (需要解析"10天9板"这样的字符串)
            // up_reason -> description

            const code = stock.secu_code || ''
            const name = stock.secu_name || ''
            const currentPrice = parseFloat(stock.last_px || stock.price || 0)
            // change 是小数形式，如 0.0997 表示 9.97%，需要乘以100
            const changePercent = parseFloat(stock.change || 0) * 100
            const limitUpTime = stock.time || ''
            // cmc 可能是以分为单位，需要转换为亿元（除以100000000）
            const marketCap = parseFloat(stock.cmc || 0) / 100000000
            // 解析 up_num，如 "10天9板" -> 9
            let consecutiveDays = 0
            if (stock.up_num) {
              const match = stock.up_num.match(/(\d+)天(\d+)板/)
              if (match) {
                consecutiveDays = parseInt(match[2], 10)
              } else {
                const singleMatch = stock.up_num.match(/(\d+)板/)
                if (singleMatch) {
                  consecutiveDays = parseInt(singleMatch[1], 10)
                }
              }
            }
            const description = stock.up_reason || ''

            return {
              code,
              name,
              currentPrice,
              changePercent,
              limitUpTime,
              marketCap,
              consecutiveDays,
              description
            }
          }) : []

          // 获取板块信息
          const conceptName = plate.secu_name || `板块${index + 1}`
          // plate_stock_up_num 是涨停股票数量，stock_list.length 是总股票数量
          const stockCount = parseInt(plate.plate_stock_up_num || stocksArray.length || '0', 10)
          // change 是小数形式，需要转换为百分比
          const changePercent = parseFloat(plate.change || 0) * 100
          const drivingFactor = plate.up_reason || ''

          console.log(`  ✓ 板块 ${index + 1}: ${conceptName}, 涨停数: ${stockCount}, 涨幅: ${changePercent.toFixed(2)}%, 股票列表长度: ${stocks.length}`)

          return {
            name: conceptName,
            stockCount: stockCount, // 涨停股票数量
            changePercent: changePercent,
            drivingFactor: drivingFactor,
            stocks: stocks // 所有股票（包括涨停和非涨停）
          }
        } catch (itemError) {
          console.warn(`解析板块 ${index} 失败:`, itemError, plate)
          return null
        }
      })

      const concepts: LimitUpConcept[] = mappedConcepts.filter((item): item is LimitUpConcept => item !== null)

      console.log(`✅ 成功解析 ${concepts.length} 个板块`)
      console.log('解析后的板块列表:', concepts.map(c => ({ name: c.name, stockCount: c.stockCount, stocksCount: c.stocks.length })))

      return concepts.length > 0 ? concepts : getMockData()
    } catch (error) {
      console.error('❌ 解析API数据失败:', error)
      console.error('错误堆栈:', error instanceof Error ? error.stack : '')
      return getMockData()
    }
  }

  // 模拟数据（仅作为fallback，实际应从API获取）
  const getMockData = (): LimitUpConcept[] => {
    console.warn('⚠️ 使用空数据作为fallback，请检查API调用')
    return []
  }

  // CORS代理配置
  const CORS_PROXY_MAIN = (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`
  const CORS_PROXY_BACKUP = (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
  const CORS_PROXY_THIRD = (url: string) => `https://proxy.cors.sh/${url}`
  const CORS_PROXIES = [CORS_PROXY_MAIN, CORS_PROXY_BACKUP, CORS_PROXY_THIRD]

  // 使用 useCallback 确保函数使用最新的 selectedDate 和 onlyLimitUp
  const fetchLimitUpData = useCallback(async () => {
    setLoading(true)
    setError(null)

    // 将 selectedDate (YYYY-MM-DD) 转换为 API 需要的格式 (YYYYMMDD)
    const dateStr = selectedDate.replace(/-/g, '')
    console.log('📅 获取数据，日期:', selectedDate, '转换后:', dateStr)

    // 实际API地址：https://x-quote.cls.cn/v2/quote/a/plate/up_down_analysis?up_limit=0&date=20251231&sign=...
    // up_limit=1 表示只看涨停（只返回涨停股票）
    // up_limit=0 表示取消只看涨停（返回所有股票，包括非涨停）
    const upLimit = onlyLimitUp ? 1 : 0
    const apiUrl = `https://x-quote.cls.cn/v2/quote/a/plate/up_down_analysis?up_limit=${upLimit}&date=${dateStr}`
    console.log('🌐 API URL:', apiUrl)

    // 尝试使用多个代理，哪个先成功用哪个
    const fetchFromProxy = async (proxyFn: (url: string) => string): Promise<any> => {
      const proxyUrl = proxyFn(apiUrl)
      console.log('尝试使用代理:', proxyUrl)

      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/html, */*',
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const contentType = response.headers.get('content-type') || ''
      console.log('响应Content-Type:', contentType)

      // 检查返回的是JSON还是HTML
      if (contentType.includes('application/json')) {
        const data = await response.json()
        console.log('✅ 成功获取JSON数据:', data)
        return { type: 'json', data }
      } else {
        // 如果是HTML，尝试解析HTML中的JSON数据
        const html = await response.text()
        console.log('📄 获取到HTML，长度:', html.length)
        console.log('HTML前500字符:', html.substring(0, 500))
        return { type: 'html', data: html }
      }
    }

    try {
      // 尝试多个代理
      const results = await Promise.allSettled(
        CORS_PROXIES.map(proxy => fetchFromProxy(proxy))
      )

      let parsedConcepts: LimitUpConcept[] | null = null

      // 找到第一个成功的结果
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { type, data } = result.value

          if (type === 'json') {
            parsedConcepts = parseApiData(data)
            if (parsedConcepts && parsedConcepts.length > 0) {
              console.log('✅ 成功解析JSON数据，概念数量:', parsedConcepts.length)
              setConcepts(parsedConcepts)
              setSelectedConcept(null) // 重置选中概念，让默认选中第一个
              setLoading(false)
              return
            }
          } else if (type === 'html') {
            // 尝试从HTML中提取JSON数据
            const scriptMatch =
              data.match(/<script[^>]*>[\s\S]*?window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/i) ||
              data.match(/<script[^>]*>[\s\S]*?var\s+data\s*=\s*({[\s\S]*?});/i) ||
              data.match(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i) ||
              data.match(/<script[^>]*>[\s\S]*?const\s+data\s*=\s*({[\s\S]*?});/i) ||
              data.match(/<script[^>]*>[\s\S]*?let\s+data\s*=\s*({[\s\S]*?});/i)

            if (scriptMatch && scriptMatch[1]) {
              try {
                const jsonData = JSON.parse(scriptMatch[1])
                console.log('✅ 从HTML中提取到JSON:', jsonData)
                parsedConcepts = parseApiData(jsonData)
                if (parsedConcepts && parsedConcepts.length > 0) {
                  console.log('✅ 成功解析HTML中的JSON数据，概念数量:', parsedConcepts.length)
                  setConcepts(parsedConcepts)
                  setSelectedConcept(null) // 重置选中概念，让默认选中第一个
                  setLoading(false)
                  return
                }
              } catch (parseError) {
                console.warn('❌ 解析HTML中的JSON失败:', parseError)
              }
            } else {
              console.warn('❌ 无法从HTML中找到JSON数据')
            }
          }
        } else {
          console.warn('代理请求失败:', result.reason)
        }
      }

      // 如果所有代理都失败，使用模拟数据
      if (!parsedConcepts || parsedConcepts.length === 0) {
        console.warn('⚠️ 所有代理都失败，使用模拟数据')
        setConcepts(getMockData())
        setSelectedConcept(null) // 重置选中概念
      }
    } catch (err) {
      console.error('❌ API调用异常:', err)
      setError('获取数据失败，已切换到模拟数据')
      setConcepts(getMockData())
      setSelectedConcept(null) // 重置选中概念
    } finally {
      setLoading(false)
    }
  }, [selectedDate, onlyLimitUp]) // 依赖项：当日期或只看涨停状态改变时，重新创建函数

  // 尝试从财联社API获取数据
  // 当 onlyLimitUp 或 selectedDate 状态改变时，重新获取数据
  useEffect(() => {
    fetchLimitUpData()
  }, [fetchLimitUpData])

  // API已经根据 up_limit 参数返回了对应的数据：
  // - up_limit=1: 只返回涨停股票
  // - up_limit=0: 返回所有股票（包括非涨停）
  // 所以不需要在前端再次过滤，直接使用API返回的数据
  const filteredConcepts = concepts

  const currentConcept = selectedConcept
    ? filteredConcepts.find(c => c.name === selectedConcept) || filteredConcepts[0]
    : filteredConcepts[0]

  return (
    <main className="container" style={{ padding: '20px 16px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* 页面标题 */}
      <div className="glass-panel" style={{
        padding: '24px',
        borderRadius: 'var(--radius-lg)',
        marginBottom: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        border: '1px solid var(--glass-border)'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <TrendingUp size={32} color="var(--system-red)" />
            每日板块涨停分析
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: '1rem', color: 'var(--text-secondary)' }}>
            实时追踪A股涨停板，按概念分类展示
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: '500' }}>
            <input
              type="checkbox"
              checked={onlyLimitUp}
              onChange={(e) => setOnlyLimitUp(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--system-blue)' }}
            />
            只看涨停
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: '500' }}>
            <Calendar size={18} color="var(--text-secondary)" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={(() => {
                const today = new Date()
                return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
              })()}
              style={{
                padding: '8px 12px',
                border: '1px solid var(--system-gray5)',
                borderRadius: '8px',
                fontSize: '0.95rem',
                cursor: 'pointer',
                outline: 'none',
                background: 'rgba(255,255,255,0.8)',
                color: 'var(--text-primary)'
              }}
            />
          </label>
          <button
            onClick={fetchLimitUpData}
            disabled={loading}
            className="btn-primary"
            style={{
              padding: '10px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: loading ? 0.7 : 1,
              backgroundColor: loading ? 'var(--system-gray)' : 'var(--system-blue)'
            }}
          >
            <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
            {loading ? '刷新中...' : '刷新数据'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          background: '#fee2e2',
          color: '#dc2626',
          padding: '12px',
          borderRadius: '8px',
          marginBottom: '20px',
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* 概念分类标签 */}
      <div style={{
        background: 'white',
        padding: '16px',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        marginBottom: '20px',
        overflowX: 'auto'
      }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {filteredConcepts.map((concept) => (
            <button
              key={concept.name}
              onClick={() => setSelectedConcept(concept.name)}
              style={{
                padding: '10px 20px',
                background: selectedConcept === concept.name || (!selectedConcept && concept.name === filteredConcepts[0]?.name)
                  ? 'var(--system-blue)'
                  : 'var(--system-gray6)',
                color: selectedConcept === concept.name || (!selectedConcept && concept.name === filteredConcepts[0]?.name)
                  ? 'white'
                  : 'var(--text-primary)',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                fontSize: '0.95rem',
                fontWeight: '600',
                whiteSpace: 'nowrap',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: selectedConcept === concept.name || (!selectedConcept && concept.name === filteredConcepts[0]?.name)
                  ? '0 4px 12px rgba(0, 122, 255, 0.3)'
                  : 'none'
              }}
              onMouseEnter={(e) => {
                if (selectedConcept !== concept.name && (!selectedConcept && concept.name !== filteredConcepts[0]?.name)) {
                  e.currentTarget.style.background = 'var(--system-gray5)'
                }
              }}
              onMouseLeave={(e) => {
                if (selectedConcept !== concept.name && (!selectedConcept && concept.name !== filteredConcepts[0]?.name)) {
                  e.currentTarget.style.background = 'var(--system-gray6)'
                }
              }}
            >
              {concept.name}
              <span style={{
                marginLeft: '6px',
                opacity: 0.7,
                fontSize: '0.85em',
                fontWeight: '400'
              }}>
                {onlyLimitUp ? concept.stocks.length : concept.stockCount}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 当前概念详情 */}
      {currentConcept && (
        <div className="card" style={{
          background: 'var(--bg-card)',
          padding: '24px',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
          border: '1px solid var(--glass-border)'
        }}>
          {/* 概念标题和表现 */}
          <div style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--system-gray5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--text-primary)' }}>
                {currentConcept.name}
              </h2>
              <div style={{
                padding: '6px 16px',
                background: currentConcept.changePercent >= 0 ? 'var(--system-green-light)' : 'var(--system-red-light)',
                color: currentConcept.changePercent >= 0 ? 'var(--system-green)' : 'var(--system-red)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '1rem',
                fontWeight: '700',
                border: `1px solid ${currentConcept.changePercent >= 0 ? 'rgba(52, 199, 89, 0.2)' : 'rgba(255, 59, 48, 0.2)'}`
              }}>
                {currentConcept.changePercent >= 0 ? '+' : ''}{currentConcept.changePercent.toFixed(2)}%
              </div>
            </div>
          </div>

          {/* 驱动因素 */}
          {currentConcept.drivingFactor && (
            <div style={{
              background: 'var(--system-blue-light)',
              padding: '20px',
              borderRadius: 'var(--radius-md)',
              marginBottom: '24px',
              borderLeft: '4px solid var(--system-blue)',
              border: '1px solid rgba(0, 122, 255, 0.1)'
            }}>
              <div style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--system-blue)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BarChart2 size={20} /> 驱动因素
              </div>
              <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)', lineHeight: '1.6' }}>
                {currentConcept.drivingFactor}
              </div>
            </div>
          )}

          {/* 股票列表 */}
          {currentConcept.stocks.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>简称</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>现价</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>涨幅</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>涨停时间</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>流通市值</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>连板</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280', width: '80px' }}>详情</th>
                  </tr>
                </thead>
                <tbody>
                  {currentConcept.stocks.map((stock, index) => {
                    const isExpanded = expandedStocks.has(stock.code)
                    return (
                      <React.Fragment key={stock.code}>
                        <tr
                          style={{
                            borderBottom: isExpanded ? 'none' : '1px solid #e5e7eb',
                            transition: 'background 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#f9fafb'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'white'
                          }}
                        >
                          <td style={{ padding: '12px' }}>
                            <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#1f2937', marginBottom: '4px' }}>
                              {stock.name}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                              {stock.code}
                            </div>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', fontSize: '0.9rem', fontWeight: '600', color: '#1f2937' }}>
                            {stock.currentPrice.toFixed(2)}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>
                            <span style={{
                              fontSize: '0.9rem',
                              fontWeight: '600',
                              color: '#dc2626'
                            }}>
                              +{stock.changePercent.toFixed(2)}%
                            </span>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center', fontSize: '0.85rem', color: '#6b7280' }}>
                            {stock.limitUpTime}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', fontSize: '0.85rem', color: '#6b7280' }}>
                            {stock.marketCap.toFixed(2)}亿
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            {stock.consecutiveDays > 0 && (
                              <span style={{
                                padding: '4px 8px',
                                background: '#fee2e2',
                                color: '#dc2626',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: '600'
                              }}>
                                {stock.consecutiveDays}天{stock.consecutiveDays}板
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            {stock.description && (
                              <button
                                onClick={() => {
                                  const newExpanded = new Set(expandedStocks)
                                  if (isExpanded) {
                                    newExpanded.delete(stock.code)
                                  } else {
                                    newExpanded.add(stock.code)
                                  }
                                  setExpandedStocks(newExpanded)
                                }}
                                style={{
                                  padding: '4px 8px',
                                  background: isExpanded ? '#3b82f6' : '#f3f4f6',
                                  color: isExpanded ? 'white' : '#374151',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '0.75rem',
                                  fontWeight: '500',
                                  transition: 'all 0.2s'
                                }}
                              >
                                {isExpanded ? '收起' : '详情'}
                              </button>
                            )}
                          </td>
                        </tr>
                        {/* 展开的详细描述 */}
                        {isExpanded && stock.description && (
                          <tr>
                            <td colSpan={7} style={{ padding: '0', borderBottom: '1px solid #e5e7eb' }}>
                              <div style={{
                                padding: '12px',
                                background: '#f0f9ff',
                                borderRadius: '0 0 8px 8px',
                                borderLeft: '3px solid #3b82f6',
                                margin: '0 12px 0 12px'
                              }}>
                                <div style={{ fontSize: '0.85rem', color: '#1e3a8a', lineHeight: '1.6' }}>
                                  {stock.description}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              color: '#9ca3af',
              fontSize: '0.9rem'
            }}>
              暂无涨停股票数据
            </div>
          )}
        </div>
      )}

      {/* 数据来源说明 */}
      <div style={{
        marginTop: '20px',
        padding: '16px',
        background: '#f9fafb',
        borderRadius: '8px',
        fontSize: '0.8rem',
        color: '#6b7280',
        textAlign: 'center'
      }}>
        数据来源：财联社 | 更新时间：{new Date().toLocaleString('zh-CN')}
      </div>
    </main>
  )
}

