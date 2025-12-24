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

// CORS 代理配置
const CORS_PROXY_MAIN = (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`
const CORS_PROXY_BACKUP = (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
const CORS_PROXY_THIRD = (url: string) => `https://proxy.cors.sh/${url}`

// Yahoo Finance 用的代理（多个备选）
const YAHOO_PROXIES = [CORS_PROXY_MAIN, CORS_PROXY_BACKUP, CORS_PROXY_THIRD]

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
    }, 12000)  // Yahoo 超时 12 秒
    
    if (!response.ok) throw new Error('Response not ok')
    const data = await response.json()
    return parseYahooData(data, symbol)
  }
  
  try {
    // 竞速：哪个代理先返回用哪个
    const result = await Promise.any(
      YAHOO_PROXIES.map(proxy => fetchFromProxy(proxy))
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

// 东方财富 secid 映射（支持 A股、港股、美股）
const EASTMONEY_SECID_MAP: Record<string, string> = {
  // 中国 A 股
  'sh000001': '1.000001',  // 上证指数
  'sz399001': '0.399001',  // 深证成指
  'sz399006': '0.399006',  // 创业板指
  'sh000300': '1.000300',  // 沪深300
  // 美股
  '^DJI': '100.DJIA',      // 道琼斯
  '^GSPC': '100.SPX',      // 标普500
  '^NDX': '100.NDX',       // 纳斯达克100
  // 港股
  '^HSI': '100.HSI',       // 恒生指数
  '^HSCE': '100.HSCEI',    // 恒生国企
  '^HSTECH': '124.HSTECH', // 恒生科技
  // 其他
  'FTSE_A50': '100.XIN9',  // 富时中国A50
}

// 获取东方财富历史K线数据（用于计算 RSI）
async function fetchEastMoneyHistory(secid: string): Promise<number[]> {
  const historyUrl = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56&klt=101&fqt=1&end=20500101&lmt=20`
  
  try {
    const response = await fetchWithTimeout(CORS_PROXY_MAIN(historyUrl), {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    }, 8000)
    
    if (!response.ok) return []
    const data = await response.json()
    const klines = data?.data?.klines
    if (!klines || !Array.isArray(klines)) return []
    
    // 提取收盘价（格式：日期,开盘,收盘,最高,最低,成交量）
    return klines.map((k: string) => parseFloat(k.split(',')[2])).filter((p: number) => !isNaN(p) && p > 0)
  } catch (error) {
    console.warn('Failed to fetch history:', error)
    return []
  }
}

// 通用东方财富数据获取函数（支持所有市场）
async function fetchFromEastMoney(symbol: string, name: string, market: string): Promise<StockQuote | null> {
  const cacheKey = `em_${symbol}`
  const cached = getCached<StockQuote>(cacheKey)
  if (cached) return cached
  
  const secid = EASTMONEY_SECID_MAP[symbol]
  if (!secid) return null  // 不支持的符号，返回 null 让调用方用 Yahoo
  
  // 并行获取实时数据和历史数据
  const realTimeUrl = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f57,f58,f60,f169,f170`
  
  try {
    const [realTimeRes, historyPrices] = await Promise.all([
      fetchWithTimeout(CORS_PROXY_MAIN(realTimeUrl), {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      }, 10000),
      fetchEastMoneyHistory(secid)
    ])
    
    if (!realTimeRes.ok) return null
    const data = await realTimeRes.json()
    const d = data?.data
    if (!d || !d.f43) return null
    
    const currentPrice = d.f43 / 100
    const previousClose = d.f60 / 100
    const change = d.f169 / 100
    const changePercent = d.f170 / 100
    
    if (!currentPrice || currentPrice === 0) return null
    
    // 计算 RSI
    let rsi: number | undefined
    if (historyPrices.length >= 15) {
      const rsiValue = calculateRSI(historyPrices)
      if (rsiValue !== null) rsi = rsiValue
    }
    
    const result: StockQuote = {
      symbol,
      name,
      price: currentPrice,
      change: change || (currentPrice - previousClose),
      changePercent: changePercent || (previousClose ? ((currentPrice - previousClose) / previousClose) * 100 : 0),
      market,
      rsi
    }
    
    setCache(cacheKey, result)
    return result
  } catch (error) {
    console.warn(`EastMoney failed for ${symbol}:`, error)
    return null
  }
}

// 智能获取数据：优先东方财富，不支持的用 Yahoo
async function fetchStockSmart(symbol: string, name: string, market: string): Promise<StockQuote | null> {
  // 东方财富支持的，优先用东方财富
  if (EASTMONEY_SECID_MAP[symbol]) {
    const result = await fetchFromEastMoney(symbol, name, market)
    if (result) return result
  }
  
  // 东方财富不支持或失败，用 Yahoo Finance
  const yahooResult = await fetchUSStock(symbol)
  if (yahooResult) {
    yahooResult.name = name
    yahooResult.market = market
    return yahooResult
  }
  
  return null
}

// 获取单个市场的数据（支持增量更新）
export async function fetchMarketDataByType(type: 'us' | 'cn' | 'hk'): Promise<StockQuote[]> {
  // 美股指数（纳斯达克用 NDX 因为东方财富没有 IXIC）
  const usIndices = [
    { symbol: '^DJI', name: '道琼斯指数' },
    { symbol: '^GSPC', name: '标普500' },
    { symbol: '^NDX', name: '纳斯达克100' },
    { symbol: '^VIX', name: '恐慌指数(VIX)' }
  ]
  
  const chinaIndices = [
    { symbol: 'sh000001', name: '上证指数' },
    { symbol: 'sz399001', name: '深证成指' },
    { symbol: 'sz399006', name: '创业板指' },
    { symbol: 'sh000300', name: '沪深300' }
  ]
  
  // 港股 + 富时A50（全部用东方财富）
  const hkIndices = [
    { symbol: '^HSI', name: '恒生指数' },
    { symbol: '^HSCE', name: '恒生国企指数' },
    { symbol: '^HSTECH', name: '恒生科技指数' },
    { symbol: 'FTSE_A50', name: '富时中国A50' }
  ]

  try {
    if (type === 'us') {
      // 美股：优先东方财富，VIX 用 Yahoo
      const results = await Promise.allSettled(
        usIndices.map(({ symbol, name }) => fetchStockSmart(symbol, name, 'US'))
      )
      return results.map(r => r.status === 'fulfilled' ? r.value : null).filter((stock): stock is StockQuote => stock !== null)
    } else if (type === 'cn') {
      // 中国：全部用东方财富
      const results = await Promise.allSettled(
        chinaIndices.map(({ symbol, name }) => fetchFromEastMoney(symbol, name, 'CN'))
      )
      return results.map(r => r.status === 'fulfilled' ? r.value : null).filter((stock): stock is StockQuote => stock !== null)
    } else if (type === 'hk') {
      // 港股：全部用东方财富
      const results = await Promise.allSettled(
        hkIndices.map(({ symbol, name }) => fetchStockSmart(symbol, name, 'HK'))
      )
      return results.map(r => r.status === 'fulfilled' ? r.value : null).filter((s): s is StockQuote => s !== null)
    }
    return []
  } catch (error) {
    console.error(`获取${type}数据失败:`, error)
    return []
  }
}

// 获取所有市场数据（保持向后兼容）
export async function fetchMarketData(): Promise<MarketData> {
  try {
    const [usStocks, chinaIndices, hkIndices] = await Promise.all([
      fetchMarketDataByType('us'),
      fetchMarketDataByType('cn'),
      fetchMarketDataByType('hk')
    ])
    
    return {
      usStocks,
      chinaIndices,
      hkIndices,
      timestamp: new Date().toISOString()
    }
  } catch (error) {
    console.error('Error in fetchMarketData:', error)
    return {
      usStocks: [],
      chinaIndices: [],
      hkIndices: [],
      timestamp: new Date().toISOString()
    }
  }
}
