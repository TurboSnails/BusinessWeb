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
      { symbol: '^IRX', name: '2Y美债' },      // Yahoo Finance - 2年期美债
      { symbol: '^TNX', name: '10Y美债' }       // Yahoo Finance - 10年期美债
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

// 财报日历数据类型
export interface EarningsCalendarItem {
  symbol: string
  name: string
  date: string
  time: string // '盘前' | '盘后' | '盘中' | ''
  epsEstimate?: string
  epsActual?: string
  revenueEstimate?: string
  revenueActual?: string
  marketCap?: string
  country?: string // 国家代码，用于显示国旗
  url?: string
}

// 获取财报日历数据
export async function fetchEarningsCalendar(days: number = 7): Promise<EarningsCalendarItem[]> {
  const cacheKey = `earnings_calendar_${days}`
  const cached = getCached<EarningsCalendarItem[]>(cacheKey)
  if (cached) return cached

  // Investing.com 财报日历页面
  const url = `https://cn.investing.com/earnings-calendar/`
  
  try {
    // 尝试使用 CORS 代理获取数据
    console.log('开始获取财报日历数据...')
    const response = await fetchWithTimeout(CORS_PROXY_MAIN(url), {
      method: 'GET',
      headers: { 'Accept': 'text/html' }
    }, 20000) // 增加到20秒，因为HTML解析可能需要更长时间

    if (!response.ok) {
      console.warn('Failed to fetch earnings calendar:', response.status)
      return []
    }

    const html = await response.text()
    console.log('获取到 HTML，长度:', html.length)
    
    const earnings = parseEarningsCalendarHTML(html, days)
    console.log('解析结果:', earnings.length, '条数据')
    
    if (earnings.length > 0) {
      setCache(cacheKey, earnings)
      return earnings
    } else {
      console.warn('解析后没有找到财报数据')
      return []
    }
  } catch (error) {
    console.warn('Failed to fetch earnings calendar:', error)
    return []
  }
}

// 辅助函数：从URL路径中提取股票代码
function extractStockSymbol(urlPath: string): string {
  // 排除EARNINGS、INC等后缀，提取真正的股票代码
  const parts = urlPath.split(/[-,\s]/)
  for (const part of parts) {
    const cleanPart = part.toUpperCase().replace(/[^A-Z0-9]/g, '')
    // 股票代码通常是2-5个字符，不包含EARNINGS、INC等
    if (cleanPart.length >= 2 && cleanPart.length <= 5 && 
        !cleanPart.includes('EARNINGS') && 
        !cleanPart.includes('INC') && 
        !cleanPart.includes('FIN') &&
        !cleanPart.includes('SERV') &&
        !cleanPart.includes('CO') &&
        !cleanPart.includes('CORP')) {
      return cleanPart
    }
  }
  // 如果没找到，返回第一部分（去掉特殊字符）
  return parts[0].toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 5)
}

// 解析 Investing.com 财报日历 HTML
function parseEarningsCalendarHTML(html: string, days: number): EarningsCalendarItem[] {
  const earnings: EarningsCalendarItem[] = []
  
  try {
    console.log('开始解析财报日历 HTML，长度:', html.length)
    
    // 先检查是否包含财报相关的关键词
    if (!html.includes('earnings') && !html.includes('财报') && !html.includes('equities')) {
      console.warn('HTML中未找到财报相关关键词')
    }
    
    // 方法1: 尝试匹配表格行（多种模式）
    const patterns = [
      // 模式1: data-pair-id（最精确）
      /<tr[^>]*data-pair-id="(\d+)"[^>]*>[\s\S]*?<\/tr>/gi,
      // 模式2: 包含 earnings 相关的 tr
      /<tr[^>]*class="[^"]*earnings[^"]*"[^>]*>[\s\S]*?<\/tr>/gi,
      // 模式3: 包含股票链接的 tr（更宽松）
      /<tr[^>]*>[\s\S]*?<a[^>]*href="[^"]*equities[^"]*"[^>]*>[\s\S]*?<\/tr>/gi,
      // 模式4: 包含 rev_actual 或 eps_actual 的行（根据用户提供的HTML结构）
      /<tr[^>]*>[\s\S]*?rev_actual[\s\S]*?<\/tr>/gi,
      // 模式5: 通用表格行（包含日期格式）
      /<tr[^>]*>[\s\S]*?\d{4}-\d{2}-\d{2}[\s\S]*?<\/tr>/gi,
      // 模式6: 任何包含多个td的行（最宽松）
      /<tr[^>]*>[\s\S]{200,}?<\/tr>/gi
    ]
    
    for (let patternIndex = 0; patternIndex < patterns.length; patternIndex++) {
      const pattern = patterns[patternIndex]
      let match
      let count = 0
      const foundRows: string[] = []
      
      console.log(`尝试模式 ${patternIndex + 1}/${patterns.length}`)
      
      while ((match = pattern.exec(html)) !== null && count < 100) {
        count++
        const row = match[0]
        foundRows.push(row.substring(0, 200)) // 保存前200字符用于调试
        
        // 提取股票代码和名称 - 多种方式
        let symbol = ''
        let name = ''
        let date = ''
        let time = ''
        let epsEstimate = ''
        let revenueEstimate = ''
        let marketCap = ''
        
        // 先提取日期，避免日期被误认为是公司名称
        // 提取日期 - 多种格式
        const datePatterns = [
          /data-date="([^"]+)"/i,
          /(\d{4}-\d{2}-\d{2})/,
          /(\d{2}\/\d{2}\/\d{4})/,
          /(\d{4}\.\d{2}\.\d{2})/
        ]
        for (const dp of datePatterns) {
          const dm = row.match(dp)
          if (dm) {
            date = dm[1]
            break
          }
        }
        
        // 优先从特定字段提取中文名称（这些字段通常更可靠）
        // 根据HTML结构：<td title="3M公司"> 或 <span class="earnCalCompanyName">3M公司</span>
        
        // 1. 优先从 title 属性提取（最可靠）
        // 匹配模式：title="..." 中的内容，可能包含中文
        const titleMatches = [
          row.match(/title="([^"]+)"/i), // 标准格式
          row.match(/title='([^']+)'/i),  // 单引号格式
        ]
        
        for (const titleMatch of titleMatches) {
          if (titleMatch && titleMatch[1]) {
            const titleName = titleMatch[1].trim().replace(/&nbsp;/g, ' ')
            console.log('🔍 找到title属性:', titleName, '包含中文:', /[\u4e00-\u9fa5]/.test(titleName))
            
            // 如果包含中文，直接使用
            if (/[\u4e00-\u9fa5]/.test(titleName)) {
              const countryNames = ['美国', '英国', '中国', '日本', '韩国', '德国', '法国', '印度', '香港', '台湾', '年', '月', '日', '星期', '公司']
              const isDate = titleName.match(/\d{4}年|\d{1,2}月|\d{1,2}日|星期/i)
              const isCountry = countryNames.some(country => titleName === country)
              
              if (!isDate && !isCountry && titleName.length > 1) {
                name = titleName
                console.log('✅ 从title属性提取中文名称:', titleName)
                break
              }
            }
          }
        }
        
        // 2. 如果title没有中文，从 earnCalCompanyName span 提取
        if (!name || !/[\u4e00-\u9fa5]/.test(name)) {
          // 匹配 <span class="...earnCalCompanyName...">内容</span>
          const spanMatches = [
            row.match(/<span[^>]*class="[^"]*earnCalCompanyName[^"]*"[^>]*>([^<]+)<\/span>/i),
            row.match(/<span[^>]*class='[^']*earnCalCompanyName[^']*'[^>]*>([^<]+)<\/span>/i),
            row.match(/<span[^>]*>([^<]*[\u4e00-\u9fa5][^<]*)<\/span>/i), // 任何包含中文的span
          ]
          
          for (const spanMatch of spanMatches) {
            if (spanMatch && spanMatch[1]) {
              const spanName = spanMatch[1].trim().replace(/&nbsp;/g, ' ')
              console.log('🔍 找到span内容:', spanName, '包含中文:', /[\u4e00-\u9fa5]/.test(spanName))
              
              if (/[\u4e00-\u9fa5]/.test(spanName)) {
                const countryNames = ['美国', '英国', '中国', '日本', '韩国', '德国', '法国', '印度', '香港', '台湾', '年', '月', '日', '星期', '公司']
                const isDate = spanName.match(/\d{4}年|\d{1,2}月|\d{1,2}日|星期/i)
                const isCountry = countryNames.some(country => spanName === country)
                
                if (!isDate && !isCountry && spanName.length > 1) {
                  name = spanName
                  console.log('✅ 从span提取中文名称:', spanName)
                  break
                }
              }
            }
          }
        }
        
        // 3. 其他可能的字段（作为后备）
        if (!name || !/[\u4e00-\u9fa5]/.test(name)) {
          const chineseNamePatterns = [
            { pattern: /data-name-zh="([^"]+)"/i, name: 'data-name-zh' },
            { pattern: /data-chinese-name="([^"]+)"/i, name: 'data-chinese-name' },
            { pattern: /data-cn-name="([^"]+)"/i, name: 'data-cn-name' },
            { pattern: /data-name-cn="([^"]+)"/i, name: 'data-name-cn' },
            { pattern: /data-zh="([^"]+)"/i, name: 'data-zh' },
            { pattern: /data-full-name="([^"]*[\u4e00-\u9fa5][^"]*)"/i, name: 'data-full-name' },
            { pattern: /data-company-name="([^"]*[\u4e00-\u9fa5][^"]*)"/i, name: 'data-company-name' },
            { pattern: /data-company="([^"]*[\u4e00-\u9fa5][^"]*)"/i, name: 'data-company' },
            { pattern: /data-stock-name="([^"]*[\u4e00-\u9fa5][^"]*)"/i, name: 'data-stock-name' },
            { pattern: /data-text="([^"]*[\u4e00-\u9fa5][^"]*)"/i, name: 'data-text' },
            { pattern: /aria-label="([^"]*[\u4e00-\u9fa5][^"]*)"/i, name: 'aria-label' },
          ]
          
          for (const { pattern, name: fieldName } of chineseNamePatterns) {
            const match = row.match(pattern)
            if (match && match[1]) {
              const candidateName = match[1].trim().replace(/&nbsp;/g, ' ')
              const countryNames = ['美国', '英国', '中国', '日本', '韩国', '德国', '法国', '印度', '香港', '台湾', '年', '月', '日', '星期']
              const isDate = candidateName.match(/\d{4}年|\d{1,2}月|\d{1,2}日|星期/i)
              const isCountry = countryNames.some(country => candidateName === country)
              
              if (!isDate && !isCountry && candidateName.length > 1 && /[\u4e00-\u9fa5]/.test(candidateName)) {
                name = candidateName
                console.log('✅ 从特定字段提取中文名称:', candidateName, '字段:', fieldName)
                break
              }
            }
          }
        }
        
        // 从链接中提取股票代码（但不覆盖已找到的中文名称）
        // 格式可能是：<a href="...">PNC金融服务集团</a> 或 <a href="...">MMM</a>
        const linkMatch = row.match(/<a[^>]*href="[^"]*equities\/([^"\/\?]+)[^"]*"[^>]*>([^<]+)<\/a>/i)
        if (linkMatch) {
          let linkSymbol = linkMatch[1].toUpperCase()
          // 清理URL中的参数
          linkSymbol = linkSymbol.split('?')[0].split('&')[0]
          let linkName = linkMatch[2].trim().replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')
          
          // 排除日期格式的内容
          if (linkName.match(/\d{4}年|\d{1,2}月|\d{1,2}日|星期|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/i)) {
            linkName = ''
          }
          
          // 从URL中提取股票代码
          if (!symbol) {
            symbol = extractStockSymbol(linkSymbol)
          }
          
          // 如果链接文本包含中文，且还没有中文名称，则使用
          if (linkName && linkName.length > 0 && /[\u4e00-\u9fa5]/.test(linkName)) {
            // 排除单独的"公司"字
            if (linkName !== '公司' && linkName.length > 1) {
              if (!name || !/[\u4e00-\u9fa5]/.test(name)) {
                name = linkName
                console.log('✅ 从链接提取中文名称:', linkName)
              }
            }
          } else if (linkName && linkName.length > 0) {
            // 如果链接文本是英文，且还没有找到任何名称，才使用英文作为后备
            if (!name || name.length === 0) {
              name = linkName
              console.log('⚠️ 使用链接中的英文名称作为后备:', linkName)
            }
          }
        }
        
        // 如果链接中没有找到名称，尝试从第一个td单元格中提取
        if (!name || name.length === 0) {
          // 查找第一个包含链接的td
          const firstTdWithLink = row.match(/<td[^>]*>([\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?)<\/td>/i)
          if (firstTdWithLink && firstTdWithLink[2]) {
            const cellLinkText = firstTdWithLink[2].trim().replace(/&nbsp;/g, ' ')
            if (cellLinkText && cellLinkText !== '公司' && cellLinkText.length > 1) {
              name = cellLinkText
              console.log('从td中的链接提取公司名称:', cellLinkText)
            }
          }
        }
        
        // 如果还是没有，尝试从span标签中提取（但排除单独的"公司"）
        if (!name || name.length === 0) {
          const spanMatch = row.match(/<span[^>]*>([^<]+)<\/span>/i)
          if (spanMatch && spanMatch[1]) {
            const spanText = spanMatch[1].trim().replace(/&nbsp;/g, ' ')
            // 排除日期、国家名称和单独的"公司"
            const countryNames = ['美国', '英国', '中国', '日本', '韩国', '德国', '法国', '印度', '香港', '台湾', '年', '月', '日', '星期', '公司']
            const isDate = spanText.match(/\d{4}年|\d{1,2}月|\d{1,2}日|星期/i)
            const isCountry = countryNames.some(country => spanText === country)
            
            if (!isDate && !isCountry && spanText.length > 1) {
              name = spanText
              console.log('从span提取公司名称:', spanText)
            }
          }
        }
        
        // 尝试从 data 属性提取（优先中文）
        const dataNameMatch = row.match(/data-name="([^"]+)"/i)
        if (dataNameMatch) {
          const dataName = dataNameMatch[1].trim().replace(/&nbsp;/g, ' ')
          // 排除日期和国家名称
          const countryNames = ['美国', '英国', '中国', '日本', '韩国', '德国', '法国', '印度', '香港', '台湾', '年', '月', '日', '星期']
          const isDate = dataName.match(/\d{4}年|\d{1,2}月|\d{1,2}日|星期/i)
          const isCountry = countryNames.some(country => dataName === country || dataName.startsWith(country + ' '))
          
          if (!isDate && !isCountry) {
            // 如果data-name包含中文，优先使用
            if (/[\u4e00-\u9fa5]/.test(dataName)) {
              if (!name || !/[\u4e00-\u9fa5]/.test(name)) {
                name = dataName
              }
            } else if (!name) {
              name = dataName
            }
          }
        }
        
        // 如果还没有中文名称，尝试从表格单元格中提取（排除日期列）
        if (!name || !/[\u4e00-\u9fa5]/.test(name)) {
          // 查找包含中文的单元格内容（排除日期格式）
          // 优先查找第一个td（通常是公司名称列）
          // 匹配格式：<td>中文名称 (SYMBOL)</td> 或 <td>中文名称</td>
          const firstTdMatch = row.match(/<td[^>]*>([^<]*[\u4e00-\u9fa5][^<]*)<\/td>/i)
          if (firstTdMatch) {
            const cellContent = firstTdMatch[1].trim().replace(/&nbsp;/g, ' ')
            // 排除日期格式
            if (!cellContent.match(/\d{4}年|\d{1,2}月|\d{1,2}日|星期/i)) {
              // 提取中文部分（去除括号和英文）
              // 匹配：中文名称 (代码) 或 中文名称
              const chinesePart = cellContent.match(/([\u4e00-\u9fa5]+[^()]*?)(?:\s*\([^)]*\)|$)/)
              if (chinesePart) {
                name = chinesePart[1].trim()
              } else {
                // 如果没有括号，直接取所有中文部分
                const chineseOnly = cellContent.match(/[\u4e00-\u9fa5]+[^<]*?/)
                if (chineseOnly) {
                  name = chineseOnly[0].trim()
                }
              }
            }
          }
          
          // 如果还是没找到，尝试从整个行中提取中文（在链接之前）
          if (!name || !/[\u4e00-\u9fa5]/.test(name)) {
            // 查找链接之前的中文文本
            if (linkMatch) {
              const linkIndex = row.indexOf(linkMatch[0])
              const beforeLink = row.substring(Math.max(0, linkIndex - 500), linkIndex)
              // 查找中文文本，可能在 <td> 标签内
              const chineseInTd = beforeLink.match(/<td[^>]*>([^<]*[\u4e00-\u9fa5]+[^<]*)<\/td>/i)
              if (chineseInTd) {
                const chineseText = chineseInTd[1].trim().replace(/&nbsp;/g, ' ')
                if (!chineseText.match(/\d{4}年|\d{1,2}月|\d{1,2}日|星期/i)) {
                  const chineseName = chineseText.match(/([\u4e00-\u9fa5]+[^()]*?)(?:\s*\(|$)/)
                  if (chineseName) {
                    name = chineseName[1].trim()
                  }
                }
              }
            }
          }
        }
        
        // 提取股票代码（从括号中，排除EARNINGS等后缀）
        // 格式可能是：(NFLX) 或 (NETFLIX,-INC.-EARNINGS) 需要提取真正的股票代码
        if (!symbol) {
          // 先尝试从链接URL中提取（最准确）
          if (linkMatch) {
            const urlSymbol = linkMatch[1].toUpperCase().split('?')[0] // 去掉URL参数
            symbol = extractStockSymbol(urlSymbol)
          }
          
          // 如果还没有，从括号中提取
          if (!symbol) {
            const symbolMatch = row.match(/\(([A-Z0-9]+(?:[-,\s][A-Z0-9]+)*)\)/i)
            if (symbolMatch) {
              const potentialSymbol = symbolMatch[1].toUpperCase()
              // 排除EARNINGS等后缀，提取真正的股票代码
              if (potentialSymbol.includes('EARNINGS') || potentialSymbol.includes('FIN-SERV') || potentialSymbol.includes('INC')) {
                // 如果包含这些词，尝试从URL中提取
                if (linkMatch) {
                  const urlSymbol = linkMatch[1].toUpperCase().split('?')[0]
                  symbol = extractStockSymbol(urlSymbol)
                }
              } else {
                // 如果没有EARNINGS等，直接使用
                symbol = potentialSymbol.split('-')[0].split(',')[0].replace(/[^A-Z0-9]/g, '') // 只取第一部分
              }
            }
          }
        }
        
        // 如果还是没有symbol，从URL中提取（最后的后备方案）
        if (!symbol && linkMatch) {
          const urlSymbol = linkMatch[1].toUpperCase().split('?')[0]
          symbol = extractStockSymbol(urlSymbol)
        }
        
        // 辅助函数：从URL路径中提取股票代码
        function extractStockSymbol(urlPath: string): string {
          // 排除EARNINGS、INC等后缀，提取真正的股票代码
          const parts = urlPath.split(/[-,\s]/)
          for (const part of parts) {
            const cleanPart = part.toUpperCase().replace(/[^A-Z0-9]/g, '')
            // 股票代码通常是2-5个字符，不包含EARNINGS、INC等
            if (cleanPart.length >= 2 && cleanPart.length <= 5 && 
                !cleanPart.includes('EARNINGS') && 
                !cleanPart.includes('INC') && 
                !cleanPart.includes('FIN') &&
                !cleanPart.includes('SERV') &&
                !cleanPart.includes('CO') &&
                !cleanPart.includes('CORP')) {
              return cleanPart
            }
          }
          // 如果没找到，返回第一部分（去掉特殊字符）
          return parts[0].toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 5)
        }
        
        // 提取时间
        const timePatterns = [
          /(盘前|盘后|盘中)/i,
          /(Before Market|After Market|During Market)/i,
          /(BMO|AMC|DM)/i
        ]
        for (const tp of timePatterns) {
          const tm = row.match(tp)
          if (tm) {
            const timeStr = tm[1]
            if (timeStr.includes('Before') || timeStr === 'BMO') {
              time = '盘前'
            } else if (timeStr.includes('After') || timeStr === 'AMC') {
              time = '盘后'
            } else if (timeStr.includes('During') || timeStr === 'DM') {
              time = '盘中'
            } else {
              time = timeStr
            }
            break
          }
        }
        
        // 提取 EPS 实际值和预测值
        // 格式可能是：<td class="...eps_actual">--</td><td class="leftStrong">/ 4.19</td>
        const epsActualMatch = row.match(/<td[^>]*class="[^"]*eps[^"]*actual[^"]*"[^>]*>([^<]*)<\/td>/i)
        const epsEstimateMatch = row.match(/<td[^>]*class="[^"]*leftStrong[^"]*"[^>]*>\/\s*&nbsp;*([^<]*)<\/td>/i)
        
        if (epsEstimateMatch) {
          epsEstimate = epsEstimateMatch[1].trim().replace(/&nbsp;/g, ' ').trim()
        } else {
          // 备用方法：查找包含 EPS 数据的单元格（两个相邻的td）
          const epsMatch = row.match(/<td[^>]*>([^<]*)<\/td>\s*<td[^>]*class="[^"]*leftStrong[^"]*"[^>]*>\/\s*&nbsp;*([^<]*)<\/td>/i)
          if (epsMatch && epsMatch[2]) {
            epsEstimate = epsMatch[2].trim().replace(/&nbsp;/g, ' ').trim()
          }
        }
        
        // 提取营收实际值和预测值
        // 格式：<td class="...rev_actual">--</td><td class="leftStrong">/&nbsp;&nbsp;5.95B</td>
        // 或者：<td class=" pid-8057-2026-01-16-122025-rev_actual ">--</td> <td class="leftStrong">/&nbsp;&nbsp;5.95B</td>
        // 需要找到包含 rev_actual 的单元格和紧随其后的 leftStrong 单元格
        const revCells = row.match(/<td[^>]*class="[^"]*rev[^"]*"[^>]*>([^<]*)<\/td>/gi)
        if (revCells && revCells.length > 0) {
          // 找到 rev_actual 后面的 leftStrong 单元格
          const revActualIndex = row.indexOf(revCells[0])
          const afterRevActual = row.substring(revActualIndex + revCells[0].length)
          const revEstimateMatch = afterRevActual.match(/<td[^>]*class="[^"]*leftStrong[^"]*"[^>]*>\/\s*&nbsp;*([^<]*)<\/td>/i)
          if (revEstimateMatch) {
            revenueEstimate = revEstimateMatch[1].trim().replace(/&nbsp;/g, ' ').trim()
          }
        }
        
        // 备用方法：直接匹配两个相邻的单元格
        if (!revenueEstimate) {
          const revMatch = row.match(/<td[^>]*class="[^"]*rev_actual[^"]*"[^>]*>([^<]*)<\/td>\s*<td[^>]*class="[^"]*leftStrong[^"]*"[^>]*>\/\s*&nbsp;*([^<]*)<\/td>/i)
          if (revMatch && revMatch[2]) {
            revenueEstimate = revMatch[2].trim().replace(/&nbsp;/g, ' ').trim()
          }
        }
        
        // 提取市值 - 查找单独的市值单元格
        const marketCapMatch = row.match(/<td[^>]*>(\d+\.?\d*[BMK]?)<\/td>/i)
        if (marketCapMatch) {
          marketCap = marketCapMatch[1].trim()
        }
        
        // 提取国家代码（从国旗图标或数据属性）
        let country = ''
        const countryPatterns = [
          /data-country="([^"]+)"/i,
          /country="([^"]+)"/i,
          /<span[^>]*class="[^"]*flag[^"]*"[^>]*data-country="([^"]+)"/i,
          /<i[^>]*class="[^"]*flag[^"]*"[^>]*data-country="([^"]+)"/i,
          /<img[^>]*alt="([^"]*flag[^"]*)"[^>]*>/i
        ]
        for (const cp of countryPatterns) {
          const cm = row.match(cp)
          if (cm && cm.length >= 2) {
            country = cm[1].toUpperCase()
            // 标准化国家代码
            if (country.includes('US') || country.includes('USA') || country.includes('UNITED STATES')) {
              country = 'US'
            } else if (country.includes('UK') || country.includes('GB') || country.includes('UNITED KINGDOM')) {
              country = 'UK'
            } else if (country.includes('CN') || country.includes('CHINA')) {
              country = 'CN'
            } else if (country.includes('HK') || country.includes('HONG KONG')) {
              country = 'HK'
            } else if (country.includes('IN') || country.includes('INDIA')) {
              country = 'IN'
            }
            break
          }
        }
        
        // 如果还没找到，尝试从第一个td中的文本推断（如果包含国家名称）
        if (!country) {
          const countryTextMatch = row.match(/(美国|英国|中国|日本|韩国|德国|法国|印度|香港|台湾)/i)
          if (countryTextMatch) {
            const countryText = countryTextMatch[1]
            const countryMap: Record<string, string> = {
              '美国': 'US', '英国': 'UK', '中国': 'CN', '日本': 'JP',
              '韩国': 'KR', '德国': 'DE', '法国': 'FR', '印度': 'IN',
              '香港': 'HK', '台湾': 'TW'
            }
            country = countryMap[countryText] || ''
          }
        }
        
        // 如果有股票名称或代码，就添加
        console.log('📊 准备添加财报项，当前值:', { 
          name, 
          symbol, 
          nameHasChinese: name ? /[\u4e00-\u9fa5]/.test(name) : false,
          nameLength: name ? name.length : 0
        })
        
        if (name || symbol) {
          // 构建 Investing.com 股票详情页 URL
          const stockUrl = symbol 
            ? `https://cn.investing.com/equities/${symbol.toLowerCase()}` 
            : name 
              ? `https://cn.investing.com/equities/${encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-'))}`
              : undefined
          
          // 确保name不为空，如果有中文名称优先使用，否则使用symbol
          const finalName = name || symbol || ''
          const finalSymbol = symbol || (name && /[\u4e00-\u9fa5]/.test(name) ? '' : name.substring(0, 10)) || ''
          
          const earningsItem: EarningsCalendarItem = {
            symbol: finalSymbol,
            name: finalName,
            date,
            time,
            epsEstimate: epsEstimate || undefined,
            revenueEstimate: revenueEstimate || undefined,
            marketCap: marketCap || undefined,
            country: country || undefined,
            url: stockUrl
          }
          
          earnings.push(earningsItem)
          console.log('✅ 添加财报项:', { 
            symbol: finalSymbol, 
            name: finalName, 
            hasChinese: /[\u4e00-\u9fa5]/.test(finalName),
            date, 
            time
          })
        } else {
          console.log('跳过行：未找到名称或代码', row.substring(0, 100))
        }
      }
      
      if (earnings.length > 0) {
        console.log(`✅ 使用模式 ${patternIndex + 1} 找到 ${earnings.length} 条财报数据`)
        break
      } else {
        console.log(`❌ 模式 ${patternIndex + 1} 未找到数据，匹配了 ${count} 行`)
        if (foundRows.length > 0) {
          console.log('示例行（前200字符）:', foundRows[0])
        }
      }
    }
    
    // 如果还是没找到，尝试更宽松的匹配
    if (earnings.length === 0) {
      console.log('⚠️ 所有模式都未找到数据，尝试更宽松的匹配...')
      // 查找所有包含股票相关关键词的行
      const allRows = html.match(/<tr[^>]*>[\s\S]{100,2000}?<\/tr>/gi)
      if (allRows) {
        console.log(`找到 ${allRows.length} 个表格行，开始筛选...`)
        for (const row of allRows.slice(0, 50)) {
          // 检查是否包含股票相关关键词或中文
          if (row.match(/(股票|equities|earnings|财报|公司|[\u4e00-\u9fa5])/i)) {
            const linkMatch = row.match(/<a[^>]*href="[^"]*equities[^"]*"[^>]*>([^<]+)<\/a>/i)
            if (linkMatch) {
              const name = linkMatch[1].trim()
              if (name.length > 0 && name.length < 50) {
                // 提取日期
                const dateMatch = row.match(/data-date="([^"]+)"/i) || row.match(/(\d{4}-\d{2}-\d{2})/)
                const date = dateMatch ? dateMatch[1] : ''
                
                // 提取股票代码
                const symbolMatch = row.match(/<a[^>]*href="[^"]*equities\/([^"\/]+)[^"]*"/i)
                const symbol = symbolMatch ? symbolMatch[1].toUpperCase() : name.substring(0, 10)
                
                earnings.push({
                  symbol,
                  name,
                  date,
                  time: '',
                  url: `https://cn.investing.com/equities/${symbol.toLowerCase()}`
                })
              }
            }
          }
        }
        console.log(`宽松匹配找到 ${earnings.length} 条数据`)
      } else {
        console.warn('未找到任何表格行')
      }
    }
    
    console.log('解析完成，找到', earnings.length, '条财报数据')
    
  } catch (error) {
    console.warn('Error parsing earnings calendar HTML:', error)
  }
  
  return earnings
}
