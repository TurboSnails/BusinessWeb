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
  // 存储东方财富的概念板块列表（用于匹配）
  const [eastMoneyConceptList, setEastMoneyConceptList] = useState<Array<{code: string, name: string}>>([])

  // CORS代理配置
  const CORS_PROXY_MAIN = (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`
  const CORS_PROXY_BACKUP = (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
  const CORS_PROXY_THIRD = (url: string) => `https://proxy.cors.sh/${url}`
  const CORS_PROXIES = [CORS_PROXY_MAIN, CORS_PROXY_BACKUP, CORS_PROXY_THIRD]

  // 获取东方财富的概念板块列表
  const fetchEastMoneyConceptList = useCallback(async (): Promise<Array<{code: string, name: string}>> => {
    try {
      const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=1000&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=m:90+t:3`
      const proxyUrl = CORS_PROXY_MAIN(url)
      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data?.data?.diff && Array.isArray(data.data.diff)) {
          const conceptList = data.data.diff.map((item: any) => ({
            code: item.f12 || '',
            name: item.f14 || ''
          })).filter((item: {code: string, name: string}) => item.name && item.code)
          
          console.log(`✅ 获取到 ${conceptList.length} 个东方财富概念板块`)
          return conceptList
        }
      }
    } catch (err) {
      console.warn('获取东方财富概念板块列表失败:', err)
    }
    return []
  }, [])

  // 初始化时获取东方财富概念板块列表
  useEffect(() => {
    if (filterType === 'concept') {
      fetchEastMoneyConceptList().then(list => {
        setEastMoneyConceptList(list)
      })
    } else {
      // 切换到行业时清空概念列表
      setEastMoneyConceptList([])
    }
  }, [filterType, fetchEastMoneyConceptList])

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
          // 使用反向逻辑：先定义明确的行业板块，剩下的都算概念板块
          const filteredData = plateStockData.filter((plate: any) => {
            const name = String(plate.secu_name || plate.name || '').trim()
            
            if (filterType === 'industry') {
              // 行业板块：名称不包含"概念"、"题材"、"主题"
              return !name.includes('概念') && !name.includes('题材') && !name.includes('主题')
            } else {
              // 概念板块：包含"概念"、"题材"、"主题"的，或者不在明确行业列表中的
              // 先检查是否明确包含概念标识
              if (name.includes('概念') || name.includes('题材') || name.includes('主题')) {
                return true
              }
              
              // 如果已获取东方财富概念板块列表，优先使用列表匹配
              if (eastMoneyConceptList.length > 0) {
                // 尝试匹配：精确匹配或包含匹配（双向）
                const matched = eastMoneyConceptList.some(concept => {
                  const conceptName = concept.name.trim()
                  // 精确匹配
                  if (conceptName === name) return true
                  // 包含匹配（双向）
                  if (conceptName.includes(name) || name.includes(conceptName)) return true
                  // 去掉"概念"后缀后匹配
                  const conceptNameWithoutSuffix = conceptName.replace(/概念$/, '').trim()
                  const nameWithoutSuffix = name.replace(/概念$/, '').trim()
                  if (conceptNameWithoutSuffix && nameWithoutSuffix && 
                      (conceptNameWithoutSuffix === nameWithoutSuffix || 
                       conceptNameWithoutSuffix.includes(nameWithoutSuffix) || 
                       nameWithoutSuffix.includes(conceptNameWithoutSuffix))) {
                    return true
                  }
                  return false
                })
                if (matched) return true
              }
              
              // 明确的概念板块关键词（从东方财富APP截图中提取）
              const conceptKeywords = [
                // AI相关
                'AI', '人工智能', 'ChatGPT', 'Sora', 'Kimi', 'AIGC', '多模态', '文生视频', '文生图', '大模型',
                'AI制药', 'AI语料', 'AI芯片', '智谱AI',
                // 芯片相关
                '存储芯片', '汽车芯片', '第三代半导体', '第四代半导体', '芯片产业链',
                // 机器人相关
                '机器人', '人形机器人', '工业机器人', '服务机器人', '机器人执行器', '机器人扶',
                // 智能相关
                '智能驾驶', '自动驾驶', '无人驾驶', '车联网', '智能汽车',
                // 新能源相关
                '光伏', '风电', '储能', '氢能', '锂电池', '钠电池', '固态电池', '钙钛矿', 'HJT', 'TOPCon', 'BC电池',
                // 数字相关
                '数字货币', '数字人民币', '区块链', '元宇宙', 'Web3', 'NFT', '数字货',
                // 数据相关
                '数据要素', '数据确权', '数据安全', '数据交易', '数据资产',
                // 信创相关
                '信创', '国产软件', '国产芯片', '国产替代', '自主可控',
                // 航天相关
                '卫星', '卫星互联网', '卫星导航', '空间站', '商业航天',
                // 医疗生物相关
                '人脑工程', 'CAR-T', '细胞疗法', '重组蛋白', '基因测序',
                // 其他新兴概念
                '同步磁阻电机', '减速器', '减速', '3D玻璃', '噪声防治', '噪声防',
                'UWB', '碳纤', 'PEEK', '材米', '华为', '跨境', '支付',
                '飞行汽车', '低空经济', 'eVTOL',
                '量子', '量子通信', '量子计算',
                '6G', 'MR', 'VR', 'AR', 'XR',
                '超导', '室温超导', '可控核聚变',
                '减肥药', '创新药', 'CRO', 'CDMO',
                '辅助生殖', '养老', '医美', '医疗美容',
                'PLC', '产业链', '快手'
              ]
              
              // 检查是否是概念板块关键词
              if (conceptKeywords.some(keyword => name.includes(keyword))) {
                return true
              }
              
              // 明确的行业板块关键词（如果匹配这些，则不是概念板块）
              const industryKeywords = [
                '银行', '保险', '证券', '房地产', '建筑', '建材', '水泥', '钢铁', '有色', '煤炭', '石油', '化工',
                '电力', '公用事业', '交通运输', '物流', '港口', '航运', '航空', '机场', '铁路', '公路',
                '汽车整车', '汽车零部件', '家电', '食品', '饮料', '酒', '餐饮', '旅游', '酒店', '零售', '商业',
                '纺织', '服装', '轻工', '造纸', '印刷', '包装', '家具', '装饰', '装修', '工程', '机械', '设备',
                '医药', '医疗', '生物', '农业', '畜牧', '渔业', '林业', '种植', '化肥', '农药', '种子',
                '通信', '电子', '半导体', '计算机', '软件', '互联网', '传媒', '文化', '教育', '体育', '娱乐'
              ]
              
              // 如果不在明确的行业列表中，就认为是概念板块
              const isIndustry = industryKeywords.some(keyword => name.includes(keyword))
              return !isIndustry
            }
          })
          
          console.log(`📊 ${filterType === 'industry' ? '行业' : '概念'}板块过滤: ${filteredData.length} 个 (总共 ${plateStockData.length} 个)`)
          
          // 解析板块数据
          const sectors: SectorData[] = filteredData
            .map((plate: any) => {
              // 财联社API可能返回的字段：secu_code, code, plate_code等
              // 打印第一个板块的完整数据用于调试
              if (filteredData.indexOf(plate) === 0) {
                console.log('📊 财联社板块数据结构示例:', {
                  secu_name: plate.secu_name,
                  secu_code: plate.secu_code,
                  code: plate.code,
                  plate_code: plate.plate_code,
                  allKeys: Object.keys(plate)
                })
              }
              
              return {
                name: plate.secu_name || '',
                code: plate.secu_code || plate.code || plate.plate_code || '', // 板块代码
                changePercent: parseFloat(plate.change || 0) * 100, // 转换为百分比
                rank: 0, // 稍后排序后设置
                date: date
              }
            })
            .filter((s: SectorData) => s.name) // 过滤掉空名称
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
          
          return sectors
        }
      } catch (err) {
        console.warn(`代理 ${proxy} 失败:`, err)
        continue
      }
    }
    
    return []
  }, [topN, filterType, eastMoneyConceptList])

  // 获取所有日期的数据
  useEffect(() => {
    if (selectedDates.length === 0) return

    const fetchAllDates = async () => {
      console.log(`🔄 开始获取所有日期数据，类型: ${filterType}`)
      setLoading(true)
      setError(null)
      // 清空旧数据，避免显示混合数据
      setSectorDataByDate({})
      
      try {
        const dataPromises = selectedDates.map(date => fetchSectorData(date))
        const results = await Promise.allSettled(dataPromises)
        
        const dataByDate: Record<string, SectorData[]> = {}
        
        results.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value && result.value.length > 0) {
            // 只保留有数据的日期
            dataByDate[selectedDates[index]] = result.value
            console.log(`✅ ${selectedDates[index]} 获取到 ${result.value.length} 个${filterType === 'industry' ? '行业' : '概念'}板块`)
          } else {
            console.warn(`获取 ${selectedDates[index]} 的数据失败或无数据:`, result.status === 'fulfilled' ? '空数据' : result.reason)
            // 不添加到 dataByDate，这样渲染时就不会显示该列
          }
        })
        
        console.log(`📊 所有日期数据获取完成，共 ${Object.keys(dataByDate).length} 个日期有数据`)
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
  const fetchHotStocks = useCallback(async (sectorCode: string, sectorName: string): Promise<HotStock[]> => {
    console.log(`🔍 获取热门股票，板块代码: ${sectorCode}, 板块名称: ${sectorName}`)
    
    // 板块代码映射表缓存（财联社代码 -> 东方财富代码）
    const CACHE_KEY = 'sector_code_mapping'
    const getCachedMapping = (): Record<string, string> => {
      try {
        const cached = localStorage.getItem(CACHE_KEY)
        return cached ? JSON.parse(cached) : {}
      } catch {
        return {}
      }
    }
    
    const saveMapping = (clsCode: string, emCode: string) => {
      try {
        const mapping = getCachedMapping()
        mapping[clsCode] = emCode
        localStorage.setItem(CACHE_KEY, JSON.stringify(mapping))
        console.log(`💾 保存板块代码映射: ${clsCode} -> ${emCode}`)
      } catch {
        // 忽略存储错误
      }
    }
    
    // 如果财联社返回的代码为空或格式不对，尝试通过名称查找东方财富的板块代码
    let eastMoneyCode = sectorCode
    
    // 先检查缓存映射表
    if (sectorCode && !sectorCode.startsWith('BK') && !sectorCode.startsWith('GN')) {
      const mapping = getCachedMapping()
      if (mapping[sectorCode]) {
        eastMoneyCode = mapping[sectorCode]
        console.log(`✅ 从缓存获取板块代码映射: ${sectorCode} -> ${eastMoneyCode}`)
      }
    }
    
    // 如果代码为空或不是BK/GN开头，尝试通过名称查找
    if (!eastMoneyCode || (!eastMoneyCode.startsWith('BK') && !eastMoneyCode.startsWith('GN'))) {
      console.warn(`⚠️ 板块代码格式可能不对: ${eastMoneyCode}，尝试通过名称查找`)
      
      // 同义词映射表（财联社名称 -> 可能的东方财富名称）
      const synonymMap: Record<string, string[]> = {
        '智能驾驶': ['自动驾驶', '无人驾驶', '车联网', '智能汽车', '汽车电子'],
        '锂电池': ['电池', '动力电池', '锂电'],
        '新能源': ['新能源车', '新能源汽车', '新能源'],
        '人工智能': ['AI', '人工智能', '智能', '机器视觉'],
        '芯片': ['半导体', '芯片', '集成电路', 'AI芯片', '存储芯片', '汽车芯片'],
        '芯片产业链': ['芯片', '半导体', '集成电路', 'AI芯片', '存储芯片', '汽车芯片', '中芯概念'],
        '5G': ['5G', '通信', '通信设备'],
        '光伏': ['光伏', '太阳能', '光伏设备'],
        '风电': ['风电', '风电设备', '风力发电'],
        '储能': ['储能', '储能设备', '电池'],
        '氢能源': ['氢能', '氢能源', '燃料电池'],
        '数字货币': ['数字货币', '数字人民币', '区块链', '金融科技', '移动支付', '支付'],
        '石英': ['石英', '石英石', '石英材料', '非金属材料', '玻璃玻纤']
      }
      
      // 同时搜索行业和概念板块列表（因为财联社可能返回混合数据）
      const searchTypes = [
        { type: 'industry', fs: 'm:90+t:2' },
        { type: 'concept', fs: 'm:90+t:3' }
      ]
      
      let allConceptNames: string[] = []
      
      for (const { type, fs } of searchTypes) {
        try {
          const searchUrl = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=500&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=${fs}`
          const searchProxyUrl = CORS_PROXY_MAIN(searchUrl)
          const searchResponse = await fetch(searchProxyUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          })
          
          if (searchResponse.ok) {
            const searchData = await searchResponse.json()
            if (searchData?.data?.diff && Array.isArray(searchData.data.diff)) {
              const sectorList = searchData.data.diff
              
              // 保存概念板块名称用于调试
              if (type === 'concept') {
                allConceptNames = sectorList.map((item: any) => item.f14)
              }
              
              // 通过名称匹配找到对应的板块代码
              // 1. 优先精确匹配
              let matched = sectorList.find((item: any) => item.f14 === sectorName)
              
              // 2. 如果精确匹配失败，尝试包含匹配（双向）
              if (!matched) {
                matched = sectorList.find((item: any) => 
                  item.f14?.includes(sectorName) || sectorName.includes(item.f14)
                )
              }
              
              // 3. 尝试同义词匹配
              if (!matched && synonymMap[sectorName]) {
                for (const synonym of synonymMap[sectorName]) {
                  matched = sectorList.find((item: any) => 
                    item.f14?.includes(synonym) || synonym.includes(item.f14)
                  )
                  if (matched) {
                    console.log(`🔍 通过同义词匹配: "${sectorName}" -> "${synonym}" -> "${matched.f14}"`)
                    break
                  }
                }
              }
              
              // 4. 尝试去掉"概念"、"行业"、"产业链"等后缀后匹配
              if (!matched) {
                const cleanSectorName = sectorName.replace(/概念|行业|板块|产业链|链|产业/g, '').trim()
                matched = sectorList.find((item: any) => {
                  const cleanItemName = item.f14?.replace(/概念|行业|板块|产业链|链|产业/g, '').trim()
                  return cleanItemName === cleanSectorName || 
                         cleanItemName?.includes(cleanSectorName) || 
                         cleanSectorName.includes(cleanItemName)
                })
                if (matched) {
                  console.log(`🔍 通过去除后缀匹配: "${sectorName}" -> "${cleanSectorName}" -> "${matched.f14}"`)
                }
              }
              
              // 5. 尝试提取核心关键词匹配
              if (!matched) {
                const stopWords = ['概念', '行业', '板块', '产业链', '链', '产业']
                const keywords: string[] = []
                
                // 先提取核心词（去掉后缀后的完整词）
                let coreName = sectorName
                for (const suffix of ['产业链', '链', '产业', '概念', '行业', '板块']) {
                  if (coreName.endsWith(suffix)) {
                    coreName = coreName.slice(0, -suffix.length).trim()
                    break
                  }
                }
                if (coreName.length >= 2 && !stopWords.includes(coreName)) {
                  keywords.push(coreName)
                }
                
                // 提取完整词（按分隔符拆分）
                const words = sectorName.split(/[智能新数字AI人工产业链]/).filter(w => w.length >= 2)
                words.forEach(word => {
                  if (word.length >= 2 && !stopWords.includes(word) && !keywords.includes(word)) {
                    keywords.push(word)
                  }
                })
                
                // 提取2-4字符的子串（优先长词）
                for (let len = 4; len >= 2; len--) {
                  for (let i = 0; i <= sectorName.length - len; i++) {
                    const keyword = sectorName.substr(i, len)
                    if (keyword.length >= 2 && !stopWords.includes(keyword) && !keywords.includes(keyword)) {
                      keywords.push(keyword)
                    }
                  }
                }
                
                // 按长度倒序，优先匹配长关键词
                keywords.sort((a, b) => b.length - a.length)
                
                // 对于短词（2-3个字符），尝试更严格的匹配（必须完全包含）
                // 对于长词（4+字符），尝试更宽松的匹配（包含即可）
                for (const keyword of keywords.slice(0, 15)) {
                  if (keyword.length <= 3) {
                    // 短词：尝试精确匹配或作为完整词的一部分
                    matched = sectorList.find((item: any) => 
                      item.f14 === keyword || 
                      item.f14?.startsWith(keyword) || 
                      item.f14?.endsWith(keyword) ||
                      item.f14?.includes(keyword)
                    )
                  } else {
                    // 长词：包含匹配即可
                    matched = sectorList.find((item: any) => 
                      item.f14?.includes(keyword)
                    )
                  }
                  if (matched) {
                    console.log(`🔍 通过关键词匹配: "${sectorName}" -> "${keyword}" -> "${matched.f14}"`)
                    break
                  }
                }
              }
              
              if (matched && matched.f12) {
                eastMoneyCode = matched.f12
                console.log(`✅ 在${type === 'industry' ? '行业' : '概念'}板块中通过名称匹配找到代码: ${eastMoneyCode} (${matched.f14})`)
                // 保存映射关系到缓存
                if (sectorCode && sectorCode !== eastMoneyCode) {
                  saveMapping(sectorCode, eastMoneyCode)
                }
                break // 找到了就退出循环
              }
            }
          }
        } catch (err) {
          console.warn(`通过${type === 'industry' ? '行业' : '概念'}板块名称查找失败:`, err)
        }
      }
      
      // 如果还是没找到，打印调试信息
      if (!eastMoneyCode || (!eastMoneyCode.startsWith('BK') && !eastMoneyCode.startsWith('GN'))) {
        console.warn(`⚠️ 在行业和概念板块中都未找到匹配的板块: ${sectorName}`)
        
        // 动态提取关键词用于调试
        const debugKeywords: string[] = []
        // 提取板块名称中的关键词（去除常见修饰词）
        const cleanName = sectorName.replace(/概念|行业|板块/g, '')
        // 提取2-3个字符的关键词
        for (let i = 0; i < cleanName.length - 1; i++) {
          for (let len = 2; len <= Math.min(3, cleanName.length - i); len++) {
            const keyword = cleanName.substr(i, len)
            if (keyword.length >= 2 && !['概念', '行业', '板块'].includes(keyword)) {
              debugKeywords.push(keyword)
            }
          }
        }
        
        // 打印包含相关关键词的概念板块，方便调试
        if (debugKeywords.length > 0 && allConceptNames.length > 0) {
          const relatedConcepts = allConceptNames.filter(name => 
            debugKeywords.some(keyword => name.includes(keyword))
          )
          if (relatedConcepts.length > 0) {
            console.log(`💡 相关概念板块（包含关键词"${debugKeywords.join('"、"')}"）:`, relatedConcepts.slice(0, 20))
          } else {
            // 如果没找到，打印所有概念板块名称的前50个，方便查找
            console.log(`💡 所有概念板块（前50个）:`, allConceptNames.slice(0, 50))
          }
        }
      }
    }
    
    // 如果还是没有找到代码，返回空数组
    if (!eastMoneyCode || (!eastMoneyCode.startsWith('BK') && !eastMoneyCode.startsWith('GN'))) {
      console.error(`❌ 无法获取有效的板块代码: ${eastMoneyCode}`)
      return []
    }
    
    // 东方财富板块成分股API
    // fs=b:板块代码，例如 b:BK0478
    const apiUrl = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=20&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=b:${eastMoneyCode}`
    
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
          
          console.log(`✅ 获取到 ${diff.length} 只热门股票`)
          
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
  }, [filterType])

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

