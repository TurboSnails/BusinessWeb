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

// 带超时和重试的 fetch 包装函数
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 15000, retries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      
      if (response.ok) {
        return response
      }
      
      // 如果不是最后一次尝试，继续重试
      if (attempt < retries) {
        clearTimeout(timeoutId)
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1))) // 递增延迟
        continue
      }
      
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      
      // 如果是最后一次尝试，抛出错误
      if (attempt === retries) {
        throw error
      }
      
      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
    }
  }
  
  throw new Error('请求失败')
}

// 获取美股数据（尝试多个免费 API）
async function fetchUSStock(symbol: string): Promise<StockQuote | null> {
  // 方案1：尝试使用 CORS 代理访问 Yahoo Finance（获取15天数据用于计算RSI）
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=15d`)}`
    
    const response = await fetchWithTimeout(
      proxyUrl,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      },
      12000 // 增加超时时间到12秒
    )
    
    if (response.ok) {
      const data = await response.json()
      const result = data.chart?.result?.[0]
      if (result) {
        const meta = result.meta
        const indicators = result.indicators
        
        // 获取历史价格数据用于计算 RSI
        let historicalPrices: number[] = []
        if (indicators?.adjclose && indicators.adjclose[0]?.adjclose) {
          historicalPrices = indicators.adjclose[0].adjclose.filter((p: number | null) => p !== null && p > 0) as number[]
        } else if (indicators?.quote && indicators.quote[0]?.close) {
          historicalPrices = indicators.quote[0].close.filter((p: number | null) => p !== null && p > 0) as number[]
        }
        
        // 尝试从 indicators 中获取最新价格数据
        let currentPrice = meta.regularMarketPrice
        let previousClose = meta.previousClose || meta.chartPreviousClose
        
        // 如果 meta 中没有价格，尝试从 indicators.quote 获取
        if (!currentPrice && indicators?.quote && indicators.quote[0]?.close) {
          const closes = indicators.quote[0].close
          currentPrice = closes[closes.length - 1] || closes[0] || 0
        }
        
        // 如果 meta 中没有前收盘价，尝试从 indicators.adjclose 获取
        if (!previousClose && indicators?.adjclose && indicators.adjclose[0]?.adjclose) {
          const adjcloses = indicators.adjclose[0].adjclose
          previousClose = adjcloses[adjcloses.length - 2] || adjcloses[0] || currentPrice
        }
        
        // 确保有有效数据
        if (!currentPrice || currentPrice === 0) {
          currentPrice = previousClose || 0
        }
        if (!previousClose || previousClose === 0) {
          previousClose = currentPrice
        }
        
        // 优先使用 API 返回的涨跌幅
        let change = meta.regularMarketChange
        let changePercent = meta.regularMarketChangePercent
        
        // 如果没有直接返回涨跌幅，或者涨跌幅为 0 但价格不同，则重新计算
        if (change === undefined || change === null || changePercent === undefined || changePercent === null) {
          change = currentPrice - previousClose
          changePercent = previousClose && previousClose !== currentPrice ? (change / previousClose) * 100 : 0
        } else {
          // 如果 API 返回的涨跌幅为 0，但价格不同，重新计算
          if (change === 0 && changePercent === 0 && currentPrice !== previousClose) {
            change = currentPrice - previousClose
            changePercent = previousClose ? (change / previousClose) * 100 : 0
            console.log(`Recalculated for ${symbol}: change=${change}, changePercent=${changePercent}`)
          } else {
            // 确保 changePercent 是百分比格式（如果小于 1 可能是小数格式）
            if (Math.abs(changePercent) < 1 && Math.abs(changePercent) > 0) {
              changePercent = changePercent * 100
            }
          }
        }
        
        // 计算 RSI
        let rsi: number | null = null
        if (historicalPrices.length >= 15) {
          rsi = calculateRSI(historicalPrices)
        }
        
        return {
          symbol: symbol,
          name: meta.shortName || meta.longName || symbol,
          price: currentPrice,
          change: change || 0,
          changePercent: changePercent || 0,
          volume: meta.regularMarketVolume,
          market: 'US',
          rsi: rsi || undefined
        }
      }
    }
  } catch (error) {
    console.warn(`Failed to fetch ${symbol} via proxy:`, error)
  }
  
  // 方案2：尝试直接访问（可能因 CORS 失败，但不影响其他请求）
  try {
    const response = await fetchWithTimeout(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=15d`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      },
      5000
    )
    
    if (response.ok) {
      const data = await response.json()
      const result = data.chart?.result?.[0]
      if (result) {
        const meta = result.meta
        const indicators = result.indicators
        
        // 获取历史价格数据用于计算 RSI
        let historicalPrices: number[] = []
        if (indicators?.adjclose && indicators.adjclose[0]?.adjclose) {
          historicalPrices = indicators.adjclose[0].adjclose.filter((p: number | null) => p !== null && p > 0) as number[]
        } else if (indicators?.quote && indicators.quote[0]?.close) {
          historicalPrices = indicators.quote[0].close.filter((p: number | null) => p !== null && p > 0) as number[]
        }
        
        // 尝试从 indicators 中获取最新价格数据
        let currentPrice = meta.regularMarketPrice
        let previousClose = meta.previousClose || meta.chartPreviousClose
        
        // 如果 meta 中没有价格，尝试从 indicators.quote 获取
        if (!currentPrice && indicators?.quote && indicators.quote[0]?.close) {
          const closes = indicators.quote[0].close
          currentPrice = closes[closes.length - 1] || closes[0] || 0
        }
        
        // 如果 meta 中没有前收盘价，尝试从 indicators.adjclose 获取
        if (!previousClose && indicators?.adjclose && indicators.adjclose[0]?.adjclose) {
          const adjcloses = indicators.adjclose[0].adjclose
          previousClose = adjcloses[adjcloses.length - 2] || adjcloses[0] || currentPrice
        }
        
        // 确保有有效数据
        if (!currentPrice || currentPrice === 0) {
          currentPrice = previousClose || 0
        }
        if (!previousClose || previousClose === 0) {
          previousClose = currentPrice
        }
        
        // 优先使用 API 返回的涨跌幅
        let change = meta.regularMarketChange
        let changePercent = meta.regularMarketChangePercent
        
        // 如果没有直接返回涨跌幅，或者涨跌幅为 0 但价格不同，则重新计算
        if (change === undefined || change === null || changePercent === undefined || changePercent === null) {
          change = currentPrice - previousClose
          changePercent = previousClose && previousClose !== currentPrice ? (change / previousClose) * 100 : 0
        } else {
          // 如果 API 返回的涨跌幅为 0，但价格不同，重新计算
          if (change === 0 && changePercent === 0 && currentPrice !== previousClose) {
            change = currentPrice - previousClose
            changePercent = previousClose ? (change / previousClose) * 100 : 0
            console.log(`Recalculated for ${symbol}: change=${change}, changePercent=${changePercent}`)
          } else {
            // 确保 changePercent 是百分比格式（如果小于 1 可能是小数格式）
            if (Math.abs(changePercent) < 1 && Math.abs(changePercent) > 0) {
              changePercent = changePercent * 100
            }
          }
        }
        
        // 计算 RSI
        let rsi: number | null = null
        if (historicalPrices.length >= 15) {
          rsi = calculateRSI(historicalPrices)
        }
        
        return {
          symbol: symbol,
          name: meta.shortName || meta.longName || symbol,
          price: currentPrice,
          change: change || 0,
          changePercent: changePercent || 0,
          volume: meta.regularMarketVolume,
          market: 'US',
          rsi: rsi || undefined
        }
      }
    }
  } catch (error) {
    // CORS 错误，忽略
    console.warn(`Direct fetch failed for ${symbol} (likely CORS):`, error)
  }
  
  return null
}

// 获取中国指数数据
async function fetchChinaIndex(symbol: string, name: string): Promise<StockQuote | null> {
  try {
    // 开发环境使用 Vite proxy，生产环境使用相对路径（如果部署到 Vercel）
    const isDev = import.meta.env.DEV
    const proxyUrl = isDev 
      ? `/api/proxy/list=${symbol}`  // 开发环境：Vite proxy
      : `/api/china-stock?symbol=${symbol}` // 生产环境：相对路径（部署到 Vercel 时）
    
    const response = await fetchWithTimeout(
      proxyUrl,
      { 
        method: 'GET',
        headers: {
          'Accept': '*/*'
        }
      },
      12000 // 增加超时时间到12秒
    )
    
    if (response.ok) {
      const text = await response.text()
      const match = text.match(/="([^"]+)"/)
      if (match && match[1]) {
        const parts = match[1].split(',')
        
        if (parts.length >= 3) {
          // 新浪财经格式：名称,当前价,昨收,今开,最高,最低...
          const currentPrice = parseFloat(parts[1])
          const previousClose = parseFloat(parts[2])
          
          // 检查数据有效性
          if (isNaN(currentPrice) || isNaN(previousClose) || currentPrice === 0 || previousClose === 0) {
            return null
          }
          
          const change = currentPrice - previousClose
          const changePercent = previousClose ? (change / previousClose) * 100 : 0
          
          return {
            symbol: symbol,
            name: name,
            price: currentPrice,
            change: change,
            changePercent: changePercent,
            market: 'CN'
          }
        }
      }
    } else {
      console.warn(`Failed to fetch ${symbol}: ${response.status}`)
    }
  } catch (error) {
    console.warn(`Failed to fetch ${symbol}:`, error)
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
