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
  // 保存财联社返回的原始板块数据（包含stock_list），用于获取热门股票
  const [plateRawDataByDate, setPlateRawDataByDate] = useState<Record<string, any[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSector, setSelectedSector] = useState<SectorDetail | null>(null)
  const [hotStocks, setHotStocks] = useState<HotStock[]>([])
  const [loadingHotStocks, setLoadingHotStocks] = useState(false)
  const [filterType, setFilterType] = useState<'industry' | 'concept'>('concept')
  const [sortBy, setSortBy] = useState<'change' | 'rank'>('change')
  const [topN, setTopN] = useState<number>(10)
  const [matchWarning, setMatchWarning] = useState<string | null>(null) // 匹配度警告
  
  // 从东方财富接口获取的板块类型映射（板块名称 -> 类型）（已注释）
  const [sectorTypeMap, setSectorTypeMap] = useState<Map<string, 'industry' | 'concept'>>(new Map())
  const [sectorTypeMapLoaded, setSectorTypeMapLoaded] = useState(false)
  
  // 从财联社接口获取的板块类型映射（优先使用）
  const [caiLianSheTypeMap, setCaiLianSheTypeMap] = useState<Map<string, 'industry' | 'concept'>>(new Map())
  const [caiLianSheTypeMapLoaded, setCaiLianSheTypeMapLoaded] = useState(false)

  // CORS代理配置
  const CORS_PROXY_MAIN = (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`
  const CORS_PROXY_BACKUP = (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
  const CORS_PROXY_THIRD = (url: string) => `https://proxy.cors.sh/${url}`
  const CORS_PROXIES = [CORS_PROXY_MAIN, CORS_PROXY_BACKUP, CORS_PROXY_THIRD]

  // 从东方财富接口获取板块类型映射（已注释，暂时不使用）
  // const fetchSectorTypeMap = useCallback(async () => {
  //   if (sectorTypeMapLoaded) return
  //   
  //   try {
  //     console.log('🔄 从东方财富接口获取板块类型映射...')
  //     const typeMap = new Map<string, 'industry' | 'concept'>()
  //     
  //     // 获取行业板块列表 (m:90+t:2)
  //     const industryUrl = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=500&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=m:90+t:2`
  //     const industryProxyUrl = CORS_PROXY_MAIN(industryUrl)
  //     const industryResponse = await fetch(industryProxyUrl, {
  //       headers: { 'Accept': 'application/json' }
  //     })
  //     
  //     if (industryResponse.ok) {
  //       const industryData = await industryResponse.json()
  //       const industryList = industryData?.data?.diff || []
  //       industryList.forEach((item: any) => {
  //         const name = (item.f14 || item.name || '').trim()
  //         if (name) {
  //           // 添加原始名称
  //           typeMap.set(name, 'industry')
  //           // 添加去掉"行业"、"板块"后缀的版本
  //           const nameClean = name.replace(/行业$|板块$/, '').trim()
  //           if (nameClean && nameClean !== name && nameClean.length > 0) {
  //             typeMap.set(nameClean, 'industry')
  //           }
  //           // 如果原名称没有"行业"后缀，也添加带"行业"的版本
  //           if (!name.includes('行业') && !name.includes('板块')) {
  //             typeMap.set(name + '行业', 'industry')
  //           }
  //         }
  //       })
  //       console.log(`✅ 获取到 ${industryList.length} 个行业板块，映射表大小: ${typeMap.size}`)
  //       // 显示前10个行业板块名称
  //       const industryNames = industryList.slice(0, 10).map((item: any) => item.f14 || item.name)
  //       console.log(`  行业板块示例（前10个）:`, industryNames)
  //       // 检查"纺织服装"是否在映射表中
  //       if (typeMap.has('纺织服装')) {
  //         console.log(`  ✅ "纺织服装"在映射表中，类型: ${typeMap.get('纺织服装')}`)
  //       } else {
  //         console.log(`  ⚠️ "纺织服装"不在映射表中`)
  //         // 查找包含"纺织"的键
  //         const textileKeys = Array.from(typeMap.keys()).filter(k => k.includes('纺织'))
  //         console.log(`  包含"纺织"的键:`, textileKeys)
  //       }
  //       // 检查"有色金属"是否在映射表中
  //       if (typeMap.has('有色金属')) {
  //         console.log(`  ✅ "有色金属"在映射表中，类型: ${typeMap.get('有色金属')}`)
  //       } else {
  //         console.log(`  ⚠️ "有色金属"不在映射表中`)
  //         // 查找包含"有色"的键
  //         const metalKeys = Array.from(typeMap.keys()).filter(k => k.includes('有色'))
  //         console.log(`  包含"有色"的键:`, metalKeys)
  //       }
  //     }
  //     
  //     // 获取概念板块列表 (m:90+t:3) - 获取更多数据
  //     const conceptUrl = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=1000&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=m:90+t:3`
  //     const conceptProxyUrl = CORS_PROXY_MAIN(conceptUrl)
  //     const conceptResponse = await fetch(conceptProxyUrl, {
  //       headers: { 'Accept': 'application/json' }
  //     })
  //     
  //     if (conceptResponse.ok) {
  //       const conceptData = await conceptResponse.json()
  //       const conceptList = conceptData?.data?.diff || []
  //       conceptList.forEach((item: any) => {
  //         const name = (item.f14 || item.name || '').trim()
  //         if (name) {
  //           // 添加原始名称
  //           typeMap.set(name, 'concept')
  //           // 添加去掉"概念"后缀的版本
  //           const nameClean = name.replace(/概念$|题材$|主题$/, '').trim()
  //           if (nameClean && nameClean !== name) {
  //             typeMap.set(nameClean, 'concept')
  //           }
  //           // 添加"概念"后缀的版本（如果原名称没有）
  //           if (!name.includes('概念') && !name.includes('题材') && !name.includes('主题')) {
  //             typeMap.set(name + '概念', 'concept')
  //           }
  //         }
  //       })
  //       console.log(`✅ 获取到 ${conceptList.length} 个概念板块，映射表大小: ${typeMap.size}`)
  //       // 显示前10个概念板块名称
  //       const conceptNames = conceptList.slice(0, 10).map((item: any) => item.f14 || item.name)
  //       console.log(`  概念板块示例（前10个）:`, conceptNames)
  //     }
  //     
  //     setSectorTypeMap(typeMap)
  //     setSectorTypeMapLoaded(true)
  //     console.log(`✅ 板块类型映射加载完成，共 ${typeMap.size} 个板块`)
  //     // 显示所有映射的键（前30个）
  //     const allKeys = Array.from(typeMap.keys()).slice(0, 30)
  //     console.log(`  映射表键示例（前30个）:`, allKeys)
  //   } catch (error) {
  //     console.warn('⚠️ 获取板块类型映射失败，将使用关键词匹配:', error)
  //     setSectorTypeMapLoaded(true) // 标记为已加载，避免重复请求
  //   }
  // }, [sectorTypeMapLoaded])
  
  // 初始化时获取板块类型映射（优先使用财联社接口）
  // 注意：这个 useEffect 会在 fetchCaiLianSheSectorTypeMap 定义之后执行

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
  // 从财联社接口获取板块类型映射（通过板块列表接口）
  // 注意：财联社接口可能不直接返回类型信息，这里尝试从接口返回的数据中提取
  const fetchCaiLianSheSectorTypeMap = useCallback(async (): Promise<Map<string, 'industry' | 'concept'>> => {
    const typeMap = new Map<string, 'industry' | 'concept'>()
    
    try {
      // 尝试获取财联社的板块列表接口，看是否有类型信息
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '')
      const apiUrl = `https://x-quote.cls.cn/v2/quote/a/plate/up_down_analysis?up_limit=0&date=${today}`
      
      for (const proxy of CORS_PROXIES) {
        try {
          const proxyUrl = proxy(apiUrl)
          const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/json, text/html, */*',
              'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15'
            }
          })
          
          if (response.ok) {
            const contentType = response.headers.get('content-type') || ''
            let data: any
            
            if (contentType.includes('application/json')) {
              data = await response.json()
            } else {
              const html = await response.text()
              const scriptMatch = 
                html.match(/<script[^>]*>[\s\S]*?window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/i) ||
                html.match(/<script[^>]*>[\s\S]*?var\s+data\s*=\s*({[\s\S]*?});/i) ||
                html.match(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i)
              
              if (scriptMatch && scriptMatch[1]) {
                data = JSON.parse(scriptMatch[1])
              } else {
                continue
              }
            }
            
            if (data?.code === 200 && data?.data?.plate_stock) {
              const plateStockData = data.data.plate_stock
              
              // 检查财联社返回的数据是否有类型字段
              if (plateStockData.length > 0) {
                const firstPlate = plateStockData[0]
                console.log('🔍 检查财联社板块数据结构:', firstPlate)
                console.log('🔍 财联社板块所有字段:', Object.keys(firstPlate))
                
                // 检查所有可能的类型字段
                const typeFields = ['plate_type', 'type', 'category', 'kind', 'class', 
                                   'plate_category', 'plate_kind', 'secu_type', 'secu_category',
                                   'plate_class', 'plateType', 'plateCategory']
                let foundTypeField = false
                
                for (const field of typeFields) {
                  if (firstPlate[field] !== undefined && firstPlate[field] !== null) {
                    console.log(`✅ 发现类型字段: ${field} = ${firstPlate[field]}`)
                    foundTypeField = true
                    break
                  }
                }
                
                if (foundTypeField) {
                  // 如果财联社返回了类型字段，使用它
                  plateStockData.forEach((plate: any) => {
                    const name = String(plate.secu_name || plate.name || '').trim()
                    const plateType = plate.plate_type || plate.type || plate.category || plate.kind || plate.class ||
                                    plate.plate_category || plate.plate_kind || plate.secu_type || plate.secu_category
                    if (name && plateType) {
                      const typeStr = String(plateType).toLowerCase()
                      if (typeStr.includes('industry') || typeStr.includes('行业') || typeStr === '2') {
                        typeMap.set(name, 'industry')
                      } else if (typeStr.includes('concept') || typeStr.includes('概念') || typeStr === '3') {
                        typeMap.set(name, 'concept')
                      }
                    }
                  })
                  console.log(`✅ 从财联社接口获取到 ${typeMap.size} 个板块类型映射`)
                  return typeMap
                } else {
                  console.log('ℹ️ 财联社接口未返回类型字段，将使用关键词匹配')
                }
              }
            }
          }
        } catch (error) {
          console.warn('获取财联社板块类型映射失败，尝试下一个代理:', error)
          continue
        }
      }
    } catch (error) {
      console.warn('⚠️ 无法从财联社接口获取板块类型映射:', error)
    }
    
    return typeMap
  }, [])
  
  // 初始化时获取板块类型映射（优先使用财联社接口）
  useEffect(() => {
    const loadTypeMaps = async () => {
      try {
        // 先尝试从财联社获取
        const clsMap = await fetchCaiLianSheSectorTypeMap()
        if (clsMap.size > 0) {
          setCaiLianSheTypeMap(clsMap)
          setCaiLianSheTypeMapLoaded(true)
          console.log('✅ 使用财联社板块类型映射')
        } else {
          console.log('⚠️ 财联社未提供类型映射，将使用关键词匹配')
          setCaiLianSheTypeMapLoaded(true) // 标记为已加载，避免重复请求
        }
      } catch (error) {
        console.warn('⚠️ 获取财联社类型映射失败，将使用关键词匹配:', error)
        setCaiLianSheTypeMapLoaded(true) // 即使失败也要标记为已加载，确保数据能正常加载
      }
    }
    loadTypeMaps()
  }, [fetchCaiLianSheSectorTypeMap])

  // 返回处理后的板块数据和原始数据
  const fetchSectorData = useCallback(async (date: string): Promise<{sectors: SectorData[], rawData: any[]}> => {
    // 暂时禁用行业板块，只显示概念板块
    if (filterType === 'industry') {
      console.log(`⚠️ 行业板块暂时禁用，只显示概念板块`)
      return { sectors: [], rawData: [] }
    }
    
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
          // 优先检查API返回的字段，如果没有类型字段，则使用智能匹配
          let hasApiMatch = false // 记录是否有板块使用了API类型字段匹配
          let hasApiMapMatch = false // 记录是否有板块使用了接口映射匹配
          let matchMethod = 'keywordFallback' // 记录使用的匹配方法：'api', 'apiMap', 'keywordFallback'
          
          const filteredData = plateStockData.filter((plate: any) => {
            const name = String(plate.secu_name || plate.name || '').trim()
            const code = String(plate.secu_code || plate.code || plate.plate_code || '').trim()
            
            // 记录该板块使用的匹配方法（用于统计）
            let plateMatchMethod: 'api' | 'apiMap' | 'keyword' = 'keyword'
            
            // 方法1：检查API是否有类型字段（最可靠，优先使用财联社自己的类型字段）
            // 检查所有可能的类型字段
            const plateType = plate.plate_type || plate.type || plate.category || plate.kind || plate.class || 
                             plate.plate_category || plate.plate_kind || plate.secu_type || plate.secu_category
            if (plateType) {
              hasApiMatch = true
              plateMatchMethod = 'api'
              const typeStr = String(plateType).toLowerCase()
              if (filterType === 'industry') {
                return typeStr.includes('industry') || typeStr.includes('行业') || typeStr === '2' || typeStr === 'industry'
              } else {
                return typeStr.includes('concept') || typeStr.includes('概念') || typeStr === '3' || typeStr === 'concept'
              }
            }
            
            // 方法1.5：尝试从财联社板块代码推断类型（如果代码有规律）
            // 财联社代码格式：cls80290, cls80123 等
            // 如果代码有规律，可以根据代码范围判断
            // 注意：这个需要根据实际数据调整，目前先注释掉
            // const codeNum = parseInt(code.replace('cls', '')) || 0
            // if (codeNum > 0) {
            //   // 假设：cls80xxx 是概念，cls81xxx 是行业（需要根据实际数据调整）
            //   if (filterType === 'concept' && codeNum >= 80200 && codeNum < 80300) {
            //     return true
            //   } else if (filterType === 'industry' && codeNum >= 80100 && codeNum < 80200) {
            //     return true
            //   }
            // }
            
            // 方法2：优先使用财联社自己的类型映射（如果可用）
            if (caiLianSheTypeMapLoaded && caiLianSheTypeMap.size > 0) {
              const cleanName = (n: string) => n.replace(/概念$|题材$|主题$|行业$|板块$|产业链$/, '').trim()
              const nameCleaned = cleanName(name)
              
              // 1. 精确匹配
              let mappedType = caiLianSheTypeMap.get(name)
              if (mappedType) {
                hasApiMapMatch = true
                plateMatchMethod = 'apiMap'
                return mappedType === filterType
              }
              
              // 2. 清理后的名称匹配
              mappedType = caiLianSheTypeMap.get(nameCleaned)
              if (mappedType) {
                hasApiMapMatch = true
                plateMatchMethod = 'apiMap'
                return mappedType === filterType
              }
              
              // 3. 包含匹配
              for (const [mappedName, mappedType] of caiLianSheTypeMap.entries()) {
                const mappedNameCleaned = cleanName(mappedName)
                if (name === mappedName || nameCleaned === mappedNameCleaned ||
                    name.includes(mappedName) || mappedName.includes(name) ||
                    nameCleaned.includes(mappedNameCleaned) || mappedNameCleaned.includes(nameCleaned)) {
                  hasApiMapMatch = true
                  plateMatchMethod = 'apiMap'
                  return mappedType === filterType
                }
              }
            }
            
            // 方法3：使用从东方财富接口获取的板块类型映射（已注释，暂时不使用）
            // if (sectorTypeMapLoaded && sectorTypeMap.size > 0) {
            if (false) { // 暂时禁用东方财富接口
              // 清理名称：去掉常见后缀，用于匹配
              const cleanName = (n: string) => {
                return n
                  .replace(/概念$|题材$|主题$|行业$|板块$|产业链$/, '')
                  .trim()
              }
              
              const nameCleaned = cleanName(name)
              
              // 调试：只在第一个板块时输出详细信息
              const isFirstPlate = plateStockData.indexOf(plate) === 0
              
              // 调试：输出匹配尝试信息（仅对特定板块）
              if (isFirstPlate || name === '纺织服装' || name === '有色金属概念') {
                console.log(`  🔍 尝试匹配板块: "${name}" (清理后: "${nameCleaned}"), 目标类型: ${filterType}`)
              }
              
              // 1. 精确匹配
              let mappedType = sectorTypeMap.get(name)
              if (mappedType) {
                hasApiMapMatch = true
                plateMatchMethod = 'apiMap'
                if (isFirstPlate || name === '纺织服装' || name === '有色金属概念') {
                  console.log(`  ✅ 精确匹配: "${name}" -> ${mappedType}`)
                }
                return mappedType === filterType
              }
              
              // 2. 清理后的名称匹配（去掉"概念"等后缀后匹配）
              mappedType = sectorTypeMap.get(nameCleaned)
              if (mappedType) {
                hasApiMapMatch = true
                plateMatchMethod = 'apiMap'
                if (isFirstPlate || name === '纺织服装' || name === '有色金属概念') {
                  console.log(`  ✅ 清理后匹配: "${nameCleaned}" -> ${mappedType}`)
                }
                return mappedType === filterType
              }
              
              // 调试：如果"纺织服装"或"有色金属概念"没有匹配上，输出详细信息
              if (name === '纺织服装' || name === '有色金属概念') {
                console.log(`  ⚠️ "${name}" 未在步骤1-2中匹配`)
                console.log(`  检查映射表: has("${name}") = ${sectorTypeMap.has(name)}, has("${nameCleaned}") = ${sectorTypeMap.has(nameCleaned)}`)
                if (name === '有色金属概念') {
                  console.log(`  检查"有色金属": has("有色金属") = ${sectorTypeMap.has('有色金属')}, type = ${sectorTypeMap.get('有色金属')}`)
                }
              }
              
              // 3. 反向清理匹配（映射表中的名称去掉后缀后，与财联社名称匹配）
              for (const [mappedName, mappedType] of sectorTypeMap.entries()) {
                const mappedNameCleaned = cleanName(mappedName)
                // 如果财联社名称（清理后）等于映射表名称（清理后），则匹配
                if (nameCleaned === mappedNameCleaned && nameCleaned.length > 0) {
                  hasApiMapMatch = true
                  plateMatchMethod = 'apiMap'
                  if (isFirstPlate) {
                    console.log(`  ✅ 反向清理匹配: "${nameCleaned}" <-> "${mappedNameCleaned}" -> ${mappedType}`)
                  }
                  return mappedType === filterType
                }
                // 如果财联社名称（清理后）等于映射表原始名称，也匹配
                if (nameCleaned === mappedName && nameCleaned.length > 0) {
                  hasApiMapMatch = true
                  plateMatchMethod = 'apiMap'
                  if (isFirstPlate) {
                    console.log(`  ✅ 反向清理匹配2: "${nameCleaned}" <-> "${mappedName}" -> ${mappedType}`)
                  }
                  return mappedType === filterType
                }
                // 如果财联社原始名称等于映射表名称（清理后），也匹配
                if (name === mappedNameCleaned && mappedNameCleaned.length > 0) {
                  hasApiMapMatch = true
                  plateMatchMethod = 'apiMap'
                  if (isFirstPlate) {
                    console.log(`  ✅ 反向清理匹配3: "${name}" <-> "${mappedNameCleaned}" -> ${mappedType}`)
                  }
                  return mappedType === filterType
                }
                // 如果财联社原始名称等于映射表原始名称，也匹配（这个应该在步骤1就匹配了，但为了保险再加一次）
                if (name === mappedName) {
                  hasApiMapMatch = true
                  plateMatchMethod = 'apiMap'
                  if (isFirstPlate) {
                    console.log(`  ✅ 反向清理匹配4: "${name}" <-> "${mappedName}" -> ${mappedType}`)
                  }
                  return mappedType === filterType
                }
              }
              
              // 4. 双向包含匹配（更宽松）
              for (const [mappedName, mappedType] of sectorTypeMap.entries()) {
                const mappedNameCleaned = cleanName(mappedName)
                
                // 双向包含匹配（原始名称和清理后的名称都尝试）
                if (name === mappedName || nameCleaned === mappedNameCleaned ||
                    name.includes(mappedName) || mappedName.includes(name) ||
                    nameCleaned.includes(mappedNameCleaned) || mappedNameCleaned.includes(nameCleaned) ||
                    name.includes(mappedNameCleaned) || mappedNameCleaned.includes(name) ||
                    mappedName.includes(nameCleaned) || nameCleaned.includes(mappedName)) {
                  hasApiMapMatch = true
                  plateMatchMethod = 'apiMap'
                  if (isFirstPlate) {
                    console.log(`  ✅ 包含匹配: "${name}" <-> "${mappedName}" -> ${mappedType}`)
                  }
                  return mappedType === filterType
                }
              }
              
              // 4. 关键词匹配（提取核心关键词，至少3个字）
              const extractKeywords = (n: string) => {
                const keywords: string[] = []
                // 提取3-6字的关键词（更精确）
                for (let len = 6; len >= 3; len--) {
                  for (let i = 0; i <= n.length - len; i++) {
                    const keyword = n.substring(i, i + len)
                    if (keyword.length >= 3) {
                      keywords.push(keyword)
                    }
                  }
                }
                return keywords
              }
              
              const nameKeywords = extractKeywords(nameCleaned)
              for (const [mappedName, mappedType] of sectorTypeMap.entries()) {
                const mappedNameCleaned = cleanName(mappedName)
                const mappedKeywords = extractKeywords(mappedNameCleaned)
                
                // 检查是否有共同的关键词（至少3个字匹配）
                const commonKeywords = nameKeywords.filter(k => 
                  mappedKeywords.some(mk => k === mk && k.length >= 3)
                )
                
                if (commonKeywords.length > 0) {
                  hasApiMapMatch = true
                  plateMatchMethod = 'apiMap'
                  if (isFirstPlate) {
                    console.log(`  ✅ 关键词匹配: "${name}" <-> "${mappedName}" (共同关键词: ${commonKeywords.join(', ')}) -> ${mappedType}`)
                  }
                  return mappedType === filterType
                }
              }
              
              // 如果所有匹配都失败，输出调试信息
              if (isFirstPlate) {
                console.log(`  ⚠️ 板块 "${name}" 未在映射表中找到匹配`)
                console.log(`  映射表大小: ${sectorTypeMap.size}`)
                // 显示映射表中的前20个板块名称作为参考
                const sampleNames = Array.from(sectorTypeMap.keys()).slice(0, 20)
                console.log(`  映射表示例（前20个）:`, sampleNames)
                // 显示财联社的板块名称
                const clsNames = plateStockData.slice(0, 10).map((p: any) => p.secu_name || p.name)
                console.log(`  财联社板块名称（前10个）:`, clsNames)
              }
              // 如果接口映射已加载但匹配失败，继续执行到降级方案
              // 不在这里return，让代码继续执行
            } else {
              // 如果接口映射未加载，继续执行到降级方案
            }
            
            // 方法3：根据板块代码模式判断（如果有规律）
            // 财联社代码格式可能是：cls80290（概念）、cls80123（行业）等
            // 如果代码有规律，可以根据代码范围判断
            // 注意：这个需要根据实际数据调整
            // TODO: 分析板块代码规律，如果发现规律，可以添加代码模式匹配
            
            // 方法4：降级方案（在正常过滤阶段就使用，而不是等到filteredData为空）
            // 如果所有方法都没有匹配到，使用降级方案
            if (filterType === 'industry') {
              // 行业板块：排除明确的概念板块，其他都当作行业
              const name = String(plate.secu_name || plate.name || '').trim()
              // 如果包含"概念"、"题材"、"主题"，肯定是概念，排除
              if (name.includes('概念') || name.includes('题材') || name.includes('主题')) {
                return false
              }
              // 排除一些明确的概念关键词（完全匹配或包含匹配）
              const explicitConceptKeywords = [
                'AI应用', 'AI智能体', 'AI眼镜', 'AI制药', 'AI语料', 'AI芯片',
                '机器人概念', '芯片产业链', '人脑工程', '商业航天', '智能驾驶',
                '数字货币', '创新药', '算力工程', '光刻胶', '金融科技',
                '液冷IDC', '可控核聚变', '算力工程', '光通信', '光刻胶', '存储器', 'PCB',
                'AI智能体', 'AI眼镜', 'AI应用', '芯片产业链', '人脑工程', '商业航天',
                '智能驾驶', '数字货币', '创新药', '算力工程', '光刻胶', '金融科技'
              ]
              // 检查是否包含明确的概念关键词
              if (explicitConceptKeywords.some(keyword => name === keyword || name.includes(keyword))) {
                return false
              }
              // 其他都当作行业显示（包括：互联网服务、文化传媒、小金属、贵金属、游戏、航天航空、软件开发、医疗服务等）
              return true
            } else {
              // 概念板块：优先检查是否包含概念关键词，然后排除明确的行业板块
              const name = String(plate.secu_name || plate.name || '').trim()
              
              // 明确的概念关键词列表（如果包含这些关键词，肯定是概念）
              const conceptKeywords = [
                // AI相关
                'AI', '人工智能', 'ChatGPT', 'Sora', 'Kimi', 'AIGC', '多模态', '文生视频', '文生图', '大模型',
                'AI应用', 'AI智能体', 'AI眼镜', 'AI制药', 'AI语料', 'AI芯片', '智谱AI',
                // 芯片相关
                '存储芯片', '汽车芯片', '第三代半导体', '第四代半导体', '芯片产业链', '芯片', '半导体',
                // 机器人相关
                '机器人', '人形机器人', '工业机器人', '服务机器人', '机器人概念', '机器人执行器',
                // 智能相关
                '智能驾驶', '自动驾驶', '无人驾驶', '车联网', '智能汽车', '智能电网', '智能',
                // 新能源相关
                '光伏', '风电', '储能', '氢能', '锂电池', '钠电池', '固态电池', '钙钛矿', 'HJT', 'TOPCon', 'BC电池',
                '液冷IDC', '生物质能', '新能源',
                // 数字相关
                '数字货币', '数字人民币', '区块链', '元宇宙', 'Web3', 'NFT', '数字',
                // 数据相关
                '数据要素', '数据确权', '数据安全', '数据交易', '数据资产', '数据',
                // 信创相关
                '信创', '国产软件', '国产芯片', '国产替代', '自主可控',
                // 航天相关
                '卫星', '卫星互联网', '卫星导航', '空间站', '商业航天', '航天',
                // 医疗生物相关
                '人脑工程', 'CAR-T', '细胞疗法', '重组蛋白', '基因测序', '创新药', '减肥药', 'CRO', 'CDMO',
                '辅助生殖', '医美', '医疗美容',
                // 算力相关
                '算力', '算力工程', '光通信', '光刻胶', '存储器', 'PCB', '光刻',
                // 金融科技
                '金融科技',
                // 其他新兴概念
                '同步磁阻电机', '减速器', '3D玻璃', '噪声防治',
                'UWB', '碳纤', 'PEEK', '华为', '跨境', '支付',
                '飞行汽车', '低空经济', 'eVTOL',
                '量子', '量子通信', '量子计算',
                '6G', 'MR', 'VR', 'AR', 'XR',
                '超导', '室温超导', '可控核聚变',
                'PLC', '产业链',
                // 更多概念关键词（常见概念板块名称）
                '有色金属概念', '机器人概念', '核电', '军工', '石英', '面板', '高铁轨交',
                '液冷', 'IDC', '光通信', '智能电网',
                '人脑工程', '商业航天', '智能驾驶', '数字货币', '创新药', '算力工程', '光刻胶', '金融科技',
                '液冷IDC', 'AI智能体', 'AI眼镜', '可控核聚变', '芯片产业链', 'AI应用',
                // 更多概念板块关键词
                '光刻', '存储', 'PCB', '算力', '工程',
                '人脑', '商业', '航天', '智能', '驾驶',
                '数字', '货币', '创新', '药', '金融', '科技',
                '芯片', '产业', '链', '机器人', '概念',
                '核电', '军工', '石英', '面板', '高铁', '轨交',
                '光通', '信', '智能', '电网', 'AI', '眼镜',
                'AI', '智能', '体', '液', '冷', 'IDC',
                '光', '刻', '存储', '器', 'PCB', '算', '力', '工程',
                '人', '脑', '工程', '商业', '航天', '智能', '驾驶',
                '数字', '货币', '创新', '药', '金融', '科技',
                '芯片', '产业', '链', '机器人', '概念',
                '核电', '军工', '石英', '面板', '高铁', '轨交',
                // 新增更多概念关键词
                'ST股', '其他', '影视', '食品饮料', '商业零售', '生物质能', '算力工程',
                '光刻胶', '存储器', 'PCB', '光通信', '智能电网', '液冷IDC',
                'AI智能体', 'AI眼镜', '可控核聚变', '芯片产业链', 'AI应用',
                '有色金属概念', '机器人概念', '人脑工程', '商业航天', '智能驾驶',
                '数字货币', '创新药', '算力工程', '光刻胶', '金融科技',
                '核电', '军工', '石英', '面板', '高铁轨交', '光通信', '智能电网',
                '液冷', 'IDC', '光刻', '存储', 'PCB', '算力', '工程',
                '人脑', '商业', '航天', '智能', '驾驶', '数字', '货币', '创新', '药', '金融', '科技',
                '芯片', '产业', '链', '机器人', '概念', '核电', '军工', '石英', '面板', '高铁', '轨交'
              ]
              
              // 如果包含概念关键词，肯定是概念
              if (conceptKeywords.some(keyword => name.includes(keyword))) {
                return true
              }
              
              // 排除行业关键词列表中的板块
              const strictIndustryKeywords = [
                // 金融业
                '银行', '保险', '证券', '多元金融', '金融', '信托', '期货', '基金', '租赁', '担保',
                // 房地产业
                '房地产开发', '房地产服务', '房地产', '物业管理', '园区开发',
                // 建筑业
                '建筑', '建材', '水泥', '水泥建材', '工程建设', '工程机械', '工程咨询服务', '装修装饰', '装修建材', '装饰', '装修',
                // 采矿业
                '采掘行业', '采掘', '煤炭', '石油', '石油行业', '钢铁', '钢铁行业', '有色金属', '贵金属', '小金属', '能源金属',
                // 制造业 - 基础材料
                '化工', '化学', '化学原料', '化学制品', '化学制药', '化纤行业', '化纤', '塑料制品', '橡胶', '玻璃玻纤', '非金属材料', '包装材料',
                // 制造业 - 机械设备
                '机械', '设备', '通用设备', '专用设备', '工程机械', '交运设备', '电机', '电源设备', '电网设备', '风电设备', '光伏设备', '仪器仪表',
                // 制造业 - 电子
                '电子元件', '电子化学品', '消费电子', '光学光电子', '计算机设备',
                // 制造业 - 汽车
                '汽车整车', '汽车零部件', '汽车服务',
                // 制造业 - 家电
                '家电',
                // 制造业 - 轻工
                '轻工', '纺织服装', '造纸', '造纸印刷', '印刷', '包装', '家具', '珠宝首饰',
                // 制造业 - 食品
                '食品饮料', '酿酒',
                // 制造业 - 医药
                '医药商业', '医疗服务', '医疗器械', '生物制品', '中药',
                // 电力、热力、燃气及水生产和供应业
                '电力', '公用事业', '燃气', '水务', '热力',
                // 交通运输、仓储和邮政业
                '交通运输', '物流', '港口', '航运', '航运港口', '航空机场', '铁路公路', '高速公路', '机场', '航空', '铁路', '公路', '水运', '仓储',
                // 信息传输、软件和信息技术服务业
                '通信服务', '通信设备', '互联网服务', '软件开发', '信息服务', 'IT服务', '云计算', '大数据',
                // 批发和零售业
                '商业百货', '商业零售', '零售', '百货', '贸易行业', '贸易', '批发', '超市', '连锁',
                // 住宿和餐饮业
                '餐饮', '旅游酒店', '酒店', '旅游', '住宿',
                // 文化、体育和娱乐业
                '文化传媒', '传媒', '文化', '影视', '娱乐', '体育', '游戏', '出版', '广告', '演艺',
                // 教育
                '教育', '培训', '在线教育',
                // 科学研究和技术服务业
                '专业服务', '咨询服务', '技术服务', '检测服务', '认证服务',
                // 水利、环境和公共设施管理业
                '环保行业', '环保', '水务', '园林', '绿化',
                // 居民服务、修理和其他服务业
                '美容护理', '美发', '洗浴', '家政', '维修',
                // 综合
                '综合行业', '综合',
                // 其他常见行业名称
                '船舶制造', '船舶', '航空装备', '航天装备', '军工', '国防', '安防', '消防',
                '通信', '电信', '移动通信', '固定通信',
                '农业', '畜牧', '渔业', '林业', '种植', '化肥', '农药', '种子', '农牧饲渔', '农牧',
                '新能源', '清洁能源', '传统能源',
                '新材料', '复合材料',
                '生物医药', '医药', '医疗',
                '纺织', '服装', '鞋帽',
                '食品', '饮料', '乳制品',
                '建筑装饰', '装修材料',
                '金属制品', '金属加工',
                '电气设备', '电气', '电力设备',
                '通信设备', '网络设备',
                '计算机', '软件', '硬件',
                '半导体', '芯片制造',
                '显示器件', '面板',
                '电池', '储能设备',
                '汽车', '摩托车', '自行车',
                '船舶', '海洋工程',
                '航空航天', '航天航空', '航空', '航天',
                '轨道交通', '高铁', '地铁',
                '物流运输', '快递', '配送',
                '商业地产', '住宅地产', '工业地产',
                '零售', '批发', '贸易',
                '餐饮服务', '酒店服务', '旅游服务',
                '文化创意', '数字内容', '新媒体',
                '教育培训', '职业教育', '高等教育',
                '医疗服务', '健康服务', '养老服务',
                '环保服务', '节能服务', '资源回收',
                '金融服务', '投资服务', '资产管理'
              ]
              // 排除行业关键词列表中的板块
              return !strictIndustryKeywords.includes(name)
            }
            
            // 方法5：使用名称关键词匹配（已注释，暂时不使用）
            // const conceptKeywords = [
            //   // AI相关
            //   'AI', '人工智能', 'ChatGPT', 'Sora', 'Kimi', 'AIGC', '多模态', '文生视频', '文生图', '大模型',
            //   'AI制药', 'AI语料', 'AI芯片', '智谱AI',
            //   // 芯片相关
            //   '存储芯片', '汽车芯片', '第三代半导体', '第四代半导体', '芯片产业链',
            //   // 机器人相关
            //   '机器人', '人形机器人', '工业机器人', '服务机器人', '机器人执行器',
            //   // 智能相关
            //   '智能驾驶', '自动驾驶', '无人驾驶', '车联网', '智能汽车',
            //   // 新能源相关
            //   '光伏', '风电', '储能', '氢能', '锂电池', '钠电池', '固态电池', '钙钛矿', 'HJT', 'TOPCon', 'BC电池',
            //   // 数字相关
            //   '数字货币', '数字人民币', '区块链', '元宇宙', 'Web3', 'NFT',
            //   // 数据相关
            //   '数据要素', '数据确权', '数据安全', '数据交易', '数据资产',
            //   // 信创相关
            //   //   '信创', '国产软件', '国产芯片', '国产替代', '自主可控',
            //   // 航天相关
            //   '卫星', '卫星互联网', '卫星导航', '空间站', '商业航天',
            //   // 医疗生物相关
            //   '人脑工程', 'CAR-T', '细胞疗法', '重组蛋白', '基因测序',
            //   // 其他新兴概念
            //   '同步磁阻电机', '减速器', '3D玻璃', '噪声防治',
            //   'UWB', '碳纤', 'PEEK', '华为', '跨境', '支付',
            //   '飞行汽车', '低空经济', 'eVTOL',
            //   '量子', '量子通信', '量子计算',
            //   '6G', 'MR', 'VR', 'AR', 'XR',
            //   '超导', '室温超导', '可控核聚变',
            //   '减肥药', '创新药', 'CRO', 'CDMO',
            //   '辅助生殖', '养老', '医美', '医疗美容',
            //   'PLC', '产业链'
            // ]
            // 
            // const industryKeywords = [
            //   '银行', '保险', '证券', '房地产开发', '建筑', '建材', '水泥', '钢铁', '有色金属', '煤炭', '石油',
            //   '电力', '公用事业', '交通运输', '物流', '港口', '航运', '航空机场', '铁路公路',
            //   '汽车整车', '汽车零部件', '家电', '食品饮料', '酿酒', '餐饮', '旅游酒店', '商业百货', '商业零售',
            //   '纺织服装', '轻工', '造纸', '印刷', '包装', '家具', '装饰', '装修', '机械', '设备',
            //   '医药商业', '医疗服务', '医疗器械', '农业', '畜牧', '渔业', '林业', '种植', '化肥', '农药', '种子',
            //   '通信服务', '通信设备', '电子元件', '电子化学品', '计算机设备', '文化传媒', '教育', '体育', '娱乐', '影视',
            //   '船舶制造', '贵金属', '生物制品', '化学制药', '互联网服务', '能源金属', '软件开发',
            //   '专业服务', '装修装饰', '中药', '消费电子', '美容护理', '风电设备', '装修建材', '非金属材料',
            //   '仪器仪表', '玻璃玻纤', '小金属', '采掘行业', '环保行业', '房地产服务', '贸易行业', '电网设备',
            //   '电源设备', '化学制品', '光伏设备', '专用设备', '工程建设', '燃气', '包装材料',
            //   '化学原料', '综合行业', '光学光电子', '塑料制品', '珠宝首饰', '通用设备', '工程咨询服务',
            //   '交运设备', '化纤行业', '工程机械', '农牧饲渔', '造纸印刷', '水泥建材', '多元金融',
            //   '汽车服务', '钢铁行业', '石油行业', '航运港口', '电机', '铁路公路',
            //   '化工', '化学', '零售', '百货', '传媒', '文化', '影视', '娱乐', '体育'
            // ]
            // 
            // // 特殊的"工程"相关处理
            // const engineeringConceptKeywords = ['算力', '光通信', '智能', 'AI', '芯片', '机器人', '新能源', '储能', '氢能']
            // const hasEngineeringConcept = name.includes('工程') && engineeringConceptKeywords.some(ck => name.includes(ck))
            // 
            // if (filterType === 'industry') {
            //   // 行业板块过滤逻辑：
            //   // 1. 如果包含"概念"、"题材"、"主题"，肯定不是行业
            //   if (name.includes('概念') || name.includes('题材') || name.includes('主题')) {
            //     return false
            //   }
            //   // 2. 如果包含概念关键词，不是行业
            //   if (conceptKeywords.some(keyword => name.includes(keyword))) {
            //     return false
            //   }
            //   // 3. 如果包含行业关键词，且不包含概念关键词，是行业
            //   const isInIndustryList = industryKeywords.some(keyword => {
            //     if (name.includes(keyword)) {
            //       // 特殊处理：如果包含"工程"且前面有概念关键词，则不是行业
            //       if (hasEngineeringConcept) {
            //         return false
            //       }
            //       return true
            //     }
            //     return false
            //   })
            //   if (isInIndustryList) {
            //     return true
            //   }
            //   // 4. 如果既不在行业列表也不在概念列表，且不包含"概念"等，也认为是行业（默认）
            //   return true
            // } else {
            //   // 概念板块过滤逻辑：
            //   // 1. 如果包含"概念"、"题材"、"主题"，肯定是概念
            //   if (name.includes('概念') || name.includes('题材') || name.includes('主题')) {
            //     return true
            //   }
            //   // 2. 如果包含概念关键词，是概念
            //   if (conceptKeywords.some(keyword => name.includes(keyword))) {
            //     return true
            //   }
            //   // 3. 如果包含行业关键词，且不包含概念关键词，不是概念
            //   const isInIndustryList = industryKeywords.some(keyword => {
            //     if (name.includes(keyword)) {
            //       // 特殊处理：如果包含"工程"且前面有概念关键词，则不是行业（是概念）
            //       if (hasEngineeringConcept) {
            //         return false
            //       }
            //       return true
            //     }
            //     return false
            //   })
            //   if (isInIndustryList) {
            //     return false
            //   }
            //   // 4. 如果既不在行业列表也不在概念列表，且不包含"概念"等，也认为是概念（默认）
            //   return true
            // }
            
            // 如果所有方法都没有匹配到，返回false（不使用关键词匹配）
            return false
          })
          
          // 确定最终使用的匹配方法
          if (hasApiMatch) {
            matchMethod = 'api'
          } else if (hasApiMapMatch) {
            matchMethod = 'apiMap'
          } else {
            matchMethod = 'keywordFallback'
          }
          
          // 调试信息：显示过滤前后的对比
          if (filterType === 'concept') {
            console.log(`🔍 概念板块过滤详情 (日期: ${date}):`)
            console.log(`  原始数据: ${plateStockData.length} 个`)
            console.log(`  过滤后: ${filteredData.length} 个`)
            if (matchMethod === 'api') {
              console.log(`  匹配方法: API类型字段`)
            } else if (matchMethod === 'apiMap') {
              // console.log(`  匹配方法: 东方财富接口映射 (映射表: ${sectorTypeMap.size}个板块)`) // 已注释东方财富接口
              console.log(`  匹配方法: 关键词匹配`)
            } else {
              console.log(`  匹配方法: 名称关键词匹配 (fallback)`)
            }
            if (plateStockData.length > 0) {
              const sampleNames = plateStockData.slice(0, 20).map((p: any) => p.secu_name || p.name)
              console.log(`  前20个原始板块:`, sampleNames)
              
              // 分析哪些被过滤掉了
              const filteredOut = plateStockData.filter((plate: any) => {
                const name = String(plate.secu_name || plate.name || '').trim()
                // 检查是否被过滤掉（不在filteredData中）
                return !filteredData.some((f: any) => (f.secu_name || f.name || '').trim() === name)
              }).slice(0, 10)
              
              if (filteredOut.length > 0) {
                console.log(`  被过滤掉的板块（前10个）:`, filteredOut.map((p: any) => p.secu_name || p.name))
              }
            }
            if (filteredData.length > 0) {
              const filteredNames = filteredData.slice(0, 20).map((p: any) => p.secu_name || p.name)
              console.log(`  前20个过滤后板块:`, filteredNames)
            } else {
              console.warn(`  ⚠️ 过滤后无数据！`)
              console.warn(`  匹配策略说明：`)
              console.warn(`    1. 检查是否包含"概念"、"题材"、"主题"`)
              console.warn(`    2. 检查是否包含概念关键词（如"智能驾驶"、"AI"等）`)
              console.warn(`    3. 排除明确的行业板块（如"银行"、"保险"等）`)
              console.warn(`    4. 其他情况都认为是概念板块`)
              console.warn(`  ⚠️ 过滤后无数据，请检查关键词列表是否完整`)
            }
          }
          
          console.log(`📊 ${filterType === 'industry' ? '行业' : '概念'}板块过滤: ${filteredData.length} 个 (总共 ${plateStockData.length} 个)`)
          
          // 计算匹配度：使用接口映射匹配的板块数量 / 总板块数量
          let matchedByApiMapCount = 0
          if (sectorTypeMapLoaded && sectorTypeMap.size > 0) {
            // 重新统计使用接口映射匹配的板块数量（简化统计）
            filteredData.forEach((plate: any) => {
              const name = String(plate.secu_name || plate.name || '').trim()
              const cleanName = (n: string) => n.replace(/概念$|题材$|主题$|行业$|板块$|产业链$/, '').trim()
              const nameCleaned = cleanName(name)
              
              // 检查是否在映射表中
              if (sectorTypeMap.has(name) || sectorTypeMap.has(nameCleaned)) {
                matchedByApiMapCount++
              } else {
                // 检查是否通过包含匹配
                for (const [mappedName] of sectorTypeMap.entries()) {
                  const mappedNameCleaned = cleanName(mappedName)
                  if (name === mappedName || nameCleaned === mappedNameCleaned ||
                      name.includes(mappedName) || mappedName.includes(name) ||
                      nameCleaned.includes(mappedNameCleaned) || mappedNameCleaned.includes(nameCleaned)) {
                    matchedByApiMapCount++
                    break
                  }
                }
              }
            })
          }
          
          const matchRatio = filteredData.length > 0 ? (matchedByApiMapCount / filteredData.length) : 0
          const isLowMatchRatio = matchRatio < 0.5 && sectorTypeMapLoaded && sectorTypeMap.size > 0
          
          // 数据量检查：如果过滤后数据太少，使用降级方案
          if (filteredData.length === 0) {
            console.warn(`⚠️ 过滤后无数据！类型: ${filterType}, 日期: ${date}`)
            console.warn(`原始数据量: ${plateStockData.length}`)
            if (plateStockData.length > 0) {
              console.warn(`前10个板块名称:`, plateStockData.slice(0, 10).map((p: any) => p.secu_name || p.name || '未知'))
            }
            
            // 降级方案：如果过滤后为空，使用更宽松的策略
            if (plateStockData.length > 0) {
              let fallbackData: any[] = []
              
              if (filterType === 'concept') {
                // 概念板块降级方案：排除明确的行业板块，剩下的都当作概念
                console.warn(`🔄 概念板块过滤后为空，使用降级方案：显示所有非明确行业板块`)
                const strictIndustryKeywords = [
                  // 金融业
                  '银行', '保险', '证券', '多元金融', '金融', '信托', '期货', '基金', '租赁', '担保',
                  // 房地产业
                  '房地产开发', '房地产服务', '房地产', '物业管理', '园区开发',
                  // 建筑业
                  '建筑', '建材', '水泥', '水泥建材', '工程建设', '工程机械', '工程咨询服务', '装修装饰', '装修建材', '装饰', '装修',
                  // 采矿业
                  '采掘行业', '采掘', '煤炭', '石油', '石油行业', '钢铁', '钢铁行业', '有色金属', '贵金属', '小金属', '能源金属',
                  // 制造业 - 基础材料
                  '化工', '化学', '化学原料', '化学制品', '化学制药', '化纤行业', '化纤', '塑料制品', '橡胶', '玻璃玻纤', '非金属材料', '包装材料',
                  // 制造业 - 机械设备
                  '机械', '设备', '通用设备', '专用设备', '工程机械', '交运设备', '电机', '电源设备', '电网设备', '风电设备', '光伏设备', '仪器仪表',
                  // 制造业 - 电子
                  '电子元件', '电子化学品', '消费电子', '光学光电子', '计算机设备',
                  // 制造业 - 汽车
                  '汽车整车', '汽车零部件', '汽车服务',
                  // 制造业 - 家电
                  '家电',
                  // 制造业 - 轻工
                  '轻工', '纺织服装', '造纸', '造纸印刷', '印刷', '包装', '家具', '珠宝首饰',
                  // 制造业 - 食品
                  '食品饮料', '酿酒',
                  // 制造业 - 医药
                  '医药商业', '医疗服务', '医疗器械', '生物制品', '中药',
                  // 电力、热力、燃气及水生产和供应业
                  '电力', '公用事业', '燃气', '水务', '热力',
                  // 交通运输、仓储和邮政业
                  '交通运输', '物流', '港口', '航运', '航运港口', '航空机场', '铁路公路', '高速公路', '机场', '航空', '铁路', '公路', '水运', '仓储',
                  // 信息传输、软件和信息技术服务业
                  '通信服务', '通信设备', '互联网服务', '软件开发', '信息服务', 'IT服务', '云计算', '大数据',
                  // 批发和零售业
                  '商业百货', '商业零售', '零售', '百货', '贸易行业', '贸易', '批发', '超市', '连锁',
                  // 住宿和餐饮业
                  '餐饮', '旅游酒店', '酒店', '旅游', '住宿',
                  // 文化、体育和娱乐业
                  '文化传媒', '传媒', '文化', '影视', '娱乐', '体育', '游戏', '出版', '广告', '演艺',
                  // 教育
                  '教育', '培训', '在线教育',
                  // 科学研究和技术服务业
                  '专业服务', '咨询服务', '技术服务', '检测服务', '认证服务',
                  // 水利、环境和公共设施管理业
                  '环保行业', '环保', '水务', '园林', '绿化',
                  // 居民服务、修理和其他服务业
                  '美容护理', '美发', '洗浴', '家政', '维修',
                  // 综合
                  '综合行业', '综合',
                  // 其他常见行业名称
                  '船舶制造', '船舶', '航空装备', '航天装备', '军工', '国防', '安防', '消防',
                  '通信', '电信', '移动通信', '固定通信',
                  '农业', '畜牧', '渔业', '林业', '种植', '化肥', '农药', '种子', '农牧饲渔', '农牧',
                  '新能源', '清洁能源', '传统能源',
                  '新材料', '复合材料',
                  '生物医药', '医药', '医疗',
                  '纺织', '服装', '鞋帽',
                  '食品', '饮料', '乳制品',
                  '建筑装饰', '装修材料',
                  '金属制品', '金属加工',
                  '电气设备', '电气', '电力设备',
                  '通信设备', '网络设备',
                  '计算机', '软件', '硬件',
                  '半导体', '芯片制造',
                  '显示器件', '面板',
                  '电池', '储能设备',
                  '汽车', '摩托车', '自行车',
                  '船舶', '海洋工程',
                  '航空航天', '航天航空', '航空', '航天',
                  '轨道交通', '高铁', '地铁',
                  '物流运输', '快递', '配送',
                  '商业地产', '住宅地产', '工业地产',
                  '零售', '批发', '贸易',
                  '餐饮服务', '酒店服务', '旅游服务',
                  '文化创意', '数字内容', '新媒体',
                  '教育培训', '职业教育', '高等教育',
                  '医疗服务', '健康服务', '养老服务',
                  '环保服务', '节能服务', '资源回收',
                  '金融服务', '投资服务', '资产管理'
                ]
                // 只排除精确匹配的行业板块
                fallbackData = plateStockData.filter((plate: any) => {
                  const name = String(plate.secu_name || plate.name || '').trim()
                  return !strictIndustryKeywords.includes(name)
                })
              } else if (filterType === 'industry') {
                // 行业板块降级方案：只显示在行业关键词列表中的板块
                // 这样逻辑才对称：概念显示非行业，行业显示行业列表中的
                console.warn(`🔄 行业板块过滤后为空，使用降级方案：只显示行业关键词列表中的板块`)
                const strictIndustryKeywords = [
                  // 金融业
                  '银行', '保险', '证券', '多元金融', '金融', '信托', '期货', '基金', '租赁', '担保',
                  // 房地产业
                  '房地产开发', '房地产服务', '房地产', '物业管理', '园区开发',
                  // 建筑业
                  '建筑', '建材', '水泥', '水泥建材', '工程建设', '工程机械', '工程咨询服务', '装修装饰', '装修建材', '装饰', '装修',
                  // 采矿业
                  '采掘行业', '采掘', '煤炭', '石油', '石油行业', '钢铁', '钢铁行业', '有色金属', '贵金属', '小金属', '能源金属',
                  // 制造业 - 基础材料
                  '化工', '化学', '化学原料', '化学制品', '化学制药', '化纤行业', '化纤', '塑料制品', '橡胶', '玻璃玻纤', '非金属材料', '包装材料',
                  // 制造业 - 机械设备
                  '机械', '设备', '通用设备', '专用设备', '工程机械', '交运设备', '电机', '电源设备', '电网设备', '风电设备', '光伏设备', '仪器仪表',
                  // 制造业 - 电子
                  '电子元件', '电子化学品', '消费电子', '光学光电子', '计算机设备',
                  // 制造业 - 汽车
                  '汽车整车', '汽车零部件', '汽车服务',
                  // 制造业 - 家电
                  '家电',
                  // 制造业 - 轻工
                  '轻工', '纺织服装', '造纸', '造纸印刷', '印刷', '包装', '家具', '珠宝首饰',
                  // 制造业 - 食品
                  '食品饮料', '酿酒',
                  // 制造业 - 医药
                  '医药商业', '医疗服务', '医疗器械', '生物制品', '中药',
                  // 电力、热力、燃气及水生产和供应业
                  '电力', '公用事业', '燃气', '水务', '热力',
                  // 交通运输、仓储和邮政业
                  '交通运输', '物流', '港口', '航运', '航运港口', '航空机场', '铁路公路', '高速公路', '机场', '航空', '铁路', '公路', '水运', '仓储',
                  // 信息传输、软件和信息技术服务业
                  '通信服务', '通信设备', '互联网服务', '软件开发', '信息服务', 'IT服务', '云计算', '大数据',
                  // 批发和零售业
                  '商业百货', '商业零售', '零售', '百货', '贸易行业', '贸易', '批发', '超市', '连锁',
                  // 住宿和餐饮业
                  '餐饮', '旅游酒店', '酒店', '旅游', '住宿',
                  // 文化、体育和娱乐业
                  '文化传媒', '传媒', '文化', '影视', '娱乐', '体育', '游戏', '出版', '广告', '演艺',
                  // 教育
                  '教育', '培训', '在线教育',
                  // 科学研究和技术服务业
                  '专业服务', '咨询服务', '技术服务', '检测服务', '认证服务',
                  // 水利、环境和公共设施管理业
                  '环保行业', '环保', '水务', '园林', '绿化',
                  // 居民服务、修理和其他服务业
                  '美容护理', '美发', '洗浴', '家政', '维修',
                  // 综合
                  '综合行业', '综合',
                  // 其他常见行业名称
                  '船舶制造', '船舶', '航空装备', '航天装备', '军工', '国防', '安防', '消防',
                  '通信', '电信', '移动通信', '固定通信',
                  '农业', '畜牧', '渔业', '林业', '种植', '化肥', '农药', '种子', '农牧饲渔', '农牧',
                  '新能源', '清洁能源', '传统能源',
                  '新材料', '复合材料',
                  '生物医药', '医药', '医疗',
                  '纺织', '服装', '鞋帽',
                  '食品', '饮料', '乳制品',
                  '建筑装饰', '装修材料',
                  '金属制品', '金属加工',
                  '电气设备', '电气', '电力设备',
                  '通信设备', '网络设备',
                  '计算机', '软件', '硬件',
                  '半导体', '芯片制造',
                  '显示器件', '面板',
                  '电池', '储能设备',
                  '汽车', '摩托车', '自行车',
                  '船舶', '海洋工程',
                  '航空航天', '航天航空', '航空', '航天',
                  '轨道交通', '高铁', '地铁',
                  '物流运输', '快递', '配送',
                  '商业地产', '住宅地产', '工业地产',
                  '零售', '批发', '贸易',
                  '餐饮服务', '酒店服务', '旅游服务',
                  '文化创意', '数字内容', '新媒体',
                  '教育培训', '职业教育', '高等教育',
                  '医疗服务', '健康服务', '养老服务',
                  '环保服务', '节能服务', '资源回收',
                  '金融服务', '投资服务', '资产管理'
                ]
                // 行业板块降级方案：显示所有不明确是概念的板块（更宽松的策略）
                // 只排除明确包含"概念"、"题材"、"主题"的板块，其他都当作行业
                fallbackData = plateStockData.filter((plate: any) => {
                  const name = String(plate.secu_name || plate.name || '').trim()
                  // 如果包含"概念"、"题材"、"主题"，肯定是概念，排除
                  if (name.includes('概念') || name.includes('题材') || name.includes('主题')) {
                    return false
                  }
                  // 排除一些明确的概念关键词（但只排除完全匹配或明确的概念词）
                  const explicitConceptKeywords = [
                    'AI应用', 'AI智能体', 'AI眼镜', 'AI制药', 'AI语料', 'AI芯片',
                    '机器人概念', '芯片产业链', '人脑工程', '商业航天', '智能驾驶',
                    '数字货币', '创新药', '算力工程', '光刻胶', '金融科技',
                    '液冷IDC', 'AI智能体', 'AI眼镜', '可控核聚变', '人脑工程'
                  ]
                  // 只排除完全匹配的概念关键词
                  if (explicitConceptKeywords.includes(name)) {
                    return false
                  }
                  // 其他都当作行业显示
                  return true
                })
              }
              
              if (fallbackData.length > 0) {
                console.log(`✅ 降级方案获取到 ${fallbackData.length} 个板块`)
                // 使用降级数据
                const fallbackSectors = fallbackData
                  .map((plate: any) => {
                    const name = plate.secu_name || plate.name || plate.plate_name || ''
                    const code = plate.secu_code || plate.code || plate.plate_code || ''
                    const changeValue = plate.change_percent || plate.change || plate.changePercent || 0
                    const changePercent = Math.abs(changeValue) > 1 ? changeValue : changeValue * 100
                    
                    return {
                      name: String(name).trim(),
                      code: String(code).trim(),
                      changePercent: parseFloat(String(changePercent)) || 0,
                      rank: 0,
                      date: date
                    }
                  })
                  .filter((s: SectorData) => s.name && s.name.length > 0)
                  .sort((a: SectorData, b: SectorData) => b.changePercent - a.changePercent)
                  .map((sector: SectorData, index: number) => ({
                    ...sector,
                    rank: index + 1
                  }))
                  .slice(0, topN)
                
                // 返回正确格式：{ sectors, rawData }
                return { sectors: fallbackSectors, rawData: fallbackData }
              }
            }
            
            // 如果原始数据有，但过滤后为空，可能是过滤逻辑太严格
            // 返回空数组，让用户知道需要调整过滤条件
          } else if (filteredData.length < plateStockData.length * 0.1) {
            // 如果过滤后数据少于总数的10%，给出警告
            console.warn(`⚠️ 过滤后数据较少！类型: ${filterType}, 日期: ${date}`)
            console.warn(`过滤后: ${filteredData.length} 个，原始: ${plateStockData.length} 个 (${(filteredData.length / plateStockData.length * 100).toFixed(1)}%)`)
          }
          
          // 解析板块数据
          const sectors: SectorData[] = filteredData
            .map((plate: any) => {
              // 财联社API可能返回的字段：secu_code, code, plate_code等
              // 打印第一个板块的完整数据用于调试，检查是否有类型字段
              if (filteredData.indexOf(plate) === 0) {
                console.log('📊 财联社板块完整数据结构:', plate)
                console.log('📊 财联社板块所有字段:', Object.keys(plate))
                // 检查是否有类型相关字段
                const typeRelatedFields = Object.keys(plate).filter(key => 
                  key.toLowerCase().includes('type') || 
                  key.toLowerCase().includes('category') || 
                  key.toLowerCase().includes('kind') ||
                  key.toLowerCase().includes('class')
                )
                if (typeRelatedFields.length > 0) {
                  console.log('✅ 发现可能的类型字段:', typeRelatedFields)
                  typeRelatedFields.forEach(field => {
                    console.log(`  ${field}:`, plate[field])
                  })
                } else {
                  console.log('ℹ️ API未返回类型字段，使用接口映射或关键词匹配')
                }
              }
              
              // 尝试多种可能的字段名
              const name = plate.secu_name || plate.name || plate.plate_name || ''
              const code = plate.secu_code || plate.code || plate.plate_code || ''
              // 涨跌幅可能是百分比（如 5.2 表示 5.2%）或小数（如 0.052 表示 5.2%）
              const changeValue = plate.change_percent || plate.change || plate.changePercent || 0
              const changePercent = Math.abs(changeValue) > 1 ? changeValue : changeValue * 100
              
              return {
                name: String(name).trim(),
                code: String(code).trim(),
                changePercent: parseFloat(String(changePercent)) || 0,
                rank: 0, // 稍后排序后设置
                date: date
              }
            })
            .filter((s: SectorData) => s.name && s.name.length > 0) // 过滤掉空名称
            .sort((a: SectorData, b: SectorData) => b.changePercent - a.changePercent)
            .map((sector: SectorData, index: number) => ({
              ...sector,
              rank: index + 1
            }))
            .slice(0, topN) // 只取前N名
          
          console.log(`✅ ${filterType === 'industry' ? '行业' : '概念'}板块数据: ${sectors.length} 个`)
          if (sectors.length > 0) {
            console.log('📊 前3个板块代码:', sectors.slice(0, 3).map(s => ({ name: s.name, code: s.code })))
          }
          
          // 返回处理后的板块数据和原始数据
          return { sectors, rawData: filteredData }
        }
      } catch (err) {
        console.warn(`代理 ${proxy} 失败:`, err)
        continue
      }
    }
    
    return { sectors: [], rawData: [] }
  }, [topN, filterType, sectorTypeMap, sectorTypeMapLoaded])

  // 获取所有日期的数据
  useEffect(() => {
    if (selectedDates.length === 0) return

    const fetchAllDates = async () => {
      console.log(`🔄 开始获取所有日期数据，类型: ${filterType}`)
      setLoading(true)
      setError(null)
      // 清空旧数据，避免显示混合数据
      setSectorDataByDate({})
      setPlateRawDataByDate({})
      
      try {
        // 直接获取数据，不依赖外部概念列表
        const dataPromises = selectedDates.map(date => fetchSectorData(date))
        const results = await Promise.allSettled(dataPromises)
        
        const dataByDate: Record<string, SectorData[]> = {}
        const rawDataByDate: Record<string, any[]> = {}
        
        results.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value && result.value.sectors && result.value.sectors.length > 0) {
            // 只保留有数据的日期
            dataByDate[selectedDates[index]] = result.value.sectors
            // 同时保存原始数据
            rawDataByDate[selectedDates[index]] = result.value.rawData || []
            console.log(`✅ ${selectedDates[index]} 获取到 ${result.value.sectors.length} 个${filterType === 'industry' ? '行业' : '概念'}板块`)
          } else {
            console.warn(`获取 ${selectedDates[index]} 的数据失败或无数据:`, result.status === 'fulfilled' ? '空数据' : result.reason)
            // 不添加到 dataByDate，这样渲染时就不会显示该列
          }
        })
        
        console.log(`📊 所有日期数据获取完成，共 ${Object.keys(dataByDate).length} 个日期有数据`)
        setSectorDataByDate(dataByDate)
        setPlateRawDataByDate(rawDataByDate)
        
        // 检查匹配度：统计所有日期中使用接口映射匹配的板块比例
        // 注意：这里统计的是"通过接口映射匹配"的板块，不包括使用关键词匹配的板块
        let totalFiltered = 0
        let totalMatchedByApiMap = 0
        let unmatchedSectors: string[] = [] // 记录未匹配的板块名称，用于调试
        const cleanName = (n: string) => n.replace(/概念$|题材$|主题$|行业$|板块$|产业链$/, '').trim()
        
        Object.values(dataByDate).forEach((sectors: SectorData[]) => {
          totalFiltered += sectors.length
          sectors.forEach(sector => {
            const name = sector.name
            const nameCleaned = cleanName(name)
            
            // 检查是否通过接口映射匹配（使用与过滤逻辑一致的匹配方式）
            let matched = false
            
            // 1. 精确匹配
            if (sectorTypeMap.has(name) || sectorTypeMap.has(nameCleaned)) {
              matched = true
            } else {
              // 2. 包含匹配（更宽松）
              for (const [mappedName] of sectorTypeMap.entries()) {
                const mappedNameCleaned = cleanName(mappedName)
                
                // 双向包含匹配（与过滤逻辑一致）
                if (name === mappedName || nameCleaned === mappedNameCleaned ||
                    name.includes(mappedName) || mappedName.includes(name) ||
                    nameCleaned.includes(mappedNameCleaned) || mappedNameCleaned.includes(nameCleaned) ||
                    name.includes(mappedNameCleaned) || mappedNameCleaned.includes(name) ||
                    mappedName.includes(nameCleaned) || nameCleaned.includes(mappedName)) {
                  matched = true
                  break
                }
                
                // 3. 关键词匹配（至少3个字，与过滤逻辑一致）
                const extractKeywords = (n: string) => {
                  const keywords: string[] = []
                  for (let len = 6; len >= 3; len--) {
                    for (let i = 0; i <= n.length - len; i++) {
                      const keyword = n.substring(i, i + len)
                      if (keyword.length >= 3) {
                        keywords.push(keyword)
                      }
                    }
                  }
                  return keywords
                }
                
                const nameKeywords = extractKeywords(nameCleaned)
                const mappedKeywords = extractKeywords(mappedNameCleaned)
                const commonKeywords = nameKeywords.filter(k => 
                  mappedKeywords.some(mk => k === mk && k.length >= 3)
                )
                
                if (commonKeywords.length > 0) {
                  matched = true
                  break
                }
              }
            }
            
            if (matched) {
              totalMatchedByApiMap++
            } else {
              // 记录未匹配的板块（最多记录10个）
              if (unmatchedSectors.length < 10 && !unmatchedSectors.includes(name)) {
                unmatchedSectors.push(name)
              }
            }
          })
        })
        
        const overallMatchRatio = totalFiltered > 0 ? (totalMatchedByApiMap / totalFiltered) : 0
        const unmatchedCount = totalFiltered - totalMatchedByApiMap
        console.log(`📊 匹配度统计: ${totalMatchedByApiMap}/${totalFiltered} = ${(overallMatchRatio * 100).toFixed(1)}%`)
        console.log(`  - 通过接口映射匹配: ${totalMatchedByApiMap} 个`)
        console.log(`  - 使用关键词匹配: ${unmatchedCount} 个`)
        if (unmatchedSectors.length > 0) {
          console.log(`  ⚠️ 使用关键词匹配的板块示例（前10个）:`, unmatchedSectors)
        }
        
        // 如果匹配度低于90%，显示警告（已注释东方财富接口，暂时不显示匹配度警告）
        // if (overallMatchRatio < 0.9 && sectorTypeMapLoaded && sectorTypeMap.size > 0 && totalFiltered > 0) {
        //   const matchPercent = (overallMatchRatio * 100).toFixed(1)
        //   setMatchWarning(`⚠️ 板块名称匹配度较低（${matchPercent}%），有 ${unmatchedCount} 个板块未在东方财富映射表中找到，已使用关键词匹配分类。这些板块的分类准确性可能较低，建议结合板块名称自行判断。`)
        // } else {
        //   setMatchWarning(null)
        // }
        // 暂时禁用匹配度警告（因为不使用东方财富接口）
        setMatchWarning(null)
        
      } catch (err) {
        console.error('获取数据失败:', err)
        setError('获取数据失败，请稍后重试')
      } finally {
        setLoading(false)
      }
    }

    // 等待板块类型映射加载完成后再获取数据（优先使用财联社接口）
    // 如果财联社接口加载失败或超时，也要加载数据
    if (caiLianSheTypeMapLoaded) {
      fetchAllDates()
    } else {
      // 如果财联社接口加载时间过长（超过3秒），直接加载数据
      const timeout = setTimeout(() => {
        if (!caiLianSheTypeMapLoaded) {
          console.warn('⚠️ 财联社接口加载超时，直接使用关键词匹配加载数据')
          fetchAllDates()
        }
      }, 3000)
      return () => clearTimeout(timeout)
    }
  }, [selectedDates, fetchSectorData, filterType, caiLianSheTypeMapLoaded])

  // 获取板块热门股票（直接使用财联社返回的stock_list）
  const fetchHotStocks = useCallback(async (sectorCode: string, sectorName: string): Promise<HotStock[]> => {
    console.log(`🔍 获取热门股票，板块代码: ${sectorCode}, 板块名称: ${sectorName}`)
    
    // 从已保存的财联社原始数据中查找对应的板块
    // 遍历所有日期的原始数据，查找匹配的板块
    for (const date in plateRawDataByDate) {
      const rawData = plateRawDataByDate[date]
      if (!rawData || !Array.isArray(rawData)) continue
      
      // 查找匹配的板块（通过代码或名称）
      const matchedPlate = rawData.find((plate: any) => {
        const plateCode = String(plate.secu_code || plate.code || plate.plate_code || '').trim()
        const plateName = String(plate.secu_name || plate.name || '').trim()
        return (sectorCode && plateCode === sectorCode) || (sectorName && plateName === sectorName)
      })
      
      if (matchedPlate && matchedPlate.stock_list && Array.isArray(matchedPlate.stock_list)) {
        console.log(`✅ 从财联社数据中找到板块，股票数量: ${matchedPlate.stock_list.length}`)
        
        // 解析财联社返回的股票数据
        // secu_code: 股票代码
        // secu_name: 股票名称
        // last_px: 最新价
        // change: 涨跌幅（小数形式，需要乘以100）
        // volume: 成交量（可能需要转换单位）
        // amount: 成交额（可能需要转换单位）
        const stocks: HotStock[] = matchedPlate.stock_list
          .map((stock: any) => {
            // 股票代码可能是6位数字，需要确保格式正确
            let code = String(stock.secu_code || stock.code || '').trim()
            // 如果代码包含非数字字符，只保留数字部分
            const codeDigits = code.replace(/[^0-9]/g, '')
            // 如果提取到6位数字，使用提取的数字；否则使用原始代码
            code = codeDigits.length === 6 ? codeDigits : code
            const name = stock.secu_name || ''
            const price = parseFloat(stock.last_px || stock.price || 0)
            // change 是小数形式，如 0.0997 表示 9.97%，需要乘以100
            const changePercent = parseFloat(stock.change || 0) * 100
            // 成交量单位可能是手，需要确认
            const volume = parseFloat(stock.volume || stock.vol || 0)
            // 成交额单位可能是元，需要转换为万元
            const amount = parseFloat(stock.amount || stock.amt || 0) / 10000
            
            return {
              code,
              name,
              price,
              changePercent,
              volume,
              amount
            }
          })
          .filter((s: HotStock) => s.name && s.code)
          .sort((a: HotStock, b: HotStock) => b.changePercent - a.changePercent) // 按涨跌幅排序
          .slice(0, 20) // 只取前20只
        
        console.log(`✅ 成功解析 ${stocks.length} 只热门股票`)
        return stocks
      }
    }
    
    console.warn(`⚠️ 未在财联社数据中找到板块: ${sectorName} (代码: ${sectorCode})`)
    return []
  }, [plateRawDataByDate])

  // 处理板块点击
  const handleSectorClick = async (sector: SectorData) => {
    console.log('🖱️ 点击板块:', { name: sector.name, code: sector.code, date: sector.date })
    
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
    if (sector.code || sector.name) {
      console.log('📥 开始获取热门股票，参数:', { code: sector.code, name: sector.name })
      setLoadingHotStocks(true)
      setHotStocks([]) // 先清空，避免显示旧数据
      try {
        const stocks = await fetchHotStocks(sector.code, sector.name)
        console.log('✅ 热门股票获取完成，数量:', stocks.length)
        setHotStocks(stocks)
      } catch (err) {
        console.error('❌ 获取热门股票失败:', err)
        setHotStocks([])
      } finally {
        setLoadingHotStocks(false)
      }
    } else {
      console.warn('⚠️ 板块代码和名称都为空，无法获取热门股票')
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

  // 根据股票代码生成K线图URL（使用同花顺）
  const getStockKLineUrl = (code: string, name?: string): string => {
    if (!code) {
      console.warn(`⚠️ 股票代码为空`)
      return ''
    }
    
    console.log(`🔍 处理股票代码: ${code}, 名称: ${name}`)
    
    // 清理代码，移除所有非数字字符，只保留数字
    let cleanCode = code.replace(/[^0-9]/g, '')
    console.log(`🔍 清理后的代码: ${cleanCode}`)
    
    // 如果代码长度不足6位，尝试补齐前导0
    if (cleanCode.length > 0 && cleanCode.length < 6) {
      cleanCode = cleanCode.padStart(6, '0')
      console.log(`🔍 补齐后的代码: ${cleanCode}`)
    }
    
    if (!cleanCode || cleanCode.length !== 6) {
      console.warn(`⚠️ 股票代码格式不正确: ${code} -> ${cleanCode}`)
      // 如果代码格式不对，尝试使用股票名称搜索（雪球）
      if (name) {
        return `https://xueqiu.com/S/${encodeURIComponent(name)}`
      }
      return ''
    }
    
    // 判断交易所并生成URL（优先使用新浪，备用雪球）
    // 上交所：60开头（主板）或688开头（科创板）
    // 深交所：00开头（主板）或30开头（创业板）
    // 北交所：920开头（如920207）
    let url = ''
    
    // 检查是否是北交所（920开头）
    if (cleanCode.startsWith('920')) {
      // 北交所 - 确保代码有效（至少6位）
      if (cleanCode.length >= 6) {
        // 新浪格式：bj{code}（小写bj前缀）
        url = `https://quotes.sina.cn/hs/company/quotes/view/bj${cleanCode}`
      } else {
        // 备用雪球格式：BJ{code}（大写BJ前缀）
        url = `https://xueqiu.com/S/BJ${cleanCode}`
      }
    } else if (cleanCode.startsWith('60') || cleanCode.startsWith('688')) {
      // 上交所 - 新浪格式：sh{code}
      url = `https://quotes.sina.cn/hs/company/quotes/view/sh${cleanCode}`
    } else if (cleanCode.startsWith('00') || cleanCode.startsWith('30')) {
      // 深交所 - 新浪格式：sz{code}
      url = `https://quotes.sina.cn/hs/company/quotes/view/sz${cleanCode}`
    } else {
      // 其他情况，使用雪球搜索
      console.warn(`⚠️ 无法识别股票代码格式: ${code} -> ${cleanCode}`)
      if (cleanCode.length === 6) {
        // 尝试使用雪球格式
        url = `https://xueqiu.com/S/SH${cleanCode}`
      } else {
        url = `https://xueqiu.com/S/${cleanCode}`
      }
    }
    
    console.log(`✅ 生成的URL: ${url}`)
    return url
  }

  // 处理股票点击
  const handleStockClick = (stock: HotStock) => {
    console.log(`🖱️ 点击股票: ${stock.name} (${stock.code})`)
    const url = getStockKLineUrl(stock.code, stock.name)
    console.log(`🔗 生成的K线图URL: ${url}`)
    if (url) {
      window.open(url, '_blank')
    } else {
      console.warn(`⚠️ 无法生成股票K线图URL: ${stock.name} (${stock.code})`)
    }
  }

  // 计算板块在已有数据中涨幅超过1%的次数（从右往左，最多统计7个有数据的日期）
  const getOver1PercentCount = useCallback((sectorName: string, sectorCode: string): number => {
    let count = 0
    let foundCount = 0 // 已找到的有数据的日期数量（最多7个）
    
    // 获取所有有数据的日期，按日期从新到旧排序
    const allDates = Object.keys(plateRawDataByDate)
      .filter(date => plateRawDataByDate[date] && plateRawDataByDate[date].length > 0)
      .sort((a, b) => b.localeCompare(a)) // 从新到旧排序（从右往左）
    
    // 从右往左遍历，找到该板块出现且涨幅超过1%的日期
    for (const date of allDates) {
      if (foundCount >= 7) break // 最多统计7个有数据的日期
      
      // 先从筛选后的数据中查找（前N名）
      let sectors = sectorDataByDate[date] || []
      let sector = sectors.find(s => s.name === sectorName && s.code === sectorCode)
      
      // 如果在前N名中没找到，从原始数据中查找
      if (!sector) {
        const rawData = plateRawDataByDate[date] || []
        const matchedPlate = rawData.find((plate: any) => {
          const plateCode = String(plate.secu_code || plate.code || plate.plate_code || '').trim()
          const plateName = String(plate.secu_name || plate.name || '').trim()
          return (sectorCode && plateCode === sectorCode) || (sectorName && plateName === sectorName)
        })
        
        if (matchedPlate) {
          // 计算涨幅
          const changeValue = matchedPlate.change_percent || matchedPlate.change || matchedPlate.changePercent || 0
          const changePercent = Math.abs(changeValue) > 1 ? changeValue : changeValue * 100
          
          sector = {
            name: sectorName,
            code: sectorCode,
            changePercent: parseFloat(String(changePercent)) || 0
          }
        }
      }
      
      if (sector) {
        foundCount++ // 找到了该板块的数据
        if (sector.changePercent > 1) {
          count++ // 涨幅超过1%，计数+1
        }
      }
    }
    
    return count
  }, [sectorDataByDate, plateRawDataByDate])

  // 获取涨幅超过1%次数的颜色（次数越多颜色越深）
  const getCountColor = (count: number): string => {
    if (count === 0) return '#9ca3af' // 灰色
    if (count === 1) return '#ffffff' // 白色
    if (count === 2) return '#fbbf24' // 浅黄色
    if (count === 3) return '#f59e0b' // 橙色
    if (count === 4) return '#f97316' // 橙红色
    if (count === 5) return '#ef4444' // 红色
    if (count === 6) return '#dc2626' // 深红色
    if (count >= 7) return '#991b1b' // 最深红色
    return '#9ca3af'
  }

  // 获取最近7天的日期列表（用于显示涨停板数量）
  const getLast7Days = useCallback((): string[] => {
    const dates: string[] = []
    const today = new Date()
    
    // 获取最近7天的日期
    for (let i = 0; i < 7; i++) {
      const date = new Date(today)
      date.setDate(today.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      dates.push(dateStr)
    }
    
    return dates.reverse() // 从最早到最新
  }, [])

  // 获取某个板块在某个日期的涨停板数量
  const getSectorLimitUpCount = useCallback((sectorName: string, sectorCode: string, date: string): number => {
    const rawData = plateRawDataByDate[date] || []
    // 查找匹配的板块
    const matchedPlate = rawData.find((plate: any) => {
      const plateCode = String(plate.secu_code || plate.code || plate.plate_code || '').trim()
      const plateName = String(plate.secu_name || plate.name || '').trim()
      return (sectorCode && plateCode === sectorCode) || (sectorName && plateName === sectorName)
    })
    
    if (matchedPlate) {
      return parseInt(matchedPlate.plate_stock_up_num || '0', 10)
    }
    
    return 0
  }, [plateRawDataByDate])

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
            onChange={(e) => {
              const newType = e.target.value as 'industry' | 'concept'
              console.log(`🔄 切换类型: ${filterType} -> ${newType}`)
              setFilterType(newType)
              // 清空选中状态，避免显示旧数据
              setSelectedSector(null)
              setHotStocks([])
            }}
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
                  <div style={{ marginBottom: '12px', fontSize: '1.1rem', fontWeight: '600', color: '#6b7280' }}>
                    暂无数据
                  </div>
                  <div style={{ fontSize: '0.85rem', lineHeight: '1.6', color: '#9ca3af' }}>
                    {loading ? (
                      '正在加载数据...'
                    ) : (
                      <>
                        <div>可能原因：</div>
                        <div style={{ marginTop: '8px', paddingLeft: '20px', textAlign: 'left', display: 'inline-block' }}>
                          <div>• 所选日期没有交易数据（周末或节假日）</div>
                          <div>• 网络请求失败，请刷新重试</div>
                          <div>• 过滤条件过于严格，请尝试切换"行业/概念"类型</div>
                        </div>
                        <div style={{ marginTop: '16px', fontSize: '0.8rem', color: '#d1d5db' }}>
                          提示：请打开浏览器控制台（F12）查看详细日志
                        </div>
                      </>
                    )}
                  </div>
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
                          <td key={date} style={{ padding: '12px', textAlign: 'center', verticalAlign: 'top' }}>
                            {sector ? (
                              <>
                                <div
                                  onClick={() => handleSectorClick(sector)}
                                  style={{
                                    cursor: 'pointer',
                                    padding: '8px',
                                    borderRadius: '6px',
                                    transition: 'background 0.2s',
                                    background: selectedSector?.name === sector.name && selectedSector?.date === date ? '#eff6ff' : 'transparent',
                                    marginBottom: '8px'
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
                                  <div style={{ fontSize: '0.85rem', fontWeight: '500', color: '#1f2937', marginBottom: '4px', position: 'relative' }}>
                                    {sector.name}
                                    {(() => {
                                      const count = getOver1PercentCount(sector.name, sector.code)
                                      if (count > 0) {
                                        return (
                                          <span style={{
                                            position: 'absolute',
                                            top: '-6px',
                                            right: '-6px',
                                            background: getCountColor(count),
                                            color: count === 1 ? '#6b7280' : 'white',
                                            fontSize: '0.65rem',
                                            fontWeight: '700',
                                            padding: '2px 5px',
                                            borderRadius: '10px',
                                            minWidth: '18px',
                                            textAlign: 'center',
                                            lineHeight: '1.2',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                                          }}>
                                            {count}
                                          </span>
                                        )
                                      }
                                      return null
                                    })()}
                                  </div>
                                  <div style={{
                                    fontSize: '0.9rem',
                                    fontWeight: '600',
                                    color: '#dc2626'
                                  }}>
                                    +{sector.changePercent.toFixed(2)}%
                                  </div>
                                </div>
                                {/* 最近7天涨停家数 */}
                                {(() => {
                                  // 获取所有有数据的日期，按日期从新到旧排序
                                  const allDates = Object.keys(sectorDataByDate)
                                    .filter(d => sectorDataByDate[d] && sectorDataByDate[d].length > 0)
                                    .sort((a, b) => b.localeCompare(a)) // 从新到旧
                                  
                                  // 找到当前日期在排序后的位置
                                  const currentDateIndex = allDates.indexOf(date)
                                  
                                  let displayDates: string[] = []
                                  
                                  if (currentDateIndex >= 0) {
                                    // 以当前日期为中心，当前日期在中间（第4个位置，索引3）
                                    // allDates 是从新到旧排序的（索引0是最新，索引越大越旧）
                                    // 位置0,1,2: 后面（更新的日期，索引更小）最多3天
                                    // 位置3: 当前日期
                                    // 位置4,5,6: 前面（更旧的日期，索引更大）至少3天
                                    
                                    // 先确定前面3天的范围（更旧的日期，索引更大）
                                    let endIndex = Math.min(allDates.length - 1, currentDateIndex + 3) // 前面3天的结束索引
                                    
                                    // 检查前面是否有3天
                                    const beforeCount = endIndex - currentDateIndex
                                    
                                    // 确定后面3天的范围（更新的日期，索引更小）
                                    let startIndex = currentDateIndex - 3 // 后面3天的起始索引
                                    
                                    if (beforeCount < 3) {
                                      // 前面不足3天，用后面补齐
                                      const needMore = 3 - beforeCount
                                      startIndex = Math.max(0, startIndex - needMore)
                                    } else {
                                      // 前面有3天，后面最多3天
                                      startIndex = Math.max(0, currentDateIndex - 3)
                                    }
                                    
                                    displayDates = allDates.slice(startIndex, endIndex + 1)
                                    
                                    // 确保当前日期在中间位置（第4个，索引3）
                                    const currentInSlice = displayDates.indexOf(date)
                                    if (currentInSlice >= 0) {
                                      if (currentInSlice !== 3) {
                                        // 需要调整，让当前日期在位置3（中间）
                                        const needMove = 3 - currentInSlice
                                        
                                        if (needMove > 0) {
                                          // 当前日期太靠前，需要往前取更多数据（索引更大）
                                          const canAdd = Math.min(needMove, allDates.length - 1 - endIndex)
                                          if (canAdd > 0) {
                                            endIndex = endIndex + canAdd
                                            displayDates = allDates.slice(startIndex, endIndex + 1)
                                          }
                                        } else if (needMove < 0) {
                                          // 当前日期太靠后，需要往后取更多数据（索引更小）
                                          const canAdd = Math.min(-needMove, startIndex)
                                          if (canAdd > 0) {
                                            startIndex = startIndex - canAdd
                                            displayDates = allDates.slice(startIndex, endIndex + 1)
                                          }
                                        }
                                      }
                                      
                                      // 确保正好7天
                                      if (displayDates.length > 7) {
                                        // 以当前日期为中心，取前后各3天
                                        const currentInSlice2 = displayDates.indexOf(date)
                                        if (currentInSlice2 >= 0) {
                                          startIndex = startIndex + (currentInSlice2 - 3)
                                          endIndex = startIndex + 6
                                          displayDates = allDates.slice(startIndex, endIndex + 1)
                                        }
                                      } else if (displayDates.length < 7) {
                                        // 如果不足7天，尽量保持当前日期在中间
                                        const currentInSlice3 = displayDates.indexOf(date)
                                        if (currentInSlice3 >= 0) {
                                          const needBefore = 3 - currentInSlice3
                                          if (needBefore > 0 && endIndex < allDates.length - 1) {
                                            // 需要往前取更多
                                            const canAdd = Math.min(needBefore, allDates.length - 1 - endIndex)
                                            endIndex = endIndex + canAdd
                                            displayDates = allDates.slice(startIndex, endIndex + 1)
                                          } else if (needBefore < 0 && startIndex > 0) {
                                            // 需要往后取更多
                                            const canAdd = Math.min(-needBefore, startIndex)
                                            startIndex = startIndex - canAdd
                                            displayDates = allDates.slice(startIndex, endIndex + 1)
                                          }
                                        }
                                      }
                                    }
                                  } else {
                                    // 如果当前日期不在数据中，取最近7天
                                    displayDates = allDates.slice(0, 7)
                                  }
                                  
                                  return (
                                    <div style={{ 
                                      display: 'flex', 
                                      gap: '2px', 
                                      justifyContent: 'center',
                                      flexWrap: 'wrap',
                                      marginTop: '4px'
                                    }}>
                                      {displayDates.map((d) => {
                                        const limitUpCount = getSectorLimitUpCount(sector.name, sector.code, d)
                                        const isCurrentDate = d === date
                                        const hasData = !!sectorDataByDate[d]
                                        
                                        return (
                                          <div
                                            key={d}
                                            style={{
                                              padding: '3px 5px',
                                              background: isCurrentDate ? '#eff6ff' : hasData ? '#f9fafb' : '#f3f4f6',
                                              border: isCurrentDate ? '1px solid #3b82f6' : '1px solid #e5e7eb',
                                              borderRadius: '4px',
                                              fontSize: '0.7rem',
                                              minWidth: '24px',
                                              textAlign: 'center',
                                              lineHeight: '1.2'
                                            }}
                                            title={`${formatDateDisplay(d)}: ${limitUpCount}家`}
                                          >
                                            <div style={{ 
                                              fontSize: '0.75rem', 
                                              fontWeight: '600', 
                                              color: hasData && limitUpCount > 0 ? '#dc2626' : '#9ca3af' 
                                            }}>
                                              {hasData ? limitUpCount : '-'}
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )
                                })()}
                              </>
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

          {/* 底部悬浮框：选中板块详情和热门股票 */}
          {selectedSector && (
            <>
              {/* 背景遮罩层 */}
              <div
                onClick={() => setSelectedSector(null)}
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0, 0, 0, 0.5)',
                  zIndex: 998,
                  animation: 'fadeIn 0.3s ease-out'
                }}
              />
              
              {/* 悬浮框 */}
              <div style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'white',
                borderTopLeftRadius: '16px',
                borderTopRightRadius: '16px',
                boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
                zIndex: 999,
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                animation: 'slideUp 0.3s ease-out',
                overflow: 'hidden'
              }}>
                {/* 拖拽指示条 */}
                <div
                  onClick={() => setSelectedSector(null)}
                  style={{
                    width: '40px',
                    height: '4px',
                    background: '#d1d5db',
                    borderRadius: '2px',
                    margin: '12px auto 8px',
                    cursor: 'pointer'
                  }}
                />
                
                {/* 关闭按钮 */}
                <div
                  onClick={() => setSelectedSector(null)}
                  style={{
                    position: 'absolute',
                    top: '12px',
                    right: '16px',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '50%',
                    background: '#f3f4f6',
                    cursor: 'pointer',
                    fontSize: '1.2rem',
                    color: '#6b7280',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#e5e7eb'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#f3f4f6'
                  }}
                >
                  ×
                </div>
                
                {/* 内容区域（可滚动） */}
                <div style={{
                  overflowY: 'auto',
                  padding: '0 20px 20px',
                  flex: 1
                }}>
                  {/* 板块信息 */}
                  <div style={{ marginBottom: '20px', paddingTop: '8px' }}>
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
                  
                  {/* 最近7天涨停板数量 */}
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '1rem', fontWeight: '600', color: '#1f2937', marginBottom: '12px' }}>
                      📊 最近7天涨停板数量
                    </div>
                    {(() => {
                      const last7Days = getLast7Days()
                      const today = new Date().toISOString().split('T')[0]
                      const todayIndex = last7Days.indexOf(today)
                      
                      // 如果今天有数据，从今天开始显示；如果没有，找到最近有数据的日期
                      let displayDates: string[] = []
                      if (todayIndex >= 0 && sectorDataByDate[today]) {
                        // 今天有数据，从今天往前显示7天
                        displayDates = last7Days.slice(Math.max(0, todayIndex - 6), todayIndex + 1).reverse()
                      } else {
                        // 今天没有数据，找到最近有数据的日期
                        let latestDateIndex = -1
                        for (let i = last7Days.length - 1; i >= 0; i--) {
                          if (sectorDataByDate[last7Days[i]]) {
                            latestDateIndex = i
                            break
                          }
                        }
                        
                        if (latestDateIndex >= 0) {
                          // 找到最近有数据的日期，前后各显示3天
                          const start = Math.max(0, latestDateIndex - 3)
                          const end = Math.min(last7Days.length - 1, latestDateIndex + 3)
                          displayDates = last7Days.slice(start, end + 1).reverse()
                        } else {
                          // 没有数据，显示最近7天
                          displayDates = last7Days.reverse()
                        }
                      }
                      
                      return (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {displayDates.map((date) => {
                            const count = getSectorLimitUpCount(selectedSector.name, selectedSector.code, date)
                            const isToday = date === today
                            const hasData = !!sectorDataByDate[date]
                            
                            return (
                              <div
                                key={date}
                                style={{
                                  padding: '8px 12px',
                                  background: isToday ? '#eff6ff' : hasData ? '#f9fafb' : '#f3f4f6',
                                  border: isToday ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                                  borderRadius: '8px',
                                  fontSize: '0.85rem',
                                  minWidth: '90px',
                                  textAlign: 'center'
                                }}
                              >
                                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px' }}>
                                  {formatDateDisplay(date)}
                                  {isToday && <span style={{ marginLeft: '4px', color: '#3b82f6', fontWeight: '600' }}>今天</span>}
                                </div>
                                <div style={{ fontSize: '1rem', fontWeight: '700', color: hasData && count > 0 ? '#dc2626' : '#9ca3af' }}>
                                  {hasData ? count : '-'}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                  </div>
                  
                  {/* 热门股票列表 */}
                  <div>
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
                            <td 
                              style={{ 
                                padding: '10px',
                                cursor: 'pointer'
                              }}
                              onClick={() => handleStockClick(stock)}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#eff6ff'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent'
                              }}
                            >
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
              </div>
              
              {/* 添加CSS动画 */}
              <style>{`
                @keyframes slideUp {
                  from {
                    transform: translateY(100%);
                  }
                  to {
                    transform: translateY(0);
                  }
                }
                @keyframes fadeIn {
                  from {
                    opacity: 0;
                  }
                  to {
                    opacity: 1;
                  }
                }
              `}</style>
            </>
          )}
        </>
      )}

      {/* 匹配度警告 */}
      {matchWarning && (
        <div style={{
          marginTop: '20px',
          padding: '12px 16px',
          background: '#fef3c7',
          border: '1px solid #fbbf24',
          borderRadius: '8px',
          fontSize: '0.85rem',
          color: '#92400e',
          textAlign: 'center'
        }}>
          {matchWarning}
        </div>
      )}

      {/* 数据来源说明 */}
      <div style={{
        marginTop: '20px',
        padding: '16px',
        background: '#f9fafb',
        borderRadius: '8px',
        fontSize: '0.85rem',
        color: '#6b7280',
        textAlign: 'center',
        lineHeight: '1.6'
      }}>
          <div style={{ marginBottom: '8px', fontWeight: '500' }}>
            数据来源：财联社
          </div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
            <div>📊 板块数据（排名、涨跌幅、历史数据）：财联社</div>
            <div>🏷️ 板块分类（行业/概念区分）：{caiLianSheTypeMapLoaded && caiLianSheTypeMap.size > 0 ? '财联社接口' : '关键词匹配'}</div>
            <div>🔥 热门股票：财联社</div>
          </div>
        <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#9ca3af' }}>
          更新时间：{new Date().toLocaleString('zh-CN')}
        </div>
      </div>
    </main>
  )
}

