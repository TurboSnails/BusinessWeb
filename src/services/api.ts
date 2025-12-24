import type { MarketData, StockQuote } from '../types'

// 计算 RSI 指数（14周期）
function calculateRSI(prices: number[], period = 14): number | null {
  if (prices.length < period + 1) {
    return null
  }
  
  const changes: number[] = []
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1])
  }
  
  // 分离上涨和下跌
  const gains = changes.map(change => change > 0 ? change : 0)
  const losses = changes.map(change => change < 0 ? Math.abs(change) : 0)
  
  // 计算初始平均收益和平均损失
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period
  
  // 如果平均损失为0，RSI为100
  if (avgLoss === 0) {
    return 100
  }
  
  // 使用 Wilder's Smoothing 方法计算后续值
  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period
  }
  
  // 计算 RS 和 RSI
  const rs = avgGain / avgLoss
  const rsi = 100 - (100 / (1 + rs))
  
  return Math.round(rsi * 100) / 100 // 保留两位小数
}

export async function fetchExample(): Promise<{ message: string }> {
  // placeholder for real API calls
  return new Promise((resolve) => setTimeout(() => resolve({ message: 'hello from api' }), 300))
}

// 简单缓存：避免短时间内重复请求
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 30000 // 30秒缓存

function getCached<T>(key: string): T | null {
  const cached = cache.get(key)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T
  }
  return null
}

function setCache(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() })
}

// 带超时的 fetch（不重试，快速失败）
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 8000): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

// 解析 Yahoo Finance 数据
function parseYahooData(data: any, symbol: string): StockQuote | null {
  const result = data.chart?.result?.[0]
  if (!result) return null
  
  const meta = result.meta
  const indicators = result.indicators
  
  // 获取历史价格数据用于计算 RSI
  let historicalPrices: number[] = []
  if (indicators?.adjclose && indicators.adjclose[0]?.adjclose) {
    historicalPrices = indicators.adjclose[0].adjclose.filter((p: number | null) => p !== null && p > 0) as number[]
  } else if (indicators?.quote && indicators.quote[0]?.close) {
    historicalPrices = indicators.quote[0].close.filter((p: number | null) => p !== null && p > 0) as number[]
  }
  
  let currentPrice = meta.regularMarketPrice
  let previousClose = meta.previousClose || meta.chartPreviousClose
  
  if (!currentPrice && indicators?.quote && indicators.quote[0]?.close) {
    const closes = indicators.quote[0].close
    currentPrice = closes[closes.length - 1] || closes[0] || 0
  }
  
  if (!previousClose && indicators?.adjclose && indicators.adjclose[0]?.adjclose) {
    const adjcloses = indicators.adjclose[0].adjclose
    previousClose = adjcloses[adjcloses.length - 2] || adjcloses[0] || currentPrice
  }
  
  if (!currentPrice || currentPrice === 0) currentPrice = previousClose || 0
  if (!previousClose || previousClose === 0) previousClose = currentPrice
  
  let change = meta.regularMarketChange
  let changePercent = meta.regularMarketChangePercent
  
  if (change === undefined || change === null || changePercent === undefined || changePercent === null) {
    change = currentPrice - previousClose
    changePercent = previousClose && previousClose !== currentPrice ? (change / previousClose) * 100 : 0
  } else if (change === 0 && changePercent === 0 && currentPrice !== previousClose) {
    change = currentPrice - previousClose
    changePercent = previousClose ? (change / previousClose) * 100 : 0
  } else if (Math.abs(changePercent) < 1 && Math.abs(changePercent) > 0) {
    changePercent = changePercent * 100
  }
  
  let rsi: number | null = null
  if (historicalPrices.length >= 15) {
    rsi = calculateRSI(historicalPrices)
  }
  
  return {
    symbol,
    name: meta.shortName || meta.longName || symbol,
    price: currentPrice,
    change: change || 0,
    changePercent: changePercent || 0,
    volume: meta.regularMarketVolume,
    market: 'US',
    rsi: rsi || undefined
  }
}

// 多个 CORS 代理，竞速获取
const CORS_PROXIES = [
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
]

// 获取美股数据 - 竞速模式
async function fetchUSStock(symbol: string): Promise<StockQuote | null> {
  // 检查缓存
  const cacheKey = `us_${symbol}`
  const cached = getCached<StockQuote>(cacheKey)
  if (cached) return cached
  
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=15d`
  
  // 创建多个代理请求，竞速返回
  const fetchFromProxy = async (proxyFn: (url: string) => string): Promise<StockQuote | null> => {
    const response = await fetchWithTimeout(proxyFn(yahooUrl), {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    }, 6000)
    
    if (!response.ok) throw new Error('Response not ok')
    const data = await response.json()
    return parseYahooData(data, symbol)
  }
  
  try {
    // 竞速：哪个代理先返回用哪个
    const result = await Promise.any(
      CORS_PROXIES.map(proxy => fetchFromProxy(proxy))
    )
    if (result) {
      setCache(cacheKey, result)
      return result
    }
  } catch (error) {
    console.warn(`All proxies failed for ${symbol}:`, error)
  }
  
  return null
}

// 解析新浪财经数据
function parseSinaData(text: string, symbol: string, name: string): StockQuote | null {
  const match = text.match(/="([^"]+)"/)
  if (match && match[1]) {
    const parts = match[1].split(',')
    if (parts.length >= 3) {
      const currentPrice = parseFloat(parts[1])
      const previousClose = parseFloat(parts[2])
      
      if (isNaN(currentPrice) || isNaN(previousClose) || currentPrice === 0 || previousClose === 0) {
        return null
      }
      
      const change = currentPrice - previousClose
      const changePercent = previousClose ? (change / previousClose) * 100 : 0
      
      return {
        symbol,
        name,
        price: currentPrice,
        change,
        changePercent,
        market: 'CN'
      }
    }
  }
  return null
}

// 获取中国指数数据 - 竞速模式
async function fetchChinaIndex(symbol: string, name: string): Promise<StockQuote | null> {
  const cacheKey = `cn_${symbol}`
  const cached = getCached<StockQuote>(cacheKey)
  if (cached) return cached
  
  const sinaUrl = `https://hq.sinajs.cn/list=${symbol}`
  
  // 开发环境用 Vite proxy
  if (import.meta.env.DEV) {
    try {
      const response = await fetchWithTimeout(`/api/proxy/list=${symbol}`, { 
        method: 'GET',
        headers: { 'Accept': '*/*' }
      }, 6000)
      
      if (response.ok) {
        const text = await response.text()
        const result = parseSinaData(text, symbol, name)
        if (result) {
          setCache(cacheKey, result)
          return result
        }
      }
    } catch (error) {
      console.warn(`Dev proxy failed for ${symbol}:`, error)
    }
    return null
  }
  
  // 生产环境用 CORS 代理竞速
  const fetchFromProxy = async (proxyFn: (url: string) => string): Promise<StockQuote | null> => {
    const response = await fetchWithTimeout(proxyFn(sinaUrl), {
      method: 'GET',
      headers: { 'Accept': '*/*' }
    }, 6000)
    
    if (!response.ok) throw new Error('Response not ok')
    const text = await response.text()
    const result = parseSinaData(text, symbol, name)
    if (!result) throw new Error('Parse failed')
    return result
  }
  
  try {
    const result = await Promise.any(
      CORS_PROXIES.map(proxy => fetchFromProxy(proxy))
    )
    if (result) {
      setCache(cacheKey, result)
      return result
    }
  } catch (error) {
    console.warn(`All proxies failed for CN ${symbol}:`, error)
  }
  
  return null
}

// 带超时的 Promise 包装
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error('请求超时')), timeoutMs)
    )
  ])
}

// 获取单个市场的数据（支持增量更新）
export async function fetchMarketDataByType(type: 'us' | 'cn' | 'hk'): Promise<StockQuote[]> {
  const usIndices = [
    { symbol: '^DJI', name: '道琼斯指数' },
    { symbol: '^GSPC', name: '标普500' },
    { symbol: '^IXIC', name: '纳斯达克' },
    { symbol: '^VIX', name: '恐慌指数(VIX)' }
  ]
  
  const chinaIndices = [
    { symbol: 'sh000001', name: '上证指数' },
    { symbol: 'sz399001', name: '深证成指' },
    { symbol: 'sz399006', name: '创业板指' },
    { symbol: 'sh000300', name: '沪深300' }
  ]
  
  const hkIndices = [
    { symbol: '^HSI', name: '恒生指数' },
    { symbol: '^HSCE', name: '恒生国企指数' },
    { symbol: '^HSTECH', name: '恒生科技指数' }
  ]
  
  const ftseA50Symbols = [
    { symbol: 'XIN9.F', name: '富时中国A50' },
    { symbol: '^FTXIN25', name: '富时中国A50' },
    { symbol: 'CN50.F', name: '富时中国A50' }
  ]

  try {
    if (type === 'us') {
      const results = await Promise.allSettled(
        usIndices.map(({ symbol, name }) => fetchUSStock(symbol).then(stock => {
          if (stock) stock.name = name
          return stock
        }))
      )
      return results.map(r => r.status === 'fulfilled' ? r.value : null).filter((stock): stock is StockQuote => stock !== null)
    } else if (type === 'cn') {
      const results = await Promise.allSettled(
        chinaIndices.map(({ symbol, name }) => fetchChinaIndex(symbol, name))
      )
      return results.map(r => r.status === 'fulfilled' ? r.value : null).filter((stock): stock is StockQuote => stock !== null)
    } else if (type === 'hk') {
      const [hkResults, ftseResults] = await Promise.allSettled([
        Promise.allSettled(hkIndices.map(({ symbol, name }) => fetchUSStock(symbol).then(stock => {
          if (stock) {
            stock.name = name
            stock.market = 'HK'
          }
          return stock
        }))).then(results => results.map(r => r.status === 'fulfilled' ? r.value : null)),
        Promise.allSettled(ftseA50Symbols.map(({ symbol, name }) => fetchUSStock(symbol).then(stock => {
          if (stock && stock.price > 0) {
            stock.name = name
            stock.market = 'HK'
            return stock
          }
          return null
        }))).then(results => {
          const successful = results.find(r => r.status === 'fulfilled' && r.value !== null && r.value.price > 0)
          return successful ? [successful.value] : []
        })
      ])
      
      const hkData = hkResults.status === 'fulfilled' ? hkResults.value.filter((s): s is StockQuote => s !== null) : []
      const ftseData = ftseResults.status === 'fulfilled' ? ftseResults.value.filter((s): s is StockQuote => s !== null) : []
      return [...hkData, ...ftseData]
    }
    return []
  } catch (error) {
    console.error(`获取${type}数据失败:`, error)
    return []
  }
}

// 获取所有市场数据（保持向后兼容）
export async function fetchMarketData(): Promise<MarketData> {
  // 美股主要指数 + 恐慌指数
  const usIndices = [
    { symbol: '^DJI', name: '道琼斯指数' },
    { symbol: '^GSPC', name: '标普500' },
    { symbol: '^IXIC', name: '纳斯达克' },
    { symbol: '^VIX', name: '恐慌指数(VIX)' }
  ]
  
  // 中国主要指数
  const chinaIndices = [
    { symbol: 'sh000001', name: '上证指数' },
    { symbol: 'sz399001', name: '深证成指' },
    { symbol: 'sz399006', name: '创业板指' },
    { symbol: 'sh000300', name: '沪深300' }
  ]
  
  // 香港主要指数
  const hkIndices = [
    { symbol: '^HSI', name: '恒生指数' },
    { symbol: '^HSCE', name: '恒生国企指数' },
    { symbol: '^HSTECH', name: '恒生科技指数' }
  ]
  
  // 富时中国A50 - 尝试多个可能的符号
  // 注意：Yahoo Finance 可能没有直接的富时中国A50指数
  // 可以使用期货合约 XIN9.F 或其他符号
  const ftseA50Symbols = [
    { symbol: 'XIN9.F', name: '富时中国A50' }, // 富时中国A50期货
    { symbol: '^FTXIN25', name: '富时中国A50' }, // 备用符号
    { symbol: 'CN50.F', name: '富时中国A50' } // 另一个可能的符号
  ]
  
  try {
    // 为整个请求添加总超时（20秒，给更多时间）
    return await withTimeout(
      (async () => {
        // 并行获取所有数据，即使部分失败也继续
        // 使用 Promise.allSettled 确保即使部分失败也能继续
        const [usIndicesData, chinaData, hkData, ftseA50Data] = await Promise.allSettled([
          Promise.allSettled(usIndices.map(({ symbol, name }) => fetchUSStock(symbol).then(stock => {
            // 使用中文名称覆盖
            if (stock) {
              stock.name = name
            }
            return stock
          }))).then(results =>
            results.map(r => r.status === 'fulfilled' ? r.value : null)
          ),
          Promise.allSettled(chinaIndices.map(({ symbol, name }) => fetchChinaIndex(symbol, name))).then(results =>
            results.map(r => r.status === 'fulfilled' ? r.value : null)
          ),
          Promise.allSettled(hkIndices.map(({ symbol, name }) => fetchUSStock(symbol).then(stock => {
            // 使用中文名称覆盖，并设置市场为 HK
            if (stock) {
              stock.name = name
              stock.market = 'HK'
            }
            return stock
          }))).then(results =>
            results.map(r => r.status === 'fulfilled' ? r.value : null)
          ),
          // 富时中国A50 - 尝试多个符号，取第一个成功的
          Promise.allSettled(ftseA50Symbols.map(({ symbol, name }) => fetchUSStock(symbol).then(stock => {
            if (stock && stock.price > 0) {
              stock.name = name
              stock.market = 'HK'
              return stock
            }
            return null
          }))).then(results => {
            // 只返回第一个成功的结果
            const successful = results.find(r => r.status === 'fulfilled' && r.value !== null && r.value.price > 0)
            return successful ? [successful.value] : []
          })
        ])
        
        const usIndicesResult = usIndicesData.status === 'fulfilled' 
          ? usIndicesData.value.filter((stock): stock is StockQuote => stock !== null)
          : []
        
        const chinaDataResult = chinaData.status === 'fulfilled'
          ? chinaData.value.filter((stock): stock is StockQuote => stock !== null)
          : []
        
        const hkDataResult = hkData.status === 'fulfilled'
          ? hkData.value.filter((stock): stock is StockQuote => stock !== null)
          : []
        
        const ftseA50Result = ftseA50Data.status === 'fulfilled'
          ? ftseA50Data.value.filter((stock): stock is StockQuote => stock !== null)
          : []
        
        // 将富时中国A50添加到香港指数列表中
        const allHkIndices = [...hkDataResult, ...ftseA50Result]
        
        // 调试日志 - 显示获取到的数据统计
        console.log('数据获取统计:', {
          美股: usIndicesResult.length,
          中国: chinaDataResult.length,
          香港: allHkIndices.length,
          总计: usIndicesResult.length + chinaDataResult.length + allHkIndices.length
        })
        
        // 即使所有请求都失败，也返回空数组而不是抛出错误
        return {
          usStocks: usIndicesResult,
          chinaIndices: chinaDataResult,
          hkIndices: allHkIndices,
          timestamp: new Date().toISOString()
        }
      })(),
      20000 // 20秒总超时，给更多时间
    )
  } catch (error) {
    // 如果超时或发生其他错误，返回空数据
    console.error('Error in fetchMarketData:', error)
    return {
      usStocks: [],
      chinaIndices: [],
      timestamp: new Date().toISOString()
    }
  }
}
