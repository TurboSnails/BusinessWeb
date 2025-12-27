import type { MarketData, StockQuote, SectorData, SectorCategory } from '../types'

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
export async function fetchUSStock(symbol: string): Promise<StockQuote | null> {
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
    // 使用 Promise.allSettled 替代 Promise.any（兼容性更好）
    const results = await Promise.allSettled(
      YAHOO_PROXIES.map(proxy => fetchFromProxy(proxy))
    )
    
    // 找到第一个成功的结果
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        setCache(cacheKey, result.value)
        return result.value
      }
    }
  } catch (error) {
    console.warn(`All proxies failed for ${symbol}:`, error)
  }
  
  return null
}

// 东方财富 secid 映射
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
  'FTSE_A50': '100.XIN9',  // 富时中国A50
  // 全球股市
  'N225': '100.N225',      // 日经225
  'DAX': '100.GDAXI',      // 德国DAX
  'FTSE': '100.FTSE',      // 英国富时100
  'CAC40': '100.FCHI',     // 法国CAC40
  'KOSPI': '100.KS11',     // 韩国KOSPI
  'SENSEX': '100.SENSEX',  // 印度SENSEX
  'ASX200': '100.AS51',    // 澳洲ASX200
  'TSX': '100.TSX',        // 加拿大TSX
  'BVSP': '100.BVSP',      // 巴西BOVESPA
  'RTS': '100.RTS',        // 俄罗斯RTS
  'STOXX50': '100.SX5E',   // 欧洲斯托克50
  'TWII': '100.TWII',      // 台湾加权
  'VNINDEX': '100.VNINDEX', // 越南胡志明
  // 大宗商品
  'GOLD': '101.GC00Y',     // COMEX黄金
  'SILVER': '101.SI00Y',   // COMEX白银
  'COPPER': '101.HG00Y',   // COMEX铜
  // 外汇
  'DXY': '100.UDI',        // 美元指数
  'USDCNH': '133.USDCNH',  // 离岸人民币
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

// 获取单个市场的数据
export async function fetchMarketDataByType(type: 'us' | 'cn' | 'hk' | 'commodity' | 'forex' | 'global'): Promise<StockQuote[]> {
  const dataConfig: Record<string, Array<{ symbol: string; name: string }>> = {
    us: [
      { symbol: '^DJI', name: '道琼斯' },
      { symbol: '^GSPC', name: '标普500' },
      { symbol: '^NDX', name: '纳斯达克' },
      { symbol: '^VIX', name: 'VIX恐慌' }
    ],
    cn: [
      { symbol: 'sh000001', name: '上证指数' },
      { symbol: 'sz399001', name: '深证成指' },
      { symbol: 'sz399006', name: '创业板指' },
      { symbol: 'sh000300', name: '沪深300' }
    ],
    hk: [
      { symbol: '^HSI', name: '恒生指数' },
      { symbol: '^HSCE', name: '恒生国企' },
      { symbol: '^HSTECH', name: '恒生科技' },
      { symbol: 'FTSE_A50', name: '富时A50' }
    ],
    global: [
      { symbol: 'N225', name: '🇯🇵 日经225' },
      { symbol: 'DAX', name: '🇩🇪 德国DAX' },
      { symbol: 'FTSE', name: '🇬🇧 英国富时' },
      { symbol: 'CAC40', name: '🇫🇷 法国CAC' },
      { symbol: 'STOXX50', name: '🇪🇺 欧洲50' },
      { symbol: 'KOSPI', name: '🇰🇷 韩国KOSPI' },
      { symbol: 'TWII', name: '🇹🇼 台湾加权' },
      { symbol: 'SENSEX', name: '🇮🇳 印度SENSEX' },
      { symbol: 'ASX200', name: '🇦🇺 澳洲ASX' },
      { symbol: 'TSX', name: '🇨🇦 加拿大TSX' },
      { symbol: 'BVSP', name: '🇧🇷 巴西BOVESPA' },
      { symbol: 'RTS', name: '🇷🇺 俄罗斯RTS' },
      { symbol: 'VNINDEX', name: '🇻🇳 越南胡志明' },
    ],
    commodity: [
      { symbol: 'GOLD', name: '黄金' },
      { symbol: 'SILVER', name: '白银' },
      { symbol: 'CL=F', name: 'WTI原油' },      // Yahoo
      { symbol: 'BTC-USD', name: '比特币' }     // Yahoo
    ],
    forex: [
      { symbol: 'DXY', name: '美元指数' },
      { symbol: 'USDCNH', name: '离岸人民币' },
      { symbol: '^TNX', name: '10Y美债' }       // Yahoo
    ]
  }
  
  const indices = dataConfig[type] || []
  const marketMap: Record<string, string> = {
    us: 'US', cn: 'CN', hk: 'HK', commodity: 'COMMODITY', forex: 'FOREX', global: 'GLOBAL'
  }

  try {
    const results = await Promise.allSettled(
      indices.map(({ symbol, name }) => fetchStockSmart(symbol, name, marketMap[type]))
    )
    return results
      .map(r => r.status === 'fulfilled' ? r.value : null)
      .filter((stock): stock is StockQuote => stock !== null)
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

// 获取板块数据（行业板块或概念板块）- 获取更多数据以便筛选
async function fetchSectorData(type: 'industry' | 'concept', limit = 100): Promise<SectorData[]> {
  const cacheKey = `sector_${type}_${limit}`
  const cached = getCached<SectorData[]>(cacheKey)
  if (cached) return cached

  // 行业板块: m:90+t:2, 概念板块: m:90+t:3
  const fs = type === 'industry' ? 'm:90+t:2' : 'm:90+t:3'
  const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=${limit}&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=${fs}`

  try {
    const response = await fetchWithTimeout(CORS_PROXY_MAIN(url), {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    }, 10000)

    if (!response.ok) {
      console.warn(`Failed to fetch ${type} sectors: HTTP ${response.status}`)
      return []
    }
    const data = await response.json()
    const diff = data?.data?.diff
    if (!diff || !Array.isArray(diff)) {
      console.warn(`Failed to fetch ${type} sectors: invalid data format`, data)
      return []
    }
    
    console.log(`获取${type === 'industry' ? '行业' : '概念'}板块数据: ${diff.length}条`)

    const sectors: SectorData[] = diff.map((item: any) => ({
      code: item.f12 || '',           // 板块代码
      name: item.f14 || '',           // 板块名称
      price: (item.f2 || 0) / 100,   // 最新价（需要除以100）
      change: (item.f4 || 0) / 100,   // 涨跌额
      changePercent: item.f3 || 0,   // 涨跌幅（百分比）
      volume: item.f5 || 0,           // 成交量
      // f6字段单位是元，需要转换为万元
      // 例如：388763590000元 = 38876359万元 = 3887.6亿
      amount: (item.f6 || 0) / 10000,  // 成交额（从元转换为万元）
      stockCount: item.f104 || 0,      // 成分股数量
      upCount: item.f105 || 0,         // 上涨家数
      downCount: item.f106 || 0,       // 下跌家数
      rsi: undefined                   // RSI 稍后计算
    })).filter((s: SectorData) => s.name && s.code)
    
    // 为前10个板块计算RSI（避免请求过多）
    const topSectors = sectors.slice(0, 10)
    const rsiPromises = topSectors.map(async (sector) => {
      try {
        // 板块代码格式：BK0737，需要转换为secid格式
        // 板块secid格式：90.BK0737
        const secid = `90.${sector.code}`
        const historyPrices = await fetchEastMoneyHistory(secid)
        if (historyPrices.length >= 15) {
          const rsiValue = calculateRSI(historyPrices)
          if (rsiValue !== null) {
            sector.rsi = rsiValue
          }
        }
      } catch (error) {
        // 忽略RSI计算错误
      }
      return sector
    })
    
    await Promise.allSettled(rsiPromises)

    // 按涨跌幅排序（降序）
    sectors.sort((a, b) => b.changePercent - a.changePercent)
    
    setCache(cacheKey, sectors)
    return sectors
  } catch (error) {
    console.warn(`Failed to fetch ${type} sectors:`, error)
    return []
  }
}

// 获取美股板块数据（使用行业ETF和主题ETF）
async function fetchUSSectorData(): Promise<SectorData[]> {
  const cacheKey = 'us_sectors'
  const cached = getCached<SectorData[]>(cacheKey)
  if (cached) return cached

  // 美股主要行业和主题ETF列表
  const usSectors = [
    { symbol: 'XLK', name: '科技' },      // Technology Select Sector SPDR
    { symbol: 'XLF', name: '金融' },      // Financial Select Sector SPDR
    { symbol: 'XLV', name: '医疗' },      // Health Care Select Sector SPDR
    { symbol: 'XLE', name: '能源' },      // Energy Select Sector SPDR
    { symbol: 'XLI', name: '工业' },      // Industrial Select Sector SPDR
    { symbol: 'XLP', name: '消费必需品' }, // Consumer Staples Select Sector SPDR
    { symbol: 'XLY', name: '消费可选' },  // Consumer Discretionary Select Sector SPDR
    { symbol: 'XLB', name: '材料' },      // Materials Select Sector SPDR
    { symbol: 'XLU', name: '公用事业' },   // Utilities Select Sector SPDR
    { symbol: 'XLRE', name: '房地产' },   // Real Estate Select Sector SPDR
    { symbol: 'XLC', name: '通信服务' },   // Communication Services Select Sector SPDR
    { symbol: 'ARKK', name: '创新科技' }, // ARK Innovation ETF
    { symbol: 'SOXX', name: '半导体' },   // iShares Semiconductor ETF
    { symbol: 'IBB', name: '生物科技' },  // iShares Biotechnology ETF
    { symbol: 'XOP', name: '油气勘探' },  // SPDR S&P Oil & Gas Exploration & Production ETF
    { symbol: 'GDX', name: '黄金矿业' },  // VanEck Gold Miners ETF
    { symbol: 'XRT', name: '零售' },      // SPDR S&P Retail ETF
    { symbol: 'ITB', name: '建筑' },      // iShares U.S. Home Construction ETF
    { symbol: 'XES', name: '油气设备' },  // SPDR S&P Oil & Gas Equipment & Services ETF
    { symbol: 'XHB', name: '房屋建筑' },  // SPDR S&P Homebuilders ETF
    { symbol: 'XME', name: '金属矿业' },  // SPDR S&P Metals & Mining ETF
    { symbol: 'XPH', name: '制药' },      // SPDR S&P Pharmaceuticals ETF
    { symbol: 'XSW', name: '软件' },       // SPDR S&P Software & Services ETF
    { symbol: 'XWEB', name: '互联网' },   // SPDR S&P Internet ETF
    { symbol: 'XHS', name: '医疗设备' },   // SPDR S&P Health Care Equipment ETF
    { symbol: 'XAR', name: '航空航天' },   // SPDR S&P Aerospace & Defense ETF
    { symbol: 'XNTK', name: '网络安全' }, // SPDR NYSE Technology ETF
    { symbol: 'XHE', name: '医疗保健' },   // SPDR S&P Health Care Equipment ETF
    { symbol: 'XSD', name: '半导体设备' }, // SPDR S&P Semiconductor ETF
    { symbol: 'XTL', name: '电信' },      // SPDR S&P Telecom ETF
  ]

  try {
    const results = await Promise.allSettled(
      usSectors.map(async ({ symbol, name }) => {
        const stock = await fetchUSStock(symbol)
        if (!stock) return null
        
        return {
          code: symbol,
          name: name,
          price: stock.price,
          change: stock.change,
          changePercent: stock.changePercent,
          volume: stock.volume || 0,
          amount: 0, // Yahoo Finance 不提供成交额
          stockCount: 0, // 需要额外API获取
          upCount: 0,
          downCount: 0,
          rsi: stock.rsi // 使用ETF的RSI
        } as SectorData
      })
    )

    const sectors: SectorData[] = results
      .map(r => r.status === 'fulfilled' ? r.value : null)
      .filter((s): s is SectorData => s !== null && s.name !== undefined)

    // 按涨跌幅排序（降序）
    sectors.sort((a, b) => b.changePercent - a.changePercent)
    
    setCache(cacheKey, sectors)
    return sectors
  } catch (error) {
    console.warn('Failed to fetch US sectors:', error)
    return []
  }
}

// 获取板块数据（包含行业和概念，分别显示上涨和下跌前15）
export async function fetchSectorCategories(): Promise<SectorCategory[]> {
  try {
    const [industryData, conceptData] = await Promise.all([
      fetchSectorData('industry', 100),  // 获取更多数据以便筛选（确保有足够的下跌板块）
      fetchSectorData('concept', 100)
    ])

    // 分别筛选上涨和下跌的板块
    const getTopSectors = (data: SectorData[], count = 15) => {
      // 上涨板块：按涨幅降序，取前count个
      const up = data
        .filter(s => s.changePercent > 0)
        .sort((a, b) => b.changePercent - a.changePercent)
        .slice(0, count)
      
      // 下跌板块：按跌幅升序（最跌的在前面），取前count个
      const down = data
        .filter(s => s.changePercent < 0)
        .sort((a, b) => a.changePercent - b.changePercent)
        .slice(0, count)
      
      return { up, down }
    }

    const industry = getTopSectors(industryData, 15)
    const concept = getTopSectors(conceptData, 15)

    console.log('板块数据统计:', {
      industry: { total: industryData.length, up: industry.up.length, down: industry.down.length },
      concept: { total: conceptData.length, up: concept.up.length, down: concept.down.length }
    })

    return [
      {
        type: 'industry',
        title: '行业板块',
        icon: '🏭',
        color: '#3b82f6',
        bgColor: '#eff6ff',
        data: [...industry.up, ...industry.down]  // 先显示上涨，再显示下跌
      },
      {
        type: 'concept',
        title: '概念板块',
        icon: '💡',
        color: '#8b5cf6',
        bgColor: '#faf5ff',
        data: [...concept.up, ...concept.down]  // 先显示上涨，再显示下跌
      }
    ]
  } catch (error) {
    console.error('Failed to fetch sector categories:', error)
    return []
  }
}

// 获取美股板块数据（包含行业和主题）
// 延迟函数
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// 获取 CBOE P/C Ratio 数据
export async function fetchCBOEPCRatios(): Promise<{ equityPC: number | null; spxPC: number | null }> {
  const cacheKey = 'cboe_pc_ratios'
  const cached = getCached<{ equityPC: number | null; spxPC: number | null }>(cacheKey)
  if (cached) return cached

  // CBOE 每日市场统计页面
  const cboeUrl = 'https://www.cboe.com/us/options/market_statistics/daily/'
  
  // 尝试多个 CORS 代理，并多次重试（等待页面动态加载）
  const proxies = [CORS_PROXY_MAIN, CORS_PROXY_BACKUP, CORS_PROXY_THIRD]
  let equityPC: number | null = null
  let spxPC: number | null = null
  
  // 最多尝试 3 次，每次间隔 2 秒（等待页面加载）
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      console.log(`等待页面加载... (尝试 ${attempt + 1}/3)`)
      await delay(2000) // 等待 2 秒让页面加载数据
    }
    
    for (const proxy of proxies) {
      try {
        console.log(`尝试使用代理获取 CBOE 数据 (尝试 ${attempt + 1}/3)...`)
        const response = await fetchWithTimeout(proxy(cboeUrl), {
          method: 'GET',
          headers: { 'Accept': 'text/html' }
        }, 20000) // 增加超时时间到 20 秒

        if (response.ok) {
          const html = await response.text()
          console.log(`成功获取 CBOE 页面，HTML 长度: ${html.length}`)
          
          // 解析数据
          const result = parseCBOEHTML(html)
          
          // 如果找到了数据，直接返回
          if (result.equityPC !== null && result.spxPC !== null) {
            console.log('成功解析数据:', result)
            const finalResult = { equityPC: result.equityPC, spxPC: result.spxPC }
            setCache(cacheKey, finalResult)
            return finalResult
          }
          
          // 如果部分找到，保存并继续尝试
          if (result.equityPC !== null) equityPC = result.equityPC
          if (result.spxPC !== null) spxPC = result.spxPC
        } else {
          console.warn('代理返回 HTTP', response.status)
        }
      } catch (error) {
        console.warn('代理请求失败:', error)
        continue
      }
    }
    
    // 如果已经找到部分数据，可以提前返回
    if (equityPC !== null && spxPC !== null) {
      break
    }
  }

  const result = { equityPC, spxPC }
  if (equityPC !== null || spxPC !== null) {
    setCache(cacheKey, result)
  }
  return result
}

// 解析 CBOE HTML 的函数
function parseCBOEHTML(html: string): { equityPC: number | null; spxPC: number | null } {
  let equityPC: number | null = null
  let spxPC: number | null = null

  // 方法1: 查找 "EQUITY PUT/CALL RATIO" 和 "SPX + SPXW PUT/CALL RATIO"（根据实际表格）
  // 表格格式可能是：EQUITY PUT/CALL RATIO 后面跟着数值，或者在同一行
  const equityPatterns = [
    // 精确匹配：EQUITY PUT/CALL RATIO 后面跟着数值（可能在同一行或下一行）
    /EQUITY\s+PUT[\/\s]?CALL\s+RATIO[\s\S]{0,500}?(\d+\.\d{2,3})/i,
    /EQUITY\s+P\/C\s+RATIO[\s\S]{0,500}?(\d+\.\d{2,3})/i,
    // 匹配表格单元格：<td>EQUITY PUT/CALL RATIO</td><td>0.64</td>
    /<td[^>]*>[\s]*EQUITY\s+PUT[\/\s]?CALL\s+RATIO[\s]*<\/td>[\s\S]{0,200}?<td[^>]*>[\s]*(\d+\.\d{2,3})[\s]*<\/td>/i,
    // 匹配表格行：<tr>...EQUITY...0.64...</tr>
    /<tr[^>]*>[\s\S]{0,500}?EQUITY[\s\S]{0,200}?PUT[\/\s]?CALL[\s\S]{0,200}?RATIO[\s\S]{0,500}?(\d+\.\d{2,3})[\s\S]{0,500}?<\/tr>/i,
    // 宽松匹配
    /Equity\s+Put[\/\s]?Call\s+Ratio[\s\S]{0,500}?(\d+\.\d{2,3})/i
  ]
  
  for (const pattern of equityPatterns) {
    const match = html.match(pattern)
    if (match && match[1]) {
      const value = parseFloat(match[1])
      if (value > 0 && value < 10) {
        equityPC = value
        console.log('找到 Equity P/C Ratio:', equityPC, '使用模式:', pattern.source.substring(0, 50))
        break
      }
    }
  }

  const spxPatterns = [
    // 精确匹配：SPX + SPXW PUT/CALL RATIO
    /SPX\s*\+\s*SPXW\s+PUT[\/\s]?CALL\s+RATIO[\s\S]{0,500}?(\d+\.\d{2,3})/i,
    /SPX\s*\+\s*SPXW\s+P\/C\s+RATIO[\s\S]{0,500}?(\d+\.\d{2,3})/i,
    // 匹配表格单元格
    /<td[^>]*>[\s]*SPX\s*\+\s*SPXW\s+PUT[\/\s]?CALL\s+RATIO[\s]*<\/td>[\s\S]{0,200}?<td[^>]*>[\s]*(\d+\.\d{2,3})[\s]*<\/td>/i,
    // 匹配表格行
    /<tr[^>]*>[\s\S]{0,500}?SPX[\s\S]{0,100}?\+[\s\S]{0,100}?SPXW[\s\S]{0,200}?PUT[\/\s]?CALL[\s\S]{0,200}?RATIO[\s\S]{0,500}?(\d+\.\d{2,3})[\s\S]{0,500}?<\/tr>/i,
    // 备用匹配
    /SPX.*?PUT[\/\s]?CALL\s+RATIO[\s\S]{0,500}?(\d+\.\d{2,3})/i,
    /INDEX\s+PUT[\/\s]?CALL\s+RATIO[\s\S]{0,500}?(\d+\.\d{2,3})/i
  ]
  
  for (const pattern of spxPatterns) {
    const match = html.match(pattern)
    if (match && match[1]) {
      const value = parseFloat(match[1])
      if (value > 0 && value < 10) {
        spxPC = value
        console.log('找到 SPX P/C Ratio:', spxPC, '使用模式:', pattern.source.substring(0, 50))
        break
      }
    }
  }

  // 方法2: 查找表格中的 P/C Ratio 数据（更精确的匹配）
  // 尝试匹配表格行，包含 "Equity" 或 "SPX" 以及数值
  if (!equityPC || !spxPC) {
    const tableRowPattern = /<tr[^>]*>[\s\S]*?(?:Equity|SPX|Index)[\s\S]*?(\d+\.\d{2,3})[\s\S]*?<\/tr>/gi
    let match
    while ((match = tableRowPattern.exec(html)) !== null) {
      const row = match[0]
      const value = parseFloat(match[1])
      
      if (value > 0 && value < 10) {
        if (row.match(/Equity/i) && !equityPC) {
          equityPC = value
        } else if ((row.match(/SPX/i) || row.match(/Index/i)) && !spxPC) {
          spxPC = value
        }
      }
    }
  }

  // 方法3: 查找包含 "Equity" 和 "P/C" 或 "Put/Call" 的行（更宽松的匹配）
  if (!equityPC) {
    const equityPatterns2 = [
      /Equity[\s\S]{0,200}?Put[\/\s]?Call[\s\S]{0,200}?(\d+\.\d{2,3})/i,
      /Equity[\s\S]{0,200}?P\/C[\s\S]{0,200}?(\d+\.\d{2,3})/i,
      /Equity[\s\S]{0,500}?(\d+\.\d{2,3})/i
    ]
    
    for (const pattern of equityPatterns2) {
      const match = html.match(pattern)
      if (match && match[1]) {
        const value = parseFloat(match[1])
        if (value > 0 && value < 10) {
          equityPC = value
          break
        }
      }
    }
  }

  // 方法4: 查找包含 "SPX" 或 "Index" 和 "P/C" 的行
  if (!spxPC) {
    const spxPatterns2 = [
      /SPX[\s\S]{0,200}?Put[\/\s]?Call[\s\S]{0,200}?(\d+\.\d{2,3})/i,
      /SPX[\s\S]{0,200}?P\/C[\s\S]{0,200}?(\d+\.\d{2,3})/i,
      /Index[\s\S]{0,200}?Put[\/\s]?Call[\s\S]{0,200}?(\d+\.\d{2,3})/i,
      /Index[\s\S]{0,200}?P\/C[\s\S]{0,200}?(\d+\.\d{2,3})/i
    ]
    
    for (const pattern of spxPatterns2) {
      const match = html.match(pattern)
      if (match && match[1]) {
        const value = parseFloat(match[1])
        if (value > 0 && value < 10) {
          spxPC = value
          break
        }
      }
    }
  }

  // 方法5: 查找所有可能的数值，然后根据上下文判断
  if (!equityPC || !spxPC) {
    const numberMatches = html.match(/\b(\d+\.\d{2,3})\b/g)
    if (numberMatches) {
      const values = [...new Set(numberMatches.map(m => parseFloat(m)))]
        .filter(v => v > 0 && v < 10 && v.toString().split('.')[1]?.length >= 2)
        .sort((a, b) => a - b)
      
      // 查找这些数值附近的上下文
      for (const value of values) {
        const valueStr = value.toString()
        const index = html.indexOf(valueStr)
        if (index > -1) {
          const context = html.substring(Math.max(0, index - 100), Math.min(html.length, index + 100))
          
          if (!equityPC && context.match(/Equity/i)) {
            equityPC = value
          }
          if (!spxPC && (context.match(/SPX/i) || context.match(/Index/i))) {
            spxPC = value
          }
        }
      }
    }
  }

  return { equityPC, spxPC }
}

export async function fetchUSSectorCategories(): Promise<SectorCategory[]> {
  try {
    const usSectorData = await fetchUSSectorData()
    
    // 分别筛选上涨和下跌的板块
    const getTopSectors = (data: SectorData[], count = 15) => {
      const up = data.filter(s => s.changePercent > 0).slice(0, count)
      const down = data.filter(s => s.changePercent < 0).slice(-count).reverse()
      return { up, down }
    }

    const sectors = getTopSectors(usSectorData, 15)

    return [
      {
        type: 'industry',
        title: '美股行业板块',
        icon: '🇺🇸',
        color: '#3b82f6',
        bgColor: '#eff6ff',
        data: [...sectors.up, ...sectors.down]
      }
    ]
  } catch (error) {
    console.error('Failed to fetch US sector categories:', error)
    return []
  }
}
