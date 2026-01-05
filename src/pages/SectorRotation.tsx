import React, { useState, useEffect, useCallback } from 'react'

interface SectorData {
  name: string
  code: string // 板块代码
  changePercent: number
  rank: number
  date: string
}

interface SectorDetail {
  name: string
  code: string // 板块代码
  changePercent: number
  date: string
  rank: number
  timesInTop10: number // 近1个月排进前10的次数
}

interface HotStock {
  code: string // 股票代码
  name: string // 股票名称
  price: number // 最新价
  changePercent: number // 涨跌幅
  volume: number // 成交量
  amount: number // 成交额
}

export default function SectorRotation(): JSX.Element {
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [sectorDataByDate, setSectorDataByDate] = useState<Record<string, SectorData[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSector, setSelectedSector] = useState<SectorDetail | null>(null)
  const [hotStocks, setHotStocks] = useState<HotStock[]>([])
  const [loadingHotStocks, setLoadingHotStocks] = useState(false)
  const [filterType, setFilterType] = useState<'industry' | 'concept'>('industry')
  const [sortBy, setSortBy] = useState<'change' | 'rank'>('change')
  const [topN, setTopN] = useState<number>(10)

  // CORS代理配置
  const CORS_PROXY_MAIN = (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`
  const CORS_PROXY_BACKUP = (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
  const CORS_PROXY_THIRD = (url: string) => `https://proxy.cors.sh/${url}`
  const CORS_PROXIES = [CORS_PROXY_MAIN, CORS_PROXY_BACKUP, CORS_PROXY_THIRD]

  // 初始化日期列表（最近7个交易日，跳过周末和节假日）
  useEffect(() => {
    // 中国节假日列表（2025-2026年）
    const holidays = [
      // 2025年节假日
      '2025-01-01', // 元旦
      '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31', // 春节
      '2025-02-03', '2025-02-04', '2025-02-05', '2025-02-06', '2025-02-07',
      '2025-04-04', '2025-04-05', '2025-04-06', // 清明节
      '2025-05-01', '2025-05-02', '2025-05-03', '2025-05-04', '2025-05-05', // 劳动节
      '2025-05-31', // 端午节
      '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-04', '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08', // 国庆节
      // 2026年节假日
      '2026-01-01', '2026-01-02', '2026-01-03', // 元旦
      '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-21', '2026-02-22', // 春节
      '2026-04-04', '2026-04-05', '2026-04-06', // 清明节
      '2026-05-01', '2026-05-02', '2026-05-03', // 劳动节
      '2026-06-19', '2026-06-20', '2026-06-21', '2026-06-22', // 端午节
      '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', // 国庆节
    ]

    const dates: string[] = []
    const today = new Date()
    let count = 0
    let currentDate = new Date(today)
    
    // 获取最近7个交易日（跳过周末和节假日）
    while (dates.length < 7 && count < 21) {
      const dayOfWeek = currentDate.getDay()
      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`
      
      // 跳过周末和节假日
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidays.includes(dateStr)) {
        dates.push(dateStr)
      }
      currentDate.setDate(currentDate.getDate() - 1)
      count++
    }
    
    setSelectedDates(dates)
  }, [])

  // 获取单个日期的板块数据（使用财联社API，支持历史日期）
  const fetchSectorData = useCallback(async (date: string): Promise<SectorData[]> => {
    const dateStr = date.replace(/-/g, '')
    // 财联社API支持历史日期参数
    const apiUrl = `https://x-quote.cls.cn/v2/quote/a/plate/up_down_analysis?up_limit=0&date=${dateStr}`
    
    console.log(`📅 获取${filterType === 'industry' ? '行业' : '概念'}板块数据，日期: ${date}`)
    
    const fetchFromProxy = async (proxyFn: (url: string) => string): Promise<any> => {
      const proxyUrl = proxyFn(apiUrl)
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
      
      if (contentType.includes('application/json')) {
        return await response.json()
      } else {
        const html = await response.text()
        // 尝试从HTML中提取JSON
        const scriptMatch = 
          html.match(/<script[^>]*>[\s\S]*?window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/i) ||
          html.match(/<script[^>]*>[\s\S]*?var\s+data\s*=\s*({[\s\S]*?});/i) ||
          html.match(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i)
        
        if (scriptMatch && scriptMatch[1]) {
          return JSON.parse(scriptMatch[1])
        }
        throw new Error('无法从HTML中提取JSON')
      }
    }

    // 尝试多个代理
    for (const proxy of CORS_PROXIES) {
      try {
        const data = await fetchFromProxy(proxy)
        
        // 财联社API返回格式：{ code: 200, data: { plate_stock: [...] } }
        if (data?.code === 200 && data?.data?.plate_stock) {
          const plateStockData = data.data.plate_stock
          
          // 根据类型过滤板块数据
          // 行业板块：名称不包含"概念"、"题材"、"主题"
          // 概念板块：名称包含"概念"、"题材"、"主题"
          const filteredData = plateStockData.filter((plate: any) => {
            const name = String(plate.secu_name || plate.name || '')
            
            if (filterType === 'industry') {
              return !name.includes('概念') && !name.includes('题材') && !name.includes('主题')
            } else {
              return name.includes('概念') || name.includes('题材') || name.includes('主题')
            }
          })
          
          console.log(`📊 ${filterType === 'industry' ? '行业' : '概念'}板块过滤: ${filteredData.length} 个 (总共 ${plateStockData.length} 个)`)
          
          // 解析板块数据
          const sectors: SectorData[] = filteredData
            .map((plate: any) => ({
              name: plate.secu_name || '',
              code: plate.secu_code || plate.code || '', // 板块代码
              changePercent: parseFloat(plate.change || 0) * 100, // 转换为百分比
              rank: 0, // 稍后排序后设置
              date: date
            }))
            .filter((s: SectorData) => s.name) // 过滤掉空名称
            .sort((a: SectorData, b: SectorData) => b.changePercent - a.changePercent)
            .map((sector: SectorData, index: number) => ({
              ...sector,
              rank: index + 1
            }))
            .slice(0, topN) // 只取前N名
          
          console.log(`✅ ${filterType === 'industry' ? '行业' : '概念'}板块数据: ${sectors.length} 个`)
          
          return sectors
        }
      } catch (err) {
        console.warn(`代理 ${proxy} 失败:`, err)
        continue
      }
    }
    
    return []
  }, [topN, filterType])

  // 获取所有日期的数据
  useEffect(() => {
    if (selectedDates.length === 0) return

    const fetchAllDates = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const dataPromises = selectedDates.map(date => fetchSectorData(date))
        const results = await Promise.allSettled(dataPromises)
        
        const dataByDate: Record<string, SectorData[]> = {}
        
        results.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value && result.value.length > 0) {
            // 只保留有数据的日期
            dataByDate[selectedDates[index]] = result.value
          } else {
            console.warn(`获取 ${selectedDates[index]} 的数据失败或无数据:`, result.status === 'fulfilled' ? '空数据' : result.reason)
            // 不添加到 dataByDate，这样渲染时就不会显示该列
          }
        })
        
        setSectorDataByDate(dataByDate)
        
      } catch (err) {
        console.error('获取数据失败:', err)
        setError('获取数据失败，请稍后重试')
      } finally {
        setLoading(false)
      }
    }

    fetchAllDates()
  }, [selectedDates, fetchSectorData, filterType])

  // 获取板块热门股票
  const fetchHotStocks = useCallback(async (sectorCode: string): Promise<HotStock[]> => {
    // 东方财富板块成分股API
    // fs=b:板块代码，例如 b:BK0478
    const apiUrl = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=20&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=b:${sectorCode}`
    
    const fetchFromProxy = async (proxyFn: (url: string) => string): Promise<any> => {
      const proxyUrl = proxyFn(apiUrl)
      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      return await response.json()
    }

    // 尝试多个代理
    for (const proxy of CORS_PROXIES) {
      try {
        const data = await fetchFromProxy(proxy)
        
        if (data?.data?.diff && Array.isArray(data.data.diff)) {
          const diff = data.data.diff
          
          // 解析股票数据
          // f12: 股票代码
          // f14: 股票名称
          // f2: 最新价（需要除以100）
          // f3: 涨跌幅（百分比）
          // f5: 成交量
          // f6: 成交额（元，需要转换为万元）
          const stocks: HotStock[] = diff
            .map((item: any) => ({
              code: item.f12 || '',
              name: item.f14 || '',
              price: (item.f2 || 0) / 100,
              changePercent: item.f3 || 0,
              volume: item.f5 || 0,
              amount: (item.f6 || 0) / 10000 // 转换为万元
            }))
            .filter((s: HotStock) => s.name && s.code)
            .sort((a: HotStock, b: HotStock) => b.changePercent - a.changePercent) // 按涨跌幅排序
          
          return stocks
        }
      } catch (err) {
        console.warn(`获取热门股票失败 (代理 ${proxy}):`, err)
        continue
      }
    }
    
    return []
  }, [])

  // 处理板块点击
  const handleSectorClick = async (sector: SectorData) => {
    // 计算该板块在已获取的日期中排进前N名的次数
    // 注意：这里统计的是已获取的日期，不是真正的"近1个月"
    let timesInTopN = 0
    Object.values(sectorDataByDate).forEach(sectors => {
      // 检查该板块是否在该日期的前N名中
      const found = sectors.find(s => s.name === sector.name && s.code === sector.code)
      if (found && found.rank <= topN) {
        timesInTopN++
      }
    })
    
    setSelectedSector({
      name: sector.name,
      code: sector.code,
      changePercent: sector.changePercent,
      date: sector.date,
      rank: sector.rank,
      timesInTop10: timesInTopN
    })
    
    // 获取该板块的热门股票
    if (sector.code) {
      setLoadingHotStocks(true)
      try {
        const stocks = await fetchHotStocks(sector.code)
        setHotStocks(stocks)
      } catch (err) {
        console.error('获取热门股票失败:', err)
        setHotStocks([])
      } finally {
        setLoadingHotStocks(false)
      }
    }
  }

  // 格式化日期显示
  const formatDateDisplay = (date: string): string => {
    const d = new Date(date)
    const month = d.getMonth() + 1
    const day = d.getDate()
    return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  // 格式化完整日期
  const formatFullDate = (date: string): string => {
    return date
  }

  return (
    <main className="container" style={{ padding: '20px 16px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* 页面标题 */}
      <div style={{
        background: 'white',
        padding: '20px',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        marginBottom: '20px'
      }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '2rem' }}>🔄</span>
          板块轮动
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: '0.9rem', color: '#6b7280' }}>
          追踪各板块在不同日期的涨幅排名，识别市场热点轮动
        </p>
      </div>

      {/* 筛选栏 */}
      <div style={{
        background: 'white',
        padding: '16px',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.9rem', color: '#6b7280' }}>类型:</span>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as 'industry' | 'concept')}
            style={{
              padding: '6px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.9rem',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="industry">行业</option>
            <option value="concept">概念</option>
          </select>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.9rem', color: '#6b7280' }}>排序:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'change' | 'rank')}
            style={{
              padding: '6px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.9rem',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="change">涨幅</option>
            <option value="rank">排名</option>
          </select>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.9rem', color: '#6b7280' }}>显示:</span>
          <select
            value={topN}
            onChange={(e) => setTopN(Number(e.target.value))}
            style={{
              padding: '6px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.9rem',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value={10}>前10名</option>
            <option value={15}>前15名</option>
            <option value={20}>前20名</option>
          </select>
        </div>
      </div>

      {error && (
        <div style={{
          background: '#fee2e2',
          color: '#dc2626',
          padding: '12px',
          borderRadius: '8px',
          marginBottom: '20px',
          fontSize: '0.9rem'
        }}>
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          color: '#6b7280',
          fontSize: '0.9rem'
        }}>
          加载中...
        </div>
      ) : (
        <>
          {/* 板块轮动表格 */}
          {(() => {
            // 只显示有数据的日期列
            const validDates = selectedDates.filter(date => sectorDataByDate[date] && sectorDataByDate[date].length > 0)
            
            if (validDates.length === 0) {
              return (
                <div style={{
                  padding: '40px',
                  textAlign: 'center',
                  color: '#9ca3af',
                  fontSize: '0.9rem'
                }}>
                  暂无数据
                </div>
              )
            }
            
            return (
              <div style={{
                background: 'white',
                padding: '20px',
                borderRadius: '12px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                marginBottom: '20px',
                overflowX: 'auto'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280', width: '60px' }}>排名</th>
                      {validDates.map(date => (
                        <th key={date} style={{ padding: '12px', textAlign: 'center', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280', minWidth: '150px' }}>
                          {formatDateDisplay(date)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: topN }, (_, rankIndex) => {
                      const rank = rankIndex + 1
                      return (
                        <tr key={rank} style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            {rank <= 3 ? (
                              <span style={{
                                display: 'inline-block',
                                width: '28px',
                                height: '28px',
                                lineHeight: '28px',
                                background: '#dc2626',
                                color: 'white',
                                borderRadius: '4px',
                                fontSize: '0.85rem',
                                fontWeight: '600'
                              }}>
                                {rank}
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.9rem', color: '#6b7280' }}>{rank}</span>
                            )}
                          </td>
                          {validDates.map(date => {
                            const sectors = sectorDataByDate[date] || []
                            const sector = sectors[rank - 1]
                        return (
                          <td key={date} style={{ padding: '12px', textAlign: 'center' }}>
                            {sector ? (
                              <div
                                onClick={() => handleSectorClick(sector)}
                                style={{
                                  cursor: 'pointer',
                                  padding: '8px',
                                  borderRadius: '6px',
                                  transition: 'background 0.2s',
                                  background: selectedSector?.name === sector.name && selectedSector?.date === date ? '#eff6ff' : 'transparent'
                                }}
                                onMouseEnter={(e) => {
                                  if (!(selectedSector?.name === sector.name && selectedSector?.date === date)) {
                                    e.currentTarget.style.background = '#f9fafb'
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!(selectedSector?.name === sector.name && selectedSector?.date === date)) {
                                    e.currentTarget.style.background = 'transparent'
                                  }
                                }}
                              >
                                <div style={{ fontSize: '0.85rem', fontWeight: '500', color: '#1f2937', marginBottom: '4px' }}>
                                  {sector.name}
                                </div>
                                <div style={{
                                  fontSize: '0.9rem',
                                  fontWeight: '600',
                                  color: '#dc2626'
                                }}>
                                  +{sector.changePercent.toFixed(2)}%
                                </div>
                              </div>
                            ) : (
                              <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>-</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
            )
          })()}

          {/* 选中板块详情和热门股票 */}
          {selectedSector && (
            <div style={{
              background: 'white',
              padding: '20px',
              borderRadius: '12px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
            }}>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: '600', color: '#1f2937', marginBottom: '8px' }}>
                  {selectedSector.name} <span style={{ color: '#dc2626' }}>+{selectedSector.changePercent.toFixed(2)}%</span>
                </div>
                <div style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '4px' }}>
                  {formatFullDate(selectedSector.date)} 排名{selectedSector.rank}
                </div>
                <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                  已获取日期中 {selectedSector.timesInTop10} 次排进前{topN}
                </div>
              </div>
              
              {/* 热门股票列表 */}
              <div style={{ marginTop: '20px' }}>
                <div style={{ fontSize: '1rem', fontWeight: '600', color: '#1f2937', marginBottom: '12px' }}>
                  🔥 热门股票
                </div>
                {loadingHotStocks ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280', fontSize: '0.9rem' }}>
                    加载中...
                  </div>
                ) : hotStocks.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                          <th style={{ padding: '10px', textAlign: 'left', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>股票名称</th>
                          <th style={{ padding: '10px', textAlign: 'right', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>最新价</th>
                          <th style={{ padding: '10px', textAlign: 'right', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>涨跌幅</th>
                          <th style={{ padding: '10px', textAlign: 'right', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>成交量</th>
                          <th style={{ padding: '10px', textAlign: 'right', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>成交额(万)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hotStocks.map((stock, index) => (
                          <tr 
                            key={stock.code}
                            style={{ 
                              borderBottom: '1px solid #e5e7eb',
                              transition: 'background 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#f9fafb'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'white'
                            }}
                          >
                            <td style={{ padding: '10px' }}>
                              <div style={{ fontSize: '0.9rem', fontWeight: '500', color: '#1f2937' }}>
                                {stock.name}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                                {stock.code}
                              </div>
                            </td>
                            <td style={{ padding: '10px', textAlign: 'right', fontSize: '0.9rem', color: '#1f2937' }}>
                              {stock.price.toFixed(2)}
                            </td>
                            <td style={{ padding: '10px', textAlign: 'right' }}>
                              <span style={{
                                fontSize: '0.9rem',
                                fontWeight: '600',
                                color: stock.changePercent >= 0 ? '#dc2626' : '#16a34a'
                              }}>
                                {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                              </span>
                            </td>
                            <td style={{ padding: '10px', textAlign: 'right', fontSize: '0.85rem', color: '#6b7280' }}>
                              {(stock.volume / 10000).toFixed(2)}万手
                            </td>
                            <td style={{ padding: '10px', textAlign: 'right', fontSize: '0.85rem', color: '#6b7280' }}>
                              {stock.amount.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '0.9rem' }}>
                    暂无热门股票数据
                  </div>
                )}
              </div>
            </div>
          )}
        </>
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

